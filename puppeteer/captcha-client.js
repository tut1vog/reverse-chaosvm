'use strict';

/**
 * CaptchaClient — Pure Node.js HTTP client for the Tencent CAPTCHA 4-endpoint flow.
 *
 * Implements the complete network protocol:
 *   1. prehandle()      → GET /cap_union_prehandle   → {sess, sid, ...}
 *   2. getSig(session)  → GET /cap_union_new_getsig  → {bgUrl, sliceUrl, vsig, websig, nonce, spt, ...}
 *   3. downloadImages() → GET /hycdn?index=1,2       → {bgBuffer, sliceBuffer}
 *   4. verify(params)   → POST /cap_union_new_verify → {errorCode, ticket, randstr}
 *
 * No external HTTP dependencies — uses Node.js built-in https/http modules only.
 * Cookie jar is maintained across all requests in a session.
 */

const https = require('https');
const http = require('http');
const zlib = require('zlib');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://t.captcha.qq.com';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT = 10000; // 10 seconds

// ---------------------------------------------------------------------------
// Cookie Jar — simple name→value map
// ---------------------------------------------------------------------------

class CookieJar {
  constructor() {
    /** @type {Map<string, string>} */
    this.cookies = new Map();
  }

  /**
   * Parse Set-Cookie headers and store cookies.
   * @param {string|string[]} setCookieHeaders
   */
  capture(setCookieHeaders) {
    if (!setCookieHeaders) return;
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const header of headers) {
      // Only take the first name=value pair (before any ;attributes)
      const pair = header.split(';')[0].trim();
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) {
        const name = pair.slice(0, eqIdx).trim();
        const value = pair.slice(eqIdx + 1).trim();
        this.cookies.set(name, value);
      }
    }
  }

  /**
   * Build Cookie header value from stored cookies.
   * @returns {string}
   */
  toString() {
    if (this.cookies.size === 0) return '';
    const parts = [];
    for (const [name, value] of this.cookies) {
      parts.push(`${name}=${value}`);
    }
    return parts.join('; ');
  }

  clear() {
    this.cookies.clear();
  }
}

// ---------------------------------------------------------------------------
// JSONP Parser
// ---------------------------------------------------------------------------

/**
 * Parse a JSONP response string into a plain object.
 * Handles: callback({...}), TencentCaptcha({...}), _aq_72726({...}), etc.
 *
 * @param {string} text — raw JSONP response body
 * @returns {object} — parsed JSON payload
 * @throws {Error} — if text is not valid JSONP or JSON
 */
function parseJSONP(text) {
  const trimmed = text.trim();

  // Try plain JSON first (in case server returns unwrapped JSON)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }

  // Match JSONP: functionName( ... ) with optional trailing semicolon
  const match = trimmed.match(/^[a-zA-Z_$][\w$]*\s*\((.+)\)\s*;?\s*$/s);
  if (!match) {
    throw new Error(`Not valid JSONP: ${trimmed.slice(0, 120)}...`);
  }

  return JSON.parse(match[1]);
}

// ---------------------------------------------------------------------------
// Low-level HTTP request helper
// ---------------------------------------------------------------------------

/**
 * Make an HTTP/HTTPS request and return {statusCode, headers, body}.
 *
 * @param {string} urlStr — full URL
 * @param {object} opts
 * @param {string} [opts.method='GET']
 * @param {object} [opts.headers={}]
 * @param {string|Buffer} [opts.body]
 * @param {number} [opts.timeout]
 * @param {CookieJar} [opts.cookieJar]
 * @param {boolean} [opts.binary=false] — if true, return body as Buffer
 * @returns {Promise<{statusCode: number, headers: object, body: string|Buffer}>}
 */
function httpRequest(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const transport = parsed.protocol === 'https:' ? https : http;

    const reqHeaders = Object.assign({}, opts.headers || {});

    // Inject cookies
    if (opts.cookieJar) {
      const cookieStr = opts.cookieJar.toString();
      if (cookieStr) {
        reqHeaders['Cookie'] = cookieStr;
      }
    }

    const reqOpts = {
      method: opts.method || 'GET',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: reqHeaders,
      timeout: opts.timeout || DEFAULT_TIMEOUT,
    };

    const req = transport.request(reqOpts, (res) => {
      // Capture cookies from response
      if (opts.cookieJar && res.headers['set-cookie']) {
        opts.cookieJar.capture(res.headers['set-cookie']);
      }

      // Handle gzip/deflate Content-Encoding transparently
      let stream = res;
      const encoding = (res.headers['content-encoding'] || '').toLowerCase();
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }

      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        const rawBuf = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: opts.binary ? rawBuf : rawBuf.toString('utf8'),
        });
      });
      stream.on('error', (err) => {
        reject(new Error(`Decompression failed for ${urlStr}: ${err.message}`));
      });
    });

    req.on('error', (err) => {
      reject(new Error(`HTTP request failed for ${urlStr}: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`HTTP request timed out after ${reqOpts.timeout}ms: ${urlStr}`));
    });

    if (opts.body) {
      req.write(opts.body);
    }

    req.end();
  });
}

// ---------------------------------------------------------------------------
// CaptchaClient
// ---------------------------------------------------------------------------

class CaptchaClient {
  /**
   * @param {object} config
   * @param {string} config.aid — App ID (e.g., '2091569087')
   * @param {string} [config.referer] — Referer header for requests
   * @param {number} [config.timeout=10000] — request timeout in ms
   * @param {string} [config.userAgent] — custom User-Agent
   */
  constructor(config) {
    if (!config || !config.aid) {
      throw new Error('CaptchaClient requires config.aid');
    }

    this.aid = config.aid;
    this.referer = config.referer || 'https://t.captcha.qq.com/';
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.userAgent = config.userAgent || DEFAULT_USER_AGENT;

    /** @type {CookieJar} */
    this.cookieJar = new CookieJar();

    /**
     * Subsid counter — increments per request in the session.
     * HAR shows: prehandle=9, show=10, hycdn=11,12, caplog=13, verify subsid=10 (show page value).
     * We start at 1 and increment for each request. The verify POST body uses
     * the show page's subsid value (captured at show time).
     * @type {number}
     */
    this._subsid = 1;

    /** Show page subsid value — captured when show page is fetched, used in verify */
    this._showSubsid = '1';
  }

  /**
   * Build common headers for all requests.
   * @param {object} [extra] — additional headers to merge
   * @returns {object}
   */
  _headers(extra) {
    const h = {
      'User-Agent': this.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      // Chrome client hints — HAR shows these on ALL requests (Category 3+4)
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Referer': this.referer,
    };
    if (extra) Object.assign(h, extra);
    return h;
  }

  /**
   * Generate a JSONP callback name for query params.
   * Tencent expects the callback name to match a specific format.
   * @returns {string}
   */
  _callbackName() {
    return '_aq_' + Math.floor(Math.random() * 100000);
  }

  // -----------------------------------------------------------------------
  // Step 1: prehandle — Get CAPTCHA session
  // -----------------------------------------------------------------------

  /**
   * GET /cap_union_prehandle — initiate a CAPTCHA session.
   *
   * @param {object} [opts] — optional overrides
   * @param {string} [opts.protocol='https'] — protocol field
   * @param {string} [opts.clientType='2'] — client type
   * @param {string} [opts.appType='2'] — app type
   * @returns {Promise<object>} — parsed session data with at least {sess, sid, capclass, subcapclass}
   */
  async prehandle(opts = {}) {
    const cb = this._callbackName();
    const subsid = String(this._subsid++);
    // HAR param order: aid, protocol, accver, showtype, ua, noheader, fb, aged,
    // enableAged, enableDarkMode, grayscale, dyeid, clientype, cap_cd, uid, lang,
    // entry_url, elder_captcha, js, login_appid, wb, version, subsid, callback, sess
    const params = new URLSearchParams({
      aid: this.aid,
      protocol: opts.protocol || 'https',
      accver: '1',
      showtype: 'popup',
      ua: Buffer.from(this.userAgent).toString('base64'),
      noheader: '1',
      fb: '1',
      aged: '0',
      enableAged: '0',
      enableDarkMode: '0',
      grayscale: '1',
      dyeid: '0',
      clientype: opts.clientType || '2',
      cap_cd: '',
      uid: '',
      lang: 'en',
      entry_url: this.referer,
      elder_captcha: '0',
      js: '/tcaptcha-frame.d0752eae.js',
      login_appid: '',
      wb: '2',
      version: '1.1.0',
      subsid: subsid,
      callback: cb,
      sess: '',
    });

    const url = `${BASE_URL}/cap_union_prehandle?${params.toString()}`;

    const resp = await httpRequest(url, {
      headers: this._headers({
        'Accept': '*/*',
        'Sec-Fetch-Dest': 'script',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'same-site',
      }),
      timeout: this.timeout,
      cookieJar: this.cookieJar,
    });

    if (resp.statusCode !== 200) {
      throw new Error(`prehandle: HTTP ${resp.statusCode} — ${resp.body.slice(0, 200)}`);
    }

    const data = parseJSONP(resp.body);

    // Validate required fields
    if (!data.sess) {
      throw new Error(`prehandle: missing 'sess' in response: ${JSON.stringify(data).slice(0, 200)}`);
    }

    return {
      sess: data.sess,
      sid: data.sid || '',
      capclass: data.capclass || '',
      subcapclass: data.subcapclass || '',
      state: data.state,
      src_1: data.src_1 || '',
      src_2: data.src_2 || '',
      src_3: data.src_3 || '',
      extra: data.extra || '',
      /* preserve the entire response for downstream use */
      _raw: data,
    };
  }

  // -----------------------------------------------------------------------
  // Step 2: getSig — Get signature + image URLs
  // -----------------------------------------------------------------------

  /**
   * Get verification signature and image URLs.
   *
   * Tries the legacy /cap_union_new_getsig endpoint first. If it returns 404
   * (endpoint removed in newer API versions), falls back to parsing the config
   * embedded in the /cap_union_new_show HTML page.
   *
   * @param {object} session — result from prehandle()
   * @returns {Promise<object>} — {bgUrl, sliceUrl, vsig, websig, nonce, spt, ...}
   */
  async getSig(session) {
    // Try legacy endpoint first
    try {
      const result = await this._getSigLegacy(session);
      return result;
    } catch (err) {
      // If 404 (endpoint removed), fall back to show page config
      if (err.message && err.message.includes('HTTP 404')) {
        return this._getShowConfig(session);
      }
      throw err;
    }
  }

  /**
   * Legacy: GET /cap_union_new_getsig — old JSONP endpoint.
   * @param {object} session
   * @returns {Promise<object>}
   */
  async _getSigLegacy(session) {
    const cb = this._callbackName();
    const params = new URLSearchParams({
      aid: this.aid,
      protocol: 'https',
      accver: '1',
      showtype: 'popup',
      ua: Buffer.from(this.userAgent).toString('base64'),
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
      subsid: String(this._subsid++),
      callback: cb,
    });

    const url = `${BASE_URL}/cap_union_new_getsig?${params.toString()}`;

    const resp = await httpRequest(url, {
      headers: this._headers({
        'Accept': '*/*',
        'Sec-Fetch-Dest': 'script',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'same-origin',
      }),
      timeout: this.timeout,
      cookieJar: this.cookieJar,
    });

    if (resp.statusCode !== 200) {
      throw new Error(`getSig: HTTP ${resp.statusCode} — ${resp.body.slice(0, 200)}`);
    }

    const data = parseJSONP(resp.body);

    const bgUrl = this._resolveImageUrl(data.bg_url || data.cdnPic1 || data.bgurl || '');
    const sliceUrl = this._resolveImageUrl(data.slice_url || data.cdnPic2 || data.sliceurl || '');

    return {
      bgUrl,
      sliceUrl,
      vsig: data.vsig || '',
      websig: data.websig || '',
      nonce: data.nonce || '',
      spt: data.spt || '',
      subcapclass: data.subcapclass || session.subcapclass || '',
      capclass: data.capclass || session.capclass || '',
      sess: data.sess || session.sess,
      sid: data.sid || session.sid,
      _raw: data,
    };
  }

  /**
   * New flow: GET /cap_union_new_show — parse the embedded JS config from the
   * CAPTCHA iframe HTML to extract nonce, image URLs, session data, etc.
   *
   * As of 2026, the legacy /cap_union_new_getsig endpoint returns 404. The
   * show page HTML embeds a JS config object containing all the data we need.
   *
   * @param {object} session — result from prehandle()
   * @returns {Promise<object>} — same shape as getSig() result
   */
  async _getShowConfig(session) {
    // CRITICAL (Task 10.5.3): The show page URL param order determines the
    // queryMap field order in the verify POST body. Must match real browser exactly.
    // Order verified from HAR capture.
    const showSubsid = String(this._subsid++);
    this._showSubsid = showSubsid; // Capture for verify POST body

    const params = new URLSearchParams({
      /*  1 */ aid: this.aid,
      /*  2 */ protocol: 'https',
      /*  3 */ accver: '1',
      /*  4 */ showtype: 'popup',
      /*  5 */ ua: Buffer.from(this.userAgent).toString('base64'),
      /*  6 */ noheader: '1',
      /*  7 */ fb: '1',
      /*  8 */ aged: '0',
      /*  9 */ enableAged: '0',
      /* 10 */ enableDarkMode: '0',
      /* 11 */ grayscale: '1',
      /* 12 */ dyeid: '0',
      /* 13 */ clientype: '2',
      /* 14 */ sess: session.sess,
      /* 15 */ fwidth: '0',
      /* 16 */ sid: session.sid,
      /* 17 */ wxLang: '',
      /* 18 */ tcScale: '1',
      /* 19 */ uid: '',
      /* 20 */ cap_cd: '',
      /* 21 */ rnd: String(Math.floor(Math.random() * 1000000)),
      /* 22 */ prehandleLoadTime: String(Math.floor(Math.random() * 200 + 100)),
      /* 23 */ createIframeStart: String(Date.now()),
      /* 24 */ global: '0',
      /* 25 */ subsid: showSubsid,
    });

    const url = `${BASE_URL}/cap_union_new_show?${params.toString()}`;
    this._lastShowUrl = url; // Store for Referer in subsequent requests

    const resp = await httpRequest(url, {
      headers: this._headers({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Sec-Fetch-Dest': 'iframe',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      }),
      timeout: this.timeout,
      cookieJar: this.cookieJar,
    });

    if (resp.statusCode !== 200) {
      throw new Error(`getShowConfig: HTTP ${resp.statusCode} — ${resp.body.slice(0, 200)}`);
    }

    // Parse the embedded config from the HTML page.
    // The config is a JS object literal containing nonce, cdnPic1, cdnPic2, sess, etc.
    const config = this._parseShowConfig(resp.body);

    // Use cdnPic1/cdnPic2 from show page config — these are the correct hycdn URLs.
    // HAR shows: /hycdn?index=1&image=<imageId>?aid=<aid>&sess=<sess>&sid=<sid>&img_index=1&subsid=11
    // The show page config embeds these as cdnPic1 (bg) and cdnPic2 (slice).
    const sessVal = config.sess || session.sess;
    const sidVal = config.sid || session.sid;

    // cdnPic1/cdnPic2 contain the full hycdn path including image ID.
    // We resolve them to absolute URLs and append subsid.
    let bgUrl, sliceUrl;
    if (config.cdnPic1) {
      const bgSubsid = String(this._subsid++);
      bgUrl = this._resolveImageUrl(config.cdnPic1);
      // Append subsid and img_index if not already present
      const bgSep = bgUrl.includes('?') ? '&' : '?';
      bgUrl += `${bgSep}aid=${encodeURIComponent(this.aid)}&sess=${encodeURIComponent(sessVal)}&sid=${encodeURIComponent(sidVal)}&img_index=1&subsid=${bgSubsid}`;
    } else {
      bgUrl = `${BASE_URL}/hycdn?index=1&aid=${encodeURIComponent(this.aid)}&sess=${encodeURIComponent(sessVal)}&sid=${encodeURIComponent(sidVal)}&img_index=1&subsid=${String(this._subsid++)}`;
    }
    if (config.cdnPic2) {
      const sliceSubsid = String(this._subsid++);
      sliceUrl = this._resolveImageUrl(config.cdnPic2);
      const sliceSep = sliceUrl.includes('?') ? '&' : '?';
      sliceUrl += `${sliceSep}aid=${encodeURIComponent(this.aid)}&sess=${encodeURIComponent(sessVal)}&sid=${encodeURIComponent(sidVal)}&img_index=2&subsid=${sliceSubsid}`;
    } else {
      sliceUrl = `${BASE_URL}/hycdn?index=2&aid=${encodeURIComponent(this.aid)}&sess=${encodeURIComponent(sessVal)}&sid=${encodeURIComponent(sidVal)}&img_index=2&subsid=${String(this._subsid++)}`;
    }

    return {
      bgUrl,
      sliceUrl,
      vsig: config.vsig || '',
      websig: config.websig || '',
      nonce: config.nonce || '',
      spt: config.spt || '',
      subcapclass: config.subcapclass || session.subcapclass || '',
      capclass: config.capclass || session.capclass || '',
      sess: sessVal,
      sid: sidVal,
      // Full show page URL — used as Referer in verify (HAR analysis: real browser
      // sends the complete show URL with all params as Referer, not just the base path)
      showUrl: url,
      // Show page subsid — used in verify POST body (HAR: subsid=10 = show page value)
      showSubsid: showSubsid,
      _raw: config,
    };
  }

  /**
   * Parse the embedded JS config object from the cap_union_new_show HTML.
   *
   * The HTML contains a JS object with fields like:
   *   {htdocsPath:"...",nonce:"...",cdnPic1:"...",cdnPic2:"...",sess:"...",...}
   *
   * We find it by searching for the nonce field and extracting the enclosing object.
   *
   * @param {string} html — raw HTML body
   * @returns {object} — parsed config
   */
  _parseShowConfig(html) {
    // Strategy: find 'nonce:"' marker, then scan backwards for the opening '{',
    // and forwards for the matching closing '}'.
    const marker = 'nonce:"';
    const markerIdx = html.indexOf(marker);
    if (markerIdx === -1) {
      throw new Error('getShowConfig: could not find nonce in show page');
    }

    // Scan backwards to find the start of the config object
    let start = markerIdx;
    let depth = 0;
    while (start > 0) {
      if (html[start] === '}') depth++;
      if (html[start] === '{') {
        if (depth === 0) break;
        depth--;
      }
      start--;
    }

    // Scan forwards to find the matching closing '}'
    let end = start;
    depth = 0;
    for (let i = start; i < html.length; i++) {
      if (html[i] === '{') depth++;
      if (html[i] === '}') {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }

    const rawConfig = html.slice(start, end);

    // Convert unquoted JS object literal keys to JSON format
    // The config looks like: {key1:"val1",key2:"val2",nested:{...}}
    // We need to add quotes around keys for JSON.parse
    try {
      const jsonStr = rawConfig.replace(/([{,])\s*([a-zA-Z_$][\w$]*)\s*:/g, '$1"$2":');
      return JSON.parse(jsonStr);
    } catch (e) {
      // Fallback: extract key fields with regex
      const extract = (key) => {
        const re = new RegExp(key + ':"([^"]*)"');
        const m = html.match(re);
        return m ? m[1] : '';
      };
      return {
        nonce: extract('nonce'),
        sess: extract('sess'),
        cdnPic1: extract('cdnPic1'),
        cdnPic2: extract('cdnPic2'),
        vsig: extract('vsig'),
        websig: extract('websig'),
        spt: extract('spt'),
        subcapclass: extract('subcapclass'),
        ticket: extract('ticket'),
        randstr: extract('randstr'),
      };
    }
  }

  /**
   * GET /cap_union_new_getcapbysig — alternative endpoint that also returns
   * image URLs. Used during CAPTCHA retries when the server issues a new challenge.
   * Same response shape as getSig().
   *
   * @param {object} session — session data (needs sess, sid)
   * @param {object} sig — previous sig data (needs vsig, websig)
   * @returns {Promise<object>} — same shape as getSig() result
   */
  async getCapBySig(session, sig) {
    const cb = this._callbackName();
    const params = new URLSearchParams({
      aid: this.aid,
      protocol: 'https',
      accver: '1',
      showtype: 'popup',
      ua: Buffer.from(this.userAgent).toString('base64'),
      noheader: '1',
      fb: '1',
      aged: '0',
      enableDarkMode: '0',
      sid: session.sid || sig.sid,
      sess: session.sess || sig.sess,
      fwidth: '0',
      wxLang: '',
      tcScale: '1',
      uid: '',
      cap_cd: '',
      rnd: String(Math.floor(Math.random() * 1000000)),
      vsig: sig.vsig || '',
      websig: sig.websig || '',
      subcapclass: sig.subcapclass || '',
      callback: cb,
    });

    const url = `${BASE_URL}/cap_union_new_getcapbysig?${params.toString()}`;

    const resp = await httpRequest(url, {
      headers: this._headers(),
      timeout: this.timeout,
      cookieJar: this.cookieJar,
    });

    if (resp.statusCode !== 200) {
      throw new Error(`getCapBySig: HTTP ${resp.statusCode} — ${resp.body.slice(0, 200)}`);
    }

    const data = parseJSONP(resp.body);

    const bgUrl = this._resolveImageUrl(data.bg_url || data.cdnPic1 || data.bgurl || '');
    const sliceUrl = this._resolveImageUrl(data.slice_url || data.cdnPic2 || data.sliceurl || '');

    return {
      bgUrl,
      sliceUrl,
      vsig: data.vsig || sig.vsig || '',
      websig: data.websig || sig.websig || '',
      nonce: data.nonce || sig.nonce || '',
      spt: data.spt || sig.spt || '',
      subcapclass: data.subcapclass || sig.subcapclass || '',
      capclass: data.capclass || sig.capclass || '',
      sess: data.sess || session.sess,
      sid: data.sid || session.sid,
      _raw: data,
    };
  }

  /**
   * Resolve an image URL — prepend base URL if relative.
   * @param {string} url
   * @returns {string}
   */
  _resolveImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return BASE_URL + url;
    return BASE_URL + '/' + url;
  }

  // -----------------------------------------------------------------------
  // Step 3: downloadImages — fetch background + slider piece images
  // -----------------------------------------------------------------------

  /**
   * Download both challenge images as raw Buffers.
   *
   * @param {object} sig — result from getSig() or getCapBySig()
   * @returns {Promise<{bgBuffer: Buffer, sliceBuffer: Buffer}>}
   */
  async downloadImages(sig) {
    // Determine URLs — use explicit URLs from sig if available,
    // otherwise fall back to hycdn endpoint pattern
    let bgUrl = sig.bgUrl;
    let sliceUrl = sig.sliceUrl;

    if (!bgUrl || !sliceUrl) {
      // Fallback: construct hycdn URLs from session params
      const baseHycdn = `${BASE_URL}/hycdn`;
      const commonParams = new URLSearchParams({
        aid: this.aid,
        sess: sig.sess || '',
        sid: sig.sid || '',
      });
      bgUrl = bgUrl || `${baseHycdn}?${commonParams.toString()}&index=1&img_index=1`;
      sliceUrl = sliceUrl || `${baseHycdn}?${commonParams.toString()}&index=2&img_index=2`;
    }

    // Image request headers matching HAR (sec-fetch for same-origin image loads)
    const imgHeaders = this._headers({
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'same-origin',
      // Referer for image requests is the show page URL (HAR confirmed)
      'Referer': (sig.showUrl || `${BASE_URL}/cap_union_new_show`),
    });

    // Download both images in parallel
    const [bgResp, sliceResp] = await Promise.all([
      httpRequest(bgUrl, {
        headers: imgHeaders,
        timeout: this.timeout,
        cookieJar: this.cookieJar,
        binary: true,
      }),
      httpRequest(sliceUrl, {
        headers: imgHeaders,
        timeout: this.timeout,
        cookieJar: this.cookieJar,
        binary: true,
      }),
    ]);

    if (bgResp.statusCode !== 200) {
      throw new Error(`downloadImages: bg HTTP ${bgResp.statusCode}`);
    }
    if (sliceResp.statusCode !== 200) {
      throw new Error(`downloadImages: slice HTTP ${sliceResp.statusCode}`);
    }

    return {
      bgBuffer: bgResp.body,
      sliceBuffer: sliceResp.body,
    };
  }

  // -----------------------------------------------------------------------
  // downloadTdc — Fetch the session-specific TDC script
  // -----------------------------------------------------------------------

  /**
   * Download the session-specific TDC JavaScript from the URL embedded in the
   * show page config (dcFileName field). The server returns gzip-compressed JS
   * which httpRequest now decompresses automatically.
   *
   * The session TDC contains session-specific data baked into the script, and
   * registers under a randomized global name (e.g., window.GaSNWMbP...) instead
   * of window.TDC. The generateCollect function's TDC-finding logic handles this.
   *
   * @param {object} sig — result from getSig() (must have _raw.dcFileName)
   * @returns {Promise<string>} — decompressed JavaScript source
   */
  async downloadTdc(sig) {
    const dcFileName = sig._raw && sig._raw.dcFileName;
    if (!dcFileName) {
      throw new Error('downloadTdc: no dcFileName in sig._raw');
    }

    const tdcUrl = dcFileName.startsWith('http') ? dcFileName :
      `${BASE_URL}/${dcFileName.replace(/^\//, '')}`;

    const resp = await httpRequest(tdcUrl, {
      headers: this._headers({
        'Accept': '*/*',
        'Sec-Fetch-Dest': 'script',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'same-origin',
        'Referer': (this._lastShowUrl || `${BASE_URL}/cap_union_new_show`),
      }),
      timeout: this.timeout,
      cookieJar: this.cookieJar,
    });

    if (resp.statusCode !== 200) {
      throw new Error(`downloadTdc: HTTP ${resp.statusCode} — ${resp.body.slice(0, 200)}`);
    }

    // httpRequest handles gzip decompression, so body is already a string
    const source = typeof resp.body === 'string' ? resp.body : resp.body.toString('utf8');

    if (!source || source.length < 1000) {
      throw new Error(`downloadTdc: response too short (${source.length} chars)`);
    }

    return source;
  }

  // -----------------------------------------------------------------------
  // Step 4: verify — Submit the CAPTCHA answer
  // -----------------------------------------------------------------------

  /**
   * POST /cap_union_new_verify — submit the CAPTCHA solution.
   *
   * @param {object} params
   * @param {object} params.session — from prehandle()
   * @param {object} params.sig — from getSig()
   * @param {string} params.ans — slide answer, e.g. "464,158;"
   * @param {string} params.collect — encrypted fingerprint token (base64)
   * @param {string} params.eks — encrypted key schedule (base64)
   * @param {number|string} params.tlg — token length (collect.length)
   * @param {string} [params.prebuiltBody] — jQuery-serialized POST body from
   *   generateVData (Task 10.5.3). When provided, verify() uses this exact body
   *   + vData instead of building its own, ensuring byte-identical encoding.
   * @param {string} [params.vData] — ChaosVM token from vm-slide.enc.js (Task 10.5.2)
   * @param {object} [params.extra] — additional POST fields to override/add
   * @returns {Promise<{errorCode: number, ticket: string, randstr: string, _raw: object}>}
   */
  async verify(params) {
    const { session, sig, ans, collect, eks, tlg, vData, prebuiltBody } = params;
    const extra = params.extra || {};

    // Decode URI-encoded collect if needed.
    // tcaptcha-slide.js does: e[_.collectdata] = decodeURIComponent(C())
    // where C() = TDC.getData(). Local TDC returns URI-encoded strings
    // (with %2B, %2F etc.) that must be decoded before jQuery re-encodes them.
    let collectVal = collect || '';
    if (collectVal.includes('%')) {
      try { collectVal = decodeURIComponent(collectVal); } catch (e) { /* leave as-is */ }
    }

    // Build the POST body to match tcaptcha-slide.js verify construction.
    //
    // CRITICAL (Task 10.5.3): Field order must EXACTLY match the real browser.
    // The real browser's queryMap() reads iframe URL params in their original order.
    // Since vData is computed over the POST body string, wrong field order →
    // vData mismatch → errorCode 9.
    //
    // Real flow (from tcaptcha-slide.29a33140.js):
    //   1. d = a.queryMap()          — ALL iframe URL params as base (positions 1-25)
    //   2. cdata = l.challenge()     — PoW challenge result (0 when capChallenge empty)
    //   3. TDC.setData({trycnt, refreshcnt, slideValue, dragobj})
    //   4. d.ans, d.vsig, d.websig, d.subcapclass, d.pow_answer, d.pow_calc_time
    //   5. d[collectdata] = decodeURIComponent(TDC.getData())
    //   6. d.fpinfo, d.eks, d.nonce
    //
    // Field order verified from HAR capture (show page URL → verify POST body).
    const postFields = {
      // ── PHASE 1: queryMap base (25 fields, show page URL param order) ──
      /*  1 */ aid: this.aid,
      /*  2 */ protocol: 'https',
      /*  3 */ accver: '1',
      /*  4 */ showtype: 'popup',
      /*  5 */ ua: Buffer.from(this.userAgent).toString('base64'),
      /*  6 */ noheader: '1',
      /*  7 */ fb: '1',
      /*  8 */ aged: '0',
      /*  9 */ enableAged: '0',
      /* 10 */ enableDarkMode: '0',
      /* 11 */ grayscale: '1',
      /* 12 */ dyeid: '0',
      /* 13 */ clientype: '2',
      // The queryMap module in tcaptcha-slide.js starts with iframe URL params
      // but then OVERRIDES sess with captchaConfig.sess (the show page sess).
      // See: `window.captchaConfig&&window.captchaConfig.sess&&s(window.captchaConfig.sess)`
      /* 14 */ sess: sig.sess || session.sess || '',
      /* 15 */ fwidth: '0',
      /* 16 */ sid: session.sid || sig.sid || '',
      /* 17 */ wxLang: '',
      /* 18 */ tcScale: '1',
      /* 19 */ uid: '',
      /* 20 */ cap_cd: '',
      /* 21 */ rnd: String(Math.floor(Math.random() * 1000000)),
      /* 22 */ prehandleLoadTime: String(Math.floor(Math.random() * 200 + 100)),
      /* 23 */ createIframeStart: String(Date.now() - Math.floor(Math.random() * 5000 + 2000)),
      /* 24 */ global: '0',
      /* 25 */ subsid: this._showSubsid || '1',
      // ── PHASE 2: verify-specific fields (13 fields) ──
      /* 26 */ cdata: extra.cdata !== undefined ? extra.cdata : '0',
      /* 27 */ ans: ans,
      /* 28 */ vsig: sig.vsig || '',
      /* 29 */ websig: sig.websig || '',
      /* 30 */ subcapclass: sig.subcapclass || '',
      // PoW fields — when powCfg.md5/prefix are "", PoW solver returns {ans: null, duration: 0}
      // jQuery serializes null as empty string.
      /* 31 */ pow_answer: extra.pow_answer !== undefined ? extra.pow_answer : '',
      /* 32 */ pow_calc_time: extra.pow_calc_time !== undefined ? extra.pow_calc_time : '0',
      // collect via decodeURIComponent(TDC.getData())
      /* 33 */ collect: collectVal,
      /* 34 */ tlg: String(tlg || collectVal.length),
      /* 35 */ fpinfo: extra.fpinfo || '',
      /* 36 */ eks: eks || '',
      /* 37 */ nonce: sig.nonce || '',
      /* 38 */ vlg: '0_0_1',
      // Apply any caller-provided overrides (rnd, prehandleLoadTime, createIframeStart
      // are passed via extra to ensure vData consistency)
      ...extra,
    };

    // ── Build final POST body ──
    // CRITICAL (Task 10.5.3): When prebuiltBody is provided (from generateVData),
    // use it directly. This jQuery-serialized body is byte-identical to what vData
    // was computed over. jQuery's $.param() encodes differently than
    // encodeURIComponent() (e.g., `=` in base64 → not encoded vs `%3D`), so using
    // the prebuilt body ensures vData validates on the server.
    let body;
    if (prebuiltBody) {
      // Use the jQuery-serialized body + append vData
      body = vData
        ? prebuiltBody + '&vData=' + encodeURIComponent(vData)
        : prebuiltBody;
    } else {
      // Fallback: manual encoding (for backward compat / when vData not needed)
      if (vData) {
        postFields.vData = vData;
      }
      body = Object.entries(postFields)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    }

    // Diagnostic (Task 10.5.3): log verify POST details
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`  [verify] using ${prebuiltBody ? 'jQuery prebuilt' : 'manual'} body, length: ${body.length}\n`);
      process.stderr.write(`  [verify] Referer: ${((sig && sig.showUrl) || 'none').slice(0, 80)}...\n`);
    }

    const url = `${BASE_URL}/cap_union_new_verify`;

    const verifyHeaders = this._headers({
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': String(Buffer.byteLength(body)),
      'Origin': 'https://t.captcha.qq.com',
      // Referer should be the full show page URL with all params (HAR analysis:
      // real browser sends the complete 800+ char URL, not just the base path)
      'Referer': (sig && sig.showUrl) || `${BASE_URL}/cap_union_new_show`,
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      // jQuery AJAX adds this header by default — server may check for it
      'X-Requested-With': 'XMLHttpRequest',
      // Sec-Fetch headers for verify POST (Category 3 — HAR confirmed)
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    });

    const resp = await httpRequest(url, {
      method: 'POST',
      headers: verifyHeaders,
      body: body,
      timeout: this.timeout,
      cookieJar: this.cookieJar,
    });

    if (resp.statusCode !== 200) {
      throw new Error(`verify: HTTP ${resp.statusCode} — ${resp.body.slice(0, 200)}`);
    }

    const data = parseJSONP(resp.body);

    return {
      errorCode: typeof data.errorCode === 'number' ? data.errorCode : parseInt(data.errorCode, 10) || -1,
      ticket: data.ticket || '',
      randstr: data.randstr || '',
      _raw: data,
    };
  }

  // -----------------------------------------------------------------------
  // Utility methods
  // -----------------------------------------------------------------------

  /**
   * Reset the cookie jar (useful between full solve cycles).
   */
  resetCookies() {
    this.cookieJar.clear();
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  CaptchaClient,
  CookieJar,
  parseJSONP,
  httpRequest,

  // Re-export constants for testing
  BASE_URL,
  DEFAULT_TIMEOUT,
  DEFAULT_USER_AGENT,
};
