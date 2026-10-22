// Part of the retrieval engine (see docs/ARCHITECTURE_AI_RETRIEVAL.md). Each function receives the shared request context and the results object and fills in its own tables.
import { MAX_RESULTS, truncate } from "../match-helpers.js";
import { shouldSearchTable } from "../search-helpers.js";

export async function searchPaymentMethods(ctx, results) {
  const { db, allSearchTerms, intent, tablesToSearch } = ctx;
  // ═══════════════════════════════════════════════════
  // PAYMENT METHODS (standalone /payment-methods pages)
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('payment_methods', tablesToSearch, intent, ['payments','crypto','general'])) {
    try {
      if (allSearchTerms.length > 0) {
        const conditions = allSearchTerms.map(() => 'LOWER(name) LIKE ? OR LOWER(slug) LIKE ? OR LOWER(method_type) LIKE ? OR LOWER(description) LIKE ?').join(' OR ');
        const params = [];
        for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`);
        const r = await db.prepare(`
          SELECT slug, name, method_type, description FROM payment_methods
          WHERE published = 1 AND (${conditions}) ORDER BY sort_order ASC LIMIT ${MAX_RESULTS}
        `).bind(...params).all();
        results.paymentMethods = (r.results || []).map(p => ({ ...p, description: truncate(p.description, 250) }));
      } else if (intent === 'payments' || intent === 'crypto') {
        const r = await db.prepare(`
          SELECT slug, name, method_type, description FROM payment_methods
          WHERE published = 1 ${intent === 'crypto' ? "AND method_type = 'crypto'" : ''}
          ORDER BY sort_order ASC LIMIT ${MAX_RESULTS}
        `).all();
        results.paymentMethods = (r.results || []).map(p => ({ ...p, description: truncate(p.description, 250) }));
      }
    } catch (e) { console.error('Lummet retrieve payment_methods:', e.message); }
  }
}

export async function searchNavItems(ctx, results) {
  const { db, allSearchTerms, intent, tablesToSearch } = ctx;
  // ═══════════════════════════════════════════════════
  // NAVIGATION (site menu structure)
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('nav_items', tablesToSearch, intent, ['navigation','general'])) {
    try {
      if (intent === 'navigation' || allSearchTerms.some(t => ['menu','navigate','navigation','find','sitemap'].includes(t))) {
        const r = await db.prepare(`
          SELECT label, url, location, parent_id FROM nav_items
          WHERE enabled = 1 ORDER BY location ASC, position ASC LIMIT 40
        `).all();
        results.navItems = r.results || [];
      }
    } catch (e) { console.error('Lummet retrieve nav_items:', e.message); }
  }
}

export async function searchHomepageSections(ctx, results) {
  const { db, text, intent, tablesToSearch } = ctx;
  // ═══════════════════════════════════════════════════
  // HOMEPAGE SECTIONS / PUBLIC COMPONENTS
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('components', tablesToSearch, intent, ['navigation','general']) &&
      (intent === 'navigation' ||
       text.includes('homepage') || text.includes('home page') ||
       text.includes('what is on') || text.includes("what's on") ||
       text.includes('sections') || text.includes('layout') ||
       text.includes('what is this site') || text.includes('about this site') ||
       text.includes('what is this website'))) {
    try {
      const r = await db.prepare(`
        SELECT c.type, c.title, c.name FROM page_components pc
        JOIN components c ON c.id = pc.component_id
        WHERE pc.page_type = 'homepage' AND pc.page_slug = 'homepage'
          AND pc.enabled = 1 AND c.status = 'active'
        ORDER BY pc.position ASC LIMIT 20
      `).all();
      results.homepageSections = r.results || [];
    } catch (e) { console.error('Lummet retrieve homepage components:', e.message); }
  }
}
