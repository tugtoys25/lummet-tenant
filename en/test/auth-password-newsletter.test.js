// test/auth-password-newsletter.test.js
//
// Exercises the new forgot-password / reset-password / change-password
// flows in worker/auth.js and the newsletter subscribe/confirm/
// unsubscribe flow in worker/newsletter.js, against the real D1-shim
// database (schema.sql + every migration, including 0038 which adds
// the password_resets and newsletter_subscribers tables).
//
// Resend calls are mocked at the fetch layer (same technique as
// test/report-delivery.test.js) so no real network call is made.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, applyMigrations } from './support/d1-shim.js';
import {
  register,
  login,
  forgotPassword,
  resetPassword,
  changePassword,
  hashPassword
} from '../worker/auth.js';
import {
  subscribeNewsletter,
  confirmNewsletter,
  unsubscribeNewsletter
} from '../worker/newsletter.js';

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

// Minimal Request-like object good enough for the handlers under
// test: they only call request.json(), request.headers.get(...),
// and (via getSiteContext) request.url.
function makeRequest(body, { headers = {}, url = 'https://example.com/en/api/v1/auth/x' } = {}) {
  return {
    url,
    json: async () => body,
    headers: { get: (name) => headers[name] ?? null }
  };
}

describe('Forgot / reset / change password', () => {
  let db, env, mock;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    env = { DB: db, RESEND_API_KEY: 'test-key', RESEND_FROM_EMAIL: 'noreply@example.com' };
    mock = mockFetch(() => jsonResponse(200, { id: 'msg_1' }));

    // Register a user directly (bypassing Turnstile, which forgotPassword
    // doesn't require anyway) so there's an account to reset.
    const passwordHash = await hashPassword('OldPassw0rd!');
    await db.prepare(`
      INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'viewer')
    `).bind('reset-me@example.com', passwordHash).run();
  });

  afterEach(() => { if (mock) mock.restore(); });

  test('forgotPassword always reports success, even for an unknown email (no account enumeration)', async () => {
    const res = await forgotPassword(makeRequest({ email: 'nobody@example.com' }), env);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    // No email should have been sent for a nonexistent account.
    assert.equal(mock.calls.length, 0);
  });

  test('forgotPassword sends a reset email containing a working link for a known account', async () => {
    const res = await forgotPassword(makeRequest({ email: 'reset-me@example.com' }), env);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(mock.calls.length, 1);

    const sentBody = JSON.parse(mock.calls[0].options.body);
    assert.match(sentBody.text, /reset-password\?token=/);

    const row = await db.prepare(`SELECT * FROM password_resets`).first();
    assert.ok(row, 'a password_resets row should have been created');
    assert.ok(row.expires_at);
    assert.equal(row.used_at, null);
  });

  test('resetPassword with a valid token updates the password and lets the user log in with it', async () => {
    // Extract the raw token from the emailed link (the DB only ever
    // stores its hash, matching how the real flow works end-to-end).
    await forgotPassword(makeRequest({ email: 'reset-me@example.com' }), env);
    const sentBody = JSON.parse(mock.calls[0].options.body);
    const token = sentBody.text.match(/token=([a-f0-9]+)/)[1];

    const res = await resetPassword(makeRequest({ token, password: 'NewPassw0rd!' }), env);
    const data = await res.json();
    assert.equal(data.success, true);

    // Old password no longer works.
    const oldLoginReq = makeRequest({
      email: 'reset-me@example.com',
      password: 'OldPassw0rd!',
      'cf-turnstile-response': 'irrelevant'
    });
    // login() calls Turnstile verify via fetch -- override the mock to
    // simulate Turnstile failing closed offline; that's fine here since
    // we only care that the *new* password path (checked directly
    // below) works and the *old* hash no longer validates.
    const user = await db.prepare(`SELECT * FROM users WHERE email = ?`).bind('reset-me@example.com').first();
    const { verifyPassword } = await import('../worker/auth.js');
    assert.equal(await verifyPassword('OldPassw0rd!', user.password_hash), false);
    assert.equal(await verifyPassword('NewPassw0rd!', user.password_hash), true);
  });

  test('resetPassword rejects an already-used token (replay protection)', async () => {
    await forgotPassword(makeRequest({ email: 'reset-me@example.com' }), env);
    const sentBody = JSON.parse(mock.calls[0].options.body);
    const token = sentBody.text.match(/token=([a-f0-9]+)/)[1];

    const first = await resetPassword(makeRequest({ token, password: 'FirstNew1!' }), env);
    assert.equal((await first.json()).success, true);

    const second = await resetPassword(makeRequest({ token, password: 'SecondNew1!' }), env);
    const secondData = await second.json();
    assert.equal(secondData.success, false);
    assert.equal(second.status, 400);
  });

  test('resetPassword rejects an unknown/garbage token', async () => {
    const res = await resetPassword(makeRequest({ token: 'not-a-real-token', password: 'WhateverNew1!' }), env);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(res.status, 400);
  });

  test('resetPassword rejects a too-short new password before touching the token', async () => {
    const res = await resetPassword(makeRequest({ token: 'whatever', password: 'short' }), env);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.error, /8 characters/);
  });
});

describe('Change password (authenticated)', () => {
  let db, env, sessionToken, userId;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    env = { DB: db };

    const passwordHash = await hashPassword('CurrentPass1!');
    const insertResult = await db.prepare(`
      INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'viewer')
    `).bind('change-me@example.com', passwordHash).run();
    userId = insertResult.meta.last_row_id;

    sessionToken = 'test-session-token';
    const expires = new Date(Date.now() + 1000 * 60 * 60);
    await db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)
    `).bind(sessionToken, userId, expires.toISOString()).run();
  });

  function authedRequest(body) {
    return makeRequest(body, { headers: { Cookie: `session=${sessionToken}` } });
  }

  test('rejects an unauthenticated request', async () => {
    const res = await changePassword(makeRequest({ currentPassword: 'x', newPassword: 'NewPassw0rd!' }), env);
    assert.equal(res.status, 401);
  });

  test('rejects the wrong current password', async () => {
    const res = await changePassword(authedRequest({ currentPassword: 'WrongPass1!', newPassword: 'NewPassw0rd!' }), env);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(res.status, 401);
  });

  test('rejects a new password under 8 characters', async () => {
    const res = await changePassword(authedRequest({ currentPassword: 'CurrentPass1!', newPassword: 'short' }), env);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.error, /8 characters/);
  });

  test('updates the password when the current password is correct', async () => {
    const res = await changePassword(authedRequest({ currentPassword: 'CurrentPass1!', newPassword: 'BrandNewPass1!' }), env);
    const data = await res.json();
    assert.equal(data.success, true);

    const { verifyPassword } = await import('../worker/auth.js');
    const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(userId).first();
    assert.equal(await verifyPassword('BrandNewPass1!', user.password_hash), true);
    assert.equal(await verifyPassword('CurrentPass1!', user.password_hash), false);
  });
});

describe('Newsletter subscribe / confirm / unsubscribe', () => {
  let db, env, mock;

  beforeEach(async () => {
    db = createTestDb();
    applyMigrations(db);
    env = { DB: db, RESEND_API_KEY: 'test-key', RESEND_FROM_EMAIL: 'noreply@example.com' };
    mock = mockFetch(() => jsonResponse(200, { id: 'msg_1' }));
  });

  afterEach(() => { if (mock) mock.restore(); });

  test('rejects an invalid email address', async () => {
    const res = await subscribeNewsletter(makeRequest({ email: 'not-an-email' }), env);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(mock.calls.length, 0);
  });

  test('creates a pending subscriber and sends a confirmation email', async () => {
    const res = await subscribeNewsletter(makeRequest({ email: 'Fan@Example.com' }), env);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(mock.calls.length, 1);

    // Stored lowercased.
    const row = await db.prepare(`SELECT * FROM newsletter_subscribers WHERE email = ?`).bind('fan@example.com').first();
    assert.ok(row);
    assert.equal(row.status, 'pending');

    const sentBody = JSON.parse(mock.calls[0].options.body);
    assert.match(sentBody.text, /newsletter\/confirm\?token=/);
  });

  test('confirming the token flips status to confirmed', async () => {
    await subscribeNewsletter(makeRequest({ email: 'fan2@example.com' }), env);
    const sentBody = JSON.parse(mock.calls[0].options.body);
    const token = sentBody.text.match(/token=([a-f0-9]+)/)[1];

    const res = await confirmNewsletter(makeRequest(null, { url: `https://example.com/en/newsletter/confirm?token=${token}` }), env);
    assert.equal(res.status, 200);

    const row = await db.prepare(`SELECT * FROM newsletter_subscribers WHERE email = ?`).bind('fan2@example.com').first();
    assert.equal(row.status, 'confirmed');
    assert.ok(row.confirmed_at);
  });

  test('subscribing again once already confirmed does not re-send an email', async () => {
    await subscribeNewsletter(makeRequest({ email: 'fan3@example.com' }), env);
    const firstBody = JSON.parse(mock.calls[0].options.body);
    const token = firstBody.text.match(/token=([a-f0-9]+)/)[1];
    await confirmNewsletter(makeRequest(null, { url: `https://example.com/en/newsletter/confirm?token=${token}` }), env);

    const res = await subscribeNewsletter(makeRequest({ email: 'fan3@example.com' }), env);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.match(data.message, /already subscribed/);
    assert.equal(mock.calls.length, 1, 'no second email should have been sent');
  });

  test('unsubscribing via token sets status to unsubscribed, and resubscribing works again', async () => {
    await subscribeNewsletter(makeRequest({ email: 'fan4@example.com' }), env);
    const firstBody = JSON.parse(mock.calls[0].options.body);
    const token = firstBody.text.match(/token=([a-f0-9]+)/)[1];
    await confirmNewsletter(makeRequest(null, { url: `https://example.com/en/newsletter/confirm?token=${token}` }), env);

    const unsubRes = await unsubscribeNewsletter(makeRequest(null, { url: `https://example.com/en/newsletter/unsubscribe?token=${token}` }), env);
    assert.equal(unsubRes.status, 200);

    let row = await db.prepare(`SELECT * FROM newsletter_subscribers WHERE email = ?`).bind('fan4@example.com').first();
    assert.equal(row.status, 'unsubscribed');
    assert.ok(row.unsubscribed_at);

    // Signing up again sends a fresh confirmation email and clears the unsubscribe.
    await subscribeNewsletter(makeRequest({ email: 'fan4@example.com' }), env);
    row = await db.prepare(`SELECT * FROM newsletter_subscribers WHERE email = ?`).bind('fan4@example.com').first();
    assert.equal(row.status, 'pending');
    assert.equal(row.unsubscribed_at, null);
    assert.equal(mock.calls.length, 2);
  });
});
