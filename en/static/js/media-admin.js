let currentMediaFilter = "";
let mediaPickerCallback = null;

document.addEventListener("DOMContentLoaded", () => {
  loadMediaGrid();
  initMediaForm();
});

async function loadMediaGrid() {
  const grid = document.getElementById("mediaGrid");
  if (!grid) return;
  try {
    const url = currentMediaFilter
      ? `/en/api/v1/media/list?folder=${currentMediaFilter}`
      : "/en/api/v1/media/list";
    const res = await fetch(url);
    const data = await res.json();
    const media = data.media || [];
    if (media.length === 0) {
      grid.innerHTML = '<p class="muted">No images yet.</p>';
      return;
    }
    grid.innerHTML = media.map(m => `
      <div style="background:var(--white);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow);position:relative">
        <img src="${m.thumbnail_url || m.url}" alt="${m.alt_text || m.filename}" style="width:100%;height:140px;object-fit:cover;cursor:pointer" onclick="copyMediaUrl('${m.url}')" loading="lazy">
        <div style="padding:10px">
          <p style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.filename}</p>
          <p class="muted" style="font-size:11px">${m.folder || "general"}</p>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn btn--ghost btn--sm" onclick="copyMediaUrl('${m.url}')" title="Copy URL">Copy</button>
            <button class="btn btn--danger btn--sm" onclick="deleteMedia(${m.id})">Delete</button>
          </div>
        </div>
      </div>
    `).join("");
  } catch {
    grid.innerHTML = '<p class="muted">Failed to load.</p>';
  }
}

function filterMedia(folder) {
  currentMediaFilter = folder;
  loadMediaGrid();
}

function copyMediaUrl(url) {
  navigator.clipboard.writeText(url).then(() => {
    alert("URL copied: " + url);
  }).catch(() => {
    prompt("Copy this URL:", url);
  });
}

async function deleteMedia(id) {
  if (!confirm("Delete this image?")) return;
  try {
    await fetch("/en/api/v1/media/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    loadMediaGrid();
  } catch { alert("Network error"); }
}

function initMediaForm() {
  const form = document.getElementById("mediaForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("mediaFormAlert");
    if (alertEl) alertEl.style.display = "none";
    const formData = new FormData(form);
    const payload = {
      url: formData.get("url"),
      filename: formData.get("filename"),
      thumbnail_url: formData.get("thumbnail_url") || null,
      folder: formData.get("folder") || "general",
      alt_text: formData.get("alt_text") || null,
    };
    try {
      const res = await fetch("/en/api/v1/media/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (alertEl) {
          alertEl.className = "alert alert--success";
          alertEl.textContent = "Image added to library!";
          alertEl.style.display = "block";
        }
        form.reset();
        loadMediaGrid();
      } else {
        if (alertEl) {
          alertEl.className = "alert alert--error";
          alertEl.textContent = data.error || "Failed";
          alertEl.style.display = "block";
        }
      }
    } catch {
      if (alertEl) {
        alertEl.className = "alert alert--error";
        alertEl.textContent = "Network error";
        alertEl.style.display = "block";
      }
    }
  });
}

// Media picker for other admin forms
async function openMediaPicker(callback) {
  mediaPickerCallback = callback;
  const modal = document.getElementById("mediaPickerModal");
  const grid = document.getElementById("mediaPickerGrid");
  if (!modal || !grid) return;
  modal.style.display = "flex";
  grid.innerHTML = '<p class="muted">Loading...</p>';
  try {
    const res = await fetch("/en/api/v1/media/list");
    const data = await res.json();
    const media = data.media || [];
    if (media.length === 0) {
      grid.innerHTML = '<p class="muted">No images in library. Add images in Media page first.</p>';
      return;
    }
    grid.innerHTML = media.map(m => `
      <div style="cursor:pointer;text-align:center" onclick="selectMedia('${m.url}')">
        <img src="${m.thumbnail_url || m.url}" alt="${m.alt_text || m.filename}" style="width:100%;height:100px;object-fit:cover;border-radius:8px;border:2px solid transparent;transition:border 0.2s" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='transparent'">
        <p style="font-size:11px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.filename}</p>
      </div>
    `).join("");
  } catch {
    grid.innerHTML = '<p class="muted">Failed to load.</p>';
  }
}

function selectMedia(url) {
  if (mediaPickerCallback) mediaPickerCallback(url);
  document.getElementById("mediaPickerModal").style.display = "none";
  mediaPickerCallback = null;
}
