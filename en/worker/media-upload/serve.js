// ── R2 media serving ──────────────────────────────────

/**
 * Parses "bytes=a-b", "bytes=a-" or "bytes=-n" against a file of `size` bytes.
 * Returns { start, end } (inclusive), "unsatisfiable", or null when the header is not a single byte range.
 */
export function parseByteRange(header, size) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
    if (!m || (m[1] === '' && m[2] === '')) return null;
    let start;
    let end;
    if (m[1] === '') {
        const suffix = Number(m[2]);
        if (suffix === 0) return 'unsatisfiable';
        start = Math.max(0, size - suffix);
        end = size - 1;
    } else {
        start = Number(m[1]);
        end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || start > end) return 'unsatisfiable';
    return { start, end };
}

async function serveMediaRange(env, r2Key, rangeHeader) {
    const head = await env.MEDIA_BUCKET.head(r2Key);
    if (!head) return new Response('Media not found', { status: 404 });
    const parsed = parseByteRange(rangeHeader, head.size);
    if (parsed === null) return null; // not a form we handle: serve the whole file
    const headers = new Headers();
    headers.set('Content-Type', head.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('ETag', head.httpEtag);
    headers.set('Accept-Ranges', 'bytes');
    if (parsed === 'unsatisfiable') {
        headers.set('Content-Range', `bytes */${head.size}`);
        return new Response(null, { status: 416, headers });
    }
    const length = parsed.end - parsed.start + 1;
    const part = await env.MEDIA_BUCKET.get(r2Key, { range: { offset: parsed.start, length } });
    if (!part) return new Response('Media not found', { status: 404 });
    headers.set('Content-Range', `bytes ${parsed.start}-${parsed.end}/${head.size}`);
    headers.set('Content-Length', String(length));
    return new Response(part.body, { status: 206, headers });
}

/**
 * Serves a media file directly from R2.
 * This handles GET /media/{folder}/{filename} requests.
 * Sets appropriate content-type and caching headers.
 *
 * @param {Request} request - The incoming request.
 * @param {Object} env - The Worker environment.
 * @param {string} r2Key - The R2 object key (media/{folder}/{file}).
 * @returns {Response} The file response with appropriate headers.
 */
export async function serveMedia(request, env, r2Key) {
    try {
        if (!env.MEDIA_BUCKET) {
            return new Response('Media storage not configured', { status: 503 });
        }

        // Byte-range requests (needed by Safari and iPhone to play video, and for seeking).
        // Requests without a Range header take the original path below, unchanged.
        const rangeHeader = request.headers.get('Range');
        if (rangeHeader) {
            const ranged = await serveMediaRange(env, r2Key, rangeHeader);
            if (ranged) return ranged;
        }

        // Get object from R2
        const object = await env.MEDIA_BUCKET.get(r2Key);

        if (!object) {
            return new Response('Media not found', { status: 404 });
        }

        // Get content type from R2 metadata
        const contentType = object.httpMetadata?.contentType || 'application/octet-stream';

        // Build response headers
        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        headers.set('ETag', object.httpEtag);
        headers.set('Accept-Ranges', 'bytes');

        // Handle conditional requests (304 Not Modified)
        const ifNoneMatch = request.headers.get('If-None-Match');
        if (ifNoneMatch && ifNoneMatch === object.httpEtag) {
            return new Response(null, { status: 304, headers });
        }

        // Return the file body
        return new Response(object.body, { headers });

    } catch (error) {
        console.error('Serve media error:', error);
        return new Response('Error serving media', { status: 500 });
    }
}
