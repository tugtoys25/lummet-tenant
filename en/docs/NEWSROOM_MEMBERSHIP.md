# Newsroom membership and member-only articles

Switch (Newsroom > Flags, off by default): `news_membership`. Off means every article is read exactly as before, whatever is stored.

Setup: Newsroom > Membership > Set up membership (needs the manage-settings permission). Copy the webhook secret when it is shown; it is shown once.

Access levels per article: free (default), registered (any confirmed newsletter subscriber or member), members. Readers without access get the first paragraphs (never more than half the article) and a sign-in box.

Leak protection: the text is cut on the server before the page, structured data and ads are built; feeds drop the full text of limited articles; a request carrying the member cookie never reads or writes the shared page cache and the response is private/no-store; limited pages send Vary: Cookie; structured data says the rest is behind a sign-in (isAccessibleForFree false).

Sign-in: no passwords. The reader asks for an emailed one-time link (valid 15 minutes, single use, stored hashed, rate limited). The answer is identical whether or not the address is known. The cookie (30 days) is signed; revoking a member or ending their date takes effect at once.

Members: add by hand (Membership tab) or let a payment provider or automation call POST /en/api/v1/news/member/webhook with JSON {event: grant|revoke, email, ts, tier, expires_at, external_id} and header X-Signature = hex HMAC-SHA256(raw body, webhook secret). ts must be within 5 minutes.

Not built: taking payments (connect a provider to the webhook), metered free articles, section-wide rules, Googlebot verification (search engines see the preview and the structured data).
