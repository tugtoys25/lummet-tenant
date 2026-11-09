// Site-wide fonts and text size for the tenant theme (Configuration > Design > Fonts).
// Only the listed system stacks can be chosen, so nothing is downloaded and no free text reaches the CSS.
// Returns "" unless the admin picked something, so an unconfigured site gets exactly the CSS it had before.

import { FONT_STACKS } from "../header-hero/schema.js";
import { safeThemeStyle } from "./theme-values.js";

const fontKey = (v) => (Object.prototype.hasOwnProperty.call(FONT_STACKS, v) ? v : "default");

export function buildTypographyBlock(s) {
  const bodyFont = FONT_STACKS[fontKey(s.themeFontBody)] || "";
  const headingFont = FONT_STACKS[fontKey(s.themeFontHeading)] || "";
  const size = safeThemeStyle(s.themeFontSize, ["default", "small", "large"], "default");
  const pct = size === "small" ? "93.75%" : size === "large" ? "106.25%" : "";
  const rules = [
    pct ? `html { font-size: ${pct}; }` : "",
    bodyFont ? `body, button, input, select, textarea { font-family: ${bodyFont}; }` : "",
    headingFont ? `h1, h2, h3, h4, h5, h6 { font-family: ${headingFont}; }` : ""
  ].filter(Boolean).join("\n");
  return rules ? `\n/* TYPOGRAPHY */\n${rules}\n` : "";
}
