import { resolvePicks, latestItems } from "../component-sources.js";
import { MAX_GRID_ITEMS, MAX_TABLE_COLS, MAX_TABLE_ROWS, arr, bool, cleanPicks, e, image, int, link, obj, pickEnum, text } from "./shared.js";
import { stars, wrap } from "./grid.js";

// ---------------------------------------------------------------------------
// data_table
// ---------------------------------------------------------------------------

export const TABLE_CASINO_COLUMNS = ["name", "rating", "bonus", "license", "button"];

const TABLE_COLUMN_LABELS = { name: "Casino", rating: "Rating", bonus: "Bonus", license: "Licence", button: "" };

export const TABLE_DEFAULTS = {
  mode: "manual",
  columns: [{ label: "Name", align: "left" }, { label: "Details", align: "left" }],
  rows: [],
  casino_source: "picked",
  items: [],
  limit: 5,
  casino_cols: ["name", "rating", "bonus", "button"],
  button_text: "Visit",
  style: "striped",
  header: "dark",
  compact: false,
  first_col_bold: true,
  caption: "",
  note: ""
};

function cleanCell(raw) {
  if (raw && typeof raw === "object") {
    const t = text(raw.t, 300);
    const l = link(raw.l);
    const i = image(raw.i);
    const out = { t };
    if (l) out.l = l;
    if (i) out.i = i;
    if (raw.b === true || raw.b === "true") out.b = true;
    return out;
  }
  return { t: text(raw, 300) };
}

export function cleanTableSettings(raw) {
  const s = obj(raw);
  const columns = [];
  for (const c of arr(s.columns)) {
    if (columns.length >= MAX_TABLE_COLS) break;
    if (c === null || c === undefined) continue;
    const label = typeof c === "object" ? text(c.label, 60) : text(c, 60);
    const align = typeof c === "object" ? pickEnum(c.align, ["left", "center", "right"], "left") : "left";
    columns.push({ label, align });
  }
  if (!columns.length) columns.push(...TABLE_DEFAULTS.columns.map((c) => ({ ...c })));
  const rows = [];
  for (const r of arr(s.rows)) {
    if (rows.length >= MAX_TABLE_ROWS) break;
    const cells = Array.isArray(r) ? r : [];
    const row = columns.map((_, i) => cleanCell(cells[i]));
    rows.push(row);
  }
  const wanted = Array.isArray(s.casino_cols) ? s.casino_cols.map(String) : TABLE_DEFAULTS.casino_cols;
  const casinoCols = TABLE_CASINO_COLUMNS.filter((c) => wanted.includes(c));
  return {
    mode: pickEnum(s.mode, ["manual", "casinos"], TABLE_DEFAULTS.mode),
    columns,
    rows,
    casino_source: pickEnum(s.casino_source, ["picked", "latest"], TABLE_DEFAULTS.casino_source),
    items: cleanPicks(s.items, MAX_GRID_ITEMS, ["casino"]),
    limit: int(s.limit, 1, MAX_GRID_ITEMS, TABLE_DEFAULTS.limit),
    casino_cols: casinoCols.length ? casinoCols : TABLE_DEFAULTS.casino_cols.slice(),
    button_text: text(s.button_text, 30) || TABLE_DEFAULTS.button_text,
    style: pickEnum(s.style, ["default", "striped", "bordered"], TABLE_DEFAULTS.style),
    header: pickEnum(s.header, ["dark", "brand", "light"], TABLE_DEFAULTS.header),
    compact: bool(s.compact, TABLE_DEFAULTS.compact),
    first_col_bold: bool(s.first_col_bold, TABLE_DEFAULTS.first_col_bold),
    caption: text(s.caption, 160),
    note: text(s.note, 300)
  };
}

function cellHtml(cell, tag, align, scope) {
  const img = cell.i ? `<img class="dt-cell__img" src="${e(cell.i)}" alt="" loading="lazy" decoding="async"> ` : "";
  let inner = e(cell.t);
  if (cell.b) inner = `<strong>${inner}</strong>`;
  if (cell.l) {
    const external = /^https?:/i.test(cell.l);
    inner = `<a href="${e(cell.l)}"${external ? ' target="_blank" rel="noopener"' : ""}>${inner || e(cell.l)}</a>`;
  }
  return `<${tag}${scope ? ` scope="${scope}"` : ""} class="dt-a-${align}">${img}${inner}</${tag}>`;
}

async function casinoRows(db, s) {
  let items;
  if (s.casino_source === "picked") items = (await resolvePicks(db, s.items)).filter((m) => m.source === "casino");
  else items = await latestItems(db, "casino", { limit: s.limit, sort: "rating" });
  return items;
}

export async function renderDataTable(db, component) {
  const s = cleanTableSettings(component.settings);
  let head;
  let body;
  if (s.mode === "casinos") {
    const items = await casinoRows(db, s);
    if (!items.length) return "";
    const cols = s.casino_cols;
    head = `<tr>${cols.map((c) => `<th scope="col" class="dt-a-${c === "button" ? "right" : "left"}">${e(TABLE_COLUMN_LABELS[c])}</th>`).join("")}</tr>`;
    body = items
      .map((m) => {
        const cells = cols.map((c) => {
          if (c === "name") {
            const logo = m.image ? `<img class="dt-cell__img" src="${e(m.image)}" alt="" loading="lazy" decoding="async"> ` : "";
            return `<th scope="row" class="dt-a-left">${logo}<a href="${e(m.url)}">${e(m.title)}</a></th>`;
          }
          if (c === "rating") return `<td class="dt-a-left">${m.rating > 0 ? stars(m.rating) : "&mdash;"}</td>`;
          if (c === "bonus") return `<td class="dt-a-left">${m.bonus ? e(m.bonus) : "&mdash;"}</td>`;
          if (c === "license") return `<td class="dt-a-left">${m.license ? e(m.license) : "&mdash;"}</td>`;
          return `<td class="dt-a-right"><a class="btn btn--primary btn--sm" href="${e(m.cta_url || m.url)}" rel="nofollow sponsored noopener" target="_blank">${e(s.button_text)}</a></td>`;
        });
        return `<tr>${cells.join("")}</tr>`;
      })
      .join("");
  } else {
    if (!s.rows.length && !s.columns.some((c) => c.label)) return "";
    head = `<tr>${s.columns.map((c) => `<th scope="col" class="dt-a-${c.align}">${e(c.label)}</th>`).join("")}</tr>`;
    body = s.rows
      .map((row) => `<tr>${row.map((cell, i) => cellHtml(cell, i === 0 && s.first_col_bold ? "th" : "td", s.columns[i].align, i === 0 && s.first_col_bold ? "row" : "")).join("")}</tr>`)
      .join("");
  }
  const title = text(component.title, 140);
  const heading = title ? `<h2 class="dt__title">${e(title)}</h2>` : "";
  const caption = s.caption ? `<caption>${e(s.caption)}</caption>` : "";
  const note = s.note ? `<p class="dt__note">${e(s.note)}</p>` : "";
  const cls = `component-table dt dt--${s.style} dt--head-${s.header}${s.compact ? " dt--compact" : ""}`;
  const inner = `${heading}<div class="dt__scroll" tabindex="0" role="region" aria-label="${e(title || s.caption || "Table")}"><table class="dt__table">${caption}<thead>${head}</thead><tbody>${body}</tbody></table></div>${note}`;
  return `<section class="${cls}">${wrap(inner, component)}</section>`;
}
