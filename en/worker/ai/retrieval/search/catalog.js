// Part of the retrieval engine (see docs/ARCHITECTURE_AI_RETRIEVAL.md). Each function receives the shared request context and the results object and fills in its own tables.
import { MAX_RESULTS } from "../match-helpers.js";
import { shouldSearchTable } from "../search-helpers.js";

export async function searchCountries(ctx, results) {
  const { db, detectedCountry, intent, tablesToSearch } = ctx;
  // ═══════════════════════════════════════════════════
  // COUNTRIES
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('countries', tablesToSearch, intent, ['geo','licensing','general']) && detectedCountry) {
    try {
      const r = await db.prepare(`SELECT code, name, currency, language, legal_status FROM countries WHERE code = ? LIMIT 1`).bind(detectedCountry.toUpperCase()).first();
      if (r) results.countries = [r];
    } catch (e) { console.error('Lummet retrieve countries:', e.message); }
  }
}

export async function searchCategories(ctx, results) {
  const { db, allSearchTerms, intent, tablesToSearch } = ctx;
  // ═══════════════════════════════════════════════════
  // CATEGORIES
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('categories', tablesToSearch, intent, ['casino_search','general']) && allSearchTerms.length > 0) {
    try {
      const conditions = allSearchTerms.map(() => 'LOWER(name) LIKE ? OR LOWER(description) LIKE ?').join(' OR ');
      const params = [];
      for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`);
      const r = await db.prepare(`SELECT slug, name, description FROM categories WHERE (${conditions}) LIMIT ${MAX_RESULTS}`).bind(...params).all();
      results.categories = r.results || [];
    } catch (e) { console.error('Lummet retrieve categories:', e.message); }
  }
}

export async function searchSeoPages(ctx, results) {
  const { db, detectedCountry, intent, isGeo, tablesToSearch } = ctx;
  // ═══════════════════════════════════════════════════
  // COUNTRY & CATEGORY×COUNTRY SEO LANDING PAGES
  // (seo_pages: /en/country/:code/:slug custom guides,
  //  /en/category/:slug/:code hub pages — see migrations/0019)
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('seo_pages', tablesToSearch, intent, ['geo','licensing','casino_search','navigation','general']) &&
      isGeo && detectedCountry) {
    try {
      const countryCode = detectedCountry.toUpperCase();

      const customR = await db.prepare(`
        SELECT slug, country_code, title FROM seo_pages
        WHERE page_type = 'country_custom' AND country_code = ? AND published = 1
        ORDER BY updated_at DESC LIMIT ${MAX_RESULTS}
      `).bind(countryCode).all();
      for (const p of (customR.results || [])) {
        results.seoPages.push({ title: p.title, page_type: 'country_custom', url: `/en/country/${p.country_code.toLowerCase()}/${p.slug}` });
      }

      if (results.categories.length > 0) {
        const catSlugs = results.categories.map(c => c.slug);
        const placeholders = catSlugs.map(() => '?').join(',');
        const hubR = await db.prepare(`
          SELECT slug, country_code, title FROM seo_pages
          WHERE page_type = 'category_country' AND country_code = ? AND published = 1
            AND slug IN (${placeholders})
          ORDER BY updated_at DESC LIMIT ${MAX_RESULTS}
        `).bind(countryCode, ...catSlugs).all();
        for (const p of (hubR.results || [])) {
          results.seoPages.push({ title: p.title, page_type: 'category_country', url: `/en/category/${p.slug}/${p.country_code.toLowerCase()}` });
        }
      }
    } catch (e) { console.error('Lummet retrieve seo_pages:', e.message); }
  }
}

export async function searchSeoMeta(ctx, results) {
  const { db, allSearchTerms, intent, tablesToSearch } = ctx;
  // ═══════════════════════════════════════════════════
  // SEO META
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('seo_meta', tablesToSearch, intent, ['general','navigation']) && allSearchTerms.length > 0) {
    try {
      const conditions = allSearchTerms.map(() => 'LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(keywords) LIKE ?').join(' OR ');
      const params = [];
      for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`, `%${term}%`);
      const r = await db.prepare(`SELECT page_type, page_slug, title, description FROM seo_meta WHERE (${conditions}) LIMIT ${MAX_RESULTS}`).bind(...params).all();
      results.seoMeta = r.results || [];
    } catch (e) { console.error('Lummet retrieve seo_meta:', e.message); }
  }
}
