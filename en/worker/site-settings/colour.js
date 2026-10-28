// Colour maths for the theme: parsing, WCAG contrast, and nudging a colour until text on it is readable.

export function toRgb(value) {
  const v = String(value || "").trim();
  let m = v.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = v.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
  if (m) return [m[1], m[2], m[3]].map((n) => Math.max(0, Math.min(255, Math.round(Number(n)))));
  m = v.match(/^hsla?\(\s*([\d.]+)(?:deg)?[ ,]+([\d.]+)%[ ,]+([\d.]+)%/i);
  if (m) {
    const h = (Number(m[1]) % 360) / 360, sat = Number(m[2]) / 100, l = Number(m[3]) / 100;
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((c) => Math.round(c * 255));
  }
  return null;
}

export const toHex = (rgb) => "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");

export function luminance(rgb) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

export function contrast(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export const mixRgb = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);

/** `fg` unchanged when it already reads on every background in `bgs`; otherwise moved toward white or black until it does. */
export function readableOn(fg, bgs, min = 4.5) {
  const f = toRgb(fg);
  const list = (Array.isArray(bgs) ? bgs : [bgs]).map(toRgb);
  if (!f || list.some((b) => !b)) return fg;
  const ok = (c) => list.every((b) => contrast(c, b) >= min);
  if (ok(f)) return fg;
  const avg = list.reduce((n, b) => n + luminance(b), 0) / list.length;
  const target = avg < 0.179 ? [255, 255, 255] : [0, 0, 0];
  for (let i = 1; i <= 20; i++) { const c = mixRgb(f, target, i / 20); if (ok(c)) return toHex(c); }
  return toHex(target);
}

/** The better of white and near-black for text on `bg`. */
export function bestTextOn(bg) {
  const b = toRgb(bg);
  if (!b) return "#ffffff";
  return contrast([255, 255, 255], b) >= contrast([15, 23, 42], b) ? "#ffffff" : "#0f172a";
}
