async function loadPlatformUpdatesTable() {
const tbody = document.getElementById("updatesTableBody");

if (!tbody) return;

try {
const res = await fetch(
"/en/api/v1/platform-updates/list"
);

const data = await res.json();

if (!res.ok || !data.success) {
  throw new Error(
    data.error || "Failed to load platform updates."
  );
}

const updates = data.updates || [];

if (!updates.length) {
  tbody.innerHTML = `
    <tr>
      <td colspan="6" class="muted">
        No platform updates yet.
      </td>
    </tr>
  `;

  return;
}

tbody.innerHTML = updates.map(update => {

  const published = Number(update.published) === 1;
  const featured = Number(update.featured) === 1;

  const dateValue =
    update.published_at ||
    update.created_at;

  const date = dateValue
    ? new Date(dateValue).toLocaleDateString()
    : "—";

  const author =
    update.author_name ||
    "No author";

  return `
    <tr>

      <td>
        <strong>
          ${escapeHtml(update.title || "Untitled")}
        </strong>

        <div class="muted">
          /updates/${escapeHtml(update.slug || "")}
        </div>
      </td>

      <td>
        ${escapeHtml(author)}
      </td>

      <td>
        ${
          published
            ? '<span class="status status--success">Published</span>'
            : '<span class="status status--muted">Draft</span>'
        }
      </td>

      <td>
        ${
          featured
            ? '<span class="status status--success">Featured</span>'
            : '<span class="muted">No</span>'
        }
      </td>

      <td>
        ${escapeHtml(date)}
      </td>

      <td class="table-actions">

        ${
          published
            ? `
              <a
                href="/en/updates/${encodeURIComponent(update.slug)}"
                class="btn btn--ghost btn--sm"
                target="_blank"
                rel="noopener"
              >
                View
              </a>
            `
            : ""
        }

        <button
          type="button"
          class="btn btn--ghost btn--sm"
          onclick="editPlatformUpdate(${Number(update.id)})"
        >
          Edit
        </button>

        <button
          type="button"
          class="btn btn--danger btn--sm"
          onclick="deletePlatformUpdate(${Number(update.id)})"
        >
          Delete
        </button>

      </td>

    </tr>
  `;
}).join("");

} catch (error) {

console.error(
  "Failed to load platform updates:",
  error
);

tbody.innerHTML = `
  <tr>
    <td colspan="6" class="muted">
      Failed to load platform updates.
    </td>
  </tr>
`;

}
}

