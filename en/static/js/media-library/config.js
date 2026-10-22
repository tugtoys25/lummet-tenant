// ── Configuration ────────────────────────────────────

export var API = {
    upload:    '/en/api/v1/media/upload',
    delete:    '/en/api/v1/media/r2/delete',
    browse:    '/en/api/v1/media/browse',
    search:    '/en/api/v1/media/search',
    get:       '/en/api/v1/media/get',
    metaUpdate:'/en/api/v1/media/meta/update',
    foldersTree:'/en/api/v1/media/folders/tree',
    folderCreate:'/en/api/v1/media/folder/create',
    folderUpdate:'/en/api/v1/media/folder/update',
    folderDelete:'/en/api/v1/media/folder/delete',
    folderCount:'/en/api/v1/media/folder/count',
};

export var ITEMS_PER_PAGE = 24;

export var ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,video/ogg,application/pdf,text/plain';

// ── State ───────────────────────────────────────────

export var state = {
    container: null,
    currentFolder: null,
    folders: [],
    mediaItems: [],
    totalItems: 0,
    currentPage: 1,
    totalPages: 1,
    searchQuery: '',
    typeFilter: 'all',
    sortBy: 'created_at',
    sortOrder: 'DESC',
    loading: false,
    selectedItems: new Set(),
};
