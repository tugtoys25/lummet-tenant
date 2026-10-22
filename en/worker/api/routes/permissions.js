// Role permissions.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as permDB from "../../database/permissions.js";
import { NOT_HANDLED, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user, userPermissions }) {

    // CURRENT USER PERMISSIONS
    // Returns only the authenticated user's effective permissions.
    // This is intentionally separate from /permissions/list,
    // which exposes the full permission matrix to authorized users.

    if (path === "/api/v1/user/permissions" && request.method === "GET") {
      return json({
        success: true,
        permissions: userPermissions || {}
      });
    }

    // ==================================
    // PERMISSIONS MANAGEMENT
    // ==================================

    if (path === "/api/v1/permissions/list") {
      const matrix = await permDB.getPermissionMatrix(env.DB);
      return json({ permissions: matrix });
    }

    if (path === "/api/v1/permissions/save" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["role", "resource", "action", "allowed"]);
      await permDB.setPermission(
        env.DB,
        body.role,
        body.resource,
        body.action,
        body.allowed
      );
      return success();
    }

    if (path === "/api/v1/permissions/bulk-save" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["role", "permissions"]);
      for (const perm of body.permissions) {
        await permDB.setPermission(
          env.DB,
          body.role,
          perm.resource,
          perm.action,
          perm.allowed
        );
      }
      return success();
    }

  return NOT_HANDLED;
}
