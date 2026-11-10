// Library 5 shape system. Each shape is a small, reusable CSS recipe applied through the class .lds-sh-<id>.
// They are independent of any theme, so a hero, section or card can use any of them. Clip-paths are fixed strings written here.

export const SHAPES = [
  { id: "rect", label: "Rectangle", group: "basic", css: "border-radius:0" },
  { id: "rounded", label: "Rounded rectangle", group: "basic", css: "border-radius:22px" },
  { id: "pill", label: "Pill", group: "basic", css: "border-radius:999px" },
  { id: "circle", label: "Circle", group: "basic", css: "border-radius:50%;aspect-ratio:1/1" },
  { id: "ellipse", label: "Ellipse", group: "basic", css: "border-radius:50%" },
  { id: "trapezoid", label: "Trapezoid", group: "angled", css: "clip-path:polygon(8% 0,92% 0,100% 100%,0 100%)" },
  { id: "trapezoid-flip", label: "Trapezoid (flipped)", group: "angled", css: "clip-path:polygon(0 0,100% 0,92% 100%,8% 100%)" },
  { id: "diagonal", label: "Diagonal cut", group: "angled", css: "clip-path:polygon(0 0,100% 0,100% 84%,0 100%)" },
  { id: "diagonal-both", label: "Double diagonal", group: "angled", css: "clip-path:polygon(0 8%,100% 0,100% 92%,0 100%)" },
  { id: "arch", label: "Arch", group: "curved", css: "border-radius:999px 999px 0 0" },
  { id: "blob", label: "Organic blob", group: "curved", css: "border-radius:62% 38% 54% 46% / 48% 56% 44% 52%" },
  { id: "leaf", label: "Leaf", group: "curved", css: "border-radius:0 80% 0 80%" },
  { id: "wave", label: "Wave edge", group: "curved", css: "clip-path:polygon(0 0,100% 0,100% 88%,88% 94%,75% 98%,60% 94%,45% 88%,30% 90%,15% 96%,0 92%)" },
  { id: "hexagon", label: "Hexagon", group: "polygon", css: "clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)" },
  { id: "pentagon", label: "Polygon", group: "polygon", css: "clip-path:polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)" },
  { id: "chevron", label: "Chevron", group: "polygon", css: "clip-path:polygon(0 0,86% 0,100% 50%,86% 100%,0 100%)" },
];

// Surface treatments: textures, glass, gradients and shadows. Wood is drawn with gradients only, nothing is downloaded.
export const SURFACES = [
  { id: "none", label: "Plain", css: "" },
  { id: "glass", label: "Glass", css: "background:rgba(255,255,255,.12);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.28);box-shadow:0 10px 40px rgba(0,0,0,.25)" },
  { id: "glass-dark", label: "Dark glass", css: "background:rgba(10,12,20,.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.14)" },
  { id: "wood", label: "Warm wood", css: "background:repeating-linear-gradient(92deg,#7a4e2b 0 6px,#6b4325 6px 11px,#85563a 11px 15px,#744a29 15px 24px),#744a29;color:#fdf3e4" },
  { id: "wood-light", label: "Light oak", css: "background:repeating-linear-gradient(90deg,#d9b98a 0 7px,#cfae7d 7px 12px,#e1c597 12px 18px),#d9b98a;color:#3b2a16" },
  { id: "paper", label: "Paper grain", css: "background:radial-gradient(rgba(0,0,0,.05) 1px,transparent 1px) 0 0/6px 6px,#f7f3ea;color:#2b261c" },
  { id: "linen", label: "Linen", css: "background:repeating-linear-gradient(45deg,rgba(0,0,0,.03) 0 2px,transparent 2px 5px),#efe9de;color:#2b261c" },
  { id: "gradient", label: "Gradient", css: "background:linear-gradient(135deg,var(--p),var(--p2));color:var(--btn)" },
  { id: "soft", label: "Soft shadow", css: "background:var(--sf);box-shadow:0 18px 50px rgba(15,23,42,.14)" },
];

export const SHAPE_IDS = SHAPES.map((s) => s.id);
export const SURFACE_IDS = SURFACES.map((s) => s.id);

export function shapeCss() {
  return SHAPES.map((s) => `.lds-sh-${s.id}{${s.css}}`).join("") + SURFACES.map((s) => (s.css ? `.lds-sf-${s.id}{${s.css}}` : "")).join("");
}
