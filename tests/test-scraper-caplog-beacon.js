'use strict';

// Phase 46.5 — regression tests for the 46.4 /caplog beacons. These pin the
// wire-level invariants that cannot silently regress:
//
//   1. The pre-verify beacon is a GET to /caplog with EXACTLY the 45-key
//      sequence below, in order, and fires BEFORE the verify POST.
//   2. The post-verify beacon is a GET to /caplog with EXACTLY the 15-key
//      sequence below, in order, and fires AFTER the verify POST — on BOTH
//      success and errorCode 12 paths.
//   3. `skipCaplog: true` suppresses BOTH beacons on default and legacy paths,
//      while the vm-slide fetch (46.2 invariant) remains in place so the full
//      solveCaptcha pipeline is still exercised.
//
// Harness is a direct copy of `tests/test-scraper-vm-slide-fetch.js` (46.2),
// enhanced with:
//   - a `verifyResult` override so we can drive the errorCode 12 branch;
//   - a verify-time marker URL pushed into the same `recordedUrls` list so
//     tests can assert relative ordering of pre/verify/post.

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
// Now safe to require the modules under test.
// ---------------------------------------------------------------------------

const Scraper = require('../tools/scraper/scraper');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TDC_SOURCE = fs.readFileSync(path.join(PROJECT_ROOT, 'targets', 'tdc.js'), 'utf8');
const BG_BUFFER = fs.readFileSync(path.join(__dirname, 'asset', 'bg.png'));
const SLICE_BUFFER = fs.readFileSync(path.join(__dirname, 'asset', 'slide.png'));

const VM_SLIDE_REGEX = /\/vm-slide(\.[^/]+)?\.enc\.js/;
const CAPLOG_REGEX = /\/caplog\?/;
const VERIFY_MARKER = '__verify_marker__';

// HAR-derived ordered key sequences — hardcoded per task brief. Fields 38..41
// and 48 are absent from PRE_KEYS on purpose.
const PRE_KEYS = [
  'appid', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '29', '31', '32', '33', '34', '35',
  '36', '37', '42', '43', '44', '45', '46', '47', '49',
  'platform', 'flag1', 'flag2', 'flag3', 'subsid',
];
const POST_KEYS = [
  'appid', '27', '29', '31', '32', '33', '34', '37', '46', '48',
  'platform', 'flag1', 'flag2', 'flag3', 'subsid',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCaplogKeys(url) {
  const q = url.split('?')[1] || '';
  return q.split('&').map((kv) => kv.split('=')[0]);
}

function findCaplogUrls(recordedUrls) {
  return recordedUrls.filter((r) => CAPLOG_REGEX.test(r.url));
}

// ---------------------------------------------------------------------------
// Fake CaptchaClient
// ---------------------------------------------------------------------------

function makeFakeClient({ verifyResult, onVerify }) {
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
      if (typeof onVerify === 'function') {
        onVerify();
      }
      if (verifyResult) {
        return verifyResult;
      }
      return { errorCode: 0, ticket: 'ticket_stub', randstr: 'randstr_stub' };
    },
    resetCookies() {
      // no-op
    },
  };
}

// ---------------------------------------------------------------------------
// https.request monkey-patch
// ---------------------------------------------------------------------------

function installHttpsRecorder() {
  const originalRequest = https.request;
  const recordedUrls = [];

  https.request = function patchedRequest(options, callback) {
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
// Driver
// ---------------------------------------------------------------------------

async function runScraperWithRecorder(opts) {
  const o = opts || {};
  const { legacyVdata, skipCaplog, verifyResult } = o;

  const recorder = installHttpsRecorder();

  class FakeClientScraper extends Scraper {
    _createClient() {
      return makeFakeClient({
        verifyResult,
        onVerify: () => {
          // Push a sentinel into the shared recorder so tests can assert
          // relative ordering against the caplog URLs.
          recorder.recordedUrls.push({ method: 'MARK', url: VERIFY_MARKER });
        },
      });
    }
  }

  const scraper = new FakeClientScraper({
    legacyVdata: legacyVdata,
    skipCaplog: skipCaplog,
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

  return { recordedUrls: recorder.recordedUrls, error: caught };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('pre-verify caplog beacon fires on default path (legacyVdata:false) with exact 45-key sequence', async () => {
  const { recordedUrls } = await runScraperWithRecorder({ legacyVdata: false });
  const caplogs = findCaplogUrls(recordedUrls);
  const preMatch = caplogs.find((r) => parseCaplogKeys(r.url).length === 45);
  assert.ok(preMatch, 'expected a /caplog URL with 45 params; got: ' +
    JSON.stringify(caplogs.map((r) => r.url)));
  assert.equal(preMatch.method, 'GET', 'pre-beacon must be GET');
  assert.deepEqual(
    parseCaplogKeys(preMatch.url),
    PRE_KEYS,
    'pre-beacon parameter sequence diverged from HAR entry 8 template'
  );
});

test('pre-verify caplog beacon fires on legacy path (legacyVdata:true) with exact 45-key sequence', async () => {
  const { recordedUrls } = await runScraperWithRecorder({ legacyVdata: true });
  const caplogs = findCaplogUrls(recordedUrls);
  const preMatch = caplogs.find((r) => parseCaplogKeys(r.url).length === 45);
  assert.ok(preMatch, 'expected a /caplog URL with 45 params on legacy path');
  assert.equal(preMatch.method, 'GET');
  assert.deepEqual(parseCaplogKeys(preMatch.url), PRE_KEYS);
});

test('post-verify caplog beacon fires on default path with exact 15-key sequence', async () => {
  const { recordedUrls } = await runScraperWithRecorder({ legacyVdata: false });
  const caplogs = findCaplogUrls(recordedUrls);
  const postMatch = caplogs.find((r) => parseCaplogKeys(r.url).length === 15);
  assert.ok(postMatch, 'expected a /caplog URL with 15 params');
  assert.equal(postMatch.method, 'GET', 'post-beacon must be GET');
  assert.deepEqual(
    parseCaplogKeys(postMatch.url),
    POST_KEYS,
    'post-beacon parameter sequence diverged from HAR entry 10 template'
  );
});

test('post-verify caplog beacon fires on legacy path with exact 15-key sequence', async () => {
  const { recordedUrls } = await runScraperWithRecorder({ legacyVdata: true });
  const caplogs = findCaplogUrls(recordedUrls);
  const postMatch = caplogs.find((r) => parseCaplogKeys(r.url).length === 15);
  assert.ok(postMatch, 'expected a /caplog URL with 15 params on legacy path');
  assert.deepEqual(parseCaplogKeys(postMatch.url), POST_KEYS);
});

test('post-verify caplog beacon fires even when verify returns errorCode 12', async () => {
  const { recordedUrls } = await runScraperWithRecorder({
    legacyVdata: false,
    verifyResult: { errorCode: 12, ticket: '', randstr: '' },
  });
  const urls = recordedUrls.map((r) => r.url);
  const verifyIdx = urls.indexOf(VERIFY_MARKER);
  assert.ok(verifyIdx >= 0, 'verify marker should be present');

  // Find a post-beacon AFTER the verify marker with the exact POST_KEYS sequence.
  let postIdx = -1;
  for (let i = verifyIdx + 1; i < urls.length; i += 1) {
    if (CAPLOG_REGEX.test(urls[i]) && parseCaplogKeys(urls[i]).length === 15) {
      postIdx = i;
      break;
    }
  }
  assert.ok(postIdx > verifyIdx,
    'post-beacon must fire after verify even on errorCode 12; recorded: ' +
      JSON.stringify(urls));
  assert.deepEqual(parseCaplogKeys(urls[postIdx]), POST_KEYS);
});

test('skipCaplog:true suppresses both beacons on default path but vm-slide fetch remains', async () => {
  const { recordedUrls } = await runScraperWithRecorder({
    legacyVdata: false,
    skipCaplog: true,
  });
  const caplogs = findCaplogUrls(recordedUrls);
  assert.equal(caplogs.length, 0,
    'skipCaplog:true must suppress all /caplog beacons; got: ' +
      JSON.stringify(caplogs.map((r) => r.url)));
  // Sanity: full pipeline still ran, vm-slide fetch is observable.
  const vmSlide = recordedUrls.filter((r) => VM_SLIDE_REGEX.test(r.url));
  assert.ok(vmSlide.length >= 1,
    'vm-slide fetch should remain plumbed through even with skipCaplog:true');
});

test('skipCaplog:true suppresses both beacons on legacy path but vm-slide fetch remains', async () => {
  const { recordedUrls } = await runScraperWithRecorder({
    legacyVdata: true,
    skipCaplog: true,
  });
  const caplogs = findCaplogUrls(recordedUrls);
  assert.equal(caplogs.length, 0,
    'skipCaplog:true must suppress all /caplog beacons on legacy path');
  const vmSlide = recordedUrls.filter((r) => VM_SLIDE_REGEX.test(r.url));
  assert.ok(vmSlide.length >= 1, 'vm-slide fetch should remain plumbed on legacy path');
});

test('caplog pre-beacon fires BEFORE verify and post-beacon AFTER verify (default path)', async () => {
  const { recordedUrls } = await runScraperWithRecorder({ legacyVdata: false });
  const urls = recordedUrls.map((r) => r.url);
  const preIdx = urls.findIndex((u) => CAPLOG_REGEX.test(u) && parseCaplogKeys(u).length === 45);
  const verifyIdx = urls.indexOf(VERIFY_MARKER);
  const postIdx = urls.findIndex((u) => CAPLOG_REGEX.test(u) && parseCaplogKeys(u).length === 15);
  assert.ok(preIdx >= 0, 'pre-beacon missing');
  assert.ok(verifyIdx >= 0, 'verify marker missing');
  assert.ok(postIdx >= 0, 'post-beacon missing');
  assert.ok(preIdx < verifyIdx, 'pre-beacon must fire before verify');
  assert.ok(verifyIdx < postIdx, 'post-beacon must fire after verify');
});

test('caplog pre-beacon fires BEFORE verify and post-beacon AFTER verify (legacy path)', async () => {
  const { recordedUrls } = await runScraperWithRecorder({ legacyVdata: true });
  const urls = recordedUrls.map((r) => r.url);
  const preIdx = urls.findIndex((u) => CAPLOG_REGEX.test(u) && parseCaplogKeys(u).length === 45);
  const verifyIdx = urls.indexOf(VERIFY_MARKER);
  const postIdx = urls.findIndex((u) => CAPLOG_REGEX.test(u) && parseCaplogKeys(u).length === 15);
  assert.ok(preIdx >= 0 && verifyIdx >= 0 && postIdx >= 0,
    'expected pre/verify/post in recorded list; got: ' + JSON.stringify(urls));
  assert.ok(preIdx < verifyIdx, 'pre-beacon must fire before verify (legacy)');
  assert.ok(verifyIdx < postIdx, 'post-beacon must fire after verify (legacy)');
});
