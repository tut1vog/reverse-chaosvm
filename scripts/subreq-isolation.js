'use strict';

/**
 * subreq-isolation.js — Phase 62 diagnostic
 *
 * Tests which sub-resource fetch(es) cause errorCode to change from 0 to 12.
 * Runs 5 test cases, each with a different combination of extra fetches:
 *   A: No extra fetches (baseline — expect errorCode 0)
 *   B: Only tcaptcha-slide.js (captcha.gtimg.com)
 *   C: Only vm-slide.enc.js (t.captcha.qq.com)
 *   D: Only slide-jy.js (captcha.gtimg.com)
 *   E: Only caplog beacon (t.captcha.qq.com)
 *
 * Each test gets a fresh session.
 * Usage: node scripts/subreq-isolation.js [--verbose]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

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
const { buildPreVerifyBeaconUrl, fireBeacon } = require(
  path.join(PROJECT_ROOT, 'tools', 'scraper', 'caplog-beacon.js')
);

const AID = '2046626881';
const REFERER = 'https://urlsec.qq.com/';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const verbose = process.argv.includes('--verbose');
function log(msg) {
  if (verbose) process.stderr.write('[iso] ' + msg + '\n');
}

function serializePostFields(fields) {
  return Object.keys(fields).map(k => k + '=' + (fields[k] == null ? '' : String(fields[k]))).join('&');
}

function loadJsonProfile(relPath) {
  return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relPath), 'utf8'));
}

async function autoPort(templateCache, sourceHash, tdcSource) {
  const tmpFile = path.join(os.tmpdir(), 'tdc-autoport-' + sourceHash + '.js');
  fs.writeFileSync(tmpFile, tdcSource, 'utf8');
  try {
    await new Promise((resolve, reject) => {
      execFile(process.execPath,
        [path.join(PROJECT_ROOT, 'tools', 'porting-pipeline', 'run.js'), tmpFile, '--skip-verify'],
        { cwd: PROJECT_ROOT, timeout: 120000 },
        (err, stdout, stderr) => err ? reject(err) : resolve({ stdout, stderr }));
    });
    const stem = path.basename(tmpFile, '.js');
    const cfgPath = path.join(PROJECT_ROOT, 'output', stem, 'pipeline-config.json');
    const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const params = {
      template: config.template, key: config.xteaParams.key, delta: config.xteaParams.delta,
      rounds: config.xteaParams.rounds, keyModConstants: config.xteaParams.keyModConstants,
      keyMods: config.xteaParams.keyMods, caseCount: config.caseCount,
    };
    if (config.structureParams) {
      if (config.structureParams.fieldOrder) { params.cdFieldOrder = config.structureParams.fieldOrder; params.fieldOrder = config.structureParams.fieldOrder; }
      if (config.structureParams.hashPosition !== undefined) params.hashPosition = config.structureParams.hashPosition;
      if (config.structureParams.serializationDiffs) params.serializationDiffs = config.structureParams.serializationDiffs;
      if (config.structureParams.headerSplit) params.headerSplit = config.structureParams.headerSplit;
    }
    templateCache.store(sourceHash, params);
    return templateCache.lookup(sourceHash);
  } catch (err) {
    return null;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) { /* */ }
  }
}

async function runTest(testId, testName, extraFetches, templateCache, chromeProfile, vdataProfile) {
  log('\n=== TEST ' + testId + ': ' + testName + ' ===');
  const t0 = Date.now();

  const client = new CaptchaClient({ aid: AID, referer: REFERER, userAgent: USER_AGENT });

  const session = await client.prehandle();
  log('  sess: ' + session.sess.slice(0, 20) + '...');

  const sig = await client.getSig(session);
  log('  nonce: ' + sig.nonce);

  const { bgBuffer, sliceBuffer } = await client.downloadImages(sig);
  const tdcSource = await client.downloadTdc(sig);

  // === CONDITIONAL EXTRA FETCHES ===
  if (extraFetches.tcaptchaSlide && sig._html) {
    const m = sig._html.match(/src="(https?:\/\/captcha\.gtimg\.com\/[^"]*tcaptcha-slide[^"]*)"/);
    if (m) {
      try {
        await httpRequest(m[1], {
          headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Referer': sig.showUrl || 'https://t.captcha.qq.com/',
            'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
            'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"' },
          timeout: 10000 });
        log('  tcaptcha-slide.js fetched');
      } catch (_) { log('  tcaptcha-slide.js failed (non-fatal)'); }
    }
  }

  if (extraFetches.vmSlide && sig._html) {
    const vmSlideUrl = parseVmSlideUrl(sig._html);
    if (vmSlideUrl) {
      const fullUrl = vmSlideUrl.startsWith('http') ? vmSlideUrl : 'https://t.captcha.qq.com/' + vmSlideUrl.replace(/^\//, '');
      try {
        await httpRequest(fullUrl, {
          timeout: 10000,
          headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br, zstd', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache',
            'Referer': sig.showUrl || 'https://t.captcha.qq.com/',
            'Sec-Fetch-Dest': 'script', 'Sec-Fetch-Mode': 'no-cors', 'Sec-Fetch-Site': 'same-origin',
            'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
            'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"' } });
        log('  vm-slide fetched');
      } catch (_) { log('  vm-slide failed (non-fatal)'); }
    }
  }

  if (extraFetches.slideJy) {
    let jyUrl = null;
    if (sig._html) {
      const m = sig._html.match(/htdocsPath\s*:\s*"(https?:\/\/[^"]*)"/);
      if (m) jyUrl = m[1].replace(/\/+$/, '') + '/slide-jy.js';
    }
    if (!jyUrl) jyUrl = 'https://captcha.gtimg.com/1/slide-jy.js';
    try {
      await httpRequest(jyUrl, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Referer': sig.showUrl || 'https://t.captcha.qq.com/',
          'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
          'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"' },
        timeout: 10000 });
      log('  slide-jy.js fetched');
    } catch (_) { log('  slide-jy.js failed (non-fatal)'); }
  }

  if (extraFetches.caplog) {
    const preUrl = buildPreVerifyBeaconUrl({ t0 });
    await fireBeacon(preUrl, { userAgent: USER_AGENT, timeoutMs: 3000, referer: sig.showUrl });
    log('  caplog beacon fired');
  }

  // === TOKEN GENERATION ===
  const tdcName = extractTdcName(tdcSource);
  if (!tdcName) throw new Error('Could not extract TDC_NAME');
  const sourceHash = computeSourceHash(tdcSource);

  let cached = templateCache.lookup(sourceHash);
  if (!cached) {
    log('  auto-porting template ' + sourceHash + '...');
    cached = await autoPort(templateCache, sourceHash, tdcSource);
  }
  if (!cached) throw new Error('Unknown template (hash=' + sourceHash + '), auto-port failed');
  log('  Template: ' + cached.template + ', opcodes: ' + cached.caseCount);

  const xteaParams = {
    key: cached.key, delta: cached.delta, rounds: cached.rounds,
    keyModConstants: cached.keyModConstants, keyMods: cached.keyMods || null,
  };

  const eks = extractEks(tdcSource);
  const rawOffset = await solveSlider(bgBuffer, sliceBuffer);
  const spt = sig.spt || '0';
  const xAnswer = rawOffset;
  const yAnswer = Math.floor(parseInt(spt, 10)) || 0;
  const ans = xAnswer + ',' + yAnswer + ';';

  const now = Date.now();
  const behavioralEvents = generateBehavioralEvents(xAnswer, yAnswer, now);
  const slideValueArray = [];
  const cursorViewportY = 800 + Math.floor(Math.random() * 30);
  let firstMv = true; let prevT = null;
  for (const ev of behavioralEvents) {
    if (ev[0] === 1) {
      if (firstMv) { slideValueArray.push([ev[1], cursorViewportY, Math.floor(Math.random() * 60 + 60)]); firstMv = false; prevT = ev[3]; }
      else { slideValueArray.push([ev[1], ev[2], ev[3] - prevT]); prevT = ev[3]; }
    }
  }
  slideValueArray.push([0, 0, 0]);

  const slideSd = buildSlideSd({ x: xAnswer, y: yAnswer }, slideValueArray, { trycnt: 1, refreshcnt: 0 });
  const nowSec = Math.round(now / 1000);
  const cdCanonical = JSON.parse(JSON.stringify(chromeProfile.cdCanonical));
  cdCanonical[16] = nowSec;
  cdCanonical[22] = 'https://t.captcha.qq.com/cap_union_new_show?rand=' + Math.floor(Math.random() * 1e16);
  cdCanonical[52] = nowSec + 2; cdCanonical[53] = nowSec;

  const cdFieldOrder = cached.cdFieldOrder || null;
  let cdArray;
  if (cdFieldOrder) {
    const hashPos = cached.hashPosition;
    const profileOrder = chromeProfile.chromeFieldOrder || [];
    const unmappedPool = [];
    for (let j = 0; j < profileOrder.length; j++) {
      if (profileOrder[j] === -1 && chromeProfile.cd[j] !== undefined && !Array.isArray(chromeProfile.cd[j]))
        unmappedPool.push(chromeProfile.cd[j]);
    }
    const liveSid = session.sid || sig.sid || '';
    if (liveSid) {
      for (let k = 0; k < unmappedPool.length; k++) {
        if (typeof unmappedPool[k] === 'string' && /^\d{16,}$/.test(unmappedPool[k])) { unmappedPool[k] = liveSid; break; }
      }
    }
    cdArray = []; let poolIdx = 0;
    for (let i = 0; i < cdFieldOrder.length; i++) {
      const idx = cdFieldOrder[i];
      if (idx === -1) {
        if (i === hashPos) cdArray.push(behavioralEvents);
        else if (poolIdx < unmappedPool.length) cdArray.push(unmappedPool[poolIdx++]);
        else cdArray.push('');
      } else cdArray.push(cdCanonical[idx]);
    }
  } else cdArray = cdCanonical;

  const collectEncoded = generateCollect(null, xteaParams, {
    cdArrayOverride: cdArray, appid: AID, nonce: sig.nonce,
    sdOverride: slideSd, timestamp: now,
    serializationDiffs: cached.serializationDiffs || null,
    headerSplit: cached.headerSplit || null, singleBlob: true,
  });
  let collectVal = collectEncoded;
  if (collectVal.includes('%')) { try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* */ } }

  const itokenValue = Math.floor(Math.random() * 0xFFFFFFFF) + '%3A' + Math.floor(Date.now() / 1000);

  const postFields = {
    aid: AID, protocol: 'https', accver: '1', showtype: 'popup',
    ua: Buffer.from(USER_AGENT).toString('base64'),
    noheader: '1', fb: '1', aged: '0', enableAged: '0',
    enableDarkMode: '0', grayscale: '1', dyeid: '0', clientype: '2',
    sess: sig.sess || session.sess || '', fwidth: '0',
    sid: session.sid || sig.sid || '', wxLang: '', tcScale: '1', uid: '', cap_cd: '',
    rnd: String(Math.floor(Math.random() * 1000000)),
    prehandleLoadTime: String(Math.floor(Math.random() * 200 + 100)),
    createIframeStart: String(Date.now() - Math.floor(Math.random() * 5000 + 2000)),
    global: '0', subsid: sig.showSubsid || '1',
    cdata: '0', ans: ans, vsig: sig.vsig || '', websig: sig.websig || '',
    subcapclass: '', pow_answer: '', pow_calc_time: '0',
    collect: collectVal, tlg: String(collectVal.length),
    fpinfo: '', eks: eks || '', nonce: sig.nonce || '', vlg: '0_0_1',
  };

  const serializedBody = serializePostFields(postFields);
  const vData = buildVDataForPost(serializedBody, {
    profile: vdataProfile, overrides: { tp: session.sid || sig.sid || '' },
  });
  const finalBody = serializedBody + '&vData=' + vData;

  const humanDelay = 2000 + Math.floor(Math.random() * 3000);
  log('  delay: ' + humanDelay + 'ms');
  await new Promise(r => setTimeout(r, humanDelay));

  // Send verify directly
  const verifyHeaders = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Content-Length': String(Buffer.byteLength(finalBody)),
    'User-Agent': USER_AGENT,
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Origin': 'https://t.captcha.qq.com',
    'Referer': sig.showUrl || 'https://t.captcha.qq.com/cap_union_new_show',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin',
    'Cache-Control': 'no-cache', 'Pragma': 'no-cache',
    'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"',
    'Cookie': 'TDC_itoken=' + itokenValue,
  };

  const resp = await httpRequest('https://t.captcha.qq.com/cap_union_new_verify', {
    method: 'POST', headers: verifyHeaders, body: finalBody, timeout: 30000,
  });
  const data = parseJSONP(resp.body);
  const errorCode = typeof data.errorCode === 'number' ? data.errorCode
    : (isNaN(parseInt(data.errorCode, 10)) ? -999 : parseInt(data.errorCode, 10));

  return { testId, testName, errorCode, template: cached.template, opcodes: cached.caseCount };
}

async function main() {
  const templateCache = new TemplateCache();
  templateCache.load();
  templateCache.seed();

  const chromeProfile = loadJsonProfile('profiles/chrome-fingerprint.json');
  const vdataProfile = loadJsonProfile('profiles/vdata-browser-default.json');

  const tests = [
    { id: 'A', name: 'no-extra-fetches', fetches: {} },
    { id: 'B', name: 'tcaptcha-slide-only', fetches: { tcaptchaSlide: true } },
    { id: 'C', name: 'vm-slide-only', fetches: { vmSlide: true } },
    { id: 'D', name: 'slide-jy-only', fetches: { slideJy: true } },
    { id: 'E', name: 'caplog-only', fetches: { caplog: true } },
  ];

  const results = [];
  for (const test of tests) {
    try {
      const r = await runTest(test.id, test.name, test.fetches, templateCache, chromeProfile, vdataProfile);
      results.push(r);
      console.log('  ' + test.id + ' (' + test.name + '): errorCode=' + r.errorCode + ' [' + r.opcodes + ' opcodes]');
    } catch (err) {
      results.push({ testId: test.id, testName: test.name, errorCode: null, error: err.message });
      console.log('  ' + test.id + ' (' + test.name + '): ERROR — ' + err.message);
    }
    await new Promise(r => setTimeout(r, 1000)); // brief pause between tests
  }

  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    const ec = r.error ? 'ERROR' : String(r.errorCode);
    console.log('  ' + r.testId + ' ' + r.testName + ': ' + ec);
  }

  const outputDir = path.join(PROJECT_ROOT, 'output', 'phase-62');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, 'subreq-isolation.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2) + '\n'
  );
  console.log('\nResults written to output/phase-62/subreq-isolation.json');
}

main().catch(err => {
  console.error('Fatal: ' + err.message);
  process.exit(1);
});
