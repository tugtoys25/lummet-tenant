# Component Studio (static/js/component-studio.js, static/js/component-studio/)

The editor on Dashboard > Components used to be one 650-line function. It is now an entry module and eight parts, wired by the import map in `templates/layout/base.html` (the same way as the Header & Hero admin script).

| File | Lines | Holds |
|---|---:|---|
| `component-studio.js` | 11 | Entry: if the page has the editor, call `initComponentStudio()` |
| `context.js` | 52 | Page elements, constants, the shared state object `st`, tiny DOM helpers |
| `preview.js` | 30 | Debounced live preview (the newest answer wins) |
| `widgets.js` | 273 | Fields, selects, switches, ranges, colour, image and link inputs, the picked-items list, the repeater, the rich text editor |
| `forms.js` | 73 | The `builders` table and the simple forms: text, call to action, banner, FAQ, author, casino grid, comparison table, news feed |
| `content.js` | 50 | The Content grid form |
| `data.js` | 86 | The Data table form |
| `section.js` | 106 | The Section form and its blocks |
| `main.js` | 67 | `build()` and the editor events (`initComponentStudio`) |

Rules: `context` imports nothing; `preview` imports `context`; `widgets` imports both; the forms import `context` and `widgets`; `main` imports everything and loads `content`, `data` and `section` for their side effect (they register their form in `builders`). Nothing imports the entry. `st.S` (the settings object being edited) and `st.busy` are the only values that change across parts, so they live in one object. `test/component-studio-structure.test.js` checks all of this.
