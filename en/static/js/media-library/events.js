import { state } from "/static/js/media-library/config.js";
import { debounce } from "/static/js/media-library/utils.js";
import { handleUploadFiles, loadFolders, loadMedia } from "/static/js/media-library/actions.js";
import { renderFolderSidebar, renderMainLayout } from "/static/js/media-library/views.js";
import { showNewFolderModal } from "/static/js/media-library/modals.js";

// ── Event listeners ──────────────────────────────────

export function attachEventListeners() {
    // Search input
    var searchInput = document.querySelector('.ml-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(function () {
            state.searchQuery = this.value;
            state.currentPage = 1;
            loadMedia();
        }, 400));
    }

    // Type filter
    var typeFilter = document.querySelector('.ml-type-filter');
    if (typeFilter) {
        typeFilter.addEventListener('change', function () {
            state.typeFilter = this.value;
            state.currentPage = 1;
            loadMedia();
        });
    }

    // Sort
    var sortSelect = document.querySelector('.ml-sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', function () {
            var parts = this.value.split(':');
            state.sortBy = parts[0];
            state.sortOrder = parts[1];
            loadMedia();
        });
    }

    // Upload button
    var uploadBtn = document.querySelector('.ml-upload-btn');
    var fileInput = document.getElementById('ml-file-input');
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', function () {
            fileInput.click();
        });
        fileInput.addEventListener('change', function () {
            if (this.files && this.files.length > 0) {
                handleUploadFiles(this.files);
                this.value = '';
            }
        });
    }

    // New folder button
    var newFolderBtn = document.querySelector('.ml-new-folder-btn');
    if (newFolderBtn) {
        newFolderBtn.addEventListener('click', showNewFolderModal);
    }

    // Dropzone
    var dropzone = document.getElementById('ml-dropzone');
    if (dropzone) {
        dropzone.addEventListener('click', function () {
            if (fileInput) fileInput.click();
        });

        dropzone.addEventListener('dragover', function (e) {
            e.preventDefault();
            e.stopPropagation();
            this.classList.add('ml-dropzone-active');
        });

        dropzone.addEventListener('dragleave', function (e) {
            e.preventDefault();
            e.stopPropagation();
            this.classList.remove('ml-dropzone-active');
        });

        dropzone.addEventListener('drop', function (e) {
            e.preventDefault();
            e.stopPropagation();
            this.classList.remove('ml-dropzone-active');
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                handleUploadFiles(e.dataTransfer.files);
            }
        });
    }

    // Global drag & drop on the container
    var container = state.container;
    if (container) {
        container.addEventListener('dragover', function (e) {
            e.preventDefault();
        });
        container.addEventListener('drop', function (e) {
            e.preventDefault();
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                // Only handle if drop wasn't on the dropzone (which handles its own)
                if (!e.target.closest('#ml-dropzone')) {
                    handleUploadFiles(e.dataTransfer.files);
                }
            }
        });
    }
}

// ── Init ─────────────────────────────────────────────

export function init(containerId) {
    var container = document.getElementById(containerId);
    if (!container) {
        console.error('MediaLibrary: Container "' + containerId + '" not found');
        return;
    }
    state.container = container;
    renderMainLayout();
    loadFolders().then(function () {
        renderFolderSidebar();
        loadMedia();
    });
}
