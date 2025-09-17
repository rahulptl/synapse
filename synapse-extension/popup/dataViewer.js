document.addEventListener('click', (e) => {
  const row = e.target.closest('.conversation-row');
  if (row) {
    const conversationId = row.getAttribute('data-conversation-id');
    const panel = document.getElementById('messages-' + conversationId);

    if (panel) {
      const isVisible = panel.style.display === 'block';
      document.querySelectorAll('.messages-panel').forEach(p => p.style.display = 'none');
      panel.style.display = isVisible ? 'none' : 'block';
    }
  }
});