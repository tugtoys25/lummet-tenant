// =====================================================
// media-upload.js — R2 Upload/Delete Handler
// =====================================================
//
// Handles file uploads to Cloudflare R2 with:
//   - MIME type validation
//   - Extension validation
//   - File size enforcement (configurable)
//   - Path traversal prevention
//   - Safe R2 key generation
//   - Thumbnail URL generation (via Cloudflare Image Resizing)
//   - Metadata storage in D1 (media_library table)
//   - R2 object deletion
//
// All functions require an authenticated session and
// permission checks are performed by the caller (api.js).
//
// =====================================================

// The code lives in media-upload/*.js (see docs/ARCHITECTURE_MEDIA_UPLOAD.md); this file keeps the public import path.
export { validateFile, generateR2Key, generatePublicUrl, generateThumbnailUrls } from "./media-upload/files.js";
export { handleUpload } from "./media-upload/upload.js";
export { handleDelete } from "./media-upload/delete.js";
export { parseByteRange, serveMedia } from "./media-upload/serve.js";
