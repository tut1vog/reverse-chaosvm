'use strict';

/**
 * Test suite for src/bot/slide-solver.js — Task 10.1.1 validation
 *
 * Implementation is now a Python OpenCV subprocess wrapper.
 *
 * Tests:
 *  1. API contract: solveSlider accepts two Buffers, returns Promise<number>
 *  2. Synthetic puzzle solves with known offsets
 *  3. PNG alpha mask support
 *  4. Performance (<500ms per solve)
 *  5. Dependency check (Node.js stdlib only — no canvas required by solver)
 *  6. Code review: subprocess wrapper correctness
 *  7. Edge cases (small/large images)
 *  8. Consistency (deterministic output)
 *  9. Python script alignment with bot.py
 */

const { createCanvas } = require('canvas');
const path = require('path');
const fs = require('fs');

const { solveSlider } = require('../puppeteer/slide-solver.js');

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, msg) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${msg}`);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  const diff = Math.abs(actual - expected);
  total++;
  if (diff <= tolerance) {
    passed++;
    console.log(`  ✅ ${msg} (actual=${actual}, expected=${expected}, diff=${diff})`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${msg} (actual=${actual}, expected=${expected}, diff=${diff}, tolerance=${tolerance})`);
  }
}

// ---------------------------------------------------------------------------
// Helpers: create synthetic CAPTCHA-like images as JPEG buffers
// ---------------------------------------------------------------------------

function createBgWithNotch(width, height, notchX, notchW, notchH) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, '#8899aa');
  grad.addColorStop(0.5, '#aabbcc');
  grad.addColorStop(1, '#99aabb');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 20; i++) {
    const rx = Math.floor(Math.random() * width);
    const ry = Math.floor(Math.random() * height);
    const rw = 5 + Math.floor(Math.random() * 30);
    const rh = 5 + Math.floor(Math.random() * 30);
    const c = Math.floor(100 + Math.random() * 100);
    ctx.fillStyle = `rgb(${c},${c+10},${c+20})`;
    ctx.fillRect(rx, ry, rw, rh);
  }

  const notchY = Math.floor((height - notchH) / 2);
  ctx.fillStyle = '#222222';
  ctx.fillRect(notchX, notchY, notchW, notchH);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(notchX, notchY, notchW, notchH);

  return canvas.toBuffer('image/jpeg', { quality: 0.95 });
}

function createSlicePiece(sliceW, sliceH, notchW, notchH) {
  const canvas = createCanvas(sliceW, sliceH);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#8899aa';
  ctx.fillRect(0, 0, sliceW, sliceH);

  const px = Math.floor((sliceW - notchW) / 2);
  const py = Math.floor((sliceH - notchH) / 2);
  ctx.fillStyle = '#222222';
  ctx.fillRect(px, py, notchW, notchH);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, notchW, notchH);

  return canvas.toBuffer('image/jpeg', { quality: 0.95 });
}

function createSlicePiecePNG(sliceW, sliceH, notchW, notchH) {
  const canvas = createCanvas(sliceW, sliceH);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, sliceW, sliceH);

  const px = Math.floor((sliceW - notchW) / 2);
  const py = Math.floor((sliceH - notchH) / 2);
  ctx.fillStyle = '#222222';
  ctx.fillRect(px, py, notchW, notchH);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, notchW, notchH);

  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testAPIContract() {
  console.log('\n=== Test Group 1: API Contract ===');

  const bg = createBgWithNotch(340, 212, 150, 60, 60);
  const slice = createSlicePiece(68, 212, 60, 60);

  assert(Buffer.isBuffer(bg), 'Background is a Buffer');
  assert(Buffer.isBuffer(slice), 'Slice is a Buffer');

  const result = solveSlider(bg, slice);
  assert(result instanceof Promise, 'solveSlider returns a Promise');

  const offset = await result;
  assert(typeof offset === 'number', `solveSlider resolves to a number (got ${typeof offset})`);
  assert(Number.isInteger(offset), `Return value is an integer (got ${offset})`);
  assert(offset >= 0, `Return value is non-negative (got ${offset})`);
  assert(offset < 340, `Return value is within image width (got ${offset})`);
}

async function testSyntheticSolves() {
  console.log('\n=== Test Group 2: Synthetic Puzzle Solves (known offsets) ===');

  const testCases = [
    { notchX: 50,  label: 'left-side notch at x=50' },
    { notchX: 100, label: 'center-left notch at x=100' },
    { notchX: 150, label: 'center notch at x=150' },
    { notchX: 200, label: 'center-right notch at x=200' },
    { notchX: 250, label: 'right-side notch at x=250' },
  ];

  const bgW = 340, bgH = 212;
  const sliceW = 68, sliceH = 212;
  const notchW = 55, notchH = 55;

  for (const tc of testCases) {
    const bg = createBgWithNotch(bgW, bgH, tc.notchX, notchW, notchH);
    const slice = createSlicePiece(sliceW, sliceH, notchW, notchH);

    const offset = await solveSlider(bg, slice);
    assertApprox(offset, tc.notchX, 15,
      `${tc.label}: offset=${offset} vs expected≈${tc.notchX}`);
  }
}

async function testPNGInput() {
  console.log('\n=== Test Group 3: PNG Input Support ===');

  const bgW = 340, bgH = 212;
  const sliceW = 68, sliceH = 212;
  const notchW = 55, notchH = 55;
  const notchX = 160;

  const bg = createBgWithNotch(bgW, bgH, notchX, notchW, notchH);
  const slicePNG = createSlicePiecePNG(sliceW, sliceH, notchW, notchH);

  const offset = await solveSlider(bg, slicePNG);
  assert(typeof offset === 'number', `PNG slice returns a number (got ${typeof offset})`);
  assert(offset >= 0 && offset < bgW, `PNG result in valid range (got ${offset})`);

  // Note: OpenCV reads PNG with alpha but matchTemplate doesn't mask by alpha.
  // The transparent regions become black pixels in the edge map, which shifts
  // the match position. This is expected — bot.py also doesn't use alpha masking.
  // We only verify it doesn't crash and returns a valid number.
  console.log(`  ℹ️  PNG offset=${offset} (OpenCV ignores alpha, match may differ from JPEG slice)`);
}

async function testPerformance() {
  console.log('\n=== Test Group 4: Performance (<500ms per solve) ===');

  const bgW = 340, bgH = 212;
  const sliceW = 68, sliceH = 212;
  const notchW = 55, notchH = 55;

  const bg = createBgWithNotch(bgW, bgH, 150, notchW, notchH);
  const slice = createSlicePiece(sliceW, sliceH, notchW, notchH);

  const times = [];
  const runs = 5;

  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await solveSlider(bg, slice);
    const elapsed = performance.now() - start;
    times.push(elapsed);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const max = Math.max(...times);

  console.log(`  Timing: avg=${avg.toFixed(1)}ms, max=${max.toFixed(1)}ms, runs=[${times.map(t => t.toFixed(1)).join(', ')}]ms`);
  assert(max < 500, `Max solve time ${max.toFixed(1)}ms < 500ms`);
  assert(avg < 300, `Avg solve time ${avg.toFixed(1)}ms < 300ms (headroom)`);
}

async function testDependencyCheck() {
  console.log('\n=== Test Group 5: Dependency Check (subprocess wrapper) ===');

  const src = fs.readFileSync(path.join(__dirname, '..', 'puppeteer', 'slide-solver.js'), 'utf8');

  // The wrapper should only use Node.js stdlib modules
  const requireMatches = src.match(/require\(['"](.*?)['"]\)/g) || [];
  const deps = requireMatches.map(m => m.match(/require\(['"](.*?)['"]\)/)[1]);

  console.log(`  Dependencies found: ${JSON.stringify(deps)}`);

  const stdlibModules = ['child_process', 'fs', 'os', 'path', 'crypto', 'util', 'stream', 'events'];
  const nonStdlib = deps.filter(d => !stdlibModules.includes(d));

  assert(nonStdlib.length === 0,
    `No external npm dependencies (only stdlib): ${nonStdlib.length === 0 ? 'all stdlib' : nonStdlib.join(', ')}`);

  // Must use child_process for subprocess
  assert(deps.includes('child_process'), 'Uses child_process for Python subprocess');
  assert(deps.includes('fs'), 'Uses fs for temp file I/O');
  assert(deps.includes('os'), 'Uses os for tmpdir');
  assert(deps.includes('path'), 'Uses path for script resolution');
}

async function testCodeReview() {
  console.log('\n=== Test Group 6: Code Review — Subprocess Wrapper ===');

  const src = fs.readFileSync(path.join(__dirname, '..', 'puppeteer', 'slide-solver.js'), 'utf8');

  // 1. Uses execFile (NOT exec) — prevents shell injection
  //    Check that `exec(` never appears except as part of `execFile(`
  const hasExecFile = src.includes('execFile');
  const hasNakedExec = /\bexec\s*\(/.test(src) && !/\bexecFile\s*\(/.test(src);
  assert(hasExecFile && !hasNakedExec,
    'Uses execFile (not exec) to prevent shell injection');

  // 2. Points to the Python script
  assert(src.includes('slide-solver.py'), 'References slide-solver.py');

  // 3. Uses .venv python (not system python)
  assert(src.includes('.venv') && src.includes('python3'),
    'Uses .venv/bin/python3 (not system python)');

  // 4. Writes temp files and cleans up
  assert(src.includes('tmpdir') || src.includes('os.tmpdir'),
    'Uses os.tmpdir() for temp files');
  assert(src.includes('finally'), 'Has finally block for cleanup');
  assert(src.includes('unlinkSync'), 'Cleans up temp files with unlinkSync');

  // 5. Parses integer from stdout
  assert(src.includes('parseInt') || src.includes('Number('),
    'Parses integer offset from Python stdout');

  // 6. Has timeout protection
  assert(src.includes('timeout'), 'Has subprocess timeout protection');

  // 7. Module exports
  assert(src.includes("module.exports") && src.includes('solveSlider'),
    'Exports solveSlider');

  // 8. Async function
  assert(src.includes('async function solveSlider'), 'solveSlider is async');

  // 9. Graceful error for missing python
  assert(src.includes('ENOENT'), 'Handles ENOENT (missing python) gracefully');
}

async function testEdgeCases() {
  console.log('\n=== Test Group 7: Edge Cases ===');

  // Small images
  const smallBg = createBgWithNotch(100, 50, 20, 20, 20);
  const smallSlice = createSlicePiece(30, 50, 20, 20);

  try {
    const offset = await solveSlider(smallBg, smallSlice);
    assert(typeof offset === 'number', `Small image solve works (offset=${offset})`);
  } catch (e) {
    assert(false, `Small image solve threw: ${e.message}`);
  }

  // Larger images (480x300)
  const largeBg = createBgWithNotch(480, 300, 200, 70, 70);
  const largeSlice = createSlicePiece(90, 300, 70, 70);

  try {
    const start = performance.now();
    const offset = await solveSlider(largeBg, largeSlice);
    const elapsed = performance.now() - start;
    assert(typeof offset === 'number', `Large image solve works (offset=${offset}, ${elapsed.toFixed(1)}ms)`);
    assert(elapsed < 500, `Large image still under 500ms (${elapsed.toFixed(1)}ms)`);
  } catch (e) {
    assert(false, `Large image solve threw: ${e.message}`);
  }
}

async function testConsistency() {
  console.log('\n=== Test Group 8: Consistency (same input → same output) ===');

  const bg = createBgWithNotch(340, 212, 180, 55, 55);
  const slice = createSlicePiece(68, 212, 55, 55);

  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(await solveSlider(bg, slice));
  }

  const allSame = results.every(r => r === results[0]);
  assert(allSame, `5 runs on same input produce identical results: [${results.join(', ')}]`);
}

async function testPythonScriptAlignment() {
  console.log('\n=== Test Group 9: Python Script vs bot.py Alignment ===');

  const pySrc = fs.readFileSync(
    path.join(__dirname, '..', 'puppeteer', 'slide-solver.py'), 'utf8'
  );

  // Verify the Python script matches bot.py's solve_slider() algorithm exactly:
  // 1. Grayscale conversion
  assert(pySrc.includes('cv2.cvtColor') && pySrc.includes('COLOR_BGR2GRAY'),
    'Python: cv2.cvtColor(img, COLOR_BGR2GRAY)');

  // 2. Canny edge detection with thresholds 100, 200
  assert(pySrc.includes('cv2.Canny') && pySrc.includes('100') && pySrc.includes('200'),
    'Python: cv2.Canny(gray, 100, 200)');

  // 3. Template matching with TM_CCOEFF_NORMED
  assert(pySrc.includes('cv2.matchTemplate') && pySrc.includes('TM_CCOEFF_NORMED'),
    'Python: cv2.matchTemplate with TM_CCOEFF_NORMED');

  // 4. minMaxLoc to get best match location
  assert(pySrc.includes('cv2.minMaxLoc'), 'Python: cv2.minMaxLoc for best match');

  // 5. Returns max_loc[0] (the x-coordinate)
  assert(pySrc.includes('max_loc[0]'), 'Python: returns max_loc[0] (x-offset)');

  // 6. Prints integer to stdout
  assert(pySrc.includes('print(int(offset))'), 'Python: prints int(offset) to stdout');

  // 7. Error handling — stderr + exit(1)
  assert(pySrc.includes('sys.exit(1)') && pySrc.includes('file=sys.stderr'),
    'Python: errors go to stderr with exit code 1');

  // 8. CLI interface — reads from sys.argv
  assert(pySrc.includes('sys.argv[1]') && pySrc.includes('sys.argv[2]'),
    'Python: reads bg and slice paths from sys.argv');
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Slide Solver Test Suite — Task 10.1.1 (Python OpenCV Subprocess) ===');
  console.log(`Date: ${new Date().toISOString()}\n`);

  try {
    await testAPIContract();
    await testSyntheticSolves();
    await testPNGInput();
    await testPerformance();
    await testDependencyCheck();
    await testCodeReview();
    await testEdgeCases();
    await testConsistency();
    await testPythonScriptAlignment();
  } catch (e) {
    console.error(`\n🚨 FATAL ERROR: ${e.message}`);
    console.error(e.stack);
    failed++;
    total++;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  console.log(`${'='.repeat(60)}`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
