'use strict';

/**
 * test-fetch-same-origin.js — Test page.evaluate(fetch) from a same-origin
 * context to verify Origin header and Sec-Fetch-Site are correct.
 *
 * Navigates to tls.peet.ws first, then POSTs to tls.peet.ws/api/all.
 * tls.peet.ws echoes headers in its JSON response, so we can inspect them.
 *
 * Usage:
 *   node research/scraper-tls-impersonation/test-fetch-same-origin.js
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = path.resolve(__dirname, '..', '..', 'output', 'scraper-tls');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'fetch-same-origin.json');

async function main() {
  console.error('[same-origin] Launching headless Chrome...');

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

    // Navigate to t.captcha.qq.com show page? No — task says no requests there.
    // Instead navigate to httpbin.org and POST to httpbin.org/post (same-origin).
    console.error('[same-origin] Navigating to httpbin.org ...');
    await page.goto('https://httpbin.org/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    console.error('[same-origin] Sending POST via page.evaluate(fetch) ...');

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

    console.error('[same-origin] Echoed headers:');
    if (result.headers) {
      for (const [k, v] of Object.entries(result.headers)) {
        console.error(`  ${k}: ${v}`);
      }
    }
    console.error(`[same-origin] Saved to ${OUTPUT_FILE}`);

    await page.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`[same-origin] FATAL: ${err.message}`);
  process.exit(1);
});
