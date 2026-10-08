// test/generic-content-engine-item-access.test.js
//
// Closes the item-level-scoping gap flagged as deferred in every
// prior phase: content_items and comparisons are now registered in
// the existing item-access system (database/item-access.js), which
// casino has used from the start. This suite proves the registration
// actually works, using the real handleAPI() router end to end, and
// reuses this repo's own seedBaseFixtures() for real user rows --
// user_item_access has a real FOREIGN KEY to users(id), so a fake
// user_id (not backed by a real row) fails at the database level
// once a later migration flips foreign_keys back ON mid-suite
// (0051_generic_content_engine.sql does this, matching the
// convention several earlier migrations already established) --
// exactly the kind of thing a fixture-based seed exists to get right
// once, rather than every test reinventing its own fake IDs.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { seedBaseFixtures } from './support/fixtures.js';
import { handleAPI } from '../worker/api.js';
import * as itemAccess from '../worker/database/item-access.js';

function makeReq(method, url, body) {
  return { method, url, headers: new Headers(), json: async () => body };
}

describe('content_items item-level access scoping', () => {
  let db, fx, itemAId, itemBId;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db); // real users: fx.admin(1), fx.editorAssigned(2), fx.editorOwn(3), fx.editorNone(4)

    // Item A created by editorOwn, item B created by admin
    const resA = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/create', {
      content_type: 'sportsbook', slug: 'item-a', name: 'Item A',
    }), { DB: db }, '/api/v1/content-item/create', fx.editorOwn);
    itemAId = (await resA.json()).item.id;

    const resB = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/create', {
      content_type: 'sportsbook', slug: 'item-b', name: 'Item B',
    }), { DB: db }, '/api/v1/content-item/create', fx.admin);
    itemBId = (await resB.json()).item.id;

    // content_items scope policies, independent of the fixture's
    // pre-existing 'casinos' scope rows for these same users.
    await itemAccess.setUserItemAccess(db, fx.editorOwn.user_id, 'content_items', 'update', 'own');
    await itemAccess.setUserItemAccess(db, fx.editorOwn.user_id, 'content_items', 'read', 'own');
    await itemAccess.setUserItemAccess(db, fx.editorOwn.user_id, 'content_items', 'delete', 'own');
    await itemAccess.setUserItemAccess(db, fx.editorAssigned.user_id, 'content_items', 'update', 'assigned');
    await itemAccess.setUserItemAccess(db, fx.editorNone.user_id, 'content_items', 'update', 'none');
    await itemAccess.assignItem(db, fx.editorAssigned.user_id, 'content_items', itemAId, fx.admin.user_id);
  });

  test('editor with "own" scope CAN update an item they created', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/update', {
      content_type: 'sportsbook', slug: 'item-a', name: 'Item A (edited)',
    }), { DB: db }, '/api/v1/content-item/update', fx.editorOwn);
    assert.equal((await res.json()).success, true);
  });

  test('editor with "own" scope CANNOT update an item created by someone else', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/update', {
      content_type: 'sportsbook', slug: 'item-b', name: 'Hacked',
    }), { DB: db }, '/api/v1/content-item/update', fx.editorOwn);
    assert.equal(res.status, 404); // IDOR-safe: not found, not forbidden
    const stillOriginal = await db.prepare(`SELECT name FROM content_items WHERE slug = 'item-b'`).first();
    assert.equal(stillOriginal.name, 'Item B'); // unchanged
  });

  test('editor with "assigned" scope CAN update an item explicitly assigned to them', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/update', {
      content_type: 'sportsbook', slug: 'item-a', name: 'Item A (edited by assigned editor)',
    }), { DB: db }, '/api/v1/content-item/update', fx.editorAssigned);
    assert.equal((await res.json()).success, true);
  });

  test('editor with "assigned" scope CANNOT update an item NOT assigned to them', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/update', {
      content_type: 'sportsbook', slug: 'item-b', name: 'Hacked',
    }), { DB: db }, '/api/v1/content-item/update', fx.editorAssigned);
    assert.equal(res.status, 404);
  });

  test('editor with "none" scope CANNOT update anything, including their own', async () => {
    const resOwn = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/create', {
      content_type: 'sportsbook', slug: 'item-c', name: 'Item C',
    }), { DB: db }, '/api/v1/content-item/create', fx.editorNone);
    assert.equal((await resOwn.json()).success, true); // create still works (no item-level check on create -- item doesn't exist yet)

    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/update', {
      content_type: 'sportsbook', slug: 'item-c', name: 'Should be blocked',
    }), { DB: db }, '/api/v1/content-item/update', fx.editorNone);
    assert.equal(res.status, 404);
  });

  test('admin always bypasses item-level scoping regardless of any policy', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/update', {
      content_type: 'sportsbook', slug: 'item-b', name: 'Admin can always edit',
    }), { DB: db }, '/api/v1/content-item/update', fx.admin);
    assert.equal((await res.json()).success, true);
  });

  test('an editor with NO content_items scope policy set at all defaults to "all" (backward compatible -- nothing breaks for existing editors until an admin explicitly narrows their scope)', async () => {
    // A 5th real user, deliberately given no content_items rows (only
    // the ones seedBaseFixtures already gave it for 'casinos').
    await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (5, 'fresh-editor@test.local', 'x', 'editor')`).run();
    const freshEditor = { user_id: 5, role: 'editor' };
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/update', {
      content_type: 'sportsbook', slug: 'item-b', name: 'Edited by unscoped editor',
    }), { DB: db }, '/api/v1/content-item/update', freshEditor);
    assert.equal((await res.json()).success, true);
  });

  test('delete is blocked at the ROLE level for editors regardless of item-level scope (migration 0051 gives editors no delete permission on content_items at all -- item-level scoping never even gets reached)', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/delete', {
      content_type: 'sportsbook', slug: 'item-b',
    }), { DB: db }, '/api/v1/content-item/delete', fx.editorOwn);
    assert.equal(res.status, 403); // role-level "editor cannot delete content_items", not item-level
    const stillThere = await db.prepare(`SELECT * FROM content_items WHERE slug = 'item-b'`).first();
    assert.ok(stillThere); // not actually deleted
  });

  test('admin delete IS scoped item-level (the role gate passes for admin, so canAccessItem is what actually runs) -- admin bypasses it and can delete an item they did not create', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/content-item/delete', {
      content_type: 'sportsbook', slug: 'item-a',
    }), { DB: db }, '/api/v1/content-item/delete', fx.admin);
    assert.equal((await res.json()).success, true);
  });

  test('GET (read) respects scoping too -- an out-of-scope editor cannot even view the item via the edit-form prefill endpoint', async () => {
    const res = await handleAPI(makeReq('GET', 'https://x.com/api/v1/content-item/get?content_type=sportsbook&slug=item-b'), { DB: db }, '/api/v1/content-item/get', fx.editorOwn);
    assert.equal(res.status, 404);
  });
});

describe('comparisons item-level access scoping', () => {
  let db, fx;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    fx = await seedBaseFixtures(db);

    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/comparison/create', {
      content_type: 'casino', slug: 'a-vs-b', title: 'A vs B',
      items: [{ item_content_type: 'casino', item_id: fx.casinoA }, { item_content_type: 'casino', item_id: fx.casinoB }],
    }), { DB: db }, '/api/v1/comparison/create', fx.admin); // created by admin, not editorOwn
    await res.json();

    await itemAccess.setUserItemAccess(db, fx.editorOwn.user_id, 'comparisons', 'update', 'own');
  });

  test('editor with "own" scope cannot update a comparison created by someone else', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/comparison/update', {
      content_type: 'casino', slug: 'a-vs-b', title: 'Hacked',
    }), { DB: db }, '/api/v1/comparison/update', fx.editorOwn);
    assert.equal(res.status, 404);
  });

  test('admin bypasses scoping for comparisons too', async () => {
    const res = await handleAPI(makeReq('POST', 'https://x.com/api/v1/comparison/update', {
      content_type: 'casino', slug: 'a-vs-b', title: 'Admin edit',
    }), { DB: db }, '/api/v1/comparison/update', fx.admin);
    assert.equal((await res.json()).success, true);
  });
});

describe('custom_content_types is deliberately NOT registered in item-access', () => {
  test('getResourceConfig returns null -- admin-only create/update already covers it, registering would add nothing since custom_content_types has no owner column', () => {
    const config = itemAccess.getResourceConfig('custom_content_types');
    assert.equal(config, null);
  });
});
