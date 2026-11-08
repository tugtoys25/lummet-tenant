// Called by the page renderer. Never throws: a failure just means no live banners on this page.
import { isEnabled } from "../site-profile/profile.js";
import { loadProfile } from "../site-profile/store.js";
import { loadLiveBanners } from "./load.js";
import { renderLiveBanners, pageInfo } from "./render.js";

export async function liveBannerMarkup(env, request, pathname, country) {
  try {
    const profile = await loadProfile(env, new URL(request.url).hostname);
    if (!isEnabled(profile, "features.banners")) return null;
    return renderLiveBanners(await loadLiveBanners(env, { country, ...pageInfo(pathname), signedIn: false }));
  } catch (e) {
    console.error("Live banners failed:", e.message);
    return null;
  }
}
