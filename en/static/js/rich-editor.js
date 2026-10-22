// =====================================================
// rich-editor.js — Reusable TinyMCE Rich Editor Component
// =====================================================
//
// Single source of truth for all rich text editing in the
// Tenant CMS. Used by news, reviews, pages, dynamic
// pages, static pages, and any future content type.
//
// Features:
//   - Lazy-loads TinyMCE 7 from Cloudflare CDN (once per page)
//   - Auto-initializes on <textarea data-rich-editor> elements
//   - Full publishing toolbar (see TOOLBAR_CONFIG below)
//   - R2 image upload via /api/v1/media/upload
//   - Cloudflare Stream / R2 video embed
//   - Media library picker integration (Phase 5)
//   - Content syncs back to <textarea> for existing form handlers
//   - Autosave to localStorage (recoverable after crash)
//   - Global RichEditor API for programmatic control
//   - Responsive: works on desktop, tablet, mobile
//   - Dark mode compatible (auto-detects dashboard theme)
//
// Usage (HTML):
//   <textarea name="content" data-rich-editor data-editor-id="news-content"></textarea>
//   <script src="/static/js/rich-editor.js"></script>
//
// Usage (JS):
//   RichEditor.get('news-content');       // → HTML string
//   RichEditor.set('news-content', html);  // Set content
//   RichEditor.insertImage('news-content', url, alt);
//   RichEditor.destroy('news-content');
//
// =====================================================

import { autoInit, initEditor, loadTinyMCE } from "/static/js/rich-editor/tinymce-init.js";
import { RichEditor } from "/static/js/rich-editor/api.js";

// ── Form submission hook ───────────────────────────

/**
 * Hooks into form submission to ensure all editors sync their content
 * to their textareas before the form is submitted.
 * This is a safety net — TinyMCE also syncs on its own 'submit' event,
 * but this ensures it happens even if TinyMCE's internal handler is slow.
 */
function hookFormSubmission() {
    document.addEventListener('submit', function (e) {
        // Sync all editors
        RichEditor.syncAll();
    }, true); // Use capture phase to run before form handlers
}

// ── Bootstrap ──────────────────────────────────────

/**
 * Initializes the RichEditor system on DOMContentLoaded.
 * Scans for data-rich-editor textareas and auto-initializes them.
 */
function bootstrap() {
    // Auto-init existing textareas
    autoInit();

    // Hook form submission for safety
    hookFormSubmission();

    // Watch for dynamically added textareas (MutationObserver)
    if (typeof MutationObserver !== 'undefined') {
        var observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var mutation = mutations[i];
                for (var j = 0; j < mutation.addedNodes.length; j++) {
                    var node = mutation.addedNodes[j];
                    if (node.nodeType === 1) {
                        // Check if the added node is a textarea with data-rich-editor
                        if (node.tagName === 'TEXTAREA' && node.hasAttribute('data-rich-editor')) {
                            loadTinyMCE().then(function () {
                                initEditor(node);
                            });
                        }
                        // Check for textareas inside the added node
                        var textareas = node.querySelectorAll
                            ? node.querySelectorAll('textarea[data-rich-editor]')
                            : [];
                        for (var k = 0; k < textareas.length; k++) {
                            (function (ta) {
                                loadTinyMCE().then(function () {
                                    initEditor(ta);
                                });
                            })(textareas[k]);
                        }
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
}

// ── Expose global API ───────────────────────────────

window.RichEditor = RichEditor;

// ── Initialize on DOM ready ─────────────────────────

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
