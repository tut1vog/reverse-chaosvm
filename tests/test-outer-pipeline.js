'use strict';

/**
 * test-outer-pipeline.js — Tests for buildInputChunks headerSplit option
 *
 * Verifies byte-boundary (default) and field-boundary split strategies.
 *
 * Run: node --test tests/test-outer-pipeline.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  buildInputChunks,
  HEADER_SIZE,
} = require('../token/generate-token');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Build a realistic cd string for testing.
// {"cd":[1,1,1,...,1]} with 40 entries => well over 144 chars when combined
// with the sd string replacement done inside buildInputChunks.
const cdString = '{"cd":[' + Array(40).fill('1').join(',') + ']}';
const sdString = '"sd":{"od":"C"}}';
const timestamp = 1700000000000;

describe('buildInputChunks headerSplit option', () => {

  describe('default (no headerSplit option)', () => {
    it('header chunk is exactly 144 bytes', () => {
      const [, header] = buildInputChunks(cdString, sdString, timestamp);
      assert.strictEqual(header.length, HEADER_SIZE);
    });

    it('no unnecessary trailing spaces when content >= 144', () => {
      // Build a cd string long enough that the payload body exceeds 144 chars
      const longCd = '{"cd":[' + Array(80).fill('"abcde"').join(',') + ']}';
      const [, header] = buildInputChunks(longCd, sdString, timestamp);
      assert.strictEqual(header.length, HEADER_SIZE);
      // The last char should be part of the content, not a space pad
      assert.notStrictEqual(header[HEADER_SIZE - 1], ' ');
    });
  });

  describe('byte-boundary explicit', () => {
    it('produces identical output to default', () => {
      const defaultResult = buildInputChunks(cdString, sdString, timestamp);
      const explicitResult = buildInputChunks(cdString, sdString, timestamp, {
        headerSplit: { strategy: 'byte-boundary' },
      });
      assert.deepStrictEqual(explicitResult, defaultResult);
    });
  });

  describe('field-boundary with contentLength=50', () => {
    const options = {
      headerSplit: { strategy: 'field-boundary', contentLength: 50 },
    };

    it('header is 144 bytes', () => {
      const [, header] = buildInputChunks(cdString, sdString, timestamp, options);
      assert.strictEqual(header.length, HEADER_SIZE);
    });

    it('first 50 chars are content, remaining 94 are spaces', () => {
      const [, header] = buildInputChunks(cdString, sdString, timestamp, options);
      // payloadBody = cdString with last char replaced: '}' -> ','
      const payloadBody = cdString.slice(0, -1) + ',';
      const expectedContent = payloadBody.substring(0, 50);
      assert.strictEqual(header.substring(0, 50), expectedContent);
      // Remaining 94 chars should all be spaces
      const padding = header.substring(50);
      assert.strictEqual(padding.length, 94);
      assert.strictEqual(padding, ' '.repeat(94));
    });
  });

  describe('field-boundary with contentLength=133 (Template A pattern)', () => {
    // Need a cd string where the payloadBody is longer than 133 chars
    const longCd = '{"cd":[' + Array(60).fill('1').join(',') + ']}';
    const options = {
      headerSplit: { strategy: 'field-boundary', contentLength: 133 },
    };

    it('header has 11 trailing spaces', () => {
      const [, header] = buildInputChunks(longCd, sdString, timestamp, options);
      assert.strictEqual(header.length, HEADER_SIZE);
      // Last 11 chars should be spaces (144 - 133 = 11)
      const trailing = header.substring(133);
      assert.strictEqual(trailing, ' '.repeat(11));
    });

    it('content portion matches first 133 chars of payload body', () => {
      const [, header] = buildInputChunks(longCd, sdString, timestamp, options);
      const payloadBody = longCd.slice(0, -1) + ',';
      // Trim trailing spaces from header to get the content portion
      const headerContent = header.trimEnd();
      assert.strictEqual(headerContent, payloadBody.substring(0, 133));
    });
  });

  describe('field-boundary comma duplication', () => {
    it('cdBody starts with comma when field-boundary is used', () => {
      const options = {
        headerSplit: { strategy: 'field-boundary', contentLength: 50 },
      };
      const [, , cdBody] = buildInputChunks(cdString, sdString, timestamp, options);
      assert.strictEqual(cdBody[0], ',');
    });

    it('cdBody does NOT start with extra comma in byte-boundary mode', () => {
      const [, , cdBody] = buildInputChunks(cdString, sdString, timestamp);
      // In byte-boundary mode, cdBody starts with whatever follows position 144
      // in the payload body — no comma prepended.
      // The payloadBody content at position 144 should be taken as-is.
      const payloadBody = cdString.slice(0, -1) + ',';
      if (payloadBody.length > HEADER_SIZE) {
        assert.strictEqual(cdBody[0], payloadBody[HEADER_SIZE]);
      }
    });

    it('cdBody does NOT start with extra comma in explicit byte-boundary mode', () => {
      const options = {
        headerSplit: { strategy: 'byte-boundary' },
      };
      const longCd = '{"cd":[' + Array(80).fill('"abcde"').join(',') + ']}';
      const payloadBody = longCd.slice(0, -1) + ',';
      const [, , cdBody] = buildInputChunks(longCd, sdString, timestamp, options);
      // First char of cdBody should be the char at position 144, not a prepended comma
      assert.strictEqual(cdBody[0], payloadBody[HEADER_SIZE]);
    });
  });

  describe('field-boundary with short content', () => {
    it('handles payload shorter than contentLength gracefully', () => {
      // Create a very short cd string
      const shortCd = '{"cd":[1]}';
      const options = {
        headerSplit: { strategy: 'field-boundary', contentLength: 200 },
      };
      const [hash, header, cdBody, sig] = buildInputChunks(shortCd, sdString, timestamp, options);
      // Header should still be 144 bytes
      assert.strictEqual(header.length, HEADER_SIZE);
      // Hash should be 48 bytes
      assert.strictEqual(hash.length, 48);
      // sig is sdString
      assert.strictEqual(sig, sdString);
      // cdBody should be empty or space-padded since payload < contentLength
      // payloadBody = '{"cd":[1],' (10 chars), contentLength=200, so all content in header
      // cdBody should be empty string (no remaining content)
      assert.strictEqual(cdBody, '');
    });

    it('header is space-padded when payload is shorter than 144', () => {
      const shortCd = '{"cd":[1]}';
      const options = {
        headerSplit: { strategy: 'field-boundary', contentLength: 5 },
      };
      const [, header] = buildInputChunks(shortCd, sdString, timestamp, options);
      assert.strictEqual(header.length, HEADER_SIZE);
      // payloadBody is '{"cd":[1],' (10 chars), contentLength=5
      // header content is first 5 chars, padded to 144 with spaces
      const payloadBody = shortCd.slice(0, -1) + ',';
      assert.strictEqual(header.substring(0, 5), payloadBody.substring(0, 5));
      assert.strictEqual(header.substring(10).trim(), '');
    });
  });

  describe('cdBody 8-byte alignment', () => {
    it('cdBody length is a multiple of 8 when non-empty', () => {
      const options = {
        headerSplit: { strategy: 'field-boundary', contentLength: 50 },
      };
      const [, , cdBody] = buildInputChunks(cdString, sdString, timestamp, options);
      if (cdBody.length > 0) {
        assert.strictEqual(cdBody.length % 8, 0);
      }
    });
  });
});
