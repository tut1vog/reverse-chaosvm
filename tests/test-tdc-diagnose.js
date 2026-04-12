'use strict';

/**
 * Test suite for scripts/tdc-diagnose.js — parseArgs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const mod = require('../research/template-pool/diagnose');
const { parseArgs } = mod;

// ============================================================================
// Helpers
// ============================================================================

function withArgv(args, fn) {
  const saved = process.argv;
  process.argv = ['node', 'script', ...args];
  try { return fn(); } finally { process.argv = saved; }
}

// ============================================================================
// Module Loading
// ============================================================================

describe('tdc-diagnose module', () => {
  it('loads without error', () => {
    assert.ok(mod, 'module should be truthy');
  });

  it('exports parseArgs', () => {
    assert.strictEqual(typeof parseArgs, 'function');
  });
});

// ============================================================================
// parseArgs
// ============================================================================

describe('parseArgs', () => {
  it('returns defaults when no arguments given', () => {
    const opts = withArgv([], () => parseArgs());
    assert.deepStrictEqual(opts, {
      attempts: 30,
      verbose: false,
      delay: 3000,
      hash: null,
    });
  });

  it('parses --attempts', () => {
    const opts = withArgv(['--attempts', '10'], () => parseArgs());
    assert.strictEqual(opts.attempts, 10);
    assert.strictEqual(opts.verbose, false);
    assert.strictEqual(opts.delay, 3000);
    assert.strictEqual(opts.hash, null);
  });

  it('parses --verbose', () => {
    const opts = withArgv(['--verbose'], () => parseArgs());
    assert.strictEqual(opts.verbose, true);
    assert.strictEqual(opts.attempts, 30);
    assert.strictEqual(opts.delay, 3000);
    assert.strictEqual(opts.hash, null);
  });

  it('parses --delay', () => {
    const opts = withArgv(['--delay', '5000'], () => parseArgs());
    assert.strictEqual(opts.delay, 5000);
    assert.strictEqual(opts.attempts, 30);
    assert.strictEqual(opts.verbose, false);
    assert.strictEqual(opts.hash, null);
  });

  it('parses --hash', () => {
    const opts = withArgv(['--hash', 'abc123'], () => parseArgs());
    assert.strictEqual(opts.hash, 'abc123');
    assert.strictEqual(opts.attempts, 30);
    assert.strictEqual(opts.verbose, false);
    assert.strictEqual(opts.delay, 3000);
  });

  it('parses all flags together', () => {
    const opts = withArgv(
      ['--attempts', '15', '--verbose', '--delay', '7000', '--hash', 'deadbeef'],
      () => parseArgs()
    );
    assert.deepStrictEqual(opts, {
      attempts: 15,
      verbose: true,
      delay: 7000,
      hash: 'deadbeef',
    });
  });

  it('handles flags in different order', () => {
    const opts = withArgv(
      ['--hash', 'ff00', '--verbose', '--delay', '1000', '--attempts', '5'],
      () => parseArgs()
    );
    assert.deepStrictEqual(opts, {
      attempts: 5,
      verbose: true,
      delay: 1000,
      hash: 'ff00',
    });
  });
});
