// Guards the split of worker/component-studio.js (v22.46): the facade keeps the public API, parts stay small, no import cycle.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/component-studio.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/component-studio');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('component studio (server) layout', () => {
  test('the facade exports the same 21 names as before', () => {
    assert.deepEqual(Object.keys(facade).sort(), ['GRID_DEFAULTS', 'MAX_BLOCKS', 'MAX_GRID_ITEMS', 'MAX_TABLE_COLS', 'MAX_TABLE_ROWS', 'SECTION_DEFAULTS', 'STUDIO_TYPES', 'TABLE_CASINO_COLUMNS', 'TABLE_DEFAULTS', 'cleanGridSettings', 'cleanLegacySettingsJson', 'cleanPicks', 'cleanRichText', 'cleanSectionSettings', 'cleanStudioSettingsJson', 'cleanTableSettings', 'isStudioType', 'renderContentGrid', 'renderDataTable', 'renderSection', 'renderStudioComponent']);
  });
  test('the facade only re-exports from component-studio/', () => {
    const body = readFileSync(join(ROOT, 'worker/component-studio.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    assert.equal(body.length, 5);
    for (const l of body) assert.match(l, /^export \{ [A-Za-z_, ]+ \} from "\.\/component-studio\/[a-z-]+\.js";$/);
  });
  test('five parts, imports resolve, no cycle: shared <- grid <- table, shared <- section, dispatch uses all', () => {
    assert.deepEqual(parts, ['dispatch', 'grid', 'section', 'shared', 'table']);
    const local = { shared: [], grid: ['shared'], table: ['grid', 'shared'], section: ['shared'], dispatch: ['grid', 'section', 'shared', 'table'] };
    for (const n of parts) {
      const found = [];
      for (const m of read(n).matchAll(/from\s+"(\.[^"]+)"/g)) {
        if (m[1].startsWith('./')) { assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`); found.push(m[1].slice(2, -3)); }
        else assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`);
      }
      assert.deepEqual(found.sort(), local[n].sort(), n);
    }
  });
  test('each part stays under 250 lines', () => { for (const n of parts) assert.ok(read(n).split('\n').length < 250, n); });
});
