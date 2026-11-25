# News commerce layer (migration 0032)

One news system, four kinds of article: **editorial** (default, unchanged), **review** (affiliate widgets + disclosure), **listing** (for sale: gallery, specs, inquiry form) and **blog**.

## Switches (Newsroom > Flags, all off)
| Key | Does |
|---|---|
| `news_commerce` | Master. Off = no query, no markup, page byte-identical |
| `news_commerce_widgets` | Buy / product / price / cta / inquiry widgets |
| `news_commerce_sticky_bar` | Mobile sticky Buy now / Enquire bar (reuses `.mobile-sticky-cta`) |
| `news_commerce_gallery` | Photo gallery from the media library (existing `nr-gallery` lightbox) |
| `news_commerce_inquiry` | Inquiry form widgets, stored in `news_inquiries` |

A second gate is per article: `news_commerce.mode` (default `editorial` = nothing changes).

## Where it lives
- `worker/newsroom-commerce.js` loader, renderer, inquiry submit, admin data. `article.js` calls it inside try/catch.
- Widgets after the first / last paragraph: the article text is sanitised when the template is filled, so placeholder paragraphs mark the spots and `fill()` swaps them for widget HTML after rendering. Below-text columns, gallery and sticky bar go in `audience_after_html`.
- Buy buttons use `/en/go/<tracking code>?n=<article>&w=<widget>`; the redirect records `analytics_events.news_id` (only for a real article) and `metadata.news_widget_id`. Broken or inactive tracking links hide the widget.
- Admin: Newsroom > Commerce (mode, widgets, gallery, inquiry inbox). API: `/api/v1/newsroom/commerce/*`. Public: `POST /api/v1/news/inquiry`.
- Tables (new only): `news_commerce`, `news_widgets`, `news_gallery_items`, `news_inquiries`.

## Rollback
Switch `news_commerce` off. Data stays.
