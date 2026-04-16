'use strict';

// Phase 48.3 — regression tests for the 48.2 request-chain completion fixes.
//
// Verifies five fixes:
//   1. getSig() calls _getShowConfig directly (never _getSigLegacy).
//   2. tcaptcha-slide.js fetch is present in the request chain.
//   3. vm-slide fetch includes proper browser headers.
//   4. slide-jy.js fetch is present in the request chain.
//   5. fireBeacon uses correct browser-like headers.
//
// Harness follows the pattern from test-scraper-caplog-beacon.js and
// test-scraper-vm-slide-fetch.js — pre-require stubs, https.request
// monkey-patch, fake CaptchaClient via Scraper subclass.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { EventEmitter } = require('node:events');

// ---------------------------------------------------------------------------
// Pre-require module patches — must run BEFORE scraper.js is required.
// ---------------------------------------------------------------------------

const slideSolver = require('../tools/captcha-solver/slide-solver');
slideSolver.solveSlider = async function stubSolveSlider() {
  return 478;
};

const collectGenerator = require('../tools/scraper/collect-generator');
collectGenerator.generateCollect = function stubGenerateCollect() {
  return 'stub_collect_value';
};

const forPost = require('../tools/vdata-generator/for-post');
forPost.buildVDataForPost = function stubBuildVDataForPost() {
  return 'A'.repeat(150) + 'YY';
};

const vdataHarness = require('../tools/scraper/vdata-harness');
vdataHarness.generateVData = function stubGenerateVData() {
  return {
    vData: 'A'.repeat(150) + 'YY',
    serializedBody: 'stub=body',
  };
};

// ---------------------------------------------------------------------------
// Now safe to require modules under test.
// ---------------------------------------------------------------------------

const Scraper = require('../tools/scraper/scraper');
const { CaptchaClient } = require('../tools/captcha-solver/captcha-client');
const { fireBeacon } = require('../tools/scraper/caplog-beacon');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TDC_SOURCE = fs.readFileSync(path.join(PROJECT_ROOT, 'targets', 'tdc.js'), 'utf8');
const BG_BUFFER = fs.readFileSync(path.join(__dirname, 'asset', 'bg.png'));
const SLICE_BUFFER = fs.readFileSync(path.join(__dirname, 'asset', 'slide.png'));

// Show page HTML with <script> tags for tcaptcha-slide and slide-jy (as a
// real show page would have). The vm-slide tag is also present for the
// existing _getVmSlideSource Strategy 2.
const SHOW_HTML =
  '<html><body>' +
  '<script src="https://captcha.gtimg.com/1/tcaptcha-slide.29a33140.js"></script>' +
  '<script src="/vm-slide.e201876f.enc.js"></script>' +
  '<script src="https://captcha.gtimg.com/1/slide-jy.js"></script>' +
  '</body></html>';

const VM_SLIDE_REGEX = /\/vm-slide(\.[^/]+)?\.enc\.js/;
const TCAPTCHA_SLIDE_REGEX = /tcaptcha-slide/;
const SLIDE_JY_REGEX = /slide-jy/;
const CAPLOG_REGEX = /\/caplog\?/;

// ---------------------------------------------------------------------------
// Fake CaptchaClient
// ---------------------------------------------------------------------------

function makeFakeClient() {
  const fakeSig = {
    bgUrl: 'https://t.captcha.qq.com/hycdn?index=1',
    sliceUrl: 'https://t.captcha.qq.com/hycdn?index=2',
    vsig: 'v',
    websig: 'w',
    nonce: 'nonce_123',
    spt: '30',
    subcapclass: 'sc',
    capclass: 'cc',
    sess: 'sess_abcdef',
    sid: 'sid_ghi',
    showUrl: 'https://t.captcha.qq.com/cap_union_new_show?aid=2046626881',
    showSubsid: '10',
    _html: SHOW_HTML,
    _raw: {
      dcFileName: '/tdc.js',
    },
  };

  return {
    _showSubsid: '10',
    async prehandle() {
      return {
        sess: 'sess_abcdef',
        sid: 'sid_ghi',
        capclass: 'cc',
        subcapclass: 'sc',
        state: 0,
        src_1: '',
        src_2: '',
        src_3: '',
        extra: '',
        _raw: {},
      };
    },
    async getSig() {
      return fakeSig;
    },
    async downloadImages() {
      return { bgBuffer: BG_BUFFER, sliceBuffer: SLICE_BUFFER };
    },
    async downloadTdc() {
      return TDC_SOURCE;
    },
    async verify() {
      return { errorCode: 0, ticket: 'ticket_stub', randstr: 'randstr_stub' };
    },
    resetCookies() {
      // no-op
    },
  };
}

// ---------------------------------------------------------------------------
// https.request monkey-patch — records URLs AND headers for each request.
// ---------------------------------------------------------------------------

function installHttpsRecorder() {
  const originalRequest = https.request;
  const recordedRequests = [];

  https.request = function patchedRequest(options, callback) {
    let hostname = '';
    let pathPart = '';
    let method = 'GET';
    let headers = {};
    if (typeof options === 'string') {
      const u = new URL(options);
      hostname = u.hostname;
      pathPart = u.pathname + u.search;
    } else if (options && typeof options === 'object') {
      hostname = options.hostname || options.host || '';
      pathPart = options.path || '/';
      method = options.method || 'GET';
      headers = options.headers || {};
    }
    const fullUrl = 'https://' + hostname + pathPart;
    recordedRequests.push({ method, url: fullUrl, headers });

    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    res.pipe = function passthrough(dest) { return dest; };

    const req = new EventEmitter();
    req.write = function noopWrite() { /* no-op */ };
    req.end = function noopEnd() {
      setImmediate(() => {
        if (typeof callback === 'function') {
          callback(res);
        }
        setImmediate(() => {
          res.emit('data', Buffer.from('// stub response body\n' + 'x'.repeat(200), 'utf8'));
          res.emit('end');
        });
      });
    };
    req.destroy = function noopDestroy() { /* no-op */ };

    return req;
  };

  return {
    recordedRequests,
    restore() {
      https.request = originalRequest;
    },
  };
}

// ---------------------------------------------------------------------------
// Driver — runs solveCaptcha with full recording
// ---------------------------------------------------------------------------

async function runScraperWithRecorder(opts) {
  const o = opts || {};
  const recorder = installHttpsRecorder();

  class FakeClientScraper extends Scraper {
    _createClient() {
      return makeFakeClient();
    }
  }

  const scraper = new FakeClientScraper({
    legacyVdata: o.legacyVdata || false,
    skipCaplog: o.skipCaplog || false,
    maxRetries: 1,
    verbose: false,
  });
  await scraper.init();

  let caught = null;
  try {
    await scraper.solveCaptcha();
  } catch (err) {
    caught = err;
  } finally {
    recorder.restore();
  }

  return { recordedRequests: recorder.recordedRequests, error: caught };
}

// ---------------------------------------------------------------------------
// Fix 1: getSig() goes directly to _getShowConfig
// ---------------------------------------------------------------------------

test('Fix 1: getSig() calls _getShowConfig, never _getSigLegacy', async () => {
  const client = new CaptchaClient({ aid: '123' });

  let legacyCalled = false;
  let showConfigCalled = false;

  client._getSigLegacy = async function() {
    legacyCalled = true;
    return { error: 'should not be called' };
  };

  client._getShowConfig = async function() {
    showConfigCalled = true;
    return {
      bgUrl: 'https://example.com/bg.png',
      sliceUrl: 'https://example.com/slice.png',
      vsig: 'v', websig: 'w', nonce: 'n',
      spt: '30', subcapclass: 'sc', capclass: 'cc',
      sess: 's', sid: 'sid',
    };
  };

  const result = await client.getSig({ sess: 'test', sid: 'test' });

  assert.equal(legacyCalled, false, '_getSigLegacy must NOT be called by getSig()');
  assert.equal(showConfigCalled, true, '_getShowConfig must be called by getSig()');
  assert.equal(result.vsig, 'v', 'getSig must return the _getShowConfig result');
});

// ---------------------------------------------------------------------------
// Fix 2: tcaptcha-slide.js fetch is present in the request chain
// ---------------------------------------------------------------------------

test('Fix 2: tcaptcha-slide.js is fetched during solveCaptcha (default path)', async () => {
  const { recordedRequests } = await runScraperWithRecorder({ legacyVdata: false });
  const urls = recordedRequests.map((r) => r.url);

  const tcaptchaSlideIdx = urls.findIndex((u) => TCAPTCHA_SLIDE_REGEX.test(u));
  assert.ok(tcaptchaSlideIdx >= 0,
    'expected a request to tcaptcha-slide URL; recorded: ' +
      JSON.stringify(urls));

  // tcaptcha-slide must appear AFTER tdc (step d) and BEFORE vm-slide (step k)
  const vmSlideIdx = urls.findIndex((u) => VM_SLIDE_REGEX.test(u));
  assert.ok(vmSlideIdx >= 0, 'vm-slide request must be present');
  assert.ok(tcaptchaSlideIdx < vmSlideIdx,
    'tcaptcha-slide.js must be fetched BEFORE vm-slide.enc.js; ' +
      'tcaptchaSlide@' + tcaptchaSlideIdx + ' vmSlide@' + vmSlideIdx);
});

test('Fix 2: tcaptcha-slide.js is fetched during solveCaptcha (legacy path)', async () => {
  const { recordedRequests } = await runScraperWithRecorder({ legacyVdata: true });
  const urls = recordedRequests.map((r) => r.url);
  const match = urls.find((u) => TCAPTCHA_SLIDE_REGEX.test(u));
  assert.ok(match, 'tcaptcha-slide.js request must be present on legacy path');
});

// ---------------------------------------------------------------------------
// Fix 3: vm-slide fetch includes proper browser headers
// ---------------------------------------------------------------------------

test('Fix 3: vm-slide fetch includes Sec-Fetch-Dest, Sec-Fetch-Mode, User-Agent, and Referer', async () => {
  const { recordedRequests } = await runScraperWithRecorder({ legacyVdata: false });
  const vmSlideReq = recordedRequests.find((r) => VM_SLIDE_REGEX.test(r.url));
  assert.ok(vmSlideReq, 'vm-slide request must be present');

  const h = vmSlideReq.headers;
  assert.equal(h['Sec-Fetch-Dest'], 'script',
    'vm-slide must have Sec-Fetch-Dest: script');
  assert.equal(h['Sec-Fetch-Mode'], 'no-cors',
    'vm-slide must have Sec-Fetch-Mode: no-cors');
  assert.ok(h['User-Agent'],
    'vm-slide must include User-Agent header');
  assert.ok(h['Referer'],
    'vm-slide must include Referer header');
});

// ---------------------------------------------------------------------------
// Fix 4: slide-jy.js fetch is present in the request chain
// ---------------------------------------------------------------------------

test('Fix 4: slide-jy.js is fetched during solveCaptcha (default path)', async () => {
  const { recordedRequests } = await runScraperWithRecorder({ legacyVdata: false });
  const urls = recordedRequests.map((r) => r.url);

  const slideJyIdx = urls.findIndex((u) => SLIDE_JY_REGEX.test(u));
  assert.ok(slideJyIdx >= 0,
    'expected a request to slide-jy URL; recorded: ' +
      JSON.stringify(urls));

  // slide-jy must appear AFTER vm-slide and BEFORE caplog
  const vmSlideIdx = urls.findIndex((u) => VM_SLIDE_REGEX.test(u));
  const caplogIdx = urls.findIndex((u) => CAPLOG_REGEX.test(u));

  assert.ok(vmSlideIdx >= 0, 'vm-slide request must be present');
  assert.ok(slideJyIdx > vmSlideIdx,
    'slide-jy.js must be fetched AFTER vm-slide.enc.js; ' +
      'vmSlide@' + vmSlideIdx + ' slideJy@' + slideJyIdx);

  if (caplogIdx >= 0) {
    assert.ok(slideJyIdx < caplogIdx,
      'slide-jy.js must be fetched BEFORE caplog beacon; ' +
        'slideJy@' + slideJyIdx + ' caplog@' + caplogIdx);
  }
});

test('Fix 4: slide-jy.js is fetched during solveCaptcha (legacy path)', async () => {
  const { recordedRequests } = await runScraperWithRecorder({ legacyVdata: true });
  const urls = recordedRequests.map((r) => r.url);
  const match = urls.find((u) => SLIDE_JY_REGEX.test(u));
  assert.ok(match, 'slide-jy.js request must be present on legacy path');
});

// ---------------------------------------------------------------------------
// Fix 5: fireBeacon uses correct browser-like headers
// ---------------------------------------------------------------------------

test('Fix 5: fireBeacon sends correct headers (Accept, Referer, Sec-Fetch-Dest, Sec-Fetch-Mode, sec-ch-ua, User-Agent)', async () => {
  const recorder = installHttpsRecorder();

  try {
    await fireBeacon('https://t.captcha.qq.com/caplog?appid=20128&1=0', {
      userAgent: 'test-ua-string',
      referer: 'https://example.com/show',
    });
  } finally {
    recorder.restore();
  }

  assert.ok(recorder.recordedRequests.length >= 1,
    'fireBeacon must issue at least one request');

  const req = recorder.recordedRequests[0];
  const h = req.headers;

  assert.ok(h['Accept'] && h['Accept'].includes('image/avif'),
    'fireBeacon must send Accept: image/avif,...; got: ' + h['Accept']);
  assert.equal(h['Referer'], 'https://example.com/show',
    'fireBeacon must use the provided referer');
  assert.equal(h['Sec-Fetch-Dest'], 'image',
    'fireBeacon must send Sec-Fetch-Dest: image');
  assert.equal(h['Sec-Fetch-Mode'], 'no-cors',
    'fireBeacon must send Sec-Fetch-Mode: no-cors');
  assert.ok(h['sec-ch-ua'] && h['sec-ch-ua'].includes('Chromium'),
    'fireBeacon must include sec-ch-ua header; got: ' + h['sec-ch-ua']);
  assert.equal(h['User-Agent'], 'test-ua-string',
    'fireBeacon must forward the provided userAgent as User-Agent header');
});

test('Fix 5: fireBeacon uses default referer when none provided', async () => {
  const recorder = installHttpsRecorder();

  try {
    await fireBeacon('https://t.captcha.qq.com/caplog?appid=20128&1=0', {
      userAgent: 'ua',
    });
  } finally {
    recorder.restore();
  }

  assert.ok(recorder.recordedRequests.length >= 1);
  const h = recorder.recordedRequests[0].headers;
  assert.equal(h['Referer'], 'https://t.captcha.qq.com/',
    'fireBeacon must default to t.captcha.qq.com referer');
});
