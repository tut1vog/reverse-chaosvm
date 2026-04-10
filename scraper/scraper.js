'use strict';

/**
 * scraper.js — Main Scraper Orchestrator
 *
 * Wires together CaptchaClient, slide-solver, collect-generator, vdata-generator,
 * template-cache, and tdc-utils into a complete headless CAPTCHA-solving and
 * URL security checking flow.
 *
 * Usage:
 *   const Scraper = require('./scraper/scraper');
 *   const s = new Scraper({ verbose: true });
 *   await s.init();
 *   const result = await s.solve('https://example.com');
 */

const fs = require('fs');
const path = require('path');

const { CaptchaClient, httpRequest, parseJSONP } = require('../puppeteer/captcha-client');
const { solveSlider } = require('../puppeteer/slide-solver');
const { generateCollect } = require('./collect-generator');
const { generateVData, parseVmSlideUrl } = require('./vdata-generator');
const { extractTdcName, extractEks } = require('./tdc-utils');
const TemplateCache = require('./template-cache');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const DEFAULT_AID = '2090803262';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

class Scraper {
  /**
   * @param {Object} [config]
   * @param {string} [config.aid='2090803262'] - App ID for urlsec.qq.com
   * @param {string} [config.userAgent] - User-Agent string
   * @param {Object} [config.profile] - Browser fingerprint profile (default: profiles/default.json)
   * @param {number} [config.slideRatio=0.5] - Slide image ratio (may need tuning)
   * @param {number} [config.calibration=-25] - Slide calibration offset
   * @param {number} [config.slideY=45] - Default Y coordinate for slide answer
   * @param {number} [config.maxRetries=3] - Max CAPTCHA solve attempts
   * @param {boolean} [config.verbose=false] - Log progress to stderr
   */
  constructor(config) {
    const cfg = config || {};
    this.aid = cfg.aid || DEFAULT_AID;
    this.userAgent = cfg.userAgent || DEFAULT_USER_AGENT;
    this.profile = cfg.profile || null;
    this.slideRatio = cfg.slideRatio !== undefined ? cfg.slideRatio : 0.5;
    this.calibration = cfg.calibration !== undefined ? cfg.calibration : -25;
    this.slideY = cfg.slideY !== undefined ? cfg.slideY : 45;
    this.maxRetries = cfg.maxRetries !== undefined ? cfg.maxRetries : 3;
    this.verbose = !!cfg.verbose;

    /** @type {TemplateCache|null} */
    this._templateCache = null;

    /** @type {string|null} Cached jQuery source */
    this._jquerySource = null;

    /** @type {string|null} Cached vm-slide source */
    this._vmSlideSource = null;

    /** @type {CaptchaClient|null} */
    this._client = null;
  }

  /**
   * Log a message to stderr when verbose mode is enabled.
   * @param {string} msg
   */
  _log(msg) {
    if (this.verbose) {
      process.stderr.write(`[scraper] ${msg}\n`);
    }
  }

  /**
   * Initialize the scraper: load template cache, default profile, jQuery source.
   * Must be called before solveCaptcha() or solve().
   */
  async init() {
    // Load template cache from disk and seed from pipeline outputs
    this._templateCache = new TemplateCache();
    this._templateCache.load();
    this._templateCache.seed();
    this._log('Template cache loaded and seeded');

    // Load default profile if none provided
    if (!this.profile) {
      const profilePath = path.join(PROJECT_ROOT, 'profiles', 'default.json');
      this.profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      this._log('Default profile loaded');
    }

    // Load jQuery source from sample (production would fetch from show page)
    const jqueryPath = path.join(PROJECT_ROOT, 'sample', 'slide-jy.js');
    if (fs.existsSync(jqueryPath)) {
      this._jquerySource = fs.readFileSync(jqueryPath, 'utf8');
      this._log(`jQuery source loaded (${this._jquerySource.length} chars)`);
    } else {
      this._log('WARNING: sample/slide-jy.js not found — vData generation will fail');
    }

    // Load vm-slide fallback source
    const vmSlidePath = path.join(PROJECT_ROOT, 'sample', 'vm_slide.js');
    if (fs.existsSync(vmSlidePath)) {
      this._vmSlideSource = fs.readFileSync(vmSlidePath, 'utf8');
      this._log(`vm-slide fallback loaded (${this._vmSlideSource.length} chars)`);
    }

    this._log('Init complete');
  }

  /**
   * Create a fresh CaptchaClient instance for a new session.
   * @returns {CaptchaClient}
   */
  _createClient() {
    return new CaptchaClient({
      aid: this.aid,
      userAgent: this.userAgent,
    });
  }

  /**
   * Build the 38 verify POST fields matching captcha-client.js verify() exactly.
   *
   * @param {Object} client - CaptchaClient instance
   * @param {Object} session - From prehandle()
   * @param {Object} sig - From getSig()
   * @param {string} ans - Slide answer string
   * @param {string} collectVal - Decoded collect token
   * @param {string} eks - eks token
   * @returns {Object} POST field object
   */
  _buildPostFields(client, session, sig, ans, collectVal, eks) {
    return {
      // Phase 1: queryMap base (25 fields, show page URL param order)
      aid: this.aid,
      protocol: 'https',
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
      clientype: '2',
      sess: sig.sess || session.sess || '',
      fwidth: '0',
      sid: session.sid || sig.sid || '',
      wxLang: '',
      tcScale: '1',
      uid: '',
      cap_cd: '',
      rnd: String(Math.floor(Math.random() * 1000000)),
      prehandleLoadTime: String(Math.floor(Math.random() * 200 + 100)),
      createIframeStart: String(Date.now() - Math.floor(Math.random() * 5000 + 2000)),
      global: '0',
      subsid: sig.showSubsid || client._showSubsid || '1',
      // Phase 2: verify-specific fields (13 fields)
      cdata: '0',
      ans: ans,
      vsig: sig.vsig || '',
      websig: sig.websig || '',
      subcapclass: sig.subcapclass || '',
      pow_answer: '',
      pow_calc_time: '0',
      collect: collectVal,
      tlg: String(collectVal.length),
      fpinfo: '',
      eks: eks || '',
      nonce: sig.nonce || '',
      vlg: '0_0_1',
    };
  }

  /**
   * Try to fetch vm-slide source from the show page config.
   * Falls back to the cached sample/vm_slide.js.
   *
   * @param {Object} sig - From getSig() (may have _raw with script URLs)
   * @returns {Promise<string>} vm-slide source code
   */
  async _getVmSlideSource(sig) {
    // Try to find vm-slide URL in sig._raw
    if (sig._raw) {
      // Check for dcFileName-like fields for vm-slide
      const candidates = ['vmSlide', 'vm_slide', 'vmSlideFileName'];
      for (const field of candidates) {
        if (sig._raw[field]) {
          try {
            const url = sig._raw[field].startsWith('http')
              ? sig._raw[field]
              : `https://t.captcha.qq.com/${sig._raw[field].replace(/^\//, '')}`;
            this._log(`Fetching vm-slide from ${url}`);
            const resp = await httpRequest(url, { timeout: 10000 });
            if (resp.statusCode === 200 && resp.body.length > 100) {
              return resp.body;
            }
          } catch (err) {
            this._log(`Failed to fetch vm-slide from ${field}: ${err.message}`);
          }
        }
      }
    }

    // Fallback to cached source
    if (this._vmSlideSource) {
      this._log('Using cached vm-slide source');
      return this._vmSlideSource;
    }

    throw new Error('No vm-slide source available');
  }

  /**
   * Solve one CAPTCHA challenge.
   *
   * @returns {Promise<{ticket: string, randstr: string, errorCode: number}>}
   */
  async solveCaptcha() {
    if (!this._templateCache) {
      throw new Error('Scraper not initialized — call init() first');
    }

    const client = this._createClient();
    this._client = client;
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this._log(`Attempt ${attempt}/${this.maxRetries}`);

        // (a) prehandle — get session
        this._log('Step 1: prehandle');
        const session = await client.prehandle();
        this._log(`  sess: ${session.sess.slice(0, 20)}...`);

        // (b) getSig — get image URLs and nonce
        this._log('Step 2: getSig');
        const sig = await client.getSig(session);
        this._log(`  nonce: ${sig.nonce}`);

        // (c) downloadImages
        this._log('Step 3: downloadImages');
        const { bgBuffer, sliceBuffer } = await client.downloadImages(sig);
        this._log(`  bg: ${bgBuffer.length} bytes, slice: ${sliceBuffer.length} bytes`);

        // (d) downloadTdc
        this._log('Step 4: downloadTdc');
        const tdcSource = await client.downloadTdc(sig);
        this._log(`  tdc source: ${tdcSource.length} chars`);

        // (e) Extract TDC_NAME and look up template cache
        const tdcName = extractTdcName(tdcSource);
        if (!tdcName) {
          throw new Error('Could not extract TDC_NAME from tdc.js source');
        }
        this._log(`  TDC_NAME: ${tdcName}`);

        const cached = this._templateCache.lookup(tdcName);
        if (!cached) {
          throw new Error(`Unknown template ${tdcName}, run pipeline to port it`);
        }
        this._log(`  Template: ${cached.template}, opcodes: ${cached.caseCount}`);

        const xteaParams = {
          key: cached.key,
          delta: cached.delta,
          rounds: cached.rounds,
          keyModConstants: cached.keyModConstants,
        };

        // (f) Extract eks from tdc.js source
        const eks = extractEks(tdcSource);
        if (!eks) {
          this._log('WARNING: Could not extract eks from tdc.js source');
        }
        this._log(`  eks: ${eks ? eks.slice(0, 20) + '...' : 'null'}`);

        // (g) Solve slider
        this._log('Step 5: solveSlider');
        const rawOffset = await solveSlider(bgBuffer, sliceBuffer);
        this._log(`  rawOffset: ${rawOffset}`);

        // (h) Compute answer with ratio and calibration
        const calibration = this.calibration + Math.floor(Math.random() * 11) - 5;
        const xAnswer = Math.round(rawOffset * this.slideRatio + calibration);
        const ans = `${xAnswer},${this.slideY};`;
        this._log(`  ans: ${ans}`);

        // (i) Generate collect token
        this._log('Step 6: generateCollect');
        const collectEncoded = generateCollect(this.profile, xteaParams, {
          appid: this.aid,
          nonce: sig.nonce,
        });
        // Decode URI-encoded collect for the POST fields (captcha-client does this too)
        let collectVal = collectEncoded;
        if (collectVal.includes('%')) {
          try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* leave as-is */ }
        }
        this._log(`  collect length: ${collectVal.length}`);

        // (j) Get jQuery source
        if (!this._jquerySource) {
          const jqueryPath = path.join(PROJECT_ROOT, 'sample', 'slide-jy.js');
          this._jquerySource = fs.readFileSync(jqueryPath, 'utf8');
        }

        // (k) Get vm-slide source
        const vmSlideSource = await this._getVmSlideSource(sig);

        // (l) Build the 38 verify POST fields
        const postFields = this._buildPostFields(client, session, sig, ans, collectVal, eks);

        // (m) Generate vData
        this._log('Step 7: generateVData');
        const { vData, serializedBody } = generateVData(
          postFields,
          vmSlideSource,
          this._jquerySource,
          { userAgent: this.userAgent }
        );
        this._log(`  vData: ${vData.slice(0, 30)}...`);

        // (n) Submit verify
        this._log('Step 8: verify');
        const result = await client.verify({
          session,
          sig,
          ans,
          collect: collectEncoded,
          eks: eks || '',
          tlg: collectVal.length,
          vData,
          prebuiltBody: serializedBody,
        });

        this._log(`  errorCode: ${result.errorCode}, ticket: ${result.ticket ? result.ticket.slice(0, 30) + '...' : 'none'}`);

        if (result.errorCode === 0) {
          return {
            errorCode: result.errorCode,
            ticket: result.ticket,
            randstr: result.randstr,
          };
        }

        // Non-zero errorCode — retry with fresh session
        this._log(`  Failed with errorCode ${result.errorCode}, retrying...`);
        lastError = new Error(`CAPTCHA verify returned errorCode ${result.errorCode}`);
        client.resetCookies();

      } catch (err) {
        this._log(`  Error: ${err.message}`);
        lastError = err;
        client.resetCookies();
      }
    }

    throw lastError || new Error('solveCaptcha: max retries exceeded');
  }

  /**
   * Submit a CAPTCHA ticket to urlsec.qq.com to check a URL's security status.
   *
   * @param {string} targetUrl - URL to check
   * @param {string} ticket - CAPTCHA ticket from solveCaptcha()
   * @param {string} randstr - Random string from solveCaptcha()
   * @returns {Promise<Object>} URL security results
   */
  async queryUrlSec(targetUrl, ticket, randstr) {
    const jqueryCallback = 'jQuery_' + Math.random().toString(36).slice(2, 12);
    const timestamp = Date.now();

    const params = new URLSearchParams({
      m: 'check',
      a: 'gw_check',
      callback: jqueryCallback,
      url: targetUrl,
      ticket: ticket,
      randstr: randstr,
      _: String(timestamp),
    });

    const url = `https://cgi.urlsec.qq.com/index.php?${params.toString()}`;
    this._log(`queryUrlSec: ${url.slice(0, 80)}...`);

    const resp = await httpRequest(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': '*/*',
        'Referer': 'https://urlsec.qq.com/',
      },
      timeout: 10000,
    });

    if (resp.statusCode !== 200) {
      throw new Error(`queryUrlSec: HTTP ${resp.statusCode}`);
    }

    // Parse JSONP response: jqueryCallback({...})
    const body = resp.body;
    const lparen = body.indexOf('(');
    const rparen = body.lastIndexOf(')');
    if (lparen === -1 || rparen === -1) {
      throw new Error(`queryUrlSec: invalid JSONP response: ${body.slice(0, 200)}`);
    }
    const data = JSON.parse(body.slice(lparen + 1, rparen));

    this._log(`queryUrlSec: response received`);

    if (data.data && data.data.results) {
      return data.data.results;
    }

    return data;
  }

  /**
   * Complete end-to-end flow: solve CAPTCHA and check URL security.
   *
   * @param {string} targetUrl - URL to check
   * @returns {Promise<Object>} URL security results
   */
  async solve(targetUrl) {
    this._log(`solve: checking ${targetUrl}`);

    if (!this._templateCache) {
      await this.init();
    }

    // Step 1: Solve CAPTCHA
    const { ticket, randstr } = await this.solveCaptcha();
    this._log(`solve: got ticket ${ticket.slice(0, 30)}...`);

    // Step 2: Query URL security
    const results = await this.queryUrlSec(targetUrl, ticket, randstr);
    this._log('solve: complete');

    return results;
  }
}

module.exports = Scraper;
