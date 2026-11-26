// Allow-lists and hard caps shared by validation, rendering and the admin screen.
export const MODES = {
  floating: ["bottom-right", "bottom-left", "top-right", "top-left", "center"],
  edge: ["left", "right", "top", "bottom"],
  bar: ["top", "bottom"],
  inline: ["after_header", "before_main", "after_main", "sidebar", "top", "content_bottom", "bottom"],
};
export const ENTRANCE = ["none", "slide-left", "slide-right", "slide-up", "slide-down", "fade", "zoom", "bounce"];
export const LOOP = ["none", "pulse", "shimmer", "float", "wiggle", "marquee", "typewriter"];
export const TRIGGERS = ["immediate", "delay", "scroll", "exit"];
export const FREQUENCY = ["every", "session", "days"];
export const DEVICES = ["desktop", "tablet", "mobile"];
export const PRESETS = { s: { w: 280, h: 0 }, m: { w: 360, h: 0 }, l: { w: 480, h: 0 }, full: { w: 100, h: 0 } };
export const SOURCES = ["casino", "news", "research", "author", "update", "sportsbook", "affiliate_partner", "custom", "media", "slide"];
export const MAX_ITEMS = 12;
export const MAX_LIVE = 50;
export const MAX_PER_ANCHOR_CAP = 3;
export const JSON_CAPS = { width: 400, height: 400, style: 1200, motion: 600, trigger: 300, frequency: 300, targeting: 3000, content: 6000, items: 30000 };
export const SIZE_LIMITS = { px: [120, 1200], "%": [10, 100], vw: [10, 100] };
export const HEIGHT_LIMITS = { px: [40, 900], "%": [5, 100], vw: [5, 100] };

// Slider (hero / home banner) settings. Every list is an allow-list; numbers are clamped by validate-slider.js.
export const SLIDER = {
  transitions: ["fade", "slide", "zoom", "kenburns"],
  ratios: ["16:9", "21:9", "3:1", "4:1", "2:1", "3:2", "4:3", "1:1"],
  mobileRatios: ["same", "16:9", "3:2", "4:3", "1:1", "3:4"],
  overlays: ["none", "soft", "strong"],
  textPos: ["left", "center", "right"],
  fits: ["cover", "contain"],
  navs: ["dots", "bars", "none"],
  interval: [2, 30],
  speed: [200, 2000],
  duration: [2, 60],
  maxSlides: 10,
};
export const SLIDER_DEFAULTS = { autoplay: true, interval: 6, transition: "fade", speed: 600, pause_hover: true, loop: true, arrows: true, nav: "dots", progress: true, counter: false, swipe: true, keyboard: true,
  ratio: "2:1", mobile_ratio: "same", fit: "cover", overlay: "soft", ad_label: false, ad_text: "Ad" };
