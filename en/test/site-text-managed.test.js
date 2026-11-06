// Managed site text (Phase 12): registry, seeds, resolver, sidebar/footer variables, landing text precedence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ALL_TEXT_FIELDS, TEXT_DEFAULTS } from "../worker/site-text/registry.js";
import { buildSiteText, escapeText, fillTokens, landingText, siteTextValue, siteTextVars } from "../worker/site-text/resolve.js";

test("seed migrations are in sync with their generators", () => {
  execFileSync(process.execPath, ["scripts/generate-site-text-seed.mjs", "--check"], { stdio: "pipe" });
  execFileSync(process.execPath, ["scripts/generate-countries-seed.mjs", "--check"], { stdio: "pipe" });
});

test("registry keys are unique and every default is a string", () => {
  const keys = ALL_TEXT_FIELDS.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.equal(typeof TEXT_DEFAULTS[k], "string");
});

test("the text seed lists every registry key and is idempotent", () => {
  const sql = readFileSync("migrations/0014_seed_site_text.sql", "utf8");
  assert.match(sql, /INSERT OR IGNORE/);
  for (const f of ALL_TEXT_FIELDS) assert.ok(sql.includes(`'${f.key}'`), f.key);
});

test("the countries seed has the whole world, including Kosovo, and seeds drafts", () => {
  const sql = readFileSync("migrations/0015_seed_countries.sql", "utf8");
  assert.match(sql, /INSERT OR IGNORE/);
  assert.equal((sql.match(/\('[A-Z]{2}',/g) || []).length, 250);
  for (const code of ["GB", "US", "IT", "XK", "JP"]) assert.ok(sql.includes(`('${code}',`), code);
});

test("empty settings give the registry defaults; stored values win; numbers are clamped", () => {
  const d = buildSiteText({});
  assert.equal(d.home_casinos_title, "Top Rated Casinos");
  const t = buildSiteText({ home_casinos_title: "Best picks", sidebar_news_count: "999", sidebar_casinos_title: "   " });
  assert.equal(t.home_casinos_title, "Best picks");
  assert.equal(t.sidebar_news_count, "10");
  assert.equal(t.sidebar_casinos_title, "Top Rated Casinos");
});

test("tokens are filled and text is escaped for HTML", () => {
  assert.equal(fillTokens("{site} {year} {count} {query} {type}", { site: "A", year: 2026, count: 3, query: "q", type: "T" }), "A 2026 3 q T");
  const v = siteTextVars(buildSiteText({ home_casinos_title: "<b>x</b>" }), "Site");
  assert.equal(v.hs_casinos_title, "&lt;b&gt;x&lt;/b&gt;");
});

test("sidebar: off hides it and gives the page the full width; blocks and order are settings", () => {
  const off = siteTextVars(buildSiteText({ sidebar_enabled: "0" }), "S");
  assert.equal(off.sidebar_visible, false);
  assert.match(off.layout_full, /layout-wrapper--full/);
  const allBlocksOff = siteTextVars(buildSiteText({ sidebar_casinos_enabled: "0", sidebar_news_enabled: "0", sidebar_countries_enabled: "0", sidebar_categories_enabled: "0" }), "S");
  assert.equal(allBlocksOff.sidebar_visible, false);
  const on = siteTextVars(buildSiteText({ sidebar_categories_order: "1", sidebar_casinos_order: "4" }), "S");
  assert.equal(on.sidebar_visible, true);
  assert.equal(on.layout_full, "");
  assert.equal(on.sb_categories_order, 1);
  assert.equal(on.sb_casinos_order, 4);
});

test("a module switched off hides its homepage section and sidebar block", () => {
  const v = siteTextVars(buildSiteText({}), "S", (id) => id !== "news");
  assert.equal(v.hs_news, false);
  assert.equal(v.sb_news, false);
  assert.equal(v.hs_casinos, true);
});

test("footer wording comes from settings with {site} and {year}", () => {
  const v = siteTextVars(buildSiteText({ footer_title_casinos: "Play", footer_copyright: "(c) {year} {site}" }), "Acme");
  assert.equal(v.ft_title_casinos, "Play");
  assert.equal(v.ft_copyright, `(c) ${new Date().getUTCFullYear()} Acme`);
});

test("landing text: setting beats default; {site} and {type} fill; headings are escaped", () => {
  const site = { siteName: "Acme", text: buildSiteText({ landing_casino_title: "Our <Casinos>" }) };
  const lt = landingText(site, "casino");
  assert.equal(lt.title, "Our <Casinos>");
  assert.equal(lt.titleHtml, "Our &lt;Casinos&gt;");
  assert.equal(landingText({ siteName: "Acme", text: buildSiteText({}) }, "casino").seoTitle, "All Online Casinos — Acme");
  assert.equal(landingText({ siteName: "Acme" }, "comparison", { type: "Bonus" }).title, "Bonus Comparisons");
  assert.equal(siteTextValue({ siteName: "Acme" }, "landing_search_results_heading", { query: "x" }), "Search results for “x”");
});

test("every landing page the dashboard offers has a title, search title and search description default", () => {
  const pages = new Set(ALL_TEXT_FIELDS.filter((f) => /^landing_[a-z]+_title$/.test(f.key)).map((f) => f.key.split("_")[1]));
  for (const p of ["casino", "review", "category", "country", "payment", "affiliate", "author", "updates", "news", "research", "sportsbook", "search", "sitemap", "comparison", "login", "register"]) {
    assert.ok(pages.has(p), p);
    assert.ok(TEXT_DEFAULTS[`landing_${p}_seo_title`] !== undefined, `${p} seo_title`);
    assert.ok(TEXT_DEFAULTS[`landing_${p}_seo_description`] !== undefined, `${p} seo_description`);
  }
});

test("escapeText escapes the five HTML characters", () => {
  assert.equal(escapeText(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

// ---------------- Phase 12d: page width, account/item/system wording, sub-headings
import { readdirSync } from "node:fs";
import { TEXT_GROUPS } from "../worker/site-text/registry.js";
import { itemText } from "../worker/site-text/resolve.js";
import { settingsManifest } from "../worker/site-profile/settings-groups.js";

test("page width: off by default; on gives the desktop width; the width is clamped", () => {
  assert.equal(siteTextVars(buildSiteText({}), "Acme").viewport_content, "width=device-width, initial-scale=1.0, viewport-fit=cover");
  assert.equal(siteTextVars(buildSiteText({ layout_force_desktop: "1" }), "Acme").viewport_content, "width=1280, viewport-fit=cover");
  assert.equal(siteTextVars(buildSiteText({ layout_force_desktop: "1", layout_desktop_width: "1500" }), "Acme").viewport_content, "width=1500, viewport-fit=cover");
  assert.equal(siteTextVars(buildSiteText({ layout_force_desktop: "1", layout_desktop_width: "100" }), "Acme").viewport_content, "width=960, viewport-fit=cover");
  assert.equal(siteTextVars(buildSiteText({ layout_force_desktop: "1", layout_desktop_width: "9999" }), "Acme").viewport_content, "width=1920, viewport-fit=cover");
  assert.match(readFileSync("templates/layout/base.html", "utf8"), /name="viewport" content="\{\{viewport_content\}\}"/);
});

test("every field belongs to a known group and has a section; sections are contiguous inside a group", () => {
  const groups = new Set(TEXT_GROUPS.map((g) => g.id).concat("footer", "layout"));
  const seen = new Map();
  for (const f of ALL_TEXT_FIELDS) {
    assert.ok(groups.has(f.group), `${f.key}: unknown group ${f.group}`);
    assert.ok(f.section && f.section.length > 2, `${f.key}: no section`);
  }
  for (const f of ALL_TEXT_FIELDS) {
    const last = seen.get(f.group);
    if (last && last.section !== f.section) assert.ok(!last.closed.has(f.section), `${f.group}: section "${f.section}" is split in two places`);
    const rec = last || { section: f.section, closed: new Set() };
    if (rec.section !== f.section) { rec.closed.add(rec.section); rec.section = f.section; }
    seen.set(f.group, rec);
  }
});

test("the dashboard manifest carries sections, and the long Landing tab is split per page", () => {
  const landing = settingsManifest().find((g) => g.id === "landing");
  assert.ok(landing.fields.every((f) => f.section));
  assert.ok(new Set(landing.fields.map((f) => f.section)).size >= 10);
  assert.ok(landing.fields.length <= 110);
  assert.ok(settingsManifest().find((g) => g.id === "layout").fields.some((f) => f.key === "layout_force_desktop"));
});

test("every {{variable}} a managed template uses is supplied by the site text or the page", () => {
  const vars = siteTextVars(buildSiteText({}), "Acme");
  const pageSupplied = new Set(["it_visit", "it_about", "it_info", "it_related"]);
  const files = ["layout/base.html", "layout/header.html", "pages/404.html", "pages/forgot-password.html", "pages/reset-password.html", "pages/news-section.html", "pages/news-home.html", "pages/author_list.html", "pages/research-list.html", "pages/content-item.html"];
  for (const f of files) {
    for (const m of readFileSync(`templates/${f}`, "utf8").matchAll(/\{\{\s*((?:sy|ac|it)_[a-z0-9_]+|viewport_content)\s*\}\}/g)) {
      assert.ok(m[1] in vars || pageSupplied.has(m[1]), `${f}: ${m[1]} is not supplied`);
    }
  }
});

test("pages no longer carry the old hard-coded wording", () => {
  const has = (f, s) => readFileSync(`templates/${f}`, "utf8").includes(s);
  assert.ok(!has("pages/404.html", "does not exist or may have been moved"));
  assert.ok(!has("pages/forgot-password.html", "Send Reset Link"));
  assert.ok(!has("pages/reset-password.html", "Confirm New Password"));
  assert.ok(!has("pages/research-list.html", "All countries"));
  assert.ok(!has("pages/research-list.html", "Clear filters"));
  assert.ok(!has("pages/content-item.html", "PLAY RESPONSIBLY"));
  assert.ok(!has("pages/news-home.html", "Search news articles"));
  assert.ok(!has("layout/header.html", 'aria-label="Menu"'));
});

test("item text fills the item name and type, and defaults match the old wording", () => {
  const t = itemText({ siteName: "Acme", text: buildSiteText({}) }, { name: "BetOne", type: "Sportsbooks" });
  assert.deepEqual(t, { visit: "Visit BetOne", about: "About BetOne", info: "BetOne Info", related: "Related Sportsbooks" });
  assert.equal(siteTextValue({ siteName: "Acme", text: buildSiteText({}) }, "landing_custom_intro", { type: "Poker", type_lower: "poker" }), "Browse our directory of poker.");
});

test("account and 404 wording: defaults are the old text, SEO fields take {site}, values are escaped", () => {
  const site = { siteName: "Acme", text: buildSiteText({ account_forgot_title: "Lost <it>?" }) };
  assert.equal(siteTextValue(site, "account_reset_seo_description"), "Reset your Acme password");
  assert.equal(siteTextValue(site, "system_404_description"), "Sorry, this page does not exist on Acme.");
  assert.equal(siteTextVars(site.text, "Acme").ac_forgot_title, "Lost &lt;it&gt;?");
});

test("the research count wording is read from the page, not hard-coded in the script", () => {
  const js = readFileSync("static/js/research-directory-filter.js", "utf8");
  assert.match(js, /data-tpl/);
  assert.equal(fillTokens("Showing {count} of {total}", { count: 2, total: 9 }), "Showing 2 of 9");
});
