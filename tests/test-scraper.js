'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const Scraper = require('../scraper/scraper');

describe('Scraper: constructor defaults', () => {
  const s = new Scraper();

  it('default aid is 2046626881', () => {
    assert.strictEqual(s.aid, '2046626881');
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
    maxRetries: 7,
    verbose: true,
  });

  it('custom aid is stored', () => {
    assert.strictEqual(s.aid, '999');
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

describe('Scraper: ans computation formula', () => {
  // Replicates the inline formula from scraper.js solveCaptcha() (lines 355-359)
  function computeAns(rawOffset, spt) {
    const sptVal = spt || '0';
    const xAnswer = rawOffset;
    const yAnswer = Math.floor(parseInt(sptVal, 10)) || 0;
    return `${xAnswer},${yAnswer};`;
  }

  it('matches live successful solve (rawOffset=478, spt="30")', () => {
    assert.strictEqual(computeAns(478, '30'), '478,30;');
  });

  it('X = rawOffset directly, no ratio or calibration', () => {
    assert.strictEqual(computeAns(257, '30'), '257,30;');
    assert.strictEqual(computeAns(467, '30'), '467,30;');
    assert.strictEqual(computeAns(509, '30'), '509,30;');
  });

  it('Y = parseInt(spt) for normal integer strings', () => {
    assert.strictEqual(computeAns(100, '30'), '100,30;');
    assert.strictEqual(computeAns(100, '158'), '100,158;');
    assert.strictEqual(computeAns(100, '0'), '100,0;');
  });

  it('spt empty string falls back to Y=0', () => {
    assert.strictEqual(computeAns(100, ''), '100,0;');
  });

  it('spt undefined falls back to Y=0', () => {
    assert.strictEqual(computeAns(100, undefined), '100,0;');
  });

  it('spt null falls back to Y=0', () => {
    assert.strictEqual(computeAns(100, null), '100,0;');
  });

  it('spt with decimal is floored (Math.floor)', () => {
    assert.strictEqual(computeAns(100, '45.7'), '100,45;');
    assert.strictEqual(computeAns(100, '99.9'), '100,99;');
  });

  it('ans format is "${X},${Y};" with trailing semicolon', () => {
    const ans = computeAns(300, '50');
    assert.ok(ans.endsWith(';'), 'ans must end with semicolon');
    assert.strictEqual(ans.split(',').length, 2, 'ans must have exactly one comma');
    assert.strictEqual(ans, '300,50;');
  });

  it('various rawOffset values used directly without transformation', () => {
    for (const offset of [0, 1, 100, 257, 467, 478, 509, 1000]) {
      const ans = computeAns(offset, '30');
      const x = parseInt(ans.split(',')[0], 10);
      assert.strictEqual(x, offset, `rawOffset ${offset} should appear as-is in ans`);
    }
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
