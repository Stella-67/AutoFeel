// ==================== Notification Helper ====================
// Shared utility for sending notifications to content script

/**
 * Send notification to tab
 * @param {number} tabId - Chrome tab ID
 * @param {string} message - Notification message
 * @param {string} type - Notification type: 'loading', 'success', 'error', 'warning'
 */
async function notifyTab(tabId, message, type = 'info') {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_NOTIFICATION',
      message: message,
      notificationType: type
    });
  } catch (error) {
    console.warn('[NotificationHelper] Failed to send notification:', error.message);
  }
}
