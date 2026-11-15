// Forwarding rules on the Postbacks page: tracker URLs, Meta and TikTok.
const FW = { presets: null, rules: [] };
const fwEsc = (s) => (typeof escapeHtml === "function" ? escapeHtml(String(s ?? "")) : String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
const fwGet = async (p) => (await fetch(p)).json();
const fwPost = async (p, b) => (await fetch(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json();
const fwVal = (id) => document.getElementById(id).value.trim();
const fwChecked = (box) => Array.from(document.querySelectorAll(`#${box} input:checked`)).map((c) => c.value);
const fwAlert = (msg, ok) => { const el = document.getElementById("fwAlert"); el.textContent = msg; el.className = "alert " + (ok ? "alert--success" : "alert--error"); el.style.display = "block"; };

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("fwForm")) return;
  FW.presets = await fwGet("/en/api/v1/forwards/presets");
  let programs = []; try { programs = (await fwGet("/en/api/v1/affiliate-programs/list")).programs || []; } catch { programs = []; }
  document.getElementById("fwProgram").innerHTML = '<option value="">(all programs)</option>' + programs.map((p) => `<option value="${p.id}">${fwEsc(p.name)}</option>`).join("");
  document.getElementById("fwTrackerPreset").innerHTML = Object.entries(FW.presets.trackers).map(([k, v]) => `<option value="${k}">${fwEsc(v.name)}</option>`).join("");
  document.getElementById("fwEvents").innerHTML = FW.presets.events.map((e) => `<label style="margin-right:12px"><input type="checkbox" value="${e}"${e === "ftd" ? " checked" : ""}> ${e}</label>`).join("");
  document.getElementById("fwStatuses").innerHTML = FW.presets.statuses.map((e) => `<label style="margin-right:12px"><input type="checkbox" value="${e}"${e === "confirmed" ? " checked" : ""}> ${e}</label>`).join("");
  document.getElementById("fwKind").addEventListener("change", fwKindChanged);
  document.getElementById("fwTrackerPreset").addEventListener("change", fwApplyPreset);
  document.getElementById("fwSave").addEventListener("click", fwSave);
  fwApplyPreset(); fwKindChanged(); fwLoad();
});

function fwKindChanged() {
  const k = document.getElementById("fwKind").value;
  document.querySelectorAll("[data-fw-kind]").forEach((d) => { d.style.display = d.dataset.fwKind === k ? "" : "none"; });
}
function fwApplyPreset() {
  const p = FW.presets.trackers[document.getElementById("fwTrackerPreset").value];
  if (!p) return;
  document.getElementById("fwUrl").value = p.url;
  document.getElementById("fwEventMap").value = Object.keys(p.event_map).length ? JSON.stringify(p.event_map) : "";
  document.getElementById("fwTrackerNote").textContent = p.note;
}

async function fwLoad() {
  const d = await fwGet("/en/api/v1/forwards/list");
  FW.rules = d.forwards || [];
  document.getElementById("fwBody").innerHTML = FW.rules.map((r) => `<tr><td>${fwEsc(r.label)}</td><td>${fwEsc(r.kind)}</td><td>${fwEsc(r.events.join(", "))}</td><td>${fwEsc(r.statuses.join(", "))}</td><td>${r.sent}</td><td>${r.failed}</td><td>${fwEsc(r.status)}</td>
    <td><button class="btn btn--sm" onclick="fwEdit(${r.id})">Edit</button> <button class="btn btn--sm" onclick="fwTest(${r.id}, false)">Preview</button> <button class="btn btn--sm" onclick="fwTest(${r.id}, true)">Send test</button> <button class="btn btn--sm btn--danger" onclick="fwDelete(${r.id})">Delete</button></td></tr>`).join("") || '<tr><td colspan="8" class="muted">No forwarding rules yet.</td></tr>';
  const l = await fwGet("/en/api/v1/forwards/deliveries?limit=30");
  document.getElementById("fwLogBody").innerHTML = (l.deliveries || []).map((x) => `<tr><td>${fwEsc(x.updated_at)}</td><td>${fwEsc(x.forward_label)}</td><td>#${x.conversion_id}</td><td>${fwEsc(x.conv_status)}</td><td>${fwEsc(x.outcome)}${x.attempts > 1 ? " (×" + x.attempts + ")" : ""}</td><td>${x.http_status ?? ""}</td><td class="muted">${fwEsc(x.detail || "")}</td><td>${x.outcome === "failed" ? `<button class="btn btn--sm" onclick="fwRetry(${x.id})">Retry</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="8" class="muted">Nothing forwarded yet.</td></tr>';
}

function fwPayload() {
  const kind = fwVal("fwKind");
  const settings = {}; let secret = null;
  if (kind === "tracker_url") {
    settings.url = fwVal("fwUrl"); settings.method = fwVal("fwMethod");
    const m = fwVal("fwEventMap");
    if (m) { try { settings.event_map = JSON.parse(m); } catch { throw new Error("The event names must be valid JSON, e.g. {\"ftd\":\"sale\"}."); } }
  } else if (kind === "meta_capi") {
    settings.pixel_id = fwVal("fwMetaPixel"); settings.api_version = fwVal("fwMetaVersion"); settings.test_event_code = fwVal("fwMetaTest"); secret = fwVal("fwMetaToken") || null;
  } else {
    settings.pixel_code = fwVal("fwTtPixel"); settings.test_event_code = fwVal("fwTtTest"); secret = fwVal("fwTtToken") || null;
  }
  return { id: fwVal("fwId") || null, kind, label: fwVal("fwLabel"), program_id: fwVal("fwProgram") || null, status: fwVal("fwStatus"), settings, secret, events: fwChecked("fwEvents"), statuses: fwChecked("fwStatuses") };
}

async function fwSave() {
  let body; try { body = fwPayload(); } catch (e) { return fwAlert(e.message, false); }
  const d = await fwPost("/en/api/v1/forwards/save", body);
  if (!d.success) return fwAlert(d.error || "Failed", false);
  document.getElementById("fwId").value = ""; fwAlert("Saved.", true); fwLoad();
}

function fwEdit(id) {
  const r = FW.rules.find((x) => x.id === id); if (!r) return;
  const set = (k, v) => { document.getElementById(k).value = v ?? ""; };
  set("fwId", r.id); set("fwKind", r.kind); set("fwLabel", r.label); set("fwProgram", r.program_id); set("fwStatus", r.status); fwKindChanged();
  if (r.kind === "tracker_url") { set("fwUrl", r.settings.url); set("fwMethod", r.settings.method); set("fwEventMap", r.settings.event_map && Object.keys(r.settings.event_map).length ? JSON.stringify(r.settings.event_map) : ""); }
  if (r.kind === "meta_capi") { set("fwMetaPixel", r.settings.pixel_id); set("fwMetaVersion", r.settings.api_version); set("fwMetaTest", r.settings.test_event_code); set("fwMetaToken", ""); }
  if (r.kind === "tiktok_events") { set("fwTtPixel", r.settings.pixel_code); set("fwTtTest", r.settings.test_event_code); set("fwTtToken", ""); }
  document.querySelectorAll("#fwEvents input").forEach((c) => { c.checked = r.events.includes(c.value); });
  document.querySelectorAll("#fwStatuses input").forEach((c) => { c.checked = r.statuses.includes(c.value); });
  window.scrollTo({ top: document.getElementById("fwForm").offsetTop - 80, behavior: "smooth" });
}

async function fwTest(id, send) {
  if (send && !confirm("This sends a real sample conversion (click id test-click). Use it only with a test event code or a test campaign. Send?")) return;
  const d = await fwPost("/en/api/v1/forwards/test", { id, send });
  const lines = [];
  if (d.preview) lines.push(`${d.preview.method} ${d.preview.url}` + (d.preview.body ? `\n${d.preview.body}` : ""));
  if (d.result) lines.push(`Result: ${d.result.outcome}${d.result.http_status ? " (HTTP " + d.result.http_status + ")" : ""}${d.result.detail ? "\n" + d.result.detail : ""}`);
  if (d.error) lines.push(d.error);
  alert(lines.join("\n\n") || "No response");
  fwLoad();
}
async function fwRetry(id) { const d = await fwPost("/en/api/v1/forwards/retry", { delivery_id: id }); if (!d.success) alert(d.error || "Failed"); fwLoad(); }
async function fwDelete(id) { if (!confirm("Delete this forwarding rule and its delivery log?")) return; await fwPost("/en/api/v1/forwards/delete", { id }); fwLoad(); }
