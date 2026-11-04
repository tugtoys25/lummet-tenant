// Phase 5: unified look-and-feel settings. Every key has one owner; validation; API; guidance facts.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { GROUPS, OWNED_ELSEWHERE, allFields, ownedKeys, groupOf, settingsManifest, validateSettingsInput } from '../worker/site-profile/settings-groups.js';
import { route } from '../worker/api/routes/site-profile.js';
import { loadFacts } from '../worker/site-profile/facts.js';
import { nextSteps } from '../worker/site-profile/guidance.js';
import { defaultProfile } from '../worker/site-profile/profile.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
const admin = { user_id: 1, role: 'admin' };
const editor = { user_id: 2, role: 'editor' };
const req = (method, path, body) => ({ method, url: `https://t.example${path}`, headers: new Headers(), json: async () => body });

describe('settings ownership', () => {
  test('every key is owned by exactly one group, and every group exists', () => {
    const keys = allFields().map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, 'duplicate field key');
    for (const k of Object.keys(OWNED_ELSEWHERE)) assert.ok(!keys.includes(k), `${k} is both a field and owned elsewhere`);
    const ids = new Set(GROUPS.map((g) => g.id));
    for (const f of allFields()) assert.ok(ids.has(f.group), `${f.key} -> unknown group ${f.group}`);
    for (const [k, v] of Object.entries(OWNED_ELSEWHERE)) assert.ok(ids.has(v.group), `${k} -> unknown group`);
    for (const g of GROUPS) assert.ok(g.label && g.help && g.screen, g.id);
  });

  test('no orphans: every setting key used by the settings and header screens is owned', () => {
    const owned = ownedKeys();
    const files = readdirSync(join(ROOT, 'templates/pages/admin/settings')).map((f) => `templates/pages/admin/settings/${f}`).concat(['templates/pages/admin/header-hero.html', 'templates/pages/admin/settings.html']);
    const KEY = /\b(?:name|id)="((?:site|theme|footer|ga|gpwa|contact|default_country|country_directory|news_inline)_[a-z0-9_]+|default_country)"/g;
    const UI_IDS = new Set(); // element ids that are not settings (none of the prefixes above are used for UI ids today)
    const orphans = new Set();
    for (const f of files) for (const m of read(f).matchAll(KEY)) if (!owned.has(m[1]) && !UI_IDS.has(m[1])) orphans.add(`${m[1]} (${f})`);
    assert.deepEqual([...orphans], []);
  });

  test('groupOf finds the group for fields and for keys edited elsewhere', () => {
    assert.equal(groupOf('site_logo'), 'identity');
    assert.equal(groupOf('theme_primary'), 'theme');
    assert.equal(groupOf('site_hero_title'), 'hero');
    assert.equal(groupOf('gpwa_seal_html'), 'analytics');
    assert.equal(groupOf('nope'), null);
  });

  test('manifest marks fields unavailable when their module is off, and never leaks regexes', () => {
    const m = settingsManifest((id) => id !== 'search' && id !== 'casino');
    const header = m.find((g) => g.id === 'header');
    assert.equal(header.fields.find((f) => f.key === 'site_header_show_search').available, false);
    assert.equal(header.fields.find((f) => f.key === 'site_header_sticky').available, true);
    assert.equal(m.find((g) => g.id === 'compliance').available, false);
    assert.ok(!JSON.stringify(m).includes('pattern'));
    for (const g of m) for (const f of g.fields) assert.ok(f.label, f.key);
  });
});

describe('settings validation', () => {
  test('accepts good values and rejects unknown keys and bad values with plain messages', () => {
    const ok = validateSettingsInput({ site_name: ' Acme  ', theme_primary: '#1a73e8', theme_card_radius: '12px', theme_preset: 'forest', contact_email: 'a@b.co', default_country: 'gb', ga_measurement_id: 'G-ABCD1234' });
    assert.deepEqual(ok.errors, []);
    assert.equal(ok.clean.site_name, 'Acme'); assert.equal(ok.clean.default_country, 'GB');
    const bad = validateSettingsInput({ theme_primary: 'red', theme_card_radius: 'big', theme_preset: 'neon', contact_email: 'nope', site_url: 'ftp://x', site_logo: 'javascript:alert(1)', ga_measurement_id: 'UA-1', hacker_key: 1 });
    assert.equal(bad.errors.length, 8);
    assert.deepEqual(bad.clean, {});
    assert.match(bad.errors.join(' '), /cannot be changed here/);
  });

  test('header and hero keys reuse the original validators (clamping, enums, fallbacks)', () => {
    const r = validateSettingsInput({ site_hero_overlay_opacity: '999', site_header_sticky: false, site_hero_title: '' });
    assert.equal(r.clean.site_hero_overlay_opacity, '85');
    assert.equal(r.clean.site_header_sticky, '0');
    assert.equal(r.clean.site_hero_title, 'Find Your Perfect Casino');
  });
});

describe('settings API', () => {
  let db, env;
  beforeEach(() => { db = createTestDb(); applyMigrations(db); env = { DB: db }; });

  test('editors can read and use the read-only preview, only administrators write, visitors get nothing', async () => {
    const at = (method, path, user, body) => route({ request: req(method, path, body), env, path, user });
    const viewer = { user_id: 9, role: 'viewer' };
    assert.equal((await at('GET', '/api/v1/site-profile/settings', editor)).status, 200);
    assert.equal((await at('GET', '/api/v1/site-profile', editor)).status, 200);
    assert.equal((await at('POST', '/api/v1/site-profile/preview', editor, defaultProfile())).status, 200);
    assert.equal((await at('POST', '/api/v1/site-profile/settings', editor, { settings: { site_name: 'X' } })).status, 403);
    assert.equal((await at('POST', '/api/v1/site-profile', editor, defaultProfile())).status, 403);
    assert.equal(await db.prepare("SELECT value FROM settings WHERE key='site_name'").first(), null);
    for (const [m, p] of [['GET', '/api/v1/site-profile/settings'], ['GET', '/api/v1/site-profile'], ['GET', '/api/v1/site-profile/next-steps'], ['POST', '/api/v1/site-profile/preview']])
      assert.equal((await at(m, p, viewer, defaultProfile())).status, 403, `${m} ${p} must refuse the public viewer role`);
  });

  test('GET returns every group with current values and defaults', async () => {
    await db.prepare("INSERT INTO settings(key,value) VALUES('site_name','Acme')").run();
    const r = await route({ request: req('GET', '/api/v1/site-profile/settings'), env, path: '/api/v1/site-profile/settings', user: admin });
    const j = await r.json();
    assert.equal(j.groups.length, GROUPS.length);
    assert.equal(j.values.site_name, 'Acme');
    assert.equal(j.values.site_header_sticky, '1');
    assert.equal(j.values.site_hero_enabled, '1');
  });

  test('POST saves only validated keys, keeps stickiness in step with the profile, and supports dry run', async () => {
    const post = (body) => route({ request: req('POST', '/api/v1/site-profile/settings', body), env, path: '/api/v1/site-profile/settings', user: admin });
    let r = await post({ settings: { site_name: 'Acme', theme_primary: 'red' } });
    assert.equal(r.status, 422);
    assert.equal(await db.prepare("SELECT value FROM settings WHERE key='site_name'").first(), null);
    r = await post({ dryRun: true, settings: { site_name: 'Acme' } });
    assert.deepEqual((await r.json()).changed, ['site_name']);
    assert.equal(await db.prepare("SELECT value FROM settings WHERE key='site_name'").first(), null);
    r = await post({ settings: { site_name: 'Acme', site_header_sticky: false, theme_primary: '#112233' } });
    assert.equal(r.status, 200);
    assert.equal((await db.prepare("SELECT value FROM settings WHERE key='site_name'").first()).value, 'Acme');
    assert.equal((await db.prepare("SELECT value FROM settings WHERE key='theme_primary'").first()).value, '#112233');
    const prof = JSON.parse((await db.prepare("SELECT value FROM settings WHERE key='site_profile'").first()).value);
    assert.equal(prof.header.sticky, false);
    assert.equal((await post({ settings: {} })).status, 422);
  });
});

describe('guidance uses real identity settings', () => {
  test('logo, name, description and share image are detected from their own keys', async () => {
    const db = createTestDb(); applyMigrations(db); const env = { DB: db };
    let f = await loadFacts(env);
    assert.equal(f.hasLogo, false); assert.equal(f.hasSiteName, false);
    let ids = nextSteps(defaultProfile(), f).steps.map((s) => s.id);
    for (const id of ['name', 'logo', 'description', 'share']) assert.ok(ids.includes(id), id);
    // an unrelated key that merely contains "logo" must no longer count as a logo
    await db.prepare("INSERT INTO settings(key,value) VALUES('site_header_logo_mode','logo')").run();
    assert.equal((await loadFacts(env)).hasLogo, false);
    await db.prepare("INSERT INTO settings(key,value) VALUES('site_logo','/media/l.png'),('site_name','A'),('site_description','d'),('site_og_image','/media/o.png')").run();
    f = await loadFacts(env);
    assert.deepEqual([f.hasLogo, f.hasSiteName, f.hasDescription, f.hasShareImage], [true, true, true, true]);
    ids = nextSteps(defaultProfile(), f).steps.map((s) => s.id);
    for (const id of ['name', 'logo', 'description', 'share']) assert.ok(!ids.includes(id), id);
  });
});
