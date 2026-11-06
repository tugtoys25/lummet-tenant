// ============================================================
// Per custom type switches (Phase 11 / T2): the link between the site profile and the custom_content_types table.
// The profile itself is pure and only knows the id shape (content.custom.<slug>); this file reads the live types.
// Every function fails open: a read problem means "no custom types known", never an error for the caller.
// ============================================================
import { isCustomTypeId, customTypeId } from "./profile.js";

// [{ slug, label, id }] for the Configuration screen. Only types whose slug can be switched individually are listed.
export async function listCustomTypes(env) {
  try {
    const rows = (await env.DB.prepare("SELECT slug, label FROM custom_content_types ORDER BY label ASC").all()).results || [];
    return rows.map((r) => ({ slug: String(r.slug), label: String(r.label || r.slug), id: customTypeId(r.slug) })).filter((t) => t.id);
  } catch { return []; }
}

// Removes stored choices for custom types that no longer exist (mutates and returns the profile). If the table cannot be
// read nothing is removed, so a read problem never wipes a saved choice.
export async function dropUnknownCustomTypes(env, profile) {
  const ids = Object.keys(profile?.pages || {}).filter(isCustomTypeId);
  if (!ids.length) return profile;
  try {
    const known = new Set(((await env.DB.prepare("SELECT slug FROM custom_content_types").all()).results || []).map((r) => customTypeId(r.slug)));
    for (const id of ids) if (!known.has(id)) delete profile.pages[id];
  } catch { /* keep everything */ }
  return profile;
}
