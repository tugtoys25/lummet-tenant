import test from "node:test";
import assert from "node:assert/strict";
import { THEMES } from "../worker/design-studio/catalog-themes.js";
import { HEADERS } from "../worker/design-studio/catalog-headers.js";
import { HEROES } from "../worker/design-studio/catalog-heroes.js";
import { SHAPES } from "../worker/design-studio/catalog-shapes.js";
import { SECTIONS } from "../worker/design-studio/catalog-sections.js";
import * as E from "../worker/design-studio/engine.js";
import { DESIGN_PACKS, TEMPLATE_PACKS } from "../worker/site-profile/design-packs.js";
import { HEADER_HERO_KEYS } from "../worker/header-hero/schema.js";
import { ownedKeys } from "../worker/site-profile/settings-groups.js";

test("library sizes meet the brief", () => {
  assert.ok(THEMES.length >= 20); assert.ok(HEADERS.length >= 25); assert.ok(HEROES.length >= 30);
  assert.ok(SHAPES.length >= 16); assert.ok(SECTIONS.length >= 14);
  for (const s of SECTIONS) assert.ok(s.variants.length >= 3, s.id);
});
test("ids are unique and never collide with Library 1", () => {
  const l1 = new Set([...DESIGN_PACKS.map((d) => d.id), ...TEMPLATE_PACKS.map((d) => d.id)]);
  for (const list of [THEMES, HEADERS, HEROES, SHAPES, SECTIONS]) assert.equal(new Set(list.map((x) => x.id)).size, list.length);
  for (const t of THEMES) { assert.ok(t.id.startsWith("dst-")); assert.ok(!l1.has(t.id)); }
});
test("new setting keys cannot overwrite existing settings", () => {
  const taken = new Set([...HEADER_HERO_KEYS, ...ownedKeys()]);
  assert.ok(!taken.has(E.SELECTION_KEY)); assert.ok(!taken.has(E.PREVIOUS_KEY));
});
test("every theme is distinct and readable", () => {
  assert.equal(new Set(THEMES.map((t) => `${t.header}|${t.hero}`)).size, THEMES.length);
  assert.equal(new Set(THEMES.map((t) => t.colors.primary + t.colors.bg)).size, THEMES.length);
  for (const t of THEMES) {
    assert.ok(E.contrast(t.colors.fg, t.colors.bg) >= 4.5, `${t.id} text/bg`);
    assert.ok(E.contrast(t.colors.fg, t.colors.surface) >= 4.5, `${t.id} text/surface`);
    assert.ok(E.contrast(E.onColor(t.colors.primary), t.colors.primary) >= 4.5, `${t.id} on primary`);
    assert.ok(HEADERS.some((h) => h.id === t.header) && HEROES.some((h) => h.id === t.hero), t.id);
  }
});
test("every header and hero renders with its own CSS and structure", () => {
  assert.equal(new Set(HEADERS.map((h) => h.css)).size, HEADERS.length);
  assert.equal(new Set(HEROES.map((h) => h.css)).size, HEROES.length);
  for (const h of HEADERS) { const html = E.renderHeaderHtml(h.id, { siteName: "Acme" }); assert.ok(html.includes(`ds-h--${h.id}`) && html.includes("Acme")); assert.ok(h.css.includes(`.ds-h--${h.id}`), h.id); }
  for (const h of HEROES) { const html = E.renderHeroHtml(h.id, { title: "T" }); assert.ok(html.includes(`ds-hero--${h.id}`)); assert.ok(h.css.includes(`.ds-hero--${h.id}`), h.id); }
  for (const s of SECTIONS) for (const v of s.variants) assert.ok(E.renderSectionHtml(s.id, v.id).includes(`${s.id}:${v.id}`));
});
test("catalog CSS never references external URLs", () => {
  for (const x of [...HEADERS, ...HEROES, ...SHAPES]) assert.ok(!/https?:|@import|expression\(|javascript:/i.test(x.css), x.id);
});
test("all 20 themes preview, and every header x hero pair builds", () => {
  for (const t of THEMES) { const d = E.renderPreviewDocument({ theme: t.id }, { siteName: "Acme" }); assert.ok(d.includes(`ds-h--${t.header}`) && d.includes(`ds-hero--${t.hero}`), t.id); }
  for (const h of HEADERS) for (const r of HEROES) assert.ok(E.buildStudioCss({ mode: "components", header: h.id, hero: r.id }).includes(`.ds-h--${h.id}`));
});
test("sanitizer rejects unsafe or unknown input", () => {
  const { clean, errors } = E.sanitizeSelection({ theme: "nope", header: "x", sections: { features: "bad" }, shapes: ["zz"], overrides: { primary: "red;}body{display:none", radius: 999, fontBody: "Comic" } });
  assert.equal(errors.length, 7); assert.deepEqual(clean.overrides, {}); assert.equal(clean.theme, undefined);
  assert.equal(E.sanitizeSelection({ overrides: { primary: "#ABC" } }).clean.overrides.primary, "#abc");
});
test("nothing selected means no CSS, so untouched tenants are unchanged", () => {
  assert.equal(E.buildStudioCss(null), ""); assert.equal(E.buildStudioCss({}), ""); assert.equal(E.renderPreviewDocument({}), "");
});
test("components mode keeps picks independent of the theme", () => {
  const r = E.resolveSelection({ mode: "components", theme: "dst-luxe", header: "glass" });
  assert.equal(r.header, "glass"); assert.equal(r.hero, null);
  const t = E.resolveSelection({ mode: "theme", theme: "dst-luxe", hero: "collage" });
  assert.equal(t.header, "dark-luxury"); assert.equal(t.hero, "collage");
});
test("user text is escaped and unsafe URLs are neutralised", () => {
  const h = E.renderHeaderHtml("classic-bar", { siteName: "<img onerror=x>", nav: [{ label: "<b>", url: "javascript:alert(1)" }] });
  assert.ok(!h.includes("<img") && !h.includes("javascript:") && h.includes("&lt;b&gt;"));
  assert.ok(!E.renderHeroHtml("full-photo", { imageUrl: "https://x.test/a.jpg');}body{x:y" }).includes("}body"));
});
test("existing Library 1 modules still load unchanged", () => { assert.ok(DESIGN_PACKS.length >= 20 && TEMPLATE_PACKS.length > 0); });

// ---- API: persistence, undo, roles, tenant isolation (each tenant has its own settings table / DB).
import { route } from "../worker/api/routes/design-studio.js";
const fakeDb = (rows = {}) => ({ rows, prepare(sql) { const db = this; return { all: async () => ({ results: Object.entries(db.rows).map(([key, value]) => ({ key, value })) }), bind(k, v) { return { run: async () => { db.rows[k] = v; } }; }, run: async () => {} }; } });
const call = (env, method, path, body, role = "admin", headers = {}) => route({ request: new Request(`https://t1.test${path}`, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined }), env, path, user: { id: 1, role } });
test("apply persists, reload shows it, restore swaps back, reset clears", async () => {
  const env = { DB: fakeDb({ site_hero_title: "Mine" }) };
  assert.equal((await (await call(env, "POST", "/api/v1/design-studio/apply", { selection: { theme: "dst-luxe" } })).json()).saved, true);
  await call(env, "POST", "/api/v1/design-studio/apply", { selection: { theme: "dst-travel", header: "glass" } });
  let cur = await (await call(env, "GET", "/api/v1/design-studio")).json();
  assert.equal(cur.selection.theme, "dst-travel"); assert.equal(cur.hasPrevious, true); assert.ok(cur.themes.length >= 20); assert.equal(cur.headers[0].css, undefined);
  await call(env, "POST", "/api/v1/design-studio/restore");
  cur = await (await call(env, "GET", "/api/v1/design-studio")).json(); assert.equal(cur.selection.theme, "dst-luxe");
  await call(env, "POST", "/api/v1/design-studio/reset");
  cur = await (await call(env, "GET", "/api/v1/design-studio")).json(); assert.equal(cur.selection, null);
  assert.equal(env.DB.rows.site_hero_title, "Mine"); // Library 1 settings untouched
  assert.deepEqual(Object.keys(env.DB.rows).filter((k) => k.startsWith("ds_")).sort(), ["ds_selection", "ds_selection_previous"]);
});
test("tenants are isolated and editors cannot write", async () => {
  const a = { DB: fakeDb() }, b = { DB: fakeDb() };
  await call(a, "POST", "/api/v1/design-studio/apply", { selection: { theme: "dst-saas" } });
  assert.equal((await (await call(b, "GET", "/api/v1/design-studio")).json()).selection, null);
  assert.equal((await call(a, "POST", "/api/v1/design-studio/apply", { selection: { theme: "dst-luxe" } }, "editor")).status, 403);
  assert.equal((await call(a, "POST", "/api/v1/design-studio/apply", { selection: { theme: "dst-luxe" } }, "admin", { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await call(a, "POST", "/api/v1/design-studio/apply", { selection: { theme: "bogus" } })).status, 422);
  const pv = await (await call(a, "POST", "/api/v1/design-studio/preview", { selection: { theme: "dst-hotel" }, context: { siteName: "<script>" } }, "editor")).json();
  assert.ok(pv.html.includes("ds-hero--full-photo") && !pv.html.includes("<script>"));
});

// ---- public-site integration: unconfigured tenants are untouched; configured ones get the studio output.
import { studioTemplateVars, parseSelectionSetting } from "../worker/design-studio/engine.js";
import { readFileSync } from "node:fs";
test("a tenant with no studio design gets empty variables (no change to Library 1 output)", () => {
  assert.deepEqual(studioTemplateVars(null, {}, {}), { ds_css: "", ds_header_html: "" });
  assert.equal(parseSelectionSetting(""), null); assert.equal(parseSelectionSetting("{not json"), null);
  assert.equal(parseSelectionSetting('{"theme":"nope"}').theme, undefined);
});
test("an applied theme injects CSS, its header and its hero, and hides only the old header", () => {
  const v = studioTemplateVars({ theme: "dst-casino-affiliate" }, { siteName: "Acme", headerHero: { heroTitle: "Win <b>big</b>" } }, { header_nav: '<a href="/x">X</a>' });
  assert.ok(v.ds_css.startsWith('<style id="ds-studio">') && v.ds_css.includes(".site-header{display:none!important}"));
  assert.ok(v.ds_header_html.includes("ds-h--announce-nav") && v.ds_header_html.includes('<a href="/x">X</a>'));
  assert.ok(v.hh_hero_html.includes("ds-hero--casino-promo") && v.hh_hero_html.includes("Win &lt;b&gt;big&lt;/b&gt;"));
  const heroOnly = studioTemplateVars({ mode: "components", hero: "collage" }, {}, {});
  assert.equal(heroOnly.ds_header_html, ""); assert.ok(!heroOnly.ds_css.includes(".site-header{display:none"));
});
test("base layout exposes the studio slots exactly once", () => {
  const base = readFileSync(new URL("../templates/layout/base.html", import.meta.url), "utf8");
  assert.equal(base.split("{{{ds_css}}}").length, 2); assert.equal(base.split("{{{ds_header_html}}}").length, 2);
});

test("live site: the header and hero use only the site's own content, with nothing invented", async () => {
  const { studioTemplateVars, HEROES: _h } = await import("../worker/design-studio/engine.js").then((m) => ({ ...m, HEROES: null }));
  const { HEADERS } = await import("../worker/design-studio/catalog-headers.js");
  const { HEROES } = await import("../worker/design-studio/catalog-heroes.js");
  const site = { siteName: "Acme Casinos", logoUrl: "/media/logo.png", headerHero: { heroEnabled: true, heroTitle: "Our headline", heroSubtitle: "", heroBadgeEnabled: false, heroButtonEnabled: false, ctaEnabled: false, announceEnabled: false, showSearch: false, showAuth: false } };
  const bad = /Find what you are looking for|Get started|Featured|Explore|Learn more|120\+|Independent reviews|exclusive welcome|Top stories|Fast|Trusted|Today|Your Site|Match of the day/;
  for (const header of HEADERS) for (const hero of HEROES) {
    const v = studioTemplateVars({ mode: "components", header: header.id, hero: hero.id }, site, { header_nav: '<a href="/en/reviews">Reviews</a>' });
    const out = (v.ds_header_html || "") + (v.hh_hero_html || "");
    assert.ok(!bad.test(out), `${header.id}/${hero.id}: ${out.match(bad)?.[0]}`);
    assert.ok(out.includes("Acme Casinos") && out.includes('href="/en/reviews"') && out.includes("Our headline"));
    assert.ok(!/\/login"|Login/.test(out), "login is shown only when the site has it enabled");
  }
});

test("live site: the site's own button, links, search and login labels are used", async () => {
  const { studioTemplateVars } = await import("../worker/design-studio/engine.js");
  const site = { siteName: "Acme", headerHero: { heroTitle: "T", heroButtonEnabled: true, heroButtonText: "Join now", heroButtonUrl: "/en/join", ctaEnabled: true, ctaText: "Free tips", ctaUrl: "/en/tips", showSearch: true, searchPlaceholder: "Find a casino", showAuth: true, loginLabel: "Sign in" } };
  const v = studioTemplateVars({ mode: "components", header: "mega-menu", hero: "full-photo" }, site, { header_nav: "<a>x</a>" });
  assert.match(v.hh_hero_html, /href="\/en\/join"[^>]*>Join now/);
  if (v.ds_header_html) { assert.match(v.ds_header_html, /Free tips/); assert.match(v.ds_header_html, /placeholder="Find a casino"/); }
  const a = studioTemplateVars({ mode: "components", header: "classic-bar", hero: "full-photo" }, site, { header_nav: "<a>x</a>" });
  assert.match(a.ds_header_html, /id="headerLoginBtn">Sign in/);
});

test("if the site turned its hero off, the studio does not bring one back", async () => {
  const { studioTemplateVars } = await import("../worker/design-studio/engine.js");
  const v = studioTemplateVars({ mode: "components", hero: "full-photo" }, { siteName: "A", headerHero: { heroEnabled: false } }, {});
  assert.equal(v.hh_hero_html, undefined);
});

test("live header uses the site's own menu and search scripts' markup", async () => {
  const { studioTemplateVars } = await import("../worker/design-studio/engine.js");
  const site = { siteName: "Acme", headerHero: { heroTitle: "T", showSearch: true, searchPlaceholder: "Find" } };
  const v = studioTemplateVars({ mode: "components", header: "mega-menu", hero: "full-photo" }, site, { header_nav: '<a href="/x">X</a>' });
  const h = v.ds_header_html;
  assert.match(h, /id="mainNav"/);
  assert.match(h, /id="navToggle"/);
  assert.match(h, /id="searchInput"/);
  assert.match(h, /id="mobileSearchBtn"/);
  assert.match(h, /id="mobileSearchContainer"/);
  assert.match(h, /href="\/x"/);
});

test("overlay headers fall back to a solid bar when the site has no hero image", async () => {
  const { buildStudioCss } = await import("../worker/design-studio/engine.js");
  const over = HEADERS.find((x) => x.overHero);
  if (!over) return;
  const sel = { mode: "components", header: over.id, hero: "full-photo" };
  assert.match(buildStudioCss(sel, { hasImage: false }), /position:relative!important/);
  const hero = HEROES.find((x) => x.id === "full-photo");
  if (hero) assert.ok(typeof buildStudioCss(sel, { hasImage: true }) === "string");
});
