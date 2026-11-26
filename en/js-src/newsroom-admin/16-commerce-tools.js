  // ── Commerce: product reviews, for-sale listings and blogs with affiliate / marketplace widgets, plus the inquiry inbox ──
  const MODE_NAMES = { editorial: "Standard article (nothing added)", review: "Product review / affiliate", listing: "For-sale listing", blog: "Blog with offers" };
  const NETWORKS = ["Amazon", "Alibaba", "AliExpress", "eBay", "Jumia", "Etsy", "Walmart", "Shopify store", "Other"];
  let commerceLinks = [];

  async function renderCommerce(panel) {
    const P = (state.meta && state.meta.permissions) || {};
    put(panel, h("p", { class: "muted" }, "Add offers, product boxes, a mobile buy bar, a photo gallery or an enquiry form to any article. Nothing shows until the Commerce switches are on (Flags tab) and the article's type is not “Standard”. Works for any marketplace or affiliate programme. Your links go through /en/go/<your code> so every click is counted."));
    const linksBox = h("div", {}); const pickBox = h("div", {}); const formBox = h("div", {});
    put(panel, h("h3", {}, "1. Affiliate links"), linksBox, h("h3", { style: "margin-top:28px" }, "2. Choose an article"), pickBox, formBox);
    await renderNewsLinks(linksBox, P);
    renderArticlePicker(pickBox, formBox, P);
    const inbox = h("div", { style: "margin-top:28px" });
    panel.append(inbox);
    renderInquiries(inbox, P);
  }

  async function renderNewsLinks(box, P) {
    const d = await api("commerce/news-links"); if (!d) return;
    commerceLinks = d.links || [];
    box.replaceChildren();
    const canEdit = !!d.can_manage;
    const copy = async (text) => { try { await navigator.clipboard.writeText(text); notify("Copied"); } catch (e) { notify(text); } };
    const row = (l) => h("tr", {},
      h("td", {}, h("strong", {}, l.label), h("br"), h("span", { class: "muted" }, l.network || "")),
      h("td", {}, h("code", {}, "/en/go/" + l.code), " ", h("button", { type: "button", class: "btn btn--sm", onclick: () => copy(d.go_base + l.code) }, "Copy")),
      h("td", { style: "max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap", title: l.destination_url }, l.destination_url),
      h("td", {}, String(l.clicks_30d), " / ", String(l.clicks_total)),
      h("td", {}, l.status === "active" ? "Active" : "Paused"),
      h("td", {}, canEdit ? [
        h("button", { type: "button", class: "btn btn--sm", onclick: () => editLink(l) }, "Edit"), " ",
        h("button", { type: "button", class: "btn btn--sm", onclick: async () => { const r = await api("commerce/link-status", { body: { id: l.id, status: l.status === "active" ? "paused" : "active" } }); if (r) renderNewsLinks(box, P); } }, l.status === "active" ? "Pause" : "Resume"), " ",
        h("button", { type: "button", class: "btn btn--sm", onclick: async () => { if (!confirm("Delete this link? This cannot be undone.")) return; const r = await api("commerce/link-delete", { body: { id: l.id } }); if (r) { notify("Deleted"); renderNewsLinks(box, P); } } }, "Delete")] : null));
    put(box, commerceLinks.length
      ? h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" }, h("thead", {}, h("tr", {}, ["Link", "Address on your site", "Goes to", "Clicks 30 days / all", "Status", ""].map((t) => h("th", {}, t)))), h("tbody", {}, commerceLinks.map(row))))
      : h("p", { class: "muted" }, "No links yet. Add your first one below."));
    if (!canEdit) { put(box, h("p", { class: "muted" }, "Only people who manage settings can add or change links.")); return; }
    const f = { label: h("input", { type: "text", maxlength: "120", placeholder: "Kettle on Amazon", style: "width:100%" }), network: h("input", { type: "text", list: "ncNetworks", maxlength: "60", placeholder: "Programme, e.g. Amazon", style: "width:100%" }),
      code: h("input", { type: "text", maxlength: "64", placeholder: "amazon-kettle", style: "width:100%" }), dest: h("input", { type: "text", maxlength: "2048", placeholder: "https://… your full affiliate address", style: "width:100%" }), notes: h("input", { type: "text", maxlength: "500", placeholder: "Notes (only you see this)", style: "width:100%" }) };
    let editing = null;
    const title = h("h4", { style: "margin-top:16px" }, "Add a link");
    const saveBtn = h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
      const r = await api("commerce/link-save", { body: { id: editing ? editing.id : undefined, label: f.label.value, network: f.network.value, code: f.code.value, destination_url: f.dest.value, notes: f.notes.value, status: editing ? editing.status : "active" } });
      if (r) { notify(editing ? "Link updated" : "Link added: /en/go/" + r.code); renderNewsLinks(box, P); }
    } }, "Save link");
    const cancel = h("button", { type: "button", class: "btn btn--sm", style: "display:none", onclick: () => renderNewsLinks(box, P) }, "Cancel edit");
    function editLink(l) { editing = l; title.textContent = "Edit link"; f.label.value = l.label; f.network.value = l.network || ""; f.code.value = l.code; f.code.disabled = true; f.dest.value = l.destination_url; f.notes.value = l.notes || ""; cancel.style.display = ""; title.scrollIntoView({ block: "nearest" }); }
    put(box, title, h("div", { style: "max-width:640px;display:grid;gap:8px" },
      label("Name", f.label), label("Programme (Amazon, Alibaba, …)", f.network), h("datalist", { id: "ncNetworks" }, NETWORKS.map((n) => h("option", { value: n }))),
      label("Your short code (the address on your site becomes /en/go/code)", f.code), label("Where it goes (paste the affiliate address you were given)", f.dest), label("Notes", f.notes),
      h("div", { style: "display:flex;gap:8px" }, saveBtn, cancel)));
  }

  async function renderArticlePicker(box, formBox, P) {
    const secSel = h("select", { "aria-label": "Section" }, h("option", { value: "" }, "All sections"));
    const topSel = h("select", { "aria-label": "Topic" }, h("option", { value: "" }, "All topics"));
    const ctrSel = h("select", { "aria-label": "Country" }, h("option", { value: "" }, "All countries"));
    const q = h("input", { type: "search", placeholder: "Search by title, or type an article number", style: "min-width:240px" });
    const list = h("div", { style: "margin-top:10px" });
    const [sec, top, ctr] = await Promise.all([api("taxonomy/list?kind=sections"), api("taxonomy/list?kind=topics"), api("picker/countries")]);
    ((ctr && ctr.countries) || []).forEach((x) => ctrSel.append(h("option", { value: x.code }, x.name)));
    ((sec && sec.items) || []).forEach((x) => secSel.append(h("option", { value: String(x.id) }, x.name)));
    ((top && top.items) || []).forEach((x) => topSel.append(h("option", { value: String(x.id) }, x.name)));
    const open = async (id) => { const d = await api("commerce/article?id=" + id); if (!d) return; state.articleId = id; formBox.replaceChildren(); buildCommerceForm(formBox, d, P); formBox.scrollIntoView({ block: "start" }); };
    const run = async () => {
      const r = await api("commerce/pick?q=" + encodeURIComponent(q.value) + "&section=" + secSel.value + "&topic=" + topSel.value + "&country=" + ctrSel.value); if (!r) return;
      list.replaceChildren();
      if (!r.articles.length) { list.append(h("p", { class: "muted" }, "No articles match.")); return; }
      list.append(h("div", { style: "overflow-x:auto" }, h("table", { class: "admin-table" }, h("thead", {}, h("tr", {}, ["Article", "Section", "Status", "Commerce", ""].map((t) => h("th", {}, t)))),
        h("tbody", {}, r.articles.map((a) => h("tr", {}, h("td", {}, a.title, h("br"), h("span", { class: "muted" }, "#" + a.id)), h("td", {}, a.section_name || ""), h("td", {}, a.published ? "Published" : "Draft"), h("td", {}, a.commerce_mode && a.commerce_mode !== "editorial" ? pretty(a.commerce_mode) : "—"),
          h("td", {}, h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: () => open(a.id) }, "Set up"))))))));
    };
    let timer = null; q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 300); });
    secSel.addEventListener("change", run); topSel.addEventListener("change", run); ctrSel.addEventListener("change", run);
    put(box, h("div", { style: "display:flex;gap:8px;flex-wrap:wrap;align-items:center" }, secSel, topSel, ctrSel, q, h("button", { type: "button", class: "btn btn--sm", onclick: run }, "Search")), list);
    await run();
    if (state.articleId) open(state.articleId);
  }

  // The same media picker the rest of the admin uses (upload, folders, search).
  function pickImage(done) {
    if (!window.MediaPicker || typeof window.MediaPicker.openImagePicker !== "function") { notify("The media picker did not load. Refresh the page and try again.", "error"); return; }
    window.MediaPicker.openImagePicker(done);
  }

  function buildCommerceForm(box, d, P) {
    const cfg = d.config || {};
    const f = d.flags || {};
    const off = ["news_commerce", "news_commerce_widgets", "news_commerce_sticky_bar", "news_commerce_gallery", "news_commerce_inquiry"].filter((k) => !f[k]);
    put(box, h("h3", { style: "margin-top:24px" }, "3. Set up: " + d.article.title),
      off.length ? h("p", { class: "muted" }, "Currently switched off (Flags tab): " + off.join(", ")) : null);
    const mode = h("select", {}, ["editorial", "review", "listing", "blog"].map((m) => h("option", { value: m, selected: cfg.mode === m }, MODE_NAMES[m])));
    const cta = h("input", { type: "text", value: cfg.cta_label || "", maxlength: "30", placeholder: "Buy now", style: "width:100%" });
    const disc = h("textarea", { rows: "2", maxlength: "400", style: "width:100%", placeholder: "Leave empty for the standard affiliate disclosure" }, cfg.disclosure_text || "");
    disc.value = cfg.disclosure_text || "";
    const sticky = h("input", { type: "checkbox", checked: cfg.sticky_enabled !== false });
    put(box, label("Article type (Standard = this article is not changed)", mode), label("Default button text", cta), label("Disclosure text", disc), h("label", {}, sticky, " Show the mobile sticky bar"));

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
      wf.image = h("input", { type: "text", value: w.image_url || "", placeholder: "Picture address, or use the button below", style: "width:100%" });
      wf.legacyLink = w.tracking_link_id || null;   // widgets made earlier with a tracking link keep it exactly as it was
      wf.go = h("select", {}, h("option", { value: "" }, wf.legacyLink ? "— existing tracking link kept —" : "— choose an affiliate link —"),
        commerceLinks.map((l) => h("option", { value: l.code, selected: (w.go_code || "").toLowerCase() === l.code.toLowerCase() }, l.label + " (/en/go/" + l.code + ")" + (l.status !== "active" ? " [paused]" : ""))));
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
        label("Picture", wf.image), h("button", { type: "button", class: "btn btn--sm", onclick: () => pickImage((m) => { wf.image.value = m.url || ""; }) }, "Choose from media library"),
        h("div", { style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px" }, label("Affiliate link", wf.go), wf.legacyLink ? h("p", { class: "muted" }, "This widget also keeps its earlier tracking link #" + wf.legacyLink + ".") : null),
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
    const pickBtn = h("button", { type: "button", class: "btn btn--sm", onclick: () => pickImage((m) => {
      if (!m || !m.id) return;
      if (gallery.some((g) => g.media_id === m.id)) { notify("That photo is already in the gallery"); return; }
      gallery.push({ media_id: m.id, caption: "", url: m.thumbnail_url || m.url, alt: m.alt_text || "" }); drawGallery();
    }) }, "Add photos from the media library");
    const parseSpecs = (txt) => String(txt || "").split("\n").map((l) => { const i = l.indexOf(":"); return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : null; }).filter(Boolean);
    const saveBtn = h("button", { type: "button", class: "btn btn--primary", style: "margin-top:14px", onclick: async () => {
      const body = {
        id: d.article.id,
        config: { mode: mode.value, cta_label: cta.value, disclosure_text: disc.value, sticky_enabled: sticky.checked },
        widgets: widgetForms.map((w) => ({ slot: w.slot.value, widget_type: w.type.value, position: Number(w.position.value) || 0, title: w.title.value, subtitle: w.subtitle.value, badge: w.badge.value, price_text: w.price.value, cta_label: w.cta.value, image_url: w.image.value, tracking_link_id: w.legacyLink, go_code: w.go.value, specs: parseSpecs(w.specs.value), status: w.status.value, starts_at: w.starts.value.trim() || null, ends_at: w.ends.value.trim() || null })),
        gallery: gallery.map((g) => ({ media_id: g.media_id, caption: g.caption }))
      };
      const r = await api("commerce/save", { body }); if (r) notify("Saved " + r.widgets + " widget(s) and " + r.gallery + " photo(s)");
    } }, "Save commerce setup");

    (async () => {
      (d.widgets || []).forEach(addWidget);
      put(box, h("h3", {}, "Widgets"), h("p", { class: "muted" }, "Top = after the first paragraph, Bottom = after the last, Below = in columns under the article, Sticky = the mobile bar."), widgetsBox,
        h("button", { type: "button", class: "btn btn--sm", onclick: () => addWidget({}) }, "Add widget"),
        h("h3", { style: "margin-top:20px" }, "Photo gallery"), galBox, pickBtn, h("div", {}, saveBtn));
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

