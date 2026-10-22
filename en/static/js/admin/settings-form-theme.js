// Theme preset and live theme preview of the site settings form (called by initSettingsForm).

function initSettingsThemeEditor() {
    // ==========================================================
  // THEME PRESET
  // ==========================================================

  const themePreset =
    document.getElementById(
      "themePreset"
    );

  if (themePreset) {

    themePreset.addEventListener(
      "change",
      () => {

        if (
          themePreset.value !== "custom"
        ) {

          applyThemePreset(
            themePreset.value
          );

        }

      }
    );

  }

    // ============================================================
  // LIVE THEME PREVIEW
  // ============================================================

  function updateThemePreview() {

    const preview =
      document.getElementById(
        "themePreview"
      );

    if (!preview) return;


    const getValue = id => {

      const el =
        document.getElementById(id);

      return el
        ? el.value
        : "";

    };


    const primary =
      getValue("themePrimary") ||
      "#8b5cf6";

    const primaryHover =
      getValue("themePrimaryHover") ||
      "#7c3aed";

    const secondary =
      getValue("themeSecondary") ||
      "#ec4899";

    const secondaryHover =
      getValue("themeSecondaryHover") ||
      "#db2777";

    const accent =
      getValue("themeAccent") ||
      "#22d3ee";

    const background =
      getValue("themeBackground") ||
      "#050505";

    const surface =
      getValue("themeSurface") ||
      "#0f0f12";

    const surfaceAlt =
      getValue("themeSurfaceAlt") ||
      "#15151a";

    const text =
      getValue("themeText") ||
      "#ffffff";

    const textMuted =
      getValue("themeTextMuted") ||
      "#a1a1aa";

    const border =
      getValue("themeBorder") ||
      "#27272a";

    const buttonText =
      getValue("themeButtonText") ||
      "#ffffff";


    const cardRadius =
      document.querySelector(
        '[name="theme_card_radius"]'
      )?.value ||
      "12px";


    const buttonRadius =
      document.querySelector(
        '[name="theme_button_radius"]'
      )?.value ||
      "8px";


    // ----------------------------------------------------------
    // Preview container
    // ----------------------------------------------------------

    preview.style.backgroundColor =
      background;

    preview.style.color =
      text;

    preview.style.borderColor =
      border;


    // ----------------------------------------------------------
    // Preview card
    // ----------------------------------------------------------

    const card =
      document.getElementById(
        "themePreviewCard"
      );

    if (card) {

      card.style.backgroundColor =
        surface;

      card.style.borderColor =
        border;

      card.style.borderRadius =
        cardRadius;

      card.style.color =
        text;

    }


    // ----------------------------------------------------------
    // Preview heading
    // ----------------------------------------------------------

    const heading =
      document.getElementById(
        "themePreviewHeading"
      );

    if (heading) {

      heading.style.color =
        text;

    }


    // ----------------------------------------------------------
    // Preview description
    // ----------------------------------------------------------

    const description =
      document.getElementById(
        "themePreviewDescription"
      );

    if (description) {

      description.style.color =
        textMuted;

    }


    // ----------------------------------------------------------
    // Preview muted text
    // ----------------------------------------------------------

    const muted =
      document.getElementById(
        "themePreviewMuted"
      );

    if (muted) {

      muted.style.color =
        textMuted;

    }


    // ----------------------------------------------------------
    // Primary button
    // ----------------------------------------------------------

    const primaryButton =
      document.getElementById(
        "themePreviewPrimary"
      );

    if (primaryButton) {

      primaryButton.style.backgroundColor =
        primary;

      primaryButton.style.color =
        buttonText;

      primaryButton.style.borderColor =
        primary;

      primaryButton.style.borderRadius =
        buttonRadius;

      primaryButton.onmouseenter =
        () => {

          primaryButton.style.backgroundColor =
            primaryHover;

        };

      primaryButton.onmouseleave =
        () => {

          primaryButton.style.backgroundColor =
            primary;

        };

    }


    // ----------------------------------------------------------
    // Secondary button
    // ----------------------------------------------------------

    const secondaryButton =
      document.getElementById(
        "themePreviewSecondary"
      );

    if (secondaryButton) {

      secondaryButton.style.backgroundColor =
        "transparent";

      secondaryButton.style.color =
        secondary;

      secondaryButton.style.borderColor =
        secondary;

      secondaryButton.style.borderRadius =
        buttonRadius;

      secondaryButton.onmouseenter =
        () => {

          secondaryButton.style.backgroundColor =
            secondary;

          secondaryButton.style.color =
            buttonText;

        };

      secondaryButton.onmouseleave =
        () => {

          secondaryButton.style.backgroundColor =
            "transparent";

          secondaryButton.style.color =
            secondary;

        };

    }


    // ----------------------------------------------------------
    // Color swatches
    // ----------------------------------------------------------

    const swatches =
      preview.querySelectorAll(
        "[data-theme-preview-color]"
      );


    swatches.forEach(
      swatch => {

        const type =
          swatch.dataset.themePreviewColor;


        if (type === "primary") {

          swatch.style.backgroundColor =
            primary;

        }


        if (type === "secondary") {

          swatch.style.backgroundColor =
            secondary;

        }


        if (type === "accent") {

          swatch.style.backgroundColor =
            accent;

        }


        if (type === "background") {

          swatch.style.backgroundColor =
            background;

        }


        if (type === "surface") {

          swatch.style.backgroundColor =
            surface;

        }

      }
    );

  }


  // ------------------------------------------------------------
  // Listen to every theme input
  // ------------------------------------------------------------

  const themeInputs = [

    "themePreset",

    "themePrimary",

    "themePrimaryHover",

    "themeSecondary",

    "themeSecondaryHover",

    "themeAccent",

    "themeBackground",

    "themeSurface",

    "themeSurfaceAlt",

    "themeText",

    "themeTextMuted",

    "themeBorder",

    "themeButtonText"

  ];


  themeInputs.forEach(
    id => {

      const input =
        document.getElementById(id);

      if (!input) return;

      input.addEventListener(
        "input",
        updateThemePreview
      );

      input.addEventListener(
        "change",
        updateThemePreview
      );

    }
  );


  const radiusInputs =
    document.querySelectorAll(
      '[name="theme_card_radius"], [name="theme_button_radius"]'
    );


  radiusInputs.forEach(
    input => {

      input.addEventListener(
        "input",
        updateThemePreview
      );

    }
  );


  // Initial preview

  updateThemePreview();
}
