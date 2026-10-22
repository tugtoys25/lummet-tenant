// =====================================================
// LUMMET AI -- chat quality digest (admins only, on demand, no AI model involved)
//
// Reads the thumbs people gave the public chat (table ai_feedback) and answers: is it getting better or worse, in
// which countries, for which reasons, and which TOPICS keep getting thumbs-down -- and for the top topics, whether
// the site has any content on them at all (the same lookup the chat uses). Topics are found by counting meaningful
// words across thumbs-down questions; there is no model call and nothing is stored.
// =====================================================

import { retrieve } from "./retrieval.js";

const STOP = new Set(("the and for are but not you your yours with this that these those from have has had was were been being can could would should will " +
  "what which who whom whose when where why how does did doing done about into onto over under than then them they their there here also just very more most some any all " +
  "tell show give list find help please want need know say said like get got let make made best top good great new one two three casino casinos site website " +
  "online play playing player players game games bet betting kenya").split(/\s+/));

const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const daysAgo = (n) => fmt(new Date(Date.now() - n * 86400000));

export function topicWords(question) {
  const words = String(question || "").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  return [...new Set(words.filter((w) => !STOP.has(w) && !/^\d+$/.test(w)))];
}

/** Greedy grouping: take the most common word, group the questions that contain it, remove them, repeat. */
export function groupTopics(questions, { max = 8 } = {}) {
  let pool = questions.map((q) => ({ q, words: topicWords(q.question) })).filter((x) => x.words.length);
  const out = [];
  while (pool.length && out.length < max) {
    const counts = new Map();
    for (const x of pool) for (const w of x.words) counts.set(w, (counts.get(w) || 0) + 1);
    const [word, n] = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    const hit = pool.filter((x) => x.words.includes(word));
    out.push({ topic: word, count: hit.length, ids: hit.slice(0, 50).map((x) => x.q.id), examples: hit.slice(0, 3).map((x) => ({ id: x.q.id, question: String(x.q.question).slice(0, 200) })) });
    pool = pool.filter((x) => !x.words.includes(word));
    if (n < 1) break;
  }
  return out;
}

const pct = (up, down) => (up + down ? Math.round((up * 100) / (up + down)) : null);

export async function chatQualityDigest(env, request, { checkCoverage = true, coverageLimit = 5, retrieveFn = retrieve } = {}) {
  const db = env.DB;
  try {
    const wk = async (from, to) => {
      const r = await db.prepare(`SELECT rating, COUNT(*) AS n FROM ai_feedback WHERE created_at >= ? AND created_at < ? GROUP BY rating`).bind(from, to).all();
      const c = { up: 0, down: 0 };
      for (const x of r.results || []) c[x.rating] = x.n;
      return { ...c, helpful_pct: pct(c.up, c.down) };
    };
    const now = fmt(new Date(Date.now() + 1000)), d7 = daysAgo(7), d14 = daysAgo(14), d28 = daysAgo(28);
    const [thisWeek, lastWeek] = await Promise.all([wk(d7, now), wk(d14, d7)]);
    const trend = thisWeek.helpful_pct === null || lastWeek.helpful_pct === null ? null : thisWeek.helpful_pct - lastWeek.helpful_pct;

    const byCountry = (await db.prepare(`SELECT country, SUM(rating = 'up') AS up, SUM(rating = 'down') AS down FROM ai_feedback WHERE created_at >= ? AND country IS NOT NULL GROUP BY country ORDER BY down DESC, up DESC LIMIT 6`).bind(d28).all()).results
      .map((r) => ({ country: r.country, up: r.up, down: r.down, helpful_pct: pct(r.up, r.down) }));
    let bySource = [];
    try {   // needs migration 0064; without it the entrance breakdown is simply left out
      bySource = (await db.prepare(`SELECT source, SUM(rating = 'up') AS up, SUM(rating = 'down') AS down FROM ai_feedback WHERE created_at >= ? AND source IS NOT NULL GROUP BY source ORDER BY source`).bind(d28).all()).results
        .map((r) => ({ source: r.source, up: r.up, down: r.down, helpful_pct: pct(r.up, r.down) }));
    } catch (_) { bySource = []; }
    const reasons = (await db.prepare(`SELECT reason, COUNT(*) AS n FROM ai_feedback WHERE rating = 'down' AND reason IS NOT NULL AND created_at >= ? GROUP BY reason ORDER BY n DESC`).bind(d28).all()).results;
    const qs = (await db.prepare(`SELECT id, question FROM ai_feedback WHERE rating = 'down' AND question IS NOT NULL AND created_at >= ? ORDER BY id DESC LIMIT 400`).bind(d28).all()).results;
    const topics = groupTopics(qs);

    if (checkCoverage) {
      for (const t of topics.slice(0, coverageLimit)) {
        try {
          const ctx = await retrieveFn(env, t.topic, "RW", null, [], request);
          const n = ["casinos", "reviews", "news", "pages", "faqs", "contentItems", "researchItems", "platformUpdates"].reduce((s, k) => s + ((ctx && ctx[k]) || []).length, 0);
          t.site_has_content = n > 0;
        } catch (_) { /* leave unknown */ }
      }
    }
    return { available: true, this_week: thisWeek, last_week: lastWeek, trend, by_country: byCountry, by_source: bySource, reasons, topics, questions_considered: qs.length };
  } catch (_) {
    return { available: false };
  }
}

const COVER_KEYS = ["casinos", "reviews", "news", "pages", "faqs", "contentItems", "researchItems", "platformUpdates"];

/** True when the same lookup the public chat uses finds anything on the site for this text. */
export async function siteHas(env, request, text, retrieveFn = retrieve) {
  const ctx = await retrieveFn(env, text, "RW", null, [], request);
  return COVER_KEYS.some((k) => ((ctx && ctx[k]) || []).length > 0);
}

/**
 * Content gaps: topics people got thumbs-down on (not yet marked handled, last 60 days) where the site has NOTHING
 * for either the topic word or the question itself. Each one is a thing worth writing. No model call, nothing stored.
 */
export async function contentGaps(env, request, { limit = 8, retrieveFn = retrieve } = {}) {
  const db = env.DB;
  try {
    const since = fmt(new Date(Date.now() - 60 * 86400000));
    const qs = (await db.prepare(`SELECT id, question FROM ai_feedback WHERE rating = 'down' AND reviewed = 0 AND question IS NOT NULL AND created_at >= ? ORDER BY id DESC LIMIT 500`).bind(since).all()).results;
    const gaps = [];
    for (const t of groupTopics(qs, { max: limit + 4 })) {
      if (gaps.length >= limit) break;
      try {
        const hasTopic = await siteHas(env, request, t.topic, retrieveFn);
        const hasQuestion = hasTopic || await siteHas(env, request, t.examples[0].question, retrieveFn);
        if (!hasQuestion) gaps.push(t);
      } catch (_) { /* unknown: do not call it a gap */ }
    }
    return { available: true, gaps, questions_considered: qs.length };
  } catch (_) {
    return { available: false, gaps: [] };
  }
}
