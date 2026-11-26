// Validation for the slider template: banner-level settings (content.slider) and per-slide overrides.
import { safeUrl, safeImage } from "./escape.js";
import { SLIDER, SLIDER_DEFAULTS as D } from "./limits.js";
import { oneOf, num, txt, strict, dateOf } from "./validate-util.js";

const SETTING_KEYS = Object.keys(D);
const flag = (v, d) => (v === undefined || v === null ? d : v === true || v === 1 || v === "1" || v === "true");

/** content.slider -> a complete, clamped settings object (missing keys get the defaults). */
export function sliderConfig(v, errs = []) {
  const o = strict(v, SETTING_KEYS, "content.slider", errs);
  return {
    autoplay: flag(o.autoplay, D.autoplay), interval: num(o.interval, SLIDER.interval[0], SLIDER.interval[1], D.interval),
    transition: oneOf(o.transition, SLIDER.transitions, D.transition), speed: num(o.speed, SLIDER.speed[0], SLIDER.speed[1], D.speed),
    pause_hover: flag(o.pause_hover, D.pause_hover), loop: flag(o.loop, D.loop), arrows: flag(o.arrows, D.arrows),
    nav: oneOf(o.nav, SLIDER.navs, D.nav), progress: flag(o.progress, D.progress), counter: flag(o.counter, D.counter),
    swipe: flag(o.swipe, D.swipe), keyboard: flag(o.keyboard, D.keyboard),
    ratio: oneOf(o.ratio, SLIDER.ratios, D.ratio), mobile_ratio: oneOf(o.mobile_ratio, SLIDER.mobileRatios, D.mobile_ratio),
    fit: oneOf(o.fit, SLIDER.fits, D.fit), overlay: oneOf(o.overlay, SLIDER.overlays, D.overlay),
    ad_label: flag(o.ad_label, D.ad_label), ad_text: txt(o.ad_text, 12) || D.ad_text,
  };
}

export const SLIDE_KEYS = ["label", "subtitle", "badge", "image", "image_mobile", "alt", "url", "cta_label", "new_tab", "text_pos", "duration", "sponsored", "start_at", "end_at"];

/** Per-slide fields. Links must be /path, https:// or mailto:; pictures Media library or https://. Empty values are dropped. */
export function slideOverrides(ov, errs) {
  const o = strict(ov, SLIDE_KEYS, "slide", errs);
  const out = { label: txt(o.label, 120), badge: txt(o.badge, 30), image: "", url: "" };
  if (o.subtitle) out.subtitle = txt(o.subtitle, 200);
  if (o.alt) out.alt = txt(o.alt, 160);
  if (o.cta_label) out.cta_label = txt(o.cta_label, 40);
  if (o.image) { out.image = safeImage(o.image); if (!out.image) errs.push("slide picture: Media library or https:// only"); }
  if (o.image_mobile) { const m = safeImage(o.image_mobile); if (m) out.image_mobile = m; else errs.push("slide phone picture: Media library or https:// only"); }
  if (o.url) { out.url = safeUrl(o.url); if (!out.url) errs.push("slide link: /path, https:// or mailto: only"); }
  if (flag(o.new_tab, false)) out.new_tab = true;
  if (flag(o.sponsored, false)) out.sponsored = true;
  if (o.text_pos) out.text_pos = oneOf(o.text_pos, SLIDER.textPos, "left");
  if (o.duration !== undefined && o.duration !== "" && o.duration !== null) out.duration = num(o.duration, SLIDER.duration[0], SLIDER.duration[1], SLIDER.duration[0]);
  const a = dateOf(o.start_at, "slide start", errs), z = dateOf(o.end_at, "slide end", errs);
  if (a) out.start_at = a;
  if (z) out.end_at = z;
  if (a && z && z < a) errs.push("slide end must be after its start");
  return out;
}
