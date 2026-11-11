// Live header skins for Design Studio Pro.
// The public site never gets a second header. Every studio header is the SITE'S OWN header (templates/layout/header.html: .logo, #mainNav,
// .header-actions with search / CTA / login / menu button) restyled with CSS only, so the site's menu, search, login state and
// Header & Hero settings keep working exactly as they do without a studio.
// Each skin sets a colour PAIR (background + text) so text is always readable on its own background; the family sets the layout.
// Layout changes apply from 769px up; below that every header is the same simple bar with the site's own menu drawer.
const S = "body.dsp-has-header .site-header";
const I = `${S} .header-inner`;
const DESK = "@media(min-width:769px)";
const MOB = "@media(max-width:768px)";
const SMALL = "@media(max-width:480px)";
const NARROW = "@media(max-width:560px)";

// Colours: studio theme variables when a theme is applied, safe fallbacks otherwise (so a header never depends on the site's dark navy bar).
const BASE = `
${S}{--dh-p:var(--p,var(--theme-primary,#2563eb));--dh-p2:var(--p2,var(--theme-secondary,#7c3aed));--dh-sf:var(--sf,#ffffff);--dh-bg0:var(--bg,#ffffff);--dh-tx:var(--tx,#0f172a);--dh-bd:var(--bd,#e2e8f0);--dh-btn:var(--btn,#ffffff);
--dh-bg:var(--dh-sf);--dh-fg:var(--dh-tx);--dh-dbg:var(--dh-bg);--dh-dfg:var(--dh-fg);--dh-r:var(--br,8px)}
body.dsp-hero-dark.dsp-has-header .site-header{--dh-hfg:#ffffff}body.dsp-has-header .site-header{--dh-hfg:var(--dh-tx)}
${S}{background:var(--dh-bg)!important;color:var(--dh-fg)!important;border:0;border-bottom:1px solid var(--dh-bd);box-shadow:none;font-family:var(--bf,inherit)}
${S} .logo,${S} .logo-text,${S} .logo-accent,${S} .logo-dot{color:var(--dh-fg)!important}
${S} .main-nav a{color:var(--dh-fg)!important;background:none!important;border:0!important;box-shadow:none!important;min-height:0!important;transform:none!important;padding:8px 12px;border-radius:var(--dh-r);opacity:.86;font-weight:500}
${S} .main-nav a:hover,${S} .main-nav a.active,${S} .main-nav a[aria-current=page]{opacity:1;color:var(--dh-p)!important;background:none!important}
${S} .btn--ghost{background:transparent!important;color:var(--dh-fg)!important;border:1px solid currentColor!important;box-shadow:none!important}
${S} .header-cta{background:var(--dh-p)!important;color:var(--dh-btn)!important;border:0!important;border-radius:var(--dh-r)}
${S} .search-box input{background:rgba(127,127,127,.14)!important;color:var(--dh-fg)!important;border:1px solid rgba(127,127,127,.3)!important;border-radius:var(--dh-r)}
${S} .search-box input::placeholder{color:var(--dh-fg)!important;opacity:.6}
${S} .nav-toggle,${S} .mobile-search-btn{color:var(--dh-fg)!important;background:none!important;border:1px solid currentColor!important;border-radius:8px;padding:4px 10px;line-height:1.2}
${S} .mobile-search-container{background:var(--dh-dbg)!important}
${S} .mobile-search-container input{background:rgba(127,127,127,.16)!important;color:var(--dh-dfg)!important}
${S} .mobile-search-close{color:var(--dh-dfg)!important}
${I}{height:auto!important;min-height:var(--hh,64px);position:relative}
${I}{padding-left:max(16px,env(safe-area-inset-left));padding-right:max(16px,env(safe-area-inset-right))}
${DESK}{${S} .main-nav{display:flex!important;flex-wrap:wrap;gap:4px}${S} .nav-toggle,${S} .mobile-search-btn{display:none!important}}
${MOB}{${S} .main-nav.active{display:flex!important;flex-direction:column;position:absolute!important;left:0!important;right:0!important;top:100%!important;width:auto!important;max-height:none!important;border-radius:0!important;padding:10px 20px 16px!important;background:var(--dh-dbg)!important;color:var(--dh-dfg)!important;box-shadow:0 18px 30px rgba(0,0,0,.18)!important;gap:2px!important}
${S} .main-nav.active a{color:var(--dh-dfg)!important;display:block;padding:12px 8px;border-bottom:1px solid rgba(127,127,127,.2)!important}}
${NARROW}{${S} .header-cta{display:none!important}${S} .logo{min-width:0;flex:1 1 auto;overflow:hidden}${S} .logo-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}${S} .logo,${S} .logo-text{letter-spacing:.06em!important}}
${SMALL}{${S} .header-actions{gap:6px}${S} .header-actions .btn{padding:8px 10px!important;font-size:12px!important;min-height:0!important}${S} .logo-text{font-size:1rem;white-space:nowrap}${I}{gap:10px!important}}
`;

// Skins: the colour pair and surface treatment.
const SKINS = {
  solid: "",
  flat: `${S}{--dh-bg:var(--dh-bg0);border-bottom:0}${I}{min-height:76px}`,
  connected: `${S}{--dh-bg:transparent;--dh-fg:var(--dh-hfg);--dh-dbg:#0f172a;--dh-dfg:#ffffff;border-bottom:0}`,
  transparent: `${S}{--dh-bg:transparent;--dh-fg:var(--dh-hfg);--dh-dbg:#0f172a;--dh-dfg:#ffffff;border-bottom:0}`,
  glass: `${S}{--dh-bg:rgba(255,255,255,.12);--dh-fg:var(--dh-hfg);--dh-dbg:rgba(15,23,42,.96);--dh-dfg:#ffffff;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,.22)}`,
  pill: `${S}{--dh-bg:transparent;border:0;padding:16px 16px 0}${I}{background:rgba(255,255,255,.94);color:#111;border-radius:999px;box-shadow:0 14px 40px rgba(0,0,0,.25);padding:6px 10px 6px 24px;max-width:min(1100px,calc(100% - 8px))}
${S}{--dh-fg:#111111;--dh-dbg:#ffffff;--dh-dfg:#111111}`,
  brand: `${S}{--dh-bg:var(--dh-p);--dh-fg:var(--dh-btn);--dh-bd:transparent;border-bottom:0}${S} .header-cta{background:var(--dh-btn)!important;color:var(--dh-p)!important}${S} .main-nav a:hover{color:var(--dh-fg)!important;text-decoration:underline}`,
  luxury: `${S}{--dh-bg:#0a0a0a;--dh-fg:#f3e7c4;--dh-p:#d7b85d;--dh-bd:#b79a4b;--dh-btn:#0a0a0a;border-bottom:1px solid #b79a4b}${S} .main-nav a{text-transform:uppercase;letter-spacing:.16em;font-size:.74rem}`,
  edge: `${I}{max-width:none!important;padding-left:32px!important;padding-right:32px!important}`,
  corp: `${S}{--dh-bg:var(--dh-sf)}`,
  asym: `${I}{padding-left:0!important}${SMALL}{${S} .logo{padding:12px 22px 12px 12px!important}}${S} .logo{background:var(--dh-p)!important;padding:20px 34px 20px 28px;align-self:stretch;clip-path:polygon(0 0,100% 0,88% 100%,0 100%)}${S} .logo,${S} .logo-text{color:var(--dh-btn)!important}`,
  angled: `${S}{border-bottom:0}${DESK}{${S}{clip-path:polygon(0 0,100% 0,100% 62%,97% 100%,3% 100%,0 62%);padding-bottom:6px}}`,
  roundb: `${S}{--dh-bg:var(--dh-p);--dh-fg:var(--dh-btn);border-radius:0 0 34px 34px;border-bottom:0;box-shadow:0 12px 30px rgba(0,0,0,.18)}${S} .header-cta{background:var(--dh-btn)!important;color:var(--dh-p)!important}`,
  wave: `${S}{margin-bottom:34px;border-bottom:0;overflow:visible}${S}::after{content:"";position:absolute;left:0;right:0;bottom:-33px;height:34px;background:var(--dh-bg);clip-path:polygon(0 0,100% 0,100% 30%,85% 70%,66% 38%,48% 76%,30% 40%,14% 74%,0 36%);pointer-events:none}`,
  compact: `${I}{min-height:48px}${S}{box-shadow:0 2px 12px rgba(0,0,0,.08)}${S} .logo-icon{width:28px;height:28px}`,
  cta: `${S}{--dh-bg:var(--dh-bg0);border-bottom:0}${S} .main-nav a{opacity:.62}${S} .header-cta{padding:13px 32px!important;font-size:1rem;box-shadow:0 10px 26px rgba(0,0,0,.18)}`,
  gradient: `${S}{--dh-bg:linear-gradient(rgba(0,0,0,.2),rgba(0,0,0,.2)),linear-gradient(100deg,var(--dh-p),var(--dh-p2));--dh-fg:var(--dh-btn);--dh-dbg:var(--dh-p);--dh-dfg:var(--dh-btn);border-bottom:0}${S} .header-cta{background:var(--dh-btn)!important;color:var(--dh-p)!important}`,
  paper: `${S}{--dh-bg:#f7f3ea;--dh-fg:#1b1710;--dh-bd:#1b1710;--dh-p:#8a1c1c;--dh-btn:#ffffff;border-bottom:3px double #1b1710}${S} .logo-text,${S} .logo{font-family:Georgia,'Times New Roman',serif}`,
  "lux-min": `${S}{--dh-bg:var(--dh-bg0);border-bottom:0}${S} .logo,${S} .logo-text{font-weight:400;letter-spacing:.42em;text-transform:uppercase}${S} .main-nav a{letter-spacing:.2em;text-transform:uppercase;font-size:.72rem}`,
  rail: "",
  edgeless: "",
};

// Families: the layout (desktop only).
const FAMILIES = {
  bar: `${DESK}{${S} .main-nav{margin-left:auto}${S} .header-actions{margin-left:0}}`,
  split: `${DESK}{${I}{display:grid!important;grid-template-columns:1fr auto 1fr;align-items:center}${S} .logo{order:2;font-size:1.4rem}${S} .main-nav{order:1;justify-self:start}${S} .header-actions{order:3;justify-self:end;margin:0}}`,
  center: `${DESK}{${I}{flex-wrap:wrap!important;justify-content:center!important;padding-top:14px;padding-bottom:8px;gap:4px 20px}${S} .logo{order:1;flex:0 0 100%;justify-content:center;font-size:1.4rem}${S} .main-nav{order:2;flex:0 0 100%;justify-content:center;margin:0}${S} .header-actions{position:absolute;right:20px;top:14px;margin:0}}`,
  tworow: `${DESK}{${I}{flex-wrap:wrap!important;row-gap:0}${S} .header-actions{order:-1;flex:0 0 100%;justify-content:flex-end;margin:0 0 6px;padding:6px 0;font-size:.8rem;background:var(--dh-tx);color:var(--dh-sf);box-shadow:0 0 0 100vmax var(--dh-tx);clip-path:inset(0 -100vmax)}${S} .header-actions .btn--ghost{color:var(--dh-sf)!important;padding:2px 12px;min-height:0}${S} .header-actions .search-box input{background:rgba(255,255,255,.14)!important;color:var(--dh-sf)!important;border-color:rgba(255,255,255,.3)!important;padding:4px 12px}${S} .header-actions .search-box input::placeholder{color:var(--dh-sf)!important}${S} .logo{order:1}${S} .main-nav{order:2;margin-left:auto}}`,
  announce: `body.dsp-f-announce .hh-announce{background:linear-gradient(90deg,var(--p,var(--theme-primary,#2563eb)),var(--p2,var(--theme-secondary,#7c3aed)))!important;color:var(--btn,#fff)!important}body.dsp-f-announce .hh-announce *{color:inherit!important}${DESK}{${S} .main-nav{margin-left:24px}${S} .header-actions{margin-left:auto}}`,
  mega: `${DESK}{${S} .main-nav{margin-left:auto}${S} .main-nav a{font-weight:700;padding:10px 14px}${S} .header-actions{margin-left:0}${S}{border-bottom:2px solid var(--dh-bd)}}`,
  sidebar: `@media(min-width:901px){${S}{position:fixed!important;left:0;top:0;bottom:0;width:220px;overflow-y:auto;border-bottom:0;border-right:1px solid var(--dh-bd);z-index:200}${I}{flex-direction:column;align-items:stretch!important;justify-content:flex-start!important;padding:24px 18px!important;gap:20px;min-height:100%}${S} .main-nav{flex-direction:column;margin:0}${S} .main-nav a{display:block}${S} .header-actions{flex-direction:column;align-items:stretch;margin:auto 0 0}body.dsp-f-sidebar{padding-left:220px}}`,
  search: `${DESK}{${I}{flex-wrap:wrap!important;row-gap:0}${S} .logo{order:1}${S} .header-actions{order:2;flex:1;margin:0 0 0 12px}${S} .search-box{flex:1}${S} .search-box input{width:100%!important;padding:12px 20px;border-radius:999px}${S} .main-nav{order:3;flex:0 0 100%;margin:0 0 8px}}`,
  editorial: `${DESK}{${I}{flex-wrap:wrap!important;justify-content:center!important;padding-top:10px;gap:0 20px}${S} .logo{order:1;flex:0 0 100%;justify-content:center}${S} .logo-text{font-family:Georgia,'Times New Roman',serif;font-size:clamp(2rem,4.6vw,3.2rem);font-weight:900;letter-spacing:-.5px;padding:8px 0 4px}${S} .main-nav{order:2;flex:0 0 100%;justify-content:center;margin:0;border-top:1px solid var(--dh-fg);padding:4px 0}${S} .main-nav a{text-transform:uppercase;letter-spacing:.12em;font-size:.76rem}${S} .header-actions{position:absolute;right:20px;top:10px;margin:0;font-size:.8rem}}`,
  floating: "",
};

export function liveHeaderCss(hdr) {
  // Headers that sit ON the hero stay in the normal page flow (so an announcement bar above them is never covered) and pull the hero up
  // underneath them with a negative margin; the header is exactly --hh tall (the pill adds its 16px top gap).
  const gap = hdr.skin === "pill" ? "(var(--hh,68px) + 16px)" : "var(--hh,68px)";
  const over = hdr.over
    ? `body.dsp-over:not(.dsp-no-over) .site-header{position:relative!important;margin-bottom:calc(-1 * ${gap});z-index:50}body.dsp-over:not(.dsp-no-over) .header-inner{height:var(--hh,68px)!important;min-height:0!important;box-sizing:border-box}body.dsp-over:not(.dsp-no-over) .lds-hero{padding-top:${gap}}body.dsp-no-over.dsp-has-header .site-header{position:relative!important;--dh-bg:var(--dh-sf);--dh-fg:var(--dh-tx);--dh-dbg:var(--dh-sf);--dh-dfg:var(--dh-tx);--dh-hfg:var(--dh-tx);background:var(--dh-sf)!important;border-bottom:1px solid var(--dh-bd);backdrop-filter:none;clip-path:none}`
    : "";
  return BASE + (SKINS[hdr.skin] || "") + (FAMILIES[hdr.family] || "") + over;
}
