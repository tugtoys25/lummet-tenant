import { MAX_FIELD, REWRITE_MODES } from "./config.js";
import { clip, esc } from "./text-utils.js";
import { arr, secs } from "./facts.js";

/** Each task: label, group, resource (permission), kind (text|json), needs, build(), shape() */
export const TASKS = {
  item_description: {
    label: "Item copy and SEO", group: "Content", resource: "item", kind: "json", needs: ["item"], temperature: 0.4, max_tokens: 900,
    help: "Title, short excerpt, description and SEO fields for a casino, sportsbook, affiliate partner or custom item.",
    build: (i, c) => ({
      system: secs(c.site, "an editorial copywriter", 'Return ONLY a JSON object: {"title":"","excerpt":"","description":"","seo_title":"","seo_description":"","seo_keywords":""}. seo_title under 60 characters, seo_description under 155, excerpt under 200, description 80-160 words.'),
      user: `Write copy for this ${c.item.type.replace("_", " ")}.\n<facts>\n${c.item.facts}\n</facts>`
    }),
    shape: (d) => d && typeof d === "object" && !Array.isArray(d) ? {
      title: clip(d.title, 160), excerpt: clip(d.excerpt, 300), description: clip(d.description, 3000),
      seo_title: clip(d.seo_title, 70), seo_description: clip(d.seo_description, 170), seo_keywords: clip(d.seo_keywords, 200)
    } : null
  },
  item_review: {
    label: "Full review (any type)", group: "Content", resource: "item", kind: "text", needs: ["item"], temperature: 0.5, max_tokens: 2200,
    help: "A balanced review of any item, built only from its saved facts.",
    build: (i, c) => ({
      system: secs(c.site, "an independent reviewer", "Plain text, section titles on their own lines, no markdown symbols. 600-900 words. Cover overview, key features, who it suits, points to check, and a responsible-gambling reminder. Where a detail is not in the facts, say it should be confirmed on the official site."),
      user: `Write a review of "${c.item.name}" (${c.item.type.replace("_", " ")}).${i.country ? ` Audience: players in ${clip(i.country, 40)}.` : ""}\n<facts>\n${c.item.facts}\n</facts>`
    })
  },
  item_faqs: {
    label: "FAQs (any type)", group: "Content", resource: "item", kind: "json", needs: ["item"], temperature: 0.4, max_tokens: 900,
    help: "Five question-and-answer pairs from the item's facts.",
    build: (i, c) => ({
      system: secs(c.site, "an FAQ writer", 'Return ONLY a JSON array of 5 objects: [{"q":"","a":""}]. Answers 2-3 sentences. Skip any question the facts cannot answer.'),
      user: `FAQs for "${c.item.name}".\n<facts>\n${c.item.facts}\n</facts>`
    }),
    shape: (d) => (Array.isArray(d) ? d.map((x) => ({ q: clip(x && x.q, 240), a: clip(x && x.a, 700) })).filter((x) => x.q && x.a).slice(0, 10) : null)
  },
  compare_items: {
    label: "Compare items", group: "Content", resource: "item", kind: "text", needs: ["items"], temperature: 0.4, max_tokens: 1400,
    help: "A fair side-by-side written comparison of 2-4 items you pick.",
    build: (i, c) => ({
      system: secs(c.site, "a comparison editor", "Plain text. Short intro, then one paragraph per item, then a 'Which suits whom' paragraph. Compare only what the facts show; do not declare a universal winner."),
      user: c.items.map((it, n) => `<facts item="${n + 1}" name="${esc(it.name)}">\n${it.facts}\n</facts>`).join("\n")
    })
  },
  research_draft: {
    label: "Research draft", group: "Research", resource: "research", kind: "json", needs: ["sources"], temperature: 0.3, max_tokens: 2400,
    help: "A structured research article from the sources and notes you give (pasted text or web addresses).",
    build: (i, c) => ({
      system: secs(c.site, "a research editor", 'Return ONLY JSON: {"title":"","subtitle":"","excerpt":"","seo_title":"","seo_description":"","sections":[{"title":"","body":""}]}. 4-7 sections. Plain text bodies with blank lines between paragraphs. Mark anything the sources do not settle as "needs verification". Never state a law, rate or date that is not in the sources.'),
      user: `Topic: ${clip(i.topic, 300)}\nType: ${i.research_type}${i.country ? `\nCountry: ${clip(i.country, 40)}` : ""}${i.notes ? `\nEditor notes: ${clip(i.notes, 2000)}` : ""}\n${c.sourceBlock || "(No sources were supplied. Write only an outline-style draft and mark every claim as needing verification.)"}`
    }),
    shape: (d) => d && Array.isArray(d.sections) ? {
      title: clip(d.title, 200), subtitle: clip(d.subtitle, 300), excerpt: clip(d.excerpt, 400),
      seo_title: clip(d.seo_title, 70), seo_description: clip(d.seo_description, 170),
      sections: d.sections.map((s) => ({ title: clip(s && s.title, 200), body: clip(s && s.body, 6000) })).filter((s) => s.title || s.body).slice(0, 12)
    } : null
  },
  research_claims: {
    label: "Extract claims", group: "Research", resource: "research", kind: "json", needs: ["sources"], temperature: 0.1, max_tokens: 1400,
    help: "Pulls single, checkable statements out of a text or page so each can be sourced and verified.",
    build: (i, c) => ({
      system: secs(c.site, "a fact-checking analyst", 'Return ONLY a JSON array: [{"claim_text":"","claim_type":"fact|rule|rate|date|statistic|opinion"}]. One atomic, checkable statement per item, quoted or closely paraphrased from the source. At most 20.'),
      user: c.sourceBlock || "(no text)"
    }),
    shape: (d) => (Array.isArray(d) ? d.map((x) => ({
      claim_text: clip(x && x.claim_text, 600),
      claim_type: /^(fact|rule|rate|date|statistic|opinion)$/.test(String(x && x.claim_type)) ? x.claim_type : "fact"
    })).filter((x) => x.claim_text).slice(0, 20) : null)
  },
  research_factcheck: {
    label: "Fact-check a draft", group: "Research", resource: "research", kind: "json", needs: ["sources", "reference"], temperature: 0.1, max_tokens: 1400,
    help: "Compares a draft with the sources and saved claims and lists statements that are unsupported or risky.",
    build: (i, c) => ({
      system: secs(c.site, "a careful fact-checker", 'Return ONLY JSON: {"verdict":"ok|needs_work","issues":[{"statement":"","problem":"unsupported|contradicted|outdated_risk|exaggerated","suggestion":""}]}. Flag a statement only when the reference material does not back it up. If no reference material is given, flag every specific number, date, law and licence claim as unsupported.'),
      user: `<content>\n${clip(i.text, MAX_FIELD)}\n</content>\n${c.sourceBlock || ""}${c.reference ? `\n<facts>\nSaved claims: ${c.reference.claims.map((x) => `[${x.status}] ${x.claim_text}`).join(" | ") || "none"}\n</facts>` : ""}`
    }),
    shape: (d) => d && typeof d === "object" ? {
      verdict: d.verdict === "ok" ? "ok" : "needs_work",
      issues: (Array.isArray(d.issues) ? d.issues : []).map((x) => ({ statement: clip(x && x.statement, 500), problem: clip(x && x.problem, 40), suggestion: clip(x && x.suggestion, 500) })).filter((x) => x.statement).slice(0, 30)
    } : null
  },
  research_brief: {
    label: "Source brief", group: "Research", resource: "research", kind: "json", needs: ["sources"], temperature: 0.2, max_tokens: 1000,
    help: "Summarises pasted text or web pages into key points and open questions.",
    build: (i, c) => ({
      system: secs(c.site, "a research analyst", 'Return ONLY JSON: {"summary":"","key_points":[""],"open_questions":[""]}. Summary under 120 words, up to 8 key points, up to 5 open questions about what the sources do not answer.'),
      user: c.sourceBlock || "(no text)"
    }),
    shape: (d) => d && typeof d === "object" ? { summary: clip(d.summary, 1500), key_points: arr(d.key_points, 8), open_questions: arr(d.open_questions, 5) } : null
  },
  news_article: {
    label: "News article draft", group: "News", resource: "news", kind: "json", needs: ["sources"], temperature: 0.4, max_tokens: 1800,
    help: "A news story from your notes or sources, ready to save as an unpublished draft.",
    build: (i, c) => ({
      system: secs(c.site, "a news editor", 'Return ONLY JSON: {"title":"","excerpt":"","content":"","tags":"comma, separated","seo_title":"","seo_description":""}. Inverted-pyramid style, 300-500 words, plain text with blank lines between paragraphs. Attribute claims to the source where possible.'),
      user: `Story brief: ${clip(i.topic, 600)}${i.notes ? `\nNotes: ${clip(i.notes, 3000)}` : ""}\n${c.sourceBlock || ""}`
    }),
    shape: (d) => d && typeof d === "object" && d.content ? {
      title: clip(d.title, 200), excerpt: clip(d.excerpt, 400), content: clip(d.content, 12000), tags: clip(d.tags, 200),
      seo_title: clip(d.seo_title, 70), seo_description: clip(d.seo_description, 170)
    } : null
  },
  headlines: {
    label: "Headline options", group: "News", resource: "any", kind: "json", needs: [], temperature: 0.8, max_tokens: 500,
    help: "Eight headline options in different styles.",
    build: (i, c) => ({
      system: secs(c.site, "a headline editor", 'Return ONLY a JSON array of 8 strings, each under 70 characters, accurate and not clickbait.'),
      user: `<content>\n${clip(i.text, 4000)}\n</content>`
    }),
    shape: (d) => (Array.isArray(d) ? arr(d, 10, 140) : null)
  },
  social_posts: {
    label: "Social posts", group: "News", resource: "any", kind: "json", needs: [], temperature: 0.7, max_tokens: 700,
    help: "Short posts for X, LinkedIn, Facebook and Telegram.",
    build: (i, c) => ({
      system: secs(c.site, "a social media editor", 'Return ONLY JSON: {"x":"under 270 chars","linkedin":"","facebook":"","telegram":""}. No made-up claims. Add no hashtags beyond two.'),
      user: `<content>\n${clip(i.text, 5000)}\n</content>${i.url ? `\nLink to include: ${clip(i.url, 300)}` : ""}`
    }),
    shape: (d) => d && typeof d === "object" ? { x: clip(d.x, 300), linkedin: clip(d.linkedin, 1500), facebook: clip(d.facebook, 1500), telegram: clip(d.telegram, 1500) } : null
  },
  translate: {
    label: "Translate", group: "Language", resource: "any", kind: "text", needs: [], temperature: 0.2, max_tokens: 2500,
    help: "Translates text or HTML, keeping tags, links and numbers unchanged.",
    build: (i, c) => ({
      system: secs(c.site, "a professional translator", `Translate into ${i.language}. Keep HTML tags, URLs, numbers and brand names exactly. Return only the translation.`),
      user: `<content>\n${clip(i.text)}\n</content>`
    })
  },
  rewrite: {
    label: "Rewrite or improve", group: "Language", resource: "any", kind: "text", needs: [], temperature: 0.4, max_tokens: 2500,
    help: "Readability, SEO, clarity, tone, expand, shorten, simplify or compliance clean-up.",
    build: (i, c) => ({
      system: secs(c.site, "an editor", `${REWRITE_MODES[i.mode] || REWRITE_MODES.readability} Return only the revised text, no commentary.`),
      user: `<content>\n${clip(i.text)}\n</content>`
    })
  },
  summarize: {
    label: "Summarise", group: "Language", resource: "any", kind: "text", needs: [], temperature: 0.2, max_tokens: 700,
    help: "A short summary plus bullet points.",
    build: (i, c) => ({
      system: secs(c.site, "an editor", "Give a 2-3 sentence summary, then 3-6 bullet points starting with '- '."),
      user: `<content>\n${clip(i.text)}\n</content>`
    })
  },
  seo_pack: {
    label: "SEO pack (any text)", group: "SEO", resource: "any", kind: "json", needs: [], temperature: 0.3, max_tokens: 500,
    help: "SEO title, description and keywords for news, pages or research.",
    build: (i, c) => ({
      system: secs(c.site, "an SEO editor", 'Return ONLY JSON: {"seo_title":"under 60 chars","seo_description":"under 155 chars","seo_keywords":"comma separated"}. Describe the page honestly.'),
      user: `${i.topic ? `Title: ${clip(i.topic, 200)}\n` : ""}<content>\n${clip(i.text, 6000)}\n</content>`
    }),
    shape: (d) => d && typeof d === "object" ? { seo_title: clip(d.seo_title, 70), seo_description: clip(d.seo_description, 170), seo_keywords: clip(d.seo_keywords, 200) } : null
  },
  suggest_tags: {
    label: "Suggest tags", group: "SEO", resource: "any", kind: "json", needs: [], temperature: 0.2, max_tokens: 300,
    help: "Up to 8 short tags for an article or item.",
    build: (i, c) => ({
      system: secs(c.site, "a taxonomy editor", 'Return ONLY a JSON array of up to 8 lowercase tags, 1-3 words each.'),
      user: `<content>\n${clip(i.text, 5000)}\n</content>`
    }),
    shape: (d) => (Array.isArray(d) ? arr(d, 8, 40).map((t) => t.toLowerCase()) : null)
  }
};

export function listTasks() {
  return Object.entries(TASKS).map(([id, t]) => ({ id, label: t.label, group: t.group, kind: t.kind, help: t.help, needs: t.needs, resource: t.resource }));
}
