#!/usr/bin/env node
'use strict';

/**
 * cli.js — Headless Scraper CLI
 *
 * Solves Tencent slide CAPTCHAs and optionally queries urlsec.qq.com.
 *
 * Usage:
 *   node scraper/cli.js [options] [url]
 *   node scraper/cli.js --captcha-only --verbose
 *   node scraper/cli.js --help
 */

const USAGE = `
Headless Scraper — Tencent CAPTCHA + urlsec.qq.com

Usage:
  node scraper/cli.js [options] [url]

Arguments:
  url                  URL or domain to check via urlsec.qq.com

Options:
  --verbose, -v        Enable verbose logging to stderr
  --ratio <n>          Slide ratio (default: 0.5)
  --calibration <n>    Slide calibration offset (default: -25)
  --retries <n>        Max CAPTCHA solve attempts (default: 3)
  --captcha-only       Only solve CAPTCHA (don't query urlsec.qq.com)
  --help, -h           Show this help message

Examples:
  node scraper/cli.js --verbose https://example.com
  node scraper/cli.js --captcha-only --verbose
  node scraper/cli.js --ratio 1.0 --retries 5 https://example.com
`.trim();

function parseArgs(argv) {
  const args = {
    verbose: false,
    ratio: 0.5,
    calibration: -25,
    retries: 3,
    captchaOnly: false,
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
