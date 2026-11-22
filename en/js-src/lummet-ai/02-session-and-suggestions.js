  /**
   * The session id has to survive page reloads (and a login/register
   * round trip) for two reasons: it's how the free-message quota is
   * counted client-side alongside the server-side IP check, and it's
   * how a conversation "continues" into the user's dashboard once
   * they register/login — same session_id, now attached to their
   * account server-side (see worker/ai/memory.js appendMessages).
   */
  function getOrCreateSessionId() {
    try {
      const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (existing) return existing;
      const fresh = 'lummet-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      window.localStorage.setItem(SESSION_STORAGE_KEY, fresh);
      return fresh;
    } catch (e) {
      // localStorage unavailable (private mode, etc.) — fall back to a
      // per-load id; free-tier gating still works via the server's IP check.
      return 'lummet-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }
  }

  const WELCOME_SUGGESTION_POOL = [
    { label: 'Best casinos', prompt: 'Show me the best casinos' },
    { label: 'Casino reviews', prompt: 'What casino reviews are available?' },
    { label: 'Available in my country', prompt: 'Which casinos are available in my country?' },
    { label: 'Crypto casinos', prompt: 'Tell me about crypto casinos' },
    { label: 'Payment methods', prompt: 'What payment methods do casinos support?' },
    { label: 'Bonuses', prompt: 'What bonuses are available?' },
    { label: 'Responsible gambling', prompt: 'Tell me about responsible gambling' },
    { label: 'Site navigation', prompt: 'What sections does this site have?' },
    { label: "What's new", prompt: "What's the latest casino news and updates?" },
    { label: 'Licensing & safety', prompt: 'How do I know if a casino is safe and properly licensed?' },
    { label: 'Compare casinos', prompt: 'Compare two popular casinos' },
    { label: 'Withdrawals', prompt: 'How do casino withdrawals typically work?' }
  ];

  // Wording from /api/v1/ai/widget-config. Only a "general" site (not about casinos) replaces the casino wording below; if the
  // request fails, the original wording stays.
  let AI_CFG = null;
  function cfgText(key, fallback) {
    return AI_CFG && AI_CFG.mode === 'general' && AI_CFG[key] ? AI_CFG[key] : fallback;
  }
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function loadConfig() {
    return new Promise(function (resolve) {
      let done = false;
      const finish = function (v) { if (!done) { done = true; resolve(v); } };
      setTimeout(function () { finish(null); }, 2500);
      try {
        fetch('/en/api/v1/ai/widget-config', { credentials: 'same-origin' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { finish(j && j.success ? j : null); })
          .catch(function () { finish(null); });
      } catch (e) { finish(null); }
    });
  }

  function pickSuggestions(pool, count) {
    return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
  }

  function renderWelcomeChipsHTML(count = 4) {
    let pool = (AI_CFG && AI_CFG.mode === 'general' && AI_CFG.chips && AI_CFG.chips.length) ? AI_CFG.chips : WELCOME_SUGGESTION_POOL;
    if (AI_CFG && AI_CFG.rg === false) pool = pool.filter(s => !/responsible gambling|gamble/i.test(s.label + ' ' + s.prompt));
    return pickSuggestions(pool, count)
      .map(s => `<button class="lummet-ai-suggestion-chip" data-prompt="${escHtml(s.prompt)}">${escHtml(s.label)}</button>`)
      .join('\n            ');
  }

