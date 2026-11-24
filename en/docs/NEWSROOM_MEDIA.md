# Newsroom media: video, podcast, galleries

Three independent switches in Newsroom > Flags, all **off** by default. Turning one off restores the previous behaviour exactly.

| Switch | What it does |
|---|---|
| `news_video_embeds` | A paragraph containing only a YouTube link becomes a click-to-play player. Nothing is requested from YouTube until the reader presses play, then `youtube-nocookie.com` is used. Adds `VideoObject` structured data. Links inside sentences are left alone. |
| `news_podcast` | Serves `/en/podcast.xml` (404 while off). Episodes are published articles whose tags include the podcast tag (default `podcast`, exact match) and that contain an `<audio>`/`<source>` with an https address. File size and duration come from the media library when the file is there. Members-only articles are never listed. |
| `news_galleries` | `<div class="nr-gallery">` around images becomes a grid with a keyboard-friendly viewer (Esc, arrows, focus returns). |

Podcast settings (title, description, author, owner email, cover image, tag, explicit) are saved in Newsroom > Media.

## Limits
- YouTube only. Vimeo and others need a Content-Security-Policy change and are not included.
- Enclosure `length` is 0 when the file is not in the media library; most directories accept this, a few warn.
- Click-to-play and lightbox scripts are covered by code review, not by an automated browser test.
