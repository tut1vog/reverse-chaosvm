'use strict';

/**
 * tdc-diagnose.js — Enhanced CAPTCHA Diagnostics Tool
 *
 * Logs detailed per-attempt timing, token sizes, and session data to
 * identify what differentiates successful (errorCode -1) from failed
 * (errorCode 12) attempts. Uses cached pipeline configs from prior
 * survey/autoport runs — does NOT run the porting pipeline itself.
 *
 * Usage:
 *   node scripts/tdc-diagnose.js --attempts 30 --verbose
 *   node scripts/tdc-diagnose.js --attempts 10 --hash 83d7be69 --delay 5000
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const { CaptchaClient } = require('../tools/captcha-solver/captcha-client');
const { solveSlider } = require('../tools/captcha-solver/slide-solver');
const { generateCollect, generateBehavioralEvents, buildSlideSd } = require('../tools/scraper/collect-generator');
const { generateVData, parseVmSlideUrl } = require('../tools/scraper/vdata-generator');
const { extractTdcName, extractEks, computeSourceHash } = require('../tools/scraper/tdc-utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'tdc-diagnose');

const DEFAULT_AID = '2046626881';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

// ═══════════════════════════════════════════════════════════════════════
// CLI Argument Parsing
// ═══════════════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    attempts: 30,
    verbose: false,
    delay: 3000,
    hash: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--attempts':
        opts.attempts = parseInt(args[++i], 10) || 30;
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--delay':
        opts.delay = parseInt(args[++i], 10) || 3000;
        break;
      case '--hash':
        opts.hash = args[++i] || null;
        break;
      default:
        process.stderr.write(`Unknown argument: ${args[i]}\n`);
        process.exit(1);
    }
  }

  return opts;
}

// ═══════════════════════════════════════════════════════════════════════
// Logging
// ═══════════════════════════════════════════════════════════════════════

let VERBOSE = false;

function log(msg) {
  if (VERBOSE) {
    process.stderr.write(`[diagnose] ${msg}\n`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Cached Config Loader
// ═══════════════════════════════════════════════════════════════════════

/**
 * Look up a cached pipeline config for the given source hash.
 * Searches output/tdc-survey-<hash>/ then output/tdc-autoport-<hash>/.
 *
 * @param {string} sourceHash
 * @returns {Object|null} pipeline config or null
 */
function loadCachedConfig(sourceHash) {
  const prefixes = ['tdc-survey-', 'tdc-autoport-'];
  for (const prefix of prefixes) {
    const configPath = path.join(PROJECT_ROOT, 'output', prefix + sourceHash, 'pipeline-config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        log(`Loaded cached config from ${configPath}`);
        return config;
      } catch (err) {
        log(`Failed to parse ${configPath}: ${err.message}`);
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// Auto-Port via Pipeline (fallback when no cached config)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Run the porting pipeline on a tdc source. Returns the pipeline config
 * on success, or null on failure.
 *
 * @param {string} sourceHash
 * @param {string} tdcSource
 * @returns {Promise<Object|null>}
 */
async function autoPort(sourceHash, tdcSource) {
  const tempFile = path.join(os.tmpdir(), `tdc-diagnose-${sourceHash}.js`);

  try {
    fs.writeFileSync(tempFile, tdcSource, 'utf8');

    const { stdout, stderr } = await new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [path.join(PROJECT_ROOT, 'pipeline', 'run.js'), tempFile, '--skip-verify'],
        { cwd: PROJECT_ROOT, timeout: 120000 },
        (err, stdout, stderr) => {
          if (err) reject(err);
          else resolve({ stdout, stderr });
        }
      );
    });

    if (VERBOSE && stdout) {
      for (const line of stdout.split('\n')) {
        if (line.trim()) log('  pipeline: ' + line.trim());
      }
    }

    const stem = path.basename(tempFile, '.js');
    const configPath = path.join(PROJECT_ROOT, 'output', stem, 'pipeline-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config;
  } catch (err) {
    const msg = err.stderr || err.message || String(err);
    log('  Auto-port failed: ' + msg);
    return null;
  } finally {
    try { fs.unlinkSync(tempFile); } catch (_) { /* ignore */ }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// POST Fields Builder (replicated from scraper.js _buildPostFields)
// ═══════════════════════════════════════════════════════════════════════

function buildPostFields(client, session, sig, ans, collectVal, eks) {
  return {
    aid: DEFAULT_AID,
    protocol: 'https',
    accver: '1',
    showtype: 'popup',
    ua: Buffer.from(DEFAULT_USER_AGENT).toString('base64'),
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

// ═══════════════════════════════════════════════════════════════════════
// Sleep helper
// ═══════════════════════════════════════════════════════════════════════

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════════
// Main Diagnostics
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const opts = parseArgs();
  VERBOSE = opts.verbose;

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load profile
  const profile = JSON.parse(fs.readFileSync(
    path.join(PROJECT_ROOT, 'profiles', 'default.json'), 'utf8'
  ));

  // Load jQuery source
  const jqueryPath = path.join(PROJECT_ROOT, 'sample', 'slide-jy.js');
  let jquerySource = null;
  if (fs.existsSync(jqueryPath)) {
    jquerySource = fs.readFileSync(jqueryPath, 'utf8');
    log(`jQuery source loaded (${jquerySource.length} chars)`);
  } else {
    log('WARNING: sample/slide-jy.js not found');
  }

  // Load vm-slide fallback source
  const vmSlidePath = path.join(PROJECT_ROOT, 'sample', 'vm_slide.js');
  let vmSlideSource = null;
  if (fs.existsSync(vmSlidePath)) {
    vmSlideSource = fs.readFileSync(vmSlidePath, 'utf8');
    log(`vm-slide fallback loaded (${vmSlideSource.length} chars)`);
  }

  // In-memory config cache (sourceHash → config)
  const configCache = new Map();
  const results = [];

  log(`Starting diagnostics: ${opts.attempts} attempts, delay=${opts.delay}ms` +
      (opts.hash ? `, hash filter=${opts.hash}` : ''));

  // Print header
  console.log('');
  console.log('#  | Hash     | Time(ms) | Collect | vData | Ans       | Code | Nonce');
  console.log('---|----------|----------|---------|-------|-----------|------|' + '-'.repeat(16));

  for (let i = 1; i <= opts.attempts; i++) {
    const record = {
      attempt: i,
      sourceHash: null,
      t_prehandle: null,
      t_getsig: null,
      t_downloadTdc: null,
      t_downloadImages: null,
      t_solveSlider: null,
      t_generateCollect: null,
      t_generateVData: null,
      t_verify: null,
      t_total: null,
      collectLength: null,
      vDataLength: null,
      ans: null,
      nonce: null,
      sess: null,
      caseCount: null,
      template: null,
      hashPosition: null,
      fieldOrderLength: null,
      errorCode: null,
      errMessage: null,
      rawResponse: null,
      error: null,
    };

    try {
      log(`Attempt ${i}/${opts.attempts}`);

      // (1) Fresh client + session
      const client = new CaptchaClient({
        aid: DEFAULT_AID,
        referer: 'https://urlsec.qq.com/',
      });

      // (2) prehandle
      const t0_prehandle = Date.now();
      const session = await client.prehandle();
      record.t_prehandle = Date.now() - t0_prehandle;
      record.sess = (session.sess || '').slice(0, 16);
      log(`sess: ${record.sess}...`);

      // (3) getSig
      const t0_getsig = Date.now();
      const sig = await client.getSig(session);
      record.t_getsig = Date.now() - t0_getsig;
      record.nonce = sig.nonce || '';
      log(`nonce: ${sig.nonce}`);

      // (4) downloadTdc + extract hash
      const t0_downloadTdc = Date.now();
      const tdcSource = await client.downloadTdc(sig);
      record.t_downloadTdc = Date.now() - t0_downloadTdc;
      log(`tdc source: ${tdcSource.length} chars`);

      const sourceHash = computeSourceHash(tdcSource);
      record.sourceHash = sourceHash;
      log(`hash: ${sourceHash}`);

      // (5) Check hash filter
      if (opts.hash && !sourceHash.startsWith(opts.hash)) {
        log(`Hash ${sourceHash.slice(0, 8)} does not match filter ${opts.hash}, skipping`);
        record.error = 'hash-mismatch';
        record.errorCode = 'skip';
        results.push(record);
        printRow(record);
        if (i < opts.attempts) await sleep(opts.delay);
        continue;
      }

      // (5b) Load cached config
      let config = configCache.get(sourceHash);
      if (!config) {
        config = loadCachedConfig(sourceHash);
        if (!config) {
          // No --hash filter and no cache: try autoPort as fallback
          if (!opts.hash) {
            log('No cached config, attempting auto-port fallback...');
            config = await autoPort(sourceHash, tdcSource);
          }
        }
        if (config) {
          configCache.set(sourceHash, config);
        }
      }

      if (!config) {
        log(`No config available for ${sourceHash.slice(0, 8)}, skipping`);
        record.error = 'no-config';
        record.errorCode = 'skip';
        results.push(record);
        printRow(record);
        if (i < opts.attempts) await sleep(opts.delay);
        continue;
      }

      record.caseCount = config.caseCount || null;
      record.template = config.template || null;
      record.hashPosition = (config.structureParams && config.structureParams.hashPosition) || null;
      record.fieldOrderLength = (config.structureParams && config.structureParams.fieldOrder)
        ? config.structureParams.fieldOrder.length
        : null;

      // (6) downloadImages
      const t0_downloadImages = Date.now();
      const { bgBuffer, sliceBuffer } = await client.downloadImages(sig);
      record.t_downloadImages = Date.now() - t0_downloadImages;
      log(`Images: bg=${bgBuffer.length}b, slice=${sliceBuffer.length}b`);

      // (7) solveSlider
      const t0_solveSlider = Date.now();
      const rawOffset = await solveSlider(bgBuffer, sliceBuffer);
      record.t_solveSlider = Date.now() - t0_solveSlider;
      log(`rawOffset: ${rawOffset}`);

      // Compute answer
      const spt = sig.spt || '0';
      const xAnswer = rawOffset;
      const yAnswer = Math.floor(parseInt(spt, 10)) || 0;
      const ans = `${xAnswer},${yAnswer};`;
      record.ans = ans;

      // Generate behavioral events and slideSd
      const now = Date.now();
      const behavioralEvents = generateBehavioralEvents(xAnswer, yAnswer, now);

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

      // (8) generateCollect
      const t0_generateCollect = Date.now();

      const xteaParams = {
        key: config.xteaParams.key,
        delta: config.xteaParams.delta,
        rounds: config.xteaParams.rounds,
        keyModConstants: config.xteaParams.keyModConstants,
        keyMods: config.xteaParams.keyMods,
      };

      const eks = extractEks(tdcSource);

      const nowSec = Math.round(Date.now() / 1000);
      const profileOverrides = Object.assign({}, profile, {
        pageUrl: sig.showUrl || profile.pageUrl,
        timestamp: nowSec,
        timestampCollectionStart: nowSec,
        timestampCollectionEnd: nowSec + 3,
        canvasHash: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
        mathFingerprint: Math.random(),
        performanceHash: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
      });

      const collectOpts = {
        appid: DEFAULT_AID,
        nonce: sig.nonce,
        sdOverride: slideSd,
        cdFieldOrder: (config.structureParams && config.structureParams.fieldOrder) || null,
        behavioralEvents: behavioralEvents,
        timestamp: now,
        serializationDiffs: (config.structureParams && config.structureParams.serializationDiffs) || null,
        headerSplit: (config.structureParams && config.structureParams.headerSplit) || null,
        singleBlob: true,
      };

      const collectEncoded = generateCollect(profileOverrides, xteaParams, collectOpts);
      record.t_generateCollect = Date.now() - t0_generateCollect;

      let collectVal = collectEncoded;
      if (collectVal.includes('%')) {
        try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* leave as-is */ }
      }
      record.collectLength = collectVal.length;

      // Get vm-slide source
      const currentVmSlide = vmSlideSource;
      if (!currentVmSlide) {
        throw new Error('No vm-slide source available');
      }
      if (!jquerySource) {
        throw new Error('No jQuery source available');
      }

      // Build POST fields
      const postFields = buildPostFields(client, session, sig, ans, collectVal, eks);

      // (9) generateVData
      const t0_generateVData = Date.now();
      const { vData, serializedBody } = generateVData(
        postFields,
        currentVmSlide,
        jquerySource,
        { userAgent: DEFAULT_USER_AGENT }
      );
      record.t_generateVData = Date.now() - t0_generateVData;
      record.vDataLength = vData.length;
      log(`vData: ${vData.slice(0, 30)}...`);

      // (10) verify
      const t0_verify = Date.now();
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
      record.t_verify = Date.now() - t0_verify;

      record.errorCode = result.errorCode;
      record.errMessage = (result._raw && result._raw.err_msg) || null;
      record.rawResponse = result._raw || null;
      record.t_total = record.t_prehandle + record.t_getsig + record.t_downloadTdc +
        record.t_downloadImages + record.t_solveSlider + record.t_generateCollect +
        record.t_generateVData + record.t_verify;

    } catch (err) {
      record.error = err.message;
      if (!record.errorCode) {
        record.errorCode = 'err';
      }
      log(`Error: ${err.message}`);
    }

    results.push(record);
    printRow(record);

    // Delay between attempts
    if (i < opts.attempts) {
      await sleep(opts.delay);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Save results
  // ═══════════════════════════════════════════════════════════════════

  const resultsPath = path.join(OUTPUT_DIR, 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2) + '\n', 'utf8');
  process.stderr.write(`\n[diagnose] Results saved to ${resultsPath}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // Aggregated Stats
  // ═══════════════════════════════════════════════════════════════════

  printSummary(results);
}

// ═══════════════════════════════════════════════════════════════════════
// Output Helpers
// ═══════════════════════════════════════════════════════════════════════

function printRow(r) {
  const num = String(r.attempt).padStart(2);
  const hash = (r.sourceHash || '--------').slice(0, 8);
  const time = r.t_total !== null ? String(r.t_total).padStart(8) : '       -';
  const collect = r.collectLength !== null ? String(r.collectLength).padStart(7) : '      -';
  const vdata = r.vDataLength !== null ? String(r.vDataLength).padStart(5) : '    -';
  const ans = (r.ans || '-').padEnd(9).slice(0, 9);
  const code = String(r.errorCode !== null ? r.errorCode : '-').padStart(4);
  const nonce = (r.nonce || '-').slice(0, 16);

  console.log(`${num} | ${hash} | ${time} | ${collect} | ${vdata} | ${ans} | ${code} | ${nonce}`);
}

function printSummary(results) {
  const validAttempts = results.filter(r => typeof r.errorCode === 'number');
  const successes = validAttempts.filter(r => r.errorCode === -1);
  const failures = validAttempts.filter(r => r.errorCode !== -1);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('AGGREGATED STATS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total attempts:     ${results.length}`);
  console.log(`Verified attempts:  ${validAttempts.length}`);
  console.log(`Successes (code -1):${successes.length}`);
  console.log(`Failures:           ${failures.length}`);
  console.log(`Success rate:       ${validAttempts.length > 0 ? (successes.length / validAttempts.length * 100).toFixed(1) : 0}%`);
  console.log(`Skipped/Errors:     ${results.length - validAttempts.length}`);
  console.log('');

  // Error code distribution
  const codeCounts = {};
  for (const r of validAttempts) {
    const key = String(r.errorCode);
    codeCounts[key] = (codeCounts[key] || 0) + 1;
  }
  console.log('Error code distribution:');
  for (const [code, count] of Object.entries(codeCounts).sort()) {
    console.log(`  code ${code}: ${count} (${(count / validAttempts.length * 100).toFixed(1)}%)`);
  }
  console.log('');

  // Timing comparison
  const timingFields = [
    't_prehandle', 't_getsig', 't_downloadTdc', 't_downloadImages',
    't_solveSlider', 't_generateCollect', 't_generateVData', 't_verify', 't_total',
  ];

  if (successes.length > 0 || failures.length > 0) {
    console.log('Avg timing (ms) — successes vs failures:');
    console.log('  Field              | Success | Failure');
    console.log('  -------------------|---------|--------');
    for (const field of timingFields) {
      const sVals = successes.map(r => r[field]).filter(v => v !== null);
      const fVals = failures.map(r => r[field]).filter(v => v !== null);
      const sAvg = sVals.length > 0 ? Math.round(sVals.reduce((a, b) => a + b, 0) / sVals.length) : '-';
      const fAvg = fVals.length > 0 ? Math.round(fVals.reduce((a, b) => a + b, 0) / fVals.length) : '-';
      const label = field.padEnd(19);
      const sStr = String(sAvg).padStart(7);
      const fStr = String(fAvg).padStart(7);
      console.log(`  ${label} | ${sStr} | ${fStr}`);
    }
    console.log('');
  }

  // Token size comparison
  if (successes.length > 0 || failures.length > 0) {
    console.log('Avg token sizes — successes vs failures:');
    for (const field of ['collectLength', 'vDataLength']) {
      const sVals = successes.map(r => r[field]).filter(v => v !== null);
      const fVals = failures.map(r => r[field]).filter(v => v !== null);
      const sAvg = sVals.length > 0 ? Math.round(sVals.reduce((a, b) => a + b, 0) / sVals.length) : '-';
      const fAvg = fVals.length > 0 ? Math.round(fVals.reduce((a, b) => a + b, 0) / fVals.length) : '-';
      console.log(`  ${field.padEnd(19)}: success=${sAvg}, failure=${fAvg}`);
    }
    console.log('');
  }

  // Per-hash breakdown
  const hashGroups = {};
  for (const r of validAttempts) {
    if (!r.sourceHash) continue;
    const key = r.sourceHash.slice(0, 8);
    if (!hashGroups[key]) hashGroups[key] = { total: 0, successes: 0, codes: {} };
    hashGroups[key].total++;
    if (r.errorCode === -1) hashGroups[key].successes++;
    const cKey = String(r.errorCode);
    hashGroups[key].codes[cKey] = (hashGroups[key].codes[cKey] || 0) + 1;
  }
  if (Object.keys(hashGroups).length > 0) {
    console.log('Per-hash breakdown:');
    for (const [hash, info] of Object.entries(hashGroups)) {
      const rate = (info.successes / info.total * 100).toFixed(0);
      const codes = Object.entries(info.codes).map(([c, n]) => `${c}:${n}`).join(' ');
      console.log(`  ${hash}: ${info.successes}/${info.total} (${rate}%) — ${codes}`);
    }
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Entry Point
// ═══════════════════════════════════════════════════════════════════════

if (require.main !== module) {
  module.exports = { parseArgs };
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(`[diagnose] Fatal error: ${err.message}\n`);
    process.exit(1);
  });
}
