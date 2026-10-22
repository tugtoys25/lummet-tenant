// =====================================================
// LUMMET AI STUDIO -- admin abilities beyond casino reviews.
//
// What the AI could do before: casino reviews, SEO, FAQs, schema, outlines,
// rewrites (all casino-shaped). What this adds: the same help for sportsbooks,
// affiliate partners and custom content types; research drafting, claim
// extraction, fact-checking and source briefs (including reading a web page
// the editor points at); news drafting, headlines and social posts;
// translation; summaries; tags; comparisons and a content audit.
//
// Rules this file keeps:
//  - Generation only. Nothing is saved or published by a model call. Saving
//    goes through applyResult(), which creates DRAFTS (news, research) or
//    UNVERIFIED claims, or fills SEO/description fields on an existing item the
//    editor chose, after a permission check.
//  - The model is told to use only the facts given. Fetched pages and pasted
//    source text are passed as data, never as instructions.
//  - Model text is escaped before it becomes page HTML.
// =====================================================

// The code lives in studio/*.js (see docs/ARCHITECTURE_STUDIO.md); this file keeps the public import path.
export { MODEL, MAX_FIELD, MAX_SOURCE_CHARS, RATE_MAX, RATE_WINDOW_MIN } from "./studio/config.js";
export { esc, textToHtml, slugify, parseJsonLoose, stripHtml, checkUrl, fetchSourceText } from "./studio/text-utils.js";
export { loadItemFacts } from "./studio/facts.js";
export { TASKS, listTasks } from "./studio/tasks.js";
export { runTask } from "./studio/run-task.js";
export { applyResult } from "./studio/apply-result.js";
export { auditContent, draftFeedbackFix, listDraftFaqs } from "./studio/audit.js";
export { HISTORY_KEEP_DAYS, recordHistory, readHistory } from "./studio/history.js";
export { handleAiStudio } from "./studio/http.js";
