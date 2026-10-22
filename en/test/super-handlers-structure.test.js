// Guards the split of worker/super/handlers.js: the facade keeps every handler the router uses, parts stay small, no import cycle.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/super/handlers.js';
import { readRouterSource } from './support/super-router-source.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/super/handlers');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('super handlers layout', () => {
  test('the facade exports the 123 handlers (only handle* functions, none of the helpers)', () => {
    const names = Object.keys(facade);
    assert.equal(names.length, 123);
    for (const n of names) { assert.match(n, /^handle[A-Z]/); assert.equal(typeof facade[n], 'function'); }
  });

  test('every handler the router uses exists on the facade', () => {
    const router = readRouterSource();
    const used = [...new Set([...router.matchAll(/\bh\.(handle[A-Za-z]+)/g)].map((m) => m[1]))];
    assert.ok(used.length > 100, `router handlers: ${used.length}`);
    assert.deepEqual(used.filter((u) => typeof facade[u] !== 'function'), []);
  });

  test('the facade only re-exports', () => {
    const body = readFileSync(join(ROOT, 'worker/super/handlers.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    for (const l of body) assert.match(l, /^export \{ [A-Za-z, ]+ \} from "\.\/handlers\/[a-z-]+\.js";$/);
  });

  test('parts stay under 300 lines, every import resolves, no cycle', () => {
    assert.ok(parts.length >= 17);
    const graph = {};
    for (const n of parts) {
      const s = read(n); assert.ok(s.split('\n').length < 300, `${n} too long`);
      graph[n] = [];
      for (const m of s.matchAll(/from "(\.[^"]+)"/g)) { assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`); if (m[1].startsWith('./')) graph[n].push(m[1].slice(2, -3)); }
    }
    const visit = (n, stack) => { assert.ok(!stack.includes(n), `cycle ${[...stack, n].join(' > ')}`); graph[n].forEach((d) => visit(d, [...stack, n])); };
    parts.forEach((n) => visit(n, []));
  });
});
