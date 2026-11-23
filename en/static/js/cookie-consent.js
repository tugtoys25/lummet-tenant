/* Cookie consent banner. Loaded only when Settings > Analytics > Cookie consent banner is On.
   Stores the choice in the lm_consent cookie (granted or denied, 180 days) and tells Google Analytics
   through consent mode. Built with DOM calls only, never HTML strings. A visitor can reopen it from any
   element with the data-cookie-settings attribute, or from window.lummetOpenCookieSettings(). */
(function () {
  "use strict";
  var script = document.currentScript || document.querySelector('script[src*="cookie-consent.js"]');
  var text = (script && script.getAttribute("data-text")) || "We use cookies to measure how the site is used. You can accept or reject non-essential cookies.";
  var policy = (script && script.getAttribute("data-policy")) || "";
  var banner = null;

  function read() { var m = document.cookie.match(/(?:^|; )lm_consent=(granted|denied)/); return m ? m[1] : null; }
  function write(v) {
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = "lm_consent=" + v + "; Max-Age=" + (180 * 86400) + "; Path=/; SameSite=Lax" + secure;
  }
  function apply(v) {
    try { if (typeof window.gtag === "function") window.gtag("consent", "update", { analytics_storage: v, ad_storage: v, ad_user_data: v, ad_personalization: v }); } catch (e) { /* analytics is optional */ }
    try { document.dispatchEvent(new CustomEvent("lummet:consent", { detail: { analytics: v === "granted" } })); } catch (e) { /* old browser */ }
  }
  function choose(v) { write(v); apply(v); close(); }
  function close() { if (banner && banner.parentNode) banner.parentNode.removeChild(banner); banner = null; }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === "text") n.textContent = attrs[k]; else if (k === "style") n.style.cssText = attrs[k]; else n.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function open() {
    if (banner) return;
    var btn = "padding:9px 16px;border-radius:8px;font:inherit;font-weight:600;cursor:pointer;border:1px solid currentColor;";
    var accept = el("button", { type: "button", text: "Accept all", style: btn + "background:#111;color:#fff;border-color:#111;" });
    var reject = el("button", { type: "button", text: "Reject non-essential", style: btn + "background:transparent;color:inherit;" });
    accept.addEventListener("click", function () { choose("granted"); });
    reject.addEventListener("click", function () { choose("denied"); });
    var msg = el("p", { style: "margin:0 0 6px", text: text });
    var kids = [msg];
    if (policy) { var a = el("a", { href: policy, text: "Read our policy", style: "color:inherit;text-decoration:underline" }); kids.push(el("p", { style: "margin:0" }, [a])); }
    var left = el("div", { style: "flex:1 1 280px;min-width:0" }, kids);
    var right = el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;align-items:center" }, [reject, accept]);
    banner = el("div", {
      role: "dialog", "aria-label": "Cookie consent", "aria-live": "polite",
      style: "position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;background:#fff;color:#111;border:1px solid #d0d0d0;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.18);padding:16px 18px;display:flex;gap:16px;flex-wrap:wrap;align-items:center;font:14px/1.45 system-ui,sans-serif;max-width:900px;margin:0 auto"
    }, [left, right]);
    document.body.appendChild(banner);
    accept.focus({ preventScroll: true });
  }

  window.lummetOpenCookieSettings = open;
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-cookie-settings]") : null;
    if (t) { e.preventDefault(); open(); }
  });
  function start() { var v = read(); if (v) apply(v); else open(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
