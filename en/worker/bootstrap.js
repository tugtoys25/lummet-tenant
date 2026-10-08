// Run this once via Wrangler: wrangler dev --test-scheduled
// Or add a temporary API endpoint to create your first admin

import { hashPassword } from "./auth.js";

export async function createAdminUser(env, email, password) {
  const passwordHash = await hashPassword(password);
  await env.DB.prepare(`
    INSERT OR REPLACE INTO users (email, password_hash, role)
    VALUES (?, ?, 'admin')
  `).bind(email, passwordHash).run();
  return true;
}
