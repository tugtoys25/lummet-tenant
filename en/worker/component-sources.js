// Data sources for the visual component editor and for the grid/table components.
//
// One registry describes every kind of content an admin can pick in Dashboard > Components:
//   - search()   what the picker shows while an admin types (published items only)
//   - resolve()  the live card model for items that were picked (published items only)
//   - latest()   the newest items of a source, for "automatic" grids
//
// A picked item is stored as { source, key }. The key is a slug (never a database id, which
// can change), so a deleted or unpublished item simply stops showing and nothing breaks.
//   research: "type/slug"        custom type: "typeSlug/slug"        media: the media id

import { REVIEW_WITH_TYPE_SQL, reviewPublicUrl } from "./review-urls.js";

const CARD_LIMIT = 48;

export const SOURCE_KEYS = [
  "casino",
  "news",
  "research",
  "author",
  "update",
  "sportsbook",
  "affiliate_partner",
  "custom",
  "media"
];

// Link-only sources (used by the "pick a page" link chooser)
export const LINK_SOURCE_KEYS = [...SOURCE_KEYS.filter((k) => k !== "media"), "review", "page"];

export const SOURCE_LABELS = {
  casino: "Casinos",
  news: "News",
  research: "Research",
  author: "Authors",
  update: "Platform updates",
  sportsbook: "Sportsbooks",
  affiliate_partner: "Affiliate partners",
  custom: "Custom content",
  media: "Pictures (Media)",
  review: "Reviews",
  page: "Pages"
};

const SLUG = /^[a-z0-9][a-z0-9_-]{0,119}$/i;

function like(q) {
  return `%${String(q || "").trim().toLowerCase().replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}

function clampLimit(n, max = CARD_LIMIT, def = 12) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 1) return def;
  return Math.min(max, v);
}

function str(v, max = 300) {
  return String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function plain(v, max = 200) {
  // an excerpt may contain markup; cards show plain text
  return str(String(v ?? "").replace(/<[^>]*>/g, " "), max);
}

function validKey(source, key) {
  const k = String(key ?? "");
  if (source === "media") return /^\d{1,12}$/.test(k);
  if (source === "research" || source === "custom") {
    const parts = k.split("/");
    return parts.length === 2 && parts.every((p) => SLUG.test(p));
  }
  return SLUG.test(k);
}

async function all(db, sql, ...binds) {
  const r = await db.prepare(sql).bind(...binds).all();
  return r.results || [];
}

const placeholders = (n) => Array.from({ length: n }, () => "?").join(",");

const RESEARCH_TYPES = ["report", "country", "regulator", "topic", "development", "legislation", "licence"];
export const RESEARCH_TYPE_LIST = RESEARCH_TYPES;

function cap(s) {
  const t = String(s || "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------------------
// Row -> card model
// ---------------------------------------------------------------------------
// { source, key, title, excerpt, image, url, rating, bonus, badge, date, cta_url, sponsored }

function casinoModel(r) {
  return {
    source: "casino",
    key: r.slug,
    title: str(r.name, 120),
    excerpt: "",
    image: r.logo || "",
    url: `/en/casino/${r.slug}`,
    rating: Number(r.rating) || 0,
    bonus: str([r.bonus_title, r.bonus_value].filter(Boolean).join(" "), 120),
    badge: "",
    date: "",
    cta_url: `/en/go/${r.slug}`,
    sponsored: true,
    license: str(r.license, 80)
  };
}

function newsModel(r) {
  return {
    source: "news", key: r.slug, title: str(r.title, 160), excerpt: plain(r.excerpt, 200),
    image: r.featured_image_url || r.featured_image_thumbnail || "", url: `/en/news/${r.slug}`,
    rating: 0, bonus: "", badge: "", date: r.published_at || r.created_at || "", cta_url: "", sponsored: false
  };
}

function researchModel(r) {
  return {
    source: "research", key: `${r.type}/${r.slug}`, title: str(r.title, 160), excerpt: plain(r.excerpt || r.subtitle, 200),
    image: r.og_image_url || "", url: `/en/research/${r.type}/${r.slug}`,
    rating: 0, bonus: "", badge: cap(r.type), date: r.published_at || r.updated_at || "", cta_url: "", sponsored: false
  };
}

function authorModel(r) {
  return {
    source: "author", key: r.slug, title: str(r.name, 120), excerpt: plain(r.bio, 200),
    image: r.avatar_url || "", url: `/en/author/${r.slug}`,
    rating: 0, bonus: "", badge: cap(String(r.role || "").replace(/_/g, " ")), date: "", cta_url: "", sponsored: false
  };
}

function updateModel(r) {
  return {
    source: "update", key: r.slug, title: str(r.title, 160), excerpt: plain(r.excerpt, 200),
    image: r.featured_image_url || r.featured_image_thumbnail || "", url: `/en/updates/${r.slug}`,
    rating: 0, bonus: "", badge: "", date: r.published_at || r.created_at || "", cta_url: "", sponsored: false
  };
}

function contentItemModel(r) {
  const custom = r.content_type === "custom";
  const source = custom ? "custom" : r.content_type;
  const base = custom ? `/en/custom/${r.custom_type_slug}` : r.content_type === "sportsbook" ? "/en/sportsbook" : "/en/affiliate-partner";
  return {
    source,
    key: custom ? `${r.custom_type_slug}/${r.slug}` : r.slug,
    title: str(r.name || r.title, 120),
    excerpt: plain(r.excerpt || r.description, 200),
    image: r.logo_url || r.featured_url || "",
    url: `${base}/${r.slug}`,
    rating: Number(r.rating) || 0,
    bonus: "",
    badge: "",
    date: "",
    cta_url: "",
    sponsored: false,
    license: str(r.license, 80)
  };
}

function mediaModel(r) {
  return {
    source: "media", key: String(r.id), title: str(r.alt_text || r.filename, 120), excerpt: "",
    image: r.url || "", url: r.url || "", rating: 0, bonus: "", badge: "", date: "", cta_url: "", sponsored: false
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const NEWS_SQL = `
  SELECT n.*, m.url AS featured_image_url, m.thumbnail_url AS featured_image_thumbnail
  FROM news n
  LEFT JOIN media_library m ON m.id = n.featured_image
  WHERE n.published = 1
    AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))`;

const UPDATE_SQL = `
  SELECT pu.*, m.url AS featured_image_url, m.thumbnail_url AS featured_image_thumbnail
  FROM platform_updates pu
  LEFT JOIN media_library m ON m.id = pu.featured_image
  WHERE pu.published = 1`;

const ITEM_SQL = `
  SELECT ci.*, lm.url AS logo_url, fm.url AS featured_url
  FROM content_items ci
  LEFT JOIN media_library lm ON lm.id = ci.logo_media_id
  LEFT JOIN media_library fm ON fm.id = ci.featured_image_media_id
  WHERE ci.published = 1 AND ci.status = 'published'`;

/** items of one content_items type; custom is narrowed by its type slug */
function itemWhere(source, customType) {
  if (source === "custom") return { sql: " AND ci.content_type = 'custom' AND ci.custom_type_slug = ?", binds: [customType] };
  return { sql: " AND ci.content_type = ?", binds: [source] };
}

const FETCHERS = {
  casino: {
    async search(db, q, limit) {
      const rows = await all(db, `SELECT * FROM casinos WHERE published = 1 AND status = 'published'
        AND (LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(slug) LIKE ? ESCAPE '\\') ORDER BY name ASC LIMIT ?`, like(q), like(q), limit);
      return rows.map(casinoModel);
    },
    async resolve(db, keys) {
      if (!keys.length) return [];
      const rows = await all(db, `SELECT * FROM casinos WHERE published = 1 AND status = 'published' AND slug IN (${placeholders(keys.length)})`, ...keys);
      return rows.map(casinoModel);
    },
    async latest(db, { limit, sort }) {
      const order = sort === "rating" ? "rating DESC, name ASC" : sort === "name" ? "name ASC" : "featured DESC, sort_order ASC, rating DESC";
      const rows = await all(db, `SELECT * FROM casinos WHERE published = 1 AND status = 'published' ORDER BY ${order} LIMIT ?`, limit);
      return rows.map(casinoModel);
    }
  },
  news: {
    async search(db, q, limit) {
      const rows = await all(db, `${NEWS_SQL} AND (LOWER(n.title) LIKE ? ESCAPE '\\' OR LOWER(n.slug) LIKE ? ESCAPE '\\')
        ORDER BY COALESCE(n.published_at, n.created_at) DESC LIMIT ?`, like(q), like(q), limit);
      return rows.map(newsModel);
    },
    async resolve(db, keys) {
      if (!keys.length) return [];
      return (await all(db, `${NEWS_SQL} AND n.slug IN (${placeholders(keys.length)})`, ...keys)).map(newsModel);
    },
    async latest(db, { limit }) {
      return (await all(db, `${NEWS_SQL} ORDER BY COALESCE(n.published_at, n.created_at) DESC, n.id DESC LIMIT ?`, limit)).map(newsModel);
    }
  },
  research: {
    async search(db, q, limit) {
      const rows = await all(db, `SELECT r.* FROM research_items r WHERE r.published = 1 AND r.status != 'draft'
        AND (LOWER(r.title) LIKE ? ESCAPE '\\' OR LOWER(r.slug) LIKE ? ESCAPE '\\') ORDER BY r.updated_at DESC LIMIT ?`, like(q), like(q), limit);
      return rows.map(researchModel);
    },
    async resolve(db, keys) {
      if (!keys.length) return [];
      const out = [];
      // few keys per component; one small query per distinct type keeps the SQL simple and safe
      const byType = new Map();
      for (const k of keys) { const [t, s] = k.split("/"); if (!byType.has(t)) byType.set(t, []); byType.get(t).push(s); }
      for (const [type, slugs] of byType) {
        const rows = await all(db, `SELECT r.* FROM research_items r WHERE r.published = 1 AND r.status != 'draft' AND r.type = ? AND r.slug IN (${placeholders(slugs.length)})`, type, ...slugs);
        out.push(...rows.map(researchModel));
      }
      return out;
    },
    async latest(db, { limit, type }) {
      if (type && RESEARCH_TYPES.includes(type)) {
        return (await all(db, `SELECT r.* FROM research_items r WHERE r.published = 1 AND r.status != 'draft' AND r.type = ? ORDER BY r.published_at DESC, r.updated_at DESC LIMIT ?`, type, limit)).map(researchModel);
      }
      return (await all(db, `SELECT r.* FROM research_items r WHERE r.published = 1 AND r.status != 'draft' ORDER BY r.published_at DESC, r.updated_at DESC LIMIT ?`, limit)).map(researchModel);
    }
  },
  author: {
    async search(db, q, limit) {
      return (await all(db, `SELECT * FROM authors WHERE published = 1 AND (LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(slug) LIKE ? ESCAPE '\\') ORDER BY name ASC LIMIT ?`, like(q), like(q), limit)).map(authorModel);
    },
    async resolve(db, keys) {
      if (!keys.length) return [];
      return (await all(db, `SELECT * FROM authors WHERE published = 1 AND slug IN (${placeholders(keys.length)})`, ...keys)).map(authorModel);
    },
    async latest(db, { limit }) {
      return (await all(db, `SELECT * FROM authors WHERE published = 1 ORDER BY name ASC LIMIT ?`, limit)).map(authorModel);
    }
  },
  update: {
    async search(db, q, limit) {
      return (await all(db, `${UPDATE_SQL} AND (LOWER(pu.title) LIKE ? ESCAPE '\\' OR LOWER(pu.slug) LIKE ? ESCAPE '\\') ORDER BY COALESCE(pu.published_at, pu.created_at) DESC LIMIT ?`, like(q), like(q), limit)).map(updateModel);
    },
    async resolve(db, keys) {
      if (!keys.length) return [];
      return (await all(db, `${UPDATE_SQL} AND pu.slug IN (${placeholders(keys.length)})`, ...keys)).map(updateModel);
    },
    async latest(db, { limit }) {
      return (await all(db, `${UPDATE_SQL} ORDER BY COALESCE(pu.published_at, pu.created_at) DESC LIMIT ?`, limit)).map(updateModel);
    }
  },
  media: {
    async search(db, q, limit) {
      return (await all(db, `SELECT * FROM media_library WHERE (mime_type LIKE 'image/%') AND (LOWER(filename) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(alt_text,'')) LIKE ? ESCAPE '\\') ORDER BY created_at DESC LIMIT ?`, like(q), like(q), limit)).map(mediaModel);
    },
    async resolve(db, keys) {
      if (!keys.length) return [];
      const ids = keys.map(Number);
      return (await all(db, `SELECT * FROM media_library WHERE id IN (${placeholders(ids.length)}) AND mime_type LIKE 'image/%'`, ...ids)).map(mediaModel);
    },
    async latest(db, { limit }) {
      return (await all(db, `SELECT * FROM media_library WHERE mime_type LIKE 'image/%' ORDER BY created_at DESC LIMIT ?`, limit)).map(mediaModel);
    }
  }
};

for (const source of ["sportsbook", "affiliate_partner", "custom"]) {
  FETCHERS[source] = {
    async search(db, q, limit, opts = {}) {
      const w = itemWhere(source, opts.customType);
      return (await all(db, `${ITEM_SQL}${w.sql} AND (LOWER(ci.name) LIKE ? ESCAPE '\\' OR LOWER(ci.slug) LIKE ? ESCAPE '\\') ORDER BY ci.name ASC LIMIT ?`, ...w.binds, like(q), like(q), limit)).map(contentItemModel);
    },
    async resolve(db, keys) {
      if (!keys.length) return [];
      if (source !== "custom") {
        return (await all(db, `${ITEM_SQL} AND ci.content_type = ? AND ci.slug IN (${placeholders(keys.length)})`, source, ...keys)).map(contentItemModel);
      }
      const out = [];
      const byType = new Map();
      for (const k of keys) { const [t, s] = k.split("/"); if (!byType.has(t)) byType.set(t, []); byType.get(t).push(s); }
      for (const [type, slugs] of byType) {
        out.push(...(await all(db, `${ITEM_SQL} AND ci.content_type = 'custom' AND ci.custom_type_slug = ? AND ci.slug IN (${placeholders(slugs.length)})`, type, ...slugs)).map(contentItemModel));
      }
      return out;
    },
    async latest(db, { limit, type }) {
      const w = itemWhere(source, type);
      if (source === "custom" && !type) return [];
      return (await all(db, `${ITEM_SQL}${w.sql} ORDER BY ci.featured DESC, ci.sort_order ASC, ci.name ASC LIMIT ?`, ...w.binds, limit)).map(contentItemModel);
    }
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isSource(source) {
  return Object.prototype.hasOwnProperty.call(FETCHERS, source);
}

/** Admin picker: published items of one source matching a search (an empty search lists the newest). */
export async function searchSource(db, source, { q = "", limit = 20, customType = "" } = {}) {
  if (!isSource(source)) return [];
  const n = clampLimit(limit, 50, 20);
  const type = String(customType || "");
  if (source === "custom" && !SLUG.test(type)) return [];
  return FETCHERS[source].search(db, String(q || "").slice(0, 80), n, { customType: type });
}

/** Link picker: pages of the site that can be linked to, as { title, url, kind } */
export async function searchLinks(db, source, { q = "", limit = 20, customType = "" } = {}) {
  const n = clampLimit(limit, 50, 20);
  const needle = String(q || "").slice(0, 80);
  if (source === "page") {
    const rows = await all(db, `SELECT slug, title FROM pages WHERE published = 1 AND (LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(slug) LIKE ? ESCAPE '\\') ORDER BY title ASC LIMIT ?`, like(needle), like(needle), n);
    return rows.map((r) => ({ title: str(r.title, 120), url: `/en/${r.slug}`, kind: "page" }));
  }
  if (source === "review") {
    const rows = await all(db, `${REVIEW_WITH_TYPE_SQL} WHERE r.published = 1 AND (LOWER(r.title) LIKE ? ESCAPE '\\' OR LOWER(r.slug) LIKE ? ESCAPE '\\') ORDER BY r.title ASC LIMIT ?`, like(needle), like(needle), n);
    return rows.map((r) => ({ title: str(r.title, 120), url: reviewPublicUrl(r), kind: "review" })).filter((r) => r.url);
  }
  if (source === "media") return [];
  const items = await searchSource(db, source, { q: needle, limit: n, customType });
  return items.map((i) => ({ title: i.title, url: i.url, kind: source }));
}

/**
 * The card models for picked items, in the order they were picked.
 * `picks` is [{ source, key }]. Items that are gone or unpublished are left out.
 */
export async function resolvePicks(db, picks) {
  const wanted = [];
  const bySource = new Map();
  for (const p of Array.isArray(picks) ? picks : []) {
    if (!p || !isSource(p.source) || !validKey(p.source, p.key)) continue;
    wanted.push({ source: p.source, key: String(p.key), label: p.label });
    if (!bySource.has(p.source)) bySource.set(p.source, new Set());
    bySource.get(p.source).add(String(p.key));
  }
  const found = new Map();
  await Promise.all(
    [...bySource].map(async ([source, keys]) => {
      let rows = [];
      try { rows = await FETCHERS[source].resolve(db, [...keys]); } catch (err) { console.error("component pick failed:", source, err); }
      for (const row of rows) found.set(`${source}:${row.key}`, row);
    })
  );
  const out = [];
  for (const w of wanted) {
    const m = found.get(`${w.source}:${w.key}`);
    if (!m) continue;
    out.push(w.label ? { ...m, title: str(w.label, 160) } : m);
  }
  return out;
}

/** The newest items of a source, for a grid that fills itself. */
export async function latestItems(db, source, { limit = 6, sort = "newest", type = "" } = {}) {
  if (!isSource(source)) return [];
  const n = clampLimit(limit, CARD_LIMIT, 6);
  const t = String(type || "");
  if ((source === "custom" || source === "research") && t && !SLUG.test(t)) return [];
  try {
    return await FETCHERS[source].latest(db, { limit: n, sort, type: t });
  } catch (err) {
    console.error("component latest failed:", source, err);
    return [];
  }
}

export { validKey as isValidKey, CARD_LIMIT };
