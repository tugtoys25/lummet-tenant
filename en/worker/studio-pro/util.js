// Shared helpers for the Design Studio libraries (Libraries 2-5). Nothing here touches Library 1 (design-packs.js / header-hero).
// Everything the studio renders is built from allow-listed ids and escaped text. No user value is ever placed in markup or CSS unchecked.

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export const cleanHex = (v, fallback = "") => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : fallback);

// Inline SVG art, used instead of remote photos so a preview or a published page can never show a broken image.
// kind picks a scene; c1/c2 are the scene colours (already validated hex).
const SCENES = {
  skyline: (a, b) => `<rect width="400" height="300" fill="${a}"/><circle cx="310" cy="80" r="44" fill="${b}" opacity=".85"/><g fill="#000" opacity=".28"><rect x="20" y="150" width="46" height="150"/><rect x="74" y="110" width="58" height="190"/><rect x="140" y="170" width="40" height="130"/><rect x="190" y="90" width="64" height="210"/><rect x="262" y="140" width="50" height="160"/><rect x="320" y="180" width="60" height="120"/></g>`,
  stadium: (a, b) => `<rect width="400" height="300" fill="${a}"/><ellipse cx="200" cy="210" rx="190" ry="70" fill="${b}" opacity=".9"/><ellipse cx="200" cy="210" rx="120" ry="38" fill="#000" opacity=".25"/><path d="M10 210 Q200 40 390 210" fill="none" stroke="#fff" stroke-width="3" opacity=".6"/>`,
  cards: (a, b) => `<rect width="400" height="300" fill="${a}"/><g transform="translate(200 150)"><rect x="-120" y="-80" width="100" height="150" rx="10" fill="${b}" transform="rotate(-14)"/><rect x="-50" y="-90" width="100" height="150" rx="10" fill="#fff" opacity=".92"/><rect x="20" y="-76" width="100" height="150" rx="10" fill="${b}" opacity=".7" transform="rotate(14)"/></g>`,
  mountains: (a, b) => `<rect width="400" height="300" fill="${a}"/><circle cx="90" cy="70" r="30" fill="${b}"/><path d="M0 300 L120 120 L190 210 L270 90 L400 300Z" fill="#000" opacity=".3"/><path d="M0 300 L90 190 L170 260 L250 170 L400 300Z" fill="#fff" opacity=".25"/>`,
  interior: (a, b) => `<rect width="400" height="300" fill="${a}"/><rect x="40" y="40" width="150" height="150" rx="6" fill="${b}" opacity=".6"/><rect x="230" y="120" width="130" height="110" rx="10" fill="#000" opacity=".25"/><rect x="0" y="230" width="400" height="70" fill="#000" opacity=".3"/>`,
  plate: (a, b) => `<rect width="400" height="300" fill="${a}"/><circle cx="200" cy="150" r="108" fill="#fff" opacity=".9"/><circle cx="200" cy="150" r="76" fill="${b}"/><circle cx="170" cy="130" r="16" fill="#fff" opacity=".45"/>`,
  waves: (a, b) => `<rect width="400" height="300" fill="${a}"/><path d="M0 170 Q50 120 100 170 T200 170 T300 170 T400 170 V300 H0Z" fill="${b}" opacity=".7"/><path d="M0 220 Q60 180 120 220 T240 220 T360 220 T480 220 V300 H0Z" fill="#000" opacity=".22"/>`,
  portrait: (a, b) => `<rect width="400" height="300" fill="${a}"/><circle cx="200" cy="120" r="52" fill="${b}"/><path d="M80 300 Q200 150 320 300Z" fill="${b}" opacity=".85"/>`,
};
export const SCENE_KINDS = Object.keys(SCENES);
export function art(kind, c1 = "#1e293b", c2 = "#f59e0b") {
  const s = SCENES[kind] || SCENES.skyline;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">${s(cleanHex(c1, "#1e293b"), cleanHex(c2, "#f59e0b"))}</svg>`;
  return `url('data:image/svg+xml;utf8,${encodeURIComponent(svg).replace(/'/g, "%27")}')`;
}
