// =====================================================
// LEVELCASINO TEMPLATE ENGINE
// =====================================================
import { buildBreadcrumbSchema, renderBreadcrumbs } from "./breadcrumbs.js";
import { buildComplianceHtml, buildGaScript, buildGpwaScript, buildGpwaSeal, buildHomepageSectionsHtml, buildThemeCss } from "./site-settings.js";
import { expandIncludes, selectAssetSet } from "./render/assets.js";
import { getSiteContext } from "./site-context.js";
import { headerHeroTemplateVars } from "./header-hero.js";
import { installMethods } from "./render/install-methods.js";
import { variablesMethods } from "./render/variables.js";
import { componentsMethods } from "./render/components.js";
import { navigationMethods } from "./render/navigation.js";
import { seoMethods } from "./render/seo.js";

export { needsAdminAssets, selectAssetSet, expandIncludes } from "./render/assets.js";

export class Renderer {

  constructor(env, request = null) {
    this.env = env;
    this.request = request;
    this.country = request?.cf?.country || null;
    this.siteContext = null;
    // Per-request template cache. Templates are static assets that
    // don't change mid-render, but loadTemplate() used to hit
    // env.ASSETS.fetch() fresh every single call — once per
    // component, plus header/footer/sidebar/base on every page. A
    // page with, say, 8 components previously issued 8+ separate
    // asset fetches for potentially the same few template files.
    // Caching the in-flight promise (not just the resolved value)
    // also de-dupes concurrent calls for the same template now that
    // components render in parallel via Promise.all.
    this.templateCache = new Map();
  }

  async getSiteContext() {

  if (this.siteContext) {
    return this.siteContext;
  }

  this.siteContext =
    await getSiteContext(
      this.request,
      this.env
    );

  return this.siteContext;
}

  // =====================================================
  // LOAD TEMPLATE FILE
  // =====================================================
  async loadTemplate(name) {
    if (this.templateCache.has(name)) {
      return this.templateCache.get(name);
    }
    const promise = (async () => {
      const file = await this.env.ASSETS.fetch(
        new Request(`https://assets.local/templates/${name}`)
      );
      if (!file.ok) return null;
      return await expandIncludes(await file.text(), (n) => this.loadTemplate(n));
    })();
    this.templateCache.set(name, promise);
    return promise;
  }

  // =====================================================
  // FULL PAGE RENDER
  // =====================================================
  async render(pageTemplate, data = {}, schema = {}, breadcrumbs = []) {
    breadcrumbs = Array.isArray(breadcrumbs) ? breadcrumbs : [];

    // Page template, nav data, site context, and page-nav are all
    // independent of each other — fetch concurrently.
    let [
  page,
  navData,
  site,
  pagenavHtml
] = await Promise.all([
  this.loadTemplate(`pages/${pageTemplate}`),
  this.loadNavData(),
  this.getSiteContext(),
  this.loadPageNav()
]);

site.complianceHtml =
  buildComplianceHtml(site);

site.homepageSectionsHtml =
  buildHomepageSectionsHtml(
    site.homepageSections,
    site.origin
  );

site.themeCss =
  buildThemeCss(site);

site.gaScriptHtml =
  buildGaScript(site);

site.gpwaSealMarkup =
  buildGpwaSeal(site);

site.gpwaScriptMarkup =
  buildGpwaScript(site);

const allData = {
  ...navData,

  // --------------------------------------------------------
  // Page Navigation ({{{pagenav}}}) — contextual per-page nav,
  // distinct from header_nav/footer_*/mobile_nav above. Empty
  // string when there are no enabled PageNav items, so template
  // guards ({{#if pagenav}}) hide the section entirely.
  // --------------------------------------------------------
  pagenav: pagenavHtml,

  // --------------------------------------------------------
  // Tenant identity
  // --------------------------------------------------------
  site_name: site.siteName,
  site_url: site.origin,
  site_hostname: site.hostname,
  site_origin: site.origin,
  site_description: site.description,

  // --------------------------------------------------------
  // Tenant branding
  // --------------------------------------------------------
  site_logo: site.logoUrl,
  site_og_image: site.ogImageUrl,

  // --------------------------------------------------------
  // Tenant icons
  // --------------------------------------------------------
  site_favicon_96: site.favicon96Url,
  site_favicon_svg: site.faviconSvgUrl,
  site_favicon_ico: site.faviconIcoUrl,
  site_apple_touch_icon: site.appleTouchIconUrl,
  site_manifest: site.manifestUrl,

  // --------------------------------------------------------
  // Tenant hero
  // --------------------------------------------------------
  site_hero_enabled: site.heroEnabled,
  site_hero_image: site.heroImageUrl,
  site_hero_badge: site.heroBadge,
  site_hero_title: site.heroTitle,
  site_hero_subtitle: site.heroSubtitle,
  site_hero_description: site.heroDescription,
  site_hero_button_text: site.heroButtonText,
  site_hero_button_url: site.heroButtonUrl,
  site_hero_alignment: site.heroAlignment,
  site_hero_overlay: site.heroOverlay,
  // --------------------------------------------------------
  // Footer / compliance
  // --------------------------------------------------------
  footer_compliance: site.complianceHtml,
  footer_disclaimer: site.footerDisclaimer,
  footer_responsible_text: site.responsibleText,
  footer_responsible_url: site.responsibleUrl,
  footer_responsible_help_text: site.responsibleHelpText,
  footer_responsible_help_url: site.responsibleHelpUrl,
  footer_responsible_help_label: site.responsibleHelpLabel,

  // --------------------------------------------------------
  // GPWA verification (seal + script)
  // gpwa_seal_enabled / gpwa_script_enabled gate the {{#if}}
  // blocks in footer.html / base.html; the matching
  // {{{gpwa_*_html}}} only ever carries what the tenant admin
  // pasted into Settings → GPWA Verification. Both are empty
  // strings ("" = falsy) for any tenant that hasn't configured
  // GPWA, so the markup is absent, not just hidden.
  // --------------------------------------------------------
  gpwa_seal_enabled: site.gpwaSealMarkup ? true : false,
  gpwa_seal_html: site.gpwaSealMarkup,
  gpwa_script_enabled: site.gpwaScriptMarkup ? true : false,
  gpwa_script_html: site.gpwaScriptMarkup,

  homepage_sections_html: site.homepageSectionsHtml,

  // Header, announcement bar and hero (Dashboard > Header & Hero)
  ...headerHeroTemplateVars(site.headerHero),

  ga_script: site.gaScriptHtml,
  theme_css: site.themeCss,

theme_preset: site.themePreset,

theme_primary: site.themePrimary,
theme_secondary: site.themeSecondary,
theme_accent: site.themeAccent,

theme_background: site.themeBackground,
theme_surface: site.themeSurface,
theme_surface_alt: site.themeSurfaceAlt,

theme_text: site.themeText,
theme_text_muted: site.themeTextMuted,

theme_border: site.themeBorder,

theme_header_style: site.themeHeaderStyle,
theme_card_style: site.themeCardStyle,
theme_button_style: site.themeButtonStyle,
theme_layout_style: site.themeLayoutStyle,


  ...data
};

    page = this.replaceVariables(page, allData);

    // =====================================================
    // PARTIAL RESPONSE — progressive AJAX navigation
    // =====================================================
    // Returns only what client-side AJAX navigation needs to
    // replace <main id="mainContent"> and update <title>/meta
    // description — never a complete HTML document. At this
    // point `page` is already fully resolved (component-engine
    // placeholders like {{components_top}} were filled by
    // replaceVariables() above, since renderCategory/renderCasino/
    // etc. pass their rendered HTML in as ordinary `data` keys) —
    // so the expensive remainder of this method (base.html load,
    // banners, header/footer/sidebar injection, theme CSS) is
    // skipped entirely for partial requests, not just hidden from
    // the response.
    //
    // Title/description/canonical are parsed out of the SAME
    // buildSEO() output used for full-page requests below, so
    // there is exactly one source of truth for those values —
    // they are never recomputed independently.
    //
    // Returned as a JSON *string*, not an object, so every
    // existing `const html = await renderer.render(...); return
    // new Response(html, {...})` call site across controllers.js
    // continues to work unchanged.
    if (this.isPartialRequest()) {
      const seoPartial = await this.buildSEO(data);
      const titleMatch = seoPartial.match(/<title>([\s\S]*?)<\/title>/i);
      const descMatch = seoPartial.match(/<meta name="description" content="([\s\S]*?)">/i);
      const canonicalMatch = seoPartial.match(/<link rel="canonical" href="([\s\S]*?)">/i);
      const breadcrumbHtml = renderBreadcrumbs(breadcrumbs);

      return JSON.stringify({
        partial: true,
        html: breadcrumbHtml + page,
        title: titleMatch ? titleMatch[1] : site.siteName,
        metaDescription: descMatch ? descMatch[1] : "",
        canonical: canonicalMatch ? canonicalMatch[1] : null
      });
    }

    let [base, seo] = await Promise.all([
      this.loadTemplate("layout/base.html"),
      this.buildSEO(data),
    ]);
    base = selectAssetSet(base, this.getNormalizedPath());
    const schemas = [];

    schemas.push({
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": site.siteName,
  "url": site.origin,
  "logo": site.logoUrl
});

schemas.push({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": site.siteName,
  "url": site.origin
});
   
    if (schema) {
        schemas.push(schema);
    }

    if (breadcrumbs && breadcrumbs.length) {
      schemas.push(buildBreadcrumbSchema(breadcrumbs, site.origin));
    }

    const jsonld = this.buildSchemas(schemas);

    base = base.replace("{{SEO}}", seo);
    base = base.replace("{{SCHEMA}}", jsonld);
    base = base.replace("{{CONTENT}}", page);

    const breadcrumbHtml = renderBreadcrumbs(breadcrumbs);
    base = await this.injectComponents(base, breadcrumbHtml);

    // Load and inject active banners
    try {
      const country = data._geo_country || this.country || null;
      const allBanners = await this.loadActiveBanners(country);
      const topBanners = allBanners.filter(b => b.position === "top");
      const bottomBanners = allBanners.filter(b => b.position === "bottom");
      base = base.replace("{{BANNERS_TOP}}", topBanners.map(b => b.html).join(""));
      base = base.replace("{{BANNERS_BOTTOM}}", bottomBanners.map(b => b.html).join(""));
    } catch (e) {
      console.error("Banner loading failed:", e.message);
      base = base.replace("{{BANNERS_TOP}}", "");
      base = base.replace("{{BANNERS_BOTTOM}}", "");
    }

    // NOW do the final variable replacement with merged data
    base = this.replaceVariables(base, allData);

    return base;
  }
}

installMethods(Renderer, variablesMethods, componentsMethods, navigationMethods, seoMethods);
