// Configuration screen, section 8 "Menus, SEO and components" (static/js/admin/configuration-rows.js).
// The real script runs against a small fake DOM and a controller wired to the real config API and an in-memory
// database, so a change typed on the screen travels the same path it does in a browser: screen -> API -> draft -> publish.
// This is not a browser: layout, focus, CSS and real input events are still worth one manual pass.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { route } from '../worker/api/routes/site-profile-versions.js';
import { getDraft, publishDraft } from '../worker/site-profile/versions.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SCRIPT = read('static/js/admin/configuration-rows.js');
const HTML = read('templates/pages/admin/configuration.html');
const admin = { user_id: 1, email: 'boss@t.example', role: 'admin' };
const editor = { user_id: 2, email: 'ed@t.example', role: 'editor' };
const viewer = { user_id: 3, email: 'v@t.example', role: 'viewer' };
let db, ENV;

const req = (method, path, body) => ({ method, url: `https://t.example${path}`, headers: new Headers(), json: async () => body });
const call = async (user, method, sub, body) => {
  const res = await route({ request: req(method, `/api/v1/config${sub}`, body), env: ENV, path: `/api/v1/config${sub}`, user });
  return { status: res.status, body: await res.json() };
};
const addNav = (label, location = 'page') => db.prepare('INSERT INTO nav_items(label, url, location, position, enabled, auto_generated) VALUES(?,?,?,0,1,0)').bind(label, '/en/' + label.toLowerCase(), location).run().then((r) => Number(r.meta.last_row_id));
const addPage = (slug, template = 'page.html') => db.prepare("INSERT INTO pages(slug, type, template, title) VALUES(?, 'page', ?, ?)").bind(slug, template, slug).run();
const pageTemplate = async (slug) => (await db.prepare('SELECT template FROM pages WHERE slug = ?').bind(slug).first()).template;
const rulesOf = async (id) => ((await db.prepare('SELECT country_code, status FROM page_nav_geo_rules WHERE nav_item_id = ? ORDER BY country_code').bind(id).all()).results || []).map((r) => `${r.country_code}=${r.status}`).join(',');
const sleep = (ms = 15) => new Promise((r) => setTimeout(r, ms));
const settle = async () => { for (let i = 0; i < 12; i++) await sleep(8); };

// migrations seed the default menu and pages; these tests want an empty site so lists hold only what they add
beforeEach(() => {
  db = createTestDb(); applyMigrations(db); ENV = { DB: db };
  for (const t of ['page_nav_geo_rules', 'nav_items', 'pages']) db.prepare(`DELETE FROM ${t}`).run();
});

// ---------- a very small DOM, enough for this script ----------
class El {
  constructor(tag) { this.tag = tag; this.kids = []; this._text = ''; this.parentNode = null; this.hidden = false; this.style = { cssText: '' }; }
  get children() { return this.kids; }
  get options() { return this.kids.filter((k) => k.tag === 'option'); }
  set textContent(v) { this.kids = []; this._text = String(v); }
  get textContent() { return this._text + this.kids.map((k) => k.textContent).join(''); }
  appendChild(c) { c.parentNode = this; this.kids.push(c); return c; }
}
const all = (n, out = []) => { out.push(n); n.kids.forEach((k) => all(k, out)); return out; };
const byTag = (n, tag) => all(n).filter((x) => x.tag === tag);

function boot({ state, user = admin, hash = '', perms }) {
  const ids = {}; const mk = (id, tag, parentTag) => { const e = new El(tag); e.id = id; if (parentTag) new El(parentTag).appendChild(e); ids[id] = e; return e; };
  mk('rowsRoot', 'div'); mk('rowsNotice', 'p'); mk('rowsTabs', 'nav'); mk('rowsHelp', 'p'); mk('rowsFind', 'input', 'p'); mk('rowsAdd', 'div'); mk('rowsMsg', 'p'); mk('rowsList', 'div'); mk('rowsMore', 'button');
  ids.rowsAdd.hidden = true; ids.rowsMore.hidden = true;
  let revision = 0; const sent = [];
  const C = {
    mode: 'draft',
    ready: Promise.resolve(state),
    onSaved() {},
    api: async (method, sub, body) => (await call(user, method, sub, body)).body,
    sendRows: async (patch) => {
      patch = JSON.parse(JSON.stringify(patch)); // objects made inside the script's sandbox are a different realm's
      sent.push(patch);
      const r = await call(user, 'PUT', '/draft', { rows: patch, revision: revision || undefined });
      if (r.body.draft) revision = r.body.draft.revision;
      return r.body;
    },
  };
  const confirms = [];
  const ctx = vm.createContext({
    document: { getElementById: (id) => ids[id] || null, createElement: (t) => new El(t), createTextNode: (t) => { const e = new El('#text'); e._text = String(t); return e; } },
    window: { LummetConfig: C, confirm: (m) => { confirms.push(m); return true; } },
    location: { hash }, history: { replaceState() {} },
    setTimeout: (fn) => setTimeout(fn, 0), clearTimeout, Promise, console,
  });
  new vm.Script(SCRIPT, { filename: 'configuration-rows.js' }).runInContext(ctx);
  return { ids, sent, confirms, C };
}
const stateFor = async (user = admin) => (await call(user, 'GET', '/state')).body;
const tabNames = (ids) => byTag(ids.rowsTabs, 'a').map((a) => a.textContent);
const item = (ids, title) => all(ids.rowsList).find((n) => n.tag === 'strong' && n.textContent === title).parentNode.parentNode;
const control = (box, label) => {
  const l = byTag(box, 'label').find((x) => x.kids[0] && x.kids[0].textContent.startsWith(label));
  assert.ok(l, `a "${label}" field`);
  return l.kids[1];
};

describe('the section on the page', () => {
  test('the HTML has every element the script reads, and the script is loaded in the fixed place', () => {
    for (const id of new Set([...SCRIPT.matchAll(/(?:\$|getElementById)\("(\w+)"\)/g)].map((m) => m[1]))) assert.match(HTML, new RegExp(`id="${id}"`), id);
    assert.match(HTML, /8\. Menus, SEO and components/);
  });
  test('the script is a plain script that parses', () => { assert.doesNotThrow(() => new vm.Script(SCRIPT)); assert.ok(!/^\s*(import|export)\s/m.test(SCRIPT)); });
  test('it builds the page with textContent and DOM calls, never innerHTML', () => { assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(SCRIPT)); });
});

describe('the rows API the screen uses', () => {
  test('the state carries every list’s description and which lists are available', async () => {
    await addPage('about');
    const s = await stateFor();
    assert.equal(s.ready, true);
    assert.ok(s.rows.sets.some((x) => x.id === 'pages' && x.label === 'Page layout and search listing'));
    assert.ok(s.rows.available.includes('pages') && s.rows.available.includes('nav'));
    assert.ok(!('rows' in s.live), 'no row data in the state');
  });
  test('a list is returned with live and draft rows and the changed keys; unknown lists are 404', async () => {
    await addPage('about');
    let r = await call(admin, 'GET', '/rows/pages');
    assert.equal(r.status, 200); assert.deepEqual(r.body.changed, []); assert.equal(r.body.rows.about.template, 'page.html');
    await call(admin, 'PUT', '/draft', { rows: { pages: { set: { about: { template: 'page-wide.html' } } } } });
    r = await call(admin, 'GET', '/rows/pages');
    assert.deepEqual(r.body.changed, ['about']); assert.equal(r.body.rows.about.template, 'page-wide.html'); assert.equal(r.body.live.about.template, 'page.html');
    assert.equal((await call(admin, 'GET', '/rows/users')).status, 404);
  });
  test('roles: the viewer sees nothing, the editor edits the draft, only the admin publishes', async () => {
    await addPage('about');
    assert.equal((await call(viewer, 'GET', '/rows/pages')).status, 403);
    assert.equal((await call(editor, 'PUT', '/draft', { rows: { pages: { set: { about: { template: 'page-landing.html' } } } } })).status, 200);
    assert.equal((await call(editor, 'POST', '/publish', {})).status, 403);
    assert.equal(await pageTemplate('about'), 'page.html');
    assert.equal((await call(admin, 'POST', '/publish', {})).status, 200);
    assert.equal(await pageTemplate('about'), 'page-landing.html');
  });
  test('a bad value is refused with a plain message and nothing is saved', async () => {
    await addPage('about'); const id = await addNav('Press');
    let r = await call(admin, 'PUT', '/draft', { rows: { pages: { set: { about: { template: '../x.html' } } } } });
    assert.equal(r.status, 422); assert.match(r.body.error, /Page layout: choose one of the listed options/);
    r = await call(admin, 'PUT', '/draft', { rows: { nav: { set: { [`n${id}`]: { geo: 'GB' } } } } });
    assert.equal(r.status, 422); assert.match(r.body.error, /Country rules: use COUNTRY=allowed or COUNTRY=blocked/);
    assert.equal(await getDraft(ENV), null);
  });
  test('a stale revision is a conflict', async () => {
    await addPage('about');
    const a = await call(admin, 'PUT', '/draft', { rows: { pages: { set: { about: { template: 'page-wide.html' } } } } });
    const b = await call(editor, 'PUT', '/draft', { revision: a.body.draft.revision + 5, rows: { pages: { set: { about: { template: 'page.html' } } } } });
    assert.equal(b.status, 409);
  });
  test('a list over its cap is reported as skipped instead of being edited', async () => {
    for (let i = 0; i < 301; i++) await db.prepare("INSERT INTO nav_items(label, url, location, auto_generated) VALUES(?, '/x', 'header', 0)").bind('L' + i).run();
    const s = await stateFor();
    assert.ok(!s.rows.available.includes('nav')); assert.ok(s.rows.skipped.some((x) => x.set === 'nav' && /more than 300/.test(x.reason)));
    assert.equal((await call(admin, 'GET', '/rows/nav')).status, 404);
  });
});

describe('the screen, run against the real API', () => {
  test('lists the available lists as tabs and opens the one named in the address', async () => {
    await addPage('about'); await addNav('Press');
    const { ids } = boot({ state: await stateFor(), hash: '#rows-pages' });
    await settle();
    assert.ok(tabNames(ids).includes('Page layout and search listing') && tabNames(ids).includes('Menu links'));
    assert.match(ids.rowsHelp.textContent, /layout of each standard page/);
    assert.ok(all(ids.rowsList).some((n) => n.tag === 'strong' && n.textContent === 'about'));
  });
  test('Page layout is a drop-down of the three layouts with readable names and the stored one selected', async () => {
    await addPage('about', 'page-wide.html');
    const { ids } = boot({ state: await stateFor(), hash: '#rows-pages' }); await settle();
    const sel = control(item(ids, 'about'), 'Page layout');
    assert.equal(sel.tag, 'select');
    assert.deepEqual(sel.options.map((o) => [o.value, o.textContent]), [['page.html', 'Standard'], ['page-wide.html', 'Wide'], ['page-landing.html', 'Landing']]);
    assert.deepEqual(sel.options.filter((o) => o.selected).map((o) => o.value), ['page-wide.html']);
  });
  test('choosing a layout saves to the draft only, then publishing makes it live', async () => {
    await addPage('about');
    const { ids, sent } = boot({ state: await stateFor(), hash: '#rows-pages' }); await settle();
    const sel = control(item(ids, 'about'), 'Page layout');
    sel.value = 'page-landing.html'; sel.onchange(); await settle();
    assert.deepEqual(sent, [{ pages: { set: { about: { template: 'page-landing.html' } } } }]);
    assert.equal((await getDraft(ENV)).document.rows.pages.about.template, 'page-landing.html');
    assert.equal(await pageTemplate('about'), 'page.html', 'the live site is unchanged until publish');
    assert.equal(item(ids, 'about').textContent.includes('Changed in draft'), true);
    assert.ok((await publishDraft(ENV, 't.example', admin)).version);
    assert.equal(await pageTemplate('about'), 'page-landing.html');
  });
  test('a menu link shows a Country rules box; an invalid entry shows the message, a valid one is saved', async () => {
    const id = await addNav('Press');
    const { ids, sent } = boot({ state: await stateFor(), hash: '#rows-nav' }); await settle();
    const box = item(ids, 'Press'); const geo = control(box, 'Country rules');
    assert.equal(geo.tag, 'input'); assert.equal(geo.type, 'text'); assert.equal(geo.maxLength, 600);
    geo.value = 'GB'; geo.oninput(); await settle();
    assert.match(box.textContent, /Country rules: use COUNTRY=allowed or COUNTRY=blocked/);
    assert.equal(await getDraft(ENV), null, 'nothing saved for an invalid entry');
    geo.value = 'gb=allowed, de=blocked'; geo.oninput(); await settle();
    assert.deepEqual(sent[sent.length - 1], { nav: { set: { [`n${id}`]: { geo: 'gb=allowed, de=blocked' } } } });
    assert.doesNotMatch(box.textContent, /use COUNTRY=/);
    assert.equal((await getDraft(ENV)).document.rows.nav[`n${id}`].geo, 'DE=blocked,GB=allowed');
    assert.equal(await rulesOf(id), '', 'live rules untouched until publish');
    await publishDraft(ENV, 't.example', admin);
    assert.equal(await rulesOf(id), 'DE=blocked,GB=allowed');
  });
  test('rapid typing in several fields of one link is sent as one change', async () => {
    const id = await addNav('Press');
    const { ids, sent } = boot({ state: await stateFor(), hash: '#rows-nav' }); await settle();
    const box = item(ids, 'Press');
    const label = control(box, 'Link text'), geo = control(box, 'Country rules');
    label.value = 'Press room'; label.oninput(); geo.value = 'FR=allowed'; geo.oninput(); await settle();
    assert.equal(sent.length, 1); assert.deepEqual(sent[0].nav.set[`n${id}`], { label: 'Press room', geo: 'FR=allowed' });
  });
  test('removing a link asks first, then drafts the removal, and live keeps it until publish', async () => {
    const id = await addNav('Press');
    const { ids, confirms } = boot({ state: await stateFor(), hash: '#rows-nav' }); await settle();
    const rm = byTag(item(ids, 'Press'), 'button').find((b) => b.textContent === 'Remove');
    rm.onclick(); await settle();
    assert.equal(confirms.length, 1); assert.match(confirms[0], /Press/);
    assert.deepEqual(Object.keys((await getDraft(ENV)).document.rows.nav), []);
    assert.ok(await db.prepare('SELECT id FROM nav_items WHERE id = ?').bind(id).first());
  });
  test('Undo my changes appears after a re-read and puts the live values back', async () => {
    await addPage('about');
    const { ids } = boot({ state: await stateFor(), hash: '#rows-pages' }); await settle();
    const first = control(item(ids, 'about'), 'Page layout'); first.value = 'page-wide.html'; first.onchange(); await settle();
    // switching tabs and back re-reads the list from the draft
    const tabs = byTag(ids.rowsTabs, 'a'); tabs.find((a) => a.textContent === 'Menu links').onclick({ preventDefault() {} }); await settle();
    tabs.find((a) => a.textContent === 'Page layout and search listing').onclick({ preventDefault() {} }); await settle();
    const undo = byTag(item(ids, 'about'), 'button').find((b) => b.textContent === 'Undo my changes');
    assert.ok(undo, 'undo is offered');
    undo.onclick(); await settle();
    assert.equal((await call(admin, 'GET', '/rows/pages')).body.rows.about.template, 'page.html');
  });
  test('a role that cannot edit the draft sees the lists but every control is disabled and no add form is offered', async () => {
    await addPage('about'); await addNav('Press');
    const s = await stateFor(); s.permissions = { ...s.permissions, editDraft: false };
    const { ids } = boot({ state: s, hash: '#rows-pages' }); await settle();
    assert.match(ids.rowsNotice.textContent, /look but not edit/);
    assert.equal(control(item(ids, 'about'), 'Page layout').disabled, true);
    assert.equal(ids.rowsAdd.hidden, true);
  });
  test('adding a menu link offers the Country rules field and sends it with the new link', async () => {
    const { ids, sent } = boot({ state: await stateFor(), hash: '#rows-nav' }); await settle();
    assert.equal(ids.rowsAdd.hidden, false);
    const form = ids.rowsAdd;
    const field = (label) => { const l = byTag(form, 'label').find((x) => x.kids[0].textContent.startsWith(label)); assert.ok(l, label); return l.kids[1]; };
    field('Link text').value = 'Fresh'; field('Link text').oninput();
    field('Address').value = '/en/fresh'; field('Address').oninput();
    const where = field('Where it appears'); where.value = 'page'; where.onchange();
    field('Country rules').value = 'GB=allowed'; field('Country rules').oninput();
    byTag(form, 'button').find((b) => b.textContent === 'Add to draft').onclick(); await settle();
    const p = sent[sent.length - 1]; const [key, row] = Object.entries(p.nav.set)[0];
    assert.match(key, /^new-[a-z0-9]+$/); assert.equal(row.label, 'Fresh'); assert.equal(row.geo, 'GB=allowed'); assert.equal(row.location, 'page');
    assert.deepEqual(Object.keys((await getDraft(ENV)).document.rows.nav), [key]);
  });
  test('before migration 0009 the section explains what to run instead of showing editors', async () => {
    const { ids } = boot({ state: { ready: false, permissions: {} } }); await settle();
    assert.match(ids.rowsNotice.textContent, /0009_config_versions\.sql/);
    assert.equal(ids.rowsFind.parentNode.hidden, true); assert.equal(byTag(ids.rowsTabs, 'a').length, 0);
  });
  test('lists that cannot be edited on this site are named in a note', async () => {
    const s = await stateFor(); s.rows = { ...s.rows, skipped: [{ set: 'seo', reason: 'more than 400 items' }] };
    const { ids } = boot({ state: s }); await settle();
    assert.match(ids.rowsNotice.textContent, /SEO records is not editable here \(more than 400 items\)/);
  });
});

// ---------- Phase 9: the welcome panel on the Configuration screen (static/js/admin/configuration.js) ----------
// The real script runs against a permissive fake DOM; fetch is wired to the real dashboard routes and an in-memory site, so the
// text, the Confirm button and the hide-after-confirm all follow what the server really answers. Not a browser.
describe('the welcome panel (setup confirmation)', () => {
  const CONFIG_SCRIPT = read('static/js/admin/configuration.js');
  const profileRoute = async () => (await import('../worker/api/routes/site-profile.js')).route;
  const setupApi = async () => import('../worker/site-profile/setup.js');
  const pendingWith = async (source, extra = {}) => {
    const { SETUP_STATE, SETUP_SOURCE, SETUP_PRESET, SETUP_FROM } = await setupApi();
    const put = (k, v) => db.prepare('INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)').bind(k, v).run();
    await put(SETUP_STATE, 'pending'); await put(SETUP_SOURCE, source);
    if (extra.preset) await put(SETUP_PRESET, extra.preset);
    if (extra.from) await put(SETUP_FROM, extra.from);
  };

  // Every element the page has exists on demand; the panel starts hidden, as in the template.
  async function bootConfig({ user = admin, failComplete = false, failSetup = false } = {}) {
    const route = await profileRoute();
    const ids = {};
    const get = (id) => { if (!ids[id]) { const e = new El('div'); e.id = id; e.checked = false; e.value = ''; e.disabled = false; ids[id] = e; } return ids[id]; };
    get('cfgSetup').hidden = true; get('cfgRoot');
    const posts = [];
    const respond = async (u, method) => {
      const path = new URL(u, 'https://t.example').pathname.replace(/^\/en/, '');
      // the main configuration payload is admin-only; the panel's own endpoints answer for the user under test
      const who = path === '/api/v1/site-profile' ? admin : user;
      const res = await route({ request: req(method, path), env: ENV, path, user: who });
      const status = res.status; const body = await res.json();
      return { ok: status >= 200 && status < 300, status, json: async () => body };
    };
    const fetchStub = (u, opts = {}) => {
      const method = (opts.method || 'GET').toUpperCase();
      if (method === 'POST') posts.push(u);
      if (failSetup && u.endsWith('/site-profile/setup')) return Promise.reject(new Error('offline'));
      if (failComplete && u.endsWith('/setup/complete')) return Promise.reject(new Error('offline'));
      return respond(u, method);
    };
    const ctx = vm.createContext({
      document: { getElementById: get, createElement: (t) => new El(t), createTextNode: (t) => { const e = new El('#text'); e._text = String(t); return e; }, activeElement: { matches: () => false } },
      window: { confirm: () => true }, location: { reload() {} }, fetch: fetchStub,
      setTimeout, clearTimeout, Promise, console, JSON, Object, Array,
    });
    new vm.Script(CONFIG_SCRIPT, { filename: 'configuration.js' }).runInContext(ctx);
    await settle(); await settle();
    return { ids, posts, get };
  }

  test('the template has the panel and every element the script reads for it, and the panel starts hidden', () => {
    assert.match(HTML, /id="cfgSetup"[^>]*\bhidden\b/);
    for (const id of ['cfgSetupText', 'cfgSetupConfirm', 'cfgSetupMsg', 'cfgSetupChange']) assert.match(HTML, new RegExp(`id="${id}"`), id);
    assert.match(CONFIG_SCRIPT, /\/en\/api\/v1\/site-profile\/setup"/); assert.match(CONFIG_SCRIPT, /\/setup\/complete"/);
  });
  test('a site whose setup is complete never shows the panel', async () => {
    const { ids } = await bootConfig();
    assert.equal(ids.cfgSetup.hidden, true);
  });
  test('a site created from a setup type says which one, and an administrator sees the Confirm button', async () => {
    await pendingWith('preset', { preset: 'news' });
    const { ids } = await bootConfig();
    assert.equal(ids.cfgSetup.hidden, false);
    assert.match(ids.cfgSetupText.textContent, /setup type/); assert.match(ids.cfgSetupText.textContent, /News site only/);
    assert.equal(ids.cfgSetupConfirm.hidden, false);
  });
  test('a site created as a copy names the site it was copied from', async () => {
    await pendingWith('clone', { from: 'source.example' });
    const { ids } = await bootConfig();
    assert.equal(ids.cfgSetup.hidden, false); assert.match(ids.cfgSetupText.textContent, /copy of source\.example/);
  });
  test('an editor sees the panel but not the Confirm button, and cannot confirm', async () => {
    await pendingWith('preset', { preset: 'news' });
    const { ids, posts } = await bootConfig({ user: editor });
    assert.equal(ids.cfgSetup.hidden, false); assert.equal(ids.cfgSetupConfirm.hidden, true); assert.deepEqual(posts.filter((u) => u.includes('/setup')), []);
    const { getSetup } = await setupApi(); assert.equal((await getSetup(ENV)).pending, true);
  });
  test('Confirm posts once, the server ends the wizard, and the panel hides', async () => {
    await pendingWith('preset', { preset: 'news' });
    const { ids, posts } = await bootConfig();
    ids.cfgSetupConfirm.onclick(); await settle(); await settle();
    assert.deepEqual(posts.filter((u) => u.includes('/setup')), ['/en/api/v1/site-profile/setup/complete'], 'one confirm, nothing else written');
    assert.equal(ids.cfgSetup.hidden, true);
    const { getSetup } = await setupApi(); const s = await getSetup(ENV); assert.equal(s.pending, false); assert.equal(s.source, 'owner');
  });
  test('a network failure keeps the panel visible, says nothing was changed, and lets the person try again', async () => {
    await pendingWith('preset', { preset: 'news' });
    const { ids } = await bootConfig({ failComplete: true });
    ids.cfgSetupConfirm.onclick(); await settle();
    assert.equal(ids.cfgSetup.hidden, false); assert.match(ids.cfgSetupMsg.textContent, /Network error\. Nothing was changed/);
    assert.equal(ids.cfgSetupConfirm.disabled, false);
    const { getSetup } = await setupApi(); assert.equal((await getSetup(ENV)).pending, true);
  });
  test('if the setup state cannot be read the panel stays hidden and the rest of the screen still loads', async () => {
    await pendingWith('preset', { preset: 'news' });
    const { ids } = await bootConfig({ failSetup: true });
    assert.equal(ids.cfgSetup.hidden, true); assert.ok(ids.cfgPresets.kids.length > 0, 'the presets were still drawn');
  });
});
