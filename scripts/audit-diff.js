'use strict';

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scripts/audit-diff.js <audit1.json> <audit2.json>');
  process.exit(1);
}

const [file1, file2] = args;

// ---------------------------------------------------------------------------
// Load & validate
// ---------------------------------------------------------------------------

function loadAudit(fpath) {
  if (!fs.existsSync(fpath)) {
    console.error(`File not found: ${fpath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(fpath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`Invalid JSON in ${fpath}: ${e.message}`);
    process.exit(1);
  }
  if (!data.source || !Array.isArray(data.requests) || !data.tokens) {
    console.error(`Invalid audit schema in ${fpath} — need source, requests[], tokens`);
    process.exit(1);
  }
  return data;
}

const a = loadAudit(file1);
const b = loadAudit(file2);

// Assign to named slots regardless of arg order
let pptr, scraper;
if (a.source === 'puppeteer' && b.source === 'scraper') {
  pptr = a; scraper = b;
} else if (a.source === 'scraper' && b.source === 'puppeteer') {
  pptr = b; scraper = a;
} else {
  // Both same source or unknown — just label them by source field
  pptr = a;
  scraper = b;
}

const L_PPTR = pptr.source.charAt(0).toUpperCase() + pptr.source.slice(1);
const L_SCRA = scraper.source.charAt(0).toUpperCase() + scraper.source.slice(1);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function line(text) { console.log(text); }
function blank() { console.log(''); }
function banner(title) {
  blank();
  line(`${'═'.repeat(3)} ${title} ${'═'.repeat(Math.max(1, 60 - title.length))}`);
}

function truncate(s, max) {
  if (s == null) return '(null)';
  s = String(s);
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

// Query params known to vary between runs (random, timestamps, etc.)
const KNOWN_RANDOM_PARAMS = new Set([
  'rnd', 'createiframestart', '_', 'r', 'rand', 't', 'nocache',
]);

function parseUrl(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

// Group requests by step label
function groupByStep(requests) {
  const m = new Map();
  for (const r of requests) {
    const key = r.step || 'unknown';
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(r);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Section 1: Result
// ---------------------------------------------------------------------------

banner('RESULT');

function fmtResult(r) {
  if (!r) return '(no result)';
  const parts = [`errorCode=${r.errorCode}`];
  if (r.ticket) parts.push(`ticket=${truncate(r.ticket, 40)}`);
  else parts.push('ticket=none');
  if (r.randstr) parts.push(`randstr=${truncate(r.randstr, 30)}`);
  return parts.join(', ');
}

line(`  ${L_PPTR}: ${fmtResult(pptr.result)}`);
line(`  ${L_SCRA}: ${fmtResult(scraper.result)}`);

if (pptr.result && scraper.result) {
  if (pptr.result.errorCode === scraper.result.errorCode) {
    line('  -> errorCode matches');
  } else {
    line(`  -> !! errorCode DIFFERS: ${pptr.result.errorCode} vs ${scraper.result.errorCode}`);
  }
}

// ---------------------------------------------------------------------------
// Section 2: Request Chain
// ---------------------------------------------------------------------------

banner('REQUEST CHAIN');

const pptrSteps = groupByStep(pptr.requests);
const scraperSteps = groupByStep(scraper.requests);

const allStepLabels = new Set([...pptrSteps.keys(), ...scraperSteps.keys()]);
// Sort by first-seen seq
const stepOrder = [...allStepLabels].sort((a, b) => {
  const seqA = (pptrSteps.get(a) || scraperSteps.get(a))[0].seq;
  const seqB = (pptrSteps.get(b) || scraperSteps.get(b))[0].seq;
  return seqA - seqB;
});

for (const step of stepOrder) {
  const pReqs = pptrSteps.get(step) || [];
  const sReqs = scraperSteps.get(step) || [];

  line(`  Step: ${step} (${L_PPTR}:${pReqs.length}, ${L_SCRA}:${sReqs.length})`);

  if (pReqs.length === 0) {
    line(`    ${L_PPTR}: [missing]`);
    for (const r of sReqs) {
      line(`    ${L_SCRA}: ${r.method} ${truncate(r.url, 80)} -> ${r.responseStatus} (${r.duration ?? '?'}ms)`);
    }
    line(`    !! ${L_PPTR} missing this step`);
    blank();
    continue;
  }
  if (sReqs.length === 0) {
    for (const r of pReqs) {
      line(`    ${L_PPTR}: ${r.method} ${truncate(r.url, 80)} -> ${r.responseStatus} (${r.duration ?? '?'}ms)`);
    }
    line(`    ${L_SCRA}: [missing]`);
    line(`    !! ${L_SCRA} missing this step`);
    blank();
    continue;
  }

  // Compare paired requests (zip by index)
  const pairs = Math.max(pReqs.length, sReqs.length);
  for (let i = 0; i < pairs; i++) {
    const pr = pReqs[i];
    const sr = sReqs[i];
    if (i > 0) line('');

    if (pr) {
      line(`    ${L_PPTR}: ${pr.method} ${truncate(pr.url, 80)} -> ${pr.responseStatus} (${pr.duration ?? '?'}ms)`);
    } else {
      line(`    ${L_PPTR}: [no entry #${i + 1}]`);
    }
    if (sr) {
      line(`    ${L_SCRA}: ${sr.method} ${truncate(sr.url, 80)} -> ${sr.responseStatus} (${sr.duration ?? '?'}ms)`);
    } else {
      line(`    ${L_SCRA}: [no entry #${i + 1}]`);
    }

    if (pr && sr) {
      // Method
      if (pr.method !== sr.method) {
        line(`    !! Method differs: ${pr.method} vs ${sr.method}`);
      }
      // Status
      if (pr.responseStatus !== sr.responseStatus) {
        line(`    !! Response status differs: ${pr.responseStatus} vs ${sr.responseStatus}`);
      } else {
        line(`    ok status=${pr.responseStatus}`);
      }
      // URL path comparison
      const pUrl = parseUrl(pr.url);
      const sUrl = parseUrl(sr.url);
      if (pUrl && sUrl) {
        if (pUrl.pathname === sUrl.pathname) {
          line('    ok URL path matches');
        } else {
          line(`    !! URL path differs: ${pUrl.pathname} vs ${sUrl.pathname}`);
        }
        // Query param diff
        const pParams = new Map([...pUrl.searchParams.entries()]);
        const sParams = new Map([...sUrl.searchParams.entries()]);
        const allParamKeys = new Set([...pParams.keys(), ...sParams.keys()]);
        const diffs = [];
        for (const k of allParamKeys) {
          const pv = pParams.get(k);
          const sv = sParams.get(k);
          if (pv === sv) continue;
          const random = KNOWN_RANDOM_PARAMS.has(k.toLowerCase());
          if (pv == null) {
            diffs.push(`  ${k}: only in ${L_SCRA}${random ? ' (random)' : ''}`);
          } else if (sv == null) {
            diffs.push(`  ${k}: only in ${L_PPTR}${random ? ' (random)' : ''}`);
          } else {
            diffs.push(`  ${k}: ${L_PPTR}="${truncate(pv, 30)}" ${L_SCRA}="${truncate(sv, 30)}"${random ? ' (random)' : ''}`);
          }
        }
        if (diffs.length > 0) {
          line(`    Query param differences (${diffs.length}):`);
          for (const d of diffs) line(`      ${d}`);
        }
      }
    }
  }

  if (pReqs.length !== sReqs.length) {
    line(`    !! Count mismatch: ${L_PPTR}=${pReqs.length} ${L_SCRA}=${sReqs.length}`);
  }
  blank();
}

// ---------------------------------------------------------------------------
// Section 3: Header Comparison (focus on matching steps)
// ---------------------------------------------------------------------------

banner('HEADERS');

for (const step of stepOrder) {
  const pReqs = pptrSteps.get(step) || [];
  const sReqs = scraperSteps.get(step) || [];
  if (pReqs.length === 0 || sReqs.length === 0) continue;

  // Compare first request pair (most important)
  const pr = pReqs[0];
  const sr = sReqs[0];
  const pH = pr.requestHeaders || {};
  const sH = sr.requestHeaders || {};

  // Normalize to lowercase maps
  const pNorm = new Map();
  for (const [k, v] of Object.entries(pH)) pNorm.set(k.toLowerCase(), v);
  const sNorm = new Map();
  for (const [k, v] of Object.entries(sH)) sNorm.set(k.toLowerCase(), v);

  const allKeys = new Set([...pNorm.keys(), ...sNorm.keys()]);
  const pptrOnly = [];
  const scraperOnly = [];
  const matching = [];
  const differing = [];

  for (const k of [...allKeys].sort()) {
    const pv = pNorm.get(k);
    const sv = sNorm.get(k);
    if (pv != null && sv == null) {
      pptrOnly.push(k);
    } else if (pv == null && sv != null) {
      scraperOnly.push(k);
    } else if (pv === sv) {
      matching.push(k);
    } else {
      differing.push({ key: k, pv, sv });
    }
  }

  // Only print if there are differences
  if (pptrOnly.length === 0 && scraperOnly.length === 0 && differing.length === 0) continue;

  line(`  Step: ${step} (${pr.method})`);
  if (pptrOnly.length > 0) {
    line(`    ${L_PPTR}-only: ${pptrOnly.join(', ')}`);
  }
  if (scraperOnly.length > 0) {
    line(`    ${L_SCRA}-only: ${scraperOnly.join(', ')}`);
  }
  if (differing.length > 0) {
    line('    Different values:');
    for (const d of differing) {
      line(`      ${d.key}: ${L_PPTR}="${truncate(d.pv, 50)}" ${L_SCRA}="${truncate(d.sv, 50)}"`);
    }
  }
  if (matching.length > 0) {
    line(`    Matching headers (${matching.length}): ${matching.join(', ')}`);
  }
  blank();
}

// ---------------------------------------------------------------------------
// Section 4: Token Comparison
// ---------------------------------------------------------------------------

banner('TOKENS');

// Fields that are expected to differ per session
const SESSION_SPECIFIC = new Set([
  'nonce', 'sess', 'sid', 'vsig', 'websig', 'ans', 'collectEncoded',
  'vData', 'behavioralEventsCount',
]);

// Fields where we compare actual values
const STRUCTURAL_FIELDS = new Set([
  'eks', 'tlg', 'collectLength',
]);

const pTok = pptr.tokens || {};
const sTok = scraper.tokens || {};
const allTokKeys = new Set([...Object.keys(pTok), ...Object.keys(sTok)]);

for (const key of [...allTokKeys].sort()) {
  const pv = pTok[key];
  const sv = sTok[key];
  const pvStr = typeof pv === 'object' ? JSON.stringify(pv) : String(pv ?? '');
  const svStr = typeof sv === 'object' ? JSON.stringify(sv) : String(sv ?? '');

  if (pv == null && sv == null) continue;

  if (pv == null) {
    line(`  ${key}: ${L_PPTR}=(missing) ${L_SCRA}=${truncate(svStr, 40)} !! ${L_PPTR} missing`);
    continue;
  }
  if (sv == null) {
    line(`  ${key}: ${L_PPTR}=${truncate(pvStr, 40)} ${L_SCRA}=(missing) !! ${L_SCRA} missing`);
    continue;
  }

  if (SESSION_SPECIFIC.has(key)) {
    // Compare length/presence only
    const pvLen = typeof pv === 'string' ? pv.length : pvStr.length;
    const svLen = typeof sv === 'string' ? sv.length : svStr.length;
    const same = pvStr === svStr;
    line(`  ${key}: ${L_PPTR} len=${pvLen} ${L_SCRA} len=${svLen}${same ? ' (identical)' : ' (differs — expected, session-specific)'}`);
  } else if (STRUCTURAL_FIELDS.has(key)) {
    if (pvStr === svStr) {
      line(`  ${key}: ${truncate(pvStr, 50)} ok same`);
    } else {
      line(`  ${key}: ${L_PPTR}=${truncate(pvStr, 40)} ${L_SCRA}=${truncate(svStr, 40)} !! DIFFERS`);
    }
  } else {
    // Other fields — show comparison
    if (pvStr === svStr) {
      line(`  ${key}: ${truncate(pvStr, 50)} ok same`);
    } else {
      line(`  ${key}: ${L_PPTR}=${truncate(pvStr, 40)} ${L_SCRA}=${truncate(svStr, 40)} (differs)`);
    }
  }
}

// slideSd sub-field comparison if both present
if (pTok.slideSd && sTok.slideSd && typeof pTok.slideSd === 'object' && typeof sTok.slideSd === 'object') {
  line('');
  line('  slideSd sub-fields:');
  const pSd = pTok.slideSd;
  const sSd = sTok.slideSd;
  const sdKeys = new Set([...Object.keys(pSd), ...Object.keys(sSd)]);
  for (const k of [...sdKeys].sort()) {
    const pv = JSON.stringify(pSd[k] ?? null);
    const sv = JSON.stringify(sSd[k] ?? null);
    if (pv === sv) {
      line(`    ${k}: ${truncate(pv, 50)} ok same`);
    } else {
      // slideValue, coordinate differ per solve — expected
      const expected = ['slidevalue', 'coordinate'].includes(k.toLowerCase());
      line(`    ${k}: ${L_PPTR}=${truncate(pv, 30)} ${L_SCRA}=${truncate(sv, 30)}${expected ? ' (expected — per-solve)' : ' !! DIFFERS'}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Section 5: Summary
// ---------------------------------------------------------------------------

banner('SUMMARY');

const pptrStepList = [...pptrSteps.keys()];
const scraperStepList = [...scraperSteps.keys()];
const missingInScraper = pptrStepList.filter(s => !scraperSteps.has(s));
const missingInPptr = scraperStepList.filter(s => !pptrSteps.has(s));

line(`  ${L_PPTR}: ${pptr.requests.length} requests (${pptrStepList.length} steps: ${pptrStepList.join(', ')})`);
line(`  ${L_SCRA}: ${scraper.requests.length} requests (${scraperStepList.length} steps: ${scraperStepList.join(', ')})`);

if (missingInScraper.length > 0) {
  line(`  Missing in ${L_SCRA}: ${missingInScraper.join(', ')}`);
}
if (missingInPptr.length > 0) {
  line(`  Missing in ${L_PPTR}: ${missingInPptr.join(', ')}`);
}

// Key differences auto-summary
blank();
line('  Key differences:');
let diffNum = 0;

// Result difference
if (pptr.result && scraper.result && pptr.result.errorCode !== scraper.result.errorCode) {
  diffNum++;
  line(`  ${diffNum}. Result errorCode differs: ${L_PPTR}=${pptr.result.errorCode} vs ${L_SCRA}=${scraper.result.errorCode}`);
}

// Missing steps
if (missingInScraper.length > 0) {
  diffNum++;
  line(`  ${diffNum}. ${L_SCRA} missing ${missingInScraper.length} step(s): ${missingInScraper.join(', ')}`);
}
if (missingInPptr.length > 0) {
  diffNum++;
  line(`  ${diffNum}. ${L_PPTR} missing ${missingInPptr.length} step(s): ${missingInPptr.join(', ')}`);
}

// Request count per step mismatches
for (const step of stepOrder) {
  const pLen = (pptrSteps.get(step) || []).length;
  const sLen = (scraperSteps.get(step) || []).length;
  if (pLen > 0 && sLen > 0 && pLen !== sLen) {
    diffNum++;
    line(`  ${diffNum}. Step '${step}' request count differs: ${L_PPTR}=${pLen} ${L_SCRA}=${sLen}`);
  }
}

// Token field missing in one side
for (const key of [...allTokKeys].sort()) {
  const pv = pTok[key];
  const sv = sTok[key];
  if (pv != null && sv == null) {
    diffNum++;
    line(`  ${diffNum}. Token '${key}' missing in ${L_SCRA}`);
  } else if (pv == null && sv != null) {
    diffNum++;
    line(`  ${diffNum}. Token '${key}' missing in ${L_PPTR}`);
  } else if (STRUCTURAL_FIELDS.has(key) && pv != null && sv != null) {
    const pvs = typeof pv === 'object' ? JSON.stringify(pv) : String(pv);
    const svs = typeof sv === 'object' ? JSON.stringify(sv) : String(sv);
    if (pvs !== svs) {
      diffNum++;
      line(`  ${diffNum}. Structural token '${key}' differs: ${L_PPTR}=${truncate(pvs, 30)} ${L_SCRA}=${truncate(svs, 30)}`);
    }
  }
}

// Header diffs on verify step
for (const step of ['verify']) {
  const pReqs = pptrSteps.get(step) || [];
  const sReqs = scraperSteps.get(step) || [];
  if (pReqs.length === 0 || sReqs.length === 0) continue;
  const pH = pReqs[0].requestHeaders || {};
  const sH = sReqs[0].requestHeaders || {};
  const pKeys = new Set(Object.keys(pH).map(k => k.toLowerCase()));
  const sKeys = new Set(Object.keys(sH).map(k => k.toLowerCase()));
  const verifyPptrOnly = [...pKeys].filter(k => !sKeys.has(k));
  const verifyScraperOnly = [...sKeys].filter(k => !pKeys.has(k));
  if (verifyPptrOnly.length > 0) {
    diffNum++;
    line(`  ${diffNum}. Verify POST: ${L_PPTR}-only headers: ${verifyPptrOnly.join(', ')}`);
  }
  if (verifyScraperOnly.length > 0) {
    diffNum++;
    line(`  ${diffNum}. Verify POST: ${L_SCRA}-only headers: ${verifyScraperOnly.join(', ')}`);
  }
}

if (diffNum === 0) {
  line('  (none found)');
}

blank();
