'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const Scraper = require('../scraper/scraper');

describe('Scraper: constructor defaults', () => {
  const s = new Scraper();

  it('default aid is 2046626881', () => {
    assert.strictEqual(s.aid, '2046626881');
  });

  it('default slideRatio is 0.5', () => {
    assert.strictEqual(s.slideRatio, 0.5);
  });

  it('default calibration is -25', () => {
    assert.strictEqual(s.calibration, -25);
  });

  it('default slideY is 45', () => {
    assert.strictEqual(s.slideY, 45);
  });

  it('default maxRetries is 3', () => {
    assert.strictEqual(s.maxRetries, 3);
  });

  it('default verbose is false', () => {
    assert.strictEqual(s.verbose, false);
  });

  it('profile is null before init', () => {
    assert.strictEqual(s.profile, null);
  });
});

describe('Scraper: constructor overrides', () => {
  const s = new Scraper({
    aid: '999',
    slideRatio: 1.0,
    calibration: -10,
    slideY: 99,
    maxRetries: 7,
    verbose: true,
  });

  it('custom aid is stored', () => {
    assert.strictEqual(s.aid, '999');
  });

  it('custom slideRatio is stored', () => {
    assert.strictEqual(s.slideRatio, 1.0);
  });

  it('custom calibration is stored', () => {
    assert.strictEqual(s.calibration, -10);
  });

  it('custom slideY is stored', () => {
    assert.strictEqual(s.slideY, 99);
  });

  it('custom maxRetries is stored', () => {
    assert.strictEqual(s.maxRetries, 7);
  });

  it('custom verbose is stored', () => {
    assert.strictEqual(s.verbose, true);
  });
});

describe('Scraper: init()', () => {
  it('after init(), template cache is loaded (lookup known template returns non-null)', async () => {
    const s = new Scraper();
    await s.init();
    // The template cache should be loaded; _templateCache should be non-null
    assert.ok(s._templateCache !== null, 'template cache should be loaded');
  });

  it('after init(), profile is loaded (non-null object)', async () => {
    const s = new Scraper();
    await s.init();
    assert.ok(s.profile !== null, 'profile should be loaded');
    assert.strictEqual(typeof s.profile, 'object');
  });

  it('after init(), jQuery source is loaded (non-null string, length > 1000)', async () => {
    const s = new Scraper();
    await s.init();
    assert.ok(typeof s._jquerySource === 'string', 'jQuery source should be a string');
    assert.ok(s._jquerySource.length > 1000, 'jQuery source should be > 1000 chars');
  });

  it('after init(), vm-slide fallback is loaded (non-null string, length > 1000)', async () => {
    const s = new Scraper();
    await s.init();
    assert.ok(typeof s._vmSlideSource === 'string', 'vm-slide source should be a string');
    assert.ok(s._vmSlideSource.length > 1000, 'vm-slide source should be > 1000 chars');
  });
});

describe('Scraper: _buildPostFields', () => {
  const s = new Scraper({ aid: '12345' });

  const mockClient = { _showSubsid: '10' };
  const mockSession = { sess: 'test_sess', sid: 'test_sid' };
  const mockSig = {
    sess: 'sig_sess',
    vsig: 'v',
    websig: 'w',
    nonce: 'n123',
    subcapclass: 'sc',
    showSubsid: '10',
  };
  const ans = '50,45;';
  const collectVal = 'encoded_collect_value';
  const eks = 'eks_token_value';

  const fields = s._buildPostFields(mockClient, mockSession, mockSig, ans, collectVal, eks);

  const expectedKeys = [
    'aid', 'protocol', 'accver', 'showtype', 'ua', 'noheader', 'fb',
    'aged', 'enableAged', 'enableDarkMode', 'grayscale', 'dyeid',
    'clientype', 'sess', 'fwidth', 'sid', 'wxLang', 'tcScale', 'uid',
    'cap_cd', 'rnd', 'prehandleLoadTime', 'createIframeStart', 'global',
    'subsid', 'cdata', 'ans', 'vsig', 'websig', 'subcapclass',
    'pow_answer', 'pow_calc_time', 'collect', 'tlg', 'fpinfo', 'eks',
    'nonce', 'vlg',
  ];

  it('returns object with expected keys', () => {
    for (const key of expectedKeys) {
      assert.ok(key in fields, `missing key: ${key}`);
    }
  });

  it('total key count is 38', () => {
    assert.strictEqual(Object.keys(fields).length, 38);
  });

  it('ans field matches input', () => {
    assert.strictEqual(fields.ans, ans);
  });

  it('collect field matches input', () => {
    assert.strictEqual(fields.collect, collectVal);
  });

  it('eks field matches input', () => {
    assert.strictEqual(fields.eks, eks);
  });

  it('nonce field matches input from sig', () => {
    assert.strictEqual(fields.nonce, 'n123');
  });

  it('aid matches scraper aid', () => {
    assert.strictEqual(fields.aid, '12345');
  });
});

describe('Scraper: methods exist', () => {
  const s = new Scraper();

  it('solveCaptcha is a function', () => {
    assert.strictEqual(typeof s.solveCaptcha, 'function');
  });

  it('queryUrlSec is a function', () => {
    assert.strictEqual(typeof s.queryUrlSec, 'function');
  });

  it('solve is a function', () => {
    assert.strictEqual(typeof s.solve, 'function');
  });

  it('init is a function', () => {
    assert.strictEqual(typeof s.init, 'function');
  });
});

describe('CLI: module loads without executing', () => {
  it('require does not throw', () => {
    assert.doesNotThrow(() => {
      require('../scraper/cli');
    });
  });
});
