// Postback authentication -- brief §5.
//
// Resolves credential_reference to an actual secret ONLY here, at
// verification time, exactly like the affiliate-accounts.js header
// comment promises: `env[credential_reference]` is a Cloudflare
// Worker secret binding name (set via `wrangler secret put <name>`),
// never a plaintext value stored in D1. If a config's
// credential_reference doesn't resolve to a bound secret, verification
// fails closed (never treated as "no auth required").
//
// Every function here returns a plain result object and never throws
// for an authentication failure -- only for a genuine programming
// error (e.g. an unknown auth_method already validated at config-save
// time in postback-configs.js). This keeps the HTTP handler's job to
// a single check, and keeps failure reasons safe to log (never a
// secret, never a full signature).


import { getPostbackSecret } from './secrets.js';

function timingSafeEqual(a, b) {
  // Cloudflare Workers / Node both expose crypto.subtle but not a
  // built-in timing-safe string compare -- do the XOR-accumulate
  // comparison by hand so a mismatch never short-circuits early.
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) {
    // Still walk a fixed-length comparison against itself so the
    // early return above is the only length-dependent timing signal
    // (unavoidable without padding to a fixed max length, and
    // length alone reveals far less than a byte-by-byte comparison).
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('');
}

function checkTimestamp(rawParams, config) {
  if (!config.timestamp_param) return { valid: true }; // not required by this config
  const raw = rawParams[config.timestamp_param];
  if (!raw) return { valid: false, reason: 'timestamp_missing' };

  const sentMs = /^\d+$/.test(String(raw)) ? Number(raw) * (String(raw).length <= 10 ? 1000 : 1) : Date.parse(raw);
  if (!Number.isFinite(sentMs)) return { valid: false, reason: 'timestamp_unparseable' };

  const toleranceMs = (config.timestamp_tolerance_seconds ?? 300) * 1000;
  if (Math.abs(Date.now() - sentMs) > toleranceMs) {
    return { valid: false, reason: 'timestamp_out_of_tolerance' };
  }
  return { valid: true };
}

// The string a GET signature covers: key=value pairs sorted by key, joined with '&', signature parameter excluded.
export function canonicalQuery(rawParams, signatureParam) {
  return Object.keys(rawParams)
    .filter(k => k !== signatureParam)
    .sort()
    .map(k => `${k}=${rawParams[k]}`)
    .join('&');
}

function ipv4ToInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function ipMatches(entry, ip) {
  if (!entry.includes('/')) return entry === ip;
  const [base, bitsRaw] = entry.split('/');
  const bits = Number(bitsRaw);
  const a = ipv4ToInt(base), b = ipv4ToInt(ip);
  if (a == null || b == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (0xFFFFFFFF << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}

export function checkIpAllowlist(config, sourceIp) {
  if (!config.allowed_ips) return { valid: true };
  let allowed;
  try {
    allowed = JSON.parse(config.allowed_ips);
  } catch {
    // An allowlist that cannot be read must not silently mean "allow everyone" -- fail closed (config validation rejects bad JSON at save time).
    return { valid: false, reason: 'ip_allowlist_invalid' };
  }
  if (!Array.isArray(allowed) || allowed.length === 0) return { valid: true };
  if (!sourceIp) return { valid: false, reason: 'ip_unknown' };
  // Exact addresses and IPv4 CIDR ranges ("203.0.113.0/24") are both accepted.
  return allowed.some((entry) => ipMatches(String(entry).trim(), sourceIp))
    ? { valid: true }
    : { valid: false, reason: 'ip_not_allowlisted' };
}

/**
 * Verifies a postback request against its config. `rawParams` is the
 * merged query-string + parsed-body params (whichever the provider
 * put the signature/timestamp in). `rawBody` is the exact raw request
 * body text, needed for HMAC-over-body verification.
 *
 * Returns { valid: true } or { valid: false, reason: '<safe-to-log-code>' }.
 * `reason` is always a fixed code, never interpolated request data --
 * never log secrets, and never echo back enough detail to help an
 * attacker iterate on a forged signature (brief §5).
 */
export async function verifyPostbackAuth(env, config, { rawParams, rawBody, sourceIp }) {
  const ipCheck = checkIpAllowlist(config, sourceIp);
  if (!ipCheck.valid) return ipCheck;

  const tsCheck = checkTimestamp(rawParams, config);
  if (!tsCheck.valid) return tsCheck;

  const secret = await getPostbackSecret(env, config);
  if (!secret) return { valid: false, reason: 'credential_not_configured' };

  switch (config.auth_method) {
    case 'shared_secret': {
      const provided = config.signature_param ? rawParams[config.signature_param] : null;
      if (!provided) return { valid: false, reason: 'secret_param_missing' };
      return timingSafeEqual(provided, secret)
        ? { valid: true }
        : { valid: false, reason: 'secret_mismatch' };
    }

    case 'api_key': {
      const provided = config.signature_param ? rawParams[config.signature_param] : null;
      if (!provided) return { valid: false, reason: 'api_key_missing' };
      return timingSafeEqual(provided, secret)
        ? { valid: true }
        : { valid: false, reason: 'api_key_mismatch' };
    }

    case 'hmac_sha256': {
      const provided = config.signature_param ? rawParams[config.signature_param] : null;
      if (!provided) return { valid: false, reason: 'signature_missing' };
      // POST with a body: sign the raw body. GET (no body): sign the canonical query string -- every parameter except the signature,
      // sorted by key -- so the signature is bound to the actual parameters (click id, amount ...) and a captured one cannot be reused
      // with different values. Older integrations that signed only the timestamp parameter still verify, but only when a
      // timestamp parameter is configured (the replay window then limits it); with none configured that fallback no longer exists.
      const hasBody = !!(rawBody && rawBody.length > 0);
      const message = hasBody ? rawBody : canonicalQuery(rawParams, config.signature_param);
      const expected = await hmacHex(secret, message);
      if (timingSafeEqual(provided.toLowerCase(), expected)) return { valid: true };
      if (!hasBody && config.timestamp_param && rawParams[config.timestamp_param]) {
        const legacy = await hmacHex(secret, String(rawParams[config.timestamp_param]));
        if (timingSafeEqual(provided.toLowerCase(), legacy)) return { valid: true };
      }
      return { valid: false, reason: 'signature_mismatch' };
    }

    case 'signed_query': {
      const provided = config.signature_param ? rawParams[config.signature_param] : null;
      if (!provided) return { valid: false, reason: 'signature_missing' };
      // Sign the canonical query string (all params except the
      // signature itself), sorted by key so the provider and this
      // verifier always agree on byte order regardless of how the
      // request arrived.
      const canonical = canonicalQuery(rawParams, config.signature_param);
      const expected = await hmacHex(secret, canonical);
      return timingSafeEqual(provided.toLowerCase(), expected)
        ? { valid: true }
        : { valid: false, reason: 'signature_mismatch' };
    }

    default:
      // Unreachable if postback-configs.js validation ran at save
      // time, but fail closed rather than assume.
      return { valid: false, reason: 'unknown_auth_method' };
  }
}
