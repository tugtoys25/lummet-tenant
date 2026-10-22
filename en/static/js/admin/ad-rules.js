// ============================================================
// AD RULES MANAGEMENT
// ============================================================

var adComponentsCache = [];

async function loadAdComponentsForRules() {
  try {
    var res = await fetch('/en/api/v1/components/list?type=ad', { credentials: 'same-origin' });
    if (!res.ok) return [];
    var data = await res.json();
    adComponentsCache = data.components || [];
    return adComponentsCache;
  } catch (e) {
    return [];
  }
}

async function loadAdRules() {
  var container = document.getElementById('adRulesContainer');
  if (!container) return;

  try {
    var [rulesRes, components] = await Promise.all([
      fetch('/en/api/v1/ad-rules/list', { credentials: 'same-origin' }),
      loadAdComponentsForRules()
    ]);

    if (!rulesRes.ok) throw new Error('Failed to load');
    var data = await rulesRes.json();
    var rules = data.rules || [];

    if (rules.length === 0) {
      container.innerHTML = '<p class="muted">No automatic ad rules configured. Click "Add Automatic Ad Rule" to create one.</p>';
      return;
    }

    container.innerHTML = rules.map(function(rule) {
      var isEnabled = rule.enabled === 1;
      var badgeClass = isEnabled ? 'ad-badge-active' : 'ad-badge-inactive';
      var badgeText = isEnabled ? 'Active' : 'Disabled';

      var placementLabel = {
        'after_paragraph': 'After paragraph ' + rule.position_value,
        'before_paragraph': 'Before paragraph ' + rule.position_value,
        'end_of_article': 'End of article',
        'before_article': 'Before article',
        'after_heading': 'After first heading',
        'before_heading': 'Before first heading',
        'after_first_image': 'After first image',
        'middle_of_article': 'Middle of article'
      }[rule.placement] || rule.placement;

      var repeatText = rule.repeat_interval > 0
        ? ' (repeat every ' + rule.repeat_interval + ' paragraphs, max ' + rule.max_appearances + ')'
        : '';

      var deviceLabel = rule.devices === 'all' ? 'All devices' : rule.devices;
      var countryLabel = rule.countries === 'all' ? 'All countries' : rule.countries;
      var pageLabel = rule.page_type === 'all' ? 'All pages' : rule.page_type;
      var scheduleLabel = '';
      if (rule.start_date || rule.end_date) {
        scheduleLabel = ' · Schedule: ' + (rule.start_date || '—') + ' to ' + (rule.end_date || '—');
      }

      return '<div class="ad-rule-card" data-rule-id="' + rule.id + '" style="padding:16px;border:1px solid var(--border);border-radius:8px;background:var(--surface)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
        '<div>' +
        '<strong>' + escapeHtmlSafe(rule.component_name || 'Unknown') + '</strong>' +
        ' <span class="' + badgeClass + '" style="font-size:11px;padding:2px 8px;border-radius:999px;margin-left:8px">' + badgeText + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
        '<button type="button" class="btn btn--secondary ad-rule-edit" data-id="' + rule.id + '">Edit</button>' +
        '<button type="button" class="btn btn--danger ad-rule-delete" data-id="' + rule.id + '">Delete</button>' +
        '</div>' +
        '</div>' +
        '<div style="font-size:13px;color:var(--gray);line-height:1.6">' +
        '<div>📍 ' + placementLabel + repeatText + '</div>' +
        '<div>📱 ' + deviceLabel + ' · 🌍 ' + countryLabel + ' · 📄 ' + pageLabel + '</div>' +
        '<div>⚡ Priority: ' + rule.priority + scheduleLabel + '</div>' +
        '</div>' +
        '</div>';
    }).join('');

    container.querySelectorAll('.ad-rule-edit').forEach(function(btn) {
      btn.addEventListener('click', function() { editAdRule(this.getAttribute('data-id')); });
    });
    container.querySelectorAll('.ad-rule-delete').forEach(function(btn) {
      btn.addEventListener('click', function() { deleteAdRule(this.getAttribute('data-id'), this); });
    });

  } catch (e) {
    container.innerHTML = '<p class="muted" style="color:red">Error loading ad rules.</p>';
  }
}

function openAdRuleModal(ruleId) {
  var modal = document.getElementById('adRuleModal');
  var title = document.getElementById('adRuleModalTitle');
  var componentSelect = document.getElementById('adRuleComponent');

  // Populate component dropdown
  componentSelect.innerHTML = adComponentsCache.map(function(c) {
    return '<option value="' + c.id + '">' + escapeHtmlSafe(c.name) + ' (/' + escapeHtmlSafe(c.slug) + ')</option>';
  }).join('');

  if (ruleId) {
    title.textContent = 'Edit Ad Rule';
    // Load rule data — fetch from the rules list
    fetch('/en/api/v1/ad-rules/list', { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var rule = (data.rules || []).find(function(r) { return r.id == ruleId; });
        if (!rule) return;
        document.getElementById('adRuleId').value = rule.id;
        document.getElementById('adRuleComponent').value = rule.component_id;
        document.getElementById('adRulePlacement').value = rule.placement;
        document.getElementById('adRulePosition').value = rule.position_value;
        document.getElementById('adRuleRepeatInterval').value = rule.repeat_interval;
        document.getElementById('adRuleMaxAppearances').value = rule.max_appearances;
        document.getElementById('adRuleDevices').value = rule.devices;
        document.getElementById('adRuleCountries').value = rule.countries;
        document.getElementById('adRulePageType').value = rule.page_type;
        document.getElementById('adRulePriority').value = rule.priority;
        document.getElementById('adRuleStartDate').value = rule.start_date || '';
        document.getElementById('adRuleEndDate').value = rule.end_date || '';
        document.getElementById('adRuleEnabled').checked = rule.enabled === 1;
      });
  } else {
    title.textContent = 'Create Ad Rule';
    document.getElementById('adRuleId').value = '';
    // Reset form
    document.getElementById('adRulePlacement').value = 'after_paragraph';
    document.getElementById('adRulePosition').value = '3';
    document.getElementById('adRuleRepeatInterval').value = '0';
    document.getElementById('adRuleMaxAppearances').value = '1';
    document.getElementById('adRuleDevices').value = 'all';
    document.getElementById('adRuleCountries').value = 'all';
    document.getElementById('adRulePageType').value = 'all';
    document.getElementById('adRulePriority').value = '100';
    document.getElementById('adRuleStartDate').value = '';
    document.getElementById('adRuleEndDate').value = '';
    document.getElementById('adRuleEnabled').checked = true;
  }

  modal.style.display = 'flex';
}

function closeAdRuleModal() {
  document.getElementById('adRuleModal').style.display = 'none';
}

function editAdRule(id) {
  openAdRuleModal(id);
}

async function saveAdRule() {
  var id = document.getElementById('adRuleId').value;
  var data = {
    component_id: parseInt(document.getElementById('adRuleComponent').value, 10),
    enabled: document.getElementById('adRuleEnabled').checked,
    placement: document.getElementById('adRulePlacement').value,
    position_value: parseInt(document.getElementById('adRulePosition').value, 10),
    repeat_interval: parseInt(document.getElementById('adRuleRepeatInterval').value, 10),
    max_appearances: parseInt(document.getElementById('adRuleMaxAppearances').value, 10),
    devices: document.getElementById('adRuleDevices').value,
    countries: document.getElementById('adRuleCountries').value,
    page_type: document.getElementById('adRulePageType').value,
    priority: parseInt(document.getElementById('adRulePriority').value, 10),
    start_date: document.getElementById('adRuleStartDate').value || null,
    end_date: document.getElementById('adRuleEndDate').value || null
  };

  if (!data.component_id) {
    alert('Please select an advertisement component');
    return;
  }

  var url = id ? '/en/api/v1/ad-rules/update' : '/en/api/v1/ad-rules/create';
  if (id) data.id = parseInt(id, 10);

  try {
    var res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    var result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to save');
    closeAdRuleModal();
    loadAdRules();
    if (typeof showNotification === 'function') {
      showNotification('Ad rule saved', 'success');
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

async function deleteAdRule(id, btn) {
  if (!confirm('Delete this ad rule?')) return;
  try {
    var res = await fetch('/en/api/v1/ad-rules/delete', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: parseInt(id, 10) })
    });
    if (!res.ok) throw new Error('Failed to delete');
    loadAdRules();
    if (typeof showNotification === 'function') {
      showNotification('Ad rule deleted', 'success');
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

function escapeHtmlSafe(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Wire up on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
  var addBtn = document.getElementById('addAdRuleBtn');
  if (addBtn) addBtn.addEventListener('click', function() { openAdRuleModal(null); });

  var saveBtn = document.getElementById('adRuleSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveAdRule);

  var cancelBtn = document.getElementById('adRuleCancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeAdRuleModal);

  loadAdRules();
});
