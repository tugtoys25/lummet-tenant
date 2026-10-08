// test/newsroom-admin-ui-e2e.test.js
// Runs the REAL static/js/newsroom-admin.js inside a vm against a small fake
// DOM, with fetch() routed into the REAL handleNewsroomApi + migrated SQLite.
// This exercises the UI <-> API contract end to end (rendering, clicking,
// saving, DB effects). Limits: the fake DOM implements only what the script
// uses; it is not a browser, so CSS/layout/accessibility rendering and
// browser-specific behaviour still need manual QA.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { handleNewsroomApi } from '../worker/newsroom-api.js';

// ── minimal fake DOM ─────────────────────────────────────────
class Txt { constructor(t) { this.nodeType = 3; this.text = String(t); } get textContent() { return this.text; } }
class El {
  constructor(tag) { this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.listeners = {}; this.style = {}; this.dataset = {}; this.parent = null; this.checked = false; this._value = undefined; this.className = ''; this.classList = { toggle: () => {} }; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  append(...n) { for (let x of n) { if (typeof x !== 'object' || x === null) x = new Txt(String(x)); /* real DOM append() stringifies null/undefined/booleans too */ x.parent = this; this.children.push(x); } }
  replaceChildren(...n) { this.children = []; this.append(...n); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  get options() { return this.children.filter((c) => c.tagName === 'OPTION'); }
  get selectedOptions() { return this.options.filter((o) => 'selected' in o.attrs); }
  set value(v) { this._value = v; }
  get value() {
    if (this._value !== undefined) return this._value;
    if (this.tagName === 'SELECT') { const o = this.selectedOptions[0] || this.options[0]; return o ? o.value : ''; }
    if (this.tagName === 'TEXTAREA') return this.textContent;
    return '';
  }
  set textContent(t) { this.children = []; this.append(new Txt(t)); }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  querySelector(sel) { return all(this, (e) => e.tagName === sel.toUpperCase())[0] || null; }
}
const all = (root, pred, out = []) => { for (const c of root.children || []) { if (c.nodeType === 1) { if (pred(c)) out.push(c); all(c, pred, out); } } return out; };
const click = async (el) => { for (const fn of el.listeners.click || []) await fn({}); await settle(); };
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r)); };
const btn = (root, text) => all(root, (e) => e.tagName === 'BUTTON' && e.textContent === text)[0];
const ALLTEXT = (root) => root.textContent;

const ADMIN = { user_id: 1, role: 'admin' };

async function boot(user = ADMIN, { workflow = false } = {}) {
  const db = createTestDb(); applyMigrations(db);
  if (workflow) await db.prepare(`UPDATE system_settings SET value='true' WHERE key='news_editorial_workflow'`).run();
  await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO authors (id, slug, name) VALUES (1,'elie','Elie')`).run();
  await db.prepare(`INSERT OR IGNORE INTO countries (code, name) VALUES ('GB','United Kingdom')`).run();
  await db.prepare(`INSERT INTO news (id, slug, title, content, published, author_id, created_by) VALUES (11,'draft-one','Draft <script>alert(1)</script> One','<p>y</p>',0,1,1)`).run();
  await db.prepare(`INSERT INTO news (id, slug, title, content, published, author_id, created_by) VALUES (10,'live-one','Live One','<p>x</p>',1,1,1)`).run();

  const panel = new El('div'), alert = new El('div');
  const tabs = ['queues', 'article', 'taxonomy', 'policies', 'authors', 'analytics', 'search', 'homepage', 'flags'].map((t) => { const b = new El('button'); b.setAttribute('data-nr-tab', t); return b; });
  let ready; const listeners = {};
  const document = {
    getElementById: (id) => ({ nrPanel: panel, nrAlert: alert }[id] || null),
    querySelectorAll: (sel) => (sel === '[data-nr-tab]' ? tabs : []),
    createElement: (t) => new El(t), createTextNode: (t) => new Txt(t),
    addEventListener: (t, fn) => { listeners[t] = fn; }
  };
  const fetch = async (url, init = {}) => {
    const path = String(url).replace(/^\/en/, '');
    const req = new Request(`https://site.test${path}`, { method: init.method || 'GET', headers: init.headers, body: init.body });
    const res = await handleNewsroomApi(req, { DB: db }, user);
    return { ok: res.status < 400, status: res.status, json: () => res.json() };
  };
  const ctx = vm.createContext({ document, fetch, console, setTimeout: () => 0, Date, JSON, Array, Object, String, Number, Promise, URLSearchParams });
  vm.runInContext(readFileSync(new URL('../static/js/newsroom-admin.js', import.meta.url), 'utf-8'), ctx);
  await listeners.DOMContentLoaded(); await settle();
  return { db, panel, alert, tabs, ctx };
}

describe('newsroom admin page, end to end', () => {
  let t; beforeEach(async () => { t = await boot(); });

  test('boots on the Queues tab and lists draft articles from the real API', async () => {
    assert.match(ALLTEXT(t.panel), /Drafts/);
    assert.match(ALLTEXT(t.panel), /draft-one/);
    assert.match(ALLTEXT(t.panel), /Draft \(legacy\)/);
  });

  test('article titles containing markup are rendered as text, never as elements (XSS)', async () => {
    assert.match(ALLTEXT(t.panel), /<script>alert\(1\)<\/script>/);          // visible as literal text
    assert.equal(all(t.panel, (e) => e.tagName === 'SCRIPT').length, 0);   // no script element created
  });

  test('Open loads the article panel with classification, sources, corrections, revisions', async () => {
    await click(btn(t.panel, 'Open'));
    const txt = ALLTEXT(t.panel);
    for (const s of ['Classification & relations', 'Sources', 'Corrections & updates (public)', 'Revision history', 'draft-one']) assert.ok(txt.includes(s), `missing: ${s}`);
    assert.match(txt, /workflow: legacy \(simple publishing\)/);
    assert.ok(txt.includes('Editorial workflow is disabled'), 'flag off -> explanatory note, no workflow controls');
  });

  test('saving classification through the UI writes to the DB and records a revision', async () => {
    await click(btn(t.panel, 'Open'));
    const typeSel = all(t.panel, (e) => e.tagName === 'SELECT').find((s) => s.options.some((o) => o.value === 'analysis'));
    typeSel.value = 'analysis';
    const analysis = all(t.panel, (e) => e.tagName === 'INPUT' && e.attrs.type === 'checkbox' && e._value === 'analysis')[0];
    analysis.checked = true;
    const country = all(t.panel, (e) => e.tagName === 'INPUT' && e.attrs.placeholder === 'GB')[0]; country.value = 'gb';
    await click(btn(t.panel, 'Save classification'));
    const row = await t.db.prepare(`SELECT article_type, labels, primary_country FROM news WHERE id = 11`).first();
    assert.equal(row.article_type, 'analysis');
    assert.equal(row.labels, '["analysis"]');
    assert.equal(row.primary_country, 'GB');
    assert.equal((await t.db.prepare(`SELECT COUNT(*) c FROM news_article_countries WHERE news_id=11 AND country_code='GB' AND is_primary=1`).first()).c, 1);
    assert.equal((await t.db.prepare(`SELECT COUNT(*) c FROM news_revisions WHERE news_id=11`).first()).c, 1);
    assert.match(ALLTEXT(t.alert), /Saved \(revision 1\)/);
  });

  test('adding and saving a source via the UI; invalid URL is rejected with a visible error', async () => {
    await click(btn(t.panel, 'Open'));
    await click(btn(t.panel, 'Add source'));
    const inputs = () => all(t.panel, (e) => e.classList !== undefined && e.tagName === 'INPUT' && e.attrs.placeholder === 'Source name');
    inputs()[0].value = 'UKGC statement';
    all(t.panel, (e) => e.tagName === 'INPUT' && e.attrs.placeholder === 'https://…')[0].value = 'javascript:alert(1)';
    await click(btn(t.panel, 'Save sources'));
    assert.match(ALLTEXT(t.alert), /Only http\(s\) URLs are allowed/);
    assert.equal((await t.db.prepare(`SELECT COUNT(*) c FROM news_article_sources`).first()).c, 0);
    all(t.panel, (e) => e.tagName === 'INPUT' && e.attrs.placeholder === 'https://…')[0].value = 'https://www.gamblingcommission.gov.uk/x';
    await click(btn(t.panel, 'Save sources'));
    assert.equal((await t.db.prepare(`SELECT source_name, source_url FROM news_article_sources`).first()).source_name, 'UKGC statement');
  });

  test('taxonomy tab: create and archive a topic through the UI', async () => {
    await click(t.tabs[2]);
    const name = all(t.panel, (e) => e.tagName === 'INPUT' && e.attrs.placeholder === 'Name')[0]; name.value = 'Licensing';
    // switch kind to topics
    const kind = all(t.panel, (e) => e.tagName === 'SELECT')[0]; kind.value = 'topics';
    await click(btn(t.panel, 'Create'));
    assert.equal((await t.db.prepare(`SELECT slug FROM news_topics`).first()).slug, 'licensing');
  });

  test('workflow section appears once the flag is on and drives a real transition', async () => {
    const w = await boot(ADMIN, { workflow: true });
    await click(btn(w.panel, 'Open'));
    const txt = ALLTEXT(w.panel);
    assert.ok(txt.includes('Workflow (internal)'));
    assert.ok(!txt.includes('Editorial workflow is disabled'));
    const to = all(w.panel, (e) => e.tagName === 'SELECT').find((s) => s.options.some((o) => o.value === 'editorial_review'));
    to.value = 'editorial_review';
    await click(btn(w.panel, 'Apply'));
    assert.equal((await w.db.prepare(`SELECT workflow_status s FROM news_editorial WHERE news_id=11`).first()).s, 'editorial_review');
    assert.match(ALLTEXT(w.alert), /Moved from Draft to Editorial review/);
  });


  test('no panel ever renders the literal text "null" / "undefined" (real DOM append() stringifies null children)', async () => {
    // no \b in the regex: text nodes are concatenated ("...clicksnull")
    for (const tab of [0, 1, 2, 3, 4, 5, 6, 7, 8]) { await click(t.tabs[tab]); const txt = ALLTEXT(t.panel); assert.ok(!/null|undefined/.test(txt), `tab ${tab} shows a stray null/undefined`); }
    await click(t.tabs[0]); await click(btn(t.panel, 'Open'));
    assert.ok(!/null|undefined/.test(ALLTEXT(t.panel)), 'article panel shows a stray null/undefined');
  });

  test('policies tab: create a draft, publishing the untouched template is refused, completed content publishes', async () => {
    await click(t.tabs[3]);
    assert.match(ALLTEXT(t.panel), /Editorial Standards/);
    assert.match(ALLTEXT(t.panel), /Not created/);
    const row = all(t.panel, (e) => e.tagName === 'TR').find((r) => r.textContent.includes('Editorial Standards'));
    await click(btn(row, 'Create draft'));
    assert.equal((await t.db.prepare(`SELECT published p FROM pages WHERE slug='editorial/standards'`).first()).p, 0);
    const row2 = all(t.panel, (e) => e.tagName === 'TR').find((r) => r.textContent.includes('Editorial Standards'));
    await click(btn(row2, 'Edit'));
    const box = all(t.panel, (e) => e.tagName === 'INPUT' && e.attrs.type === 'checkbox')[0]; box.checked = true;
    await click(btn(t.panel, 'Save'));
    assert.match(ALLTEXT(t.alert), /Complete every \[\[FILL IN\]\] item/);
    assert.equal((await t.db.prepare(`SELECT published p FROM pages WHERE slug='editorial/standards'`).first()).p, 0);
    const ta = all(t.panel, (e) => e.tagName === 'TEXTAREA').find((e) => e.attrs.rows === '16');
    ta.value = '<p>We check facts before publishing.</p>';
    await click(btn(t.panel, 'Save'));
    assert.equal((await t.db.prepare(`SELECT published p FROM pages WHERE slug='editorial/standards'`).first()).p, 1);
  });

  test('authors tab: list, edit profile fields, save (no emails shown; invalid website is refused visibly)', async () => {
    await t.db.prepare(`UPDATE authors SET email = 'private@example.com' WHERE id = 1`).run();
    await click(t.tabs[4]);
    assert.match(ALLTEXT(t.panel), /Elie/); assert.ok(!ALLTEXT(t.panel).includes('private@example.com'));
    await click(btn(t.panel, 'Edit'));
    const val = (ph) => all(t.panel, (e) => e.tagName === 'INPUT' && (e.attrs.placeholder === ph || e.attrs.type === ph))[0];
    const inputs = all(t.panel, (e) => e.tagName === 'INPUT');
    inputs[0].value = 'Head of Regulation'; inputs[1].value = 'Regulation, Payments'; inputs[2].value = 'Valletta'; inputs[3].value = 'javascript:alert(1)';
    await click(btn(t.panel, 'Save'));
    assert.match(ALLTEXT(t.alert), /website_url: Only http\(s\) URLs are allowed/);
    assert.equal((await t.db.prepare(`SELECT job_title FROM authors WHERE id=1`).first()).job_title, null);
    inputs[3].value = 'https://elie.example';
    await click(btn(t.panel, 'Save'));
    const a = await t.db.prepare(`SELECT job_title, expertise, location, website_url FROM authors WHERE id=1`).first();
    assert.deepEqual({ ...a }, { job_title: 'Head of Regulation', expertise: 'Regulation, Payments', location: 'Valletta', website_url: 'https://elie.example/' });
  });

  test('analytics tab: renders the overview, shows the data-limit warning, and Open jumps to the article with its performance block', async () => {
    const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
    for (let i = 0; i < 6; i++) await t.db.prepare(`INSERT INTO analytics_events (event_type, news_id, occurred_at, country_code, referrer) VALUES ('CONTENT_VIEW', 10, ?, 'US', ?)`).bind(ago(2), i < 2 ? 'https://www.google.com/' : null).run();
    await click(t.tabs[5]);
    const txt = ALLTEXT(t.panel);
    for (const s of ['Articles published', 'Page views', 'Unique visitors', 'Not available', 'Views per day', 'Most read', 'Traffic by section', 'Traffic sources', 'Organic search views', 'Engagement']) assert.ok(txt.includes(s), `missing ${s}`);
    assert.match(txt, /Data limits:/); assert.match(txt, /Unique visitors are not available/);
    assert.ok(all(t.panel, (e) => (e.className || '') === 'nr-bar').length >= 1, 'a bar is drawn for the day with views');
    const row = all(t.panel, (e) => e.tagName === 'TR').find((r) => r.textContent.includes('Live One'));
    await click(btn(row, 'Open'));
    assert.match(ALLTEXT(t.panel), /Performance \(last 30 days\)/);
    assert.match(ALLTEXT(t.panel), /From search/);
  });

  test('search tab: finds drafts, filters by status, opens the article; index status and rebuild work', async () => {
    const S = await import('../worker/newsroom-search.js');
    await click(t.tabs[6]);
    assert.match(ALLTEXT(t.panel), /Search index/); assert.match(ALLTEXT(t.panel), /0 of 2 articles indexed/); assert.match(ALLTEXT(t.panel), /Public search v2 is OFF/); assert.match(ALLTEXT(t.panel), /rebuild it before enabling/);
    await click(btn(t.panel, 'Rebuild index'));
    assert.match(ALLTEXT(t.alert), /Search index rebuilt/);
    assert.equal((await S.indexStatus(t.db)).complete, true);
    await click(t.tabs[6]);
    assert.match(ALLTEXT(t.panel), /2 of 2 articles indexed/);
    const box = all(t.panel, (e) => e.tagName === 'INPUT' && e.attrs.type === 'search')[0]; box.value = 'draft';
    const status = all(t.panel, (e) => e.tagName === 'SELECT' && e.attrs['aria-label'] === 'Status')[0]; status.value = 'draft';
    await click(btn(t.panel, 'Search'));
    assert.match(ALLTEXT(t.panel), /1 result/); assert.match(ALLTEXT(t.panel), /\/draft-one/);
    await click(btn(t.panel, 'Open'));
    assert.match(ALLTEXT(t.panel), /Classification & relations/);
  });

  test('homepage tab: find an article, pin it as the top story with a window, reorder/remove, save; the server rejects nothing valid and the DB matches', async () => {
    const S = await import('../worker/newsroom-search.js'); await S.reindexBatch(t.db, { cursor: 0, limit: 50 });
    await click(t.tabs[7]);
    for (const s of ['Top story', 'Featured', 'Trending', 'Nothing pinned']) assert.ok(ALLTEXT(t.panel).includes(s), s);
    const finder = all(t.panel, (e) => e.tagName === 'INPUT' && e.attrs['aria-label'] === 'Find article for Top story')[0]; finder.value = 'live';
    const findBtn = all(t.panel, (e) => e.tagName === 'BUTTON' && e.textContent === 'Find')[0]; await click(findBtn);
    assert.match(ALLTEXT(t.panel), /Live One/);
    await click(btn(t.panel, 'Pin'));
    const start = all(t.panel, (e) => e.tagName === 'INPUT' && e.attrs.type === 'datetime-local' && e.attrs['aria-label'] === 'Start')[0];
    start.value = '2030-01-02T03:04'; for (const fn of start.listeners.change || []) fn({ target: start });
    await click(btn(t.panel, 'Save Top story'));
    assert.match(ALLTEXT(t.alert), /Top story: saved 1 pin/);
    const pin = await t.db.prepare(`SELECT news_id, slot, position, starts_at FROM news_pins WHERE slot='lead'`).first();
    assert.equal(pin.news_id, 10); assert.equal(pin.position, 0); assert.match(pin.starts_at, /^2030-01-0[123] \d\d:04:00$/);
    await click(t.tabs[7]);                                             // reload: the pin is listed, with its window round-tripped
    assert.match(ALLTEXT(t.panel), /Live One/); assert.ok(all(t.panel, (e) => e.tagName === 'INPUT' && e.attrs.type === 'datetime-local' && e._value).length >= 1);
    await click(btn(t.panel, 'Remove')); await click(btn(t.panel, 'Save Top story'));
    assert.equal((await t.db.prepare(`SELECT COUNT(*) c FROM news_pins WHERE slot='lead'`).first()).c, 0);
  });

  test('taxonomy tab: region-country mapping loads, saves, and reloads', async () => {
    await t.db.prepare(`INSERT INTO countries (code,name) VALUES ('DE','Germany'),('FR','France')`).run();
    await click(t.tabs[2]);
    assert.match(ALLTEXT(t.panel), /Region countries/);
    const box = all(t.panel, (e) => e.tagName === 'TEXTAREA' && e.attrs['aria-label'] === 'Country codes')[0]; box.value = 'de, fr  it';
    await click(btn(t.panel, 'Save countries'));
    assert.match(ALLTEXT(t.alert), /Could not|unknown country|Unknown/i);                        // IT is not in the countries table: the whole save is rejected
    assert.equal((await t.db.prepare(`SELECT COUNT(*) c FROM news_region_countries`).first()).c, 0);
    box.value = 'de, fr';
    await click(btn(t.panel, 'Save countries'));
    assert.match(ALLTEXT(t.alert), /Saved 2 countries/);
    assert.deepEqual((await t.db.prepare(`SELECT country_code c FROM news_region_countries WHERE region_slug='europe' ORDER BY c`).all()).results.map((r) => r.c), ['DE', 'FR']);
    await click(t.tabs[2]);
    assert.equal(all(t.panel, (e) => e.tagName === 'TEXTAREA' && e.attrs['aria-label'] === 'Country codes')[0].value, 'DE, FR');
  });

  test('flags tab: lists real flags, toggling and saving actually flips them in the DB and takes effect immediately', async () => {
    await click(t.tabs[8]);
    assert.match(ALLTEXT(t.panel), /News search v2/);
    assert.match(ALLTEXT(t.panel), /Rebuild the search index/);
    const before = await t.db.prepare(`SELECT value FROM system_settings WHERE key='news_trending'`).first();
    assert.equal(before.value, 'false');
    const trendingRow = all(t.panel, (e) => e.tagName === 'TR').find((r) => r.textContent.includes('news_trending'));
    const toggle = all(trendingRow, (e) => e.tagName === 'INPUT' && e.attrs.type === 'checkbox')[0];
    toggle.checked = true;
    await click(btn(t.panel, 'Save changes'));
    assert.match(ALLTEXT(t.alert), /Saved \d+ flags?/);
    const after = await t.db.prepare(`SELECT value FROM system_settings WHERE key='news_trending'`).first();
    assert.equal(after.value, 'true');
    const { getNewsFlags } = await import('../worker/database/newsroom.js');
    assert.equal((await getNewsFlags(t.db)).news_trending, true);
  });

  test('an illegal transition surfaces the server error in the alert (no silent failure)', async () => {
    const w = await boot(ADMIN, { workflow: true });
    await click(btn(w.panel, 'Open'));
    const to = all(w.panel, (e) => e.tagName === 'SELECT').find((s) => s.options.some((o) => o.value === 'retracted'));
    to.value = 'retracted';
    await click(btn(w.panel, 'Apply'));
    assert.match(ALLTEXT(w.alert), /cannot move from draft to retracted/);
  });
});
