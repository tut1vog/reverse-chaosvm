'use strict';

/**
 * structure-extractor.js — Automated cd structure extraction module.
 *
 * Extracts collector data (cd) structure parameters from a tdc.js build by
 * launching Puppeteer, capturing Chrome's encrypted collect token, decrypting
 * it, and analyzing the field layout.
 *
 * Exported functions:
 *   - detectHashPosition(cdArray)
 *   - matchFieldOrder(cdArray)
 *   - detectSerializationDiffs(chromePlaintext, cdArray)
 *   - analyzeHeaderSplit(chromePlaintext)
 *   - extractStructure(tdcPath, xteaParams)  [async, Puppeteer-based]
 */

const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { CaptchaClient } = require('../puppeteer/captcha-client');
const { buildCdString } = require('../token-generator/outer-pipeline');
const { COLLECTOR_SCHEMA } = require('../token-generator/collector-schema');

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
  process.stderr.write(`[structure-extractor] ${msg}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════════════════
// XTEA Decryption (self-contained, no external deps)
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
// 1. detectHashPosition — find the hash artifact in the cd array
// ═══════════════════════════════════════════════════════════════════════

/**
 * Scan a decrypted cd array (60 elements) for the hash artifact pattern:
 * a single-element array containing an 8-element array
 * [4, -1, -1, <timestamp>, 0, 0, 0, 0].
 *
 * Known positions: Template A = index 11, Template B = index 51.
 *
 * @param {Array} cdArray - Decrypted cd array (typically 60 elements)
 * @returns {number} Index where hash artifact appears, or -1 if not found
 */
function detectHashPosition(cdArray) {
  for (let i = 0; i < cdArray.length; i++) {
    const val = cdArray[i];
    // Must be a single-element array
    if (!Array.isArray(val) || val.length !== 1) continue;
    const inner = val[0];
    // Inner must be an 8-element array
    if (!Array.isArray(inner) || inner.length !== 8) continue;
    // Check pattern: [4, -1, -1, <any>, 0, 0, 0, 0]
    if (inner[0] === 4 && inner[1] === -1 && inner[2] === -1 &&
        inner[4] === 0 && inner[5] === 0 && inner[6] === 0 && inner[7] === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Scan a decrypted cd array for ALL hash artifact positions.
 * Same pattern as detectHashPosition but returns every matching index.
 *
 * @param {Array} cdArray - Decrypted cd array
 * @returns {number[]} Array of indices where hash artifacts appear
 */
function detectAllHashPositions(cdArray) {
  const positions = [];
  for (let i = 0; i < cdArray.length; i++) {
    const val = cdArray[i];
    if (!Array.isArray(val) || val.length !== 1) continue;
    const inner = val[0];
    if (!Array.isArray(inner) || inner.length !== 8) continue;
    if (inner[0] === 4 && inner[1] === -1 && inner[2] === -1 &&
        inner[4] === 0 && inner[5] === 0 && inner[6] === 0 && inner[7] === 0) {
      positions.push(i);
    }
  }
  return positions;
}

// ═══════════════════════════════════════════════════════════════════════
// 2. matchFieldOrder — map Chrome's cd fields to our 59-field schema
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a name->index lookup from the collector schema.
 */
function buildSchemaLookup() {
  const lookup = {};
  for (const entry of COLLECTOR_SCHEMA) {
    lookup[entry.name] = entry.index;
  }
  return lookup;
}

/**
 * Signature matching -- identify fields by distinctive value structure.
 * Returns { schemaIdx, field, confidence, reason } or null.
 */
function signatureMatch(value) {
  // String containing "Mozilla/5.0" -> userAgent (31)
  if (typeof value === 'string' && value.includes('Mozilla/5.0')) {
    return { schemaIdx: 31, field: 'userAgent', confidence: 'high', reason: 'contains Mozilla/5.0' };
  }

  // Array of locale strings -> languages (6)
  if (Array.isArray(value) && value.length >= 1 && value.length <= 5 &&
      value.every(v => typeof v === 'string') &&
      value.some(v => /^[a-z]{2}(-[A-Z]{2})?$/.test(v))) {
    return { schemaIdx: 6, field: 'languages', confidence: 'high', reason: 'array of locale strings' };
  }

  // Array of 2 numbers [width, height] -> screenResolution (9)
  if (Array.isArray(value) && value.length === 2 &&
      typeof value[0] === 'number' && typeof value[1] === 'number' &&
      value[0] >= 320 && value[1] >= 240) {
    return { schemaIdx: 9, field: 'screenResolution', confidence: 'high', reason: 'array of 2 numbers [width, height]' };
  }

  // Array of objects with "codec" and "support" -> videoCodecs (12) or audioCodecs (29)
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
    if ('codec' in value[0] && 'support' in value[0]) {
      const codecs = value.map(v => v.codec || '').join(',');
      if (/H\.264|VP[89]|AV1|HEVC|Theora|MPEG/i.test(codecs)) {
        return { schemaIdx: 12, field: 'videoCodecs', confidence: 'high', reason: 'array of objects with codec+support (video codecs)' };
      }
      if (/AAC|MP3|OGG|FLAC|Opus|WAV|PCM/i.test(codecs)) {
        return { schemaIdx: 29, field: 'audioCodecs', confidence: 'high', reason: 'array of objects with codec+support (audio codecs)' };
      }
      return { schemaIdx: 12, field: 'videoCodecs', confidence: 'medium', reason: 'array of objects with codec+support (generic)' };
    }

    // Array of objects with "type" and "suffixes" -> mimeTypes (19)
    if ('type' in value[0] && 'suffixes' in value[0]) {
      return { schemaIdx: 19, field: 'mimeTypes', confidence: 'high', reason: 'array of objects with type+suffixes' };
    }

    // Array of objects with "name" and "filename" -> plugins (23)
    if ('name' in value[0] && 'filename' in value[0]) {
      return { schemaIdx: 23, field: 'plugins', confidence: 'high', reason: 'array of objects with name+filename' };
    }
  }

  // Object signatures
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if ('nt_vc_output' in value) {
      return { schemaIdx: 18, field: 'audioFingerprint', confidence: 'high', reason: 'object with nt_vc_output key' };
    }
    if ('architecture' in value && 'bitness' in value) {
      return { schemaIdx: 37, field: 'highEntropyValues', confidence: 'high', reason: 'object with architecture+bitness' };
    }
    if ('brands' in value && 'mobile' in value && !('architecture' in value)) {
      return { schemaIdx: 46, field: 'userAgentData', confidence: 'high', reason: 'object with brands+mobile (no architecture)' };
    }
    if ('timeZone' in value && 'calendar' in value) {
      return { schemaIdx: 34, field: 'intlOptions', confidence: 'high', reason: 'object with timeZone+calendar' };
    }
    if ('quota' in value) {
      return { schemaIdx: 21, field: 'storageEstimate', confidence: 'high', reason: 'object with quota key' };
    }
    if ('_state' in value && !('quota' in value)) {
      return { schemaIdx: 42, field: 'permissionStatus', confidence: 'high', reason: 'object with _state (no quota)' };
    }
  }

  // String patterns
  if (typeof value === 'string' && (/ANGLE/i.test(value) || /SwiftShader/i.test(value))) {
    return { schemaIdx: 40, field: 'webglRenderer', confidence: 'high', reason: 'contains ANGLE or SwiftShader' };
  }
  if (typeof value === 'string' && /^\d+-\d+-\d+-\d+-\*-\*-\|-\*$/.test(value)) {
    return { schemaIdx: 47, field: 'screenComposite', confidence: 'high', reason: 'matches screenComposite pattern' };
  }
  if (typeof value === 'string' && /^[+-]\d{2}$/.test(value)) {
    return { schemaIdx: 26, field: 'timezoneOffset', confidence: 'high', reason: 'matches timezone offset pattern' };
  }
  if (value === 'UTF-8') {
    return { schemaIdx: 32, field: 'characterSet', confidence: 'high', reason: 'value is UTF-8' };
  }
  if (value === 'top' || value === 'child' || value === 'frame' || value === 'cross-origin') {
    return { schemaIdx: 41, field: 'frameStatus', confidence: 'high', reason: `value is "${value}" (frame status)` };
  }
  if (value === '98k') {
    return { schemaIdx: 38, field: 'internalToken', confidence: 'high', reason: 'value is "98k"' };
  }
  if (typeof value === 'string' && (/x86_64/.test(value) || value === 'Win32' || value === 'MacIntel' || value === 'Linux x86_64')) {
    return { schemaIdx: 48, field: 'platform', confidence: 'high', reason: 'matches platform string pattern' };
  }
  if (typeof value === 'string' && /Google Inc/i.test(value)) {
    return { schemaIdx: 36, field: 'vendor', confidence: 'high', reason: 'contains "Google Inc"' };
  }
  if (typeof value === 'string' && /^(srgb|p3|rec2020)$/i.test(value)) {
    return { schemaIdx: 28, field: 'colorGamut', confidence: 'high', reason: 'matches color gamut value' };
  }
  if (typeof value === 'string' && /^https?:\/\//.test(value)) {
    return { schemaIdx: 22, field: 'pageUrl', confidence: 'high', reason: 'matches URL pattern' };
  }
  if (typeof value === 'string' && /^\d+;\d+$/.test(value)) {
    return { schemaIdx: 33, field: 'screenPosition', confidence: 'high', reason: 'matches X;Y screen position pattern' };
  }
  if (typeof value === 'string' && /^(windows|macos|linux|android|ios|unknown)$/.test(value)) {
    return { schemaIdx: 1, field: 'osPlatform', confidence: 'high', reason: `matches OS platform "${value}"` };
  }
  if (typeof value === 'string' && /^(4g|3g|2g|slow-2g)$/.test(value)) {
    return { schemaIdx: 39, field: 'connectionType', confidence: 'medium', reason: `network connection type "${value}"` };
  }

  return null;
}

/**
 * Heuristic matching for numeric/simple fields.
 * Returns array of { schemaIdx, field, confidence, reason } candidates.
 */
function heuristicMatch(value, chromeIdx, totalFields) {
  const candidates = [];

  if (typeof value === 'number') {
    // Timestamps
    if (value > 1700000000 && value < 2000000000) {
      candidates.push({ schemaIdx: 16, field: 'timestampInit', confidence: 'medium', reason: `unix timestamp ${value}` });
      candidates.push({ schemaIdx: 53, field: 'timestampCollectionStart', confidence: 'medium', reason: `unix timestamp ${value}` });
      candidates.push({ schemaIdx: 52, field: 'timestampCollectionEnd', confidence: 'medium', reason: `unix timestamp ${value}` });
    }

    // Canvas/performance hashes
    if (value > 100000 && value < 0xFFFFFFFF && !(value > 1700000000 && value < 2000000000)) {
      candidates.push({ schemaIdx: 15, field: 'canvasHash', confidence: 'low', reason: `large integer ${value} (hash candidate)` });
      candidates.push({ schemaIdx: 54, field: 'performanceHash', confidence: 'low', reason: `large integer ${value} (hash candidate)` });
    }

    // Floating point
    if (!Number.isInteger(value)) {
      if (value > 0 && value < 1) {
        candidates.push({ schemaIdx: 17, field: 'mathFingerprint', confidence: 'high', reason: `float in (0,1) range: ${value}` });
      } else if (value >= 1 && value <= 4) {
        candidates.push({ schemaIdx: 10, field: 'devicePixelRatio', confidence: 'high', reason: `small float ${value} (pixel ratio)` });
      }
    }

    if (value === 1 && Number.isInteger(value)) {
      candidates.push({ schemaIdx: 10, field: 'devicePixelRatio', confidence: 'low', reason: 'integer 1 (could be pixelRatio)' });
      candidates.push({ schemaIdx: 0, field: 'callCounter', confidence: 'medium', reason: 'integer 1 (call counter first call)' });
      candidates.push({ schemaIdx: 13, field: 'localStorageAvail', confidence: 'low', reason: 'integer 1 (localStorage available)' });
    }

    if (value === 2) {
      candidates.push({ schemaIdx: 2, field: 'touchSupport', confidence: 'medium', reason: 'integer 2 (desktop touch flag)' });
    }

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

    if (value === 20) {
      candidates.push({ schemaIdx: 14, field: 'maxTouchPoints', confidence: 'medium', reason: 'integer 20 (headless Chrome default)' });
      candidates.push({ schemaIdx: 25, field: 'maxTouchPointsDup', confidence: 'medium', reason: 'integer 20 (headless Chrome default dup)' });
    }

    if (value === 8) {
      candidates.push({ schemaIdx: 8, field: 'hardwareConcurrency', confidence: 'medium', reason: 'integer 8 (CPU cores)' });
    }

    if (value === 24 || value === 32) {
      candidates.push({ schemaIdx: 49, field: 'colorDepth', confidence: 'medium', reason: `integer ${value} (color depth)` });
    }

    if (value >= 400 && value <= 2000 && Number.isInteger(value)) {
      candidates.push({ schemaIdx: 44, field: 'availHeight', confidence: 'low', reason: `integer ${value} (screen dimension)` });
      candidates.push({ schemaIdx: 3, field: 'viewportWidth', confidence: 'low', reason: `integer ${value} (viewport dimension)` });
    }

    if (value === 1023 || value === 0x3FF) {
      candidates.push({ schemaIdx: 57, field: 'featureBitmask', confidence: 'high', reason: 'integer 1023 (0x3FF bitmask)' });
    }
  }

  // Empty strings
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

  // Font list
  if (typeof value === 'string' && value.length > 20 && value.includes(',') &&
      /Arial|Courier|Times|Helvetica/i.test(value)) {
    candidates.push({ schemaIdx: 4, field: 'detectedFonts', confidence: 'high', reason: 'comma-separated font list' });
  }

  // Long base64 string -> webglImage (20)
  if (typeof value === 'string' && value.length > 50 && /^[A-Za-z0-9+/=]+$/.test(value)) {
    candidates.push({ schemaIdx: 20, field: 'webglImage', confidence: 'medium', reason: 'long base64 string (webgl image)' });
  }

  // null -> connectionInfo (35)
  if (value === null) {
    candidates.push({ schemaIdx: 35, field: 'connectionInfo', confidence: 'high', reason: 'null value (connectionInfo)' });
  }

  return candidates;
}

/**
 * Given Chrome's decrypted cd array (with hash artifact already identified),
 * map each field to our 59-field collector schema.
 *
 * @param {Array} cdArray - Decrypted cd array from Chrome
 * @returns {Object} { fieldOrder: number[], matchDetails: object[], unmatchedCount: number }
 */
function matchFieldOrder(cdArray) {
  const fieldOrder = new Array(cdArray.length).fill(-1);
  const matchDetails = [];
  const usedSchemaIndices = new Set();

  // Detect hash position and mark it
  const hashPos = detectHashPosition(cdArray);
  if (hashPos >= 0) {
    fieldOrder[hashPos] = -1; // explicitly mark as hash
  }

  // Step A: Signature matching
  for (let i = 0; i < cdArray.length; i++) {
    if (i === hashPos) continue; // skip hash position
    const match = signatureMatch(cdArray[i]);
    if (match) {
      if (usedSchemaIndices.has(match.schemaIdx)) continue; // conflict, skip
      fieldOrder[i] = match.schemaIdx;
      usedSchemaIndices.add(match.schemaIdx);
      matchDetails.push({
        chromeIdx: i,
        schemaIdx: match.schemaIdx,
        field: match.field,
        confidence: match.confidence,
        reason: match.reason,
      });
    }
  }

  // Step B: Heuristic matching for unmatched fields
  for (let i = 0; i < cdArray.length; i++) {
    if (fieldOrder[i] !== -1 || i === hashPos) continue;

    const candidates = heuristicMatch(cdArray[i], i, cdArray.length);
    const available = candidates.filter(c => !usedSchemaIndices.has(c.schemaIdx));

    if (available.length >= 1) {
      // Sort by confidence and pick best
      available.sort((a, b) => {
        const conf = { high: 3, medium: 2, low: 1 };
        return (conf[b.confidence] || 0) - (conf[a.confidence] || 0);
      });
      const best = available[0];
      fieldOrder[i] = best.schemaIdx;
      usedSchemaIndices.add(best.schemaIdx);
      matchDetails.push({
        chromeIdx: i,
        schemaIdx: best.schemaIdx,
        field: best.field,
        confidence: best.confidence,
        reason: available.length > 1
          ? `${best.reason} (${available.length} candidates, picked best)`
          : best.reason,
      });
    }
  }

  // Step C: Process of elimination for remaining unmatched
  const allSchemaIndices = new Set(COLLECTOR_SCHEMA.map(s => s.index));
  const unmatchedSchema = [...allSchemaIndices].filter(idx => !usedSchemaIndices.has(idx));

  for (let i = 0; i < cdArray.length; i++) {
    if (fieldOrder[i] !== -1 || i === hashPos) continue;

    const value = cdArray[i];
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
      fieldOrder[i] = schemaIdx;
      usedSchemaIndices.add(schemaIdx);
      unmatchedSchema.splice(unmatchedSchema.indexOf(schemaIdx), 1);
      matchDetails.push({
        chromeIdx: i,
        schemaIdx,
        field: schema.name,
        confidence: 'medium',
        reason: `process of elimination: only unmatched ${valueType} schema field`,
      });
    }
  }

  // Count unmatched
  let unmatchedCount = 0;
  for (let i = 0; i < cdArray.length; i++) {
    if (fieldOrder[i] === -1 && i !== hashPos) {
      unmatchedCount++;
    }
  }

  return { fieldOrder, matchDetails, unmatchedCount };
}

// ═══════════════════════════════════════════════════════════════════════
// 3. detectSerializationDiffs — compare Chrome's raw cd with buildCdString
// ═══════════════════════════════════════════════════════════════════════

/**
 * JSON-depth-aware parser that splits a cd string into individual field
 * raw strings. Adapted from chrome-cd-inject.js parseCdFields.
 *
 * @param {string} cdStr - The full cd JSON string, e.g. '{"cd":[...]}'
 * @returns {string[]|null} Array of raw field strings, or null on parse error
 */
function parseCdFields(cdStr) {
  // Find the outer array boundaries: '{"cd":[' ... ']}'
  const arrStart = cdStr.indexOf('[');
  const arrEnd = cdStr.lastIndexOf(']');
  if (arrStart < 0 || arrEnd < 0 || arrEnd <= arrStart) return null;

  const fields = [];
  let d = 0;
  let inStr = false;
  let fieldStart = arrStart + 1; // skip the '['

  for (let k = arrStart + 1; k <= arrEnd; k++) {
    const ch = cdStr[k];
    if (inStr) {
      if (ch === '\\') { k++; continue; } // skip escaped char
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '[' || ch === '{') { d++; continue; }
    if (ch === ']' || ch === '}') {
      if (d > 0) { d--; continue; }
      // d === 0 means we hit the closing ']' of the outer array
      const raw = cdStr.substring(fieldStart, k).trim();
      if (raw.length > 0) fields.push(raw);
      break;
    }
    if (ch === ',' && d === 0) {
      fields.push(cdStr.substring(fieldStart, k));
      fieldStart = k + 1;
    }
  }

  return fields;
}

/**
 * Compare Chrome's raw cd serialization with what buildCdString produces
 * for the same parsed cd array. Detects differences in object key selection,
 * serialization order, etc.
 *
 * @param {string} chromePlaintext - Chrome's raw decrypted JSON string
 * @param {Array} cdArray - Parsed cd array from Chrome's plaintext
 * @returns {Object[]} Array of diff objects for fields that differ
 */
function detectSerializationDiffs(chromePlaintext, cdArray) {
  const diffs = [];

  // Parse Chrome's raw cd fields
  // The plaintext may contain both cd and sd; extract the cd portion
  let chromeCdStr = chromePlaintext;
  // If the plaintext is the full JSON (with sd), we need to extract just the cd part
  // The cd string starts with '{"cd":[' and the sd part comes after
  // We need to reconstruct what buildCdString would produce from the cdArray
  const ourCdStr = buildCdString(cdArray);

  const chromeFields = parseCdFields(chromeCdStr);
  const ourFields = parseCdFields(ourCdStr);

  if (!chromeFields || !ourFields) {
    return diffs;
  }

  const maxFields = Math.max(chromeFields.length, ourFields.length);
  for (let i = 0; i < maxFields; i++) {
    const cf = i < chromeFields.length ? chromeFields[i] : undefined;
    const of_ = i < ourFields.length ? ourFields[i] : undefined;

    if (cf !== of_) {
      const diffEntry = {
        index: i,
        chromeRaw: cf !== undefined ? cf : null,
        jsonStringify: of_ !== undefined ? of_ : null,
        diffType: 'serialization',
      };

      // Try to extract keys for object fields
      if (cf && cf.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(cf);
          diffEntry.keys = Object.keys(parsed);
        } catch (e) {
          // Not valid JSON on its own — may be partial
        }
      }

      diffs.push(diffEntry);
    }
  }

  return diffs;
}

// ═══════════════════════════════════════════════════════════════════════
// 4a. decryptHeaderSegment — extract and decrypt just the header segment
// ═══════════════════════════════════════════════════════════════════════

/**
 * Extract and decrypt just the header segment from a URL-encoded collect
 * token string.
 *
 * The assembled token is: segments[1] (header) + segments[0] (hash) +
 * segments[2] (cdBody) + segments[3] (sig). The header segment is always
 * exactly 192 base64 chars (= 144 bytes encrypted). Decrypting this segment
 * individually preserves trailing space padding that would be lost if the
 * entire token were decrypted as one block.
 *
 * @param {string} collectStr - URL-encoded collect token string
 * @param {Object} params - XTEA parameters { key, delta, rounds, keyMods }
 * @returns {string} The 144-char decrypted header plaintext (with any trailing spaces)
 */
function decryptHeaderSegment(collectStr, params) {
  const HEADER_B64_LEN = 192; // 144 bytes → 192 base64 chars

  // URL-decode to get raw base64
  const b64 = collectStr
    .replace(/%2B/g, '+')
    .replace(/%2F/g, '/')
    .replace(/%3D/g, '=');

  // The first 192 base64 chars are the header segment (assembly order puts header first)
  const headerB64 = b64.substring(0, HEADER_B64_LEN);

  // Decode base64 → binary (144 bytes)
  const encrypted = Buffer.from(headerB64, 'base64').toString('binary');

  // Decrypt with XTEA
  const decrypted = decryptXtea(encrypted, params);

  return decrypted;
}

// ═══════════════════════════════════════════════════════════════════════
// 4b. analyzeHeaderSplit — detect header splitting strategy
// ═══════════════════════════════════════════════════════════════════════

/**
 * Analyze the header segment's trailing-space padding to determine the
 * header splitting strategy.
 *
 * If the header has trailing spaces, it's field-boundary split (the VM
 * padded to avoid cutting mid-field). If no trailing spaces, it's
 * byte-boundary split (the VM cut at exactly 144 bytes).
 *
 * @param {string} headerPlaintext - The raw decrypted header string (up to 144 chars)
 * @returns {Object} { strategy, contentLength, paddingLength }
 */
function analyzeHeaderSplit(headerPlaintext) {
  if (typeof headerPlaintext !== 'string' || headerPlaintext.length === 0) {
    return { strategy: 'unknown', contentLength: 0, paddingLength: 0 };
  }

  // Count trailing spaces
  let paddingLength = 0;
  for (let i = headerPlaintext.length - 1; i >= 0; i--) {
    if (headerPlaintext[i] === ' ') {
      paddingLength++;
    } else {
      break;
    }
  }

  const contentLength = headerPlaintext.length - paddingLength;
  const strategy = paddingLength > 0 ? 'field-boundary' : 'byte-boundary';

  return { strategy, contentLength, paddingLength };
}

// ═══════════════════════════════════════════════════════════════════════
// 5. extractStructure — main Puppeteer-based entry point
// ═══════════════════════════════════════════════════════════════════════

/**
 * Launch Puppeteer, capture Chrome's encrypted collect token, decrypt it,
 * and analyze the cd structure.
 *
 * @param {string} tdcPath - Path to the target tdc.js file
 * @param {Object} xteaParams - XTEA decryption parameters
 *   { key: number[], delta: number, rounds: number, keyMods: number[] }
 * @returns {Promise<Object>} Combined structure analysis result
 */
async function extractStructure(tdcPath, xteaParams) {
  const result = {
    hashPosition: -1,
    fieldOrder: null,
    serializationDiffs: null,
    headerSplit: null,
    chromeCdLength: 0,
    success: false,
    error: null,
  };

  let browser = null;

  try {
    // Read the tdc.js source
    const absolutePath = path.resolve(tdcPath);
    const tdcSource = fs.readFileSync(absolutePath, 'utf-8');
    log(`Loaded tdc.js source: ${tdcSource.length} chars`);

    // Launch Puppeteer with stealth
    log('Launching Chrome with stealth plugin...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
      defaultViewport: { width: 1280, height: 1400, deviceScaleFactor: 1 },
    });

    const page = await browser.newPage();
    await page.setUserAgent(DEFAULT_USER_AGENT);

    // Prehandle via CaptchaClient
    log('Prehandle via CaptchaClient...');
    const client = new CaptchaClient({
      aid: DEFAULT_AID,
      referer: 'https://urlsec.qq.com/',
    });
    const session = await client.prehandle();
    log(`  sess=${session.sess.slice(0, 20)}... sid=${session.sid}`);

    // Build show URL
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

    // Set up CDP Fetch interception to replace tdc.js with our source
    const cdpSession = await page.target().createCDPSession();
    await cdpSession.send('Fetch.enable', {
      patterns: [{ urlPattern: '*tdc.js*', requestStage: 'Response' }],
    });

    cdpSession.on('Fetch.requestPaused', async (event) => {
      try {
        // Fulfill with our tdc.js source
        const encodedBody = Buffer.from(tdcSource).toString('base64');
        await cdpSession.send('Fetch.fulfillRequest', {
          requestId: event.requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          ],
          body: encodedBody,
        });
        log('  Intercepted and replaced tdc.js');
      } catch (e) {
        // If fulfillRequest fails, continue the request normally
        try {
          await cdpSession.send('Fetch.continueRequest', { requestId: event.requestId });
        } catch (_) { /* ignore */ }
      }
    });

    // Navigate to show page
    log('Navigating to show page...');
    await page.goto(showUrl, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    log('  Show page loaded');

    // Wait for TDC to initialize
    let tdcAvailable = false;
    const tdcWaitStart = Date.now();
    while (!tdcAvailable && Date.now() - tdcWaitStart < 15000) {
      tdcAvailable = await page.evaluate(() => typeof window.TDC !== 'undefined');
      if (!tdcAvailable) await sleep(200);
    }

    if (!tdcAvailable) {
      throw new Error('TDC did not initialize within 15s');
    }
    log('  TDC object available');

    // Call TDC.getData(true) to capture Chrome's encrypted collect token
    const chromeGetData = await page.evaluate(() => {
      try {
        if (window.TDC && typeof window.TDC.getData === 'function') {
          const collectToken = window.TDC.getData(true);
          return { collect: collectToken, ok: true };
        }
        return { ok: false, reason: 'TDC.getData not available' };
      } catch (err) {
        return { ok: false, reason: err.message };
      }
    });

    if (!chromeGetData.ok || !chromeGetData.collect) {
      throw new Error(`TDC.getData() failed: ${chromeGetData.reason || 'empty result'}`);
    }

    const chromeCollect = chromeGetData.collect;
    log(`  Chrome collect token: ${chromeCollect.length} chars`);

    // Decrypt the collect token
    log('Decrypting Chrome collect token...');
    const decryptResult = decryptCollect(chromeCollect, xteaParams);

    if (!decryptResult.parsed || !decryptResult.parsed.cd) {
      throw new Error('Failed to decrypt or parse Chrome collect token');
    }

    const cdArray = decryptResult.parsed.cd;
    log(`  Decrypted cd array: ${cdArray.length} fields`);
    result.chromeCdLength = cdArray.length;

    // Run all 4 detection functions
    log('Analyzing cd structure...');

    // 1. Hash position
    result.hashPosition = detectHashPosition(cdArray);
    log(`  Hash position: ${result.hashPosition}`);

    // 2. Field order matching
    const fieldResult = matchFieldOrder(cdArray);
    result.fieldOrder = fieldResult.fieldOrder;
    log(`  Field order matched: ${fieldResult.matchDetails.length}/${cdArray.length} fields, ${fieldResult.unmatchedCount} unmatched`);

    // 3. Serialization diffs
    result.serializationDiffs = detectSerializationDiffs(decryptResult.plaintext, cdArray);
    log(`  Serialization diffs: ${result.serializationDiffs.length}`);

    // 4. Header split analysis — decrypt the header segment individually
    //    to preserve trailing space padding (lost in full-token decryption)
    const headerPlaintext = decryptHeaderSegment(chromeCollect, xteaParams);
    result.headerSplit = analyzeHeaderSplit(headerPlaintext);
    log(`  Header split: ${result.headerSplit.strategy} (content=${result.headerSplit.contentLength}, padding=${result.headerSplit.paddingLength})`);

    result.success = true;
  } catch (err) {
    result.error = err.message;
    log(`ERROR: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  extractStructure,
  detectHashPosition,
  detectAllHashPositions,
  matchFieldOrder,
  detectSerializationDiffs,
  analyzeHeaderSplit,
  decryptHeaderSegment,
};
