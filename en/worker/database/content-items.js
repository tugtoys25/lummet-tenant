// content_items -- sportsbook / affiliate_partner / custom storage
// (migration 0051). Casino data stays in database/casinos.js and
// the `casinos` table; this module never touches `casinos`.
//
// Query shapes deliberately mirror database/casinos.js so the two
// can sit behind the same generic resolver (content-resolver.js)
// without surprises.

export async function getContentItem(db, contentType, slug) {
  return db.prepare(`
    SELECT ci.*, m.url AS logo, h.url AS hero_image
    FROM content_items ci
    LEFT JOIN media_library m ON m.id = ci.logo_media_id
    LEFT JOIN media_library h ON h.id = ci.featured_image_media_id
    WHERE ci.content_type = ? AND ci.slug = ?
    LIMIT 1
  `).bind(contentType, slug).first();
}

export async function getContentItemById(db, contentType, id) {
  return db.prepare(`
    SELECT * FROM content_items WHERE content_type = ? AND id = ? LIMIT 1
  `).bind(contentType, id).first();
}

/**
 * Public-safe single-item lookups, gated the same way casinos.getCasino()
 * gates its query (WHERE published = 1 AND status = 'published'). Added
 * because renderSportsbook/renderAffiliatePartner/renderCustom in
 * controllers.js, and content-resolver.js's resolveContentItem/
 * resolveContentItemById, were all calling getContentItem()/
 * getContentItemById() above directly -- which have no gate at all -- so
 * a draft/unpublished item was reachable at its direct public URL, and a
 * draft item referenced by a published comparison's row/editorial-pick
 * would render publicly through the comparison page too. getContentItem()/
 * getContentItemById() stay unfiltered on purpose (admin edit screens,
 * /content-item/get, etc. need to see drafts); these are the public-only
 * counterparts.
 */
export async function getPublishedContentItem(db, contentType, slug) {
  return db.prepare(`
    SELECT ci.*, m.url AS logo, h.url AS hero_image
    FROM content_items ci
    LEFT JOIN media_library m ON m.id = ci.logo_media_id
    LEFT JOIN media_library h ON h.id = ci.featured_image_media_id
    WHERE ci.content_type = ? AND ci.slug = ? AND ci.published = 1 AND ci.status = 'published'
    LIMIT 1
  `).bind(contentType, slug).first();
}

export async function getPublishedContentItemById(db, contentType, id) {
  return db.prepare(`
    SELECT * FROM content_items WHERE content_type = ? AND id = ? AND published = 1 AND status = 'published' LIMIT 1
  `).bind(contentType, id).first();
}

/**
 * Published items of a type, for listing pages. Mirrors
 * casinos.getAllCasinos()'s ordering convention
 * (featured DESC, sort_order ASC, name ASC).
 */
export async function getPublishedContentItems(db, contentType, { limit = 100, offset = 0 } = {}) {
  const result = await db.prepare(`
    SELECT ci.*, m.url AS logo
    FROM content_items ci
    LEFT JOIN media_library m ON m.id = ci.logo_media_id
    WHERE ci.content_type = ? AND ci.published = 1 AND ci.status = 'published'
    ORDER BY ci.featured DESC, ci.sort_order ASC, ci.name ASC
    LIMIT ? OFFSET ?
  `).bind(contentType, limit, offset).all();
  return result.results || [];
}

/** All items of a type, published or not -- for admin listings (Phase 3 exposes the query; the admin UI itself is later work). */
/**
 * All items of a type, published or not -- for admin listings.
 * `search` (optional) matches name/slug/title (case-insensitive,
 * substring); `status` (optional) restricts to one lifecycle status.
 * `extraCondition`/`extraParams` (optional) let the caller AND in an
 * item-level access scoping clause (see item-access.js's
 * getAccessibleWhereClause()) without duplicating this query-building
 * logic at the call site. All are additive on top of the original
 * query -- calling with no options reproduces the original
 * unfiltered-by-search/status/scope behavior exactly, so existing
 * callers are unaffected.
 */
export async function getAllContentItems(db, contentType, { search = null, status = null, extraCondition = null, extraParams = [], limit = null, offset = 0 } = {}) {
  const clauses = ["content_type = ?"];
  const params = [contentType];
  if (search) {
    clauses.push("(LOWER(name) LIKE ? OR LOWER(slug) LIKE ? OR LOWER(title) LIKE ?)");
    const like = `%${search.toLowerCase()}%`;
    params.push(like, like, like);
  }
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (extraCondition) {
    clauses.push(extraCondition);
    params.push(...extraParams);
  }
  const where = clauses.join(" AND ");
  // limit is optional and defaults to unbounded (existing callers, e.g.
  // public list pages that don't paginate, are unaffected); passing it
  // is how the admin list's pager (audit #15) works.
  const limitSql = limit != null ? "LIMIT ? OFFSET ?" : "";
  const result = await db.prepare(`
    SELECT * FROM content_items WHERE ${where} ORDER BY featured DESC, sort_order ASC, name ASC ${limitSql}
  `).bind(...(limit != null ? [...params, limit, offset] : params)).all();
  const items = result.results || [];
  if (limit == null) return items;
  const total = (await db.prepare(`SELECT COUNT(*) n FROM content_items WHERE ${where}`).bind(...params).first()).n;
  return { items, total };
}

export async function countPublishedContentItems(db, contentType) {
  const row = await db.prepare(`
    SELECT COUNT(*) AS n FROM content_items WHERE content_type = ? AND published = 1 AND status = 'published'
  `).bind(contentType).first();
  return row?.n || 0;
}

/**
 * Sports/payment-methods/currencies attached to one item, via the
 * generic join tables from migration 0051. Returns the lookup rows
 * themselves (not just ids) so callers can render names/icons
 * directly.
 */
export async function getContentItemSports(db, contentType, contentId) {
  const result = await db.prepare(`
    SELECT s.* FROM content_sports cs
    JOIN sports s ON s.id = cs.sport_id
    WHERE cs.content_type = ? AND cs.content_id = ?
    ORDER BY s.sort_order ASC, s.name ASC
  `).bind(contentType, contentId).all();
  return result.results || [];
}

export async function getContentItemPaymentMethods(db, contentType, contentId) {
  const result = await db.prepare(`
    SELECT pm.* FROM content_payment_methods cpm
    JOIN payment_methods pm ON pm.id = cpm.payment_method_id
    WHERE cpm.content_type = ? AND cpm.content_id = ?
    ORDER BY pm.sort_order ASC, pm.name ASC
  `).bind(contentType, contentId).all();
  return result.results || [];
}

export async function getContentItemCurrencies(db, contentType, contentId) {
  const result = await db.prepare(`
    SELECT c.* FROM content_currencies cc
    JOIN currencies c ON c.id = cc.currency_id
    WHERE cc.content_type = ? AND cc.content_id = ?
    ORDER BY c.code ASC
  `).bind(contentType, contentId).all();
  return result.results || [];
}

/**
 * Create a new content item. Minimal write path -- enough for a
 * future admin form or a seed script to use; the dashboard UI itself
 * (Phase 25/67 of the original spec) is not part of Phase 3. slug
 * uniqueness is enforced by the UNIQUE(content_type, slug) constraint
 * from migration 0051 -- this will throw if it collides, same as
 * casinos.createCasino()'s behavior on a duplicate slug.
 */
/**
 * Partial update. Only the fields present in `fields` are changed --
 * omit a key to leave that column untouched (this is the "PATCH"
 * shape, not a full-row replace). Identified by (content_type, slug)
 * since the UNIQUE constraint is on that pair, same as every other
 * lookup in this module.
 */
export async function updateContentItem(db, contentType, slug, fields) {
  const columnMap = {
    name: "name", title: "title", description: "description", website: "website",
    rating: "rating", license: "license", licenseCountry: "license_country",
    liveBetting: "live_betting", preMatch: "pre_match", cashout: "cashout", mobileApp: "mobile_app",
    linkedAffiliatePartnerId: "linked_affiliate_partner_id", metadataJson: "metadata_json",
    featured: "featured", sortOrder: "sort_order", status: "status", published: "published",
    seoTitle: "seo_title", seoDescription: "seo_description", seoKeywords: "seo_keywords",
    logoMediaId: "logo_media_id", featuredImageMediaId: "featured_image_media_id", trackingUrl: "tracking_url",
  };
  const booleanFields = new Set(["liveBetting", "preMatch", "cashout", "mobileApp", "featured", "published"]);

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(columnMap)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${column} = ?`);
      values.push(booleanFields.has(key) ? (fields[key] ? 1 : 0) : fields[key]);
    }
  }
  if (!sets.length) return getContentItem(db, contentType, slug);

  sets.push(`updated_at = CURRENT_TIMESTAMP`);
  if (fields.published && !fields.publishedAtAlreadySet) {
    sets.push(`published_at = COALESCE(published_at, CURRENT_TIMESTAMP)`);
  }
  values.push(contentType, slug);

  return db.prepare(`
    UPDATE content_items SET ${sets.join(", ")} WHERE content_type = ? AND slug = ? RETURNING *
  `).bind(...values).first();
}

export async function deleteContentItemCustomFieldValues(db, contentItemId) {
  return db.prepare(`DELETE FROM custom_field_values WHERE content_item_id = ?`).bind(contentItemId).run();
}

/** Bulk-set custom field values: replaces every value for this item with exactly what's passed (a full replace, not a patch -- simpler and safer for a form that always submits every field it knows about). values: { field_key: value, ... } */
export async function setContentItemCustomFieldValues(db, contentItemId, values) {
  await deleteContentItemCustomFieldValues(db, contentItemId);
  for (const [fieldKey, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") continue; // don't store empty rows
    await db.prepare(`
      INSERT INTO custom_field_values (content_item_id, field_key, value) VALUES (?, ?, ?)
    `).bind(contentItemId, fieldKey, String(value)).run();
  }
}

export async function createContentItem(db, contentType, fields) {
  const {
    slug, name, title = null, description = null, excerpt = null,
    website = null, rating = 0, license = null, licenseCountry = null,
    liveBetting = false, preMatch = false, cashout = false, mobileApp = false,
    linkedAffiliatePartnerId = null, metadataJson = null,
    featured = false, sortOrder = 0, status = 'draft', published = false,
    seoTitle = null, seoDescription = null, seoKeywords = null,
    authorId = null, createdBy = null, customTypeSlug = null,
    logoMediaId = null, featuredImageMediaId = null, trackingUrl = null,
  } = fields;

  const result = await db.prepare(`
    INSERT INTO content_items (
      content_type, custom_type_slug, slug, name, title, description, excerpt,
      website, rating, license, license_country, live_betting, pre_match, cashout, mobile_app,
      linked_affiliate_partner_id, metadata_json,
      featured, sort_order, status, published,
      seo_title, seo_description, seo_keywords, author_id, created_by, published_at,
      logo_media_id, featured_image_media_id, tracking_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).bind(
    contentType, customTypeSlug, slug, name, title, description, excerpt,
    website, rating, license, licenseCountry, liveBetting ? 1 : 0, preMatch ? 1 : 0, cashout ? 1 : 0, mobileApp ? 1 : 0,
    linkedAffiliatePartnerId, metadataJson,
    featured ? 1 : 0, sortOrder, status, published ? 1 : 0,
    seoTitle, seoDescription, seoKeywords, authorId, createdBy,
    published ? new Date().toISOString() : null,
    logoMediaId, featuredImageMediaId, trackingUrl
  ).first();

  return result;
}

/**
 * Replace-all setters for the normalized sportsbook relationship tables
 * (migration 0051: content_sports / content_currencies /
 * content_payment_methods). These tables and their getters
 * (getContentItemSports/Currencies/PaymentMethods, above) already
 * existed; only the write side was missing, so nothing could ever be
 * assigned through the admin UI. Same delete-then-insert shape as
 * setContentItemCustomFieldValues() above -- passing an empty array
 * clears all assignments for the item.
 */
export async function setContentItemSports(db, contentType, contentId, sportIds) {
  await db.prepare(`DELETE FROM content_sports WHERE content_type = ? AND content_id = ?`).bind(contentType, contentId).run();
  for (const sportId of sportIds) {
    await db.prepare(`INSERT OR IGNORE INTO content_sports (content_type, content_id, sport_id) VALUES (?, ?, ?)`).bind(contentType, contentId, sportId).run();
  }
}

export async function setContentItemCurrencies(db, contentType, contentId, currencyIds) {
  await db.prepare(`DELETE FROM content_currencies WHERE content_type = ? AND content_id = ?`).bind(contentType, contentId).run();
  for (const currencyId of currencyIds) {
    await db.prepare(`INSERT OR IGNORE INTO content_currencies (content_type, content_id, currency_id) VALUES (?, ?, ?)`).bind(contentType, contentId, currencyId).run();
  }
}

export async function setContentItemPaymentMethods(db, contentType, contentId, paymentMethodIds) {
  await db.prepare(`DELETE FROM content_payment_methods WHERE content_type = ? AND content_id = ?`).bind(contentType, contentId).run();
  for (const paymentMethodId of paymentMethodIds) {
    await db.prepare(`INSERT OR IGNORE INTO content_payment_methods (content_type, content_id, payment_method_id) VALUES (?, ?, ?)`).bind(contentType, contentId, paymentMethodId).run();
  }
}

/**
 * Search content_items across the generic types for the comparison
 * builder's item picker (replaces raw numeric ID entry). Casino search
 * is handled separately by the caller (casinos table lives outside this
 * module). Matches name/slug, case-insensitive substring.
 */
export async function searchContentItems(db, { contentType = null, search = "", limit = 20 } = {}) {
  const clauses = [];
  const params = [];
  if (contentType) {
    clauses.push("content_type = ?");
    params.push(contentType);
  }
  if (search) {
    clauses.push("(LOWER(name) LIKE ? OR LOWER(slug) LIKE ?)");
    const like = `%${search.toLowerCase()}%`;
    params.push(like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await db.prepare(`
    SELECT id, content_type, slug, name, status, published
    FROM content_items ${where}
    ORDER BY name ASC LIMIT ?
  `).bind(...params, limit).all();
  return result.results || [];
}

// =====================================================
// GENERIC CATEGORIES (content_categories, migration 0051) -- was
// schema-ready but had no DB functions/API/UI wired to it at all.
// Mirrors casinos.js's setCasinoCategories/getCasinoCategories
// exactly (same delete-then-insert shape), just keyed by
// (content_type, content_id) instead of a dedicated casino_id column,
// since one join table now covers every content type.
// =====================================================

export async function getContentItemCategories(db, contentType, contentId) {
  const result = await db.prepare(`
    SELECT category_id FROM content_categories WHERE content_type = ? AND content_id = ?
  `).bind(contentType, contentId).all();
  return (result.results || []).map(r => r.category_id);
}

export async function setContentItemCategories(db, contentType, contentId, categoryIds) {
  await db.prepare(`DELETE FROM content_categories WHERE content_type = ? AND content_id = ?`).bind(contentType, contentId).run();
  for (const categoryId of categoryIds) {
    await db.prepare(`INSERT OR IGNORE INTO content_categories (content_type, content_id, category_id) VALUES (?, ?, ?)`).bind(contentType, contentId, categoryId).run();
  }
}

// =====================================================
// GENERIC GEO (content_geo, migration 0051) -- same story: the table
// existed, nothing read or wrote it. Mirrors the existing casino GEO
// model exactly (same status vocabulary, same "no rules at all ->
// blocked everywhere" default, same allowlist/blocklist inference
// documented in controllers.js's prepareGeoData()/evaluateCasinoGeo())
// so admins and visitors see identical GEO semantics regardless of
// content type -- this reuses the existing model, it does not invent
// a second one (see related-casinos.js's design-note precedent for
// why that matters).
// =====================================================

export async function getContentItemGeoRules(db, contentType, contentId) {
  const result = await db.prepare(`
    SELECT id, country_code, status, bonus_override, priority, redirect_url
    FROM content_geo WHERE content_type = ? AND content_id = ? ORDER BY country_code ASC
  `).bind(contentType, contentId).all();
  return result.results || [];
}

/** Replace-all setter, same shape as every other content_* relationship setter in this file. */
export async function setContentItemGeoRules(db, contentType, contentId, rules) {
  await db.prepare(`DELETE FROM content_geo WHERE content_type = ? AND content_id = ?`).bind(contentType, contentId).run();
  for (const rule of rules) {
    await db.prepare(`
      INSERT INTO content_geo (content_type, content_id, country_code, status, bonus_override, priority, redirect_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(contentType, contentId, rule.country_code, rule.status, rule.bonus_override || null, rule.priority || 0, rule.redirect_url || null).run();
  }
}

/**
 * Batch GEO-status resolution for a list of content items, one visitor
 * country. Same inference rules as controllers.js's prepareGeoData()
 * for casinos (no rule at all -> "blocked"; a rule for this exact
 * country wins; otherwise infer allowlist-vs-blocklist mode from
 * whatever rules DO exist) -- deliberately reimplemented here rather
 * than shared, since prepareGeoData() is casino/geo_rules-specific
 * (different table, different slug-based key) and this project's
 * existing convention (see related-casinos.js) is to reuse each
 * GEO MODEL exactly, not force both call sites through one shared
 * function across two different tables.
 */
export async function getContentGeoStatuses(db, contentType, contentIds, countryCode) {
  if (!contentIds.length) return {};
  const placeholders = contentIds.map(() => "?").join(",");
  const result = await db.prepare(`
    SELECT content_id, country_code, status FROM content_geo
    WHERE content_type = ? AND content_id IN (${placeholders})
  `).bind(contentType, ...contentIds).all();

  const rulesById = {};
  for (const row of (result.results || [])) {
    (rulesById[row.content_id] ||= []).push(row);
  }

  const statuses = {};
  for (const id of contentIds) {
    const rules = rulesById[id] || [];
    if (rules.length === 0) {
      statuses[id] = "blocked";
      continue;
    }
    const countryRule = rules.find(r => r.country_code === countryCode);
    if (countryRule) {
      statuses[id] = countryRule.status;
      continue;
    }
    const hasAllowed = rules.some(r => r.status === "allowed");
    const hasBlocked = rules.some(r => r.status === "blocked");
    if (hasAllowed && !hasBlocked) statuses[id] = "blocked";
    else if (hasBlocked && !hasAllowed) statuses[id] = "allowed";
    else statuses[id] = "blocked";
  }
  return statuses;
}

// =====================================================
// RELATED ITEMS (Phase 3 report's documented follow-up: "no KV
// caching of related items"). A deliberately simpler scoring model
// than related-casinos.js's category+feature engine -- content_items
// has no per-type "features" JSON column to text-match against, so
// this only scores on shared categories (content_categories), with
// the same quality tiebreak (rating + featured bonus) and the same
// GEO-eligibility pre-filter (using getContentGeoStatuses() above)
// related-casinos.js documents and uses. Caching itself (KV,
// getCached/setCached, 300s TTL) is done by the caller in
// controllers.js, mirroring renderCasino()'s relatedCasinosPromise
// exactly -- this function is the pure "compute" half.
// =====================================================

export async function getRelatedContentItems(db, currentItem, contentType, countryCode, limit = 6) {
  if (!currentItem || !currentItem.id) return [];

  const currentCategoryIds = await getContentItemCategories(db, contentType, currentItem.id);

  let seedPool;
  if (currentCategoryIds.length) {
    const placeholders = currentCategoryIds.map(() => "?").join(",");
    const result = await db.prepare(`
      SELECT DISTINCT ci.* FROM content_items ci
      JOIN content_categories cc ON cc.content_type = ci.content_type AND cc.content_id = ci.id
      WHERE ci.content_type = ? AND ci.id != ? AND ci.published = 1 AND ci.status = 'published'
        AND cc.category_id IN (${placeholders})
      LIMIT 50
    `).bind(contentType, currentItem.id, ...currentCategoryIds).all();
    seedPool = result.results || [];
  } else {
    seedPool = [];
  }

  // Fallback tier: if category matching didn't fill the pool, top up
  // with the platform's existing quality tie-breaker convention
  // (featured DESC, sort_order ASC, rating DESC) -- same fallback
  // related-casinos.js documents and uses.
  if (seedPool.length < limit) {
    const excludeIds = new Set([currentItem.id, ...seedPool.map(c => c.id)]);
    const fallback = await getAllContentItems(db, contentType, { status: "published" });
    for (const candidate of fallback) {
      if (seedPool.length >= limit * 3) break; // bounded pool before GEO filtering, same spirit as related-casinos.js's "never scan the whole table" note
      if (excludeIds.has(candidate.id) || !candidate.published) continue;
      seedPool.push(candidate);
      excludeIds.add(candidate.id);
    }
  }

  if (seedPool.length === 0) return [];

  const seedIds = seedPool.map(c => c.id);
  const [categoriesByItemId, geoStatuses] = await Promise.all([
    (async () => {
      const placeholders = seedIds.map(() => "?").join(",");
      const rows = (await db.prepare(`
        SELECT content_id, category_id FROM content_categories
        WHERE content_type = ? AND content_id IN (${placeholders})
      `).bind(contentType, ...seedIds).all()).results || [];
      const map = {};
      for (const row of rows) (map[row.content_id] ||= []).push(row.category_id);
      return map;
    })(),
    getContentGeoStatuses(db, contentType, seedIds, countryCode),
  ]);

  const currentCategorySet = new Set(currentCategoryIds);
  const scored = seedPool
    .filter(c => geoStatuses[c.id] === "allowed") // GEO eligibility as a pre-filter, not a score term -- see related-casinos.js's design note
    .map(c => {
      const sharedCategories = (categoriesByItemId[c.id] || []).filter(id => currentCategorySet.has(id)).length;
      const qualityTiebreak = (c.rating || 0) + (c.featured ? 0.5 : 0);
      return { ...c, _relatedScore: sharedCategories * 40 + qualityTiebreak, _sharedCategories: sharedCategories };
    });

  scored.sort((a, b) => b._relatedScore - a._relatedScore);
  return scored.slice(0, limit);
}
