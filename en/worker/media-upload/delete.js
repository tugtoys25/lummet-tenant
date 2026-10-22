import { getMediaById, deleteMediaItem } from '../database/media_library.js';
import { jsonError, jsonResponse } from "./http.js";

// ── Delete handler ───────────────────────────────────

/**
 * Handles deletion of a media item.
 * Deletes the R2 object and the D1 metadata row.
 * Permission check: editors can delete their own media, admins can delete any.
 *
 * @param {Request} request - The incoming request.
 * @param {Object} env - The Worker environment.
 * @param {Object} session - The authenticated session object.
 * @param {number} mediaId - The media item ID to delete.
 * @returns {Response} JSON response.
 */
//async function handleDelete(request, env, session, mediaId) {
export async function handleDelete(request, env, user, mediaId) {
    try {
        // Check R2 binding exists
        if (!env.MEDIA_BUCKET) {
            return jsonError(500, 'R2 media bucket is not configured');
        }

        // Get the media item to find the R2 key
        const media = await getMediaById(env, mediaId);
        if (!media) {
            return jsonError(404, 'Media item not found');
        }

        // Permission check: editors can only delete their own uploads
        if (user.role === 'editor' && media.uploaded_by !== user.user_id) {
            return jsonError(403, 'You can only delete your own media uploads');
        }

        // Delete from R2 if r2_key exists
        if (media.r2_key) {
            try {
                await env.MEDIA_BUCKET.delete(media.r2_key);
            } catch (r2Error) {
                // Log but don't fail — D1 record should still be cleaned up
                console.error('R2 delete error (non-fatal):', r2Error);
            }
        }

        // Delete from D1
        await deleteMediaItem(env, mediaId);

        return jsonResponse(200, {
            success: true,
            message: 'Media deleted successfully',
            id: mediaId,
        });

    } catch (error) {
        console.error('Delete error:', error);
        return jsonError(500, 'Delete failed: ' + (error.message || 'Unknown error'));
    }
}
