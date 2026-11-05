// A very small DOM for the Configuration screen scripts (not a browser). It is built from the real template, so an id that
// the script uses but the template does not have fails the test. It tracks document.activeElement, so focus behaviour can be asserted.
import vm from 'node:vm';

const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);

export class El {
  constructor(tag, doc) {
    this.tag = tag; this.doc = doc; this.kids = []; this._text = ''; this.parentNode = null; this.hidden = false; this.attrs = {};
    this.style = {}; this.className = ''; this.onclick = null; this.onchange = null; this.onkeydown = null; this.disabled = false; this.checked = false;
    this.focusCount = 0; this.connected = false;
  }
  // keep assertion failure output small: a failing assert.equal on two nodes must not try to print the whole document graph
  [Symbol.for('nodejs.util.inspect.custom')]() { return `<${this.tag}${this.id ? '#' + this.id : ''}${this.fkey ? ' fkey=' + this.fkey : ''}>`; }
  get isConnected() { return this.connected; }
  get children() { return this.kids; }
  get options() { return this.kids.filter((k) => k.tag === 'option'); }
  set textContent(v) { this.kids.forEach((k) => { k.parentNode = null; k.setConnected(false); }); this.kids = []; this._text = String(v); }
  get textContent() { return this._text + this.kids.map((k) => k.textContent).join(''); }
  setConnected(v) { this.connected = v; this.kids.forEach((k) => k.setConnected(v)); }
  appendChild(c) { c.parentNode = this; this.kids.push(c); c.setConnected(this.connected); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  focus() { this.focusCount++; this.doc.activeElement = this; }
  scrollIntoView() {}
  matches(sel) { return sel.startsWith('#') && this.id === sel.slice(1); }
}

// Parses ids, tags and attributes out of an HTML template (good enough for this one template; not a general parser).
export function parseTemplate(html) {
  const out = [];
  const re = /<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s>=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = {};
    const are = /([^\s>=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g; let a;
    while ((a = are.exec(m[2]))) attrs[a[1]] = a[2] ?? a[3] ?? a[4] ?? '';
    out.push({ tag: m[1].toLowerCase(), attrs, index: m.index, end: re.lastIndex });
  }
  return out;
}

export function makeDom(html) {
  const doc = { activeElement: null, byId: {}, listeners: {} };
  const body = new El('body', doc); body.setConnected(true); doc.body = body; doc.activeElement = body;
  for (const t of parseTemplate(html)) {
    if (!t.attrs.id) continue;
    const e = new El(t.tag, doc); for (const [k, v] of Object.entries(t.attrs)) { if (k === 'hidden') e.hidden = true; else e.attrs[k] = v; }
    e.id = t.attrs.id; if (t.tag === 'input' && t.attrs.type === 'checkbox') e.checked = false;
    body.appendChild(e); doc.byId[e.id] = e;
  }
  const document = {
    getElementById: (id) => doc.byId[id] || null,
    createElement: (t) => new El(t, doc),
    createTextNode: (t) => { const e = new El('#text', doc); e._text = String(t); return e; },
    querySelector: () => null,
    get activeElement() { return doc.activeElement; },
    body,
  };
  return { doc, document, body };
}

export function runScript(source, filename, globals) {
  const ctx = vm.createContext(globals);
  new vm.Script(source, { filename }).runInContext(ctx);
  return ctx;
}
export const settle = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); };
export const walk = (n, out = []) => { out.push(n); n.kids.forEach((k) => walk(k, out)); return out; };
