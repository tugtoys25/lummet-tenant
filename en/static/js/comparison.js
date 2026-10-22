// Comparison page: "Show differences only", and removing an item from the comparison
// (it only hides the column for this visit; "Restore" brings it back).
document.addEventListener("DOMContentLoaded", () => {
  const box = document.getElementById("cmpDiffOnly");
  const table = document.getElementById("cmpTable");
  if (!table) return;
  if (box) box.addEventListener("change", () => table.classList.toggle("cmp-only-diff", box.checked));

  const removedBar = document.getElementById("cmpRemoved");
  const heads = Array.from(table.querySelectorAll("thead th.cmp-head"));
  const hidden = new Set();

  function setColumn(index, show) {
    // index 0 is the first item; cells sit after the label column
    Array.from(table.rows).forEach((row) => {
      const cell = row.cells[index + 1];
      if (cell && !(row.cells.length === 1 || cell.colSpan > 1)) cell.hidden = !show;
    });
    const visible = heads.length - hidden.size;
    table.querySelectorAll("tr.cmp-group th").forEach((th) => { th.colSpan = visible + 1; });
    table.querySelectorAll(".cmp-remove").forEach((b) => { b.hidden = visible <= 2; });
  }

  function drawRemoved() {
    if (!removedBar) return;
    removedBar.textContent = "";
    removedBar.hidden = hidden.size === 0;
    hidden.forEach((i) => {
      const name = heads[i].querySelector(".cmp-head__name");
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "cmp-restore";
      chip.textContent = "Restore " + (name ? name.textContent : "item");
      chip.addEventListener("click", () => { hidden.delete(i); setColumn(i, true); drawRemoved(); });
      removedBar.appendChild(chip);
    });
  }

  heads.forEach((th, i) => {
    const b = th.querySelector(".cmp-remove");
    if (!b) return;
    b.addEventListener("click", () => {
      if (heads.length - hidden.size <= 2) return; // a comparison needs at least two items
      hidden.add(i);
      setColumn(i, false);
      drawRemoved();
    });
  });
  setColumn(0, true);
});
