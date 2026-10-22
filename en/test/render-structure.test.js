// Guards the split of worker/render.js: Renderer keeps the same 25 methods (installed from mixin files,
// not enumerable like class methods), the exports are unchanged, and every import resolves.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mod from '../worker/render.js';
import { installMethods } from '../worker/render/install-methods.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/render');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();

describe('render layout', () => {
  test('the module exports are unchanged', () => {
    assert.deepEqual(Object.keys(mod).sort(), ['Renderer', 'expandIncludes', 'needsAdminAssets', 'selectAssetSet']);
  });

  test('Renderer has the same 25 members as before, none enumerable, and every method keeps working through this', () => {
    const names = Object.getOwnPropertyNames(mod.Renderer.prototype).sort();
    assert.equal(names.length, 25);
    for (const n of ['constructor', 'render', 'loadTemplate', 'replaceVariables', 'loadNavData', 'buildSEO', 'escapeHtml', 'injectComponents', 'loadActiveBanners']) assert.ok(names.includes(n), n);
    for (const n of names) assert.equal(Object.getOwnPropertyDescriptor(mod.Renderer.prototype, n).enumerable, false, n);
    const r = new mod.Renderer({}, null);
    assert.equal(r.escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
    assert.deepEqual(Object.keys(r).sort(), ['country', 'env', 'request', 'siteContext', 'templateCache']);
  });

  test('installMethods copies like a class body and refuses a method defined twice', () => {
    class A { one() { return 1; } }
    installMethods(A, { two() { return this.one() + 1; } });
    assert.equal(new A().two(), 2);
    assert.equal(Object.getOwnPropertyDescriptor(A.prototype, 'two').enumerable, false);
    assert.throws(() => installMethods(A, { one() {} }), /defined twice: one/);
  });

  test('the parts stay under 300 lines and every static and dynamic import resolves', () => {
    assert.deepEqual(parts, ['assets', 'components', 'install-methods', 'navigation', 'seo', 'variables']);
    for (const n of parts) {
      const s = readFileSync(join(DIR, `${n}.js`), 'utf-8');
      assert.ok(s.split('\n').length < 300, `${n} too long`);
      for (const m of s.matchAll(/(?:from\s+|import\(\s*)["'](\.[^"']+)["']/g)) assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`);
    }
  });
});
