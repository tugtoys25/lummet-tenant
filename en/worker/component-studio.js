// New component types for the visual editor (Dashboard > Components):
//
//   content_grid  cards picked by search (or filled with the newest items) from casinos, news,
//                 research, authors, updates, sportsbooks, affiliate partners, custom content, pictures
//   data_table    a table the admin types, or a casino comparison filled from picked casinos
//   section       a custom section: background, layout columns and blocks (heading, text, picture,
//                 button, list, video, features, numbers, spacer, divider)
//
// Settings are stored as JSON in components.settings_json, but admins never see it: the editor
// builds it. Every value is checked here when it is saved (cleanStudioSettings) and again when
// the page is built (render*), so a stray value can never break or poison a public page.
// Existing component types are not touched by anything in this file.

// The code lives in component-studio/*.js (see docs/ARCHITECTURE_COMPONENT_STUDIO_SERVER.md); this file keeps the public import path.
export { STUDIO_TYPES, MAX_GRID_ITEMS, MAX_TABLE_COLS, MAX_TABLE_ROWS, MAX_BLOCKS, cleanPicks } from "./component-studio/shared.js";
export { GRID_DEFAULTS, cleanGridSettings, renderContentGrid } from "./component-studio/grid.js";
export { TABLE_CASINO_COLUMNS, TABLE_DEFAULTS, cleanTableSettings, renderDataTable } from "./component-studio/table.js";
export { SECTION_DEFAULTS, cleanRichText, cleanSectionSettings, renderSection } from "./component-studio/section.js";
export { isStudioType, cleanStudioSettingsJson, renderStudioComponent, cleanLegacySettingsJson } from "./component-studio/dispatch.js";
