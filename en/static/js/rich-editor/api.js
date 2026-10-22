import { clearAutosave, getAutosave } from "/static/js/rich-editor/autosave.js";
import { insertImageIntoEditor } from "/static/js/rich-editor/image-dialog.js";
import { editorRegistry, initEditor, loadTinyMCE } from "/static/js/rich-editor/tinymce-init.js";

// ── Global RichEditor API ──────────────────────────

/**
 * The global RichEditor API exposed on window.
 * Allows programmatic control of editor instances.
 */
export var RichEditor = {
    /**
     * Gets the HTML content of an editor.
     * @param {string} editorId - The editor instance ID.
     * @returns {string|null} The HTML content, or null if editor not found.
     */
    get: function (editorId) {
        var editor = editorRegistry[editorId];
        if (editor) return editor.getContent();
        // Fallback: read from textarea
        var textarea = document.querySelector('textarea[data-editor-id="' + editorId + '"]');
        return textarea ? textarea.value : null;
    },

    /**
     * Sets the HTML content of an editor.
     * @param {string} editorId - The editor instance ID.
     * @param {string} html - The HTML content to set.
     */
    set: function (editorId, html) {
        var editor = editorRegistry[editorId];
        if (editor) {
            editor.setContent(html);
            editor.save();
        } else {
            var textarea = document.querySelector('textarea[data-editor-id="' + editorId + '"]');
            if (textarea) textarea.value = html;
        }
    },

    /**
     * Inserts an image into the editor at the cursor position.
     * @param {string} editorId - The editor instance ID.
     * @param {string} url - The image URL.
     * @param {string} alt - The alt text.
     * @param {number} width - Optional width.
     * @param {number} height - Optional height.
     */
    insertImage: function (editorId, url, alt, width, height) {
        var editor = editorRegistry[editorId];
        if (editor) {
            insertImageIntoEditor(editor, url, alt, width, height);
        }
    },

    /**
     * Inserts arbitrary HTML content at the cursor position.
     * @param {string} editorId - The editor instance ID.
     * @param {string} html - The HTML to insert.
     */
    insertContent: function (editorId, html) {
        var editor = editorRegistry[editorId];
        if (editor) {
            editor.insertContent(html);
        }
    },

    /**
     * Inserts a video embed into the editor.
     * @param {string} editorId - The editor instance ID.
     * @param {string} embedHtml - The video embed HTML.
     */
    insertVideo: function (editorId, embedHtml) {
        var editor = editorRegistry[editorId];
        if (editor) {
            editor.insertContent(embedHtml);
        }
    },

    /**
     * Destroys an editor instance and restores the original textarea.
     * @param {string} editorId - The editor instance ID.
     */
    destroy: function (editorId) {
        var editor = editorRegistry[editorId];
        if (editor) {
            editor.remove();
            delete editorRegistry[editorId];
        }
    },

    /**
     * Initializes an editor on a specific textarea element.
     * Useful for dynamically added textareas (e.g., after AJAX content load).
     * @param {HTMLElement|string} textarea - The textarea element or selector.
     * @param {Object} options - Optional configuration overrides.
     */
    init: function (textarea, options) {
        if (typeof textarea === 'string') {
            textarea = document.querySelector(textarea);
        }
        if (!textarea) {
            console.error('RichEditor.init: textarea not found');
            return;
        }
        // Apply options as data attributes
        if (options) {
            if (options.folder) textarea.dataset.editorFolder = options.folder;
            if (options.height) textarea.dataset.editorHeight = options.height;
            if (options.id) textarea.dataset.editorId = options.id;
        }
        // Ensure the data-rich-editor attribute is set
        textarea.setAttribute('data-rich-editor', '');

        loadTinyMCE().then(function () {
            initEditor(textarea);
        });
    },

    /**
     * Gets the autosaved content for an editor (if available).
     * @param {string} editorId - The editor instance ID.
     * @returns {string|null} The autosaved content or null.
     */
    getAutosave: function (editorId) {
        return getAutosave(editorId);
    },

    /**
     * Clears the autosaved content for an editor.
     * @param {string} editorId - The editor instance ID.
     */
    clearAutosave: function (editorId) {
        clearAutosave(editorId);
    },

    /**
     * Syncs all editor instances back to their textareas.
     * Call before form submission to ensure all content is saved.
     */
    syncAll: function () {
        for (var id in editorRegistry) {
            if (editorRegistry.hasOwnProperty(id)) {
                editorRegistry[id].save();
            }
        }
    },

    /**
     * Checks if an editor instance is ready.
     * @param {string} editorId - The editor instance ID.
     * @returns {boolean} True if the editor is initialized and ready.
     */
    isReady: function (editorId) {
        return !!editorRegistry[editorId];
    }
};
