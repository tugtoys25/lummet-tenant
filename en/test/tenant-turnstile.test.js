// Round 6.3C: Turnstile pass-through on customer sites: widget only with a site key, token forwarded, verified server-side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyTurnstile } from '../worker/auth/security.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

async function withFetch(impl, fn) { const real = globalThis.fetch; const calls = []; globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return impl(url, init); }; try { return await fn(calls); } finally { globalThis.fetch = real; } }
const ok = (body) => async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

test('no secret configured: Turnstile is not enabled for the site, nothing is called', async () => {
  await withFetch(ok({ success: false }), async (calls) => { assert.equal(await verifyTurnstile('', {}), true); assert.equal(await verifyTurnstile('tok', { TURNSTILE_SECRET: '' }), true); assert.equal(calls.length, 0); });
});

test('secret configured: a missing token is refused without calling Cloudflare', async () => {
  await withFetch(ok({ success: true }), async (calls) => { assert.equal(await verifyTurnstile('', { TURNSTILE_SECRET: 's' }), false); assert.equal(await verifyTurnstile(undefined, { TURNSTILE_SECRET: 's' }), false); assert.equal(calls.length, 0); });
});

test('secret configured: the token is posted to siteverify with the secret, and only success:true passes', async () => {
  await withFetch(ok({ success: true }), async (calls) => {
    assert.equal(await verifyTurnstile('TOKEN123', { TURNSTILE_SECRET: 'SECRET456' }), true);
    assert.equal(calls[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify'); assert.equal(calls[0].init.method, 'POST');
    const body = new URLSearchParams(String(calls[0].init.body)); assert.equal(body.get('response'), 'TOKEN123'); assert.equal(body.get('secret'), 'SECRET456');
  });
  for (const answer of [{ success: false }, { success: 'true' }, { success: 1 }, {}, { 'error-codes': ['timeout-or-duplicate'] }]) await withFetch(ok(answer), async () => assert.equal(await verifyTurnstile('t', { TURNSTILE_SECRET: 's' }), false, JSON.stringify(answer)));
});

test('secret configured: a network error or a non-JSON answer fails closed', async () => {
  await withFetch(async () => { throw new Error('offline'); }, async () => assert.equal(await verifyTurnstile('t', { TURNSTILE_SECRET: 's' }), false));
  await withFetch(async () => new Response('<html>', { status: 502 }), async () => assert.equal(await verifyTurnstile('t', { TURNSTILE_SECRET: 's' }), false));
});

test('login and register render the widget and load the script only when a site key is set, from the one allowed origin', () => {
  for (const page of ['templates/pages/login.html', 'templates/pages/register.html']) {
    const t = read(page);
    assert.match(t, /\{\{#if turnstile_sitekey\}\}\s*<div class="cf-turnstile" data-sitekey="\{\{turnstile_sitekey\}\}"/, page);
    assert.match(t, /\{\{#if turnstile_sitekey\}\}<script src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js" async defer><\/script>\{\{\/if\}\}/, page);
    assert.match(t, /name="cf-turnstile-response"/, page);
    assert.equal((t.match(/challenges\.cloudflare\.com/g) || []).length, 1, 'only one Turnstile origin, no other host');
  }
});

test('the site key reaches the page escaped, and the secret never does', () => {
  const c = read('worker/controllers/auth-pages.js');
  assert.equal((c.match(/turnstile_sitekey: escapeHtml\(env\.TURNSTILE_SITEKEY \|\| ""\)/g) || []).length, 2, 'login and register');
  assert.ok(!/TURNSTILE_SECRET/.test(c));
  for (const f of ['templates/pages/login.html', 'templates/pages/register.html', 'static/js/main.js']) assert.ok(!/TURNSTILE_SECRET/.test(read(f)), f);
});

test('the browser script forwards the token with the request, requires it only when a site key is present, and resets the widget after an answer', () => {
  const js = read('static/js/main.js');
  assert.match(js, /\.cf-turnstile/); assert.match(js, /data-sitekey/);
  assert.equal((js.match(/"cf-turnstile-response": turnstileToken/g) || []).length, 2, 'login and register both send it');
  assert.ok((js.match(/window\.turnstile\.reset\(\)/g) || []).length >= 2);
  assert.match(js, /if \(turnstileRequired\(\) && !turnstileToken\)/);
});
