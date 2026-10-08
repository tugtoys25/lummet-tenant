export async function createMedia(db, data) {
  const result = await db.prepare(`
    INSERT INTO media_library (filename, url, thumbnail_url, alt_text, width, height, mime_type, size, folder, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.filename,
    data.url,
    data.thumbnail_url || null,
    data.alt_text || null,
    data.width || null,
    data.height || null,
    data.mime_type || null,
    data.size || null,
    data.folder || "general",
    data.uploaded_by || null
  ).run();
  return result.meta?.last_row_id || result.last_row_id;
}

export async function getMedia(db, id) {
  return await db.prepare(`SELECT * FROM media_library WHERE id = ?`).bind(id).first();
}

export async function getAllMedia(db, folder = null) {
  if (folder) {
    const result = await db.prepare(`SELECT * FROM media_library WHERE folder = ? ORDER BY created_at DESC`).bind(folder).all();
    return result.results || [];
  }
  const result = await db.prepare(`SELECT * FROM media_library ORDER BY created_at DESC`).all();
  return result.results || [];
}

export async function updateMedia(db, id, data) {
  return await db.prepare(`
    UPDATE media_library SET
      alt_text = ?, folder = ?
    WHERE id = ?
  `).bind(data.alt_text || null, data.folder || "general", id).run();
}

export async function deleteMedia(db, id) {
  return await db.prepare(`DELETE FROM media_library WHERE id = ?`).bind(id).run();
}

export async function getMediaFolders(db) {
  const result = await db.prepare(`SELECT DISTINCT folder FROM media_library ORDER BY folder`).all();
  return (result.results || []).map(r => r.folder);
}



// ── Create a media item (with R2 metadata) ──────────

/**
 * Creates a new media item with full R2 metadata.
 * Used by the upload handler to store uploaded file metadata.
 * @param {Object} env - Worker environment.
 * @param {Object} data - Media item data object.
 * @returns {Promise<Object>} The created media item with ID.
 */
export async function createMediaItem(env, data) {
    const result = await env.DB.prepare(
        `INSERT INTO media_library (
            filename, url, thumbnail_url, alt_text, width, height,
            mime_type, size, folder, uploaded_by,
            r2_key, original_filename, type, caption, file_ext
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        data.filename || '',
        data.url || '',
        data.thumbnail_url || null,
        data.alt_text || '',
        data.width || null,
        data.height || null,
        data.mime_type || '',
        data.size || 0,
        data.folder || 'general',
        data.uploaded_by || null,
        data.r2_key || null,
        data.original_filename || null,
        data.type || 'image',
        data.caption || null,
        data.file_ext || null
    ).run();

    return {
        id: result.meta?.last_row_id || result.last_row_id,
        created_at: new Date().toISOString(),
    };
}

// ── Get media by ID ──────────────────────────────────

/**
 * Gets a single media item by its ID.
 * @param {Object} env - Worker environment.
 * @param {number} id - The media item ID.
 * @returns {Promise<Object|null>} The media item or null.
 */
export async function getMediaById(env, id) {
    const result = await env.DB.prepare(
        'SELECT * FROM media_library WHERE id = ?'
    ).bind(id).first();
    return result || null;
}

// ── Search media ─────────────────────────────────────

/**
 * Searches media items by filename or alt text.
 * @param {Object} env - Worker environment.
 * @param {string} query - The search query.
 * @param {number} limit - Maximum results (default 50).
 * @param {number} offset - Offset for pagination (default 0).
 * @returns {Promise<Array>} Array of matching media items.
 */
export async function searchMedia(env, query, limit = 50, offset = 0) {
    const searchPattern = `%${query}%`;
    const result = await env.DB.prepare(
        `SELECT * FROM media_library
         WHERE filename LIKE ? OR alt_text LIKE ? OR original_filename LIKE ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
    ).bind(searchPattern, searchPattern, searchPattern, limit, offset).all();
    return result.results || [];
}

// ── List media with filters and pagination ──────────

/**
 * Lists media items with optional filters and pagination.
 * @param {Object} env - Worker environment.
 * @param {Object} options - Filter and pagination options.
 *   - type: Filter by media type (image, video, document)
 *   - folder: Filter by folder slug
 *   - uploaded_by: Filter by uploader user ID
 *   - limit: Maximum results (default 50)
 *   - offset: Offset for pagination (default 0)
 *   - sort: Sort field (created_at, filename, size) — default: created_at
 *   - order: Sort order (ASC, DESC) — default: DESC
 * @returns {Promise<{items: Array, total: number}>} Media items and total count.
 */
export async function listMedia(env, options = {}) {
    const {
        type = null,
        folder = null,
        uploaded_by = null,
        limit = 50,
        offset = 0,
        sort = 'created_at',
        order = 'DESC',
    } = options;

    // Validate sort field to prevent SQL injection
    const allowedSorts = new Set(['created_at', 'filename', 'size', 'type']);
    const sortField = allowedSorts.has(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Build WHERE clause
    const conditions = [];
    const params = [];

    if (type) {
        conditions.push('type = ?');
        params.push(type);
    }
    if (folder) {
        conditions.push('folder = ?');
        params.push(folder);
    }
    if (uploaded_by) {
        conditions.push('uploaded_by = ?');
        params.push(uploaded_by);
    }

    const whereClause = conditions.length > 0
        ? 'WHERE ' + conditions.join(' AND ')
        : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM media_library ${whereClause}`;
    const countResult = await env.DB.prepare(countQuery).bind(...params).first();
    const total = countResult?.total || 0;

    // Get items with pagination
    const listQuery = `SELECT * FROM media_library ${whereClause} ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`;
    const listResult = await env.DB.prepare(listQuery).bind(...params, limit, offset).all();

    return {
        items: listResult.results || [],
        total: total,
    };
}

// ── Update media metadata ───────────────────────────

/**
 * Updates media item metadata (alt text, caption, folder).
 * @param {Object} env - Worker environment.
 * @param {number} id - The media item ID.
 * @param {Object} data - Fields to update (alt_text, caption, folder).
 * @returns {Promise<boolean>} True if updated.
 */
export async function updateMediaItem(env, id, data) {
    const fields = [];
    const params = [];

    if (data.alt_text !== undefined) {
        fields.push('alt_text = ?');
        params.push(data.alt_text);
    }
    if (data.caption !== undefined) {
        fields.push('caption = ?');
        params.push(data.caption);
    }
    if (data.folder !== undefined) {
        fields.push('folder = ?');
        params.push(data.folder);
    }
    if (data.type !== undefined) {
        fields.push('type = ?');
        params.push(data.type);
    }

    if (fields.length === 0) {
        return false;
    }

    params.push(id);

    const result = await env.DB.prepare(
        `UPDATE media_library SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    return result.meta.changes > 0;
}

// ── Delete media ─────────────────────────────────────

/**
 * Deletes a media item from the database (D1 only).
 * The caller is responsible for deleting the R2 object.
 * @param {Object} env - Worker environment.
 * @param {number} id - The media item ID.
 * @returns {Promise<boolean>} True if deleted.
 */
export async function deleteMediaItem(env, id) {
    const result = await env.DB.prepare(
        'DELETE FROM media_library WHERE id = ?'
    ).bind(id).run();
    return result.meta.changes > 0;
}

// ── Count total media ───────────────────────────────

/**
 * Counts total media items, optionally filtered by type.
 * @param {Object} env - Worker environment.
 * @param {string|null} type - Optional type filter.
 * @returns {Promise<number>} Total count.
 */
export async function countMedia(env, type = null) {
    if (type) {
        const result = await env.DB.prepare(
            'SELECT COUNT(*) as count FROM media_library WHERE type = ?'
        ).bind(type).first();
        return result?.count || 0;
    }
    const result = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM media_library'
    ).first();
    return result?.count || 0;
}
