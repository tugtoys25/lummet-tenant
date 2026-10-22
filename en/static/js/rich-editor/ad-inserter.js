import { escapeEditorHtml, showToast } from "/static/js/rich-editor/utils.js";

// ── Internal link handler ──────────────────────────

/**
 * Configures the link button to support internal linking.
 * Adds an "Internal Link" option that lets editors search for pages,
 * news, reviews, and casinos to link to.
 * @param {Object} editor - The TinyMCE editor instance.
 */

    // ── Ad Inserter plugin ─────────────────────────────

export function configureAdInserter(editor) {
    editor.ui.registry.addButton('addinserter', {
        text: 'Ad',
        tooltip: 'Insert advertisement',
        onAction: function () {
            openAdInserterDialog(editor);
        }
    });

    // Convert markers → visual placeholders on load
    editor.on('BeforeSetContent', function (e) {
        if (e.content && typeof e.content === 'string') {
            e.content = markersToPlaceholders(e.content);
        }
    });

    // Convert visual placeholders → markers on save
    editor.on('GetContent', function (e) {
        if (e.content && typeof e.content === 'string') {
            e.content = placeholdersToMarkers(e.content);
        }
    });

    // Handle backspace/delete on selected placeholder
    editor.on('KeyDown', function (e) {
        var selected = editor.selection.getNode();
        if (selected && selected.classList && selected.classList.contains('ad-placeholder')) {
            if (e.keyCode === 8 || e.keyCode === 46) {
                e.preventDefault();
                selected.remove();
            }
        }
    });
}

function markersToPlaceholders(content) {
    return content.replace(
        /<!--\s*AD:([^>]+?)\s*-->/gi,
        function (match, identifier) {
            var id = identifier.trim();
            var label = id;

            if (id.toUpperCase() === 'AUTO') {
                label = 'Auto (system picks ad)';
            } else if (id.startsWith('component:')) {
                label = 'Component #' + id.slice('component:'.length);
            }

            return '<div ' +
                'data-ad-marker="' + escapeEditorAttr(id) + '" ' +
                'contenteditable="false" ' +
                'class="ad-placeholder" ' +
                'style="display:flex;align-items:center;gap:12px;' +
                'padding:14px 18px;margin:16px 0;' +
                'background:linear-gradient(135deg,#f0f4ff,#e0e7ff);' +
                'border:2px dashed #6366f1;border-radius:10px;' +
                'cursor:pointer;user-select:none;">' +
                '<span style="font-size:24px">📢</span>' +
                '<div style="flex:1">' +
                '<strong style="display:block;font-size:13px;color:#4338ca">Advertisement</strong>' +
                '<span style="font-size:12px;color:#6b7280">' + escapeEditorHtml(label) + '</span>' +
                '</div>' +
                '<span style="font-size:11px;color:#9ca3af">Click to select · Delete to remove</span>' +
                '</div>';
        }
    );
}

function placeholdersToMarkers(content) {
    var temp = document.createElement('div');
    temp.innerHTML = content;
    var placeholders = temp.querySelectorAll('.ad-placeholder[data-ad-marker]');
    for (var i = 0; i < placeholders.length; i++) {
        var marker = placeholders[i].getAttribute('data-ad-marker');
        var comment = document.createComment('AD:' + marker);
        placeholders[i].parentNode.replaceChild(comment, placeholders[i]);
    }
    return temp.innerHTML;
}

function escapeEditorAttr(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function openAdInserterDialog(editor) {
    var dialog = editor.windowManager.open({
        title: 'Insert Advertisement',
        size: 'large',
        body: {
            type: 'panel',
            items: [
                {
                    type: 'input',
                    name: 'search',
                    label: 'Search advertisements',
                    placeholder: 'Type to filter by name or slug...'
                },
                {
                    type: 'htmlpanel',
                    html: '<div id="ad-dialog-list" style="padding:12px;max-height:400px;overflow-y:auto">' +
                          '<div style="padding:20px;text-align:center;color:#999">Loading available ads...</div>' +
                          '</div>'
                },
                {
                    type: 'htmlpanel',
                    html: '<div style="padding:8px 12px;border-top:1px solid #e5e7eb;margin-top:8px">' +
                          '<strong style="font-size:12px;color:#374151">Quick insert:</strong><br>' +
                          '<button type="button" id="ad-insert-auto" style="margin-top:6px;padding:6px 14px;' +
                          'border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;cursor:pointer;font-size:13px">' +
                          'Insert Auto Marker</button>' +
                          '<span style="margin-left:8px;font-size:11px;color:#9ca3af">System picks the ad automatically</span>' +
                          '</div>'
                }
            ]
        },
        buttons: [
            { type: 'cancel', text: 'Close' }
        ],
        initialData: { search: '' }
    });

    fetchAvailableAds().then(function (ads) {
        renderAdDialogList(editor, ads, '', dialog);

        var searchInput = document.querySelector('.tox-textfield[name="search"]');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                renderAdDialogList(editor, ads, this.value, dialog);
            });
        }

        var autoBtn = document.getElementById('ad-insert-auto');
        if (autoBtn) {
            autoBtn.addEventListener('click', function () {
                editor.insertContent('\n<!--AD:AUTO-->\n');
                showToast('Auto ad marker inserted', 'success');
                dialog.close();
            });
        }
    }).catch(function () {
        var list = document.getElementById('ad-dialog-list');
        if (list) {
            list.innerHTML = '<div style="padding:20px;text-align:center;color:#e74c3c">' +
                'Could not load ads. Make sure ad components exist.' +
                '</div>';
        }
    });
}

function renderAdDialogList(editor, ads, searchQuery, dialog) {
    var container = document.getElementById('ad-dialog-list');
    if (!container) return;

    var filtered = ads;
    if (searchQuery && searchQuery.trim()) {
        var q = searchQuery.toLowerCase().trim();
        filtered = ads.filter(function (ad) {
            return (ad.name && ad.name.toLowerCase().indexOf(q) !== -1) ||
                   (ad.slug && ad.slug.toLowerCase().indexOf(q) !== -1);
        });
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#999">' +
            (ads.length === 0
                ? 'No ads found. Create ad components (type = "ad") in the ' +
                  '<a href="/en/admin/components" target="_blank">Components</a> page.'
                : 'No ads match your search.') +
            '</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
        var ad = filtered[i];
        var isActive = ad.status === 'active';
        var badgeColor = isActive ? '#22c55e' : '#a1a1aa';
        var badgeBg = isActive ? 'rgba(34,197,94,0.12)' : 'rgba(161,161,170,0.12)';
        var sourceIcon = ad.source === 'component' ? '🧩' : '⚙️';
        var marker = 'component:' + ad.id;

        html += '<div style="padding:14px;margin-bottom:10px;' +
            'border:1px solid #e5e7eb;border-radius:10px;background:#fff;">';

        html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
        html += '<div style="display:flex;align-items:center;gap:8px">';
        html += '<span style="font-size:20px">' + sourceIcon + '</span>';
        html += '<div>';
        html += '<strong style="font-size:14px;color:#111827;display:block">' +
            escapeEditorHtml(ad.name) + '</strong>';
        html += '<span style="font-size:12px;color:#6b7280">/' +
            escapeEditorHtml(ad.slug) + '</span>';
        html += '</div>';
        html += '</div>';
        html += '<span style="font-size:11px;padding:3px 10px;border-radius:999px;' +
            'background:' + badgeBg + ';color:' + badgeColor + '">' +
            (isActive ? 'Active' : 'Inactive') + '</span>';
        html += '</div>';

        if (ad.preview) {
            html += '<div style="padding:8px 10px;margin-bottom:10px;' +
                'background:#f9fafb;border-radius:6px;' +
                'font-size:11px;color:#9ca3af;max-height:60px;overflow:hidden;' +
                'border:1px solid #f3f4f6">' +
                escapeEditorHtml(ad.preview) +
                '</div>';
        }

        html += '<button type="button" ' +
            'data-ad-marker="' + escapeEditorAttr(marker) + '" ' +
            'data-ad-name="' + escapeEditorAttr(ad.name) + '" ' +
            'class="ad-insert-btn" ' +
            'style="width:100%;padding:8px;border:1px solid #6366f1;border-radius:6px;' +
            'background:#6366f1;color:#fff;cursor:pointer;font-size:13px;font-weight:600">' +
            'Insert at cursor</button>';

        html += '</div>';
    }

    container.innerHTML = html;

    var insertBtns = container.querySelectorAll('.ad-insert-btn');
    for (var j = 0; j < insertBtns.length; j++) {
        insertBtns[j].addEventListener('click', function () {
            var marker = this.getAttribute('data-ad-marker');
            var name = this.getAttribute('data-ad-name');
            editor.insertContent('\n<!--AD:' + marker + '-->\n');
            showToast('Ad inserted: ' + name, 'success');
            dialog.close();
        });
    }
}

async function fetchAvailableAds() {
    var ads = [];

    try {
        var res = await fetch('/api/v1/components/list?type=ad', { credentials: 'same-origin' });
        if (res.ok) {
            var data = await res.json();
            var components = data.components || [];
            for (var i = 0; i < components.length; i++) {
                ads.push({
                    id: components[i].id,
                    name: components[i].name,
                    slug: components[i].slug,
                    status: components[i].status,
                    source: 'component',
                    preview: (components[i].content || '').substring(0, 200)
                });
            }
        }
    } catch (e) {}

    try {
        var settingsRes = await fetch('/api/v1/settings', { credentials: 'same-origin' });
        if (settingsRes.ok) {
            var settingsData = await settingsRes.json();
            var settings = settingsData.settings || {};
            if (settings.news_inline_ad) {
                var isComponent = settings.news_inline_ad.startsWith('component:');
                ads.push({
                    id: 0,
                    name: isComponent
                        ? 'Fallback: ' + settings.news_inline_ad
                        : 'Fallback Ad (raw HTML)',
                    slug: isComponent ? settings.news_inline_ad.slice(10) : 'settings-fallback',
                    status: 'active',
                    source: 'settings',
                    preview: isComponent
                        ? 'Loads component: ' + settings.news_inline_ad.slice(10)
                        : settings.news_inline_ad.substring(0, 200)
                });
            }
        }
    } catch (e) {}

    return ads;
}
