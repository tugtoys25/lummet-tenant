// Review page and review list.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as authors from "../database/authors.js";
import * as casinos from "../database/casinos.js";
import { getReviewBlocks as getReviewBlocksForSlug } from "../database/review_blocks.js";
import * as reviews from "../database/reviews.js";
import { renderSections, faqSchemaScript, renderSectionNav } from "../generic-review-sections.js";
import { getHiddenParts } from "../review-visibility.js";
import { loadReviewStyleSettings, buildReviewStyle } from "../review-style.js";
import { isCasinoReview, CASINO_REVIEWS_SQL, reviewPublicUrl } from "../review-urls.js";
import { geoEngine } from "../geo.js";
import { logEvent as logAnalyticsEvent } from "../database/analytics.js";
import { getRelatedCasinos } from "../database/related-casinos.js";
import { getCached, setCached } from "../cache.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { injectInlineAds } from "./ads.js";
import { buildCasinoCards, buildReviewCasinoCards, evaluateCasinoGeo, resolveBonusOverridesForList } from "./casino-cards.js";
import { cacheHeaders, countryFullName, countryToFlag, escapeHtml } from "./shared.js";
import { render404 } from "./system-pages.js";

export async function renderReview(request, env, slug, ctx = null) {
  const review = await reviews.getReview(env.DB, slug);
  if (!review) return render404(request, env);
  // reviews of sportsbooks / partners / custom content have their own path; not reachable here
  if (!isCasinoReview(review)) {
    // it used to answer here; send old links (and search engines) to the real address
    let customTypeSlug = null;
    if (review.reviewed_content_type === "custom" && review.reviewed_content_id) {
      const ci = await env.DB.prepare("SELECT custom_type_slug FROM content_items WHERE id = ?").bind(review.reviewed_content_id).first();
      customTypeSlug = ci && ci.custom_type_slug;
    }
    const target = review.published ? reviewPublicUrl({ ...review, custom_type_slug: customTypeSlug }) : null;
    if (!target) return render404(request, env);
    return new Response(null, { status: 301, headers: { Location: target } });
  }

  // Analytics (Phase: page-view instrumentation). Cheap edge-provided
  // country only -- no geoEngine.process() call here since reviews
  // don't evaluate a GEO access rule the way casino pages do, and
  // adding one purely for logging would be exactly the kind of
  // unnecessary per-render cost the brief warns against.
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(
      logAnalyticsEvent(env.DB, {
        eventType: 'REVIEW_VIEW',
        reviewId: review.id,
        countryCode: request.cf?.country || null,
        city: request.cf?.city || null,
        referrer: request.headers.get('referer') || null,
        landingPage: `/en/review/${slug}`
      }).catch(() => {})
    );
  }

  const renderer = new Renderer(env, request);

  // Parts switched off in the editor: their content and their tab are both left out.
  const hiddenParts = await getHiddenParts(env.DB, slug);
  if (hiddenParts.has("overview")) review.overview = "";
  if (hiddenParts.has("games")) review.games = "";
  if (hiddenParts.has("bonuses")) review.bonuses = "";
  if (hiddenParts.has("payments")) review.payments = "";
  if (hiddenParts.has("licensing")) review.licenses = "";
  if (hiddenParts.has("more-details")) review.content = "";
  if (hiddenParts.has("verdict")) review.verdict = "";
  if (hiddenParts.has("pros-cons")) { review.pros = "[]"; review.cons = "[]"; }
  if (hiddenParts.has("faq")) review.faq_json = "[]";

  let pros = [], cons = [];

  try {
    const parsedPros = JSON.parse(review.pros || "[]");
    pros = Array.isArray(parsedPros) ? parsedPros : [];
  } catch {}

  try {
    const parsedCons = JSON.parse(review.cons || "[]");
    cons = Array.isArray(parsedCons) ? parsedCons : [];
  } catch {}

  let faqHtml = "";

  try {
    const parsedFaqs = JSON.parse(review.faq_json || "[]");
    const faqs = Array.isArray(parsedFaqs) ? parsedFaqs : [];

    faqHtml = faqs.map(faq => `
    <div class="faq-item">
      <button class="faq-question">
        ${faq.q}
      </button>

      <div class="faq-answer">
        <p>${faq.a}</p>
      </div>
    </div>
  `).join("");

} catch {
  faqHtml = "";
}
  const prosHtml = pros.length
    ? `<ul>${pros.map(p => `<li>${p}</li>`).join("")}</ul>`
    : "";

  const consHtml = cons.length
    ? `<ul>${cons.map(c => `<li>${c}</li>`).join("")}</ul>`
    : "";
  const prosConsHtml = (pros.length || cons.length)
    ? `<div id="pros-cons" class="review-pros-cons">${pros.length ? `<div class="pros-cons-block pros"><h3>Pros</h3>${prosHtml}</div>` : ""}${cons.length ? `<div class="pros-cons-block cons"><h3>Cons</h3>${consHtml}</div>` : ""}</div>`
    : "";

  // Geo evaluation for the casino connected to this review (sync, no DB)
  let geoCountry = "";
  let geoFlag = "";
  if (review.casino_slug) {
    const edgeGeo = {
      country: request.cf?.country || null,
      city: request.cf?.city || "Unknown"
    };
    const geoInfo = geoEngine.process(request, edgeGeo);
    geoCountry = geoInfo.country;
    geoFlag = countryToFlag(geoCountry);
  }

  // All of these are independent of each other, so run them
  // concurrently instead of one-by-one. Also fetches the linked
  // casino exactly once (it was previously fetched twice — once
  // for the casino card, again for the schema/related-casinos).
  const [site, author, casino, geoStatus, allComponents, reviewSections, dynamicSeo, reviewDisplayContent] = await Promise.all([
    getSiteContext(request, env),
    review.author_id ? authors.getAuthorById(env.DB, review.author_id) : Promise.resolve(null),
    review.casino_slug ? casinos.getCasino(env.DB, review.casino_slug) : Promise.resolve(null),
    review.casino_slug ? evaluateCasinoGeo(env, review.casino_slug, geoCountry) : Promise.resolve("allowed"),
    renderer.renderAllComponents("review", slug, ctx),
    getReviewBlocksForSlug(env.DB, slug).then((b) => renderSections(env.DB, b)).catch((e) => { console.error("review sections failed:", e.message); return { html: "", nav: [], faq: [] }; }),
    renderer.loadDynamicSeo("review", slug),
    injectInlineAds(review.content || "", env, request, "review").catch(e => {
      console.error("Inline ad injection error (review):", e.message);
      return review.content || "";
    }),
  ]);

  const casinoName = casino?.name || "";
  const reviewBlocksHtml = reviewSections.html;
  const has = (v) => !!String(v || "").replace(/<[^>]*>/g, "").trim();
  // Summary card: a fact with nothing entered is left out instead of showing an empty cell.
  const plainClip = (v, n) => { const t = String(v || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
  const ratingNum = Math.max(0, Math.min(5, Number(review.rating) || 0));
  const updatedText = (review.updated_at || review.created_at) ? new Date(review.updated_at || review.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
  const facts = [
    casinoName ? ["Casino", escapeHtml(casinoName)] : null,
    author?.name ? ["Reviewed by", escapeHtml(author.name)] : null,
    updatedText ? ["Updated", escapeHtml(updatedText)] : null,
  ].filter(Boolean).map((f) => `<div class="rs-fact"><dt>${f[0]}</dt><dd>${f[1]}</dd></div>`).join("");
  const longFacts = [
    ["🎰", "Best for", review.games], ["🛡️", "License", review.licenses], ["💳", "Payment methods", review.payments], ["🎁", "Bonuses", review.bonuses],
  ].filter((r) => has(r[2])).map((r) => {
    const short = escapeHtml(plainClip(r[2], 150));
    const long = plainClip(r[2], 100000).length > 150;
    return `<div class="rs-long"><div class="rs-long__label"><span aria-hidden="true">${r[0]}</span>${r[1]}</div>` + (long ? `<details class="rs-more"><summary><span class="rs-more__text">${short}</span><span class="rs-more__btn" aria-hidden="true"></span></summary><div class="rs-more__full">${r[2]}</div></details>` : `<p class="rs-long__text">${short}</p>`) + "</div>";
  }).join("");
  const ratingBlock = ratingNum > 0 ? `<div class="rs-rating" aria-label="Rating ${ratingNum} out of 5"><span class="rs-stars" style="--r:${ratingNum}" aria-hidden="true">★★★★★</span><strong>${ratingNum}</strong><span>/ 5</span></div>` : "";
  const summaryRowsHtml = (facts || longFacts || ratingBlock)
    ? `<div class="rs-top">${ratingBlock}${facts ? `<dl class="rs-facts">${facts}</dl>` : ""}</div>${longFacts ? `<div class="rs-longs">${longFacts}</div>` : ""}`
    : "";

  const reviewNavItems = hiddenParts.has("summary") ? [] : [{ id: "summary", title: "Summary" }];
  if (has(review.overview)) reviewNavItems.push({ id: "overview", title: "Overview" });
  if (has(review.games)) reviewNavItems.push({ id: "games", title: "Games" });
  if (has(review.bonuses)) reviewNavItems.push({ id: "bonuses", title: "Bonuses" });
  if (has(review.payments)) reviewNavItems.push({ id: "payments", title: "Payments" });
  if (has(review.licenses)) reviewNavItems.push({ id: "licensing", title: "Licensing" });
  if (has(review.content)) reviewNavItems.push({ id: "more-details", title: "More details" });
  reviewNavItems.push(...reviewSections.nav);
  if (has(review.verdict)) reviewNavItems.push({ id: "verdict", title: "Verdict" });
  if (prosConsHtml) reviewNavItems.push({ id: "pros-cons", title: "Pros & Cons" });
  if (faqHtml) reviewNavItems.push({ id: "faq", title: "FAQ" });

  // casinoCardHtml and relatedCasinosHtml both depend on `casino`
  // above but not on each other, so they run together too.
  const [casinoCardHtml, relatedCasinosHtml] = await Promise.all([
    (async () => {
      if (!casino) return "";
      const reviewBonusOverrides = await resolveBonusOverridesForList(env, [casino], geoCountry);
      return buildReviewCasinoCards(
        [casino],
        { country: geoCountry, statuses: { [casino.slug]: geoStatus } },
        reviewBonusOverrides
      );
    })(),
    (async () => {
      if (!casino) return "";
      const cacheKey = `related_casinos:${casino.id}:${geoCountry || "none"}`;
      try {
        const cached = await getCached(env, cacheKey);
        if (cached !== null) return cached;
      } catch { /* fall through to compute fresh */ }
      try {
        const relatedCasinos = await getRelatedCasinos(env.DB, casino, geoCountry, 6);
        if (relatedCasinos.length === 0) {
          await setCached(env, cacheKey, "", 300);
          return "";
        }
        const relatedGeoData = {
          country: geoCountry,
          statuses: Object.fromEntries(relatedCasinos.map(c => [c.slug, "allowed"]))
        };
        const relatedBonusOverrides = await resolveBonusOverridesForList(env, relatedCasinos, geoCountry);
        const html = buildCasinoCards(relatedCasinos, relatedGeoData, relatedBonusOverrides);
        await setCached(env, cacheKey, html, 300);
        return html;
      } catch (e) {
        console.error("Related casinos failed to load:", e.message);
        return "";
      }
    })(),
  ]);

  const reviewSchema = {
    "@context": "https://schema.org",
    "@type": "Review",
    "headline": review.title,
    "reviewBody": (review.content || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim(),
   // "reviewBody": review.content || "",
    "reviewRating": {
      "@type": "Rating",
      "ratingValue": review.rating || "5",
      "bestRating": 5
    },
    "itemReviewed": {
      "@type": "Casino",
      "name": casino?.name || casinoName || review.title,
     // "name": review.title.replace("Review", "").trim(),
      "url": site.url(`/en/review/${slug}`)
    },
    "author": {
      "@type": "Person",
      "name": author?.name || site.siteName
    },
  "publisher": {
  "@type": "Organization",
  "name": site.siteName,
  "url": site.origin,
  "logo": {
    "@type": "ImageObject",
    "url": site.logoUrl
  }
},
"datePublished": review.created_at
  ? new Date(review.created_at).toISOString()
  : undefined,

"dateModified": (review.updated_at || review.created_at)
  ? new Date(review.updated_at || review.created_at).toISOString()
  : undefined,
};

  const formatDate = (date) => {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
};

  const reviewStyleHtml = buildReviewStyle(await loadReviewStyleSettings(env.DB));
  const html = await renderer.render("review.html", {
    ...review,
    review_style_html: reviewStyleHtml,
    // {{vars}} are not HTML-escaped by the template engine.
    title: escapeHtml(review.title),
    content: reviewDisplayContent,
    casino_name: escapeHtml(casinoName),
    author_name: author?.name || "",
    author_bio: author?.bio || "",
    author_avatar: author?.avatar_url || "",
    author_role: author?.role || "",
    author_slug: author?.slug || "",
    author_social: author?.social_links || "",
    reviewed_at: formatDate(review.created_at),
    updated_at: formatDate(review.updated_at || review.created_at),
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    review_blocks_html: reviewBlocksHtml,
    review_nav_html: renderSectionNav(reviewNavItems),
    faq_schema_html: faqSchemaScript(reviewSections.faq),
    seo_title: dynamicSeo.seo_title || review.seo_title || review.title,
    seo_description: dynamicSeo.seo_description || review.seo_description || "",
    seo_keywords: dynamicSeo.seo_keywords || review.seo_keywords || "",
    og_image: casino?.logo ? site.url(casino.logo) : site.ogImageUrl,
    og_image_alt: casino?.name || review.title,
    canonical: dynamicSeo.canonical || site.url(`/en/review/${slug}`),
    faq_html: faqHtml,
    pros_html: prosHtml,
    cons_html: consHtml,
    pros_cons_html: prosConsHtml,
    summary_rows_html: summaryRowsHtml,
    casino_card_html: casinoCardHtml,
    casino_slug: review.casino_slug || "",
    geo_country: countryFullName(geoCountry),
    geo_status: geoStatus,
    geo_flag: geoFlag,
    related_casinos_html: hiddenParts.has("related-casinos") ? "" : relatedCasinosHtml,
    summary_hidden_attr: hiddenParts.has("summary") ? " hidden" : ""
  }, reviewSchema, buildBreadcrumbs("review", { title: review.title }));

  return new Response(html, {
    headers: cacheHeaders()
  });
}

export async function renderReviewList(request, env) {
  const renderer = new Renderer(env, request);

  const [site, reviewList, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    env.DB.prepare(`SELECT * FROM reviews WHERE published = 1 AND ${CASINO_REVIEWS_SQL} ORDER BY created_at DESC`).all(),
    renderer.renderAllComponents("review_list", "review_list"),
    renderer.loadDynamicSeo("review_list", "review_list"),
  ]);

  // Geo-aware filtering
  const reviews = reviewList.results || [];
  const casinoSlugs = [...new Set(reviews.filter(r => r.casino_slug).map(r => r.casino_slug))];

  let geoStatuses = {};
  let casinoMeta = {};
  if (casinoSlugs.length > 0) {
    const placeholders = casinoSlugs.map(() => '?').join(',');
    // Independent of each other — fetch concurrently.
    const [rulesResult, casinoRows] = await Promise.all([
      env.DB.prepare(`
        SELECT casino_slug, country_code, status FROM geo_rules
        WHERE casino_slug IN (${placeholders})
      `).bind(...casinoSlugs).all(),
      env.DB.prepare(`
        SELECT slug, name, logo FROM casinos WHERE slug IN (${placeholders})
      `).bind(...casinoSlugs).all(),
    ]);

    const rulesByCasino = {};
    for (const row of (rulesResult.results || [])) {
      if (!rulesByCasino[row.casino_slug]) rulesByCasino[row.casino_slug] = [];
      rulesByCasino[row.casino_slug].push(row);
    }

    const country = request.cf?.country || null;
    for (const slug of casinoSlugs) {
      const rules = rulesByCasino[slug] || [];
      if (rules.length === 0) { geoStatuses[slug] = "blocked"; continue; }
      const countryRule = rules.find(r => r.country_code === country);
      if (countryRule) { geoStatuses[slug] = countryRule.status; continue; }
      const hasAllowed = rules.some(r => r.status === "allowed");
      const hasBlocked = rules.some(r => r.status === "blocked");
      if (hasAllowed && !hasBlocked) geoStatuses[slug] = "blocked";
      else if (hasBlocked && !hasAllowed) geoStatuses[slug] = "allowed";
      else geoStatuses[slug] = "blocked";
    }

    for (const row of (casinoRows.results || [])) {
      casinoMeta[row.slug] = row;
    }
  }

    // Geo-rank: available first (by rating desc), then unavailable (by rating desc)
  reviews.sort((a, b) => {
    const aAvail = a.casino_slug && geoStatuses[a.casino_slug] === "allowed" ? 1 : 0;
    const bAvail = b.casino_slug && geoStatuses[b.casino_slug] === "allowed" ? 1 : 0;
    if (aAvail !== bAvail) return bAvail - aAvail;
    return (b.rating || 0) - (a.rating || 0);
  });

  const reviewCards = reviews.map(r => {
    const geoStatus = r.casino_slug ? (geoStatuses[r.casino_slug] || "blocked") : "unknown";
    const geoBadge = geoStatus === "allowed"
      ? '<span class="status-badge status-published">✓ Available</span>'
      : geoStatus === "blocked"
        ? '<span class="status-badge status-draft">✕ Restricted</span>'
        : '<span class="status-badge status-draft">Unknown</span>';

    const casino = r.casino_slug ? casinoMeta[r.casino_slug] : null;
    const casinoImage = casino?.logo || '/static/images/default.png';
    const casinoImageAlt = casino?.name || r.title;

    return `
    <div class="casino-card">
      <div class="casino-card__image">
        <img src="${casinoImage}" alt="${casinoImageAlt}" loading="lazy" onerror="this.src='/static/images/default.png'">
      </div>
      <div class="casino-card__body">
        <h3><a href="/en/review/${r.slug}">${r.title}</a></h3>
        <div class="casino-card__rating">★ ${r.rating ? r.rating + "/5" : "N/A"}</div>
        <p class="muted">${(r.content || "").substring(0, 120)}...</p>
        ${r.casino_slug ? geoBadge : ""}
      </div>
      <div class="casino-card__actions">
        <a href="/en/review/${r.slug}" class="btn btn--primary">Read Review</a>
      </div>
    </div>`;
  }).join("");

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "All Casino Reviews",
    "itemListElement": reviews.map((r, idx) => ({
      "@type": "ListItem", "position": idx + 1,
      "url": site.url(`/en/review/${r.slug}`)
    }))
  };
      // Public pages don't need a CSRF token, but set it to empty for the meta tag
  const html = await renderer.render("category.html", {
    canonical: dynamicSeo.canonical || site.url("/en/review"),
    category: "All Reviews",
    description: "Browse our complete collection of casino reviews.",
    casino_cards: reviewCards,
    components_top: allComponents.top,
    components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom,
    components_bottom: allComponents.bottom,
    components_sidebar: allComponents.sidebar,
    seo_title: dynamicSeo.seo_title || `All Casino Reviews — ${site.siteName}.`,
    seo_description: dynamicSeo.seo_description || "In-depth casino reviews with pros, cons, and ratings.",
    seo_keywords: dynamicSeo.seo_keywords || ""
  }, listSchema, buildBreadcrumbs("reviewList"));

  return new Response(html, { headers: cacheHeaders() });
}
