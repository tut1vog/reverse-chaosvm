'use strict';

/**
 * test-xff-spoof-driver.js — Phase 71 regression guard for the
 * `materializeHeaders` per-call IP cache contract in
 * research/xff-spoof/run.js (added in task 71.3.1).
 *
 * Contract under test:
 *   (A) Within a single materializeHeaders() call, every header whose
 *       valueTemplate is RFC5737_RANDOM_IP resolves to the SAME minted
 *       IP. Multi-header conditions (XFF + X-Real-IP, etc.) must
 *       announce one consistent client IP per attempt.
 *   (B) Across separate materializeHeaders() calls, the minted IP
 *       rotates — the cache MUST NOT leak across calls, otherwise the
 *       experiment matrix would always see the same IP per condition.
 *   (C) Literal values (h.value) flow through verbatim, untouched by
 *       the templating path.
 *   (D) Every minted IP matches the RFC 5737 documentation-block
 *       shape, with host octet in 1..254 (never .0 or .255).
 *
 * A future refactor that moved the cache into module scope (breaking B)
 * or removed the cache entirely (breaking A) is exactly what this suite
 * is here to catch. The tests are pure function calls — zero I/O, zero
 * spawn, sub-100ms.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { materializeHeaders } = require('../research/xff-spoof/run');

const RFC5737_SHAPE = /^(192\.0\.2|198\.51\.100|203\.0\.113)\.([1-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-4])$/;

test('materializeHeaders per-call IP cache', async (t) => {
  await t.test('Case A: intra-call agreement across multiple RFC5737_RANDOM_IP headers', () => {
    const result = materializeHeaders([
      { name: 'X-Forwarded-For', valueTemplate: 'RFC5737_RANDOM_IP' },
      { name: 'X-Real-IP', valueTemplate: 'RFC5737_RANDOM_IP' },
      { name: 'True-Client-IP', valueTemplate: 'RFC5737_RANDOM_IP' },
    ]);

    const xff = result['X-Forwarded-For'];
    const xri = result['X-Real-IP'];
    const tci = result['True-Client-IP'];

    assert.strictEqual(xff, xri,
      'X-Forwarded-For ("' + xff + '") must equal X-Real-IP ("' + xri + '") within one call');
    assert.strictEqual(xri, tci,
      'X-Real-IP ("' + xri + '") must equal True-Client-IP ("' + tci + '") within one call');
    assert.strictEqual(xff, tci,
      'X-Forwarded-For ("' + xff + '") must equal True-Client-IP ("' + tci + '") within one call');
  });

  await t.test('Case B: inter-call divergence — cache does not leak across calls', () => {
    const ips = [];
    for (let i = 0; i < 5; i++) {
      const result = materializeHeaders([
        { name: 'X-Forwarded-For', valueTemplate: 'RFC5737_RANDOM_IP' },
        { name: 'X-Real-IP', valueTemplate: 'RFC5737_RANDOM_IP' },
      ]);
      // Sanity: still intra-call consistent.
      assert.strictEqual(result['X-Forwarded-For'], result['X-Real-IP'],
        'call #' + (i + 1) + ' must keep XFF == X-Real-IP ("' +
        result['X-Forwarded-For'] + '" vs "' + result['X-Real-IP'] + '")');
      ips.push(result['X-Forwarded-For']);
    }

    const distinct = new Set(ips);
    // RFC 5737 has 762 possible IPs (3 blocks * 254 host octets); the
    // probability of >=2 collisions in 5 draws is ~0.013. Tolerating one
    // collision (>=4 distinct) keeps the test robust while still failing
    // loudly if the cache leaks across calls (in which case all 5 would
    // be identical).
    assert.ok(distinct.size >= 4,
      'expected >=4 distinct IPs across 5 calls, got ' + distinct.size +
      ' — IPs: [' + ips.map((ip) => '"' + ip + '"').join(', ') + ']');
  });

  await t.test('Case C: literal values pass through verbatim', () => {
    // Sub-case 1: pure literal.
    const literalOnly = materializeHeaders([
      { name: 'X-Custom', value: 'literal-value' },
    ]);
    assert.deepStrictEqual(literalOnly, { 'X-Custom': 'literal-value' },
      'pure-literal call must return exactly { "X-Custom": "literal-value" }, got ' +
      JSON.stringify(literalOnly));

    // Sub-case 2: literal + template mix. Literal preserved, template
    // gets a real RFC 5737 IP.
    const mixed = materializeHeaders([
      { name: 'X-Custom', value: 'literal-value' },
      { name: 'X-Forwarded-For', valueTemplate: 'RFC5737_RANDOM_IP' },
    ]);
    assert.strictEqual(mixed['X-Custom'], 'literal-value',
      'literal value must be preserved verbatim in mixed spec, got "' + mixed['X-Custom'] + '"');
    assert.match(mixed['X-Forwarded-For'], RFC5737_SHAPE,
      'template position must mint an RFC 5737 IP, got "' + mixed['X-Forwarded-For'] + '"');
  });

  await t.test('Case D: every minted IP matches the RFC 5737 documentation-block shape', () => {
    for (let i = 0; i < 20; i++) {
      const result = materializeHeaders([
        { name: 'X-Forwarded-For', valueTemplate: 'RFC5737_RANDOM_IP' },
      ]);
      const ip = result['X-Forwarded-For'];
      assert.match(ip, RFC5737_SHAPE,
        'iteration ' + (i + 1) + ': minted IP "' + ip + '" must be in 192.0.2/24, ' +
        '198.51.100/24, or 203.0.113/24 with host octet 1..254');
    }
  });
});
