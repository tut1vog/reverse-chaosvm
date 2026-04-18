'use strict';

/**
 * collect-experiment.js — Controlled collect corruption experiment.
 *
 * Runs 5 test cases through the full CAPTCHA solve flow, varying ONLY the
 * collect token in the verify POST body. Each test case gets its own fresh
 * session. This isolates collect as the single variable while keeping TLS,
 * headers, vData, and all other POST fields identical to a real browser.
 *
 * Test cases:
 *   A  baseline       — Chrome's real TDC-generated collect (TDC.getData())
 *   B  garbled        — Random base64 string, same length as A's collect
 *   C  empty          — Empty string ""
 *   D  scraper-collect — Our generateCollect() output using Chrome profile + live XTEA params
 *   E  poisoned       — Valid collect structure via generateCollect() but with poisoned cd fields
 *
 * Usage:
 *   node scripts/collect-experiment.js
 *   node scripts/collect-experiment.js --headful
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { CaptchaClient } = require('../tools/captcha-solver/captcha-client');
const { solveSlider } = require('../tools/captcha-solver/slide-solver');
const {
  generateCollect,
  generateBehavioralEvents,
  buildSlideSd,
  buildDefaultCdArray,
  buildSerializationOverrides,
} = require('../tools/scraper/collect-generator');
const { buildSdString, buildCdString } = require('../tools/token-generator/outer-pipeline');
const { extractTdcName, extractEks } = require('../tools/scraper/tdc-utils');
const { parseVmFunction } = require('../tools/porting-pipeline/vm-parser');
const { mapOpcodes } = require('../tools/porting-pipeline/opcode-mapper');
const { extractKey } = require('../tools/porting-pipeline/key-extractor');
const {
  matchFieldOrder,
  detectHashPosition,
  detectAllHashPositions,
  detectSerializationDiffs,
  decryptHeaderSegment,
  analyzeHeaderSplit,
} = require('../tools/porting-pipeline/structure-extractor');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const BASE_URL = 'https://t.captcha.qq.com';
const DEFAULT_AID = '2046626881';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const NAV_TIMEOUT = 30000;
const INTER_TEST_DELAY = 5000;

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function log(msg) {
  process.stderr.write(`[collect-experiment] ${msg}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const MAX_RETRIES = 5;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { headless: true, only: null, maxRetries: MAX_RETRIES };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headful') opts.headless = false;
    if (args[i] === '--only' && args[i + 1]) opts.only = args[++i].toUpperCase();
    if (args[i] === '--retries' && args[i + 1]) opts.maxRetries = parseInt(args[++i], 10);
  }
  return opts;
}

// ═══════════════════════════════════════════════════════════════════════
// XTEA Decryption (for decrypting Chrome's collect to detect structure)
// ═══════════════════════════════════════════════════════════════════════

function convertBytesToWord(fourByteString) {
  const b0 = fourByteString.charCodeAt(0) || 0;
  const b1 = fourByteString.charCodeAt(1) || 0;
  const b2 = fourByteString.charCodeAt(2) || 0;
  const b3 = fourByteString.charCodeAt(3) || 0;
  return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
}

function convertWordToBytes(word) {
  return String.fromCharCode(
    word & 0xFF,
    (word >> 8) & 0xFF,
    (word >> 16) & 0xFF,
    (word >> 24) & 0xFF
  );
}

function decryptXtea(inputBytes, params) {
  const { key, delta, rounds, keyMods } = params;
  let output = '';
  const targetSum = rounds * delta;

  for (let pos = 0; pos < inputBytes.length; pos += 8) {
    const slice1 = inputBytes.slice(pos, pos + 4);
    const slice2 = inputBytes.slice(pos + 4, pos + 8);

    let v0 = convertBytesToWord(slice1);
    let v1 = convertBytesToWord(slice2);
    let sum = targetSum;

    while (sum !== 0) {
      const idx1 = (sum >>> 11) & 3;
      v1 -= (((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + key[idx1] + keyMods[idx1]);
      sum -= delta;
      const idx0 = sum & 3;
      v0 -= (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + key[idx0] + keyMods[idx0]);
    }

    output += convertWordToBytes(v0) + convertWordToBytes(v1);
  }

  return output;
}

function decryptCollect(collectStr, params) {
  const b64 = collectStr
    .replace(/%2B/g, '+')
    .replace(/%2F/g, '/')
    .replace(/%3D/g, '=');

  const HEADER_LEN = 192;
  const HASH_LEN = 64;
  const SIG_LEN = 120;

  let encrypted;
  if (b64.length > HEADER_LEN + HASH_LEN + SIG_LEN) {
    const seg1B64 = b64.substring(0, HEADER_LEN);
    const seg0B64 = b64.substring(HEADER_LEN, HEADER_LEN + HASH_LEN);
    const dataEnd = b64.length - SIG_LEN;
    const seg2B64 = b64.substring(HEADER_LEN + HASH_LEN, dataEnd);
    const seg3B64 = b64.substring(dataEnd);

    encrypted = Buffer.concat([
      Buffer.from(seg1B64, 'base64'),
      Buffer.from(seg0B64, 'base64'),
      Buffer.from(seg2B64, 'base64'),
      Buffer.from(seg3B64, 'base64'),
    ]).toString('binary');
  } else {
    encrypted = Buffer.from(b64, 'base64').toString('binary');
  }

  const decrypted = decryptXtea(encrypted, params);
  const plaintext = decrypted.replace(/[\0\s]+$/, '');

  let parsed = null;
  try {
    parsed = JSON.parse(plaintext);
  } catch (e) {
    // Fall through
  }

  return { plaintext, parsed };
}

// ═══════════════════════════════════════════════════════════════════════
// Single test-case flow
// ═══════════════════════════════════════════════════════════════════════

/**
 * Run a single CAPTCHA session and submit with the given collect value.
 *
 * @param {object} browser - Puppeteer Browser instance
 * @param {string} testId - Test case identifier (A-E)
 * @param {string} testName - Human-readable name
 * @param {string} description - What this test case measures
 * @param {function} collectBuilder - (chromeCollect, xteaParams, profile, nonce, showUrl, vmInfo) => string
 * @param {object} sharedResources - {profile, jquerySource, vmSlideSource, userAgent}
 * @returns {object} Result object for this test case
 */
async function runTestCase(browser, testId, testName, description, collectBuilder, sharedResources) {
  const { profile, jquerySource, vmSlideSource, userAgent } = sharedResources;
  const page = await browser.newPage();
  await page.setUserAgent(userAgent);

  try {
    log(`\n${'='.repeat(60)}`);
    log(`Test ${testId}: ${testName} — ${description}`);
    log('='.repeat(60));

    // ── Step 1: Prehandle ──
    log('  [1] Prehandle...');
    const client = new CaptchaClient({
      aid: DEFAULT_AID,
      referer: 'https://urlsec.qq.com/',
    });
    const session = await client.prehandle();
    log(`    sess=${session.sess.slice(0, 20)}... sid=${session.sid}`);

    // ── Step 2: Navigate to show page + intercept tdc.js and images ──
    log('  [2] Navigate to show page...');

    const showParams = new URLSearchParams({
      aid: DEFAULT_AID,
      protocol: 'https',
      accver: '1',
      showtype: 'popup',
      ua: Buffer.from(userAgent).toString('base64'),
      noheader: '1',
      fb: '1',
      aged: '0',
      enableAged: '0',
      enableDarkMode: '0',
      grayscale: '1',
      dyeid: '0',
      clientype: '2',
      sess: session.sess,
      fwidth: '0',
      sid: session.sid,
      wxLang: '',
      tcScale: '1',
      uid: '',
      cap_cd: '',
      rnd: String(Math.floor(Math.random() * 1000000)),
      prehandleLoadTime: String(Math.floor(Math.random() * 200 + 100)),
      createIframeStart: String(Date.now()),
      global: '0',
      subsid: '1',
    });
    const showUrl = `${BASE_URL}/cap_union_new_show?${showParams.toString()}`;

    const interceptedImages = {};
    let capturedTdcSource = null;
    let capturedShowConfig = null;

    page.on('response', async (response) => {
      const url = response.url();
      try {
        if (url.includes('/hycdn') || url.includes('hycdn.cn')) {
          const buffer = await response.buffer();
          if (buffer.length > 1000) {
            if (url.includes('img_index=1') || url.includes('index=1')) {
              interceptedImages.bg = buffer;
            } else if (url.includes('img_index=2') || url.includes('index=2')) {
              interceptedImages.slice = buffer;
            } else if (!interceptedImages.bg) {
              interceptedImages.bg = buffer;
            } else if (!interceptedImages.slice) {
              interceptedImages.slice = buffer;
            }
          }
        }

        if (url.includes('/tdc.js') || url.includes('tdc.js?')) {
          const text = await response.text();
          if (text.length > 1000) {
            capturedTdcSource = text;
          }
        }

        if (url.includes('cap_union_new_show') && response.status() === 200) {
          try {
            capturedShowConfig = await response.text();
          } catch (_) { /* ignore */ }
        }
      } catch (_) {
        // response.buffer() can fail for redirects etc.
      }
    });

    await page.goto(showUrl, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });

    const waitStart = Date.now();
    while ((!interceptedImages.bg || !interceptedImages.slice || !capturedTdcSource) &&
           Date.now() - waitStart < 10000) {
      await sleep(200);
    }

    if (!interceptedImages.bg || !interceptedImages.slice) {
      throw new Error('Failed to intercept CAPTCHA images');
    }
    if (!capturedTdcSource) {
      throw new Error('Failed to intercept tdc.js source');
    }

    // Extract show config values
    let nonce = '';
    let vsig = '';
    let websig = '';
    let subcapclass = '';
    let spt = '0';
    let showSess = session.sess;
    if (capturedShowConfig) {
      const nonceMatch = capturedShowConfig.match(/["']?nonce["']?\s*:\s*["']([^"']+)["']/);
      if (nonceMatch) nonce = nonceMatch[1];
      const vsigMatch = capturedShowConfig.match(/["']?vsig["']?\s*:\s*["']([^"']+)["']/);
      if (vsigMatch) vsig = vsigMatch[1];
      const websigMatch = capturedShowConfig.match(/["']?websig["']?\s*:\s*["']([^"']+)["']/);
      if (websigMatch) websig = websigMatch[1];
      const subcapMatch = capturedShowConfig.match(/["']?subcapclass["']?\s*:\s*["']([^"']+)["']/);
      if (subcapMatch) subcapclass = subcapMatch[1];
      const sessMatch = capturedShowConfig.match(/["']?sess["']?\s*:\s*["']([^"']+)["']/);
      if (sessMatch) showSess = sessMatch[1];
      const sptMatch = capturedShowConfig.match(/["']?spt["']?\s*:\s*["']([^"']+)["']/);
      if (sptMatch) spt = sptMatch[1];
    }
    log(`    nonce=${nonce}, vsig=${vsig.slice(0, 10)}..., subcapclass=${subcapclass}`);

    // ── Step 3: Wait for TDC, capture Chrome's collect ──
    log('  [3] Wait for TDC.getData()...');
    let tdcAvailable = false;
    let chromeCollect = null;
    const tdcWaitStart = Date.now();
    while (!tdcAvailable && Date.now() - tdcWaitStart < 15000) {
      tdcAvailable = await page.evaluate(() => typeof window.TDC !== 'undefined');
      if (!tdcAvailable) await sleep(200);
    }

    if (tdcAvailable) {
      const chromeGetData = await page.evaluate(() => {
        try {
          if (window.TDC && typeof window.TDC.getData === 'function') {
            const r = window.TDC.getData(true);
            return { collect: r, ok: true };
          }
          return { ok: false, reason: 'TDC.getData not available' };
        } catch (err) {
          return { ok: false, reason: err.message };
        }
      });

      if (chromeGetData.ok && chromeGetData.collect) {
        chromeCollect = chromeGetData.collect;
        log(`    Chrome collect: ${chromeCollect.length} chars`);
      } else {
        log(`    Chrome TDC.getData() failed: ${chromeGetData.reason || 'empty'}`);
      }
    } else {
      log('    WARNING: TDC not available after 15s');
    }

    // ── Step 4: Extract TDC_NAME + eks ──
    log('  [4] Extract TDC_NAME + eks...');
    const tdcName = extractTdcName(capturedTdcSource);
    if (!tdcName) throw new Error('Could not extract TDC_NAME');
    const eks = extractEks(capturedTdcSource);
    log(`    TDC_NAME: ${tdcName}, eks: ${eks ? eks.slice(0, 20) + '...' : 'null'}`);

    // ── Step 5: Pipeline — parse VM, map opcodes, extract key ──
    log('  [5] Pipeline (parse → map → extract key)...');

    let vmInfo;
    try {
      vmInfo = parseVmFunction(capturedTdcSource);
      log(`    Parsed VM: ${vmInfo.caseCount} opcodes`);
    } catch (e) {
      throw new Error(`VM parser failed: ${e.message}`);
    }

    let mapResult;
    try {
      mapResult = mapOpcodes(vmInfo, capturedTdcSource);
      log(`    Mapped: ${Object.keys(mapResult.opcodeTable).length} opcodes`);
    } catch (e) {
      throw new Error(`Opcode mapper failed: ${e.message}`);
    }

    const tmpFile = path.join(os.tmpdir(), `tdc-exp-${testId}-${Date.now()}.js`);
    let keyResult;
    try {
      fs.writeFileSync(tmpFile, capturedTdcSource, 'utf8');
      keyResult = await extractKey(tmpFile, mapResult.opcodeTable, vmInfo.variables);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
    }

    const xteaParams = {
      key: keyResult.key,
      delta: keyResult.delta,
      rounds: keyResult.rounds,
      keyMods: keyResult.keyMods || [0, 0, 0, 0],
    };

    let template;
    if (vmInfo.caseCount === 95) template = 'A';
    else if (vmInfo.caseCount === 94) template = 'B';
    else if (vmInfo.caseCount === 100) template = 'C';
    else template = `unknown-${vmInfo.caseCount}`;

    log(`    Key: [${keyResult.key.map(k => '0x' + (k >>> 0).toString(16).padStart(8, '0')).join(', ')}]`);
    log(`    Template: ${template}`);

    // ── Step 6: Decrypt Chrome's collect to detect structure ──
    log('  [6] Decrypt Chrome collect for structure detection...');
    let cdFieldOrder = null;
    let serializationDiffs = [];
    let headerSplit = null;
    let hashPadding = null;

    if (chromeCollect) {
      const fullDecrypt = decryptCollect(chromeCollect, xteaParams);
      if (fullDecrypt.parsed) {
        if (fullDecrypt.parsed.cd) {
          const fieldResult = matchFieldOrder(fullDecrypt.parsed.cd);
          cdFieldOrder = fieldResult.fieldOrder;

          const hashPositions = detectAllHashPositions(fullDecrypt.parsed.cd);
          serializationDiffs = detectSerializationDiffs(fullDecrypt.plaintext, fullDecrypt.parsed.cd);

          // Analyze header
          const headerPlaintext = decryptHeaderSegment(chromeCollect, xteaParams);
          const headerAnalysis = analyzeHeaderSplit(headerPlaintext);
          headerSplit = {
            strategy: headerAnalysis.strategy,
            contentLength: headerAnalysis.contentLength,
          };
        }
      }
    }

    // ── Step 7: Solve slider ──
    log('  [7] Solve slider...');
    const rawOffset = await solveSlider(interceptedImages.bg, interceptedImages.slice);
    const xAnswer = rawOffset;
    const yAnswer = Math.floor(parseInt(spt, 10)) || 0;
    const ans = `${xAnswer},${yAnswer};`;
    log(`    ans: ${ans}`);

    // ── Step 8: Build the test-specific collect ──
    log(`  [8] Build collect for test ${testId} (${testName})...`);
    const collectVal = collectBuilder(chromeCollect, xteaParams, profile, nonce, showUrl, vmInfo, {
      cdFieldOrder,
      serializationDiffs,
      headerSplit,
      hashPadding,
    });
    log(`    Collect length: ${collectVal.length} chars`);

    // ── Step 9: Build POST fields ──
    log('  [9] Build POST fields...');
    const postFields = {
      aid: DEFAULT_AID,
      protocol: 'https',
      accver: '1',
      showtype: 'popup',
      ua: Buffer.from(userAgent).toString('base64'),
      noheader: '1',
      fb: '1',
      aged: '0',
      enableAged: '0',
      enableDarkMode: '0',
      grayscale: '1',
      dyeid: '0',
      clientype: '2',
      sess: showSess,
      fwidth: '0',
      sid: session.sid,
      wxLang: '',
      tcScale: '1',
      uid: '',
      cap_cd: '',
      rnd: String(Math.floor(Math.random() * 1000000)),
      prehandleLoadTime: String(Math.floor(Math.random() * 200 + 100)),
      createIframeStart: String(Date.now() - Math.floor(Math.random() * 5000 + 2000)),
      global: '0',
      subsid: '1',
      cdata: '0',
      ans: ans,
      vsig: vsig,
      websig: websig,
      subcapclass: subcapclass,
      pow_answer: '',
      pow_calc_time: '0',
      collect: collectVal,
      tlg: String(collectVal.length),
      fpinfo: '',
      eks: eks || '',
      nonce: nonce,
      vlg: '0_0_1',
    };

    // ── Step 10: Generate vData via Chrome ──
    log('  [10] Generate vData via Chrome...');
    let vData;
    let serializedBody;
    const vdataPage = await browser.newPage();
    await vdataPage.setUserAgent(userAgent);
    try {
      await vdataPage.goto('https://t.captcha.qq.com/favicon.ico', {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      }).catch(() => {});

      const chromeResult = await vdataPage.evaluate(
        (postFieldsJson, jqSrc, vmSlideSrc) => {
          return new Promise((resolve, reject) => {
            try {
              const debugLog = [];

              let capturedBody = null;
              const origOpen = XMLHttpRequest.prototype.open;
              const origSend = XMLHttpRequest.prototype.send;

              XMLHttpRequest.prototype.open = function() {
                debugLog.push('XHR.open: ' + Array.from(arguments).join(', '));
                return origOpen.apply(this, arguments);
              };

              XMLHttpRequest.prototype.send = function(body) {
                debugLog.push('XHR.send, body length: ' + (body ? body.length : 'null'));
                capturedBody = body;
              };

              if (!window.jQuery) {
                try {
                  (new Function(jqSrc))();
                  debugLog.push('jQuery loaded');
                } catch (jqErr) {
                  debugLog.push('jQuery load error: ' + jqErr.message);
                }
              }

              try {
                (new Function(vmSlideSrc))();
                debugLog.push('vm-slide loaded');
              } catch (vmErr) {
                debugLog.push('vm-slide load error: ' + vmErr.message);
              }

              const postFields = JSON.parse(postFieldsJson);

              try {
                jQuery.ajax({
                  type: 'POST',
                  url: '/cap_union_new_verify',
                  data: postFields,
                  timeout: 15000,
                  error: function() {},
                });
                debugLog.push('jQuery.ajax called');
              } catch (ajaxErr) {
                debugLog.push('jQuery.ajax exception: ' + ajaxErr.message);
              }

              XMLHttpRequest.prototype.open = origOpen;
              XMLHttpRequest.prototype.send = origSend;

              if (!capturedBody) {
                reject(new Error('XHR.send never called -- debug: ' + debugLog.join(' | ')));
                return;
              }

              const vdataIdx = capturedBody.indexOf('&vData=');
              const vDataVal = vdataIdx >= 0 ? capturedBody.substring(vdataIdx + 7) : '';
              const serialBody = vdataIdx >= 0 ? capturedBody.substring(0, vdataIdx) : capturedBody;

              resolve({
                vData: vDataVal,
                serializedBody: serialBody,
                fullBodyLength: capturedBody.length,
                debug: debugLog.join(' | '),
              });
            } catch (err) {
              reject(new Error(err.message || String(err)));
            }
          });
        },
        JSON.stringify(postFields),
        jquerySource,
        vmSlideSource
      );

      if (!chromeResult.vData) {
        throw new Error('Chrome vData generation returned empty vData');
      }

      vData = chromeResult.vData;
      serializedBody = chromeResult.serializedBody;
      log(`    vData: ${vData.length} chars`);
    } finally {
      await vdataPage.close().catch(() => {});
    }

    const finalBody = serializedBody + '&vData=' + vData;
    log(`    Final body: ${finalBody.length} chars`);

    // ── Step 11: Submit via Chrome fetch() ──
    log('  [11] Submit verify via Chrome fetch()...');
    const verifyResult = await page.evaluate(async (body) => {
      try {
        const resp = await fetch('https://t.captcha.qq.com/cap_union_new_verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: body,
        });
        return { status: resp.status, text: await resp.text() };
      } catch (err) {
        return { error: err.message };
      }
    }, finalBody);

    // ── Step 12: Parse result ──
    log('  [12] Parse result...');
    if (verifyResult.error) {
      throw new Error(`Chrome fetch() failed: ${verifyResult.error}`);
    }

    log(`    HTTP ${verifyResult.status}`);
    log(`    Response: ${verifyResult.text.slice(0, 300)}`);

    let verifyData;
    try {
      verifyData = JSON.parse(verifyResult.text);
    } catch (_) {
      const jsonStr = verifyResult.text
        .replace(/^[^(]+\(/, '')
        .replace(/\)\s*;?\s*$/, '');
      verifyData = JSON.parse(jsonStr);
    }

    const errorCode = parseInt(verifyData.errorCode, 10);
    const ticket = verifyData.ticket || null;

    log(`    errorCode: ${errorCode}`);
    log(`    ticket: ${ticket ? ticket.slice(0, 40) + '...' : 'null'}`);

    return {
      testId,
      testName,
      description,
      collectLength: collectVal.length,
      tlg: String(collectVal.length),
      errorCode,
      httpStatus: verifyResult.status,
      ticket,
      template,
      tdcName,
      caseCount: vmInfo.caseCount,
      timestamp: new Date().toISOString(),
      error: null,
    };

  } catch (err) {
    log(`    ERROR: ${err.message}`);
    return {
      testId,
      testName,
      description,
      collectLength: null,
      tlg: null,
      errorCode: null,
      httpStatus: null,
      ticket: null,
      template: null,
      tdcName: null,
      caseCount: null,
      timestamp: new Date().toISOString(),
      error: err.message,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Test case collect builders
// ═══════════════════════════════════════════════════════════════════════

function buildBaselineCollect(chromeCollect) {
  if (!chromeCollect) {
    throw new Error('Chrome collect not available for baseline test');
  }
  // URL-decode if needed
  let val = chromeCollect;
  if (val.includes('%')) {
    try { val = decodeURIComponent(val); } catch (_) { /* leave as-is */ }
  }
  return val;
}

function buildGarbledCollect(chromeCollect) {
  const targetLen = chromeCollect ? chromeCollect.length : 5000;
  return crypto.randomBytes(Math.ceil(targetLen * 3 / 4))
    .toString('base64')
    .slice(0, targetLen);
}

function buildEmptyCollect() {
  return '';
}

function buildScraperCollect(chromeCollect, xteaParams, profile, nonce, showUrl, vmInfo, structureInfo) {
  const now = Date.now();
  const nowSec = Math.round(now / 1000);

  const profileOverrides = Object.assign({}, profile, {
    pageUrl: showUrl,
    timestamp: nowSec,
    timestampCollectionStart: nowSec,
    timestampCollectionEnd: nowSec + 3,
    canvasHash: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
    mathFingerprint: Math.random(),
    performanceHash: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
  });

  const slideSd = { od: 'C', clientType: '' };

  const collectOpts = {
    appid: DEFAULT_AID,
    nonce: nonce,
    sdOverride: slideSd,
    timestamp: now,
  };

  // Apply detected structure info for max fidelity
  if (structureInfo.cdFieldOrder) {
    collectOpts.cdFieldOrder = structureInfo.cdFieldOrder;
    collectOpts.behavioralEvents = generateBehavioralEvents(100, 0, now);
  }
  if (structureInfo.serializationDiffs && structureInfo.serializationDiffs.length > 0) {
    collectOpts.serializationDiffs = structureInfo.serializationDiffs;
  }
  if (structureInfo.headerSplit && structureInfo.headerSplit.strategy === 'field-boundary') {
    collectOpts.headerSplit = structureInfo.headerSplit;
  }
  if (structureInfo.hashPadding) {
    collectOpts.hashPadding = structureInfo.hashPadding;
  }

  const collectEncoded = generateCollect(profileOverrides, xteaParams, collectOpts);
  let collectVal = collectEncoded;
  if (collectVal.includes('%')) {
    try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* leave as-is */ }
  }
  return collectVal;
}

function buildPoisonedCollect(chromeCollect, xteaParams, profile, nonce, showUrl, vmInfo, structureInfo) {
  const now = Date.now();
  const nowSec = Math.round(now / 1000);

  // Start with default cd array, then poison every field
  const cdArray = buildDefaultCdArray(profile || {});
  const poisonedCd = cdArray.map((entry, i) => {
    // Keep arrays as-is structurally (behavioral events, hash artifacts)
    if (Array.isArray(entry)) return entry;
    // Replace strings with obviously fake values
    if (typeof entry === 'string') return '0';
    // Replace numbers with 0
    if (typeof entry === 'number') return 0;
    return '0';
  });

  // Explicitly set known fingerprint-ish fields to bot values
  // Field 0 is typically userAgent
  poisonedCd[0] = 'Bot/1.0';

  const slideSd = { od: 'C', clientType: '' };

  const collectOpts = {
    appid: DEFAULT_AID,
    nonce: nonce,
    sdOverride: slideSd,
    timestamp: now,
    cdArrayOverride: poisonedCd,
  };

  if (structureInfo.serializationDiffs && structureInfo.serializationDiffs.length > 0) {
    collectOpts.serializationDiffs = structureInfo.serializationDiffs;
  }
  if (structureInfo.headerSplit && structureInfo.headerSplit.strategy === 'field-boundary') {
    collectOpts.headerSplit = structureInfo.headerSplit;
  }

  const profileOverrides = Object.assign({}, profile || {}, {
    pageUrl: showUrl,
    timestamp: nowSec,
    timestampCollectionStart: nowSec,
    timestampCollectionEnd: nowSec + 3,
  });

  const collectEncoded = generateCollect(profileOverrides, xteaParams, collectOpts);
  let collectVal = collectEncoded;
  if (collectVal.includes('%')) {
    try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* leave as-is */ }
  }
  return collectVal;
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const opts = parseArgs();
  const userAgent = DEFAULT_USER_AGENT;

  log('Collect Corruption Experiment');
  log(`  headless: ${opts.headless}`);
  log('');

  // Load shared resources
  const profilePath = path.join(PROJECT_ROOT, 'profiles', 'default.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  log('Profile loaded');

  const jqueryPath = path.join(PROJECT_ROOT, 'sample', 'slide-jy.js');
  if (!fs.existsSync(jqueryPath)) {
    throw new Error('sample/slide-jy.js not found');
  }
  const jquerySource = fs.readFileSync(jqueryPath, 'utf8');
  log(`jQuery loaded (${jquerySource.length} chars)`);

  const vmSlidePath = path.join(PROJECT_ROOT, 'sample', 'vm_slide.js');
  if (!fs.existsSync(vmSlidePath)) {
    throw new Error('sample/vm_slide.js not found');
  }
  const vmSlideSource = fs.readFileSync(vmSlidePath, 'utf8');
  log(`vm-slide loaded (${vmSlideSource.length} chars)`);

  const sharedResources = { profile, jquerySource, vmSlideSource, userAgent };

  // Launch browser (shared across all test cases)
  log('Launching Chrome with stealth plugin...');
  const browser = await puppeteer.launch({
    headless: opts.headless ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
    defaultViewport: { width: 1280, height: 1400, deviceScaleFactor: 1 },
  });

  // Define the 5 test cases
  const testCases = [
    {
      testId: 'A',
      testName: 'baseline',
      description: "Chrome's real TDC-generated collect",
      collectBuilder: (chromeCollect, xteaParams, prof, nonce, showUrl, vmInfo, structInfo) => {
        return buildBaselineCollect(chromeCollect);
      },
    },
    {
      testId: 'B',
      testName: 'garbled',
      description: 'Random base64 string, same length as baseline',
      collectBuilder: (chromeCollect, xteaParams, prof, nonce, showUrl, vmInfo, structInfo) => {
        return buildGarbledCollect(chromeCollect);
      },
    },
    {
      testId: 'C',
      testName: 'empty',
      description: 'Empty string collect',
      collectBuilder: () => {
        return buildEmptyCollect();
      },
    },
    {
      testId: 'D',
      testName: 'scraper-collect',
      description: 'Our generateCollect() with Chrome profile + live XTEA params',
      collectBuilder: (chromeCollect, xteaParams, prof, nonce, showUrl, vmInfo, structInfo) => {
        return buildScraperCollect(chromeCollect, xteaParams, prof, nonce, showUrl, vmInfo, structInfo);
      },
    },
    {
      testId: 'E',
      testName: 'poisoned',
      description: 'Valid collect structure with poisoned cd fields (Bot/1.0, all zeros)',
      collectBuilder: (chromeCollect, xteaParams, prof, nonce, showUrl, vmInfo, structInfo) => {
        return buildPoisonedCollect(chromeCollect, xteaParams, prof, nonce, showUrl, vmInfo, structInfo);
      },
    },
  ];

  // Filter test cases if --only specified
  const filteredTestCases = opts.only
    ? testCases.filter(tc => tc.testId === opts.only)
    : testCases;

  if (filteredTestCases.length === 0) {
    throw new Error(`No test case matching --only ${opts.only}. Valid IDs: A, B, C, D, E`);
  }

  if (opts.only) {
    log(`Running only test case ${opts.only} (with up to ${opts.maxRetries} retries on template failure)`);
  }

  const results = [];

  for (let i = 0; i < filteredTestCases.length; i++) {
    const tc = filteredTestCases[i];
    let result = null;

    for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
      if (attempt > 1) {
        log(`\n  Retry ${attempt}/${opts.maxRetries} for test ${tc.testId} (previous attempt hit unportable template)...`);
        await sleep(INTER_TEST_DELAY);
      }

      result = await runTestCase(
        browser,
        tc.testId,
        tc.testName,
        tc.description,
        tc.collectBuilder,
        sharedResources
      );

      // Retry if the error looks like a template/key extraction failure
      if (result.error && attempt < opts.maxRetries) {
        const isTemplateFailure = result.error.includes('null') ||
          result.error.includes('key') ||
          result.error.includes('extract') ||
          result.error.includes('map');
        if (isTemplateFailure) {
          log(`    Template extraction failed (attempt ${attempt}), will retry...`);
          continue;
        }
      }
      break; // Success or non-retryable error
    }

    results.push(result);

    // Rate limiting delay between test cases (skip after last)
    if (i < filteredTestCases.length - 1) {
      log(`\nWaiting ${INTER_TEST_DELAY / 1000}s before next test case...`);
      await sleep(INTER_TEST_DELAY);
    }
  }

  await browser.close().catch(() => {});

  // Write results
  const output = {
    timestamp: new Date().toISOString(),
    userAgent: userAgent,
    results: results,
  };

  const outputDir = path.join(PROJECT_ROOT, 'output', 'phase-58');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'collect-experiment.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
  log(`\nResults written to ${outputPath}`);

  // Print summary table
  log('\n' + '='.repeat(60));
  log('SUMMARY');
  log('='.repeat(60));
  log(`${'ID'.padEnd(4)} ${'Name'.padEnd(18)} ${'ErrCode'.padEnd(10)} ${'Collect Len'.padEnd(14)} ${'Error'.padEnd(40)}`);
  log('-'.repeat(86));
  for (const r of results) {
    const ec = r.errorCode !== null ? String(r.errorCode) : 'N/A';
    const cl = r.collectLength !== null ? String(r.collectLength) : 'N/A';
    const err = r.error ? r.error.slice(0, 38) : '-';
    log(`${r.testId.padEnd(4)} ${r.testName.padEnd(18)} ${ec.padEnd(10)} ${cl.padEnd(14)} ${err}`);
  }
  log('');

  return output;
}

main()
  .then((output) => {
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    log(`Fatal error: ${err.message}`);
    console.error(err);
    process.exit(2);
  });
