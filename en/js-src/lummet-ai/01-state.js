
  let isOpen = false;
  let isStreaming = false;
  let sessionId = null;
  let messages = [];
  let authGateActive = false;

  const SESSION_STORAGE_KEY = 'lummet_ai_session_id';
  const REOPEN_FLAG_KEY = 'lummet_ai_reopen';

  let button, chatWindow, messagesEl, inputEl, sendBtn, clearBtn, closeBtn, footerEl;
  let siteHostname = '';

