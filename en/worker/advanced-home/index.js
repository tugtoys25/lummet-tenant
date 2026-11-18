// Advanced Homepage: the public entry point used by the homepage controller, and the helpers used by the dashboard API.
// The default homepage is never touched: this only runs when the mode is "on", and any failure falls back to the default page.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import { headerHeroTemplateVars } from "../header-hero.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { KEYS, parseAdvancedHome, cleanConfig, defaultConfig } from "./schema.js";
import { loadAdvancedHomeData } from "./data.js";
import { renderAdvancedHome } from "./render.js";
import { themeCss, themeClass } from "./theme-css.js";

export { KEYS, parseAdvancedHome, cleanConfig, defaultConfig };

async function readValues(env) {
  const draft = env && env.__preview && env.__preview.settings;
  const res = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${KEYS.map(() => "?").join(",")})`).bind(...KEYS).all();
  const values = {};
  for (const r of res.results || []) values[r.key] = r.value;
  if (draft) for (const k of KEYS) if (Object.prototype.hasOwnProperty.call(draft, k)) values[k] = draft[k] == null ? "" : String(draft[k]);
  return values;
}

export async function advancedHomeState(env) {
  const values = await readValues(env);
  return { ...parseAdvancedHome(values), hasPrevious: Boolean(values.advhome_previous) };
}

// Renders the whole homepage (header, footer and theme included) with the given config. Used for the live page and for the preview.
export async function renderAdvancedHomePage(request, env, config) {
  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const [allComponents, dynamicSeo, data] = await Promise.all([
    renderer.renderAllComponents("homepage", "homepage"),
    renderer.loadDynamicSeo("homepage", "homepage"),
    loadAdvancedHomeData(env, request, config),
  ]);
  // Hero: the site hero (Header & Hero, restyled by Hero Studio) is used when the site has one and the choice is not "own".
  const siteHasHero = Boolean(headerHeroTemplateVars(site.headerHero).hh_hero);
  const useSiteHero = config.options.heroSource !== "own" && siteHasHero;
  const out = renderAdvancedHome(config, data, { siteName: site.siteName, siteHero: useSiteHero });
  const schema = {
    "@context": "https://schema.org", "@type": "WebSite", url: site.origin, name: site.siteName,
    description: site.description || "Expert casino reviews, exclusive bonuses, and real player data.",
    publisher: { "@type": "Organization", name: site.siteName, logo: { "@type": "ImageObject", url: site.logoUrl } },
  };
  return renderer.render("home-advanced.html", {
    seo_title: dynamicSeo.seo_title || site.title || `${site.siteName} — Expert Casino Reviews & Bonuses`,
    seo_description: dynamicSeo.seo_description || site.description || "Expert casino reviews, exclusive bonuses, and real player data for casinos worldwide.",
    seo_keywords: dynamicSeo.seo_keywords || "",
    canonical: dynamicSeo.canonical || site.url("/en"),
    og_image: dynamicSeo.og_image || "",
    ah_html: out.main, ah_newsletter: out.newsletter,
    ah_site_hero: useSiteHero, ah_builder: config.options.builder,
    ah_theme: Boolean(themeClass(config.options.theme)), ah_theme_class: themeClass(config.options.theme), ah_theme_css: themeCss(config.options.theme),
    components_top: allComponents.top, components_content_top: allComponents.content_top,
    components_content_bottom: allComponents.content_bottom, components_bottom: allComponents.bottom, components_sidebar: allComponents.sidebar,
  }, schema, buildBreadcrumbs("home"));
}

// Called first by the homepage controller. Returns null (= use the default homepage) unless the mode is on and rendering works.
export async function advancedHomeIfOn(request, env) {
  try {
    const values = await readValues(env);
    if (values.advhome_mode !== "on") return null;
    const { config } = parseAdvancedHome(values);
    return await renderAdvancedHomePage(request, env, config);
  } catch (err) {
    console.error("advanced-home fell back to the default homepage:", err && err.message ? err.message : err);
    return null;
  }
}
