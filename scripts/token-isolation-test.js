'use strict';

/**
 * token-isolation-test.js — Token isolation diagnostic.
 *
 * Purpose: Determine whether errorCode 12 is caused by our standalone collect
 * token or by the transport layer (TLS/vData/POST encoding).
 *
 * Approach: Use captcha-solver.js's exact flow (real Chrome drag, Chrome TLS —
 * known to get errorCode 0) but intercept the verify POST and swap the
 * `collect` field with our standalone-generated token.
 *
 *   - If it still passes (errorCode 0) -> token is fine, issue is transport
 *   - If it fails (errorCode 12)       -> token is broken
 *
 * Flags:
 *   --no-swap    Run vanilla (no collect swap) as a control test
 *   --headless   Run headless instead of headful
 *
 * Usage:
 *   node scripts/token-isolation-test.js              # swap mode (headful)
 *   node scripts/token-isolation-test.js --no-swap     # control (no swap)
 *   node scripts/token-isolation-test.js --headless    # swap mode headless
 */

const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { CaptchaClient } = require('../puppeteer/captcha-client');
const { solveSlider } = require('../puppeteer/slide-solver');
const {
  generateDragPath,
  DEFAULT_AID,
  DEFAULT_SLIDE_Y,
  CALIBRATION_OFFSET,
} = require('../puppeteer/captcha-solver');
const { extractTdcName, extractEks } = require('../scraper/tdc-utils');
const TemplateCache = require('../scraper/template-cache');
const {
  generateCollect,
  generateBehavioralEvents,
  buildSlideSd,
} = require('../scraper/collect-generator');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const BASE_URL = 'https://t.captcha.qq.com';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const NAV_TIMEOUT = 30000;
const VERIFY_TIMEOUT = 15000;

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function log(msg) {
  process.stderr.write(`[token-iso] ${msg}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse CLI arguments.
 * @returns {{ noSwap: boolean, headless: boolean }}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    noSwap: args.includes('--no-swap'),
    headless: args.includes('--headless'),
  };
}

/**
 * Build the show page URL (CAPTCHA iframe src).
 *
 * @param {object} session - prehandle session { sess, sid }
 * @param {string} aid - app ID
 * @param {string} userAgent - UA string
 * @returns {string}
 */
function buildShowUrl(session, aid, userAgent) {
  const params = new URLSearchParams({
    aid: aid,
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
  return `${BASE_URL}/cap_union_new_show?${params.toString()}`;
}

/**
 * Replace a field in a URL-encoded POST body string, preserving field order
 * and raw encoding of other fields.
 *
 * @param {string} body - original POST body (application/x-www-form-urlencoded)
 * @param {string} fieldName - field to replace
 * @param {string} newValue - new raw value (already URL-encoded if needed)
 * @returns {string} updated body
 */
function replacePostField(body, fieldName, newValue) {
  const pairs = body.split('&');
  const result = [];
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      result.push(pair);
      continue;
    }
    const key = pair.slice(0, eqIdx);
    if (decodeURIComponent(key) === fieldName) {
      result.push(key + '=' + newValue);
    } else {
      result.push(pair);
    }
  }
  return result.join('&');
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const { noSwap, headless } = parseArgs();
  const mode = noSwap ? 'no-swap (control)' : 'swap (isolation test)';
  log(`Mode: ${mode}`);
  log(`Headless: ${headless}`);

  // Load profile
  const profilePath = path.join(PROJECT_ROOT, 'profiles', 'default.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  log('Profile loaded');

  // Initialize template cache
  const templateCache = new TemplateCache();
  templateCache.load();
  templateCache.seed();
  log('Template cache loaded and seeded');

  // Prehandle (get session via Node HTTP — doesn't need Chrome TLS)
  const aid = DEFAULT_AID;
  const userAgent = DEFAULT_USER_AGENT;
  const client = new CaptchaClient({ aid, referer: 'https://urlsec.qq.com/check.html' });

  log('Step 1: prehandle...');
  const session = await client.prehandle();
  log(`  sess=${session.sess.slice(0, 20)}... sid=${session.sid}`);

  // Build show URL
  const showUrl = buildShowUrl(session, aid, userAgent);
  log(`Step 2: show URL built (${showUrl.length} chars)`);

  // Launch browser
  log('Step 3: launching Chrome with stealth plugin...');
  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
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

  const page = await browser.newPage();
  await page.setUserAgent(userAgent);

  // ── State variables ──
  let capturedTdcSource = null;
  let originalCollectLen = null;
  let standaloneCollectLen = null;
  let tdcName = null;
  let templateMatched = false;
  let swapPerformed = false;
  let verifyTimer;
  let verifyResolve;
  let verifyReject;
  const verifyPromise = new Promise((resolve, reject) => {
    verifyResolve = (data) => { clearTimeout(verifyTimer); resolve(data); };
    verifyReject = (err) => { clearTimeout(verifyTimer); reject(err); };
  });
  const interceptedImages = {};

  // ── Enable request interception BEFORE navigation ──
  await page.setRequestInterception(true);

  // ── Request interceptor ──
  page.on('request', async (request) => {
    const url = request.url();

    // Intercept the verify POST
    if (url.includes('cap_union_new_verify') && request.method() === 'POST') {
      const postData = request.postData() || '';
      log('');
      log('========== VERIFY POST INTERCEPTED ==========');
      log(`  POST body length: ${postData.length} chars`);

      // Parse collect from original body
      const collectMatch = postData.match(/(?:^|&)collect=([^&]*)/);
      const originalCollectRaw = collectMatch ? collectMatch[1] : '';
      originalCollectLen = originalCollectRaw.length;
      log(`  Original collect (URL-encoded) length: ${originalCollectLen}`);
      log(`  Original collect first 80 chars: ${originalCollectRaw.slice(0, 80)}...`);

      if (noSwap) {
        log('  --no-swap: passing through without modification');
        request.continue();
        return;
      }

      // ── Swap mode: generate standalone collect ──
      try {
        if (!capturedTdcSource) {
          log('  WARNING: tdc.js source not captured yet! Cannot generate standalone token.');
          log('  Falling through without swap.');
          request.continue();
          return;
        }

        // Extract TDC_NAME
        tdcName = extractTdcName(capturedTdcSource);
        log(`  TDC_NAME: ${tdcName || 'null'}`);

        // Look up XTEA params
        let cached = templateCache.lookup(tdcName);
        if (!cached) {
          log(`  TDC_NAME not in cache, trying structural lookup...`);
          try {
            const { parseVmFunction } = require('../pipeline/vm-parser');
            const vmInfo = parseVmFunction(capturedTdcSource);
            log(`  Parsed VM: ${vmInfo.caseCount} opcodes`);
            cached = templateCache.lookupByStructure(vmInfo.caseCount);
            if (cached) {
              templateCache.store(tdcName, cached);
              log(`  Matched template ${cached.template} by structure`);
            }
          } catch (parseErr) {
            log(`  VM parse failed: ${parseErr.message}`);
          }
        }

        if (!cached) {
          log('  ERROR: No template match found. Cannot generate standalone token.');
          log('  Falling through without swap.');
          request.continue();
          return;
        }

        templateMatched = true;
        log(`  Template: ${cached.template}, opcodes: ${cached.caseCount}`);

        const xteaParams = {
          key: cached.key,
          delta: cached.delta,
          rounds: cached.rounds,
          keyModConstants: cached.keyModConstants,
          keyMods: cached.keyMods || null,
        };

        // Extract eks
        const eks = extractEks(capturedTdcSource);
        log(`  eks: ${eks ? eks.slice(0, 30) + '...' : 'null'}`);

        // Parse ans from POST body to get slide answer
        const ansMatch = postData.match(/(?:^|&)ans=([^&]*)/);
        const ansRaw = ansMatch ? decodeURIComponent(ansMatch[1]) : '0,0;';
        log(`  ans from POST: ${ansRaw}`);
        const ansParts = ansRaw.replace(';', '').split(',');
        const xAnswer = parseInt(ansParts[0], 10) || 0;
        const yAnswer = parseInt(ansParts[1], 10) || 0;

        // Parse nonce from POST body
        const nonceMatch = postData.match(/(?:^|&)nonce=([^&]*)/);
        const nonce = nonceMatch ? decodeURIComponent(nonceMatch[1]) : '';

        // Generate behavioral events and slide sd
        const now = Date.now();
        const behavioralEvents = generateBehavioralEvents(xAnswer, yAnswer, now);

        // Build slideValue array from behavioral events
        const slideValueArray = [];
        const cursorViewportY = 800 + Math.floor(Math.random() * 30);
        let firstMove = true;
        let prevTime = null;
        for (const ev of behavioralEvents) {
          if (ev[0] === 1) { // mousemove
            if (firstMove) {
              const firstDt = Math.floor(Math.random() * 60 + 60);
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
          { trycnt: 1, refreshcnt: 0 }
        );

        // Generate standalone collect token
        const nowSec = Math.round(Date.now() / 1000);
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
          appid: aid,
          nonce: nonce,
          sdOverride: slideSd,
          cdFieldOrder: cached.cdFieldOrder || null,
          behavioralEvents: behavioralEvents,
          timestamp: now,
          serializationDiffs: cached.serializationDiffs || null,
          headerSplit: cached.headerSplit || null,
          singleBlob: true,
        });

        // collectEncoded is URL-encoded (%2B, %2F, %3D).
        // Decode to raw base64 — the real POST body uses raw base64 for collect.
        let collectDecoded;
        try {
          collectDecoded = decodeURIComponent(collectEncoded);
        } catch (_) {
          collectDecoded = collectEncoded;
        }
        const newTlg = String(collectDecoded.length);
        standaloneCollectLen = collectDecoded.length;

        // Decode original collect for fair length comparison
        const originalCollectDecoded = collectMatch
          ? originalCollectRaw  // already raw base64 in POST body
          : '';

        log(`  Original collect (raw base64) length: ${originalCollectDecoded.length}`);
        log(`  Standalone collect (raw base64) length: ${standaloneCollectLen}`);
        log(`  Length delta: ${originalCollectDecoded.length - standaloneCollectLen} chars`);
        log(`  Standalone collect first 80 chars: ${collectDecoded.slice(0, 80)}...`);
        log(`  New tlg: ${newTlg}`);

        // ── Dump both tokens to output/token-isolation/ ──
        try {
          const isoDir = path.join(PROJECT_ROOT, 'output', 'token-isolation');
          fs.mkdirSync(isoDir, { recursive: true });

          // Parse all POST fields for the original dump
          const postFields = {};
          for (const pair of postData.split('&')) {
            const eqIdx = pair.indexOf('=');
            if (eqIdx === -1) continue;
            const k = decodeURIComponent(pair.slice(0, eqIdx));
            const v = pair.slice(eqIdx + 1);
            postFields[k] = v;
          }

          const nowMs = Date.now();

          fs.writeFileSync(
            path.join(isoDir, 'original.json'),
            JSON.stringify({
              tdcName: tdcName || null,
              collectRaw: originalCollectDecoded,
              collectLength: originalCollectDecoded.length,
              timestamp: nowMs,
              postFields: postFields,
            }, null, 2),
            'utf8'
          );

          fs.writeFileSync(
            path.join(isoDir, 'standalone.json'),
            JSON.stringify({
              tdcName: tdcName || null,
              collectRaw: collectDecoded,
              collectLength: collectDecoded.length,
              timestamp: nowMs,
              xteaParams: {
                key: xteaParams.key,
                delta: xteaParams.delta,
                rounds: xteaParams.rounds,
                keyMods: xteaParams.keyMods || xteaParams.keyModConstants,
              },
            }, null, 2),
            'utf8'
          );

          log(`  Dumped tokens to ${isoDir}/`);
        } catch (dumpErr) {
          log(`  WARNING: Failed to dump tokens: ${dumpErr.message}`);
        }

        // Replace collect and tlg in the POST body.
        // The real POST body contains raw base64 for collect (with literal +, /, =).
        // Our generateCollect returns URL-encoded form (%2B, %2F, %3D), so we must
        // use the decoded form (collectDecoded) to match the real format.
        let newBody = replacePostField(postData, 'collect', collectDecoded);
        newBody = replacePostField(newBody, 'tlg', newTlg);

        log(`  New POST body length: ${newBody.length} chars`);
        log('========== SWAP COMPLETE ==========');
        log('');

        swapPerformed = true;
        request.continue({ postData: newBody });
      } catch (err) {
        log(`  ERROR during swap: ${err.message}`);
        log(`  Stack: ${err.stack}`);
        log('  Falling through without swap.');
        request.continue();
      }
      return;
    }

    // All other requests: pass through
    request.continue();
  });

  // ── Response interceptor: images ──
  page.on('response', async (response) => {
    const url = response.url();
    try {
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

      // ── Capture tdc.js source ──
      if (url.includes('/tdc.js') || url.includes('tdc.js?')) {
        const tdcText = await response.text();
        if (tdcText.length > 1000) {
          capturedTdcSource = tdcText;
          log(`  Intercepted tdc.js source: ${tdcText.length} chars`);
        }
      }

      // ── Capture verify response ──
      if (url.includes('cap_union_new_verify')) {
        const text = await response.text();
        log(`  Verify response: ${text.slice(0, 200)}`);
        try {
          const data = JSON.parse(text);
          verifyResolve(data);
        } catch (_) {
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
    } catch (_) {
      // response.buffer() can fail for redirects — ignore
    }
  });

  // ── Navigate to show page ──
  log('Step 4: navigating to show page...');
  await page.goto(showUrl, {
    waitUntil: 'networkidle2',
    timeout: NAV_TIMEOUT,
  });
  log('  Show page loaded');

  // ── Wait for images ──
  log('Step 5: waiting for images...');
  const imageWaitStart = Date.now();
  while ((!interceptedImages.bg || !interceptedImages.slice) && Date.now() - imageWaitStart < 10000) {
    await sleep(200);
  }

  if (!interceptedImages.bg || !interceptedImages.slice) {
    log('ERROR: Failed to intercept CAPTCHA images');
    await browser.close();
    process.exit(1);
  }

  // ── Solve slider ──
  log('Step 6: solving slide puzzle...');
  const rawOffset = await solveSlider(interceptedImages.bg, interceptedImages.slice);

  // Dynamic ratio from #slideBg element
  let ratio = 0.5;
  try {
    const dynamicRatio = await page.evaluate(() => {
      const bgEl = document.querySelector('#slideBg');
      if (bgEl && bgEl.naturalWidth > 0) {
        return bgEl.getBoundingClientRect().width / bgEl.naturalWidth;
      }
      return null;
    });
    if (dynamicRatio !== null && dynamicRatio > 0) {
      ratio = dynamicRatio;
      log(`  Dynamic ratio from #slideBg: ${ratio.toFixed(4)}`);
    } else {
      log(`  #slideBg not found, using fallback ratio=${ratio}`);
    }
  } catch (err) {
    log(`  Failed to read #slideBg ratio: ${err.message}`);
  }

  const cssOffset = Math.round(rawOffset * ratio) + CALIBRATION_OFFSET;
  log(`  raw=${rawOffset} -> css=${cssOffset} (ratio=${ratio.toFixed(4)}, calibration=${CALIBRATION_OFFSET})`);

  // ── Perform drag ──
  log('Step 7: performing mouse drag...');
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
        log(`  Found slider: ${sel}`);
        break;
      }
    } catch (_) {
      // Try next
    }
  }

  if (!sliderEl) {
    log('ERROR: Could not find slider element');
    await browser.close();
    process.exit(1);
  }

  await sliderEl.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await sleep(200);

  const box = await sliderEl.boundingBox();
  if (!box) {
    log('ERROR: Slider has no bounding box');
    await browser.close();
    process.exit(1);
  }

  log(`  Slider box: x=${box.x.toFixed(0)} y=${box.y.toFixed(0)} w=${box.width.toFixed(0)} h=${box.height.toFixed(0)}`);

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const endX = startX + cssOffset;
  const endY = startY + (Math.random() - 0.5) * 4;

  log(`  Dragging: (${startX.toFixed(0)},${startY.toFixed(0)}) -> (${endX.toFixed(0)},${endY.toFixed(0)})`);

  const dragPath = generateDragPath(startX, startY, endX, endY);

  await page.mouse.move(startX, startY);
  await sleep(100 + Math.random() * 100);
  await page.mouse.down();
  await sleep(50 + Math.random() * 50);

  for (const point of dragPath) {
    await page.mouse.move(point.x, point.y);
    await sleep(point.delay);
  }

  await sleep(50 + Math.random() * 100);
  await page.mouse.up();
  log('  Drag complete');
  await sleep(500);

  // ── Wait for verify response ──
  log('Step 8: waiting for verify response...');
  verifyTimer = setTimeout(() => {
    verifyReject(new Error('Verify response timeout'));
  }, VERIFY_TIMEOUT);

  let verifyData;
  try {
    verifyData = await verifyPromise;
  } catch (err) {
    log(`ERROR: ${err.message}`);
    await browser.close();
    process.exit(1);
  }

  const errorCode = parseInt(verifyData.errorCode, 10);

  // ── Report ──
  const sep = '='.repeat(56);
  log('');
  log(sep);
  log(`RESULT: errorCode = ${errorCode}`);
  log(`Mode: ${noSwap ? 'no-swap (control)' : 'swap (isolation test)'}`);
  log(`Original collect length (URL-encoded): ${originalCollectLen || 'N/A'}`);
  if (!noSwap) {
    log(`Standalone collect length (URL-encoded): ${standaloneCollectLen || 'N/A'}`);
  }
  log(`TDC_NAME: ${tdcName || 'N/A'}`);
  log(`Template matched: ${templateMatched ? 'yes' : 'no'}`);
  log('');
  if (noSwap) {
    if (errorCode === 0) {
      log('CONCLUSION: Control test PASSED (errorCode 0).');
      log('  Chrome flow works. Ready to test with --swap (default mode).');
    } else {
      log(`CONCLUSION: Control test FAILED (errorCode ${errorCode}).`);
      log('  Chrome flow itself is broken. Fix this before testing token swap.');
    }
  } else if (!swapPerformed) {
    log('CONCLUSION: SWAP DID NOT HAPPEN.');
    log(`  Template "${tdcName}" not in cache — could not generate standalone token.`);
    log('  The original browser token went through unmodified.');
    log('  This result tells us nothing about our token. Re-run until a known template is served.');
  } else {
    if (errorCode === 0) {
      log('CONCLUSION: Standalone token ACCEPTED (errorCode 0).');
      log('  -> Token generation is CORRECT.');
      log('  -> The issue is in the TRANSPORT layer (TLS/vData/POST encoding).');
    } else if (errorCode === 12) {
      log('CONCLUSION: Standalone token REJECTED (errorCode 12).');
      log('  -> Token generation is BROKEN.');
      log('  -> The issue is in the COLLECT token itself, not transport.');
    } else {
      log(`CONCLUSION: Unexpected errorCode ${errorCode}.`);
      log('  This is neither the expected pass (0) nor the expected reject (12).');
      log('  May indicate a slider offset issue or other problem.');
    }
  }
  log(sep);

  // Output structured result to stdout
  const result = {
    errorCode,
    mode: noSwap ? 'no-swap' : 'swap',
    swapPerformed,
    originalCollectLen,
    standaloneCollectLen: noSwap ? null : standaloneCollectLen,
    tdcName,
    templateMatched,
    ticket: verifyData.ticket || null,
    randstr: verifyData.randstr || null,
    raw: verifyData,
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');

  await browser.close();
  log('Browser closed. Done.');
}

// Only run main when executed directly (not when required for testing)
if (require.main === module) {
  main().catch((err) => {
    log(`FATAL: ${err.message}`);
    log(err.stack);
    process.exit(1);
  });
}

module.exports = {
  replacePostField,
  buildShowUrl,
  parseArgs,
};
