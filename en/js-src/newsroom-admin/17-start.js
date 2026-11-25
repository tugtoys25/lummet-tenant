  document.addEventListener("DOMContentLoaded", async () => {
    if (!$("nrPanel")) return;
    document.querySelectorAll("[data-nr-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.nrTab)));
    const d = await api("meta");
    if (!d) { $("nrPanel").textContent = "Could not load newsroom settings."; return; }
    state.meta = d; setTab("queues");
  });
