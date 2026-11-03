#!/usr/bin/env bash
# Time to first byte and cache headers for a page, three visits in a row.
# Usage: bash scripts/speed-check.sh https://your-domain/en [more urls...]
set -u
[ $# -ge 1 ] || { echo "usage: $0 URL [URL...]"; exit 1; }
H="$(mktemp 2>/dev/null || echo "${TMPDIR:-$HOME}/speed-check.h")"
for url in "$@"; do
  echo "== $url"
  for i in 1 2 3; do
    curl -s -o /dev/null -D "$H" -H 'accept-encoding: br,gzip' \
      -w "visit $i: first byte %{time_starttransfer}s  total %{time_total}s  size %{size_download}B  http %{http_code}\n" "$url"
    grep -i -E '^(x-page-cache|x-page-source|x-page-store|server-timing|cf-cache-status|content-encoding):' "$H" | sed 's/^/    /'
  done
done
rm -f "$H"
