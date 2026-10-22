// ── Autosave to localStorage ───────────────────────

/**
 * Saves editor content to localStorage for crash recovery.
 * @param {string} editorId - The editor instance ID.
 * @param {string} content - The HTML content to save.
 */
export function autosave(editorId, content) {
    try {
        localStorage.setItem('richeditor_autosave_' + editorId, content);
        localStorage.setItem('richeditor_autosave_time_' + editorId, Date.now().toString());
    } catch (e) {
        // localStorage might be full or disabled — silently ignore
    }
}

/**
 * Retrieves autosaved content from localStorage.
 * @param {string} editorId - The editor instance ID.
 * @returns {string|null} The autosaved content or null.
 */
export function getAutosave(editorId) {
    try {
        var content = localStorage.getItem('richeditor_autosave_' + editorId);
        var time = localStorage.getItem('richeditor_autosave_time_' + editorId);
        if (!content || !time) return null;
        // Only offer autosave if it's less than 24 hours old
        var age = Date.now() - parseInt(time, 10);
        if (age > 24 * 60 * 60 * 1000) {
            localStorage.removeItem('richeditor_autosave_' + editorId);
            localStorage.removeItem('richeditor_autosave_time_' + editorId);
            return null;
        }
        return content;
    } catch (e) {
        return null;
    }
}

/**
 * Clears autosaved content for an editor.
 * @param {string} editorId - The editor instance ID.
 */
export function clearAutosave(editorId) {
    try {
        localStorage.removeItem('richeditor_autosave_' + editorId);
        localStorage.removeItem('richeditor_autosave_time_' + editorId);
    } catch (e) {
        // Ignore
    }
}
