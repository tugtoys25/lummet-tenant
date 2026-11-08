// Template registry: one entry per ready-made banner. Each render() is pure and returns escaped HTML.
import { renderPromo, renderImage, renderMarquee, renderCountdown, renderStat } from "./tpl-basic.js";
import { renderSpotlight, renderTable, renderCarousel, renderSlider } from "./tpl-items.js";
import { renderChat, renderRobot } from "./tpl-fun.js";

const meta = (key, label, o) => ({ key, label, required: [], sources: [], maxItems: 0, size: "m", mode: "floating", anchor: "bottom-right", entrance: "slide-up", loop: "none", ...o });

export const TEMPLATES = {
  promo_card: meta("promo_card", "Promo card", { required: ["headline", "cta_label", "link"], render: renderPromo }),
  image_banner: meta("image_banner", "Image banner", { required: ["image", "link"], size: "l", render: renderImage }),
  casino_spotlight: meta("casino_spotlight", "Casino spotlight", { sources: ["casino"], maxItems: 1, loop: "pulse", render: renderSpotlight }),
  casino_table: meta("casino_table", "Casino table (top N)", { sources: ["casino"], maxItems: 10, size: "l", mode: "inline", anchor: "after_header", entrance: "fade", render: renderTable }),
  news_carousel: meta("news_carousel", "News ticker / carousel", { sources: ["news"], maxItems: 12, size: "full", mode: "bar", anchor: "top", entrance: "fade", render: renderCarousel }),
  slider: meta("slider", "Slider", { sources: ["slide"], maxItems: 8, size: "l", entrance: "fade", render: renderSlider }),
  chat: meta("chat", "Chat-style", { required: ["messages"], loop: "typewriter", render: renderChat }),
  robot: meta("robot", "Robot mascot", { required: ["headline"], loop: "float", render: renderRobot }),
  marquee: meta("marquee", "Marquee strip", { required: ["marquee_text"], size: "full", mode: "bar", anchor: "top", loop: "marquee", entrance: "fade", render: renderMarquee }),
  countdown: meta("countdown", "Countdown offer", { required: ["headline", "countdown_end"], loop: "pulse", render: renderCountdown }),
  stat_card: meta("stat_card", "Stat / table card", { required: ["rows"], render: renderStat }),
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES);

/** Public (JSON-safe) description of the registry for the admin screen. */
export function templateInfo() {
  return Object.values(TEMPLATES).map(({ render, ...rest }) => rest);
}

/** ctx: { c: content, items: resolved cards, b: banner } -> escaped HTML inner markup */
export function renderTemplate(key, ctx) {
  const t = TEMPLATES[key];
  return t ? t.render(ctx) : "";
}
