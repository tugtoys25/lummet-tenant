// Content-type enablement — single source of truth for whether a
// given generic content type (sportsbook / affiliate_partner /
// custom) is turned on for this environment/tenant.
//
// Backed by the `content_types_enabled` settings row seeded in
// migration 0051 (Phase 2), defaulted to casino-only on every
// existing environment. Every touchpoint listed in the Phase 2
// report §8 (routing, listings, search, admin creation, related
// content, sitemaps, SEO, APIs) should call isContentTypeEnabled()
// rather than re-reading/parsing the setting itself, so there is
// exactly one place that knows the default and the parsing rules.

import { getSetting } from "./database/settings.js";

const DEFAULT_ENABLEMENT = {
  casino: true,
  sportsbook: false,
  affiliate_partner: false,
  custom: false,
};

let _cache = null; // per-isolate memo; settings changes take effect on the next cold start / cache clear below

/**
 * Returns the full enablement map for this environment, e.g.
 * { casino: true, sportsbook: true, affiliate_partner: false, custom: false }.
 * Casino is always treated as enabled regardless of what's stored --
 * it predates this system entirely and must never be toggleable off
 * by a missing/malformed settings row.
 */
export async function getContentTypeEnablement(env) {
  if (_cache) return _cache;
  try {
    const raw = await getSetting(env.DB, "content_types_enabled");
    const parsed = raw ? JSON.parse(raw) : {};
    _cache = { ...DEFAULT_ENABLEMENT, ...parsed, casino: true };
  } catch (e) {
    console.error("content_types_enabled setting is malformed, falling back to casino-only:", e.message);
    _cache = { ...DEFAULT_ENABLEMENT };
  }
  return _cache;
}

export async function isContentTypeEnabled(env, contentType) {
  const map = await getContentTypeEnablement(env);
  return !!map[contentType];
}

/**
 * Admin-facing write path for the settings UI (Phase 9). Merges
 * `updates` into the current map -- casino is always forced back to
 * true even if a caller tries to disable it, since it predates this
 * system and must never be toggleable off. Clears the in-isolate
 * cache so the change is visible on the very next request in this
 * isolate, not just after a cold start.
 */
export async function updateContentTypeEnablement(env, updates) {
  const current = await getContentTypeEnablement(env);
  const merged = { ...current, ...updates, casino: true };
  await env.DB.prepare(`
    INSERT INTO settings (key, value) VALUES ('content_types_enabled', ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `).bind(JSON.stringify(merged)).run();
  clearContentTypeEnablementCache();
  return merged;
}

/** Call after an admin write to content_types_enabled so this isolate picks up the change immediately. */
export function clearContentTypeEnablementCache() {
  _cache = null;
}
