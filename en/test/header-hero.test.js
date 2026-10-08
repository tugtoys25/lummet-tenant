// test/header-hero.test.js -- the Header & Hero manager (Dashboard > Header & Hero).
// Covers the settings model (validation, escaping, defaults), the public templates,
// the save path, and the admin page's wiring. Visual layout was checked by hand in a
// real browser; this suite does not prove pixels.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  FIELDS, HEADER_HERO_KEYS, parseHeaderHero, defaultHeaderHero, sanitizeHeaderHeroInput,
  headerHeroTemplateVars, headerHeroDefaultsForAdmin, jsonForScript, cleanLink, cleanColor, FONT_STACKS, FONT_KEYS, headerClasses, heroClasses, cleanSlides, cleanCards, MAX_SLIDES, MAX_CARDS, parseVideoUrl, canonicalVideoUrl, embedUrl
} from '../worker/header-hero.js';
import { getSiteSettings } from '../worker/site-settings.js';
import { Renderer } from '../worker/render.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const renderer = new Renderer({}, new Request('https://example.test/en'));
const fill = (tpl, data) => renderer.replaceVariables(tpl, data);
let originCounter = 0;
const nextOrigin = () => `https://t${++originCounter}.example.test`;
const rows = (obj) => ({ prepare: () => ({ all: async () => ({ results: Object.entries(obj).map(([key, value]) => ({ key, value })) }), bind() { return this; } }) });

describe('defaults reproduce the site as it was', () => {
  const hh = defaultHeaderHero();
  const v = headerHeroTemplateVars(hh);

  test('hero text, button and layout match the previous hardcoded defaults', () => {
    assert.equal(hh.heroEnabled, true);
    assert.equal(hh.heroBadge, 'Find Your Perfect Casino');
    assert.equal(hh.heroTitle, 'Find Your Perfect Casino');
    assert.match(hh.heroSubtitle, /\{\{casino_count\}\}\+ casinos worldwide/);
    assert.equal(hh.heroButtonText, 'Browse Casinos');
    assert.equal(hh.heroButtonUrl, '/en/casino');
    assert.equal(hh.heroAlignment, 'center');
    assert.equal(hh.heroOverlay, true);
    assert.equal(hh.heroOverlayOpacity, 45);
    assert.match(v.hh_hero_html, /class="hero hero--h-standard/);
    assert.match(v.hh_hero_html, /<a href="\/en\/casino" class="btn btn--primary btn--lg">Browse Casinos<\/a>/);
  });

  test('header defaults: sticky, standard height, search and login shown, no extras', () => {
    assert.equal(hh.headerSticky, true);
    assert.equal(hh.headerHeight, 'default');
    assert.equal(hh.showSearch, true);
    assert.equal(hh.showAuth, true);
    assert.equal(hh.ctaEnabled, false);
    assert.equal(hh.announceEnabled, false);
    assert.equal(v.hh_announce_html, '');
    assert.equal(v.hh_cta, false);
    assert.match(v.hh_css, /--hh-header-h:68px/);
    assert.doesNotMatch(v.hh_css, /--hh-header-bg/);
  });
});

describe('validation', () => {
  test('unknown choices fall back to the default', () => {
    const hh = parseHeaderHero({ site_header_height: 'huge', theme_header_style: 'neon', site_hero_alignment: 'justify', site_hero_height: 'x' });
    assert.equal(hh.headerHeight, 'default');
    assert.equal(hh.headerStyle, 'default');
    assert.equal(hh.heroAlignment, 'center');
    assert.equal(hh.heroHeight, 'standard');
  });

  test('numbers are clamped; booleans accept true/false strings', () => {
    assert.equal(parseHeaderHero({ site_hero_overlay_opacity: '500' }).heroOverlayOpacity, 85);
    assert.equal(parseHeaderHero({ site_hero_overlay_opacity: '-9' }).heroOverlayOpacity, 0);
    assert.equal(parseHeaderHero({ site_hero_overlay_opacity: 'abc' }).heroOverlayOpacity, 45);
    assert.equal(parseHeaderHero({ site_header_sticky: 'false' }).headerSticky, false);
    assert.equal(parseHeaderHero({ site_hero_enabled: 'false' }).heroEnabled, false);
    assert.equal(parseHeaderHero({ site_hero_enabled: 'garbage' }).heroEnabled, true);
  });

  test('only safe links are accepted', () => {
    for (const ok of ['/en/casino', '#top', 'https://example.com/a?b=1', 'mailto:a@b.co', 'tel:+250788000000']) assert.equal(cleanLink(ok), ok, ok);
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.test', 'ftp://x', 'java\nscript:1', '/a b', '/"onmouseover="x', "/x'y", '<b>']) assert.equal(cleanLink(bad), '', bad);
  });

  test('only safe colours are accepted', () => {
    for (const ok of ['#fff', '#1a1a1a', '#1a1a1a80', 'rgb(10, 20, 30)', 'rgba(0,0,0,.5)', 'hsl(200 50% 40%)']) assert.equal(cleanColor(ok), ok, ok);
    for (const bad of ['red', 'url(x)', 'expression(1)', '#12', 'rgb(1,2,3);color:red', '#fff;}body{display:none']) assert.equal(cleanColor(bad), '', bad);
  });

  test('text is trimmed, flattened to one line and length-limited', () => {
    const hh = parseHeaderHero({ site_announce_text: '  Hello\n\nworld  ' + 'x'.repeat(400) });
    assert.ok(hh.announceText.startsWith('Hello world'));
    assert.ok(hh.announceText.length <= 160);
  });

  test('highlights: at most 4 lines of 60 characters', () => {
    const hh = parseHeaderHero({ site_hero_highlights: Array.from({ length: 9 }, (_, i) => `Line ${i}${'y'.repeat(100)}`).join('\n') });
    const lines = hh.heroHighlights.split('\n');
    assert.equal(lines.length, 4);
    assert.ok(lines.every((l) => l.length <= 60));
  });

  test('a cleared title, subtitle or button falls back to the default instead of showing nothing', () => {
    const hh = parseHeaderHero({ site_hero_title: '', site_hero_button_text: '  ', site_hero_button_url: 'javascript:1' });
    assert.equal(hh.heroTitle, 'Find Your Perfect Casino');
    assert.equal(hh.heroButtonText, 'Browse Casinos');
    assert.equal(hh.heroButtonUrl, '/en/casino');
  });

  test('a background picture must be an http(s) address or an on-site path', () => {
    assert.equal(parseHeaderHero({ site_hero_image: 'https://cdn.test/h.jpg' }).heroImage, 'https://cdn.test/h.jpg');
    assert.equal(parseHeaderHero({ site_hero_image: '/static/h.jpg' }).heroImage, '/static/h.jpg');
    assert.equal(parseHeaderHero({ site_hero_image: 'mailto:a@b.co' }).heroImage, '');
    assert.equal(parseHeaderHero({ site_hero_image: 'javascript:1' }).heroImage, '');
    assert.equal(parseHeaderHero({ site_hero_image: '#x' }).heroImage, '');
  });
});

describe('escaping (the template engine does not escape for us)', () => {
  const nasty = '<script>alert(1)</script> "quoted" & \'single\'';
  const v = headerHeroTemplateVars(parseHeaderHero({
    site_announce_enabled: 'true', site_announce_text: nasty, site_announce_link_text: nasty, site_announce_url: '/ok',
    site_hero_title: nasty, site_hero_subtitle: nasty, site_hero_description: nasty, site_hero_badge: nasty,
    site_hero_highlights: nasty, site_hero_button_text: nasty, site_hero_button2_text: nasty, site_hero_button2_url: '/two',
    site_header_cta_enabled: 'true', site_header_cta_text: nasty, site_header_cta_url: '/cta',
    site_header_login_label: nasty, site_header_search_placeholder: nasty
  }));

  test('no raw angle brackets or quotes survive in any generated markup', () => {
    for (const [key, value] of Object.entries(v)) {
      if (typeof value !== 'string') continue;
      assert.doesNotMatch(value, /<script/i, key);
      const text = value.replace(/<\/?[a-z][^<>]*>/gi, '');
      assert.ok(!/[<>]/.test(text), `${key}: ${text.slice(0, 80)}`);
    }
    assert.match(v.hh_hero_html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(v.hh_announce_html, /&quot;quoted&quot;/);
    assert.match(v.hh_cta_text, /&lt;script&gt;/);
    assert.match(v.hh_announce_html, /&#39;single&#39;/);
  });

  test('a hero picture address cannot break out of its CSS url()', () => {
    const w = headerHeroTemplateVars(parseHeaderHero({ site_hero_image: 'https://x.test/a(b).jpg' }));
    assert.match(w.hh_hero_html, /url\('https:\/\/x\.test\/a%28b%29\.jpg'\)/);
  });
});

describe('generated markup', () => {
  test('announcement bar: link and close button only when set; id changes with the message', () => {
    const base = { site_announce_enabled: 'true', site_announce_text: 'Hello' };
    const a = headerHeroTemplateVars(parseHeaderHero(base));
    assert.doesNotMatch(a.hh_announce_html, /hh-announce__link|data-announce-close.*aria/s.test('') ? /x/ : /hh-announce__link/);
    assert.match(a.hh_announce_html, /data-announce-close/);
    const b = headerHeroTemplateVars(parseHeaderHero({ ...base, site_announce_dismissible: 'false', site_announce_link_text: 'Go', site_announce_url: '/go' }));
    assert.match(b.hh_announce_html, /href="\/go"/);
    assert.doesNotMatch(b.hh_announce_html, /data-announce-close/);
    const c = headerHeroTemplateVars(parseHeaderHero({ ...base, site_announce_text: 'Changed' }));
    assert.notEqual(a.hh_announce_html.match(/data-announce-id="([^"]+)"/)[1], c.hh_announce_html.match(/data-announce-id="([^"]+)"/)[1]);
  });

  test('announcement needs both the switch and a message', () => {
    assert.equal(headerHeroTemplateVars(parseHeaderHero({ site_announce_enabled: 'true' })).hh_announce_html, '');
    assert.equal(headerHeroTemplateVars(parseHeaderHero({ site_announce_text: 'Hi' })).hh_announce_html, '');
  });

  test('header call to action needs switch, text and a valid address', () => {
    assert.equal(headerHeroTemplateVars(parseHeaderHero({ site_header_cta_enabled: 'true', site_header_cta_text: 'Go' })).hh_cta, false);
    const ok = headerHeroTemplateVars(parseHeaderHero({ site_header_cta_enabled: 'true', site_header_cta_text: 'Go', site_header_cta_url: '/x', site_header_cta_new_tab: 'true', site_header_cta_style: 'outline' }));
    assert.equal(ok.hh_cta, true);
    assert.equal(ok.hh_cta_class, 'btn--outline');
    assert.match(ok.hh_cta_target, /target="_blank" rel="noopener"/);
  });

  test('hero options change classes and variables', () => {
    const v = headerHeroTemplateVars(parseHeaderHero({
      site_hero_height: 'screen', site_hero_text_theme: 'dark', site_hero_bg_mode: 'brand', site_hero_overlay_opacity: '20',
      site_hero_alignment: 'left', site_header_height: 'tall', site_header_logo_size: 'lg', theme_header_background: '#112233', site_hero_bg_color: '#445566'
    }));
    assert.match(v.hh_hero_html, /hero--h-screen hero--text-dark hero--focus-center hero--bg-brand/);
    assert.match(v.hh_hero_html, /hero-content--left/);
    assert.match(v.hh_css, /--hh-header-h:84px/);
    assert.match(v.hh_css, /--hh-logo:52px/);
    assert.match(v.hh_css, /--hh-header-bg:#112233/);
    assert.match(v.hh_css, /--hh-hero-bg:#445566/);
    assert.match(v.hh_css, /--hh-hero-overlay:0\.20/);
  });

  test('a picture replaces the background mode; overlay can be switched off', () => {
    const v = headerHeroTemplateVars(parseHeaderHero({ site_hero_image: 'https://x.test/h.jpg', site_hero_bg_mode: 'brand', site_hero_overlay: 'false' }));
    assert.match(v.hh_hero_html, /hero--image/);
    assert.doesNotMatch(v.hh_hero_html, /hero--bg-brand/);
    assert.doesNotMatch(v.hh_hero_html, /hero-overlay/);
  });

  test('hero can be hidden, and badge / button toggles work', () => {
    assert.equal(headerHeroTemplateVars(parseHeaderHero({ site_hero_enabled: 'false' })).hh_hero_html, '');
    const v = headerHeroTemplateVars(parseHeaderHero({ site_hero_badge_enabled: 'false', site_hero_button_enabled: 'false' }));
    assert.doesNotMatch(v.hh_hero_html, /hero-badge/);
    assert.doesNotMatch(v.hh_hero_html, /btn--primary/);
    assert.doesNotMatch(v.hh_hero_html, /hero-actions/);
  });

  test('the casino-count token in the subtitle is left for the page to fill in', () => {
    const v = headerHeroTemplateVars(defaultHeaderHero());
    assert.equal(fill(v.hh_hero_html, { casino_count: 42 }).includes('42+ casinos worldwide'), true);
  });
});

describe('public templates', () => {
  const header = read('templates/layout/header.html');
  const home = read('templates/pages/home.html');
  const base = read('templates/layout/base.html');

  test('no template nests {{#if}} blocks (the engine cannot handle that)', () => {
    for (const [name, src] of [['header', header], ['home', home]]) {
      let depth = 0;
      for (const m of src.matchAll(/\{\{#if\b|\{\{\/if\}\}/g)) {
        depth += m[0].startsWith('{{#') ? 1 : -1;
        assert.ok(depth >= 0 && depth <= 1, `${name}: nested or unbalanced {{#if}}`);
      }
      assert.equal(depth, 0, `${name}: unbalanced`);
    }
  });

  test('header keeps every id the scripts rely on, by default', () => {
    const html = fill(header, headerHeroTemplateVars(defaultHeaderHero()));
    for (const id of ['mainNav', 'searchInput', 'searchResults', 'mobileSearchBtn', 'mobileSearchContainer', 'mobileSearchInput', 'mobileSearchClose', 'mobileSearchResults', 'headerLoginBtn', 'headerLogoutBtn', 'headerDashboardBtn', 'navToggle']) {
      assert.match(html, new RegExp(`id="${id}"`), id);
    }
    assert.match(html, /placeholder="Search casinos\.\.\."/);
    assert.match(html, />\s*Login\s*</);
    assert.doesNotMatch(html, /\{\{|\}\}/);
  });

  test('header without search or sign-in buttons drops that markup', () => {
    const html = fill(header, headerHeroTemplateVars(parseHeaderHero({ site_header_show_search: 'false', site_header_show_auth: 'false' })));
    for (const id of ['searchInput', 'mobileSearchBtn', 'mobileSearchContainer', 'headerLoginBtn']) assert.doesNotMatch(html, new RegExp(`id="${id}"`), id);
    assert.match(html, /id="navToggle"/);
  });

  test('logo modes remove the image or the name from the markup', () => {
    const data = { site_name: 'Acme', site_logo: '/l.png', header_nav: '' };
    assert.doesNotMatch(fill(header, { ...data, ...headerHeroTemplateVars(parseHeaderHero({ site_header_logo_mode: 'text' })) }), /logo-icon/);
    assert.doesNotMatch(fill(header, { ...data, ...headerHeroTemplateVars(parseHeaderHero({ site_header_logo_mode: 'logo' })) }), /logo-text/);
  });

  test('the header carries the announcement bar and the optional button', () => {
    const v = headerHeroTemplateVars(parseHeaderHero({ site_announce_enabled: 'true', site_announce_text: 'Sale', site_header_cta_enabled: 'true', site_header_cta_text: 'Join', site_header_cta_url: '/join' }));
    const html = fill(header, v);
    assert.ok(html.indexOf('hh-announce') < html.indexOf('<header'));
    assert.match(html, /<a href="\/join" class="btn btn--primary header-cta">Join<\/a>/);
  });

  test('homepage uses the generated hero', () => {
    assert.match(home, /^\{\{\{hh_hero_html\}\}\}/);
    assert.doesNotMatch(home, /site_hero_/);
  });

  test('base layout loads the stylesheet, variables, body classes and scripts', () => {
    assert.match(base, /\/static\/css\/header-hero\.css/);
    assert.match(base, /\{\{\{hh_css\}\}\}/);
    assert.match(base, /\{\{hh_body_class\}\}/);
    assert.match(base, /\/static\/js\/header-hero\.js/);
    assert.match(base, /\/static\/js\/header-hero-admin\.js/);
  });
});

describe('loading from the settings table', () => {
  test('getSiteSettings exposes headerHero with saved values applied', async () => {
    const s = await getSiteSettings(rows({ site_hero_title: 'Welcome', site_header_height: 'tall', site_announce_enabled: 'true', site_announce_text: 'Hi' }), nextOrigin(), {});
    assert.equal(s.headerHero.heroTitle, 'Welcome');
    assert.equal(s.headerHero.headerHeight, 'tall');
    assert.equal(s.headerHero.announceEnabled, true);
  });

  test('with no database it falls back to the defaults', async () => {
    const s = await getSiteSettings(null, nextOrigin(), {});
    assert.deepEqual(s.headerHero, defaultHeaderHero());
  });

  test('values saved before this feature (blank hero fields) still render the defaults', async () => {
    const s = await getSiteSettings(rows({ site_hero_title: '', site_hero_badge: '', site_hero_subtitle: '', site_hero_button_text: '', site_hero_button_url: '', site_hero_enabled: 'true', site_hero_overlay: 'true' }), nextOrigin(), {});
    assert.equal(s.headerHero.heroTitle, 'Find Your Perfect Casino');
    assert.equal(s.headerHero.heroButtonUrl, '/en/casino');
    assert.equal(s.headerHero.heroOverlay, true);
  });

  test('the render pipeline passes the variables to every template', () => {
    const src = read('worker/render.js');
    assert.match(src, /\.\.\.headerHeroTemplateVars\(site\.headerHero\)/);
  });
});

describe('saving', () => {
  test('sanitizeHeaderHeroInput cleans this feature\'s keys and leaves others alone', () => {
    const out = sanitizeHeaderHeroInput({
      site_hero_alignment: 'diagonal', site_hero_overlay_opacity: '999', site_header_cta_url: 'javascript:alert(1)',
      theme_header_background: 'red;}', site_hero_enabled: true, site_name: 'Keep <me>', footer_disclaimer: '  untouched  '
    });
    assert.equal(out.site_hero_alignment, 'center');
    assert.equal(out.site_hero_overlay_opacity, '85');
    assert.equal(out.site_header_cta_url, '');
    assert.equal(out.theme_header_background, '');
    assert.equal(out.site_hero_enabled, 'true');
    assert.equal(out.site_name, 'Keep <me>');
    assert.equal(out.footer_disclaimer, '  untouched  ');
  });

  test('every value it returns is a string', () => {
    const body = Object.fromEntries(HEADER_HERO_KEYS.map((k) => [k, undefined]));
    for (const value of Object.values(sanitizeHeaderHeroInput(body))) assert.equal(typeof value, 'string');
  });

  test('the save endpoint routes the body through the sanitizer', () => {
    const api = read('worker/api.js');
    assert.match(api, /sanitizeHeaderHeroInput\(body\)/);
    assert.match(api, /requireRole\(user, "editor"\)/);
  });

  test('saving the general Settings page can no longer switch the hero off', () => {
    const js = read('static/js/admin.js');
    assert.match(js, /if \(heroEnabled\) \{\s*payload\.site_hero_enabled/);
    const html = read('templates/pages/admin/settings.html');
    assert.doesNotMatch(html, /name="site_hero_/);
    assert.match(html, /href="\/en\/dashboard\/header-hero"/);
  });
});

describe('admin page', () => {
  const page = read('templates/pages/admin/header-hero.html');
  const names = [...page.matchAll(/\s(?:name|data-repeat)="([a-z0-9_]+)"/g)].map((m) => m[1]).filter((n) => n !== 'hh_device');

  test('every setting has a control, and every control is a known setting', () => {
    assert.deepEqual([...new Set(names)].sort(), [...HEADER_HERO_KEYS].sort());
  });

  test('radio/select values offered are all allowed by the model', () => {
    for (const field of FIELDS.filter((f) => f.type === 'enum')) {
      const radios = [...page.matchAll(new RegExp(`name="${field.key}" value="([^"]+)"`, 'g'))].map((m) => m[1]);
      const select = page.match(new RegExp(`<select id="f_${field.key}" name="${field.key}">(.*?)</select>`));
      const offered = select ? [...select[1].matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]) : radios;
      assert.deepEqual(offered.sort(), [...field.values].sort(), field.key);
    }
  });

  test('is wired: route, controller, navigation entry', () => {
    assert.match(read('worker/routes.js'), /"\/en\/dashboard\/header-hero"\) return \{ type: "dashboardHeaderHero" \}/);
    assert.match(read('worker/index.js'), /case "dashboardHeaderHero":\s*return renderDashboardHeaderHero/);
    assert.match(read('worker/controllers.js'), /renderAdminPage\(request, env, "admin\/header-hero\.html"/);
    assert.match(read('templates/layout/admin-nav.html'), /href="\/en\/dashboard\/header-hero"/);
  });

  test('defaults JSON survives the template engine intact', () => {
    const json = jsonForScript(headerHeroDefaultsForAdmin());
    const out = fill('<script type="application/json" id="x">{{{hh_defaults_json}}}</script>', { hh_defaults_json: json });
    const parsed = JSON.parse(out.replace(/^<[^>]+>/, '').replace(/<\/script>$/, ''));
    assert.deepEqual(parsed, headerHeroDefaultsForAdmin());
    assert.match(parsed.site_hero_subtitle, /\{\{casino_count\}\}/);
  });

  test('the admin script avoids dynamic-code sinks and only calls the settings endpoints', () => {
    const js = stripComments(read('static/js/header-hero-admin.js'));
    assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
    const urls = [...js.matchAll(/fetch\("([^"]+)"/g)].map((m) => m[1]);
    assert.ok(urls.length >= 2);
    for (const u of urls) assert.match(u, /^\/en\/api\/v1\/settings\/(get|save)$/);
  });

  test('the public script avoids dynamic-code sinks', () => {
    assert.doesNotMatch(stripComments(read('static/js/header-hero.js')), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  });

  test('the stylesheet\'s admin rules are scoped and it declares no global element rules', () => {
    const css = read('static/css/header-hero.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@[a-z-]+[^{;]*\{/g, '');
    const selectors = [...css.matchAll(/(^|\})\s*([^{}@][^{}]*)\{/g)].flatMap((m) => m[2].split(',').map((s) => s.trim())).filter(Boolean);
    for (const sel of selectors) {
      assert.ok(/^(:root|\.|\.hh-|\.hero|\.site-header|\.hh-)/.test(sel) || /^\.(hh|hero|site-header)/.test(sel) || sel.startsWith('.') || /^(fieldset|body)\.hh-/.test(sel) || /^(from|to)$/.test(sel), `unscoped selector: ${sel}`);
    }
  });

  test('the preset names offered exist in the script', () => {
    const js = read('static/js/header-hero-admin.js');
    for (const m of page.matchAll(/data-preset="([a-z]+)"/g)) assert.match(js, new RegExp(`\\b${m[1]}:`), m[1]);
  });
});

describe('navigation', () => {
  test('the new entry is the only link added to the admin menu', () => {
    const nav = read('templates/layout/admin-nav.html');
    const hrefs = [...nav.matchAll(/<a\s+href="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(hrefs.filter((h) => h === '/en/dashboard/header-hero').length, 1);
  });
});

describe('custom colours and fonts', () => {
  test('defaults add nothing: no colour or font variables, no extra classes', () => {
    const hh = defaultHeaderHero();
    const v = headerHeroTemplateVars(hh);
    assert.doesNotMatch(v.hh_css, /--hh-header-fg|--hh-hero-fg|--hh-hero-title|-font:/);
    assert.doesNotMatch(v.hh_body_class, /hh-hfg|hh-hfont/);
    assert.doesNotMatch(v.hh_hero_html, /hero--custom|hero--font/);
  });

  test('saved colours and fonts reach the variables and the classes', () => {
    const hh = parseHeaderHero({
      site_header_text_color: '#ffd166', site_header_font: 'serif',
      site_hero_text_color: 'rgb(255, 255, 255)', site_hero_title_color: '#ee9f28',
      site_hero_heading_font: 'display', site_hero_body_font: 'rounded'
    });
    const v = headerHeroTemplateVars(hh);
    assert.match(v.hh_css, /--hh-header-fg:#ffd166/);
    assert.match(v.hh_css, /--hh-hero-title:#ee9f28/);
    assert.match(v.hh_css, /--hh-header-font:Georgia/);
    assert.match(v.hh_css, /--hh-hero-heading-font:Impact/);
    assert.match(v.hh_css, /--hh-hero-body-font:ui-rounded/);
    assert.match(v.hh_body_class, /\bhh-hfg\b/);
    assert.match(v.hh_body_class, /\bhh-hfont\b/);
    assert.match(v.hh_hero_html, /hero--custom-fg/);
    assert.match(v.hh_hero_html, /hero--custom-title/);
    assert.match(v.hh_hero_html, /hero--font-heading/);
    assert.match(v.hh_hero_html, /hero--font-body/);
  });

  test('colours and fonts that are not on the allow-list are dropped', () => {
    const hh = parseHeaderHero({
      site_header_text_color: 'red;}</style><script>x</script>', site_hero_text_color: 'url(javascript:1)',
      site_hero_title_color: '#12', site_header_font: 'Arial; background:url(x)', site_hero_heading_font: 'comic', site_hero_body_font: '</style>'
    });
    assert.equal(hh.headerTextColor, '');
    assert.equal(hh.heroTextColor, '');
    assert.equal(hh.heroTitleColor, '');
    assert.equal(hh.headerFont, 'default');
    assert.equal(hh.heroHeadingFont, 'default');
    assert.equal(hh.heroBodyFont, 'default');
    const css = headerHeroTemplateVars(hh).hh_css;
    assert.doesNotMatch(css, /script|<\/style>(?!$)/i);
  });

  test('the save path cleans them too', () => {
    const clean = sanitizeHeaderHeroInput({ site_header_text_color: '#FFF', site_header_font: 'mono', site_hero_title_color: 'javascript:alert(1)', site_hero_body_font: 'nope' });
    assert.equal(clean.site_header_text_color, '#FFF');
    assert.equal(clean.site_header_font, 'mono');
    assert.equal(clean.site_hero_title_color, '');
    assert.equal(clean.site_hero_body_font, 'default');
  });

  test('every font stack is a fixed string free of characters that could end a style block', () => {
    assert.deepEqual(FONT_KEYS[0], 'default');
    for (const [key, stack] of Object.entries(FONT_STACKS)) {
      assert.doesNotMatch(stack, /[<>{};"\\]/, key);
    }
  });

  test('the admin script offers exactly the same stacks as the server', () => {
    const js = read('static/js/header-hero-admin.js');
    for (const [key, stack] of Object.entries(FONT_STACKS)) {
      if (!stack) continue;
      assert.ok(js.includes(stack), `admin script is missing the ${key} stack`);
    }
    const page = read('templates/pages/admin/header-hero.html');
    for (const key of FONT_KEYS) assert.match(page, new RegExp(`<option value="${key}">`), key);
    for (const name of ['site_header_text_color', 'site_header_font', 'site_hero_text_color', 'site_hero_title_color', 'site_hero_heading_font', 'site_hero_body_font']) {
      assert.match(page, new RegExp(`name="${name}"`), name);
    }
  });
});

describe('hero media: slides and pictures', () => {
  const slides = (list) => JSON.stringify(list);
  const on = (extra = {}) => headerHeroTemplateVars(parseHeaderHero({ site_hero_media_enabled: 'true', ...extra })).hh_hero_html;

  test('off by default: the hero markup has no media, cards, controls or extra classes', () => {
    const html = headerHeroTemplateVars(defaultHeaderHero()).hh_hero_html;
    assert.doesNotMatch(html, /hero-media|hero-slide|hero-card|data-hh-hero-media|hero--has-media|hero-grid/);
    // switching it on with no slides still changes nothing
    assert.equal(on({ site_hero_slides: '[]' }), html);
  });

  test('the default hero is byte-for-byte what v8 produced', () => {
    const html = headerHeroTemplateVars(defaultHeaderHero()).hh_hero_html;
    assert.equal(
      html,
      '<section class="hero hero--h-standard hero--text-light hero--focus-center hero--bg-default" id="siteHero"><div class="hero-overlay" aria-hidden="true"></div>' +
        '<div class="container"><div class="hero-content hero-content--center"><div class="hero-badge">Find Your Perfect Casino</div><h1>Find Your Perfect Casino</h1>' +
        '<p class="hero-subtitle">Expert reviews, exclusive bonuses, and real player data for {{casino_count}}+ casinos worldwide.</p>' +
        '<div class="hero-actions"><a href="/en/casino" class="btn btn--primary btn--lg">Browse Casinos</a></div></div></div></section>'
    );
  });

  test('a single picture is fixed: no arrows, dots or pause button', () => {
    const html = on({ site_hero_slides: slides([{ type: 'image', src: '/media/a.jpg', alt: 'A' }]) });
    assert.match(html, /<img src="\/media\/a\.jpg" alt="A"/);
    assert.match(html, /data-autoplay="0"/);
    assert.doesNotMatch(html, /hero-media__ui|data-hh-next|data-hh-toggle/);
  });

  test('several slides get the controls, the interval and the transition', () => {
    const html = on({
      site_hero_slides: slides([{ type: 'image', src: '/a.jpg' }, { type: 'image', src: '/b.jpg' }]),
      site_hero_media_interval: '9', site_hero_media_transition: 'slide', site_hero_media_motion: 'pan'
    });
    assert.match(html, /data-autoplay="1" data-interval="9000"/);
    assert.match(html, /hero-media--slide hero-media--motion-pan/);
    assert.match(html, /data-hh-prev/);
    assert.match(html, /data-hh-dot="1"/);
    assert.match(html, /data-hh-toggle/);
    assert.match(html, /hero--arrows/);
    assert.match(html, /aria-label="2 of 2"/);
  });

  test('autoplay off removes the pause button and the timer', () => {
    const html = on({ site_hero_media_autoplay: 'false', site_hero_slides: slides([{ type: 'image', src: '/a.jpg' }, { type: 'image', src: '/b.jpg' }]) });
    assert.match(html, /data-autoplay="0"/);
    assert.doesNotMatch(html, /data-hh-toggle/);
  });

  test('videos: muted, inline, poster, correct type; only a playable file is accepted', () => {
    const html = on({ site_hero_slides: slides([{ type: 'video', src: '/media/videos/a.mp4', poster: '/media/p.jpg', alt: 'Clip' }]) });
    assert.match(html, /<video muted playsinline autoplay loop preload="auto" poster="\/media\/p\.jpg" aria-label="Clip">/);
    assert.match(html, /<source src="\/media\/videos\/a\.mp4" type="video\/mp4">/);
    assert.deepEqual(cleanSlides([{ type: 'video', src: '/page.html' }, { type: 'video', src: 'https://x.test/a.webm?v=2' }]).map((s) => s.src), ['https://x.test/a.webm?v=2']);
    assert.match(on({ site_hero_slides: slides([{ type: 'video', src: '/a.webm' }]) }), /type="video\/webm"/);
  });

  test('with several slides a video does not loop (it moves the show on) and only the first can autoplay', () => {
    const html = on({ site_hero_slides: slides([{ type: 'video', src: '/a.mp4' }, { type: 'video', src: '/b.mp4' }]) });
    const vids = html.match(/<video [^>]*>/g);
    assert.equal(vids.length, 2);
    assert.match(vids[0], /autoplay/);
    assert.doesNotMatch(vids[0], /\bloop\b/);
    assert.doesNotMatch(vids[1], /autoplay/);
    assert.match(vids[1], /preload="none"/);
  });

  test('a slide link makes the hero clickable and opens other sites in a new tab', () => {
    const html = on({ site_hero_slides: slides([{ type: 'image', src: '/a.jpg', link: 'https://partner.test/x' }, { type: 'image', src: '/b.jpg', link: '/en/casino' }]) });
    assert.match(html, /hero--media-link/);
    assert.match(html, /href="https:\/\/partner\.test\/x"[^>]*target="_blank" rel="noopener"/);
    assert.doesNotMatch(html.match(/<a class="hero-slide__link" href="\/en\/casino"[^>]*>/)[0], /target=/);
  });

  test('bad entries are dropped and the lists are capped', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ type: 'image', src: `/m/${i}.jpg` }));
    assert.equal(cleanSlides(many).length, MAX_SLIDES);
    assert.equal(cleanCards(many).length, MAX_CARDS);
    assert.deepEqual(cleanSlides([null, 5, 'x', { src: 'javascript:alert(1)' }, { src: '//evil.test/a.jpg' }, { src: 'a b.jpg' }, { src: '/ok.jpg', link: 'javascript:1', alt: 'x'.repeat(500) }]).map((s) => [s.src, s.link, s.alt.length]), [['/ok.jpg', '', 140]]);
    assert.deepEqual(cleanSlides('not json'), []);
    assert.deepEqual(cleanSlides('{"a":1}'), []);
  });

  test('text from the lists is escaped', () => {
    const html = on({ site_hero_slides: slides([{ type: 'image', src: '/a.jpg', alt: '"><script>alert(1)</script>' }]) }) +
      headerHeroTemplateVars(parseHeaderHero({ site_hero_cards_enabled: 'true', site_hero_cards: slides([{ src: '/c.jpg', caption: '<b>x</b>', alt: '"onerror="1' }]) })).hh_hero_html;
    assert.doesNotMatch(html, /<script>|<b>x|onerror="1/);
    assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  });

  test('pictures inside the hero: below by default, beside on request, links optional', () => {
    const cards = slides([{ src: '/c1.jpg', caption: 'One', link: '/en/casino' }, { src: '/c2.jpg' }, { src: '/c3.jpg' }]);
    const below = headerHeroTemplateVars(parseHeaderHero({ site_hero_cards_enabled: 'true', site_hero_cards: cards })).hh_hero_html;
    assert.match(below, /<\/div><div class="hero-cards hero-cards--md hero-cards--n3">/);
    assert.doesNotMatch(below, /hero-grid|hero--cards-side/);
    assert.match(below, /<a class="hero-card__link" href="\/en\/casino">/);
    assert.equal((below.match(/<figure/g) || []).length, 3);
    const side = headerHeroTemplateVars(parseHeaderHero({ site_hero_cards_enabled: 'true', site_hero_cards: cards, site_hero_cards_position: 'side', site_hero_cards_size: 'lg' })).hh_hero_html;
    assert.match(side, /class="container hero-grid"/);
    assert.match(side, /hero--cards-side/);
    assert.match(side, /hero-cards--lg/);
    assert.equal(headerHeroTemplateVars(parseHeaderHero({ site_hero_cards: cards })).hh_hero_html.includes('hero-card'), false);
  });

  test('the save path stores canonical JSON and rejects junk', () => {
    const out = sanitizeHeaderHeroInput({
      site_hero_slides: JSON.stringify([{ src: '/a.jpg', extra: 'x', type: 'weird' }, { src: 'ftp://x' }]),
      site_hero_cards: 'oops', site_hero_media_interval: '999', site_hero_media_transition: 'spin'
    });
    assert.equal(out.site_hero_slides, '[{"type":"image","src":"/a.jpg","poster":"","alt":"","link":""}]');
    assert.equal(out.site_hero_cards, '[]');
    assert.equal(out.site_hero_media_interval, '20');
    assert.equal(out.site_hero_media_transition, 'fade');
  });

  test('the public script and stylesheet are wired and free of dynamic-code sinks', () => {
    const js = stripComments(read('static/js/hero-media.js'));
    assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
    assert.match(js, /prefers-reduced-motion/);
    assert.match(js, /saveData/);
    assert.match(js, /visibilitychange/);
    assert.match(read('templates/layout/base.html'), /\/static\/js\/hero-media\.js/);
    assert.match(read('static/css/header-hero.css'), /prefers-reduced-motion/);
  });

  test('the admin script stays free of innerHTML and uses the Media library', () => {
    const js = stripComments(read('static/js/header-hero-admin.js'));
    assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
    assert.match(js, /MediaPicker/);
  });
});

describe('online video: YouTube and Vimeo', () => {
  const YT = 'dQw4w9WgXcQ';
  const embedSlide = (extra = {}) => ({ type: 'embed', src: `https://youtu.be/${YT}`, poster: '/media/p.jpg', alt: 'Our review', ...extra });
  const html = (settings) => headerHeroTemplateVars(parseHeaderHero(settings)).hh_hero_html;

  test('links in every common form give the same video, anything else is refused', () => {
    for (const u of [`https://www.youtube.com/watch?v=${YT}&t=5`, `https://youtu.be/${YT}?si=x`, `https://youtube.com/shorts/${YT}`, `https://m.youtube.com/embed/${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`]) {
      assert.deepEqual(parseVideoUrl(u), { provider: 'youtube', id: YT, hash: '' }, u);
    }
    assert.deepEqual(parseVideoUrl('https://vimeo.com/76979871'), { provider: 'vimeo', id: '76979871', hash: '' });
    assert.deepEqual(parseVideoUrl('https://vimeo.com/76979871/abcdef1234'), { provider: 'vimeo', id: '76979871', hash: 'abcdef1234' });
    assert.deepEqual(parseVideoUrl('https://player.vimeo.com/video/76979871?h=abcdef1234'), { provider: 'vimeo', id: '76979871', hash: 'abcdef1234' });
    assert.deepEqual(parseVideoUrl('https://vimeo.com/channels/staffpicks/76979871'), { provider: 'vimeo', id: '76979871', hash: '' });
    for (const bad of ['', 'javascript:alert(1)', 'https://evil.test/watch?v=' + YT, 'https://youtube.com.evil.test/watch?v=' + YT, `https://evil.test/https://youtube.com/watch?v=${YT}`,
      'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/@channel', 'https://www.youtube.com/playlist?list=PL123', 'https://vimeo.com/channels/staffpicks', 'ftp://youtu.be/' + YT, `https://youtu.be/${YT}"onload="x`, '//youtu.be/' + YT]) {
      assert.equal(parseVideoUrl(bad), null, bad);
    }
  });

  test('the player address is built from a fixed template, never from the pasted text', () => {
    const yt = embedUrl(parseVideoUrl(`https://www.youtube.com/watch?v=${YT}&evil=1`), 'popup');
    assert.equal(yt, `https://www.youtube-nocookie.com/embed/${YT}?autoplay=1&rel=0&playsinline=1&modestbranding=1`);
    const bg = embedUrl(parseVideoUrl(`https://youtu.be/${YT}`), 'background');
    assert.match(bg, /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?autoplay=1&mute=1&controls=0&loop=1&playlist=dQw4w9WgXcQ&/);
    assert.equal(embedUrl(parseVideoUrl('https://vimeo.com/76979871/abcdef1234'), 'popup'), 'https://player.vimeo.com/video/76979871?autoplay=1&dnt=1&h=abcdef1234');
    assert.match(embedUrl(parseVideoUrl('https://vimeo.com/76979871'), 'background'), /background=1&autoplay=1&muted=1&loop=1&dnt=1$/);
    assert.equal(canonicalVideoUrl(parseVideoUrl(`https://m.youtube.com/shorts/${YT}?x=1`)), `https://www.youtube.com/watch?v=${YT}`);
  });

  test('slides: embeds are stored canonically, a pop-up has no link, existing types keep their exact shape', () => {
    const out = cleanSlides([
      embedSlide({ src: `https://youtube.com/shorts/${YT}?feature=share`, link: '/en/casino' }),
      embedSlide({ play: 'background', link: '/en/casino' }),
      { type: 'embed', src: 'https://evil.test/x' },
      { type: 'image', src: '/a.jpg' }
    ]);
    assert.deepEqual(out[0], { type: 'embed', src: `https://www.youtube.com/watch?v=${YT}`, poster: '/media/p.jpg', alt: 'Our review', link: '', play: 'popup' });
    assert.equal(out[1].link, '/en/casino');
    assert.equal(out[1].play, 'background');
    assert.equal(out.length, 3);
    assert.deepEqual(Object.keys(out[2]), ['type', 'src', 'poster', 'alt', 'link']);
  });

  test('a pop-up slide: poster, a Watch pill for that slide, and no iframe in the page source', () => {
    const out = html({ site_hero_media_enabled: 'true', site_hero_slides: JSON.stringify([embedSlide(), { type: 'image', src: '/b.jpg' }]) });
    assert.match(out, /<img src="\/media\/p\.jpg" alt=""/);
    assert.match(out, /<button type="button" class="hero-watch" data-hh-embed="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?autoplay=1/);
    assert.match(out, /data-hh-watch-for="0" aria-haspopup="dialog">/);
    assert.doesNotMatch(out, /<iframe|<script/);
  });

  test('a background slide carries the player address in a data attribute only', () => {
    const out = html({ site_hero_media_enabled: 'true', site_hero_slides: JSON.stringify([embedSlide({ play: 'background' })]) });
    assert.match(out, /<div class="hero-embed" data-hh-bg-embed="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?autoplay=1&amp;mute=1&amp;controls=0/);
    assert.doesNotMatch(out, /<iframe|hero-watch"/);
    assert.match(out, /data-embed-mobile="0"/);
    assert.match(html({ site_hero_media_enabled: 'true', site_hero_media_embed_mobile: 'true', site_hero_slides: JSON.stringify([embedSlide({ play: 'background' })]) }), /data-embed-mobile="1"/);
  });

  test('a single pop-up slide still gets its Watch pill, but no arrows or dots', () => {
    const out = html({ site_hero_media_enabled: 'true', site_hero_slides: JSON.stringify([embedSlide()]) });
    assert.match(out, /hero-media__ui"><button type="button" class="hero-watch"/);
    assert.doesNotMatch(out, /data-hh-next|data-hh-dot/);
  });

  test('the hero "Watch video" button: needs the switch and a real video link', () => {
    const on = html({ site_hero_watch_enabled: 'true', site_hero_watch_url: `https://www.youtube.com/watch?v=${YT}&junk=1`, site_hero_watch_text: 'See how we rate' });
    assert.match(on, /<button type="button" class="btn btn--ghost btn--lg hero-watch-btn" data-hh-embed="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
    assert.match(on, /See how we rate<\/button>/);
    assert.equal(html({ site_hero_watch_url: `https://youtu.be/${YT}` }).includes('hero-watch-btn'), false);
    assert.equal(html({ site_hero_watch_enabled: 'true', site_hero_watch_url: 'https://evil.test/a' }).includes('hero-watch-btn'), false);
    assert.equal(sanitizeHeaderHeroInput({ site_hero_watch_url: `https://m.youtube.com/watch?v=${YT}&x=1` }).site_hero_watch_url, `https://www.youtube.com/watch?v=${YT}`);
    assert.equal(sanitizeHeaderHeroInput({ site_hero_watch_url: 'javascript:alert(1)' }).site_hero_watch_url, '');
    assert.equal(sanitizeHeaderHeroInput({ site_hero_watch_text: '' }).site_hero_watch_text, 'Watch video');
  });

  test('the public script only ever frames the two allowed player addresses and cleans up', () => {
    const js = stripComments(read('static/js/hero-media.js'));
    assert.match(js, /youtube-nocookie\\\.com/);
    assert.match(js, /player\\\.vimeo\\\.com/);
    assert.match(js, /ALLOWED_EMBED\.test/);
    assert.match(js, /role", "dialog"/);
    assert.match(js, /Escape/);
    assert.match(js, /about:blank/);
    assert.match(js, /allowEmbeds/);
  });
});
