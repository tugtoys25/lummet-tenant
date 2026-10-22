import { ALLOWED_IMAGE_EXTS, API_UPLOAD, MAX_IMAGE_SIZE } from "/static/js/rich-editor/config.js";
import { getCsrfToken } from "/static/js/rich-editor/utils.js";

// ── Image upload handler ───────────────────────────

/**
 * Uploads an image file to R2 via the media upload API.
 * @param {File} file - The image file to upload.
 * @param {string} folder - The folder slug (default: 'general').
 * @returns {Promise<Object>} The upload response with URL and metadata.
 */
export async function uploadImage(file, folder) {
    var formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder || 'general');

    // Get image dimensions for the server
    var dimensions = await getImageDimensions(file);
    if (dimensions) {
        formData.append('width', dimensions.width);
        formData.append('height', dimensions.height);
    }

    var response = await fetch(API_UPLOAD, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'X-CSRF-Token': getCsrfToken()
        },
        body: formData
    });

    var result = await response.json();

    if (!result.success) {
        throw new Error(result.error || 'Upload failed');
    }

    return result.media;
}

/**
 * Gets the dimensions of an image file.
 * @param {File} file - The image file.
 * @returns {Promise<{width: number, height: number}|null>}
 */
function getImageDimensions(file) {
    return new Promise(function (resolve) {
        if (!file.type.startsWith('image/')) {
            resolve(null);
            return;
        }
        // SVG dimensions are not reliably available via Image object
        if (file.type === 'image/svg+xml') {
            resolve(null);
            return;
        }
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
            URL.revokeObjectURL(url);
        };
        img.onerror = function () {
            resolve(null);
            URL.revokeObjectURL(url);
        };
        img.src = url;
    });
}

/**
 * Validates an image file before upload.
 * @param {File} file - The file to validate.
 * @returns {{valid: boolean, error?: string}}
 */
export function validateImageFile(file) {
    if (!file) return { valid: false, error: 'No file selected' };

    // Check size
    if (file.size > MAX_IMAGE_SIZE) {
        return { valid: false, error: 'Image size exceeds 10MB limit' };
    }

    // Check extension
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ALLOWED_IMAGE_EXTS.indexOf(ext) === -1) {
        return { valid: false, error: 'File type .' + ext + ' is not allowed. Use: ' + ALLOWED_IMAGE_EXTS.join(', ') };
    }

    return { valid: true };
}
