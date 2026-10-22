import { getResourceConfig } from "./registry.js";

// ── Item Fetch Helpers ─────────────────────────────

/**
 * Fetch an item by slug so canAccessItem can evaluate it.
 */
export async function getItemBySlug(db, resource, slug) {
  const config = getResourceConfig(resource);
  if (!config || !config.slugColumn) return null;

  const result = await db.prepare(
    `SELECT * FROM ${config.table} WHERE ${config.slugColumn} = ? LIMIT 1`
  ).bind(slug).first();

  return result || null;
}

/**
 * Fetch an item by ID so canAccessItem can evaluate it.
 */
export async function getItemById(db, resource, id) {
  const config = getResourceConfig(resource);
  if (!config) return null;

  const result = await db.prepare(
    `SELECT * FROM ${config.table} WHERE ${config.idColumn} = ? LIMIT 1`
  ).bind(id).first();

  return result || null;
}
