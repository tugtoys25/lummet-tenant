// =====================================================
// RESEARCH ENGINE — Phase 6 database layer: datasets
//
// A dataset is reusable across many report sections and country
// pages (spec section 27), so it has its own version history
// independent of any one research item — same
// "snapshot-if-changed on publish" pattern as
// research-versions.js, applied to columns_json/rows_json instead
// of a research item's fields.
// =====================================================

const DATASET_STATUSES = ["draft", "published", "needs_update", "archived"];

export function isValidDatasetStatus(status) {
  return DATASET_STATUSES.includes(status);
}

export async function getDataset(db, id) {
  return await db.prepare(`SELECT * FROM research_datasets WHERE id = ? LIMIT 1`).bind(id).first();
}

export async function getDatasetBySlug(db, slug) {
  return await db.prepare(`SELECT * FROM research_datasets WHERE slug = ? LIMIT 1`).bind(slug).first();
}

export async function getAllDatasets(db) {
  const result = await db.prepare(`SELECT * FROM research_datasets ORDER BY title`).all();
  return result.results || [];
}

export async function createDataset(db, data) {
  if (data.status && !isValidDatasetStatus(data.status)) {
    throw new Error(`Invalid dataset status: ${data.status}`);
  }
  const result = await db.prepare(`
    INSERT INTO research_datasets (slug, title, description, columns_json, rows_json, status, published, source_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.slug,
    data.title,
    data.description || null,
    typeof data.columns_json === "string" ? data.columns_json : JSON.stringify(data.columns_json || []),
    typeof data.rows_json === "string" ? data.rows_json : JSON.stringify(data.rows_json || []),
    data.status || "draft",
    data.published ? 1 : 0,
    data.source_id ? Number(data.source_id) : null
  ).run();
  return result;
}

export async function updateDataset(db, id, data) {
  if (data.status && !isValidDatasetStatus(data.status)) {
    throw new Error(`Invalid dataset status: ${data.status}`);
  }
  const result = await db.prepare(`
    UPDATE research_datasets SET
      slug=?, title=?, description=?, columns_json=?, rows_json=?,
      status=?, published=?, source_id=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(
    data.slug,
    data.title,
    data.description || null,
    typeof data.columns_json === "string" ? data.columns_json : JSON.stringify(data.columns_json || []),
    typeof data.rows_json === "string" ? data.rows_json : JSON.stringify(data.rows_json || []),
    data.status || "draft",
    data.published ? 1 : 0,
    data.source_id ? Number(data.source_id) : null,
    id
  ).run();
  return result;
}

export async function deleteDataset(db, id) {
  return await db.prepare(`DELETE FROM research_datasets WHERE id = ?`).bind(id).run();
}

/** Snapshots the dataset's current columns/rows as a new version — only if published, and only if changed since the last snapshot (identical rules to research-versions.js's createVersionIfChanged). */
export async function createDatasetVersionIfChanged(db, dataset, { changedBy = null, changeSummary = null } = {}) {
  if (!dataset.published) return null;

  const latest = await db.prepare(`
    SELECT version_number, columns_snapshot, rows_snapshot FROM research_dataset_versions
    WHERE dataset_id = ? ORDER BY version_number DESC LIMIT 1
  `).bind(dataset.id).first();

  if (latest && latest.columns_snapshot === dataset.columns_json && latest.rows_snapshot === dataset.rows_json) {
    return null;
  }

  const nextVersion = (latest?.version_number || 0) + 1;
  const result = await db.prepare(`
    INSERT INTO research_dataset_versions (dataset_id, version_number, columns_snapshot, rows_snapshot, changed_by, change_summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(dataset.id, nextVersion, dataset.columns_json, dataset.rows_json, changedBy, changeSummary).run();

  return { id: result.meta?.last_row_id, version_number: nextVersion };
}

export async function getDatasetVersions(db, datasetId) {
  const result = await db.prepare(`
    SELECT id, version_number, changed_by, change_summary, created_at
    FROM research_dataset_versions WHERE dataset_id = ? ORDER BY version_number DESC
  `).bind(datasetId).all();
  return result.results || [];
}

/** A specific historical version's data, or the dataset's current live data if version is 'latest'/omitted — this is what dataset_table content blocks resolve against. */
export async function resolveDatasetData(db, datasetId, version = "latest") {
  if (!version || version === "latest") {
    const dataset = await getDataset(db, datasetId);
    if (!dataset) return null;
    return {
      title: dataset.title,
      columns: JSON.parse(dataset.columns_json || "[]"),
      rows: JSON.parse(dataset.rows_json || "[]"),
      versionLabel: "current"
    };
  }

  const row = await db.prepare(`
    SELECT rv.*, d.title FROM research_dataset_versions rv
    JOIN research_datasets d ON d.id = rv.dataset_id
    WHERE rv.dataset_id = ? AND rv.version_number = ? LIMIT 1
  `).bind(datasetId, Number(version)).first();
  if (!row) return null;
  return {
    title: row.title,
    columns: JSON.parse(row.columns_snapshot || "[]"),
    rows: JSON.parse(row.rows_snapshot || "[]"),
    versionLabel: `v${row.version_number}`
  };
}

export { DATASET_STATUSES };
