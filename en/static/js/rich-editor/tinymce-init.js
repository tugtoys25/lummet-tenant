import { API_MEDIA_LIST, TINYMCE_CDN_URL } from "/static/js/rich-editor/config.js";
import { generateEditorId, isDarkMode, showToast } from "/static/js/rich-editor/utils.js";
import { autosave, clearAutosave, getAutosave } from "/static/js/rich-editor/autosave.js";
import { getMenuConfig, getPluginList, getToolbarConfig, registerSourceCodePlugin } from "/static/js/rich-editor/editor-config.js";
import { configureImageUpload } from "/static/js/rich-editor/image-dialog.js";
import { configureVideoEmbed } from "/static/js/rich-editor/video.js";
import { configureAdInserter } from "/static/js/rich-editor/ad-inserter.js";
import { configureCalloutBox } from "/static/js/rich-editor/callout.js";
import { configureContentPickers, configureInternalLink } from "/static/js/rich-editor/internal-link.js";

// Track if TinyMCE script has been loaded or is loading
var tinymceLoaded = false;

var tinymceLoading = false;

var pendingEditors = [];

// Registry of active editor instances
export var editorRegistry = {};

// ── TinyMCE initialization ─────────────────────────

/**
 * Initializes a TinyMCE editor on a textarea element.
 * @param {HTMLElement} textarea - The textarea to enhance.
 */
export function initEditor(textarea) {
    var editorId = generateEditorId(textarea);
    var folder = textarea.dataset.editorFolder || 'general';
    var darkMode = isDarkMode();

    // Check for autosaved content
    var autosaved = getAutosave(editorId);
    if (autosaved && textarea.value && autosaved !== textarea.value) {
        // Offer to restore autosaved content
        // We use a non-blocking approach — set a data attribute that the UI can check
        textarea.dataset.autosaveAvailable = 'true';
    }

    var config = {
        target: textarea,
        selector: '#' + CSS.escape(textarea.id || ''),
        // Do not use selector — use target instead for reliability
        menubar: true,
        menu: getMenuConfig(),
        toolbar: getToolbarConfig(),
        plugins: getPluginList(),
        skin: darkMode ? 'oxide-dark' : 'oxide',
        content_css: darkMode
            ? ['https://cdn.jsdelivr.net/npm/tinymce@7.4.0/skins/ui/oxide-dark/content.min.css']
            : ['https://cdn.jsdelivr.net/npm/tinymce@7.4.0/skins/ui/oxide/content.min.css'],
        content_style: getContentStyle(darkMode),
        height: textarea.dataset.editorHeight || 500,
        min_height: 300,
        autoresize_bottom_margin: 50,
        resize: true,
        branding: false,
        promotion: false,
        elementpath: true,
        statusbar: true,
        paste_data_images: true,
        paste_as_text: false,
        paste_filter_drop: true,
        paste_word_valid_elements: 'b,strong,i,em,h1,h2,h3,h4,h5,h6,p,div,ul,ol,li,table,tr,td,th,tbody,thead,tfoot,a[href|target|rel],img[src|alt|width|height],br,hr,sub,sup,blockquote,pre,code,span,figure,figcaption,video[src|controls|poster|width|height],source[src|type]',
        paste_webkit_styles: 'color font-size background-color text-align',
        browser_spellcheck: true,
        contextmenu: 'link image table tablecell tablemergecells tablesplitcells',
        quickbars_selection_toolbar: 'bold italic underline | blockquote quicklink quickimage',
    //    quickbars_insert_toolbar: 'quickimage quicktable | hr pageembed',
        quickbars_insert_toolbar: 'quickimage quicktable | hr pageembed | calloutbox addinserter',
        image_advtab: true,
        image_caption: true,
        image_title: true,
        image_list: API_MEDIA_LIST + '?type=image',
        image_advtab: true,
        link_list: [],
        link_title: true,
        link_target_list: [
            { title: 'Same tab', value: '' },
            { title: 'New tab', value: '_blank' }
        ],
        link_default_target: '',
        link_rel_list: [
            { title: 'Default', value: '' },
            { title: 'No follow', value: 'nofollow' },
            { title: 'No follow + noopener', value: 'nofollow noopener' },
            { title: 'Sponsored', value: 'sponsored' },
            { title: 'UGC', value: 'ugc' }
        ],
        table_default_styles: {
            'border-collapse': 'collapse',
            'width': '100%'
        },
        table_default_attributes: {
            border: '1'
        },
        table_style_by_css: true,
        table_use_colgroups: true,
        formats: {
            alignleft: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'align-left' },
            aligncenter: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'align-center' },
            alignright: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'align-right' },
            alignjustify: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'align-justify' }
        },
        setup: function (editor) {
            // Register custom plugins/buttons
            registerSourceCodePlugin(editor);
            configureImageUpload(editor, editorId, folder);
            configureVideoEmbed(editor, editorId, folder);
            configureInternalLink(editor);
            configureContentPickers(editor);
            configureAdInserter(editor);
            configureCalloutBox(editor);

            // Sync content back to textarea on input
            editor.on('input', function () {
                editor.save(); // Saves to textarea
                autosave(editorId, editor.getContent());
            });

            // Sync on change (formatting changes, etc.)
            editor.on('change', function () {
                editor.save();
                autosave(editorId, editor.getContent());
            });

            // Sync before form submit
            editor.on('submit', function () {
                editor.save();
                clearAutosave(editorId);
            });

            // Handle paste — sanitize pasted content
            editor.on('PastePostProcess', function (e) {
                // TinyMCE already filters pasted content via paste_word_valid_elements
                // Additional server-side sanitization happens at render time (Phase 2)
            });

            // Register the editor in our registry
            editor.on('init', function () {
                editorRegistry[editorId] = editor;
                textarea.dataset.richEditorReady = 'true';

                // Dispatch a custom event so other scripts know the editor is ready
                var event = new CustomEvent('richeditor:ready', {
                    detail: { editorId: editorId, editor: editor },
                    bubbles: true
                });
                textarea.dispatchEvent(event);
            });

            // Handle editor removal
            editor.on('remove', function () {
                delete editorRegistry[editorId];
            });
        }
    };

    // If the textarea has an ID, use it; otherwise TinyMCE uses the target
    if (textarea.id) {
        config.selector = '#' + CSS.escape(textarea.id);
    } else {
        // Generate an ID if none exists
        textarea.id = 'tinymce_' + editorId;
        config.selector = '#' + CSS.escape(textarea.id);
    }

    tinymce.init(config);
}

/**
 * Returns the content CSS style for the editor.
 * Adapts to dark mode and provides consistent typography.
 * @param {boolean} darkMode - Whether dark mode is active.
 * @returns {string} CSS string for editor content area.
 */
function getContentStyle(darkMode) {
    var bg = darkMode ? '#1a1a2e' : '#fff';
    var color = darkMode ? '#e0e0e0' : '#333';
    var link = darkMode ? '#6c9ff2' : '#0066cc';

    return [
        'body {',
        '  background: ' + bg + ';',
        '  color: ' + color + ';',
        '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
        '  font-size: 15px;',
        '  line-height: 1.7;',
        '  padding: 16px;',
        '}',
        'a { color: ' + link + '; }',
        'img { max-width: 100%; height: auto; border-radius: 4px; }',
        'table { border-collapse: collapse; width: 100%; }',
        'td, th { border: 1px solid ' + (darkMode ? '#444' : '#ddd') + '; padding: 8px; }',
        'th { background: ' + (darkMode ? '#2a2a4e' : '#f5f5f5') + '; font-weight: bold; }',
        'blockquote {',
        '  border-left: 4px solid ' + (darkMode ? '#444' : '#ddd') + ';',
        '  margin: 1em 0;',
        '  padding: 0.5em 1em;',
        '  color: ' + (darkMode ? '#aaa' : '#666') + ';',
        '}',
        'pre {',
        '  background: ' + (darkMode ? '#0d0d1a' : '#f8f8f8') + ';',
        '  border: 1px solid ' + (darkMode ? '#333' : '#eee') + ';',
        '  border-radius: 4px;',
        '  padding: 12px;',
        '  overflow-x: auto;',
        '  font-family: "SF Mono", Monaco, Consolas, monospace;',
        '  font-size: 13px;',
        '}',
        'code {',
        '  background: ' + (darkMode ? '#0d0d1a' : '#f8f8f8') + ';',
        '  padding: 2px 6px;',
        '  border-radius: 3px;',
        '  font-family: "SF Mono", Monaco, Consolas, monospace;',
        '  font-size: 13px;',
        '}',
        'figure { margin: 1em 0; }',
        'figcaption { font-size: 13px; color: ' + (darkMode ? '#888' : '#999') + '; text-align: center; }',
        'video, iframe { max-width: 100%; border-radius: 4px; }',
        'hr { border: none; border-top: 1px solid ' + (darkMode ? '#444' : '#ddd') + '; margin: 2em 0; }',
        '.align-left { text-align: left; }',
        '.align-center { text-align: center; }',
        '.align-right { text-align: right; }',
        '.align-justify { text-align: justify; }'
    ].join('\n');
}

// ── Lazy load TinyMCE ──────────────────────────────

/**
 * Dynamically loads the TinyMCE script from CDN.
 * Only loads once per page, even with multiple editors.
 * @returns {Promise<void>} Resolves when TinyMCE is loaded.
 */
export function loadTinyMCE() {
    return new Promise(function (resolve, reject) {
        if (tinymceLoaded && typeof tinymce !== 'undefined') {
            resolve();
            return;
        }
        if (tinymceLoading) {
            pendingEditors.push(resolve);
            return;
        }
        tinymceLoading = true;

        var script = document.createElement('script');
        script.src = TINYMCE_CDN_URL;
        script.referrerPolicy = 'origin';
        script.async = true;

        script.onload = function () {
            tinymceLoaded = true;
            tinymceLoading = false;
            resolve();
            // Resolve any pending editors
            for (var i = 0; i < pendingEditors.length; i++) {
                pendingEditors[i]();
            }
            pendingEditors = [];
        };

        script.onerror = function () {
            tinymceLoading = false;
            showToast('Failed to load rich text editor. Please check your connection and refresh.', 'error');
            reject(new Error('Failed to load TinyMCE'));
        };

        document.head.appendChild(script);
    });
}

// ── Auto-initialization ────────────────────────────

/**
 * Scans the document for <textarea data-rich-editor> elements
 * and initializes TinyMCE on each one.
 */
export function autoInit() {
    var textareas = document.querySelectorAll('textarea[data-rich-editor]');
    if (textareas.length === 0) return;

    // Load TinyMCE once, then init all editors
    loadTinyMCE().then(function () {
        for (var i = 0; i < textareas.length; i++) {
            initEditor(textareas[i]);
        }
    }).catch(function (error) {
        console.error('RichEditor initialization failed:', error);
    });
}
