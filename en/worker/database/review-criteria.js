// review_criteria_templates / review_criteria_scores (migration 0051).
// Generalizes review scoring across every content type, including
// casino: every review (old and new) has reviewed_content_type set
// since the 0052 backfill, so this works uniformly.
//
// The overall rating is ALWAYS computed here, centrally -- never in
// frontend JS (Phase 11 of the original spec) -- so there is exactly
// one place that knows the weighting math, reproducible from stored
// data alone.

export async function getCriteriaTemplates(db, contentType) {
  const result = await db.prepare(`
    SELECT * FROM review_criteria_templates WHERE content_type = ? ORDER BY display_order ASC, id ASC
  `).bind(contentType).all();
  return result.results || [];
}

export async function getCriteriaScores(db, reviewId) {
  const result = await db.prepare(`
    SELECT * FROM review_criteria_scores WHERE review_id = ?
  `).bind(reviewId).all();
  return result.results || [];
}

/**
 * Set (create or update) one criterion's score for a review. Write
 * path for a future admin form -- not wired to a UI yet, same
 * posture as content-items.js's createContentItem.
 */
export async function setCriteriaScore(db, reviewId, criterionKey, score) {
  return db.prepare(`
    INSERT INTO review_criteria_scores (review_id, criterion_key, score)
    VALUES (?, ?, ?)
    ON CONFLICT (review_id, criterion_key) DO UPDATE SET score = excluded.score
  `).bind(reviewId, criterionKey, score).run();
}

/**
 * Computes the weighted overall rating from templates + scores.
 * Pure function (no DB access) so it's trivially testable and
 * trivially reproducible from stored data alone -- exactly the
 * "store enough information to reproduce the rating" requirement
 * from Phase 11 of the original spec.
 *
 * Weights are normalized against the SUM OF WEIGHTS THAT HAVE AN
 * ACTUAL SCORE, not the full template's weight sum -- so a review
 * that's only scored on 3 of a content type's 8 defined criteria
 * still produces a sensible 0-5 rating from those 3, rather than
 * silently under-scoring because "unscored" criteria dragged the
 * denominator down. Returns null (not 0, not NaN) when there is
 * nothing to compute from, so callers can distinguish "no rating
 * yet" from "rated zero."
 */
export function computeWeightedRating(templates, scores) {
  const scoreByKey = new Map(scores.map(s => [s.criterion_key, s.score]));
  let weightedSum = 0;
  let weightTotal = 0;

  for (const t of templates) {
    if (!scoreByKey.has(t.criterion_key)) continue;
    const score = scoreByKey.get(t.criterion_key);
    if (typeof score !== "number" || !Number.isFinite(score)) continue;
    weightedSum += score * t.weight;
    weightTotal += t.weight;
  }

  if (weightTotal <= 0) return null;
  return weightedSum / weightTotal;
}

/**
 * Convenience: templates + scores + the row-by-row breakdown, ready
 * for display (criterion label, weight, score, in display order) --
 * exactly what a "Safety 9.5 × 20%" style breakdown needs, without
 * the caller re-joining templates and scores itself.
 */
export function buildScoreBreakdown(templates, scores) {
  const scoreByKey = new Map(scores.map(s => [s.criterion_key, s.score]));
  return templates
    .map(t => ({
      key: t.criterion_key,
      label: t.label,
      weight: t.weight,
      score: scoreByKey.has(t.criterion_key) ? scoreByKey.get(t.criterion_key) : null,
    }))
    .filter(row => row.score !== null);
}
