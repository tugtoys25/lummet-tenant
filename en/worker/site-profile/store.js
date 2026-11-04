// ============================================================
// SITE PROFILE: storage (settings table, key "site_profile") + cache
// ============================================================
import { getCached, setCached, deleteCached } from "../cache.js";
import { defaultProfile, normalizeProfile } from "./profile.js";

const KEY = "site_profile";
const ck = (host) => `site-profile:${String(host || "").toLowerCase()}`;
const TTL = 60; // seconds; save also deletes the key so edits apply immediately

// Fail-open: any read problem returns the full default profile, so a D1/KV hiccup can never take pages offline.
export async function loadProfile(env, hostname) {
  try {
    const hit = await getCached(env, ck(hostname));
    if (hit) return normalizeProfile(hit);
    if (!env?.DB) return defaultProfile();
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(KEY).first();
    const profile = row?.value ? normalizeProfile(JSON.parse(row.value)) : defaultProfile();
    await setCached(env, ck(hostname), profile, TTL);
    return profile;
  } catch { return defaultProfile(); }
}

export async function saveProfile(env, hostname, profile) {
  await env.DB.prepare("INSERT OR REPLACE INTO settings(key, value, updated_at) VALUES(?, ?, CURRENT_TIMESTAMP)").bind(KEY, JSON.stringify(profile)).run();
  await deleteCached(env, ck(hostname));
}
