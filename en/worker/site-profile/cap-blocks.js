// ============================================================
// SITE PROFILE: capability tags for dashboard HTML (Phase 11C, T4)
// ============================================================
// Any element can carry data-cap="<capability>" (cards, sections, table rows, <option>s ...).
// "a|b" (or "a,b") means "keep when ANY of these is on". When none is on the whole element is removed.
// Pure string function, no I/O. The caller supplies isOn(capabilityId).
//
// Safety rules (fail open, never break a page):
//  - comments, <script> and <style> bodies are never inspected or changed.
//  - an element whose end cannot be found (unbalanced markup) is left in place.
//  - <option> needs no closing tag: it ends at the next <option>, </option>, </optgroup> or </select>.
//  - void elements (input, br, img, hr, meta, link) end at their own tag.
//  - elements nested inside a removed element go with it.
const VOID = new Set(["input", "br", "img", "hr", "meta", "link", "source", "area", "col", "wbr"]);
const TOKEN = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>|<([a-zA-Z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const CAP_ATTR = /(?:^|\s)data-cap\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

export function capsOf(attrs) {
  const m = CAP_ATTR.exec(attrs || "");
  if (!m) return null;
  const list = String(m[1] ?? m[2] ?? "").split(/[|,]/).map((s) => s.trim()).filter(Boolean);
  return list.length ? list : null;
}

// Index just past the element that opens right before openEnd, or -1 when its end cannot be found.
function elementEnd(html, name, openEnd, selfClosed) {
  const lname = name.toLowerCase();
  if (VOID.has(lname) || selfClosed) return openEnd;
  if (lname === "option") {
    const re = /<option\b|<\/(option|optgroup|select)\s*>/gi; re.lastIndex = openEnd;
    const m = re.exec(html);
    if (!m) return -1;
    return /^<\/option\s*>$/i.test(m[0]) ? m.index + m[0].length : m.index;
  }
  const re = new RegExp("<(/?)" + lname.replace(/[^a-z0-9:_-]/g, "") + "\\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>", "gi");
  re.lastIndex = openEnd;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    if (m[1]) depth--; else if (!/\/\s*$/.test(m[2])) depth++;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

export function pruneByCap(html, isOn) {
  const src = String(html || "");
  if (!/data-cap/i.test(src)) return src;
  let out = "", last = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src))) {
    if (!m[2]) continue; // comment, script or style block
    const caps = capsOf(m[3]);
    if (!caps || caps.some((c) => isOn(c))) continue;
    const end = elementEnd(src, m[2], m.index + m[0].length, /\/\s*$/.test(m[3]));
    if (end < 0) continue; // unbalanced: leave it alone
    out += src.slice(last, m.index);
    last = end;
    TOKEN.lastIndex = end;
  }
  return out + src.slice(last);
}
