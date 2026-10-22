// Structure of the Component Studio script (v22.45): entry module + parts, absolute import-map specifiers,
// a guarded entry (no top-level return in a module), one shared state object and no import cycle.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, componentStudioPartNames } from './support/component-studio-source.js';

const base = readFileSync(join(ROOT, 'templates/layout/base.html'), 'utf-8');
const entry = readFileSync(join(ROOT, 'static/js/component-studio.js'), 'utf-8');
const PARTS = ['content', 'context', 'data', 'forms', 'main', 'preview', 'section', 'widgets'];
const part = (n) => readFileSync(join(ROOT, `static/js/component-studio/${n}.js`), 'utf-8');
const imports = JSON.parse(base.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;

describe('component studio split', () => {
  test('has exactly the documented parts', () => assert.deepEqual(componentStudioPartNames(), PARTS));

  test('entry is a module script loaded where the old script was, not an IIFE, with no top-level return', () => {
    assert.match(base, /<script type="module" src="\/static\/js\/component-studio\.js"><\/script>/);
    assert.ok(base.indexOf('link-picker.js') < base.indexOf('/static/js/component-studio.js'));
    assert.ok(!/^\(function \(\) \{/m.test(entry));
    assert.ok(!/^return\b/m.test(entry));
    assert.match(entry, /^if \(form && panel\) initComponentStudio\(\);/m);
  });

  test('every part is in the import map and every import is an absolute mapped path to an existing file', () => {
    for (const n of PARTS) assert.equal(imports[`/static/js/component-studio/${n}.js`], `/static/js/component-studio/${n}.js`);
    for (const f of ['static/js/component-studio.js', ...PARTS.map((n) => `static/js/component-studio/${n}.js`)]) {
      const src = readFileSync(join(ROOT, f), 'utf-8');
      for (const m of src.matchAll(/^import\s[^;]*?"([^"]+)";/gm)) {
        assert.ok(m[1] in imports, `${f} imports ${m[1]}`);
        assert.ok(existsSync(join(ROOT, m[1].slice(1))), m[1]);
      }
    }
  });

  test('no part imports the entry and there is no import cycle', () => {
    const graph = {};
    for (const n of PARTS) {
      assert.doesNotMatch(part(n), /component-studio\.js"/);
      graph[n] = [...part(n).matchAll(/^import\s[^;]*?"\/static\/js\/component-studio\/([a-z]+)\.js";/gm)].map((m) => m[1]);
    }
    assert.deepEqual(graph.context, []);
    const visit = (n, stack) => { assert.ok(!stack.includes(n), `cycle ${[...stack, n].join(' > ')}`); graph[n].forEach((d) => visit(d, [...stack, n])); };
    PARTS.forEach((n) => visit(n, []));
  });

  test('the three big type forms register in builders and main loads them for that side effect', () => {
    for (const [n, key] of [['content', 'content_grid'], ['data', 'data_table'], ['section', 'section']]) assert.match(part(n), new RegExp(`builders\\.${key} = `));
    for (const n of ['content', 'data', 'section']) assert.match(part('main'), new RegExp(`^import "/static/js/component-studio/${n}\\.js";`, 'm'));
  });

  test('state shared between parts lives in one object (st), never in a reassigned import', () => {
    assert.match(part('context'), /^export var st = \{ S: \{\}, busy: false \};/m);
    for (const n of PARTS) assert.doesNotMatch(part(n), /^\s*(S|busy) = /m, `${n} assigns a bare S or busy`);
    assert.match(part('main'), /st\.S = parseObj\(settingsEl\.value\);/);
  });

  test('context reads the form elements with a guard, so a page without the editor does not throw', () => {
    assert.match(part('context'), /export var contentEl = form && form\.querySelector/);
  });

  test('each part stays under 300 lines', () => { for (const n of PARTS) assert.ok(part(n).split('\n').length < 300, n); });
});
