// Advanced Homepage studio: edits the config section by section, previews the real homepage, saves, publishes and undoes.
(function () {
  "use strict";
  const API = "/en/api/v1/studio-pro/advanced-home";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let state = null, meta = {}, defaults = null, templates = [], labelDefaults = {}, customDefaults = {}, maxCustom = 8, lookups = { casinos: [], countries: [] };
  let config = null, saved = "", dirty = false, timer = null, previewSeq = 0;

  const LINKS = {
    casinos: ["Casinos", "/en/dashboard/casinos"], geo: ["Geo rules (on each casino)", "/en/dashboard/casinos"], offers: ["Offers", "/en/dashboard/offers"],
    categories: ["Categories", "/en/dashboard/categories"], countries: ["Countries", "/en/dashboard/countries"], payments: ["Payment Methods", "/en/dashboard/payment-methods"],
    reviews: ["Reviews", "/en/dashboard/reviews"], news: ["News", "/en/dashboard/news"], pages: ["Pages", "/en/dashboard/pages"], seo: ["SEO", "/en/dashboard/seo"],
  };
  // One entry per section: a guide (what it does, what to do, where the data comes from) and the fields. hint = the one line under each field.
  const SPEC = {
    hero: { guide: ["The first screen. One promise, one main button, one line of proof.", ["Write a short headline that says what visitors get.", "Use {casino_count}, {country} and {site_name} in any text; they are filled in for each visitor.", "Keep two buttons at most: a main action and a quieter one."], "Visitors then see your quick filters.", []],
      fields: [["kicker", "Small label above the headline", "text", "Optional, a few words."], ["title", "Headline", "text", "Shown as the main title of the page."], ["body", "Short text", "textarea", "One or two sentences. Tokens like {casino_count} work here."], ["primaryLabel", "Main button text", "text", "For example Browse casinos."], ["primaryUrl", "Main button link", "url", "A page on this site (starts with /), an anchor (#name) or https://."], ["secondaryLabel", "Second button text", "text", "Leave empty to hide it."], ["secondaryUrl", "Second button link", "url", "Same rules as the main link."], ["proof", "Line of proof", "text", "Small text under the buttons. Tokens work."], ["align", "Alignment", "select", "Centre suits most sites.", [["center", "Centre"], ["left", "Left"]]]] },
    filters: { guide: ["Quick chips under the hero that jump to a category, country or payment method.", ["Switch on the groups you want.", "Choose how many chips each group shows."], "Chips come from your published categories, countries and payment methods.", ["categories", "countries", "payments"]],
      fields: [["showCategories", "Show categories", "bool", "Chips for your published categories."], ["categoryLimit", "How many categories", "number", "0 to 20.", 0, 20], ["showCountries", "Show countries", "bool", "Featured countries first, then published ones. The visitor's own country comes first."], ["countryLimit", "How many countries", "number", "0 to 20.", 0, 20], ["showPayments", "Show payment methods", "bool", "Chips for your published payment methods."], ["paymentLimit", "How many payment methods", "number", "0 to 20.", 0, 20]] },
    top_picks: { guide: ["A short, ranked list of casinos. Each card has a reason, the bonus with its terms, a score and one Visit button.", ["Leave it on Automatic to list the best-rated casinos, or choose Manual to pick and order them yourself.", "Only casinos that accept the visitor's country are shown. This uses the Geo rules on each casino, exactly like the current homepage. A casino with no geo rule is hidden everywhere.", "The bonus and its terms (wagering, minimum deposit, maximum bonus) come from the casino's active Offer for the visitor's country.", "Under Automatic, casinos without a bonus are skipped unless you switch that off.", "The reason chip uses the casino's first category. In Manual you can type your own, for example Best for crypto."], "Check it with Preview as country, then add Offers and Geo rules to casinos that are missing from the list.", ["casinos", "geo", "offers", "categories"]],
      fields: [["title", "Title", "text", "Tokens like {country} work."], ["subtitle", "Subtitle", "text", "One line under the title."], ["count", "How many casinos", "number", "1 to 12. Ten is a good length.", 1, 12], ["mode", "Which casinos", "select", "Automatic picks the best rated for the visitor's country.", [["auto", "Automatic (best rated)"], ["manual", "Manual (I choose)"]]], ["minRating", "Minimum score (automatic)", "number", "0 to 5. Casinos below it are not listed.", 0, 5], ["requireBonus", "Skip casinos without a bonus (automatic)", "bool", "Avoids cards that say there is no offer."], ["showReason", "Show the reason chip", "bool", "The small label such as Crypto Casinos."], ["showScore", "Show the score", "bool", "Rating out of 5 with a bar."], ["viewAllLabel", "View all button text", "text", "Shown below the list."], ["viewAllUrl", "View all link", "url", "Usually /en/casino."], ["disclosure", "Disclosure line", "textarea", "Shown directly under the picks. Keep it short and plain."], ["disclosureLabel", "Disclosure link text", "text", "Optional."], ["disclosureUrl", "Disclosure link", "url", "Your affiliate disclosure page."]], extra: "picks" },
    browse: { guide: ["Icon cards that lead to your category and country pages.", ["Choose whether to show categories, countries or both.", "Set how many of each. The visitor's own country is shown first."], "Cards come from your published categories and countries.", ["categories", "countries"]],
      fields: [["title", "Title", "text", "Shown above the cards."], ["showCategories", "Show categories", "bool", "A card per published category."], ["categoryLimit", "How many categories", "number", "0 to 20.", 0, 20], ["showCountries", "Show countries", "bool", "A card per country, with its flag."], ["countryLimit", "How many countries", "number", "0 to 24.", 0, 24]] },
    payments: { guide: ["A strip of the payment methods you cover.", ["Set how many to show.", "Add a link to the full list."], "Methods come from Payment Methods; unpublished ones are not shown.", ["payments"]],
      fields: [["title", "Title", "text", "Shown above the strip."], ["subtitle", "Subtitle", "text", "Optional."], ["limit", "How many methods", "number", "1 to 30.", 1, 30], ["viewAllLabel", "Link text", "text", "For example All payment methods."], ["viewAllUrl", "Link", "url", "Usually /en/payment-methods."]] },
    how_we_rate: { guide: ["Shows what a score is based on, with a link to your methodology page.", ["Edit the criteria so they match how you really rate casinos.", "Percentages are hidden until you tick the box below, so no invented numbers appear. Set your real weights first, then tick it.", "Add the address of your methodology page."], "Visitors can follow the link to read the full method.", ["pages"]],
      fields: [["title", "Title", "text", "Shown above the list."], ["intro", "Intro", "textarea", "One or two sentences."], ["weightsConfirmed", "Show the percentage weights", "bool", "Tick only when the weights below are your real ones."], ["linkLabel", "Link text", "text", "For example Read our methodology."], ["linkUrl", "Link", "url", "The address of your methodology page. The link is hidden while this is empty."]], extra: "criteria" },
    reviews_news: { guide: ["Your newest reviews and news side by side.", ["Choose which of the two to show and how many items.", "Items come from published reviews and news."], "Visitors open the full review or article.", ["reviews", "news"]],
      fields: [["showReviews", "Show reviews", "bool", "Newest published reviews."], ["reviewsTitle", "Reviews title", "text", "Shown above the reviews."], ["reviewCount", "How many reviews", "number", "1 to 8.", 1, 8], ["showNews", "Show news", "bool", "Newest published articles."], ["newsTitle", "News title", "text", "Shown above the news."], ["newsCount", "How many articles", "number", "1 to 8.", 1, 8]] },
    faq: { guide: ["Questions and answers. They are also sent to search engines as FAQ structured data.", ["Keep four to six questions that real visitors ask.", "Write plain text answers. Do not promise outcomes.", "Tokens like {country} work."], "Review the answers so they match how your site works.", ["seo"]],
      fields: [["title", "Title", "text", "Shown above the questions."]], extra: "faq" },
    trust: { guide: ["A responsible gambling message with links to help organisations.", ["Edit the message and the organisation links.", "Only https links and links on this site are accepted."], "Visitors can reach help in one tap.", ["pages"]],
      fields: [["title", "Title", "text", "Shown in the row."], ["text", "Message", "textarea", "Short and calm."], ["ageBadge", "Age badge text", "text", "For example 18+ or 21+. Leave empty for no badge; use the age rule where you operate."], ["pageLabel", "Your page link text", "text", "For example Responsible gambling."], ["pageUrl", "Your page link", "url", "Your own responsible gambling page."]], extra: "links" },
    seo_prose: { guide: ["Your longer search-friendly text, folded under a Read more button so it does not push content down.", ["Paste your text. Separate paragraphs with a blank line.", "Start a line with ## to make a small heading.", "Plain text only; formatting is not kept."], "Search engines still read it; visitors open it when they want.", ["seo"]],
      fields: [["title", "Title", "text", "Shown above the folded text."], ["summaryLabel", "Button text", "text", "For example Read more."], ["text", "Text", "textarea-lg", "Blank line = new paragraph. ## Heading = heading. Nothing is shown while this is empty."]] },
    text_block: { guide: ["Your own heading, text and an optional button. Use it for an announcement, an about section, a promotion or any message that is not one of the built-in sections.", ["Add one with Add a custom section below the list, then move it where you want.", "Separate paragraphs with a blank line. Start a line with ## for a small heading.", "Tokens like {country} and {site_name} work."], "Add more blocks if you need them, up to the limit. Delete any you no longer use.", ["pages"]],
      fields: [["title", "Heading", "text", "Optional."], ["body", "Text", "textarea-lg", "Blank line = new paragraph. ## Heading = small heading."], ["buttonLabel", "Button text", "text", "Optional. The button needs a link too."], ["buttonUrl", "Button link", "url", "A page on this site, an #anchor or an https address."], ["align", "Alignment", "select", "Left suits long text; centre suits a short message.", [["left", "Left"], ["center", "Centre"]]], ["tone", "Background", "select", "Alternate shades the section so it stands apart.", [["plain", "Plain"], ["alt", "Shaded"]]]] },
    link_cards: { guide: ["A grid of cards you write yourself: each has an icon, a title, a line of text and a link. Good for guides, tools, regions or partners.", ["Add cards below, each with a title and, if you like, an icon (an emoji) and a link.", "Choose how many columns fit your content.", "A card without a link is shown as plain information."], "Add more card sections if you need them, up to the limit.", ["pages"]],
      fields: [["title", "Heading", "text", "Optional."], ["subtitle", "Subtitle", "text", "Optional."], ["columns", "Columns", "number", "2 to 4. Fewer columns on small screens automatically.", 2, 4], ["tone", "Background", "select", "Alternate shades the section so it stands apart.", [["plain", "Plain"], ["alt", "Shaded"]]]], extra: "cards" },
    newsletter: { guide: ["An email sign-up just above the footer.", ["Edit the wording.", "Sign-ups go to the same list as your footer form."], "Check the Newsletter page in your dashboard for subscribers.", []],
      fields: [["title", "Title", "text", "Shown above the form."], ["text", "Text", "textarea", "One sentence."], ["placeholder", "Email placeholder", "text", "Grey text inside the box."], ["button", "Button text", "text", "For example Subscribe."]] },
  };

  const key = (s) => s.id || s.type;
  const section = (k) => config.sections.find((s) => key(s) === k);
  function markDirty() { dirty = JSON.stringify(config) !== saved; $("ahsDirty").hidden = !dirty; $("ahsSave").disabled = !dirty; clearTimeout(timer); timer = setTimeout(preview, 700); }
  function msg(t, bad) { const m = $("ahsMsg"); m.textContent = t || ""; m.className = "ahs-msg" + (bad ? " ahs-bad" : ""); }

  // ---------- field builders ----------
  function field(s, f) {
    const [k, label, kind, hint, a, b] = f; const id = `ahs-${key(s)}-${k}`; const v = s[k];
    let input;
    if (kind === "bool") return `<label class="ahs-check"><input type="checkbox" id="${id}" data-k="${k}" ${v ? "checked" : ""}> ${esc(label)}</label><span class="ahs-hint">${esc(hint)}</span>`;
    if (kind === "select") input = `<select id="${id}" data-k="${k}">${a.map(([val, t]) => `<option value="${val}" ${v === val ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
    else if (kind === "number") input = `<input type="number" id="${id}" data-k="${k}" data-num value="${esc(v)}" min="${a}" max="${b}" step="${k === "minRating" ? "0.1" : "1"}">`;
    else if (kind.startsWith("textarea")) input = `<textarea id="${id}" data-k="${k}" rows="${kind === "textarea-lg" ? 10 : 3}">${esc(v)}</textarea>`;
    else input = `<input type="${kind === "url" ? "text" : "text"}" id="${id}" data-k="${k}" value="${esc(v)}" ${kind === "url" ? 'placeholder="/en/page, #anchor or https://…"' : ""}>`;
    return `<div class="ahs-f"><label for="${id}">${esc(label)}</label>${input}<span class="ahs-hint">${esc(hint)}</span></div>`;
  }
  function listEditor(s, key, cols, addLabel, hint) {
    const rows = (s[key] || []).map((it, i) => `<div class="ahs-row" data-i="${i}">${cols.map(([c, ph, kind]) => kind === "area" ? `<textarea data-c="${c}" rows="2" placeholder="${esc(ph)}">${esc(it[c])}</textarea>` : `<input type="${kind === "num" ? "number" : "text"}" data-c="${c}" placeholder="${esc(ph)}" value="${esc(it[c])}" ${kind === "num" ? 'min="0" max="100" style="width:80px"' : ""}>`).join("")}<button type="button" class="btn btn--sm" data-del="${i}" aria-label="Remove">✕</button></div>`).join("");
    return `<div class="ahs-f" data-list="${key}"><label>${esc(addLabel.title)}</label>${rows}<button type="button" class="btn btn--sm" data-add="${key}">+ ${esc(addLabel.btn)}</button><span class="ahs-hint">${esc(hint)}</span></div>`;
  }
  function picksEditor(s) {
    const byId = new Map(lookups.casinos.map((c) => [c.id, c]));
    const rows = s.picks.map((p, i) => { const c = byId.get(p.casino_id); return `<div class="ahs-row" data-i="${i}"><span class="ahs-name">${esc(c ? c.name : "Casino #" + p.casino_id)}</span><input type="text" data-c="reason" placeholder="Reason, e.g. Best for crypto" value="${esc(p.reason)}"><input type="text" data-c="bonusNote" placeholder="Extra terms note (optional)" value="${esc(p.bonusNote)}"><button type="button" class="btn btn--sm" data-up="${i}" aria-label="Move up">↑</button><button type="button" class="btn btn--sm" data-del="${i}" aria-label="Remove">✕</button></div>`; }).join("");
    const used = new Set(s.picks.map((p) => p.casino_id));
    const opts = lookups.casinos.filter((c) => !used.has(c.id)).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    return `<div class="ahs-f" data-list="picks"><label>Your manual picks (used when "Which casinos" is Manual)</label>${rows || '<p class="ahs-hint">No picks yet.</p>'}<div class="ahs-add"><select data-pickadd>${opts}</select><button type="button" class="btn btn--sm" data-add="picks">+ Add casino</button></div><span class="ahs-hint">Order here is the order shown. A casino that does not accept the visitor's country is skipped automatically.</span></div>`;
  }
  function guideHtml(t) {
    const g = SPEC[t].guide; const rel = g[3].map((k) => `<a href="${LINKS[k][1]}">${esc(LINKS[k][0])}</a>`).join(" · ");
    return `<details class="ahs-guide"><summary>ⓘ How to use this section</summary><div class="ahs-guide__body"><p>${esc(g[0])}</p><ol>${g[1].map((x) => `<li>${esc(x)}</li>`).join("")}</ol><p><strong>What next:</strong> ${esc(g[2])}</p>${rel ? `<p><strong>Related pages:</strong> ${rel}</p>` : ""}<button type="button" class="btn btn--sm" data-guide-close>Done reading, close</button></div></details>`;
  }

  function render() {
    const list = $("ahsList"); const open = new Set(Array.from(list.querySelectorAll("details.ahs-sec[open]")).map((d) => d.dataset.t));
    const wopen = $("ahsWording") && $("ahsWording").querySelector("details") ? $("ahsWording").querySelector("details").open : false;
    list.innerHTML = config.sections.map((s, i) => {
      const sp = SPEC[s.type]; const k = key(s); let body = guideHtml(s.type) + sp.fields.map((f) => field(s, f)).join("");
      if (sp.extra === "picks") body += picksEditor(s);
      if (sp.extra === "criteria") body += listEditor(s, "criteria", [["label", "Criterion", "t"], ["description", "What it covers", "t"], ["weight", "Weight %", "num"]], { title: "Criteria", btn: "Add criterion" }, "Weights only appear on the page when you tick Show the percentage weights.");
      if (sp.extra === "faq") body += listEditor(s, "items", [["q", "Question", "t"], ["a", "Answer (plain text)", "area"]], { title: "Questions", btn: "Add question" }, "Four to six is ideal. Empty questions are dropped on save.");
      if (sp.extra === "cards") body += listEditor(s, "items", [["icon", "Icon", "t"], ["title", "Title", "t"], ["text", "Short text", "t"], ["url", "Link (optional)", "t"]], { title: "Cards", btn: "Add card" }, "Cards without a title are dropped on save. Up to 12.");
      if (sp.extra === "links") body += listEditor(s, "links", [["label", "Name", "t"], ["url", "https address", "t"]], { title: "Help organisation links", btn: "Add link" }, "Only https links are accepted here.");
      return `<details class="ahs-sec" data-t="${k}" ${open.has(k) ? "open" : ""}><summary><span class="ahs-sum"><input type="checkbox" class="ahs-en" data-en="${k}" ${s.enabled ? "checked" : ""} aria-label="Show ${esc(meta[s.type].label)}"><b>${esc(meta[s.type].label)}${s.id ? ` <em class="ahs-ttl">${esc(s.title || "untitled")}</em>` : ""}</b><small>${esc(meta[s.type].help)}</small></span><span class="ahs-mv"><button type="button" class="btn btn--sm" data-mv="${i}" data-d="-1" aria-label="Move up" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" class="btn btn--sm" data-mv="${i}" data-d="1" aria-label="Move down" ${i === config.sections.length - 1 ? "disabled" : ""}>↓</button></span></summary><div class="ahs-body">${body}${s.id ? `<div class="ahs-f"><button type="button" class="btn btn--sm" data-dup="${i}">Duplicate this section</button> <button type="button" class="btn btn--sm" data-rm="${i}">Delete this section</button><span class="ahs-hint">Custom sections can be removed completely. Built-in sections can only be switched off.</span></div>` : ""}</div></details>`;
    }).join("");
    renderWording(wopen); renderAddBar(); $("ahsHeroSource").value = config.options.heroSource || "auto"; $("ahsBuilder").checked = !!config.options.builder;
  }

  // ---------- wording (every visitor-facing word that is not a section's own content) ----------
  const LABEL_FIELDS = [
    ["categories", "Chip group: categories", "Name above the category chips."], ["countries", "Chip group: countries", "Name above the country chips."], ["payments", "Chip group: payments", "Name above the payment chips."],
    ["geoNote", "Location note above the top picks", "Tokens: {country}. Empty hides the line. It only shows when the visitor's country is known."],
    ["emptyText", "Message when nothing matches", "Shown when no listing is available for the visitor. Empty hides the box."],
    ["readReview", "Review card button", "Empty hides the button."], ["emailLabel", "Email box label for screen readers", "Not visible, helps accessibility."],
    ["fallbackCountry", "Country name when unknown", "Used wherever {country} appears and the visitor's country cannot be detected."],
    ["wagering", "Bonus term: wagering", "Tokens: {value}. Empty hides this term."], ["minDeposit", "Bonus term: minimum deposit", "Tokens: {value} {currency}. Empty hides this term."], ["maxBonus", "Bonus term: maximum bonus", "Tokens: {value} {currency}. Empty hides this term."],
  ];
  function renderWording(wasOpen) {
    const el = $("ahsWording"); if (!el) return; const o = config.options;
    const rows = (o.iconRules || []).map((r, i) => `<div class="ahs-row" data-ir="${i}"><input type="text" data-irc="match" placeholder="Words, comma separated (e.g. crypto, bitcoin)" value="${esc(r.match)}"><input type="text" data-irc="icon" placeholder="Icon" value="${esc(r.icon)}" style="max-width:80px"><button type="button" class="btn btn--sm" data-irdel="${i}" aria-label="Remove">✕</button></div>`).join("");
    el.innerHTML = `<details class="ahs-sec" ${wasOpen ? "open" : ""}><summary><span class="ahs-sum"><b>Wording and icons</b><small>Every small word the page shows, and the icons on category cards. Nothing is fixed in the code.</small></span></summary><div class="ahs-body">
      <details class="ahs-guide"><summary>ⓘ How to use this section</summary><div class="ahs-guide__body"><p>These are the labels around your content, such as the names above the chips and the words in the bonus terms. Change them to suit your site and language.</p><ol><li>Edit any label. Tokens in curly brackets are filled in for each visitor.</li><li>Add icon rules so category cards get the icons you like: the first rule whose words appear in a category name wins.</li><li>Leave a label empty to hide that piece.</li></ol><button type="button" class="btn btn--sm" data-guide-close>Done reading, close</button></div></details>
      ${LABEL_FIELDS.map(([k, label, hint]) => `<div class="ahs-f"><label for="ahs-lbl-${k}">${esc(label)}</label><input type="text" id="ahs-lbl-${k}" data-lbl="${k}" value="${esc((o.labels || {})[k])}"><span class="ahs-hint">${esc(hint)}</span></div>`).join("")}
      <div class="ahs-f"><label for="ahs-defico">Default category icon</label><input type="text" id="ahs-defico" data-defico value="${esc(o.defaultIcon)}" style="max-width:80px"><span class="ahs-hint">Used when no rule matches. Empty = no icon.</span></div>
      <div class="ahs-f"><label>Icon rules</label>${rows || '<p class="ahs-hint">No rules yet.</p>'}<button type="button" class="btn btn--sm" data-iradd>+ Add icon rule</button></div></div></details>`;
  }
  function onWording(e) {
    const t = e.target;
    if (t.dataset.lbl) { config.options.labels[t.dataset.lbl] = t.value; return markDirty(); }
    if (t.hasAttribute("data-defico")) { config.options.defaultIcon = t.value; return markDirty(); }
    if (t.dataset.irc) { config.options.iconRules[Number(t.closest("[data-ir]").dataset.ir)][t.dataset.irc] = t.value; return markDirty(); }
  }
  function onWordingClick(e) {
    const t = e.target.closest("button"); if (!t) return;
    if (t.hasAttribute("data-guide-close")) { t.closest("details").open = false; return; }
    if (t.hasAttribute("data-iradd")) { config.options.iconRules.push({ match: "", icon: "" }); renderWording(true); return markDirty(); }
    if (t.dataset.irdel !== undefined) { config.options.iconRules.splice(Number(t.dataset.irdel), 1); renderWording(true); markDirty(); }
  }

  // ---------- templates and custom sections ----------
  function renderTemplates() {
    const el = $("ahsTpl"); if (!el) return;
    el.innerHTML = `<div class="ahs-f"><label for="ahsTplSel">Start from a template</label><div class="ahs-add"><select id="ahsTplSel">${templates.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join("")}</select><button type="button" class="btn btn--sm" id="ahsTplGo">Load into editor</button></div><span class="ahs-hint" id="ahsTplHint"></span></div>`;
    const hint = () => { const t = templates.find((x) => x.id === $("ahsTplSel").value); $("ahsTplHint").textContent = (t ? t.description + " " : "") + "Loading replaces what is on this screen but is not saved or published until you press Save. Every word stays editable."; };
    $("ahsTplSel").addEventListener("change", hint); hint();
    $("ahsTplGo").addEventListener("click", () => {
      const t = templates.find((x) => x.id === $("ahsTplSel").value); if (!t) return;
      if (!confirm("Replace everything on this screen with the \"" + t.label + "\" template? Nothing is saved until you press Save.")) return;
      const keepTheme = config.options.theme; config = JSON.parse(JSON.stringify(t.config)); config.options.theme = keepTheme; render(); markDirty(); msg("Template loaded. Edit anything, then Save.");
    });
  }
  function renderAddBar() {
    const el = $("ahsAdd"); if (!el) return; const n = config.sections.filter((s) => s.id).length;
    el.innerHTML = `<div class="ahs-f"><label for="ahsAddSel">Add a custom section</label><div class="ahs-add"><select id="ahsAddSel">${Object.keys(customDefaults).map((t) => `<option value="${esc(t)}">${esc((meta[t] || {}).label || t)}</option>`).join("")}</select><button type="button" class="btn btn--sm" id="ahsAddGo" ${n >= maxCustom ? "disabled" : ""}>+ Add</button></div><span class="ahs-hint">${n} of ${maxCustom} custom sections used. ${esc(((meta[Object.keys(customDefaults)[0]] || {}).help) || "")}</span></div>`;
    $("ahsAddGo").addEventListener("click", () => addCustom($("ahsAddSel").value));
  }
  const newId = () => { let id; do { id = "custom-" + Math.random().toString(36).slice(2, 7); } while (config.sections.some((s) => s.id === id) || id.length < 9); return id; };
  function addCustom(type, copy) {
    if (config.sections.filter((s) => s.id).length >= maxCustom) return;
    const sec = copy ? JSON.parse(JSON.stringify(copy)) : JSON.parse(JSON.stringify(customDefaults[type])); sec.id = newId();
    config.sections.push(sec); render(); markDirty(); const d = $("ahsList").querySelector('[data-t="' + sec.id + '"]'); if (d) { d.open = true; d.scrollIntoView({ block: "nearest" }); }
  }

  // ---------- events ----------
  function onList(e) {
    const t = e.target; const det = t.closest("details.ahs-sec"); if (!det) return;
    const s = section(det.dataset.t);
    if (t.dataset.en) { section(t.dataset.en).enabled = t.checked; return markDirty(); }
    if (t.dataset.k) { s[t.dataset.k] = t.type === "checkbox" ? t.checked : (t.dataset.num !== undefined ? Number(t.value) : t.value); return markDirty(); }
    const row = t.closest(".ahs-row"); const box = t.closest("[data-list]");
    if (row && box && t.dataset.c) { const arr = s[box.dataset.list]; const it = arr[Number(row.dataset.i)]; it[t.dataset.c] = t.type === "number" ? Number(t.value) : t.value; markDirty(); }
  }
  function onClick(e) {
    const t = e.target.closest("button"); if (!t) return;
    if (t.hasAttribute("data-guide-close")) { const d = t.closest("details"); d.open = false; return; }
    if (t.dataset.mv !== undefined) { const i = Number(t.dataset.mv), j = i + Number(t.dataset.d); if (j < 0 || j >= config.sections.length) return; [config.sections[i], config.sections[j]] = [config.sections[j], config.sections[i]]; e.preventDefault(); render(); return markDirty(); }
    if (t.dataset.dup !== undefined) { addCustom(null, config.sections[Number(t.dataset.dup)]); return; }
    if (t.dataset.rm !== undefined) { const sec = config.sections[Number(t.dataset.rm)]; if (!confirm("Delete this section completely? You can press Save only when you are happy; Undo last change also brings it back.")) return; config.sections.splice(Number(t.dataset.rm), 1); render(); markDirty(); return; }
    const det = t.closest("details.ahs-sec"); if (!det) return; const s = section(det.dataset.t); const box = t.closest("[data-list]");
    if (t.dataset.add && box) {
      const kind = t.dataset.add;
      if (kind === "picks") { const sel = box.querySelector("[data-pickadd]"); const id = Number(sel.value); if (!id) return; s.picks.push({ casino_id: id, reason: "", bonusNote: "" }); }
      if (kind === "criteria") s.criteria.push({ label: "", description: "", weight: 0 });
      if (kind === "items") s.items.push(s.type === "link_cards" ? { title: "", text: "", url: "", icon: "" } : { q: "", a: "" });
      if (kind === "links") s.links.push({ label: "", url: "https://" });
      render(); markDirty(); return;
    }
    if (t.dataset.del !== undefined && box) { (s[box.dataset.list]).splice(Number(t.dataset.del), 1); render(); markDirty(); return; }
    if (t.dataset.up !== undefined && box) { const i = Number(t.dataset.up); if (i > 0) { [s.picks[i - 1], s.picks[i]] = [s.picks[i], s.picks[i - 1]]; render(); markDirty(); } }
  }

  // ---------- preview ----------
  async function preview() {
    const seq = ++previewSeq; $("ahsPrevState").textContent = "Updating preview…";
    try {
      const res = await fetch(API + "/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config, country: $("ahsCountry").value }) });
      const d = await res.json(); if (seq !== previewSeq) return;
      if (!d.success) { $("ahsPrevState").textContent = d.error || "Preview failed"; return; }
      $("ahsFrame").srcdoc = d.html; $("ahsPrevState").textContent = $("ahsCountry").value ? "Previewing as " + $("ahsCountry").value : "Previewing as you (your own location)";
      const sel = document.querySelector("[data-ah-hint]"); void sel;
    } catch { $("ahsPrevState").textContent = "Preview failed. Check your connection."; }
  }

  // ---------- actions ----------
  async function post(path, body) {
    const res = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const d = await res.json().catch(() => ({ success: false, error: "Unexpected response" })); return { ok: res.ok && d.success, d };
  }
  function status() {
    const on = state.mode === "on"; const b = $("ahsLive"); b.textContent = on ? "Live: Advanced homepage" : "Live: default homepage"; b.className = "ahs-badge " + (on ? "ahs-on" : "ahs-off");
    $("ahsMode").textContent = on ? "Switch back to default homepage" : "Publish to live site"; $("ahsUndo").hidden = !state.hasPrevious;
  }
  async function save() {
    msg("Saving…"); const r = await post("/save", { config });
    if (!r.ok) { msg(r.d.error || "Could not save", true); return false; }
    config = r.d.config; saved = JSON.stringify(config); state.hasConfig = true; render(); markDirty(); msg("Saved. The live site is unchanged until you publish."); state.hasPrevious = true; status(); return true;
  }
  async function toggleMode() {
    const turningOn = state.mode !== "on";
    if (turningOn && !confirm("Publish this homepage to the live site? Visitors will see it instead of the current homepage. You can switch back at any time.")) return;
    if (!turningOn && !confirm("Switch the live site back to the default homepage? Your Advanced settings stay saved.")) return;
    if (turningOn && dirty && !(await save())) return;
    const r = await post("/mode", { mode: turningOn ? "on" : "off" });
    if (!r.ok) return msg(r.d.error || "Could not change the mode", true);
    state.mode = turningOn ? "on" : "off"; state.hasPrevious = true; status(); msg(turningOn ? "Published. Pages refresh within a moment." : "Switched back to the default homepage.");
  }
  async function undo() {
    if (!confirm("Return to the previous saved version (and its on/off state)?")) return;
    const r = await post("/revert"); if (!r.ok) return msg(r.d.error || "Nothing to undo", true); await load(); msg("Returned to the previous version.");
  }
  function reset() {
    if (!confirm("Clear everything on this screen back to a blank, neutral homepage? Nothing is saved until you press Save.")) return;
    const keepTheme = config.options.theme; config = JSON.parse(JSON.stringify(defaults)); config.options.theme = keepTheme; render(); markDirty();
  }

  async function load() {
    const res = await fetch(API + "/state"); const d = await res.json();
    if (!d.success) { $("ahsList").innerHTML = `<p class="ahs-bad">${esc(d.error || "Could not load")}</p>`; return; }
    state = d.state; meta = d.meta; defaults = d.defaults; templates = d.templates || []; labelDefaults = d.labelDefaults || {}; customDefaults = d.customDefaults || {}; maxCustom = d.maxCustom || 8; lookups = d.lookups; config = JSON.parse(JSON.stringify(state.config)); saved = JSON.stringify(config);
    $("ahsCountry").innerHTML = '<option value="">As me (my own location)</option>' + lookups.countries.map((c) => `<option value="${esc(c.code)}">${esc(c.name)} (${esc(c.code)})</option>`).join("");
    renderTemplates(); render(); status(); markDirty(); dirty = false; $("ahsDirty").hidden = true; $("ahsSave").disabled = true; preview();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const list = $("ahsList"); if (!list) return;
    const wd = $("ahsWording"); if (wd) { wd.addEventListener("input", onWording); wd.addEventListener("click", onWordingClick); }
    list.addEventListener("input", onList); list.addEventListener("change", onList); list.addEventListener("click", onClick);
    $("ahsHeroSource").addEventListener("change", (e) => { config.options.heroSource = e.target.value; markDirty(); });
    $("ahsBuilder").addEventListener("change", (e) => { config.options.builder = e.target.checked; markDirty(); });
    $("ahsSave").addEventListener("click", save); $("ahsMode").addEventListener("click", toggleMode); $("ahsUndo").addEventListener("click", undo); $("ahsReset").addEventListener("click", reset);
    $("ahsRefresh").addEventListener("click", preview); $("ahsCountry").addEventListener("change", preview);
    document.querySelectorAll("[data-dev]").forEach((b) => b.addEventListener("click", () => { $("ahsFrame").dataset.dev = b.dataset.dev; document.querySelectorAll("[data-dev]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
    document.querySelectorAll("[data-guide-close]").forEach((b) => b.addEventListener("click", () => { const d = b.closest("details"); if (d) d.open = false; }));
    window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
    load();
  });
})();
