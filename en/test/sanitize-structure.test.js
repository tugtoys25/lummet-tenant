// Guards the split of worker/sanitize.js (v22.54): the facade keeps the public API, parts stay small,
// no import cycle, and the allow-lists live in one place (the policy), not in the code that applies them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/sanitize.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/sanitize');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('sanitize layout', () => {
  test('the facade exports the same 4 names as before, and nothing internal', () => {
    assert.deepEqual(Object.keys(facade).sort(), ['escapeHtml', 'sanitizeHtml', 'sanitizeStyle', 'sanitizeUrl']);
  });
  test('the facade only re-exports from sanitize/', () => {
    const body = readFileSync(join(ROOT, 'worker/sanitize.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    assert.equal(body.length, 2);
    for (const l of body) assert.match(l, /^export \{ [A-Za-z0-9_, ]+ \} from "\.\/sanitize\/[a-z-]+\.js";$/);
  });
  test('four parts, imports resolve, no cycle: policy <- values <- tags <- pipeline', () => {
    assert.deepEqual(parts, ['pipeline', 'policy', 'tags', 'values']);
    const local = { policy: [], values: ['policy'], tags: ['policy', 'values'], pipeline: ['policy', 'tags'] };
    for (const n of parts) {
      const found = [];
      for (const m of read(n).matchAll(/from\s+"(\.[^"]+)"/g)) {
        assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`);
        found.push(m[1].slice(2, -3));
      }
      assert.deepEqual(found.sort(), local[n].sort(), n);
    }
  });
  test('the allow-lists are defined in policy.js only', () => {
    for (const name of ['ALLOWED_TAGS', 'STRIP_CONTENT_TAGS', 'ALLOWED_ATTRS', 'URL_ATTRS', 'ALLOWED_URL_SCHEMES', 'ALLOWED_IMAGE_SCHEMES', 'DANGEROUS_CSS_PATTERNS']) {
      assert.match(read('policy'), new RegExp(`export const ${name} = `), name);
      for (const n of parts.filter((p) => p !== 'policy')) assert.doesNotMatch(read(n), new RegExp(`const ${name} = `), `${n} redefines ${name}`);
    }
  });
  test('the sanitizer still removes the classic attacks', () => {
    assert.equal(facade.sanitizeHtml('<p onclick="x">a</p><script>alert(1)</script>'), '<p>a</p>');
    assert.equal(facade.sanitizeUrl('java\tscript:alert(1)', false), '');
    assert.doesNotMatch(facade.sanitizeStyle('color:red;background:url(javascript:x)'), /javascript/i);
    assert.doesNotMatch(facade.sanitizeStyle('width:expression(alert(1))'), /expression/i);
    assert.equal(facade.escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });
  test('each part stays under 250 lines', () => { for (const n of parts) assert.ok(read(n).split('\n').length < 250, n); });
});
