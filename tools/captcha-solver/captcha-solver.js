'use strict';

/**
 * captcha-puppeteer.js — Puppeteer-stealth CAPTCHA solver (Task 10.6)
 *
 * Replaces the jsdom+Node.js HTTP approach with a real Chrome browser driven
 * by puppeteer-extra + stealth plugin. The CAPTCHA page loads naturally in
 * Chrome — TDC runs in the real DOM, fingerprints are real, TLS is Chrome's.
 *
 * Flow:
 *   1. Launch Chrome (headless) with stealth plugin
 *   2. Navigate to the CAPTCHA show page URL (iframe src)
 *   3. Intercept hycdn image responses to get bg + slider images
 *   4. Call solveSlider() to get the x-offset
 *   5. Perform a realistic mouse drag on the slider element
 *   6. Intercept the /cap_union_new_verify response for ticket
 *   7. Return { ticket, randstr, errorCode }
 *
 * Exports: CaptchaPuppeteer
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { solveSlider } = require('./slide-solver');
const { CaptchaClient } = require('./captcha-client');

// Register stealth plugin — patches headless detection vectors
puppeteer.use(StealthPlugin());

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const BASE_URL = 'https://t.captcha.qq.com';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

/** Fallback display ratio: CSS pixels / natural pixels (680px → 340px = 0.5) */
const DEFAULT_RATIO = 0.5;

/** Fixed calibration offset matching bot.py line 80 (base only, no jitter) */
const CALIBRATION_OFFSET = -25;

/** Default app ID for urlsec.qq.com */
const DEFAULT_AID = '2046626881';

/** Timeout for page navigation */
const NAV_TIMEOUT = 30000;

/** Timeout for waiting for verify response */
const VERIFY_TIMEOUT = 15000;

/** Default Y coordinate for slide answer */
const DEFAULT_SLIDE_Y = 45;

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Log to stderr (keeps stdout clean).
 * @param {string} msg
 */
function log(msg) {
  process.stderr.write(msg + '\n');
}

/**
 * Sleep for ms.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Generate a realistic mouse drag path from (x1,y1) to (x2,y2).
 * Uses eased steps with random jitter to simulate human movement.
 *
 * @param {number} x1 - start x
 * @param {number} y1 - start y
 * @param {number} x2 - end x
 * @param {number} y2 - end y
 * @param {number} [steps=25] - number of intermediate steps
 * @returns {Array<{x: number, y: number, delay: number}>}
 */
function generateDragPath(x1, y1, x2, y2, steps) {
  steps = steps || 25 + Math.floor(Math.random() * 10);
  const path = [];
  const dx = x2 - x1;
  const dy = y2 - y1;

  for (let i = 0; i <= steps; i++) {
    // Ease-out cubic: fast start, slow end (human-like)
    const t = i / steps;
    const ease = 1 - Math.pow(1 - t, 3);

    // Add random jitter (±2px on x, ±1px on y)
    const jitterX = (Math.random() - 0.5) * 4;
    const jitterY = (Math.random() - 0.5) * 2;

    const x = Math.round(x1 + dx * ease + (i < steps ? jitterX : 0));
    const y = Math.round(y1 + dy * ease + (i < steps ? jitterY : 0));

    // Random delay between steps (5-25ms, slower at start/end)
    const baseDelay = 10 + Math.random() * 15;
    const positionFactor = Math.sin(t * Math.PI); // slower at edges
    const delay = Math.round(baseDelay + positionFactor * 10);

    path.push({ x, y, delay });
  }

  // Ensure last point is exact target
  path[path.length - 1].x = x2;
  path[path.length - 1].y = y2;

  return path;
}

// ═══════════════════════════════════════════════════════════════════════
// CaptchaPuppeteer — Main class
// ═══════════════════════════════════════════════════════════════════════

class CaptchaPuppeteer {
  /**
   * @param {object} [opts]
   * @param {string} [opts.aid] - CAPTCHA app ID
   * @param {string} [opts.referer] - referer for the outer page
   * @param {string} [opts.userAgent] - browser user agent
   * @param {number} [opts.ratio] - CSS/natural pixel ratio
   * @param {boolean} [opts.headless] - run headless (default: true)
   * @param {object} [opts.browser] - reuse an existing browser instance
   */
  constructor(opts) {
    opts = opts || {};
    this.aid = opts.aid || DEFAULT_AID;
    this.referer = opts.referer || 'https://urlsec.qq.com/check.html';
    this.userAgent = opts.userAgent || DEFAULT_USER_AGENT;
    this.ratio = opts.ratio !== undefined ? opts.ratio : DEFAULT_RATIO;
    this.headless = opts.headless !== undefined ? opts.headless : true;
    this._browser = opts.browser || null;
    this._ownsBrowser = !opts.browser;
  }

  /**
   * Ensure browser is launched.
   * @returns {Promise<import('puppeteer').Browser>}
   */
  async _ensureBrowser() {
    if (!this._browser) {
      log('  [pptr] Launching Chrome with stealth plugin...');
      this._browser = await puppeteer.launch({
        headless: this.headless ? 'new' : false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
        ],
        defaultViewport: {
          width: 1280,
          height: 1400,
          deviceScaleFactor: 1,
        },
      });
      this._ownsBrowser = true;
    }
    return this._browser;
  }

  /**
   * Build the show page URL (CAPTCHA iframe src).
   *
   * @param {object} session - prehandle session data { sess, sid }
   * @returns {string} - full show page URL
   */
  _buildShowUrl(session) {
    const params = new URLSearchParams({
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
      subsid: '1',
    });

    return `${BASE_URL}/cap_union_new_show?${params.toString()}`;
  }

  /**
   * Run the prehandle request via CaptchaClient (Node.js HTTP).
   * This is fine to do server-side — prehandle doesn't need TLS fingerprinting.
   *
   * @returns {Promise<object>} - { sess, sid, ... }
   */
  async _prehandle() {
    const client = new CaptchaClient({
      aid: this.aid,
      referer: this.referer,
    });
    const session = await client.prehandle();
    return session;
  }

  /**
   * Solve a single CAPTCHA challenge.
   *
   * @param {object} [opts]
   * @param {number} [opts.maxRetries] - max wrong-answer retries (default: 3)
   * @returns {Promise<{ticket: string, randstr: string, errorCode: number, _raw: object}>}
   */
  async solve(opts) {
    opts = opts || {};
    const maxRetries = opts.maxRetries !== undefined ? opts.maxRetries : 3;
    const browser = await this._ensureBrowser();
    const page = await browser.newPage();
    let verifyTimer;

    try {
      // Set user agent
      await page.setUserAgent(this.userAgent);

      // ── Step 1: Prehandle (get session) ──
      log('  [pptr] Step 1: prehandle...');
      const session = await this._prehandle();
      log(`  [pptr] sess=${session.sess.slice(0, 20)}... sid=${session.sid}`);

      // ── Step 2: Navigate to show page ──
      const showUrl = this._buildShowUrl(session);
      log(`  [pptr] Step 2: navigating to show page...`);

      // Set up response interceptors BEFORE navigation
      const interceptedImages = {}; // { 'bg': Buffer, 'slice': Buffer }
      let capturedTdcSource = null;
      let capturedVerifyPost = null;
      let verifyResolve;
      let verifyReject;
      const verifyPromise = new Promise((resolve, reject) => {
        verifyResolve = (data) => { clearTimeout(verifyTimer); resolve(data); };
        verifyReject = (err) => { clearTimeout(verifyTimer); reject(err); };
      });

      // ── Capture verify request body (full POST fields) ──
      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('cap_union_new_verify') && request.method() === 'POST') {
          try {
            const postData = request.postData() || '';
            const params = new URLSearchParams(postData);
            const collect = params.get('collect') || '';
            log(`  [pptr] Verify request: POST body ${postData.length} chars`);
            log(`  [pptr] Verify request: collect field length = ${collect.length}`);
            // Capture full POST body as plain object
            // IMPORTANT: URLSearchParams converts '+' to spaces, corrupting
            // base64 fields (collect, eks). Parse raw postData to preserve them.
            capturedVerifyPost = {};
            for (const pair of postData.split('&')) {
              const eqIdx = pair.indexOf('=');
              if (eqIdx === -1) continue;
              const k = decodeURIComponent(pair.slice(0, eqIdx));
              // Preserve '+' as literal (it's base64, not space)
              const v = decodeURIComponent(pair.slice(eqIdx + 1).replace(/\+/g, '%2B'));
              capturedVerifyPost[k] = v;
            }
            log(`  [pptr] Verify request: captured ${Object.keys(capturedVerifyPost).length} fields`);
          } catch (err) {
            log(`  [pptr] Failed to parse verify request body: ${err.message}`);
          }
        }
      });

      // Intercept hycdn image responses
      page.on('response', async (response) => {
        const url = response.url();
        try {
          if (url.includes('/hycdn') || url.includes('hycdn.cn')) {
            const buffer = await response.buffer();
            if (buffer.length > 1000) { // Skip tiny error responses
              if (url.includes('img_index=1') || url.includes('index=1')) {
                interceptedImages.bg = buffer;
                log(`  [pptr] Intercepted bg image: ${buffer.length} bytes`);
              } else if (url.includes('img_index=2') || url.includes('index=2')) {
                interceptedImages.slice = buffer;
                log(`  [pptr] Intercepted slice image: ${buffer.length} bytes`);
              } else if (!interceptedImages.bg) {
                // First image without index hint → background
                interceptedImages.bg = buffer;
                log(`  [pptr] Intercepted image (assumed bg): ${buffer.length} bytes`);
              } else if (!interceptedImages.slice) {
                // Second image → slice
                interceptedImages.slice = buffer;
                log(`  [pptr] Intercepted image (assumed slice): ${buffer.length} bytes`);
              }
            }
          }

          // Intercept tdc.js source
          if (url.includes('/tdc.js') || url.includes('tdc.js?')) {
            const tdcText = await response.text();
            if (tdcText.length > 1000) { // Skip error pages
              capturedTdcSource = tdcText;
              log(`  [pptr] Intercepted tdc.js source: ${tdcText.length} chars`);
            }
          }

          // Intercept verify response
          if (url.includes('cap_union_new_verify')) {
            const text = await response.text();
            log(`  [pptr] Intercepted verify response: ${text.slice(0, 200)}`);
            try {
              const data = JSON.parse(text);
              verifyResolve(data);
            } catch (e) {
              // Try JSONP parse
              const jsonStr = text.replace(/^[^(]+\(/, '').replace(/\)\s*;?\s*$/, '');
              try {
                const data = JSON.parse(jsonStr);
                verifyResolve(data);
              } catch (e2) {
                verifyReject(new Error(`Failed to parse verify response: ${text.slice(0, 200)}`));
              }
            }
          }
        } catch (err) {
          // response.buffer() can fail for redirects etc. — ignore silently
        }
      });

      // Navigate to show page
      await page.goto(showUrl, {
        waitUntil: 'networkidle2',
        timeout: NAV_TIMEOUT,
      });
      log('  [pptr] Show page loaded');

      // ── Step 3: Wait for images ──
      log('  [pptr] Step 3: waiting for images...');
      const imageWaitStart = Date.now();
      while ((!interceptedImages.bg || !interceptedImages.slice) && Date.now() - imageWaitStart < 10000) {
        await sleep(200);
      }

      if (!interceptedImages.bg || !interceptedImages.slice) {
        // Fallback: try to extract from canvas or img elements
        log('  [pptr] ⚠️ Image interception incomplete, trying DOM extraction...');
        const extracted = await this._extractImagesFromDOM(page);
        if (extracted.bg) interceptedImages.bg = extracted.bg;
        if (extracted.slice) interceptedImages.slice = extracted.slice;
      }

      if (!interceptedImages.bg || !interceptedImages.slice) {
        throw new Error('Failed to intercept/extract CAPTCHA images');
      }

      // ── Step 4: Solve slide puzzle ──
      log('  [pptr] Step 4: solving slide puzzle...');
      const rawOffset = await solveSlider(interceptedImages.bg, interceptedImages.slice);

      // ── Fix A: Dynamic ratio from #slideBg element ──
      // bot.py line 79: ratio = bg_element.rect.size[0] / natural_width
      // Read the ACTUAL rendered width of #slideBg from the DOM and compute ratio
      let ratio = this.ratio; // fallback to configured ratio (default 0.5)
      try {
        const dynamicRatio = await page.evaluate(() => {
          const bgEl = document.querySelector('#slideBg');
          if (bgEl && bgEl.naturalWidth > 0) {
            const rendered = bgEl.getBoundingClientRect().width;
            return rendered / bgEl.naturalWidth;
          }
          return null;
        });
        if (dynamicRatio !== null && dynamicRatio > 0) {
          ratio = dynamicRatio;
          log(`  [pptr] Dynamic ratio from #slideBg: ${ratio.toFixed(4)}`);
        } else {
          log(`  [pptr] #slideBg not found or zero width, using fallback ratio=${ratio}`);
        }
      } catch (ratioErr) {
        log(`  [pptr] Failed to read #slideBg ratio: ${ratioErr.message}, using fallback=${ratio}`);
      }

      // ── Fix B: Apply -25 calibration (bot.py line 80-81, no random jitter) ──
      const cssOffset = Math.round(rawOffset * ratio) + CALIBRATION_OFFSET;
      log(`  [pptr] raw=${rawOffset} → css=${cssOffset} (ratio=${ratio.toFixed(4)}, calibration=${CALIBRATION_OFFSET})`);

      // ── Step 5: Find and drag the slider ──
      log('  [pptr] Step 5: performing mouse drag...');
      await this._performDrag(page, cssOffset);

      // ── Step 6: Wait for verify response ──
      log('  [pptr] Step 6: waiting for verify response...');
      // Start timeout now (after drag, not before)
      verifyTimer = setTimeout(() => {
        verifyReject(new Error('Verify response timeout'));
      }, VERIFY_TIMEOUT);
      const verifyData = await verifyPromise;

      const errorCode = parseInt(verifyData.errorCode, 10);
      log(`  [pptr] Verify result: errorCode=${errorCode}`);

      return {
        ticket: verifyData.ticket || '',
        randstr: verifyData.randstr || '',
        errorCode: errorCode,
        _raw: verifyData,
        _capture: {
          tdcSource: capturedTdcSource,
          verifyPostBody: capturedVerifyPost,
        },
      };
    } finally {
      if (verifyTimer) clearTimeout(verifyTimer);
      await page.close().catch(() => {});
    }
  }

  /**
   * Perform a realistic mouse drag on the slider element.
   *
   * Finds the slider button/handle, calculates start position, then
   * performs a smooth mouse movement to simulate human drag.
   *
   * @param {import('puppeteer').Page} page
   * @param {number} cssOffset - how far to drag in CSS pixels
   */
  async _performDrag(page, cssOffset) {
    // Wait for the slider element to appear
    // Common selectors for Tencent CAPTCHA slider:
    //   #tcaptcha_drag_button — the drag handle
    //   #tcaptcha_drag_thumb — alternative
    //   .tc-drag-thumb — class-based
    //   #slide_icon — another possibility
    //   .tc-slider-normal — slider bar
    const sliderSelectors = [
      '#tcaptcha_drag_button',
      '#tcaptcha_drag_thumb',
      '#slide_icon',
      '.tc-drag-thumb',
      '.slide_icon',
      '[id*="drag"]',
      '[class*="drag-thumb"]',
      '[class*="slider"]',
    ];

    let sliderEl = null;
    for (const sel of sliderSelectors) {
      try {
        sliderEl = await page.waitForSelector(sel, { timeout: 3000 });
        if (sliderEl) {
          log(`  [pptr] Found slider: ${sel}`);
          break;
        }
      } catch (_) {
        // Try next selector
      }
    }

    if (!sliderEl) {
      // Last resort: find any draggable-looking element
      log('  [pptr] ⚠️ No slider found by selector, trying heuristic...');
      sliderEl = await page.evaluateHandle(() => {
        // Look for a small positioned element inside a wider track
        const candidates = document.querySelectorAll('div, span, img');
        for (const el of candidates) {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          if (rect.width > 30 && rect.width < 80 &&
              rect.height > 20 && rect.height < 80 &&
              style.position !== 'static' &&
              style.cursor === 'pointer') {
            return el;
          }
        }
        return null;
      });

      if (!sliderEl || !(await sliderEl.asElement())) {
        throw new Error('Could not find slider element on page');
      }
    }

    // Scroll slider into view first
    await sliderEl.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await sleep(200);

    // Get slider bounding box
    const box = await sliderEl.boundingBox();
    if (!box) {
      throw new Error('Slider element has no bounding box (hidden?)');
    }

    log(`  [pptr] Slider box: x=${box.x.toFixed(0)} y=${box.y.toFixed(0)} w=${box.width.toFixed(0)} h=${box.height.toFixed(0)}`);

    // Start from center of slider handle
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const endX = startX + cssOffset;
    const endY = startY + (Math.random() - 0.5) * 4; // slight y variation

    log(`  [pptr] Dragging: (${startX.toFixed(0)},${startY.toFixed(0)}) → (${endX.toFixed(0)},${endY.toFixed(0)})`);

    // Generate human-like drag path
    const path = generateDragPath(startX, startY, endX, endY);

    // Perform the drag
    // 1. Move to start
    await page.mouse.move(startX, startY);
    await sleep(100 + Math.random() * 100);

    // 2. Mouse down
    await page.mouse.down();
    await sleep(50 + Math.random() * 50);

    // 3. Move along path with timing
    for (const point of path) {
      await page.mouse.move(point.x, point.y);
      await sleep(point.delay);
    }

    // 4. Small pause at end (human hesitation)
    await sleep(50 + Math.random() * 100);

    // 5. Mouse up
    await page.mouse.up();
    log('  [pptr] Drag complete');

    // 6. Wait a moment for the verify request to fire
    await sleep(500);
  }

  /**
   * Fallback: extract images from the page DOM (canvas or img elements).
   *
   * @param {import('puppeteer').Page} page
   * @returns {Promise<{bg: Buffer|null, slice: Buffer|null}>}
   */
  async _extractImagesFromDOM(page) {
    const result = { bg: null, slice: null };

    try {
      // Try to get images from img elements
      const imageData = await page.evaluate(() => {
        const images = {};
        // Look for background image (usually the larger one)
        const imgs = document.querySelectorAll('img');
        const sorted = Array.from(imgs)
          .filter((img) => img.naturalWidth > 100)
          .sort((a, b) => b.naturalWidth - a.naturalWidth);

        if (sorted.length >= 2) {
          // Draw to canvas and get data URL
          for (let i = 0; i < Math.min(2, sorted.length); i++) {
            const img = sorted[i];
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const key = i === 0 ? 'bg' : 'slice';
            images[key] = canvas.toDataURL('image/png').split(',')[1];
          }
        }

        return images;
      });

      if (imageData.bg) {
        result.bg = Buffer.from(imageData.bg, 'base64');
        log(`  [pptr] DOM extraction: bg ${result.bg.length} bytes`);
      }
      if (imageData.slice) {
        result.slice = Buffer.from(imageData.slice, 'base64');
        log(`  [pptr] DOM extraction: slice ${result.slice.length} bytes`);
      }
    } catch (err) {
      log(`  [pptr] DOM image extraction failed: ${err.message}`);
    }

    return result;
  }

  /**
   * Close the browser (if we own it).
   */
  async close() {
    if (this._browser && this._ownsBrowser) {
      await this._browser.close().catch(() => {});
      this._browser = null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  CaptchaPuppeteer,
  generateDragPath,
  log,
  DEFAULT_AID,
  DEFAULT_RATIO,
  DEFAULT_SLIDE_Y,
  CALIBRATION_OFFSET,
};
