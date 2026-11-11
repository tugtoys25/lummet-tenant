import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHeaderHero, headerHeroTemplateVars } from '../worker/header-hero.js';

const vars = (o) => headerHeroTemplateVars(parseHeaderHero(o)).hh_announce_html;

test('the top bar is off by default and adds nothing', () => {
  assert.equal(vars({}), '');
  assert.equal(vars({ site_topbar_phone: '+44 20 1234 5678' }), '');
});

test('phone, email and note render as links and text', () => {
  const h = vars({ site_topbar_enabled: 'true', site_topbar_text: 'Mon–Fri 9–6', site_topbar_phone: '+44 (20) 1234-5678', site_topbar_email: 'help@example.com', site_topbar_tone: 'brand' });
  assert.match(h, /hh-topbar--brand/);
  assert.match(h, /href="tel:\+442012345678"/);
  assert.match(h, /href="mailto:help@example\.com"/);
  assert.match(h, /Mon–Fri 9–6/);
});

test('hostile input is escaped and never becomes a link', () => {
  const h = vars({ site_topbar_enabled: 'true', site_topbar_text: '<img src=x onerror=alert(1)>', site_topbar_phone: 'javascript:alert(1)', site_topbar_email: '"><script>x</script>' });
  assert.doesNotMatch(h, /<script|<img|href="javascript|onerror="/i);
  assert.doesNotMatch(h, /href="mailto:/);
});

test('enabled but empty renders nothing; an unknown colour falls back to dark', () => {
  assert.equal(vars({ site_topbar_enabled: 'true' }), '');
  assert.match(vars({ site_topbar_enabled: 'true', site_topbar_text: 'Hi', site_topbar_tone: 'neon' }), /hh-topbar--dark/);
});

test('it sits together with the announcement bar without replacing it', () => {
  const h = vars({ site_announce_enabled: 'true', site_announce_text: 'Offer', site_topbar_enabled: 'true', site_topbar_text: 'Hi' });
  assert.match(h, /hh-announce/); assert.match(h, /hh-topbar/);
});
