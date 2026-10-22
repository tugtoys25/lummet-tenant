// Admin: users, notifications, subscribers, email campaigns, submissions, inquiries.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as newsletterDB from "../../database/newsletter.js";
import * as emailCampaigns from "../../email-campaigns.js";
import * as campaignDB from "../../database/email-campaigns.js";
import * as userDash from "../../database/user_dashboard.js";
import * as adminTools from "../../database/admin_tools.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // ADMIN — USER MANAGEMENT
    // ==================================

    if (path === "/api/v1/admin/users" && request.method === "GET") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const users = await adminTools.getAllUsers(env.DB);
      return json({ users });
    }

    if (path === "/api/v1/admin/user/update-role" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["id", "role"]);
      if (!["admin", "editor", "viewer"].includes(body.role)) {
        return failure("Invalid role. Must be admin, editor, or viewer");
      }
      await adminTools.updateUserRole(env.DB, body.id, body.role);
      return success();
    }

    if (path === "/api/v1/admin/user/delete" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["id"]);
      // Prevent self-deletion
      if (body.id === user.user_id) {
        return failure("Cannot delete your own account");
      }
      try {
        await adminTools.deleteUser(env.DB, body.id);
        return success();
      } catch (e) {
        return failure(e.message);
      }
    }

    // ==================================
    // ADMIN — SEND NOTIFICATIONS
    // ==================================

    if (path === "/api/v1/admin/notification/send" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["title", "target"]);

      let count = 0;
      if (body.target === "all") {
        validate(body, ["title", "message"]);
        count = await adminTools.sendNotificationToAll(env.DB, body.title, body.message, body.link || null);
      } else if (body.target === "role") {
        validate(body, ["title", "message", "role"]);
        count = await adminTools.sendNotificationToRole(env.DB, body.role, body.title, body.message, body.link || null);
      } else if (body.target === "user") {
        validate(body, ["title", "message", "user_id"]);
        await adminTools.sendNotificationToUser(env.DB, body.user_id, body.title, body.message, body.link || null);
        count = 1;
      } else {
        return failure("Invalid target. Use 'all', 'role', or 'user'");
      }
      return json({ success: true, sent: count });
    }

    // ==================================
    // ADMIN — SUBSCRIPTIONS (newsletter_subscribers)
    // ==================================

    if (path === "/api/v1/admin/subscribers" && request.method === "GET") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const url = new URL(request.url);
      const status = url.searchParams.get("status") || null;
      const search = url.searchParams.get("search") || null;
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;

      const [subscribers, counts] = await Promise.all([
        newsletterDB.listSubscribers(env.DB, { status, search, limit, offset }),
        newsletterDB.countSubscribersByStatus(env.DB)
      ]);
      return json({ subscribers, counts });
    }

    if (path === "/api/v1/admin/subscribers/add" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["email"]);
      const email = String(body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return failure("A valid email address is required");
      }
      await newsletterDB.adminAddSubscriber(env.DB, email);
      return success();
    }

    if (path === "/api/v1/admin/subscribers/unsubscribe" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["id"]);
      await newsletterDB.unsubscribeSubscriber(env.DB, body.id);
      return success();
    }

    // ==================================
    // ADMIN — EMAIL CAMPAIGNS (composer)
    // ==================================

    if (path === "/api/v1/admin/email-campaigns" && request.method === "GET") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const url = new URL(request.url);
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "30", 10) || 30, 100);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10) || 0;
      const campaigns = await campaignDB.listCampaigns(env.DB, { limit, offset });
      return json({ campaigns });
    }

    if (path === "/api/v1/admin/email-campaigns/preview" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["recipientType"]);
      try {
        const count = await emailCampaigns.previewRecipientCount(env, {
          recipientType: body.recipientType,
          userIds: body.userIds || [],
          customEmails: body.customEmails || [],
          sinceDays: body.sinceDays || 7
        });
        return json({ success: true, count });
      } catch (e) {
        return failure(e.message);
      }
    }

    if (path === "/api/v1/admin/email-campaigns/send" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["subject", "bodyHtml", "recipientType"]);
      try {
        const result = await emailCampaigns.sendCampaign(env, request, {
          subject: body.subject,
          layout: body.layout || "branded",
          bodyHtml: body.bodyHtml,
          bodyText: body.bodyText || null,
          recipientType: body.recipientType,
          userIds: body.userIds || [],
          customEmails: body.customEmails || [],
          sinceDays: body.sinceDays || 7,
          createdByUserId: user.user_id
        });
        return json({ success: true, ...result });
      } catch (e) {
        return failure(e.message);
      }
    }

    // ==================================
    // ADMIN — SUBMISSION MANAGEMENT
    // ==================================

    if (path === "/api/v1/admin/submissions" && request.method === "GET") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const submissions = await userDash.getAllSubmissions(env.DB);
      return json({ submissions });
    }

    if (path === "/api/v1/admin/submission/update" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["id", "status"]);
      if (!["pending", "approved", "rejected"].includes(body.status)) {
        return failure("Invalid status. Use pending, approved, or rejected");
      }
      await userDash.updateSubmissionStatus(env.DB, body.id, body.status, body.admin_notes || null);

      // Notify the user about the status change
      const submission = await env.DB.prepare(
        "SELECT user_id, name FROM casino_submissions WHERE id = ?"
      ).bind(body.id).first();

      if (submission) {
        const statusMsg = body.status === "approved"
          ? `Your submission "${submission.name}" has been approved!`
          : `Your submission "${submission.name}" has been rejected.`;
        await adminTools.sendNotificationToUser(
          env.DB,
          submission.user_id,
          "Submission Update",
          body.admin_notes ? `${statusMsg} Note: ${body.admin_notes}` : statusMsg,
          "/en/user/submit-casino"
        );
      }
      return success();
    }

    // ==================================
    // ADMIN — INQUIRY MANAGEMENT
    // ==================================

    if (path === "/api/v1/admin/inquiries" && request.method === "GET") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const inquiries = await userDash.getAllInquiries(env.DB);
      return json({ inquiries });
    }

    if (path === "/api/v1/admin/inquiry/reply" && request.method === "POST") {
      if (user.role !== "admin") return json({ success: false, error: "Forbidden" }, 403);
      const body = await request.json();
      validate(body, ["id", "reply"]);
      await userDash.replyToInquiry(env.DB, body.id, body.reply);

      // Notify user
      const inquiry = await env.DB.prepare(
        "SELECT user_id, subject FROM user_inquiries WHERE id = ?"
      ).bind(body.id).first();

      if (inquiry) {
        await adminTools.sendNotificationToUser(
          env.DB,
          inquiry.user_id,
          "Inquiry Answered",
          `Your inquiry "${inquiry.subject}" has been answered.`,
          "/en/user/inquiries"
        );
      }
      return success();
    }

  return NOT_HANDLED;
}
