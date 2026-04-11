'use strict';

/**
 * Tests for helper functions in scripts/token-isolation-test.js:
 *   - replacePostField(body, fieldName, newValue)
 *   - buildShowUrl(session, aid, userAgent)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  replacePostField,
  buildShowUrl,
  parseArgs,
} = require('../scripts/token-isolation-test');

// ============================================================================
// replacePostField
// ============================================================================

describe('replacePostField', () => {
  it('replaces field at start of body', () => {
    const result = replacePostField('collect=old&foo=bar', 'collect', 'new');
    assert.equal(result, 'collect=new&foo=bar');
  });

  it('replaces field in the middle of body', () => {
    const result = replacePostField('a=1&collect=old&b=2', 'collect', 'new');
    assert.equal(result, 'a=1&collect=new&b=2');
  });

  it('replaces field at end of body', () => {
    const result = replacePostField('a=1&collect=old', 'collect', 'new');
    assert.equal(result, 'a=1&collect=new');
  });

  it('returns body unchanged when field is not found', () => {
    const result = replacePostField('a=1&b=2', 'missing', 'x');
    assert.equal(result, 'a=1&b=2');
  });

  it('replaces with URL-encoded value containing %2B', () => {
    const result = replacePostField('collect=old', 'collect', 'a%2Bb%3Dc');
    assert.equal(result, 'collect=a%2Bb%3Dc');
  });

  it('replaces tlg field with numeric value', () => {
    const result = replacePostField('collect=x&tlg=100&sid=y', 'tlg', '5100');
    assert.equal(result, 'collect=x&tlg=5100&sid=y');
  });

  it('replaces with empty value', () => {
    const result = replacePostField('a=1&collect=old', 'collect', '');
    assert.equal(result, 'a=1&collect=');
  });

  it('matches URL-encoded key via decodeURIComponent', () => {
    const result = replacePostField('a=1&coll%65ct=old', 'collect', 'new');
    assert.equal(result, 'a=1&coll%65ct=new');
  });
});

// ============================================================================
// buildShowUrl
// ============================================================================

describe('buildShowUrl', () => {
  const session = { sess: 'test-sess-123', sid: 'test-sid-456' };
  const aid = '2059295195';
  const userAgent = 'Mozilla/5.0 TestAgent';

  it('returns a URL starting with the expected base', () => {
    const url = buildShowUrl(session, aid, userAgent);
    assert.ok(
      url.startsWith('https://t.captcha.qq.com/cap_union_new_show?'),
      `URL should start with expected base, got: ${url.slice(0, 80)}`
    );
  });

  it('contains the correct aid parameter', () => {
    const url = buildShowUrl(session, aid, userAgent);
    const params = new URL(url).searchParams;
    assert.equal(params.get('aid'), aid);
  });

  it('contains the correct sess parameter', () => {
    const url = buildShowUrl(session, aid, userAgent);
    const params = new URL(url).searchParams;
    assert.equal(params.get('sess'), session.sess);
  });

  it('contains the correct sid parameter', () => {
    const url = buildShowUrl(session, aid, userAgent);
    const params = new URL(url).searchParams;
    assert.equal(params.get('sid'), session.sid);
  });

  it('contains ua as base64-encoded userAgent', () => {
    const url = buildShowUrl(session, aid, userAgent);
    const params = new URL(url).searchParams;
    const expectedUa = Buffer.from(userAgent).toString('base64');
    assert.equal(params.get('ua'), expectedUa);
  });

  it('contains expected static params', () => {
    const url = buildShowUrl(session, aid, userAgent);
    const params = new URL(url).searchParams;
    assert.equal(params.get('protocol'), 'https');
    assert.equal(params.get('accver'), '1');
    assert.equal(params.get('showtype'), 'popup');
    assert.equal(params.get('clientype'), '2');
  });
});
