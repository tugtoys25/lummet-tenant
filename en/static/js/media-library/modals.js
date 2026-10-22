import { API, state } from "/static/js/media-library/config.js";
import { escapeHtml, getTypeIcon, showToast } from "/static/js/media-library/utils.js";
import { apiGet, handleCreateFolder, handleDeleteFolder, handleRenameFolder, handleUpdateMetadata, loadMedia } from "/static/js/media-library/actions.js";

// ── Modals ──────────────────────────────────────────

export function showEditModal(mediaId) {
    // Find media item in current items
    var item = null;
    for (var i = 0; i < state.mediaItems.length; i++) {
        if (state.mediaItems[i].id === mediaId) {
            item = state.mediaItems[i];
            break;
        }
    }

    if (!item) {
        // Fetch from API
        apiGet(API.get + '?id=' + mediaId).then(function (data) {
            if (data.success && data.media) {
                renderEditModal(data.media);
            } else {
                showToast('Could not load media details', 'error');
            }
        });
        return;
    }

    renderEditModal(item);
}

function renderEditModal(item) {
    var overlay = document.createElement('div');
    overlay.className = 'ml-modal-overlay';
    overlay.id = 'ml-edit-modal';

    // Build folder options
    var folderOptions = '<option value="">No folder</option>';
    for (var i = 0; i < state.folders.length; i++) {
        var f = state.folders[i];
        folderOptions += '<option value="' + escapeHtml(f.slug) + '"' + (item.folder === f.slug ? ' selected' : '') + '>' + escapeHtml(f.name) + '</option>';
    }

    overlay.innerHTML =
        '<div class="ml-modal">' +
            '<div class="ml-modal-header">' +
                '<h3>Edit Media Details</h3>' +
                '<button class="ml-modal-close">&times;</button>' +
            '</div>' +
            '<div class="ml-modal-body">' +
                '<div class="ml-modal-preview">';

    if (item.type === 'image' && (item.thumbnail_url || item.url)) {
        overlay.innerHTML += '<img src="' + escapeHtml(item.thumbnail_url || item.url) + '" alt="' + escapeHtml(item.alt_text) + '" />';
    } else {
        overlay.innerHTML += '<div class="ml-modal-preview-placeholder">' + getTypeIcon(item.type, item.mime_type) + '</div>';
    }

    overlay.innerHTML +=
                '</div>' +
                '<div class="ml-form-group">' +
                    '<label>Filename</label>' +
                    '<input type="text" class="ml-form-input" value="' + escapeHtml(item.filename || '') + '" readonly>' +
                '</div>' +
                '<div class="ml-form-group">' +
                    '<label>Alt Text</label>' +
                    '<input type="text" class="ml-form-input" id="ml-edit-alt" value="' + escapeHtml(item.alt_text || '') + '" placeholder="Describe this image for accessibility">' +
                '</div>' +
                '<div class="ml-form-group">' +
                    '<label>Caption</label>' +
                    '<input type="text" class="ml-form-input" id="ml-edit-caption" value="' + escapeHtml(item.caption || '') + '" placeholder="Caption shown below image">' +
                '</div>' +
                '<div class="ml-form-group">' +
                    '<label>Folder</label>' +
                    '<select class="ml-form-input" id="ml-edit-folder">' + folderOptions + '</select>' +
                '</div>' +
                '<div class="ml-form-group">' +
                    '<label>URL</label>' +
                    '<input type="text" class="ml-form-input" value="' + escapeHtml(item.url || '') + '" readonly>' +
                '</div>' +
            '</div>' +
            '<div class="ml-modal-footer">' +
                '<button class="ml-btn ml-btn-secondary ml-modal-cancel">Cancel</button>' +
                '<button class="ml-btn ml-btn-primary ml-modal-save" data-media-id="' + item.id + '">Save Changes</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    requestAnimationFrame(function () { overlay.classList.add('ml-modal-show'); });

    // Close handlers
    overlay.querySelector('.ml-modal-close').addEventListener('click', function () { closeModal(overlay); });
    overlay.querySelector('.ml-modal-cancel').addEventListener('click', function () { closeModal(overlay); });
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal(overlay);
    });

    // Save handler
    overlay.querySelector('.ml-modal-save').addEventListener('click', function () {
        var mediaId = parseInt(this.getAttribute('data-media-id'), 10);
        handleUpdateMetadata(mediaId, {
            alt_text: document.getElementById('ml-edit-alt').value,
            caption: document.getElementById('ml-edit-caption').value,
            folder: document.getElementById('ml-edit-folder').value,
        }).then(function (data) {
            if (data && data.success) {
                closeModal(overlay);
                loadMedia();
            }
        });
    });
}

export function showFolderMenu(folderId, folderName, folderSlug) {
    var overlay = document.createElement('div');
    overlay.className = 'ml-modal-overlay';
    overlay.id = 'ml-folder-menu-modal';

    overlay.innerHTML =
        '<div class="ml-modal ml-modal-small">' +
            '<div class="ml-modal-header">' +
                '<h3>Edit Folder</h3>' +
                '<button class="ml-modal-close">&times;</button>' +
            '</div>' +
            '<div class="ml-modal-body">' +
                '<div class="ml-form-group">' +
                    '<label>Folder Name</label>' +
                    '<input type="text" class="ml-form-input" id="ml-folder-name" value="' + escapeHtml(folderName) + '">' +
                '</div>' +
                '<div class="ml-form-group">' +
                    '<label>Slug</label>' +
                    '<input type="text" class="ml-form-input" id="ml-folder-slug" value="' + escapeHtml(folderSlug) + '">' +
                '</div>' +
            '</div>' +
            '<div class="ml-modal-footer">' +
                '<button class="ml-btn ml-btn-danger ml-folder-delete-btn" data-folder-id="' + folderId + '">Delete Folder</button>' +
                '<button class="ml-btn ml-btn-secondary ml-modal-cancel">Cancel</button>' +
                '<button class="ml-btn ml-btn-primary ml-folder-save-btn" data-folder-id="' + folderId + '">Save</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('ml-modal-show'); });

    overlay.querySelector('.ml-modal-close').addEventListener('click', function () { closeModal(overlay); });
    overlay.querySelector('.ml-modal-cancel').addEventListener('click', function () { closeModal(overlay); });
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal(overlay);
    });

    overlay.querySelector('.ml-folder-save-btn').addEventListener('click', function () {
        var fid = parseInt(this.getAttribute('data-folder-id'), 10);
        var name = document.getElementById('ml-folder-name').value;
        var slug = document.getElementById('ml-folder-slug').value;
        if (!name) { showToast('Name is required', 'error'); return; }
        handleRenameFolder(fid, name, slug).then(function (data) {
            if (data && data.success) closeModal(overlay);
        });
    });

    overlay.querySelector('.ml-folder-delete-btn').addEventListener('click', function () {
        var fid = parseInt(this.getAttribute('data-folder-id'), 10);
        handleDeleteFolder(fid);
        closeModal(overlay);
    });
}

export function showNewFolderModal() {
    var overlay = document.createElement('div');
    overlay.className = 'ml-modal-overlay';
    overlay.id = 'ml-new-folder-modal';

    overlay.innerHTML =
        '<div class="ml-modal ml-modal-small">' +
            '<div class="ml-modal-header">' +
                '<h3>New Folder</h3>' +
                '<button class="ml-modal-close">&times;</button>' +
            '</div>' +
            '<div class="ml-modal-body">' +
                '<div class="ml-form-group">' +
                    '<label>Folder Name</label>' +
                    '<input type="text" class="ml-form-input" id="ml-new-folder-name" placeholder="e.g. Screenshots">' +
                '</div>' +
                '<div class="ml-form-group">' +
                    '<label>Slug (URL-friendly name)</label>' +
                    '<input type="text" class="ml-form-input" id="ml-new-folder-slug" placeholder="e.g. screenshots">' +
                '</div>' +
            '</div>' +
            '<div class="ml-modal-footer">' +
                '<button class="ml-btn ml-btn-secondary ml-modal-cancel">Cancel</button>' +
                '<button class="ml-btn ml-btn-primary ml-new-folder-create">Create</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('ml-modal-show'); });

    // Auto-generate slug from name
    var nameInput = overlay.querySelector('#ml-new-folder-name');
    var slugInput = overlay.querySelector('#ml-new-folder-slug');
    nameInput.addEventListener('input', function () {
        slugInput.value = this.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    });

    overlay.querySelector('.ml-modal-close').addEventListener('click', function () { closeModal(overlay); });
    overlay.querySelector('.ml-modal-cancel').addEventListener('click', function () { closeModal(overlay); });
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal(overlay);
    });

    overlay.querySelector('.ml-new-folder-create').addEventListener('click', function () {
        var name = nameInput.value;
        var slug = slugInput.value;
        if (!name) { showToast('Name is required', 'error'); return; }
        if (!slug) { showToast('Slug is required', 'error'); return; }
        handleCreateFolder(name, slug).then(function (data) {
            if (data && data.success) closeModal(overlay);
        });
    });
}

function closeModal(overlay) {
    overlay.classList.remove('ml-modal-show');
    setTimeout(function () { overlay.remove(); }, 300);
}

// ── Clipboard ───────────────────────────────────────

export function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
    } else {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}
