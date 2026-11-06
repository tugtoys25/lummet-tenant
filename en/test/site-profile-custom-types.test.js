// Phase 11 / T2: every custom content type can be switched on or off by itself (content.custom.<slug>).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { getRoute } from '../worker/routes.js';
import { defaultProfile, normalizeProfile, isEnabled, validateProfile, pathAllowed, classifyPath, gate, pruneNavHtml, isCustomTypeId, customTypeId } from '../worker/site-profile/profile.js';
import { rewriteHtmlLinks, needsRewrite } from '../worker/site-profile/links.js';
import { listCustomTypes, dropUnknownCustomTypes } from '../worker/site-profile/custom-types.js';
import { route as profileRoute } from '../worker/api/routes/site-profile.js';
import { sitemapEngine } from '../worker/sitemap.js';
import { publicRoutes } from '../worker/api/public.js';
import { clearContentTypeEnablementCache } from '../worker/content-types.js';

const off = (...slugs) => normalizeProfile({ ...defaultProfile(), pages: Object.fromEntries(slugs.map((s) => [`content.custom.${s}`, false])) });
const admin = { user_id: 1, email: 'boss@t.example', role: 'admin' };
const req = (method, body) => ({ method, url: 'https://t.example/api/v1/site-profile', headers: new Headers(), json: async () => body });
const callApi = (method, body, env) => profileRoute({ request: req(method, body), env, path: '/api/v1/site-profile', user: admin });
let db, ENV;

beforeEach(() => { db = createTestDb(); applyMigrations(db); ENV = { DB: db }; clearContentTypeEnablementCache(); });

describe('the capability id and the profile', () => {
  test('id shape: lowercase slug, no dots', () => {
    assert.equal(customTypeId('Payment-Provider'), 'content.custom.payment-provider');
    assert.equal(isCustomTypeId('content.custom.cards'), true);
    for (const bad of ['content.custom', 'content.custom.', 'content.custom.a.b', 'content.custom.A', 'content.news.cards', 'content.custom. x', '']) assert.equal(isCustomTypeId(bad), false, bad);
    assert.equal(customTypeId('has.dot'), null);
  });
  test('only explicit "off" is stored, junk ids are dropped', () => {
    const p = normalizeProfile({ pages: { 'content.custom.cards': false, 'content.custom.ok': true, 'content.custom.bad.id': false, 'content.nope.x': false } });
    assert.deepEqual(p.pages, { 'content.custom.cards': false });
  });
  test('default profile is untouched and needs no link rewriting', () => {
    assert.deepEqual(defaultProfile().pages, {});
    assert.equal(needsRewrite(defaultProfile()), false);
    assert.equal(needsRewrite(off('cards')), true);
  });
  test('a type is live only while its parent is live', () => {
    const p = off('cards');
    assert.equal(isEnabled(p, 'content.custom.cards'), false);
    assert.equal(isEnabled(p, 'content.custom.other'), true);
    assert.equal(isEnabled(p, 'content.custom'), true);
    assert.equal(isEnabled(normalizeProfile({ pages: { 'content.custom': false } }), 'content.custom.other'), false);
    assert.equal(isEnabled(normalizeProfile({ modules: { content: false } }), 'content.custom.other'), false);
  });
  test('validation: landing on a switched-off type is refused', () => {
    const p = { ...off('cards'), homepage: false, landing: '/en/custom/cards' };
    const v = validateProfile(p);
    assert.equal(v.ok, false);
    assert.match(v.errors.join(' '), /content\.custom\.cards/);
  });
});

describe('public pages follow the switch', () => {
  const URLS = ['/en/custom/cards', '/en/custom/cards/visa', '/en/custom/cards/review/visa'];
  test('classification gives the per-type capability to list, detail and review URLs', () => {
    for (const u of URLS) assert.equal(classifyPath(u).capability, 'content.custom.cards', u);
  });
  test('off type: gone/404/410/301 per mode; the other type and the rest of the site pass', () => {
    const p = off('cards');
    for (const u of URLS) {
      assert.deepEqual(gate(getRoute({ url: 'https://t.example' + u }), p), { action: 'gone', status: 404 }, u);
      assert.equal(pathAllowed(u, p), false, u);
      assert.equal(pathAllowed(u.replace('cards', 'other'), p), true, u);
    }
    assert.equal(gate(getRoute({ url: 'https://t.example/en/custom/other' }), p).action, 'pass');
    assert.equal(gate(getRoute({ url: 'https://t.example/en/casino' }), p).action, 'pass');
    const p410 = normalizeProfile({ ...p, disabled: { mode: '410' } });
    assert.equal(gate(getRoute({ url: 'https://t.example/en/custom/cards' }), p410).status, 410);
    const p301 = normalizeProfile({ ...p, disabled: { mode: '301', redirectTo: '/en/casino' } });
    assert.deepEqual(gate(getRoute({ url: 'https://t.example/en/custom/cards' }), p301), { action: 'redirect', status: 301, location: '/en/casino' });
  });
  test('turning it back on restores everything (nothing was deleted)', () => {
    const p = off('cards'); delete p.pages['content.custom.cards'];
    for (const u of URLS) assert.equal(pathAllowed(u, p), true, u);
  });
  test('navigation and body links to the off type are removed, the others stay', () => {
    const p = off('cards');
    const nav = '<ul><li><a href="/en/custom/cards">Cards</a></li><li><a href="/en/custom/other">Other</a></li></ul>';
    const pruned = pruneNavHtml(nav, p);
    assert.ok(!pruned.includes('/en/custom/cards')); assert.ok(pruned.includes('/en/custom/other'));
    const body = '<p>See <a href="/en/custom/cards/visa">Visa</a>, <a href="/en/custom/other/x">X</a> and <a href="https://s.example/en/custom/cards">abs</a>.</p>';
    const out = rewriteHtmlLinks(body, p, 'https://s.example');
    assert.ok(!/custom\/cards/.test(out), out); assert.ok(out.includes('/en/custom/other/x'));
  });
});

describe('storage and the API', () => {
  beforeEach(async () => {
    for (const [slug, label] of [['cards', 'Cards'], ['other', 'Other']]) await db.prepare('INSERT INTO custom_content_types (slug, label, plural_label) VALUES (?, ?, ?)').bind(slug, label, label + 's').run();
  });
  test('listCustomTypes returns the live types with their capability ids, and fails open', async () => {
    assert.deepEqual(await listCustomTypes(ENV), [{ slug: 'cards', label: 'Cards', id: 'content.custom.cards' }, { slug: 'other', label: 'Other', id: 'content.custom.other' }]);
    assert.deepEqual(await listCustomTypes({ DB: null }), []);
  });
  test('choices for deleted types are dropped on save; a read failure keeps them', async () => {
    const p = off('cards', 'gone');
    await dropUnknownCustomTypes(ENV, p);
    assert.deepEqual(p.pages, { 'content.custom.cards': false });
    const q = off('gone'); await dropUnknownCustomTypes({ DB: null }, q);
    assert.deepEqual(q.pages, { 'content.custom.gone': false });
  });
  test('GET lists the custom types; POST saves a per-type choice and drops unknown ones', async () => {
    const g = await callApi('GET', undefined, ENV);
    assert.equal(g.status, 200);
    assert.deepEqual((await g.json()).customTypes.map((t) => t.slug), ['cards', 'other']);
    const r = await callApi('POST', off('cards', 'gone'), ENV);
    assert.equal(r.status, 200);
    const saved = JSON.parse((await db.prepare("SELECT value FROM settings WHERE key='site_profile'").first()).value);
    assert.deepEqual(saved.pages, { 'content.custom.cards': false });
  });
  test('sitemap: URLs of the off type disappear, the other type stays', async () => {
    await db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('content_types_enabled', ?)").bind(JSON.stringify({ custom: true })).run();
    clearContentTypeEnablementCache();
    for (const [t, s] of [['cards', 'visa'], ['other', 'thing']]) await db.prepare("INSERT INTO content_items (content_type, custom_type_slug, slug, name, status, published) VALUES ('custom', ?, ?, ?, 'published', 1)").bind(t, s, s).run();
    await db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('site_profile', ?)").bind(JSON.stringify(off('cards'))).run();
    const res = await sitemapEngine.generate(new Request('https://t.example/en/sitemap-custom.xml'), ENV, db, 'custom');
    const xml = await res.text();
    assert.ok(xml.includes('/en/custom/other/thing'), xml);
    assert.ok(!xml.includes('/en/custom/cards/'), xml);
  });
});

describe('public search API', () => {
  const search = async () => {
    const r = await publicRoutes({ request: new Request('https://t.example/api/v1/public/search?q=alpha'), env: ENV, path: '/api/v1/public/search', user: null });
    return r.json();
  };
  beforeEach(async () => { await db.prepare("INSERT INTO news (slug, title, content, published) VALUES ('alpha-story', 'Alpha story', 'x', 1)").run(); });
  test('full platform: the article is found (control)', async () => {
    const out = await search();
    assert.equal(out.total, 1, JSON.stringify(out));
  });
  test('results that point at a removed section are not offered, and totals stay consistent', async () => {
    await db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('site_profile', ?)").bind(JSON.stringify(normalizeProfile({ modules: { news: false } }))).run();
    const out = await search();
    assert.equal(out.total, 0, JSON.stringify(out)); assert.deepEqual(out.groups, []);
  });
});
