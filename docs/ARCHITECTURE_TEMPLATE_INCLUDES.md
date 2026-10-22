# Architecture: template includes and the admin settings page

## Includes

A template can pull in another template with a marker on its own line:

```html
<!--@include pages/admin/settings/general.html-->
```

The path is relative to `en/templates/`. When `Renderer.loadTemplate` (`worker/render.js`) loads a template it replaces every marker with the exact text of that file (`expandIncludes`), before any `{variable}` is filled. Parts are loaded through the same per-request template cache, a part can include other parts (4 levels), and a missing part or a loop throws. Nothing is added or removed around the included text, so a page split into parts renders the same bytes as before.

Rule of thumb: a part file has no trailing newline, and the skeleton puts each marker on its own line, so the page keeps its original line breaks.

## The settings page

`templates/pages/admin/settings.html` (1,275 lines) is now a 54-line skeleton: the page wrapper, the contents bar and the form opening, then the includes, then the closing tags. The parts are in `templates/pages/admin/settings/`:

| File | Holds | Lines |
|---|---|---:|
| `settings/general.html` | General: site title, description and basics | 68 |
| `settings/analytics.html` | Analytics (GA) | 22 |
| `settings/gpwa.html` | GPWA verification | 66 |
| `settings/branding.html` | Branding: logo and social image | 28 |
| `settings/favicons.html` | Favicons and app icons | 87 |
| `settings/theme.html` | Platform theme: colours and typography | 223 |
| `settings/layout.html` | Layout options | 169 |
| `settings/theme-preview.html` | Live theme preview | 191 |
| `settings/hero.html` | Homepage hero and header (link to its own page) | 17 |
| `settings/homepage-content.html` | Homepage content sections | 45 |
| `settings/responsible-gambling.html` | Responsible gambling | 50 |
| `settings/footer.html` | Footer | 16 |
| `settings/compliance-logos.html` | Footer compliance logos | 21 |
| `settings/news-ads.html` | News inline advertisements | 59 |
| `settings/form-end.html` | Form alert, Save button, end of the form | 20 |
| `settings/ad-rules.html` | Advertisement automation rules and the rule modal | 87 |
| `settings/scripts.html` | The page script (contents bar highlighting) | 70 |

To change a setting section, edit its part. To add one: create the part, add its marker in `settings.html`, and add its heading id to the contents bar (`#settingsToc`).

Tests that read the page as text use `test/support/template-source.js`, which expands the includes the same way.

## Next in the restructuring

The other large templates and scripts over 1,000 lines (for example `static/js/section-builder.js`, `worker/ai/*`), picked by size.
