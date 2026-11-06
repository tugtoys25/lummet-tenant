// ============================================================
// Keeps the older per-site setting `content_types_enabled` in step with the site profile.
//
// Two gates decide whether sportsbook / affiliate partners / custom types are reachable:
//   1. the site profile (content.sportsbook, content.partners, content.custom), and
//   2. the older `content_types_enabled` setting (all three default to OFF, see content-types.js).
// A page is served only when BOTH say yes. The "Full platform" profile has the capabilities on while the older
// setting is off, which is exactly how existing sites behave today, so Full is never touched here.
// A named preset that deliberately keeps a content type (for example "Sportsbook listing") must also switch the
// older setting on, otherwise the preset would apply and the pages would still answer 404.
//
// Rules: only turns the older setting ON (never off: the profile already hides what is switched off, and this
// keeps the change reversible); only for named presets other than "full"; only for the types the profile keeps.
// Statements are returned so the caller can run them in the same batch as the profile write.
// ============================================================
import { isEnabled } from "./profile.js";
import { PRESETS } from "./registry.js";
import { clearContentTypeEnablementCache } from "../content-types.js";

// legacy content type -> profile capability
export const LEGACY_TYPE_CAPABILITY = { sportsbook: "content.sportsbook", affiliate_partner: "content.partners", custom: "content.custom" };

export function legacyTypesToEnable(profile) {
  if (!profile || typeof profile !== "object") return [];
  const id = profile.preset;
  if (id === "full" || !Object.prototype.hasOwnProperty.call(PRESETS, id)) return [];
  if (profile.modules?.content !== true) return [];
  return Object.keys(LEGACY_TYPE_CAPABILITY).filter((t) => isEnabled(profile, LEGACY_TYPE_CAPABILITY[t]));
}

export function contentTypeStatements(env, profile) {
  const types = legacyTypesToEnable(profile);
  if (!types.length) return [];
  const initial = JSON.stringify(Object.fromEntries(types.map((t) => [t, true])));
  // types come from a fixed list above, never from input, so interpolating them is safe.
  const merged = types.reduce((expr, t) => `json_set(${expr}, '$.${t}', json('true'))`, "CASE WHEN json_valid(settings.value) THEN settings.value ELSE '{}' END");
  return [env.DB.prepare(
    `INSERT INTO settings(key, value, updated_at) VALUES('content_types_enabled', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = ${merged}, updated_at = CURRENT_TIMESTAMP`,
  ).bind(initial)];
}

// For write paths that are not part of a batch (direct save, unversioned setup). Best effort: a failure here must
// never undo a profile save that already succeeded.
export async function syncContentTypes(env, profile) {
  try {
    const st = contentTypeStatements(env, profile);
    if (st.length) await env.DB.batch(st);
  } catch (e) { console.error("content type sync failed:", e && e.message); }
  clearContentTypeEnablementCache();
}
