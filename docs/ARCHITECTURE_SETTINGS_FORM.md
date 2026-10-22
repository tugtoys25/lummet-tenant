# Site settings form: script layout

`static/js/admin/settings-form.js` used to be one 670-line function. It is now an entry and three classic scripts, loaded in this order by `templates/layout/base.html`:

| File | Function | Content |
|---|---|---|
| `settings-form.js` | `initSettingsForm()` | Finds the form, loads ad components, calls the three below in the original order |
| `settings-form-theme.js` | `initSettingsThemeEditor()` | Theme preset, live theme preview, listeners on every theme input |
| `settings-form-sections.js` | `initSettingsSectionButtons()` | "Add" buttons: compliance row, features, text and cards sections |
| `settings-form-save.js` | `initSettingsSave(form)` | The submit handler: builds the payload, posts it, shows the alert |

The only value shared between the parts is the form element, passed as an argument. `init.js` still calls `initSettingsForm()`.
