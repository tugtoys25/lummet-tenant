  async function sendMessage() {
    if (authGateActive) return;
    const text = inputEl.value.trim();
    if (!text || isStreaming) return;

    const welcome = messagesEl.querySelector('.lummet-ai-welcome');
    const suggestions = messagesEl.querySelector('.lummet-ai-suggestions');
    if (welcome) welcome.remove();
    if (suggestions) suggestions.remove();
    const oldFb = messagesEl.querySelector('.lummet-fb');
    if (oldFb) oldFb.remove();

    addMessage(text, 'user');
    messages.push({ role: 'user', content: text });

    inputEl.value = '';
    inputEl.style.height = 'auto';
    inputEl.disabled = true;
    sendBtn.disabled = true;
    isStreaming = true;

    showTyping();

    try {
      const response = await fetch('/en/api/v1/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId })
      });

      if (!response.ok) throw new Error('Stream request failed');

      const contentType = response.headers.get('Content-Type') || '';

      if (contentType.includes('text/event-stream')) {
        await handleStreamResponse(response);
      } else {
        const data = await response.json();
        hideTyping();
        if (data.requiresAuth) {
          showAuthGate(data.answer, data.authLinks);
        } else {
          const answer = data.answer || 'I could not generate a response.';
          addMessage(answer, 'ai');
          messages.push({ role: 'assistant', content: answer });
          updateRemainingCounter(data.freeMessagesRemaining);
          addFeedbackRow();
        }
      }
    } catch (error) {
      console.error('Lummet stream error:', error);
      try {
        const response = await fetch('/en/api/v1/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, session_id: sessionId })
        });
        const data = await response.json();
        hideTyping();
        if (data.requiresAuth) {
          showAuthGate(data.answer, data.authLinks);
        } else {
          const answer = data.answer || 'I could not find that information.';
          addMessage(answer, 'ai');
          messages.push({ role: 'assistant', content: answer });
          updateRemainingCounter(data.freeMessagesRemaining);
          addFeedbackRow();
        }
      } catch (fallbackError) {
        hideTyping();
        addMessage('Sorry, something went wrong. Please try again.', 'ai');
      }
    } finally {
      isStreaming = false;
      if (!authGateActive) {
        inputEl.disabled = false;
        sendBtn.disabled = false;
        inputEl.focus();
      }
    }
  }

  async function handleStreamResponse(response) {
    hideTyping();

    const bubble = document.createElement('div');
    bubble.className = 'lummet-msg lummet-msg-ai';
    messagesEl.appendChild(bubble);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let gated = false;
    let failed = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'delta') {
              fullText += data.content;
              bubble.innerHTML = renderMarkdown(fullText);
              scrollToBottom();
            } else if (data.type === 'auth_required') {
              gated = true;
              bubble.remove();
              showAuthGate(data.content, data.authLinks);
            } else if (data.type === 'done') {
              if (data.session_id) sessionId = data.session_id;
              if (!gated) updateRemainingCounter(data.freeMessagesRemaining);
            } else if (data.type === 'error') {
              failed = true;
              bubble.innerHTML = renderMarkdown(data.content || 'An error occurred.');
            }
          } catch (e) {}
        }
      }
    }

    if (gated) return;

    messages.push({ role: 'assistant', content: fullText });
    addFollowUpSuggestions();
    if (!failed) addFeedbackRow();
  }

