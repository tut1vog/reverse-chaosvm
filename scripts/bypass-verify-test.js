'use strict';

/**
 * bypass-verify-test.js — Phase 62 diagnostic
 *
 * Runs the FULL scraper flow (including all sub-resource fetches:
 * tcaptcha-slide.js, vm-slide.enc.js, slide-jy.js, caplog beacon)
 * but sends the final verify POST directly via httpRequest()
 * instead of through client.verify().
 *
 * If this gets errorCode 0, the bug is inside client.verify().
 * If this gets errorCode -1, the bug is in the sub-resource fetches.
 *
 * Usage: node scripts/bypass-verify-test.js [--verbose]
 */

const fs = require('fs');
const path = require('path');

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
  if (verbose) process.stderr.write('[bypass] ' + msg + '\n');
}

function serializePostFields(fields) {
  const parts = [];
  for (const name of Object.keys(fields)) {
    const value = fields[name];
    parts.push(name + '=' + (value == null ? '' : String(value)));
  }
  return parts.join('&');
}

function loadJsonProfile(relPath) {
  return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relPath), 'utf8'));
}

async function main() {
  const templateCache = new TemplateCache();
  templateCache.load();
  templateCache.seed();

  const chromeProfileData = loadJsonProfile('profiles/chrome-fingerprint.json');
  const vdataProfile = loadJsonProfile('profiles/vdata-browser-default.json');

  const t0 = Date.now();

  // === Full scraper flow ===
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

  // Step 3: downloadImages
  log('downloadImages...');
  const { bgBuffer, sliceBuffer } = await client.downloadImages(sig);

  // Step 4: downloadTdc
  log('downloadTdc...');
  const tdcSource = await client.downloadTdc(sig);

  // === EXTRA REQUESTS (matching scraper) ===

  // Step 4b: tcaptcha-slide.js (same as scraper line 660)
  if (sig._html) {
    const slideScriptMatch = sig._html.match(/src="(https?:\/\/captcha\.gtimg\.com\/[^"]*tcaptcha-slide[^"]*)"/);
    if (slideScriptMatch) {
      log('fetch tcaptcha-slide.js: ' + slideScriptMatch[1]);
      try {
        await httpRequest(slideScriptMatch[1], {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Referer': sig.showUrl || 'https://t.captcha.qq.com/',
            'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
          },
          timeout: 10000,
        });
        log('  tcaptcha-slide.js fetched OK');
      } catch (err) {
        log('  tcaptcha-slide.js failed (non-fatal): ' + err.message);
      }
    }
  }

  // Step k: vm-slide.enc.js (same as scraper _getVmSlideSource)
  if (sig._html) {
    const vmSlideUrl = parseVmSlideUrl(sig._html);
    if (vmSlideUrl) {
      const fullUrl = vmSlideUrl.startsWith('http')
        ? vmSlideUrl
        : 'https://t.captcha.qq.com/' + vmSlideUrl.replace(/^\//, '');
      log('fetch vm-slide: ' + fullUrl);
      try {
        await httpRequest(fullUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Referer': sig.showUrl || 'https://t.captcha.qq.com/',
            'Sec-Fetch-Dest': 'script',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'same-origin',
            'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
          },
        });
        log('  vm-slide fetched OK');
      } catch (err) {
        log('  vm-slide failed (non-fatal): ' + err.message);
      }
    }
  }

  // Step k1: slide-jy.js (same as scraper line 827)
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
    log('fetch slide-jy.js: ' + jyScriptUrl);
    try {
      await httpRequest(jyScriptUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Referer': sig.showUrl || 'https://t.captcha.qq.com/',
          'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
        timeout: 10000,
      });
      log('  slide-jy.js fetched OK');
    } catch (err) {
      log('  slide-jy.js failed (non-fatal): ' + err.message);
    }
  }

  // Step k2: caplog pre-verify beacon (same as scraper line 866)
  log('caplog pre-verify beacon...');
  const preUrl = buildPreVerifyBeaconUrl({ t0 });
  await fireBeacon(preUrl, { userAgent: USER_AGENT, timeoutMs: 3000, referer: sig.showUrl });
  log('  caplog beacon fired');

  // === TOKEN GENERATION (same as tls-experiment) ===

  const tdcName = extractTdcName(tdcSource);
  if (!tdcName) throw new Error('Could not extract TDC_NAME');
  const sourceHash = computeSourceHash(tdcSource);
  log('TDC_NAME: ' + tdcName + ', hash: ' + sourceHash);

  let cached = templateCache.lookup(sourceHash);
  if (!cached) {
    log('Unknown template — auto-porting...');
    const os = require('os');
    const { execFile } = require('child_process');
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
        template: config.template,
        key: config.xteaParams.key, delta: config.xteaParams.delta,
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
      cached = templateCache.lookup(sourceHash);
      log('Auto-port succeeded: template ' + config.template);
    } catch (err) {
      throw new Error('Auto-port failed: ' + (err.message || String(err)));
    } finally {
      try { fs.unlinkSync(tmpFile); } catch (_) { /* */ }
    }
  }
  if (!cached) throw new Error('Unknown template (hash=' + sourceHash + ')');
  log('Template: ' + cached.template + ', opcodes: ' + cached.caseCount);

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
  log('ans: ' + ans);

  const now = Date.now();
  const behavioralEvents = generateBehavioralEvents(xAnswer, yAnswer, now);

  const slideValueArray = [];
  const cursorViewportY = 800 + Math.floor(Math.random() * 30);
  let firstMove = true;
  let prevTime = null;
  for (const ev of behavioralEvents) {
    if (ev[0] === 1) {
      if (firstMove) {
        slideValueArray.push([ev[1], cursorViewportY, Math.floor(Math.random() * 60 + 60)]);
        firstMove = false;
        prevTime = ev[3];
      } else {
        slideValueArray.push([ev[1], ev[2], ev[3] - prevTime]);
        prevTime = ev[3];
      }
    }
  }
  slideValueArray.push([0, 0, 0]);

  const slideSd = buildSlideSd(
    { x: xAnswer, y: yAnswer }, slideValueArray, { trycnt: 1, refreshcnt: 0 }
  );

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
        if (i === hashPos) cdArray.push(behavioralEvents);
        else if (poolIdx < unmappedPool.length) cdArray.push(unmappedPool[poolIdx++]);
        else cdArray.push('');
      } else {
        cdArray.push(cdCanonical[idx]);
      }
    }
  } else {
    cdArray = cdCanonical;
  }

  const collectEncoded = generateCollect(null, xteaParams, {
    cdArrayOverride: cdArray, appid: AID, nonce: sig.nonce,
    sdOverride: slideSd, timestamp: now,
    serializationDiffs: cached.serializationDiffs || null,
    headerSplit: cached.headerSplit || null, singleBlob: true,
  });

  let collectVal = collectEncoded;
  if (collectVal.includes('%')) {
    try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* */ }
  }
  log('collect length: ' + collectVal.length);

  // TDC_itoken
  const itokenValue = Math.floor(Math.random() * 0xFFFFFFFF) + '%3A' +
    Math.floor(Date.now() / 1000);

  // Build POST fields (same as scraper _buildPostFields)
  const postFields = {
    aid: AID, protocol: 'https', accver: '1', showtype: 'popup',
    ua: Buffer.from(USER_AGENT).toString('base64'),
    noheader: '1', fb: '1', aged: '0', enableAged: '0',
    enableDarkMode: '0', grayscale: '1', dyeid: '0', clientype: '2',
    sess: sig.sess || session.sess || '',
    fwidth: '0', sid: session.sid || sig.sid || '',
    wxLang: '', tcScale: '1', uid: '', cap_cd: '',
    rnd: String(Math.floor(Math.random() * 1000000)),
    prehandleLoadTime: String(Math.floor(Math.random() * 200 + 100)),
    createIframeStart: String(Date.now() - Math.floor(Math.random() * 5000 + 2000)),
    global: '0', subsid: sig.showSubsid || '1',
    cdata: '0', ans: ans,
    vsig: sig.vsig || '', websig: sig.websig || '',
    subcapclass: '', pow_answer: '', pow_calc_time: '0',
    collect: collectVal, tlg: String(collectVal.length),
    fpinfo: '', eks: eks || '', nonce: sig.nonce || '', vlg: '0_0_1',
  };

  const serializedBody = serializePostFields(postFields);
  const vData = buildVDataForPost(serializedBody, {
    profile: vdataProfile,
    overrides: { tp: session.sid || sig.sid || '' },
  });
  const finalBody = serializedBody + '&vData=' + vData;

  // Human-like delay
  const humanDelay = 2000 + Math.floor(Math.random() * 3000);
  log('human-like delay: ' + humanDelay + 'ms');
  await new Promise(r => setTimeout(r, humanDelay));

  // === SEND VERIFY DIRECTLY (bypassing client.verify()) ===
  log('sending verify directly via httpRequest...');
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
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Cookie': 'TDC_itoken=' + itokenValue,
  };

  const resp = await httpRequest('https://t.captcha.qq.com/cap_union_new_verify', {
    method: 'POST',
    headers: verifyHeaders,
    body: finalBody,
    timeout: 30000,
  });

  const data = parseJSONP(resp.body);
  const errorCode = typeof data.errorCode === 'number'
    ? data.errorCode
    : (isNaN(parseInt(data.errorCode, 10)) ? -999 : parseInt(data.errorCode, 10));

  console.log(JSON.stringify({
    errorCode,
    ticket: (data.ticket || '').slice(0, 40) + '...',
    randstr: data.randstr || '',
    bodyLength: finalBody.length,
    template: cached.template,
    opcodes: cached.caseCount,
  }, null, 2));

  if (errorCode === 0) {
    console.log('\nCONCLUSION: Full scraper flow + direct verify = SUCCESS');
    console.log('The sub-resource fetches (tcaptcha-slide, vm-slide, slide-jy, caplog) are harmless.');
    console.log('The bug is inside client.verify() or in how the scraper calls it.');
  } else {
    console.log('\nCONCLUSION: Full scraper flow + direct verify = FAILURE (errorCode ' + errorCode + ')');
    console.log('One of the sub-resource fetches may be poisoning the session.');
  }
}

main().catch(err => {
  console.error('Fatal error: ' + err.message);
  if (verbose) console.error(err.stack);
  process.exit(1);
});
