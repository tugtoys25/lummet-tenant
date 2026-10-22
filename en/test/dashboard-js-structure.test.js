// Guards the split of the dashboard script: the files, their load order, and that together
// they still define what the dashboard pages call.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dashboardScriptNames } from './support/dashboard-js-source.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');

// The order is the order the code had in the single file. Listeners and top-level
// declarations depend on it, so changing it needs a reason.
const ORDER = ['init', 'generic-review-edit', 'content-landing-pages', 'list-pager', 'stats', 'casinos', 'content-items',
  'content-item-form-parts', 'custom-types', 'comparisons', 'edit-forms', 'content-type-settings', 'generic-reviews'];

describe('dashboard script layout', () => {
  test('the old single file is gone and base.html loads the parts in the fixed order', () => {
    assert.ok(!existsSync(join(ROOT, 'static/js/dashboard.js')));
    assert.ok(!read('templates/layout/base.html').includes('/static/js/dashboard.js'));
    assert.deepEqual(dashboardScriptNames(), ORDER);
  });

  test('every file in static/js/dashboard/ is loaded, and every loaded file exists', () => {
    const onDisk = readdirSync(join(ROOT, 'static/js/dashboard')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
    assert.deepEqual([...ORDER].sort(), onDisk);
  });

  test('the parts load before the admin parts, inside the admin-only block', () => {
    const base = read('templates/layout/base.html');
    const first = base.indexOf('/static/js/dashboard/init.js');
    const last = base.indexOf('/static/js/dashboard/generic-reviews.js');
    assert.ok(base.indexOf('/static/js/media-picker.js') < first);
    assert.ok(last < base.indexOf('/static/js/admin/init.js'));
    const open = base.lastIndexOf('<!--@full-->', first);
    assert.ok(open > -1 && base.indexOf('<!--@/full-->', open) > last, 'inside a @full block');
  });

  test('parts are plain scripts (no import/export) that stay under 600 lines', () => {
    for (const n of ORDER) {
      const text = read(`static/js/dashboard/${n}.js`);
      assert.ok(!/^\s*(import|export)\s/m.test(text), n);
      assert.ok(text.split('\n').length <= 600, `${n}: ${text.split('\n').length} lines`);
      new vm.Script(text, { filename: `${n}.js` });
    }
  });

  test('loaded one after the other like the browser does, they define the same functions and listeners', () => {
    const listeners = [];
    const noop = () => null;
    const document = { addEventListener: (type, fn) => listeners.push({ target: 'document', type, fn }), getElementById: noop, querySelector: noop, querySelectorAll: () => [] };
    const window = { addEventListener: (type, fn) => listeners.push({ target: 'window', type, fn }) };
    const ctx = vm.createContext({ document, window, console, fetch: noop, setTimeout, clearTimeout, navigator: {}, location: { href: 'https://x.test/en/dashboard', search: '' }, localStorage: {} });
    for (const n of ORDER) vm.runInContext(read(`static/js/dashboard/${n}.js`), ctx, { filename: `${n}.js` });
    const defined = vm.runInContext('typeof loadStats + typeof initCasinoForm + typeof initComparisonForm + typeof initGenericReviewForm + typeof PAGE_STATE', ctx);
    assert.equal(defined, 'function'.repeat(4) + 'object');
    assert.equal(listeners.length, 5, 'listeners registered by the dashboard script');
    const all = ORDER.map((n) => read(`static/js/dashboard/${n}.js`)).join('');
    assert.equal((all.match(/^(?:async\s+)?function\s+\w+/gm) || []).length, 52, 'top-level functions in the original single file');
  });
});
