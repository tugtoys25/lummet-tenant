  const PAGE_MARGIN = 15;
  const HEADER_H = 22;
  const FOOTER_H = 14;
  const LOGO_MAX_W = 32;
  const LOGO_MAX_H = 12;

  function pdfStageError(stage, error) {
    console.error(`[Research PDF] ${stage} failed`, error);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PDF export failed at ${stage}: ${message}`);
  }

  function getOwnPdfData() {
    const el = document.getElementById("research-pdf-data");
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (error) {
      console.error("[Research PDF] Primary research PDF data is invalid JSON", error);
      return null;
    }
  }

  function slugFromUrl(url) {
    try {
      const path = new URL(url, location.origin).pathname;
      const parts = path.split("/").filter(Boolean);
      return parts[parts.length - 1] || url;
    } catch {
      return url;
    }
  }

  // Fetches another research item's page and pulls its #research-pdf-data
  // block back out. Throws on any failure (bad HTTP status, missing data
  // block, invalid JSON) — callers decide whether that's fatal. For "merge
  // related research" it is NOT fatal: see load-related-research below.
  async function fetchRelatedPdfData(url) {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`Related research fetch failed: HTTP ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const el = doc.getElementById("research-pdf-data");
    if (!el) throw new Error("Related research page has no PDF data block");
    try {
      return JSON.parse(el.textContent);
    } catch (error) {
      throw new Error(`Related research PDF data is invalid JSON: ${error.message}`);
    }
  }

  // Converts a section's HTML body (from the rich-text editor) into
  // plain paragraphs a PDF can lay out — no HTML-to-PDF renderer is
  // used, so formatting (bold/links) is intentionally not preserved;
  // paragraph and list structure is.
  function htmlToParagraphs(html) {
    if (!html) return [];
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    const paragraphs = [];
    doc.body.querySelectorAll("p, li, h1, h2, h3, h4, blockquote").forEach((el) => {
      const text = el.textContent.replace(/\s+/g, " ").trim();
      if (text) paragraphs.push(el.tagName === "LI" ? "•  " + text : text);
    });
    if (paragraphs.length === 0) {
      const text = doc.body.textContent.replace(/\s+/g, " ").trim();
      if (text) paragraphs.push(text);
    }
    return paragraphs;
  }

  const SUPPORTED_LOGO_TYPES = { "image/png": "PNG", "image/jpeg": "JPEG", "image/jpg": "JPEG", "image/webp": "WEBP" };

  async function loadImageAsDataUrl(url) {
    if (!url) return null;
    try {
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) return null;
      const blob = await res.blob();
      // jsPDF's core addImage only supports PNG/JPEG/WEBP — a favicon
      // is frequently .ico or .svg, neither of which it can render;
      // returning null here (rather than a data URL it can't use) is
      // what keeps the logo optional instead of corrupting the header.
      if (!SUPPORTED_LOGO_TYPES[blob.type]) return null;
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return { dataUrl, format: SUPPORTED_LOGO_TYPES[blob.type] };
    } catch {
      return null;
    }
  }

