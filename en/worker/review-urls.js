// Where a review lives on the public site.
//
// Casino reviews live at /en/review/{slug}. Reviews of sportsbooks, affiliate
// partners and custom content live ONLY at their own path
//   /en/sportsbook/review/{slug}
//   /en/affiliate-partner/review/{slug}
//   /en/custom/{type}/review/{slug}
// and must never be reachable, listed or linked under /en/review.
export const CASINO_REVIEWS_SQL = "(reviewed_content_type IS NULL OR reviewed_content_type = 'casino')";

export function isCasinoReview(row) {
  return !row || !row.reviewed_content_type || row.reviewed_content_type === "casino";
}

/** Public address of a review row, or null when it cannot be worked out (e.g. a custom review whose type is unknown). */
export function reviewPublicUrl(row) {
  if (!row || !row.slug) return null;
  const slug = encodeURIComponent(row.slug);
  const t = row.reviewed_content_type || "casino";
  if (t === "casino") return `/en/review/${slug}`;
  if (t === "sportsbook") return `/en/sportsbook/review/${slug}`;
  if (t === "affiliate_partner") return `/en/affiliate-partner/review/${slug}`;
  if (t === "custom" && row.custom_type_slug) return `/en/custom/${encodeURIComponent(row.custom_type_slug)}/review/${slug}`;
  return null;
}

/** SQL pieces to read reviews together with the custom type slug their reviewed item belongs to. */
export const REVIEW_WITH_TYPE_SQL = `SELECT r.slug, r.title, r.reviewed_content_type, ci.custom_type_slug
  FROM reviews r
  LEFT JOIN content_items ci ON ci.id = r.reviewed_content_id AND r.reviewed_content_type = 'custom'`;
