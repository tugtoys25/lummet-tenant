// =====================================================
// item-access.js — Item-Level Access Control Engine
// =====================================================
// Independent authorization layer that sits ON TOP of
// the existing role/resource permission system.
//
//   AUTHENTICATION
//       ↓
//   EXISTING permissions.js (resource-level gate)
//       ↓
//   THIS MODULE (item-level scope)
//       ↓
//   ALLOW / DENY
//
// Scopes: 'none' | 'own' | 'all' | 'assigned'
//
// DEFAULT SCOPE when no user_item_access row exists:
//   Read from system_settings table ('item_access_default_scope')
//   Falls back to 'all' during transition, change to 'none' for production
// =====================================================

// The code lives in item-access/*.js (see docs/ARCHITECTURE_ITEM_ACCESS.md); this file keeps the public import path.
export { getResourceConfig, getRegisteredResources } from "./item-access/registry.js";
export { getSystemDefaultScope, setSystemDefaultScope, getItemScope, getUserItemAccess, setUserItemAccess, deleteUserItemAccess, getAllUserItemAccess } from "./item-access/policy.js";
export { assignItem, unassignItem, isItemAssigned, getAccessibleItemIds, getItemAssignees } from "./item-access/assignments.js";
export { canAccessItem, getAccessibleWhereClause, getItemAccessCondition, getAccessibleIdCondition } from "./item-access/access.js";
export { getItemBySlug, getItemById } from "./item-access/items.js";
