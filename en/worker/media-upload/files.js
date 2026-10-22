// ── Configuration ────────────────────────────────────

// Maximum file sizes in bytes
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

    // 10 MB for images
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

  // 100 MB for videos
const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;

 // 5 MB for documents

// Allowed MIME types per media type
const ALLOWED_MIME_TYPES = {
    image: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/svg+xml',
    ],
    video: [
        'video/mp4',
        'video/webm',
        'video/ogg',
    ],
    document: [
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
};

// Allowed extensions per media type (lowercase, no dot)
const ALLOWED_EXTENSIONS = {
    image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'],
    video: ['mp4', 'webm', 'ogg', 'mov'],
    document: ['pdf', 'txt', 'doc', 'docx'],
};

// Cloudflare Image Resizing thumbnail presets
// Generates WebP thumbnails at multiple widths for responsive images
const THUMBNAIL_WIDTHS = [150, 400, 800];

// ── Utility functions ─────────────────────────────────

/**
 * Generates a cryptographically random hex string for unique file naming.
 * Uses Web Crypto API (available in Workers).
 * @param {number} length - Number of bytes to generate.
 * @returns {string} Hex string of length * 2 characters.
 */
function randomHex(length) {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalizes a filename by removing path components, special characters,
 * and converting to lowercase with a safe extension.
 * @param {string} filename - The original filename.
 * @returns {{name: string, ext: string}} Safe name and extension.
 */
function normalizeFilename(filename) {
    if (typeof filename !== 'string') return { name: 'file', ext: '' };

    // Remove any path components (prevent path traversal)
    const basename = filename.replace(/^.*[\/\\]/, '');

    // Remove special characters, keep alphanumeric, dash, underscore, dot
    const cleaned = basename
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');

    // Split name and extension
    const lastDot = cleaned.lastIndexOf('.');
    if (lastDot === -1) {
        return { name: cleaned || 'file', ext: '' };
    }
    return {
        name: cleaned.substring(0, lastDot) || 'file',
        ext: cleaned.substring(lastDot + 1).toLowerCase(),
    };
}

/**
 * Detects the media type from MIME type.
 * @param {string} mimeType - The MIME type string.
 * @returns {string} 'image', 'video', 'document', or 'unknown'.
 */
function detectMediaType(mimeType) {
    if (!mimeType) return 'unknown';
    const lower = mimeType.toLowerCase();
    if (lower.startsWith('image/')) return 'image';
    if (lower.startsWith('video/')) return 'video';
    if (lower.startsWith('application/pdf') ||
        lower.startsWith('text/') ||
        lower.startsWith('application/msword') ||
        lower.startsWith('application/vnd.openxmlformats')) return 'document';
    return 'unknown';
}

/**
 * Validates a file against allowed MIME types, extensions, and size limits.
 * @param {string} filename - The original filename.
 * @param {string} mimeType - The MIME type from the upload.
 * @param {number} size - File size in bytes.
 * @returns {{valid: boolean, error?: string, mediaType?: string, ext?: string}}
 */
export function validateFile(filename, mimeType, size) {
    const { name, ext } = normalizeFilename(filename);
    const mediaType = detectMediaType(mimeType);

    // Check if MIME type is known
    if (mediaType === 'unknown') {
        return { valid: false, error: `Unsupported file type: ${mimeType}` };
    }

    // Check MIME type against allow list
    const allowedMimes = ALLOWED_MIME_TYPES[mediaType] || [];
    if (!allowedMimes.includes(mimeType.toLowerCase())) {
        return { valid: false, error: `MIME type ${mimeType} is not allowed for ${mediaType} files` };
    }

    // Check extension against allow list
    const allowedExts = ALLOWED_EXTENSIONS[mediaType] || [];
    if (ext && !allowedExts.includes(ext)) {
        return { valid: false, error: `File extension .${ext} is not allowed for ${mediaType} files` };
    }

    // If no extension, try to infer from MIME type
    let finalExt = ext;
    if (!finalExt) {
        const mimeToExt = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'image/svg+xml': 'svg',
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'video/ogg': 'ogg',
            'application/pdf': 'pdf',
            'text/plain': 'txt',
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        };
        finalExt = mimeToExt[mimeType.toLowerCase()] || '';
    }

    // Check file size
    const maxSize = mediaType === 'image' ? MAX_IMAGE_SIZE :
                    mediaType === 'video' ? MAX_VIDEO_SIZE :
                    MAX_DOCUMENT_SIZE;
    if (size > maxSize) {
        const maxMB = Math.round(maxSize / (1024 * 1024));
        return { valid: false, error: `File size exceeds maximum of ${maxMB}MB for ${mediaType} files` };
    }

    return { valid: true, mediaType, ext: finalExt };
}

/**
 * Generates a safe R2 key for storing the file.
 * Format: media/{folder_slug}/{timestamp}-{random}.{ext}
 * @param {string} folderSlug - The folder slug (sanitized).
 * @param {string} ext - The file extension (without dot).
 * @returns {string} The R2 key.
 */
export function generateR2Key(folderSlug, ext) {
    const safeFolder = folderSlug
        ? folderSlug.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase()
        : 'general';
    const timestamp = Date.now();
    const random = randomHex(8);
    const safeExt = ext ? `.${ext}` : '';
    return `media/${safeFolder || 'general'}/${timestamp}-${random}${safeExt}`;
}

/**
 * Generates the public URL for an R2 object.
 * Uses the /media/ path prefix which is served by the Worker.
 * @param {string} r2Key - The R2 object key.
 * @param {string} requestHost - The request host (for building absolute URL).
 * @returns {string} The public URL.
 */
export function generatePublicUrl(r2Key, requestHost) {
    // The Worker serves R2 media at /media/{key}
    // This route will be added in api.js
    return `https://${requestHost}/${r2Key}`;
}

/**
 * Generates thumbnail URLs using Cloudflare Image Resizing.
 * Cloudflare Image Resizing is available via /cdn-cgi/image/ path.
 * @param {string} publicUrl - The original image public URL.
 * @returns {{thumbnail: string, responsive: string[]}} Thumbnail and responsive URLs.
 */
export function generateThumbnailUrls(publicUrl) {
    // Cloudflare Image Resizing URL format:
    // /cdn-cgi/image/width=400,format=webp/{original_path}
    const urlObj = new URL(publicUrl);
    const path = urlObj.pathname;

    const thumbnail = `${urlObj.origin}/cdn-cgi/image/width=400,format=webp${path}`;

    // Generate responsive srcset URLs
    const responsive = THUMBNAIL_WIDTHS.map(
        w => `${urlObj.origin}/cdn-cgi/image/width=${w},format=webp${path} ${w}w`
    );

    return { thumbnail, responsive };
}

/**
 * Extracts image dimensions from the upload metadata.
 * In a Worker environment, we cannot parse image binary data directly.
 * The client (TinyMCE/media library UI) should send width/height as form fields.
 * If not provided, we set them to null and they can be updated later.
 * @param {FormData} formData - The form data from the upload request.
 * @returns {{width: number|null, height: number|null}}
 */
export function extractDimensions(formData) {
    const width = formData.get('width');
    const height = formData.get('height');
    return {
        width: width ? parseInt(width, 10) || null : null,
        height: height ? parseInt(height, 10) || null : null,
    };
}
