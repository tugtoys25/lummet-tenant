  function toggleWindow() { isOpen ? closeWindow() : openWindow(); }
  function openWindow() {
    isOpen = true;
    chatWindow.classList.add('open');
    chatWindow.setAttribute('aria-hidden', 'false');
    button.classList.add('active');
    setTimeout(() => inputEl.focus(), 200);
  }

  function closeWindow() {
    isOpen = false;
    chatWindow.classList.remove('open');
    chatWindow.setAttribute('aria-hidden', 'true');
    button.classList.remove('active');
  } 

  function autoResize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

