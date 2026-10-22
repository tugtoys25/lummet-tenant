// ── Utility functions ───────────────────────────────

export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i >= units.length) i = units.length - 1;
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

export function formatDate(isoDate) {
    if (!isoDate) return '';
    var d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

export function showToast(message, type) {
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

function getCsrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

function isDarkMode() {
    var body = document.body;
    var html = document.documentElement;
    if (body && body.classList.contains('dark')) return true;
    if (html && html.classList.contains('dark')) return true;
    if (html && html.getAttribute('data-theme') === 'dark') return true;
    return false;
}

export function getTypeIcon(type, mimeType) {
    if (type === 'image') {
        return '<svg class="ml-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
    }
    if (type === 'video') {
        return '<svg class="ml-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>';
    }
    return '<svg class="ml-type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
}

export function debounce(fn, wait) {
    var timer;
    return function () {
        var ctx = this, args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 300);
    };
}
