---
description: "Fetch the latest tdc.js build from Tencent's CAPTCHA endpoint, save to targets/, and classify its template."
---

# Fetch Latest TDC Build

Fetch a fresh tdc.js build from Tencent's CAPTCHA service, save it to `targets/`, and classify which VM template it uses.

---

## Step 1 — Determine the Next Version Number

List existing tdc files in `targets/` to determine the next version number:

```bash
ls targets/tdc*.js
```

If files exist up to `tdc-v5.js`, the next file should be named `tdc-v6.js`. The base `tdc.js` (no version suffix) is the reference build and should never be overwritten.

---

## Step 2 — Fetch the TDC Script

The tdc.js script is served by Tencent's CAPTCHA endpoint at `https://t.captcha.qq.com`. The URL is not static — it is embedded in the CAPTCHA session flow as the `dcFileName` field in the `getSig` response.

To obtain a fresh build:

1. Study the fetch mechanism in `puppeteer/captcha-client.js` (specifically the `downloadTdc` method and the `getSig` flow that provides the `dcFileName` URL).
2. Reference `sample/captcha-har.har` for the full network flow and endpoint sequence.
3. Use the `CaptchaClient` class from `puppeteer/captcha-client.js` to perform the prehandle -> getSig -> downloadTdc flow programmatically:

```javascript
const CaptchaClient = require('./puppeteer/captcha-client');
const client = new CaptchaClient({ appId: '...', domain: '...' });
const prehandle = await client.prehandle();
const sig = await client.getSig(prehandle);
const tdcSource = await client.downloadTdc(sig);
```

Alternatively, use Puppeteer to load the CAPTCHA page and intercept the tdc.js network request.

4. Save the fetched source to `targets/tdc-vN.js` (where N is the next version number).

---

## Step 3 — Validate the Build

Run the decoder to verify the fetched file is a valid tdc.js build:

```bash
node decompiler/decoder.js targets/tdc-vN.js
```

The decoder works on all builds unchanged. If it succeeds and produces a decoded integer array, the file is valid. Report the decoded array length.

If the decoder fails, the fetched file is not a valid tdc.js build — report the error and investigate (it may be an HTML error page, a 403 response, or an incompatible format).

---

## Step 4 — Classify the Template

Compare the fetched build against known templates to determine if it is Template A, Template B, or a new template.

Classification heuristics:

1. **Opcode count**: Count the number of `case` handlers in the main VM dispatch `switch`. Template A has 95 opcodes, Template B has 94.

2. **Bytecode structure**: Compare the decoded integer array length and value distribution against known builds:
   - `tdc.js` (Template A): reference build
   - `tdc-v2.js` (Template B): different opcode set
   - `tdc-v3.js` (Template A): same as tdc.js

3. **Structural fingerprint**: Check for distinctive code patterns:
   - Does it have the same variable naming style as known templates?
   - Does the `__TENCENT_CHAOS_VM` function have the same overall structure?
   - Count the number of string literals, function definitions, and switch cases.

4. **Quick diff**: If the opcode count matches Template A (95), do a spot-check of 3-5 case handlers against `tdc.js` to see if the opcode assignments are reshuffled (they always are) but the handler code patterns are structurally similar.

---

## Step 5 — Report

Summarize the fetch result:

- **Filename**: the saved path (e.g., `targets/tdc-v6.js`)
- **File size**: in bytes
- **Decoded array length**: number of integers in the decoded bytecode
- **Template classification**: A, B, or unknown/new
- **Opcode count**: number of case handlers in the dispatch switch
- **Recommendation**: If it matches a known template, suggest running `/port-version targets/tdc-vN.js` to complete the porting. If it is a new template, note that manual investigation may be needed first.
