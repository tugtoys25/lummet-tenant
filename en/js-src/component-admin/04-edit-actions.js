// ── Component Edit ──

async function editComponent(id) {
  try {
    const res = await fetch(`/en/api/v1/component/get?id=${id}`);
    const data = await res.json();
    if (!data.success) return;
    const c = data.component;
    const form = document.getElementById("componentForm");
    form.querySelector("[name='id']").value = c.id;
    form.querySelector("[name='name']").value = c.name;
    form.querySelector("[name='slug']").value = c.slug || "";
    form.querySelector("[name='type']").value = c.type;
    form.querySelector("[name='title']").value = c.title || "";
    form.querySelector("[name='content']").value = c.content || "";
    form.querySelector("[name='settings_json']").value = c.settings_json || "";
    form.querySelector("[name='status']").value = c.status || "active";
    document.getElementById("componentSubmitBtn").textContent = "Update Component";
    document.getElementById("componentCancelEdit").style.display = "";
    form.dispatchEvent(new Event("component:loaded"));
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load component"); }
}

function cancelComponentEdit() {
  const form = document.getElementById("componentForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("componentSubmitBtn").textContent = "Create Component";
  document.getElementById("componentCancelEdit").style.display = "none";
}


// ── Assignment Edit ──

async function editAssignment(id, currentPosition, currentInjection) {
  const position = prompt("Enter new position (lower renders first):", currentPosition);
  if (position === null) return;
  const injection = prompt("Injection point (top, content_top, content_bottom, bottom, sidebar):", currentInjection || "content_bottom");
  if (injection === null) return;
  try {
    await fetch("/en/api/v1/components/update-assignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, position: parseInt(position) || 0, injection_point: injection })
    });
    loadAssignments();
  } catch { alert("Network error"); }
}

// ── SEO Edit ──

async function editSeoMeta(pageType, pageSlug) {
  try {
    const res = await fetch(`/en/api/v1/seo/get?page_type=${pageType}&page_slug=${pageSlug}`);
    const data = await res.json();
    if (!data.seo) return;
    const s = data.seo;
    const form = document.getElementById("seoForm");
    form.querySelector("[name='id']").value = s.id;
    form.querySelector("[name='page_type']").value = s.page_type;
    form.querySelector("[name='page_slug']").value = s.page_slug;
    form.querySelector("[name='title']").value = s.title || "";
    form.querySelector("[name='description']").value = s.description || "";
    form.querySelector("[name='keywords']").value = s.keywords || "";
    form.querySelector("[name='canonical']").value = s.canonical || "";
    form.querySelector("[name='og_image']").value = s.og_image || "";
    form.querySelector("[name='robots']").value = s.robots || "index, follow";
    form.querySelector("[name='schema_json']").value = s.schema_json || "";
    document.getElementById("seoSubmitBtn").textContent = "Update SEO Meta";
    document.getElementById("seoCancelEdit").style.display = "";
    window.scrollTo({ top: form.offsetTop - 100, behavior: "smooth" });
  } catch { alert("Failed to load SEO meta"); }
}

function cancelSeoEdit() {
  const form = document.getElementById("seoForm");
  form.reset();
  form.querySelector("[name='id']").value = "";
  document.getElementById("seoSubmitBtn").textContent = "Save SEO Meta";
  document.getElementById("seoCancelEdit").style.display = "none";
}

