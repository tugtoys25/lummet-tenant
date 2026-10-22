// Part of the retrieval engine (see docs/ARCHITECTURE_AI_RETRIEVAL.md). Each function receives the shared request context and the results object and fills in its own tables.
import { MAX_RESULTS, truncate } from "../match-helpers.js";
import { shouldSearchTable } from "../search-helpers.js";

export async function searchPlatformUpdates(ctx, results) {
  const { db, text, allSearchTerms, intent, tablesToSearch } = ctx;
  // ═══════════════════════════════════════════════════
// PLATFORM UPDATES
// ═══════════════════════════════════════════════════
if (
  shouldSearchTable(
    'platform_updates',
    tablesToSearch,
    intent,
    ['platform_update', 'updates', 'general']
  )
) {
  try {
    if (
      intent === 'platform_update' ||
      intent === 'updates' ||
      text.includes('platform update') ||
      text.includes('platform updates') ||
      text.includes('site update') ||
      text.includes('what changed') ||
      text.includes('recent changes') ||
      text.includes('new feature')
    ) {
      const r = await db.prepare(`
        SELECT
          pu.slug,
          pu.title,
          pu.excerpt,
          pu.content,
          pu.featured_image,
          pu.seo_title,
          pu.seo_description,
          pu.published_at,
          pu.updated_at,
          a.name AS author_name,
          a.slug AS author_slug,
          a.role AS author_role
        FROM platform_updates pu
        LEFT JOIN authors a
          ON pu.author_id = a.id
        WHERE pu.published = 1
        ORDER BY
          COALESCE(pu.published_at, pu.created_at) DESC
        LIMIT ${MAX_RESULTS}
      `).all();

      results.platformUpdates = (r.results || []).map(u => ({
        ...u,
        excerpt: truncate(u.excerpt, 300),
        content: truncate(u.content, 700)
      }));
    } else if (allSearchTerms.length > 0) {
      const conditions = allSearchTerms
        .map(() =>
          `LOWER(title) LIKE ?
           OR LOWER(slug) LIKE ?
           OR LOWER(excerpt) LIKE ?
           OR LOWER(content) LIKE ?`
        )
        .join(' OR ');

      const params = [];

      for (const term of allSearchTerms) {
        params.push(
          `%${term}%`,
          `%${term}%`,
          `%${term}%`,
          `%${term}%`
        );
      }

      const r = await db.prepare(`
        SELECT
          pu.slug,
          pu.title,
          pu.excerpt,
          pu.content,
          pu.featured_image,
          pu.seo_title,
          pu.seo_description,
          pu.published_at,
          pu.updated_at,
          a.name AS author_name,
          a.slug AS author_slug,
          a.role AS author_role
        FROM platform_updates pu
        LEFT JOIN authors a
          ON pu.author_id = a.id
        WHERE pu.published = 1
          AND (${conditions})
        ORDER BY
          COALESCE(pu.published_at, pu.created_at) DESC
        LIMIT ${MAX_RESULTS}
      `).bind(...params).all();

      results.platformUpdates = (r.results || []).map(u => ({
        ...u,
        excerpt: truncate(u.excerpt, 300),
        content: truncate(u.content, 700)
      }));
    }
  } catch (e) {
    console.error(
      'Lummet retrieve platform updates:',
      e.message
    );
  }
}
}
