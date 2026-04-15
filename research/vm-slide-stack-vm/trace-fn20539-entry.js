'use strict';

// Phase 44 task 44.2.7 — narrow runtime trace of fn 20539 (vm-slide's
// XMLHttpRequest.prototype.send replacement) entry.
//
// Purpose: decide whether the 112-byte vData plaintext is built INSIDE
// vm-slide (somewhere in the fn 20539 subtree) or OUTSIDE vm-slide (in the
// orchestrator, delivered via the intercepted XHR send). If arguments[0] at
// the moment fn 20539 is entered already has the 112-byte `key=value&...`
// shape, then fn 20539 is a pure encrypt stage and the builder is outside.
//
// Strategy (minimal, self-contained — does not touch the committed 43.1
// tracer):
//   1. Read sample/vm_slide.js and patch its FUNC_CREATE-spawned closure
//      entry point (the `return __TENCENT_CHAOS_VM(K,m,U,A,E,F,Y,c)` line)
//      to call a window-level __VMTAP_ENTER(K, arguments) hook before the
//      nested-VM call. The hook records the first call whose K === 20539.
//   2. Boot jsdom with the patched source, load jQuery 1.11.3, then
//      vm-slide. Fire jQuery.ajax POST /cap_union_new_verify with the HAR
//      field set (reusing sample/captcha-har.har for reproducibility).
//   3. Dump fn 20539's first `arguments[0]` to
//        output/vm-slide/fn-20539-entry-trace.json
//      along with basic counters (how many fn 20539 entries, how many fn
//      15918 entries, how many fn 15241 entries — all should be 1, 1, 14
//      per the Phase 44 task description and the 43.1 vdata-pipeline.json).
//
// Constraint: this script writes ONLY to output/vm-slide/. It does not
// modify tracers, fixtures, docs, tools, or build-fingerprint-plaintext.js.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const VM_SLIDE_PATH = path.join(ROOT, 'sample', 'vm_slide.js');
const JQUERY_PATH = path.join(ROOT, 'sample', 'slide-jy.js');
const HAR_PATH = path.join(ROOT, 'sample', 'captcha-har.har');
const OUT_DIR = path.join(ROOT, 'output', 'vm-slide');
const OUT_TRACE = path.join(OUT_DIR, 'fn-20539-entry-trace.json');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const FN_SEND_WRAPPER = 20539;
const FN_ENCRYPT_LOOP = 15918;
const FN_ENCRYPT_BLOCK = 15241;
const FN_OPEN_WRAPPER = 20353;

function loadHarFields() {
  const har = JSON.parse(fs.readFileSync(HAR_PATH, 'utf8'));
  for (const entry of har.log.entries) {
    if (entry.request.url.indexOf('cap_union_new_verify') !== -1) {
      const body = (entry.request.postData && entry.request.postData.text) || '';
      const params = new URLSearchParams(body);
      const fields = {};
      for (const [k, v] of params.entries()) {
        if (k === 'vData') continue;
        fields[k] = v;
      }
      return fields;
    }
  }
  throw new Error('cap_union_new_verify not found in HAR');
}

function patchVmSlide(src) {
  const PRE_ENTRY = ';return __TENCENT_CHAOS_VM(K,m,U,A,E,F,Y,c)';
  const PRE_ENTRY_PATCHED =
    ';if(typeof __VMTAP_ENTER==="function")__VMTAP_ENTER(K,arguments);' +
    'return __TENCENT_CHAOS_VM(K,m,U,A,E,F,Y,c)';
  if (src.indexOf(PRE_ENTRY) === -1) {
    throw new Error('PRE_ENTRY pattern not found in vm_slide.js');
  }
  return src.replace(PRE_ENTRY, PRE_ENTRY_PATCHED);
}

function summarizeArg(a) {
  if (a === null || a === undefined) return { kind: 'null' };
  const t = typeof a;
  if (t === 'string') {
    return {
      kind: 'string',
      length: a.length,
      head: a.slice(0, 256),
    };
  }
  if (t === 'number' || t === 'boolean') return { kind: t, value: a };
  if (t === 'function') return { kind: 'function' };
  if (Array.isArray(a)) return { kind: 'array', length: a.length };
  if (t === 'object') {
    try {
      return { kind: 'object', keys: Object.keys(a).slice(0, 32) };
    } catch (_e) {
      return { kind: 'object-unserializable' };
    }
  }
  return { kind: t };
}

function main() {
  const fields = loadHarFields();
  const vmSrc = fs.readFileSync(VM_SLIDE_PATH, 'utf8');
  const jq = fs.readFileSync(JQUERY_PATH, 'utf8');
  const patchedVm = patchVmSlide(vmSrc);

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://t.captcha.qq.com/cap_union_new_show',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    userAgent: USER_AGENT,
  });
  const w = dom.window;

  const counters = {};
  counters[FN_SEND_WRAPPER] = 0;
  counters[FN_OPEN_WRAPPER] = 0;
  counters[FN_ENCRYPT_LOOP] = 0;
  counters[FN_ENCRYPT_BLOCK] = 0;

  const captures = {
    fn_20539_first_args: null,
    fn_20353_first_args: null,
    fn_15918_first_args: null,
  };

  // Count every closure entry so we can see what other wrappers run
  // between fn 20539 and fn 15918.
  const allEntryCounts = {};
  const firstArgsById = {};

  w.__VMTAP_ENTER = function (K, args) {
    allEntryCounts[K] = (allEntryCounts[K] || 0) + 1;
    if (!(K in firstArgsById)) {
      const arr = [];
      for (let i = 0; i < args.length && i < 4; i++) arr.push(summarizeArg(args[i]));
      firstArgsById[K] = arr;
    }
    if (K === FN_SEND_WRAPPER) {
      counters[FN_SEND_WRAPPER]++;
      if (captures.fn_20539_first_args === null) {
        const arr = [];
        for (let i = 0; i < args.length; i++) arr.push(summarizeArg(args[i]));
        captures.fn_20539_first_args = arr;
      }
    } else if (K === FN_OPEN_WRAPPER) {
      counters[FN_OPEN_WRAPPER]++;
      if (captures.fn_20353_first_args === null) {
        const arr = [];
        for (let i = 0; i < args.length; i++) arr.push(summarizeArg(args[i]));
        captures.fn_20353_first_args = arr;
      }
    } else if (K === FN_ENCRYPT_LOOP) {
      counters[FN_ENCRYPT_LOOP]++;
      if (captures.fn_15918_first_args === null) {
        const arr = [];
        for (let i = 0; i < args.length; i++) arr.push(summarizeArg(args[i]));
        captures.fn_15918_first_args = arr;
      }
    } else if (K === FN_ENCRYPT_BLOCK) {
      counters[FN_ENCRYPT_BLOCK]++;
    }
  };

  // Pre-install XHR send hook BEFORE vm-slide patches it so we capture the
  // final body vm-slide forwards to native send.
  let capturedBody = null;
  w.XMLHttpRequest.prototype.send = function (body) {
    capturedBody = body;
  };

  w.eval(jq);
  if (typeof w.jQuery !== 'function') {
    throw new Error('jQuery did not load in jsdom');
  }
  w.eval(patchedVm);

  w.jQuery.ajax({
    type: 'POST',
    url: '/cap_union_new_verify',
    data: fields,
    timeout: 15000,
  });

  dom.window.close();

  const parsedBody = capturedBody ? new URLSearchParams(capturedBody) : null;
  const vDataOut = parsedBody ? parsedBody.get('vData') : null;

  const out = {
    schema_version: 1,
    task: '44.2.7',
    question:
      'Does vm-slide build the 112-byte plaintext inside fn 20539 or accept it as arguments[0]?',
    counters: {
      fn_20353_enter_count: counters[FN_OPEN_WRAPPER],
      fn_20539_enter_count: counters[FN_SEND_WRAPPER],
      fn_15918_enter_count: counters[FN_ENCRYPT_LOOP],
      fn_15241_enter_count: counters[FN_ENCRYPT_BLOCK],
    },
    fn_20539_first_args: captures.fn_20539_first_args,
    fn_20353_first_args: captures.fn_20353_first_args,
    fn_15918_first_args: captures.fn_15918_first_args,
    post_encrypt: {
      final_body_length: capturedBody ? capturedBody.length : null,
      vdata_length: vDataOut ? vDataOut.length : null,
      vdata_head: vDataOut ? vDataOut.slice(0, 32) : null,
    },
    conclusion: null,
    all_entry_counts: allEntryCounts,
    first_args_by_id: firstArgsById,
  };

  // Interpret the result.
  const firstArg = captures.fn_20539_first_args && captures.fn_20539_first_args[0];
  if (firstArg && firstArg.kind === 'string') {
    const head = firstArg.head || '';
    const hasAmp = head.indexOf('&') !== -1;
    const hasEq = head.indexOf('=') !== -1;
    if (firstArg.length === 112 && hasAmp && hasEq) {
      out.conclusion =
        'fn 20539 receives the full 112-byte `key=value&...` plaintext as arguments[0]. ' +
        'The builder is OUTSIDE vm-slide — orchestrator hands it to patched send().';
    } else if (firstArg.length > 0 && hasAmp && hasEq) {
      out.conclusion =
        'fn 20539 receives a `key=value&...` string as arguments[0] (length ' +
        firstArg.length +
        '). Builder appears to be outside vm-slide.';
    } else {
      out.conclusion =
        'fn 20539 receives a string arguments[0] but shape does not match the ' +
        '`key=value&...` pattern. Further analysis needed.';
    }
  } else {
    out.conclusion =
      'fn 20539 arguments[0] is not a string (or never entered). ' +
      'Check counters — if fn_20539_enter_count is 0, the patched path did not ' +
      'fire; if it is > 0 the shape is unexpected.';
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_TRACE, JSON.stringify(out, null, 2));
  console.log('wrote', OUT_TRACE);
  console.log('counters:', out.counters);
  console.log('conclusion:', out.conclusion);
}

main();
