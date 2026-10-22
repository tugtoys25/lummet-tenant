  function makeCursor(doc) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    return {
      doc, pageW, pageH,
      contentW: pageW - PAGE_MARGIN * 2,
      top: PAGE_MARGIN + HEADER_H,
      bottom: pageH - PAGE_MARGIN - FOOTER_H,
      x: PAGE_MARGIN,
      y: PAGE_MARGIN + HEADER_H
    };
  }

  function ensureSpace(c, needed) {
    if (c.y + needed > c.bottom) {
      c.doc.addPage();
      c.y = c.top;
    }
  }

  function drawHeading(c, text, size) {
    ensureSpace(c, size * 0.6 + 4);
    c.doc.setFont("helvetica", "bold");
    c.doc.setFontSize(size);
    c.doc.setTextColor(20, 20, 20);
    c.doc.text(text, c.x, c.y);
    c.y += size * 0.6 + 3;
  }

  function drawParagraphs(c, paragraphs, opts) {
    opts = opts || {};
    c.doc.setFont("helvetica", opts.italic ? "italic" : "normal");
    c.doc.setFontSize(opts.size || 10.5);
    c.doc.setTextColor(...(opts.color || [40, 40, 40]));
    paragraphs.forEach((p) => {
      const lines = c.doc.splitTextToSize(p, c.contentW);
      const lineH = (opts.size || 10.5) * 0.42;
      lines.forEach((line) => {
        ensureSpace(c, lineH + 1);
        c.doc.text(line, c.x, c.y);
        c.y += lineH;
      });
      c.y += 1.5; // paragraph gap
    });
  }

  function drawRule(c) {
    ensureSpace(c, 4);
    c.doc.setDrawColor(220, 220, 220);
    c.doc.line(c.x, c.y, c.x + c.contentW, c.y);
    c.y += 5;
  }

  // Normalizes arbitrary row data into the array-of-cells shape AutoTable
  // expects. Authored table rows aren't guaranteed to be arrays (older
  // content, hand-edited JSON, etc. can leave them as objects or scalars) —
  // this is what stops that from throwing deep inside AutoTable.
  function normalizeTableRows(columns, rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => {
      if (Array.isArray(row)) return row;

      if (row && typeof row === "object") {
        return columns.map((column) => {
          const key =
            typeof column === "string"
              ? column
              : column?.key ?? column?.field ?? column?.name;

          return key && row[key] != null
            ? String(row[key])
            : "—";
        });
      }

      return [String(row ?? "—")];
    });
  }

  // Plain-text rendering of a table — used both when the AutoTable plugin
  // isn't available at all, and as the per-table fallback when a specific
  // table's data breaks AutoTable. Includes the title, column names and
  // row values so nothing is silently dropped.
  function drawTableAsText(c, columns, rows, caption) {
    if (caption) drawParagraphs(c, [caption], { italic: true, size: 9.5 });
    if (columns.length) {
      drawParagraphs(c, [columns.map((col) => (typeof col === "string" ? col : col?.label || col?.name || col?.key || "")).join("  |  ")], { size: 9, italic: true });
    }
    normalizeTableRows(columns, rows).forEach((row) => {
      const line = columns.map((col, i) => {
        const label = typeof col === "string" ? col : col?.label || col?.name || col?.key || `Col ${i + 1}`;
        return `${label}: ${row[i] ?? "—"}`;
      }).join("  |  ");
      drawParagraphs(c, [line], { size: 9 });
    });
  }

  function tryAutoTable(c, columns, rows, caption) {
    if (typeof c.doc.autoTable !== "function") {
      // Defensive fallback: no autoTable plugin loaded (e.g. CDN blocked)
      // — render a plain readable list instead of failing the whole PDF.
      // In normal operation this shouldn't happen: exportResearchPdf
      // verifies the plugin up front and fails loudly if it's missing.
      drawTableAsText(c, columns, rows, caption);
      return;
    }

    try {
      const normalizedRows = normalizeTableRows(columns, rows);
      ensureSpace(c, 20);
      if (caption) drawParagraphs(c, [caption], { italic: true, size: 9.5 });
      c.doc.autoTable({
        startY: c.y,
        margin: { left: c.x, right: PAGE_MARGIN, top: c.top, bottom: c.pageH - c.bottom },
        head: [columns],
        body: normalizedRows,
        styles: { fontSize: 9, cellPadding: 2.2 },
        headStyles: { fillColor: [235, 235, 240], textColor: [30, 30, 30], fontStyle: "bold" },
        theme: "grid"
      });
      c.y = c.doc.lastAutoTable.finalY + 6;
    } catch (error) {
      // A single malformed table must not abort the whole PDF — fall back
      // to a plain-text rendering of the same data and keep going.
      console.error("[Research PDF] table rendering failed", error);
      drawTableAsText(c, columns, rows, caption);
    }
  }

