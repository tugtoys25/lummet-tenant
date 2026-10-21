// A site that has no Turnstile configured (every newly provisioned one) must still be signable-in to; one that has it must still enforce it.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { login, register, hashPassword } from '../worker/auth.js';

let db, realFetch;
beforeEach(async () => {
  db = createTestDb(); applyMigrations(db); realFetch = globalThis.fetch;
  await db.prepare(`INSERT INTO users (email, password_hash, role) VALUES ('owner@example.com', ?, 'admin')`).bind(await hashPassword('correct-horse-battery')).run();
});
afterEach(() => { globalThis.fetch = realFetch; });

const req = (body, ip = '203.0.113.5') => ({ method: 'POST', url: 'https://site.example/en/api/v1/auth/login', headers: new Headers({ 'CF-Connecting-IP': ip }), json: async () => body });
const GOOD = { email: 'owner@example.com', password: 'correct-horse-battery' };
const siteverify = (success, seen = []) => { globalThis.fetch = async (url, opts) => { seen.push(String(url) + ' ' + String(opts?.body)); return new Response(JSON.stringify({ success }), { status: 200 }); }; return seen; };

test('no Turnstile secret: login works without a token and signs the person in', async () => {
  const res = await login(req(GOOD), { DB: db });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Set-Cookie') || '', /session=/);
  assert.equal((await db.prepare(`SELECT COUNT(*) c FROM sessions`).first()).c, 1);
});

test('no Turnstile secret: wrong passwords are still refused and the attempt limiter still locks after 5', async () => {
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await login(req({ email: 'owner@example.com', password: 'wrong-' + i }, '203.0.113.9'), { DB: db })).status);
  assert.deepEqual(codes.slice(0, 5), [401, 401, 401, 401, 401]);
  assert.equal(codes[5], 429); assert.equal(codes[6], 429);
  assert.equal((await login(req(GOOD, '203.0.113.9'), { DB: db })).status, 429, 'the right password from a locked address is refused too');
  assert.equal((await login(req(GOOD, '198.51.100.7'), { DB: db })).status, 200, 'another address is unaffected');
});

test('with a Turnstile secret: no token is refused, a bad token is refused, a good token signs in', async () => {
  const env = { DB: db, TURNSTILE_SECRET: 'secret-xyz' };
  const seen = siteverify(true);
  assert.equal((await login(req(GOOD), env)).status, 403);
  assert.equal(seen.length, 0, 'nothing to verify without a token');
  siteverify(false);
  assert.equal((await login(req({ ...GOOD, 'cf-turnstile-response': 'bad' }), env)).status, 403);
  const ok = siteverify(true);
  assert.equal((await login(req({ ...GOOD, 'cf-turnstile-response': 'good' }), env)).status, 200);
  assert.match(ok[0], /siteverify/); assert.match(ok[0], /secret=secret-xyz/); assert.match(ok[0], /response=good/);
});

test('with a Turnstile secret, a Cloudflare outage fails closed', async () => {
  globalThis.fetch = async () => { throw new Error('network down'); };
  assert.equal((await login(req({ ...GOOD, 'cf-turnstile-response': 't' }), { DB: db, TURNSTILE_SECRET: 's' })).status, 403);
});

test('registration follows the same rule', async () => {
  const body = { email: 'new@example.com', password: 'another-long-password-1' };
  const open = await register({ ...req(body), url: 'https://site.example/en/api/v1/auth/register' }, { DB: db });
  assert.ok([200, 201].includes(open.status), 'registered without a token when Turnstile is off: ' + open.status);
  assert.equal((await register({ ...req({ ...body, email: 'two@example.com' }), url: 'https://site.example/en/api/v1/auth/register' }, { DB: db, TURNSTILE_SECRET: 's' })).status, 403);
});

// ---- the login page script ----
function runPageScript({ widgets, token }) {
  const calls = []; let submit; const err = { style: {}, textContent: '' };
  const form = { addEventListener: (t, f) => { if (t === 'submit') submit = f; } };
  class FormDataStub { constructor() { this.m = { email: 'owner@example.com', password: 'pw', 'cf-turnstile-response': token || '' }; } get(k) { return this.m[k] || null; } }
  const sandbox = {
    document: {
      addEventListener: (t, f) => { if (t === 'DOMContentLoaded') sandbox.__ready = f; },
      getElementById: (id) => (id === 'loginForm' ? form : id === 'loginError' ? err : null),
      querySelector: () => null,
      querySelectorAll: (sel) => (sel === '.cf-turnstile' ? widgets : [])
    },
    window: { location: { search: '', href: '', hostname: 'site.example' }, turnstile: null },
    fetch: async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return { json: async () => ({ success: true }) }; },
    FormData: FormDataStub, URLSearchParams, URL, JSON, Array, console
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../static/js/main.js', import.meta.url), 'utf8'), sandbox);
  sandbox.__ready();
  return { fire: async () => { await submit({ preventDefault() {} }); return { calls, err, location: sandbox.window.location }; } };
}
const widget = (key) => ({ getAttribute: (a) => (a === 'data-sitekey' ? key : null) });

test('login page script: with no widget on the page it signs in without asking for a token', async () => {
  const r = await runPageScript({ widgets: [], token: '' }).fire();
  assert.equal(r.calls.length, 1); assert.equal(r.calls[0].url, '/en/api/v1/auth/login'); assert.equal(r.location.href, '/en/dashboard');
});

test('login page script: a widget with an empty site key does not count', async () => {
  const r = await runPageScript({ widgets: [widget('')], token: '' }).fire();
  assert.equal(r.calls.length, 1);
});

test('login page script: with a site key it still insists on the security check, and sends the token when there is one', async () => {
  const blocked = await runPageScript({ widgets: [widget('0x4AAAA')], token: '' }).fire();
  assert.equal(blocked.calls.length, 0); assert.equal(blocked.err.textContent, 'Please complete the security check.');
  const sent = await runPageScript({ widgets: [widget('0x4AAAA')], token: 'tok' }).fire();
  assert.equal(sent.calls.length, 1); assert.equal(sent.calls[0].body['cf-turnstile-response'], 'tok');
});

test('login and register templates draw the widget and load the Turnstile script only when a site key is set', () => {
  for (const f of ['login', 'register']) {
    const t = readFileSync(new URL(`../templates/pages/${f}.html`, import.meta.url), 'utf8');
    const live = t.replace(/<!--[\s\S]*?-->/g, '');
    const widgetAt = live.indexOf('class="cf-turnstile"'); assert.ok(widgetAt > 0, f);
    assert.ok(live.lastIndexOf('{{#if turnstile_sitekey}}', widgetAt) > live.lastIndexOf('{{/if}}', widgetAt), `${f}: widget is inside the conditional`);
    assert.match(live, /\{\{#if turnstile_sitekey\}\}<script src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js"[^>]*><\/script>\{\{\/if\}\}/, f);
  }
});
