'use strict';

// Phase 43 task 43.1 — vData dynamic pipeline trace.
//
// Goal: pin down the byte-level vData pipeline (XTEA key, plaintext layout,
// ciphertext, output assembly) by instrumenting vm-slide's own VM dispatch
// loop while it runs the proxyXHR XHR-interceptor path inside a jsdom
// harness. This is the white-box counterpart to research/vm-slide-stack-vm/vdata-harness.js
// (which is purely black-box).
//
// Strategy:
//   1. Read sample/vm_slide.js as a string.
//   2. Inject a single-line tap into the dispatch loop
//        for(var B=!1;!B;)B=Q[m[g++]]()
//      so that each instruction reports (g_before, opcode, n_top) to a
//      __VMTAP collector installed on the jsdom window. The tap is gated on
//      a pc range so it only fires for the target regions; everywhere else
//      it is a single comparison.
//   3. Wrap the FUNC_CREATE-spawned closure entry to record (entry_pc, A)
//      so we can see the locals of every newly-entered closure.
//   4. Boot jsdom with the patched source, load jQuery + patched vm-slide,
//      fire a $.ajax POST against /cap_union_new_verify with the HAR field
//      set, capture the body off a pre-installed XHR send hook.
//   5. Walk the trace:
//        - find every entry to function 15241 (encrypt closure). Its arg 1
//          is [v0, v1] (one 8-byte block) and its closure local 4 is the
//          16-byte XTEA key. Recover both from the captured A snapshots.
//        - concatenate every encrypt entry in temporal order to recover
//          the ciphertext byte stream.
//        - reconstruct plaintext blocks from the v0/v1 pairs at function
//          entry.
//   6. Decode the captured vData string against the known custom-base64
//      alphabet to verify the ciphertext byte-stream matches.
//   7. Write output/vm-slide/vdata-pipeline.json (spec) and
//      output/vm-slide/vdata-dynamic-trace.json (raw trace window).
//
// Idempotent: takes no CLI args, overwrites the same two output files.
// Reproducibility: re-runs against the committed sample/captcha-har.har
// reference field set; the harness vData will differ per run (because the
// session field varies by orchestrator), but the pipeline structure and
// the XTEA key should be invariant.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const VM_SLIDE_PATH = path.join(ROOT, 'sample', 'vm_slide.js');
const JQUERY_PATH = path.join(ROOT, 'sample', 'slide-jy.js');
const HAR_PATH = path.join(ROOT, 'sample', 'captcha-har.har');
const OUT_DIR = path.join(ROOT, 'output', 'vm-slide');
const OUT_PIPELINE = path.join(OUT_DIR, 'vdata-pipeline.json');
const OUT_TRACE = path.join(OUT_DIR, 'vdata-dynamic-trace.json');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const CUSTOM_ALPHABET =
  'GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY';

// XTEA closure entry pcs (Phase 40.6).
const ENC_ENTRY = 15241;
const DEC_ENTRY = 15416;
const FACTORY_ENTRY = 15220;

// ---------------------------------------------------------------------------
// 1. Read the verify POST field set from the HAR.
// ---------------------------------------------------------------------------
function loadHarVerify() {
  const har = JSON.parse(fs.readFileSync(HAR_PATH, 'utf8'));
  for (const entry of har.log.entries) {
    if (entry.request.url.indexOf('cap_union_new_verify') !== -1) {
      const body = (entry.request.postData && entry.request.postData.text) || '';
      const params = new URLSearchParams(body);
      const fields = {};
      // Preserve every field except vData itself (which we will regenerate).
      for (const [k, v] of params.entries()) {
        if (k === 'vData') continue;
        fields[k] = v;
      }
      const vData = params.get('vData') || null;
      return { fields, referenceVData: vData, fullBody: body };
    }
  }
  throw new Error('cap_union_new_verify not found in HAR');
}

// ---------------------------------------------------------------------------
// 2. Patch sample/vm_slide.js source: inject a dispatch-loop tap and a
//    function-entry tap. Both call out to globals on the jsdom window so the
//    Node side can collect samples without modifying vm-slide's semantics.
// ---------------------------------------------------------------------------
function patchVmSlide(src) {
  const DISPATCH_ORIGINAL = 'for(var B=!1;!B;)B=Q[m[g++]]()';
  // The replacement preserves the loop semantics and adds a single tap call
  // BEFORE the opcode dispatch. The tap reports (pc_before_fetch, m, n).
  // Tap is a no-op when window.__VMTAP is undefined.
  const DISPATCH_PATCHED =
    'for(var B=!1;!B;){' +
    'if(typeof __VMTAP_DISPATCH==="function")__VMTAP_DISPATCH(g,m,n);' +
    'B=Q[m[g++]]();' +
    '}';

  if (src.indexOf(DISPATCH_ORIGINAL) === -1) {
    throw new Error('dispatch loop pattern not found in vm_slide.js — cannot patch');
  }
  let out = src.replace(DISPATCH_ORIGINAL, DISPATCH_PATCHED);

  // Function-entry tap. The closure factory builds a new stack `A`, then
  // returns a function `w` that calls __TENCENT_CHAOS_VM(K,m,U,A,...). We
  // intercept just before that call so we get (entry_pc=K, locals=A) for
  // every newly-entered closure.
  const ENTRY_ORIGINAL = 'return __TENCENT_CHAOS_VM(K,m,U,A,E,F,Y,c)';
  const ENTRY_PATCHED =
    '(typeof __VMTAP_ENTER==="function"&&__VMTAP_ENTER(K,A,arguments)),' +
    'return __TENCENT_CHAOS_VM(K,m,U,A,E,F,Y,c)';
  // The above is invalid JS (return-after-comma). Use a block instead.
  const ENTRY_PATCHED_BLOCK =
    '{if(typeof __VMTAP_ENTER==="function")__VMTAP_ENTER(K,A,arguments);' +
    'return __TENCENT_CHAOS_VM(K,m,U,A,E,F,Y,c);}';

  if (out.indexOf(ENTRY_ORIGINAL) === -1) {
    throw new Error('closure entry pattern not found in vm_slide.js — cannot patch');
  }
  // Replace `return __TENCENT_CHAOS_VM(...)` with a braced block. To do this
  // safely we need the surrounding context; find `;return __TENCENT_CHAOS_VM`
  // and prepend the entry tap before the return.
  const PRE_ENTRY = ';return __TENCENT_CHAOS_VM(K,m,U,A,E,F,Y,c)';
  const PRE_ENTRY_PATCHED =
    ';if(typeof __VMTAP_ENTER==="function")__VMTAP_ENTER(K,A,arguments);' +
    'return __TENCENT_CHAOS_VM(K,m,U,A,E,F,Y,c)';
  if (out.indexOf(PRE_ENTRY) === -1) {
    throw new Error('PRE_ENTRY pattern not found — vm_slide.js layout changed');
  }
  out = out.replace(PRE_ENTRY, PRE_ENTRY_PATCHED);

  return out;
}

// ---------------------------------------------------------------------------
// 3. Run the harness with the dispatch / entry taps installed.
// ---------------------------------------------------------------------------
function runInstrumentedHarness(fields) {
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

  // Tap state lives on the window so the patched vm-slide can reach it.
  // We collect samples sparingly to keep memory bounded.
  const dispatchHits = [];
  const entryHits = [];
  // Range gate for the dispatch tap: only the encrypt/decrypt closures
  // (15220..15600) and the proxyXHR body window (19500..20800).
  function inRange(g) {
    return (g >= 15220 && g <= 15600) || (g >= 19500 && g <= 20800);
  }

  // We only need the FIRST few thousand dispatch samples per closure entry
  // — sealing a budget keeps memory reasonable across the millions of
  // instructions vm-slide executes during its boot.
  const DISPATCH_BUDGET = 200000;
  let dispatchCount = 0;

  // Snapshot the locals A as plain numbers/strings/arrays. A is structured
  // as A[i] = [value]; we strip the wrapper array.
  function snapshotLocals(A) {
    const out = [];
    for (let i = 0; i < A.length; i++) {
      const slot = A[i];
      if (slot === undefined) {
        out.push(null);
        continue;
      }
      const v = slot[0];
      if (v === undefined) {
        out.push(null);
      } else if (typeof v === 'function') {
        out.push('<fn>');
      } else if (typeof v === 'object' && v !== null) {
        try {
          if (Array.isArray(v)) {
            out.push(['<arr>', v.length, v.slice(0, 16).map(simplify)]);
          } else {
            out.push(['<obj>', Object.keys(v).slice(0, 16)]);
          }
        } catch (e) {
          out.push('<unserializable>');
        }
      } else {
        out.push(v);
      }
    }
    return out;
  }
  function simplify(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'function') return '<fn>';
    if (typeof v === 'object') {
      if (Array.isArray(v)) return ['<arr>', v.length];
      return '<obj>';
    }
    return v;
  }

  w.__VMTAP_DISPATCH = function (g, m, n) {
    if (!inRange(g)) return;
    if (dispatchCount >= DISPATCH_BUDGET) return;
    dispatchCount++;
    // Only record top-of-stack to keep size bounded.
    const top = n.length > 0 ? n[n.length - 1] : null;
    let topSimple = null;
    if (top !== null && top !== undefined) {
      if (typeof top === 'number' || typeof top === 'string' || typeof top === 'boolean') {
        topSimple = top;
      } else if (Array.isArray(top)) {
        topSimple = ['<arr>', top.length];
      } else if (typeof top === 'object') {
        topSimple = '<obj>';
      } else if (typeof top === 'function') {
        topSimple = '<fn>';
      }
    }
    dispatchHits.push([g, m[g], n.length, topSimple]);
  };

  w.__VMTAP_ENTER = function (K, A, args) {
    // Record entry for any function in [15000, 21000].
    if (K < 15000 || K > 21000) return;
    if (entryHits.length > 50000) return;
    // Snapshot args as numeric-or-object summaries.
    const argSummary = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === null || a === undefined) {
        argSummary.push(null);
      } else if (typeof a === 'number' || typeof a === 'string' || typeof a === 'boolean') {
        argSummary.push(a);
      } else if (Array.isArray(a)) {
        // shallow copy of numeric/string elements
        const flat = [];
        for (let j = 0; j < a.length && j < 64; j++) {
          const e = a[j];
          if (typeof e === 'number' || typeof e === 'string' || typeof e === 'boolean') {
            flat.push(e);
          } else if (Array.isArray(e)) {
            flat.push(['<arr>', e.length]);
          } else if (e === null) {
            flat.push(null);
          } else {
            flat.push('<obj>');
          }
        }
        argSummary.push(['<arr>', a.length, flat]);
      } else if (typeof a === 'object') {
        try {
          argSummary.push(['<obj>', Object.keys(a).slice(0, 16)]);
        } catch (e) {
          argSummary.push('<obj>');
        }
      } else {
        argSummary.push(typeof a);
      }
    }
    entryHits.push({
      entry: K,
      locals: snapshotLocals(A),
      args: argSummary,
    });
  };

  // Pre-install XHR send hook (BEFORE vm-slide patches it) so we capture the
  // final body containing vData.
  let capturedBody = null;
  w.XMLHttpRequest.prototype.send = function (body) {
    capturedBody = body;
  };

  // Load jQuery, then patched vm-slide.
  w.eval(jq);
  if (typeof w.jQuery !== 'function') {
    throw new Error('jQuery did not load in jsdom');
  }
  w.eval(patchedVm);

  // Fire the verify POST.
  w.jQuery.ajax({
    type: 'POST',
    url: '/cap_union_new_verify',
    data: fields,
    timeout: 15000,
  });

  if (capturedBody === null) {
    throw new Error('XHR.send was never called — patched vm-slide did not run proxyXHR');
  }

  const params = new URLSearchParams(capturedBody);
  const vData = params.get('vData');
  if (!vData) {
    throw new Error('vData missing from captured body — patch may have broken proxy');
  }

  dom.window.close();

  return { vData, capturedBody, dispatchHits, entryHits, dispatchCount };
}

// ---------------------------------------------------------------------------
// 4. Custom-base64 decode against the known alphabet.
// ---------------------------------------------------------------------------
function customBase64Decode(s, alphabet) {
  if (s.length % 4 !== 0) {
    throw new Error('custom base64 length not multiple of 4: ' + s.length);
  }
  const lookup = new Map();
  for (let i = 0; i < alphabet.length; i++) lookup.set(alphabet[i], i);
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const a = lookup.get(s[i]);
    const b = lookup.get(s[i + 1]);
    const c = lookup.get(s[i + 2]);
    const d = lookup.get(s[i + 3]);
    if (a === undefined || b === undefined || c === undefined || d === undefined) {
      throw new Error('non-alphabet char at index ' + i);
    }
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out.push((n >>> 16) & 0xff);
    out.push((n >>> 8) & 0xff);
    out.push(n & 0xff);
  }
  return Buffer.from(out);
}

function customBase64Encode(buf, alphabet) {
  if (buf.length % 3 !== 0) {
    throw new Error('plaintext byte length not multiple of 3: ' + buf.length);
  }
  let out = '';
  for (let i = 0; i < buf.length; i += 3) {
    const n = (buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2];
    out += alphabet[(n >>> 18) & 0x3f];
    out += alphabet[(n >>> 12) & 0x3f];
    out += alphabet[(n >>> 6) & 0x3f];
    out += alphabet[n & 0x3f];
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5. Standalone classical XTEA (for cross-check, not for use by vm-slide).
// ---------------------------------------------------------------------------
function xteaEncryptBlock(v0, v1, key /* 4 uint32 words */) {
  const delta = 0x9e3779b9;
  let sum = 0;
  v0 = v0 >>> 0;
  v1 = v1 >>> 0;
  for (let i = 0; i < 32; i++) {
    v0 = (v0 + ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + key[sum & 3]))) >>> 0;
    sum = (sum + delta) >>> 0;
    v1 = (v1 + ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + key[(sum >>> 11) & 3]))) >>> 0;
  }
  return [v0, v1];
}

function xteaDecryptBlock(v0, v1, key) {
  const delta = 0x9e3779b9;
  let sum = (delta * 32) >>> 0;
  v0 = v0 >>> 0;
  v1 = v1 >>> 0;
  for (let i = 0; i < 32; i++) {
    v1 = (v1 - ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + key[(sum >>> 11) & 3]))) >>> 0;
    sum = (sum - delta) >>> 0;
    v0 = (v0 - ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + key[sum & 3]))) >>> 0;
  }
  return [v0, v1];
}

// ---------------------------------------------------------------------------
// 6. Walk the entry trace to recover the encrypt closure's key + plaintext
//    blocks.
// ---------------------------------------------------------------------------
function recoverPipeline(trace) {
  const encEntries = trace.entryHits.filter((e) => e.entry === ENC_ENTRY);
  const decEntries = trace.entryHits.filter((e) => e.entry === DEC_ENTRY);
  const factoryEntries = trace.entryHits.filter((e) => e.entry === FACTORY_ENTRY);

  // Per Phase 40.6: encrypt closure local 4 holds the XTEA key (16 bytes),
  // and arg 1 (i.e. local 3 in the local file convention) holds [v0, v1].
  // The factory at 15220 takes 3 args; the key is one of them. Our entry tap
  // captures locals AS the new function is entered, so locals[i] is the
  // closure's local slot i. Plain arguments populate the slots indexed by
  // the FUNC_CREATE Q[] table; for encrypt that's slots 2..n.

  const candidates = {
    factory_calls: factoryEntries.length,
    encrypt_calls: encEntries.length,
    decrypt_calls: decEntries.length,
    first_encrypt_locals: encEntries.length > 0 ? encEntries[0].locals : null,
    first_encrypt_args: encEntries.length > 0 ? encEntries[0].args : null,
    first_factory_locals: factoryEntries.length > 0 ? factoryEntries[0].locals : null,
    first_factory_args: factoryEntries.length > 0 ? factoryEntries[0].args : null,
  };

  // Try to extract 16-byte key from encrypt locals: scan for an array of
  // length 16 of integers, or four uint32s.
  let keyWords = null;
  let keyHex = null;
  if (encEntries.length > 0) {
    for (const e of encEntries) {
      for (const slot of e.locals) {
        if (Array.isArray(slot) && slot[0] === '<arr>' && slot[1] === 16) {
          // Slot was summarized — we need the raw values
          const flat = slot[2];
          if (Array.isArray(flat) && flat.every((x) => typeof x === 'number')) {
            // assemble 4 uint32 BE from 16 bytes
            keyWords = [];
            for (let i = 0; i < 16; i += 4) {
              keyWords.push(
                ((flat[i] << 24) | (flat[i + 1] << 16) | (flat[i + 2] << 8) | flat[i + 3]) >>> 0
              );
            }
            keyHex = Buffer.from(flat).toString('hex');
            break;
          }
        }
        if (Array.isArray(slot) && slot[0] === '<arr>' && slot[1] === 4) {
          // Maybe already 4 uint32 words
          const flat = slot[2];
          if (Array.isArray(flat) && flat.every((x) => typeof x === 'number')) {
            keyWords = flat.map((x) => x >>> 0);
            const buf = Buffer.alloc(16);
            for (let i = 0; i < 4; i++) buf.writeUInt32BE(keyWords[i] >>> 0, i * 4);
            keyHex = buf.toString('hex');
            break;
          }
        }
      }
      if (keyWords) break;
    }
  }

  // Recover plaintext blocks: each encrypt entry's arg list head should be
  // [v0, v1] or two numeric args.
  const ptBlocks = [];
  for (const e of encEntries) {
    // args is the original arguments[]; we summarized arrays. Look for two
    // numeric args, or a 2-element array arg.
    if (e.args.length === 0) continue;
    const a0 = e.args[0];
    const a1 = e.args[1];
    if (typeof a0 === 'number' && typeof a1 === 'number') {
      ptBlocks.push([a0 >>> 0, a1 >>> 0]);
    } else if (Array.isArray(a0) && a0[0] === '<arr>' && a0[1] === 2) {
      const flat = a0[2];
      if (Array.isArray(flat) && flat.length >= 2 && typeof flat[0] === 'number' && typeof flat[1] === 'number') {
        ptBlocks.push([flat[0] >>> 0, flat[1] >>> 0]);
      }
    }
  }

  return { candidates, keyWords, keyHex, ptBlocks };
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('=== vData dynamic pipeline trace (43.1) ===');

  const har = loadHarVerify();
  console.log('HAR field count:', Object.keys(har.fields).length);
  console.log('HAR reference vData:', har.referenceVData ? `${har.referenceVData.slice(0, 32)}... (len=${har.referenceVData.length})` : '(none)');

  const harCipherBytes = har.referenceVData
    ? customBase64Decode(har.referenceVData, CUSTOM_ALPHABET)
    : null;
  console.log('HAR ciphertext bytes:', harCipherBytes ? harCipherBytes.length : 0,
              harCipherBytes ? '(=' + (harCipherBytes.length / 8) + ' XTEA blocks)' : '');

  console.log('Booting jsdom + patched vm-slide...');
  let trace;
  try {
    trace = runInstrumentedHarness(har.fields);
  } catch (err) {
    console.error('Harness run failed:', err.message);
    console.error(err.stack);
    process.exit(2);
  }

  console.log('Captured live vData:', trace.vData.slice(0, 32) + '... (len=' + trace.vData.length + ')');
  console.log('Dispatch tap budget:', trace.dispatchCount);
  console.log('Entry tap hits:', trace.entryHits.length);

  // Decode the live vData against the alphabet.
  let liveCipherBytes = null;
  try {
    liveCipherBytes = customBase64Decode(trace.vData, CUSTOM_ALPHABET);
    console.log('Live ciphertext bytes:', liveCipherBytes.length,
                '(=' + (liveCipherBytes.length / 8) + ' XTEA blocks)');
  } catch (err) {
    console.error('Live vData failed custom-base64 decode:', err.message);
  }

  const recovered = recoverPipeline(trace);
  console.log('Recovered:');
  console.log('  factory_calls:', recovered.candidates.factory_calls);
  console.log('  encrypt_calls:', recovered.candidates.encrypt_calls);
  console.log('  decrypt_calls:', recovered.candidates.decrypt_calls);
  console.log('  keyHex:', recovered.keyHex);
  console.log('  pt blocks recovered:', recovered.ptBlocks.length);

  // Build the spec JSON.
  const spec = {
    schema_version: 1,
    task: '43.1',
    har_reference: {
      vdata: har.referenceVData,
      vdata_length: har.referenceVData ? har.referenceVData.length : 0,
      ciphertext_hex: harCipherBytes ? harCipherBytes.toString('hex') : null,
      ciphertext_bytes: harCipherBytes ? harCipherBytes.length : 0,
      field_count: Object.keys(har.fields).length,
    },
    live_run: {
      vdata: trace.vData,
      vdata_length: trace.vData.length,
      ciphertext_hex: liveCipherBytes ? liveCipherBytes.toString('hex') : null,
      ciphertext_bytes: liveCipherBytes ? liveCipherBytes.length : 0,
    },
    output_alphabet: CUSTOM_ALPHABET,
    encrypt_entry_pc: ENC_ENTRY,
    decrypt_entry_pc: DEC_ENTRY,
    factory_entry_pc: FACTORY_ENTRY,
    xtea_key_hex: recovered.keyHex,
    xtea_key_words: recovered.keyWords,
    plaintext_blocks: recovered.ptBlocks,
    plaintext_hex: (function () {
      if (!recovered.ptBlocks.length) return null;
      const buf = Buffer.alloc(recovered.ptBlocks.length * 8);
      for (let i = 0; i < recovered.ptBlocks.length; i++) {
        buf.writeUInt32BE(recovered.ptBlocks[i][0] >>> 0, i * 8);
        buf.writeUInt32BE(recovered.ptBlocks[i][1] >>> 0, i * 8 + 4);
      }
      return buf.toString('hex');
    })(),
    plaintext_utf8_or_null: (function () {
      if (!recovered.ptBlocks.length) return null;
      const buf = Buffer.alloc(recovered.ptBlocks.length * 8);
      for (let i = 0; i < recovered.ptBlocks.length; i++) {
        buf.writeUInt32BE(recovered.ptBlocks[i][0] >>> 0, i * 8);
        buf.writeUInt32BE(recovered.ptBlocks[i][1] >>> 0, i * 8 + 4);
      }
      const utf8 = buf.toString('utf8');
      // Sanity: only return if mostly printable.
      let printable = 0;
      for (let i = 0; i < utf8.length; i++) {
        const c = utf8.charCodeAt(i);
        if (c >= 0x20 && c < 0x7f) printable++;
      }
      return printable / utf8.length > 0.8 ? utf8 : null;
    })(),
    sample_encrypt_entry: recovered.candidates.first_encrypt_locals
      ? {
          locals_summary: recovered.candidates.first_encrypt_locals,
          args_summary: recovered.candidates.first_encrypt_args,
        }
      : null,
    sample_factory_entry: recovered.candidates.first_factory_locals
      ? {
          locals_summary: recovered.candidates.first_factory_locals,
          args_summary: recovered.candidates.first_factory_args,
        }
      : null,
    notes: [
      'task 43.1: dynamic trace via instrumented jsdom harness.',
      'patched dispatch loop in sample/vm_slide.js by string substitution at runtime — sample/vm_slide.js itself is unmodified on disk.',
      'live_run.vdata is regenerated per session and will differ from har_reference.vdata; xtea_key_hex and plaintext_blocks are the load-bearing facts.',
    ],
  };

  fs.writeFileSync(OUT_PIPELINE, JSON.stringify(spec, null, 2));
  console.log('wrote', OUT_PIPELINE);

  // Trace window: just the encrypt/decrypt entry hits + a small dispatch
  // sample around the first encrypt call.
  const encEntries = trace.entryHits.filter((e) => e.entry === ENC_ENTRY);
  const decEntries = trace.entryHits.filter((e) => e.entry === DEC_ENTRY);
  const dispatchSample = trace.dispatchHits.slice(0, 1000);
  const traceOut = {
    schema_version: 1,
    task: '43.1',
    enc_entry_pc: ENC_ENTRY,
    dec_entry_pc: DEC_ENTRY,
    factory_entry_pc: FACTORY_ENTRY,
    encrypt_calls: encEntries.length,
    decrypt_calls: decEntries.length,
    encrypt_first_50: encEntries.slice(0, 50),
    decrypt_first_50: decEntries.slice(0, 50),
    dispatch_sample_first_1000: dispatchSample,
    dispatch_sample_size: trace.dispatchHits.length,
  };
  fs.writeFileSync(OUT_TRACE, JSON.stringify(traceOut, null, 2));
  console.log('wrote', OUT_TRACE);

  console.log('=== done ===');
}

main();
