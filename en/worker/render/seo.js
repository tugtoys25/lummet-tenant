// Renderer methods: HTML escaping, SEO meta and schema.org output.
// Installed on Renderer.prototype by worker/render.js (see worker/render/install-methods.js).

export const seoMethods = {

  // =====================================================
// BUILD SEO
// =====================================================

escapeHtml(str = "") {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
},

  async buildSEO(data = {}) {
  const site = await this.getSiteContext();

  const title =
    data.seo_title ||
    `${site.siteName} — Expert Casino Reviews`;

  const description =
    this.escapeHtml(
      data.seo_description || ""
    );

  const canonical =
    data.canonical ||
    site.url(
      new URL(
        this.request.url
      ).pathname
    );

  const ogImage =
    data.og_image ||
    site.ogImageUrl;

  // Defaults to "website" so every existing page (homepage, casino,
  // country, static pages, etc.) keeps its current behavior. Callers
  // that need a different type (e.g. News Article pages) pass og_type.
  const ogType = this.escapeHtml(data.og_type || "website");

  // Optional — only rendered when the caller supplies them (e.g. when
  // the real dimensions of the selected image are known).
  const ogImageWidthTag = data.og_image_width
    ? `<meta property="og:image:width" content="${this.escapeHtml(String(data.og_image_width))}">\n`
    : "";
  const ogImageHeightTag = data.og_image_height
    ? `<meta property="og:image:height" content="${this.escapeHtml(String(data.og_image_height))}">\n`
    : "";
  const ogImageAltTag = data.og_image_alt
    ? `<meta property="og:image:alt" content="${this.escapeHtml(data.og_image_alt)}">\n`
    : "";

  const robots = this.escapeHtml(data.robots || "index, follow");

  const keywords = this.escapeHtml(data.seo_keywords || "");
  const keywordsTag = keywords
    ? `<meta name="keywords" content="${keywords}">\n`
    : "";

  return `
<title>${this.escapeHtml(title)}</title>
<meta name="description" content="${description}">
${keywordsTag}<meta name="robots" content="${robots}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${this.escapeHtml(site.siteName)}">
<meta property="og:locale" content="en_US">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${this.escapeHtml(title)}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${ogImage}">
${ogImageWidthTag}${ogImageHeightTag}${ogImageAltTag}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:url" content="${canonical}">
<meta name="twitter:title" content="${this.escapeHtml(title)}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${ogImage}">
<meta name="theme-color" content="#0f172a">
<meta name="apple-mobile-web-app-title" content="${this.escapeHtml(site.siteName)}">
<meta name="application-name" content="${this.escapeHtml(site.siteName)}">
<link rel="mask-icon" href="${site.faviconSvgUrl}" color="#0f172a">
`;
},

  // =====================================================
  // JSON-LD
  // =====================================================
  buildSchemas(schemas = []) {
  return schemas
    .filter(Boolean)
    .map(schema => `
<script type="application/ld+json">
${JSON.stringify(schema).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")}
</script>
`)
    .join("\n");
}
};
