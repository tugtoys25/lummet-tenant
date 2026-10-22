# Component Studio, server side (worker/component-studio.js, worker/component-studio/)

`component-studio.js` (645 lines) is now a facade over five parts. It re-exports the same 21 names, so `component-engine.js`, `comparison-design.js` and `api/routes/components.js` are unchanged. The browser side is described in `docs/ARCHITECTURE_COMPONENT_STUDIO.md`.

| Part | Lines | Holds |
|---|---:|---|
| `component-studio/shared.js` | 91 | Limits, value cleaners (`pickEnum`, `bool`, `int`, `text`, `link`, `image`...), `cleanPicks` |
| `component-studio/grid.js` | 135 | Content grid: defaults, `cleanGridSettings`, card HTML, `renderContentGrid`, the `wrap` helper |
| `component-studio/table.js` | 138 | Data table: defaults, `cleanTableSettings`, `renderDataTable` |
| `component-studio/section.js` | 230 | Section: defaults, `cleanRichText`, `cleanSectionSettings`, block HTML, `renderSection` |
| `component-studio/dispatch.js` | 63 | `isStudioType`, `cleanStudioSettingsJson`, `renderStudioComponent`, `cleanLegacySettingsJson` |

Dependencies: `shared` <- `grid` <- `table`; `shared` <- `section`; `dispatch` uses all four. `test/component-studio-server-structure.test.js` checks the layout.
