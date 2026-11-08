// Server-side targeting: exact ISO country match (never LIKE), page type / slug, schedule, status, and the geo rule for casinos.
const norm = (s) => String(s ?? "").trim();
const ts = (s) => (s ? Date.parse(String(s).replace(" ", "T") + "Z") : null);

export function inSchedule(b, now = Date.now()) {
  const a = ts(b.start_at), z = ts(b.end_at);
  return (a === null || a <= now) && (z === null || z >= now);
}

export function countryOk(t, country) {
  const list = (t?.countries || []).map((c) => norm(c).toUpperCase());
  if (!list.length) return true;
  const hit = !!country && list.includes(norm(country).toUpperCase());
  return t.countries_mode === "exclude" ? !hit : hit;
}

export function pageOk(t, pageType, slug) {
  const types = t?.page_types || [], slugs = t?.slugs || [];
  if (!types.length && !slugs.length) return true;
  const hit = types.includes(pageType) || (!!slug && slugs.includes(slug));
  return t.pages_mode === "exclude" ? !hit : hit;
}

export function authOk(t, signedIn) {
  const a = t?.auth || "any";
  return a === "any" || (a === "signed_in" ? !!signedIn : !signedIn);
}

/** Same inference as /api/v1/geo/check: no rules -> blocked; allow-list only -> others blocked; block-list only -> others allowed. */
export function casinoAllowed(rules, country) {
  const list = rules || [];
  const own = list.find((r) => r.country_code === country);
  if (own) return own.status === "allowed";
  if (!list.length) return false;
  const allowed = list.some((r) => r.status === "allowed"), blocked = list.some((r) => r.status === "blocked");
  return blocked && !allowed;
}

/** Country-level filter used before caching (page-level filtering happens per request). */
export function forCountry(banners, country, now = Date.now()) {
  return banners.filter((b) => b.status === "live" && inSchedule(b, now) && countryOk(b.targeting, country));
}

export function forPage(banners, { pageType, slug, signedIn = false } = {}) {
  return banners.filter((b) => pageOk(b.targeting, pageType, slug) && authOk(b.targeting, signedIn));
}
