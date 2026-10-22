// Site-wide public search: one query, every kind of published content, grouped.
//
// Each group has its own small query, run in parallel; a group that fails (for example a
// table a site has not migrated yet) is skipped and never breaks the others.
// Only published content is returned. Titles that start with the words typed come first.

import { searchSource } from "./component-sources.js";
import { REVIEW_WITH_TYPE_SQL, reviewPublicUrl } from "./review-urls.js";

export const SEARCH_GROUPS = [
  { key: "casino", label: "Casinos" },
  { key: "review", label: "Reviews" },
  { key: "research", label: "Research" },
  { key: "news", label: "News" },
  { key: "update", label: "Platform updates" },
  { key: "sportsbook", label: "Sportsbooks" },
  { key: "affiliate_partner", label: "Affiliate partners" },
  { key: "author", label: "Authors" },
  { key: "page", label: "Pages" }
];

export const MIN_QUERY = 2;

function clean(v, max = 160) {
  return String(v ?? "").replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function like(q) {
  return `%${q.toLowerCase().replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}

function rank(items, q) {
  const needle = q.toLowerCase();
  const score = (i) => {
    const t = String(i.title || "").toLowerCase();
    if (t === needle) return 0;
    if (t.startsWith(needle)) return 1;
    if (t.split(/\s+/).some((w) => w.startsWith(needle))) return 2;
    return 3;
  };
  return items.map((i, n) => ({ i, n, s: score(i) })).sort((a, b) => a.s - b.s || a.n - b.n).map((x) => x.i);
}

async function rows(db, sql, ...binds) {
  const r = await db.prepare(sql).bind(...binds).all();
  return r.results || [];
}

const FINDERS = {
  async casino(db, q, n) {
    const found = await rows(db, `SELECT slug, name, logo, rating, license FROM casinos
      WHERE published = 1 AND status = 'published'
        AND (LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(slug) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(license,'')) LIKE ? ESCAPE '\\')
      ORDER BY featured DESC, rating DESC LIMIT ?`, like(q), like(q), like(q), n * 3);
    return found.map((r) => ({
      title: clean(r.name, 120), url: `/en/casino/${r.slug}`, image: r.logo || "",
      meta: Number(r.rating) ? `Rating ${Number(r.rating).toFixed(1)}` : clean(r.license, 60)
    }));
  },
  async review(db, q, n) {
    const found = await rows(db, `${REVIEW_WITH_TYPE_SQL}
      WHERE r.published = 1 AND (LOWER(r.title) LIKE ? ESCAPE '\\' OR LOWER(r.slug) LIKE ? ESCAPE '\\')
      ORDER BY r.title ASC LIMIT ?`, like(q), like(q), n * 3);
    return found.map((r) => ({ r, url: reviewPublicUrl(r) })).filter((x) => x.url)
      .map(({ r, url }) => ({ title: clean(r.title, 140), url, image: "", meta: "" }));
  },
  async research(db, q, n) {
    const found = await rows(db, `SELECT type, slug, title, excerpt FROM research_items
      WHERE published = 1 AND status != 'draft'
        AND (LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(slug) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(excerpt,'')) LIKE ? ESCAPE '\\')
      ORDER BY published_at DESC LIMIT ?`, like(q), like(q), like(q), n * 3);
    return found.map((r) => ({
      title: clean(r.title, 160), url: `/en/research/${r.type}/${r.slug}`, image: "",
      meta: r.type ? r.type.charAt(0).toUpperCase() + r.type.slice(1) : ""
    }));
  },
  async news(db, q, n) {
    const found = await rows(db, `SELECT slug, title, excerpt, published_at FROM news
      WHERE published = 1 AND (published_at IS NULL OR datetime(published_at) <= datetime('now'))
        AND (LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(slug) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(excerpt,'')) LIKE ? ESCAPE '\\')
      ORDER BY COALESCE(published_at, created_at) DESC LIMIT ?`, like(q), like(q), like(q), n * 3);
    return found.map((r) => ({ title: clean(r.title, 160), url: `/en/news/${r.slug}`, image: "", meta: clean(r.published_at, 10) }));
  },
  async update(db, q, n) {
    const found = await rows(db, `SELECT slug, title, published_at FROM platform_updates
      WHERE published = 1 AND (LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(slug) LIKE ? ESCAPE '\\')
      ORDER BY COALESCE(published_at, created_at) DESC LIMIT ?`, like(q), like(q), n * 3);
    return found.map((r) => ({ title: clean(r.title, 160), url: `/en/updates/${r.slug}`, image: "", meta: clean(r.published_at, 10) }));
  },
  async sportsbook(db, q, n) {
    return (await searchSource(db, "sportsbook", { q, limit: n * 3 })).map((i) => ({ title: i.title, url: i.url, image: i.image, meta: "" }));
  },
  async affiliate_partner(db, q, n) {
    return (await searchSource(db, "affiliate_partner", { q, limit: n * 3 })).map((i) => ({ title: i.title, url: i.url, image: i.image, meta: "" }));
  },
  async author(db, q, n) {
    return (await searchSource(db, "author", { q, limit: n * 3 })).map((i) => ({ title: i.title, url: i.url, image: i.image, meta: i.badge }));
  },
  async page(db, q, n) {
    const found = await rows(db, `SELECT slug, title FROM pages
      WHERE published = 1 AND (LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(slug) LIKE ? ESCAPE '\\')
      ORDER BY title ASC LIMIT ?`, like(q), like(q), n * 3);
    return found.map((r) => ({ title: clean(r.title, 140), url: `/en/${r.slug}`, image: "", meta: "" }));
  }
};

/**
 * Search everything published.
 * @returns {{ query, total, groups: [{ key, label, count, items: [{ title, url, image, meta }] }] }}
 */
export async function searchSite(db, rawQuery, { perGroup = 5 } = {}) {
  const query = clean(rawQuery, 80);
  if (query.length < MIN_QUERY) return { query, total: 0, groups: [] };
  const n = Math.max(1, Math.min(50, Math.round(Number(perGroup)) || 5));

  const results = await Promise.all(SEARCH_GROUPS.map(async (g) => {
    try {
      const found = rank(await FINDERS[g.key](db, query, n), query);
      return { key: g.key, label: g.label, count: found.length, items: found.slice(0, n) };
    } catch (err) {
      console.error("site search group failed:", g.key, err && err.message);
      return { key: g.key, label: g.label, count: 0, items: [] };
    }
  }));

  const groups = results.filter((g) => g.items.length);
  return { query, total: groups.reduce((s, g) => s + g.items.length, 0), groups };
}
