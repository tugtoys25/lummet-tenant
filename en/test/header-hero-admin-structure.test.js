// Structure of the Header & Hero admin script: entry module + parts, no cycle through the entry,
// absolute import-map specifiers, and the guarded entry (no top-level return in a module).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, headerHeroAdminPartNames } from './support/header-hero-admin-source.js';

const base = readFileSync(join(ROOT, 'templates/layout/base.html'), 'utf-8');
const entry = readFileSync(join(ROOT, 'static/js/header-hero-admin.js'), 'utf-8');
const PARTS = ['actions', 'fields', 'preview', 'repeater', 'state', 'validate'];

describe('header-hero-admin split', () => {
  test('has exactly the documented parts', () => assert.deepEqual(headerHeroAdminPartNames(), PARTS));

  test('entry is a module script, not an IIFE, and has no top-level return', () => {
    assert.match(base, /<script type="module" src="\/static\/js\/header-hero-admin\.js"><\/script>/);
    assert.ok(!/^\(function \(\) \{/m.test(entry));
    assert.ok(!/^return\b/m.test(entry));
    assert.match(entry, /^if \(form\) \{/m);
  });

  test('every part is in the import map and every import is an absolute mapped path to an existing file', () => {
    const imports = JSON.parse(base.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
    for (const n of PARTS) assert.equal(imports[`/static/js/header-hero-admin/${n}.js`], `/static/js/header-hero-admin/${n}.js`);
    for (const f of ['static/js/header-hero-admin.js', ...PARTS.map((n) => `static/js/header-hero-admin/${n}.js`)]) {
      const src = readFileSync(join(ROOT, f), 'utf-8');
      for (const m of src.matchAll(/^import\s[^;]*?from\s+"([^"]+)";/gm)) {
        assert.ok(m[1] in imports, `${f} imports ${m[1]}`);
        assert.ok(existsSync(join(ROOT, m[1].slice(1))), m[1]);
      }
    }
  });

  test('no part imports the entry', () => {
    for (const n of PARTS) assert.doesNotMatch(readFileSync(join(ROOT, `static/js/header-hero-admin/${n}.js`), 'utf-8'), /header-hero-admin\.js"/);
  });

  test('state.js reads the defaults inside a try, so a missing element cannot throw', () => {
    const st = readFileSync(join(ROOT, 'static/js/header-hero-admin/state.js'), 'utf-8');
    assert.match(st, /try \{ DEFAULTS = JSON\.parse/);
  });
});
