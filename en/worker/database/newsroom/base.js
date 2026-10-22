// ── Vocabularies ─────────────────────────────────────────────
export const ARTICLE_TYPES = ['news', 'analysis', 'interview', 'investigation', 'explainer',
  'research', 'opinion', 'original_reporting', 'press_release', 'feature', 'live'];

export const CONTENT_CLASSES = ['editorial', 'sponsored', 'commercial', 'press_release'];

export const LABELS = ['breaking', 'developing', 'exclusive', 'analysis', 'investigation',
  'interview', 'opinion', 'research', 'press_release'];

export const SOURCE_TYPES = ['official_statement', 'regulator', 'government', 'court_document',
  'company_filing', 'press_release', 'interview', 'original_reporting', 'industry_report',
  'research', 'other'];

export const CORRECTION_TYPES = ['correction', 'clarification', 'update', 'retraction'];

export const RELATION_TYPES = ['related', 'previous_coverage', 'follow_up', 'background',
  'explainer', 'original_story'];

export const FACT_CHECK_STATUSES = ['not_checked', 'in_review', 'fact_checked', 'needs_correction'];

export const WORKFLOW_STATUSES = ['idea', 'assigned', 'draft', 'editorial_review', 'fact_check',
  'approved', 'scheduled', 'published', 'updated', 'corrected', 'retracted', 'archived'];

export const inSet = (list, v) => typeof v === 'string' && list.includes(v);

// Shared WHERE fragment: an article that is published and not scheduled for later.
export const LIVE = `n.published = 1 AND (n.published_at IS NULL OR datetime(n.published_at) <= datetime('now'))`;

// ── Feature flags (system_settings, all default off) ─────────
export async function isNewsFlagEnabled(db, key) {
  try {
    const row = await db.prepare(`SELECT value FROM system_settings WHERE key = ?`).bind(key).first();
    return !!row && String(row.value).toLowerCase() === 'true';
  } catch (e) {
    console.error('newsroom flag read failed:', key, e.message);
    return false; // fail closed: an unreadable flag never turns a new feature on
  }
}

// ── Text / slug helpers ──────────────────────────────────────
export function plainText(input, max = 2000) {
  return String(input ?? '')
    .replace(/<[^>]*>/g, '')          // strip any markup: public messages are text-only
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

export function slugify(input) {
  return String(input ?? '').toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// ── URL validation (sources, press-release origin) ───────────
// Sources are only ever rendered as links; the server never fetches them.
// Validation is still strict (defence in depth against SSRF if a fetcher is
// ever added, and against javascript:/data: XSS and credential-bearing URLs).
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localdomain)$/i;

function isPrivateIp(host) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  return h.includes(':') && (h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80'));
}

export function validatePublicUrl(raw) {
  if (raw == null || String(raw).trim() === '') return { ok: true, value: null };
  const s = String(raw).trim();
  if (s.length > 2048) return { ok: false, error: 'URL too long' };
  let u;
  try { u = new URL(s); } catch { return { ok: false, error: 'Invalid URL' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'Only http(s) URLs are allowed' };
  if (u.username || u.password) return { ok: false, error: 'URLs with credentials are not allowed' };
  if (!u.hostname || PRIVATE_HOST.test(u.hostname) || isPrivateIp(u.hostname)) {
    return { ok: false, error: 'Private or local hosts are not allowed' };
  }
  return { ok: true, value: u.toString() };
}
