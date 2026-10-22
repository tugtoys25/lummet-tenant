import { escapeEditorHtml, showToast } from "/static/js/rich-editor/utils.js";

// ── Callout Box plugin ──────────────────────────────

/**
 * Registers the "Add Callout" button.
 * Opens a form to create a styled callout/info box with
 * title, text, background color, text color, and optional icon.
 * @param {Object} editor - The TinyMCE editor instance.
 */
export function configureCalloutBox(editor) {
    editor.ui.registry.addButton('calloutbox', {
        text: 'Callout',
        tooltip: 'Insert callout / info box',
        onAction: function () {
            openCalloutDialog(editor);
        }
    });
}

/**
 * Opens the callout box dialog.
 * @param {Object} editor - The TinyMCE editor instance.
 */
function openCalloutDialog(editor) {
    var selectedText = editor.selection.getContent({ format: 'text' });

    var presetColors = [
        { text: 'Blue (Info)', value: '#dbeafe' },
        { text: 'Green (Success)', value: '#d1fae5' },
        { text: 'Yellow (Warning)', value: '#fef3c7' },
        { text: 'Red (Error)', value: '#fee2e2' },
        { text: 'Purple (Tip)', value: '#ede9fe' },
        { text: 'Gray (Neutral)', value: '#f3f4f6' },
        { text: 'Dark', value: '#1f2937' },
        { text: 'Custom...', value: 'custom' }
    ];

    editor.windowManager.open({
        title: 'Insert Callout Box',
        size: 'normal',
        body: {
            type: 'panel',
            items: [
                {
                    type: 'input',
                    name: 'callouttitle',
                    label: 'Title (optional)',
                    placeholder: 'e.g., Important Notice'
                },
                {
                    type: 'textarea',
                    name: 'callouttext',
                    label: 'Content',
                    rows: 4,
                    placeholder: 'Enter the callout text...'
                },
                {
                    type: 'listbox',
                    name: 'bgcolor',
                    label: 'Background color',
                    items: presetColors
                },
                {
                    type: 'colorpicker',
                    name: 'custombg',
                    label: 'Custom background color'
                },
                {
                    type: 'listbox',
                    name: 'textcolor',
                    label: 'Text color',
                    items: [
                        { text: 'Dark', value: '#1f2937' },
                        { text: 'White', value: '#ffffff' },
                        { text: 'Blue', value: '#1e40af' },
                        { text: 'Green', value: '#065f46' },
                        { text: 'Red', value: '#991b1b' },
                        { text: 'Purple', value: '#5b21b6' },
                        { text: 'Gray', value: '#4b5563' }
                    ]
                },
                {
                    type: 'listbox',
                    name: 'icon',
                    label: 'Icon (optional)',
                    items: [
                        { text: 'No icon', value: '' },
                        { text: 'ℹ️ Info', value: 'ℹ️' },
                        { text: '✅ Success', value: '✅' },
                        { text: '⚠️ Warning', value: '⚠️' },
                        { text: '❌ Error', value: '❌' },
                        { text: '💡 Tip', value: '💡' },
                        { text: '🔥 Hot', value: '🔥' },
                        { text: '⭐ Featured', value: '⭐' },
                        { text: '🔒 Security', value: '🔒' },
                        { text: '💰 Bonus', value: '💰' }
                    ]
                },
                {
                    type: 'listbox',
                    name: 'borderradius',
                    label: 'Corner radius',
                    items: [
                        { text: 'Rounded (12px)', value: '12px' },
                        { text: 'Slightly rounded (8px)', value: '8px' },
                        { text: 'Sharp (0px)', value: '0px' },
                        { text: 'Pill (999px)', value: '999px' }
                    ]
                }
            ]
        },
        buttons: [
            { type: 'cancel', text: 'Cancel' },
            { type: 'submit', text: 'Insert', primary: true }
        ],
        initialData: {
            callouttitle: '',
            callouttext: selectedText || '',
            bgcolor: '#dbeafe',
            custombg: '#dbeafe',
            textcolor: '#1f2937',
            icon: 'ℹ️',
            borderradius: '12px'
        },
        onSubmit: function (api) {
            var data = api.getData();

            if (!data.callouttext.trim() && !data.callouttitle.trim()) {
                showToast('Please enter a title or content', 'error');
                return;
            }

            var bgColor = data.bgcolor === 'custom' ? data.custombg : data.bgcolor;
            var textColor = data.textcolor;
            var radius = data.borderradius || '12px';

            var iconHtml = data.icon
                ? '<span style="font-size:20px;margin-right:10px;flex-shrink:0">' + data.icon + '</span>'
                : '';

            var titleHtml = data.callouttitle
                ? '<strong style="display:block;margin-bottom:6px;font-size:15px">' + escapeEditorHtml(data.callouttitle) + '</strong>'
                : '';

            var html =
                '<div style="' +
                'display:flex;' +
                'align-items:flex-start;' +
                'padding:16px 20px;' +
                'margin:20px 0;' +
                'background:' + bgColor + ';' +
                'color:' + textColor + ';' +
                'border-radius:' + radius + ';' +
                'border:1px solid rgba(0,0,0,0.06);' +
                '">' +
                iconHtml +
                '<div style="flex:1">' +
                titleHtml +
                '<div style="font-size:14px;line-height:1.6">' + escapeEditorHtml(data.callouttext) + '</div>' +
                '</div>' +
                '</div>';

            editor.insertContent(html);
            showToast('Callout box inserted', 'success');
            api.close();
        }
    });
}
