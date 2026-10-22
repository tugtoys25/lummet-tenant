// Guards the split of worker/header-hero.js (v22.40): the facade keeps the public API, parts stay small, no import cycle.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/header-hero.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/header-hero');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('header-hero layout', () => {
  test('the facade exports the same 27 names as before', () => {
    assert.deepEqual(Object.keys(facade).sort(), ['FIELDS', 'FONT_KEYS', 'FONT_STACKS', 'HEADER_HERO_KEYS', 'HERO_SUBTITLE_DEFAULT', 'MAX_CARDS', 'MAX_SLIDES', 'canonicalVideoUrl', 'cleanCards', 'cleanColor', 'cleanImage', 'cleanLink', 'cleanSlides', 'cleanText', 'defaultHeaderHero', 'embedUrl', 'escapeHtml', 'headerClasses', 'headerHeroDefaultsForAdmin', 'headerHeroTemplateVars', 'heroClasses', 'heroHtml', 'jsonForScript', 'normalizeOne', 'parseHeaderHero', 'parseVideoUrl', 'sanitizeHeaderHeroInput']);
  });
  test('the facade only re-exports from header-hero/', () => {
    const body = readFileSync(join(ROOT, 'worker/header-hero.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    assert.equal(body.length, 3);
    for (const l of body) assert.match(l, /^export \{ [A-Za-z_, ]+ \} from "\.\/header-hero\/[a-z-]+\.js";$/);
  });
  test('three parts, imports resolve, no cycle: schema <- clean <- render', () => {
    assert.deepEqual(parts, ['clean', 'render', 'schema']);
    const deps = { schema: [], clean: ['schema'], render: ['clean', 'schema'] };
    for (const n of parts) {
      const found = [];
      for (const m of read(n).matchAll(/from\s+"(\.[^"]+)"/g)) { assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`); found.push(m[1].slice(2, -3)); }
      assert.deepEqual(found.sort(), deps[n].sort(), n);
    }
  });
  test('each part stays under 300 lines', () => { for (const n of parts) assert.ok(read(n).split('\n').length < 300, n); });
});
