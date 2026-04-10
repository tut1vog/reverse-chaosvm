#!/usr/bin/env node
'use strict';

/**
 * cli.js — Puppeteer CAPTCHA Solver CLI
 *
 * Solves Tencent slide CAPTCHAs using real Chrome via puppeteer-stealth.
 * This is the production-quality path that generates valid tokens.
 *
 * Usage:
 *   node puppeteer/cli.js --domain example.com
 *   node puppeteer/cli.js --domains domain.lst --output results.json
 *   node puppeteer/cli.js --help
 */

const fs = require('fs');
const path = require('path');
const { CaptchaPuppeteer, DEFAULT_AID, DEFAULT_RATIO } = require('./captcha-solver');
const { solveSlider } = require('./slide-solver');

const USAGE = `
Puppeteer CAPTCHA Solver — Tencent Slide CAPTCHA

Usage:
  node puppeteer/cli.js --domain <domain>
  node puppeteer/cli.js --domains <file> [--output results.json]

Options:
  --domain <domain>     Solve CAPTCHA for a single domain
  --domains <file>      File with one domain per line
  --output <path>       Output JSON file (default: results.json)
  --aid <id>            CAPTCHA app ID (default: ${DEFAULT_AID})
  --max-retries <n>     Max retry attempts per domain (default: 3)
  --delay <ms>          Delay between domains (default: 2000)
  --headful             Show browser window (default: headless)
  --help                Show this help

How it works:
  1. Launches headless Chrome with stealth plugin
  2. Navigates to CAPTCHA show page
  3. Intercepts background/slider images
  4. Solves slide puzzle with Python OpenCV (Canny + NCC)
  5. Performs realistic mouse drag
  6. Captures ticket from verify response
`.trim();

async function main() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (key === 'help') { console.log(USAGE); process.exit(0); }
    if (key === 'headful') { args.headful = true; continue; }
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[key] = argv[++i];
    } else {
      args[key] = true;
    }
  }

  if (!args.domain && !args.domains) {
    console.error('Error: specify --domain <domain> or --domains <file>');
    console.error('Run with --help for usage.');
    process.exit(1);
  }

  let domains = [];
  if (args.domain) {
    domains = [args.domain];
  } else {
    const content = fs.readFileSync(args.domains, 'utf-8');
    domains = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  }

  const output = args.output || 'results.json';
  const aid = args.aid || DEFAULT_AID;
  const maxRetries = parseInt(args['max-retries'] || '3', 10);
  const delayMs = parseInt(args.delay || '2000', 10);
  const headless = !args.headful;

  console.error(`Puppeteer solver: ${domains.length} domain(s), aid=${aid}, headless=${headless}`);

  const solver = new CaptchaPuppeteer({ aid, headless });
  const results = [];

  try {
    for (const domain of domains) {
      console.error(`\nSolving: ${domain}`);
      let result = { domain, status: 'error', error: 'not attempted' };

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const ticket = await solver.solve();
          result = { domain, status: 'solved', ...ticket };
          console.error(`  Attempt ${attempt}: ${ticket.errorCode === 0 ? 'SUCCESS' : `errorCode ${ticket.errorCode}`}`);
          if (ticket.errorCode === 0) {
            // Write captured artifacts on success
            const captureDir = path.resolve(__dirname, '..', 'output', 'puppeteer-capture');
            fs.mkdirSync(captureDir, { recursive: true });
            if (ticket._capture) {
              if (ticket._capture.tdcSource) {
                fs.writeFileSync(path.join(captureDir, 'tdc-source.js'), ticket._capture.tdcSource);
                console.error(`  Wrote tdc-source.js (${ticket._capture.tdcSource.length} chars)`);
              }
              if (ticket._capture.verifyPostBody) {
                fs.writeFileSync(
                  path.join(captureDir, 'verify-post.json'),
                  JSON.stringify(ticket._capture.verifyPostBody, null, 2)
                );
                console.error(`  Wrote verify-post.json (${Object.keys(ticket._capture.verifyPostBody).length} fields)`);
              }
            }
            if (ticket._raw) {
              fs.writeFileSync(
                path.join(captureDir, 'result.json'),
                JSON.stringify(ticket._raw, null, 2)
              );
              console.error(`  Wrote result.json`);
            }
            break;
          }
        } catch (err) {
          console.error(`  Attempt ${attempt}: ${err.message}`);
          result = { domain, status: 'error', error: err.message };
        }
      }

      results.push(result);

      if (domains.indexOf(domain) < domains.length - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  } finally {
    await solver.close();
  }

  fs.writeFileSync(output, JSON.stringify(results, null, 2));
  console.error(`\nResults written to ${output}`);
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
