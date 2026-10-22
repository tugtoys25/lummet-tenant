import { escapeHtml } from "./helpers.js";
import { escapeAttribute, renderHomepageCard, safeUrl } from "./homepage-cards.js";

function renderHomepageSection(section, origin) {
  if (
    !section ||
    section.enabled === false
  ) {
    return "";
  }

  const type =
    String(section.type || "features")
      .toLowerCase();

  const sectionStyles = [];

  if (section.backgroundColor) {
    sectionStyles.push(
      `background-color:${escapeAttribute(
        section.backgroundColor
      )}`
    );
  }

  if (section.backgroundImage) {
    const bg =
      safeUrl(
        section.backgroundImage,
        origin
      );

    if (bg) {
      sectionStyles.push(
        `background-image:url('${escapeAttribute(bg)}')`,
        "background-size:cover",
        "background-position:center"
      );
    }
  }

  if (section.textColor) {
    sectionStyles.push(
      `color:${escapeAttribute(
        section.textColor
      )}`
    );
  }

  const sectionStyle =
    sectionStyles.length
      ? ` style="${sectionStyles.join(";")}"`
      : "";

  const alignment =
    ["left", "center", "right"].includes(
      section.alignment
    )
      ? section.alignment
      : "center";

  const title =
    escapeHtml(section.title || "");

  const subtitle =
    escapeHtml(section.subtitle || "");

  const description =
    escapeHtml(section.description || "");

  const paragraphs =
    Array.isArray(section.paragraphs)
      ? section.paragraphs
          .filter(Boolean)
          .map(
            paragraph => `
              <p class="homepage-section__paragraph">
                ${escapeHtml(paragraph)}
              </p>
            `
          )
          .join("")
      : "";

  const buttonUrl =
    safeUrl(
      section.buttonUrl,
      origin
    );

  const button =
    section.buttonText &&
    buttonUrl
      ? `
        <div class="homepage-section__actions">
          <a
            href="${escapeAttribute(buttonUrl)}"
            class="btn btn--${
              ["primary", "ghost"].includes(
                section.buttonStyle
              )
                ? section.buttonStyle
                : "primary"
            } btn--lg"
          >
            ${escapeHtml(
              section.buttonText
            )}
          </a>
        </div>
      `
      : "";

  const cards =
    Array.isArray(section.cards)
      ? section.cards
          .map(card =>
            renderHomepageCard(
              card,
              origin
            )
          )
          .join("")
      : "";

  /*
   * FEATURES
   */
  if (type === "features") {
    return `
      <section
        class="section section--alt homepage-section homepage-section--features"
        ${sectionStyle}
      >
        <div class="container">

          ${
            title ||
            subtitle ||
            description
              ? `
                <div
                  class="section-header homepage-section__header homepage-section__header--${alignment}"
                >
                  ${
                    title
                      ? `<h2>${title}</h2>`
                      : ""
                  }

                  ${
                    subtitle
                      ? `<p class="homepage-section__subtitle">${subtitle}</p>`
                      : ""
                  }

                  ${
                    description
                      ? `<p class="homepage-section__description">${description}</p>`
                      : ""
                  }
                </div>
              `
              : ""
          }

          ${
            paragraphs
              ? `
                <div class="homepage-section__text">
                  ${paragraphs}
                </div>
              `
              : ""
          }

          ${
            cards
              ? `
                <div class="features-grid">
                  ${cards}
                </div>
              `
              : ""
          }

          ${button}

        </div>
      </section>
    `;
  }


  /*
   * TEXT SECTION
   */
  if (type === "text") {
    return `
      <section
        class="section homepage-section homepage-section--text"
        ${sectionStyle}
      >
        <div class="container">

          <div
            class="homepage-section__content homepage-section__content--${alignment}"
          >

            ${
              title
                ? `<h2>${title}</h2>`
                : ""
            }

            ${
              subtitle
                ? `<p class="homepage-section__subtitle">${subtitle}</p>`
                : ""
            }

            ${
              description
                ? `<p class="homepage-section__description">${description}</p>`
                : ""
            }

            ${
              paragraphs
                ? `
                  <div class="homepage-section__paragraphs">
                    ${paragraphs}
                  </div>
                `
                : ""
            }

            ${button}

          </div>

        </div>
      </section>
    `;
  }


  /*
   * CARDS SECTION
   */
  if (type === "cards") {
    return `
      <section
        class="section homepage-section homepage-section--cards"
        ${sectionStyle}
      >
        <div class="container">

          ${
            title
              ? `<h2 class="homepage-section__title homepage-section__title--${alignment}">${title}</h2>`
              : ""
          }

          ${
            subtitle
              ? `<p class="homepage-section__subtitle homepage-section__subtitle--${alignment}">${subtitle}</p>`
              : ""
          }

          ${
            paragraphs
              ? `
                <div class="homepage-section__paragraphs">
                  ${paragraphs}
                </div>
              `
              : ""
          }

          <div class="features-grid">
            ${cards}
          </div>

          ${button}

        </div>
      </section>
    `;
  }


  /*
   * DEFAULT / UNKNOWN SECTION
   *
   * This makes the system forward-compatible.
   */
  return `
    <section
      class="section homepage-section"
      ${sectionStyle}
    >
      <div class="container">

        ${
          title
            ? `<h2>${title}</h2>`
            : ""
        }

        ${
          description
            ? `<p>${description}</p>`
            : ""
        }

        ${
          paragraphs
            ? `<div>${paragraphs}</div>`
            : ""
        }

        ${
          cards
            ? `<div class="features-grid">${cards}</div>`
            : ""
        }

        ${button}

      </div>
    </section>
  `;
}

export function buildHomepageSectionsHtml(
  sections,
  origin
) {
  if (!Array.isArray(sections)) {
    return "";
  }

  return sections
    .filter(section => section?.enabled !== false)
    .map(section =>
      renderHomepageSection(
        section,
        origin
      )
    )
    .join("\n");
}
