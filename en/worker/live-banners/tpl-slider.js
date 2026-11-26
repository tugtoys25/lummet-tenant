// Slider / home banner: multi-picture, clickable, accessible carousel. Pure function, everything interpolated is escaped.
// Markup is complete without JavaScript (first slide only); static/js/live-banners-slider.js adds motion and controls.
import { esc, safeUrl, safeImage, relFor, isExternal } from "./escape.js";
import { sliderConfig } from "./validate-slider.js";

const ABOVE_FOLD = ["after_header", "before_main", "top"];
const ms = (s) => { const t = s ? Date.parse(`${String(s).replace(" ", "T")}Z`) : NaN; return Number.isFinite(t) ? t : 0; };
const ratio = (r) => String(r).replace(":", " / ");

function picture(it, { eager, w, h, alt, mobileW, mobileH }) {
  const src = safeImage(it.image);
  if (!src) return "";
  const m = safeImage(it.image_mobile);
  const load = eager ? ' fetchpriority="high" decoding="async"' : ' loading="lazy" fetchpriority="low" decoding="async"';
  const source = m ? `<source media="(max-width: 640px)" srcset="${esc(m)}" width="${mobileW}" height="${mobileH}">` : "";
  return `<picture class="lb-sl__pic">${source}<img class="lb-sl__img" src="${esc(src)}" alt="${esc(alt)}" width="${w}" height="${h}"${load}></picture>`;
}

function textBlock(it, c, href) {
  const cta = it.cta_label || (href ? c.cta_label : "");
  if (!it.title && !it.subtitle && !it.badge && !cta) return "";
  const pos = ["left", "center", "right"].includes(it.text_pos) ? it.text_pos : "left";
  return `<span class="lb-sl__shade" aria-hidden="true"></span><span class="lb-sl__text lb-sl__text--${pos}">`
    + (it.badge ? `<span class="lb-badge lb-sl__badge">${esc(it.badge)}</span>` : "")
    + (it.title ? `<strong class="lb-sl__h">${esc(it.title)}</strong>` : "")
    + (it.subtitle ? `<span class="lb-sl__sub">${esc(it.subtitle)}</span>` : "")
    + (cta && href ? `<span class="lb-sl__cta">${esc(cta)}</span>` : "") + `</span>`;
}

function slide(it, i, n, o) {
  const { c, cfg, eager } = o;
  const href = safeUrl(it.url) || safeUrl(c.link);
  const name = it.title || it.alt || "";
  const label = name || `Slide ${i + 1}`;
  const cta0 = it.cta_label || (safeUrl(it.url) || safeUrl(c.link) ? c.cta_label : "");
  const inner = picture(it, { eager: eager && i === 0, w: o.w, h: o.h, alt: it.alt || it.title || "", mobileW: o.mw, mobileH: o.mh }) + textBlock(it, c, href)
    + ((cfg.ad_label || it.sponsored) ? `<span class="lb-sl__ad">${esc(cfg.ad_text)}</span>` : "");
  if (!inner) return "";
  const tab = (it.new_tab || c.new_tab || (href && isExternal(href))) ? ' target="_blank"' : "";
  const rel = href ? relFor(href, { affiliate: !!it.sponsored }) : "";
  const box = href
    ? `<a class="lb-sl__link" href="${esc(href)}"${tab}${rel ? ` rel="${rel}"` : ""} data-lb-click${name || it.subtitle || it.badge || cta0 ? "" : ` aria-label="${esc(label)}"`}>${inner}</a>`
    : `<div class="lb-sl__link">${inner}</div>`;
  const dur = Number(it.duration) > 0 ? ` data-dur="${Math.round(Number(it.duration) * 1000)}"` : "";
  const win = (ms(it.start_at) ? ` data-start="${ms(it.start_at)}"` : "") + (ms(it.end_at) ? ` data-end="${ms(it.end_at)}"` : "");
  return `<li class="lb-slide${i === 0 ? " is-active" : ""}" data-lb-slide data-sid="${esc(it.key)}" data-title="${esc(label)}"${dur}${win} role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}: ${esc(label)}"${i ? " hidden" : ""}>${box}</li>`;
}

export function renderSlider({ c, items, b }) {
  if (!items.length) return "";
  const cfg = sliderConfig(c.slider);
  const n = items.length, multi = n > 1;
  const [rw, rh] = cfg.ratio.split(":").map(Number), w = 1600, h = Math.round((w * rh) / rw);
  const [mw, mh] = (cfg.mobile_ratio === "same" ? cfg.ratio : cfg.mobile_ratio).split(":").map(Number);
  const o = { c, cfg, w, h, mw: 800, mh: Math.round((800 * mh) / mw), eager: b?.placement_mode === "inline" && ABOVE_FOLD.includes(b?.anchor) };
  const lis = items.map((it, i) => slide(it, i, n, o)).join("");
  if (!lis) return "";
  const uid = `lb-sl-${Number(b?.id) || 0}`;
  const dots = multi && cfg.nav !== "none" ? `<div class="lb-dots lb-sl__nav" role="group" aria-label="Choose a slide">${items.map((it, i) => `<button type="button" class="lb-dot" data-lb-dot="${i}" aria-label="${esc(it.title || it.alt ? `Slide ${i + 1}: ${it.title || it.alt}` : `Slide ${i + 1}`)}" aria-current="${i === 0 ? "true" : "false"}"></button>`).join("")}</div>` : "";
  const arrows = multi && cfg.arrows ? `<button type="button" class="lb-arrow" data-lb-prev aria-controls="${uid}-s" aria-label="Previous slide">‹</button><button type="button" class="lb-arrow" data-lb-next aria-controls="${uid}-s" aria-label="Next slide">›</button>` : "";
  const ctrl = multi ? `<div class="lb-sl__ctrl">${cfg.counter ? `<span class="lb-sl__count" data-lb-count aria-hidden="true">1 / ${n}</span>` : ""}${cfg.autoplay ? `<button type="button" class="lb-sl__play" data-lb-play aria-controls="${uid}-s" aria-label="Pause automatic slide show"></button>` : ""}</div>` : "";
  const bar = multi && cfg.autoplay ? `<span class="lb-sl__bar" data-lb-bar aria-hidden="true"></span>` : "";
  const cls = ["lb-car", "lb-car--slider", "lb-sl", `lb-sl--${cfg.transition}`, `lb-sl--ov-${cfg.overlay}`, `lb-sl--nav-${cfg.nav}`, cfg.fit === "contain" ? "lb-sl--contain" : "", cfg.progress ? "lb-sl--prog" : ""].filter(Boolean).join(" ");
  const data = `data-lb-slider data-auto="${multi && cfg.autoplay ? 1 : 0}" data-interval="${cfg.interval * 1000}" data-speed="${cfg.speed}" data-hover="${cfg.pause_hover ? 1 : 0}" data-loop="${cfg.loop ? 1 : 0}" data-swipe="${cfg.swipe ? 1 : 0}" data-keys="${cfg.keyboard ? 1 : 0}"`;
  const vars = `--lb-ratio:${ratio(cfg.ratio)};--lb-ratio-m:${ratio(cfg.mobile_ratio === "same" ? cfg.ratio : cfg.mobile_ratio)};--lb-speed:${cfg.speed}ms`;
  const disc = c.disclaimer ? `<p class="lb-disc">${esc(c.disclaimer)}</p>` : "";
  return `<div class="${cls}" ${data} role="region" aria-roledescription="carousel" aria-label="${esc(c.headline || "Featured offers")}" style="${vars}">${ctrl}<div class="lb-sl__stage"><ul class="lb-slides" id="${uid}-s" aria-live="off">${lis}</ul>${arrows}${dots}${bar}</div>${disc}</div>`;
}
