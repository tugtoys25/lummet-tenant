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
  return { key_source: source, key_hint: hint, auth_query_param: row?.auth_query_param || null, date_format: row?.date_format || 'iso', extra_query: row?.extra_query || null };
}
