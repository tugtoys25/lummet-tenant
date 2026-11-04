// The page layouts an ordinary page can use (pages.template). Only names listed here are ever loaded, so a stored
// value can never pick an arbitrary file. Anything else (old rows, typos) renders with the standard layout.
export const PAGE_TEMPLATES = {
  "page.html": { label: "Standard", help: "Title, author line, date and content in the normal page width." },
  "page-wide.html": { label: "Wide", help: "Same as standard, but the content uses the full width. Good for tables and comparisons." },
  "page-landing.html": { label: "Landing", help: "Centred title and content only: no author line, no dates. For campaign and welcome pages." },
};
export const DEFAULT_PAGE_TEMPLATE = "page.html";
export const resolvePageTemplate = (name) => (Object.prototype.hasOwnProperty.call(PAGE_TEMPLATES, name) ? name : DEFAULT_PAGE_TEMPLATE);
