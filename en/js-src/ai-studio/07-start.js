  S.view = "tools";
  api("meta").then(function (m) {
    if (m.error || !m.tasks) { root.textContent = m.error || "AI Studio is not available for your role."; return; }
    S.meta = m; render();
  });
