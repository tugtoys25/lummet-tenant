// Additional premium themes and homepage skins: additive, valid, readable, and they leave every existing theme alone.
import test from "node:test";
import assert from "node:assert/strict";
import { THEMES, HEADERS, HEROES, SURFACES, SHAPES, renderPreviewDocument, studioPublicParts, validateStudioInput } from "../worker/studio-pro/index.js";
import { EXTRA_THEMES } from "../worker/studio-pro/themes-extra.js";
import { SKIN_IDS, skinCss } from "../worker/studio-pro/theme-skins.js";
import { SECTION_KINDS, sectionVariants } from "../worker/studio-pro/sections.js";
import { cardsCss } from "../worker/studio-pro/cards.js";

const core = THEMES.filter((t) => !EXTRA_THEMES.includes(t));
const lum = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * ch(n >> 16) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255); };
const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test("the additional themes come after the existing ones, which are unchanged and have no skin", () => {
  assert.equal(EXTRA_THEMES.length, 12);
  assert.deepEqual(THEMES.slice(0, core.length).map((t) => t.id), core.map((t) => t.id));
  assert.deepEqual(THEMES.slice(core.length).map((t) => t.id), EXTRA_THEMES.map((t) => t.id));
  assert.equal(core.length, 32);
  for (const t of core) assert.equal(t.skin, undefined, t.id);
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
});

test("every additional theme uses a real header, hero, section kind and variant, shape and surface", () => {
  const H = new Set(HEADERS.map((h) => h.id)), R = new Set(HEROES.map((h) => h.id)), SU = new Set(SURFACES.map((s) => s.id));
  for (const t of EXTRA_THEMES) {
    assert.ok(t.id.startsWith("dsp-") && t.premium, t.id);
    assert.ok(H.has(t.header), `${t.id} header ${t.header}`); assert.ok(R.has(t.hero), `${t.id} hero ${t.hero}`);
    assert.ok(t.surface === "none" || SU.has(t.surface), `${t.id} surface ${t.surface}`);
    assert.ok(SHAPES.some((s) => s.id === t.shape), `${t.id} shape`);
    assert.ok(t.sections.length >= 4);
    for (const [k, v] of t.sections) { assert.ok(SECTION_KINDS.some((s) => s.id === k), `${t.id} ${k}`); assert.ok(sectionVariants(k).includes(v), `${t.id} ${k}/${v}`); }
    for (const [k, v] of Object.entries(t.pal)) assert.match(v, /^#[0-9a-f]{6}$/i, `${t.id} ${k}`);
    assert.ok(SKIN_IDS.includes(t.skin), `${t.id} skin ${t.skin}`);
  }
});

test("colours are readable: text on page, text on surface, button text on primary", () => {
  for (const t of EXTRA_THEMES) {
    const p = t.pal;
    assert.ok(contrast(p.tx, p.bg) >= 7, `${t.id} text/page ${contrast(p.tx, p.bg).toFixed(1)}`);
    assert.ok(contrast(p.tx, p.sf) >= 7, `${t.id} text/surface`);
    assert.ok(contrast(p.mu, p.bg) >= 4.5, `${t.id} muted/page ${contrast(p.mu, p.bg).toFixed(1)}`);
    assert.ok(contrast(p.btn, p.p) >= 4.5, `${t.id} button/primary ${contrast(p.btn, p.p).toFixed(1)}`);
  }
});

test("the themes offer real variety: distinct palettes, distinct skins' looks and both light and dark pages", () => {
  assert.equal(new Set(EXTRA_THEMES.map((t) => t.pal.p + t.pal.bg)).size, EXTRA_THEMES.length);
  assert.equal(new Set(EXTRA_THEMES.map((t) => t.skin)).size, EXTRA_THEMES.length);
  const dark = EXTRA_THEMES.filter((t) => lum(t.pal.bg) < 0.18).length;
  assert.ok(dark >= 4 && dark <= 8, `dark ${dark}`);
});

test("every skin is scoped to its own body class and styles the default and the Advanced homepage sections", () => {
  for (const id of SKIN_IDS) {
    const css = skinCss(id), S = `body.dsp-skin-${id}`;
    assert.ok(css.includes(S));
    assert.equal((css.match(/\{/g) || []).length, (css.match(/\}/g) || []).length, `${id} braces`);
    for (const sel of [".section,", ".ah-section", ".section--alt", ".ah-section--alt", ".ah-news", ".ah-chip"]) assert.ok(css.includes(sel), `${id} ${sel}`);
    // every top-level rule begins with the scope (inside @media blocks the rules also carry it)
    const flat = css.replace(/@media[^{]*\{/g, "").replace(/\}\}/g, "}");
    for (const rule of flat.split("}").map((r) => r.trim()).filter(Boolean)) for (const sel of rule.split("{")[0].split(",")) assert.ok(sel.trim().startsWith(S), `${id}: ${sel.trim()}`);
    assert.ok(!/<|javascript:|url\(/i.test(css), `${id} has no markup or urls`);
  }
  assert.equal(skinCss("nope"), "");
});

test("skins never restyle cards, so Card Studio keeps full control of card looks", () => {
  const cards = cardsCss({ id: "dark-premium", custom: {} });
  for (const id of SKIN_IDS) assert.ok(!/\.casino-card|\.news-card|\.rv-card/.test(skinCss(id)), id);
  assert.ok(cards.includes(".casino-card"));
});

test("on the live site an additional theme adds its skin and body class; existing themes and the studio-off site are untouched", () => {
  const mk = (theme) => studioPublicParts({ mode: "theme", theme, custom: {} }, { site: { siteName: "S" }, settings: {} });
  for (const t of EXTRA_THEMES) { const p = mk(t.id); assert.ok(p.bodyClass.includes(`dsp-skin-${t.skin}`), t.id); assert.ok(p.css.includes(`body.dsp-skin-${t.skin}`), t.id); }
  for (const t of core) { const p = mk(t.id); assert.ok(!p.bodyClass.includes("dsp-skin") && !p.css.includes("dsp-skin-"), t.id); }
  assert.equal(studioPublicParts({ mode: "off" }, {}), null);
  const comp = studioPublicParts({ mode: "components", theme: EXTRA_THEMES[0].id, header: "glass", custom: {} }, { site: { siteName: "S" } });
  assert.ok(!comp.css.includes("dsp-skin-") && !comp.bodyClass.includes("dsp-skin"), "component mode never applies a skin");
});

test("the additional themes can be saved and render a complete preview", () => {
  for (const t of EXTRA_THEMES) {
    const v = validateStudioInput({ mode: "theme", theme: t.id, custom: {} });
    assert.ok(!v.error, `${t.id}: ${v.error}`);
    const html = renderPreviewDocument({ mode: "theme", theme: t.id, custom: {} }, { siteName: "Site" }, []);
    assert.ok(html.length > 2000 && html.includes("lds-page"), t.id);
  }
});
