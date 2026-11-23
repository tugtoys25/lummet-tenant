# Newsroom audience and trust tools

All additive. Every newsroom switch ships OFF (Newsroom > Flags); the cookie banner is a site setting that ships Off.

## Switches
* `news_rss_feeds`: RSS 2.0 feeds at `/en/news/feed.xml` (alias `/en/feed.xml`), `/en/news/<section>/feed.xml` (needs the sections switch, like the section page), `/en/news/(topic|entity|series)/<slug>/feed.xml` and `/en/author/<slug>/feed.xml`. Latest 30 live articles, five-minute cache, ETag. Adds the feed link to the news page head.
* `news_rss_full_text`: whole article in each item (`content:encoded`) instead of the summary.
* `news_share_bar`: share, copy link, email, WhatsApp, X, Facebook and LinkedIn under each article. Plain links and a few lines of inline script; no third-party code, no tracking.
* `news_lazy_images`: `loading="lazy" decoding="async"` on images inside article text that do not already set `loading`. The featured image is untouched.
* `news_trust_footer_links`: links the published policy pages (editorial policies, about, corrections, ethics ...) from every page's footer. Only pages that are published appear.
* `news_copyright_reports`: public form at `/en/copyright-report` (the address can be pre-filled with `?url=`), an article link, and the Newsroom > Copyright reports queue.

## Copyright reports
The form asks for the page, the original work, the problem, name, email, the two standard confirmations and a typed signature. The page must be on this site. A hidden field catches bots; five reports per hour per connection (IP stored only as a hash). Editors with the retract permission see reports newest-first, move them new, reviewing, actioned, rejected or withdrawn, add decision notes, and can take the article offline with one confirmed click. Taking it offline sets it to unpublished; nothing is deleted and it can be published again. Reports are kept after they are closed. No email is sent to the editors yet; check the tab.

## Cookie consent (Settings > Analytics)
`cookie_banner_mode` On shows a banner (Accept all, Reject non-essential, policy link). The choice is stored in the `lm_consent` cookie for 180 days. Google Analytics then starts in Consent Mode v2 with everything denied until the visitor accepts, and a "Cookie settings" link in the footer reopens the choice. The banner only controls Google Analytics. Other scripts (for example a pasted verification script) are not blocked. Off: no banner and the analytics snippet is exactly what it was.
