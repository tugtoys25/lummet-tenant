// Guards the split of worker/controllers/news.js (v22.38): the facade keeps the public API, parts stay small, no import cycle.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/controllers/news.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/controllers/news');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('news controller layout', () => {
  test('the facade exports the same three names as before', () => {
    assert.deepEqual(Object.keys(facade).sort(), ['renderNews', 'renderNewsList', 'renderNewsTaxonomyPage']);
  });
  test('the facade only re-exports from news/', () => {
    const body = readFileSync(join(ROOT, 'worker/controllers/news.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    assert.equal(body.length, 3);
    for (const l of body) assert.match(l, /^export \{ [A-Za-z_, ]+ \} from "\.\/news\/[a-z-]+\.js";$/);
  });
  test('the three parts exist, imports resolve, no cycle, and article and list only depend on landing', () => {
    assert.deepEqual(parts, ['article', 'landing', 'list']);
    const graph = {};
    for (const n of parts) {
      graph[n] = [];
      for (const m of read(n).matchAll(/from\s+"(\.[^"]+)"/g)) {
        assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`);
        if (m[1].startsWith('./')) graph[n].push(m[1].slice(2, -3));
      }
    }
    assert.deepEqual(graph.landing, []);
    const visit = (n, stack) => { assert.ok(!stack.includes(n), `cycle ${[...stack, n].join(' > ')}`); graph[n].forEach((d) => visit(d, [...stack, n])); };
    parts.forEach((n) => visit(n, []));
  });
  test('the source helper reads the parts (controllers/news/*.js)', async () => {
    const { controllerFiles } = await import('./support/controllers-source.js');
    for (const n of parts) assert.ok(controllerFiles().includes(`worker/controllers/news/${n}.js`), n);
  });
});
