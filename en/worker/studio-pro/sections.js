// Library 5: reusable homepage sections. 17 kinds with 2-3 variants each. A section is rendered from (kind, variant, context), so any
// theme can use any section and each one can take its own shape, surface, spacing and width from the shape library.
import { esc } from "./util.js";

export const SECTION_KINDS = [
  { id: "features", label: "Feature grid", variants: ["cards", "icons", "split"] },
  { id: "services", label: "Service cards", variants: ["tiles", "list"] },
  { id: "gallery", label: "Image gallery", variants: ["mosaic", "grid"] },
  { id: "testimonials", label: "Testimonials", variants: ["cards", "quote"] },
  { id: "stats", label: "Statistics", variants: ["band", "cards"] },
  { id: "logos", label: "Logo collection", variants: ["row"] },
  { id: "team", label: "Team", variants: ["cards", "circles"] },
  { id: "pricing", label: "Pricing", variants: ["three", "highlight"] },
  { id: "cta", label: "CTA banner", variants: ["band", "split", "card"] },
  { id: "articles", label: "Editorial article grid", variants: ["grid", "lead"] },
  { id: "news", label: "News layout", variants: ["columns", "ticker"] },
  { id: "casino-list", label: "Casino listing", variants: ["rows", "cards"] },
  { id: "comparison", label: "Comparison table", variants: ["table"] },
  { id: "reviews", label: "Review summary", variants: ["score", "bars"] },
  { id: "faq", label: "FAQ", variants: ["accordion", "two-col"] },
  { id: "newsletter", label: "Newsletter", variants: ["inline", "panel"] },
  { id: "footer", label: "Footer", variants: ["columns", "minimal", "dark"] },
];
export const SECTION_KIND_IDS = SECTION_KINDS.map((s) => s.id);
export const sectionVariants = (kind) => (SECTION_KINDS.find((s) => s.id === kind) || { variants: [] }).variants;

const hd = (c, t) => `<div class="lds-sec-h"><span class="lds-eyebrow">${esc(c.eyebrow)}</span><h2>${esc(t)}</h2></div>`;
const card = (c, i, extra = "") => `<div class="lds-c ${extra}"><i class="lds-ico">${i + 1}</i><b>${esc(c.cards[i % c.cards.length])}</b><span>${esc(c.tagline)}</span></div>`;
const three = (c, f) => [0, 1, 2].map((i) => f(i)).join("");
const tile = (c, i) => `<div class="lds-g lds-g${i}" style="background-image:linear-gradient(${135 + i * 40}deg,var(--p),var(--p2))"><b>${esc(c.cards[i % c.cards.length])}</b></div>`;

export function renderSection(kind, variant, c) {
  const v = sectionVariants(kind).includes(variant) ? variant : sectionVariants(kind)[0];
  let b = "";
  switch (kind) {
    case "features": b = v === "split" ? `<div class="lds-splitrow"><div>${hd(c, "Why choose us")}<p>${esc(c.sub)}</p></div><div class="lds-grid">${three(c, (i) => card(c, i))}</div></div>` : `${hd(c, "What you get")}<div class="lds-grid">${three(c, (i) => card(c, i, v === "icons" ? "lds-flat" : ""))}</div>`; break;
    case "services": b = `${hd(c, "Our services")}<div class="${v === "list" ? "lds-stackl" : "lds-grid"}">${three(c, (i) => card(c, i))}</div>`; break;
    case "gallery": b = `${hd(c, "Gallery")}<div class="lds-gal lds-gal-${v}">${[0, 1, 2, 3, 4].map((i) => tile(c, i)).join("")}</div>`; break;
    case "testimonials": b = `${hd(c, "What people say")}<div class="${v === "quote" ? "lds-bigq" : "lds-grid"}">${three(c, (i) => `<blockquote class="lds-c"><p>&ldquo;${esc(c.sub)}&rdquo;</p><cite>${esc(c.people[i])}</cite></blockquote>`)}</div>`; break;
    case "stats": b = `<div class="lds-statrow lds-stats-${v}">${three(c, (i) => `<div><b>${esc(c.stats[i][0])}</b><span>${esc(c.stats[i][1])}</span></div>`)}</div>`; break;
    case "logos": b = `<div class="lds-logos">${["Aurora", "Nimbus", "Vertex", "Kestrel", "Lumen", "Orbit"].map((n) => `<span>${n}</span>`).join("")}</div>`; break;
    case "team": b = `${hd(c, "The team")}<div class="lds-grid">${three(c, (i) => `<div class="lds-c lds-person ${v === "circles" ? "lds-round" : ""}"><i class="lds-av"></i><b>${esc(c.people[i])}</b><span>${esc(c.cards[i])}</span></div>`)}</div>`; break;
    case "pricing": b = `${hd(c, "Simple pricing")}<div class="lds-grid">${three(c, (i) => `<div class="lds-c lds-price${v === "highlight" && i === 1 ? " lds-hot" : i === 1 ? " lds-hot" : ""}"><b>${esc(c.cards[i])}</b><strong>$${(i + 1) * 19}</strong><span>${esc(c.tagline)}</span><a href="#" class="lds-btn">${esc(c.cta)}</a></div>`)}</div>`; break;
    case "cta": b = `<div class="lds-cta lds-cta-${v}"><div><h2>${esc(c.title)}</h2><p>${esc(c.sub)}</p></div><a href="#" class="lds-btn">${esc(c.cta)}</a></div>`; break;
    case "articles": b = `${hd(c, "Latest stories")}<div class="lds-arts lds-arts-${v}">${three(c, (i) => `<article class="lds-c">${tile(c, i)}<small>${esc(c.cards[i])}</small><h3>${esc(c.title)}</h3></article>`)}</div>`; break;
    case "news": b = v === "ticker" ? `<div class="lds-ticker"><b>LIVE</b>${c.cards.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : `${hd(c, "Top stories")}<div class="lds-newscols">${three(c, (i) => `<div><small>0${i + 1}</small><h3>${esc(c.cards[i])}</h3><span>${esc(c.tagline)}</span></div>`)}</div>`; break;
    case "casino-list": b = `${hd(c, "Top rated casinos")}<div class="${v === "cards" ? "lds-grid" : "lds-stackl"}">${three(c, (i) => `<div class="lds-c lds-casino"><i class="lds-ico">${i + 1}</i><div><b>${esc(c.people[i])}</b><span>${"&#9733;".repeat(5 - (i === 2 ? 1 : 0))} &middot; ${esc(c.offer)}</span></div><a href="#" class="lds-btn">${esc(c.cta)}</a></div>`)}</div>`; break;
    case "comparison": b = `${hd(c, "Compare at a glance")}<div class="lds-tablewrap"><table class="lds-table"><thead><tr><th>Name</th><th>Rating</th><th>Offer</th><th></th></tr></thead><tbody>${three(c, (i) => `<tr><td>${esc(c.people[i])}</td><td>${(4.9 - i * 0.2).toFixed(1)}</td><td>${esc(c.offer)}</td><td><a href="#" class="lds-btn">${esc(c.cta)}</a></td></tr>`)}</tbody></table></div>`; break;
    case "reviews": b = `${hd(c, "Review summary")}<div class="lds-rev lds-rev-${v}"><div class="lds-score2"><b>4.8</b><span>${"&#9733;".repeat(5)}</span></div><div class="lds-bars">${[92, 78, 64].map((n, i) => `<div><span>${esc(c.cards[i])}</span><i style="--n:${n}%"></i></div>`).join("")}</div></div>`; break;
    case "faq": b = `${hd(c, "Questions, answered")}<div class="lds-faq lds-faq-${v}">${three(c, (i) => `<details${i === 0 ? " open" : ""}><summary>${esc(c.cards[i])}?</summary><p>${esc(c.sub)}</p></details>`)}</div>`; break;
    case "newsletter": b = `<div class="lds-news-sub lds-nl-${v}"><div><h2>Stay in the loop</h2><p>${esc(c.tagline)}</p></div><div class="lds-nlform"><input type="email" placeholder="you@example.com" tabindex="-1"><a href="#" class="lds-btn">Subscribe</a></div></div>`; break;
    case "footer": b = `<footer class="lds-foot lds-foot-${v}"><div class="lds-footgrid"><div><b class="lds-fl">${esc(c.name)}</b><p>${esc(c.tagline)}</p></div>${["Explore", "Company", "Legal"].map((t, i) => `<div><b>${t}</b>${c.nav.slice(i, i + 3).map((n) => `<a href="#">${esc(n)}</a>`).join("")}</div>`).join("")}</div><div class="lds-copy-r">&copy; ${esc(c.name)}</div></footer>`; break;
    default: return "";
  }
  return kind === "footer" ? b : `<section class="lds-sec lds-s-${esc(kind)}" data-section="${esc(kind)}" data-variant="${esc(v)}"><div class="lds-secin">${b}</div></section>`;
}

export function sectionCss() {
  return `
.lds-sec{padding:var(--sp,72px) 0;font-family:var(--bf);color:var(--tx)}.lds-secin{max-width:var(--w);margin:0 auto;padding:0 22px}
.lds-sec-h{margin-bottom:34px}.lds-eyebrow{font-size:.74rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--p)}.lds-sec h2{font-family:var(--hf);font-size:clamp(1.6rem,3.6vw,2.5rem);margin:.25em 0}
.lds-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}.lds-stackl{display:flex;flex-direction:column;gap:14px}
.lds-c{background:var(--sf);border:1px solid var(--bd);border-radius:var(--cr);padding:24px;display:flex;flex-direction:column;gap:8px;box-shadow:var(--sh,none)}.lds-c span{opacity:.75;font-size:.92rem}.lds-flat{background:transparent;border:0;box-shadow:none;padding:6px 0}
.lds-ico{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,var(--p),var(--p2));color:var(--btn);display:grid;place-items:center;font-style:normal;font-weight:800}
.lds-splitrow{display:grid;grid-template-columns:1fr 2fr;gap:40px;align-items:center}
.lds-gal{display:grid;gap:14px;grid-template-columns:repeat(4,1fr);grid-auto-rows:150px}.lds-gal-mosaic .lds-g0{grid-column:span 2;grid-row:span 2}.lds-gal-mosaic .lds-g3{grid-column:span 2}.lds-g{border-radius:var(--cr);display:flex;align-items:flex-end;padding:14px;color:#fff;font-weight:700;min-height:0}
.lds-bigq{display:grid;gap:18px}.lds-bigq blockquote{font-family:Georgia,serif;font-size:1.3rem;border-left:4px solid var(--p);border-radius:0}.lds-c cite{font-style:normal;font-weight:700;font-size:.86rem;opacity:.8}.lds-c blockquote,blockquote.lds-c{margin:0}
.lds-statrow{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;text-align:center}.lds-statrow b{display:block;font-family:var(--hf);font-size:clamp(2rem,5vw,3.4rem);color:var(--p)}.lds-stats-band{background:linear-gradient(100deg,var(--p),var(--p2));color:var(--btn);border-radius:var(--cr);padding:34px}.lds-stats-band b{color:inherit}.lds-stats-cards>div{background:var(--sf);border:1px solid var(--bd);border-radius:var(--cr);padding:24px}
.lds-logos{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;opacity:.55;font-weight:800;font-size:1.2rem;letter-spacing:.08em;text-transform:uppercase}
.lds-person{align-items:center;text-align:center}.lds-av{width:84px;height:84px;border-radius:30%;background:linear-gradient(135deg,var(--p2),var(--p))}.lds-round .lds-av{border-radius:50%}
.lds-price strong{font-family:var(--hf);font-size:2.4rem}.lds-hot{border:2px solid var(--p);transform:translateY(-8px)}
.lds-cta{display:flex;gap:30px;align-items:center;justify-content:space-between;padding:42px;border-radius:var(--cr);background:linear-gradient(110deg,var(--p),var(--p2));color:var(--btn)}.lds-cta .lds-btn{background:var(--btn);color:var(--p)}.lds-cta h2{margin:0}.lds-cta p{margin:6px 0 0;opacity:.9}.lds-cta-split{background:var(--tx);color:var(--bg)}.lds-cta-card{background:var(--sf);color:var(--tx);border:1px solid var(--bd);box-shadow:var(--sh,0 20px 50px rgba(0,0,0,.12))}.lds-cta-card .lds-btn{background:var(--p);color:var(--btn)}
.lds-arts{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}.lds-arts-lead article:first-child{grid-column:span 3}.lds-arts .lds-g{min-height:150px;margin-bottom:6px}.lds-arts h3{margin:.2em 0;font-family:var(--hf)}.lds-arts small{color:var(--p);font-weight:800;text-transform:uppercase;letter-spacing:.1em}
.lds-newscols{display:grid;grid-template-columns:repeat(3,1fr);gap:0}.lds-newscols>div{padding:0 22px;border-left:1px solid var(--bd)}.lds-newscols>div:first-child{border-left:0;padding-left:0}.lds-newscols small{color:var(--p);font-weight:800}.lds-newscols h3{font-family:Georgia,serif;margin:.3em 0}
.lds-ticker{display:flex;gap:30px;overflow:hidden;white-space:nowrap;background:var(--tx);color:var(--bg);padding:12px 20px;border-radius:var(--cr);font-size:.9rem}.lds-ticker b{background:var(--p);color:var(--btn);padding:0 10px;border-radius:4px}
.lds-casino{flex-direction:row;align-items:center;gap:16px}.lds-casino>div{flex:1;display:flex;flex-direction:column}.lds-casino span{color:var(--p)}
.lds-tablewrap{overflow-x:auto}.lds-table{width:100%;border-collapse:collapse;background:var(--sf);border-radius:var(--cr);overflow:hidden}.lds-table th{text-align:left;font-size:.76rem;text-transform:uppercase;letter-spacing:.1em;opacity:.7}.lds-table th,.lds-table td{padding:14px 18px;border-bottom:1px solid var(--bd)}
.lds-rev{display:grid;grid-template-columns:200px 1fr;gap:30px;align-items:center}.lds-score2{background:var(--sf);border:1px solid var(--bd);border-radius:var(--cr);padding:24px;text-align:center}.lds-score2 b{font-family:var(--hf);font-size:3.4rem;display:block;color:var(--p)}.lds-bars div{display:grid;grid-template-columns:130px 1fr;gap:12px;align-items:center;margin:10px 0;font-size:.88rem}.lds-bars i{height:9px;border-radius:9px;background:var(--bd);position:relative;overflow:hidden}.lds-bars i::after{content:"";position:absolute;inset:0;width:var(--n);background:linear-gradient(90deg,var(--p),var(--p2))}
.lds-faq details{background:var(--sf);border:1px solid var(--bd);border-radius:var(--cr);padding:16px 20px;margin-bottom:10px}.lds-faq summary{font-weight:700;cursor:pointer}.lds-faq-two-col{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}
.lds-news-sub{display:flex;justify-content:space-between;align-items:center;gap:30px;flex-wrap:wrap;padding:40px;border-radius:var(--cr);background:var(--sf);border:1px solid var(--bd)}.lds-nl-panel{background:linear-gradient(120deg,var(--p),var(--p2));color:var(--btn)}.lds-nl-panel .lds-btn{background:var(--btn);color:var(--p)}.lds-nlform{display:flex;gap:8px}.lds-nlform input{padding:12px 16px;border-radius:var(--br);border:1px solid var(--bd);font:inherit;min-width:0}
.lds-foot{background:var(--ft,#0b1020);color:#e8ecf5;padding:56px 22px 24px;font-family:var(--bf)}.lds-footgrid{max-width:var(--w);margin:0 auto;display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:30px}.lds-footgrid a{display:block;color:inherit;opacity:.7;text-decoration:none;margin:6px 0}.lds-fl{font-size:1.2rem}.lds-copy-r{max-width:var(--w);margin:30px auto 0;padding-top:18px;border-top:1px solid rgba(255,255,255,.14);font-size:.8rem;opacity:.6}
.lds-foot-minimal{background:var(--bg);color:var(--tx);border-top:1px solid var(--bd)}.lds-foot-minimal .lds-footgrid{grid-template-columns:1fr}.lds-foot-minimal .lds-footgrid>div:not(:first-child){display:none}.lds-foot-dark{background:#050505;color:#d9c48a}
@media(max-width:900px){.lds-grid,.lds-arts,.lds-newscols,.lds-statrow{grid-template-columns:1fr}.lds-splitrow,.lds-rev{grid-template-columns:1fr}.lds-gal{grid-template-columns:repeat(2,1fr)}.lds-arts-lead article:first-child{grid-column:auto}.lds-newscols>div{border-left:0;padding:12px 0;border-top:1px solid var(--bd)}.lds-footgrid{grid-template-columns:1fr 1fr}.lds-cta{flex-direction:column;align-items:flex-start}.lds-faq-two-col{grid-template-columns:1fr}.lds-hot{transform:none}}
`;
}
