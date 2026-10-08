// Payment methods -- reusable across casinos, with their own
// /en/payment-methods (list) and /en/payment-methods/:slug (detail)
// pages, and a many-to-many join to casinos (casino_payment_methods)
// so a casino card's payment-icon row can be built from real data
// instead of being hardcoded per casino. Mirrors categories.js's
// shape/conventions throughout.

export async function getPaymentMethod(db, slug) {
  return db.prepare(`
    SELECT * FROM payment_methods
    WHERE slug = ?
    LIMIT 1
  `).bind(slug).first();
}

export async function getAllPaymentMethods(db) {
  const result = await db.prepare(`
    SELECT * FROM payment_methods
    ORDER BY sort_order ASC, name ASC
  `).all();
  return result.results || [];
}

/**
 * Payment methods eligible for public listing: published=1 AND
 * status != 'draft' -- same eligibility shape as
 * categories.getPublishedCategories().
 */
export async function getPublishedPaymentMethods(db) {
  const result = await db.prepare(`
    SELECT * FROM payment_methods
    WHERE published = 1 AND (status IS NULL OR status != 'draft')
    ORDER BY sort_order ASC, name ASC
  `).all();
  return result.results || [];
}

/**
 * Casinos that support a given payment method, for the
 * /payment-methods/:slug detail page's "casinos that accept this"
 * list. Ordered the same way categories.getCategoryCasinos() orders
 * its list, for a consistent feel across listing-style pages.
 */
export async function getCasinosForPaymentMethod(db, slug) {
  const result = await db.prepare(`
    SELECT c.*
    FROM casino_payment_methods cpm
    JOIN casinos c ON c.id = cpm.casino_id
    JOIN payment_methods pm ON pm.id = cpm.payment_method_id
    WHERE pm.slug = ?
    ORDER BY
      c.featured DESC,
      c.sort_order ASC,
      c.rating DESC
  `).bind(slug).all();
  return result.results || [];
}

/**
 * Just the casino ids linked to a payment method -- for the admin
 * form's "which casinos already accept this" checkbox pre-check.
 * Cheaper than getCasinosForPaymentMethod() when the full casino
 * rows aren't needed.
 */
export async function getCasinoIdsForPaymentMethod(db, slug) {
  const result = await db.prepare(`
    SELECT cpm.casino_id
    FROM casino_payment_methods cpm
    JOIN payment_methods pm ON pm.id = cpm.payment_method_id
    WHERE pm.slug = ?
  `).bind(slug).all();
  return (result.results || []).map(r => r.casino_id);
}

/**
 * Batched: payment methods for MANY casinos in one query, keyed by
 * casino_id -- the same "N+1 avoidance" shape as
 * offers/selection.js's resolveOffersForCasinos(). Card rendering
 * for a 20-50 casino grid must never do one query per casino.
 *
 * Returns { [casinoId]: [{id, slug, name, icon_url, method_type}, ...] }
 */
export async function getPaymentMethodsForCasinos(db, casinoIds) {
  const byCasino = {};
  if (!casinoIds || !casinoIds.length) return byCasino;

  const placeholders = casinoIds.map(() => '?').join(',');
  const result = await db.prepare(`
    SELECT cpm.casino_id, pm.id, pm.slug, pm.name, pm.icon_url, pm.method_type
    FROM casino_payment_methods cpm
    JOIN payment_methods pm ON pm.id = cpm.payment_method_id
    WHERE cpm.casino_id IN (${placeholders})
      AND pm.published = 1
    ORDER BY pm.sort_order ASC, pm.name ASC
  `).bind(...casinoIds).all();

  for (const row of result.results || []) {
    (byCasino[row.casino_id] ||= []).push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      icon_url: row.icon_url,
      method_type: row.method_type,
    });
  }
  return byCasino;
}

export async function getPaymentMethodsForCasino(db, casinoId) {
  const byCasino = await getPaymentMethodsForCasinos(db, [casinoId]);
  return byCasino[casinoId] || [];
}

// ── Basic admin CRUD, following categories.js's create/update/delete
//    shape 1:1, ready for a future dashboard screen. No nav-sync
//    equivalent yet since payment methods don't have an auto-nav
//    concept the way categories/countries do. ──

export async function createPaymentMethod(db, data) {
  return db.prepare(`
    INSERT INTO payment_methods(
      slug, name, icon_url, method_type, description, content_json,
      seo_title, seo_description, seo_keywords, sort_order, status, published
    )
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    data.slug,
    data.name,
    data.icon_url || null,
    data.method_type || 'card',
    data.description || null,
    typeof data.content_json === "string" ? data.content_json : JSON.stringify(data.content_json || {}),
    data.seo_title || null,
    data.seo_description || null,
    data.seo_keywords || null,
    data.sort_order || 0,
    data.status || "published",
    data.published !== undefined ? (data.published ? 1 : 0) : 1
  ).run();
}

export async function updatePaymentMethod(db, slug, data) {
  return db.prepare(`
    UPDATE payment_methods SET
      name=?, icon_url=?, method_type=?, description=?, content_json=?,
      seo_title=?, seo_description=?, seo_keywords=?, sort_order=?,
      status=?, published=?, updated_at=CURRENT_TIMESTAMP
    WHERE slug=?
  `).bind(
    data.name,
    data.icon_url || null,
    data.method_type || 'card',
    data.description || null,
    typeof data.content_json === "string" ? data.content_json : JSON.stringify(data.content_json || {}),
    data.seo_title || null,
    data.seo_description || null,
    data.seo_keywords || null,
    data.sort_order || 0,
    data.status || "published",
    data.published !== undefined ? (data.published ? 1 : 0) : 1,
    slug
  ).run();
}

export async function deletePaymentMethod(db, slug) {
  return db.prepare(`DELETE FROM payment_methods WHERE slug=?`).bind(slug).run();
}

export async function setCasinoPaymentMethods(db, casinoId, paymentMethodIds) {
  await db.prepare(`DELETE FROM casino_payment_methods WHERE casino_id = ?`).bind(casinoId).run();
  for (const pmId of paymentMethodIds || []) {
    await db.prepare(`
      INSERT OR IGNORE INTO casino_payment_methods (casino_id, payment_method_id) VALUES (?, ?)
    `).bind(casinoId, pmId).run();
  }
}

/**
 * The other direction of the same join: replace ALL casinos linked
 * to one payment method. Deliberately a separate function rather
 * than a "just swap the argument order" call to setCasinoPaymentMethods
 * above -- that function deletes by casino_id, this one has to delete
 * by payment_method_id, so they are genuinely different queries, not
 * just relabeled parameters.
 */
export async function setCasinosForPaymentMethod(db, paymentMethodId, casinoIds) {
  await db.prepare(`DELETE FROM casino_payment_methods WHERE payment_method_id = ?`).bind(paymentMethodId).run();
  for (const casinoId of casinoIds || []) {
    await db.prepare(`
      INSERT OR IGNORE INTO casino_payment_methods (casino_id, payment_method_id) VALUES (?, ?)
    `).bind(casinoId, paymentMethodId).run();
  }
}

export async function getPaymentMethodIdsForCasino(db, casinoId) {
  const result = await db.prepare(`
    SELECT payment_method_id FROM casino_payment_methods WHERE casino_id = ?
  `).bind(casinoId).all();
  return (result.results || []).map(r => r.payment_method_id);
}
