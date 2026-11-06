// Phase 11 / T1: a named preset that keeps sportsbook, partners or custom types must also switch the older
// `content_types_enabled` setting on, or the preset applies and the pages still answer 404 (public-pages.js and
// sitemap.js check BOTH gates). Full platform and presets that drop the content module never touch it.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { saveDraft, publishDraft } from '../worker/site-profile/versions.js';
import { applyPreset, defaultProfile } from '../worker/site-profile/profile.js';
import { PRESETS } from '../worker/site-profile/registry.js';
import { legacyTypesToEnable, syncContentTypes } from '../worker/site-profile/content-sync.js';
import { route as profileRoute } from '../worker/api/routes/site-profile.js';
import { isContentTypeEnabled, clearContentTypeEnablementCache } from '../worker/content-types.js';

const admin = { user_id: 1, email: 'boss@t.example', role: 'admin' };
let db, ENV;
// Migration 0051 seeds this row, so it always exists: casino on, everything else off.
const SEED = { casino: true, sportsbook: false, affiliate_partner: false, custom: false };
const legacy = async () => { const r = await db.prepare("SELECT value FROM settings WHERE key='content_types_enabled'").first(); return r ? JSON.parse(r.value) : null; };
const publish = async (profile) => {
  const s = await saveDraft(ENV, admin, { profile });
  assert.ok(!s.error && !s.errors && !s.conflict, JSON.stringify(s));
  const p = await publishDraft(ENV, 't.example', admin, { note: 'test' });
  assert.ok(p.published, JSON.stringify(p));
};

beforeEach(() => { db = createTestDb(); applyMigrations(db); ENV = { DB: db }; clearContentTypeEnablementCache(); });

describe('which presets claim the older content-type switch', () => {
  test('only presets that keep the content module and a content page claim it', () => {
    const claimed = Object.fromEntries(Object.keys(PRESETS).map((id) => [id, legacyTypesToEnable(applyPreset(id))]));
    assert.deepEqual(claimed.sportsbook, ['sportsbook']);
    for (const id of Object.keys(PRESETS)) if (id !== 'sportsbook') assert.deepEqual(claimed[id], [], id);
  });
  test('Full platform and junk input claim nothing', () => {
    assert.deepEqual(legacyTypesToEnable(defaultProfile()), []);
    assert.deepEqual(legacyTypesToEnable(null), []);
    assert.deepEqual(legacyTypesToEnable({ preset: 'custom', modules: { content: true } }), []);
  });
});

describe('publishing keeps the older setting in step', () => {
  test('before: the sportsbook preset is blocked by the older setting; after publish it is not', async () => {
    assert.equal(await isContentTypeEnabled(ENV, 'sportsbook'), false);
    await publish(applyPreset('sportsbook'));
    assert.deepEqual(await legacy(), { ...SEED, sportsbook: true });
    assert.equal(await isContentTypeEnabled(ENV, 'sportsbook'), true);
    assert.equal(await isContentTypeEnabled(ENV, 'affiliate_partner'), false);
    assert.equal(await isContentTypeEnabled(ENV, 'custom'), false);
  });
  test('Full platform and other presets leave existing behaviour alone', async () => {
    await publish(applyPreset('news'));
    assert.deepEqual(await legacy(), SEED);
    assert.equal(await isContentTypeEnabled(ENV, 'sportsbook'), false);
  });
  test('merges into what is already stored and never switches anything off', async () => {
    await db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('content_types_enabled', ?)").bind(JSON.stringify({ custom: true, sportsbook: false })).run();
    await publish(applyPreset('sportsbook'));
    assert.deepEqual(await legacy(), { custom: true, sportsbook: true });
    await publish(applyPreset('news'));
    assert.deepEqual(await legacy(), { custom: true, sportsbook: true });
  });
  test('a malformed stored value is replaced instead of breaking the publish', async () => {
    await db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('content_types_enabled', 'not json')").run();
    await publish(applyPreset('sportsbook'));
    assert.deepEqual(await legacy(), { sportsbook: true });
    assert.equal(await isContentTypeEnabled(ENV, 'sportsbook'), true);
  });
});

describe('the other write paths', () => {
  test('saving a profile directly through the API syncs it too', async () => {
    const body = applyPreset('sportsbook');
    const r = await profileRoute({ request: { method: 'POST', url: 'https://t.example/api/v1/site-profile', headers: new Headers(), json: async () => body }, env: ENV, path: '/api/v1/site-profile', user: admin });
    assert.equal(r.status, 200);
    assert.deepEqual(await legacy(), { ...SEED, sportsbook: true });
  });
  test('syncContentTypes is a no-op for Full and never throws', async () => {
    await syncContentTypes(ENV, defaultProfile());
    assert.deepEqual(await legacy(), SEED);
    await syncContentTypes({ DB: null }, applyPreset('sportsbook')); // broken env: logged, not thrown
  });
});
