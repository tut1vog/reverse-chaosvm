'use strict';

/**
 * Slide Puzzle Solver — Node.js wrapper around Python OpenCV.
 *
 * Pipeline: Buffer → temp file → python3 slide-solver.py → parse stdout → x-offset
 *
 * Matches bot.py's solve_slider() exactly by delegating to the same OpenCV calls:
 *   cv2.Canny(gray, 100, 200)
 *   cv2.matchTemplate(bg_edge, tp_edge, cv2.TM_CCOEFF_NORMED)
 *
 * The Python script lives at puppeteer/slide-solver.py and runs inside .venv.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Resolve paths relative to this file's location
const SCRIPT_DIR = __dirname;
const PYTHON_SCRIPT = path.join(SCRIPT_DIR, 'slide-solver.py');
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const PYTHON_BIN = path.join(PROJECT_ROOT, '.venv', 'bin', 'python3');

/**
 * Solve a slide CAPTCHA puzzle.
 *
 * @param {Buffer} bgBuffer  — JPEG/PNG buffer of the background image
 * @param {Buffer} sliceBuffer — JPEG/PNG buffer of the slider piece
 * @returns {Promise<number>} — raw x-offset in pixels (integer)
 *
 * This matches bot.py's solve_slider() behavior:
 *   1. Convert both images to grayscale
 *   2. Apply Canny edge detection (low=100, high=200)
 *   3. Template-match the slice edges against the background edges (NCC)
 *   4. Return the x-coordinate of the best match
 *
 * The calibration offset (ratio + padding) is NOT applied here — it's the caller's job.
 */
async function solveSlider(bgBuffer, sliceBuffer) {
  // Write buffers to temp files (OpenCV reads from filesystem)
  const tmpDir = os.tmpdir();
  const ts = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const bgPath = path.join(tmpDir, `slide_bg_${ts}.png`);
  const slicePath = path.join(tmpDir, `slide_tp_${ts}.png`);

  try {
    fs.writeFileSync(bgPath, bgBuffer);
    fs.writeFileSync(slicePath, sliceBuffer);

    // Spawn Python process — use execFile (not exec) to avoid shell injection
    const result = await new Promise((resolve, reject) => {
      execFile(PYTHON_BIN, [PYTHON_SCRIPT, bgPath, slicePath], {
        timeout: 10000, // 10s hard limit
        maxBuffer: 1024,
      }, (error, stdout, stderr) => {
        if (error) {
          // Provide a helpful message if python or opencv is missing
          if (error.code === 'ENOENT') {
            reject(new Error(
              `Python not found at ${PYTHON_BIN}. ` +
              'Run: python3 -m venv .venv && .venv/bin/pip install opencv-python-headless numpy'
            ));
          } else {
            reject(new Error(
              `slide-solver.py failed (exit ${error.code}): ${stderr.trim() || error.message}`
            ));
          }
          return;
        }
        const offset = parseInt(stdout.trim(), 10);
        if (isNaN(offset)) {
          reject(new Error(`slide-solver.py returned non-integer: ${JSON.stringify(stdout.trim())}`));
          return;
        }
        resolve(offset);
      });
    });

    return result;
  } finally {
    // Clean up temp files
    try { fs.unlinkSync(bgPath); } catch (_) {}
    try { fs.unlinkSync(slicePath); } catch (_) {}
  }
}

module.exports = { solveSlider };
