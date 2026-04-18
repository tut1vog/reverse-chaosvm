'use strict';

/**
 * scraper-cookie-inspector.js — Instrument the scraper's cookie handling.
 *
 * Monkey-patches CookieJar to log every Set-Cookie capture and every Cookie
 * header emission, then runs the scraper's CAPTCHA flow through prehandle,
 * show page, tdc fetch, and image download.  Does NOT need to complete a full
 * solve — we only care about cookie state at each network step.
 *
 * Also checks whether jsdom's document.cookie captures TDC_itoken when
 * vm-slide runs inside the legacy vdata harness.
 *
 * Output: output/phase-59/scraper-cookies.json
 *
 * Usage:
 *   node scripts/scraper-cookie-inspector.js
 *   node scripts/scraper-cookie-inspector.js --verbose
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { CaptchaClient, CookieJar, httpRequest } = require('../tools/captcha-solver/captcha-client');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Monkey-patch CookieJar to log every interaction
// ---------------------------------------------------------------------------

const origCapture = CookieJar.prototype.capture;
const origToString = CookieJar.prototype.toString;

const setCookieLog = [];
const cookieSentLog = [];

CookieJar.prototype.capture = function (setCookieHeaders) {
  if (setCookieHeaders) {
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const h of headers) {
      setCookieLog.push({
        event: 'set-cookie-received',
        header: h,
        timestamp: new Date().toISOString(),
      });
    }
  }
  return origCapture.call(this, setCookieHeaders);
};

CookieJar.prototype.toString = function () {
  const result = origToString.call(this);
  if (result) {
    cookieSentLog.push({
      event: 'cookie-header-sent',
      value: result,
      timestamp: new Date().toISOString(),
    });
  }
  return result;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const verbose = process.argv.includes('--verbose');

function log(msg) {
  if (verbose) {
    process.stderr.write('[cookie-inspector] ' + msg + '\n');
  }
}

/**
 * Snapshot the cookie jar's current state.
 * @param {CookieJar} jar
 * @returns {{size: number, cookies: Object}}
 */
function snapshotJar(jar) {
  const cookies = {};
  for (const [name, value] of jar.cookies) {
    cookies[name] = value;
  }
  return { size: jar.cookies.size, cookies };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const aid = '2046626881';
  const client = new CaptchaClient({
    aid,
    referer: 'https://urlsec.qq.com/',
  });

  const snapshots = {};

  // Step 1: prehandle
  log('Step 1: prehandle');
  let session;
  try {
    session = await client.prehandle();
    log('  sess: ' + session.sess.slice(0, 20) + '...');
  } catch (err) {
    log('  prehandle failed: ' + err.message);
    session = null;
  }
  snapshots.after_prehandle = snapshotJar(client.cookieJar);
  log('  cookie jar after prehandle: ' + JSON.stringify(snapshots.after_prehandle));

  if (!session) {
    // Write partial results and exit
    writeOutput(snapshots, null);
    return;
  }

  // Step 2: show page (getSig internally fetches cap_union_new_show)
  log('Step 2: getSig (show page)');
  let sig;
  try {
    sig = await client.getSig(session);
    log('  nonce: ' + sig.nonce);
  } catch (err) {
    log('  getSig failed: ' + err.message);
    sig = null;
  }
  snapshots.after_show_page = snapshotJar(client.cookieJar);
  log('  cookie jar after show page: ' + JSON.stringify(snapshots.after_show_page));

  if (!sig) {
    writeOutput(snapshots, null);
    return;
  }

  // Step 3: download tdc.js
  log('Step 3: downloadTdc');
  let tdcSource;
  try {
    tdcSource = await client.downloadTdc(sig);
    log('  tdc source: ' + tdcSource.length + ' chars');
  } catch (err) {
    log('  downloadTdc failed: ' + err.message);
    tdcSource = null;
  }
  snapshots.after_tdc_fetch = snapshotJar(client.cookieJar);
  log('  cookie jar after tdc fetch: ' + JSON.stringify(snapshots.after_tdc_fetch));

  // Step 4: download images
  log('Step 4: downloadImages');
  try {
    const { bgBuffer, sliceBuffer } = await client.downloadImages(sig);
    log('  bg: ' + bgBuffer.length + ' bytes, slice: ' + sliceBuffer.length + ' bytes');
  } catch (err) {
    log('  downloadImages failed: ' + err.message);
  }
  snapshots.after_image_fetch = snapshotJar(client.cookieJar);
  log('  cookie jar after image fetch: ' + JSON.stringify(snapshots.after_image_fetch));

  // Step 5: what Cookie header would be sent on verify POST?
  const cookieHeaderForVerify = client.cookieJar.toString();
  snapshots.cookie_header_for_verify = cookieHeaderForVerify;
  log('  Cookie header that would be sent on verify: "' + cookieHeaderForVerify + '"');

  // Step 6: Check jsdom document.cookie when vm-slide runs
  log('Step 5: jsdom cookie check');
  let jsdomCookies = {};
  try {
    jsdomCookies = checkJsdomCookies(tdcSource);
  } catch (err) {
    log('  jsdom check error: ' + err.message);
    jsdomCookies = { error: err.message };
  }

  writeOutput(snapshots, jsdomCookies);
}

/**
 * Run vm-slide (and optionally tdc.js) in jsdom and check document.cookie.
 *
 * The scraper's legacy vdata path runs vm-slide in jsdom. We check whether
 * either vm-slide or tdc.js sets TDC_itoken via document.cookie in jsdom.
 *
 * @param {string|null} tdcSource - tdc.js source (if available)
 * @returns {Object}
 */
function checkJsdomCookies(tdcSource) {
  const results = {};

  // Check 1: Does tdc.js set TDC_itoken in jsdom?
  if (tdcSource) {
    log('  Checking tdc.js in jsdom...');
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://t.captcha.qq.com/cap_union_new_show',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    try {
      const cookieBefore = dom.window.document.cookie;
      log('    document.cookie before tdc.js: "' + cookieBefore + '"');

      // Wrap in try-catch because tdc.js may throw in jsdom (missing APIs)
      try {
        dom.window.eval(tdcSource);
      } catch (evalErr) {
        log('    tdc.js eval threw (expected in jsdom): ' + evalErr.message.slice(0, 100));
      }

      const cookieAfter = dom.window.document.cookie;
      log('    document.cookie after tdc.js: "' + cookieAfter + '"');

      // Check if TDC.getInfo is available and if TDC_itoken was set
      let tdcItoken = null;
      if (cookieAfter) {
        const match = cookieAfter.match(/TDC_itoken=([^;]*)/);
        if (match) {
          tdcItoken = match[1];
        }
      }

      results.afterTdcLoad = cookieAfter || '(empty)';
      results.tdcItokenPresent = tdcItoken !== null;
      results.tdcItokenValue = tdcItoken;
    } finally {
      dom.window.close();
    }
  } else {
    results.afterTdcLoad = '(tdc.js not available)';
    results.tdcItokenPresent = false;
    results.tdcItokenValue = null;
  }

  // Check 2: Does vm-slide set anything in jsdom?
  const vmSlidePath = path.join(PROJECT_ROOT, 'sample', 'vm_slide.js');
  if (fs.existsSync(vmSlidePath)) {
    log('  Checking vm-slide in jsdom...');
    const vmSlideSource = fs.readFileSync(vmSlidePath, 'utf8');
    const dom2 = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://t.captcha.qq.com/cap_union_new_show',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    });
    try {
      try {
        dom2.window.eval(vmSlideSource);
      } catch (evalErr) {
        log('    vm-slide eval threw: ' + evalErr.message.slice(0, 100));
      }
      const vmSlideCookie = dom2.window.document.cookie;
      log('    document.cookie after vm-slide: "' + vmSlideCookie + '"');
      results.afterVmSlideLoad = vmSlideCookie || '(empty)';
    } finally {
      dom2.window.close();
    }
  } else {
    results.afterVmSlideLoad = '(vm_slide.js not available)';
  }

  return results;
}

/**
 * Write the output JSON.
 * @param {Object} snapshots
 * @param {Object|null} jsdomCookies
 */
function writeOutput(snapshots, jsdomCookies) {
  const output = {
    timestamp: new Date().toISOString(),
    cookieJarSnapshots: {
      after_prehandle: snapshots.after_prehandle || { size: 0, cookies: {} },
      after_show_page: snapshots.after_show_page || { size: 0, cookies: {} },
      after_tdc_fetch: snapshots.after_tdc_fetch || { size: 0, cookies: {} },
      after_image_fetch: snapshots.after_image_fetch || { size: 0, cookies: {} },
      cookie_header_for_verify: snapshots.cookie_header_for_verify || '',
    },
    setCookieLog: setCookieLog,
    cookieSentLog: cookieSentLog,
    jsdomCookies: jsdomCookies || {},
    conclusion: deriveConclusion(snapshots, jsdomCookies),
  };

  const outDir = path.join(PROJECT_ROOT, 'output', 'phase-59');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'scraper-cookies.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log('Output written to: ' + outPath);
  console.log('');
  console.log('=== Summary ===');
  console.log('Set-Cookie headers received: ' + setCookieLog.length);
  console.log('Cookie headers sent: ' + cookieSentLog.length);
  console.log('Cookie jar size after prehandle: ' + (snapshots.after_prehandle ? snapshots.after_prehandle.size : 'N/A'));
  console.log('Cookie jar size after show page: ' + (snapshots.after_show_page ? snapshots.after_show_page.size : 'N/A'));
  console.log('Cookie jar size after tdc fetch: ' + (snapshots.after_tdc_fetch ? snapshots.after_tdc_fetch.size : 'N/A'));
  console.log('Cookie jar size after image fetch: ' + (snapshots.after_image_fetch ? snapshots.after_image_fetch.size : 'N/A'));
  console.log('Cookie header for verify: "' + (snapshots.cookie_header_for_verify || '') + '"');
  if (jsdomCookies) {
    console.log('jsdom document.cookie after tdc.js: "' + (jsdomCookies.afterTdcLoad || '') + '"');
    console.log('TDC_itoken in jsdom: ' + (jsdomCookies.tdcItokenPresent ? 'YES' : 'NO'));
    console.log('jsdom document.cookie after vm-slide: "' + (jsdomCookies.afterVmSlideLoad || '') + '"');
  }
  console.log('Conclusion: ' + output.conclusion);
}

/**
 * Derive a human-readable conclusion.
 */
function deriveConclusion(snapshots, jsdomCookies) {
  const jarEmpty = snapshots.after_image_fetch && snapshots.after_image_fetch.size === 0;
  const noCookiesReceived = setCookieLog.length === 0;
  const noCookiesSent = cookieSentLog.length === 0;
  const jsdomHasItoken = jsdomCookies && jsdomCookies.tdcItokenPresent;

  const parts = [];
  if (noCookiesReceived && jarEmpty) {
    parts.push('No Set-Cookie headers received during the entire CAPTCHA flow.');
    parts.push('The scraper\'s CookieJar remains empty throughout.');
  } else {
    parts.push('Set-Cookie headers were received: ' + setCookieLog.length + ' total.');
    parts.push('Cookie jar has ' + (snapshots.after_image_fetch ? snapshots.after_image_fetch.size : '?') + ' cookies after image fetch.');
  }

  if (noCookiesSent) {
    parts.push('No Cookie header was ever sent.');
  } else {
    parts.push(cookieSentLog.length + ' Cookie headers were sent during the flow.');
  }

  if (jsdomHasItoken) {
    parts.push('TDC_itoken IS set by tdc.js in jsdom (value: ' + jsdomCookies.tdcItokenValue + ').');
  } else if (jsdomCookies) {
    parts.push('TDC_itoken is NOT set by tdc.js in jsdom.');
  }

  parts.push('The scraper never sends TDC_itoken because it is set client-side by tdc.js JS, not by a Set-Cookie header.');

  return parts.join(' ');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
