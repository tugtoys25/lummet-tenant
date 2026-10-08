import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import * as contentItems from '../worker/database/content-items.js';
import * as genericReviews from '../worker/database/generic-reviews.js';
import * as customTypes from '../worker/database/custom-types.js';
import { renderSportsbook, renderAffiliatePartner, renderCustom } from '../worker/controllers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
async function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  await db.prepare(`INSERT OR IGNORE INTO countries (code, name) VALUES ('US','United States')`).run();
  return { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
}
const mk = (db, type, slug, extra = {}) => contentItems.createContentItem(db, type, { slug, name: slug, status: 'published', published: true, rating: 4, ...extra });
const rev = (db, type, id, slug, extra = {}) => genericReviews.createGenericReview(db, { reviewedContentType: type, reviewedContentId: id, slug, title: `Title ${slug}`, content: '<p>Body <b>text</b> here</p>', rating: 4.5, published: true, ...extra });

describe('detail pages list the reviews connected to the item', () => {
  let env, db;
  beforeEach(async () => { env = await mkEnv(); db = env.DB; });

  test('sportsbook: published connected reviews listed with the right link; others excluded', async () => {
    const a = await mk(db, 'sportsbook', 'book-a');
    const b = await mk(db, 'sportsbook', 'book-b');
    await rev(db, 'sportsbook', a.id, 'rev-a');
    await rev(db, 'sportsbook', a.id, 'rev-a-draft', { published: false });
    await rev(db, 'sportsbook', b.id, 'rev-b');
    const html = await (await renderSportsbook(new Request('https://site.test/en/sportsbook/book-a?geo=US'), env, 'book-a', null)).text();
    assert.match(html, /href="\/en\/sportsbook\/review\/rev-a"/);
    assert.match(html, /Title rev-a/);
    assert.doesNotMatch(html, /rev-a-draft/);
    assert.doesNotMatch(html, /rev-b/);
    assert.doesNotMatch(html, /Loading reviews/);
    assert.doesNotMatch(html, /<b>text<\/b>/);
  });

  test('casino review that happens to share the numeric id is never listed', async () => {
    const a = await mk(db, 'sportsbook', 'book-a');
    await db.prepare(`INSERT INTO reviews (casino_slug, slug, title, content, published, reviewed_content_type, reviewed_content_id) VALUES ('some-casino','casino-rev','Casino Rev','x',1,'casino',?)`).bind(a.id).run();
    const html = await (await renderSportsbook(new Request('https://site.test/en/sportsbook/book-a?geo=US'), env, 'book-a', null)).text();
    assert.doesNotMatch(html, /casino-rev/);
    assert.match(html, /No reviews yet/);
  });

  test('item with no reviews shows the empty state', async () => {
    await mk(db, 'sportsbook', 'book-a');
    const html = await (await renderSportsbook(new Request('https://site.test/en/sportsbook/book-a?geo=US'), env, 'book-a', null)).text();
    assert.match(html, /No reviews yet/);
  });

  test('review title is HTML-escaped', async () => {
    const a = await mk(db, 'sportsbook', 'book-a');
    await rev(db, 'sportsbook', a.id, 'xss', { title: '<script>alert(1)</script>' });
    const html = await (await renderSportsbook(new Request('https://site.test/en/sportsbook/book-a?geo=US'), env, 'book-a', null)).text();
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;/);
  });

  test('affiliate_partner links to /en/affiliate-partner/review/:slug', async () => {
    const a = await mk(db, 'affiliate_partner', 'net-a');
    await rev(db, 'affiliate_partner', a.id, 'net-rev');
    const html = await (await renderAffiliatePartner(new Request('https://site.test/en/affiliate-partner/net-a?geo=US'), env, 'net-a', null)).text();
    assert.match(html, /href="\/en\/affiliate-partner\/review\/net-rev"/);
  });

  test('custom links to /en/custom/:type/review/:slug', async () => {
    await customTypes.createCustomContentType(db, { slug: 'pp', label: 'PP', pluralLabel: 'PPs' }, () => false);
    const a = await mk(db, 'custom', 'pay-a', { customTypeSlug: 'pp' });
    await rev(db, 'custom', a.id, 'pay-rev');
    const html = await (await renderCustom(new Request('https://site.test/en/custom/pp/pay-a?geo=US'), env, 'pp', 'pay-a', null)).text();
    assert.match(html, /href="\/en\/custom\/pp\/review\/pay-rev"/);
  });
});
