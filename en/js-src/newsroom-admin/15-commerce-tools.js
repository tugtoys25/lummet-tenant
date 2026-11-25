  // ── Commerce: affiliate / listing / blog setup for one article, plus the inquiry inbox ──
  async function renderCommerce(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    const idInput = h("input", { type: "number", min: "1", value: state.articleId || "", style: "width:140px", "aria-label": "Article id" });
    const box = h("div", {});
    const load = async () => {
      const id = Number(idInput.value); if (!id) { notify("Enter an article id", "error"); return; }
      const d = await api("commerce/article?id=" + id); if (!d) return;
      state.articleId = id; box.replaceChildren(); buildCommerceForm(box, d, P);
    };
    put(panel,
      h("p", { class: "muted" }, "Turn an article into a product review, a for-sale listing or a blog with widgets. Nothing shows on the site until the Commerce switches are on (Flags tab) and the article's mode is not Editorial. Buy buttons always go through a tracking link (/en/go)."),
      h("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px" }, h("label", {}, "Article id "), idInput, h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: load }, "Load")),
      box);
    if (state.articleId) load();
    const inbox = h("div", { style: "margin-top:28px" });
    panel.append(inbox);
    renderInquiries(inbox, P);
  }

  function buildCommerceForm(box, d, P) {
    const cfg = d.config || {};
    const f = d.flags || {};
    const off = ["news_commerce", "news_commerce_widgets", "news_commerce_sticky_bar", "news_commerce_gallery", "news_commerce_inquiry"].filter((k) => !f[k]);
    put(box, h("h3", {}, d.article.title),
      off.length ? h("p", { class: "muted" }, "Currently switched off (Flags tab): " + off.join(", ")) : null);
    const mode = h("select", {}, ["editorial", "review", "listing", "blog"].map((m) => h("option", { value: m, selected: cfg.mode === m }, pretty(m))));
    const cta = h("input", { type: "text", value: cfg.cta_label || "", maxlength: "30", placeholder: "Buy now", style: "width:100%" });
    const disc = h("textarea", { rows: "2", maxlength: "400", style: "width:100%", placeholder: "Leave empty for the standard affiliate disclosure" }, cfg.disclosure_text || "");
    disc.value = cfg.disclosure_text || "";
    const sticky = h("input", { type: "checkbox", checked: cfg.sticky_enabled !== false });
    put(box, label("Mode (Editorial = this article is not changed)", mode), label("Default button text", cta), label("Disclosure text", disc), h("label", {}, sticky, " Show the mobile sticky bar"));

    let links = [];
    const widgetsBox = h("div", {}); const widgetForms = [];
    const addWidget = (w) => {
      const wf = {}; wf.id = w.id || null;
      const sel = (opts, cur) => h("select", {}, opts.map((o) => h("option", { value: o, selected: cur === o }, pretty(o))));
      wf.slot = sel(["top", "bottom", "below", "sticky"], w.slot || "top");
      wf.type = sel(["buy", "product", "price", "inquiry", "cta"], w.widget_type || "buy");
      wf.title = h("input", { type: "text", value: w.title || "", maxlength: "120", placeholder: "Title", style: "width:100%" });
      wf.subtitle = h("input", { type: "text", value: w.subtitle || "", maxlength: "200", placeholder: "Subtitle", style: "width:100%" });
      wf.badge = h("input", { type: "text", value: w.badge || "", maxlength: "30", placeholder: "Badge, e.g. Our pick" });
      wf.price = h("input", { type: "text", value: w.price_text || "", maxlength: "40", placeholder: "Price text, e.g. from $199" });
      wf.cta = h("input", { type: "text", value: w.cta_label || "", maxlength: "30", placeholder: "Button text" });
      wf.image = h("input", { type: "text", value: w.image_url || "", placeholder: "Picture address (https://… or /path)", style: "width:100%" });
      wf.link = h("select", {}, h("option", { value: "" }, "— no tracking link —"), links.map((l) => h("option", { value: String(l.id), selected: Number(w.tracking_link_id) === l.id }, l.internal_name + " (" + l.tracking_code + ")" + (l.status !== "active" ? " [" + l.status + "]" : ""))));
      wf.go = h("input", { type: "text", value: w.go_code || "", maxlength: "64", placeholder: "or a /go code or casino slug" });
      wf.status = sel(["active", "paused"], w.status || "active");
      wf.starts = h("input", { type: "text", value: w.starts_at || "", placeholder: "Show from 2026-12-01" });
      wf.ends = h("input", { type: "text", value: w.ends_at || "", placeholder: "Hide after 2026-12-31" });
      wf.specs = h("textarea", { rows: "3", style: "width:100%", placeholder: "Specs, one per line: Label: Value (e.g. Bedrooms: 3)" });
      wf.specs.value = (w.specs || []).map((s) => s.label + ": " + s.value).join("\n");
      wf.position = h("input", { type: "number", value: w.position != null ? w.position : widgetForms.length, style: "width:80px" });
      const wrap = h("fieldset", { style: "border:1px solid var(--light-gray);border-radius:8px;padding:10px;margin:10px 0" });
      wf.el = wrap;
      put(wrap, h("legend", {}, "Widget"),
        h("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px" }, label("Position", wf.slot), label("Type", wf.type), label("Order", wf.position), label("Status", wf.status)),
        label("Title", wf.title), label("Subtitle", wf.subtitle),
        h("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px" }, label("Badge", wf.badge), label("Price", wf.price), label("Button text", wf.cta)),
        label("Picture", wf.image),
        h("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px" }, label("Tracking link", wf.link), label("/go code", wf.go)),
        label("Specs (listings and products)", wf.specs),
        h("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px" }, label("Show from", wf.starts), label("Hide after", wf.ends)),
        h("button", { type: "button", class: "btn btn--sm", onclick: () => { wrap.remove(); const i = widgetForms.indexOf(wf); if (i >= 0) widgetForms.splice(i, 1); } }, "Remove widget"));
      widgetForms.push(wf); widgetsBox.append(wrap);
    };

    const gallery = (d.gallery || []).map((g) => ({ media_id: g.media_id, caption: g.caption || "", url: g.thumbnail_url || g.url, alt: g.alt_text || "" }));
    const galBox = h("div", { style: "display:flex;flex-wrap:wrap;gap:10px" });
    const drawGallery = () => {
      galBox.replaceChildren();
      gallery.forEach((g, i) => {
        const cap = h("input", { type: "text", value: g.caption, placeholder: "Caption", maxlength: "200", style: "width:140px", oninput: (e) => { g.caption = e.target.value; } });
        galBox.append(h("figure", { style: "margin:0;width:150px" }, h("img", { src: g.url, alt: g.alt, style: "width:150px;height:100px;object-fit:cover;border-radius:6px" }), cap,
          h("div", {}, h("button", { type: "button", class: "btn btn--sm", onclick: () => { if (i > 0) { gallery.splice(i - 1, 0, gallery.splice(i, 1)[0]); drawGallery(); } } }, "←"), " ",
            h("button", { type: "button", class: "btn btn--sm", onclick: () => { if (i < gallery.length - 1) { gallery.splice(i + 1, 0, gallery.splice(i, 1)[0]); drawGallery(); } } }, "→"), " ",
            h("button", { type: "button", class: "btn btn--sm", onclick: () => { gallery.splice(i, 1); drawGallery(); } }, "✕"))));
      });
    };
    const pickBox = h("div", { style: "margin-top:8px" });
    const pickBtn = h("button", { type: "button", class: "btn btn--sm", onclick: async () => {
      const q = h("input", { type: "text", placeholder: "Search by file name or alt text" });
      const grid = h("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin-top:8px" });
      const run = async () => {
        const r = await api("commerce/images?q=" + encodeURIComponent(q.value)); if (!r) return; grid.replaceChildren();
        for (const im of r.images) grid.append(h("button", { type: "button", style: "border:1px solid var(--light-gray);padding:2px;background:none;cursor:pointer", title: im.filename || "", onclick: () => {
          if (!gallery.some((g) => g.media_id === im.id)) { gallery.push({ media_id: im.id, caption: "", url: im.thumbnail_url || im.url, alt: im.alt_text || "" }); drawGallery(); }
        } }, h("img", { src: im.thumbnail_url || im.url, alt: im.alt_text || "", style: "width:90px;height:60px;object-fit:cover" })));
      };
      pickBox.replaceChildren(h("div", {}, q, " ", h("button", { type: "button", class: "btn btn--sm", onclick: run }, "Search")), grid); run();
    } }, "Add photos from the media library");

    const parseSpecs = (txt) => String(txt || "").split("\n").map((l) => { const i = l.indexOf(":"); return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : null; }).filter(Boolean);
    const saveBtn = h("button", { type: "button", class: "btn btn--primary", style: "margin-top:14px", onclick: async () => {
      const body = {
        id: d.article.id,
        config: { mode: mode.value, cta_label: cta.value, disclosure_text: disc.value, sticky_enabled: sticky.checked },
        widgets: widgetForms.map((w) => ({ slot: w.slot.value, widget_type: w.type.value, position: Number(w.position.value) || 0, title: w.title.value, subtitle: w.subtitle.value, badge: w.badge.value, price_text: w.price.value, cta_label: w.cta.value, image_url: w.image.value, tracking_link_id: w.link.value ? Number(w.link.value) : null, go_code: w.go.value, specs: parseSpecs(w.specs.value), status: w.status.value, starts_at: w.starts.value.trim() || null, ends_at: w.ends.value.trim() || null })),
        gallery: gallery.map((g) => ({ media_id: g.media_id, caption: g.caption }))
      };
      const r = await api("commerce/save", { body }); if (r) notify("Saved " + r.widgets + " widget(s) and " + r.gallery + " photo(s)");
    } }, "Save commerce setup");

    (async () => {
      const lr = await api("commerce/links"); links = (lr && lr.links) || [];
      (d.widgets || []).forEach(addWidget);
      put(box, h("h3", {}, "Widgets"), h("p", { class: "muted" }, "Top = after the first paragraph, Bottom = after the last, Below = in columns under the article, Sticky = the mobile bar."), widgetsBox,
        h("button", { type: "button", class: "btn btn--sm", onclick: () => addWidget({}) }, "Add widget"),
        h("h3", { style: "margin-top:20px" }, "Photo gallery"), galBox, pickBtn, pickBox, h("div", {}, saveBtn));
      drawGallery();
    })();
  }

  async function renderInquiries(box, P) {
    const d = await api("commerce/inquiries"); if (!d) return;
    put(box, h("h3", {}, "Inquiries (for-sale and other non-affiliate content)"));
    if (!d.inquiries.length) { put(box, h("p", { class: "muted" }, "No inquiries yet.")); return; }
    const rows = d.inquiries.map((q) => {
      const st = h("select", { "aria-label": "Status" }, ["new", "read", "replied", "spam"].map((s) => h("option", { value: s, selected: q.status === s }, pretty(s))));
      if (P.update) st.addEventListener("change", async () => { await api("commerce/inquiry-status", { body: { id: q.id, status: st.value } }); });
      else st.disabled = true;
      return h("tr", {}, h("td", {}, q.created_at || ""), h("td", {}, q.article_title || ""), h("td", {}, q.name, h("br"), q.email, q.phone ? h("br") : null, q.phone || ""), h("td", { style: "white-space:pre-wrap;max-width:360px" }, q.message), h("td", {}, st));
    });
    put(box, h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" }, h("thead", {}, h("tr", {}, ["Received", "Article", "From", "Message", "Status"].map((t) => h("th", {}, t)))), h("tbody", {}, rows))));
  }

