// Tracking links.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as trackingLinksDB from "../../database/tracking-links.js";
import { checkAndRecordLink } from "../../tracking/health-check.js";
import { resolveRedirectTarget } from "../../tracking/redirect.js";
import { logAudit } from "../../database/audit.js";
import * as itemAccess from "../../database/item-access.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // TRACKING LINKS
    // ==================================

    if (path === "/api/v1/tracking-links/list") {
      const url = new URL(request.url);
      const casinoId = url.searchParams.get("casino_id") ? Number(url.searchParams.get("casino_id")) : null;
      const status = url.searchParams.get("status");
      const healthStatus = url.searchParams.get("health_status");
      const search = url.searchParams.get("search");

      const links = await trackingLinksDB.getAllTrackingLinksAdmin(env.DB, { casinoId, status, healthStatus, search });
      return json({ success: true, tracking_links: links });
    }

    if (path === "/api/v1/tracking-link/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const link = await trackingLinksDB.getTrackingLinkById(env.DB, id);
      if (!link) return failure("Tracking link not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'read', link);
      if (!canAccess) return failure("Tracking link not found", 404);

      link.geo_destinations = await trackingLinksDB.getGeoDestinations(env.DB, id);
      return json({ success: true, tracking_link: link });
    }

    if (path === "/api/v1/tracking-link/geo-destinations" && request.method === "GET") {
      const url = new URL(request.url);
      const linkId = Number(url.searchParams.get("tracking_link_id"));
      if (!linkId) return failure("tracking_link_id is required");

      const destinations = await trackingLinksDB.getGeoDestinations(env.DB, linkId);
      return json({ success: true, geo_destinations: destinations });
    }

    if (path === "/api/v1/tracking-link/health-history") {
      const url = new URL(request.url);
      const linkId = Number(url.searchParams.get("tracking_link_id"));
      if (!linkId) return failure("tracking_link_id is required");

      const result = await env.DB.prepare(`
        SELECT * FROM tracking_link_health_checks WHERE tracking_link_id = ? ORDER BY checked_at DESC LIMIT 50
      `).bind(linkId).all();
      return json({ success: true, history: result.results || [] });
    }

    // Admin testing tool: preview exactly what /en/go/:identifier would
    // do for a given country, using the REAL resolution service --
    // not a separate mock of the redirect logic.
    if (path === "/api/v1/tracking-link/resolve-preview") {
      const url = new URL(request.url);
      const identifier = url.searchParams.get("identifier");
      const countryCode = url.searchParams.get("country_code");
      if (!identifier || !countryCode) return failure("identifier and country_code are required");

      const result = await resolveRedirectTarget(env.DB, { identifier, countryCode: countryCode.toUpperCase() });
      return json({ success: true, ...result });
    }

    if (path === "/api/v1/tracking-link/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["internal_name", "destination_url"]);

      body.created_by = user.user_id;
      const ownDomains = [new URL(request.url).hostname];
      try {
        const created = await trackingLinksDB.createTrackingLink(env.DB, body, { ownDomains });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'create', entityType: 'tracking_link', entityId: created.id,
          metadata: { tracking_code: created.tracking_code, casino_id: body.casino_id ?? null, destination_url: body.destination_url }
        });
        return success(created);
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/tracking-link/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'tracking_links', body.id);
      if (!existing) return failure("Tracking link not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'update', existing);
      if (!canUpdate) return failure("Tracking link not found", 404);

      body.updated_by = user.user_id;
      const ownDomains = [new URL(request.url).hostname];
      try {
        await trackingLinksDB.updateTrackingLink(env.DB, body.id, body, { ownDomains });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'update', entityType: 'tracking_link', entityId: body.id,
          metadata: { internal_name: body.internal_name || existing.internal_name }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/tracking-link/status/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "status"]);

      const existing = await itemAccess.getItemById(env.DB, 'tracking_links', body.id);
      if (!existing) return failure("Tracking link not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'update', existing);
      if (!canUpdate) return failure("Tracking link not found", 404);

      try {
        await trackingLinksDB.setLinkStatus(env.DB, body.id, body.status, user.user_id);
        await logAudit(env.DB, {
          userId: user.user_id, action: 'status_change', entityType: 'tracking_link', entityId: body.id,
          metadata: { from: existing.status, to: body.status }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    if (path === "/api/v1/tracking-link/geo-destinations/assign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["tracking_link_id"]);

      const existing = await itemAccess.getItemById(env.DB, 'tracking_links', body.tracking_link_id);
      if (!existing) return failure("Tracking link not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'update', existing);
      if (!canUpdate) return failure("Tracking link not found", 404);

      const ownDomains = [new URL(request.url).hostname];
      try {
        await trackingLinksDB.setGeoDestinations(env.DB, body.tracking_link_id, body.destinations || [], { ownDomains });
        await logAudit(env.DB, {
          userId: user.user_id, action: 'update', entityType: 'tracking_link', entityId: body.tracking_link_id,
          metadata: { geo_destinations_count: (body.destinations || []).length }
        });
        return success();
      } catch (error) {
        return failure(error.message, 422);
      }
    }

    // Manual, admin-triggered health check -- the ONLY place a health
    // check is allowed to run synchronously within a request, since
    // it's an explicit one-off admin action, not a visitor redirect.
    if (path === "/api/v1/tracking-link/health-check/run" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const link = await trackingLinksDB.getTrackingLinkById(env.DB, body.id);
      if (!link) return failure("Tracking link not found", 404);
      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'tracking_links', 'read', link);
      if (!canAccess) return failure("Tracking link not found", 404);

      const result = await checkAndRecordLink(env.DB, link);
      await logAudit(env.DB, {
        userId: user.user_id, action: 'health_check', entityType: 'tracking_link', entityId: body.id,
        metadata: { health_status: result.healthStatus, http_status: result.httpStatus }
      });
      return json({ success: true, result });
    }

  return NOT_HANDLED;
}
