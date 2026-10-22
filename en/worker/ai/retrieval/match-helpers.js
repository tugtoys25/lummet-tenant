export const MAX_RESULTS = 8;

const MAX_CONTENT_LENGTH = 500;

export const COUNTRY_NAME_TO_CODE = {
  'rwanda':'RW','united states':'US','usa':'US','america':'US','canada':'CA',
  'united kingdom':'GB','uk':'GB','england':'GB','germany':'DE','france':'FR',
  'italy':'IT','spain':'ES','netherlands':'NL','holland':'NL','australia':'AU',
  'new zealand':'NZ','japan':'JP','china':'CN','india':'IN','brazil':'BR',
  'mexico':'MX','south africa':'ZA','nigeria':'NG','kenya':'KE','egypt':'EG',
  'sweden':'SE','norway':'NO','denmark':'DK','finland':'FI','poland':'PL',
  'portugal':'PT','greece':'GR','turkey':'TR','russia':'RU','ukraine':'UA',
  'united arab emirates':'AE','saudi arabia':'SA','qatar':'QA','south korea':'KR',
  'korea':'KR','thailand':'TH','vietnam':'VN','philippines':'PH','indonesia':'ID',
  'malaysia':'MY','singapore':'SG','argentina':'AR','chile':'CL','colombia':'CO',
  'peru':'PE','austria':'AT','switzerland':'CH','ireland':'IE','belgium':'BE',
  'czech republic':'CZ','hungary':'HU','romania':'RO','bulgaria':'BG',
  'croatia':'HR','malta':'MT','cyprus':'CY','luxembourg':'LU','iceland':'IS'
};

const VALID_TABLES = ['casinos','reviews','review_blocks','news', 'platform_updates','pages','faqs','authors','countries','categories','geo_rules','seo_meta','payment_methods','nav_items','components','seo_pages','content_items','research_items'];

// ── Name matching helpers (typo/spacing tolerance for casino lookups) ──
// "Casa Bet" typed with a space will never LIKE-match a DB value of
// "casabet" (no space) -- LIKE needs that literal substring to be
// present, and it isn't. Stripping non-alphanumerics from both sides
// before comparing closes that specific, very common gap (spacing,
// hyphens, punctuation) cheaply, in SQL, with no extra round trip.
export function normalizeForMatch(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Real typos (an extra/missing/swapped letter) survive normalization
// but still won't LIKE-match. SQLite has no built-in edit-distance
// function, so this fallback fetches a bounded candidate list and
// scores them in JS. Only used when the primary search comes up empty
// AND the model believes a specific casino name was named -- so a
// generic query with no name in it never triggers a broad fuzzy scan.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

export async function fuzzyFindCasinoSlug(db, candidateNames) {
  const candidates = [...new Set(candidateNames.map(normalizeForMatch))].filter(s => s.length >= 3);
  if (candidates.length === 0) return null;

  let rows;
  try {
    const r = await db.prepare(`SELECT slug, name FROM casinos WHERE published = 1 LIMIT 500`).all();
    rows = r.results || [];
  } catch { return null; }

  let bestSlug = null, bestDist = Infinity;
  for (const row of rows) {
    const normName = normalizeForMatch(row.name);
    const normSlug = normalizeForMatch(row.slug);
    for (const cand of candidates) {
      const dist = Math.min(levenshtein(cand, normName), levenshtein(cand, normSlug));
      // ~30% of the shorter string's length, minimum 1 -- tight enough
      // to avoid matching an unrelated casino, loose enough to catch a
      // couple of typo'd characters.
      const threshold = Math.max(1, Math.floor(Math.min(cand.length, normName.length) * 0.3));
      if (dist <= threshold && dist < bestDist) { bestDist = dist; bestSlug = row.slug; }
    }
  }
  return bestSlug;
}

export function truncate(text, max = MAX_CONTENT_LENGTH) {
  if (!text) return '';
  const clean = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.substring(0, max) + '...' : clean;
}
