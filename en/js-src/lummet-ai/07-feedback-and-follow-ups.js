  /**
   * Thumbs up / down under the latest answer. The server reads the question and answer from the saved
   * conversation, so only the session id, the rating and an optional short reason are sent. Failures are silent.
   */
  function sendFeedback(rating, reason) {
    try {
      fetch('/en/api/v1/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, rating: rating, reason: reason || undefined })
      }).catch(function () {});
    } catch (e) {}
  }

  function addFeedbackRow() {
    const old = messagesEl.querySelector('.lummet-fb');
    if (old) old.remove();
    const row = document.createElement('div');
    row.className = 'lummet-fb';
    const label = document.createElement('span');
    label.textContent = 'Was this helpful?';
    const mk = function (txt, aria) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'lummet-fb-btn'; b.textContent = txt; b.setAttribute('aria-label', aria);
      return b;
    };
    const up = mk('\uD83D\uDC4D', 'Yes, helpful');
    const down = mk('\uD83D\uDC4E', 'No, not helpful');
    const thanks = function (msg) { row.textContent = msg; };
    up.addEventListener('click', function () { sendFeedback('up'); thanks('Thanks for the feedback.'); });
    down.addEventListener('click', function () {
      sendFeedback('down');
      row.textContent = '';
      const q = document.createElement('span');
      q.textContent = 'What was wrong?';
      row.appendChild(q);
      [['wrong', 'Incorrect'], ['missing', 'Missing info'], ['unclear', 'Unclear'], ['other', 'Something else']].forEach(function (r) {
        const c = document.createElement('button');
        c.type = 'button'; c.className = 'lummet-fb-chip'; c.textContent = r[1];
        c.addEventListener('click', function () { sendFeedback('down', r[0]); thanks('Thanks, that helps us improve.'); });
        row.appendChild(c);
      });
    });
    row.appendChild(label); row.appendChild(up); row.appendChild(down);
    const sug = messagesEl.querySelector('.lummet-ai-suggestions');
    if (sug) messagesEl.insertBefore(row, sug); else messagesEl.appendChild(row);
    scrollToBottom();
  }

  function addFollowUpSuggestions() {
    const existing = messagesEl.querySelector('.lummet-ai-suggestions');
    if (existing) existing.remove();

    const suggestions = document.createElement('div');
    suggestions.className = 'lummet-ai-suggestions';
    suggestions.style.marginTop = '4px';

    const FOLLOW_UP_POOL = [
      { label: 'Compare casinos', prompt: 'Compare the casinos you mentioned' },
      { label: 'Show bonuses', prompt: 'What bonuses do these casinos offer?' },
      { label: 'Payment methods', prompt: 'What payment methods are available?' },
      { label: 'More details', prompt: 'Tell me more about the first one' },
      { label: 'Is it licensed?', prompt: 'Is this casino properly licensed and safe?' },
      { label: 'Withdrawal times', prompt: 'How fast are withdrawals at these casinos?' }
    ];
    const chips = pickSuggestions(FOLLOW_UP_POOL, 4);

    chips.forEach(chip => {
      const btn = document.createElement('button');
      btn.className = 'lummet-ai-suggestion-chip';
      btn.textContent = chip.label;
      btn.addEventListener('click', () => {
        inputEl.value = chip.prompt;
        sendMessage();
      });
      suggestions.appendChild(btn);
    });

    messagesEl.appendChild(suggestions);
    scrollToBottom();
  }

