// ── Utility functions ──────────────────────────────

/**
 * Gets the CSRF token from the cookie or meta tag.
 * The existing auth system uses session cookies, so we
 * include credentials in fetch requests.
 * @returns {string} The CSRF token or empty string.
 */
export function getCsrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

/**
 * Detects if the dashboard is in dark mode.
 * Checks for a 'dark' class on body or html, or a data-theme attribute.
 * @returns {boolean} True if dark mode is active.
 */
export function isDarkMode() {
    var body = document.body;
    var html = document.documentElement;
    if (body && body.classList.contains('dark')) return true;
    if (html && html.classList.contains('dark')) return true;
    if (html && html.getAttribute('data-theme') === 'dark') return true;
    if (body && body.getAttribute('data-theme') === 'dark') return true;
    // Check CSS variable
    var bg = getComputedStyle(body || html).backgroundColor;
    if (bg) {
        var rgb = bg.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
            var brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
            return brightness < 128;
        }
    }
    return false;
}

/**
 * Generates a unique ID for an editor instance.
 * @param {HTMLElement} textarea - The textarea element.
 * @returns {string} A unique editor ID.
 */
export function generateEditorId(textarea) {
    if (textarea.dataset.editorId) return textarea.dataset.editorId;
    var id = 'editor_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    textarea.dataset.editorId = id;
    return id;
}

/**
 * Shows a toast notification (uses existing dashboard notification pattern
 * or falls back to a simple alert).
 * @param {string} message - The message to show.
 * @param {string} type - 'success', 'error', or 'info'.
 */
export function showToast(message, type) {
    // Try existing dashboard notification system
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
        return;
    }
    // Try existing dashboard toast
    var toast = document.querySelector('.dashboard-toast');
    if (toast) {
        toast.textContent = message;
        toast.className = 'dashboard-toast ' + (type || 'info');
        toast.style.display = 'block';
        setTimeout(function () { toast.style.display = 'none'; }, 3000);
        return;
    }
    // Fallback — create a temporary toast
    var el = document.createElement('div');
    el.textContent = message;
    el.style.cssText =
        'position:fixed;bottom:20px;right:20px;padding:12px 20px;' +
        'border-radius:6px;color:#fff;font-size:14px;z-index:100000;' +
        'background:' + (type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : '#3498db') + ';' +
        'box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:opacity 0.3s;';
    document.body.appendChild(el);
    setTimeout(function () {
        el.style.opacity = '0';
        setTimeout(function () { el.remove(); }, 300);
    }, 3000);
}

/**
 * Escapes HTML for safe display in editor dialogs.
 * @param {string} text - The text to escape.
 * @returns {string} Escaped HTML.
 */
export function escapeEditorHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
