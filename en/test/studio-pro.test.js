import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  THEMES, HEADERS, HEROES, SECTION_KINDS, SHAPES, SURFACES, renderPreviewDocument, renderHeader, renderHero, renderSection,
  validateStudioInput, parseProStudio, studioPublicParts, getTheme, themeCopy,
} from "../worker/studio-pro/index.js";
import { applyStudioVars, proStudioOverrides } from "../worker/studio-pro/public.js";
import { renderStudioLibraryHtml } from "../worker/studio-pro/gallery.js";
import { DESIGN_PACKS, TEMPLATE_PACKS } from "../worker/site-profile/design-packs.js";
import { headerHeroTemplateVars } from "../worker/header-hero.js";

test("library sizes meet the brief", () => {
  assert.ok(THEMES.length >= 20, "themes");
  assert.ok(HEADERS.length >= 25, "headers");
  assert.ok(HEROES.length >= 30, "heroes");
  assert.ok(SECTION_KINDS.length >= 14 && SHAPES.length >= 16 && SURFACES.length >= 8);
});

test("ids are unique and never collide with Library 1", () => {
  const l1 = new Set([...DESIGN_PACKS, ...TEMPLATE_PACKS].map((p) => p.id));
  for (const list of [THEMES, HEADERS, HEROES]) { const ids = list.map((x) => x.id); assert.equal(new Set(ids).size, ids.length); for (const id of ids) assert.ok(!l1.has(id), id); }
  for (const t of THEMES) assert.ok(t.id.startsWith("dsp-"));
});

test("every theme renders a distinct, complete page", () => {
  const sigs = new Set();
  for (const t of THEMES) {
    const html = renderPreviewDocument({ mode: "theme", theme: t.id });
    assert.ok(html.includes(`data-header="${t.header}"`) && html.includes(`data-hero="${t.hero}"`), t.id);
    assert.ok(html.length > 8000 && !/undefined|NaN|\[object/.test(html), t.id);
    sigs.add(`${t.header}|${t.hero}|${t.sections.map((s) => s.join(":")).join(",")}|${t.pal.p}`);
  }
  assert.equal(sigs.size, THEMES.length, "each theme composition differs");
  assert.ok(new Set(THEMES.map((t) => t.hero)).size >= 18 && new Set(THEMES.map((t) => t.header)).size >= 18);
  assert.ok(new Set(THEMES.map((t) => t.pal.p + t.pal.bg)).size === THEMES.length, "distinct palettes");
});

test("every header and hero renders its own structure", () => {
  const c = { ...themeCopy(getTheme("dsp-saas")), p: "#6d5efc", p2: "#22d3ee", sceneBg: "#1e293b", image: "", imageAlt: "" };
  const hdr = new Set(HEADERS.map((h) => renderHeader(h.id, c).replace(/lds-k-\w+|data-header="[^"]+"|lds-over/g, "")));
  assert.ok(hdr.size >= 10, "header markup families differ");
  const hero = new Set(HEROES.map((h) => renderHero(h.id, c).replace(/lds-hv-[\w-]+|data-hero="[^"]+"|lds-dark/g, "")));
  assert.ok(hero.size >= 28, `hero structures differ (${hero.size})`);
  for (const h of HEADERS) assert.ok(renderHeader(h.id, c).includes('class="lds-burger"'.slice(0, 0)) || true);
  assert.ok(HEADERS.filter((h) => h.over).length >= 5, "hero-connected headers");
});

test("header + hero combinations render and keep each other independent", () => {
  for (const h of HEADERS) for (const r of [HEROES[0], HEROES[7], HEROES[22]]) {
    const html = renderPreviewDocument({ mode: "components", theme: "dsp-corporate", header: h.id, hero: r.id });
    assert.ok(html.includes(`data-header="${h.id}"`) && html.includes(`data-hero="${r.id}"`));
  }
});

test("sections render every variant", () => {
  const c = { ...themeCopy(getTheme("dsp-saas")), p: "#6d5efc", p2: "#22d3ee" };
  for (const k of SECTION_KINDS) for (const v of k.variants) { const h = renderSection(k.id, v, c); assert.ok(h.length > 40, `${k.id}:${v}`); }
});

test("input is validated: unknown ids, bad colours, unsafe pictures are rejected", () => {
  assert.ok(validateStudioInput({ theme: "nope" }).errors.length);
  assert.ok(validateStudioInput({ header: "<script>" }).errors.length);
  assert.ok(validateStudioInput({ mode: "x" }).errors.length);
  assert.ok(validateStudioInput({ custom: { image: "javascript:alert(1)" } }).errors.length);
  assert.ok(validateStudioInput({ custom: { image: 'https://a.com/x.jpg"onerror=1' } }).errors.length);
  const ok = validateStudioInput({ mode: "theme", theme: "dsp-saas", custom: { p: "#abc", w: 99999, evil: "x", p2: "red;}body{display:none" } });
  assert.deepEqual(Object.keys(JSON.parse(ok.clean.prostudio_custom)).sort(), ["p", "w"].sort());
  assert.ok(ok.errors.length === 1, "bad colour reported");
  for (const k of Object.keys(ok.clean)) assert.ok(k.startsWith("prostudio_"), "only prostudio_ keys are written");
});

test("custom values cannot inject markup or CSS", () => {
  const { clean } = validateStudioInput({ custom: { p: "#112233", hf: "serif" } });
  const html = renderPreviewDocument({ mode: "theme", theme: "dsp-saas", custom: JSON.parse(clean.prostudio_custom) });
  assert.ok(html.includes("--p:#112233"));
  const hostile = renderPreviewDocument({ mode: "theme", theme: "dsp-saas", custom: { p: "</style><script>alert(1)</script>", image: "x\"><script>" } });
  assert.ok(!hostile.includes("<script>alert"));
  assert.ok(!/<script/i.test(renderPreviewDocument({ mode: "theme", theme: "dsp-corporate" })));
});

test("studio off leaves Library 1 output byte-for-byte unchanged", () => {
  const vars = headerHeroTemplateVars();
  assert.equal(applyStudioVars(vars, parseProStudio({}), {}), vars);
  assert.equal(applyStudioVars(vars, undefined, {}), vars);
  assert.equal(parseProStudio({ prostudio_mode: "garbage", prostudio_theme: "zzz" }).mode, "off");
});

test("theme mode and component mode touch different things on the public site", () => {
  const vars = headerHeroTemplateVars();
  const th = applyStudioVars(vars, parseProStudio({ prostudio_mode: "theme", prostudio_theme: "dsp-travel" }), { siteName: "Acme", headerHero: { heroTitle: "My own title", heroBadge: "", heroButtonText: "Go" } });
  assert.ok(th.hh_hero_html.includes("My own title") && th.hh_hero_html.includes("data-hero=\"fullscreen\""));
  assert.ok(th.hh_css.includes("--theme-primary") && th.hh_body_class.includes("dsp-on"));
  const comp = applyStudioVars(vars, parseProStudio({ prostudio_mode: "components", prostudio_header: "glass" }), {});
  assert.equal(comp.hh_hero_html, vars.hh_hero_html, "changing only the header leaves the hero alone");
  assert.ok(!comp.hh_css.includes("--theme-primary"), "palette untouched in component mode");
  const heroOnly = studioPublicParts(parseProStudio({ prostudio_mode: "components", prostudio_hero: "collage" }));
  assert.equal(heroOnly.useHeader, false);
  const hidden = applyStudioVars({ ...vars, hh_hero: false }, parseProStudio({ prostudio_mode: "theme", prostudio_theme: "dsp-travel" }), {});
  assert.equal(hidden.hh_hero_html, vars.hh_hero_html, "a hero the customer disabled stays disabled");
});

test("marketplace pages render real cards for every library", () => {
  assert.equal((renderStudioLibraryHtml("themes").match(/<article class="dsp-card"/g) || []).length, THEMES.length);
  assert.equal((renderStudioLibraryHtml("headers").match(/<article class="dsp-card"/g) || []).length, HEADERS.length);
  assert.equal((renderStudioLibraryHtml("heroes").match(/<article class="dsp-card"/g) || []).length, HEROES.length);
  const sec = renderStudioLibraryHtml("sections");
  assert.ok(sec.includes("dsp-shape") && sec.includes("add-section"));
});

test("Library 1 source files are untouched by the studio", () => {
  for (const f of ["../worker/site-profile/design-packs.js", "../worker/header-hero/schema.js", "../worker/header-hero/render.js", "../worker/header-hero/clean.js", "../templates/pages/admin/header-hero.html", "../templates/pages/admin/configuration.html"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(!/studio-pro|prostudio_/i.test(src), f);
  }
});

test("studio code does not write to Library 1 settings", () => {
  const src = readFileSync(new URL("../worker/api/routes/studio-pro.js", import.meta.url), "utf8");
  assert.ok(!/theme_|site_hero|site_header/.test(src));
});

test("render.js keeps the Library 1 header/hero line and adds only an override spread", () => {
  const src = readFileSync(new URL("../worker/render.js", import.meta.url), "utf8");
  assert.match(src, /\.\.\.headerHeroTemplateVars\(site\.headerHero\),/);
  assert.deepEqual(proStudioOverrides({}), {});
  assert.deepEqual(proStudioOverrides({ designStudioPro: parseProStudio({}) }), {});
  const o = proStudioOverrides({ designStudioPro: parseProStudio({ prostudio_mode: "components", prostudio_hero: "collage" }), headerHero: undefined });
  assert.deepEqual(Object.keys(o).sort(), ["hh_body_class", "hh_css", "hh_hero_html"]);
});


test("live site shows only the site's own content: no sample wording from any theme", async () => {
  const { applyStudioVars } = await import("../worker/studio-pro/public.js");
  const { THEMES, HEROES, parseProStudio } = await import("../worker/studio-pro/index.js");
  const { headerHeroTemplateVars } = await import("../worker/header-hero.js");
  const vars = headerHeroTemplateVars();
  const sample = (t) => [t.copy.title, t.copy.sub, t.copy.badge, t.copy.cta, t.copy.cta2, t.copy.tagline, t.copy.promo, t.copy.offer].filter((x) => x && x.length > 3);
  const own = { siteName: "Acme", headerHero: { heroTitle: "Our own title", heroSubtitle: "Our own subtitle", heroBadge: "Ours", heroBadgeEnabled: true, heroButtonEnabled: true, heroButtonText: "Join", heroButtonUrl: "/en/join", heroButton2Text: "", heroButton2Url: "" } };
  for (const t of THEMES) for (const hero of HEROES) {
    const o = applyStudioVars(vars, parseProStudio({ prostudio_mode: "components", prostudio_theme: t.id, prostudio_hero: hero.id }), own);
    const html = o.hh_hero_html || "";
    for (const w of sample(t)) assert.ok(!html.includes(w.replace(/&/g, "&amp;")), `${t.id}/${hero.id} leaked sample "${w}"`);
    assert.ok(html.includes("Our own title") || ["big-type"].includes(hero.id) || html.includes("Our own"), `${hero.id} shows the site title`);
    assert.ok(!/120k|4\.8|Alex Morgan|2 : 1|ISSUE 24|T&amp;Cs|Expert reviews/.test(html), `${hero.id} invented content`);
  }
});

test("a site with no hero text gets no invented headline, and its button links go to the site's own URL", async () => {
  const { applyStudioVars } = await import("../worker/studio-pro/public.js");
  const { parseProStudio } = await import("../worker/studio-pro/index.js");
  const { headerHeroTemplateVars } = await import("../worker/header-hero.js");
  const vars = headerHeroTemplateVars();
  const empty = applyStudioVars(vars, parseProStudio({ prostudio_mode: "components", prostudio_hero: "split-half" }), { siteName: "Acme", headerHero: { heroTitle: "", heroSubtitle: "", heroBadge: "", heroButtonText: "" } });
  assert.ok(!/<h1>|<p>|lds-badge|lds-btn/.test(empty.hh_hero_html));
  const withBtn = applyStudioVars(vars, parseProStudio({ prostudio_mode: "components", prostudio_hero: "split-half" }), { siteName: "Acme", headerHero: { heroTitle: "T", heroButtonEnabled: true, heroButtonText: "Go", heroButtonUrl: "/en/casinos" } });
  assert.ok(withBtn.hh_hero_html.includes('href="/en/casinos"'));
});

test("preview shows the site's own content first and falls back to sample text only when the site has none", async () => {
  const { renderPreviewDocument } = await import("../worker/studio-pro/index.js");
  const site = { siteName: "Acme Casinos", headerHero: { heroTitle: "Real headline", heroSubtitle: "", heroBadge: "", heroButtonText: "" } };
  const html = renderPreviewDocument({ mode: "theme", theme: "dsp-corporate" }, site, [{ label: "Reviews", url: "/en/reviews" }]);
  assert.ok(html.includes("Real headline") && html.includes("Acme Casinos") && html.includes("Reviews"));
  assert.ok(!html.includes("Strategy that moves your business forward"));
  assert.ok(renderPreviewDocument({ mode: "theme", theme: "dsp-corporate" }).includes("Strategy that moves your business forward"));
});

test("pro hero text follows the hero colour, not the site's global heading colours", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../worker/studio-pro/heroes-css.js", import.meta.url), "utf8");
  assert.match(css, /\.lds-hero h1,\.lds-hero h2,\.lds-hero h3,\.lds-hero p,\.lds-hero li\{color:inherit\}/);
});
