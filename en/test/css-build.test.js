// The big stylesheets are generated from css-src/<name>/NN-*.css by scripts/build-css.mjs (v22.29).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BUNDLES, buildBundle, partsOf } from '../scripts/build-css.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// Net { } depth of a CSS text, ignoring comments.
function netDepth(css) {
  let d = 0; let c = false;
  for (let i = 0; i < css.length; i++) {
    const a = css[i]; const b = css[i + 1];
    if (c) { if (a === '*' && b === '/') { c = false; i++; } } else if (a === '/' && b === '*') { c = true; i++; } else if (a === '{') d++; else if (a === '}') d--;
  }
  return d;
}

describe('stylesheet build', () => {
  test('the five bundles have source folders and nothing else is in css-src', () => {
    assert.deepEqual(BUNDLES, ['main', 'dashboard', 'supportive', 'header-hero', 'responsive']);
    const dirs = readdirSync(join(ROOT, 'css-src'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    assert.deepEqual(dirs, [...BUNDLES].sort());
  });
  for (const name of BUNDLES) {
    test(`static/css/${name}.css is exactly the concatenation of its parts`, () => {
      assert.equal(read(`static/css/${name}.css`), buildBundle(name), `run: node scripts/build-css.mjs`);
    });
    test(`${name}: parts are numbered 01.. without gaps, small, and end with a newline`, () => {
      const parts = partsOf(name);
      assert.ok(parts.length >= 3);
      parts.forEach((f, i) => assert.equal(f.slice(0, 2), String(i + 1).padStart(2, '0'), `${f} breaks the numbering`));
      assert.deepEqual(readdirSync(join(ROOT, 'css-src', name)).filter((f) => !parts.includes(f)), [], 'file with a bad name in css-src');
      for (const f of parts) {
        const s = read(`css-src/${name}/${f}`);
        assert.ok(s.trim().length > 0, `${f} empty`);
        assert.ok(s.endsWith('\n'), `${f} must end with a newline`);
        assert.ok(s.split('\n').length <= 320, `${f} is over 320 lines`);
      }
    });
    test(`${name}: every part and the whole file are brace-balanced (an unclosed block would swallow the rest of the sheet)`, () => {
      for (const f of partsOf(name)) assert.equal(netDepth(read(`css-src/${name}/${f}`)), 0, `${name}/${f}`);
      assert.equal(netDepth(read(`static/css/${name}.css`)), 0);
    });
  }
  test('the build script --check passes and the asset version is current', () => {
    for (const script of ['build-css.mjs', 'asset-version.mjs']) {
      const r = spawnSync(process.execPath, [join(ROOT, 'scripts', script), '--check'], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
    }
  });
});
