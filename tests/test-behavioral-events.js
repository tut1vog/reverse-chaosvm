'use strict';

// Black-box tests for generateBehavioralEvents() exported from
// tools/scraper/collect-generator.js.  Validates that the output matches
// the real browser's behavioral event schema (8-element integer tuples,
// correct type sequence, drag-dx sum, deceleration pattern, etc.).

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { generateBehavioralEvents } = require('../tools/scraper/collect-generator.js');

// ---- Helpers ----------------------------------------------------------------

/** Run the generator N times and return all results. */
function sample(n, xAnswer, slideY, timestamp) {
  const results = [];
  for (let i = 0; i < n; i++) {
    results.push(generateBehavioralEvents(xAnswer, slideY, timestamp));
  }
  return results;
}

// ---- Tests ------------------------------------------------------------------

describe('generateBehavioralEvents', () => {

  // 1. Tuple shape
  describe('tuple shape', () => {
    it('every event is an array of exactly 8 numbers', () => {
      const runs = sample(10, 200, 811, 1700000000000);
      for (const events of runs) {
        for (let i = 0; i < events.length; i++) {
          assert.ok(Array.isArray(events[i]), `event[${i}] should be an array`);
          assert.strictEqual(events[i].length, 8, `event[${i}] should have 8 elements`);
          for (let j = 0; j < 8; j++) {
            assert.strictEqual(typeof events[i][j], 'number',
              `event[${i}][${j}] should be a number`);
          }
        }
      }
    });
  });

  // 2. Event count
  describe('event count', () => {
    it('total events is 21 or 22', () => {
      const runs = sample(20, 300, 811, 1700000000000);
      for (const events of runs) {
        assert.ok(events.length === 21 || events.length === 22,
          `expected 21 or 22 events, got ${events.length}`);
      }
    });
  });

  // 3. Type sequence
  describe('type sequence', () => {
    it('first=4, second=1, third=2, middle=all 1s, last=3', () => {
      const runs = sample(10, 400, 811, 1700000000000);
      for (const events of runs) {
        assert.strictEqual(events[0][0], 4, 'first event type should be 4');
        assert.strictEqual(events[1][0], 1, 'second event type should be 1');
        assert.strictEqual(events[2][0], 2, 'third event type should be 2');
        for (let i = 3; i < events.length - 1; i++) {
          assert.strictEqual(events[i][0], 1,
            `middle event[${i}] type should be 1`);
        }
        assert.strictEqual(events[events.length - 1][0], 3,
          'last event type should be 3');
      }
    });
  });

  // 4. Init event (event[0])
  describe('init event (event[0])', () => {
    it('type=4, dx=-1, dy=-1, timestamp=passed-in, fields[4-7]=0', () => {
      const ts = 1700000000000;
      const runs = sample(10, 200, 811, ts);
      for (const events of runs) {
        const e = events[0];
        assert.strictEqual(e[0], 4, 'type');
        assert.strictEqual(e[1], -1, 'dx');
        assert.strictEqual(e[2], -1, 'dy');
        assert.strictEqual(e[3], ts, 'timestamp should equal the passed-in value');
        assert.strictEqual(e[4], 0);
        assert.strictEqual(e[5], 0);
        assert.strictEqual(e[6], 0);
        assert.strictEqual(e[7], 0);
      }
    });
  });

  // 5. Cursor position (event[1])
  describe('cursor position (event[1])', () => {
    it('type=1, dx=159, dy=slideY, timestamp delta 1222-1513, fields[4-7]=0', () => {
      const runs = sample(10, 200, 811, 1700000000000);
      for (const events of runs) {
        const e = events[1];
        assert.strictEqual(e[0], 1, 'type');
        assert.strictEqual(e[1], 159, 'dx');
        assert.strictEqual(e[2], 811, 'dy should be slideY');
        assert.ok(e[3] >= 1222 && e[3] <= 1513,
          `timestamp delta ${e[3]} should be in [1222, 1513]`);
        assert.strictEqual(e[4], 0);
        assert.strictEqual(e[5], 0);
        assert.strictEqual(e[6], 0);
        assert.strictEqual(e[7], 0);
      }
    });
  });

  // 6. Mousedown (event[2])
  describe('mousedown (event[2])', () => {
    it('type=2, dx=0, dy=0, timestamp delta 167-201, fields[4-7]=0', () => {
      const runs = sample(10, 200, 811, 1700000000000);
      for (const events of runs) {
        const e = events[2];
        assert.strictEqual(e[0], 2, 'type');
        assert.strictEqual(e[1], 0, 'dx');
        assert.strictEqual(e[2], 0, 'dy');
        assert.ok(e[3] >= 167 && e[3] <= 201,
          `timestamp delta ${e[3]} should be in [167, 201]`);
        assert.strictEqual(e[4], 0);
        assert.strictEqual(e[5], 0);
        assert.strictEqual(e[6], 0);
        assert.strictEqual(e[7], 0);
      }
    });
  });

  // 7. Drag moves (events[3..N-1])
  describe('drag moves (events[3..N-1])', () => {
    it('all type=1, dx mostly in [-3, xAnswer], dy in [-1, 2], dt in [30, 84], fields[4-7]=0', () => {
      const runs = sample(10, 200, 811, 1700000000000);
      for (const events of runs) {
        for (let i = 3; i < events.length - 1; i++) {
          const e = events[i];
          assert.strictEqual(e[0], 1, `event[${i}] type`);
          // Individual dx can be slightly outside [-3, xAnswer] due to
          // rounding jitter and the last-event remainder correction.
          // The important invariant is the dx sum (tested separately).
          assert.ok(e[1] >= -10 && e[1] <= 250,
            `event[${i}] dx ${e[1]} should be in reasonable range [-10, 250]`);
          assert.ok(e[2] >= -1 && e[2] <= 2,
            `event[${i}] dy ${e[2]} should be in [-1, 2]`);
          assert.ok(e[3] >= 30 && e[3] <= 84,
            `event[${i}] dt ${e[3]} should be in [30, 84]`);
          assert.strictEqual(e[4], 0);
          assert.strictEqual(e[5], 0);
          assert.strictEqual(e[6], 0);
          assert.strictEqual(e[7], 0);
        }
      }
    });
  });

  // 8. Drag dx sum
  describe('drag dx sum', () => {
    it('sum of dx from drag events (events[3..N-1]) equals xAnswer exactly', () => {
      const runs = sample(15, 200, 811, 1700000000000);
      for (const events of runs) {
        let dxSum = 0;
        for (let i = 3; i < events.length - 1; i++) {
          dxSum += events[i][1];
        }
        assert.strictEqual(dxSum, 200,
          `drag dx sum ${dxSum} should equal xAnswer 200`);
      }
    });
  });

  // 9. Mouseup (last event)
  describe('mouseup (last event)', () => {
    it('type=3, dx in [-2,1], dy in [0,1], dt in [141-153], fields[4-7]=0', () => {
      const runs = sample(10, 200, 811, 1700000000000);
      for (const events of runs) {
        const e = events[events.length - 1];
        assert.strictEqual(e[0], 3, 'type');
        assert.ok(e[1] >= -2 && e[1] <= 1,
          `dx ${e[1]} should be in [-2, 1]`);
        assert.ok(e[2] >= 0 && e[2] <= 1,
          `dy ${e[2]} should be in [0, 1]`);
        assert.ok(e[3] >= 141 && e[3] <= 153,
          `dt ${e[3]} should be in [141, 153]`);
        assert.strictEqual(e[4], 0);
        assert.strictEqual(e[5], 0);
        assert.strictEqual(e[6], 0);
        assert.strictEqual(e[7], 0);
      }
    });
  });

  // 10. Different xAnswer values
  describe('different xAnswer values', () => {
    for (const xAnswer of [100, 500, 900]) {
      it(`xAnswer=${xAnswer} produces correct dx sum`, () => {
        const runs = sample(10, xAnswer, 811, 1700000000000);
        for (const events of runs) {
          let dxSum = 0;
          for (let i = 3; i < events.length - 1; i++) {
            dxSum += events[i][1];
          }
          assert.strictEqual(dxSum, xAnswer,
            `drag dx sum ${dxSum} should equal xAnswer ${xAnswer}`);
        }
      });
    }
  });

  // 11. slideY parameter
  describe('slideY parameter', () => {
    it('when slideY=500, event[1].dy=500', () => {
      const events = generateBehavioralEvents(200, 500, 1700000000000);
      assert.strictEqual(events[1][2], 500);
    });

    it('when slideY=0, event[1].dy=811 (falsy default)', () => {
      const events = generateBehavioralEvents(200, 0, 1700000000000);
      assert.strictEqual(events[1][2], 811);
    });

    it('when slideY=undefined, event[1].dy=811 (falsy default)', () => {
      const events = generateBehavioralEvents(200, undefined, 1700000000000);
      assert.strictEqual(events[1][2], 811);
    });
  });

  // 12. Deceleration pattern
  describe('deceleration pattern', () => {
    it('first half average dx > second half average dx over multiple runs', () => {
      const runs = sample(20, 400, 811, 1700000000000);
      let firstHalfWins = 0;
      for (const events of runs) {
        const drags = [];
        for (let i = 3; i < events.length - 1; i++) {
          drags.push(events[i][1]);
        }
        const mid = Math.floor(drags.length / 2);
        const firstHalfAvg = drags.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
        const secondHalfAvg = drags.slice(mid).reduce((a, b) => a + b, 0) / (drags.length - mid);
        if (firstHalfAvg > secondHalfAvg) {
          firstHalfWins++;
        }
      }
      // The deceleration pattern should hold in the majority of runs
      assert.ok(firstHalfWins >= 14,
        `first half avg > second half avg in ${firstHalfWins}/20 runs (expected >= 14)`);
    });
  });

});
