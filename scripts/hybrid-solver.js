'use strict';

/**
 * hybrid-solver.js — Hybrid CAPTCHA Solver
 *
 * Uses Puppeteer (real Chrome) for HTTP transport (TLS fingerprint) but
 * generates the collect token using standalone Node.js code. This tests
 * whether TLS fingerprinting (JA3/JA4) is causing errorCode 9 in the
 * headless scraper.
 *
 * Flow:
 *   1. Launch Puppeteer with stealth plugin
 *   2. Prehandle via Node.js HTTP (no TLS check on this endpoint)
 *   3. Navigate to show page in Chrome -> intercept tdc.js + images + config
 *   4. Solve slider via OpenCV (solveSlider)
 *   5. Extract TDC_NAME + eks from captured tdc.js
 *   6. Look up template cache for XTEA params
 *   7. Generate collect token standalone (collect-generator)
 *   8. Generate vData via jsdom (vdata-generator)
 *   9. Submit verify POST via page.evaluate(fetch()) -> Chrome TLS
 *  10. Log result
 *
 * Usage:
 *   node scripts/hybrid-solver.js
 *   node scripts/hybrid-solver.js --headful
 *   node scripts/hybrid-solver.js --retries 3
 */

const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { CaptchaClient } = require('../puppeteer/captcha-client');
const { solveSlider } = require('../puppeteer/slide-solver');
const { generateCollect, generateBehavioralEvents, buildSlideSd } = require('../scraper/collect-generator');
const { generateVData } = require('../scraper/vdata-generator');
const { extractTdcName, extractEks } = require('../scraper/tdc-utils');
const TemplateCache = require('../scraper/template-cache');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const BASE_URL = 'https://t.captcha.qq.com';
const DEFAULT_AID = '2046626881';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const DEFAULT_RATIO = 0.5;
const CALIBRATION_OFFSET = -25;
const DEFAULT_SLIDE_Y = 45;
const NAV_TIMEOUT = 30000;

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function log(msg) {
  process.stderr.write(`[hybrid] ${msg}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse CLI arguments.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { headless: true, maxRetries: 3 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headful') opts.headless = false;
    if (args[i] === '--retries' && args[i + 1]) opts.maxRetries = parseInt(args[i + 1], 10);
  }
  return opts;
}

// ═══════════════════════════════════════════════════════════════════════
// Main Solver
// ═══════════════════════════════════════════════════════════════════════

async function solve(opts) {
  const { headless, maxRetries } = opts;
  const userAgent = DEFAULT_USER_AGENT;

  // Load template cache
  const cache = new TemplateCache();
  cache.load();
  cache.seed();
  log('Template cache loaded and seeded');

  // Load default profile
  const profilePath = path.join(PROJECT_ROOT, 'profiles', 'default.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  log('Default profile loaded');

  // Load jQuery source
  const jqueryPath = path.join(PROJECT_ROOT, 'sample', 'slide-jy.js');
  if (!fs.existsSync(jqueryPath)) {
    throw new Error('sample/slide-jy.js not found -- vData generation will fail');
  }
  const jquerySource = fs.readFileSync(jqueryPath, 'utf8');
  log(`jQuery source loaded (${jquerySource.length} chars)`);

  // Load vm-slide fallback source
  const vmSlidePath = path.join(PROJECT_ROOT, 'sample', 'vm_slide.js');
  let vmSlideSource = null;
  if (fs.existsSync(vmSlidePath)) {
    vmSlideSource = fs.readFileSync(vmSlidePath, 'utf8');
    log(`vm-slide fallback loaded (${vmSlideSource.length} chars)`);
  }

  // ── Step 1: Launch Puppeteer ──
  log('Step 1: Launching Chrome with stealth plugin...');
  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
    defaultViewport: { width: 1280, height: 1400, deviceScaleFactor: 1 },
  });

  let lastResult = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const page = await browser.newPage();
    await page.setUserAgent(userAgent);

    try {
      log(`\n=== Attempt ${attempt}/${maxRetries} ===`);

      // ── Step 2: Prehandle via Node.js HTTP ──
      log('Step 2: prehandle (Node.js HTTP)...');
      const client = new CaptchaClient({
        aid: DEFAULT_AID,
        referer: 'https://urlsec.qq.com/',
      });
      const session = await client.prehandle();
      log(`  sess=${session.sess.slice(0, 20)}... sid=${session.sid}`);

      // ── Step 3: Navigate to show page + intercept ──
      log('Step 3: Navigate to show page + intercept...');

      // Build show URL (same as CaptchaPuppeteer._buildShowUrl)
      const showParams = new URLSearchParams({
        aid: DEFAULT_AID,
        protocol: 'https',
        accver: '1',
        showtype: 'popup',
        ua: Buffer.from(userAgent).toString('base64'),
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
      const showUrl = `${BASE_URL}/cap_union_new_show?${showParams.toString()}`;

      // Set up response interceptors BEFORE navigation
      const interceptedImages = {};
      let capturedTdcSource = null;
      let capturedShowConfig = null;

      page.on('response', async (response) => {
        const url = response.url();
        try {
          // Intercept hycdn images
          if (url.includes('/hycdn') || url.includes('hycdn.cn')) {
            const buffer = await response.buffer();
            if (buffer.length > 1000) {
              if (url.includes('img_index=1') || url.includes('index=1')) {
                interceptedImages.bg = buffer;
                log(`  Intercepted bg image: ${buffer.length} bytes`);
              } else if (url.includes('img_index=2') || url.includes('index=2')) {
                interceptedImages.slice = buffer;
                log(`  Intercepted slice image: ${buffer.length} bytes`);
              } else if (!interceptedImages.bg) {
                interceptedImages.bg = buffer;
                log(`  Intercepted image (assumed bg): ${buffer.length} bytes`);
              } else if (!interceptedImages.slice) {
                interceptedImages.slice = buffer;
                log(`  Intercepted image (assumed slice): ${buffer.length} bytes`);
              }
            }
          }

          // Intercept tdc.js source
          if (url.includes('/tdc.js') || url.includes('tdc.js?')) {
            const text = await response.text();
            if (text.length > 1000) {
              capturedTdcSource = text;
              log(`  Intercepted tdc.js source: ${text.length} chars`);
            }
          }

          // Capture show page config (nonce, vsig, websig, etc.)
          if (url.includes('cap_union_new_show') && response.status() === 200) {
            try {
              const html = await response.text();
              capturedShowConfig = html;
              log(`  Captured show page HTML: ${html.length} chars`);
            } catch (_) { /* ignore */ }
          }
        } catch (_) {
          // response.buffer() can fail for redirects etc. -- ignore
        }
      });

      // Navigate
      await page.goto(showUrl, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
      log('  Show page loaded');

      // Wait for images + tdc.js
      const waitStart = Date.now();
      while ((!interceptedImages.bg || !interceptedImages.slice || !capturedTdcSource) &&
             Date.now() - waitStart < 10000) {
        await sleep(200);
      }

      if (!interceptedImages.bg || !interceptedImages.slice) {
        throw new Error('Failed to intercept CAPTCHA images');
      }
      if (!capturedTdcSource) {
        throw new Error('Failed to intercept tdc.js source');
      }

      // Extract nonce, vsig, websig, subcapclass from show page config
      let nonce = '';
      let vsig = '';
      let websig = '';
      let subcapclass = '';
      let showSess = session.sess;
      if (capturedShowConfig) {
        // Parse config from show page HTML
        const nonceMatch = capturedShowConfig.match(/["']?nonce["']?\s*:\s*["']([^"']+)["']/);
        if (nonceMatch) nonce = nonceMatch[1];
        const vsigMatch = capturedShowConfig.match(/["']?vsig["']?\s*:\s*["']([^"']+)["']/);
        if (vsigMatch) vsig = vsigMatch[1];
        const websigMatch = capturedShowConfig.match(/["']?websig["']?\s*:\s*["']([^"']+)["']/);
        if (websigMatch) websig = websigMatch[1];
        const subcapMatch = capturedShowConfig.match(/["']?subcapclass["']?\s*:\s*["']([^"']+)["']/);
        if (subcapMatch) subcapclass = subcapMatch[1];
        const sessMatch = capturedShowConfig.match(/["']?sess["']?\s*:\s*["']([^"']+)["']/);
        if (sessMatch) showSess = sessMatch[1];
        log(`  Config: nonce=${nonce}, vsig=${vsig.slice(0, 10)}..., subcapclass=${subcapclass}`);
      }

      // ── Step 4: Solve slider via OpenCV ──
      log('Step 4: Solve slider via OpenCV...');
      const rawOffset = await solveSlider(interceptedImages.bg, interceptedImages.slice);
      log(`  rawOffset: ${rawOffset}`);

      // Compute CSS offset with ratio + calibration
      const calibration = CALIBRATION_OFFSET + Math.floor(Math.random() * 11) - 5;
      const xAnswer = Math.round(rawOffset * DEFAULT_RATIO + calibration);
      const ans = `${xAnswer},${DEFAULT_SLIDE_Y};`;
      log(`  ans: ${ans}`);

      // ── Step 5: Extract TDC_NAME + eks ──
      log('Step 5: Extract TDC_NAME + eks...');
      const tdcName = extractTdcName(capturedTdcSource);
      if (!tdcName) throw new Error('Could not extract TDC_NAME from tdc.js source');
      log(`  TDC_NAME: ${tdcName}`);

      const eks = extractEks(capturedTdcSource);
      log(`  eks: ${eks ? eks.slice(0, 20) + '...' : 'null'}`);

      // ── Step 6: Look up template cache ──
      log('Step 6: Template cache lookup...');
      let cached = cache.lookup(tdcName);
      if (!cached) {
        log('  TDC_NAME not in cache, running structural lookup...');
        try {
          const { parseVmFunction } = require('../pipeline/vm-parser');
          const vmInfo = parseVmFunction(capturedTdcSource);
          log(`  Parsed VM: ${vmInfo.caseCount} opcodes`);
          cached = cache.lookupByStructure(vmInfo.caseCount);
          if (cached) {
            cache.store(tdcName, cached);
            log(`  Matched template ${cached.template} by structure (${vmInfo.caseCount} opcodes)`);
          }
        } catch (parseErr) {
          log(`  VM parse failed: ${parseErr.message}`);
        }
      }
      if (!cached) throw new Error(`Unknown template ${tdcName}, run pipeline to port it`);
      log(`  Template: ${cached.template}, opcodes: ${cached.caseCount}`);

      const xteaParams = {
        key: cached.key,
        delta: cached.delta,
        rounds: cached.rounds,
        keyModConstants: cached.keyModConstants,
        keyMods: cached.keyMods || null,
      };

      // ── Step 7: Generate collect token standalone ──
      log('Step 7: Generate collect token...');
      const now = Date.now();
      const nowSec = Math.round(now / 1000);
      const behavioralEvents = generateBehavioralEvents(xAnswer, DEFAULT_SLIDE_Y, now);

      // Build slideValue for sd from behavioral events
      const slideValueArray = [];
      let totalX = 0;
      let totalY = 0;
      let firstMoveTime = null;
      let lastMoveTime = null;
      for (const ev of behavioralEvents) {
        if (ev[0] === 1) { // mousemove
          if (firstMoveTime === null) firstMoveTime = ev[3];
          totalX += ev[1];
          totalY += ev[2];
          lastMoveTime = ev[3];
        }
      }
      const totalElapsed = (lastMoveTime && firstMoveTime) ? lastMoveTime - firstMoveTime : 1000;
      slideValueArray.push([totalX, totalY, totalElapsed]);
      let prevTime = firstMoveTime;
      for (const ev of behavioralEvents) {
        if (ev[0] === 1) {
          const dt = prevTime ? ev[3] - prevTime : 0;
          slideValueArray.push([ev[1], ev[2], dt]);
          prevTime = ev[3];
        }
      }
      slideValueArray.push([0, 0, 0]); // terminator

      const slideSd = buildSlideSd(
        { x: xAnswer, y: DEFAULT_SLIDE_Y },
        slideValueArray,
        { trycnt: attempt, refreshcnt: 0, elapsed: totalElapsed }
      );

      const profileOverrides = Object.assign({}, profile, {
        pageUrl: showUrl,
        timestamp: nowSec,
        timestampCollectionStart: nowSec,
        timestampCollectionEnd: nowSec + 3,
        canvasHash: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
        mathFingerprint: Math.random(),
        performanceHash: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
      });

      const collectEncoded = generateCollect(profileOverrides, xteaParams, {
        appid: DEFAULT_AID,
        nonce: nonce,
        sdOverride: slideSd,
        cdFieldOrder: cached.cdFieldOrder || null,
        behavioralEvents: behavioralEvents,
        timestamp: now,
      });

      // Decode URI-encoded collect for POST fields
      let collectVal = collectEncoded;
      if (collectVal.includes('%')) {
        try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* leave as-is */ }
      }
      log(`  collect length: ${collectVal.length}`);

      // ── Step 8: Generate vData via jsdom ──
      log('Step 8: Generate vData via jsdom...');

      // Build the 38 verify POST fields
      const postFields = {
        aid: DEFAULT_AID,
        protocol: 'https',
        accver: '1',
        showtype: 'popup',
        ua: Buffer.from(userAgent).toString('base64'),
        noheader: '1',
        fb: '1',
        aged: '0',
        enableAged: '0',
        enableDarkMode: '0',
        grayscale: '1',
        dyeid: '0',
        clientype: '2',
        sess: showSess,
        fwidth: '0',
        sid: session.sid,
        wxLang: '',
        tcScale: '1',
        uid: '',
        cap_cd: '',
        rnd: String(Math.floor(Math.random() * 1000000)),
        prehandleLoadTime: String(Math.floor(Math.random() * 200 + 100)),
        createIframeStart: String(Date.now() - Math.floor(Math.random() * 5000 + 2000)),
        global: '0',
        subsid: '1',
        cdata: '0',
        ans: ans,
        vsig: vsig,
        websig: websig,
        subcapclass: subcapclass,
        pow_answer: '',
        pow_calc_time: '0',
        collect: collectVal,
        tlg: String(collectVal.length),
        fpinfo: '',
        eks: eks || '',
        nonce: nonce,
        vlg: '0_0_1',
      };

      if (!vmSlideSource) {
        throw new Error('No vm-slide source available (sample/vm_slide.js not found)');
      }

      const { vData, serializedBody } = generateVData(
        postFields,
        vmSlideSource,
        jquerySource,
        { userAgent }
      );
      log(`  vData: ${vData.slice(0, 30)}...`);

      // Build the final POST body: jQuery-serialized fields + vData appended
      const finalBody = serializedBody + '&vData=' + encodeURIComponent(vData);
      log(`  Final body length: ${finalBody.length}`);

      // ── Step 9: Submit verify via page.evaluate(fetch()) -- Chrome TLS ──
      log('Step 9: Submit verify via Chrome fetch()...');
      const verifyResult = await page.evaluate(async (body) => {
        try {
          const resp = await fetch('https://t.captcha.qq.com/cap_union_new_verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
            },
            body: body,
          });
          return { status: resp.status, text: await resp.text() };
        } catch (err) {
          return { error: err.message };
        }
      }, finalBody);

      // ── Step 10: Parse result ──
      log('Step 10: Parse result...');
      if (verifyResult.error) {
        throw new Error(`Chrome fetch() failed: ${verifyResult.error}`);
      }

      log(`  HTTP status: ${verifyResult.status}`);
      log(`  Response: ${verifyResult.text.slice(0, 300)}`);

      let verifyData;
      try {
        verifyData = JSON.parse(verifyResult.text);
      } catch (_) {
        // Try JSONP parse
        const jsonStr = verifyResult.text
          .replace(/^[^(]+\(/, '')
          .replace(/\)\s*;?\s*$/, '');
        verifyData = JSON.parse(jsonStr);
      }

      const errorCode = parseInt(verifyData.errorCode, 10);
      const ticket = verifyData.ticket || null;

      log(`  errorCode: ${errorCode}`);
      log(`  ticket: ${ticket ? ticket.slice(0, 40) + '...' : 'null'}`);

      lastResult = {
        timestamp: new Date().toISOString(),
        attempt: attempt,
        templateMatch: `${cached.caseCount} opcodes, template ${cached.template}`,
        tdcName: tdcName,
        collectLength: collectVal.length,
        verifyErrorCode: errorCode,
        ticket: ticket,
        randstr: verifyData.randstr || null,
        verifyMethod: 'page.evaluate(fetch()) -- Chrome TLS',
        httpStatus: verifyResult.status,
        notes: errorCode === 0
          ? 'SUCCESS: Chrome TLS + standalone token works'
          : `errorCode ${errorCode} -- ${errorCode === 9 ? 'TLS is NOT the cause (still fails with Chrome TLS)' : 'check verify response'}`,
      };

      // Write results
      const outputPath = path.join(PROJECT_ROOT, 'output', 'hybrid-test.json');
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(lastResult, null, 2) + '\n', 'utf8');
      log(`  Results written to ${outputPath}`);

      if (errorCode === 0) {
        log('\n=== SUCCESS ===');
        break;
      }

      log(`  Failed with errorCode ${errorCode}, ${attempt < maxRetries ? 'retrying...' : 'no more retries'}`);
      lastError = new Error(`CAPTCHA verify returned errorCode ${errorCode}`);

    } catch (err) {
      log(`  Error: ${err.message}`);
      lastError = err;

      // Save error result
      lastResult = {
        timestamp: new Date().toISOString(),
        attempt: attempt,
        verifyErrorCode: -1,
        ticket: null,
        verifyMethod: 'page.evaluate(fetch()) -- Chrome TLS',
        error: err.message,
        notes: `Exception on attempt ${attempt}`,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  // Write final results
  if (lastResult) {
    const outputPath = path.join(PROJECT_ROOT, 'output', 'hybrid-test.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(lastResult, null, 2) + '\n', 'utf8');
    log(`Final results written to ${outputPath}`);
  }

  await browser.close().catch(() => {});

  if (lastResult && lastResult.verifyErrorCode === 0) {
    log('\nConclusion: Chrome TLS + standalone collect token = SUCCESS');
    log('This confirms TLS fingerprinting (JA3/JA4) was the cause of errorCode 9 in the headless scraper.');
  } else if (lastResult && lastResult.verifyErrorCode === 9) {
    log('\nConclusion: Chrome TLS + standalone collect token = STILL errorCode 9');
    log('TLS fingerprinting is NOT the sole cause. The issue is likely in the collect token or vData.');
  } else if (lastResult) {
    log(`\nConclusion: errorCode ${lastResult.verifyErrorCode} -- further investigation needed.`);
  }

  return lastResult;
}

// ═══════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════

const opts = parseArgs();

log('Hybrid CAPTCHA Solver');
log(`  headless: ${opts.headless}`);
log(`  maxRetries: ${opts.maxRetries}`);
log('');

solve(opts)
  .then((result) => {
    // Output final JSON to stdout
    console.log(JSON.stringify(result, null, 2));
    process.exit(result && result.verifyErrorCode === 0 ? 0 : 1);
  })
  .catch((err) => {
    log(`Fatal error: ${err.message}`);
    console.error(err);
    process.exit(2);
  });
