'use strict';

/**
 * Test suite for scripts/tdc-survey.js — parseArgs and buildPostFields
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { parseArgs, buildPostFields } = require('../research/template-pool/survey');

// ============================================================================
// Helpers
// ============================================================================

function withArgv(args, fn) {
  const saved = process.argv;
  process.argv = ['node', 'script', ...args];
  try { return fn(); } finally { process.argv = saved; }
}

// ============================================================================
// parseArgs
// ============================================================================

describe('parseArgs', () => {
  it('returns defaults when no arguments given', () => {
    const opts = withArgv([], () => parseArgs());
    assert.deepStrictEqual(opts, {
      attempts: 20,
      verbose: false,
      saveSources: false,
      delay: 2000,
    });
  });

  it('parses all flags', () => {
    const opts = withArgv(
      ['--attempts', '50', '--verbose', '--save-sources', '--delay', '5000'],
      () => parseArgs()
    );
    assert.deepStrictEqual(opts, {
      attempts: 50,
      verbose: true,
      saveSources: true,
      delay: 5000,
    });
  });

  it('parses partial flags (--verbose --attempts 10)', () => {
    const opts = withArgv(['--verbose', '--attempts', '10'], () => parseArgs());
    assert.strictEqual(opts.verbose, true);
    assert.strictEqual(opts.attempts, 10);
    assert.strictEqual(opts.saveSources, false);
    assert.strictEqual(opts.delay, 2000);
  });
});

// ============================================================================
// buildPostFields
// ============================================================================

describe('buildPostFields', () => {
  const mockClient = { _showSubsid: '1' };
  const mockSession = { sess: 'test-sess-123', sid: 'test-sid-456' };
  const mockSig = {
    vsig: 'vs',
    websig: 'ws',
    nonce: 'n123',
    subcapclass: 'sc',
    showSubsid: '2',
  };
  const testAns = '100,50;';
  const testCollect = 'collectdata123';
  const testEks = 'eks-token-abc';

  function build() {
    return buildPostFields(mockClient, mockSession, mockSig, testAns, testCollect, testEks);
  }

  it('returns an object with exactly 38 keys', () => {
    const fields = build();
    assert.strictEqual(Object.keys(fields).length, 38);
  });

  it('contains all required fields', () => {
    const fields = build();
    const required = ['aid', 'protocol', 'sess', 'ans', 'collect', 'eks', 'nonce', 'vlg'];
    for (const key of required) {
      assert.ok(key in fields, `missing required field: ${key}`);
    }
  });

  it('ua field is valid base64 that decodes to a user-agent string', () => {
    const fields = build();
    const decoded = Buffer.from(fields.ua, 'base64').toString('utf8');
    assert.ok(decoded.includes('Mozilla/'), 'decoded ua should contain Mozilla/');
    // Round-trip: re-encode should match
    assert.strictEqual(fields.ua, Buffer.from(decoded).toString('base64'));
  });

  it('uses provided ans, collect, and eks values', () => {
    const fields = build();
    assert.strictEqual(fields.ans, testAns);
    assert.strictEqual(fields.collect, testCollect);
    assert.strictEqual(fields.eks, testEks);
  });
});
