# Newsroom reader comments

Switches (Newsroom > Flags, both off by default):
- `news_comments`: comments list and form under each article.
- `news_comments_open_posting`: off = every comment waits for an editor; on = comments show at once (spam-looking ones still wait).

Moderation: Newsroom > Comments (needs the review permission). Approve, reject, mark spam, restore, close or reopen the discussion on one article. Nothing is deleted from the UI.

Protection: plain text only (escaped on display), 2000 characters, hidden honeypot field, 5 comments per connection per hour, repeat text ignored, more than two links treated as spam. No third-party scripts, no cookies. IP addresses are stored only as a short one-way hash. Emails are optional and never shown.

Not built: email alerts to moderators, reader accounts, comment voting.
