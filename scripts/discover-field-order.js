'use strict';

/**
 * discover-field-order.js — Chrome cd Field Order Discovery
 *
 * Captures Chrome's decrypted cd array from a live CAPTCHA session, then
 * infers the cdFieldOrder mapping by comparing Chrome's field values against
 * our known 59-field collector schema.
 *
 * Flow:
 *   1. Launch Puppeteer with stealth plugin
 *   2. Prehandle via Node.js HTTP
 *   3. Navigate to show page + intercept tdc.js
 *   4. Call TDC.getData(true) in Chrome — capture encrypted collect token
 *   5. Extract TDC_NAME + pipeline key extraction
 *   6. Decrypt Chrome's collect token → extract raw cd array
 *   7. Remove hash artifact at cd[11] → 59 Chrome fields
 *   8. Match each Chrome field against collector schema → cdFieldOrder
 *   9. Save results to output/field-order-discovery.json
 *
 * Usage:
 *   node scripts/discover-field-order.js
 *   node scripts/discover-field-order.js --headful
 */

const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { CaptchaClient } = require('../puppeteer/captcha-client');
const { extractTdcName, extractEks } = require('../scraper/tdc-utils');
const TemplateCache = require('../scraper/template-cache');
const { COLLECTOR_SCHEMA } = require('../token/collector-schema');

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
  process.stderr.write(`[field-order] ${msg}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { headless: true };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headful') opts.headless = false;
  }
  return opts;
}

// ═══════════════════════════════════════════════════════════════════════
// XTEA Decryption (copied from chrome-cd-inject.js)
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
// Field Matching Engine
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a name→index lookup from the collector schema.
 */
function buildSchemaLookup() {
  const lookup = {};
  for (const entry of COLLECTOR_SCHEMA) {
    lookup[entry.name] = entry.index;
  }
  return lookup;
}

/**
 * Step A: Signature matching — identify fields by distinctive value structure.
 * Returns { schemaIdx, field, confidence, reason } or null.
 */
function signatureMatch(value) {
  // String containing "Mozilla/5.0" → userAgent (31)
  if (typeof value === 'string' && value.includes('Mozilla/5.0')) {
    return { schemaIdx: 31, field: 'userAgent', confidence: 'high', reason: 'contains Mozilla/5.0' };
  }

  // Array of 2 locale strings like ["en-US", "en"] → languages (6)
  if (Array.isArray(value) && value.length >= 1 && value.length <= 5 &&
      value.every(v => typeof v === 'string') &&
      value.some(v => /^[a-z]{2}(-[A-Z]{2})?$/.test(v))) {
    return { schemaIdx: 6, field: 'languages', confidence: 'high', reason: 'array of locale strings' };
  }

  // Array of 2 numbers [width, height] → screenResolution (9)
  if (Array.isArray(value) && value.length === 2 &&
      typeof value[0] === 'number' && typeof value[1] === 'number' &&
      value[0] >= 320 && value[1] >= 240) {
    return { schemaIdx: 9, field: 'screenResolution', confidence: 'high', reason: 'array of 2 numbers [width, height]' };
  }

  // Array of objects with key "codec" and "support" → videoCodecs (12) or audioCodecs (29)
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
    if ('codec' in value[0] && 'support' in value[0]) {
      // Distinguish video vs audio by codec names
      const codecs = value.map(v => v.codec || '').join(',');
      if (/H\.264|VP[89]|AV1|HEVC|Theora|MPEG/i.test(codecs)) {
        return { schemaIdx: 12, field: 'videoCodecs', confidence: 'high', reason: 'array of objects with codec+support (video codecs)' };
      }
      if (/AAC|MP3|OGG|FLAC|Opus|WAV|PCM/i.test(codecs)) {
        return { schemaIdx: 29, field: 'audioCodecs', confidence: 'high', reason: 'array of objects with codec+support (audio codecs)' };
      }
      // Generic codec array — could be either, try video first
      return { schemaIdx: 12, field: 'videoCodecs', confidence: 'medium', reason: 'array of objects with codec+support (generic)' };
    }

    // Array of objects with "type" and "suffixes" → mimeTypes (19)
    if ('type' in value[0] && 'suffixes' in value[0]) {
      return { schemaIdx: 19, field: 'mimeTypes', confidence: 'high', reason: 'array of objects with type+suffixes' };
    }

    // Array of objects with "name" and "filename" → plugins (23)
    if ('name' in value[0] && 'filename' in value[0]) {
      return { schemaIdx: 23, field: 'plugins', confidence: 'high', reason: 'array of objects with name+filename' };
    }
  }

  // Object with key "nt_vc_output" → audioFingerprint (18)
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if ('nt_vc_output' in value) {
      return { schemaIdx: 18, field: 'audioFingerprint', confidence: 'high', reason: 'object with nt_vc_output key' };
    }

    // Object with "architecture" and "bitness" → highEntropyValues (37)
    if ('architecture' in value && 'bitness' in value) {
      return { schemaIdx: 37, field: 'highEntropyValues', confidence: 'high', reason: 'object with architecture+bitness' };
    }

    // Object with "brands" and "mobile" but NOT "architecture" → userAgentData (46)
    if ('brands' in value && 'mobile' in value && !('architecture' in value)) {
      return { schemaIdx: 46, field: 'userAgentData', confidence: 'high', reason: 'object with brands+mobile (no architecture)' };
    }

    // Object with "timeZone" and "calendar" → intlOptions (34)
    if ('timeZone' in value && 'calendar' in value) {
      return { schemaIdx: 34, field: 'intlOptions', confidence: 'high', reason: 'object with timeZone+calendar' };
    }

    // Object with "quota" → storageEstimate (21)
    if ('quota' in value) {
      return { schemaIdx: 21, field: 'storageEstimate', confidence: 'high', reason: 'object with quota key' };
    }

    // Object with "_state" and NOT "quota" → permissionStatus (42)
    if ('_state' in value && !('quota' in value)) {
      return { schemaIdx: 42, field: 'permissionStatus', confidence: 'high', reason: 'object with _state (no quota)' };
    }
  }

  // String matching ANGLE/SwiftShader → webglRenderer (40)
  if (typeof value === 'string' && (/ANGLE/i.test(value) || /SwiftShader/i.test(value))) {
    return { schemaIdx: 40, field: 'webglRenderer', confidence: 'high', reason: 'contains ANGLE or SwiftShader' };
  }

  // String matching screen composite pattern → screenComposite (47)
  if (typeof value === 'string' && /^\d+-\d+-\d+-\d+-\*-\*-\|-\*$/.test(value)) {
    return { schemaIdx: 47, field: 'screenComposite', confidence: 'high', reason: 'matches screenComposite pattern' };
  }

  // String matching timezone offset → timezoneOffset (26)
  if (typeof value === 'string' && /^[+-]\d{2}$/.test(value)) {
    return { schemaIdx: 26, field: 'timezoneOffset', confidence: 'high', reason: 'matches timezone offset pattern' };
  }

  // String "UTF-8" → characterSet (32)
  if (value === 'UTF-8') {
    return { schemaIdx: 32, field: 'characterSet', confidence: 'high', reason: 'value is UTF-8' };
  }

  // String "top" or "child" → frameStatus (41)
  if (value === 'top' || value === 'child' || value === 'frame' || value === 'cross-origin') {
    return { schemaIdx: 41, field: 'frameStatus', confidence: 'high', reason: `value is "${value}" (frame status)` };
  }

  // String "98k" → internalToken (38)
  if (value === '98k') {
    return { schemaIdx: 38, field: 'internalToken', confidence: 'high', reason: 'value is "98k"' };
  }

  // Short platform string → platform (48)
  if (typeof value === 'string' && (/x86_64/.test(value) || value === 'Win32' || value === 'MacIntel' || value === 'Linux x86_64')) {
    return { schemaIdx: 48, field: 'platform', confidence: 'high', reason: 'matches platform string pattern' };
  }

  // Vendor string → vendor (36)
  if (typeof value === 'string' && /Google Inc/i.test(value)) {
    return { schemaIdx: 36, field: 'vendor', confidence: 'high', reason: 'contains "Google Inc"' };
  }

  // Color gamut → colorGamut (28)
  if (typeof value === 'string' && /^(srgb|p3|rec2020)$/i.test(value)) {
    return { schemaIdx: 28, field: 'colorGamut', confidence: 'high', reason: 'matches color gamut value' };
  }

  // URL pattern → pageUrl (22)
  if (typeof value === 'string' && /^https?:\/\//.test(value)) {
    return { schemaIdx: 22, field: 'pageUrl', confidence: 'high', reason: 'matches URL pattern' };
  }

  // Screen position "X;Y" → screenPosition (33)
  if (typeof value === 'string' && /^\d+;\d+$/.test(value)) {
    return { schemaIdx: 33, field: 'screenPosition', confidence: 'high', reason: 'matches X;Y screen position pattern' };
  }

  // OS platform strings → osPlatform (1)
  if (typeof value === 'string' && /^(windows|macos|linux|android|ios|unknown)$/.test(value)) {
    return { schemaIdx: 1, field: 'osPlatform', confidence: 'high', reason: `matches OS platform "${value}"` };
  }

  // Connection type → connectionType (39)
  if (typeof value === 'string' && /^(4g|3g|2g|slow-2g|unknown)$/.test(value)) {
    // Could be connectionType (39) — but "unknown" also matches osPlatform
    // Only match if it's a network type
    if (value !== 'unknown') {
      return { schemaIdx: 39, field: 'connectionType', confidence: 'medium', reason: `network connection type "${value}"` };
    }
  }

  return null;
}

/**
 * Step B: Value-based heuristics for numeric/simple fields.
 * Uses value characteristics + position hints.
 * Returns array of { schemaIdx, field, confidence, reason } candidates.
 */
function heuristicMatch(value, chromeIdx, totalFields) {
  const candidates = [];

  if (typeof value === 'number') {
    // Timestamps (large numbers ~1.7 billion, unix seconds)
    if (value > 1700000000 && value < 2000000000) {
      candidates.push({ schemaIdx: 16, field: 'timestampInit', confidence: 'medium', reason: `unix timestamp ${value}` });
      candidates.push({ schemaIdx: 53, field: 'timestampCollectionStart', confidence: 'medium', reason: `unix timestamp ${value}` });
      candidates.push({ schemaIdx: 52, field: 'timestampCollectionEnd', confidence: 'medium', reason: `unix timestamp ${value}` });
    }

    // Canvas/performance hashes (large 32-bit integers, not timestamps)
    if (value > 100000 && value < 0xFFFFFFFF && !(value > 1700000000 && value < 2000000000)) {
      candidates.push({ schemaIdx: 15, field: 'canvasHash', confidence: 'low', reason: `large integer ${value} (hash candidate)` });
      candidates.push({ schemaIdx: 54, field: 'performanceHash', confidence: 'low', reason: `large integer ${value} (hash candidate)` });
    }

    // Floating point → mathFingerprint (17) or devicePixelRatio (10)
    if (!Number.isInteger(value)) {
      if (value > 0 && value < 1) {
        candidates.push({ schemaIdx: 17, field: 'mathFingerprint', confidence: 'high', reason: `float in (0,1) range: ${value}` });
      } else if (value >= 1 && value <= 4) {
        candidates.push({ schemaIdx: 10, field: 'devicePixelRatio', confidence: 'high', reason: `small float ${value} (pixel ratio)` });
      }
    }

    // Integer 1 → devicePixelRatio(10) if integer
    if (value === 1 && Number.isInteger(value)) {
      candidates.push({ schemaIdx: 10, field: 'devicePixelRatio', confidence: 'low', reason: 'integer 1 (could be pixelRatio)' });
      candidates.push({ schemaIdx: 0, field: 'callCounter', confidence: 'medium', reason: 'integer 1 (call counter first call)' });
      candidates.push({ schemaIdx: 13, field: 'localStorageAvail', confidence: 'low', reason: 'integer 1 (localStorage available)' });
    }

    // Integer 2 → touchSupport (2)
    if (value === 2) {
      candidates.push({ schemaIdx: 2, field: 'touchSupport', confidence: 'medium', reason: 'integer 2 (desktop touch flag)' });
    }

    // Integer 0 — many candidates
    if (value === 0) {
      candidates.push({ schemaIdx: 11, field: 'sessionStorageAvail', confidence: 'low', reason: 'integer 0' });
      candidates.push({ schemaIdx: 24, field: 'indexedDbAvail', confidence: 'low', reason: 'integer 0' });
      candidates.push({ schemaIdx: 27, field: 'adBlockDetected', confidence: 'low', reason: 'integer 0' });
      candidates.push({ schemaIdx: 30, field: 'webdriverFlag', confidence: 'low', reason: 'integer 0' });
      candidates.push({ schemaIdx: 45, field: 'headlessFlag', confidence: 'low', reason: 'integer 0' });
      candidates.push({ schemaIdx: 51, field: 'cookiesEnabled', confidence: 'low', reason: 'integer 0' });
      candidates.push({ schemaIdx: 56, field: 'canvasBlocked', confidence: 'low', reason: 'integer 0' });
      candidates.push({ schemaIdx: 14, field: 'maxTouchPoints', confidence: 'low', reason: 'integer 0 (no touch)' });
      candidates.push({ schemaIdx: 25, field: 'maxTouchPointsDup', confidence: 'low', reason: 'integer 0 (no touch dup)' });
    }

    // 20 → maxTouchPoints (14 or 25) — headless Chrome default
    if (value === 20) {
      candidates.push({ schemaIdx: 14, field: 'maxTouchPoints', confidence: 'medium', reason: 'integer 20 (headless Chrome default)' });
      candidates.push({ schemaIdx: 25, field: 'maxTouchPointsDup', confidence: 'medium', reason: 'integer 20 (headless Chrome default dup)' });
    }

    // 8 → hardwareConcurrency (8) or colorDepth (49)
    if (value === 8) {
      candidates.push({ schemaIdx: 8, field: 'hardwareConcurrency', confidence: 'medium', reason: 'integer 8 (CPU cores)' });
    }

    // 24 → colorDepth (49)
    if (value === 24 || value === 32) {
      candidates.push({ schemaIdx: 49, field: 'colorDepth', confidence: 'medium', reason: `integer ${value} (color depth)` });
    }

    // 600 → availHeight (44)
    if (value >= 400 && value <= 2000 && Number.isInteger(value)) {
      candidates.push({ schemaIdx: 44, field: 'availHeight', confidence: 'low', reason: `integer ${value} (screen dimension)` });
      candidates.push({ schemaIdx: 3, field: 'viewportWidth', confidence: 'low', reason: `integer ${value} (viewport dimension)` });
    }

    // 1023 → featureBitmask (57)
    if (value === 1023 || value === 0x3FF) {
      candidates.push({ schemaIdx: 57, field: 'featureBitmask', confidence: 'high', reason: 'integer 1023 (0x3FF bitmask)' });
    }
  }

  // Empty strings — many candidates
  if (typeof value === 'string' && value === '') {
    candidates.push({ schemaIdx: 5, field: 'flashFonts', confidence: 'low', reason: 'empty string' });
    candidates.push({ schemaIdx: 7, field: 'colorGamutLegacy', confidence: 'low', reason: 'empty string' });
    candidates.push({ schemaIdx: 20, field: 'webglImage', confidence: 'low', reason: 'empty string' });
    candidates.push({ schemaIdx: 43, field: 'webrtcIp', confidence: 'low', reason: 'empty string' });
    candidates.push({ schemaIdx: 50, field: 'doNotTrack', confidence: 'low', reason: 'empty string' });
    candidates.push({ schemaIdx: 55, field: 'cssOverflowResult', confidence: 'low', reason: 'empty string' });
    candidates.push({ schemaIdx: 58, field: 'errorLog', confidence: 'low', reason: 'empty string' });
    candidates.push({ schemaIdx: 39, field: 'connectionType', confidence: 'low', reason: 'empty string' });
  }

  // Long string that looks like a font list → detectedFonts (4)
  if (typeof value === 'string' && value.length > 20 && value.includes(',') &&
      /Arial|Courier|Times|Helvetica/i.test(value)) {
    candidates.push({ schemaIdx: 4, field: 'detectedFonts', confidence: 'high', reason: 'comma-separated font list' });
  }

  // Long base64-ish string → webglImage (20)
  if (typeof value === 'string' && value.length > 50 && /^[A-Za-z0-9+/=]+$/.test(value)) {
    candidates.push({ schemaIdx: 20, field: 'webglImage', confidence: 'medium', reason: 'long base64 string (webgl image)' });
  }

  // null → connectionInfo (35)
  if (value === null) {
    candidates.push({ schemaIdx: 35, field: 'connectionInfo', confidence: 'high', reason: 'null value (connectionInfo)' });
  }

  return candidates;
}

/**
 * Perform the full field matching algorithm.
 * Returns the discovery result object.
 */
function matchFields(chromeFields, tdcName, template, caseCount) {
  const fieldMapping = [];
  const usedSchemaIndices = new Set();
  const cdFieldOrder = new Array(chromeFields.length).fill(-1);
  const conflicts = [];

  // Step A: Signature matching
  log('\n=== Step A: Signature Matching ===');
  for (let i = 0; i < chromeFields.length; i++) {
    const match = signatureMatch(chromeFields[i]);
    if (match) {
      if (usedSchemaIndices.has(match.schemaIdx)) {
        conflicts.push({
          chromeIdx: i,
          schemaIdx: match.schemaIdx,
          field: match.field,
          reason: `CONFLICT: schema index ${match.schemaIdx} already assigned`,
        });
        log(`  [${i}] CONFLICT: ${match.field} (${match.schemaIdx}) already used`);
        continue;
      }
      cdFieldOrder[i] = match.schemaIdx;
      usedSchemaIndices.add(match.schemaIdx);
      fieldMapping.push({
        chromeIdx: i,
        schemaIdx: match.schemaIdx,
        field: match.field,
        confidence: match.confidence,
        reason: match.reason,
      });
      log(`  [${i}] → ${match.field} (${match.schemaIdx}) [${match.confidence}] ${match.reason}`);
    }
  }
  log(`  Signature matched: ${fieldMapping.length}/${chromeFields.length}`);

  // Step B: Heuristic matching for unmatched fields
  log('\n=== Step B: Heuristic Matching ===');
  for (let i = 0; i < chromeFields.length; i++) {
    if (cdFieldOrder[i] !== -1) continue; // already matched

    const candidates = heuristicMatch(chromeFields[i], i, chromeFields.length);
    // Filter out already-used schema indices
    const available = candidates.filter(c => !usedSchemaIndices.has(c.schemaIdx));

    if (available.length === 1) {
      // Single unambiguous match
      const match = available[0];
      cdFieldOrder[i] = match.schemaIdx;
      usedSchemaIndices.add(match.schemaIdx);
      fieldMapping.push({
        chromeIdx: i,
        schemaIdx: match.schemaIdx,
        field: match.field,
        confidence: match.confidence,
        reason: match.reason,
      });
      log(`  [${i}] → ${match.field} (${match.schemaIdx}) [${match.confidence}] ${match.reason}`);
    } else if (available.length > 1) {
      // Multiple candidates — pick highest confidence, then first
      available.sort((a, b) => {
        const conf = { high: 3, medium: 2, low: 1 };
        return (conf[b.confidence] || 0) - (conf[a.confidence] || 0);
      });
      const best = available[0];
      cdFieldOrder[i] = best.schemaIdx;
      usedSchemaIndices.add(best.schemaIdx);
      fieldMapping.push({
        chromeIdx: i,
        schemaIdx: best.schemaIdx,
        field: best.field,
        confidence: best.confidence,
        reason: `${best.reason} (${available.length} candidates, picked best)`,
      });
      log(`  [${i}] → ${best.field} (${best.schemaIdx}) [${best.confidence}] ${best.reason} (${available.length} candidates)`);
    }
  }

  // Step C: Process of elimination for remaining unmatched
  log('\n=== Step C: Process of Elimination ===');
  const allSchemaIndices = new Set(COLLECTOR_SCHEMA.map(s => s.index));
  const unmatchedSchema = [...allSchemaIndices].filter(idx => !usedSchemaIndices.has(idx));
  const unmatchedChrome = [];
  for (let i = 0; i < chromeFields.length; i++) {
    if (cdFieldOrder[i] === -1) {
      unmatchedChrome.push(i);
    }
  }

  log(`  Unmatched Chrome positions: ${unmatchedChrome.length} [${unmatchedChrome.join(', ')}]`);
  log(`  Unmatched schema indices: ${unmatchedSchema.length} [${unmatchedSchema.join(', ')}]`);

  // Try type-based matching for remaining
  for (const chromeIdx of unmatchedChrome) {
    const value = chromeFields[chromeIdx];
    const valueType = value === null ? 'null'
      : Array.isArray(value) ? 'array'
      : typeof value;

    const typeMatches = unmatchedSchema.filter(schemaIdx => {
      const schema = COLLECTOR_SCHEMA.find(s => s.index === schemaIdx);
      if (!schema) return false;
      return schema.type === valueType;
    });

    if (typeMatches.length === 1) {
      const schemaIdx = typeMatches[0];
      const schema = COLLECTOR_SCHEMA.find(s => s.index === schemaIdx);
      cdFieldOrder[chromeIdx] = schemaIdx;
      usedSchemaIndices.add(schemaIdx);
      unmatchedSchema.splice(unmatchedSchema.indexOf(schemaIdx), 1);
      fieldMapping.push({
        chromeIdx,
        schemaIdx,
        field: schema.name,
        confidence: 'medium',
        reason: `process of elimination: only unmatched ${valueType} schema field`,
      });
      log(`  [${chromeIdx}] → ${schema.name} (${schemaIdx}) [medium] only remaining ${valueType}`);
    }
  }

  // Recompute unmatched after elimination
  const finalUnmatched = [];
  for (let i = 0; i < chromeFields.length; i++) {
    if (cdFieldOrder[i] === -1) {
      finalUnmatched.push({
        chromeIdx: i,
        value: chromeFields[i],
        type: chromeFields[i] === null ? 'null'
          : Array.isArray(chromeFields[i]) ? 'array'
          : typeof chromeFields[i],
      });
    }
  }

  // Sort fieldMapping by chromeIdx
  fieldMapping.sort((a, b) => a.chromeIdx - b.chromeIdx);

  // Confidence summary
  const confidence = { high: 0, medium: 0, low: 0 };
  for (const m of fieldMapping) {
    confidence[m.confidence] = (confidence[m.confidence] || 0) + 1;
  }

  return {
    tdcName,
    template,
    caseCount,
    chromeFieldCount: chromeFields.length,
    cdFieldOrder,
    confidence,
    conflicts,
    unmatched: finalUnmatched,
    fieldMapping,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const opts = parseArgs();

  // Load template cache
  const cache = new TemplateCache();
  cache.load();
  cache.seed();
  log('Template cache loaded and seeded');

  // ── Step 1: Launch Puppeteer ──
  log('Step 1: Launching Chrome with stealth plugin...');
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
    const page = await browser.newPage();
    await page.setUserAgent(DEFAULT_USER_AGENT);

    // ── Step 2: Prehandle ──
    log('Step 2: Prehandle (Node.js HTTP)...');
    const client = new CaptchaClient({
      aid: DEFAULT_AID,
      referer: 'https://urlsec.qq.com/',
    });
    const session = await client.prehandle();
    log(`  sess=${session.sess.slice(0, 20)}... sid=${session.sid}`);

    // ── Step 3: Navigate to show page + intercept tdc.js ──
    log('Step 3: Navigate to show page + intercept tdc.js...');

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
        // ignore
      }
    });

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

    // ── Step 4: Wait for TDC.getData() ──
    log('Step 4: Wait for TDC.getData() to capture Chrome collect token...');

    let tdcAvailable = false;
    const tdcWaitStart = Date.now();
    while (!tdcAvailable && Date.now() - tdcWaitStart < 15000) {
      tdcAvailable = await page.evaluate(() => typeof window.TDC !== 'undefined');
      if (!tdcAvailable) await sleep(200);
    }

    if (!tdcAvailable) {
      throw new Error('TDC object not available in Chrome after 15s');
    }
    log('  TDC object available in Chrome');

    const chromeGetData = await page.evaluate(() => {
      try {
        if (window.TDC && typeof window.TDC.getData === 'function') {
          const result = window.TDC.getData(true);
          return { collect: result, ok: true };
        }
        return { ok: false, reason: 'TDC.getData not available' };
      } catch (err) {
        return { ok: false, reason: err.message };
      }
    });

    if (!chromeGetData.ok || !chromeGetData.collect) {
      throw new Error(`Chrome TDC.getData() failed: ${chromeGetData.reason || 'empty result'}`);
    }

    const chromeCollect = chromeGetData.collect;
    log(`  Chrome collect token captured: ${chromeCollect.length} chars`);

    // ── Step 5: Extract TDC_NAME + pipeline key extraction ──
    log('Step 5: Extract TDC_NAME + pipeline key extraction...');
    const tdcName = extractTdcName(capturedTdcSource);
    if (!tdcName) throw new Error('Could not extract TDC_NAME from tdc.js source');
    log(`  TDC_NAME: ${tdcName}`);

    let cached = cache.lookup(tdcName);
    if (!cached) {
      log('  TDC_NAME not in cache, running pipeline key extraction...');
      const { parseVmFunction } = require('../pipeline/vm-parser');
      const { mapOpcodes } = require('../pipeline/opcode-mapper');
      const { extractKey } = require('../pipeline/key-extractor');
      const os = require('os');

      const vmInfo = parseVmFunction(capturedTdcSource);
      log(`  Parsed VM: ${vmInfo.caseCount} opcodes`);

      const mapResult = mapOpcodes(vmInfo, capturedTdcSource);
      log(`  Mapped opcodes: ${Object.keys(mapResult.opcodeTable).length} mapped, ${mapResult.unmapped.length} unmapped`);

      const tmpFile = path.join(os.tmpdir(), `tdc-${tdcName}-${Date.now()}.js`);
      try {
        fs.writeFileSync(tmpFile, capturedTdcSource, 'utf8');
        const keyResult = await extractKey(tmpFile, mapResult.opcodeTable, vmInfo.variables);
        log(`  Pipeline extracted key: [${keyResult.key.map(k => '0x' + (k >>> 0).toString(16)).join(', ')}]`);

        cached = {
          template: 'live-extracted',
          key: keyResult.key,
          delta: keyResult.delta,
          rounds: keyResult.rounds,
          keyMods: keyResult.keyMods || [0, 0, 0, 0],
          keyModConstants: keyResult.keyModConstants || [0, 0],
          caseCount: vmInfo.caseCount,
        };

        cache.store(tdcName, cached);
        log(`  Stored extracted params in cache for ${tdcName}`);
      } finally {
        try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
      }
    }

    if (!cached) throw new Error(`Unknown template ${tdcName}`);
    log(`  Template: ${cached.template}, opcodes: ${cached.caseCount}`);

    const xteaParams = {
      key: cached.key,
      delta: cached.delta,
      rounds: cached.rounds,
      keyModConstants: cached.keyModConstants,
      keyMods: cached.keyMods || [0, 0, 0, 0],
    };

    // ── Step 6: Decrypt Chrome's collect token ──
    log('Step 6: Decrypt Chrome collect token...');
    const decryptResult = decryptCollect(chromeCollect, xteaParams);

    if (!decryptResult.parsed) {
      log(`  Plaintext (first 500): ${(decryptResult.plaintext || '').slice(0, 500)}`);
      throw new Error('Decryption succeeded but could not parse JSON');
    }

    if (!decryptResult.parsed.cd) {
      log(`  Parsed keys: ${Object.keys(decryptResult.parsed).join(', ')}`);
      throw new Error('Decrypted token has no cd field');
    }

    const rawCd = decryptResult.parsed.cd;
    log(`  Raw cd array: ${rawCd.length} fields`);

    // ── Step 7: Remove hash artifact at index 11 ──
    log('Step 7: Remove hash artifact at cd[11]...');
    log(`  cd[11] value: ${JSON.stringify(rawCd[11])}`);

    const chromeFields = [...rawCd];
    if (chromeFields.length === 60) {
      chromeFields.splice(11, 1); // Remove hash at index 11
      log(`  Removed hash at [11], now ${chromeFields.length} fields`);
    } else {
      log(`  WARNING: Expected 60 fields, got ${chromeFields.length} — NOT removing hash`);
    }

    // ── Step 8: Match fields against schema ──
    log('Step 8: Match Chrome fields against collector schema...');
    const result = matchFields(
      chromeFields,
      tdcName,
      cached.template,
      cached.caseCount
    );

    // Log summary
    log(`\n=== Discovery Summary ===`);
    log(`  TDC_NAME: ${result.tdcName}`);
    log(`  Template: ${result.template}`);
    log(`  Case count: ${result.caseCount}`);
    log(`  Chrome fields: ${result.chromeFieldCount}`);
    log(`  Matched: ${result.fieldMapping.length}/${result.chromeFieldCount}`);
    log(`  Confidence: high=${result.confidence.high} medium=${result.confidence.medium} low=${result.confidence.low}`);
    log(`  Unmatched: ${result.unmatched.length}`);
    log(`  Conflicts: ${result.conflicts.length}`);
    log(`  cdFieldOrder: [${result.cdFieldOrder.join(', ')}]`);

    if (result.unmatched.length > 0) {
      log('\n  Unmatched fields:');
      for (const u of result.unmatched) {
        log(`    [${u.chromeIdx}] type=${u.type} value=${JSON.stringify(u.value).slice(0, 80)}`);
      }
    }

    if (result.conflicts.length > 0) {
      log('\n  Conflicts:');
      for (const c of result.conflicts) {
        log(`    [${c.chromeIdx}] ${c.field} (${c.schemaIdx}): ${c.reason}`);
      }
    }

    // ── Step 9: Save results ──
    const outputPath = path.join(PROJECT_ROOT, 'output', 'field-order-discovery.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
    log(`\nResults saved to ${outputPath}`);

  } finally {
    await browser.close();
    log('Browser closed');
  }
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  log(err.stack);
  process.exit(1);
});
