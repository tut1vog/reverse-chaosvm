'use strict';

/**
 * tdc-survey.js — TDC Build Survey Tool
 *
 * Performs N independent CAPTCHA attempts (each a fresh session), recording
 * detailed data about each tdc.js build encountered. Useful for surveying
 * the pool of VM templates Tencent rotates through.
 *
 * Usage:
 *   node scripts/tdc-survey.js --attempts 20 --verbose --save-sources
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const { CaptchaClient } = require('../../tools/captcha-solver/captcha-client');
const { solveSlider } = require('../../tools/captcha-solver/slide-solver');
const { generateCollect, generateBehavioralEvents, buildSlideSd } = require('../../tools/scraper/collect-generator');
const { generateVData, parseVmSlideUrl } = require('../vm-slide-stack-vm/vdata-harness');
const { extractTdcName, extractEks, computeSourceHash } = require('../../tools/scraper/tdc-utils');
const { parseVmFunction } = require('../../tools/porting-pipeline/vm-parser');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SURVEY_DIR = path.join(PROJECT_ROOT, 'output', 'tdc-survey');

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
    attempts: 20,
    verbose: false,
    saveSources: false,
    delay: 2000,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--attempts':
        opts.attempts = parseInt(args[++i], 10) || 20;
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--save-sources':
        opts.saveSources = true;
        break;
      case '--delay':
        opts.delay = parseInt(args[++i], 10) || 2000;
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
    process.stderr.write(`[survey] ${msg}\n`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Auto-Port via Pipeline
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
  const tempFile = path.join(os.tmpdir(), `tdc-survey-${sourceHash}.js`);

  try {
    fs.writeFileSync(tempFile, tdcSource, 'utf8');

    const { stdout, stderr } = await new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [path.join(PROJECT_ROOT, 'tools', 'porting-pipeline', 'run.js'), tempFile, '--skip-verify'],
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
// Main Survey
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const opts = parseArgs();
  VERBOSE = opts.verbose;

  // Ensure output directory exists
  if (!fs.existsSync(SURVEY_DIR)) {
    fs.mkdirSync(SURVEY_DIR, { recursive: true });
  }

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

  // In-memory state
  const seenHashes = new Map(); // sourceHash → { tdcName, sourceLength, caseCount, template, portResult, config, count, errorCodes }
  const results = []; // per-attempt records

  log(`Starting survey: ${opts.attempts} attempts, delay=${opts.delay}ms`);

  for (let i = 1; i <= opts.attempts; i++) {
    const attemptRecord = {
      attempt: i,
      sourceHash: null,
      tdcName: null,
      sourceLength: null,
      caseCount: null,
      portResult: null,
      errorCode: null,
      error: null,
    };

    try {
      process.stderr.write(`[survey] Attempt ${i}/${opts.attempts}... `);

      // (a) Fresh client + session
      const client = new CaptchaClient({
        aid: DEFAULT_AID,
        referer: 'https://urlsec.qq.com/',
      });

      // (b) prehandle → getSig → downloadTdc
      const session = await client.prehandle();
      log(`sess: ${session.sess.slice(0, 16)}...`);

      const sig = await client.getSig(session);
      log(`nonce: ${sig.nonce}`);

      const tdcSource = await client.downloadTdc(sig);
      log(`tdc source: ${tdcSource.length} chars`);

      // (c) Extract metadata
      const tdcName = extractTdcName(tdcSource);
      const sourceHash = computeSourceHash(tdcSource);
      const sourceLength = tdcSource.length;

      attemptRecord.sourceHash = sourceHash;
      attemptRecord.tdcName = tdcName;
      attemptRecord.sourceLength = sourceLength;

      log(`TDC_NAME: ${tdcName}, hash: ${sourceHash}`);

      // (d) Check if we've seen this hash before
      let hashInfo = seenHashes.get(sourceHash);
      if (hashInfo) {
        hashInfo.count++;
        log(`Duplicate hash (seen ${hashInfo.count} times), using cached port result`);
        attemptRecord.caseCount = hashInfo.caseCount;
        attemptRecord.portResult = hashInfo.portResult;
      } else {
        // (e) New hash — try VM parse and pipeline
        let caseCount = null;
        let vmParseOk = false;

        try {
          const vmResult = parseVmFunction(tdcSource);
          caseCount = vmResult.caseCount;
          vmParseOk = true;
          log(`VM parse OK: ${caseCount} cases`);
        } catch (err) {
          log(`VM parse failed: ${err.message}`);
        }

        attemptRecord.caseCount = caseCount;

        // Run auto-port pipeline
        let portResult = 'fail:vm-parse';
        let config = null;

        if (vmParseOk) {
          log('Running porting pipeline...');
          config = await autoPort(sourceHash, tdcSource);
          if (config) {
            portResult = 'ok';
            log(`Pipeline OK: template=${config.template}, opcodes=${config.caseCount}`);
          } else {
            portResult = 'fail:pipeline';
            log('Pipeline failed');
          }
        }

        attemptRecord.portResult = portResult;

        // Save source if requested
        if (opts.saveSources) {
          const srcPath = path.join(SURVEY_DIR, `${sourceHash}.js`);
          fs.writeFileSync(srcPath, tdcSource, 'utf8');
          log(`Saved source to ${srcPath}`);
        }

        // Store in seenHashes
        hashInfo = {
          tdcName,
          sourceLength,
          caseCount,
          template: config ? config.template : '?',
          portResult,
          config,
          count: 1,
          errorCodes: [],
        };
        seenHashes.set(sourceHash, hashInfo);
      }

      // (f) If porting succeeded, do a full CAPTCHA solve attempt
      if (hashInfo.portResult === 'ok' && hashInfo.config) {
        try {
          const config = hashInfo.config;

          // Download images
          const { bgBuffer, sliceBuffer } = await client.downloadImages(sig);
          log(`Images: bg=${bgBuffer.length}b, slice=${sliceBuffer.length}b`);

          // Solve slider
          const rawOffset = await solveSlider(bgBuffer, sliceBuffer);
          log(`rawOffset: ${rawOffset}`);

          // Compute answer
          const spt = sig.spt || '0';
          const xAnswer = rawOffset;
          const yAnswer = Math.floor(parseInt(spt, 10)) || 0;
          const ans = `${xAnswer},${yAnswer};`;

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

          // Generate collect token
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

          let collectVal = collectEncoded;
          if (collectVal.includes('%')) {
            try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* leave as-is */ }
          }

          // Get vm-slide source (use fallback)
          const currentVmSlide = vmSlideSource;
          if (!currentVmSlide) {
            throw new Error('No vm-slide source available');
          }
          if (!jquerySource) {
            throw new Error('No jQuery source available');
          }

          // Build POST fields
          const postFields = buildPostFields(client, session, sig, ans, collectVal, eks);

          // Generate vData
          const { vData, serializedBody } = generateVData(
            postFields,
            currentVmSlide,
            jquerySource,
            { userAgent: DEFAULT_USER_AGENT }
          );
          log(`vData: ${vData.slice(0, 30)}...`);

          // Verify
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

          attemptRecord.errorCode = result.errorCode;
          hashInfo.errorCodes.push(result.errorCode);
          process.stderr.write(`hash=${sourceHash.slice(0, 8)} errorCode=${result.errorCode}\n`);

        } catch (err) {
          const errTag = err.message.includes('solve') ? 'err:solve' : 'err:verify';
          attemptRecord.errorCode = errTag;
          hashInfo.errorCodes.push(errTag);
          process.stderr.write(`hash=${sourceHash.slice(0, 8)} ${errTag}: ${err.message}\n`);
        }
      } else {
        // (g) Porting failed — skip verification
        attemptRecord.errorCode = '-';
        hashInfo.errorCodes.push('-');
        process.stderr.write(`hash=${sourceHash.slice(0, 8)} port=${hashInfo.portResult} (skipped)\n`);
      }

    } catch (err) {
      attemptRecord.error = err.message;
      attemptRecord.errorCode = 'err:session';
      process.stderr.write(`ERROR: ${err.message}\n`);
    }

    results.push(attemptRecord);

    // (i) Delay between attempts
    if (i < opts.attempts) {
      await sleep(opts.delay);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════

  // Print summary table to stdout
  const divider = '-'.repeat(17) + '+' + '-'.repeat(20) + '+' + '-'.repeat(9) + '+' +
    '-'.repeat(9) + '+' + '-'.repeat(10) + '+' + '-'.repeat(10) + '+' + '-'.repeat(30);
  console.log('');
  console.log('Hash             | TDC_NAME (first 8) | Size    | Opcodes | Port     | Attempts | errorCodes');
  console.log(divider);

  for (const [hash, info] of seenHashes) {
    const nameShort = (info.tdcName || '').slice(0, 8).padEnd(8);
    const size = String(info.sourceLength).padStart(7);
    const opcodes = info.caseCount !== null ? String(info.caseCount).padStart(7) : '      ?';
    const port = (info.portResult === 'ok' ? 'OK' : info.portResult.toUpperCase()).padEnd(8);
    const attempts = String(info.count).padStart(8);
    const codes = info.errorCodes.join(',');
    console.log(`${hash} | ${nameShort}           | ${size} | ${opcodes} | ${port} | ${attempts} | ${codes}`);
  }

  console.log('');
  console.log(`Total: ${opts.attempts} attempts, ${seenHashes.size} unique hashes`);

  // Build report
  const report = {
    timestamp: new Date().toISOString(),
    totalAttempts: opts.attempts,
    uniqueHashes: seenHashes.size,
    builds: [],
  };

  for (const [hash, info] of seenHashes) {
    report.builds.push({
      sourceHash: hash,
      tdcName: info.tdcName,
      sourceLength: info.sourceLength,
      caseCount: info.caseCount,
      template: info.template,
      portResult: info.portResult,
      attempts: info.count,
      errorCodes: info.errorCodes,
    });
  }

  const reportPath = path.join(SURVEY_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stderr.write(`[survey] Report saved to ${reportPath}\n`);
}

// Export for testing
if (require.main !== module) {
  module.exports = { parseArgs, buildPostFields };
}

if (require.main === module) {
  main().catch(err => {
    process.stderr.write(`[survey] Fatal error: ${err.message}\n`);
    process.exit(1);
  });
}
