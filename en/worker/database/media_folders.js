// =====================================================
// media_folders.js — Media Folders Database Access Layer
// =====================================================
//
// CRUD operations for the media_folders table.
// Supports nested folders via parent_id.
//
// =====================================================

// ── Create a folder ──────────────────────────────────

/**
 * Creates a new media folder.
 * @param {Object} env - Worker environment with D1 binding.
 * @param {string} name - The folder name.
 * @param {string} slug - The folder slug (unique).
 * @param {number|null} parentId - Parent folder ID (null for root).
 * @returns {Promise<Object>} The created folder row.
 */
export async function createFolder(env, name, slug, parentId = null) {
    const result = await env.DB.prepare(
        'INSERT INTO media_folders (name, slug, parent_id) VALUES (?, ?, ?)'
    ).bind(name, slug, parentId || null).run();

    return {
        id: result.meta.last_row_id,
        name,
        slug,
        parent_id: parentId || null,
        created_at: new Date().toISOString(),
    };
}

// ── Get a folder by ID ───────────────────────────────

/**
 * Gets a folder by its ID.
 * @param {Object} env - Worker environment.
 * @param {number} id - The folder ID.
 * @returns {Promise<Object|null>} The folder row or null.
 */
export async function getFolderById(env, id) {
    const result = await env.DB.prepare(
        'SELECT * FROM media_folders WHERE id = ?'
    ).bind(id).first();
    return result || null;
}

// ── Get a folder by slug ─────────────────────────────

/**
 * Gets a folder by its slug.
 * @param {Object} env - Worker environment.
 * @param {string} slug - The folder slug.
 * @returns {Promise<Object|null>} The folder row or null.
 */
export async function getFolderBySlug(env, slug) {
    const result = await env.DB.prepare(
        'SELECT * FROM media_folders WHERE slug = ?'
    ).bind(slug).first();
    return result || null;
}

// ── List all folders ─────────────────────────────────

/**
 * Lists all media folders, ordered by name.
 * @param {Object} env - Worker environment.
 * @returns {Promise<Array>} Array of folder rows.
 */
export async function listFolders(env) {
    const result = await env.DB.prepare(
        'SELECT * FROM media_folders ORDER BY name ASC'
    ).all();
    return result.results || [];
}

// ── List root folders (no parent) ───────────────────

/**
 * Lists root-level folders (parent_id is null).
 * @param {Object} env - Worker environment.
 * @returns {Promise<Array>} Array of root folder rows.
 */
export async function listRootFolders(env) {
    const result = await env.DB.prepare(
        'SELECT * FROM media_folders WHERE parent_id IS NULL ORDER BY name ASC'
    ).all();
    return result.results || [];
}

// ── List child folders ──────────────────────────────

/**
 * Lists child folders of a given parent.
 * @param {Object} env - Worker environment.
 * @param {number} parentId - The parent folder ID.
 * @returns {Promise<Array>} Array of child folder rows.
 */
export async function listChildFolders(env, parentId) {
    const result = await env.DB.prepare(
        'SELECT * FROM media_folders WHERE parent_id = ? ORDER BY name ASC'
    ).bind(parentId).all();
    return result.results || [];
}

// ── Update (rename) a folder ─────────────────────────

/**
 * Updates a folder's name and slug.
 * @param {Object} env - Worker environment.
 * @param {number} id - The folder ID.
 * @param {string} name - The new folder name.
 * @param {string} slug - The new folder slug.
 * @returns {Promise<boolean>} True if updated.
 */
export async function updateFolder(env, id, name, slug) {
    const result = await env.DB.prepare(
        'UPDATE media_folders SET name = ?, slug = ? WHERE id = ?'
    ).bind(name, slug, id).run();
    return result.meta.changes > 0;
}

// ── Delete a folder ──────────────────────────────────

/**
 * Deletes a folder by ID.
 * Child folders are set to the deleted folder's parent (ON DELETE SET NULL).
 * Media items in the folder are moved to 'general' folder.
 * @param {Object} env - Worker environment.
 * @param {number} id - The folder ID.
 * @returns {Promise<boolean>} True if deleted.
 */
export async function deleteFolder(env, id) {
    // Move media items in this folder to 'general'
    await env.DB.prepare(
        "UPDATE media_library SET folder = 'general' WHERE folder = (SELECT slug FROM media_folders WHERE id = ?)"
    ).bind(id).run();

    // Delete the folder (child folders get parent_id set to NULL via FK)
    const result = await env.DB.prepare(
        'DELETE FROM media_folders WHERE id = ?'
    ).bind(id).run();
    return result.meta.changes > 0;
}

// ── Build folder tree ────────────────────────────────

/**
 * Builds a hierarchical tree of folders for display.
 * @param {Object} env - Worker environment.
 * @returns {Promise<Array>} Array of folder objects with children arrays.
 */
export async function buildFolderTree(env) {
    const allFolders = await listFolders(env);
    const folderMap = new Map();
    const roots = [];

    // Create map of all folders
    for (const folder of allFolders) {
        folderMap.set(folder.id, { ...folder, children: [] });
    }

    // Build tree
    for (const folder of allFolders) {
        const node = folderMap.get(folder.id);
        if (folder.parent_id && folderMap.has(folder.parent_id)) {
            folderMap.get(folder.parent_id).children.push(node);
        } else {
            roots.push(node);
        }
    }

    return roots;
}

// ── Count media in folder ─────────────────────────────

/**
 * Counts media items in a folder.
 * @param {Object} env - Worker environment.
 * @param {string} folderSlug - The folder slug.
 * @returns {Promise<number>} Count of media items.
 */
export async function countMediaInFolder(env, folderSlug) {
    const result = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM media_library WHERE folder = ?'
    ).bind(folderSlug).first();
    return result?.count || 0;
}
