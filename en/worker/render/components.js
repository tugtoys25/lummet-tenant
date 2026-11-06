// Renderer methods: Components, review blocks and dynamic SEO.
// Installed on Renderer.prototype by worker/render.js (see worker/render/install-methods.js).

export const componentsMethods = {

  // =====================================================
  // INCLUDE COMPONENTS
  // =====================================================
    async injectComponents(html, breadcrumbHtml = null, opts = {}) {
    const [header, footer, sidebar, breadcrumbs] = await Promise.all([
      this.loadTemplate("layout/header.html"),
      this.loadTemplate("layout/footer.html"),
      this.loadTemplate("layout/sidebar.html"),
      breadcrumbHtml !== null
        ? Promise.resolve(breadcrumbHtml)
        : this.loadTemplate("components/breadcrumbs.html"),
    ]);

    html = html.replace("{{HEADER}}", header);
    html = html.replace("{{FOOTER}}", footer);
    // Sidebar switched off in the dashboard: not drawn, and the page uses the full width.
    html = html.replace("{{SIDEBAR}}", opts.sidebar === false ? "" : sidebar);
    html = html.replace("{{BREADCRUMBS}}", breadcrumbs);

    return html;
  },

  async renderComponents(pageType, pageSlug, injectionPoint = null, ctx = null) {
    const { renderPageComponents } = await import("../component-engine.js");
    return await renderPageComponents(this, this.env.DB, pageType, pageSlug, injectionPoint, ctx);
  },

  async renderAllComponents(pageType, pageSlug, ctx = null) {
    const { renderAllInjectionPoints } = await import("../component-engine.js");
    return await renderAllInjectionPoints(this, this.env.DB, pageType, pageSlug, ctx);
  },

  async renderReviewBlocks(reviewSlug) {
    const { renderReviewBlocks } = await import("../component-engine.js");
    return await renderReviewBlocks(this, this.env.DB, reviewSlug);
  },

  async loadDynamicSeo(pageType, pageSlug) {
    const { loadSeoMeta } = await import("../component-engine.js");
    const { previewSeo } = await import("../site-profile/rows.js");
    const seo = previewSeo(await loadSeoMeta(this.env.DB, pageType, pageSlug), pageType, pageSlug, this.env.__preview?.rows);
    if (!seo) return {};
    return {
      seo_title: seo.title || "",
      seo_description: seo.description || "",
      canonical: seo.canonical || "",
      og_image: seo.og_image || "",
      seo_keywords: seo.keywords || "",
      seo_schema: seo.schema_json || "",
      seo_robots: seo.robots || "index, follow"
    };
  }
};
