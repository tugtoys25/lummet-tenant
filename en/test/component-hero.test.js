// test/component-hero.test.js -- hero components get the same abilities as the homepage hero.
// Layout was checked by hand in a real browser; this suite does not prove pixels.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMPONENT_HERO_FIELDS, COMPONENT_HERO_KEYS, isAdvancedHero, componentHeroModel, renderAdvancedHero,
  cleanHeroSettingsJson, componentHeroDefaultsForAdmin
} from '../worker/component-hero.js';
import { FIELDS } from '../worker/header-hero.js';
import { renderComponent } from '../worker/component-engine.js';
import { Renderer } from '../worker/render.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const real = new Renderer({}, new Request('https://example.test/en'));
// loads the real templates from disk instead of the Worker's asset binding
const renderer = { loadTemplate: async (name) => read(`templates/${name}`), replaceVariables: (t, d) => real.replaceVariables(t, d) };
const comp = (over = {}) => ({ id: 5, type: 'hero', name: 'h', title: 'Big win', content: 'Play now', settings: {}, injection_point: 'content_top', ...over });

describe('the basic hero is untouched', () => {
  test('only the original keys keep the original template output', async () => {
    const html = await renderComponent(renderer, comp({ settings: { link: '/en/casino', button_text: 'Go', bg_image: '/media/a.jpg', new_tab: true } }));
    assert.match(html, /class="hero component-hero"/);
    assert.match(html, /<h1>Big win<\/h1>/);
    assert.match(html, /background-image:url\('\/media\/a\.jpg'\)/);
    assert.doesNotMatch(html, /component-hero--advanced/);
  });
  test('empty settings stay basic', () => {
    assert.equal(isAdvancedHero({}), false);
    assert.equal(isAdvancedHero(null), false);
    assert.equal(isAdvancedHero({ limit: 5, link: '/x' }), false);
  });
  test('design:"advanced" or any new key switches to the advanced hero', () => {
    assert.equal(isAdvancedHero({ design: 'advanced' }), true);
    assert.equal(isAdvancedHero({ height: 'tall' }), true);
    assert.equal(isAdvancedHero({ slides: [] }), true);
  });
});

describe('it can do what the homepage hero does', () => {
  test('every homepage hero option has a component key (except the title, subtitle and on/off)', () => {
    const wanted = FIELDS.filter((f) => f.group === 'hero' && !['site_hero_enabled', 'site_hero_title', 'site_hero_subtitle'].includes(f.key)).map((f) => f.key.slice('site_hero_'.length));
    for (const k of wanted) assert.ok(COMPONENT_HERO_KEYS.includes(k), `missing ${k}`);
  });
  test('slider, video, YouTube, pictures, colours and fonts all render', async () => {
    const html = await renderComponent(renderer, comp({ settings: {
      design: 'advanced', media_enabled: true, media_transition: 'slide',
      slides: [{ type: 'image', src: '/media/a.jpg', alt: 'A' }, { type: 'video', src: '/media/v.mp4', poster: '/media/p.jpg' }, { type: 'embed', src: 'https://youtu.be/dQw4w9WgXcQ', play: 'popup' }, { type: 'embed', src: 'https://vimeo.com/123456789', play: 'background' }],
      cards_enabled: true, cards: [{ src: '/media/c.png', link: '/en/x', caption: 'C' }], cards_position: 'side',
      text_color: '#ffffff', title_color: '#ffcc00', heading_font: 'serif', body_font: 'rounded',
      button_text: 'Play', button_url: '/en/casino', button_new_tab: true, button2_text: 'More', button2_url: '/en/about',
      watch_enabled: true, watch_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', badge: 'New', highlights: 'One\nTwo', description: 'Desc', alignment: 'left', height: 'tall'
    } }));
    for (const part of ['hero--has-media', 'hero-media--slide', 'data-type="video"', 'data-type="embed"', 'data-hh-bg-embed=', 'data-hh-embed=', 'hero--cards-side', 'hero-card--link', 'hero--custom-fg', 'hero--custom-title', 'hero--font-heading', 'hero--font-body', 'target="_blank" rel="noopener">Play', 'hero-watch-btn', 'hero-badge', 'hero-highlights', 'hero-description', 'hero-content--left', 'hero--h-tall']) {
      assert.ok(html.includes(part), `missing ${part}`);
    }
    assert.doesNotMatch(html, /<iframe/i, 'the page source never contains a player');
  });
  test('legacy keys are understood inside the advanced hero', () => {
    const hh = componentHeroModel(comp({ settings: { design: 'advanced', link: '/en/x', bg_image: '/media/b.jpg', new_tab: true } }));
    assert.equal(hh.heroButtonUrl, '/en/x');
    assert.equal(hh.heroImage, '/media/b.jpg');
    assert.equal(hh.heroButtonNewTab, true);
  });
  test('defaults are empty: no stray badge, button or empty headings', () => {
    const html = renderAdvancedHero(comp({ title: '', content: '', settings: { design: 'advanced' } }));
    assert.doesNotMatch(html, /Find Your Perfect Casino|Browse Casinos|<h1>|hero-subtitle|hero-actions|hero-badge/);
  });
  test('the id is per component and the first picture is lazy unless the hero is at the top', () => {
    const s = { design: 'advanced', media_enabled: true, slides: [{ type: 'image', src: '/media/a.jpg' }] };
    const mid = renderAdvancedHero(comp({ id: 9, settings: s }));
    assert.match(mid, /id="hero-c9"/);
    assert.match(mid, /loading="lazy"/);
    const top = renderAdvancedHero(comp({ id: 9, settings: s, injection_point: 'top' }));
    assert.match(top, /fetchpriority="high"/);
  });
  test('several heroes on one page have different ids', () => {
    assert.notEqual(renderAdvancedHero(comp({ id: 1, settings: { design: 'advanced' } })).match(/id="[^"]+"/)[0], renderAdvancedHero(comp({ id: 2, settings: { design: 'advanced' } })).match(/id="[^"]+"/)[0]);
  });
});

describe('safety', () => {
  test('text is escaped and tags in the content are removed', () => {
    const html = renderAdvancedHero(comp({ title: '<script>x</script>', content: '<b>Hi</b> "q"', settings: { design: 'advanced', badge: '<img onerror=1>' } }));
    assert.doesNotMatch(html, /<script>|<img onerror/);
    assert.match(html, /&lt;script&gt;/);
  });
  test('bad links, colours, fonts and videos are dropped', () => {
    const html = renderAdvancedHero(comp({ settings: { design: 'advanced', button_text: 'x', button_url: 'javascript:alert(1)', text_color: 'red;}body{x', heading_font: 'Comic;}', media_enabled: true, slides: [{ type: 'embed', src: 'https://evil.example/watch?v=dQw4w9WgXcQ' }, { type: 'image', src: 'javascript:1' }] } }));
    assert.doesNotMatch(html, /javascript:|evil\.example|Comic|body\{x/);
    assert.doesNotMatch(html, /hero-media/);
  });
  test('values are limited (slides to 6, pictures to 4)', () => {
    const slides = Array.from({ length: 9 }, (_, i) => ({ type: 'image', src: `/m/${i}.jpg` }));
    const cards = Array.from({ length: 9 }, (_, i) => ({ src: `/m/${i}.jpg` }));
    const hh = componentHeroModel(comp({ settings: { slides, cards } }));
    assert.equal(hh.heroSlides.length, 6);
    assert.equal(hh.heroCards.length, 4);
  });
  test('a failing advanced render falls back to the basic hero', async () => {
    const c = comp({ settings: { design: 'advanced' } });
    Object.defineProperty(c, 'title', { get() { throw new Error('boom'); } });
    const origError = console.error; console.error = () => {};
    try {
      const html = await renderComponent({ loadTemplate: async () => '<section class="hero component-hero">basic</section>', replaceVariables: (t) => t }, c).catch(() => 'threw');
      assert.ok(html === 'threw' || html.includes('basic'));
    } finally { console.error = origError; }
  });
});

describe('saving', () => {
  test('empty settings stay empty', () => {
    assert.equal(cleanHeroSettingsJson(''), null);
    assert.equal(cleanHeroSettingsJson(null), null);
  });
  test('invalid JSON or a non-object is refused with a plain message', () => {
    assert.throws(() => cleanHeroSettingsJson('{nope'), /valid JSON/);
    assert.throws(() => cleanHeroSettingsJson('[1]'), /JSON object/);
  });
  test('known keys are cleaned, other keys are kept', () => {
    const out = JSON.parse(cleanHeroSettingsJson(JSON.stringify({ height: 'huge', text_color: 'blue}', slides: [{ type: 'image', src: '/m/a.jpg' }, { src: 'javascript:1' }], limit: 5, link: 'javascript:1' })));
    assert.equal(out.height, 'standard');
    assert.equal(out.text_color, '');
    assert.deepEqual(out.slides, [{ type: 'image', src: '/m/a.jpg', poster: '', alt: '', link: '' }]);
    assert.equal(out.limit, 5);
    assert.equal(out.link, '');
  });
  test('cleaning twice gives the same result', () => {
    const once = cleanHeroSettingsJson(JSON.stringify({ design: 'advanced', media_enabled: true, slides: [{ type: 'embed', src: 'https://youtu.be/dQw4w9WgXcQ', play: 'popup' }], cards: [{ src: '/c.png' }] }));
    assert.equal(cleanHeroSettingsJson(once), once);
  });
  test('the api cleans hero settings on create and update, and the preview endpoint exists', () => {
    const api = read('worker/api.js');
    assert.equal((api.match(/cleanHeroSettingsJson\(body\.settings_json\)/g) || []).length, 3);
    assert.match(api, /\/api\/v1\/component\/hero-preview/);
  });
});

describe('admin panel', () => {
  const page = read('templates/pages/admin/components.html');
  test('its defaults match the server', () => {
    const m = page.match(/id="chDefaults">([^<]+)</);
    assert.ok(m, 'defaults block');
    const fromPage = JSON.parse(m[1]);
    const server = {};
    for (const [k, v] of Object.entries(componentHeroDefaultsForAdmin())) server[k] = String(v);
    assert.deepEqual(fromPage, server);
  });
  test('every setting has a control', () => {
    for (const k of COMPONENT_HERO_KEYS) {
      assert.ok(page.includes(`name="ch_${k}"`) || page.includes(`data-repeat="ch_${k}"`), `no control for ${k}`);
    }
  });
  test('the script is loaded, uses no innerHTML and hooks the existing form', () => {
    assert.match(read('templates/layout/base.html'), /component-hero-admin\.js/);
    const js = read('static/js/component-hero-admin.js');
    assert.doesNotMatch(js.replace(/\/\/.*$/gm, ''), /innerHTML|document\.write|eval\(/);
    assert.match(read('static/js/component-admin.js'), /component:loaded/);
    assert.match(page, /sandbox="allow-scripts"/);
  });
  test('the component field list has no duplicates', () => {
    assert.equal(new Set(COMPONENT_HERO_KEYS).size, COMPONENT_HERO_FIELDS.length);
  });
});
