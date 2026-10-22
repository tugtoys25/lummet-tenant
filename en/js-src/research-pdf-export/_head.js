// =====================================================
// RESEARCH PDF EXPORT
// Builds a branded, multi-page PDF from the JSON each research
// item page embeds in #research-pdf-data (see renderResearchItem
// in controllers.js) — entirely client-side via jsPDF, loaded
// from cdnjs. No server-side PDF generation: this Worker has no
// build step, so a Node PDF library can't be bundled into it;
// generating in the browser needs zero changes to the Worker.
//
// "Merge related research" works by fetching another research
// item's OWN page (same-origin, public, already rendered) and
// reading its #research-pdf-data block back out via DOMParser —
// no new API endpoint was added for this.
//
// Error handling: the export is broken into named stages so a
// failure reports WHERE it happened instead of a single generic
// "could not build the PDF" message. The primary item's own data
// (and the presence of jsPDF/AutoTable) are fatal if broken — the
// export can't meaningfully continue without them. Everything
// that touches OTHER data (a malformed table, a broken related
// research item) is treated as best-effort: log it and keep going
// so one bad table or one bad related item doesn't take down an
// otherwise-fine PDF.
// =====================================================

(function () {
