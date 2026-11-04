// ============================================================
// SITE PROFILE (Phase 7): export, import (dry run, merge) of a configuration
// ============================================================
// A configuration leaves a site as an ENVELOPE, a plain JSON file:
//   { format: "lummet-config", formatVersion: 1, name, description, exportedAt,
//     source: { host, version, platform }, sections: [ids], checksum, document: { v, profile?, settings?, rows? } }
//
// SECTIONS are the pieces an owner can take or leave. `structure` is the site profile (modules, pages, tools,
// homepage, removed-page behaviour). `settings.<group>` is one look-and-feel group (colours, header, hero, ...).
// `rows.<set>` is one list (menu links, page layouts, SEO records, components, placements).
//
// Importing NEVER writes to the live site. It adds the chosen sections to the DRAFT, so everything that already
// protects a change still applies: review, three-way merge, publish, version history, rollback and the audit log.
//   planImport   = dry run. Reads the file and the site, writes nothing, and reports every change and every problem.
//   applyImport  = plans again on the server (a client's plan is never trusted), then saves the accepted part to the draft.
//
// Rules that keep an import safe:
//   - Import only ever adds or updates. It never deletes a menu link, SEO record, page or component.
//   - Raw markup and scripts (analytics scripts, ad HTML, verification seals) are never exported or imported.
//   - Every value passes the same validators as a value typed on the Configuration screen.
//   - Rows that are tied to this site's own ids are matched by what they are, not by id: menu links by menu and
//     address, pages by slug, SEO records by page, components by type and name, placements by page and component.
//     An item that has no match here is skipped and reported (components and placements cannot be created here).
import { PRESETS } from "./registry.js";
import { validateProfile } from "./profile.js";
import { GROUPS, OWNED_ELSEWHERE, ownedKeys, groupOf, validateSettingsInput, allFields } from "./settings-groups.js";
import { ROW_SETS, SET_IDS, applyRowsPatch } from "./rows.js";
import { previewChange } from "./guidance.js";
import { loadFacts } from "./facts.js";
import {
  readLiveDocument, getDraft, mergeDocuments, diffDocuments, normalizeDocument, summarizeChanges, saveDraft,
  tablesReady, latestVersion, actorOf, NEEDS_MIGRATION,
} from "./versions.js";

export const FORMAT = "lummet-config";
export const FORMAT_VERSION = 1;
export const PLATFORM = "lummet-tenant";
export const MAX_IMPORT_BYTES = 900 * 1024;
export const MAX_NAME = 80;
export const MAX_DESCRIPTION = 400;
const STICKY = "site_header_sticky";
// Groups that describe THIS business (its name, tracking id, licence). Taking them from another site is rarely wanted,
// so they start unticked when a file comes from a different site.
export const BRAND_GROUPS = new Set(["identity", "analytics", "compliance"]);

const str = (v) => (v == null ? "" : String(v));
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ---------- sections ----------
export function sectionCatalog() {
  const out = [{ id: "structure", kind: "structure", label: "Site structure", help: "Which modules, pages and tools are on, the homepage, and what removed pages do.", risk: "high", brand: false }];
  for (const g of GROUPS) out.push({ id: `settings.${g.id}`, kind: "settings", group: g.id, label: `Look and feel: ${g.label}`, help: g.help, risk: "low", brand: BRAND_GROUPS.has(g.id) });
  for (const id of SET_IDS) out.push({ id: `rows.${id}`, kind: "rows", set: id, label: ROW_SETS[id].label, help: ROW_SETS[id].help, risk: id === "nav" ? "medium" : "low", brand: false });
  return out;
}
const CATALOG = (() => { let c = null; return () => (c ||= sectionCatalog()); })();
const sectionById = (id) => CATALOG().find((s) => s.id === id) || null;
export const isSectionId = (id) => !!sectionById(id);
const cleanSectionList = (list) => (Array.isArray(list) ? [...new Set(list.map(str).filter(isSectionId))] : null);

// ---------- people ----------
export function transferPermissions(user) {
  const r = { editor: 2, admin: 3 }[user?.role] || 0;
  return { export: r >= 2, import: r >= 2, library: r >= 2, manage: r >= 3 };
}

// ---------- canonical form and checksum ----------
const canon = (v) => (Array.isArray(v) ? v.map(canon) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
export async function sha256Hex(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const checksumOf = async (envelope) => `sha256:${await sha256Hex(JSON.stringify(canon({ format: envelope.format, formatVersion: envelope.formatVersion, sections: envelope.sections, document: envelope.document })))}`;

// ---------- portable rows ----------
// Row keys on a site are ids (n12, c4, p9) that mean nothing elsewhere. In a file every row is keyed by what it is.
const compKeyOf = (r) => `${r.type}|${r.name}`;
function portableRows(rows, set, notes) {
  const src = rows?.[set]; if (!isObj(src)) return null;
  const out = {};
  if (set === "nav") {
    const kept = Object.entries(src).filter(([, r]) => !r.scope_type && !r.scope_ref);
    if (kept.length < Object.keys(src).length) notes.push(`${plural(Object.keys(src).length - kept.length, "menu link")} tied to a specific category or country page ${Object.keys(src).length - kept.length === 1 ? "was" : "were"} left out.`);
    const keys = new Set(kept.map(([k]) => k));
    for (const [k, r] of kept) out[k] = { label: r.label, url: r.url, location: r.location, position: r.position, enabled: r.enabled, is_external: r.is_external, icon: r.icon, parent: keys.has(r.parent) ? r.parent : "", geo: r.geo };
  } else if (set === "pages") {
    for (const [slug, r] of Object.entries(src)) out[slug] = { template: r.template, seo_title: r.seo_title, seo_description: r.seo_description, seo_keywords: r.seo_keywords };
  } else if (set === "seo") {
    for (const [k, r] of Object.entries(src)) out[k] = { page_type: r.page_type, page_slug: r.page_slug, title: r.title, description: r.description, keywords: r.keywords, canonical: r.canonical, og_image: r.og_image, robots: r.robots };
  } else if (set === "components") {
    for (const r of Object.values(src)) { const k = compKeyOf(r); if (!out[k]) out[k] = { type: r.type, name: r.name, title: r.title, status: r.status, settings_json: r.settings_json }; }
  } else if (set === "placements") {
    const comps = rows?.components || {};
    for (const r of Object.values(src)) {
      const c = comps[`c${r.component_id}`]; if (!c) continue;
      out[`${r.page_type}|${r.page_slug}|${compKeyOf(c)}`] = { page_type: r.page_type, page_slug: r.page_slug, component_type: c.type, component_name: c.name, position: r.position, enabled: r.enabled, injection_point: r.injection_point };
    }
  }
  return out;
}

// ---------- build an export ----------
// opts = { host, sections?: ids, from?: "live" | "draft", name?, description?, now? }
// Returns { envelope, included: [ids], notes: [strings] }.
export async function buildExport(env, opts = {}) {
  const live = await readLiveDocument(env);
  let doc = live, from = "live";
  if (opts.from === "draft" && (await tablesReady(env))) {
    const d = await getDraft(env);
    if (d) { doc = mergeDocuments(d.base, d.document, live).doc; from = "draft"; }
  }
  const wanted = cleanSectionList(opts.sections);
  // Always in catalogue order, so the same choice gives the same file (and checksum) however it was picked.
  // No list at all means every section. A list that was given is honoured exactly: one with no valid id in it exports
  // nothing, so a damaged share or a mistyped API call can never widen into "everything".
  const ids = CATALOG().map((s) => s.id).filter((id) => wanted === null || wanted.includes(id));
  const notes = [], included = [], document = { v: doc.v };
  const owned = ownedKeys(), skippedMarkup = new Set();
  for (const id of ids) {
    const s = sectionById(id);
    if (s.kind === "structure") { document.profile = clone(doc.profile); included.push(id); }
    else if (s.kind === "settings") {
      const bag = {};
      for (const [k, v] of Object.entries(doc.settings || {})) {
        if (!owned.has(k) || groupOf(k) !== s.group) continue;
        if (has(OWNED_ELSEWHERE, k)) { skippedMarkup.add(k); continue; }
        bag[k] = str(v);
      }
      if (Object.keys(bag).length) { document.settings = { ...(document.settings || {}), ...bag }; included.push(id); }
    } else {
      const rows = portableRows(doc.rows, s.set, notes);
      if (rows && Object.keys(rows).length) { document.rows = { ...(document.rows || {}), [s.set]: rows }; included.push(id); }
    }
  }
  if (skippedMarkup.size) notes.push("Scripts, ad HTML and verification markup are never exported. Set them up again on the receiving site.");
  const envelope = {
    format: FORMAT, formatVersion: FORMAT_VERSION,
    name: str(opts.name).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, MAX_NAME) || `Configuration of ${opts.host || "a site"}`,
    description: str(opts.description).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, MAX_DESCRIPTION),
    exportedAt: (opts.now ? new Date(opts.now) : new Date()).toISOString(),
    source: { host: str(opts.host).slice(0, 253), version: (await tablesReady(env)) ? await latestVersion(env) : 0, platform: PLATFORM, from },
    sections: included, document,
  };
  envelope.checksum = await checksumOf(envelope);
  return { envelope, included, notes };
}

// ---------- parse an envelope ----------
// Accepts a JSON string or an object. Returns { ok, errors, warnings, parsed? }. Never throws.
export async function parseEnvelope(input) {
  const errors = [], warnings = [];
  let raw = input;
  if (typeof input === "string") {
    if (input.length > MAX_IMPORT_BYTES) return { ok: false, errors: ["This file is too large to be a configuration export."], warnings };
    try { raw = JSON.parse(input); } catch { return { ok: false, errors: ["This is not a valid JSON file. Choose a file exported from Dashboard > Configuration."], warnings }; }
  }
  if (!isObj(raw)) return { ok: false, errors: ["This is not a configuration file."], warnings };
  if (JSON.stringify(raw).length > MAX_IMPORT_BYTES) return { ok: false, errors: ["This file is too large to be a configuration export."], warnings };
  if (raw.format !== FORMAT) return { ok: false, errors: ["This is not a Lummet configuration export."], warnings };
  const fv = Number(raw.formatVersion);
  if (!Number.isInteger(fv) || fv < 1) return { ok: false, errors: ["The file does not say which format version it uses."], warnings };
  if (fv > FORMAT_VERSION) return { ok: false, errors: [`This file uses format version ${fv}, which is newer than this site understands (version ${FORMAT_VERSION}). Update this site first.`], warnings };
  if (!isObj(raw.document)) return { ok: false, errors: ["The file has no configuration in it."], warnings };

  let checksum = "none";
  if (typeof raw.checksum === "string") {
    const want = await checksumOf({ format: raw.format, formatVersion: raw.formatVersion, sections: raw.sections, document: raw.document });
    checksum = want === raw.checksum ? "ok" : "mismatch";
    if (checksum === "mismatch") warnings.push("The file was changed after it was exported (its checksum does not match). Everything in it is still checked, but make sure you trust where it came from.");
  } else warnings.push("The file has no checksum, so corruption cannot be detected. Everything in it is still checked.");

  const d = raw.document, owned = ownedKeys();
  const parsed = { meta: {}, profile: undefined, settings: {}, rows: {} };
  const clean = (s, n) => str(s).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, n);
  parsed.meta = {
    name: clean(raw.name, MAX_NAME), description: clean(raw.description, MAX_DESCRIPTION), exportedAt: clean(raw.exportedAt, 40),
    host: clean(raw.source?.host, 253), version: Number(raw.source?.version) || 0, platform: clean(raw.source?.platform, 40), from: raw.source?.from === "draft" ? "draft" : "live",
    formatVersion: fv, checksum,
  };
  if (d.profile !== undefined) { if (isObj(d.profile)) parsed.profile = clone(d.profile); else warnings.push("The site structure in the file is damaged and was ignored."); }
  if (d.settings !== undefined) {
    if (!isObj(d.settings)) warnings.push("The settings in the file are damaged and were ignored.");
    else {
      let unknown = 0, markup = 0;
      for (const [k, v] of Object.entries(d.settings)) {
        if (has(OWNED_ELSEWHERE, k)) { markup++; continue; }
        if (!owned.has(k) || v === null || typeof v === "object") { unknown++; continue; }
        parsed.settings[k] = str(v);
      }
      if (markup) warnings.push(`${plural(markup, "setting")} that hold scripts or raw markup ${markup === 1 ? "was" : "were"} ignored. Scripts are never imported.`);
      if (unknown) warnings.push(`${plural(unknown, "setting")} this site does not know ${unknown === 1 ? "was" : "were"} ignored.`);
    }
  }
  if (d.rows !== undefined) {
    if (!isObj(d.rows)) warnings.push("The lists in the file are damaged and were ignored.");
    else for (const set of SET_IDS) if (isObj(d.rows[set])) parsed.rows[set] = clone(d.rows[set]);
    const unknownSets = isObj(d.rows) ? Object.keys(d.rows).filter((k) => !SET_IDS.includes(k)) : [];
    if (unknownSets.length) warnings.push(`${plural(unknownSets.length, "list")} this site does not know ${unknownSets.length === 1 ? "was" : "were"} ignored.`);
  }
  const available = availableSections(parsed);
  if (!available.length) return { ok: false, errors: ["The file contains nothing that can be imported."], warnings };
  return { ok: true, errors, warnings, parsed, available };
}

export function availableSections(parsed) {
  const ids = [];
  if (parsed.profile) ids.push("structure");
  for (const g of GROUPS) if (Object.keys(parsed.settings).some((k) => groupOf(k) === g.id)) ids.push(`settings.${g.id}`);
  for (const set of SET_IDS) if (parsed.rows[set] && Object.keys(parsed.rows[set]).length) ids.push(`rows.${set}`);
  return ids;
}

// ---------- planning (dry run) ----------
const MEDIA = /(^|["'(\s])\/media\//;
function applyPatchToDoc(base, patch, rowsResult) {
  const doc = clone(base);
  if (patch.profile) {
    if (!!patch.profile.header.sticky !== !!doc.profile.header.sticky) doc.settings[STICKY] = patch.profile.header.sticky ? "1" : "0";
    doc.profile = clone(patch.profile);
  }
  if (patch.settings) {
    Object.assign(doc.settings, patch.settings);
    if (STICKY in patch.settings) doc.profile.header.sticky = patch.settings[STICKY] === "1";
  }
  if (rowsResult) doc.rows = { ...(doc.rows || {}), ...rowsResult };
  return normalizeDocument(doc);
}

// Only fields the file actually carries; a field it leaves out is never touched.
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
const diffFields = (cur, want, fields) => {
  const out = {};
  for (const f of fields) if (want[f] !== undefined && want[f] !== null && String(cur?.[f] ?? "") !== String(want[f])) out[f] = want[f];
  return out;
};

function planNav(imp, cur, ctx) {
  const sig = (r) => `${r.location}|${r.url}`;
  const byKey = new Map();
  for (const [k, r] of Object.entries(cur)) if (!byKey.has(sig(r))) byKey.set(sig(r), k);
  const used = new Set(Object.keys(cur));
  let n = 0;
  const fresh = () => { let k; do { k = `new-i${(n++).toString(36)}`; } while (used.has(k)); used.add(k); return k; };
  const entries = Object.entries(imp).filter(([k, r]) => isObj(r) && /^[A-Za-z0-9_-]{1,40}$/.test(k));
  const depth = (k, seen = new Set()) => (seen.has(k) || !isObj(imp[k]) || !imp[k].parent || !isObj(imp[imp[k].parent]) ? 0 : 1 + depth(imp[k].parent, new Set([...seen, k])));
  entries.sort((a, b) => depth(a[0]) - depth(b[0]) || (Number(a[1].position) || 0) - (Number(b[1].position) || 0) || (a[0] < b[0] ? -1 : 1));
  const target = new Map();
  for (const [ik, r] of entries) {
    const s = sig(r); let tk = byKey.get(s);
    if (!tk) { tk = fresh(); byKey.set(s, tk); }
    target.set(ik, tk);
  }
  const changes = {}; let add = 0, change = 0, same = 0;
  for (const [ik, r] of entries) {
    const tk = target.get(ik), parent = r.parent && target.has(r.parent) && target.get(r.parent) !== tk ? target.get(r.parent) : "";
    const want = defined({ label: r.label, url: r.url, location: r.location, position: r.position, enabled: r.enabled, is_external: r.is_external, icon: r.icon, geo: r.location === "page" ? str(r.geo) : "" });
    if (r.location !== "page" && str(r.geo)) ctx.warn("rows.nav", `“${str(r.label).slice(0, 40)}”: country rules only apply to page-menu links, so they were left out.`);
    if (cur[tk]) {
      const d = diffFields(cur[tk], want, ["label", "url", "location", "position", "enabled", "is_external", "icon", "geo"]);
      if (r.parent && parent && cur[tk].parent !== parent) d.parent = parent;
      if (Object.keys(d).length) { changes[tk] = d; change++; } else same++;
    } else { changes[tk] = { ...want, parent }; add++; }
  }
  // a link may not end up under itself through a parent that already exists on this site
  const parentOf = (k) => (changes[k] && "parent" in changes[k] ? changes[k].parent : cur[k]?.parent || "");
  for (const k of Object.keys(changes)) {
    if (!("parent" in changes[k]) || !changes[k].parent) continue;
    let p = changes[k].parent, hops = 0, loop = false;
    while (p && hops++ < 60) { if (p === k) { loop = true; break; } p = parentOf(p); }
    if (loop) { ctx.warn("rows.nav", `“${str(changes[k].label ?? cur[k]?.label).slice(0, 40)}”: its drop-down parent would create a loop, so it was left where it is.`); if (cur[k]) changes[k].parent = cur[k].parent; else changes[k].parent = ""; }
  }
  return { changes, add, change, same };
}

function planPages(imp, cur, ctx) {
  const changes = {}; let change = 0, same = 0, missing = 0;
  for (const [slug, r] of Object.entries(imp)) {
    if (!isObj(r) || !/^[A-Za-z0-9][A-Za-z0-9\-_/.]{0,190}$/.test(slug)) continue;
    if (!has(cur, slug)) { missing++; continue; }
    const d = diffFields(cur[slug], r, ["template", "seo_title", "seo_description", "seo_keywords"]);
    if (Object.keys(d).length) { changes[slug] = d; change++; } else same++;
  }
  if (missing) ctx.info("rows.pages", `${plural(missing, "page")} in the file ${missing === 1 ? "does" : "do"} not exist on this site and ${missing === 1 ? "was" : "were"} skipped. Create the page first, then import again.`);
  return { changes, add: 0, change, same, skipped: missing };
}

function planSeo(imp, cur) {
  const changes = {}; let add = 0, change = 0, same = 0, bad = 0;
  for (const r of Object.values(imp)) {
    if (!isObj(r)) continue;
    const t = str(r.page_type).trim(), s = str(r.page_slug).trim();
    if (!t || !s || t.includes("|") || t.length > 40 || s.length > 200) { bad++; continue; }
    const key = `${t}|${s}`, fields = ["title", "description", "keywords", "canonical", "og_image", "robots"];
    if (has(cur, key)) {
      const d = diffFields(cur[key], r, fields);
      if (Object.keys(d).length) { changes[key] = d; change++; } else same++;
    } else { changes[key] = { page_type: t, page_slug: s, ...defined(Object.fromEntries(fields.map((f) => [f, r[f]]))) }; add++; }
  }
  return { changes, add, change, same, skipped: bad, bad };
}

function planComponents(imp, cur, ctx) {
  const byName = new Map(); for (const [k, r] of Object.entries(cur)) if (!byName.has(compKeyOf(r))) byName.set(compKeyOf(r), k);
  const changes = {}; let change = 0, same = 0; const missing = [];
  for (const r of Object.values(imp)) {
    if (!isObj(r)) continue;
    const k = byName.get(compKeyOf(r));
    if (!k) { missing.push(`${str(r.name).slice(0, 40)} (${str(r.type).slice(0, 30)})`); continue; }
    const d = diffFields(cur[k], r, ["title", "status", "settings_json"]);
    if (Object.keys(d).length) { changes[k] = d; change++; } else same++;
  }
  if (missing.length) ctx.info("rows.components", `${plural(missing.length, "component")} in the file ${missing.length === 1 ? "does" : "do"} not exist on this site and ${missing.length === 1 ? "was" : "were"} skipped: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? ", …" : ""}. Create ${missing.length === 1 ? "it" : "them"} in the Component Studio, then import again.`);
  return { changes, add: 0, change, same, skipped: missing.length };
}

function planPlacements(imp, cur, curComponents, ctx) {
  const byName = new Map(); for (const [k, r] of Object.entries(curComponents || {})) if (!byName.has(compKeyOf(r))) byName.set(compKeyOf(r), k);
  const bySlot = new Map(); for (const [k, r] of Object.entries(cur)) bySlot.set(`${r.page_type}|${r.page_slug}|${r.component_id}`, k);
  const changes = {}; let change = 0, same = 0, missing = 0;
  for (const r of Object.values(imp)) {
    if (!isObj(r)) continue;
    const ck = byName.get(`${r.component_type}|${r.component_name}`);
    const k = ck && bySlot.get(`${r.page_type}|${r.page_slug}|${ck.slice(1)}`);
    if (!k) { missing++; continue; }
    const d = diffFields(cur[k], r, ["position", "enabled", "injection_point"]);
    if (Object.keys(d).length) { changes[k] = d; change++; } else same++;
  }
  if (missing) ctx.info("rows.placements", `${plural(missing, "placement")} in the file ${missing === 1 ? "has" : "have"} no matching component on that page here and ${missing === 1 ? "was" : "were"} skipped.`);
  return { changes, add: 0, change, same, skipped: missing };
}

// Validate a rows patch the way saving it will. All at once first; if that fails, one row at a time so one bad row
// does not sink the others. Returns { rows (new complete sets), accepted (patch), skippedBy: { set: n } }.
function validateRowsPatch(current, patch, liveRows, ctx) {
  const all = applyRowsPatch(current, patch, liveRows);
  if (!all.errors.length) return { rows: all.rows, accepted: patch, skippedBy: {} };
  let working = clone(current); const accepted = {}, skippedBy = {}, newRows = {};
  for (const set of Object.keys(patch)) {
    accepted[set] = { set: {} }; skippedBy[set] = 0;
    for (const [key, change] of Object.entries(patch[set].set || {})) {
      const r = applyRowsPatch(working, { [set]: { set: { [key]: change } } }, liveRows);
      if (r.errors.length) { skippedBy[set]++; ctx.warn(`rows.${set}`, `Skipped “${str(change.label ?? change.title ?? change.name ?? change.page_slug ?? key).slice(0, 50)}”: ${r.errors[0]}`); continue; }
      working[set] = r.rows[set]; newRows[set] = r.rows[set]; accepted[set].set[key] = change;
    }
    if (!Object.keys(accepted[set].set).length) { delete accepted[set]; delete newRows[set]; }
  }
  return { rows: newRows, accepted, skippedBy };
}

// opts = { sections?: ids, host }. Returns the dry-run report, plus `patch` (internal, for applyImport).
export async function planImport(env, parsedResult, opts = {}) {
  const { parsed, available } = parsedResult;
  const live = await readLiveDocument(env);
  const ready = await tablesReady(env);
  const draft = ready ? await getDraft(env) : null;
  const sameSite = !!opts.host && parsed.meta.host === opts.host;
  const wanted = cleanSectionList(opts.sections);
  const selected = new Set((wanted || available.filter((id) => sameSite || !sectionById(id).brand)).filter((id) => available.includes(id)));
  const items = [];
  const ctx = { warn: (section, message) => items.push({ level: "warning", section, message }), info: (section, message) => items.push({ level: "info", section, message }), error: (section, message) => items.push({ level: "error", section, message }) };
  for (const w of parsedResult.warnings) items.push({ level: "warning", section: null, message: w });
  if (parsed.meta.platform && parsed.meta.platform !== PLATFORM) ctx.warn(null, `The file was made by “${parsed.meta.platform}”, not by this platform.`);

  const W = clone(draft ? draft.document : live);
  W.rows = { ...(W.rows || {}) };
  for (const set of SET_IDS) if (!W.rows[set] && live.rows?.[set]) W.rows[set] = live.rows[set];
  const Wn = normalizeDocument(W);

  const patch = {}, rowsPatch = {}, counts = {}, blocked = new Set();
  const bump = (id, o) => { counts[id] = { add: 0, change: 0, same: 0, skipped: 0, ...(counts[id] || {}), ...o }; };
  let mediaRefs = 0;
  const countMedia = (v) => { if (MEDIA.test(str(v))) mediaRefs++; };

  // structure
  if (selected.has("structure")) {
    const cand = clone(parsed.profile);
    const keepsHeader = selected.has("settings.header") && STICKY in parsed.settings;
    cand.header = { ...(isObj(cand.header) ? cand.header : {}), sticky: keepsHeader ? parsed.settings[STICKY] === "1" : Wn.profile.header.sticky };
    const v = validateProfile(cand);
    if (!v.ok) { v.errors.forEach((e) => ctx.error("structure", e)); blocked.add("structure"); bump("structure", { skipped: 1 }); }
    else if (JSON.stringify(v.profile) === JSON.stringify(Wn.profile)) bump("structure", { same: 1 });
    else { patch.profile = v.profile; bump("structure", { change: 1 }); }
    if (v.ok && parsed.profile.preset && !PRESETS[parsed.profile.preset] && parsed.profile.preset !== "custom") ctx.info("structure", "The setup type in the file is not one this site knows, so it is shown as Custom.");
  }

  // settings, group by group
  for (const g of GROUPS) {
    const id = `settings.${g.id}`; if (!selected.has(id)) continue;
    const keys = Object.keys(parsed.settings).filter((k) => groupOf(k) === g.id);
    bump(id, {});
    for (const k of keys) {
      const label = allFields().find((f) => f.key === k)?.label || k;
      const r = validateSettingsInput({ [k]: parsed.settings[k] });
      if (r.errors.length) { counts[id].skipped++; ctx.warn(id, `Skipped “${label}”: ${r.errors[0]}`); continue; }
      const val = r.clean[k];
      if (str(Wn.settings[k]) === val) { counts[id].same++; continue; }
      (patch.settings ||= {})[k] = val; counts[id].change++; countMedia(val);
    }
  }

  // lists
  const curRows = Wn.rows || {};
  for (const set of SET_IDS) {
    const id = `rows.${set}`; if (!selected.has(id)) continue;
    if (!curRows[set]) { ctx.warn(id, `${ROW_SETS[set].label} cannot be managed on this site right now, so it was skipped.`); blocked.add(id); bump(id, { skipped: Object.keys(parsed.rows[set]).length }); continue; }
    const imp = parsed.rows[set];
    let r;
    if (set === "nav") r = planNav(imp, curRows.nav, ctx);
    else if (set === "pages") r = planPages(imp, curRows.pages, ctx);
    else if (set === "seo") r = planSeo(imp, curRows.seo);
    else if (set === "components") r = planComponents(imp, curRows.components, ctx);
    else r = planPlacements(imp, curRows.placements, curRows.components, ctx);
    bump(id, { add: r.add, change: r.change, same: r.same, skipped: r.skipped || 0 });
    if (Object.keys(r.changes).length) rowsPatch[set] = { set: r.changes };
    if (r.bad) ctx.warn(id, `${plural(r.bad, "SEO record")} had no page type or page and ${r.bad === 1 ? "was" : "were"} skipped.`);
  }
  let rowsResult = null;
  if (Object.keys(rowsPatch).length) {
    const v = validateRowsPatch(curRows, rowsPatch, live.rows, ctx);
    for (const set of Object.keys(rowsPatch)) {
      const c = counts[`rows.${set}`], keys = Object.keys(v.accepted[set]?.set || {});
      c.skipped += v.skippedBy[set] || 0;
      c.add = keys.filter((k) => !has(curRows[set], k)).length; c.change = keys.filter((k) => has(curRows[set], k)).length;
    }
    for (const set of Object.keys(v.accepted)) { for (const ch of Object.values(v.accepted[set].set)) for (const f of ["og_image", "settings_json"]) if (f in ch) countMedia(ch[f]); }
    if (Object.keys(v.accepted).length) { patch.rows = v.accepted; rowsResult = v.rows; }
  }
  if (mediaRefs && !sameSite) ctx.warn(null, `${plural(mediaRefs, "value")} point${mediaRefs === 1 ? "s" : ""} to files in the media library of the site this came from. The files are not copied: upload them here and update the links.`);

  // what the draft will look like, and what changes
  const result = applyPatchToDoc(Wn, patch, rowsResult);
  const changes = diffDocuments(Wn, result);
  let impact = null;
  if (patch.profile) { try { impact = previewChange(Wn.profile, patch.profile, await loadFacts(env)); } catch { /* guidance is optional */ } }
  const sections = available.map((id) => ({ ...sectionById(id), selected: selected.has(id), blocked: blocked.has(id), counts: counts[id] || { add: 0, change: 0, same: 0, skipped: 0 } }));
  const drafted = draft ? diffDocuments(live, mergeDocuments(draft.base, draft.document, live).doc).length : 0;
  const report = {
    file: { ...parsed.meta, sameSite }, sections, items, changes, summary: summarizeChanges(changes), impact,
    hasChanges: changes.length > 0, skippedCount: Object.values(counts).reduce((n, c) => n + (c.skipped || 0), 0),
    draft: { exists: !!draft, changes: drafted, revision: draft ? draft.revision : 0 },
    canApply: ready && changes.length > 0, reason: !ready ? NEEDS_MIGRATION : !changes.length ? "Nothing to import: this site's draft already matches the chosen sections." : null,
  };
  return { report, patch };
}

// Plan again on the server and save the accepted part to the draft. Never touches the live site.
// opts = { sections?, host, revision? }. Returns { imported, changes, summary, skipped, draft } | { error, status, ... }.
export async function applyImport(env, user, parsedResult, opts = {}) {
  if (!(await tablesReady(env))) return { error: NEEDS_MIGRATION, status: 503 };
  const { report, patch } = await planImport(env, parsedResult, opts);
  if (!report.hasChanges) return { error: report.reason, status: 409, code: "nothing_to_import", report };
  const r = await saveDraft(env, user, { ...patch, revision: opts.revision == null ? undefined : Number(opts.revision) });
  if (r.error || r.errors || r.conflict) return { ...r, report };
  const chosen = report.sections.filter((s) => s.selected && (s.counts.add || s.counts.change)).map((s) => s.label);
  const from = report.file.host ? ` from ${report.file.host}` : "";
  await recordTransfer(env, user, "import.draft", `Imported “${report.file.name || "a configuration"}”${from} into the draft. ${report.summary}. Sections: ${chosen.join(", ")}.`, report.changes);
  return { imported: true, changes: report.changes, summary: report.summary, skipped: report.items.filter((i) => i.level === "warning" && i.section), draft: r.draft, report };
}

// Audit entry for transfer actions. Append-only table; a failure here never fails the action.
export async function recordTransfer(env, user, action, summary, diff = []) {
  try {
    await env.DB.prepare("INSERT INTO config_audit(version, actor, actor_role, action, summary, diff) VALUES(NULL, ?, ?, ?, ?, ?)")
      .bind(actorOf(user), user?.role || null, action, str(summary).slice(0, 300), JSON.stringify((diff || []).slice(0, 200))).run();
    return true;
  } catch { return false; }
}
