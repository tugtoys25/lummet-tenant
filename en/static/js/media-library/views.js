import { ACCEPTED_TYPES, state } from "/static/js/media-library/config.js";
import { escapeHtml, formatDate, formatFileSize, getTypeIcon, showToast } from "/static/js/media-library/utils.js";
import { handleDeleteMedia, loadMedia } from "/static/js/media-library/actions.js";
import { copyToClipboard, showEditModal, showFolderMenu } from "/static/js/media-library/modals.js";
import { attachEventListeners } from "/static/js/media-library/events.js";

// ── Rendering: Main layout ──────────────────────────

export function renderMainLayout() {
    var c = state.container;
    c.innerHTML = '';

    // Toolbar
    var toolbar = document.createElement('div');
    toolbar.className = 'ml-toolbar';
    toolbar.innerHTML =
        '<div class="ml-toolbar-left">' +
            '<input type="text" class="ml-search-input" placeholder="Search media..." value="' + escapeHtml(state.searchQuery) + '">' +
            '<select class="ml-type-filter">' +
                '<option value="all"' + (state.typeFilter === 'all' ? ' selected' : '') + '>All types</option>' +
                '<option value="image"' + (state.typeFilter === 'image' ? ' selected' : '') + '>Images</option>' +
                '<option value="video"' + (state.typeFilter === 'video' ? ' selected' : '') + '>Videos</option>' +
                '<option value="document"' + (state.typeFilter === 'document' ? ' selected' : '') + '>Documents</option>' +
            '</select>' +
            '<select class="ml-sort-select">' +
                '<option value="created_at:DESC"' + (state.sortBy === 'created_at' && state.sortOrder === 'DESC' ? ' selected' : '') + '>Newest first</option>' +
                '<option value="created_at:ASC"' + (state.sortBy === 'created_at' && state.sortOrder === 'ASC' ? ' selected' : '') + '>Oldest first</option>' +
                '<option value="filename:ASC"' + (state.sortBy === 'filename' && state.sortOrder === 'ASC' ? ' selected' : '') + '>Name A-Z</option>' +
                '<option value="filename:DESC"' + (state.sortBy === 'filename' && state.sortOrder === 'DESC' ? ' selected' : '') + '>Name Z-A</option>' +
                '<option value="size:DESC"' + (state.sortBy === 'size' && state.sortOrder === 'DESC' ? ' selected' : '') + '>Largest first</option>' +
                '<option value="size:ASC"' + (state.sortBy === 'size' && state.sortOrder === 'ASC' ? ' selected' : '') + '>Smallest first</option>' +
            '</select>' +
        '</div>' +
        '<div class="ml-toolbar-right">' +
            '<button class="ml-btn ml-btn-primary ml-upload-btn">Upload</button>' +
            '<button class="ml-btn ml-btn-secondary ml-new-folder-btn">New Folder</button>' +
        '</div>';

    c.appendChild(toolbar);

    // Body: sidebar + grid
    var body = document.createElement('div');
    body.className = 'ml-body';

    var sidebar = document.createElement('div');
    sidebar.className = 'ml-sidebar';
    sidebar.id = 'ml-sidebar';

    var gridWrapper = document.createElement('div');
    gridWrapper.className = 'ml-grid-wrapper';

    var dropzone = document.createElement('div');
    dropzone.className = 'ml-dropzone';
    dropzone.id = 'ml-dropzone';
    dropzone.innerHTML =
        '<div class="ml-dropzone-inner">' +
            '<svg class="ml-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
            '<p>Drag &amp; drop files here, or click "Upload"</p>' +
            '<p class="ml-dropzone-hint">JPEG, PNG, WEBP, SVG, GIF, MP4, WebM, PDF — max 10MB (images) / 100MB (videos)</p>' +
        '</div>';

    var grid = document.createElement('div');
    grid.className = 'ml-grid';
    grid.id = 'ml-grid';

    var pagination = document.createElement('div');
    pagination.className = 'ml-pagination';
    pagination.id = 'ml-pagination';

    gridWrapper.appendChild(dropzone);
    gridWrapper.appendChild(grid);
    gridWrapper.appendChild(pagination);

    body.appendChild(sidebar);
    body.appendChild(gridWrapper);

    c.appendChild(body);

    // Hidden file input for upload
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = ACCEPTED_TYPES;
    fileInput.style.display = 'none';
    fileInput.id = 'ml-file-input';
    c.appendChild(fileInput);

    // Attach event listeners
    attachEventListeners();
}

// ── Rendering: Folder sidebar ───────────────────────

export function renderFolderSidebar() {
    var sidebar = document.getElementById('ml-sidebar');
    if (!sidebar) return;

    var html =
        '<div class="ml-sidebar-header">' +
            '<h3>Folders</h3>' +
        '</div>' +
        '<div class="ml-folder-list">' +
            '<div class="ml-folder-item' + (!state.currentFolder ? ' ml-folder-active' : '') + '" data-folder="">' +
                '<svg class="ml-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
                '<span>All Media</span>' +
            '</div>';

    for (var i = 0; i < state.folders.length; i++) {
        var f = state.folders[i];
        var isActive = state.currentFolder === f.slug;
        html +=
            '<div class="ml-folder-item' + (isActive ? ' ml-folder-active' : '') + '" data-folder="' + escapeHtml(f.slug) + '" data-folder-id="' + f.id + '">' +
                '<svg class="ml-folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
                '<span class="ml-folder-name">' + escapeHtml(f.name) + '</span>' +
                '<button class="ml-folder-menu-btn" data-folder-id="' + f.id + '" data-folder-name="' + escapeHtml(f.name) + '" data-folder-slug="' + escapeHtml(f.slug) + '">&hellip;</button>' +
            '</div>';
    }

    html += '</div>';

    sidebar.innerHTML = html;

    // Attach folder click listeners
    var folderItems = sidebar.querySelectorAll('.ml-folder-item');
    for (var j = 0; j < folderItems.length; j++) {
        folderItems[j].addEventListener('click', function (e) {
            if (e.target.classList.contains('ml-folder-menu-btn')) return;
            state.currentFolder = this.getAttribute('data-folder') || null;
            state.currentPage = 1;
            renderFolderSidebar();
            loadMedia();
        });
    }

    // Attach folder menu (rename/delete) listeners
    var menuBtns = sidebar.querySelectorAll('.ml-folder-menu-btn');
    for (var k = 0; k < menuBtns.length; k++) {
        menuBtns[k].addEventListener('click', function (e) {
            e.stopPropagation();
            var folderId = parseInt(this.getAttribute('data-folder-id'), 10);
            var folderName = this.getAttribute('data-folder-name');
            var folderSlug = this.getAttribute('data-folder-slug');
            showFolderMenu(folderId, folderName, folderSlug);
        });
    }
}

// ── Rendering: Media grid ───────────────────────────



function buildMediaPreview(item) {
var src = item.thumbnail_url || item.url || '';
var fallback = item.url || '';

if (!src) {
    return '<div class="ml-card-thumb-placeholder">' +
        getTypeIcon(item.type, item.mime_type) +
        '</div>';
}

return '<img' +
    ' src="' + escapeHtml(src) + '"' +
    ' data-fallback-src="' + escapeHtml(fallback) + '"' +
    ' alt="' + escapeHtml(item.alt_text || item.filename || '') + '"' +
    ' loading="lazy"' +
    ' onerror="if(this.dataset.fallbackSrc && this.src !== this.dataset.fallbackSrc){this.src=this.dataset.fallbackSrc}else{this.style.display=\'none\';var e=this.nextElementSibling;if(e)e.style.display=\'flex\';}"' +
    ' />' +
    '<div class="ml-image-preview-error" style="display:none">' +
    'Unable to preview image' +
    '</div>';
}

export function renderGrid() {
    var grid = document.getElementById('ml-grid');
    if (!grid) return;

    if (state.loading) {
        grid.innerHTML =
            '<div class="ml-grid-loading">' +
                '<div class="ml-loading-spinner"></div>' +
                '<p>Loading media...</p>' +
            '</div>';
        return;
    }

    if (state.mediaItems.length === 0) {
        grid.innerHTML =
            '<div class="ml-grid-empty">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="ml-empty-icon"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>' +
                '<p>No media found. Upload files to get started.</p>' +
            '</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < state.mediaItems.length; i++) {
        var item = state.mediaItems[i];
        var isImage = item.type === 'image';
        var thumb = item.thumbnail_url || item.url || '';
        var name = item.filename || item.original_filename || 'unnamed';
        var altText = item.alt_text || '';

        html +=
            '<div class="ml-card" data-media-id="' + item.id + '">' +
                '<div class="ml-card-thumb">';

//            if (isImage && thumb) {
//                html += '<img src="' + escapeHtml(thumb) + '" alt="' + escapeHtml(altText) + '" loading="lazy" />';
//            } else {
//                html += '<div class="ml-card-thumb-placeholder">' + getTypeIcon(item.type, item.mime_type) + '</div>';
//            }
        if (isImage) {
html += buildMediaPreview(item);
} else {
html += '<div class="ml-card-thumb-placeholder">' +
    getTypeIcon(item.type, item.mime_type) +
    '</div>';
}

        html +=
                '</div>' +
                '<div class="ml-card-info">' +
                    '<p class="ml-card-name" title="' + escapeHtml(name) + '">' + escapeHtml(name) + '</p>' +
                    '<p class="ml-card-meta">' + formatFileSize(item.size) + ' &middot; ' + formatDate(item.created_at) + '</p>' +
                '</div>' +
                '<div class="ml-card-actions">' +
                    '<button class="ml-card-btn ml-copy-url" data-url="' + escapeHtml(item.url || '') + '" title="Copy URL">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                    '</button>' +
                    '<button class="ml-card-btn ml-edit-meta" data-media-id="' + item.id + '" title="Edit metadata">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
                    '</button>' +
                    '<button class="ml-card-btn ml-delete-media" data-media-id="' + item.id + '" data-media-name="' + escapeHtml(name) + '" title="Delete">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    grid.innerHTML = html;

    // Attach card action listeners
    var copyBtns = grid.querySelectorAll('.ml-copy-url');
    for (var c = 0; c < copyBtns.length; c++) {
        copyBtns[c].addEventListener('click', function () {
            var url = this.getAttribute('data-url');
            copyToClipboard(url);
            showToast('URL copied to clipboard', 'success');
        });
    }

    var editBtns = grid.querySelectorAll('.ml-edit-meta');
    for (var e = 0; e < editBtns.length; e++) {
        editBtns[e].addEventListener('click', function () {
            var mediaId = parseInt(this.getAttribute('data-media-id'), 10);
            showEditModal(mediaId);
        });
    }

    var deleteBtns = grid.querySelectorAll('.ml-delete-media');
    for (var d = 0; d < deleteBtns.length; d++) {
        deleteBtns[d].addEventListener('click', function () {
            var mediaId = parseInt(this.getAttribute('data-media-id'), 10);
            var mediaName = this.getAttribute('data-media-name');
            handleDeleteMedia(mediaId, mediaName);
        });
    }
}

// ── Rendering: Pagination ───────────────────────────

export function renderPagination() {
    var pagination = document.getElementById('ml-pagination');
    if (!pagination) return;

    if (state.totalPages <= 1) {
        pagination.innerHTML = '<span class="ml-pagination-info">' + state.totalItems + ' item(s)</span>';
        return;
    }

    var html = '<span class="ml-pagination-info">Page ' + state.currentPage + ' of ' + state.totalPages + ' (' + state.totalItems + ' total)</span>';

    if (state.currentPage > 1) {
        html += '<button class="ml-btn ml-btn-small ml-page-btn" data-page="' + (state.currentPage - 1) + '">&laquo; Prev</button>';
    }

    // Show up to 5 page numbers around current page
    var start = Math.max(1, state.currentPage - 2);
    var end = Math.min(state.totalPages, state.currentPage + 2);

    if (start > 1) {
        html += '<button class="ml-btn ml-btn-small ml-page-btn" data-page="1">1</button>';
        if (start > 2) html += '<span class="ml-pagination-ellipsis">...</span>';
    }

    for (var p = start; p <= end; p++) {
        html += '<button class="ml-btn ml-btn-small ml-page-btn' + (p === state.currentPage ? ' ml-btn-active' : '') + '" data-page="' + p + '">' + p + '</button>';
    }

    if (end < state.totalPages) {
        if (end < state.totalPages - 1) html += '<span class="ml-pagination-ellipsis">...</span>';
        html += '<button class="ml-btn ml-btn-small ml-page-btn" data-page="' + state.totalPages + '">' + state.totalPages + '</button>';
    }

    if (state.currentPage < state.totalPages) {
        html += '<button class="ml-btn ml-btn-small ml-page-btn" data-page="' + (state.currentPage + 1) + '">Next &raquo;</button>';
    }

    pagination.innerHTML = html;

    var pageBtns = pagination.querySelectorAll('.ml-page-btn');
    for (var i = 0; i < pageBtns.length; i++) {
        pageBtns[i].addEventListener('click', function () {
            state.currentPage = parseInt(this.getAttribute('data-page'), 10);
            loadMedia();
        });
    }
}
