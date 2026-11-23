# Newsroom pro tools

All additive. Nothing changes on a site until an editor or owner uses it, or switches it on in Newsroom > Flags.

## Switches (Newsroom > Flags, both ship OFF)
* `news_revision_history` records a revision for every edit, even with the editorial workflow off. With the workflow on, revisions were already recorded and nothing changes.
* `news_indexnow` sends the address of each newly published or corrected article to IndexNow search engines (Bing, Yandex and others). Google does not use IndexNow. The ownership key is made on first use, kept in `system_settings.indexnow_key` and served at `/<key>.txt`. Nothing is sent from localhost or private hosts. A background job also sends stories that went live on a schedule in the last three days (set `SITE_URL` so the job knows the site address). Every send is logged in `news_index_pings`.

## Article tab
* **Extra credits (bylines)**: reporter, editor, photographer, illustrator, translator, contributor, co-author. Shown under the main author. Co-authors and reporters are listed as authors in the NewsArticle data; editors as `editor`; photographers, illustrators and translators as `contributor`. The main author is not changed.
* **Compare and restore**: pick a version, see what would change (text differences for the body), restore. The address and published state are never touched. A restore is itself a revision, so it can be undone. If the article was edited outside the recorded history the screen warns that the version may not be exact.
* **Search engines**: shows recent sends for the article and a "Send now" button.

## Calendar tab
A week of published and scheduled stories (UTC), with drafts and ideas that have no date listed below.

## Homepage tab
Each section block on the News homepage can have its own pinned stories (slot `section:<id>`), with start and end times. Rows can be dragged or moved up and down. No pins means the automatic choice, as before.

## Structured data
Every article now also states `isAccessibleForFree`, image objects with width and height when known, `thumbnailUrl`, and the extra credits. The real section name in `articleSection` needs the sections switch (`news_new_taxonomy`), as before. Image crops in other ratios (16:9, 4:3, 1:1) are not generated: that needs an image resizing service.

## Scheduled stories
They go live on time because every public list, page and sitemap checks `published_at <= now`. Public pages are cached for about a minute.
