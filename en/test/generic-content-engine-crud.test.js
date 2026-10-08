// test/generic-content-engine-crud.test.js
//
// Covers the production-readiness pass: Update endpoints for content
// items/custom types/comparisons, the content-type-enablement
// settings endpoint (admin-only), and generic review create/update
// (including the casino_slug sentinel workaround documented in
// database/generic-reviews.js). All against the REAL handleAPI()
// router, same posture as generic-content-engine-api.test.js.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { handleAPI } from '../worker/api.js';
import { clearContentTypeEnablementCache } from '../worker/content-types.js';

function makeReq(method, url, body) {
  return { method, url, headers: new Headers(), json: async () => body };
}

const admin = { user_id: 1, role: 'admin', email: 'admin@test.com' };
const editor = { user_id: 2, role: 'editor', email: 'editor@test.com' };

describe('content-item update', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/create', {
      content_type: 'sportsbook', slug: 'bet365-sport', name: 'Bet365', rating: 4.0, status: 'draft',
    }), { DB: db }, '/api/v1/content-item/create', admin);
  });

  test('a partial update changes only the sent fields, leaves everything else untouched', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/update', {
      content_type: 'sportsbook', slug: 'bet365-sport', rating: 4.8,
    }), { DB: db }, '/api/v1/content-item/update', admin);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.item.rating, 4.8);
    assert.equal(data.item.name, 'Bet365'); // untouched
    assert.equal(data.item.status, 'draft'); // untouched
  });

  test('updating a nonexistent item returns 404, not a silent no-op', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/update', {
      content_type: 'sportsbook', slug: 'does-not-exist', name: 'X',
    }), { DB: db }, '/api/v1/content-item/update', admin);
    assert.equal(res.status, 404);
  });

  test('an editor with content_items:update permission can update', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/update', {
      content_type: 'sportsbook', slug: 'bet365-sport', name: 'Bet365 Updated',
    }), { DB: db }, '/api/v1/content-item/update', editor);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.item.name, 'Bet365 Updated');
  });

  test('custom field values round-trip through the update endpoint for a custom item', async () => {
    await db.prepare(`INSERT INTO custom_content_types (slug, label, plural_label) VALUES ('payment-provider', 'Payment Provider', 'Payment Providers')`).run();
    await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/create', {
      content_type: 'custom', custom_type_slug: 'payment-provider', slug: 'stripe', name: 'Stripe',
    }), { DB: db }, '/api/v1/content-item/create', admin);

    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/update', {
      content_type: 'custom', slug: 'stripe', custom_field_values: { settlement_time: '2 days' },
    }), { DB: db }, '/api/v1/content-item/update', admin);
    assert.equal((await res.json()).success, true);

    const getRes = await handleAPI(makeReq('GET', 'https://x.com/api/v1/content-item/custom-field-values?content_type=custom&slug=stripe'), { DB: db }, '/api/v1/content-item/custom-field-values', admin);
    const getData = await getRes.json();
    assert.equal(getData.values.settlement_time, '2 days');
  });
});

describe('custom-type update', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    await db.prepare(`INSERT INTO custom_content_types (slug, label, plural_label) VALUES ('payment-provider', 'Payment Provider', 'Payment Providers')`).run();
    await db.prepare(`INSERT INTO custom_field_definitions (custom_type_slug, field_key, label, field_type, display_order) VALUES ('payment-provider', 'settlement_time', 'Settlement Time', 'text', 0)`).run();
  });

  test('updates label/plural_label without touching existing field definitions', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/custom-type/update', {
      slug: 'payment-provider', label: 'Payment Providers (updated)',
    }), { DB: db }, '/api/v1/custom-type/update', admin);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.type.label, 'Payment Providers (updated)');
    const fields = await db.prepare(`SELECT * FROM custom_field_definitions WHERE custom_type_slug = 'payment-provider'`).all();
    assert.equal(fields.results.length, 1); // still there, untouched
  });

  test('adding a new field via update appends it without disturbing the existing one', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/custom-type/update', {
      slug: 'payment-provider',
      new_fields: [{ field_key: 'api_available', label: 'API Available', field_type: 'boolean' }],
    }), { DB: db }, '/api/v1/custom-type/update', admin);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.addedFields.length, 1);
    const fields = await db.prepare(`SELECT field_key FROM custom_field_definitions WHERE custom_type_slug = 'payment-provider' ORDER BY display_order`).all();
    assert.deepEqual(fields.results.map(f => f.field_key), ['settlement_time', 'api_available']);
  });

  test('adding a field with a duplicate key is silently skipped, not an error, not a duplicate row', async () => {
    await handleAPI(makeReq('POST', 'https://x.com/api/v1/custom-type/update', {
      slug: 'payment-provider',
      new_fields: [{ field_key: 'settlement_time', label: 'Dup', field_type: 'text' }],
    }), { DB: db }, '/api/v1/custom-type/update', admin);
    const fields = await db.prepare(`SELECT * FROM custom_field_definitions WHERE custom_type_slug = 'payment-provider'`).all();
    assert.equal(fields.results.length, 1);
  });

  test('an editor cannot update a custom type (create/update reserved to admin per migration 0051)', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/custom-type/update', {
      slug: 'payment-provider', label: 'Hacked',
    }), { DB: db }, '/api/v1/custom-type/update', editor);
    assert.equal(res.status, 403);
  });
});

describe('comparison update', () => {
  let db, comparisonId, casinoAId, casinoBId, casinoCId;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    await db.prepare(`INSERT INTO casinos (slug, name, website_url, affiliate_url, status, published) VALUES
      ('casino-a', 'A', 'https://a.com', 'https://a.com/aff', 'published', 1),
      ('casino-b', 'B', 'https://b.com', 'https://b.com/aff', 'published', 1),
      ('casino-c', 'C', 'https://c.com', 'https://c.com/aff', 'published', 1)`).run();
    casinoAId = (await db.prepare(`SELECT id FROM casinos WHERE slug='casino-a'`).first()).id;
    casinoBId = (await db.prepare(`SELECT id FROM casinos WHERE slug='casino-b'`).first()).id;
    casinoCId = (await db.prepare(`SELECT id FROM casinos WHERE slug='casino-c'`).first()).id;

    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/comparison/create', {
      content_type: 'casino', slug: 'a-vs-b', title: 'A vs B',
      items: [{ item_content_type: 'casino', item_id: casinoAId }, { item_content_type: 'casino', item_id: casinoBId }],
      criteria: [{ key: 'rating', label: 'Rating' }],
    }), { DB: db }, '/api/v1/comparison/create', admin);
    comparisonId = (await res.json()).comparison.id;
  });

  test('updating title/description does not touch items', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/comparison/update', {
      content_type: 'casino', slug: 'a-vs-b', title: 'A vs B (updated)',
    }), { DB: db }, '/api/v1/comparison/update', admin);
    assert.equal((await res.json()).success, true);
    const items = await db.prepare(`SELECT * FROM comparison_items WHERE comparison_id = ?`).bind(comparisonId).all();
    assert.equal(items.results.length, 2); // untouched
  });

  test('replacing items swaps them out completely (B replaced with C)', async () => {
    await handleAPI(makeReq('POST', 'https://x.com/api/v1/comparison/update', {
      content_type: 'casino', slug: 'a-vs-b',
      items: [{ item_content_type: 'casino', item_id: casinoAId }, { item_content_type: 'casino', item_id: casinoCId }],
    }), { DB: db }, '/api/v1/comparison/update', admin);
    const items = await db.prepare(`SELECT item_id FROM comparison_items WHERE comparison_id = ?`).bind(comparisonId).all();
    const ids = items.results.map(i => i.item_id).sort();
    assert.deepEqual(ids, [casinoAId, casinoCId].sort());
  });

  test('replacing with fewer than 2 items is rejected before touching the database', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/comparison/update', {
      content_type: 'casino', slug: 'a-vs-b', items: [{ item_content_type: 'casino', item_id: casinoAId }],
    }), { DB: db }, '/api/v1/comparison/update', admin);
    assert.equal(res.status, 400);
    const items = await db.prepare(`SELECT * FROM comparison_items WHERE comparison_id = ?`).bind(comparisonId).all();
    assert.equal(items.results.length, 2); // unchanged, the bad update never applied
  });
});

describe('content-types-enabled settings endpoint (admin-only)', () => {
  let db;
  beforeEach(() => {
    db = createTestDb();
    applyMigrations(db);
    clearContentTypeEnablementCache();
  });

  test('GET returns the seeded default (casino only)', async () => {
    const res = await handleAPI(makeReq('GET', 'https://x.com/api/v1/content-types-enabled'), { DB: db }, '/api/v1/content-types-enabled', admin);
    const data = await res.json();
    assert.equal(data.enablement.casino, true);
    assert.equal(data.enablement.sportsbook, false);
  });

  test('admin can enable sportsbook, and the change is immediately reflected', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-types-enabled/update', { sportsbook: true }), { DB: db }, '/api/v1/content-types-enabled/update', admin);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.enablement.sportsbook, true);

    const getRes = await handleAPI(makeReq('GET', 'https://x.com/api/v1/content-types-enabled'), { DB: db }, '/api/v1/content-types-enabled', admin);
    assert.equal((await getRes.json()).enablement.sportsbook, true);
  });

  test('an editor is rejected -- this is admin-only regardless of content_items permission rows', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-types-enabled/update', { sportsbook: true }), { DB: db }, '/api/v1/content-types-enabled/update', editor);
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
  });

  test('casino cannot be disabled even if explicitly sent as false', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-types-enabled/update', { casino: false, sportsbook: true }), { DB: db }, '/api/v1/content-types-enabled/update', admin);
    const data = await res.json();
    assert.equal(data.enablement.casino, true);
  });
});

describe('generic review create/update (casino_slug sentinel)', () => {
  let db, sportsbookId;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/create', {
      content_type: 'sportsbook', slug: 'bet365-sport', name: 'Bet365',
    }), { DB: db }, '/api/v1/content-item/create', admin);
    sportsbookId = (await db.prepare(`SELECT id FROM content_items WHERE slug='bet365-sport'`).first()).id;
  });

  test('creates a review with casino_slug = "" (sentinel, never NULL, never a real slug)', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/generic-review/create', {
      reviewed_content_type: 'sportsbook', reviewed_content_id: sportsbookId,
      slug: 'bet365-review', title: 'Bet365 Review', content: 'Full review.',
    }), { DB: db }, '/api/v1/generic-review/create', admin);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.review.casino_slug, '');
    assert.equal(data.review.reviewed_content_type, 'sportsbook');
    assert.equal(data.review.reviewed_content_id, sportsbookId);
  });

  test('the sentinel review is never returned by a real-casino-slug lookup', async () => {
    await handleAPI(makeReq('POST', 'https://x.com/api/v1/generic-review/create', {
      reviewed_content_type: 'sportsbook', reviewed_content_id: sportsbookId,
      slug: 'bet365-review', title: 'T', content: 'C',
    }), { DB: db }, '/api/v1/generic-review/create', admin);
    const byRealSlug = await db.prepare(`SELECT * FROM reviews WHERE casino_slug = 'bet365-sport'`).all();
    assert.equal(byRealSlug.results.length, 0);
    const byEmptySlug = await db.prepare(`SELECT * FROM reviews WHERE casino_slug = ''`).all();
    assert.equal(byEmptySlug.results.length, 1); // it's there, just never collides with a real lookup
  });

  test('rejects reviewed_content_type = casino -- that path is createReview() in reviews.js, not this one', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/generic-review/create', {
      reviewed_content_type: 'casino', reviewed_content_id: 1, slug: 'x', title: 'T', content: 'C',
    }), { DB: db }, '/api/v1/generic-review/create', admin);
    assert.equal(res.status, 400);
  });

  test('rejects a reviewed_content_id that does not resolve to a real item', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/generic-review/create', {
      reviewed_content_type: 'sportsbook', reviewed_content_id: 999999, slug: 'x', title: 'T', content: 'C',
    }), { DB: db }, '/api/v1/generic-review/create', admin);
    assert.equal(res.status, 404);
  });

  test('update changes only the sent fields', async () => {
    const createRes = await handleAPI(makeReq('POST', 'https://x.com/api/v1/generic-review/create', {
      reviewed_content_type: 'sportsbook', reviewed_content_id: sportsbookId,
      slug: 'bet365-review', title: 'Original Title', content: 'Original content.', rating: 4.0,
    }), { DB: db }, '/api/v1/generic-review/create', admin);
    const reviewId = (await createRes.json()).review.id;

    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/generic-review/update', {
      id: reviewId, rating: 4.8,
    }), { DB: db }, '/api/v1/generic-review/update', admin);
    const data = await res.json();
    assert.equal(data.review.rating, 4.8);
    assert.equal(data.review.title, 'Original Title'); // untouched
  });

  test('casino reviews are completely unaffected by any generic-review operation', async () => {
    await db.prepare(`INSERT INTO casinos (slug, name, website_url, affiliate_url, status, published) VALUES ('bcgame', 'BC.Game', 'https://bc.game', 'https://bc.game/aff', 'published', 1)`).run();
    await db.prepare(`INSERT INTO reviews (casino_slug, slug, title, content, published, reviewed_content_type, reviewed_content_id) VALUES ('bcgame', 'bcgame-review', 'BC.Game Review', 'Content', 1, 'casino', (SELECT id FROM casinos WHERE slug='bcgame'))`).run();

    await handleAPI(makeReq('POST', 'https://x.com/api/v1/generic-review/create', {
      reviewed_content_type: 'sportsbook', reviewed_content_id: sportsbookId, slug: 'bet365-review', title: 'T', content: 'C',
    }), { DB: db }, '/api/v1/generic-review/create', admin);

    const casinoReview = await db.prepare(`SELECT * FROM reviews WHERE slug = 'bcgame-review'`).first();
    assert.equal(casinoReview.casino_slug, 'bcgame');
    assert.equal(casinoReview.title, 'BC.Game Review');
  });
});
