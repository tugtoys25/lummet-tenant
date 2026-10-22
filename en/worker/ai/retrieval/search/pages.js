// Part of the retrieval engine (see docs/ARCHITECTURE_AI_RETRIEVAL.md). Each function receives the shared request context and the results object and fills in its own tables.
import { MAX_RESULTS, truncate } from "../match-helpers.js";
import { shouldSearchTable } from "../search-helpers.js";

export async function searchPages(ctx, results) {
  const { db, allSearchTerms, intent, tablesToSearch } = ctx;
  // ═══════════════════════════════════════════════════
  // PAGES
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('pages', tablesToSearch, intent, ['general','educational','responsible_gambling','navigation'])) {
    try {
      if (allSearchTerms.length > 0) {
        const conditions = allSearchTerms.map(() => 'LOWER(title) LIKE ? OR LOWER(slug) LIKE ?').join(' OR ');
        const params = [];
        for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`);
        const r = await db.prepare(`
          SELECT slug, title, type FROM pages WHERE published = 1 AND (${conditions}) LIMIT ${MAX_RESULTS}
        `).bind(...params).all();
        results.pages = r.results || [];
      } else if (intent === 'navigation') {
        const r = await db.prepare(`
          SELECT slug, title, type FROM pages WHERE published = 1
          AND slug IN ('about','about-us','contact','responsible-gambling','terms','privacy','faq') LIMIT 10
        `).all();
        results.pages = r.results || [];
      }
    } catch (e) { console.error('Lummet retrieve pages:', e.message); }
  }
}

export async function searchFaqs(ctx, results) {
  const { db, allSearchTerms, intent, tablesToSearch } = ctx;
  // ═══════════════════════════════════════════════════
  // FAQs
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('faqs', tablesToSearch, intent, ['faq','general','educational','responsible_gambling'])) {
    try {
      if (allSearchTerms.length > 0) {
        const conditions = allSearchTerms.map(() => 'LOWER(question) LIKE ? OR LOWER(answer) LIKE ?').join(' OR ');
        const params = [];
        for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`);
        const r = await db.prepare(`
          SELECT slug, question, answer FROM faqs WHERE is_active = 1 AND (${conditions}) LIMIT ${MAX_RESULTS}
        `).bind(...params).all();
        results.faqs = r.results || [];
      } else if (intent === 'faq') {
        const r = await db.prepare(`SELECT slug, question, answer FROM faqs WHERE is_active = 1 ORDER BY created_at DESC LIMIT ${MAX_RESULTS}`).all();
        results.faqs = r.results || [];
      }
    } catch (e) { console.error('Lummet retrieve faqs:', e.message); }
  }
}

export async function searchAuthors(ctx, results) {
  const { db, conversationHistory, text, allSearchTerms, intent, tablesToSearch } = ctx;
  // ═══════════════════════════════════════════════════
  // AUTHORS
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('authors', tablesToSearch, intent, ['authors','general'])) {
    try {
      if (allSearchTerms.length > 0) {
        const conditions = allSearchTerms.map(() => 'LOWER(name) LIKE ? OR LOWER(bio) LIKE ?').join(' OR ');
        const params = [];
        for (const term of allSearchTerms) params.push(`%${term}%`, `%${term}%`);
        const r = await db.prepare(`
          SELECT slug, name, bio, role FROM authors WHERE published = 1 AND (${conditions}) LIMIT ${MAX_RESULTS}
        `).bind(...params).all();
        results.authors = (r.results || []).map(a => ({ ...a, bio: truncate(a.bio, 200) }));
      }

      // Follow-up attribution questions ("who wrote this?", "who wrote
      // that review?") don't name an author, so the search above finds
      // nothing -- the actual name only exists in the model's own prior
      // natural-language answer, in conversation history. Rather than
      // let it answer from unverified memory of that turn, try to pull
      // a name out of that answer text and verify it against the real
      // authors table so the profile link is genuine (or absent, if the
      // name doesn't check out).
      if (results.authors.length === 0 && /\bwho wrote\b|\bwrote (this|that|it)\b|\bauthor of\b/i.test(text) && Array.isArray(conversationHistory)) {
        const priorAnswers = conversationHistory.slice(-6)
          .filter(m => m.role === 'assistant')
          .map(m => m.content || '')
          .join('\n');
        const nameMatch = priorAnswers.match(/(?:written|authored|reviewed) by ([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,3})/i);
        if (nameMatch) {
          const authorName = nameMatch[1].trim();
          const r = await db.prepare(`
            SELECT slug, name, bio, role FROM authors WHERE published = 1 AND LOWER(name) = LOWER(?) LIMIT 1
          `).bind(authorName).first();
          if (r) results.authors = [{ ...r, bio: truncate(r.bio, 200) }];
        }
      }
    } catch (e) { console.error('Lummet retrieve authors:', e.message); }
  }
}
