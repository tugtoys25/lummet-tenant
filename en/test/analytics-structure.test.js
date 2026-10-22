// Guards the split of worker/database/analytics.js (v22.50): the facade keeps the public API, parts stay small,
// no import cycle, and the privacy rule (scope first, aggregate second) stays in one place.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/database/analytics.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/database/analytics');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('analytics layout', () => {
  test('the facade exports the same 12 names as before, and nothing internal', () => {
    assert.deepEqual(Object.keys(facade).sort(), ['aggregateAnalyticsDaily', 'backfillAnalyticsDaily', 'computeKpis', 'eventCapture', 'getClickAttribution', 'getDimensionPerformance', 'getGeoPerformance', 'getScopedDimensionCondition', 'getTimeSeries', 'logEvent', 'recordConversion', 'safeDivide']);
  });
  test('the facade only re-exports from analytics/', () => {
    const body = readFileSync(join(ROOT, 'worker/database/analytics.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    assert.equal(body.length, 4);
    for (const l of body) assert.match(l, /^export \{ [A-Za-z_, ]+ \} from "\.\/analytics\/[a-z-]+\.js";$/);
  });
  test('four parts; imports resolve; they import nothing from each other', () => {
    assert.deepEqual(parts, ['aggregation', 'conversions', 'events', 'metrics']);
    for (const n of parts) {
      for (const m of read(n).matchAll(/from\s+'(\.[^']+)'/g)) {
        assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`);
        assert.ok(m[1].startsWith('../'), `${n} imports a sibling part: ${m[1]}`);
      }
    }
  });
  test('only metrics reads item-access, and every scoped query goes through the scope condition', () => {
    for (const n of parts) assert.equal(/item-access/.test(read(n)), n === 'metrics', n);
    const m = read('metrics');
    assert.equal((m.match(/await getScopedDimensionCondition\(/g) || []).length, 2);
    assert.match(m, /getAccessibleIdCondition\(/);
  });
  test('the event types and the 92-day backfill cap sit in one place each', () => {
    assert.match(read('events'), /VALID_EVENT_TYPES/);
    assert.match(read('aggregation'), /days\.length > 92/);
    for (const n of ['metrics', 'conversions']) assert.doesNotMatch(read(n), /VALID_EVENT_TYPES|days\.length > 92/);
  });
  test('each part stays under 250 lines', () => { for (const n of parts) assert.ok(read(n).split('\n').length < 250, n); });
});
