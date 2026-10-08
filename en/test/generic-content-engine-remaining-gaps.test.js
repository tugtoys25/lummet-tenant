// test/generic-content-engine-remaining-gaps.test.js
//
// Covers the 7 items from the README "What's NOT built yet" list:
// SEO landing pages, sportsbook tracking URL, logo/hero media pickers,
// Editorial Pick picker, structured review content, admin pagination,
// and the full generic-review edit page (delete/author already existed,
// this adds the page + review-blocks wiring + /generic-review/get).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as contentItems from '../worker/database/content-items.js';
import * as landingPages from '../worker/database/content-landing-pages.js';
import * as comparisonsDb from '../worker/database/comparisons.js';
import * as customTypesDb from '../worker/database/custom-types.js';
import * as genericReviewsDb from '../worker/database/generic-reviews.js';
import { handleAffiliateRedirect } from '../worker/controllers.js';
import { renderContentLandingPage, handleContentTrackedRedirect } from '../worker/controllers.js';
import { handleAPI } from '../worker/api.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const makeReq = (method, url, body) => ({ method, url, headers: new Headers(), json: async () => body });
const admin = { user_id: 1, role: 'admin', email: 'a@test.com' };
const editor = { user_id: 2, role: 'editor', email: 'e@test.com' };
const viewer = { user_id: 3, role: 'viewer', email: 'v@test.com' };

async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT OR IGNORE INTO countries (code, name) VALUES ('US','United States')`).run();
  return { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
}
const pub = (db, slug, name, extra = {}) => contentItems.createContentItem(db, 'sportsbook', { slug, name, status: 'published', published: true, rating: 4, ...extra });
const allowUS = (db, id, type = 'sportsbook') => contentItems.setContentItemGeoRules(db, type, id, [{ country_code: 'US', status: 'allowed' }]);

describe('BUG FOUND: CONTENT_CLICK was missing from the event-type whitelist (logged nothing, no error)', () => {
  test('CONTENT_CLICK is now accepted and persisted', async () => {
    const db = createTestDb(); applyMigrations(db);
    const analytics = await import('../worker/database/analytics.js');
    await analytics.logEvent(db, { eventType: 'CONTENT_CLICK' }); // no contentItemId here -- this test is only about the whitelist, not the FK
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM analytics_events WHERE event_type = 'CONTENT_CLICK'`).first()).n, 1);
  });
  test('a genuinely unknown event type is still silently dropped (unchanged existing behavior)', async () => {
    const db = createTestDb(); applyMigrations(db);
    const analytics = await import('../worker/database/analytics.js');
    await analytics.logEvent(db, { eventType: 'NOT_A_REAL_EVENT_TYPE' });
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM analytics_events`).first()).n, 0);
  });
});

describe('migrations 0060/0061 are additive-only', () => {
  for (const file of ['0060_content_items_media_tracking.sql', '0061_content_landing_pages.sql']) {
    test(`${file}: no DROP TABLE/DROP COLUMN, DELETE FROM, UPDATE ... SET, or RENAME statements`, () => {
      // Matches actual destructive SQL *statements* only -- not the word
      // "update"/"delete" appearing as a permission action value (e.g.
      // INSERT INTO permissions (...) VALUES ('editor', ..., 'update', 1))
      // or as part of "ON DELETE CASCADE" (a standard FK clause, not a
      // destructive statement).
      const sql = readFileSync(join(ROOT, 'migrations', file), 'utf-8').replace(/--.*$/gm, '');
      assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN)\b/i);
      assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
      assert.doesNotMatch(sql, /\bUPDATE\s+\w+\s+SET\b/i);
      assert.doesNotMatch(sql, /\bRENAME\s+(TABLE|COLUMN)\b/i);
    });
  }
});

describe('content_items.tracking_url + logo/hero media ids (gaps #2, #5, #6)', () => {
  let db;
  beforeEach(async () => { db = (await mkEnv()).DB; });

  test('createContentItem persists tracking_url and media ids; updateContentItem changes them', async () => {
    await db.prepare(`INSERT INTO media_library (id, filename, url) VALUES (5, 'logo.png', 'https://cdn.example/logo.png'), (7, 'hero.png', 'https://cdn.example/hero.png')`).run();
    const item = await contentItems.createContentItem(db, 'sportsbook', { slug: 'a', name: 'A', trackingUrl: 'https://track.example/a', logoMediaId: 5, featuredImageMediaId: 7 });
    assert.equal(item.tracking_url, 'https://track.example/a');
    assert.equal(item.logo_media_id, 5);
    assert.equal(item.featured_image_media_id, 7);
    const updated = await contentItems.updateContentItem(db, 'sportsbook', 'a', { trackingUrl: 'https://track.example/b', logoMediaId: null });
    assert.equal(updated.tracking_url, 'https://track.example/b');
    assert.equal(updated.logo_media_id, null);
  });
});

describe('tracked sportsbook link: /en/go-content/{type}/{slug} (gap #2)', () => {
  let env;
  beforeEach(async () => { env = await mkEnv(); });

  test('redirects to tracking_url and logs CONTENT_CLICK with content_item_id', async () => {
    const item = await contentItems.createContentItem(env.DB, 'sportsbook', { slug: 'a', name: 'A', status: 'published', published: true, trackingUrl: 'https://track.example/a' });
    const res = await handleContentTrackedRedirect(new Request('https://site.test/en/go-content/sportsbook/a'), env, 'sportsbook', 'a', null);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), 'https://track.example/a');
    const row = await env.DB.prepare(`SELECT * FROM analytics_events WHERE event_type = 'CONTENT_CLICK' AND content_item_id = ?`).bind(item.id).first();
    assert.ok(row);
    assert.equal(JSON.parse(row.metadata).content_type, 'sportsbook');
  });

  test('falls back to website when tracking_url is not set', async () => {
    await contentItems.createContentItem(env.DB, 'sportsbook', { slug: 'a', name: 'A', status: 'published', published: true, website: 'https://site.example/a' });
    const res = await handleContentTrackedRedirect(new Request('https://site.test/en/go-content/sportsbook/a'), env, 'sportsbook', 'a', null);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), 'https://site.example/a');
  });

  test('404s for a draft item (no leak of a draft item\'s existence via the redirect)', async () => {
    await contentItems.createContentItem(env.DB, 'sportsbook', { slug: 'd', name: 'D', status: 'draft', published: false, trackingUrl: 'https://track.example/d' });
    const res = await handleContentTrackedRedirect(new Request('https://site.test/en/go-content/sportsbook/d'), env, 'sportsbook', 'd', null);
    assert.equal(res.status, 404);
  });

  test('404s when neither tracking_url nor website is set', async () => {
    await contentItems.createContentItem(env.DB, 'sportsbook', { slug: 'a', name: 'A', status: 'published', published: true });
    assert.equal((await handleContentTrackedRedirect(new Request('https://site.test/en/go-content/sportsbook/a'), env, 'sportsbook', 'a', null)).status, 404);
  });

  test('casino affiliate redirect (handleAffiliateRedirect) is untouched by this new route', async () => {
    await env.DB.prepare(`INSERT INTO casinos (slug, name, website_url, affiliate_url, published, status) VALUES ('c1','C1','https://c','https://c/aff',1,'published')`).run();
    const res = await handleAffiliateRedirect(new Request('https://site.test/en/go/c1'), env, 'c1', null);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), 'https://c/aff');
  });
});

describe('API: content-item create/update validate tracking_url and media ids (gaps #2, #5, #6)', () => {
  let db, call;
  beforeEach(async () => { db = (await mkEnv()).DB; call = (m, p, b, u = admin) => handleAPI(makeReq(m, `https://x.com${p}`, b), { DB: db }, p.split('?')[0], u); });

  test('create persists all three; get returns them', async () => {
    await db.prepare(`INSERT INTO media_library (id, filename, url) VALUES (3, 'logo.png', 'https://cdn.example/logo.png'), (4, 'hero.png', 'https://cdn.example/hero.png')`).run();
    await call('POST', '/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'a', name: 'A', tracking_url: 'https://t.example/a', logo_media_id: 3, featured_image_media_id: 4 });
    const g = await (await call('GET', '/api/v1/content-item/get?content_type=sportsbook&slug=a')).json();
    assert.equal(g.item.tracking_url, 'https://t.example/a');
    assert.equal(g.item.logo_media_id, 3);
    assert.equal(g.item.featured_image_media_id, 4);
  });

  test('a javascript: tracking_url is rejected with 400 and nothing is written', async () => {
    const res = await call('POST', '/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'a', name: 'A', tracking_url: 'javascript:alert(1)' });
    assert.equal(res.status, 400);
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM content_items WHERE slug = 'a'`).first()).n, 0);
  });

  test('a non-integer logo_media_id is rejected with 400', async () => {
    const res = await call('POST', '/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'a', name: 'A', logo_media_id: 'not-a-number' });
    assert.equal(res.status, 400);
  });

  test('update: omitted fields leave existing values untouched', async () => {
    await call('POST', '/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'a', name: 'A', tracking_url: 'https://t.example/a' });
    await call('POST', '/api/v1/content-item/update', { content_type: 'sportsbook', slug: 'a', name: 'A Renamed' });
    const g = await (await call('GET', '/api/v1/content-item/get?content_type=sportsbook&slug=a')).json();
    assert.equal(g.item.tracking_url, 'https://t.example/a');
  });

  test('update: explicit null clears tracking_url and media ids', async () => {
    await db.prepare(`INSERT INTO media_library (id, filename, url) VALUES (3, 'logo.png', 'https://cdn.example/logo.png')`).run();
    await call('POST', '/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'a', name: 'A', tracking_url: 'https://t.example/a', logo_media_id: 3 });
    await call('POST', '/api/v1/content-item/update', { content_type: 'sportsbook', slug: 'a', tracking_url: null, logo_media_id: null });
    const g = await (await call('GET', '/api/v1/content-item/get?content_type=sportsbook&slug=a')).json();
    assert.equal(g.item.tracking_url, null);
    assert.equal(g.item.logo_media_id, null);
  });
});

describe('content-landing-pages.js DB module (gap #1)', () => {
  let db;
  beforeEach(async () => { db = (await mkEnv()).DB; });

  test('create/get/update/delete round-trip', async () => {
    const page = await landingPages.createLandingPage(db, { contentType: 'sportsbook', slug: 'top-10', title: 'Top 10', itemMode: 'manual', status: 'draft' });
    assert.ok(page.id);
    const updated = await landingPages.updateLandingPage(db, 'top-10', { title: 'Top Ten', status: 'published' });
    assert.equal(updated.title, 'Top Ten');
    assert.ok(updated.published_at);
    await landingPages.deleteLandingPage(db, 'top-10');
    assert.equal(await landingPages.getLandingPage(db, 'top-10'), null);
  });

  test('setLandingPageItems replaces the full ordered set', async () => {
    const page = await landingPages.createLandingPage(db, { contentType: 'sportsbook', slug: 'p', title: 'P', itemMode: 'manual' });
    await landingPages.setLandingPageItems(db, page.id, [3, 1, 2]);
    assert.deepEqual(await landingPages.getLandingPageItemIds(db, page.id), [3, 1, 2]);
    await landingPages.setLandingPageItems(db, page.id, [9]);
    assert.deepEqual(await landingPages.getLandingPageItemIds(db, page.id), [9]);
  });

  test('getPublishedLandingPage is gated on status; getLandingPage is not', async () => {
    await landingPages.createLandingPage(db, { contentType: 'sportsbook', slug: 'd', title: 'D', status: 'draft' });
    assert.ok(await landingPages.getLandingPage(db, 'd'));
    assert.equal(await landingPages.getPublishedLandingPage(db, 'd'), null);
  });

  test('RBAC rows exist for content_landing_pages (editor: no delete; admin: full)', async () => {
    const rows = (await db.prepare(`SELECT * FROM permissions WHERE resource = 'content_landing_pages'`).all()).results;
    const editorDelete = rows.find(r => r.role === 'editor' && r.action === 'delete');
    const adminDelete = rows.find(r => r.role === 'admin' && r.action === 'delete');
    assert.equal(editorDelete.allowed, 0);
    assert.equal(adminDelete.allowed, 1);
  });
});

describe('renderContentLandingPage (gap #1)', () => {
  let env;
  beforeEach(async () => { env = await mkEnv(); });

  test('manual mode renders selected items in order, skips an unpublished one', async () => {
    const a = await pub(env.DB, 'a', 'AaaUnique'); const b = await pub(env.DB, 'b', 'BbbUnique');
    const draft = await contentItems.createContentItem(env.DB, 'sportsbook', { slug: 'd', name: 'DddUnique', status: 'draft', published: false });
    for (const i of [a, b, draft]) await allowUS(env.DB, i.id);
    const page = await landingPages.createLandingPage(env.DB, { contentType: 'sportsbook', slug: 'manual-page', title: 'Manual', itemMode: 'manual', status: 'published' });
    await landingPages.setLandingPageItems(env.DB, page.id, [b.id, a.id, draft.id]);
    const html = await (await renderContentLandingPage(new Request('https://s.test/en/best/manual-page?geo=US'), env, 'manual-page')).text();
    assert.ok(html.indexOf('BbbUnique') < html.indexOf('AaaUnique'), 'manual order preserved');
    assert.ok(!html.includes('DddUnique'), 'unpublished item must not render');
  });

  test('auto mode ranks featured + rating and respects auto_limit', async () => {
    const low = await pub(env.DB, 'low', 'LowUnique', { rating: 1 });
    const high = await pub(env.DB, 'high', 'HighUnique', { rating: 5 });
    for (const i of [low, high]) await allowUS(env.DB, i.id);
    const page = await landingPages.createLandingPage(env.DB, { contentType: 'sportsbook', slug: 'auto-page', title: 'Auto', itemMode: 'auto', autoLimit: 1, status: 'published' });
    const html = await (await renderContentLandingPage(new Request('https://s.test/en/best/auto-page?geo=US'), env, 'auto-page')).text();
    assert.ok(html.includes('HighUnique'));
    assert.ok(!html.includes('LowUnique'), 'auto_limit=1 must exclude the lower-ranked item');
  });

  test('a draft landing page 404s at its own public URL', async () => {
    await landingPages.createLandingPage(env.DB, { contentType: 'sportsbook', slug: 'draft-page', title: 'Draft', status: 'draft' });
    assert.equal((await renderContentLandingPage(new Request('https://s.test/en/best/draft-page'), env, 'draft-page')).status, 404);
  });

  test('a GEO-ineligible item is excluded even if manually selected', async () => {
    const item = await pub(env.DB, 'blocked', 'BlockedUnique');
    // no GEO rule at all -> blocked everywhere (documented default)
    const page = await landingPages.createLandingPage(env.DB, { contentType: 'sportsbook', slug: 'geo-page', title: 'Geo', itemMode: 'manual', status: 'published' });
    await landingPages.setLandingPageItems(env.DB, page.id, [item.id]);
    const html = await (await renderContentLandingPage(new Request('https://s.test/en/best/geo-page?geo=US'), env, 'geo-page')).text();
    assert.ok(!html.includes('BlockedUnique'));
  });
});

describe('API: content-landing-page CRUD + RBAC (gap #1)', () => {
  let db, call;
  beforeEach(async () => { db = (await mkEnv()).DB; call = (m, p, b, u = admin) => handleAPI(makeReq(m, `https://x.com${p}`, b), { DB: db }, p.split('?')[0], u); });

  test('create requires custom_type_slug when content_type is custom', async () => {
    const res = await call('POST', '/api/v1/content-landing-page/create', { content_type: 'custom', slug: 'p', title: 'P' });
    assert.equal(res.status, 400);
  });

  test('create rejects a bad item_mode', async () => {
    const res = await call('POST', '/api/v1/content-landing-page/create', { content_type: 'sportsbook', slug: 'p', title: 'P', item_mode: 'bogus' });
    assert.equal(res.status, 400);
  });

  test('create -> update items -> get round trip', async () => {
    await call('POST', '/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'a', name: 'A' });
    const a = (await (await call('GET', '/api/v1/content-item/get?content_type=sportsbook&slug=a')).json()).item;
    await call('POST', '/api/v1/content-landing-page/create', { content_type: 'sportsbook', slug: 'p', title: 'P', item_mode: 'manual', item_ids: [a.id] });
    const g = await (await call('GET', '/api/v1/content-landing-page/get?slug=p')).json();
    assert.deepEqual(g.item_ids, [a.id]);
  });

  test('editor can create/update but delete is refused (role-level, same as content_items)', async () => {
    const create = await call('POST', '/api/v1/content-landing-page/create', { content_type: 'sportsbook', slug: 'p', title: 'P' }, editor);
    assert.equal(create.status, 200);
    const del = await call('POST', '/api/v1/content-landing-page/delete', { slug: 'p' }, editor);
    assert.equal(del.status, 403);
  });

  test('viewer (no permission rows) is rejected on list/get (previously would have been ungated)', async () => {
    assert.equal((await call('GET', '/api/v1/content-landing-pages/list', null, viewer)).status, 403);
    await call('POST', '/api/v1/content-landing-page/create', { content_type: 'sportsbook', slug: 'p', title: 'P' });
    assert.equal((await call('GET', '/api/v1/content-landing-page/get?slug=p', null, viewer)).status, 403);
  });

  test('delete removes the page and its item rows', async () => {
    await call('POST', '/api/v1/content-landing-page/create', { content_type: 'sportsbook', slug: 'p', title: 'P' });
    const del = await call('POST', '/api/v1/content-landing-page/delete', { slug: 'p' });
    assert.equal(del.status, 200);
    assert.equal(await landingPages.getLandingPage(db, 'p'), null);
  });
});

describe('structured review content via /api/v1/review-blocks/sync (gap #14, reused as-is)', () => {
  let db, call;
  beforeEach(async () => {
    db = (await mkEnv()).DB;
    call = (m, p, b, u = admin) => handleAPI(makeReq(m, `https://x.com${p}`, b), { DB: db }, p.split('?')[0], u);
  });

  test('a generic review can have blocks synced and listed by its slug', async () => {
    const sb = await pub(db, 'sb', 'SB');
    const created = await (await call('POST', '/api/v1/generic-review/create', { reviewed_content_type: 'sportsbook', reviewed_content_id: sb.id, slug: 'sb-review', title: 'T', content: 'C' })).json();
    await call('POST', '/api/v1/review-blocks/sync', { review_slug: 'sb-review', blocks: [{ title: 'Pros', content: 'Fast payouts' }, { title: 'Cons', content: 'High vig' }] });
    const list = await (await call('GET', '/api/v1/review-blocks/list?review_slug=sb-review')).json();
    assert.equal(list.blocks.length, 2);
    assert.equal(list.blocks[0].title, 'Pros');
  });
});

describe('API: generic-review/get (new, backs the full edit page -- gap #3/#7)', () => {
  let db, call, casinoReviewId;
  beforeEach(async () => {
    db = (await mkEnv()).DB;
    call = (m, p, b, u = admin) => handleAPI(makeReq(m, `https://x.com${p}`, b), { DB: db }, p.split('?')[0], u);
    await db.prepare(`INSERT INTO casinos (slug, name, website_url, affiliate_url, published, status) VALUES ('c1','C1','https://c','https://c/a',1,'published')`).run();
    casinoReviewId = (await db.prepare(`INSERT INTO reviews (casino_slug, slug, title, content, published) VALUES ('c1','c1-review','Casino Review','body',1) RETURNING id`).first()).id;
  });

  test('returns a generic review by id', async () => {
    const sb = await pub(db, 'sb', 'SB');
    const r = await (await call('POST', '/api/v1/generic-review/create', { reviewed_content_type: 'sportsbook', reviewed_content_id: sb.id, slug: 'r', title: 'T', content: 'C' })).json();
    const g = await (await call('GET', `/api/v1/generic-review/get?id=${r.review.id}`)).json();
    assert.equal(g.review.title, 'T');
  });

  test('a casino review id is a 404 here (generic-only, consistent with update/delete)', async () => {
    const res = await call('GET', `/api/v1/generic-review/get?id=${casinoReviewId}`);
    assert.equal(res.status, 404);
  });

  test('viewer (no reviews permission) is rejected', async () => {
    const sb = await pub(db, 'sb', 'SB');
    const r = await (await call('POST', '/api/v1/generic-review/create', { reviewed_content_type: 'sportsbook', reviewed_content_id: sb.id, slug: 'r', title: 'T', content: 'C' })).json();
    assert.equal((await call('GET', `/api/v1/generic-review/get?id=${r.review.id}`, null, viewer)).status, 403);
  });
});

describe('admin list pagination (gap #15)', () => {
  let db, call;
  beforeEach(async () => {
    db = (await mkEnv()).DB;
    call = (m, p, b, u = admin) => handleAPI(makeReq(m, `https://x.com${p}`, b), { DB: db }, p.split('?')[0], u);
    for (let i = 0; i < 5; i++) await call('POST', '/api/v1/content-item/create', { content_type: 'sportsbook', slug: `sb-${i}`, name: `SB ${i}` });
  });

  test('content-items/list: no page param = unbounded, unchanged response shape (no `total` key)', async () => {
    const data = await (await call('GET', '/api/v1/content-items/list?content_type=sportsbook')).json();
    assert.equal(data.items.length, 5);
    assert.equal('total' in data, false);
  });

  test('content-items/list: page=1&per_page=2 returns 2 items and the real total', async () => {
    const data = await (await call('GET', '/api/v1/content-items/list?content_type=sportsbook&page=1&per_page=2')).json();
    assert.equal(data.items.length, 2);
    assert.equal(data.total, 5);
    assert.equal(data.page, 1);
  });

  test('page=2&per_page=2 returns the next 2, no overlap with page 1', async () => {
    const p1 = await (await call('GET', '/api/v1/content-items/list?content_type=sportsbook&page=1&per_page=2')).json();
    const p2 = await (await call('GET', '/api/v1/content-items/list?content_type=sportsbook&page=2&per_page=2')).json();
    const slugs1 = p1.items.map(i => i.slug); const slugs2 = p2.items.map(i => i.slug);
    assert.equal(slugs1.some(s => slugs2.includes(s)), false);
  });

  test('getAllComparisons/getAllCustomContentTypes/getGenericReviewsForType: no limit = plain array (existing callers unaffected)', async () => {
    assert.ok(Array.isArray(await comparisonsDb.getAllComparisons(db, 'sportsbook')));
    assert.ok(Array.isArray(await customTypesDb.getAllCustomContentTypes(db)));
    assert.ok(Array.isArray(await genericReviewsDb.getGenericReviewsForType(db, 'sportsbook')));
  });

  test('getAllCustomContentTypes with limit returns {items, total}', async () => {
    await customTypesDb.createCustomContentType(db, { slug: 't1', label: 'T1', pluralLabel: 'T1s' }, () => false);
    const result = await customTypesDb.getAllCustomContentTypes(db, { limit: 1, offset: 0 });
    assert.equal(result.items.length, 1);
    assert.equal(result.total, 1);
  });
});

describe('Editorial Pick picker: UI wiring (gap #8 -- backend unchanged, same editorial_selection_item_id field)', () => {
  test('comparison-create.html and comparison-edit.html no longer have a raw number input for it', () => {
    for (const f of ['templates/pages/admin/comparison-create.html', 'templates/pages/admin/comparison-edit.html']) {
      const t = read(f);
      assert.ok(!/<input type="number" name="editorial_selection_item_id">/.test(t), f);
      assert.match(t, /id="editorialPickSearchInput"/, f);
      assert.match(t, /id="editorialPickItemId"/, f);
    }
  });
  test('dashboard.js defines the single-select picker', () => {
    assert.match(read('static/js/dashboard.js'), /function initEditorialPickPicker\b/);
  });

  test('end-to-end: editorial pick still saves correctly through the real API (hidden input is what gets submitted)', async () => {
    const db = createTestDb(); applyMigrations(db);
    const call = (m, p, b) => handleAPI(makeReq(m, `https://x.com${p}`, b), { DB: db }, p.split('?')[0], admin);
    await db.prepare(`INSERT INTO content_items (content_type, slug, name, status, published) VALUES ('sportsbook', 'a', 'A', 'published', 1), ('sportsbook', 'b', 'B', 'published', 1)`).run();
    const rows = (await db.prepare(`SELECT id, slug FROM content_items ORDER BY slug`).all()).results;
    const a = rows.find(r => r.slug === 'a').id, b = rows.find(r => r.slug === 'b').id;
    const res = await call('POST', '/api/v1/comparison/create', {
      content_type: 'sportsbook', slug: 'cmp', title: 'Cmp',
      items: [{ item_content_type: 'sportsbook', item_id: a }, { item_content_type: 'sportsbook', item_id: b }],
      editorial_selection_item_type: 'sportsbook', editorial_selection_item_id: a,
    });
    const data = await res.json();
    assert.equal(data.comparison.editorial_selection_item_id, a);
  });
});

describe('admin UI wiring smoke tests', () => {
  test('media picker: both content-item forms have the expected elements and dashboard.js defines the handlers', () => {
    for (const f of ['templates/pages/admin/content-item-create.html', 'templates/pages/admin/content-item-edit.html']) {
      const t = read(f);
      assert.match(t, /id="logoMediaId"/, f);
      assert.match(t, /id="heroMediaId"/, f);
      assert.match(t, /name="tracking_url"/, f);
    }
    const js = read('static/js/dashboard.js');
    assert.match(js, /function openContentItemMediaPicker\b/);
    assert.match(js, /function setContentItemMedia\b/);
  });

  test('generic-review-edit.html exists with the blocks editor and delete button', () => {
    const t = read('templates/pages/admin/generic-review-edit.html');
    assert.match(t, /id="reviewBlockRows"/);
    assert.match(t, /id="deleteGenericReviewBtn"/);
    assert.match(t, /id="genericReviewEditAuthorSelect"/);
  });

  test('content-landing-pages admin templates exist', () => {
    for (const f of ['content-landing-pages.html', 'content-landing-page-create.html', 'content-landing-page-edit.html']) {
      assert.ok(existsSync(join(ROOT, 'templates/pages/admin', f)), f);
    }
  });

  test('routing: the 7 new routes resolve to the right dispatch types', async () => {
    const { getRoute } = await import('../worker/routes.js');
    const route = (p) => getRoute({ url: `https://example.com${p}` });
    assert.deepEqual(route('/en/best/top-10'), { type: 'contentLandingPage', slug: 'top-10' });
    assert.deepEqual(route('/en/go-content/sportsbook/bet365'), { type: 'goContent', contentType: 'sportsbook', slug: 'bet365' });
    assert.deepEqual(route('/en/dashboard/generic-review/edit/5'), { type: 'dashboardGenericReviewEdit', id: 5 });
    assert.deepEqual(route('/en/dashboard/content-landing-pages'), { type: 'dashboardContentLandingPages' });
    assert.deepEqual(route('/en/dashboard/content-landing-page/create'), { type: 'dashboardContentLandingPageCreate' });
    assert.deepEqual(route('/en/dashboard/content-landing-page/edit/top-10'), { type: 'dashboardContentLandingPageEdit', slug: 'top-10' });
  });
});
