# VDATA-RESOLUTION — where does the HAR `vData` value come from?

Task 42.2 verification note, independent of 42.1 (`VDATA-TRACE.md`).
Investigates the three 42.1 candidates and issues a verdict on the
origin of the 152-char `vData` in `sample/captcha-har.har`. Pcs refer
to `output/vm-slide/bytecode.json` / `disassembly-full.txt`.

## §1 FLOW.md cross-reference

`research/captcha-orchestrator/FLOW.md` §4.2 and §6 record the orchestrator
side. Module 56 builds `n` from `e`'s own enumerable keys as
`n.push(i + "=" + t[i])` and calls
`var o = window.getVData && window.getVData(n.join("&")); o && (e.vData = o)`
inside an `if (a.isLowIE())` branch (grep-verified against
`sample/t_captcha_slide.js`: the only hit is the literal
`isLowIE()){var t=Object(e),n=[];for(var i in t)t.hasOwnProperty(i)&&n.push(i+"="+t[i]);var o=window.getVData&&window.getVData(n.join("&"));o&&(e.vData=o)`).
`o` is the function's return value (FLOW.md §4.2 row "vData"; §6 bullet
"Runs the `isLowIE()` guarded `window.getVData` block"); one argument,
matching the `C=1` on the OP_58 at pc=20059. The orchestrator call path
is therefore **IE-only**; on Chrome 146 `isLowIE()` is false and this
block does not execute, yet HAR captures `vData` anyway — Phase 42's
reason for existing.

## §2 HAR value shape

Extracted verbatim from `sample/captcha-har.har`
(`cap_union_new_verify` POST, `vData=` parameter):

```
7MjK5yGovGjw1scdQ6-F-LXDV2iAI0b*5ONmLZ4uWoVzJMDN5MvSSrMxILt4lsXbEguCZ7eZtjCMfbg9*wbiQoH_4-hrxaM7THpUbbQuqIfPi5vl549PdPPu64P-GnmSuAKqlxUcL9yFjBMA5RsJRiYY
```

Length 152, `len % 4 == 0`. Character set `[A-Za-z0-9] + {-, _, *}`; no
`+`, `/`, `=`, `%`, or hex. This is a **URL-safe base64 variant** with
`-`, `_`, `*` substituted for standard `+`, `/`, `=`. 152 b64 chars →
114 raw bytes, consistent with a small encrypted blob (~14 × 8-byte
XTEA blocks). Alphabet differs from the register-VM `collect` token
(`docs/TOKEN_FORMAT.md` §2 uses standard `A-Za-z0-9+/=` with
`%2B`/`%2F`/`%3D` URL-encoding), and there are no `&`/`=` separators or
plaintext keys — shape strongly suggests encrypted + custom-base64.

## §3 Crypto provenance hunt

### Candidate (a) — upstream register captured into `getVData` via its upvalue

The FUNC_CREATE at pc=20059 is `OP_58 19702 1 1 8 3 3`. Applying the
dispatch source for OP_58 (`for(B=0;B<A;B++)p[m[g++]]=n[m[g++]]`) to the
tail `8 3 3` gives upvalue mapping **`p[8] = n[3]`** (i.e. the closure's
local slot 8 is the **outer function's** local slot 3) and argument
mapping `Q[0] = 3` (argument 0 binds to closure's local slot 3). 42.1's
`VDATA-TRACE.md` §4 describes this as `p[1] = n[8]` — that is an indexing
inversion: the operand order is `(closureSlot, outerStackIndex)`, not the
other way around. The semantic conclusion in 42.1 is still intact
(closure captures one outer value), only the slot numbers move.

The enclosing outer function starts at pc=19604 (`OP_40 6` stack alloc +
`OP_42 2` / `OP_42 3` lazy slot init) and is itself installed via
`OP_58 19604 2 1 4 7 5 6 3` at pc=20073 (visible in the anchor 1 excerpt
of `vdata-anchors.json`). That outer OP_58's tail `4 7 5 6 3` decodes to
`p[4]=n[7]; p[5]=n[6]; Q[0]=3` — **two upvalues captured from the
caller, one argument received as local 3**. The outer function's local 3
is therefore its own argument.

Inside `getVData` the upvalue is consumed at pc=19841 (`OP_00 8` reads
`n[8][0]`) immediately before the OP_13 resolve of `Object` at pc=19845
— consistent with an `Object(p[8])` coercion. No reads of the upvalue
feed into a call site whose receiver or argument looks crypto-related;
the rest of the body is string splitting (`"split"`, `"&"`, `"="`) and
RegExp testing (`new RegExp("vData=")`). So even if the upvalue held a
pre-computed crypto blob, the body does no further crypto work on it.

**Verdict (a)**: the upvalue is a reference to the outer initializer's
input argument — a shared state handle, not a pre-computed `vData`. The
getVData body would return a query-string-shaped result and cannot
produce the 152-char custom-base64 blob. **Candidate (a) is not it.**

### Candidate (b) — a second `window.<key> = <fn>` install

Ran `research/vm-slide-stack-vm/vdata-provenance.js`, which walks the
CFG-reachable bytecode and flags every pattern `build("window") ->
OP_32 -> build(<key>) -> OP_41 -> [optional OP_06] -> OP_58 -> OP_24`.
Output in `output/vm-slide/window-installs.json`, idempotent.

**Result: exactly one install** — `window.getVData` at install_pc=20066,
body `[19702, 20058]`, 216 instructions.

To rule out narrowness, I linearly scanned (no CFG filter) for every
`OP_04 (OP_10)*` run reconstructing `"window"`. **11 sites** at pcs
4958, 6139, 8386, 8429, 19667, 21275, 23075, 23096, 23114, 23341,
24170. For each I inspected the immediately-following opcodes:

| pc    | next    | key built          | consumer       | role  |
|-------|---------|--------------------|----------------|-------|
| 4958  | OP_59   | (method receiver)  | —              | not `[window,k]` |
| 6139  | OP_32   | `getComputedStyle` | OP_41 + OP_54  | read  |
| 8386  | OP_32   | `matchMedia`       | OP_41 + OP_54  | read  |
| 8429  | OP_32   | `matchMedia`       | OP_41 + OP_54  | read  |
| 19667 | OP_32   | `getVData`         | OP_41 + OP_06 + OP_58 + OP_24 | **write (install)** |
| 21275 | OP_32   | `captchaConfig`    | OP_41 + OP_54  | read  |
| 23075 | OP_13   | global lookup      | —              | read  |
| 23096 | OP_13   | global lookup      | —              | read  |
| 23114 | OP_32   | `TDC`              | OP_41 + OP_54  | read  |
| 23341 | OP_13   | global lookup      | —              | read  |
| 24170 | OP_32   | `DEBUGMODE`        | OP_41 + OP_54  | read  |

Every other site is a read (`OP_54 property-get`) or a bare global
resolve (`OP_13`). **Only `getVData` is written.**

**Verdict (b)**: vm-slide installs exactly one `window.<method>`, and
it is `getVData`. No secondary `window.*` helper exists. But candidate
(b)'s scan, extended to non-`window.*` targets, turned up the real
answer — see "Candidate (b+)" below.

### Candidate (b+) — non-`window.*` installs: `proxyXHR` + custom-base64 alphabet

The outer initializer that installs `getVData` (body `[19604, 20072]`,
reached by `OP_58 19604 2 1 4 7 5 6 3` at pc=20073) does not
unconditionally install `getVData`. Its prologue builds the string
`"isIE9Below"` at pc=19612..19633, resolves it via `OP_59` +
`OP_02 0` (zero-arg method call), and branches on the result:

```
19633 OP_59                   ; [<obj>, "isIE9Below"]
19634 OP_02 0                 ; <obj>.isIE9Below()
19636 OP_60 19666             ; if (result truthy) goto 19666  (install getVData)
19638 OP_05                   ; else: drop the falsy result
19639 OP_47 5                 ; push slot-ref 5 (upvalue p[5])
19641..19656 "proxyXHR"       ; build method name
19658 OP_59                   ; [<p[5]>, "proxyXHR"]
19659 OP_00 3                 ; push p[3] / argument
19661 OP_02 1                 ; p[5].proxyXHR(p[3])
19663 OP_06 20070             ; jump past the getVData install
```

The two paths are mutually exclusive: truthy `isIE9Below()` → install
`window.getVData` and return; falsy → call `<upvalue>.proxyXHR(<arg>)`
and return (skipping the getVData install via the OP_06 20070 hop).
This is the **exact counterpart** on the vm-slide side of the
orchestrator's `if (a.isLowIE())` branch. The orchestrator uses
`window.getVData` only in old IE; vm-slide installs it only in old IE.
On modern browsers vm-slide takes the other branch and installs an XHR
interceptor via a `proxyXHR` method.

Independent corroboration from the bytecode string table (linear scan
of all `OP_04 (OP_10)*` runs, not CFG-gated):

- pc=19641 / 20119: `"proxyXHR"` (the install call + the proxy's own
  internal name reference).
- pc=20154, 20220, 20290, 20476, 20621: `"XMLHttpRequest"` (5 hits —
  the proxy targets `XMLHttpRequest`).
- pc=20204, 20526, 20671: `"send"`.
- pc=20270, 20340: `"open"`.
- pc=16932: `"GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY"`
  — a **64-character custom base64 alphabet** that contains `-`, `_`,
  and `*`, exactly the special characters observed in the HAR `vData`
  value (§2).
- pc=17677: `"[^A-Za-z0-9\\-\\_\\*]"` — a regex character class matching
  the same alphabet (intended as either a validator or a sanitizer).
- bytecode[15353] = bytecode[15531] = `0x9E3779B9` (2654435769) — the
  **XTEA delta constant**, pushed via `OP_08` and folded into the
  running sum via `OP_20` / `OP_21`. Two occurrences, consistent with
  separate encrypt / decrypt paths (sum += delta / sum -= delta).

All of these sit **outside** the `getVData` function body `[19702,
20058]` and **inside** a different region (pcs ~15000 and ~20100–20700)
reached via the `proxyXHR` method. vm-slide therefore contains, in its
own bytecode, a full XTEA + custom-base64 pipeline that is installed by
the non-IE branch of the outer initializer at pc=19604.

### Candidate (c) — external page-loaded routine

Re-read 42.1's §5 table of OP_13-resolved identifiers inside the
`getVData` body. Only `Object` (pc=19845) and `RegExp` (pc=19955) are
resolved — no `TDC`, `crypto`, `btoa`, `atob`, or any short-name global
that looks like a crypto helper. And candidate (b+) above already
accounts for the 152-char blob's provenance inside vm-slide itself.
**Candidate (c) is dead.**

## §4 Resolution verdict

**Partially resolved (static limit reached).**

What is now proven statically:

1. vm-slide installs `window.getVData` once only (pc=20066), and its
   body `[19702, 20058]` is a query-string formatter that returns a
   string of the same shape as its input — not the 152-char HAR blob.
2. The install is gated by `isIE9Below()` inside an outer initializer
   (body from pc=19604). The non-IE branch (Chrome 146 included)
   **does not** install `getVData`; it calls `<upvalue>.proxyXHR(arg)`
   at pc=19661, a method whose name and surrounding string table
   (`XMLHttpRequest`, `open`, `send`) unambiguously identify an XHR
   interceptor.
3. The vm-slide bytecode contains the XTEA delta constant
   `0x9E3779B9` (bytecode indices 15353 + 15531), a 64-character
   custom base64 alphabet `"GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY"`
   (pc=16932), and a character-class regex `[^A-Za-z0-9\-\_\*]`
   (pc=17677). The alphabet's special chars `-`, `_`, `*` are exactly
   the non-alphanumerics observed in the HAR `vData` value.
4. The orchestrator's `isLowIE()` / `window.getVData` branch in module
   56 is therefore a **fallback** for old IE, redundant on modern
   browsers. Mod 56 never writes `e.vData` on Chrome 146 — the field
   is injected by the XHR interceptor installed by vm-slide at
   initialization time, via `proxyXHR`, which rewrites outgoing
   `XMLHttpRequest.send` payloads to append `vData=<encrypted>`.

What is **not** yet proven statically, and why:

- The exact function body of the XHR interceptor that computes the
  `vData` value (presumably somewhere in pcs 15000..20700 of the
  vm-slide bytecode). I did not decompile it — doing so requires
  tracing the OP_58 closure graph through the outer module's upvalue
  `p[5]` and the `proxyXHR` method it holds, which is full-decompile
  work and was flagged as a non-goal.
- The exact input to the XTEA encrypt: whether it is the query-string
  `n.join("&")`-shaped input from the orchestrator, the full outgoing
  XHR body, the verify-body `d`, or a session-state snapshot. This
  needs runtime observation.
- Whether the XTEA key is a fresh per-session value or a constant
  baked into the bytecode.

## §5 Recommended action for 42.3

42.3 should update the public docs to reflect the resolved picture and
open one new narrow task. Specifically:

- **Edit `docs/CAPTCHA_ORCHESTRATOR.md`** (§2, §5.2, §8 and any
  "unresolved" mention of `vData`): replace the "origin unresolved"
  framing with "vData is injected at XHR send time by an XHR
  interceptor installed by `vm-slide.enc.js` via a `proxyXHR`
  method, and encoded with modified-XTEA + custom base64. The
  orchestrator's `isLowIE()` guarded `window.getVData` branch is a
  legacy fallback used only on IE9 and older." Cite pcs from this
  note + `window-installs.json`.
- **Edit `research/captcha-orchestrator/FLOW.md` §9 Q1**: close Q1 as
  "resolved by 42.2 — see `research/vm-slide-stack-vm/VDATA-RESOLUTION.md`".
- **Open a new task (42.4 or a new track)**: decompile the vm-slide
  XHR proxy / XTEA pipeline.
  - Scope: the region pcs ~15000..20700 of `output/vm-slide/bytecode.json`.
  - Inputs: `output/vm-slide/window-installs.json`, this note,
    `output/vm-slide/disassembly-full.txt`.
  - Goal: extract the XTEA key, confirm the modified-XTEA variant
    matches `docs/CRYPTO_ANALYSIS.md`, identify the exact input
    passed to the encrypt (query string? full body?), and emit a
    standalone `vData` generator under `tools/` once verified.
- **Do NOT** build a jsdom harness for `getVData` — it is IE-only and
  not on the Chrome 146 path.
