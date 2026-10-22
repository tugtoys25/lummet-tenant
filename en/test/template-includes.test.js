// Template includes (<!--@include path-->) and the split of the admin settings page.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandIncludes, Renderer } from '../worker/render.js';
import { readTemplateSource } from './support/template-source.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const loaderOf = (files) => async (n) => (n in files ? files[n] : null);

describe('expandIncludes', () => {
  test('replaces a marker with the exact text of the file, nothing else changes', async () => {
    const out = await expandIncludes('A\n<!--@include a.html-->\nB', loaderOf({ 'a.html': '  <p>x</p>\n' }));
    assert.equal(out, 'A\n  <p>x</p>\n\nB');
  });
  test('returns text without markers as it is, including $ patterns in the included text', async () => {
    assert.equal(await expandIncludes('no markers', loaderOf({})), 'no markers');
    assert.equal(await expandIncludes('<!--@include a.html-->', loaderOf({ 'a.html': 'cost $& $1 $$' })), 'cost $& $1 $$');
  });
  test('the same file twice is loaded once; includes nest', async () => {
    let calls = 0;
    const files = { 'a.html': '<!--@include b.html-->!', 'b.html': 'B' };
    const out = await expandIncludes('<!--@include a.html--><!--@include a.html-->', async (n) => { calls++; return files[n] ?? null; });
    assert.equal(out, 'B!B!');
    assert.equal(calls, 2, 'a.html once, b.html once');
  });
  test('a missing include and an include loop fail loudly', async () => {
    await assert.rejects(() => expandIncludes('<!--@include nope.html-->', loaderOf({})), /not found: nope\.html/);
    await assert.rejects(() => expandIncludes('<!--@include a.html-->', loaderOf({ 'a.html': '<!--@include a.html-->' })), /nested too deeply/);
  });
  test('Renderer.loadTemplate expands includes', async () => {
    const files = { 'pages/x.html': '<main><!--@include pages/x/part.html--></main>', 'pages/x/part.html': 'PART' };
    const env = { ASSETS: { fetch: async (r) => { const n = new URL(r.url).pathname.replace(/^\/templates\//, ''); return n in files ? new Response(files[n]) : new Response('', { status: 404 }); } } };
    assert.equal(await new Renderer(env).loadTemplate('pages/x.html'), '<main>PART</main>');
  });
});

describe('admin settings page layout', () => {
  const dir = join(ROOT, 'templates/pages/admin/settings');
  const main = readFileSync(join(ROOT, 'templates/pages/admin/settings.html'), 'utf-8');
  const markers = [...main.matchAll(/<!--@include (pages\/admin\/settings\/[a-z-]+\.html)-->/g)].map((m) => m[1]);

  test('settings.html is a short skeleton that includes every part, in order', () => {
    assert.ok(main.split('\n').length < 80);
    assert.equal(markers.length, 17);
    for (const m of markers) assert.ok(existsSync(join(ROOT, 'templates', m)), m);
    assert.deepEqual([...markers].map((m) => m.split('/').pop()).sort(), readdirSync(dir).sort(), 'no unused part files');
  });
  test('parts stay under 250 lines and the expanded page still has every section', () => {
    for (const f of readdirSync(dir)) assert.ok(readFileSync(join(dir, f), 'utf-8').split('\n').length < 250, `${f} too long`);
    const page = readTemplateSource('templates/pages/admin/settings.html');
    for (const id of ['general', 'analytics', 'gpwa', 'branding', 'favicons', 'theme', 'layout', 'hero', 'homepage-content', 'responsible-gambling', 'settings-footer', 'compliance-logos', 'news-ads', 'ad-rules']) assert.ok(page.includes(`id="${id}"`), id);
    assert.ok(page.includes('id="settingsForm"') && page.includes('</form>') && page.trim().endsWith('</div>'));
  });
});
