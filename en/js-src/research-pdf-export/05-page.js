  function setStatus(msg) {
    const el = document.getElementById("researchPdfStatus");
    if (el) el.textContent = msg || "";
  }

  function populateMergeOptions(ownData) {
    const panel = document.getElementById("researchMergePanel");
    const options = document.getElementById("researchMergeOptions");
    if (!panel || !options) return;

    const researchRelated = (ownData.related || []).filter((r) => r.type === "research_item");
    if (researchRelated.length === 0) return;

    options.innerHTML = researchRelated.map((r, i) => `
      <label class="research-merge-panel__option">
        <input type="checkbox" value="${r.url}" data-merge-related="${i}">
        ${r.label}
      </label>
    `).join("");
    panel.style.display = "";
  }

  document.addEventListener("DOMContentLoaded", () => {
    const ownData = getOwnPdfData();
    if (!ownData) return; // not a research item page (or its PDF data is invalid — logged above)

    populateMergeOptions(ownData);

    const downloadBtn = document.getElementById("researchDownloadPdfBtn");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", async () => {
        downloadBtn.disabled = true;
        setStatus("Building PDF…");
        try {
          const checked = Array.from(document.querySelectorAll("[data-merge-related]:checked"));
          const relatedRefs = checked.map((box) => ({ url: box.value, slug: slugFromUrl(box.value) }));

          const brand = {
            siteName: document.querySelector('meta[property="og:site_name"]')?.content || document.title.split("|").pop().trim() || "Level.casino",
            siteUrl: location.origin,
            generatedDate: new Date().toISOString().slice(0, 10),
            logo: null
          };
          try { brand.logo = await loadImageAsDataUrl(document.body.dataset.siteLogo || null); } catch { /* logo is optional */ }

          if (relatedRefs.length) setStatus("Fetching related research…");
          await exportResearchPdf(ownData, relatedRefs, brand);
          setStatus("");
        } catch (err) {
          console.error("[Research PDF] export failed", err);
          setStatus(
            err instanceof Error
              ? err.message
              : "Could not build the PDF."
          );
        } finally {
          downloadBtn.disabled = false;
        }
      });
    }

    const shareBtn = document.getElementById("researchShareBtn");
    if (shareBtn) {
      shareBtn.addEventListener("click", async () => {
        const shareData = { title: ownData.title, text: ownData.excerpt || ownData.title, url: location.href };
        if (navigator.share) {
          try { await navigator.share(shareData); } catch { /* user cancelled the share sheet — not an error */ }
          return;
        }
        try {
          await navigator.clipboard.writeText(location.href);
          setStatus("Link copied to clipboard");
          setTimeout(() => setStatus(""), 2500);
        } catch {
          setStatus(location.href);
        }
      });
    }
  });
