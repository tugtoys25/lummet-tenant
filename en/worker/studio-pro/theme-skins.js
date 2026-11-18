// Homepage skins: additive layout and background layers that a theme can opt into (theme.skin). A skin styles the section chrome of
// BOTH homepages at once: the default one (.section, .section-header, .link) and the Advanced Homepage (.ah-section, .ah-head, .ah-link,
// .ah-chip, .ah-card, .ah-faq, .ah-trust, .ah-news ...). Skins only use the site's own colour variables (--primary, --bg, --white,
// --light-gray, --gray, --dark, --radius), so they follow the theme's palette, and every rule starts with body.dsp-skin-<id>,
// so nothing changes unless a theme that names a skin is active. Cards keep following Card Studio; skins never restyle cards.
const MIX = (a, pct, b = "var(--bg)") => `color-mix(in srgb,${a} ${pct}%,${b})`;

// o: page (body background layer), sec / alt (section backgrounds), pad (section padding, px), head (heading treatment),
//    panel (sections sit on a raised panel), line (hairline between sections), band (newsletter and trust band), chip (filter chip shape)
const SKINS = {
  aurora: { page: `radial-gradient(900px 480px at 12% -8%,${MIX("var(--primary)", 26, "transparent")},transparent 70%),radial-gradient(800px 460px at 92% 0,${MIX("var(--accent,var(--primary))", 22, "transparent")},transparent 70%)`, sec: "transparent", alt: MIX("var(--primary)", 5), pad: 56, head: "bar", line: true, band: `linear-gradient(120deg,${MIX("var(--primary)", 70, "#000")},${MIX("var(--accent,var(--primary))", 55, "#000")})`, chip: "pill" },
  vault: { page: `linear-gradient(${MIX("var(--primary)", 6, "transparent")} 1px,transparent 1px),linear-gradient(90deg,${MIX("var(--primary)", 6, "transparent")} 1px,transparent 1px)`, pageSize: "56px 56px", sec: "transparent", alt: MIX("var(--primary)", 7), pad: 64, head: "underline", line: true, band: "var(--surface-dark)", chip: "square" },
  felt: { page: `radial-gradient(1100px 600px at 50% -10%,${MIX("var(--primary)", 18, "transparent")},transparent 72%)`, sec: "transparent", alt: MIX("var(--primary)", 8), pad: 52, head: "center", line: false, band: `linear-gradient(135deg,${MIX("var(--primary)", 62, "#000")},${MIX("var(--primary)", 85, "#000")})`, chip: "pill" },
  ledger: { page: "none", sec: "transparent", alt: "var(--white)", pad: 60, head: "caps", line: true, band: "var(--surface-dark)", chip: "square" },
  noir: { page: `radial-gradient(${MIX("var(--primary)", 14, "transparent")} 1.2px,transparent 1.4px)`, pageSize: "22px 22px", sec: "transparent", alt: MIX("var(--primary)", 6), pad: 48, head: "bar", line: true, band: `linear-gradient(100deg,${MIX("var(--primary)", 35, "#000")},${MIX("var(--accent,var(--primary))", 30, "#000")})`, chip: "outline" },
  slate: { page: "none", sec: "transparent", alt: MIX("var(--primary)", 4), pad: 56, head: "plain", line: false, panel: true, band: "var(--surface-dark)", chip: "square" },
  sunset: { page: `linear-gradient(180deg,${MIX("var(--primary)", 12, "transparent")},transparent 520px)`, sec: "transparent", alt: MIX("var(--accent,var(--primary))", 7), pad: 56, head: "underline", line: false, band: `linear-gradient(110deg,var(--primary),${MIX("var(--accent,var(--primary))", 90, "#000")})`, chip: "pill" },
  frost: { page: `radial-gradient(760px 420px at 85% -5%,${MIX("var(--primary)", 20, "transparent")},transparent 70%),radial-gradient(640px 380px at 5% 10%,${MIX("var(--accent,var(--primary))", 16, "transparent")},transparent 70%)`, sec: "transparent", alt: MIX("var(--white)", 60, "transparent"), pad: 54, head: "plain", line: false, panel: true, band: `linear-gradient(120deg,${MIX("var(--primary)", 75, "#000")},${MIX("var(--primary)", 55, "#000")})`, chip: "pill" },
  royal: { page: `radial-gradient(1000px 520px at 50% -12%,${MIX("var(--primary)", 24, "transparent")},transparent 70%)`, sec: "transparent", alt: MIX("var(--primary)", 9), pad: 60, head: "center", line: true, band: "var(--surface-dark)", chip: "outline" },
  sport: { page: "none", sec: "transparent", alt: "var(--white)", pad: 44, head: "bar", line: false, band: "var(--surface-dark)", chip: "square" },
  sand: { page: `linear-gradient(180deg,${MIX("var(--primary)", 8, "transparent")},transparent 460px)`, sec: "transparent", alt: MIX("var(--primary)", 6), pad: 58, head: "underline", line: false, panel: true, band: `linear-gradient(120deg,${MIX("var(--primary)", 80, "#000")},${MIX("var(--primary)", 62, "#000")})`, chip: "pill" },
  ink: { page: "none", sec: "transparent", alt: "transparent", pad: 64, head: "caps", line: true, band: "var(--dark)", chip: "square" },
};
export const SKIN_IDS = Object.keys(SKINS);

const HEADS = {
  bar: (S) => `${S} .section-header h2,${S} .ah-head h2{padding-left:14px;border-left:5px solid var(--primary)}`,
  underline: (S) => `${S} .section-header h2::after,${S} .ah-head h2::after{content:"";display:block;width:56px;height:4px;margin-top:10px;border-radius:4px;background:var(--primary)}`,
  center: (S) => `${S} .section-header,${S} .ah-head{flex-direction:column;align-items:center;text-align:center;gap:8px}${S} .section-header h2::after,${S} .ah-head h2::after{content:"";display:block;width:48px;height:3px;margin:10px auto 0;border-radius:3px;background:var(--primary)}`,
  caps: (S) => `${S} .section-header h2,${S} .ah-head h2{font-size:14px;letter-spacing:.16em;text-transform:uppercase;color:var(--primary);padding-bottom:10px;border-bottom:1px solid var(--light-gray);width:100%}${S} .section-header,${S} .ah-head{flex-direction:column;align-items:flex-start;gap:6px}`,
  plain: () => "",
};
const CHIPS = { pill: "999px", square: "6px", outline: "999px" };

export function skinCss(id) {
  const o = SKINS[id];
  if (!o) return "";
  const S = `body.dsp-skin-${id}`;
  let css = "";
  if (o.page && o.page !== "none") css += `${S}{background-image:${o.page};background-repeat:${o.pageSize ? "repeat" : "no-repeat"};${o.pageSize ? `background-size:${o.pageSize}` : "background-size:100% 900px"}}`;
  css += `${S} .section,${S} .ah-section{padding-top:${o.pad}px;padding-bottom:${o.pad}px;background:${o.sec}}`;
  css += `${S} .section--alt,${S} .ah-section--alt{background:${o.alt}}`;
  if (o.line) css += `${S} .section + .section,${S} .ah-section + .ah-section{border-top:1px solid transparent;border-image:linear-gradient(90deg,transparent,${MIX("var(--primary)", 40, "transparent")},transparent) 1}`;
  if (o.panel) css += `${S} .section > .container,${S} .ah-section > .ah-wrap{background:var(--white);border:1px solid var(--light-gray);border-radius:calc(var(--radius,12px) + 6px);padding:28px;box-shadow:var(--shadow,0 10px 30px rgba(15,23,42,.06))}@media(max-width:640px){${S} .section > .container,${S} .ah-section > .ah-wrap{padding:18px}}`;
  css += `${S} .section-header h2,${S} .section h2,${S} .section h3{color:var(--dark)}`;
  css += (HEADS[o.head] || HEADS.plain)(S);
  css += `${S} .ah-chip{border-radius:${CHIPS[o.chip] || "999px"}${o.chip === "outline" ? ";background:transparent;border-color:var(--primary);color:var(--primary)" : ""}}`;
  css += `${S} .ah-card{transition:transform .18s ease,border-color .18s ease}${S} .ah-card:hover{transform:translateY(-3px)}`;
  css += `${S} .ah-news,${S} .ah-trust{background:${o.band}}${S} .ah-trust{color:#fff}${S} .ah-trust .ah-trust__text p{color:rgba(255,255,255,.78)}${S} .ah-trust h2{color:#fff}`;
  css += `${S} .ah-faq details{border-radius:calc(var(--radius,12px) - 2px)}${S} .ah-faq summary{font-weight:600}`;
  css += `@media(prefers-reduced-motion:reduce){${S} .ah-card{transition:none}${S} .ah-card:hover{transform:none}}`;
  return css;
}
