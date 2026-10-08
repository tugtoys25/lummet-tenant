// test/super-api-research-sources-claims.test.js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import {
  handleListResearchSources, handleGetResearchSource, handleCreateResearchSource,
  handleUpdateResearchSource, handleDeleteResearchSource,
  handleListResearchClaims, handleGetResearchClaim, handleCreateResearchClaim,
  handleUpdateResearchClaim, handleDeleteResearchClaim,
  handleAttachResearchClaimSource, handleDetachResearchClaimSource
} from '../worker/super/handlers-research.js';

function req(url) { return new Request(url); }

async function makeResearchItem(db, overrides = {}) {
  const r = await db.prepare(
    `INSERT INTO research_items (type, slug, title, status) VALUES (?, ?, ?, ?)`
  ).bind(overrides.type || 'report', overrides.slug || 'test-item', overrides.title || 'Test Item', 'draft').run();
  return r.meta.last_row_id;
}

describe('Super API v14 -- Research Sources (global)', () => {
  let db, env;
  beforeEach(() => { db = createTestDb(); applyMigrations(db); env = { DB: db }; });

  test('create -> list -> get -> update -> delete roundtrip', async () => {
    const createRes = await handleCreateResearchSource(req('https://x'), env, undefined, JSON.stringify({
      organisation: 'Example Regulator', url: 'https://example-regulator.gov/page', source_type: 'regulator'
    }));
    const createBody = await createRes.json();
    assert.equal(createRes.status, 201);
    const id = createBody.data.id;

    const getRes = await (await handleGetResearchSource(req('https://x'), env, id)).json();
    assert.equal(getRes.data.organisation, 'Example Regulator');
    assert.equal(getRes.data.domain, 'example-regulator.gov'); // derived from URL

    const listBody = await (await handleListResearchSources(req('https://x'), env)).json();
    assert.ok(listBody.data.some(s => s.id === id));

    const updateRes = await handleUpdateResearchSource(req('https://x'), env, id, JSON.stringify({
      organisation: 'Example Regulator (Renamed)', notes: 'checked'
    }));
    assert.equal(updateRes.status, 200);
    const afterUpdate = await (await handleGetResearchSource(req('https://x'), env, id)).json();
    assert.equal(afterUpdate.data.organisation, 'Example Regulator (Renamed)');

    const deleteRes = await handleDeleteResearchSource(req('https://x'), env, id);
    assert.equal(deleteRes.status, 200);
    const afterDelete = await handleGetResearchSource(req('https://x'), env, id);
    assert.equal(afterDelete.status, 404);
  });

  test('missing organisation is rejected on create', async () => {
    const res = await handleCreateResearchSource(req('https://x'), env, undefined, JSON.stringify({ url: 'https://x.gov' }));
    assert.equal(res.status, 422);
  });

  test('invalid source_type is rejected', async () => {
    const res = await handleCreateResearchSource(req('https://x'), env, undefined, JSON.stringify({
      organisation: 'Bad Type Co', source_type: 'not_a_real_type'
    }));
    assert.equal(res.status, 422);
  });

  test('get/update/delete on a nonexistent source return 404', async () => {
    assert.equal((await handleGetResearchSource(req('https://x'), env, 999999)).status, 404);
    assert.equal((await handleUpdateResearchSource(req('https://x'), env, 999999, JSON.stringify({ organisation: 'X' }))).status, 404);
    assert.equal((await handleDeleteResearchSource(req('https://x'), env, 999999)).status, 404);
  });
});

describe('Super API v14 -- Research Claims (scoped to a research item)', () => {
  let db, env, itemId;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db); env = { DB: db };
    itemId = await makeResearchItem(db);
  });

  test('create -> list-by-item -> get -> update -> delete roundtrip', async () => {
    const createRes = await handleCreateResearchClaim(req('https://x'), env, undefined, JSON.stringify({
      research_item_id: itemId, claim_text: 'The licence fee is 10,000 EUR annually.'
    }));
    const createBody = await createRes.json();
    assert.equal(createRes.status, 201);
    const id = createBody.data.id;

    const listBody = await (await handleListResearchClaims(req(`https://x?research_item_id=${itemId}`), env)).json();
    assert.equal(listBody.data.length, 1);
    assert.equal(listBody.data[0].id, id);
    assert.equal(listBody.data[0].status, 'unverified');

    const updateRes = await handleUpdateResearchClaim(req('https://x'), env, id, JSON.stringify({
      claim_text: 'The licence fee is 12,000 EUR annually.', status: 'verified', verified_by: 'jsmith'
    }));
    assert.equal(updateRes.status, 200);
    const afterUpdate = await (await handleGetResearchClaim(req('https://x'), env, id)).json();
    assert.equal(afterUpdate.data.status, 'verified');
    assert.ok(afterUpdate.data.verified_at, 'expected verified_at to be auto-stamped');

    const deleteRes = await handleDeleteResearchClaim(req('https://x'), env, id);
    assert.equal(deleteRes.status, 200);
    assert.equal((await handleGetResearchClaim(req('https://x'), env, id)).status, 404);
  });

  test('listing claims requires a research_item_id', async () => {
    const res = await handleListResearchClaims(req('https://x'), env);
    assert.equal(res.status, 400);
  });

  test('missing research_item_id or claim_text is rejected on create', async () => {
    assert.equal((await handleCreateResearchClaim(req('https://x'), env, undefined, JSON.stringify({ claim_text: 'x' }))).status, 422);
    assert.equal((await handleCreateResearchClaim(req('https://x'), env, undefined, JSON.stringify({ research_item_id: itemId }))).status, 422);
  });

  test('invalid claim status is rejected', async () => {
    const res = await handleCreateResearchClaim(req('https://x'), env, undefined, JSON.stringify({
      research_item_id: itemId, claim_text: 'x', status: 'not_a_real_status'
    }));
    assert.equal(res.status, 422);
  });

  test('deleting a claim cascades its claim-source attachments', async () => {
    const claimId = (await (await handleCreateResearchClaim(req('https://x'), env, undefined, JSON.stringify({
      research_item_id: itemId, claim_text: 'Cascade test claim'
    }))).json()).data.id;
    const sourceId = (await (await handleCreateResearchSource(req('https://x'), env, undefined, JSON.stringify({
      organisation: 'Cascade Test Source'
    }))).json()).data.id;
    await handleAttachResearchClaimSource(req('https://x'), env, undefined, JSON.stringify({ claim_id: claimId, source_id: sourceId }));

    const beforeDelete = await db.prepare(`SELECT * FROM research_claim_sources WHERE claim_id = ?`).bind(claimId).all();
    assert.equal(beforeDelete.results.length, 1);

    await handleDeleteResearchClaim(req('https://x'), env, claimId);

    const afterDelete = await db.prepare(`SELECT * FROM research_claim_sources WHERE claim_id = ?`).bind(claimId).all();
    assert.equal(afterDelete.results.length, 0);
  });
});

describe('Super API v14 -- Research Claim<->Source attachments', () => {
  let db, env, itemId, claimId, sourceId;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db); env = { DB: db };
    itemId = await makeResearchItem(db);
    claimId = (await (await handleCreateResearchClaim(req('https://x'), env, undefined, JSON.stringify({
      research_item_id: itemId, claim_text: 'Attachment test claim'
    }))).json()).data.id;
    sourceId = (await (await handleCreateResearchSource(req('https://x'), env, undefined, JSON.stringify({
      organisation: 'Attachment Test Source'
    }))).json()).data.id;
  });

  test('attach -> shows up nested in getClaimsForResearchItem -> detach removes it', async () => {
    const attachRes = await handleAttachResearchClaimSource(req('https://x'), env, undefined, JSON.stringify({
      claim_id: claimId, source_id: sourceId, support_type: 'direct', source_quote: 'the exact quoted text'
    }));
    const attachBody = await attachRes.json();
    assert.equal(attachRes.status, 201);
    const attachmentId = attachBody.data.id;

    const listBody = await (await handleListResearchClaims(req(`https://x?research_item_id=${itemId}`), env)).json();
    assert.equal(listBody.data[0].sources.length, 1);
    assert.equal(listBody.data[0].sources[0].organisation, 'Attachment Test Source');

    await handleDetachResearchClaimSource(req('https://x'), env, attachmentId);
    const afterDetach = await (await handleListResearchClaims(req(`https://x?research_item_id=${itemId}`), env)).json();
    assert.equal(afterDetach.data[0].sources.length, 0);
  });

  test('attaching an unknown claim_id is rejected', async () => {
    const res = await handleAttachResearchClaimSource(req('https://x'), env, undefined, JSON.stringify({ claim_id: 999999, source_id: sourceId }));
    assert.equal(res.status, 400);
  });

  test('attaching an unknown source_id is rejected', async () => {
    const res = await handleAttachResearchClaimSource(req('https://x'), env, undefined, JSON.stringify({ claim_id: claimId, source_id: 999999 }));
    assert.equal(res.status, 400);
  });

  test('invalid support_type is rejected', async () => {
    const res = await handleAttachResearchClaimSource(req('https://x'), env, undefined, JSON.stringify({
      claim_id: claimId, source_id: sourceId, support_type: 'not_a_real_type'
    }));
    assert.equal(res.status, 422);
  });

  test('attaching the same claim+source twice is rejected (UNIQUE constraint)', async () => {
    await handleAttachResearchClaimSource(req('https://x'), env, undefined, JSON.stringify({ claim_id: claimId, source_id: sourceId }));
    const res = await handleAttachResearchClaimSource(req('https://x'), env, undefined, JSON.stringify({ claim_id: claimId, source_id: sourceId }));
    assert.equal(res.status, 422);
  });
});
