// Guards the split of the rich editor: an entry module, parts in static/js/rich-editor/, and an import map
// in base.html that lists every part (the worker adds ?v=<hash> to it).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, richEditorPartNames } from './support/rich-editor-source.js';

const base = readFileSync(join(ROOT, 'templates/layout/base.html'), 'utf-8');
const SPEC = /"(\/static\/js\/rich-editor\/[a-z0-9-]+\.js)"/g;

describe('rich editor layout', () => {
  test('the old single file is an entry module, not the whole editor', () => {
    const entry = readFileSync(join(ROOT, 'static/js/rich-editor.js'), 'utf-8');
    assert.ok(entry.split('\n').length < 200, 'entry stays small');
    assert.match(entry, /window\.RichEditor = RichEditor;/);
    assert.match(base, /<script type="module" src="\/static\/js\/rich-editor\.js"><\/script>/);
    assert.ok(!/^\(function \(\) \{/m.test(entry), 'no IIFE wrapper any more');
  });

  test('the import map lists exactly the part files, and every file exists', () => {
    const map = base.match(/<script type="importmap">([\s\S]*?)<\/script>/);
    assert.ok(map, 'import map present');
    const imports = JSON.parse(map[1]).imports;
    const keys = Object.keys(imports).sort();
    const media = readdirSync(join(ROOT, 'static/js/media-library')).filter((f) => f.endsWith('.js')).map((f) => `/static/js/media-library/${f}`);
    const hh = readdirSync(join(ROOT, 'static/js/header-hero-admin')).filter((f) => f.endsWith('.js')).map((f) => `/static/js/header-hero-admin/${f}`);
    const cs = readdirSync(join(ROOT, 'static/js/component-studio')).filter((f) => f.endsWith('.js')).map((f) => `/static/js/component-studio/${f}`);
    assert.deepEqual(keys, [...richEditorPartNames().map((n) => `/static/js/rich-editor/${n}.js`), ...media, ...hh, ...cs].sort());
    for (const [k, v] of Object.entries(imports)) { assert.equal(k, v); assert.ok(existsSync(join(ROOT, k.slice(1))), k); }
  });

  test('the import map comes before the first module script, inside the admin-only block', () => {
    const i = base.indexOf('<script type="importmap">'), e = base.indexOf('<script type="module"');
    assert.ok(i > 0 && i < e);
    const open = base.lastIndexOf('<!--@full-->', i), close = base.indexOf('<!--@/full-->', i);
    assert.ok(open > 0 && close > e, 'inside @full');
  });

  test('every import in the entry and the parts is an absolute map path to an existing part, with no cycle through the entry', () => {
    const files = ['static/js/rich-editor.js', ...richEditorPartNames().map((n) => `static/js/rich-editor/${n}.js`)];
    const graph = {};
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), 'utf-8');
      const deps = [...src.matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);
      for (const d of deps) {
        assert.match(d, /^\/static\/js\/rich-editor\/[a-z0-9-]+\.js$/, `${f} imports ${d}`);
        assert.ok(existsSync(join(ROOT, d.slice(1))), `${f} imports missing ${d}`);
        assert.ok(!/rich-editor\.js$/.test(d), 'nothing imports the entry');
      }
      graph[f] = deps.map((d) => d.slice(1));
    }
    assert.ok(Object.keys(graph).length === richEditorPartNames().length + 1);
  });

  test('parts do not write to the global scope; only the entry exposes RichEditor', () => {
    for (const n of richEditorPartNames()) {
      const src = readFileSync(join(ROOT, `static/js/rich-editor/${n}.js`), 'utf-8');
      assert.ok(!/window\.RichEditor\s*=/.test(src), `${n} must not expose the API`);
      assert.ok(!/^\s*(?:\(function|var\s+RichEditor)/m.test(src.replace(/export var RichEditor/, '')) || n === 'api');
    }
  });
});
