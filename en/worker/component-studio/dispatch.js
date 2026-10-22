import { STUDIO_TYPES, int, link } from "./shared.js";
import { cleanGridSettings, renderContentGrid } from "./grid.js";
import { cleanTableSettings, renderDataTable } from "./table.js";
import { cleanSectionSettings, renderSection } from "./section.js";

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

export function isStudioType(type) {
  return STUDIO_TYPES.includes(type);
}

/** The cleaned settings of a new-type component, as the JSON text to store. */
export function cleanStudioSettingsJson(type, text_) {
  let parsed = {};
  if (text_ !== undefined && text_ !== null && String(text_).trim() !== "") {
    try {
      parsed = typeof text_ === "string" ? JSON.parse(text_) : text_;
    } catch {
      throw new Error("Settings must be valid JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Settings must be a JSON object");
  }
  const clean = type === "content_grid" ? cleanGridSettings(parsed) : type === "data_table" ? cleanTableSettings(parsed) : cleanSectionSettings(parsed);
  return JSON.stringify(clean);
}

/** Renders a new-type component (async because grids and casino tables read the database). */
export async function renderStudioComponent(db, component) {
  if (component.type === "content_grid") return renderContentGrid(db, component);
  if (component.type === "data_table") return renderDataTable(db, component);
  if (component.type === "section") return renderSection(component);
  return "";
}

// ---------------------------------------------------------------------------
// the older types: only values that could harm a page are checked
// ---------------------------------------------------------------------------

const LEGACY_LINKED = ["cta", "banner"];

const LEGACY_LIMITED = ["casino_grid", "comparison_table", "news_feed"];

/**
 * cta/banner: the button link must be a safe link. casino_grid/comparison_table/news_feed:
 * the limit must be a number. Every other key and every other type is returned untouched.
 */
export function cleanLegacySettingsJson(type, text_) {
  if (!LEGACY_LINKED.includes(type) && !LEGACY_LIMITED.includes(type)) return text_;
  if (text_ === undefined || text_ === null || String(text_).trim() === "") return text_ ?? null;
  let parsed;
  try {
    parsed = typeof text_ === "string" ? JSON.parse(text_) : text_;
  } catch {
    throw new Error("Settings must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Settings must be a JSON object");
  const out = { ...parsed };
  if (LEGACY_LINKED.includes(type) && Object.prototype.hasOwnProperty.call(out, "link")) out.link = link(out.link);
  if (LEGACY_LIMITED.includes(type) && Object.prototype.hasOwnProperty.call(out, "limit")) out.limit = int(out.limit, 1, 50, 6);
  return JSON.stringify(out);
}
