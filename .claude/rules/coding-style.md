# Coding style

**When to read this**: read before writing or editing any JavaScript or Python file in this repo.

## Rules

- **Module system**: CommonJS only. Every JavaScript file starts with `'use strict';` and uses `require()` / `module.exports`. No ESM (`import` / `export`).
- **Indentation**: 2 spaces. Never tabs.
- **Quotes**: single quotes for strings. Template literals only when string interpolation is needed.
- **Semicolons**: required at statement terminators.
- **Variables**: `const` by default, `let` when reassignment is needed. Never `var`.
- **Naming**: camelCase for variables and functions, PascalCase for classes, SCREAMING_SNAKE for module-level constants.
- **Dependencies**: minimize external packages — prefer Node.js built-ins (`crypto`, `fs`, `path`, `http`, `zlib`, `util`, etc.). Adding a new npm dependency requires explicit user confirmation.
- **Language**: Node.js for all JavaScript. Python is only used for `tools/captcha-solver/slide-solver.py` (OpenCV).
- **File headers**: every new source file starts with a block comment stating its responsibility in one or two sentences.

## Examples

Good module header:

```js
'use strict';

/**
 * XTEA block cipher — encrypts the 112-byte vData payload.
 * 32 rounds, delta 0x9E3779B9, LE uint32 packing.
 */

const { buffer } = require('./util');
const DELTA = 0x9E3779B9;

function encrypt(block, key) { /* ... */ }

module.exports = { encrypt };
```

Bad: ESM imports, tabs, double quotes, `var`.

```js
// do not write files like this
import { buffer } from "./util"
var DELTA = 2654435769
function encrypt(block, key) {
	/* ... */
}
export { encrypt }
```
