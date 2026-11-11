// Server-rendered marketplace cards for the four studio libraries. Cards use real rendered markup (scaled down), not placeholders.
import { esc } from "./util.js";
import { THEMES, CATEGORIES, STYLES } from "./themes.js";
import { HEADERS } from "./headers.js";
import { HEROES } from "./heroes.js";
import { SECTION_KINDS, renderSection } from "./sections.js";
import { SHAPES, SURFACES } from "./shapes.js";
import { renderThumbMarkup, cssVars, resolve, studioCss } from "./compose.js";
import { themeCopy } from "./themes.js";

const badge = (t) => [t.featured ? "Featured" : "", t.popular ? "Popular" : "", t.added >= 15 ? "New" : "", t.premium ? "Premium" : "Free"].filter(Boolean).map((b) => `<span class="dsp-tag dsp-tag-${b.toLowerCase()}">${b}</span>`).join("");
const thumb = (inner, scale = 0.34) => `<div class="dsp-thumb" style="--sc:${scale}"><div class="dsp-thumb-in">${inner}</div></div>`;

function card(kind, id, label, desc, meta, inner, extra = "", attrs = "") {
  return `<article class="dsp-card" data-kind="${kind}" data-id="${esc(id)}" data-search="${esc((label + " " + desc + " " + meta).toLowerCase())}" ${attrs}>${thumb(inner)}<div class="dsp-card-body"><div class="dsp-tags">${extra}</div><h3>${esc(label)}</h3><p class="dsp-cat">${esc(meta)}</p><p>${esc(desc)}</p><div class="dsp-actions"><button type="button" class="btn btn--sm" data-ds="preview">Preview</button><button type="button" class="btn btn--primary btn--sm" data-ds="apply">Apply</button></div><span class="dsp-selected" hidden>Selected</span></div></article>`;
}

export function renderStudioLibraryHtml(lib, site = {}, nav = []) {
  if (lib === "themes") {
    const cats = CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join(""), styles = STYLES.map((c) => `<option>${esc(c)}</option>`).join("");
    const controls = `<div class="dsp-filters"><input type="search" id="dsSearch" placeholder="Search themes" aria-label="Search themes"><select id="dsCat" aria-label="Category"><option value="">All categories</option>${cats}</select><select id="dsStyle" aria-label="Style"><option value="">All styles</option>${styles}</select><select id="dsSort" aria-label="Show"><option value="">All</option><option value="featured">Featured</option><option value="popular">Popular</option><option value="new">Recently added</option><option value="recommended">Recommended</option></select></div>`;
    const cards = THEMES.map((t) => card("theme", t.id, t.label, t.desc, `${t.category} · ${t.style}`, renderThumbMarkup("theme", t.id, t.id, site, nav), badge(t), `data-category="${esc(t.category)}" data-style="${esc(t.style)}" data-featured="${t.featured ? 1 : 0}" data-popular="${t.popular ? 1 : 0}" data-added="${t.added}"`)).join("");
    return `${controls}<div class="dsp-grid">${cards}</div>`;
  }
  if (lib === "headers") {
    const fams = [...new Set(HEADERS.map((h) => h.family))];
    return `<div class="dsp-filters"><input type="search" id="dsSearch" placeholder="Search headers" aria-label="Search headers"></div><div class="dsp-grid dsp-grid-wide">${HEADERS.map((h) => card("header", h.id, h.label, h.desc, `${h.family} · ${h.skin}${h.over ? " · connected to hero" : ""}`, renderThumbMarkup("header", h.id, "dsp-corporate", site, nav), h.over ? '<span class="dsp-tag">Hero-connected</span>' : "")).join("")}</div><!-- ${fams.length} families -->`;
  }
  if (lib === "heroes") {
    return `<div class="dsp-filters"><input type="search" id="dsSearch" placeholder="Search heroes" aria-label="Search heroes"></div><div class="dsp-grid dsp-grid-wide">${HEROES.map((h) => card("hero", h.id, h.label, h.desc, h.tags.join(" · "), renderThumbMarkup("hero", h.id, "dsp-saas", site, nav))).join("")}</div>`;
  }
  // sections + shapes
  const r = resolve({ mode: "theme", theme: "dsp-saas" });
  const ctx = { ...r.copy, p: r.base.pal.p, p2: r.base.pal.p2 };
  const secs = SECTION_KINDS.map((k) => `<div class="dsp-secgroup"><h3>${esc(k.label)}</h3><div class="dsp-secrow">${k.variants.map((v) => `<article class="dsp-card dsp-sec-card" data-kind="section" data-id="${esc(k.id)}:${esc(v)}" data-search="${esc((k.label + " " + v).toLowerCase())}"><div class="dsp-thumb dsp-thumb-sec" style="--sc:.3"><div class="dsp-thumb-in"><div class="lds-page" style="${cssVars(r)}">${renderSection(k.id, v, ctx)}</div></div></div><div class="dsp-card-body"><h4>${esc(v)}</h4><div class="dsp-actions"><button type="button" class="btn btn--sm" data-ds="add-section">Add to homepage layout</button></div></div></article>`).join("")}</div></div>`).join("");
  const shapes = `<h2>Shapes</h2><div class="dsp-shapes">${SHAPES.map((s) => `<button type="button" class="dsp-shape" data-ds="shape" data-id="${s.id}"><span class="lds-sh-${s.id}" style="background:linear-gradient(135deg,#6d5efc,#22d3ee)"></span>${esc(s.label)}</button>`).join("")}</div><h2>Surfaces and textures</h2><div class="dsp-shapes">${SURFACES.map((s) => `<button type="button" class="dsp-shape" data-ds="surface" data-id="${s.id}"><span class="lds-sf-${s.id}" style="${s.id === "none" ? "background:#e5e7eb" : ""}"></span>${esc(s.label)}</button>`).join("")}</div>`;
  return `<div class="dsp-filters"><input type="search" id="dsSearch" placeholder="Search sections" aria-label="Search sections"></div><div id="dsSecList" class="dsp-seclist"><h2>Your homepage section order</h2><ol id="dsOrder"></ol><p class="muted">Add sections below, reorder, then Apply. Existing homepage content is not touched.</p></div>${secs}${shapes}`;
}

export function studioCatalogJson(lib) {
  const common = { lib, themes: THEMES.map((t) => ({ id: t.id, label: t.label, header: t.header, hero: t.hero })), headers: HEADERS.map((h) => ({ id: h.id, label: h.label })), heroes: HEROES.map((h) => ({ id: h.id, label: h.label })) };
  return common;
}

export const studioThumbCss = () => studioCss();
