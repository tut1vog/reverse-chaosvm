'use strict';

/**
 * Test suite for Scraper._autoPort(tdcName, tdcSource)
 *
 * Mocks child_process.execFile at the module level so the scraper's
 * destructured reference captures the mock.  Each test group clears
 * the require cache for scraper.js and re-requires it after installing
 * the appropriate mock.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const childProcess = require('child_process');
const originalExecFile = childProcess.execFile;

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCRAPER_PATH = require.resolve('../scraper/scraper');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Unique TDC name per test to avoid collisions. */
let nameCounter = 0;
function uniqueTdcName() {
  return 'TestAutoPort' + (++nameCounter) + '_' + Date.now();
}

/** Expected output dir for a given tdcName. */
function outputDir(tdcName) {
  return path.join(PROJECT_ROOT, 'output', 'tdc-autoport-' + tdcName);
}

/** Expected temp file path matching the implementation. */
function tempFilePath(tdcName) {
  return path.join(os.tmpdir(), 'tdc-autoport-' + tdcName + '.js');
}

/** Write a pipeline-config.json that the method will read after execFile succeeds. */
function writePipelineConfig(tdcName, config) {
  const dir = outputDir(tdcName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'pipeline-config.json'), JSON.stringify(config), 'utf8');
}

/** Remove the output directory created for a test. */
function cleanupOutputDir(tdcName) {
  const dir = outputDir(tdcName);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Remove temp file if it leaked. */
function cleanupTempFile(tdcName) {
  const p = tempFilePath(tdcName);
  try { fs.unlinkSync(p); } catch (_) {}
}

/**
 * Install an execFile mock, clear scraper require cache, re-require Scraper,
 * and return a fresh Scraper instance with an in-memory TemplateCache.
 *
 * @param {Function} mockFn - (cmd, args, opts, cb) => void
 * @returns {Object} { Scraper, scraper }
 */
function setupScraper(mockFn) {
  childProcess.execFile = mockFn;
  delete require.cache[SCRAPER_PATH];
  const Scraper = require(SCRAPER_PATH);
  const scraper = new Scraper({ verbose: false });

  // Replace the init() flow with a minimal TemplateCache (in-memory, no disk save)
  const TemplateCache = require('../scraper/template-cache');
  const tmpCache = path.join(os.tmpdir(), 'test-autoport-cache-' + Date.now() + '.json');
  scraper._templateCache = new TemplateCache(tmpCache);
  scraper._templateCache.load();
  // Override save() to no-op so tests don't write to disk cache
  scraper._templateCache.save = function () {};

  return { Scraper, scraper };
}

/** Full pipeline-config fixture with all fields populated. */
function fullConfig() {
  return {
    template: 'X',
    xteaParams: {
      key: [0x11111111, 0x22222222, 0x33333333, 0x44444444],
      delta: 0x9E3779B9,
      rounds: 32,
      keyModConstants: [100, 200],
      keyMods: [0, 100, 0, 200],
    },
    caseCount: 95,
    structureParams: {
      fieldOrder: [3, 1, 2, 0],
      hashPosition: 42,
      serializationDiffs: { '5': 'foo' },
      headerSplit: { pos: 10, marker: 0xFF },
    },
  };
}

/** Minimal pipeline-config with no structureParams. */
function minimalConfig() {
  return {
    template: 'Y',
    xteaParams: {
      key: [0xAAAAAAAA, 0xBBBBBBBB, 0xCCCCCCCC, 0xDDDDDDDD],
      delta: 0x9E3779B9,
      rounds: 32,
      keyModConstants: [500, 600],
      keyMods: [0, 500, 0, 600],
    },
    caseCount: 94,
    structureParams: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Scraper._autoPort()', () => {
  let currentName = null;

  afterEach(() => {
    // Restore original execFile and clear scraper cache
    childProcess.execFile = originalExecFile;
    delete require.cache[SCRAPER_PATH];
    if (currentName) {
      cleanupOutputDir(currentName);
      cleanupTempFile(currentName);
      currentName = null;
    }
  });

  // -----------------------------------------------------------------------
  // 1. Success with full structure params
  // -----------------------------------------------------------------------
  it('returns cached entry with all fields when pipeline succeeds with full structureParams', async () => {
    const tdcName = uniqueTdcName();
    currentName = tdcName;
    const config = fullConfig();

    const { scraper } = setupScraper((cmd, args, opts, cb) => {
      // Simulate successful pipeline execution
      cb(null, 'pipeline done\n', '');
    });

    // Pre-create the pipeline-config.json the method will read
    writePipelineConfig(tdcName, config);

    const result = await scraper._autoPort(tdcName, 'fake tdc source');

    assert.ok(result, 'should return a non-null result');
    assert.strictEqual(result.template, 'X');
    assert.deepStrictEqual(result.key, config.xteaParams.key);
    assert.strictEqual(result.delta, config.xteaParams.delta);
    assert.strictEqual(result.rounds, config.xteaParams.rounds);
    assert.deepStrictEqual(result.keyModConstants, config.xteaParams.keyModConstants);
    assert.deepStrictEqual(result.keyMods, config.xteaParams.keyMods);
    assert.strictEqual(result.caseCount, 95);

    // Structure params
    assert.deepStrictEqual(result.cdFieldOrder, [3, 1, 2, 0]);
    assert.deepStrictEqual(result.fieldOrder, [3, 1, 2, 0]);
    assert.strictEqual(result.hashPosition, 42);
    assert.deepStrictEqual(result.serializationDiffs, { '5': 'foo' });
    assert.deepStrictEqual(result.headerSplit, { pos: 10, marker: 0xFF });
  });

  // -----------------------------------------------------------------------
  // 2. Success without structure params
  // -----------------------------------------------------------------------
  it('returns cached entry with base XTEA fields when structureParams is null', async () => {
    const tdcName = uniqueTdcName();
    currentName = tdcName;
    const config = minimalConfig();

    const { scraper } = setupScraper((cmd, args, opts, cb) => {
      cb(null, '', '');
    });

    writePipelineConfig(tdcName, config);

    const result = await scraper._autoPort(tdcName, 'fake source');

    assert.ok(result, 'should return a non-null result');
    assert.strictEqual(result.template, 'Y');
    assert.deepStrictEqual(result.key, config.xteaParams.key);
    assert.strictEqual(result.delta, config.xteaParams.delta);
    assert.strictEqual(result.rounds, config.xteaParams.rounds);
    assert.strictEqual(result.caseCount, 94);

    // Structure fields should NOT be present
    assert.strictEqual(result.cdFieldOrder, undefined);
    assert.strictEqual(result.fieldOrder, undefined);
    assert.strictEqual(result.hashPosition, undefined);
    assert.strictEqual(result.serializationDiffs, undefined);
    assert.strictEqual(result.headerSplit, undefined);
  });

  // -----------------------------------------------------------------------
  // 3. Failure path (pipeline error / non-zero exit)
  // -----------------------------------------------------------------------
  it('returns null when execFile calls back with an error', async () => {
    const tdcName = uniqueTdcName();
    currentName = tdcName;

    const { scraper } = setupScraper((cmd, args, opts, cb) => {
      const err = new Error('pipeline crashed');
      err.stderr = 'fatal: bad opcode table';
      cb(err);
    });

    const result = await scraper._autoPort(tdcName, 'bad source');

    assert.strictEqual(result, null, 'should return null on pipeline failure');
  });

  // -----------------------------------------------------------------------
  // 4. Timeout path
  // -----------------------------------------------------------------------
  it('returns null when execFile times out', async () => {
    const tdcName = uniqueTdcName();
    currentName = tdcName;

    const { scraper } = setupScraper((cmd, args, opts, cb) => {
      const err = new Error('process timed out');
      err.killed = true;
      err.signal = 'SIGTERM';
      err.code = null;
      cb(err);
    });

    const result = await scraper._autoPort(tdcName, 'slow source');

    assert.strictEqual(result, null, 'should return null on timeout');
  });

  // -----------------------------------------------------------------------
  // 5. Temp file cleanup on success
  // -----------------------------------------------------------------------
  it('removes the temp file after successful auto-port', async () => {
    const tdcName = uniqueTdcName();
    currentName = tdcName;
    const config = fullConfig();

    const { scraper } = setupScraper((cmd, args, opts, cb) => {
      // Verify the temp file was created before the pipeline ran
      const tmpPath = tempFilePath(tdcName);
      assert.ok(fs.existsSync(tmpPath), 'temp file should exist when pipeline runs');
      assert.strictEqual(fs.readFileSync(tmpPath, 'utf8'), 'source for cleanup test');
      cb(null, '', '');
    });

    writePipelineConfig(tdcName, config);

    await scraper._autoPort(tdcName, 'source for cleanup test');

    const tmpPath = tempFilePath(tdcName);
    assert.ok(!fs.existsSync(tmpPath), 'temp file should be removed after success');
  });

  // -----------------------------------------------------------------------
  // 6. Temp file cleanup on failure
  // -----------------------------------------------------------------------
  it('removes the temp file after failed auto-port', async () => {
    const tdcName = uniqueTdcName();
    currentName = tdcName;

    const { scraper } = setupScraper((cmd, args, opts, cb) => {
      // Verify file was created
      assert.ok(fs.existsSync(tempFilePath(tdcName)), 'temp file should exist when pipeline runs');
      cb(new Error('boom'));
    });

    await scraper._autoPort(tdcName, 'source for failure cleanup');

    assert.ok(!fs.existsSync(tempFilePath(tdcName)), 'temp file should be removed after failure');
  });

  // -----------------------------------------------------------------------
  // 7. Missing pipeline-config.json after execFile success
  // -----------------------------------------------------------------------
  it('returns null when pipeline-config.json is missing after pipeline success', async () => {
    const tdcName = uniqueTdcName();
    currentName = tdcName;

    const { scraper } = setupScraper((cmd, args, opts, cb) => {
      // Pipeline "succeeds" but produces no config file
      cb(null, 'done\n', '');
    });

    // Deliberately do NOT create the pipeline-config.json

    const result = await scraper._autoPort(tdcName, 'source no config');

    assert.strictEqual(result, null, 'should return null when config file is missing');
  });

  // -----------------------------------------------------------------------
  // 8. Stores entry in template cache
  // -----------------------------------------------------------------------
  it('stores the entry in the template cache and lookup returns it', async () => {
    const tdcName = uniqueTdcName();
    currentName = tdcName;
    const config = fullConfig();

    const { scraper } = setupScraper((cmd, args, opts, cb) => {
      cb(null, '', '');
    });

    writePipelineConfig(tdcName, config);

    await scraper._autoPort(tdcName, 'store test source');

    // Verify that the template cache now contains this entry
    const cached = scraper._templateCache.lookup(tdcName);
    assert.ok(cached, 'entry should be in template cache after auto-port');
    assert.strictEqual(cached.template, 'X');
    assert.deepStrictEqual(cached.key, config.xteaParams.key);
  });

  // -----------------------------------------------------------------------
  // 9. Writes correct source to temp file
  // -----------------------------------------------------------------------
  it('writes the provided tdcSource to the temp file', async () => {
    const tdcName = uniqueTdcName();
    currentName = tdcName;
    const config = fullConfig();
    const sourceCode = '// this is the tdc source code\nvar x = 42;';

    let capturedSource = null;

    const { scraper } = setupScraper((cmd, args, opts, cb) => {
      capturedSource = fs.readFileSync(tempFilePath(tdcName), 'utf8');
      cb(null, '', '');
    });

    writePipelineConfig(tdcName, config);

    await scraper._autoPort(tdcName, sourceCode);

    assert.strictEqual(capturedSource, sourceCode, 'temp file should contain the provided tdc source');
  });

  // -----------------------------------------------------------------------
  // 10. Passes correct arguments to execFile
  // -----------------------------------------------------------------------
  it('invokes node with pipeline/run.js, temp file, and --skip-verify', async () => {
    const tdcName = uniqueTdcName();
    currentName = tdcName;
    const config = fullConfig();

    let capturedCmd = null;
    let capturedArgs = null;
    let capturedOpts = null;

    const { scraper } = setupScraper((cmd, args, opts, cb) => {
      capturedCmd = cmd;
      capturedArgs = args;
      capturedOpts = opts;
      cb(null, '', '');
    });

    writePipelineConfig(tdcName, config);

    await scraper._autoPort(tdcName, 'check args source');

    assert.strictEqual(capturedCmd, process.execPath, 'should use process.execPath as command');
    assert.strictEqual(capturedArgs.length, 3, 'should pass 3 arguments');
    assert.strictEqual(capturedArgs[0], path.join(PROJECT_ROOT, 'pipeline', 'run.js'));
    assert.strictEqual(capturedArgs[1], tempFilePath(tdcName));
    assert.strictEqual(capturedArgs[2], '--skip-verify');
    assert.strictEqual(capturedOpts.cwd, PROJECT_ROOT, 'should set cwd to PROJECT_ROOT');
    assert.strictEqual(capturedOpts.timeout, 120000, 'should set 120s timeout');
  });

  // -----------------------------------------------------------------------
  // 11. structureParams with partial fields (only fieldOrder)
  // -----------------------------------------------------------------------
  it('handles structureParams with only fieldOrder', async () => {
    const tdcName = uniqueTdcName();
    currentName = tdcName;
    const config = fullConfig();
    config.structureParams = { fieldOrder: [2, 0, 1, 3] };

    const { scraper } = setupScraper((cmd, args, opts, cb) => {
      cb(null, '', '');
    });

    writePipelineConfig(tdcName, config);

    const result = await scraper._autoPort(tdcName, 'partial struct source');

    assert.ok(result);
    assert.deepStrictEqual(result.cdFieldOrder, [2, 0, 1, 3]);
    assert.deepStrictEqual(result.fieldOrder, [2, 0, 1, 3]);
    assert.strictEqual(result.hashPosition, undefined);
    assert.strictEqual(result.serializationDiffs, undefined);
    assert.strictEqual(result.headerSplit, undefined);
  });

  // -----------------------------------------------------------------------
  // 12. structureParams with only hashPosition
  // -----------------------------------------------------------------------
  it('handles structureParams with only hashPosition', async () => {
    const tdcName = uniqueTdcName();
    currentName = tdcName;
    const config = fullConfig();
    config.structureParams = { hashPosition: 0 };

    const { scraper } = setupScraper((cmd, args, opts, cb) => {
      cb(null, '', '');
    });

    writePipelineConfig(tdcName, config);

    const result = await scraper._autoPort(tdcName, 'hashpos source');

    assert.ok(result);
    assert.strictEqual(result.hashPosition, 0, 'should handle hashPosition of 0 (falsy but defined)');
    assert.strictEqual(result.cdFieldOrder, undefined);
    assert.strictEqual(result.fieldOrder, undefined);
  });

  // -----------------------------------------------------------------------
  // 13. Error with stderr property (common for child process errors)
  // -----------------------------------------------------------------------
  it('handles error objects with stderr property', async () => {
    const tdcName = uniqueTdcName();
    currentName = tdcName;

    const { scraper } = setupScraper((cmd, args, opts, cb) => {
      const err = new Error('Command failed');
      err.stderr = 'Error: XTEA key extraction failed at line 42';
      cb(err);
    });

    // Should not throw, should return null gracefully
    const result = await scraper._autoPort(tdcName, 'stderr error source');
    assert.strictEqual(result, null);
  });
});
