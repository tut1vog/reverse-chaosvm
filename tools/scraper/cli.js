#!/usr/bin/env node
'use strict';

/**
 * cli.js — Headless Scraper CLI
 *
 * Solves Tencent slide CAPTCHAs and optionally queries urlsec.qq.com.
 *
 * Usage:
 *   node tools/scraper/cli.js [options] [url]
 *   node tools/scraper/cli.js --captcha-only --verbose
 *   node tools/scraper/cli.js --help
 */

const USAGE = `
Headless Scraper — Tencent CAPTCHA + urlsec.qq.com

Usage:
  node tools/scraper/cli.js [options] [url]

Arguments:
  url                  URL or domain to check via urlsec.qq.com

Options:
  --verbose, -v        Enable verbose logging to stderr
  --ratio <n>          Slide ratio (default: 0.5)
  --calibration <n>    Slide calibration offset (default: -25)
  --retries <n>        Max CAPTCHA solve attempts (default: 3)
  --captcha-only       Only solve CAPTCHA (don't query urlsec.qq.com)
  --no-chrome-profile  Use synthetic fingerprint profile instead of the
                       real Chrome capture (profiles/chrome-fingerprint.json)
  --vdata-profile <p>  Path to a vData browser-profile JSON file
                       (default: profiles/vdata-browser-default.json)
  --extra-header <h>   Extra HTTP header for the verify POST only, in
                       "Name: Value" form. Repeatable. Overrides built-in
                       header values when names collide.
  --help, -h           Show this help message

Examples:
  node tools/scraper/cli.js --verbose https://example.com
  node tools/scraper/cli.js --captcha-only --verbose
  node tools/scraper/cli.js --ratio 1.0 --retries 5 https://example.com
`.trim();

function parseArgs(argv) {
  const args = {
    verbose: false,
    ratio: 0.5,
    calibration: -25,
    retries: 3,
    captchaOnly: false,
    chromeProfile: true,
    vdataProfile: null,
    extraHeaders: [],
    help: false,
    url: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    } else if (arg === '--captcha-only') {
      args.captchaOnly = true;
    } else if (arg === '--no-chrome-profile') {
      args.chromeProfile = false;
    } else if (arg === '--vdata-profile') {
      args.vdataProfile = argv[++i];
      if (!args.vdataProfile) {
        throw new Error('--vdata-profile requires a path');
      }
    } else if (arg === '--ratio') {
      args.ratio = parseFloat(argv[++i]);
      if (isNaN(args.ratio)) {
        throw new Error('--ratio requires a numeric value');
      }
    } else if (arg === '--calibration') {
      args.calibration = parseFloat(argv[++i]);
      if (isNaN(args.calibration)) {
        throw new Error('--calibration requires a numeric value');
      }
    } else if (arg === '--retries') {
      args.retries = parseInt(argv[++i], 10);
      if (isNaN(args.retries) || args.retries < 1) {
        throw new Error('--retries requires a positive integer');
      }
    } else if (arg === '--extra-header') {
      const raw = argv[++i];
      if (raw === undefined) {
        throw new Error('--extra-header requires a "Name: Value" argument');
      }
      const colonIdx = raw.indexOf(':');
      if (colonIdx === -1) {
        throw new Error('--extra-header value must be "Name: Value" (missing colon): ' + raw);
      }
      const name = raw.slice(0, colonIdx).trim();
      const value = raw.slice(colonIdx + 1).trim();
      if (!name) {
        throw new Error('--extra-header has empty name: ' + raw);
      }
      if (!value) {
        throw new Error('--extra-header has empty value: ' + raw);
      }
      args.extraHeaders.push({ name: name, value: value });
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      args.url = arg;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (!args.url && !args.captchaOnly) {
    console.log(USAGE);
    process.exit(0);
  }

  const log = args.verbose
    ? (...a) => console.error('[scraper]', ...a)
    : () => {};

  const Scraper = require('./scraper');

  const scraper = new Scraper({
    slideRatio: args.ratio,
    calibration: args.calibration,
    verbose: args.verbose,
    chromeProfile: args.chromeProfile,
    vdataProfile: args.vdataProfile,
    maxRetries: args.retries,
    extraHeaders: args.extraHeaders,
  });
  await scraper.init();

  if (args.captchaOnly) {
    log('Solving CAPTCHA only (no urlsec query)');
    let lastErr;
    for (let attempt = 1; attempt <= args.retries; attempt++) {
      try {
        log(`Attempt ${attempt}/${args.retries}`);
        const result = await scraper.solveCaptcha();
        log('CAPTCHA solved:', result);
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        process.exit(0);
      } catch (err) {
        log(`Attempt ${attempt} failed: ${err.message}`);
        lastErr = err;
      }
    }
    console.error(`Error: CAPTCHA solve failed after ${args.retries} attempts: ${lastErr.message}`);
    process.exit(1);
  }

  // Full flow: solve CAPTCHA + query urlsec
  log(`Full flow for URL: ${args.url}`);
  try {
    const result = await scraper.solve(args.url);
    log('Result:', result);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs };
