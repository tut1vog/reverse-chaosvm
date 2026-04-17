'use strict';

/**
 * refresh-chrome-profile.js
 *
 * Reads the fresh Puppeteer decrypt (cd array in template order) and the
 * structure-params field-order mapping, then rebuilds the canonical cd array
 * and updates profiles/chrome-fingerprint.json.
 *
 * Usage:
 *   node scripts/refresh-chrome-profile.js [--decrypt <path>] [--structure <path>] [--dry-run]
 *
 * Defaults:
 *   --decrypt   output/phase-49-body-diff/puppeteer-fresh-decrypt.json
 *   --structure output/tdc-source/structure-params.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// --- CLI args ---
const args = process.argv.slice(2);
function flag(name) {
  return args.includes(name);
}
function opt(name, fallback) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
}

const dryRun = flag('--dry-run');
const decryptPath = path.resolve(ROOT, opt('--decrypt',
  'output/phase-49-body-diff/puppeteer-fresh-decrypt.json'));
const structurePath = path.resolve(ROOT, opt('--structure',
  'output/tdc-source/structure-params.json'));
const profilePath = path.resolve(ROOT, 'profiles/chrome-fingerprint.json');

// --- Load inputs ---
const decrypt = JSON.parse(fs.readFileSync(decryptPath, 'utf8'));
const structure = JSON.parse(fs.readFileSync(structurePath, 'utf8'));
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

const templateCd = decrypt.cd;
const fieldOrder = structure.fieldOrder;

if (!Array.isArray(templateCd) || !Array.isArray(fieldOrder)) {
  console.error('ERROR: cd or fieldOrder is not an array');
  process.exit(1);
}
if (templateCd.length !== fieldOrder.length) {
  console.error('ERROR: cd length (%d) !== fieldOrder length (%d)',
    templateCd.length, fieldOrder.length);
  process.exit(1);
}

// --- Build canonical array ---
// Determine canonical size: max non-negative index + 1
const maxCanonical = Math.max(...fieldOrder.filter(i => i >= 0));
// Keep at least the old cdCanonical size for backward compat
const canonicalSize = Math.max(maxCanonical + 1,
  Array.isArray(profile.cdCanonical) ? profile.cdCanonical.length : 0);

// Start from old canonical to preserve slots this template doesn't cover
const canonical = Array.isArray(profile.cdCanonical)
  ? [...profile.cdCanonical]
  : new Array(canonicalSize).fill(null);

// Pad if needed
while (canonical.length < canonicalSize) {
  canonical.push(null);
}

// Per-session canonical indices that should not be overwritten with stale
// capture values (timestamps, session IDs, event logs, URLs)
const perSessionCanonical = profile.perSessionCanonical
  ? new Set(Object.keys(profile.perSessionCanonical).map(Number))
  : new Set();

// Map: template position -> canonical index
const skippedHash = [];
const skippedPerSession = [];
const updated = [];

for (let tpos = 0; tpos < fieldOrder.length; tpos++) {
  const ci = fieldOrder[tpos];
  if (ci === -1) {
    skippedHash.push(tpos);
    continue;
  }
  if (ci < 0 || ci >= canonicalSize) {
    console.warn('WARN: fieldOrder[%d] = %d out of range, skipping', tpos, ci);
    continue;
  }
  if (perSessionCanonical.has(ci)) {
    skippedPerSession.push({ tpos, ci });
    continue;
  }

  const oldVal = canonical[ci];
  const newVal = templateCd[tpos];
  const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
  if (changed) {
    updated.push({ ci, tpos, old: oldVal, new: newVal });
  }
  canonical[ci] = newVal;
}

// --- Build per-session indices for the new template ---
const newPerSessionIndices = {};
for (let tpos = 0; tpos < fieldOrder.length; tpos++) {
  const ci = fieldOrder[tpos];
  if (ci >= 0 && perSessionCanonical.has(ci)) {
    const label = profile.perSessionCanonical
      ? profile.perSessionCanonical[String(ci)]
      : `canonical[${ci}]`;
    newPerSessionIndices[String(tpos)] = label;
  }
}

// --- Identify behavioral / -1 slots ---
const newBehavioralSlots = {};
for (let tpos = 0; tpos < fieldOrder.length; tpos++) {
  if (fieldOrder[tpos] === -1) {
    const val = templateCd[tpos];
    const summary = typeof val === 'string'
      ? val.slice(0, 60)
      : JSON.stringify(val).slice(0, 60);
    newBehavioralSlots[String(tpos)] = `hash/behavioral slot (value: ${summary})`;
  }
}

// --- Update profile ---
const now = new Date().toISOString().split('T')[0];
const tdcName = decrypt.xteaParams ? 'auto-detected' : profile._tdcName;

const newProfile = {
  _source: `Auto-refreshed from Puppeteer/Chrome capture on ${now}`,
  _template: profile._template || 'unknown',
  _tdcName: tdcName,
  _notes: profile._notes,
  perSessionIndices: newPerSessionIndices,
  cd: templateCd,
  sd: decrypt.sd || profile.sd,
  cdCanonical: canonical,
  chromeFieldOrder: fieldOrder,
  perSessionCanonical: profile.perSessionCanonical || {},
  _behavioralSlots: newBehavioralSlots
};

// --- Summary ---
console.log('=== Chrome Profile Refresh ===');
console.log('Decrypt source: %s', decryptPath);
console.log('Structure source: %s', structurePath);
console.log('Template cd length: %d', templateCd.length);
console.log('Canonical array size: %d', canonicalSize);
console.log('Hash slots skipped: %d (template positions: %s)',
  skippedHash.length, skippedHash.join(', '));
console.log('Per-session slots preserved: %d', skippedPerSession.length);
for (const s of skippedPerSession) {
  console.log('  canonical[%d] (template pos %d)', s.ci, s.tpos);
}
console.log('');
console.log('Fields changed: %d', updated.length);
for (const u of updated) {
  const oldStr = JSON.stringify(u.old);
  const newStr = JSON.stringify(u.new);
  const oldShort = oldStr.length > 80 ? oldStr.slice(0, 77) + '...' : oldStr;
  const newShort = newStr.length > 80 ? newStr.slice(0, 77) + '...' : newStr;
  console.log('  canonical[%d] (tpos %d):', u.ci, u.tpos);
  console.log('    old: %s', oldShort);
  console.log('    new: %s', newShort);
}

if (dryRun) {
  console.log('\n[DRY RUN] No files written.');
} else {
  const json = JSON.stringify(newProfile, null, 2) + '\n';
  fs.writeFileSync(profilePath, json, 'utf8');
  console.log('\nWrote %s (%d bytes)', profilePath, Buffer.byteLength(json));
}
