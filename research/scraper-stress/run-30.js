'use strict';

/**
 * run-30.js — Research driver that invokes Scraper.solveCaptcha() N times
 * against the live urlsec.qq.com CAPTCHA endpoint (maxRetries:1 per run,
 * one verify-attempt per iteration) and writes per-run results plus a
 * summary to output/scraper-stress/.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'scraper-stress');

const Scraper = require(path.join(PROJECT_ROOT, 'tools', 'scraper', 'scraper'));

function printUsage() {
  process.stdout.write(
    'Usage: node research/scraper-stress/run-30.js [--count <N>] [--delay-ms <M>]\n' +
    '\n' +
    'Stress-tests the pure-Node scraper end-to-end against urlsec.qq.com.\n' +
    '\n' +
    'Options:\n' +
    '  --count <N>      Number of iterations (default 30)\n' +
    '  --delay-ms <M>   Sleep between iterations in ms (default 1500)\n' +
    '  --help           Show this message and exit\n'
  );
}

function parseArgs(argv) {
  const args = { count: 30, delayMs: 1500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      args.help = true;
      return args;
    } else if (a === '--count') {
      args.count = parseInt(argv[++i], 10);
      if (!Number.isFinite(args.count) || args.count < 1) {
        throw new Error('--count must be a positive integer');
      }
    } else if (a === '--delay-ms') {
      args.delayMs = parseInt(argv[++i], 10);
      if (!Number.isFinite(args.delayMs) || args.delayMs < 0) {
        throw new Error('--delay-ms must be a non-negative integer');
      }
    } else {
      throw new Error('Unknown argument: ' + a);
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a single iteration. Returns a fully-populated row.
 */
async function runIteration(index) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  // Silence-buffer stderr for the duration of the iteration so the user
  // isn't drowned in scraper verbose logs. We still capture every chunk so
  // we can regex out the fields we need.
  let captured = '';
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = function (chunk) {
    captured += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    return true;
  };

  const row = {
    index,
    startedAt,
    elapsedMs: 0,
    tdcName: null,
    sourceHash: null,
    caseCount: null,
    templateLabel: null,
    success: false,
    errorCode: null,
    ticketPresent: false,
    randstrPresent: false,
    failureKind: null,
    errorMessage: null,
  };

  try {
    try {
      const s = new Scraper({ maxRetries: 1, verbose: true });
      await s.init();
      const result = await s.solveCaptcha();
      const ec = (result && typeof result.errorCode === 'number') ? result.errorCode : null;
      const ticketPresent = !!(result && result.ticket);
      const randstrPresent = !!(result && result.randstr);
      const success = ec === 0 || (ec === -1 && ticketPresent);
      row.errorCode = ec;
      row.ticketPresent = ticketPresent;
      row.randstrPresent = randstrPresent;
      row.success = success;
      if (!success) {
        // Non-throwing non-success path: bucket under errorCode-N if we have one.
        if (typeof ec === 'number') {
          row.failureKind = 'errorCode-' + ec;
        } else {
          row.failureKind = 'other';
        }
        row.errorMessage = 'Non-throwing non-success: ' + JSON.stringify(result);
      }
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      row.errorMessage = msg;
      if (/^Unknown template/.test(msg)) {
        row.failureKind = 'auto-port-failed';
      } else {
        const m = msg.match(/CAPTCHA verify returned errorCode (-?\d+)/);
        if (m) {
          const parsed = parseInt(m[1], 10);
          row.errorCode = parsed;
          row.failureKind = 'errorCode-' + parsed;
        } else {
          row.failureKind = 'other';
        }
      }
    }
  } finally {
    process.stderr.write = origWrite;
  }

  // Regex the captured verbose log for the three fields we want.
  const mTdc = captured.match(/TDC_NAME:\s*(\S+)/);
  if (mTdc) row.tdcName = mTdc[1];
  const mHash = captured.match(/Source hash:\s*(\S+)/);
  if (mHash) row.sourceHash = mHash[1];
  const mTpl = captured.match(/Template:\s*(\S+?),\s*opcodes:\s*(\d+)/);
  if (mTpl) {
    row.templateLabel = mTpl[1];
    row.caseCount = parseInt(mTpl[2], 10);
  }

  row.elapsedMs = Date.now() - t0;
  return row;
}

function bucketKey(row) {
  if (row.failureKind === 'auto-port-failed') return 'auto-port-failed';
  if (typeof row.errorCode === 'number') return String(row.errorCode);
  return 'other';
}

function buildSummary(rows) {
  const totals = { count: rows.length, success: 0, fail: 0 };
  const errorCodeHistogram = {};
  const autoPortFailures = [];
  const perTdcName = {};

  for (const r of rows) {
    if (r.success) totals.success++;
    else totals.fail++;

    const key = bucketKey(r);
    errorCodeHistogram[key] = (errorCodeHistogram[key] || 0) + 1;

    if (r.failureKind === 'auto-port-failed') {
      autoPortFailures.push({
        index: r.index,
        sourceHash: r.sourceHash,
        tdcName: r.tdcName,
        errorMessage: r.errorMessage,
      });
    }

    if (r.tdcName) {
      if (!perTdcName[r.tdcName]) {
        perTdcName[r.tdcName] = { count: 0, successCount: 0, errorCodes: {} };
      }
      const bucket = perTdcName[r.tdcName];
      bucket.count++;
      if (r.success) bucket.successCount++;
      const ek = bucketKey(r);
      bucket.errorCodes[ek] = (bucket.errorCodes[ek] || 0) + 1;
    }
  }

  return { totals, errorCodeHistogram, autoPortFailures, perTdcName };
}

function formatMarkdown(summary, rows) {
  const { totals, errorCodeHistogram, autoPortFailures, perTdcName } = summary;
  const out = [];
  out.push('# Scraper stress test — N=' + totals.count + ' runs');
  out.push('');
  out.push('Totals: count=' + totals.count + ', success=' + totals.success + ', fail=' + totals.fail);
  out.push('');

  out.push('## errorCode histogram');
  out.push('');
  out.push('| bucket | count |');
  out.push('|---|---|');
  const bucketKeys = Object.keys(errorCodeHistogram).sort((a, b) => {
    const an = parseInt(a, 10);
    const bn = parseInt(b, 10);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    if (Number.isFinite(an)) return -1;
    if (Number.isFinite(bn)) return 1;
    return a.localeCompare(b);
  });
  for (const k of bucketKeys) {
    out.push('| ' + k + ' | ' + errorCodeHistogram[k] + ' |');
  }
  out.push('');

  out.push('## Auto-port failures (' + autoPortFailures.length + ')');
  out.push('');
  if (autoPortFailures.length === 0) {
    out.push('_none_');
  } else {
    out.push('| idx | sourceHash | TDC_NAME | errorMessage |');
    out.push('|---|---|---|---|');
    for (const f of autoPortFailures) {
      out.push('| ' + f.index + ' | ' + (f.sourceHash || '') + ' | ' + (f.tdcName || '') +
        ' | ' + (f.errorMessage ? f.errorMessage.replace(/\|/g, '\\|').replace(/\n/g, ' ') : '') + ' |');
    }
  }
  out.push('');

  out.push('## Per-TDC_NAME breakdown');
  out.push('');
  const names = Object.keys(perTdcName).sort();
  if (names.length === 0) {
    out.push('_none_');
  } else {
    out.push('| TDC_NAME | count | successCount | errorCodes |');
    out.push('|---|---|---|---|');
    for (const n of names) {
      const b = perTdcName[n];
      const codes = Object.keys(b.errorCodes).sort().map((k) => k + '=' + b.errorCodes[k]).join(', ');
      out.push('| ' + n + ' | ' + b.count + ' | ' + b.successCount + ' | ' + codes + ' |');
    }
  }
  out.push('');

  out.push('## Rows');
  out.push('');
  out.push('| idx | success | errorCode | hash[:8] | TDC_NAME | caseCount | elapsedMs | failureKind |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const hashShort = r.sourceHash ? r.sourceHash.slice(0, 8) : '';
    out.push('| ' + r.index + ' | ' + r.success + ' | ' + (r.errorCode === null ? '' : r.errorCode) +
      ' | ' + hashShort + ' | ' + (r.tdcName || '') + ' | ' + (r.caseCount === null ? '' : r.caseCount) +
      ' | ' + r.elapsedMs + ' | ' + (r.failureKind || '') + ' |');
  }
  out.push('');
  return out.join('\n');
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write('[stress] argument error: ' + err.message + '\n');
    printUsage();
    process.exit(2);
  }
  if (args.help) {
    printUsage();
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const rows = [];
  const t0 = Date.now();
  process.stdout.write('[stress] starting: count=' + args.count + ', delayMs=' + args.delayMs + '\n');

  for (let i = 1; i <= args.count; i++) {
    const row = await runIteration(i);
    rows.push(row);
    const hashShort = row.sourceHash ? row.sourceHash.slice(0, 8) : 'null';
    process.stdout.write(
      '[stress] ' + i + '/' + args.count +
      ' success=' + row.success +
      ' errorCode=' + (row.errorCode === null ? 'null' : row.errorCode) +
      ' hash=' + hashShort +
      ' failureKind=' + (row.failureKind || '-') +
      ' elapsedMs=' + row.elapsedMs +
      '\n'
    );
    if (i < args.count) {
      await sleep(args.delayMs);
    }
  }

  const totalElapsedMs = Date.now() - t0;
  const summary = buildSummary(rows);

  const jsonPayload = {
    generatedAt: new Date().toISOString(),
    totalElapsedMs,
    args,
    totals: summary.totals,
    errorCodeHistogram: summary.errorCodeHistogram,
    autoPortFailures: summary.autoPortFailures,
    perTdcName: summary.perTdcName,
    rows,
  };

  const jsonPath = path.join(OUTPUT_DIR, 'results.json');
  const mdPath = path.join(OUTPUT_DIR, 'results.md');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2) + '\n');
  fs.writeFileSync(mdPath, formatMarkdown(summary, rows) + '\n');

  process.stdout.write('\n[stress] done in ' + totalElapsedMs + ' ms\n');
  process.stdout.write('[stress] totals: count=' + summary.totals.count +
    ', success=' + summary.totals.success + ', fail=' + summary.totals.fail + '\n');
  process.stdout.write('[stress] histogram: ' + JSON.stringify(summary.errorCodeHistogram) + '\n');
  process.stdout.write('[stress] results.json -> ' + jsonPath + '\n');
  process.stdout.write('[stress] results.md   -> ' + mdPath + '\n');
}

main().catch((err) => {
  process.stderr.write('[stress] fatal: ' + (err && err.stack ? err.stack : err) + '\n');
  process.exit(1);
});
