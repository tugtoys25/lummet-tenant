// Responsible-gambling content (footer block and compliance logos, AI chat text): who sees it.
// The owner chooses show / hide / auto in Settings > Responsible gambling (key footer_rg_mode).
// Auto = shown while the site has a casino, sportsbook or affiliate-partner section on, hidden on other sites.
import { isEnabled } from "./profile.js";

export const GAMBLING_CAPS = ["casino", "content.sportsbook", "content.partners"];
export const RG_MODES = ["auto", "show", "hide"];

export const cleanRgMode = (v) => (RG_MODES.includes(v) ? v : "auto");

export function isGamblingSite(profile) {
  if (!profile) return true; // no profile information: keep the original behaviour
  return GAMBLING_CAPS.some((c) => { try { return isEnabled(profile, c); } catch (_) { return true; } });
}

export function rgVisible(profile, mode) {
  const m = cleanRgMode(mode);
  return m === "show" ? true : m === "hide" ? false : isGamblingSite(profile);
}
