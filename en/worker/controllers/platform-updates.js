// Platform updates list and update page.
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import * as platformUpdates from "../database/platform-updates.js";
import { buildBreadcrumbs } from "../breadcrumbs.js";
import { cacheHeaders, escapeHtml, formatDate, safeAlt } from "./shared.js";
import { render404 } from "./system-pages.js";

export async function renderUpdatesList(request, env) {
  const renderer = new Renderer(env, request);

  const [site, updates, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    platformUpdates.getAllPlatformUpdates(env.DB),
    renderer.renderAllComponents("updates_list", "updates_list"),
    renderer.loadDynamicSeo("updates_list", "updates_list"),
  ]);

  const updateCards = updates.map(update => {

    const imageSrc = update.featured_image_url || update.featured_image_thumbnail || "";
    const image = imageSrc
      ? `
        <img
          src="${escapeHtml(imageSrc)}"
          alt="${escapeHtml(safeAlt(update.featured_image_alt, update.title))}"
          class="update-card-image"
          loading="lazy"
        >
      `
      : "";

    const date = formatDate(
      update.published_at || update.created_at
    );

    return `
      <article class="update-card">

        ${image}

        <div class="update-card-body">

          <div class="update-card-label">
            Platform Update
          </div>

          <h2>
            <a href="/en/updates/${update.slug}">
              ${update.title}
            </a>
          </h2>

          ${
            update.excerpt
              ? `<p>${update.excerpt}</p>`
              : ""
          }

          <div class="update-card-meta">
            ${date}
          </div>

        </div>

      </article>
    `;
  }).join("");

  const listSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
      "name": `${site.siteName} Platform Updates`,
    "description": dynamicSeo.seo_description || `${site.siteName} latest updates, improvements, features and announcements`,
    "url": site.url("/en/updates"),
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": updates.map((update, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "url": site.url(`/en/updates/${update.slug}`),
        "name": update.title
      }))
    }
  };

  const html = await renderer.render(
    "updates.html",
    {
      canonical:
        dynamicSeo.canonical || site.url(`/en/updates`),

      category: "Platform Updates",

      description:
        dynamicSeo.seo_description || `Latest ${site.siteName} platform updates, improvements, features and announcements.`,

      update_cards:
        updateCards,

      components_top:
        allComponents.top,

      components_content_top:
        allComponents.content_top,

      components_content_bottom:
        allComponents.content_bottom,

      components_bottom:
        allComponents.bottom,

      components_sidebar:
        allComponents.sidebar,
      seo_title: dynamicSeo.seo_title || `Platform Updates — ${site.siteName}`,
      seo_description: dynamicSeo.seo_description || `Latest ${site.siteName} platform updates, new features, improvements and announcements.`,
      seo_keywords: dynamicSeo.seo_keywords || ""
    },
    listSchema,
    buildBreadcrumbs("updatesList")
  );

  return new Response(html, {
    headers: cacheHeaders()
  });
}

export async function renderUpdate(request, env, slug) {
  const update =
    await platformUpdates.getPlatformUpdateBySlug(
      env.DB,
      slug
    );

  if (!update) {
    return render404(request, env);
  }

  const renderer = new Renderer(env, request);

  const [site, allComponents, dynamicSeo] = await Promise.all([
    getSiteContext(request, env),
    renderer.renderAllComponents("update", slug),
    renderer.loadDynamicSeo("update", slug),
  ]);

  const publishedDate =
    formatDate(
      update.published_at ||
      update.created_at
    );

  const updatedDate =
    formatDate(
      update.updated_at ||
      update.created_at
    );

  const updateSchema = {
    "@context": "https://schema.org",
    "@type": "Article",

    "headline": update.title,

    "description":
      update.seo_description ||
      update.excerpt ||
      "",

    "datePublished":
      update.published_at ||
      update.created_at,

    "dateModified":
      update.updated_at ||
      update.created_at,

    "author": {
      "@type": "Person",
      "name": update.author_name || site.siteName
    },

    "publisher": {
      "@type": "Organization",
      "name": site.siteName,
      "url": site.origin
    },

    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": site.url(`/en/updates/${slug}`)
    }
  };

  const html = await renderer.render(
    "update.html",
    {
      ...update,
      title: escapeHtml(update.title),

      canonical:
        dynamicSeo.canonical ||
        site.url(`/en/updates/${slug}`),

      author_name:
        update.author_name || "",

      author_avatar:
        update.author_avatar || "",

      author_role:
        update.author_role || "",

      author_slug:
        update.author_slug || "",

      published_date:
        publishedDate,

      updated_date:
        updatedDate,

      seo_title:
        dynamicSeo.seo_title ||
        update.seo_title ||
        update.title,

      seo_description:
        dynamicSeo.seo_description ||
        update.seo_description ||
        update.excerpt ||
        "",

      seo_keywords:
        dynamicSeo.seo_keywords ||
        update.seo_keywords ||
        "",

      og_type: "article",

      og_image:
        update.featured_image_url
          ? site.url(update.featured_image_url)
          : site.ogImageUrl,

      og_image_alt:
        safeAlt(update.featured_image_alt, update.title),

      ...(update.featured_image_width
        ? { og_image_width: update.featured_image_width }
        : {}),

      ...(update.featured_image_height
        ? { og_image_height: update.featured_image_height }
        : {}),

      components_top:
        allComponents.top,

      components_content_top:
        allComponents.content_top,

      components_content_bottom:
        allComponents.content_bottom,

      components_bottom:
        allComponents.bottom,

      components_sidebar:
        allComponents.sidebar
    },
    updateSchema,
    buildBreadcrumbs(
      "update",
      { title: update.title }
    )
  );

  return new Response(html, {
    headers: cacheHeaders()
  });
}
