// ============================================
// RESEARCH CONTENT — visual section builder
// Replaces raw-JSON authoring with pick-a-type, fill-a-form
// cards, same pattern as wireSeoSectionBuilder/renderSeoSections
// used by countries/categories, adapted for research's own
// section types (see renderResearchSections in controllers.js —
// this UI produces exactly the JSON shape that renderer expects,
// the editor just never has to see or write that JSON directly).
// ============================================

const researchSectionState = { sections: [], editingItemId: null };

const RESEARCH_SECTION_TYPES = [
  "heading", "rich_text", "statistic", "timeline", "table",
  "source_citation", "fact_card", "faq", "internal_links",
  "research_reference", "dataset_table", "image"
];

const RESEARCH_SECTION_TYPE_LABELS = {
  heading: "Heading",
  rich_text: "Rich Text",
  statistic: "Statistic",
  timeline: "Timeline",
  table: "Table",
  source_citation: "Source Citation",
  fact_card: "Fact Card",
  faq: "FAQ",
  internal_links: "Internal Links",
  research_reference: "Research Reference",
  dataset_table: "Dataset Table",
  image: "Image"
};

// ---- shared caches (loaded once, reused by every section card) ----

let _researchAllItemsCache = null;
async function fetchResearchItemsCached(force = false) {
  if (_researchAllItemsCache && !force) return _researchAllItemsCache;
  try {
    const res = await fetch("/en/api/v1/research/list");
    const data = await res.json();
    _researchAllItemsCache = data.research || [];
  } catch { _researchAllItemsCache = []; }
  return _researchAllItemsCache;
}

let _researchAllDatasetsCache = null;
async function fetchResearchDatasetsCached(force = false) {
  if (_researchAllDatasetsCache && !force) return _researchAllDatasetsCache;
  try {
    const res = await fetch("/en/api/v1/research-datasets/list");
    const data = await res.json();
    _researchAllDatasetsCache = data.datasets || [];
  } catch { _researchAllDatasetsCache = []; }
  return _researchAllDatasetsCache;
}

async function fetchResearchDatasetVersionsFor(datasetId) {
  try {
    const res = await fetch(`/en/api/v1/research-datasets/versions?dataset_id=${datasetId}`);
    const data = await res.json();
    return data.versions || [];
  } catch { return []; }
}

// Every rich-text-capable textarea this builder renders gets an id
// in this shape so init/destroy can find exactly its own editors
// without touching any other page's RichEditor instances.
function researchEditorIdFor(sectionIndex, field) {
  return `research-sec-${sectionIndex}-${field}`;
}

function destroyResearchSectionEditors() {
  const root = document.getElementById("researchFormSections");
  if (!root || !window.RichEditor) return;
  root.querySelectorAll("textarea[data-editor-id]").forEach((ta) => {
    RichEditor.destroy(ta.dataset.editorId);
  });
}

function initResearchSectionEditors() {
  const root = document.getElementById("researchFormSections");
  if (!root || !window.RichEditor) return;
  root.querySelectorAll("textarea[data-rich-field]").forEach((ta) => {
    RichEditor.init(ta, { height: 220 });
  });
}

function researchEditorValue(sectionIndex, field, fallbackEl) {
  const editorId = researchEditorIdFor(sectionIndex, field);
  if (window.RichEditor && RichEditor.isReady(editorId)) return RichEditor.get(editorId);
  return fallbackEl ? fallbackEl.value : "";
}

