// Drives the real configuration-look.js against the real Configuration template (fake DOM, not a browser):
// the Ready-made designs tab is first, shows a card per design, and applying one saves the WHOLE look in one request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeDom, runScript, settle, walk } from './support/fake-dom.js';
import { DESIGN_PACKS, TEMPLATE_PACKS } from '../worker/site-profile/design-packs.js';

const HTML = fs.readFileSync(new URL('../templates/pages/admin/configuration.html', import.meta.url), 'utf8');
const SRC = fs.readFileSync(new URL('../static/js/admin/configuration-look.js', import.meta.url), 'utf8');

function boot({ confirm = true, draft = false } = {}) {
  const dom = makeDom(HTML);
  const calls = [];
  const queued = [];
  const win = { confirm: () => confirm, LummetConfig: draft ? { mode: 'draft', ready: Promise.resolve({ ready: true, draft: { effective: { settings: {} } } }), queueSettings: (o) => queued.push(o), onSaved() {} } : undefined, addEventListener() {} };
  const groups = [{ id: 'theme', label: 'Colours', help: '', available: true, fields: [{ key: 'theme_primary', type: 'color', label: 'Primary', available: true }], elsewhere: [], screen: '#' }];
  const values = { theme_primary: '#111111', theme_background: '#ffffff' };
  const fetch = async (url, opts) => {
    calls.push([opts?.method || 'GET', url, opts?.body]);
    if ((opts?.method || 'GET') === 'GET') return new Response(JSON.stringify({ groups, values, designs: DESIGN_PACKS, templates: TEMPLATE_PACKS }), { status: 200 });
    return new Response(JSON.stringify({ saved: true }), { status: 200 });
  };
  runScript(SRC, 'configuration-look.js', { document: dom.document, window: win, location: { hash: '', reload() {} }, history: { replaceState() {} }, fetch, Promise, console, JSON, Object, String, Array, Number, RegExp, setTimeout, clearTimeout });
  return { dom, calls, queued };
}
const buttons = (dom) => walk(dom.document.getElementById('lookForm')).filter((n) => n.tag === 'button');

test('the designs tab comes first and shows one card per design', async () => {
  const { dom } = boot(); await settle();
  const tabs = walk(dom.document.getElementById('lookTabs')).filter((n) => n.tag === 'a').map((n) => n.textContent);
  assert.match(tabs[0], /Ready-made designs/);
  assert.ok(tabs.some((t) => /Colours/.test(t)), 'the normal tabs are still there');
  assert.equal(buttons(dom).length, DESIGN_PACKS.length);
  const text = dom.document.getElementById('lookForm').textContent;
  for (const d of DESIGN_PACKS) assert.ok(text.includes(d.label), d.label);
  assert.equal(dom.document.getElementById('lookSave').hidden, true);
});

test('applying a template asks first, then saves every design key in one request', async () => {
  const { dom, calls } = boot(); await settle();
  buttons(dom)[0].onclick(); await settle();
  const post = calls.find((c) => c[0] === 'POST');
  assert.ok(post, 'a save request was sent');
  assert.deepEqual(Object.keys(JSON.parse(post[2]).settings).sort(), Object.keys(DESIGN_PACKS[0].settings).sort());
  assert.match(dom.document.getElementById('lookMsg').textContent, /is applied/);
  assert.equal(buttons(dom)[0].textContent, 'Current design');
  assert.equal(buttons(dom)[0].disabled, true);
});

test('declining the question changes nothing', async () => {
  const { dom, calls } = boot({ confirm: false }); await settle();
  buttons(dom)[1].onclick(); await settle();
  assert.equal(calls.filter((c) => c[0] === 'POST').length, 0);
});

test('while editing a draft, applying queues the whole look into the draft instead of saving live', async () => {
  const { dom, calls, queued } = boot({ draft: true }); await settle();
  buttons(dom)[0].onclick(); await settle();
  assert.equal(calls.filter((c) => c[0] === 'POST').length, 0);
  assert.equal(queued.length, 1);
  assert.equal(Object.keys(queued[0]).length, Object.keys(DESIGN_PACKS[0].settings).length);
});

const tabLinks = (dom) => walk(dom.document.getElementById('lookTabs')).filter((n) => n.tag === 'a');

test('designs and templates are two separate tabs, designs then templates, before the normal tabs', async () => {
  const { dom } = boot(); await settle();
  const names = tabLinks(dom).map((n) => n.textContent);
  assert.match(names[0], /Ready-made designs/);
  assert.match(names[1], /Ready-made templates/);
  assert.ok(names.slice(2).some((t) => /Colours/.test(t)));
});

test('the templates tab lists the templates and applying one saves only the four layout keys', async () => {
  const { dom, calls } = boot(); await settle();
  tabLinks(dom)[1].onclick({ preventDefault() {} }); await settle();
  const text = dom.document.getElementById('lookForm').textContent;
  for (const t of TEMPLATE_PACKS) assert.ok(text.includes(t.label), t.label);
  assert.equal(buttons(dom).length, TEMPLATE_PACKS.length);
  buttons(dom)[1].onclick(); await settle();
  const post = calls.find((c) => c[0] === 'POST');
  assert.deepEqual(Object.keys(JSON.parse(post[2]).settings).sort(), Object.keys(TEMPLATE_PACKS[1].settings).sort());
  assert.match(dom.document.getElementById('lookMsg').textContent, /is applied/);
});

test('a template does not touch the colours that a design set', async () => {
  const { dom, calls } = boot(); await settle();
  buttons(dom)[0].onclick(); await settle();
  tabLinks(dom)[1].onclick({ preventDefault() {} }); await settle();
  buttons(dom)[2].onclick(); await settle();
  const posts = calls.filter((c) => c[0] === 'POST').map((c) => Object.keys(JSON.parse(c[2]).settings));
  assert.equal(posts.length, 2);
  assert.ok(!posts[1].includes('theme_primary'));
});
