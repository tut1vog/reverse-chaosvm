'use strict';

/**
 * Run a single scraper attempt and dump the full verify body.
 * Used for field-by-field comparison with tls-experiment.
 */

const fs = require('fs');
const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Dynamically require the scraper
const Scraper = require(path.join(PROJECT_ROOT, 'tools', 'scraper', 'scraper.js'));

async function main() {
  const scraper = new Scraper({
    aid: '2046626881',
    referer: 'https://urlsec.qq.com/',
    captchaOnly: true,
    chromeProfile: true,
    maxRetries: 1,  // Single attempt
    verbose: true,
    skipCaplog: true,
  });
  await scraper.init();

  try {
    const result = await scraper.solveCaptcha();
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }

  // The scraper writes the body to output/phase-55/scraper-verify-body.txt
  const bodyPath = path.join(PROJECT_ROOT, 'output', 'phase-55', 'scraper-verify-body.txt');
  if (fs.existsSync(bodyPath)) {
    // Copy to phase-62 for comparison
    const body = fs.readFileSync(bodyPath, 'utf8');
    const outDir = path.join(PROJECT_ROOT, 'output', 'phase-62');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'scraper-single-body.txt'), body);
    console.log('\nBody written to output/phase-62/scraper-single-body.txt (' + body.length + ' chars)');
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
