// Guards the layout of the page controllers: worker/controllers.js is a re-export file,
// the code lives in worker/controllers/, and nothing depends back on the re-export file.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as controllers from '../worker/controllers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const modules = readdirSync(join(ROOT, 'worker/controllers')).filter((f) => f.endsWith('.js')).sort();

describe('controllers layout', () => {
  test('controllers.js only re-exports', () => {
    const src = read('worker/controllers.js');
    const code = src.replace(/\/\/[^\n]*/g, '');
    assert.ok(!/\bfunction\b|\bconst\b|\blet\b|\bimport\b/.test(code), 'no code in the re-export file');
    for (const m of src.matchAll(/from "\.\/controllers\/([a-z0-9-]+)\.js"/g)) assert.ok(existsSync(join(ROOT, `worker/controllers/${m[1]}.js`)), m[1]);
  });

  test('the public surface is what the router and the other modules import', () => {
    const names = Object.keys(controllers);
    assert.ok(names.length >= 117, `${names.length} exports`);
    for (const n of ['renderHome', 'renderCasino', 'renderReview', 'renderNews', 'renderLogin', 'render404', 'robots', 'handleAffiliateRedirect', 'dashboardStatsAPI', 'renderDashboardCasinos', 'renderSitemapPage']) {
      assert.equal(typeof controllers[n], 'function', n);
    }
    for (const n of names) assert.equal(typeof controllers[n], 'function', n);
  });

  test('no controller module imports the re-export file (no cycles through it)', () => {
    for (const f of modules) assert.ok(!/from "\.\.?\/controllers\.js"/.test(read(`worker/controllers/${f}`)), f);
  });

  test('every module says what it holds and stays under 750 lines', () => {
    for (const f of modules) {
      const text = read(`worker/controllers/${f}`);
      assert.match(text.split('\n')[0], /^\/\/ \S/, f);
      assert.ok(text.split('\n').length <= 750, `${f} has ${text.split('\n').length} lines`);
    }
  });

  test('a function is defined once across the modules', () => {
    const seen = new Map();
    for (const f of modules) {
      for (const m of read(`worker/controllers/${f}`).matchAll(/^(?:export )?(?:async )?function (\w+)/gm)) {
        assert.ok(!seen.has(m[1]), `${m[1]} is in ${seen.get(m[1])} and ${f}`);
        seen.set(m[1], f);
      }
    }
    assert.ok(seen.size > 150);
  });
});
