// Submit handler of the site settings form (called by initSettingsForm with the form element).

function initSettingsSave(form) {

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const alertEl =
        document.getElementById(
          "settingsFormAlert"
        );

      try {

        const formData =
          new FormData(form);

        const payload = {};


        for (
          const [key, value]
          of formData.entries()
        ) {

          payload[key] =
            String(value);

        }

        // The homepage hero is managed on Dashboard > Header & Hero. Only send
        // these when the checkboxes exist on this page, otherwise saving here
        // would switch the hero off.
        const heroEnabled =
  document.getElementById("siteHeroEnabled");

if (heroEnabled) {
  payload.site_hero_enabled =
    heroEnabled.checked
      ? "true"
      : "false";
}


const heroOverlay =
  document.getElementById("siteHeroOverlay");

if (heroOverlay) {
  payload.site_hero_overlay =
    heroOverlay.checked
      ? "true"
      : "false";
}

const gpwaSealEnabledInput =
  document.getElementById("gpwaSealEnabled");

payload.gpwa_seal_enabled =
  gpwaSealEnabledInput && gpwaSealEnabledInput.checked
    ? "true"
    : "false";

        payload.footer_compliance =
          JSON.stringify(
            collectComplianceRows()
          );

        payload.homepage_sections =
          JSON.stringify(
            collectHomepageSections()
          );


        const res =
          await fetch(
            "/en/api/v1/settings/save",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body:
                JSON.stringify(payload)
            }
          );


        const data =
          await res.json();


        if (!res.ok || data.success === false) {

          throw new Error(
            data.error ||
            "Failed to save settings"
          );

        }


        if (alertEl) {

          alertEl.style.display =
            "block";

          alertEl.textContent =
            "Site settings saved successfully.";

        }

      } catch (error) {

        console.error(
          "Failed to save settings:",
          error
        );

        if (alertEl) {

          alertEl.style.display =
            "block";

          alertEl.textContent =
            error.message ||
            "Failed to save settings.";

        }

      }

    }
  );
}
