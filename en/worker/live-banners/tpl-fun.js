// Scripted chat-style bubble and the robot mascot. No AI call, no external assets.
import { esc } from "./escape.js";
import { cta, img, disclaimer, head, link } from "./tpl-shared.js";

export function renderChat({ c }) {
  const msgs = (Array.isArray(c.messages) ? c.messages : []).slice(0, 3);
  const bubbles = msgs.map((m, i) => `<p class="lb-bubble" data-lb-type style="--lb-i:${i}">${esc(m)}</p>`).join("");
  const chips = (Array.isArray(c.chips) ? c.chips : []).slice(0, 4).map((ch) => link(ch.url, ch.label, { cls: "lb-chip" })).join("");
  const avatar = c.image ? img(c.image, "", { w: 36, h: 36, cls: "lb-avatar" }) : `<span class="lb-avatar lb-avatar--def" aria-hidden="true">✦</span>`;
  return `<div class="lb-chat">${avatar}<div class="lb-thread" aria-live="polite">${bubbles}<div class="lb-chips">${chips}</div></div>${cta(c)}${disclaimer(c)}</div>`;
}

const ROBOT = `<svg class="lb-robot" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Friendly robot"><g class="lb-robot__body"><line x1="32" y1="6" x2="32" y2="14" stroke="currentColor" stroke-width="3"/><circle cx="32" cy="5" r="3" fill="var(--lb-accent,#f5a623)"/><rect x="14" y="14" width="36" height="28" rx="8" fill="currentColor"/><circle class="lb-robot__eye" cx="25" cy="27" r="4" fill="#fff"/><circle class="lb-robot__eye" cx="39" cy="27" r="4" fill="#fff"/><rect x="24" y="35" width="16" height="3" rx="1.5" fill="#fff"/><rect x="18" y="44" width="28" height="14" rx="5" fill="currentColor"/><rect class="lb-robot__arm" x="48" y="44" width="9" height="5" rx="2.5" fill="currentColor"/></g></svg>`;

export function renderRobot({ c }) {
  return `<div class="lb-mascot">${ROBOT}<div class="lb-speech">${head(c)}${c.text ? `<p class="lb-t">${esc(c.text)}</p>` : ""}${cta(c)}${disclaimer(c)}</div></div>`;
}
