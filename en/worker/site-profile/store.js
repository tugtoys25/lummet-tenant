// ============================================================
// SITE PROFILE: storage (settings table, key "site_profile") + cache
// ============================================================
import { getCached, setCached, invalidate } from "../cache.js";
import { defaultProfile, normalizeProfile } from "./profile.js";
import { envFlag, resolveFlag, markSystemOff, systemIsOff, SYSTEM_KEY } from "./system-flag.js";

const KEY = "site_profile";
const ck = (host) => `site-profile:${String(host || "").toLowerCase()}`;
const TTL = 60; // seconds; save also deletes the key so edits apply immediately

// While the master switch is OFF the resolver hands out the Full platform, tagged so the dashboard can hide the Configuration UI.
export { systemIsOff };
const fullPlatform = () => markSystemOff(defaultProfile());
// The cache holds { p: <profile>, off: boolean } where off is what the settings key says (the environment variable is applied on
// every read, so changing it needs no cache flush). Older entries hold the bare profile and mean "not off".
const unpack = (hit) => (hit && typeof hit === "object" && "p" in hit ? { profile: normalizeProfile(hit.p), off: hit.off === true } : { profile: normalizeProfile(hit), off: false });

// Fail-open: any read problem returns the full default profile, so a D1/KV hiccup can never take pages offline.
// ONE D1 query on a cache miss (profile and master switch together), none on a cache hit, none when the environment variable says off.
export async function loadProfile(env, hostname) {
  const forced = envFlag(env); // true | false | null (null = no opinion, the settings key decides)
  if (forced === false) return fullPlatform();
  // Draft preview (signed-in editors only, set per request by the app worker): never cached, never stored.
  if (env && env.__preview && env.__preview.profile) return normalizeProfile(env.__preview.profile);
  try {
    const hit = await getCached(env, ck(hostname));
    if (hit) { const u = unpack(hit); return u.off && forced !== true ? fullPlatform() : u.profile; }
    if (!env?.DB) return defaultProfile();
    const rows = (await env.DB.prepare("SELECT key, value FROM settings WHERE key IN (?, ?)").bind(KEY, SYSTEM_KEY).all()).results || [];
    const val = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const profile = val[KEY] ? normalizeProfile(JSON.parse(val[KEY])) : defaultProfile();
    const off = resolveFlag(null, val[SYSTEM_KEY]).enabled === false;
    await setCached(env, ck(hostname), { p: profile, off }, TTL);
    return off && forced !== true ? fullPlatform() : profile;
  } catch { return defaultProfile(); }
}

export async function saveProfile(env, hostname, profile) {
  await env.DB.prepare("INSERT OR REPLACE INTO settings(key, value, updated_at) VALUES(?, ?, CURRENT_TIMESTAMP)").bind(KEY, JSON.stringify(profile)).run();
  await invalidate(env, ck(hostname)); // KV and this isolate's L1 copy (other isolates see the change within the 15 s L1 TTL)
}

// Drop the cached profile so a publish, rollback or master-switch flip is visible at once in this isolate (and in KV).
export async function invalidateProfile(env, hostname) {
  try { await invalidate(env, ck(hostname)); } catch { /* cache is best effort */ }
}
