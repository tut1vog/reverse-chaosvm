'use strict';

/**
 * fetch-30.js — Research harness that fetches N (default 30) fresh Tencent
 * tdc.js builds from urlsec.qq.com via the minimal prehandle + getSig +
 * downloadTdc handshake, saving each source plus a sources.json index for
 * downstream porting-pipeline stress-testing.
 */

const fs = require('fs');
const path = require('path');

const { CaptchaClient, CookieJar } = require('../../tools/puppeteer/captcha-client');
const { DEFAULT_AID } = require('../../tools/puppeteer/captcha-solver');
const { extractTdcName, computeSourceHash } = require('../../tools/scraper/tdc-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'port-survey');
const SOURCES_DIR = path.join(OUTPUT_DIR, 'sources');
const INDEX_FILE = path.join(OUTPUT_DIR, 'sources.json');

const DEFAULT_COUNT = 30;
const SLEEP_MIN_MS = 500;
const SLEEP_MAX_MS = 1500;

/**
 * Parse CLI arguments. Supports --count N (or --count=N).
 * @param {string[]} argv
 * @returns {{count: number}}
 */
function parseArgs(argv) {
  let count = DEFAULT_COUNT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--count') {
      const next = argv[i + 1];
      const parsed = parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error('--count requires a positive integer');
      }
      count = parsed;
      i++;
    } else if (arg.startsWith('--count=')) {
      const parsed = parseInt(arg.slice('--count='.length), 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error('--count requires a positive integer');
      }
      count = parsed;
    }
  }
  return { count };
}

/**
 * Sleep for ms milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random integer in [min, max] inclusive.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Log a warning to stderr with a stable prefix.
 * @param {string} msg
 */
function warn(msg) {
  process.stderr.write('[fetch-30] ' + msg + '\n');
}

/**
 * Fetch one fresh tdc.js source via the prehandle + getSig + downloadTdc chain.
 * Uses a fresh CookieJar to avoid session bleed between iterations.
 * @returns {Promise<string>}
 */
async function fetchOneTdc() {
  const client = new CaptchaClient({
    aid: DEFAULT_AID,
    referer: 'https://urlsec.qq.com/',
  });
  // Ensure a fresh cookie jar per iteration (the constructor already creates
  // one, but be explicit — CookieJar is imported to make that intent clear
  // and to future-proof against shared-client refactors).
  client.cookieJar = new CookieJar();

  const session = await client.prehandle();
  const sig = await client.getSig(session);
  const source = await client.downloadTdc(sig);
  return source;
}

async function main() {
  const { count } = parseArgs(process.argv.slice(2));

  fs.mkdirSync(SOURCES_DIR, { recursive: true });

  const entries = [];
  const hashToIndex = new Map();
  let fetched = 0;

  for (let i = 1; i <= count; i++) {
    const pad = String(i).padStart(2, '0');
    try {
      const source = await fetchOneTdc();
      const sourceHash = computeSourceHash(source);
      const tdcName = extractTdcName(source) || '';
      const caseCountGuess = (source.match(/case\s+\d+\s*:/g) || []).length;

      const outFile = path.join(SOURCES_DIR, 'tdc-' + pad + '.js');
      fs.writeFileSync(outFile, source);

      if (hashToIndex.has(sourceHash)) {
        const firstIdx = hashToIndex.get(sourceHash);
        warn('dup hash ' + sourceHash + ' at index ' + pad + ' (already at index ' + firstIdx + ')');
      } else {
        hashToIndex.set(sourceHash, pad);
      }

      entries.push({
        index: pad,
        sourceHash: sourceHash,
        TDC_NAME: tdcName,
        length: source.length,
        caseCountGuess: caseCountGuess,
      });
      fetched++;
    } catch (err) {
      warn('iteration ' + pad + ' failed: ' + (err && err.message ? err.message : String(err)));
      // leave a gap — do not retry, continue
    }

    if (i < count) {
      await sleep(randInt(SLEEP_MIN_MS, SLEEP_MAX_MS));
    }
  }

  fs.writeFileSync(INDEX_FILE, JSON.stringify(entries, null, 2) + '\n');

  const uniqueHashes = new Set(entries.map((e) => e.sourceHash)).size;
  process.stdout.write('fetched ' + fetched + '/' + count + ' sources, ' + uniqueHashes + ' unique hashes\n');
}

main().catch((err) => {
  process.stderr.write('[fetch-30] fatal: ' + (err && err.stack ? err.stack : String(err)) + '\n');
  process.exit(1);
});
