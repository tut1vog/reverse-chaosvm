'use strict';

/**
 * Deep Dive: cap_union_new_show 403
 *
 * Systematically tests each possible cause of the 403 independently:
 *   Group 1 — Cookie/session gating (does prehandle cookie jar fix it?)
 *   Group 2 — Header manipulation (exact Chrome headers, header order, Referer)
 *   Group 3 — Chrome TLS isolation (Puppeteer CDP fetch vs Node.js fetch)
 *   Group 4 — TLS bypass attempts (cipher overrides, ecdhCurve, sigalgs)
 *   Group 5 — Legacy getsig endpoint status
 *
 * Usage: node scripts/tls-403-deep-dive.js
 */

const https = require('https');
const tls = require('tls');
const net = require('net');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = 'https://t.captcha.qq.com';
const AID = '2046626881';

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

const CHROME_SIGALGS = [
  'ecdsa_secp256r1_sha256',
  'rsa_pss_rsae_sha256',
  'rsa_pkcs1_sha256',
  'ecdsa_secp384r1_sha384',
  'rsa_pss_rsae_sha384',
  'rsa_pkcs1_sha384',
  'rsa_pss_rsae_sha512',
  'rsa_pkcs1_sha512',
].join(':');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  process.stderr.write(msg + '\n');
}

const results = [];

function record(group, name, status, details) {
  results.push({ group, name, status, details });
  let icon = 'INFO';
  if (status === 200) icon = 'OK-200';
  else if (status === 403) icon = 'FAIL-403';
  else if (status >= 400) icon = `FAIL-${status}`;
  else if (status === -1) icon = 'ERROR';
  log(`  [${icon}] ${name}${details ? '  — ' + details : ''}`);
}

/**
 * Parse JSONP response.
 */
function parseJSONP(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed);
  const m = trimmed.match(/^[a-zA-Z_$][\w$]*\s*\((.+)\)\s*;?\s*$/s);
  if (!m) throw new Error('Not valid JSONP: ' + trimmed.slice(0, 120));
  return JSON.parse(m[1]);
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
        'Accept-Encoding': 'identity',
      },
      timeout: 15000,
      ...extraOpts,
    };
    // Allow extraOpts.headers to merge with (not replace) defaults
    if (extraOpts.headers) {
      opts.headers = Object.assign({}, opts.headers, extraOpts.headers);
    }

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
 * Get a fresh prehandle session.
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
    throw new Error(`prehandle: HTTP ${resp.statusCode}`);
  }
  return parseJSONP(resp.body);
}

/**
 * Build show URL from session data.
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
 * Build getsig URL from session data.
 */
function buildGetSigUrl(session) {
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
    enableDarkMode: '0',
    sid: session.sid,
    sess: session.sess,
    fwidth: '0',
    wxLang: '',
    tcScale: '1',
    uid: '',
    cap_cd: '',
    rnd: String(Math.floor(Math.random() * 1000000)),
    prehandleLoadTime: String(Math.floor(Math.random() * 200 + 100)),
    createIframeStart: String(Date.now()),
    subsid: '2',
    callback: cb,
  });
  return `${BASE_URL}/cap_union_new_getsig?${params.toString()}`;
}

/**
 * Make a raw TLS request with exact header order control.
 * Returns {statusCode, headers, body}.
 */
function rawTlsRequest(hostname, port, rawHttpRequest) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(port, hostname, { servername: hostname }, () => {
      socket.write(rawHttpRequest);

      const chunks = [];
      socket.on('data', (c) => chunks.push(c));
      socket.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        // Parse HTTP response
        const headerEnd = raw.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
          resolve({ statusCode: -1, headers: {}, body: raw });
          return;
        }
        const headerSection = raw.slice(0, headerEnd);
        const body = raw.slice(headerEnd + 4);
        const lines = headerSection.split('\r\n');
        const statusLine = lines[0] || '';
        const statusMatch = statusLine.match(/HTTP\/[\d.]+ (\d+)/);
        const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : -1;
        const headers = {};
        for (let i = 1; i < lines.length; i++) {
          const colonIdx = lines[i].indexOf(':');
          if (colonIdx > 0) {
            const key = lines[i].slice(0, colonIdx).trim().toLowerCase();
            const val = lines[i].slice(colonIdx + 1).trim();
            headers[key] = val;
          }
        }
        resolve({ statusCode, headers, body });
      });
    });

    socket.on('error', reject);
    socket.setTimeout(15000, () => {
      socket.destroy();
      reject(new Error('raw TLS timeout'));
    });
  });
}

// =========================================================================
// Group 1: Cookie/session gating
// =========================================================================

async function testGroup1() {
  log('--- Group 1: Cookie/Session Gating ---');
  log('  Tests whether prehandle cookies are required for show page.\n');

  // Test 1a: Use CaptchaClient directly (has built-in cookie jar)
  log('  [Test 1a] CaptchaClient full flow (prehandle -> getSig)...');
  try {
    const { CaptchaClient } = require('../puppeteer/captcha-client');
    const client = new CaptchaClient({ aid: AID });
    const session = await client.prehandle();
    log(`    Prehandle OK: sess=${session.sess.slice(0, 20)}...`);
    log(`    Cookie jar after prehandle: ${client.cookieJar.toString().slice(0, 80) || '(empty)'}`);

    try {
      const sig = await client.getSig(session);
      log(`    getSig OK: keys=${Object.keys(sig).join(',')}`);
      record('cookies', 'CaptchaClient full flow', 200, 'getSig succeeded');
    } catch (err) {
      const statusMatch = err.message.match(/HTTP (\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : -1;
      log(`    getSig failed: ${err.message}`);
      record('cookies', 'CaptchaClient full flow', status, err.message.slice(0, 100));
    }
  } catch (err) {
    log(`    ERROR: ${err.message}`);
    record('cookies', 'CaptchaClient full flow', -1, err.message.slice(0, 100));
  }

  // Test 1b: Manual flow — prehandle first, capture Set-Cookie, send with show request
  log('\n  [Test 1b] Manual cookie forwarding (prehandle -> capture cookies -> show)...');
  try {
    // Step 1: prehandle and capture Set-Cookie
    const cb = '_aq_' + Math.floor(Math.random() * 100000);
    const prehandleParams = new URLSearchParams({
      aid: AID, protocol: 'https', accver: '1', showtype: 'popup',
      ua: Buffer.from(USER_AGENT).toString('base64'),
      noheader: '1', fb: '1', aged: '0', enableAged: '0', enableDarkMode: '0',
      grayscale: '1', dyeid: '0', clientype: '2', cap_cd: '', uid: '', lang: 'en',
      entry_url: 'https://t.captcha.qq.com/', elder_captcha: '0',
      js: '/tcaptcha-frame.d0752eae.js', login_appid: '', wb: '2', version: '1.1.0',
      subsid: '1', callback: cb, sess: '',
    });
    const prehandleUrl = `${BASE_URL}/cap_union_prehandle?${prehandleParams.toString()}`;
    const preResp = await httpsGet(prehandleUrl);
    const preData = parseJSONP(preResp.body);
    const setCookies = preResp.headers['set-cookie'];
    log(`    Prehandle status: ${preResp.statusCode}`);
    log(`    Set-Cookie headers: ${JSON.stringify(setCookies || 'none')}`);

    // Build cookie string from Set-Cookie headers
    let cookieStr = '';
    if (setCookies) {
      const arr = Array.isArray(setCookies) ? setCookies : [setCookies];
      const pairs = arr.map(h => h.split(';')[0].trim());
      cookieStr = pairs.join('; ');
    }
    log(`    Forwarding cookies: ${cookieStr || '(none)'}`);

    // Step 2: show request WITH those cookies
    const showUrl = buildShowUrl(preData);
    const showResp = await httpsGet(showUrl, {
      headers: cookieStr ? { 'Cookie': cookieStr } : {},
    });
    log(`    Show with cookies: HTTP ${showResp.statusCode}`);
    record('cookies', 'Manual cookie forwarding', showResp.statusCode);

    // Step 3: show request WITHOUT cookies (control)
    const session2 = await getSession();
    const showUrl2 = buildShowUrl(session2);
    const showResp2 = await httpsGet(showUrl2);
    log(`    Show without cookies (control): HTTP ${showResp2.statusCode}`);
    record('cookies', 'No cookies (control)', showResp2.statusCode);

  } catch (err) {
    log(`    ERROR: ${err.message}`);
    record('cookies', 'Manual cookie forwarding', -1, err.message.slice(0, 100));
  }
}

// =========================================================================
// Group 2: Header manipulation
// =========================================================================

async function testGroup2() {
  log('\n--- Group 2: Header Manipulation ---');
  log('  Tests header combinations to rule out header-based blocking.\n');

  // Test 2a: No User-Agent
  log('  [Test 2a] No User-Agent header...');
  try {
    const sess = await getSession();
    const url = buildShowUrl(sess);
    const resp = await httpsGet(url, {
      headers: {
        'User-Agent': undefined,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
      },
    });
    record('headers', 'No User-Agent', resp.statusCode);
  } catch (err) {
    record('headers', 'No User-Agent', -1, err.message.slice(0, 100));
  }

  // Test 2b: Full Chrome headers (all Sec-Fetch, client hints)
  log('  [Test 2b] Full Chrome header set...');
  try {
    const sess = await getSession();
    const url = buildShowUrl(sess);
    const resp = await httpsGet(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'iframe',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
    });
    record('headers', 'Full Chrome headers', resp.statusCode);
  } catch (err) {
    record('headers', 'Full Chrome headers', -1, err.message.slice(0, 100));
  }

  // Test 2c: Without Sec-Fetch headers (minimal)
  log('  [Test 2c] Without Sec-Fetch headers...');
  try {
    const sess = await getSession();
    const url = buildShowUrl(sess);
    const resp = await httpsGet(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
      },
    });
    record('headers', 'No Sec-Fetch headers', resp.statusCode);
  } catch (err) {
    record('headers', 'No Sec-Fetch headers', -1, err.message.slice(0, 100));
  }

  // Test 2d: With Referer pointing to urlsec.qq.com
  log('  [Test 2d] Referer: urlsec.qq.com...');
  try {
    const sess = await getSession();
    const url = buildShowUrl(sess);
    const resp = await httpsGet(url, {
      headers: {
        'Referer': 'https://urlsec.qq.com/check.html',
        'Sec-Fetch-Dest': 'iframe',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
      },
    });
    record('headers', 'Referer: urlsec.qq.com', resp.statusCode);
  } catch (err) {
    record('headers', 'Referer: urlsec.qq.com', -1, err.message.slice(0, 100));
  }

  // Test 2e: Raw TLS with Chrome-exact header ORDER
  log('  [Test 2e] Raw TLS with Chrome-exact header order...');
  try {
    const sess = await getSession();
    const url = buildShowUrl(sess);
    const parsed = new URL(url);
    const path = parsed.pathname + parsed.search;

    // Chrome sends headers in this exact order (from HAR/devtools)
    const rawRequest =
      `GET ${path} HTTP/1.1\r\n` +
      `Host: t.captcha.qq.com\r\n` +
      `Connection: keep-alive\r\n` +
      `Cache-Control: no-cache\r\n` +
      `Pragma: no-cache\r\n` +
      `sec-ch-ua: "Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"\r\n` +
      `sec-ch-ua-mobile: ?0\r\n` +
      `sec-ch-ua-platform: "Windows"\r\n` +
      `Upgrade-Insecure-Requests: 1\r\n` +
      `User-Agent: ${USER_AGENT}\r\n` +
      `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7\r\n` +
      `Sec-Fetch-Site: same-site\r\n` +
      `Sec-Fetch-Mode: navigate\r\n` +
      `Sec-Fetch-Dest: iframe\r\n` +
      `Sec-Fetch-User: ?1\r\n` +
      `Referer: https://urlsec.qq.com/\r\n` +
      `Accept-Encoding: identity\r\n` +
      `Accept-Language: en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7\r\n` +
      `\r\n`;

    const resp = await rawTlsRequest('t.captcha.qq.com', 443, rawRequest);
    record('headers', 'Raw TLS Chrome header order', resp.statusCode);
  } catch (err) {
    record('headers', 'Raw TLS Chrome header order', -1, err.message.slice(0, 100));
  }
}

// =========================================================================
// Group 3: Puppeteer CDP — isolate TLS from everything else
// =========================================================================

async function testGroup3() {
  log('\n--- Group 3: Chrome TLS Isolation (Puppeteer CDP) ---');
  log('  KEY TEST: If Chrome fetch() gets 200 but Node.js gets 403,');
  log('  TLS fingerprinting is confirmed as the cause.\n');

  let browser;
  try {
    const puppeteer = require('puppeteer');

    log('  Launching headless Chrome...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    // Get a fresh session for Chrome test
    const sess = await getSession();
    const showUrl = buildShowUrl(sess);
    log(`  Show URL: ${showUrl.slice(0, 80)}...`);

    // Test 3a: Chrome page.evaluate + fetch()
    log('\n  [Test 3a] Chrome fetch() via page.evaluate...');
    const page = await browser.newPage();
    try {
      const chromeResult = await page.evaluate(async (url) => {
        try {
          const resp = await fetch(url, { mode: 'no-cors', credentials: 'omit' });
          // no-cors gives opaque response — try cors mode too
          return { status: resp.status, type: resp.type, ok: resp.ok };
        } catch (e) {
          return { error: e.message };
        }
      }, showUrl);
      log(`    Chrome fetch (no-cors): status=${chromeResult.status}, type=${chromeResult.type}`);

      // Also try with cors mode for actual status
      const chromeResult2 = await page.evaluate(async (url) => {
        try {
          const resp = await fetch(url, { mode: 'cors', credentials: 'omit' });
          const text = await resp.text().catch(() => '');
          return { status: resp.status, bodyLen: text.length, bodyPreview: text.slice(0, 200) };
        } catch (e) {
          return { error: e.message };
        }
      }, showUrl);

      if (chromeResult2.error) {
        log(`    Chrome fetch (cors): error=${chromeResult2.error}`);
        // CORS error is expected — the server may not send CORS headers.
        // Try navigation instead.
      } else {
        log(`    Chrome fetch (cors): status=${chromeResult2.status}, bodyLen=${chromeResult2.bodyLen}`);
        record('chrome-tls', 'Chrome fetch()', chromeResult2.status);
      }
    } catch (err) {
      log(`    Chrome fetch error: ${err.message}`);
    }
    await page.close();

    // Test 3b: Chrome page.goto (full navigation — most realistic)
    log('\n  [Test 3b] Chrome page.goto (full navigation)...');
    const sess2 = await getSession();
    const showUrl2 = buildShowUrl(sess2);
    const page2 = await browser.newPage();
    try {
      const response = await page2.goto(showUrl2, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      const status = response ? response.status() : -1;
      const bodyLen = response ? (await response.text().catch(() => '')).length : 0;
      log(`    Chrome page.goto: status=${status}, bodyLen=${bodyLen}`);
      record('chrome-tls', 'Chrome page.goto', status);
    } catch (err) {
      log(`    Chrome page.goto error: ${err.message}`);
      record('chrome-tls', 'Chrome page.goto', -1, err.message.slice(0, 100));
    }
    await page2.close();

    // Test 3c: CDP Network.loadNetworkResource (uses Chrome network stack, no navigation)
    log('\n  [Test 3c] CDP Network fetch (Chrome TLS, no navigation)...');
    const sess3 = await getSession();
    const showUrl3 = buildShowUrl(sess3);
    const page3 = await browser.newPage();
    try {
      const cdp = await page3.createCDPSession();
      await cdp.send('Network.enable');

      // Use CDP to fetch — this uses Chrome's full network stack
      const result = await cdp.send('Network.loadNetworkResource', {
        url: showUrl3,
        options: { disableCache: true, includeCredentials: false },
        frameId: (await cdp.send('Page.getFrameTree')).frameTree.frame.id,
      });

      const resource = result.resource;
      log(`    CDP loadNetworkResource: success=${resource.success}, httpStatusCode=${resource.httpStatusCode}`);
      if (resource.success && resource.stream) {
        // Read the stream
        let body = '';
        let eof = false;
        while (!eof) {
          const chunk = await cdp.send('IO.read', { handle: resource.stream, size: 65536 });
          body += chunk.data;
          eof = chunk.eof;
        }
        await cdp.send('IO.close', { handle: resource.stream });
        log(`    Body length: ${body.length}`);
      }
      record('chrome-tls', 'CDP loadNetworkResource', resource.httpStatusCode || -1);
      await cdp.detach();
    } catch (err) {
      log(`    CDP error: ${err.message}`);
      record('chrome-tls', 'CDP loadNetworkResource', -1, err.message.slice(0, 100));
    }
    await page3.close();

    // Node.js control test with same session parameters
    log('\n  [Test 3d] Node.js https.get (control — same URL pattern)...');
    const sess4 = await getSession();
    const showUrl4 = buildShowUrl(sess4);
    try {
      const nodeResp = await httpsGet(showUrl4);
      log(`    Node.js: HTTP ${nodeResp.statusCode}, bodyLen=${nodeResp.body.length}`);
      record('chrome-tls', 'Node.js control', nodeResp.statusCode);
    } catch (err) {
      record('chrome-tls', 'Node.js control', -1, err.message.slice(0, 100));
    }

  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      log('  SKIP: puppeteer not installed');
      record('chrome-tls', 'Puppeteer CDP tests', -1, 'puppeteer not installed');
    } else {
      log(`  ERROR: ${err.message}`);
      record('chrome-tls', 'Puppeteer CDP tests', -1, err.message.slice(0, 100));
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

// =========================================================================
// Group 4: TLS bypass attempts
// =========================================================================

async function testGroup4() {
  log('\n--- Group 4: TLS Bypass Attempts ---');
  log('  Various TLS configurations to probe what the server checks.\n');

  // Test 4a: Chrome ciphers + curves + sigalgs
  log('  [Test 4a] Chrome ciphers + ECDH curves + sigalgs...');
  try {
    const sess = await getSession();
    const url = buildShowUrl(sess);
    const resp = await httpsGet(url, {
      ciphers: CHROME_CIPHERS,
      ecdhCurve: 'X25519:prime256v1:secp384r1',
      sigalgs: CHROME_SIGALGS,
    });
    record('tls-bypass', 'Chrome ciphers+curves+sigalgs', resp.statusCode);
  } catch (err) {
    record('tls-bypass', 'Chrome ciphers+curves+sigalgs', -1, err.message.slice(0, 100));
  }

  // Test 4b: Force TLS 1.3 only
  log('  [Test 4b] TLS 1.3 only...');
  try {
    const sess = await getSession();
    const url = buildShowUrl(sess);
    const resp = await httpsGet(url, {
      minVersion: 'TLSv1.3',
      maxVersion: 'TLSv1.3',
    });
    record('tls-bypass', 'TLS 1.3 only', resp.statusCode);
  } catch (err) {
    record('tls-bypass', 'TLS 1.3 only', -1, err.message.slice(0, 100));
  }

  // Test 4c: Force TLS 1.2 only
  log('  [Test 4c] TLS 1.2 only...');
  try {
    const sess = await getSession();
    const url = buildShowUrl(sess);
    const resp = await httpsGet(url, {
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
    });
    record('tls-bypass', 'TLS 1.2 only', resp.statusCode);
  } catch (err) {
    record('tls-bypass', 'TLS 1.2 only', -1, err.message.slice(0, 100));
  }

  // Test 4d: Minimal cipher set (just AES-128-GCM)
  log('  [Test 4d] Minimal cipher set...');
  try {
    const sess = await getSession();
    const url = buildShowUrl(sess);
    const resp = await httpsGet(url, {
      ciphers: 'TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES128-GCM-SHA256',
    });
    record('tls-bypass', 'Minimal ciphers', resp.statusCode);
  } catch (err) {
    record('tls-bypass', 'Minimal ciphers', -1, err.message.slice(0, 100));
  }

  // Test 4e: ALPN override — advertise only h2 (Chrome-like)
  log('  [Test 4e] ALPN: h2 only...');
  try {
    const sess = await getSession();
    const url = buildShowUrl(sess);
    const resp = await httpsGet(url, {
      ALPNProtocols: ['h2', 'http/1.1'],
    });
    record('tls-bypass', 'ALPN h2+http/1.1', resp.statusCode);
  } catch (err) {
    record('tls-bypass', 'ALPN h2+http/1.1', -1, err.message.slice(0, 100));
  }

  // Test 4f: Full Chrome-like TLS config combined
  log('  [Test 4f] Full Chrome-like TLS config...');
  try {
    const sess = await getSession();
    const url = buildShowUrl(sess);
    const resp = await httpsGet(url, {
      ciphers: CHROME_CIPHERS,
      ecdhCurve: 'X25519:prime256v1:secp384r1',
      sigalgs: CHROME_SIGALGS,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
      ALPNProtocols: ['h2', 'http/1.1'],
      secureOptions: 0, // No special options
    });
    record('tls-bypass', 'Full Chrome TLS config', resp.statusCode);
  } catch (err) {
    record('tls-bypass', 'Full Chrome TLS config', -1, err.message.slice(0, 100));
  }

  // Test 4g: Check if tls-client-api package is available
  log('  [Test 4g] Checking for tls-client npm package...');
  try {
    require.resolve('tls-client');
    log('    tls-client is available');
    record('tls-bypass', 'tls-client availability', 0, 'installed');
  } catch (err) {
    log('    tls-client NOT installed (npm install tls-client to try JA3 spoofing)');
    record('tls-bypass', 'tls-client availability', -1, 'not installed');
  }

  // Test 4h: Prehandle endpoint with same TLS config (control — should always work)
  log('  [Test 4h] Prehandle with default TLS (control)...');
  try {
    const preUrl = `${BASE_URL}/cap_union_prehandle?aid=${AID}&protocol=https&accver=1&showtype=popup&ua=${Buffer.from(USER_AGENT).toString('base64')}&noheader=1&fb=1&aged=0&enableAged=0&enableDarkMode=0&grayscale=1&dyeid=0&clientype=2&cap_cd=&uid=&lang=en&entry_url=https%3A%2F%2Ft.captcha.qq.com%2F&elder_captcha=0&js=%2Ftcaptcha-frame.d0752eae.js&login_appid=&wb=2&version=1.1.0&subsid=99&callback=_aq_ctrl&sess=`;
    const resp = await httpsGet(preUrl);
    record('tls-bypass', 'Prehandle control (default TLS)', resp.statusCode);
  } catch (err) {
    record('tls-bypass', 'Prehandle control (default TLS)', -1, err.message.slice(0, 100));
  }
}

// =========================================================================
// Group 5: Legacy getsig endpoint
// =========================================================================

async function testGroup5() {
  log('\n--- Group 5: Legacy getsig Endpoint ---');
  log('  Check if /cap_union_new_getsig works with proper session params.\n');

  // Test 5a: getsig with full params from a valid prehandle session
  log('  [Test 5a] getsig with full session params...');
  try {
    const sess = await getSession();
    const url = buildGetSigUrl(sess);
    const resp = await httpsGet(url);
    log(`    getsig: HTTP ${resp.statusCode}, bodyLen=${resp.body.length}`);
    if (resp.statusCode === 200) {
      try {
        const data = parseJSONP(resp.body);
        log(`    Parsed keys: ${Object.keys(data).join(', ')}`);
      } catch (e) {
        log(`    Body (not JSONP): ${resp.body.slice(0, 200)}`);
      }
    } else {
      log(`    Body: ${resp.body.slice(0, 200)}`);
    }
    record('getsig', 'getsig with full params', resp.statusCode);
  } catch (err) {
    record('getsig', 'getsig with full params', -1, err.message.slice(0, 100));
  }

  // Test 5b: getsig with minimal params (just aid)
  log('\n  [Test 5b] getsig with minimal params...');
  try {
    const url = `${BASE_URL}/cap_union_new_getsig?aid=${AID}&callback=_aq_min`;
    const resp = await httpsGet(url);
    log(`    getsig minimal: HTTP ${resp.statusCode}`);
    record('getsig', 'getsig minimal params', resp.statusCode);
  } catch (err) {
    record('getsig', 'getsig minimal params', -1, err.message.slice(0, 100));
  }

  // Test 5c: Check what status getsig returns (might be different from 404)
  log('\n  [Test 5c] getsig via CaptchaClient._getSigLegacy...');
  try {
    const { CaptchaClient } = require('../puppeteer/captcha-client');
    const client = new CaptchaClient({ aid: AID });
    const session = await client.prehandle();
    try {
      const result = await client._getSigLegacy(session);
      log(`    _getSigLegacy OK: ${Object.keys(result).join(', ')}`);
      record('getsig', 'CaptchaClient._getSigLegacy', 200);
    } catch (err) {
      log(`    _getSigLegacy failed: ${err.message}`);
      const statusMatch = err.message.match(/HTTP (\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : -1;
      record('getsig', 'CaptchaClient._getSigLegacy', status, err.message.slice(0, 100));
    }
  } catch (err) {
    record('getsig', 'CaptchaClient._getSigLegacy', -1, err.message.slice(0, 100));
  }
}

// =========================================================================
// Summary
// =========================================================================

function printSummary() {
  log('\n========================================');
  log('=== SUMMARY ===');
  log('========================================\n');

  const groups = {};
  for (const r of results) {
    if (!groups[r.group]) groups[r.group] = [];
    groups[r.group].push(r);
  }

  for (const [group, tests] of Object.entries(groups)) {
    const any200 = tests.some(t => t.status === 200);
    const all403 = tests.filter(t => t.status !== -1 && t.status !== 0).every(t => t.status === 403);
    log(`  ${group}:`);
    for (const t of tests) {
      log(`    ${t.status === 200 ? 'PASS' : t.status === 403 ? '403 ' : String(t.status).padEnd(4)} ${t.name}`);
    }
    if (any200) log(`    >> Some tests got 200 — this group MAY be a factor`);
    if (all403) log(`    >> All tests got 403 — this group is NOT the cause`);
    log('');
  }

  // Key conclusions
  const chromeTests = results.filter(r => r.group === 'chrome-tls');
  const chromeGot200 = chromeTests.some(r => r.status === 200);
  const nodeGot403 = chromeTests.some(r => r.name === 'Node.js control' && r.status === 403);

  log('=== DIAGNOSIS ===\n');

  if (chromeGot200 && nodeGot403) {
    log('  CONFIRMED: Chrome gets 200, Node.js gets 403.');
    log('  The 403 is caused by TLS fingerprinting (JA3/JA4).');
    log('  The server identifies non-browser TLS stacks at the network edge.');
    log('  Headers, cookies, and session state are NOT the cause.');
  } else if (!chromeGot200 && chromeTests.length > 0) {
    log('  SURPRISE: Chrome ALSO gets non-200. The 403 is NOT caused by TLS.');
    log('  Investigate: session requirements, page context, CORS, or IP-based blocking.');
  } else if (chromeTests.length === 0) {
    log('  Puppeteer tests did not run — cannot isolate TLS as the cause.');
    log('  Review the other test groups for clues.');
  }

  const cookieTests = results.filter(r => r.group === 'cookies');
  const cookieFixed = cookieTests.some(r => r.status === 200);
  if (cookieFixed) {
    log('  NOTE: Cookie forwarding got 200 — cookies may be required!');
  }

  const headerTests = results.filter(r => r.group === 'headers');
  const headerFixed = headerTests.some(r => r.status === 200);
  if (headerFixed) {
    log('  NOTE: Some header combination got 200 — headers may be a factor!');
  }

  const getsigTests = results.filter(r => r.group === 'getsig');
  const getsigWorks = getsigTests.some(r => r.status === 200);
  if (getsigWorks) {
    log('  NOTE: Legacy getsig endpoint is WORKING — can bypass show page entirely!');
  }

  log('');
}

// =========================================================================
// Main
// =========================================================================

async function main() {
  log('=== Deep Dive: cap_union_new_show 403 ===');
  log(`Timestamp: ${new Date().toISOString()}`);
  log(`Node.js: ${process.version}`);
  log(`OpenSSL: ${process.versions.openssl}`);
  log('');

  await testGroup1();
  await testGroup2();
  await testGroup3();
  await testGroup4();
  await testGroup5();

  printSummary();
}

main().catch((err) => {
  log('FATAL: ' + err.message);
  log(err.stack);
  process.exit(1);
});
