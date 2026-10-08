// GENERIC CONTENT RESOLVER
// Normalizes casinos (existing table, database/casinos.js) and
// content_items (sportsbook/affiliate_partner/custom, new table,
// database/content-items.js) into one ContentItem contract, so
// shared rendering/listing/comparison code never has to know which
// table a given item came from.
//
// Casino branch reuses getCasino()/getAllCasinos() verbatim (same
// query, same published/status filter, same ordering) -- zero
// behavior change for existing casino pages if/when they're switched
// to go through this resolver.

import * as casinos from "./database/casinos.js";
import * as contentItems from "./database/content-items.js";

function normalizeCasino(row) {
  return {
    contentType: "casino",
    customTypeSlug: null,
    id: row.id,
    slug: row.slug,
    name: row.name,
    title: row.name,
    description: null, // casinos has no description column; renderers fall back to the review's overview
    logo: row.logo || null,
    website: row.website_url || null,
    rating: row.rating || 0,
    featured: !!row.featured,
    status: row.status,
    published: row.published === 1,
    seo: { title: row.seo_title, description: row.seo_description, keywords: row.seo_keywords },
    linkedAffiliatePartnerId: null, // casino's commercial link is affiliate_program_casinos -- see resolveAffiliateLink()
    raw: row,
  };
}

function normalizeContentItem(row) {
  return {
    contentType: row.content_type,
    customTypeSlug: row.custom_type_slug || null,
    id: row.id,
    slug: row.slug,
    name: row.name,
    title: row.title || row.name,
    description: row.description,
    logo: row.logo || null,
    website: row.website,
    rating: row.rating || 0,
    featured: !!row.featured,
    status: row.status,
    published: row.published === 1,
    seo: { title: row.seo_title, description: row.seo_description, keywords: row.seo_keywords },
    linkedAffiliatePartnerId: row.linked_affiliate_partner_id || null,
    raw: row,
  };
}

export async function resolveContentItem(db, contentType, slug) {
  if (contentType === "casino") {
    const row = await casinos.getCasino(db, slug);
    return row ? normalizeCasino(row) : null;
  }
  // Gated the same way the casino branch is (getCasino() filters
  // published/status in-query) -- see getPublishedContentItem()'s doc
  // comment in content-items.js. This resolver is the shared
  // public-facing normalization path (used by listContentItems() below,
  // and meant for renderSportsbook/renderAffiliatePartner/renderCustom),
  // so it must never expose a draft/unpublished item either.
  const row = await contentItems.getPublishedContentItem(db, contentType, slug);
  return row ? normalizeContentItem(row) : null;
}

export async function resolveContentItemById(db, contentType, id) {
  if (contentType === "casino") {
    // Gated inline (no existing gated by-id casino getter in
    // database/casinos.js to reuse) -- same published/status filter
    // getCasino() applies by slug. This function backs
    // resolvePolymorphicRef(), which comparison_items/reviews use to
    // resolve an (item_type, item_id) pointer; without this gate, a
    // draft/unpublished casino referenced by a published comparison
    // would leak its name/rating/logo into that public comparison
    // page even though its own detail page correctly 404s.
    const row = await db.prepare(`SELECT * FROM casinos WHERE id = ? AND published = 1 AND status = 'published' LIMIT 1`).bind(id).first();
    return row ? normalizeCasino(row) : null;
  }
  const row = await contentItems.getPublishedContentItemById(db, contentType, id);
  return row ? normalizeContentItem(row) : null;
}

export async function listContentItems(db, contentType, { limit = 20, offset = 0 } = {}) {
  if (contentType === "casino") {
    const rows = await casinos.getAllCasinos(db);
    return (rows || []).slice(offset, offset + limit).map(normalizeCasino);
  }
  const rows = await contentItems.getPublishedContentItems(db, contentType, { limit, offset });
  return rows.map(normalizeContentItem);
}

/**
 * Resolve the commercial affiliate link for ANY content item. Casino
 * uses the EXISTING affiliate_program_casinos join (migration 0023);
 * affiliate_partner content uses the NEW linked_affiliate_partner_id
 * column. Neither existing table is modified. Returns null (a normal,
 * expected case -- not an error) when there's no commercial link.
 *
 * PUBLIC-SAFE FIELD SELECTION ONLY: affiliate_partners and
 * affiliate_programs carry internal/commercial fields (contact_name,
 * contact_email, contact_phone, notes, reporting_notes, portal_url,
 * external_reference, created_by/updated_by) that must never reach a
 * public page. This function is the one place the public rendering
 * path touches these tables, so the column list is deliberately
 * explicit and narrow rather than `SELECT *` -- widen it only if a
 * specific new field is confirmed safe to show publicly, not by
 * habit. Admin/dashboard code that needs the full row already reads
 * affiliate_partners/affiliate_programs directly (see the existing
 * renderDashboardAffiliatePartners path) and is unaffected by this
 * function either way.
 */
export async function resolveAffiliateLink(db, item) {
  if (item.contentType === "casino") {
    const row = await db.prepare(`
      SELECT
        ap.id AS program_id, ap.name AS program_name, ap.status AS program_status,
        ap.supported_geos AS program_supported_geos,
        p.id AS partner_id, p.name AS partner_name, p.slug AS partner_slug,
        p.website AS partner_website, p.status AS partner_status
      FROM affiliate_program_casinos apc
      JOIN affiliate_programs ap ON ap.id = apc.program_id
      JOIN affiliate_partners p ON p.id = ap.partner_id
      WHERE apc.casino_id = ? AND apc.status = 'active'
      ORDER BY apc.created_at DESC
      LIMIT 1
    `).bind(item.id).first();
    return row || null;
  }
  if (item.contentType === "affiliate_partner" && item.linkedAffiliatePartnerId) {
    const row = await db.prepare(`
      SELECT id AS partner_id, name AS partner_name, slug AS partner_slug,
             website AS partner_website, description AS partner_description,
             partner_type, status AS partner_status
      FROM affiliate_partners WHERE id = ? LIMIT 1
    `).bind(item.linkedAffiliatePartnerId).first();
    return row || null;
  }
  return null;
}

/** Shared resolution path for every (item_type, item_id) polymorphic pointer: comparison_items, reviews.reviewed_content_*. */
export async function resolvePolymorphicRef(db, itemContentType, itemId) {
  return resolveContentItemById(db, itemContentType, itemId);
}
