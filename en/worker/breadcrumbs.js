import { getSiteContext } from "./site-context.js";
// =====================================================
// TENANT BREADCRUMB ENGINE
// =====================================================

const ROUTES = {
  home: [],

  casinoList: [
    { label: "All Casinos", url: "/en/casino" }
  ],

  reviewList: [
    { label: "All Reviews", url: "/en/review" }
  ],

  newsList: [
    { label: "News", url: "/en/news" }
  ],

  updatesList: [
    { label: "Platform Updates", url: "/en/updates" }
  ],

  authorList: [
    { label: "Authors", url: "/en/author" }
  ],

  categoryList: [
    { label: "Categories", url: "/en/category" }
  ],

  countryList: [
    { label: "Countries", url: "/en/country" }
  ],

  paymentMethodList: [
    { label: "Payment Methods", url: "/en/payment-methods" }
  ],

  sportsbookList: [
    { label: "All Sportsbooks", url: "/en/sportsbook" }
  ],

  affiliatePartnerList: [
    { label: "Affiliate Partners", url: "/en/affiliate-partner" }
  ],

  dashboard: [
    { label: "Dashboard", url: null }
  ]
};

export function buildBreadcrumbs(route, data = {}) {
  if (route === "home") {
    return [];
  }

  const crumbs = [
    {
      label: "Home",
      url: "/en"
    }
  ];

  if (ROUTES[route]) {
    crumbs.push(...ROUTES[route]);
    return crumbs;
  }

  switch (route) {

    case "casino":
      crumbs.push(
        { label: "All Casinos", url: "/en/casino" },
        { label: data.name || data.title, url: null }
      );
      break;

    case "review":
      crumbs.push(
        { label: "All Reviews", url: "/en/review" },
        { label: data.title, url: null }
      );
      break;

    case "sportsbook":
      crumbs.push(
        { label: "All Sportsbooks", url: "/en/sportsbook" },
        { label: data.name || data.title, url: null }
      );
      break;

    case "affiliatePartner":
      crumbs.push(
        { label: "Affiliate Partners", url: "/en/affiliate-partner" },
        { label: data.name || data.title, url: null }
      );
      break;

    case "custom":
      crumbs.push(
        { label: data.typeLabel || "Custom", url: `/en/custom/${data.typeSlug}` },
        { label: data.name || data.title, url: null }
      );
      break;

    case "contentLandingPage":
      crumbs.push({ label: data.title, url: null });
      break;

    case "sportsbookReview":
      crumbs.push(
        { label: "All Sportsbooks", url: "/en/sportsbook" },
        { label: data.name || data.title, url: null }
      );
      break;

    case "affiliatePartnerReview":
      crumbs.push(
        { label: "Affiliate Partners", url: "/en/affiliate-partner" },
        { label: data.name || data.title, url: null }
      );
      break;

    case "customReview":
      crumbs.push(
        { label: data.typeLabel || "Custom", url: `/en/custom/${data.typeSlug}` },
        { label: data.name || data.title, url: null }
      );
      break;

    case "comparisonList":
      crumbs.push(
        { label: "Compare", url: null },
        { label: (data.compareType || "").charAt(0).toUpperCase() + (data.compareType || "").slice(1), url: null }
      );
      break;

    case "comparison":
      crumbs.push(
        { label: "Compare", url: "/en/compare" },
        { label: (data.compareType || "").charAt(0).toUpperCase() + (data.compareType || "").slice(1), url: `/en/compare/${data.compareType}` },
        { label: data.title, url: null }
      );
      break;

    case "customList":
      crumbs.push(
        { label: data.typeLabel || "Custom", url: null }
      );
      break;

    case "news":
      crumbs.push(
        { label: "News", url: "/en/news" },
        { label: data.title, url: null }
      );
      break;

    case "update":
      crumbs.push(
        { label: "Platform Updates", url: "/en/updates" },
        { label: data.title, url: null }
      );
      break;


    case "category":
      crumbs.push(
        { label: "Categories", url: "/en/category" },
        { label: data.category || data.title, url: null }
      );
      break;

    case "country":
      crumbs.push(
        { label: "Countries", url: "/en/country" },
        { label: data.name || data.title, url: null }
      );
      break;

    case "paymentMethod":
      crumbs.push(
        { label: "Payment Methods", url: "/en/payment-methods" },
        { label: data.name || data.title, url: null }
      );
      break;

    case "countryCustomPage":
      crumbs.push(
        { label: "Countries", url: "/en/country" },
        { label: data.countryName, url: `/en/country/${data.countryCode}` },
        { label: data.title, url: null }
      );
      break;

    case "categoryCountryPage":
      crumbs.push(
        { label: "Categories", url: "/en/category" },
        { label: data.categoryName, url: `/en/category/${data.categorySlug}` },
        { label: data.countryName, url: null }
      );
      break;

    case "author":
      crumbs.push(
        { label: "Authors", url: "/en/author" },
        { label: data.author_name || data.name, url: null }
      );
      break;

    case "affiliate":
      crumbs.push({
        label: data.title,
        url: null
      });
      break;

    case "page":
      crumbs.push({
        label: data.title,
        url: null
      });
      break;

    case "researchTypeList":
      crumbs.push(
        { label: "Research", url: "/en/research" },
        { label: data.label, url: null }
      );
      break;

    case "researchItem":
      crumbs.push(
        { label: "Research", url: "/en/research" },
        { label: data.label, url: `/en/research/${data.researchType}` },
        { label: data.title, url: null }
      );
      break;
  }

  return crumbs;
}

// =====================================================
// HTML Breadcrumbs
// =====================================================

const escBc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function renderBreadcrumbs(crumbs = []) {

  crumbs = Array.isArray(crumbs) ? crumbs : [];
  if (!crumbs.length) {
    return "";
  }

  const items = crumbs.map(c => {

    if (c.url) {
      return `<li><a href="${escBc(c.url)}">${escBc(c.label)}</a></li>`;
    }

    return `<li aria-current="page">${escBc(c.label)}</li>`;

  }).join("");

  return `
<nav class="breadcrumbs" aria-label="Breadcrumb">
  <ol>
    ${items}
  </ol>
</nav>
`;

}

// =====================================================
// Breadcrumb JSON-LD
// =====================================================

export function buildBreadcrumbSchema(
  crumbs = [],
  siteOrigin = ""
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",

    itemListElement: crumbs.map((crumb, index) => {
      const item = {
        "@type": "ListItem",
        position: index + 1,
        name: crumb.label
      };

      if (crumb.url) {
        item.item = `${siteOrigin}${crumb.url}`;
      }

      return item;
    })
  };
}
