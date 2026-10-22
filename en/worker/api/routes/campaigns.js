// Campaigns.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import { logAudit } from "../../database/audit.js";
import * as itemAccess from "../../database/item-access.js";
import { NOT_HANDLED, failure, json, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // CAMPAIGNS (Phase 10)
    // ==================================

    if (path === "/api/v1/campaigns/list") {
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      const { condition, params } = await itemAccess.getAccessibleWhereClause(env.DB, user, "campaigns", "read");
      const statusClause = status ? "AND status = ?" : "";
      const result = await env.DB.prepare(`
        SELECT * FROM campaigns
        WHERE 1=1 ${condition ? "AND " + condition : ""} ${statusClause}
        ORDER BY created_at DESC
      `).bind(...params, ...(status ? [status] : [])).all();
      return json({ success: true, campaigns: result.results || [] });
    }

    if (path === "/api/v1/campaign/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const campaign = await itemAccess.getItemById(env.DB, "campaigns", id);
      if (!campaign) return failure("Campaign not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, "campaigns", "read", campaign);
      if (!canAccess) return failure("Campaign not found", 404);

      return json({ success: true, campaign });
    }

    if (path === "/api/v1/campaign/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name"]);

      const result = await env.DB.prepare(`
        INSERT INTO campaigns (name, utm_source, utm_medium, utm_campaign, utm_term, utm_content, status, start_date, end_date, notes, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        body.name, body.utmSource ?? null, body.utmMedium ?? null, body.utmCampaign ?? null,
        body.utmTerm ?? null, body.utmContent ?? null, body.status || "active",
        body.startDate ?? null, body.endDate ?? null, body.notes ?? null,
        user.user_id, user.user_id
      ).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "create", entityType: "campaign",
        entityId: result.meta.last_row_id, metadata: { name: body.name }
      });
      return json({ success: true, id: result.meta.last_row_id });
    }

    if (path === "/api/v1/campaign/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, "campaigns", body.id);
      if (!existing) return failure("Campaign not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, "campaigns", "update", existing);
      if (!canUpdate) return failure("Campaign not found", 404);

      await env.DB.prepare(`
        UPDATE campaigns SET
          name = ?, utm_source = ?, utm_medium = ?, utm_campaign = ?, utm_term = ?, utm_content = ?,
          status = ?, start_date = ?, end_date = ?, notes = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        body.name ?? existing.name, body.utmSource ?? existing.utm_source, body.utmMedium ?? existing.utm_medium,
        body.utmCampaign ?? existing.utm_campaign, body.utmTerm ?? existing.utm_term, body.utmContent ?? existing.utm_content,
        body.status ?? existing.status, body.startDate ?? existing.start_date, body.endDate ?? existing.end_date,
        body.notes ?? existing.notes, user.user_id, body.id
      ).run();

      await logAudit(env.DB, {
        userId: user.user_id, action: "update", entityType: "campaign", entityId: body.id, metadata: {}
      });
      return json({ success: true });
    }

  return NOT_HANDLED;
}
