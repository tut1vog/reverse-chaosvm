'use strict';

/**
 * verify-request-diff.js — Phase 62.1
 *
 * Reads two verify-request dump files (produced by the DUMP_VERIFY env var
 * hook in captcha-client.js httpRequest()) and diffs them field-by-field.
 *
 * Usage:
 *   # Step 1: run the scraper path
 *   DUMP_VERIFY=scraper node tools/scraper/cli.js --captcha-only --verbose
 *
 *   # Step 2: run the standalone (tls-experiment) path
 *   DUMP_VERIFY=standalone node scripts/tls-experiment.js --verbose
 *
 *   # Step 3: diff
 *   node scripts/verify-request-diff.js
 *
 *   # Or specify custom file names:
 *   node scripts/verify-request-diff.js <fileA> <fileB>
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DUMP_DIR = path.join(PROJECT_ROOT, 'output', 'phase-62');

const args = process.argv.slice(2);
const fileA = args[0] || path.join(DUMP_DIR, 'scraper.json');
const fileB = args[1] || path.join(DUMP_DIR, 'standalone.json');

// --- Load dumps ---
function loadDump(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error('ERROR: File not found: ' + filePath);
    console.error('Run with DUMP_VERIFY=<name> to generate dump files first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const dumpA = loadDump(fileA);
const dumpB = loadDump(fileB);

const labelA = path.basename(fileA, '.json');
const labelB = path.basename(fileB, '.json');

// --- Diff helpers ---
function diffScalar(name, a, b) {
  if (a === b) return null;
  return { field: name, [labelA]: a, [labelB]: b };
}

function diffHeaders(headersA, headersB) {
  const allKeys = new Set([
    ...Object.keys(headersA || {}),
    ...Object.keys(headersB || {}),
  ]);
  const diffs = [];
  for (const key of [...allKeys].sort()) {
    const va = (headersA || {})[key];
    const vb = (headersB || {})[key];
    if (va === vb) continue;
    if (va === undefined) {
      diffs.push({ header: key, diff: 'ONLY in ' + labelB, value: vb });
    } else if (vb === undefined) {
      diffs.push({ header: key, diff: 'ONLY in ' + labelA, value: va });
    } else {
      diffs.push({ header: key, diff: 'VALUES DIFFER', [labelA]: va, [labelB]: vb });
    }
  }
  return diffs;
}

// --- Run diff ---
console.log('=== Verify Request Diff ===');
console.log('  A (' + labelA + '): ' + fileA);
console.log('  B (' + labelB + '): ' + fileB);
console.log('');

// 1. URL
const urlDiff = diffScalar('url', dumpA.url, dumpB.url);
if (urlDiff) {
  console.log('--- URL ---');
  console.log('  ' + labelA + ': ' + urlDiff[labelA]);
  console.log('  ' + labelB + ': ' + urlDiff[labelB]);
  console.log('');
} else {
  console.log('--- URL: IDENTICAL ---');
  console.log('  ' + dumpA.url);
  console.log('');
}

// 2. Method
const methodDiff = diffScalar('method', dumpA.method, dumpB.method);
if (methodDiff) {
  console.log('--- METHOD ---');
  console.log('  ' + labelA + ': ' + methodDiff[labelA]);
  console.log('  ' + labelB + ': ' + methodDiff[labelB]);
  console.log('');
} else {
  console.log('--- METHOD: IDENTICAL (' + dumpA.method + ') ---');
  console.log('');
}

// 3. Headers
const headerDiffs = diffHeaders(dumpA.headers, dumpB.headers);
if (headerDiffs.length === 0) {
  console.log('--- HEADERS: IDENTICAL ---');
  console.log('  (' + Object.keys(dumpA.headers).length + ' headers)');
} else {
  console.log('--- HEADERS: ' + headerDiffs.length + ' DIFFERENCE(S) ---');
  for (const hd of headerDiffs) {
    if (hd.diff.startsWith('ONLY')) {
      console.log('  [' + hd.diff + '] ' + hd.header + ': ' + hd.value);
    } else {
      console.log('  [' + hd.diff + '] ' + hd.header + ':');
      console.log('    ' + labelA + ': ' + hd[labelA]);
      console.log('    ' + labelB + ': ' + hd[labelB]);
    }
  }
}
console.log('');

// 4. Body length
const lenDiff = diffScalar('bodyLength', dumpA.bodyLength, dumpB.bodyLength);
if (lenDiff) {
  console.log('--- BODY LENGTH ---');
  console.log('  ' + labelA + ': ' + lenDiff[labelA]);
  console.log('  ' + labelB + ': ' + lenDiff[labelB]);
} else {
  console.log('--- BODY LENGTH: IDENTICAL (' + dumpA.bodyLength + ') ---');
}
console.log('');

// 5. Body MD5
const md5Diff = diffScalar('bodyMd5', dumpA.bodyMd5, dumpB.bodyMd5);
if (md5Diff) {
  console.log('--- BODY MD5 ---');
  console.log('  ' + labelA + ': ' + md5Diff[labelA]);
  console.log('  ' + labelB + ': ' + md5Diff[labelB]);
  console.log('  (bodies differ — check prefix/suffix below)');
} else {
  console.log('--- BODY MD5: IDENTICAL (' + dumpA.bodyMd5 + ') ---');
}
console.log('');

// 6. Body prefix diff (first 500 chars)
if (dumpA.bodyPrefix !== dumpB.bodyPrefix) {
  console.log('--- BODY PREFIX (first 500 chars) ---');
  // Try to show field-level diffs by splitting on &
  const fieldsA = (dumpA.bodyPrefix || '').split('&');
  const fieldsB = (dumpB.bodyPrefix || '').split('&');
  const maxLen = Math.max(fieldsA.length, fieldsB.length);
  const fieldDiffs = [];
  for (let i = 0; i < maxLen; i++) {
    const fa = fieldsA[i] || '(missing)';
    const fb = fieldsB[i] || '(missing)';
    if (fa !== fb) {
      fieldDiffs.push({ pos: i, [labelA]: fa, [labelB]: fb });
    }
  }
  if (fieldDiffs.length > 0) {
    console.log('  Field-level diffs in prefix:');
    for (const fd of fieldDiffs) {
      console.log('    [pos ' + fd.pos + ']');
      console.log('      ' + labelA + ': ' + fd[labelA].slice(0, 120));
      console.log('      ' + labelB + ': ' + fd[labelB].slice(0, 120));
    }
  }
} else {
  console.log('--- BODY PREFIX: IDENTICAL ---');
}
console.log('');

// 7. Body suffix diff (last 200 chars)
if (dumpA.bodySuffix !== dumpB.bodySuffix) {
  console.log('--- BODY SUFFIX (last 200 chars) ---');
  console.log('  ' + labelA + ': ' + (dumpA.bodySuffix || '').slice(0, 120));
  console.log('  ' + labelB + ': ' + (dumpB.bodySuffix || '').slice(0, 120));
} else {
  console.log('--- BODY SUFFIX: IDENTICAL ---');
}
console.log('');

// 8. Cookie header comparison (special attention)
const cookieA = (dumpA.headers || {})['Cookie'] || (dumpA.headers || {})['cookie'] || '(none)';
const cookieB = (dumpB.headers || {})['Cookie'] || (dumpB.headers || {})['cookie'] || '(none)';
console.log('--- COOKIE HEADER ---');
if (cookieA === cookieB) {
  console.log('  IDENTICAL: ' + cookieA.slice(0, 120));
} else {
  console.log('  ' + labelA + ': ' + cookieA.slice(0, 200));
  console.log('  ' + labelB + ': ' + cookieB.slice(0, 200));
}
console.log('');

// 9. Summary
const totalDiffs = (urlDiff ? 1 : 0) +
  (methodDiff ? 1 : 0) +
  headerDiffs.length +
  (lenDiff ? 1 : 0) +
  (md5Diff ? 1 : 0);

console.log('=== SUMMARY ===');
console.log('  Total differences: ' + totalDiffs);
if (totalDiffs === 0) {
  console.log('  Requests are IDENTICAL at the wire level.');
  console.log('  If one gets errorCode 0 and the other -1, the cause is NOT in the request data.');
  console.log('  Investigate: TLS fingerprint, HTTP/2 vs HTTP/1.1, TCP-level differences.');
} else {
  console.log('  Found differences — these may explain the errorCode discrepancy.');
}
