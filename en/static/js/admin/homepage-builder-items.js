// ============================================================
// HOMEPAGE SECTION BUILDER
// ============================================================

let homepageSections = [];


// ------------------------------------------------------------
// Escape HTML attribute
// ------------------------------------------------------------

function homepageEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


// ------------------------------------------------------------
// Create IDs
// ------------------------------------------------------------

function homepageId(prefix = "item") {
  return (
    prefix +
    "-" +
    Date.now() +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 8)
  );
}


// ------------------------------------------------------------
// Default card
// ------------------------------------------------------------

function createHomepageCard() {

  return {
    id: homepageId("card"),

    enabled: true,

    title: "New Feature",

    text:
      "Add your feature description here.",

    iconType: "icon",

    icon: "★",

    imageUrl: "",

    url: "",

    target: "_self",

    backgroundColor: "",

    backgroundImage: "",

    textColor: "",

    iconColor: ""
  };
}


// ------------------------------------------------------------
// Default section
// ------------------------------------------------------------

function createHomepageSection(type) {

  const section = {

    id:
      homepageId("section"),

    enabled: true,

    type,

    title: "",

    subtitle: "",

    description: "",

    alignment: "center",

    backgroundColor: "",

    backgroundImage: "",

    textColor: "",

    cards: [],

    paragraphs: [],

    buttonText: "",

    buttonUrl: "",

    buttonStyle: "primary"
  };


  if (type === "features") {

    section.title =
      "Why Choose Us";

    section.cards = [
      createHomepageCard()
    ];

  }


  if (type === "cards") {

    section.title =
      "Featured";

    section.cards = [
      createHomepageCard()
    ];

  }


  return section;
}


