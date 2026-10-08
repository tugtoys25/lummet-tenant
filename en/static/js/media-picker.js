// =====================================================
// media-picker.js — Modal Media Picker for TinyMCE
// =====================================================
//
// Exposes window.MediaPicker with two methods:
//   MediaPicker.openImagePicker(callback, folder)
//   MediaPicker.openVideoPicker(callback, folder)
//
// The callback receives a media object:
//   { id, url, thumbnail_url, alt_text, type, ... }
//
// Used by rich-editor.js (Phase 4) for TinyMCE image
// and video insertion dialogs.
//
// Corrected API routes (Phase 3):
//   POST /api/v1/media/upload          — upload
//   GET  /api/v1/media/browse          — list
//   GET  /api/v1/media/search          — search
//   GET  /api/v1/media/folders/tree    — folders
//
// =====================================================

(function () {
    'use strict';

    var API = {
        upload:     '/en/api/v1/media/upload',
        browse:     '/en/api/v1/media/browse',
        search:     '/en/api/v1/media/search',
        foldersTree:'/en/api/v1/media/folders/tree',
    };

    var ITEMS_PER_PAGE = 24;

    // ── Utility ─────────────────────────────────────────

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showToast(message, type) {
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
            return;
        }
        var el = document.createElement('div');
        el.textContent = message;
        el.className = 'ml-toast ml-toast-' + (type || 'info');
        document.body.appendChild(el);
        requestAnimationFrame(function () { el.classList.add('ml-toast-show'); });
        setTimeout(function () {
            el.classList.remove('ml-toast-show');
            setTimeout(function () { el.remove(); }, 300);
        }, 3000);
    }

    function apiGet(url) {
        return fetch(url, { credentials: 'same-origin' })
            .then(function (r) { return r.json(); });
    }

    function apiPost(url, body, isJson) {
        var opts = { method: 'POST', credentials: 'same-origin' };
        if (isJson) {
            opts.headers = { 'Content-Type': 'application/json' };
            opts.body = JSON.stringify(body);
        } else {
            opts.body = body;
        }
        return fetch(url, opts).then(function (r) { return r.json(); });
    }

    // ── Picker state ────────────────────────────────────

    var pickerState = {
        overlay: null,
        callback: null,
        mediaType: 'image',
        folder: null,
        items: [],
        folders: [],
        searchQuery: '',
        currentPage: 1,
        totalItems: 0,
        totalPages: 1,
        loading: false,
    };

    // ── Load media for picker ────────────────────────────

    function loadPickerMedia() {
        pickerState.loading = true;
        renderPickerGrid();

        var params = new URLSearchParams();
        params.set('limit', String(ITEMS_PER_PAGE));
        params.set('offset', String((pickerState.currentPage - 1) * ITEMS_PER_PAGE));
        params.set('type', pickerState.mediaType);

        if (pickerState.folder) {
            params.set('folder', pickerState.folder);
        }

        var url;
        if (pickerState.searchQuery) {
            params.set('q', pickerState.searchQuery);
            url = API.search + '?' + params.toString();
        } else {
            url = API.browse + '?' + params.toString();
        }

        apiGet(url).then(function (data) {
            pickerState.loading = false;
            if (data.success) {
                pickerState.items = data.items || data.results || [];
                pickerState.totalItems = data.total || pickerState.items.length;
                pickerState.totalPages = Math.ceil(pickerState.totalItems / ITEMS_PER_PAGE) || 1;
            } else {
                pickerState.items = [];
                pickerState.totalItems = 0;
                pickerState.totalPages = 1;
            }
            renderPickerGrid();
            renderPickerPagination();
        }).catch(function () {
            pickerState.loading = false;
            pickerState.items = [];
            renderPickerGrid();
        });
    }

    // ── Load folders for picker ─────────────────────────

    function loadPickerFolders() {
        return apiGet(API.foldersTree).then(function (data) {
            if (data.success) {
                pickerState.folders = data.folders || [];
            }
        }).catch(function () {
            pickerState.folders = [];
        });
    }

    // ── Render picker ────────────────────────────────────

    function renderPicker() {
        var overlay = pickerState.overlay;
        var title = pickerState.mediaType === 'image' ? 'Select Image' : 'Select Video';

        var folderOptions = '<option value="">All folders</option>';
        for (var i = 0; i < pickerState.folders.length; i++) {
            var f = pickerState.folders[i];
            folderOptions += '<option value="' + escapeHtml(f.slug) + '"' + (pickerState.folder === f.slug ? ' selected' : '') + '>' + escapeHtml(f.name) + '</option>';
        }

        overlay.innerHTML =
            '<div class="ml-modal mp-modal">' +
                '<div class="ml-modal-header">' +
                    '<h3>' + title + '</h3>' +
                    '<button class="ml-modal-close">&times;</button>' +
                '</div>' +
                '<div class="mp-toolbar">' +
                    '<input type="text" class="mp-search" placeholder="Search..." value="' + escapeHtml(pickerState.searchQuery) + '">' +
                    '<select class="mp-folder-select">' + folderOptions + '</select>' +
                '</div>' +
                '<div class="mp-upload-area">' +
                    '<label class="mp-upload-label">' +
                        '<input type="file" class="mp-upload-input" accept="' + (pickerState.mediaType === 'image' ? 'image/*' : 'video/*') + '">' +
                        '<span class="mp-upload-btn">+ Upload New</span>' +
                    '</label>' +
                '</div>' +
                '<div class="mp-grid" id="mp-grid"></div>' +
                '<div class="mp-pagination" id="mp-pagination"></div>' +
            '</div>';

        // Attach listeners
        var searchInput = overlay.querySelector('.mp-search');
        searchInput.addEventListener('input', debounce(function () {
            pickerState.searchQuery = this.value;
            pickerState.currentPage = 1;
            loadPickerMedia();
        }, 400));

        var folderSelect = overlay.querySelector('.mp-folder-select');
        folderSelect.addEventListener('change', function () {
            pickerState.folder = this.value || null;
            pickerState.currentPage = 1;
            loadPickerMedia();
        });

        var uploadInput = overlay.querySelector('.mp-upload-input');
        uploadInput.addEventListener('change', function () {
            if (this.files && this.files.length > 0) {
                handlePickerUpload(this.files[0]);
                this.value = '';
            }
        });

        overlay.querySelector('.ml-modal-close').addEventListener('click', closePicker);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closePicker();
        });
    }

    function renderPickerGrid() {
        var grid = document.getElementById('mp-grid');
        if (!grid) return;

        if (pickerState.loading) {
            grid.innerHTML = '<div class="mp-loading"><div class="ml-loading-spinner"></div><p>Loading...</p></div>';
            return;
        }

        if (pickerState.items.length === 0) {
            grid.innerHTML = '<div class="mp-empty"><p>No ' + pickerState.mediaType + 's found. Upload one to get started.</p></div>';
            return;
        }

        var html = '';
        for (var i = 0; i < pickerState.items.length; i++) {
            var item = pickerState.items[i];
            var thumb = item.thumbnail_url || item.url || '';
            var name = item.filename || item.original_filename || 'unnamed';

            html +=
                '<div class="mp-card" data-media-id="' + item.id + '">' +
                    '<div class="mp-card-thumb">';

            if (pickerState.mediaType === 'image' && thumb) {
                html += '<img src="' + escapeHtml(thumb) + '" alt="' + escapeHtml(item.alt_text || '') + '" loading="lazy" />';
            } else if (pickerState.mediaType === 'video') {
                if (item.poster_url) {
                    html += '<img src="' + escapeHtml(item.poster_url) + '" alt="' + escapeHtml(item.alt_text || '') + '" loading="lazy" />';
                    html += '<div class="mp-video-badge">VIDEO</div>';
                } else {
                    html += '<div class="mp-card-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></div>';
                }
            } else {
                html += '<div class="mp-card-thumb-placeholder"></div>';
            }

            html +=
                    '</div>' +
                    '<p class="mp-card-name" title="' + escapeHtml(name) + '">' + escapeHtml(name) + '</p>' +
                '</div>';
        }

        grid.innerHTML = html;

        // Attach click listeners
        var cards = grid.querySelectorAll('.mp-card');
        for (var c = 0; c < cards.length; c++) {
            cards[c].addEventListener('click', function () {
                var mediaId = parseInt(this.getAttribute('data-media-id'), 10);
                selectMedia(mediaId);
            });
        }
    }

    function renderPickerPagination() {
        var pagination = document.getElementById('mp-pagination');
        if (!pagination) return;

        if (pickerState.totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        var html = '';
        if (pickerState.currentPage > 1) {
            html += '<button class="ml-btn ml-btn-small mp-page" data-page="' + (pickerState.currentPage - 1) + '">&laquo;</button>';
        }
        html += '<span>Page ' + pickerState.currentPage + ' of ' + pickerState.totalPages + '</span>';
        if (pickerState.currentPage < pickerState.totalPages) {
            html += '<button class="ml-btn ml-btn-small mp-page" data-page="' + (pickerState.currentPage + 1) + '">&raquo;</button>';
        }

        pagination.innerHTML = html;

        var btns = pagination.querySelectorAll('.mp-page');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                pickerState.currentPage = parseInt(this.getAttribute('data-page'), 10);
                loadPickerMedia();
            });
        }
    }

    // ── Select media ────────────────────────────────────

    function selectMedia(mediaId) {
        var item = null;
        for (var i = 0; i < pickerState.items.length; i++) {
            if (pickerState.items[i].id === mediaId) {
                item = pickerState.items[i];
                break;
            }
        }

        if (!item) return;

        if (pickerState.callback) {
            pickerState.callback(item);
        }
        closePicker();
    }

    // ── Upload from picker ──────────────────────────────

    function handlePickerUpload(file) {
        var formData = new FormData();
        formData.append('file', file);
        formData.append('folder', pickerState.folder || 'general');
        formData.append('alt_text', file.name.replace(/\.[^/.]+$/, ''));

        showToast('Uploading...', 'info');

        apiPost(API.upload, formData).then(function (data) {
            if (data.success) {
                showToast('Upload complete', 'success');
                loadPickerMedia();
            } else {
                showToast(data.error || 'Upload failed', 'error');
            }
        }).catch(function () {
            showToast('Upload failed', 'error');
        });
    }

    // ── Open / close ────────────────────────────────────

    function openPicker(mediaType, callback, folder) {
        pickerState.mediaType = mediaType;
        pickerState.callback = callback;
        pickerState.folder = folder || null;
        pickerState.searchQuery = '';
        pickerState.currentPage = 1;

        var overlay = document.createElement('div');
        overlay.className = 'ml-modal-overlay';
        document.body.appendChild(overlay);
        pickerState.overlay = overlay;

        requestAnimationFrame(function () {
            overlay.classList.add('ml-modal-show');
        });

        renderPicker();
        loadPickerFolders().then(function () {
            renderPicker();
            loadPickerMedia();
        });
    }

    function closePicker() {
        if (pickerState.overlay) {
            pickerState.overlay.classList.remove('ml-modal-show');
            var overlay = pickerState.overlay;
            setTimeout(function () { overlay.remove(); }, 300);
            pickerState.overlay = null;
        }
        pickerState.callback = null;
    }

    // ── Debounce ────────────────────────────────────────

    function debounce(fn, wait) {
        var timer;
        return function () {
            var ctx = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 300);
        };
    }

    // ── Public API ───────────────────────────────────────

    window.MediaPicker = {
        openImagePicker: function (callback, folder) {
            openPicker('image', callback, folder);
        },
        openVideoPicker: function (callback, folder) {
            openPicker('video', callback, folder);
        },
    };

})();
