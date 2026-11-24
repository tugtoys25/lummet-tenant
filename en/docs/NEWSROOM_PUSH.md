# Newsroom web push

Switches (Newsroom > Flags, off by default): `news_web_push`, `news_push_auto`.

1. Newsroom > Push > Create push keys (needs the manage-settings permission). Add a contact address.
2. Turn on Web push notifications. Readers see "Get notifications for new stories" under articles.
3. Announce a live story from Newsroom > Push, or turn on automatic announcements (max 3 a day, stories that went live in the last 2 hours).

Design: the push message has no text. The service worker (/news-push-sw.js) fetches /en/api/v1/news/push/latest and shows that. Messages are VAPID (ES256) signed. Sending is in batches of 40 by the scheduled job. Expired browsers (404/410) are marked gone, never deleted. Regenerating the keys retires every subscription.

The VAPID private key is stored in system_settings (like the IndexNow key); it is never returned by any API.
Not covered: Safari on iOS only works for sites added to the Home Screen; notification images; segmenting by section.
