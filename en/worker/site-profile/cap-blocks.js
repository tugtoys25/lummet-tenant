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
//  - a <script> or <style> element that itself carries data-cap is removed as a whole (JSON-LD for a hidden block).
//    Untagged script and style bodies are never inspected.
//  - data-cap-hide="<capability>" HIDES instead of removing: the element stays in the page with hidden and
//    style="display:none" (so scripts that read or save its fields still find it). An existing hidden attribute is kept
//    once, an existing style attribute gets display:none put in front. Use it where removing the markup could make a
//    save routine write empty data.
const VOID = new Set(["input", "br", "img", "hr", "meta", "link", "source", "area", "col", "wbr"]);
const TOKEN = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>|<([a-zA-Z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const CAP_ATTR = /(?:^|\s)data-cap\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const HIDE_ATTR = /(?:^|\s)data-cap-hide\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const HIDE_ATTR_G = /\sdata-cap-hide\s*=\s*(?:"[^"]*"|'[^']*')/i;
const HAS_HIDDEN = /\shidden(?=[\s=/>])/i;
const STYLE_ATTR = /(\sstyle\s*=\s*)("|')([\s\S]*?)\2/i;

// <div data-cap-hide="x" ...> -> <div ... hidden style="display:none">  (open tag text in, open tag text out)
export function hideOpenTag(tag) {
  let t = String(tag).replace(HIDE_ATTR_G, "");
  if (STYLE_ATTR.test(t)) t = t.replace(STYLE_ATTR, (_m, a, q, v) => `${a}${q}display:none;${v}${q}`);
  else t = t.replace(/\s*(\/?)>$/, ' style="display:none"$1>');
  if (!HAS_HIDDEN.test(t)) t = t.replace(/\s*(\/?)>$/, ' hidden$1>');
  return t;
}

export function capsOf(attrs, re = CAP_ATTR) {
  const m = re.exec(attrs || "");
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
    if (!m[2]) {
      // comment, script or style block: only a script/style that carries data-cap itself is touched
      if (m[1]) {
        const open = /^<(?:script|style)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/i.exec(m[0]);
        const sc = open && capsOf(open[1]);
        if (sc && !sc.some((c) => isOn(c))) { out += src.slice(last, m.index); last = m.index + m[0].length; }
      }
      continue;
    }
    const hideCaps = capsOf(m[3], HIDE_ATTR);
    if (hideCaps && !hideCaps.some((c) => isOn(c)) && !capsOf(m[3])) {
      out += src.slice(last, m.index) + hideOpenTag(m[0]);
      last = m.index + m[0].length;
      continue;
    }
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
