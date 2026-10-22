// Renderer methods: Navigation, page nav and banners.
// Installed on Renderer.prototype by worker/render.js (see worker/render/install-methods.js).

export const navigationMethods = {

  async loadNavData() {
    const { getNavItems } = await import("../database/nav.js");
    const { getCached, setCached, CACHE_KEYS } = await import("../cache.js");

    const locations = ["header", "footer_casinos", "footer_company", "footer_support", "footer_legal", "mobile"];
    const results = await Promise.all(
      locations.map(async (loc) => {
        const cacheKey = CACHE_KEYS.NAV(loc);
        let items = await getCached(this.env, cacheKey);
        if (!items) {
          items = await getNavItems(this.env.DB, loc);
          await setCached(this.env, cacheKey, items, 600);
        }
        return { loc, items };
      })
    );

    const navData = {};
    for (const { loc, items } of results) {
      navData[loc] = items;
    }

    // Mobile nav: use dedicated "mobile" location, fall back to first 5 header items
    const mobileItems = (navData.mobile && navData.mobile.length > 0)
      ? navData.mobile
      : (navData.header || []).slice(0, 5);

    return {
      header_nav: this.buildHeaderNav(navData.header),
      footer_casinos: this.buildFooterLinks(navData.footer_casinos),
      footer_company: this.buildFooterLinks(navData.footer_company),
      footer_support: this.buildFooterLinks(navData.footer_support),
      footer_legal: this.buildFooterLinks(navData.footer_legal),
      mobile_nav: this.buildMobileNav(mobileItems)
    };
  },

  // =====================================================
  // PAGE NAV — {{{pagenav}}}
  // =====================================================
  // Contextual, per-page horizontal navigation (location='page'
  // in nav_items — see migration 0018_page_nav_geo.sql). This is
  // distinct from the site-wide header/footer/mobile navigation
  // built by loadNavData() above.
  //
  // Caching strategy: the raw, ungeofiltered item list is cached
  // under "nav:page" using the exact same getCached/setCached
  // convention as every other nav location (see CACHE_KEYS.NAV
  // and invalidateNav() in cache.js). GEO eligibility varies per
  // visitor country, so filtering is always applied fresh, in
  // memory, after the cache read — it is a single small indexed
  // D1 query (batched by item id, no N+1) plus an array filter,
  // not a per-country cache entry.
  async loadPageNav() {
    // PageNav is a public-page feature only. Admin/dashboard pages
    // share the same layout/base.html, but must never get a
    // .pagenav element — pagenav-ajax.js attaches a global
    // `popstate` listener the moment .pagenav exists anywhere on
    // the page, which would hijack the dashboard's own history
    // navigation (e.g. Settings' internal tab switching) and
    // overwrite #mainContent with public-page partial content.
    if (this.getNormalizedPath().startsWith("/en/dashboard")) {
      return "";
    }

    const { getNavItems, filterPageNavItemsByGeo } = await import("../database/nav.js");
    const { getCached, setCached, CACHE_KEYS } = await import("../cache.js");
    const { geoEngine } = await import("../geo.js");

    const cacheKey = CACHE_KEYS.NAV("page");
    let items = await getCached(this.env, cacheKey);
    if (!items) {
      items = await getNavItems(this.env.DB, "page");
      await setCached(this.env, cacheKey, items, 600);
    }

    if (!items || items.length === 0) return "";

    // Fail gracefully if GEO detection is unavailable for any
    // reason (e.g. no request object) — fall back to showing all
    // enabled PageNav items unfiltered rather than breaking the
    // page.
    let countryCode = null;
    try {
      if (this.request) {
        const edgeGeo = {
          country: this.request.cf?.country || null,
          city: this.request.cf?.city || "Unknown"
        };
        const geoInfo = geoEngine.process(this.request, edgeGeo);
        countryCode = geoInfo.country || null;
      }
    } catch (e) {
      console.error("PageNav GEO detection failed:", e.message);
      countryCode = null;
    }

    let visibleItems = items;
    try {
      visibleItems = await filterPageNavItemsByGeo(this.env.DB, items, countryCode);
    } catch (e) {
      console.error("PageNav GEO filtering failed:", e.message);
      // Fail open: show the unfiltered list rather than an empty nav.
      visibleItems = items;
    }

    return this.buildPageNavHtml(visibleItems);
  },

  // ── Is this request asking for a partial (AJAX) response? ──
  // GET-only, and only ever a query-param variant of an existing
  // route (never a new URL/path). Detected centrally here so no
  // individual controller/render* function needs to know or care
  // about AJAX navigation.
  isPartialRequest() {
    if (!this.request) return false;
    if (this.request.method && this.request.method !== "GET") return false;
    try {
      const url = new URL(this.request.url);
      if (url.pathname.startsWith("/en/dashboard")) return false;
      return url.searchParams.get("partial") === "1";
    } catch {
      return false;
    }
  },

  // ── Current request path, normalized like routes.js ──────
  getNormalizedPath() {
    if (!this.request || !this.request.url) return "";
    let path;
    try {
      path = new URL(this.request.url).pathname;
    } catch {
      return "";
    }
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return path;
  },

  // ── Does a PageNav item's URL match the current page? ────
  isPageNavItemActive(itemUrl, currentPath) {
    if (!itemUrl || !currentPath) return false;
    // Absolute/external URLs never match the current relative path.
    if (/^https?:\/\//i.test(itemUrl)) return false;

    let normalized = itemUrl.split("?")[0].split("#")[0];
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized === currentPath;
  },

  buildPageNavHtml(items) {
    if (!items || items.length === 0) return "";

    const currentPath = this.getNormalizedPath();

    const links = items.map(item => {
      const isActive = this.isPageNavItemActive(item.url, currentPath);
      const external = item.is_external ? ' target="_blank" rel="noopener"' : "";
      const activeClass = isActive ? " pagenav__link--active" : "";
      const ariaCurrent = isActive ? ' aria-current="page"' : "";
      return `<a href="${item.url}" class="pagenav__link${activeClass}"${external}${ariaCurrent}>${item.label}</a>`;
    }).join("\n");

    return `<nav class="pagenav" aria-label="Page navigation"><div class="pagenav__scroll">${links}</div></nav>`;
  },

  buildMobileNav(items) {
    return items.map(item => {
      const icon = item.icon || "";
      const external = item.is_external ? ' target="_blank" rel="noopener"' : "";
      return `<a href="${item.url}"${external} class="mobile-nav-item" data-href="${item.url}">
        <span class="mobile-nav-icon">${icon}</span>
        <span class="mobile-nav-label">${item.label}</span>
      </a>`;
    }).join("\n");
  },

  buildHeaderNav(items) {
    return items.map(item => {
      const external = item.is_external ? ' target="_blank" rel="noopener"' : "";
      return `<a href="${item.url}"${external}>${item.label}</a>`;
    }).join("\n");
  },

  buildFooterLinks(items) {
    return items.map(item => {
      const external = item.is_external ? ' target="_blank" rel="noopener noreferrer nofollow"' : "";
      return `<li><a href="${item.url}"${external}>${item.label}</a></li>`;
    }).join("\n");
  },

  async loadActiveBanners(country) {
    const { getActiveBanners } = await import("../database/banners.js");
    // Banners change rarely; a short cache saves a D1 query on every page
    // view. Edits show up within ~60s (scheduled start/end dates too).
    // Per-data-centre cache (no KV write on every refresh; see cache.js getLocal).
    const { getLocal, setLocal } = await import("../cache.js");
    const bannerKey = `public:banners:${country || "XX"}`;
    let banners = await getLocal(this.env, bannerKey);
    if (!banners) {
      banners = await getActiveBanners(this.env.DB, country);
      await setLocal(this.env, bannerKey, banners, 60);
    }
    if (banners.length === 0) return [];
    return banners.map(banner => {
      const dismissible = banner.dismissible ? `<button class="banner-dismiss" onclick="this.parentElement.style.display='none';document.cookie='banner_${banner.id}=dismissed;max-age=86400;path=/'">&times;</button>` : "";
      const button = banner.button_text && banner.link ? `<a href="${banner.link}" class="banner-btn" style="background:${banner.text_color};color:${banner.bg_color}">${banner.button_text}</a>` : "";
      const html = `
        <div class="site-banner banner-${banner.position}" data-id="${banner.id}" style="background:${banner.bg_color};color:${banner.text_color}">
          <div class="container banner-inner">
            ${banner.title ? `<strong>${banner.title}</strong>` : ""}
            ${banner.content ? `<span>${banner.content}</span>` : ""}
            ${button}
          </div>
          ${dismissible}
        </div>`;
      return { position: banner.position, html };
    });
  },

  async loadActiveBannersbackup(country) {
    const { getActiveBanners } = await import("../database/banners.js");
    const banners = await getActiveBanners(this.env.DB, country);

    if (banners.length === 0) return "";

    return banners.map(banner => {
      const dismissible = banner.dismissible ? `<button class="banner-dismiss" onclick="this.parentElement.style.display='none';document.cookie='banner_${banner.id}=dismissed;max-age=86400;path=/'">&times;</button>` : "";
      const button = banner.button_text && banner.link ? `<a href="${banner.link}" class="banner-btn" style="background:${banner.text_color};color:${banner.bg_color}">${banner.button_text}</a>` : "";
      return `
        <div class="site-banner banner-${banner.position}" data-id="${banner.id}" style="background:${banner.bg_color};color:${banner.text_color}">
          <div class="container banner-inner">
            ${banner.title ? `<strong>${banner.title}</strong>` : ""}
            ${banner.content ? `<span>${banner.content}</span>` : ""}
            ${button}
          </div>
          ${dismissible}
        </div>`;
    }).join("");
  }
};
