// =====================================================
// LUMMET AI — Database Retrieval (RAG Layer)
// Accepts LLM-generated search plan for smarter queries
// Schema-matched to tenant D1 production tables
// =====================================================
import { getSiteContext } from "../site-context.js";


const MAX_RESULTS = 8;
const MAX_CONTENT_LENGTH = 500;

const COUNTRY_NAME_TO_CODE = {
  'rwanda':'RW','united states':'US','usa':'US','america':'US','canada':'CA',
  'united kingdom':'GB','uk':'GB','england':'GB','germany':'DE','france':'FR',
  'italy':'IT','spain':'ES','netherlands':'NL','holland':'NL','australia':'AU',
  'new zealand':'NZ','japan':'JP','china':'CN','india':'IN','brazil':'BR',
  'mexico':'MX','south africa':'ZA','nigeria':'NG','kenya':'KE','egypt':'EG',
  'sweden':'SE','norway':'NO','denmark':'DK','finland':'FI','poland':'PL',
  'portugal':'PT','greece':'GR','turkey':'TR','russia':'RU','ukraine':'UA',
  'united arab emirates':'AE','saudi arabia':'SA','qatar':'QA','south korea':'KR',
  'korea':'KR','thailand':'TH','vietnam':'VN','philippines':'PH','indonesia':'ID',
  'malaysia':'MY','singapore':'SG','argentina':'AR','chile':'CL','colombia':'CO',
  'peru':'PE','austria':'AT','switzerland':'CH','ireland':'IE','belgium':'BE',
  'czech republic':'CZ','hungary':'HU','romania':'RO','bulgaria':'BG',
  'croatia':'HR','malta':'MT','cyprus':'CY','luxembourg':'LU','iceland':'IS'
};

const VALID_TABLES = ['casinos','reviews','review_blocks','news', 'platform_updates','pages','faqs','authors','countries','categories','geo_rules','seo_meta','payment_methods','nav_items','components','seo_pages'];

// ── Name matching helpers (typo/spacing tolerance for casino lookups) ──
// "Casa Bet" typed with a space will never LIKE-match a DB value of
// "casabet" (no space) -- LIKE needs that literal substring to be
// present, and it isn't. Stripping non-alphanumerics from both sides
// before comparing closes that specific, very common gap (spacing,
// hyphens, punctuation) cheaply, in SQL, with no extra round trip.
function normalizeForMatch(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Real typos (an extra/missing/swapped letter) survive normalization
// but still won't LIKE-match. SQLite has no built-in edit-distance
// function, so this fallback fetches a bounded candidate list and
// scores them in JS. Only used when the primary search comes up empty
// AND the model believes a specific casino name was named -- so a
// generic query with no name in it never triggers a broad fuzzy scan.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

async function fuzzyFindCasinoSlug(db, candidateNames) {
  const candidates = [...new Set(candidateNames.map(normalizeForMatch))].filter(s => s.length >= 3);
  if (candidates.length === 0) return null;

  let rows;
  try {
    const r = await db.prepare(`SELECT slug, name FROM casinos WHERE published = 1 LIMIT 500`).all();
    rows = r.results || [];
  } catch { return null; }

  let bestSlug = null, bestDist = Infinity;
  for (const row of rows) {
    const normName = normalizeForMatch(row.name);
    const normSlug = normalizeForMatch(row.slug);
    for (const cand of candidates) {
      const dist = Math.min(levenshtein(cand, normName), levenshtein(cand, normSlug));
      // ~30% of the shorter string's length, minimum 1 -- tight enough
      // to avoid matching an unrelated casino, loose enough to catch a
      // couple of typo'd characters.
      const threshold = Math.max(1, Math.floor(Math.min(cand.length, normName.length) * 0.3));
      if (dist <= threshold && dist < bestDist) { bestDist = dist; bestSlug = row.slug; }
    }
  }
  return bestSlug;
}

function truncate(text, max = MAX_CONTENT_LENGTH) {
  if (!text) return '';
  const clean = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.substring(0, max) + '...' : clean;
}

/**
 * Main retrieval function — uses LLM plan if available, falls back to keyword extraction
 */
export async function retrieve(env, query, country, plan = null, conversationHistory = null, request = null ) {
  const db = env.DB;
  const site = await getSiteContext(request, env);
  const text = query.toLowerCase().trim();

  // ── Determine search parameters from plan or fallback ──
  const searchTerms = plan?.search_terms?.length > 0
    ? plan.search_terms
    : extractSearchTerms(query);

  const casinoNames = plan?.casino_names || [];
  const allSearchTerms = [...new Set([
    ...searchTerms,
    ...casinoNames.map(n => n.toLowerCase())
  ])].filter(t => t.length > 0);

  // Deterministic text extraction takes priority over the model's own
  // country_code guess: if the message unambiguously names a country
  // ("...in Kenya?"), a keyword match on that exact text is more
  // trustworthy than an LLM classification that can (and did, in
  // testing) return the wrong country entirely. Falls back to the
  // model's guess only when the text itself has no clear match (e.g.
  // "can I play from Nairobi" -- no literal country name to match).
  const detectedCountry = extractCountryFromMessage(query) || plan?.country_code || country;
  const intent = plan?.intent || 'general';
  const isListing = plan?.is_listing || isListingText(text);
  const isGeo = plan?.intent === 'geo' || plan?.intent === 'licensing' || isGeoText(text);
  const isComparison = plan?.is_comparison || false;
  const tablesToSearch = plan?.tables || [];

  const results = {
    casinos: [], reviews: [], reviewBlocks: [], news: [], platformUpdates: [],
    pages: [], faqs: [], authors: [], countries: [],
    categories: [], seoMeta: [], geoStatuses: {}, casinoCategories: {},
    paymentMethods: [], casinoPaymentMethods: {}, navItems: [], homepageSections: [],
    seoPages: []
  };

  // ═══════════════════════════════════════════════════
  // CASINOS
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('casinos', tablesToSearch, intent, ['casino_search','casino_review','casino_compare','bonuses','crypto','payments','geo','licensing','general'])) {
    try {
      if (isGeo && detectedCountry) {
        // ── Geo search: find casinos available in a specific country ──
        const geoR = await db.prepare(`
          SELECT gr.casino_slug, gr.status, gr.bonus_override,
                 c.slug, c.name, c.rating, c.bonus_title, c.bonus_value,
                 c.license, c.owner, c.features
          FROM geo_rules gr
          JOIN casinos c ON c.slug = gr.casino_slug
          WHERE gr.country_code = ? AND gr.status = 'allowed' AND c.published = 1
          ORDER BY c.featured DESC, c.rating DESC LIMIT 20
        `).bind(detectedCountry.toUpperCase()).all();

        if (geoR.results && geoR.results.length > 0) {
          results.casinos = geoR.results.map(c => ({
            slug: c.slug || c.casino_slug, name: c.name, rating: c.rating,
            bonus_title: c.bonus_override || c.bonus_title, bonus_value: c.bonus_value,
            license: c.license, owner: c.owner, features: c.features
          }));
          for (const c of results.casinos) results.geoStatuses[c.slug] = 'allowed';
        } else {
          // Fallback: check supported_countries column
          const supportedR = await db.prepare(`
            SELECT slug, name, rating, bonus_title, bonus_value, license, owner,
                   features, supported_countries, restricted_countries
            FROM casinos WHERE published = 1
            AND (LOWER(supported_countries) LIKE ? OR LOWER(supported_countries) LIKE ?)
            AND LOWER(restricted_countries) NOT LIKE ?
            ORDER BY featured DESC, rating DESC LIMIT 20
          `).bind(`%${detectedCountry.toLowerCase()}%`, `%"${detectedCountry.toUpperCase()}"%`, `%${detectedCountry.toLowerCase()}%`).all();

          if (supportedR.results && supportedR.results.length > 0) {
            results.casinos = supportedR.results;
            for (const c of results.casinos) results.geoStatuses[c.slug] = 'allowed';
          } else {
            // Last resort: all casinos, evaluate geo per casino
            const allR = await db.prepare(`
              SELECT slug, name, rating, bonus_title, bonus_value, license, owner,
                     features, supported_countries, restricted_countries, featured
              FROM casinos WHERE published = 1
              ORDER BY featured DESC, rating DESC, sort_order ASC LIMIT 20
            `).all();
            results.casinos = allR.results || [];
            for (const c of results.casinos) results.geoStatuses[c.slug] = evaluateGeoFromColumns(c, detectedCountry);
          }
        }
      } else if (isListing) {
        // ── Listing: return all published casinos ──
        const r = await db.prepare(`
          SELECT slug, name, rating, bonus_title, bonus_value, license, owner,
                 features, supported_countries, restricted_countries, featured
          FROM casinos WHERE published = 1
          ORDER BY featured DESC, rating DESC, sort_order ASC LIMIT 20
        `).all();
        results.casinos = r.results || [];
      } else if (allSearchTerms.length > 0) {
        // ── Keyword search ──
        // Plain LIKE conditions plus a space/punctuation-normalized
        // variant of each: "Casa Bet" (typed with a space) would never
        // LIKE-match a stored "casabet" otherwise, since LIKE needs
        // that literal substring -- including the space -- present.
        const conditions = allSearchTerms.map(() =>
          'LOWER(name) LIKE ? OR LOWER(slug) LIKE ? OR LOWER(bonus_title) LIKE ? OR LOWER(features) LIKE ? OR ' +
          "REPLACE(REPLACE(REPLACE(REPLACE(LOWER(name),' ',''),'-',''),'''',''),'.','') LIKE ?"
        ).join(' OR ');
        const params = [];
        for (const term of allSearchTerms) {
          params.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`, `%${normalizeForMatch(term)}%`);
        }
        const r = await db.prepare(`
          SELECT slug, name, rating, bonus_title, bonus_value, license, owner,
                 features, supported_countries, restricted_countries, featured
          FROM casinos WHERE published = 1 AND (${conditions}) LIMIT ${MAX_RESULTS}
        `).bind(...params).all();
        results.casinos = r.results || [];

        // Understand.js already tries to correct typos before this point,
        // and the normalized LIKE above catches spacing/punctuation --
        // this is the last-resort net for a genuine misspelling (an
        // extra, missing, or swapped letter) that survives both. Only
        // fires when the model believed a *specific casino* was named,
        // so an unrelated broad query never triggers a fuzzy scan.
        if (results.casinos.length === 0 && casinoNames.length > 0) {
          const fuzzySlug = await fuzzyFindCasinoSlug(db, casinoNames);
          if (fuzzySlug) {
            const fr = await db.prepare(`
              SELECT slug, name, rating, bonus_title, bonus_value, license, owner,
                     features, supported_countries, restricted_countries, featured
              FROM casinos WHERE published = 1 AND slug = ? LIMIT 1
            `).bind(fuzzySlug).first();
            if (fr) results.casinos = [fr];
          }
        }
      } else if (intent === 'casino_search' || intent === 'general') {
        // ── Fallback: top casinos ──
        const r = await db.prepare(`
          SELECT slug, name, rating, bonus_title, bonus_value, license, owner,
                 features, supported_countries, restricted_countries, featured
          FROM casinos WHERE published = 1
          ORDER BY featured DESC, rating DESC, sort_order ASC LIMIT 10
        `).all();
        results.casinos = r.results || [];
      }

      // Parse features
      for (const casino of results.casinos) {
        try { casino.parsedFeatures = casino.features ? JSON.parse(casino.features) : []; }
        catch { casino.parsedFeatures = casino.features ? casino.features.split(',').map(f => f.trim()).filter(Boolean) : []; }
      }

      // Get geo statuses from geo_rules
      if (results.casinos.length > 0 && detectedCountry) {
        const slugs = results.casinos.map(c => c.slug).filter(Boolean);
        if (slugs.length > 0) {
          const placeholders = slugs.map(() => '?').join(',');
          const geoR = await db.prepare(`
            SELECT casino_slug, country_code, status, priority
            FROM geo_rules WHERE casino_slug IN (${placeholders}) ORDER BY priority DESC
          `).bind(...slugs).all();
          const rulesByCasino = {};
          for (const row of (geoR.results || [])) {
            if (!rulesByCasino[row.casino_slug]) rulesByCasino[row.casino_slug] = [];
            rulesByCasino[row.casino_slug].push(row);
          }
          for (const casino of results.casinos) {
            if (!results.geoStatuses[casino.slug]) {
              results.geoStatuses[casino.slug] = evaluateGeoStatus(rulesByCasino[casino.slug] || [], detectedCountry, casino);
            }
          }
        }
      }

      // Get casino categories
      if (results.casinos.length > 0) {
        for (const casino of results.casinos) {
          try {
            const catR = await db.prepare(`
              SELECT c.slug, c.name FROM categories c
              JOIN casino_categories cc ON cc.category_id = c.id
              JOIN casinos cas ON cas.id = cc.casino_id WHERE cas.slug = ?
            `).bind(casino.slug).all();
            if (catR.results && catR.results.length > 0) results.casinoCategories[casino.slug] = catR.results;
          } catch {}
        }
      }

      // Get accepted payment methods per casino (joined via casino_payment_methods)
      // -- only when it's actually relevant, to avoid extra queries on every casino answer
      if (results.casinos.length > 0 && (intent === 'payments' || intent === 'crypto' || isListing)) {
        for (const casino of results.casinos) {
          try {
            const pmR = await db.prepare(`
              SELECT pm.slug, pm.name, pm.method_type FROM payment_methods pm
              JOIN casino_payment_methods cpm ON cpm.payment_method_id = pm.id
              JOIN casinos cas ON cas.id = cpm.casino_id
              WHERE cas.slug = ? AND pm.published = 1
              ORDER BY pm.sort_order ASC
            `).bind(casino.slug).all();
            if (pmR.results && pmR.results.length > 0) results.casinoPaymentMethods[casino.slug] = pmR.results;
          } catch {}
        }
      }
    } catch (e) { console.error('Lummet retrieve casinos:', e.message); }
  }

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

  // ═══════════════════════════════════════════════════
  // COUNTRIES
  // ═══════════════════════════════════════════════════
  if (shouldSearchTable('countries', tablesToSearch, intent, ['geo','licensing','general']) && detectedCountry) {
    try {
      const r = await db.prepare(`SELECT code, name, currency, language, legal_status FROM countries WHERE code = ? LIMIT 1`).bind(detectedCountry.toUpperCase()).first();
      if (r) results.countries = [r];
    } catch (e) { console.error('Lummet retrieve countries:', e.message); }
  }

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

  return results;
}

// ── Helper functions ──

function shouldSearchTable(tableName, tablesFromPlan, intent, relevantIntents) {
  if (tablesFromPlan && tablesFromPlan.length > 0) return tablesFromPlan.includes(tableName);
  return relevantIntents.includes(intent) || intent === 'general';
}

function evaluateGeoStatus(rules, country, casino) {
  if (!rules || rules.length === 0) return evaluateGeoFromColumns(casino, country);
  const countryRule = rules.find(r => r.country_code === country.toUpperCase());
  if (countryRule) return countryRule.status;
  const hasAllowed = rules.some(r => r.status === 'allowed');
  const hasBlocked = rules.some(r => r.status === 'blocked');
  if (hasAllowed && !hasBlocked) return 'blocked';
  if (hasBlocked && !hasAllowed) return 'allowed';
  return evaluateGeoFromColumns(casino, country);
}

function evaluateGeoFromColumns(casino, country) {
  if (!casino || !country) return 'unknown';
  const code = country.toUpperCase();
  const codeLower = country.toLowerCase();
  if (casino.restricted_countries) {
    const restricted = casino.restricted_countries.toLowerCase();
    if (restricted.includes(codeLower) || restricted.includes(code)) return 'blocked';
  }
  if (casino.supported_countries) {
    const supported = casino.supported_countries.toLowerCase();
    if (supported === '' || supported === '[]' || supported === 'null') return 'unknown';
    if (supported.includes(codeLower) || supported.includes(code)) return 'allowed';
    if (supported.length > 2) return 'blocked';
  }
  return 'unknown';
}

function extractSearchTerms(message) {
  const text = message.toLowerCase().trim();
  const stopWords = ['what','which','how','why','when','where','who','is','are','was','were','be','do','does','can','could','should','would','will','the','a','an','this','that','about','tell','show','give','list','find','me','us','please','help','want','need','know','casino','casinos','review','reviews','page','pages','my','your','in','on','at','to','for','of','with','from','by','and','or','but','country','countries'];
  const words = text.split(/[^a-z0-9.]+/i).filter(w => w.length > 1);
  return words.filter(w => !stopWords.includes(w));
}

function extractCountryFromMessage(message) {
  const text = message.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    if (text.includes(name)) return code;
  }
  const codePattern = /\b(US|CA|GB|DE|FR|IT|ES|NL|AU|NZ|JP|CN|IN|BR|MX|ZA|NG|KE|EG|SE|NO|DK|FI|PL|PT|GR|TR|RU|UA|AE|SA|QA|KR|TH|VN|PH|ID|MY|SG|AR|CL|CO|PE|AT|CH|IE|BE|CZ|HU|RO|BG|HR|MT|CY|LU|IS|RW)\b/;
  const match = message.match(codePattern);
  return match ? match[1] : null;
}

function isListingText(text) {
  return text.includes('list') || text.includes('all casinos') || text.includes('available casinos') || text.includes('top casinos') || text.includes('best casinos') || text.includes('show me') || text.includes('what casinos') || text.includes('which casinos') || text.includes('casinos are available') || text.includes('casinos do you have');
}

function isGeoText(text) {
  return text.includes('available in') || text.includes('can i play') || text.includes('my country') || text.includes('restricted in') || text.includes('allowed in') || (text.includes('which casinos') && text.includes('country'));
}

/**
 * Build context string from retrieved results for the LLM prompt
 */
export function buildContextString(results, country, site) {
  const parts = [];
  if (results.casinos && results.casinos.length > 0) {
    parts.push('=== CASINOS ===');
    for (const c of results.casinos) {
      const geo = results.geoStatuses[c.slug] || 'unknown';
      const geoLabel = geo === 'allowed' ? 'Available' : geo === 'blocked' ? 'Not available' : 'Unknown';
      let line = `Name: ${c.name} | Slug: ${c.slug} | Rating: ${c.rating || 'N/A'}/5`;
      if (c.bonus_title) line += ` | Bonus: ${c.bonus_title}`;
      if (c.bonus_value) line += ` (${c.bonus_value})`;
      if (c.license) line += ` | License: ${c.license}`;
      if (c.owner) line += ` | Owner: ${c.owner}`;
      line += ` | ${geoLabel} in ${country || 'user country'}`;
      line += ` | Link: ${site.url(`/en/casino/${c.slug}`)}`;
      if (c.parsedFeatures && c.parsedFeatures.length > 0) line += ` | Features: ${c.parsedFeatures.join(', ')}`;
      if (results.casinoCategories && results.casinoCategories[c.slug]) line += ` | Categories: ${results.casinoCategories[c.slug].map(cat => cat.name).join(', ')}`;
      if (results.casinoPaymentMethods && results.casinoPaymentMethods[c.slug]) line += ` | Payment methods: ${results.casinoPaymentMethods[c.slug].map(pm => pm.name).join(', ')}`;
      parts.push(line);
    }
  }

  if (results.reviews && results.reviews.length > 0) {
    parts.push('\n=== REVIEWS ===');
    for (const r of results.reviews) {
      let line = `Title: ${r.title} | Rating: ${r.rating || 'N/A'}/5 | Casino: ${r.casino_slug || 'N/A'}`;
      if (r.overview) line += ` | Overview: ${r.overview}`;
      if (r.pros) line += ` | Pros: ${r.pros}`;
      if (r.cons) line += ` | Cons: ${r.cons}`;
      if (r.verdict) line += ` | Verdict: ${r.verdict}`;
      if (r.author) line += ` | Author: ${r.author}`;
      if (r.games) line += ` | Games: ${r.games}`;
      if (r.bonuses) line += ` | Bonuses: ${r.bonuses}`;
      if (r.payments) line += ` | Payments: ${r.payments}`;
      if (r.licenses) line += ` | Licenses: ${r.licenses}`;
      line += ` | Link: ${site.url(`/en/review/${r.slug}`)}`;
      if (r.faqs && r.faqs.length > 0) line += ` | FAQ: ${r.faqs.map(f => `Q:${f.q || f.question} A:${f.a || f.answer}`).join('; ')}`;
      parts.push(line);
    }
  }

  if (results.reviewBlocks && results.reviewBlocks.length > 0) {
    parts.push('\n=== REVIEW DETAILS ===');
    for (const b of results.reviewBlocks) parts.push(`[${b.review_slug}] ${b.title}: ${b.content}`);
  }

  if (results.news && results.news.length > 0) {
    parts.push('\n=== NEWS ===');
    for (const n of results.news) {
      let line = `Title: ${n.title}`;
      if (n.excerpt) line += ` | Excerpt: ${n.excerpt}`;
      if (n.author) line += ` | Author: ${n.author}`;
      if (n.published_at) line += ` | Date: ${n.published_at}`;
      line += ` | Link: ${site.url(`/en/news/${n.slug}`)}`;
      parts.push(line);
    }
  }

    if (
    results.platformUpdates &&
    results.platformUpdates.length > 0
  ) {
    parts.push('\n=== PLATFORM UPDATES ===');

    for (const u of results.platformUpdates) {
      let line = `Title: ${u.title}`;

      if (u.excerpt) {
        line += ` | Summary: ${u.excerpt}`;
      }

      if (u.content) {
        line += ` | Content: ${u.content}`;
      }

      if (u.author_name) {
        line += ` | Author: ${u.author_name}`;
      }

      if (u.author_role) {
        line += ` | Author Role: ${u.author_role}`;
      }

      if (u.published_at) {
        line += ` | Published: ${u.published_at}`;
      }

      if (u.updated_at) {
        line += ` | Updated: ${u.updated_at}`;
      }

      line += ` | Link: ${site.url(`/en/updates/${u.slug}`)}`;

      parts.push(line);
    }
  }

  if (results.pages && results.pages.length > 0) {
    parts.push('\n=== PAGES ===');
    for (const p of results.pages) parts.push(`Title: ${p.title} | Type: ${p.type || 'page'} | Link: ${site.url(`/en/${p.slug}`)}`);
  }

  if (results.faqs && results.faqs.length > 0) {
    parts.push('\n=== FAQs ===');
    for (const f of results.faqs) parts.push(`Q: ${f.question} | A: ${f.answer}`);
  }

  if (results.authors && results.authors.length > 0) {
    parts.push('\n=== AUTHORS ===');
    for (const a of results.authors) parts.push(`Name: ${a.name} | Role: ${a.role || 'Editor'} | Bio: ${a.bio || ''} | Profile: ${site.url(`/en/author/${a.slug}`)}`);
  }

  if (results.countries && results.countries.length > 0) {
    parts.push('\n=== COUNTRY INFO ===');
    for (const c of results.countries) parts.push(`Country: ${c.name} (${c.code}) | Currency: ${c.currency || 'N/A'} | Language: ${c.language || 'N/A'} | Legal Status: ${c.legal_status || 'N/A'} | Link: ${site.url(`/en/country/${c.code.toLowerCase()}`)}`);
  }

  if (results.categories && results.categories.length > 0) {
    parts.push('\n=== CATEGORIES ===');
    for (const c of results.categories) parts.push(`Category: ${c.name} | Link: ${site.url(`/en/category/${c.slug}`)}`);
  }

  if (results.seoMeta && results.seoMeta.length > 0) {
    parts.push('\n=== SITE INFO ===');
    for (const s of results.seoMeta) parts.push(`Page: ${s.title} | Type: ${s.page_type} | Slug: ${s.page_slug} | Description: ${s.description || ''}`);
  }

  if (results.paymentMethods && results.paymentMethods.length > 0) {
    parts.push('\n=== PAYMENT METHODS ===');
    for (const p of results.paymentMethods) {
      let line = `Name: ${p.name} | Type: ${p.method_type || 'other'}`;
      if (p.description) line += ` | ${p.description}`;
      line += ` | Link: ${site.url(`/en/payment-methods/${p.slug}`)}`;
      parts.push(line);
    }
  }

  if (results.navItems && results.navItems.length > 0) {
    parts.push('\n=== SITE NAVIGATION ===');
    for (const n of results.navItems) {
      parts.push(`${n.label} (${n.location}) | Link: ${site.url(n.url)}`);
    }
  }

  if (results.homepageSections && results.homepageSections.length > 0) {
    parts.push('\n=== HOMEPAGE SECTIONS ===');
    for (const s of results.homepageSections) parts.push(`Section: ${s.title || s.name} | Type: ${s.type}`);
    parts.push(`Homepage link: ${site.url('/en/')}`);
  }

  if (results.seoPages && results.seoPages.length > 0) {
    parts.push('\n=== COUNTRY & CATEGORY GUIDES ===');
    for (const p of results.seoPages) {
      const kind = p.page_type === 'country_custom' ? 'country guide' : 'category hub page';
      parts.push(`${p.title} (${kind}) | Link: ${site.url(p.url)}`);
    }
  }

  // Always-available real hub/list-page URLs. These exist so the model
  // has true fallback links for "guide"/overview-style questions instead
  // of inventing a plausible-sounding URL when nothing more specific
  // matched above (see worker/ai/prompt.js's URL rule and the
  // sanitizeAnswerUrls() guard in assistant.js, which is the actual
  // backstop if the model ignores this anyway).
  parts.push('\n=== SITE SECTIONS (use these as fallback links, never invent a URL) ===');
  parts.push(`Casino list: ${site.url('/en/casino')}`);
  parts.push(`Review list: ${site.url('/en/review')}`);
  parts.push(`News list: ${site.url('/en/news')}`);
  parts.push(`Platform updates list: ${site.url('/en/updates')}`);
  parts.push(`Author list: ${site.url('/en/author')}`);
  parts.push(`Country list: ${site.url('/en/country')}`);
  parts.push(`Category list: ${site.url('/en/category')}`);
  parts.push(`Payment methods list: ${site.url('/en/payment-methods')}`);
  parts.push(`Contact page: ${site.url('/en/contact')}`);
  parts.push(`Responsible gambling resources: ${site.url('/en/responsible-gambling')}`);
  parts.push(`Homepage: ${site.url('/en/')}`);

  return parts.length > 0 ? parts.join('\n') : `No relevant information found in the ${site.siteName} database.`;
}

// ── URL fidelity guard ──
// The model is instructed (prompt.js) to only ever use URLs that appear
// in the context this function builds, but instruction-following alone
// isn't reliable (see the "hallucinated /en/casino-payment-methods,
// /en/mobile-casinos, /en/casino-licensing/*" incident). These two
// functions are the actual backstop: assistant.js runs every generated
// answer through them and replaces anything that isn't a verbatim URL
// from the context with the homepage link.
const URL_TOKEN_RE = /https?:\/\/[^\s)\]}"'<>]+/g;

export function extractContextUrls(contextStr) {
  const set = new Set();
  for (const m of (contextStr.match(URL_TOKEN_RE) || [])) {
    set.add(m.replace(/[.,;:!?]+$/, ''));
  }
  return set;
}

export function sanitizeAnswerUrls(text, allowedUrls, homepageUrl) {
  if (!text) return text;
  return text.replace(URL_TOKEN_RE, (match) => {
    const trailingPunct = match.match(/[.,;:!?]+$/)?.[0] || '';
    const clean = trailingPunct ? match.slice(0, -trailingPunct.length) : match;
    return allowedUrls.has(clean) ? match : (homepageUrl + trailingPunct);
  });
}

/**
 * Streaming-safe version: URLs arrive split across many small deltas,
 * so we can't validate a URL until we've seen the whole thing. Holds
 * back only the trailing not-yet-terminated "http(s)://..." fragment
 * (if any) on each push — everything else flushes immediately, so
 * normal prose still streams with no added latency. Call flush() once
 * the upstream stream ends to emit whatever's left.
 */
function tailPartialSchemeStart(str) {
  // Returns the index where a not-yet-complete "http://" or "https://"
  // prefix begins at the tail of str (e.g. str ends in "...see htt"),
  // or -1 if the tail isn't the start of either scheme. Needed because
  // a scheme arrives character-by-character in streaming mode, and
  // pending.lastIndexOf('https://') only finds it once fully typed --
  // without this, the partial prefix gets flushed unsanitized before
  // the URL it belongs to is even recognizable as a URL.
  const max = Math.min(str.length, 8); // "https://".length
  for (let len = max; len >= 1; len--) {
    const suffix = str.slice(str.length - len);
    if ('https://'.startsWith(suffix) || 'http://'.startsWith(suffix)) return str.length - len;
  }
  return -1;
}

export function createStreamingUrlSanitizer(allowedUrls, homepageUrl) {
  let pending = '';
  return {
    push(delta) {
      pending += delta;
      const lastHttp = Math.max(pending.lastIndexOf('http://'), pending.lastIndexOf('https://'));
      let safeUpTo;
      if (lastHttp !== -1) {
        safeUpTo = /\s/.test(pending.slice(lastHttp)) ? pending.length : lastHttp;
      } else {
        const partialStart = tailPartialSchemeStart(pending);
        safeUpTo = partialStart === -1 ? pending.length : partialStart;
      }
      const toFlush = pending.slice(0, safeUpTo);
      pending = pending.slice(safeUpTo);
      return sanitizeAnswerUrls(toFlush, allowedUrls, homepageUrl);
    },
    flush() {
      const out = sanitizeAnswerUrls(pending, allowedUrls, homepageUrl);
      pending = '';
      return out;
    }
  };
}

// ── Geo/licensing fact guard ──
// URLs have one canonical form, so exact-match works. Regulatory facts
// don't (infinite ways to phrase a tax rate), so this is a heuristic,
// not a guarantee like sanitizeAnswerUrls -- but it catches the two
// concrete patterns that actually showed up in production: specific
// currency/percentage figures and "Name Name (ACRONYM)" authority
// citations that aren't grounded in anything we retrieved. Only meant
// to be applied to geo/licensing-intent answers (see assistant.js).
const CURRENCY_OR_PERCENT_RE = /(?:[€$£]\s?\d[\d,.]*|\d[\d,.]*\s?(?:EUR|USD|GBP))|\b\d{1,3}(?:\.\d+)?\s?%/gi;
const AUTHORITY_ACRONYM_RE = /\b(?:[A-Z][a-zA-Z'&.-]+(?:\s+(?:[a-z]{1,3}\s+)?[A-Z][a-zA-Z'&.-]+){1,7})\s*\(([A-Z]{2,8})\)/g;

function splitIntoSentences(text) {
  // Protect URLs and bare domain-like tokens (e.g. "level.casino" used
  // as the site's own name in prose, not as a link) before splitting --
  // both contain periods that would otherwise be misread as sentence
  // boundaries and fragment mid-word/mid-link.
  const protectRe = /https?:\/\/[^\s)\]}"'<>]+|\b[a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?\b/gi;
  const protectedTokens = [];
  const protectedText = text.replace(protectRe, (m) => {
    protectedTokens.push(m);
    return `\u0000TOK${protectedTokens.length - 1}\u0000`;
  });
  const matches = protectedText.match(/[^.!?\n]+(?:[.!?]+(?=\s|$)|\n|$)/g);
  const sentences = matches && matches.length > 0 ? matches : [protectedText];
  return sentences.map(s => s.replace(/\u0000TOK(\d+)\u0000/g, (_, i) => protectedTokens[Number(i)]));
}

/**
 * Strips sentences from a geo/licensing answer that state a specific
 * currency amount, percentage, or "Authority Name (ACRONYM)" citation
 * not verbatim present in the retrieved context. If that guts the
 * answer entirely, returns a safe generic fallback rather than either
 * the fabricated text or an empty string.
 */
export function guardGeoFacts(answer, contextStr, site) {
  if (!answer) return answer;

  const allowedNumbers = new Set((contextStr.match(CURRENCY_OR_PERCENT_RE) || []).map(s => s.trim()));
  const allowedAcronyms = new Set();
  let am;
  const acronymScan = new RegExp(AUTHORITY_ACRONYM_RE.source, 'g');
  while ((am = acronymScan.exec(contextStr))) allowedAcronyms.add(am[1]);

  const sentences = splitIntoSentences(answer);
  const kept = [];
  let strippedAny = false;

  for (const sentence of sentences) {
    let flagged = false;

    for (const n of (sentence.match(CURRENCY_OR_PERCENT_RE) || [])) {
      if (!allowedNumbers.has(n.trim())) { flagged = true; break; }
    }

    if (!flagged) {
      const sentenceAcronyms = new RegExp(AUTHORITY_ACRONYM_RE.source, 'g');
      let sm;
      while ((sm = sentenceAcronyms.exec(sentence))) {
        if (!allowedAcronyms.has(sm[1])) { flagged = true; break; }
      }
    }

    if (flagged) strippedAny = true;
    else kept.push(sentence);
  }

  const result = kept.join('').replace(/\s+/g, ' ').trim();

  if (!strippedAny) return answer;
  if (result.length >= 20) return result;

  // Everything (or nearly everything) got stripped -- the answer was
  // built almost entirely on ungrounded specifics. Don't show a gutted
  // fragment or fall back to the fabricated original.
  return `I don't have that level of regulatory detail on hand. Please check an official government source for specific licensing requirements, fees, or tax rates.${site ? ` You can see what we do have at ${site.url('/en/')}.` : ''}`;
}

