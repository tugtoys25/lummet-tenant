// Advanced Homepage: loads only what the enabled sections need, using the same data functions as the current homepage, so geo rules,
// offers and publishing rules behave identically.
import * as casinosDb from "../database/casinos.js";
import * as reviewsDb from "../database/reviews.js";
import * as newsDb from "../database/news.js";
import { getPublishedCategories } from "../database/categories.js";
import { getFeaturedCountries, getPublishedCountries } from "../database/countries.js";
import { getPublishedPaymentMethods } from "../database/payment-methods.js";
import { prepareGeoData, sortCasinosByGeo, resolveBonusOverridesForList, resolvePaymentMethodsForList, buildCasinoCards } from "../controllers/casino-cards.js";
import { resolveOffersForCasinos } from "../offers/selection.js";
import { countryFullName } from "../controllers/shared.js";

const safe = async (fn, fb) => { try { return await fn(); } catch (e) { console.error("advanced-home data:", e && e.message); return fb; } };

export function offerTerms(offer, note) {
  const parts = [];
  if (offer) {
    const cur = offer.currency ? ` ${offer.currency}` : "";
    if (offer.wagering_multiplier) parts.push(`${Number(offer.wagering_multiplier)}x wagering`);
    if (offer.min_deposit) parts.push(`min. deposit ${Number(offer.min_deposit)}${cur}`);
    if (offer.max_bonus) parts.push(`max. bonus ${Number(offer.max_bonus)}${cur}`);
  }
  if (note) parts.push(note);
  return parts;
}

export async function loadAdvancedHomeData(env, request, config) {
  const on = new Set(config.sections.filter((s) => s.enabled).map((s) => s.type));
  const sec = (t) => config.sections.find((s) => s.type === t) || {};
  const data = { country: "", countryName: "", casinoCount: 0, picks: [], pickCardsHtml: "", categories: [], countries: [], payments: [], reviews: [], news: [] };

  const needCasinos = on.has("top_picks") || on.has("hero");
  const casinoList = needCasinos ? await safe(() => casinosDb.getAllCasinos(env.DB), []) : [];
  data.casinoCount = casinoList.length;

  const geo = needCasinos ? await safe(() => prepareGeoData(env, request, casinoList), { country: "", statuses: {} }) : { country: "", statuses: {} };
  data.country = geo.country || ""; data.countryName = data.country ? countryFullName(data.country) : "";

  if (on.has("top_picks") && casinoList.length) {
    const tp = sec("top_picks");
    const sorted = sortCasinosByGeo(casinoList, geo);
    const available = sorted.filter((c) => geo.statuses[c.slug] !== "blocked" && geo.statuses[c.slug] !== "restricted");
    let pool = available;
    if (tp.mode === "manual") {
      const byId = new Map(available.map((c) => [c.id, c]));
      pool = tp.picks.map((p) => byId.get(p.casino_id)).filter(Boolean);
    } else {
      pool = available.filter((c) => (c.rating || 0) >= (tp.minRating || 0));
    }
    const [bonus, offers, cats] = await Promise.all([
      safe(() => resolveBonusOverridesForList(env, pool, data.country), {}),
      safe(() => resolveOffersForCasinos(env.DB, pool, data.country), {}),
      safe(async () => {
        const ids = pool.map((c) => c.id); if (!ids.length) return [];
        const rows = await env.DB.prepare(`SELECT cc.casino_id, c.name, c.slug FROM casino_categories cc JOIN categories c ON c.id = cc.category_id WHERE cc.casino_id IN (${ids.map(() => "?").join(",")}) AND c.published = 1 ORDER BY c.name`).bind(...ids).all();
        return rows.results || [];
      }, []),
    ]);
    const catBy = new Map(); for (const r of cats) if (!catBy.has(r.casino_id)) catBy.set(r.casino_id, r.name);
    const pickBy = new Map((tp.picks || []).map((p) => [p.casino_id, p]));
    const rows = [];
    for (const c of pool) {
      const b = bonus[c.id] || { bonus_title: c.bonus_title || "", bonus_value: c.bonus_value || "" };
      const offer = offers[c.id] && offers[c.id].offer;
      const manual = pickBy.get(c.id) || {};
      const hasBonus = Boolean(b.bonus_value);
      if (tp.mode === "auto" && tp.requireBonus && !hasBonus) continue;
      rows.push({ id: c.id, slug: c.slug, name: c.name, logo: c.logo || "", rating: Number(c.rating) || 0,
        bonusTitle: b.bonus_title || "", bonusValue: b.bonus_value || "", terms: offerTerms(offer, manual.bonusNote), license: c.license || "",
        reason: manual.reason || catBy.get(c.id) || "" });
    }
    data.picks = rows.slice(0, tp.count);
    // The cards themselves are the site's own casino card (same markup, same CSS, same Card Studio styling); we only add the extras.
    const chosen = data.picks.map((r) => pool.find((c) => c.id === r.id)).filter(Boolean);
    const pm = await safe(() => resolvePaymentMethodsForList(env, chosen), {});
    const extras = {};
    for (const r of data.picks) extras[r.id] = { reason: tp.showReason ? r.reason : "", terms: r.terms, score: tp.showScore && r.rating > 0 ? r.rating : 0 };
    data.pickCardsHtml = buildCasinoCards(chosen, geo, bonus, pm, extras);
    data.availableCount = available.length;
  }

  const [cats, countries, payments, reviews, news] = await Promise.all([
    on.has("filters") || on.has("browse") ? safe(() => getPublishedCategories(env.DB), []) : [],
    on.has("filters") || on.has("browse") ? safe(async () => { const f = await getFeaturedCountries(env.DB); return f.length ? f : getPublishedCountries(env.DB); }, []) : [],
    on.has("filters") || on.has("payments") ? safe(() => getPublishedPaymentMethods(env.DB), []) : [],
    on.has("reviews_news") && sec("reviews_news").showReviews ? safe(() => reviewsDb.getLatestReviews(env.DB, sec("reviews_news").reviewCount), []) : [],
    on.has("reviews_news") && sec("reviews_news").showNews ? safe(() => newsDb.getLatestNews(env.DB, sec("reviews_news").newsCount), []) : [],
  ]);
  data.categories = cats; data.payments = payments; data.reviews = reviews; data.news = news;
  // the visitor's own country first, so the card they care about is the first they see
  data.countries = [...countries].sort((a, b) => (b.code === data.country) - (a.code === data.country));
  return data;
}
