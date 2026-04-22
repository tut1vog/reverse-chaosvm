'use strict';

/**
 * run.js — Phase 71 XFF spoof experiment driver. Invokes the scraper CLI
 * sequentially N times across a list of header-spoof conditions, parses each
 * run's verbose stdout/stderr, and persists per-attempt records plus a
 * per-condition summary to output/xff-spoof/ (or a caller-supplied --out).
 *
 * The driver is mechanics only — the experiment matrix, the interpretation,
 * and the real-network execution are deferred to task 71.4.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SCRAPER_CLI = path.join(PROJECT_ROOT, 'tools', 'scraper', 'cli.js');
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'output', 'xff-spoof');

const USAGE = `
Usage:
  node research/xff-spoof/run.js --config <path> [--out <dir>] [--dry-run]
  node research/xff-spoof/run.js --condition <name> --header "Name: VALUE_OR_TEMPLATE" \\
    [--condition <name> --header "Name: VALUE_OR_TEMPLATE" ...] \\
    --n <int> [--calibration-n <int>] [--post-control] [--out <dir>] [--dry-run]
  node research/xff-spoof/run.js --help

Options:
  --config <path>          JSON file with {conditions, n, calibrationN, postControl}.
                           Conditions: [{name, headers: [{name, value} | {name, valueTemplate}]}].
                           Supported valueTemplate: "RFC5737_RANDOM_IP" (mints a fresh
                           documentation-block IP per attempt).
  --condition <name>       Inline condition name. Repeatable; each --condition starts a
                           new condition. Subsequent --header flags attach to the most
                           recent --condition until the next one.
  --header "Name: VALUE"   Header for the current inline condition. VALUE may be a literal
                           or the template token "RFC5737_RANDOM_IP".
  --n <int>                Attempts per condition (treatment + post-control).
  --calibration-n <int>    Pre-treatment control attempts (no extra headers). Default 2.
                           If ALL calibration attempts return errorCode 12 the run aborts
                           before any treatment fires and writes nothing under --out.
  --post-control           After all treatment conditions, run another N control attempts
                           labeled "control_post" so 71.4 can rule out window expiry.
  --out <dir>              Output directory. Default: output/xff-spoof/.
  --dry-run                Replace the scraper subprocess with an in-process stub.
                           No network I/O. Use for driver verification.
  --dry-run-fail-calibration
                           Dry-run only: force calibration attempts to return errorCode 12
                           (exercises the calibration-abort path).
  --help, -h               Show this help.
`.trim();

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    configPath: null,
    inlineConditions: [],
    n: null,
    calibrationN: 2,
    postControl: false,
    outDir: DEFAULT_OUT,
    dryRun: false,
    dryRunFailCalibration: false,
    help: false,
  };

  let currentInline = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      args.help = true;
    } else if (a === '--config') {
      args.configPath = argv[++i];
      if (!args.configPath) throw new Error('--config requires a path');
    } else if (a === '--condition') {
      const name = argv[++i];
      if (!name) throw new Error('--condition requires a name');
      currentInline = { name: name, headers: [] };
      args.inlineConditions.push(currentInline);
    } else if (a === '--header') {
      const raw = argv[++i];
      if (raw === undefined) throw new Error('--header requires a "Name: Value" argument');
      if (!currentInline) throw new Error('--header must follow a --condition');
      const colonIdx = raw.indexOf(':');
      if (colonIdx === -1) throw new Error('--header value must be "Name: Value": ' + raw);
      const hname = raw.slice(0, colonIdx).trim();
      const hval = raw.slice(colonIdx + 1).trim();
      if (!hname) throw new Error('--header has empty name: ' + raw);
      if (!hval) throw new Error('--header has empty value: ' + raw);
      const entry = { name: hname };
      if (hval === 'RFC5737_RANDOM_IP') {
        entry.valueTemplate = 'RFC5737_RANDOM_IP';
      } else {
        entry.value = hval;
      }
      currentInline.headers.push(entry);
    } else if (a === '--n') {
      args.n = parseInt(argv[++i], 10);
      if (!Number.isFinite(args.n) || args.n < 1) {
        throw new Error('--n must be a positive integer');
      }
    } else if (a === '--calibration-n') {
      args.calibrationN = parseInt(argv[++i], 10);
      if (!Number.isFinite(args.calibrationN) || args.calibrationN < 0) {
        throw new Error('--calibration-n must be a non-negative integer');
      }
    } else if (a === '--post-control') {
      args.postControl = true;
    } else if (a === '--out') {
      args.outDir = argv[++i];
      if (!args.outDir) throw new Error('--out requires a directory path');
      if (!path.isAbsolute(args.outDir)) {
        args.outDir = path.resolve(process.cwd(), args.outDir);
      }
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--dry-run-fail-calibration') {
      args.dryRunFailCalibration = true;
    } else {
      throw new Error('Unknown argument: ' + a);
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Configuration assembly — config file or inline flags
// ---------------------------------------------------------------------------

function loadConfig(args) {
  let conditions, n, calibrationN, postControl;

  if (args.configPath) {
    const raw = fs.readFileSync(args.configPath, 'utf8');
    const cfg = JSON.parse(raw);
    if (!Array.isArray(cfg.conditions) || cfg.conditions.length === 0) {
      throw new Error('config.conditions must be a non-empty array');
    }
    if (!Number.isFinite(cfg.n) || cfg.n < 1) {
      throw new Error('config.n must be a positive integer');
    }
    conditions = cfg.conditions;
    n = cfg.n;
    calibrationN = Number.isFinite(cfg.calibrationN) ? cfg.calibrationN : 2;
    postControl = !!cfg.postControl;
  } else {
    if (args.inlineConditions.length === 0) {
      throw new Error('No conditions specified — use --config or --condition/--header');
    }
    if (args.n === null) {
      throw new Error('--n is required with inline conditions');
    }
    conditions = args.inlineConditions;
    n = args.n;
    calibrationN = args.calibrationN;
    postControl = args.postControl;
  }

  for (const c of conditions) {
    if (!c.name || typeof c.name !== 'string') {
      throw new Error('Each condition must have a string "name"');
    }
    if (!Array.isArray(c.headers)) {
      throw new Error('Condition "' + c.name + '" must have a headers array');
    }
    for (const h of c.headers) {
      if (!h.name || typeof h.name !== 'string') {
        throw new Error('Each header must have a string "name"');
      }
      if (h.valueTemplate === undefined && (h.value === undefined || h.value === null)) {
        throw new Error('Header "' + h.name + '" must have value or valueTemplate');
      }
      if (h.valueTemplate !== undefined && h.valueTemplate !== 'RFC5737_RANDOM_IP') {
        throw new Error('Unknown valueTemplate: ' + h.valueTemplate);
      }
    }
  }

  return { conditions: conditions, n: n, calibrationN: calibrationN, postControl: postControl };
}

// ---------------------------------------------------------------------------
// Header materialization — resolve templates per attempt
// ---------------------------------------------------------------------------

// RFC 5737 documentation-only ranges. Three /24 blocks; never routed.
const RFC5737_BLOCKS = ['192.0.2.', '198.51.100.', '203.0.113.'];

function mintRfc5737Ip() {
  const block = RFC5737_BLOCKS[Math.floor(Math.random() * RFC5737_BLOCKS.length)];
  // Host octet 1..254 (skip .0 network and .255 broadcast).
  const host = 1 + Math.floor(Math.random() * 254);
  return block + host;
}

function materializeHeaders(headerSpecs) {
  const out = {};
  for (const h of headerSpecs) {
    let v;
    if (h.valueTemplate === 'RFC5737_RANDOM_IP') {
      v = mintRfc5737Ip();
    } else {
      v = h.value;
    }
    out[h.name] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scraper invocation — real subprocess or dry-run stub
//
// Sequential execution is intentional and load-bearing: each /cap_union_new_verify
// POST returns one ticket and consumes one slot in the per-IP rate window. Running
// scrapers in parallel would (1) muddy the IP-window signal we are trying to measure,
// (2) make per-attempt timing meaningless, and (3) burn IP budget faster than we can
// reason about. Awaiting one spawn at a time is the correct shape here.
// ---------------------------------------------------------------------------

function spawnScraper(materializedHeaders, opts) {
  return new Promise((resolve) => {
    const cliArgs = ['--captcha-only', '--verbose'];
    for (const [name, value] of Object.entries(materializedHeaders)) {
      cliArgs.push('--extra-header', name + ': ' + value);
    }

    const t0 = Date.now();
    const child = spawn(process.execPath, [SCRAPER_CLI].concat(cliArgs), {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

    child.on('close', (code) => {
      resolve({
        exitCode: code,
        stdout: stdout,
        stderr: stderr,
        elapsedMs: Date.now() - t0,
      });
    });
    child.on('error', (err) => {
      resolve({
        exitCode: -1,
        stdout: '',
        stderr: 'spawn error: ' + err.message,
        elapsedMs: Date.now() - t0,
      });
    });
  });
}

function dryRunStub(materializedHeaders, dryRunOpts) {
  // Synthesize a stdout JSON that mimics the real scraper's success shape, plus
  // a tiny bit of stderr that mimics the verbose log fields the parser scans for.
  // The "force" knobs let the verification scripts exercise the calibration-abort
  // path and the success path without changing the parser logic.
  let errorCode;
  if (dryRunOpts.forceCalibrationFail && dryRunOpts.phase === 'control_pre') {
    errorCode = 12;
  } else {
    errorCode = 0;
  }

  const ticket = errorCode === 0
    ? 'tDRYRUN_' + Math.random().toString(16).slice(2, 18) + '_padded_for_truncation_test'
    : '';
  const randstr = errorCode === 0 ? '@DRY' : '';

  const result = { errorCode: errorCode, ticket: ticket, randstr: randstr };

  const stderrLines = [
    '[scraper] Init complete',
    '[scraper]   TDC_NAME: DRYRUNTEMPLATEXXXXXXXXXXXXXXXXXX',
    '[scraper]   Source hash: 0d2af00ddeadbeef0000000000000000000000000000000000000000000000ff',
    '[scraper]   Template: A, opcodes: 95',
    '[scraper]   errorCode: ' + errorCode + ', ticket: ' + (ticket ? ticket.slice(0, 30) + '...' : 'none'),
  ];

  // Mimic the failure-path messaging when ec != 0 so the parser's failure path
  // is also exercised by dry-run.
  let exitCode;
  let stdout;
  if (errorCode === 0 || (errorCode === -1 && ticket)) {
    exitCode = 0;
    stdout = JSON.stringify(result, null, 2) + '\n';
  } else {
    exitCode = 1;
    stdout = '';
    stderrLines.push('Error: CAPTCHA solve failed after 3 attempts: CAPTCHA verify returned errorCode ' + errorCode);
  }

  const elapsedMs = 5 + Math.floor(Math.random() * 10);
  return Promise.resolve({
    exitCode: exitCode,
    stdout: stdout,
    stderr: stderrLines.join('\n') + '\n',
    elapsedMs: elapsedMs,
  });
}

// ---------------------------------------------------------------------------
// Output parsing — JSON on stdout for success, regex-over-stderr for everything
// else. The stderr verbose lines are stable: scraper.js always logs `TDC_NAME:`,
// `Source hash:`, and `errorCode: <n>` in the same shape. We tolerate missing
// fields rather than fail the run.
// ---------------------------------------------------------------------------

function parseRunOutput(spawnResult) {
  const parsed = {
    exitCode: spawnResult.exitCode,
    elapsedMs: spawnResult.elapsedMs,
    errorCode: null,
    ticket: '',
    randstr: '',
    sourceHashShort: null,
    tdcName: null,
    errorKind: null,
    stderrTail: null,
  };

  // Try the success-path stdout JSON first.
  if (spawnResult.exitCode === 0 && spawnResult.stdout) {
    try {
      const obj = JSON.parse(spawnResult.stdout);
      if (typeof obj.errorCode === 'number') parsed.errorCode = obj.errorCode;
      if (typeof obj.ticket === 'string') parsed.ticket = obj.ticket;
      if (typeof obj.randstr === 'string') parsed.randstr = obj.randstr;
    } catch (_e) {
      // Fall through to stderr parsing.
    }
  }

  // Always also scan stderr — TDC_NAME and source hash live there regardless,
  // and on failure the errorCode lives there too.
  const stderr = spawnResult.stderr || '';

  // Take the LAST occurrence of these — multi-attempt scraper runs print them
  // once per attempt, and we want the final one.
  const ecMatches = [...stderr.matchAll(/errorCode:\s*(-?\d+)/g)];
  if (parsed.errorCode === null && ecMatches.length > 0) {
    const last = ecMatches[ecMatches.length - 1];
    parsed.errorCode = parseInt(last[1], 10);
  }
  // Failure-line form: "errorCode 12" (no colon). Pick this up too.
  if (parsed.errorCode === null) {
    const failMatch = stderr.match(/CAPTCHA verify returned errorCode (-?\d+)/);
    if (failMatch) parsed.errorCode = parseInt(failMatch[1], 10);
  }

  const tdcMatches = [...stderr.matchAll(/TDC_NAME:\s*(\S+)/g)];
  if (tdcMatches.length > 0) {
    parsed.tdcName = tdcMatches[tdcMatches.length - 1][1];
  }
  const hashMatches = [...stderr.matchAll(/Source hash:\s*([0-9a-f]+)/g)];
  if (hashMatches.length > 0) {
    parsed.sourceHashShort = hashMatches[hashMatches.length - 1][1].slice(0, 12);
  }

  if (spawnResult.exitCode !== 0) {
    parsed.errorKind = 'subprocess-failure';
    parsed.stderrTail = stderr.slice(-200);
  } else if (parsed.errorCode !== null && parsed.errorCode !== 0 &&
             !(parsed.errorCode === -1 && parsed.ticket)) {
    parsed.errorKind = 'errorCode-' + parsed.errorCode;
  }

  return parsed;
}

function truncateTicket(ticket) {
  if (!ticket) return '';
  if (ticket.length <= 16) return ticket;
  return ticket.slice(0, 16) + '…';
}

// ---------------------------------------------------------------------------
// Run loop
// ---------------------------------------------------------------------------

function isSuccess(parsed) {
  return parsed.exitCode === 0 && (
    parsed.errorCode === 0 ||
    (parsed.errorCode === -1 && parsed.ticket)
  );
}

async function runOneAttempt(condition, attemptIndex, totalAttempts, opts) {
  const headers = materializeHeaders(condition.headers);
  const phase = condition.__phase || 'treatment';
  const dryRunOpts = {
    forceCalibrationFail: opts.dryRunFailCalibration,
    phase: phase,
  };
  const spawnResult = opts.dryRun
    ? await dryRunStub(headers, dryRunOpts)
    : await spawnScraper(headers, {});

  const parsed = parseRunOutput(spawnResult);
  const record = {
    ts: new Date().toISOString(),
    condition: condition.name,
    attempt: attemptIndex,
    headers: headers,
    exitCode: parsed.exitCode,
    errorCode: parsed.errorCode,
    ticket: truncateTicket(parsed.ticket),
    elapsedMs: parsed.elapsedMs,
    sourceHashShort: parsed.sourceHashShort,
    tdcName: parsed.tdcName,
  };
  if (parsed.errorKind) record.errorKind = parsed.errorKind;
  if (parsed.stderrTail) record.stderrTail = parsed.stderrTail;

  process.stderr.write(
    '[' + attemptIndex + '/' + totalAttempts + '] condition=' + condition.name +
    ' ec=' + (record.errorCode === null ? 'null' : record.errorCode) +
    ' elapsed=' + (record.elapsedMs / 1000).toFixed(1) + 's\n'
  );

  return { record: record, parsed: parsed };
}

function buildSummary(records, conditionsOrder) {
  const perCondition = {};
  for (const r of records) {
    if (!perCondition[r.condition]) {
      perCondition[r.condition] = {
        condition: r.condition,
        n: 0,
        successCount: 0,
        errorCodeHistogram: {},
        headerProfile: Object.keys(r.headers).slice().sort(),
      };
    }
    const bucket = perCondition[r.condition];
    bucket.n++;
    if (r.errorCode === 0 || (r.errorCode === -1 && r.ticket)) {
      bucket.successCount++;
    }
    const key = (r.errorCode === null) ? 'null' : String(r.errorCode);
    bucket.errorCodeHistogram[key] = (bucket.errorCodeHistogram[key] || 0) + 1;
  }
  // Preserve condition order from the run itself.
  const ordered = [];
  for (const name of conditionsOrder) {
    if (perCondition[name]) ordered.push(perCondition[name]);
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write('[xff-spoof] argument error: ' + err.message + '\n\n');
    process.stderr.write(USAGE + '\n');
    process.exit(2);
  }
  if (args.help) {
    process.stdout.write(USAGE + '\n');
    return;
  }

  let cfg;
  try {
    cfg = loadConfig(args);
  } catch (err) {
    process.stderr.write('[xff-spoof] config error: ' + err.message + '\n');
    process.exit(2);
  }

  // Build the run plan: control_pre (calibration), then each treatment condition,
  // then optional control_post.
  const calibrationCondition = { name: 'control_pre', headers: [], __phase: 'control_pre' };
  const treatmentConditions = cfg.conditions.map((c) => Object.assign({}, c, { __phase: 'treatment' }));
  const postControlCondition = cfg.postControl
    ? { name: 'control_post', headers: [], __phase: 'control_post' }
    : null;

  // Calibration first — never write artefacts before calibration succeeds.
  const calibrationRecords = [];
  let calibrationFailedAll = cfg.calibrationN > 0;
  if (cfg.calibrationN > 0) {
    process.stderr.write('[xff-spoof] calibration: ' + cfg.calibrationN + ' control attempts (no extra headers)\n');
    for (let i = 1; i <= cfg.calibrationN; i++) {
      const { record, parsed } = await runOneAttempt(
        calibrationCondition, i, cfg.calibrationN,
        { dryRun: args.dryRun, dryRunFailCalibration: args.dryRunFailCalibration }
      );
      calibrationRecords.push(record);
      if (parsed.errorCode !== 12) calibrationFailedAll = false;
    }
    if (calibrationFailedAll) {
      process.stderr.write(
        '[xff-spoof] ABORT: all ' + cfg.calibrationN + ' calibration attempts returned errorCode 12 ' +
        '(IP appears already burned). Refusing to clobber prior results.\n'
      );
      process.exit(3);
    }
  }

  // Calibration OK (or skipped) — safe to (re)create the output dir and start
  // writing artefacts. Truncate runs.jsonl now so a successful run starts clean.
  fs.mkdirSync(args.outDir, { recursive: true });
  const runsPath = path.join(args.outDir, 'runs.jsonl');
  const summaryPath = path.join(args.outDir, 'summary.json');
  fs.writeFileSync(runsPath, '');

  const allRecords = [];
  const conditionsOrder = [];

  function appendRecord(rec) {
    fs.appendFileSync(runsPath, JSON.stringify(rec) + '\n');
    allRecords.push(rec);
    if (!conditionsOrder.includes(rec.condition)) conditionsOrder.push(rec.condition);
  }

  for (const rec of calibrationRecords) appendRecord(rec);

  // Treatment conditions, sequentially.
  for (const cond of treatmentConditions) {
    process.stderr.write('[xff-spoof] condition: ' + cond.name + ' (' + cfg.n + ' attempts)\n');
    for (let i = 1; i <= cfg.n; i++) {
      const { record } = await runOneAttempt(
        cond, i, cfg.n,
        { dryRun: args.dryRun, dryRunFailCalibration: args.dryRunFailCalibration }
      );
      appendRecord(record);
    }
  }

  // Post-control.
  if (postControlCondition) {
    process.stderr.write('[xff-spoof] post-control: ' + cfg.n + ' control attempts (no extra headers)\n');
    for (let i = 1; i <= cfg.n; i++) {
      const { record } = await runOneAttempt(
        postControlCondition, i, cfg.n,
        { dryRun: args.dryRun, dryRunFailCalibration: false }
      );
      appendRecord(record);
    }
  }

  const perCondition = buildSummary(allRecords, conditionsOrder);
  const summary = {
    generatedAt: new Date().toISOString(),
    totalAttempts: allRecords.length,
    calibrationN: cfg.calibrationN,
    treatmentN: cfg.n,
    postControl: cfg.postControl,
    dryRun: args.dryRun,
    perCondition: perCondition,
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');

  process.stdout.write('xff-spoof run complete\n');
  process.stdout.write('  total attempts: ' + summary.totalAttempts + '\n');
  for (const c of perCondition) {
    const histo = Object.keys(c.errorCodeHistogram).sort()
      .map((k) => k + '=' + c.errorCodeHistogram[k]).join(', ');
    process.stdout.write(
      '  ' + c.condition + ': n=' + c.n + ', success=' + c.successCount + ', codes=[' + histo + ']\n'
    );
  }
  process.stdout.write('  runs.jsonl  -> ' + runsPath + '\n');
  process.stdout.write('  summary.json -> ' + summaryPath + '\n');
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write('[xff-spoof] fatal: ' + (err && err.stack ? err.stack : err) + '\n');
    process.exit(1);
  });
}

module.exports = { parseArgs, mintRfc5737Ip, materializeHeaders, parseRunOutput, truncateTicket };
