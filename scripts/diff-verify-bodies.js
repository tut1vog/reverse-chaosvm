'use strict';

/**
 * diff-verify-bodies.js — Phase 49.1
 *
 * Reconstructs what the scraper WOULD send in Chrome-profile mode and
 * compares it field-by-field against the committed Puppeteer capture
 * (which gets errorCode 0). No live network access needed.
 *
 * Usage:
 *   node scripts/diff-verify-bodies.js
 *
 * Output:
 *   output/phase-49-body-diff/diff-report.json
 *   + human-readable summary to stdout
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'phase-49-body-diff');

// ─── Data sources ────────────────────────────────────────────────────

const verifyPost = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, 'output', 'puppeteer-capture', 'verify-post.json'), 'utf8')
);
const collectDecrypted = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, 'output', 'puppeteer-capture', 'collect-decrypted.json'), 'utf8')
);
const fieldMapping = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, 'output', 'puppeteer-capture', 'field-mapping.json'), 'utf8')
);
const chromeProfile = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, 'profiles', 'chrome-fingerprint.json'), 'utf8')
);
const vdataProfile = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, 'profiles', 'vdata-browser-default.json'), 'utf8')
);

// Browser reference data
const browserCd = collectDecrypted.browser.cd;
const browserSd = collectDecrypted.browser.sd;

// ─── Helpers ─────────────────────────────────────────────────────────

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function summarize(val) {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'string') {
    if (val.length > 60) return JSON.stringify(val.slice(0, 57) + '...');
    return JSON.stringify(val);
  }
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  const s = JSON.stringify(val);
  if (s.length > 80) return s.slice(0, 77) + '...';
  return s;
}

// ─── 1. Reconstruct scraper cd array ─────────────────────────────────

// The scraper in Chrome-profile mode:
// 1. Clones cdCanonical (59-element array in canonical schema order)
// 2. Substitutes per-session fields: canonical[16], [22], [52], [53]
// 3. Reorders via cdFieldOrder (from template cache)
//
// For this diff we use the Puppeteer capture's per-session values so we
// compare like-for-like on the non-fingerprint fields.

const cdCanonical = JSON.parse(JSON.stringify(chromeProfile.cdCanonical));

// Extract Puppeteer's per-session values from the browser cd array.
// Use field-mapping to find browser indices for each canonical index.
const browserTimestampInit = browserCd[14];     // browserIndex 14 = canonical 16
const browserPageUrl = browserCd[41];           // browserIndex 41 = canonical 22
const browserTimestampEnd = browserCd[31];      // browserIndex 31 = canonical 52
const browserTimestampStart = browserCd[52];    // browserIndex 52 = canonical 53

// Apply the same per-session substitutions the scraper would do
// (using Puppeteer values as mock session data)
cdCanonical[16] = browserTimestampInit;
cdCanonical[22] = browserPageUrl;
cdCanonical[52] = browserTimestampEnd;
cdCanonical[53] = browserTimestampStart;

// ─── 2. Compare cd fields via the field mapping ─────────────────────

// fieldMapping maps browserIndex → {fieldName, schemaIndex, ...}
// We compare the scraper's cdCanonical (in canonical order) against
// the browser's cd (in browser/template order) using the mapping.

const cdDiffs = [];
const cdMatches = [];

for (const entry of fieldMapping) {
  const browserIdx = entry.browserIndex;
  const schemaIdx = entry.schemaIndex;
  const fieldName = entry.fieldName;
  const browserVal = browserCd[browserIdx];

  let scraperVal;
  let scraperSource;
  if (schemaIdx === -1) {
    // behavioralEvents — not in canonical schema, injected at hashPosition
    scraperVal = undefined;
    scraperSource = 'N/A (behavioralEvents injected at hashPosition -1 slot)';
  } else if (schemaIdx >= 0 && schemaIdx < cdCanonical.length) {
    scraperVal = cdCanonical[schemaIdx];
    scraperSource = `cdCanonical[${schemaIdx}]`;
  } else {
    scraperVal = undefined;
    scraperSource = `out of range (schemaIndex=${schemaIdx})`;
  }

  const match = schemaIdx !== -1 && deepEqual(browserVal, scraperVal);

  const record = {
    browserIndex: browserIdx,
    schemaIndex: schemaIdx,
    fieldName,
    match,
    browserValue: browserVal,
    scraperValue: scraperVal,
    scraperSource,
  };

  if (!match) {
    // Add a human-readable reason for the difference
    if (schemaIdx === -1) {
      record.reason = 'behavioralEvents: scraper injects generated events at hashPosition; per-session, always differs';
    } else if ([16, 52, 53].includes(schemaIdx)) {
      record.reason = 'Per-session timestamp — substituted from Puppeteer values; should match';
    } else if (schemaIdx === 22) {
      record.reason = 'Per-session pageUrl — substituted from Puppeteer values; should match';
    } else {
      record.reason = 'Static fingerprint field — differs between chrome-fingerprint.json and real browser capture';
    }
    cdDiffs.push(record);
  } else {
    cdMatches.push(record);
  }
}

// ─── 3. Compare sd objects ───────────────────────────────────────────

// Reconstruct what buildSlideSd() would produce.
// Use Puppeteer's slideValue for like-for-like comparison.
const scraperSd = {
  od: 'C',
  clientType: '',
  coordinate: [10, 60, 1.8559],  // scraper default (updated in 49.2)
  trycnt: 1,
  refreshcnt: 0,
  slideValue: browserSd.slideValue,  // use same slideValue for comparison
  dragobj: 1,
  ft: '<random 9-char>',  // scraper generates randomly
};

const sdDiffs = [];
const sdMatches = [];

for (const key of new Set([...Object.keys(browserSd), ...Object.keys(scraperSd)])) {
  const bVal = browserSd[key];
  const sVal = scraperSd[key];
  let match;
  let reason = '';

  if (key === 'ft') {
    // ft is random in scraper, deterministic(?) in browser — always differs
    match = false;
    reason = `Browser ft="${bVal}" (possibly deterministic). Scraper generates random 9-char string each time.`;
  } else if (key === 'coordinate') {
    match = deepEqual(bVal, sVal);
    if (!match) {
      reason = `coordinate[2] ratio: browser=${bVal[2]}, scraper=1.0 (hardcoded default). ` +
        `This is the CSS layout geometry ratio and likely a server-side detector.`;
    }
  } else if (key === 'slideValue') {
    match = true; // we injected same values
    reason = 'Using Puppeteer slideValue for like-for-like comparison';
  } else {
    match = deepEqual(bVal, sVal);
    if (!match) {
      reason = `Browser=${summarize(bVal)}, Scraper=${summarize(sVal)}`;
    }
  }

  const record = {
    field: key,
    match,
    browserValue: bVal,
    scraperValue: sVal,
  };
  if (reason) record.reason = reason;

  if (match) {
    sdMatches.push(record);
  } else {
    sdDiffs.push(record);
  }
}

// ─── 4. Reconstruct scraper POST fields ──────────────────────────────

// The scraper builds 38 fields via _buildPostFields(). We reconstruct
// using Puppeteer's session values so we compare field-by-field.

const scraperPostFields = {
  aid: verifyPost.aid,
  protocol: 'https',
  accver: '1',
  showtype: 'popup',
  // ua is base64 of userAgent; scraper uses the same default UA
  ua: Buffer.from('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36').toString('base64'),
  noheader: '1',
  fb: '1',
  aged: '0',
  enableAged: '0',
  enableDarkMode: '0',
  grayscale: '1',
  dyeid: '0',
  clientype: '2',
  sess: verifyPost.sess,
  fwidth: '0',
  sid: verifyPost.sid,
  wxLang: '',
  tcScale: '1',
  uid: '',
  cap_cd: '',
  rnd: '<random 0-999999>',
  prehandleLoadTime: '<random 100-299>',
  createIframeStart: '<random near Date.now()>',
  global: '0',
  subsid: verifyPost.subsid,
  cdata: '0',
  ans: verifyPost.ans,
  vsig: verifyPost.vsig,
  websig: verifyPost.websig,
  subcapclass: verifyPost.subcapclass,
  pow_answer: '',
  pow_calc_time: '0',
  collect: '<generated — see cd/sd diff>',
  tlg: '<collect.length>',
  fpinfo: '',
  eks: verifyPost.eks,
  nonce: verifyPost.nonce,
  vlg: '0_0_1',
};

const postFieldDiffs = [];
const postFieldMatches = [];

for (const key of new Set([...Object.keys(verifyPost), ...Object.keys(scraperPostFields)])) {
  const bVal = verifyPost[key];
  const sVal = scraperPostFields[key];

  // Skip fields the scraper randomizes — we note them as "per-session"
  if (['rnd', 'prehandleLoadTime', 'createIframeStart'].includes(key)) {
    postFieldDiffs.push({
      field: key,
      match: false,
      browserValue: bVal,
      scraperValue: sVal,
      reason: 'Per-session random value — always differs but server likely ignores exact value',
    });
    continue;
  }

  if (['collect', 'tlg'].includes(key)) {
    postFieldDiffs.push({
      field: key,
      match: false,
      browserValue: key === 'collect' ? `<${String(bVal).length} chars>` : bVal,
      scraperValue: sVal,
      reason: key === 'collect'
        ? 'Collect token differs due to cd/sd differences (see collectCd and collectSd sections)'
        : `Token length: browser=${bVal}, scraper=<depends on cd/sd>. Different cd/sd → different token length`,
    });
    continue;
  }

  if (key === 'vData') {
    // vData comparison is separate
    continue;
  }

  const match = String(bVal) === String(sVal);
  const record = {
    field: key,
    match,
    browserValue: bVal,
    scraperValue: sVal,
  };
  if (!match) {
    record.reason = `Structural POST field difference: browser="${bVal}", scraper="${sVal}"`;
  }
  if (match) {
    postFieldMatches.push(record);
  } else {
    postFieldDiffs.push(record);
  }
}

// ─── 5. Compare vData ────────────────────────────────────────────────

const browserVData = verifyPost.vData;
const vDataAnalysis = {
  browserLength: browserVData.length,
  scraperExpectedLength: 152,
  lengthMatch: browserVData.length === 152,
  browserEndsWithPadding: browserVData.endsWith('Y') || browserVData.endsWith('YY'),
  scraperProfile: vdataProfile,
  notes: [
    'vData is 152 chars (14x8-byte XTEA blocks → custom base64 with 65-char alphabet)',
    'Browser vData cannot be decrypted without the build-specific XTEA key',
    'Scraper computes key field from POST body via computeKeyField (char-lookup digest)',
    'Scraper profile: tp="7446039806946242560", py="0", env="0", version="2", cLod="loadTDC", inf="iframe", ss="11%2Ctdc%2Cslide%2Cvm"',
  ],
  potentialDifferences: [],
};

// Check if browser vData structure matches expectations
if (browserVData.length !== 152) {
  vDataAnalysis.potentialDifferences.push({
    field: 'length',
    browser: browserVData.length,
    scraper: 152,
    reason: 'Unexpected browser vData length — may indicate different cipher pipeline or padding',
  });
}

// vData plaintext differences (we can't decrypt browser's, but we can reason about them)
vDataAnalysis.potentialDifferences.push({
  field: 'key',
  reason: 'key is a char-lookup digest of the POST body. Since collect token differs (different cd/sd), ' +
    'the serialized POST body differs, so key differs. This is expected and correct behavior.',
});
vDataAnalysis.potentialDifferences.push({
  field: 'tp',
  reason: 'tp is a captured JS runtime error string. Scraper uses static "7446039806946242560" from profile. ' +
    'Browser value is unknown (encrypted in vData). If browser has a different tp, server could detect this.',
});
vDataAnalysis.potentialDifferences.push({
  field: 'ss',
  reason: 'ss is "11%2Ctdc%2Cslide%2Cvm" in scraper profile. Browser value unknown. ' +
    'This encodes TDC lifecycle state and may differ if browser initialization differs.',
});
vDataAnalysis.potentialDifferences.push({
  field: 'inf',
  reason: 'inf is "iframe" in scraper (window !== window.top in CAPTCHA iframe). ' +
    'Browser should also be "iframe" but verify via dynamic trace.',
});
vDataAnalysis.potentialDifferences.push({
  field: 'cLod',
  reason: 'cLod is "loadTDC" in scraper. Browser value depends on TDC lifecycle. Should match.',
});
vDataAnalysis.potentialDifferences.push({
  field: 'py',
  reason: 'py comes from arguments[1].py in getCaptchaData. Scraper uses "0". ' +
    'Browser value depends on orchestrator — may differ.',
});

// ─── 6. Build summary ───────────────────────────────────────────────

const summary = {
  totalCdFields: fieldMapping.length,
  cdMatching: cdMatches.length,
  cdDiffering: cdDiffs.length,
  sdFields: Object.keys(browserSd).length,
  sdMatching: sdMatches.length,
  sdDiffering: sdDiffs.length,
  postFieldsTotal: Object.keys(verifyPost).length,
  postFieldsMatching: postFieldMatches.length,
  postFieldsDiffering: postFieldDiffs.length,
  criticalDifferences: [],
};

// Identify critical differences (likely server detectors)
for (const d of cdDiffs) {
  if (d.schemaIndex === -1) continue; // behavioral events always differ
  if ([16, 22, 52, 53].includes(d.schemaIndex)) continue; // per-session timestamps
  summary.criticalDifferences.push({
    source: 'cd',
    field: d.fieldName,
    schemaIndex: d.schemaIndex,
    browserValue: summarize(d.browserValue),
    scraperValue: summarize(d.scraperValue),
  });
}

for (const d of sdDiffs) {
  summary.criticalDifferences.push({
    source: 'sd',
    field: d.field,
    browserValue: summarize(d.browserValue),
    scraperValue: summarize(d.scraperValue),
    reason: d.reason,
  });
}

// ─── 7. Write output ─────────────────────────────────────────────────

const report = {
  _generated: new Date().toISOString(),
  _description: 'Phase 49.1: field-by-field diff of scraper (Chrome profile) vs Puppeteer verify POST body',
  postFields: {
    matching: postFieldMatches,
    differing: postFieldDiffs,
  },
  collectCd: {
    matching: cdMatches.length,
    differing: cdDiffs.length,
    diffs: cdDiffs,
    matches: cdMatches,
  },
  collectSd: {
    matching: sdMatches.length,
    differing: sdDiffs.length,
    diffs: sdDiffs,
    matches: sdMatches,
  },
  vData: vDataAnalysis,
  summary,
};

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
fs.writeFileSync(
  path.join(OUTPUT_DIR, 'diff-report.json'),
  JSON.stringify(report, null, 2) + '\n',
  'utf8'
);

// ─── 8. Print human-readable summary ─────────────────────────────────

console.log('=== Phase 49.1: Verify POST Body Diff ===\n');
console.log(`cd fields: ${cdMatches.length}/${fieldMapping.length} match, ${cdDiffs.length} differ`);
console.log(`sd fields: ${sdMatches.length}/${sdMatches.length + sdDiffs.length} match, ${sdDiffs.length} differ`);
console.log(`POST fields: ${postFieldMatches.length}/${postFieldMatches.length + postFieldDiffs.length} match, ${postFieldDiffs.length} differ`);
console.log(`vData: browser=${browserVData.length} chars, scraper=152 chars expected`);

console.log('\n--- CRITICAL cd DIFFERENCES (static fingerprint fields) ---\n');
for (const d of cdDiffs) {
  if (d.schemaIndex === -1) continue;
  if ([16, 22, 52, 53].includes(d.schemaIndex)) continue;
  console.log(`  [${d.schemaIndex}] ${d.fieldName}:`);
  console.log(`    Browser: ${summarize(d.browserValue)}`);
  console.log(`    Scraper: ${summarize(d.scraperValue)}`);
  if (d.reason) console.log(`    Reason:  ${d.reason}`);
  console.log();
}

console.log('--- sd DIFFERENCES ---\n');
for (const d of sdDiffs) {
  console.log(`  ${d.field}:`);
  console.log(`    Browser: ${summarize(d.browserValue)}`);
  console.log(`    Scraper: ${summarize(d.scraperValue)}`);
  if (d.reason) console.log(`    Reason:  ${d.reason}`);
  console.log();
}

console.log('--- POST field DIFFERENCES ---\n');
for (const d of postFieldDiffs) {
  console.log(`  ${d.field}: ${d.reason || ''}`);
}

console.log('\n--- vData ANALYSIS ---\n');
console.log(`  Browser length: ${browserVData.length}`);
console.log(`  Expected scraper length: 152`);
console.log(`  Scraper profile: ${JSON.stringify(vdataProfile)}`);
for (const pd of vDataAnalysis.potentialDifferences) {
  console.log(`  [${pd.field}] ${pd.reason}`);
}

console.log('\n--- SUMMARY: Critical differences the server could detect ---\n');
if (summary.criticalDifferences.length === 0) {
  console.log('  No critical static fingerprint differences found.');
} else {
  for (const c of summary.criticalDifferences) {
    console.log(`  [${c.source}] ${c.field}: browser=${c.browserValue}, scraper=${c.scraperValue}`);
    if (c.reason) console.log(`         ${c.reason}`);
  }
}

console.log('\nReport written to: output/phase-49-body-diff/diff-report.json');
