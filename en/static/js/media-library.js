// =====================================================
// media-library.js — Full Media Library UI Component
// =====================================================
//
// Renders a complete media management interface inside
// a container element on the admin Media page.
//
// Corrected API routes (Phase 3):
//   POST /api/v1/media/upload          — upload file
//   POST /api/v1/media/r2/delete       — delete file {id}
//   GET  /api/v1/media/browse          — paginated list
//   GET  /api/v1/media/search          — search ?q=
//   GET  /api/v1/media/get?id=         — single item
//   POST /api/v1/media/meta/update     — update {id,...}
//   GET  /api/v1/media/folders/tree    — folder tree
//   POST /api/v1/media/folder/create  — create folder
//   POST /api/v1/media/folder/update  — rename folder
//   POST /api/v1/media/folder/delete  — delete folder
//   GET  /api/v1/media/folder/count?id= — count in folder
//
// Usage:
//   <div id="media-library-container"></div>
//   <script src="/static/js/media-library.js"></script>
//   <script>MediaLibrary.init('media-library-container');</script>
//
// =====================================================

import { loadFolders, loadMedia } from "/static/js/media-library/actions.js";
import { init } from "/static/js/media-library/events.js";

// ── Public API ───────────────────────────────────────

window.MediaLibrary = {
    init: init,
    loadMedia: loadMedia,
    loadFolders: loadFolders,
};
