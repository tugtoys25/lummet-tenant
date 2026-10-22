// Guards the split of worker/ai/retrieval.js: the facade keeps the public API, parts stay small, no import cycle.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../worker/ai/retrieval.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'worker/ai/retrieval');
const parts = readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const read = (n) => readFileSync(join(DIR, `${n}.js`), 'utf-8');

describe('ai retrieval layout', () => {
  test('the facade exports the same six functions as before', () => {
    assert.deepEqual(Object.keys(facade).sort(), ['buildContextString', 'createStreamingUrlSanitizer', 'extractContextUrls', 'guardGeoFacts', 'retrieve', 'sanitizeAnswerUrls']);
  });
  test('the facade only re-exports', () => {
    const body = readFileSync(join(ROOT, 'worker/ai/retrieval.js'), 'utf-8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    for (const l of body) assert.match(l, /^export \{ [A-Za-z, ]+ \} from "\.\/retrieval\/[a-z-]+\.js";$/);
  });
  test('the six parts exist, none is over 800 lines, imports resolve, no cycle', () => {
    assert.deepEqual(parts, ['context-string', 'geo-guard', 'match-helpers', 'retrieve', 'search-helpers', 'url-guard']);
    const graph = {};
    for (const n of parts) {
      const s = read(n); assert.ok(s.split('\n').length < 800, `${n} too long`);
      graph[n] = [];
      for (const m of s.matchAll(/from "(\.[^"]+)"/g)) { assert.ok(existsSync(join(DIR, m[1])), `${n} imports missing ${m[1]}`); if (m[1].startsWith('./') && !m[1].startsWith('./search/')) graph[n].push(m[1].slice(2, -3)); }
    }
    const visit = (n, stack) => { assert.ok(!stack.includes(n), `cycle ${[...stack, n].join(' > ')}`); graph[n].forEach((d) => visit(d, [...stack, n])); };
    parts.forEach((n) => visit(n, []));
  });
});

describe('ai retrieval search parts (v22.28)', () => {
  const SDIR = join(DIR, 'search');
  const sparts = readdirSync(SDIR).filter((f) => f.endsWith('.js')).sort();
  const ORDER = ['searchCasinos', 'searchReviews', 'searchNews', 'searchContentItems', 'searchPlatformUpdates', 'searchPages', 'searchFaqs', 'searchAuthors', 'searchCountries', 'searchCategories', 'searchSeoPages', 'searchSeoMeta', 'searchPaymentMethods', 'searchNavItems', 'searchHomepageSections'];
  test('the seven search parts exist and stay under 300 lines', () => {
    assert.deepEqual(sparts, ['casinos.js', 'catalog.js', 'items.js', 'pages.js', 'platform-updates.js', 'reviews.js', 'site-structure.js']);
    for (const f of sparts) assert.ok(readFileSync(join(SDIR, f), 'utf-8').split('\n').length < 300, `${f} too long`);
  });
  test('retrieve.js is only the orchestrator and calls the 15 searches in the documented order', () => {
    const s = read('retrieve');
    assert.ok(s.split('\n').length < 120);
    assert.equal(/db\.prepare/.test(s), false, 'retrieve.js must not run queries itself');
    const calls = [...s.matchAll(/^  await (search\w+)\(ctx, results\);$/gm)].map((m) => m[1]);
    assert.deepEqual(calls, ORDER);
  });
  test('each part exports async search functions of (ctx, results), imports resolve, helpers come from the parent folder only', () => {
    const exported = [];
    for (const f of sparts) {
      const s = readFileSync(join(SDIR, f), 'utf-8');
      for (const m of s.matchAll(/^export async function (\w+)\(ctx, results\) \{$/gm)) exported.push(m[1]);
      for (const m of s.matchAll(/from "([^"]+)"/g)) { assert.match(m[1], /^\.\.\/(match|search)-helpers\.js$/); assert.ok(existsSync(join(SDIR, m[1]))); }
    }
    assert.deepEqual(exported.sort(), [...ORDER].sort());
  });
  test('a retrieval with no matching tables returns the empty result shape', async () => {
    const { retrieve } = facade;
    const seen = [];
    const stmt = { bind() { return stmt; }, async all() { return { results: [] }; }, async first() { return null; }, async run() { return { success: true }; } };
    const db = { prepare(sql) { seen.push(sql); return stmt; } };
    const r = await retrieve({ DB: db, SITE_URL: 'https://x.test' }, 'hello', null, { intent: 'none', tables: ['bogus'], search_terms: [] }, null, null);
    assert.equal(seen.some((q) => /FROM (casinos|reviews|news|faqs|authors|nav_items)\b/i.test(q)), false, 'no search query should run');
    assert.deepEqual(Object.keys(r), ['casinos', 'reviews', 'reviewBlocks', 'news', 'platformUpdates', 'pages', 'faqs', 'authors', 'countries', 'categories', 'seoMeta', 'geoStatuses', 'casinoCategories', 'paymentMethods', 'casinoPaymentMethods', 'navItems', 'homepageSections', 'seoPages', 'contentItems', 'researchItems']);
  });
});
