// test/generic-content-engine-api.test.js
//
// Route matching (pure function) plus the real handleAPI() router --
// same pattern as the rest of this suite (e.g. postback.test.js calling
// real handlers), exercising actual RBAC permission checks rather than
// re-testing the database layer a second time.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { getRoute } from '../worker/routes.js';
import { handleAPI } from '../worker/api.js';

function route(path) {
  return getRoute({ url: `https://example.com${path}` });
}

function makeReq(method, url, body) {
  return { method, url, headers: new Headers(), json: async () => body };
}

describe('routes.js — generic content engine routes coexist with every pre-existing route', () => {
  test('new routes match correctly', () => {
    assert.deepEqual(route('/en/sportsbook/bet365-sport'), { type: 'sportsbook', slug: 'bet365-sport' });
    assert.deepEqual(route('/en/affiliate-partner/network-x'), { type: 'affiliatePartner', slug: 'network-x' });
    assert.deepEqual(route('/en/custom/payment-provider/stripe'), { type: 'custom', typeSlug: 'payment-provider', slug: 'stripe' });
    assert.deepEqual(route('/en/custom/payment-provider/review/stripe'), { type: 'customReview', typeSlug: 'payment-provider', slug: 'stripe' });
    assert.deepEqual(route('/en/compare/casino/a-vs-b'), { type: 'comparison', compareType: 'casino', slug: 'a-vs-b' });
  });

  test('the pre-existing /en/affiliate/{slug} marketing route is unaffected by the new /en/affiliate-partner/{slug} route', () => {
    assert.deepEqual(route('/en/affiliate/become-affiliate'), { type: 'affiliate', slug: 'become-affiliate' });
  });

  test('pre-existing casino/review routes are unaffected', () => {
    assert.deepEqual(route('/en/casino/bcgame'), { type: 'casino', slug: 'bcgame' });
    assert.deepEqual(route('/en/review/bcgame'), { type: 'review', slug: 'bcgame' });
  });
});

describe('api.js — real handleAPI() RBAC for the new content-engine endpoints', () => {
  let db;
  beforeEach(() => {
    db = createTestDb();
    applyMigrations(db);
  });

  const admin = { user_id: 1, role: 'admin', email: 'admin@test.com' };
  const editor = { user_id: 2, role: 'editor', email: 'editor@test.com' };
  const viewer = { user_id: 3, role: 'viewer', email: 'viewer@test.com' }; // no permission rows for content_items at all

  test('an editor (has content_items:create permission from the migration) can create a sportsbook item', async () => {
    const res = await handleAPI(
      makeReq('POST', 'https://x.com/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'bet365-sport', name: 'Bet365 Sportsbook' }),
      { DB: db }, '/api/v1/content-item/create', editor
    );
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
  });

  test('a role with no content_items permission rows is rejected with 403 by the real permission check', async () => {
    const res = await handleAPI(
      makeReq('POST', 'https://x.com/api/v1/content-item/create', { content_type: 'sportsbook', slug: 'other', name: 'Other' }),
      { DB: db }, '/api/v1/content-item/create', viewer
    );
    const data = await res.json();
    assert.equal(res.status, 403);
    assert.equal(data.success, false);
  });

  test('an invalid content_type is rejected with 400, not silently accepted', async () => {
    const res = await handleAPI(
      makeReq('POST', 'https://x.com/api/v1/content-item/create', { content_type: 'not-a-real-type', slug: 'x', name: 'X' }),
      { DB: db }, '/api/v1/content-item/create', admin
    );
    assert.equal(res.status, 400);
  });

  test('a comparison with fewer than 2 items is rejected before touching the database', async () => {
    const res = await handleAPI(
      makeReq('POST', 'https://x.com/api/v1/comparison/create', {
        content_type: 'sportsbook', slug: 'solo', title: 'Solo', items: [{ item_content_type: 'sportsbook', item_id: 1 }],
      }),
      { DB: db }, '/api/v1/comparison/create', admin
    );
    assert.equal(res.status, 400);
  });

  test('creating a custom type with a reserved slug is rejected by the API layer', async () => {
    const res = await handleAPI(
      makeReq('POST', 'https://x.com/api/v1/custom-type/create', { slug: 'casino', label: 'X', plural_label: 'Xs' }),
      { DB: db }, '/api/v1/custom-type/create', admin
    );
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /reserved/i);
  });

  test('the pre-existing /api/v1/casinos/list endpoint, on the same shared handleAPI(), is unaffected', async () => {
    await db.prepare(`INSERT INTO casinos (slug, name, website_url, affiliate_url, status, published) VALUES ('bcgame', 'BC.Game', 'https://bc.game', 'https://bc.game/aff', 'published', 1)`).run();
    const res = await handleAPI(makeReq('GET', 'https://x.com/api/v1/casinos/list'), { DB: db }, '/api/v1/casinos/list', admin);
    const data = await res.json();
    assert.equal(data.casinos.length, 1);
    assert.equal(data.casinos[0].slug, 'bcgame');
  });
});
