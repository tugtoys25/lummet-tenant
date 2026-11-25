// ============================================================
// en/worker/newsroom-commerce.js -- news as a portal AND a hybrid affiliate / listing / blog page (additive, every switch off by default)
//
//   news_commerce              master switch. Off: no query, no markup, the article page is byte-for-byte what it was.
//   news_commerce_widgets      buy / product / price / cta / inquiry widgets: after the first paragraph, after the last, and in columns below
//   news_commerce_sticky_bar   mobile sticky "Buy now" (or "Enquire") bar, same look as the casino sticky button
//   news_commerce_gallery      photo gallery from the media library, shown with the existing lightbox
//   news_commerce_inquiry      inquiry form widgets for for-sale / non-affiliate content (stored in news_inquiries)
//
// A second gate sits on every article: news_commerce.mode. 'editorial' (the default for every article) never changes.
// Modes: review (affiliate disclosure + buy widgets), listing (inquiry + gallery + specs), blog (widgets, disclosure only when sponsored).
//
// Money links always go through /en/go/<tracking code> so clicks, GEO rules, health checks and conversions keep working.
// The click also carries ?n=<article id>&w=<widget id>, which the redirect records, so you can see clicks per article and per widget.
//
// Everything public fails soft: any problem means "no extras", never a broken article.
// ============================================================

import { linkExists } from './newsroom-links.js';   // (links.js imports the flag reader from here; both only call each other inside functions)

const KEYS = ['news_commerce', 'news_commerce_widgets', 'news_commerce_sticky_bar', 'news_commerce_gallery', 'news_commerce_inquiry'];
export const COMMERCE_FLAG_KEYS = KEYS;
export const MODES = ['editorial', 'review', 'listing', 'blog'];
export const SLOTS = ['top', 'bottom', 'below', 'sticky'];
export const WIDGET_TYPES = ['buy', 'product', 'price', 'inquiry', 'cta'];
const LINKED_TYPES = new Set(['buy', 'product', 'cta']);   // these send readers to an outside shop, so they must be tracked
const MAX_WIDGETS = 12;
const MAX_GALLERY = 40;
const DEFAULT_DISCLOSURE = 'This article contains affiliate links. If you buy through them we may earn a commission, at no extra cost to you.';

const memo = new WeakMap();
const TTL = 30000;

export async function getCommerceFlags(db, now = Date.now()) {
  const hit = memo.get(db);
  if (hit && now - hit.at < TTL) return hit.flags;
  const flags = Object.fromEntries(KEYS.map((k) => [k, false]));
  try {
    const r = await db.prepare(`SELECT key, value FROM system_settings WHERE key IN (${KEYS.map(() => '?').join(',')})`).bind(...KEYS).all();
    for (const row of r.results || []) flags[row.key] = String(row.value).toLowerCase() === 'true';
  } catch (e) { console.error('commerce flags read failed (all off):', e && e.message); }
  memo.set(db, { at: now, flags });
  return flags;
}
export function forgetCommerceFlags(db) { memo.delete(db); }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, n);

// Only https addresses or site-relative paths are ever used for pictures.
export function safeUrl(u) {
  const s = String(u ?? '').trim();
  if (!s || s.length > 2048) return '';
  if (/^\/(?!\/)/.test(s)) return s;
  try { const x = new URL(s); return x.protocol === 'https:' && !x.username && !x.password ? x.toString() : ''; } catch { return ''; }
}

const CODE = /^[A-Za-z0-9_-]{1,64}$/;

// ── Loading ──────────────────────────────────────────────────
/**
 * Everything the page needs for one article, or null when nothing should change.
 * Cost when the master switch is off: one cached flag read and nothing else.
 */
export async function loadCommerce(db, article) {
  try {
    const flags = await getCommerceFlags(db);
    if (!flags.news_commerce || !article || !article.id) return null;
    const cfg = await db.prepare(`SELECT news_id, mode, cta_label, disclosure_text, sticky_enabled FROM news_commerce WHERE news_id = ?`).bind(article.id).first();
    if (!cfg || cfg.mode === 'editorial' || !MODES.includes(cfg.mode)) return null;

    let widgets = [];
    if (flags.news_commerce_widgets) {
      const r = await db.prepare(`
        SELECT w.id, w.slot, w.widget_type, w.position, w.title, w.subtitle, w.badge, w.price_text, w.cta_label, w.image_url,
               w.tracking_link_id, w.go_code, w.settings_json,
               t.tracking_code AS link_code, t.status AS link_status, t.health_status AS link_health, nl.status AS nl_status
          FROM news_widgets w LEFT JOIN tracking_links t ON t.id = w.tracking_link_id LEFT JOIN news_affiliate_links nl ON nl.code = w.go_code
         WHERE w.news_id = ? AND w.status = 'active'
           AND (w.starts_at IS NULL OR datetime(w.starts_at) <= datetime('now'))
           AND (w.ends_at IS NULL OR datetime(w.ends_at) > datetime('now'))
         ORDER BY w.position ASC, w.id ASC LIMIT ${MAX_WIDGETS}`).bind(article.id).all();
      widgets = r.results || [];
    }
    let gallery = [];
    if (flags.news_commerce_gallery) {
      const r = await db.prepare(`
        SELECT g.media_id, g.caption, m.url, m.thumbnail_url, m.alt_text, m.width, m.height
          FROM news_gallery_items g JOIN media_library m ON m.id = g.media_id
         WHERE g.news_id = ? ORDER BY g.position ASC, g.id ASC LIMIT ${MAX_GALLERY}`).bind(article.id).all();
      gallery = r.results || [];
    }
    return { flags, cfg, widgets, gallery };
  } catch (e) {
    console.error('commerce load skipped:', e && e.message);
    return null;
  }
}

// ── Rendering ────────────────────────────────────────────────
function parseSpecs(settingsJson) {
  try {
    const o = JSON.parse(settingsJson || '{}');
    return (Array.isArray(o.specs) ? o.specs : []).slice(0, 8)
      .map((s) => ({ label: clip(s && s.label, 40), value: clip(s && s.value, 80) })).filter((s) => s.label && s.value);
  } catch { return []; }
}

/** The /en/go address for a widget, or '' when it has no usable, healthy link (the widget is then left out). */
export function goUrl(w, article) {
  if (w.go_code && w.nl_status && w.nl_status !== 'active') return '';   // a paused newsroom link hides its button instead of showing a dead address
  const code = w.go_code && CODE.test(w.go_code) ? w.go_code
    : (w.link_code && w.link_status === 'active' && w.link_health !== 'broken' ? w.link_code : '');
  if (!code) return '';
  const q = new URLSearchParams({ n: String(article.id), w: String(w.id), utm_source: 'news', utm_medium: 'widget', utm_campaign: String(article.slug || '').slice(0, 60), utm_content: w.slot });
  return `/en/go/${encodeURIComponent(code)}?${q.toString()}`;
}

function widgetHtml(w, ctx) {
  const { article, cfg, flags } = ctx;
  const type = w.widget_type;
  const title = esc(w.title || '');
  const sub = w.subtitle ? `<p class="nc-sub">${esc(w.subtitle)}</p>` : '';
  const badge = w.badge ? `<span class="nc-badge">${esc(w.badge)}</span>` : '';
  const price = w.price_text ? `<span class="nc-price">${esc(w.price_text)}</span>` : '';
  const img = safeUrl(w.image_url);
  const imgHtml = img ? `<img class="nc-img" src="${esc(img)}" alt="${title}" loading="lazy" decoding="async">` : '';
  const specs = parseSpecs(w.settings_json);
  const specsHtml = specs.length ? `<dl class="nc-specs">${specs.map((s) => `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join('')}</dl>` : '';
  const head = `data-nc-widget="${w.id}" data-nc-slot="${esc(w.slot)}"`;

  if (type === 'inquiry') {
    if (!flags.news_commerce_inquiry) return '';
    const label = esc(w.cta_label || cfg.cta_label || 'Send enquiry');
    return `<aside class="nc-widget nc-inquiry-box" id="nc-inquiry-${w.id}" ${head} aria-label="${title || 'Enquiry'}">`
      + `<div class="nc-body">${badge}<strong class="nc-title">${title || 'Enquire about this listing'}</strong>${sub}${price}${specsHtml}</div>`
      + `<form class="nc-inquiry" data-slug="${esc(article.slug)}" data-widget="${w.id}" novalidate>`
      + `<input name="name" type="text" placeholder="Your name" autocomplete="name" maxlength="60" required>`
      + `<input name="email" type="email" placeholder="Email" autocomplete="email" maxlength="200" required>`
      + `<input name="phone" type="tel" placeholder="Phone (optional)" autocomplete="tel" maxlength="40">`
      + `<textarea name="message" rows="3" placeholder="Your message" maxlength="2000" required></textarea>`
      + `<input name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;height:0;width:0;opacity:0">`
      + `<label class="nc-consent"><input name="consent" type="checkbox"> I agree that my details may be used to answer this enquiry.</label>`
      + `<button type="submit" class="btn btn--primary nc-btn">${label}</button><p class="nc-msg" role="status" aria-live="polite"></p></form></aside>`;
  }

  const href = goUrl(w, article);
  if (LINKED_TYPES.has(type) && !href) return '';   // no healthy tracked link: show nothing rather than a dead button
  const label = esc(w.cta_label || cfg.cta_label || (type === 'cta' ? 'Learn more' : 'Buy now'));
  const btn = href ? `<a class="btn btn--primary nc-btn" href="${esc(href)}" rel="sponsored nofollow noopener" target="_blank">${label}</a>` : '';
  return `<aside class="nc-widget nc-${esc(type)}" ${head} aria-label="${title || 'Offer'}">${imgHtml}`
    + `<div class="nc-body">${badge}<strong class="nc-title">${title}</strong>${sub}${price}${specsHtml}</div>${btn}</aside>`;
}

const CSS = `<style>.nc-widget{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:22px 0;padding:16px;border:1px solid var(--light-gray,#ddd);border-radius:12px;background:var(--white,#fff);color:var(--dark,#111)}.nc-img{width:96px;height:96px;object-fit:cover;border-radius:8px;flex:0 0 auto}.nc-body{flex:1 1 220px;min-width:0}.nc-title{display:block;font-size:17px;line-height:1.3}.nc-sub{margin:4px 0 0;color:var(--gray,#666);font-size:14px}.nc-price{display:inline-block;margin-top:6px;font-weight:700}.nc-badge{display:inline-block;margin-bottom:6px;padding:2px 8px;border-radius:999px;background:var(--bg,#f2f2f2);border:1px solid var(--light-gray,#ddd);font-size:12px;font-weight:600}.nc-btn{flex:0 0 auto;text-align:center}.nc-specs{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px 14px;margin:10px 0 0;font-size:13px}.nc-specs dt{color:var(--gray,#666)}.nc-specs dd{margin:0;font-weight:600}.nc-disclosure{margin:16px 0 0;padding:10px 12px;border-left:3px solid var(--light-gray,#ccc);font-size:13px;color:var(--gray,#666)}.nc-below{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin:30px 0}.nc-below .nc-widget{margin:0;flex-direction:column;align-items:stretch}.nc-below .nc-img{width:100%;height:160px}.nc-inquiry{display:grid;gap:8px;width:100%;margin-top:12px}.nc-inquiry input,.nc-inquiry textarea{width:100%;padding:10px;border:1px solid var(--light-gray,#ccc);border-radius:8px;font:inherit}.nc-consent{display:flex;gap:8px;align-items:flex-start;font-size:13px}.nc-consent input{width:auto;margin-top:3px}.nc-msg{margin:0;font-size:14px;min-height:1em}.nc-gallery-wrap{margin:30px 0}.nc-gallery-wrap h2{font-size:22px;margin:0 0 12px}@media(max-width:768px){.nc-widget{padding:12px}.nc-btn{width:100%}.nc-img{width:72px;height:72px}.news-detail.nc-has-sticky{padding-bottom:84px}}.nc-sticky .mobile-cta-info{min-width:0}.nc-sticky .nc-sticky-price{display:block;font-size:12px;color:var(--gray,#666)}.nc-sticky.nc-hide{display:none!important}</style>`;

const SCRIPT = `<script>(function(){try{document.querySelectorAll('form.nc-inquiry').forEach(function(f){f.addEventListener('submit',function(e){e.preventDefault();var E=f.elements,b=f.querySelector('button[type=submit]'),m=f.querySelector('.nc-msg');b.disabled=true;var d={slug:f.getAttribute('data-slug'),widget_id:+f.getAttribute('data-widget'),name:E.name.value,email:E.email.value,phone:E.phone.value,message:E.message.value,consent:E.consent.checked,website:E.website.value};fetch('/en/api/v1/news/inquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(function(r){return r.json().catch(function(){return{}})}).then(function(j){m.textContent=j.success?'Thank you. We will contact you soon.':(j.error||'Something went wrong. Please try again.');if(j.success)f.reset();b.disabled=false}).catch(function(){m.textContent='Network error. Please try again.';b.disabled=false})})});var s=document.getElementById('ncSticky');if(s&&'IntersectionObserver' in window){var seen=new Set(),w=document.querySelectorAll('.nc-widget[data-nc-slot=top],.nc-widget[data-nc-slot=bottom],.nc-widget[data-nc-slot=below]');if(w.length){var io=new IntersectionObserver(function(es){es.forEach(function(en){en.isIntersecting?seen.add(en.target):seen.delete(en.target)});s.classList.toggle('nc-hide',seen.size>0)});w.forEach(function(x){io.observe(x)})}}}catch(e){}})();</script>`;

/** Puts `top` after the first paragraph and `bottom` after the last one. Without paragraphs: top first, bottom last. */
export function injectInline(html, top, bottom) {
  let out = String(html || '');
  if (!top && !bottom) return out;
  const closeTag = /<\/p>/gi;
  const ends = [];
  let m; while ((m = closeTag.exec(out)) !== null) ends.push(m.index + m[0].length);
  if (!ends.length) return `${top || ''}${out}${bottom || ''}`;
  const lastAt = ends[ends.length - 1];
  if (bottom) out = out.slice(0, lastAt) + bottom + out.slice(lastAt);   // last first, so the first offset stays valid
  if (top) out = out.slice(0, ends[0]) + top + out.slice(ends[0]);
  return out;
}

/**
 * Builds every piece the article page adds. Pure: no I/O.
 *   content(html)  -> the article text with placeholder paragraphs where the top/bottom widgets go
 *   fill(page)     -> the finished page with each placeholder replaced by its widget (trusted HTML)
 *   afterHtml      -> below-content widgets, gallery, sticky bar, style and script (goes in the trusted after-article slot)
 *   hasGallery     -> true when the lightbox assets are needed
 */
export function buildCommerceBlocks(data, { article }) {
  const { flags, cfg, widgets, gallery } = data;
  const ctx = { article, cfg, flags };
  const rendered = widgets.map((w) => ({ w, html: widgetHtml(w, ctx) })).filter((r) => r.html);
  const by = (slot) => rendered.filter((r) => r.w.slot === slot).map((r) => r.html).join('');

  const affiliate = rendered.some((r) => LINKED_TYPES.has(r.w.widget_type));
  const sponsored = ['sponsored', 'commercial'].includes(String(article.content_class || ''));
  let disclosure = '';
  if (rendered.length && (affiliate || sponsored || cfg.disclosure_text)) {
    disclosure = `<p class="nc-disclosure">${esc(cfg.disclosure_text || DEFAULT_DISCLOSURE)}</p>`;
  }
  const top = by('top');
  const bottom = by('bottom');
  const below = by('below');

  // Sticky bar: an explicit 'sticky' widget wins; otherwise the first top/bottom buy-type widget (or the first inquiry widget for listings).
  let sticky = '';
  if (flags.news_commerce_sticky_bar && cfg.sticky_enabled) {
    const pick = rendered.find((r) => r.w.slot === 'sticky' && r.w.widget_type !== 'inquiry')
      || rendered.find((r) => r.w.slot !== 'sticky' && r.w.widget_type !== 'inquiry' && LINKED_TYPES.has(r.w.widget_type));
    const inq = rendered.find((r) => r.w.widget_type === 'inquiry');
    const target = pick || (cfg.mode === 'listing' ? inq : null);
    if (target) {
      const w = target.w;
      const isInq = w.widget_type === 'inquiry';
      const href = isInq ? `#nc-inquiry-${w.id}` : goUrl(w, article);
      const label = esc(w.cta_label || cfg.cta_label || (isInq ? 'Enquire' : 'Buy now'));
      const attrs = isInq ? '' : ' rel="sponsored nofollow noopener" target="_blank"';
      if (href) {
        sticky = `<div class="mobile-sticky-cta nc-sticky" id="ncSticky"><div class="mobile-cta-info"><span class="mobile-cta-title">${esc(w.title || article.title || '')}</span>${w.price_text ? `<span class="nc-sticky-price">${esc(w.price_text)}</span>` : ''}</div><a href="${esc(href)}" class="btn btn--primary mobile-cta-btn"${attrs}>${label}</a></div>`;
      }
    }
  }

  let galleryHtml = '';
  if (gallery.length) {
    const figs = gallery.map((g) => {
      const src = safeUrl(g.url); if (!src) return '';
      const alt = esc(g.alt_text || g.caption || article.title || '');
      return `<figure><img src="${esc(src)}" alt="${alt}" loading="lazy" decoding="async"${g.width ? ` width="${Number(g.width)}"` : ''}${g.height ? ` height="${Number(g.height)}"` : ''}>${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}</figure>`;
    }).join('');
    if (figs) galleryHtml = `<section class="nc-gallery-wrap" aria-label="Photos"><h2>Photos</h2><div class="nr-gallery">${figs}</div></section>`;
  }

  const hasInquiry = rendered.some((r) => r.w.widget_type === 'inquiry');
  const afterParts = [];
  if (galleryHtml) afterParts.push(galleryHtml);
  if (below) afterParts.push(`<section class="nc-below" aria-label="Related offers">${below}</section>`);
  if (sticky) afterParts.push(sticky);
  const anything = rendered.length || galleryHtml;
  const afterHtml = anything ? `${CSS}${afterParts.join('')}${hasInquiry || sticky ? SCRIPT : ''}` : '';

  // The article text is sanitised when the template is filled in (that strips <aside>, <form> and the like), so widgets cannot travel inside it.
  // Instead a plain-text placeholder paragraph marks each spot, and fill() swaps it for the trusted widget HTML once the page is rendered.
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
  const marks = { top: top ? { tok: `NCSLOT${nonce}TOP`, html: `${disclosure}${top}` } : null, bottom: bottom ? { tok: `NCSLOT${nonce}BOT`, html: bottom } : null };
  const marker = (m) => (m ? `<p>${m.tok}</p>` : '');
  return {
    content: (html) => injectInline(html, marker(marks.top), marker(marks.bottom)),
    fill: (page) => {
      let out = String(page);
      for (const m of [marks.top, marks.bottom]) {
        if (!m) continue;
        const at = `<p>${m.tok}</p>`;
        if (out.includes(at)) out = out.split(at).join(m.html);
        else console.error('commerce placeholder missing from the rendered page; widget skipped');
      }
      return out;
    },
    afterHtml,
    hasGallery: !!galleryHtml,
    hasSticky: !!sticky,
    count: rendered.length
  };
}

// ── Inquiry form (public) ────────────────────────────────────
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

async function hashIp(ip) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`inquiry|${ip || 'anon'}`));
  return Array.from(new Uint8Array(buf).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function submitInquiry(env, { body, ip, country = null }) {
  const db = env.DB;
  const flags = await getCommerceFlags(db);
  if (!flags.news_commerce || !flags.news_commerce_inquiry) return { ok: false, status: 404, error: 'Not found' };
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'Invalid request' };
  if (clip(body.website, 200)) return { ok: true, status: 200 };   // hidden field: bots fill it, and learn nothing
  const name = clip(body.name, 60), email = clip(body.email, 200).toLowerCase(), phone = clip(body.phone, 40), message = clip(body.message, 2001);
  if (!name) return { ok: false, status: 400, error: 'Please enter your name' };
  if (!EMAIL.test(email)) return { ok: false, status: 400, error: 'That email address does not look right' };
  if (message.length < 5) return { ok: false, status: 400, error: 'Please write a short message' };
  if (message.length > 2000) return { ok: false, status: 400, error: 'Messages can be up to 2000 characters' };
  if (body.consent !== true) return { ok: false, status: 400, error: 'Please tick the box so we may use your details to reply' };
  const art = await db.prepare(`SELECT n.id FROM news n WHERE n.slug = ? AND n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))`).bind(String(body.slug || '')).first();
  if (!art) return { ok: false, status: 404, error: 'Article not found' };
  const widget = await db.prepare(`SELECT w.id FROM news_widgets w JOIN news_commerce c ON c.news_id = w.news_id WHERE w.id = ? AND w.news_id = ? AND w.widget_type = 'inquiry' AND w.status = 'active' AND c.mode <> 'editorial'`).bind(Number(body.widget_id) || 0, art.id).first();
  if (!widget) return { ok: false, status: 404, error: 'This enquiry form is not available' };
  const ipHash = await hashIp(ip);
  const hourly = await db.prepare(`SELECT COUNT(*) AS c FROM news_inquiries WHERE ip_hash = ? AND created_at >= datetime('now','-1 hour')`).bind(ipHash).first();
  if ((hourly?.c || 0) >= 5) return { ok: false, status: 429, error: 'Too many messages. Please try again later.' };
  const dupe = await db.prepare(`SELECT 1 AS x FROM news_inquiries WHERE news_id = ? AND email = ? AND message = ? AND created_at >= datetime('now','-1 day')`).bind(art.id, email, message).first();
  if (dupe) return { ok: true, status: 200 };
  await db.prepare(`INSERT INTO news_inquiries (news_id, widget_id, name, email, phone, message, consent, country, ip_hash) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .bind(art.id, widget.id, name, email, phone || null, message, country ? String(country).slice(0, 2) : null, ipHash).run();
  return { ok: true, status: 200 };
}

// ── Admin: read / save one article's commerce setup ──────────
export async function getAdminBundle(db, newsId) {
  const cfg = await db.prepare(`SELECT mode, cta_label, disclosure_text, sticky_enabled FROM news_commerce WHERE news_id = ?`).bind(newsId).first();
  const widgets = (await db.prepare(`SELECT id, slot, widget_type, position, title, subtitle, badge, price_text, cta_label, image_url, tracking_link_id, go_code, settings_json, status, starts_at, ends_at FROM news_widgets WHERE news_id = ? ORDER BY position ASC, id ASC`).bind(newsId).all()).results || [];
  const gallery = (await db.prepare(`SELECT g.media_id, g.caption, m.url, m.thumbnail_url, m.alt_text FROM news_gallery_items g JOIN media_library m ON m.id = g.media_id WHERE g.news_id = ? ORDER BY g.position ASC, g.id ASC`).bind(newsId).all()).results || [];
  return {
    config: cfg ? { ...cfg, sticky_enabled: !!cfg.sticky_enabled } : { mode: 'editorial', cta_label: '', disclosure_text: '', sticky_enabled: true },
    widgets: widgets.map((w) => ({ ...w, specs: parseSpecs(w.settings_json) })),
    gallery
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

/** Validates the whole submission first, then replaces the article's widgets and gallery. Nothing is written on any error. */
export async function saveAdminBundle(db, newsId, input, { userId = null } = {}) {
  const b = input && typeof input === 'object' ? input : {};
  const cfgIn = b.config && typeof b.config === 'object' ? b.config : {};
  const mode = String(cfgIn.mode || 'editorial');
  if (!MODES.includes(mode)) return { ok: false, error: 'Unknown mode' };
  const widgetsIn = Array.isArray(b.widgets) ? b.widgets : [];
  const galleryIn = Array.isArray(b.gallery) ? b.gallery : [];
  if (widgetsIn.length > MAX_WIDGETS) return { ok: false, error: `At most ${MAX_WIDGETS} widgets per article` };
  if (galleryIn.length > MAX_GALLERY) return { ok: false, error: `At most ${MAX_GALLERY} gallery photos per article` };

  const widgets = [];
  for (let i = 0; i < widgetsIn.length; i++) {
    const w = widgetsIn[i] || {}; const n = `Widget ${i + 1}`;
    if (!SLOTS.includes(w.slot)) return { ok: false, error: `${n}: unknown position` };
    if (!WIDGET_TYPES.includes(w.widget_type)) return { ok: false, error: `${n}: unknown type` };
    if (w.slot === 'sticky' && w.widget_type === 'inquiry') return { ok: false, error: `${n}: an inquiry form cannot be the sticky widget` };
    const goCode = clip(w.go_code, 64);
    if (goCode && !CODE.test(goCode)) return { ok: false, error: `${n}: the /go code may use letters, numbers, - and _ only` };
    let linkId = w.tracking_link_id === null || w.tracking_link_id === undefined || w.tracking_link_id === '' ? null : Number(w.tracking_link_id);
    if (linkId !== null) {
      if (!Number.isInteger(linkId) || linkId <= 0) return { ok: false, error: `${n}: invalid tracking link` };
      const t = await db.prepare(`SELECT id FROM tracking_links WHERE id = ?`).bind(linkId).first();
      if (!t) return { ok: false, error: `${n}: that tracking link does not exist` };
    }
    if (LINKED_TYPES.has(w.widget_type) && linkId === null && !goCode) return { ok: false, error: `${n}: a buy / product / button widget needs an affiliate link` };
    if (goCode && !(await linkExists(db, goCode))) return { ok: false, error: `${n}: there is no affiliate link with the code "${goCode}". Create it under Affiliate links first.` };
    const image = clip(w.image_url, 2048);
    if (image && !safeUrl(image)) return { ok: false, error: `${n}: the picture must be an https address or a site path` };
    for (const k of ['starts_at', 'ends_at']) if (w[k] && !DATE.test(String(w[k]))) return { ok: false, error: `${n}: ${k} must look like 2026-12-31 or 2026-12-31 18:00` };
    const specs = (Array.isArray(w.specs) ? w.specs : []).slice(0, 8).map((s) => ({ label: clip(s && s.label, 40), value: clip(s && s.value, 80) })).filter((s) => s.label && s.value);
    widgets.push({
      slot: w.slot, type: w.widget_type, position: Number.isFinite(Number(w.position)) ? Math.trunc(Number(w.position)) : i,
      title: clip(w.title, 120), subtitle: clip(w.subtitle, 200), badge: clip(w.badge, 30), price: clip(w.price_text, 40), cta: clip(w.cta_label, 30),
      image: image || null, linkId, goCode: goCode || null, settings: specs.length ? JSON.stringify({ specs }) : null,
      status: w.status === 'paused' ? 'paused' : 'active', starts: w.starts_at ? String(w.starts_at) : null, ends: w.ends_at ? String(w.ends_at) : null
    });
  }
  const gallery = [];
  const seen = new Set();
  for (const g of galleryIn) {
    const id = Number(g && g.media_id);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    const m = await db.prepare(`SELECT id, type, mime_type FROM media_library WHERE id = ?`).bind(id).first();
    if (!m) return { ok: false, error: `Media item ${id} does not exist` };
    if ((m.type && m.type !== 'image') || (m.mime_type && !String(m.mime_type).startsWith('image/'))) return { ok: false, error: `Media item ${id} is not an image` };
    seen.add(id); gallery.push({ id, caption: clip(g.caption, 200) || null });
  }

  const stmts = [
    db.prepare(`INSERT INTO news_commerce (news_id, mode, cta_label, disclosure_text, sticky_enabled, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(news_id) DO UPDATE SET mode = excluded.mode, cta_label = excluded.cta_label, disclosure_text = excluded.disclosure_text, sticky_enabled = excluded.sticky_enabled, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`)
      .bind(newsId, mode, clip(cfgIn.cta_label, 30) || null, clip(cfgIn.disclosure_text, 400) || null, cfgIn.sticky_enabled === false ? 0 : 1, userId),
    db.prepare(`DELETE FROM news_widgets WHERE news_id = ?`).bind(newsId),
    db.prepare(`DELETE FROM news_gallery_items WHERE news_id = ?`).bind(newsId),
    ...widgets.map((w) => db.prepare(`INSERT INTO news_widgets (news_id, slot, widget_type, position, title, subtitle, badge, price_text, cta_label, image_url, tracking_link_id, go_code, settings_json, status, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(newsId, w.slot, w.type, w.position, w.title || null, w.subtitle || null, w.badge || null, w.price || null, w.cta || null, w.image, w.linkId, w.goCode, w.settings, w.status, w.starts, w.ends)),
    ...gallery.map((g, i) => db.prepare(`INSERT INTO news_gallery_items (news_id, media_id, position, caption) VALUES (?, ?, ?, ?)`).bind(newsId, g.id, i, g.caption))
  ];
  if (typeof db.batch === 'function') await db.batch(stmts); else for (const s of stmts) await s.run();
  return { ok: true, widgets: widgets.length, gallery: gallery.length };
}

// ── Admin: pickers and the inquiry inbox ─────────────────────
export async function listTrackingLinkChoices(db, search = '') {
  const q = `%${String(search || '').replace(/[%_]/g, '').slice(0, 60)}%`;
  return (await db.prepare(`SELECT id, internal_name, tracking_code, status, health_status FROM tracking_links WHERE (internal_name LIKE ? OR tracking_code LIKE ?) ORDER BY status = 'active' DESC, id DESC LIMIT 100`).bind(q, q).all()).results || [];
}
export async function listImageChoices(db, search = '') {
  const q = `%${String(search || '').replace(/[%_]/g, '').slice(0, 60)}%`;
  return (await db.prepare(`SELECT id, url, thumbnail_url, alt_text, filename FROM media_library WHERE (type IS NULL OR type = 'image') AND (filename LIKE ? OR alt_text LIKE ?) ORDER BY id DESC LIMIT 60`).bind(q, q).all()).results || [];
}
export const INQUIRY_STATUSES = ['new', 'read', 'replied', 'spam'];
export async function listInquiries(db, { status = '', limit = 50 } = {}) {
  const where = INQUIRY_STATUSES.includes(status) ? `WHERE i.status = '${status}'` : '';
  return (await db.prepare(`SELECT i.id, i.news_id, n.title AS article_title, n.slug AS article_slug, i.name, i.email, i.phone, i.message, i.status, i.country, i.created_at FROM news_inquiries i LEFT JOIN news n ON n.id = i.news_id ${where} ORDER BY i.id DESC LIMIT ${Math.min(Math.max(Number(limit) || 50, 1), 200)}`).all()).results || [];
}
export async function setInquiryStatus(db, id, status) {
  if (!INQUIRY_STATUSES.includes(status)) return { ok: false, error: 'Unknown status' };
  const r = await db.prepare(`UPDATE news_inquiries SET status = ? WHERE id = ?`).bind(status, Number(id) || 0).run();
  return r && r.meta && r.meta.changes === 0 ? { ok: false, error: 'Inquiry not found', status: 404 } : { ok: true };
}
