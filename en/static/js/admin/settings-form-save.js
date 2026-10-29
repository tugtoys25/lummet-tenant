// Submit handler of the site settings form (called by initSettingsForm with the form element).
// The payload comes from collectSettingsPayload() (settings-ux.js); the save bar reacts to the settings:* events.

function initSettingsSave(form) {

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      if (form.reportValidity && !form.reportValidity()) {
        document.dispatchEvent(new CustomEvent("settings:save-failed", {
          detail: { message: "Fix the highlighted fields first." }
        }));
        return;
      }

      document.dispatchEvent(new CustomEvent("settings:saving"));

      try {

        const payload =
          collectSettingsPayload(form);

        const res =
          await fetch(
            "/en/api/v1/settings/save",
            {
              method: "POST",
              credentials: "same-origin",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body:
                JSON.stringify(payload)
            }
          );

        const data =
          await res.json().catch(() => ({}));

        if (!res.ok || data.success === false) {

          throw new Error(
            data.error ||
            "Failed to save settings"
          );

        }

        // "Site settings saved successfully." is shown by the save bar once the stored values are re-read.
        document.dispatchEvent(new CustomEvent("settings:saved", {
          detail: { message: "Site settings saved successfully." }
        }));

      } catch (error) {

        console.error(
          "Failed to save settings:",
          error
        );

        document.dispatchEvent(new CustomEvent("settings:save-failed", {
          detail: { message: error.message || "Failed to save settings." }
        }));

      }

    }
  );
}
