// ============================================================
// SITE PROFILE (Phase 7): presets library, share links, cloning from another site
// ============================================================
// Presets  an owner's library of saved configurations (table config_presets). Applying one is an import: it goes
//          to the draft through planImport / applyImport, so it is reviewed and published like any other change.
// Shares   a share link lets ANOTHER site of the same owner copy this configuration (table config_shares). The
//          link carries a random code; only its SHA-256 hash is stored. A share expires, has a use limit, exposes
//          only the sections chosen when it was made, and can be revoked at any time.
// Clone    the receiving site fetches the file from the other site's share endpoint, then runs the normal import
//          dry run. The outgoing request is locked down (see normalizeSourceUrl and fetchShared).
//
// Failure behaviour: if migration 0011 has not been run, presets and shares report that; export, import from a file
// and import by paste keep working because they need no new table.
import { buildExport, recordTransfer, MAX_IMPORT_BYTES, MAX_NAME, MAX_DESCRIPTION, isSectionId, sha256Hex } from "./transfer.js";
import { actorOf } from "./versions.js";

export const NEEDS_TRANSFER_MIGRATION = "Presets and share links need database migration 0011_config_transfer.sql. Run it, then reload this page.";
export const MAX_PRESETS = 50;
export const MAX_ACTIVE_SHARES = 10;
export const SHARE_HOURS = [1, 24, 168];
export const SHARE_PATH = "/en/api/v1/config-share/export";
const TOKEN_RE = /^lcs_[A-Za-z0-9_-]{43}$/;

const str = (v) => (v == null ? "" : String(v));
const cleanLine = (v, n) => str(v).replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const sqlTime = (d) => d.toISOString().slice(0, 19).replace("T", " ");
const parseSql = (s) => { const d = new Date(`${str(s).replace(" ", "T")}${/Z|[+-]\d\d:?\d\d$/.test(str(s)) ? "" : "Z"}`); return Number.isNaN(d.getTime()) ? null : d; };
const sectionsOf = (raw) => { try { const a = JSON.parse(raw || "[]"); return Array.isArray(a) ? a.filter(isSectionId) : []; } catch { return []; } };

// ---------- availability ----------
const readyFor = new WeakSet();
export async function transferTablesReady(env) {
  const db = env?.DB; if (!db) return false;
  if (readyFor.has(db)) return true;
  try {
    await db.prepare("SELECT 1 FROM config_presets LIMIT 1").first();
    await db.prepare("SELECT 1 FROM config_shares LIMIT 1").first();
    readyFor.add(db); return true;
  } catch { return false; }
}

// ---------- presets ----------
const presetMeta = (r) => ({ id: r.id, name: r.name, description: r.description || "", sections: sectionsOf(r.sections), createdBy: r.created_by, updatedBy: r.updated_by, createdAt: r.created_at, updatedAt: r.updated_at, bytes: Number(r.bytes) || 0 });

export async function listPresets(env) {
  if (!(await transferTablesReady(env))) return { error: NEEDS_TRANSFER_MIGRATION, status: 503 };
  const rows = (await env.DB.prepare("SELECT id, name, description, sections, created_by, updated_by, created_at, updated_at, LENGTH(envelope) AS bytes FROM config_presets ORDER BY name_key").all()).results || [];
  return { presets: rows.map(presetMeta), limit: MAX_PRESETS };
}

function cleanName(v) {
  const name = cleanLine(v, MAX_NAME);
  return name.length < 2 ? { error: "Give the preset a name of at least 2 characters." } : { name };
}

// opts = { name, description, sections, from: "live" | "draft", host }
export async function savePreset(env, user, opts = {}) {
  if (!(await transferTablesReady(env))) return { error: NEEDS_TRANSFER_MIGRATION, status: 503 };
  const n = cleanName(opts.name); if (n.error) return { errors: [n.error], status: 422 };
  const count = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM config_presets").first())?.n) || 0;
  if (count >= MAX_PRESETS) return { error: `You can keep up to ${MAX_PRESETS} presets. Delete one you no longer use first.`, status: 409 };
  const built = await buildExport(env, { host: opts.host, sections: opts.sections, from: opts.from === "draft" ? "draft" : "live", name: n.name, description: opts.description });
  if (!built.included.length) return { errors: ["There is nothing to save for the sections you chose."], status: 422 };
  const text = JSON.stringify(built.envelope);
  if (text.length > MAX_IMPORT_BYTES) return { errors: ["This configuration is too large to keep as a preset."], status: 422 };
  try {
    const r = await env.DB.prepare("INSERT INTO config_presets(name, name_key, description, envelope, sections, created_by, updated_by) VALUES(?, ?, ?, ?, ?, ?, ?)")
      .bind(n.name, n.name.toLowerCase(), cleanLine(opts.description, MAX_DESCRIPTION) || null, text, JSON.stringify(built.included), actorOf(user), actorOf(user)).run();
    await recordTransfer(env, user, "preset.save", `Saved preset “${n.name}” (${plural(built.included.length, "section")}).`);
    return { saved: true, id: Number(r?.meta?.last_row_id) || null, notes: built.notes, sections: built.included };
  } catch (e) {
    if (/unique/i.test(String(e?.message))) return { error: "A preset with that name already exists. Choose another name.", status: 409 };
    return { error: "The preset could not be saved. Nothing was changed.", status: 500 };
  }
}

// The stored file as text, for the dry run. Returns { text, name } | { error, status }.
export async function getPresetText(env, id) {
  if (!(await transferTablesReady(env))) return { error: NEEDS_TRANSFER_MIGRATION, status: 503 };
  const r = await env.DB.prepare("SELECT name, envelope FROM config_presets WHERE id = ?").bind(Number(id) || 0).first();
  return r ? { text: r.envelope, name: r.name } : { error: "That preset does not exist.", status: 404 };
}

export async function updatePreset(env, user, id, opts = {}) {
  if (!(await transferTablesReady(env))) return { error: NEEDS_TRANSFER_MIGRATION, status: 503 };
  const cur = await env.DB.prepare("SELECT id, name FROM config_presets WHERE id = ?").bind(Number(id) || 0).first();
  if (!cur) return { error: "That preset does not exist.", status: 404 };
  const n = cleanName(opts.name ?? cur.name); if (n.error) return { errors: [n.error], status: 422 };
  try {
    await env.DB.prepare("UPDATE config_presets SET name = ?, name_key = ?, description = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(n.name, n.name.toLowerCase(), cleanLine(opts.description, MAX_DESCRIPTION) || null, actorOf(user), cur.id).run();
  } catch (e) { return /unique/i.test(String(e?.message)) ? { error: "A preset with that name already exists. Choose another name.", status: 409 } : { error: "The preset could not be changed.", status: 500 }; }
  await recordTransfer(env, user, "preset.update", `Changed preset “${cur.name}”${n.name !== cur.name ? ` (now “${n.name}”)` : ""}.`);
  return { updated: true };
}

export async function deletePreset(env, user, id) {
  if (!(await transferTablesReady(env))) return { error: NEEDS_TRANSFER_MIGRATION, status: 503 };
  const cur = await env.DB.prepare("SELECT id, name FROM config_presets WHERE id = ?").bind(Number(id) || 0).first();
  if (!cur) return { error: "That preset does not exist.", status: 404 };
  await env.DB.prepare("DELETE FROM config_presets WHERE id = ?").bind(cur.id).run();
  await recordTransfer(env, user, "preset.delete", `Deleted preset “${cur.name}”.`);
  return { deleted: true };
}

// ---------- share links ----------
export const newToken = () => { const b = new Uint8Array(32); crypto.getRandomValues(b); return `lcs_${btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`; };
const tokenHash = (t) => sha256Hex(`lummet-config-share:${t}`);

const shareMeta = (r, now = new Date()) => {
  const exp = parseSql(r.expires_at);
  const status = r.revoked_at ? "revoked" : !exp || exp <= now ? "expired" : Number(r.uses) >= Number(r.max_uses) ? "used up" : "active";
  return { id: r.id, label: r.label || "", sections: sectionsOf(r.sections), maxUses: Number(r.max_uses), uses: Number(r.uses), expiresAt: r.expires_at, createdBy: r.created_by, createdAt: r.created_at, lastUsedAt: r.last_used_at, revokedAt: r.revoked_at, status };
};

export async function listShares(env) {
  if (!(await transferTablesReady(env))) return { error: NEEDS_TRANSFER_MIGRATION, status: 503 };
  const rows = (await env.DB.prepare("SELECT id, label, sections, max_uses, uses, expires_at, created_by, created_at, last_used_at, revoked_at FROM config_shares ORDER BY id DESC LIMIT 30").all()).results || [];
  return { shares: rows.map((r) => shareMeta(r)), limit: MAX_ACTIVE_SHARES };
}

// opts = { label, hours, maxUses, sections }. The code is returned ONCE and cannot be read back later.
export async function createShare(env, user, opts = {}) {
  if (!(await transferTablesReady(env))) return { error: NEEDS_TRANSFER_MIGRATION, status: 503 };
  const hours = SHARE_HOURS.includes(Number(opts.hours)) ? Number(opts.hours) : 24;
  const maxUses = Math.min(Math.max(parseInt(opts.maxUses, 10) || 5, 1), 20);
  const sections = Array.isArray(opts.sections) ? [...new Set(opts.sections.map(str).filter(isSectionId))] : [];
  if (!sections.length) return { errors: ["Choose what the other site may copy."], status: 422 };
  // Counted in the database, not from the 30 newest rows the screen lists, so an older active link is never missed.
  const active = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM config_shares WHERE revoked_at IS NULL AND expires_at > ? AND uses < max_uses").bind(sqlTime(new Date())).first())?.n) || 0;
  if (active >= MAX_ACTIVE_SHARES) return { error: `You can have ${MAX_ACTIVE_SHARES} active share links. Revoke one first.`, status: 409 };
  const token = newToken(), expires = new Date(Date.now() + hours * 3600 * 1000);
  const label = cleanLine(opts.label, 60);
  const r = await env.DB.prepare("INSERT INTO config_shares(token_hash, label, sections, max_uses, expires_at, created_by) VALUES(?, ?, ?, ?, ?, ?)")
    .bind(await tokenHash(token), label || null, JSON.stringify(sections), maxUses, sqlTime(expires), actorOf(user)).run();
  await recordTransfer(env, user, "share.create", `Created a share link${label ? ` “${label}”` : ""}: ${plural(sections.length, "section")}, ${plural(maxUses, "use")}, valid ${hours === 168 ? "7 days" : hours === 24 ? "24 hours" : "1 hour"}.`);
  return { created: true, id: Number(r?.meta?.last_row_id) || null, token, expiresAt: sqlTime(expires), maxUses, sections };
}

export async function revokeShare(env, user, id) {
  if (!(await transferTablesReady(env))) return { error: NEEDS_TRANSFER_MIGRATION, status: 503 };
  const cur = await env.DB.prepare("SELECT id, label FROM config_shares WHERE id = ?").bind(Number(id) || 0).first();
  if (!cur) return { error: "That share link does not exist.", status: 404 };
  await env.DB.prepare("UPDATE config_shares SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE id = ?").bind(cur.id).run();
  await recordTransfer(env, user, "share.revoke", `Revoked share link${cur.label ? ` “${cur.label}”` : ""}.`);
  return { revoked: true };
}

// The public side: another site presents a code and receives the live configuration for the shared sections.
// Every refusal looks the same, so a wrong, expired, revoked or used-up code tells a stranger nothing.
export async function exportForShare(env, token, host) {
  const refuse = { error: "This share link is not valid.", status: 403 };
  if (!(await transferTablesReady(env)) || !TOKEN_RE.test(str(token))) return refuse;
  const hash = await tokenHash(token);
  const row = await env.DB.prepare("SELECT id, label, sections, max_uses, uses, expires_at, revoked_at FROM config_shares WHERE token_hash = ?").bind(hash).first();
  if (!row || row.revoked_at) return refuse;
  const exp = parseSql(row.expires_at); if (!exp || exp <= new Date()) return refuse;
  // The use is counted first and atomically, so two requests cannot both take the last use.
  const used = await env.DB.prepare("UPDATE config_shares SET uses = uses + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ? AND uses < max_uses AND revoked_at IS NULL").bind(row.id).run();
  if (!used?.meta?.changes) return refuse;
  const built = await buildExport(env, { host, sections: sectionsOf(row.sections), from: "live", name: `Configuration of ${host}` });
  if (!built.included.length) return refuse;
  await recordTransfer(env, { email: `share:${row.label || row.id}`, role: "share" }, "share.used", `Share link${row.label ? ` “${row.label}”` : ""} was used to copy ${plural(built.included.length, "section")}.`);
  return { envelope: built.envelope, included: built.included };
}

// ---------- cloning from another site ----------
// Returns { origin, host } or { error }. Only a public https site on the normal port is accepted: no addresses,
// no private or local names, no credentials in the link, and never this site itself.
export function normalizeSourceUrl(input, selfHost = "") {
  let s = cleanLine(input, 300);
  if (!s) return { error: "Enter the address of the other site." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u; try { u = new URL(s); } catch { return { error: "That does not look like a web address." }; }
  if (u.protocol !== "https:") return { error: "Only secure (https) sites can be used." };
  if (u.username || u.password) return { error: "Leave user names and passwords out of the address." };
  if (u.port && u.port !== "443") return { error: "Use the normal address of the site, without a port number." };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!host || host.length > 253 || host.includes(":") || host.startsWith("[") || /^\d+(\.\d+){0,3}$/.test(host) || !host.includes(".")
    || host === "localhost" || /\.(local|localhost|internal|lan|home|corp|intranet|test|invalid|example)$/.test(host) || !host.split(".").every((l) => label.test(l))) {
    return { error: "Use the public address of the other site, for example https://my-other-site.com." };
  }
  if (selfHost && host === selfHost.toLowerCase()) return { error: "That is the site you are on. To move settings between versions of one site, use export and import." };
  return { origin: `https://${host}`, host };
}

// Fetch the shared configuration. opts = { url, token, selfHost, fetch? }. Returns { text, host } | { error }.
export async function fetchShared(opts = {}) {
  const src = normalizeSourceUrl(opts.url, opts.selfHost); if (src.error) return src;
  const token = cleanLine(opts.token, 80);
  if (!TOKEN_RE.test(token)) return { error: "The share code is not in the right form. Copy it again from the other site; it starts with lcs_." };
  const doFetch = opts.fetch || fetch;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), opts.timeoutMs || 8000);
  try {
    const res = await doFetch(`${src.origin}${SHARE_PATH}`, { method: "POST", redirect: "manual", signal: ctl.signal, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, body: "{}" });
    if (res.status >= 300 && res.status < 400) return { error: "The other site sent the request somewhere else, so it was not followed. Check the address." };
    if (res.status === 403 || res.status === 401) return { error: "The other site did not accept the share code. It may have expired, been revoked or been used too many times." };
    if (res.status === 404) return { error: "The other site does not offer sharing. Check the address, and make sure it runs this version of the platform." };
    if (!res.ok) return { error: `The other site answered with an error (${res.status}). Try again in a moment.` };
    const len = Number(res.headers?.get?.("content-length"));
    if (Number.isFinite(len) && len > MAX_IMPORT_BYTES) return { error: "The other site sent more than a configuration should contain." };
    let text = "";
    if (res.body?.getReader) {
      const reader = res.body.getReader(), dec = new TextDecoder(); let total = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > MAX_IMPORT_BYTES) { try { await reader.cancel(); } catch { /* ignore */ } return { error: "The other site sent more than a configuration should contain." }; } text += dec.decode(value, { stream: true }); }
      text += dec.decode();
    } else text = await res.text();
    if (text.length > MAX_IMPORT_BYTES) return { error: "The other site sent more than a configuration should contain." };
    let body; try { body = JSON.parse(text); } catch { return { error: "The other site did not send a configuration." }; }
    if (!body || body.success !== true || !body.envelope) return { error: (body && body.error) || "The other site did not send a configuration." };
    return { text: JSON.stringify(body.envelope), host: src.host };
  } catch (e) {
    return { error: e?.name === "AbortError" ? "The other site took too long to answer." : "Could not reach the other site. Check the address and try again." };
  } finally { clearTimeout(timer); }
}
