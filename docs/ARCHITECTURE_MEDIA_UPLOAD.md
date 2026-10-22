# Media upload and serving (worker/media-upload.js, worker/media-upload/)

`media-upload.js` (572 lines) is now a facade over five parts. It re-exports the same 8 names, so the importers (`app/routes/services.js`, `api/routes/media.js`, `super/handlers/media.js`) are unchanged. Helpers that only the parts use (`jsonResponse`, `jsonError`, `extractDimensions`) are exported from their part and are not part of the public API.

| Part | Lines | Holds |
|---|---:|---|
| `media-upload/http.js` | 17 | The two small JSON response helpers (this module cannot import them from `api.js`: circular) |
| `media-upload/files.js` | 234 | Size limits (10 MB images, 100 MB video, 5 MB documents), allowed types and extensions, filename cleaning, `validateFile`, R2 key, public URL and thumbnail URLs, client-sent dimensions |
| `media-upload/upload.js` | 141 | `handleUpload`: validate, put in R2, store the row in `media_library` |
| `media-upload/delete.js` | 59 | `handleDelete`: editors may delete only their own uploads, an R2 failure does not block removing the row |
| `media-upload/serve.js` | 101 | `parseByteRange`, `serveMedia` (whole file or a byte range, for video on iPhone) |

Dependencies: `http`, `files` and `serve` import nothing from the folder; `delete` imports `http`; `upload` imports `http` and `files`. `test/media-upload-structure.test.js` checks this and that the limits and range parsing stay in one place each.
