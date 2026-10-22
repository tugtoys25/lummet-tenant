// Part of the retrieval engine (see docs/ARCHITECTURE_AI_RETRIEVAL.md). Each function receives the shared request context and the results object and fills in its own tables.
import { MAX_RESULTS, truncate } from "../match-helpers.js";

export async function searchContentItems(ctx, results) {
  const { db, text, allSearchTerms, detectedCountry, intent, tablesToSearch } = ctx;
  // ═══════════════════════════════════════════════════
  // SPORTSBOOKS / AFFILIATE PARTNERS / CUSTOM CONTENT  (content_items)
  // Published items only, and only those the visitor's country may see
  // (same rules as the public listing pages: no rules = not shown).
  // ═══════════════════════════════════════════════════
  const wantsItems = /sportsbook|sports book|betting|bookmaker|\bodds\b|affiliate|partner/.test(text) || tablesToSearch.includes('content_items');
  const itemTerms = allSearchTerms.filter(t => t.length >= 3);
  if (wantsItems || itemTerms.length > 0) {
    try {
      const where = [];
      const params = [];
      for (const term of itemTerms) {
        where.push(`LOWER(ci.name) LIKE ? OR LOWER(ci.slug) LIKE ?`);
        params.push(`%${term}%`, `%${term}%`);
        if (wantsItems) { where.push(`LOWER(ci.title) LIKE ? OR LOWER(ci.description) LIKE ? OR LOWER(ci.excerpt) LIKE ?`); params.push(`%${term}%`, `%${term}%`, `%${term}%`); }
      }
      const typeFilter = /sportsbook|sports book|betting|bookmaker|\bodds\b/.test(text) ? `AND ci.content_type = 'sportsbook'` : (/affiliate|partner/.test(text) ? `AND ci.content_type = 'affiliate_partner'` : '');
      const cond = where.length ? `AND (${where.join(' OR ')})` : '';
      if (where.length || wantsItems) {
        const r = await db.prepare(`
          SELECT ci.id, ci.content_type, ci.custom_type_slug, ci.slug, ci.name, ci.title, ci.excerpt, ci.description, ci.rating, ci.license, ci.website
          FROM content_items ci
          WHERE ci.published = 1 AND ci.status = 'published' ${typeFilter} ${cond}
          ORDER BY ci.featured DESC, ci.rating DESC, ci.name ASC LIMIT ${MAX_RESULTS * 2}
        `).bind(...params).all();
        const rows = r.results || [];
        const byType = {};
        for (const row of rows) (byType[row.content_type] ||= []).push(row.id);
        const allowed = new Set();
        for (const [ct, ids] of Object.entries(byType)) {
          const ph = ids.map(() => '?').join(',');
          const g = await db.prepare(`SELECT content_id, country_code, status FROM content_geo WHERE content_type = ? AND content_id IN (${ph})`).bind(ct, ...ids).all();
          const rulesById = {};
          for (const x of (g.results || [])) (rulesById[x.content_id] ||= []).push(x);
          for (const id of ids) {
            const rules = rulesById[id] || [];
            if (!rules.length) continue; // no rules = not available
            const hit = rules.find(x => x.country_code === detectedCountry);
            const hasA = rules.some(x => x.status === 'allowed');
            const hasB = rules.some(x => x.status === 'blocked');
            const ok = hit ? hit.status === 'allowed' : (hasB && !hasA);
            if (ok) allowed.add(`${ct}:${id}`);
          }
        }
        results.contentItems = rows.filter(x => allowed.has(`${x.content_type}:${x.id}`)).slice(0, MAX_RESULTS).map(x => ({
          type: x.content_type, custom_type_slug: x.custom_type_slug, slug: x.slug, name: x.name,
          summary: truncate(x.excerpt || x.description || x.title || '', 240), rating: x.rating, license: x.license
        }));
      }
    } catch (e) { console.error('Lummet retrieve content items:', e.message); }
  }

  // ═══════════════════════════════════════════════════
  // RESEARCH (research_items) -- published, non-draft; only VERIFIED claims are quoted
  // ═══════════════════════════════════════════════════
  const wantsResearch = /research|report|regulator|regulation|regulatory|legislation|\blaw\b|legal|licen[cs]e|licen[cs]ing|compliance|\btax\b/.test(text) || tablesToSearch.includes('research_items') || intent === 'licensing';
  if (wantsResearch) {
    try {
      const where = [];
      const params = [];
      for (const term of itemTerms) {
        where.push(`LOWER(r.title) LIKE ? OR LOWER(r.subtitle) LIKE ? OR LOWER(r.excerpt) LIKE ? OR LOWER(c.name) LIKE ?`);
        params.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`);
      }
      const cond = where.length ? `AND (${where.join(' OR ')})` : '';
      const r = await db.prepare(`
        SELECT r.id, r.type, r.slug, r.title, r.excerpt, r.last_verified_at, c.name AS country_name
        FROM research_items r LEFT JOIN countries c ON c.code = r.country_id
        WHERE r.published = 1 AND r.status != 'draft' ${cond}
        ORDER BY r.updated_at DESC LIMIT 5
      `).bind(...params).all();
      for (const row of (r.results || [])) {
        let claims = [];
        try {
          const cl = await db.prepare(`SELECT claim_text FROM research_claims WHERE research_item_id = ? AND status = 'verified' ORDER BY id LIMIT 3`).bind(row.id).all();
          claims = (cl.results || []).map(x => truncate(x.claim_text, 220));
        } catch (_) { /* claims table optional */ }
        results.researchItems.push({ type: row.type, slug: row.slug, title: row.title, excerpt: truncate(row.excerpt || '', 240), country: row.country_name || null, verified: row.last_verified_at || null, claims });
      }
    } catch (e) { console.error('Lummet retrieve research:', e.message); }
  }
}
