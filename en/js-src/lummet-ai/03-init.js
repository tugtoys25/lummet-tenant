  function init() {
    const siteOrigin = window.location.origin;
    siteHostname = window.location.hostname;
    if (document.querySelector('.lummet-ai-root')) return;

    if (!document.querySelector('link[href*="lummet-ai.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/static/css/lummet-ai.css';
      document.head.appendChild(link);
    }

    const root = document.createElement('div');
    root.className = 'lummet-ai-root';
    root.innerHTML = `
      <button class="lummet-ai-button" aria-label="Open Lummet AI Assistant" title="Lummet AI">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 8V4H8"></path>
          <rect x="4" y="8" width="16" height="12" rx="2"></rect>
          <path d="M2 14h2"></path>
          <path d="M20 14h2"></path>
          <path d="M15 13v2"></path>
          <path d="M9 13v2"></path>
        </svg>
      </button>

      <div class="lummet-ai-window" role="dialog" aria-label="Lummet AI Chat" aria-hidden="true">
        <div class="lummet-ai-header">
          <div class="lummet-ai-header-info">
            <div class="lummet-ai-avatar">✦</div>
            <div class="lummet-ai-title-block">
              <h3>Lummet AI</h3>
              <span><span class="lummet-ai-status-dot"></span> Your iGaming Intelligence Assistant</span>
            </div>
          </div>
          <div class="lummet-ai-header-actions">
            <button class="lummet-ai-header-btn lummet-ai-clear" aria-label="Clear conversation" title="Clear chat">↻</button>
            <button class="lummet-ai-header-btn lummet-ai-close" aria-label="Close chat" title="Close">✕</button>
          </div>
        </div>

        <div class="lummet-ai-messages" id="lummetMessages">
          <div class="lummet-ai-welcome">
            <div class="lummet-ai-welcome-icon">✦</div>
            <h4>Hi, I'm Lummet AI</h4>
            <p>I can help you explore casino reviews, compare casinos, check bonuses, and find information on ${siteHostname}.</p>
          </div>
          <div class="lummet-ai-suggestions">
            ${renderWelcomeChipsHTML(4)}
          </div>
        </div>

        <div class="lummet-ai-input-area">
          <textarea class="lummet-ai-input" id="lummetInput" placeholder="Ask about casinos, reviews, bonuses..." rows="1" aria-label="Message input"></textarea>
          <button class="lummet-ai-send" id="lummetSend" aria-label="Send message">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>

        <div class="lummet-ai-footer">
          Powered by <a href="${siteOrigin}">${siteHostname}</a> · Editorial content only · 18+
        </div>
      </div>
    `;

    document.body.appendChild(root);

    button = root.querySelector('.lummet-ai-button');
    chatWindow = root.querySelector('.lummet-ai-window');
    messagesEl = root.querySelector('#lummetMessages');
    inputEl = root.querySelector('#lummetInput');
    sendBtn = root.querySelector('#lummetSend');
    clearBtn = root.querySelector('.lummet-ai-clear');
    closeBtn = root.querySelector('.lummet-ai-close');
    footerEl = root.querySelector('.lummet-ai-footer');

    button.addEventListener('click', toggleWindow);
    closeBtn.addEventListener('click', closeWindow);
    clearBtn.addEventListener('click', clearConversation);
    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', handleKeyDown);
    inputEl.addEventListener('input', autoResize);

    root.querySelectorAll('.lummet-ai-suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        inputEl.value = chip.dataset.prompt;
        sendMessage();
      });
    });

    sessionId = getOrCreateSessionId();

    // If we just sent the visitor off to /en/login or /en/register from
    // the auth-gate CTA, reopen the widget on the page they land back
    // on so the conversation visibly continues.
    try {
      if (window.localStorage.getItem(REOPEN_FLAG_KEY) === '1') {
        window.localStorage.removeItem(REOPEN_FLAG_KEY);
        openWindow();
      }
    } catch (e) {}
  }

