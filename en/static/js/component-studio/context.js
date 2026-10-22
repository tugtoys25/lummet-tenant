// Component Studio: the editor's page elements, constants and the one shared state object.

// ---- context
export var form = document.getElementById("componentForm");

export var panel = document.getElementById("csPanel");

export var typeSel = document.getElementById("componentType");

export var titleEl = form && form.querySelector('[name="title"]');

export var contentEl = form && form.querySelector('[name="content"]');

export var settingsEl = form && form.querySelector('[name="settings_json"]');

export var contentGroup = document.getElementById("csContentGroup");

export var settingsGroup = document.getElementById("csSettingsGroup");

export var body = document.getElementById("csBody");

export var advToggle = document.getElementById("csAdvanced");

export var previewBox = document.getElementById("csPreviewBox");

export var frame = document.getElementById("csPreview");

export var previewNote = document.getElementById("csPreviewNote");

export var SOURCES = [
  ["casino", "Casinos"], ["news", "News"], ["research", "Research"], ["author", "Authors"],
  ["update", "Updates"], ["sportsbook", "Sportsbooks"], ["affiliate_partner", "Affiliate partners"],
  ["custom", "Custom content"], ["media", "Pictures"]
];

var LINK_SOURCES = [["page", "Pages"], ["review", "Reviews"], ["casino", "Casinos"], ["news", "News"], ["research", "Research"], ["author", "Authors"], ["update", "Updates"], ["sportsbook", "Sportsbooks"], ["affiliate_partner", "Affiliate partners"], ["custom", "Custom content"]];

export var RESEARCH_TYPES = ["report", "country", "regulator", "topic", "development", "legislation", "licence"];

export var NEW_TYPES = ["content_grid", "data_table", "section"];

export var FORM_TYPES = ["text", "cta", "banner", "faq_group", "author", "casino_grid", "comparison_table", "news_feed"].concat(NEW_TYPES);

export var st = { S: {}, busy: false };

export function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

export function btn(text, cls, fn) { var b = el("button", cls || "hh-btn", text); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; }

export function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }

export function parseObj(text) { try { var v = JSON.parse(text); return isObj(v) ? v : {}; } catch (e) { return {}; } }
