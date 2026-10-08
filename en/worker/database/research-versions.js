// =====================================================
// RESEARCH ENGINE — Phase 4 database layer: versioning
//
// A snapshot is taken whenever a save leaves a research item
// published — never on every autosave, and never if nothing in
// the versioned fields actually changed since the last snapshot.
// =====================================================

// The subset of research_items columns that make up a "version" —
// deliberately excludes bookkeeping fields (id, created_at,
// updated_at, published_at, next_review_at, last_verified_at)
// that change on every save regardless of content and would
// otherwise defeat the "only snapshot on real change" check.
const VERSIONED_FIELDS = [
  "type", "slug", "title", "subtitle", "excerpt", "content_json",
  "country_id", "author_id", "status", "published", "robots",
  "seo_title", "seo_description", "seo_keywords", "canonical_url",
  "og_image", "featured"
];

function snapshotFromItem(item) {
  const snapshot = {};
  for (const field of VERSIONED_FIELDS) snapshot[field] = item[field] ?? null;
  return snapshot;
}

export async function getVersionsForItem(db, researchItemId) {
  const result = await db.prepare(`
    SELECT id, version_number, changed_by, change_summary, restored_from_version, created_at
    FROM research_item_versions
    WHERE research_item_id = ?
    ORDER BY version_number DESC
  `).bind(researchItemId).all();
  return result.results || [];
}

export async function getVersion(db, id) {
  const row = await db.prepare(`SELECT * FROM research_item_versions WHERE id = ? LIMIT 1`).bind(id).first();
  if (!row) return null;
  return { ...row, content_snapshot: JSON.parse(row.content_snapshot) };
}

/**
 * Snapshots the given (already-saved) research_items row as a new
 * version — but only if it differs from the most recent existing
 * snapshot, and only if the item is published. Returns the new
 * version row, or null if no snapshot was needed.
 */
export async function createVersionIfChanged(db, item, { changedBy = null, changeSummary = null, restoredFromVersion = null } = {}) {
  if (!item.published) return null;

  const snapshot = snapshotFromItem(item);
  const snapshotJson = JSON.stringify(snapshot);

  const latest = await db.prepare(`
    SELECT version_number, content_snapshot FROM research_item_versions
    WHERE research_item_id = ? ORDER BY version_number DESC LIMIT 1
  `).bind(item.id).first();

  if (latest && latest.content_snapshot === snapshotJson) return null;

  const nextVersion = (latest?.version_number || 0) + 1;

  const result = await db.prepare(`
    INSERT INTO research_item_versions (
      research_item_id, version_number, content_snapshot,
      changed_by, change_summary, restored_from_version
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    item.id,
    nextVersion,
    snapshotJson,
    changedBy,
    changeSummary,
    restoredFromVersion
  ).run();

  return { id: result.meta?.last_row_id, version_number: nextVersion };
}

/**
 * Field-level diff between two version snapshots (or a snapshot and
 * the live item) — shallow, not a text diff, which is enough to show
 * "what changed" in an admin review UI without a diff library.
 */
export function diffSnapshots(before, after) {
  const changes = [];
  const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const field of fields) {
    const beforeVal = before ? before[field] : undefined;
    const afterVal = after ? after[field] : undefined;
    const beforeStr = typeof beforeVal === "object" ? JSON.stringify(beforeVal) : beforeVal;
    const afterStr = typeof afterVal === "object" ? JSON.stringify(afterVal) : afterVal;
    if (beforeStr !== afterStr) {
      changes.push({ field, before: beforeVal ?? null, after: afterVal ?? null });
    }
  }
  return changes;
}

/**
 * Restores a research_items row to a past version's snapshot —
 * writes the snapshot's fields back onto the live row, then records
 * a NEW version marking it as a restore (so history shows "restored
 * from v3", never rewrites v3 itself and never deletes the versions
 * created after it).
 */
export async function restoreVersion(db, versionId, { changedBy = null } = {}) {
  const version = await getVersion(db, versionId);
  if (!version) throw new Error("Version not found");

  const snapshot = version.content_snapshot;
  const setClauses = VERSIONED_FIELDS.map((f) => `${f} = ?`).join(", ");
  await db.prepare(`
    UPDATE research_items SET ${setClauses}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(...VERSIONED_FIELDS.map((f) => snapshot[f] ?? null), version.research_item_id).run();

  const restoredItem = await db.prepare(`SELECT * FROM research_items WHERE id = ?`).bind(version.research_item_id).first();

  await createVersionIfChanged(db, restoredItem, {
    changedBy,
    changeSummary: `Restored from version ${version.version_number}`,
    restoredFromVersion: version.version_number
  });

  return restoredItem;
}

export { VERSIONED_FIELDS };
