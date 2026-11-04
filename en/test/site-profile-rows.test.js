// Phase 6D-6F row layer: menu links, page layouts and listings, SEO records, components and placements held in the
// configuration document. Covers cleaning, patching, merge, publish, rollback, page layouts and country rules.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import {
  ROW_SETS, SET_IDS, GEO_STATUS, normalizeRows, applyRowsPatch, validateRowSets, readLiveRows, diffRows, mergeRows,
  allocateKeys, rowStatements, previewNavItems, previewGeoFilter, previewPage, previewSeo, previewComponentRows, rowSetsManifest,
} from '../worker/site-profile/rows.js';
import { PAGE_TEMPLATES, DEFAULT_PAGE_TEMPLATE, resolvePageTemplate } from '../worker/page-templates.js';
import { filterPageNavItemsByGeo } from '../worker/database/nav.js';
import { saveDraft, publishDraft, rollbackTo, readLiveDocument, normalizeDocument, DOC_VERSION, getDraft, previewOverlay } from '../worker/site-profile/versions.js';

const admin = { user_id: 1, email: 'boss@t.example', role: 'admin' };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
let db, ENV;

const addNav = (label, location = 'page', extra = {}) => db.prepare('INSERT INTO nav_items(label, url, location, position, enabled, auto_generated) VALUES(?,?,?,?,1,?)')
  .bind(label, extra.url || '/en/' + label.toLowerCase(), location, extra.position ?? 0, extra.auto ? 1 : 0).run().then((r) => Number(r.meta.last_row_id));
const addRule = (id, c, s) => db.prepare('INSERT INTO page_nav_geo_rules(nav_item_id, country_code, status) VALUES(?,?,?)').bind(id, c, s).run();
const rules = async (id) => ((await db.prepare('SELECT country_code, status FROM page_nav_geo_rules WHERE nav_item_id = ? ORDER BY country_code').bind(id).all()).results || []).map((r) => `${r.country_code}=${r.status}`).join(',');
const addPage = (slug, template = 'page.html') => db.prepare("INSERT INTO pages(slug, type, template, title) VALUES(?, 'page', ?, ?)").bind(slug, template, slug).run();

// migrations seed the default menu and pages; these tests want an empty site so counts mean something
beforeEach(() => {
  db = createTestDb(); applyMigrations(db); ENV = { DB: db };
  for (const t of ['page_nav_geo_rules', 'nav_items', 'pages']) db.prepare(`DELETE FROM ${t}`).run();
});

describe('page layouts', () => {
  test('three layouts are offered and the standard one is the default', () => {
    assert.deepEqual(Object.keys(PAGE_TEMPLATES), ['page.html', 'page-wide.html', 'page-landing.html']);
    assert.equal(DEFAULT_PAGE_TEMPLATE, 'page.html');
    for (const t of Object.values(PAGE_TEMPLATES)) assert.ok(t.label && t.help);
  });
  test('only listed layouts resolve; anything else falls back to standard', () => {
    assert.equal(resolvePageTemplate('page-wide.html'), 'page-wide.html');
    assert.equal(resolvePageTemplate('page-landing.html'), 'page-landing.html');
    for (const bad of ['', null, undefined, 'nope.html', '../admin/dashboard.html', 'page.html ', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) assert.equal(resolvePageTemplate(bad), 'page.html', String(bad));
  });
  test('every listed layout has a template file with the placeholders the page controller fills', () => {
    for (const name of Object.keys(PAGE_TEMPLATES)) {
      const html = read(`templates/pages/${name}`);
      for (const v of ['{{title}}', '{{content_json}}', '{{components_top}}', '{{components_content_top}}', '{{components_content_bottom}}', '{{components_bottom}}']) assert.ok(html.includes(v), `${name} has ${v}`);
    }
  });
  test('wide drops the width cap and landing drops the author line and dates', () => {
    assert.match(read('templates/pages/page-wide.html'), /max-width:none/);
    const landing = read('templates/pages/page-landing.html');
    assert.ok(!landing.includes('author_name') && !landing.includes('datePublished') && !landing.includes('dateModified'));
    assert.match(landing, /text-align:center/);
  });
  test('the page controller renders through resolvePageTemplate', () => {
    assert.match(read('worker/controllers/dynamic-pages.js'), /renderer\.render\(resolvePageTemplate\(page\.template\)/);
  });
  test('the Page layout field offers exactly the listed layouts, with readable names, and repairs stored junk', () => {
    const f = ROW_SETS.pages.fields.find((x) => x.k === 'template');
    assert.deepEqual(f.values, Object.keys(PAGE_TEMPLATES));
    assert.deepEqual(f.valueLabels, { 'page.html': 'Standard', 'page-wide.html': 'Wide', 'page-landing.html': 'Landing' });
    const n = normalizeRows({ pages: { a: { template: 'evil.html' }, b: { template: '' }, c: {}, d: { template: 'page-wide.html' } } }).pages;
    assert.equal(n.a.template, 'page.html'); assert.equal(n.b.template, 'page.html'); assert.equal(n.c.template, 'page.html'); assert.equal(n.d.template, 'page-wide.html');
  });
  test('a person cannot save a layout that is not listed', () => {
    const cur = normalizeRows({ pages: { about: { template: 'page.html' } } });
    assert.match(applyRowsPatch(cur, { pages: { set: { about: { template: 'evil.html' } } } }).errors.join(' '), /Page layout: choose one of the listed options/);
    const ok = applyRowsPatch(cur, { pages: { set: { about: { template: 'page-landing.html', seo_title: 'About us' } } } });
    assert.deepEqual(ok.errors, []); assert.equal(ok.rows.pages.about.template, 'page-landing.html'); assert.equal(ok.rows.pages.about.seo_title, 'About us');
  });
  test('pages cannot be created or removed from the layout list', () => {
    const cur = normalizeRows({ pages: { about: {} } });
    assert.match(applyRowsPatch(cur, { pages: { set: { fresh: { template: 'page.html' } } } }).errors.join(' '), /new items cannot be added/);
    assert.match(applyRowsPatch(cur, { pages: { remove: ['about'] } }).errors.join(' '), /cannot be removed/);
  });
  test('live rows carry the stored layout and preview shows the draft layout', async () => {
    await addPage('about', 'page-wide.html'); await addPage('terms');
    const { rows } = await readLiveRows(ENV);
    assert.equal(rows.pages.about.template, 'page-wide.html'); assert.equal(rows.pages.terms.template, 'page.html');
    const page = { slug: 'about', template: 'page.html', title: 'About' };
    assert.equal(previewPage(page, { pages: { about: { ...rows.pages.about, template: 'page-landing.html' } } }).template, 'page-landing.html');
    assert.equal(previewPage(page, null), page);
    assert.equal(previewPage(page, { pages: { other: rows.pages.about } }), page);
  });
  test('publishing writes the layout to the pages table, and an empty value falls back to standard', async () => {
    await addPage('about');
    const live = (await readLiveRows(ENV)).rows;
    const target = normalizeRows({ pages: { about: { ...live.pages.about, template: 'page-wide.html' } } });
    const st = rowStatements(ENV, live, target); assert.equal(st.length, 1);
    await ENV.DB.batch(st);
    assert.equal((await db.prepare("SELECT template FROM pages WHERE slug='about'").first()).template, 'page-wide.html');
    assert.equal(normalizeRows({ pages: { about: { ...target.pages.about, template: '' } } }).pages.about.template, 'page.html', 'an empty value is stored as the default');
  });
});

describe('menu-link country rules: parsing and cleaning', () => {
  const nav = (over = {}) => normalizeRows({ nav: { n1: { label: 'A', url: '/en/a', location: 'page', ...over } } });
  const set = (cur, change) => applyRowsPatch(cur, { nav: { set: { n1: change } } });
  test('statuses are allowed, blocked and restricted', () => assert.deepEqual(GEO_STATUS, ['allowed', 'blocked', 'restricted']));
  test('rules are upper-cased, sorted and de-duplicated, and any separator works', () => {
    const r = set(nav(), { geo: 'gb=Allowed; de=blocked  fr=restricted, GB=blocked' });
    assert.deepEqual(r.errors, []);
    assert.equal(r.rows.nav.n1.geo, 'DE=blocked,FR=restricted,GB=blocked');
  });
  test('an empty value clears the rules', () => {
    const cur = nav({ geo: 'GB=allowed' });
    assert.equal(cur.nav.n1.geo, 'GB=allowed');
    assert.equal(set(cur, { geo: '' }).rows.nav.n1.geo, '');
  });
  test('an invalid entry is refused with a message that names it', () => {
    for (const bad of ['GB', 'GB=maybe', 'GBR=allowed', '=allowed', 'GB=allowed, junk']) {
      const e = set(nav(), { geo: bad }).errors.join(' ');
      assert.match(e, /Country rules: use COUNTRY=allowed or COUNTRY=blocked/, bad);
    }
    assert.match(set(nav(), { geo: 'x'.repeat(40) }).errors.join(' '), /not “x{20}”/, 'the echoed value is cut short');
  });
  test('rules only apply to page-menu links', () => {
    const cur = nav({ location: 'header' });
    assert.match(set(cur, { geo: 'GB=allowed' }).errors.join(' '), /only apply to links in the page menu/);
    assert.deepEqual(set(cur, { geo: '' }).errors, []);
    // moving a link out of the page menu while it still has rules is refused too
    const moved = set(nav({ geo: 'GB=allowed' }), { location: 'header', geo: 'GB=allowed' });
    assert.match(moved.errors.join(' '), /only apply to links in the page menu/);
  });
  test('stored documents are read leniently: junk entries are dropped, good ones kept', () => {
    const n = normalizeRows({ nav: { n1: { label: 'A', url: '/a', location: 'page', geo: 'gb=allowed, junk, de=blocked' } } });
    assert.equal(n.nav.n1.geo, 'DE=blocked,GB=allowed');
  });
  test('publish re-checks rules the same way a fresh save does', () => {
    const rows = { nav: { n1: { label: 'A', url: '/en/a', location: 'header', position: 0, enabled: true, is_external: false, icon: '', parent: '', geo: 'GB=allowed', scope_type: '', scope_ref: '' } } };
    assert.match(validateRowSets(rows, {}).join(' '), /only apply to links in the page menu/);
    rows.nav.n1.location = 'page';
    assert.deepEqual(validateRowSets(rows, {}), []);
  });
});

describe('menu-link country rules: preview uses the live visibility rule', () => {
  const item = (geo) => ({ id: 1, __geo: geo });
  test('no rules and no country mean visible', () => {
    assert.equal(previewGeoFilter([item('')], 'GB').length, 1);
    assert.equal(previewGeoFilter([item('GB=blocked')], null).length, 1);
  });
  test('an exact rule decides', () => {
    assert.equal(previewGeoFilter([item('GB=allowed,DE=blocked')], 'GB').length, 1);
    assert.equal(previewGeoFilter([item('GB=allowed,DE=blocked')], 'DE').length, 0);
    assert.equal(previewGeoFilter([item('GB=restricted')], 'GB').length, 0);
  });
  test('only allowed hides it elsewhere, only blocked shows it elsewhere', () => {
    assert.equal(previewGeoFilter([item('GB=allowed')], 'FR').length, 0);
    assert.equal(previewGeoFilter([item('GB=blocked')], 'FR').length, 1);
    assert.equal(previewGeoFilter([item('GB=restricted')], 'FR').length, 1);
  });
  test('a mix of allowed and blocked hides it for countries without a rule', () => {
    assert.equal(previewGeoFilter([item('GB=allowed,DE=blocked')], 'FR').length, 0);
  });
  test('it gives the same answers as the live filter for every combination', async () => {
    const combos = ['', 'GB=allowed', 'GB=blocked', 'GB=restricted', 'GB=allowed,DE=blocked', 'GB=allowed,DE=allowed', 'DE=blocked,FR=restricted', 'GB=allowed,DE=restricted'];
    const items = [];
    for (const c of combos) {
      const id = await addNav('L' + items.length);
      for (const tok of c.split(',').filter(Boolean)) { const [cc, s] = tok.split('='); await addRule(id, cc, s); }
      items.push({ id, __geo: c });
    }
    for (const country of ['GB', 'DE', 'FR', 'US']) {
      const live = (await filterPageNavItemsByGeo(db, items.map(({ id }) => ({ id })), country)).map((i) => i.id);
      const prev = previewGeoFilter(items, country).map((i) => i.id);
      assert.deepEqual(prev, live, country);
    }
  });
  test('draft menu links carry their rules into the preview list, and the platform’s own links keep theirs', async () => {
    const auto = await addNav('Auto', 'page', { auto: true }); await addRule(auto, 'GB', 'blocked');
    const rows = { nav: { new1: { label: 'Mine', url: '/en/mine', location: 'page', position: 1, enabled: true, is_external: false, icon: '', parent: '', geo: 'DE=allowed', scope_type: '', scope_ref: '' } } };
    const list = await previewNavItems({ ...ENV, __preview: { rows } }, 'page', rows);
    const byLabel = Object.fromEntries(list.map((i) => [i.label, i]));
    assert.equal(byLabel.Mine.__geo, 'DE=allowed'); assert.equal(byLabel.Auto.__geo, 'GB=blocked');
    assert.deepEqual(previewGeoFilter(list, 'GB').map((i) => i.label), []);
    assert.deepEqual(previewGeoFilter(list, 'DE').map((i) => i.label), ['Auto', 'Mine'], 'a blocked-only link shows in other countries');
    assert.equal(await previewNavItems(ENV, 'page', {}), null, 'a draft with no menu change uses the normal readers');
  });
});

describe('menu-link country rules: live rows, publish and restore', () => {
  test('live rows read each link’s rules, sorted, and none for links without any', async () => {
    const a = await addNav('A'); const b = await addNav('B'); await addRule(a, 'GB', 'allowed'); await addRule(a, 'DE', 'blocked');
    const { rows } = await readLiveRows(ENV);
    assert.equal(rows.nav[`n${a}`].geo, 'DE=blocked,GB=allowed'); assert.equal(rows.nav[`n${b}`].geo, '');
  });
  test('links the platform generates are not in the document', async () => {
    await addNav('Mine'); await addNav('Gen', 'page', { auto: true });
    assert.deepEqual(Object.values((await readLiveRows(ENV)).rows.nav).map((r) => r.label), ['Mine']);
  });
  test('a missing rules table means no rules rather than a failure', async () => {
    await addNav('A'); await db.prepare('DROP TABLE page_nav_geo_rules').run();
    const { rows, skipped } = await readLiveRows(ENV);
    assert.equal(Object.values(rows.nav)[0].geo, ''); assert.ok(!skipped.some((s) => s.set === 'nav'));
  });
  test('changing only the rules rewrites them; leaving them alone does not touch them', async () => {
    const id = await addNav('A'); await addRule(id, 'GB', 'allowed');
    const live = (await readLiveRows(ENV)).rows;
    const same = normalizeRows({ nav: { [`n${id}`]: { ...live.nav[`n${id}`], label: 'Renamed' } } });
    const st1 = rowStatements(ENV, live, same);
    await ENV.DB.batch(st1); assert.equal(await rules(id), 'GB=allowed');
    const live2 = (await readLiveRows(ENV)).rows;
    const changed = normalizeRows({ nav: { [`n${id}`]: { ...live2.nav[`n${id}`], geo: 'DE=blocked,FR=allowed' } } });
    await ENV.DB.batch(rowStatements(ENV, live2, changed));
    assert.equal(await rules(id), 'DE=blocked,FR=allowed');
    const cleared = normalizeRows({ nav: { [`n${id}`]: { ...changed.nav[`n${id}`], geo: '' } } });
    await ENV.DB.batch(rowStatements(ENV, changed, cleared)); assert.equal(await rules(id), '');
  });
  test('a new link is inserted with its rules once it has a real id', async () => {
    const live = (await readLiveRows(ENV)).rows;
    const target = normalizeRows({ nav: { 'new-abc': { label: 'Fresh', url: '/en/fresh', location: 'page', geo: 'GB=allowed,DE=blocked' } } });
    const { rows, ids } = await allocateKeys(ENV, { ...live, nav: target.nav });
    const realKey = ids.get('new-abc'); assert.match(realKey, /^n\d+$/);
    await ENV.DB.batch(rowStatements(ENV, live, rows));
    assert.equal(await rules(Number(realKey.slice(1))), 'DE=blocked,GB=allowed');
  });
  test('deleting a link removes its rules and its row, and putting it back restores both', async () => {
    const id = await addNav('Keep'); await addRule(id, 'GB', 'allowed'); await addRule(id, 'DE', 'blocked');
    const before = (await readLiveRows(ENV)).rows;
    await ENV.DB.batch(rowStatements(ENV, before, { ...before, nav: {} }));
    assert.equal(await rules(id), ''); assert.equal(await db.prepare('SELECT id FROM nav_items WHERE id = ?').bind(id).first(), null);
    const empty = (await readLiveRows(ENV)).rows;
    await ENV.DB.batch(rowStatements(ENV, empty, before));
    assert.equal(await rules(id), 'DE=blocked,GB=allowed');
    assert.equal((await db.prepare('SELECT label FROM nav_items WHERE id = ?').bind(id).first()).label, 'Keep');
  });
  test('a link removed in the draft comes back from live with its rules when the editor sets it again', () => {
    const live = normalizeRows({ nav: { n7: { label: 'A', url: '/a', location: 'page', geo: 'GB=allowed' } } });
    const draft = { nav: {} };
    const r = applyRowsPatch(draft, { nav: { set: { n7: { label: 'A2' } } } }, live);
    assert.deepEqual(r.errors, []); assert.equal(r.rows.nav.n7.geo, 'GB=allowed'); assert.equal(r.rows.nav.n7.label, 'A2');
  });
});

describe('document versions', () => {
  test('the document version is 2 and rows travel inside the document', async () => {
    assert.equal(DOC_VERSION, 2);
    await addNav('A'); const doc = await readLiveDocument(ENV);
    assert.ok(doc.rows && Object.keys(doc.rows.nav).length === 1);
    assert.equal(normalizeDocument(doc).rows.nav[Object.keys(doc.rows.nav)[0]].geo, '');
  });
  test('save, publish and roll back a rule change end to end', async () => {
    const id = await addNav('A'); await addRule(id, 'GB', 'allowed'); const key = `n${id}`;
    const saved = await saveDraft(ENV, admin, { rows: { nav: { set: { [key]: { geo: 'DE=blocked' } } } } });
    assert.ok(saved.draft, JSON.stringify(saved));
    assert.equal(await rules(id), 'GB=allowed', 'a draft does not touch the live site');
    const pub = await publishDraft(ENV, 't.example', admin, { note: 'rules' });
    assert.ok(pub.version, JSON.stringify(pub)); assert.equal(await rules(id), 'DE=blocked');
    const back = await rollbackTo(ENV, 't.example', admin, 1);
    assert.ok(!back.error && !back.errors, JSON.stringify(back)); assert.equal(await rules(id), 'GB=allowed');
  });
  test('save, publish and roll back a layout change end to end', async () => {
    await addPage('about');
    const saved = await saveDraft(ENV, admin, { rows: { pages: { set: { about: { template: 'page-landing.html' } } } } });
    assert.ok(saved.draft, JSON.stringify(saved));
    assert.equal((await db.prepare("SELECT template FROM pages WHERE slug='about'").first()).template, 'page.html');
    assert.ok((await publishDraft(ENV, 't.example', admin)).version);
    assert.equal((await db.prepare("SELECT template FROM pages WHERE slug='about'").first()).template, 'page-landing.html');
    await rollbackTo(ENV, 't.example', admin, 1);
    assert.equal((await db.prepare("SELECT template FROM pages WHERE slug='about'").first()).template, 'page.html');
  });
  test('the preview overlay carries the draft’s layout and rules, and only for the sets that changed', async () => {
    await addPage('about'); const id = await addNav('A', 'page');
    await saveDraft(ENV, admin, { rows: { pages: { set: { about: { template: 'page-wide.html' } } }, nav: { set: { [`n${id}`]: { geo: 'GB=allowed' } } } } });
    const o = await previewOverlay(ENV);
    assert.equal(o.rows.pages.about.template, 'page-wide.html'); assert.equal(o.rows.nav[`n${id}`].geo, 'GB=allowed');
    assert.equal(o.rows.seo, undefined); assert.equal(o.rows.components, undefined);
  });
  test('a version saved before country rules existed restores without the rules field, and clears rules (documented)', async () => {
    const id = await addNav('A'); await addRule(id, 'GB', 'allowed');
    const live = (await readLiveRows(ENV)).rows;
    const old = JSON.parse(JSON.stringify(live)); delete old.nav[`n${id}`].geo;
    const target = normalizeRows(old);
    assert.equal(target.nav[`n${id}`].geo, '');
    await ENV.DB.batch(rowStatements(ENV, live, target));
    assert.equal(await rules(id), '');
  });
});

describe('row cleaning, patching and limits', () => {
  test('canonical rows: known sets only, sorted keys, spec field order, dangling parents cleared', () => {
    const n = normalizeRows({ junk: { a: {} }, nav: { n2: { label: 'B', parent: 'n9' }, n1: { label: 'A', parent: 'n1' } }, pages: [] });
    assert.deepEqual(Object.keys(n), ['nav']); assert.deepEqual(Object.keys(n.nav), ['n1', 'n2']);
    assert.equal(n.nav.n1.parent, ''); assert.equal(n.nav.n2.parent, '');
    assert.deepEqual(Object.keys(n.nav.n1), ROW_SETS.nav.fields.map((f) => f.k));
    assert.deepEqual(normalizeRows(null), {}); assert.deepEqual(normalizeRows('x'), {});
  });
  test('normalising twice changes nothing', () => {
    const once = normalizeRows({ nav: { n1: { label: 'A', url: '/a', location: 'page', geo: 'gb=allowed', enabled: 1 } }, pages: { a: { template: 'x' } } });
    assert.deepEqual(normalizeRows(once), once);
  });
  test('a new menu link needs a key, text, an address and a place; unknown and read-only fields are refused', () => {
    const cur = normalizeRows({ nav: {} });
    assert.match(applyRowsPatch(cur, { nav: { set: { bad: { label: 'A', url: '/a', location: 'header' } } } }).errors.join(' '), /needs a key like new-/);
    assert.match(applyRowsPatch(cur, { nav: { set: { 'new-1': { url: '/a', location: 'header' } } } }).errors.join(' '), /Link text: required/);
    assert.match(applyRowsPatch(cur, { nav: { set: { 'new-1': { label: 'A', url: 'javascript:alert(1)', location: 'header' } } } }).errors.join(' '), /Address: enter a full address/);
    assert.match(applyRowsPatch(cur, { nav: { set: { 'new-1': { label: 'A', url: '/a', location: 'nowhere' } } } }).errors.join(' '), /Where it appears: choose one/);
    assert.match(applyRowsPatch(cur, { nav: { set: { 'new-1': { label: 'A', url: '/a', location: 'header', scope_type: 'x' } } } }).errors.join(' '), /Scope type cannot be changed/);
    assert.match(applyRowsPatch(cur, { nav: { set: { 'new-1': { label: 'A', url: '/a', location: 'header', nope: 1 } } } }).errors.join(' '), /"nope" cannot be changed/);
    const ok = applyRowsPatch(cur, { nav: { set: { 'new-1': { label: 'A', url: '/a', location: 'page', geo: 'GB=allowed' } } } });
    assert.deepEqual(ok.errors, []); assert.deepEqual(ok.touched, ['nav']); assert.equal(ok.rows.nav['new-1'].geo, 'GB=allowed');
  });
  test('unknown lists, malformed patches and lists that are not available are refused', () => {
    const cur = normalizeRows({ nav: {} });
    assert.match(applyRowsPatch(cur, { users: { set: {} } }).errors.join(' '), /not something that can be changed/);
    assert.match(applyRowsPatch(cur, null).errors.join(' '), /Send row changes as an object/);
    assert.match(applyRowsPatch(cur, { nav: 'x' }).errors.join(' '), /send \{ set, remove \}/);
    assert.match(applyRowsPatch(cur, { seo: { set: {} } }).errors.join(' '), /cannot be edited here right now/);
  });
  test('a link cannot sit under itself or under a link that does not exist', () => {
    const cur = normalizeRows({ nav: { n1: { label: 'A', url: '/a', location: 'header' } } });
    assert.match(applyRowsPatch(cur, { nav: { set: { n1: { parent: 'n1' } } } }).errors.join(' '), /under itself/);
    // a parent that does not exist is cleared on the way in, so the link becomes top level rather than dangling
    const dangling = applyRowsPatch(cur, { nav: { set: { n1: { parent: 'n99' } } } });
    assert.deepEqual(dangling.errors, []); assert.equal(dangling.rows.nav.n1.parent, '');
    assert.match(applyRowsPatch(cur, { nav: { set: { n1: { parent: 'bogus' } } } }).errors.join(' '), /not a valid link/);
  });
  test('an error in one change refuses the whole patch (nothing partial)', () => {
    const cur = normalizeRows({ nav: { n1: { label: 'A', url: '/a', location: 'header' } } });
    const r = applyRowsPatch(cur, { nav: { set: { n1: { label: 'Better' }, 'new-1': { label: 'x' } } } });
    assert.ok(r.errors.length); assert.deepEqual(r.rows, {}); assert.deepEqual(r.touched, []);
  });
  test('the list cap is enforced', () => {
    const src = {}; for (let i = 1; i <= ROW_SETS.nav.cap; i++) src[`n${i}`] = { label: 'L' + i, url: '/l', location: 'header' };
    const cur = normalizeRows({ nav: src });
    assert.match(applyRowsPatch(cur, { nav: { set: { 'new-1': { label: 'One more', url: '/x', location: 'header' } } } }).errors.join(' '), /too many items.*limit 300/);
  });
  test('placements and components allow edits to the listed fields only', () => {
    const cur = normalizeRows({ placements: { p1: { page_type: 'page', page_slug: 'a', component_id: 3 } }, components: { c3: { type: 'hero', name: 'H', status: 'active' } } });
    assert.deepEqual(applyRowsPatch(cur, { placements: { set: { p1: { position: 4, injection_point: 'sidebar', enabled: false } } } }).errors, []);
    assert.match(applyRowsPatch(cur, { placements: { set: { p1: { injection_point: 'footer' } } } }).errors.join(' '), /Position on page: choose one/);
    assert.match(applyRowsPatch(cur, { placements: { set: { p1: { position: -1 } } } }).errors.join(' '), /whole number from 0 to 9999/);
    assert.match(applyRowsPatch(cur, { placements: { set: { p1: { component_id: 9 } } } }).errors.join(' '), /Component cannot be changed/);
    assert.match(applyRowsPatch(cur, { components: { set: { c3: { status: 'gone' } } } }).errors.join(' '), /Status: choose one/);
    assert.match(applyRowsPatch(cur, { components: { set: { c3: { name: '' } } } }).errors.join(' '), /Name: required/);
    assert.match(applyRowsPatch(cur, { components: { set: { c3: { settings_json: '{not json' } } } }).errors.join(' '), /Settings:/);
    assert.match(applyRowsPatch(cur, { components: { set: { c3: { settings_json: 'x'.repeat(20001) } } } }).errors.join(' '), /too long/);
  });
  test('an SEO record needs its page type and page and a key built from them', () => {
    const cur = normalizeRows({ seo: {} });
    assert.match(applyRowsPatch(cur, { seo: { set: { 'page|about': { title: 'T' } } } }).errors.join(' '), /choose the page type and page/);
    assert.match(applyRowsPatch(cur, { seo: { set: { wrong: { page_type: 'page', page_slug: 'about' } } } }).errors.join(' '), /key must be page type/);
    const ok = applyRowsPatch(cur, { seo: { set: { 'page|about': { page_type: 'page', page_slug: 'about', title: 'T', robots: 'noindex, follow' } } } });
    assert.deepEqual(ok.errors, []); assert.equal(ok.rows.seo['page|about'].robots, 'noindex, follow');
    assert.match(applyRowsPatch(cur, { seo: { set: { 'page|about': { page_type: 'page', page_slug: 'about', robots: 'sometimes' } } } }).errors.join(' '), /Search engines: choose one/);
  });
  test('previews apply SEO and component rows from the draft', () => {
    const rows = { seo: { 'page|a': { page_type: 'page', page_slug: 'a', title: 'T', description: '', keywords: '', canonical: '', og_image: '', robots: 'noindex, follow', schema_json: '' } } };
    assert.equal(previewSeo({ title: 'old' }, 'page', 'a', rows).title, 'T');
    assert.equal(previewSeo({ title: 'old' }, 'page', 'b', rows), null, 'a record the draft removes');
    assert.deepEqual(previewSeo({ title: 'old' }, 'page', 'a', null), { title: 'old' });
    const joined = [{ id: 1, component_id: 3, position: 5, enabled: 1, injection_point: 'top', name: 'old' }, { id: 2, component_id: 3, position: 1, enabled: 1, injection_point: 'top', name: 'old' }];
    const out = previewComponentRows(joined, { placements: { p1: { position: 0, enabled: true, injection_point: 'sidebar' }, p2: { position: 3, enabled: false, injection_point: 'top' } }, components: { c3: { name: 'New', title: '', status: 'active', settings_json: '' } } });
    assert.deepEqual(out.map((r) => [r.id, r.name, r.injection_point]), [[1, 'New', 'sidebar']]);
  });
});

describe('diff and three-way merge of rows', () => {
  const base = normalizeRows({ nav: { n1: { label: 'A', url: '/a', location: 'page', geo: 'GB=allowed' } }, pages: { about: { template: 'page.html' } } });
  const edit = (rows, set, key, over) => normalizeRows({ ...rows, [set]: { ...rows[set], [key]: { ...rows[set][key], ...over } } });
  test('the diff names the field in plain words, including layout and country rules', () => {
    const d = diffRows(base, edit(edit(base, 'nav', 'n1', { geo: 'DE=blocked' }), 'pages', 'about', { template: 'page-wide.html' }));
    const by = Object.fromEntries(d.map((x) => [x.key, x]));
    assert.equal(by['rows.nav.n1.geo'].label, 'A: Country rules'); assert.equal(by['rows.nav.n1.geo'].from, 'GB=allowed'); assert.equal(by['rows.nav.n1.geo'].to, 'DE=blocked');
    assert.equal(by['rows.pages.about.template'].label, 'about: Page layout');
  });
  test('added and removed links are reported, and a set missing on one side is not compared', () => {
    const gone = { nav: {}, pages: base.pages };
    assert.deepEqual(diffRows(base, gone).map((x) => x.to), ['removed']);
    assert.deepEqual(diffRows(base, { pages: base.pages }), []);
  });
  test('changes to different fields merge; the same field changed two ways is a conflict', () => {
    const mine = edit(base, 'nav', 'n1', { label: 'Mine' }), theirs = edit(base, 'nav', 'n1', { geo: 'FR=blocked' });
    const m = mergeRows(base, mine, theirs);
    assert.deepEqual(m.conflicts, []); assert.equal(m.rows.nav.n1.label, 'Mine'); assert.equal(m.rows.nav.n1.geo, 'FR=blocked');
    const a = edit(base, 'nav', 'n1', { geo: 'DE=blocked' });
    const c = mergeRows(base, a, theirs);
    assert.equal(c.conflicts.length, 1); assert.equal(c.conflicts[0].label, 'A: Country rules'); assert.equal(c.rows.nav.n1.geo, 'DE=blocked');
    assert.equal(mergeRows(base, a, theirs, 'live').rows.nav.n1.geo, 'FR=blocked');
  });
  test('a set the editor did not touch follows live, and a set live cannot read is left alone', () => {
    const live = edit(base, 'pages', 'about', { template: 'page-landing.html' });
    assert.equal(mergeRows(base, { nav: base.nav }, live).rows.pages.about.template, 'page-landing.html');
    assert.equal(mergeRows(base, base, { nav: base.nav }).rows.pages, undefined);
  });
});

describe('manifest for the screen', () => {
  test('every list is described, readonly and required flags are carried, and no row data is included', () => {
    const m = rowSetsManifest();
    assert.deepEqual(m.map((s) => s.id), SET_IDS);
    const pages = m.find((s) => s.id === 'pages'); assert.equal(pages.label, 'Page layout and search listing');
    const tpl = pages.fields.find((f) => f.key === 'template'); assert.equal(tpl.type, 'enum'); assert.equal(tpl.valueLabels['page-wide.html'], 'Wide');
    const geo = m.find((s) => s.id === 'nav').fields.find((f) => f.key === 'geo');
    assert.equal(geo.type, 'geo'); assert.equal(geo.label, 'Country rules'); assert.equal(geo.max, 600); assert.equal(geo.readonly, false);
    assert.equal(m.find((s) => s.id === 'components').fields.find((f) => f.key === 'settings_json').type, 'json');
    assert.ok(m.find((s) => s.id === 'seo').fields.find((f) => f.key === 'page_slug').readonly);
    assert.ok(!JSON.stringify(m).includes('"rows"'));
  });
});
