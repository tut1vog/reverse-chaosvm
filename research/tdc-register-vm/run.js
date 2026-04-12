#!/usr/bin/env node
'use strict';

/**
 * run.js — Unified ChaosVM Decompiler Pipeline
 *
 * Chains the full decompilation pipeline or runs individual steps:
 *   decode → disasm → strings → functions → cfg → patterns → semantics
 *   → fold → reconstruct → emit → polish → analyze
 *
 * Usage:
 *   node decompiler/run.js --input tdc.js --output output/
 *   node decompiler/run.js --input tdc.js --step decode
 *   node decompiler/run.js --input tdc.js --step disasm
 *   node decompiler/run.js --input tdc.js --step strings
 *   node decompiler/run.js --input tdc.js --step functions
 *   node decompiler/run.js --input tdc.js --step cfg
 *   node decompiler/run.js --input tdc.js --step patterns
 *   node decompiler/run.js --input tdc.js --step emit
 *   node decompiler/run.js --input tdc.js --step polish
 *   node decompiler/run.js --input tdc.js --step analyze
 *   node decompiler/run.js --input tdc.js --step decompile   # full pipeline
 *   node decompiler/run.js --help
 *
 * Each step writes its output to the --output directory and depends on
 * artifacts produced by earlier steps (they must exist on disk).
 *
 * The "decompile" step runs all steps in sequence.
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════
// Argument parsing
// ═══════════════════════════════════════════════════════════════════════

const USAGE = `
ChaosVM Decompiler — Unified Pipeline

Usage:
  node decompiler/run.js --input <tdc.js> [--output <dir>] [--step <step>]

Options:
  --input <path>    Path to tdc.js file (required)
  --output <dir>    Output directory (default: ./output)
  --step <step>     Run only this step (default: decompile = all)
  --help            Show this help

Steps (in pipeline order):
  decode      Extract and decode bytecode from tdc.js
  disasm      Disassemble bytecode into text listing
  strings     Extract string literals from disassembly
  functions   Detect function boundaries
  cfg         Build control flow graphs
  patterns    Recognize control flow patterns (if/while/try)
  semantics   Annotate opcodes with semantic info
  fold        Fold register ops into expression trees
  reconstruct Reconstruct method calls
  emit        Emit JavaScript code
  polish      Apply cleanup transforms (rename, inline, dead store)
  analyze     Classify functions and annotate output
  decompile   Run all steps (default)

Each step depends on artifacts from earlier steps. If you run a single
step, ensure earlier artifacts exist in the output directory.
`.trim();

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { step: 'decompile' };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input': opts.input = args[++i]; break;
      case '--output': opts.outputDir = args[++i]; break;
      case '--step': opts.step = args[++i]; break;
      case '--help': console.log(USAGE); process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        console.error(USAGE);
        process.exit(1);
    }
  }

  if (!opts.input) {
    console.error('Error: --input is required');
    console.error(USAGE);
    process.exit(1);
  }

  opts.outputDir = opts.outputDir || path.resolve('output');
  opts.input = path.resolve(opts.input);
  return opts;
}

// ═══════════════════════════════════════════════════════════════════════
// Step implementations
// ═══════════════════════════════════════════════════════════════════════

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Step 1: decode — extract bytecode from tdc.js and decode it */
function stepDecode(opts) {
  console.log('\n=== Step: decode ===');
  const { decode } = require('./decoder');

  // Read tdc.js and extract the main bytecode
  const tdcSource = fs.readFileSync(opts.input, 'utf8');
  const lines = tdcSource.split('\n');

  // Find the line invoking __TENCENT_CHAOS_VM("base64string")
  // The base64 string can be 100K+ chars, so avoid regex on the full line
  let bytecodeB64 = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const idx = lines[i].indexOf('__TENCENT_CHAOS_VM("');
    if (idx !== -1) {
      const start = idx + '__TENCENT_CHAOS_VM("'.length;
      const end = lines[i].indexOf('"', start);
      if (end !== -1) {
        bytecodeB64 = lines[i].slice(start, end);
      }
      break;
    }
  }
  if (!bytecodeB64) {
    throw new Error('Could not find __TENCENT_CHAOS_VM("...") invocation in input file');
  }

  // Also extract config bytecode if present
  // Pattern: window[NAME] = 'base64string' or window.NAME = 'base64string'
  let configB64 = null;
  for (const line of lines) {
    if (/^window[\[.]/.test(line)) {
      const cm = line.match(/=\s*'([A-Za-z0-9+/=]{20,})'/);
      if (cm) { configB64 = cm[1]; break; }
    }
  }

  // Decode main bytecode
  const mainBytecode = decode(bytecodeB64);
  console.log(`  Main bytecode: ${mainBytecode.length} integers`);

  ensureDir(opts.outputDir);
  fs.writeFileSync(
    path.join(opts.outputDir, 'bytecode-main.json'),
    JSON.stringify(mainBytecode),
    'utf8'
  );
  console.log(`  Written: bytecode-main.json`);

  // Decode config bytecode if present
  if (configB64) {
    const configBytecode = decode(configB64);
    console.log(`  Config bytecode: ${configBytecode.length} integers`);
    fs.writeFileSync(
      path.join(opts.outputDir, 'bytecode-config.json'),
      JSON.stringify(configBytecode),
      'utf8'
    );
    console.log(`  Written: bytecode-config.json`);
  }

  return mainBytecode;
}

/** Step 2: disasm — disassemble bytecode */
function stepDisasm(opts) {
  console.log('\n=== Step: disasm ===');
  const { disassemble } = require('./disassembler');

  const bytecode = JSON.parse(
    fs.readFileSync(path.join(opts.outputDir, 'bytecode-main.json'), 'utf8')
  );

  // Find entry point: look for the start PC in the bytecode
  // Default to the known entry point, but allow override
  // For standard tdc.js builds, entry is typically at PC ~36579
  // We generate full disassembly from PC=0 for analysis
  const fullLines = disassemble(bytecode, 0);
  console.log(`  Full disassembly: ${fullLines.length} lines`);

  fs.writeFileSync(
    path.join(opts.outputDir, 'disasm-full.txt'),
    fullLines.join('\n') + '\n',
    'utf8'
  );
  console.log(`  Written: disasm-full.txt`);

  // Also generate entry-point disassembly
  // Try to detect entry PC from bytecode structure
  // The entry point info will be filled by function extraction
  const entryInfo = { fullLines: fullLines.length };
  fs.writeFileSync(
    path.join(opts.outputDir, 'entry-point.json'),
    JSON.stringify(entryInfo, null, 2),
    'utf8'
  );

  return fullLines;
}

/** Step 3: strings — extract string literals */
function stepStrings(opts) {
  console.log('\n=== Step: strings ===');
  const { extractStrings } = require('./string-extractor');

  const disasmText = fs.readFileSync(
    path.join(opts.outputDir, 'disasm-full.txt'), 'utf8'
  );
  const disasmLines = disasmText.split('\n').filter(l => l.length > 0);

  const strings = extractStrings(disasmLines);
  console.log(`  Extracted ${strings.length} strings`);

  fs.writeFileSync(
    path.join(opts.outputDir, 'strings.json'),
    JSON.stringify(strings, null, 2),
    'utf8'
  );

  // Human-readable output
  const txtLines = [`ChaosVM String Extraction — ${strings.length} strings`, '='.repeat(60), ''];
  for (let i = 0; i < strings.length; i++) {
    const s = strings[i];
    const display = s.value
      .replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r').replace(/\t/g, '\\t');
    txtLines.push(
      `[${String(i).padStart(4)}]  PC ${String(s.pc).padStart(5)}–${String(s.endPC).padStart(5)}  ${s.register.padEnd(4)}  "${display}"`
    );
  }
  fs.writeFileSync(path.join(opts.outputDir, 'strings.txt'), txtLines.join('\n') + '\n', 'utf8');
  console.log(`  Written: strings.json, strings.txt`);
}

/** Step 4: functions — detect function boundaries */
function stepFunctions(opts) {
  console.log('\n=== Step: functions ===');
  const { extractFunctions } = require('./function-extractor');

  const disasmText = fs.readFileSync(
    path.join(opts.outputDir, 'disasm-full.txt'), 'utf8'
  );
  const disasmLines = disasmText.split('\n').filter(l => l.length > 0);

  const functions = extractFunctions(disasmLines);
  const validCount = functions.filter(f => f.valid).length;
  console.log(`  Found ${functions.length} function entries (${validCount} valid)`);

  fs.writeFileSync(
    path.join(opts.outputDir, 'functions.json'),
    JSON.stringify(functions, null, 2),
    'utf8'
  );

  // Human-readable table
  const txtLines = [
    `ChaosVM Function Table — ${validCount} valid functions`,
    '='.repeat(80), '',
    '  ID  | Entry PC | Creator PC | Arity | Valid',
    '------+----------+------------+-------+------',
  ];
  for (const f of functions) {
    const id = String(f.id).padStart(4);
    const entry = f.entryPC !== null && !isNaN(f.entryPC)
      ? String(f.entryPC).padStart(8) : '     N/A';
    const creator = f.creatorPC !== null
      ? String(f.creatorPC).padStart(10) : '      main';
    const arity = f.arity !== null ? String(f.arity).padStart(5) : '    —';
    const valid = f.valid ? '  ✓' : '  ✗';
    txtLines.push(`${id}  | ${entry} | ${creator} | ${arity} | ${valid}`);
  }
  fs.writeFileSync(path.join(opts.outputDir, 'functions.txt'), txtLines.join('\n') + '\n', 'utf8');
  console.log(`  Written: functions.json, functions.txt`);
}

/** Step 5: cfg — build control flow graphs */
function stepCfg(opts) {
  console.log('\n=== Step: cfg ===');
  const { buildCFG } = require('./cfg-builder');

  const disasmLines = fs.readFileSync(
    path.join(opts.outputDir, 'disasm-full.txt'), 'utf8'
  ).split('\n').filter(l => l.length > 0);
  const functions = JSON.parse(
    fs.readFileSync(path.join(opts.outputDir, 'functions.json'), 'utf8')
  );

  const cfgMap = buildCFG(disasmLines, functions);
  console.log(`  Built CFGs for ${cfgMap.size} functions`);

  const cfgObj = {};
  let totalBlocks = 0;
  for (const [id, cfg] of cfgMap) {
    cfgObj[id] = cfg;
    totalBlocks += cfg.blockCount;
  }
  console.log(`  Total blocks: ${totalBlocks}`);

  fs.writeFileSync(
    path.join(opts.outputDir, 'cfg.json'),
    JSON.stringify(cfgObj, null, 2),
    'utf8'
  );
  console.log(`  Written: cfg.json`);
}

/** Step 6: patterns — recognize control flow patterns */
function stepPatterns(opts) {
  console.log('\n=== Step: patterns ===');
  const { recognizeAllPatterns } = require('./pattern-recognizer');

  const cfgData = JSON.parse(
    fs.readFileSync(path.join(opts.outputDir, 'cfg.json'), 'utf8')
  );
  const disasmLines = fs.readFileSync(
    path.join(opts.outputDir, 'disasm-full.txt'), 'utf8'
  ).split('\n');

  const results = recognizeAllPatterns(cfgData, disasmLines);
  const funcIds = Object.keys(results);
  let totalPatterns = 0;
  for (const id of funcIds) totalPatterns += results[id].stats.total;
  console.log(`  ${funcIds.length} functions, ${totalPatterns} patterns`);

  fs.writeFileSync(
    path.join(opts.outputDir, 'patterns.json'),
    JSON.stringify(results, null, 2),
    'utf8'
  );
  console.log(`  Written: patterns.json`);
}

/** Step 7: semantics — spot check opcode semantic annotations */
function stepSemantics(opts) {
  console.log('\n=== Step: semantics ===');
  const { OPCODE_TABLE, MNEMONIC_TO_OPCODE, getSemantics, parseDisasmToIR } = require('./opcode-semantics');

  const disasmLines = fs.readFileSync(
    path.join(opts.outputDir, 'disasm-full.txt'), 'utf8'
  ).split('\n').filter(l => l.trim());

  const seenOpcodes = new Map();
  for (const line of disasmLines) {
    const m = line.match(/^\[(\d+)\]\s+(\S+)/);
    if (!m) continue;
    const mnemonic = m[2];
    const opcode = MNEMONIC_TO_OPCODE[mnemonic];
    if (opcode !== undefined && !seenOpcodes.has(opcode)) {
      seenOpcodes.set(opcode, line);
    }
  }
  console.log(`  ${seenOpcodes.size} unique opcodes found`);

  // Verify all opcodes parse
  let errors = 0;
  for (const [opcode, line] of seenOpcodes) {
    try {
      const ir = parseDisasmToIR(line);
      if (!ir || !ir.semantics) errors++;
    } catch (e) { errors++; }
  }
  console.log(`  Semantic coverage: ${seenOpcodes.size - errors}/${seenOpcodes.size} OK`);
}

/** Step 8: fold — expression folding */
function stepFold(opts) {
  console.log('\n=== Step: fold ===');
  const { foldAll } = require('./expression-folder');

  const cfgJson = JSON.parse(
    fs.readFileSync(path.join(opts.outputDir, 'cfg.json'), 'utf8')
  );
  const disasmLines = fs.readFileSync(
    path.join(opts.outputDir, 'disasm-full.txt'), 'utf8'
  ).split('\n');

  const allFolded = foldAll(cfgJson, disasmLines);
  console.log(`  Folded ${allFolded.size} functions`);
  return allFolded;
}

/** Step 9: reconstruct — method call reconstruction */
function stepReconstruct(opts, allFolded) {
  console.log('\n=== Step: reconstruct ===');
  const { foldAll } = require('./expression-folder');
  const { reconstructAll } = require('./method-reconstructor');

  const cfgJson = JSON.parse(
    fs.readFileSync(path.join(opts.outputDir, 'cfg.json'), 'utf8')
  );
  const disasmLines = fs.readFileSync(
    path.join(opts.outputDir, 'disasm-full.txt'), 'utf8'
  ).split('\n');

  if (!allFolded) {
    allFolded = foldAll(cfgJson, disasmLines);
  }
  const allReconstructed = reconstructAll(allFolded);
  console.log(`  Reconstructed ${allReconstructed.size} functions`);
  return allReconstructed;
}

/** Step 10: emit — code generation */
function stepEmit(opts) {
  console.log('\n=== Step: emit ===');
  const { foldAll } = require('./expression-folder');
  const { reconstructAll } = require('./method-reconstructor');
  const { emitAll, emitProgram } = require('./code-emitter');

  const cfg = JSON.parse(fs.readFileSync(path.join(opts.outputDir, 'cfg.json'), 'utf8'));
  const patterns = JSON.parse(fs.readFileSync(path.join(opts.outputDir, 'patterns.json'), 'utf8'));
  const funcs = JSON.parse(fs.readFileSync(path.join(opts.outputDir, 'functions.json'), 'utf8'));
  const disasmFull = fs.readFileSync(
    path.join(opts.outputDir, 'disasm-full.txt'), 'utf8'
  ).split('\n');

  const folded = foldAll(cfg, disasmFull);
  const reconstructed = reconstructAll(folded);
  const allEmitted = emitAll(reconstructed, patterns, cfg, funcs);
  console.log(`  Emitted ${allEmitted.size} functions`);

  const program = emitProgram(allEmitted, funcs);
  fs.writeFileSync(path.join(opts.outputDir, 'decompiled.js'), program);
  console.log(`  Written: decompiled.js (${program.split('\n').length} lines)`);
}

/** Step 11: polish — cleanup transforms */
function stepPolish(opts) {
  console.log('\n=== Step: polish ===');
  const { polishAll } = require('./output-polish');

  const code = fs.readFileSync(path.join(opts.outputDir, 'decompiled.js'), 'utf8');
  const funcTable = JSON.parse(fs.readFileSync(path.join(opts.outputDir, 'functions.json'), 'utf8'));

  const polished = polishAll(code, funcTable);
  const linesBefore = code.split('\n').length;
  const linesAfter = polished.split('\n').length;
  console.log(`  ${linesBefore} → ${linesAfter} lines`);

  fs.writeFileSync(path.join(opts.outputDir, 'decompiled-polished.js'), polished);
  console.log(`  Written: decompiled-polished.js`);

  // Verify with acorn if available
  try {
    const acorn = require('acorn');
    acorn.parse(polished, { ecmaVersion: 2020, sourceType: 'script' });
    console.log(`  acorn parse: PASS`);
  } catch (e) {
    console.log(`  acorn parse: FAIL — ${e.message}`);
  }
}

/** Step 12: analyze — program analysis and annotation */
function stepAnalyze(opts) {
  console.log('\n=== Step: analyze ===');
  const { analyzeFunctions, annotateCode, generateSummary } = require('./program-analyzer');

  const code = fs.readFileSync(path.join(opts.outputDir, 'decompiled-polished.js'), 'utf8');
  const stringsJson = JSON.parse(fs.readFileSync(path.join(opts.outputDir, 'strings.json'), 'utf8'));
  const functionsJson = JSON.parse(fs.readFileSync(path.join(opts.outputDir, 'functions.json'), 'utf8'));

  const analysis = analyzeFunctions(code, stringsJson, functionsJson);
  console.log(`  ${analysis.totalFunctions} functions, ${analysis.nonUnknownCount} classified`);

  fs.writeFileSync(
    path.join(opts.outputDir, 'program-analysis.json'),
    JSON.stringify(analysis, null, 2),
    'utf8'
  );

  const annotated = annotateCode(code, analysis.functions);
  fs.writeFileSync(path.join(opts.outputDir, 'decompiled-annotated.js'), annotated);
  console.log(`  Written: decompiled-annotated.js (${annotated.split('\n').length} lines)`);

  const summary = generateSummary(analysis);
  fs.writeFileSync(path.join(opts.outputDir, 'program-summary.txt'), summary);
  console.log(`  Written: program-summary.txt`);
}

// ═══════════════════════════════════════════════════════════════════════
// Pipeline execution
// ═══════════════════════════════════════════════════════════════════════

const STEP_ORDER = [
  'decode', 'disasm', 'strings', 'functions', 'cfg', 'patterns',
  'semantics', 'fold', 'reconstruct', 'emit', 'polish', 'analyze'
];

const STEP_FNS = {
  decode: stepDecode,
  disasm: stepDisasm,
  strings: stepStrings,
  functions: stepFunctions,
  cfg: stepCfg,
  patterns: stepPatterns,
  semantics: stepSemantics,
  fold: stepFold,
  reconstruct: stepReconstruct,
  emit: stepEmit,
  polish: stepPolish,
  analyze: stepAnalyze,
};

function main() {
  const opts = parseArgs();

  console.log(`ChaosVM Decompiler`);
  console.log(`  Input:  ${opts.input}`);
  console.log(`  Output: ${opts.outputDir}`);
  console.log(`  Step:   ${opts.step}`);

  ensureDir(opts.outputDir);

  if (opts.step === 'decompile') {
    // Run all steps
    const startTime = Date.now();
    for (const step of STEP_ORDER) {
      STEP_FNS[step](opts);
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== Done (${elapsed}s) ===`);
    console.log(`Final output: ${path.join(opts.outputDir, 'decompiled-annotated.js')}`);
  } else if (STEP_FNS[opts.step]) {
    STEP_FNS[opts.step](opts);
  } else {
    console.error(`Unknown step: ${opts.step}`);
    console.error(`Valid steps: ${STEP_ORDER.join(', ')}, decompile`);
    process.exit(1);
  }
}

main();
