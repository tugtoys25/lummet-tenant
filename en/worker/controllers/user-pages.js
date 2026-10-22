// Signed-in user pages (dashboard, submissions, inquiries, profile, notifications, bookmarks).
// Part of worker/controllers.js, which re-exports everything from here.
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import { getCurrentUser } from "../auth.js";

async function renderUserPage(request, env, template) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/en/login"
      }
    });
  }

  const renderer = new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const userNav = await renderer.loadTemplate("layout/user-nav.html");

  const html = await renderer.render(template, {
    seo_title: `${site.siteName} — Dashboard`,
    seo_description: `Manage your ${site.siteName} account`,
    email: renderer.escapeHtml(String(user.email || "")),
    role: renderer.escapeHtml(String(user.role || "")),
    user_nav: userNav
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html"
    }
  });
}

export async function renderUserDashboard(request, env) {
  return renderUserPage(request, env, "users/dashboard.html");
}

export async function renderUserSubmitCasino(request, env) {
  return renderUserPage(request, env, "users/submit-casino.html");
}

export async function renderUserInquiries(request, env) {
  return renderUserPage(request, env, "users/inquiries.html");
}

export async function renderUserProfile(request, env) {
  return renderUserPage(request, env, "users/profile.html");
}

export async function renderUserNotifications(request, env) {
  return renderUserPage(request, env, "users/notifications.html");
}

//export async function renderDashboardPermissions(request, env) {
//  return renderAdminPage(request, env, "admin/permissions.html");
//}
//export async function renderDashboardItemAccess(request, env) {
//  return renderAdminPage(request, env, "admin/item-access.html");
//}
export async function renderUserBookmarks(request, env) {
  return renderUserPage(request, env, "users/bookmarks.html");
}
