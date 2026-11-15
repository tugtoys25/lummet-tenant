// Where a postback integration's secret comes from. A secret stored from the dashboard wins; otherwise the older arrangement, a Worker
// secret named by credential_reference, still works so existing integrations keep running.
import { encryptSecret, decryptSecret, generateSecret } from '../security/secret-box.js';

export const MANAGED = 'managed';

export async function getPostbackSecret(env, config) {
  if (env?.DB && config?.id != null) {
    try {
      const row = await env.DB.prepare('SELECT secret_enc FROM postback_secrets WHERE config_id = ?').bind(config.id).first();
      if (row) return await decryptSecret(env, row.secret_enc);
    } catch { /* table not migrated yet: fall through to the Worker secret */ }
  }
  const value = config?.credential_reference ? env?.[config.credential_reference] : null;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function setPostbackSecret(env, configId, secret = null) {
  const value = secret || generateSecret(16);
  const enc = await encryptSecret(env, value);
  await env.DB.prepare(`INSERT INTO postback_secrets (config_id, secret_enc) VALUES (?, ?)
    ON CONFLICT(config_id) DO UPDATE SET secret_enc = excluded.secret_enc, rotated_at = CURRENT_TIMESTAMP`).bind(configId, enc).run();
  return value;
}

export async function hasManagedSecret(db, configId) {
  try { return !!(await db.prepare('SELECT 1 AS x FROM postback_secrets WHERE config_id = ?').bind(configId).first()); } catch { return false; }
}

export async function managedSecretIds(db) {
  try { return new Set(((await db.prepare('SELECT config_id FROM postback_secrets').all()).results || []).map((r) => r.config_id)); } catch { return new Set(); }
}
