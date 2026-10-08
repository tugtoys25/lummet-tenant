// test/generic-content-engine-security.test.js
//
// The custom content type's field system lets an admin define
// arbitrary typed fields whose values are later rendered as public
// HTML. This suite is the concrete verification of the "custom fields
// must never permit arbitrary executable HTML/JS" requirement, across
// every field type, with real attack payloads.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderCustomFieldValue, renderCustomFieldsHtml } from '../worker/custom-field-render.js';

const XSS = `<script>alert(document.cookie)</script>`;
const XSS_ATTR = `" onmouseover="alert(1)`;
const JS_URL = `javascript:alert(1)`;

describe('custom-field-render.js — XSS and injection resistance', () => {
  test('text/textarea: script tags are escaped, not executable', () => {
    for (const type of ['text', 'textarea']) {
      const { html } = renderCustomFieldValue({ field_type: type, label: 'Notes' }, XSS);
      assert.equal(html.includes('<script>'), false);
      assert.ok(html.includes('&lt;script&gt;'));
    }
  });

  test('select/country/currency: attribute-breakout payloads are escaped', () => {
    for (const type of ['select', 'country', 'currency']) {
      const { html } = renderCustomFieldValue({ field_type: type, label: 'X' }, XSS_ATTR);
      assert.equal(html.includes('onmouseover="alert(1)'), false);
    }
  });

  test('url: javascript: scheme is rejected entirely (empty output)', () => {
    const { html } = renderCustomFieldValue({ field_type: 'url', label: 'Website' }, JS_URL);
    assert.equal(html, '');
  });

  test('url: a legitimate https URL renders as a safe anchor', () => {
    const { html } = renderCustomFieldValue({ field_type: 'url', label: 'Website' }, 'https://example.com/page');
    assert.ok(html.includes('href="https://example.com/page"'));
    assert.ok(html.includes('rel="nofollow noopener"'));
  });

  test('url: a URL-shaped XSS payload does not survive into the rendered attribute or text (regression -- this failed before the escapeHtml(safe) fix)', () => {
    const { html } = renderCustomFieldValue({ field_type: 'url', label: 'Website' }, `https://example.com/"><script>alert(1)</script>`);
    assert.equal(html.includes('<script>alert(1)</script>'), false);
    assert.equal(/href="[^"]*"[^>]*>/.test(html), true, 'href attribute must still be well-formed, not broken out of');
  });

  test('image: javascript: scheme is rejected for src too', () => {
    const { html } = renderCustomFieldValue({ field_type: 'image', label: 'Photo' }, JS_URL);
    assert.equal(html, '');
  });

  test('number: non-numeric input renders empty rather than passing through raw', () => {
    const { html } = renderCustomFieldValue({ field_type: 'number', label: 'Count' }, XSS);
    assert.equal(html, '');
  });

  test('multi_select: array items are escaped even when they contain a script tag', () => {
    const { html } = renderCustomFieldValue({ field_type: 'multi_select', label: 'Tags' }, `[${JSON.stringify(XSS)}]`);
    assert.equal(html.includes('<script>'), false);
  });

  test('multi_select: malformed JSON does not throw, renders empty', () => {
    assert.doesNotThrow(() => renderCustomFieldValue({ field_type: 'multi_select', label: 'Tags' }, `not valid json <script>`));
  });

  test('renderCustomFieldsHtml skips empty-value fields rather than showing blank rows', () => {
    const defs = [{ field_key: 'a', label: 'A', field_type: 'text' }, { field_key: 'b', label: 'B', field_type: 'text' }];
    const html = renderCustomFieldsHtml(defs, { a: 'Real value', b: '' });
    assert.ok(html.includes('Real value'));
    assert.equal(html.includes('<dt>B</dt>'), false);
  });

  test('full block render: a combined hostile payload across multiple field types produces no script tag or javascript: scheme anywhere', () => {
    const defs = [
      { field_key: 'notes', label: 'Notes', field_type: 'textarea' },
      { field_key: 'site', label: 'Site', field_type: 'url' },
      { field_key: 'active', label: 'Active', field_type: 'boolean' },
    ];
    const html = renderCustomFieldsHtml(defs, { notes: XSS, site: JS_URL, active: '1' });
    assert.equal(html.includes('<script>'), false);
    assert.equal(html.includes('javascript:'), false);
  });
});
