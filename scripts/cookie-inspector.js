'use strict';

/**
 * cookie-inspector.js — Puppeteer cookie capture at each CAPTCHA flow step.
 *
 * Runs a single CAPTCHA solve (baseline: Chrome's real collect) and captures
 * Chrome's full cookie state via CDP at 4 checkpoints:
 *   1. after_prehandle   — after Node.js CaptchaClient prehandle (+ client cookie jar)
 *   2. after_show_page   — after Chrome navigates to the show page
 *   3. after_tdc_ready   — after TDC.getData() returns
 *   4. after_verify      — after the verify POST response
 *
 * Also captures every Set-Cookie header received during the flow.
 *
 * Usage:
 *   node scripts/cookie-inspector.js
 *   node scripts/cookie-inspector.js --headful
 *   node scripts/cookie-inspector.js --retries 5
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { CaptchaClient } = require('../tools/captcha-solver/captcha-client');
const { solveSlider } = require('../tools/captcha-solver/slide-solver');
const { extractTdcName, extractEks } = require('../tools/scraper/tdc-utils');
const { parseVmFunction } = require('../tools/porting-pipeline/vm-parser');
const { mapOpcodes } = require('../tools/porting-pipeline/opcode-mapper');
const { extractKey } = require('../tools/porting-pipeline/key-extractor');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const BASE_URL = 'https://t.captcha.qq.com';
const DEFAULT_AID = '2046626881';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const NAV_TIMEOUT = 30000;
const MAX_RETRIES = 5;

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function log(msg) {
  process.stderr.write(`[cookie-inspector] ${msg}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { headless: true, maxRetries: MAX_RETRIES };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headful') opts.headless = false;
    if (args[i] === '--retries' && args[i + 1]) opts.maxRetries = parseInt(args[++i], 10);
  }
  return opts;
}

// ═══════════════════════════════════════════════════════════════════════
// CDP Cookie Instrumentation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Snapshot all Chrome cookies via CDP.
 * @param {object} cdp - CDP session
 * @param {string} label - Checkpoint label
 * @returns {object} Cookie snapshot
 */
async function snapshotCookies(cdp, label) {
  const { cookies } = await cdp.send('Network.getAllCookies');
  return {
    label,
    timestamp: new Date().toISOString(),
    count: cookies.length,
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value.slice(0, 80) + (c.value.length > 80 ? '...' : ''),
      domain: c.domain,
      path: c.path,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
      expires: c.expires,
      size: c.size,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Main Flow
// ═══════════════════════════════════════════════════════════════════════

async function run(opts) {
  const { headless, maxRetries } = opts;
  const userAgent = DEFAULT_USER_AGENT;

  // Load shared resources
  const jqueryPath = path.join(PROJECT_ROOT, 'sample', 'slide-jy.js');
  if (!fs.existsSync(jqueryPath)) {
    throw new Error('sample/slide-jy.js not found -- vData generation will fail');
  }
  const jquerySource = fs.readFileSync(jqueryPath, 'utf8');
  log(`jQuery loaded (${jquerySource.length} chars)`);

  const vmSlidePath = path.join(PROJECT_ROOT, 'sample', 'vm_slide.js');
  if (!fs.existsSync(vmSlidePath)) {
    throw new Error('sample/vm_slide.js not found -- vData generation will fail');
  }
  const vmSlideSource = fs.readFileSync(vmSlidePath, 'utf8');
  log(`vm-slide loaded (${vmSlideSource.length} chars)`);

  // Launch browser
  log('Launching Chrome with stealth plugin...');
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

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (attempt > 1) {
      log(`\nRetry ${attempt}/${maxRetries}...`);
      await sleep(3000);
    }

    const page = await browser.newPage();
    await page.setUserAgent(userAgent);

    // ── Create CDP session and enable Network ──
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');

    // Track current step for Set-Cookie tagging
    let currentStep = 'init';
    const setCookieLog = [];

    // Listen for Set-Cookie headers on every response
    cdp.on('Network.responseReceivedExtraInfo', (params) => {
      const headers = params.headers || {};
      const setCookie = headers['set-cookie'] || headers['Set-Cookie'];
      if (setCookie) {
        setCookieLog.push({
          requestId: params.requestId,
          header: setCookie,
          step: currentStep,
          source: 'responseReceivedExtraInfo',
        });
      }
    });

    // Also correlate requestId -> URL via Network.requestWillBeSent
    const requestUrlMap = {};
    cdp.on('Network.requestWillBeSent', (params) => {
      requestUrlMap[params.requestId] = params.request.url;
    });

    // Also capture Set-Cookie from regular Network.responseReceived headers
    cdp.on('Network.responseReceived', (params) => {
      const headers = params.response.headers || {};
      const setCookie = headers['set-cookie'] || headers['Set-Cookie'];
      if (setCookie) {
        setCookieLog.push({
          requestId: params.requestId,
          url: params.response.url,
          header: setCookie,
          step: currentStep,
          source: 'responseReceived',
        });
      }
    });

    try {
      log(`\n${'='.repeat(60)}`);
      log(`Attempt ${attempt}/${maxRetries}`);
      log('='.repeat(60));

      // ── Step 1: Prehandle via Node.js CaptchaClient ──
      log('  [1] Prehandle (Node.js HTTP)...');
      currentStep = 'prehandle';
      const client = new CaptchaClient({
        aid: DEFAULT_AID,
        referer: 'https://urlsec.qq.com/',
      });
      const session = await client.prehandle();
      log(`    sess=${session.sess.slice(0, 20)}... sid=${session.sid}`);

      // Dump CaptchaClient's cookie jar
      const captchaClientCookies = {};
      for (const [name, value] of client.cookieJar.cookies) {
        captchaClientCookies[name] = value;
      }
      log(`    CaptchaClient cookies: ${Object.keys(captchaClientCookies).length} cookies`);
      for (const [name, value] of Object.entries(captchaClientCookies)) {
        log(`      ${name}=${value.slice(0, 60)}${value.length > 60 ? '...' : ''}`);
      }

      // Snapshot Chrome cookies (should be empty -- Chrome hasn't visited anything yet)
      const afterPrehandle = await snapshotCookies(cdp, 'after_prehandle');
      log(`    Chrome cookies after prehandle: ${afterPrehandle.count}`);

      // ── Step 2: Navigate to show page ──
      log('  [2] Navigate to show page...');
      currentStep = 'show_page';

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

      // Set up response interceptors for tdc.js, images, show config
      const interceptedImages = {};
      let capturedTdcSource = null;
      let capturedShowConfig = null;

      page.on('response', async (response) => {
        const url = response.url();
        try {
          if (url.includes('/hycdn') || url.includes('hycdn.cn')) {
            const buffer = await response.buffer();
            if (buffer.length > 1000) {
              if (url.includes('img_index=1') || url.includes('index=1')) {
                interceptedImages.bg = buffer;
              } else if (url.includes('img_index=2') || url.includes('index=2')) {
                interceptedImages.slice = buffer;
              } else if (!interceptedImages.bg) {
                interceptedImages.bg = buffer;
              } else if (!interceptedImages.slice) {
                interceptedImages.slice = buffer;
              }
            }
          }

          if (url.includes('/tdc.js') || url.includes('tdc.js?')) {
            const text = await response.text();
            if (text.length > 1000) {
              capturedTdcSource = text;
            }
          }

          if (url.includes('cap_union_new_show') && response.status() === 200) {
            try {
              capturedShowConfig = await response.text();
            } catch (_) { /* ignore */ }
          }
        } catch (_) {
          // response.buffer() can fail for redirects etc.
        }
      });

      await page.goto(showUrl, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });

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

      // Extract show config values
      let nonce = '';
      let vsig = '';
      let websig = '';
      let subcapclass = '';
      let spt = '0';
      let showSess = session.sess;
      if (capturedShowConfig) {
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
        const sptMatch = capturedShowConfig.match(/["']?spt["']?\s*:\s*["']([^"']+)["']/);
        if (sptMatch) spt = sptMatch[1];
      }
      log(`    nonce=${nonce}, vsig=${vsig.slice(0, 10)}..., subcapclass=${subcapclass}`);

      // Snapshot Chrome cookies after show page
      const afterShowPage = await snapshotCookies(cdp, 'after_show_page');
      log(`    Chrome cookies after show page: ${afterShowPage.count}`);
      for (const c of afterShowPage.cookies) {
        log(`      ${c.name} (${c.domain}) = ${c.value.slice(0, 40)}...`);
      }

      // ── Step 3: Wait for TDC, capture Chrome's collect ──
      log('  [3] Wait for TDC.getData()...');
      currentStep = 'tdc_ready';

      let tdcAvailable = false;
      let chromeCollect = null;
      const tdcWaitStart = Date.now();
      while (!tdcAvailable && Date.now() - tdcWaitStart < 15000) {
        tdcAvailable = await page.evaluate(() => typeof window.TDC !== 'undefined');
        if (!tdcAvailable) await sleep(200);
      }

      if (tdcAvailable) {
        const chromeGetData = await page.evaluate(() => {
          try {
            if (window.TDC && typeof window.TDC.getData === 'function') {
              const r = window.TDC.getData(true);
              return { collect: r, ok: true };
            }
            return { ok: false, reason: 'TDC.getData not available' };
          } catch (err) {
            return { ok: false, reason: err.message };
          }
        });

        if (chromeGetData.ok && chromeGetData.collect) {
          chromeCollect = chromeGetData.collect;
          log(`    Chrome collect: ${chromeCollect.length} chars`);
        } else {
          log(`    Chrome TDC.getData() failed: ${chromeGetData.reason || 'empty'}`);
        }
      } else {
        log('    WARNING: TDC not available after 15s');
      }

      // Snapshot Chrome cookies after TDC ready
      const afterTdcReady = await snapshotCookies(cdp, 'after_tdc_ready');
      log(`    Chrome cookies after TDC ready: ${afterTdcReady.count}`);

      // ── Step 4: Extract TDC_NAME + eks ──
      log('  [4] Extract TDC_NAME + eks...');
      const tdcName = extractTdcName(capturedTdcSource);
      if (!tdcName) throw new Error('Could not extract TDC_NAME');
      const eks = extractEks(capturedTdcSource);
      log(`    TDC_NAME: ${tdcName}, eks: ${eks ? eks.slice(0, 20) + '...' : 'null'}`);

      // ── Step 5: Pipeline — parse VM, map opcodes, extract key ──
      log('  [5] Pipeline (parse -> map -> extract key)...');

      let vmInfo;
      try {
        vmInfo = parseVmFunction(capturedTdcSource);
        log(`    Parsed VM: ${vmInfo.caseCount} opcodes`);
      } catch (e) {
        throw new Error(`VM parser failed: ${e.message}`);
      }

      let mapResult;
      try {
        mapResult = mapOpcodes(vmInfo, capturedTdcSource);
        log(`    Mapped: ${Object.keys(mapResult.opcodeTable).length} opcodes`);
      } catch (e) {
        throw new Error(`Opcode mapper failed: ${e.message}`);
      }

      const tmpFile = path.join(os.tmpdir(), `tdc-cookie-${Date.now()}.js`);
      let keyResult;
      try {
        fs.writeFileSync(tmpFile, capturedTdcSource, 'utf8');
        keyResult = await extractKey(tmpFile, mapResult.opcodeTable, vmInfo.variables);
      } finally {
        try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
      }

      const xteaParams = {
        key: keyResult.key,
        delta: keyResult.delta,
        rounds: keyResult.rounds,
        keyMods: keyResult.keyMods || [0, 0, 0, 0],
      };

      let template;
      if (vmInfo.caseCount === 95) template = 'A';
      else if (vmInfo.caseCount === 94) template = 'B';
      else if (vmInfo.caseCount === 100) template = 'C';
      else template = `unknown-${vmInfo.caseCount}`;

      log(`    Key: [${keyResult.key.map((k) => '0x' + (k >>> 0).toString(16).padStart(8, '0')).join(', ')}]`);
      log(`    Template: ${template}`);

      // ── Step 6: Solve slider ──
      log('  [6] Solve slider...');
      const rawOffset = await solveSlider(interceptedImages.bg, interceptedImages.slice);
      const xAnswer = rawOffset;
      const yAnswer = Math.floor(parseInt(spt, 10)) || 0;
      const ans = `${xAnswer},${yAnswer};`;
      log(`    ans: ${ans}`);

      // ── Step 7: Build POST fields with Chrome's real collect ──
      log('  [7] Build POST fields...');
      if (!chromeCollect) {
        throw new Error('Chrome collect not available -- cannot proceed');
      }

      // URL-decode if needed
      let collectVal = chromeCollect;
      if (collectVal.includes('%')) {
        try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* leave as-is */ }
      }

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

      // ── Step 8: Generate vData via Chrome ──
      log('  [8] Generate vData via Chrome...');
      let vData;
      let serializedBody;
      const vdataPage = await browser.newPage();
      await vdataPage.setUserAgent(userAgent);
      try {
        await vdataPage.goto('https://t.captcha.qq.com/favicon.ico', {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        }).catch(() => {});

        const chromeResult = await vdataPage.evaluate(
          (postFieldsJson, jqSrc, vmSlideSrc) => {
            return new Promise((resolve, reject) => {
              try {
                const debugLog = [];

                let capturedBody = null;
                const origOpen = XMLHttpRequest.prototype.open;
                const origSend = XMLHttpRequest.prototype.send;

                XMLHttpRequest.prototype.open = function() {
                  debugLog.push('XHR.open: ' + Array.from(arguments).join(', '));
                  return origOpen.apply(this, arguments);
                };

                XMLHttpRequest.prototype.send = function(body) {
                  debugLog.push('XHR.send, body length: ' + (body ? body.length : 'null'));
                  capturedBody = body;
                };

                if (!window.jQuery) {
                  try {
                    (new Function(jqSrc))();
                    debugLog.push('jQuery loaded');
                  } catch (jqErr) {
                    debugLog.push('jQuery load error: ' + jqErr.message);
                  }
                }

                try {
                  (new Function(vmSlideSrc))();
                  debugLog.push('vm-slide loaded');
                } catch (vmErr) {
                  debugLog.push('vm-slide load error: ' + vmErr.message);
                }

                const postFields = JSON.parse(postFieldsJson);

                try {
                  jQuery.ajax({
                    type: 'POST',
                    url: '/cap_union_new_verify',
                    data: postFields,
                    timeout: 15000,
                    error: function() {},
                  });
                  debugLog.push('jQuery.ajax called');
                } catch (ajaxErr) {
                  debugLog.push('jQuery.ajax exception: ' + ajaxErr.message);
                }

                XMLHttpRequest.prototype.open = origOpen;
                XMLHttpRequest.prototype.send = origSend;

                if (!capturedBody) {
                  reject(new Error('XHR.send never called -- debug: ' + debugLog.join(' | ')));
                  return;
                }

                const vdataIdx = capturedBody.indexOf('&vData=');
                const vDataVal = vdataIdx >= 0 ? capturedBody.substring(vdataIdx + 7) : '';
                const serialBody = vdataIdx >= 0 ? capturedBody.substring(0, vdataIdx) : capturedBody;

                resolve({
                  vData: vDataVal,
                  serializedBody: serialBody,
                  fullBodyLength: capturedBody.length,
                  debug: debugLog.join(' | '),
                });
              } catch (err) {
                reject(new Error(err.message || String(err)));
              }
            });
          },
          JSON.stringify(postFields),
          jquerySource,
          vmSlideSource
        );

        if (!chromeResult.vData) {
          throw new Error('Chrome vData generation returned empty vData');
        }

        vData = chromeResult.vData;
        serializedBody = chromeResult.serializedBody;
        log(`    vData: ${vData.length} chars`);
      } finally {
        await vdataPage.close().catch(() => {});
      }

      const finalBody = serializedBody + '&vData=' + vData;
      log(`    Final body: ${finalBody.length} chars`);

      // ── Step 9: Submit verify via Chrome fetch() ──
      log('  [9] Submit verify via Chrome fetch()...');
      currentStep = 'verify';

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
      log('  [10] Parse result...');
      if (verifyResult.error) {
        throw new Error(`Chrome fetch() failed: ${verifyResult.error}`);
      }

      log(`    HTTP ${verifyResult.status}`);
      log(`    Response: ${verifyResult.text.slice(0, 300)}`);

      let verifyData;
      try {
        verifyData = JSON.parse(verifyResult.text);
      } catch (_) {
        const jsonStr = verifyResult.text
          .replace(/^[^(]+\(/, '')
          .replace(/\)\s*;?\s*$/, '');
        verifyData = JSON.parse(jsonStr);
      }

      const errorCode = parseInt(verifyData.errorCode, 10);
      const ticket = verifyData.ticket || null;

      log(`    errorCode: ${errorCode}`);
      log(`    ticket: ${ticket ? ticket.slice(0, 40) + '...' : 'null'}`);

      // Snapshot Chrome cookies after verify
      const afterVerify = await snapshotCookies(cdp, 'after_verify');
      log(`    Chrome cookies after verify: ${afterVerify.count}`);
      for (const c of afterVerify.cookies) {
        log(`      ${c.name} (${c.domain}) = ${c.value.slice(0, 40)}...`);
      }

      // ── Enrich setCookieLog with URLs ──
      for (const entry of setCookieLog) {
        entry.url = requestUrlMap[entry.requestId] || '(unknown)';
      }

      // ── Write output ──
      const output = {
        timestamp: new Date().toISOString(),
        attempt: attempt,
        template: template,
        tdcName: tdcName,
        steps: {
          after_prehandle: {
            captchaClientCookies: captchaClientCookies,
            chromeCookies: afterPrehandle,
          },
          after_show_page: {
            chromeCookies: afterShowPage,
          },
          after_tdc_ready: {
            chromeCookies: afterTdcReady,
          },
          after_verify: {
            chromeCookies: afterVerify,
          },
        },
        setCookieLog: setCookieLog,
        verifyResult: {
          errorCode: errorCode,
          httpStatus: verifyResult.status,
          ticket: ticket,
          randstr: verifyData.randstr || null,
        },
      };

      const outputDir = path.join(PROJECT_ROOT, 'output', 'phase-59');
      fs.mkdirSync(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, 'puppeteer-cookies.json');
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
      log(`\nOutput written to ${outputPath}`);

      // Summary
      log('\n========== SUMMARY ==========');
      log(`  Template: ${template} (${tdcName})`);
      log(`  CaptchaClient cookies: ${Object.keys(captchaClientCookies).length}`);
      log(`  Chrome cookies after_prehandle: ${afterPrehandle.count}`);
      log(`  Chrome cookies after_show_page: ${afterShowPage.count}`);
      log(`  Chrome cookies after_tdc_ready: ${afterTdcReady.count}`);
      log(`  Chrome cookies after_verify: ${afterVerify.count}`);
      log(`  Set-Cookie headers captured: ${setCookieLog.length}`);
      log(`  errorCode: ${errorCode}`);
      log(`  ticket: ${ticket ? 'present' : 'null'}`);

      await page.close().catch(() => {});
      await browser.close().catch(() => {});
      return output;

    } catch (err) {
      log(`  ERROR: ${err.message}`);
      lastError = err;
      await page.close().catch(() => {});

      // Retry on template/key extraction failures
      const isRetryable = err.message.includes('null') ||
        err.message.includes('key') ||
        err.message.includes('extract') ||
        err.message.includes('map') ||
        err.message.includes('VM parser') ||
        err.message.includes('Opcode mapper');
      if (isRetryable && attempt < maxRetries) {
        log(`    Retryable error, will retry...`);
        continue;
      }

      // Non-retryable or out of retries
      if (attempt >= maxRetries) {
        await browser.close().catch(() => {});
        throw lastError;
      }
    }
  }

  await browser.close().catch(() => {});
  throw lastError || new Error('All retries exhausted');
}

// ═══════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const opts = parseArgs();
  log('Cookie Inspector');
  log(`  headless: ${opts.headless}`);
  log(`  maxRetries: ${opts.maxRetries}`);
  log('');

  try {
    await run(opts);
    process.exit(0);
  } catch (err) {
    log(`\nFATAL: ${err.message}`);
    process.exit(1);
  }
}

main();
