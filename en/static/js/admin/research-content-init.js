// ---- one-click templates ----

function insertResearchTemplate(templateName) {
  syncResearchSectionsFromDom();
  const templates = {
    country_report: [
      { ...researchDefaultSectionFor("heading"), title: "Regulatory Framework" },
      { ...researchDefaultSectionFor("rich_text"), body: "<p>Describe the licensing framework here.</p>" },
      { ...researchDefaultSectionFor("statistic"), label: "Gambling tax rate", unit: "%" },
      { ...researchDefaultSectionFor("timeline") },
      { ...researchDefaultSectionFor("table") }
    ],
    regulator_profile: [
      { ...researchDefaultSectionFor("heading"), title: "Overview" },
      { ...researchDefaultSectionFor("rich_text") },
      { ...researchDefaultSectionFor("fact_card"), title: "Responsibilities" },
      { ...researchDefaultSectionFor("faq") }
    ],
    sourced_claim: [
      { ...researchDefaultSectionFor("rich_text") },
      { ...researchDefaultSectionFor("source_citation") }
    ],
    report_composition: [
      { ...researchDefaultSectionFor("heading"), title: "Executive Summary" },
      { ...researchDefaultSectionFor("rich_text") },
      { ...researchDefaultSectionFor("research_reference") },
      { ...researchDefaultSectionFor("dataset_table") }
    ]
  };
  const toAdd = templates[templateName];
  if (!toAdd) return;
  researchSectionState.sections.push(...toAdd);
  renderResearchFormSections();
}


function initResearchForm() {
  const form = document.getElementById("researchForm");
  if (!form) return;

  populateResearchDropdowns();
  wireResearchSectionBuilder();
  renderResearchFormSections();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("researchFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);

    syncResearchSectionsFromDom();
    const contentJson = { sections: researchSectionState.sections };

    const isEdit = form.dataset.editMode === "true";
    const endpoint = isEdit ? "/en/api/v1/research/update" : "/en/api/v1/research/create";
    const payload = {
      id: formData.get("id") ? parseInt(formData.get("id")) : undefined,
      type: formData.get("type"),
      slug: formData.get("slug"),
      title: formData.get("title"),
      subtitle: formData.get("subtitle") || null,
      excerpt: formData.get("excerpt") || null,
      country_id: formData.get("country_id") || null,
      author_id: formData.get("author_id") || null,
      content_json: contentJson,
      seo_title: formData.get("seo_title") || null,
      seo_description: formData.get("seo_description") || null,
      seo_keywords: formData.get("seo_keywords") || null,
      canonical_url: formData.get("canonical_url") || null,
      status: formData.get("status") || "draft",
      published: formData.get("published") === "1" ? 1 : 0,
      robots: formData.get("robots") || "index,follow",
      featured: formData.get("featured") === "1" ? 1 : 0,
      last_verified_at: formData.get("last_verified_at") || null,
      next_review_at: formData.get("next_review_at") || null,
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = isEdit ? "Research item updated!" : "Research item created!";
          alertEl.style.display = "block";
        }
        cancelResearchEdit();
        loadResearchTable();
      } else {
        if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = data.error || "Failed"; alertEl.style.display = "block"; }
      }
    } catch {
      if (alertEl) { alertEl.className = "alert alert--error"; alertEl.textContent = "Network error"; alertEl.style.display = "block"; }
    }
  });
}

