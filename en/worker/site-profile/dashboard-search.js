// ============================================================
// DASHBOARD SEARCH (Phase 8): the index behind the global search
// ============================================================
// One search box finds everything a person can do in the dashboard:
//   screens        every link of the dashboard menu (so a renamed or removed screen can never linger in the search)
//   settings       every look-and-feel setting and every editable list of the Configuration screen
//   capabilities   modules, pages and tools, with their current On/Off state
//   content        casinos, reviews, news, pages ... found by title at typing time (see searchContent)
//
// What a person may find is decided HERE, on the server, with the same rules the rest of the dashboard uses:
//   * switched-off modules and tools: their screens and their content are left out (their capabilities stay findable,
//     marked Off, so the person can turn them back on);
//   * roles: administrators see everything; editors only what their permissions allow (read access to the screen's
//     resource); screens that are administrator-only never appear for editors.
// The browser only ranks and shows what the server sent. Nothing here writes to the database.
import { GROUPS, allFields } from "./settings-groups.js";
import { ROW_SETS, SET_IDS } from "./rows.js";
import { MODULES, FEATURES } from "./registry.js";
import { gate, isEnabled, pruneAdminNavHtml } from "./profile.js";
import { checkPermission } from "../database/permissions.js";

export const MAX_QUERY_CHARS = 80;
export const MAX_QUERY_TOKENS = 4;
export const CONTENT_PER_SOURCE = 4;
export const CONTENT_TOTAL = 24;

const decode = (s) => String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const textOf = (h) => decode(String(h).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
export const norm = (s) => String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// ---------- screens ----------
// Words a person might type for a screen that its label does not contain. Keys must be real menu links (a test checks).
export const SCREEN_KEYWORDS = {
  "/en/dashboard": "home start summary stats numbers overview",
  "/en/dashboard/configuration": "setup configure modules pages tools homepage landing draft publish history export import presets site type business",
  "/en/dashboard/casinos": "casino list operators brands sites gambling",
  "/en/dashboard/casino/create": "new casino create operator brand",
  "/en/dashboard/reviews": "review articles ratings casino review write",
  "/en/dashboard/comparisons": "compare versus vs side by side table",
  "/en/dashboard/comparison/create": "new comparison compare create",
  "/en/dashboard/offers": "bonus promotions welcome free spins deals wagering",
  "/en/dashboard/payment-methods": "payments deposit withdraw cards crypto banks wallets",
  "/en/dashboard/content-items": "sportsbook betting items generic listings",
  "/en/dashboard/content-item/create": "new item sportsbook betting create listing",
  "/en/dashboard/custom-types": "custom types own content kinds define new type",
  "/en/dashboard/reviews/generic": "other reviews sportsbook review betting review",
  "/en/dashboard/content-landing-pages": "best of top lists landing seo pages rankings",
  "/en/dashboard/settings/content-types": "content type options sportsbook settings",
  "/en/dashboard/news": "articles stories posts blog editorial",
  "/en/dashboard/newsroom": "editorial desk workflow schedule drafts articles review queue",
  "/en/dashboard/updates": "changelog announcements release notes",
  "/en/dashboard/research": "reports studies data analysis publications",
  "/en/dashboard/research/review-queue": "verify fact check overdue due review",
  "/en/dashboard/research/datasets": "data files tables csv downloads",
  "/en/dashboard/authors": "writers people bios profiles team",
  "/en/dashboard/pages": "static pages about contact privacy terms legal content",
  "/en/dashboard/categories": "topics groups types tags",
  "/en/dashboard/countries": "country nations regions markets",
  "/en/dashboard/country-pages": "country landing pages local seo",
  "/en/dashboard/category-countries": "category country combination local seo pages",
  "/en/dashboard/header-hero": "top banner hero header slider logo menu look sticky",
  "/en/dashboard/nav": "menu links header footer navigation mobile menu",
  "/en/dashboard/components": "blocks widgets sections building blocks studio",
  "/en/dashboard/banners": "announcement bar notice popup promo strip live banner popup floating promo",
  "/en/dashboard/seo": "meta titles descriptions search engines google keywords canonical robots",
  "/en/dashboard/media": "images pictures photos upload files library logos videos",
  "/en/dashboard/affiliate-partners": "networks partners affiliates companies",
  "/en/dashboard/affiliate-programs": "programmes commission revenue share cpa",
  "/en/dashboard/affiliate-accounts": "login accounts partner access",
  "/en/dashboard/commercial-terms": "deals rates commission terms payouts contracts",
  "/en/dashboard/tracking-links": "affiliate links go links redirects clicks tracking urls",
  "/en/dashboard/postback-configs": "postback webhook conversions s2s integration",
  "/en/dashboard/provider-adapters": "api adapters providers integration feeds",
  "/en/dashboard/import-history": "imports uploads batches csv history",
  "/en/dashboard/analytics": "traffic visitors clicks stats numbers",
  "/en/dashboard/speed": "performance fast slow core web vitals lighthouse",
  "/en/dashboard/campaigns": "marketing utm sources tracking",
  "/en/dashboard/reports": "export exports summaries scheduled email report",
  "/en/dashboard/geo-rules": "country rules location region block allow restrict",
  "/en/dashboard/geo-rules/defaults": "default country rules fallback",
  "/en/dashboard/geo-rules/bulk": "bulk change many casinos countries at once",
  "/en/dashboard/geo-rules/import-export": "csv import export rules",
  "/en/dashboard/geo-rules/presets": "saved rule sets templates",
  "/en/dashboard/geo-rules/lookup": "which casinos are available in a country check",
  "/en/dashboard/users": "people accounts staff logins members roles",
  "/en/dashboard/item-access": "who can edit this item owners permissions per item",
  "/en/dashboard/subscriptions": "newsletter subscribers mailing list emails",
  "/en/dashboard/emails": "email campaigns newsletters send messages",
  "/en/dashboard/inquiries": "contact messages questions form replies",
  "/en/dashboard/submissions": "user submitted casinos suggestions approve",
  "/en/dashboard/notifications": "alerts messages announcements push",
  "/en/dashboard/permissions": "roles access rights editor admin who can",
  "/en/dashboard/settings": "site name logo colours theme fonts analytics footer compliance general options",
  "/en/dashboard/ai-studio": "ai generate write drafts articles assistant",
  "/en/dashboard/ai": "ai generator write content assistant chat",
};

// Screens only administrators open (mirrors worker/controllers/dashboard.js and static/js/admin-permissions.js).
export const ADMIN_ONLY_SCREENS = new Set([
  "/en/dashboard/inquiries", "/en/dashboard/submissions", "/en/dashboard/notifications", "/en/dashboard/banners",
  "/en/dashboard/ai", "/en/dashboard/item-access", "/en/dashboard/permissions",
]);
// Which permission resource an editor needs (read) to open a screen. Unlisted screens are open to every editor.
export const SCREEN_RESOURCE = {
  "/en/dashboard/casinos": "casinos", "/en/dashboard/casino/create": "casinos",
  "/en/dashboard/reviews": "reviews", "/en/dashboard/news": "news", "/en/dashboard/newsroom": "news",
  "/en/dashboard/updates": "platform-updates", "/en/dashboard/pages": "pages", "/en/dashboard/categories": "categories",
  "/en/dashboard/countries": "countries", "/en/dashboard/authors": "authors", "/en/dashboard/components": "components",
  "/en/dashboard/seo": "seo", "/en/dashboard/media": "media", "/en/dashboard/nav": "nav", "/en/dashboard/users": "users",
  "/en/dashboard/settings": "settings", "/en/dashboard/payment-methods": "payment_methods", "/en/dashboard/offers": "offers",
  "/en/dashboard/comparisons": "comparisons", "/en/dashboard/comparison/create": "comparisons",
  "/en/dashboard/research": "research", "/en/dashboard/research/review-queue": "research", "/en/dashboard/research/datasets": "research_datasets",
  "/en/dashboard/affiliate-partners": "affiliate_partners", "/en/dashboard/affiliate-programs": "affiliate_programs",
  "/en/dashboard/affiliate-accounts": "affiliate_accounts", "/en/dashboard/commercial-terms": "commercial_terms",
  "/en/dashboard/postback-configs": "postback_configs", "/en/dashboard/import-history": "import_batches",
  "/en/dashboard/provider-adapters": "provider_adapter_configs",
};

// The sidebar's links, with the title of the group each one sits in.
export function parseNavScreens(html) {
  const out = [], seen = new Set();
  const add = (chunk, group) => {
    for (const m of String(chunk).matchAll(/<a\b[^>]*href="(\/en\/dashboard[^"#?]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = textOf(m[2]);
      if (!label || seen.has(m[1])) continue;
      seen.add(m[1]); out.push({ href: m[1], label, group });
    }
  };
  let rest = String(html || "");
  for (const b of [...rest.matchAll(/<details\b[^>]*data-group="([^"]*)"[^>]*>([\s\S]*?)<\/details>/gi)]) {
    const title = textOf((b[2].match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1] || "");
    add(b[2].replace(/<summary[\s\S]*?<\/summary>/i, ""), title || b[1]);
    rest = rest.replace(b[0], "");
  }
  add(rest, "General");
  return out;
}

export function screenAllowed(href, user, perms) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "editor") return false;
  if (ADMIN_ONLY_SCREENS.has(href)) return false;
  const res = SCREEN_RESOURCE[href];
  return !res || checkPermission(perms, res, "read");
}

// ---------- the index ----------
const item = (id, kind, label, sub, href, group, kw, extra = {}) => ({ id, kind, label: clip(label, 90), sub: clip(sub, 160), href, group: clip(group, 60), keywords: norm(kw).slice(0, 400), ...extra });

const TOOLS = [
  ["t:export", "Export a configuration", "Download chosen parts of this site's setup as a file.", "#xferSection", "export download backup save copy clone configuration file json"],
  ["t:import", "Import a configuration", "Load a file or a share code into your draft and review it first.", "#xferSection", "import upload restore copy clone another site configuration file share code"],
  ["t:presets", "Saved presets", "Reuse a saved setup on this site.", "#xferSection", "presets templates saved setups library reuse"],
  ["t:history", "Version history and rollback", "See every published version and go back to one.", "#cfgHistory", "history versions rollback restore undo previous published"],
  ["t:publish", "Review and publish the draft", "Check what will change, then publish it.", "#cfgBar", "publish draft review go live changes confirm"],
];

export function buildSearchIndex({ navHtml, profile, user, perms }) {
  const screens = parseNavScreens(pruneAdminNavHtml(navHtml, profile))
    .filter((s) => screenAllowed(s.href, user, perms))
    .map((s) => item(`s:${s.href}`, "screen", s.label, s.group, s.href, s.group, `${s.label} ${s.group} ${SCREEN_KEYWORDS[s.href] || ""}`));

  const cfg = "/en/dashboard/configuration";
  const settings = [];
  for (const g of GROUPS) settings.push(item(`g:${g.id}`, "setting", g.label, `Look and feel · ${g.help || ""}`, `${cfg}#look-${g.id}`, "Look and feel", `${g.label} ${g.id} ${g.help || ""}`));
  for (const f of allFields()) {
    const g = GROUPS.find((x) => x.id === f.group);
    // Managed wording (about 190 fields) is indexed by label, key and section only, so the one-shot index stays small.
    const lean = !!f.section;
    settings.push(item(`f:${f.key}`, "setting", f.label, `${g ? g.label : f.group} · ${lean ? f.section : f.help || ""}`, `${cfg}#look-${f.group}`, g ? g.label : "Look and feel", `${f.label} ${f.key.replace(/_/g, " ")} ${lean ? f.section : f.help || ""} ${g ? g.label : ""}`));
  }
  for (const id of SET_IDS) {
    const d = ROW_SETS[id];
    settings.push(item(`r:${id}`, "setting", d.label, `${d.area} · ${d.help || ""}`, `${cfg}#rows-${id}`, d.area, `${d.label} ${d.area} ${d.help || ""}`));
  }
  for (const [id, label, sub, hash, kw] of TOOLS) settings.push(item(id, "setting", label, sub, cfg + hash, "Configuration", `${label} ${kw}`));

  const capabilities = [];
  const state = (cap) => (isEnabled(profile, cap) ? "on" : "off");
  const sub = (cap, text) => `${state(cap) === "on" ? "On" : "Off, turn it on in Configuration"} · ${text}`;
  for (const [mid, m] of Object.entries(MODULES)) {
    capabilities.push(item(`c:${mid}`, "capability", m.label, sub(mid, m.desc || ""), `${cfg}#cfgModules`, "Modules", `${m.label} ${m.desc || ""} ${m.help || ""} ${mid}`, { state: state(mid) }));
    for (const [pid, p] of Object.entries(m.pages || {})) {
      const cap = `${mid}.${pid}`;
      capabilities.push(item(`c:${cap}`, "capability", p.label, sub(cap, `${m.label}. ${p.desc || ""}`), `${cfg}#cfgModules`, m.label, `${p.label} ${m.label} ${p.desc || ""} ${pid}`, { state: state(cap) }));
    }
  }
  for (const [fid, f] of Object.entries(FEATURES)) {
    const cap = `features.${fid}`;
    capabilities.push(item(`c:${cap}`, "capability", f.label, sub(cap, f.desc || ""), `${cfg}#cfgFeatures`, "Tools", `${f.label} ${f.desc || ""} ${f.help || ""} ${fid}`, { state: state(cap) }));
  }
  return { screens, settings, capabilities };
}

// ---------- content found by title ----------
// Each source: the dashboard route type that decides whether its module is on, the permission resource an editor needs,
// the columns searched, and how to show and open a hit. Hits open the item's editor when the dashboard has one for it,
// otherwise the list screen it lives in.
const SOURCES = [
  { id: "casinos", label: "Casino", route: "dashboardCasinos", resource: "casinos", table: "casinos", match: ["name", "slug"], title: "name", href: (r) => `/en/dashboard/casino/edit/${encodeURIComponent(r.slug)}`, cols: ["name", "slug", "status"], sub: (r) => r.status || "" },
  { id: "reviews", label: "Review", route: "dashboardReviews", resource: "reviews", table: "reviews", match: ["title", "slug", "casino_slug"], title: "title", href: () => "/en/dashboard/reviews", cols: ["title", "slug", "casino_slug"], sub: (r) => r.casino_slug || "" },
  { id: "news", label: "News article", route: "dashboardNews", resource: "news", table: "news", match: ["title", "slug"], title: "title", href: () => "/en/dashboard/news", cols: ["title", "slug"], sub: () => "" },
  { id: "pages", label: "Page", route: "dashboardPages", resource: "pages", table: "pages", match: ["title", "slug"], title: "title", href: () => "/en/dashboard/pages", cols: ["title", "slug"], sub: (r) => `/${r.slug}` },
  { id: "authors", label: "Author", route: "dashboardAuthors", resource: "authors", table: "authors", match: ["name", "slug"], title: "name", href: () => "/en/dashboard/authors", cols: ["name", "slug"], sub: () => "" },
  { id: "categories", label: "Category", route: "dashboardCategories", resource: "categories", table: "categories", match: ["name", "slug"], title: "name", href: () => "/en/dashboard/categories", cols: ["name", "slug"], sub: () => "" },
  { id: "countries", label: "Country", route: "dashboardCountries", resource: "countries", table: "countries", match: ["name", "code"], title: "name", href: () => "/en/dashboard/countries", cols: ["name", "code"], sub: (r) => r.code || "" },
  { id: "research", label: "Research", route: "dashboardResearch", resource: "research", table: "research_items", match: ["title", "slug"], title: "title", href: () => "/en/dashboard/research", cols: ["title", "slug", "type"], sub: (r) => r.type || "" },
  { id: "items", label: "Content item", route: "dashboardContentItems", resource: null, table: "content_items", match: ["name", "title", "slug"], title: "name", href: (r) => `/en/dashboard/content-item/edit/${encodeURIComponent(r.content_type)}/${encodeURIComponent(r.slug)}`, cols: ["name", "title", "slug", "content_type"], sub: (r) => r.content_type || "" },
  { id: "comparisons", label: "Comparison", route: "dashboardComparisons", resource: "comparisons", table: "comparisons", match: ["title", "slug"], title: "title", href: (r) => `/en/dashboard/comparison/edit/${encodeURIComponent(r.content_type)}/${encodeURIComponent(r.slug)}`, cols: ["title", "slug", "content_type"], sub: (r) => r.content_type || "" },
  { id: "landing", label: "Landing page", route: "dashboardContentLandingPages", resource: null, table: "content_landing_pages", match: ["title", "slug"], title: "title", href: (r) => `/en/dashboard/content-landing-page/edit/${encodeURIComponent(r.slug)}`, cols: ["title", "slug"], sub: () => "" },
  { id: "custom", label: "Custom type", route: "dashboardCustomTypes", resource: null, table: "custom_content_types", match: ["label", "slug"], title: "label", href: (r) => `/en/dashboard/custom-type/edit/${encodeURIComponent(r.slug)}`, cols: ["label", "slug"], sub: () => "" },
  { id: "updates", label: "Platform update", route: "dashboardUpdates", resource: "platform-updates", table: "platform_updates", match: ["title", "slug"], title: "title", href: () => "/en/dashboard/updates", cols: ["title", "slug"], sub: () => "" },
  { id: "payments", label: "Payment method", route: "dashboardPaymentMethods", resource: "payment_methods", table: "payment_methods", match: ["name", "slug"], title: "name", href: () => "/en/dashboard/payment-methods", cols: ["name", "slug"], sub: () => "" },
  { id: "partners", label: "Affiliate partner", route: "dashboardAffiliatePartners", resource: "affiliate_partners", table: "affiliate_partners", match: ["name", "slug"], title: "name", href: () => "/en/dashboard/affiliate-partners", cols: ["name", "slug"], sub: () => "" },
  { id: "media", label: "Media file", route: "dashboardMedia", resource: "media", table: "media_library", match: ["filename", "original_filename", "alt_text"], title: "filename", href: () => "/en/dashboard/media", cols: ["filename", "original_filename", "alt_text"], sub: (r) => r.alt_text || "" },
];
export const CONTENT_SOURCE_IDS = SOURCES.map((s) => s.id);

const like = (t) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const starts = (t) => `${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// The words to look for. Short noise is dropped; at most MAX_QUERY_TOKENS words, each cut to 40 characters.
export function queryTokens(q) {
  return norm(clip(q, MAX_QUERY_CHARS)).split(" ").filter((t) => t.length >= 1).slice(0, MAX_QUERY_TOKENS).map((t) => t.slice(0, 40));
}

function sourceAllowed(src, { profile, user, perms }) {
  if (!user) return false;
  if (gate({ type: src.route }, profile).action !== "pass") return false;
  if (user.role === "admin") return true;
  if (user.role !== "editor") return false;
  return !src.resource || checkPermission(perms, src.resource, "read");
}

export async function searchContent(env, { q, profile, user, perms }) {
  const tokens = queryTokens(q);
  if (!tokens.length || tokens.join("").length < 2) return { results: [], searched: [], tokens };
  const active = SOURCES.filter((s) => sourceAllowed(s, { profile, user, perms }));
  const settled = await Promise.all(active.map(async (src) => {
    try {
      const where = tokens.map(() => `(${src.match.map((c) => `LOWER(COALESCE(${c}, '')) LIKE ? ESCAPE '\\'`).join(" OR ")})`).join(" AND ");
      const binds = tokens.flatMap((t) => src.match.map(() => like(t)));
      const first = src.match[0];
      const sql = `SELECT ${src.cols.join(", ")} FROM ${src.table} WHERE ${where} ORDER BY (CASE WHEN LOWER(COALESCE(${first}, '')) LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END), LENGTH(COALESCE(${first}, '')) LIMIT ?`;
      const rows = (await env.DB.prepare(sql).bind(...binds, starts(tokens[0]), CONTENT_PER_SOURCE).all()).results || [];
      return rows.map((r) => item(`x:${src.id}:${r.slug ?? r.code ?? r.filename ?? r.title}`, "content", r[src.title] || r.slug || "(untitled)", `${src.label}${src.sub(r) ? ` · ${src.sub(r)}` : ""}`, src.href(r), src.label, `${r[src.title] || ""} ${r.slug || ""}`));
    } catch { return null; } // a missing table (older tenant) just means no hits from that source
  }));
  const results = settled.flatMap((r) => r || []).slice(0, CONTENT_TOTAL);
  return { results, searched: active.map((s) => s.id), tokens };
}

// ---------- favourites: which saved links are still valid ----------
export function safeDashboardHref(h) {
  const s = String(h == null ? "" : h);
  if (s.length < 12 || s.length > 300) return null;
  if (!/^\/en\/dashboard(\/[A-Za-z0-9._~%\-\/]*)?(#[A-Za-z0-9_\-]*)?$/.test(s)) return null;
  if (s.includes("//") || s.includes("..")) return null;
  return s;
}
