import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRoute } from '../worker/routes.js';
import { MODULES, PRESETS, PAGE_IDS, PENDING_FEATURES, FEATURES, API_PREFIXES, allClaims } from '../worker/site-profile/registry.js';
import { applyPreset, validateProfile, normalizeProfile, gate, pathAllowed, isEnabled, sitemapAllowed, apiGate, cronAllowed } from '../worker/site-profile/profile.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const r = (p) => getRoute({ url: 'https://s.example' + p });
const g = (p, prof) => gate(r(p), prof);

function routeTypesInSource() {
  const files = [path.join(here, '../worker/routes.js'), ...fs.readdirSync(path.join(here, '../worker/routing')).map((f) => path.join(here, '../worker/routing', f))];
  const types = new Set();
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/type:\s*["']([A-Za-z0-9_-]+)["']/g)) types.add(m[1]);
  return types;
}

test('manifest completeness: every route type is claimed by exactly one capability or is explicitly core', () => {
  const claims = allClaims();
  const unclaimed = [...routeTypesInSource()].filter((t) => !claims.has(t));
  assert.deepEqual(unclaimed, [], 'Add these route types to site-profile/registry.js (module page, CORE_*, or PENDING_FEATURES)');
  const dupes = [...claims].filter(([, who]) => who.length > 1).map(([t, who]) => `${t}: ${who.join(', ')}`);
  assert.deepEqual(dupes, []);
});

test('manifest has no stale claims for route types that no longer exist', () => {
  const real = routeTypesInSource();
  const stale = [...allClaims().keys()].filter((t) => !real.has(t));
  assert.deepEqual(stale, []);
});

test('every preset validates and references real modules and pages', () => {
  for (const [id, p] of Object.entries(PRESETS)) {
    for (const m of p.modules) assert.ok(MODULES[m], `${id}: module ${m}`);
    for (const c of p.off || []) assert.ok(PAGE_IDS.has(c), `${id}: page ${c}`);
    const res = validateProfile(applyPreset(id));
    assert.deepEqual(res.errors, [], id);
  }
});

test('page-level: casino list without casino detail pages', () => {
  const p = applyPreset('casino-list'); p.pages['casino.detail'] = false;
  assert.equal(g('/en/casino', p).action, 'pass');
  assert.equal(g('/en/casino/bcgame', p).status, 404);
  assert.equal(sitemapAllowed('sitemap-casinos', p), false);
  assert.equal(pathAllowed('/en/casino/bcgame', p), false);
  assert.equal(pathAllowed('/en/casino', p), true);
});

test('page-level: news list and articles without topic/entity/series pages', () => {
  const p = applyPreset('news'); p.pages['news.taxonomy'] = false;
  assert.equal(g('/en/news', p).action, 'pass');
  assert.equal(g('/en/news/some-story', p).action, 'pass');
  assert.equal(sitemapAllowed('sitemap-news-landing', p), false);
  assert.equal(sitemapAllowed('sitemap-news', p), true);
});

test('sportsbook only: affiliate partners, custom types and best-of pages are gone', () => {
  const p = applyPreset('sportsbook');
  assert.equal(g('/en/sportsbook', p).action, 'pass');
  assert.equal(g('/en/affiliate-partner', p).status, 404);
  assert.equal(g('/en/casino', p).status, 404);
  assert.equal(g('/en/dashboard/casinos', p).location, '/en/dashboard/configuration');
  assert.equal(g('/en/dashboard/custom-types', p).action, 'redirect');
  assert.equal(g('/', p).location, '/en/sportsbook');
});

test('static website: no modules, still valid, ordinary pages, login and dashboard keep working', () => {
  const p = applyPreset('static');
  assert.equal(validateProfile(p).ok, true);
  for (const path of ['/en', '/en/login', '/en/privacy-policy', '/en/dashboard', '/en/dashboard/settings', '/en/dashboard/pages', '/en/dashboard/configuration', '/robots.txt']) assert.equal(g(path, p).action, 'pass', path);
  for (const path of ['/en/casino', '/en/news', '/en/review', '/en/research', '/en/category']) assert.equal(g(path, p).status, 404, path);
});

test('page overrides are sparse, validated and survive normalisation; unknown ids are dropped', () => {
  const n = normalizeProfile({ modules: { casino: true }, pages: { 'casino.detail': false, 'casino.list': true, 'nope.x': false } });
  assert.deepEqual(n.pages, { 'casino.detail': false });
  assert.equal(isEnabled(n, 'casino.list'), true);
  assert.equal(isEnabled(n, 'casino.detail'), false);
});

test('a page cannot be live when its module is off', () => {
  const p = applyPreset('news'); // casino module off
  assert.equal(isEnabled(p, 'casino.list'), false);
});

test('legacy v1 documents (no pages key) load as v2 with everything on', () => {
  const n = normalizeProfile({ v: 1, preset: 'news', modules: { news: true, casino: false }, homepage: false, landing: '/en/news' });
  assert.equal(n.v, 2); assert.deepEqual(n.pages, {}); assert.equal(n.modules.casino, false); assert.equal(n.landing, '/en/news');
});

test('validation refuses landing on a switched-off page family', () => {
  const p = applyPreset('casino-only'); p.pages['casino.list'] = false;
  assert.equal(validateProfile(p).ok, false);
});

test('no dashboard feature is left without a switch (Phase 2 complete)', () => {
  assert.equal(PENDING_FEATURES.size, 0);
});

function apiPathsInSource() {
  const dir = path.join(here, '../worker/api'); const out = new Set();
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const fp = path.join(d, f.name); if (f.isDirectory()) walk(fp); else if (f.name.endsWith('.js')) for (const m of fs.readFileSync(fp, 'utf8').matchAll(/["'`](\/api\/v1\/[a-z0-9/_-]+)/g)) out.add(m[1]); } };
  walk(dir); return out;
}

test('every feature API prefix matches at least one real endpoint (no dead prefixes)', () => {
  const real = [...apiPathsInSource()];
  for (const { prefix, capability } of API_PREFIXES) assert.ok(real.some((p) => p.startsWith(prefix)), `${capability}: ${prefix}`);
});

test('feature off: dashboard screen redirects, admin API is refused, data endpoints of other features untouched', () => {
  const p = normalizeProfile({ features: { geo: false, analytics: false } });
  assert.equal(g('/en/dashboard/geo-rules', p).location, '/en/dashboard/configuration');
  assert.equal(g('/en/dashboard/geo-rules/bulk', p).action, 'redirect');
  assert.equal(g('/en/dashboard/analytics', p).action, 'redirect');
  assert.equal(g('/en/dashboard/reports', p).action, 'pass');
  assert.equal(apiGate('/api/v1/geo/list', p).status, 404);
  assert.equal(apiGate('/api/v1/geo-manager/rules', p).body.code, 'feature_disabled');
  assert.equal(apiGate('/api/v1/analytics/overview', p).status, 404);
  assert.equal(apiGate('/api/v1/report/get', p), null);
  assert.equal(apiGate('/api/v1/casinos/list', p), null);
});

test('feature back on restores everything; default profile refuses nothing', () => {
  const on = normalizeProfile({ features: { geo: true } });
  assert.deepEqual(on.features, {});
  for (const f of Object.values(FEATURES)) for (const pre of f.api) assert.equal(apiGate(pre + 'x', normalizeProfile({})), null);
});

test('offers and payment methods follow their casino page switches', () => {
  const p = applyPreset('casino-list'); p.pages['casino.offers'] = false; p.pages['casino.payments'] = false;
  assert.equal(apiGate('/api/v1/offers/list', p).status, 404);
  assert.equal(apiGate('/api/v1/payment-methods/list', p).status, 404);
  assert.equal(g('/en/dashboard/offers', p).action, 'redirect');
  assert.equal(apiGate('/api/v1/casinos/list', p), null);
});

test('cron jobs skip work of switched-off features', () => {
  const p = normalizeProfile({ features: { analytics: false, ai: false, subscriptions: false } });
  assert.equal(cronAllowed('aggregation', p), false);
  assert.equal(cronAllowed('alerts', p), false);
  assert.equal(cronAllowed('chatQuality', p), false);
  assert.equal(cronAllowed('weeklyDigest', p), false);
  assert.equal(cronAllowed('scheduledReports', p), true);
  assert.equal(cronAllowed('somethingElse', p), true);
});

test('static preset switches off marketing features but keeps the dashboard core', () => {
  const p = applyPreset('static');
  assert.equal(isEnabled(p, 'features.banners'), false);
  assert.equal(g('/en/dashboard/settings', p).action, 'pass');
});
