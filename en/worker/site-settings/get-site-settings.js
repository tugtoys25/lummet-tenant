import { getAllSettings } from "../database/settings.js";
import { parseHeaderHero } from "../header-hero.js";
import {
  getCached,
  setCached
} from "../cache.js";
import { DEFAULTS } from "./defaults.js";
import { resolveUrl } from "./manifest.js";
import { parseHomepageSections, parseJson } from "./helpers.js";

// ------------------------------------------------------------
// Load all tenant site settings
// ------------------------------------------------------------

export async function getSiteSettings(db, origin, env = null) {

  let values = {};

if (db) {

  const hostname =
    new URL(origin).hostname.toLowerCase();

  const cacheKey =
    `site-settings:${hostname}`;

  if (env) {
    values = await getCached(
      env,
      cacheKey
    );
  }

  if (!values) {

    values =
      await getAllSettings(db);

    if (env) {
      await setCached(
        env,
        cacheKey,
        values,
        600
      );
    }
  }
}

  const compliance = parseJson(
    values.footer_compliance,
    DEFAULTS.compliance
  );

  const safeCompliance = Array.isArray(compliance)
    ? compliance
        .filter(item => item && item.image)
        .map(item => ({
          image: resolveUrl(
            item.image,
            origin,
            ""
          ),
          url: resolveUrl(
            item.url,
            origin,
            ""
          ),
          alt: String(item.alt || "Compliance")
        }))
        .filter(item => item.image)
    : DEFAULTS.compliance;

  return {
    logoUrl: resolveUrl(
      values.site_logo,
      origin,
      DEFAULTS.logo
    ),

    ogImageUrl: resolveUrl(
      values.site_og_image,
      origin,
      DEFAULTS.ogImage
    ),

    siteName:
  values.site_name ||
  "",

title:
  values.site_title ||
  "",

description:
  values.site_description ||
  "",
    favicon96Url: resolveUrl(
      values.site_favicon_96,
      origin,
      DEFAULTS.favicon96
    ),

    faviconSvgUrl: resolveUrl(
      values.site_favicon_svg,
      origin,
      DEFAULTS.faviconSvg
    ),

    faviconIcoUrl: resolveUrl(
      values.site_favicon_ico,
      origin,
      DEFAULTS.faviconIco
    ),

    appleTouchIconUrl: resolveUrl(
      values.site_apple_touch_icon,
      origin,
      DEFAULTS.appleTouchIcon
    ),
    manifestUrl:
  new URL("/site.webmanifest", origin).href,

pwaIcon192Url: resolveUrl(
  values.site_pwa_icon_192,
  origin,
  ""
),

pwaIcon512Url: resolveUrl(
  values.site_pwa_icon_512,
  origin,
  ""
),

siteShortName:
  values.site_short_name ||
  values.site_name ||
  "",

manifestStartUrl:
  values.site_manifest_start_url ||
  "/en/",

manifestScope:
  values.site_manifest_scope ||
  "/",

manifestDisplay:
  values.site_manifest_display ||
  "standalone",


    heroEnabled:
  values.site_hero_enabled !== "false",

heroImageUrl: resolveUrl(
  values.site_hero_image,
  origin,
  ""
),

heroBadge:
  values.site_hero_badge ||
  "Find Your Perfect Casino",

heroTitle:
  values.site_hero_title ||
  "Find Your Perfect Casino",

heroSubtitle:
  values.site_hero_subtitle ||
  "Expert reviews, exclusive bonuses, and real player data for {{casino_count}}+ casinos worldwide.",

heroDescription:
  values.site_hero_description ||
  "",

heroButtonText:
  values.site_hero_button_text ||
  "Browse Casinos",

heroButtonUrl:
  values.site_hero_button_url ||
  "/en/casino",

heroAlignment:
  values.site_hero_alignment ||
  "center",

heroOverlay:
  values.site_hero_overlay !== "false",

    // Header, announcement bar and hero, validated (worker/header-hero.js)
    headerHero: parseHeaderHero(values),


    // ========================================================
    // THEME
    // ========================================================

    themePreset:
      values.theme_preset ||
      DEFAULTS.themePreset,

    themePrimary:
      values.theme_primary ||
      DEFAULTS.themePrimary,

    themePrimaryHover:
      values.theme_primary_hover ||
      DEFAULTS.themePrimaryHover,

    themeSecondary:
      values.theme_secondary ||
      DEFAULTS.themeSecondary,

    themeSecondaryHover:
      values.theme_secondary_hover ||
      DEFAULTS.themeSecondaryHover,

    themeAccent:
      values.theme_accent ||
      DEFAULTS.themeAccent,

    themeBackground:
      values.theme_background ||
      DEFAULTS.themeBackground,

    themeSurface:
      values.theme_surface ||
      DEFAULTS.themeSurface,

    themeSurfaceAlt:
      values.theme_surface_alt ||
      DEFAULTS.themeSurfaceAlt,

    themeText:
      values.theme_text ||
      DEFAULTS.themeText,

    themeTextMuted:
      values.theme_text_muted ||
      DEFAULTS.themeTextMuted,

    themeBorder:
      values.theme_border ||
      DEFAULTS.themeBorder,

    themeButtonText:
      values.theme_button_text ||
      DEFAULTS.themeButtonText,

    themeHeaderBackground:
      values.theme_header_background ||
      DEFAULTS.themeHeaderBackground,

    themeFooterBackground:
      values.theme_footer_background ||
      DEFAULTS.themeFooterBackground,

    themeCardRadius:
      values.theme_card_radius ||
      DEFAULTS.themeCardRadius,

    themeButtonRadius:
      values.theme_button_radius ||
      DEFAULTS.themeButtonRadius,

    themeContainerWidth:
      values.theme_container_width ||
      DEFAULTS.themeContainerWidth,

    themeHeaderStyle:
      values.theme_header_style ||
      DEFAULTS.themeHeaderStyle,

    themeCardStyle:
      values.theme_card_style ||
      DEFAULTS.themeCardStyle,

    themeButtonStyle:
      values.theme_button_style ||
      DEFAULTS.themeButtonStyle,

    themeLayoutStyle:
      values.theme_layout_style ||
      DEFAULTS.themeLayoutStyle,


    footerDisclaimer:
      values.footer_disclaimer ||
      DEFAULTS.footerDisclaimer,

    responsibleText:
      values.footer_responsible_text ||
      DEFAULTS.responsibleText,

    responsibleUrl:
      values.footer_responsible_url ||
      DEFAULTS.responsibleUrl,

    responsibleHelpText:
      values.footer_responsible_help_text ||
      DEFAULTS.responsibleHelpText,

    responsibleHelpUrl:
      resolveUrl(
        values.footer_responsible_help_url,
        origin,
        DEFAULTS.responsibleHelpUrl
      ),

    responsibleHelpLabel:
      values.footer_responsible_help_label ||
      DEFAULTS.responsibleHelpLabel,

    compliance: safeCompliance,
    gaMeasurementId:
      values.ga_measurement_id ||
      DEFAULTS.gaMeasurementId,

    // ========================================================
    // GPWA VERIFICATION
    // Raw, admin-pasted markup — never sanitized (it legitimately
    // contains a <script> tag) and never rendered unless BOTH the
    // toggle is on AND the tenant has actually pasted something in.
    // See buildGpwaSeal()/buildGpwaScript() below for the gating.
    // ========================================================

    gpwaSealEnabled:
      values.gpwa_seal_enabled === "true",

    gpwaSealHtml:
      values.gpwa_seal_html ||
      DEFAULTS.gpwaSealHtml,

    gpwaScriptHtml:
      values.gpwa_script_html ||
      DEFAULTS.gpwaScriptHtml,

    homepageSections:
  parseHomepageSections(
    values.homepage_sections
  )

  };
}
