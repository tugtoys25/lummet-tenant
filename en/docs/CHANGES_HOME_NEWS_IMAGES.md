# Homepage latest news: featured image

The server drew each card as `<a class="news-card"><img>...` with no wrapper, but the homepage CSS
(`#homeNews .news-card__image`, `__body`, `padding: 0`) is written for the wrapped markup that
`app.js` produces. `app.js` returns early because the server already filled `#homeNews`, so the
wrapped markup was never used and the image was left unstyled.

- `worker/controllers/home.js`: cards now use the wrapped markup; title, excerpt, image URL and alt
  are escaped; the media alt text is used when there is one.
- `css-src/main/15-news-card-bare-image.css`: a bare `<img>` directly inside `.news-card`
  (Advanced Homepage) is sized to a 16:9 cover image.
- Generated `static/css/main.css` and `worker/asset-version.js` rebuilt.
- Test: `test/home-news-card-image.test.js`.

If a card still has no image after deploying, the article's `featured_image` does not point at a
`media_library.id` (see the SQL check in the PR notes); re-select the image in the editor.
