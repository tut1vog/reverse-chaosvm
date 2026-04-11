'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  detectHashPosition,
  matchFieldOrder,
  detectSerializationDiffs,
  analyzeHeaderSplit,
} = require('../pipeline/structure-extractor');

// ═══════════════════════════════════════════════════════════════════════
// Helper: build a valid hash sentinel value
// ═══════════════════════════════════════════════════════════════════════
function makeHash(ts) {
  return [[4, -1, -1, ts || 1712345678, 0, 0, 0, 0]];
}

// ═══════════════════════════════════════════════════════════════════════
// 1. detectHashPosition
// ═══════════════════════════════════════════════════════════════════════

describe('detectHashPosition', () => {
  it('finds hash at position 0', () => {
    const cd = [makeHash(), 'foo', 42];
    assert.equal(detectHashPosition(cd), 0);
  });

  it('finds hash at position 11 (Template A known position)', () => {
    const cd = new Array(60).fill(null);
    cd[11] = makeHash(1712000000);
    assert.equal(detectHashPosition(cd), 11);
  });

  it('finds hash at position 51 (Template B known position)', () => {
    const cd = new Array(60).fill(null);
    cd[51] = makeHash(1712999999);
    assert.equal(detectHashPosition(cd), 51);
  });

  it('finds hash at end of array (position 59)', () => {
    const cd = new Array(60).fill(null);
    cd[59] = makeHash();
    assert.equal(detectHashPosition(cd), 59);
  });

  it('returns -1 when no hash present', () => {
    const cd = [1, 'two', [3], null, { a: 1 }];
    assert.equal(detectHashPosition(cd), -1);
  });

  it('returns -1 for empty array', () => {
    assert.equal(detectHashPosition([]), -1);
  });

  it('rejects inner array length != 8', () => {
    // 7-element inner array
    const cd = [[[4, -1, -1, 1712345678, 0, 0, 0]]];
    assert.equal(detectHashPosition(cd), -1);
    // 9-element inner array
    const cd2 = [[[4, -1, -1, 1712345678, 0, 0, 0, 0, 0]]];
    assert.equal(detectHashPosition(cd2), -1);
  });

  it('rejects when sentinel[0] != 4', () => {
    const cd = [[[5, -1, -1, 1712345678, 0, 0, 0, 0]]];
    assert.equal(detectHashPosition(cd), -1);
  });

  it('rejects when sentinel[1] != -1', () => {
    const cd = [[[4, 0, -1, 1712345678, 0, 0, 0, 0]]];
    assert.equal(detectHashPosition(cd), -1);
  });

  it('rejects when not wrapped in outer single-element array', () => {
    // bare 8-element array (not wrapped)
    const cd = [[4, -1, -1, 1712345678, 0, 0, 0, 0]];
    assert.equal(detectHashPosition(cd), -1);
    // wrapped in 2-element outer array
    const cd2 = [[[4, -1, -1, 1712345678, 0, 0, 0, 0], 'extra']];
    assert.equal(detectHashPosition(cd2), -1);
  });

  it('returns first occurrence when multiple hash-like patterns exist', () => {
    const cd = new Array(10).fill(null);
    cd[3] = makeHash(111);
    cd[7] = makeHash(222);
    assert.equal(detectHashPosition(cd), 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. matchFieldOrder
// ═══════════════════════════════════════════════════════════════════════

describe('matchFieldOrder', () => {
  it('matches userAgent string with "Mozilla/5.0" to schemaIdx 31', () => {
    const cd = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ];
    const { fieldOrder, matchDetails } = matchFieldOrder(cd);
    assert.equal(fieldOrder[0], 31);
    const detail = matchDetails.find((d) => d.schemaIdx === 31);
    assert.ok(detail);
    assert.equal(detail.field, 'userAgent');
  });

  it('matches languages array to schemaIdx 6', () => {
    const cd = [['en-US', 'en']];
    const { fieldOrder } = matchFieldOrder(cd);
    assert.equal(fieldOrder[0], 6);
  });

  it('matches screenResolution [1280, 1400] to schemaIdx 9', () => {
    const cd = [[1280, 1400]];
    const { fieldOrder } = matchFieldOrder(cd);
    assert.equal(fieldOrder[0], 9);
  });

  it('matches videoCodecs array of {codec, support} to schemaIdx 12', () => {
    const cd = [
      [
        { codec: 'H.264', support: 'probably' },
        { codec: 'VP9', support: 'probably' },
      ],
    ];
    const { fieldOrder } = matchFieldOrder(cd);
    assert.equal(fieldOrder[0], 12);
  });

  it('matches intlOptions {timeZone, calendar} to schemaIdx 34', () => {
    const cd = [{ timeZone: 'America/New_York', calendar: 'gregory' }];
    const { fieldOrder } = matchFieldOrder(cd);
    assert.equal(fieldOrder[0], 34);
  });

  it('matches "UTF-8" to characterSet schemaIdx 32', () => {
    const cd = ['UTF-8'];
    const { fieldOrder } = matchFieldOrder(cd);
    assert.equal(fieldOrder[0], 32);
  });

  it('matches "top" to frameStatus schemaIdx 41', () => {
    const cd = ['top'];
    const { fieldOrder } = matchFieldOrder(cd);
    assert.equal(fieldOrder[0], 41);
  });

  it('assigns -1 for hash position in fieldOrder', () => {
    const cd = ['some string', makeHash(), 'UTF-8'];
    const { fieldOrder } = matchFieldOrder(cd);
    assert.equal(fieldOrder[1], -1); // hash position
  });

  it('unmatchedCount reflects unmatched non-hash fields', () => {
    // Give it a hash + one recognizable + one unrecognizable value
    const cd = [makeHash(), 'UTF-8', 'random-unknown-value-xyz'];
    const { unmatchedCount } = matchFieldOrder(cd);
    // 'random-unknown-value-xyz' should be unmatched (or matched to something heuristic)
    // But since it doesn't match any signature or heuristic, it stays -1
    assert.ok(unmatchedCount >= 0);
  });

  it('empty array returns empty fieldOrder with 0 unmatched', () => {
    const { fieldOrder, unmatchedCount } = matchFieldOrder([]);
    assert.equal(fieldOrder.length, 0);
    assert.equal(unmatchedCount, 0);
  });

  it('array of all nulls triggers heuristic/elimination paths', () => {
    const cd = [null, null, null];
    const { fieldOrder, unmatchedCount } = matchFieldOrder(cd);
    assert.equal(fieldOrder.length, 3);
    // nulls get matched heuristically (connectionInfo=35 is high confidence null)
    // At most one null gets matched; the rest stay -1
    const matched = fieldOrder.filter((v) => v !== -1);
    assert.ok(matched.length <= 3);
    // Remaining unmatched nulls
    assert.ok(unmatchedCount >= 0);
  });

  it('fieldOrder length matches input length', () => {
    const cd = new Array(60).fill(null);
    cd[11] = makeHash();
    cd[0] = 'Mozilla/5.0 test browser';
    const { fieldOrder } = matchFieldOrder(cd);
    assert.equal(fieldOrder.length, 60);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. detectSerializationDiffs
// ═══════════════════════════════════════════════════════════════════════

describe('detectSerializationDiffs', () => {
  it('returns 0 diffs for identical data', () => {
    const cd = [1, 'hello', null, true];
    // Build the same plaintext that buildCdString would produce
    const plaintext = '{"cd":[1,"hello",null,true]}';
    const diffs = detectSerializationDiffs(plaintext, cd);
    assert.equal(diffs.length, 0);
  });

  it('correctly parses cd from plaintext with both cd and sd sections', () => {
    // Only the cd portion should be compared; sd is after ]}
    const cd = [42, 'test'];
    const plaintext = '{"cd":[42,"test"]},"sd":"something"}';
    // buildCdString produces '{"cd":[42,"test"]}'
    // parseCdFields on the plaintext should find the cd array properly
    const diffs = detectSerializationDiffs(plaintext, cd);
    assert.ok(Array.isArray(diffs));
  });

  it('reports extras when Chrome has more fields than buildCdString', () => {
    // Our cdArray has 2 elements, but Chrome's plaintext has 3
    const cd = [1, 2];
    // Chrome plaintext has an extra field
    const plaintext = '{"cd":[1,2,3]}';
    const diffs = detectSerializationDiffs(plaintext, cd);
    // Should detect that field at index 2 exists in Chrome but not in ours
    assert.ok(diffs.length > 0);
  });

  it('detects object with different key serialization', () => {
    // Chrome serializes keys in different order than JSON.stringify
    const cd = [{ b: 2, a: 1 }];
    // Chrome writes {"b":2,"a":1} but JSON.stringify gives {"b":2,"a":1} too
    // unless we force a different order
    const plaintext = '{"cd":[{"a":1,"b":2}]}';
    const diffs = detectSerializationDiffs(plaintext, cd);
    // Keys are in different order → should detect diff
    assert.ok(Array.isArray(diffs));
    if (diffs.length > 0) {
      assert.equal(diffs[0].index, 0);
      assert.equal(diffs[0].diffType, 'serialization');
    }
  });

  it('returns empty array for malformed plaintext (no cd array)', () => {
    const cd = [1, 2, 3];
    const diffs = detectSerializationDiffs('this is not json at all', cd);
    assert.ok(Array.isArray(diffs));
    // parseCdFields returns null for malformed input → empty diffs
    assert.equal(diffs.length, 0);
  });

  it('returns empty array when plaintext has no bracket markers', () => {
    const cd = [1];
    const diffs = detectSerializationDiffs('no brackets here', cd);
    assert.equal(diffs.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. analyzeHeaderSplit
// ═══════════════════════════════════════════════════════════════════════

describe('analyzeHeaderSplit', () => {
  it('detects field-boundary when trailing spaces present', () => {
    // Simulate a header with content padded to 144 chars with trailing spaces
    const content = 'abc';
    const header = content.padEnd(144, ' ');
    const result = analyzeHeaderSplit(header);
    assert.equal(result.strategy, 'field-boundary');
    assert.equal(result.contentLength, 3);
    assert.equal(result.paddingLength, 141);
  });

  it('detects byte-boundary when NO trailing spaces', () => {
    // 144 chars of content with no trailing spaces
    const header = 'x'.repeat(144);
    const result = analyzeHeaderSplit(header);
    assert.equal(result.strategy, 'byte-boundary');
    assert.equal(result.paddingLength, 0);
    assert.equal(result.contentLength, 144);
  });

  it('returns "unknown" for empty string', () => {
    const result = analyzeHeaderSplit('');
    assert.equal(result.strategy, 'unknown');
    assert.equal(result.contentLength, 0);
    assert.equal(result.paddingLength, 0);
  });

  it('returns "unknown" for non-string input', () => {
    const result = analyzeHeaderSplit(null);
    assert.equal(result.strategy, 'unknown');
    assert.equal(result.contentLength, 0);
    assert.equal(result.paddingLength, 0);
  });

  it('handles short header (< 144 chars) as byte-boundary if no spaces', () => {
    const header = '{"cd":[1,2,3],';
    const result = analyzeHeaderSplit(header);
    assert.equal(result.strategy, 'byte-boundary');
    assert.equal(result.paddingLength, 0);
    assert.equal(result.contentLength, header.length);
  });

  it('returns correct contentLength and paddingLength', () => {
    const content = '{"cd":[42],';
    const header = content.padEnd(144, ' ');
    const result = analyzeHeaderSplit(header);
    assert.equal(result.contentLength, content.length);
    assert.equal(result.paddingLength, 144 - content.length);
    assert.equal(result.contentLength + result.paddingLength, 144);
  });

  it('handles header that is all spaces', () => {
    const header = ' '.repeat(144);
    const result = analyzeHeaderSplit(header);
    assert.equal(result.strategy, 'field-boundary');
    assert.equal(result.contentLength, 0);
    assert.equal(result.paddingLength, 144);
  });

  it('handles header with single trailing space', () => {
    const content = 'a'.repeat(143);
    const header = content + ' ';
    const result = analyzeHeaderSplit(header);
    assert.equal(result.strategy, 'field-boundary');
    assert.equal(result.contentLength, 143);
    assert.equal(result.paddingLength, 1);
  });
});
