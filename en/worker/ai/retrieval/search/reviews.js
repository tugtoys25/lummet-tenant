// Part of the retrieval engine (see docs/ARCHITECTURE_AI_RETRIEVAL.md). Each function receives the shared request context and the results object and fills in its own tables.
import { MAX_RESULTS, fuzzyFindCasinoSlug, normalizeForMatch, truncate } from "../match-helpers.js";
import { shouldSearchTable } from "../search-helpers.js";

export async function searchReviews(ctx, results) {
  const { db, casinoNames, allSearchTerms, intent, isListing, tablesToSearch } = ctx;
    // ═══════════════════════════════════════════════════
  // REVIEWS
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('reviews', tablesToSearch, intent, ['casino_review','casino_compare','general'])) {
    try {
      if (isListing && intent === 'casino_review') {
        const r = await db.prepare(`
          SELECT slug, title, casino_slug, country_code, rating, overview,
                 pros, cons, verdict, author, author_title
          FROM reviews WHERE published = 1 ORDER BY created_at DESC LIMIT 20
        `).all();
        results.reviews = (r.results || []).map(rv => ({ ...rv, overview: truncate(rv.overview, 300), verdict: truncate(rv.verdict, 200) }));
      } else if (allSearchTerms.length > 0) {
        const conditions = allSearchTerms.map(() =>
          "LOWER(title) LIKE ? OR LOWER(casino_slug) LIKE ? OR LOWER(overview) LIKE ? OR REPLACE(REPLACE(LOWER(casino_slug),'-',''),'_','') LIKE ?"
        ).join(' OR ');
        const params = [];
        for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${normalizeForMatch(term)}%`);
        const r = await db.prepare(`
          SELECT slug, title, casino_slug, country_code, rating, overview, pros, cons,
                 verdict, author, author_title, games, bonuses, payments, licenses
          FROM reviews WHERE published = 1 AND (${conditions}) LIMIT ${MAX_RESULTS}
        `).bind(...params).all();
        results.reviews = (r.results || []).map(rv => ({
          ...rv, overview: truncate(rv.overview, 300), games: truncate(rv.games, 200),
          bonuses: truncate(rv.bonuses, 200), payments: truncate(rv.payments, 200),
          licenses: truncate(rv.licenses, 200), verdict: truncate(rv.verdict, 200)
        }));

        // Same typo/spacing last-resort as the CASINOS block above --
        // resolve the real casino slug fuzzily, then look up its review
        // by that exact, correct slug.
        if (results.reviews.length === 0 && casinoNames.length > 0) {
          const fuzzySlug = await fuzzyFindCasinoSlug(db, casinoNames);
          if (fuzzySlug) {
            const fr = await db.prepare(`
              SELECT slug, title, casino_slug, country_code, rating, overview, pros, cons,
                     verdict, author, author_title, games, bonuses, payments, licenses
              FROM reviews WHERE published = 1 AND casino_slug = ? LIMIT 1
            `).bind(fuzzySlug).first();
            if (fr) results.reviews = [{
              ...fr, overview: truncate(fr.overview, 300), games: truncate(fr.games, 200),
              bonuses: truncate(fr.bonuses, 200), payments: truncate(fr.payments, 200),
              licenses: truncate(fr.licenses, 200), verdict: truncate(fr.verdict, 200)
            }];
          }
        }
      }

      // Get review blocks
      if (results.reviews.length > 0 && (intent === 'casino_review' || intent === 'casino_compare')) {
        const reviewSlugs = results.reviews.map(r => r.slug).filter(Boolean);
        if (reviewSlugs.length > 0) {
          const placeholders = reviewSlugs.map(() => '?').join(',');
          const blocksR = await db.prepare(`
            SELECT review_slug, title, content, position FROM review_blocks
            WHERE review_slug IN (${placeholders}) ORDER BY position ASC
          `).bind(...reviewSlugs).all();
          results.reviewBlocks = (blocksR.results || []).map(b => ({ ...b, content: truncate(b.content, 300) }));
        }
      }

      // Parse faq_json
      for (const review of results.reviews) {
        try {
          const faqRow = await db.prepare(`SELECT faq_json FROM reviews WHERE slug = ?`).bind(review.slug).first();
          if (faqRow?.faq_json) review.faqs = JSON.parse(faqRow.faq_json);
        } catch {}
      }
    } catch (e) { console.error('Lummet retrieve reviews:', e.message); }
  }
}

export async function searchNews(ctx, results) {
  const { db, text, allSearchTerms, intent, tablesToSearch } = ctx;
  // ═══════════════════════════════════════════════════
  // NEWS
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('news', tablesToSearch, intent, ['news','general'])) {
    try {
      if (intent === 'news' || text.includes('news') || text.includes('latest')) {
        const r = await db.prepare(`
          SELECT slug, title, excerpt, tags, author, published_at FROM news
          WHERE published = 1 ORDER BY published_at DESC, created_at DESC LIMIT ${MAX_RESULTS}
        `).all();
        results.news = (r.results || []).map(n => ({ ...n, excerpt: truncate(n.excerpt, 200) }));
      } else if (allSearchTerms.length > 0) {
        const conditions = allSearchTerms.map(() => 'LOWER(title) LIKE ? OR LOWER(excerpt) LIKE ? OR LOWER(tags) LIKE ?').join(' OR ');
        const params = [];
        for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`, `%${term}%`);
        const r = await db.prepare(`
          SELECT slug, title, excerpt, tags, author, published_at FROM news
          WHERE published = 1 AND (${conditions}) ORDER BY published_at DESC LIMIT ${MAX_RESULTS}
        `).bind(...params).all();
        results.news = (r.results || []).map(n => ({ ...n, excerpt: truncate(n.excerpt, 200) }));
      }
    } catch (e) { console.error('Lummet retrieve news:', e.message); }
  }
}
