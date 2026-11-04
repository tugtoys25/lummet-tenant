// Phase 7: export, import (dry run, merge, apply) of a site configuration. Core engine: worker/site-profile/transfer.js.
// Covers the envelope (build, checksum, parse), the validators, the planner for every kind of section, apply (draft
// only, re-plan on the server, conflicts), and a full round trip from one in-memory site to another.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMAT, FORMAT_VERSION, PLATFORM, MAX_IMPORT_BYTES, MAX_NAME, MAX_DESCRIPTION, BRAND_GROUPS,
  sectionCatalog, isSectionId, transferPermissions, checksumOf, sha256Hex, buildExport, parseEnvelope, availableSections,
  planImport, applyImport, recordTransfer,
} from '../worker/site-profile/transfer.js';
import { saveDraft, getDraft, publishDraft, readLiveDocument } from '../worker/site-profile/versions.js';
import { defaultProfile } from '../worker/site-profile/profile.js';
import { GROUPS } from '../worker/site-profile/settings-groups.js';

import {
  admin, editor, viewer, freshSite, setSetting, setting, addNav, addPage, addComponent, place, navLabels, navCount, auditActions,
  snapshot, exportOf, parse, makeEnvelope,
} from './support/transfer-fixtures.js';

// Two independent sites: A is the source, B the target. Each gets the migrations (default menu and pages included).
let A, B, envA, envB;
beforeEach(() => { ({ db: A, env: envA } = freshSite()); ({ db: B, env: envB } = freshSite()); });

describe('sections, formats and permissions', () => {
  test('the catalogue has the structure, one entry per look-and-feel group and one per list, all with unique ids', () => {
    const cat = sectionCatalog();
    assert.equal(cat[0].id, 'structure'); assert.equal(cat[0].risk, 'high');
    assert.deepEqual(cat.filter((s) => s.kind === 'settings').map((s) => s.group), GROUPS.map((g) => g.id));
    assert.deepEqual(cat.filter((s) => s.kind === 'rows').map((s) => s.set), ['nav', 'pages', 'seo', 'components', 'placements']);
    assert.equal(new Set(cat.map((s) => s.id)).size, cat.length);
    for (const s of cat) { assert.ok(s.label && s.help, s.id); assert.ok(['low', 'medium', 'high'].includes(s.risk), s.id); assert.equal(isSectionId(s.id), true); }
    assert.equal(cat.find((s) => s.id === 'rows.nav').risk, 'medium');
  });
  test('only identity, analytics and compliance describe the business and are marked as brand sections', () => {
    assert.deepEqual([...BRAND_GROUPS].sort(), ['analytics', 'compliance', 'identity']);
    const brand = sectionCatalog().filter((s) => s.brand).map((s) => s.id).sort();
    assert.deepEqual(brand, ['settings.analytics', 'settings.compliance', 'settings.identity']);
  });
  test('isSectionId refuses anything that is not a known section', () => {
    for (const bad of ['', 'settings', 'settings.nope', 'rows.users', '__proto__', 'structure ', null, undefined, 5]) assert.equal(isSectionId(bad), false, String(bad));
  });
  test('permissions: editors export, import and see presets; only admins manage; viewers and anonymous get nothing', () => {
    assert.deepEqual(transferPermissions(admin), { export: true, import: true, library: true, manage: true });
    assert.deepEqual(transferPermissions(editor), { export: true, import: true, library: true, manage: false });
    assert.deepEqual(transferPermissions(viewer), { export: false, import: false, library: false, manage: false });
    assert.deepEqual(transferPermissions(null), { export: false, import: false, library: false, manage: false });
    assert.deepEqual(transferPermissions({ role: 'owner' }), { export: false, import: false, library: false, manage: false });
  });
  test('sha256Hex matches the known digest and the checksum ignores key order', async () => {
    assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const a = { format: FORMAT, formatVersion: 1, sections: ['structure'], document: { v: 1, settings: { a: '1', b: '2' } } };
    const b = { document: { settings: { b: '2', a: '1' }, v: 1 }, sections: ['structure'], formatVersion: 1, format: FORMAT };
    assert.equal(await checksumOf(a), await checksumOf(b));
    assert.match(await checksumOf(a), /^sha256:[0-9a-f]{64}$/);
    assert.notEqual(await checksumOf(a), await checksumOf({ ...a, document: { v: 1, settings: { a: '1', b: '3' } } }));
  });
});

describe('building an export', () => {
  test('a fresh site exports the structure, the header settings and the default menu', async () => {
    const b = await buildExport(envA, { host: 'a.example', now: '2026-11-04T10:00:00Z' });
    assert.equal(b.envelope.format, FORMAT); assert.equal(b.envelope.formatVersion, FORMAT_VERSION);
    assert.equal(b.envelope.exportedAt, '2026-11-04T10:00:00.000Z');
    assert.deepEqual(b.envelope.source, { host: 'a.example', version: 0, platform: PLATFORM, from: 'live' });
    assert.ok(b.included.includes('structure') && b.included.includes('rows.nav'));
    assert.deepEqual(b.envelope.sections, b.included);
    assert.equal(b.envelope.name, 'Configuration of a.example');
    assert.equal(b.envelope.checksum, await checksumOf(b.envelope));
  });
  test('only the requested sections are included, in catalogue order, and unknown ids are ignored', async () => {
    await setSetting(A, 'site_name', 'Alpha');
    const b = await buildExport(envA, { host: 'a.example', sections: ['rows.nav', 'bogus', 'settings.identity', 'rows.nav'] });
    assert.deepEqual(b.included, ['settings.identity', 'rows.nav']);
    assert.equal(b.envelope.document.settings.site_name, 'Alpha');
    assert.ok(!('profile' in b.envelope.document));
  });
  test('no section list means everything; a list that was given is honoured, so an empty or fully invalid one exports nothing', async () => {
    const all = (await buildExport(envA, { host: 'a.example' })).included;
    assert.ok(all.length >= 3);
    assert.deepEqual((await buildExport(envA, { host: 'a.example', sections: undefined })).included, all);
    assert.deepEqual((await buildExport(envA, { host: 'a.example', sections: 'structure' })).included, all, 'not an array: treated as no list');
    assert.deepEqual((await buildExport(envA, { host: 'a.example', sections: [] })).included, []);
    assert.deepEqual((await buildExport(envA, { host: 'a.example', sections: ['nope', 7] })).included, []);
    assert.deepEqual((await buildExport(envA, { host: 'a.example', sections: ['nope', 'structure'] })).included, ['structure']);
  });
  test('scripts, ad HTML and verification markup are never exported, and the owner is told', async () => {
    await setSetting(A, 'ga_script', '<script>steal()</script>'); await setSetting(A, 'ad_html', '<div>ad</div>'); await setSetting(A, 'gpwa_seal_html', '<b>seal</b>');
    await setSetting(A, 'site_name', 'Alpha');
    const b = await buildExport(envA, { host: 'a.example' });
    const text = JSON.stringify(b.envelope);
    assert.ok(!/steal|<div>ad|<b>seal/.test(text), 'no markup in the file');
    for (const k of ['ga_script', 'ad_html', 'gpwa_seal_html', 'theme_css', 'home_html']) assert.ok(!(k in (b.envelope.document.settings || {})), k);
    assert.ok(b.notes.some((n) => /never exported/i.test(n)));
  });
  test('settings are exported as text and only keys the Configuration screen owns', async () => {
    await setSetting(A, 'site_name', 'Alpha'); await setSetting(A, 'secret_api_key', 'sk-123'); await setSetting(A, 'site_header_sticky', '0');
    const s = (await exportOf(envA)).document.settings;
    assert.equal(s.site_name, 'Alpha'); assert.equal(s.site_header_sticky, '0');
    assert.ok(!('secret_api_key' in s));
    for (const v of Object.values(s)) assert.equal(typeof v, 'string');
  });
  test('menu links tied to one category or country page are left out, with a note', async () => {
    await addNav(A, 'Plain link', '/en/plain'); await addNav(A, 'Scoped link', '/en/scoped', { scope_type: 'category', scope_ref: 'slots' });
    const b = await buildExport(envA, { host: 'a.example', sections: ['rows.nav'] });
    const labels = Object.values(b.envelope.document.rows.nav).map((r) => r.label);
    assert.ok(labels.includes('Plain link')); assert.ok(!labels.includes('Scoped link'));
    assert.ok(b.notes.some((n) => /tied to a specific category or country/.test(n)));
  });
  test('rows are keyed by what they are, never by this site’s ids', async () => {
    await addComponent(A, 'Footer text', 'text'); const c = await addComponent(A, 'Promo', 'cta'); await addPage(A, 'about'); await place(A, c, 'about', 2);
    const b = await buildExport(envA, { host: 'a.example', sections: ['rows.pages', 'rows.components', 'rows.placements'] });
    const rows = b.envelope.document.rows;
    assert.ok('about' in rows.pages);
    assert.ok('text|Footer text' in rows.components && 'cta|Promo' in rows.components);
    assert.ok('page|about|cta|Promo' in rows.placements);
    assert.equal(rows.placements['page|about|cta|Promo'].component_name, 'Promo');
    assert.ok(!/"component_id"/.test(JSON.stringify(rows.placements)));
  });
  test('name and description are cleaned of control characters and cut to their limits', async () => {
    const e = await exportOf(envA, { name: `  Line\u0000one\ntwo ${'x'.repeat(200)}`, description: `d\r\n${'y'.repeat(1000)}` });
    assert.equal(e.name.length, MAX_NAME); assert.ok(!/[\u0000-\u001f]/.test(e.name)); assert.match(e.name, /^Line one two/);
    assert.equal(e.description.length, MAX_DESCRIPTION); assert.ok(!/[\u0000-\u001f]/.test(e.description));
  });
  test('the draft can be exported instead of the live site, and the live site is untouched', async () => {
    await setSetting(A, 'site_name', 'Live Name');
    await saveDraft(envA, editor, { settings: { site_name: 'Draft Name' } });
    assert.equal((await exportOf(envA, { sections: ['settings.identity'] })).document.settings.site_name, 'Live Name');
    const d = await exportOf(envA, { sections: ['settings.identity'], from: 'draft' });
    assert.equal(d.document.settings.site_name, 'Draft Name'); assert.equal(d.source.from, 'draft');
    assert.equal(await setting(A, 'site_name'), 'Live Name');
  });
  test('asking for the draft when there is none exports what is live', async () => {
    await setSetting(A, 'site_name', 'Live Name');
    const e = await exportOf(envA, { sections: ['settings.identity'], from: 'draft' });
    assert.equal(e.document.settings.site_name, 'Live Name');
  });
  test('exporting writes nothing', async () => {
    const before = await snapshot(A); await exportOf(envA); assert.equal(await snapshot(A), before);
  });
  test('the source version is the latest published version once versioning is in use', async () => {
    await saveDraft(envA, admin, { settings: { site_name: 'V2' } }); await publishDraft(envA, admin, {});
    assert.equal((await exportOf(envA)).source.version, 2);
  });
});

describe('parsing an envelope', () => {
  test('an exported file parses and lists what it holds', async () => {
    const p = await parse(await exportOf(envA));
    assert.deepEqual(p.errors, []); assert.deepEqual(p.warnings, []);
    assert.equal(p.parsed.meta.checksum, 'ok'); assert.equal(p.parsed.meta.host, 'a.example'); assert.equal(p.parsed.meta.platform, PLATFORM);
    assert.deepEqual(p.available, availableSections(p.parsed));
    assert.ok(p.available.includes('structure'));
  });
  test('a string and an already parsed object give the same result', async () => {
    const e = await exportOf(envA);
    const a = await parseEnvelope(JSON.stringify(e)), b = await parseEnvelope(e);
    assert.deepEqual(a.available, b.available); assert.equal(a.parsed.meta.checksum, b.parsed.meta.checksum);
  });
  test('garbage never throws and always comes back as a plain refusal', async () => {
    const inputs = ['', '   ', 'not json', '{"a":', '[]', '[1,2]', '"text"', '42', 'null', 'true', null, undefined, 7, [], {}, { format: 'other' }, { format: FORMAT }, { format: FORMAT, formatVersion: 'x' }, { format: FORMAT, formatVersion: 1 }, { format: FORMAT, formatVersion: 1, document: [] }, { format: FORMAT, formatVersion: 1, document: 'x' }];
    for (const i of inputs) {
      const r = await parseEnvelope(i);
      assert.equal(r.ok, false, JSON.stringify(i)); assert.ok(r.errors.length >= 1 && typeof r.errors[0] === 'string', JSON.stringify(i));
    }
  });
  test('the right message for each kind of wrong file', async () => {
    assert.match((await parseEnvelope('nope')).errors[0], /not a valid JSON file/);
    assert.match((await parseEnvelope({ format: 'other', formatVersion: 1, document: {} })).errors[0], /not a Lummet configuration export/);
    assert.match((await parseEnvelope({ format: FORMAT, document: {} })).errors[0], /does not say which format version/);
    assert.match((await parseEnvelope({ format: FORMAT, formatVersion: 0, document: {} })).errors[0], /does not say which format version/);
    assert.match((await parseEnvelope({ format: FORMAT, formatVersion: 1.5, document: {} })).errors[0], /does not say which format version/);
    assert.match((await parseEnvelope({ format: FORMAT, formatVersion: 1 })).errors[0], /no configuration in it/);
    assert.match((await parseEnvelope({ format: FORMAT, formatVersion: 1, document: {} })).errors[0], /nothing that can be imported/);
  });
  test('a file from a newer format is refused and names both versions', async () => {
    const r = await parseEnvelope({ format: FORMAT, formatVersion: FORMAT_VERSION + 1, document: { v: 1, settings: { site_name: 'x' } } });
    assert.equal(r.ok, false); assert.match(r.errors[0], new RegExp(`version ${FORMAT_VERSION + 1}`)); assert.match(r.errors[0], new RegExp(`version ${FORMAT_VERSION}\\)`));
  });
  test('size limits apply to text and to objects', async () => {
    const big = 'x'.repeat(MAX_IMPORT_BYTES + 10);
    assert.match((await parseEnvelope(big)).errors[0], /too large/);
    const e = await makeEnvelope({ settings: { site_name: 'ok', site_title: 'y'.repeat(MAX_IMPORT_BYTES) } });
    assert.match((await parseEnvelope(e)).errors[0], /too large/);
    assert.match((await parseEnvelope(JSON.stringify(e))).errors[0], /too large/);
  });
  test('a missing checksum is a warning, a wrong one is a stronger warning, neither blocks', async () => {
    const e = await makeEnvelope({ settings: { site_name: 'Alpha' } }); delete e.checksum;
    let r = await parseEnvelope(e); assert.ok(r.ok); assert.equal(r.parsed.meta.checksum, 'none'); assert.match(r.warnings[0], /no checksum/);
    e.checksum = 'sha256:' + '0'.repeat(64);
    r = await parseEnvelope(e); assert.ok(r.ok); assert.equal(r.parsed.meta.checksum, 'mismatch'); assert.match(r.warnings[0], /changed after it was exported/);
  });
  test('editing the file by hand is detected by the checksum', async () => {
    const e = await exportOf(envA); e.document.settings = { ...(e.document.settings || {}), site_name: 'Tampered' };
    const r = await parseEnvelope(e); assert.equal(r.parsed.meta.checksum, 'mismatch');
  });
  test('unknown settings and unknown lists are ignored with a count; markup settings are ignored with their own warning', async () => {
    const e = await makeEnvelope({ settings: { site_name: 'Alpha', bogus_key: 'x', another: 'y', ga_script: '<script>1</script>', theme_css: 'body{}', nested: { a: 1 }, nul: null }, rows: { nav: {}, widgets: { a: 1 } } });
    const r = await parseEnvelope(e);
    assert.ok(r.ok); assert.deepEqual(r.parsed.settings, { site_name: 'Alpha' });
    assert.ok(r.warnings.some((w) => /2 settings that hold scripts or raw markup were ignored/.test(w)));
    assert.ok(r.warnings.some((w) => /4 settings this site does not know were ignored/.test(w)));
    assert.ok(r.warnings.some((w) => /1 list this site does not know was ignored/.test(w)));
  });
  test('damaged parts are dropped with a warning and the rest still imports', async () => {
    const e = await makeEnvelope({ profile: 'bad', settings: { site_name: 'Alpha' }, rows: 'bad' });
    const r = await parseEnvelope(e);
    assert.ok(r.ok); assert.equal(r.parsed.profile, undefined); assert.deepEqual(r.available, ['settings.identity']);
    assert.ok(r.warnings.some((w) => /site structure in the file is damaged/.test(w)));
    assert.ok(r.warnings.some((w) => /lists in the file are damaged/.test(w)));
    const r2 = await parseEnvelope(await makeEnvelope({ settings: 'bad', profile: defaultProfile() }));
    assert.ok(r2.warnings.some((w) => /settings in the file are damaged/.test(w))); assert.deepEqual(r2.available, ['structure']);
  });
  test('metadata is cleaned and cut, and a draft origin is remembered', async () => {
    const e = await makeEnvelope({ settings: { site_name: 'A' } }, { name: `Nm\u0001${'n'.repeat(300)}`, description: 'd'.repeat(900), source: { host: 'h'.repeat(400), version: '7', platform: 'x'.repeat(100), from: 'draft' } });
    const m = (await parseEnvelope(e)).parsed.meta;
    assert.equal(m.name.length, MAX_NAME); assert.ok(!/[\u0000-\u001f]/.test(m.name)); assert.equal(m.description.length, MAX_DESCRIPTION);
    assert.equal(m.host.length, 253); assert.equal(m.version, 7); assert.equal(m.platform.length, 40); assert.equal(m.from, 'draft');
  });
  test('parsing does not share objects with its input', async () => {
    const e = await makeEnvelope({ profile: defaultProfile() });
    const r = await parseEnvelope(e); r.parsed.profile.modules.casino = 'changed';
    assert.notEqual(e.document.profile.modules.casino, 'changed');
  });
});
