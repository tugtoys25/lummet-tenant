// Inline ad insertion: rule matching, insertion points, ad components.
// Part of worker/controllers.js, which re-exports everything from here.
import { getEnabledAdRules } from "../database/ad-rules.js";
import * as componentsDB from "../database/components.js";

// ============================================================
// AD INJECTION ENGINE — Hybrid Mode
// Pipeline: 1. Disable check → 2. Resolve manual markers
//           → 3. Apply automatic rules (respecting manual placements)
//           → 4. Device/GEO/schedule filtering
// ============================================================

export async function injectInlineAds(content, env, request, pageType = 'news') {
  if (!content) return content;

  // 1. Check if ads are disabled for this article
  if (/<!--\s*ADS:DISABLE\s*-->/i.test(content)) {
    return content.replace(/<!--\s*ADS:DISABLE\s*-->/gi, "");
  }

  // 2. Load Ad Library
  const adComponents = await loadAdComponents(env);
  const adById = new Map();
  const adBySlug = new Map();

  for (const ad of adComponents) {
    adById.set(ad.id, ad);
    adBySlug.set(ad.slug, ad);
  }

  // 3. Load settings fallback ad
  let settingsAd = null;
  try {
    const adSetting = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'news_inline_ad'"
    ).first();
    const rawValue = adSetting?.value || "";
    if (rawValue) {
      if (rawValue.startsWith("component:")) {
        const slug = rawValue.slice("component:".length).trim();
        settingsAd = adBySlug.get(slug) || null;
      } else {
        settingsAd = {
          id: 0,
          slug: "settings-fallback",
          html: rawValue,
          status: "active"
        };
      }
    }
  } catch (_) {}

  // 4. Resolve explicit manual markers
  const markerRegex = /<!--\s*AD:([^>]+?)\s*-->/gi;
  const manuallyUsedComponentIds = new Set();
  let hasManualMarkers = false;

  let result = content.replace(markerRegex, (match, identifier) => {
    const id = identifier.trim();
    hasManualMarkers = true;

    // AUTO markers — resolve later
    if (id.toUpperCase() === "AUTO") return match;

    // Resolve by component:ID
    if (id.startsWith("component:")) {
      const compId = parseInt(id.slice("component:".length), 10);
      const ad = adById.get(compId);
      if (ad && ad.html) {
        manuallyUsedComponentIds.add(compId);
        return `\n${ad.html}\n`;
      }
      return `\n<!-- AD NOT FOUND: ${id} -->\n`;
    }

    // Resolve by slug
    const ad = adBySlug.get(id);
    if (ad && ad.html) {
      manuallyUsedComponentIds.add(ad.id);
      return `\n${ad.html}\n`;
    }

    // Resolve settings fallback
    if (settingsAd && settingsAd.slug === id && settingsAd.html) {
      return `\n${settingsAd.html}\n`;
    }

    return `\n<!-- AD NOT FOUND: ${id} -->\n`;
  });

  // 5. Handle AUTO markers
  let autoIndex = 0;
  const autoAds = adComponents.filter(a => !manuallyUsedComponentIds.has(a.id));
  if (settingsAd && settingsAd.html && !manuallyUsedComponentIds.has(0)) {
    autoAds.unshift(settingsAd);
  }

  result = result.replace(/<!--\s*AD:AUTO\s*-->/gi, () => {
    if (autoIndex < autoAds.length) {
      const ad = autoAds[autoIndex++];
      manuallyUsedComponentIds.add(ad.id);
      return `\n${ad.html}\n`;
    }
    return "";
  });

  // 6. Apply automatic rules (HYBRID MODE — does NOT disable when manual ads exist)
  try {
    const rules = await getEnabledAdRules(env.DB, pageType);
    const requestInfo = extractRequestInfo(request);

    result = applyAutoRules(
      result,
      rules,
      manuallyUsedComponentIds,
      requestInfo,
      pageType
    );
  } catch (e) {
    console.error("Auto ad rules error:", e.message);
  }

  return result;
}

// ── Extract device + GEO info from request ──────────────

function extractRequestInfo(request) {
  const cf = request.cf || {};
  const ua = request.headers.get("user-agent") || "";

  let device = "desktop";
  if (/mobile|android|iphone|ipad|ipod/i.test(ua)) {
    device = /ipad|tablet/i.test(ua) ? "tablet" : "mobile";
  }

  return {
    device,
    country: cf.country || null,
    hostname: new URL(request.url).hostname
  };
}

// ── Apply automatic rules with all targeting ────────────

function applyAutoRules(content, rules, usedComponentIds, requestInfo, pageType) {
  if (!rules || rules.length === 0) return content;

  const insertionCount = new Map();
  const allInsertions = []; // { index, html, order } — computed against the ORIGINAL content

  for (const rule of rules) {
    // Skip if component already used manually and max_appearances is 1
    if (usedComponentIds.has(rule.component_id) && rule.max_appearances <= 1) {
      continue;
    }

    // Check scheduling
    if (!isRuleActiveNow(rule)) continue;

    // Check device targeting
    if (!ruleMatchesDevice(rule, requestInfo.device)) continue;

    // Check GEO targeting
    if (!ruleMatchesCountry(rule, requestInfo.country)) continue;

    // Check page type targeting
    if (!ruleMatchesPageType(rule, pageType)) continue;

    // Get ad HTML
    let htmlToInject = rule.component_html || "";
    if (!htmlToInject) continue;

    // Track appearances
    const currentCount = insertionCount.get(rule.id) || 0;
    const remainingSlots = rule.max_appearances - currentCount;
    if (remainingSlots <= 0) continue;

    // Compute insertion points against the ORIGINAL, untouched content.
    // This is the key fix: every rule's paragraph/heading/image positions
    // are located against the same fixed baseline, so an earlier rule's
    // injected ad HTML (which may itself contain <p> tags) can never shift
    // where a later rule lands.
    let points = findInsertionPoints(content, rule);
    if (points.length > remainingSlots) points = points.slice(0, remainingSlots);
    if (points.length === 0) continue;

    for (const idx of points) {
      allInsertions.push({ index: idx, html: `\n${htmlToInject}\n`, order: allInsertions.length });
    }

    insertionCount.set(rule.id, currentCount + points.length);
    usedComponentIds.add(rule.component_id);
  }

  if (allInsertions.length === 0) return content;

  // Apply from the last position to the first so earlier indices stay valid.
  // For insertions that land at the exact same index, process the
  // higher-`order` (later-added) one first so the original rule/priority
  // order is preserved in the final reading order.
  allInsertions.sort((a, b) => (b.index - a.index) || (b.order - a.order));

  let modified = content;
  for (const ins of allInsertions) {
    modified = modified.slice(0, ins.index) + ins.html + modified.slice(ins.index);
  }
  return modified;
}

// ── Compute insertion points for a rule against a fixed baseline ────────

function getParagraphEndPositions(content) {
  const regex = /<\/p>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index + match[0].length);
  }
  return positions;
}

function getParagraphStartPositions(content) {
  const regex = /<p[^>]*>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index);
  }
  return positions;
}

function getHeadingEndPositions(content) {
  const regex = /<\/h[1-6]>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index + match[0].length);
  }
  return positions;
}

function getHeadingStartPositions(content) {
  const regex = /<h[1-6][^>]*>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index);
  }
  return positions;
}

function getImageEndPositions(content) {
  const regex = /<img\b[^>]*>/gi;
  const positions = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    positions.push(match.index + match[0].length);
  }
  return positions;
}

function pickPosition(positions, positionValue) {
  if (positions.length === 0) return undefined;

  const wanted = Number(positionValue) || 1;
  const clamped = Math.min(
    Math.max(wanted, 1),
    positions.length
  );

  return positions[clamped - 1];
}

function findInsertionPoints(content, rule) {
  // Repeat mode: insert after every Nth paragraph, starting at position_value
  if (rule.repeat_interval > 0 && rule.placement === 'after_paragraph') {
    const positions = getParagraphEndPositions(content);
    const points = [];
    const start = rule.position_value || 1;
    const interval = rule.repeat_interval;
    for (let p = start; p <= positions.length && points.length < rule.max_appearances; p += interval) {
      points.push(positions[p - 1]);
    }
    return points;
  }

  switch (rule.placement) {
    case 'after_paragraph': {
      const positions = getParagraphEndPositions(content);
      const idx = positions[(rule.position_value || 3) - 1];
      return idx !== undefined ? [idx] : [];
    }
    case 'before_paragraph': {
      const positions = getParagraphStartPositions(content);
      const idx = positions[(rule.position_value || 1) - 1];
      return idx !== undefined ? [idx] : [];
    }
    case 'end_of_article':
      return [content.length];
    case 'before_article':
      return [0];
    case 'after_heading': {
      const idx = pickPosition(
        getHeadingEndPositions(content),
        rule.position_value
      );
      return idx !== undefined ? [idx] : [];
    }

    case 'before_heading': {
      const idx = pickPosition(
        getHeadingStartPositions(content),
        rule.position_value
      );
      return idx !== undefined ? [idx] : [];
    }

    case 'after_first_image': {
      const idx = pickPosition(
        getImageEndPositions(content),
        rule.position_value
      );
      return idx !== undefined ? [idx] : [];
    }
    case 'middle_of_article': {
      const positions = getParagraphEndPositions(content);
      if (positions.length === 0) return [content.length];
      return [positions[Math.floor(positions.length / 2)]];
    }
    default:
      return [];
  }
}

// ── Scheduling check ────────────────────────────────────

function isRuleActiveNow(rule) {
  const now = new Date();

  if (rule.start_date) {
    const start = new Date(rule.start_date);
    if (now < start) return false;
  }

  if (rule.end_date) {
    const end = new Date(rule.end_date);
    if (now > end) return false;
  }

  return true;
}

// ── Device targeting ─────────────────────────────────────

function ruleMatchesDevice(rule, requestDevice) {
  if (!rule.devices || rule.devices === 'all') return true;
  if (rule.devices === requestDevice) return true;
  // Allow comma-separated device lists
  const devices = rule.devices.split(',').map(d => d.trim().toLowerCase());
  return devices.includes(requestDevice) || devices.includes('all');
}

// ── GEO targeting ───────────────────────────────────────

function ruleMatchesCountry(rule, requestCountry) {
  if (!rule.countries || rule.countries === 'all') return true;
  if (!requestCountry) return true; // Can't determine country — allow

  const countries = rule.countries
    .split(',')
    .map(c => c.trim().toUpperCase())
    .filter(Boolean);

  return countries.includes(requestCountry) || countries.includes('ALL');
}

// ── Page type targeting ─────────────────────────────────

function ruleMatchesPageType(rule, pageType) {
  if (!rule.page_type || rule.page_type === 'all') return true;
  return rule.page_type === pageType;
}

// ── Load ad components ───────────────────────────────────

async function loadAdComponents(env) {
  try {
    const components = await componentsDB.getAllComponents(env.DB, "ad");
    const ads = [];

    for (const comp of components) {
      if (comp.status !== "active") continue;

      let html = "";

      if (typeof comp.content === "string" && comp.content.trim()) {
        html = comp.content;
      }

      if (!html && comp.settings_json) {
        try {
          const settings = JSON.parse(comp.settings_json);
          if (settings.ad_html) html = settings.ad_html;
        } catch (_) {}
      }

      if (html) {
        ads.push({
          id: comp.id,
          slug: comp.slug,
          name: comp.name,
          html: html.trim(),
          status: comp.status
        });
      }
    }

    return ads;
  } catch (e) {
    console.error("loadAdComponents error:", e.message);
    return [];
  }
}
