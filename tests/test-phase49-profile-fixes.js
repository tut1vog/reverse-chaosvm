'use strict';

/**
 * Phase 49.2 regression tests:
 *   - chrome-fingerprint.json profile field consistency
 *   - buildSlideSd coordinate ratio fix
 *   - ft (fingerprint token) generation
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

const profile = require('../profiles/chrome-fingerprint.json');
const {
  buildSlideSd,
  generateFt,
} = require('../tools/scraper/collect-generator');

// ============================================================================
// 1. Chrome fingerprint profile consistency
// ============================================================================

describe('chrome-fingerprint.json cdCanonical', () => {
  const cd = profile.cdCanonical;

  it('has exactly 59 fields', () => {
    assert.strictEqual(cd.length, 59);
  });

  it('[4] detectedFonts is a non-empty string (font hash)', () => {
    assert.strictEqual(typeof cd[4], 'string');
    assert.ok(cd[4].length > 0, 'detectedFonts should be non-empty');
  });

  it('[14] maxTouchPoints is an integer', () => {
    assert.strictEqual(typeof cd[14], 'number');
    assert.ok(Number.isInteger(cd[14]), 'maxTouchPoints should be an integer');
  });

  it('[25] maxTouchPointsDup is an integer', () => {
    assert.strictEqual(typeof cd[25], 'number');
    assert.ok(Number.isInteger(cd[25]), 'maxTouchPointsDup should be an integer');
  });

  it('[15] canvasHash is a positive integer', () => {
    assert.strictEqual(typeof cd[15], 'number');
    assert.ok(Number.isInteger(cd[15]), 'canvasHash should be an integer');
    assert.ok(cd[15] > 0, 'canvasHash should be positive');
  });

  it('[17] mathFingerprint is a number between 0 and 2', () => {
    assert.strictEqual(typeof cd[17], 'number');
    assert.ok(cd[17] >= 0, 'mathFingerprint should be >= 0');
    assert.ok(cd[17] <= 2, 'mathFingerprint should be <= 2');
  });

  it('[54] performanceHash is a positive integer', () => {
    assert.strictEqual(typeof cd[54], 'number');
    assert.ok(Number.isInteger(cd[54]), 'performanceHash should be an integer');
    assert.ok(cd[54] > 0, 'performanceHash should be positive');
  });
});

// ============================================================================
// 2. buildSlideSd coordinate ratio
// ============================================================================

describe('buildSlideSd coordinate ratio', () => {
  const slideAnswer = { x: 100, y: 50 };
  const slideValue = [[100, 800, 50], [0, 0, 0]];

  it('default coordinate[2] is not 1.0 (the old broken default)', () => {
    const sd = buildSlideSd(slideAnswer, slideValue);
    assert.notStrictEqual(sd.coordinate[2], 1.0);
  });

  it('default coordinate[2] is approximately 1.8559', () => {
    const sd = buildSlideSd(slideAnswer, slideValue);
    assert.ok(
      Math.abs(sd.coordinate[2] - 1.8559) < 0.001,
      `expected coordinate[2] ~1.8559 but got ${sd.coordinate[2]}`
    );
  });

  it('coordinate option overrides the default', () => {
    const custom = [20, 80, 2.5];
    const sd = buildSlideSd(slideAnswer, slideValue, { coordinate: custom });
    assert.deepStrictEqual(sd.coordinate, custom);
  });

  it('sd has all required keys', () => {
    const sd = buildSlideSd(slideAnswer, slideValue);
    const required = ['od', 'clientType', 'coordinate', 'trycnt', 'refreshcnt',
      'slideValue', 'dragobj', 'ft'];
    for (const key of required) {
      assert.ok(key in sd, `missing required key: ${key}`);
    }
  });
});

// ============================================================================
// 3. ft (fingerprint token) generation
// ============================================================================

describe('generateFt', () => {
  it('returns a string of length 9', () => {
    const ft = generateFt();
    assert.strictEqual(typeof ft, 'string');
    assert.strictEqual(ft.length, 9);
  });

  it('contains only alphanumeric and underscore characters', () => {
    const ft = generateFt();
    assert.match(ft, /^[a-zA-Z0-9_]+$/);
  });

  it('two consecutive calls produce different values', () => {
    const ft1 = generateFt();
    const ft2 = generateFt();
    assert.notStrictEqual(ft1, ft2);
  });
});
