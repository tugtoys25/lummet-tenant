// ============================================
// AI GENERATOR
// ============================================

function initAIGenerator() {
  const form = document.getElementById("aiForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("aiAlert");
    const outputEl = document.getElementById("aiOutput");
    const submitBtn = form.querySelector('button[type="submit"]');

    if (alertEl) alertEl.style.display = "none";
    if (outputEl) outputEl.value = "Generating... please wait.";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Generating...";
    }

    const formData = new FormData(form);
    const payload = {
      casino: formData.get("casino"),
      country: formData.get("country") || "Global",
      slug: formData.get("slug") || formData.get("casino").toLowerCase().replace(/\s+/g, "-"),
    };

    try {
      const res = await fetch("/en/api/v1/ai/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        if (outputEl) outputEl.value = data.content || "No content returned.";
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = "Review generated! Copy the content below.";
          alertEl.style.display = "block";
        }
      } else {
        if (outputEl) outputEl.value = "";
        if (alertEl) {
          alertEl.className = "alert alert--error";
          alertEl.textContent = data.error || "Generation failed";
          alertEl.style.display = "block";
        }
      }
    } catch {
      if (outputEl) outputEl.value = "";
      if (alertEl) {
        alertEl.className = "alert alert--error";
        alertEl.textContent = "Network error. Try again.";
        alertEl.style.display = "block";
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Generate Review";
      }
    }
  });
}


