// test/email-campaigns-subscriptions.test.js
//
// Exercises the admin email composer (recipient targeting + send +
// log), the subscriptions dashboard's DB layer, registration
// auto-subscribe, and the two off-by-default notification triggers
// (publish notifications, weekly digest) added in this feature.
//
// Resend calls are mocked at the fetch layer (same technique as
// test/report-delivery.test.js and test/auth-password-newsletter.test.js)
// so no real network call is made.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import { register } from '../worker/auth.js';
import * as newsletterDb from '../worker/database/newsletter.js';
import * as campaignDb from '../worker/database/email-campaigns.js';
import { resolveRecipients, sendCampaign, previewRecipientCount } from '../worker/email-campaigns.js';
import { notifyOnPublish, buildAndSendWeeklyDigest } from '../worker/content-notifications.js';
import { runWeeklyDigest } from '../worker/cron.js';

function mockFetch(responseFactory) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return responseFactory(url, options);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function makeRequest(body, { url = 'https://example.com/en/api/v1/admin/x' } = {}) {
  return { url, json: async () => body, headers: { get: () => null } };
}

async function insertUser(db, { email, role = 'viewer', createdAt = null }) {
  const result = await db.prepare(`
    INSERT INTO users (email, password_hash, role, created_at)
    VALUES (?, 'x', ?, COALESCE(?, CURRENT_TIMESTAMP))
  `).bind(email, role, createdAt).run();
  return result.meta.last_row_id;
}

describe('Email campaigns -- recipient resolution', () => {
  let db, env;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    env = { DB: db, RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'noreply@example.com' };
  });

  test('"all" resolves to every registered user, de-duplicated', async () => {
    await insertUser(db, { email: 'a@example.com' });
    await insertUser(db, { email: 'b@example.com' });
    const recipients = await resolveRecipients(env, { recipientType: 'all' });
    assert.equal(recipients.length, 2);
    assert.deepEqual(recipients.map(r => r.unsubscribeToken), [null, null]);
  });

  test('"selected" only includes the given user ids', async () => {
    const idA = await insertUser(db, { email: 'a@example.com' });
    await insertUser(db, { email: 'b@example.com' });
    const recipients = await resolveRecipients(env, { recipientType: 'selected', userIds: [idA] });
    assert.equal(recipients.length, 1);
    assert.equal(recipients[0].email, 'a@example.com');
  });

  test('"new" only includes users registered within the window', async () => {
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    await insertUser(db, { email: 'old@example.com', createdAt: old });
    await insertUser(db, { email: 'fresh@example.com' });
    const recipients = await resolveRecipients(env, { recipientType: 'new', sinceDays: 7 });
    assert.equal(recipients.length, 1);
    assert.equal(recipients[0].email, 'fresh@example.com');
  });

  test('"custom" parses, validates, and de-dupes a raw email list', async () => {
    const recipients = await resolveRecipients(env, {
      recipientType: 'custom',
      customEmails: 'a@example.com, not-an-email, A@example.com\nb@example.com'
    });
    assert.deepEqual(recipients.map(r => r.email).sort(), ['a@example.com', 'b@example.com']);
  });

  test('"subscribed" only includes confirmed subscribers, carrying their unsubscribe token', async () => {
    await newsletterDb.adminAddSubscriber(db, 'confirmed@example.com');
    const token = await db.prepare(`SELECT token FROM newsletter_subscribers WHERE email = ?`).bind('confirmed@example.com').first();

    const recipients = await resolveRecipients(env, { recipientType: 'subscribed' });
    assert.equal(recipients.length, 1);
    assert.equal(recipients[0].email, 'confirmed@example.com');
    assert.equal(recipients[0].unsubscribeToken, token.token);
  });

  test('an unknown recipient_type throws rather than silently sending to nobody', async () => {
    await assert.rejects(() => resolveRecipients(env, { recipientType: 'everyone-on-earth' }));
  });
});

describe('Email campaigns -- sending', () => {
  let db, env, mock;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    env = { DB: db, RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'noreply@example.com', SITE_URL: 'https://example.com', SITE_NAME: 'Example Site' };
  });

  afterEach(() => { if (mock) mock.restore(); });

  test('sends to every resolved recipient and logs a campaign row', async () => {
    mock = mockFetch(() => jsonResponse(200, { id: 'msg_1' }));
    await insertUser(db, { email: 'a@example.com' });
    await insertUser(db, { email: 'b@example.com' });

    const result = await sendCampaign(env, makeRequest(null), {
      subject: 'Hello',
      bodyHtml: '<p>Hi there</p>',
      recipientType: 'all',
      createdByUserId: null
    });

    assert.equal(result.recipientCount, 2);
    assert.equal(result.sentCount, 2);
    assert.equal(result.failedCount, 0);
    assert.equal(mock.calls.length, 2);

    const campaigns = await campaignDb.listCampaigns(db, {});
    assert.equal(campaigns.length, 1);
    assert.equal(campaigns[0].status, 'sent');
    assert.equal(campaigns[0].sent_count, 2);
  });

  test('a per-recipient failure does not abort the rest of the send', async () => {
    let call = 0;
    mock = mockFetch(() => {
      call++;
      return call === 1 ? jsonResponse(500, { message: 'boom' }) : jsonResponse(200, { id: 'msg_ok' });
    });
    await insertUser(db, { email: 'fails@example.com' });
    await insertUser(db, { email: 'ok@example.com' });

    const result = await sendCampaign(env, makeRequest(null), {
      subject: 'Hello',
      bodyHtml: '<p>Hi</p>',
      recipientType: 'all'
    });

    assert.equal(result.recipientCount, 2);
    assert.equal(result.sentCount, 1);
    assert.equal(result.failedCount, 1);
    assert.equal(result.status, 'sent'); // partial success still counts as sent overall
  });

  test('sending to zero recipients is logged as sent with zero counts, not an error', async () => {
    mock = mockFetch(() => jsonResponse(200, { id: 'x' }));
    const result = await sendCampaign(env, makeRequest(null), {
      subject: 'Hello',
      bodyHtml: '<p>Hi</p>',
      recipientType: 'selected',
      userIds: []
    });
    assert.equal(result.recipientCount, 0);
    assert.equal(result.status, 'sent');
    assert.equal(mock.calls.length, 0);
  });

  test('previewRecipientCount matches what sendCampaign would actually send to, without sending anything', async () => {
    mock = mockFetch(() => jsonResponse(200, { id: 'x' }));
    await insertUser(db, { email: 'a@example.com' });
    await insertUser(db, { email: 'b@example.com' });

    const count = await previewRecipientCount(env, { recipientType: 'all' });
    assert.equal(count, 2);
    assert.equal(mock.calls.length, 0, 'preview must never actually send email');
  });

  test('an unsubscribe link is embedded only for subscribed-type recipients', async () => {
    mock = mockFetch(() => jsonResponse(200, { id: 'x' }));
    await newsletterDb.adminAddSubscriber(db, 'sub@example.com');

    await sendCampaign(env, makeRequest(null), {
      subject: 'Hello',
      bodyHtml: '<p>Hi</p>',
      recipientType: 'subscribed'
    });

    const sentBody = JSON.parse(mock.calls[0].options.body);
    assert.match(sentBody.html, /newsletter\/unsubscribe\?token=/);
  });
});

describe('Registration auto-subscribes to the newsletter', () => {
  let db, env, mock;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    env = { DB: db };
    mock = mockFetch((url) => {
      if (String(url).includes('challenges.cloudflare.com')) return jsonResponse(200, { success: true });
      return jsonResponse(200, { id: 'x' });
    });
  });

  afterEach(() => { if (mock) mock.restore(); });

  test('a new account is auto-subscribed, already confirmed (no double opt-in)', async () => {
    const res = await register(makeRequest({
      email: 'newuser@example.com',
      password: 'SecurePass1!',
      'cf-turnstile-response': 'test'
    }), env);
    const data = await res.json();
    assert.equal(data.success, true);

    const sub = await newsletterDb.getSubscriberByEmail(db, 'newuser@example.com');
    assert.ok(sub, 'a subscriber row should exist for the new user');
    assert.equal(sub.status, 'confirmed');
    assert.equal(sub.source, 'registration');
    assert.ok(sub.user_id, 'subscriber row should be linked to the new user id');

    // Default preferences: auto-receive everything.
    assert.equal(sub.notify_news, 1);
    assert.equal(sub.notify_casinos, 1);
    assert.equal(sub.notify_reviews, 1);
    assert.equal(sub.notify_weekly_report, 1);
  });
});

describe('Content-publish notifications (off by default)', () => {
  let db, env, mock;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    env = { DB: db, RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'noreply@example.com', SITE_URL: 'https://example.com', SITE_NAME: 'Example Site' };
    mock = mockFetch(() => jsonResponse(200, { id: 'x' }));
  });

  afterEach(() => { if (mock) mock.restore(); });

  test('does nothing while email_notify_content_updates is unset (default off)', async () => {
    await newsletterDb.adminAddSubscriber(db, 'sub@example.com');
    const result = await notifyOnPublish(env, makeRequest(null), { type: 'casino', title: 'New Casino', slug: 'new-casino' });
    assert.equal(result.skipped, true);
    assert.equal(mock.calls.length, 0);
  });

  test('sends to subscribers once the flag is on, respecting the per-category preference', async () => {
    await db.prepare(`INSERT INTO settings (key, value) VALUES ('email_notify_content_updates', '1')`).run();

    await newsletterDb.adminAddSubscriber(db, 'wants-casinos@example.com');
    const optedOut = await newsletterDb.adminAddSubscriber(db, 'no-casinos@example.com');
    await db.prepare(`UPDATE newsletter_subscribers SET notify_casinos = 0 WHERE id = ?`).bind(optedOut).run();

    const result = await notifyOnPublish(env, makeRequest(null), { type: 'casino', title: 'New Casino', slug: 'new-casino' });
    assert.equal(result.skipped, false);
    assert.equal(result.sentCount, 1);
    assert.equal(mock.calls.length, 1);

    const sentBody = JSON.parse(mock.calls[0].options.body);
    assert.deepEqual(sentBody.to, ['wants-casinos@example.com']);
  });

  test('an unknown content type is a no-op, not a throw', async () => {
    const result = await notifyOnPublish(env, makeRequest(null), { type: 'not-a-type', title: 'x', slug: 'x' });
    assert.equal(result.skipped, true);
  });
});

describe('Weekly digest', () => {
  let db, env, mock;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    env = { DB: db, RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'noreply@example.com', SITE_URL: 'https://example.com', SITE_NAME: 'Example Site' };
    mock = mockFetch(() => jsonResponse(200, { id: 'x' }));
  });

  afterEach(() => { if (mock) mock.restore(); });

  test('buildAndSendWeeklyDigest is off by default', async () => {
    const result = await buildAndSendWeeklyDigest(env);
    assert.equal(result.skipped, true);
    assert.match(result.reason, /off/);
  });

  test('sends nothing (an honest skip) when there is no new content, even with the flag on', async () => {
    await db.prepare(`INSERT INTO settings (key, value) VALUES ('email_weekly_digest_enabled', '1')`).run();
    await newsletterDb.adminAddSubscriber(db, 'sub@example.com');
    const result = await buildAndSendWeeklyDigest(env);
    assert.equal(result.skipped, true);
    assert.match(result.reason, /nothing new/);
    assert.equal(mock.calls.length, 0);
  });

  test('sends a digest summarizing the week\'s new casino when there is something to report', async () => {
    await db.prepare(`INSERT INTO settings (key, value) VALUES ('email_weekly_digest_enabled', '1')`).run();
    await newsletterDb.adminAddSubscriber(db, 'sub@example.com');
    await db.prepare(`
      INSERT INTO casinos (slug, name, website_url, affiliate_url, published, created_at)
      VALUES ('new-casino', 'New Casino', 'https://x.com', 'https://x.com/aff', 1, CURRENT_TIMESTAMP)
    `).run();

    const result = await buildAndSendWeeklyDigest(env);
    assert.equal(result.skipped, false);
    assert.equal(result.sentCount, 1);
    const sentBody = JSON.parse(mock.calls[0].options.body);
    assert.match(sentBody.html, /New Casino/);
  });

  test('runWeeklyDigest (the cron wrapper) only actually attempts once per 7 days', async () => {
    await db.prepare(`INSERT INTO system_settings (key, value) VALUES ('weekly_digest_cron_enabled', 'true')`).run();
    await newsletterDb.adminAddSubscriber(db, 'sub@example.com');
    await db.prepare(`INSERT INTO settings (key, value) VALUES ('email_weekly_digest_enabled', '1')`).run();
    await db.prepare(`
      INSERT INTO casinos (slug, name, website_url, affiliate_url, published, created_at)
      VALUES ('c1', 'Casino One', 'https://x.com', 'https://x.com/aff', 1, CURRENT_TIMESTAMP)
    `).run();

    const first = await runWeeklyDigest(env);
    assert.equal(first.skipped, false);
    assert.equal(mock.calls.length, 1);

    // Immediately running again should be a no-op due to the 7-day cadence guard,
    // even though there's still "new" content and the flag is on.
    const second = await runWeeklyDigest(env);
    assert.equal(second.skipped, true);
    assert.match(second.reason, /due again/);
    assert.equal(mock.calls.length, 1, 'no second email should have been sent');
  });

  test('runWeeklyDigest records a cron-health row even when the flag is off', async () => {
    const result = await runWeeklyDigest(env);
    assert.equal(result.skipped, true);
    const row = await db.prepare(`SELECT value FROM system_settings WHERE key = 'weekly_digest_last_run_at'`).first();
    assert.ok(row, 'cron health should record the invocation regardless of the flag');
  });
});

describe('Subscriptions dashboard DB layer', () => {
  let db;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
  });

  test('adminAddSubscriber is idempotent and always lands confirmed', async () => {
    const id1 = await newsletterDb.adminAddSubscriber(db, 'x@example.com');
    const id2 = await newsletterDb.adminAddSubscriber(db, 'x@example.com');
    assert.equal(id1, id2);
    const row = await db.prepare(`SELECT * FROM newsletter_subscribers WHERE id = ?`).bind(id1).first();
    assert.equal(row.status, 'confirmed');
    assert.equal(row.source, 'admin');
  });

  test('countSubscribersByStatus reports accurate counts across all three statuses', async () => {
    await newsletterDb.adminAddSubscriber(db, 'confirmed@example.com');
    const pendingId = await db.prepare(`
      INSERT INTO newsletter_subscribers (email, token, status) VALUES ('pending@example.com', 'tok1', 'pending')
    `).run();
    const toUnsub = await newsletterDb.adminAddSubscriber(db, 'gone@example.com');
    await newsletterDb.unsubscribeSubscriber(db, toUnsub);

    const counts = await newsletterDb.countSubscribersByStatus(db);
    assert.equal(counts.confirmed, 1);
    assert.equal(counts.pending, 1);
    assert.equal(counts.unsubscribed, 1);
  });

  test('listSubscribers filters by status and search', async () => {
    await newsletterDb.adminAddSubscriber(db, 'alice@example.com');
    await newsletterDb.adminAddSubscriber(db, 'bob@example.com');

    const filtered = await newsletterDb.listSubscribers(db, { search: 'alice' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].email, 'alice@example.com');

    const byStatus = await newsletterDb.listSubscribers(db, { status: 'confirmed' });
    assert.equal(byStatus.length, 2);
  });
});
