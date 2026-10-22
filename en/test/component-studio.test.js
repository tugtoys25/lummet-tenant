// Visual component editor: data sources, new component types, cleaners, XSS safety.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import {
  cleanGridSettings, cleanTableSettings, cleanSectionSettings, cleanRichText, cleanPicks,
  cleanStudioSettingsJson, cleanLegacySettingsJson, renderStudioComponent, renderSection
} from '../worker/component-studio.js';
import { readComponentStudioSource } from './support/component-studio-source.js';
import { searchSource, resolvePicks, latestItems, searchLinks, isValidKey } from '../worker/component-sources.js';
import { renderComponent } from '../worker/component-engine.js';
import { Renderer } from '../worker/render.js';
import { readApiSource } from './support/api-source.js';

let db;
before(async () => {
  const t = createTestDb();
  applyMigrations(t);
  db = t.db || t;
  await db.prepare("INSERT INTO casinos (name, slug, website_url, affiliate_url, rating, published, status) VALUES ('Alpha <b>Casino</b>','alpha','https://a.com','https://a.com/go',4.5,1,'published')").run();
  await db.prepare("INSERT INTO casinos (name, slug, website_url, affiliate_url, rating, published, status) VALUES ('Draft Casino','draft','https://d.com','https://d.com/go',3,0,'draft')").run();
});

describe('cleaners', () => {
  test('picks: invalid source/key and duplicates dropped', () => {
    const p = cleanPicks([{ source: 'casino', key: 'alpha' }, { source: 'casino', key: 'alpha' }, { source: 'evil', key: 'x' }, { source: 'casino', key: '../x' }, null]);
    assert.deepEqual(p, [{ source: 'casino', key: 'alpha' }]);
    assert.ok(isValidKey('casino', 'alpha'));
  });
  test('grid defaults and clamps', () => {
    const g = cleanGridSettings({ columns: 99, limit: -4, style: 'x', mode: 'zzz', more_url: 'javascript:alert(1)' });
    assert.equal(g.columns, 4); assert.equal(g.limit, 1); assert.equal(g.style, 'card'); assert.equal(g.mode, 'picked'); assert.equal(g.more_url, '');
  });
  test('table keeps rectangular rows', () => {
    const t = cleanTableSettings({ columns: ['A', 'B'], rows: [['1'], ['x', { t: 'y', l: 'javascript:1' }, 'extra']] });
    assert.equal(t.rows[0].length, 2); assert.equal(t.rows[1].length, 2); assert.equal(t.rows[1][1].l, undefined);
  });
  test('rich text strips scripts, handlers and bad links', () => {
    const h = cleanRichText('<p onclick="x()">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">bad</a><a href="https://ok.com/a">ok</a><img src=x onerror=alert(1)>');
    assert.ok(!/script|onclick|onerror|javascript|<img/i.test(h), h);
    assert.ok(h.includes('href="https://ok.com/a"'));
  });
  test('section drops unknown blocks and bad video', () => {
    const s = cleanSectionSettings({ blocks: [{ type: 'evil' }, { type: 'video', url: 'https://evil.com/x' }, { type: 'heading', text: 'Hi' }] });
    assert.equal(s.blocks.length, 1);
  });
  test('studio json rejects non-json and non-object', () => {
    assert.throws(() => cleanStudioSettingsJson('section', '{bad'), /valid JSON/);
    assert.throws(() => cleanStudioSettingsJson('section', '[]'), /JSON object/);
    assert.equal(JSON.parse(cleanStudioSettingsJson('section', '')).pad, 'md');
  });
  test('legacy types: link and limit only', () => {
    const j = JSON.parse(cleanLegacySettingsJson('cta', '{"link":"javascript:1","custom":"keep"}'));
    assert.equal(j.link, ''); assert.equal(j.custom, 'keep');
    assert.equal(JSON.parse(cleanLegacySettingsJson('news_feed', '{"limit":"900"}')).limit, 50);
    assert.equal(cleanLegacySettingsJson('text', '{"a":1}'), '{"a":1}');
  });
});

describe('sources', () => {
  test('search finds published only', async () => {
    const r = await searchSource(db, 'casino', { q: 'a' });
    assert.ok(r.some((x) => x.key === 'alpha'));
    assert.ok(!r.some((x) => x.key === 'draft'));
  });
  test('resolve drops missing and unpublished, keeps order', async () => {
    const r = await resolvePicks(db, [{ source: 'casino', key: 'draft' }, { source: 'casino', key: 'nope' }, { source: 'casino', key: 'alpha' }]);
    assert.deepEqual(r.map((x) => x.key), ['alpha']);
  });
  test('latest and links work', async () => {
    assert.ok((await latestItems(db, 'casino', { limit: 3 })).length >= 1);
    assert.ok(Array.isArray(await searchLinks(db, 'page', { q: '' })));
  });
});

describe('rendering', () => {
  test('grid escapes names', async () => {
    const html = await renderStudioComponent(db, { type: 'content_grid', title: 'Top', settings: { items: [{ source: 'casino', key: 'alpha' }] } });
    assert.ok(html.includes('component-grid')); assert.ok(!html.includes('<b>Casino'));
  });
  test('empty grid renders nothing', async () => {
    assert.equal(await renderStudioComponent(db, { type: 'content_grid', settings: { items: [] } }), '');
  });
  test('casino table', async () => {
    const html = await renderStudioComponent(db, { type: 'data_table', settings: { mode: 'casinos', items: [{ source: 'casino', key: 'alpha' }] } });
    assert.ok(html.includes('<table')); assert.ok(html.includes('/en/casino/alpha'));
  });
  test('manual table escapes', async () => {
    const html = await renderStudioComponent(db, { type: 'data_table', settings: { columns: ['<i>A</i>'], rows: [[{ t: '<script>x</script>' }]] } });
    assert.ok(!html.includes('<script>') && !html.includes('<i>A'));
  });
  test('section with blocks and style var safety', () => {
    const html = renderSection({ title: 'T', settings: { bg: 'color', bg_color: 'red;}</style><script>', blocks: [{ type: 'heading', text: 'H' }] } });
    assert.ok(html.includes('sec__title') && !html.includes('<script'));
  });
  test('renderComponent dispatches new types', async () => {
    const out = await renderComponent({ env: { DB: db }, loadTemplate: async () => null }, { type: 'section', title: 'X', settings: { blocks: [{ type: 'divider' }] } });
    assert.ok(out.includes('component-section'));
  });
});

import { readFileSync } from 'node:fs';
const read = (p) => readTemplateSource(p);
describe('wiring', () => {
  test('page offers the new types and the visual panel', () => {
    const page = read('templates/pages/admin/components.html');
    for (const t of ['content_grid', 'data_table', 'section']) assert.ok(page.includes(`value="${t}"`));
    assert.ok(page.includes('id="csPanel"') && page.includes('id="csSettingsGroup"'));
  });
  test('base loads the editor and the public block styles', () => {
    const base = read('templates/layout/base.html');
    assert.ok(base.includes('component-studio.js') && base.includes('component-blocks.css'));
  });
  test('editor script never writes HTML strings', () => {
    const js = readComponentStudioSource();
    assert.ok(!/\.innerHTML\s*=/.test(js.replace(/tmp\.innerHTML;/g, '')), 'innerHTML assignment found');
    assert.ok(!/insertAdjacentHTML|document\.write/.test(js));
  });
  test('API wires preview, search, resolve and checks settings on save', () => {
    const api = readApiSource();
    for (const s of ['/api/v1/component/preview', '/api/v1/component/pick-search', '/api/v1/component/pick-resolve']) assert.ok(api.includes(s), s);
    assert.ok(/"\/api\/v1\/component\/pick-search":\s*"components"/.test(api));
    assert.equal((api.match(/cleanComponentSettings\(body\.type/g) || []).length, 2);
  });
});

describe('older types preview', () => {
  const real = new Renderer({}, new Request('https://example.test/en'));
  const renderer = { env: {}, loadTemplate: async (n) => read(`templates/${n}`), replaceVariables: (t, d) => real.replaceVariables(t, d) };
  test('cta and text render through the real templates', async () => {
    const cta = await renderComponent(renderer, { type: 'cta', title: 'Join', content: 'Now', settings: { button_text: 'Go', link: '/en/casino' }, injection_point: 'content_top' });
    assert.ok(cta.includes('Go') && cta.includes('/en/casino'));
    const text = await renderComponent(renderer, { type: 'text', title: '', content: '<p>Hello</p>', settings: {}, injection_point: 'content_top' });
    assert.ok(text.includes('Hello'));
  });
  test('the preview route accepts the older types', () => {
    const api = readApiSource();
    assert.ok(api.includes('PREVIEW_OLD') && api.includes('new Renderer(env, request)'));
  });
});

describe('shared link picker', () => {
  const lp = read('static/js/link-picker.js');
  test('is loaded before the editor and exposes the dialog', () => {
    const base = read('templates/layout/base.html');
    assert.ok(base.indexOf('link-picker.js') !== -1 && base.indexOf('link-picker.js') < base.indexOf('component-studio.js'));
    assert.ok(lp.includes('window.LummetPicker'));
  });
  test('adds a picker to the nav and homepage link fields, without HTML strings', () => {
    for (const sel of ['#navForm input[name=\\"url\\"]', '.section-button-url', '.card-url']) assert.ok(lp.includes(sel), sel);
    assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(lp));
  });
  test('those fields exist in the pages the picker targets', () => {
    assert.ok(read('templates/pages/admin/nav.html').includes('name="url"'));
    const admin = readAdminSource();
    assert.ok(admin.includes('section-button-url') && admin.includes('card-url'));
  });
});

describe('api routes declare what they use', () => {
  test('pick-search builds its own url object', () => {
    const api = readApiSource();
    const i = api.indexOf('if (path === "/api/v1/component/pick-search"');
    const block = api.slice(i, api.indexOf('pick-resolve', i));
    assert.ok(block.includes('const url = new URL(request.url)'), 'url is used but never defined in this route');
  });
});

import { handleAPI } from '../worker/api.js';
import { readControllersSource } from './support/controllers-source.js';
import { readAdminSource } from './support/admin-js-source.js';
import { readTemplateSource } from './support/template-source.js';
describe('real handleAPI() for the studio routes', () => {
  const admin = { user_id: 1, role: 'admin', email: 'a@test.com' };
  const req = (method, url, body) => ({ method, url, headers: new Headers(), json: async () => body });
  const call = (method, path, body, user = admin) => handleAPI(req(method, `https://x.com${path}`, body), { DB: db }, path.split('?')[0], user);

  test('pick-search answers for each source and for links', async () => {
    for (const q of ['source=casino&q=alp', 'source=page&links=1', 'source=casino&links=1&q=alp', 'source=news', 'source=research', 'source=media', 'source=author', 'source=update']) {
      const res = await call('GET', `/api/v1/component/pick-search?${q}`);
      const d = await res.json();
      assert.equal(res.status, 200, `${q}: ${JSON.stringify(d)}`);
      assert.equal(d.success, true, q);
    }
    const d = await (await call('GET', '/api/v1/component/pick-search?source=casino&q=alp')).json();
    assert.ok(d.results.some((r) => r.key === 'alpha'));
  });
  test('pick-search rejects an unknown source', async () => {
    assert.equal((await call('GET', '/api/v1/component/pick-search?source=evil')).status, 400);
  });
  test('pick-resolve and preview work', async () => {
    const r = await (await call('POST', '/api/v1/component/pick-resolve', { picks: [{ source: 'casino', key: 'alpha' }] })).json();
    assert.equal(r.results.length, 1);
    const p = await (await call('POST', '/api/v1/component/preview', { type: 'section', title: 'T', settings_json: '{"blocks":[{"type":"divider"}]}' })).json();
    assert.ok(p.success && p.html.includes('component-section'));
    const g = await (await call('POST', '/api/v1/component/preview', { type: 'content_grid', settings_json: JSON.stringify({ items: [{ source: 'casino', key: 'alpha' }] }) })).json();
    assert.ok(g.html.includes('cg-card'));
  });
  test('create cleans settings of the new types', async () => {
    const res = await call('POST', '/api/v1/component/create', { name: 'g', type: 'content_grid', settings_json: '{"columns":99,"more_url":"javascript:1"}' });
    const d = await res.json();
    assert.equal(d.success, true, JSON.stringify(d));
    const got = await (await call('GET', `/api/v1/component/get?id=${d.id}`)).json();
    const s = JSON.parse(got.component.settings_json);
    assert.equal(s.columns, 4); assert.equal(s.more_url, '');
  });
});

describe('Choose from Media on picture-address fields', () => {
  const lp = read('static/js/link-picker.js');
  const admin = readAdminSource();
  const fields = {
    'templates/pages/admin/authors.html': ['avatar_url'],
    'templates/pages/admin/casino-create.html': ['name="logo"'],
    'templates/pages/admin/casino-edit.html': ['name="logo"'],
    'templates/pages/admin/seo.html': ['og_image'],
    'templates/pages/admin/settings.html': ['site_logo', 'site_og_image', 'site_favicon_96', 'site_favicon_svg', 'site_favicon_ico', 'site_apple_touch_icon', 'site_pwa_icon_192', 'site_pwa_icon_512'],
  };
  for (const [file, names] of Object.entries(fields)) {
    test(`${file} fields are covered`, () => {
      const page = read(file);
      for (const n of names) {
        assert.ok(page.includes(n), `${n} missing from page`);
        const key = n.replace(/^name="|"$/g, '');
        assert.ok(lp.includes(key), `${key} not covered by the picker`);
      }
    });
  }
  test('rows the dashboard builds later are covered', () => {
    for (const c of ['compliance-image', 'section-background-image', 'card-image-url', 'card-background-image']) {
      assert.ok(admin.includes(c) && lp.includes('.' + c), c);
    }
    assert.ok(lp.includes('data-section-field="image"') && admin.includes('data-section-field="image"'));
    assert.ok(lp.includes('MutationObserver'));
  });
  test('the page that ships the picker also ships the media library dialog', () => {
    assert.ok(read('templates/layout/base.html').includes('/static/js/media-picker.js'));
  });
  test('the .ico, manifest and json files get no thumbnail', () => {
    assert.ok(/ico\|webmanifest\|json/.test(lp));
  });
});

describe('media picker thumbnails', () => {
  const mp = read('static/js/media-picker.js');
  test('a thumbnail that fails to load falls back to the original picture', () => {
    assert.ok(mp.includes('data-fallback-src'));
    assert.ok(/addEventListener\('error'/.test(mp));
  });
});

describe('settings contents bar', () => {
  test('steps aside once the end of the settings has scrolled past it', () => {
    const page = read('templates/pages/admin/settings.html');
    assert.ok(page.includes('syncNavVisibility'));
    assert.ok(/settingsEnd <= navBottom \? 'none'/.test(page));
    assert.ok(page.includes("window.addEventListener('scroll', syncNavVisibility"));
  });
});

describe('research citation links', () => {
  const js = read('static/js/anchor-scroll.js');
  test('jump instantly and keep the target in place while the page settles', () => {
    assert.ok(js.includes('research-source-'));
    assert.ok(js.includes('scrollBehavior = "auto"'));
    assert.ok(js.includes('setInterval'));
  });
  test('loaded on every page, and the footnote list no longer adds a second offset', () => {
    assert.ok(read('templates/layout/base.html').includes('/static/js/anchor-scroll.js'));
    assert.ok(/research-footnotes li \{[^}]*scroll-margin-top: 0/.test(read('static/css/research.css')));
  });
  test('footnote ids match the numbers in the links', () => {
    const c = readControllersSource();
    assert.ok(c.includes('href="#research-source-${num}"') && c.includes('id="research-source-${i + 1}"'));
  });
});
