# Latest news cards: image that cannot break

The cards preferred `media_library.thumbnail_url`, an absolute Cloudflare Image Resizing link
(`https://<host>/cdn-cgi/image/width=400,format=webp/media/...`) built from the host of the upload
request. If that host is not the public site, or Image Resizing is off / over quota for the zone, the
link fails and the card showed a broken image, while the newsroom pages (which use the original
`/media/...` URL) kept working.

- New `worker/news-image.js`: turns media URLs into same-site paths, tries the thumbnail first, falls
  back to the original, and hides the image if both fail (no broken-image icon).
- Used by the default homepage cards (`controllers/home.js`) and the Advanced Homepage news cards.
- Tests: `test/news-image.test.js`.
