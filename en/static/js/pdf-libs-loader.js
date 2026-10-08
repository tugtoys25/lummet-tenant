// =====================================================
// PDF LIBS LOADER
// Loads jsPDF and the AutoTable plugin for research-pdf-export.js.
//
// Why this exists: both libraries were previously loaded as two static
// <script defer> tags pointed at cdnjs. That's a single point of failure —
// an ad blocker, a network-level content filter (some flag gambling-
// adjacent domains and block third-party script loads on them even
// though the page itself isn't blocked), or a CDN hiccup leaves
// window.jspdf undefined with no way to recover. research-pdf-export.js's
// own stage-aware check (load-jspdf / load-autotable) surfaces that
// clearly to the user now, but it can't fix the underlying load.
//
// This loader tries a primary CDN source for each library and falls back
// to a second, independent CDN if the primary script tag fails to load
// (fires `error`, e.g. net::ERR_BLOCKED_BY_CLIENT or a real network
// failure). AutoTable is only requested after jsPDF has actually loaded,
// since it extends jsPDF.API and needs it present first.
//
// This file doesn't build anything and doesn't know about PDFs — it just
// makes window.jspdf (and AutoTable on top of it) more likely to exist by
// the time the user clicks "Download PDF". research-pdf-export.js checks
// for both independently and fails loudly, with a clear message, if
// neither source worked.
// =====================================================

(function () {
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.onload = () => resolve(url);
      s.onerror = () => reject(new Error(`Failed to load ${url}`));
      document.head.appendChild(s);
    });
  }

  // Tries each URL in order; resolves on the first success, rejects only
  // if every source fails.
  function loadWithFallback(urls, label) {
    let chain = Promise.reject(new Error("no source attempted yet"));
    urls.forEach((url) => {
      chain = chain.catch(() => loadScript(url));
    });
    return chain.catch((error) => {
      console.error(`[Research PDF] all sources failed to load ${label}`, error);
      throw error;
    });
  }

  const JSPDF_SOURCES = [
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js",
    "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"
  ];
  const AUTOTABLE_SOURCES = [
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
    "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"
  ];

  loadWithFallback(JSPDF_SOURCES, "jsPDF")
    .then(() => loadWithFallback(AUTOTABLE_SOURCES, "AutoTable"))
    .catch(() => {
      // Nothing further to do here — research-pdf-export.js's own
      // load-jspdf / load-autotable checks report this to the user with
      // a clear message when they click "Download PDF".
    });
})();
