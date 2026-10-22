// Guards the split of worker/site-settings.js: the facade keeps the public API, parts stay small, imports resolve, no cycles.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/site-settings.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/site-settings');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('site-settings layout', () => {
  test('the facade exports the same public API as before, all functions', () => {
    assert.deepEqual(Object.keys(facade).sort(), ['buildComplianceHtml', 'buildGaScript', 'buildGpwaScript', 'buildGpwaSeal', 'buildHomepageSectionsHtml', 'buildSiteManifest', 'buildThemeCss', 'getSiteSettings']);
    for (const f of Object.values(facade)) assert.equal(typeof f, 'function');
  });

  test('the facade only re-exports; no logic in it', () => {
    const body = readFileSync(join(ROOT, 'worker/site-settings.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    for (const l of body) assert.match(l, /^export \{ [A-Za-z, ]+ \} from "\.\/site-settings\/[a-z-]+\.js";$/);
  });

  test('parts stay under 500 lines and are real modules', () => {
    assert.ok(parts.length >= 9);
    for (const n of parts) { const s = read(n); assert.ok(s.split('\n').length < 500, `${n} too long`); assert.ok(/^(export|import) /m.test(s), n); }
  });

  test('every relative import resolves, and the parts have no import cycle', () => {
    const graph = {};
    for (const n of parts) {
      const deps = [...read(n).matchAll(/from "(\.[^"]+)"/g)].map((m) => m[1]);
      graph[n] = [];
      for (const d of deps) { assert.ok(existsSync(join(DIR, d)), `${n} imports missing ${d}`); if (d.startsWith('./')) graph[n].push(d.slice(2, -3)); }
    }
    const visit = (n, stack) => { assert.ok(!stack.includes(n), `cycle ${[...stack, n].join(' > ')}`); for (const d of graph[n]) visit(d, [...stack, n]); };
    for (const n of parts) visit(n, []);
  });
});
