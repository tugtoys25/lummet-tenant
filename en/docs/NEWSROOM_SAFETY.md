# Newsroom safety: backups and uptime / error alerts

Two switches in Newsroom > Flags, both **off** by default. Managed in Newsroom > Safety (needs the manage-settings permission).

## Content backups (`news_backups`)
- Once a day (the scheduled run at 02:00 UTC) and on demand ("Back up now") the content is saved as a gzip JSON file in private storage (`backups/content/…`), last 14 kept.
- Included: articles, authors, sections, redirects, access levels, corrections, series, topics, entities, bylines, sources, related, pins, timeline, regions, media records.
- Never included: users and passwords, sessions, members, subscribers, push subscriptions, comments, settings and secrets.
- Download from the same tab. The files are not reachable from the public `/media/` address.
- **Restoring is not automated.** The file is a plain export for recovery by support or a script.
- Media files themselves (images, audio) are not copied; they stay in storage and are referenced by the media records.

## Uptime and error alerts (`news_monitoring`)
- Each scheduled run checks the database and renders the home page, and logs the result. You are emailed when the site goes **down**, when it **recovers**, and when server errors in an hour reach your threshold (at most one such email per 6 hours).
- Alerts go to the address saved in Newsroom > Safety, otherwise to the first three admin emails. Needs email sending to be set up.
- Server errors (HTTP 5xx and the maintenance fallback) are logged, at most 20 per minute, and kept 14 days.
- `/en/api/v1/health` returns `{"ok":true}` (503 when the database fails; 404 while the switch is off). Point a free outside monitor at it, because a site that is completely down cannot send alerts about itself.

## Limits
- Checks only run as often as the site's scheduled job runs, which is set outside this repository.
- Backup size is capped at 50,000 rows per table (truncation is reported).
- Not tested against real R2 or real email delivery; automated tests use in-memory stand-ins.
