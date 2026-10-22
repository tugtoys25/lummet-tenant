-- Sign everyone out and cancel pending password-reset links (formerly migration 0066).
--
-- Run once on every database after a credential exposure (a database dump was
-- committed to git history before it was removed). Everyone signs in again,
-- and admins should also change their passwords. Safe to run more than once.
DELETE FROM sessions;
DELETE FROM password_resets;
