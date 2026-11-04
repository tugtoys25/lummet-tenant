// SITE PROFILE: facts about the site (read-only counts) for guidance. Every query is optional; failures yield "unknown".
const COUNTS = { casinos: "SELECT COUNT(*) c FROM casinos WHERE published = 1", reviews: "SELECT COUNT(*) c FROM reviews WHERE published = 1",
  news: "SELECT COUNT(*) c FROM news WHERE published = 1", pages: "SELECT COUNT(*) c FROM pages", authors: "SELECT COUNT(*) c FROM authors",
  research: "SELECT COUNT(*) c FROM research_items" };

export async function loadFacts(env) {
  const facts = {};
  if (!env?.DB) return facts;
  await Promise.all(Object.entries(COUNTS).map(async ([k, sql]) => {
    try { const r = await env.DB.prepare(sql).first(); if (r && Number.isFinite(Number(r.c))) facts[k] = Number(r.c); } catch { /* unknown */ }
  }));
  try {
    const rows = (await env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('site_logo','site_name','site_description','site_og_image','ga_measurement_id','footer_disclaimer')").all()).results || [];
    const has = (k) => rows.some((r) => r.key === k && String(r.value || "").trim() !== "");
    facts.hasLogo = has("site_logo");
    facts.hasSiteName = has("site_name");
    facts.hasDescription = has("site_description");
    facts.hasShareImage = has("site_og_image");
    facts.hasAnalytics = has("ga_measurement_id");
    facts.hasFooterDisclaimer = has("footer_disclaimer");
  } catch { /* unknown */ }
  return facts;
}
