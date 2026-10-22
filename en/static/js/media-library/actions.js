import { API, ITEMS_PER_PAGE, state } from "/static/js/media-library/config.js";
import { showToast } from "/static/js/media-library/utils.js";
import { renderFolderSidebar, renderGrid, renderPagination } from "/static/js/media-library/views.js";

// ── API helpers ──────────────────────────────────────

export function apiGet(url) {
    return fetch(url, { credentials: 'same-origin' })
        .then(function (r) { return r.json(); });
}

function apiPost(url, body, isJson) {
    var opts = {
        method: 'POST',
        credentials: 'same-origin',
    };
    if (isJson) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
    } else {
        opts.body = body; // FormData
    }
    return fetch(url, opts).then(function (r) { return r.json(); });
}

// ── Load folders ────────────────────────────────────

export function loadFolders() {
    return apiGet(API.foldersTree).then(function (data) {
        if (data.success) {
            state.folders = data.folders || [];
        }
    }).catch(function () {
        state.folders = [];
    });
}

// ── Load media ──────────────────────────────────────

export function loadMedia() {
    state.loading = true;
    renderGrid();

    var params = new URLSearchParams();
    params.set('limit', String(ITEMS_PER_PAGE));
    params.set('offset', String((state.currentPage - 1) * ITEMS_PER_PAGE));
    params.set('sort', state.sortBy);
    params.set('order', state.sortOrder);

    if (state.typeFilter !== 'all') {
        params.set('type', state.typeFilter);
    }
    if (state.currentFolder) {
        params.set('folder', state.currentFolder);
    }

    var url;
    if (state.searchQuery) {
        params.set('q', state.searchQuery);
        url = API.search + '?' + params.toString();
    } else {
        url = API.browse + '?' + params.toString();
    }

    return apiGet(url).then(function (data) {
        state.loading = false;
        if (data.success) {
            state.mediaItems = data.items || data.results || [];
            state.totalItems = data.total || state.mediaItems.length;
            state.totalPages = Math.ceil(state.totalItems / ITEMS_PER_PAGE) || 1;
        } else {
            state.mediaItems = [];
            state.totalItems = 0;
            state.totalPages = 1;
            showToast(data.error || 'Failed to load media', 'error');
        }
        renderGrid();
        renderPagination();
    }).catch(function (err) {
        state.loading = false;
        state.mediaItems = [];
        renderGrid();
        showToast('Network error loading media', 'error');
    });
}

// ── Upload ──────────────────────────────────────────

export function handleUploadFiles(files, folderSlug) {
    if (!files || files.length === 0) return;

    var folder = folderSlug || state.currentFolder || 'general';
    var uploaded = 0;
    var failed = 0;
    var total = files.length;

    for (var i = 0; i < files.length; i++) {
        (function (file) {
            var formData = new FormData();
            formData.append('file', file);
            formData.append('folder', folder);

            apiPost(API.upload, formData).then(function (data) {
                if (data.success) {
                    uploaded++;
                    showToast('Uploaded: ' + (data.media && data.media.filename || 'file'), 'success');
                } else {
                    failed++;
                    showToast(data.error || 'Upload failed', 'error');
                }
                if (uploaded + failed === total) {
                    if (failed > 0) {
                        showToast(uploaded + ' uploaded, ' + failed + ' failed', 'info');
                    }
                    loadMedia();
                }
            }).catch(function () {
                failed++;
                showToast('Upload failed: ' + file.name, 'error');
                if (uploaded + failed === total) {
                    loadMedia();
                }
            });
        })(files[i]);
    }

    showToast('Uploading ' + total + ' file(s)...', 'info');
}

// ── Delete ──────────────────────────────────────────

export function handleDeleteMedia(mediaId, filename) {
    if (!confirm('Delete "' + (filename || 'this file') + '"? This cannot be undone.')) return;

    apiPost(API.delete, { id: mediaId }, true).then(function (data) {
        if (data.success) {
            showToast('Media deleted', 'success');
            loadMedia();
        } else {
            showToast(data.error || 'Delete failed', 'error');
        }
    }).catch(function () {
        showToast('Network error during delete', 'error');
    });
}

// ── Update metadata ─────────────────────────────────

export function handleUpdateMetadata(mediaId, updates) {
    updates.id = mediaId;
    return apiPost(API.metaUpdate, updates, true).then(function (data) {
        if (data.success) {
            showToast('Metadata updated', 'success');
        } else {
            showToast(data.error || 'Update failed', 'error');
        }
        return data;
    }).catch(function () {
        showToast('Network error during update', 'error');
    });
}

// ── Folder CRUD ─────────────────────────────────────

export function handleCreateFolder(name, slug, parentId) {
    return apiPost(API.folderCreate, {
        name: name,
        slug: slug,
        parent_id: parentId || null,
    }, true).then(function (data) {
        if (data.success) {
            showToast('Folder created', 'success');
            loadFolders().then(renderFolderSidebar);
        } else {
            showToast(data.error || 'Failed to create folder', 'error');
        }
        return data;
    });
}

export function handleRenameFolder(folderId, name, slug) {
    return apiPost(API.folderUpdate, {
        id: folderId,
        name: name,
        slug: slug,
    }, true).then(function (data) {
        if (data.success) {
            showToast('Folder renamed', 'success');
            loadFolders().then(renderFolderSidebar);
        } else {
            showToast(data.error || 'Failed to rename folder', 'error');
        }
        return data;
    });
}

export function handleDeleteFolder(folderId) {
    if (!confirm('Delete this folder? Media items inside will remain but lose their folder assignment.')) return;

    apiPost(API.folderDelete, { id: folderId }, true).then(function (data) {
        if (data.success) {
            showToast('Folder deleted', 'success');
            if (state.currentFolder) {
                state.currentFolder = null;
            }
            loadFolders().then(function () {
                renderFolderSidebar();
                loadMedia();
            });
        } else {
            showToast(data.error || 'Failed to delete folder', 'error');
        }
    });
}
