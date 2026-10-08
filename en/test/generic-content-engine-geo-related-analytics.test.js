// test/generic-content-engine-geo-related-analytics.test.js
//
// Covers the Phase-3 follow-ups the repo itself documented as undone
// ("no KV caching of related items, no per-country GEO badge on the
// card grid, no analytics event logging"): content_geo + content_categories
// read/write (tables existed since 0051 but nothing used them), GEO
// badges on list cards + detail sidebar, related items with KV caching,
// CONTENT_VIEW logging (migration 0059), plus the list-card XSS fix and
// relationship-row cleanup on delete.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as contentItems from '../worker/database/content-items.js';
import * as analytics from '../worker/database/analytics.js';
import { renderSportsbook, renderSportsbookList, renderAffiliatePartner } from '../worker/controllers.js';
import { handleAPI } from '../worker/api.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const makeReq = (method, url, body) => ({ method, url, headers: new Headers(), json: async () => body });
const admin = { user_id: 1, role: 'admin', email: 'admin@test.com' };

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT OR IGNORE INTO countries (code, name) VALUES ('US','United States'),('GB','United Kingdom'),('RW','Rwanda')`).run();
  return { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
}
const pub = (db, slug, name, extra = {}) => contentItems.createContentItem(db, 'sportsbook', { slug, name, status: 'published', published: true, rating: 4, ...extra });

describe('content_geo: read/write + status inference (same model as casino geo_rules)', () => {
  let db;
  beforeEach(async () => { db = (await mkEnv()).DB; });

  test('set/get round-trips and replace-all clears', async () => {
    const it = await pub(db, 'a', 'A');
    await contentItems.setContentItemGeoRules(db, 'sportsbook', it.id, [{ country_code: 'US', status: 'allowed' }, { country_code: 'GB', status: 'blocked' }]);
    assert.equal((await contentItems.getContentItemGeoRules(db, 'sportsbook', it.id)).length, 2);
    await contentItems.setContentItemGeoRules(db, 'sportsbook', it.id, []);
    assert.equal((await contentItems.getContentItemGeoRules(db, 'sportsbook', it.id)).length, 0);
  });

  test('no rules at all -> blocked everywhere (documented casino default)', async () => {
    const it = await pub(db, 'a', 'A');
    assert.deepEqual(await contentItems.getContentGeoStatuses(db, 'sportsbook', [it.id], 'US'), { [it.id]: 'blocked' });
  });

  test('exact country rule wins; allowlist mode blocks others; blocklist mode allows others', async () => {
    const allow = await pub(db, 'allow', 'Allow');
    const block = await pub(db, 'block', 'Block');
    await contentItems.setContentItemGeoRules(db, 'sportsbook', allow.id, [{ country_code: 'US', status: 'allowed' }]);
    await contentItems.setContentItemGeoRules(db, 'sportsbook', block.id, [{ country_code: 'GB', status: 'blocked' }]);
    const us = await contentItems.getContentGeoStatuses(db, 'sportsbook', [allow.id, block.id], 'US');
    const gb = await contentItems.getContentGeoStatuses(db, 'sportsbook', [allow.id, block.id], 'GB');
    assert.equal(us[allow.id], 'allowed');   // exact
    assert.equal(us[block.id], 'allowed');   // blocklist-only, US not listed
    assert.equal(gb[allow.id], 'blocked');   // allowlist-only, GB not listed
    assert.equal(gb[block.id], 'blocked');   // exact
  });

  test('rules are scoped by content_type (a sportsbook id never picks up an affiliate_partner rule)', async () => {
    const it = await pub(db, 'a', 'A');
    await contentItems.setContentItemGeoRules(db, 'affiliate_partner', it.id, [{ country_code: 'US', status: 'allowed' }]);
    assert.equal((await contentItems.getContentGeoStatuses(db, 'sportsbook', [it.id], 'US'))[it.id], 'blocked');
  });
});

describe('GEO badges render on list cards and the detail sidebar', () => {
  test('list page: allowed country shows an allowed badge, blocked shows blocked (via ?geo= override)', async () => {
    const env = await mkEnv();
    const it = await pub(env.DB, 'geo-book', 'Geo Book');
    await contentItems.setContentItemGeoRules(env.DB, 'sportsbook', it.id, [{ country_code: 'US', status: 'allowed' }]);
    const us = await (await renderSportsbookList(new Request('https://site.test/en/sportsbook?geo=US'), env)).text();
    const gb = await (await renderSportsbookList(new Request('https://site.test/en/sportsbook?geo=GB'), env)).text();
    assert.match(us, /geo-badge--allowed/);
    assert.match(gb, /geo-badge--blocked/);
  });

  test('detail page shows a GEO status line', async () => {
    const env = await mkEnv();
    const it = await pub(env.DB, 'geo-book', 'Geo Book');
    await contentItems.setContentItemGeoRules(env.DB, 'sportsbook', it.id, [{ country_code: 'US', status: 'allowed' }]);
    const res = await renderSportsbook(new Request('https://site.test/en/sportsbook/geo-book?geo=US'), env, 'geo-book', null);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Available for players from/);
  });
});

describe('list cards escape admin-entered name/description (previously interpolated raw)', () => {
  test('a script payload in name and description is inert on the list page', async () => {
    const env = await mkEnv();
    await pub(env.DB, 'xss', '<script>alert(1)</script>', { description: '<img src=x onerror=alert(2)>' });
    const html = await (await renderSportsbookList(new Request('https://site.test/en/sportsbook'), env)).text();
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(!html.includes('<img src=x onerror=alert(2)>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  });
});

describe('content_categories: read/write', () => {
  test('set/get round-trips and replace-all clears', async () => {
    const { DB: db } = await mkEnv();
    await db.prepare(`INSERT INTO categories (id, name, slug) VALUES (1,'Top','top'),(2,'New','new')`).run();
    const it = await pub(db, 'a', 'A');
    await contentItems.setContentItemCategories(db, 'sportsbook', it.id, [1, 2]);
    assert.deepEqual((await contentItems.getContentItemCategories(db, 'sportsbook', it.id)).sort(), [1, 2]);
    await contentItems.setContentItemCategories(db, 'sportsbook', it.id, [2]);
    assert.deepEqual(await contentItems.getContentItemCategories(db, 'sportsbook', it.id), [2]);
    await contentItems.setContentItemCategories(db, 'sportsbook', it.id, []);
    assert.deepEqual(await contentItems.getContentItemCategories(db, 'sportsbook', it.id), []);
  });
});

describe('getRelatedContentItems', () => {
  let db;
  beforeEach(async () => {
    db = (await mkEnv()).DB;
    await db.prepare(`INSERT INTO categories (id, name, slug) VALUES (1,'Top','top'),(2,'Other','other')`).run();
  });
  const allowUS = (id) => contentItems.setContentItemGeoRules(db, 'sportsbook', id, [{ country_code: 'US', status: 'allowed' }]);

  test('shared-category items rank first, self is excluded', async () => {
    const cur = await pub(db, 'cur', 'Cur'); const match = await pub(db, 'match', 'Match', { rating: 1 }); const other = await pub(db, 'other', 'Other', { rating: 5 });
    for (const i of [cur, match, other]) await allowUS(i.id);
    await contentItems.setContentItemCategories(db, 'sportsbook', cur.id, [1]);
    await contentItems.setContentItemCategories(db, 'sportsbook', match.id, [1]);
    await contentItems.setContentItemCategories(db, 'sportsbook', other.id, [2]);
    const rel = await contentItems.getRelatedContentItems(db, cur, 'sportsbook', 'US', 6);
    assert.deepEqual(rel.map(r => r.slug), ['match', 'other']); // category match (rating 1) outranks higher-rated non-match
  });

  test('drafts and GEO-ineligible items never appear', async () => {
    const cur = await pub(db, 'cur', 'Cur'); const draft = await contentItems.createContentItem(db, 'sportsbook', { slug: 'draft', name: 'Draft', status: 'draft', published: false });
    const blocked = await pub(db, 'blocked', 'Blocked'); const ok = await pub(db, 'ok', 'Ok');
    await allowUS(cur.id); await allowUS(draft.id); await allowUS(ok.id);
    await contentItems.setContentItemGeoRules(db, 'sportsbook', blocked.id, [{ country_code: 'GB', status: 'allowed' }]);
    const rel = await contentItems.getRelatedContentItems(db, cur, 'sportsbook', 'US', 6);
    assert.deepEqual(rel.map(r => r.slug), ['ok']);
  });

  test('scoped by content_type', async () => {
    const cur = await pub(db, 'cur', 'Cur'); await allowUS(cur.id);
    const ap = await contentItems.createContentItem(db, 'affiliate_partner', { slug: 'ap', name: 'AP', status: 'published', published: true });
    await contentItems.setContentItemGeoRules(db, 'affiliate_partner', ap.id, [{ country_code: 'US', status: 'allowed' }]);
    assert.equal((await contentItems.getRelatedContentItems(db, cur, 'sportsbook', 'US', 6)).length, 0);
  });
});

describe('detail page: related items are KV-cached and gated', () => {
  test('related block renders, is written to the CACHE binding, and a second render is served from it', async () => {
    const env = await mkEnv();
    const store = new Map();
    env.CACHE = { get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); }, delete: async (k) => { store.delete(k); } };
    const cur = await pub(env.DB, 'cur', 'CurBook'); const rel = await pub(env.DB, 'rel', 'RelatedUniqueName');
    for (const i of [cur, rel]) await contentItems.setContentItemGeoRules(env.DB, 'sportsbook', i.id, [{ country_code: 'US', status: 'allowed' }]);

    const html1 = await (await renderSportsbook(new Request('https://site.test/en/sportsbook/cur?geo=US'), env, 'cur', null)).text();
    assert.ok(html1.includes('RelatedUniqueName'));
    const key = `related_content:sportsbook:${cur.id}:US`;
    assert.ok(store.has(key), 'related HTML must be written to the cache under the expected key');

    // Unpublish the related item; the cached block is still served (same 300s trade-off renderCasino() makes).
    await env.DB.prepare(`UPDATE content_items SET published = 0, status = 'draft' WHERE slug = 'rel'`).run();
    const html2 = await (await renderSportsbook(new Request('https://site.test/en/sportsbook/cur?geo=US'), env, 'cur', null)).text();
    assert.ok(html2.includes('RelatedUniqueName'), 'second render must come from the cache');
    // A different visitor country is a different cache key -> recomputed live, and the now-draft item is gone.
    const htmlGB = await (await renderSportsbook(new Request('https://site.test/en/sportsbook/cur?geo=GB'), env, 'cur', null)).text();
    assert.ok(!htmlGB.includes('RelatedUniqueName'));
  });

  test('a draft item never shows in someone else\'s related block (uncached path)', async () => {
    const env = await mkEnv();
    const cur = await pub(env.DB, 'cur', 'CurBook');
    const draft = await contentItems.createContentItem(env.DB, 'sportsbook', { slug: 'dr', name: 'DraftUniqueName', status: 'draft', published: false });
    for (const i of [cur, draft]) await contentItems.setContentItemGeoRules(env.DB, 'sportsbook', i.id, [{ country_code: 'US', status: 'allowed' }]);
    const html = await (await renderSportsbook(new Request('https://site.test/en/sportsbook/cur?geo=US'), env, 'cur', null)).text();
    assert.ok(!html.includes('DraftUniqueName'));
  });
});

describe('CONTENT_VIEW analytics logging (migration 0059)', () => {
  const ctxCollector = () => { const p = []; return { promises: p, waitUntil: (x) => p.push(x) }; };

  test('viewing a published sportsbook logs one CONTENT_VIEW with content_item_id and metadata.content_type', async () => {
    const env = await mkEnv(); const it = await pub(env.DB, 'a', 'A');
    const ctx = ctxCollector();
    const res = await renderSportsbook(new Request('https://site.test/en/sportsbook/a?geo=US'), env, 'a', ctx);
    assert.equal(res.status, 200);
    await Promise.all(ctx.promises);
    const rows = (await env.DB.prepare(`SELECT * FROM analytics_events WHERE event_type = 'CONTENT_VIEW' AND content_item_id = ?`).bind(it.id).all()).results;
    assert.equal(rows.length, 1);
    assert.equal(JSON.parse(rows[0].metadata).content_type, 'sportsbook');
    assert.equal(rows[0].casino_id, null, 'must not reuse casino_id');
    assert.equal(rows[0].country_code, 'US');
  });

  test('affiliate_partner views log too', async () => {
    const env = await mkEnv();
    const it = await contentItems.createContentItem(env.DB, 'affiliate_partner', { slug: 'ap', name: 'AP', status: 'published', published: true });
    const ctx = ctxCollector();
    await renderAffiliatePartner(new Request('https://site.test/en/affiliate-partner/ap'), env, 'ap', ctx);
    await Promise.all(ctx.promises);
    const n = (await env.DB.prepare(`SELECT COUNT(*) n FROM analytics_events WHERE content_item_id = ?`).bind(it.id).first()).n;
    assert.equal(n, 1);
  });

  test('a draft (404) logs nothing', async () => {
    const env = await mkEnv();
    await contentItems.createContentItem(env.DB, 'sportsbook', { slug: 'd', name: 'D', status: 'draft', published: false });
    const ctx = ctxCollector();
    const res = await renderSportsbook(new Request('https://site.test/en/sportsbook/d'), env, 'd', ctx);
    assert.equal(res.status, 404);
    assert.equal(ctx.promises.length, 0);
  });

  test('no ctx supplied never throws', async () => {
    const env = await mkEnv(); await pub(env.DB, 'a', 'A');
    assert.equal((await renderSportsbook(new Request('https://site.test/en/sportsbook/a'), env, 'a', null)).status, 200);
  });

  test('migration 0059 is additive: only ADD COLUMN + CREATE INDEX IF NOT EXISTS', () => {
    const sql = readFileSync(join(ROOT, 'migrations/0059_analytics_content_item.sql'), 'utf-8').replace(/--.*$/gm, '');
    assert.doesNotMatch(sql, /\bDROP\b|\bDELETE\b|\bUPDATE\b|\bRENAME\b/i);
    assert.match(sql, /ALTER TABLE analytics_events ADD COLUMN content_item_id/);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS/);
  });

  test('existing event types are unaffected: content_item_id is NULL for a casino event', async () => {
    const { DB: db } = await mkEnv();
    await analytics.logEvent(db, { eventType: 'PAGE_VIEW', landingPage: '/x' });
    const row = await db.prepare(`SELECT content_item_id FROM analytics_events LIMIT 1`).first();
    assert.equal(row.content_item_id, null);
  });
});

describe('API: categories + GEO rules on content-item create/update/get/delete', () => {
  let db;
  beforeEach(async () => { db = (await mkEnv()).DB; await db.prepare(`INSERT INTO categories (id, name, slug) VALUES (1,'Top','top')`).run(); });
  const call = (m, p, b) => handleAPI(makeReq(m, `https://x.com${p}`, b), { DB: db }, p.split('?')[0], admin);

  test('create with category_ids + geo_rules persists; get returns them', async () => {
    const r = await call('POST', '/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'a', name: 'A', category_ids: [1], geo_rules: [{ country_code: 'us', status: 'allowed' }] });
    assert.equal(r.status, 200);
    const g = await (await call('GET', '/api/v1/content-item/get?content_type=sportsbook&slug=a')).json();
    assert.deepEqual(g.category_ids, [1]);
    assert.deepEqual(g.geo_rules, [{ country_code: 'US', status: 'allowed' }]); // normalized to uppercase
  });

  test('update: omitted geo_rules leaves them untouched; [] clears them', async () => {
    await call('POST', '/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'a', name: 'A', geo_rules: [{ country_code: 'US', status: 'allowed' }] });
    await call('POST', '/api/v1/content-item/update', { content_type: 'sportsbook', slug: 'a', name: 'Renamed' });
    let g = await (await call('GET', '/api/v1/content-item/get?content_type=sportsbook&slug=a')).json();
    assert.equal(g.geo_rules.length, 1);
    await call('POST', '/api/v1/content-item/update', { content_type: 'sportsbook', slug: 'a', geo_rules: [] });
    g = await (await call('GET', '/api/v1/content-item/get?content_type=sportsbook&slug=a')).json();
    assert.equal(g.geo_rules.length, 0);
  });

  test('invalid status, bad code, unknown country, duplicate -> 400 and nothing is written', async () => {
    for (const geo_rules of [
      [{ country_code: 'US', status: 'maybe' }],
      [{ country_code: 'USA', status: 'allowed' }],
      [{ country_code: 'ZZ', status: 'allowed' }],
      [{ country_code: 'US', status: 'allowed' }, { country_code: 'us', status: 'blocked' }],
    ]) {
      const r = await call('POST', '/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'bad', name: 'Bad', geo_rules });
      assert.equal(r.status, 400, JSON.stringify(geo_rules));
    }
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM content_items WHERE slug = 'bad'`).first()).n, 0);
  });

  test('extra geo fields (redirect_url) are not accepted/stored', async () => {
    await call('POST', '/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'a', name: 'A', geo_rules: [{ country_code: 'US', status: 'allowed', redirect_url: 'javascript:alert(1)' }] });
    const row = await db.prepare(`SELECT redirect_url FROM content_geo LIMIT 1`).first();
    assert.equal(row.redirect_url, null);
  });

  test('delete removes the item\'s relationship rows (no orphans)', async () => {
    await call('POST', '/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'a', name: 'A', category_ids: [1], geo_rules: [{ country_code: 'US', status: 'allowed' }] });
    await call('POST', '/api/v1/content-item/delete', { content_type: 'sportsbook', slug: 'a' });
    for (const t of ['content_categories', 'content_geo', 'content_sports', 'content_currencies', 'content_payment_methods']) {
      assert.equal((await db.prepare(`SELECT COUNT(*) n FROM ${t}`).first()).n, 0, t);
    }
  });
});

describe('admin UI wiring for categories + GEO rules', () => {
  const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
  test('create and edit templates contain the containers the JS targets', () => {
    for (const f of ['content-item-create.html', 'content-item-edit.html']) {
      const t = read(`templates/pages/admin/${f}`);
      assert.match(t, /id="categoryCheckboxes"/, f);
      assert.match(t, /id="geoRuleRows"/, f);
      assert.match(t, /id="addGeoRuleBtn"/, f);
    }
  });
  test('dashboard.js defines the helpers and guards against wiping data when a list fails to load', () => {
    const js = read('static/js/dashboard.js');
    for (const fn of ['loadCategoryCheckboxes', 'initGeoRuleEditor', 'readGeoRules', 'addGeoRuleRow']) assert.match(js, new RegExp(`function ${fn}\\b`));
    assert.match(js, /dataset\.loaded === "1"/);   // categories only sent if they loaded
    assert.match(js, /geoRulesToSend !== null/);   // geo only sent if countries loaded
  });
  test('the public content-item template renders the new blocks conditionally', () => {
    const t = read('templates/pages/content-item.html');
    assert.match(t, /\{\{#if geo_status_html\}\}/);
    assert.match(t, /\{\{#if related_items_html\}\}/);
  });
});

describe('logEvent does not depend on migration 0059 for pre-existing event types', () => {
  test('with the content_item_id column ABSENT, a casino/page event still inserts (only CONTENT_VIEW needs the column)', async () => {
    const db = createTestDb(); applyMigrations(db);
    // Simulate a tenant whose D1 has not had 0059 applied yet.
    await db.prepare(`DROP INDEX IF EXISTS idx_analytics_events_content_item`).run();
    await db.prepare(`ALTER TABLE analytics_events DROP COLUMN content_item_id`).run();
    const r = await analytics.logEvent(db, { eventType: 'PAGE_VIEW', landingPage: '/x' });
    assert.ok(r, 'legacy-shaped event must still be written');
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM analytics_events`).first()).n, 1);
  });
});
