/**
 * Answer Filler Module
 * Handles filling answers into target fields
 * Supports text inputs, textareas, code editors, terminals, etc.
 */

class AnswerFiller {
  constructor() {
    this.pendingAnswer = '';
    this.fillMode = false;
    this.onAnswerFilled = null; // Callback when answer is filled
    this.init();
  }

  async init() {
    // Load answer buffer from storage on initialization
    await this.loadAnswerBuffer();

    // Listen for Option+Shift+Click on input fields
    document.addEventListener('click', (e) => {
      if (e.altKey && e.shiftKey && this.pendingAnswer) {
        this.handleOptionClickFill(e);
      }
    }, true); // Use capture phase to catch events before other handlers

    // Listen for storage changes (in case answer is set from another tab)
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.solverAnswerBuffer) {
        const newAnswer = changes.solverAnswerBuffer.newValue;
        if (newAnswer && newAnswer.answer) {
          this.pendingAnswer = newAnswer.answer;
          this.fillMode = true;
          // Don't show fill mode indicator
          // this.showFillModeIndicator();
        } else {
          this.clearPendingAnswer();
        }
      }
    });
  }

  /**
   * Load answer buffer from chrome.storage
   */
  async loadAnswerBuffer() {
    try {
      const result = await chrome.storage.local.get('solverAnswerBuffer');
      if (result.solverAnswerBuffer && result.solverAnswerBuffer.answer) {
        this.pendingAnswer = result.solverAnswerBuffer.answer;
        this.fillMode = true;
        // Don't show fill mode indicator - user can see status from text selector indicator
        // this.showFillModeIndicator();
        console.log('[Solver] Loaded answer buffer from storage:', this.pendingAnswer.substring(0, 100) + '...');
      }
    } catch (error) {
      console.error('[Solver] Error loading answer buffer:', error);
    }
  }

  /**
   * Save answer buffer to chrome.storage
   */
  async saveAnswerBuffer(answer) {
    try {
      await chrome.storage.local.set({
        solverAnswerBuffer: {
          answer: answer,
          timestamp: Date.now()
        }
      });
      console.log('[Solver] Saved answer to buffer:', answer.substring(0, 100) + '...');
    } catch (error) {
      console.error('[Solver] Error saving answer buffer:', error);
    }
  }

  /**
   * Set answer to be filled (from ProblemSolver)
   */
  async setPendingAnswer(answer) {
    // Validate answer
    if (!answer || typeof answer !== 'string') {
      console.warn('[Solver] Invalid answer provided:', answer);
      return;
    }

    this.pendingAnswer = answer;
    this.fillMode = true;
    console.log('[Solver] Answer ready to fill:', answer.substring(0, 100) + '...');

    // Save to storage for cross-page persistence
    await this.saveAnswerBuffer(answer);

    // Don't show fill mode indicator - user can see status from text selector indicator
    // this.showFillModeIndicator();
  }

  /**
   * Handle Option+Shift+Click to fill answer into field
   */
  async handleOptionClickFill(event) {
    const target = event.target;

    // Check if clicked element is an input field
    const field = this.findInputField(target);

    if (field) {
      event.preventDefault();
      event.stopPropagation();

      await this.fillField(field, this.pendingAnswer);

      // Clear pending answer after successful fill
      this.clearPendingAnswer();
    }
  }

  /**
   * Find input field from clicked element
   */
  findInputField(element) {
    // Direct input elements
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return element;
    }

    // Monaco Editor
    if (element.classList.contains('inputarea') || element.closest('.monaco-editor')) {
      const editor = element.closest('.monaco-editor');
      if (editor) {
        return editor.querySelector('.inputarea');
      }
    }

    // Terminal
    if (element.classList.contains('inputHost_Eupgu') || element.closest('.terminal')) {
      const terminal = element.closest('.terminal');
      if (terminal) {
        return terminal.querySelector('textarea, input');
      }
    }

    // Check if clicked inside a contenteditable element
    if (element.isContentEditable || element.closest('[contenteditable="true"]')) {
      return element.isContentEditable ? element : element.closest('[contenteditable="true"]');
    }

    // Check parent elements for input fields
    const parent = element.closest('label, .input-wrapper, .field-wrapper');
    if (parent) {
      const input = parent.querySelector('input, textarea');
      if (input) {
        return input;
      }
    }

    return null;
  }

  /**
   * Fill answer into field
   */
  async fillField(field, answer) {
    console.log('[Solver] Filling answer into field:', field);

    try {
      // Handle different field types
      if (field.isContentEditable || field.contentEditable === 'true') {
        // ContentEditable element
        await this.fillContentEditable(field, answer);
      } else if (field.classList.contains('inputarea')) {
        // Monaco Editor
        await this.fillMonacoEditor(field, answer);
      } else if (field.classList.contains('inputHost_Eupgu')) {
        // Terminal
        await this.fillTerminal(field, answer);
      } else if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') {
        // Regular input/textarea
        await this.fillTextInput(field, answer);
      }

      // Show success feedback
      this.showFillSuccess(field);

      if (this.onAnswerFilled) {
        this.onAnswerFilled(field, answer);
      }
    } catch (error) {
      console.error('[Solver] Error filling field:', error);
      this.showFillError(field);
    }
  }

  /**
   * Fill field directly without typing simulation
   */
  async simulateTyping(field, text) {
    field.focus();

    // Set value directly
    field.value = text;

    // Trigger input event
    field.dispatchEvent(new Event('input', { bubbles: true }));

    // Trigger change event
    field.dispatchEvent(new Event('change', { bubbles: true }));

    // For React/Vue compatibility - trigger native setter
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      field.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      'value'
    ).set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(field, text);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /**
   * Fill text input or textarea
   */
  async fillTextInput(field, text) {
    await this.simulateTyping(field, text);
  }

  /**
   * Fill Monaco Editor
   */
  async fillMonacoEditor(field, code) {
    await this.simulateTyping(field, code);
  }

  /**
   * Fill Terminal
   */
  async fillTerminal(field, command) {
    await this.simulateTyping(field, command);
  }

  /**
   * Fill ContentEditable element
   */
  async fillContentEditable(element, text) {
    element.focus();
    element.textContent = '';

    for (let i = 0; i < text.length; i++) {
      element.textContent += text[i];
      element.dispatchEvent(new Event('input', { bubbles: true }));

      // Random delay between 80-150ms
      const delay = Math.random() * 70 + 80;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Clear pending answer
   */
  async clearPendingAnswer() {
    this.pendingAnswer = '';
    this.fillMode = false;
    this.hideFillModeIndicator();

    // Clear from storage
    try {
      await chrome.storage.local.remove('solverAnswerBuffer');
      console.log('[Solver] Cleared answer buffer from storage');
    } catch (error) {
      console.error('[Solver] Error clearing answer buffer:', error);
    }
  }

  /**
   * Check if in fill mode
   */
  isInFillMode() {
    return this.fillMode && this.pendingAnswer;
  }

  /**
   * Get pending answer (for external use)
   */
  getPendingAnswer() {
    return this.pendingAnswer;
  }

  /**
   * Show fill mode indicator
   */
  showFillModeIndicator() {
    // Remove existing indicator
    const existing = document.getElementById('solver-fill-mode-indicator');
    if (existing) {
      existing.remove();
    }

    // Create indicator
    const indicator = document.createElement('div');
    indicator.id = 'solver-fill-mode-indicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 999999;
      cursor: pointer;
      animation: pulse 2s ease-in-out infinite;
    `;
    indicator.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px;">📝</span>
        <span>Option+Shift+Click to fill answer</span>
        <button style="margin-left: 8px; background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer;">✕</button>
      </div>
    `;

    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
        50% { box-shadow: 0 4px 20px rgba(102, 126, 234, 0.6); }
      }
    `;
    document.head.appendChild(style);

    // Click to dismiss
    indicator.querySelector('button').addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearPendingAnswer();
    });

    document.body.appendChild(indicator);
  }

  /**
   * Hide fill mode indicator
   */
  hideFillModeIndicator() {
    const indicator = document.getElementById('solver-fill-mode-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  /**
   * Show fill success feedback
   */
  showFillSuccess(field) {
    // Highlight field with green border
    const originalBorder = field.style.border;
    field.style.border = '2px solid #4CAF50';
    field.style.transition = 'border 0.3s ease';

    setTimeout(() => {
      field.style.border = originalBorder;
    }, 2000);

    // Don't show toast - visual feedback from border is enough
    // this.showToast('✓ Answer filled successfully', 'success');
  }

  /**
   * Show fill error feedback
   */
  showFillError(field) {
    // Highlight field with red border
    const originalBorder = field.style.border;
    field.style.border = '2px solid #f44336';

    setTimeout(() => {
      field.style.border = originalBorder;
    }, 2000);

    // Show error message
    this.showToast('✗ Failed to fill answer', 'error');
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 999999;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
}

// Export for use in content script
window.AutoFeelAnswerFiller = AnswerFiller;
