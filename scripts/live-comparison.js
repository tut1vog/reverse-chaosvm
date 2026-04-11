'use strict';

/**
 * live-comparison.js — End-to-end live token verification script.
 *
 * Captures Chrome's collect token from a real CAPTCHA session, extracts XTEA
 * params from the live tdc.js via the pipeline, decrypts Chrome's token,
 * generates a standalone token with the same params, and compares segment-by-segment.
 *
 * Usage:
 *   node scripts/live-comparison.js
 *   node scripts/live-comparison.js --headful
 *   node scripts/live-comparison.js --attempts 5
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { CaptchaClient } = require('../puppeteer/captcha-client');
const { generateCollect } = require('../scraper/collect-generator');
const { extractTdcName, extractEks } = require('../scraper/tdc-utils');
const TemplateCache = require('../scraper/template-cache');
const { parseVmFunction } = require('../pipeline/vm-parser');
const { mapOpcodes } = require('../pipeline/opcode-mapper');
const { extractKey } = require('../pipeline/key-extractor');

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

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function log(msg) {
  process.stderr.write(`[live-comparison] ${msg}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { headless: true, maxAttempts: 3 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headful') opts.headless = false;
    if (args[i] === '--attempts' && args[i + 1]) opts.maxAttempts = parseInt(args[i + 1], 10);
  }
  return opts;
}

// ═══════════════════════════════════════════════════════════════════════
// XTEA Decryption (self-contained)
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

  const encrypted = Buffer.from(b64, 'base64').toString('binary');
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
// Header segment analysis
// ═══════════════════════════════════════════════════════════════════════

/**
 * Decrypt just the header segment (first 192 base64 chars = 144 bytes)
 * and analyze its split strategy.
 */
function analyzeHeaderSegment(collectStr, params) {
  const b64 = collectStr
    .replace(/%2B/g, '+')
    .replace(/%2F/g, '/')
    .replace(/%3D/g, '=');

  const headerB64 = b64.substring(0, 192); // 192 b64 chars = 144 bytes
  const headerEnc = Buffer.from(headerB64, 'base64').toString('binary');
  const headerDec = decryptXtea(headerEnc, params);

  // Count trailing spaces
  let paddingLength = 0;
  for (let i = headerDec.length - 1; i >= 0; i--) {
    if (headerDec[i] === ' ') {
      paddingLength++;
    } else {
      break;
    }
  }

  const contentLength = headerDec.length - paddingLength;
  const strategy = paddingLength > 0 ? 'field-boundary' : 'byte-boundary';
  const headerContent = headerDec.substring(0, contentLength);

  // Count top-level cd fields in header
  let depth = 0;
  let inStr = false;
  let fieldCount = 0;
  for (let i = 0; i < headerContent.length; i++) {
    const ch = headerContent[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 2) fieldCount++;
    }
  }

  return {
    strategy,
    contentLength,
    paddingLength,
    headerFieldCount: fieldCount,
    headerContentPreview: headerContent.substring(0, 80),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Single attempt
// ═══════════════════════════════════════════════════════════════════════

async function runAttempt(browser, opts) {
  const result = {
    tdcName: null,
    caseCount: null,
    template: null,
    keyExtracted: false,
    key: null,
    keyMods: null,
    chromeCollectLength: null,
    decryptionSuccess: false,
    chromeCdFieldCount: null,
    headerSplit: null,
    standaloneCollectLength: null,
    segmentComparison: null,
    error: null,
  };

  const page = await browser.newPage();
  await page.setUserAgent(DEFAULT_USER_AGENT);

  try {
    // ── Step 1: Prehandle ──
    log('Step 1: prehandle (Node.js HTTP)...');
    const client = new CaptchaClient({
      aid: DEFAULT_AID,
      referer: 'https://urlsec.qq.com/',
    });
    const session = await client.prehandle();
    log(`  sess=${session.sess.slice(0, 20)}... sid=${session.sid}`);

    // ── Step 2: Navigate to show page + intercept tdc.js ──
    log('Step 2: Navigate to show page + intercept tdc.js...');

    const showParams = new URLSearchParams({
      aid: DEFAULT_AID,
      protocol: 'https',
      accver: '1',
      showtype: 'popup',
      ua: Buffer.from(DEFAULT_USER_AGENT).toString('base64'),
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

    // Set up response interceptors
    let capturedTdcSource = null;

    page.on('response', async (response) => {
      const url = response.url();
      try {
        if (url.includes('/tdc.js') || url.includes('tdc.js?')) {
          const text = await response.text();
          if (text.length > 1000) {
            capturedTdcSource = text;
            log(`  Intercepted tdc.js source: ${text.length} chars`);
          }
        }
      } catch (_) {
        // response.text() can fail for redirects etc.
      }
    });

    // Navigate
    await page.goto(showUrl, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    log('  Show page loaded');

    // Wait for tdc.js
    const waitStart = Date.now();
    while (!capturedTdcSource && Date.now() - waitStart < 10000) {
      await sleep(200);
    }

    if (!capturedTdcSource) {
      throw new Error('Failed to intercept tdc.js source');
    }

    // ── Step 3: Wait for TDC and capture collect token ──
    log('Step 3: Wait for TDC.getData()...');

    let tdcAvailable = false;
    let chromeCollect = null;
    const tdcWaitStart = Date.now();
    while (!tdcAvailable && Date.now() - tdcWaitStart < 15000) {
      tdcAvailable = await page.evaluate(() => typeof window.TDC !== 'undefined');
      if (!tdcAvailable) await sleep(200);
    }

    if (tdcAvailable) {
      log('  TDC object available');

      // Call TDC.getData(true)
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
        result.chromeCollectLength = chromeCollect.length;
        log(`  Chrome collect token captured: ${chromeCollect.length} chars`);
      } else {
        log(`  Chrome TDC.getData() failed: ${chromeGetData.reason || 'empty result'}`);
      }
    } else {
      log('  WARNING: TDC object not available after 15s');
    }

    if (!chromeCollect) {
      throw new Error('Failed to capture Chrome collect token');
    }

    // ── Step 4: Extract TDC_NAME and eks ──
    log('Step 4: Extract TDC_NAME + eks...');
    const tdcName = extractTdcName(capturedTdcSource);
    if (!tdcName) throw new Error('Could not extract TDC_NAME');
    result.tdcName = tdcName;
    log(`  TDC_NAME: ${tdcName}`);

    const eks = extractEks(capturedTdcSource);
    log(`  eks: ${eks ? eks.slice(0, 20) + '...' : 'null'}`);

    // ── Step 5: Run pipeline to extract XTEA params ──
    log('Step 5: Run pipeline (parse VM → map opcodes → extract key)...');

    let vmInfo;
    try {
      vmInfo = parseVmFunction(capturedTdcSource);
      result.caseCount = vmInfo.caseCount;
      log(`  Parsed VM: ${vmInfo.caseCount} opcodes`);
    } catch (e) {
      throw new Error(`VM parser failed: ${e.message}`);
    }

    let mapResult;
    try {
      mapResult = mapOpcodes(vmInfo, capturedTdcSource);
      log(`  Mapped opcodes: ${Object.keys(mapResult.opcodeTable).length} mapped, ${mapResult.unmapped.length} unmapped`);
    } catch (e) {
      throw new Error(`Opcode mapper failed: ${e.message}`);
    }

    // extractKey needs a file path — write to temp
    const tmpFile = path.join(os.tmpdir(), `tdc-live-${tdcName}-${Date.now()}.js`);
    let keyResult;
    try {
      fs.writeFileSync(tmpFile, capturedTdcSource, 'utf8');
      keyResult = await extractKey(tmpFile, mapResult.opcodeTable, vmInfo.variables);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
    }

    result.keyExtracted = true;
    result.key = keyResult.key.map(k => '0x' + (k >>> 0).toString(16).padStart(8, '0'));
    result.keyMods = keyResult.keyMods || [0, 0, 0, 0];
    log(`  Key: [${result.key.join(', ')}]`);
    log(`  keyMods: [${result.keyMods.join(', ')}]`);
    log(`  delta: 0x${(keyResult.delta >>> 0).toString(16)}, rounds: ${keyResult.rounds}`);

    // Classify template
    if (vmInfo.caseCount === 95) result.template = 'A';
    else if (vmInfo.caseCount === 94) result.template = 'B';
    else if (vmInfo.caseCount === 100) result.template = 'C';
    else result.template = `unknown-${vmInfo.caseCount}`;

    const xteaParams = {
      key: keyResult.key,
      delta: keyResult.delta,
      rounds: keyResult.rounds,
      keyMods: keyResult.keyMods || [0, 0, 0, 0],
    };

    // ── Step 6: Decrypt Chrome's token ──
    log('Step 6: Decrypt Chrome collect token...');

    const fullDecrypt = decryptCollect(chromeCollect, xteaParams);
    result.decryptionSuccess = !!fullDecrypt.parsed;

    if (fullDecrypt.parsed) {
      log(`  Full decryption SUCCESS — valid JSON`);
      if (fullDecrypt.parsed.cd) {
        result.chromeCdFieldCount = fullDecrypt.parsed.cd.length;
        log(`  Chrome cd: ${fullDecrypt.parsed.cd.length} fields`);
      }
      if (fullDecrypt.parsed.sd) {
        log(`  Chrome sd keys: ${Object.keys(fullDecrypt.parsed.sd).join(', ')}`);
      }
    } else {
      log(`  Full decryption FAILED — not valid JSON`);
      log(`  Plaintext preview: ${fullDecrypt.plaintext.substring(0, 100)}`);
    }

    // ── Step 7: Analyze header segment ──
    log('Step 7: Analyze header segment...');
    const headerAnalysis = analyzeHeaderSegment(chromeCollect, xteaParams);
    result.headerSplit = {
      strategy: headerAnalysis.strategy,
      contentLength: headerAnalysis.contentLength,
      paddingLength: headerAnalysis.paddingLength,
    };
    log(`  Header strategy: ${headerAnalysis.strategy}`);
    log(`  Content: ${headerAnalysis.contentLength} bytes, padding: ${headerAnalysis.paddingLength} bytes`);
    log(`  Header field count: ${headerAnalysis.headerFieldCount}`);
    log(`  Preview: ${headerAnalysis.headerContentPreview}`);

    // ── Step 8: Generate standalone token ──
    log('Step 8: Generate standalone collect token...');

    const profilePath = path.join(PROJECT_ROOT, 'profiles', 'default.json');
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    // Look up template cache for cdFieldOrder and other structure params
    const cache = new TemplateCache();
    cache.load();
    cache.seed();
    const cached = cache.lookup(tdcName);

    const genOpts = {};
    if (cached && cached.cdFieldOrder) {
      genOpts.cdFieldOrder = cached.cdFieldOrder;
      log(`  Using cdFieldOrder from cache (${cached.cdFieldOrder.length} entries)`);
    } else if (vmInfo.caseCount === 95) {
      // Default Template A field order
      genOpts.cdFieldOrder = [0,4,23,44,21,11,39,26,1,28,5,47,24,27,8,46,12,30,-1,31,6,15,16,3,18,7,19,38,17,48,49,40,45,2,35,53,42,54,52,9,29,20,51,43,41,34,36,33,57,56,10,14,32,13,37,-1,-1,22,50];
      log('  Using default Template A cdFieldOrder');
    }

    if (cached && cached.serializationDiffs) {
      genOpts.serializationDiffs = cached.serializationDiffs;
      log(`  Using serializationDiffs from cache`);
    }

    // Use the header split strategy from Chrome's actual token
    if (headerAnalysis.strategy === 'field-boundary') {
      genOpts.headerSplit = {
        strategy: 'field-boundary',
        contentLength: headerAnalysis.contentLength,
      };
      log(`  Using field-boundary headerSplit (contentLength=${headerAnalysis.contentLength})`);
    }

    const standaloneCollect = generateCollect(profile, xteaParams, genOpts);
    result.standaloneCollectLength = standaloneCollect.length;
    log(`  Standalone collect: ${standaloneCollect.length} chars`);

    // ── Step 9: Compare ──
    log('Step 9: Segment comparison...');

    const comparison = {
      headerMatch: false,
      headerDiffSummary: null,
      fieldCountMatch: false,
      fieldDiffs: null,
      totalFields: null,
    };

    // Decrypt standalone token too
    const standaloneDecrypt = decryptCollect(standaloneCollect, xteaParams);

    if (fullDecrypt.parsed && standaloneDecrypt.parsed) {
      // Field count comparison
      const chromeCdLen = fullDecrypt.parsed.cd ? fullDecrypt.parsed.cd.length : 0;
      const standaloneCdLen = standaloneDecrypt.parsed.cd ? standaloneDecrypt.parsed.cd.length : 0;
      comparison.fieldCountMatch = chromeCdLen === standaloneCdLen;
      comparison.totalFields = chromeCdLen;

      log(`  Field counts — Chrome: ${chromeCdLen}, standalone: ${standaloneCdLen}`);

      // Per-field diff
      if (fullDecrypt.parsed.cd && standaloneDecrypt.parsed.cd) {
        let diffCount = 0;
        const maxLen = Math.max(chromeCdLen, standaloneCdLen);
        const fieldDiffDetails = [];
        for (let i = 0; i < maxLen; i++) {
          const a = JSON.stringify(fullDecrypt.parsed.cd[i]);
          const b = JSON.stringify(standaloneDecrypt.parsed.cd[i]);
          if (a !== b) {
            diffCount++;
            if (fieldDiffDetails.length < 10) {
              fieldDiffDetails.push({
                index: i,
                chrome: fullDecrypt.parsed.cd[i],
                standalone: standaloneDecrypt.parsed.cd[i],
              });
            }
          }
        }
        comparison.fieldDiffs = diffCount;
        comparison.fieldDiffDetails = fieldDiffDetails;
        log(`  Field diffs: ${diffCount}/${maxLen}`);
      }
    } else {
      log('  Cannot compare fields — one or both decryptions failed');
      comparison.headerDiffSummary = 'decryption failed for comparison';
    }

    // Header comparison
    const chromeHeader = analyzeHeaderSegment(chromeCollect, xteaParams);
    const standaloneHeader = analyzeHeaderSegment(standaloneCollect, xteaParams);
    comparison.headerMatch = chromeHeader.strategy === standaloneHeader.strategy &&
      chromeHeader.contentLength === standaloneHeader.contentLength;
    comparison.headerDiffSummary =
      `Chrome: ${chromeHeader.strategy} (content=${chromeHeader.contentLength}, padding=${chromeHeader.paddingLength}), ` +
      `standalone: ${standaloneHeader.strategy} (content=${standaloneHeader.contentLength}, padding=${standaloneHeader.paddingLength})`;
    log(`  Header: ${comparison.headerDiffSummary}`);

    result.segmentComparison = comparison;

  } catch (err) {
    result.error = err.message;
    log(`  ERROR: ${err.message}`);
  } finally {
    await page.close().catch(() => {});
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const opts = parseArgs();
  log(`Starting live comparison — ${opts.maxAttempts} attempt(s), headless=${opts.headless}`);

  const output = {
    attempts: [],
    timestamp: new Date().toISOString(),
  };

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

  try {
    for (let i = 1; i <= opts.maxAttempts; i++) {
      log(`\n========== Attempt ${i}/${opts.maxAttempts} ==========`);
      const attemptResult = await runAttempt(browser, opts);
      output.attempts.push(attemptResult);

      // Summary
      if (attemptResult.error) {
        log(`Attempt ${i} FAILED: ${attemptResult.error}`);
      } else {
        log(`Attempt ${i} OK — tdcName=${attemptResult.tdcName}, ` +
          `decrypt=${attemptResult.decryptionSuccess}, ` +
          `fieldDiffs=${attemptResult.segmentComparison ? attemptResult.segmentComparison.fieldDiffs : 'N/A'}`);
      }

      // Wait between attempts to avoid rate limiting
      if (i < opts.maxAttempts) {
        log('Waiting 3s before next attempt...');
        await sleep(3000);
      }
    }
  } finally {
    await browser.close();
  }

  // Write results
  const outputPath = path.join(PROJECT_ROOT, 'output', 'live-comparison.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  log(`\nResults written to ${outputPath}`);

  // Print summary
  log('\n========== SUMMARY ==========');
  for (let i = 0; i < output.attempts.length; i++) {
    const a = output.attempts[i];
    if (a.error) {
      log(`  Attempt ${i + 1}: FAILED — ${a.error}`);
    } else {
      log(`  Attempt ${i + 1}: tdcName=${a.tdcName} template=${a.template} ` +
        `decrypt=${a.decryptionSuccess} fields=${a.chromeCdFieldCount} ` +
        `headerStrategy=${a.headerSplit ? a.headerSplit.strategy : 'N/A'} ` +
        `fieldDiffs=${a.segmentComparison ? a.segmentComparison.fieldDiffs : 'N/A'}`);
    }
  }
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
