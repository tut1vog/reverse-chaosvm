'use strict';

/**
 * port-all.js — Research driver that runs the auto-porting pipeline against
 * every tdc.js source fetched by fetch-30.js and writes a consolidated survey
 * (results.json + results.md) capturing outcome, template, opcode/key fields,
 * verify status, and dedup consistency across repeated source hashes.
 */

const fs = require('fs');
const path = require('path');

const { portVersion } = require('../../tools/porting-pipeline/run.js');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SURVEY_DIR = path.join(PROJECT_ROOT, 'output', 'port-survey');
const SOURCES_DIR = path.join(SURVEY_DIR, 'sources');
const SOURCES_INDEX = path.join(SURVEY_DIR, 'sources.json');
const RESULTS_JSON = path.join(SURVEY_DIR, 'results.json');
const RESULTS_MD = path.join(SURVEY_DIR, 'results.md');

/**
 * Classify template by decoded case count — duplicated from
 * tools/porting-pipeline/run.js since it is not exported.
 * @param {number|null} caseCount
 * @returns {string}
 */
function classifyTemplate(caseCount) {
  if (caseCount === 95) return 'A';
  if (caseCount === 94) return 'B';
  if (caseCount === 100) return 'C';
  return 'unknown';
}

/**
 * Format a 32-bit unsigned integer as hex string like 0x6257584F.
 * @param {number} n
 * @returns {string}
 */
function hex32(n) {
  return '0x' + ((n >>> 0).toString(16).toUpperCase().padStart(8, '0'));
}

/**
 * Parse CLI flags. Supports --limit N / --limit=N for smoke testing.
 * @param {string[]} argv
 * @returns {{limit: number|null}}
 */
function parseArgs(argv) {
  let limit = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--limit') {
      const next = argv[i + 1];
      const parsed = parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error('--limit requires a positive integer');
      }
      limit = parsed;
      i++;
    } else if (arg.startsWith('--limit=')) {
      const parsed = parseInt(arg.slice('--limit='.length), 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error('--limit requires a positive integer');
      }
      limit = parsed;
    }
  }
  return { limit: limit };
}

/**
 * Build a survey row from an entry + portVersion result. Always returns a
 * full-shape object so downstream processing can rely on every field.
 * @param {object} entry
 * @param {object|null} result
 * @param {Error|null} err
 * @returns {object}
 */
function buildRow(entry, result, err) {
  if (err) {
    return {
      index: entry.index,
      sourceHash: entry.sourceHash,
      TDC_NAME: entry.TDC_NAME,
      caseCount: null,
      template: null,
      mappedOpcodes: null,
      unmappedOpcodes: null,
      xteaKeyHex: null,
      success: false,
      failedStage: 'throw',
      error: err && err.message ? err.message : String(err),
      verifyMatch: null,
      liveTokenLength: null,
      standaloneTokenLength: null,
      outputDir: null
    };
  }

  const caseCount = (result.parsed && typeof result.parsed.caseCount === 'number')
    ? result.parsed.caseCount
    : null;
  const template = caseCount !== null ? classifyTemplate(caseCount) : null;

  const opcodeTable = result.mapped && result.mapped.opcodeTable;
  const mappedOpcodes = opcodeTable ? (Object.keys(opcodeTable).length || null) : null;
  const unmapped = result.mapped && result.mapped.unmapped;
  const unmappedOpcodes = Array.isArray(unmapped) ? unmapped.length : null;

  const keyArr = result.keyResult && result.keyResult.key;
  const xteaKeyHex = Array.isArray(keyArr) ? keyArr.map(hex32) : null;

  const verifyResult = result.verifyResult || null;

  return {
    index: entry.index,
    sourceHash: entry.sourceHash,
    TDC_NAME: entry.TDC_NAME,
    caseCount: caseCount,
    template: template,
    mappedOpcodes: mappedOpcodes,
    unmappedOpcodes: unmappedOpcodes,
    xteaKeyHex: xteaKeyHex,
    success: !!result.success,
    failedStage: result.failedStage,
    error: result.error,
    verifyMatch: verifyResult && typeof verifyResult.match === 'boolean' ? verifyResult.match : null,
    liveTokenLength: verifyResult && typeof verifyResult.liveTokenLength === 'number' ? verifyResult.liveTokenLength : null,
    standaloneTokenLength: verifyResult && typeof verifyResult.standaloneTokenLength === 'number' ? verifyResult.standaloneTokenLength : null,
    outputDir: result.outputDir || null
  };
}

/**
 * Decide an outcome bucket for a row.
 * @param {object} row
 * @returns {'fully_green'|'verify_mismatch'|'stage_failures'}
 */
function bucketOf(row) {
  if (row.success && row.verifyMatch === true) return 'fully_green';
  if (row.success && row.verifyMatch === false) return 'verify_mismatch';
  return 'stage_failures';
}

/**
 * Truncate a string for table display.
 * @param {string|null} s
 * @param {number} max
 * @returns {string}
 */
function shortErr(s, max) {
  if (s === null || s === undefined) return '';
  const one = String(s).replace(/\s+/g, ' ').trim();
  if (one.length <= max) return one;
  return one.slice(0, max - 1) + '…';
}

/**
 * Format a markdown pipe-table. Escapes pipe characters in cells.
 * @param {string[]} headers
 * @param {Array<Array<string|number|null>>} rows
 * @returns {string}
 */
function mdTable(headers, rows) {
  const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/\|/g, '\\|');
  const head = '| ' + headers.join(' | ') + ' |';
  const sep = '| ' + headers.map(() => '---').join(' | ') + ' |';
  const body = rows.map((r) => '| ' + r.map(esc).join(' | ') + ' |').join('\n');
  return [head, sep, body].filter(Boolean).join('\n');
}

/**
 * Build results.md content.
 * @param {object[]} rows
 * @returns {string}
 */
function buildMarkdown(rows) {
  const buckets = { fully_green: [], verify_mismatch: [], stage_failures: [] };
  for (const r of rows) buckets[bucketOf(r)].push(r);

  const uniqueHashes = new Set(rows.map((r) => r.sourceHash)).size;

  const lines = [];
  lines.push('# Port Survey Results');
  lines.push('');
  lines.push('total=' + rows.length +
    ', fully_green=' + buckets.fully_green.length +
    ', verify_mismatch=' + buckets.verify_mismatch.length +
    ', stage_failures=' + buckets.stage_failures.length +
    ', unique_hashes=' + uniqueHashes);
  lines.push('');

  const outcomeHeaders = ['index', 'sourceHash[:8]', 'TDC_NAME', 'template', 'caseCount', 'failedStage', 'error(short)'];
  const toRow = (r) => [
    r.index,
    r.sourceHash ? r.sourceHash.slice(0, 8) : '',
    r.TDC_NAME || '',
    r.template || '',
    r.caseCount === null || r.caseCount === undefined ? '' : r.caseCount,
    r.failedStage === null || r.failedStage === undefined ? '' : r.failedStage,
    shortErr(r.error, 80)
  ];

  lines.push('## Outcomes');
  lines.push('');
  lines.push('### fully_green (' + buckets.fully_green.length + ')');
  lines.push('');
  lines.push(buckets.fully_green.length
    ? mdTable(outcomeHeaders, buckets.fully_green.map(toRow))
    : '_none_');
  lines.push('');
  lines.push('### verify_mismatch (' + buckets.verify_mismatch.length + ')');
  lines.push('');
  lines.push(buckets.verify_mismatch.length
    ? mdTable(outcomeHeaders, buckets.verify_mismatch.map(toRow))
    : '_none_');
  lines.push('');
  lines.push('### stage_failures (' + buckets.stage_failures.length + ')');
  lines.push('');
  lines.push(buckets.stage_failures.length
    ? mdTable(outcomeHeaders, buckets.stage_failures.map(toRow))
    : '_none_');
  lines.push('');

  // Dedup consistency
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.sourceHash)) groups.set(r.sourceHash, []);
    groups.get(r.sourceHash).push(r);
  }

  const dedupRows = [];
  let anyDisagree = false;
  for (const [hash, group] of groups.entries()) {
    const signature = (r) => JSON.stringify({
      success: r.success,
      failedStage: r.failedStage,
      template: r.template,
      caseCount: r.caseCount,
      verifyMatch: r.verifyMatch
    });
    const sigs = new Set(group.map(signature));
    const agree = sigs.size === 1;
    if (!agree) anyDisagree = true;
    const indices = group.map((r) => r.index).join(',');
    dedupRows.push([
      hash ? hash.slice(0, 8) : '',
      indices,
      agree ? 'yes' : 'NO'
    ]);
  }

  lines.push('## Dedup consistency');
  lines.push('');
  if (anyDisagree) {
    lines.push('**WARNING: at least one sourceHash group has disagreeing outcomes — nondeterminism bug.**');
    lines.push('');
  }
  lines.push(mdTable(['sourceHash[:8]', 'indices', 'outcomes_agree'], dedupRows));
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const { limit } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(SOURCES_INDEX)) {
    throw new Error('sources.json not found at ' + SOURCES_INDEX + ' — run fetch-30.js first');
  }
  const raw = fs.readFileSync(SOURCES_INDEX, 'utf8');
  let entries = JSON.parse(raw);
  if (!Array.isArray(entries)) throw new Error('sources.json is not an array');
  entries = entries.slice().sort((a, b) => String(a.index).localeCompare(String(b.index)));

  if (limit !== null) entries = entries.slice(0, limit);

  const rows = [];
  const startedAt = Date.now();

  for (const entry of entries) {
    const sourcePath = path.join(SOURCES_DIR, 'tdc-' + entry.index + '.js');
    let result = null;
    let err = null;
    try {
      result = await portVersion(sourcePath, {});
    } catch (e) {
      err = e;
    }
    const row = buildRow(entry, result, err);
    rows.push(row);

    const hash8 = row.sourceHash ? row.sourceHash.slice(0, 8) : '????????';
    const tpl = row.template || '?';
    const stage = row.failedStage === null || row.failedStage === undefined ? '-' : row.failedStage;
    let vtag;
    if (row.verifyMatch === true) vtag = 'match';
    else if (row.verifyMatch === false) vtag = 'mismatch';
    else vtag = 'n/a';
    process.stdout.write('[port-all] ' + row.index + '/' + entries.length +
      ' hash=' + hash8 +
      ' template=' + tpl +
      ' success=' + row.success +
      ' stage=' + stage +
      ' verify=' + vtag + '\n');
  }

  fs.mkdirSync(SURVEY_DIR, { recursive: true });
  fs.writeFileSync(RESULTS_JSON, JSON.stringify(rows, null, 2) + '\n');
  fs.writeFileSync(RESULTS_MD, buildMarkdown(rows));

  const buckets = { fully_green: 0, verify_mismatch: 0, stage_failures: 0 };
  for (const r of rows) buckets[bucketOf(r)]++;
  const uniqueHashes = new Set(rows.map((r) => r.sourceHash)).size;
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

  process.stdout.write('[port-all] DONE total=' + rows.length +
    ' fully_green=' + buckets.fully_green +
    ' verify_mismatch=' + buckets.verify_mismatch +
    ' stage_failures=' + buckets.stage_failures +
    ' unique_hashes=' + uniqueHashes +
    ' elapsed=' + elapsedSec + 's\n');
}

main().catch((err) => {
  process.stderr.write('[port-all] fatal: ' + (err && err.stack ? err.stack : String(err)) + '\n');
  process.exit(1);
});
