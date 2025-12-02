/**
 * Notification module for displaying user-facing messages
 * This file is loaded as part of the content script bundle
 */

// Inject notification styles once
(function initNotificationStyles() {
  if (document.getElementById('autofeel-notification-styles')) {
    return; // Already injected
  }

  const style = document.createElement('style');
  style.id = 'autofeel-notification-styles';
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
})();

/**
 * Show a notification to the user
 * @param {string} message - The message to display
 * @param {string} status - The status type: 'info', 'success', 'error', 'loading'
 */
function showNotification(message, status = 'info') {
  // Remove existing notification if any
  const existing = document.getElementById('autofeel-notification');
  if (existing) {
    existing.remove();
  }

  const notification = document.createElement('div');
  notification.id = 'autofeel-notification';
  notification.textContent = message;

  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '15px 20px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: '2147483647',
    fontSize: '14px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '400px',
    animation: 'slideIn 0.3s ease-out'
  });

  const colors = {
    info: { bg: '#2196F3', text: '#fff' },
    success: { bg: '#4CAF50', text: '#fff' },
    error: { bg: '#f44336', text: '#fff' },
    loading: { bg: '#FF9800', text: '#fff' }
  };

  const color = colors[status] || colors.info;
  notification.style.backgroundColor = color.bg;
  notification.style.color = color.text;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
