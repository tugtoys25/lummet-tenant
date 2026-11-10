// LIBRARY 5 (part 1) - SHAPE STUDIO. Reusable, independently configurable decorative shapes.
// Static CSS scoped to .ds-shape--<id>; configurable through validated CSS variables --ds-shape-size/-color/-rotate.
const S = (id, name, group, css) => ({ id, name, group, css });
export const SHAPES = [
  S("rectangle", "Rectangle", "Basic", "border-radius:0"),
  S("rounded-rect", "Rounded Rectangle", "Basic", "border-radius:var(--ds-radius,20px)"),
  S("circle", "Circle", "Basic", "border-radius:50%;aspect-ratio:1"),
  S("ellipse", "Ellipse", "Basic", "border-radius:50%;aspect-ratio:1.6"),
  S("trapezoid", "Trapezoid", "Angular", "clip-path:polygon(14% 0,86% 0,100% 100%,0 100%)"),
  S("arch", "Arch", "Curved", "border-radius:999px 999px 0 0"),
  S("organic-blob", "Organic Blob", "Curved", "border-radius:63% 37% 54% 46%/55% 48% 52% 45%"),
  S("wave-edge", "Wave Edge", "Curved", "-webkit-mask:radial-gradient(40px 14px at 50% 100%,transparent 98%,#000) 0 100%/80px 100% repeat-x,linear-gradient(#000,#000) 0 0/100% calc(100% - 14px) no-repeat;mask:radial-gradient(40px 14px at 50% 100%,transparent 98%,#000) 0 100%/80px 100% repeat-x,linear-gradient(#000,#000) 0 0/100% calc(100% - 14px) no-repeat"),
  S("diagonal-cut", "Diagonal Cut", "Angular", "clip-path:polygon(0 0,100% 0,100% 82%,0 100%)"),
  S("hexagon", "Polygon / Hexagon", "Angular", "clip-path:polygon(25% 5%,75% 5%,100% 50%,75% 95%,25% 95%,0 50%);aspect-ratio:1.1"),
  S("layered-geometric", "Layered Geometric", "Composition", "background:linear-gradient(135deg,var(--ds-primary) 0 50%,transparent 50%),linear-gradient(45deg,var(--ds-accent) 0 50%,transparent 50%);background-size:60% 60%,60% 60%;background-position:0 0,100% 100%;background-repeat:no-repeat"),
  S("floating-panel", "Floating Panel", "Depth", "background:var(--ds-surface);border-radius:var(--ds-radius,18px);box-shadow:0 24px 60px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.08);transform:translateY(-8px)"),
  S("wood-grain", "Wood Grain", "Texture", "background:repeating-linear-gradient(92deg,rgba(0,0,0,.05) 0 2px,transparent 2px 9px),repeating-linear-gradient(88deg,rgba(255,255,255,.05) 0 1px,transparent 1px 14px),linear-gradient(180deg,#b9824f,#9a6638);color:#fff7ea;border-radius:6px"),
  S("glass", "Glass", "Depth", "background:rgba(255,255,255,.14);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.35);border-radius:var(--ds-radius,20px)"),
  S("gradient-shape", "Gradient Shape", "Colour", "background:linear-gradient(135deg,var(--ds-primary),var(--ds-accent));border-radius:var(--ds-radius,24px)"),
  S("overlap-stack", "Overlapping Stack", "Composition", "box-shadow:18px 18px 0 -2px var(--ds-accent),36px 36px 0 -4px var(--ds-primary);border-radius:8px"),
];
export const SHAPE_IDS = SHAPES.map((s) => s.id);
export const SHAPE_BY_ID = new Map(SHAPES.map((s) => [s.id, s]));
