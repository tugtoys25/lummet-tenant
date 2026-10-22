import { escapeHtml } from "./helpers.js";

//-------------------------------------------------------------
//Render homepage sections
//-------------------------------------------------------------
export function escapeAttribute(value = "") {
  return escapeHtml(String(value || ""));
}

export function safeUrl(value, origin) {
  const input = String(value || "").trim();

  if (!input) return "";

  try {
    const url = new URL(input, origin);

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function renderIcon(card, origin) {
  const iconType =
    String(card.iconType || "icon").toLowerCase();

  if (
    iconType === "image" &&
    card.imageUrl
  ) {
    const image =
      safeUrl(card.imageUrl, origin);

    if (!image) return "";

    return `
      <div class="feature-icon feature-icon--image">
        <img
          src="${escapeAttribute(image)}"
          alt=""
          loading="lazy"
        >
      </div>
    `;
  }

  return `
    <div
      class="feature-icon"
      ${card.iconColor
        ? `style="color:${escapeAttribute(card.iconColor)}"`
        : ""}
    >
      ${escapeHtml(card.icon || "★")}
    </div>
  `;
}

export function renderHomepageCard(card, origin) {
  if (!card || card.enabled === false) {
    return "";
  }

  const title =
    escapeHtml(card.title || "");

  const text =
    escapeHtml(card.text || "");

  const url =
    safeUrl(card.url, origin);

  const cardStyles = [];

  if (card.backgroundColor) {
    cardStyles.push(
      `background-color:${escapeAttribute(
        card.backgroundColor
      )}`
    );
  }

  if (card.backgroundImage) {
    const bg =
      safeUrl(
        card.backgroundImage,
        origin
      );

    if (bg) {
      cardStyles.push(
        `background-image:url('${escapeAttribute(bg)}')`,
        "background-size:cover",
        "background-position:center"
      );
    }
  }

  if (card.textColor) {
    cardStyles.push(
      `color:${escapeAttribute(card.textColor)}`
    );
  }

  const style =
    cardStyles.length
      ? ` style="${cardStyles.join(";")}"`
      : "";

  const content = `
    ${renderIcon(card, origin)}

    ${
      title
        ? `<h3>${title}</h3>`
        : ""
    }

    ${
      text
        ? `<p>${text}</p>`
        : ""
    }
  `;

  if (url) {
    const target =
      card.target === "_blank"
        ? "_blank"
        : "_self";

    const rel =
      target === "_blank"
        ? ` rel="noopener noreferrer"`
        : "";

    return `
      <a
        href="${escapeAttribute(url)}"
        class="feature-card"
        target="${target}"${rel}${style}
      >
        ${content}
      </a>
    `;
  }

  return `
    <div
      class="feature-card"${style}
    >
      ${content}
    </div>
  `;
}
