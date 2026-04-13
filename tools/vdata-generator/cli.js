#!/usr/bin/env node
'use strict';

// Phase 43 task 43.3 — CLI for the standalone vData cipher encoder.
//
// Usage:
//   node tools/vdata-generator/cli.js --plaintext-hex <224-hex-char string>
//   echo <hex> | node tools/vdata-generator/cli.js
//
// Flags:
//   --plaintext-hex <hex>   112-byte plaintext as 224 hex chars
//   --verbose               Print key + ciphertext hex to stderr
//   --help, -h              Print usage and exit 0
//
// Reads stdin if --plaintext-hex is not given. Stdout receives only
// the 152-char vData string + newline (pipe-friendly).

const { encodeVData, encryptOnly, XTEA_KEY_HEX, PLAINTEXT_LENGTH } = require('./encode.js');

const HELP_TEXT = `
vData Cipher Encoder — Standalone CLI (Phase 43)

Usage:
  node tools/vdata-generator/cli.js --plaintext-hex <hex>
  echo <hex> | node tools/vdata-generator/cli.js

Required (one of):
  --plaintext-hex <hex>   112-byte plaintext as 224 hex chars
  stdin                   Same hex via standard input (whitespace stripped)

Options:
  --verbose               Print XTEA key and intermediate ciphertext to stderr
  --help, -h              Show this help and exit

Notes:
  This is the cipher half of vm-slide's vData pipeline. The 112-byte
  plaintext is a JS-environment fingerprint built by vm-slide's
  proxyXHR at runtime; reversing that builder is Phase 44 and is NOT
  handled here. Supply the plaintext yourself.
`.trim();

function parseArgs(argv) {
  const args = argv.slice(2);
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

function readStdinSync() {
  let data = '';
  try {
    const chunk = require('fs').readFileSync(0, 'utf8');
    data = chunk;
  } catch (err) {
    return '';
  }
  return data;
}

function main() {
  const flags = parseArgs(process.argv);

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
    process.stderr.write('[verbose] xtea key hex:   ' + XTEA_KEY_HEX + '\n');
    process.stderr.write('[verbose] plaintext bytes: ' + plaintext.length + '\n');
    process.stderr.write('[verbose] ciphertext hex:  ' + ciphertext.toString('hex') + '\n');
    process.stderr.write('[verbose] vdata length:    ' + vdata.length + '\n');
  }

  process.stdout.write(vdata + '\n');
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, main };
