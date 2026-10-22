// Item-level access and assignments.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import { handleGetUserItemAccess, handleSetUserItemAccess, handleDeleteUserItemAccess, handleAssignItem, handleUnassignItem, handleGetUserAssignments, handleGetItemAssignees, handleGetResources, handleGetDefaultScope, handleSetDefaultScope } from "../../database/item-access-api.js";
import { NOT_HANDLED } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // ITEM-LEVEL ACCESS MANAGEMENT (admin only)
    // ==================================

    if (path === "/api/v1/admin/item-access/user" && request.method === "GET") {
      return handleGetUserItemAccess(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/set" && request.method === "POST") {
      return handleSetUserItemAccess(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/delete" && request.method === "POST") {
      return handleDeleteUserItemAccess(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/assign" && request.method === "POST") {
      return handleAssignItem(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/unassign" && request.method === "POST") {
      return handleUnassignItem(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/assignments" && request.method === "GET") {
      return handleGetUserAssignments(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/assignees" && request.method === "GET") {
      return handleGetItemAssignees(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/resources" && request.method === "GET") {
      return handleGetResources(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/default-scope" && request.method === "GET") {
      return handleGetDefaultScope(request, env, user);
    }
    if (path === "/api/v1/admin/item-access/default-scope" && request.method === "POST") {
      return handleSetDefaultScope(request, env, user);
    }

  return NOT_HANDLED;
}
