#!/usr/bin/env node
'use strict';

// Phase 43 task 43.3 — CLI for the standalone vData cipher encoder.
// Phase 44.5a — extended with a `replay` subcommand for replay-with-
// substitution from a captured 8-field fingerprint object.
// Phase 44.5b — extended with a `from-obj` subcommand for full-synthesis
// from-scratch vData from an 8-field obj (no caller-supplied order).
//
// Cipher-only usage (Phase 43, unchanged):
//   node tools/scraper/vdata-generator/cli.js --plaintext-hex <224-hex-char string>
//   echo <hex> | node tools/scraper/vdata-generator/cli.js
//
// Replay usage (Phase 44.5a):
//   node tools/scraper/vdata-generator/cli.js replay --obj <obj.json> [--order <order.json>] [--overrides <ov.json>]
//   node tools/scraper/vdata-generator/cli.js replay --self-check
//
// From-obj usage (Phase 44.5b):
//   node tools/scraper/vdata-generator/cli.js from-obj --obj <obj.json> [--seed <n>] [--order <order.json>]
//   node tools/scraper/vdata-generator/cli.js from-obj --self-check

const fs = require('fs');
const path = require('path');

const { encodeVData, encryptOnly, XTEA_KEY_HEX, PLAINTEXT_LENGTH } = require('./encode.js');
const { buildVData } = require('./replay.js');
const { buildPlaintext } = require('./build-plaintext.js');
const { buildVDataFromObj, SCHEMA } = require('./build-from-obj.js');
const { buildVDataForPost } = require('./for-post.js');

const HELP_TEXT = `
vData Encoder — Standalone CLI

Cipher-only mode (Phase 43 — supply your own 112-byte plaintext):
  node tools/scraper/vdata-generator/cli.js --plaintext-hex <hex>
  echo <hex> | node tools/scraper/vdata-generator/cli.js

  --plaintext-hex <hex>   112-byte plaintext as 224 hex chars
  --verbose               Print XTEA key + ciphertext hex to stderr
  --help, -h              Show this help and exit

Replay mode (Phase 44.5a — captured 8-field obj + optional overrides):
  node tools/scraper/vdata-generator/cli.js replay --obj <obj.json> [--order <order.json>] [--overrides <ov.json>]
  node tools/scraper/vdata-generator/cli.js replay --self-check

  --obj <path>            JSON file: 8-field fingerprint object
                          ({tp, key, py, env, version, cLod, inf, ss})
  --order <path>          JSON file: optional field-order array. Defaults
                          to Object.keys(obj) (post-overrides).
  --overrides <path>      JSON file: optional field overrides merged onto obj
  --self-check            Replay both committed fixtures and assert byte-identical
  --verbose               Print intermediate plaintext hex to stderr
  --help, -h              Show this help and exit

From-obj mode (Phase 44.5b — full synthesis from an 8-field obj):
  node tools/scraper/vdata-generator/cli.js from-obj --obj <obj.json> [--seed <n>] [--order <order.json>]
  node tools/scraper/vdata-generator/cli.js from-obj --self-check

  --obj <path>            JSON file: 8-field fingerprint object
  --seed <n>              Integer seed for mulberry32 PRNG (deterministic)
  --order <path>          JSON file: explicit join-order override (skips shuffle)
  --self-check            Synthesize both committed fixtures and assert byte-identical
  --verbose               Print shuffled order + plaintext hex to stderr
  --help, -h              Show this help and exit

For-post mode (Phase 45.2 — scraper entry point: key computed from POST body):
  node tools/scraper/vdata-generator/cli.js for-post --body <string-or-@file> --profile <json-or-@file>
                                             [--overrides <json>] [--order <json-array>]
                                             [--ie9-fallback]

  --body <val>            POST body. Either an inline string or @path to read
                          UTF-8 from a file (trailing '\\n' is trimmed).
  --profile <val>         7-field profile (tp, py, env, version, cLod, inf, ss).
                          Either inline JSON or @path. Profile.key must be
                          absent or the literal "__COMPUTED__" sentinel.
  --overrides <json>      Optional inline JSON object merged over the profile.
                          Must NOT contain a "key" field.
  --order <json-array>    Optional inline JSON array passed through to
                          buildVDataFromObj (skips the default shuffle).
  --ie9-fallback          Take fn 22730's IE9 branch (hardcoded [4,2,3,10]).
  --help, -h              Show this help and exit

Notes:
  Cipher-only mode runs only the XTEA + custom-base64 stage. The 112-byte
  plaintext is the JS-environment fingerprint built by vm-slide's proxyXHR.
  Replay mode wraps the plaintext builder (Phase 44.4) + the cipher (Phase
  43) into one entry point — supply a captured obj and it reproduces the
  vData string for that capture. From-obj mode is full synthesis: it
  constructs the 8-field schema array in literal source order and shuffles
  it (via Math.random by default, or seeded mulberry32 / an explicit
  override) before joining. Nondeterministic by default, which matches
  vm-slide's runtime behavior.
`.trim();

// ---------- shared helpers ----------

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (err) {
    return '';
  }
}

function readJsonFile(p, label) {
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (err) {
    throw new Error(label + ': cannot read ' + p + ': ' + err.message);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(label + ': invalid JSON in ' + p + ': ' + err.message);
  }
}

// ---------- cipher-only mode (Phase 43, unchanged behavior) ----------

function parseCipherArgs(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--verbose') {
      flags.verbose = true;
    } else if (arg === '--plaintext-hex') {
      if (i + 1 >= args.length) {
        return { error: '--plaintext-hex requires a value' };
      }
      flags.plaintextHex = args[i + 1];
      i++;
    } else {
      return { error: 'unknown argument: ' + arg };
    }
  }
  return flags;
}

function runCipherMode(args) {
  const flags = parseCipherArgs(args);

  if (flags.error) {
    process.stderr.write('Error: ' + flags.error + '\n');
    process.stderr.write('Use --help for usage.\n');
    process.exit(2);
  }

  if (flags.help) {
    process.stdout.write(HELP_TEXT + '\n');
    process.exit(0);
  }

  let hex = flags.plaintextHex;
  if (!hex) {
    if (process.stdin.isTTY) {
      process.stderr.write('Error: --plaintext-hex <hex> is required (or pipe hex via stdin).\n');
      process.stderr.write('Use --help for usage.\n');
      process.exit(2);
    }
    hex = readStdinSync();
  }

  hex = hex.replace(/\s+/g, '');

  if (!hex) {
    process.stderr.write('Error: no plaintext hex provided.\n');
    process.exit(2);
  }

  if (hex.length !== PLAINTEXT_LENGTH * 2) {
    process.stderr.write(
      'Error: plaintext hex must be exactly ' +
        PLAINTEXT_LENGTH * 2 +
        ' chars (' +
        PLAINTEXT_LENGTH +
        ' bytes), got ' +
        hex.length +
        ' chars. The 112-byte requirement comes from vm-slide; Phase 44 ' +
        'owns reversing the plaintext builder.\n'
    );
    process.exit(2);
  }

  let vdata;
  let plaintext;
  try {
    plaintext = Buffer.from(hex, 'hex');
    vdata = encodeVData(plaintext);
  } catch (err) {
    process.stderr.write('Error: ' + err.message + '\n');
    process.exit(1);
  }

  if (flags.verbose) {
    const ciphertext = encryptOnly(plaintext);
    process.stderr.write('[verbose] xtea key hex:    ' + XTEA_KEY_HEX + '\n');
    process.stderr.write('[verbose] plaintext bytes: ' + plaintext.length + '\n');
    process.stderr.write('[verbose] ciphertext hex:  ' + ciphertext.toString('hex') + '\n');
    process.stderr.write('[verbose] vdata length:    ' + vdata.length + '\n');
  }

  process.stdout.write(vdata + '\n');
  process.exit(0);
}

// ---------- replay mode (Phase 44.5a) ----------

// Hardcoded fixture-derived (obj, order) pairs. These are not captured
// from the fixture JSON files (which only store the post-cipher artifacts);
// they are the inverse-permute solution for each fixture. Encoded here so
// --self-check is hermetic.
const SELF_CHECK_CASES = [
  {
    name: 'jsdom',
    fixturePath: 'tests/fixtures/vdata-jsdom-capture.json',
    plaintextField: 'plaintext_hex',
    vdataField: 'vdata_string',
    obj: {
      inf: 'top',
      env: '1',
      tp: "Cannot read properties of null (reading 'src')",
      key: 'qLCZ',
      py: '0',
      ss: '0%2C',
      cLod: 'unloadTDC',
      version: '2',
    },
    order: ['inf', 'env', 'tp', 'key', 'py', 'ss', 'cLod', 'version'],
  },
  {
    name: 'har',
    fixturePath: 'tests/fixtures/vdata-har-capture.json',
    plaintextField: 'har_decrypted_plaintext_hex',
    vdataField: 'har_vdata_string',
    obj: {
      inf: 'iframe',
      env: '0',
      tp: '7446039806946242560',
      cLod: 'loadTDC',
      version: '2',
      key: '21L2',
      ss: '11%2Ctdc%2Cslide%2Cvm',
      py: '0',
    },
    order: ['inf', 'env', 'tp', 'cLod', 'version', 'key', 'ss', 'py'],
  },
];

function parseReplayArgs(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--verbose') {
      flags.verbose = true;
    } else if (arg === '--self-check') {
      flags.selfCheck = true;
    } else if (arg === '--obj') {
      if (i + 1 >= args.length) return { error: '--obj requires a path' };
      flags.objPath = args[++i];
    } else if (arg === '--order') {
      if (i + 1 >= args.length) return { error: '--order requires a path' };
      flags.orderPath = args[++i];
    } else if (arg === '--overrides') {
      if (i + 1 >= args.length) return { error: '--overrides requires a path' };
      flags.overridesPath = args[++i];
    } else {
      return { error: 'unknown argument: ' + arg };
    }
  }
  return flags;
}

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function runSelfCheck() {
  const repoRoot = findRepoRoot(__dirname);
  let allPass = true;
  for (const c of SELF_CHECK_CASES) {
    const fixturePath = path.join(repoRoot, c.fixturePath);
    const fixture = readJsonFile(fixturePath, 'self-check');
    const expectedPlaintext = fixture[c.plaintextField];
    const expectedVData = fixture[c.vdataField];

    const plaintext = buildPlaintext({ obj: c.obj, order: c.order });
    const plaintextHex = plaintext.toString('hex');
    const vdata = encodeVData(plaintext);

    const ptMatch = plaintextHex === expectedPlaintext;
    const vdMatch = vdata === expectedVData;

    process.stdout.write(
      '[' + c.name + '] plaintext: ' + (ptMatch ? 'MATCH' : 'MISMATCH') +
      '  vdata: ' + (vdMatch ? 'MATCH' : 'MISMATCH') + '\n'
    );

    if (!ptMatch) {
      process.stderr.write('  expected plaintext_hex: ' + expectedPlaintext + '\n');
      process.stderr.write('  actual   plaintext_hex: ' + plaintextHex + '\n');
    }
    if (!vdMatch) {
      process.stderr.write('  expected vdata: ' + expectedVData + '\n');
      process.stderr.write('  actual   vdata: ' + vdata + '\n');
    }

    if (!ptMatch || !vdMatch) allPass = false;
  }

  if (!allPass) {
    process.stderr.write('self-check: FAIL\n');
    process.exit(1);
  }
  process.stdout.write('self-check: OK (both fixtures byte-identical)\n');
  process.exit(0);
}

function runReplayMode(args) {
  const flags = parseReplayArgs(args);

  if (flags.error) {
    process.stderr.write('Error: ' + flags.error + '\n');
    process.stderr.write('Use --help for usage.\n');
    process.exit(2);
  }

  if (flags.help) {
    process.stdout.write(HELP_TEXT + '\n');
    process.exit(0);
  }

  if (flags.selfCheck) {
    runSelfCheck();
    return;
  }

  if (!flags.objPath) {
    process.stderr.write('Error: replay mode requires --obj <path> (or --self-check).\n');
    process.stderr.write('Use --help for usage.\n');
    process.exit(2);
  }

  let obj;
  let order;
  let overrides;
  try {
    obj = readJsonFile(flags.objPath, '--obj');
    if (flags.orderPath) order = readJsonFile(flags.orderPath, '--order');
    if (flags.overridesPath) overrides = readJsonFile(flags.overridesPath, '--overrides');
  } catch (err) {
    process.stderr.write('Error: ' + err.message + '\n');
    process.exit(2);
  }

  let vdata;
  let plaintext;
  try {
    const merged = overrides ? Object.assign({}, obj, overrides) : obj;
    plaintext = buildPlaintext({ obj: merged, order });
    vdata = buildVData({ obj, order, overrides });
  } catch (err) {
    process.stderr.write('Error: ' + err.message + '\n');
    process.exit(1);
  }

  if (flags.verbose) {
    process.stderr.write('[verbose] plaintext bytes: ' + plaintext.length + '\n');
    process.stderr.write('[verbose] plaintext hex:   ' + plaintext.toString('hex') + '\n');
    process.stderr.write('[verbose] vdata length:    ' + vdata.length + '\n');
  }

  process.stdout.write(vdata + '\n');
  process.exit(0);
}

// ---------- from-obj mode (Phase 44.5b) ----------

// Shared fixture obj data with the replay self-check; the from-obj
// self-check additionally exercises both the --order deterministic path
// and the --seed deterministic path found by output/vdata-generator-smoke/
// seed-sweep.js (Node 20 / V8 TimSort).
const FROM_OBJ_SELF_CHECK_CASES = [
  {
    name: 'har',
    mode: 'order', // deterministic via explicit override
    fixturePath: 'tests/fixtures/vdata-har-capture.json',
    vdataField: 'har_vdata_string',
    obj: {
      inf: 'iframe',
      env: '0',
      tp: '7446039806946242560',
      cLod: 'loadTDC',
      version: '2',
      key: '21L2',
      ss: '11%2Ctdc%2Cslide%2Cvm',
      py: '0',
    },
    order: ['inf', 'env', 'tp', 'cLod', 'version', 'key', 'ss', 'py'],
  },
  {
    name: 'jsdom',
    mode: 'seed', // deterministic via mulberry32 seed; reproduces jsdom order on Node 20
    fixturePath: 'tests/fixtures/vdata-jsdom-capture.json',
    vdataField: 'vdata_string',
    obj: {
      inf: 'top',
      env: '1',
      tp: "Cannot read properties of null (reading 'src')",
      key: 'qLCZ',
      py: '0',
      ss: '0%2C',
      cLod: 'unloadTDC',
      version: '2',
    },
    seed: 84121,
  },
];

function parseFromObjArgs(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--verbose') {
      flags.verbose = true;
    } else if (arg === '--self-check') {
      flags.selfCheck = true;
    } else if (arg === '--obj') {
      if (i + 1 >= args.length) return { error: '--obj requires a path' };
      flags.objPath = args[++i];
    } else if (arg === '--order') {
      if (i + 1 >= args.length) return { error: '--order requires a path' };
      flags.orderPath = args[++i];
    } else if (arg === '--seed') {
      if (i + 1 >= args.length) return { error: '--seed requires an integer' };
      const n = parseInt(args[++i], 10);
      if (!Number.isFinite(n)) return { error: '--seed must be an integer' };
      flags.seed = n;
    } else {
      return { error: 'unknown argument: ' + arg };
    }
  }
  return flags;
}

function runFromObjSelfCheck() {
  const repoRoot = findRepoRoot(__dirname);
  let allPass = true;
  for (const c of FROM_OBJ_SELF_CHECK_CASES) {
    const fixturePath = path.join(repoRoot, c.fixturePath);
    const fixture = readJsonFile(fixturePath, 'self-check');
    const expectedVData = fixture[c.vdataField];

    const args = { obj: c.obj };
    if (c.mode === 'order') args.order = c.order;
    else if (c.mode === 'seed') args.seed = c.seed;
    const vdata = buildVDataFromObj(args);

    const vdMatch = vdata === expectedVData;
    process.stdout.write(
      '[' + c.name + '] path=' + c.mode +
      (c.mode === 'seed' ? ('(seed=' + c.seed + ')') : '') +
      ' vdata: ' + (vdMatch ? 'MATCH' : 'MISMATCH') + '\n'
    );
    if (!vdMatch) {
      process.stderr.write('  expected vdata: ' + expectedVData + '\n');
      process.stderr.write('  actual   vdata: ' + vdata + '\n');
      allPass = false;
    }
  }

  if (!allPass) {
    process.stderr.write('from-obj self-check: FAIL\n');
    process.exit(1);
  }
  process.stdout.write('from-obj self-check: OK (both fixtures byte-identical; order + seed paths)\n');
  process.exit(0);
}

function runFromObjMode(args) {
  const flags = parseFromObjArgs(args);

  if (flags.error) {
    process.stderr.write('Error: ' + flags.error + '\n');
    process.stderr.write('Use --help for usage.\n');
    process.exit(2);
  }

  if (flags.help) {
    process.stdout.write(HELP_TEXT + '\n');
    process.exit(0);
  }

  if (flags.selfCheck) {
    runFromObjSelfCheck();
    return;
  }

  if (!flags.objPath) {
    process.stderr.write('Error: from-obj mode requires --obj <path> (or --self-check).\n');
    process.stderr.write('Use --help for usage.\n');
    process.exit(2);
  }

  let obj;
  let order;
  try {
    obj = readJsonFile(flags.objPath, '--obj');
    if (flags.orderPath) order = readJsonFile(flags.orderPath, '--order');
  } catch (err) {
    process.stderr.write('Error: ' + err.message + '\n');
    process.exit(2);
  }

  let vdata;
  try {
    vdata = buildVDataFromObj({ obj, seed: flags.seed, order });
  } catch (err) {
    process.stderr.write('Error: ' + err.message + '\n');
    process.exit(1);
  }

  if (flags.verbose) {
    const source = order
      ? 'explicit-override'
      : flags.seed != null
        ? 'seeded-mulberry32(' + flags.seed + ')'
        : 'Math.random';
    process.stderr.write('[verbose] schema:      ' + JSON.stringify(SCHEMA) + '\n');
    process.stderr.write('[verbose] order source: ' + source + '\n');
    process.stderr.write('[verbose] vdata length: ' + vdata.length + '\n');
  }

  process.stdout.write(vdata + '\n');
  process.exit(0);
}

// ---------- for-post mode (Phase 45.2) ----------

// Resolve a --body / --profile argument that may be either an inline value
// or `@path`. For @path form, reads the file as UTF-8 and trims a single
// trailing '\n' if present. Inline values are returned verbatim.
function resolveInlineOrFile(raw, label) {
  if (typeof raw !== 'string') {
    throw new Error(label + ' requires a string value');
  }
  if (raw.length === 0) throw new Error(label + ' is empty');
  if (raw.charAt(0) !== '@') return raw;
  const filePath = raw.slice(1);
  let contents;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(label + ': cannot read ' + filePath + ': ' + err.message);
  }
  if (contents.length > 0 && contents.charAt(contents.length - 1) === '\n') {
    contents = contents.slice(0, -1);
  }
  return contents;
}

function parseForPostArgs(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--ie9-fallback') {
      flags.ie9Fallback = true;
    } else if (arg === '--body') {
      if (i + 1 >= args.length) return { error: '--body requires a value' };
      flags.body = args[++i];
    } else if (arg === '--profile') {
      if (i + 1 >= args.length) return { error: '--profile requires a value' };
      flags.profile = args[++i];
    } else if (arg === '--overrides') {
      if (i + 1 >= args.length) return { error: '--overrides requires a JSON string' };
      flags.overrides = args[++i];
    } else if (arg === '--order') {
      if (i + 1 >= args.length) return { error: '--order requires a JSON array' };
      flags.order = args[++i];
    } else {
      return { error: 'unknown argument: ' + arg };
    }
  }
  return flags;
}

function runForPostMode(args) {
  const flags = parseForPostArgs(args);

  if (flags.error) {
    process.stderr.write('Error: ' + flags.error + '\n');
    process.stderr.write('Use --help for usage.\n');
    process.exit(2);
  }

  if (flags.help) {
    process.stdout.write(HELP_TEXT + '\n');
    process.exit(0);
  }

  if (flags.body == null) {
    process.stderr.write('Error: for-post mode requires --body <string-or-@file>.\n');
    process.exit(2);
  }
  if (flags.profile == null) {
    process.stderr.write('Error: for-post mode requires --profile <json-or-@file>.\n');
    process.exit(2);
  }

  let body;
  let profile;
  let overrides;
  let order;
  try {
    body = resolveInlineOrFile(flags.body, '--body');
    const profileRaw = resolveInlineOrFile(flags.profile, '--profile');
    try {
      profile = JSON.parse(profileRaw);
    } catch (err) {
      throw new Error('--profile: invalid JSON: ' + err.message);
    }
    if (flags.overrides != null) {
      try {
        overrides = JSON.parse(flags.overrides);
      } catch (err) {
        throw new Error('--overrides: invalid JSON: ' + err.message);
      }
    }
    if (flags.order != null) {
      try {
        order = JSON.parse(flags.order);
      } catch (err) {
        throw new Error('--order: invalid JSON: ' + err.message);
      }
    }
  } catch (err) {
    process.stderr.write('Error: ' + err.message + '\n');
    process.exit(2);
  }

  let vdata;
  try {
    vdata = buildVDataForPost(body, {
      profile,
      overrides,
      order,
      ie9Fallback: !!flags.ie9Fallback,
    });
  } catch (err) {
    process.stderr.write('Error: ' + err.message + '\n');
    process.exit(1);
  }

  process.stdout.write(vdata + '\n');
  process.exit(0);
}

// ---------- top-level dispatch ----------

function parseArgs(argv) {
  // Back-compat: parseArgs() still parses the cipher-only flag set so any
  // callers importing it from outside continue to work. The replay
  // subcommand is handled in main().
  return parseCipherArgs(argv.slice(2));
}

function main() {
  const argv = process.argv.slice(2);

  if (argv.length > 0 && argv[0] === 'replay') {
    runReplayMode(argv.slice(1));
    return;
  }

  if (argv.length > 0 && argv[0] === 'from-obj') {
    runFromObjMode(argv.slice(1));
    return;
  }

  if (argv.length > 0 && argv[0] === 'for-post') {
    runForPostMode(argv.slice(1));
    return;
  }

  runCipherMode(argv);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, main };
