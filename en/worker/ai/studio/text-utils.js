import { MAX_FIELD, MAX_SOURCE_CHARS } from "./config.js";

// ---------- small helpers ----------

export const clip = (v, n = MAX_FIELD) => String(v == null ? "" : v).trim().slice(0, n);

export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Escape plain text and turn it into paragraphs and bullet lists. Safe to store as HTML. */
export function textToHtml(text) {
  const blocks = String(text || "").replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b) => {
    const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length && lines.every((l) => /^[-*•]\s+/.test(l))) {
      return "<ul>" + lines.map((l) => `<li>${esc(l.replace(/^[-*•]\s+/, ""))}</li>`).join("") + "</ul>";
    }
    return `<p>${lines.map(esc).join("<br>")}</p>`;
  }).join("\n");
}

export function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

/** Models often wrap JSON in code fences or add a sentence around it. Pull the JSON out. */
export function parseJsonLoose(text) {
  if (text == null) return null;
  if (typeof text === "object") return text;
  let s = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(s); } catch (_) { /* fall through */ }
  const first = s.search(/[\[{]/);
  if (first < 0) return null;
  const open = s[first], close = open === "{" ? "}" : "]";
  const last = s.lastIndexOf(close);
  if (last <= first) return null;
  try { return JSON.parse(s.slice(first, last + 1)); } catch (_) { return null; }
}

export function stripHtml(html) {
  return String(html || "")
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- reading a web page the editor points at ----------

export function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch (_) { return { ok: false, reason: "That is not a valid web address." }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "Only http and https addresses can be read." };
  if (u.username || u.password) return { ok: false, reason: "Addresses with a username or password are not allowed." };
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return { ok: false, reason: "That address points inside a private network." };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith("[")) return { ok: false, reason: "Use the website name, not a numeric address." };
  if (u.port && u.port !== "80" && u.port !== "443") return { ok: false, reason: "Only standard web ports are allowed." };
  return { ok: true, url: u.toString() };
}

/** Fetch one page and return its readable text. Follows at most 3 redirects, re-checking each hop. */
export async function fetchSourceText(rawUrl, fetchImpl = globalThis.fetch) {
  let current = checkUrl(rawUrl);
  if (!current.ok) return { ok: false, url: String(rawUrl || ""), error: current.reason };
  let url = current.url;
  for (let hop = 0; hop < 4; hop++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    let res;
    try {
      res = await fetchImpl(url, { redirect: "manual", signal: ctl.signal, headers: { "User-Agent": "LummetResearchBot/1.0", Accept: "text/html,text/plain;q=0.9" } });
    } catch (e) {
      clearTimeout(timer);
      return { ok: false, url, error: "The page could not be reached." };
    }
    clearTimeout(timer);
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      let next;
      try { next = new URL(res.headers.get("location"), url).toString(); } catch (_) { return { ok: false, url, error: "The page redirected somewhere invalid." }; }
      current = checkUrl(next);
      if (!current.ok) return { ok: false, url, error: "The page redirected to an address that is not allowed." };
      url = current.url;
      continue;
    }
    if (!res.ok) return { ok: false, url, error: `The page answered with status ${res.status}.` };
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (type && !/text\/|html|xml/.test(type)) return { ok: false, url, error: "Only web pages and plain text can be read." };
    const len = Number(res.headers.get("content-length") || 0);
    if (len > 3_000_000) return { ok: false, url, error: "The page is too large." };
    const raw = (await res.text()).slice(0, 600_000);
    const title = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    const text = stripHtml(raw).slice(0, MAX_SOURCE_CHARS);
    if (text.length < 40) return { ok: false, url, error: "The page has no readable text." };
    return { ok: true, url, title: clip(stripHtml(title || ""), 200), text };
  }
  return { ok: false, url, error: "Too many redirects." };
}
