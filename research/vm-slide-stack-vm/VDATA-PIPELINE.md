# VDATA-PIPELINE — byte-level vData generator spec

Phase 43 task 43.1. Pins the byte-level pipeline that turns a verify POST
into the `vData` field, building on Phase 42's mechanism resolution
(`VDATA-RESOLUTION.md`). Source of truth: dynamic trace of vm-slide's own
bytecode running inside an instrumented jsdom harness, cross-checked against
the static disassembly in `output/vm-slide/disassembly-full.txt`.

## §1 Scope

**Resolved by 43.1**:

1. Exact 16-byte XTEA key — recovered from the live encrypt closure call,
   constant across runs and across sessions, identical between our jsdom
   harness and the HAR reference (verified by decrypt against HAR).
2. Cipher confirmation — classical XTEA, 32 rounds, delta `0x9E3779B9`,
   little-endian uint32 packing at the cipher boundary. Standalone XTEA
   reproduces the live ciphertext byte-for-byte for all 14 blocks.
3. Output assembly — 14 × 8-byte XTEA blocks (= 112 bytes), encoded as
   152 chars of **standard base64 with a custom alphabet**. The alphabet
   has 65 characters: indices 0..63 carry data, index **64 (`Y`) is the
   padding character** (the role `=` plays in RFC 4648). 112 bytes
   require 2 padding chars (`YY`) to round up to a 4-char group.
   Alphabet: `GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY`.
   **Correction (43.2)**: 43.1 originally read the encoded buffer as 114
   bytes including a constant `10 40` "trailer". That trailer is a
   phantom — it's the result of mis-decoding the `YY` padding as raw
   6-bit values (`(64<<6)|64 = 0x1040`). The true encoder input is 112
   bytes, no trailer.
4. Entry/exit points in the bytecode — encrypt closure at pc 15241,
   decrypt closure at pc 15416, factory at pc 15220, factory FUNC_CREATE
   instantiation at pc 16835, proxyXHR install branch at pc 19638..19663,
   custom base64 alphabet at pc 16932.
5. Plaintext **shape** — 112 bytes, structured as 8 `key=value` pairs
   joined by `&` (8 `=`, 7 `&`), with a fixed character multiset
   independent of the verify POST field set.

**Not resolved by 43.1** (deferred — see §8):

- The exact field schema of the 8 key=value pairs in the plaintext. The
  multiset is invariant across our jsdom runs but differs from the HAR
  reference (jsdom-vs-real-browser environment divergence). Pinning the
  schema requires decompiling the proxyXHR body that builds the plaintext,
  which is the natural follow-up to this task.

## §2 Dynamic trace methodology

**Reproduce**:
```
node research/vm-slide-stack-vm/vdata-dynamic-trace.js
```

The script is idempotent, takes no CLI arguments, and writes:

- `output/vm-slide/vdata-pipeline.json` — the spec (this document's
  machine-readable form).
- `output/vm-slide/vdata-dynamic-trace.json` — the raw trace window
  (encrypt entries, decrypt entries, dispatch sample around the first
  encrypt call).

**How the instrumentation works**. `sample/vm_slide.js` is **never
modified on disk**. The script reads it as a string, applies two single-
shot string substitutions, then `eval()`s the patched source inside a
jsdom window:

1. Dispatch-loop tap — replaces the literal
   `for(var B=!1;!B;)B=Q[m[g++]]()`
   with
   `for(var B=!1;!B;){if(typeof __VMTAP_DISPATCH==="function")__VMTAP_DISPATCH(g,m,n);B=Q[m[g++]]();}`.
   Adds a single function-table existence check per instruction. The
   tap fires only when the program counter is inside a target window
   (15220..15600 or 19500..20800), so the cost is bounded.
2. Function-entry tap — prepends a tap call before the literal
   `;return __TENCENT_CHAOS_VM(K,m,U,A,E,F,Y,c)` inside the FUNC_CREATE
   handler. Reports `(K, A, arguments)` for every newly-entered closure
   so we can capture the key + plaintext on every encrypt call.

The taps record into Node-side arrays via `window.__VMTAP_*` callbacks.
Neither tap mutates VM state. The black-box harness
`research/vm-slide-stack-vm/vdata-harness.js` produces the same `vData` value
regardless of whether the patches are present, confirming the
instrumentation does not perturb the proxyXHR path on Chrome 146.

**Inputs**:
- `sample/vm_slide.js` — vm-slide source (unmodified).
- `sample/slide-jy.js` — jQuery 1.11.3 used to serialize the POST body.
- `sample/captcha-har.har` — verify POST field set (38 fields after
  stripping `vData` itself) and the 152-char reference vData.

**Verify post-conditions** (each gated by `npm test` 353/353):
- The harness fires `XMLHttpRequest.prototype.send` and the captured body
  contains a `vData=` parameter.
- `vData` decodes losslessly under the custom alphabet to 114 bytes.
- The factory at entry pc 15220 is entered exactly **1** time per run.
- The encrypt closure at entry pc 15241 is entered exactly **14** times
  per run.
- The decrypt closure at entry pc 15416 is entered **0** times per run
  (vm-slide does not call decrypt on the Chrome path; decrypt only exists
  for the inverse direction, which Tencent's server runs).

## §3 XTEA key + cipher confirmation

**Key (16 bytes, hex)**:
```
32653433306638633135623764613936
```

**Key as ASCII** (it happens to be a 16-character ASCII string):
```
2e430f8c15b7da96
```

**Key as 4 uint32 words** (the form the cipher consumes — these are the
exact JS numbers passed to the encrypt closure as `args[1]`, with each
word built by big-endian packing of 4 ASCII bytes):
```
[0x32653433, 0x30663863, 0x31356237, 0x64613936]
  = [845493299, 812005475, 825582135, 1684093238]
```
The recovery was done by tapping the encrypt closure on entry: locals
slot 4 holds the key (4-element array), captured and dumped as raw bytes.
The same key value was observed across every encrypt call within a run
**and** across every separate run. Decrypting the HAR reference
ciphertext with this key produces a coherent 112-byte plaintext (form-
data-shaped, see §7) — proof that the key is identical between our jsdom
harness and Tencent's real Chrome environment, i.e. the key is a
**bytecode constant**, not session-derived.

**Cipher**: classical XTEA (Wheeler-Needham, 32 rounds), confirmed by
Phase 40.6's xtea-hunt and re-confirmed here:

- Delta `0x9E3779B9` at bytecode indices 15353 (encrypt) and 15531
  (decrypt).
- Encrypt loop body uses `ADD` for sum step + block step; decrypt uses
  `SUB`.
- Key schedule is the standard XTEA `key[sum & 3]` / `key[(sum >>> 11) & 3]`.
- Round count is 32, sum-bounded.

**Standalone reproduction** of the cipher (CommonJS, no deps):
```js
function xteaEncryptBlock(v0, v1, key /* [u32,u32,u32,u32] */) {
  const delta = 0x9e3779b9;
  let sum = 0;
  v0 = v0 >>> 0; v1 = v1 >>> 0;
  for (let i = 0; i < 32; i++) {
    v0 = (v0 + ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + key[sum & 3]))) >>> 0;
    sum = (sum + delta) >>> 0;
    v1 = (v1 + ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + key[(sum >>> 11) & 3]))) >>> 0;
  }
  return [v0, v1];
}
```
Running this against each captured `(v0, v1)` plaintext block from the
trace, packing the resulting `(c0, c1)` as **two little-endian uint32s**
to bytes, and concatenating, reproduces the harness's observed
ciphertext byte stream for all 14 blocks **byte-for-byte**.

## §4 Plaintext layout

**Per-block representation**: each encrypt call passes
`(plaintextBlock = [v0, v1], key = [k0, k1, k2, k3])`. The two uint32
words `v0, v1` of the block correspond to **8 bytes in little-endian
order** at the cipher boundary (verified by reconstructing live
ciphertext from packed-LE plaintext and matching the harness output).

**Aggregate**: 14 encrypt calls per vData generation → 14 × 8 = **112
plaintext bytes**.

**Macro shape** (from inspecting one captured plaintext, decoded LE):
```
s%p&2yts=p=C=0&0Coeptaradon pnr eefls lrn t (iouri''ns)er&agid cnoeLpyCf=Z=&&tkqc=oDuaCLd&onvdlTeo&=ne1rnbs=bi2v
```

The captured plaintext is **112 bytes of structured form data**:

- Exactly **8 `=` characters** and **7 `&` characters**, consistent with
  8 `key=value` pairs joined by `&`.
- Mixed alphabetic, digit, and punctuation content. Includes spaces,
  parens, apostrophes, and `%` — **none of which appear in any normal
  verify POST field**, so the plaintext is not derived from the verify
  body.
- The ciphertext byte order changes per run (each new jsdom run produces
  a different `vData` for the same input), but the **character multiset
  is invariant across all our jsdom runs**, even when the input field
  set is varied (`{a:'1'}`, `{foo:'bar'}`, full HAR field set, single-
  char field, multi-field). Three independent runs all produced
  plaintexts whose sorted form is exactly:
  ```
        %&&&&&&&''()00122========CCCDLTaaaabbcccdddddeeeeeeeeffgiiiikklllnnnnnnnnoooooooppppprrrrrrsssssttttuuvvyy
  ```
  This proves the plaintext content is **independent of the verify POST
  field set** and is determined entirely by the vm-slide environment.

**Endianness summary**:
- Inside vm-slide / inside our standalone XTEA: each block is two
  uint32 words.
- At the byte boundary (when packing into the ciphertext stream and
  decoding from base64): each uint32 is **little-endian**.
- The HAR reference ciphertext also uses little-endian packing —
  decryption with the same key, treating words as LE, produces a
  multiset that has the same shape as our jsdom plaintext (`8 '='`,
  `7 '&'`) but with different content (digits and `k`s instead of
  spaces and parens). This is consistent with two different
  environments (real Chrome vs jsdom) computing the same kind of
  fingerprint.

## §5 Output assembly

**Corrected by 43.2.** The proxyXHR body produces exactly **112** bytes
of ciphertext (14 XTEA blocks, no trailer) and feeds them into a
**standard base64 encoder** that uses a custom 65-character alphabet
where index 64 (`Y`) is the padding character — analogous to `=` in
RFC 4648.

```
ct  = LE_PACK(c0_0, c1_0) || LE_PACK(c0_1, c1_1) || ... || LE_PACK(c0_13, c1_13)   (112 bytes)
out = b64_encode(ct, alphabet, padding_index = 64)                                  (152 chars)
```

112 bytes is one byte short of `38 × 3`, so the last 4-char group encodes
1 data byte + 2 padding chars. The padding chars in this alphabet are
`Y`, so every vData ends in `YY`. This is why the HAR vData and every
jsdom capture both end in `YY` and have length 152.

**Why 43.1 saw a phantom `10 40` trailer.** 43.1's decoder didn't treat
index 64 as padding — it just decoded every char as a raw 6-bit value
and emitted 3 bytes per 4-char group. Decoding the trailing `YY` that
way produces `(0<<16) | (0<<8) | (64<<6) | 64 = 0x1040`, so the last
two output bytes were always `10 40`. There is no trailer in the
ciphertext stream; the bytes simply come from mis-decoding the padding.
The corrected decoder (see fixture verifier under
`tests/fixtures/verify-vdata-fixtures.js`) produces 112 bytes and
round-trips byte-for-byte.

**Custom base64 alphabet** (65 chars, indices 0..63 = data, 64 = `Y` =
padding, found at bytecode pc 16932 — see §6):
```
GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY
```
- Position 0 = `G`, position 22 = `7` (matches the HAR vData starting
  with `7Mj...`), position 64 = `Y` (padding).
- Includes the URL-safe substitutions `_`, `-`, and `*` instead of
  standard `/`, `+`, `=`.
- It is a non-RFC-4648 alphabet, so naive base64 libraries will not
  work; you must build the lookup table from the alphabet string and
  treat index 64 as padding.

**Standalone encode** (CommonJS) — standard base64 with a custom
alphabet and a non-`=` padding char:
```js
function customBase64Encode(buf, alphabet, padIdx /* = 64 */) {
  let out = '';
  for (let i = 0; i < buf.length; i += 3) {
    const b0 = buf[i];
    const b1 = i + 1 < buf.length ? buf[i + 1] : NaN;
    const b2 = i + 2 < buf.length ? buf[i + 2] : NaN;
    const c0 = b0 >>> 2;
    const c1 = ((b0 & 3) << 4) | (Number.isNaN(b1) ? 0 : (b1 >>> 4));
    const c2 = Number.isNaN(b1) ? padIdx
                                : (((b1 & 0xf) << 2) | (Number.isNaN(b2) ? 0 : (b2 >>> 6)));
    const c3 = Number.isNaN(b2) ? padIdx : (b2 & 0x3f);
    out += alphabet[c0] + alphabet[c1] + alphabet[c2] + alphabet[c3];
  }
  return out;
}
```
112 bytes → 37 full 3-byte groups (148 chars) + 1 byte (1 data char +
1 char with the low nibble in the high bits + 2 padding chars `YY`) =
152 chars. Re-encoding the decoded ciphertext reproduces the live and
HAR `vData` strings byte-for-byte (verified by
`tests/fixtures/verify-vdata-fixtures.js`).

**How 43.2 confirmed this.** vm-slide's encoder bytecode at pcs
17084..17418 implements exactly this `isNaN`-gated padding pattern:
`OP_08 64` immediates appear at pcs 17395 and 17409 inside the
`isNaN(b1)` and `isNaN(b2)` branches, supplying index 64 as the
padding character. The math `c1 = ((b0 & 3) << 4)` (when `b1` is NaN)
and the `Y`-substitutions are the decisive markers. See the
disassembly window in `output/vm-slide/disassembly-full.txt` lines
10140..10350.

vm-slide does **not** prepend `vData=` itself; the proxyXHR body
constructs the URL-encoded form-data string `body + '&vData=' + base64`
inside the XHR send hook (Phase 42 found `"&vData="` as an OP_04/OP_10
literal at bytecode pc 24210, and the install path tags this onto the
end of the captured body). The `=` sign and the field name are part
of the body assembly; only the base64 string itself comes out of the
crypto core.

## §6 Static bytecode coordinates

Citations to `output/vm-slide/disassembly-full.txt` (Phase 40.1 full-
coverage walker output). Each pc is the start of an instruction.

**Encrypt closure** — entry pc **15241**. Created at pc 15404:
```
15404  OP_58 15241 0 2 3 4
```
`OP_58 K U C s0 s1 ... sC` decodes as: create function with entry K, U
upvalues, C named-argument slots. Here `K=15241, U=0, C=2`, with
arguments bound to slots 3 and 4. So the encrypt closure takes 2
positional args, populating its locals slot 3 (the plaintext block) and
slot 4 (the key). This matches the dynamic trace exactly: every entry
hit at pc 15241 has `args[0] = [v0, v1]` and `args[1] = [k0, k1, k2, k3]`,
landing in `locals[3]` and `locals[4]` of the new frame.

**Decrypt closure** — entry pc **15416**. Same factory; same 2-arg
shape; called 0 times on the Chrome encrypt path (Tencent's server
runs the inverse).

**XTEA delta constant** — bytecode index **15353** (encrypt loop) and
**15531** (decrypt loop):
```
15352  OP_08 2654435769         ; PUSH_K 0x9E3779B9
```
Verified by Phase 40.6 `xtea-hunt.js`; both occurrences sit at the
expected position inside their respective sum-update sequences.

**XTEA factory** — entry pc **15220**. Created at pc 16835:
```
16835  OP_58 15220 0 3 3 4 5
```
Factory takes 3 positional args, binding them to local slots 3, 4, 5.
The factory's job is to capture the key into its closure environment
and return both encrypt and decrypt closures (whose `OP_58 15241/15416
0 2 3 4` sites at pcs 15402/15578 then close over the factory's local
4 — the key — and pass it as an argument when invoked). The factory
is entered exactly once per run (verified by our entry tap), confirming
the key is built once at module init time and reused for all 14
encrypts.

**proxyXHR install branch** — pc **19636..19663** (the IE-vs-Chrome
gate inside the outer initializer). Cited verbatim in
`VDATA-RESOLUTION.md` §3 candidate (b+); reproduced here for the
full pipeline view:
```
19633  OP_59                ; resolve "isIE9Below" property
19634  OP_02 0              ; <state>.isIE9Below()
19636  OP_60 19666          ; if truthy goto 19666 (install window.getVData)
19638  OP_05                ; else: drop result
19639  OP_47 5              ; push slot-ref 5 (upvalue)
19641  OP_04                ; build "proxyXHR"
... (OP_10 chars)
19658  OP_59                ; resolve <upvalue>.proxyXHR
19659  OP_00 3              ; push p[3] (the orchestrator state arg)
19661  OP_02 1              ; <upvalue>.proxyXHR(p[3])  -- INSTALLS XHR HOOK
19663  OP_06 20070          ; jump past the getVData install
```
This is the **Chrome 146 entry point**: when `isIE9Below()` returns
false, vm-slide takes this branch and the `proxyXHR` method patches
`XMLHttpRequest.prototype.send`. The patched send is what later calls
into the encrypt factory + closure chain at pcs 15220 / 15241.

**Custom base64 alphabet load** — pc **16932** (start of an
`OP_04 (OP_10 ch)*` run reconstructing the alphabet string). The run
contains exactly **65** `OP_10` instructions, terminated by `OP_24` at
pc 17063 (verified by `research/vm-slide-stack-vm/extract-alphabet.js`,
which reads the bytes directly from `output/vm-slide/bytecode.json`).
Phase 42.2 confirmed every character of the HAR `vData` is a member of
this alphabet (zero outliers). 43.2 corrected 43.1's "64 chars" reading
to 65 chars, with index 64 (`Y`) being the padding character (see §5).

**Char-set validation regex** — pc **17677** (`[^A-Za-z0-9\-\_\*]`,
matches the alphabet's special chars). Used inside the proxyXHR body
as a sanity check before/after base64 encode.

## §7 Reference HAR cross-check

**HAR reference vData** (verbatim from `sample/captcha-har.har`,
verify POST):
```
7MjK5yGovGjw1scdQ6-F-LXDV2iAI0b*5ONmLZ4uWoVzJMDN5MvSSrMxILt4lsXbEguCZ7eZtjCMfbg9*wbiQoH_4-hrxaM7THpUbbQuqIfPi5vl549PdPPu64P-GnmSuAKqlxUcL9yFjBMA5RsJRiYY
```

Decoded under the custom alphabet (with index 64 = padding) → **112
bytes** = 14 LE-packed XTEA blocks. (43.1 reported 114 bytes including
a `10 40` "trailer"; 43.2 corrected this — those two bytes are the
result of mis-decoding the trailing `YY` base64 padding as raw 6-bit
values. See §5.)

Decrypted with the recovered XTEA key (LE uint32 packing, 32 rounds):
```
"iimnfevn&=fr0=ae&700436t99p44=6865c=6Ll2oo40a2&dd&s=vi2To&DekCrne1s1Ls%y=2=2C2&1t2i2CdCdevcsm%l%&0kkkkkpkkykk=kk"
```

The decrypt produces a clean 112-byte structured form-data blob with
the same `8 =` / `7 &` shape as our jsdom plaintexts, confirming:

1. The XTEA key is **byte-identical** between our jsdom harness and
   Tencent's real Chrome 146 environment (the key is a constant in the
   bytecode, not session-derived).
2. The cipher endianness is **byte-identical** (LE uint32 packing).
3. The base64 framing is **byte-identical** (both vData strings end
   in `YY` padding because the 112-byte ciphertext is 1 byte short of
   a clean 3-byte group).
4. The **character set** of the plaintext content differs (HAR has
   many `k`s and digits, jsdom has parens and apostrophes), reflecting
   the different JS environment fingerprints — jsdom's `typeof` and
   property enumeration produce different strings than real Chrome.

**Match verdict**: the *cipher pipeline* (XTEA + key + LE packing +
trailer + custom base64) is byte-identical between our environment and
the HAR reference. The *plaintext content* differs because vm-slide's
proxyXHR body computes its plaintext from a fingerprint of the JS
runtime, and jsdom is not byte-equivalent to real Chrome. This is the
expected and acceptable session/environment divergence: 43.1's spec
captures the cipher pipeline byte-for-byte; 43.2's fixture capture and
43.3's standalone implementation will need to also reproduce the
fingerprint computation that builds the plaintext.

## §8 Open questions

Each is a narrow, well-bounded follow-up. None block 43.2 (which can
freeze the harness output as ground truth for now).

1. **Plaintext field schema**. What 8 fields make up the
   `key=value&key=value&...` plaintext? The character multiset is
   invariant across our jsdom runs and across input field sets, so
   the plaintext is computed from a **fixed JS-environment
   fingerprint**, not from the verify POST body. Resolving this
   requires decompiling the proxyXHR body (the block of code reachable
   from `<state>.proxyXHR(p[3])` at pc 19661) and identifying which
   `Object.keys`, `typeof`, and `toString()` calls feed the encryption
   buffer. The relevant pcs are inside the
   region 15000..20800, mostly clustered around pcs 19500..20800.
2. ~~**Trailer bytes `10 40`**.~~ **Resolved by 43.2** — there is no
   trailer. The bytes were a phantom from mis-decoding the `YY` base64
   padding as raw 6-bit values (`(64<<6)|64 = 0x1040`). The encoder
   input is 112 bytes, the alphabet is 65 chars with index 64 = padding,
   and re-encoding under that scheme reproduces the HAR and jsdom
   `vData` strings byte-for-byte. See §5.
3. **Why the per-run byte order varies even with identical input**.
   Two runs of `runWith({a:'1'})` produce two different byte orderings
   of the same 112-byte plaintext multiset. Either vm-slide is reading
   from a `Set` / hash structure whose iteration order depends on
   memory state, or there is an explicit per-run salt (e.g. one of
   the bytes is a `Math.random()`-derived nonce that perturbs
   subsequent operations). The randomness is internal to the
   plaintext computation, not to the cipher itself (the key and
   alphabet are constant).
4. **Real-Chrome fingerprint reproduction**. To produce a vData that
   Tencent's server accepts we need either (a) a faithful Chrome 146
   stub that fools vm-slide's fingerprint logic, or (b) decompile the
   proxyXHR body and re-implement the plaintext build directly,
   feeding it the canonical Chrome 146 fingerprint values. Option (b)
   is the cleaner path and is the natural follow-up after this task.
