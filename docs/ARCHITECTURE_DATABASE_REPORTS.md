# Architecture: report engine (`worker/database/reports.js` + `worker/database/reports/`)

Since v22.26 `worker/database/reports.js` (1,014 lines) is a facade that re-exports its nine public functions from 8 modules in `worker/database/reports/`. `cron.js`, the super API handlers and the API routes keep importing `./database/reports.js`. The report delivery code (`worker/reports/delivery.js`) was already separate.

Public API (unchanged): `isValidReportType`, `getReportColumnOptions`, `getAllReportDefinitions`, `runReport`, `toCsv`, `toHtml`, `executeReportRun`, `runDueReportSchedules`, `runDueReportSchedulesNow`.

## Parts

| File | Holds | Lines |
|---|---|---:|
| `reports/columns.js` | Report types, the column manifest of every report, `getReportColumnOptions`, `getAllReportDefinitions` | 209 |
| `reports/handlers-core.js` | Handlers: dimension, affiliate, geo, content, traffic, executive, conversion funnel, revenue/commission | 162 |
| `reports/reconciliation.js` | Reconciliation report (internal expected vs imported reported commission) | 112 |
| `reports/cohort-ltv.js` | Cohort analysis and LTV analysis | 175 |
| `reports/operational-health.js` | Operational health report | 49 |
| `reports/run.js` | The handler registry, `runReport`, column selection, grouping and subtotals | 117 |
| `reports/export.js` | `toCsv`, `toHtml` | 35 |
| `reports/scheduling.js` | Run bookkeeping (`executeReportRun`), next run time, due schedules (cron and manual) | 155 |

Imports (no cycles; a test checks it, and that every import, dynamic ones included, resolves):

- `columns` imports from: no other part
- `handlers-core` imports from: `columns`
- `reconciliation` imports from: `columns`
- `cohort-ltv` imports from: `columns`
- `operational-health` imports from: `columns`
- `run` imports from: `handlers-core`, `reconciliation`, `cohort-ltv`, `operational-health`
- `export` imports from: no other part
- `scheduling` imports from: `run`

## Adding a report type

Add the type to `REPORT_TYPES` and its column manifest in `columns.js`, write the handler in the part where it fits (or a new part), and register it in `REPORT_HANDLERS` in `run.js`. The hard rules in the header of `reports.js` still apply: re-resolve the requesting user's item access on every run, and never return fabricated rows.
