'use strict';

/**
 * tls-experiment.js — Phase 61.1
 *
 * Definitive TLS fingerprint experiment: run the scraper's full CAPTCHA flow
 * to build a verify POST body, then send it two ways:
 *   (A) curl-impersonate-chrome  (BoringSSL, HTTP/2, Chrome TLS fingerprint)
 *   (B) Node.js https.request()  (OpenSSL, HTTP/1.1, scraper's normal path)
 *
 * Each test gets a fresh session. If curl-impersonate gets errorCode 0 while
 * Node.js gets -1, TLS fingerprint is the root cause. If both get -1, TLS is
 * eliminated.
 *
 * Usage:
 *   node scripts/tls-experiment.js [--verbose]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, execFileSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// --- Scraper modules ---
const { CaptchaClient, httpRequest, parseJSONP } = require(
  path.join(PROJECT_ROOT, 'tools', 'captcha-solver', 'captcha-client.js')
);
const { solveSlider } = require(
  path.join(PROJECT_ROOT, 'tools', 'captcha-solver', 'slide-solver.js')
);
const {
  generateCollect,
  generateBehavioralEvents,
  buildSlideSd,
} = require(
  path.join(PROJECT_ROOT, 'tools', 'scraper', 'collect-generator.js')
);
const { buildVDataForPost } = require(
  path.join(PROJECT_ROOT, 'tools', 'vdata-generator', 'for-post.js')
);
const { extractTdcName, extractEks, computeSourceHash } = require(
  path.join(PROJECT_ROOT, 'tools', 'scraper', 'tdc-utils.js')
);
const TemplateCache = require(
  path.join(PROJECT_ROOT, 'tools', 'scraper', 'template-cache.js')
);
const { parseVmSlideUrl } = require(
  path.join(PROJECT_ROOT, 'tools', 'scraper', 'vdata-harness.js')
);

// --- Constants ---
const CURL_BIN = '/usr/local/bin/curl-impersonate-chrome';
const AID = '2046626881';
const REFERER = 'https://urlsec.qq.com/';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const BASE_URL = 'https://t.captcha.qq.com';
const VERIFY_URL = BASE_URL + '/cap_union_new_verify';

const verbose = process.argv.includes('--verbose');

function log(msg) {
  if (verbose) process.stderr.write('[tls-exp] ' + msg + '\n');
}

// --- Profile loaders ---
function loadJsonProfile(relPath) {
  return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relPath), 'utf8'));
}

// --- Serialize POST fields (matches scraper.js line 64) ---
function serializePostFields(fields) {
  const parts = [];
  for (const name of Object.keys(fields)) {
    const value = fields[name];
    parts.push(name + '=' + (value == null ? '' : String(value)));
  }
  return parts.join('&');
}

// ---------------------------------------------------------------------------
// runScraperFlow — full CAPTCHA flow up to building the final POST body/headers
// ---------------------------------------------------------------------------

async function runScraperFlow(templateCache, chromeProfileData, vdataProfile) {
  const client = new CaptchaClient({
    aid: AID,
    referer: REFERER,
    userAgent: USER_AGENT,
  });

  // Step 1: prehandle
  log('prehandle...');
  const session = await client.prehandle();
  log('  sess: ' + session.sess.slice(0, 20) + '...');

  // Step 2: getSig (show page)
  log('getSig...');
  const sig = await client.getSig(session);
  log('  nonce: ' + sig.nonce);

  // Step 3: download images
  log('downloadImages...');
  const { bgBuffer, sliceBuffer } = await client.downloadImages(sig);
  log('  bg: ' + bgBuffer.length + ' bytes, slice: ' + sliceBuffer.length + ' bytes');

  // Step 4: download tdc.js
  log('downloadTdc...');
  const tdcSource = await client.downloadTdc(sig);
  log('  tdc source: ' + tdcSource.length + ' chars');

  // Step 5: extract template info
  const tdcName = extractTdcName(tdcSource);
  if (!tdcName) throw new Error('Could not extract TDC_NAME');
  const sourceHash = computeSourceHash(tdcSource);
  log('  TDC_NAME: ' + tdcName + ', hash: ' + sourceHash);

  let cached = templateCache.lookup(sourceHash);
  if (!cached) {
    // Auto-port via pipeline
    log('  Unknown template — auto-porting...');
    cached = await autoPort(templateCache, sourceHash, tdcSource);
  }
  if (!cached) {
    throw new Error('Unknown template (hash=' + sourceHash + '), auto-port failed');
  }
  log('  Template: ' + cached.template + ', opcodes: ' + cached.caseCount);

  const xteaParams = {
    key: cached.key,
    delta: cached.delta,
    rounds: cached.rounds,
    keyModConstants: cached.keyModConstants,
    keyMods: cached.keyMods || null,
  };

  // Step 6: extract eks
  const eks = extractEks(tdcSource);
  log('  eks: ' + (eks ? eks.slice(0, 20) + '...' : 'null'));

  // Step 7: solve slider
  log('solveSlider...');
  const rawOffset = await solveSlider(bgBuffer, sliceBuffer);
  log('  rawOffset: ' + rawOffset);

  const spt = sig.spt || '0';
  const xAnswer = rawOffset;
  const yAnswer = Math.floor(parseInt(spt, 10)) || 0;
  const ans = xAnswer + ',' + yAnswer + ';';
  log('  ans: ' + ans);

  // Step 8: behavioral events + slide sd
  const now = Date.now();
  const behavioralEvents = generateBehavioralEvents(xAnswer, yAnswer, now);

  const slideValueArray = [];
  const cursorViewportY = 800 + Math.floor(Math.random() * 30);
  let firstMove = true;
  let prevTime = null;
  for (const ev of behavioralEvents) {
    if (ev[0] === 1) {
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
  slideValueArray.push([0, 0, 0]);

  const slideSd = buildSlideSd(
    { x: xAnswer, y: yAnswer },
    slideValueArray,
    { trycnt: 1, refreshcnt: 0 }
  );

  // Step 9: generate collect token (Chrome profile mode)
  log('generateCollect (Chrome profile)...');
  const nowSec = Math.round(now / 1000);
  const cdCanonical = JSON.parse(JSON.stringify(chromeProfileData.cdCanonical));
  cdCanonical[16] = nowSec;
  cdCanonical[22] = 'https://t.captcha.qq.com/cap_union_new_show?rand=' +
    Math.floor(Math.random() * 1e16);
  cdCanonical[52] = nowSec + 2;
  cdCanonical[53] = nowSec;

  const cdFieldOrder = cached.cdFieldOrder || null;
  let cdArray;
  if (cdFieldOrder) {
    const hashPos = cached.hashPosition;
    const profileOrder = chromeProfileData.chromeFieldOrder || [];
    const unmappedPool = [];
    for (let j = 0; j < profileOrder.length; j++) {
      if (profileOrder[j] === -1 && chromeProfileData.cd[j] !== undefined &&
          !Array.isArray(chromeProfileData.cd[j])) {
        unmappedPool.push(chromeProfileData.cd[j]);
      }
    }
    const liveSid = session.sid || sig.sid || '';
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
    cdArray = cdCanonical;
  }

  const collectEncoded = generateCollect(null, xteaParams, {
    cdArrayOverride: cdArray,
    appid: AID,
    nonce: sig.nonce,
    sdOverride: slideSd,
    timestamp: now,
    serializationDiffs: cached.serializationDiffs || null,
    headerSplit: cached.headerSplit || null,
    singleBlob: true,
  });

  let collectVal = collectEncoded;
  if (collectVal.includes('%')) {
    try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* */ }
  }
  log('  collect length: ' + collectVal.length);

  // Step 10: TDC_itoken cookie
  const itokenValue = Math.floor(Math.random() * 0xFFFFFFFF) + '%3A' +
    Math.floor(Date.now() / 1000);
  client.cookieJar.cookies.set('TDC_itoken', itokenValue);
  log('  TDC_itoken: ' + itokenValue);

  // Step 11: build POST fields
  const postFields = {
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
    subsid: sig.showSubsid || '1',
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

  // Step 12: serialize and compute vData
  const serializedBody = serializePostFields(postFields);
  const vData = buildVDataForPost(serializedBody, {
    profile: vdataProfile,
    overrides: { tp: session.sid || sig.sid || '' },
  });
  log('  vData: ' + vData.slice(0, 30) + '...');

  const finalBody = serializedBody + '&vData=' + vData;

  // Step 13: build verify headers (matches captcha-client.js verify())
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Content-Length': String(Buffer.byteLength(finalBody)),
    'User-Agent': USER_AGENT,
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Origin': 'https://t.captcha.qq.com',
    'Referer': sig.showUrl || BASE_URL + '/cap_union_new_show',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'sec-ch-ua': '"Chromium";"v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Cookie': 'TDC_itoken=' + itokenValue,
  };

  return {
    url: VERIFY_URL,
    headers,
    body: finalBody,
    session,
    sig,
    templateOpcodes: cached.caseCount,
    templateName: cached.template,
  };
}

// ---------------------------------------------------------------------------
// Auto-port unknown template (copied from scraper.js)
// ---------------------------------------------------------------------------

async function autoPort(templateCache, sourceHash, tdcSource) {
  log('Auto-porting unknown template: ' + sourceHash);
  const tempFile = path.join(os.tmpdir(), 'tdc-autoport-' + sourceHash + '.js');
  try {
    fs.writeFileSync(tempFile, tdcSource, 'utf8');
    const { stdout } = await new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [path.join(PROJECT_ROOT, 'tools', 'porting-pipeline', 'run.js'), tempFile, '--skip-verify'],
        { cwd: PROJECT_ROOT, timeout: 120000 },
        (err, stdout, stderr) => err ? reject(err) : resolve({ stdout, stderr })
      );
    });
    if (verbose && stdout) {
      for (const line of stdout.split('\n')) {
        if (line.trim()) log('  pipeline: ' + line.trim());
      }
    }
    const stem = path.basename(tempFile, '.js');
    const configPath = path.join(PROJECT_ROOT, 'output', stem, 'pipeline-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const params = {
      template: config.template,
      key: config.xteaParams.key,
      delta: config.xteaParams.delta,
      rounds: config.xteaParams.rounds,
      keyModConstants: config.xteaParams.keyModConstants,
      keyMods: config.xteaParams.keyMods,
      caseCount: config.caseCount,
    };
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
    templateCache.store(sourceHash, params);
    log('Auto-port succeeded (template ' + config.template + ')');
    return templateCache.lookup(sourceHash);
  } catch (err) {
    log('Auto-port failed: ' + (err.stderr || err.message || String(err)));
    return null;
  } finally {
    try { fs.unlinkSync(tempFile); } catch (_) { /* */ }
  }
}

// ---------------------------------------------------------------------------
// sendViaCurl — curl-impersonate-chrome subprocess
// ---------------------------------------------------------------------------

async function sendViaCurl(url, headers, body) {
  const tmpBodyFile = path.join(os.tmpdir(), 'tls-exp-body-' + Date.now() + '.txt');
  fs.writeFileSync(tmpBodyFile, body, 'utf8');

  try {
    const args = [
      '--compressed',
      '-s',       // silent
      '-X', 'POST',
    ];

    // Add all headers as -H flags
    for (const [name, value] of Object.entries(headers)) {
      // Skip Content-Length — curl sets it from the body file
      if (name === 'Content-Length') continue;
      args.push('-H', name + ': ' + value);
    }

    args.push('-d', '@' + tmpBodyFile);
    args.push(url);

    log('curl command: ' + CURL_BIN + ' ' + args.slice(0, 6).join(' ') + ' ...');

    const result = await new Promise((resolve, reject) => {
      execFile(CURL_BIN, args, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error('curl failed: ' + (stderr || err.message)));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });

    log('curl response: ' + result.stdout.slice(0, 200));

    // Parse JSONP/JSON response
    const data = parseJSONP(result.stdout);
    return {
      errorCode: typeof data.errorCode === 'number'
        ? data.errorCode
        : (isNaN(parseInt(data.errorCode, 10)) ? -999 : parseInt(data.errorCode, 10)),
      ticket: data.ticket || '',
      randstr: data.randstr || '',
      rawResponse: result.stdout.slice(0, 500),
    };
  } finally {
    try { fs.unlinkSync(tmpBodyFile); } catch (_) { /* */ }
  }
}

// ---------------------------------------------------------------------------
// sendViaNode — Node.js https.request()
// ---------------------------------------------------------------------------

async function sendViaNode(url, headers, body) {
  const resp = await httpRequest(url, {
    method: 'POST',
    headers: headers,
    body: body,
    timeout: 30000,
  });

  log('node response status: ' + resp.statusCode);
  log('node response body: ' + resp.body.slice(0, 200));

  if (resp.statusCode !== 200) {
    throw new Error('Node.js verify: HTTP ' + resp.statusCode);
  }

  const data = parseJSONP(resp.body);
  return {
    errorCode: typeof data.errorCode === 'number'
      ? data.errorCode
      : (isNaN(parseInt(data.errorCode, 10)) ? -999 : parseInt(data.errorCode, 10)),
    ticket: data.ticket || '',
    randstr: data.randstr || '',
    rawResponse: resp.body.slice(0, 500),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Verify curl-impersonate is available
  let curlVersion;
  try {
    curlVersion = execFileSync(CURL_BIN, ['--version'], { timeout: 5000 })
      .toString().split('\n')[0];
  } catch (err) {
    console.error('ERROR: curl-impersonate-chrome not found at ' + CURL_BIN);
    process.exit(1);
  }
  log('curl version: ' + curlVersion);

  // Load profiles and template cache
  const templateCache = new TemplateCache();
  templateCache.load();
  templateCache.seed();
  log('Template cache loaded and seeded');

  const chromeProfileData = loadJsonProfile('profiles/chrome-fingerprint.json');
  if (!chromeProfileData.cdCanonical || !Array.isArray(chromeProfileData.cdCanonical)) {
    throw new Error('Missing cdCanonical in chrome-fingerprint.json');
  }
  log('Chrome fingerprint profile loaded');

  const vdataProfile = loadJsonProfile('profiles/vdata-browser-default.json');
  log('vData profile loaded');

  const results = [];

  // ── Test A: curl-impersonate-chrome ──
  log('\n=== TEST A: curl-impersonate-chrome ===');
  try {
    const flowA = await runScraperFlow(templateCache, chromeProfileData, vdataProfile);
    log('Flow A complete. Body length: ' + flowA.body.length);

    // Human-like delay
    const delayA = 2000 + Math.floor(Math.random() * 3000);
    log('Human-like delay: ' + delayA + 'ms');
    await new Promise(r => setTimeout(r, delayA));

    const respA = await sendViaCurl(flowA.url, flowA.headers, flowA.body);
    log('Test A result: errorCode=' + respA.errorCode);

    results.push({
      testId: 'A',
      testName: 'curl-impersonate-chrome',
      transport: 'curl-impersonate-chrome (BoringSSL, HTTP/2)',
      errorCode: respA.errorCode,
      ticket: respA.ticket || '',
      templateOpcodes: flowA.templateOpcodes,
      templateName: flowA.templateName,
      bodyLength: flowA.body.length,
      rawResponse: respA.rawResponse,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log('Test A error: ' + err.message);
    results.push({
      testId: 'A',
      testName: 'curl-impersonate-chrome',
      transport: 'curl-impersonate-chrome (BoringSSL, HTTP/2)',
      errorCode: null,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Test B: Node.js https ──
  log('\n=== TEST B: Node.js https ===');
  try {
    const flowB = await runScraperFlow(templateCache, chromeProfileData, vdataProfile);
    log('Flow B complete. Body length: ' + flowB.body.length);

    // Human-like delay
    const delayB = 2000 + Math.floor(Math.random() * 3000);
    log('Human-like delay: ' + delayB + 'ms');
    await new Promise(r => setTimeout(r, delayB));

    const respB = await sendViaNode(flowB.url, flowB.headers, flowB.body);
    log('Test B result: errorCode=' + respB.errorCode);

    results.push({
      testId: 'B',
      testName: 'node-https',
      transport: 'Node.js https (OpenSSL, HTTP/1.1)',
      errorCode: respB.errorCode,
      ticket: respB.ticket || '',
      templateOpcodes: flowB.templateOpcodes,
      templateName: flowB.templateName,
      bodyLength: flowB.body.length,
      rawResponse: respB.rawResponse,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log('Test B error: ' + err.message);
    results.push({
      testId: 'B',
      testName: 'node-https',
      transport: 'Node.js https (OpenSSL, HTTP/1.1)',
      errorCode: null,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Write output ──
  const outputDir = path.join(PROJECT_ROOT, 'output', 'phase-61');
  fs.mkdirSync(outputDir, { recursive: true });

  const output = {
    timestamp: new Date().toISOString(),
    curlVersion: curlVersion,
    nodeVersion: process.version,
    results: results,
  };

  const outputPath = path.join(outputDir, 'tls-experiment.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log('Results written to ' + outputPath);

  // ── Summary ──
  console.log('\n=== TLS Experiment Summary ===');
  for (const r of results) {
    if (r.error) {
      console.log('  ' + r.testId + ' (' + r.testName + '): ERROR — ' + r.error);
    } else {
      console.log('  ' + r.testId + ' (' + r.testName + '): errorCode=' + r.errorCode +
        (r.ticket ? ', ticket=' + r.ticket.slice(0, 30) + '...' : ', no ticket'));
    }
  }

  const aResult = results.find(r => r.testId === 'A');
  const bResult = results.find(r => r.testId === 'B');
  if (aResult && bResult && !aResult.error && !bResult.error) {
    if (aResult.errorCode === 0 && bResult.errorCode !== 0) {
      console.log('\n  CONCLUSION: TLS fingerprint IS the root cause.');
      console.log('  curl-impersonate (Chrome TLS) succeeded; Node.js (OpenSSL) failed.');
    } else if (aResult.errorCode === bResult.errorCode) {
      console.log('\n  CONCLUSION: TLS fingerprint is NOT the differentiator.');
      console.log('  Both transports got the same errorCode (' + aResult.errorCode + ').');
    } else {
      console.log('\n  CONCLUSION: Mixed results — further analysis needed.');
      console.log('  curl errorCode=' + aResult.errorCode + ', node errorCode=' + bResult.errorCode);
    }
  } else {
    console.log('\n  CONCLUSION: Could not compare — one or both tests failed.');
  }
}

main().catch(err => {
  console.error('Fatal error: ' + err.message);
  if (verbose) console.error(err.stack);
  process.exit(1);
});
