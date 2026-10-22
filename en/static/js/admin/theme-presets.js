// ============================================================
// THEME PRESETS
// ============================================================

const SITE_THEME_PRESETS = {

  midnight: {
    theme_primary: "#8b5cf6",
    theme_primary_hover: "#7c3aed",
    theme_secondary: "#ec4899",
    theme_secondary_hover: "#db2777",
    theme_accent: "#22d3ee",
    theme_background: "#050505",
    theme_surface: "#0f0f12",
    theme_surface_alt: "#15151a",
    theme_text: "#ffffff",
    theme_text_muted: "#a1a1aa",
    theme_border: "#27272a",
    theme_button_text: "#ffffff"
  },


  ocean: {
    theme_primary: "#0ea5e9",
    theme_primary_hover: "#0284c7",
    theme_secondary: "#06b6d4",
    theme_secondary_hover: "#0891b2",
    theme_accent: "#38bdf8",
    theme_background: "#020617",
    theme_surface: "#0f172a",
    theme_surface_alt: "#172554",
    theme_text: "#ffffff",
    theme_text_muted: "#94a3b8",
    theme_border: "#1e3a5f",
    theme_button_text: "#ffffff"
  },


  emerald: {
    theme_primary: "#10b981",
    theme_primary_hover: "#059669",
    theme_secondary: "#14b8a6",
    theme_secondary_hover: "#0d9488",
    theme_accent: "#34d399",
    theme_background: "#02110c",
    theme_surface: "#071a13",
    theme_surface_alt: "#0b241a",
    theme_text: "#ffffff",
    theme_text_muted: "#9ca3af",
    theme_border: "#164e3b",
    theme_button_text: "#ffffff"
  },


  ruby: {
    theme_primary: "#ef4444",
    theme_primary_hover: "#dc2626",
    theme_secondary: "#f43f5e",
    theme_secondary_hover: "#e11d48",
    theme_accent: "#fb7185",
    theme_background: "#110304",
    theme_surface: "#1c0709",
    theme_surface_alt: "#2a0a0d",
    theme_text: "#ffffff",
    theme_text_muted: "#a1a1aa",
    theme_border: "#4c0519",
    theme_button_text: "#ffffff"
  },


  gold: {
    theme_primary: "#eab308",
    theme_primary_hover: "#ca8a04",
    theme_secondary: "#f59e0b",
    theme_secondary_hover: "#d97706",
    theme_accent: "#facc15",
    theme_background: "#0c0a04",
    theme_surface: "#171207",
    theme_surface_alt: "#211a08",
    theme_text: "#ffffff",
    theme_text_muted: "#a1a1aa",
    theme_border: "#4d3b0a",
    theme_button_text: "#000000"
  },


  light: {
    theme_primary: "#2563eb",
    theme_primary_hover: "#1d4ed8",
    theme_secondary: "#7c3aed",
    theme_secondary_hover: "#6d28d9",
    theme_accent: "#0891b2",
    theme_background: "#ffffff",
    theme_surface: "#f8fafc",
    theme_surface_alt: "#f1f5f9",
    theme_text: "#111827",
    theme_text_muted: "#64748b",
    theme_border: "#e2e8f0",
    theme_button_text: "#ffffff"
  }

};


function applyThemePreset(name) {

  const preset =
    SITE_THEME_PRESETS[name];

  if (!preset) return;

  Object.entries(preset).forEach(
    ([key, value]) => {

      const field =
        document.querySelector(
          `[name="${key}"]`
        );

      if (field) {
        field.value = value;
      }

    }
  );
}
// ── Load ad components for display in settings ──────────
async function loadAdComponents() {
  const container = document.getElementById("adComponentsList");
  const empty = document.getElementById("adComponentsEmpty");
  if (!container) return;

  try {
    const res = await fetch("/en/api/v1/components/list?type=ad", {
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error("Failed to load");
    const data = await res.json();
    const components = data.components || [];

    if (components.length === 0) {
      if (empty) {
        empty.textContent =
          "No ad components found. Create one in the Components page with type 'ad'.";
      }
      return;
    }

    if (empty) empty.style.display = "none";

    container.innerHTML = components
      .map(
        (comp) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface)">
        <div>
          <strong style="font-size:14px">${escapeHtml(comp.name)}</strong>
          <span style="margin-left:8px;font-size:12px;color:var(--text-muted)">/${escapeHtml(comp.slug)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:12px;padding:3px 8px;border-radius:999px;background:${comp.status === "active" ? "rgba(34,197,94,0.15)" : "rgba(161,161,170,0.15)"};color:${comp.status === "active" ? "#22c55e" : "var(--text-muted)"}">${comp.status === "active" ? "Active" : "Inactive"}</span>
          <a href="/en/admin/components" target="_blank" style="font-size:12px;text-decoration:none">Edit</a>
        </div>
      </div>
    `
      )
      .join("");
  } catch (e) {
    if (empty) {
      empty.textContent = "Could not load ad components.";
    }
  }
}

