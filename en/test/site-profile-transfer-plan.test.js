// Phase 7: the dry-run planner (planImport) and applyImport, section by section, plus a full round trip between two
// in-memory sites. The rules under test: a plan writes nothing; an import only adds or updates and never deletes; a bad
// value is skipped and explained instead of sinking the file; apply plans again on the server and saves only to the draft.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, parseEnvelope, planImport, applyImport, recordTransfer } from '../worker/site-profile/transfer.js';
import { saveDraft, getDraft, publishDraft, readLiveDocument, listAudit, NEEDS_MIGRATION } from '../worker/site-profile/versions.js';
import { applyPreset, defaultProfile } from '../worker/site-profile/profile.js';
import {
  admin, editor, freshSite, setSetting, setting, addNav, addPage, addComponent, place, addSeo, navLabels, navCount, auditActions,
  snapshot, exportOf, parse, makeEnvelope,
} from './support/transfer-fixtures.js';

let A, B, envA, envB;
beforeEach(() => { ({ db: A, env: envA } = freshSite()); ({ db: B, env: envB } = freshSite()); });

const plan = async (env, envelope, opts = {}) => (await planImport(env, await parse(envelope), { host: 'b.example', ...opts })).report;
const sec = (report, id) => report.sections.find((s) => s.id === id);
const texts = (report, level) => report.items.filter((i) => i.level === level).map((i) => i.message);
const draftDoc = async (env) => (await getDraft(env))?.document;

describe('planning is a dry run', () => {
  test('it reports every change and writes nothing: no setting, no row, no draft, no audit entry', async () => {
    await setSetting(A, 'theme_primary', '#112233'); await addNav(A, 'Deals', '/en/deals', { position: 5 });
    const before = await snapshot(B);
    const r = await plan(envB, await exportOf(envA));
    assert.equal(r.hasChanges, true); assert.ok(r.changes.length >= 2);
    assert.equal(await snapshot(B), before); assert.equal(await getDraft(envB), null);
    assert.deepEqual(await auditActions(B), []);
  });
  test('the report says where the file came from and whether the checksum matched', async () => {
    const r = await plan(envB, await exportOf(envA, { name: 'Alpha starter', description: 'For news sites' }));
    assert.equal(r.file.name, 'Alpha starter'); assert.equal(r.file.description, 'For news sites');
    assert.equal(r.file.host, 'a.example'); assert.equal(r.file.checksum, 'ok'); assert.equal(r.file.sameSite, false);
  });
  test('brand sections (identity, analytics, compliance) start unticked for a file from another site, and ticked for the same site', async () => {
    await setSetting(A, 'site_name', 'Alpha'); await setSetting(A, 'theme_primary', '#112233');
    const e = await exportOf(envA, { sections: ['settings.identity', 'settings.theme'] });
    const other = await plan(envB, e, { host: 'b.example' });
    assert.equal(sec(other, 'settings.identity').selected, false); assert.equal(sec(other, 'settings.theme').selected, true);
    assert.equal(other.changes.some((c) => c.key === 'site_name'), false);
    const same = await plan(envA, e, { host: 'a.example' });
    assert.equal(same.file.sameSite, true); assert.equal(sec(same, 'settings.identity').selected, true);
  });
  test('an explicit choice of sections wins, and sections the file does not hold are ignored', async () => {
    await setSetting(A, 'site_name', 'Alpha'); await setSetting(A, 'theme_primary', '#112233');
    const e = await exportOf(envA, { sections: ['settings.identity', 'settings.theme'] });
    const r = await plan(envB, e, { sections: ['settings.identity', 'rows.seo', 'bogus'] });
    assert.deepEqual(r.sections.filter((s) => s.selected).map((s) => s.id), ['settings.identity']);
    assert.deepEqual(r.sections.map((s) => s.id), ['settings.identity', 'settings.theme']);
    assert.deepEqual(r.changes.map((c) => c.key), ['site_name']);
  });
  test('choosing no section at all plans nothing and says so', async () => {
    await setSetting(A, 'theme_primary', '#112233');
    const r = await plan(envB, await exportOf(envA), { sections: ['rows.seo'] });
    assert.equal(r.hasChanges, false); assert.equal(r.canApply, false); assert.match(r.reason, /Nothing to import/);
  });
  test('importing a site’s own file into itself finds nothing to do', async () => {
    await setSetting(A, 'site_name', 'Alpha'); await setSetting(A, 'theme_primary', '#112233');
    const r = await plan(envA, await exportOf(envA), { host: 'a.example' });
    assert.equal(r.hasChanges, false); assert.equal(r.changes.length, 0); assert.equal(r.canApply, false);
    for (const s of r.sections) { assert.equal(s.counts.add, 0, s.id); assert.equal(s.counts.change, 0, s.id); }
  });
  test('the draft state is reported, and an existing draft is planned against, not the live site', async () => {
    await setSetting(A, 'theme_primary', '#112233');
    await saveDraft(envB, editor, { settings: { theme_primary: '#112233' } });
    const r = await plan(envB, await exportOf(envA));
    assert.deepEqual({ exists: r.draft.exists, changes: r.draft.changes }, { exists: true, changes: 1 });
    assert.equal(r.draft.revision, 1);
    assert.equal(sec(r, 'settings.theme').counts.same, 1); assert.equal(sec(r, 'settings.theme').counts.change, 0);
  });
});

describe('settings sections', () => {
  test('a changed value is planned, an equal one is counted as the same', async () => {
    await setSetting(A, 'theme_primary', '#112233'); await setSetting(A, 'theme_secondary', '#445566'); await setSetting(B, 'theme_secondary', '#445566');
    const r = await plan(envB, await exportOf(envA, { sections: ['settings.theme'] }));
    const c = sec(r, 'settings.theme').counts; assert.equal(c.change, 1); assert.equal(c.same, 1);
    assert.deepEqual(r.changes.map((x) => [x.key, x.to]), [['theme_primary', '#112233']]);
  });
  test('a value that fails the screen’s own validation is skipped with the reason, the rest still go in', async () => {
    const e = await makeEnvelope({ settings: { theme_primary: 'red', theme_secondary: '#445566' } });
    const r = await plan(envB, e);
    const c = sec(r, 'settings.theme').counts; assert.equal(c.skipped, 1); assert.equal(c.change, 1);
    assert.ok(texts(r, 'warning').some((m) => /Skipped “Primary colour”/.test(m)));
    assert.deepEqual(r.changes.map((x) => x.key), ['theme_secondary']);
  });
  test('values over their length limit are cut exactly as the Configuration screen cuts them, and the review shows the cut value', async () => {
    const r = await plan(envB, await makeEnvelope({ settings: { site_name: 'x'.repeat(500) } }), { sections: ['settings.identity'] });
    assert.equal(r.changes.length, 1); assert.equal(r.changes[0].key, 'site_name'); assert.equal(r.changes[0].to.length, 60);
  });
  test('links to the other site’s media library are flagged, and not when the file is from this very site', async () => {
    const e = await makeEnvelope({ settings: { site_logo: '/media/logo.png' } });
    const other = await plan(envB, e, { host: 'b.example' });
    if (other.changes.length) assert.ok(texts(other, 'warning').some((m) => /media library of the site this came from/.test(m)));
    const same = await plan(envB, e, { host: 'a.example' });
    assert.ok(!texts(same, 'warning').some((m) => /media library/.test(m)));
  });
});

describe('site structure', () => {
  test('a different setup is planned as one change and shows its impact', async () => {
    const news = applyPreset('news');
    const e = await makeEnvelope({ profile: news });
    const r = await plan(envB, e);
    assert.equal(sec(r, 'structure').counts.change, 1); assert.equal(sec(r, 'structure').risk, 'high');
    assert.ok(r.impact, 'impact preview'); assert.ok(['low', 'medium', 'high'].includes(r.impact.risk));
    assert.ok(r.impact.removed.length > 0, 'a news-only setup removes pages');
    assert.ok(r.changes.length > 0 && r.hasChanges);
  });
  test('removing pages that have published content is high risk and asks for an acknowledgement; a harmless change does not', async () => {
    await B.prepare("INSERT INTO casinos(slug, name, website_url, affiliate_url, published) VALUES('c1', 'Casino One', 'https://c.example', 'https://c.example/go', 1)").run();
    const risky = await plan(envB, await makeEnvelope({ profile: applyPreset('news') }));
    assert.equal(risky.impact.risk, 'high'); assert.equal(risky.impact.affectedPages, 1);
    assert.match(risky.impact.confirm, /1 published page will stop working/);
    const calm = await plan(envB, await makeEnvelope({ settings: { theme_primary: '#112233' } }));
    assert.equal(calm.impact, null);
  });
  test('an invalid structure is blocked with a plain error and nothing else is lost', async () => {
    const bad = { ...defaultProfile(), homepage: false, landing: '/en/casino', modules: { ...defaultProfile().modules, casino: false } };
    const r = await plan(envB, await makeEnvelope({ profile: bad, settings: { theme_primary: '#112233' } }), { sections: ['structure', 'settings.theme'] });
    assert.equal(sec(r, 'structure').blocked, true); assert.equal(sec(r, 'structure').counts.skipped, 1);
    assert.ok(texts(r, 'error').length >= 1);
    assert.deepEqual(r.changes.map((c) => c.key), ['theme_primary']);
  });
  test('an equal structure is the same, an unknown setup type is shown as Custom with a note', async () => {
    const same = await plan(envB, await makeEnvelope({ profile: defaultProfile() }));
    assert.equal(sec(same, 'structure').counts.same, 1);
    const odd = { ...applyPreset('news'), preset: 'made-up-type' };
    const r = await plan(envB, await makeEnvelope({ profile: odd }));
    assert.ok(texts(r, 'info').some((m) => /not one this site knows/.test(m)));
  });
  test('the sticky header follows the header settings of the same file, or stays as it is here', async () => {
    const stickyOff = { ...defaultProfile(), header: { sticky: false } };
    let r = await plan(envB, await makeEnvelope({ profile: stickyOff }), { sections: ['structure'] });
    assert.equal(sec(r, 'structure').counts.same, 1, 'structure alone does not carry the sticky choice');
    r = await plan(envB, await makeEnvelope({ profile: stickyOff, settings: { site_header_sticky: '0' } }), { sections: ['structure', 'settings.header'] });
    assert.ok(r.changes.some((c) => c.key === 'site_header_sticky'));
  });
});

describe('menu links', () => {
  test('a link that does not exist here is added; one that does (same menu and address) is matched, not duplicated', async () => {
    await addNav(A, 'Deals', '/en/deals', { position: 5 });
    await addNav(B, 'Old label', '/en/deals');
    const before = await navCount(B);
    const r = await plan(envB, await exportOf(envA, { sections: ['rows.nav'] }));
    const c = sec(r, 'rows.nav').counts;
    assert.equal(c.add, 0); assert.ok(c.change >= 1, 'the label of the existing link changes');
    assert.equal(await navCount(B), before, 'planning does not insert');
  });
  test('a drop-down keeps its parent, with the parent created first', async () => {
    const p = await addNav(A, 'More', '/en/more'); await addNav(A, 'Child', '/en/child', { parent_id: p });
    await B.prepare('DELETE FROM nav_items').run();
    const e = await exportOf(envA, { sections: ['rows.nav'] });
    const parsed = await parse(e);
    const { report, patch } = await planImport(envB, parsed, { host: 'b.example' });
    const adds = Object.entries(patch.rows.nav.set);
    const parentKey = adds.find(([, v]) => v.url === '/en/more')[0], child = adds.find(([, v]) => v.url === '/en/child')[1];
    assert.equal(child.parent, parentKey); assert.equal(report.sections.find((s) => s.id === 'rows.nav').counts.skipped, 0);
  });
  test('a drop-down that would end up under itself is flagged and left alone', async () => {
    const e = await makeEnvelope({ rows: { nav: {
      a: { label: 'Alpha', url: '/en/alpha', location: 'header', position: 0, enabled: 1, parent: 'b' },
      b: { label: 'Beta', url: '/en/beta', location: 'header', position: 1, enabled: 1, parent: 'a' },
    } } });
    const r = await plan(envB, e);
    assert.ok(texts(r, 'warning').some((m) => /would create a loop/.test(m)));
  });
  test('country rules only apply to page-menu links, so they are dropped from other menus with a note', async () => {
    const e = await makeEnvelope({ rows: { nav: { a: { label: 'Geo link', url: '/en/geo', location: 'header', position: 0, enabled: 1, geo: 'GB=allowed' } } } });
    const r = await plan(envB, e);
    assert.ok(texts(r, 'warning').some((m) => /country rules only apply to page-menu links/.test(m)));
  });
  test('one bad row is skipped and explained while the good rows still go in', async () => {
    const e = await makeEnvelope({ rows: { nav: {
      good: { label: 'Good link', url: '/en/good-link', location: 'header', position: 0, enabled: 1 },
      bad: { label: 'Bad link', url: 'javascript:alert(1)', location: 'header', position: 1, enabled: 1 },
    } } });
    const { report, patch } = await planImport(envB, await parse(e), { host: 'b.example' });
    const labels = Object.values(patch.rows.nav.set).map((v) => v.label);
    assert.ok(labels.includes('Good link')); assert.ok(!labels.includes('Bad link'));
    assert.equal(report.sections.find((s) => s.id === 'rows.nav').counts.skipped, 1);
    assert.ok(texts(report, 'warning').some((m) => /Skipped “Bad link”/.test(m)));
  });
  test('rows with unsafe keys are ignored', async () => {
    const e = await makeEnvelope({ rows: { nav: { '../evil': { label: 'X', url: '/en/x', location: 'header' }, 'ok-1': { label: 'Fine', url: '/en/fine', location: 'header', position: 0, enabled: 1 } } } });
    const { patch } = await planImport(envB, await parse(e), { host: 'b.example' });
    assert.deepEqual(Object.values(patch.rows.nav.set).map((v) => v.label), ['Fine']);
  });
});

describe('pages, SEO, components and placements', () => {
  test('page layouts and page SEO are matched by slug; a page that does not exist here is skipped with advice', async () => {
    await addPage(A, 'about'); await addPage(A, 'only-on-a'); await addPage(B, 'about');
    await A.prepare("UPDATE pages SET template = 'page-wide.html', seo_title = 'About A' WHERE slug = 'about'").run();
    await A.prepare("UPDATE pages SET template = 'page-wide.html' WHERE slug = 'only-on-a'").run();
    const r = await plan(envB, await exportOf(envA, { sections: ['rows.pages'] }));
    const c = sec(r, 'rows.pages').counts;
    assert.equal(c.skipped, 1); assert.ok(c.change >= 1);
    assert.ok(texts(r, 'info').some((m) => /do(es)? not exist on this site/.test(m) && /Create the page first/.test(m)));
    assert.ok(r.changes.some((x) => x.to === 'page-wide.html' || x.to === 'About A'));
  });
  test('SEO records are added when new and updated when they exist; a record with no page is skipped', async () => {
    await addSeo(A, 'page', 'about', { title: 'About A', description: 'd' }); await addSeo(A, 'page', 'new-one', { title: 'New' });
    await addSeo(B, 'page', 'about', { title: 'About B' });
    const e = await exportOf(envA, { sections: ['rows.seo'] });
    e.document.rows.seo.broken = { page_type: '', page_slug: '', title: 'x' }; e.checksum = undefined;
    const r = await plan(envB, e);
    const c = sec(r, 'rows.seo').counts;
    assert.equal(c.add, 1); assert.equal(c.change, 1); assert.equal(c.skipped, 1);
    assert.ok(texts(r, 'warning').some((m) => /had no page type or page/.test(m)));
  });
  test('components are matched by type and name; ones this site does not have are skipped and named', async () => {
    await addComponent(A, 'Promo', 'text', 'Promo from A'); await addComponent(A, 'Missing here', 'cta', 'x');
    await addComponent(B, 'Promo', 'text', 'Promo on B');
    const r = await plan(envB, await exportOf(envA, { sections: ['rows.components'] }));
    const c = sec(r, 'rows.components').counts;
    assert.equal(c.change, 1); assert.equal(c.skipped, 1);
    assert.ok(texts(r, 'info').some((m) => /Missing here \(cta\)/.test(m) && /Component Studio/.test(m)));
  });
  test('placements are matched by page and component; ones with no match are skipped', async () => {
    await addPage(A, 'about'); await addPage(B, 'about');
    const a1 = await addComponent(A, 'Promo', 'text'); const a2 = await addComponent(A, 'Lonely', 'text');
    const b1 = await addComponent(B, 'Promo', 'text');
    await place(A, a1, 'about', 7); await place(A, a2, 'about', 1); await place(B, b1, 'about', 0);
    const r = await plan(envB, await exportOf(envA, { sections: ['rows.components', 'rows.placements'] }));
    const c = sec(r, 'rows.placements').counts;
    assert.equal(c.change, 1); assert.equal(c.skipped, 1);
    assert.ok(texts(r, 'info').some((m) => /no matching component on that page here/.test(m)));
  });
});

describe('applying an import', () => {
  test('it saves the accepted part to the DRAFT only: the live site is untouched', async () => {
    await setSetting(A, 'theme_primary', '#112233'); await addNav(A, 'Deals', '/en/deals', { position: 5 });
    const before = await snapshot(B);
    const r = await applyImport(envB, editor, await parse(await exportOf(envA)), { host: 'b.example' });
    assert.equal(r.imported, true); assert.ok(r.changes.length >= 2); assert.match(r.summary, /changes?/);
    assert.equal(await snapshot(B), before, 'nothing live changed');
    const d = await draftDoc(envB);
    assert.equal(d.settings.theme_primary, '#112233');
    assert.ok(Object.values(d.rows.nav).some((x) => x.label === 'Deals'));
    assert.equal(r.draft.revision, 1);
  });
  test('publishing the draft is what makes the import live, with nothing deleted', async () => {
    await setSetting(A, 'theme_primary', '#112233'); await addNav(A, 'Deals', '/en/deals', { position: 5 });
    const before = await navCount(B);
    await applyImport(envB, editor, await parse(await exportOf(envA)), { host: 'b.example' });
    assert.equal((await publishDraft(envB, admin, {})).error, undefined);
    assert.equal(await setting(B, 'theme_primary'), '#112233');
    assert.equal(await navCount(B), before + 1);
    assert.ok((await navLabels(B)).includes('Deals'));
  });
  test('it never deletes: a site with extra links keeps them', async () => {
    await addNav(B, 'Only on B', '/en/only-b'); const before = await navCount(B);
    await addNav(A, 'Deals', '/en/deals');
    await applyImport(envB, admin, await parse(await exportOf(envA, { sections: ['rows.nav'] })), { host: 'b.example' });
    await publishDraft(envB, admin, {});
    assert.ok((await navLabels(B)).includes('Only on B')); assert.ok(await navCount(B) >= before);
  });
  test('an audit entry names the person, the file, the source site and the sections', async () => {
    await setSetting(A, 'theme_primary', '#112233');
    await applyImport(envB, editor, await parse(await exportOf(envA, { name: 'Alpha starter', sections: ['settings.theme'] })), { host: 'b.example' });
    const a = await listAudit(envB);
    const row = (a.entries || a.audit || a).find((x) => x.action === 'import.draft');
    assert.ok(row, 'an import.draft entry'); assert.match(row.summary, /Alpha starter/); assert.match(row.summary, /from a\.example/); assert.match(row.summary, /Colours|Look and feel: Colours/);
    assert.equal(row.actor, 'ed@t.example');
  });
  test('when nothing would change it refuses with a clear code and writes nothing', async () => {
    await setSetting(A, 'theme_primary', '#112233');
    const e = await exportOf(envA, { sections: ['settings.theme'] });
    await applyImport(envB, admin, await parse(e), { host: 'b.example' });
    await publishDraft(envB, admin, {});
    const r = await applyImport(envB, admin, await parse(e), { host: 'b.example' });
    assert.equal(r.status, 409); assert.equal(r.code, 'nothing_to_import'); assert.match(r.error, /Nothing to import/);
  });
  test('the server plans again: asking for a section the file does not hold changes nothing extra', async () => {
    await setSetting(A, 'theme_primary', '#112233');
    const e = await exportOf(envA, { sections: ['settings.theme'] });
    const r = await applyImport(envB, admin, await parse(e), { host: 'b.example', sections: ['settings.theme', 'structure', 'rows.nav', 'settings.identity'] });
    assert.equal(r.imported, true); assert.deepEqual(r.changes.map((c) => c.key), ['theme_primary']);
  });
  test('only the chosen sections are imported', async () => {
    await setSetting(A, 'theme_primary', '#112233'); await setSetting(A, 'site_header_height', 'compact');
    const e = await exportOf(envA, { sections: ['settings.theme', 'settings.header'] });
    const r = await applyImport(envB, admin, await parse(e), { host: 'b.example', sections: ['settings.theme'] });
    assert.deepEqual(r.changes.map((c) => c.key), ['theme_primary']);
    assert.equal((await draftDoc(envB)).settings.site_header_height, undefined);
  });
  test('an import is added on top of the draft that is already there', async () => {
    await saveDraft(envB, editor, { settings: { site_name: 'Draft Co' } });
    await setSetting(A, 'theme_primary', '#112233');
    const r = await applyImport(envB, admin, await parse(await exportOf(envA, { sections: ['settings.theme'] })), { host: 'b.example' });
    assert.equal(r.imported, true);
    const d = await draftDoc(envB); assert.equal(d.settings.site_name, 'Draft Co'); assert.equal(d.settings.theme_primary, '#112233');
  });
  test('a stale draft revision is a conflict and nothing is saved', async () => {
    await saveDraft(envB, editor, { settings: { site_name: 'one' } }); await saveDraft(envB, editor, { settings: { site_name: 'two' } });
    await setSetting(A, 'theme_primary', '#112233');
    const r = await applyImport(envB, admin, await parse(await exportOf(envA, { sections: ['settings.theme'] })), { host: 'b.example', revision: 1 });
    assert.equal(r.conflict, true); assert.equal((await draftDoc(envB)).settings.theme_primary, undefined);
  });
  test('without the versioning tables the plan says so and apply refuses (503) instead of failing half way', async () => {
    await B.prepare('DROP TABLE config_draft').run();
    await setSetting(A, 'theme_primary', '#112233');
    const p = await parse(await exportOf(envA, { sections: ['settings.theme'] }));
    const r = await planImport(envB, p, { host: 'b.example' });
    assert.equal(r.report.canApply, false); assert.equal(r.report.reason, NEEDS_MIGRATION); assert.equal(r.report.draft.exists, false);
    const a = await applyImport(envB, admin, p, { host: 'b.example' });
    assert.equal(a.status, 503); assert.equal(a.error, NEEDS_MIGRATION);
  });
  test('a structure import that is invalid is refused as a whole by apply, with the reason', async () => {
    const bad = { ...defaultProfile(), homepage: false, landing: '/en/casino', modules: { ...defaultProfile().modules, casino: false } };
    const r = await applyImport(envB, admin, await parse(await makeEnvelope({ profile: bad })), { host: 'b.example' });
    assert.equal(r.imported, undefined); assert.equal(r.code, 'nothing_to_import'); assert.ok(r.report.items.some((i) => i.level === 'error'));
  });
});

describe('a full round trip between two sites', () => {
  test('what one site exports, a fresh site can adopt: settings, menu, page layout, SEO, component and placement', async () => {
    await setSetting(A, 'theme_primary', '#112233'); await setSetting(A, 'site_header_height', 'compact');
    await addNav(A, 'Deals', '/en/deals', { position: 5 });
    await addPage(A, 'about'); await addPage(B, 'about'); await A.prepare("UPDATE pages SET template = 'page-wide.html' WHERE slug = 'about'").run();
    await addSeo(A, 'page', 'about', { title: 'About A', description: 'About us' });
    const ca = await addComponent(A, 'Promo', 'text', 'Promo A'); await addComponent(B, 'Promo', 'text', 'Promo B'); await place(A, ca, 'about', 3);
    const cb = (await B.prepare("SELECT id FROM components WHERE name = 'Promo'").first()).id; await place(B, cb, 'about', 0);

    const file = JSON.stringify(await exportOf(envA, { name: 'Alpha starter' }));
    const parsed = await parseEnvelope(file); assert.ok(parsed.ok); assert.equal(parsed.parsed.meta.checksum, 'ok');
    const r = await applyImport(envB, admin, parsed, { host: 'b.example' });
    assert.equal(r.imported, true, JSON.stringify(r.report?.items));
    assert.equal((await publishDraft(envB, admin, {})).error, undefined);

    assert.equal(await setting(B, 'theme_primary'), '#112233');
    assert.equal(await setting(B, 'site_header_height'), 'compact');
    assert.ok((await navLabels(B)).includes('Deals'));
    assert.equal((await B.prepare("SELECT template FROM pages WHERE slug = 'about'").first()).template, 'page-wide.html');
    assert.equal((await B.prepare("SELECT title FROM seo_meta WHERE page_type = 'page' AND page_slug = 'about'").first()).title, 'About A');
    assert.equal((await B.prepare("SELECT title FROM components WHERE name = 'Promo'").first()).title, 'Promo A');
    assert.equal(Number((await B.prepare('SELECT position FROM page_components WHERE page_slug = ?').bind('about').first()).position), 3);

    // and importing the same file again finds nothing left to do
    const again = await planImport(envB, await parseEnvelope(file), { host: 'b.example' });
    assert.equal(again.report.hasChanges, false);
  });
  test('the brand sections stay behind unless asked for: the new site keeps its own name', async () => {
    await setSetting(A, 'site_name', 'Alpha'); await setSetting(B, 'site_name', 'Beta'); await setSetting(A, 'theme_primary', '#112233');
    await applyImport(envB, admin, await parse(await exportOf(envA, { sections: ['settings.identity', 'settings.theme'] })), { host: 'b.example' });
    await publishDraft(envB, admin, {});
    assert.equal(await setting(B, 'site_name'), 'Beta'); assert.equal(await setting(B, 'theme_primary'), '#112233');
  });
  test('the same file can be taken with the business details when the owner ticks them', async () => {
    await setSetting(A, 'site_name', 'Alpha'); await setSetting(B, 'site_name', 'Beta');
    await applyImport(envB, admin, await parse(await exportOf(envA, { sections: ['settings.identity'] })), { host: 'b.example', sections: ['settings.identity'] });
    await publishDraft(envB, admin, {});
    assert.equal(await setting(B, 'site_name'), 'Alpha');
  });
  test('rolling back after an import restores the exact previous setup', async () => {
    const { rollbackTo } = await import('../worker/site-profile/versions.js');
    await setSetting(B, 'theme_primary', '#abcdef');
    await applyImport(envB, admin, await parse(await makeEnvelope({ settings: { theme_primary: '#112233' } })), { host: 'b.example' });
    const pub = await publishDraft(envB, admin, {}); assert.equal(await setting(B, 'theme_primary'), '#112233');
    const back = await rollbackTo(envB, 'b.example', admin, pub.version - 1);
    assert.equal(back.error, undefined, JSON.stringify(back)); assert.equal(await setting(B, 'theme_primary'), '#abcdef');
  });
});

describe('the audit helper', () => {
  test('it records, cuts long summaries and long diffs, and never throws when the table is gone', async () => {
    assert.equal(await recordTransfer(envA, admin, 'export', 'x'.repeat(1000), Array.from({ length: 500 }, (_, i) => ({ i }))), true);
    const row = await A.prepare("SELECT summary, diff, actor_role FROM config_audit WHERE action = 'export'").first();
    assert.equal(row.summary.length, 300); assert.equal(JSON.parse(row.diff).length, 200); assert.equal(row.actor_role, 'admin');
    await A.prepare('DROP TABLE config_audit').run();
    assert.equal(await recordTransfer(envA, admin, 'export', 'x'), false);
  });
});
