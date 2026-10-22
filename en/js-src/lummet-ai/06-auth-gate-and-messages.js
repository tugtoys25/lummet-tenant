  /**
   * Renders the "you're out of free messages" state: the message
   * itself, plus Register/Login CTAs that carry the current page back
   * as a redirect target so the widget can reopen post-login (see
   * getOrCreateSessionId's docstring and the REOPEN_FLAG_KEY check in init()).
   */
  function showAuthGate(text, authLinks) {
    authGateActive = true;

    const existingSuggestions = messagesEl.querySelector('.lummet-ai-suggestions');
    if (existingSuggestions) existingSuggestions.remove();

    addMessage(text || "You've reached the free message limit. Please register or log in to keep chatting.", 'ai');
    messages.push({ role: 'assistant', content: text || '' });

    const returnTo = window.location.pathname + window.location.search;
    const registerUrl = (authLinks && authLinks.register) || '/en/register';
    const loginUrl = (authLinks && authLinks.login) || '/en/login';

    const gate = document.createElement('div');
    gate.className = 'lummet-ai-auth-gate';
    gate.innerHTML = `
      <a class="lummet-ai-auth-btn lummet-ai-auth-btn--primary" href="${registerUrl}?redirect=${encodeURIComponent(returnTo)}">Create free account</a>
      <a class="lummet-ai-auth-btn" href="${loginUrl}?redirect=${encodeURIComponent(returnTo)}">Log in</a>
    `;
    gate.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        try { window.localStorage.setItem(REOPEN_FLAG_KEY, '1'); } catch (e) {}
      });
    });
    messagesEl.appendChild(gate);
    scrollToBottom();

    inputEl.placeholder = 'Register or log in to continue…';
    inputEl.disabled = true;
    sendBtn.disabled = true;
  }

  function updateRemainingCounter(remaining) {
    if (!footerEl || remaining === undefined || remaining === null) return;
    let counter = footerEl.querySelector('.lummet-ai-remaining');
    if (!counter) {
      counter = document.createElement('div');
      counter.className = 'lummet-ai-remaining';
      footerEl.prepend(counter);
    }
    counter.textContent = remaining === 1
      ? '1 free message left before you\u2019ll need to sign in'
      : `${remaining} free messages left before you'll need to sign in`;
  }

  function addMessage(text, type) {
    const msg = document.createElement('div');
    msg.className = `lummet-msg lummet-msg-${type}`;
    if (type === 'ai') {
      msg.innerHTML = renderMarkdown(text);
    } else {
      msg.textContent = text;
    }
    messagesEl.appendChild(msg);
    scrollToBottom();
  }

