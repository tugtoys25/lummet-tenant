// test/user-dashboard.test.js -- customer dashboard pages share the admin page components,
// escape everything they render, and the server escapes the values it templates in.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
const PAGES = ['dashboard', 'bookmarks', 'inquiries', 'notifications', 'profile', 'submit-casino'];

describe('customer pages use the admin page layout', () => {
  for (const page of PAGES) {
    const t = read(`templates/pages/users/${page}.html`);
    test(`${page}: admin wrapper, shared page header, no inline event handlers`, () => {
      assert.match(t, /<div class="admin-wrapper">/);
      assert.match(t, /<div class="admin-header dash-page-head">/);
      assert.doesNotMatch(t, /\son(click|submit|change)=/i);
    });
  }

  test('forms are labelled and carry autocomplete hints', () => {
    const profile = read('templates/pages/users/profile.html');
    assert.match(profile, /autocomplete="current-password"/);
    assert.match(profile, /autocomplete="new-password"/);
    for (const page of ['inquiries', 'profile', 'submit-casino']) {
      const t = read(`templates/pages/users/${page}.html`);
      const inputs = (t.match(/<(input|textarea)\b[^>]*\bid="/g) || []).length;
      const labels = (t.match(/<label for="/g) || []).length;
      assert.ok(labels >= inputs - 1, `${page}: every field needs a label (disabled role field excepted)`);
    }
  });
});

describe('user-dashboard.js', () => {
  const src = read('static/js/user-dashboard.js');

  test('is wrapped so it exports nothing onto window', () => {
    assert.match(src, /^\(function \(\) \{/m);
    assert.doesNotMatch(src, /window\.[a-zA-Z]+\s*=\s*function/);
  });

  test('every API-derived field goes through esc() before it is placed in markup', () => {
    // Raw ${...} interpolation of record fields was the old pattern; none may return.
    assert.doesNotMatch(src, /\$\{\s*(i|n|s|c)\.[a-z_]+/);
    assert.doesNotMatch(src, /\bonclick=/);
    assert.match(src, /function esc\(/);
  });

  test('links are restricted to internal paths or http(s)', () => {
    assert.match(src, /function safeHref/);
    assert.match(src, /\^\\\/\(\?!\[\\\/\\\\\]\)/);
  });

  test('notification HTML is reduced to text without running scripts', () => {
    assert.match(src, /new DOMParser\(\)/);
    assert.match(src, /script,style,template/);
  });
});

describe('server side', () => {
  test('email and role are HTML-escaped before they are templated into user pages', () => {
    const src = read('worker/controllers/user-pages.js') + read('worker/controllers/dashboard.js');
    assert.equal((src.match(/email: renderer\.escapeHtml\(String\(user\.email/g) || []).length, 2);
    assert.equal((src.match(/role: renderer\.escapeHtml\(String\(user\.role/g) || []).length, 2);
  });

  test('profile update validates the email and reports duplicates', () => {
    const src = read('worker/api/routes/user-dashboard.js');
    assert.match(src, /Enter a valid email address/);
    assert.match(src, /That email address is already in use/);
  });

  test('a notification can only be marked read by its owner', () => {
    assert.match(read('worker/database/user_dashboard.js'), /WHERE id = \? AND user_id = \?/);
    assert.match(read('worker/api/routes/user-dashboard.js'), /markNotificationRead\(env\.DB, body\.id, user\.user_id\)/);
  });
});
