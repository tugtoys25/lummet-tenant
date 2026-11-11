// Library 4: Hero Studio. 30 heroes, each with its own markup structure (not a re-coloured copy). Pictures are inline SVG scenes,
// so nothing can break. A tenant picture (from their media library) replaces the scene when one is supplied and validated.
import { esc, art } from "./util.js";

const E = (id, label, desc, scene, tags = [], extra = {}) => ({ id, label, desc, scene, tags, dark: false, ...extra });
export const HEROES = [
  E("photo-wide", "Full-width photographic", "A wide picture with a left-aligned headline.", "skyline", ["photo", "full-width"], { dark: true }),
  E("fullscreen", "Full-screen image", "Fills the whole screen with a scroll cue.", "mountains", ["photo", "full-screen"], { dark: true }),
  E("split-half", "Split screen", "Text on one half, picture bleeding off the other.", "interior", ["split"]),
  E("image-left", "Image left, text right", "Framed picture on the left.", "portrait", ["split"]),
  E("image-right", "Text left, image right", "Text with a picture and a floating stat.", "skyline", ["split"]),
  E("centred-type", "Centred typography", "Large centred headline on a clean ground.", "waves", ["type", "centred"]),
  E("video-bg", "Video background", "Moving backdrop with a play button.", "stadium", ["video"], { dark: true }),
  E("gradient-mesh", "Gradient background", "Soft mesh gradient with blobs.", "waves", ["gradient"], { dark: true }),
  E("dark-luxury", "Dark luxury", "Black, gold rules and a serif headline.", "interior", ["luxury", "dark"], { dark: true }),
  E("minimal-white", "Minimal white", "Quiet, airy and typographic.", "mountains", ["minimal"]),
  E("overlap-images", "Overlapping images", "Two pictures overlapping beside the text.", "interior", ["overlap"]),
  E("floating-cards", "Floating image cards", "Text with three drifting cards.", "cards", ["cards"]),
  E("asym-editorial", "Asymmetrical editorial", "Giant headline overlapping a tall picture.", "portrait", ["editorial", "asymmetric"]),
  E("magazine-cover", "Magazine cover", "Masthead, issue tag and cover lines.", "portrait", ["magazine", "editorial"], { dark: true }),
  E("diagonal-split", "Diagonal split", "A slanted divider between text and picture.", "skyline", ["diagonal", "angled"]),
  E("curved-image", "Curved image", "Picture with a large curved edge.", "waves", ["curved"]),
  E("rounded-frame", "Rounded image frame", "Picture in a rounded frame with an offset border.", "interior", ["rounded"]),
  E("circle-composition", "Circular composition", "One big circle with satellites.", "portrait", ["circle"]),
  E("layered-image", "Layered images", "Tilted pictures stacked in depth.", "mountains", ["layered"]),
  E("big-type", "Large typography", "Oversized outlined words.", "skyline", ["type"], { dark: true }),
  E("product-showcase", "Product showcase", "Product on a pedestal with feature callouts.", "plate", ["product", "shop"]),
  E("casino-promo", "Casino promotional", "Bonus offer card with code and badges.", "cards", ["casino", "promo"], { dark: true }),
  E("news-headline", "News headline", "Lead story plus a column of headlines.", "skyline", ["news"]),
  E("sports-editorial", "Sports editorial", "Scoreboard strip and a feature story.", "stadium", ["sports", "editorial"], { dark: true }),
  E("collage", "Multi-image collage", "A grid of five pictures around the text.", "interior", ["collage"]),
  E("three-column", "Three-column", "Three panels, headline in the middle.", "mountains", ["columns"]),
  E("floating-stats", "Floating statistics", "Headline with floating number bubbles.", "waves", ["stats"]),
  E("feature-cards", "Feature cards", "Cards overlapping the bottom edge.", "skyline", ["cards", "features"], { dark: true }),
  E("search-hero", "Search interface", "A big search box with quick filters.", "mountains", ["search"], { dark: true }),
  E("cta-panels", "Integrated CTA panels", "Two big action panels under the headline.", "skyline", ["cta"], { dark: true }),
];
export const HERO_IDS = HEROES.map((h) => h.id);
export const getHero = (id) => HEROES.find((h) => h.id === id) || HEROES[0];

const img = (c, kind, cls = "", p = c.p, p2 = c.p2) => c.image
  ? `<div class="lds-img ${cls}" style="background-image:url('${esc(c.image)}')" role="img" aria-label="${esc(c.imageAlt || "")}"></div>`
  : `<div class="lds-img ${cls}" style="background-image:${art(kind, c.sceneBg, p2)}" aria-hidden="true"></div>`;
// Links come from the site (c.ctaUrl / c.cta2Url). Anything the site leaves empty is simply not drawn.
const href = (u) => esc(/^(https?:\/\/|\/|#)[^\s"'<>]*$/.test(u || "") ? u : "#");
const btns = (c, ghost = true) => { const a = c.cta ? `<a href="${href(c.ctaUrl)}" class="lds-btn">${esc(c.cta)}</a>` : "", b = ghost && c.cta2 ? `<a href="${href(c.cta2Url)}" class="lds-btn lds-ghost">${esc(c.cta2)}</a>` : ""; return a || b ? `<div class="lds-btns">${a}${b}</div>` : ""; };
const copy = (c, extra = "") => `<div class="lds-copy">${c.badge ? `<span class="lds-badge">${esc(c.badge)}</span>` : ""}${c.title ? `<h1>${esc(c.title)}</h1>` : ""}${c.sub ? `<p>${esc(c.sub)}</p>` : ""}${extra}${btns(c)}</div>`;
const stat = (c, i) => (c.stats && c.stats[i] ? `<div class="lds-stat"><b>${esc(c.stats[i][0])}</b><span>${esc(c.stats[i][1])}</span></div>` : "");
const cards = c => (Array.isArray(c.cards) ? c.cards : []);

export function renderHero(id, c) {
  const h = getHero(id);
  let b;
  switch (h.id) {
    case "photo-wide": b = `${img(c, h.scene, "lds-bg")}<div class="lds-shade"></div><div class="lds-wrap">${copy(c)}</div>`; break;
    case "fullscreen": b = `${img(c, h.scene, "lds-bg")}<div class="lds-shade"></div><div class="lds-wrap">${copy(c)}</div><a href="#" class="lds-cue" aria-label="Scroll">&darr;</a>`; break;
    case "split-half": b = `<div class="lds-half"><div class="lds-wrap">${copy(c)}</div></div>${img(c, h.scene, "lds-half-img")}`; break;
    case "image-left": b = `<div class="lds-wrap lds-2">${img(c, h.scene, "lds-frame")}${copy(c)}</div>`; break;
    case "image-right": b = `<div class="lds-wrap lds-2">${copy(c)}<div class="lds-pos">${img(c, h.scene, "lds-frame")}${stat(c, 0).replace("lds-stat", "lds-stat lds-chip")}</div></div>`; break;
    case "centred-type": b = `<div class="lds-wrap lds-ctr">${copy(c)}</div>`; break;
    case "video-bg": b = `<div class="lds-motion" aria-hidden="true"></div>${img(c, h.scene, "lds-bg lds-dim")}<div class="lds-shade"></div><div class="lds-wrap lds-ctr">${copy(c)}${c.live ? "" : `<button type="button" class="lds-play" tabindex="-1" aria-label="Play video">&#9654;</button>`}</div>`; break;
    case "gradient-mesh": b = `<i class="lds-blob lds-b1"></i><i class="lds-blob lds-b2"></i><div class="lds-wrap lds-ctr">${copy(c)}</div>`; break;
    case "dark-luxury": b = `<div class="lds-wrap lds-ctr"><div class="lds-rule"></div>${copy(c)}<div class="lds-rule"></div></div>`; break;
    case "minimal-white": b = `<div class="lds-wrap lds-ctr">${copy(c)}<hr class="lds-hair"></div>`; break;
    case "overlap-images": b = `<div class="lds-wrap lds-2">${copy(c)}<div class="lds-ov">${img(c, "interior", "lds-ov1")}${img(c, "plate", "lds-ov2")}</div></div>`; break;
    case "floating-cards": b = `<div class="lds-wrap lds-2">${copy(c)}<div class="lds-float">${[0, 1, 2].filter((i) => !c.live || cards(c)[i]).map((i) => `<div class="lds-fc lds-fc${i}">${img(c, ["cards", "plate", "waves"][i], "lds-fc-i")}${cards(c)[i] ? `<b>${esc(cards(c)[i])}</b>` : ""}</div>`).join("")}</div></div>`; break;
    case "asym-editorial": b = `<div class="lds-wrap lds-asym">${img(c, h.scene, "lds-tall")}<div class="lds-giant"><span class="lds-badge">${esc(c.badge)}</span><h1>${esc(c.title)}</h1></div><div class="lds-aside"><p>${esc(c.sub)}</p>${btns(c)}</div></div>`; break;
    case "magazine-cover": b = `${img(c, h.scene, "lds-bg")}<div class="lds-shade"></div><div class="lds-wrap lds-mag">${c.live ? "" : `<div class="lds-issue">${esc(c.date)} &middot; ISSUE 24</div>`}${c.title ? `<h1>${esc(c.title)}</h1>` : ""}${cards(c).length ? `<ul class="lds-lines">${cards(c).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${btns(c, false)}</div>`; break;
    case "diagonal-split": b = `<div class="lds-diag-img">${img(c, h.scene, "lds-bg")}</div><div class="lds-wrap"><div class="lds-diag-copy">${copy(c)}</div></div>`; break;
    case "curved-image": b = `<div class="lds-wrap lds-2">${copy(c)}${img(c, h.scene, "lds-curve")}</div>`; break;
    case "rounded-frame": b = `<div class="lds-wrap lds-2">${copy(c)}<div class="lds-offset">${img(c, h.scene, "lds-rframe")}</div></div>`; break;
    case "circle-composition": b = `<div class="lds-wrap lds-2">${copy(c)}<div class="lds-orbit">${img(c, h.scene, "lds-circ")}<i class="lds-dot lds-d1"></i><i class="lds-dot lds-d2"></i><i class="lds-dot lds-d3"></i></div></div>`; break;
    case "layered-image": b = `<div class="lds-wrap lds-2">${copy(c)}<div class="lds-stack">${img(c, "mountains", "lds-l1")}${img(c, "skyline", "lds-l2")}${img(c, "waves", "lds-l3")}</div></div>`; break;
    case "big-type": b = `${img(c, h.scene, "lds-bg lds-dim")}<div class="lds-wrap">${c.title ? `<div class="lds-bigtype">${esc(c.title)}</div>` : ""}<div class="lds-row2">${c.sub ? `<p>${esc(c.sub)}</p>` : ""}${btns(c, false)}</div></div>`; break;
    case "product-showcase": b = `<div class="lds-wrap lds-3">${copy(c)}<div class="lds-pedestal">${img(c, h.scene, "lds-prod")}${cards(c)[0] ? `<span class="lds-call lds-c1">${esc(cards(c)[0])}</span>` : ""}${cards(c)[1] ? `<span class="lds-call lds-c2">${esc(cards(c)[1])}</span>` : ""}</div></div>`; break;
    case "casino-promo": b = `<div class="lds-wrap lds-2">${copy({ ...c, cta: c.live ? "" : c.cta, cta2: "" })}${c.live ? (c.cta ? `<div class="lds-offer"><a href="${href(c.ctaUrl)}" class="lds-btn">${esc(c.cta)}</a></div>` : "") : `<div class="lds-offer"><small>${esc(c.offerLabel)}</small><strong>${esc(c.offer)}</strong><span class="lds-code">${esc(c.code)}</span><a href="#" class="lds-btn">${esc(c.cta)}</a><em>18+ &middot; T&amp;Cs apply</em></div>`}</div>`; break;
    case "news-headline": b = `<div class="lds-wrap lds-news"><article class="lds-lead">${img(c, h.scene, "lds-leadimg")}${c.badge ? `<span class="lds-badge">${esc(c.badge)}</span>` : ""}${c.title ? `<h1>${esc(c.title)}</h1>` : ""}${c.sub ? `<p>${esc(c.sub)}</p>` : ""}</article>${cards(c).length ? `<aside class="lds-heads">${cards(c).map((x, i) => `<a href="#"><small>0${i + 1}</small>${esc(x)}</a>`).join("")}</aside>` : ""}</div>`; break;
    case "sports-editorial": b = `${img(c, h.scene, "lds-bg lds-dim")}<div class="lds-shade"></div><div class="lds-wrap">${c.live ? "" : `<div class="lds-score"><span>${esc(cards(c)[0])}</span><b>2 : 1</b><span>${esc(cards(c)[1])}</span><em>FT</em></div>`}${copy(c)}</div>`; break;
    case "collage": b = `<div class="lds-wrap lds-coll">${copy(c)}<div class="lds-grid5">${["skyline", "plate", "cards", "waves", "mountains"].map((k, i) => img(c, k, `lds-t lds-t${i}`)).join("")}</div></div>`; break;
    case "three-column": b = `<div class="lds-wrap lds-cols">${img(c, "mountains", "lds-col")}<div class="lds-mid">${copy(c)}</div>${img(c, "skyline", "lds-col")}</div>`; break;
    case "floating-stats": b = `<div class="lds-wrap lds-2">${copy(c)}${c.stats && c.stats.length ? `<div class="lds-bubbles">${[0, 1, 2].map((i) => `<div class="lds-bub lds-bub${i}">${stat(c, i)}</div>`).join("")}</div>` : ""}</div>`; break;
    case "feature-cards": b = `${img(c, h.scene, "lds-bg")}<div class="lds-shade"></div><div class="lds-wrap">${copy(c)}<div class="lds-fcards">${cards(c).map((x) => `<div><i></i><b>${esc(x)}</b>${c.live ? "" : `<span>${esc(c.tagline)}</span>`}</div>`).join("")}</div></div>`; break;
    case "search-hero": b = `${img(c, h.scene, "lds-bg lds-dim")}<div class="lds-shade"></div><div class="lds-wrap lds-ctr">${c.badge ? `<span class="lds-badge">${esc(c.badge)}</span>` : ""}${c.title ? `<h1>${esc(c.title)}</h1>` : ""}${c.live ? "" : `<div class="lds-searchbox"><input type="search" placeholder="${esc(c.search)}" tabindex="-1"><a href="#" class="lds-btn">Search</a></div>`}${cards(c).length ? `<div class="lds-chips">${cards(c).map((x) => `<a href="#">${esc(x)}</a>`).join("")}</div>` : ""}${c.live ? btns(c) : ""}</div>`; break;
    case "cta-panels": b = `${img(c, h.scene, "lds-bg lds-dim")}<div class="lds-shade"></div><div class="lds-wrap lds-ctr">${c.title ? `<h1>${esc(c.title)}</h1>` : ""}${c.sub ? `<p>${esc(c.sub)}</p>` : ""}${c.cta || c.cta2 ? `<div class="lds-panels">${c.cta ? `<a href="${href(c.ctaUrl)}"><b>${esc(c.cta)}</b>${cards(c)[0] ? `<span>${esc(cards(c)[0])}</span>` : ""}</a>` : ""}${c.cta2 ? `<a href="${href(c.cta2Url)}"><b>${esc(c.cta2)}</b>${cards(c)[1] ? `<span>${esc(cards(c)[1])}</span>` : ""}</a>` : ""}</div>` : ""}</div>`; break;
    default: b = copy(c);
  }
  return `<section class="lds-hero lds-hv-${esc(h.id)}${h.dark ? " lds-dark" : ""}" data-hero="${esc(h.id)}">${b}</section>`;
}
