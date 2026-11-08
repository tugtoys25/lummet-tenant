// Templates built from picked items (casinos, news, slides). Items arrive already resolved by load.js.
import { esc } from "./escape.js";
import { cta, img, link, wrapLink, disclaimer, head, stars } from "./tpl-shared.js";

const itemCta = (it, label) => link(it.cta_url || it.url, label, { affiliate: !!it.sponsored });

export function renderSpotlight({ c, items }) {
  const it = items[0];
  if (!it) return "";
  return `<div class="lb-spot">${img(it.image, it.title, { w: 96, h: 96, cls: "lb-logo" })}<div class="lb-body">${it.badge ? `<span class="lb-badge">${esc(it.badge)}</span>` : ""}<h3 class="lb-h">${esc(it.title)}</h3>${stars(it.rating)}${it.bonus ? `<p class="lb-t">${esc(it.bonus)}</p>` : ""}${itemCta(it, c.cta_label || "Play now")}${disclaimer(c)}</div></div>`;
}

export function renderTable({ c, items }) {
  if (!items.length) return "";
  const rows = items.map((it, i) => `<tr><td data-label="#">${i + 1}</td><td data-label="Casino" class="lb-cell-logo">${img(it.image, "", { w: 40, h: 40, cls: "lb-logo lb-logo--s" })}<strong>${esc(it.title)}</strong></td><td data-label="Bonus">${esc(it.bonus)}</td><td data-label="Rating">${stars(it.rating)}</td><td data-label="">${itemCta(it, c.cta_label || "Visit")}</td></tr>`).join("");
  return `<div class="lb-tablewrap">${head(c)}<table class="lb-table"><thead><tr><th>#</th><th>Casino</th><th>Bonus</th><th>Rating</th><th><span class="lb-sr">Action</span></th></tr></thead><tbody>${rows}</tbody></table>${disclaimer(c)}</div>`;
}

export function renderCarousel({ c, items }) {
  if (!items.length) return "";
  const slides = items.map((it, i) => `<li class="lb-slide" data-lb-slide${i ? " hidden" : ""}>${wrapLink(it.url, `<span class="lb-slide__t">${esc(it.title)}</span>`, { cls: "lb-slide__a" })}</li>`).join("");
  const dots = items.map((_, i) => `<button type="button" class="lb-dot" data-lb-dot="${i}" aria-label="Go to item ${i + 1}"></button>`).join("");
  return `<div class="lb-car" data-lb-carousel data-lb-auto="5000" role="region" aria-roledescription="carousel" aria-label="${esc(c.headline || "Latest news")}"><button type="button" class="lb-arrow" data-lb-prev aria-label="Previous">‹</button><ul class="lb-slides">${slides}</ul><button type="button" class="lb-arrow" data-lb-next aria-label="Next">›</button><div class="lb-dots">${dots}</div></div>`;
}

export function renderSlider({ c, items }) {
  if (!items.length) return "";
  const slides = items.map((it, i) => `<li class="lb-slide" data-lb-slide${i ? " hidden" : ""}>${wrapLink(it.url, img(it.image, it.title, { w: 480, h: 240, cls: "lb-img lb-img--full" }), { label: it.title })}${it.url && it.title ? `<span class="lb-cap">${esc(it.title)}</span>` : ""}</li>`).join("");
  const dots = items.map((_, i) => `<button type="button" class="lb-dot" data-lb-dot="${i}" aria-label="Go to slide ${i + 1}"></button>`).join("");
  return `<div class="lb-car lb-car--slider" data-lb-carousel data-lb-auto="6000" role="region" aria-roledescription="carousel" aria-label="${esc(c.headline || "Offers")}"><button type="button" class="lb-arrow" data-lb-prev aria-label="Previous">‹</button><ul class="lb-slides">${slides}</ul><button type="button" class="lb-arrow" data-lb-next aria-label="Next">›</button><div class="lb-dots">${dots}</div>${cta(c)}${disclaimer(c)}</div>`;
}
