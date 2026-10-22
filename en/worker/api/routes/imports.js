// Conversion report imports.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as affiliateAccounts from "../../database/affiliate-accounts.js";
import { logAudit } from "../../database/audit.js";
import * as importBatchesDB from "../../database/import-batches.js";
import { parseCsv, parseJsonRows } from "../../imports/parse.js";
import { importConversionReport } from "../../imports/pipeline.js";
import { NOT_HANDLED, failure, json, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // CONVERSION REPORT IMPORTS (brief §11)
    // Editor+ (see migration 0034 permissions) -- unlike
    // postback_configs this holds no credentials, so it follows the
    // same tier as tracking_links/offers rather than admin-only.
    // ==================================

    if (path === "/api/v1/imports/list") {
      const url = new URL(request.url);
      const accountId = url.searchParams.get("account_id") ? Number(url.searchParams.get("account_id")) : null;
      const batches = await importBatchesDB.listImportBatches(env.DB, { accountId });
      return json({ success: true, batches });
    }

    if (path === "/api/v1/import/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const batch = await importBatchesDB.getImportBatchById(env.DB, id);
      if (!batch) return failure("Import batch not found", 404);
      return json({ success: true, batch: { ...batch, errors: batch.errors_json ? JSON.parse(batch.errors_json) : [] } });
    }

    if (path === "/api/v1/imports/conversions" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["account_id", "format", "content"]);

      const account = await affiliateAccounts.getAccountById(env.DB, body.account_id);
      if (!account) return failure("Affiliate account not found", 404);
      if (!["csv", "json"].includes(body.format)) return failure('format must be "csv" or "json"');

      let rows;
      try {
        rows = body.format === "csv" ? parseCsv(body.content) : parseJsonRows(body.content);
      } catch (error) {
        return failure(`Could not parse ${body.format.toUpperCase()} content: ${error.message}`, 422);
      }
      if (!rows.length) return failure("No rows found in the provided content", 422);

      const result = await importConversionReport(env.DB, {
        accountId: body.account_id,
        rows,
        format: body.format,
        fieldMapping: body.field_mapping || null,
        label: body.label || null,
        createdBy: user.user_id
      });

      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "import_batch", entityId: result.batchId,
        metadata: { account_id: body.account_id, format: body.format, total_rows: result.totalRows, imported: result.importedCount, errors: result.errorCount }
      });

      return json({ success: true, ...result });
    }

  return NOT_HANDLED;
}
