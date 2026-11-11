// Loads the site's own content for the design studios: what the Header & Hero settings, the site name and the header navigation hold.
// Read-only. The studios use it so previews show the customer's real wording, and the live site never shows invented wording.
import { getAllSettings } from "./database/settings.js";
import { getNavItems } from "./database/nav.js";
import { parseHeaderHero } from "./header-hero.js";

export async function loadStudioSite(env) {
  const values = await getAllSettings(env.DB);
  let nav = [];
  try { nav = (await getNavItems(env.DB, "header")).filter((n) => !n.parent_id).map((n) => ({ label: n.label, url: n.url })); } catch { nav = []; }
  return { site: { siteName: values.site_name || "", headerHero: parseHeaderHero(values) }, nav, values };
}
