// Earnings & Payouts page: funnel, sub-ID report, payouts and invoices, promo codes, creatives.
const ER = { programs: [], links: [] };
const erEsc = (s) => (typeof escapeHtml === "function" ? escapeHtml(String(s ?? "")) : String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
const erMoney = (o) => { const e = Object.entries(o || {}).filter(([, v]) => v); return e.length ? e.map(([c, v]) => `${(Math.round(v * 100) / 100).toFixed(2)} ${erEsc(c)}`).join("<br>") : "—"; };
const erGet = async (p) => (await fetch(p)).json();
const erPost = async (p, body) => (await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
const erVal = (id) => document.getElementById(id).value.trim();
const erAlert = (id, msg, ok) => { const el = document.getElementById(id); el.textContent = msg; el.className = "alert " + (ok ? "alert--success" : "alert--error"); el.style.display = "block"; };

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("erTabs")) return;
  try { ER.programs = (await erGet("/en/api/v1/affiliate-programs/list")).programs || []; } catch { ER.programs = []; }
  try { ER.links = (await erGet("/en/api/v1/tracking-links/list")).tracking_links || []; } catch { ER.links = []; }
  const progOpts = ER.programs.map((p) => `<option value="${p.id}">${erEsc(p.name)}</option>`).join("");
  for (const id of ["erInvProgram", "erPayProgram"]) document.getElementById(id).innerHTML = progOpts;
  for (const id of ["erPromoProgram", "erCreProgram"]) document.getElementById(id).innerHTML = '<option value="">(any)</option>' + progOpts;
  const linkOpts = '<option value="">(none)</option>' + ER.links.map((l) => `<option value="${l.id}">${erEsc(l.internal_name || l.tracking_code)}</option>`).join("");
  for (const id of ["erPromoLink", "erCreLink"]) document.getElementById(id).innerHTML = linkOpts;

  document.querySelectorAll("[data-er-tab]").forEach((b) => b.addEventListener("click", () => erTab(b.dataset.erTab)));
  document.getElementById("erFunnelGo").addEventListener("click", erLoadFunnel);
  document.getElementById("erSubGo").addEventListener("click", erLoadSubs);
  document.getElementById("erInvCreate").addEventListener("click", erCreateInvoice);
  document.getElementById("erPaySave").addEventListener("click", erSavePayout);
  document.getElementById("erPromoSave").addEventListener("click", erSavePromo);
  document.getElementById("erCreSave").addEventListener("click", erSaveCreative);
  erTab("funnel");
});

function erTab(name) {
  document.querySelectorAll("[data-er-panel]").forEach((s) => { s.style.display = s.dataset.erPanel === name ? "" : "none"; });
  document.querySelectorAll("[data-er-tab]").forEach((b) => { b.className = "btn btn--sm " + (b.dataset.erTab === name ? "btn--primary" : "btn--secondary"); });
  ({ funnel: erLoadFunnel, subids: erLoadSubs, payouts: erLoadPayouts, promos: erLoadPromos, creatives: erLoadCreatives })[name]();
}

const erRange = (a, b) => { const f = erVal(a), t = erVal(b); return (f ? `&from=${f}` : "") + (t ? `&to=${t}` : ""); };

async function erLoadFunnel() {
  const d = await erGet("/en/api/v1/earnings/funnel?x=1" + erRange("erFunnelFrom", "erFunnelTo"));
  const r = d.rates || {};
  const pct = (v) => (v == null ? "—" : v + "%");
  document.getElementById("erFunnelSummary").innerHTML = `Click → registration ${pct(r.click_to_registration)} · registration → first deposit ${pct(r.registration_to_ftd)} · click → first deposit ${pct(r.click_to_ftd)}`;
  document.getElementById("erFunnelBody").innerHTML = (d.programs || []).map((p) => `<tr><td>${erEsc(p.name)}</td><td>${p.clicks}</td><td>${p.registrations}</td><td>${p.ftd}</td><td>${p.deposits}</td><td>${p.pending}</td><td>${p.rejected}</td><td>${erMoney(p.commission_confirmed)}</td><td>${erMoney(p.commission_pending)}</td></tr>`).join("") || '<tr><td colspan="9" class="muted">No clicks or conversions in this period.</td></tr>';
}

async function erLoadSubs() {
  const key = erVal("erSubKey") || "sub1";
  const d = await erGet(`/en/api/v1/earnings/subids?key=${encodeURIComponent(key)}` + erRange("erSubFrom", "erSubTo"));
  const sel = document.getElementById("erSubKey");
  if (!sel.options.length) sel.innerHTML = (d.keys || []).map((k) => `<option value="${k}">${k}</option>`).join("");
  sel.value = key;
  document.getElementById("erSubBody").innerHTML = (d.rows || []).map((r) => `<tr><td>${erEsc(r.key)}</td><td>${r.clicks}</td><td>${r.registrations}</td><td>${r.ftd}</td><td>${r.deposits}</td><td>${erMoney(r.commission_confirmed)}</td><td>${erMoney(r.commission_pending)}</td></tr>`).join("") || '<tr><td colspan="7" class="muted">No data yet. Add sub1…sub10 to your tracking-link URLs.</td></tr>';
}

async function erLoadPayouts() {
  const d = await erGet("/en/api/v1/earnings/payouts/list");
  document.getElementById("erBalBody").innerHTML = (d.balances || []).map((b) => `<tr><td>${erEsc(b.name)}</td><td>${erEsc(b.currency)}</td><td>${b.confirmed.toFixed(2)}</td><td>${b.pending.toFixed(2)}</td><td>${b.invoiced.toFixed(2)}</td><td>${b.paid.toFixed(2)}</td><td><strong>${b.outstanding.toFixed(2)}</strong></td></tr>`).join("") || '<tr><td colspan="7" class="muted">No commission yet.</td></tr>';
  window.erPayouts = d.payouts || [];
  document.getElementById("erPayBody").innerHTML = window.erPayouts.map((p) => `<tr><td>${erEsc(p.program_name)}</td><td>${erEsc((p.period_start || "") + (p.period_end ? " – " + p.period_end : ""))}</td><td>${Number(p.amount).toFixed(2)} ${erEsc(p.currency)}</td><td>${erEsc(p.status)}</td><td>${erEsc(p.invoice_number || "")}</td><td>${erEsc(p.paid_at || "")}</td><td>${erEsc(p.reference || "")}</td><td><button class="btn btn--sm" onclick="erEditPayout(${p.id})">Edit</button> <button class="btn btn--sm btn--danger" onclick="erDelete('payouts',${p.id})">Delete</button></td></tr>`).join("") || '<tr><td colspan="8" class="muted">No payments recorded.</td></tr>';
}

function erEditPayout(id) {
  const p = (window.erPayouts || []).find((x) => x.id === id); if (!p) return;
  document.getElementById("erPayId").value = p.id; document.getElementById("erPayProgram").value = p.program_id;
  document.getElementById("erPayAmount").value = p.amount; document.getElementById("erPayCurrency").value = p.currency;
  document.getElementById("erPayStatus").value = p.status; document.getElementById("erPayDate").value = p.paid_at || "";
  document.getElementById("erPayRef").value = p.reference || "";
}

async function erSavePayout() {
  const d = await erPost("/en/api/v1/earnings/payouts/save", { id: erVal("erPayId") || null, program_id: erVal("erPayProgram"), amount: erVal("erPayAmount"), currency: erVal("erPayCurrency"), status: erVal("erPayStatus"), paid_at: erVal("erPayDate"), reference: erVal("erPayRef") });
  if (!d.success) return erAlert("erPayAlert", d.error || "Failed", false);
  document.getElementById("erPayId").value = ""; erAlert("erPayAlert", "Saved.", true); erLoadPayouts();
}

async function erCreateInvoice() {
  const d = await erPost("/en/api/v1/earnings/invoice/create", { program_id: erVal("erInvProgram"), currency: erVal("erInvCurrency"), from: erVal("erInvFrom"), to: erVal("erInvTo"), notes: erVal("erInvNotes") });
  if (!d.success) return erAlert("erInvAlert", d.error || "Failed", false);
  erAlert("erInvAlert", `Invoice ${d.invoice.number} created for ${d.invoice.total.toFixed(2)} ${d.invoice.currency}.`, true);
  erLoadPayouts(); erPrintInvoice(d.invoice);
}

function erPrintInvoice(inv) {
  const w = window.open("", "_blank");
  if (!w) return;
  const rows = inv.lines.map((l) => `<tr><td>${erEsc(l.type)}</td><td>${l.count}</td><td style="text-align:right">${Number(l.commission).toFixed(2)}</td></tr>`).join("");
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${erEsc(inv.number)}</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:720px;margin:40px auto;color:#111}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}</style>
    <h1>Invoice ${erEsc(inv.number)}</h1><p>To: <strong>${erEsc(inv.program)}</strong><br>Period: ${erEsc(inv.period_start)} to ${erEsc(inv.period_end)}</p>
    <table><tr><th>Item</th><th>Count</th><th style="text-align:right">Commission (${erEsc(inv.currency)})</th></tr>${rows}
    <tr><td colspan="2"><strong>Total</strong></td><td style="text-align:right"><strong>${inv.total.toFixed(2)} ${erEsc(inv.currency)}</strong></td></tr></table>
    ${inv.notes ? `<p>${erEsc(inv.notes)}</p>` : ""}<p><button onclick="window.print()">Print / save as PDF</button></p>`);
  w.document.close();
}

async function erLoadPromos() {
  const d = await erGet("/en/api/v1/earnings/promo-codes/list");
  window.erPromos = d.promo_codes || [];
  document.getElementById("erPromoBody").innerHTML = window.erPromos.map((p) => `<tr><td><code>${erEsc(p.code)}</code></td><td>${erEsc(p.program_name || "")}</td><td>${erEsc(p.link_name || "")}</td><td>${erEsc(p.status)}</td><td>${p.conversions}</td><td>${erMoney(p.commission)}</td><td><button class="btn btn--sm" onclick="erEditPromo(${p.id})">Edit</button> <button class="btn btn--sm btn--danger" onclick="erDelete('promo-codes',${p.id})">Delete</button></td></tr>`).join("") || '<tr><td colspan="7" class="muted">No promo codes yet.</td></tr>';
}
function erEditPromo(id) {
  const p = (window.erPromos || []).find((x) => x.id === id); if (!p) return;
  document.getElementById("erPromoId").value = p.id; document.getElementById("erPromoCode").value = p.code;
  document.getElementById("erPromoProgram").value = p.program_id || ""; document.getElementById("erPromoLink").value = p.tracking_link_id || "";
  document.getElementById("erPromoDesc").value = p.description || ""; document.getElementById("erPromoStatus").value = p.status;
}
async function erSavePromo() {
  const d = await erPost("/en/api/v1/earnings/promo-codes/save", { id: erVal("erPromoId") || null, code: erVal("erPromoCode"), program_id: erVal("erPromoProgram"), tracking_link_id: erVal("erPromoLink"), description: erVal("erPromoDesc"), status: erVal("erPromoStatus") });
  if (!d.success) return erAlert("erPromoAlert", d.error || "Failed", false);
  document.getElementById("erPromoId").value = ""; erAlert("erPromoAlert", "Saved.", true); erLoadPromos();
}

function erEmbed(c) {
  if (!c.tracking_code) return "";
  const href = `${location.origin}/en/go/${c.tracking_code}`;
  if (c.kind === "banner" && c.asset_url) return `<a href="${href}" rel="sponsored nofollow noopener"><img src="${c.asset_url}"${c.width ? ` width="${c.width}"` : ""}${c.height ? ` height="${c.height}"` : ""} alt="${(c.body_text || c.name).replace(/"/g, "&quot;")}"></a>`;
  return `<a href="${href}" rel="sponsored nofollow noopener">${(c.body_text || c.name).replace(/</g, "&lt;")}</a>`;
}
async function erLoadCreatives() {
  const d = await erGet("/en/api/v1/earnings/creatives/list");
  window.erCreatives = d.creatives || [];
  document.getElementById("erCreBody").innerHTML = window.erCreatives.map((c) => `<tr><td>${erEsc(c.name)}</td><td>${erEsc(c.kind)}</td><td>${erEsc(c.program_name || "")}</td><td>${erEsc(c.link_name || "")}</td><td>${c.conversions}</td><td>${c.tracking_code ? `<button class="btn btn--sm" onclick="erCopyEmbed(${c.id})">Copy embed code</button> ` : ""}<button class="btn btn--sm" onclick="erEditCreative(${c.id})">Edit</button> <button class="btn btn--sm btn--danger" onclick="erDelete('creatives',${c.id})">Delete</button></td></tr>`).join("") || '<tr><td colspan="6" class="muted">No creatives yet.</td></tr>';
}
async function erCopyEmbed(id) {
  const c = (window.erCreatives || []).find((x) => x.id === id); const code = c ? erEmbed(c) : "";
  try { await navigator.clipboard.writeText(code); alert("Copied:\n" + code); } catch { prompt("Copy this code:", code); }
}
function erEditCreative(id) {
  const c = (window.erCreatives || []).find((x) => x.id === id); if (!c) return;
  const set = (k, v) => { document.getElementById(k).value = v ?? ""; };
  set("erCreId", c.id); set("erCreName", c.name); set("erCreKind", c.kind); set("erCreProgram", c.program_id); set("erCreLink", c.tracking_link_id);
  set("erCreAsset", c.asset_url); set("erCreW", c.width); set("erCreH", c.height); set("erCreText", c.body_text);
}
async function erSaveCreative() {
  const d = await erPost("/en/api/v1/earnings/creatives/save", { id: erVal("erCreId") || null, name: erVal("erCreName"), kind: erVal("erCreKind"), program_id: erVal("erCreProgram"), tracking_link_id: erVal("erCreLink"), asset_url: erVal("erCreAsset"), width: erVal("erCreW"), height: erVal("erCreH"), body_text: erVal("erCreText") });
  if (!d.success) return erAlert("erCreAlert", d.error || "Failed", false);
  document.getElementById("erCreId").value = ""; erAlert("erCreAlert", "Saved.", true); erLoadCreatives();
}

async function erDelete(kind, id) {
  if (!confirm("Delete this entry?")) return;
  const d = await erPost(`/en/api/v1/earnings/${kind}/delete`, { id });
  if (!d.success) return alert(d.error || "Failed");
  ({ payouts: erLoadPayouts, "promo-codes": erLoadPromos, creatives: erLoadCreatives })[kind]();
}
