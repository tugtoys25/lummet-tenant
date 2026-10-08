// test/generic-content-engine-audit-fixes.test.js
// Items from docs/generic-content-engine/GENERIC-CONTENT-ENGINE-GAPS-AND-BUGS.md:
//  #3 generic-review delete + Actions column, #12 author on generic reviews,
//  #4 View link on content items, #16 license shown on the public sportsbook page.
// Also covers a bug found while doing #3: /generic-review/update accepted a CASINO
// review's id and edited it through the wrong endpoint.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as contentItems from '../worker/database/content-items.js';
import * as genericReviews from '../worker/database/generic-reviews.js';
import { renderSportsbook } from '../worker/controllers.js';
import { handleAPI } from '../worker/api.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const makeReq = (method, url, body) => ({ method, url, headers: new Headers(), json: async () => body });
const admin = { user_id: 1, role: 'admin', email: 'a@test.com' };
const editor = { user_id: 2, role: 'editor', email: 'e@test.com' };
const viewer = { user_id: 3, role: 'viewer', email: 'v@test.com' };

describe('generic reviews: delete / update are generic-only (never touch a casino review)', () => {
  let db, call, sb, casinoReviewId;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db);
    call = (m, p, b, u = admin) => handleAPI(makeReq(m, `https://x.com${p}`, b), { DB: db }, p.split('?')[0], u);
    sb = await contentItems.createContentItem(db, 'sportsbook', { slug: 'sb', name: 'SB', status: 'published', published: true });
    await db.prepare(`INSERT INTO casinos (slug, name, website_url, affiliate_url, published, status) VALUES ('c1','C1','https://c','https://c/a',1,'published')`).run();
    casinoReviewId = (await db.prepare(`INSERT INTO reviews (casino_slug, slug, title, content, published) VALUES ('c1','c1-review','Casino Review','body',1) RETURNING id`).first()).id;
  });
  const mk = async (slug = 'r1') => (await (await call('POST', '/api/v1/generic-review/create', { reviewed_content_type: 'sportsbook', reviewed_content_id: sb.id, slug, title: 'T', content: 'C' })).json()).review;

  test('delete removes a generic review', async () => {
    const r = await mk();
    const res = await call('POST', '/api/v1/generic-review/delete', { id: r.id });
    assert.equal(res.status, 200);
    assert.equal(await genericReviews.getGenericReview(db, r.id), null);
  });

  test('delete of a CASINO review id is a 404 and the casino review survives', async () => {
    const res = await call('POST', '/api/v1/generic-review/delete', { id: casinoReviewId });
    assert.equal(res.status, 404);
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM reviews WHERE id = ?`).bind(casinoReviewId).first()).n, 1);
  });

  test('BUG FIX: update via the generic endpoint no longer edits a casino review', async () => {
    const res = await call('POST', '/api/v1/generic-review/update', { id: casinoReviewId, title: 'HIJACKED' });
    assert.equal(res.status, 404);
    assert.equal((await db.prepare(`SELECT title FROM reviews WHERE id = ?`).bind(casinoReviewId).first()).title, 'Casino Review');
  });

  test('DB-level guard holds even if the API layer is bypassed', async () => {
    assert.equal(await genericReviews.updateGenericReview(db, casinoReviewId, { title: 'X' }), null);
    await genericReviews.deleteGenericReview(db, casinoReviewId);
    assert.equal((await db.prepare(`SELECT COUNT(*) n FROM reviews WHERE id = ?`).bind(casinoReviewId).first()).n, 1);
  });

  test('admin listing never returns casino reviews, even when asked for type=casino', async () => {
    const res = await (await call('GET', '/api/v1/generic-reviews/list?reviewed_content_type=casino')).json();
    assert.equal(res.reviews.length, 0);
  });

  test('a role with no reviews permission gets 403 on delete and on the (previously ungated) list', async () => {
    const r = await mk();
    assert.equal((await call('POST', '/api/v1/generic-review/delete', { id: r.id }, viewer)).status, 403);
    assert.equal((await call('GET', '/api/v1/generic-reviews/list?reviewed_content_type=sportsbook', null, viewer)).status, 403);
  });

  test('delete of a nonexistent review is 404', async () => {
    assert.equal((await call('POST', '/api/v1/generic-review/delete', { id: 999999 })).status, 404);
  });

  test('author_id can be set on create and changed on update (gap #12)', async () => {
    const a = (await db.prepare(`INSERT INTO authors (name, slug) VALUES ('Ann','ann') RETURNING id`).first()).id;
    const r = await mk();
    const upd = await (await call('POST', '/api/v1/generic-review/update', { id: r.id, author_id: a })).json();
    assert.equal(upd.review.author_id, a);
  });

  test('audit log records the delete (real assertion against audit_logs)', async () => {
    const r = await mk();
    await call('POST', '/api/v1/generic-review/delete', { id: r.id });
    const row = await db.prepare(`SELECT * FROM audit_logs WHERE action = 'delete' AND entity_type = 'review' AND entity_id = ?`).bind(String(r.id)).first();
    assert.ok(row, 'a delete audit row must exist');
    assert.equal(JSON.parse(row.metadata).reviewed_content_type, 'sportsbook');
  });
});

describe('license is shown on the public sportsbook page (gap #16)', () => {
  const mkEnv = () => { const db = createTestDb(); applyMigrations(db); return { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } }; };
  test('license + country render; a hostile license value is escaped', async () => {
    const env = mkEnv();
    await contentItems.createContentItem(env.DB, 'sportsbook', { slug: 'lic', name: 'Lic', status: 'published', published: true, license: 'Malta MGA', licenseCountry: 'MT' });
    await contentItems.createContentItem(env.DB, 'sportsbook', { slug: 'xss', name: 'Xss', status: 'published', published: true, license: '<script>alert(1)</script>' });
    const ok = await (await renderSportsbook(new Request('https://s.test/en/sportsbook/lic'), env, 'lic', null)).text();
    assert.match(ok, /Malta MGA \(MT\)/);
    const bad = await (await renderSportsbook(new Request('https://s.test/en/sportsbook/xss'), env, 'xss', null)).text();
    assert.ok(!bad.includes('<script>alert(1)</script>'));
    assert.ok(bad.includes('&lt;script&gt;'));
  });
  test('no license -> no License row', async () => {
    const env = mkEnv();
    await contentItems.createContentItem(env.DB, 'sportsbook', { slug: 'nolic', name: 'NoLic', status: 'published', published: true });
    assert.ok(!(await (await renderSportsbook(new Request('https://s.test/en/sportsbook/nolic'), env, 'nolic', null)).text()).includes('<dt>License</dt>'));
  });
});

describe('admin UI wiring (gaps #3, #4, #12)', () => {
  test('generic-reviews list renders View/Publish/Delete and escapes title/slug', () => {
    const js = read('static/js/dashboard.js');
    assert.match(js, /function deleteGenericReview\b/);
    assert.match(js, /function toggleGenericReviewPublished\b/);
    assert.match(js, /escapeHtmlClient\(r\.title\)/);
    assert.ok(!/<td class="table-actions"><\/td>/.test(js), 'the empty Actions cell must be gone');
  });
  test('content items list has a View link only for live items, per-type URLs', () => {
    const js = read('static/js/dashboard.js');
    assert.match(js, /function contentItemPublicUrl\b/);
    assert.match(js, /isLive \? `<a href="\$\{contentItemPublicUrl\(i\)\}"/);
    assert.match(js, /\/en\/affiliate-partner\/\$\{slug\}/);
  });
  test('author select exists on the create form and is populated by author-admin.js', () => {
    assert.match(read('templates/pages/admin/generic-review-create.html'), /id="genericReviewAuthorSelect"/);
    assert.match(read('static/js/author-admin.js'), /"genericReviewAuthorSelect"/);
  });
});
