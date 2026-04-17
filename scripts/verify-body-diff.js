'use strict';

/**
 * verify-body-diff.js — Phase 55.1
 *
 * Compares raw verify POST body strings from Puppeteer (real Chrome)
 * and the scraper, field-by-field at the byte/encoding level.
 *
 * Usage:
 *   node scripts/verify-body-diff.js
 *   node scripts/verify-body-diff.js --puppeteer <path> --scraper <path>
 *   node scripts/verify-body-diff.js --help
 */

const fs = require('fs');
const path = require('path');

// ── CLI arg parsing ──

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node scripts/verify-body-diff.js [options]

Options:
  --puppeteer <path>  Path to Puppeteer raw body file
                      (default: output/puppeteer-capture/verify-raw-body.txt)
  --scraper <path>    Path to scraper raw body file
                      (default: output/phase-55/scraper-verify-body.txt)
  --help, -h          Show this help message

Compares two raw verify POST body strings field-by-field at the
byte/encoding level, highlighting ordering, field set, and encoding
differences between Chrome's jQuery $.param() and Node's URLSearchParams.
`);
  process.exit(0);
}

function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return defaultVal;
  return args[idx + 1];
}

const ROOT = path.resolve(__dirname, '..');
const puppeteerPath = getArg('--puppeteer', path.join(ROOT, 'output', 'puppeteer-capture', 'verify-raw-body.txt'));
const scraperPath = getArg('--scraper', path.join(ROOT, 'output', 'phase-55', 'scraper-verify-body.txt'));

// ── Parse a raw POST body into ordered field list ──

function parseBody(raw) {
  const fields = [];
  const pairs = raw.split('&');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      fields.push({ key: pair, rawKey: pair, rawValue: '', value: '' });
      continue;
    }
    const rawKey = pair.slice(0, eqIdx);
    const rawValue = pair.slice(eqIdx + 1);
    fields.push({
      key: decodeURIComponent(rawKey),
      rawKey,
      rawValue,
      value: decodeURIComponent(rawValue.replace(/\+/g, '%2B')),
    });
  }
  return fields;
}

// ── Encoding difference detection ──

const ENCODING_PATTERNS = [
  { name: '+  vs %2B', a: '+', b: '%2B' },
  { name: '%20 vs +', a: '%20', b: '+' },
  { name: '%3D vs =', a: '%3D', b: '=' },
  { name: '%2F vs /', a: '%2F', b: '/' },
  { name: '%2A vs *', a: '%2A', b: '*' },
  { name: '%21 vs !', a: '%21', b: '!' },
  { name: '%27 vs \'', a: '%27', b: '\'' },
  { name: '%28 vs (', a: '%28', b: '(' },
  { name: '%29 vs )', a: '%29', b: ')' },
  { name: '%7E vs ~', a: '%7E', b: '~' },
];

function findEncodingDiffs(valA, valB) {
  const diffs = [];
  for (const pat of ENCODING_PATTERNS) {
    const aHas = valA.includes(pat.a) || valA.includes(pat.b);
    const bHas = valB.includes(pat.a) || valB.includes(pat.b);
    if (!aHas && !bHas) continue;

    // Count occurrences of each variant in each string
    const countIn = (str, sub) => {
      let count = 0;
      let pos = 0;
      while ((pos = str.indexOf(sub, pos)) !== -1) { count++; pos += sub.length; }
      return count;
    };

    const aCountA = countIn(valA, pat.a);
    const aCountB = countIn(valA, pat.b);
    const bCountA = countIn(valB, pat.a);
    const bCountB = countIn(valB, pat.b);

    if (aCountA !== bCountA || aCountB !== bCountB) {
      diffs.push({
        pattern: pat.name,
        puppeteer: `${pat.a}:${aCountA} ${pat.b}:${aCountB}`,
        scraper: `${pat.a}:${bCountA} ${pat.b}:${bCountB}`,
      });
    }
  }
  return diffs;
}

// ── Encoding demo (Part C) ──

function printEncodingDemo() {
  console.log('=== ENCODING REFERENCE ===\n');

  const testVal = 'abc+def/ghi=jkl==*foo bar~baz';

  // URLSearchParams (what the scraper uses for manual encoding)
  const p = new URLSearchParams();
  p.append('test', testVal);
  const usp = p.toString();

  // encodeURIComponent (raw, closest to jQuery $.param value encoding)
  const euc = 'test=' + encodeURIComponent(testVal);

  // jQuery $.param equivalent: encodeURIComponent but %20 → + and %2A → * (jQuery 1.x quirk)
  const jq = 'test=' + encodeURIComponent(testVal).replace(/%20/g, '+');

  console.log(`  Test value:          ${testVal}`);
  console.log(`  URLSearchParams:     ${usp}`);
  console.log(`  encodeURIComponent:  ${euc}`);
  console.log(`  jQuery $.param():    ${jq}`);
  console.log();

  // Highlight differences
  console.log('  Key differences:');
  console.log('    Spaces: URLSearchParams → "+"   jQuery → "+"   (same)');
  console.log('    *:      URLSearchParams → "%2A" jQuery → "%2A" (same in modern jQuery)');
  console.log('    Note: older jQuery (1.x) replaced %20→+ but modern jQuery uses + for spaces too.');
  console.log('    The critical difference is in KEY encoding, not value encoding.');
  console.log();
}

// ── Main ──

function main() {
  printEncodingDemo();

  // Load files
  let puppeteerRaw, scraperRaw;
  try {
    puppeteerRaw = fs.readFileSync(puppeteerPath, 'utf8').trim();
  } catch (err) {
    console.error(`Cannot read Puppeteer body file: ${puppeteerPath}`);
    console.error(`  ${err.message}`);
    console.error('  Run the Puppeteer captcha-solver first to generate this file.');
    process.exit(1);
  }
  try {
    scraperRaw = fs.readFileSync(scraperPath, 'utf8').trim();
  } catch (err) {
    console.error(`Cannot read scraper body file: ${scraperPath}`);
    console.error(`  ${err.message}`);
    console.error('  Run the scraper first to generate this file.');
    process.exit(1);
  }

  console.log('=== BODY LENGTH ===\n');
  console.log(`  Puppeteer: ${puppeteerRaw.length} chars`);
  console.log(`  Scraper:   ${scraperRaw.length} chars`);
  console.log(`  Delta:     ${scraperRaw.length - puppeteerRaw.length} chars`);
  console.log();

  // Parse
  const ppFields = parseBody(puppeteerRaw);
  const scFields = parseBody(scraperRaw);

  console.log('=== FIELD COUNT ===\n');
  console.log(`  Puppeteer: ${ppFields.length} fields`);
  console.log(`  Scraper:   ${scFields.length} fields`);
  console.log();

  // Field order comparison
  console.log('=== FIELD ORDER ===\n');
  const ppKeys = ppFields.map(f => f.key);
  const scKeys = scFields.map(f => f.key);
  const maxLen = Math.max(ppKeys.length, scKeys.length);
  let orderMatch = true;
  console.log('  #    Puppeteer                  Scraper                   Match');
  console.log('  ---  -------------------------  -------------------------  -----');
  for (let i = 0; i < maxLen; i++) {
    const pk = ppKeys[i] || '(missing)';
    const sk = scKeys[i] || '(missing)';
    const match = pk === sk ? '  OK' : '  DIFF';
    if (pk !== sk) orderMatch = false;
    console.log(`  ${String(i + 1).padStart(3)}  ${pk.padEnd(25)}  ${sk.padEnd(25)}  ${match}`);
  }
  console.log();
  console.log(`  Order match: ${orderMatch ? 'YES' : 'NO'}`);
  console.log();

  // Field set diff
  const ppKeySet = new Set(ppKeys);
  const scKeySet = new Set(scKeys);
  const onlyPP = ppKeys.filter(k => !scKeySet.has(k));
  const onlySC = scKeys.filter(k => !ppKeySet.has(k));

  console.log('=== FIELD SET DIFF ===\n');
  if (onlyPP.length === 0 && onlySC.length === 0) {
    console.log('  Field sets are identical.');
  } else {
    if (onlyPP.length > 0) {
      console.log(`  Only in Puppeteer (${onlyPP.length}):`);
      for (const k of onlyPP) console.log(`    - ${k}`);
    }
    if (onlySC.length > 0) {
      console.log(`  Only in Scraper (${onlySC.length}):`);
      for (const k of onlySC) console.log(`    - ${k}`);
    }
  }
  console.log();

  // Per-field value comparison
  const ppMap = new Map(ppFields.map(f => [f.key, f]));
  const scMap = new Map(scFields.map(f => [f.key, f]));
  const sharedKeys = ppKeys.filter(k => scKeySet.has(k));

  console.log('=== PER-FIELD VALUE COMPARISON ===\n');

  const identicalFields = [];
  const diffFields = [];

  for (const key of sharedKeys) {
    const pp = ppMap.get(key);
    const sc = scMap.get(key);

    if (pp.rawValue === sc.rawValue) {
      identicalFields.push(key);
    } else {
      const encDiffs = findEncodingDiffs(pp.rawValue, sc.rawValue);
      const decodedMatch = pp.value === sc.value;
      diffFields.push({ key, pp, sc, encDiffs, decodedMatch });
    }
  }

  console.log(`  Identical raw values: ${identicalFields.length} fields`);
  if (identicalFields.length > 0) {
    console.log(`    ${identicalFields.join(', ')}`);
  }
  console.log();

  if (diffFields.length > 0) {
    console.log(`  Different raw values: ${diffFields.length} fields\n`);
    for (const d of diffFields) {
      const maxShow = 120;
      const ppShow = d.pp.rawValue.length > maxShow
        ? d.pp.rawValue.slice(0, maxShow) + '...'
        : d.pp.rawValue;
      const scShow = d.sc.rawValue.length > maxShow
        ? d.sc.rawValue.slice(0, maxShow) + '...'
        : d.sc.rawValue;

      console.log(`  Field: ${d.key}`);
      console.log(`    Decoded values match: ${d.decodedMatch ? 'YES (encoding-only diff)' : 'NO (semantic diff)'}`);
      console.log(`    Puppeteer (${d.pp.rawValue.length} chars): ${ppShow}`);
      console.log(`    Scraper   (${d.sc.rawValue.length} chars): ${scShow}`);

      if (d.encDiffs.length > 0) {
        console.log('    Encoding differences:');
        for (const ed of d.encDiffs) {
          console.log(`      ${ed.pattern}: puppeteer=[${ed.puppeteer}] scraper=[${ed.scraper}]`);
        }
      }

      // Find first byte where they differ
      const minLen = Math.min(d.pp.rawValue.length, d.sc.rawValue.length);
      for (let i = 0; i < minLen; i++) {
        if (d.pp.rawValue[i] !== d.sc.rawValue[i]) {
          const ctx = 20;
          const start = Math.max(0, i - ctx);
          const ppCtx = d.pp.rawValue.slice(start, i + ctx);
          const scCtx = d.sc.rawValue.slice(start, i + ctx);
          console.log(`    First diff at char ${i}:`);
          console.log(`      Puppeteer: ...${ppCtx}...`);
          console.log(`      Scraper:   ...${scCtx}...`);
          break;
        }
      }
      if (d.pp.rawValue.length !== d.sc.rawValue.length) {
        console.log(`    Length diff: puppeteer=${d.pp.rawValue.length} scraper=${d.sc.rawValue.length} (delta=${d.sc.rawValue.length - d.pp.rawValue.length})`);
      }
      console.log();
    }
  } else {
    console.log('  All shared fields have identical raw values.');
    console.log();
  }

  // Summary
  console.log('=== SUMMARY ===\n');
  console.log(`  Body lengths:      puppeteer=${puppeteerRaw.length} scraper=${scraperRaw.length} delta=${scraperRaw.length - puppeteerRaw.length}`);
  console.log(`  Field counts:      puppeteer=${ppFields.length} scraper=${scFields.length}`);
  console.log(`  Field order:       ${orderMatch ? 'MATCH' : 'MISMATCH'}`);
  console.log(`  Only in puppeteer: ${onlyPP.length > 0 ? onlyPP.join(', ') : 'none'}`);
  console.log(`  Only in scraper:   ${onlySC.length > 0 ? onlySC.join(', ') : 'none'}`);
  console.log(`  Identical values:  ${identicalFields.length}/${sharedKeys.length}`);
  console.log(`  Different values:  ${diffFields.length}/${sharedKeys.length}`);
  const encodingOnly = diffFields.filter(d => d.decodedMatch).length;
  const semanticDiff = diffFields.filter(d => !d.decodedMatch).length;
  console.log(`    Encoding-only:   ${encodingOnly}`);
  console.log(`    Semantic diffs:  ${semanticDiff}`);
  console.log();
}

main();
