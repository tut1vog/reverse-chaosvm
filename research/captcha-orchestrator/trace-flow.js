'use strict';

/**
 * trace-flow.js — task 41.5 deliverable.
 *
 * Reads:
 *   - sample/t_captcha_slide.js (the webpack bundle)
 *   - sample/captcha-har.har     (captured network flow)
 * Writes:
 *   - output/captcha-orchestrator/verify-body-origination.json
 *
 * Purpose:
 *   Emit a machine-readable origination table for every field that appears
 *   in the `/cap_union_new_verify` POST body in the HAR. Each row names the
 *   field, its sample value prefix, the webpack module id(s) + source line
 *   range where the field is assigned onto the `d` object (or "(upstream)"
 *   for fields passed through from the show-page URL query), the assembly
 *   method, and a one-to-two-sentence provenance narrative.
 *
 *   The origination table is derived primarily from hand-verified reads of
 *   module 56 (the orchestrator core) — see research/captcha-orchestrator/
 *   FLOW.md for the annotated source extract and citations. This script's
 *   job is to anchor each claim to a byte range in the live bundle and
 *   re-confirm the HAR side numerically so 41.6 can embed the JSON verbatim
 *   without re-deriving anything.
 *
 * Idempotent: running twice produces byte-identical output. No CLI args.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BUNDLE_PATH = path.join(ROOT, 'sample', 't_captcha_slide.js');
const HAR_PATH = path.join(ROOT, 'sample', 'captcha-har.har');
const MODULES_JSON = path.join(ROOT, 'output', 'captcha-orchestrator', 'modules.json');
const OUT_PATH = path.join(ROOT, 'output', 'captcha-orchestrator', 'verify-body-origination.json');

/**
 * Given the bundle source, a module id, and a substring, return the absolute
 * byte offset of the first occurrence of `needle` inside that module's
 * source range, plus the containing module id. Throws if not found.
 */
function locate(src, modules, id, needle) {
  const mod = modules.find((m) => m.id === id);
  if (!mod) throw new Error('module ' + id + ' not found');
  const [start, end] = mod.sourceRange;
  const body = src.slice(start, end);
  const idx = body.indexOf(needle);
  if (idx < 0) {
    throw new Error('needle not found in module ' + id + ': ' + JSON.stringify(needle));
  }
  return start + idx;
}

/**
 * Convert an absolute byte offset to a 1-based character column within the
 * bundle (the bundle is effectively single-line, so we report offsets as
 * "line 1, column N"). We keep the {line, col} shape for consistency with
 * the rest of the repo.
 */
function offsetToLineCol(src, offset) {
  let line = 1;
  let lastNl = -1;
  for (let i = 0; i < offset; i++) {
    if (src.charCodeAt(i) === 10) { line++; lastNl = i; }
  }
  return { line, col: offset - lastNl };
}

function harVerifyParams() {
  const har = JSON.parse(fs.readFileSync(HAR_PATH, 'utf8'));
  const entry = har.log.entries.find((e) => e.request.url.indexOf('cap_union_new_verify') >= 0);
  if (!entry) throw new Error('no cap_union_new_verify entry in HAR');
  if (!entry.request.postData || !Array.isArray(entry.request.postData.params)) {
    throw new Error('verify entry has no parsed postData.params');
  }
  return entry.request.postData.params;
}

function clip(s, n) {
  if (s == null) return '';
  return s.length > n ? s.slice(0, n) + '...' : s;
}

/**
 * The origination table. Each row is a rule; we resolve line numbers from
 * the bundle at run time. `writer` is one of:
 *   - { upstream: true }                       — passed through from show-URL query
 *   - { module: <id>, needle: '<substring>' }  — assignment lives in this module
 *   - { module: <id>, synthetic: true }        — assembled by this module but
 *       not as a single `d.<field> =` line (see provenance)
 */
const RULES = [
  // --- show-URL query passthrough (module 30 `queryMap` then copied wholesale) ---
  // These are the fields that were already in the iframe URL query when
  // cap_union_new_show rendered; module 56 reads them via
  //   d = a.queryMap();   // module 30 exports queryMap()
  // and then overrides / augments a subset of them.
  { name: 'aid',                    writer: { upstream: true } },
  { name: 'protocol',               writer: { upstream: true } },
  { name: 'accver',                 writer: { upstream: true } },
  { name: 'showtype',               writer: { upstream: true } },
  { name: 'ua',                     writer: { upstream: true } },
  { name: 'noheader',               writer: { upstream: true } },
  { name: 'fb',                     writer: { upstream: true } },
  { name: 'aged',                   writer: { upstream: true } },
  { name: 'enableAged',             writer: { upstream: true } },
  { name: 'enableDarkMode',         writer: { upstream: true } },
  { name: 'grayscale',              writer: { upstream: true } },
  { name: 'dyeid',                  writer: { upstream: true } },
  { name: 'clientype',              writer: { upstream: true } },
  { name: 'fwidth',                 writer: { upstream: true } },
  { name: 'sid',                    writer: { upstream: true } },
  { name: 'wxLang',                 writer: { upstream: true } },
  { name: 'tcScale',                writer: { upstream: true } },
  { name: 'uid',                    writer: { upstream: true } },
  { name: 'cap_cd',                 writer: { upstream: true } },
  { name: 'rnd',                    writer: { upstream: true } },
  { name: 'prehandleLoadTime',      writer: { upstream: true } },
  { name: 'createIframeStart',      writer: { upstream: true } },
  { name: 'global',                 writer: { upstream: true } },
  { name: 'subsid',                 writer: { upstream: true } },

  // --- sess: upstream from show URL, rotated by /cap_union_new_getsig responses ---
  { name: 'sess',                   writer: { module: 30, needle: 'updateSession' } },

  // --- fields that module 56 writes directly onto `d` just before $.ajax ---
  { name: 'cdata',                  writer: { module: 56, needle: 'e.cdata=n' } },
  { name: 'ans',                    writer: { module: 56, needle: 'd.ans=c' } },
  { name: 'vsig',                   writer: { module: 56, needle: 'd.vsig=_.vsig' } },
  { name: 'websig',                 writer: { module: 56, needle: 'd.websig=_.websig' } },
  { name: 'subcapclass',            writer: { module: 56, needle: 'd.subcapclass=_.subcapclass' } },
  { name: 'pow_answer',             writer: { module: 56, needle: 'd.pow_answer=' } },
  { name: 'pow_calc_time',          writer: { module: 56, needle: 'd.pow_calc_time=M.duration' } },
  { name: 'collect',                writer: { module: 56, needle: 'e[_.collectdata]=decodeURIComponent(C())' } },
  { name: 'tlg',                    writer: { module: 56, needle: 'e.tlg=e[_.collectdata].length' } },
  { name: 'fpinfo',                 writer: { module: 56, needle: 'd.fpinfo=i' } },
  { name: 'eks',                    writer: { module: 56, needle: 'd.eks=R()' } },
  { name: 'nonce',                  writer: { module: 56, needle: 'd.nonce=_.nonce' } },

  // --- vlg: part of `o` object returned by l.vm.run, $.extend'd into d ---
  { name: 'vlg',                    writer: { module: 71, needle: 't.vlg=' } },

  // --- vData: static analysis breaks down for the modern-browser path ---
  // The only lexical `vData` write in the orchestrator bundle is inside the
  // `isLowIE()` guard, using `window.getVData`. `getVData` is never defined
  // inside t_captcha_slide.js, tdc.js, or vm_slide.js — see FLOW.md §9.
  // On the Chrome-146 HAR, isLowIE() is false AND vData still appears in
  // the POST body. The only remaining source is a runtime-installed global
  // from vm-slide.e201876f.enc.js (stack VM, bytecode-opaque) or a jQuery
  // ajaxSettings transform. Recorded as open.
  { name: 'vData',                  writer: { module: 56, needle: 'e.vData=o' } }
];

function main() {
  const src = fs.readFileSync(BUNDLE_PATH, 'utf8');
  const modules = JSON.parse(fs.readFileSync(MODULES_JSON, 'utf8'));

  const verifyParams = harVerifyParams();
  const present = new Map();
  for (const p of verifyParams) present.set(p.name, p.value);

  // Narrative library — one entry per field. The text is stable and lives
  // here (not in FLOW.md) because this JSON is the machine-readable form
  // that 41.6 will embed verbatim.
  const narrative = {
    aid: ['show-URL query (?aid=)',
      'Copied verbatim from the show-page iframe URL query into `d` via `a.queryMap()` (module 30 line 1), then POSTed.'],
    protocol: ['show-URL query (?protocol=)',
      'Passthrough from the show-page iframe URL query.'],
    accver: ['show-URL query (?accver=)',
      'Passthrough from the show-page iframe URL query.'],
    showtype: ['show-URL query (?showtype=)',
      'Passthrough from the show-page iframe URL query.'],
    ua: ['show-URL query (?ua=, base64 of navigator.userAgent)',
      'Passthrough from the show-page iframe URL query; server-collected at show time, not re-derived by the orchestrator.'],
    noheader: ['show-URL query (?noheader=)',
      'Passthrough from the show-page iframe URL query.'],
    fb: ['show-URL query (?fb=)', 'Passthrough from the show-page iframe URL query.'],
    aged: ['show-URL query (?aged=)', 'Passthrough from the show-page iframe URL query.'],
    enableAged: ['show-URL query (?enableAged=)', 'Passthrough from the show-page iframe URL query.'],
    enableDarkMode: ['show-URL query (?enableDarkMode=)', 'Passthrough from the show-page iframe URL query.'],
    grayscale: ['show-URL query (?grayscale=)', 'Passthrough from the show-page iframe URL query.'],
    dyeid: ['show-URL query (?dyeid=)', 'Passthrough from the show-page iframe URL query.'],
    clientype: ['show-URL query (?clientype=)', 'Passthrough from the show-page iframe URL query.'],
    fwidth: ['show-URL query (?fwidth=)', 'Passthrough from the show-page iframe URL query.'],
    sid: ['show-URL query (?sid=)', 'Passthrough from the show-page iframe URL query.'],
    wxLang: ['show-URL query (?wxLang=)', 'Passthrough from the show-page iframe URL query.'],
    tcScale: ['show-URL query (?tcScale=)', 'Passthrough from the show-page iframe URL query.'],
    uid: ['show-URL query (?uid=)', 'Passthrough from the show-page iframe URL query.'],
    cap_cd: ['show-URL query (?cap_cd=)', 'Passthrough from the show-page iframe URL query.'],
    rnd: ['show-URL query (?rnd=)', 'Passthrough from the show-page iframe URL query.'],
    prehandleLoadTime: ['show-URL query (?prehandleLoadTime=)', 'Passthrough from the show-page iframe URL query.'],
    createIframeStart: ['show-URL query (?createIframeStart=)', 'Passthrough from the show-page iframe URL query.'],
    global: ['show-URL query (?global=)', 'Passthrough from the show-page iframe URL query.'],
    subsid: ['show-URL query (?subsid=)', 'Passthrough from the show-page iframe URL query.'],

    sess: ['server-baked into cap_union_prehandle JSONP, carried in iframe URL ?sess=, then rotated by /cap_union_new_getsig responses via updateSession()',
      'Module 30 caches sess in a module-private `a.sess` slot, seeds it from window.captchaConfig.sess, exposes queryMap() that copies it into `d`, and exposes updateSession() which module 56 calls from the getsig + verify success handlers (`e.sess && w(e.sess)`) to rotate the value mid-session.'],

    cdata: ['module 56 IIFE (`function(e,t,n){...e.cdata=n}(d,n)`) using l.challenge() from module 72',
      'Module 72 (n(73) = md5) brute-forces a PoW challenge (t.randstr||n for n < t.M) when window.captchaConfig.capChallenge is populated, returns the counter as a number; module 56 stores that number in `d.cdata`.'],
    ans: ['module 56 (`d.ans=c`) after concatenating slide-drag coord string c',
      'Built by iterating the per-step coordinate array produced by the slide drag handler (module 67) and concatenating `Math.floor(left)+","+Math.floor(top)+";"` for each point. In the HAR this reduces to a single "484,46;" — one coarse-grained drop point.'],
    vsig: ['module 56 (`d.vsig=_.vsig`) reading window.captchaConfig.vsig',
      'vsig is a server-provided per-challenge token carried in captchaConfig and refreshed by /cap_union_new_getsig responses (`t&&(_.vsig=t)`). In this HAR it is empty.'],
    websig: ['module 56 (`d.websig=_.websig`) reading window.captchaConfig.websig', 'Server-baked in the show-page captchaConfig block; empty in this HAR.'],
    subcapclass: ['module 56 (`d.subcapclass=_.subcapclass`) reading window.captchaConfig.subcapclass', 'Server-baked in the show-page captchaConfig block; empty in this HAR.'],
    pow_answer: ['module 56 (`d.pow_answer=...`) set from the WebWorker PoW result object M.ans',
      'When window.captchaConfig.powCfg.md5 and .prefix are present, module 56 runs a WebWorker (module 48 -> worker in module 49 -> hash in module 52) to brute-force an md5 prefix, then sets `d.pow_answer = P.nonce + M.ans`. Empty in this HAR because powCfg is absent.'],
    pow_calc_time: ['module 56 (`d.pow_calc_time=M.duration`)', 'Duration (ms) of the PoW WebWorker run, captured alongside the result. Zero in this HAR.'],
    collect: ['module 56 (`e[_.collectdata]=decodeURIComponent(C())`) using tdc.getData() from module 38/70',
      'Module 38 wraps `window.TDC.getData(true)` (tdc.js register-VM output); module 70 re-exports it as `tdc.getData`; module 56 reads it through `C = E.getData` and URL-decodes into the field whose name is whatever the server chose for `_.collectdata` (here "collect"). This is the same `collect` token produced by the register-VM tdc.js described in docs/TOKEN_FORMAT.md.'],
    tlg: ['module 56 (`e.tlg=e[_.collectdata].length`)', 'Length in characters of the URL-decoded collect-token string — cheap client-side integrity tag.'],
    fpinfo: ['module 56 (`d.fpinfo=i`) from the vm.run callback `o => i` chain; `i` is the outer `fpinfo` wrapped in the run callback',
      'In the vm.run completion handler module 56 receives per-drag fingerprint data as `i` and stores it on `d.fpinfo`. Empty in this HAR because vm is not armed (vmAvailable empty, vmByteCode empty).'],
    eks: ['module 56 (`d.eks=R()`) calling tdc.getEks() from module 38/70',
      'Module 38 exposes `getEks: function(){ return (window.TDC.getInfo()||{}).info || ""; }`; module 70 re-exports as `tdc.getEks`; module 56 reads via `R = E.getEks`. This is exactly the `eks` string server-baked into tdc.js line 123 and surfaced through `TDC.getInfo().info`, consistent with docs/EKS_FORMAT.md.'],
    nonce: ['module 56 (`_.nonce && (d.nonce=_.nonce)`)',
      'Module 56 reads `window.captchaConfig.nonce`, which is server-baked into the show-page HTML alongside sess (confirmed in the HAR show-page body: `nonce:"eda1152f11f1daf0"`). The orchestrator never mutates it; it is passed through from the captchaConfig block into the verify body.'],

    vlg: ['module 71 (`t.vlg=[vmAvailable?1:0, vmByteCode?1:0, 1].join("_")`), merged into `d` via `$.extend(d, o)` in module 56',
      'vlg is a three-digit availability signal for the stack-VM integration: "vmAvailable flag _ vmByteCode-nonempty flag _ 1". In this HAR both flags are 0 because captchaConfig.vmAvailable and captchaConfig.vmByteCode are empty strings.'],

    vData: ['ORIGIN UNRESOLVED STATICALLY (see FLOW.md §9)',
      'The only textual `vData` write in the orchestrator bundle is inside the isLowIE() branch: `o=window.getVData && window.getVData(n.join("&")); o && (e.vData=o)`. `getVData` is not defined in t_captcha_slide.js (this bundle), tdc.js (grep: 0 hits), or vm_slide.js (grep: 0 hits — but vm_slide.js is the stack-VM encoded blob, so runtime behavior is opaque). On the HAR (Chrome 146, isLowIE false) vData is nevertheless present in the POST body. The static trace ends here; either vm-slide.enc.js installs window.getVData at runtime, or it installs a $.ajaxSettings data-filter / jQuery 1.11.3 prefilter that rewrites POST bodies before they hit the network.']
  };

  const rows = [];
  for (const rule of RULES) {
    const value = present.get(rule.name);
    if (value === undefined) continue;
    present.delete(rule.name); // track leftovers

    let origin_module;
    let origin_lines = null;
    let assembly_method;

    if (rule.writer.upstream) {
      origin_module = 'upstream';
      assembly_method = 'show-URL query passthrough via module 30 queryMap()';
    } else {
      origin_module = rule.writer.module;
      if (rule.writer.needle) {
        const off = locate(src, modules, rule.writer.module, rule.writer.needle);
        const lc = offsetToLineCol(src, off);
        origin_lines = [lc.line, lc.col, lc.col + rule.writer.needle.length];
      }
      assembly_method = narrative[rule.name][0];
    }

    rows.push({
      name: rule.name,
      sample_value_prefix: clip(value, 60),
      sample_value_length: (value || '').length,
      origin_module,
      origin_lines,
      assembly_method,
      provenance: narrative[rule.name][1]
    });
  }

  // Any HAR fields we did not have a rule for — record so 41.6 can decide.
  const leftover = [];
  for (const [k, v] of present) {
    leftover.push({ name: k, sample_value_prefix: clip(v, 60), note: 'no origination rule in trace-flow.js' });
  }

  const out = {
    source_har: 'sample/captcha-har.har',
    source_bundle: 'sample/t_captcha_slide.js',
    har_request: '/cap_union_new_verify (POST, application/x-www-form-urlencoded)',
    har_response_status: 200,
    har_response_shape: '{errorCode, randstr, ticket, errMessage, sess}',
    notes: [
      'line numbers are {line, startCol, endCol} relative to the single-line bundle.',
      'upstream fields are copied wholesale from the show-URL query via module 30 queryMap(); the iframe URL query was itself populated by the show-page server.',
      'vData origination could not be resolved statically — see FLOW.md section 9.'
    ],
    fields: rows,
    leftover_har_fields: leftover
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  process.stdout.write('trace-flow: ' + rows.length + ' fields, ' + leftover.length + ' leftover\n');
}

if (require.main === module) {
  main();
}

module.exports = { main };
