// ============================================================
// SITE PROFILE (Phase 6): draft, numbered versions, rollback, audit
// ============================================================
// The configuration of a site is one DOCUMENT: { v, profile, settings, rows? }.
//   profile  = the site profile (modules, pages, features, homepage, removed-page mode, header)
//   settings = every look-and-feel key owned by a settings group (theme, header, hero, footer, ...)
//   rows     = (Phase 6D) menu links, page search listings, SEO records, component settings and placements,
//              see rows.js. Optional per set: a version saved before 6D has none, and restoring it leaves rows alone.
//
// Draft:    one working copy per site (table config_draft). It remembers the document it started from
//           (base_document), so publishing is a three-way merge: only what the editor actually changed is
//           applied on top of whatever is live now. A change made elsewhere in the meantime is never overwritten
//           unless both sides changed the very same item (that is reported as a conflict).
// Versions: every configuration that goes live gets a number (table config_versions): publish, rollback,
//           and direct saves made through the older endpoints. Version 1 is the "baseline": what was live
//           before the first versioned change, so even that can be restored.
// Audit:    config_audit records who did what and when, with the list of changes. Never edited or deleted.
//
// Failure behaviour: if the Phase 6 tables are missing (migration 0009 not run) nothing here throws into a
// request; tablesReady() is false, the API says so, and direct saves keep working unrecorded.
import { MODULES, FEATURES, PAGE_IDS, FEATURE_IDS } from "./registry.js";
import { defaultProfile, normalizeProfile, validateProfile } from "./profile.js";
import { allFields, groupOf, ownedKeys, validateSettingsInput, GROUPS } from "./settings-groups.js";
import { contentTypeStatements } from "./content-sync.js";
import { clearContentTypeEnablementCache } from "../content-types.js";
import { invalidateProfile } from "./store.js";
import { previewChange } from "./guidance.js";
import { loadFacts } from "./facts.js";
import { deleteCached, CACHE_KEYS, invalidateNav } from "../cache.js";
import { normalizeRows, readLiveRows, diffRows, mergeRows, applyRowsPatch, validateRowSets, allocateKeys, rowStatements, rowSetsManifest, SET_IDS } from "./rows.js";

export const DOC_VERSION = 2;
export const MAX_DOC_BYTES = 700 * 1024;
export const MAX_NOTE = 200;
export const PAGE_LIMIT_MAX = 100;
const STICKY = "site_header_sticky";
const SHORT = 160;

// ---------- people and permissions ----------
export function actorOf(user) {
  if (!user) return "unknown";
  return String(user.email || user.username || (user.user_id != null ? `user#${user.user_id}` : "unknown")).slice(0, 120);
}
// Staff roles only. The role named "viewer" is NOT staff: it is what every visitor who registers on the public site
// receives, so it must never see the configuration, its history or the audit log (which names staff by email).
const RANK = { editor: 2, admin: 3 };
// View the configuration, its history and the activity log; edit the draft; preview it: editor and up.
// Publish, roll back, discard: admin.
export function permissionsFor(user) {
  const r = RANK[user?.role] || 0;
  return { view: r >= 2, editDraft: r >= 2, preview: r >= 2, publish: r >= 3, rollback: r >= 3, discard: r >= 3 };
}

// ---------- availability ----------
const readyFor = new WeakSet();
export async function tablesReady(env) {
  const db = env?.DB;
  if (!db) return false;
  if (readyFor.has(db)) return true;
  try {
    await db.prepare("SELECT 1 FROM config_versions LIMIT 1").first();
    await db.prepare("SELECT 1 FROM config_draft LIMIT 1").first();
    await db.prepare("SELECT 1 FROM config_audit LIMIT 1").first();
    readyFor.add(db);
    return true;
  } catch { return false; }
}
export const NEEDS_MIGRATION = "Versioning needs database migration 0009_config_versions.sql. Run it, then reload this page.";

// ---------- documents ----------
const str = (v) => (v == null ? "" : String(v));

// Canonical form: profile normalised, settings limited to owned keys and stored as strings, stickiness in step.
export function normalizeDocument(input) {
  const owned = ownedKeys();
  const profile = normalizeProfile(input?.profile);
  const settings = {};
  if (input?.settings && typeof input.settings === "object") {
    for (const k of Object.keys(input.settings).sort()) if (owned.has(k) && input.settings[k] != null) settings[k] = str(input.settings[k]);
  }
  if (STICKY in settings) profile.header.sticky = settings[STICKY] === "1";
  else settings[STICKY] = profile.header.sticky ? "1" : "0";
  const doc = { v: DOC_VERSION, profile, settings };
  const rows = normalizeRows(input?.rows);
  if (Object.keys(rows).length) doc.rows = rows;
  return doc;
}
const withoutRows = (doc) => { const { rows, ...rest } = doc; return rest; };

export async function readLiveDocument(env) {
  const db = env.DB;
  let profileRaw = null;
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'site_profile'").first();
  if (row?.value) { try { profileRaw = JSON.parse(row.value); } catch { profileRaw = null; } }
  const rows = (await db.prepare("SELECT key, value FROM settings").all()).results || [];
  const owned = ownedKeys();
  const settings = {};
  for (const r of rows) if (owned.has(r.key)) settings[r.key] = str(r.value);
  const live = await readLiveRows(env);
  return normalizeDocument({ profile: profileRaw, settings, rows: live.rows });
}
// Which row sets cannot be versioned on this site right now, and why (shown on the screen).
export async function skippedRowSets(env) { try { return (await readLiveRows(env)).skipped; } catch { return []; } }

export const sameDocument = (a, b) => JSON.stringify(normalizeDocument(a)) === JSON.stringify(normalizeDocument(b));

// ---------- flatten the profile to comparable leaves ----------
const PAGE_LABEL = (() => {
  const m = {};
  for (const [mk, mod] of Object.entries(MODULES)) for (const [pk, pg] of Object.entries(mod.pages || {})) m[`${mk}.${pk}`] = `${mod.label}: ${pg.label}`;
  return m;
})();

function flatProfile(p) {
  const o = { preset: p.preset, homepage: p.homepage, landing: p.landing, "disabled.mode": p.disabled.mode, "disabled.redirectTo": p.disabled.redirectTo || "", "header.autoPrune": p.header.autoPrune !== false };
  for (const k of Object.keys(MODULES)) o[`modules.${k}`] = p.modules[k] !== false;
  for (const id of PAGE_IDS) o[`pages.${id}`] = p.pages[id] !== false;
  for (const id of FEATURE_IDS) o[`features.${id}`] = p.features[id] !== false;
  return o;
}
function unflatProfile(o, sticky) {
  const p = defaultProfile();
  p.preset = o.preset; p.homepage = o.homepage; p.landing = o.landing;
  p.disabled = { mode: o["disabled.mode"], redirectTo: o["disabled.redirectTo"] || "" };
  p.header = { sticky, autoPrune: o["header.autoPrune"] };
  for (const k of Object.keys(MODULES)) p.modules[k] = o[`modules.${k}`] !== false;
  for (const id of PAGE_IDS) if (o[`pages.${id}`] === false) p.pages[id] = false;
  for (const id of FEATURE_IDS) if (o[`features.${id}`] === false) p.features[id] = false;
  return p;
}

const FIXED_LABEL = {
  preset: "Setup type", homepage: "Standard homepage", landing: "Landing page", "disabled.mode": "Removed pages behave as",
  "disabled.redirectTo": "Removed pages redirect to", "header.autoPrune": "Hide links to disabled modules",
};
function leafLabel(key) {
  if (FIXED_LABEL[key]) return { label: FIXED_LABEL[key], area: "Structure" };
  if (key.startsWith("modules.")) return { label: MODULES[key.slice(8)]?.label || key, area: "Modules" };
  if (key.startsWith("pages.")) return { label: PAGE_LABEL[key.slice(6)] || key, area: "Pages" };
  if (key.startsWith("features.")) return { label: FEATURES[key.slice(9)]?.label || key, area: "Tools & features" };
  return { label: key, area: "Structure" };
}
const fieldIndex = (() => { let m = null; return () => (m ||= new Map(allFields().map((f) => [f.key, f]))); })();
const groupLabel = (id) => GROUPS.find((g) => g.id === id)?.label || "Look and feel";
function showLeaf(key, v) {
  if (typeof v === "boolean") return v ? "on" : "off";
  const s = str(v);
  return s === "" ? "(empty)" : s.length > SHORT ? s.slice(0, SHORT) + "…" : s;
}

// ---------- diff ----------
// Human list of what differs between two documents: [{ area, key, label, from, to }].
export function diffDocuments(a, b) {
  const A = normalizeDocument(a), B = normalizeDocument(b);
  const changes = [];
  const fa = flatProfile(A.profile), fb = flatProfile(B.profile);
  for (const k of Object.keys(fb)) {
    if (fa[k] === fb[k]) continue;
    const { label, area } = leafLabel(k);
    changes.push({ area, key: k, label, from: showLeaf(k, fa[k]), to: showLeaf(k, fb[k]) });
  }
  const keys = new Set([...Object.keys(A.settings), ...Object.keys(B.settings)]);
  for (const k of [...keys].sort()) {
    const x = str(A.settings[k]), y = str(B.settings[k]);
    if (x === y) continue;
    const f = fieldIndex().get(k);
    const gid = f?.group || groupOf(k);
    changes.push({ area: groupLabel(gid), key: k, label: f?.label || k, from: showLeaf(k, x), to: showLeaf(k, y) });
  }
  changes.push(...diffRows(A.rows, B.rows));
  return changes;
}

export function summarizeChanges(changes) {
  if (!changes.length) return "No changes";
  const by = new Map();
  for (const c of changes) by.set(c.area, (by.get(c.area) || 0) + 1);
  const parts = [...by.entries()].slice(0, 4).map(([area, n]) => `${n} in ${area}`);
  const more = by.size > 4 ? `, ${by.size - 4} more areas` : "";
  return `${changes.length} change${changes.length === 1 ? "" : "s"}: ${parts.join(", ")}${more}`;
}

// ---------- three-way merge ----------
// base = where the draft started, mine = the draft, theirs = what is live now.
// A leaf only the editor changed is taken from the draft; a leaf only someone else changed stays as live has it;
// a leaf both changed to different values is a conflict ("mine" or "live" decides, default mine).
export function mergeDocuments(base, mine, theirs, prefer = "mine") {
  const B = normalizeDocument(base), M = normalizeDocument(mine), T = normalizeDocument(theirs);
  const conflicts = [];
  const pick = (key, b, m, t, label, area) => {
    if (m === b) return t;            // editor did not touch it: keep live
    if (t === b || t === m) return m; // only the editor changed it, or both agree
    conflicts.push({ key, label, area, base: showLeaf(key, b), mine: showLeaf(key, m), live: showLeaf(key, t) });
    return prefer === "live" ? t : m;
  };
  const fb = flatProfile(B.profile), fm = flatProfile(M.profile), ft = flatProfile(T.profile);
  const merged = {};
  for (const k of Object.keys(fb)) { const { label, area } = leafLabel(k); merged[k] = pick(k, fb[k], fm[k], ft[k], label, area); }
  const settings = {};
  const keys = new Set([...Object.keys(B.settings), ...Object.keys(M.settings), ...Object.keys(T.settings)]);
  for (const k of [...keys].sort()) {
    const f = fieldIndex().get(k);
    const v = pick(k, str(B.settings[k]), str(M.settings[k]), str(T.settings[k]), f?.label || k, groupLabel(f?.group || groupOf(k)));
    if (!(k in T.settings) && v === "") continue; // live has no row for it and the result is empty: stay absent
    settings[k] = v;
  }
  const sticky = STICKY in settings ? settings[STICKY] === "1" : T.profile.header.sticky;
  const mr = mergeRows(B.rows, M.rows, T.rows, prefer);
  conflicts.push(...mr.conflicts);
  const doc = normalizeDocument({ profile: unflatProfile(merged, sticky), settings, rows: mr.rows });
  return { doc, conflicts };
}

// ---------- reads ----------
function parseDoc(s) { try { return normalizeDocument(JSON.parse(s)); } catch { return null; } }

export async function latestVersion(env) {
  const r = await env.DB.prepare("SELECT MAX(version) AS v FROM config_versions").first();
  return Number(r?.v) || 0;
}

export async function getDraft(env) {
  const r = await env.DB.prepare("SELECT document, base_document, base_version, revision, contributors, updated_by, created_at, updated_at FROM config_draft WHERE id = 1").first();
  if (!r) return null;
  const document = parseDoc(r.document), base = parseDoc(r.base_document) || document;
  if (!document) return null;
  let contributors = []; try { contributors = JSON.parse(r.contributors || "[]"); } catch { /* none */ }
  return { document, base, baseVersion: Number(r.base_version) || 0, revision: Number(r.revision) || 1, contributors, updatedBy: r.updated_by, createdAt: r.created_at, updatedAt: r.updated_at };
}

export async function listVersions(env, { limit = 30, before } = {}) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 30, 1), PAGE_LIMIT_MAX);
  const cur = await latestVersion(env);
  const b = Number.isFinite(Number(before)) && Number(before) > 0 ? Number(before) : null;
  const rows = (await env.DB.prepare(`SELECT version, source, restored_from, author, author_role, note, summary, created_at FROM config_versions ${b ? "WHERE version < ?" : ""} ORDER BY version DESC LIMIT ?`)
    .bind(...(b ? [b, n + 1] : [n + 1])).all()).results || [];
  const more = rows.length > n;
  return { versions: rows.slice(0, n).map((r) => ({ ...r, current: r.version === cur })), current: cur, next: more ? rows[n - 1].version : null };
}

export async function getVersion(env, version) {
  const v = parseInt(version, 10);
  if (!Number.isFinite(v) || v < 1) return null;
  const r = await env.DB.prepare("SELECT version, document, source, restored_from, author, author_role, note, summary, created_at FROM config_versions WHERE version = ?").bind(v).first();
  if (!r) return null;
  const doc = parseDoc(r.document); if (!doc) return null;
  const prev = await env.DB.prepare("SELECT document FROM config_versions WHERE version < ? ORDER BY version DESC LIMIT 1").bind(v).first();
  const prevDoc = prev ? parseDoc(prev.document) : null;
  const live = await readLiveDocument(env);
  return { meta: { version: r.version, source: r.source, restoredFrom: r.restored_from, author: r.author, authorRole: r.author_role, note: r.note, summary: r.summary, createdAt: r.created_at },
    changesFromPrevious: prevDoc ? diffDocuments(prevDoc, doc) : [], changesIfRestored: diffDocuments(live, doc) };
}

export async function listAudit(env, { limit = 50, before } = {}) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 50, 1), PAGE_LIMIT_MAX);
  const b = Number.isFinite(Number(before)) && Number(before) > 0 ? Number(before) : null;
  const rows = (await env.DB.prepare(`SELECT id, version, actor, actor_role, action, summary, diff, created_at FROM config_audit ${b ? "WHERE id < ?" : ""} ORDER BY id DESC LIMIT ?`)
    .bind(...(b ? [b, n + 1] : [n + 1])).all()).results || [];
  const more = rows.length > n;
  const entries = rows.slice(0, n).map((r) => { let diff = []; try { diff = JSON.parse(r.diff || "[]"); } catch { /* none */ } return { ...r, diff }; });
  return { entries, next: more ? rows[n - 1].id : null };
}

// ---------- state for the screen ----------
export async function configState(env, user) {
  const ready = await tablesReady(env);
  const out = { ready, permissions: permissionsFor(user), message: ready ? null : NEEDS_MIGRATION, version: 0, draft: null, live: null };
  const live = await readLiveDocument(env);
  out.live = withoutRows(live);
  out.rows = { sets: rowSetsManifest(), available: Object.keys(live.rows || {}), skipped: await skippedRowSets(env) };
  if (!ready) return out;
  out.version = await latestVersion(env);
  const d = await getDraft(env);
  if (d) {
    out.draft = { ...summariseDraft(d, live), liveMovedOn: d.baseVersion !== out.version };
  }
  return out;
}

// One row set as the screen edits it: the draft's rows when there is a draft, else live. `changed` lists the keys
// that differ from live (added, edited or removed), so the screen can mark them.
export async function rowsView(env, set) {
  if (!SET_IDS.includes(set)) return { error: "Unknown list.", status: 404 };
  const live = await readLiveDocument(env);
  const liveRows = live.rows?.[set];
  if (!liveRows) return { error: "This list is not available for editing here on this site.", status: 404 };
  let rows = liveRows;
  if (await tablesReady(env)) {
    const d = await getDraft(env);
    if (d?.document?.rows?.[set]) rows = d.document.rows[set];
  }
  const changed = [];
  for (const k of new Set([...Object.keys(rows), ...Object.keys(liveRows)])) if (JSON.stringify(rows[k]) !== JSON.stringify(liveRows[k])) changed.push(k);
  return { set, rows, live: liveRows, changed };
}

// ---------- writes ----------
const stmtAudit = (env, { version = null, actor, role, action, summary, diff }) =>
  env.DB.prepare("INSERT INTO config_audit(version, actor, actor_role, action, summary, diff) VALUES(?, ?, ?, ?, ?, ?)")
    .bind(version, actor, role || null, action, String(summary || "").slice(0, 300), JSON.stringify((diff || []).slice(0, 200)));

async function ensureBaseline(env, doc) {
  const cur = await latestVersion(env);
  if (cur > 0) return cur;
  await env.DB.prepare("INSERT OR IGNORE INTO config_versions(version, document, source, author, note, summary) VALUES(1, ?, 'baseline', 'system', 'Configuration before the first versioned change', 'Starting point')")
    .bind(JSON.stringify(doc)).run();
  return 1;
}

async function afterApply(env, host) {
  clearContentTypeEnablementCache();
  await invalidateProfile(env, host);
  try { await deleteCached(env, CACHE_KEYS.SITE_SETTINGS(host)); } catch { /* cache is best effort */ }
  try { await invalidateNav(env); } catch { /* cache is best effort */ }
}

// Statements that turn the live configuration into `target`, touching only what differs.
function applyStatements(env, live, target) {
  const st = [];
  const owned = ownedKeys();
  const T = normalizeDocument(target), L = normalizeDocument(live);
  for (const k of Object.keys(T.settings)) {
    if (!owned.has(k) || str(L.settings[k]) === T.settings[k] && k in L.settings) continue;
    st.push(env.DB.prepare("INSERT OR REPLACE INTO settings(key, value, updated_at) VALUES(?, ?, CURRENT_TIMESTAMP)").bind(k, T.settings[k]));
  }
  for (const k of Object.keys(L.settings)) if (owned.has(k) && !(k in T.settings)) st.push(env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(k));
  if (JSON.stringify(L.profile) !== JSON.stringify(T.profile)) {
    st.push(env.DB.prepare("INSERT OR REPLACE INTO settings(key, value, updated_at) VALUES('site_profile', ?, CURRENT_TIMESTAMP)").bind(JSON.stringify(T.profile)));
    st.push(...contentTypeStatements(env, T.profile)); // named presets keep the older content-type switch in step (same batch)
  }
  st.push(...rowStatements(env, L.rows, T.rows));
  return st;
}

function checkSize(doc) { return JSON.stringify(doc).length <= MAX_DOC_BYTES; }
const cleanNote = (n) => str(n).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, MAX_NOTE);

// Autosave. patch = { profile?, settings?, revision? }. Returns { draft } | { errors } | { conflict, draft } | { error }.
export async function saveDraft(env, user, patch) {
  if (!(await tablesReady(env))) return { error: NEEDS_MIGRATION, status: 503 };
  if (!patch || typeof patch !== "object") return { errors: ["Send the changes as an object."] };
  if (patch.profile === undefined && patch.settings === undefined && patch.rows === undefined) return { errors: ["Nothing to save."] };
  const errors = [], rejected = [];
  let cleanSettings = null, profile = null;
  if (patch.settings !== undefined) {
    // Autosave sends whatever is typed so far: keep the valid values, report the others one by one.
    if (!patch.settings || typeof patch.settings !== "object" || Array.isArray(patch.settings)) errors.push("Send an object of settings.");
    else {
      cleanSettings = {};
      for (const [key, raw] of Object.entries(patch.settings)) {
        const r = validateSettingsInput({ [key]: raw });
        if (r.errors.length) rejected.push({ key, label: fieldIndex().get(key)?.label || key, message: r.errors[0] }); else Object.assign(cleanSettings, r.clean);
      }
      if (!Object.keys(cleanSettings).length) cleanSettings = null;
    }
  }
  if (patch.profile !== undefined) {
    const r = validateProfile(patch.profile);
    if (!r.ok) errors.push(...r.errors); else profile = r.profile;
  }
  if (!errors.length && !profile && !cleanSettings && patch.rows === undefined) errors.push(...(rejected.length ? rejected.map((x) => x.message) : ["Nothing to save."]));
  if (errors.length) return { errors, rejected };

  const live = await readLiveDocument(env);
  let draft = await getDraft(env);
  const expected = patch.revision == null ? null : Number(patch.revision);
  if (expected !== null && (draft ? draft.revision !== expected : expected > 0)) return { conflict: true, draft: draft ? summariseDraft(draft, live) : null };

  let base = draft ? draft.base : live;
  let baseChanged = false;
  const doc = JSON.parse(JSON.stringify(draft ? draft.document : live));
  if (patch.rows !== undefined) {
    // A draft that began before 6D has no rows yet: start every available set from what is live now, in both the
    // draft and its starting point, so only what the editor changes from here on counts as a change.
    const baseDoc = JSON.parse(JSON.stringify(base));
    const cur = { ...(doc.rows || {}) };
    for (const set of SET_IDS) {
      if (!cur[set] && live.rows?.[set]) { cur[set] = live.rows[set]; if (!baseDoc.rows?.[set]) { baseDoc.rows = { ...(baseDoc.rows || {}), [set]: live.rows[set] }; baseChanged = true; } }
    }
    const r = applyRowsPatch(cur, patch.rows, live.rows);
    if (r.errors.length) return { errors: r.errors };
    doc.rows = { ...cur, ...r.rows };
    base = baseDoc;
  }
  if (profile) {
    if (!!profile.header.sticky !== !!doc.profile.header.sticky) doc.settings[STICKY] = profile.header.sticky ? "1" : "0";
    doc.profile = profile;
  }
  if (cleanSettings) {
    Object.assign(doc.settings, cleanSettings);
    if (STICKY in cleanSettings) doc.profile.header.sticky = cleanSettings[STICKY] === "1";
  }
  const next = normalizeDocument(doc);
  if (!checkSize(next)) return { errors: ["The configuration is too large to save."] };

  const actor = actorOf(user);
  const contributors = [...new Set([...(draft?.contributors || []), actor])].slice(-20);
  if (!draft) {
    const baseVersion = await ensureBaseline(env, live);
    try {
      await env.DB.prepare("INSERT INTO config_draft(id, document, base_document, base_version, revision, contributors, updated_by) VALUES(1, ?, ?, ?, 1, ?, ?)")
        .bind(JSON.stringify(next), JSON.stringify(base), baseVersion, JSON.stringify(contributors), actor).run();
    } catch { // someone created the draft a moment ago
      const now = await getDraft(env);
      return { conflict: true, draft: now ? summariseDraft(now, live) : null };
    }
  } else {
    const r = baseChanged
      ? await env.DB.prepare("UPDATE config_draft SET document = ?, base_document = ?, revision = revision + 1, contributors = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND revision = ?")
        .bind(JSON.stringify(next), JSON.stringify(normalizeDocument(base)), JSON.stringify(contributors), actor, draft.revision).run()
      : await env.DB.prepare("UPDATE config_draft SET document = ?, revision = revision + 1, contributors = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND revision = ?")
        .bind(JSON.stringify(next), JSON.stringify(contributors), actor, draft.revision).run();
    if (!r?.meta?.changes) { const now = await getDraft(env); return { conflict: true, draft: now ? summariseDraft(now, live) : null }; }
  }
  const saved = await getDraft(env);
  return { draft: summariseDraft(saved, live), rejected };
}

// The draft as the screen needs it. `effective` is what the site will look like after publishing: the profile, and
// only the settings that differ from live (the screen shows live values for everything else).
function effectiveOf(live, merged) {
  const settings = {};
  for (const k of Object.keys(merged.settings)) if (!(k in live.settings) || str(live.settings[k]) !== merged.settings[k]) settings[k] = merged.settings[k];
  return { profile: merged.profile, settings };
}
function summariseDraft(d, live) {
  const m = mergeDocuments(d.base, d.document, live);
  return { revision: d.revision, baseVersion: d.baseVersion, updatedBy: d.updatedBy, updatedAt: d.updatedAt, contributors: d.contributors,
    document: withoutRows(d.document), effective: effectiveOf(live, m.doc), changes: diffDocuments(live, m.doc), conflicts: m.conflicts };
}

export async function discardDraft(env, user) {
  if (!(await tablesReady(env))) return { error: NEEDS_MIGRATION, status: 503 };
  const d = await getDraft(env);
  if (!d) return { discarded: false };
  const live = await readLiveDocument(env);
  const changes = diffDocuments(live, mergeDocuments(d.base, d.document, live).doc);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM config_draft WHERE id = 1"),
    stmtAudit(env, { actor: actorOf(user), role: user?.role, action: "draft.discard", summary: `Draft discarded. ${summarizeChanges(changes)}`, diff: changes }),
  ]);
  return { discarded: true, changes: changes.length };
}

// What publishing would do right now (no writes).
export async function previewPublish(env) {
  if (!(await tablesReady(env))) return { error: NEEDS_MIGRATION, status: 503 };
  const d = await getDraft(env);
  if (!d) return { draft: false, changes: [], conflicts: [] };
  const live = await readLiveDocument(env);
  const m = mergeDocuments(d.base, d.document, live);
  const v = validateProfile(m.doc.profile);
  const rowErrors = validateRowSets(m.doc.rows, live.rows);
  const changes = diffDocuments(live, m.doc);
  let impact = null;
  try { impact = previewChange(live.profile, v.profile, await loadFacts(env)); } catch { /* guidance is optional */ }
  return { draft: true, changes, conflicts: m.conflicts, errors: [...v.errors, ...rowErrors], summary: summarizeChanges(changes), impact, liveMovedOn: d.baseVersion !== (await latestVersion(env)) };
}

// Publish the draft. opts = { note, revision, resolve: "mine" | "live" }.
export async function publishDraft(env, host, user, opts = {}) {
  if (!(await tablesReady(env))) return { error: NEEDS_MIGRATION, status: 503 };
  const d = await getDraft(env);
  if (!d) return { error: "There is no draft to publish.", status: 409 };
  if (opts.revision != null && Number(opts.revision) !== d.revision) return { conflict: true, error: "The draft changed since you last looked. Review it again.", status: 409 };
  const live = await readLiveDocument(env);
  const merged = mergeDocuments(d.base, d.document, live, opts.resolve === "live" ? "live" : "mine");
  if (merged.conflicts.length && opts.resolve !== "mine" && opts.resolve !== "live") {
    return { conflict: true, conflicts: merged.conflicts, error: "Someone changed the same items on the live site while you were editing. Choose whose version to keep.", status: 409 };
  }
  const v = validateProfile(merged.doc.profile);
  const rowErrors = validateRowSets(merged.doc.rows, live.rows);
  if (!v.ok || rowErrors.length) return { errors: [...v.errors, ...rowErrors], status: 422 };
  // New menu links get their real ids here, so the stored version names them exactly as the site will.
  const keyed = await allocateKeys(env, merged.doc.rows);
  const doc = normalizeDocument({ profile: v.profile, settings: merged.doc.settings, rows: keyed.rows });
  if (!checkSize(doc)) return { errors: ["The configuration is too large to publish."], status: 422 };
  const changes = diffDocuments(live, doc);
  if (!changes.length) return { empty: true, error: "The draft matches the live site, so there is nothing to publish.", status: 409 };

  const baseline = await ensureBaseline(env, live);
  const version = (await latestVersion(env)) || baseline;
  const next = version + 1;
  const note = cleanNote(opts.note);
  const summary = summarizeChanges(changes);
  const stmts = applyStatements(env, live, doc);
  try {
    await env.DB.batch([
      ...stmts,
      env.DB.prepare("INSERT INTO config_versions(version, document, source, author, author_role, note, summary) VALUES(?, ?, 'publish', ?, ?, ?, ?)")
        .bind(next, JSON.stringify(doc), actorOf(user), user?.role || null, note || null, summary),
      stmtAudit(env, { version: next, actor: actorOf(user), role: user?.role, action: "publish", summary: `Published version ${next}. ${summary}${note ? ` Note: ${note}` : ""}`, diff: changes }),
      env.DB.prepare("DELETE FROM config_draft WHERE id = 1 AND revision = ?").bind(d.revision),
    ]);
  } catch (e) {
    return { error: "Publishing did not complete and nothing was changed. Please try again.", status: 409, retry: true };
  }
  await afterApply(env, host);
  return { published: true, version: next, changes, summary };
}

// Make an earlier version live again as a new version (history is never rewritten).
export async function rollbackTo(env, host, user, version, note) {
  if (!(await tablesReady(env))) return { error: NEEDS_MIGRATION, status: 503 };
  const target = await env.DB.prepare("SELECT version, document FROM config_versions WHERE version = ?").bind(parseInt(version, 10) || 0).first();
  if (!target) return { error: "That version does not exist.", status: 404 };
  const doc = parseDoc(target.document);
  if (!doc) return { error: "That version is damaged and cannot be restored.", status: 422 };
  const v = validateProfile(doc.profile);
  if (!v.ok) return { errors: v.errors, status: 422 };
  const restored = normalizeDocument({ profile: v.profile, settings: doc.settings, rows: doc.rows });
  const live = await readLiveDocument(env);
  const changes = diffDocuments(live, restored);
  if (!changes.length) return { unchanged: true, error: `The live site already matches version ${target.version}.`, status: 409 };
  const cur = (await ensureBaseline(env, live)) && (await latestVersion(env));
  const next = cur + 1;
  const n = cleanNote(note);
  const summary = `Restored version ${target.version}. ${summarizeChanges(changes)}`;
  try {
    await env.DB.batch([
      ...applyStatements(env, live, restored),
      env.DB.prepare("INSERT INTO config_versions(version, document, source, restored_from, author, author_role, note, summary) VALUES(?, ?, 'rollback', ?, ?, ?, ?, ?)")
        .bind(next, JSON.stringify(restored), target.version, actorOf(user), user?.role || null, n || null, summary),
      stmtAudit(env, { version: next, actor: actorOf(user), role: user?.role, action: "rollback", summary: `${summary}${n ? ` Note: ${n}` : ""}`, diff: changes }),
    ]);
  } catch { return { error: "Rollback did not complete and nothing was changed. Please try again.", status: 409, retry: true }; }
  await afterApply(env, host);
  return { restored: true, version: next, from: target.version, changes, summary };
}

// Record a save that went straight to the live site (the older endpoints). Never throws.
export async function recordDirect(env, user, action, before) {
  try {
    if (!(await tablesReady(env))) return null;
    const after = await readLiveDocument(env);
    const changes = diffDocuments(before, after);
    if (!changes.length) return null;
    const baseline = await ensureBaseline(env, normalizeDocument(before));
    const next = ((await latestVersion(env)) || baseline) + 1;
    const summary = summarizeChanges(changes);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO config_versions(version, document, source, author, author_role, summary) VALUES(?, ?, 'direct', ?, ?, ?)")
        .bind(next, JSON.stringify(after), actorOf(user), user?.role || null, summary),
      stmtAudit(env, { version: next, actor: actorOf(user), role: user?.role, action: action || "direct.save", summary: `Saved directly to the live site. ${summary}`, diff: changes }),
    ]);
    return next;
  } catch { return null; }
}

// What a visitor with preview switched on should see: the state the site will be in after publishing.
export async function previewOverlay(env) {
  try {
    if (!(await tablesReady(env))) return null;
    const d = await getDraft(env);
    if (!d) return null;
    const live = await readLiveDocument(env);
    const { doc } = mergeDocuments(d.base, d.document, live, "mine");
    const settings = {};
    const L = live.settings;
    for (const k of Object.keys(doc.settings)) if (str(L[k]) !== doc.settings[k] || !(k in L)) settings[k] = doc.settings[k];
    // Only the row sets the draft actually changes: untouched sets keep using the normal (cached) readers.
    const rows = {};
    for (const set of Object.keys(doc.rows || {})) if (JSON.stringify(doc.rows[set]) !== JSON.stringify(live.rows?.[set])) rows[set] = doc.rows[set];
    return { profile: doc.profile, settings, rows };
  } catch { return null; }
}
