/**
 * Build context string from retrieved results for the LLM prompt
 */
export function buildContextString(results, country, site) {
  const parts = [];
  if (results.casinos && results.casinos.length > 0) {
    parts.push('=== CASINOS ===');
    for (const c of results.casinos) {
      const geo = results.geoStatuses[c.slug] || 'unknown';
      const geoLabel = geo === 'allowed' ? 'Available' : geo === 'blocked' ? 'Not available' : 'Unknown';
      let line = `Name: ${c.name} | Slug: ${c.slug} | Rating: ${c.rating || 'N/A'}/5`;
      if (c.bonus_title) line += ` | Bonus: ${c.bonus_title}`;
      if (c.bonus_value) line += ` (${c.bonus_value})`;
      if (c.license) line += ` | License: ${c.license}`;
      if (c.owner) line += ` | Owner: ${c.owner}`;
      line += ` | ${geoLabel} in ${country || 'user country'}`;
      line += ` | Link: ${site.url(`/en/casino/${c.slug}`)}`;
      if (c.parsedFeatures && c.parsedFeatures.length > 0) line += ` | Features: ${c.parsedFeatures.join(', ')}`;
      if (results.casinoCategories && results.casinoCategories[c.slug]) line += ` | Categories: ${results.casinoCategories[c.slug].map(cat => cat.name).join(', ')}`;
      if (results.casinoPaymentMethods && results.casinoPaymentMethods[c.slug]) line += ` | Payment methods: ${results.casinoPaymentMethods[c.slug].map(pm => pm.name).join(', ')}`;
      parts.push(line);
    }
  }

  if (results.reviews && results.reviews.length > 0) {
    parts.push('\n=== REVIEWS ===');
    for (const r of results.reviews) {
      let line = `Title: ${r.title} | Rating: ${r.rating || 'N/A'}/5 | Casino: ${r.casino_slug || 'N/A'}`;
      if (r.overview) line += ` | Overview: ${r.overview}`;
      if (r.pros) line += ` | Pros: ${r.pros}`;
      if (r.cons) line += ` | Cons: ${r.cons}`;
      if (r.verdict) line += ` | Verdict: ${r.verdict}`;
      if (r.author) line += ` | Author: ${r.author}`;
      if (r.games) line += ` | Games: ${r.games}`;
      if (r.bonuses) line += ` | Bonuses: ${r.bonuses}`;
      if (r.payments) line += ` | Payments: ${r.payments}`;
      if (r.licenses) line += ` | Licenses: ${r.licenses}`;
      line += ` | Link: ${site.url(`/en/review/${r.slug}`)}`;
      if (r.faqs && r.faqs.length > 0) line += ` | FAQ: ${r.faqs.map(f => `Q:${f.q || f.question} A:${f.a || f.answer}`).join('; ')}`;
      parts.push(line);
    }
  }

  if (results.reviewBlocks && results.reviewBlocks.length > 0) {
    parts.push('\n=== REVIEW DETAILS ===');
    for (const b of results.reviewBlocks) parts.push(`[${b.review_slug}] ${b.title}: ${b.content}`);
  }

  if (results.contentItems && results.contentItems.length > 0) {
    parts.push('\n=== SPORTSBOOKS, PARTNERS AND OTHER LISTINGS (available in the visitor\'s country) ===');
    for (const it of results.contentItems) {
      const path = it.type === 'sportsbook' ? `/en/sportsbook/${it.slug}` : it.type === 'affiliate_partner' ? `/en/affiliate-partner/${it.slug}` : `/en/custom/${it.custom_type_slug}/${it.slug}`;
      let line = `Name: ${it.name} | Type: ${String(it.type).replace('_', ' ')}`;
      if (it.rating) line += ` | Rating: ${it.rating}`;
      if (it.license) line += ` | Licence: ${it.license}`;
      if (it.summary) line += ` | Summary: ${it.summary}`;
      line += ` | Link: ${site.url(path)}`;
      parts.push(line);
    }
  }

  if (results.researchItems && results.researchItems.length > 0) {
    parts.push('\n=== RESEARCH ===');
    for (const it of results.researchItems) {
      let line = `Title: ${it.title} | Type: ${it.type}`;
      if (it.country) line += ` | Country: ${it.country}`;
      if (it.excerpt) line += ` | Summary: ${it.excerpt}`;
      if (it.verified) line += ` | Last verified: ${it.verified}`;
      if (it.claims && it.claims.length) line += ` | Verified facts: ${it.claims.join(' ; ')}`;
      line += ` | Link: ${site.url(`/en/research/${it.type}/${it.slug}`)}`;
      parts.push(line);
    }
  }

  if (results.news && results.news.length > 0) {
    parts.push('\n=== NEWS ===');
    for (const n of results.news) {
      let line = `Title: ${n.title}`;
      if (n.excerpt) line += ` | Excerpt: ${n.excerpt}`;
      if (n.author) line += ` | Author: ${n.author}`;
      if (n.published_at) line += ` | Date: ${n.published_at}`;
      line += ` | Link: ${site.url(`/en/news/${n.slug}`)}`;
      parts.push(line);
    }
  }

    if (
    results.platformUpdates &&
    results.platformUpdates.length > 0
  ) {
    parts.push('\n=== PLATFORM UPDATES ===');

    for (const u of results.platformUpdates) {
      let line = `Title: ${u.title}`;

      if (u.excerpt) {
        line += ` | Summary: ${u.excerpt}`;
      }

      if (u.content) {
        line += ` | Content: ${u.content}`;
      }

      if (u.author_name) {
        line += ` | Author: ${u.author_name}`;
      }

      if (u.author_role) {
        line += ` | Author Role: ${u.author_role}`;
      }

      if (u.published_at) {
        line += ` | Published: ${u.published_at}`;
      }

      if (u.updated_at) {
        line += ` | Updated: ${u.updated_at}`;
      }

      line += ` | Link: ${site.url(`/en/updates/${u.slug}`)}`;

      parts.push(line);
    }
  }

  if (results.pages && results.pages.length > 0) {
    parts.push('\n=== PAGES ===');
    for (const p of results.pages) parts.push(`Title: ${p.title} | Type: ${p.type || 'page'} | Link: ${site.url(`/en/${p.slug}`)}`);
  }

  if (results.faqs && results.faqs.length > 0) {
    parts.push('\n=== FAQs ===');
    for (const f of results.faqs) parts.push(`Q: ${f.question} | A: ${f.answer}`);
  }

  if (results.authors && results.authors.length > 0) {
    parts.push('\n=== AUTHORS ===');
    for (const a of results.authors) parts.push(`Name: ${a.name} | Role: ${a.role || 'Editor'} | Bio: ${a.bio || ''} | Profile: ${site.url(`/en/author/${a.slug}`)}`);
  }

  if (results.countries && results.countries.length > 0) {
    parts.push('\n=== COUNTRY INFO ===');
    for (const c of results.countries) parts.push(`Country: ${c.name} (${c.code}) | Currency: ${c.currency || 'N/A'} | Language: ${c.language || 'N/A'} | Legal Status: ${c.legal_status || 'N/A'} | Link: ${site.url(`/en/country/${c.code.toLowerCase()}`)}`);
  }

  if (results.categories && results.categories.length > 0) {
    parts.push('\n=== CATEGORIES ===');
    for (const c of results.categories) parts.push(`Category: ${c.name} | Link: ${site.url(`/en/category/${c.slug}`)}`);
  }

  if (results.seoMeta && results.seoMeta.length > 0) {
    parts.push('\n=== SITE INFO ===');
    for (const s of results.seoMeta) parts.push(`Page: ${s.title} | Type: ${s.page_type} | Slug: ${s.page_slug} | Description: ${s.description || ''}`);
  }

  if (results.paymentMethods && results.paymentMethods.length > 0) {
    parts.push('\n=== PAYMENT METHODS ===');
    for (const p of results.paymentMethods) {
      let line = `Name: ${p.name} | Type: ${p.method_type || 'other'}`;
      if (p.description) line += ` | ${p.description}`;
      line += ` | Link: ${site.url(`/en/payment-methods/${p.slug}`)}`;
      parts.push(line);
    }
  }

  if (results.navItems && results.navItems.length > 0) {
    parts.push('\n=== SITE NAVIGATION ===');
    for (const n of results.navItems) {
      parts.push(`${n.label} (${n.location}) | Link: ${site.url(n.url)}`);
    }
  }

  if (results.homepageSections && results.homepageSections.length > 0) {
    parts.push('\n=== HOMEPAGE SECTIONS ===');
    for (const s of results.homepageSections) parts.push(`Section: ${s.title || s.name} | Type: ${s.type}`);
    parts.push(`Homepage link: ${site.url('/en/')}`);
  }

  if (results.seoPages && results.seoPages.length > 0) {
    parts.push('\n=== COUNTRY & CATEGORY GUIDES ===');
    for (const p of results.seoPages) {
      const kind = p.page_type === 'country_custom' ? 'country guide' : 'category hub page';
      parts.push(`${p.title} (${kind}) | Link: ${site.url(p.url)}`);
    }
  }

  // Always-available real hub/list-page URLs. These exist so the model
  // has true fallback links for "guide"/overview-style questions instead
  // of inventing a plausible-sounding URL when nothing more specific
  // matched above (see worker/ai/prompt.js's URL rule and the
  // sanitizeAnswerUrls() guard in assistant.js, which is the actual
  // backstop if the model ignores this anyway).
  parts.push('\n=== SITE SECTIONS (use these as fallback links, never invent a URL) ===');
  parts.push(`Casino list: ${site.url('/en/casino')}`);
  parts.push(`Review list: ${site.url('/en/review')}`);
  parts.push(`News list: ${site.url('/en/news')}`);
  parts.push(`Platform updates list: ${site.url('/en/updates')}`);
  parts.push(`Author list: ${site.url('/en/author')}`);
  parts.push(`Country list: ${site.url('/en/country')}`);
  parts.push(`Category list: ${site.url('/en/category')}`);
  parts.push(`Payment methods list: ${site.url('/en/payment-methods')}`);
  parts.push(`Contact page: ${site.url('/en/contact')}`);
  parts.push(`Responsible gambling resources: ${site.url('/en/responsible-gambling')}`);
  parts.push(`Homepage: ${site.url('/en/')}`);

  return parts.length > 0 ? parts.join('\n') : `No relevant information found in the ${site.siteName} database.`;
}
