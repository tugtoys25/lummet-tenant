  function drawSection(c, section) {
    switch (section.type) {
      case "heading":
        drawHeading(c, section.title || "", 15);
        return;

      case "rich_text":
      case "fact_card":
        if (section.title) drawHeading(c, section.title, 13);
        drawParagraphs(c, htmlToParagraphs(section.body));
        return;

      case "statistic": {
        ensureSpace(c, 22);
        const valueText = `${section.value ?? ""}${section.unit ? " " + section.unit : ""}`;
        c.doc.setFont("helvetica", "bold");
        c.doc.setFontSize(20);
        c.doc.setTextColor(30, 90, 200);
        c.doc.text(valueText, c.x, c.y + 6);
        c.y += 9;
        if (section.label) drawParagraphs(c, [section.label], { size: 10.5, color: [20, 20, 20] });
        if (section.context) drawParagraphs(c, [section.context], { size: 9, italic: true, color: [110, 110, 110] });
        c.y += 2;
        return;
      }

      case "timeline": {
        if (section.title) drawHeading(c, section.title, 13);
        (section.events || []).forEach((ev) => {
          drawParagraphs(c, [`${ev.date || ""} — ${ev.title || ""}`], { size: 10.5 });
          if (ev.description) drawParagraphs(c, [ev.description], { size: 9.5, color: [90, 90, 90] });
        });
        return;
      }

      case "table": {
        if (section.title) drawHeading(c, section.title, 13);
        const cols = Array.isArray(section.columns) ? section.columns : [];
        const rows = Array.isArray(section.rows) ? section.rows : [];
        if (cols.length && rows.length) tryAutoTable(c, cols, rows, section.caption);
        return;
      }

      case "dataset_table": {
        // The page's #research-pdf-data carries the section as authored
        // (dataset_id + version), not the dataset's resolved rows. A PDF
        // export has no server round-trip, so it can't resolve them
        // either; say so plainly rather than silently dropping it.
        if (section.title || section.caption) drawHeading(c, section.title || section.caption, 13);
        drawParagraphs(c, ["[Data table — view the live page for the current data: it updates independently of this PDF.]"], { italic: true, size: 9.5, color: [120, 120, 120] });
        return;
      }

      case "source_citation": {
        drawParagraphs(c, [section.body || ""], { size: 10 });
        if (section.source_label) drawParagraphs(c, [section.source_label], { size: 9, italic: true, color: [110, 110, 110] });
        return;
      }

      case "faq": {
        if (section.title) drawHeading(c, section.title, 13);
        (section.items || []).forEach((item) => {
          drawParagraphs(c, [item.q || ""], { size: 10.5 });
          const answerParas = htmlToParagraphs(item.a);
          drawParagraphs(c, answerParas.length ? answerParas : [String(item.a || "").replace(/<[^>]+>/g, "")], { size: 9.5, color: [80, 80, 80] });
        });
        return;
      }

      case "internal_links": {
        if (section.title) drawHeading(c, section.title, 12);
        (section.links || []).forEach((l) => drawParagraphs(c, [`${l.label || l.url} — ${l.url}`], { size: 9.5, color: [30, 90, 200] }));
        return;
      }

      case "research_reference": {
        if (section.mode === "snapshot" && section.snapshot_title) {
          drawHeading(c, section.snapshot_title, 12);
          if (section.snapshot_excerpt) drawParagraphs(c, [section.snapshot_excerpt], { size: 9.5, italic: true });
        }
        return;
      }

      default:
        return;
    }
  }

  function drawClaims(c, claims) {
    if (!claims || claims.length === 0) return;
    drawRule(c);
    drawHeading(c, "Key facts", 14);
    claims.forEach((claim) => {
      const badge = (claim.status || "").toUpperCase();
      drawParagraphs(c, [`[${badge}]  ${claim.claim_text}`], { size: 10 });
      if (claim.sources && claim.sources.length) {
        drawParagraphs(c, [claim.sources.map((s) => s.organisation).join(", ")], { size: 8.5, italic: true, color: [120, 120, 120] });
      }
    });
  }

  function drawSources(c, sources) {
    if (!sources || sources.length === 0) return;
    drawRule(c);
    drawHeading(c, "Sources", 14);
    sources.forEach((s, i) => {
      const line = `${i + 1}. ${s.organisation}${s.title ? " — " + s.title : ""}${s.url ? " — " + s.url : ""}`;
      drawParagraphs(c, [line], { size: 9 });
    });
  }

  // Cover/header portion of an item: type label, title, subtitle, meta,
  // excerpt, rule. Split out from the body (sections/claims/sources) so
  // the export flow can attribute a failure to the right stage.
  function drawItemCover(c, item) {
    const typeLabel = (item.type || "").toUpperCase();
    drawParagraphs(c, [typeLabel], { size: 9, color: [30, 90, 200] });
    drawHeading(c, item.title || "", 18);
    if (item.subtitle) drawParagraphs(c, [item.subtitle], { size: 11, italic: true, color: [90, 90, 90] });
    const meta = [item.country_name, item.last_verified_at ? "Last verified " + String(item.last_verified_at).slice(0, 10) : null].filter(Boolean).join("  ·  ");
    if (meta) drawParagraphs(c, [meta], { size: 8.5, color: [130, 130, 130] });
    if (item.excerpt) { c.y += 1; drawParagraphs(c, [item.excerpt], { size: 10.5, italic: true }); }
    drawRule(c);
  }

  function drawItemSections(c, item) {
    (item.sections || []).forEach((section) => drawSection(c, section));
  }

