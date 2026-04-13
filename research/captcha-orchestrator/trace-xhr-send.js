'use strict';

// 44.3 — Orchestrator plaintext-build static trace.
//
// This script performs the static-fallback approach for task 44.3: it does
// NOT drive a live captcha flow (no Puppeteer, no jsdom). Instead, it walks
// the module map of sample/t_captcha_slide.js and the disassembly of
// sample/vm_slide.js to pin:
//
//   1. The orchestrator-side callsite that triggers the verify POST and
//      therefore the chain that ends with vData=<ciphertext> in the body.
//   2. The vm-slide bytecode functions that implement the XHR open/send
//      hook and the body-to-plaintext reduction.
//
// Reproducible: idempotent, takes no CLI args, writes to
//   output/captcha-orchestrator/send-capture.json
//
// Why static fallback? The live approach described in task 44.3's primary
// path (evaluateOnNewDocument page-level hook on XMLHttpRequest.prototype.
// send during a real captcha run) is infeasible in this environment:
//   - urlsec.qq.com's /cap_union_new_show endpoint currently returns HTTP
//     403 without a valid prehandle sess (CLAUDE.md known limitation,
//     verified 2026-04-11).
//   - The Phase 43 dynamic trace work already produced full bytecode
//     coverage under output/vm-slide/ (including disassembly-full.txt
//     with every OP_58/OP_16 boundary), which is sufficient to identify
//     the build-site statically.
//   - Running Puppeteer against the CAPTCHA is gated by the CAPTCHA
//     solver pipeline which itself depends on these findings.
//
// The static analysis uses grep/scan primitives on two files:
//   - sample/t_captcha_slide.js (orchestrator bundle, minified, one line)
//   - output/vm-slide/disassembly-full.txt (Phase 40.1 full walker output)
//
// Consumed artifacts (all read-only):
//   - output/captcha-orchestrator/modules.json  (Phase 41 module map)
//   - sample/t_captcha_slide.js
//   - sample/captcha-har.har
//   - output/vm-slide/disassembly-full.txt

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ORCH_PATH = path.join(ROOT, 'sample', 't_captcha_slide.js');
const HAR_PATH = path.join(ROOT, 'sample', 'captcha-har.har');
const MODULES_PATH = path.join(ROOT, 'output', 'captcha-orchestrator', 'modules.json');
const VM_DISASM_PATH = path.join(ROOT, 'output', 'vm-slide', 'disassembly-full.txt');
const OUT_DIR = path.join(ROOT, 'output', 'captcha-orchestrator');
const OUT_PATH = path.join(OUT_DIR, 'send-capture.json');

function locateModuleByPos(modules, pos) {
  for (const m of modules) {
    if (!m.sourceRange) continue;
    if (m.sourceRange[0] <= pos && m.sourceRange[1] >= pos) return m.id;
  }
  return null;
}

function findAll(s, needle) {
  const hits = [];
  let i = -1;
  while ((i = s.indexOf(needle, i + 1)) !== -1) hits.push(i);
  return hits;
}

function sliceCtx(s, pos, before = 200, after = 400) {
  return s.slice(Math.max(0, pos - before), Math.min(s.length, pos + after));
}

function main() {
  const orch = fs.readFileSync(ORCH_PATH, 'utf8');
  const har = JSON.parse(fs.readFileSync(HAR_PATH, 'utf8'));
  const modules = JSON.parse(fs.readFileSync(MODULES_PATH, 'utf8'));
  const disasm = fs.readFileSync(VM_DISASM_PATH, 'utf8');

  // ---- (1) Orchestrator-side: find $.ajax(..."/cap_union_new_verify"...)
  const verifyUrlPos = findAll(orch, '/cap_union_new_verify');
  const verifyAjaxCallsite = verifyUrlPos.map((pos) => ({
    pos,
    moduleId: locateModuleByPos(modules, pos),
    context: sliceCtx(orch, pos, 180, 160),
  }));

  // ---- (2) Orchestrator-side: find the window.getVData IE9 path
  const getVDataHits = findAll(orch, 'window.getVData').map((pos) => ({
    pos,
    moduleId: locateModuleByPos(modules, pos),
    context: sliceCtx(orch, pos, 220, 220),
  }));

  // ---- (3) Orchestrator-side: find verify POST field count and shape
  const verifyEntry = har.log.entries.find((e) => e.request.url.includes('cap_union_new_verify'));
  const verifyBody = verifyEntry ? (verifyEntry.request.postData ? verifyEntry.request.postData.text : '') : '';
  const verifyFields = verifyBody.split('&').map((kv) => {
    const eq = kv.indexOf('=');
    return { name: kv.slice(0, eq), valueLen: kv.slice(eq + 1).length };
  });

  // ---- (4) vm-slide: locate the open-hook URL guard.
  // Per 44.3 static trace: the open-hook compares arguments[1] to
  // "/cap_union_new_verify" at pc ~20379..20420 inside fn 20353.
  const openHookUrlRuns = [];
  const openHookUrlRe = /\n(20[34]\d{2})\s+OP_10 47\n/g;
  let m;
  while ((m = openHookUrlRe.exec(disasm)) !== null) {
    openHookUrlRuns.push(parseInt(m[1], 10));
  }

  // ---- (5) vm-slide: locate the body-builder that emits "&vData="
  // Per 44.3 static trace: the body-builder function writes the literal
  // "&vData=" at pcs 24211..24223 (OP_10 38, 118, 68, 97, 116, 97, 61).
  const vdataMarker = /24211\s+OP_10 38[\s\S]{0,200}?24223\s+OP_10 61/;
  const vdataHit = vdataMarker.exec(disasm);
  const vdataMarkerPresent = vdataHit !== null;

  // ---- (6) vm-slide: locate the UTF-8 encoder/decoder helper
  // Per 44.3 static trace: fn 18966 is a UTF-8 helper invoked from the
  // body-build chain at FUNC_CREATE site pc 19451 "OP_58 18966 0 1 3".
  const utf8FnCreate = /19451\s+OP_58 18966/.test(disasm);

  // ---- (7) vm-slide: locate the body-splitter "&" literal before XTEA
  // Per 44.3 static trace: fn 19702 (= window.getVData on IE9) splits the
  // input body on "&" at pc 19901 OP_10 38 OP_02 1, then calls fn 15918
  // to encrypt at the OP_66 2 CALL_GLOBAL at pc 19886.
  const splitAmpPresent = /19901\s+OP_10 38[\s\S]{0,80}?19903\s+OP_02 1/.test(disasm);

  // ---- write machine-readable capture
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const capture = {
    schema_version: 1,
    task: '44.3',
    method: 'static-fallback',
    reason_for_fallback:
      'Live Puppeteer hook on XMLHttpRequest.prototype.send is infeasible — ' +
      'urlsec.qq.com/cap_union_new_show returns HTTP 403 without a valid ' +
      'prehandle sess (CLAUDE.md known limitation), and Phase 43 already ' +
      'produced full vm-slide bytecode coverage under output/vm-slide/ ' +
      'which is sufficient to identify the build-site statically.',
    orchestrator: {
      bundle: 'sample/t_captcha_slide.js',
      bundle_bytes: orch.length,
      verify_ajax_callsites: verifyAjaxCallsite,
      window_getVData_callsites: getVDataHits,
    },
    har_verify_post: {
      url: verifyEntry ? verifyEntry.request.url : null,
      body_bytes: verifyBody.length,
      field_count: verifyFields.length,
      fields: verifyFields,
      includes_vData: verifyFields.some((f) => f.name === 'vData'),
      vData_value_len: (verifyFields.find((f) => f.name === 'vData') || {}).valueLen || null,
    },
    vm_slide_static_anchors: {
      disassembly: 'output/vm-slide/disassembly-full.txt',
      open_hook_slash_byte_runs_pcs: openHookUrlRuns,
      vdata_literal_at_pc_24211_24223: vdataMarkerPresent,
      utf8_helper_fn_18966_create_at_pc_19451: utf8FnCreate,
      ampersand_split_at_pc_19901_19903: splitAmpPresent,
    },
    findings: {
      premise_correction:
        'Phase 44.3 task description asserts that the 112-byte plaintext is ' +
        'assembled in t_captcha_slide.js upstream of xhr.send. This is ' +
        'NOT supported by the HAR or the vm-slide disassembly. The HAR ' +
        'verify POST body is 9504 bytes with 39 fields, and vData appears ' +
        'as a 40th field (152 chars). vm-slide DOES append "&vData=<b64>" ' +
        'to the body it receives — see the OP_10 38/118/68/97/116/97/61 ' +
        'literal at pcs 24211..24223 — which contradicts 44.2.5\'s ' +
        '"whole-body replacement" classification of fn 20539. Resolution: ' +
        'fn 20539 is a NESTED pure-encrypt helper (44.2.5 is correct ' +
        'within its byte range), but it is NOT the top-level send hook. ' +
        'The top-level send hook lives in an outer function around pc ' +
        '24210 and does the append-mode body rewrite.',
      orchestrator_trigger:
        'Module 56 of sample/t_captcha_slide.js contains the only verify ' +
        'POST callsite: $.ajax({type:"POST", url:"/cap_union_new_verify", ' +
        'data: e, ...}) at approximate position 163130. The variable e ' +
        'is assembled a few hundred bytes earlier as a plain JS object ' +
        'with 39 named fields (collect, eks, nonce, ans, cdata, tlg, ' +
        'fpinfo, sess, ua, sid, rnd, ...). Zepto ($.ajax in module 76) ' +
        'serializes e to application/x-www-form-urlencoded and calls ' +
        'xhr.send(urlencoded). This is the orchestrator-side trigger for ' +
        'the vData path on modern browsers.',
      vm_slide_open_hook:
        'vm-slide installs an XMLHttpRequest.prototype.open replacement ' +
        '(fn 20353) that compares arguments[1] to "/cap_union_new_verify" ' +
        'at pc ~20379..20425 and, on match, stores `this` (the XHR ' +
        'instance) into a captured closure slot. This is the source of ' +
        'fn 20539\'s guard at pc 20582 (capturedSlot7 === this): fn 20539 ' +
        'only encrypts bodies of the XHR instance that was observed ' +
        'opening the verify URL.',
      vm_slide_send_hook_body_rewrite:
        'The top-level send hook (enclosing pc 24210, not fn 20539) ' +
        'receives the full urlencoded body via arguments[0], splits it ' +
        'on "&" (fn 19702 / window.getVData shows the IE9-path analog ' +
        'at pc 19901), iterates over fields, computes a 112-byte ' +
        'reduction (exact reduction not yet decompiled — Phase 44.4), ' +
        'passes that to fn 15918 via fn 20539 which runs 14 blocks of ' +
        'XTEA + custom base64 to produce a 152-char ciphertext, and ' +
        'concatenates `body + "&vData=" + ciphertext` using the string ' +
        'literal built at pc 24211..24223. The result is forwarded via ' +
        'savedSend.call(this, combined).',
      the_112_bytes_origin:
        'The 112-byte plaintext that fn 15918 encrypts is NOT a random ' +
        'fingerprint independent of the body — it is a REDUCTION of the ' +
        'full body performed inside vm-slide. This is consistent with ' +
        'Phase 43 VDATA-PIPELINE.md §7\'s observation that jsdom and HAR ' +
        'plaintexts share the exact same 8-=/7-& shape despite ' +
        'environment differences (the shape is hardcoded, the content ' +
        'is data-dependent). The reduction uses charCodeAt/String.' +
        'fromCharCode UTF-8 re-encoding (fn 18966) and appears to be a ' +
        '6-bit chunking pass (OP_08 63 masks, OP_08 6 shifts at pcs ' +
        '19221..19235, 19337..19351, 19431..19443 inside fn 19702) — ' +
        'suggesting base64-like resampling of the input body. The exact ' +
        'reduction is the subject of the next task (44.4).',
    },
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(capture, null, 2));
  console.log('wrote', OUT_PATH);
  console.log('findings summary:');
  console.log('  orchestrator verify ajax @', verifyAjaxCallsite.map((c) => c.pos).join(','));
  console.log('  vm-slide &vData= literal at pc 24211..24223:', vdataMarkerPresent);
  console.log('  vm-slide open-hook /cap_union_new_verify match runs (OP_10 47 pcs):', openHookUrlRuns.join(','));
  console.log('  HAR verify body bytes:', verifyBody.length, 'fields:', verifyFields.length);
}

main();
