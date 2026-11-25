// test/news-time-live.test.js -- the live "x ago" text on news cards and articles (js-src/app/06-news-time.js).
// Runs the real browser script in a minimal fake page. Not covered: a real browser, real timezones/Intl output, real timers over minutes.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'js-src', 'app', '06-news-time.js'), 'utf-8');

function page(isos, { hidden = false } = {}) {
  const timers = []; const listeners = {};
  const els = isos.map((iso) => {
    const attrs = { datetime: iso, 'data-news-time': 'card' };
    return { textContent: 'fallback', title: '', getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = String(v); }, attrs };
  });
  const document = {
    hidden,
    addEventListener: (n, f) => { listeners[n] = f; },
    querySelectorAll: (sel) => els.filter((e) => (sel.includes('data-news-base') ? e.attrs['data-news-base'] !== undefined : !('data-news-done' in e.attrs)))
  };
  const ctx = { document, window: {}, Intl, Date, Math, isNaN, parseInt, String, setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].dead = true; } };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return { ctx, els, timers, listeners, document };
}
const MIN = 60000, HR = 3600000, DAY = 86400000;

describe('nrAgo wording', () => {
  const { ctx } = page([]);
  const N = Date.parse('2026-11-25T12:00:00Z');
  const ago = (ms) => ctx.window.nrAgo(N - ms, N);
  test('under a minute, minutes, hours with minutes', () => {
    assert.equal(ago(0), 'just now'); assert.equal(ago(59000), 'just now');
    assert.equal(ago(60000), '1 min ago'); assert.equal(ago(2 * MIN), '2 min ago'); assert.equal(ago(59 * MIN + 59000), '59 min ago');
    assert.equal(ago(HR), '1 hr ago'); assert.equal(ago(HR + 5 * MIN), '1 hr 5 min ago'); assert.equal(ago(2 * HR + 34 * MIN), '2 hr 34 min ago'); assert.equal(ago(23 * HR + 59 * MIN), '23 hr 59 min ago');
  });
  test('days, weeks, months, years, with correct singular/plural', () => {
    assert.equal(ago(DAY), '1 day ago'); assert.equal(ago(2 * DAY), '2 days ago'); assert.equal(ago(6 * DAY + 23 * HR), '6 days ago');
    assert.equal(ago(7 * DAY), '1 week ago'); assert.equal(ago(15 * DAY), '2 weeks ago'); assert.equal(ago(29 * DAY), '4 weeks ago');
    assert.equal(ago(30 * DAY), '1 month ago'); assert.equal(ago(75 * DAY), '2 months ago'); assert.equal(ago(364 * DAY), '11 months ago');
    assert.equal(ago(365 * DAY), '1 year ago'); assert.equal(ago(800 * DAY), '2 years ago');
  });
  test('future times read "in ...", and bad input gives empty text, never "NaN"', () => {
    assert.equal(ctx.window.nrAgo(N + 2 * HR + 10 * MIN, N), 'in 2 hr 10 min'); assert.equal(ctx.window.nrAgo(N + 30000, N), 'just now');
    assert.equal(ctx.window.nrAgo(NaN, N), ''); assert.equal(ctx.window.nrAgo(Date.parse('nonsense'), N), '');
  });
});

describe('live updating', () => {
  test('text is date plus "x ago", and it changes when time passes without reloading', () => {
    const now = Date.now();
    const p = page([new Date(now - 3 * MIN).toISOString()]);
    p.ctx.window.nrLocalizeTimes(p.document);
    assert.match(p.els[0].textContent, / · 3 min ago$/);
    assert.ok(p.els[0].attrs['data-news-base'] && p.els[0].title);
    const realNow = Date.now; Date.now = () => now + 4 * MIN;      // four minutes pass
    try { p.timers[p.timers.length - 1].f(); } finally { Date.now = realNow; }
    assert.match(p.els[0].textContent, / · 7 min ago$/);
  });
  test('tick speed follows the youngest item: 15 s under an hour, 1 min under a day, 15 min after', () => {
    const now = Date.now();
    const wait = (age) => { const p = page([new Date(now - age).toISOString()]); p.ctx.window.nrLocalizeTimes(p.document); return p.timers[p.timers.length - 1].ms; };
    assert.equal(wait(5 * MIN), 15000); assert.equal(wait(3 * HR), 60000); assert.equal(wait(5 * DAY), 900000);
  });
  test('old stories also get an age; a bad date is left alone; hidden tab schedules nothing; one timer at a time', () => {
    const now = Date.now();
    const p = page([new Date(now - 400 * DAY).toISOString(), 'garbage']);
    p.ctx.window.nrLocalizeTimes(p.document);
    assert.match(p.els[0].textContent, / · 1 year ago$/); assert.equal(p.els[1].textContent, 'fallback');
    const h = page([new Date(now - MIN).toISOString()], { hidden: true }); h.ctx.window.nrLocalizeTimes(h.document);
    assert.equal(h.timers.length, 0, 'no timer while hidden');
    h.document.hidden = false; h.listeners.visibilitychange(); assert.equal(h.timers.length, 1, 'coming back restarts it');
  });
  test('cards added later (infinite load) are picked up by the next localise call', () => {
    const p = page([new Date(Date.now() - MIN).toISOString()]);
    p.ctx.window.nrLocalizeTimes(p.document);
    const live = p.timers.filter((t) => !t.dead).length; assert.equal(live, 1);
    p.ctx.window.nrLocalizeTimes(p.document);
    assert.equal(p.timers.filter((t) => !t.dead).length, 1, 'the old timer was cancelled, not stacked');
  });
});
