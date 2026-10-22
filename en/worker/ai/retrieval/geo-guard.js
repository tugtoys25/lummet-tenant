// ── Geo/licensing fact guard ──
// URLs have one canonical form, so exact-match works. Regulatory facts
// don't (infinite ways to phrase a tax rate), so this is a heuristic,
// not a guarantee like sanitizeAnswerUrls -- but it catches the two
// concrete patterns that actually showed up in production: specific
// currency/percentage figures and "Name Name (ACRONYM)" authority
// citations that aren't grounded in anything we retrieved. Only meant
// to be applied to geo/licensing-intent answers (see assistant.js).
const CURRENCY_OR_PERCENT_RE = /(?:[€$£]\s?\d[\d,.]*|\d[\d,.]*\s?(?:EUR|USD|GBP))|\b\d{1,3}(?:\.\d+)?\s?%/gi;

const AUTHORITY_ACRONYM_RE = /\b(?:[A-Z][a-zA-Z'&.-]+(?:\s+(?:[a-z]{1,3}\s+)?[A-Z][a-zA-Z'&.-]+){1,7})\s*\(([A-Z]{2,8})\)/g;

function splitIntoSentences(text) {
  // Protect URLs and bare domain-like tokens (e.g. "level.casino" used
  // as the site's own name in prose, not as a link) before splitting --
  // both contain periods that would otherwise be misread as sentence
  // boundaries and fragment mid-word/mid-link.
  const protectRe = /https?:\/\/[^\s)\]}"'<>]+|\b[a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?\b/gi;
  const protectedTokens = [];
  const protectedText = text.replace(protectRe, (m) => {
    protectedTokens.push(m);
    return `\u0000TOK${protectedTokens.length - 1}\u0000`;
  });
  const matches = protectedText.match(/[^.!?\n]+(?:[.!?]+(?=\s|$)|\n|$)/g);
  const sentences = matches && matches.length > 0 ? matches : [protectedText];
  return sentences.map(s => s.replace(/\u0000TOK(\d+)\u0000/g, (_, i) => protectedTokens[Number(i)]));
}

/**
 * Strips sentences from a geo/licensing answer that state a specific
 * currency amount, percentage, or "Authority Name (ACRONYM)" citation
 * not verbatim present in the retrieved context. If that guts the
 * answer entirely, returns a safe generic fallback rather than either
 * the fabricated text or an empty string.
 */
export function guardGeoFacts(answer, contextStr, site) {
  if (!answer) return answer;

  const allowedNumbers = new Set((contextStr.match(CURRENCY_OR_PERCENT_RE) || []).map(s => s.trim()));
  const allowedAcronyms = new Set();
  let am;
  const acronymScan = new RegExp(AUTHORITY_ACRONYM_RE.source, 'g');
  while ((am = acronymScan.exec(contextStr))) allowedAcronyms.add(am[1]);

  const sentences = splitIntoSentences(answer);
  const kept = [];
  let strippedAny = false;

  for (const sentence of sentences) {
    let flagged = false;

    for (const n of (sentence.match(CURRENCY_OR_PERCENT_RE) || [])) {
      if (!allowedNumbers.has(n.trim())) { flagged = true; break; }
    }

    if (!flagged) {
      const sentenceAcronyms = new RegExp(AUTHORITY_ACRONYM_RE.source, 'g');
      let sm;
      while ((sm = sentenceAcronyms.exec(sentence))) {
        if (!allowedAcronyms.has(sm[1])) { flagged = true; break; }
      }
    }

    if (flagged) strippedAny = true;
    else kept.push(sentence);
  }

  const result = kept.join('').replace(/\s+/g, ' ').trim();

  if (!strippedAny) return answer;
  if (result.length >= 20) return result;

  // Everything (or nearly everything) got stripped -- the answer was
  // built almost entirely on ungrounded specifics. Don't show a gutted
  // fragment or fall back to the fabricated original.
  return `I don't have that level of regulatory detail on hand. Please check an official government source for specific licensing requirements, fees, or tax rates.${site ? ` You can see what we do have at ${site.url('/en/')}.` : ''}`;
}
