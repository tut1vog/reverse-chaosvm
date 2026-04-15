'use strict';

// Phase 46.2 — regression tests for the 46.1 fix that removed the
// `if (this.legacyVdata)` gate around `_getVmSlideSource(sig)` in
// `tools/scraper/scraper.js` step-(k). Real browsers always issue a GET for
// `/vm-slide(.<hash>)?.enc.js` (HAR entry 6); skipping that request on the
// default path is a distinctive bot tell and was a likely contributor to the
// elevated errorCode 12 rate measured in Phase 45.6.
//
// These tests lock the invariant down at the network layer: one
// `Scraper.solveCaptcha()` invocation must issue at least one HTTPS GET whose
// URL matches /vm-slide(\.[^/]+)?\.enc\.js, regardless of the `legacyVdata`
// flag.
//
// Strategy:
//   - Patch the modules scraper.js destructures at load time
//     (slide-solver, collect-generator, vdata-generator/for-post,
//      vdata-harness) with lightweight stubs so the heavy collect/vData
//     pipelines don't run. scraper.js must NOT have been required yet when
//     these patches happen — we require it after.
//   - Monkey-patch `https.request` to record outgoing URLs and return a
//     canned 200/empty body for the one vm-slide fetch the scraper issues.
//   - Subclass Scraper and override `_createClient()` so steps (a)..(d)
//     (prehandle / getSig / downloadImages / downloadTdc) are served from
//     an in-memory fake client — no real network for any of those. The sig
//     returned by the fake client carries `_html` containing a
//     `vm-slide.<hash>.enc.js` reference so `_getVmSlideSource` Strategy 2
//     (parseVmSlideUrl) selects the test URL.
//   - solveCaptcha's step-(m) and step-(n) (vData build + verify) may throw
//     because the fakes don't fully satisfy them; the tests wrap
//     solveCaptcha in try/catch and assert purely on the recorded URL log.
//     Step (k) runs before (m)/(n), so the vm-slide GET is observable even
//     when (m) or (n) errors out.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { EventEmitter } = require('node:events');

// ---------------------------------------------------------------------------
// Pre-require module patches — must run BEFORE scraper.js is required.
// scraper.js destructures these at load time; patching after its top-level
// `require(...)` lines have run would be a no-op.
// ---------------------------------------------------------------------------

const slideSolver = require('../tools/captcha-solver/slide-solver');
slideSolver.solveSlider = async function stubSolveSlider() {
  return 478;
};

const collectGenerator = require('../tools/scraper/collect-generator');
collectGenerator.generateCollect = function stubGenerateCollect() {
  return 'stub_collect_value';
};
// Keep generateBehavioralEvents and buildSlideSd intact — they are pure
// helpers with no network dependency and feed into the collect stub input.

const forPost = require('../tools/vdata-generator/for-post');
forPost.buildVDataForPost = function stubBuildVDataForPost() {
  // 152-char / YY-padded stub shape; the assertion in this test file is on
  // recorded URLs, not on vData correctness.
  return 'A'.repeat(150) + 'YY';
};

const vdataHarness = require('../tools/scraper/vdata-harness');
vdataHarness.generateVData = function stubGenerateVData(postFields) {
  return {
    vData: 'A'.repeat(150) + 'YY',
    serializedBody: 'stub=body',
  };
};
// parseVmSlideUrl must remain intact — scraper.js uses it to resolve the
// vm-slide URL from sig._html in _getVmSlideSource Strategy 2.

// ---------------------------------------------------------------------------
// Now safe to require the modules under test.
// ---------------------------------------------------------------------------

const Scraper = require('../tools/scraper/scraper');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TDC_SOURCE = fs.readFileSync(path.join(PROJECT_ROOT, 'targets', 'tdc.js'), 'utf8');
const BG_BUFFER = fs.readFileSync(path.join(__dirname, 'asset', 'bg.png'));
const SLICE_BUFFER = fs.readFileSync(path.join(__dirname, 'asset', 'slide.png'));

const VM_SLIDE_REGEX = /\/vm-slide(\.[^/]+)?\.enc\.js/;

// ---------------------------------------------------------------------------
// Fake CaptchaClient — implements only the methods solveCaptcha calls and
// records nothing itself. All four methods resolve synchronously with static
// data derived from targets/tdc.js + tests/asset images. No HTTPS.
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
    // _html drives _getVmSlideSource Strategy 2: parseVmSlideUrl finds the
    // vm-slide URL via a regex on src="..." and returns the path.
    _html: '<html><body><script src="/vm-slide.e201876f.enc.js"></script></body></html>',
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
    async getSig(_session) {
      return fakeSig;
    },
    async downloadImages(_sig) {
      return { bgBuffer: BG_BUFFER, sliceBuffer: SLICE_BUFFER };
    },
    async downloadTdc(_sig) {
      return TDC_SOURCE;
    },
    async verify(_params) {
      return { errorCode: 0, ticket: 'ticket_stub', randstr: 'randstr_stub' };
    },
    resetCookies() {
      // no-op
    },
  };
}

// ---------------------------------------------------------------------------
// https.request monkey-patch — records outgoing URLs and returns a minimal
// 200/empty response. Keyed by hostname + path, so we can distinguish
// vm-slide fetches from anything else that sneaks through.
// ---------------------------------------------------------------------------

function installHttpsRecorder() {
  const originalRequest = https.request;
  const recordedUrls = [];

  https.request = function patchedRequest(options, callback) {
    // node:https supports either (urlString, opts, cb), (urlObject, opts, cb),
    // or (opts, cb) — scraper.js's httpRequest uses the third form with
    // { method, hostname, port, path, headers, timeout }.
    let hostname = '';
    let pathPart = '';
    let method = 'GET';
    if (typeof options === 'string') {
      const u = new URL(options);
      hostname = u.hostname;
      pathPart = u.pathname + u.search;
    } else if (options && typeof options === 'object') {
      hostname = options.hostname || options.host || '';
      pathPart = options.path || '/';
      method = options.method || 'GET';
    }
    const fullUrl = 'https://' + hostname + pathPart;
    recordedUrls.push({ method: method, url: fullUrl });

    // Build a minimal IncomingMessage-like stream that returns a short empty
    // body. 200 OK, no encoding, immediate end. This is enough for the
    // scraper's _getVmSlideSource to see a successful response and return
    // the body — vm-slide source content doesn't matter on the default path.
    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    res.pipe = function passthrough(dest) { return dest; };

    const req = new EventEmitter();
    req.write = function noopWrite() { /* no-op */ };
    req.end = function noopEnd() {
      // Deliver response asynchronously, mirroring real https semantics.
      setImmediate(() => {
        if (typeof callback === 'function') {
          callback(res);
        }
        setImmediate(() => {
          res.emit('data', Buffer.from('// stub vm-slide body\n' + 'x'.repeat(200), 'utf8'));
          res.emit('end');
        });
      });
    };
    req.destroy = function noopDestroy() { /* no-op */ };

    return req;
  };

  return {
    recordedUrls,
    restore() {
      https.request = originalRequest;
    },
  };
}

// ---------------------------------------------------------------------------
// Shared driver — constructs a Scraper with a fake client and records
// outgoing HTTPS URLs from a single solveCaptcha() run.
// ---------------------------------------------------------------------------

async function runScraperWithRecorder({ legacyVdata }) {
  class FakeClientScraper extends Scraper {
    _createClient() {
      return makeFakeClient();
    }
  }

  const scraper = new FakeClientScraper({
    legacyVdata: legacyVdata,
    maxRetries: 1,
    verbose: false,
  });
  await scraper.init();

  const recorder = installHttpsRecorder();
  let caught = null;
  try {
    await scraper.solveCaptcha();
  } catch (err) {
    caught = err;
  } finally {
    recorder.restore();
  }

  return { recordedUrls: recorder.recordedUrls, error: caught };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('Scraper default path (legacyVdata:false) issues a GET for /vm-slide.<hash>.enc.js', async () => {
  const { recordedUrls } = await runScraperWithRecorder({ legacyVdata: false });
  const matches = recordedUrls.filter((r) => VM_SLIDE_REGEX.test(r.url));
  assert.ok(
    matches.length >= 1,
    'expected at least one recorded URL matching ' + VM_SLIDE_REGEX + ', got: ' +
      JSON.stringify(recordedUrls, null, 2)
  );
  // Must be a GET — not HEAD, not POST.
  for (const m of matches) {
    assert.equal(m.method, 'GET', 'vm-slide fetch must use GET, saw ' + m.method);
  }
});

test('Scraper legacy path (legacyVdata:true) issues a GET for /vm-slide.<hash>.enc.js', async () => {
  const { recordedUrls } = await runScraperWithRecorder({ legacyVdata: true });
  const matches = recordedUrls.filter((r) => VM_SLIDE_REGEX.test(r.url));
  assert.ok(
    matches.length >= 1,
    'expected at least one recorded URL matching ' + VM_SLIDE_REGEX + ', got: ' +
      JSON.stringify(recordedUrls, null, 2)
  );
  for (const m of matches) {
    assert.equal(m.method, 'GET', 'vm-slide fetch must use GET, saw ' + m.method);
  }
});

test('vm-slide fetch invariant holds symmetrically across legacyVdata flag', async () => {
  // Shared-invariant guard — both paths must call _getVmSlideSource, so the
  // recorded URL lists for both runs must contain a vm-slide match. This
  // documents that the fix is deliberately unconditional (see commit 970c404
  // on the main branch).
  const def = await runScraperWithRecorder({ legacyVdata: false });
  const leg = await runScraperWithRecorder({ legacyVdata: true });
  assert.ok(def.recordedUrls.some((r) => VM_SLIDE_REGEX.test(r.url)),
    'default path missing vm-slide fetch');
  assert.ok(leg.recordedUrls.some((r) => VM_SLIDE_REGEX.test(r.url)),
    'legacy path missing vm-slide fetch');
});
