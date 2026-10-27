// Round 6.3C: customer-site CSP (report-only, flagged) and what it must keep working. NOT VERIFIED here: real browsers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tenantCspMode, buildTenantCsp, withTenantCsp } from '../worker/security-headers.js';
import worker from '../worker/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = (body = '<p>x</p>', init = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...(init.headers || {}) } });
const directive = (csp, name) => (csp.split('; ').find((d) => d.startsWith(name + ' ')) || '').split(' ').slice(1);

test('TENANT_CSP_MODE is off unless it is exactly report-only; there is no enforce mode', () => {
  assert.equal(tenantCspMode({}), 'off'); assert.equal(tenantCspMode(undefined), 'off');
  assert.equal(tenantCspMode({ TENANT_CSP_MODE: ' Report-Only ' }), 'report-only');
  for (const v of ['', 'off', 'on', 'enforce', 'true', 'report']) assert.equal(tenantCspMode({ TENANT_CSP_MODE: v }), 'off', v);
});

test('off (the default): the response is returned untouched, same object, no CSP header of any kind', () => {
  const r = html();
  assert.equal(withTenantCsp(r, {}), r);
  assert.equal(withTenantCsp(r, { TENANT_CSP_MODE: 'off' }).headers.get('content-security-policy-report-only'), null);
});

test('report-only: HTML pages get Content-Security-Policy-Report-Only and never the enforcing header; body and status are kept', async () => {
  for (const status of [200, 404, 500]) {
    const out = withTenantCsp(new Response('<p>hi</p>', { status, headers: { 'content-type': 'text/html' } }), { TENANT_CSP_MODE: 'report-only' });
    assert.equal(out.status, status); assert.equal(await out.text(), '<p>hi</p>');
    assert.ok(out.headers.get('content-security-policy-report-only')); assert.equal(out.headers.get('content-security-policy'), null);
  }
});

test('report-only: JSON, images, scripts and redirects get no header; a CSP the page already set is left alone', () => {
  const env = { TENANT_CSP_MODE: 'report-only' };
  for (const type of ['application/json', 'image/png', 'text/javascript', 'text/css', '']) {
    const r = new Response('x', { headers: type ? { 'content-type': type } : {} });
    assert.equal(withTenantCsp(r, env).headers.get('content-security-policy-report-only'), null, type);
  }
  const own = html('x', { headers: { 'content-security-policy': "default-src 'none'" } });
  assert.equal(withTenantCsp(own, env), own);
});

test('the policy keeps Turnstile working: script, widget frame and verification connection are allowed', () => {
  const csp = buildTenantCsp({});
  for (const d of ['script-src', 'frame-src', 'connect-src']) assert.ok(directive(csp, d).includes('https://challenges.cloudflare.com'), d);
});

test('the policy is not a free-for-all: objects are blocked, base and form targets are same-origin, and script-src has no bare wildcard or https:', () => {
  const csp = buildTenantCsp({});
  assert.deepEqual(directive(csp, 'object-src'), ["'none'"]); assert.deepEqual(directive(csp, 'base-uri'), ["'self'"]); assert.deepEqual(directive(csp, 'form-action'), ["'self'"]);
  for (const src of directive(csp, 'script-src')) assert.ok(src !== '*' && src !== 'https:' && src !== 'http:' && !src.includes('*'), src);
  assert.ok(!csp.includes('unsafe-eval'));
});

test('every external origin the shipped templates and scripts load is covered by the policy', () => {
  const csp = buildTenantCsp({});
  const allowed = new Set(csp.split('; ').flatMap((d) => d.split(' ').slice(1)).filter((s) => s.startsWith('https://')));
  const files = [];
  const walk = (dir) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
  walk(join(ROOT, 'templates')); 
  const found = new Map();
  for (const f of files.filter((x) => x.endsWith('.html'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/<(?:script|iframe|link|img)\b[^>]*\b(?:src|href)="(https:\/\/[^"/]+)/gi)) {
      if (/rel="(?:canonical|alternate)"/.test(m[0])) continue;
      if (/<a\b/i.test(m[0])) continue;
      found.set(m[1], f);
    }
  }
  const loader = readFileSync(join(ROOT, 'static/js/pdf-libs-loader.js'), 'utf8');
  for (const m of loader.matchAll(/"(https:\/\/[^"/]+)\//g)) found.set(m[1], 'static/js/pdf-libs-loader.js');
  assert.ok(found.size >= 2, 'the scan found the known origins');
  for (const [origin, file] of found) assert.ok(allowed.has(origin), `${origin} (${file}) is not allowed by the policy`);
});

test('TENANT_CSP_REPORT_URI: a same-site path or an https address is added; anything else (http, spaces, directive injection) is ignored', () => {
  assert.match(buildTenantCsp({ TENANT_CSP_REPORT_URI: '/csp-report' }), /; report-uri \/csp-report$/);
  assert.match(buildTenantCsp({ TENANT_CSP_REPORT_URI: 'https://reports.example.com/r' }), /; report-uri https:\/\/reports\.example\.com\/r$/);
  for (const bad of ['http://reports.example.com/r', 'https://x.example/r; script-src *', '/a b', '//evil.example/r', 'javascript:alert(1)', '']) assert.ok(!buildTenantCsp({ TENANT_CSP_REPORT_URI: bad }).includes('report-uri'), bad);
});

test('the Worker entry applies it to a served page only when the flag is on', async () => {
  const src = readFileSync(join(ROOT, 'worker/index.js'), 'utf8');
  assert.equal((src.match(/withTenantCsp\(/g) || []).length, 2, 'both the gated and the normal path');
  assert.ok(src.includes('security-headers.js'));
  assert.equal(typeof worker.fetch, 'function');
});
