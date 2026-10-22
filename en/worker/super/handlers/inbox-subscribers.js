import * as userDashDB from "../../database/user_dashboard.js";
import * as newsletterDB from "../../database/newsletter.js";
import { created, fail, ok, readJsonBody } from "./helpers.js";

// =====================================================
// USER INQUIRIES / CASINO SUBMISSIONS / NOTIFICATIONS
//
// None of these three has ANY permission gating on the tenant's own
// dashboard today -- worker/api.js's /api/v1/admin/inquiries and
// /api/v1/admin/submissions are session-admin-only with no
// checkPermission() call at all (verified: grepping api.js for
// "inquiries"/"submissions" turns up no resourceMap entry). So this
// Super API layer, and the control plane page built on it, are
// actually introducing MORE granular delegation than the tenant
// itself currently has, not less -- worth knowing if that's a gap
// you want closed on the tenant side too, not just bridged here.
//
// Notifications: createNotification() targets ONE specific user_id --
// there is no "getAllNotifications" (no admin-wide feed exists in
// user_dashboard.js), so the only meaningful admin action exposed
// here is composing and sending one, not browsing a list.
// =====================================================

export async function handleListInquiries(request, env) {
  const rows = await userDashDB.getAllInquiries(env.DB);
  return ok({ data: rows });
}

export async function handleReplyInquiry(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.reply) return fail("reply is required");
  await userDashDB.replyToInquiry(env.DB, Number(id), body.reply);
  return ok();
}

export async function handleListSubmissions(request, env) {
  const rows = await userDashDB.getAllSubmissions(env.DB);
  return ok({ data: rows });
}

export async function handleUpdateSubmissionStatus(request, env, id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.status) return fail("status is required");
  await userDashDB.updateSubmissionStatus(env.DB, Number(id), body.status, body.admin_notes || null);
  return ok();
}

export async function handleSendNotification(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.user_id || !body.title || !body.message) {
    return fail("user_id, title and message are required");
  }
  await userDashDB.createNotification(env.DB, Number(body.user_id), body.title, body.message, body.link || null);
  return created();
}

// =====================================================
// NEWSLETTER SUBSCRIBERS
// Same "no tenant-side RBAC exists yet" situation as above. List and
// add are exposed; deliberately NOT exposing anything that sends an
// actual campaign email (see worker/email-campaigns.js's
// sendCampaign) -- that's a real-world irreversible side effect
// (real emails, to real subscribers) and belongs in its own,
// separately-reviewed pass, not folded into a subscriber-list CRUD
// page.
// =====================================================

export async function handleListSubscribers(request, env) {
  const url = new URL(request.url);
  const rows = await newsletterDB.listSubscribers(env.DB, {
    status: url.searchParams.get("status") || null,
    search: url.searchParams.get("search") || null,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
    offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
  });
  const counts = await newsletterDB.countSubscribersByStatus(env.DB);
  return ok({ data: rows, counts });
}

export async function handleAddSubscriber(request, env, _id, bodyText) {
  const body = await readJsonBody(request, bodyText);
  if (!body.email) return fail("email is required");
  try {
    const result = await newsletterDB.adminAddSubscriber(env.DB, body.email);
    return created({ data: result });
  } catch (error) {
    return fail(error.message || "invalid_input", 422);
  }
}

export async function handleUnsubscribeSubscriber(request, env, id) {
  await newsletterDB.unsubscribeSubscriber(env.DB, Number(id));
  return ok();
}
