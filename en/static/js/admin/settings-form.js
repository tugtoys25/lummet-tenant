// ------------------------------------------------------------
// Initialize settings form
//
// The work is in three files loaded after this one (see docs/ARCHITECTURE_SETTINGS_FORM.md):
//   settings-form-theme.js     theme preset, live theme preview
//   settings-form-sections.js  "add" buttons (compliance row, homepage sections)
//   settings-form-save.js      the submit handler
// The order of the calls below is the order the code ran in as one function.
// ------------------------------------------------------------

function initSettingsForm() {

  const form =
    document.getElementById(
      "settingsForm"
    );

  if (!form) return;

  // Load active/inactive ad components
  loadAdComponents();
  initSettingsThemeEditor();

  initSettingsSectionButtons();

  initSettingsSave(form);
}
