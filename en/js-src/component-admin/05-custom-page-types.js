// ── Page types for the custom content types you created (custom_<type>, custom_<type>_list,
// compare_<type>, compare_<type>_list). Built from the Custom Types list; DOM calls only.
async function populateCustomPageTypes() {
  const groups = [
    document.getElementById("assignCustomGroup"),
    document.getElementById("filterCustomGroup"),
  ].filter(Boolean);
  if (!groups.length) return;
  try {
    const res = await fetch("/en/api/v1/custom-types/list");
    const data = await res.json();
    const types = (data && data.types) || [];
    if (!types.length) { groups.forEach((g) => g.remove()); return; }
    groups.forEach((group) => {
      const filter = group.id === "filterCustomGroup";
      types.forEach((t) => {
        const slug = String(t.slug || "");
        if (!/^[a-z0-9_-]+$/i.test(slug)) return;
        const label = String(t.label || slug);
        [
          [`custom_${slug}`, `${label} (individual)`],
          [`custom_${slug}_list`, `${label} listing page`],
          [`compare_${slug}`, `Comparison: ${label} (individual)`],
          [`compare_${slug}_list`, `Comparison list: ${label}`],
        ].forEach(([value, text]) => {
          const opt = document.createElement("option");
          opt.value = value;
          opt.textContent = filter ? text.replace(/ \(individual\)$/, "") : text;
          group.appendChild(opt);
        });
      });
    });
  } catch {
    groups.forEach((g) => g.remove());
  }
}
