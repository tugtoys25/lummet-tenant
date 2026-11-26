// worker/url-layout.js -- choose where the public site lives: /en/ (default), the root, or a custom prefix.
//
// The whole codebase keeps working on ONE internal shape, /en/<page>. This file is a thin layer at the front door:
//   inbound  public address  -> internal /en/ address   (so routing, caching and every controller are unchanged)
//   outbound internal links  -> public address          (HTML, sitemap, robots, redirects)
// Dashboard, API and every route that already exists outside /en/ (robots.txt, /media, /static ...) are never moved.
// Default layout "en" does nothing at all: the request and the response pass through untouched.
//
// Settings (table `settings`): url_layout = en | root | custom, url_custom_prefix, url_page_overrides, url_legacy_redirect.
// url_page_overrides: one rule per line, "<page> = root|en|custom", e.g. "/about = root". A rule covers that page and
// everything below it; the longest rule wins.
import { getRoute } from './routes.js';

export const LAYOUTS = ['en', 'root', 'custom'];
const WHERE = ['root', 'en', 'custom'];
export const DEFAULT_LAYOUT = { layout: 'en', prefix: '', overrides: [], legacy: true };
// Names that can never be a custom prefix (they are real paths of this platform).
const RESERVED_PREFIX = new Set(['en', 'static', 'media', 'api', 'admin', 'dashboard', 'login', 'logout', 'robots.txt', 'sitemap.xml', 'favicon.ico', 'assets']);

export const cleanPrefix = (v) => String(v ?? '').trim().replace(/^\/+|\/+$/g, '').toLowerCase();
export const validPrefix = (v) => { const p = cleanPrefix(v); return /^[a-z0-9][a-z0-9-]{0,23}$/.test(p) && !RESERVED_PREFIX.has(p); };

export function parseOverrides(text) {
  const out = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*\/?([A-Za-z0-9/_-]*)\s*[=:>]\s*(root|en|custom)\s*$/i.exec(raw);
    if (!m) continue;
    const page = '/' + m[1].toLowerCase().replace(/^\/+|\/+$/g, '');
    out.push({ page: page === '/' ? '' : page, where: m[2].toLowerCase() });
    if (out.length >= 200) break;
  }
  return out.sort((a, b) => b.page.length - a.page.length);
}

// Build a layout object from raw stored values. Anything odd falls back to the default (never throws).
export function buildLayout(raw = {}) {
  const layout = LAYOUTS.includes(raw.url_layout) ? raw.url_layout : 'en';
  const prefix = cleanPrefix(raw.url_custom_prefix);
  const safe = layout === 'custom' && !validPrefix(prefix) ? 'en' : layout;
  return { layout: safe, prefix: validPrefix(prefix) ? prefix : '', overrides: parseOverrides(raw.url_page_overrides), legacy: raw.url_legacy_redirect !== '0' };
}
export const isDefault = (L) => !L || (L.layout === 'en' && !L.overrides.length);

// Public prefix ('' | '/en' | '/xx') for an internal page path such as /en/news/story.
export function prefixFor(L, canonical) {
  const rest = canonical.replace(/^\/en(?=\/|$)/, '') || '';
  let where = L.layout;
  for (const o of L.overrides) {
    if (rest === o.page || rest.startsWith(o.page + '/') || o.page === '') { where = o.where; break; }
  }
  if (where === 'root') return '';
  if (where === 'custom') return L.prefix ? '/' + L.prefix : '/en';
  return '/en';
}

// Pages the layout may move. Dashboard and API machinery always stay on /en/.
export function isMovable(canonical) {
  if (!/^\/en(\/|$)/.test(canonical)) return false;
  const rest = canonical.slice(3);
  if (/^\/(api|admin|dashboard)(\/|$)/.test(rest)) return false;
  return true;
}

const fakeReq = (path) => new Request('https://x.invalid' + path);
const taken = (path) => { try { const r = getRoute(fakeReq(path)); return !!r && r.type !== 'not_found' && !(r.type === 'redirect' && path === '/'); } catch { return false; } };

// public path -> internal path, or null when the address is not one of ours to translate.
export function toInternal(L, path) {
  if (isDefault(L)) return null;
  if (path === '/en' || path.startsWith('/en/')) return null; // already internal
  if (path === '/' || path === '') return prefixFor(L, '/en') === '' ? '/en' : null;
  if (RESERVED_PREFIX.has(path.split('/')[1]) || taken(path)) return null; // a route that exists today wins (robots.txt, /media, /static ...)
  // custom prefix
  const kinds = new Set(['', L.prefix ? '/' + L.prefix : null].filter((x) => x !== null));
  for (const pre of kinds) {
    if (pre && (path === pre || path.startsWith(pre + '/'))) {
      const rest = path.slice(pre.length) || '';
      const c = '/en' + rest;
      if (isMovable(c) && prefixFor(L, c) === pre) return c;
    }
  }
  const c = '/en' + path;
  if (isMovable(c) && prefixFor(L, c) === '') return c;
  return null;
}

// internal path -> public path (unchanged when the page is not movable or stays on /en/).
export function toPublic(L, canonical) {
  if (isDefault(L) || !isMovable(canonical)) return canonical;
  const pre = prefixFor(L, canonical);
  if (pre === '/en') return canonical;
  const rest = canonical.replace(/^\/en/, '');
  return (pre + rest) || '/';
}

// Rewrite every /en/... address inside HTML/XML/text. Only absolute-path or same-origin addresses are touched.
export function rewriteBody(L, text, origin) {
  if (isDefault(L)) return text;
  const o = origin ? origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
  const re = new RegExp(`(["'(=\\s>]|^)(${o ? `(?:${o})?` : ''})(/en(?:/[^"'\\s<>)?#\\\\]*)?)(?=["'\\s<>)?#\\\\]|$)`, 'g');
  return text.replace(re, (m, lead, org, path) => lead + (org || '') + toPublic(L, path));
}

export function rewriteLocation(L, loc, origin) {
  if (isDefault(L) || !loc) return loc;
  try {
    const u = new URL(loc, origin);
    if (u.origin !== origin) return loc;
    const p = toPublic(L, u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : u.pathname);
    return /^https?:/i.test(loc) ? origin + p + u.search + u.hash : p + u.search + u.hash;
  } catch { return loc; }
}

// Absolute or relative address -> the same address with the page path in its public form (query and hash kept).
export function publicUrl(L, href) {
  if (isDefault(L) || !href) return href;
  try {
    const abs = /^https?:\/\//i.test(href);
    const u = new URL(href, 'https://x.invalid');
    const p = u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : u.pathname;
    const pub = toPublic(L, p);
    if (pub === p) return href;
    const tail = u.search + u.hash;
    return abs ? u.origin + pub + tail : pub + tail;
  } catch { return href; }
}

// ---- stored layout (cached 30 s per isolate; failing closed to the default) ----
const KEYS = ['url_layout', 'url_custom_prefix', 'url_page_overrides', 'url_legacy_redirect'];
const memo = new WeakMap();
export function forgetLayout(db) { memo.delete(db); }
export async function getLayout(env, now = Date.now()) {
  const db = env && env.DB; if (!db) return DEFAULT_LAYOUT;
  const hit = memo.get(db); if (hit && now - hit.at < 30000) return hit.value;
  let value = DEFAULT_LAYOUT;
  try {
    const rows = (await db.prepare(`SELECT key, value FROM settings WHERE key IN (${KEYS.map(() => '?').join(',')})`).bind(...KEYS).all()).results || [];
    const raw = {}; for (const r of rows) raw[r.key] = r.value;
    value = buildLayout(raw);
  } catch { value = DEFAULT_LAYOUT; }
  memo.set(db, { at: now, value });
  return value;
}

const TEXTY = /^(text\/(html|plain|xml)|application\/(xml|xhtml\+xml|rss\+xml|atom\+xml|ld\+json|manifest\+json))/i;

// Wrap the whole app. Default layout: returns inner(request) untouched, no body read.
export async function withUrlLayout(request, env, inner) {
  const L = await getLayout(env);
  if (isDefault(L)) return inner(request);
  const url = new URL(request.url);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  const origin = url.origin;
  const get = request.method === 'GET' || request.method === 'HEAD';

  // Old /en/ address of a page that moved: send readers (and search engines) to the new one. Pages only, never API calls.
  if (get && L.legacy && isMovable(path) && (request.headers.get('accept') || '').includes('text/html')) {
    const pub = toPublic(L, path);
    if (pub !== path) return Response.redirect(origin + pub + url.search, 301);
  }

  let req = request;
  const internal = toInternal(L, path);
  if (internal) { const u = new URL(request.url); u.pathname = internal; req = new Request(u.toString(), request); }

  const res = await inner(req);
  const loc = res.headers.get('location');
  const type = res.headers.get('content-type') || '';
  const isText = TEXTY.test(type) && !/x-asset|image|font/.test(type);
  if (!loc && !isText) return res;

  const headers = new Headers(res.headers);
  if (loc) headers.set('location', rewriteLocation(L, loc, origin));
  if (!isText || request.method === 'HEAD' || !res.body) return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  const body = rewriteBody(L, await res.text(), origin);
  headers.delete('content-length'); headers.delete('etag');
  return new Response(body, { status: res.status, statusText: res.statusText, headers });
}
