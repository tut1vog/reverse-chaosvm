'use strict';

/**
 * post-body-compare.js — Field-by-field comparison of scraper output vs browser capture
 *
 * Generates a collect token using the scraper's current code (with the same session
 * params as a successful browser capture), then compares the pre-encryption cd array
 * and sd structure against the browser's decrypted values.
 *
 * Usage: node scripts/post-body-compare.js
 *
 * Output: output/post-body-diff.json + stdout summary
 */

const fs = require('fs');
const path = require('path');

const { buildDefaultCdArray } = require('../token/collector-schema.js');
const {
  reorderCdArray,
  generateBehavioralEvents,
  buildSlideSd,
} = require('../scraper/collect-generator.js');

// ═══════════════════════════════════════════════════════════════════════
// Paths
// ═══════════════════════════════════════════════════════════════════════

const ROOT = path.resolve(__dirname, '..');
const CAPTURE_DIR = path.join(ROOT, 'output', 'puppeteer-capture');
const VERIFY_POST_PATH = path.join(CAPTURE_DIR, 'verify-post.json');
const COLLECT_DECRYPTED_PATH = path.join(CAPTURE_DIR, 'collect-decrypted.json');
const FIELD_MAPPING_PATH = path.join(CAPTURE_DIR, 'field-mapping.json');
const TEMPLATES_PATH = path.join(ROOT, 'scraper', 'cache', 'templates.json');
const PROFILE_PATH = path.join(ROOT, 'profiles', 'default.json');
const OUTPUT_PATH = path.join(ROOT, 'output', 'post-body-diff.json');

// ═══════════════════════════════════════════════════════════════════════
// Dynamic fields — fields that change per session, not real mismatches
// ═══════════════════════════════════════════════════════════════════════

const DYNAMIC_FIELDS = new Set([
  'timestampInit',
  'timestampCollectionEnd',
  'timestampCollectionStart',
  'canvasHash',
  'mathFingerprint',
  'performanceHash',
  'webglImage',
  'behavioralEvents',
]);

// ═══════════════════════════════════════════════════════════════════════
// Critical / high severity field sets
// ═══════════════════════════════════════════════════════════════════════

const CRITICAL_FIELDS = new Set([
  'userAgent',
  'webglRenderer',
  'platform',
  'webdriverFlag',
  'headlessFlag',
  'userAgentData',
  'highEntropyValues',
  'pageUrl',
]);

const HIGH_FIELDS = new Set([
  'detectedFonts',
  'vendor',
  'screenResolution',
  'maxTouchPoints',
  'maxTouchPointsDup',
  'audioFingerprint',
  'osPlatform',
  'languages',
  'videoCodecs',
  'screenPosition',
]);

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function summarize(val) {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  const s = JSON.stringify(val);
  if (s.length > 120) return s.slice(0, 117) + '...';
  return s;
}

function classifyField(fieldName, browserVal, scraperVal) {
  if (DYNAMIC_FIELDS.has(fieldName)) {
    return { status: 'dynamic', severity: 'info' };
  }
  if (deepEqual(browserVal, scraperVal)) {
    return { status: 'match', severity: 'info' };
  }
  // Mismatch — classify severity
  let severity = 'medium';
  if (CRITICAL_FIELDS.has(fieldName)) severity = 'critical';
  else if (HIGH_FIELDS.has(fieldName)) severity = 'high';
  return { status: 'mismatch', severity };
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

function main() {
  // Load ground truth files
  const verifyPost = JSON.parse(fs.readFileSync(VERIFY_POST_PATH, 'utf8'));
  const collectDecrypted = JSON.parse(fs.readFileSync(COLLECT_DECRYPTED_PATH, 'utf8'));
  const fieldMapping = JSON.parse(fs.readFileSync(FIELD_MAPPING_PATH, 'utf8'));
  const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
  const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));

  const browserCd = collectDecrypted.browser.cd;
  const browserSd = collectDecrypted.browser.sd;

  // ─── Find a 98-opcode template and its cdFieldOrder ───
  let cdFieldOrder = null;
  let templateName = null;
  for (const [name, entry] of Object.entries(templates)) {
    if (entry.caseCount === 98 && entry.cdFieldOrder) {
      cdFieldOrder = entry.cdFieldOrder;
      templateName = name;
      break;
    }
  }
  if (!cdFieldOrder) {
    console.error('ERROR: No template with caseCount=98 and cdFieldOrder found in templates.json');
    process.exit(1);
  }
  console.log(`Using template: ${templateName} (caseCount=98, ${cdFieldOrder.length} fields)`);

  // ─── Build scraper cd array with browser's session-specific values ───
  // Override dynamic/session-specific fields to match browser for apples-to-apples comparison
  const overriddenProfile = Object.assign({}, profile, {
    // Use browser's values for session-specific fields
    pageUrl: browserCd[41], // browserIndex 41 = pageUrl
    timestamp: browserCd[14], // browserIndex 14 = timestampInit
    timestampCollectionEnd: browserCd[31], // browserIndex 31
    timestampCollectionStart: browserCd[52], // browserIndex 52
    canvasHash: browserCd[30], // browserIndex 30
    mathFingerprint: browserCd[48], // browserIndex 48
    performanceHash: browserCd[32], // browserIndex 32
    webglImage: browserCd[16], // browserIndex 16
  });

  // Build the 59-element cd array in schema order
  const baseCdArray = buildDefaultCdArray(overriddenProfile);

  // Generate behavioral events matching the browser's slide answer
  // Browser ans is "500,87;" → x=500, y=87
  const ansMatch = verifyPost.ans.match(/(\d+),(\d+)/);
  const xAnswer = ansMatch ? parseInt(ansMatch[1]) : 500;
  const slideY = ansMatch ? parseInt(ansMatch[2]) : 87;

  // Use browser's init timestamp for behavioral events
  const browserBehavioralEvents = browserCd[55]; // browserIndex 55 = behavioralEvents
  let initTimestamp = Date.now();
  if (Array.isArray(browserBehavioralEvents) && browserBehavioralEvents.length > 0) {
    initTimestamp = browserBehavioralEvents[0][3]; // init event timestamp
  }
  const mockBehavioralEvents = generateBehavioralEvents(xAnswer, slideY, initTimestamp);

  // Reorder to template order (59 → 60 fields with behavioralEvents inserted)
  const scraperCd = reorderCdArray(baseCdArray, cdFieldOrder, mockBehavioralEvents);

  // ─── cd array comparison ───
  const totalFields = Math.max(browserCd.length, scraperCd.length);
  let matchCount = 0;
  let dynamicCount = 0;
  let mismatchCount = 0;
  const fieldResults = [];

  for (let i = 0; i < totalFields; i++) {
    const mapping = fieldMapping[i] || {};
    const fieldName = mapping.fieldName || `unknown_${i}`;
    const browserVal = i < browserCd.length ? browserCd[i] : undefined;
    const scraperVal = i < scraperCd.length ? scraperCd[i] : undefined;

    const { status, severity } = classifyField(fieldName, browserVal, scraperVal);

    if (status === 'match') matchCount++;
    else if (status === 'dynamic') dynamicCount++;
    else mismatchCount++;

    const entry = {
      index: i,
      fieldName,
      browserValue: summarize(browserVal),
      scraperValue: summarize(scraperVal),
      status,
      severity,
    };

    // Add notes for interesting cases
    if (status === 'mismatch') {
      if (fieldName === 'videoCodecs') {
        entry.notes = 'Check if behavioral events are being spliced into H.264 codec string';
      } else if (fieldName === 'detectedFonts') {
        entry.notes = 'Browser hashes fonts to a numeric string; scraper sends font list';
      } else if (fieldName === 'screenPosition') {
        entry.notes = 'Browser: "1;0", scraper uses default "0;0" — screenX;screenY';
      }
    } else if (status === 'dynamic') {
      entry.notes = 'Session-specific — overridden to browser values for comparison';
    }

    fieldResults.push(entry);
  }

  // ─── sd comparison ───
  // Build scraper sd for comparison
  // Use browser's slide answer
  const browserSlideValue = browserSd.slideValue || [];
  const scraperSd = buildSlideSd(
    { x: 10, y: 60 }, // browser's coordinate x,y
    browserSlideValue,
    {
      trycnt: browserSd.trycnt || 1,
      refreshcnt: browserSd.refreshcnt || 0,
      ft: browserSd.ft, // use browser's ft for comparison
      elapsed: browserSd.coordinate ? browserSd.coordinate[2] : 1000,
    }
  );

  const browserSdKeys = Object.keys(browserSd).sort();
  const scraperSdKeys = Object.keys(scraperSd).sort();
  const missingInScraperSd = browserSdKeys.filter(k => !scraperSdKeys.includes(k));
  const extraInScraperSd = scraperSdKeys.filter(k => !browserSdKeys.includes(k));

  const sdFieldDiffs = [];
  for (const key of browserSdKeys) {
    const bVal = browserSd[key];
    const sVal = scraperSd[key];
    if (sVal === undefined) {
      sdFieldDiffs.push({ field: key, browser: summarize(bVal), scraper: 'MISSING', status: 'missing' });
    } else if (key === 'slideValue') {
      // Compare structure only — count of entries
      const bCount = Array.isArray(bVal) ? bVal.length : 0;
      const sCount = Array.isArray(sVal) ? sVal.length : 0;
      sdFieldDiffs.push({
        field: key,
        browser: `${bCount} entries`,
        scraper: `${sCount} entries`,
        status: bCount === sCount ? 'match' : 'mismatch',
        notes: 'Compared entry count only (values are dynamic)',
      });
    } else if (key === 'coordinate') {
      // Compare structure — length and approximate values
      const match = deepEqual(bVal, sVal);
      sdFieldDiffs.push({
        field: key,
        browser: summarize(bVal),
        scraper: summarize(sVal),
        status: match ? 'match' : 'mismatch',
      });
    } else {
      const match = deepEqual(bVal, sVal);
      sdFieldDiffs.push({
        field: key,
        browser: summarize(bVal),
        scraper: summarize(sVal),
        status: match ? 'match' : 'mismatch',
      });
    }
  }
  for (const key of extraInScraperSd) {
    sdFieldDiffs.push({ field: key, browser: 'MISSING', scraper: summarize(scraperSd[key]), status: 'extra' });
  }

  // ─── POST field comparison ───
  const browserPostKeys = Object.keys(verifyPost).sort();
  const scraperPostKeys = [
    'aid', 'protocol', 'accver', 'showtype', 'ua', 'noheader', 'fb',
    'aged', 'enableAged', 'enableDarkMode', 'grayscale', 'dyeid', 'clientype',
    'sess', 'fwidth', 'sid', 'wxLang', 'tcScale', 'uid', 'cap_cd',
    'rnd', 'prehandleLoadTime', 'createIframeStart', 'global', 'subsid',
    'cdata', 'ans', 'vsig', 'websig', 'subcapclass', 'pow_answer',
    'pow_calc_time', 'collect', 'tlg', 'fpinfo', 'eks', 'nonce', 'vlg',
  ].sort();

  const missingInScraperPost = browserPostKeys.filter(k => !scraperPostKeys.includes(k));
  const extraInScraperPost = scraperPostKeys.filter(k => !browserPostKeys.includes(k));

  // ─── Build summary ───
  const criticalIssues = fieldResults
    .filter(f => f.status === 'mismatch' && f.severity === 'critical')
    .map(f => `[${f.index}] ${f.fieldName}: browser=${f.browserValue}, scraper=${f.scraperValue}`);
  const highIssues = fieldResults
    .filter(f => f.status === 'mismatch' && f.severity === 'high')
    .map(f => `[${f.index}] ${f.fieldName}: browser=${f.browserValue}, scraper=${f.scraperValue}`);
  const mediumIssues = fieldResults
    .filter(f => f.status === 'mismatch' && f.severity === 'medium')
    .map(f => `[${f.index}] ${f.fieldName}: browser=${f.browserValue}, scraper=${f.scraperValue}`);

  // ─── Build output JSON ───
  const result = {
    timestamp: new Date().toISOString(),
    description: 'Field-by-field comparison of scraper output vs known-good browser capture',
    templateUsed: templateName,
    cdComparison: {
      totalFields,
      matching: matchCount,
      dynamic: dynamicCount,
      mismatched: mismatchCount,
      fields: fieldResults,
    },
    sdComparison: {
      browserFields: browserSdKeys,
      scraperFields: scraperSdKeys,
      missingInScraper: missingInScraperSd,
      extraInScraper: extraInScraperSd,
      fieldDiffs: sdFieldDiffs,
    },
    postFieldComparison: {
      browserFields: browserPostKeys,
      scraperFields: scraperPostKeys,
      missingInScraper: missingInScraperPost,
      extraInScraper: extraInScraperPost,
    },
    summary: {
      criticalIssues,
      highIssues,
      mediumIssues,
    },
  };

  // ─── Write output ───
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2) + '\n');
  console.log(`\nOutput written to: ${OUTPUT_PATH}\n`);

  // ─── Print readable summary ───
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  POST Body Comparison: Scraper vs Browser Capture');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`cd array: ${totalFields} fields total`);
  console.log(`  Matching:   ${matchCount}`);
  console.log(`  Dynamic:    ${dynamicCount} (session-specific, overridden)`);
  console.log(`  Mismatched: ${mismatchCount}\n`);

  if (criticalIssues.length > 0) {
    console.log('CRITICAL issues (detection signals):');
    criticalIssues.forEach(i => console.log(`  ${i}`));
    console.log();
  }

  if (highIssues.length > 0) {
    console.log('HIGH issues (likely affect validation):');
    highIssues.forEach(i => console.log(`  ${i}`));
    console.log();
  }

  if (mediumIssues.length > 0) {
    console.log('MEDIUM issues:');
    mediumIssues.forEach(i => console.log(`  ${i}`));
    console.log();
  }

  // sd comparison
  console.log('sd comparison:');
  const sdMismatches = sdFieldDiffs.filter(d => d.status !== 'match');
  if (sdMismatches.length === 0) {
    console.log('  All fields match.');
  } else {
    sdMismatches.forEach(d => {
      console.log(`  ${d.field}: ${d.status} — browser=${d.browser}, scraper=${d.scraper}`);
    });
  }
  console.log();

  // POST fields
  console.log('Verify POST fields:');
  if (missingInScraperPost.length > 0) {
    console.log(`  Missing in scraper: ${missingInScraperPost.join(', ')}`);
  }
  if (extraInScraperPost.length > 0) {
    console.log(`  Extra in scraper: ${extraInScraperPost.join(', ')}`);
  }
  if (missingInScraperPost.length === 0 && extraInScraperPost.length === 0) {
    console.log('  Field sets match.');
  }
  console.log();

  // Exit code: non-zero if critical issues found
  if (criticalIssues.length > 0) {
    console.log(`RESULT: ${criticalIssues.length} critical, ${highIssues.length} high, ${mediumIssues.length} medium issues found.`);
  } else if (highIssues.length > 0) {
    console.log(`RESULT: ${highIssues.length} high, ${mediumIssues.length} medium issues found.`);
  } else if (mediumIssues.length > 0) {
    console.log(`RESULT: ${mediumIssues.length} medium issues found.`);
  } else {
    console.log('RESULT: All non-dynamic fields match!');
  }
}

main();
