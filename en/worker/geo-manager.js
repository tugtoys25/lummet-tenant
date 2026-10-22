// Geo rules manager (admin "Geo rules" tab on the Reviews screen).
// One place to see and change country rules for casinos (geo_rules) and for sportsbooks, affiliate partners and
// custom content (content_geo). It reads and writes the SAME tables the public pages already use and does not
// change how visitors are evaluated; evaluate() below mirrors that existing behaviour so the admin preview is exact.
import { setCasinoGeoRules } from "./database/geo.js";
import { setContentItemGeoRules } from "./database/content-items.js";
import { invalidateCasinos } from "./cache.js";

export const GEO_TYPES = {
  casino: { label: "Casinos", resource: "casinos" },
  sportsbook: { label: "Sportsbooks", resource: "content_items" },
  affiliate_partner: { label: "Affiliate partners", resource: "content_items" },
  custom: { label: "Custom content", resource: "content_items" },
};
export const GEO_STATUSES = ["allowed", "blocked"];
export const MAX_RULES = 300;
export const MAX_BULK_ITEMS = 200;
export const MAX_IMPORT_ROWS = 5000;
const PRESETS_KEY = "geo_presets";

export const DEFAULT_PRESETS = [
  { name: "European Union", countries: ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"] },
  { name: "UK & Ireland", countries: ["GB", "IE"] },
  { name: "North America", countries: ["US", "CA", "MX"] },
  { name: "Nordics", countries: ["SE", "NO", "DK", "FI", "IS"] },
  { name: "DACH", countries: ["DE", "AT", "CH"] },
];

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const fail = (message, status = 400) => json({ success: false, error: message }, status);

/** What a country rule set means: none | allow (allow-list) | block (block-list) | mixed. */
export function describeRules(rules) {
  const allowed = rules.filter((r) => r.status === "allowed").length;
  const blocked = rules.filter((r) => r.status === "blocked").length;
  let mode = "none";
  if (allowed && !blocked) mode = "allow"; else if (blocked && !allowed) mode = "block"; else if (allowed && blocked) mode = "mixed";
  return { mode, allowed, blocked, total: rules.length };
}

/** Same decision the public pages make (see evaluateCasinoGeo / getContentGeoStatuses). */
export function evaluate(rules, country) {
  const cc = String(country || "").toUpperCase();
  if (!rules.length) return { status: "blocked", reason: "No rules: the item is treated as not available." };
  const hit = rules.find((r) => r.country_code === cc);
  if (hit) return { status: hit.status, reason: `A rule for ${cc} says ${hit.status}.` };
  const d = describeRules(rules);
  if (d.mode === "allow") return { status: "blocked", reason: `Allow-list: ${cc} is not in the list, so it is blocked.` };
  if (d.mode === "block") return { status: "allowed", reason: `Block-list: ${cc} is not in the list, so it is allowed.` };
  return { status: "blocked", reason: `Mixed rules and none for ${cc}: blocked by default.` };
}

async function loadCountries(db) {
  return ((await db.prepare("SELECT code, name FROM countries ORDER BY name").all()).results || []);
}

/** Validates and cleans a list of rules. Returns {rules} or {error}. */
export async function normalizeRules(db, raw) {
  if (!Array.isArray(raw)) return { error: "rules must be a list" };
  if (raw.length > MAX_RULES) return { error: `At most ${MAX_RULES} country rules per item` };
  const seen = new Set(); const rules = [];
  for (const r of raw) {
    const code = String(r?.country_code || "").trim().toUpperCase();
    const status = String(r?.status || "").trim();
    if (!/^[A-Z]{2}$/.test(code)) return { error: `Invalid country code: "${r?.country_code ?? ""}"` };
    if (!GEO_STATUSES.includes(status)) return { error: `Status must be "allowed" or "blocked" (got "${r?.status ?? ""}")` };
    if (seen.has(code)) return { error: `Duplicate rule for country ${code}` };
    seen.add(code);
    const bonus = String(r?.bonus_override ?? "").trim().slice(0, 200);
    rules.push({ country_code: code, status, bonus_override: bonus || null });
  }
  if (rules.length) {
    const known = new Set((await loadCountries(db)).map((c) => c.code));
    const unknown = rules.filter((r) => !known.has(r.country_code)).map((r) => r.country_code);
    if (unknown.length) return { error: `Unknown country code(s): ${unknown.join(", ")}` };
  }
  return { rules };
}

/** "us, GB;de fr" -> {codes:["US","GB","DE","FR"], invalid:[...]} (two-letter codes, any of comma / semicolon / space). */
export function parseCodes(input) {
  const raw = Array.isArray(input) ? input : String(input ?? "").split(/[\s,;]+/);
  const codes = []; const invalid = [];
  for (const t of raw.map((x) => String(x).trim().toUpperCase()).filter(Boolean)) {
    if (!/^[A-Z]{2}$/.test(t)) { invalid.push(t); continue; }
    if (!codes.includes(t)) codes.push(t);
  }
  return { codes, invalid };
}

async function resolveItem(db, type, key) {
  if (type === "casino") {
    const row = await db.prepare("SELECT slug, name FROM casinos WHERE slug = ?").bind(String(key)).first();
    return row ? { key: row.slug, id: row.slug, name: row.name } : null;
  }
  const id = parseInt(key, 10);
  if (!Number.isInteger(id)) return null;
  const row = await db.prepare("SELECT id, name FROM content_items WHERE id = ? AND content_type = ?").bind(id, type).first();
  return row ? { key: String(row.id), id: row.id, name: row.name } : null;
}

async function readRules(db, type, item) {
  const sql = type === "casino"
    ? "SELECT country_code, status, bonus_override FROM geo_rules WHERE casino_slug = ? ORDER BY country_code"
    : "SELECT country_code, status, bonus_override FROM content_geo WHERE content_type = ? AND content_id = ? ORDER BY country_code";
  const res = type === "casino" ? await db.prepare(sql).bind(item.id).all() : await db.prepare(sql).bind(type, item.id).all();
  return (res.results || []).map((r) => ({ country_code: r.country_code, status: r.status, bonus_override: r.bonus_override || "" }));
}

async function writeRules(db, env, type, item, rules) {
  if (type === "casino") { await setCasinoGeoRules(db, item.id, rules); await invalidateCasinos(env); }
  else await setContentItemGeoRules(db, type, item.id, rules);
}

async function allRulesByItem(db, type) {
  const map = new Map();
  const res = type === "casino"
    ? await db.prepare("SELECT casino_slug AS k, country_code, status FROM geo_rules").all()
    : await db.prepare("SELECT content_id AS k, country_code, status FROM content_geo WHERE content_type = ?").bind(type).all();
  for (const r of res.results || []) { const k = String(r.k); if (!map.has(k)) map.set(k, []); map.get(k).push({ country_code: r.country_code, status: r.status }); }
  return map;
}

async function listItems(db, type, { q = "", country = "" } = {}) {
  const rulesMap = await allRulesByItem(db, type);
  let rows;
  if (type === "casino") rows = (await db.prepare("SELECT slug AS k, name, status, published FROM casinos ORDER BY name").all()).results || [];
  else rows = (await db.prepare("SELECT id AS k, name, status, published FROM content_items WHERE content_type = ? ORDER BY name").bind(type).all()).results || [];
  const needle = q.trim().toLowerCase();
  const cc = /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : "";
  return rows.filter((r) => !needle || String(r.name || "").toLowerCase().includes(needle) || String(r.k).toLowerCase().includes(needle)).slice(0, 1000).map((r) => {
    const rules = rulesMap.get(String(r.k)) || [];
    const d = describeRules(rules);
    const out = { key: String(r.k), name: r.name, status: r.status, published: !!r.published, mode: d.mode, allowed: d.allowed, blocked: d.blocked, total: d.total };
    if (cc) out.status_in = evaluate(rules, cc).status;
    return out;
  });
}

// ---------- CSV ----------
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let q = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

async function exportCsv(db, type) {
  const items = await listItems(db, type);
  const lines = ["item_key,item_name,country_code,status,bonus_override"];
  for (const it of items) {
    if (!it.total) continue;
    const item = await resolveItem(db, type, it.key);
    for (const r of await readRules(db, type, item)) lines.push([it.key, it.name, r.country_code, r.status, r.bonus_override].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

async function importCsv(db, env, type, text, dryRun) {
  const rows = parseCsv(text);
  if (!rows.length) return { error: "The file is empty" };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n) => head.indexOf(n);
  const iKey = col("item_key"), iCc = col("country_code"), iSt = col("status"), iBo = col("bonus_override");
  if (iKey < 0 || iCc < 0 || iSt < 0) return { error: "Columns needed: item_key, country_code, status (bonus_override is optional)" };
  if (rows.length - 1 > MAX_IMPORT_ROWS) return { error: `At most ${MAX_IMPORT_ROWS} rows per import` };
  const byItem = new Map(); const errors = [];
  rows.slice(1).forEach((r, n) => {
    const key = String(r[iKey] || "").trim();
    if (!key) { errors.push(`Row ${n + 2}: item_key is empty`); return; }
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key).push({ country_code: r[iCc], status: String(r[iSt] || "").trim().toLowerCase(), bonus_override: iBo >= 0 ? r[iBo] : "" });
  });
  const plan = [];
  for (const [key, raw] of byItem) {
    const item = await resolveItem(db, type, key);
    if (!item) { errors.push(`Item "${key}" was not found among ${GEO_TYPES[type].label.toLowerCase()}`); continue; }
    const norm = await normalizeRules(db, raw);
    if (norm.error) { errors.push(`Item "${key}": ${norm.error}`); continue; }
    plan.push({ item, rules: norm.rules });
  }
  if (!dryRun && !errors.length) for (const p of plan) await writeRules(db, env, type, p.item, p.rules);
  return { items: plan.length, rules: plan.reduce((n, p) => n + p.rules.length, 0), errors, applied: !dryRun && !errors.length };
}

// ---------- default rules for items registered without any ----------
const DEFAULTS_KEY = "geo_defaults";
export const DEFAULT_MODES = ["none", "everyone", "except"];
const NO_DEFAULT = { mode: "none", countries: [] };

export async function getDefaults(db) {
  let saved = {};
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(DEFAULTS_KEY).first();
    if (row?.value) saved = JSON.parse(row.value) || {};
  } catch { /* none */ }
  const out = {};
  for (const t of Object.keys(GEO_TYPES)) {
    const d = saved[t];
    out[t] = d && DEFAULT_MODES.includes(d.mode) ? { mode: d.mode, countries: Array.isArray(d.countries) ? d.countries : [] } : { ...NO_DEFAULT };
  }
  return out;
}

async function saveDefaults(db, raw) {
  if (!raw || typeof raw !== "object") return { error: "defaults must be an object" };
  const known = new Set((await loadCountries(db)).map((c) => c.code));
  const current = await getDefaults(db);
  for (const t of Object.keys(raw)) {
    if (!GEO_TYPES[t]) return { error: `Unknown type: ${t}` };
    const mode = String(raw[t]?.mode || "");
    if (!DEFAULT_MODES.includes(mode)) return { error: `${GEO_TYPES[t].label}: mode must be none, everyone or except` };
    const { codes, invalid } = parseCodes(raw[t]?.countries || []);
    if (invalid.length) return { error: `${GEO_TYPES[t].label}: not a country code: ${invalid.join(", ")}` };
    const unknown = codes.filter((c) => !known.has(c));
    if (unknown.length) return { error: `${GEO_TYPES[t].label}: unknown country code(s): ${unknown.join(", ")}` };
    if (mode === "except" && !codes.length) return { error: `${GEO_TYPES[t].label}: choose at least one country to exclude` };
    current[t] = { mode, countries: mode === "except" ? codes : [] };
  }
  await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(DEFAULTS_KEY, JSON.stringify(current)).run();
  return { defaults: current };
}

/** The rule rows a default stands for. "everyone" = allowed in every country on file; "except" = a block-list. */
async function rulesForDefault(db, def) {
  if (def.mode === "everyone") return (await loadCountries(db)).map((c) => ({ country_code: c.code, status: "allowed", bonus_override: null }));
  if (def.mode === "except") return def.countries.map((c) => ({ country_code: c, status: "blocked", bonus_override: null }));
  return [];
}

/** Called when an item is registered. Gives it the default rules only if it has none. Never throws. */
export async function applyDefaultToNewItem(db, env, type, key) {
  try {
    if (!GEO_TYPES[type]) return false;
    const def = (await getDefaults(db))[type];
    if (!def || def.mode === "none") return false;
    const item = await resolveItem(db, type, key);
    if (!item || (await readRules(db, type, item)).length) return false;
    const rules = await rulesForDefault(db, def);
    if (!rules.length) return false;
    await writeRules(db, env, type, item, rules);
    return true;
  } catch { return false; }
}

// ---------- presets ----------
async function loadPresets(db) {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(PRESETS_KEY).first();
    if (row?.value) { const v = JSON.parse(row.value); if (Array.isArray(v)) return v; }
  } catch { /* defaults */ }
  return DEFAULT_PRESETS;
}
async function savePresets(db, raw) {
  if (!Array.isArray(raw) || raw.length > 40) return { error: "Up to 40 presets" };
  const known = new Set((await loadCountries(db)).map((c) => c.code));
  const out = [];
  for (const p of raw) {
    const name = String(p?.name || "").trim().slice(0, 40);
    if (!name) return { error: "Every preset needs a name" };
    const countries = [...new Set((Array.isArray(p?.countries) ? p.countries : []).map((c) => String(c).trim().toUpperCase()))];
    if (!countries.length) return { error: `Preset "${name}" has no countries` };
    const bad = countries.filter((c) => !/^[A-Z]{2}$/.test(c) || !known.has(c));
    if (bad.length) return { error: `Preset "${name}": unknown country code(s) ${bad.join(", ")}` };
    out.push({ name, countries });
  }
  await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(PRESETS_KEY, JSON.stringify(out)).run();
  return { presets: out };
}

/**
 * Entry point for /api/v1/geo-manager/*. `can(resource, action)` is the caller's permission check.
 */
export async function handleGeoManager(request, env, path, can) {
  const db = env.DB;
  const url = new URL(request.url);
  const route = path.replace("/api/v1/geo-manager/", "");
  const method = request.method;
  const typeOf = (t) => (GEO_TYPES[t] ? t : null);
  const guard = (type, action) => (can(GEO_TYPES[type].resource, action) ? null : fail(`Forbidden: you cannot ${action} ${GEO_TYPES[type].label.toLowerCase()}`, 403));

  if (method === "GET" && route === "meta") {
    const types = Object.entries(GEO_TYPES).filter(([, v]) => can(v.resource, "read")).map(([k, v]) => ({ key: k, label: v.label }));
    return json({ types, countries: await loadCountries(db), presets: await loadPresets(db), defaults: await getDefaults(db), max_rules: MAX_RULES });
  }
  if (method === "GET" && route === "items") {
    const type = typeOf(url.searchParams.get("type")); if (!type) return fail("Unknown type");
    const g = guard(type, "read"); if (g) return g;
    return json({ items: await listItems(db, type, { q: url.searchParams.get("q") || "", country: url.searchParams.get("country") || "" }) });
  }
  if (method === "GET" && route === "rules") {
    const type = typeOf(url.searchParams.get("type")); if (!type) return fail("Unknown type");
    const g = guard(type, "read"); if (g) return g;
    const item = await resolveItem(db, type, url.searchParams.get("key"));
    if (!item) return fail("Item not found", 404);
    const rules = await readRules(db, type, item);
    return json({ item: { key: item.key, name: item.name }, rules, summary: describeRules(rules) });
  }
  if (method === "GET" && route === "export") {
    const type = typeOf(url.searchParams.get("type")); if (!type) return fail("Unknown type");
    const g = guard(type, "read"); if (g) return g;
    return new Response(await exportCsv(db, type), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="geo-rules-${type}.csv"` } });
  }
  if (method === "GET" && route === "presets") return json({ presets: await loadPresets(db) });
  if (method === "GET" && route === "defaults") {
    const defs = await getDefaults(db);
    const counts = {};
    for (const t of Object.keys(GEO_TYPES)) if (can(GEO_TYPES[t].resource, "read")) counts[t] = (await listItems(db, t)).filter((i) => !i.total).length;
    return json({ defaults: defs, no_rules: counts });
  }

  if (method !== "POST") return fail("Not found", 404);
  let body; try { body = await request.json(); } catch { return fail("Invalid JSON"); }

  if (route === "presets/save") {
    if (!can("settings", "create") && !can("casinos", "update")) return fail("Forbidden", 403);
    const res = await savePresets(db, body.presets);
    return res.error ? fail(res.error) : json({ success: true, presets: res.presets });
  }
  if (route === "defaults/save") {
    for (const t of Object.keys(body.defaults || {})) { if (GEO_TYPES[t] && !can(GEO_TYPES[t].resource, "update")) return fail(`Forbidden: you cannot change ${GEO_TYPES[t].label.toLowerCase()}`, 403); }
    const res = await saveDefaults(db, body.defaults);
    return res.error ? fail(res.error) : json({ success: true, defaults: res.defaults });
  }
  const type = typeOf(body.type); if (!type) return fail("Unknown type");
  const g = guard(type, "update"); if (g) return g;

  if (route === "save") {
    const item = await resolveItem(db, type, body.key);
    if (!item) return fail("Item not found", 404);
    const norm = await normalizeRules(db, body.rules);
    if (norm.error) return fail(norm.error);
    await writeRules(db, env, type, item, norm.rules);
    return json({ success: true, summary: describeRules(norm.rules) });
  }

  if (route === "defaults/apply") {
    const def = (await getDefaults(db))[type];
    if (def.mode === "none") return fail("The default for this type is \"not available\", so there is nothing to apply.");
    const rules = await rulesForDefault(db, def);
    if (!rules.length) return fail("No countries on file to build the default from.");
    const targets = (await listItems(db, type)).filter((i) => !i.total);
    if (!body.dry_run) for (const t of targets) { const item = await resolveItem(db, type, t.key); if (item) await writeRules(db, env, type, item, rules); }
    return json({ success: true, items: targets.length, rules: rules.length, applied: !body.dry_run });
  }

  if (route === "bulk") {
    const action = String(body.action || "");
    // which items: an explicit list, or a whole group
    let keys;
    const scope = String(body.scope || "keys");
    if (scope === "keys") {
      keys = [...new Set((Array.isArray(body.keys) ? body.keys : []).map(String))];
      if (!keys.length) return fail("Choose at least one item");
      if (keys.length > MAX_BULK_ITEMS) return fail(`At most ${MAX_BULK_ITEMS} items at once when you pick them one by one; use "all items" for more`);
    } else if (["all", "no_rules", "with_rules"].includes(scope)) {
      const all = await listItems(db, type);
      keys = all.filter((i) => scope === "all" || (scope === "no_rules" ? !i.total : !!i.total)).map((i) => i.key);
      if (!keys.length) return fail("No items match that choice");
    } else return fail("Unknown scope");

    let template = null; let merge = "replace";
    if (action === "apply") {
      const status = body.mode === "allow" ? "allowed" : body.mode === "block" ? "blocked" : null;
      if (!status) return fail("Mode must be allow or block");
      merge = ["replace", "add", "remove"].includes(body.merge) ? body.merge : "replace";
      const parsed = parseCodes(body.codes !== undefined && body.codes !== "" ? body.codes : (Array.isArray(body.countries) ? body.countries : []));
      if (parsed.invalid.length) return fail(`Not a two-letter country code: ${parsed.invalid.join(", ")}`);
      const norm = await normalizeRules(db, parsed.codes.map((c) => ({ country_code: c, status })));
      if (norm.error) return fail(norm.error);
      if (!norm.rules.length) return fail("Enter or choose at least one country");
      template = norm.rules;
    } else if (action === "copy") {
      const from = await resolveItem(db, type, body.from_key);
      if (!from) return fail("Source item not found", 404);
      template = (await readRules(db, type, from)).map((r) => ({ country_code: r.country_code, status: r.status, bonus_override: r.bonus_override }));
    } else if (action === "default") {
      const def = (await getDefaults(db))[type];
      template = await rulesForDefault(db, def);
    } else if (action !== "clear") return fail("Unknown action");

    let changed = 0, mixed = 0; const names = [];
    for (const k of keys) {
      const item = await resolveItem(db, type, k); if (!item) continue;
      let next = [];
      if (template && merge === "replace") next = template;
      else if (template) {
        const cur = await readRules(db, type, item);
        const codes = new Set(template.map((r) => r.country_code));
        next = merge === "add"
          ? [...cur.filter((r) => !codes.has(r.country_code)), ...template.map((r) => ({ ...r, bonus_override: cur.find((c) => c.country_code === r.country_code)?.bonus_override || r.bonus_override }))]
          : cur.filter((r) => !codes.has(r.country_code));
        if (next.length > MAX_RULES) return fail(`${item.name} would have more than ${MAX_RULES} rules`);
      }
      if (describeRules(next).mode === "mixed") mixed++;
      if (names.length < 5) names.push(item.name);
      if (!body.dry_run) await writeRules(db, env, type, item, next);
      changed++;
    }
    return json({ success: true, changed, mixed, sample: names, applied: !body.dry_run });
  }

  if (route === "import") {
    const res = await importCsv(db, env, type, body.csv, !!body.dry_run);
    return res.error ? fail(res.error) : json({ success: !res.errors.length, ...res }, res.errors.length ? 400 : 200);
  }
  return fail("Not found", 404);
}
