// ============================================================
// SITE PROFILE: guidance layer (Phase 4)
// Pure functions, no I/O. Turns a configuration into plain-language help:
//   WIZARD       "What business are you running?" -> preset
//   previewChange what a change adds/removes, with a risk level
//   diagnose     conflicts and recommendations, each with a one-click fix
//   nextSteps    what is still empty
// ============================================================
import { MODULES, PRESETS, FEATURES, SITEMAP_CAP } from "./registry.js";
import { applyPreset, validateProfile, isEnabled, classifyPath, normalizeProfile } from "./profile.js";

export const WIZARD = [
  { id: "full",         title: "Everything",                    example: "A full iGaming portal with news, casinos, reviews and research.", learn: "All tools on. Switch parts off any time." },
  { id: "news",         title: "A news site",                   example: "Daily iGaming news with authors and search.",                      learn: "Newsroom, articles, topics and authors. No casino pages." },
  { id: "casino-list",  title: "A casino listing",              example: "A directory of casinos with offers, countries and payments.",       learn: "Casino list and casino pages, with a homepage." },
  { id: "casino-only",  title: "A casino list, no homepage",    example: "Visitors land straight on the list of casinos.",                    learn: "Casino list only. The homepage redirects to it." },
  { id: "list-reviews", title: "Casinos and their reviews",     example: "A casino directory with written reviews.",                          learn: "Casino list, casino pages, reviews and comparisons." },
  { id: "sportsbook",   title: "A sportsbook listing",          example: "Compare sportsbooks with offers and reviews.",                      learn: "Sportsbook list, detail and review pages only." },
  { id: "research",     title: "A research publication",        example: "Studies and datasets with an editorial review queue.",              learn: "Research hub, items and authors." },
  { id: "static",       title: "A simple website",              example: "About, contact, legal and other ordinary pages.",                   learn: "Ordinary pages only. No casinos, news or reviews." },
];

export function wizardOptions() {
  return WIZARD.filter((w) => PRESETS[w.id]).map((w) => ({ ...w, label: PRESETS[w.id].label, profile: applyPreset(w.id) }));
}

// ---- Inventory of switchable things, with labels ----
function inventory() {
  const rows = [];
  for (const [mid, m] of Object.entries(MODULES)) {
    rows.push({ id: mid, label: m.label, kind: "module" });
    for (const [pid, pg] of Object.entries(m.pages)) rows.push({ id: `${mid}.${pid}`, label: `${m.label}: ${pg.label}`, kind: "page" });
  }
  for (const [fid, f] of Object.entries(FEATURES)) rows.push({ id: `features.${fid}`, label: f.label, kind: "feature" });
  return rows;
}
const INV = inventory();

// Which content counts make a removal "carry traffic".
const TRAFFIC = { casino: "casinos", "casino.detail": "casinos", "casino.list": "casinos", reviews: "reviews", "reviews.detail": "reviews", news: "news", "news.article": "news", authors: "authors", research: "research" };

export function previewChange(before, after, counts = {}) {
  const removed = [], added = [];
  for (const row of INV) {
    const was = isEnabled(before, row.id), now = isEnabled(after, row.id);
    if (was && !now) removed.push(row); else if (!was && now) added.push(row);
  }
  // Report modules and features; list page families only when their module stays on.
  const keep = (r) => r.kind !== "page" || isEnabled(after, r.id.split(".")[0]);
  const removedShown = removed.filter(keep), addedShown = added.filter(keep);
  let urls = 0; const seen = new Set();
  for (const r of removed) { const k = TRAFFIC[r.id]; if (k && !seen.has(k)) { seen.add(k); urls += Number(counts[k]) || 0; } }
  const screens = new Set();
  for (const r of removed) {
    const types = r.kind === "module" ? MODULES[r.id].dashboard : r.kind === "feature" ? FEATURES[r.id.slice(9)].dashboard
      : (MODULES[r.id.split(".")[0]].pages[r.id.split(".")[1]].dashboard || []);
    types.forEach((t) => screens.add(t));
  }
  const sitemaps = Object.entries(SITEMAP_CAP).filter(([, cap]) => isEnabled(before, cap) && !isEnabled(after, cap)).map(([t]) => t);
  const landingChanged = (before.homepage ? "/en" : before.landing) !== (after.homepage ? "/en" : after.landing);
  const mode = after.disabled?.mode;
  let risk = "low";
  if (removedShown.some((r) => r.kind !== "feature")) risk = "medium";
  if (urls > 0 && mode !== "301") risk = "high";
  const notes = [];
  if (urls > 0 && mode !== "301") notes.push(`About ${urls} published page${urls === 1 ? "" : "s"} will stop working. Search engines may drop them. Consider "301 Redirect" or "410 Gone" under Removed pages.`);
  if (landingChanged) notes.push("Your homepage address (/ and /en) will lead somewhere different.");
  if (removedShown.length && mode === "404") notes.push("Removed pages will show 404 Not found. Choose 410 if they are gone for good.");
  return {
    risk, removed: removedShown.map((r) => ({ id: r.id, label: r.label, kind: r.kind })), added: addedShown.map((r) => ({ id: r.id, label: r.label, kind: r.kind })),
    affectedPages: urls, dashboardScreensHidden: screens.size, sitemapFilesRemoved: sitemaps.length, landingChanged, notes,
    confirm: risk === "high" ? notes[0] : "",
  };
}

// ---- Conflicts and recommendations (each with a ready-made fixed profile) ----
const withPatch = (profile, patch) => {
  const n = JSON.parse(JSON.stringify(profile));
  for (const [k, v] of Object.entries(patch.modules || {})) n.modules[k] = v;
  for (const [k, v] of Object.entries(patch.pages || {})) { if (v) delete n.pages[k]; else n.pages[k] = false; }
  for (const [k, v] of Object.entries(patch.features || {})) { if (v) delete n.features[k]; else n.features[k] = false; }
  if ("homepage" in patch) n.homepage = patch.homepage;
  if (patch.disabled) n.disabled = { ...n.disabled, ...patch.disabled };
  n.preset = "custom";
  return normalizeProfile(n);
};
const any = (p, caps) => caps.some((c) => isEnabled(p, c));

export function diagnose(profile) {
  const issues = [];
  const add = (id, level, message, label, patch) => issues.push({ id, level, message, fix: { label, profile: withPatch(profile, patch) } });
  const hasListing = any(profile, ["casino", "content"]);

  if (isEnabled(profile, "reviews") && !hasListing && !isEnabled(profile, "casino"))
    add("reviews-need-listing", "warn", "Reviews usually describe casinos or other listed items, but no listing is switched on.", "Switch Casino listings on too", { modules: { casino: true } });
  if (isEnabled(profile, "reviews.comparisons") && !isEnabled(profile, "casino") && !isEnabled(profile, "content"))
    add("comparisons-need-items", "warn", "Comparisons compare listed items, and nothing is listed.", "Switch comparisons off", { pages: { "reviews.comparisons": false } });
  if (isEnabled(profile, "features.geo") && !hasListing)
    add("geo-needs-listing", "warn", "Geo rules choose which casinos and offers each country sees. There is nothing to apply them to.", "Switch Geo rules off", { features: { geo: false } });
  if (isEnabled(profile, "partners") && !hasListing)
    add("partners-need-listing", "warn", "Affiliate and tracking tools work on listed items, and nothing is listed.", "Switch Affiliate & tracking off", { modules: { partners: false } });
  if (isEnabled(profile, "taxonomy") && !any(profile, ["casino", "news", "content"]))
    add("taxonomy-needs-content", "warn", "Category and country pages group content, but no content type is switched on.", "Switch Categories & countries off", { modules: { taxonomy: false } });
  if (isEnabled(profile, "news.taxonomy") && !isEnabled(profile, "news.article"))
    add("news-topics-need-articles", "warn", "Topic pages list news articles, and article pages are switched off.", "Switch topic pages off", { pages: { "news.taxonomy": false } });
  if (isEnabled(profile, "casino.offers") && !isEnabled(profile, "casino.detail"))
    add("offers-need-detail", "warn", "Offers appear on casino pages, and casino pages are switched off.", "Switch casino pages on", { pages: { "casino.detail": true } });
  if (isEnabled(profile, "accounts.area") && !isEnabled(profile, "casino"))
    add("accounts-submit-casino", "warn", "The visitor area includes casino submissions, and casinos are switched off.", "Switch Casino listings on", { modules: { casino: true } });

  // Feature switches that need a module (registry.js FEATURES[x].requires). While the module is off they are hidden anyway
  // (profile.js isEnabled), so the fix is only to switch the dependent switches off, which makes the stored choice match
  // what visitors see. One issue per missing module (Phase 11 / T3).
  const storedOn = (f) => profile.features?.[f] !== false;
  const joinLabels = (ids) => { const l = ids.map((f) => FEATURES[f].label); return l.length < 2 ? l.join("") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`; };
  const groups = {};
  for (const [fid, f] of Object.entries(FEATURES)) if (f.requires && storedOn(fid) && !any(profile, f.requires.split("|"))) (groups[f.requires] = groups[f.requires] || []).push(fid);
  for (const [req, ids] of Object.entries(groups)) {
    const mods = req.split("|"), names = mods.map((m) => MODULES[m]?.label || m);
    add(`features-need-${mods.join("-or-")}`, "warn", `${joinLabels(ids)} need ${names.join(" or ")}, ${names.length === 1 ? "which is switched off" : "and neither is switched on"}, so they stay hidden.`,
      `Switch ${joinLabels(ids)} off`, { features: Object.fromEntries(ids.map((f) => [f, false])) });
  }

  const { errors } = validateProfile(profile);
  for (const e of errors) {
    if (/Landing/.test(e)) add("landing-off", "error", e, "Use the standard homepage", { homepage: true });
    else if (/Redirect/.test(e)) add("redirect-bad", "error", e, "Use 404 Not found instead", { disabled: { mode: "404", redirectTo: "" } });
    else issues.push({ id: "invalid", level: "error", message: e, fix: null });
  }
  return issues;
}

// ---- What is still empty ----
export function nextSteps(profile, facts = {}) {
  const steps = [];
  const push = (id, title, why, href, when = true) => {
    if (!when) return;
    const c = classifyPath(href, profile);
    if (c.capability && !isEnabled(profile, c.capability)) return;
    steps.push({ id, title, why, href });
  };
  push("name", "Set your site name", "It appears in the header, browser tab and emails.", "/en/dashboard/configuration#look-identity", facts.hasSiteName === false);
  push("logo", "Add your logo", "Visitors recognise a site by its logo and name.", "/en/dashboard/configuration#look-identity", facts.hasLogo === false);
  push("description", "Write a default description", "Search engines show it when a page has no description of its own.", "/en/dashboard/configuration#look-identity", facts.hasDescription === false);
  push("share", "Add a social share image", "It is the picture shown when your pages are shared.", "/en/dashboard/configuration#look-identity", facts.hasShareImage === false);
  push("disclaimer", "Add a footer disclaimer", "A short disclosure builds trust, and affiliate sites often need one.", "/en/dashboard/configuration#look-footer", facts.hasFooterDisclaimer === false && (isEnabled(profile, "casino") || isEnabled(profile, "reviews")));
  push("casino", "Add your first casino", "The casino list is empty, so visitors see nothing yet.", "/en/dashboard/casinos", isEnabled(profile, "casino") && facts.casinos === 0);
  push("news", "Publish your first news article", "The news list is empty.", "/en/dashboard/news", isEnabled(profile, "news") && facts.news === 0);
  push("reviews", "Write your first review", "The review list is empty.", "/en/dashboard/reviews", isEnabled(profile, "reviews") && facts.reviews === 0);
  push("authors", "Add an author", "Articles and reviews can show who wrote them.", "/en/dashboard/authors", isEnabled(profile, "authors") && facts.authors === 0);
  push("pages", "Create your legal pages", "Privacy policy and terms build trust and are often required.", "/en/dashboard/pages", facts.pages === 0);
  return { steps, total: steps.length };
}
