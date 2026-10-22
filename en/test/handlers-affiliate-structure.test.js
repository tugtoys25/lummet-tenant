// Guards the split of worker/super/handlers-affiliate.js (v22.55): the facade keeps the 40 handler names the router
// uses, parts stay small, no import cycle, and the response helpers sit in one place.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/super/handlers-affiliate.js';
import { readRouterSource } from './support/super-router-source.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/super/handlers-affiliate');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('super handlers-affiliate layout', () => {
  test('the facade exports the 40 handlers, all named handle..., and nothing internal', () => {
    const names = Object.keys(facade);
    assert.equal(names.length, 40);
    for (const n of names) assert.match(n, /^handle(List|Get|Create|Update|Delete|Rotate|Archive)[A-Za-z]+$/);
    for (const n of ['json', 'ok', 'created', 'fail', 'readJsonBody', 'validateRequired']) assert.ok(!names.includes(n), n);
  });
  test('every handler the router calls exists', () => {
    const router = readRouterSource();
    const used = new Set([...router.matchAll(/\bah\.(handle[A-Za-z]+)/g)].map((m) => m[1]));
    assert.ok(used.size >= 30);
    for (const n of used) assert.equal(typeof facade[n], 'function', n);
  });
  test('the facade only re-exports from handlers-affiliate/', () => {
    const body = readFileSync(join(ROOT, 'worker/super/handlers-affiliate.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    assert.equal(body.length, 3);
    for (const l of body) assert.match(l, /^export \{ [A-Za-z0-9_, ]+ \} from "\.\/handlers-affiliate\/[a-z-]+\.js";$/);
  });
  test('four parts, imports resolve; the three handler parts only import shared', () => {
    assert.deepEqual(parts, ['commercial', 'integrations', 'partners', 'shared']);
    for (const n of parts) {
      for (const m of read(n).matchAll(/from\s+"(\.[^"]+)"/g)) {
        assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`);
        if (m[1].startsWith('./')) assert.equal(m[1], './shared.js', `${n} imports a sibling part`);
      }
    }
    assert.doesNotMatch(read('shared'), /from\s+"\.\//);
  });
  test('the response helpers are defined in shared.js only', () => {
    for (const fn of ['json', 'ok', 'created', 'fail', 'readJsonBody', 'validateRequired']) {
      assert.match(read('shared'), new RegExp(`function ${fn}\\(`), fn);
      for (const n of parts.filter((p) => p !== 'shared')) assert.doesNotMatch(read(n), new RegExp(`function ${fn}\\(`), `${n} redefines ${fn}`);
    }
  });
  test('each part stays under 250 lines', () => { for (const n of parts) assert.ok(read(n).split('\n').length < 250, n); });
});
