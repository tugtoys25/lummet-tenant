// Where a provider API integration gets its key and connection details. Values saved from the dashboard (encrypted) win; otherwise the
// older arrangement, a Worker secret named by credential_reference, still works so existing integrations keep running.
import { encryptSecret, decryptSecret } from '../security/secret-box.js';

export const MANAGED_REF = 'managed';
export const DATE_FORMATS = ['iso', 'date', 'unix'];

export function cleanSettings(input = {}) {
  const q = String(input.auth_query_param || '').trim();
  if (q && !/^[A-Za-z0-9_.-]{1,40}$/.test(q)) throw new Error('The key parameter name may only use letters, digits, dot, dash and underscore.');
  const df = input.date_format ? String(input.date_format) : 'iso';
  if (!DATE_FORMATS.includes(df)) throw new Error('Date format must be iso, date or unix.');
  let extra = String(input.extra_query || '').trim().replace(/^[?&]+/, '');
  if (extra.length > 300) throw new Error('Extra parameters are too long.');
  if (extra) {
    try { new URLSearchParams(extra); } catch { throw new Error('Extra parameters must look like limit=500&currency=USD.'); }
    if (/\s/.test(extra)) throw new Error('Extra parameters must not contain spaces.');
  }
  return { auth_query_param: q || null, date_format: df, extra_query: extra || null };
}

export async function saveAdapterSettings(env, configId, { apiKey = undefined, settings = {} } = {}) {
  const s = cleanSettings(settings);
  const existing = await env.DB.prepare('SELECT secret_enc FROM provider_adapter_settings WHERE config_id = ?').bind(configId).first();
  let enc = existing?.secret_enc || null;
  if (typeof apiKey === 'string' && apiKey.trim()) enc = await encryptSecret(env, apiKey.trim());
  await env.DB.prepare(`INSERT INTO provider_adapter_settings (config_id, secret_enc, auth_query_param, date_format, extra_query)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(config_id) DO UPDATE SET secret_enc = excluded.secret_enc, auth_query_param = excluded.auth_query_param,
      date_format = excluded.date_format, extra_query = excluded.extra_query, updated_at = CURRENT_TIMESTAMP`)
    .bind(configId, enc, s.auth_query_param, s.date_format, s.extra_query).run();
  return { key_saved: !!enc };
}

export async function clearAdapterKey(db, configId) {
  await db.prepare('UPDATE provider_adapter_settings SET secret_enc = NULL, updated_at = CURRENT_TIMESTAMP WHERE config_id = ?').bind(configId).run();
}

async function rowFor(db, id) {
  try { return await db.prepare('SELECT * FROM provider_adapter_settings WHERE config_id = ?').bind(id).first(); } catch { return null; }
}

// The config with its dashboard-managed settings merged in, ready for the adapter. The decrypted key is only ever held in memory.
export async function withAdapterSettings(env, config) {
  const row = env?.DB ? await rowFor(env.DB, config.id) : null;
  const req = env?.DB ? await loadAdapterRequest(env.DB, config.id) : null;
  if (req) config = { ...config, http_method: req.http_method, body_json: req.body_json, paging: req.paging, page_size: req.page_size };
  if (!row) return config;
  const managed = row.secret_enc ? await decryptSecret(env, row.secret_enc) : null;
  return { ...config, managed_secret: managed, auth_query_param: row.auth_query_param || null, date_format: row.date_format || 'iso', extra_query: row.extra_query || null };
}

// For the list: what is set up, never the key itself (only its last four characters).
export async function describeAdapterSettings(env, config) {
  const row = env?.DB ? await rowFor(env.DB, config.id) : null;
  let hint = null;
  let source = null;
  if (row?.secret_enc) {
    const v = await decryptSecret(env, row.secret_enc);
    source = v ? 'dashboard' : 'unreadable';
    if (v) hint = v.length > 8 ? `…${v.slice(-4)}` : '…set';
  } else if (config.credential_reference && config.credential_reference !== MANAGED_REF && typeof env?.[config.credential_reference] === 'string' && env[config.credential_reference]) {
    source = 'worker_secret';
  }
  const req = env?.DB ? await loadAdapterRequest(env.DB, config.id) : null;
  return { http_method: req?.http_method || 'GET', body_json: req?.body_json || null, paging: req?.paging || 'none', page_size: req?.page_size || 100, key_source: source, key_hint: hint, auth_query_param: row?.auth_query_param || null, date_format: row?.date_format || 'iso', extra_query: row?.extra_query || null };
}

// ── How the request is made (GET or POST with a JSON body, paging) ──
export function cleanRequest(input = {}) {
  const method = String(input.http_method || 'GET').toUpperCase();
  if (!['GET', 'POST'].includes(method)) throw new Error('Method must be GET or POST.');
  let body = input.body_json == null ? '' : (typeof input.body_json === 'string' ? input.body_json.trim() : JSON.stringify(input.body_json));
  if (body) {
    if (body.length > 2000) throw new Error('The request body is too long.');
    try { JSON.parse(body); } catch { throw new Error('The request body must be valid JSON.'); }
  }
  const paging = input.paging === 'page' ? 'page' : 'none';
  const size = Math.min(100, Math.max(1, parseInt(input.page_size, 10) || 100));
  return { http_method: method, body_json: body || null, paging, page_size: size };
}

export async function saveAdapterRequest(db, configId, input) {
  const r = cleanRequest(input);
  await db.prepare(`INSERT INTO provider_adapter_request (config_id, http_method, body_json, paging, page_size) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(config_id) DO UPDATE SET http_method = excluded.http_method, body_json = excluded.body_json, paging = excluded.paging, page_size = excluded.page_size, updated_at = CURRENT_TIMESTAMP`)
    .bind(configId, r.http_method, r.body_json, r.paging, r.page_size).run();
  return r;
}

export async function loadAdapterRequest(db, configId) {
  try { return await db.prepare('SELECT http_method, body_json, paging, page_size FROM provider_adapter_request WHERE config_id = ?').bind(configId).first(); } catch { return null; }
}
