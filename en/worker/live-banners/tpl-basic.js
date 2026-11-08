import { esc, safeImage } from "./escape.js";
import { cta, img, disclaimer, head, text, wrapLink } from "./tpl-shared.js";

export function renderPromo({ c }) {
  return `<div class="lb-promo">${img(c.image, c.alt || c.headline, { w: 320, h: 160 })}<div class="lb-body">${head(c)}${text(c)}${cta(c)}${disclaimer(c)}</div></div>`;
}

export function renderImage({ c }) {
  const src = safeImage(c.image);
  if (!src) return "";
  const x2 = safeImage(c.image_2x);
  const srcset = x2 ? ` srcset="${esc(src)} 1x, ${esc(x2)} 2x"` : "";
  const pic = `<img class="lb-img lb-img--full" src="${esc(src)}"${srcset} alt="${esc(c.alt || c.headline || "")}" width="480" height="240" loading="lazy" decoding="async">`;
  const over = c.headline || c.text ? `<div class="lb-overlay">${head(c)}${text(c)}</div>` : "";
  return wrapLink(c.link, pic + over, { label: c.alt || c.headline || "" });
}

export function renderMarquee({ c }) {
  const t = esc(c.marquee_text || "");
  return `<div class="lb-marquee" data-lb-pause><span class="lb-marquee__track"><span>${t}</span><span aria-hidden="true">${t}</span></span>${cta(c)}</div>`;
}

export function renderCountdown({ c, b }) {
  const end = c.countdown_end || (b && b.end_at) || "";
  const ts = Date.parse(String(end).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(end) ? "" : "Z"));
  const attr = Number.isFinite(ts) ? ` data-lb-countdown="${ts}"` : "";
  return `<div class="lb-count"${attr}>${head(c)}${text(c)}<div class="lb-clock" aria-live="off"><span data-lb-d>0</span>d <span data-lb-h>00</span>h <span data-lb-m>00</span>m <span data-lb-s>00</span>s</div><p class="lb-over" hidden>This offer has ended.</p>${cta(c)}${disclaimer(c)}</div>`;
}

export function renderStat({ c }) {
  const rows = (Array.isArray(c.rows) ? c.rows : []).slice(0, 8).map((r) => `<tr><th scope="row">${esc(r.k)}</th><td>${esc(r.v)}</td></tr>`).join("");
  return `<div class="lb-stat">${head(c)}<table class="lb-kv"><tbody>${rows}</tbody></table>${cta(c)}${disclaimer(c)}</div>`;
}
