  function showTyping() {
    const typing = document.createElement('div');
    typing.className = 'lummet-typing';
    typing.id = 'lummetTyping';
    typing.innerHTML = `
      <div class="lummet-typing-dot"></div>
      <div class="lummet-typing-dot"></div>
      <div class="lummet-typing-dot"></div>
    `;
    messagesEl.appendChild(typing);
    scrollToBottom();
  }

  function hideTyping() {
    const typing = document.getElementById('lummetTyping');
    if (typing) typing.remove();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function clearConversation() {
    messagesEl.innerHTML = `
      <div class="lummet-ai-welcome">
        <div class="lummet-ai-welcome-icon">✦</div>
        <h4>Hi, I'm Lummet AI</h4>
        <p>I can help you explore casino reviews, compare casinos, check bonuses, and find information on ${siteHostname}.</p>
      </div>
      <div class="lummet-ai-suggestions">
        ${renderWelcomeChipsHTML(4)}
      </div>
    `;

    messagesEl.querySelectorAll('.lummet-ai-suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        inputEl.value = chip.dataset.prompt;
        sendMessage();
      });
    });

    messages = [];
    authGateActive = false;
    inputEl.disabled = false;
    sendBtn.disabled = false;
    inputEl.placeholder = 'Ask about casinos, reviews, bonuses...';

    try {
      await fetch('/en/api/v1/ai/chat/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
    } catch (e) {}
  }

  function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Markdown links
    html = html.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // Plain URLs
    html = html.replace(
      /(^|[\s(])((?:https?:\/\/)[^\s<>"']+)/g,
      function (_, prefix, url) {
        let punctuation = '';

        // Remove sentence punctuation from the end of the URL.
        while (/[.,!?;:)]$/.test(url)) {
          punctuation = url.slice(-1) + punctuation;
          url = url.slice(0, -1);
        }

        return prefix +
          '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' +
          url +
          '</a>' +
          punctuation;
      }
    );

    html = html.replace(/^[\s]*[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/<br>(<(?:ul|pre|ol))/g, '$1');
    html = html.replace(/(<\/(?:ul|pre|ol)>)<br>/g, '$1');

    return html;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
