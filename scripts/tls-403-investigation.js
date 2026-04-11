'use strict';

/**
 * TLS 403 Investigation Script
 *
 * Determines whether TLS fingerprinting (JA3/JA4) is the cause of HTTP 403
 * responses from cap_union_new_show when accessed from Node.js / curl.
 *
 * Usage: node scripts/tls-403-investigation.js
 */

const https = require('https');
const http2 = require('http2');
const tls = require('tls');
const { execSync } = require('child_process');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = 'https://t.captcha.qq.com';
const AID = '2091569087';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const CHROME_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA',
  'AES256-SHA',
].join(':');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const results = [];

function log(msg) {
  process.stderr.write(msg + '\n');
}

function record(tag, name, status, details) {
  results.push({ tag, name, status, details });
  const icon = status === 200 ? 'PASS' : status >= 400 ? 'FAIL' : 'INFO';
  log(`[${icon}] ${name}: HTTP ${status}${details ? '  ' + details : ''}`);
}

/**
 * Simple HTTPS GET returning {statusCode, headers, body}.
 */
function httpsGet(url, extraOpts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity', // skip compression for simplicity
      },
      timeout: 15000,
      ...extraOpts,
    };

    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

/**
 * Parse JSONP: callbackName({...}) → object
 */
function parseJSONP(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed);
  const m = trimmed.match(/^[a-zA-Z_$][\w$]*\s*\((.+)\)\s*;?\s*$/s);
  if (!m) throw new Error('Not valid JSONP');
  return JSON.parse(m[1]);
}

/**
 * Get a fresh session via prehandle (this endpoint works from Node.js).
 */
async function getSession() {
  const cb = '_aq_' + Math.floor(Math.random() * 100000);
  const params = new URLSearchParams({
    aid: AID,
    protocol: 'https',
    accver: '1',
    showtype: 'popup',
    ua: Buffer.from(USER_AGENT).toString('base64'),
    noheader: '1',
    fb: '1',
    aged: '0',
    enableAged: '0',
    enableDarkMode: '0',
    grayscale: '1',
    dyeid: '0',
    clientype: '2',
    cap_cd: '',
    uid: '',
    lang: 'en',
    entry_url: 'https://t.captcha.qq.com/',
    elder_captcha: '0',
    js: '/tcaptcha-frame.d0752eae.js',
    login_appid: '',
    wb: '2',
    version: '1.1.0',
    subsid: '1',
    callback: cb,
    sess: '',
  });

  const url = `${BASE_URL}/cap_union_prehandle?${params.toString()}`;
  const resp = await httpsGet(url);
  if (resp.statusCode !== 200) {
    throw new Error(`prehandle returned HTTP ${resp.statusCode}`);
  }
  return parseJSONP(resp.body);
}

/**
 * Build the show URL using session data (mirrors captcha-client.js logic).
 */
function buildShowUrl(session) {
  const params = new URLSearchParams({
    aid: AID,
    protocol: 'https',
    accver: '1',
    showtype: 'popup',
    ua: Buffer.from(USER_AGENT).toString('base64'),
    noheader: '1',
    fb: '1',
    aged: '0',
    enableAged: '0',
    enableDarkMode: '0',
    grayscale: '1',
    dyeid: '0',
    clientype: '2',
    sess: session.sess,
    fwidth: '0',
    sid: session.sid,
    wxLang: '',
    tcScale: '1',
    uid: '',
    cap_cd: '',
    rnd: String(Math.floor(Math.random() * 1000000)),
    prehandleLoadTime: String(Math.floor(Math.random() * 200 + 100)),
    createIframeStart: String(Date.now()),
    global: '0',
    subsid: '2',
  });
  return `${BASE_URL}/cap_union_new_show?${params.toString()}`;
}

/**
 * A known-good tdc.js URL for control testing.
 */
function tdcUrl() {
  return `${BASE_URL}/tdc.js?app_id=${AID}&t=${Date.now()}`;
}

/**
 * curl a URL and return the HTTP status code.
 */
function curlStatus(url) {
  try {
    const out = execSync(
      `curl -s -o /dev/null -w "%{http_code}" --max-time 15 "${url}"`,
      { encoding: 'utf8', timeout: 20000 }
    );
    return parseInt(out.trim(), 10);
  } catch (e) {
    return -1;
  }
}

/**
 * HTTP/2 GET request.
 */
function http2Get(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = http2.connect(`https://${parsed.hostname}`);
    client.on('error', reject);

    const req = client.request({
      ':path': parsed.pathname + parsed.search,
      ':method': 'GET',
      'user-agent': USER_AGENT,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });

    let statusCode;
    const chunks = [];
    let headers = {};

    req.on('response', (hdrs) => {
      statusCode = hdrs[':status'];
      headers = hdrs;
    });
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      client.close();
      resolve({
        statusCode,
        headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
    });
    req.on('error', reject);

    const timer = setTimeout(() => {
      req.close();
      client.close();
      reject(new Error('http2 timeout'));
    }, 15000);
    req.on('end', () => clearTimeout(timer));

    req.end();
  });
}

/**
 * Get TLS session info by connecting directly.
 */
function getTlsInfo(hostname) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(443, hostname, { servername: hostname }, () => {
      const cipher = socket.getCipher();
      const proto = socket.getProtocol();
      const cert = socket.getPeerCertificate();
      socket.destroy();
      resolve({
        protocol: proto,
        cipherName: cipher.name,
        cipherVersion: cipher.version,
        certSubject: cert.subject ? cert.subject.CN : 'unknown',
        certIssuer: cert.issuer ? cert.issuer.O : 'unknown',
      });
    });
    socket.on('error', reject);
    socket.setTimeout(10000, () => { socket.destroy(); reject(new Error('tls timeout')); });
  });
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

async function run() {
  log('=== TLS 403 Investigation ===');
  log(`Timestamp: ${new Date().toISOString()}`);
  log(`Node.js: ${process.version}`);
  log(`OpenSSL: ${process.versions.openssl}`);
  log('');

  // --- Step 0: Get session ---
  log('--- Acquiring session via prehandle ---');
  let session;
  try {
    session = await getSession();
    log(`Session acquired: sess=${session.sess.slice(0, 20)}... sid=${session.sid}`);
  } catch (e) {
    log(`FATAL: Could not acquire session: ${e.message}`);
    process.exit(1);
  }
  log('');

  const showUrl = buildShowUrl(session);
  const prehandleUrl = `${BASE_URL}/cap_union_prehandle?aid=${AID}&protocol=https&accver=1&showtype=popup&ua=${Buffer.from(USER_AGENT).toString('base64')}&noheader=1&fb=1&aged=0&enableAged=0&enableDarkMode=0&grayscale=1&dyeid=0&clientype=2&cap_cd=&uid=&lang=en&entry_url=https%3A%2F%2Ft.captcha.qq.com%2F&elder_captcha=0&js=%2Ftcaptcha-frame.d0752eae.js&login_appid=&wb=2&version=1.1.0&subsid=3&callback=_aq_99999&sess=`;
  const tdcTestUrl = tdcUrl();

  // --- Endpoint baseline tests (Node.js) ---
  log('--- Endpoint Tests (Node.js https.get) ---');

  try {
    const r = await httpsGet(showUrl);
    record('endpoint', 'cap_union_new_show (Node.js)', r.statusCode);
  } catch (e) {
    log(`[ERROR] cap_union_new_show (Node.js): ${e.message}`);
  }

  try {
    const r = await httpsGet(prehandleUrl);
    record('endpoint', 'cap_union_prehandle (Node.js)', r.statusCode);
  } catch (e) {
    log(`[ERROR] cap_union_prehandle (Node.js): ${e.message}`);
  }

  try {
    const r = await httpsGet(tdcTestUrl);
    record('endpoint', 'tdc.js (Node.js)', r.statusCode);
  } catch (e) {
    log(`[ERROR] tdc.js (Node.js): ${e.message}`);
  }

  log('');

  // --- curl comparison ---
  log('--- Endpoint Tests (curl) ---');

  // Need a fresh session for curl since sess is single-use for show
  let session2;
  try {
    session2 = await getSession();
  } catch (e) {
    log('WARN: Could not get second session for curl tests, reusing show URL');
    session2 = session;
  }
  const showUrl2 = buildShowUrl(session2);

  const curlShow = curlStatus(showUrl2);
  record('curl', 'cap_union_new_show (curl)', curlShow);

  const curlPrehandle = curlStatus(prehandleUrl);
  record('curl', 'cap_union_prehandle (curl)', curlPrehandle);

  const curlTdc = curlStatus(tdcTestUrl);
  record('curl', 'tdc.js (curl)', curlTdc);

  log('');

  // --- TLS variant tests ---
  log('--- TLS Variant Tests ---');

  // Get fresh sessions for each TLS variant test
  // (since show URL sess may be single-use)

  // Test: TLS 1.3 only
  try {
    const sess3 = await getSession();
    const url3 = buildShowUrl(sess3);
    const r = await httpsGet(url3, { minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' });
    record('tls', 'TLS 1.3 only', r.statusCode);
  } catch (e) {
    log(`[ERROR] TLS 1.3 only: ${e.message}`);
  }

  // Test: TLS 1.2 only
  try {
    const sess4 = await getSession();
    const url4 = buildShowUrl(sess4);
    const r = await httpsGet(url4, { minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' });
    record('tls', 'TLS 1.2 only', r.statusCode);
  } catch (e) {
    log(`[ERROR] TLS 1.2 only: ${e.message}`);
  }

  // Test: Chrome-like cipher suite
  try {
    const sess5 = await getSession();
    const url5 = buildShowUrl(sess5);
    const r = await httpsGet(url5, { ciphers: CHROME_CIPHERS });
    record('tls', 'Chrome cipher suite', r.statusCode);
  } catch (e) {
    log(`[ERROR] Chrome cipher suite: ${e.message}`);
  }

  // Test: Chrome ciphers + TLS 1.3
  try {
    const sess6 = await getSession();
    const url6 = buildShowUrl(sess6);
    const r = await httpsGet(url6, {
      ciphers: CHROME_CIPHERS,
      minVersion: 'TLSv1.3',
      maxVersion: 'TLSv1.3',
    });
    record('tls', 'Chrome ciphers + TLS 1.3', r.statusCode);
  } catch (e) {
    log(`[ERROR] Chrome ciphers + TLS 1.3: ${e.message}`);
  }

  // Test: ECDH curves (Chrome uses X25519 + P-256 + P-384)
  try {
    const sess7 = await getSession();
    const url7 = buildShowUrl(sess7);
    const r = await httpsGet(url7, {
      ciphers: CHROME_CIPHERS,
      ecdhCurve: 'X25519:prime256v1:secp384r1',
    });
    record('tls', 'Chrome ciphers + ECDH curves', r.statusCode);
  } catch (e) {
    log(`[ERROR] Chrome ciphers + ECDH curves: ${e.message}`);
  }

  // Test: sigalgs (Chrome-like signature algorithms)
  try {
    const sess8 = await getSession();
    const url8 = buildShowUrl(sess8);
    const r = await httpsGet(url8, {
      ciphers: CHROME_CIPHERS,
      ecdhCurve: 'X25519:prime256v1:secp384r1',
      sigalgs: 'ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha384:rsa_pkcs1_sha384:rsa_pss_rsae_sha512:rsa_pkcs1_sha512',
    });
    record('tls', 'Chrome ciphers + curves + sigalgs', r.statusCode);
  } catch (e) {
    log(`[ERROR] Chrome ciphers + curves + sigalgs: ${e.message}`);
  }

  log('');

  // --- HTTP/2 test ---
  log('--- HTTP/2 Test ---');
  try {
    const sess9 = await getSession();
    const url9 = buildShowUrl(sess9);
    const r = await http2Get(url9);
    record('h2', 'HTTP/2 to cap_union_new_show', r.statusCode);
  } catch (e) {
    log(`[ERROR] HTTP/2: ${e.message}`);
  }

  // HTTP/2 with prehandle (control)
  try {
    const r = await http2Get(prehandleUrl);
    record('h2', 'HTTP/2 to cap_union_prehandle', r.statusCode);
  } catch (e) {
    log(`[ERROR] HTTP/2 prehandle: ${e.message}`);
  }

  log('');

  // --- Response headers from 403 ---
  log('--- Response Headers (403 response) ---');
  try {
    const sessH = await getSession();
    const urlH = buildShowUrl(sessH);
    const r = await httpsGet(urlH);
    if (r.statusCode === 403) {
      log(`  Status: ${r.statusCode}`);
      log(`  Body length: ${r.body.length}`);
      log(`  Body preview: ${JSON.stringify(r.body.slice(0, 200))}`);
      for (const [k, v] of Object.entries(r.headers)) {
        log(`  ${k}: ${v}`);
      }
    } else {
      log(`  Unexpected status ${r.statusCode} — not 403`);
    }
  } catch (e) {
    log(`[ERROR] Header capture: ${e.message}`);
  }

  log('');

  // --- TLS session details ---
  log('--- TLS Session Details ---');
  try {
    const info = await getTlsInfo('t.captcha.qq.com');
    log(`  Protocol: ${info.protocol}`);
    log(`  Cipher: ${info.cipherName} (${info.cipherVersion})`);
    log(`  Server cert CN: ${info.certSubject}`);
    log(`  Issuer: ${info.certIssuer}`);
  } catch (e) {
    log(`[ERROR] TLS info: ${e.message}`);
  }

  log('');

  // --- curl with Chrome-like TLS settings ---
  log('--- curl with TLS tuning ---');

  // curl with --ciphers and --tls13-ciphers
  try {
    const sessC = await getSession();
    const urlC = buildShowUrl(sessC);
    const curlCmd = `curl -s -o /dev/null -w "%{http_code}" --max-time 15 ` +
      `--tls13-ciphers TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256 ` +
      `--ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384 ` +
      `"${urlC}"`;
    const code = parseInt(execSync(curlCmd, { encoding: 'utf8', timeout: 20000 }).trim(), 10);
    record('curl-tls', 'curl + Chrome ciphers', code);
  } catch (e) {
    log(`[ERROR] curl + Chrome ciphers: ${e.message}`);
  }

  // curl with --http2
  try {
    const sessC2 = await getSession();
    const urlC2 = buildShowUrl(sessC2);
    const curlCmd = `curl -s -o /dev/null -w "%{http_code}" --max-time 15 --http2 "${urlC2}"`;
    const code = parseInt(execSync(curlCmd, { encoding: 'utf8', timeout: 20000 }).trim(), 10);
    record('curl-tls', 'curl + HTTP/2', code);
  } catch (e) {
    log(`[ERROR] curl + HTTP/2: ${e.message}`);
  }

  // curl with Chrome-like headers
  try {
    const sessC3 = await getSession();
    const urlC3 = buildShowUrl(sessC3);
    const curlCmd = `curl -s -o /dev/null -w "%{http_code}" --max-time 15 ` +
      `-H "sec-ch-ua: \\"Chromium\\";v=\\"146\\", \\"Not-A.Brand\\";v=\\"24\\", \\"Google Chrome\\";v=\\"146\\"" ` +
      `-H "sec-ch-ua-mobile: ?0" ` +
      `-H "sec-ch-ua-platform: \\"Windows\\"" ` +
      `-H "Sec-Fetch-Dest: iframe" ` +
      `-H "Sec-Fetch-Mode: navigate" ` +
      `-H "Sec-Fetch-Site: same-site" ` +
      `-H "Upgrade-Insecure-Requests: 1" ` +
      `-H "User-Agent: ${USER_AGENT}" ` +
      `"${urlC3}"`;
    const code = parseInt(execSync(curlCmd, { encoding: 'utf8', timeout: 20000 }).trim(), 10);
    record('curl-tls', 'curl + Chrome headers', code);
  } catch (e) {
    log(`[ERROR] curl + Chrome headers: ${e.message}`);
  }

  // curl with impersonate (if available — curl-impersonate)
  try {
    // Check if curl-impersonate is available
    execSync('which curl-impersonate-chrome 2>/dev/null', { encoding: 'utf8' });
    const sessC4 = await getSession();
    const urlC4 = buildShowUrl(sessC4);
    const curlCmd = `curl-impersonate-chrome -s -o /dev/null -w "%{http_code}" --max-time 15 "${urlC4}"`;
    const code = parseInt(execSync(curlCmd, { encoding: 'utf8', timeout: 20000 }).trim(), 10);
    record('curl-tls', 'curl-impersonate-chrome', code);
  } catch (e) {
    if (e.message.includes('which')) {
      log('[SKIP] curl-impersonate-chrome: not installed');
    } else {
      log(`[ERROR] curl-impersonate-chrome: ${e.message}`);
    }
  }

  log('');

  // --- Node.js TLS fingerprint comparison ---
  log('--- Node.js Default TLS Fingerprint Details ---');
  try {
    const ctx = tls.createSecureContext();
    log(`  Default min TLS: ${tls.DEFAULT_MIN_VERSION}`);
    log(`  Default max TLS: ${tls.DEFAULT_MAX_VERSION}`);
    log(`  Default ciphers (first 5):`);
    const defaultCiphers = tls.DEFAULT_CIPHERS || 'unavailable';
    const cipherList = defaultCiphers.split(':');
    for (let i = 0; i < Math.min(5, cipherList.length); i++) {
      log(`    ${cipherList[i]}`);
    }
    log(`  Total default ciphers: ${cipherList.length}`);
  } catch (e) {
    log(`[ERROR] TLS fingerprint details: ${e.message}`);
  }

  log('');

  // --- Conclusion ---
  log('=== CONCLUSION ===');
  log('');

  const showResults = results.filter(r => r.name.includes('cap_union_new_show'));
  const allFail = showResults.every(r => r.status === 403);
  const anyPass = showResults.some(r => r.status === 200);
  const tlsResults = results.filter(r => r.tag === 'tls');
  const tlsAnyPass = tlsResults.some(r => r.status === 200);
  const h2Results = results.filter(r => r.tag === 'h2' && r.name.includes('show'));
  const h2Pass = h2Results.some(r => r.status === 200);

  if (allFail && !tlsAnyPass && !h2Pass) {
    log('ALL non-browser requests to cap_union_new_show return 403.');
    log('Changing TLS version, cipher suite, ECDH curves, sigalgs, and');
    log('HTTP protocol version (HTTP/2) did NOT bypass the 403.');
    log('');
    log('This strongly suggests TLS fingerprinting (JA3/JA4) at the');
    log('network edge. The server identifies Node.js and curl by their');
    log('full TLS Client Hello structure (extension order, supported');
    log('groups, ALPN, etc.) — not just the cipher list or TLS version.');
    log('');
    log('The fact that prehandle and tdc.js work fine indicates the');
    log('fingerprint check is ONLY applied to cap_union_new_show.');
    log('');
    log('Workaround options:');
    log('  1. Use Puppeteer (current approach) — real Chrome TLS stack');
    log('  2. Use curl-impersonate — patched curl with Chrome JA3');
    log('  3. Use a TLS library that supports JA3 spoofing (e.g., utls in Go)');
    log('  4. Proxy through a browser extension or mitmproxy with upstream Chrome');
  } else if (tlsAnyPass || h2Pass) {
    log('Some TLS configuration changes DID bypass the 403!');
    log('Check which variants returned 200 above for the specific fix.');
  } else if (anyPass) {
    log('Some requests passed — the 403 may be session-based, not TLS-based.');
  } else {
    log('Inconclusive — review the individual test results above.');
  }

  log('');
  log('=== END ===');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

run().catch((err) => {
  log(`FATAL: ${err.message}`);
  log(err.stack);
  process.exit(1);
});
