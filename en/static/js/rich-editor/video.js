import { ALLOWED_VIDEO_SOURCES } from "/static/js/rich-editor/config.js";
import { showToast } from "/static/js/rich-editor/utils.js";

// ── Custom video embed handler ────────────────────

/**
 * Configures the video/media button to use a custom dialog
 * that supports Cloudflare Stream, R2-hosted videos, and standard embeds.
 * @param {Object} editor - The TinyMCE editor instance.
 * @param {string} editorId - The editor instance ID.
 * @param {string} folder - The default upload folder.
 */
export function configureVideoEmbed(editor, editorId, folder) {
    // Override the media button with our custom handler
    editor.ui.registry.addButton('media', {
        icon: 'embed',
        tooltip: 'Insert video',
        onAction: function () {
            openVideoDialog(editor, editorId, folder);
        }
    });
}

/**
 * Opens the video insertion dialog.
 * Supports: Cloudflare Stream embed, YouTube/Vimeo embed, R2 video upload.
 * @param {Object} editor - The TinyMCE editor instance.
 * @param {string} editorId - The editor instance ID.
 * @param {string} folder - The default upload folder.
 */
function openVideoDialog(editor, editorId, folder) {
    editor.windowManager.open({
        title: 'Insert Video',
        size: 'normal',
        body: {
            type: 'panel',
            items: [
                {
                    type: 'input',
                    name: 'embedurl',
                    label: 'Video embed URL (YouTube, Vimeo, Cloudflare Stream)',
                    placeholder: 'https://www.youtube.com/embed/VIDEO_ID'
                },
                {
                    type: 'textarea',
                    name: 'iframehtml',
                    label: 'Or paste iframe embed code',
                    rows: 4
                },
                {
                    type: 'urlinput',
                    name: 'r2url',
                    label: 'Or enter R2 video URL (MP4/WebM)',
                    filetype: 'file'
                },
                {
                    type: 'input',
                    name: 'poster',
                    label: 'Poster image URL (optional)',
                    placeholder: 'https://...'
                },
                {
                    type: 'input',
                    name: 'width',
                    label: 'Width (px)',
                    inputMode: 'numeric',
                    placeholder: '640'
                },
                {
                    type: 'input',
                    name: 'height',
                    label: 'Height (px)',
                    inputMode: 'numeric',
                    placeholder: '360'
                }
            ]
        },
        buttons: [
            {
                type: 'cancel',
                text: 'Cancel'
            },
            {
                type: 'submit',
                text: 'Insert',
                primary: true
            }
        ],
        initialData: {
            embedurl: '',
            iframehtml: '',
            r2url: '',
            poster: '',
            width: '640',
            height: '360'
        },
        onSubmit: function (api) {
            var data = api.getData();
            var html = buildVideoEmbed(data);
            if (html) {
                editor.insertContent(html);
                api.close();
            } else {
                showToast('Please provide a video URL or embed code', 'error');
            }
        }
    });
}

/**
 * Builds the video embed HTML from dialog data.
 * @param {Object} data - The dialog form data.
 * @returns {string} The HTML embed code, or empty string if invalid.
 */
function buildVideoEmbed(data) {
    var width = parseInt(data.width, 10) || 640;
    var height = parseInt(data.height, 10) || 360;

    // Option 1: Iframe embed code (paste)
    if (data.iframehtml && data.iframehtml.trim()) {
        // Extract src from iframe for sanitization
        var srcMatch = data.iframehtml.match(/src=["']([^"']+)["']/i);
        if (srcMatch) {
            var src = srcMatch[1];
            if (isAllowedVideoSource(src)) {
                return '<iframe src="' + src + '" width="' + width + '" height="' + height + '" frameborder="0" allowfullscreen loading="lazy"></iframe>';
            }
        }
        // If we can't extract/validate src, return the raw iframe HTML
        // (it will be sanitized at render time by Phase 2)
        return data.iframehtml;
    }

    // Option 2: Embed URL (YouTube, Vimeo, Stream)
    if (data.embedurl && data.embedurl.trim()) {
        var url = data.embedurl.trim();
        if (isAllowedVideoSource(url)) {
            return '<iframe src="' + url + '" width="' + width + '" height="' + height + '" frameborder="0" allowfullscreen loading="lazy"></iframe>';
        }
        showToast('Video source not in allowed list', 'error');
        return '';
    }

    // Option 3: R2 video URL (direct MP4/WebM)
    if (data.r2url && data.r2url.value) {
        var videoSrc = data.r2url.value;
        var posterAttr = data.poster ? ' poster="' + data.poster + '"' : '';
        return '<video src="' + videoSrc + '"' + posterAttr + ' width="' + width + '" height="' + height + '" controls preload="metadata"></video>';
    }

    return '';
}

/**
 * Checks if a video source URL is from an allowed provider.
 * @param {string} url - The URL to check.
 * @returns {boolean} True if allowed.
 */
function isAllowedVideoSource(url) {
    var lower = url.toLowerCase();
    for (var i = 0; i < ALLOWED_VIDEO_SOURCES.length; i++) {
        if (lower.startsWith(ALLOWED_VIDEO_SOURCES[i])) return true;
    }
    // Allow own domain
    if (window.location.hostname && lower.startsWith('https://' + window.location.hostname)) return true;
    return false;
}
