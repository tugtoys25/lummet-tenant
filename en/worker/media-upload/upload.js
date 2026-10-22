import { createMediaItem } from '../database/media_library.js';
import { getSiteContext } from '../site-context.js';
import { jsonError, jsonResponse } from "./http.js";
import { extractDimensions, generatePublicUrl, generateR2Key, generateThumbnailUrls, validateFile } from "./files.js";

// ── Upload handler ───────────────────────────────────

/**
 * Handles a file upload to R2.
 *
 * Expects a multipart/form-data request with:
 *   - file: The file to upload (required)
 *   - folder: The folder slug (optional, defaults to 'general')
 *   - alt_text: Alt text for images (optional)
 *   - caption: Caption for the media (optional)
 *   - width: Image width in pixels (optional, for images)
 *   - height: Image height in pixels (optional, for images)
 *
 * @param {Request} request - The incoming request.
 * @param {Object} env - The Worker environment (D1, R2, etc.).
 * @param {Object} session - The authenticated session object.
 * @returns {Response} JSON response with upload result or error.
 */
//async function handleUpload(request, env, session) {
export async function handleUpload(request, env, user) {

    try {
        // Check R2 binding exists
        if (!env.MEDIA_BUCKET) {
            return jsonError(500, 'R2 media bucket is not configured');
        }

        // Parse multipart form data
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file || !(file instanceof File)) {
            return jsonError(400, 'No file provided');
        }

        // Extract metadata
        const folderSlug = (formData.get('folder') || 'general').toString();
        const altText = (formData.get('alt_text') || '').toString();
        const caption = (formData.get('caption') || '').toString();
        const originalFilename = file.name || 'upload';
        const mimeType = file.type || 'application/octet-stream';
        const size = file.size;

        // Validate the file
        const validation = validateFile(originalFilename, mimeType, size);
        if (!validation.valid) {
            return jsonError(400, validation.error);
        }

        const { mediaType, ext } = validation;

        // Generate safe R2 key
        const r2Key = generateR2Key(folderSlug, ext);

        // Read file as ArrayBuffer
        const fileBuffer = await file.arrayBuffer();

        // Upload to R2
        await env.MEDIA_BUCKET.put(r2Key, fileBuffer, {
            httpMetadata: {
                contentType: mimeType,
            },
            customMetadata: {
                uploadedBy: String(user.user_id),
                originalFilename: originalFilename,
                uploadedAt: new Date().toISOString(),
            },
        });

        // Generate public URL
        const site = await getSiteContext(request, env);
        const publicUrl = generatePublicUrl(r2Key, site.hostname);

        // Generate thumbnail URLs for images
        let thumbnailUrl = null;
        let responsiveSrcset = null;
        if (mediaType === 'image') {
            const thumbs = generateThumbnailUrls(publicUrl);
            thumbnailUrl = thumbs.thumbnail;
            responsiveSrcset = thumbs.responsive.join(', ');
        }

        // Extract dimensions (from client or null)
        const { width, height } = extractDimensions(formData);

        // Store metadata in D1
        const mediaItem = await createMediaItem(env, {
            filename: originalFilename,
            url: publicUrl,
            thumbnail_url: thumbnailUrl,
            alt_text: altText,
            width: width,
            height: height,
            mime_type: mimeType,
            size: size,
            folder: folderSlug,
            uploaded_by: user.user_id,
            r2_key: r2Key,
            original_filename: originalFilename,
            type: mediaType,
            caption: caption,
            file_ext: ext,
          });
          if (!mediaItem) {
              throw new Error("createMediaItem returned undefined");
          }



        // Return success response
        return jsonResponse(201, {
            success: true,
            media: {
                id: mediaItem.id,
                url: publicUrl,
                thumbnail_url: thumbnailUrl,
                responsive_srcset: responsiveSrcset,
                alt_text: altText,
                caption: caption,
                type: mediaType,
                mime_type: mimeType,
                size: size,
                width: width,
                height: height,
                folder: folderSlug,
                r2_key: r2Key,
                filename: originalFilename,
                created_at: mediaItem.created_at,
            },
        });

    } catch (error) {
        console.error('Upload error:', error);
        return jsonError(500, 'Upload failed: ' + (error.message || 'Unknown error'));
    }
}
