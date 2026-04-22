'use strict';

/**
 * test-scraper-extra-headers.js — Phase 71 regression guard for the
 * --extra-header CLI flag's two-half contract:
 *
 *   (A) User-supplied --extra-header values DO land on the
 *       /cap_union_new_verify POST with their exact name and value.
 *   (B) User-supplied --extra-header values DO NOT contaminate any
 *       other outbound request (queryUrlSec, prehandle, show, etc.).
 *
 * Both halves are pinned by stubbing the captcha-client module's
 * `httpRequest` export — captured before scraper.js is required — so
 * that every direct httpRequest() call from scraper.js is recorded
 * with no real network I/O. Heavy collaborators (CaptchaClient
 * methods, slide-solver, collect/vData generators, fs writes,
 * setTimeout) are stubbed to keep the test under ~1s without running
 * the real CAPTCHA pipeline.
 *
 * A future refactor that moved the merge loop into a wider scope
 * (e.g. into a shared httpRequest wrapper) would cause Case B to
 * fail; removing the merge loop entirely would cause Case A to fail.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCRAPER_PATH = require.resolve('../tools/scraper/scraper');
const CAPTCHA_CLIENT_PATH = require.resolve('../tools/puppeteer/captcha-client');
const SLIDE_SOLVER_PATH = require.resolve('../tools/puppeteer/slide-solver');
const COLLECT_GENERATOR_PATH = require.resolve('../tools/scraper/collect-generator');
const FOR_POST_PATH = require.resolve('../tools/scraper/vdata-generator/for-post');
const AUDIT_LOGGER_PATH = require.resolve('../tools/scraper/audit-logger');

// ---------------------------------------------------------------------------
// Test harness — record every httpRequest() call scraper.js makes, return
// canned responses by URL. The stub is installed at the captcha-client
// module export BEFORE scraper.js is required, so scraper.js's destructured
// `httpRequest` reference picks up the stub. CaptchaClient's INTERNAL calls
// to its own httpRequest closure are short-circuited separately by stubbing
// the four CaptchaClient methods scraper.js calls (prehandle, getSig,
// downloadImages, downloadTdc) on the prototype.
// ---------------------------------------------------------------------------

const recordedCalls = [];

function resetRecorder() {
  recordedCalls.length = 0;
}

function stubHttpRequest(url, opts) {
  recordedCalls.push({
    url: url,
    method: (opts && opts.method) || 'GET',
    headers: Object.assign({}, (opts && opts.headers) || {}),
  });

  // Verify POST → return a JSONP-shaped success body so solveCaptcha exits
  // cleanly on the first attempt.
  if (url.includes('cap_union_new_verify')) {
    return Promise.resolve({
      statusCode: 200,
      headers: {},
      body: '_aq_42({"errorCode":0,"ticket":"test_ticket","randstr":"test_randstr"})',
    });
  }

  // queryUrlSec → JSONP-wrapped JSON
  if (url.includes('cgi.urlsec.qq.com')) {
    return Promise.resolve({
      statusCode: 200,
      headers: {},
      body: 'jQuery_xyz({"data":{"results":{"safe":true}}})',
    });
  }

  return Promise.resolve({ statusCode: 200, headers: {}, body: '' });
}

// ---------------------------------------------------------------------------
// Module patching helpers
// ---------------------------------------------------------------------------

const originalState = {
  setTimeout: null,
  httpRequest: null,
  solveSlider: null,
  generateCollect: null,
  buildVDataForPost: null,
  CaptchaClientPrehandle: null,
  CaptchaClientGetSig: null,
  CaptchaClientDownloadImages: null,
  CaptchaClientDownloadTdc: null,
  AuditLoggerSave: null,
  fsWriteFileSync: null,
  fsMkdirSync: null,
};

function installStubs() {
  // Defeat the human-like delay (2-5s setTimeout in solveCaptcha).
  originalState.setTimeout = global.setTimeout;
  global.setTimeout = function (fn, _ms) {
    return originalState.setTimeout(fn, 0);
  };

  // Stub the captcha-client module's httpRequest export. scraper.js
  // destructures this at require time, so the cache must be cleared after
  // patching to make scraper.js pick up the stub.
  const captchaClient = require(CAPTCHA_CLIENT_PATH);
  originalState.httpRequest = captchaClient.httpRequest;
  captchaClient.httpRequest = stubHttpRequest;

  // Stub CaptchaClient prototype methods that solveCaptcha calls. These
  // would otherwise issue their own httpRequest() calls via the closure
  // reference inside captcha-client.js (NOT through the module export),
  // hitting the network.
  const CC = captchaClient.CaptchaClient;
  originalState.CaptchaClientPrehandle = CC.prototype.prehandle;
  originalState.CaptchaClientGetSig = CC.prototype.getSig;
  originalState.CaptchaClientDownloadImages = CC.prototype.downloadImages;
  originalState.CaptchaClientDownloadTdc = CC.prototype.downloadTdc;
  CC.prototype.prehandle = async function () {
    return { sess: 'test_sess', sid: '12345', _raw: {} };
  };
  CC.prototype.getSig = async function () {
    return {
      bgUrl: 'https://t.captcha.qq.com/hycdn?index=1',
      sliceUrl: 'https://t.captcha.qq.com/hycdn?index=2',
      vsig: 'V', websig: 'W', nonce: 'N', spt: '30',
      sess: 'test_sess', sid: '12345',
      showUrl: 'https://t.captcha.qq.com/cap_union_new_show?test=1',
      showSubsid: '10',
      _raw: { dcFileName: '/td.js' },
    };
  };
  CC.prototype.downloadImages = async function () {
    return { bgBuffer: Buffer.alloc(100), sliceBuffer: Buffer.alloc(50) };
  };
  CC.prototype.downloadTdc = async function () {
    // Minimal source that satisfies extractTdcName, extractEks, computeSourceHash
    return 'window.TDC_NAME = "TestTdcNameThirtyTwoCharsLongAB";\n' +
      'window.TestTdcNameThirtyTwoCharsLongAB = \'fake_eks_token_value_padded_to_more_than_two_hundred_chars_' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\';\n';
  };

  // Stub solveSlider — return a fixed offset so the slide-solving step
  // never invokes the Python OpenCV solver.
  const slideSolver = require(SLIDE_SOLVER_PATH);
  originalState.solveSlider = slideSolver.solveSlider;
  slideSolver.solveSlider = async function () {
    return 200;
  };

  // Stub generateCollect — return a tiny placeholder so we don't run the
  // real ChaosVM-shaped XTEA pipeline in the test.
  const collectGen = require(COLLECT_GENERATOR_PATH);
  originalState.generateCollect = collectGen.generateCollect;
  collectGen.generateCollect = function () {
    return 'fake_collect_token';
  };

  // Stub buildVDataForPost — return a fixed placeholder vData string.
  const forPost = require(FOR_POST_PATH);
  originalState.buildVDataForPost = forPost.buildVDataForPost;
  forPost.buildVDataForPost = function () {
    return 'fake_vdata_string';
  };

  // Stub AuditLogger.save — solveCaptcha writes to output/phase-52-audit/
  // on success; suppress that disk write in the unit test.
  const auditMod = require(AUDIT_LOGGER_PATH);
  originalState.AuditLoggerSave = auditMod.AuditLogger.prototype.save;
  auditMod.AuditLogger.prototype.save = function () {};

  // Stub fs.writeFileSync / fs.mkdirSync — solveCaptcha unconditionally
  // writes a phase-55 diagnostic file. Suppress that write while the
  // test is running so the test has zero side effects on output/.
  const fs = require('fs');
  originalState.fsWriteFileSync = fs.writeFileSync;
  originalState.fsMkdirSync = fs.mkdirSync;
  fs.writeFileSync = function (p, data, opts) {
    // Allow writes outside the project's output/ directory (e.g. temp files
    // in tools that the test doesn't drive). Block writes under output/.
    if (typeof p === 'string' && p.indexOf(path.join(PROJECT_ROOT, 'output')) === 0) {
      return;
    }
    return originalState.fsWriteFileSync.call(fs, p, data, opts);
  };
  fs.mkdirSync = function (p, opts) {
    if (typeof p === 'string' && p.indexOf(path.join(PROJECT_ROOT, 'output')) === 0) {
      return;
    }
    return originalState.fsMkdirSync.call(fs, p, opts);
  };

  // After patching captcha-client.module.exports.httpRequest, clear scraper
  // from the require cache so its destructured reference re-binds to the stub.
  delete require.cache[SCRAPER_PATH];
}

function restoreStubs() {
  if (originalState.setTimeout) {
    global.setTimeout = originalState.setTimeout;
  }
  const captchaClient = require(CAPTCHA_CLIENT_PATH);
  if (originalState.httpRequest) {
    captchaClient.httpRequest = originalState.httpRequest;
  }
  const CC = captchaClient.CaptchaClient;
  if (originalState.CaptchaClientPrehandle) CC.prototype.prehandle = originalState.CaptchaClientPrehandle;
  if (originalState.CaptchaClientGetSig) CC.prototype.getSig = originalState.CaptchaClientGetSig;
  if (originalState.CaptchaClientDownloadImages) CC.prototype.downloadImages = originalState.CaptchaClientDownloadImages;
  if (originalState.CaptchaClientDownloadTdc) CC.prototype.downloadTdc = originalState.CaptchaClientDownloadTdc;

  const slideSolver = require(SLIDE_SOLVER_PATH);
  if (originalState.solveSlider) slideSolver.solveSlider = originalState.solveSlider;

  const collectGen = require(COLLECT_GENERATOR_PATH);
  if (originalState.generateCollect) collectGen.generateCollect = originalState.generateCollect;

  const forPost = require(FOR_POST_PATH);
  if (originalState.buildVDataForPost) forPost.buildVDataForPost = originalState.buildVDataForPost;

  const auditMod = require(AUDIT_LOGGER_PATH);
  if (originalState.AuditLoggerSave) auditMod.AuditLogger.prototype.save = originalState.AuditLoggerSave;

  const fs = require('fs');
  if (originalState.fsWriteFileSync) fs.writeFileSync = originalState.fsWriteFileSync;
  if (originalState.fsMkdirSync) fs.mkdirSync = originalState.fsMkdirSync;

  delete require.cache[SCRAPER_PATH];
}

/** Pre-seed the template cache with a known entry matching the stub tdc source's hash. */
function seedTemplateCache(scraper, tdcSource) {
  const { computeSourceHash } = require('../tools/scraper/tdc-utils');
  const hash = computeSourceHash(tdcSource);
  scraper._templateCache.store(hash, {
    template: 'TestTemplate',
    key: [0x11111111, 0x22222222, 0x33333333, 0x44444444],
    delta: 0x9E3779B9,
    rounds: 32,
    keyModConstants: [100, 200],
    keyMods: [0, 100, 0, 200],
    caseCount: 95,
  });
  // Override save() so seeding does not write to disk
  scraper._templateCache.save = function () {};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Scraper --extra-header propagation contract', () => {
  before(() => {
    installStubs();
  });

  after(() => {
    restoreStubs();
  });

  // -------------------------------------------------------------------------
  // Case A — extra headers land on /cap_union_new_verify with exact values
  // -------------------------------------------------------------------------
  it('Case A: --extra-header values land on the verify POST with exact name/value', async () => {
    resetRecorder();
    const Scraper = require(SCRAPER_PATH);
    const scraper = new Scraper({
      verbose: false,
      maxRetries: 1,
      chromeProfile: false,
      extraHeaders: [
        { name: 'X-Forwarded-For', value: '203.0.113.42' },
        { name: 'X-Real-IP', value: '198.51.100.7' },
      ],
    });
    await scraper.init();

    // Pre-seed cache so _autoPort never fires
    const tdcSource = 'window.TDC_NAME = "TestTdcNameThirtyTwoCharsLongAB";\n' +
      'window.TestTdcNameThirtyTwoCharsLongAB = \'fake_eks_token_value_padded_to_more_than_two_hundred_chars_' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\';\n';
    seedTemplateCache(scraper, tdcSource);

    const result = await scraper.solveCaptcha();
    assert.strictEqual(result.errorCode, 0, 'verify stub returns errorCode 0');
    assert.strictEqual(result.ticket, 'test_ticket');

    // Find the verify POST among recorded calls
    const verifyCalls = recordedCalls.filter(c =>
      c.url.includes('cap_union_new_verify') && c.method === 'POST');
    assert.strictEqual(verifyCalls.length, 1,
      'expected exactly one verify POST, got ' + verifyCalls.length);

    const verifyHeaders = verifyCalls[0].headers;
    assert.strictEqual(verifyHeaders['X-Forwarded-For'], '203.0.113.42',
      'X-Forwarded-For must reach the verify POST verbatim');
    assert.strictEqual(verifyHeaders['X-Real-IP'], '198.51.100.7',
      'X-Real-IP must reach the verify POST verbatim');

    // The built-in headers must still be present (the merge augments, it
    // does not replace).
    assert.ok(verifyHeaders['Content-Type'],
      'built-in Content-Type must still be present');
    assert.ok(verifyHeaders['Cookie'],
      'built-in Cookie (TDC_itoken) must still be present');
  });

  // -------------------------------------------------------------------------
  // Case B — extra headers DO NOT contaminate non-verify scraper requests
  //
  // queryUrlSec() is the simplest non-verify httpRequest call site that lives
  // directly inside scraper.js (the merge loop is in solveCaptcha alongside
  // the verify POST; if a future refactor moved the merge to a shared place
  // or to queryUrlSec, this assertion would fail).
  // -------------------------------------------------------------------------
  it('Case B: --extra-header values do NOT contaminate queryUrlSec() (a non-verify request)', async () => {
    resetRecorder();
    const Scraper = require(SCRAPER_PATH);
    const scraper = new Scraper({
      verbose: false,
      chromeProfile: false,
      extraHeaders: [
        { name: 'X-Forwarded-For', value: '203.0.113.42' },
        { name: 'X-Real-IP', value: '198.51.100.7' },
      ],
    });

    // queryUrlSec doesn't need init() — call it directly to drive a single
    // httpRequest() that is NOT the verify POST.
    const results = await scraper.queryUrlSec(
      'https://example.com', 'fake_ticket', 'fake_randstr'
    );
    assert.deepStrictEqual(results, { safe: true });

    assert.strictEqual(recordedCalls.length, 1,
      'queryUrlSec must issue exactly one httpRequest call');
    const call = recordedCalls[0];
    assert.ok(call.url.includes('cgi.urlsec.qq.com'),
      'recorded call must be the urlsec query, got: ' + call.url);
    assert.strictEqual(call.method, 'GET');

    assert.strictEqual(call.headers['X-Forwarded-For'], undefined,
      'X-Forwarded-For must NOT appear on the queryUrlSec request');
    assert.strictEqual(call.headers['X-Real-IP'], undefined,
      'X-Real-IP must NOT appear on the queryUrlSec request');
  });
});
