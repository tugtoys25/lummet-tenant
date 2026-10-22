// =====================================================
// LUMMET AI — Database Retrieval (RAG Layer)
// Accepts LLM-generated search plan for smarter queries
// Schema-matched to tenant D1 production tables
// =====================================================

// The code lives in retrieval/*.js (see docs/ARCHITECTURE_AI_RETRIEVAL.md); this file keeps the public import path.
export { retrieve } from "./retrieval/retrieve.js";
export { buildContextString } from "./retrieval/context-string.js";
export { extractContextUrls, sanitizeAnswerUrls, createStreamingUrlSanitizer } from "./retrieval/url-guard.js";
export { guardGeoFacts } from "./retrieval/geo-guard.js";
