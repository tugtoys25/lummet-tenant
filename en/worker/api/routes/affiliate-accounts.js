// Affiliate accounts.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as affiliatePrograms from "../../database/affiliate-programs.js";
import * as affiliateAccounts from "../../database/affiliate-accounts.js";
import { logAudit } from "../../database/audit.js";
import * as itemAccess from "../../database/item-access.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // AFFILIATE ACCOUNTS
    // ==================================

    if (path === "/api/v1/affiliate-accounts/list") {
      const url = new URL(request.url);
      const programId = url.searchParams.get("program_id") ? Number(url.searchParams.get("program_id")) : null;
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      const accountList = await affiliateAccounts.getAllAccountsAdmin(env.DB, { programId, status, search });
      return json({ success: true, accounts: accountList });
    }

    if (path === "/api/v1/affiliate-account/get") {
      const url = new URL(request.url);
      const id = Number(url.searchParams.get("id"));
      if (!id) return failure("id is required");

      const account = await affiliateAccounts.getAccountById(env.DB, id);
      if (!account) return failure("Account not found", 404);

      const canAccess = await itemAccess.canAccessItem(env.DB, user, 'affiliate_accounts', 'read', account);
      if (!canAccess) return failure("Account not found", 404);

      return json({ success: true, account });
    }

    if (path === "/api/v1/affiliate-account/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["program_id", "account_name"]);

      const program = await affiliatePrograms.getProgramById(env.DB, body.program_id);
      if (!program) return failure("Affiliate program not found", 404);

      body.created_by = user.user_id;
      const id = await affiliateAccounts.createAccount(env.DB, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'create', entityType: 'affiliate_account', entityId: id, metadata: { account_name: body.account_name, program_id: body.program_id } });
      return success({ id });
    }

    if (path === "/api/v1/affiliate-account/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "account_name"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_accounts', body.id);
      if (!existing) return failure("Account not found", 404);
      const canUpdate = await itemAccess.canAccessItem(env.DB, user, 'affiliate_accounts', 'update', existing);
      if (!canUpdate) return failure("Account not found", 404);

      body.updated_by = user.user_id;
      await affiliateAccounts.updateAccount(env.DB, body.id, body);
      await logAudit(env.DB, { userId: user.user_id, action: 'update', entityType: 'affiliate_account', entityId: body.id, metadata: { account_name: body.account_name, status: body.status, previous_status: existing.status } });
      return success();
    }

    if (path === "/api/v1/affiliate-account/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);

      const existing = await itemAccess.getItemById(env.DB, 'affiliate_accounts', body.id);
      if (!existing) return failure("Account not found", 404);
      const canDelete = await itemAccess.canAccessItem(env.DB, user, 'affiliate_accounts', 'delete', existing);
      if (!canDelete) return failure("Account not found", 404);

      const dependents = await affiliateAccounts.getAccountDependents(env.DB, body.id);
      if (dependents) {
        return failure(
          `Cannot delete: this account has ${dependents.commercial_terms} commercial term(s) attached. ` +
          `Archive it instead, or remove the terms first.`,
          409
        );
      }

      await affiliateAccounts.deleteAccount(env.DB, body.id);
      await logAudit(env.DB, { userId: user.user_id, action: 'delete', entityType: 'affiliate_account', entityId: body.id, metadata: { account_name: existing.account_name } });
      return success();
    }

  return NOT_HANDLED;
}
