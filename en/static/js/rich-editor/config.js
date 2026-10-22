// ── Configuration ────────────────────────────────

// TinyMCE loaded from Cloudflare CDN (fast, cached, no npm build needed)
// Using TinyMCE 7 free build (MIT-licensed core, standard plugins)
export var TINYMCE_CDN_URL = 'https://cdn.jsdelivr.net/npm/tinymce@7.4.0/tinymce.min.js';

// API endpoints (match Phase 3 routes)
export var API_UPLOAD = '/en/api/v1/media/upload';

export var API_MEDIA_LIST = '/en/api/v1/media/list';

var API_MEDIA_SEARCH = '/en/api/v1/media/search';

// Maximum file size for image uploads (10 MB — matches server config)
export var MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// Allowed image extensions
export var ALLOWED_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'];

// Allowed video embed sources (for iframe sanitization)
export var ALLOWED_VIDEO_SOURCES = [
    'https://www.youtube.com/embed/',
    'https://youtube.com/embed/',
    'https://player.vimeo.com/video/',
    'https://players.brightcove.net/',
    'https://iframe.cloudflarestream.com/',
    'https://watch.cloudflarestream.com/'
];
