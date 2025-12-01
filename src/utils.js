// ==================== AutoFeel Utility Functions ====================
// Shared utilities to avoid code duplication across modules

const Utils = {
  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Capitalize first letter of a string
   */
  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  /**
   * Format date to locale string
   */
  formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString();
  },

  /**
   * Format date with time
   */
  formatDateTime(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  },

  /**
   * Truncate text to specified length
   */
  truncate(text, maxLength = 100, suffix = '...') {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + suffix;
  },

  /**
   * Generate unique ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  },

  /**
   * Export data as file download
   */
  exportData(data, filename, mimeType = 'application/json') {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Show notification (shared notification logic)
   */
  showNotification(message, type = 'info', duration = 3000) {
    // Try to find existing notification element
    let notification = document.getElementById('autofeel-notification');

    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'autofeel-notification';
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transition: all 0.3s;
      `;
      document.body.appendChild(notification);
    }

    // Set color based on type
    const colors = {
      success: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      error: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      info: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      loading: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
    };

    notification.style.background = colors[type] || colors.info;
    notification.textContent = message;
    notification.style.display = 'block';
    notification.style.opacity = '1';

    // Auto hide for success/error/info
    if (type !== 'loading' && duration > 0) {
      setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
          notification.style.display = 'none';
        }, 300);
      }, duration);
    }

    return notification;
  },

  /**
   * Hide notification
   */
  hideNotification() {
    const notification = document.getElementById('autofeel-notification');
    if (notification) {
      notification.style.opacity = '0';
      setTimeout(() => {
        notification.style.display = 'none';
      }, 300);
    }
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
