// One definition of "clean a component's settings JSON for its type", shared by the component API and by the
// configuration draft (Phase 6D), so a value accepted in one place is accepted in the other and nothing else is.
import { cleanHeroSettingsJson } from "./component-hero.js";
import { isStudioType, cleanStudioSettingsJson, cleanLegacySettingsJson } from "./component-studio.js";

export function cleanComponentSettings(type, text) {
  if (type === "hero") return cleanHeroSettingsJson(text);
  if (isStudioType(type)) return cleanStudioSettingsJson(type, text);
  return cleanLegacySettingsJson(type, text);
}
