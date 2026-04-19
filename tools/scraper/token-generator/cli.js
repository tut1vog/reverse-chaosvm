'use strict';

/**
 * cli.js — CLI entry point for standalone TDC token generation.
 *
 * Wires together:
 *   - collector-schema.js  (buildDefaultCdArray, validateCollectorData)
 *   - generate-token.js    (generateToken)
 *
 * Usage:
 *   node src/token/cli.js --profile profiles/default.json
 *   node src/token/cli.js --profile profiles/default.json --timestamp 1751882803000
 *   node src/token/cli.js --profile profiles/default.json --validate
 *   node src/token/cli.js --profile profiles/default.json --verbose
 *
 * Flags:
 *   --profile <path>    Path to browser profile JSON file (required)
 *   --appid <id>        Override appid from profile
 *   --nonce <nonce>     Override nonce from profile
 *   --timestamp <ms>    Override timestamp (ms since epoch, for Date.now())
 *   --validate          Validate profile and exit (no token generation)
 *   --verbose           Print intermediate state (cdArray length, sizes, etc.)
 *   --help              Show usage help
 */

const fs = require('fs');
const path = require('path');

const { buildDefaultCdArray, validateCollectorData } = require('./collector-schema.js');
const { generateToken, buildCdString, buildSdString } = require('./generate-token.js');

// ═══════════════════════════════════════════════════════════════════════
// Argument Parsing (no external deps)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Parse process.argv into a flags object.
 *
 * Supports:
 *   --flag value   → { flag: 'value' }
 *   --flag         → { flag: true }
 *
 * @param {string[]} argv - process.argv
 * @returns {Object} Parsed flags
 */
function parseArgs(argv) {
  const args = argv.slice(2); // skip node and script path
  const flags = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      // If next arg exists and doesn't start with --, treat it as the value
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flags[key] = args[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    }
  }

  return flags;
}

// ═══════════════════════════════════════════════════════════════════════
// Help
// ═══════════════════════════════════════════════════════════════════════

const HELP_TEXT = `
TDC Token Generator — Standalone CLI

Usage:
  node src/token/cli.js --profile <path> [options]

Required:
  --profile <path>    Path to browser profile JSON file

Options:
  --appid <id>        Override appid (default: from profile or "2090803262")
  --nonce <nonce>     Override nonce (default: from profile or random)
  --timestamp <ms>    Freeze timestamp to this value (milliseconds since epoch)
  --validate          Validate profile schema and exit (no token generation)
  --verbose           Print intermediate state and segment sizes
  --help              Show this help message

Examples:
  node src/token/cli.js --profile profiles/default.json
  node src/token/cli.js --profile profiles/default.json --timestamp 1751882803000
  node src/token/cli.js --profile profiles/default.json --validate
  node src/token/cli.js --profile profiles/default.json --verbose
`.trim();

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

function main() {
  const flags = parseArgs(process.argv);

  // Help
  if (flags.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Require --profile
  if (!flags.profile) {
    console.error('Error: --profile <path> is required. Use --help for usage.');
    process.exit(1);
  }

  // Load profile JSON
  const profilePath = path.resolve(flags.profile);
  let profileData;
  try {
    const raw = fs.readFileSync(profilePath, 'utf8');
    profileData = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`Error: Profile file not found: ${profilePath}`);
    } else if (err instanceof SyntaxError) {
      console.error(`Error: Invalid JSON in profile file: ${err.message}`);
    } else {
      console.error(`Error: Could not read profile file: ${err.message}`);
    }
    process.exit(1);
  }

  // Build cdArray from profile
  const cdArray = buildDefaultCdArray(profileData);

  // ── Validate mode ─────────────────────────────────────────────────
  if (flags.validate) {
    const result = validateCollectorData(cdArray);
    if (result.valid) {
      console.log(`PASS — ${cdArray.length}/59 fields valid, 0 errors`);
      process.exit(0);
    } else {
      console.log(`FAIL — ${result.errors.length} error(s):`);
      for (const err of result.errors) {
        console.log(`  ${err}`);
      }
      process.exit(1);
    }
  }

  // ── Build session data (sdObject) ─────────────────────────────────
  const sdObject = {
    od: 'C',
    appid: flags.appid || profileData.appid || '2090803262',
    nonce: flags.nonce || profileData.nonce || '0.' + Math.random().toString().slice(2, 10),
    token: profileData.token || 'test_token_123'
  };

  // ── Determine timestamp ───────────────────────────────────────────
  const timestamp = flags.timestamp ? Number(flags.timestamp) : Date.now();

  // ── Verbose: show intermediates ───────────────────────────────────
  if (flags.verbose) {
    const cdString = buildCdString(cdArray);
    const sdString = buildSdString(sdObject);
    console.error(`[verbose] Profile:     ${profilePath}`);
    console.error(`[verbose] cdArray:     ${cdArray.length} entries`);
    console.error(`[verbose] cdString:    ${cdString.length} chars`);
    console.error(`[verbose] sdString:    ${sdString.length} chars`);
    console.error(`[verbose] timestamp:   ${timestamp}`);
    console.error(`[verbose] appid:       ${sdObject.appid}`);
    console.error(`[verbose] nonce:       ${sdObject.nonce}`);
  }

  // ── Generate token ────────────────────────────────────────────────
  const token = generateToken(cdArray, sdObject, timestamp);

  // ── Verbose: show token stats ─────────────────────────────────────
  if (flags.verbose) {
    // Decode the URL-encoded token to inspect segment sizes
    const decoded = token.replace(/%2B/g, '+').replace(/%2F/g, '/').replace(/%3D/g, '=');
    // Base64 segments are concatenated; count padding markers to estimate segments
    // The token is 4 concatenated base64 strings; each ends with 0+ '=' padding
    console.error(`[verbose] Token:       ${token.length} chars (URL-encoded)`);
    console.error(`[verbose] Decoded:     ${decoded.length} chars (base64)`);
  }

  // Output token to stdout
  process.stdout.write(token);

  // Newline to stderr so terminal prompt is clean, but stdout is pure token
  if (process.stdout.isTTY) {
    process.stderr.write('\n');
  }

  process.exit(0);
}

main();
