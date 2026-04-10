'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { generateVData, parseVmSlideUrl } = require('../scraper/vdata-generator');

// Cache source reads at module level (jsdom execution is slow)
const jquerySource = fs.readFileSync(path.join(__dirname, '..', 'sample', 'slide-jy.js'), 'utf8');
const vmSlideSource = fs.readFileSync(path.join(__dirname, '..', 'sample', 'vm_slide.js'), 'utf8');

const mockFields = {
  aid: '2090803262',
  protocol: 'https',
  accver: '1',
  showtype: 'popup',
  ua: Buffer.from('Mozilla/5.0 test').toString('base64'),
  noheader: '1',
  fb: '1',
  sess: 'test_session_value',
  sid: 'test_sid_value',
  ans: '100,45;',
  collect: 'test_collect_data_here',
  eks: 'test_eks_value',
  nonce: 'test_nonce_value',
};

// Cache a single call for the basic/property/body suites to avoid repeated slow jsdom runs
let cachedResult = null;
function getCachedResult() {
  if (!cachedResult) {
    cachedResult = generateVData(mockFields, vmSlideSource, jquerySource);
  }
  return cachedResult;
}

describe('generateVData: basic output', () => {
  it('returns an object with vData and serializedBody properties', () => {
    const result = getCachedResult();
    assert.ok(result !== null && typeof result === 'object');
    assert.ok('vData' in result, 'result should have vData property');
    assert.ok('serializedBody' in result, 'result should have serializedBody property');
  });

  it('vData is a string', () => {
    const result = getCachedResult();
    assert.strictEqual(typeof result.vData, 'string');
  });

  it('serializedBody is a string', () => {
    const result = getCachedResult();
    assert.strictEqual(typeof result.serializedBody, 'string');
  });
});

describe('generateVData: vData properties', () => {
  it('vData is exactly 152 chars long', () => {
    const result = getCachedResult();
    assert.strictEqual(result.vData.length, 152, `expected 152 chars, got ${result.vData.length}`);
  });

  it('vData contains only printable ASCII', () => {
    const result = getCachedResult();
    assert.match(result.vData, /^[\x20-\x7e]+$/);
  });

  it('vData is non-empty', () => {
    const result = getCachedResult();
    assert.ok(result.vData.length > 0);
  });
});

describe('generateVData: serialized body', () => {
  it('serializedBody contains & separators', () => {
    const result = getCachedResult();
    assert.ok(result.serializedBody.includes('&'), 'serializedBody should contain & separators');
  });

  it('serializedBody starts with aid=', () => {
    const result = getCachedResult();
    assert.ok(result.serializedBody.startsWith('aid='), `expected to start with aid=, got: ${result.serializedBody.slice(0, 20)}`);
  });

  it('serializedBody contains all field names from mockFields', () => {
    const result = getCachedResult();
    for (const key of Object.keys(mockFields)) {
      assert.ok(result.serializedBody.includes(`${key}=`), `serializedBody should contain field "${key}"`);
    }
  });
});

describe('generateVData: determinism', () => {
  it('same inputs produce same-length vData and identical serializedBody', () => {
    const result1 = generateVData(mockFields, vmSlideSource, jquerySource);
    const result2 = generateVData(mockFields, vmSlideSource, jquerySource);
    // vData includes a timestamp component so exact equality is not expected,
    // but length and serializedBody should be consistent.
    assert.strictEqual(result1.vData.length, result2.vData.length);
    assert.strictEqual(result1.serializedBody, result2.serializedBody);
  });
});

describe('generateVData: different inputs produce different vData', () => {
  it('changing ans field produces different vData', () => {
    const result1 = getCachedResult();
    const altFields = Object.assign({}, mockFields, { ans: '200,45;' });
    const result2 = generateVData(altFields, vmSlideSource, jquerySource);
    assert.notStrictEqual(result1.vData, result2.vData);
  });
});

describe('generateVData: userAgent affects output', () => {
  it('different userAgent produces different vData', () => {
    const result1 = getCachedResult();
    const result2 = generateVData(mockFields, vmSlideSource, jquerySource, {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) CustomAgent/1.0',
    });
    assert.notStrictEqual(result1.vData, result2.vData);
  });
});

describe('parseVmSlideUrl', () => {
  it('extracts relative URL from script tag', () => {
    const html = '<html><head><script src="/td/vm-slide.e201876f.enc.js"></script></head></html>';
    assert.strictEqual(parseVmSlideUrl(html), '/td/vm-slide.e201876f.enc.js');
  });

  it('extracts absolute URL from script tag', () => {
    const html = '<script src="https://t.captcha.qq.com/td/vm-slide.abc123.enc.js"></script>';
    assert.strictEqual(parseVmSlideUrl(html), 'https://t.captcha.qq.com/td/vm-slide.abc123.enc.js');
  });

  it('returns null for HTML without vm-slide script tag', () => {
    const html = '<html><head><script src="/js/main.js"></script></head></html>';
    assert.strictEqual(parseVmSlideUrl(html), null);
  });

  it('returns null for empty string', () => {
    assert.strictEqual(parseVmSlideUrl(''), null);
  });
});
