// Phase 12d: real renders. A dashboard value reaches the page; with nothing stored the old wording shows (seeded defaults).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { render404, renderForgotPassword, renderResetPassword, renderHome } from '../worker/controllers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function mkEnv() {
  const db = createTestDb(); applyMigrations(db);
  return { DB: db, ASSETS: { fetch: async (r) => { const f = join(ROOT, new URL(r.url).pathname); return existsSync(f) ? new Response(readFileSync(f, 'utf-8')) : new Response('nf', { status: 404 }); } } };
}
const set = (env, k, v) => env.DB.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v).run();
const req = (p) => new Request(`https://site.test${p}`);
const html = async (res) => await res.text();

describe('managed wording reaches the real pages', () => {
  let env; beforeEach(() => { env = mkEnv(); });

  test('404: old wording by default, dashboard wording when edited, and still a 404', async () => {
    let r = await render404(req('/en/nope'), env); const a = await html(r);
    assert.equal(r.status, 404);
    assert.match(a, /The page you are looking for does not exist or may have been moved\./);
    assert.match(a, />Go Home</);
    await set(env, 'system_404_hint', 'Nothing lives here <yet>');
    await set(env, 'system_404_home', 'Take me home');
    r = await render404(req('/en/nope'), env); const b = await html(r);
    assert.equal(r.status, 404);
    assert.match(b, /Nothing lives here &lt;yet&gt;/);
    assert.match(b, />Take me home</);
  });

  test('forgot and reset password pages use the managed text', async () => {
    await set(env, 'account_forgot_title', 'Lost your password?');
    await set(env, 'account_reset_button', 'Save new password');
    const f = await html(await renderForgotPassword(req('/en/forgot-password'), env));
    assert.match(f, /<h1>Lost your password\?<\/h1>/);
    assert.match(f, />Send Reset Link</);
    const r = await html(await renderResetPassword(req('/en/reset-password?token=abc'), env));
    assert.match(r, />Save new password</);
    assert.match(r, /value="abc"/);
  });

  test('page width: the viewport tag follows the dashboard switch on every page', async () => {
    const off = await html(await render404(req('/en/x'), env));
    assert.match(off, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover">/);
    await set(env, 'layout_force_desktop', '1'); await set(env, 'layout_desktop_width', '1400');
    const on = await html(await render404(req('/en/x'), env));
    assert.match(on, /<meta name="viewport" content="width=1400, viewport-fit=cover">/);
    const home = await html(await renderHome(req('/en'), env));
    assert.match(home, /content="width=1400, viewport-fit=cover"/);
  });

  test('screen-reader labels in the header come from settings', async () => {
    await set(env, 'system_aria_menu', 'Open menu');
    const a = await html(await render404(req('/en/x'), env));
    assert.match(a, /id="navToggle" aria-label="Open menu"/);
  });

  test('homepage: headings are editable, a section can be switched off, and the sidebar can be hidden', async () => {
    const base = await html(await renderHome(req('/en'), env));
    assert.match(base, /Top Rated Casinos/); assert.match(base, /Latest Reviews/); assert.match(base, /Latest News/);
    assert.ok(!/layout-wrapper--full/.test(base));
    await set(env, 'home_casinos_title', 'Our Favourite Casinos');
    await set(env, 'home_reviews_enabled', '0');
    await set(env, 'sidebar_enabled', '0');
    const h = await html(await renderHome(req('/en'), env));
    assert.match(h, /Our Favourite Casinos/);
    assert.ok(!/<h2>Latest Reviews<\/h2>/.test(h));
    assert.match(h, /layout-wrapper--full/);
    assert.ok(!/id="sidebarCountries"|Browse by Country/.test(h));
  });
});
