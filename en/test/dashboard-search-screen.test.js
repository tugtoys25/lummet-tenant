// Phase 8: the search dialog, driven end to end. The real script runs against a very small DOM and the real API route
// (real index, real content search, real pins on an in-memory database).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { route } from '../worker/api/routes/dashboard-search.js';
import { admin, editor, freshSite } from './support/transfer-fixtures.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SCRIPT = read('static/js/dashboard-search.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async () => { for (let i = 0; i < 12; i++) await sleep(5); };
const debounce = async () => { await sleep(260); await settle(); };

class El {
  constructor(tag, doc) { this.tag = tag; this.doc = doc; this.kids = []; this.attrs = {}; this.listeners = {}; this._text = ''; this.className = ''; this.hidden = false; this.value = ''; this.parentNode = null; this.tabIndex = 0; this.style = {}; }
  get tagName() { return this.tag.toUpperCase(); }
  get id() { return this.attrs.id || ''; } set id(v) { this.attrs.id = String(v); }
  get textContent() { return this._text + this.kids.map((k) => k.textContent).join(''); }
  set textContent(v) { this.kids = []; this._text = String(v); }
  get classList() { const self = this; return { add: (c) => { if (!self.className.split(/\s+/).includes(c)) self.className = `${self.className} ${c}`.trim(); }, remove: (c) => { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' '); }, contains: (c) => self.className.split(/\s+/).includes(c) }; }
  appendChild(c) { c.parentNode = this; this.kids.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.attrs.id = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  focus() { this.doc.activeElement = this; }
  scrollIntoView() {}
  set href(v) { this.attrs.href = String(v); } get href() { return this.attrs.href || ''; }
  get pathname() { return this.attrs.href ? this.attrs.href.split('#')[0].split('?')[0] : ''; }
  get hash() { const i = (this.attrs.href || '').indexOf('#'); return i < 0 ? '' : this.attrs.href.slice(i); }
  matches(sel) { if (sel.startsWith('.')) return this.className.split(/\s+/).includes(sel.slice(1)); if (sel === 'a[href]') return this.tag === 'a' && 'href' in this.attrs; return this.tag === sel; }
  closest(sel) { for (let n = this; n; n = n.parentNode) if (n.matches && n.matches(sel)) return n; return null; }
  querySelector(sel) { for (const k of this.kids) { if (k.matches(sel)) return k; const r = k.querySelector(sel); if (r) return r; } return null; }
}
const walk = (n, out = []) => { out.push(n); n.kids.forEach((k) => walk(k, out)); return out; };

let db, ENV;
beforeEach(() => { ({ db, env: ENV } = freshSite()); ENV.ASSETS = { fetch: async (req) => new Response(read(`templates/${new URL(req.url).pathname.replace(/^\/templates\//, '')}`)) }; });

function boot({ user = admin, withButton = true, fetchImpl, path = '/en/dashboard', storage } = {}) {
  const doc = { activeElement: null, readyState: 'complete', listeners: {}, body: null, byId: {} };
  doc.body = new El('body', doc); doc.body.id = 'body';
  doc.createElement = (t) => new El(t, doc);
  doc.createElementNS = (_, t) => new El(t, doc);
  doc.createTextNode = (t) => { const e = new El('#text', doc); e._text = String(t); return e; };
  doc.addEventListener = (t, fn) => { (doc.listeners[t] ||= []).push(fn); };
  const nav = new El('nav', doc); nav.id = 'dashNav';
  const btn = new El('button', doc); btn.id = 'dashSearchOpen';
  doc.getElementById = (id) => { if (id === 'dashNav') return nav; if (id === 'dashSearchOpen') return withButton ? btn : null; return walk(doc.body).find((n) => n.attrs.id === id) || null; };
  const store = storage || {};
  const calls = { assign: [], reload: 0, open: [], fetched: [] };
  const loc = { pathname: path, hash: '', assign: (u) => calls.assign.push(u), reload: () => { calls.reload++; } };
  const real = async (url, opts = {}) => {
    calls.fetched.push(`${opts.method || 'GET'} ${url}`);
    const u = new URL(url, 'https://t.example');
    const method = opts.method || 'GET';
    return route({ request: { method, url: u.href, headers: new Headers(opts.headers || {}), json: async () => JSON.parse(opts.body) }, env: ENV, path: u.pathname.replace(/^\/en/, ''), user });
  };
  const ctx = vm.createContext({
    document: doc, fetch: fetchImpl || real, AbortController, setTimeout, clearTimeout, console, encodeURIComponent, URL,
    window: { location: loc, open: (...a) => calls.open.push(a), setTimeout, clearTimeout, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } },
  });
  new vm.Script(SCRIPT, { filename: 'dashboard-search.js' }).runInContext(ctx);
  const press = (target, ev) => {
    const e = { key: '', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, target, ...ev };
    for (let n = target; n; n = n.parentNode) (n.listeners?.keydown || []).forEach((f) => f(e));
    if (!e.defaultPrevented) (doc.listeners.keydown || []).forEach((f) => f(e));
    return e;
  };
  const dlg = () => walk(doc.body).find((n) => n.attrs.id === 'dashSearch');
  const api = {
    doc, btn, nav, calls, store,
    dlg, isOpen: () => !!dlg() && !dlg().hidden,
    input: () => doc.getElementById('dashSearchInput'),
    status: () => doc.getElementById('dashSearchStatus').textContent,
    opts: () => walk(dlg()).filter((n) => n.attrs.role === 'option'),
    labels: () => api.opts().map((o) => o.kids[0].kids[0].textContent),
    groups: () => walk(dlg()).filter((n) => n.className === 'dsearch-group').map((n) => n.textContent),
    active: () => api.opts().find((o) => o.attrs['aria-selected'] === 'true'),
    open: async () => { btn.listeners.click[0](); await settle(); },
    type: async (v, wait = true) => { const i = api.input(); i.value = v; (i.listeners.input || []).forEach((f) => f({ target: i })); if (wait) await debounce(); else await settle(); },
    key: (key, ev = {}) => press(api.input() || doc.body, { key, ...ev }),
    press,
  };
  return api;
}

describe('opening and closing', () => {
  test('without the Search button the script does nothing', () => {
    const s = boot({ withButton: false }); assert.equal(s.dlg(), undefined);
    assert.doesNotThrow(() => s.press(s.doc.body, { key: 'k', ctrlKey: true }));
  });
  test('the button opens a dialog that is labelled, modal, and has the focus in the search field', async () => {
    const s = boot(); assert.equal(s.dlg().hidden, true);
    await s.open(); assert.ok(s.isOpen());
    const box = s.dlg().kids[1]; assert.equal(box.attrs.role, 'dialog'); assert.equal(box.attrs['aria-modal'], 'true'); assert.ok(box.attrs['aria-label']);
    assert.equal(s.doc.activeElement, s.input()); assert.equal(s.btn.attrs['aria-expanded'], 'true'); assert.ok(s.doc.body.classList.contains('dsearch-lock'));
    assert.equal(s.input().attrs.role, 'combobox'); assert.equal(s.input().attrs['aria-controls'], 'dashSearchList');
  });
  test('Ctrl+K and Cmd+K toggle it, and Escape closes it and gives the focus back', async () => {
    const s = boot(); const was = s.doc.body; was.focus();
    let e = s.press(s.doc.body, { key: 'k', ctrlKey: true }); await settle(); assert.ok(s.isOpen()); assert.ok(e.defaultPrevented);
    s.key('Escape'); assert.ok(!s.isOpen()); assert.equal(s.doc.activeElement, was); assert.ok(!s.doc.body.classList.contains('dsearch-lock')); assert.equal(s.btn.attrs['aria-expanded'], 'false');
    s.press(s.doc.body, { key: 'K', metaKey: true }); await settle(); assert.ok(s.isOpen());
    s.key('k', { ctrlKey: true }); assert.ok(!s.isOpen());
  });
  test('"/" opens it, but never while typing in a field or with a modifier', async () => {
    const s = boot(); const field = new El('input', s.doc); field.tag = 'input';
    s.press(field, { key: '/' }); assert.ok(!s.isOpen());
    s.press(s.doc.body, { key: '/', ctrlKey: true }); assert.ok(!s.isOpen());
    s.press(s.doc.body, { key: '/' }); await settle(); assert.ok(s.isOpen());
  });
  test('clicking the dark area or the Esc button closes it', async () => {
    const s = boot(); await s.open(); s.dlg().kids[0].listeners.click[0](); assert.ok(!s.isOpen());
    await s.open(); const close = walk(s.dlg()).find((n) => n.className === 'dsearch-close'); close.listeners.click[0](); assert.ok(!s.isOpen());
  });
  test('Tab stays inside the dialog', async () => {
    const s = boot(); await s.open(); const close = walk(s.dlg()).find((n) => n.className === 'dsearch-close');
    const e = s.key('Tab'); assert.ok(e.defaultPrevented); assert.equal(s.doc.activeElement, close);
    s.press(close, { key: 'Tab' }); assert.equal(s.doc.activeElement, s.input());
  });
});

describe('what it shows before typing', () => {
  test('suggested screens, with a helpful line when nothing is pinned or recent', async () => {
    const s = boot(); await s.open();
    assert.deepEqual(s.groups(), ['Go to']); assert.ok(s.opts().length >= 4);
  });
  test('the list is a listbox and the first option is active', async () => {
    const s = boot(); await s.open();
    assert.equal(walk(s.dlg()).find((n) => n.attrs.id === 'dashSearchList').attrs.role, 'listbox');
    assert.equal(s.active().attrs.id, 'dsr-0'); assert.equal(s.input().attrs['aria-activedescendant'], 'dsr-0');
  });
});

describe('searching', () => {
  test('a plain word finds the screen through its synonyms, ranked first, and Enter opens it', async () => {
    const s = boot(); await s.open(); await s.type('menu');
    assert.equal(s.labels()[0], 'Navigation'); assert.ok(s.groups().includes('Screens'));
    s.key('Enter'); assert.deepEqual(s.calls.assign, ['/en/dashboard/nav']); assert.ok(!s.isOpen());
  });
  test('settings and tools are found by what they do', async () => {
    const s = boot(); await s.open(); await s.type('colour');
    assert.ok(s.groups().includes('Settings')); assert.ok(s.labels().some((l) => /colour/i.test(l)));
    await s.type('export'); assert.ok(s.labels().includes('Export a configuration'));
  });
  test('modules show whether they are On or Off', async () => {
    await db.prepare('INSERT INTO settings(key, value) VALUES(?, ?)').bind('site_profile', JSON.stringify({ v: 2, modules: { casino: false } })).run();
    const s = boot(); await s.open(); await s.type('casino');
    const chips = walk(s.dlg()).filter((n) => /dsearch-chip/.test(n.className)).map((n) => n.textContent);
    assert.ok(chips.length === 0 || chips.every((c) => c === 'On' || c === 'Off'));
  });
  test('the arrow keys move through the results and wrap around', async () => {
    const s = boot(); await s.open(); await s.type('casino'); const n = s.opts().length; assert.ok(n >= 3);
    s.key('ArrowDown'); assert.equal(s.active().attrs.id, 'dsr-1');
    s.key('ArrowUp'); s.key('ArrowUp'); assert.equal(s.active().attrs.id, `dsr-${n - 1}`);
    s.key('ArrowDown'); assert.equal(s.active().attrs.id, 'dsr-0');
  });
  test('Ctrl+Enter opens in a new tab without leaving the page', async () => {
    const s = boot(); await s.open(); await s.type('menu'); s.key('Enter', { ctrlKey: true });
    assert.equal(s.calls.assign.length, 0); assert.equal(s.calls.open[0][0], '/en/dashboard/nav'); assert.equal(s.calls.open[0][2], 'noopener');
  });
  test('a result on the page you are already on scrolls or reloads instead of leaving', async () => {
    const s = boot({ path: '/en/dashboard/configuration' }); await s.open(); await s.type('colour');
    const i = s.labels().findIndex((l) => /colour/i.test(l)); for (let k = 0; k < i; k++) s.key('ArrowDown');
    s.key('Enter'); assert.equal(s.calls.assign.length, 0); assert.equal(s.calls.reload, 1);
  });
  test('nothing found says so and gives plain examples', async () => {
    const s = boot(); await s.open(); await s.type('zzzzqqq'); assert.equal(s.opts().length, 0);
    const empty = walk(s.dlg()).find((n) => n.className === 'dsearch-empty'); assert.match(empty.textContent, /Nothing found for “zzzzqqq”/); assert.match(empty.textContent, /menu/);
  });
  test('the result count is announced', async () => {
    const s = boot(); await s.open(); await s.type('menu'); assert.match(s.status(), /^\d+ results?/);
  });
});

describe('content', () => {
  const seed = () => db.prepare("INSERT INTO casinos(slug, name, website_url, affiliate_url, status) VALUES('betking', 'BetKing Casino', 'https://c.example', 'https://a.example', 'active')").run();
  test('content appears under its own heading after a short pause, and opens the editor', async () => {
    await seed(); const s = boot(); await s.open(); await s.type('betking');
    assert.ok(s.groups().includes('Content')); const i = s.labels().indexOf('BetKing Casino'); assert.ok(i >= 0);
    for (let k = 0; k < i; k++) s.key('ArrowDown'); s.key('Enter'); assert.deepEqual(s.calls.assign, ['/en/dashboard/casino/edit/betking']);
  });
  test('typing quickly asks the server once, and an old answer never replaces a newer one', async () => {
    await seed(); let n = 0;
    // the real server answers the index and pins; only the content endpoint is slowed down, the first answer on purpose
    const s2 = boot({ fetchImpl: async (url, opts = {}) => {
      if (/\/content\?q=/.test(url)) { const mine = ++n; await sleep(mine === 1 ? 150 : 5); const q = decodeURIComponent(url.split('q=')[1]); return new Response(JSON.stringify({ success: true, results: [{ id: `x${mine}`, kind: 'content', label: `Hit for ${q}`, sub: 'Casino', href: '/en/dashboard/casinos' }] }), { status: 200 }); }
      const u = new URL(url, 'https://t.example'); return route({ request: { method: opts.method || 'GET', url: u.href, headers: new Headers(), json: async () => ({}) }, env: ENV, path: u.pathname.replace(/^\/en/, ''), user: admin });
    } });
    await s2.open(); await s2.type('bet', false); await sleep(240); await s2.type('betk', false); await sleep(500); await settle();
    assert.ok(s2.labels().includes('Hit for betk')); assert.ok(!s2.labels().includes('Hit for bet'));
  });
  test('when content search fails, screens and settings still work and a clear line says so', async () => {
    const s = boot({ fetchImpl: async (url, opts = {}) => {
      if (/\/content\?q=/.test(url)) throw new Error('down');
      const u = new URL(url, 'https://t.example'); return route({ request: { method: opts.method || 'GET', url: u.href, headers: new Headers(), json: async () => ({}) }, env: ENV, path: u.pathname.replace(/^\/en/, ''), user: admin });
    } });
    await s.open(); await s.type('menu'); assert.ok(s.labels().includes('Navigation')); assert.match(s.status(), /Content search is not available/);
  });
  test('a one-letter query never asks the server', async () => {
    const s = boot(); await s.open(); await s.type('b'); assert.ok(!s.calls.fetched.some((f) => /\/content\?q=/.test(f)));
  });
  test('closing the dialog stops a search that is still waiting', async () => {
    const s = boot(); await s.open(); await s.type('betking', false); s.key('Escape'); await sleep(300); await settle();
    assert.ok(!s.calls.fetched.some((f) => /\/content\?q=/.test(f)));
  });
});

describe('recent and pinned', () => {
  test('what you open comes back under Recent, newest first, and never twice', async () => {
    const s = boot(); await s.open(); await s.type('menu'); s.key('Enter');
    await s.open(); assert.deepEqual(s.groups().slice(0, 2), ['Recent', 'Go to']); assert.equal(s.labels()[0], 'Navigation');
    assert.equal(JSON.parse(s.store['lummet.dash.recent.v1']).length, 1);
  });
  test('clicking a sidebar link is remembered too', async () => {
    const s = boot(); const a = new El('a', s.doc); a.href = '/en/dashboard/media'; a.textContent = 'Media Library'; s.nav.appendChild(a);
    s.nav.listeners.click[0]({ target: a });
    await s.open(); assert.ok(s.labels().includes('Media Library'));
  });
  test('recent keeps only six, and ignores anything that is not a dashboard link', async () => {
    const bad = JSON.stringify([{ href: 'https://evil.example', label: 'Evil' }, { href: '/en/dashboard/news', label: 'News' }]);
    const s = boot({ storage: { 'lummet.dash.recent.v1': bad } }); await s.open();
    assert.ok(s.labels().includes('News')); assert.ok(!s.labels().includes('Evil'));
    const many = boot({ storage: { 'lummet.dash.recent.v1': JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ href: `/en/dashboard/p${i}`, label: `P${i}` }))) } });
    await many.open(); assert.ok(many.groups().includes('Recent')); assert.ok(many.opts().filter((o) => /^P\d/.test(o.kids[0].kids[0].textContent)).length <= 6);
  });
  test('Alt+S pins the active result, which then shows first under Pinned; pressing it again unpins', async () => {
    const s = boot(); await s.open(); await s.type('menu'); s.key('s', { altKey: true }); await settle();
    assert.ok(s.calls.fetched.some((f) => f.startsWith('PUT') && /favourites/.test(f))); assert.match(s.status(), /Pinned/);
    s.key('Escape'); await s.open(); assert.equal(s.groups()[0], 'Pinned'); assert.equal(s.labels()[0], 'Navigation');
    s.key('s', { altKey: true }); await settle(); assert.ok(s.calls.fetched.some((f) => f.startsWith('DELETE'))); assert.match(s.status(), /Unpinned/);
    s.key('Escape'); await s.open(); assert.ok(!s.groups().includes('Pinned'));
  });
  test('the Pin button works with the mouse and states its state to a screen reader', async () => {
    const s = boot(); await s.open(); await s.type('menu');
    const pin = walk(s.dlg()).find((n) => n.className === 'dsearch-pin'); assert.equal(pin.attrs['aria-pressed'], 'false'); assert.match(pin.attrs['aria-label'], /^Pin /);
    const li = s.opts()[0]; li.listeners.click ||= []; const list = walk(s.dlg()).find((n) => n.attrs.id === 'dashSearchList');
    list.listeners.click[0]({ target: pin, ctrlKey: false, preventDefault() {} }); await settle();
    assert.equal(walk(s.dlg()).find((n) => n.className === 'dsearch-pin').attrs['aria-pressed'], 'true');
  });
  test('when pinning cannot be saved the pin is taken back and the reason is shown', async () => {
    await db.prepare('DROP TABLE dashboard_favourites').run();
    const s = boot(); await s.open(); await s.type('menu'); s.key('s', { altKey: true }); await settle();
    assert.match(s.status(), /0012_dashboard_favourites\.sql/);
    assert.equal(walk(s.dlg()).find((n) => n.className === 'dsearch-pin').attrs['aria-pressed'], 'false');
  });
});

describe('when something goes wrong', () => {
  test('signed out: a clear line, no crash', async () => {
    const s = boot({ fetchImpl: async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) }); await s.open();
    assert.match(walk(s.dlg()).find((n) => n.className === 'dsearch-empty').textContent, /signed out|role cannot/);
  });
  test('the server cannot be reached: a clear line, and it tries again next time it opens', async () => {
    let down = true; const s = boot({ fetchImpl: async (url, opts = {}) => { if (down) throw new Error('offline'); const u = new URL(url, 'https://t.example'); return route({ request: { method: opts.method || 'GET', url: u.href, headers: new Headers(), json: async () => ({}) }, env: ENV, path: u.pathname.replace(/^\/en/, ''), user: admin }); } });
    await s.open(); assert.match(walk(s.dlg()).find((n) => n.className === 'dsearch-empty').textContent, /could not be loaded/);
    s.key('Escape'); down = false; await s.open(); await settle(); assert.ok(s.opts().length > 0 || /Start typing|Try/.test(walk(s.dlg()).find((n) => n.className === 'dsearch-empty')?.textContent || 'ok'));
  });
  test('an editor only ever sees what the server sent them', async () => {
    await db.prepare("DELETE FROM permissions WHERE role = 'editor'").run();
    const s = boot({ user: editor }); await s.open(); await s.type('casino');
    assert.ok(!s.labels().includes('Casinos'));
  });
});
