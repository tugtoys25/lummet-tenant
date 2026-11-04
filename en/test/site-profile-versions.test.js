// Phase 6: draft, publish (three-way merge), numbered versions, rollback, audit, permissions, preview.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { route } from '../worker/api/routes/site-profile-versions.js';
import { route as profileRoute } from '../worker/api/routes/site-profile.js';
import {
  saveDraft, publishDraft, rollbackTo, discardDraft, readLiveDocument, diffDocuments, mergeDocuments, normalizeDocument,
  getDraft, listVersions, listAudit, previewOverlay, tablesReady, permissionsFor, latestVersion, configState,
} from '../worker/site-profile/versions.js';
import { applyPreset, defaultProfile } from '../worker/site-profile/profile.js';
import { loadProfile } from '../worker/site-profile/store.js';
import { hasPreviewCookie, previewCookie, decoratePreview } from '../worker/site-profile/preview.js';
import { isCacheableRequest } from '../worker/page-cache.js';
import { getSiteSettings } from '../worker/site-settings/get-site-settings.js';
import { getSettingForRequest } from '../worker/database/settings.js';

const admin = { user_id: 1, email: 'boss@t.example', role: 'admin' };
const editor = { user_id: 2, email: 'ed@t.example', role: 'editor' };
const viewer = { user_id: 3, email: 'v@t.example', role: 'viewer' };
const req = (method, path, body, headers = {}) => ({ method, url: `https://t.example${path}`, headers: new Headers(headers), json: async () => body });
const call = (user, method, sub, body, headers) => route({ request: req(method, `/api/v1/config${sub}`, body, headers), env: ENV, path: `/api/v1/config${sub}`, user });
let db, ENV;
const setting = async (k) => (await db.prepare('SELECT value FROM settings WHERE key = ?').bind(k).first())?.value ?? null;
const liveProfile = async () => JSON.parse((await db.prepare("SELECT value FROM settings WHERE key='site_profile'").first()).value);

beforeEach(() => { db = createTestDb(); applyMigrations(db); ENV = { DB: db }; });

describe('permissions', () => {
  test('editor reads and edits the draft, admin publishes, the public viewer role gets nothing', () => {
    assert.deepEqual(permissionsFor(viewer), { view: false, editDraft: false, preview: false, publish: false, rollback: false, discard: false });
    assert.equal(permissionsFor(editor).view, true);
    assert.equal(permissionsFor(editor).editDraft, true); assert.equal(permissionsFor(editor).publish, false);
    assert.equal(permissionsFor(admin).publish, true); assert.equal(permissionsFor(admin).rollback, true);
    assert.equal(permissionsFor(null).view, false);
  });
  test('the API enforces the matrix', async () => {
    assert.equal((await call(null, 'GET', '/state')).status, 401);
    assert.equal((await call(viewer, 'GET', '/state')).status, 403);
    assert.equal((await call(editor, 'GET', '/state')).status, 200);
    assert.equal((await call(viewer, 'PUT', '/draft', { settings: { site_name: 'A' } })).status, 403);
    assert.equal((await call(editor, 'PUT', '/draft', { settings: { site_name: 'A' } })).status, 200);
    assert.equal((await call(editor, 'POST', '/publish', {})).status, 403);
    assert.equal((await call(editor, 'POST', '/rollback', { version: 1 })).status, 403);
    assert.equal((await call(editor, 'DELETE', '/draft')).status, 403);
    assert.equal((await call(viewer, 'POST', '/preview', { on: true })).status, 403);
    assert.equal((await call(admin, 'POST', '/publish', {})).status, 200);
  });
  test('cross-site writes are refused, same-site and header-less ones pass', async () => {
    assert.equal((await call(admin, 'PUT', '/draft', { settings: { site_name: 'A' } }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await call(admin, 'PUT', '/draft', { settings: { site_name: 'A' } }, { Origin: 'https://t.example' })).status, 200);
  });
});

describe('draft', () => {
  test('autosave never touches the live site and creates the baseline version', async () => {
    const r = await saveDraft(ENV, editor, { settings: { site_name: 'Draft Co', theme_primary: '#112233' } });
    assert.equal(r.draft.revision, 1);
    assert.equal(await setting('site_name'), null);
    assert.equal(await setting('theme_primary'), null);
    const v = await listVersions(ENV);
    assert.equal(v.current, 1); assert.equal(v.versions[0].source, 'baseline');
    assert.deepEqual(r.draft.changes.map((c) => c.key).sort(), ['site_name', 'theme_primary']);
    assert.deepEqual(r.draft.contributors, ['ed@t.example']);
  });
  test('invalid input is refused with the reason and nothing is stored', async () => {
    let r = await saveDraft(ENV, editor, { settings: { theme_primary: 'red' } });
    assert.ok(r.errors?.length); assert.equal(await getDraft(ENV), null);
    r = await saveDraft(ENV, editor, { settings: { nope: 'x' } }); assert.ok(r.errors?.length);
    r = await saveDraft(ENV, editor, { profile: { ...defaultProfile(), homepage: false, landing: '/en/casino', modules: { ...defaultProfile().modules, casino: false } } });
    assert.ok(r.errors?.length);
    assert.ok((await saveDraft(ENV, editor, {})).errors);
  });
  test('two editors cannot silently overwrite each other (revision check)', async () => {
    const a = await saveDraft(ENV, editor, { settings: { site_name: 'A' } });
    const b = await saveDraft(ENV, admin, { settings: { site_short_name: 'B' }, revision: a.draft.revision });
    assert.equal(b.draft.revision, 2); assert.deepEqual(b.draft.contributors, ['ed@t.example', 'boss@t.example']);
    const stale = await saveDraft(ENV, editor, { settings: { site_name: 'C' }, revision: 1 });
    assert.equal(stale.conflict, true); assert.equal(stale.draft.revision, 2);
    assert.equal((await getDraft(ENV)).document.settings.site_name, 'A');
    // a draft that was published or discarded meanwhile is also reported
    await discardDraft(ENV, admin);
    assert.equal((await saveDraft(ENV, editor, { settings: { site_name: 'D' }, revision: 2 })).conflict, true);
  });
  test('profile edits carry stickiness into the settings value and back', async () => {
    let r = await saveDraft(ENV, editor, { profile: { ...defaultProfile(), header: { sticky: false, autoPrune: true } } });
    assert.equal(r.draft.document.settings.site_header_sticky, '0');
    r = await saveDraft(ENV, editor, { settings: { site_header_sticky: '1' } });
    assert.equal(r.draft.document.profile.header.sticky, true);
  });
  test('discard removes the draft and is audited', async () => {
    await saveDraft(ENV, editor, { settings: { site_name: 'A' } });
    assert.equal((await discardDraft(ENV, admin)).discarded, true);
    assert.equal(await getDraft(ENV), null);
    assert.equal((await listAudit(ENV)).entries[0].action, 'draft.discard');
    assert.equal((await discardDraft(ENV, admin)).discarded, false);
  });
});

describe('publish', () => {
  test('applies the draft, numbers it, audits it and clears the draft', async () => {
    await saveDraft(ENV, editor, { profile: applyPreset('news'), settings: { site_name: 'The Daily', theme_primary: '#112233' } });
    const r = await publishDraft(ENV, 't.example', admin, { note: 'Launch as news site' });
    assert.equal(r.published, true); assert.equal(r.version, 2);
    assert.equal(await setting('site_name'), 'The Daily');
    assert.equal(await setting('theme_primary'), '#112233');
    const p = await liveProfile(); assert.equal(p.preset, 'news'); assert.equal(p.modules.casino, false);
    assert.equal(await getDraft(ENV), null);
    const vs = await listVersions(ENV);
    assert.deepEqual(vs.versions.map((v) => [v.version, v.source, v.current]), [[2, 'publish', true], [1, 'baseline', false]]);
    assert.equal(vs.versions[0].note, 'Launch as news site'); assert.equal(vs.versions[0].author, 'boss@t.example');
    const a = (await listAudit(ENV)).entries[0];
    assert.equal(a.action, 'publish'); assert.equal(a.version, 2); assert.ok(a.diff.some((d) => d.key === 'site_name' && d.to === 'The Daily'));
  });
  test('refuses when there is no draft, or nothing differs', async () => {
    assert.equal((await publishDraft(ENV, 'h', admin)).status, 409);
    await saveDraft(ENV, editor, { settings: { site_name: 'A' } });
    await saveDraft(ENV, editor, { settings: { site_name: '' } });
    const r = await publishDraft(ENV, 'h', admin);
    assert.equal(r.empty, true);
    assert.equal(await latestVersion(ENV), 1);
  });
  test('a stale revision is refused', async () => {
    await saveDraft(ENV, editor, { settings: { site_name: 'A' } });
    const r = await publishDraft(ENV, 'h', admin, { revision: 7 });
    assert.equal(r.conflict, true); assert.equal(await setting('site_name'), null);
  });
  test('three-way: a change made elsewhere meanwhile is kept, the editor’s change is added', async () => {
    await saveDraft(ENV, editor, { settings: { site_name: 'Mine' } });
    // someone saves a different setting straight to the live site (classic screen)
    await db.prepare("INSERT INTO settings(key,value) VALUES('site_description','Set elsewhere')").run();
    const r = await publishDraft(ENV, 'h', admin, {});
    assert.equal(r.published, true);
    assert.equal(await setting('site_name'), 'Mine');
    assert.equal(await setting('site_description'), 'Set elsewhere');
    assert.deepEqual(r.changes.map((c) => c.key), ['site_name']);
  });
  test('three-way: the same item changed on both sides is a conflict the admin resolves', async () => {
    await saveDraft(ENV, editor, { settings: { site_name: 'Mine' } });
    await db.prepare("INSERT INTO settings(key,value) VALUES('site_name','Theirs')").run();
    let r = await publishDraft(ENV, 'h', admin, {});
    assert.equal(r.conflict, true); assert.equal(r.conflicts[0].key, 'site_name'); assert.equal(r.conflicts[0].mine, 'Mine'); assert.equal(r.conflicts[0].live, 'Theirs');
    assert.equal(await setting('site_name'), 'Theirs');
    r = await publishDraft(ENV, 'h', admin, { resolve: 'live' });
    assert.equal(r.empty, true); // keeping live leaves nothing to publish
    await saveDraft(ENV, editor, { settings: { site_name: 'Mine' } }).catch(() => {});
  });
  test('conflict resolved in favour of the draft', async () => {
    await saveDraft(ENV, editor, { settings: { site_name: 'Mine' } });
    await db.prepare("INSERT INTO settings(key,value) VALUES('site_name','Theirs')").run();
    const r = await publishDraft(ENV, 'h', admin, { resolve: 'mine' });
    assert.equal(r.published, true); assert.equal(await setting('site_name'), 'Mine');
  });
  test('a profile that would break the site is refused at publish time too', async () => {
    // The draft redirects removed pages to the casino list; meanwhile live switches the casino module off.
    await saveDraft(ENV, editor, { profile: { ...defaultProfile(), disabled: { mode: '301', redirectTo: '/en/casino' } } });
    const p = defaultProfile(); p.modules.casino = false;
    await db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('site_profile', ?)").bind(JSON.stringify(p)).run();
    const before = await setting('site_profile'), versionBefore = await latestVersion(ENV);
    const r = await publishDraft(ENV, 'h', admin, {});
    assert.equal(r.published, undefined);
    assert.equal(r.status, 422);
    assert.ok(r.errors.some((e) => /switched off/i.test(e)), `unexpected errors: ${JSON.stringify(r.errors)}`);
    assert.equal(await setting('site_profile'), before); // nothing was written
    assert.equal(await latestVersion(ENV), versionBefore); // no new version was minted
    assert.ok(await getDraft(ENV)); // the draft is kept so the editor can fix it
  });
  test('stickiness stays in step after publish', async () => {
    await saveDraft(ENV, editor, { profile: { ...defaultProfile(), header: { sticky: false, autoPrune: true } } });
    await publishDraft(ENV, 'h', admin, {});
    assert.equal(await setting('site_header_sticky'), '0');
    assert.equal((await liveProfile()).header.sticky, false);
  });
});

describe('rollback and history', () => {
  test('restores the exact earlier configuration, including keys that did not exist then', async () => {
    await saveDraft(ENV, editor, { profile: applyPreset('news'), settings: { site_name: 'Second', theme_primary: '#445566' } });
    await publishDraft(ENV, 'h', admin, { note: 'v2' });
    const r = await rollbackTo(ENV, 'h', admin, 1, 'Back to start');
    assert.equal(r.restored, true); assert.equal(r.version, 3); assert.equal(r.from, 1);
    assert.equal(await setting('site_name'), null);
    assert.equal(await setting('theme_primary'), null);
    assert.equal((await liveProfile()).modules.casino, true);
    const vs = await listVersions(ENV);
    assert.deepEqual(vs.versions.map((v) => [v.version, v.source]), [[3, 'rollback'], [2, 'publish'], [1, 'baseline']]);
    assert.equal(vs.versions[0].restored_from, 1);
    assert.equal((await listAudit(ENV)).entries[0].action, 'rollback');
    // roll forward again: history is never rewritten
    assert.equal((await rollbackTo(ENV, 'h', admin, 2)).version, 4);
    assert.equal(await setting('site_name'), 'Second');
  });
  test('rollback to the current state, an unknown version or a bad id is refused', async () => {
    await saveDraft(ENV, editor, { settings: { site_name: 'A' } }); await publishDraft(ENV, 'h', admin, {});
    assert.equal((await rollbackTo(ENV, 'h', admin, 2)).unchanged, true);
    assert.equal((await rollbackTo(ENV, 'h', admin, 99)).status, 404);
    assert.equal((await call(admin, 'POST', '/rollback', { version: 'x' })).status, 422);
  });
  test('an open draft survives a rollback and still publishes only its own changes', async () => {
    await saveDraft(ENV, editor, { settings: { site_name: 'A' } }); await publishDraft(ENV, 'h', admin, {});
    await saveDraft(ENV, editor, { settings: { site_short_name: 'S' } });
    await rollbackTo(ENV, 'h', admin, 1);
    const r = await publishDraft(ENV, 'h', admin, {});
    assert.equal(r.published, true);
    assert.equal(await setting('site_short_name'), 'S'); assert.equal(await setting('site_name'), null);
  });
  test('version details show what changed and what restoring would change', async () => {
    await saveDraft(ENV, editor, { settings: { site_name: 'A' } }); await publishDraft(ENV, 'h', admin, {});
    const j = await (await call(editor, 'GET', '/versions/2')).json();
    assert.deepEqual(j.changesFromPrevious.map((c) => c.key), ['site_name']);
    assert.deepEqual(j.changesIfRestored, []);
    const j1 = await (await call(editor, 'GET', '/versions/1')).json();
    assert.deepEqual(j1.changesIfRestored.map((c) => [c.key, c.to]), [['site_name', '(empty)']]);
    assert.equal((await call(editor, 'GET', '/versions/99')).status, 404);
  });
  test('lists page with a cursor', async () => {
    for (let i = 0; i < 4; i++) { await saveDraft(ENV, editor, { settings: { site_name: 'N' + i } }); await publishDraft(ENV, 'h', admin, {}); }
    const p1 = await listVersions(ENV, { limit: 2 });
    assert.deepEqual(p1.versions.map((v) => v.version), [5, 4]); assert.equal(p1.next, 4);
    const p2 = await listVersions(ENV, { limit: 2, before: p1.next });
    assert.deepEqual(p2.versions.map((v) => v.version), [3, 2]);
    const a = await listAudit(ENV, { limit: 2 }); assert.equal(a.entries.length, 2); assert.ok(a.next);
  });
});

describe('older endpoints are recorded as versions', () => {
  test('a direct profile save and a direct settings save each create a version and an audit entry', async () => {
    const post = (path, body) => profileRoute({ request: req('POST', path, body), env: ENV, path, user: admin });
    let r = await post('/api/v1/site-profile/settings', { settings: { site_name: 'Direct' } });
    assert.equal(r.status, 200);
    r = await post('/api/v1/site-profile', applyPreset('static'));
    assert.equal(r.status, 200);
    const vs = await listVersions(ENV);
    assert.deepEqual(vs.versions.map((v) => [v.version, v.source]), [[3, 'direct'], [2, 'direct'], [1, 'baseline']]);
    assert.deepEqual((await listAudit(ENV)).entries.map((e) => e.action), ['direct.profile', 'direct.settings']);
    // the baseline is what was there before the first direct save, so it can be restored
    assert.equal((await rollbackTo(ENV, 'h', admin, 1)).restored, true);
    assert.equal(await setting('site_name'), null);
  });
  test('a save that changes nothing records nothing', async () => {
    const path = '/api/v1/site-profile/settings';
    await profileRoute({ request: req('POST', path, { settings: { site_name: 'X' } }), env: ENV, path, user: admin });
    await profileRoute({ request: req('POST', path, { settings: { site_name: 'X' } }), env: ENV, path, user: admin });
    assert.equal(await latestVersion(ENV), 2);
  });
});

describe('merge and diff', () => {
  test('diff speaks in labels and ignores the mirrored stickiness leaf', () => {
    const a = normalizeDocument({ profile: defaultProfile(), settings: {} });
    const p = applyPreset('news'); p.header.sticky = false;
    const b = normalizeDocument({ profile: p, settings: { site_name: 'N' } });
    const d = diffDocuments(a, b);
    assert.ok(d.some((c) => c.area === 'Modules' && c.key === 'modules.casino' && c.label === 'Casino listings' && c.from === 'on' && c.to === 'off'));
    assert.ok(d.some((c) => c.key === 'site_name' && c.label === 'Site name'));
    assert.equal(d.filter((c) => c.key === 'header.sticky').length, 0);
    assert.equal(d.filter((c) => c.key === 'site_header_sticky').length, 1);
    assert.deepEqual(diffDocuments(a, a), []);
  });
  test('merge is symmetric when only one side changes', () => {
    const base = normalizeDocument({ profile: defaultProfile(), settings: { site_name: 'B' } });
    const mine = normalizeDocument({ profile: defaultProfile(), settings: { site_name: 'M' } });
    assert.equal(mergeDocuments(base, base, mine).doc.settings.site_name, 'M');
    assert.equal(mergeDocuments(base, mine, base).doc.settings.site_name, 'M');
    assert.equal(mergeDocuments(base, mine, mine).conflicts.length, 0);
  });
});

describe('preview', () => {
  test('overlay is the state after publishing; loadProfile and settings use it only when set on the request', async () => {
    await saveDraft(ENV, editor, { profile: applyPreset('news'), settings: { site_name: 'Preview Name' } });
    const o = await previewOverlay(ENV);
    assert.equal(o.profile.modules.casino, false); assert.equal(o.settings.site_name, 'Preview Name');
    assert.equal((await loadProfile(ENV, 'h')).modules.casino, true);
    const penv = Object.assign(Object.create(ENV), { __preview: o });
    assert.equal((await loadProfile(penv, 'h')).modules.casino, false);
    const live = JSON.stringify(await getSiteSettings(db, 'https://t.example', ENV));
    assert.ok(JSON.stringify(await getSiteSettings(db, 'https://t.example', penv)).includes('Preview Name'));
    assert.ok(!live.includes('Preview Name'));
  });
  test('no draft means no overlay', async () => { assert.equal(await previewOverlay(ENV), null); });
  test('cookie helpers, cache bypass and banner', async () => {
    assert.match(previewCookie(true), /cfg_preview=1;.*HttpOnly.*Secure.*SameSite=Lax.*Max-Age=3600/);
    assert.match(previewCookie(false), /Max-Age=0/);
    const r = (cookie) => new Request('https://t.example/en/news', { headers: cookie ? { cookie } : {} });
    assert.equal(hasPreviewCookie(r('session=abc; cfg_preview=1')), true);
    assert.equal(hasPreviewCookie(r('session=abc')), false);
    assert.equal(isCacheableRequest(r(''), 'newsList'), true);
    assert.equal(isCacheableRequest(r('cfg_preview=1'), 'newsList'), false);
    const out = await decoratePreview(new Response('<html><body>Hi</body></html>', { headers: { 'content-type': 'text/html' } }));
    const html = await out.text();
    assert.match(html, /Draft preview/); assert.equal(out.headers.get('cache-control'), 'private, no-store');
    const json = await decoratePreview(new Response('{}', { headers: { 'content-type': 'application/json' } }));
    assert.equal(await json.text(), '{}');
  });
  test('the API sets and clears the cookie', async () => {
    let r = await call(editor, 'POST', '/preview', { on: true });
    assert.equal(r.status, 200); assert.match(r.headers.get('set-cookie'), /cfg_preview=1/);
    r = await call(editor, 'POST', '/preview', { on: false });
    assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
  });
});

describe('without migration 0009', () => {
  beforeEach(async () => { for (const t of ['config_draft', 'config_versions', 'config_audit']) await db.prepare(`DROP TABLE ${t}`).run(); });
  test('state explains what is missing and the live site is untouched', async () => {
    assert.equal(await tablesReady(ENV), false);
    const s = await configState(ENV, admin);
    assert.equal(s.ready, false); assert.match(s.message, /0009/);
    assert.equal((await call(admin, 'PUT', '/draft', { settings: { site_name: 'A' } })).status, 503);
    assert.equal((await call(admin, 'GET', '/versions')).status, 503);
    assert.equal(await previewOverlay(ENV), null);
  });
  test('direct saves still work, unrecorded', async () => {
    const path = '/api/v1/site-profile/settings';
    const r = await profileRoute({ request: req('POST', path, { settings: { site_name: 'Still works' } }), env: ENV, path, user: admin });
    assert.equal(r.status, 200); assert.equal(await setting('site_name'), 'Still works');
  });
});

describe('state for the screen', () => {
  test('reports live version, the draft with its changes and whether live moved on', async () => {
    let s = await configState(ENV, editor);
    assert.equal(s.ready, true); assert.equal(s.draft, null); assert.equal(s.version, 0);
    await saveDraft(ENV, editor, { settings: { site_name: 'A' } });
    await db.prepare("INSERT INTO settings(key,value) VALUES('site_description','x')").run();
    s = await configState(ENV, admin);
    assert.equal(s.version, 1); assert.equal(s.draft.changes.length, 1); assert.equal(s.permissions.publish, true);
    assert.equal(s.live.settings.site_description, 'x');
  });
});

describe('autosave of half-typed values', () => {
  test('valid keys are kept and invalid ones are reported one by one', async () => {
    const r = await saveDraft(ENV, editor, { settings: { site_name: 'Ok', theme_primary: '#12', theme_text: '#223344' } });
    assert.deepEqual(r.rejected.map((x) => [x.key, x.label]), [['theme_primary', 'Primary colour']]);
    assert.equal(r.draft.document.settings.site_name, 'Ok'); assert.equal(r.draft.document.settings.theme_text, '#223344');
    assert.equal(r.draft.document.settings.theme_primary, undefined);
    const api = await (await call(editor, 'PUT', '/draft', { settings: { theme_primary: '#12' }, revision: r.draft.revision })).json();
    assert.equal(api.success, false); // nothing valid to save at all
  });
  test('effective view shows the post-publish profile and only the changed settings', async () => {
    const r = await saveDraft(ENV, editor, { profile: applyPreset('news'), settings: { site_name: 'N' } });
    assert.equal(r.draft.effective.profile.modules.casino, false);
    assert.deepEqual(Object.keys(r.draft.effective.settings), ['site_name']);
  });
  test('publish preview carries the impact of removing pages', async () => {
    await saveDraft(ENV, editor, { profile: applyPreset('static') });
    const j = await (await call(editor, 'GET', '/publish-preview')).json();
    assert.equal(j.draft, true); assert.ok(j.impact.removed.length > 0); assert.ok(j.summary.includes('change'));
  });
});

describe('draft-aware direct setting reads', () => {
  test('a draft value wins only while previewing, and an emptied draft value reads as unset', async () => {
    await db.prepare("INSERT INTO settings(key,value) VALUES('news_inline_ad','live ad')").run();
    await saveDraft(ENV, editor, { settings: { news_inline_ad: 'draft ad' } });
    const o = await previewOverlay(ENV);
    const penv = Object.assign(Object.create(ENV), { __preview: o });
    assert.equal(await getSettingForRequest(ENV, 'news_inline_ad'), 'live ad');
    assert.equal(await getSettingForRequest(penv, 'news_inline_ad'), 'draft ad');
    assert.equal(await getSettingForRequest(penv, 'country_directory_featured_label'), null); // untouched keys fall through to live
    const emptied = Object.assign(Object.create(ENV), { __preview: { settings: { news_inline_ad: '' } } });
    assert.equal(await getSettingForRequest(emptied, 'news_inline_ad'), null);
  });
});

describe('history cannot be rewritten', () => {
  test('audit rows and published version documents refuse edits, and the audit log refuses deletes', async () => {
    await saveDraft(ENV, editor, { settings: { site_name: 'Kept' } });
    assert.equal((await publishDraft(ENV, 'h', admin, {})).published, true);
    const audit = await db.prepare('SELECT id FROM config_audit ORDER BY id DESC LIMIT 1').first();
    assert.ok(audit);
    await assert.rejects(() => db.prepare("UPDATE config_audit SET summary = 'x' WHERE id = ?").bind(audit.id).run(), /append-only/);
    await assert.rejects(() => db.prepare('DELETE FROM config_audit WHERE id = ?').bind(audit.id).run(), /append-only/);
    await assert.rejects(() => db.prepare("UPDATE config_versions SET document = '{}' WHERE version = 2").run(), /immutable/);
    assert.equal((await listAudit(ENV, {})).entries.length > 0, true);
  });
});

