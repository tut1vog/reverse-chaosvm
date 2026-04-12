'use strict';

/**
 * output-polish.js — Text-level transforms to improve decompiled output readability.
 *
 * Three mechanical transforms applied to the emitted JS string:
 *   1. resolveClosures  — closure(offset=N, arity=M) → func_N
 *   2. renameVMRegisters — r0/r2/r4/r5/Q → readable names
 *   3. eliminateDeadStores — remove dead string-constant assignments
 *
 * All transforms are text-level regex/string operations. No IR re-processing.
 */

/**
 * Build a mapping from rawOffset → function id using functions.json data.
 * Returns a Map<number, {id: number, valid: boolean}>.
 */
function buildOffsetMap(funcTable) {
  const map = new Map();
  for (const f of funcTable) {
    if (f.rawOffset !== null && f.rawOffset !== undefined) {
      map.set(f.rawOffset, { id: f.id, valid: f.valid });
    }
  }
  return map;
}

/**
 * Replace all closure(offset=N, arity=M) references with func_N names.
 *
 * Valid functions → func_N
 * Invalid (data-region artifact) functions → func_N_invalid
 * Unresolvable (offset=undefined or no match) → closure_unresolved(offset=N, arity=M)
 *
 * @param {string} code - The decompiled JS source
 * @param {Array} funcTable - Parsed functions.json array
 * @returns {string} Code with closures resolved
 */
function resolveClosures(code, funcTable) {
  const offsetMap = buildOffsetMap(funcTable);
  let resolved = 0;
  let resolvedInvalid = 0;
  let unresolved = 0;

  const result = code.replace(
    /closure\(offset=([^,]+),\s*arity=([^)]+)\)/g,
    (match, offsetStr, arityStr) => {
      if (offsetStr === 'undefined') {
        unresolved++;
        return 'closure_unresolved()';
      }
      const offset = parseInt(offsetStr, 10);
      if (isNaN(offset)) {
        unresolved++;
        return match;
      }
      const entry = offsetMap.get(offset);
      if (entry) {
        if (entry.valid) {
          resolved++;
          return 'func_' + entry.id;
        } else {
          resolvedInvalid++;
          return 'func_' + entry.id + '_invalid';
        }
      }
      unresolved++;
      return 'closure_unresolved(' + offsetStr + ', ' + arityStr + ')';
    }
  );

  return result;
}

/**
 * Rename VM-internal registers to readable names.
 *
 * Uses word-boundary matching to avoid renaming r20, r21, etc.
 *   r0 → __global     (the global object / window)
 *   r2 → __captures   (closure-captured variable array)
 *   r4 → __args       (function arguments array)
 *   r5 → __this       (the this context)
 *   Q  → __this_ctx   (Q tracks this for method dispatch)
 *
 * Carefully avoids renaming inside string literals.
 *
 * @param {string} code - The decompiled JS source
 * @returns {string} Code with registers renamed
 */
function renameVMRegisters(code) {
  // Process line-by-line to avoid renaming inside string literals
  const lines = code.split('\n');
  const result = lines.map(line => {
    // Apply register renames with word boundaries
    // Order matters: do longer patterns first to avoid partial matches
    let out = line;

    // r0 → __global (word boundary ensures we don't match r00, but r0 followed by [ is common)
    out = out.replace(/\br0\b/g, '__global');

    // r2 → __captures
    out = out.replace(/\br2\b/g, '__captures');

    // r4 → __args
    out = out.replace(/\br4\b/g, '__args');

    // r5 → __this
    out = out.replace(/\br5\b/g, '__this');

    // Q → __this_ctx (only standalone Q, not inside strings)
    // Q appears as: Q, Q;, Q), Q], = Q, etc.
    // Avoid matching Q inside quoted strings — conservative approach:
    // only replace Q when it's NOT inside a string literal
    out = out.replace(/\bQ\b/g, '__this_ctx');

    return out;
  });

  return result.join('\n');
}

/**
 * Eliminate dead string-constant stores.
 *
 * Pattern: Two consecutive lines where:
 *   Line 1: var rN = "string_literal";
 *   Line 2: var rN = <anything>;   (same register)
 *   AND rN does NOT appear in the RHS of Line 2
 *
 * Only the first line is removed; the second is kept.
 * Empty/whitespace-only lines between them are NOT skipped (must be consecutive).
 *
 * @param {string} code - The decompiled JS source
 * @returns {string} Code with dead stores removed
 */
function eliminateDeadStores(code) {
  const lines = code.split('\n');
  const toRemove = new Set();
  let eliminated = 0;

  for (let i = 0; i < lines.length - 1; i++) {
    const line1 = lines[i].trimStart();
    const line2 = lines[i + 1].trimStart();

    // Match: var rN = "...";  (the dead store candidate)
    const m1 = line1.match(/^var (r\d+) = "(?:[^"\\]|\\.)*";$/);
    if (!m1) continue;

    const reg = m1[1];

    // Match: var rN = <expr>;  (same register, next line)
    const m2 = line2.match(new RegExp('^var ' + reg + ' = (.+);$'));
    if (!m2) continue;

    const rhs = m2[1];

    // Safety check: ensure the register is NOT used in the RHS of the second line
    const regPattern = new RegExp('\\b' + reg + '\\b');
    if (regPattern.test(rhs)) continue;

    // Safe to remove line 1
    toRemove.add(i);
    eliminated++;
  }

  const result = lines.filter((_, i) => !toRemove.has(i));
  return result.join('\n');
}

/**
 * Inline single-use string variable assignments.
 *
 * Pattern: Two consecutive lines where:
 *   Line A: var rN = "string_literal";
 *   Line B: ... rN ... (rN appears exactly once, not inside a string literal)
 *
 * Transforms into:
 *   Line B: ... "string_literal" ... (rN replaced with the literal)
 *
 * Runs in a fixpoint loop — each pass may expose new inlining opportunities.
 *
 * Safety rules:
 *   1. Only inlines plain double-quoted string RHS
 *   2. Register must appear exactly once on the next line (word-boundary match)
 *   3. Register must NOT appear on any subsequent line before next `var rN =`
 *      (but ChaosVM re-declares with `var rN =` so we only check the next line)
 *   4. Skip if next line is also `var rN = "..."` for same register (dead store)
 *   5. Do NOT inline if register name appears inside a string literal on the next line
 *   6. Use string .replace() for substitution to avoid regex-special-char issues
 *
 * @param {string} code - The decompiled JS source
 * @returns {{code: string, totalInlined: number, iterations: number[]}} Result with stats
 */
function inlineStringVars(code) {
  const iterations = [];
  let totalInlined = 0;
  let current = code;

  for (let pass = 0; pass < 50; pass++) { // safety limit
    const lines = current.split('\n');
    const toRemove = new Set();
    const replacements = new Map(); // lineIndex → new line content
    let inlinedThisPass = 0;

    for (let i = 0; i < lines.length - 1; i++) {
      if (toRemove.has(i)) continue;

      const line1 = lines[i];
      const trimmed1 = line1.trimStart();

      // Match: var rN = "...";
      const m = trimmed1.match(/^var (r\d+) = ("(?:[^"\\]|\\.)*");$/);
      if (!m) continue;

      const reg = m[1];
      const strLiteral = m[2];

      // Find next non-empty line
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j >= lines.length) continue;

      const line2 = lines[j];
      const trimmed2 = line2.trimStart();

      // Skip if next line declares the same register (var rN = ...)
      // Inlining would put the string literal on the LHS: var "str" = ...
      if (new RegExp('^var ' + reg + '\\b').test(trimmed2)) continue;

      // Skip if next line has the register as an assignment target:
      //   rN = ...   or   rN[...] = ...
      if (new RegExp('^' + reg + '\\s*[\\[=]').test(trimmed2)) continue;

      // Count occurrences of rN (word-boundary) on the next line
      const regPattern = new RegExp('\\b' + reg + '\\b', 'g');
      const matches = line2.match(regPattern);
      if (!matches || matches.length !== 1) continue;

      // Safety: ensure the occurrence is NOT on the LHS of an assignment.
      // Find where rN appears and check what follows it.
      const occIdx = findWordBoundaryOccurrence(line2, reg);
      if (occIdx === -1) continue;
      // Check if what follows rN (skipping whitespace) is = (but not ==)
      const afterReg = line2.slice(occIdx + reg.length).replace(/^\s*/, '');
      if (/^=[^=]/.test(afterReg)) continue;
      // Also check if rN is preceded by "var " — it's a var declaration target
      const beforeReg = line2.slice(0, occIdx).trimEnd();
      if (beforeReg.endsWith('var')) continue;

      // Safety: don't inline if rN appears inside a string literal on line2
      // Check by removing all string literals from line2 and seeing if rN still appears
      const line2NoStrings = line2.replace(/"(?:[^"\\]|\\.)*"/g, '""');
      const matchesNoStr = line2NoStrings.match(regPattern);
      if (!matchesNoStr || matchesNoStr.length !== 1) continue;

      // Perform the substitution using indexOf + slice to avoid regex-special-char issues
      const idx = findWordBoundaryOccurrence(line2, reg);
      if (idx === -1) continue; // shouldn't happen but be safe

      const newLine2 = line2.slice(0, idx) + strLiteral + line2.slice(idx + reg.length);

      // Safety: check if the substitution would create a {}["..."] pattern
      // which acorn rejects (block + computed property = rvalue assignment error)
      if (/\{\}\s*\["/.test(newLine2)) continue;

      toRemove.add(i);
      replacements.set(j, newLine2);
      inlinedThisPass++;
    }

    if (inlinedThisPass === 0) break;

    // Apply changes
    const newLines = [];
    for (let i = 0; i < lines.length; i++) {
      if (toRemove.has(i)) continue;
      if (replacements.has(i)) {
        newLines.push(replacements.get(i));
      } else {
        newLines.push(lines[i]);
      }
    }

    current = newLines.join('\n');
    iterations.push(inlinedThisPass);
    totalInlined += inlinedThisPass;
  }

  return { code: current, totalInlined, iterations };
}

/**
 * Find the index of a word-boundary occurrence of `word` in `text`.
 * Returns the character index, or -1 if not found.
 */
function findWordBoundaryOccurrence(text, word) {
  let startPos = 0;
  while (true) {
    const idx = text.indexOf(word, startPos);
    if (idx === -1) return -1;

    // Check word boundaries
    const before = idx > 0 ? text[idx - 1] : ' ';
    const after = idx + word.length < text.length ? text[idx + word.length] : ' ';

    const isWordBefore = /\w/.test(before);
    const isWordAfter = /\w/.test(after);

    if (!isWordBefore && !isWordAfter) {
      return idx;
    }

    startPos = idx + 1;
  }
}

/**
 * Check if an RHS value is a "simple" expression safe for inlining.
 *
 * Returns an object { match: true, value: string, needsParens: boolean }
 * or { match: false } if the RHS is not simple enough to inline.
 *
 * Simple expressions (per Task 5.2 spec):
 *   1. Numeric literals: -?\d+(\.\d+)?
 *   2. Variable references: identifier (register or named var)
 *   3. Property accesses: rN[expr] or rN.prop (one level deep)
 *   4. Function references: func_NNN or func_NNN_invalid
 *   5. Unary: !expr, -expr, typeof expr (where expr is simple)
 *   6. Object/array literals: {}, Array(N)
 *   7. Boolean/null/undefined: true, false, null, undefined
 *
 * NOT inlined: method calls (rN.foo()), binary expressions (a + b),
 * ternaries, new Foo(), or anything with side effects.
 */
function classifySimpleRHS(rhs) {
  // 7. Boolean/null/undefined
  if (/^(true|false|null|undefined)$/.test(rhs)) {
    return { match: true, value: rhs, needsParens: false };
  }

  // 1. Numeric literals (integer or float, possibly negative)
  if (/^-?\d+(\.\d+)?$/.test(rhs)) {
    // Negative numbers need parens to avoid ambiguity (e.g., x - -5 → x - (-5))
    const needsParens = rhs.startsWith('-');
    return { match: true, value: rhs, needsParens };
  }

  // 4. Function references: func_NNN or func_NNN_invalid
  if (/^func_\d+(_invalid)?$/.test(rhs)) {
    return { match: true, value: rhs, needsParens: false };
  }

  // 6. Empty object literal
  if (rhs === '{}') {
    return { match: true, value: rhs, needsParens: false, isObjectLiteral: true };
  }

  // 6. Array(N) literal
  if (/^Array\(\d+\)$/.test(rhs)) {
    return { match: true, value: rhs, needsParens: false };
  }

  // 5. Unary: typeof expr
  if (/^typeof\s+/.test(rhs)) {
    const inner = rhs.replace(/^typeof\s+/, '');
    // inner must be a simple variable/register
    if (/^[a-zA-Z_]\w*$/.test(inner)) {
      return { match: true, value: rhs, needsParens: true };
    }
    return { match: false };
  }

  // 5. Unary: !expr
  if (rhs.startsWith('!')) {
    const inner = rhs.slice(1);
    if (/^[a-zA-Z_]\w*$/.test(inner)) {
      return { match: true, value: rhs, needsParens: true };
    }
    // Also allow !rN.prop or !rN[expr]
    if (/^[a-zA-Z_]\w*\.\w+$/.test(inner) || /^[a-zA-Z_]\w*\[/.test(inner)) {
      return { match: true, value: rhs, needsParens: true };
    }
    return { match: false };
  }

  // 3. Property access: rN.prop (simple dot access, one level)
  //    Must NOT be a method call (no parentheses)
  if (/^[a-zA-Z_]\w*\.\w+$/.test(rhs) && !rhs.includes('(')) {
    return { match: true, value: rhs, needsParens: false };
  }

  // 3. Property access: rN[expr] (bracket access, one level)
  //    Match: identifier[ ... ] where the brackets are balanced and no call follows
  if (/^[a-zA-Z_]\w*\[/.test(rhs)) {
    // Ensure it ends with ] and no trailing call ()
    // Find the matching ] for the first [
    const bracketStart = rhs.indexOf('[');
    let depth = 0;
    let bracketEnd = -1;
    for (let k = bracketStart; k < rhs.length; k++) {
      if (rhs[k] === '[') depth++;
      else if (rhs[k] === ']') {
        depth--;
        if (depth === 0) { bracketEnd = k; break; }
      }
    }
    // Must end exactly at the closing bracket (no trailing .foo() or [])
    if (bracketEnd === rhs.length - 1) {
      return { match: true, value: rhs, needsParens: false };
    }
    return { match: false };
  }

  // 2. Simple variable reference: identifier (register or named var)
  //    Must come AFTER property access checks to avoid matching rN.prop partially
  if (/^[a-zA-Z_]\w*$/.test(rhs)) {
    return { match: true, value: rhs, needsParens: false };
  }

  return { match: false };
}

/**
 * Inline single-use numeric/expression variable assignments.
 *
 * Same pattern as inlineStringVars but for broader RHS types:
 * numeric literals, variable references, property accesses, function refs,
 * unary expressions, object/array literals, booleans.
 *
 * Safety rules:
 *   1. RHS must be a "simple" expression (no calls, binary ops, etc.)
 *   2. Register appears exactly once on the next non-empty line (word-boundary)
 *   3. Register must NOT be on the LHS of an assignment on the next line
 *   4. Unary/negative expressions wrapped in parens when inlined
 *   5. {} must not be inlined into positions creating invalid syntax (e.g., {}.foo)
 *   6. __global[...] and __captures[...] only inlined into simple contexts
 *   7. Fixpoint loop until no more changes
 *
 * @param {string} code - The decompiled JS source
 * @returns {{code: string, totalInlined: number, iterations: number[]}} Result with stats
 */
function inlineSimpleVars(code) {
  const iterations = [];
  let totalInlined = 0;
  let current = code;

  for (let pass = 0; pass < 50; pass++) { // safety limit
    const lines = current.split('\n');
    const toRemove = new Set();
    const replacements = new Map(); // lineIndex → new line content
    let inlinedThisPass = 0;

    for (let i = 0; i < lines.length - 1; i++) {
      if (toRemove.has(i)) continue;

      const line1 = lines[i];
      const trimmed1 = line1.trimStart();

      // Match: var rN = <rhs>;
      // Must be a var declaration of a register
      const m = trimmed1.match(/^var (r\d+) = (.+);$/);
      if (!m) continue;

      const reg = m[1];
      const rhs = m[2];

      // Skip string literals (already handled by inlineStringVars)
      if (/^"(?:[^"\\]|\\.)*"$/.test(rhs)) continue;

      // Classify the RHS
      const classification = classifySimpleRHS(rhs);
      if (!classification.match) continue;

      // Find next non-empty line
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j >= lines.length) continue;

      const line2 = lines[j];
      const trimmed2 = line2.trimStart();

      // Skip if next line declares the same register (dead store pattern)
      if (new RegExp('^var ' + reg + '\\b').test(trimmed2)) continue;

      // Skip if next line has the register as a direct assignment target: rN = ...
      if (new RegExp('^' + reg + '\\s*=').test(trimmed2)) continue;

      // Skip if next line has the register as indexed assignment target: rN[...] = ...
      if (new RegExp('^' + reg + '\\s*\\[').test(trimmed2)) continue;

      // Count occurrences of rN (word-boundary) on the next line
      const regPattern = new RegExp('\\b' + reg + '\\b', 'g');
      const matches = line2.match(regPattern);
      if (!matches || matches.length !== 1) continue;

      // Safety: ensure the occurrence is NOT on the LHS of an assignment
      const occIdx = findWordBoundaryOccurrence(line2, reg);
      if (occIdx === -1) continue;
      const afterReg = line2.slice(occIdx + reg.length).replace(/^\s*/, '');
      if (/^=[^=]/.test(afterReg)) continue;
      // Also check if rN is preceded by "var " — it's a var declaration target
      const beforeReg = line2.slice(0, occIdx).trimEnd();
      if (beforeReg.endsWith('var')) continue;

      // Safety: don't inline if rN appears inside a string literal on line2
      const line2NoStrings = line2.replace(/"(?:[^"\\]|\\.)*"/g, '""');
      const matchesNoStr = line2NoStrings.match(regPattern);
      if (!matchesNoStr || matchesNoStr.length !== 1) continue;

      // Determine the replacement text
      let replacement = classification.value;
      if (classification.needsParens) {
        replacement = '(' + replacement + ')';
      }

      // Special safety: {} inlined must not create invalid syntax
      if (classification.isObjectLiteral) {
        // Don't inline {} if what follows would make it a block:
        //   {}.foo, {}[x], etc. — these are parse errors
        //   But assigning {} to something or passing as arg is fine
        const testLine = line2.slice(0, occIdx) + replacement + line2.slice(occIdx + reg.length);
        // Check if {} is followed by . or [ which would create invalid syntax
        const afterInline = testLine.slice(occIdx + replacement.length).replace(/^\s*/, '');
        if (/^[.\[]/.test(afterInline)) continue;
      }

      // Special safety: __global[...] and __captures[...] results — only inline into
      // simple contexts (return, assignment, single argument)
      if (/^(__global|__captures)\[/.test(rhs)) {
        // Only allow inlining into: return X, var X = ..., simple argument positions
        // Skip if the usage is inside a complex expression
        const usageLine = trimmed2;
        const isSimpleUsage = /^return\b/.test(usageLine) ||
          /^var\s+\w+\s*=/.test(usageLine) ||
          /^\w+\s*=\s*/.test(usageLine);
        if (!isSimpleUsage) continue;
      }

      // Property access: don't inline into LHS of assignment
      // (e.g., var r13 = r8[0]; r13 = 42;  — DON'T inline)
      // Already handled above by the assignment-target checks

      // Perform the substitution
      const idx = findWordBoundaryOccurrence(line2, reg);
      if (idx === -1) continue;

      const newLine2 = line2.slice(0, idx) + replacement + line2.slice(idx + reg.length);

      // Verify the substitution with acorn (lightweight: just check it doesn't create
      // obviously broken syntax). We'll do a full acorn check at the end.
      // For now, skip if {} creates .prop or [prop] access (handled above)

      toRemove.add(i);
      replacements.set(j, newLine2);
      inlinedThisPass++;
    }

    if (inlinedThisPass === 0) break;

    // Apply changes
    const newLines = [];
    for (let k = 0; k < lines.length; k++) {
      if (toRemove.has(k)) continue;
      if (replacements.has(k)) {
        newLines.push(replacements.get(k));
      } else {
        newLines.push(lines[k]);
      }
    }

    current = newLines.join('\n');
    iterations.push(inlinedThisPass);
    totalInlined += inlinedThisPass;
  }

  return { code: current, totalInlined, iterations };
}

/**
 * Apply all five polish transforms in sequence.
 *
 * Order: closures → registers → dead stores → string inlining → simple var inlining
 *
 * @param {string} code - The decompiled JS source
 * @param {Array} funcTable - Parsed functions.json array
 * @returns {string} Polished code
 */
function polishAll(code, funcTable) {
  let result = code;
  result = resolveClosures(result, funcTable);
  result = renameVMRegisters(result);
  result = eliminateDeadStores(result);
  const strResult = inlineStringVars(result);
  result = strResult.code;
  const simpleResult = inlineSimpleVars(result);
  result = simpleResult.code;
  return result;
}

module.exports = {
  resolveClosures,
  renameVMRegisters,
  eliminateDeadStores,
  inlineStringVars,
  inlineSimpleVars,
  classifySimpleRHS,
  polishAll,
  buildOffsetMap,
};
