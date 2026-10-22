import { FIELDS, FONT_STACKS } from "./schema.js";
import { defaultHeaderHero, embedUrl, escapeHtml, parseVideoUrl } from "./clean.js";

// ------------------------------------------------------------
// Template variables
// ------------------------------------------------------------

const HEADER_HEIGHT_PX = { compact: 56, default: 68, tall: 84 };

const LOGO_SIZE_PX = { sm: 32, md: 40, lg: 52 };

function cssUrl(value) {
  return String(value).replace(/['"()\\\s]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
}

function hashText(text) {
  let h = 5381;
  const s = String(text);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Classes that describe the header on <body> (and on the admin preview). */
export function headerClasses(hh) {
  return [
    hh.headerSticky ? "hh-sticky" : "hh-static",
    `hh-height-${hh.headerHeight}`,
    `hh-style-${hh.headerStyle}`,
    `hh-logo-${hh.logoMode}`,
    `hh-logo-size-${hh.logoSize}`,
    `hh-nav-${hh.navAlign}`,
    hh.headerTextColor ? "hh-hfg" : "",
    hh.headerFont !== "default" ? "hh-hfont" : ""
  ].filter(Boolean).join(" ");
}

export function heroClasses(hh, hasImage) {
  return [
    `hero--h-${hh.heroHeight}`,
    `hero--text-${hh.heroTextTheme}`,
    `hero--focus-${hh.heroImageFocus}`,
    hasImage ? "hero--image" : `hero--bg-${hh.heroBgMode}`,
    hh.heroTextColor ? "hero--custom-fg" : "",
    hh.heroTitleColor ? "hero--custom-title" : "",
    hh.heroHeadingFont !== "default" ? "hero--font-heading" : "",
    hh.heroBodyFont !== "default" ? "hero--font-body" : "",
    hasMedia(hh) ? "hero--has-media" : "",
    hasMedia(hh) && hh.heroSlides.some((x) => x.link) ? "hero--media-link" : "",
    hasMedia(hh) && hh.heroSlides.length > 1 && hh.heroMediaArrows ? "hero--arrows" : "",
    hasCards(hh) && hh.heroCardsPosition === "side" ? "hero--cards-side" : ""
  ].filter(Boolean).join(" ");
}

function announceHtml(hh, showLink) {
  const id = hashText(`${hh.announceText}|${hh.announceUrl}|${hh.announceTone}`);
  const link = showLink
    ? ` <a class="hh-announce__link" href="${escapeHtml(hh.announceUrl)}">${escapeHtml(hh.announceLinkText)}</a>`
    : "";
  const close = hh.announceDismissible
    ? '<button type="button" class="hh-announce__close" data-announce-close aria-label="Dismiss announcement">&times;</button>'
    : "";
  return (
    `<div class="hh-announce hh-announce--${hh.announceTone}" role="region" aria-label="Announcement" data-announce-id="${id}">` +
    `<div class="container hh-announce__inner"><p class="hh-announce__text">${escapeHtml(hh.announceText)}${link}</p>${close}</div></div>`
  );
}

function hasMedia(hh) {
  return Boolean(hh.heroMediaEnabled && hh.heroSlides && hh.heroSlides.length);
}

function hasCards(hh) {
  return Boolean(hh.heroCardsEnabled && hh.heroCards && hh.heroCards.length);
}

function videoType(src) {
  const m = /\.(mp4|webm|ogv|ogg|m4v)(\?|$)/i.exec(src);
  const ext = m ? m[1].toLowerCase() : "mp4";
  return ext === "webm" ? "video/webm" : ext === "ogv" || ext === "ogg" ? "video/ogg" : "video/mp4";
}

/** The slides layer that sits behind the overlay and the text. */
function mediaHtml(hh, priority = true) {
  const e = escapeHtml;
  const slides = hh.heroSlides;
  const many = slides.length > 1;
  const autoplay = many && hh.heroMediaAutoplay;
  const slideHtml = slides
    .map((sl, i) => {
      const first = i === 0 && priority;
      const isFirst = i === 0;
      let inner;
      if (sl.type === "embed") {
        // The player is created by the script (after load for a background, on click for a pop-up),
        // so nothing from YouTube or Vimeo is requested before it is needed.
        const poster = sl.poster ? `<img src="${e(sl.poster)}" alt="" decoding="async"${first ? ' fetchpriority="high"' : ' loading="lazy"'}>` : "";
        const bg = sl.play === "background" ? `<div class="hero-embed" data-hh-bg-embed="${e(embedUrl(parseVideoUrl(sl.src), "background"))}"></div>` : "";
        inner = poster + bg;
      } else if (sl.type === "video") {
        // Only the first video gets autoplay here; the script plays and pauses the others.
        const attrs = `muted playsinline${first ? " autoplay" : ""}${many && hh.heroMediaAutoplay ? "" : " loop"} preload="${first ? "auto" : "none"}"` +
          (sl.poster ? ` poster="${e(sl.poster)}"` : "") +
          (sl.alt ? ` aria-label="${e(sl.alt)}"` : ' aria-hidden="true"');
        inner = `<video ${attrs}><source src="${e(sl.src)}" type="${videoType(sl.src)}"></video>`;
      } else {
        inner = `<img src="${e(sl.src)}" alt="${e(sl.alt)}" decoding="async"${first ? ' fetchpriority="high"' : ' loading="lazy"'}>`;
      }
      const link = sl.link ? `<a class="hero-slide__link" href="${e(sl.link)}" aria-label="${e(sl.alt || "Learn more")}"${/^https?:/i.test(sl.link) ? ' target="_blank" rel="noopener"' : ""}></a>` : "";
      const label = many ? ` role="group" aria-roledescription="slide" aria-label="${i + 1} of ${slides.length}"` : "";
      return `<div class="hero-slide${isFirst ? " is-active" : ""}" data-type="${sl.type}"${label}>${inner}${link}</div>`;
    })
    .join("");
  return (
    `<div class="hero-media hero-media--${hh.heroMediaTransition} hero-media--motion-${hh.heroMediaMotion}" ` +
    `data-autoplay="${autoplay ? "1" : "0"}" data-interval="${hh.heroMediaInterval * 1000}" data-pause-hover="${hh.heroMediaPauseHover ? "1" : "0"}" data-embed-mobile="${hh.heroMediaEmbedMobile ? "1" : "0"}" ` +
    `style="--hh-interval:${hh.heroMediaInterval}s">${slideHtml}</div>`
  );
}

/** Arrows, dots and the pause button. They sit above the text so they can be clicked. */
function mediaControlsHtml(hh) {
  const slides = hh.heroSlides;
  const e = escapeHtml;
  // "Watch video" pills for pop-up slides; the script shows the one that belongs to the visible slide
  const pills = slides
    .map((sl, i) =>
      sl.type === "embed" && sl.play !== "background"
        ? `<button type="button" class="hero-watch" data-hh-embed="${e(embedUrl(parseVideoUrl(sl.src), "popup"))}" data-hh-title="${e(sl.alt || "Video")}" data-hh-watch-for="${i}" aria-haspopup="dialog"${i === 0 ? "" : " hidden"}><span aria-hidden="true">&#9654;</span> ${e(sl.alt || "Watch video")}</button>`
        : ""
    )
    .join("");
  if (slides.length < 2) return pills ? `<div class="hero-media__ui">${pills}</div>` : "";
  const arrows = hh.heroMediaArrows
    ? '<button type="button" class="hero-media__nav hero-media__prev" data-hh-prev aria-label="Previous slide">&#8249;</button>' +
      '<button type="button" class="hero-media__nav hero-media__next" data-hh-next aria-label="Next slide">&#8250;</button>'
    : "";
  const dots = hh.heroMediaDots
    ? `<div class="hero-media__dots">${slides.map((_, i) => `<button type="button" data-hh-dot="${i}" aria-label="Go to slide ${i + 1}"${i === 0 ? ' aria-current="true"' : ""}></button>`).join("")}</div>`
    : "";
  const pause = hh.heroMediaAutoplay
    ? '<button type="button" class="hero-media__pause" data-hh-toggle aria-label="Pause slideshow" aria-pressed="false"><span aria-hidden="true">&#10074;&#10074;</span></button>'
    : "";
  return `<div class="hero-media__ui">${pills}${arrows}${dots}${pause}</div>`;
}

/** Images placed inside the hero, fixed or clickable. */
function cardsHtml(hh) {
  const e = escapeHtml;
  const cards = hh.heroCards
    .map((c) => {
      const img = `<img src="${e(c.src)}" alt="${e(c.alt)}" loading="lazy" decoding="async">`;
      const external = /^https?:/i.test(c.link);
      const media = c.link ? `<a class="hero-card__link" href="${e(c.link)}"${external ? ' target="_blank" rel="noopener"' : ""}>${img}</a>` : img;
      const caption = c.caption ? `<figcaption>${e(c.caption)}</figcaption>` : "";
      return `<figure class="hero-card${c.link ? " hero-card--link" : ""}">${media}${caption}</figure>`;
    })
    .join("");
  return `<div class="hero-cards hero-cards--${hh.heroCardsSize} hero-cards--n${hh.heroCards.length}">${cards}</div>`;
}

/**
 * Builds the hero section. The homepage calls it with no options (its output is unchanged);
 * a hero component passes `opts`:
 *   id        element id (default "siteHero")
 *   className extra classes
 *   style     extra inline CSS custom properties (already escaped)
 *   priority  false = the first picture is lazy (the hero is not at the top of the page)
 *   compact   true = leave out an empty heading or subtitle
 */
export function heroHtml(hh, hasImage, opts = {}) {
  const e = escapeHtml;
  const styleParts = [];
  if (hasImage) styleParts.push(`background-image:url('${cssUrl(hh.heroImage)}')`);
  if (opts.style) styleParts.push(opts.style);
  const style = styleParts.length ? ` style="${styleParts.join(";")}"` : "";
  const overlay = hh.heroOverlay && hh.heroOverlayOpacity > 0 ? '<div class="hero-overlay" aria-hidden="true"></div>' : "";
  const badge = hh.heroBadgeEnabled && hh.heroBadge ? `<div class="hero-badge">${e(hh.heroBadge)}</div>` : "";
  const description = hh.heroDescription ? `<p class="hero-description">${e(hh.heroDescription)}</p>` : "";
  const highlights = hh.heroHighlights
    ? `<ul class="hero-highlights">${hh.heroHighlights.split("\n").map((t) => `<li>${e(t)}</li>`).join("")}</ul>`
    : "";
  const primary =
    hh.heroButtonEnabled && hh.heroButtonText && hh.heroButtonUrl
      ? `<a href="${e(hh.heroButtonUrl)}" class="btn btn--primary btn--lg"${hh.heroButtonNewTab ? ' target="_blank" rel="noopener"' : ""}>${e(hh.heroButtonText)}</a>`
      : "";
  const secondary =
    hh.heroButton2Text && hh.heroButton2Url
      ? `<a href="${e(hh.heroButton2Url)}" class="btn btn--ghost btn--lg">${e(hh.heroButton2Text)}</a>`
      : "";
  const watchVideo = hh.heroWatchEnabled ? parseVideoUrl(hh.heroWatchUrl) : null;
  const watch = watchVideo
    ? `<button type="button" class="btn btn--ghost btn--lg hero-watch-btn" data-hh-embed="${e(embedUrl(watchVideo, "popup"))}" data-hh-title="${e(hh.heroWatchText)}" aria-haspopup="dialog"><span aria-hidden="true">&#9654;</span> ${e(hh.heroWatchText)}</button>`
    : "";
  const actions = primary || secondary || watch ? `<div class="hero-actions">${primary}${secondary}${watch}</div>` : "";
  const media = hasMedia(hh) ? mediaHtml(hh, opts.priority !== false) : "";
  const controls = hasMedia(hh) ? mediaControlsHtml(hh) : "";
  const cards = hasCards(hh) ? cardsHtml(hh) : "";
  const side = Boolean(cards) && hh.heroCardsPosition === "side";
  const heading = opts.compact && !hh.heroTitle ? "" : `<h1>${e(hh.heroTitle)}</h1>`;
  const subtitle = opts.compact && !hh.heroSubtitle ? "" : `<p class="hero-subtitle">${e(hh.heroSubtitle)}</p>`;
  const body = `${badge}${heading}${subtitle}${description}${highlights}${actions}${side ? "" : cards}`;
  const content = `<div class="hero-content hero-content--${hh.heroAlignment}">${body}</div>`;
  const wrapped = side ? `<div class="container hero-grid">${content}${cards}</div>` : `<div class="container">${content}</div>`;
  return (
    `<section class="hero ${opts.className ? opts.className + " " : ""}${heroClasses(hh, hasImage)}" id="${e(opts.id || "siteHero")}"${style}${media ? " data-hh-hero-media" : ""}>${media}${overlay}` +
    `${wrapped}${controls}</section>`
  );
}

export function headerHeroTemplateVars(hh = defaultHeaderHero()) {
  hh = { ...defaultHeaderHero(), ...(hh || {}) };

  // ---- CSS variables, emitted only when they differ from the defaults
  const vars = [`--hh-header-h:${HEADER_HEIGHT_PX[hh.headerHeight]}px`, `--hh-logo:${LOGO_SIZE_PX[hh.logoSize]}px`];
  if (hh.headerBackground) vars.push(`--hh-header-bg:${hh.headerBackground}`);
  vars.push(`--hh-hero-overlay:${(hh.heroOverlayOpacity / 100).toFixed(2)}`);
  if (hh.heroBgColor) vars.push(`--hh-hero-bg:${hh.heroBgColor}`);
  if (hh.headerTextColor) vars.push(`--hh-header-fg:${hh.headerTextColor}`);
  if (hh.heroTextColor) vars.push(`--hh-hero-fg:${hh.heroTextColor}`);
  if (hh.heroTitleColor) vars.push(`--hh-hero-title:${hh.heroTitleColor}`);
  // Font stacks are fixed strings from FONT_STACKS, never user input.
  if (FONT_STACKS[hh.headerFont]) vars.push(`--hh-header-font:${FONT_STACKS[hh.headerFont]}`);
  if (FONT_STACKS[hh.heroHeadingFont]) vars.push(`--hh-hero-heading-font:${FONT_STACKS[hh.heroHeadingFont]}`);
  if (FONT_STACKS[hh.heroBodyFont]) vars.push(`--hh-hero-body-font:${FONT_STACKS[hh.heroBodyFont]}`);

  const hasImage = Boolean(hh.heroImage);
  const showCta = hh.ctaEnabled && hh.ctaText && hh.ctaUrl;
  const showAnnounce = hh.announceEnabled && hh.announceText;
  const showLink = Boolean(hh.announceLinkText && hh.announceUrl);

  return {
    hh_css: `<style id="hh-vars">:root{${vars.join(";")}}</style>`,
    hh_body_class: headerClasses(hh),

    // header
    hh_logo_img: hh.logoMode !== "text",
    hh_logo_text: hh.logoMode !== "logo",
    hh_show_search: hh.showSearch,
    hh_search_placeholder: escapeHtml(hh.searchPlaceholder),
    hh_show_auth: hh.showAuth,
    hh_login_label: escapeHtml(hh.loginLabel || "Login"),
    hh_dashboard_label: escapeHtml(hh.dashboardLabel),
    hh_logout_label: escapeHtml(hh.logoutLabel),
    hh_cta: Boolean(showCta),
    hh_cta_text: escapeHtml(hh.ctaText),
    hh_cta_url: escapeHtml(hh.ctaUrl),
    hh_cta_class: hh.ctaStyle === "outline" ? "btn--outline" : "btn--primary",
    hh_cta_target: hh.ctaNewTab ? ' target="_blank" rel="noopener"' : "",

    // announcement bar (built here because it has optional parts)
    hh_announce: Boolean(showAnnounce),
    hh_announce_html: showAnnounce ? announceHtml(hh, showLink) : "",

    // hero (built here because most of its parts are optional)
    hh_hero: hh.heroEnabled,
    hh_hero_html: hh.heroEnabled ? heroHtml(hh, hasImage) : ""
  };
}

/** Defaults as strings keyed by setting key, for the admin page. */
export function headerHeroDefaultsForAdmin() {
  const out = {};
  for (const f of FIELDS) out[f.key] = String(f.def);
  return out;
}

/**
 * JSON that is safe inside <script type="application/json">: angle brackets,
 * ampersands and curly braces are written as \u escapes (the page template engine
 * would otherwise treat a "{{name}}" token in a default as a variable).
 */
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\{\{/g, "{\\u007b")
    .replace(/\}\}/g, "\\u007d}")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
