  function drawHeaderFooter(doc, brand) {
    const pageCount = doc.internal.getNumberOfPages();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);

      doc.setDrawColor(230, 230, 230);
      doc.line(PAGE_MARGIN, PAGE_MARGIN + HEADER_H - 6, pageW - PAGE_MARGIN, PAGE_MARGIN + HEADER_H - 6);
      if (brand.logo) {
        try { doc.addImage(brand.logo.dataUrl, brand.logo.format, PAGE_MARGIN, PAGE_MARGIN - 2, LOGO_MAX_W, LOGO_MAX_H, undefined, "FAST"); } catch { /* skip logo on failure */ }
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(20, 20, 20);
      doc.text(brand.siteName || "Level.casino", brand.logo ? PAGE_MARGIN + LOGO_MAX_W + 4 : PAGE_MARGIN, PAGE_MARGIN + 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text("Independent research", brand.logo ? PAGE_MARGIN + LOGO_MAX_W + 4 : PAGE_MARGIN, PAGE_MARGIN + 9);

      const footerY = pageH - PAGE_MARGIN - 6;
      doc.setDrawColor(230, 230, 230);
      doc.line(PAGE_MARGIN, footerY - 4, pageW - PAGE_MARGIN, footerY - 4);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(140, 140, 140);
      doc.text(`Generated ${brand.generatedDate} from ${brand.siteUrl} — content may have changed since. Page ${i} of ${pageCount}`, PAGE_MARGIN, footerY);
    }
  }

  // Top-level export. `primaryItem` is the research item the page belongs
  // to — its data is treated as authoritative and any failure to render
  // it is fatal (thrown, with the failing stage in the message).
  // `relatedRefs` are the checked "merge related research" checkboxes
  // (each { url, slug }) — fetching AND rendering each one is best-effort:
  // a broken related item is skipped and logged, never fatal.
  async function exportResearchPdf(primaryItem, relatedRefs, brand) {
    let stage = "initialization";

    try {
      stage = "parse-data";
      if (!primaryItem || typeof primaryItem !== "object") {
        throw new Error("Research PDF data is invalid JSON");
      }

      stage = "load-jspdf";
      if (!window.jspdf || !window.jspdf.jsPDF) {
        throw new Error("PDF library jsPDF is unavailable");
      }

      stage = "load-autotable";
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      // Check the actual doc instance, not window.jspdf.jsPDF.API — this is
      // the authoritative check because it's the exact object tryAutoTable()
      // calls later. How the plugin attaches (API prototype vs. per-instance)
      // can vary by version/loading mode, so checking the instance is what
      // keeps this check and the later "no autoTable" fallback from
      // contradicting each other.
      if (typeof doc.autoTable !== "function") {
        throw new Error("PDF table plugin AutoTable is unavailable");
      }

      stage = "load-related-research";
      const relatedItems = [];
      for (const ref of relatedRefs) {
        try {
          const related = await fetchRelatedPdfData(ref.url);
          if (related) relatedItems.push(related);
        } catch (error) {
          console.warn("[Research PDF] Skipping related research item", { slug: ref.slug, error });
        }
      }

      const c = makeCursor(doc);

      stage = "build-cover";
      c.y = c.top;
      drawItemCover(c, primaryItem);

      stage = "build-sections";
      drawItemSections(c, primaryItem);

      stage = "build-claims";
      drawClaims(c, primaryItem.claims);

      stage = "build-sources";
      drawSources(c, primaryItem.sources);

      stage = "build-related";
      relatedItems.forEach((item) => {
        try {
          doc.addPage();
          c.y = c.top;
          drawItemCover(c, item);
          drawItemSections(c, item);
          drawClaims(c, item.claims);
          drawSources(c, item.sources);
        } catch (error) {
          console.warn("[Research PDF] Skipping related research item — failed to render", { slug: item.slug, error });
        }
      });

      drawHeaderFooter(doc, brand);

      stage = "save";
      const filename = (primaryItem.slug || "research") + (relatedItems.length > 0 ? "-and-related" : "") + ".pdf";
      doc.save(filename);
    } catch (error) {
      pdfStageError(stage, error);
    }
  }

