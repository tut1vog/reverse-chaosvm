'use strict';

/**
 * capture-puppeteer-ja3.js — Capture headless Puppeteer/Chrome TLS fingerprint
 *
 * Launches headless Chromium via puppeteer-extra + stealth plugin (same setup
 * as tools/captcha-solver/), navigates to tls.peet.ws/api/all, reads the JSON
 * from the page, and saves to output/scraper-tls/chrome-puppeteer.json.
 *
 * Usage:
 *   node research/scraper-tls-impersonation/capture-puppeteer-ja3.js
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const OUTPUT_DIR = path.resolve(__dirname, '..', '..', 'output', 'scraper-tls');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'chrome-puppeteer.json');

async function main() {
  console.error('[pptr-ja3] Launching headless Chrome with stealth plugin...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
    defaultViewport: {
      width: 1280,
      height: 1400,
      deviceScaleFactor: 1,
    },
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);

    console.error('[pptr-ja3] Navigating to tls.peet.ws/api/all ...');
    await page.goto('https://tls.peet.ws/api/all', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Read the JSON from the page body
    const rawText = await page.evaluate(() => {
      // The page renders raw JSON in a <pre> or directly in body
      return document.body.innerText;
    });

    const data = JSON.parse(rawText);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
    console.error(`[pptr-ja3] Saved to ${OUTPUT_FILE}`);

    // Extract key fields
    const ja3 = data.ja3_hash || data.ja3Hash || '(not present)';
    const ja4 = data.ja4 || '(not present)';
    const tls = data.tls_version || data.tlsVersion || '(not present)';

    console.error(`[pptr-ja3] TLS version : ${tls}`);
    console.error(`[pptr-ja3] JA3 hash    : ${ja3}`);
    console.error(`[pptr-ja3] JA4         : ${ja4}`);

    // Print cipher suites
    const ciphers = data.ciphers || data.cipher_suites || [];
    console.error(`[pptr-ja3] Cipher suites (${ciphers.length}):`);
    for (const c of ciphers) {
      const name = typeof c === 'string' ? c : (c.name || c.hex || JSON.stringify(c));
      console.error(`  - ${name}`);
    }

    await page.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`[pptr-ja3] FATAL: ${err.message}`);
  process.exit(1);
});
