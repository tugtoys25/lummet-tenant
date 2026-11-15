// Encrypts the few secrets a site keeps for itself (postback secrets, tracker and ad-platform tokens) so they can be managed from the
// dashboard instead of as Worker secrets. AES-GCM; the key is derived (HKDF-SHA-256) from a secret the Worker already has, so nothing
// extra has to be configured. Without any such secret (local tests, odd setups) a random per-site key stored in the database is used.
//
// This protects the stored values from a casual database read or export. Anyone who can run code in the Worker or read both the
// database and its Worker secrets can still decrypt them, which is true of any secret the site must be able to use.

const INFO = new TextEncoder().encode('lummet-site-secrets-v1');
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyMaterial(env) {
  const shared = env?.SUPER_API_SECRET || env?.POSTBACK_SECRETS_KEY;
  if (shared) return { raw: new TextEncoder().encode(String(shared)), source: 'env' };
  if (!env?.DB) throw new Error('No encryption key available.');
  let row = await env.DB.prepare('SELECT key_b64 FROM site_secret_key WHERE id = 1').first();
  if (!row) {
    const fresh = b64(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare('INSERT OR IGNORE INTO site_secret_key (id, key_b64) VALUES (1, ?)').bind(fresh).run();
    row = await env.DB.prepare('SELECT key_b64 FROM site_secret_key WHERE id = 1').first();
  }
  return { raw: unb64(row.key_b64), source: 'db' };
}

async function aesKey(env) {
  const { raw } = await keyMaterial(env);
  const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: INFO }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(env, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(String(plaintext)));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

// Returns the plaintext, or null when the value cannot be decrypted (wrong key, damaged data). Never throws for bad input.
export async function decryptSecret(env, stored) {
  try {
    const [v, iv, ct] = String(stored || '').split('.');
    if (v !== 'v1' || !iv || !ct) return null;
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(env), unb64(ct));
    return new TextDecoder().decode(pt);
  } catch { return null; }
}

export function generateSecret(bytes = 16) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
}
