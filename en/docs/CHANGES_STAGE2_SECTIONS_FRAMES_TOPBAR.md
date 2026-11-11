# Stage 2: section layouts, page frames, section backgrounds and dividers, contact top bar

Defaults add no CSS and render nothing new, so a site nobody changed looks exactly as before.

## Per-section layout (Homepage builder > Section Layout)
`section.layout`: default, cols-2, cols-3, cols-4, list, steps, stats (big number), quotes (testimonial strip), cta (call-to-action band).
Reuses the existing item fields (title, description, icon). CSS is in css-src/main/14-section-layouts.css. An unknown value renders no class.

## Theme settings (Design > Layout)
- `theme_page_frame`: default, thin, bold, double, accent, inset. A fixed border drawn round the window; takes no space, ignores clicks, sits under pop-ups.
- `theme_section_backgrounds`: default, tints, alternate-dark, gradient, dots, primary-bands. A section with its own colour or image keeps it.
- `theme_section_divider`: default, slant, curve, accent-line.
All three are template keys, so templates set them. 10 new templates use them (52 in total).

## Contact top bar (Header and hero > Contact top bar)
`site_topbar_enabled`, `site_topbar_text`, `site_topbar_phone`, `site_topbar_email`, `site_topbar_tone` (dark, light, brand).
Rendered in the same slot as the announcement bar (`hh_announce_html`). tel: keeps digits and + only; an invalid email is shown as text.

## Not changed
No migration, no database change, no existing key renamed or removed.
