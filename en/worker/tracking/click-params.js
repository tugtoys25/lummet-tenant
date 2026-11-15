// Click-id and sub-id handoff for the /go/ redirect.
//
// Operators only attribute a conversion back to us if OUR click id travels inside the link they receive. Programs disagree on the parameter
// name (sub_id, aff_click_id, anid, click_id, cid, afp ...) and on the macro style ({x}, {{x}}, [x], ${x}), so both are configurable
// per tracking link:
//   1. MACROS in the destination URL are replaced:  https://op.example/?a=1&sub_id={click_id}&s2={sub1}
//   2. or a plain parameter NAME is set on the link (click_id_param) and the click id is appended/replaced under that name.
// Inbound parameters on our own /go/ URL (?sub1=...&utm_source=...&gclid=...) are captured for reporting and can be forwarded.

const SUB_KEYS = Array.from({ length: 10 }, (_, i) => `sub${i + 1}`);
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
const ID_KEYS = ["gclid", "fbclid", "ttclid", "msclkid"];
const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,40}$/;

const clean = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
  return s || null;
};

// Everything we are willing to read from the visitor's query string. Unknown parameters are ignored, values are length-capped.
export function captureClickParams(searchParams) {
  const get = (k) => clean(searchParams && searchParams.get ? searchParams.get(k) : null);
  const subs = {}; const utm = {}; const ids = {};
  for (const k of SUB_KEYS) { const v = get(k); if (v) subs[k] = v; }
  for (const k of UTM_KEYS) { const v = get(k); if (v) utm[k] = v; }
  for (const k of ID_KEYS) { const v = get(k); if (v) ids[k] = v; }
  return { subs, utm, ids };
}

// The parts of a captured set that belong in analytics_events columns / metadata.
export function clickEventFields(captured) {
  const { subs, utm, ids } = captured;
  const meta = {};
  if (Object.keys(subs).length) meta.subs = subs;
  if (Object.keys(ids).length) meta.ids = ids;
  return {
    utmSource: utm.utm_source ?? null, utmMedium: utm.utm_medium ?? null, utmCampaign: utm.utm_campaign ?? null,
    utmTerm: utm.utm_term ?? null, utmContent: utm.utm_content ?? null,
    metadata: Object.keys(meta).length ? meta : null
  };
}

export function parseSubParamMap(raw) {
  if (!raw) return {};
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    const out = {};
    for (const [k, v] of Object.entries(o || {})) if (SUB_KEYS.includes(k) && PARAM_NAME.test(String(v))) out[k] = String(v);
    return out;
  } catch { return {}; }
}

// Validates admin input for a link's handoff settings. Returns { value, errors } where value is what to store.
export function validateHandoff(input) {
  const errors = [];
  const clickIdParam = input && input.click_id_param ? String(input.click_id_param).trim() : "";
  if (clickIdParam && !PARAM_NAME.test(clickIdParam)) errors.push("Click id parameter may only contain letters, digits, _ . - and must start with a letter.");
  let map = {};
  const rawMap = input ? input.sub_param_map : null;
  if (rawMap != null && rawMap !== "") {
    let o = rawMap;
    if (typeof rawMap === "string") { try { o = JSON.parse(rawMap); } catch { o = null; errors.push("Sub-id map must be valid JSON, e.g. {\"sub1\":\"sub_id2\"}."); } }
    if (o && typeof o === "object" && !Array.isArray(o)) {
      for (const [k, v] of Object.entries(o)) {
        if (!SUB_KEYS.includes(k)) { errors.push(`Unknown sub-id key "${k}" (use sub1..sub10).`); continue; }
        if (!PARAM_NAME.test(String(v))) { errors.push(`Parameter name for ${k} is not valid.`); continue; }
        map[k] = String(v);
      }
    } else if (o !== null && !errors.length) errors.push("Sub-id map must be an object.");
  }
  return { value: { click_id_param: clickIdParam || null, sub_param_map: Object.keys(map).length ? JSON.stringify(map) : null }, errors };
}

const MACRO_NAMES = ["click_id", "clickid", "subid", "tracking_code", "country", "link_id", ...SUB_KEYS, ...UTM_KEYS, ...ID_KEYS];
const MACRO_RE = new RegExp(`\\$\\{(${MACRO_NAMES.join("|")})\\}|\\{\\{(${MACRO_NAMES.join("|")})\\}\\}|\\{(${MACRO_NAMES.join("|")})\\}|\\[(${MACRO_NAMES.join("|")})\\]`, "gi");

function macroValues({ clickId, captured, countryCode, trackingCode, linkId }) {
  const v = { click_id: clickId, clickid: clickId, subid: clickId, tracking_code: trackingCode, country: countryCode, link_id: linkId };
  if (captured) Object.assign(v, captured.subs, captured.utm, captured.ids);
  return v;
}

// Returns the URL the visitor is redirected to.
//   link: { click_id_param, sub_param_map, tracking_code, id } (any may be missing) -- the legacy per-casino URL passes {}.
export function buildOutboundUrl(destinationUrl, { clickId, captured = null, countryCode = null, link = {} } = {}) {
  const vals = macroValues({ clickId, captured, countryCode, trackingCode: link.tracking_code ?? null, linkId: link.id ?? null });
  let url = String(destinationUrl);
  let hadClickMacro = false;
  url = url.replace(MACRO_RE, (m, a, b, c, d) => {
    const name = String(a || b || c || d).toLowerCase();
    if (name === "click_id" || name === "clickid" || name === "subid") hadClickMacro = true;
    const val = vals[name];
    return val == null ? "" : encodeURIComponent(String(val));
  });

  const setParam = (u, key, value) => {
    try {
      const parsed = new URL(u);
      if (parsed.searchParams.has(key)) { parsed.searchParams.set(key, value); return parsed.toString(); }
    } catch { /* fall through to a plain append */ }
    const hashIdx = u.indexOf("#");
    const base = hashIdx === -1 ? u : u.slice(0, hashIdx);
    const hash = hashIdx === -1 ? "" : u.slice(hashIdx);
    return `${base}${base.includes("?") ? "&" : "?"}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash}`;
  };

  if (link.click_id_param && clickId && PARAM_NAME.test(link.click_id_param)) {
    url = setParam(url, link.click_id_param, clickId);
  } else if (!hadClickMacro) {
    // No macro and no configured parameter: leave the link exactly as stored (an admin may rely on a static id).
  }
  const map = parseSubParamMap(link.sub_param_map);
  for (const [inKey, outName] of Object.entries(map)) {
    const val = captured && captured.subs ? captured.subs[inKey] : null;
    if (val) url = setParam(url, outName, val);
  }
  return url;
}
