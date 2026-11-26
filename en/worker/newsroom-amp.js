// worker/newsroom-amp.js -- AMP version of a news article (switch news_amp, off by default).
// The story text is rebuilt from a strict allow-list: only plain text tags survive, every attribute is dropped except the few
// AMP allows, and images become <amp-img>. Anything AMP forbids (scripts, styles, iframes, forms, event handlers) is removed,
// so the page cannot fail validation because of what an editor pasted. Embeds and widgets are simply left out.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEEP = new Set(['p', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'strong', 'b', 'em', 'i', 'u', 'a', 'br', 'hr', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'pre', 'code', 'span', 'div', 'sup', 'sub', 'img']);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|form|noscript|template|svg|math|video|audio|canvas|select|textarea|button)\b[\s\S]*?<\/\1\s*>/gi;
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')); return m ? (m[2] ?? m[3] ?? m[4] ?? '') : ''; };
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const safeUrl = (u, allowRelative = true) => { const v = decode(u).trim(); if (/^https:\/\//i.test(v) || /^mailto:/i.test(v)) return v; if (allowRelative && /^\/(?!\/)/.test(v)) return v; return ''; };
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 10000 ? Math.round(n) : d; };

export function sanitizeForAmp(html) {
  let s = String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(DROP_WITH_CONTENT, ' ');
  return s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (tag, nameRaw) => {
    const name = nameRaw.toLowerCase(), closing = tag.startsWith('</');
    if (!KEEP.has(name)) return '';
    if (name === 'br' || name === 'hr') return closing ? '' : `<${name}>`;
    if (name === 'img') {
      if (closing) return '';
      const src = safeUrl(attr(tag, 'src'));
      if (!src || src.startsWith('mailto:')) return '';
      return `<amp-img src="${esc(src)}" alt="${esc(decode(attr(tag, 'alt')))}" width="${num(attr(tag, 'width'), 1200)}" height="${num(attr(tag, 'height'), 675)}" layout="responsive"></amp-img>`;
    }
    if (closing) return `</${name}>`;
    if (name === 'a') {
      const href = safeUrl(attr(tag, 'href'));
      return href ? `<a href="${esc(href)}" rel="noopener">` : '<a>';
    }
    return `<${name}>`;
  });
}

const CSS = 'body{margin:0;font:18px/1.65 Georgia,serif;color:#0f172a;background:#fff}header.site{padding:12px 16px;border-bottom:1px solid #e2e8f0;font:700 16px system-ui,sans-serif}header.site a{color:#0f172a;text-decoration:none}main{max-width:720px;margin:0 auto;padding:16px}h1{font:800 30px/1.2 system-ui,sans-serif;margin:8px 0 12px}.meta{font:14px system-ui,sans-serif;color:#64748b;margin-bottom:16px}.ex{font:20px/1.5 system-ui,sans-serif;color:#334155;margin:0 0 16px}a{color:#2563eb}blockquote{margin:16px 0;padding:0 16px;border-left:4px solid #cbd5e1;color:#334155}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:6px}pre{overflow:auto;background:#f1f5f9;padding:12px}figure{margin:16px 0}figcaption{font:13px system-ui,sans-serif;color:#64748b}footer{padding:16px;text-align:center;font:14px system-ui,sans-serif}';
const BOILERPLATE = '<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>';

// article: { title, slug, excerpt, content, published_at, featured_image_url, featured_image_alt, author_name }
export function renderAmpPage({ article, canonical, siteName = '', siteUrl = '/' }) {
  const body = sanitizeForAmp(article.content);
  const when = article.published_at ? new Date(String(article.published_at).replace(' ', 'T') + (/[zZ]$/.test(article.published_at) ? '' : 'Z')) : null;
  const iso = when && !Number.isNaN(when.getTime()) ? when.toISOString() : null;
  const img = safeUrl(article.featured_image_url || '');
  const ld = { '@context': 'https://schema.org', '@type': 'NewsArticle', mainEntityOfPage: canonical, headline: String(article.title || '').slice(0, 110), ...(iso ? { datePublished: iso } : {}), ...(img ? { image: [img] } : {}), ...(article.author_name ? { author: { '@type': 'Person', name: article.author_name } } : {}) };
  return `<!doctype html>
<html amp lang="en"><head><meta charset="utf-8"><title>${esc(article.title)}${siteName ? ' | ' + esc(siteName) : ''}</title>
<link rel="canonical" href="${esc(canonical)}"><meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
${article.excerpt ? `<meta name="description" content="${esc(String(article.excerpt).slice(0, 300))}">` : ''}
<script async src="https://cdn.ampproject.org/v0.js"></script>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
${BOILERPLATE}<style amp-custom>${CSS}</style></head>
<body><header class="site"><a href="${esc(siteUrl)}">${esc(siteName || 'Home')}</a></header>
<main><h1>${esc(article.title)}</h1>
<div class="meta">${article.author_name ? `By ${esc(article.author_name)}` : ''}${iso ? `${article.author_name ? ' · ' : ''}<time datetime="${iso}">${iso.slice(0, 10)}</time>` : ''}</div>
${article.excerpt ? `<p class="ex">${esc(article.excerpt)}</p>` : ''}
${img ? `<figure><amp-img src="${esc(img)}" alt="${esc(article.featured_image_alt || article.title || '')}" width="1200" height="675" layout="responsive"></amp-img></figure>` : ''}
<article>${body}</article></main>
<footer><a href="${esc(canonical)}">Read the full page</a></footer></body></html>`;
}
