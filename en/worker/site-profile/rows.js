// ============================================================
// SITE PROFILE (Phase 6D): row data inside the configuration document
// ============================================================
// Phase 6A to 6C versioned the profile and the settings table. Five more things shape how a site looks and are
// stored as table rows, not settings keys. 6D puts them in the same document, so they get the same draft,
// preview, three-way merge, publish, history, rollback and audit:
//
//   nav         Menu links you added yourself (nav_items). Links the platform generates for categories and
//               countries are not included; they follow their own content.
//   pages       Search-result title, description and keywords of each standard page (pages.seo_*).
//   seo         Per-address SEO records (seo_meta): title, description, canonical, share image, robots.
//   components  Component name, title, status and settings (components). Their content stays in the Component Studio.
//   placements  Where components appear: position, on/off, injection point (page_components).
//
// A document carries `rows: { nav: { n12: {...} }, ... }`. Every set is optional: a version saved before 6D has
// none, and restoring such a version leaves rows exactly as they are. Rows are identified by a stable key
// (n<id>, c<id>, p<id>, "type|slug", or a page slug). A link created in a draft has a temporary key
// (new-xxxx) until publish gives it a real id.
//
// Update-only sets (pages, components, placements) never create or delete rows: those stay on their own screens.
import { cleanText, cleanLink, cleanImage } from "../header-hero/clean.js";
import { cleanComponentSettings } from "../component-settings-clean.js";
import { PAGE_TEMPLATES, DEFAULT_PAGE_TEMPLATE } from "../page-templates.js";

export const NAV_LOCATIONS = ["header", "footer_casinos", "footer_company", "footer_support", "footer_legal", "mobile", "page", "category_subnav", "country_subnav"];
export const INJECTION_POINTS = ["top", "content_top", "content_bottom", "bottom", "sidebar"];
export const ROBOTS = ["index, follow", "noindex, follow", "index, nofollow", "noindex, nofollow"];
export const COMPONENT_STATUS = ["active", "inactive", "draft"];
const SET_BYTE_BUDGET = 150 * 1024; // a set larger than this is not versioned (it stays on its own screen)
const NEW_KEY = /^new-[a-z0-9]{1,16}$/;

const str = (v) => (v == null ? "" : String(v));

// ---------- field specs ----------
// t: text | url | image | enum | int | bool | ref | cjson | raw.  ro = carried along, never editable here.
const F = (k, t, label, o = {}) => ({ k, t, label, ...o });

export const ROW_SETS = {
  nav: {
    label: "Menu links", area: "Navigation", create: true, remove: true, cap: 300,
    help: "Links in the header, footer, mobile menu and page menu that you added. Links the platform adds for categories and countries are managed automatically.",
    fields: [
      F("label", "text", "Link text", { max: 80, req: true, help: "What visitors read." }),
      F("url", "url", "Address", { max: 300, req: true, help: "A path such as /en/news, or a full https:// address." }),
      F("location", "enum", "Where it appears", { values: NAV_LOCATIONS, req: true, help: "Header, a footer column, the mobile menu or the page menu." }),
      F("position", "int", "Order", { min: 0, max: 9999, def: 0, help: "Lower numbers come first." }),
      F("enabled", "bool", "Shown", { def: true, help: "Switch off to hide it without deleting it." }),
      F("is_external", "bool", "Opens another site", { def: false }),
      F("icon", "text", "Icon", { max: 40 }),
      F("parent", "ref", "Sits under", { help: "Another link in the same menu, to make a drop-down." }),
      F("geo", "geo", "Country rules", { max: 600, help: "Page menu only. Example: GB=allowed, DE=blocked. Only allowed countries: the link shows in those countries only. Only blocked: it shows everywhere else." }),
      F("scope_type", "raw", "Scope type", { ro: true }),
      F("scope_ref", "raw", "Scope", { ro: true }),
    ],
    name: (r) => r.label || "(untitled link)",
  },
  pages: {
    label: "Page layout and search listing", area: "SEO", create: false, remove: false, cap: 400,
    help: "The layout of each standard page and how it appears in search results. Page text is edited in Pages.",
    fields: [
      F("template", "enum", "Page layout", { values: Object.keys(PAGE_TEMPLATES), valueLabels: Object.fromEntries(Object.entries(PAGE_TEMPLATES).map(([k, v]) => [k, v.label])), def: DEFAULT_PAGE_TEMPLATE, fallback: true, help: "Standard, wide, or landing. Applies to ordinary pages." }),
      F("seo_title", "text", "Search title", { max: 70, help: "Aim for under 60 characters." }),
      F("seo_description", "text", "Search description", { max: 200, help: "120 to 160 characters works well." }),
      F("seo_keywords", "text", "Keywords", { max: 200 }),
    ],
    name: (r, key) => key,
  },
  seo: {
    label: "SEO records", area: "SEO", create: true, remove: true, cap: 400,
    help: "Title, description, canonical address, share image and robots rules for a specific address.",
    fields: [
      F("page_type", "raw", "Page type", { ro: true }),
      F("page_slug", "raw", "Page", { ro: true }),
      F("title", "text", "Title", { max: 70 }),
      F("description", "text", "Description", { max: 200 }),
      F("keywords", "text", "Keywords", { max: 200 }),
      F("canonical", "url", "Canonical address", { max: 300, help: "Only set this when another address is the main copy." }),
      F("og_image", "image", "Share image", { max: 500, help: "1200 by 630 pixels works best." }),
      F("robots", "enum", "Search engines", { values: ROBOTS, def: "index, follow" }),
      F("schema_json", "raw", "Structured data", { ro: true }),
    ],
    name: (r) => `${r.page_type || "page"} / ${r.page_slug || ""}`,
  },
  components: {
    label: "Components", area: "Components", create: false, remove: false, cap: 200,
    help: "Name, title, on/off and settings of components. Their content is edited in the Component Studio.",
    fields: [
      F("type", "raw", "Type", { ro: true }),
      F("name", "text", "Name", { max: 80, req: true }),
      F("title", "text", "Title", { max: 120 }),
      F("status", "enum", "Status", { values: COMPONENT_STATUS, def: "active" }),
      F("settings_json", "cjson", "Settings", { max: 20000, help: "Checked with the same rules as the Component Studio." }),
    ],
    name: (r) => r.name || "(component)",
  },
  placements: {
    label: "Component placement", area: "Components", create: false, remove: false, cap: 600,
    help: "Where each component appears: on or off, order, and position on the page.",
    fields: [
      F("page_type", "raw", "Page type", { ro: true }),
      F("page_slug", "raw", "Page", { ro: true }),
      F("component_id", "raw", "Component", { ro: true }),
      F("position", "int", "Order", { min: 0, max: 9999, def: 0 }),
      F("enabled", "bool", "Shown", { def: true }),
      F("injection_point", "enum", "Position on page", { values: INJECTION_POINTS, def: "content_bottom" }),
    ],
    name: (r) => `${r.page_type || "page"} / ${r.page_slug || ""} · component ${r.component_id}`,
  },
};
export const SET_IDS = Object.keys(ROW_SETS);
const spec = (set, k) => ROW_SETS[set].fields.find((f) => f.k === k);

// Country rules for a page-menu link: "DE=blocked,GB=allowed" (sorted, one rule per country).
export const GEO_STATUS = ["allowed", "blocked", "restricted"];
function parseGeo(v) {
  const rules = new Map(), bad = [];
  for (const tok of str(v).split(/[\s,;]+/).filter(Boolean)) {
    const m = tok.match(/^([A-Za-z]{2})=(allowed|blocked|restricted)$/i);
    if (m) rules.set(m[1].toUpperCase(), m[2].toLowerCase()); else bad.push(tok);
  }
  return { rules, bad };
}
function normGeo(v) { return [...parseGeo(v).rules.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([c, s]) => `${c}=${s}`).join(","); }

// ---------- coercion (lenient: used on stored documents) ----------
function coerce(f, v) {
  switch (f.t) {
    case "bool": return v === true || v === 1 || v === "1" || v === "true";
    case "int": { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : (f.def ?? 0); }
    case "enum": return v == null || v === "" || (f.fallback && !f.values.includes(str(v))) ? str(f.def ?? "") : str(v);
    case "geo": return normGeo(v);
    default: return str(v);
  }
}
const blank = (set) => Object.fromEntries(ROW_SETS[set].fields.map((f) => [f.k, f.t === "bool" ? !!f.def : f.t === "int" ? (f.def ?? 0) : f.t === "enum" ? str(f.def ?? "") : ""]));

function normRow(set, raw) {
  const out = {};
  for (const f of ROW_SETS[set].fields) out[f.k] = coerce(f, raw?.[f.k]);
  return out;
}

// Canonical rows: known sets only, keys sorted, fields in spec order, dangling menu parents cleared.
export function normalizeRows(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const set of SET_IDS) {
    const src = input[set];
    if (!src || typeof src !== "object" || Array.isArray(src)) continue;
    const rows = {};
    for (const key of Object.keys(src).sort()) if (src[key] && typeof src[key] === "object") rows[key] = normRow(set, src[key]);
    if (set === "nav") for (const k of Object.keys(rows)) if (rows[k].parent && (rows[k].parent === k || !rows[rows[k].parent])) rows[k].parent = "";
    out[set] = rows;
  }
  return out;
}

// ---------- strict cleaning (used on anything a person sends, and again at publish) ----------
function cleanField(set, f, raw, row) {
  const label = f.label;
  switch (f.t) {
    case "text": {
      const v = cleanText(raw, f.max || 200);
      if (f.req && !v) return { error: `${label}: required.` };
      return { value: v };
    }
    case "url": {
      const v = cleanLink(raw, f.max || 300);
      if (str(raw).trim() && !v) return { error: `${label}: enter a full address (https://...) or a path starting with /.` };
      if (f.req && !v) return { error: `${label}: required.` };
      return { value: v };
    }
    case "image": {
      const v = cleanImage(raw, f.max || 500);
      if (str(raw).trim() && !v) return { error: `${label}: enter an image address (https://... or /media/...).` };
      return { value: v };
    }
    case "enum": {
      const v = str(raw);
      if (!f.values.includes(v)) return { error: `${label}: choose one of the listed options.` };
      return { value: v };
    }
    case "int": {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < (f.min ?? 0) || n > (f.max ?? 9999)) return { error: `${label}: enter a whole number from ${f.min ?? 0} to ${f.max ?? 9999}.` };
      return { value: n };
    }
    case "bool":
      if (!(raw === true || raw === false || raw === 1 || raw === 0 || raw === "1" || raw === "0" || raw === "true" || raw === "false")) return { error: `${label}: choose on or off.` };
      return { value: raw === true || raw === 1 || raw === "1" || raw === "true" };
    case "geo": {
      const { bad } = parseGeo(raw);
      if (bad.length) return { error: `${label}: use COUNTRY=allowed or COUNTRY=blocked, for example GB=allowed (not “${bad[0].slice(0, 20)}”).` };
      const v = normGeo(raw);
      if (v && row && row.location && row.location !== "page") return { error: `${label}: country rules only apply to links in the page menu.` };
      return { value: v };
    }
    case "ref": {
      const v = str(raw);
      if (v && !/^(n\d+|new-[a-z0-9]{1,16})$/.test(v)) return { error: `${label}: not a valid link.` };
      return { value: v };
    }
    case "cjson": {
      const text = typeof raw === "string" ? raw : raw == null ? "" : JSON.stringify(raw);
      if (text.length > (f.max || 20000)) return { error: `${label}: too long.` };
      try {
        const cleaned = cleanComponentSettings(row?.type, text);
        const v = cleaned == null || cleaned === "" ? "" : (typeof cleaned === "string" ? cleaned : JSON.stringify(cleaned));
        if (v) { const parsed = JSON.parse(v); if (!parsed || typeof parsed !== "object") return { error: `${label}: must be an object.` }; }
        return { value: v };
      } catch (e) { return { error: `${label}: ${String(e?.message || "not valid").slice(0, 120)}` }; }
    }
    default:
      return { value: str(raw) };
  }
}

const keyOfSeo = (r) => `${r.page_type}|${r.page_slug}`;

// patch = { nav: { set: { key: {field: value} }, remove: [key] }, ... }; current = normalised rows of the draft.
// Returns { rows, errors, touched }: the complete new rows (only for sets named in the patch) or the problems found.
export function applyRowsPatch(current, patch, live = null) {
  const errors = [];
  const rows = {};
  const touched = [];
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { rows, errors: ["Send row changes as an object."], touched };
  for (const set of Object.keys(patch)) {
    const def = ROW_SETS[set];
    if (!def) { errors.push(`"${set}" is not something that can be changed here.`); continue; }
    const p = patch[set];
    if (!p || typeof p !== "object") { errors.push(`${def.label}: send { set, remove }.`); continue; }
    if (current[set] === undefined) { errors.push(`${def.label} cannot be edited here right now (it is too large or not available).`); continue; }
    const next = JSON.parse(JSON.stringify(current[set]));
    for (const key of Array.isArray(p.remove) ? p.remove : []) {
      if (!def.remove) { errors.push(`${def.label}: items cannot be removed here.`); break; }
      if (!(key in next)) continue;
      delete next[key];
    }
    for (const [key, change] of Object.entries(p.set && typeof p.set === "object" ? p.set : {})) {
      if (!change || typeof change !== "object") { errors.push(`${def.label} ${key}: nothing to set.`); continue; }
      const exists = key in next;
      const restore = !exists && live?.[set]?.[key]; // an item the draft removed comes back from what is live
      let row;
      if (exists) row = { ...next[key] };
      else if (restore) row = { ...live[set][key] };
      else {
        if (!def.create) { errors.push(`${def.label}: new items cannot be added here.`); continue; }
        if (set === "nav" && !NEW_KEY.test(key)) { errors.push(`Menu link: a new link needs a key like new-abc123.`); continue; }
        if (set === "seo") {
          const t = cleanText(change.page_type, 40), s = cleanText(change.page_slug, 200);
          if (!t || !s || /\|/.test(t)) { errors.push("SEO record: choose the page type and page."); continue; }
          if (key !== `${t}|${s}`) { errors.push("SEO record: the key must be page type, a bar, then the page."); continue; }
          row = { ...blank("seo"), page_type: t, page_slug: s };
        } else row = blank(set);
      }
      let bad = false;
      for (const [k, v] of Object.entries(change)) {
        const f = spec(set, k);
        if (!f) { errors.push(`${def.label}: "${k}" cannot be changed.`); bad = true; continue; }
        if (f.ro) { if (!exists && set === "seo" && (k === "page_type" || k === "page_slug")) continue; errors.push(`${def.label}: ${f.label} cannot be changed.`); bad = true; continue; }
        const r = cleanField(set, f, v, row);
        if (r.error) { errors.push(`${def.label} “${def.name(row, key)}”: ${r.error}`); bad = true; } else row[k] = r.value;
      }
      if (bad) continue;
      if (!exists && !restore) for (const f of def.fields) if (f.req && !f.ro) { const r = cleanField(set, f, row[f.k], row); if (r.error) { errors.push(`${def.label}: ${r.error}`); bad = true; } }
      if (bad) continue;
      if (set === "nav" && row.parent) {
        if (row.parent === key) { errors.push("Menu link: a link cannot sit under itself."); continue; }
      }
      next[key] = row;
      if (Object.keys(next).length > def.cap) { errors.push(`${def.label}: too many items to manage here (limit ${def.cap}).`); break; }
    }
    rows[set] = next;
    touched.push(set);
  }
  if (!errors.length) {
    const n = normalizeRows(rows);
    for (const set of Object.keys(n)) {
      if (JSON.stringify(n[set]).length > SET_BYTE_BUDGET) errors.push(`${ROW_SETS[set].label}: too large to manage here.`);
      if (set === "nav") for (const [k, r] of Object.entries(n.nav)) if (r.parent && !n.nav[r.parent]) errors.push(`Menu link “${r.label}”: the link it sits under no longer exists.`);
    }
    if (!errors.length) return { rows: n, errors, touched };
  }
  return { rows: {}, errors, touched: [] };
}

// Re-clean every row of `rows` that differs from `live` (publish refuses anything that would not pass a fresh save).
export function validateRowSets(rows, liveRows) {
  const errors = [];
  for (const set of Object.keys(rows || {})) {
    const def = ROW_SETS[set]; if (!def) continue;
    for (const [key, row] of Object.entries(rows[set])) {
      const before = liveRows?.[set]?.[key];
      if (before && JSON.stringify(before) === JSON.stringify(row)) continue;
      for (const f of def.fields) {
        if (f.ro) continue;
        const r = cleanField(set, f, row[f.k], row);
        if (r.error) errors.push(`${def.label} “${def.name(row, key)}”: ${r.error}`);
      }
      if (set === "nav" && row.parent && !rows.nav[row.parent]) errors.push(`Menu link “${row.label}”: the link it sits under no longer exists.`);
    }
  }
  return errors;
}

// ---------- reading live rows ----------
const SELECT = {
  nav: "SELECT * FROM nav_items WHERE COALESCE(auto_generated, 0) = 0 ORDER BY id",
  pages: "SELECT slug, template, seo_title, seo_description, seo_keywords FROM pages ORDER BY id",
  seo: "SELECT * FROM seo_meta ORDER BY id",
  components: "SELECT id, type, name, title, status, settings_json FROM components ORDER BY id",
  placements: "SELECT id, page_type, page_slug, component_id, position, enabled, injection_point FROM page_components ORDER BY id",
};
function fromDb(set, r) {
  switch (set) {
    case "nav": return [`n${r.id}`, { label: r.label, url: r.url, location: r.location, position: r.position, enabled: r.enabled == null ? true : Number(r.enabled) !== 0, is_external: !!Number(r.is_external), icon: r.icon, parent: r.parent_id ? `n${r.parent_id}` : "", scope_type: r.scope_type, scope_ref: r.scope_ref }];
    case "pages": return [r.slug, { template: r.template, seo_title: r.seo_title, seo_description: r.seo_description, seo_keywords: r.seo_keywords }];
    case "seo": return [keyOfSeo(r), { page_type: r.page_type, page_slug: r.page_slug, title: r.title, description: r.description, keywords: r.keywords, canonical: r.canonical, og_image: r.og_image, robots: r.robots || "index, follow", schema_json: r.schema_json }];
    case "components": return [`c${r.id}`, { type: r.type, name: r.name, title: r.title, status: r.status || "active", settings_json: r.settings_json }];
    default: return [`p${r.id}`, { page_type: r.page_type, page_slug: r.page_slug, component_id: r.component_id, position: r.position, enabled: r.enabled == null ? true : !!Number(r.enabled), injection_point: r.injection_point || "content_bottom" }];
  }
}
// A parent that is itself an auto-generated link is not in the document: treat as no parent.
export async function readLiveRows(env) {
  const rows = {}, skipped = [];
  for (const set of SET_IDS) {
    try {
      const res = (await env.DB.prepare(SELECT[set]).all()).results || [];
      let geoBy = null;
      if (set === "nav") {
        geoBy = {};
        try { for (const g of (await env.DB.prepare("SELECT nav_item_id, country_code, status FROM page_nav_geo_rules ORDER BY country_code").all()).results || []) (geoBy[g.nav_item_id] ||= []).push(`${g.country_code}=${g.status}`); } catch { /* table missing: no rules */ }
      }
      if (res.length > ROW_SETS[set].cap) { skipped.push({ set, reason: `more than ${ROW_SETS[set].cap} items` }); continue; }
      const m = {};
      for (const r of res) { const [k, v] = fromDb(set, r); if (geoBy) v.geo = (geoBy[r.id] || []).join(","); m[k] = v; }
      if (set === "nav") for (const v of Object.values(m)) if (v.parent && !m[v.parent]) v.parent = "";
      const norm = normalizeRows({ [set]: m })[set];
      if (JSON.stringify(norm).length > SET_BYTE_BUDGET) { skipped.push({ set, reason: "too large to keep versions of" }); continue; }
      rows[set] = norm;
    } catch { skipped.push({ set, reason: "not available on this site" }); }
  }
  return { rows, skipped };
}

// ---------- labels, flattening, diff, merge ----------
const rowName = (set, key, row) => { try { return ROW_SETS[set].name(row || {}, key); } catch { return key; } }
const shown = (f, v) => {
  if (v === true) return "on"; if (v === false) return "off";
  const s = str(v); if (s === "") return "(empty)";
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
};

// Human list of what differs: [{ area, key, label, from, to }]. A set missing on either side is not compared.
export function diffRows(a, b) {
  const out = [];
  for (const set of SET_IDS) {
    const A = a?.[set], B = b?.[set];
    if (!A || !B) continue;
    const def = ROW_SETS[set];
    for (const key of new Set([...Object.keys(A), ...Object.keys(B)])) {
      const x = A[key], y = B[key];
      if (!x && y) { out.push({ area: def.area, key: `rows.${set}.${key}`, label: `${def.label}: ${rowName(set, key, y)}`, from: "(not there)", to: "added" }); continue; }
      if (x && !y) { out.push({ area: def.area, key: `rows.${set}.${key}`, label: `${def.label}: ${rowName(set, key, x)}`, from: "present", to: "removed" }); continue; }
      for (const f of def.fields) {
        if (x[f.k] === y[f.k]) continue;
        out.push({ area: def.area, key: `rows.${set}.${key}.${f.k}`, label: `${rowName(set, key, y)}: ${f.label}`, from: shown(f, x[f.k]), to: shown(f, y[f.k]) });
      }
    }
  }
  return out;
}

// Three-way merge of rows. Returns { rows, conflicts }. `pick` is the same rule as for settings.
export function mergeRows(base, mine, theirs, prefer = "mine") {
  const conflicts = [];
  const out = {};
  for (const set of SET_IDS) {
    const M = mine?.[set], T = theirs?.[set];
    if (!M) { if (T) out[set] = T; continue; }  // editor did not touch this set: live stands
    if (!T) continue;                            // live cannot be read now: nothing to apply
    const B = base?.[set] || {};
    const def = ROW_SETS[set];
    const merged = {};
    const pick = (key, b, m, t, label) => {
      if (m === b) return t;
      if (t === b || t === m) return m;
      conflicts.push({ key, label, area: def.area, base: shown(null, b), mine: shown(null, m), live: shown(null, t) });
      return prefer === "live" ? t : m;
    };
    for (const key of [...new Set([...Object.keys(B), ...Object.keys(M), ...Object.keys(T)])].sort()) {
      const name = rowName(set, key, M[key] || T[key] || B[key]);
      const here = pick(`rows.${set}.${key}`, B[key] ? true : undefined, M[key] ? true : undefined, T[key] ? true : undefined, `${def.label}: ${name}`);
      if (!here) continue;
      const row = {};
      for (const f of def.fields) {
        const v = pick(`rows.${set}.${key}.${f.k}`, B[key]?.[f.k], M[key]?.[f.k], T[key]?.[f.k], `${name}: ${f.label}`);
        row[f.k] = v !== undefined ? v : (M[key]?.[f.k] ?? T[key]?.[f.k]);
      }
      merged[key] = row;
    }
    out[set] = merged;
  }
  return { rows: normalizeRows(out), conflicts };
}

// ---------- publish: give new menu links real ids ----------
async function nextNavId(env) {
  let m = 0;
  try { m = Number((await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM nav_items").first())?.m) || 0; } catch { /* none */ }
  try { m = Math.max(m, Number((await env.DB.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'nav_items'").first())?.seq) || 0); } catch { /* none */ }
  return m + 1;
}
// Returns { rows, ids } with new-xxx keys replaced by n<id> (parents included).
export async function allocateKeys(env, rows) {
  const nav = rows?.nav;
  if (!nav || !Object.keys(nav).some((k) => NEW_KEY.test(k))) return { rows, ids: new Map() };
  let id = await nextNavId(env);
  const ids = new Map();
  for (const k of Object.keys(nav).sort()) if (NEW_KEY.test(k)) ids.set(k, `n${id++}`);
  const next = {};
  for (const [k, r] of Object.entries(nav)) next[ids.get(k) || k] = { ...r, parent: ids.get(r.parent) || r.parent };
  return { rows: normalizeRows({ ...rows, nav: next }), ids };
}

// ---------- applying rows to the database ----------
const nz = (v) => (v === "" || v == null ? null : v);
const idOf = (key) => Number(String(key).slice(1));
function stmtsFor(env, set, key, row, existed, liveRows) {
  const db = env.DB, st = [];
  switch (set) {
    case "nav": {
      const parent = row.parent ? idOf(row.parent) : null;
      if (existed) st.push(db.prepare("UPDATE nav_items SET label=?, url=?, parent_id=?, position=?, location=?, is_external=?, icon=?, enabled=?, scope_type=?, scope_ref=? WHERE id=? AND COALESCE(auto_generated,0)=0")
        .bind(row.label, row.url, parent, row.position, row.location, row.is_external ? 1 : 0, nz(row.icon), row.enabled ? 1 : 0, nz(row.scope_type), nz(row.scope_ref), idOf(key)));
      else st.push(db.prepare("INSERT INTO nav_items(id, label, url, parent_id, position, location, is_external, icon, enabled, auto_generated, scope_type, scope_ref) VALUES(?,?,?,?,?,?,?,?,?,0,?,?)")
        .bind(idOf(key), row.label, row.url, parent, row.position, row.location, row.is_external ? 1 : 0, nz(row.icon), row.enabled ? 1 : 0, nz(row.scope_type), nz(row.scope_ref)));
      // Country rules: rewritten when the item is new (or put back) or its rules changed.
      if (!existed || (liveRows?.[key]?.geo || "") !== (row.geo || "")) {
        st.push(db.prepare("DELETE FROM page_nav_geo_rules WHERE nav_item_id = ?").bind(idOf(key)));
        for (const [c, status] of parseGeo(row.geo).rules) st.push(db.prepare("INSERT INTO page_nav_geo_rules(nav_item_id, country_code, status) VALUES(?,?,?)").bind(idOf(key), c, status));
      }
      break;
    }
    case "pages":
      st.push(db.prepare("UPDATE pages SET template=?, seo_title=?, seo_description=?, seo_keywords=?, updated_at=CURRENT_TIMESTAMP WHERE slug=?").bind(row.template || DEFAULT_PAGE_TEMPLATE, nz(row.seo_title), nz(row.seo_description), nz(row.seo_keywords), key));
      break;
    case "seo":
      st.push(db.prepare(`INSERT INTO seo_meta(page_type, page_slug, title, description, keywords, canonical, og_image, schema_json, robots) VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(page_type, page_slug) DO UPDATE SET title=excluded.title, description=excluded.description, keywords=excluded.keywords, canonical=excluded.canonical, og_image=excluded.og_image, schema_json=excluded.schema_json, robots=excluded.robots, updated_at=CURRENT_TIMESTAMP`)
        .bind(row.page_type, row.page_slug, nz(row.title), nz(row.description), nz(row.keywords), nz(row.canonical), nz(row.og_image), nz(row.schema_json), row.robots || "index, follow"));
      break;
    case "components":
      st.push(db.prepare("UPDATE components SET name=?, title=?, status=?, settings_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.name, nz(row.title), row.status || "active", nz(row.settings_json), idOf(key)));
      break;
    default:
      st.push(db.prepare("UPDATE page_components SET position=?, enabled=?, injection_point=? WHERE id=?").bind(row.position, row.enabled ? 1 : 0, row.injection_point || "content_bottom", idOf(key)));
  }
  return st;
}
// Statements that turn the live rows into `target`, touching only what differs. Sets missing on either side are skipped.
export function rowStatements(env, live, target) {
  const st = [];
  for (const set of SET_IDS) {
    const L = live?.[set], T = target?.[set];
    if (!L || !T) continue;
    const def = ROW_SETS[set];
    // children (menu links with a parent) after parents: insert parents first
    const keys = Object.keys(T).sort((a, b) => (T[a].parent ? 1 : 0) - (T[b].parent ? 1 : 0) || (a < b ? -1 : 1));
    for (const key of keys) {
      if (L[key]) { if (JSON.stringify(L[key]) !== JSON.stringify(T[key])) st.push(...stmtsFor(env, set, key, T[key], true, L)); }
      else if (def.create) st.push(...stmtsFor(env, set, key, T[key], false, L));
    }
    if (def.remove) for (const key of Object.keys(L)) if (!T[key]) {
      if (set === "nav") {
        // the rules are kept in the stored version, so putting the link back restores them
        st.push(env.DB.prepare("DELETE FROM page_nav_geo_rules WHERE nav_item_id = ?").bind(idOf(key)));
        st.push(env.DB.prepare("DELETE FROM nav_items WHERE id=? AND COALESCE(auto_generated,0)=0").bind(idOf(key)));
      }
      else if (set === "seo") st.push(env.DB.prepare("DELETE FROM seo_meta WHERE page_type=? AND page_slug=?").bind(L[key].page_type, L[key].page_slug));
    }
  }
  return st;
}

// ---------- preview: what a signed-in editor sees ----------
// `rows` is { set: {key: row} } for the sets the draft changes (see previewOverlay in versions.js).
const numId = (key, order) => (/^n\d+$/.test(key) ? idOf(key) : -(order + 1));

// Menu links as nav_items rows: the platform's own links from the database plus the draft's links.
export async function previewNavItems(env, location, rows = env?.__preview?.rows) {
  const draft = rows?.nav;
  if (!draft) return null;
  const all = (await env.DB.prepare("SELECT * FROM nav_items ORDER BY position ASC, id ASC").all()).results || [];
  const auto = all.filter((r) => Number(r.auto_generated) === 1);
  const keys = Object.keys(draft);
  const idMap = new Map(keys.map((k, i) => [k, numId(k, i)]));
  const manual = keys.map((k) => { const r = draft[k]; return {
    id: idMap.get(k), label: r.label, url: r.url, parent_id: r.parent ? idMap.get(r.parent) ?? null : null, position: r.position, location: r.location,
    is_external: r.is_external ? 1 : 0, icon: r.icon || null, enabled: r.enabled ? 1 : 0, auto_generated: 0, scope_type: r.scope_type || null, scope_ref: r.scope_ref || null, __geo: r.geo || "",
  }; });
  const dbRules = {};
  try { for (const g of (await env.DB.prepare("SELECT nav_item_id, country_code, status FROM page_nav_geo_rules").all()).results || []) (dbRules[g.nav_item_id] ||= []).push(`${g.country_code}=${g.status}`); } catch { /* none */ }
  for (const a of auto) a.__geo = (dbRules[a.id] || []).join(",");
  const merged = [...auto, ...manual].filter((r) => r.location === location && Number(r.enabled) === 1);
  merged.sort((a, b) => (a.position - b.position) || (a.id - b.id));
  return merged;
}
export function previewNavScoped(items, rows, location, scopeType, scopeRef) {
  const draft = rows?.nav; if (!draft) return items;
  const auto = (items || []).filter((r) => Number(r.auto_generated) === 1);
  const manual = Object.entries(draft).filter(([, r]) => r.location === location && r.enabled && r.scope_type === scopeType && r.scope_ref === scopeRef)
    .map(([k, r], i) => ({ id: numId(k, i), label: r.label, url: r.url, parent_id: null, position: r.position, location: r.location, is_external: r.is_external ? 1 : 0, icon: r.icon || null, enabled: 1, auto_generated: 0, scope_type: r.scope_type, scope_ref: r.scope_ref }));
  return [...auto, ...manual].sort((a, b) => (a.position - b.position) || (a.id - b.id));
}

// The same visibility rule as filterPageNavItemsByGeo (database/nav.js), on in-memory rules (preview only).
export function previewGeoFilter(items, country) {
  if (!country) return items;
  return items.filter((item) => {
    const rules = [...parseGeo(item.__geo).rules.entries()].map(([c, s]) => ({ c, s }));
    if (!rules.length) return true;
    const exact = rules.find((r) => r.c === country);
    if (exact) return exact.s === "allowed";
    const hasAllowed = rules.some((r) => r.s === "allowed"), hasBlocked = rules.some((r) => r.s === "blocked" || r.s === "restricted");
    if (hasAllowed && !hasBlocked) return false;
    if (hasBlocked && !hasAllowed) return true;
    return false;
  });
}

// Page row (from getPage) with the draft's search listing.
export function previewPage(page, rows = null) {
  const d = rows?.pages?.[page?.slug];
  if (!page || !d) return page;
  return { ...page, template: d.template || page.template, seo_title: d.seo_title || null, seo_description: d.seo_description || null, seo_keywords: d.seo_keywords || null };
}
// seo_meta row for (type, slug) as the draft would have it, or null when the draft removes it.
export function previewSeo(seo, pageType, pageSlug, rows = null) {
  const set = rows?.seo; if (!set) return seo;
  const d = set[`${pageType}|${pageSlug}`];
  if (!d) return null;
  return { ...(seo || {}), page_type: d.page_type, page_slug: d.page_slug, title: d.title || null, description: d.description || null, keywords: d.keywords || null, canonical: d.canonical || null, og_image: d.og_image || null, robots: d.robots, schema_json: d.schema_json || null };
}
// Joined component rows (placement + component), unfiltered by `enabled`, with the draft applied and then filtered/sorted.
export function previewComponentRows(joined, rows) {
  const pl = rows?.placements, cs = rows?.components;
  const out = [];
  for (const r of joined || []) {
    let x = r;
    const p = pl?.[`p${r.id}`];
    if (pl && !p) continue; // placement does not exist in the draft's view
    if (p) x = { ...x, position: p.position, enabled: p.enabled ? 1 : 0, injection_point: p.injection_point };
    const c = cs?.[`c${r.component_id}`];
    if (c) x = { ...x, name: c.name, title: c.title || null, status: c.status, settings_json: c.settings_json || null };
    if (Number(x.enabled) !== 1) continue;
    out.push(x);
  }
  out.sort((a, b) => (a.position - b.position) || (a.id - b.id));
  return out;
}

// What the screen needs to draw the editors: labels, types, limits. No row data.
export function rowSetsManifest() {
  return SET_IDS.map((id) => { const d = ROW_SETS[id]; return { id, label: d.label, area: d.area, help: d.help, create: d.create, remove: d.remove, fields: d.fields.map((f) => ({ key: f.k, type: f.t === "cjson" ? "json" : f.t, label: f.label, help: f.help, values: f.values, valueLabels: f.valueLabels, max: f.max, min: f.min, required: !!f.req, readonly: !!f.ro })) }; });
}
