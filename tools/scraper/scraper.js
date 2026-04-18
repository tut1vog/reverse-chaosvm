'use strict';

/**
 * scraper.js — Main Scraper Orchestrator
 *
 * Wires together CaptchaClient, slide-solver, collect-generator, vdata-harness,
 * template-cache, and tdc-utils into a complete headless CAPTCHA-solving and
 * URL security checking flow.
 *
 * Usage:
 *   const Scraper = require('./tools/scraper/scraper');
 *   const s = new Scraper({ verbose: true });
 *   await s.init();
 *   const result = await s.solve('https://example.com');
 */

const fs = require('fs');
const path = require('path');

const { CaptchaClient, httpRequest, parseJSONP } = require('../captcha-solver/captcha-client');
const { AuditLogger } = require('./audit-logger');
const { solveSlider } = require('../captcha-solver/slide-solver');
const { generateCollect, generateBehavioralEvents, buildSlideSd, reorderCdArray } = require('./collect-generator');
const { generateVData, parseVmSlideUrl } = require('./vdata-harness');
const { buildVDataForPost } = require('../vdata-generator/for-post');
const { extractTdcName, extractEks, computeSourceHash } = require('./tdc-utils');
const TemplateCache = require('./template-cache');
const { buildPreVerifyBeaconUrl, buildPostVerifyBeaconUrl, fireBeacon } = require('./caplog-beacon');
const { execFile } = require('child_process');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_VDATA_PROFILE_PATH = path.join(
  PROJECT_ROOT,
  'profiles',
  'vdata-browser-default.json'
);
const DEFAULT_CHROME_PROFILE_PATH = path.join(
  PROJECT_ROOT,
  'profiles',
  'chrome-fingerprint.json'
);

/**
 * Load a vData browser-fingerprint profile from an absolute path.
 * @param {string} absolutePath
 * @returns {Object}
 */
function loadProfile(absolutePath) {
  const raw = fs.readFileSync(absolutePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Serialize a flat POST-fields object into a raw `key=value&...` string with
 * NO percent-encoding.  This matches the real browser behaviour: the
 * orchestrator (`t_captcha_slide.js`) builds the verify POST body via plain
 * string concatenation, so base64 characters (`+`, `/`, `=`) are never
 * encoded.  URLSearchParams would turn `+` → `%2B` etc., which causes
 * errorCode -1 on the verify endpoint.
 * @param {Object} fields
 * @returns {string}
 */
function serializePostFields(fields) {
  const parts = [];
  for (const name of Object.keys(fields)) {
    const value = fields[name];
    parts.push(name + '=' + (value == null ? '' : String(value)));
  }
  return parts.join('&');
}

const DEFAULT_AID = '2046626881';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

class Scraper {
  /**
   * @param {Object} [config]
   * @param {string} [config.aid='2046626881'] - App ID for urlsec.qq.com CAPTCHA
   * @param {string} [config.referer='https://urlsec.qq.com/'] - Referer header (must match iframe origin)
   * @param {string} [config.userAgent] - User-Agent string
   * @param {Object} [config.profile] - Browser fingerprint profile (default: profiles/default.json)
   * @param {number} [config.maxRetries=3] - Max CAPTCHA solve attempts
   * @param {boolean} [config.verbose=false] - Log progress to stderr
   */
  constructor(config) {
    const cfg = config || {};
    this.aid = cfg.aid || DEFAULT_AID;
    this.referer = cfg.referer || 'https://urlsec.qq.com/';
    this.userAgent = cfg.userAgent || DEFAULT_USER_AGENT;
    this.profile = cfg.profile || null;
    // Phase 47.1: Chrome fingerprint profile for realistic collect tokens.
    // Default on; --no-chrome-profile falls back to synthetic buildDefaultCdArray.
    this.chromeProfile = cfg.chromeProfile !== false;
    this._chromeProfileData = null;
    this.maxRetries = cfg.maxRetries !== undefined ? cfg.maxRetries : 3;
    this.verbose = !!cfg.verbose;

    // Phase 45.4: vData source selection. Default path is the Phase 45.2
    // standalone buildVDataForPost (browser-like profile). --legacy-vdata
    // keeps the jsdom harness path alive for Phase 45.6 A/B comparison.
    this.legacyVdata = !!cfg.legacyVdata;
    // Phase 46.4: /caplog telemetry beacons. Default on; --skip-caplog disables.
    this.skipCaplog = cfg.skipCaplog === true;
    this.vdataProfilePath = cfg.vdataProfile || DEFAULT_VDATA_PROFILE_PATH;
    this._vdataProfile = null;

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
   * Auto-port an unknown TDC template by running the porting pipeline as a
   * child process.  Writes tdcSource to a temp file, invokes
   * `node tools/porting-pipeline/run.js <tempfile> --skip-verify`, reads the resulting
   * pipeline-config.json, and stores the extracted params in the template cache.
   *
   * @param {string} sourceHash - SHA-256 source hash (cache key)
   * @param {string} tdcSource - Full tdc.js source code
   * @returns {Promise<Object|null>} Cached template entry, or null on failure
   */
  async _autoPort(sourceHash, tdcSource) {
    this._log('Auto-porting unknown template: ' + sourceHash);

    const tempFile = path.join(os.tmpdir(), 'tdc-autoport-' + sourceHash + '.js');

    try {
      // (a) Write tdc source to temp file
      fs.writeFileSync(tempFile, tdcSource, 'utf8');

      // (b) Run pipeline as child process
      const { stdout, stderr } = await new Promise((resolve, reject) => {
        execFile(
          process.execPath,
          [path.join(PROJECT_ROOT, 'tools', 'porting-pipeline', 'run.js'), tempFile, '--skip-verify'],
          { cwd: PROJECT_ROOT, timeout: 120000 },
          (err, stdout, stderr) => {
            if (err) {
              reject(err);
            } else {
              resolve({ stdout, stderr });
            }
          }
        );
      });

      if (this.verbose && stdout) {
        for (const line of stdout.split('\n')) {
          if (line.trim()) this._log('  pipeline: ' + line.trim());
        }
      }

      // (c) Read pipeline-config.json
      const stem = path.basename(tempFile, '.js');
      const configPath = path.join(PROJECT_ROOT, 'output', stem, 'pipeline-config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      // (d) Build cache entry from pipeline output
      const params = {
        template: config.template,
        key: config.xteaParams.key,
        delta: config.xteaParams.delta,
        rounds: config.xteaParams.rounds,
        keyModConstants: config.xteaParams.keyModConstants,
        keyMods: config.xteaParams.keyMods,
        caseCount: config.caseCount,
      };

      // Add structure params if available
      if (config.structureParams) {
        if (config.structureParams.fieldOrder) {
          params.cdFieldOrder = config.structureParams.fieldOrder;
          params.fieldOrder = config.structureParams.fieldOrder;
        }
        if (config.structureParams.hashPosition !== undefined) {
          params.hashPosition = config.structureParams.hashPosition;
        }
        if (config.structureParams.serializationDiffs) {
          params.serializationDiffs = config.structureParams.serializationDiffs;
        }
        if (config.structureParams.headerSplit) {
          params.headerSplit = config.structureParams.headerSplit;
        }
      }

      // (e) Store in cache and return normalized entry
      this._templateCache.store(sourceHash, params);
      this._log('Auto-port succeeded for ' + sourceHash + ' (template ' + config.template + ')');
      return this._templateCache.lookup(sourceHash);

    } catch (err) {
      const msg = err.stderr || err.message || String(err);
      this._log('Auto-port failed for ' + sourceHash + ': ' + msg);
      return null;

    } finally {
      try {
        fs.unlinkSync(tempFile);
      } catch (_) {
        // Ignore — file may already be removed
      }
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

    // Load vData browser profile for the default (non-legacy) path.
    if (!this.legacyVdata) {
      try {
        this._vdataProfile = loadProfile(this.vdataProfilePath);
        this._log(`vData profile loaded from ${this.vdataProfilePath}`);
      } catch (err) {
        throw new Error(
          `Failed to load vData profile from ${this.vdataProfilePath}: ${err.message}`
        );
      }
    } else {
      this._log('Legacy vData path enabled (jsdom harness)');
    }

    // Load Chrome fingerprint profile for collect token generation
    if (this.chromeProfile) {
      try {
        this._chromeProfileData = JSON.parse(
          fs.readFileSync(DEFAULT_CHROME_PROFILE_PATH, 'utf8')
        );
        if (!this._chromeProfileData.cdCanonical || !Array.isArray(this._chromeProfileData.cdCanonical)) {
          throw new Error('Missing cdCanonical array in chrome-fingerprint.json');
        }
        this._log('Chrome fingerprint profile loaded (' + this._chromeProfileData.cdCanonical.length + ' canonical fields)');
      } catch (err) {
        this._log('WARNING: Failed to load Chrome profile, falling back to synthetic: ' + err.message);
        this.chromeProfile = false;
        this._chromeProfileData = null;
      }
    }

    this._log('Init complete');
  }

  /**
   * Create a fresh CaptchaClient instance for a new session.
   * @param {Object} [opts]
   * @param {Object} [opts.auditLogger] — AuditLogger instance for request-level logging
   * @returns {CaptchaClient}
   */
  _createClient(opts) {
    const o = opts || {};
    return new CaptchaClient({
      aid: this.aid,
      referer: this.referer,
      userAgent: this.userAgent,
      auditLogger: o.auditLogger || null,
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
      subcapclass: '',
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
   * @param {Object} [opts]
   * @param {Object} [opts.auditLogger] - AuditLogger instance
   * @returns {Promise<string>} vm-slide source code
   */
  async _getVmSlideSource(sig, opts) {
    const auditOpts = opts || {};
    // Strategy 1: Try to find vm-slide URL in sig._raw config fields
    if (sig._raw) {
      const candidates = ['vmSlide', 'vm_slide', 'vmSlideFileName'];
      for (const field of candidates) {
        if (sig._raw[field]) {
          try {
            const url = sig._raw[field].startsWith('http')
              ? sig._raw[field]
              : `https://t.captcha.qq.com/${sig._raw[field].replace(/^\//, '')}`;
            this._log(`Fetching vm-slide from config field '${field}': ${url}`);
            const resp = await httpRequest(url, {
              timeout: 10000,
              headers: {
                'User-Agent': this.userAgent,
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': sig.showUrl || this._lastShowUrl || 'https://t.captcha.qq.com/',
                'Sec-Fetch-Dest': 'script',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'same-origin',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
              },
              auditLogger: auditOpts.auditLogger || null,
              auditStep: 'vm-slide',
            });
            if (resp.statusCode === 200 && resp.body.length > 100) {
              this._log(`  Got live vm-slide (${resp.body.length} chars)`);
              return resp.body;
            }
          } catch (err) {
            this._log(`  Failed to fetch vm-slide from ${field}: ${err.message}`);
          }
        }
      }
    }

    // Strategy 2: Parse vm-slide URL from show page HTML (if available)
    if (sig._html) {
      const vmSlideUrl = parseVmSlideUrl(sig._html);
      if (vmSlideUrl) {
        try {
          const fullUrl = vmSlideUrl.startsWith('http')
            ? vmSlideUrl
            : `https://t.captcha.qq.com/${vmSlideUrl.replace(/^\//, '')}`;
          this._log(`Fetching vm-slide from show page HTML: ${fullUrl}`);
          const resp = await httpRequest(fullUrl, {
            timeout: 10000,
            headers: {
              'User-Agent': this.userAgent,
              'Accept': '*/*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br, zstd',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
              'Referer': sig.showUrl || this._lastShowUrl || 'https://t.captcha.qq.com/',
              'Sec-Fetch-Dest': 'script',
              'Sec-Fetch-Mode': 'no-cors',
              'Sec-Fetch-Site': 'same-origin',
              'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"Windows"',
            },
            auditLogger: auditOpts.auditLogger || null,
            auditStep: 'vm-slide',
          });
          if (resp.statusCode === 200 && resp.body.length > 100) {
            this._log(`  Got live vm-slide (${resp.body.length} chars)`);
            return resp.body;
          }
        } catch (err) {
          this._log(`  Failed to fetch vm-slide from HTML: ${err.message}`);
        }
      }
    }

    // Strategy 3: Fetch the show page directly and parse vm-slide URL from it
    if (sig.showUrl) {
      try {
        this._log(`Fetching show page to find vm-slide URL: ${sig.showUrl.slice(0, 80)}...`);
        const showResp = await httpRequest(sig.showUrl, { timeout: 10000, auditLogger: auditOpts.auditLogger || null, auditStep: 'show-refetch' });
        if (showResp.statusCode === 200 && showResp.body.length > 100) {
          const vmSlideUrl = parseVmSlideUrl(showResp.body);
          if (vmSlideUrl) {
            const fullUrl = vmSlideUrl.startsWith('http')
              ? vmSlideUrl
              : `https://t.captcha.qq.com/${vmSlideUrl.replace(/^\//, '')}`;
            this._log(`  Found vm-slide URL in show page: ${fullUrl}`);
            const vmResp = await httpRequest(fullUrl, {
              timeout: 10000,
              headers: {
                'User-Agent': this.userAgent,
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': sig.showUrl || this._lastShowUrl || 'https://t.captcha.qq.com/',
                'Sec-Fetch-Dest': 'script',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'same-origin',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
              },
              auditLogger: auditOpts.auditLogger || null,
              auditStep: 'vm-slide',
            });
            if (vmResp.statusCode === 200 && vmResp.body.length > 100) {
              this._log(`  Got live vm-slide (${vmResp.body.length} chars)`);
              return vmResp.body;
            }
          } else {
            this._log('  No vm-slide URL found in show page HTML');
          }
        }
      } catch (err) {
        this._log(`  Failed to fetch show page for vm-slide: ${err.message}`);
      }
    }

    // Strategy 4: Fallback to cached source
    if (this._vmSlideSource) {
      this._log('Using cached vm-slide fallback (sample/vm_slide.js)');
      return this._vmSlideSource;
    }

    throw new Error('No vm-slide source available');
  }

  /**
   * Build a collect token from the Chrome fingerprint profile.
   *
   * Loads the 59-field canonical cd array from chrome-fingerprint.json,
   * substitutes per-session fields (timestamps, pageUrl), reorders for
   * the live template's cdFieldOrder, and passes via cdArrayOverride
   * so buildDefaultCdArray is bypassed entirely.
   *
   * @param {Object} xteaParams - XTEA parameters for the live template
   * @param {Object} cached - Template cache entry (has cdFieldOrder, etc.)
   * @param {Object} sig - From getSig() (has showUrl, nonce)
   * @param {Object} slideSd - Slide sd object
   * @param {Array} behavioralEvents - 8-element event tuples
   * @param {number} now - Current timestamp in ms
   * @returns {string} URL-encoded collect token
   */
  _generateCollectChrome(xteaParams, cached, sig, slideSd, behavioralEvents, now, session) {
    const cp = this._chromeProfileData;
    const nowSec = Math.round(now / 1000);

    // Clone the canonical array so we can substitute per-session fields
    const cdCanonical = JSON.parse(JSON.stringify(cp.cdCanonical));

    // Substitute per-session canonical fields:
    // canonical 16 = timestampInit
    cdCanonical[16] = nowSec;
    // canonical 22 = pageUrl
    cdCanonical[22] = 'https://t.captcha.qq.com/cap_union_new_show?rand=' + Math.floor(Math.random() * 1e16);
    // canonical 52 = timestampCollectionEnd
    cdCanonical[52] = nowSec + 2;
    // canonical 53 = timestampCollectionStart
    cdCanonical[53] = nowSec;

    // Reorder from canonical to the live template's field order.
    // -1 slots: hashPosition gets behavioral events; other -1 slots get
    // unmapped static values from the Chrome profile (webglVendor, webglRenderer,
    // webglImage, sid, etc.). These are hardware/session constants captured from
    // Chrome that the opcode mapper couldn't assign canonical indices to.
    const cdFieldOrder = cached.cdFieldOrder || null;
    let cdArray;
    if (cdFieldOrder) {
      const hashPos = cached.hashPosition;

      // Build a pool of unmapped static values from the profile's cd array.
      // These are non-behavioral -1 slots: same values across all templates
      // for the same browser fingerprint, just at different positions.
      const profileOrder = cp.chromeFieldOrder || [];
      const unmappedPool = [];
      for (let j = 0; j < profileOrder.length; j++) {
        if (profileOrder[j] === -1 && cp.cd[j] !== undefined && !Array.isArray(cp.cd[j])) {
          unmappedPool.push(cp.cd[j]);
        }
      }

      // Phase 55.2: substitute live session sid for stale profile sid.
      // The sid is a 16-22 digit numeric string (e.g. "7450533642822729728").
      const liveSid = (session && session.sid) || sig.sid || '';
      if (liveSid) {
        for (let k = 0; k < unmappedPool.length; k++) {
          if (typeof unmappedPool[k] === 'string' && /^\d{16,}$/.test(unmappedPool[k])) {
            unmappedPool[k] = liveSid;
            break;
          }
        }
      }

      cdArray = [];
      let poolIdx = 0;
      for (let i = 0; i < cdFieldOrder.length; i++) {
        const idx = cdFieldOrder[i];
        if (idx === -1) {
          if (i === hashPos) {
            cdArray.push(behavioralEvents);
          } else if (poolIdx < unmappedPool.length) {
            cdArray.push(unmappedPool[poolIdx++]);
          } else {
            cdArray.push('');
          }
        } else {
          cdArray.push(cdCanonical[idx]);
        }
      }
    } else {
      // No field order — use canonical order directly (Template A reference build)
      cdArray = cdCanonical;
    }

    this._log('  Chrome profile: ' + cdArray.length + ' cd fields (canonical ' +
      cdCanonical.length + ', reordered via ' + (cdFieldOrder ? cdFieldOrder.length + '-slot cdFieldOrder' : 'identity') + ')');

    return generateCollect(null, xteaParams, {
      cdArrayOverride: cdArray,
      appid: this.aid,
      nonce: sig.nonce,
      sdOverride: slideSd,
      timestamp: now,
      serializationDiffs: cached.serializationDiffs || null,
      headerSplit: cached.headerSplit || null,
      singleBlob: true,
    });
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

    const auditLogger = new AuditLogger('scraper');
    const client = this._createClient({ auditLogger });
    this._client = client;
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this._log(`Attempt ${attempt}/${this.maxRetries}`);

        // Phase 46.4: capture solve-start timestamp for the pre-verify caplog
        // beacon (HAR entry 8 uses this as its reference t0 for fields 5..16).
        const t0 = Date.now();

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

        // (d2) Fetch tcaptcha-slide.js from CDN (HAR entry 6).
        // Real browser loads this via <script> tag in show page HTML.
        // We don't use the response — only the network request matters.
        if (sig._html) {
          const slideScriptMatch = sig._html.match(/src="(https?:\/\/captcha\.gtimg\.com\/[^"]*tcaptcha-slide[^"]*)"/);
          if (slideScriptMatch) {
            const slideScriptUrl = slideScriptMatch[1];
            this._log('Step 4b: fetch tcaptcha-slide.js (HAR entry 6)');
            try {
              await httpRequest(slideScriptUrl, {
                headers: {
                  'User-Agent': this.userAgent,
                  'Accept': '*/*',
                  'Accept-Language': 'en-US,en;q=0.9',
                  'Accept-Encoding': 'gzip, deflate, br, zstd',
                  'Referer': sig.showUrl || 'https://t.captcha.qq.com/',
                  'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                  'sec-ch-ua-mobile': '?0',
                  'sec-ch-ua-platform': '"Windows"',
                },
                timeout: 10000,
                auditLogger: auditLogger,
                auditStep: 'tcaptcha-slide',
              });
              this._log('  tcaptcha-slide.js fetched');
            } catch (err) {
              this._log('  tcaptcha-slide.js fetch failed (non-fatal): ' + err.message);
            }
          }
        }

        // (e) Extract TDC_NAME (for logging) and source hash (cache key)
        const tdcName = extractTdcName(tdcSource);
        if (!tdcName) {
          throw new Error('Could not extract TDC_NAME from tdc.js source');
        }
        const sourceHash = computeSourceHash(tdcSource);
        this._log(`  TDC_NAME: ${tdcName}`);
        this._log(`  Source hash: ${sourceHash}`);

        let cached = this._templateCache.lookup(sourceHash);
        if (!cached) {
          this._log('  Source hash not in cache — attempting auto-port via pipeline...');
          cached = await this._autoPort(sourceHash, tdcSource);
        }
        if (!cached) {
          throw new Error(`Unknown template (hash=${sourceHash}), auto-port failed`);
        }
        this._log(`  Template: ${cached.template}, opcodes: ${cached.caseCount}`);

        const xteaParams = {
          key: cached.key,
          delta: cached.delta,
          rounds: cached.rounds,
          keyModConstants: cached.keyModConstants,
          keyMods: cached.keyMods || null,
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

        // (h) Compute answer: X = rawOffset, Y = spt from server
        const spt = sig.spt || '0';
        const xAnswer = rawOffset;
        const yAnswer = Math.floor(parseInt(spt, 10)) || 0;
        const ans = `${xAnswer},${yAnswer};`;
        this._log(`  ans: ${ans}`);

        // (i) Generate behavioral events and slide sd
        const now = Date.now();
        const behavioralEvents = generateBehavioralEvents(xAnswer, yAnswer, now);

        // Build slideValue for sd from behavioral events (8-element → 3-element tuples)
        // First entry: [firstDx, cursorViewportY, firstDt] — absolute cursor position of first move
        // Subsequent entries: [dx, dy, dt] — relative deltas
        // Last entry: [0, 0, 0] — terminator
        const slideValueArray = [];
        const cursorViewportY = 800 + Math.floor(Math.random() * 30); // typical captcha Y in viewport
        let dragStartTime = null;
        let firstMove = true;
        let prevTime = null;
        for (const ev of behavioralEvents) {
          if (ev[0] === 1) { // mousemove
            if (firstMove) {
              dragStartTime = ev[3];
              const firstDt = Math.floor(Math.random() * 60 + 60); // ~60-120ms from drag start
              slideValueArray.push([ev[1], cursorViewportY, firstDt]);
              firstMove = false;
              prevTime = ev[3];
            } else {
              const dt = ev[3] - prevTime;
              slideValueArray.push([ev[1], ev[2], dt]);
              prevTime = ev[3];
            }
          }
        }
        slideValueArray.push([0, 0, 0]); // terminator

        const slideSd = buildSlideSd(
          { x: xAnswer, y: yAnswer },
          slideValueArray,
          { trycnt: attempt, refreshcnt: 0 }
        );

        // (j) Generate collect token
        this._log('Step 6: generateCollect');
        let collectEncoded;
        if (this.chromeProfile && this._chromeProfileData) {
          // Chrome profile mode: use real Chrome fingerprint values in canonical
          // order, substitute per-session fields, reorder for the live template,
          // and pass via cdArrayOverride.
          collectEncoded = this._generateCollectChrome(
            xteaParams, cached, sig, slideSd, behavioralEvents, now, session
          );
        } else {
          // Legacy synthetic mode: build cd from profiles/default.json
          const nowSec = Math.round(Date.now() / 1000);
          const profileOverrides = Object.assign({}, this.profile, {
            pageUrl: 'https://t.captcha.qq.com/cap_union_new_show?rand=' + Math.floor(Math.random() * 1e16),
            timestamp: nowSec,
            timestampCollectionStart: nowSec,
            timestampCollectionEnd: nowSec + 3,
            canvasHash: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
            mathFingerprint: Math.random(),
            performanceHash: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
          });
          collectEncoded = generateCollect(profileOverrides, xteaParams, {
            appid: this.aid,
            nonce: sig.nonce,
            sdOverride: slideSd,
            cdFieldOrder: cached.cdFieldOrder || null,
            behavioralEvents: behavioralEvents,
            timestamp: now,
            serializationDiffs: cached.serializationDiffs || null,
            headerSplit: cached.headerSplit || null,
            singleBlob: true,
          });
        }
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

        // (k) Fetch /vm-slide.enc.js from the show-page config URL. Real browsers
        // always issue this request (HAR entry 6); skipping it is a distinctive
        // bot tell. The default path discards the fetched body and still uses the
        // committed sample/vm_slide.js cache for vData generation — only the
        // network observation matters here.
        const vmSlideSource = await this._getVmSlideSource(sig, { auditLogger });

        // (k1) Fetch slide-jy.js from CDN (HAR entry 8).
        // tcaptcha-slide.js loads this dynamically. sig._html may contain
        // an htdocsPath config, but it's often unavailable. Fall back to the
        // canonical CDN URL observed in Chrome captures.
        {
          let jyScriptUrl = null;
          if (sig._html) {
            const htdocsMatch = sig._html.match(/htdocsPath\s*:\s*"(https?:\/\/[^"]*)"/);
            if (htdocsMatch) {
              jyScriptUrl = htdocsMatch[1].replace(/\/+$/, '') + '/slide-jy.js';
            }
          }
          if (!jyScriptUrl) {
            jyScriptUrl = 'https://captcha.gtimg.com/1/slide-jy.js';
          }
          this._log('Step 6b: fetch slide-jy.js (HAR entry 8)');
          try {
            await httpRequest(jyScriptUrl, {
              headers: {
                'User-Agent': this.userAgent,
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Referer': sig.showUrl || 'https://t.captcha.qq.com/',
                'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
              },
              timeout: 10000,
              auditLogger: auditLogger,
              auditStep: 'slide-jy',
            });
            this._log('  slide-jy.js fetched');
          } catch (err) {
            this._log('  slide-jy.js fetch failed (non-fatal): ' + err.message);
          }
        }

        // (k2) Phase 46.4: fire the pre-verify /caplog telemetry beacon. Real
        // Chrome emits this between tdc.js load and the verify POST (HAR
        // entry 8). fire-and-forget — errors are swallowed inside fireBeacon.
        if (!this.skipCaplog) {
          this._log('Step 7a: caplog pre-verify beacon');
          const preUrl = buildPreVerifyBeaconUrl({ t0 });
          await fireBeacon(preUrl, { userAgent: this.userAgent, timeoutMs: 3000, referer: sig.showUrl, auditLogger: auditLogger, auditStep: 'caplog-pre' });
        }

        // (l0) Phase 60: inject TDC_itoken cookie. In real Chrome, tdc.js sets
        // this via document.cookie (not Set-Cookie). Format: <uint32>%3A<unix_ts>.
        // The scraper's CookieJar only captures HTTP Set-Cookie headers, so this
        // cookie is never set naturally. Inject it before the verify POST.
        const itokenValue = Math.floor(Math.random() * 0xFFFFFFFF) + '%3A' + Math.floor(Date.now() / 1000);
        client.cookieJar.cookies.set('TDC_itoken', itokenValue);
        this._log('  TDC_itoken injected: ' + itokenValue);

        // (l) Build the 38 verify POST fields
        const postFields = this._buildPostFields(client, session, sig, ans, collectVal, eks);

        // (m) Generate vData
        let vData;
        let serializedBody;
        if (this.legacyVdata) {
          this._log('Step 7: generateVData (legacy jsdom harness)');
          const legacy = generateVData(
            postFields,
            vmSlideSource,
            this._jquerySource,
            { userAgent: this.userAgent }
          );
          vData = legacy.vData;
          serializedBody = legacy.serializedBody;
        } else {
          this._log('Step 7: buildVDataForPost (standalone, browser profile)');
          serializedBody = serializePostFields(postFields);
          vData = buildVDataForPost(serializedBody, {
            profile: this._vdataProfile,
            overrides: { tp: session.sid || sig.sid || '' },
          });
        }
        this._log(`  vData: ${vData.slice(0, 30)}...`);

        // Audit: log token values for cross-flow diffing
        auditLogger.logTokens({
          collectLength: collectVal.length,
          collectEncoded: collectVal,
          eks: eks || '',
          vData: vData,
          ans: ans,
          slideSd: slideSd,
          behavioralEventsCount: behavioralEvents.length,
          nonce: postFields.nonce || '',
          vsig: postFields.vsig || '',
          websig: postFields.websig || '',
          sess: postFields.sess || '',
          tlg: postFields.tlg || '',
          sid: postFields.sid || '',
        });

        // (n) Human-like delay before verify POST.
        // Phase 52 audit: scraper submits in 41ms vs Chrome's 3314ms.
        // Simulate the time a real user takes to drag the slider.
        const humanDelay = 2000 + Math.floor(Math.random() * 3000);
        this._log('Step 7b: human-like delay (' + humanDelay + 'ms)');
        await new Promise(r => setTimeout(r, humanDelay));

        // (o) Submit verify
        this._log('Step 8: verify');
        let scraperRawBody = null;
        const result = await client.verify({
          session,
          sig,
          ans,
          collect: collectEncoded,
          eks: eks || '',
          tlg: collectVal.length,
          vData,
          prebuiltBody: serializedBody,
          _rawBodyCapture: (body) => { scraperRawBody = body; },
        });

        // Phase 55: write raw verify body for diffing
        if (scraperRawBody) {
          const phase55Dir = path.join(PROJECT_ROOT, 'output', 'phase-55');
          fs.mkdirSync(phase55Dir, { recursive: true });
          fs.writeFileSync(path.join(phase55Dir, 'scraper-verify-body.txt'), scraperRawBody);
          this._log(`  Wrote scraper-verify-body.txt (${scraperRawBody.length} chars)`);
        }

        this._log(`  errorCode: ${result.errorCode}, ticket: ${result.ticket ? result.ticket.slice(0, 30) + '...' : 'none'}`);

        // Record the verify result for the audit log
        auditLogger.setResult({
          errorCode: result.errorCode,
          ticket: result.ticket || '',
          randstr: result.randstr || '',
        });

        // Phase 46.4: fire the post-verify /caplog telemetry beacon (HAR
        // entry 10). Must fire on both success and failure paths. Uses the
        // solved x-answer as the field-27 slide-dx proxy.
        if (!this.skipCaplog) {
          this._log('Step 9: caplog post-verify beacon');
          const postUrl = buildPostVerifyBeaconUrl({ ans: xAnswer });
          await fireBeacon(postUrl, { userAgent: this.userAgent, timeoutMs: 3000, referer: sig.showUrl, auditLogger: auditLogger, auditStep: 'caplog-post' });
        }

        if (result.errorCode === 0 || (result.errorCode === -1 && result.ticket)) {
          auditLogger.save(path.join(PROJECT_ROOT, 'output', 'phase-52-audit', 'scraper-audit.json'));
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

    // Save audit log even on failure — captures all requests for debugging
    auditLogger.save(path.join(PROJECT_ROOT, 'output', 'phase-52-audit', 'scraper-audit.json'));
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
