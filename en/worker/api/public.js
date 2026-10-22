// Routes that work without signing in (login, register, newsletter, public lists, postback).
// They run before the sign-in check in worker/api.js.
import { searchSite } from "../site-search.js";
import * as news from "../database/news.js";
import { speedSummary } from "../perf.js";
import { handlePostbackRequest } from "../postback/handler.js";
import { sanitizePublicNewsList } from "../newsroom-render.js";
import { login, logout, register, forgotPassword, resetPassword, changePassword } from "../auth.js";
import { subscribeNewsletter } from "../newsletter.js";
import { constantTimeEqual } from "../super/auth.js";
import { getCached, setCached, CACHE_KEYS } from "../cache.js";
import { NOT_HANDLED, failure, json, requireAdmin } from "./helpers.js";

export async function publicRoutes({ request, env, path, user }) {

  // ----------------------------------
  // Require Login
  // ----------------------------------
  if(path === "/api/v1/auth/login"){
  return login(request,env);
}

if (path === "/api/v1/auth/register") {
  return register(request, env);
}

if(path === "/api/v1/auth/logout"){
  return logout(request,env);
}

if (path === "/api/v1/auth/forgot-password" && request.method === "POST") {
  return forgotPassword(request, env);
}

if (path === "/api/v1/auth/reset-password" && request.method === "POST") {
  return resetPassword(request, env);
}

if (path === "/api/v1/auth/change-password" && request.method === "POST") {
  return changePassword(request, env);
}

if (path === "/api/v1/newsletter/subscribe" && request.method === "POST") {
  return subscribeNewsletter(request, env);
}

if (path === "/api/v1/speed/summary" && request.method === "GET") {
  const denied = requireAdmin(user);
  if (denied) return denied;
  return json(await speedSummary(env));
}

if (path === "/api/v1/geo/check") {  
  const url = new URL(request.url);  
  const slug = url.searchParams.get("slug");  
  if (!slug) return failure("slug is required");  
  
  const country = request.cf?.country || null;  
    
  // Get ALL rules for this casino  
  const allRules = await env.DB.prepare(`  
    SELECT country_code, status FROM geo_rules  
    WHERE casino_slug = ?  
  `).bind(slug).all();  
    
  const rules = allRules.results || [];  
    
  // Check if this specific country has a rule  
  const countryRule = rules.find(r => r.country_code === country);  
    
  let status;  
  if (countryRule) {  
    status = countryRule.status;  
  } else if (rules.length === 0) {  
    // No rules at all → blocked  
    status = "blocked";  
  } else {  
    // No rule for this country — infer  
    const hasAllowed = rules.some(r => r.status === "allowed");  
    const hasBlocked = rules.some(r => r.status === "blocked");  
      
    if (hasAllowed && !hasBlocked) {  
      status = "blocked"; // Allowlist mode → blocked  
    } else if (hasBlocked && !hasAllowed) {  
      status = "allowed"; // Blocklist mode → allowed  
    } else {  
      status = "blocked"; // Mixed → blocked  
    }  
  }  
  
  const COUNTRY_NAMES = {RW:"Rwanda",US:"United States",CA:"Canada",GB:"United Kingdom",DE:"Germany",FR:"France",IT:"Italy",ES:"Spain",NL:"Netherlands",AU:"Australia",NZ:"New Zealand",JP:"Japan",CN:"China",IN:"India",BR:"Brazil",MX:"Mexico",ZA:"South Africa",NG:"Nigeria",KE:"Kenya",EG:"Egypt",SE:"Sweden",NO:"Norway",DK:"Denmark",FI:"Finland",PL:"Poland",PT:"Portugal",GR:"Greece",TR:"Turkey",RU:"Russia",UA:"Ukraine",AE:"United Arab Emirates",SA:"Saudi Arabia",QA:"Qatar",KR:"South Korea",TH:"Thailand",VN:"Vietnam",PH:"Philippines",ID:"Indonesia",MY:"Malaysia",SG:"Singapore",AR:"Argentina",CL:"Chile",CO:"Colombia",PE:"Peru",AT:"Austria",CH:"Switzerland",IE:"Ireland",BE:"Belgium",CZ:"Czech Republic",HU:"Hungary",RO:"Romania",BG:"Bulgaria",HR:"Croatia",MT:"Malta",CY:"Cyprus",LU:"Luxembourg",IS:"Iceland"};
  return json({
    status,
    country,
    countryName: COUNTRY_NAMES[country] || country,
    bonusOverride: countryRule?.bonus_override || null
  }); 
}
  // One-time admin bootstrap.
  // v7F: this used to be open, so on a freshly provisioned site the first stranger to find the host could make
  // themselves the administrator. It now exists only while the operator has set a SETUP_TOKEN secret on the Worker and
  // the caller presents it (X-Setup-Token); otherwise it answers exactly like any unknown path. Remove the secret
  // after the first administrator exists.
  if (path === "/api/v1/setup/admin" && request.method === "POST") {
    const presented = request.headers.get("X-Setup-Token") || "";
    if (!env.SETUP_TOKEN || String(env.SETUP_TOKEN).length < 16 || !constantTimeEqual(presented, String(env.SETUP_TOKEN))) {
      return failure("Not found", 404);
    }
    const body = await request.json();
    if (!body.email || !body.password) {
      return failure("Email and password required");
    }
    const existing = await env.DB.prepare(
      "SELECT COUNT(*) c FROM users WHERE role = 'admin'"
    ).first();
    if (existing.c > 0) {
      return failure("Admin already exists. Remove this endpoint for security.", 403);
    }
    const { hashPassword } = await import("../auth.js");
    const hash = await hashPassword(body.password);
    await env.DB.prepare(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')"
    ).bind(body.email, hash).run();
    return json({ success: true, message: "Admin created. Remove this endpoint now." });
  }

if (path === "/api/v1/public/reviews/list") {
  const result = await env.DB.prepare(`
    SELECT r.*, c.name as casino_name, c.logo as casino_logo
    FROM reviews r
    LEFT JOIN casinos c ON c.slug = r.casino_slug
    WHERE r.published = 1 AND (r.reviewed_content_type IS NULL OR r.reviewed_content_type = 'casino')
    ORDER BY r.created_at DESC
  `).all();
  return json({ reviews: result.results });
}

if (path === "/api/v1/public/casino-reviews") {
  const url = new URL(request.url);
  const casinoSlug = url.searchParams.get("casino_slug");
  if (!casinoSlug) return json({ reviews: [] });
  // Only what the casino page shows (title, rating, a short excerpt), not
  // every full review body.
  const result = await env.DB.prepare(`
    SELECT slug, title, rating, casino_slug, substr(content, 1, 200) AS content
    FROM reviews
    WHERE casino_slug = ? AND published = 1
      AND (reviewed_content_type IS NULL OR reviewed_content_type = 'casino')
    ORDER BY created_at DESC
  `).bind(casinoSlug).all();
  return json({ reviews: result.results });
}

if (path === "/api/v1/public/casinos/list") {
  let casinos = await getCached(env, CACHE_KEYS.PUBLIC_CASINOS);
  if (!casinos) {
    const result = await env.DB.prepare(`
      SELECT slug, name, logo, rating FROM casinos
      WHERE published = 1 AND status = 'published'
      ORDER BY featured DESC, sort_order ASC, rating DESC
    `).all();
    casinos = result.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_CASINOS, casinos);
  }
  return json({ casinos });
}

if (path === "/api/v1/public/search") {
  const url = new URL(request.url);
  const found = await searchSite(env.DB, url.searchParams.get("q") || "", {
    perGroup: url.searchParams.get("limit") || 5
  });
  return json(found);
}

if (path === "/api/v1/public/news/list") {
  // A short list is all any public page shows (sidebar, home). Sending every
  // article in full to every visitor made each page load megabytes heavier.
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  let newsList;

  if (q) {
    newsList = await news.getLatestNews(env.DB, 20, q);
  } else {
    newsList = await getCached(env, CACHE_KEYS.PUBLIC_NEWS);

    if (!newsList) {
      newsList = await news.getLatestNews(env.DB, 12);

      await setCached(
        env,
        CACHE_KEYS.PUBLIC_NEWS,
        newsList
      );
    }

    // Also shrinks a longer list cached by an older version of this endpoint.
    newsList = newsList.slice(0, 12).map((row) => (
      row && typeof row.content === "string" && row.content.length > 300
        ? { ...row, content: row.content.slice(0, 300) }
        : row
    ));
  }

  // Allow-list the public payload (drops created_by, ad_mode, ad_override_rules and any future private column).
  return json({ news: sanitizePublicNewsList(newsList) });
}

if (path === "/api/v1/public/casinos/geo") {
  const country = request.cf?.country || null;

  // Try cached casinos + geo rules
  let casinoList = await getCached(env, CACHE_KEYS.PUBLIC_CASINOS);
  let allRules = await getCached(env, CACHE_KEYS.PUBLIC_GEO_RULES);

  if (!casinoList) {
    const result = await env.DB.prepare(`
      SELECT slug, name, logo, rating, bonus_title, bonus_value, website_url
      FROM casinos
      WHERE published = 1 AND status = 'published'
      ORDER BY featured DESC, sort_order ASC, rating DESC
    `).all();
    casinoList = result.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_CASINOS, casinoList);
  }

  if (!allRules) {
    const rulesResult = await env.DB.prepare(`
      SELECT casino_slug, country_code, status FROM geo_rules
    `).all();
    allRules = rulesResult.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_GEO_RULES, allRules);
  }

  if (casinoList.length === 0) return json({ casinos: [], country });

  // Group rules by casino slug
  const rulesByCasino = {};
  for (const row of allRules) {
    if (!rulesByCasino[row.casino_slug]) rulesByCasino[row.casino_slug] = [];
    rulesByCasino[row.casino_slug].push(row);
  }

  // Compute geo status per casino
  const geoCasinos = casinoList.map(casino => {
    const rules = rulesByCasino[casino.slug] || [];
    let geoStatus = "blocked";

    if (rules.length === 0) {
      geoStatus = "blocked";
    } else {
      const countryRule = rules.find(r => r.country_code === country);
      if (countryRule) {
        geoStatus = countryRule.status;
      } else {
        const hasAllowed = rules.some(r => r.status === "allowed");
        const hasBlocked = rules.some(r => r.status === "blocked");
        if (hasAllowed && !hasBlocked) geoStatus = "blocked";
        else if (hasBlocked && !hasAllowed) geoStatus = "allowed";
        else geoStatus = "blocked";
      }
    }

    return { ...casino, geo_status: geoStatus };
  });

  // Sort: available first (by rating desc), then unavailable (by rating desc)
  geoCasinos.sort((a, b) => {
    const aAvail = a.geo_status === "allowed" ? 1 : 0;
    const bAvail = b.geo_status === "allowed" ? 1 : 0;
    if (aAvail !== bAvail) return bAvail - aAvail;
    return (b.rating || 0) - (a.rating || 0);
  });

  return json({ casinos: geoCasinos, country });
}

if (path === "/api/v1/public/reviews/geo") {
  const country = request.cf?.country || null;
  const result = await env.DB.prepare(`
    SELECT r.*, c.name as casino_name, c.logo as casino_logo, c.slug as casino_slug
    FROM reviews r
    LEFT JOIN casinos c ON c.slug = r.casino_slug
    WHERE r.published = 1 AND (r.reviewed_content_type IS NULL OR r.reviewed_content_type = 'casino')
    ORDER BY r.created_at DESC
  `).all();

  const reviews = result.results || [];
  if (reviews.length === 0) return json({ reviews: [] });

  // Get geo rules for all casinos referenced by reviews
  const casinoSlugs = [...new Set(reviews.filter(r => r.casino_slug).map(r => r.casino_slug))];
  if (casinoSlugs.length === 0) return json({ reviews, country });

  const placeholders = casinoSlugs.map(() => '?').join(',');
  const rulesResult = await env.DB.prepare(`
    SELECT casino_slug, country_code, status FROM geo_rules
    WHERE casino_slug IN (${placeholders})
  `).bind(...casinoSlugs).all();

  const rulesByCasino = {};
  for (const row of (rulesResult.results || [])) {
    if (!rulesByCasino[row.casino_slug]) rulesByCasino[row.casino_slug] = [];
    rulesByCasino[row.casino_slug].push(row);
  }

  const geoReviews = reviews.map(review => {
    if (!review.casino_slug) return { ...review, geo_status: "unknown" };
    const rules = rulesByCasino[review.casino_slug] || [];
    let geoStatus = "blocked";

    if (rules.length === 0) {
      geoStatus = "blocked";
    } else {
      const countryRule = rules.find(r => r.country_code === country);
      if (countryRule) {
        geoStatus = countryRule.status;
      } else {
        const hasAllowed = rules.some(r => r.status === "allowed");
        const hasBlocked = rules.some(r => r.status === "blocked");
        if (hasAllowed && !hasBlocked) geoStatus = "blocked";
        else if (hasBlocked && !hasAllowed) geoStatus = "allowed";
        else geoStatus = "blocked";
      }
    }

    return { ...review, geo_status: geoStatus };
  });
    // Geo-rank: available first (by rating desc), then unavailable (by rating desc)
  geoReviews.sort((a, b) => {
    const aAvail = a.geo_status === "allowed" ? 1 : 0;
    const bAvail = b.geo_status === "allowed" ? 1 : 0;
    if (aAvail !== bAvail) return bAvail - aAvail;
    return (b.rating || 0) - (a.rating || 0);
  });

  return json({ reviews: geoReviews, country });
}

if (path === "/api/v1/public/categories/list") {
  let categories = await getCached(env, CACHE_KEYS.PUBLIC_CATEGORIES);
  if (!categories) {
    const result = await env.DB.prepare(`
      SELECT * FROM categories ORDER BY name
    `).all();
    categories = result.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_CATEGORIES, categories, 600);
  }
  return json({ categories });
}

if (path === "/api/v1/public/countries/list") {
  let countries = await getCached(env, CACHE_KEYS.PUBLIC_COUNTRIES);
  if (!countries) {
    const result = await env.DB.prepare(`
      SELECT * FROM countries ORDER BY name
    `).all();
    countries = result.results || [];
    await setCached(env, CACHE_KEYS.PUBLIC_COUNTRIES, countries, 600);
  }
  return json({ countries });
}

// ── Universal S2S conversion postback (brief §4-6) ──
// Deliberately unauthenticated at the session-user level, same as the
// /api/v1/public/* routes above -- this endpoint authenticates each
// request itself, per postback_configs row, in
// worker/postback/handler.js (HMAC/shared-secret/API-key/signed-query,
// never a login cookie). This is the endpoint the comment further
// below (search "an unauthenticated public postback endpoint") used to
// flag as not yet built.
if (path.startsWith("/api/v1/conversions/postback/") && (request.method === "POST" || request.method === "GET")) {
  const token = path.slice("/api/v1/conversions/postback/".length);
  if (!token) return failure("Not found", 404);
  return handlePostbackRequest(request, env, token);
}

  return NOT_HANDLED;
}
