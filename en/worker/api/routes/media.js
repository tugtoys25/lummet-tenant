// Media library, folders and uploads.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as mediaDB from "../../database/media_library.js";
import { getMediaById, searchMedia, listMedia, updateMediaItem } from "../../database/media_library.js";
import { handleUpload, handleDelete } from "../../media-upload.js";
import { createFolder, getFolderById, getFolderBySlug, updateFolder, deleteFolder, buildFolderTree, countMediaInFolder } from "../../database/media_folders.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {
    // ==================================
    // MEDIA LIBRARY CRUD
    // ==================================

    if (path === "/api/v1/media/list") {
      const url = new URL(request.url);
      const folder = url.searchParams.get("folder");
      const result = await mediaDB.getAllMedia(env.DB, folder);
      return json({ media: result });
    }

    if (path === "/api/v1/media/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["filename", "url"]);
      const id = await mediaDB.createMedia(env.DB, {
        ...body,
        uploaded_by: user?.id || null
      });
      return json({ success: true, id });
    }

    if (path === "/api/v1/media/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await mediaDB.updateMedia(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/media/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await mediaDB.deleteMedia(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/media/folders") {
      const result = await mediaDB.getMediaFolders(env.DB);
      return json({ folders: result });
    }

    // ==================================
    // MEDIA LIBRARY — R2 UPLOAD & ENHANCED API (Phase 3)
    // All routes below use the same flat-if pattern, json/success/failure
    // helpers, and validate() as the rest of api.js.
    // Permission checks are handled by the existing resourceMap
    // ("/api/v1/media" → "media" resource) and action detection
    // (path ending in /create, /update, /delete).
    // ==================================

    // R2 file upload (multipart/form-data)
    // Permission: POST → "/api/v1/media" → "media" → "create"
    if (path === "/api/v1/media/upload" && request.method === "POST") {
      return await handleUpload(request, env, user);
    }

    // R2 file delete (removes from R2 bucket + D1 record)
    // Permission: POST → path ends with "/delete" → "media" → "delete"
    if (path === "/api/v1/media/r2/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      return await handleDelete(request, env, user, body.id);
    }

    // Enhanced media list with pagination, type filter, sort
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/browse") {
      const url = new URL(request.url);
      const result = await listMedia(env, {
        type: url.searchParams.get("type") || null,
        folder: url.searchParams.get("folder") || null,
        uploaded_by: url.searchParams.get("uploaded_by") || null,
        limit: parseInt(url.searchParams.get("limit") || "50", 10),
        offset: parseInt(url.searchParams.get("offset") || "0", 10),
        sort: url.searchParams.get("sort") || "created_at",
        order: url.searchParams.get("order") || "DESC",
      });
      return json({ success: true, ...result });
    }

    // Media search by filename or alt text
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/search") {
      const url = new URL(request.url);
      const query = url.searchParams.get("q") || "";
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);
      if (!query.trim()) return json({ success: true, results: [] });
      const results = await searchMedia(env, query.trim(), limit, offset);
      return json({ success: true, results });
    }

    // Get single media item by ID
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/get") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"), 10);
      if (!id) return failure("id is required");
      const media = await getMediaById(env, id);
      if (!media) return failure("Media not found", 404);
      return json({ success: true, media });
    }

    // Update media metadata (alt_text, caption, folder, type)
    // Permission: POST → path ends with "/update" → "media" → "update"
    if (path === "/api/v1/media/meta/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const updated = await updateMediaItem(env, body.id, {
        alt_text: body.alt_text,
        caption: body.caption,
        folder: body.folder,
        type: body.type,
      });
      if (!updated) return failure("Media not found or no changes", 404);
      return success();
    }

    // Enhanced folder tree for media library UI
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/folders/tree") {
      const tree = await buildFolderTree(env);
      return json({ success: true, folders: tree });
    }

    // Folder create
    // Permission: POST → path ends with "/create" → "media" → "create"
    if (path === "/api/v1/media/folder/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "slug"]);
      const slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!slug) return failure("Invalid slug");
      const existing = await getFolderBySlug(env, slug);
      if (existing) return failure("A folder with this slug already exists", 409);
      const folder = await createFolder(env, body.name, slug, body.parent_id || null);
      return json({ success: true, folder });
    }

    // Folder rename
    // Permission: POST → path ends with "/update" → "media" → "update"
    if (path === "/api/v1/media/folder/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "name"]);
      const slug = (body.slug || body.name).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const existing = await getFolderBySlug(env, slug);
      if (existing && existing.id !== body.id) return failure("A folder with this slug already exists", 409);
      const updated = await updateFolder(env, body.id, body.name, slug);
      if (!updated) return failure("Folder not found", 404);
      return success();
    }

    // Folder delete
    // Permission: POST → path ends with "/delete" → "media" → "delete"
    if (path === "/api/v1/media/folder/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const folder = await getFolderById(env, body.id);
      if (!folder) return failure("Folder not found", 404);
      if (['general', 'logos', 'banners', 'reviews', 'news', 'pages', 'videos'].includes(folder.slug)) {
        return failure("Cannot delete default folders");
      }
      const deleted = await deleteFolder(env, body.id);
      if (!deleted) return failure("Folder not found", 404);
      return success();
    }

    // Count media in folder
    // Permission: GET → no write-method check needed
    if (path === "/api/v1/media/folder/count") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"), 10);
      if (!id) return failure("id is required");
      const folder = await getFolderById(env, id);
      if (!folder) return failure("Folder not found", 404);
      const count = await countMediaInFolder(env, folder.slug);
      return json({ success: true, count });
    }

  return NOT_HANDLED;
}
