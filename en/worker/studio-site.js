// Loads the site's own content for the design studios: what the Header & Hero settings, the site name and the header navigation hold.
// Read-only. The studios use it so previews show the customer's real wording, and the live site never shows invented wording.
import { getAllSettings } from "./database/settings.js";
import { getNavItems } from "./database/nav.js";
import { parseHeaderHero } from "./header-hero.js";
import { getAllCasinos } from "./database/casinos.js";
import { getLatestNews } from "./database/news.js";
import { getSiteSettings } from "./site-settings/get-site-settings.js";
import { buildThemeCss } from "./site-settings/theme.js";

export async function loadStudioSite(env) {
  const values = await getAllSettings(env.DB);
  let nav = [];
  try { nav = (await getNavItems(env.DB, "header")).filter((n) => !n.parent_id).map((n) => ({ label: n.label, url: n.url })); } catch { nav = []; }
  return { site: { siteName: values.site_name || "", headerHero: parseHeaderHero(values) }, nav, values };
}

// Card Studio previews: the site's own theme CSS and a few of its real casinos / news titles, so cards look like they will on the site.
// Read-only; any failure just falls back to neutral sample wording.
export async function loadCardSample(env, origin) {
  let themeCss = "", casinos = [], news = [];
  try { themeCss = buildThemeCss(await getSiteSettings(env.DB, origin, env)) || ""; } catch { themeCss = ""; }
  try { casinos = (await getAllCasinos(env.DB)).slice(0, 2).map((c) => ({ name: c.name, rating: c.rating, bonus: c.bonus_value || c.bonus_title || "" })); } catch { casinos = []; }
  try { news = (await getLatestNews(env.DB, 2)).map((n) => ({ title: n.title, excerpt: n.excerpt || "" })); } catch { news = []; }
  return { themeCss, real: { casinos, news } };
}
