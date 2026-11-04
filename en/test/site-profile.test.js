import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRoute } from '../worker/routes.js';
import { defaultProfile, applyPreset, validateProfile, gate, pathAllowed, pruneNavHtml, pruneAdminNavHtml, normalizeProfile } from '../worker/site-profile/profile.js';

const r = (p) => getRoute({ url: 'https://s.example' + p });
const g = (p, prof) => gate(r(p), prof);

test('default profile is the full platform: everything passes', () => {
  const p = defaultProfile();
  for (const path of ['/en', '/en/casino', '/en/casino/x', '/en/news', '/en/review/a', '/en/dashboard/casinos']) assert.equal(g(path, p).action, 'pass', path);
  assert.equal(gate(r('/'), p).action, 'pass');
});

test('news-only: /en/news is the landing, casinos/reviews are removed, news stays', () => {
  const p = applyPreset('news');
  assert.equal(gate(r('/'), p).location, '/en/news');
  assert.deepEqual(g('/en', p), { action: 'redirect', status: 301, location: '/en/news' });
  assert.equal(g('/en/news/some-story', p).action, 'pass');
  assert.equal(g('/en/casino', p).status, 404);
  assert.equal(g('/en/casino/bcgame', p).status, 404);
  assert.equal(g('/en/review/bcgame', p).status, 404);
  assert.equal(g('/en/sitemap-casinos.xml', p).status, 404);
});

test('casino-only without homepage: / and /en go to /en/casino; reviews gone', () => {
  const p = applyPreset('casino-only');
  assert.equal(gate(r('/'), p).location, '/en/casino');
  assert.equal(g('/en/home', p).location, '/en/casino');
  assert.equal(g('/en/casino', p).action, 'pass');
  assert.equal(g('/en/news', p).status, 404);
});

test('listing + reviews: casino and review live, news gone, homepage on', () => {
  const p = applyPreset('list-reviews');
  assert.equal(g('/en', p).action, 'pass');
  assert.equal(g('/en/review', p).action, 'pass');
  assert.equal(g('/en/news', p).status, 404);
});

test('login, API, legal pages and the configuration page are never gated', () => {
  const p = applyPreset('casino-only');
  for (const path of ['/en/login', '/en/forgot-password', '/en/privacy-policy', '/en/dashboard/configuration', '/en/api/v1/auth/login', '/robots.txt']) assert.equal(g(path, p).action, 'pass', path);
});

test('disabled modes: 410 and 301 redirect', () => {
  const p = applyPreset('news'); p.disabled = { mode: '410', redirectTo: '' };
  assert.equal(g('/en/casino', p).status, 410);
  p.disabled = { mode: '301', redirectTo: '/en/news' };
  assert.deepEqual(g('/en/casino/x', p), { action: 'redirect', status: 301, location: '/en/news' });
});

test('dashboard follows modules: disabled module pages redirect to Configuration', () => {
  const p = applyPreset('news');
  assert.equal(g('/en/dashboard/casinos', p).location, '/en/dashboard/configuration');
  assert.equal(g('/en/dashboard/news', p).action, 'pass');
});

test('validation refuses landing on a disabled module and an empty site', () => {
  const bad = applyPreset('news'); bad.landing = '/en/casino';
  assert.equal(validateProfile(bad).ok, false);
  const none = defaultProfile(); for (const k of Object.keys(none.modules)) none.modules[k] = false;
  assert.equal(validateProfile(none).ok, false);
  assert.equal(validateProfile({ ...applyPreset('news'), disabled: { mode: '301', redirectTo: '' } }).ok, false);
  assert.equal(normalizeProfile({ homepage: false, landing: 'https://evil.example' }).homepage, true);
});

test('nav, sitemap paths and admin menu are pruned to the choice', () => {
  const p = applyPreset('news');
  assert.equal(pathAllowed('/en/casino', p), false);
  assert.equal(pathAllowed('/en/news', p), true);
  assert.equal(pathAllowed('/en/', p), false);
  assert.equal(pathAllowed('https://partner.example/x', p), true);
  const nav = '<a href="/en/casino">Casinos</a><a href="/en/news">News</a><a href="https://x.example">Ext</a>';
  assert.equal(pruneNavHtml(nav, p), '<a href="/en/news">News</a><a href="https://x.example">Ext</a>');
  assert.equal(pruneNavHtml(nav, { ...p, header: { autoPrune: false } }), nav);
  const admin = '<details class="dash-group"><summary>C</summary><div class="dash-links">\n<a href="/en/dashboard/casinos">Casinos</a></div></details><details class="dash-group"><summary>P</summary><div class="dash-links"><a href="/en/dashboard/news">News</a></div></details>';
  const out = pruneAdminNavHtml(admin, p);
  assert.ok(!out.includes('Casinos') && out.includes('News'));
});
