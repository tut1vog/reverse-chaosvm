'use strict';

/**
 * live-captcha-submit.js — Full CAPTCHA solve + verify with standalone collect token.
 *
 * Combines pipeline key extraction (Phase 22-24 fixes) with slider solving,
 * vData generation, and Chrome TLS submission.
 *
 * Key difference from chrome-cd-inject.js:
 *   - ALWAYS extracts XTEA params via pipeline (never cache-only)
 *   - Decrypts Chrome's collect to detect cdFieldOrder, headerSplit, serializationDiffs
 *   - Generates a fully STANDALONE collect token (not cdArrayOverride)
 *   - Submits via Chrome fetch() for proper TLS fingerprint
 *
 * Usage:
 *   node scripts/live-captcha-submit.js
 *   node scripts/live-captcha-submit.js --headful
 *   node scripts/live-captcha-submit.js --retries 5
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { CaptchaClient } = require('../puppeteer/captcha-client');
const { solveSlider } = require('../puppeteer/slide-solver');
const { generateCollect, generateBehavioralEvents, buildSlideSd, buildDefaultCdArray, buildSerializationOverrides } = require('../scraper/collect-generator');
const { buildSdString, buildCdString } = require('../token/outer-pipeline');
const { extractTdcName, extractEks } = require('../scraper/tdc-utils');
const { parseVmFunction } = require('../pipeline/vm-parser');
const { mapOpcodes } = require('../pipeline/opcode-mapper');
const { extractKey } = require('../pipeline/key-extractor');
const {
  matchFieldOrder,
  detectHashPosition,
  detectAllHashPositions,
  detectSerializationDiffs,
  decryptHeaderSegment,
  analyzeHeaderSplit,
} = require('../pipeline/structure-extractor');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const BASE_URL = 'https://t.captcha.qq.com';
const DEFAULT_AID = '2046626881';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const DEFAULT_RATIO = 0.5;
const CALIBRATION_OFFSET = -25;
const DEFAULT_SLIDE_Y = 45;
const NAV_TIMEOUT = 30000;

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function log(msg) {
  process.stderr.write(`[live-submit] ${msg}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { headless: true, maxRetries: 3 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headful') opts.headless = false;
    if (args[i] === '--retries' && args[i + 1]) opts.maxRetries = parseInt(args[i + 1], 10);
  }
  return opts;
}

// ═══════════════════════════════════════════════════════════════════════
// XTEA Decryption (self-contained, multi-segment aware)
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

/**
 * Decrypt a collect token string, handling multi-segment base64.
 * The token is 4 separately base64-encoded segments concatenated in order
 * [1, 0, 2, 3] with fixed sizes: seg[1]=192, seg[0]=64, seg[2]=variable,
 * seg[3]=120 base64 chars.
 */
function decryptCollect(collectStr, params) {
  const b64 = collectStr
    .replace(/%2B/g, '+')
    .replace(/%2F/g, '/')
    .replace(/%3D/g, '=');

  const HEADER_LEN = 192;  // segment[1]
  const HASH_LEN = 64;     // segment[0]
  const SIG_LEN = 120;     // segment[3]

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
// Segment Parsing
// ═══════════════════════════════════════════════════════════════════════

/**
 * URL-decode a collect token string back to raw base64.
 * Reverses: + → %2B, / → %2F, = → %3D
 */
function urlDecodeCollect(encoded) {
  return encoded
    .replace(/%2B/gi, '+')
    .replace(/%2F/gi, '/')
    .replace(/%3D/gi, '=');
}

/**
 * Parse a collect token (raw base64 or URL-encoded) into its 4 segments.
 *
 * Token layout: header(192) + hash(64) + cdBody(variable) + sig(variable)
 * Assembly order from generate-token.js: btoaSegments[1] + [0] + [2] + [3]
 *   = header + hash + cdBody + sig
 *
 * The sig length depends on the sdString content. The encrypted sig is
 * sdString padded to 8-byte boundary, then base64-encoded.
 *
 * @param {string} collectStr - URL-encoded or raw base64 collect token
 * @param {number} sdStringLength - Length of the sd string (for computing sig size)
 * @returns {{header: number, hash: number, cdBody: number, sig: number, total: number}}
 */
function parseSegmentSizes(collectStr, sdStringLength) {
  const b64 = collectStr.includes('%')
    ? urlDecodeCollect(collectStr)
    : collectStr;

  const HEADER_LEN = 192;
  const HASH_LEN = 64;

  // Sig: sdString is padded to 8-byte boundary before encryption, then base64-encoded
  const sigEncryptedLen = Math.ceil(sdStringLength / 8) * 8;
  const sigB64Len = Math.ceil(sigEncryptedLen / 3) * 4;

  const headerLen = Math.min(HEADER_LEN, b64.length);
  const hashLen = Math.min(HASH_LEN, Math.max(0, b64.length - HEADER_LEN));
  const sigLen = Math.min(sigB64Len, Math.max(0, b64.length - HEADER_LEN - HASH_LEN));
  const cdBodyLen = Math.max(0, b64.length - HEADER_LEN - HASH_LEN - sigLen);

  return {
    header: headerLen,
    hash: hashLen,
    cdBody: cdBodyLen,
    sig: sigLen,
    total: b64.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Segment Decryption + Diff
// ═══════════════════════════════════════════════════════════════════════

/**
 * Decrypt a single base64-encoded XTEA segment to a plaintext string.
 *
 * @param {string} b64Str - Base64-encoded encrypted segment
 * @param {object} params - XTEA params {key, delta, rounds, keyMods}
 * @returns {string} Decrypted plaintext (may have trailing null padding)
 */
function decryptSegment(b64Str, params) {
  const encrypted = Buffer.from(b64Str, 'base64').toString('binary');
  return decryptXtea(encrypted, params);
}

/**
 * Extract the cdBody base64 substring from a collect token.
 *
 * @param {string} collectStr - URL-encoded or raw base64 collect token
 * @param {number} sdStringLength - Length of the sd string (for computing sig size)
 * @returns {string} The cdBody base64 substring
 */
function extractCdBodyB64(collectStr, sdStringLength) {
  const b64 = collectStr.includes('%')
    ? urlDecodeCollect(collectStr)
    : collectStr;

  const HEADER_LEN = 192;
  const HASH_LEN = 64;
  const sigEncryptedLen = Math.ceil(sdStringLength / 8) * 8;
  const sigB64Len = Math.ceil(sigEncryptedLen / 3) * 4;
  const sigLen = Math.min(sigB64Len, Math.max(0, b64.length - HEADER_LEN - HASH_LEN));
  const cdBodyEnd = b64.length - sigLen;

  return b64.substring(HEADER_LEN + HASH_LEN, cdBodyEnd);
}

/**
 * Diff two plaintext strings char-by-char and return divergence info.
 *
 * @param {string} a - First plaintext
 * @param {string} b - Second plaintext
 * @returns {{firstDivergence: number, aContext: string, bContext: string, aLength: number, bLength: number}}
 */
function diffPlaintext(a, b) {
  const minLen = Math.min(a.length, b.length);
  let firstDiv = -1;

  for (let i = 0; i < minLen; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) {
      firstDiv = i;
      break;
    }
  }
  // If no char mismatch but lengths differ, divergence is at the shorter string's end
  if (firstDiv === -1 && a.length !== b.length) {
    firstDiv = minLen;
  }

  const contextRadius = 25;
  const ctxStart = Math.max(0, firstDiv - contextRadius);
  const ctxEnd = firstDiv + contextRadius;

  // Sanitize for logging: replace non-printable chars
  const sanitize = (s) => s.replace(/[\x00-\x1f\x7f-\x9f]/g, '.');

  return {
    firstDivergence: firstDiv,
    aContext: firstDiv >= 0 ? sanitize(a.substring(ctxStart, ctxEnd)) : '',
    bContext: firstDiv >= 0 ? sanitize(b.substring(ctxStart, ctxEnd)) : '',
    aLength: a.length,
    bLength: b.length,
  };
}

/**
 * Identify which cd field index a character position falls in.
 * Assumes the plaintext starts with '{"cd":[' and fields are comma-separated
 * JSON values (strings or numbers).
 *
 * @param {string} plaintext - Decrypted cdBody plaintext
 * @param {number} charPos - Character position in the plaintext
 * @returns {{fieldIndex: number, fieldStart: number, fieldContent: string}|null}
 */
function identifyCdField(plaintext, charPos) {
  // Find the cd array portion
  const cdStart = plaintext.indexOf('"cd":[');
  if (cdStart === -1) return null;

  const arrayStart = plaintext.indexOf('[', cdStart);
  if (arrayStart === -1) return null;

  // Walk through the array, tracking field boundaries
  let pos = arrayStart + 1;
  let fieldIndex = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let fieldStart = pos;

  while (pos < plaintext.length) {
    const ch = plaintext[pos];

    if (escaped) {
      escaped = false;
      pos++;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      pos++;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      pos++;
      continue;
    }

    if (inString) {
      pos++;
      continue;
    }

    if (ch === '[' || ch === '{') {
      depth++;
      pos++;
      continue;
    }

    if (ch === ']' || ch === '}') {
      if (depth === 0) {
        // End of the cd array
        if (charPos >= fieldStart && charPos <= pos) {
          return {
            fieldIndex,
            fieldStart,
            fieldContent: plaintext.substring(fieldStart, pos).trim(),
          };
        }
        break;
      }
      depth--;
      pos++;
      continue;
    }

    if (ch === ',' && depth === 0) {
      if (charPos >= fieldStart && charPos < pos) {
        return {
          fieldIndex,
          fieldStart,
          fieldContent: plaintext.substring(fieldStart, pos).trim(),
        };
      }
      fieldIndex++;
      fieldStart = pos + 1;
    }

    pos++;
  }

  return null;
}

/**
 * Extract the raw text of the N-th field from a cd JSON string.
 * The cd string format is: {"cd":[field0,field1,...,fieldN]}
 * This preserves any trailing spaces/padding in the field value.
 *
 * @param {string} cdStr - The full cd JSON string
 * @param {number} fieldIndex - Zero-based field index to extract
 * @returns {string|null} The raw text of the field, or null if not found
 */
function extractRawCdField(cdStr, fieldIndex) {
  const arrayStart = cdStr.indexOf('"cd":[');
  if (arrayStart === -1) return null;

  let pos = cdStr.indexOf('[', arrayStart) + 1;
  let currentField = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let fieldStart = pos;

  while (pos < cdStr.length) {
    const ch = cdStr[pos];

    if (escaped) {
      escaped = false;
      pos++;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      pos++;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      pos++;
      continue;
    }

    if (inString) {
      pos++;
      continue;
    }

    if (ch === '[' || ch === '{') {
      depth++;
      pos++;
      continue;
    }

    if (ch === ']' || ch === '}') {
      if (depth === 0) {
        // End of the cd array
        if (currentField === fieldIndex) {
          return cdStr.substring(fieldStart, pos);
        }
        return null;
      }
      depth--;
      pos++;
      continue;
    }

    if (ch === ',' && depth === 0) {
      if (currentField === fieldIndex) {
        return cdStr.substring(fieldStart, pos);
      }
      currentField++;
      fieldStart = pos + 1;
    }

    pos++;
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// Main Solver
// ═══════════════════════════════════════════════════════════════════════

async function solve(opts) {
  const { headless, maxRetries } = opts;
  const userAgent = DEFAULT_USER_AGENT;

  // Load default profile
  const profilePath = path.join(PROJECT_ROOT, 'profiles', 'default.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  log('Default profile loaded');

  // Load jQuery source
  const jqueryPath = path.join(PROJECT_ROOT, 'sample', 'slide-jy.js');
  if (!fs.existsSync(jqueryPath)) {
    throw new Error('sample/slide-jy.js not found -- vData generation will fail');
  }
  const jquerySource = fs.readFileSync(jqueryPath, 'utf8');
  log(`jQuery source loaded (${jquerySource.length} chars)`);

  // Load vm-slide source
  const vmSlidePath = path.join(PROJECT_ROOT, 'sample', 'vm_slide.js');
  if (!fs.existsSync(vmSlidePath)) {
    throw new Error('sample/vm_slide.js not found -- vData generation will fail');
  }
  const vmSlideSource = fs.readFileSync(vmSlidePath, 'utf8');
  log(`vm-slide loaded (${vmSlideSource.length} chars)`);

  // ── Launch Puppeteer ──
  log('Launching Chrome with stealth plugin...');
  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
    defaultViewport: { width: 1280, height: 1400, deviceScaleFactor: 1 },
  });

  let lastResult = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const page = await browser.newPage();
    await page.setUserAgent(userAgent);

    try {
      log(`\n========== Attempt ${attempt}/${maxRetries} ==========`);

      // ── Step 1: Prehandle via Node.js HTTP ──
      log('Step 1: Prehandle (Node.js HTTP)...');
      const client = new CaptchaClient({
        aid: DEFAULT_AID,
        referer: 'https://urlsec.qq.com/',
      });
      const session = await client.prehandle();
      log(`  sess=${session.sess.slice(0, 20)}... sid=${session.sid}`);

      // ── Step 2: Navigate to show page + intercept tdc.js and images ──
      log('Step 2: Navigate to show page + intercept tdc.js and images...');

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

      // Set up response interceptors
      const interceptedImages = {};
      let capturedTdcSource = null;
      let capturedShowConfig = null;

      page.on('response', async (response) => {
        const url = response.url();
        try {
          // Intercept hycdn images
          if (url.includes('/hycdn') || url.includes('hycdn.cn')) {
            const buffer = await response.buffer();
            if (buffer.length > 1000) {
              if (url.includes('img_index=1') || url.includes('index=1')) {
                interceptedImages.bg = buffer;
                log(`  Intercepted bg image: ${buffer.length} bytes`);
              } else if (url.includes('img_index=2') || url.includes('index=2')) {
                interceptedImages.slice = buffer;
                log(`  Intercepted slice image: ${buffer.length} bytes`);
              } else if (!interceptedImages.bg) {
                interceptedImages.bg = buffer;
                log(`  Intercepted image (assumed bg): ${buffer.length} bytes`);
              } else if (!interceptedImages.slice) {
                interceptedImages.slice = buffer;
                log(`  Intercepted image (assumed slice): ${buffer.length} bytes`);
              }
            }
          }

          // Intercept tdc.js source
          if (url.includes('/tdc.js') || url.includes('tdc.js?')) {
            const text = await response.text();
            if (text.length > 1000) {
              capturedTdcSource = text;
              log(`  Intercepted tdc.js source: ${text.length} chars`);
            }
          }

          // Capture show page config (nonce, vsig, websig, etc.)
          if (url.includes('cap_union_new_show') && response.status() === 200) {
            try {
              const html = await response.text();
              capturedShowConfig = html;
              log(`  Captured show page HTML: ${html.length} chars`);
            } catch (_) { /* ignore */ }
          }
        } catch (_) {
          // response.buffer() can fail for redirects etc. -- ignore
        }
      });

      // Navigate
      await page.goto(showUrl, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
      log('  Show page loaded');

      // Wait for images + tdc.js
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

      // Extract nonce, vsig, websig, subcapclass from show page config
      let nonce = '';
      let vsig = '';
      let websig = '';
      let subcapclass = '';
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
        log(`  Config: nonce=${nonce}, vsig=${vsig.slice(0, 10)}..., subcapclass=${subcapclass}`);
      }

      // ── Step 3: Wait for TDC and capture Chrome's collect token ──
      log('Step 3: Wait for TDC.getData() to capture Chrome collect token...');

      let tdcAvailable = false;
      let chromeCollect = null;
      const tdcWaitStart = Date.now();
      while (!tdcAvailable && Date.now() - tdcWaitStart < 15000) {
        tdcAvailable = await page.evaluate(() => typeof window.TDC !== 'undefined');
        if (!tdcAvailable) await sleep(200);
      }

      if (tdcAvailable) {
        log('  TDC object available');
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
          log(`  Chrome collect token captured: ${chromeCollect.length} chars`);
        } else {
          log(`  Chrome TDC.getData() failed: ${chromeGetData.reason || 'empty result'}`);
        }
      } else {
        log('  WARNING: TDC object not available after 15s');
      }

      // ── Step 4: Extract TDC_NAME + eks ──
      log('Step 4: Extract TDC_NAME + eks...');
      const tdcName = extractTdcName(capturedTdcSource);
      if (!tdcName) throw new Error('Could not extract TDC_NAME from tdc.js source');
      log(`  TDC_NAME: ${tdcName}`);

      const eks = extractEks(capturedTdcSource);
      log(`  eks: ${eks ? eks.slice(0, 20) + '...' : 'null'}`);

      // ── Step 5: Run pipeline to extract XTEA params ──
      log('Step 5: Run pipeline (parse VM -> map opcodes -> extract key)...');

      let vmInfo;
      try {
        vmInfo = parseVmFunction(capturedTdcSource);
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

      // extractKey needs a file path -- write to temp
      const tmpFile = path.join(os.tmpdir(), `tdc-live-${tdcName}-${Date.now()}.js`);
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

      // Classify template
      let template;
      if (vmInfo.caseCount === 95) template = 'A';
      else if (vmInfo.caseCount === 94) template = 'B';
      else if (vmInfo.caseCount === 100) template = 'C';
      else template = `unknown-${vmInfo.caseCount}`;

      log(`  Key: [${keyResult.key.map(k => '0x' + (k >>> 0).toString(16).padStart(8, '0')).join(', ')}]`);
      log(`  keyMods: [${xteaParams.keyMods.join(', ')}]`);
      log(`  delta: 0x${(keyResult.delta >>> 0).toString(16)}, rounds: ${keyResult.rounds}`);
      log(`  Template: ${template}`);

      // ── Step 6: Decrypt Chrome's collect and detect structure ──
      log('Step 6: Decrypt Chrome collect + detect field order...');

      let cdFieldOrder = null;
      let hashPosition = -1;
      let serializationDiffs = [];
      let headerSplit = null;
      let chromeCdFieldCount = null;
      let fieldOrderMatchCount = null;
      let strippedCd = null;
      let hashPadding = null;

      if (chromeCollect) {
        const fullDecrypt = decryptCollect(chromeCollect, xteaParams);

        if (fullDecrypt.parsed) {
          log(`  Full decryption SUCCESS -- valid JSON`);

          if (fullDecrypt.parsed.cd) {
            chromeCdFieldCount = fullDecrypt.parsed.cd.length;
            log(`  Chrome cd: ${chromeCdFieldCount} fields`);

            // Detect field order
            const fieldResult = matchFieldOrder(fullDecrypt.parsed.cd);
            cdFieldOrder = fieldResult.fieldOrder;
            fieldOrderMatchCount = fieldResult.fieldOrder.length - fieldResult.unmatchedCount;
            log(`  Field order: matched ${fieldOrderMatchCount}/${fieldResult.fieldOrder.length} fields (${fieldResult.unmatchedCount} unmatched)`);

            // Detect ALL hash artifact positions
            const hashPositions = detectAllHashPositions(fullDecrypt.parsed.cd);
            hashPosition = hashPositions.length > 0 ? hashPositions[0] : -1; // keep first for backward compat
            log(`  Hash positions: ${hashPositions.length > 0 ? `[${hashPositions.join(', ')}]` : 'none found'}`);

            // Detect serialization diffs
            serializationDiffs = detectSerializationDiffs(fullDecrypt.plaintext, fullDecrypt.parsed.cd);
            log(`  Serialization diffs: ${serializationDiffs.length} fields differ`);

            // Use Chrome's full cd array for cdArrayOverride (DON'T strip hash artifacts)
            // Chrome's cd string includes [[4,-1,-1,ts,0,0,0,0]] inline; our buildHashChunk
            // generates the separate hash segment independently, so both appear in the token.
            strippedCd = [...fullDecrypt.parsed.cd];
            log(`  Hash positions: [${hashPositions.join(', ')}] (kept in cd for cdArrayOverride)`);
            log(`  Using full Chrome cd: ${strippedCd.length} fields for cdArrayOverride`);
          }

          if (fullDecrypt.parsed.sd) {
            log(`  Chrome sd keys: ${Object.keys(fullDecrypt.parsed.sd).join(', ')}`);
          }
        } else {
          log(`  Full decryption FAILED -- not valid JSON`);
          log(`  Plaintext preview: ${fullDecrypt.plaintext.substring(0, 100)}`);
        }

        // Analyze header segment
        const headerPlaintext = decryptHeaderSegment(chromeCollect, xteaParams);
        const headerAnalysis = analyzeHeaderSplit(headerPlaintext);
        headerSplit = {
          strategy: headerAnalysis.strategy,
          contentLength: headerAnalysis.contentLength,
          paddingLength: headerAnalysis.paddingLength,
        };
        log(`  Header: strategy=${headerAnalysis.strategy}, content=${headerAnalysis.contentLength}, padding=${headerAnalysis.paddingLength}`);
      } else {
        log('  No Chrome collect to analyze (will use defaults)');
      }

      // ── Step 6b: Pre-encryption cd string comparison ──
      let cdStringComparison = null;
      if (strippedCd && chromeCollect) {
        log('Step 6b: Pre-encryption cd string comparison...');
        try {
          // Extract Chrome's RAW cd string from the full decrypted plaintext
          const fullDecrypt = decryptCollect(chromeCollect, xteaParams);
          const chromePlaintext = fullDecrypt.plaintext;

          // The plaintext is the concatenation of all decrypted segments.
          // The cd portion starts with '{"cd":[' and we need to find where it ends.
          // The sd portion follows, starting with '"sd":{' (the leading '{' was stripped
          // by buildSdString, so the boundary is '}' followed by '"sd":').
          // Look for the boundary: '}"sd":' or ']}"sd":' in the plaintext.
          let chromeCdString = '';
          const sdBoundary = chromePlaintext.indexOf('}"sd":');
          if (sdBoundary >= 0) {
            // cd string goes up to and including the '}' before '"sd":'
            chromeCdString = chromePlaintext.substring(0, sdBoundary + 1);
          } else {
            // Fallback: try to find just the cd portion by looking for '{"cd":['
            const cdStart = chromePlaintext.indexOf('{"cd":[');
            if (cdStart >= 0) {
              // Find the matching ']}' ending
              const cdEnd = chromePlaintext.lastIndexOf(']}');
              if (cdEnd >= 0) {
                chromeCdString = chromePlaintext.substring(cdStart, cdEnd + 2);
              } else {
                chromeCdString = chromePlaintext;
              }
            } else {
              log('  WARNING: Could not find cd portion in Chrome plaintext');
              chromeCdString = chromePlaintext;
            }
          }

          // ── Hash field padding analysis ──
          // Extract Chrome's hash padding BEFORE building our cd string so we can match it
          const hashPosForPadding = strippedCd ? detectAllHashPositions(strippedCd) : [];
          if (hashPosForPadding.length > 0) {
            log(`  Hash field padding analysis:`);
            for (const hpos of hashPosForPadding) {
              const chromeFieldRaw = extractRawCdField(chromeCdString, hpos);
              if (chromeFieldRaw !== null) {
                log(`    Chrome hash field[${hpos}]: "${chromeFieldRaw}" (${chromeFieldRaw.length} chars)`);
                const trimmed = chromeFieldRaw.replace(/\s+$/, '');
                const trailingSpaces = chromeFieldRaw.length - trimmed.length;
                log(`    Chrome hash trimmed: "${trimmed}" (${trimmed.length} chars) + ${trailingSpaces} trailing spaces`);
                hashPadding = { totalSize: chromeFieldRaw.length };
                log(`    Setting hashPadding.totalSize = ${hashPadding.totalSize}`);
              } else {
                log(`    Chrome hash field[${hpos}]: EXTRACTION FAILED`);
              }
            }
          }

          // Build OUR cd string with hash padding to match Chrome
          const serOverrides = buildSerializationOverrides(serializationDiffs);
          const ourCdString = buildCdString(strippedCd, serOverrides, hashPadding);

          log(`  Our cd string length:    ${ourCdString.length}`);
          log(`  Chrome cd string length: ${chromeCdString.length}`);
          log(`  Length diff: ${ourCdString.length - chromeCdString.length} chars`);

          // Char-by-char diff
          const cdDiff = diffPlaintext(ourCdString, chromeCdString);

          if (cdDiff.firstDivergence >= 0) {
            log(`  First divergence at char ${cdDiff.firstDivergence}:`);
            log(`    Ours:   ...${cdDiff.aContext}...`);
            log(`    Chrome: ...${cdDiff.bContext}...`);

            // Identify which cd field the divergence falls in
            const ourField = identifyCdField(ourCdString, cdDiff.firstDivergence);
            const chromeFieldInfo = identifyCdField(chromeCdString, cdDiff.firstDivergence);

            if (ourField) {
              log(`    Our field[${ourField.fieldIndex}]: ${ourField.fieldContent.substring(0, 120)}`);
            }
            if (chromeFieldInfo) {
              log(`    Chrome field[${chromeFieldInfo.fieldIndex}]: ${chromeFieldInfo.fieldContent.substring(0, 120)}`);
            }

            // Show surrounding fields for deeper context
            if (ourField || chromeFieldInfo) {
              const fieldIdx = (ourField || chromeFieldInfo).fieldIndex;
              log(`  Detailed field comparison around divergence (field ${fieldIdx}):`);

              // Parse both cd arrays for field-by-field comparison
              const ourParsed = JSON.parse(ourCdString);
              const chromeParsed = JSON.parse(chromeCdString);
              const ourArr = ourParsed.cd || [];
              const chromeArr = chromeParsed.cd || [];

              // Compare fields around the divergence point
              const startField = Math.max(0, fieldIdx - 2);
              const endField = Math.min(Math.max(ourArr.length, chromeArr.length), fieldIdx + 5);
              for (let fi = startField; fi < endField; fi++) {
                const ourVal = fi < ourArr.length ? JSON.stringify(ourArr[fi]) : '<missing>';
                const chromeVal = fi < chromeArr.length ? JSON.stringify(chromeArr[fi]) : '<missing>';
                const marker = ourVal !== chromeVal ? ' <<<DIFF' : '';
                log(`    [${fi}] our=${ourVal.substring(0, 80)} | chrome=${chromeVal.substring(0, 80)}${marker}`);
              }
            }
          } else {
            log(`  cd strings are IDENTICAL`);
          }

          // Log hash field comparison with padding applied
          if (hashPosForPadding.length > 0) {
            for (const hpos of hashPosForPadding) {
              const ourFieldRaw = extractRawCdField(ourCdString, hpos);
              const chromeFieldRaw = extractRawCdField(chromeCdString, hpos);
              if (ourFieldRaw !== null) {
                log(`    Our hash field[${hpos}] (with padding):    "${ourFieldRaw}" (${ourFieldRaw.length} chars)`);
              }
              if (chromeFieldRaw !== null && ourFieldRaw !== null) {
                log(`    Hash field match: ${ourFieldRaw === chromeFieldRaw ? 'IDENTICAL' : 'DIFFER'}`);
              }
            }
          }

          // Also log first 200 chars of each for visual inspection
          log(`  Our cd (first 200):    ${ourCdString.substring(0, 200)}`);
          log(`  Chrome cd (first 200): ${chromeCdString.substring(0, 200)}`);

          cdStringComparison = {
            ourLength: ourCdString.length,
            chromeLength: chromeCdString.length,
            lengthDiff: ourCdString.length - chromeCdString.length,
            firstDivergence: cdDiff.firstDivergence,
            ourContext: cdDiff.aContext,
            chromeContext: cdDiff.bContext,
            ourFieldIndex: identifyCdField(ourCdString, cdDiff.firstDivergence)?.fieldIndex ?? null,
            chromeFieldIndex: identifyCdField(chromeCdString, cdDiff.firstDivergence)?.fieldIndex ?? null,
          };
        } catch (cdCompErr) {
          log(`  cd string comparison FAILED: ${cdCompErr.message}`);
          cdStringComparison = { error: cdCompErr.message };
        }
      }

      // ── Step 7: Solve slider via OpenCV ──
      log('Step 7: Solve slider via OpenCV...');
      const rawOffset = await solveSlider(interceptedImages.bg, interceptedImages.slice);
      log(`  rawOffset: ${rawOffset}`);

      const calibration = CALIBRATION_OFFSET + Math.floor(Math.random() * 11) - 5;
      const xAnswer = Math.round(rawOffset * DEFAULT_RATIO + calibration);
      const ans = `${xAnswer},${DEFAULT_SLIDE_Y};`;
      log(`  ans: ${ans}`);

      // ── Step 8: Generate standalone collect token ──
      log('Step 8: Generate standalone collect token...');
      const now = Date.now();
      const nowSec = Math.round(now / 1000);
      const behavioralEvents = generateBehavioralEvents(xAnswer, DEFAULT_SLIDE_Y, now);

      const profileOverrides = Object.assign({}, profile, {
        pageUrl: showUrl,
        timestamp: nowSec,
        timestampCollectionStart: nowSec,
        timestampCollectionEnd: nowSec + 3,
        canvasHash: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
        mathFingerprint: Math.random(),
        performanceHash: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
      });

      // Chrome's sd only contains {od, clientType}
      const slideSd = { od: 'C', clientType: '' };

      const collectOpts = {
        appid: DEFAULT_AID,
        nonce: nonce,
        sdOverride: slideSd,
        timestamp: now,
      };

      if (strippedCd) {
        // Use Chrome's exact cd values via cdArrayOverride
        collectOpts.cdArrayOverride = strippedCd;
        log(`  Using cdArrayOverride with Chrome's full cd (${strippedCd.length} fields, hash kept)`);
        // Do NOT pass behavioralEvents — Chrome's pre-solve TDC.getData() has none
        // Do NOT pass cdFieldOrder — cdArrayOverride already in Chrome's order
      } else {
        // Fallback: standalone generation (original behavior)
        log(`  WARNING: No Chrome cd available, falling back to standalone generation`);
        collectOpts.behavioralEvents = behavioralEvents;

        // Apply detected field order
        if (cdFieldOrder) {
          collectOpts.cdFieldOrder = cdFieldOrder;
          log(`  Using cdFieldOrder from live detection (${cdFieldOrder.length} entries, ${fieldOrderMatchCount} matched)`);
        } else if (vmInfo.caseCount === 95) {
          // Default Template A field order
          collectOpts.cdFieldOrder = [0,4,23,44,21,11,39,26,1,28,5,47,24,27,8,46,12,30,-1,31,6,15,16,3,18,7,19,38,17,48,49,40,45,2,35,53,42,54,52,9,29,20,51,43,41,34,36,33,57,56,10,14,32,13,37,-1,-1,22,50];
          log('  Using default Template A cdFieldOrder');
        }
      }

      if (serializationDiffs.length > 0) {
        collectOpts.serializationDiffs = serializationDiffs;
        log(`  Using serializationDiffs from live detection (${serializationDiffs.length} diffs)`);
      }

      if (headerSplit && headerSplit.strategy === 'field-boundary') {
        collectOpts.headerSplit = {
          strategy: 'field-boundary',
          contentLength: headerSplit.contentLength,
        };
        log(`  Using field-boundary headerSplit (contentLength=${headerSplit.contentLength})`);
      }

      if (hashPadding) {
        collectOpts.hashPadding = hashPadding;
        log(`  Using hashPadding from Chrome cd analysis (totalSize=${hashPadding.totalSize})`);
      }

      const collectEncoded = generateCollect(profileOverrides, xteaParams, collectOpts);

      // Decode URI-encoded collect for POST fields
      let collectVal = collectEncoded;
      if (collectVal.includes('%')) {
        try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* leave as-is */ }
      }
      log(`  Collect length: ${collectVal.length} chars`);

      // Size comparison with Chrome's collect (total + per-segment)
      // Compute sdString length for sig segment sizing
      const sdStringForSizing = buildSdString(slideSd);
      const sdStringLen = sdStringForSizing.length;
      log(`  sdString length for segment parsing: ${sdStringLen} ("${sdStringForSizing.substring(0, 40)}...")`);

      const standaloneSegments = parseSegmentSizes(collectVal, sdStringLen);
      log(`  Standalone segments (b64): header=${standaloneSegments.header}, hash=${standaloneSegments.hash}, cdBody=${standaloneSegments.cdBody}, sig=${standaloneSegments.sig}, total=${standaloneSegments.total}`);

      let segmentComparison = null;
      if (chromeCollect) {
        const chromeSegments = parseSegmentSizes(chromeCollect, sdStringLen);
        log(`  Chrome segments (b64):     header=${chromeSegments.header}, hash=${chromeSegments.hash}, cdBody=${chromeSegments.cdBody}, sig=${chromeSegments.sig}, total=${chromeSegments.total}`);

        segmentComparison = {
          header: { standalone: standaloneSegments.header, chrome: chromeSegments.header, diff: standaloneSegments.header - chromeSegments.header },
          hash: { standalone: standaloneSegments.hash, chrome: chromeSegments.hash, diff: standaloneSegments.hash - chromeSegments.hash },
          cdBody: { standalone: standaloneSegments.cdBody, chrome: chromeSegments.cdBody, diff: standaloneSegments.cdBody - chromeSegments.cdBody },
          sig: { standalone: standaloneSegments.sig, chrome: chromeSegments.sig, diff: standaloneSegments.sig - chromeSegments.sig },
          total: { standalone: standaloneSegments.total, chrome: chromeSegments.total, diff: standaloneSegments.total - chromeSegments.total },
          sdStringLength: sdStringLen,
        };

        log('  Segment comparison:');
        for (const name of ['header', 'hash', 'cdBody', 'sig', 'total']) {
          const s = segmentComparison[name];
          const diffStr = s.diff > 0 ? `+${s.diff}` : String(s.diff);
          log(`    ${name.padEnd(8)}: standalone=${String(s.standalone).padEnd(5)}, chrome=${String(s.chrome).padEnd(5)}, diff=${diffStr}`);
        }

        // ── cdBody plaintext diff ──
        log('  cdBody plaintext diff:');
        try {
          const standaloneCdB64 = extractCdBodyB64(collectVal, sdStringLen);
          const chromeCdB64 = extractCdBodyB64(chromeCollect, sdStringLen);

          const standalonePlain = decryptSegment(standaloneCdB64, xteaParams);
          const chromePlain = decryptSegment(chromeCdB64, xteaParams);

          // Strip trailing null padding for comparison
          const standaloneClean = standalonePlain.replace(/\0+$/, '');
          const chromeClean = chromePlain.replace(/\0+$/, '');

          const diff = diffPlaintext(standaloneClean, chromeClean);

          log(`    Standalone cdBody plaintext: ${diff.aLength} chars`);
          log(`    Chrome cdBody plaintext:     ${diff.bLength} chars`);
          log(`    Length diff: ${diff.aLength - diff.bLength} chars`);

          let standaloneField = null;
          let chromeField = null;

          if (diff.firstDivergence >= 0) {
            log(`    First divergence at char ${diff.firstDivergence}:`);
            log(`      Standalone: ...${diff.aContext}...`);
            log(`      Chrome:     ...${diff.bContext}...`);

            // Identify which cd field the divergence falls in
            standaloneField = identifyCdField(standaloneClean, diff.firstDivergence);
            chromeField = identifyCdField(chromeClean, diff.firstDivergence);

            if (standaloneField) {
              log(`      Standalone field[${standaloneField.fieldIndex}]: ${standaloneField.fieldContent.substring(0, 80)}`);
            }
            if (chromeField) {
              log(`      Chrome field[${chromeField.fieldIndex}]: ${chromeField.fieldContent.substring(0, 80)}`);
            }
          } else {
            log(`    cdBody plaintext is IDENTICAL`);
          }

          // Store in segmentComparison for results JSON
          segmentComparison.cdBodyDiff = {
            standaloneLength: diff.aLength,
            chromeLength: diff.bLength,
            firstDivergence: diff.firstDivergence,
            standaloneContext: diff.aContext,
            chromeContext: diff.bContext,
            standaloneFieldIndex: standaloneField ? standaloneField.fieldIndex : null,
            chromeFieldIndex: chromeField ? chromeField.fieldIndex : null,
          };
        } catch (diffErr) {
          log(`    cdBody diff FAILED: ${diffErr.message}`);
          segmentComparison.cdBodyDiff = { error: diffErr.message };
        }
      }

      // ── Step 9: Generate vData via Chrome ──
      log('Step 9: Generate vData via Chrome...');

      // Build the verify POST fields
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

      // Generate vData inside a fresh Chrome page
      let vData;
      let serializedBody;
      const vdataPage = await browser.newPage();
      await vdataPage.setUserAgent(userAgent);
      try {
        await vdataPage.goto('https://t.captcha.qq.com/favicon.ico', {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        }).catch(() => {
          // favicon may 404 -- that's fine, we just need the origin set
        });

        const chromeResult = await vdataPage.evaluate(
          (postFieldsJson, jqSrc, vmSlideSrc) => {
            return new Promise((resolve, reject) => {
              try {
                const debugLog = [];

                // Hook XHR.send BEFORE loading vm-slide
                let capturedBody = null;
                const origOpen = XMLHttpRequest.prototype.open;
                const origSend = XMLHttpRequest.prototype.send;

                XMLHttpRequest.prototype.open = function() {
                  debugLog.push('XHR.open called: ' + Array.from(arguments).join(', '));
                  return origOpen.apply(this, arguments);
                };

                XMLHttpRequest.prototype.send = function(body) {
                  debugLog.push('XHR.send called, body length: ' + (body ? body.length : 'null'));
                  capturedBody = body;
                  // Don't actually send -- just capture
                };

                // Load jQuery if not already present
                if (!window.jQuery) {
                  try {
                    (new Function(jqSrc))();
                    debugLog.push('jQuery loaded: ' + (typeof window.jQuery));
                  } catch (jqErr) {
                    debugLog.push('jQuery load error: ' + jqErr.message);
                  }
                } else {
                  debugLog.push('jQuery already present');
                }

                // Load vm-slide
                try {
                  (new Function(vmSlideSrc))();
                  debugLog.push('vm-slide loaded OK');
                } catch (vmErr) {
                  debugLog.push('vm-slide load error: ' + vmErr.message);
                }

                // Parse the post fields
                const postFields = JSON.parse(postFieldsJson);
                debugLog.push('postFields parsed, keys: ' + Object.keys(postFields).length);

                // Fire jQuery.ajax -- vm-slide intercepts, computes vData, appends it
                try {
                  jQuery.ajax({
                    type: 'POST',
                    url: '/cap_union_new_verify',
                    data: postFields,
                    timeout: 15000,
                    error: function(xhr, status, err) {
                      debugLog.push('jQuery.ajax error callback: ' + status + ' ' + (err || ''));
                    },
                  });
                  debugLog.push('jQuery.ajax called');
                } catch (ajaxErr) {
                  debugLog.push('jQuery.ajax exception: ' + ajaxErr.message);
                }

                // Restore original XHR methods
                XMLHttpRequest.prototype.open = origOpen;
                XMLHttpRequest.prototype.send = origSend;

                if (!capturedBody) {
                  reject(new Error('XHR.send was never called -- debug: ' + debugLog.join(' | ')));
                  return;
                }

                // Extract vData from captured body
                const vdataIdx = capturedBody.indexOf('&vData=');
                const vData = vdataIdx >= 0
                  ? capturedBody.substring(vdataIdx + 7)
                  : '';
                const serializedBody = vdataIdx >= 0
                  ? capturedBody.substring(0, vdataIdx)
                  : capturedBody;

                resolve({
                  vData: vData,
                  serializedBody: serializedBody,
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
        log(`  vData generated: ${vData.length} chars`);
        log(`  vData (first 60): ${vData.slice(0, 60)}...`);
        log(`  Full body length from Chrome: ${chromeResult.fullBodyLength}`);
      } finally {
        await vdataPage.close().catch(() => {});
      }

      const finalBody = serializedBody + '&vData=' + vData;
      log(`  Final body length: ${finalBody.length}`);

      // ── Step 10: Submit verify via Chrome fetch() ──
      log('Step 10: Submit verify via Chrome fetch()...');
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

      // ── Step 11: Parse result ──
      log('Step 11: Parse result...');
      if (verifyResult.error) {
        throw new Error(`Chrome fetch() failed: ${verifyResult.error}`);
      }

      log(`  HTTP ${verifyResult.status}`);
      log(`  Response: ${verifyResult.text.slice(0, 300)}`);

      let verifyData;
      try {
        verifyData = JSON.parse(verifyResult.text);
      } catch (_) {
        // Try JSONP parse
        const jsonStr = verifyResult.text
          .replace(/^[^(]+\(/, '')
          .replace(/\)\s*;?\s*$/, '');
        verifyData = JSON.parse(jsonStr);
      }

      const errorCode = parseInt(verifyData.errorCode, 10);
      const ticket = verifyData.ticket || null;

      log(`  errorCode: ${errorCode}`);
      log(`  ticket: ${ticket ? ticket.slice(0, 40) + '...' : 'null'}`);

      lastResult = {
        timestamp: new Date().toISOString(),
        attempt: attempt,
        tdcName: tdcName,
        template: template,
        caseCount: vmInfo.caseCount,
        key: keyResult.key.map(k => '0x' + (k >>> 0).toString(16).padStart(8, '0')),
        keyMods: xteaParams.keyMods,
        chromeCdFieldCount: chromeCdFieldCount,
        fieldOrderMatchCount: fieldOrderMatchCount,
        hashPosition: hashPosition,
        headerSplit: headerSplit,
        serializationDiffCount: serializationDiffs.length,
        sliderOffset: rawOffset,
        collectLength: collectVal.length,
        chromeCollectLength: chromeCollect ? chromeCollect.length : null,
        collectSizeDiff: chromeCollect ? collectVal.length - chromeCollect.length : null,
        segmentComparison: segmentComparison,
        cdStringComparison: cdStringComparison,
        usedCdArrayOverride: !!strippedCd,
        vDataLength: vData.length,
        httpStatus: verifyResult.status,
        errorCode: errorCode,
        ticket: ticket,
        randstr: verifyData.randstr || null,
        verifyMethod: strippedCd ? 'cdArrayOverride + Chrome TLS' : 'standalone collect + Chrome TLS',
      };

      // Write results
      const outputPath = path.join(PROJECT_ROOT, 'output', 'live-captcha-submit.json');
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(lastResult, null, 2) + '\n', 'utf8');
      log(`  Results written to ${outputPath}`);

      if (errorCode === 0) {
        log('\n=== SUCCESS === Standalone collect token accepted!');
        break;
      }

      log(`  Failed with errorCode ${errorCode}, ${attempt < maxRetries ? 'retrying...' : 'no more retries'}`);
      lastError = new Error(`CAPTCHA verify returned errorCode ${errorCode}`);

    } catch (err) {
      log(`  ERROR: ${err.message}`);
      lastError = err;

      lastResult = {
        timestamp: new Date().toISOString(),
        attempt: attempt,
        errorCode: -1,
        ticket: null,
        error: err.message,
        verifyMethod: 'standalone collect + Chrome TLS',
      };
    } finally {
      await page.close().catch(() => {});
    }

    // Wait between attempts
    if (attempt < maxRetries) {
      log('Waiting 3s before next attempt...');
      await sleep(3000);
    }
  }

  // Write final results
  if (lastResult) {
    const outputPath = path.join(PROJECT_ROOT, 'output', 'live-captcha-submit.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(lastResult, null, 2) + '\n', 'utf8');
    log(`Final results written to ${outputPath}`);
  }

  await browser.close().catch(() => {});

  // Print summary
  log('\n========== SUMMARY ==========');
  if (lastResult) {
    if (lastResult.error) {
      log(`  FAILED: ${lastResult.error}`);
    } else {
      log(`  TDC_NAME: ${lastResult.tdcName}`);
      log(`  Template: ${lastResult.template} (${lastResult.caseCount} opcodes)`);
      log(`  Key: [${(lastResult.key || []).join(', ')}]`);
      log(`  keyMods: [${(lastResult.keyMods || []).join(', ')}]`);
      log(`  Chrome cd: ${lastResult.chromeCdFieldCount || 'N/A'} fields`);
      log(`  Field order matched: ${lastResult.fieldOrderMatchCount || 'N/A'}`);
      log(`  Header split: ${lastResult.headerSplit ? lastResult.headerSplit.strategy : 'N/A'}`);
      log(`  Serialization diffs: ${lastResult.serializationDiffCount || 0}`);
      log(`  Slider offset: ${lastResult.sliderOffset || 'N/A'}px`);
      log(`  Collect length: ${lastResult.collectLength || 'N/A'} chars`);
      log(`  Chrome collect length: ${lastResult.chromeCollectLength || 'N/A'} chars`);
      log(`  Collect size diff: ${lastResult.collectSizeDiff != null ? (lastResult.collectSizeDiff > 0 ? '+' : '') + lastResult.collectSizeDiff : 'N/A'}`);
      log(`  Used cdArrayOverride: ${lastResult.usedCdArrayOverride ? 'YES' : 'NO'}`);
      log(`  vData generated: ${lastResult.vDataLength || 'N/A'} chars`);
      log(`  HTTP ${lastResult.httpStatus}`);
      log(`  errorCode: ${lastResult.errorCode}`);
      if (lastResult.errorCode === 0) {
        log(`  ticket: ${lastResult.ticket}`);
        log('  >>> STANDALONE COLLECT TOKEN ACCEPTED <<<');
      } else if (lastResult.errorCode === 9) {
        log('  >>> errorCode 9 -- token validation failed <<<');
      } else {
        log(`  >>> errorCode ${lastResult.errorCode} -- further investigation needed <<<`);
      }
    }
  }

  return lastResult;
}

// ═══════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════

const opts = parseArgs();

log('Live CAPTCHA Submit (standalone collect + Phase 22-24 fixes)');
log(`  headless: ${opts.headless}`);
log(`  maxRetries: ${opts.maxRetries}`);
log('');

solve(opts)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result && result.errorCode === 0 ? 0 : 1);
  })
  .catch((err) => {
    log(`Fatal error: ${err.message}`);
    console.error(err);
    process.exit(2);
  });
