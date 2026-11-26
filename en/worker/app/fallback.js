// Why the maintenance page was shown, and the page itself with that reason attached.
// Quota and outage problems are temporary (clients are asked to retry soon); anything else is a code error that needs fixing.
// Only a short label and the first line of the message are ever exposed (the label in a header, the rest in the Worker log).
import { maintenanceResponse } from "./maintenance.js";

export function classifyFailure(err) {
  const msg = String((err && err.message) || err || "");
  if (/quota|exceeded|rate.?limit|too many requests|\b429\b|limit exceeded|capacity/i.test(msg)) return "storage_quota";
  if (/D1_ERROR|D1_|network|timed? ?out|timeout|unavailable|connection|\b50[234]\b|internal error/i.test(msg)) return "storage_unavailable";
  return "code_error";
}

export function fallbackResponse(request, err) {
  const reason = classifyFailure(err);
  let path = ""; try { path = new URL(request.url).pathname; } catch { /* keep empty */ }
  console.error("Maintenance fallback triggered:", JSON.stringify({
    reason, path, method: request.method,
    message: String((err && err.message) || err).slice(0, 300),
    stack: String((err && err.stack) || "").split("\n").slice(0, 4).join(" | ").slice(0, 400)
  }));
  const page = maintenanceResponse();
  const headers = new Headers(page.headers);
  headers.set("x-fallback-reason", reason);
  if (reason !== "code_error") headers.set("retry-after", "30");
  return new Response(page.body, { status: page.status, headers });
}
