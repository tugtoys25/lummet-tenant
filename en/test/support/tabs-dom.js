// A small nested DOM for the Configuration tabs scripts (not a browser). Built from the real template WITH nesting, so tests can
// ask which panel an element sits in. Adds querySelector(All), closest, contains and removeChild to the flat fake DOM's El.
import vm from 'node:vm';
import { El } from './fake-dom.js';

const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
const TOKEN = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s>=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|([^<]+)/g;

export class TEl extends El {
  constructor(tag, doc) { super(tag, doc); this.tabIndex = undefined; }
  setAttribute(k, v) { super.setAttribute(k, v); if (k === 'hidden') this.hidden = true; }
  all() { const out = []; const go = (n) => n.kids.forEach((k) => { out.push(k); go(k); }); go(this); return out; }
  is(sel) {
    const m = /^([a-z0-9]*)((?:\.[\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/.exec(sel); if (!m) throw new Error(`selector not supported: ${sel}`);
    if (m[1] && m[1] !== this.tag) return false;
    for (const part of m[2].match(/\.[\w-]+|\[[\w-]+(?:="[^"]*")?\]/g) || []) {
      if (part[0] === '.') { if (!String(this.className).split(/\s+/).includes(part.slice(1))) return false; continue; }
      const [, name, val] = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(part);
      if (!this.hasAttribute(name) || (val !== undefined && this.getAttribute(name) !== val)) return false;
    }
    return true;
  }
  querySelectorAll(sel) { return this.all().filter((n) => n.tag !== '#text' && n.is(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { for (let n = this; n; n = n.parentNode) if (n.tag !== '#text' && n.tag !== 'body' && n.is(sel)) return n; return null; }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  removeChild(c) { this.kids = this.kids.filter((k) => k !== c); c.parentNode = null; return c; }
  addEventListener(type, fn) { (this.listeners ||= {})[type] = (this.listeners[type] || []).concat(fn); }
  get children() { return this.kids.filter((k) => k.tag !== '#text'); }
}

export function buildTree(html) {
  const doc = { activeElement: null, byId: {}, listeners: {} };
  const body = new TEl('body', doc); body.setConnected(true); doc.body = body; doc.activeElement = body;
  const stack = [body]; let m;
  const src = html.replace(/<script[\s\S]*?<\/script>/g, '');
  while ((m = TOKEN.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) { if (m[4].trim()) { const t = new TEl('#text', doc); t._text = m[4]; top.appendChild(t); } continue; }
    if (m[1]) { const i = stack.map((n) => n.tag).lastIndexOf(m[1].toLowerCase()); if (i > 0) stack.length = i; continue; }
    if (!m[2]) continue;
    const e = new TEl(m[2].toLowerCase(), doc); const are = /([^\s>=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g; let a;
    while ((a = are.exec(m[3]))) { const v = a[2] ?? a[3] ?? a[4] ?? ''; if (a[1] === 'hidden') e.hidden = true; else if (a[1] === 'class') e.className = v; else e.attrs[a[1]] = v; }
    if (e.attrs.id) { e.id = e.attrs.id; doc.byId[e.id] ??= e; (doc.allIds ??= []).push(e.id); }
    top.appendChild(e); if (!VOID.has(e.tag) && !/\/\s*>$/.test(m[0])) stack.push(e);
  }
  return { doc, body };
}

// Runs configuration-tabs.js (and optionally more scripts) against the real template. `fire` delivers a DOM event to what the
// scripts registered; `loc` is the fake address bar (pushState writes the hash, like a browser).
export function makeTabsPage(html, { hash = '', scripts = [], extra = {} } = {}) {
  const { doc, body } = buildTree(html);
  const listeners = { window: {}, document: {} };
  const loc = { hash, pathname: '/en/dashboard/configuration', reload() {} };
  const add = (bag) => (type, fn) => { (bag[type] ||= []).push(fn); };
  const document = { getElementById: (id) => doc.byId[id] || null, createElement: (t) => new TEl(t, doc), createTextNode: (t) => { const e = new TEl('#text', doc); e._text = String(t); return e; }, addEventListener: add(listeners.document), body, get activeElement() { return doc.activeElement; } };
  const store = {};
  const window = { addEventListener: add(listeners.window), history: { pushState: (_s, _t, h) => { loc.hash = h; } }, sessionStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } }, ...extra };
  const ctx = vm.createContext({ document, window, location: loc, history: window.history, setTimeout, clearTimeout, Promise, console, JSON, Object, Array, String, Number });
  window.window = window;
  for (const [src, name] of scripts) new vm.Script(src, { filename: name }).runInContext(ctx);
  const fire = (where, type, ev = {}) => (listeners[where][type] || []).forEach((fn) => fn({ preventDefault() { ev.prevented = true; }, ...ev }));
  const press = (btn, key) => { const e = { key, target: btn, preventDefault() { e.prevented = true; } }; doc.byId.cfgTabs.onkeydown(e); return e; };
  const tabbable = () => Object.values(doc.byId).filter((e) => (e.tabIndex !== undefined ? e.tabIndex : Number(e.attrs.tabindex)) === 0).map((e) => e.id);
  const visible = () => Object.values(doc.byId).filter((e) => e.attrs.role === 'tabpanel' && !e.hidden).map((e) => e.id);
  return { doc, document, window, loc, ctx, fire, press, tabbable, visible, $: (id) => doc.byId[id], listeners };
}
