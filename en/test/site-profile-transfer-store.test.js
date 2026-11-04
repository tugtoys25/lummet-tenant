// Phase 7D: presets, share links and cloning (worker/site-profile/transfer-store.js).
// Rules under test: a preset is a reviewed import, not a back door; a share code is shown once, only its hash is stored,
// and every refusal looks the same; the outgoing clone request only ever goes to a public https site, never follows a
// redirect, and stops reading at the size cap.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  transferTablesReady, NEEDS_TRANSFER_MIGRATION, listPresets, savePreset, getPresetText, updatePreset, deletePreset,
  listShares, createShare, revokeShare, exportForShare, normalizeSourceUrl, fetchShared, newToken,
  MAX_PRESETS, MAX_ACTIVE_SHARES, SHARE_HOURS, SHARE_PATH,
} from '../worker/site-profile/transfer-store.js';
import { MAX_IMPORT_BYTES, parseEnvelope } from '../worker/site-profile/transfer.js';
import { createTestDb } from './support/d1-shim.js';
import { admin, editor, freshSite, setSetting, addNav, auditActions } from './support/transfer-fixtures.js';

let db, env;
// a site with something to export in the theme section (sections without data are left out of an export)
beforeEach(async () => { ({ db, env } = freshSite()); await setSetting(db, 'theme_primary', '#112233'); });

const sql = (q, ...b) => db.prepare(q).bind(...b);
const row = (q, ...b) => sql(q, ...b).first();
const shareRow = (id) => row('SELECT * FROM config_shares WHERE id = ?', id);
const ago = (ms) => new Date(Date.now() + ms).toISOString().slice(0, 19).replace('T', ' ');
const newShare = async (o = {}) => { const r = await createShare(env, admin, { label: 'Staging', hours: 24, maxUses: 3, sections: ['settings.theme'], ...o }); assert.equal(r.created, true, JSON.stringify(r)); return r; };

describe('availability without migration 0011', () => {
  test('every presets and shares call says what to run, with status 503, and nothing throws', async () => {
    const bare = { DB: createTestDb() };
    assert.equal(await transferTablesReady(bare), false);
    assert.equal(await transferTablesReady({}), false);
    assert.equal(await transferTablesReady(null), false);
    for (const r of [await listPresets(bare), await savePreset(bare, admin, { name: 'Starter' }), await getPresetText(bare, 1), await updatePreset(bare, admin, 1, { name: 'x' }),
      await deletePreset(bare, admin, 1), await listShares(bare), await createShare(bare, admin, { sections: ['settings.theme'] }), await revokeShare(bare, admin, 1)]) {
      assert.equal(r.status, 503); assert.equal(r.error, NEEDS_TRANSFER_MIGRATION);
    }
    assert.match(NEEDS_TRANSFER_MIGRATION, /0011_config_transfer\.sql/);
  });
  test('the public endpoint refuses like any bad code when the tables are missing', async () => {
    const r = await exportForShare({ DB: createTestDb() }, newToken(), 'a.example');
    assert.equal(r.status, 403); assert.equal(r.error, 'This share link is not valid.');
  });
  test('with the tables present it reports ready and keeps saying so', async () => {
    assert.equal(await transferTablesReady(env), true); assert.equal(await transferTablesReady(env), true);
  });
});

describe('presets', () => {
  test('saving keeps the exported file, the section list and who saved it, and writes an audit entry', async () => {
    await setSetting(db, 'theme_primary', '#112233');
    const r = await savePreset(env, admin, { name: '  News   starter ', description: 'For news sites', sections: ['settings.theme'], host: 'a.example' });
    assert.equal(r.saved, true); assert.deepEqual(r.sections, ['settings.theme']); assert.ok(r.id > 0);
    const { presets, limit } = await listPresets(env);
    assert.equal(limit, MAX_PRESETS); assert.equal(presets.length, 1);
    assert.equal(presets[0].name, 'News starter'); assert.equal(presets[0].description, 'For news sites');
    assert.deepEqual(presets[0].sections, ['settings.theme']); assert.equal(presets[0].createdBy, admin.email); assert.ok(presets[0].bytes > 100);
    assert.ok((await auditActions(db)).includes('preset.save'));
    const text = (await getPresetText(env, r.id)).text;
    const p = await parseEnvelope(text); assert.ok(p.ok, JSON.stringify(p.errors));
  });
  test('the stored file is a valid export that the importer accepts with a matching checksum', async () => {
    await setSetting(db, 'theme_primary', '#abcdef');
    const r = await savePreset(env, admin, { name: 'Colours', sections: ['settings.theme'], host: 'a.example' });
    const got = await getPresetText(env, r.id); assert.equal(got.name, 'Colours');
    const p = await parseEnvelope(got.text); assert.ok(p.ok);
    assert.equal(JSON.parse(got.text).source.host, 'a.example');
  });
  test('a name of one letter, or only spaces and control characters, is refused with a plain message', async () => {
    for (const name of ['', ' ', 'a', '\u0001\u0002 ', undefined, null]) {
      const r = await savePreset(env, admin, { name, sections: ['settings.theme'], host: 'a.example' });
      assert.equal(r.status, 422); assert.match(r.errors[0], /at least 2 characters/);
    }
    assert.equal((await listPresets(env)).presets.length, 0);
  });
  test('a very long name is cut to the limit instead of failing', async () => {
    const r = await savePreset(env, admin, { name: 'N'.repeat(300), sections: ['settings.theme'], host: 'a.example' });
    assert.equal(r.saved, true); assert.equal((await listPresets(env)).presets[0].name.length, 80);
  });
  test('names are unique regardless of case, and the clash message is friendly', async () => {
    await savePreset(env, admin, { name: 'News Site', sections: ['settings.theme'], host: 'a.example' });
    const r = await savePreset(env, admin, { name: 'news site', sections: ['settings.theme'], host: 'a.example' });
    assert.equal(r.status, 409); assert.match(r.error, /already exists/);
    assert.equal((await listPresets(env)).presets.length, 1);
  });
  test('nothing to save is refused: unknown section ids and empty choices do not create a preset', async () => {
    const r = await savePreset(env, admin, { name: 'Empty', sections: ['no.such.section'], host: 'a.example' });
    assert.ok(r.errors?.length || r.error); assert.notEqual(r.saved, true);
    assert.equal((await listPresets(env)).presets.length, 0);
  });
  test('the library holds at most 50 presets; the 51st is refused until one is deleted', async () => {
    for (let i = 0; i < MAX_PRESETS; i++) await sql("INSERT INTO config_presets(name, name_key, envelope, sections) VALUES(?, ?, '{}', '[]')", `P${i}`, `p${i}`).run();
    const r = await savePreset(env, admin, { name: 'One more', sections: ['settings.theme'], host: 'a.example' });
    assert.equal(r.status, 409); assert.match(r.error, /up to 50 presets/);
    await sql("DELETE FROM config_presets WHERE name_key = 'p0'").run();
    assert.equal((await savePreset(env, admin, { name: 'One more', sections: ['settings.theme'], host: 'a.example' })).saved, true);
  });
  test('saving from the draft stores the draft, saving from live stores what is live', async () => {
    const { saveDraft } = await import('../worker/site-profile/versions.js');
    await setSetting(db, 'theme_primary', '#111111');
    await saveDraft(env, editor, { settings: { theme_primary: '#222222' } });
    const live = await savePreset(env, admin, { name: 'Live one', sections: ['settings.theme'], from: 'live', host: 'a.example' });
    const draft = await savePreset(env, admin, { name: 'Draft one', sections: ['settings.theme'], from: 'draft', host: 'a.example' });
    assert.match((await getPresetText(env, live.id)).text, /#111111/); assert.doesNotMatch((await getPresetText(env, live.id)).text, /#222222/);
    assert.match((await getPresetText(env, draft.id)).text, /#222222/);
  });
  test('rename changes name and description, keeps the file, and refuses a clash or a bad name', async () => {
    const a = await savePreset(env, admin, { name: 'Alpha', sections: ['settings.theme'], host: 'a.example' });
    await savePreset(env, admin, { name: 'Beta', sections: ['settings.theme'], host: 'a.example' });
    const before = (await getPresetText(env, a.id)).text;
    assert.deepEqual(await updatePreset(env, admin, a.id, { name: 'Alpha two', description: ' now with notes ' }), { updated: true });
    const p = (await listPresets(env)).presets.find((x) => x.id === a.id);
    assert.equal(p.name, 'Alpha two'); assert.equal(p.description, 'now with notes'); assert.equal((await getPresetText(env, a.id)).text, before);
    assert.equal((await updatePreset(env, admin, a.id, { name: 'BETA' })).status, 409);
    assert.equal((await updatePreset(env, admin, a.id, { name: 'x' })).status, 422);
    assert.equal((await updatePreset(env, admin, 9999, { name: 'Whatever' })).status, 404);
    assert.ok((await auditActions(db)).includes('preset.update'));
  });
  test('rename with only a description keeps the name; renaming to its own name in another case is allowed', async () => {
    const a = await savePreset(env, admin, { name: 'Alpha', sections: ['settings.theme'], host: 'a.example' });
    assert.deepEqual(await updatePreset(env, admin, a.id, { description: 'just words' }), { updated: true });
    assert.equal((await listPresets(env)).presets[0].name, 'Alpha');
    assert.deepEqual(await updatePreset(env, admin, a.id, { name: 'ALPHA' }), { updated: true });
    assert.equal((await listPresets(env)).presets[0].name, 'ALPHA');
  });
  test('delete removes only that preset and is audited; deleting again is a 404', async () => {
    const a = await savePreset(env, admin, { name: 'Alpha', sections: ['settings.theme'], host: 'a.example' });
    const b = await savePreset(env, admin, { name: 'Beta', sections: ['settings.theme'], host: 'a.example' });
    assert.deepEqual(await deletePreset(env, admin, a.id), { deleted: true });
    assert.deepEqual((await listPresets(env)).presets.map((p) => p.id), [b.id]);
    assert.equal((await deletePreset(env, admin, a.id)).status, 404);
    assert.ok((await auditActions(db)).includes('preset.delete'));
  });
  test('ids that are not numbers are a 404, never an error or another preset', async () => {
    await savePreset(env, admin, { name: 'Alpha', sections: ['settings.theme'], host: 'a.example' });
    for (const id of ['abc', '', null, undefined, '1; DROP TABLE config_presets', -1, 0]) {
      assert.equal((await getPresetText(env, id)).status, 404, String(id));
      assert.equal((await deletePreset(env, admin, id)).status, 404, String(id));
    }
    assert.equal((await listPresets(env)).presets.length, 1);
  });
  test('the list is sorted by name, ignoring case', async () => {
    for (const n of ['banana', 'Apple', 'cherry']) await savePreset(env, admin, { name: n, sections: ['settings.theme'], host: 'a.example' });
    assert.deepEqual((await listPresets(env)).presets.map((p) => p.name), ['Apple', 'banana', 'cherry']);
  });
  test('damaged section data in a stored row is shown as an empty list, not a crash', async () => {
    await sql("INSERT INTO config_presets(name, name_key, envelope, sections) VALUES('Odd', 'odd', '{}', 'not json')").run();
    await sql("INSERT INTO config_presets(name, name_key, envelope, sections) VALUES('Odd2', 'odd2', '{}', '{\"a\":1}')").run();
    await sql("INSERT INTO config_presets(name, name_key, envelope, sections) VALUES('Odd3', 'odd3', '{}', '[\"settings.theme\",\"bogus\",5]')").run();
    const list = (await listPresets(env)).presets;
    assert.deepEqual(list.map((p) => p.sections), [[], [], ['settings.theme']]);
  });
});

describe('share links: creating', () => {
  test('the code is returned once, looks like lcs_ plus 43 characters, and only a hash is stored', async () => {
    const r = await newShare();
    assert.match(r.token, /^lcs_[A-Za-z0-9_-]{43}$/);
    const stored = await shareRow(r.id);
    assert.notEqual(stored.token_hash, r.token); assert.ok(!JSON.stringify(stored).includes(r.token));
    assert.match(stored.token_hash, /^[0-9a-f]{64}$/);
    const listed = JSON.stringify(await listShares(env)); assert.ok(!listed.includes(r.token)); assert.ok(!listed.includes(stored.token_hash));
  });
  test('two codes never match', () => { assert.notEqual(newToken(), newToken()); });
  test('hours are limited to 1, 24 or 168 (anything else becomes 24); uses are clamped to 1..20 (default 5)', async () => {
    assert.deepEqual(SHARE_HOURS, [1, 24, 168]);
    const near = (r, h) => Math.abs(new Date(r.expiresAt.replace(' ', 'T') + 'Z') - (Date.now() + h * 3600e3)) < 5000;
    assert.ok(near(await newShare({ hours: 1 }), 1)); assert.ok(near(await newShare({ hours: 168 }), 168));
    assert.ok(near(await newShare({ hours: 9999 }), 24)); assert.ok(near(await newShare({ hours: 'x' }), 24));
    assert.equal((await newShare({ maxUses: -4 })).maxUses, 1); assert.equal((await newShare({ maxUses: 0 })).maxUses, 5, 'zero is not a usable number, so the default applies'); assert.equal((await newShare({ maxUses: 'many' })).maxUses, 5);
    assert.equal((await newShare({ maxUses: 500 })).maxUses, 20); assert.equal((await newShare({ maxUses: undefined })).maxUses, 5);
  });
  test('sections are de-duplicated and unknown ones dropped; none left is refused', async () => {
    const r = await newShare({ sections: ['settings.theme', 'settings.theme', 'nope', 7] }); assert.deepEqual(r.sections, ['settings.theme']);
    for (const s of [[], ['nope'], undefined, 'settings.theme']) { const e = await createShare(env, admin, { sections: s }); assert.equal(e.status, 422); assert.match(e.errors[0], /Choose what the other site may copy/); }
  });
  test('the label is cleaned and cut to 60 characters; the audit entry names it', async () => {
    const r = await newShare({ label: `  Stag\u0007ing   ${'x'.repeat(100)}` }); const label = (await shareRow(r.id)).label;
    assert.ok(label.startsWith('Stag ing x')); assert.equal(label.length, 60);
    assert.ok((await auditActions(db)).includes('share.create'));
  });
  test('at most 10 active links: the 11th is refused, and an expired, revoked or used-up link does not count', async () => {
    const made = []; for (let i = 0; i < MAX_ACTIVE_SHARES; i++) made.push(await newShare({ label: `L${i}` }));
    const r = await createShare(env, admin, { sections: ['settings.theme'] }); assert.equal(r.status, 409); assert.match(r.error, /10 active share links/);
    await revokeShare(env, admin, made[0].id);
    await sql('UPDATE config_shares SET expires_at = ? WHERE id = ?', ago(-60000), made[1].id).run();
    await sql('UPDATE config_shares SET uses = max_uses WHERE id = ?', made[2].id).run();
    for (let i = 0; i < 3; i++) await newShare({ label: `N${i}` });
    assert.equal((await createShare(env, admin, { sections: ['settings.theme'] })).status, 409);
  });
  test('an old active link beyond the 30 the screen lists still counts towards the limit', async () => {
    for (let i = 0; i < 30; i++) await sql("INSERT INTO config_shares(token_hash, sections, max_uses, expires_at, revoked_at) VALUES(?, '[]', 5, ?, CURRENT_TIMESTAMP)", `dead${i}`, ago(86400e3)).run();
    const old = await sql("INSERT INTO config_shares(token_hash, sections, max_uses, expires_at) VALUES('old', '[\"settings.theme\"]', 5, ?)", ago(86400e3)).run(); assert.ok(old.meta.last_row_id);
    for (let i = 0; i < 8; i++) await sql("INSERT INTO config_shares(token_hash, sections, max_uses, expires_at) VALUES(?, '[\"settings.theme\"]', 5, ?)", `act${i}`, ago(86400e3)).run();
    for (let i = 0; i < 30; i++) await sql("INSERT INTO config_shares(token_hash, sections, max_uses, expires_at, revoked_at) VALUES(?, '[]', 5, ?, CURRENT_TIMESTAMP)", `newer${i}`, ago(86400e3)).run();
    assert.equal((await createShare(env, admin, { sections: ['settings.theme'] })).created, true, 'the tenth active link is fine (one old plus eight plus this one)');
    assert.equal((await createShare(env, admin, { sections: ['settings.theme'] })).status, 409, 'eleventh is refused even though it is not in the listed 30');
  });
});

describe('share links: listing and revoking', () => {
  test('status is active, expired, used up or revoked, and the list is newest first', async () => {
    const a = await newShare({ label: 'a' }), b = await newShare({ label: 'b' }), c = await newShare({ label: 'c' }), d = await newShare({ label: 'd' });
    await sql('UPDATE config_shares SET expires_at = ? WHERE id = ?', ago(-60000), b.id).run();
    await sql('UPDATE config_shares SET uses = max_uses WHERE id = ?', c.id).run();
    await revokeShare(env, admin, d.id);
    const { shares, limit } = await listShares(env);
    assert.equal(limit, MAX_ACTIVE_SHARES);
    assert.deepEqual(shares.map((s) => [s.label, s.status]), [['d', 'revoked'], ['c', 'used up'], ['b', 'expired'], ['a', 'active']]);
    assert.equal(a.sections.length, 1);
  });
  test('the list shows at most 30 rows and never carries the token or its hash', async () => {
    for (let i = 0; i < 35; i++) await sql("INSERT INTO config_shares(token_hash, sections, max_uses, expires_at) VALUES(?, '[]', 5, ?)", `h${i}`, ago(3600e3)).run();
    const { shares } = await listShares(env); assert.equal(shares.length, 30);
    assert.ok(shares.every((s) => !('token' in s) && !('tokenHash' in s) && !('token_hash' in s)));
  });
  test('revoking works, is idempotent, keeps the first revoke time, is audited, and unknown ids are 404', async () => {
    const r = await newShare();
    assert.deepEqual(await revokeShare(env, admin, r.id), { revoked: true });
    const first = (await shareRow(r.id)).revoked_at; assert.ok(first);
    assert.deepEqual(await revokeShare(env, admin, r.id), { revoked: true });
    assert.equal((await shareRow(r.id)).revoked_at, first);
    assert.equal((await revokeShare(env, admin, 4242)).status, 404);
    assert.equal((await revokeShare(env, admin, 'abc')).status, 404);
    assert.ok((await auditActions(db)).includes('share.revoke'));
  });
});

describe('share links: the public side', () => {
  test('a valid code returns the live configuration of the chosen sections only', async () => {
    await setSetting(db, 'theme_primary', '#123456'); await setSetting(db, 'site_name', 'Secret Name');
    const r = await newShare({ sections: ['settings.theme'] });
    const out = await exportForShare(env, r.token, 'a.example');
    assert.deepEqual(out.included, ['settings.theme']); assert.equal(out.envelope.source.host, 'a.example');
    const text = JSON.stringify(out.envelope); assert.match(text, /#123456/); assert.doesNotMatch(text, /Secret Name/);
    assert.ok((await parseEnvelope(text)).ok);
  });
  test('it exports what is live, not what is in a draft', async () => {
    const { saveDraft } = await import('../worker/site-profile/versions.js');
    await setSetting(db, 'theme_primary', '#111111'); await saveDraft(env, editor, { settings: { theme_primary: '#999999' } });
    const out = await exportForShare(env, (await newShare()).token, 'a.example');
    assert.match(JSON.stringify(out.envelope), /#111111/); assert.doesNotMatch(JSON.stringify(out.envelope), /#999999/);
  });
  test('each use is counted, the last use works, the next one is refused', async () => {
    const r = await newShare({ maxUses: 2 });
    assert.ok((await exportForShare(env, r.token, 'a.example')).envelope); assert.equal((await shareRow(r.id)).uses, 1); assert.ok((await shareRow(r.id)).last_used_at);
    assert.ok((await exportForShare(env, r.token, 'a.example')).envelope);
    const third = await exportForShare(env, r.token, 'a.example'); assert.equal(third.status, 403); assert.equal((await shareRow(r.id)).uses, 2);
    assert.equal((await listShares(env)).shares[0].status, 'used up');
  });
  test('two requests cannot both take the last use', async () => {
    const r = await newShare({ maxUses: 1 });
    const results = await Promise.all([exportForShare(env, r.token, 'a.example'), exportForShare(env, r.token, 'a.example'), exportForShare(env, r.token, 'a.example')]);
    assert.equal(results.filter((x) => x.envelope).length, 1); assert.equal((await shareRow(r.id)).uses, 1);
  });
  test('an expired code and a revoked code are refused and not counted', async () => {
    const a = await newShare(), b = await newShare();
    await sql('UPDATE config_shares SET expires_at = ? WHERE id = ?', ago(-1000), a.id).run(); await revokeShare(env, admin, b.id);
    for (const t of [a.token, b.token]) { const o = await exportForShare(env, t, 'a.example'); assert.equal(o.status, 403); }
    assert.equal((await shareRow(a.id)).uses, 0); assert.equal((await shareRow(b.id)).uses, 0);
  });
  test('wrong, malformed, empty and non-string codes all get the identical refusal', async () => {
    await newShare();
    const same = JSON.stringify({ error: 'This share link is not valid.', status: 403 });
    for (const t of [newToken(), 'lcs_short', '', undefined, null, 123, {}, [], `lcs_${'A'.repeat(43)}`, `${newToken()} `, newToken().replace('lcs_', 'lcx_')]) assert.equal(JSON.stringify(await exportForShare(env, t, 'a.example')), same, String(t));
  });
  test('the hash is salted with a fixed prefix: the stored hash is not a plain SHA-256 of the code', async () => {
    const r = await newShare(); const plain = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(r.token))).toString('hex');
    assert.notEqual((await shareRow(r.id)).token_hash, plain);
  });
  test('a share whose chosen sections hold nothing is refused rather than returning an empty file', async () => {
    const r = await newShare(); await sql("UPDATE config_shares SET sections = '[]' WHERE id = ?", r.id).run();
    assert.equal((await exportForShare(env, r.token, 'a.example')).status, 403);
  });
  test('using a code writes an audit entry that names the link, not the code', async () => {
    const r = await newShare({ label: 'Staging' }); await exportForShare(env, r.token, 'a.example');
    const e = await row("SELECT * FROM config_audit WHERE action = 'share.used'");
    assert.ok(e); assert.ok(!JSON.stringify(e).includes(r.token)); assert.match(JSON.stringify(e), /Staging/);
  });
});

describe('normalizeSourceUrl: only a public https site is accepted', () => {
  test('a bare name gets https, and path, query, hash and case are dropped', () => {
    assert.deepEqual(normalizeSourceUrl('My-Site.com'), { origin: 'https://my-site.com', host: 'my-site.com' });
    assert.deepEqual(normalizeSourceUrl('https://Other.Example.org/en/admin?x=1#y'), { origin: 'https://other.example.org', host: 'other.example.org' });
    assert.deepEqual(normalizeSourceUrl('  https://a.b.co.uk./  '), { origin: 'https://a.b.co.uk', host: 'a.b.co.uk' });
    assert.equal(normalizeSourceUrl('https://x.com:443/').host, 'x.com');
  });
  test('refused: other protocols', () => {
    for (const u of ['http://a.com', 'ftp://a.com', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'gopher://a.com', 'ws://a.com']) assert.match(normalizeSourceUrl(u).error, /secure|web address/, u);
  });
  test('refused: credentials and ports', () => {
    assert.match(normalizeSourceUrl('https://user:pw@a.com').error, /user names/); assert.match(normalizeSourceUrl('https://user@a.com').error, /user names/);
    for (const u of ['https://a.com:8443', 'https://a.com:80', 'https://a.com:22']) assert.match(normalizeSourceUrl(u).error, /port/, u);
  });
  test('refused: IP addresses in every notation, localhost and private or internal names', () => {
    const bad = ['https://127.0.0.1', 'https://10.0.0.5', 'https://192.168.1.1', 'https://169.254.169.254', 'https://0.0.0.0', 'https://2130706433', 'https://0x7f000001', 'https://0177.0.0.1', 'https://127.1',
      'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://[fd00::1]', 'localhost', 'https://localhost', 'https://LOCALHOST.', 'https://intranet', 'https://router',
      'https://printer.local', 'https://app.localhost', 'https://db.internal', 'https://nas.lan', 'https://x.home', 'https://x.corp', 'https://x.intranet', 'https://site.test', 'https://x.invalid', 'https://x.example'];
    for (const u of bad) { const r = normalizeSourceUrl(u); assert.ok(r.error && !r.origin, `${u} -> ${JSON.stringify(r)}`); }
  });
  test('refused: malformed names', () => {
    for (const u of ['https://-a.com', 'https://a-.com', 'https://a..com', 'https://exa mple.com', 'https://a_b.com', 'https://' + 'a'.repeat(64) + '.com', 'https://' + ('a.'.repeat(130)) + 'com', 'https://.com']) assert.ok(normalizeSourceUrl(u).error, u);
  });
  test('refused: empty input, non-strings and absurd length', () => {
    assert.match(normalizeSourceUrl('').error, /Enter the address/); assert.match(normalizeSourceUrl(null).error, /Enter the address/); assert.match(normalizeSourceUrl(undefined).error, /Enter the address/); assert.match(normalizeSourceUrl('   ').error, /Enter the address/);
    assert.ok(normalizeSourceUrl('https://a.com/' + 'x'.repeat(5000)).origin === 'https://a.com' || normalizeSourceUrl('https://a.com/' + 'x'.repeat(5000)).error);
  });
  test('refused: the site you are on, in any case, with or without the scheme', () => {
    for (const u of ['https://mysite.com', 'MYSITE.COM', 'https://mysite.com/en']) assert.match(normalizeSourceUrl(u, 'MySite.com').error, /site you are on/, u);
    assert.equal(normalizeSourceUrl('https://other.com', 'mysite.com').host, 'other.com');
  });
  test('unicode look-alikes are converted to their real (punycode) name, never passed through raw', () => {
    const r = normalizeSourceUrl('https://exаmple.com'); // Cyrillic a
    assert.ok(r.error || /^xn--/.test(r.host.split('.')[0]), JSON.stringify(r));
  });
});

describe('fetchShared: the outgoing request', () => {
  const TOKEN = newToken();
  const okBody = (env2 = { format: 'x' }) => JSON.stringify({ success: true, envelope: env2 });
  const res = (body, init = {}) => new Response(body, { status: 200, ...init });
  const run = (fn, o = {}) => fetchShared({ url: 'https://other.example.org', token: TOKEN, selfHost: 't.example', fetch: fn, ...o });

  test('it posts to the fixed share path on the normalised origin, with a bearer token, no redirects and a signal', async () => {
    let seen; const r = await run(async (u, init) => { seen = { u, init }; return res(okBody()); }, { url: 'Other.Example.org/some/path?x=1' });
    assert.equal(seen.u, `https://other.example.org${SHARE_PATH}`); assert.equal(seen.init.method, 'POST'); assert.equal(seen.init.redirect, 'manual');
    assert.equal(seen.init.headers.Authorization, `Bearer ${TOKEN}`); assert.equal(seen.init.body, '{}'); assert.ok(seen.init.signal);
    assert.equal(r.host, 'other.example.org'); assert.deepEqual(JSON.parse(r.text), { format: 'x' });
  });
  test('the share code never travels in the address', async () => {
    let seen; await run(async (u) => { seen = u; return res(okBody()); }); assert.ok(!seen.includes(TOKEN)); assert.ok(!seen.includes('?'));
  });
  test('a bad address or a bad code is refused before any request is made', async () => {
    let calls = 0; const f = async () => { calls++; return res(okBody()); };
    for (const o of [{ url: 'http://x.com' }, { url: 'https://127.0.0.1' }, { url: 'https://t.example' }, { url: '' }, { token: 'lcs_short' }, { token: '' }, { token: undefined }, { token: `${TOKEN}\nX-Evil: 1` }]) { const r = await run(f, o); assert.ok(r.error, JSON.stringify(o)); }
    assert.equal(calls, 0);
  });
  test('redirects are not followed, including to internal addresses', async () => {
    for (const s of [301, 302, 303, 307, 308]) { const r = await run(async () => new Response('', { status: s, headers: { Location: 'http://169.254.169.254/' } })); assert.match(r.error, /not followed/, String(s)); }
  });
  test('each status gets its own plain message', async () => {
    const msg = async (status) => (await run(async () => new Response('{}', { status }))).error;
    assert.match(await msg(401), /did not accept the share code/); assert.match(await msg(403), /did not accept the share code/);
    assert.match(await msg(404), /does not offer sharing/); assert.match(await msg(500), /error \(500\)/); assert.match(await msg(429), /error \(429\)/); assert.match(await msg(503), /error \(503\)/);
  });
  test('a declared length over the cap is refused without reading the body', async () => {
    let read = false;
    const r = await run(async () => ({ status: 200, ok: true, headers: new Headers({ 'content-length': String(MAX_IMPORT_BYTES + 1) }), get body() { read = true; return null; }, text: async () => { read = true; return ''; } }));
    assert.match(r.error, /more than a configuration should contain/); assert.equal(read, false);
  });
  test('a body that grows past the cap is cut off while streaming even if the length header lied', async () => {
    let cancelled = false, sent = 0;
    const stream = new ReadableStream({ pull(c) { sent += 100 * 1024; c.enqueue(new Uint8Array(100 * 1024).fill(65)); }, cancel() { cancelled = true; } });
    const r = await run(async () => new Response(stream, { status: 200, headers: { 'content-length': '10' } }));
    assert.match(r.error, /more than a configuration should contain/); assert.ok(sent <= MAX_IMPORT_BYTES + 2 * 100 * 1024, `read ${sent}`); assert.equal(cancelled, true);
  });
  test('a body without a reader is checked by length after reading', async () => {
    const r = await run(async () => ({ status: 200, ok: true, headers: new Headers(), body: null, text: async () => 'x'.repeat(MAX_IMPORT_BYTES + 5) }));
    assert.match(r.error, /more than a configuration should contain/);
  });
  test('a slow site is stopped at the timeout', async () => {
    const r = await run((u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))), { timeoutMs: 30 });
    assert.match(r.error, /took too long/);
  });
  test('a network failure is a friendly message without the raw error', async () => {
    const r = await run(async () => { throw new Error('ECONNREFUSED 10.1.2.3:443 secret'); }); assert.match(r.error, /Could not reach the other site/); assert.doesNotMatch(r.error, /ECONNREFUSED|10\.1\.2\.3/);
  });
  test('non-JSON, wrong shape and a missing envelope are refused', async () => {
    assert.match((await run(async () => res('<html>hi</html>'))).error, /did not send a configuration/);
    assert.match((await run(async () => res('null'))).error, /did not send a configuration/);
    assert.match((await run(async () => res(JSON.stringify({ success: true })))).error, /did not send a configuration/);
    assert.match((await run(async () => res(JSON.stringify({ success: false, envelope: {} })))).error, /did not send a configuration/);
  });
  test('the other site’s own message is passed on when it sends a success:false with an error', async () => {
    assert.equal((await run(async () => res(JSON.stringify({ success: false, error: 'Too many attempts. Try again later.' })))).error, 'Too many attempts. Try again later.');
  });
  test('end to end: a real share on one site is fetched by another through the public endpoint contract', async () => {
    const A = freshSite(); await setSetting(A.db, 'theme_primary', '#0a0b0c'); await addNav(A.db, 'Deals', '/en/deals', { position: 4 });
    const s = await createShare(A.env, admin, { label: 'to B', sections: ['settings.theme', 'rows.nav'], maxUses: 2, hours: 1 });
    const fetchA = async (u, init) => { assert.equal(new URL(u).pathname, SHARE_PATH); const out = await exportForShare(A.env, /^Bearer (\S+)$/.exec(init.headers.Authorization)[1], new URL(u).hostname); return out.error ? new Response(JSON.stringify({ success: false, error: out.error }), { status: out.status }) : res(JSON.stringify({ success: true, envelope: out.envelope })); };
    const got = await fetchShared({ url: 'https://a.example.org', token: s.token, selfHost: 'b.example.org', fetch: fetchA });
    assert.ok(!got.error, got.error); const parsed = await parseEnvelope(got.text); assert.ok(parsed.ok, JSON.stringify(parsed.errors));
    const used = await A.db.prepare('SELECT uses FROM config_shares WHERE id = ?').bind(s.id).first(); assert.equal(used.uses, 1);
    const bad = await fetchShared({ url: 'https://a.example.org', token: newToken(), selfHost: 'b.example.org', fetch: fetchA }); assert.match(bad.error, /did not accept the share code/);
  });
});
