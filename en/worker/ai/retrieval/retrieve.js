import { getSiteContext } from "../../site-context.js";
import { extractCountryFromMessage, extractSearchTerms, isGeoText, isListingText } from "./search-helpers.js";
import { searchCasinos } from "./search/casinos.js";
import { searchReviews, searchNews } from "./search/reviews.js";
import { searchContentItems } from "./search/items.js";
import { searchPlatformUpdates } from "./search/platform-updates.js";
import { searchPages, searchFaqs, searchAuthors } from "./search/pages.js";
import { searchCountries, searchCategories, searchSeoPages, searchSeoMeta } from "./search/catalog.js";
import { searchPaymentMethods, searchNavItems, searchHomepageSections } from "./search/site-structure.js";

/**
 * Main retrieval function — uses LLM plan if available, falls back to keyword extraction
 */
export async function retrieve(env, query, country, plan = null, conversationHistory = null, request = null ) {
  const db = env.DB;
  const site = await getSiteContext(request, env);
  const text = query.toLowerCase().trim();

  // ── Determine search parameters from plan or fallback ──
  const searchTerms = plan?.search_terms?.length > 0
    ? plan.search_terms
    : extractSearchTerms(query);

  const casinoNames = plan?.casino_names || [];
  const allSearchTerms = [...new Set([
    ...searchTerms,
    ...casinoNames.map(n => n.toLowerCase())
  ])].filter(t => t.length > 0);

  // Deterministic text extraction takes priority over the model's own
  // country_code guess: if the message unambiguously names a country
  // ("...in Kenya?"), a keyword match on that exact text is more
  // trustworthy than an LLM classification that can (and did, in
  // testing) return the wrong country entirely. Falls back to the
  // model's guess only when the text itself has no clear match (e.g.
  // "can I play from Nairobi" -- no literal country name to match).
  const detectedCountry = extractCountryFromMessage(query) || plan?.country_code || country;
  const intent = plan?.intent || 'general';
  const isListing = plan?.is_listing || isListingText(text);
  const isGeo = plan?.intent === 'geo' || plan?.intent === 'licensing' || isGeoText(text);
  const isComparison = plan?.is_comparison || false;
  const tablesToSearch = plan?.tables || [];

  const results = {
    casinos: [], reviews: [], reviewBlocks: [], news: [], platformUpdates: [],
    pages: [], faqs: [], authors: [], countries: [],
    categories: [], seoMeta: [], geoStatuses: {}, casinoCategories: {},
    paymentMethods: [], casinoPaymentMethods: {}, navItems: [], homepageSections: [],
    seoPages: [], contentItems: [], researchItems: []
  };

  const ctx = {
    env, db, site, query, country, plan, conversationHistory, request, text,
    searchTerms, casinoNames, allSearchTerms, detectedCountry, intent,
    isListing, isGeo, isComparison, tablesToSearch
  };

  await searchCasinos(ctx, results);
  await searchReviews(ctx, results);
  await searchNews(ctx, results);
  await searchContentItems(ctx, results);
  await searchPlatformUpdates(ctx, results);
  await searchPages(ctx, results);
  await searchFaqs(ctx, results);
  await searchAuthors(ctx, results);
  await searchCountries(ctx, results);
  await searchCategories(ctx, results);
  await searchSeoPages(ctx, results);
  await searchSeoMeta(ctx, results);
  await searchPaymentMethods(ctx, results);
  await searchNavItems(ctx, results);
  await searchHomepageSections(ctx, results);

  return results;
}
