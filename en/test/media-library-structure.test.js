// Guards the split of the media library: an entry module, parts in static/js/media-library/, listed in the shared import map.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'static/js/media-library');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();

describe('media library layout', () => {
  test('the entry only exposes window.MediaLibrary; it is loaded as a module, on every admin page and on the media page', () => {
    const entry = read('static/js/media-library.js');
    assert.ok(entry.split('\n').length < 80);
    assert.match(entry, /window\.MediaLibrary = \{\s*init: init,\s*loadMedia: loadMedia,\s*loadFolders: loadFolders,?\s*\};/);
    assert.ok(!/^\(function \(\) \{/m.test(entry));
    assert.match(read('templates/layout/base.html'), /<script type="module" src="\/static\/js\/media-library\.js"><\/script>/);
    const media = read('templates/pages/admin/media.html');
    assert.match(media, /<script type="module" src="\/static\/js\/media-library\.js"><\/script>/);
    assert.ok(!/<script src="\/static\/js\/media-library\.js">/.test(media), 'not as a classic script (it has imports)');
  });

  test('the parts are listed in the import map, and parts never expose globals', () => {
    const map = JSON.parse(read('templates/layout/base.html').match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
    for (const n of parts) assert.ok(`/static/js/media-library/${n}.js` in map, `${n} in the import map`);
    assert.deepEqual(parts, ['actions', 'config', 'events', 'modals', 'utils', 'views']);
    for (const n of parts) { const s = read(`static/js/media-library/${n}.js`); assert.ok(!/window\.MediaLibrary\s*=/.test(s), n); assert.ok(s.split('\n').length < 400, `${n} too long`); }
  });

  test('every import resolves; config and utils import nothing from the UI parts', () => {
    for (const n of [...parts, '../media-library']) {
      const f = n === '../media-library' ? 'static/js/media-library.js' : `static/js/media-library/${n}.js`;
      for (const m of read(f).matchAll(/from "([^"]+)"/g)) { assert.match(m[1], /^\/static\/js\/media-library\/[a-z-]+\.js$/); assert.ok(existsSync(join(ROOT, m[1].slice(1))), `${f}: ${m[1]}`); }
    }
    for (const n of ['config', 'utils']) assert.ok(!/from "\/static\/js\/media-library\/(actions|views|modals|events)\.js"/.test(read(`static/js/media-library/${n}.js`)), n);
  });
});
