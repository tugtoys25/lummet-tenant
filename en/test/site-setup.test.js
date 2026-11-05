// Phase 9: provisioning a new site. Rules under test: migration 0013 makes "Full platform" explicit and the setup complete on an
// existing site without touching anything the owner chose; provisioning applies a preset or a copy of another site as a
// numbered, audited version by "provisioning"; it never overwrites a site that is complete or that its owner has started
// changing; repeating the same request is harmless; the Super API maps every outcome to a clear status.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { admin, editor, viewer, freshSite, setSetting, setting, auditActions } from './support/transfer-fixtures.js';
import { getSetup, completeSetup, provisionSite, presetChoices, exportForClone, PROVISIONING_ACTOR, SETUP_STATE, SETUP_SOURCE } from '../worker/site-profile/setup.js';
import { loadProfile } from '../worker/site-profile/store.js';
import { applyPreset, defaultProfile, normalizeProfile } from '../worker/site-profile/profile.js';
import { PRESETS } from '../worker/site-profile/registry.js';
import { readLiveDocument, saveDraft, listVersions } from '../worker/site-profile/versions.js';
import { handleGetSiteSetup, handleProvisionSiteSetup, handleExportSiteConfig } from '../worker/super/handlers/site-setup.js';
import { SUPER_API_VERSION, getCapabilities } from '../worker/super/capabilities.js';
import { readRouterSource } from './support/super-router-source.js';
import { route } from '../worker/api/routes/site-profile.js';
import { NOT_HANDLED } from '../worker/api/helpers.js';

const HOST = 'new.example';
let db, env;
// What the control plane's first-deploy seed does to a brand-new site.
const makePending = async (d = db) => { await setSetting(d, SETUP_STATE, 'pending'); await setSetting(d, SETUP_SOURCE, 'new'); };
const pendingSite = async () => { const s = freshSite(); await makePending(s.db); return s; };
beforeEach(() => { ({ db, env } = freshSite()); });

describe('migration 0013 on an existing site', () => {
  const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '0013_setup_state.sql'), 'utf8');
  test('a fresh database gets an explicit Full platform row that behaves exactly like the default, and a complete setup', async () => {
    assert.deepEqual(normalizeProfile(JSON.parse(await setting(db, 'site_profile'))), defaultProfile());
    const s = await getSetup(env);
    assert.equal(s.state, 'complete'); assert.equal(s.pending, false); assert.equal(s.source, 'migrated');
    assert.deepEqual(await loadProfile(env, HOST), defaultProfile());
  });
  test('running it again changes nothing, and it never overwrites a configuration or a choice that is already stored', async () => {
    const mine = JSON.stringify(applyPreset('news'));
    await setSetting(db, 'site_profile', mine); await setSetting(db, SETUP_STATE, 'pending'); await setSetting(db, SETUP_SOURCE, 'preset');
    db._raw.exec(sql); db._raw.exec(sql);
    assert.equal(await setting(db, 'site_profile'), mine);
    assert.equal(await setting(db, SETUP_STATE), 'pending'); assert.equal(await setting(db, SETUP_SOURCE), 'preset');
  });
  test('a site that never had the rows (before this migration) is treated as complete, so no wizard appears', async () => {
    db._raw.exec("DELETE FROM settings WHERE key LIKE 'site_setup_%'");
    const s = await getSetup(env); assert.equal(s.pending, false); assert.equal(s.known, false);
  });
});

describe('provisioning with a preset', () => {
  test('every preset the registry has applies, becomes live at once, and is recorded as version 2 by provisioning', async () => {
    for (const id of Object.keys(PRESETS)) {
      const s = await pendingSite();
      const r = await provisionSite(s.env, HOST, { preset: id });
      assert.equal(r.ok, true, `${id}: ${JSON.stringify(r)}`);
      const live = await loadProfile(s.env, HOST);
      assert.equal(live.preset, id); assert.deepEqual(live.modules, applyPreset(id).modules);
      assert.equal(r.setup.pending, true); assert.equal(r.setup.source, 'preset'); assert.equal(r.setup.preset, id);
      const acts = await auditActions(s.db); assert.ok(acts.includes('provision.preset'), `${id} audit`);
    }
  });
  test('a non-default preset is a published version with a plain note, authored by provisioning', async () => {
    const s = await pendingSite();
    const r = await provisionSite(s.env, HOST, { preset: 'news' });
    assert.equal(r.version, 2);
    const v = (await listVersions(s.env)).versions.find((x) => x.version === 2);
    assert.equal(v.author, PROVISIONING_ACTOR.username); assert.match(v.note, /Initial setup: News site only/);
    assert.deepEqual(await auditActions(s.db), ['publish', 'provision.preset']);
  });
  test('"full" on a fresh site changes nothing, leaves no stray draft, and still starts the wizard', async () => {
    const s = await pendingSite();
    const r = await provisionSite(s.env, HOST, { preset: 'full' });
    assert.equal(r.ok, true); assert.equal(r.unchanged, true); assert.equal(r.version, null);
    assert.equal((await s.db.prepare('SELECT COUNT(*) n FROM config_draft').first()).n, 0);
    assert.equal(r.setup.pending, true);
  });
  test('repeating the same request answers "already applied" and writes no second version', async () => {
    const s = await pendingSite();
    await provisionSite(s.env, HOST, { preset: 'news' });
    const again = await provisionSite(s.env, HOST, { preset: 'news' });
    assert.equal(again.ok, true); assert.equal(again.alreadyApplied, true);
    assert.equal((await listVersions(s.env)).versions.length, 2, 'baseline plus one');
  });
  test('while the setup is still pending and only provisioning has touched it, a different preset replaces the first as a new version', async () => {
    const s = await pendingSite();
    await provisionSite(s.env, HOST, { preset: 'news' });
    const r = await provisionSite(s.env, HOST, { preset: 'static' });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.applied, true); assert.equal(r.setup.preset, 'static');
    assert.equal((await loadProfile(s.env, HOST)).preset, 'static');
    const versions = (await listVersions(s.env)).versions;
    assert.equal(versions.length, 3, 'baseline, news, static: nothing was deleted');
    assert.ok(versions.filter((x) => x.version > 1).every((x) => x.author === PROVISIONING_ACTOR.username));
  });
  test('a different preset is refused once the owner has a draft or has published a version of their own', async () => {
    const a = await pendingSite();
    await provisionSite(a.env, HOST, { preset: 'news' });
    await saveDraft(a.env, admin, { settings: { theme_primary: '#123456' } });
    const r1 = await provisionSite(a.env, HOST, { preset: 'static' });
    assert.equal(r1.ok, false); assert.equal(r1.status, 409); assert.equal(r1.code, 'already_configured');
    assert.equal((await loadProfile(a.env, HOST)).preset, 'news');
    const b = await pendingSite();
    await provisionSite(b.env, HOST, { preset: 'news' });
    await saveDraft(b.env, admin, { settings: { theme_primary: '#654321' } });
    const { publishDraft } = await import('../worker/site-profile/versions.js');
    assert.ok((await publishDraft(b.env, HOST, admin, {})).published);
    const r2 = await provisionSite(b.env, HOST, { preset: 'static' });
    assert.equal(r2.code, 'already_configured'); assert.equal((await loadProfile(b.env, HOST)).preset, 'news');
  });
  test('an unknown preset is 422 and names the valid ones; neither or both of preset and envelope is 422', async () => {
    const s = await pendingSite();
    const r = await provisionSite(s.env, HOST, { preset: 'casino-news-deluxe' });
    assert.equal(r.status, 422); assert.equal(r.code, 'unknown_preset'); assert.ok(r.presets.includes('news'));
    assert.equal((await provisionSite(s.env, HOST, {})).code, 'choose_one');
    assert.equal((await provisionSite(s.env, HOST, { preset: 'news', envelope: {} })).code, 'choose_one');
    assert.equal((await provisionSite(s.env, HOST, null)).code, 'choose_one');
    assert.equal((await provisionSite(s.env, HOST, { preset: '__proto__' })).code, 'unknown_preset');
    assert.equal((await loadProfile(s.env, HOST)).preset, 'full', 'nothing changed');
  });
  test('a site whose setup is complete is never replaced, and neither is one its owner has begun to change', async () => {
    const done = await provisionSite(env, HOST, { preset: 'news' });   // freshSite() is complete (migrated)
    assert.equal(done.status, 409); assert.equal(done.code, 'setup_not_pending');
    const s = await pendingSite();
    await saveDraft(s.env, admin, { settings: { theme_primary: '#123456' } });
    const r = await provisionSite(s.env, HOST, { preset: 'news' });
    assert.equal(r.code, 'already_configured'); assert.equal((await loadProfile(s.env, HOST)).preset, 'full');
  });
  test('without the versioning tables the preset still applies directly', async () => {
    const d = createTestDb(); applyMigrations(d);
    d._raw.exec('DROP TABLE config_draft; DROP TABLE config_audit;'); try { d._raw.exec('DROP TABLE config_versions;'); } catch { d._raw.exec('DROP TRIGGER IF EXISTS config_versions_no_update; DROP TRIGGER IF EXISTS config_versions_no_delete; DROP TABLE config_versions;'); }
    await makePending(d);
    const r = await provisionSite({ DB: d }, HOST, { preset: 'static' });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.version, null);
    assert.equal((await loadProfile({ DB: d }, HOST)).preset, 'static');
  });
});

describe('provisioning as a copy of another site', () => {
  let src;
  beforeEach(async () => {
    src = freshSite();
    await provisionPreset(src, 'list-reviews');
    await saveAndPublish(src);   // a real change on top of the preset, so there is something to publish
  });
  async function provisionPreset(site, id) { await makePending(site.db); await provisionSite(site.env, 'src.example', { preset: id }); await site.db.prepare("UPDATE settings SET value='complete' WHERE key=?").bind(SETUP_STATE).run(); }
  async function saveAndPublish(site) {
    const { publishDraft } = await import('../worker/site-profile/versions.js');
    await saveDraft(site.env, admin, { settings: { theme_primary: '#0a7a5c', site_name: 'Source Site' } });
    const p = await publishDraft(site.env, 'src.example', admin, {}); assert.ok(p.published, JSON.stringify(p));
  }

  test('exportForClone hands over the live configuration with the checksum a copy will verify', async () => {
    const x = await exportForClone(src.env, 'src.example');
    assert.equal(x.envelope.source.host, 'src.example'); assert.ok(x.envelope.checksum.startsWith('sha256:')); assert.ok(x.included.includes('structure'));
  });
  test('the new site gets the structure and look of the source, but not its name, and the wizard starts', async () => {
    const { envelope } = await exportForClone(src.env, 'src.example');
    const s = await pendingSite();
    const r = await provisionSite(s.env, HOST, { envelope });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.applied, true);
    const live = await loadProfile(s.env, HOST);
    assert.deepEqual(live.modules, applyPreset('list-reviews').modules);
    assert.equal(await setting(s.db, 'theme_primary'), '#0a7a5c');
    assert.notEqual(await setting(s.db, 'site_name'), 'Source Site', 'the business name belongs to the source');
    assert.equal(r.setup.source, 'clone'); assert.equal(r.setup.from, 'src.example'); assert.equal(r.setup.pending, true);
    assert.ok((await auditActions(s.db)).includes('provision.clone'));
  });
  test('the sender may narrow what is copied', async () => {
    const { envelope } = await exportForClone(src.env, 'src.example');
    const s = await pendingSite();
    const r = await provisionSite(s.env, HOST, { envelope, sections: ['settings.theme'] });
    assert.equal(r.ok, true); assert.equal((await loadProfile(s.env, HOST)).preset, 'full', 'structure was not asked for');
    assert.equal(await setting(s.db, 'theme_primary'), '#0a7a5c');
  });
  test('copying a source that matches the new site changes nothing but still starts the wizard', async () => {
    const plain = freshSite(); const { envelope } = await exportForClone(plain.env, 'plain.example', ['structure']);
    const s = await pendingSite();
    const r = await provisionSite(s.env, HOST, { envelope });
    assert.equal(r.ok, true); assert.equal(r.unchanged, true); assert.equal(r.setup.source, 'clone');
  });
  test('a damaged or foreign file is 422 with the reason, and nothing is changed', async () => {
    const s = await pendingSite();
    for (const bad of ['not json', { format: 'something-else' }, {}, 42]) {
      const r = await provisionSite(s.env, HOST, { envelope: bad });
      assert.equal(r.ok, false); assert.equal(r.status, 422); assert.equal(r.code, 'invalid_envelope', JSON.stringify(bad));
    }
    assert.equal((await loadProfile(s.env, HOST)).preset, 'full'); assert.equal((await getSetup(s.env)).source, 'new');
  });
});

describe('confirming the setup', () => {
  test('the owner confirms once; afterwards the setup is complete and owned by the owner, and the audit says so', async () => {
    const s = await pendingSite(); await provisionSite(s.env, HOST, { preset: 'news' });
    const r = await completeSetup(s.env, admin);
    assert.equal(r.ok, true); assert.equal(r.setup.pending, false); assert.equal(r.setup.source, 'owner');
    assert.ok((await auditActions(s.db)).includes('setup.complete'));
    assert.equal((await completeSetup(s.env, admin)).alreadyComplete, true);
  });
});

describe('Super API', () => {
  const call = async (h, method, path, body) => {
    const bodyText = body === undefined ? '' : JSON.stringify(body);
    const res = await h(new Request(`https://${HOST}${path}`, { method, body: method === 'GET' ? undefined : bodyText }), env, null, bodyText);
    return { status: res.status, body: await res.json() };
  };
  test('the three routes are registered under their own capability flags, and the API version moved on', () => {
    const src = readRouterSource();
    for (const [m, p] of [['GET', '/en/api/super/site-setup'], ['POST', '/en/api/super/site-setup'], ['GET', '/en/api/super/site-config-export']]) assert.ok(src.includes(`["${m}", "${p}"`), `${m} ${p}`);
    assert.ok(SUPER_API_VERSION >= 16); assert.equal(getCapabilities().site_setup, true); assert.equal(getCapabilities().site_config_export, true);
  });
  test('GET reports the state and the presets; POST applies one and maps refusals to status codes', async () => {
    ({ db, env } = await pendingSite());
    const g = await call(handleGetSiteSetup, 'GET', '/en/api/super/site-setup');
    assert.equal(g.status, 200); assert.equal(g.body.setup.pending, true); assert.deepEqual(g.body.presets, presetChoices());
    const bad = await call(handleProvisionSiteSetup, 'POST', '/en/api/super/site-setup', { preset: 'nope' });
    assert.equal(bad.status, 422); assert.equal(bad.body.success, false); assert.equal(bad.body.error, 'unknown_preset'); assert.ok(bad.body.message);
    const good = await call(handleProvisionSiteSetup, 'POST', '/en/api/super/site-setup', { preset: 'research' });
    assert.equal(good.status, 200); assert.equal(good.body.success, true); assert.equal(good.body.setup.preset, 'research');
    const other = await call(handleProvisionSiteSetup, 'POST', '/en/api/super/site-setup', { preset: 'static' });
    assert.equal(other.status, 200, 'still pending and untouched by the owner: a different preset replaces it');
    await completeSetup(env, admin);
    const again = await call(handleProvisionSiteSetup, 'POST', '/en/api/super/site-setup', { preset: 'news' });
    assert.equal(again.status, 409); assert.equal(again.body.error, 'setup_not_pending');
  });
  test('a body that is not JSON is the same as an empty one: 422, nothing changed', async () => {
    ({ db, env } = await pendingSite());
    const res = await handleProvisionSiteSetup(new Request(`https://${HOST}/x`, { method: 'POST' }), env, null, '{nope');
    assert.equal(res.status, 422); assert.equal((await loadProfile(env, HOST)).preset, 'full');
  });
  test('the export carries a section filter and never more than was asked for', async () => {
    const all = await call(handleExportSiteConfig, 'GET', '/en/api/super/site-config-export');
    assert.equal(all.status, 200); assert.ok(all.body.included.length > 1);
    const one = await call(handleExportSiteConfig, 'GET', '/en/api/super/site-config-export?sections=structure');
    assert.deepEqual(one.body.included, ['structure']);
    const none = await call(handleExportSiteConfig, 'GET', '/en/api/super/site-config-export?sections=bogus');
    assert.deepEqual(none.body.included, [], 'a list with no valid id exports nothing');
  });
});

describe('dashboard API for the welcome panel', () => {
  const req = (method, path) => ({ method, url: `https://${HOST}${path}`, headers: new Headers(), json: async () => ({}) });
  const go = async (user, method, sub) => {
    const res = await route({ request: req(method, `/api/v1/site-profile${sub}`), env, path: `/api/v1/site-profile${sub}`, user });
    if (res === NOT_HANDLED) return { handled: false };
    return { handled: true, status: res.status, body: await res.json() };
  };
  test('staff see the state; only an administrator confirms; a viewer sees nothing', async () => {
    ({ db, env } = await pendingSite()); await provisionSite(env, HOST, { preset: 'news' });
    const ed = await go(editor, 'GET', '/setup'); assert.equal(ed.status, 200); assert.equal(ed.body.setup.pending, true); assert.equal(ed.body.canConfirm, false); assert.equal(ed.body.livePreset, 'news');
    assert.equal((await go(admin, 'GET', '/setup')).body.canConfirm, true);
    assert.equal((await go(viewer, 'GET', '/setup')).status, 403);
    assert.equal((await go(editor, 'POST', '/setup/complete')).status, 403);
    assert.equal((await getSetup(env)).pending, true, 'an editor cannot end the wizard');
    assert.equal((await go(admin, 'POST', '/setup/complete')).status, 200);
    assert.equal((await go(admin, 'GET', '/setup')).body.setup.pending, false);
  });
  test('while the setup is pending the first next step asks for confirmation, and it disappears afterwards', async () => {
    ({ db, env } = await pendingSite());
    const a = await go(admin, 'GET', '/next-steps'); assert.equal(a.body.steps[0].id, 'setup'); assert.equal(a.body.total, a.body.steps.length);
    await completeSetup(env, admin);
    const b = await go(admin, 'GET', '/next-steps'); assert.ok(!b.body.steps.some((s) => s.id === 'setup'));
  });
});
