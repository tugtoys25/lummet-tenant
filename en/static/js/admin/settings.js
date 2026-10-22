// ============================================================
// SITE SETTINGS
// ============================================================

let currentComplianceItems = [];

async function loadSettingsForm() {

  const form =
    document.getElementById("settingsForm");

  if (!form) return;

  try {

    const res =
      await fetch("/en/api/v1/settings/get");

    if (!res.ok) {
      throw new Error(
        `Settings request failed: ${res.status}`
      );
    }

    const data =
      await res.json();


    const settings =
      data.settings || {};

    homepageSections = [];

if (settings.homepage_sections) {
  try {
    const parsed =
      JSON.parse(
        settings.homepage_sections
      );

    if (Array.isArray(parsed)) {
      homepageSections = parsed;
    }
  } catch (error) {
    console.warn(
      "Invalid homepage_sections JSON",
      error
    );
  }
}

if (!homepageSections.length) {
  homepageSections = [
    createHomepageSection(
      "features"
    )
  ];

  homepageSections[0].title =
    "Why Choose Us";

  homepageSections[0].cards = [
    {
      id: homepageId("card"),
      enabled: true,
      title: "Expert Reviews",
      text:
        "In-depth analysis from industry veterans with years of experience.",
      iconType: "icon",
      icon: "★",
      imageUrl: "",
      url: "",
      target: "_self",
      backgroundColor: "",
      backgroundImage: "",
      textColor: "",
      iconColor: ""
    },
    {
      id: homepageId("card"),
      enabled: true,
      title: "Exclusive Bonuses",
      text:
        "Access special bonus offers available only through {{site_name}}.",
      iconType: "icon",
      icon: "🔒",
      imageUrl: "",
      url: "",
      target: "_self",
      backgroundColor: "",
      backgroundImage: "",
      textColor: "",
      iconColor: ""
    },
    {
      id: homepageId("card"),
      enabled: true,
      title: "Geo-Targeted",
      text:
        "See casinos available in your country with localized bonus offers.",
      iconType: "icon",
      icon: "🌐",
      imageUrl: "",
      url: "",
      target: "_self",
      backgroundColor: "",
      backgroundImage: "",
      textColor: "",
      iconColor: ""
    },
    {
      id: homepageId("card"),
      enabled: true,
      title: "Real Data",
      text:
        "Click tracking and player analytics for transparent recommendations.",
      iconType: "icon",
      icon: "📊",
      imageUrl: "",
      url: "",
      target: "_self",
      backgroundColor: "",
      backgroundImage: "",
      textColor: "",
      iconColor: ""
    }
  ];
}

renderHomepageSections();

    const heroEnabled =
  document.getElementById("siteHeroEnabled");

if (heroEnabled) {
  heroEnabled.checked =
    settings.site_hero_enabled !== "false";
}

const heroOverlay =
  document.getElementById("siteHeroOverlay");

if (heroOverlay) {
  heroOverlay.checked =
    settings.site_hero_overlay !== "false";
}

const gpwaSealEnabled =
  document.getElementById("gpwaSealEnabled");

if (gpwaSealEnabled) {
  gpwaSealEnabled.checked =
    settings.gpwa_seal_enabled === "true";
}

    // --------------------------------------------------------
    // Populate normal fields
    // --------------------------------------------------------

    form.querySelectorAll(
      "input[name], textarea[name]"
    ).forEach(input => {

      const key =
        input.name;

      if (
        key === "footer_compliance"
      ) {
        return;
      }

      if (
        settings[key] !== undefined &&
        settings[key] !== null
      ) {
        input.value =
          settings[key];
      }
    });


    // --------------------------------------------------------
    // Compliance JSON
    // --------------------------------------------------------

    currentComplianceItems = [];

    if (settings.footer_compliance) {

      try {

        const parsed =
          JSON.parse(
            settings.footer_compliance
          );

        if (Array.isArray(parsed)) {
          currentComplianceItems =
            parsed;
        }

      } catch (error) {

        console.warn(
          "Invalid footer compliance JSON"
        );

      }
    }


    renderComplianceRows();

  } catch (error) {

    console.error(
      "Failed to load settings:",
      error
    );

  }
}


// ------------------------------------------------------------
// Compliance rows
// ------------------------------------------------------------

function renderComplianceRows() {

  const container =
    document.getElementById(
      "complianceRows"
    );

  if (!container) return;

  container.innerHTML = "";

  currentComplianceItems.forEach(
    (item, index) => {

      const row =
        document.createElement("div");

      row.className =
        "site-compliance-row";

      row.style.cssText = `
        border:1px solid var(--border);
        border-radius:8px;
        padding:16px;
        margin:12px 0;
      `;

      row.innerHTML = `
        <div class="form-group">
          <label>Image URL</label>
          <input
            type="url"
            class="compliance-image"
            value="${escapeHtmlAttribute(item.image || "")}"
            placeholder="/static/images/logo/example.svg"
          >
        </div>

        <div class="form-group">
          <label>Link URL</label>
          <input
            type="url"
            class="compliance-url"
            value="${escapeHtmlAttribute(item.url || "")}"
            placeholder="https://..."
          >
        </div>

        <div class="form-group">
          <label>Alt Text</label>
          <input
            type="text"
            class="compliance-alt"
            value="${escapeHtmlAttribute(item.alt || "")}"
            placeholder="Compliance organization"
          >
        </div>

        <button
          type="button"
          class="btn btn--ghost remove-compliance"
        >
          Remove
        </button>
      `;

      row
        .querySelector(
          ".remove-compliance"
        )
        .addEventListener(
          "click",
          () => {

            currentComplianceItems
              .splice(index, 1);

            renderComplianceRows();

          }
        );

      container.appendChild(row);
    }
  );
}


// ------------------------------------------------------------
// Add compliance item
// ------------------------------------------------------------

function addComplianceRow() {

  currentComplianceItems.push({
    image: "",
    url: "",
    alt: ""
  });

  renderComplianceRows();
}


// ------------------------------------------------------------
// Read compliance rows
// ------------------------------------------------------------

function collectComplianceRows() {

  const rows =
    document.querySelectorAll(
      "#complianceRows .site-compliance-row"
    );

  return Array.from(rows)
    .map(row => ({
      image:
        row.querySelector(
          ".compliance-image"
        )?.value.trim() || "",

      url:
        row.querySelector(
          ".compliance-url"
        )?.value.trim() || "",

      alt:
        row.querySelector(
          ".compliance-alt"
        )?.value.trim() || ""
    }))
    .filter(item => item.image);
}


// ------------------------------------------------------------
// Escape HTML attribute
// ------------------------------------------------------------

function escapeHtmlAttribute(value) {

  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


