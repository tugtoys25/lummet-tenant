# Components: the visual editor

Dashboard > Components. Every component type is filled in with plain fields, pickers and a preview. Nobody has to type JSON or HTML. What is saved is the same Content / Settings values as before, so existing components keep working and keep their values.

## Types

| Type | Visual form | Saved as |
|---|---|---|
| Text Block | Word-processor style editor (bold, italic, lists, headings, links). "Edit as HTML" for developers. Text that uses other HTML is opened as HTML and left untouched. | Content (HTML) |
| CTA, Banner | Text, button text, button link (page picker) | Content + Settings `button_text`, `link` |
| FAQ Group | Question and answer rows, reorder, remove | Content (JSON list) |
| Author | Pick an existing author or fill name, role, bio, photo | Content (JSON) |
| Casino Grid, Comparison Table, News Feed | Number to show | Settings `limit` |
| Hero Section | Unchanged (v12 panel) | Settings |
| Custom HTML | Unchanged (code box, by design) | Content |
| **Content Grid** (new) | Pick casinos, news, research, authors, updates, sportsbooks, affiliate partners, custom content or pictures by searching; or show the newest automatically. Columns, card style, picture shape, what each card shows, "see all" link. Live preview. | Settings |
| **Table** (new) | Your own table (add rows and columns, link any cell) or a casino comparison from picked or top-rated casinos with chosen columns. Live preview. | Settings |
| **Custom Section** (new) | Background (colour, soft, dark, brand, picture), spacing, width, 1 to 3 columns and blocks: heading, text, picture, button, list, video (YouTube/Vimeo pop-up), feature cards, numbers, space, line. Live preview. | Settings |

The raw Content and Settings boxes are hidden behind "Show the raw Content and Settings boxes (for developers)". They stay in step with the form. Settings keys the form does not know about are kept.

## Pickers

- Item picker: tabs per kind, search by name, reorder with arrows. Only published items are offered and only published items are shown on the page; an item that is unpublished or deleted later simply drops out.
- Page picker (buttons, links): pages, reviews, casinos, news, research, authors, updates, sportsbooks, affiliate partners, custom content, or type an address.
- Picture picker: the Media library.

## Safety

Every value is checked on save (`worker/component-studio.js`) and again when the page is built: links must be safe (`/`, `https://`, `mailto:`), pictures must be from Media or https, colours are validated, text blocks keep only simple tags, videos only YouTube/Vimeo through fixed templates. Nothing the admin types reaches a page as code. A component that cannot be built renders nothing; it never breaks the page.

## For developers

- `worker/component-sources.js`: data sources for pickers and public rendering.
- `worker/component-studio.js`: cleaners and renderers of the three new types, plus gentle cleaning of `link` and `limit` for the older types.
- API: `POST /api/v1/component/preview`, `GET /api/v1/component/pick-search`, `POST /api/v1/component/pick-resolve`.
- Client: `static/js/component-studio.js`; styles `static/css/component-blocks.css` (public) and the `.cs-*` rules at the end of `header-hero.css` (admin).
