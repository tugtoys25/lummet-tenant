// ------------------------------------------------------------
// URL handling
// ------------------------------------------------------------

export function resolveUrl(value, origin, fallback = "") {
  const input = String(value || "").trim();

  if (!input) {
    return fallback
      ? new URL(fallback, origin).href
      : "";
  }

  try {
    const url = new URL(input, origin);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fallback
        ? new URL(fallback, origin).href
        : "";
    }

    return url.href;
  } catch {
    return fallback
      ? new URL(fallback, origin).href
      : "";
  }
}

export function buildSiteManifest(site, origin) {
  const manifest = {
    name:
      site.siteName ||
      new URL(origin).hostname,

    short_name:
      site.siteShortName ||
      site.siteName ||
      new URL(origin).hostname,

    start_url:
      site.manifestStartUrl ||
      "/en/",

    scope:
      site.manifestScope ||
      "/",

    display:
      site.manifestDisplay ||
      "standalone",

    theme_color:
      site.themePrimary ||
      "#0f172a",

    background_color:
      site.themeBackground ||
      "#ffffff",

    description:
      site.description ||
      "",

    icons: []
  };

  if (site.pwaIcon192Url) {
    manifest.icons.push({
      src: site.pwaIcon192Url,
      sizes: "192x192",
      type: "image/png",
      purpose: "any maskable"
    });
  }

  if (site.pwaIcon512Url) {
    manifest.icons.push({
      src: site.pwaIcon512Url,
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable"
    });
  }

  return manifest;
}
