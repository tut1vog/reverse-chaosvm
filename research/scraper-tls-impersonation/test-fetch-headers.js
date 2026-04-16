'use strict';

/**
 * test-fetch-headers.js — Test whether page.evaluate(fetch()) preserves
 * Chrome's native header order on the wire.
 *
 * Sends a POST via page.evaluate(fetch(...)) to httpbin.org/post and
 * captures the echoed headers. Saves to output/scraper-tls/fetch-headers.json.
 *
 * Usage:
 *   node research/scraper-tls-impersonation/test-fetch-headers.js
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = path.resolve(__dirname, '..', '..', 'output', 'scraper-tls');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'fetch-headers.json');

async function main() {
  console.error('[fetch-hdr] Launching headless Chrome...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: { width: 1280, height: 1400, deviceScaleFactor: 1 },
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
    );

    // Navigate to a blank page on the target origin first, so fetch is
    // same-origin-ish (avoids CORS issues with httpbin).
    // We use tls.peet.ws since we already know it works.
    // Actually, let's just navigate to about:blank and do a cross-origin fetch.
    await page.goto('about:blank');

    console.error('[fetch-hdr] Sending POST via page.evaluate(fetch) ...');

    const result = await page.evaluate(async () => {
      const resp = await fetch('https://httpbin.org/post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
        },
        body: 'foo=bar&baz=qux',
      });
      return resp.json();
    });

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));

    console.error('[fetch-hdr] Echoed headers from httpbin:');
    if (result.headers) {
      for (const [k, v] of Object.entries(result.headers)) {
        console.error(`  ${k}: ${v}`);
      }
    }
    console.error(`[fetch-hdr] Saved to ${OUTPUT_FILE}`);

    await page.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`[fetch-hdr] FATAL: ${err.message}`);
  process.exit(1);
});
