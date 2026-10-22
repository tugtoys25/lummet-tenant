// Part of the retrieval engine (see docs/ARCHITECTURE_AI_RETRIEVAL.md). Each function receives the shared request context and the results object and fills in its own tables.
import { MAX_RESULTS, fuzzyFindCasinoSlug, normalizeForMatch } from "../match-helpers.js";
import { evaluateGeoFromColumns, evaluateGeoStatus, shouldSearchTable } from "../search-helpers.js";

export async function searchCasinos(ctx, results) {
  const { db, casinoNames, allSearchTerms, detectedCountry, intent, isListing, isGeo, tablesToSearch } = ctx;
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
}
