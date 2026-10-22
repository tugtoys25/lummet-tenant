// ── TinyMCE toolbar configuration ─────────────────

/**
 * Builds the TinyMCE toolbar configuration.
 * This is the full publishing toolbar requested in the spec.
 * @returns {string} Toolbar button string.
 */
export function getToolbarConfig() {
    return [
        'undo redo',
        '|',
        'bold italic underline strikethrough',
        '|',
        'forecolor backcolor',
        '|',
        'fontsize select',
        '|',
        'blocks',
        '|',
        'alignleft aligncenter alignright alignjustify',
        '|',
        'bullist numlist outdent indent',
        '|',
        'table tabledelete tableprops tablecellprops tablerowprops tablemergecells tablesplitcells',
        '|',
        'image media link anchor lummetlink lummetpick',
        '|',
        'code blockquote hr calloutbox addinserter',
        '|',
        'sup subscript superscript',
        '|',
        'emoticons charmap',
        '|',
        'removeformat',
        '|',
        'fullscreen preview',
        '|',
        'wordcount',
        '|',
        'customsourcecode'
    ].join(' ');
}

/**
 * Builds the TinyMCE menu bar configuration.
 * @returns {Object} Menu bar configuration object.
 */
export function getMenuConfig() {
    return {
        file: { title: 'File', items: 'newdocument restoredraft | preview | print' },
        edit: { title: 'Edit', items: 'undo redo | cut copy paste pastetext | selectall | searchreplace' },
        view: { title: 'View', items: 'code | visualaid visualchars visualblocks | fullscreen' },
        insert: { title: 'Insert', items: 'image link media addcomment pageembed template codesample inserttable | charmap emoticons hr | anchor toc | nonbreaking' },
        format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript codeformat | formats blockformats fontformats fontsizes align lineheight | forecolor backcolor | removeformat' },
        tools: { title: 'Tools', items: 'spellchecker spellcheckerlanguage | wordcount | code' },
        table: { title: 'Table', items: 'inserttable | cell row column | tableprops deletetable' },
        help: { title: 'Help', items: 'help' }
    };
}

// ── TinyMCE plugin configuration ───────────────────

/**
 * Returns the list of TinyMCE plugins to load.
 * Only standard free plugins are included.
 * @returns {string} Space-separated plugin list.
 */
export function getPluginList() {
    return [
        'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
        'preview', 'anchor', 'searchreplace', 'visualblocks', 'code',
        'fullscreen', 'insertdatetime', 'media', 'table', 'help',
        'wordcount', 'emoticons', 'autosave', 'quickbars', 'codesample'
    ].join(' ');
}

// ── Custom source code dialog ──────────────────────

/**
 * Registers a custom "Source Code" button that opens a dialog
 * showing the raw HTML of the editor content, allowing direct editing.
 * @param {Object} editor - The TinyMCE editor instance.
 */
export function registerSourceCodePlugin(editor) {
    editor.ui.registry.addButton('customsourcecode', {
        text: 'HTML',
        tooltip: 'View / Edit Source Code',
        onAction: function () {
            var currentContent = editor.getContent();
            editor.windowManager.open({
                title: 'Source Code',
                size: 'large',
                body: {
                    type: 'panel',
                    items: [{
                        type: 'textarea',
                        name: 'sourcecode',
                        label: 'HTML Source',
                        rows: 20,
                        inputMode: 'text'
                    }]
                },
                buttons: [
                    {
                        type: 'cancel',
                        text: 'Cancel'
                    },
                    {
                        type: 'submit',
                        text: 'Apply',
                        primary: true
                    }
                ],
                initialData: {
                    sourcecode: currentContent
                },
                onSubmit: function (api) {
                    var data = api.getData();
                    editor.setContent(data.sourcecode);
                    api.close();
                }
            });
        }
    });
}
