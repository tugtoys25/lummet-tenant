# Header & Hero manager

Admin page: **Dashboard → Site Structure → Header & Hero** (`/en/dashboard/header-hero`).
Roles: admin and editor. Nothing goes live until **Save changes**.

## What you can control

- **Announcement bar**: on/off, text, link, tone (info, promo, success, warning), dismissible.
- **Header**: style (standard, solid, glass, transparent), background colour, text colour, font, height, sticky,
  logo mode and size, menu alignment, search box and placeholder, login/dashboard/logout labels, optional call-to-action button.
- **Homepage hero**: on/off, background image and focus, colour or gradient, overlay, text theme,
  alignment, height, badge, title, subtitle, description, highlights, two buttons, custom text colour,
  separate title colour, title font and body font.

A live preview (desktop / phone) uses the real site stylesheets. Quick styles load a starting look.
Links must be a site path (`/en/...`) or `https://`; anything else is refused on screen and again on the server.

## Colours and fonts

- Colour fields take a picker or a typed value: `#rgb`, `#rrggbb`, `rgb()` or `hsl()`. Reset returns to the default.
- Header text colour covers the brand name, menu links, search box and Login/Dashboard/Logout buttons.
  The admin page warns (without blocking) when it is hard to read on the header colour.
- Hero text colour overrides the Light/Dark text choice; the title colour overrides it for the main title only.
- Fonts are system font stacks: Site default, System, Modern sans, Rounded, Serif, Elegant serif, Bold display,
  Monospace. Nothing is downloaded. The stacks live in `FONT_STACKS` in `en/worker/header-hero.js`, and a test
  keeps the admin script in step with it. Only keys from that list are accepted, never typed font names.
- Anything left on Default adds no CSS, so the site looks exactly as before.

## Hero pictures and video

Two optional cards under the hero settings. Both are off until you switch them on, and the hero is unchanged while they are off.

**Pictures and video behind the text** (up to 6 slides)
- Each slide is a picture or a short video. Pick files from the Media library or paste an address.
- One slide stays still (fixed). Two or more move on their own (fade or slide), or by arrows, dots, keyboard and swipe.
- Picture motion: Still, Slow zoom or Slow pan. Seconds per picture: 3 to 20. A video plays to the end, then the show moves on.
- A slide can have a link; then the empty part of the hero is clickable (text and buttons keep working).
- The slideshow pauses when the pointer is over it (optional), when the tab is hidden, when the hero is off screen, and on
  the visitor's pause button. It stays still for visitors who ask for reduced motion, and videos stay on their poster picture
  for visitors on data saver.

**Pictures inside the hero** (up to 4)
- Fixed or clickable images with an optional caption, shown under the text or beside it (wide screens), in three sizes.

**YouTube and Vimeo**
- A slide can be type "YouTube / Vimeo". Paste a normal video link; only the provider and video id are kept, and the
  player address is built from a fixed template (`youtube-nocookie.com`, `player.vimeo.com` with Do Not Track).
- *Opens in a pop-up*: the slide shows your poster picture and a "Watch video" pill. Nothing from YouTube or Vimeo loads
  until a visitor clicks. The pop-up closes with the X, the Escape key or a click outside, and returns focus to the button.
- *Plays silently behind the text*: loads after the page has finished, moves on after "seconds per picture", and is removed
  again when the slide changes, the tab is hidden, the hero scrolls out of view, or the visitor pauses.
  It does not load for reduced-motion or data-saver visitors, and on phones it stays on the poster unless you switch
  "Play online background videos on phones" on.
- The hero can also have a separate **Watch video** button (a pop-up player, same rules).
- Privacy: a pop-up loads YouTube or Vimeo only after a click. A background video loads them on every visit to the page, which
  may need visitor consent where the law requires it. The site has no cookie-consent banner today, so prefer the pop-up
  unless you have decided otherwise. Channel, playlist and profile links are refused.

Tips
- Videos: MP4 (H.264) is the safest; keep each under about 5 MB, 10 to 15 seconds, no sound needed (they play muted).
  Always add a poster picture. Use pictures about 1920 px wide and under 300 KB.
- Videos must be a file (.mp4, .webm, .ogg, .m4v). A YouTube or Vimeo page address is not accepted.
- Settings: `site_hero_media_*`, `site_hero_slides` and `site_hero_cards*` in the `settings` table. Slides and pictures are stored as JSON text.

## Hero components (Dashboard > Components)

A component of type **Hero Section** can do everything the homepage hero can: picture slider, short video, YouTube / Vimeo
(pop-up or silent background), pictures inside the hero, a Watch video button, colours, fonts, alignment, height and
background. Put it on any page like other components (Assign Component to Page), as many as you like.

- In Components, choose type **Hero Section**. A **Hero options** panel appears with the same sections as Header & Hero and a
  live preview (desktop or phone). The **Title** is the headline and the **Content** is the subtitle (plain text).
- The options are saved in the component's **Settings (JSON)** box; the panel fills it in. Each key is the homepage setting name
  without `site_hero_` (for example `media_enabled`, `slides`, `cards`, `text_color`, `button_url`). Keys the panel does not
  know are kept. `button_new_tab` is new.
- **Existing hero components do not change.** One that only has the original settings (`link`, `button_text`, `bg_image`,
  `new_tab`) keeps the original simple layout. Switch **Use the advanced hero** on to move it to the new layout; its link,
  button text, picture and new-tab values carry over. Switching it off restores the simple hero (the extra options are removed
  from the box).
- Differences from the homepage hero: no default label or button (empty until you fill them), the first picture is loaded
  lazily unless the component is placed at the **top** injection point, and several heroes on one page move independently
  (a slideshow below the fold waits until it is on screen).
- Safety is shared with the homepage hero: links, colours, fonts and videos are checked on save and again when the page is
  built; the page source never contains an iframe. Settings that are not valid JSON are refused when saving a hero.
- Implementation: `en/worker/component-hero.js` (settings, model, save cleaning), `heroHtml` in `en/worker/header-hero.js`
  (shared builder), `en/static/js/component-hero-admin.js` (panel), `POST /en/api/v1/component/hero-preview` (preview).

## How it works

- Values are stored in the existing `settings` table (keys `site_announce_*`, `site_header_*`, `site_hero_*`,
  plus the shared `theme_header_style` and `theme_header_background`). No migration.
- `en/worker/header-hero.js` holds one declarative field table used for validation, defaults and rendering.
- Markup that is optional is built in JS and inserted with `{{{...}}}` because the template engine cannot nest `{{#if}}`.
- Defaults reproduce the previous header and hero exactly.
- Header element ids used by `search.js` and `app.js` are unchanged.

## Adding a field

Add it to `FIELDS` in `en/worker/header-hero.js`, render it in `headerClasses`/`heroHtml`/`announceHtml`,
add a control to `docs`-generated admin page, and a test in `en/test/header-hero.test.js`.
