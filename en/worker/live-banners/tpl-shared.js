// Small escaped-HTML pieces shared by the templates.
import { esc, safeUrl, safeImage, relFor, isExternal } from "./escape.js";

export function link(url, label, { cls = "lb-cta", affiliate = false, newTab = false, extra = "" } = {}) {
  const u = safeUrl(url);
  if (!u || !label) return "";
  const rel = relFor(u, { affiliate });
  const tab = newTab || isExternal(u) ? ' target="_blank"' : "";
  return `<a class="${cls}" href="${esc(u)}"${tab}${rel ? ` rel="${rel}"` : ""} data-lb-click${extra}>${esc(label)}</a>`;
}

export function wrapLink(url, inner, { cls = "lb-fill", label = "" } = {}) {
  const u = safeUrl(url);
  if (!u) return inner;
  const rel = relFor(u);
  const tab = isExternal(u) ? ' target="_blank"' : "";
  return `<a class="${cls}" href="${esc(u)}"${tab}${rel ? ` rel="${rel}"` : ""}${label ? ` aria-label="${esc(label)}"` : ""} data-lb-click>${inner}</a>`;
}

export function cta(c, extra = {}) { return link(c.link, c.cta_label, { newTab: !!c.new_tab, ...extra }); }

export function img(src, alt = "", { w = 320, h = 180, cls = "lb-img" } = {}) {
  const s = safeImage(src);
  return s ? `<img class="${cls}" src="${esc(s)}" alt="${esc(alt)}" width="${w}" height="${h}" loading="lazy" decoding="async">` : "";
}

export const disclaimer = (c) => (c.disclaimer ? `<p class="lb-disc">${esc(c.disclaimer)}</p>` : "");
export const head = (c) => (c.headline ? `<h3 class="lb-h">${esc(c.headline)}</h3>` : "");
export const text = (c) => (c.text ? `<p class="lb-t">${esc(c.text)}</p>` : "");

export function stars(rating) {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  return r ? `<span class="lb-rate" aria-label="Rated ${esc(r.toFixed(1))} out of 5">★ ${esc(r.toFixed(1))}</span>` : "";
}
