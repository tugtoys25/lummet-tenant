// test/super-api-newsroom-taxonomy.test.js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import {
  handleListSections, handleGetSection, handleCreateSection, handleUpdateSection, handleArchiveSection,
  handleListTopics, handleCreateTopic,
  handleListEntities, handleCreateEntity,
  handleListSeries, handleCreateSeries
} from '../worker/super/handlers-newsroom.js';

function req(url) { return new Request(url); }

describe('Super API v12 -- Newsroom Taxonomy: sections', () => {
  let db, env;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    env = { DB: db };
  });

  test('create -> list -> get -> update -> archive roundtrip', async () => {
    const createRes = await handleCreateSection(req('https://x'), env, undefined, JSON.stringify({ name: 'Regulation Watch' }));
    const createBody = await createRes.json();
    assert.equal(createRes.status, 201);
    assert.equal(createBody.success, true);
    assert.equal(createBody.data.slug, 'regulation-watch');
    const id = createBody.data.id;

    const listRes = await handleListSections(req('https://x/newsroom/sections'), env);
    const listBody = await listRes.json();
    assert.ok(listBody.data.some(s => s.id === id));

    const getRes = await handleGetSection(req('https://x'), env, id);
    const getBody = await getRes.json();
    assert.equal(getBody.data.name, 'Regulation Watch');
    assert.equal(getBody.data.active, 1);

    const updateRes = await handleUpdateSection(req('https://x'), env, id, JSON.stringify({ description: 'Tracking new regulation' }));
    assert.equal(updateRes.status, 200);
    const afterUpdate = await (await handleGetSection(req('https://x'), env, id)).json();
    assert.equal(afterUpdate.data.description, 'Tracking new regulation');

    // Archive never deletes.
    const archiveRes = await handleArchiveSection(req('https://x'), env, id);
    assert.equal(archiveRes.status, 200);
    const stillThere = await handleGetSection(req('https://x'), env, id);
    assert.equal(stillThere.status, 200);
    const stillThereBody = await stillThere.json();
    assert.equal(stillThereBody.data.active, 0);

    // Excluded from the default (active-only) list...
    const activeOnlyList = await (await handleListSections(req('https://x/newsroom/sections'), env)).json();
    assert.ok(!activeOnlyList.data.some(s => s.id === id));

    // ...but present with include_inactive=1.
    const withInactive = await (await handleListSections(req('https://x/newsroom/sections?include_inactive=1'), env)).json();
    assert.ok(withInactive.data.some(s => s.id === id));
  });

  test('permitted through the Super API regardless of tenant permission rows (tenant-wide-admin-equivalent credential)', async () => {
    // No permission rows exist for 'news'/'manage_taxonomy' at all in a
    // freshly-migrated DB beyond the seed migration grants 'admin' role --
    // and this call passes no role/user context whatsoever. It must still
    // succeed, proving perms: null is actually reaching checkPermission().
    const res = await handleCreateSection(req('https://x'), env, undefined, JSON.stringify({ name: 'Should Still Work' }));
    assert.equal((await res.json()).success, true);
  });

  test('duplicate slug is rejected with 409, not a raw SQL error', async () => {
    await handleCreateSection(req('https://x'), env, undefined, JSON.stringify({ name: 'Markets', slug: 'markets-dup-test' }));
    const res = await handleCreateSection(req('https://x'), env, undefined, JSON.stringify({ name: 'Markets Again', slug: 'markets-dup-test' }));
    const body = await res.json();
    assert.equal(res.status, 409);
    assert.equal(body.success, false);
  });

  test('a section cannot become its own ancestor (cycle prevention)', async () => {
    const a = (await (await handleCreateSection(req('https://x'), env, undefined, JSON.stringify({ name: 'Parent A' }))).json()).data.id;
    const b = (await (await handleCreateSection(req('https://x'), env, undefined, JSON.stringify({ name: 'Child B', parent_id: a }))).json()).data.id;

    const res = await handleUpdateSection(req('https://x'), env, a, JSON.stringify({ parent_id: b }));
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.match(body.error, /cycle/);
  });

  test('missing name on create is rejected', async () => {
    const res = await handleCreateSection(req('https://x'), env, undefined, JSON.stringify({}));
    assert.equal(res.status, 400);
  });

  test('get on a nonexistent id returns 404', async () => {
    const res = await handleGetSection(req('https://x'), env, 999999);
    assert.equal(res.status, 404);
  });
});

describe('Super API v12 -- Newsroom Taxonomy: topics, entities, series', () => {
  let db, env;
  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    env = { DB: db };
  });

  test('topics: create -> list roundtrip', async () => {
    const res = await handleCreateTopic(req('https://x'), env, undefined, JSON.stringify({ name: 'Responsible Gambling' }));
    const body = await res.json();
    assert.equal(body.success, true);
    const list = await (await handleListTopics(req('https://x/newsroom/topics'), env)).json();
    assert.ok(list.data.some(t => t.id === body.data.id));
  });

  test('entities: valid entity_type is accepted', async () => {
    const res = await handleCreateEntity(req('https://x'), env, undefined, JSON.stringify({ name: 'Example Regulator', entity_type: 'regulator' }));
    const body = await res.json();
    assert.equal(body.success, true);
  });

  test('entities: invalid entity_type is rejected', async () => {
    const res = await handleCreateEntity(req('https://x'), env, undefined, JSON.stringify({ name: 'Bad Entity', entity_type: 'not_a_real_type' }));
    assert.equal(res.status, 400);
  });

  test('entities: invalid website_url is rejected', async () => {
    const res = await handleCreateEntity(req('https://x'), env, undefined, JSON.stringify({ name: 'Bad URL Entity', website_url: 'javascript:alert(1)' }));
    assert.equal(res.status, 400);
  });

  test('entities: defaults entity_type to "company" when omitted', async () => {
    const res = await handleCreateEntity(req('https://x'), env, undefined, JSON.stringify({ name: 'Unspecified Type Co' }));
    const body = await res.json();
    assert.equal(body.success, true);
  });

  test('series: create -> list roundtrip', async () => {
    const res = await handleCreateSeries(req('https://x'), env, undefined, JSON.stringify({ name: 'Year in Review 2026' }));
    const body = await res.json();
    assert.equal(body.success, true);
    const list = await (await handleListSeries(req('https://x/newsroom/series'), env)).json();
    assert.ok(list.data.some(s => s.id === body.data.id));
  });
});
