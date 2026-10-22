
/* =========================================================
SEO LANDING PAGES (Country Pages / Category Countries)
========================================================= */

const SEO_PAGE_SECTION_TYPES = ["rich_text", "heading", "image", "casino_grid", "casino_editorial", "casino_spotlights", "faq", "cta", "internal_links"];
const SEO_PAGE_FIELDS_BY_TYPE = {
  rich_text: ["title", "subtitle", "body"],
  heading: ["title"],
  image: ["title", "image_url"],
  casino_grid: ["title", "subtitle", "casino_ids"],
  casino_editorial: ["title", "casino_id", "body"],
  casino_spotlights: ["title", "subtitle", "spotlights"],
  faq: ["title", "faq_json"],
  cta: ["title", "body", "cta_url", "cta_label", "background"],
  internal_links: ["title", "links_json"]
};
const SEO_PAGE_FIELD_LABELS = {
  title: "Title", subtitle: "Subtitle", body: "Body (HTML allowed)",
  image_url: "Image URL", casino_ids: "Casinos (select one or more — type to search)",
  casino_id: "Casino (type to search)", faq_json: "FAQ items (pre-filled with common questions — edit freely, or edit as JSON)",
  cta_url: "Button URL", cta_label: "Button label", background: "Background (CSS color, optional)",
  links_json: 'Links JSON — e.g. [{"label":"...","url":"..."}]',
  spotlights: "Casino spotlights — add one or more casinos, each with its own write-up"
};

// Section data is stored under different keys than the form fields that edit
// it (e.g. the faq_json textarea edits section.items, not section.faq_json).
// Used both to read the current value into the field and, for FAQ, to decide
// when to show the default starter template instead of a blank textarea.
const SEO_SECTION_FIELD_TO_DATA_KEY = {
  faq_json: "items",
  links_json: "links",
  cta_url: "url",
  cta_label: "label"
};

const SEO_PAGE_DEFAULT_FAQ_ITEMS = [
  { q: "Is this casino safe and legal to play at?", a: "" },
  { q: "What payment methods are accepted?", a: "" },
  { q: "Is there a welcome bonus for new players?", a: "" },
  { q: "Can I play on mobile?", a: "" }
];

// State per page type, so Country Pages and Category Countries can
// share all this logic without colliding.
const seoPageState = {
  country_page: { selectedCasinos: [], sections: [], eligibleCasinos: [], countryCode: "", categorySlug: null, editingId: null },
  category_country: { selectedCasinos: [], sections: [], eligibleCasinos: [], countryCode: "", categorySlug: null, editingId: null },
  // Base hub pages (countries.js/categories.js content_json) — no
  // casino_mode/selectedCasinos concept here (the hub page already
  // lists its casinos automatically; these sections are extra
  // editorial content), so only sections + eligibleCasinos matter.
  country: { selectedCasinos: [], sections: [], eligibleCasinos: [], countryCode: "", categorySlug: null, editingId: null },
  category: { selectedCasinos: [], sections: [], eligibleCasinos: [], countryCode: "", categorySlug: null, editingId: null },
  // Payment method hub pages -- same "no casino_mode, just extra
  // editorial sections" shape as country/category above (the page
  // already lists its casinos via the casino_payment_methods join).
  payment_method: { selectedCasinos: [], sections: [], eligibleCasinos: [], countryCode: "", categorySlug: null, editingId: null }
};

function seoCasinoPickerOptionsHtml(prefix, selectedIds) {
  const state = seoPageState[prefix];
  const pool = (state.eligibleCasinos && state.eligibleCasinos.length) ? state.eligibleCasinos :
    state.selectedCasinos.map((c) => ({ id: c.casino_id, name: c.name || ("#" + c.casino_id) }));
  return pool.map((c) =>
    '<option value="' + c.id + '"' + (selectedIds.has(c.id) ? " selected" : "") + '>' + escapeHtml(c.name) + " (#" + c.id + ")" + '</option>'
  ).join("");
}

function seoSectionRowHtml(section, index, prefix) {
  const type = section.type || "rich_text";
  const fields = SEO_PAGE_FIELDS_BY_TYPE[type] || [];
  let html = '<div class="admin-card" data-section-row="' + index + '" style="border:1px solid var(--border-color,#333);border-radius:8px;padding:14px;margin-bottom:10px;">' +
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">' +
    '<select data-section-type>' + SEO_PAGE_SECTION_TYPES.map((t) => '<option value="' + t + '" ' + (t === type ? "selected" : "") + '>' + t + '</option>').join("") + '</select>' +
    '<label class="muted" style="white-space:nowrap;">Pos <input type="number" data-section-position value="' + (section.position ?? index) + '" style="width:55px;" /></label>' +
    '<button type="button" class="btn btn--ghost" data-remove-section style="margin-left:auto;">Remove</button>' +
    '</div>';
  fields.forEach((f) => {
    // Casino fields: a real picker sourced from this page's eligible/selected
    // casinos, instead of a text box where the editor has to already know
    // (or guess) the numeric casino ID.
    if (f === "casino_id") {
      const selId = section.casino_id ? Number(section.casino_id) : null;
      html += '<label>' + SEO_PAGE_FIELD_LABELS[f] + '</label>' +
        '<select data-section-field="casino_id"><option value="">— Select a casino —</option>' +
        seoCasinoPickerOptionsHtml(prefix, new Set(selId ? [selId] : [])) + '</select>';
      return;
    }
    if (f === "casino_ids") {
      const selIds = new Set((Array.isArray(section.casino_ids) ? section.casino_ids : []).map(Number));
      html += '<label>' + SEO_PAGE_FIELD_LABELS[f] + '</label>' +
        '<select data-section-field="casino_ids" multiple size="6" style="min-height:120px;">' +
        seoCasinoPickerOptionsHtml(prefix, selIds) + '</select>' +
        '<p class="muted" style="margin:4px 0 10px;">Ctrl/Cmd-click (or long-press on mobile) to select multiple. Type a letter to jump to a casino by name.</p>';
      return;
    }
    // casino_spotlights: several independent {casino_id, body} pairs
    // inside one section — unlike casino_editorial (always exactly
    // one casino) this is a repeatable list the editor builds up
    // with its own add/remove controls, wired in wireSeoSectionBuilder.
    if (f === "spotlights") {
      const spotlights = Array.isArray(section.spotlights) ? section.spotlights : [];
      const rows = spotlights.map((sp, j) => {
        const selId = sp.casino_id ? Number(sp.casino_id) : null;
        return '<div class="admin-card" data-spotlight-row="' + j + '" style="border:1px dashed var(--border-color,#333);border-radius:6px;padding:10px;margin-bottom:8px;">' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
            '<select data-spotlight-field="casino_id" style="flex:1;"><option value="">— Select a casino —</option>' +
              seoCasinoPickerOptionsHtml(prefix, new Set(selId ? [selId] : [])) +
            '</select>' +
            '<button type="button" class="btn btn--ghost" data-remove-spotlight>Remove</button>' +
          '</div>' +
          '<label style="margin-top:6px;">Write-up for this casino</label>' +
          '<textarea data-spotlight-field="body" rows="4">' + escapeHtml(sp.body || "") + '</textarea>' +
        '</div>';
      }).join("");
      html += '<label>' + SEO_PAGE_FIELD_LABELS[f] + '</label>' +
        '<div data-spotlights-container>' + rows + '</div>' +
        '<button type="button" class="btn btn--ghost" data-add-spotlight>+ Add casino spotlight</button>';
      return;
    }
    const dataKey = SEO_SECTION_FIELD_TO_DATA_KEY[f] || f;
    let raw = section[dataKey];
    // FAQ sections start pre-filled with common starter questions instead of
    // a blank textarea — the editor edits/replaces them rather than writing
    // JSON from scratch. Only applies while the section has no items yet.
    if (f === "faq_json" && (!Array.isArray(raw) || raw.length === 0)) raw = SEO_PAGE_DEFAULT_FAQ_ITEMS;
    const val = (raw !== undefined && raw !== null) ? (typeof raw === "object" ? JSON.stringify(raw, null, 2) : raw) : "";
    if (f === "body" || f === "faq_json" || f === "links_json") {
      html += '<label>' + SEO_PAGE_FIELD_LABELS[f] + '</label><textarea data-section-field="' + f + '" rows="' + (f === "body" ? 3 : 6) + '">' + escapeHtml(val) + '</textarea>';
    } else {
      html += '<label>' + SEO_PAGE_FIELD_LABELS[f] + '</label><input type="text" data-section-field="' + f + '" value="' + escapeHtml(val) + '" />';
    }
  });
  return html + '</div>';
}

// Section-builder root element IDs, keyed by state prefix. Started
// as a two-way ternary (country_page/category_country only); this
// map is what lets the same builder power the BASE country/category
// hub pages too ("country"/"category" prefixes, added alongside the
// countries.js/categories.js content_json fields) without touching
// the seo_pages-specific prefixes' behavior at all.
const SEO_SECTION_ROOT_IDS = {
  country_page: "countryPageSections",
  category_country: "categoryCountrySections",
  country: "countryFormSections",
  category: "categoryFormSections",
  payment_method: "pmFormSections"
};

function renderSeoSections(prefix) {
  const state = seoPageState[prefix];
  const root = document.getElementById(SEO_SECTION_ROOT_IDS[prefix]);
  if (!root) return;
  root.innerHTML = state.sections.map((s, i) => seoSectionRowHtml(s, i, prefix)).join("");
}

function syncSeoSectionsFromDom(prefix) {
  const state = seoPageState[prefix];
  const root = document.getElementById(SEO_SECTION_ROOT_IDS[prefix]);
  if (!root) return;
  const rows = Array.from(root.querySelectorAll("[data-section-row]"));
  state.sections = rows.map((row) => {
    const i = Number(row.dataset.sectionRow);
    const existing = state.sections[i] || {};
    const type = row.querySelector("[data-section-type]").value;
    const position = Number(row.querySelector("[data-section-position]").value) || 0;
    const section = { id: existing.id || ("s" + Date.now() + i), type, position };
    row.querySelectorAll("[data-section-field]").forEach((el) => {
      const key = el.dataset.sectionField;
      if (key === "casino_ids") {
        section.casino_ids = el.multiple ? Array.from(el.selectedOptions).map((o) => Number(o.value)).filter(Boolean) : [];
        return;
      }
      const val = el.value;
      if (key === "casino_id") section.casino_id = val ? Number(val) : null;
      else if (key === "faq_json") { try { section.items = val.trim() ? JSON.parse(val) : []; } catch (e) { section.items = []; } }
      else if (key === "links_json") { try { section.links = val.trim() ? JSON.parse(val) : []; } catch (e) { section.links = []; } }
      else if (key === "cta_url") section.url = val;
      else if (key === "cta_label") section.label = val;
      else section[key] = val;
    });
    // casino_spotlights: repeatable {casino_id, body} rows live in their
    // own container (data-spotlights-container / data-spotlight-row),
    // outside the generic data-section-field loop above, since each row
    // needs two paired values rather than one field = one value.
    const spotlightsContainer = row.querySelector("[data-spotlights-container]");
    if (spotlightsContainer) {
      section.spotlights = Array.from(spotlightsContainer.querySelectorAll("[data-spotlight-row]")).map((sRow) => {
        const casinoSel = sRow.querySelector("[data-spotlight-field='casino_id']");
        const bodyEl = sRow.querySelector("[data-spotlight-field='body']");
        return {
          casino_id: casinoSel && casinoSel.value ? Number(casinoSel.value) : null,
          body: bodyEl ? bodyEl.value : ""
        };
      });
    }
    return section;
  }).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function renderSeoCasinoAddOptions(prefix) {
  const state = seoPageState[prefix];
  const select = document.getElementById(prefix === "country_page" ? "countryPageCasinoAdd" : "categoryCountryCasinoAdd");
  if (!select) return;
  const selectedIds = new Set(state.selectedCasinos.map((c) => c.casino_id));
  select.innerHTML = '<option value="">Add a casino…</option>' +
    state.eligibleCasinos.filter((c) => !selectedIds.has(c.id)).map((c) =>
      '<option value="' + c.id + '" data-name="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>'
    ).join("");
}

function renderSeoCasinoSelected(prefix) {
  const state = seoPageState[prefix];
  const list = document.getElementById(prefix === "country_page" ? "countryPageCasinoSelected" : "categoryCountryCasinoSelected");
  if (!list) return;
  if (state.selectedCasinos.length === 0) {
    list.innerHTML = '<p class="muted">No casinos selected yet.</p>';
    return;
  }
  list.innerHTML = state.selectedCasinos.map((c, i) => {
    const known = state.eligibleCasinos.find((e) => e.id === c.casino_id);
    const name = known ? known.name : (c.name || ("#" + c.casino_id));
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-color,#333);" data-casino-row="' + i + '">' +
      '<span style="flex:1;">' + escapeHtml(name) + '</span>' +
      '<label class="muted" style="display:flex;align-items:center;gap:4px;"><input type="checkbox" data-featured ' + (c.is_featured ? "checked" : "") + ' /> Featured</label>' +
      '<input type="text" data-custom-label placeholder="Custom label" value="' + escapeHtml(c.custom_label || "") + '" style="width:140px;" />' +
      '<button type="button" class="btn btn--ghost" data-remove-casino>✕</button>' +
      '</div>';
  }).join("");
}

async function loadSeoEligibleCasinos(prefix) {
  const state = seoPageState[prefix];
  if (!state.countryCode) return;
  let url = "/en/api/v1/seo-pages/eligible-casinos?country_code=" + encodeURIComponent(state.countryCode);
  if (prefix === "category_country" && state.categorySlug) url += "&category_slug=" + encodeURIComponent(state.categorySlug);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  state.eligibleCasinos = data.casinos || [];
  renderSeoCasinoAddOptions(prefix);
  renderSeoCasinoSelected(prefix);
  // Section-level casino pickers (casino_grid / casino_editorial) are
  // rendered before this fetch resolves when opening an existing page for
  // edit — capture whatever's already been typed, then re-render the
  // section rows now that real casino names/IDs are available to pick from.
  syncSeoSectionsFromDom(prefix);
  renderSeoSections(prefix);
}

function updateSeoUrlPreview(prefix) {
  const state = seoPageState[prefix];
  if (prefix === "country_page") {
    const preview = document.getElementById("countryPageUrlPreview");
    const slug = document.getElementById("countryPageSlug").value || "{slug}";
    if (preview) preview.textContent = "URL: /en/country/" + (state.countryCode || "{code}") + "/" + slug;
  } else {
    const preview = document.getElementById("categoryCountryUrlPreview");
    if (preview) preview.textContent = "URL: /en/category/" + (state.categorySlug || "{category}") + "/" + (state.countryCode || "{code}");
  }
}

function wireSeoCountrySearch(prefix, searchId, resultsId, hiddenId) {
  const search = document.getElementById(searchId);
  const results = document.getElementById(resultsId);
  const hidden = document.getElementById(hiddenId);
  if (!search) return;
  let timer;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    const q = search.value.trim();
    if (!q) { results.style.display = "none"; return; }
    timer = setTimeout(async () => {
      const res = await fetch("/en/api/v1/seo-pages/countries-search?q=" + encodeURIComponent(q));
      const data = await res.json().catch(() => ({}));
      const items = data.countries || [];
      if (!items.length) { results.style.display = "none"; return; }
      results.innerHTML = items.map((c) =>
        '<div data-code="' + c.code + '" data-name="' + escapeHtml(c.name) + '" style="padding:8px 12px;cursor:pointer;">' + escapeHtml(c.name) + ' (' + c.code + ')</div>'
      ).join("");
      results.style.display = "block";
    }, 250);
  });
  results.addEventListener("click", (e) => {
    const item = e.target.closest("[data-code]");
    if (!item) return;
    seoPageState[prefix].countryCode = item.dataset.code;
    hidden.value = item.dataset.code;
    search.value = item.dataset.name + " (" + item.dataset.code + ")";
    results.style.display = "none";
    updateSeoUrlPreview(prefix);
    loadSeoEligibleCasinos(prefix);
  });
}

function wireSeoCasinoPicker(prefix, addSelectId, addBtnId, selectedListId) {
  const addSelect = document.getElementById(addSelectId);
  const addBtn = document.getElementById(addBtnId);
  const selectedList = document.getElementById(selectedListId);
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const id = Number(addSelect.value);
      if (!id) return;
      const opt = addSelect.options[addSelect.selectedIndex];
      seoPageState[prefix].selectedCasinos.push({ casino_id: id, name: opt.dataset.name, is_featured: false, custom_label: null });
      renderSeoCasinoAddOptions(prefix);
      renderSeoCasinoSelected(prefix);
    });
  }
  if (selectedList) {
    selectedList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove-casino]");
      if (!btn) return;
      const row = btn.closest("[data-casino-row]");
      seoPageState[prefix].selectedCasinos.splice(Number(row.dataset.casinoRow), 1);
      renderSeoCasinoAddOptions(prefix);
      renderSeoCasinoSelected(prefix);
    });
    selectedList.addEventListener("change", (e) => {
      const row = e.target.closest("[data-casino-row]");
      if (!row) return;
      const i = Number(row.dataset.casinoRow);
      if (e.target.matches("[data-featured]")) seoPageState[prefix].selectedCasinos[i].is_featured = e.target.checked;
    });
    selectedList.addEventListener("input", (e) => {
      const row = e.target.closest("[data-casino-row]");
      if (!row) return;
      const i = Number(row.dataset.casinoRow);
      if (e.target.matches("[data-custom-label]")) seoPageState[prefix].selectedCasinos[i].custom_label = e.target.value;
    });
  }
}

function wireSeoSectionBuilder(prefix, rootId, addBtnId) {
  const root = document.getElementById(rootId);
  const addBtn = document.getElementById(addBtnId);
  if (!root) return;
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      seoPageState[prefix].sections.push({ id: "s" + Date.now(), type: "rich_text", position: seoPageState[prefix].sections.length, title: "", body: "" });
      renderSeoSections(prefix);
    });
  }
  root.addEventListener("click", (e) => {
    // casino_spotlights add/remove — checked before data-remove-section
    // since a spotlight row also sits inside a [data-section-row], and
    // its own remove button must not be mistaken for removing the
    // whole section.
    const addSpotlightBtn = e.target.closest("[data-add-spotlight]");
    if (addSpotlightBtn) {
      syncSeoSectionsFromDom(prefix);
      const sectionRow = addSpotlightBtn.closest("[data-section-row]");
      const section = seoPageState[prefix].sections[Number(sectionRow.dataset.sectionRow)];
      if (!Array.isArray(section.spotlights)) section.spotlights = [];
      section.spotlights.push({ casino_id: null, body: "" });
      renderSeoSections(prefix);
      return;
    }
    const removeSpotlightBtn = e.target.closest("[data-remove-spotlight]");
    if (removeSpotlightBtn) {
      syncSeoSectionsFromDom(prefix);
      const sectionRow = removeSpotlightBtn.closest("[data-section-row]");
      const spotlightRow = removeSpotlightBtn.closest("[data-spotlight-row]");
      const section = seoPageState[prefix].sections[Number(sectionRow.dataset.sectionRow)];
      section.spotlights.splice(Number(spotlightRow.dataset.spotlightRow), 1);
      renderSeoSections(prefix);
      return;
    }
    const btn = e.target.closest("[data-remove-section]");
    if (!btn) return;
    syncSeoSectionsFromDom(prefix);
    const row = btn.closest("[data-section-row]");
    seoPageState[prefix].sections.splice(Number(row.dataset.sectionRow), 1);
    renderSeoSections(prefix);
  });
  root.addEventListener("change", (e) => {
    if (!e.target.matches("[data-section-type]")) return;
    syncSeoSectionsFromDom(prefix);
    renderSeoSections(prefix);
  });
}

async function loadSeoAuthorsInto(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  try {
    const res = await fetch("/en/api/v1/authors/list");
    const data = await res.json().catch(() => ({}));
    const authorsList = data.authors || [];
    authorsList.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.name;
      select.appendChild(opt);
    });
  } catch (e) { /* non-fatal */ }
}

/* ---------------- COUNTRY PAGES ---------------- */

