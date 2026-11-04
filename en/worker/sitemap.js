import { getSiteContext } from "./site-context.js";
import { isNewsFlagEnabled, getNewsFlags, getLandingSitemapEntries } from "./database/newsroom.js";

// XML text/attribute escaping for anything interpolated into sitemap XML.
export const xmlEscape = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// SQLite CURRENT_TIMESTAMP / stored strings are UTC. Accepts "YYYY-MM-DD HH:MM:SS",
// ISO with or without zone. Returns W3C/ISO-8601 UTC, or null if unparseable.
export function toIsoUtc(value) {
  if (!value) return null;
  const s = String(value).trim().replace(" ", "T");
  const t = Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z");
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
import { isContentTypeEnabled } from "./content-types.js";

export const sitemapEngine = {

  async generateIndex(request, env, db) {
    const site = await getSiteContext(request, env);
    const currentDate = new Date().toISOString().split("T")[0];
    const subSitemaps = [
      { loc: "/en/sitemap.xml", lastmod: currentDate },
      { loc: "/en/sitemap-casinos.xml", lastmod: currentDate },
      { loc: "/en/sitemap-reviews.xml", lastmod: currentDate },
      { loc: "/en/sitemap-news.xml", lastmod: currentDate },
      { loc: "/en/sitemap-updates.xml", lastmod: currentDate },
      { loc: "/en/sitemap-categories.xml", lastmod: currentDate },
      { loc: "/en/sitemap-countries.xml", lastmod: currentDate },
      { loc: "/en/sitemap-pages.xml", lastmod: currentDate },
      { loc: "/en/sitemap-authors.xml", lastmod: currentDate },
      { loc: "/en/sitemap-seo-pages.xml", lastmod: currentDate },
      { loc: "/en/sitemap-research.xml", lastmod: currentDate },
    ];

    // Content-type-gated: only linked from the index while enabled
    // for this environment (Phase 2 report §8 — sitemaps are one of
    // the enablement touchpoints, not just routing).
    if (await isContentTypeEnabled(env, "sportsbook")) {
      subSitemaps.push({ loc: "/en/sitemap-sportsbook.xml", lastmod: currentDate });
    }
    if (await isContentTypeEnabled(env, "affiliate_partner")) {
      subSitemaps.push({ loc: "/en/sitemap-affiliate-partner.xml", lastmod: currentDate });
    }
    if (await isContentTypeEnabled(env, "custom")) {
      subSitemaps.push({ loc: "/en/sitemap-custom.xml", lastmod: currentDate });
    }
    subSitemaps.push({ loc: "/en/sitemap-comparisons.xml", lastmod: currentDate });

    if (await isNewsFlagEnabled(db, "news_google_sitemap")) {
      subSitemaps.push({ loc: "/en/news-sitemap.xml", lastmod: currentDate });
    }
    if (await isNewsFlagEnabled(db, "news_new_taxonomy")) {
      subSitemaps.push({ loc: "/en/sitemap-news-sections.xml", lastmod: currentDate });
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (const s of subSitemaps) {
      xml += `  <sitemap>\n    <loc>${xmlEscape(site.url(s.loc))}</loc>\n    <lastmod>${s.lastmod}</lastmod>\n  </sitemap>\n`;
    }
    xml += `</sitemapindex>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "X-Robots-Tag": "index, follow",
        "Cache-Control": "public, max-age=3600",
      },
    });
  },

  async generate(request, env, db, type = "all") {
    if (!db) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
        { status: 500, headers: { "Content-Type": "application/xml; charset=utf-8" } }
      );
    }

    const site = await getSiteContext(request, env);
    const currentDate = new Date().toISOString().split("T")[0];
    let urls = [];

    // Static URLs (only in the "all" sitemap)
    if (type === "all") {
      urls.push({ loc: "/en/", lastmod: currentDate, changefreq: "daily", priority: "1.0" });
      urls.push({ loc: "/en/casino", lastmod: currentDate, changefreq: "daily", priority: "0.9" });
      if (await isContentTypeEnabled(env, "sportsbook")) {
        urls.push({ loc: "/en/sportsbook", lastmod: currentDate, changefreq: "daily", priority: "0.9" });
      }
      if (await isContentTypeEnabled(env, "affiliate_partner")) {
        urls.push({ loc: "/en/affiliate-partner", lastmod: currentDate, changefreq: "daily", priority: "0.8" });
      }
      if (await isContentTypeEnabled(env, "custom")) {
        try {
          const customTypesResult = await db.prepare(`SELECT slug FROM custom_content_types`).all();
          for (const ct of customTypesResult.results || []) {
            urls.push({ loc: `/en/custom/${ct.slug}`, lastmod: currentDate, changefreq: "weekly", priority: "0.6" });
          }
        } catch (e) { console.error("Sitemap custom-type listing query failed:", e.message); }
      }
      urls.push({ loc: "/en/review", lastmod: currentDate, changefreq: "daily", priority: "0.8" });
      urls.push({ loc: "/en/news", lastmod: currentDate, changefreq: "daily", priority: "0.7" });
      urls.push({ loc: "/en/updates", lastmod: currentDate, changefreq: "daily", priority: "0.7" });
      urls.push({ loc: "/en/author", lastmod: currentDate, changefreq: "weekly", priority: "0.6" });
      urls.push({ loc: "/en/category", lastmod: currentDate, changefreq: "weekly", priority: "0.6" });
      urls.push({ loc: "/en/country", lastmod: currentDate, changefreq: "weekly", priority: "0.6" });
    }

    // Casinos
    if (type === "all" || type === "casinos") {
      try {
        const r = await db.prepare(
          `SELECT slug, updated_at FROM casinos WHERE published = 1 AND status = 'published' ORDER BY updated_at DESC LIMIT 50000`
        ).all();
        for (const item of r.results || []) {
          const lm = item.updated_at ? item.updated_at.split(" ")[0] : currentDate;
          urls.push({ loc: `/en/casino/${item.slug}`, lastmod: lm, changefreq: "weekly", priority: "0.8" });
        }
      } catch (e) { console.error("Sitemap casinos query failed:", e.message); }
    }

    // Sportsbook (content_items, content_type = 'sportsbook') —
    // gated by enablement so a disabled type never appears here even
    // if rows exist in the table from earlier testing.
    if ((type === "all" || type === "sportsbook") && await isContentTypeEnabled(env, "sportsbook")) {
      try {
        const r = await db.prepare(
          `SELECT slug, updated_at FROM content_items WHERE content_type = 'sportsbook' AND published = 1 AND status = 'published' ORDER BY updated_at DESC LIMIT 50000`
        ).all();
        for (const item of r.results || []) {
          const lm = item.updated_at ? item.updated_at.split(" ")[0] : currentDate;
          urls.push({ loc: `/en/sportsbook/${item.slug}`, lastmod: lm, changefreq: "weekly", priority: "0.8" });
        }
      } catch (e) { console.error("Sitemap sportsbook query failed:", e.message); }
    }

    // Affiliate partner content (content_items, content_type =
    // 'affiliate_partner') -- gated by enablement, same as sportsbook.
    if ((type === "all" || type === "affiliate-partner") && await isContentTypeEnabled(env, "affiliate_partner")) {
      try {
        const r = await db.prepare(
          `SELECT slug, updated_at FROM content_items WHERE content_type = 'affiliate_partner' AND published = 1 AND status = 'published' ORDER BY updated_at DESC LIMIT 50000`
        ).all();
        for (const item of r.results || []) {
          const lm = item.updated_at ? item.updated_at.split(" ")[0] : currentDate;
          urls.push({ loc: `/en/affiliate-partner/${item.slug}`, lastmod: lm, changefreq: "weekly", priority: "0.7" });
        }
      } catch (e) { console.error("Sitemap affiliate-partner query failed:", e.message); }
    }

    // Custom content types (content_items, content_type = 'custom')
    // -- one combined sitemap across every admin-defined custom type,
    // per the original spec's Phase 32 ("custom sitemap", singular).
    // Gated the same way as the others.
    if ((type === "all" || type === "custom") && await isContentTypeEnabled(env, "custom")) {
      try {
        const r = await db.prepare(
          `SELECT slug, custom_type_slug, updated_at FROM content_items WHERE content_type = 'custom' AND published = 1 AND status = 'published' ORDER BY updated_at DESC LIMIT 50000`
        ).all();
        for (const item of r.results || []) {
          const lm = item.updated_at ? item.updated_at.split(" ")[0] : currentDate;
          urls.push({ loc: `/en/custom/${item.custom_type_slug}/${item.slug}`, lastmod: lm, changefreq: "weekly", priority: "0.6" });
        }
      } catch (e) { console.error("Sitemap custom query failed:", e.message); }
    }

    // Comparisons (comparisons table) -- spans every content type,
    // each comparison gated individually by its own content_type's
    // enablement (a casino comparison is always eligible; a
    // sportsbook comparison isn't until sportsbook itself is on).
    if (type === "all" || type === "comparisons") {
      try {
        const r = await db.prepare(
          `SELECT content_type, slug, updated_at FROM comparisons WHERE status = 'published' ORDER BY updated_at DESC LIMIT 50000`
        ).all();
        for (const item of r.results || []) {
          if (!(await isContentTypeEnabled(env, item.content_type))) continue;
          const lm = item.updated_at ? item.updated_at.split(" ")[0] : currentDate;
          urls.push({ loc: `/en/compare/${item.content_type}/${item.slug}`, lastmod: lm, changefreq: "weekly", priority: "0.6" });
        }
      } catch (e) { console.error("Sitemap comparisons query failed:", e.message); }
    }

    // Reviews
    if (type === "all" || type === "reviews") {
      try {
        // reviewed_content_type/reviewed_content_id (migration 0052)
        // determine the URL prefix -- casino reviews (including every
        // pre-existing review, backfilled to 'casino') keep
        // /en/review/{slug} exactly as before. Reviews of the newer
        // content types need their own prefix, and custom reviews
        // additionally need their item's custom_type_slug, hence the
        // LEFT JOIN. Each type is also individually gated by
        // enablement, same as the content types themselves.
        const r = await db.prepare(
          `SELECT r.slug, r.updated_at, r.reviewed_content_type, ci.custom_type_slug
           FROM reviews r
           LEFT JOIN content_items ci ON ci.id = r.reviewed_content_id AND r.reviewed_content_type = 'custom'
           WHERE r.published = 1 ORDER BY r.updated_at DESC LIMIT 50000`
        ).all();
        for (const item of r.results || []) {
          const lm = item.updated_at ? item.updated_at.split(" ")[0] : currentDate;
          const reviewedType = item.reviewed_content_type || "casino";

          if (reviewedType === "casino") {
            urls.push({ loc: `/en/review/${item.slug}`, lastmod: lm, changefreq: "weekly", priority: "0.7" });
          } else if (reviewedType === "sportsbook" && await isContentTypeEnabled(env, "sportsbook")) {
            urls.push({ loc: `/en/sportsbook/review/${item.slug}`, lastmod: lm, changefreq: "weekly", priority: "0.7" });
          } else if (reviewedType === "affiliate_partner" && await isContentTypeEnabled(env, "affiliate_partner")) {
            urls.push({ loc: `/en/affiliate-partner/review/${item.slug}`, lastmod: lm, changefreq: "weekly", priority: "0.6" });
          } else if (reviewedType === "custom" && item.custom_type_slug && await isContentTypeEnabled(env, "custom")) {
            urls.push({ loc: `/en/custom/${item.custom_type_slug}/review/${item.slug}`, lastmod: lm, changefreq: "weekly", priority: "0.6" });
          }
          // A disabled/unrecognized/malformed reviewed_content_type is
          // silently skipped rather than defaulting to /en/review/ --
          // guessing wrong would publish a broken URL to search engines.
        }
      } catch (e) { console.error("Sitemap reviews query failed:", e.message); }
    }

    // News
    if (type === "all" || type === "news") {
      try {
        // Only LIVE articles: a scheduled article (future published_at) is a 404
        // on the site (renderNews hides it), so it must not be in the sitemap.
        const r = await db.prepare(
          `SELECT slug, updated_at, published_at, created_at FROM news
           WHERE published = 1 AND (published_at IS NULL OR datetime(published_at) <= datetime('now'))
           ORDER BY COALESCE(published_at, created_at) DESC LIMIT 50000`
        ).all();
        for (const item of r.results || []) {
          const iso = toIsoUtc(item.updated_at) || toIsoUtc(item.published_at) || toIsoUtc(item.created_at);
          const lm = iso ? iso.slice(0, 10) : currentDate;
          urls.push({ loc: `/en/news/${item.slug}`, lastmod: lm, changefreq: "weekly", priority: "0.6" });
        }
      } catch (e) { console.error("Sitemap news query failed:", e.message); }
    }

        // Platform Updates
    // Newsroom landing pages (sections, regions, countries, topics, series, entities): only when the
    // taxonomy flag is on, and only pages that list at least one live article.
    if (type === "all" || type === "news-landing") {
      try {
        const flags = await getNewsFlags(db);
        if (flags.news_new_taxonomy) {
          for (const e of await getLandingSitemapEntries(db, flags)) {
            const iso = toIsoUtc(e.lastmod);
            urls.push({ loc: e.path, lastmod: iso ? iso.slice(0, 10) : currentDate, changefreq: "daily", priority: "0.5" });
          }
        }
      } catch (e) { console.error("news landing sitemap failed:", e.message); }
    }

    if (type === "all" || type === "updates") {
      try {
        const r = await db.prepare(
          `SELECT slug, updated_at FROM platform_updates
           WHERE published = 1
           ORDER BY COALESCE(published_at, created_at) DESC
           LIMIT 50000`
        ).all();

        for (const item of r.results || []) {
          const lm = item.updated_at
            ? item.updated_at.split(" ")[0]
            : currentDate;

          urls.push({
            loc: `/en/updates/${item.slug}`,
            lastmod: lm,
            changefreq: "weekly",
            priority: "0.6"
          });
        }
      } catch (e) {
        console.error(
          "Sitemap platform updates query failed:",
          e.message
        );
      }
    }

    // Authors
if (type === "all" || type === "authors") {
  try {
    const r = await db.prepare(
      `SELECT slug, updated_at
       FROM authors
       WHERE published = 1
       ORDER BY updated_at DESC
       LIMIT 50000`
    ).all();

    for (const item of r.results || []) {
      const lm = item.updated_at
        ? item.updated_at.split(" ")[0]
        : currentDate;

      urls.push({
        loc: `/en/author/${item.slug}`,
        lastmod: lm,
        changefreq: "monthly",
        priority: "0.5"
      });
    }
  } catch (e) {
    console.error(
      "Sitemap authors query failed:",
      e.message
    );
  }
}

    // Categories
    if (type === "all" || type === "categories") {
      try {
        const r = await db.prepare(`SELECT slug FROM categories WHERE published = 1 AND status != 'draft' LIMIT 50000`).all();
        for (const item of r.results || []) {
          urls.push({ loc: `/en/category/${item.slug}`, lastmod: currentDate, changefreq: "weekly", priority: "0.6" });
        }
      } catch (e) { console.error("Sitemap categories query failed:", e.message); }
    }

    // Countries
    if (type === "all" || type === "countries") {
      try {
        const r = await db.prepare(`SELECT code FROM countries WHERE published = 1 AND status != 'draft' LIMIT 50000`).all();
        for (const item of r.results || []) {
          urls.push({ loc: `/en/country/${item.code}`, lastmod: currentDate, changefreq: "monthly", priority: "0.5" });
        }
      } catch (e) { console.error("Sitemap countries query failed:", e.message); }
    }

    // Pages
    if (type === "all" || type === "pages") {
      try {
        const r = await db.prepare(`SELECT slug FROM pages WHERE published = 1 LIMIT 50000`).all();
        for (const item of r.results || []) {
          urls.push({ loc: `/en/${item.slug}`, lastmod: currentDate, changefreq: "monthly", priority: "0.5" });
        }
      } catch (e) { console.error("Sitemap pages query failed:", e.message); }
    }

    // SEO landing pages (country_custom + category_country) — only
    // published AND sitemap_enabled rows, per spec section 16.
    if (type === "all" || type === "seo-pages") {
      try {
        const r = await db.prepare(
          `SELECT page_type, slug, country_code, category_id, updated_at
           FROM seo_pages
           WHERE published = 1 AND sitemap_enabled = 1
           LIMIT 50000`
        ).all();
        for (const item of r.results || []) {
          const lm = item.updated_at ? item.updated_at.split(" ")[0] : currentDate;
          const loc =
            item.page_type === "country_custom"
              ? `/en/country/${item.country_code}/${item.slug}`
              : `/en/category/${item.slug}/${item.country_code}`;
          urls.push({ loc, lastmod: lm, changefreq: "weekly", priority: "0.6" });
        }
      } catch (e) { console.error("Sitemap seo-pages query failed:", e.message); }
    }

    // Research items — same published/status gate as every other
    // content type here (fixes the exact bug class the README's
    // "Sitemap draft-leak fix" note describes: never omit this filter).
    if (type === "all" || type === "research") {
      try {
        const r = await db.prepare(
          `SELECT type, slug, updated_at FROM research_items
           WHERE published = 1 AND status != 'draft'
           LIMIT 50000`
        ).all();
        for (const item of r.results || []) {
          const lm = item.updated_at ? item.updated_at.split(" ")[0] : currentDate;
          urls.push({ loc: `/en/research/${item.type}/${item.slug}`, lastmod: lm, changefreq: "monthly", priority: "0.6" });
        }
      } catch (e) { console.error("Sitemap research query failed:", e.message); }
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (const u of urls) {
      xml += `  <url>\n    <loc>${xmlEscape(site.url(u.loc))}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>\n`;
    }
    xml += `</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "X-Robots-Tag": "index, follow",
        "Cache-Control": "public, max-age=3600",
      },
    });
  },

  // Google News sitemap (https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap):
  // only articles published in the last 48 hours, at most 1000, each with
  // publication name/language, ISO-8601 publication date and title.
  // Excluded as "not independent news": sponsored / commercial / press-release
  // content. Drafts, scheduled and deleted articles are excluded by the live filter.
  // Off unless the news_google_sitemap flag is on.
  async generateGoogleNews(request, env, db) {
    if (!db || !(await isNewsFlagEnabled(db, "news_google_sitemap"))) {
      return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
    }
    const site = await getSiteContext(request, env);
    // <news:name> is mandatory and must be the publication's name; fall back to
    // the request host (never a hardcoded brand) when no site name is configured.
    const publicationName = site.siteName || site.hostname || "";
    let rows = [];
    try {
      const r = await db.prepare(
        `SELECT slug, title, published_at, created_at FROM news
         WHERE published = 1
           AND (published_at IS NULL OR datetime(published_at) <= datetime('now'))
           AND datetime(COALESCE(published_at, created_at)) >= datetime('now', '-2 days')
           AND COALESCE(content_class, 'editorial') NOT IN ('sponsored', 'commercial', 'press_release')
           AND COALESCE(article_type, 'news') != 'press_release'
         ORDER BY COALESCE(published_at, created_at) DESC LIMIT 1000`
      ).all();
      rows = r.results || [];
    } catch (e) { console.error("Google News sitemap query failed:", e.message); }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n`;
    for (const a of rows) {
      const date = toIsoUtc(a.published_at) || toIsoUtc(a.created_at);
      if (!date || !a.title || !publicationName) continue;
      xml += `  <url>\n    <loc>${xmlEscape(site.url(`/en/news/${a.slug}`))}</loc>\n    <news:news>\n      <news:publication>\n        <news:name>${xmlEscape(publicationName)}</news:name>\n        <news:language>en</news:language>\n      </news:publication>\n      <news:publication_date>${date}</news:publication_date>\n      <news:title>${xmlEscape(a.title)}</news:title>\n    </news:news>\n  </url>\n`;
    }
    xml += `</urlset>`;
    return new Response(xml, {
      status: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8", "X-Robots-Tag": "index, follow", "Cache-Control": "public, max-age=300" },
    });
  },
};

