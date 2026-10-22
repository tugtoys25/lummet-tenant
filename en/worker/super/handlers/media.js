import * as mediaDB from "../../database/media_library.js";
import {
  validateFile,
  generateR2Key,
  generatePublicUrl,
  generateThumbnailUrls,
  handleDelete as mediaUploadHandleDelete
} from "../../media-upload.js";
import { createMediaItem } from "../../database/media_library.js";
import { getSiteContext } from "../../site-context.js";
import { created, fail, ok, readJsonBody } from "./helpers.js";

// =====================================================
// MEDIA (safe subset — metadata only, no upload/binary
// handling through the Super API in Phase 1)
// =====================================================

export async function handleListMedia(request, env) {
  const url = new URL(request.url);
  const folder = url.searchParams.get("folder") || null;
  const rows = await mediaDB.getAllMedia(env.DB, folder);
  return ok({ data: rows });
}

export async function handleListMediaFolders(request, env) {
  const folders = await mediaDB.getMediaFolders(env.DB);
  return ok({ data: folders });
}

// Adds an externally-hosted image to the library by URL, without
// uploading bytes through this worker — mirrors the tenant's own
// "Add Image from External URL" form (static/js/media-admin.js ->
// /api/v1/media/create), using the same plain-metadata createMedia,
// not the R2-aware createMediaItem the real upload path uses.
// Body: { url, filename, thumbnail_url?, folder?, alt_text? }
export async function handleCreateMediaFromUrl(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.url || !body.filename) {
    return fail("url_and_filename_required", 422);
  }
  const id = await mediaDB.createMedia(env.DB, body);
  return created({ data: { id } });
}

export async function handleGetMedia(request, env, id) {
  const row = await mediaDB.getMedia(env.DB, id);
  if (!row) return fail("not_found", 404);
  return ok({ data: row });
}

export async function handleUpdateMedia(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  await mediaDB.updateMediaItem(env, id, body);
  return ok();
}

export async function handleDeleteMedia(request, env, id) {
  // Reuses the tenant's own full delete path (R2 object + D1 row),
  // not just the D1-only deleteMediaItem — avoids orphaning R2
  // objects when a media item is deleted through Lummet. Lummet is
  // a trusted platform-level caller, so it gets the "admin" role
  // here rather than the editor-only-own-uploads restriction that
  // applies to normal tenant users.
  const syntheticAdminUser = { role: "admin", user_id: null };
  return mediaUploadHandleDelete(request, env, syntheticAdminUser, id);
}

/**
 * Uploads a new media item. Takes the file as base64 in a JSON body
 * rather than multipart/form-data, deliberately — the Super API's
 * signature verification (super/auth.js) reads the request body
 * once as text to compute the HMAC body hash before handing off to
 * a handler; a raw multipart body can't be re-read as FormData
 * after that without corrupting binary bytes or double-consuming
 * the stream. Base64-in-JSON keeps everything as plain text through
 * the whole signing pipeline. Reuses the tenant's own validation,
 * R2 key generation, and thumbnail URL logic — the only new code
 * here is the base64 decode and D1 row creation via createMediaItem
 * (already used by the tenant's own upload path).
 *
 * Body: { filename, mime_type, folder?, alt_text?, caption?, data_base64 }
 */
export async function handleUploadMedia(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);

  if (!env.MEDIA_BUCKET) {
    return fail("r2_not_configured", 500);
  }

  const filename = String(body.filename || "").trim();
  const mimeType = String(body.mime_type || "").trim();
  const base64 = body.data_base64;

  if (!filename || !mimeType || !base64) {
    return fail("filename_mime_type_and_data_base64_required", 422);
  }

  let bytes;
  try {
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch (error) {
    return fail("invalid_base64_data", 422);
  }

  const validation = validateFile(filename, mimeType, bytes.byteLength);
  if (!validation.valid) {
    return fail(validation.error || "invalid_file", 422);
  }

  const folderSlug = String(body.folder || "general");
  const r2Key = generateR2Key(folderSlug, validation.ext);

  await env.MEDIA_BUCKET.put(r2Key, bytes.buffer, {
    httpMetadata: { contentType: mimeType },
    customMetadata: {
      uploadedBy: "lummet",
      originalFilename: filename,
      uploadedAt: new Date().toISOString()
    }
  });

  const site = await getSiteContext(request, env);
  const publicUrl = generatePublicUrl(r2Key, site.hostname);

  let thumbnailUrl = null;
  if (validation.mediaType === "image") {
    thumbnailUrl = generateThumbnailUrls(publicUrl).thumbnail;
  }

  const mediaRecord = await createMediaItem(env, {
    filename: filename,
    url: publicUrl,
    thumbnail_url: thumbnailUrl,
    alt_text: body.alt_text || "",
    mime_type: mimeType,
    size: bytes.byteLength,
    folder: folderSlug,
    r2_key: r2Key,
    original_filename: filename,
    type: validation.mediaType,
    caption: body.caption || null,
    file_ext: validation.ext || null
  });

  return created({ data: { id: mediaRecord.id, url: publicUrl, thumbnail_url: thumbnailUrl } });
}
