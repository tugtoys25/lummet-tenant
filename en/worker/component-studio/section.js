import { cleanColor, parseVideoUrl, embedUrl } from "../header-hero.js";
import { MAX_BLOCKS, arr, bool, e, image, int, link, obj, pickEnum, text } from "./shared.js";

// ---------------------------------------------------------------------------
// section
// ---------------------------------------------------------------------------

export const SECTION_DEFAULTS = {
  bg: "none",
  bg_color: "",
  bg_image: "",
  overlay: 45,
  pad: "md",
  width: "normal",
  align: "left",
  cols: 1,
  gap: "md",
  valign: "top",
  text_color: "",
  anchor: "",
  rounded: false,
  blocks: []
};

const ALLOWED_RICH = new Set(["p", "br", "strong", "b", "em", "i", "u", "a", "ul", "ol", "li", "h3", "h4", "blockquote", "hr"]);

/**
 * A strict cleaner for the text blocks: only the tags above survive, without attributes
 * (links keep a checked href). Everything else is dropped and the text inside is kept.
 */
export function cleanRichText(value, max = 6000) {
  let src = String(value ?? "").slice(0, max * 2);
  // code-like containers go with their content
  src = src.replace(/<(script|style|iframe|object|embed|svg|math|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, "");
  src = src.replace(/<!--[\s\S]*?-->/g, "");
  let out = "";
  let last = 0;
  const open = [];
  const re = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>/g;
  const escText = (t) => t.replace(/&(?!(?:[a-zA-Z]{2,8}|#\d{1,6}|#x[0-9a-fA-F]{1,6});)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  let m;
  while ((m = re.exec(src))) {
    out += escText(src.slice(last, m.index));
    last = re.lastIndex;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (!ALLOWED_RICH.has(tag)) continue;
    if (closing) {
      const at = open.lastIndexOf(tag);
      if (at !== -1) {
        while (open.length > at) out += `</${open.pop()}>`;
      }
      continue;
    }
    if (tag === "br" || tag === "hr") { out += `<${tag}>`; continue; }
    if (tag === "a") {
      const href = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[3]);
      const url = link(href ? (href[1] ?? href[2] ?? href[3] ?? "").replace(/&amp;/g, "&") : "");
      if (!url) continue;
      const external = /^https?:/i.test(url);
      out += `<a href="${e(url)}"${external ? ' target="_blank" rel="noopener nofollow"' : ""}>`;
      open.push("a");
      continue;
    }
    out += `<${tag}>`;
    open.push(tag);
  }
  out += escText(src.slice(last));
  while (open.length) out += `</${open.pop()}>`;
  out = out.replace(/<(p|li|h3|h4|blockquote|strong|b|em|i|u)>\s*<\/\1>/g, "");
  return out.trim().slice(0, max);
}

function cleanBlock(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "");
  const col = int(raw.col, 1, 3, 1);
  switch (type) {
    case "heading": {
      const t = text(raw.text, 160);
      return t ? { type, col, text: t, level: pickEnum(raw.level, ["h2", "h3", "h4"], "h2") } : null;
    }
    case "text": {
      const html = cleanRichText(raw.html);
      return html ? { type, col, html } : null;
    }
    case "image": {
      const src = image(raw.src);
      return src ? { type, col, src, alt: text(raw.alt, 140), link: link(raw.link), size: pickEnum(raw.size, ["small", "medium", "large", "full"], "full"), rounded: bool(raw.rounded, true), caption: text(raw.caption, 120) } : null;
    }
    case "button": {
      const t = text(raw.text, 40);
      const l = link(raw.link);
      return t && l ? { type, col, text: t, link: l, style: pickEnum(raw.style, ["primary", "ghost"], "primary"), new_tab: bool(raw.new_tab, false) } : null;
    }
    case "list": {
      const items = arr(raw.items).map((x) => text(typeof x === "object" && x ? x.t : x, 200)).filter(Boolean).slice(0, 12);
      return items.length ? { type, col, items, style: pickEnum(raw.style, ["check", "bullet", "number"], "check") } : null;
    }
    case "video": {
      const video = parseVideoUrl(raw.url);
      if (!video) return null;
      return { type, col, url: String(raw.url).trim().slice(0, 300), poster: image(raw.poster), text: text(raw.text, 40) || "Watch video" };
    }
    case "features": {
      const items = [];
      for (const it of arr(raw.items)) {
        if (items.length >= 8) break;
        if (!it || typeof it !== "object") continue;
        const t = text(it.title, 80);
        const b = text(it.text, 240);
        if (!t && !b) continue;
        items.push({ icon: text(it.icon, 8), title: t, text: b });
      }
      return items.length ? { type, col, items } : null;
    }
    case "stats": {
      const items = [];
      for (const it of arr(raw.items)) {
        if (items.length >= 6) break;
        if (!it || typeof it !== "object") continue;
        const v = text(it.value, 20);
        const label = text(it.label, 60);
        if (!v) continue;
        items.push({ value: v, label });
      }
      return items.length ? { type, col, items } : null;
    }
    case "spacer":
      return { type, col, size: pickEnum(raw.size, ["sm", "md", "lg"], "md") };
    case "divider":
      return { type, col };
    default:
      return null;
  }
}

export function cleanSectionSettings(raw) {
  const s = obj(raw);
  const blocks = [];
  for (const b of arr(s.blocks)) {
    if (blocks.length >= MAX_BLOCKS) break;
    const c = cleanBlock(b);
    if (c) blocks.push(c);
  }
  const anchor = String(s.anchor ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return {
    bg: pickEnum(s.bg, ["none", "soft", "dark", "brand", "color", "image"], SECTION_DEFAULTS.bg),
    bg_color: cleanColor(s.bg_color),
    bg_image: image(s.bg_image),
    overlay: int(s.overlay, 0, 85, SECTION_DEFAULTS.overlay),
    pad: pickEnum(s.pad, ["sm", "md", "lg", "xl"], SECTION_DEFAULTS.pad),
    width: pickEnum(s.width, ["narrow", "normal", "wide", "full"], SECTION_DEFAULTS.width),
    align: pickEnum(s.align, ["left", "center", "right"], SECTION_DEFAULTS.align),
    cols: int(s.cols, 1, 3, SECTION_DEFAULTS.cols),
    gap: pickEnum(s.gap, ["sm", "md", "lg"], SECTION_DEFAULTS.gap),
    valign: pickEnum(s.valign, ["top", "center"], SECTION_DEFAULTS.valign),
    text_color: cleanColor(s.text_color),
    anchor,
    rounded: bool(s.rounded, SECTION_DEFAULTS.rounded),
    blocks
  };
}

function blockHtml(b) {
  switch (b.type) {
    case "heading":
      return `<${b.level} class="sec-heading">${e(b.text)}</${b.level}>`;
    case "text":
      return `<div class="sec-text">${b.html}</div>`;
    case "image": {
      const img = `<img src="${e(b.src)}" alt="${e(b.alt)}" loading="lazy" decoding="async">`;
      const external = /^https?:/i.test(b.link);
      const media = b.link ? `<a href="${e(b.link)}"${external ? ' target="_blank" rel="noopener"' : ""}>${img}</a>` : img;
      const cap = b.caption ? `<figcaption>${e(b.caption)}</figcaption>` : "";
      return `<figure class="sec-image sec-image--${b.size}${b.rounded ? " sec-image--round" : ""}">${media}${cap}</figure>`;
    }
    case "button":
      return `<p class="sec-button"><a class="btn ${b.style === "ghost" ? "sec-btn-alt" : "btn--primary"} btn--lg" href="${e(b.link)}"${b.new_tab || /^https?:/i.test(b.link) ? ' target="_blank" rel="noopener"' : ""}>${e(b.text)}</a></p>`;
    case "list": {
      const tag = b.style === "number" ? "ol" : "ul";
      return `<${tag} class="sec-list sec-list--${b.style}">${b.items.map((i) => `<li>${e(i)}</li>`).join("")}</${tag}>`;
    }
    case "video": {
      const video = parseVideoUrl(b.url);
      if (!video) return "";
      const url = embedUrl(video, "popup");
      const poster = b.poster ? `<img src="${e(b.poster)}" alt="" loading="lazy" decoding="async">` : "";
      return `<div class="sec-video${poster ? " sec-video--poster" : ""}">${poster}<button type="button" class="hero-watch sec-video__play" data-hh-embed="${e(url)}" data-hh-title="${e(b.text)}" aria-haspopup="dialog"><span aria-hidden="true">&#9654;</span> ${e(b.text)}</button></div>`;
    }
    case "features":
      return `<ul class="sec-features sec-features--n${Math.min(4, b.items.length)}">${b.items
        .map((i) => `<li>${i.icon ? `<span class="sec-features__icon" aria-hidden="true">${e(i.icon)}</span>` : ""}${i.title ? `<h3>${e(i.title)}</h3>` : ""}${i.text ? `<p>${e(i.text)}</p>` : ""}</li>`)
        .join("")}</ul>`;
    case "stats":
      return `<dl class="sec-stats sec-stats--n${Math.min(4, b.items.length)}">${b.items.map((i) => `<div><dt>${e(i.label)}</dt><dd>${e(i.value)}</dd></div>`).join("")}</dl>`;
    case "spacer":
      return `<div class="sec-spacer sec-spacer--${b.size}" aria-hidden="true"></div>`;
    case "divider":
      return `<hr class="sec-divider">`;
    default:
      return "";
  }
}

export function renderSection(component) {
  const s = cleanSectionSettings(component.settings);
  const title = text(component.title, 140);
  if (!s.blocks.length && !title) return "";
  const vars = [];
  if (s.bg === "color" && s.bg_color) vars.push(`--sec-bg:${s.bg_color}`);
  if (s.text_color) vars.push(`--sec-fg:${s.text_color}`);
  if (s.bg === "image" && s.bg_image) vars.push(`--sec-img:url('${s.bg_image.replace(/['"()\\\s]/g, "")}')`);
  vars.push(`--sec-overlay:${(s.overlay / 100).toFixed(2)}`);
  const cls = [
    "component-section", "sec", `sec--bg-${s.bg === "color" && !s.bg_color ? "none" : s.bg === "image" && !s.bg_image ? "none" : s.bg}`,
    `sec--pad-${s.pad}`, `sec--width-${s.width}`, `sec--align-${s.align}`, `sec--cols-${s.cols}`, `sec--gap-${s.gap}`, `sec--valign-${s.valign}`,
    s.text_color ? "sec--custom-fg" : "", s.rounded ? "sec--rounded" : ""
  ].filter(Boolean).join(" ");
  const id = s.anchor ? ` id="${e(s.anchor)}"` : "";
  const columns = [];
  for (let c = 1; c <= s.cols; c++) {
    // a block placed in a column that no longer exists falls into the last column
    const mine = s.blocks.filter((b) => Math.min(b.col, s.cols) === c);
    columns.push(`<div class="sec__col">${mine.map(blockHtml).join("")}</div>`);
  }
  const heading = title ? `<h2 class="sec__title">${e(title)}</h2>` : "";
  const overlay = s.bg === "image" && s.bg_image ? '<div class="sec__overlay" aria-hidden="true"></div>' : "";
  return `<section class="${cls}"${id} style="${e(vars.join(";"))}">${overlay}<div class="sec__inner">${heading}<div class="sec__cols">${columns.join("")}</div></div></section>`;
}
