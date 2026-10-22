import { showToast } from "/static/js/rich-editor/utils.js";

// Page and item pickers: the same search dialog the rest of the dashboard uses
// (casinos, reviews, news, research, authors, updates, sportsbooks, affiliate
// partners, custom content, pages and pictures), right in the toolbar.
export function configureContentPickers(editor) {
    function picker() {
        if (!window.LummetPicker || typeof window.LummetPicker.open !== 'function') {
            editor.notificationManager.open({ text: 'The picker is not available on this page.', type: 'warning', timeout: 3000 });
            return null;
        }
        return window.LummetPicker;
    }
    editor.ui.registry.addButton('lummetlink', {
        icon: 'link',
        text: 'Page',
        tooltip: 'Link to a page, review, casino, news or other item',
        onAction: function () {
            var p = picker(); if (!p) return;
            var selected = editor.selection.getContent({ format: 'text' });
            p.open({ mode: 'link' }, function (pick) {
                if (!pick || !pick.url) return;
                var label = selected || pick.title || pick.url;
                editor.insertContent('<a href="' + escapeAttr(pick.url) + '">' + escapeText(label) + '</a>');
            });
        }
    });
    editor.ui.registry.addButton('lummetpick', {
        icon: 'plus',
        text: 'Items',
        tooltip: 'Pick items (casinos, news, research, authors, pictures...) and add them here',
        onAction: function () {
            var p = picker(); if (!p) return;
            p.open({}, function (pick) {
                if (!pick) return false;
                var card = pick.card || {};
                if (pick.source === 'media') {
                    var src = card.image || card.url;
                    if (!src) return false;
                    editor.insertContent('<figure><img src="' + escapeAttr(src) + '" alt="' + escapeAttr(pick.label || '') + '"></figure>');
                    return true;
                }
                var url = card.url || '';
                var label = pick.label || card.title || url;
                if (!url) { editor.insertContent('<p>' + escapeText(label) + '</p>'); return true; }
                var img = card.image ? '<img src="' + escapeAttr(card.image) + '" alt="" width="64" height="64"> ' : '';
                editor.insertContent('<p class="pick-link">' + img + '<a href="' + escapeAttr(url) + '">' + escapeText(label) + '</a></p>');
                return true;
            });
        }
    });
}

function escapeText(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function escapeAttr(t) { return escapeText(t).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

export function configureInternalLink(editor) {
    // The default TinyMCE link dialog already supports URL entry.
    // We add a custom button for internal link search.
    editor.ui.registry.addButton('internallink', {
        text: 'Internal',
        tooltip: 'Insert internal link',
        icon: 'link',
        onAction: function () {
            openInternalLinkDialog(editor);
        }
    });
}

/**
 * Opens the internal link dialog.
 * Searches existing content (news, reviews, pages, casinos) via API
 * and inserts a link to the selected item.
 * @param {Object} editor - The TinyMCE editor instance.
 */
function openInternalLinkDialog(editor) {
    var selectedText = editor.selection.getContent({ format: 'text' });

    editor.windowManager.open({
        title: 'Insert Internal Link',
        size: 'normal',
        body: {
            type: 'panel',
            items: [
                {
                    type: 'input',
                    name: 'search',
                    label: 'Search for content (title or slug)',
                    placeholder: 'e.g., best-casinos or review title'
                },
                {
                    type: 'listbox',
                    name: 'linktarget',
                    label: 'Search results',
                    items: [{
                        text: 'Type to search...',
                        value: ''
                    }]
                },
                {
                    type: 'input',
                    name: 'linktext',
                    label: 'Link text',
                    value: selectedText || ''
                },
                {
                    type: 'checkbox',
                    name: 'newtab',
                    label: 'Open in new tab',
                    checked: false
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
                text: 'Insert Link',
                primary: true
            }
        ],
        initialData: {
            search: '',
            linktarget: '',
            linktext: selectedText || '',
            newtab: false
        },
        onTabChange: function (api, details) {
            // Handle tab changes if needed
        },
        onChange: function (api) {
            var data = api.getData();
            if (data.search && data.search.length > 2) {
                searchInternalLinks(data.search).then(function (results) {
                    var items = results.map(function (r) {
                        return { text: r.title + ' (' + r.type + ')', value: r.url };
                    });
                    if (items.length === 0) {
                        items = [{ text: 'No results found', value: '' }];
                    }
                    api.redial({
                        title: 'Insert Internal Link',
                        size: 'normal',
                        body: {
                            type: 'panel',
                            items: [
                                {
                                    type: 'input',
                                    name: 'search',
                                    label: 'Search for content (title or slug)',
                                    value: data.search
                                },
                                {
                                    type: 'listbox',
                                    name: 'linktarget',
                                    label: 'Search results',
                                    items: items
                                },
                                {
                                    type: 'input',
                                    name: 'linktext',
                                    label: 'Link text',
                                    value: data.linktext
                                },
                                {
                                    type: 'checkbox',
                                    name: 'newtab',
                                    label: 'Open in new tab',
                                    checked: data.newtab
                                }
                            ]
                        },
                        buttons: [
                            { type: 'cancel', text: 'Cancel' },
                            { type: 'submit', text: 'Insert Link', primary: true }
                        ],
                        initialData: data,
                        onSubmit: function (submitApi) {
                            handleInternalLinkSubmit(editor, submitApi);
                        }
                    });
                });
            }
        },
        onSubmit: function (api) {
            handleInternalLinkSubmit(editor, api);
        }
    });
}

/**
 * Handles the internal link dialog submission.
 * @param {Object} editor - The TinyMCE editor instance.
 * @param {Object} api - The dialog API.
 */
function handleInternalLinkSubmit(editor, api) {
    var data = api.getData();
    if (!data.linktarget) {
        showToast('Please select a link target', 'error');
        return;
    }
    var text = data.linktext || data.linktarget;
    var target = data.newtab ? ' target="_blank" rel="noopener"' : '';
    var html = '<a href="' + data.linktarget + '"' + target + '>' + text + '</a>';
    editor.insertContent(html);
    api.close();
}

/**
 * Searches for internal content to link to.
 * Queries existing public API endpoints for news, reviews, pages, casinos.
 * @param {string} query - The search query.
 * @returns {Promise<Array>} Array of {title, url, type} results.
 */
async function searchInternalLinks(query) {
    var results = [];
    var endpoints = [
        { url: '/en/api/v1/public/news/list?q=' + encodeURIComponent(query), type: 'news' },
        { url: '/en/api/v1/public/casinos/list?q=' + encodeURIComponent(query), type: 'casino' },
        { url: '/en/api/v1/public/pages/list?q=' + encodeURIComponent(query), type: 'page' }
    ];

    var promises = endpoints.map(function (ep) {
        return fetch(ep.url, { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success && data.items) {
                    return data.items.map(function (item) {
                        return {
                            title: item.title || item.name || item.slug,
                            url: '/' + ep.type + '/' + (item.slug || item.id),
                            type: ep.type
                        };
                    });
                }
                return [];
            })
            .catch(function () { return []; });
    });

    var allResults = await Promise.all(promises);
    for (var i = 0; i < allResults.length; i++) {
        results = results.concat(allResults[i]);
    }
    return results.slice(0, 20);
}
