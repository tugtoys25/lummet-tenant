// Guards the split of worker/controllers/research.js (v22.44): the facade keeps the public API, parts stay small, no import cycle.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/controllers/research.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/controllers/research');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('research controller layout', () => {
  test('the facade exports the same four names as before', () => {
    assert.deepEqual(Object.keys(facade).sort(), ['renderResearchHub', 'renderResearchItem', 'renderResearchTypeList', 'renderSiteSearch']);
  });
  test('the facade only re-exports from research/', () => {
    const body = readFileSync(join(ROOT, 'worker/controllers/research.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    assert.equal(body.length, 1);
    assert.match(body[0], /^export \{ [A-Za-z_, ]+ \} from "\.\/research\/[a-z-]+\.js";$/);
  });
  test('three parts, imports resolve, no cycle: sections <- directory <- pages', () => {
    assert.deepEqual(parts, ['directory', 'pages', 'sections']);
    const local = { sections: [], directory: ['sections'], pages: ['directory', 'sections'] };
    for (const n of parts) {
      const found = [];
      for (const m of read(n).matchAll(/from\s+"(\.[^"]+)"/g)) {
        assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`);
        if (m[1].startsWith('./')) found.push(m[1].slice(2, -3));
      }
      assert.deepEqual(found.sort(), local[n].sort(), n);
    }
  });
  test('each part stays under 340 lines', () => { for (const n of parts) assert.ok(read(n).split('\n').length < 340, n); });
  test('the source helper reads the parts (controllers/research/*.js)', async () => {
    const { controllerFiles } = await import('./support/controllers-source.js');
    for (const n of parts) assert.ok(controllerFiles().includes(`worker/controllers/research/${n}.js`), n);
  });
});
