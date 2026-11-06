// ============================================================
// SITE PROFILE: provisioning and setup state (Phase 9)
//
// A new site is created by the control plane with a chosen preset, or as a copy of another site's configuration.
// The control plane calls the Super API (worker/super/handlers/site-setup.js), which calls provisionSite() here.
// Everything goes through the same draft -> publish machinery as an owner's own change, so the first setup is a
// numbered, audited, reversible version, never a private shortcut.
//
// Setup state lives in three plain settings rows:
//   site_setup_state   "pending" (the owner has not confirmed the setup yet) | "complete"
//   site_setup_source  "new" (provisioned, nothing applied yet) | "preset" | "clone" | "migrated" (a site that existed before this feature) | "owner"
//   site_setup_preset  the preset id that was applied (preset source only)
//   site_setup_from    the host the configuration was copied from (clone source only)
// A site with no state row is treated as complete: the wizard only ever appears on a site that was provisioned for it.
// ============================================================
import { PRESETS } from "./registry.js";
import { applyPreset, validateProfile } from "./profile.js";
import { invalidateProfile, saveProfile } from "./store.js";
import { syncContentTypes } from "./content-sync.js";
import { parseEnvelope, applyImport, planImport, buildExport, recordTransfer } from "./transfer.js";
import { tablesReady, saveDraft, publishDraft, discardDraft, getDraft, NEEDS_MIGRATION } from "./versions.js";

export const SETUP_STATE = "site_setup_state";
export const SETUP_SOURCE = "site_setup_source";
export const SETUP_PRESET = "site_setup_preset";
export const SETUP_FROM = "site_setup_from";
const KEYS = [SETUP_STATE, SETUP_SOURCE, SETUP_PRESET, SETUP_FROM];

// The actor named in the history of the first version.
export const PROVISIONING_ACTOR = Object.freeze({ username: "provisioning", role: "admin" });

const str = (v) => (v == null ? "" : String(v));
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** The presets a site can be created with: id, label and help, in the order the registry lists them. */
export function presetChoices() {
  return Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label, help: p.help }));
}

async function readKeys(env) {
  const out = {};
  try {
    const rows = (await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${KEYS.map(() => "?").join(",")})`).bind(...KEYS).all()).results || [];
    for (const r of rows) out[r.key] = str(r.value);
  } catch { /* a read problem means "no state": the site behaves as complete */ }
  return out;
}

/** { state, pending, source, preset, from }. Never throws. A site with no state is complete. */
export async function getSetup(env) {
  const k = await readKeys(env);
  const state = k[SETUP_STATE] === "pending" ? "pending" : "complete";
  return { state, pending: state === "pending", known: SETUP_STATE in k, source: k[SETUP_SOURCE] || null, preset: k[SETUP_PRESET] || null, from: k[SETUP_FROM] || null };
}

const put = (env, key, value) => env.DB.prepare("INSERT OR REPLACE INTO settings(key, value, updated_at) VALUES(?, ?, CURRENT_TIMESTAMP)").bind(key, value);

/** Mark the setup as awaiting the owner. Used by provisioning (and by the control plane's first-deploy seed). */
async function writeSetup(env, { state, source, preset = "", from = "" }) {
  await env.DB.batch([put(env, SETUP_STATE, state), put(env, SETUP_SOURCE, source), put(env, SETUP_PRESET, preset), put(env, SETUP_FROM, from)]);
}

/** The owner has looked at the setup and is happy with it (or has changed it). Ends the wizard. */
export async function completeSetup(env, user) {
  const cur = await getSetup(env);
  if (!cur.pending) return { ok: true, alreadyComplete: true, setup: cur };
  await env.DB.batch([put(env, SETUP_STATE, "complete"), put(env, SETUP_SOURCE, "owner")]);
  await recordTransfer(env, user, "setup.complete", `Setup confirmed${cur.preset ? ` (started from the “${PRESETS[cur.preset]?.label || cur.preset}” setup type)` : cur.from ? ` (started as a copy of ${cur.from})` : ""}.`);
  return { ok: true, setup: await getSetup(env) };
}

// Has anyone but provisioning changed the configuration? A draft, or a version that is not the baseline and not ours.
async function ownerActivity(env) {
  if (!(await tablesReady(env))) return false;
  if (await getDraft(env)) return true;
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM config_versions WHERE source <> 'baseline' AND COALESCE(author, '') <> ?").bind(PROVISIONING_ACTOR.username).first();
  return Number(r?.n || 0) > 0;
}

const done = (extra) => ({ ok: true, ...extra });
const refuse = (status, code, error, extra = {}) => ({ ok: false, status, code, error, ...extra });

/**
 * Apply the first configuration of a new site.
 *   input = { preset } | { envelope, sections? }       (exactly one of the two)
 *   host  = this site's hostname (cache keys, "same site" check)
 * Returns { ok, applied, unchanged?, alreadyApplied?, version?, summary?, setup } or { ok: false, status, code, error }.
 * Safe to repeat: the same request on a site that already has it answers "alreadyApplied". A different request on a site that
 * was already set up, or one whose owner has started changing things, is refused instead of overwriting their work.
 */
export async function provisionSite(env, host, input) {
  const body = isObj(input) ? input : {};
  const hasPreset = body.preset !== undefined && body.preset !== null && body.preset !== "";
  const hasEnvelope = body.envelope !== undefined && body.envelope !== null;
  if (hasPreset === hasEnvelope) return refuse(422, "choose_one", "Send either a preset or a configuration to copy, not both and not neither.");

  const cur = await getSetup(env);
  if (hasPreset && typeof body.preset === "string" && cur.source === "preset" && cur.preset === body.preset && cur.pending) return done({ alreadyApplied: true, setup: cur });
  if (!cur.pending) return refuse(409, "setup_not_pending", "This site's setup is already complete, so it will not be replaced.", { setup: cur });
  if (await ownerActivity(env)) return refuse(409, "already_configured", "This site's configuration has already been changed by its owner, so it will not be replaced.", { setup: cur });

  // ---- preset ----
  if (hasPreset) {
    const id = str(body.preset);
    if (!Object.prototype.hasOwnProperty.call(PRESETS, id)) return refuse(422, "unknown_preset", `This site does not know the setup type “${id.slice(0, 40)}”.`, { presets: presetChoices().map((p) => p.id) });
    const profile = applyPreset(id);
    const v = validateProfile(profile);
    if (!v.ok) return refuse(422, "invalid_preset", `The setup type “${id}” is not consistent: ${v.errors.join(" ")}`);
    let version = null, unchanged = false, summary = null;
    if (await tablesReady(env)) {
      const saved = await saveDraft(env, PROVISIONING_ACTOR, { profile: v.profile });
      if (saved.error || saved.errors || saved.conflict) return refuse(saved.status || 422, "draft_failed", saved.error || (saved.errors || []).join(" ") || "The first setup could not be prepared.");
      const pub = await publishDraft(env, host, PROVISIONING_ACTOR, { note: `Initial setup: ${PRESETS[id].label}` });
      if (pub.empty) { unchanged = true; await discardDraft(env, PROVISIONING_ACTOR); }
      else if (!pub.published) return refuse(pub.status || 409, "publish_failed", pub.error || (pub.errors || []).join(" ") || "The first setup could not be published.");
      else { version = pub.version; summary = pub.summary; }
    } else {
      // Versioning is not set up on this site: the preset still applies, it just is not recorded as a version.
      await saveProfile(env, host, v.profile);
      await syncContentTypes(env, v.profile);
    }
    await writeSetup(env, { state: "pending", source: "preset", preset: id });
    await recordTransfer(env, PROVISIONING_ACTOR, "provision.preset", `Site created from the “${PRESETS[id].label}” setup type.${summary ? ` ${summary}` : ""}`);
    await invalidateProfile(env, host);
    return done({ applied: true, unchanged, version, summary, setup: await getSetup(env) });
  }

  // ---- copy of another site's configuration ----
  if (!(await tablesReady(env))) return refuse(503, "needs_migration", NEEDS_MIGRATION);
  const parsed = await parseEnvelope(body.envelope);
  if (!parsed.ok) return refuse(422, "invalid_envelope", parsed.errors.join(" "), { errors: parsed.errors });
  const sections = Array.isArray(body.sections) ? body.sections.map(str) : undefined;
  const plan = await planImport(env, parsed, { host, sections });
  const from = str(parsed.parsed.meta.host);
  let version = null, summary = null, unchanged = false;
  if (!plan.report.hasChanges) unchanged = true;
  else {
    const imp = await applyImport(env, PROVISIONING_ACTOR, parsed, { host, sections });
    if (!imp.imported) return refuse(imp.status || 422, "import_failed", imp.error || (imp.errors || []).join(" ") || "The configuration could not be copied.");
    const pub = await publishDraft(env, host, PROVISIONING_ACTOR, { note: `Initial setup: copy of ${from || "another site"}` });
    if (pub.empty) { unchanged = true; await discardDraft(env, PROVISIONING_ACTOR); }
    else if (!pub.published) { await discardDraft(env, PROVISIONING_ACTOR); return refuse(pub.status || 409, "publish_failed", pub.error || (pub.errors || []).join(" ") || "The copied configuration could not be published."); }
    else { version = pub.version; summary = pub.summary; }
  }
  await writeSetup(env, { state: "pending", source: "clone", from: from.slice(0, 253) });
  await recordTransfer(env, PROVISIONING_ACTOR, "provision.clone", `Site created as a copy of ${from || "another site"}.${summary ? ` ${summary}` : ""}`);
  await invalidateProfile(env, host);
  return done({ applied: true, unchanged, version, summary, skipped: plan.report.skippedCount, setup: await getSetup(env) });
}

/** What this site hands to the control plane so another site can be created as a copy of it. */
export async function exportForClone(env, host, sections) {
  const wanted = Array.isArray(sections) && sections.length ? sections.map(str) : undefined;
  const r = await buildExport(env, { host, from: "live", sections: wanted, name: `Copy of ${host || "a site"}` });
  return { envelope: r.envelope, included: r.included, notes: r.notes };
}
