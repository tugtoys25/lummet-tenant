// Configuration screen, section 9 "Export, import and presets" (static/js/admin/configuration-transfer.js).
// The real script runs against a small fake DOM and a controller wired to the real transfer API and an in-memory
// database, so what is typed or clicked on the screen travels the same path it does in a browser:
// screen -> API -> store/draft. A few tests swap in a canned API to reach states that are awkward to build
// (a high-risk review, out-of-order answers). This is not a browser: layout, focus, CSS and real input events
// still deserve one manual pass.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { route } from '../worker/api/routes/site-profile-transfer.js';
import { getDraft, readLiveDocument } from '../worker/site-profile/versions.js';
import { newToken } from '../worker/site-profile/transfer-store.js';
import { admin, editor, viewer, freshSite, setSetting, setting } from './support/transfer-fixtures.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SCRIPT = read('static/js/admin/configuration-transfer.js');
const HTML = read('templates/pages/admin/configuration.html');
const BASE = read('templates/layout/base.html');
const CSS = read('css-src/dashboard/09-config-transfer.css');

let db, ENV;
beforeEach(async () => { ({ db, env: ENV } = freshSite()); await setSetting(db, 'theme_primary', '#112233'); });

const sleep = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const settle = async () => { for (let i = 0; i < 14; i++) await sleep(6); };

// ---------- a very small DOM, enough for this script ----------
class El {
  constructor(tag) { this.tag = tag; this.kids = []; this._text = ''; this.parentNode = null; this.hidden = false; this.style = { cssText: '' }; this.className = ''; this.attrs = {}; this.disabled = false; this.value = ''; this.focused = 0; }
  get children() { return this.kids; }
  set textContent(v) { this.kids = []; this._text = String(v); }
  get textContent() { return this._text + this.kids.map((k) => k.textContent).join(''); }
  appendChild(c) { c.parentNode = this; this.kids.push(c); return c; }
  removeChild(c) { this.kids = this.kids.filter((k) => k !== c); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  focus() { this.focused++; }
  select() { this.selected = true; }
  scrollIntoView() { this.scrolled = true; }
  click() { if (this.onclick) this.onclick(); }
}
const all = (n, out = []) => { out.push(n); n.kids.forEach((k) => all(k, out)); return out; };
const has = (n, cls) => String(n.className).split(/\s+/).includes(cls);
const byClass = (n, cls) => all(n).filter((x) => has(x, cls));
const buttons = (n) => all(n).filter((x) => x.tag === 'button');
const btn = (n, text) => { const b = buttons(n).find((x) => x.textContent === text); assert.ok(b, `a "${text}" button`); return b; };
const hasBtn = (n, text) => buttons(n).some((x) => x.textContent === text);
const inputs = (n, type) => all(n).filter((x) => x.tag === 'input' && x.type === type);
const byPlaceholder = (n, p) => { const x = all(n).find((e) => e.placeholder && e.placeholder.startsWith(p)); assert.ok(x, `a field with placeholder "${p}"`); return x; };
const press = async (b) => { assert.ok(!b.disabled, `"${b.textContent}" is enabled`); await b.onclick(); await settle(); };

function boot({ user = admin, api, state, env = ENV, fetchImpl, rev = { n: 0 } } = {}) {
  const ids = {}; const root = new El('div'); root.id = 'xferRoot'; ids.xferRoot = root;
  const confirms = [], anchors = [], reloads = [], fetched = [], blobs = [];
  const real = async (method, sub, body) => {
    const [pathOnly] = `/api/v1/config${sub}`.split('?');
    const res = await route({ request: { method, url: `https://t.example/api/v1/config${sub}`, headers: new Headers(), json: async () => { if (body === undefined) throw new Error('no body'); return body; } }, env, path: pathOnly, user });
    return JSON.parse(await res.text());
  };
  const C = {
    ready: (async () => state || real('GET', '/transfer/state'))().then(() => ({})),
    api: async (m, s, b) => JSON.parse(JSON.stringify(await (api || real)(m, s, b))), // plain objects, as a browser's JSON would give
    getState: () => ({ draft: null }), flush: async () => {}, revision: () => rev.n,
  };
  const ctx = vm.createContext({
    document: {
      getElementById: (id) => ids[id] || null,
      createElement: (t) => { const e = new El(t); if (t === 'a') anchors.push(e); return e; },
      createTextNode: (t) => { const e = new El('#text'); e._text = String(t); return e; },
      body: new El('body'),
    },
    window: { LummetConfig: C, confirm: (m) => { confirms.push(m); return true; } },
    navigator: {}, location: { reload: () => reloads.push(1) },
    fetch: fetchImpl || (async (url) => { fetched.push(url); const u = new URL(url, 'https://t.example'); return route({ request: { method: 'GET', url: u.href, headers: new Headers() }, env, path: u.pathname.replace(/^\/en(?=\/)/, ''), user }); }), // the router sees paths without the language prefix
    Blob: class { constructor(parts, o) { blobs.push({ parts, type: o && o.type }); } }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    setTimeout: (fn) => setTimeout(fn, 0), clearTimeout, Promise, console,
  });
  new vm.Script(SCRIPT, { filename: 'configuration-transfer.js' }).runInContext(ctx);
  return { root, confirms, anchors, reloads, fetched, blobs, rev, C, tabs: () => byClass(root, 'xfer-tab').map((t) => t.textContent), activeTab: () => byClass(root, 'xfer-tab').find((t) => has(t, 'is-active')).textContent, tab: async (label) => { await press(byClass(root, 'xfer-tab').find((t) => t.textContent === label)); }, text: () => root.textContent };
}
const ready = async (opts) => { const s = boot(opts); await settle(); return s; };

// a configuration file exported from this same site, as a pasted-text string
const exportText = async (sections = 'settings.theme', colour = '#778899') => {
  await setSetting(db, 'theme_primary', colour);
  const res = await route({ request: { method: 'GET', url: `https://t.example/api/v1/config/transfer/export?sections=${sections}`, headers: new Headers() }, env: ENV, path: '/api/v1/config/transfer/export', user: admin });
  const j = await res.json(); await setSetting(db, 'theme_primary', '#112233'); return JSON.stringify(j.envelope);
};
const paste = async (s, text) => { await s.tab('Import a file'); const area = all(s.root).find((x) => x.tag === 'textarea'); area.value = text; await press(btn(s.root, 'Check this file')); };

describe('the section on the page', () => {
  test('the HTML has the element the script reads and base.html loads the script', () => {
    assert.match(HTML, /id="xferRoot"/); assert.match(HTML, /9\. Export, import and presets/); assert.match(BASE, /configuration-transfer\.js/);
  });
  test('the script is a plain script that parses, never builds markup, and does not use the wrong button class', () => {
    assert.doesNotThrow(() => new vm.Script(SCRIPT)); assert.ok(!/^\s*(import|export)\s/m.test(SCRIPT));
    assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|eval\(/.test(SCRIPT)); assert.ok(!/btn--small/.test(SCRIPT));
  });
  test('every xfer- class the script uses is styled by the screen stylesheet', () => {
    const used = new Set([...SCRIPT.matchAll(/"((?:xfer-[a-z-]+)(?: [a-z-]+)*)"/g)].flatMap((m) => m[1].split(' ')).filter((c) => c.startsWith('xfer-')));
    assert.ok(used.size > 15); for (const c of used) assert.ok(CSS.includes(`.${c}`), `.${c} has no rule`);
    for (const s of ['active', 'revoked', 'expired', 'used-up']) assert.ok(CSS.includes(`.xfer-status.is-${s}`), `status ${s}`);
  });
  test('it does nothing when the page has no xferRoot, and says so when the draft controller is missing', () => {
    const run = (ids, win) => new vm.Script(SCRIPT).runInContext(vm.createContext({ document: { getElementById: (i) => ids[i] || null, createElement: (t) => new El(t), createTextNode: (t) => { const e = new El('#text'); e._text = t; return e; } }, window: win, setTimeout, clearTimeout, Promise, console }));
    assert.doesNotThrow(() => run({}, {}));
    const root = new El('div'); run({ xferRoot: root }, {}); assert.match(root.textContent, /needs the draft controller/);
  });
});

describe('who sees what', () => {
  test('an administrator gets all five tabs, starting on Export', async () => {
    const s = await ready(); assert.deepEqual(s.tabs(), ['Export', 'Import a file', 'Presets', 'Copy from another site', 'Share this site']); assert.equal(s.activeTab(), 'Export');
  });
  test('an editor gets no Share tab and cannot save a preset', async () => {
    const s = await ready({ user: editor }); assert.deepEqual(s.tabs(), ['Export', 'Import a file', 'Presets', 'Copy from another site']);
    assert.ok(!hasBtn(s.root, 'Save as preset')); assert.ok(hasBtn(s.root, 'Download file'));
  });
  test('a viewer gets the server’s refusal and no tabs', async () => {
    const s = await ready({ user: viewer }); assert.deepEqual(s.tabs(), []); const n = byClass(s.root, 'xfer-notice')[0]; assert.equal(n.hidden, false); assert.match(n.textContent, /role cannot/);
  });
  test('when the server cannot be reached the notice says so', async () => {
    const s = await ready({ api: async () => { throw new Error('down'); }, state: {} }); assert.match(s.text(), /Could not reach the server/);
  });
  test('arrow keys move between tabs and wrap around', async () => {
    const s = await ready(); let prevented = 0;
    byClass(s.root, 'xfer-tab')[0].onkeydown({ key: 'ArrowRight', preventDefault: () => prevented++ }); assert.equal(s.activeTab(), 'Import a file');
    byClass(s.root, 'xfer-tab')[1].onkeydown({ key: 'ArrowLeft', preventDefault: () => prevented++ }); byClass(s.root, 'xfer-tab')[0].onkeydown({ key: 'ArrowLeft', preventDefault: () => prevented++ });
    assert.equal(s.activeTab(), 'Share this site'); assert.equal(prevented, 3);
    byClass(s.root, 'xfer-tab')[4].onkeydown({ key: 'a', preventDefault: () => prevented++ }); assert.equal(s.activeTab(), 'Share this site'); assert.equal(prevented, 3);
    const active = byClass(s.root, 'xfer-tab').find((t) => has(t, 'is-active')); assert.equal(active.attrs['aria-selected'], 'true'); assert.equal(active.tabIndex, 0);
  });
});

describe('export', () => {
  test('everything is ticked at first, Select none and the business-details shortcut change the ticks', async () => {
    const s = await ready(); const boxes = () => inputs(byClass(s.root, 'xfer-picker')[0], 'checkbox');
    assert.ok(boxes().length > 5); assert.ok(boxes().every((b) => b.checked));
    await press(btn(s.root, 'Select none')); assert.ok(boxes().every((b) => !b.checked));
    await press(btn(s.root, 'Everything except business details')); const on = boxes().filter((b) => b.checked).length; assert.ok(on > 0 && on < boxes().length);
    assert.ok(byClass(s.root, 'xfer-tag').some((t) => t.textContent === 'About this business'));
    assert.ok(byClass(s.root, 'xfer-tag').some((t) => has(t, 'is-warn') && /which pages exist/.test(t.textContent)));
  });
  test('downloading with nothing ticked says so and asks the server for nothing', async () => {
    const s = await ready(); await press(btn(s.root, 'Select none')); await press(btn(s.root, 'Download file'));
    assert.match(s.text(), /Choose at least one section/); assert.equal(s.fetched.length, 0);
  });
  test('Download file asks for exactly the ticked sections and hands the browser a .json file', async () => {
    const s = await ready(); await press(btn(s.root, 'Select none'));
    const theme = all(s.root).find((x) => x.tag === 'input' && x.type === 'checkbox' && x.parentNode.textContent.includes('Colours')); assert.ok(theme, 'a colours box'); theme.checked = true; theme.onchange();
    byPlaceholder(s.root, 'For example: News site').value = 'My starter'; await press(btn(s.root, 'Download file'));
    assert.equal(s.fetched.length, 1); const u = new URL(s.fetched[0], 'https://t.example'); assert.equal(u.pathname, '/en/api/v1/config/transfer/export'); assert.equal(u.searchParams.get('download'), '1'); assert.equal(u.searchParams.get('from'), 'live'); assert.equal(u.searchParams.get('name'), 'My starter'); assert.match(u.searchParams.get('sections'), /^settings\.\w+$/);
    assert.equal(s.anchors.length, 1); assert.match(s.anchors[0].download, /\.json$/); assert.match(s.text(), /File downloaded/);
    const file = JSON.parse(s.blobs[0].parts[0]); assert.equal(file.name, 'My starter'); assert.equal(s.blobs[0].type, 'application/json');
  });
  test('a refusal from the server is shown and nothing is downloaded', async () => {
    const f = async () => new Response(JSON.stringify({ success: false, error: 'Nothing to export.' }), { status: 422 });
    const s = await ready({ fetchImpl: f }); await press(btn(s.root, 'Download file')); assert.match(s.text(), /Nothing to export/); assert.equal(s.anchors.length, 0);
  });
  test('the draft option is off until there is a draft', async () => {
    const s = await ready(); const radios = inputs(s.root, 'radio'); assert.equal(radios.length, 2); assert.equal(radios[0].checked, true); assert.equal(radios[1].disabled, true); assert.match(s.text(), /no draft yet/);
  });
  test('Save as preset needs a name, saves for an administrator and the preset then appears in the library', async () => {
    const s = await ready(); await press(btn(s.root, 'Save as preset')); assert.match(s.text(), /Give the preset a name first/);
    byPlaceholder(s.root, 'For example: News site').value = 'News starter'; await press(btn(s.root, 'Save as preset')); assert.match(s.text(), /Saved as a preset/);
    await s.tab('Presets'); assert.match(s.text(), /News starter/); assert.match(s.text(), /1 preset of 50/);
  });
});

describe('presets', () => {
  const seed = async (s, name = 'News starter') => { byPlaceholder(s.root, 'For example: News site').value = name; await press(btn(s.root, 'Save as preset')); await s.tab('Presets'); };
  test('an empty library says so', async () => { const s = await ready(); await s.tab('Presets'); assert.match(s.text(), /No presets yet/); assert.match(s.text(), /0 presets of 50/); });
  test('a name that looks like markup is shown as text and builds no elements', async () => {
    const s = await ready(); await seed(s, '<img src=x onerror=alert(1)>'); assert.ok(s.text().includes('<img src=x onerror=alert(1)>')); assert.ok(!all(s.root).some((x) => x.tag === 'img'));
  });
  test('rename saves a new name; Cancel leaves it alone', async () => {
    const s = await ready(); await seed(s); await press(btn(s.root, 'Rename')); await press(btn(s.root, 'Cancel')); assert.match(s.text(), /News starter/);
    await press(btn(s.root, 'Rename')); const name = all(s.root).find((x) => x.tag === 'input' && x.value === 'News starter'); name.value = 'Casino starter'; await press(btn(s.root, 'Save'));
    assert.match(s.text(), /Casino starter/); assert.ok(!s.text().includes('News starter')); assert.match(s.text(), /Preset changed/);
  });
  test('delete asks first and removes the preset', async () => {
    const s = await ready(); await seed(s); await press(btn(s.root, 'Delete')); assert.equal(s.confirms.length, 1); assert.match(s.confirms[0], /News starter/); assert.match(s.text(), /No presets yet/); assert.match(s.text(), /Preset deleted/);
  });
  test('download uses the preset’s own file name route', async () => {
    const s = await ready(); await seed(s); await press(btn(s.root, 'Download')); assert.match(s.fetched[0], /\/transfer\/presets\/\d+\/download$/); assert.equal(s.anchors.length, 1); assert.match(s.text(), /Downloaded/);
  });
  test('an editor can review and download but not rename or delete', async () => {
    const a = await ready(); await seed(a); const e = await ready({ user: editor }); await e.tab('Presets');
    assert.ok(hasBtn(e.root, 'Review and apply')); assert.ok(hasBtn(e.root, 'Download')); assert.ok(!hasBtn(e.root, 'Rename')); assert.ok(!hasBtn(e.root, 'Delete')); assert.match(e.text(), /An administrator saves presets/);
  });
  test('Review and apply opens the review for that preset', async () => {
    const s = await ready(); await seed(s); await setSetting(db, 'theme_primary', '#abcdef'); await press(btn(s.root, 'Review and apply'));
    const review = byClass(s.root, 'xfer-review')[0]; assert.equal(review.hidden, false); assert.match(review.textContent, /Review: Preset “News starter”/);
  });
  test('without the 0011 migration the tab explains what to run, and nothing breaks', async () => {
    for (const t of ['config_presets', 'config_shares']) db.prepare(`DROP TABLE ${t}`).run();
    const s = await ready(); await s.tab('Presets'); assert.match(s.text(), /migration/i); await s.tab('Share this site'); assert.match(s.text(), /migration/i); assert.ok(!hasBtn(s.root, 'Create share code'));
    await s.tab('Export'); await press(btn(s.root, 'Save as preset')); assert.match(s.text(), /Give the preset a name first|migration/i);
  });
});

describe('import a file and the review', () => {
  test('a pasted file is checked and the review shows where it came from, its integrity and every change', async () => {
    const text = await exportText(); const s = await ready(); await paste(s, text);
    const review = byClass(s.root, 'xfer-review')[0]; assert.equal(review.hidden, false); assert.match(review.textContent, /Review: Pasted file/);
    assert.match(review.textContent, /Checksum matches/); assert.match(review.textContent, /\(this site\)/); assert.match(review.textContent, /You have no draft yet/); assert.match(review.textContent, /What will change in your draft/);
    assert.match(review.textContent, /#778899/); assert.equal(btn(review, 'Add to my draft').disabled, false); assert.equal(review.children[0].focused, 1);
  });
  test('nothing is changed until Add to my draft, and then only the draft is', async () => {
    const text = await exportText(); const s = await ready(); await paste(s, text);
    assert.equal(await getDraft(ENV), null); assert.equal(await setting(db, 'theme_primary'), '#112233');
    await press(btn(s.root, 'Add to my draft')); await sleep(30);
    const d = await getDraft(ENV); assert.ok(d, 'a draft now exists'); assert.equal(await setting(db, 'theme_primary'), '#112233', 'live is untouched');
    assert.match(JSON.stringify(d), /#778899/); assert.match(s.text(), /Added to your draft/); assert.equal(s.reloads.length, 1);
  });
  test('unticking the only section leaves nothing to add and the button off', async () => {
    const text = await exportText(); const s = await ready(); await paste(s, text);
    const review = byClass(s.root, 'xfer-review')[0]; const box = inputs(review, 'checkbox').find((b) => b.attrs['aria-label'] && /Colours/.test(b.attrs['aria-label']));
    assert.ok(box && box.checked); box.checked = false; box.onchange(); await settle(); await sleep(350);
    assert.match(review.textContent, /Nothing to change/); assert.equal(btn(review, 'Add to my draft').disabled, true);
  });
  test('text that is not a configuration file shows the reason, offers no apply button and can be closed', async () => {
    const s = await ready(); await paste(s, 'this is not json'); const review = byClass(s.root, 'xfer-review')[0];
    assert.ok(byClass(review, 'xfer-msg').some((m) => has(m, 'is-bad') && m.attrs.role === undefined && m.role === 'alert')); assert.ok(!hasBtn(review, 'Add to my draft'));
    await press(btn(review, 'Close')); assert.equal(review.hidden, true); assert.equal(review.textContent, '');
  });
  test('an empty paste is refused on the page without calling the server', async () => {
    let calls = 0; const s = await ready(); const real = s.C.api; s.C.api = async (...a) => { calls++; return real(...a); };
    await s.tab('Import a file'); await press(btn(s.root, 'Check this file')); assert.match(s.text(), /Choose a file or paste its contents first/); assert.equal(calls, 0);
  });
  test('a file larger than the limit is refused on the page; a small one is read and checked', async () => {
    const s = await ready(); await s.tab('Import a file'); const input = inputs(s.root, 'file')[0];
    input.files = [{ name: 'big.json', size: 5 * 1024 * 1024, text: async () => 'x' }]; await input.onchange(); await settle(); assert.match(s.text(), /never larger than 900 KB/); assert.equal(byClass(s.root, 'xfer-review')[0].hidden, true);
    const text = await exportText(); input.files = [{ name: 'theme.json', size: text.length, text: async () => text }]; await input.onchange(); await settle();
    assert.match(s.text(), /Read theme\.json/); assert.match(byClass(s.root, 'xfer-review')[0].textContent, /Review: theme\.json/);
  });
  test('a stale revision gives the "someone else changed the draft" message and keeps the button usable', async () => {
    const text = await exportText(); const s = await ready(); await paste(s, text); await press(btn(s.root, 'Add to my draft')); await sleep(30);
    const again = await ready(); await paste(again, await exportText('settings.theme', '#445566')); await press(btn(again.root, 'Add to my draft'));
    assert.match(again.text(), /Someone else changed the draft/); assert.equal(btn(byClass(again.root, 'xfer-review')[0], 'Add to my draft').disabled, false); assert.equal(again.reloads.length, 0);
  });
  test('an editor may import into the draft', async () => {
    const text = await exportText(); const s = await ready({ user: editor }); await paste(s, text); await press(btn(s.root, 'Add to my draft')); await sleep(30); assert.ok(await getDraft(ENV), 'editors may import into the draft');
  });
});

describe('review with a canned server', () => {
  const report = (over = {}) => ({
    file: { name: 'Starter', host: 'other.example', sameSite: false, exportedAt: '2026-11-04T10:00:00.000Z', checksum: 'ok', description: 'For news sites' },
    draft: { exists: true, changes: 3 },
    sections: [{ id: 'structure', label: 'Site structure', help: 'Pages and modules.', brand: false, blocked: false, selected: true, counts: { add: 1, change: 2, same: 0, skipped: 1 } }, { id: 'settings.identity', label: 'Look and feel: Site identity', help: 'Name and logo.', brand: true, blocked: false, selected: false, counts: { add: 0, change: 0, same: 0, skipped: 0 } }],
    items: [{ level: 'warning', message: 'One module is not on this platform.' }, { level: 'error', message: 'A value was invalid.' }, { level: 'info', message: 'Media files are not copied.' }],
    impact: { risk: 'high', removed: [{ label: 'Casino reviews' }], added: [{ label: 'News' }], notes: ['The homepage changes.'], confirm: 'Search engines may lose pages.' },
    hasChanges: true, summary: '3 changes', changes: [{ area: 'Modules', label: 'Casinos', from: 'on', to: 'off' }], canApply: true, reason: '', ...over,
  });
  const canned = (planFn, applyFn) => async (m, sub, body) => {
    if (sub === '/transfer/state') { const s = await (async () => { const r = await route({ request: { method: 'GET', url: 'https://t.example/api/v1/config/transfer/state', headers: new Headers() }, env: ENV, path: '/api/v1/config/transfer/state', user: admin }); return r.json(); })(); return s; }
    if (sub === '/transfer/plan') return planFn(body); if (sub === '/transfer/apply') return applyFn ? applyFn(body) : { success: true, summary: 'ok' };
    throw new Error(`unexpected ${m} ${sub}`);
  };
  test('a high-risk import cannot be added until the person ticks the warning, and ticking again off disables it', async () => {
    const applied = []; const s = await ready({ api: canned(() => ({ success: true, report: report() }), (b) => { applied.push(b); return { success: true, summary: '3 changes' }; }) });
    await paste(s, '{}'); const review = byClass(s.root, 'xfer-review')[0]; const go = btn(review, 'Add to my draft');
    assert.equal(go.disabled, true); assert.match(review.textContent, /Careful: this removes pages/); assert.match(review.textContent, /Removed: Casino reviews/); assert.match(review.textContent, /Added: News/); assert.match(review.textContent, /Search engines may lose pages\. I understand\./);
    const ack = inputs(review, 'checkbox').find((c) => !c.attrs['aria-label']); ack.checked = true; ack.onchange(); assert.equal(go.disabled, false);
    ack.checked = false; ack.onchange(); assert.equal(go.disabled, true); ack.checked = true; ack.onchange(); await press(go);
    assert.equal(applied.length, 1); assert.deepEqual(applied[0].sections, ['structure']); assert.equal(applied[0].text, '{}');
  });
  test('notes are labelled by level, brand sections from another site are tagged, counts read plainly, and the change list is capped', async () => {
    const many = Array.from({ length: 95 }, (_, i) => ({ area: 'Menus', label: `Item ${i}`, from: 'a', to: 'b' }));
    const s = await ready({ api: canned(() => ({ success: true, report: report({ changes: many }) })) }); await paste(s, '{}'); const t = byClass(s.root, 'xfer-review')[0].textContent;
    assert.match(t, /Skipped or changed: One module is not on this platform/); assert.match(t, /Problem: A value was invalid/); assert.match(t, /Note: Media files are not copied/);
    assert.match(t, /About that business: ticked only if you want it/); assert.match(t, /1 new, 2 changed, 1 skipped/); assert.match(t, /not included/); assert.match(t, /Item 79/); assert.ok(!t.includes('Item 80')); assert.match(t, /…and 15 more/);
    assert.match(t, /Your draft already has 3 changes\. This import is added on top of it\./); assert.match(t, /From.*other\.example/);
  });
  test('a file whose content looks like markup is shown as text only', async () => {
    const evil = '<script>alert(1)</script>';
    const s = await ready({ api: canned(() => ({ success: true, report: report({ file: { ...report().file, name: evil, description: evil }, items: [{ level: 'info', message: evil }], impact: null }) })) });
    await paste(s, '{}'); assert.ok(s.text().includes(evil)); assert.ok(!all(s.root).some((x) => x.tag === 'script'));
  });
  test('a report that cannot be applied shows the reason and keeps the button off', async () => {
    const s = await ready({ api: canned(() => ({ success: true, report: report({ canApply: false, reason: 'Nothing in this file applies to your site.', impact: null }) })) }); await paste(s, '{}');
    assert.match(byClass(s.root, 'xfer-review')[0].textContent, /Nothing in this file applies to your site/); assert.equal(btn(byClass(s.root, 'xfer-review')[0], 'Add to my draft').disabled, true);
  });
  test('an answer that arrives late for an older request is ignored', async () => {
    let n = 0; const gates = [];
    const s = await ready({ api: canned((b) => new Promise((res) => { const i = n++; gates.push(() => res({ success: true, report: report({ file: { ...report().file, name: i === 0 ? 'OLD' : 'NEW' }, impact: null }) })); })) });
    await s.tab('Import a file'); const area = all(s.root).find((x) => x.tag === 'textarea'); area.value = '{}';
    await btn(s.root, 'Check this file').onclick(); await btn(s.root, 'Check this file').onclick(); await settle(); assert.equal(gates.length, 2);
    gates[1](); await settle(); gates[0](); await settle(); const t = byClass(s.root, 'xfer-review')[0].textContent; assert.match(t, /NEW/); assert.ok(!t.includes('OLD'));
  });
  test('a network failure while checking shows a message and changes nothing', async () => {
    const s = await ready({ api: canned(() => { throw new Error('offline'); }) }); await paste(s, '{}'); assert.match(byClass(s.root, 'xfer-review')[0].textContent, /Network error\. Nothing was changed\./);
  });
});

describe('copy from another site', () => {
  const answer = (out) => async () => new Response(JSON.stringify(out), { status: 200 });
  test('both fields are needed', async () => { const s = await ready(); await s.tab('Copy from another site'); await press(btn(s.root, 'Fetch and review')); assert.match(s.text(), /Enter the address and the share code/); });
  test('the code box is a password field, the code is cleared once fetched, and the file opens in the review with the other site’s name', async () => {
    const file = JSON.parse(await exportText()); const env = { ...ENV, CONFIG_FETCH: answer({ success: true, envelope: file }) };
    const s = await ready({ env }); await s.tab('Copy from another site'); const url = byPlaceholder(s.root, 'https://my-other-site'); const code = byPlaceholder(s.root, 'lcs_');
    assert.equal(code.type, 'password'); assert.equal(code.autocomplete, 'off'); url.value = 'https://other.example.org'; code.value = newToken(); await press(btn(s.root, 'Fetch and review'));
    assert.equal(code.value, ''); assert.match(byClass(s.root, 'xfer-review')[0].textContent, /Review: Configuration from other\.example\.org/);
  });
  test('a refusal from the other site keeps the code for another try and shows the message', async () => {
    const env = { ...ENV, CONFIG_FETCH: async () => new Response('{}', { status: 403 }) };
    const s = await ready({ env }); await s.tab('Copy from another site'); const code = byPlaceholder(s.root, 'lcs_'); const t = newToken(); byPlaceholder(s.root, 'https://my-other-site').value = 'https://other.example.org'; code.value = t; await press(btn(s.root, 'Fetch and review'));
    assert.match(s.text(), /did not accept the share code/); assert.equal(code.value, t); assert.equal(byClass(s.root, 'xfer-review')[0].hidden, true);
  });
  test('this site and private addresses are refused with the server’s message', async () => {
    const s = await ready(); await s.tab('Copy from another site'); const code = byPlaceholder(s.root, 'lcs_'); code.value = newToken();
    for (const u of ['https://t.example', 'https://127.0.0.1']) { byPlaceholder(s.root, 'https://my-other-site').value = u; await press(btn(s.root, 'Fetch and review')); assert.ok(byClass(s.root, 'xfer-msg').some((m) => has(m, 'is-bad') && m.textContent.length > 5), u); }
  });
});

describe('share this site', () => {
  test('the picker starts without business details and creating with nothing ticked is refused on the page', async () => {
    const s = await ready(); await s.tab('Share this site'); const boxes = inputs(byClass(s.root, 'xfer-picker')[0], 'checkbox'); const ticked = boxes.filter((b) => b.checked).length; assert.ok(ticked > 0 && ticked < boxes.length);
    await press(btn(s.root, 'Select none')); await press(btn(s.root, 'Create share code')); assert.match(s.text(), /Choose what the other site may copy/); assert.match(s.text(), /None yet/);
  });
  test('creating a code shows it once, in a read-only box, with the address and the expiry; the list shows it as active', async () => {
    const s = await ready(); await s.tab('Share this site'); byPlaceholder(s.root, 'For example: Staging').value = 'Staging site'; await press(btn(s.root, 'Create share code'));
    const secret = byClass(s.root, 'xfer-secret')[0]; assert.equal(secret.hidden, false); const box = byClass(secret, 'xfer-code')[0]; assert.match(box.value, /^lcs_/); assert.equal(box.readOnly, true);
    assert.match(secret.textContent, /not shown again/); assert.match(secret.textContent, /Address: https:\/\/t\.example/); assert.match(secret.textContent, /5 uses/);
    assert.match(s.text(), /Staging site/); assert.ok(byClass(s.root, 'xfer-status').some((c) => c.textContent === 'active' && has(c, 'is-active'))); assert.match(s.text(), /0 of 5 used/);
    await press(btn(s.root, 'I have copied it')); assert.ok(!byClass(s.root, 'xfer-code').length, 'the code is gone from the page');
    assert.ok(!s.text().includes(box.value));
  });
  test('Copy uses the clipboard when there is one and selects the text when there is not', async () => {
    const s = await ready(); await s.tab('Share this site'); await press(btn(s.root, 'Create share code')); const box = byClass(s.root, 'xfer-code')[0];
    await press(btn(s.root, 'Copy')); assert.equal(box.selected, true);
  });
  test('Revoke asks first, the code then shows as revoked and cannot be revoked again from the page', async () => {
    const s = await ready(); await s.tab('Share this site'); await press(btn(s.root, 'Create share code')); await press(btn(s.root, 'Revoke'));
    assert.equal(s.confirms.length, 1); assert.match(s.confirms[0], /Revoke this share code/); assert.ok(byClass(s.root, 'xfer-status').some((c) => c.textContent === 'revoked' && has(c, 'is-revoked'))); assert.ok(!hasBtn(s.root, 'Revoke')); assert.match(s.text(), /Revoked/);
  });
  test('the valid-for choices come from the server', async () => {
    const s = await ready(); await s.tab('Share this site'); const sel = all(s.root).find((x) => x.tag === 'select'); assert.deepEqual(sel.kids.map((o) => o.textContent), ['1 hour', '24 hours', '7 days']);
  });
  test('the share limit is explained by the server’s message', async () => {
    const s = await ready(); await s.tab('Share this site'); for (let i = 0; i < 10; i++) { await press(btn(s.root, 'Create share code')); if (hasBtn(s.root, 'I have copied it')) await press(btn(s.root, 'I have copied it')); }
    await press(btn(s.root, 'Create share code')); assert.ok(byClass(s.root, 'xfer-msg').some((m) => has(m, 'is-bad')), 'the eleventh is refused');
  });
});
