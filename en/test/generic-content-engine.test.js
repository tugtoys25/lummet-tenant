// test/generic-content-engine.test.js
//
// Covers the generic content engine added in this project: content_items
// (sportsbook/affiliate_partner/custom), the generic content resolver,
// custom content types + typed fields, the comparisons engine, and the
// review criteria/weighted-rating engine. Uses this repo's own D1 shim
// and fixtures (test/support/), same as every other suite here.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { seedBaseFixtures } from './support/fixtures.js';
import * as contentItems from '../worker/database/content-items.js';
import * as customTypes from '../worker/database/custom-types.js';
import * as comparisonsDb from '../worker/database/comparisons.js';
import * as reviewCriteria from '../worker/database/review-criteria.js';
import * as resolver from '../worker/content-resolver.js';
import { isReservedSlug } from '../worker/reserved-slugs.js';

describe('content_items (sportsbook/affiliate_partner/custom)', () => {
  let db, fx;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);
    await db.prepare(`
      INSERT INTO content_items (content_type, slug, name, status, published, rating)
      VALUES ('sportsbook', 'bet365-sport', 'Bet365 Sportsbook', 'published', 1, 4.7),
             ('sportsbook', 'draft-book', 'Draft Book', 'draft', 0, 0)
    `).run();
  });

  test('getContentItem fetches by (content_type, slug), unfiltered by publish status (admin-style access)', async () => {
    const draft = await contentItems.getContentItem(db, 'sportsbook', 'draft-book');
    assert.equal(draft.status, 'draft');
  });

  test('getPublishedContentItems returns only published + status=published rows', async () => {
    const published = await contentItems.getPublishedContentItems(db, 'sportsbook');
    assert.equal(published.length, 1);
    assert.equal(published[0].slug, 'bet365-sport');
  });

  test('createContentItem enforces UNIQUE(content_type, slug)', async () => {
    await assert.rejects(
      () => contentItems.createContentItem(db, 'sportsbook', { slug: 'bet365-sport', name: 'Dup' }),
      /UNIQUE/i
    );
  });

  test('casino data is never touched by any content_items operation', async () => {
    const casinoCountBefore = (await db.prepare(`SELECT COUNT(*) AS n FROM casinos`).first()).n;
    await contentItems.createContentItem(db, 'sportsbook', { slug: 'new-book', name: 'New Book' });
    const casinoCountAfter = (await db.prepare(`SELECT COUNT(*) AS n FROM casinos`).first()).n;
    assert.equal(casinoCountBefore, casinoCountAfter);
  });
});

describe('content-resolver.js — generic normalization across casino and content_items', () => {
  let db, fx;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);
    // seedBaseFixtures' casinos aren't published (published=0/status=draft
    // by schema default -- that fixture is designed for item-access
    // testing, not public-visibility testing), and resolveContentItem's
    // casino branch correctly only resolves published+status='published'
    // rows (same filter getCasino() has always used). Publish Casino A
    // here so this suite is testing normalization, not tripping over an
    // unrelated fixture default.
    await db.prepare(`UPDATE casinos SET published = 1, status = 'published' WHERE id = ?`).bind(fx.casinoA).run();
    await db.prepare(`
      INSERT INTO content_items (content_type, slug, name, status, published, rating)
      VALUES ('sportsbook', 'bet365-sport', 'Bet365 Sportsbook', 'published', 1, 4.7)
    `).run();
  });

  test('casino and sportsbook resolve to the exact same normalized shape (key set)', async () => {
    const casino = await resolver.resolveContentItem(db, 'casino', 'casino-a');
    const sportsbook = await resolver.resolveContentItem(db, 'sportsbook', 'bet365-sport');
    assert.deepEqual(Object.keys(casino).sort(), Object.keys(sportsbook).sort());
    assert.equal(casino.contentType, 'casino');
    assert.equal(sportsbook.contentType, 'sportsbook');
  });

  test('a missing item resolves to null, not a thrown error', async () => {
    const missing = await resolver.resolveContentItem(db, 'sportsbook', 'does-not-exist');
    assert.equal(missing, null);
  });

  test('resolveAffiliateLink returns null for a sportsbook item (no commercial-link concept for that type)', async () => {
    const item = await resolver.resolveContentItem(db, 'sportsbook', 'bet365-sport');
    const link = await resolver.resolveAffiliateLink(db, item);
    assert.equal(link, null);
  });

  test('resolveAffiliateLink for affiliate_partner exposes ONLY public-safe fields, never internal contact/notes data', async () => {
    await db.prepare(`
      INSERT INTO affiliate_partners (name, slug, website, description, partner_type, status, contact_email, contact_phone, notes)
      VALUES ('NetworkX', 'networkx', 'https://networkx.example', 'desc', 'network', 'active', 'internal@example.com', '+1-555-0100', 'INTERNAL: do not share')
    `).run();
    const partnerId = (await db.prepare(`SELECT id FROM affiliate_partners WHERE slug='networkx'`).first()).id;
    await db.prepare(`
      INSERT INTO content_items (content_type, slug, name, status, published, linked_affiliate_partner_id)
      VALUES ('affiliate_partner', 'networkx-review', 'NetworkX', 'published', 1, ?)
    `).bind(partnerId).run();

    const item = await resolver.resolveContentItem(db, 'affiliate_partner', 'networkx-review');
    const link = await resolver.resolveAffiliateLink(db, item);
    assert.ok(link);
    const forbidden = ['contact_name', 'contact_email', 'contact_phone', 'notes', 'external_reference', 'created_by', 'updated_by'];
    for (const key of forbidden) {
      assert.equal(Object.prototype.hasOwnProperty.call(link, key), false, `leaked field: ${key}`);
    }
    assert.equal(link.partner_name, 'NetworkX');
  });
});

describe('custom-types.js — custom content types and typed field definitions', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
  });

  test('createCustomContentType rejects a reserved top-level slug', async () => {
    await assert.rejects(
      () => customTypes.createCustomContentType(db, { slug: 'casino', label: 'X', pluralLabel: 'Xs' }, isReservedSlug),
      /reserved/i
    );
  });

  test('createCustomContentType rejects a duplicate slug with a clear message', async () => {
    await customTypes.createCustomContentType(db, { slug: 'payment-provider', label: 'Payment Provider', pluralLabel: 'Payment Providers' }, isReservedSlug);
    await assert.rejects(
      () => customTypes.createCustomContentType(db, { slug: 'payment-provider', label: 'Dup', pluralLabel: 'Dups' }, isReservedSlug),
      /already exists/i
    );
  });

  test('field definitions load in display_order; cross-type listing isolation holds', async () => {
    await customTypes.createCustomContentType(db, { slug: 'payment-provider', label: 'Payment Provider', pluralLabel: 'Payment Providers' }, isReservedSlug);
    await customTypes.createCustomContentType(db, { slug: 'poker-room', label: 'Poker Room', pluralLabel: 'Poker Rooms' }, isReservedSlug);
    await db.prepare(`
      INSERT INTO custom_field_definitions (custom_type_slug, field_key, label, field_type, display_order)
      VALUES ('payment-provider', 'settlement_time', 'Settlement Time', 'text', 10)
    `).run();
    await db.prepare(`INSERT INTO content_items (content_type, custom_type_slug, slug, name, status, published) VALUES ('custom', 'payment-provider', 'stripe', 'Stripe', 'published', 1)`).run();
    await db.prepare(`INSERT INTO content_items (content_type, custom_type_slug, slug, name, status, published) VALUES ('custom', 'poker-room', 'pokerstars', 'PokerStars', 'published', 1)`).run();

    const defs = await customTypes.getCustomFieldDefinitions(db, 'payment-provider');
    assert.equal(defs.length, 1);
    assert.equal(defs[0].field_key, 'settlement_time');

    const paymentProviderItems = (await contentItems.getPublishedContentItems(db, 'custom'))
      .filter(r => r.custom_type_slug === 'payment-provider');
    assert.equal(paymentProviderItems.length, 1);
    assert.equal(paymentProviderItems[0].slug, 'stripe');
  });
});

describe('comparisons.js — the persistent comparison-page engine', () => {
  let db, fx;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);
  });

  test('createComparison writes the comparison + items together; a cross-item comparison resolves generically', async () => {
    await db.prepare(`INSERT INTO content_items (content_type, slug, name, status, published) VALUES ('sportsbook', 'bet365-sport', 'Bet365 Sportsbook', 'published', 1)`).run();
    const sportsbookId = (await db.prepare(`SELECT id FROM content_items WHERE slug='bet365-sport'`).first()).id;
    // seedBaseFixtures() leaves casinos at their column default of
    // status='draft' (only published=1 is set) since that default isn't
    // relevant to the item-access scoping those fixtures exist for --
    // but resolveContentItemById() is now correctly gated on BOTH
    // published=1 AND status='published' (see its doc comment: a
    // draft/unpublished item must not leak into a public comparison
    // page). This test is about type-resolution across
    // casinos/content_items, not about gating, so mark the fixture
    // casino published here to match what it's meant to represent.
    await db.prepare(`UPDATE casinos SET status = 'published' WHERE id = ?`).bind(fx.casinoA).run();

    const created = await comparisonsDb.createComparison(db, {
      contentType: 'casino', // comparisons.content_type can mix -- but items themselves carry their own type
      slug: 'casino-a-vs-bet365-sport',
      title: 'Casino A vs Bet365 Sportsbook (cross-type smoke test)',
      criteria: [{ key: 'rating', label: 'Rating' }],
      status: 'published',
      items: [
        { itemContentType: 'casino', itemId: fx.casinoA, position: 0 },
        { itemContentType: 'sportsbook', itemId: sportsbookId, position: 1 },
      ],
    });

    const items = await comparisonsDb.getComparisonItems(db, created.id);
    assert.equal(items.length, 2);

    const resolvedCasino = await resolver.resolveContentItemById(db, items[0].item_content_type, items[0].item_id);
    const resolvedSportsbook = await resolver.resolveContentItemById(db, items[1].item_content_type, items[1].item_id);
    assert.equal(resolvedCasino.contentType, 'casino');
    assert.equal(resolvedSportsbook.contentType, 'sportsbook');
  });

  test('editorial selection resolves via the explicit (type, id) pair', async () => {
    // See the previous test's comment: mark published so the new
    // resolveContentItemById() gate doesn't hide it -- this test is
    // about the (type, id) pair being honored, not about gating.
    await db.prepare(`UPDATE casinos SET status = 'published' WHERE id = ?`).bind(fx.casinoA).run();
    const created = await comparisonsDb.createComparison(db, {
      contentType: 'casino', slug: 'a-vs-b', title: 'A vs B',
      editorialSelectionItemType: 'casino', editorialSelectionItemId: fx.casinoA,
      status: 'published',
      items: [{ itemContentType: 'casino', itemId: fx.casinoA, position: 0 }, { itemContentType: 'casino', itemId: fx.casinoB, position: 1 }],
    });
    const pick = await resolver.resolveContentItemById(db, created.editorial_selection_item_type, created.editorial_selection_item_id);
    assert.equal(pick.slug, 'casino-a');
  });
});

describe('review-criteria.js — weighted rating math (pure functions)', () => {
  const templates = [
    { criterion_key: 'safety', label: 'Safety', weight: 20 },
    { criterion_key: 'payments', label: 'Payments', weight: 15 },
    { criterion_key: 'support', label: 'Support', weight: 10 },
  ];

  test('matches manual weighted-average calculation', () => {
    const scores = [{ criterion_key: 'safety', score: 9.5 }, { criterion_key: 'payments', score: 8.5 }, { criterion_key: 'support', score: 9.0 }];
    const expected = (9.5 * 20 + 8.5 * 15 + 9.0 * 10) / (20 + 15 + 10);
    assert.ok(Math.abs(reviewCriteria.computeWeightedRating(templates, scores) - expected) < 1e-9);
  });

  test('partial scoring normalizes against scored weight only, not the full template weight', () => {
    const rating = reviewCriteria.computeWeightedRating(templates, [{ criterion_key: 'safety', score: 9.5 }]);
    assert.equal(rating, 9.5);
  });

  test('no scores returns null, distinguishable from a zero rating', () => {
    assert.equal(reviewCriteria.computeWeightedRating(templates, []), null);
  });

  test('a non-finite score is ignored rather than propagating NaN', () => {
    const rating = reviewCriteria.computeWeightedRating(templates, [{ criterion_key: 'safety', score: NaN }, { criterion_key: 'payments', score: 8.5 }]);
    assert.equal(rating, 8.5);
  });
});
