'use strict';

/**
 * capture-node-ja3.js — Capture Node.js native TLS fingerprint
 *
 * Sends an HTTPS GET to tls.peet.ws/api/all using Node's built-in https
 * module with the scraper's exact User-Agent string. Saves raw JSON to
 * output/scraper-tls/node-default.json.
 *
 * Usage:
 *   node research/scraper-tls-impersonation/capture-node-ja3.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const OUTPUT_DIR = path.resolve(__dirname, '..', '..', 'output', 'scraper-tls');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'node-default.json');

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        'Accept-Encoding': 'identity',
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

async function main() {
  console.error('[node-ja3] Fetching TLS fingerprint from tls.peet.ws ...');

  const raw = await fetch('https://tls.peet.ws/api/all');
  const data = JSON.parse(raw);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
  console.error(`[node-ja3] Saved to ${OUTPUT_FILE}`);

  // Extract key fields
  const ja3 = data.ja3_hash || data.ja3Hash || '(not present)';
  const ja4 = data.ja4 || '(not present)';
  const tls = data.tls_version || data.tlsVersion || '(not present)';

  console.error(`[node-ja3] TLS version : ${tls}`);
  console.error(`[node-ja3] JA3 hash    : ${ja3}`);
  console.error(`[node-ja3] JA4         : ${ja4}`);

  // Print cipher suites
  const ciphers = data.ciphers || data.cipher_suites || [];
  console.error(`[node-ja3] Cipher suites (${ciphers.length}):`);
  for (const c of ciphers) {
    const name = typeof c === 'string' ? c : (c.name || c.hex || JSON.stringify(c));
    console.error(`  - ${name}`);
  }
}

main().catch((err) => {
  console.error(`[node-ja3] FATAL: ${err.message}`);
  process.exit(1);
});
