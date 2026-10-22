// Homepage builder: one section's card: the title/subtitle/colour fields and the lists
// Classic script; shares the global scope with the other homepage-builder-*.js files (load order is in templates/layout/base.html).

function renderHomepageSectionShell(section, sectionIndex) {
  const wrapper =
    document.createElement("div");

  wrapper.className =
    "homepage-admin-section";

  wrapper.style.cssText = `
        border:1px solid var(--border);
        border-radius:10px;
        padding:18px;
        margin:16px 0;
      `;

  wrapper.innerHTML = `
        <div
          style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:10px;
            flex-wrap:wrap;
            margin-bottom:16px;
          "
        >

          <strong>
            Section ${sectionIndex + 1}
          </strong>

          <div style="display:flex;gap:6px">

            <button
              type="button"
              class="btn btn--ghost move-up"
            >
              ↑
            </button>

            <button
              type="button"
              class="btn btn--ghost move-down"
            >
              ↓
            </button>

            <button
              type="button"
              class="btn btn--ghost duplicate-section"
            >
              Duplicate
            </button>

            <button
              type="button"
              class="btn btn--ghost remove-section"
            >
              Remove
            </button>

          </div>

        </div>


        <div class="form-group">

          <label>
            Enabled
          </label>

          <input
            type="checkbox"
            class="section-enabled"
            ${section.enabled !== false ? "checked" : ""}
          >

        </div>


        <div class="form-group">

          <label>
            Section Type
          </label>

          <select class="section-type">

            <option
              value="features"
              ${section.type === "features" ? "selected" : ""}
            >
              Featured Grid
            </option>

            <option
              value="cards"
              ${section.type === "cards" ? "selected" : ""}
            >
              Cards
            </option>

            <option
              value="text"
              ${section.type === "text" ? "selected" : ""}
            >
              Text / Paragraphs
            </option>

          </select>

        </div>


        <div class="form-group">

          <label>
            Section Title
          </label>

          <input
            type="text"
            class="section-title"
            value="${homepageEscape(section.title)}"
          >

        </div>


        <div class="form-group">

          <label>
            Section Subtitle
          </label>

          <input
            type="text"
            class="section-subtitle"
            value="${homepageEscape(section.subtitle)}"
          >

        </div>


        <div class="form-group">

          <label>
            Section Description
          </label>

          <textarea
            class="section-description"
            rows="3"
          >${homepageEscape(section.description)}</textarea>

        </div>


        <div class="form-group">

          <label>
            Alignment
          </label>

          <select class="section-alignment">

            <option
              value="left"
              ${section.alignment === "left" ? "selected" : ""}
            >
              Left
            </option>

            <option
              value="center"
              ${section.alignment === "center" ? "selected" : ""}
            >
              Center
            </option>

            <option
              value="right"
              ${section.alignment === "right" ? "selected" : ""}
            >
              Right
            </option>

          </select>

        </div>


        <div class="form-group">

          <label>
            Background Color
          </label>

          <input
            type="text"
            class="section-background-color"
            value="${homepageEscape(section.backgroundColor)}"
            placeholder="#111827 or rgba(...)"
          >

        </div>


        <div class="form-group">

          <label>
            Background Image URL
          </label>

          <input
            type="url"
            class="section-background-image"
            value="${homepageEscape(section.backgroundImage)}"
            placeholder="https://..."
          >

        </div>


        <div class="form-group">

          <label>
            Text Color
          </label>

          <input
            type="text"
            class="section-text-color"
            value="${homepageEscape(section.textColor)}"
            placeholder="#ffffff"
          >

        </div>


        <div class="form-group">

          <label>
            Button Text
          </label>

          <input
            type="text"
            class="section-button-text"
            value="${homepageEscape(section.buttonText)}"
          >

        </div>


        <div class="form-group">

          <label>
            Button URL
          </label>

          <input
            type="text"
            class="section-button-url"
            value="${homepageEscape(section.buttonUrl)}"
          >

        </div>


        <div class="form-group">

          <label>
            Button Style
          </label>

          <select class="section-button-style">

            <option
              value="primary"
              ${section.buttonStyle === "primary" ? "selected" : ""}
            >
              Primary
            </option>

            <option
              value="ghost"
              ${section.buttonStyle === "ghost" ? "selected" : ""}
            >
              Ghost
            </option>

          </select>

        </div>


        <h3>
          Paragraphs
        </h3>

        <div class="section-paragraphs"></div>

        <button
          type="button"
          class="btn btn--ghost add-paragraph"
        >
          + Add Paragraph
        </button>


        <h3 style="margin-top:24px">
          Cards
        </h3>

        <div class="section-cards"></div>

        <button
          type="button"
          class="btn btn--ghost add-card"
        >
          + Add Card
        </button>
      `;

  return wrapper;
}
