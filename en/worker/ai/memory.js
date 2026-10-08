// =====================================================
// LUMMET AI — Conversation Memory (D1)
// =====================================================

const MAX_MESSAGES = 20;
const CONVERSATION_TTL_HOURS = 24;

/**
 * Get or create a conversation by session ID
 */
export async function getConversation(db, sessionId) {
  const row = await db.prepare(`
    SELECT * FROM ai_conversations WHERE session_id = ?
    ORDER BY updated_at DESC LIMIT 1
  `).bind(sessionId).first();

  if (!row) {
    const id = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO ai_conversations (id, session_id, messages)
      VALUES (?, ?, '[]')
    `).bind(id, sessionId).run();
    return { id, session_id: sessionId, messages: [] };
  }

  let messages = [];
  try { messages = JSON.parse(row.messages || '[]'); } catch { messages = []; }
  return { ...row, messages };
}

/**
 * Append a message pair (user + assistant) to conversation history
 */
export async function appendMessages(db, sessionId, userMessage, assistantMessage, userId = null) {
  const conv = await getConversation(db, sessionId);
  const messages = conv.messages || [];

  messages.push({ role: 'user', content: userMessage, ts: Date.now() });
  messages.push({ role: 'assistant', content: assistantMessage, ts: Date.now() });

  const trimmed = messages.slice(-MAX_MESSAGES);

  await db.prepare(`
    UPDATE ai_conversations
    SET messages = ?, updated_at = datetime('now'), user_id = COALESCE(?, user_id)
    WHERE id = ?
  `).bind(JSON.stringify(trimmed), userId, conv.id).run();

  return trimmed;
}

/**
 * Get recent conversation messages for context injection
 */
export async function getRecentHistory(db, sessionId, count = 6) {
  const conv = await getConversation(db, sessionId);
  const messages = conv.messages || [];
  const recent = messages.slice(-count * 2);

  return recent.map(m => ({
    role: m.role,
    content: m.content
  }));
}

/**
 * Clear conversation history for a session
 */
export async function clearConversation(db, sessionId) {
  await db.prepare(`
    UPDATE ai_conversations
    SET messages = '[]', updated_at = datetime('now')
    WHERE session_id = ?
  `).bind(sessionId).run();
}

/**
 * Clean up expired conversations (call from cron)
 */
export async function cleanupExpiredConversations(db) {
  await db.prepare(`
    DELETE FROM ai_conversations
    WHERE updated_at < datetime('now', '-${CONVERSATION_TTL_HOURS} hours')
  `).run();
}
