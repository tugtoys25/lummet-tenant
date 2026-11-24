// ============================================================
// en/worker/newsroom-media.js -- video embeds, podcast feed and photo galleries (additive, each off until switched on)
//
//   news_video_embeds   a paragraph holding only a YouTube link becomes a click-to-play player (nothing from YouTube
//                       loads until the reader presses play; the player uses youtube-nocookie.com) + VideoObject data
//   news_podcast        /en/podcast.xml: a podcast feed (Apple/Spotify-ready) of articles tagged "podcast" that carry an <audio> player
//   news_galleries      <div class="nr-gallery"> wrapped around images becomes a grid with a keyboard-friendly lightbox
//
// Article text is already sanitised before it gets here; everything this file adds is built from validated pieces
// (an 11-character video id, numbers, escaped text), never copied from the article.
// ============================================================

import { getOpsFlags } from './newsroom-ops.js';
import { xmlEscape } from './sitemap.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeId(url) {
  let u; try { u = new URL(String(url).trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/); id = m ? m[1] : null; }
  }
  return id && ID.test(id) ? id : null;
}

const LINK_PARA = /<p\b[^>]*>\s*(?:<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*)?(https?:\/\/[^\s<]+|[^<\s][^<]*?)?\s*(?:<\/a>)?\s*<\/p>/gi;

// Returns { html, videos: [ids], hasGallery }. Never throws; on any doubt the text is returned unchanged.
export function transformContent(html, { videos = false, galleries = false } = {}) {
  const out = { html: String(html || ''), videos: [], hasGallery: false };
  try {
    if (videos) {
      out.html = out.html.replace(LINK_PARA, (whole, href, text) => {
        const id = youtubeId(href || text || '');
        if (!id || (href && text && !/^https?:\/\//i.test(text.trim()) && text.trim().length > 80)) return whole;
        const plain = String(text || '').replace(/<[^>]*>/g, '').trim();
        if (!href && !/^https?:\/\//i.test(plain)) return whole;
        out.videos.push(id);
        return `<figure class="nr-video" data-yt="${id}"><button type="button" class="nr-video-play" aria-label="Play video">&#9654; Play video</button><noscript><a href="https://www.youtube.com/watch?v=${id}" rel="noopener">Watch on YouTube</a></noscript></figure>`;
      });
    }
    if (galleries && /class=["'][^"']*\bnr-gallery\b/i.test(out.html)) out.hasGallery = true;
  } catch (e) { console.error('media transform skipped:', e && e.message); return { html: String(html || ''), videos: [], hasGallery: false }; }
  return out;
}

const CSS = `<style>.nr-video{position:relative;margin:20px 0;aspect-ratio:16/9;background:#111;border-radius:10px;overflow:hidden}.nr-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}.nr-video-play{position:absolute;inset:0;width:100%;border:0;background:transparent;color:#fff;font-size:18px;cursor:pointer;font-family:inherit}.nr-video-play:focus-visible{outline:3px solid #fff;outline-offset:-6px}.nr-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin:20px 0}.nr-gallery img{width:100%;height:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;cursor:zoom-in}.nr-gallery figure{margin:0}.nr-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;z-index:9999}.nr-lightbox img{max-width:92vw;max-height:88vh;object-fit:contain}.nr-lightbox button{position:absolute;background:rgba(255,255,255,.15);color:#fff;border:0;border-radius:6px;padding:10px 14px;font-size:20px;cursor:pointer}.nr-lightbox .nr-lb-close{top:14px;right:14px}.nr-lightbox .nr-lb-prev{left:14px;top:50%}.nr-lightbox .nr-lb-next{right:14px;top:50%}</style>`;
export function mediaAfterHtml({ videos = [], hasGallery = false } = {}) {
  if (!videos.length && !hasGallery) return '';
  return `${CSS}<script src="/static/js/news-media.js" defer></script>`;
}

// VideoObject data for the article's structured data (Google needs name, thumbnail, upload date).
export function videoSchema(ids, { title, publishedIso }) {
  return ids.map((id) => ({
    '@type': 'VideoObject', name: title, description: title,
    thumbnailUrl: [`https://i.ytimg.com/vi/${id}/hqdefault.jpg`], uploadDate: publishedIso || undefined,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`, contentUrl: `https://www.youtube.com/watch?v=${id}`
  }));
}

// ── podcast ──────────────────────────────────────────────────
export const PODCAST_KEYS = ['podcast_title', 'podcast_description', 'podcast_author', 'podcast_email', 'podcast_image', 'podcast_tag', 'podcast_explicit'];

export async function getPodcastConfig(db) {
  const cfg = { podcast_tag: 'podcast', podcast_explicit: 'false' };
  try {
    const r = await db.prepare(`SELECT key, value FROM system_settings WHERE key IN (${PODCAST_KEYS.map(() => '?').join(',')})`).bind(...PODCAST_KEYS).all();
    for (const row of r.results || []) if (row.value !== null && row.value !== '') cfg[row.key] = String(row.value);
  } catch { /* defaults */ }
  return cfg;
}

export async function savePodcastConfig(db, input) {
  const clean = {
    podcast_title: String(input.podcast_title || '').trim().slice(0, 150), podcast_description: String(input.podcast_description || '').trim().slice(0, 1000),
    podcast_author: String(input.podcast_author || '').trim().slice(0, 120), podcast_email: String(input.podcast_email || '').trim().slice(0, 200),
    podcast_image: String(input.podcast_image || '').trim().slice(0, 500), podcast_tag: String(input.podcast_tag || 'podcast').trim().toLowerCase().slice(0, 60) || 'podcast',
    podcast_explicit: input.podcast_explicit === true || input.podcast_explicit === 'true' ? 'true' : 'false'
  };
  if (clean.podcast_email && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(clean.podcast_email)) return { ok: false, error: 'That email address does not look right' };
  if (clean.podcast_image && !/^https:\/\/\S+$/i.test(clean.podcast_image)) return { ok: false, error: 'The cover image must be a full https:// address' };
  for (const [k, v] of Object.entries(clean)) {
    await db.prepare(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).bind(k, v).run();
  }
  return { ok: true };
}

const AUDIO_MIME = { mp3: 'audio/mpeg', m4a: 'audio/x-m4a', aac: 'audio/aac', ogg: 'audio/ogg', wav: 'audio/wav', mp4: 'audio/mp4' };
export function firstAudio(html) {
  const m = String(html || '').match(/<(?:audio|source)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
  if (!m) return null;
  const src = decodeEntities(m[1]);
  if (!/^https:\/\//i.test(src) && !src.startsWith('/')) return null;
  const ext = (src.split('?')[0].split('.').pop() || '').toLowerCase();
  return { src, type: AUDIO_MIME[ext] || 'audio/mpeg' };
}
const decodeEntities = (s) => String(s).replace(/&amp;/g, '&');
const cdata = (s) => `<![CDATA[${String(s ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
const rfc822 = (v) => { const d = new Date(String(v || '').includes('T') ? v : String(v || '').replace(' ', 'T') + 'Z'); return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString(); };
const dur = (sec) => { const s = Math.max(0, Math.trunc(Number(sec) || 0)); return s ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : ''; };

export function buildPodcastXml({ origin, siteName, cfg, episodes }) {
  const abs = (u) => (/^https?:\/\//i.test(u) ? u : origin + (u.startsWith('/') ? '' : '/') + u);
  const title = cfg.podcast_title || `${siteName} podcast`;
  const desc = cfg.podcast_description || `Audio from ${siteName}.`;
  const items = episodes.map((e) => `<item><title>${xmlEscape(e.title)}</title><link>${xmlEscape(`${origin}/en/news/${encodeURIComponent(e.slug)}`)}</link><guid isPermaLink="true">${xmlEscape(`${origin}/en/news/${encodeURIComponent(e.slug)}`)}</guid><pubDate>${rfc822(e.published_at || e.created_at)}</pubDate><description>${cdata(e.summary)}</description><enclosure url="${xmlEscape(abs(e.audio.src))}" length="${Number(e.length) || 0}" type="${xmlEscape(e.audio.type)}"/>${dur(e.duration) ? `<itunes:duration>${dur(e.duration)}</itunes:duration>` : ''}<itunes:explicit>${cfg.podcast_explicit === 'true' ? 'true' : 'false'}</itunes:explicit></item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${xmlEscape(title)}</title>
<link>${xmlEscape(origin + '/en/news')}</link>
<description>${xmlEscape(desc)}</description>
<language>en</language>
<atom:link href="${xmlEscape(origin + '/en/podcast.xml')}" rel="self" type="application/rss+xml"/>
<itunes:author>${xmlEscape(cfg.podcast_author || siteName)}</itunes:author>
<itunes:explicit>${cfg.podcast_explicit === 'true' ? 'true' : 'false'}</itunes:explicit>
${cfg.podcast_email ? `<itunes:owner><itunes:name>${xmlEscape(cfg.podcast_author || siteName)}</itunes:name><itunes:email>${xmlEscape(cfg.podcast_email)}</itunes:email></itunes:owner>` : ''}
${cfg.podcast_image ? `<itunes:image href="${xmlEscape(cfg.podcast_image)}"/>` : ''}
${items}
</channel>
</rss>
`;
}

export async function handlePodcastFeed(request, env, { getSite } = {}) {
  const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  try {
    if (!(await getOpsFlags(env.DB)).news_podcast) return notFound();
    const cfg = await getPodcastConfig(env.DB);
    const tag = cfg.podcast_tag;
    const rows = (await env.DB.prepare(`SELECT id, slug, title, content, excerpt, tags, published_at, created_at FROM news
      WHERE published = 1 AND (published_at IS NULL OR datetime(published_at) <= datetime('now')) AND tags IS NOT NULL AND lower(tags) LIKE ?
      ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT 100`).bind(`%${tag}%`).all()).results || [];
    const wanted = rows.filter((r) => String(r.tags).toLowerCase().split(',').map((t) => t.trim()).includes(tag));
    const access = await limitedSet(env.DB, wanted.map((r) => r.id));
    const episodes = [];
    for (const r of wanted) {
      if (access.has(r.id)) continue;                              // members-only audio never goes into a public feed
      const audio = firstAudio(r.content); if (!audio) continue;
      let length = 0, duration = 0;
      try { const m = await env.DB.prepare(`SELECT size, duration FROM media_library WHERE url = ? LIMIT 1`).bind(audio.src).first(); if (m) { length = m.size || 0; duration = m.duration || 0; } } catch { /* optional */ }
      episodes.push({ ...r, audio, length, duration, summary: String(r.excerpt || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || String(r.content).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280) });
    }
    const site = getSite ? await getSite(request, env) : null;
    const origin = site?.origin || new URL(request.url).origin;
    const xml = buildPodcastXml({ origin, siteName: site?.siteName || new URL(origin).host, cfg, episodes });
    return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=900', 'X-Content-Type-Options': 'nosniff' } });
  } catch (e) {
    console.error('podcast feed failed:', e && e.message);
    return new Response('Feed unavailable', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' } });
  }
}

async function limitedSet(db, ids) {
  try { const { limitedIds } = await import('./newsroom-membership.js'); return await limitedIds(db, ids); } catch { return new Set(); }
}

export async function mediaStatus(db) {
  return { flags: await getOpsFlags(db), podcast: await getPodcastConfig(db) };
}
