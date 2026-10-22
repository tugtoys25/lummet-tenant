// Homepage builder: paragraphs and cards inside a section
// Classic script; shares the global scope with the other homepage-builder-*.js files (load order is in templates/layout/base.html).

function renderHomepageParagraphs(wrapper, section) {
  // ------------------------------------------------------
  // Paragraphs
  // ------------------------------------------------------

  const paragraphsContainer =
    wrapper.querySelector(
      ".section-paragraphs"
    );

  (section.paragraphs || [])
    .forEach(
      (paragraph, paragraphIndex) => {

        const row =
          document.createElement("div");

        row.style.cssText = `
              display:flex;
              gap:8px;
              margin-bottom:8px;
            `;

        row.innerHTML = `
              <textarea
                rows="3"
                style="flex:1"
                class="paragraph-input"
              >${homepageEscape(paragraph)}</textarea>

              <button
                type="button"
                class="btn btn--ghost remove-paragraph"
              >
                Remove
              </button>
            `;

        row
          .querySelector(
            ".remove-paragraph"
          )
          .addEventListener(
            "click",
            () => {

              section.paragraphs
                .splice(
                  paragraphIndex,
                  1
                );

              renderHomepageSections();
            }
          );

        paragraphsContainer
          .appendChild(row);
      }
    );
}

function renderHomepageCards(wrapper, section) {
  // ------------------------------------------------------
  // Cards
  // ------------------------------------------------------

  const cardsContainer =
    wrapper.querySelector(
      ".section-cards"
    );


  (section.cards || [])
    .forEach(
      (card, cardIndex) => {

        const cardElement =
          document.createElement("div");

        cardElement.style.cssText = `
              border:1px solid var(--border);
              border-radius:8px;
              padding:16px;
              margin:12px 0;
            `;

        cardElement.innerHTML = `

              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  margin-bottom:12px;
                "
              >

                <strong>
                  Card ${cardIndex + 1}
                </strong>

                <button
                  type="button"
                  class="btn btn--ghost remove-card"
                >
                  Remove
                </button>

              </div>


              <div class="form-group">

                <label>
                  Enabled
                </label>

                <input
                  type="checkbox"
                  class="card-enabled"
                  ${card.enabled !== false ? "checked" : ""}
                >

              </div>


              <div class="form-group">

                <label>
                  Title
                </label>

                <input
                  type="text"
                  class="card-title"
                  value="${homepageEscape(card.title)}"
                >

              </div>


              <div class="form-group">

                <label>
                  Content
                </label>

                <textarea
                  rows="3"
                  class="card-text"
                >${homepageEscape(card.text)}</textarea>

              </div>


              <div class="form-group">

                <label>
                  Icon Type
                </label>

                <select class="card-icon-type">

                  <option
                    value="icon"
                    ${card.iconType === "icon" ? "selected" : ""}
                  >
                    Text / Emoji / Symbol
                  </option>

                  <option
                    value="image"
                    ${card.iconType === "image" ? "selected" : ""}
                  >
                    Image URL
                  </option>

                </select>

              </div>


              <div class="form-group">

                <label>
                  Icon / Symbol
                </label>

                <input
                  type="text"
                  class="card-icon"
                  value="${homepageEscape(card.icon)}"
                  placeholder="★ 🔒 🌐"
                >

              </div>


              <div class="form-group">

                <label>
                  Icon Image URL
                </label>

                <input
                  type="url"
                  class="card-image-url"
                  value="${homepageEscape(card.imageUrl)}"
                  placeholder="https://..."
                >

              </div>


              <div class="form-group">

                <label>
                  Card URL
                </label>

                <input
                  type="text"
                  class="card-url"
                  value="${homepageEscape(card.url)}"
                  placeholder="/en/review/example"
                >

              </div>


              <div class="form-group">

                <label>
                  Open Link
                </label>

                <select class="card-target">

                  <option
                    value="_self"
                    ${card.target !== "_blank" ? "selected" : ""}
                  >
                    Same Window
                  </option>

                  <option
                    value="_blank"
                    ${card.target === "_blank" ? "selected" : ""}
                  >
                    New Window
                  </option>

                </select>

              </div>


              <div class="form-group">

                <label>
                  Card Background Color
                </label>

                <input
                  type="text"
                  class="card-background-color"
                  value="${homepageEscape(card.backgroundColor)}"
                  placeholder="#111827"
                >

              </div>


              <div class="form-group">

                <label>
                  Card Background Image URL
                </label>

                <input
                  type="url"
                  class="card-background-image"
                  value="${homepageEscape(card.backgroundImage)}"
                  placeholder="https://..."
                >

              </div>


              <div class="form-group">

                <label>
                  Card Text Color
                </label>

                <input
                  type="text"
                  class="card-text-color"
                  value="${homepageEscape(card.textColor)}"
                  placeholder="#ffffff"
                >

              </div>


              <div class="form-group">

                <label>
                  Icon Color
                </label>

                <input
                  type="text"
                  class="card-icon-color"
                  value="${homepageEscape(card.iconColor)}"
                  placeholder="#ffffff"
                >

              </div>
            `;


        cardElement
          .querySelector(
            ".remove-card"
          )
          .addEventListener(
            "click",
            () => {

              section.cards
                .splice(
                  cardIndex,
                  1
                );

              renderHomepageSections();
            }
          );


        cardsContainer
          .appendChild(
            cardElement
          );
      }
    );
}
