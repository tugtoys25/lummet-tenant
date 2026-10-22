// ── URL fidelity guard ──
// The model is instructed (prompt.js) to only ever use URLs that appear
// in the context this function builds, but instruction-following alone
// isn't reliable (see the "hallucinated /en/casino-payment-methods,
// /en/mobile-casinos, /en/casino-licensing/*" incident). These two
// functions are the actual backstop: assistant.js runs every generated
// answer through them and replaces anything that isn't a verbatim URL
// from the context with the homepage link.
const URL_TOKEN_RE = /https?:\/\/[^\s)\]}"'<>]+/g;

export function extractContextUrls(contextStr) {
  const set = new Set();
  for (const m of (contextStr.match(URL_TOKEN_RE) || [])) {
    set.add(m.replace(/[.,;:!?]+$/, ''));
  }
  return set;
}

export function sanitizeAnswerUrls(text, allowedUrls, homepageUrl) {
  if (!text) return text;
  return text.replace(URL_TOKEN_RE, (match) => {
    const trailingPunct = match.match(/[.,;:!?]+$/)?.[0] || '';
    const clean = trailingPunct ? match.slice(0, -trailingPunct.length) : match;
    return allowedUrls.has(clean) ? match : (homepageUrl + trailingPunct);
  });
}

/**
 * Streaming-safe version: URLs arrive split across many small deltas,
 * so we can't validate a URL until we've seen the whole thing. Holds
 * back only the trailing not-yet-terminated "http(s)://..." fragment
 * (if any) on each push — everything else flushes immediately, so
 * normal prose still streams with no added latency. Call flush() once
 * the upstream stream ends to emit whatever's left.
 */
function tailPartialSchemeStart(str) {
  // Returns the index where a not-yet-complete "http://" or "https://"
  // prefix begins at the tail of str (e.g. str ends in "...see htt"),
  // or -1 if the tail isn't the start of either scheme. Needed because
  // a scheme arrives character-by-character in streaming mode, and
  // pending.lastIndexOf('https://') only finds it once fully typed --
  // without this, the partial prefix gets flushed unsanitized before
  // the URL it belongs to is even recognizable as a URL.
  const max = Math.min(str.length, 8); // "https://".length
  for (let len = max; len >= 1; len--) {
    const suffix = str.slice(str.length - len);
    if ('https://'.startsWith(suffix) || 'http://'.startsWith(suffix)) return str.length - len;
  }
  return -1;
}

export function createStreamingUrlSanitizer(allowedUrls, homepageUrl) {
  let pending = '';
  return {
    push(delta) {
      pending += delta;
      const lastHttp = Math.max(pending.lastIndexOf('http://'), pending.lastIndexOf('https://'));
      let safeUpTo;
      if (lastHttp !== -1) {
        safeUpTo = /\s/.test(pending.slice(lastHttp)) ? pending.length : lastHttp;
      } else {
        const partialStart = tailPartialSchemeStart(pending);
        safeUpTo = partialStart === -1 ? pending.length : partialStart;
      }
      const toFlush = pending.slice(0, safeUpTo);
      pending = pending.slice(safeUpTo);
      return sanitizeAnswerUrls(toFlush, allowedUrls, homepageUrl);
    },
    flush() {
      const out = sanitizeAnswerUrls(pending, allowedUrls, homepageUrl);
      pending = '';
      return out;
    }
  };
}
