// Patch 5: provider API integrations managed from the dashboard (key stored encrypted, auth styles, connection test, auto-sync switch).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { createProviderAdapterConfig, getProviderAdapterConfigById } from '../worker/database/provider-adapters.js';
import { saveAdapterSettings, withAdapterSettings, describeAdapterSettings, clearAdapterKey } from '../worker/adapters/credentials.js';
import { GenericRestAdapter } from '../worker/adapters/generic-rest-adapter.js';
import { syncProviderConfig } from '../worker/adapters/sync.js';
import { route } from '../worker/api/routes/provider-adapters.js';

async function seed(db) {
  await db.prepare(`INSERT INTO users (id, email, password_hash, role) VALUES (1,'a@t.l','x','admin')`).run();
  await db.prepare(`INSERT INTO affiliate_partners (id,name,slug,status,created_by) VALUES (1,'P','p','active',1)`).run();
  await db.prepare(`INSERT INTO affiliate_programs (id,partner_id,name,status,created_by) VALUES (10,1,'Alpha','active',1)`).run();
  await db.prepare(`INSERT INTO affiliate_accounts (id,program_id,account_name,status,credential_reference,created_by) VALUES (100,10,'A','active','managed',1)`).run();
}
const jsonRes = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const call = async (env, path, method, body) => {
  const r = await route({ request: new Request('https://x.test' + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, path: path.split('?')[0], user: { user_id: 1 } });
  return r.json();
};

describe('provider API credentials from the dashboard', () => {
  let db, env, id;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db); await seed(db);
    env = { DB: db, SUPER_API_SECRET: 'k' };
    id = await createProviderAdapterConfig(db, { account_id: 100, label: 'L', provider_key: 'generic_rest', api_base_url: 'https://api.example.com', created_by: 1 });
  });

  test('credential_reference is optional and defaults to managed; the key is encrypted at rest and only its last four characters come back', async () => {
    assert.equal((await getProviderAdapterConfigById(db, id)).credential_reference, 'managed');
    await saveAdapterSettings(env, id, { apiKey: 'sk_live_abcd1234', settings: {} });
    const raw = await db.prepare('SELECT secret_enc FROM provider_adapter_settings WHERE config_id = ?').bind(id).first();
    assert.ok(!raw.secret_enc.includes('abcd1234'));
    const d = await describeAdapterSettings(env, await getProviderAdapterConfigById(db, id));
    assert.equal(d.key_source, 'dashboard');
    assert.equal(d.key_hint, '…1234');
    assert.equal((await withAdapterSettings(env, await getProviderAdapterConfigById(db, id))).managed_secret, 'sk_live_abcd1234');
  });

  test('saving settings again without a key keeps the stored key; clearing removes it', async () => {
    await saveAdapterSettings(env, id, { apiKey: 'first-key-1', settings: {} });
    await saveAdapterSettings(env, id, { settings: { date_format: 'date' } });
    const cfg = await withAdapterSettings(env, await getProviderAdapterConfigById(db, id));
    assert.equal(cfg.managed_secret, 'first-key-1');
    assert.equal(cfg.date_format, 'date');
    await clearAdapterKey(db, id);
    assert.equal((await describeAdapterSettings(env, await getProviderAdapterConfigById(db, id))).key_source, null);
  });

  test('an older integration that uses a Worker secret keeps working', async () => {
    const old = await createProviderAdapterConfig(db, { account_id: 100, label: 'Old', provider_key: 'generic_rest', api_base_url: 'https://api.example.com', credential_reference: 'OLD_KEY', created_by: 1 });
    const seen = [];
    const cfg = await getProviderAdapterConfigById(db, old);
    const a = new GenericRestAdapter({ ...cfg, fetchImpl: async (u, o) => { seen.push(o.headers); return jsonRes([]); } });
    await a.fetchConversions({ OLD_KEY: 'worker-secret' }, { sinceISO: '2026-01-01T00:00:00Z', untilISO: '2026-01-02T00:00:00Z' });
    assert.equal(seen[0].Authorization, 'Bearer worker-secret');
    assert.equal((await describeAdapterSettings({ ...env, OLD_KEY: 'x' }, cfg)).key_source, 'worker_secret');
  });

  test('auth styles: custom header, key in the address, basic login; date formats and extra parameters', async () => {
    const run = async (extra) => {
      const calls = [];
      const a = new GenericRestAdapter({ api_base_url: 'https://api.example.com', conversions_path: '/v1/stats', managed_secret: 'KEY', fetchImpl: async (u, o) => { calls.push({ u: new URL(u), h: o.headers }); return jsonRes({ data: [] }); }, ...extra });
      await a.fetchConversions({}, { sinceISO: '2026-11-01T10:00:00.000Z', untilISO: '2026-11-02T10:00:00.000Z' });
      return calls[0];
    };
    let c = await run({ auth_header_name: 'X-API-KEY', auth_scheme: '' });
    assert.equal(c.h['X-API-KEY'], 'KEY');
    c = await run({ auth_query_param: 'api_key', date_format: 'date', extra_query: 'limit=500&currency=USD' });
    assert.equal(c.u.searchParams.get('api_key'), 'KEY');
    assert.deepEqual(c.h, {});
    assert.equal(c.u.searchParams.get('since'), '2026-11-01');
    assert.equal(c.u.searchParams.get('limit'), '500');
    c = await run({ auth_scheme: 'Basic', managed_secret: 'user:pass', date_format: 'unix' });
    assert.equal(c.h.Authorization, 'Basic ' + btoa('user:pass'));
    assert.equal(c.u.searchParams.get('since'), String(Math.floor(Date.parse('2026-11-01T10:00:00Z') / 1000)));
  });

  test('repeated list parameters are kept and a shape outline shows names only', async () => {
    let seen;
    const a = new GenericRestAdapter({ api_base_url: 'https://api.example.com', conversions_path: '/r', managed_secret: 'K', extra_query: 'columns[]=visits_count&columns[]=registrations_count&group_by[]=day', fetchImpl: async (u) => { seen = new URL(u); return jsonRes({ meta: { total: 3 }, payload: { rows: [{ day: '2026-11-01', visits_count: 5 }] } }); } });
    const r = await a.testConnection({});
    assert.deepEqual(seen.searchParams.getAll('columns[]'), ['visits_count', 'registrations_count']);
    assert.equal(r.stage, 'shape');
    assert.deepEqual(r.outline.payload.rows, [{ day: 'string', visits_count: 'number' }]);
    assert.ok(!JSON.stringify(r.outline).includes('2026-11-01'));
  });

  test('POST with a JSON body, placeholders and page-by-page fetching (Pin-Up style)', async () => {
    const calls = [];
    const pages = { 1: { page: 1, total_pages: 3, list: [{ a: 1 }, { a: 2 }] }, 2: { page: 2, total_pages: 3, list: [{ a: 3 }] }, 3: { page: 3, total_pages: 3, list: [{ a: 4 }] } };
    const a = new GenericRestAdapter({
      api_base_url: 'https://partnerspinup.com', conversions_path: '/public/v2/statistics/players', managed_secret: 'KEY', http_method: 'POST', paging: 'page', page_size: 2,
      response_array_path: 'list', body_json: '{"periodFrom":"{since}","periodTo":"{until}","page":"{page}","limit":"{limit}","status":"paid"}',
      fetchImpl: async (u, o) => { const b = JSON.parse(o.body); calls.push({ u: new URL(u), o, b }); return jsonRes(pages[b.page]); }
    });
    const rows = await a.fetchConversions({}, { sinceISO: '2026-11-01T00:00:00Z', untilISO: '2026-11-02T00:00:00Z' });
    assert.deepEqual(rows.map((r) => r.a), [1, 2, 3, 4]);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].o.method, 'POST');
    assert.equal(calls[0].o.headers.Authorization, 'Bearer KEY');
    assert.equal(calls[0].o.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].b.page, 1); assert.equal(calls[0].b.limit, 2);
    assert.equal(calls[0].b.periodFrom, '2026-11-01T00:00:00Z'); assert.equal(calls[0].b.status, 'paid');
    assert.equal(calls[0].u.search, '', 'dates go in the body, not the address');
  });

  test('request settings are validated and saved from the dashboard; an invalid body is refused', async () => {
    const { saveAdapterRequest, describeAdapterSettings: d } = await import('../worker/adapters/credentials.js');
    await assert.rejects(() => saveAdapterRequest(db, id, { http_method: 'POST', body_json: '{nope' }), /valid JSON/);
    await saveAdapterRequest(db, id, { http_method: 'post', body_json: '{"page":"{page}"}', paging: 'page', page_size: 500 });
    const out = await d(env, await getProviderAdapterConfigById(db, id));
    assert.equal(out.http_method, 'POST'); assert.equal(out.paging, 'page'); assert.equal(out.page_size, 100);
    const { API_PRESETS } = await import('../worker/adapters/api-presets.js');
    assert.equal(API_PRESETS[0].conversions_path, '/public/v2/statistics/players');
    JSON.parse(API_PRESETS[0].body_json);
  });

  test('unsafe API addresses are refused', async () => {
    for (const bad of ['http://api.example.com', 'https://127.0.0.1', 'https://localhost', 'https://user:pw@api.example.com', 'https://x.internal']) {
      await assert.rejects(() => createProviderAdapterConfig(db, { account_id: 100, label: 'B', provider_key: 'generic_rest', api_base_url: bad }), /API address/);
    }
  });

  test('connection test explains each failure and reports what the first row maps to', async () => {
    const t = async (res) => (await new GenericRestAdapter({ api_base_url: 'https://api.example.com', managed_secret: 'K', fetchImpl: async () => res }).testConnection({}));
    assert.equal((await new GenericRestAdapter({ api_base_url: 'https://api.example.com' }).testConnection({})).stage, 'key');
    assert.equal((await t(jsonRes({}, 401))).stage, 'auth');
    assert.equal((await t(jsonRes({}, 404))).stage, 'path');
    assert.equal((await t({ ok: false, status: 302, json: async () => ({}) })).stage, 'path');
    const shape = await t(jsonRes({ meta: {}, payload: { rows: [] } }));
    assert.equal(shape.stage, 'shape'); assert.deepEqual(shape.top_level_keys, ['meta', 'payload']);
    const ok = await t(jsonRes({ data: [{ subid: 'abc', event: 'ftd', amount: '50', currency: 'USD', secret_token: 'hidden-value-that-is-long' }] }));
    assert.equal(ok.ok, true); assert.equal(ok.row_count, 1);
    assert.equal(ok.recognised.click_id, 'abc');
    assert.ok(!JSON.stringify(ok).includes('"K"'));
  });

  test('routes: create with a key, list shows the hint but never the key, test, replace key, auto-sync switch', async () => {
    const orig = globalThis.fetch;
    try {
      globalThis.fetch = async () => jsonRes({ data: [{ subid: 'z', event: 'registration' }] });
      const made = await call(env, '/api/v1/provider-adapter/create', 'POST', { account_id: 100, label: 'API', provider_key: 'generic_rest', api_base_url: 'https://api.example.com', api_key: 'secret-value-9876', auth_query_param: 'token' });
      assert.equal(made.success, true);
      const list = await call(env, '/api/v1/provider-adapters/list', 'GET');
      const row = list.configs.find((c) => c.id === made.id);
      assert.equal(row.key_hint, '…9876'); assert.equal(row.auth_query_param, 'token');
      assert.ok(!JSON.stringify(list).includes('secret-value'));
      assert.equal(list.auto_sync, false);
      const tested = await call(env, '/api/v1/provider-adapter/test', 'POST', { id: made.id });
      assert.equal(tested.result.ok, true); assert.equal(tested.result.row_count, 1);
      const bad = await call(env, '/api/v1/provider-adapter/secret/set', 'POST', { id: made.id, api_key: 'x' });
      assert.equal(bad.success, false);
      const set = await call(env, '/api/v1/provider-adapter/secret/set', 'POST', { id: made.id, api_key: 'another-key-5555', auth_query_param: 'token' });
      assert.equal(set.key_hint, '…5555');
      assert.equal((await call(env, '/api/v1/provider-adapters/auto-sync', 'POST', { enabled: true })).auto_sync, true);
      assert.equal((await call(env, '/api/v1/provider-adapters/list', 'GET')).auto_sync, true);
    } finally { globalThis.fetch = orig; }
  });

  test('a sync uses the dashboard key and the next sync starts where the last one stopped', async () => {
    const orig = globalThis.fetch; const urls = [];
    try {
      globalThis.fetch = async (u) => { urls.push(new URL(u)); return jsonRes({ data: [] }); };
      await saveAdapterSettings(env, id, { apiKey: 'k-managed-1', settings: { auth_query_param: 'key' } });
      let cfg = await getProviderAdapterConfigById(db, id);
      const first = await syncProviderConfig(db, env, cfg);
      assert.equal(first.ok, true);
      assert.equal(urls[0].searchParams.get('key'), 'k-managed-1');
      cfg = await getProviderAdapterConfigById(db, id);
      assert.match(cfg.last_sync_at, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
      const second = await syncProviderConfig(db, env, cfg);
      assert.equal(second.ok, true, 'a stored last_sync_at must not break the next run');
      const since = new Date(urls[1].searchParams.get('since')).getTime();
      assert.ok(Math.abs(since - Date.parse(cfg.last_sync_at.replace(' ', 'T') + 'Z')) < 1500);
    } finally { globalThis.fetch = orig; }
  });
});

describe('report-style provider APIs (Affilka /partner/report)', () => {
  const sample = (day, regs = 3) => ([
    ...(day ? [{ name: 'day', value: day, type: 'string' }] : []),
    { name: 'visits_count', value: 40, type: 'number' }, { name: 'registrations_count', value: regs, type: 'number' },
    { name: 'first_deposits_count', value: 1, type: 'number' }, { name: 'currency', value: 'EUR', type: 'string' },
    { name: 'partner_income', value: { currency: 'EUR', amount_cents: '1250.0', amount: '12.50' }, type: 'money' }
  ]);
  const body = (rows) => ({ report_type: 'inline', rows: { data: rows }, totals: { data: [sample(null)] }, current_page: 1, total_pages: 1 });
  let db, env, id;
  beforeEach(async () => {
    db = createTestDb(); applyMigrations(db); await seed(db);
    env = { DB: db, SUPER_API_SECRET: 'k' };
    id = await createProviderAdapterConfig(db, { account_id: 100, label: 'Aff', provider_key: 'generic_rest', api_base_url: 'https://aff.example.com', conversions_path: '/api/customer/v1/partner/report', auth_scheme: '', date_param_since: 'from', date_param_until: 'to', created_by: 1 });
    const { saveAdapterRequest } = await import('../worker/adapters/credentials.js');
    await saveAdapterRequest(db, id, { http_method: 'GET', result_mode: 'report', extra_query: undefined });
    await saveAdapterSettings(env, id, { apiKey: 'statistic-token', settings: { auth_query_param: '', date_format: 'date', extra_query: 'columns[]=visits_count&columns[]=registrations_count&group_by[]=day' } });
  });

  test('flattening reads cells, money and the day column; totals are ignored', async () => {
    const { flattenReport } = await import('../worker/adapters/report-mode.js');
    const f = flattenReport(body([sample('2026-11-14'), sample('2026-11-15')]));
    assert.equal(f.rows.length, 2);
    assert.deepEqual(f.rows[0].metrics, { visits_count: 40, registrations_count: 3, first_deposits_count: 1, partner_income: 12.5 });
    assert.equal(f.rows[0].period, '2026-11-14'); assert.equal(f.rows[0].currency, 'EUR');
    assert.equal(flattenReport({ nope: 1 }), null);
  });

  test('a sync stores daily totals, never conversions, and a re-run replaces rather than duplicates', async () => {
    const orig = globalThis.fetch; const seen = [];
    try {
      globalThis.fetch = async (u, o) => { seen.push({ u: new URL(u), o }); return jsonRes(body([sample('2026-11-14'), sample('2026-11-15', 4)])); };
      const cfg = await getProviderAdapterConfigById(db, id);
      const r = await syncProviderConfig(db, env, cfg);
      assert.equal(r.ok, true); assert.equal(r.report_rows, 2);
      assert.equal(seen[0].u.searchParams.get('from').length, 10);
      assert.deepEqual(seen[0].u.searchParams.getAll('columns[]'), ['visits_count', 'registrations_count']);
      assert.equal(seen[0].o.headers.Authorization, 'statistic-token');
      await syncProviderConfig(db, env, await getProviderAdapterConfigById(db, id));
      assert.equal((await db.prepare('SELECT COUNT(*) n FROM provider_report_rows').first()).n, 2);
      assert.equal((await db.prepare('SELECT COUNT(*) n FROM analytics_conversions').first()).n, 0);
    } finally { globalThis.fetch = orig; }
  });

  test('comparison sets program totals beside what this site tracked', async () => {
    const { storeReportRows, compareWithTracked } = await import('../worker/adapters/report-mode.js');
    const { flattenReport } = await import('../worker/adapters/report-mode.js');
    const today = new Date().toISOString().slice(0, 10);
    await storeReportRows(db, id, flattenReport(body([sample(today, 5)])).rows, 'x');
    await db.prepare(`INSERT INTO analytics_conversions (account_id, conversion_type, status, currency, calculated_commission, occurred_at) VALUES (100,'registration','confirmed','USD',0,?),(100,'registration','pending','USD',0,?),(100,'ftd','confirmed','USD',7.5,?),(100,'registration','rejected','USD',0,?)`).bind(today + ' 10:00:00', today + ' 11:00:00', today + ' 12:00:00', today + ' 13:00:00').run();
    const rows = await compareWithTracked(db, await getProviderAdapterConfigById(db, id));
    assert.equal(rows[0].reported.registrations, 5); assert.equal(rows[0].tracked.registrations, 2);
    assert.equal(rows[0].tracked.first_deposits, 1); assert.equal(rows[0].tracked.commission, 7.5); assert.equal(rows[0].reported.income, 12.5);
  });

  test('connection test in report mode lists the columns it found; the preset carries the documented request', async () => {
    const orig = globalThis.fetch;
    try {
      globalThis.fetch = async () => jsonRes(body([sample('2026-11-15')]));
      const cfg = await withAdapterSettings(env, await getProviderAdapterConfigById(db, id));
      const r = await new GenericRestAdapter(cfg).testConnection({});
      assert.equal(r.ok, true); assert.equal(r.mode, 'report'); assert.equal(r.has_period, true);
      assert.ok(r.sample_keys.includes('registrations_count'));
    } finally { globalThis.fetch = orig; }
    const { API_PRESETS } = await import('../worker/adapters/api-presets.js');
    const p = API_PRESETS.find((x) => x.id === 'affilka_report');
    assert.equal(p.date_param_since, 'from'); assert.match(p.extra_query, /columns\[\]=visits_count/); assert.equal(p.result_mode, 'report');
  });
});
