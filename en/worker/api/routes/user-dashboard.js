// Signed-in user: bookmarks, inquiries, notifications, submissions, profile.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import * as userDash from "../../database/user_dashboard.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path, user }) {

    // ==================================
    // USER DASHBOARD — BOOKMARKS
    // ==================================

    if (path === "/api/v1/user/bookmarks" && request.method === "GET") {
      const bookmarks = await userDash.getBookmarks(env.DB, user.user_id);
      return json({ bookmarks });
    }

    if (path === "/api/v1/user/bookmark/add" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["casino_slug"]);
      await userDash.addBookmark(env.DB, user.user_id, body.casino_slug);
      return success();
    }

    if (path === "/api/v1/user/bookmark/remove" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["casino_slug"]);
      await userDash.removeBookmark(env.DB, user.user_id, body.casino_slug);
      return success();
    }

    // ==================================
    // USER DASHBOARD — INQUIRIES
    // ==================================

    if (path === "/api/v1/user/inquiries" && request.method === "GET") {
      const inquiries = await userDash.getInquiries(env.DB, user.user_id);
      return json({ inquiries });
    }

    if (path === "/api/v1/user/inquiry/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["subject", "message"]);
      const id = await userDash.createInquiry(env.DB, user.user_id, body.subject, body.message);
      return json({ success: true, id });
    }

    // ==================================
    // USER DASHBOARD — NOTIFICATIONS
    // ==================================

    if (path === "/api/v1/user/notifications" && request.method === "GET") {
      const notifications = await userDash.getNotifications(env.DB, user.user_id);
      return json({ notifications });
    }

    if (path === "/api/v1/user/notification/read" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await userDash.markNotificationRead(env.DB, body.id, user.user_id);
      return success();
    }

    if (path === "/api/v1/user/notifications/read-all" && request.method === "POST") {
      await userDash.markAllNotificationsRead(env.DB, user.user_id);
      return success();
    }

    // ==================================
    // USER DASHBOARD — CASINO SUBMISSIONS
    // ==================================

    if (path === "/api/v1/user/submissions" && request.method === "GET") {
      const submissions = await userDash.getSubmissions(env.DB, user.user_id);
      return json({ submissions });
    }

    if (path === "/api/v1/user/submit-casino" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "website_url"]);
      const id = await userDash.createSubmission(env.DB, user.user_id, body);
      return json({ success: true, id });
    }

    // ==================================
    // USER DASHBOARD — PROFILE
    // ==================================

    if (path === "/api/v1/user/profile" && request.method === "GET") {
      return json({
        user: {
          id: user.user_id,
          email: user.email,
          role: user.role
        }
      });
    }

    if (path === "/api/v1/user/profile/update" && request.method === "POST") {
      const body = await request.json();
      const email = String(body?.email ?? "").trim();
      if (!email || email.length > 254 || !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email)) {
        return failure("Enter a valid email address");
      }
      try {
        await userDash.updateUserProfile(env.DB, user.user_id, { email });
      } catch (err) {
        if (/UNIQUE|constraint/i.test(String(err?.message || err))) {
          return failure("That email address is already in use", 409);
        }
        throw err;
      }
      return success();
    }

  return NOT_HANDLED;
}
