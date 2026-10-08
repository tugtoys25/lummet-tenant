// test/component-page-types.test.js -- the page types offered under Dashboard > Components >
// "Assign Component to Page" are the ones the public pages really render components for,
// including author, payment methods and research.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { renderAllInjectionPoints } from '../worker/component-engine.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const page = read('templates/pages/admin/components.html');
const controllers = read('worker/controllers.js');

const [assignSelect, , filterSelect] = (() => {
  const a = page.indexOf('name="page_type"');
  const f = page.indexOf('id="filterPageType"');
  return [page.slice(a, page.indexOf('</select>', a)), null, page.slice(f, page.indexOf('</select>', f))];
})();

const NEW_TYPES = ['author', 'author_list', 'payment_method', 'payment_method_list', 'research', 'research_list', 'research_type_list'];

describe('page types in the assign form', () => {
  for (const t of NEW_TYPES) {
    test(`${t} is offered when assigning and when filtering`, () => {
      assert.ok(assignSelect.includes(`value="${t}"`), `assign form lacks ${t}`);
      assert.ok(filterSelect.includes(`value="${t}"`), `filter lacks ${t}`);
    });
  }
  test('the earlier page types are all still there', () => {
    for (const t of ['homepage', 'review', 'casino', 'country', 'category', 'news', 'update', 'page', 'casino_list', 'review_list', 'news_list', 'updates_list', 'category_list', 'country_list']) {
      assert.ok(assignSelect.includes(`value="${t}"`), `lost ${t}`);
    }
  });
  test('no page type appears twice in a list', () => {
    for (const list of [assignSelect, filterSelect]) {
      const values = [...list.matchAll(/value="([^"]+)"/g)].map((m) => m[1]).filter(Boolean);
      assert.equal(new Set(values).size, values.length);
    }
  });
});

const MORE_TYPES = ['sportsbook', 'sportsbook_list', 'affiliate_partner', 'affiliate_partner_list', 'content_landing_page', 'generic_review', 'country_custom_page', 'category_country_page', 'compare_casino', 'compare_casino_list', 'compare_sportsbook', 'compare_sportsbook_list', 'compare_affiliate_partner', 'compare_affiliate_partner_list'];

describe('the other page types that render components are offered too', () => {
  for (const t of MORE_TYPES) {
    test(`${t}: offered, and a controller renders components for it`, () => {
      assert.ok(assignSelect.includes(`value="${t}"`), `assign form lacks ${t}`);
      assert.ok(filterSelect.includes(`value="${t}"`), `filter lacks ${t}`);
      const stem = t.replace(/^compare_(casino|sportsbook|affiliate_partner)(_list)?$/, (m, k, l) => '`compare_${compareType}' + (l || '') + '`');
      assert.ok(controllers.includes(`renderAllComponents("${t}"`) || controllers.includes('renderAllComponents(' + stem), `no controller renders ${t}`);
    });
  }
  test('custom content types are added by script, with safe values only', () => {
    assert.match(page, /id="assignCustomGroup"/);
    assert.match(page, /id="filterCustomGroup"/);
    const js = read('static/js/component-admin.js');
    assert.match(js, /populateCustomPageTypes\(\)/);
    assert.match(js, /\^\[a-z0-9_-\]\+\$/i);
    const fn = js.slice(js.indexOf('async function populateCustomPageTypes'));
    assert.doesNotMatch(fn, /innerHTML/);
  });
  test('comparison and generic review pages now have the content-top slot too', () => {
    for (const f of ['templates/pages/comparison.html', 'templates/pages/generic-review.html']) {
      assert.ok(read(f).includes('{{components_content_top}}'), f);
    }
  });
});

describe('the pages render what is assigned to them', () => {
  test('author and payment method pages already ask for their components', () => {
    for (const t of ['author', 'author_list', 'payment_method', 'payment_method_list']) {
      assert.match(controllers, new RegExp(`renderAllComponents\\(\\s*"${t}"`), `no renderAllComponents for ${t}`);
    }
  });
  test('the three research pages ask for their components and pass them to the template', () => {
    assert.match(controllers, /renderAllComponents\("research_list", "research_list"\)/);
    assert.match(controllers, /renderAllComponents\("research_type_list", researchType\)/);
    assert.match(controllers, /renderAllComponents\("research", `\$\{item\.type\}\/\$\{item\.slug\}`\)/);
    assert.equal((controllers.match(/\.\.\.researchComponentVars\(allComponents\)/g) || []).length, 3);
  });
  test('the research templates have all five component slots', () => {
    for (const f of ['templates/pages/research.html', 'templates/pages/research-list.html']) {
      const t = read(f);
      for (const slot of ['components_top', 'components_content_top', 'components_content_bottom', 'components_bottom']) {
        assert.ok(t.includes(`{{${slot}}}`), `${f} lacks ${slot}`);
      }
    }
  });
});

describe('assignment by slug', () => {
  let db;
  const fake = { loadTemplate: async () => '<div>{{title}}</div>', replaceVariables: (t, d) => t.replace('{{title}}', d.title || '') };
  beforeEach(async () => { db = createTestDb(); applyMigrations(db); });
  const add = async (id, title, pageType, slug, point = 'content_top') => {
    await db.prepare(`INSERT INTO components (id, name, type, title, status) VALUES (?, ?, 'text', ?, 'active')`).bind(id, `c${id}`, title).run();
    await db.prepare(`INSERT INTO page_components (page_type, page_slug, component_id, position, injection_point, enabled) VALUES (?, ?, ?, 0, ?, 1)`).bind(pageType, slug, id, point).run();
  };
  test('research item: exact type/slug and the * wildcard both match, another item does not', async () => {
    await add(1, 'Exact', 'research', 'country/netherlands');
    await add(2, 'All', 'research', '*');
    const nl = await renderAllInjectionPoints(fake, db, 'research', 'country/netherlands');
    assert.match(nl.content_top, /Exact/); assert.match(nl.content_top, /All/);
    const other = await renderAllInjectionPoints(fake, db, 'research', 'country/malta');
    assert.doesNotMatch(other.content_top, /Exact/); assert.match(other.content_top, /All/);
  });
  test('research type page and hub are separate scopes', async () => {
    await add(3, 'TypePage', 'research_type_list', 'country');
    await add(4, 'Hub', 'research_list', 'research_list', 'top');
    assert.match((await renderAllInjectionPoints(fake, db, 'research_type_list', 'country')).content_top, /TypePage/);
    assert.equal((await renderAllInjectionPoints(fake, db, 'research_type_list', 'regulator')).content_top, '');
    assert.match((await renderAllInjectionPoints(fake, db, 'research_list', 'research_list')).top, /Hub/);
    assert.equal((await renderAllInjectionPoints(fake, db, 'research', 'country/netherlands')).top, '');
  });
});
