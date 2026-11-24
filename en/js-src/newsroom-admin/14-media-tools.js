  // ── Media: podcast feed settings, video and gallery how-to ──
  async function renderMedia(panel) {
    const d = await api("media/status"); if (!d) return;
    const P = (state.meta && state.meta.permissions) || {};
    const f = d.flags || {};
    const on = (v) => (v ? "switched on" : "switched off");
    panel.append(
      h("h3", {}, "Video"), h("p", { class: "muted" }, "Status: " + on(f.news_video_embeds) + ". Put a YouTube link on a paragraph by itself. Readers see a play button and nothing loads from YouTube until they press it."),
      h("h3", {}, "Photo galleries"), h("p", { class: "muted" }, "Status: " + on(f.news_galleries) + ". In the article's HTML view, wrap images in <div class=\"nr-gallery\">…</div>. They show as a grid with a full-screen viewer."),
      h("h3", {}, "Podcast feed"), h("p", { class: "muted" }, "Status: " + on(f.news_podcast) + ". Tag an article with your podcast tag and add an audio player. Submit this address to Apple Podcasts and Spotify: "), h("code", {}, d.feed_url));
    if (!P.manage_settings) return;
    const c = d.podcast || {};
    const inp = (k, ph) => h("input", { type: "text", value: c[k] || "", placeholder: ph || "", style: "width:100%" });
    const fields = { podcast_title: inp("podcast_title", "Show name"), podcast_description: inp("podcast_description", "One or two sentences"), podcast_author: inp("podcast_author", "Host or publisher"), podcast_email: inp("podcast_email", "owner@example.com"), podcast_image: inp("podcast_image", "https://… cover image, 3000×3000"), podcast_tag: inp("podcast_tag", "podcast") };
    const explicit = h("input", { type: "checkbox" }); explicit.checked = c.podcast_explicit === "true";
    const names = { podcast_title: "Title", podcast_description: "Description", podcast_author: "Author", podcast_email: "Owner email", podcast_image: "Cover image address", podcast_tag: "Episode tag" };
    panel.append(h("div", { style: "max-width:560px" }, Object.keys(fields).map((k) => label(names[k], fields[k])), h("label", {}, explicit, " Contains explicit content"), h("div", { style: "margin-top:12px" }, h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
      const body = { podcast_explicit: explicit.checked }; Object.keys(fields).forEach((k) => { body[k] = fields[k].value; });
      const r = await api("media/podcast", { body }); if (r) notify("Podcast settings saved");
    } }, "Save podcast settings"))));
  }
