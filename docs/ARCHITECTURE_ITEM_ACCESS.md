# Item-level access (worker/database/item-access.js, worker/database/item-access/)

`item-access.js` (469 lines) is now a facade over five parts. It re-exports the same 20 names (including the two aliases `getUserItemAccess` and `getItemAccessCondition`), so every importer (controllers, API routes, reports, analytics, super handlers) is unchanged. The registry constants (`VALID_SCOPES`, `VALID_ACTIONS`, `FALLBACK_DEFAULT_SCOPE`) are exported from `item-access/registry.js` for the parts only; they are not part of the public API.

| Part | Lines | Holds |
|---|---:|---|
| `item-access/registry.js` | 85 | The resource registry (table, id, slug and owner column per resource), the valid scopes and actions, the fallback default scope |
| `item-access/policy.js` | 104 | The system default scope and the per-user scope rows (`getItemScope`, `setUserItemAccess`, ...) |
| `item-access/assignments.js` | 65 | Explicit item assignments for the `assigned` scope |
| `item-access/access.js` | 185 | The decisions: `canAccessItem`, `getAccessibleWhereClause`, `getAccessibleIdCondition`. The admin bypass lives here only |
| `item-access/items.js` | 31 | Fetch an item by slug or id so it can be checked |

Dependencies: `registry` and `assignments` import nothing; `policy` and `items` import `registry`; `access` imports the other three. `test/item-access-structure.test.js` checks the layout, the aliases and that the scope constants and the admin bypass each stay in one place.
