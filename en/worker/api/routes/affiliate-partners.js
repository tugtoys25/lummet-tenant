// Affiliate partners and contacts.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as affiliatePartners from "../../database/affiliate-partners.js";
import * as trackingLinksDB from "../../database/tracking-links.js";
import { logAudit } from "../../database/audit.js";
import * as itemAccess from "../../database/item-access.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // AFFILIATE PARTNERS
    // ==================================

    if (path === "/api/v1/affiliate-partners/list") {
      const { condition, params } = await itemAccess.getAccessibleWhereClause(
        env.DB, user, 'affiliate_partners', 'read', ''
      );
      const url = new URL(request.url);
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      const clauses = [];
      const bindParams = [...params];
      if (condition) clauses.push(condition);
      if (status) { clauses.push("status = ?"); bindParams.push(status); }
      if (search) { clauses.push("(name LIKE ? OR slug LIKE ?)"); bindParams.push(`%${search}%`, `%${search}%`); }

      const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : '';
      const result = await env.DB.prepare(
        `SELECT * FROM affiliate_partners ${whereClause} ORDER BY name ASC`
      ).bind(...bindParams).all();

      return json({ success: true, partners: result.results || [] });
    }

    if (path === "/api/v1/affiliate-partner/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const partner = await affiliatePartners.getPartnerById(env.DB, id);
      if (!partner) return failure("Partner not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'affiliate_partners', 'read', partner);
      if (!canAccess) return failure("Partner not found", 404);

      partner.contacts = await affiliatePartners.getPartnerContacts(env.DB, id);
      return json({ success: true, partner });
    }

    if (path === "/api/v1/affiliate-partner/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name"]);

      body.slug = body.slug
        ? body.slug
        : await affiliatePartners.generateUniquePartnerSlug(env.DB, body.name);

      // SECURITY: ownership set server-side, never trust body.created_by
      body.created_by = user.user_id;
      const id = await affiliatePartners.createPartner(env.DB, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'affiliate_partner', entityId: id, metadata: { name: body.name, status: body.status || 'active' } });
      return success({ id });
    }

    if (path === "/api/v1/affiliate-partner/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "name"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_partners', body.id);
      if (!existing) return failure("Partner not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_partners', 'update', existing);
      if (!canUpdate) return failure("Partner not found", 404);

      body.slug = body.slug || existing.slug;
      body.updated_by = user.user_id;
      await affiliatePartners.updatePartner(env.DB, body.id, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'affiliate_partner', entityId: body.id, metadata: { name: body.name, status: body.status, previous_status: existing.status } });
      return success();
    }

    if (path === "/api/v1/affiliate-partner/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_partners', body.id);
      if (!existing) return failure("Partner not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'affiliate_partners', 'delete', existing);
      if (!canDelete) return failure("Partner not found", 404);

      const dependents = await affiliatePartners.getPartnerDependents(env.DB, body.id);
      if (dependents) {
        return failure(
          `Cannot delete: this partner has ${dependents.programs} affiliate program(s) attached. ` +
          `Archive the partner instead, or remove the programs first.`,
          409
        );
      }
      const trackingDependents = await trackingLinksDB.getPartnerTrackingLinkDependents(env.DB, body.id);
      if (trackingDependents) {
        return failure(
          `Cannot delete: this partner has ${trackingDependents.tracking_links} tracking link(s) directly attached. ` +
          `Archive the partner instead, or remove those tracking links first.`,
          409
        );
      }

      await affiliatePartners.deletePartner(env.DB, body.id);
      await logAudit(env.DB, { userId: user.user_id, action: 'delete', entityType: 'affiliate_partner', entityId: body.id, metadata: { name: existing.name } });
      return success();
    }

    if (path === "/api/v1/affiliate-partner/contact/add" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["partner_id", "name"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_partners', body.partner_id);
      if (!existing) return failure("Partner not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_partners', 'update', existing);
      if (!canUpdate) return failure("Partner not found", 404);

      const contactId = await affiliatePartners.addPartnerContact(env.DB, body.partner_id, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'affiliate_partner_contact', entityId: contactId, metadata: { partner_id: body.partner_id, name: body.name } });
      return success({ id: contactId });
    }

    if (path === "/api/v1/affiliate-partner/contact/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await affiliatePartners.deletePartnerContact(env.DB, body.id);
      await logAudit(env.DB, { userId: user.user_id, action: 'delete', entityType: 'affiliate_partner_contact', entityId: body.id });
      return success();
    }

  return NOT_HANDLED;
}
