// ============================================================
// SITE TEXT REGISTRY: every visitor-facing wording and switch that used to be hard-coded
// ============================================================
// One definition per setting. The same list drives:
//   - the runtime (worker/site-text/resolve.js): stored value wins, otherwise `def` (fail open),
//   - the dashboard (Configuration > Look and feel, through settings-groups.js),
//   - the SQL seed (scripts/generate-site-text-seed.mjs writes migrations/0014_seed_site_text.sql).
// Defaults reproduce the previous hard-coded wording exactly, so nothing changes on deploy until an
// owner edits a value. Values live in the existing `settings` key/value table.
// Tokens: {site} = site name, {year} = current year, {count} = number of items.
const TEXT = "text", BOOL = "bool", INT = "int", URL_T = "url";

export const TEXT_GROUPS = [
  { id: "home_sections", label: "Homepage sections", help: "Titles, links, counts and on/off for the built-in homepage lists.", screen: "/en/dashboard/configuration#look-home_sections" },
  { id: "sidebar", label: "Public sidebar", help: "The desktop sidebar: show it or hide it, and edit every block.", screen: "/en/dashboard/configuration#look-sidebar" },
  { id: "landing", label: "Landing pages", help: "Headings, introductions and search-engine text for list pages such as /en/casino and /en/review. Each page has its own heading below.", screen: "/en/dashboard/configuration#look-landing" },
  { id: "account", label: "Account pages", help: "Login, registration, forgot-password and reset-password wording.", screen: "/en/dashboard/configuration#look-account", needs: "accounts" },
  { id: "item_pages", label: "Item pages", help: "Section headings and labels on casino-style item pages (sportsbooks and custom content types).", screen: "/en/dashboard/configuration#look-item_pages" },
  { id: "system", label: "Search, filters and errors", help: "The not-found page, news and research search boxes, filter labels and screen-reader labels.", screen: "/en/dashboard/configuration#look-system" },
];

const f = (key, group, type, def, label, help, extra = {}) => ({ key, group, type, def, label, help, ...extra });
const b = (key, group, label, help, extra) => f(key, group, BOOL, true, label, help, extra);

export const TEXT_FIELDS = [
  // ---------------- homepage sections
  b("home_casinos_enabled", "home_sections", "Show Top rated casinos", "Turn the casino list on the homepage on or off.", { needs: "casino" }),
  f("home_casinos_title", "home_sections", TEXT, "Top Rated Casinos", "Casinos: heading", "Heading above the casino list.", { max: 80, needs: "casino" }),
  f("home_casinos_link_label", "home_sections", TEXT, "View all →", "Casinos: link text", "Text of the link to the full list.", { max: 40, needs: "casino" }),
  f("home_casinos_link_url", "home_sections", URL_T, "/en/casino", "Casinos: link address", "Where the link goes.", { max: 200, needs: "casino" }),
  f("home_casinos_load_more_label", "home_sections", TEXT, "Load More ({count} more casinos)", "Casinos: load more button", "{count} becomes the number of hidden casinos.", { max: 60, needs: "casino" }),
  b("home_reviews_enabled", "home_sections", "Show Latest reviews", "Turn the review list on the homepage on or off.", { needs: "reviews" }),
  f("home_reviews_title", "home_sections", TEXT, "Latest Reviews", "Reviews: heading", "Heading above the review list.", { max: 80, needs: "reviews" }),
  f("home_reviews_link_label", "home_sections", TEXT, "All reviews →", "Reviews: link text", "Text of the link to all reviews.", { max: 40, needs: "reviews" }),
  f("home_reviews_link_url", "home_sections", URL_T, "/en/review", "Reviews: link address", "Where the link goes.", { max: 200, needs: "reviews" }),
  f("home_reviews_count", "home_sections", INT, "6", "Reviews: how many", "Between 1 and 24.", { min: 1, max: 24, needs: "reviews" }),
  f("home_reviews_button_label", "home_sections", TEXT, "Read Review", "Reviews: card button", "Text on each review card button.", { max: 40, needs: "reviews" }),
  f("home_reviews_empty", "home_sections", TEXT, "Reviews are on the way — check back soon.", "Reviews: empty message", "Shown when there are no reviews yet.", { max: 160, needs: "reviews" }),
  b("home_news_enabled", "home_sections", "Show Latest news", "Turn the news list on the homepage on or off.", { needs: "news" }),
  f("home_news_title", "home_sections", TEXT, "Latest News", "News: heading", "Heading above the news list.", { max: 80, needs: "news" }),
  f("home_news_link_label", "home_sections", TEXT, "All news →", "News: link text", "Text of the link to all news.", { max: 40, needs: "news" }),
  f("home_news_link_url", "home_sections", URL_T, "/en/news", "News: link address", "Where the link goes.", { max: 200, needs: "news" }),
  f("home_news_count", "home_sections", INT, "4", "News: how many", "Between 1 and 12.", { min: 1, max: 12, needs: "news" }),
  f("home_news_empty", "home_sections", TEXT, "No news posted yet — check back soon.", "News: empty message", "Shown when there is no news yet.", { max: 160, needs: "news" }),

  // ---------------- public sidebar
  b("sidebar_enabled", "sidebar", "Show the sidebar", "Turn the whole desktop sidebar on or off. Off gives pages the full width."),
  b("sidebar_casinos_enabled", "sidebar", "Block: top casinos", "Show the top casinos block.", { needs: "casino" }),
  f("sidebar_casinos_title", "sidebar", TEXT, "Top Rated Casinos", "Top casinos: title", "Heading of the block.", { max: 60, needs: "casino" }),
  f("sidebar_casinos_count", "sidebar", INT, "5", "Top casinos: how many", "Between 1 and 20.", { min: 1, max: 20, needs: "casino" }),
  f("sidebar_casinos_empty", "sidebar", TEXT, "No casinos yet.", "Top casinos: empty message", "Shown when there are none.", { max: 120, needs: "casino" }),
  b("sidebar_news_enabled", "sidebar", "Block: latest news", "Show the latest news block.", { needs: "news" }),
  f("sidebar_news_title", "sidebar", TEXT, "Latest News", "Latest news: title", "Heading of the block.", { max: 60, needs: "news" }),
  f("sidebar_news_count", "sidebar", INT, "3", "Latest news: how many", "Between 1 and 10.", { min: 1, max: 10, needs: "news" }),
  f("sidebar_news_empty", "sidebar", TEXT, "No news yet.", "Latest news: empty message", "Shown when there is none.", { max: 120, needs: "news" }),
  b("sidebar_countries_enabled", "sidebar", "Block: browse by country", "Show the country chips and search.", { needs: "taxonomy" }),
  f("sidebar_countries_title", "sidebar", TEXT, "Browse by Country", "Countries: title", "Heading of the block.", { max: 60, needs: "taxonomy" }),
  f("sidebar_countries_count", "sidebar", INT, "5", "Countries: how many shown first", "Between 1 and 30.", { min: 1, max: 30, needs: "taxonomy" }),
  f("sidebar_countries_search", "sidebar", TEXT, "Search country or code...", "Countries: search hint", "Text inside the empty search box.", { max: 60, needs: "taxonomy" }),
  f("sidebar_countries_empty", "sidebar", TEXT, "No countries found.", "Countries: empty message", "Shown when a search finds nothing.", { max: 120, needs: "taxonomy" }),
  b("sidebar_categories_enabled", "sidebar", "Block: categories", "Show the categories block.", { needs: "taxonomy" }),
  f("sidebar_categories_title", "sidebar", TEXT, "Categories", "Categories: title", "Heading of the block.", { max: 60, needs: "taxonomy" }),
  f("sidebar_categories_count", "sidebar", INT, "5", "Categories: how many shown first", "Between 1 and 30.", { min: 1, max: 30, needs: "taxonomy" }),
  f("sidebar_categories_more", "sidebar", TEXT, "Load More", "Categories: more button", "Text of the expand button.", { max: 30, needs: "taxonomy" }),
  f("sidebar_categories_less", "sidebar", TEXT, "Show Less", "Categories: less button", "Text of the collapse button.", { max: 30, needs: "taxonomy" }),
  f("sidebar_categories_empty", "sidebar", TEXT, "No categories yet.", "Categories: empty message", "Shown when there are none.", { max: 120, needs: "taxonomy" }),
  f("sidebar_casinos_order", "sidebar", INT, "1", "Top casinos: position", "1 is the top of the sidebar. Blocks with the same number keep their default order.", { min: 1, max: 9, needs: "casino" }),
  f("sidebar_news_order", "sidebar", INT, "2", "Latest news: position", "1 is the top of the sidebar.", { min: 1, max: 9, needs: "news" }),
  f("sidebar_countries_order", "sidebar", INT, "3", "Countries: position", "1 is the top of the sidebar.", { min: 1, max: 9, needs: "taxonomy" }),
  f("sidebar_categories_order", "sidebar", INT, "4", "Categories: position", "1 is the top of the sidebar.", { min: 1, max: 9, needs: "taxonomy" }),
  f("sidebar_loading", "sidebar", TEXT, "Loading...", "Loading message", "Shown while a block loads.", { max: 40 }),
  f("sidebar_error", "sidebar", TEXT, "Failed to load.", "Error message", "Shown if a block cannot load.", { max: 60 }),

  // ---------------- footer wording (menu items themselves live in Navigation)
  f("footer_title_casinos", "footer", TEXT, "Casinos", "Footer column 1 title", "Heading above the first menu column.", { max: 40 }),
  f("footer_title_company", "footer", TEXT, "Company", "Footer column 2 title", "Heading above the second menu column.", { max: 40 }),
  f("footer_title_support", "footer", TEXT, "Support", "Footer column 3 title", "Heading above the third menu column.", { max: 40 }),
  f("footer_title_legal", "footer", TEXT, "Legal", "Footer column 4 title", "Heading above the fourth menu column.", { max: 40 }),
  b("footer_newsletter_enabled", "footer", "Show newsletter signup", "The email box in the footer.", { needs: "subscriptions" }),
  f("footer_newsletter_title", "footer", TEXT, "Subscribe to our newsletter", "Newsletter title", "Heading of the signup box.", { max: 80, needs: "subscriptions" }),
  f("footer_newsletter_text", "footer", TEXT, "Get the latest bonuses and reviews from {site} in your inbox.", "Newsletter text", "{site} becomes your site name.", { max: 200, needs: "subscriptions" }),
  f("footer_newsletter_placeholder", "footer", TEXT, "Your email address", "Newsletter email hint", "Text inside the empty email box.", { max: 60, needs: "subscriptions" }),
  f("footer_newsletter_button", "footer", TEXT, "Subscribe", "Newsletter button", "Text of the button.", { max: 30, needs: "subscriptions" }),
  f("footer_disclaimer_label", "footer", TEXT, "Disclaimer:", "Disclaimer label", "Bold word before the disclaimer text.", { max: 40 }),
  f("footer_copyright", "footer", TEXT, "Copyright © {year} {site}. All rights reserved.", "Copyright line", "{year} and {site} are filled in for you.", { max: 200 }),
  f("footer_install_label", "footer", TEXT, "📱 Install {site} App", "Install app button", "Shown only on devices that can install the site as an app.", { max: 60 }),

  // ---------------- page width (joins the existing "layout" group of the Look and feel screen)
  f("layout_force_desktop", "layout", BOOL, false, "Always use the wide desktop layout", "On: phones and tablets get the full desktop page, scaled to fit the screen (visitors can pinch to zoom). Off: the normal responsive layout.", {}),
  f("layout_desktop_width", "layout", INT, "1280", "Desktop layout width (pixels)", "Width the page is laid out at when the switch above is on. Between 960 and 1920; 1280 suits most sites.", { min: 960, max: 1920 }),
];

// Wording added after the first release (kept in separate lists so each area is easy to find).
const ACCOUNT_FIELDS = [
  f("account_forgot_title", "account", TEXT, "Forgot Password", "Forgot password: heading", "Main heading.", { max: 60, needs: "accounts" }),
  f("account_forgot_lead", "account", TEXT, "Enter the email address on your account and we'll send you a link to reset your password.", "Forgot password: introduction", "Sentence under the heading.", { max: 240, needs: "accounts" }),
  f("account_forgot_email_label", "account", TEXT, "Email", "Forgot password: email label", "Label above the email box.", { max: 40, needs: "accounts" }),
  f("account_forgot_button", "account", TEXT, "Send Reset Link", "Forgot password: button", "Text of the button.", { max: 40, needs: "accounts" }),
  f("account_back_to_login", "account", TEXT, "Back to login", "Back to login link", "Link under the forgot and reset forms.", { max: 40, needs: "accounts" }),
  f("account_forgot_seo_title", "account", TEXT, "Forgot Password", "Forgot password: search title", "Browser tab title.", { max: 120, needs: "accounts" }),
  f("account_forgot_seo_description", "account", TEXT, "Reset your {site} password", "Forgot password: search description", "Search results text.", { max: 300, needs: "accounts" }),
  f("account_reset_title", "account", TEXT, "Reset Password", "Reset password: heading", "Main heading.", { max: 60, needs: "accounts" }),
  f("account_reset_password_label", "account", TEXT, "New Password", "Reset password: new password label", "Label above the first box.", { max: 40, needs: "accounts" }),
  f("account_reset_confirm_label", "account", TEXT, "Confirm New Password", "Reset password: confirm label", "Label above the second box.", { max: 40, needs: "accounts" }),
  f("account_reset_button", "account", TEXT, "Reset Password", "Reset password: button", "Text of the button.", { max: 40, needs: "accounts" }),
  f("account_reset_seo_title", "account", TEXT, "Reset Password", "Reset password: search title", "Browser tab title.", { max: 120, needs: "accounts" }),
  f("account_reset_seo_description", "account", TEXT, "Reset your {site} password", "Reset password: search description", "Search results text.", { max: 300, needs: "accounts" }),
];

const ITEM_FIELDS = [
  f("item_age_notice", "item_pages", TEXT, "18+ | PLAY RESPONSIBLY | T&CS APPLY", "Age and responsible-play line", "Small line under the visit button.", { max: 120 }),
  f("item_visit_button", "item_pages", TEXT, "Visit {name}", "Visit button", "{name} becomes the item name.", { max: 60 }),
  f("item_about_heading", "item_pages", TEXT, "About {name}", "About heading", "{name} becomes the item name.", { max: 80 }),
  f("item_features_heading", "item_pages", TEXT, "Features", "Features heading", "Heading above the features list.", { max: 60 }),
  f("item_sports_heading", "item_pages", TEXT, "Sports Covered", "Sports heading", "Heading above the sports list (sportsbooks).", { max: 60 }),
  f("item_payments_heading", "item_pages", TEXT, "Payment Methods", "Payment methods heading", "Heading above the payment list.", { max: 60 }),
  f("item_details_heading", "item_pages", TEXT, "Details", "Details heading", "Heading above the extra fields.", { max: 60 }),
  f("item_reviews_heading", "item_pages", TEXT, "Reviews", "Reviews heading", "Heading above the reader reviews.", { max: 60 }),
  f("item_info_heading", "item_pages", TEXT, "{name} Info", "Info card heading", "{name} becomes the item name.", { max: 80 }),
  f("item_rating_label", "item_pages", TEXT, "Rating", "Rating label", "Label in the info card.", { max: 30 }),
  f("item_license_label", "item_pages", TEXT, "License", "License label", "Label in the info card.", { max: 30 }),
  f("item_status_label", "item_pages", TEXT, "Status", "Status label", "Label in the info card.", { max: 30 }),
  f("item_related_heading", "item_pages", TEXT, "Related {type}", "Related items heading", "{type} becomes the content type name.", { max: 80 }),
  f("landing_custom_intro", "item_pages", TEXT, "Browse our directory of {type_lower}.", "Custom type list: introduction", "Used on every custom content type list page. {type} is the plural name, {type_lower} the same in lower case.", { max: 300 }),
  f("landing_custom_seo_title", "item_pages", TEXT, "{type} — {site}", "Custom type list: search title", "Browser tab and search results.", { max: 120 }),
  f("landing_custom_seo_description", "item_pages", TEXT, "Directory of {type_lower}.", "Custom type list: search description", "Search results text.", { max: 300 }),
];

const SYSTEM_FIELDS = [
  f("system_404_title", "system", TEXT, "404 - Page Not Found", "Not found: search title", "Browser tab title of the 404 page.", { max: 120 }),
  f("system_404_description", "system", TEXT, "Sorry, this page does not exist on {site}.", "Not found: search description", "Search description of the 404 page.", { max: 300 }),
  f("system_404_hint", "system", TEXT, "The page you are looking for does not exist or may have been moved.", "Not found: message", "Sentence shown on the 404 page.", { max: 240 }),
  f("system_404_home", "system", TEXT, "Go Home", "Not found: home button", "Text of the first button.", { max: 40 }),
  f("system_404_casinos", "system", TEXT, "Browse Casinos", "Not found: casinos button", "Text of the second button.", { max: 40, needs: "casino" }),
  f("system_news_kicker", "system", TEXT, "News", "News section pages: label", "Small label above the heading on news section pages.", { max: 40, needs: "news" }),
  f("system_news_search_placeholder", "system", TEXT, "Search news articles...", "News search: hint", "Text inside the empty news search box.", { max: 80, needs: "news" }),
  f("system_news_search_label", "system", TEXT, "Search news", "News search: screen-reader label", "Read aloud by screen readers.", { max: 60, needs: "news" }),
  f("system_news_search_button", "system", TEXT, "Search", "News search: button", "Text of the search button.", { max: 30, needs: "news" }),
  f("system_authors_heading", "system", TEXT, "Our Authors", "Authors list: heading", "Heading above the authors grid.", { max: 60, needs: "authors" }),
  f("system_research_all_types", "system", TEXT, "All types", "Research filter: all types", "First option of the type filter.", { max: 40, needs: "research" }),
  f("system_research_all_countries", "system", TEXT, "All countries", "Research filter: all countries", "First option of the country filter.", { max: 40, needs: "research" }),
  f("system_research_all_related", "system", TEXT, "Related to anything", "Research filter: all related", "First option of the related filter.", { max: 40, needs: "research" }),
  f("system_research_clear", "system", TEXT, "Clear filters", "Research filter: clear button", "Text of the clear button.", { max: 40, needs: "research" }),
  f("system_research_no_match", "system", TEXT, "No research matches those filters.", "Research filter: nothing found", "Shown when filters hide everything.", { max: 120, needs: "research" }),
  f("system_research_showing", "system", TEXT, "Showing {count} of {total}", "Research filter: result count", "{count} is how many are visible, {total} how many exist.", { max: 60, needs: "research" }),
  f("system_research_type_label", "system", TEXT, "Filter by type", "Research filter: type label (screen reader)", "Read aloud by screen readers.", { max: 60, needs: "research" }),
  f("system_research_country_label", "system", TEXT, "Filter by country", "Research filter: country label (screen reader)", "Read aloud by screen readers.", { max: 60, needs: "research" }),
  f("system_research_related_label", "system", TEXT, "Filter by related regulator or topic", "Research filter: related label (screen reader)", "Read aloud by screen readers.", { max: 80, needs: "research" }),
  f("system_research_sort_label", "system", TEXT, "Sort research", "Research filter: sort label (screen reader)", "Read aloud by screen readers.", { max: 60, needs: "research" }),
  f("system_aria_search", "system", TEXT, "Search", "Header: search label (screen reader)", "Read aloud by screen readers.", { max: 40 }),
  f("system_aria_menu", "system", TEXT, "Menu", "Header: menu button label (screen reader)", "Read aloud by screen readers.", { max: 40 }),
  f("system_aria_close_search", "system", TEXT, "Close search", "Header: close search label (screen reader)", "Read aloud by screen readers.", { max: 40 }),
  f("system_aria_scroll_top", "system", TEXT, "Scroll to top", "Scroll to top button label (screen reader)", "Read aloud by screen readers.", { max: 40 }),
];

// ---------------- sub-headings: every field gets a `section` so the dashboard can draw one heading per area
const HOME_SECTION = { casinos: "Top rated casinos", reviews: "Latest reviews", news: "Latest news" };
const BLOCK_SECTION = { casinos: "Block: top casinos", news: "Block: latest news", countries: "Block: browse by country", categories: "Block: categories" };
const ACCOUNT_SECTION = { forgot: "Forgot password", reset: "Reset password", login: "Login", register: "Register", back: "Forgot and reset password" };
function sectionOf(x, pageLabel) {
  const k = x.key;
  let m;
  if (x.group === "layout") return "Wide layout";
  if (x.group === "home_sections") return HOME_SECTION[(k.match(/^home_([a-z]+)_/) || [])[1]] || "Homepage";
  if (x.group === "sidebar") return (m = k.match(/^sidebar_([a-z]+)_/)) && BLOCK_SECTION[m[1]] ? BLOCK_SECTION[m[1]] : "Sidebar on or off, and messages";
  if (x.group === "footer") return /^footer_title_/.test(k) ? "Column titles" : /^footer_newsletter_/.test(k) ? "Newsletter signup" : "Copyright and notices";
  if (x.group === "account") return ACCOUNT_SECTION[(k.match(/^(?:landing|account)_([a-z]+)/) || [])[1]] || "Account pages";
  if (x.group === "item_pages") return /^landing_custom_/.test(k) ? "Custom content type list pages" : "Item page headings and labels";
  if (x.group === "system") {
    if (/^system_404/.test(k)) return "Not found page";
    if (/^system_news/.test(k)) return "News pages";
    if (/^system_authors/.test(k)) return "Authors list";
    if (/^system_research/.test(k)) return "Research filters";
    return "Screen-reader labels";
  }
  if (x.group === "landing") return pageLabel[(k.match(/^landing_([a-z]+)_/) || [])[1]] || "Other pages";
  return "General";
}
function withSections(list) {
  const pageLabel = {};
  for (const x of list) { const m = x.key.match(/^landing_([a-z]+)_title$/); if (m && x.group === "landing") pageLabel[m[1]] = x.label.replace(/: heading$/, ""); }
  const out = list.map((x) => ({ ...x, section: sectionOf(x, pageLabel) }));
  // Keep each section's fields together (a block's position field was defined after all the blocks), first appearance decides the order.
  const first = new Map();
  out.forEach((x, i) => { const k = `${x.group}|${x.section}`; if (!first.has(k)) first.set(k, i); });
  return out.map((x, i) => ({ x, i })).sort((a, b) => first.get(`${a.x.group}|${a.x.section}`) - first.get(`${b.x.group}|${b.x.section}`) || a.i - b.i).map((e) => e.x);
}

const L = (page, label, title, intro, seoTitle, seoDesc, needs, extra = []) => [
  f(`landing_${page}_title`, "landing", TEXT, title, `${label}: heading`, "The main heading on the page.", { max: 120, needs }),
  f(`landing_${page}_intro`, "landing", TEXT, intro, `${label}: introduction`, "The sentence under the heading.", { max: 300, needs }),
  f(`landing_${page}_seo_title`, "landing", TEXT, seoTitle, `${label}: search title`, "Browser tab and search results. {site} becomes your site name. A per-page SEO entry still wins.", { max: 120, needs }),
  f(`landing_${page}_seo_description`, "landing", TEXT, seoDesc, `${label}: search description`, "Search results text. Aim for 120 to 160 characters.", { max: 300, needs }),
  ...extra,
];

export const LANDING_TEXT_FIELDS = [
  ...L("casino", "Casinos (/en/casino)", "All Casinos", "Browse our complete directory of reviewed online casinos.", "All Online Casinos — {site}", "Complete directory of reviewed online casinos with bonuses and ratings.", "casino"),
  ...L("review", "Reviews (/en/review)", "All Reviews", "Browse our complete collection of casino reviews.", "All Casino Reviews — {site}", "In-depth casino reviews with pros, cons, and ratings.", "reviews"),
  ...L("category", "Categories (/en/category)", "All Categories", "Browse casinos by category.", "Casino Categories — {site}", "Browse online casinos by category on {site}.", "taxonomy"),
  ...L("country", "Countries (/en/country)", "Explore Online Casinos by Country", "Compare online gambling markets, regulations, payment methods and casino options by country.", "Online Casinos by Country — {site}", "Find online casinos available in your country on {site}.", "taxonomy", [
    f("landing_country_all_heading", "landing", TEXT, "Browse All Countries", "Countries: all-countries heading", "Heading above the full alphabetical list.", { max: 80, needs: "taxonomy" }),
    f("landing_country_search_placeholder", "landing", TEXT, "Search countries...", "Countries: search hint", "Text inside the empty search box.", { max: 60, needs: "taxonomy" }),
  ]),
  ...L("payment", "Payment methods (/en/payment-methods)", "Payment Methods", "Browse casinos by the deposit and withdrawal methods they support.", "Payment Methods — {site}", "Browse online casinos by supported payment method on {site}.", "casino"),
  ...L("affiliate", "Affiliate partners (/en/affiliate)", "Affiliate Partners", "Browse our directory of reviewed affiliate partners and programs.", "Affiliate Partners — {site}", "Directory of reviewed affiliate partners and programs.", "partners"),
  ...L("author", "Authors (/en/author)", "Authors", "Meet the authors and editorial team behind our content.", "Authors", "Meet the authors and editorial team behind our content.", "authors"),
  ...L("updates", "Platform updates (/en/updates)", "Platform Updates", "Latest {site} platform updates, improvements, features and announcements.", "Platform Updates — {site}", "Latest {site} platform updates, new features, improvements and announcements.", "updates"),
  ...L("news", "News (/en/news)", "News", "Latest iGaming industry news and updates from {site}.", "News | {site}", "Latest iGaming industry news and updates from {site}.", "news"),
  ...L("research", "Research (/en/research)", "Research", "Independent, source-cited research on online casino regulation, licensing, and player protection.", "Research | {site}", "Independent research on online casino regulation, regulators, licensing, and player protection.", "research", [
    f("landing_research_search_placeholder", "landing", TEXT, "Search research by title, country, or topic...", "Research: search hint", "Text inside the empty filter box.", { max: 100, needs: "research" }),
    f("landing_research_featured_heading", "landing", TEXT, "Featured research", "Research: featured heading", "Heading above the featured items.", { max: 60, needs: "research" }),
    f("landing_research_featured_badge", "landing", TEXT, "Editor's picks", "Research: featured badge", "Small label next to the featured heading.", { max: 40, needs: "research" }),
    f("landing_research_all_heading", "landing", TEXT, "All research", "Research: full list heading", "Heading above the full list when featured items are shown.", { max: 60, needs: "research" }),
    f("landing_research_empty", "landing", TEXT, "No published research yet.", "Research: empty message", "Shown on a research type page that has no items.", { max: 120, needs: "research" }),
  ]),
  ...L("sportsbook", "Sportsbooks (/en/sportsbook)", "All Sportsbooks", "Browse our directory of reviewed sportsbooks.", "All Sportsbooks — {site}", "Complete directory of reviewed sportsbooks with ratings and features.", "content.sportsbook"),
  ...L("search", "Site search (/en/search)", "Search", "", "Search | {site}", "Search everything published on {site}.", "search", [
    f("landing_search_results_heading", "landing", TEXT, "Search results for “{query}”", "Search: results heading", "{query} becomes what the visitor typed.", { max: 100 }),
    f("landing_search_results_count", "landing", TEXT, "{count} results", "Search: result count", "{count} becomes the number of results.", { max: 40 }),
    f("landing_search_results_count_one", "landing", TEXT, "{count} result", "Search: result count (one)", "Used when exactly one result is found.", { max: 40 }),
  ]),
  ...L("comparison", "Comparison lists (/en/compare/<type>)", "{type} Comparisons", "Head-to-head comparisons.", "{type} Comparisons — {site}", "Head-to-head comparisons.", "reviews.comparisons", []),
  f("landing_login_title", "account", TEXT, "Login", "Login: heading", "The main heading on the login page.", { max: 60, needs: "accounts" }),
  f("landing_login_seo_title", "account", TEXT, "Login", "Login: search title", "Browser tab title.", { max: 120, needs: "accounts" }),
  f("landing_login_seo_description", "account", TEXT, "{site} Login", "Login: search description", "Search results text.", { max: 300, needs: "accounts" }),
  f("landing_register_title", "account", TEXT, "Create Account", "Register: heading", "The main heading on the registration page.", { max: 60, needs: "accounts" }),
  f("landing_register_seo_title", "account", TEXT, "Register", "Register: search title", "Browser tab title.", { max: 120, needs: "accounts" }),
  f("landing_register_seo_description", "account", TEXT, "Create {site} account", "Register: search description", "Search results text.", { max: 300, needs: "accounts" }),
  ...L("sitemap", "Sitemap (/en/sitemap)", "{site} Sitemap", "Explore casino reviews, rankings, guides, news and useful resources from {site}.", "{site} Sitemap", "Explore casino reviews, rankings, guides and industry news.", null, [
    f("landing_sitemap_casinos_title", "landing", TEXT, "Casino Reviews", "Sitemap: casinos card title", "Heading of the first card.", { max: 60 }),
    f("landing_sitemap_casinos_text", "landing", TEXT, "Explore our online casino database and operator profiles.", "Sitemap: casinos card text", "Sentence under the card heading.", { max: 160 }),
    f("landing_sitemap_reviews_title", "landing", TEXT, "Expert Reviews", "Sitemap: reviews card title", "Heading of the second card.", { max: 60 }),
    f("landing_sitemap_reviews_text", "landing", TEXT, "Detailed casino reviews, bonuses, games and payment guides.", "Sitemap: reviews card text", "Sentence under the card heading.", { max: 160 }),
    f("landing_sitemap_news_title", "landing", TEXT, "Casino News", "Sitemap: news card title", "Heading of the third card.", { max: 60 }),
    f("landing_sitemap_news_text", "landing", TEXT, "Latest iGaming updates, trends and industry insights.", "Sitemap: news card text", "Sentence under the card heading.", { max: 160 }),
    f("landing_sitemap_pages_title", "landing", TEXT, "Useful Pages", "Sitemap: pages card title", "Heading of the fourth card.", { max: 60 }),
    f("landing_sitemap_pages_text", "landing", TEXT, "Learn more about {site} and our policies.", "Sitemap: pages card text", "Sentence under the card heading.", { max: 160 }),
  ]),
];

export const ALL_TEXT_FIELDS = withSections([...TEXT_FIELDS, ...ACCOUNT_FIELDS, ...ITEM_FIELDS, ...SYSTEM_FIELDS, ...LANDING_TEXT_FIELDS]);
export const TEXT_DEFAULTS = Object.freeze(Object.fromEntries(ALL_TEXT_FIELDS.map((x) => [x.key, x.type === BOOL ? (x.def ? "1" : "0") : String(x.def)])));
export const TEXT_KEYS = new Set(ALL_TEXT_FIELDS.map((x) => x.key));
