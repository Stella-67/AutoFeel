/**
 * Solver UI Module
 * Displays question and answer in a floating panel
 */

class SolverUI {
  constructor() {
    this.panelVisible = false;
    this.panel = null;
    this.currentQuestion = '';
    this.currentAnswer = '';
  }

  /**
   * Show solver panel with question
   */
  showQuestion(questionText) {
    this.currentQuestion = questionText;
    this.currentAnswer = '';
    this.createPanel();
    this.updatePanel();
  }

  /**
   * Update panel with answer
   */
  showAnswer(answerText) {
    this.currentAnswer = answerText;
    this.updatePanel();
  }

  /**
   * Create panel UI
   */
  createPanel() {
    if (this.panel) {
      return; // Panel already exists
    }

    // Create panel container
    this.panel = document.createElement('div');
    this.panel.id = 'solver-panel';
    this.panel.style.cssText = `
      position: fixed;
      top: 50%;
      right: 20px;
      transform: translateY(-50%);
      width: 400px;
      max-height: 80vh;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      animation: slideInRight 0.3s ease-out;
    `;

    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInRight {
        from {
          transform: translateY(-50%) translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateY(-50%) translateX(0);
          opacity: 1;
        }
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    // Create panel structure
    this.panel.innerHTML = `
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 16px; font-weight: 600;">🤖 AI Solver</h3>
        <button id="solver-close-btn" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 16px;">✕</button>
      </div>
      <div style="padding: 16px; max-height: calc(80vh - 60px); overflow-y: auto;">
        <div id="solver-question-section" style="margin-bottom: 16px;">
          <div style="font-size: 12px; font-weight: 600; color: #666; margin-bottom: 8px; text-transform: uppercase;">Question</div>
          <div id="solver-question" style="background: #f5f5f5; padding: 12px; border-radius: 8px; font-size: 14px; line-height: 1.5; max-height: 200px; overflow-y: auto;"></div>
        </div>
        <div id="solver-answer-section">
          <div style="font-size: 12px; font-weight: 600; color: #666; margin-bottom: 8px; text-transform: uppercase;">Answer</div>
          <div id="solver-answer" style="background: #e8f5e9; padding: 12px; border-radius: 8px; font-size: 14px; line-height: 1.5; max-height: 300px; overflow-y: auto; white-space: pre-wrap; font-family: 'Monaco', 'Menlo', monospace;"></div>
        </div>
        <div id="solver-loading" style="display: none; text-align: center; padding: 24px;">
          <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
          <div style="margin-top: 12px; color: #666; font-size: 14px;">Generating answer...</div>
        </div>
        <div id="solver-actions" style="display: none; margin-top: 16px; display: flex; gap: 8px;">
          <button id="solver-copy-btn" style="flex: 1; background: #667eea; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
            📋 Copy Answer
          </button>
          <button id="solver-fill-btn" style="flex: 1; background: #4CAF50; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
            ✏️ Fill Answer
          </button>
        </div>
      </div>
    `;

    // Add event listeners
    this.panel.querySelector('#solver-close-btn').addEventListener('click', () => {
      this.hide();
    });

    this.panel.querySelector('#solver-copy-btn').addEventListener('click', () => {
      this.copyAnswer();
    });

    this.panel.querySelector('#solver-fill-btn').addEventListener('click', () => {
      this.prepareToFill();
    });

    document.body.appendChild(this.panel);
    this.panelVisible = true;
  }

  /**
   * Update panel content
   */
  updatePanel() {
    if (!this.panel) return;

    const questionEl = this.panel.querySelector('#solver-question');
    const answerEl = this.panel.querySelector('#solver-answer');
    const loadingEl = this.panel.querySelector('#solver-loading');
    const answerSection = this.panel.querySelector('#solver-answer-section');
    const actionsEl = this.panel.querySelector('#solver-actions');

    // Update question
    if (this.currentQuestion) {
      questionEl.textContent = this.currentQuestion;
    }

    // Update answer
    if (this.currentAnswer) {
      loadingEl.style.display = 'none';
      answerSection.style.display = 'block';
      answerEl.textContent = this.currentAnswer;
      actionsEl.style.display = 'flex';
    } else {
      loadingEl.style.display = 'block';
      answerSection.style.display = 'none';
      actionsEl.style.display = 'none';
    }
  }

  /**
   * Show loading state
   */
  showLoading() {
    if (!this.panel) return;
    const loadingEl = this.panel.querySelector('#solver-loading');
    loadingEl.style.display = 'block';
  }

  /**
   * Hide panel
   */
  hide() {
    if (this.panel) {
      this.panel.style.animation = 'slideOutRight 0.3s ease-in';
      setTimeout(() => {
        this.panel.remove();
        this.panel = null;
        this.panelVisible = false;
      }, 300);
    }
  }

  /**
   * Copy answer to clipboard
   */
  async copyAnswer() {
    if (!this.currentAnswer) return;

    try {
      await navigator.clipboard.writeText(this.currentAnswer);
      this.showToast('✓ Answer copied to clipboard', 'success');
    } catch (error) {
      console.error('[Solver] Failed to copy:', error);
      this.showToast('✗ Failed to copy answer', 'error');
    }
  }

  /**
   * Prepare to fill answer (trigger AnswerFiller)
   */
  prepareToFill() {
    if (!this.currentAnswer) return;

    // Dispatch custom event for AnswerFiller to catch
    const event = new CustomEvent('solver-prepare-fill', {
      detail: { answer: this.currentAnswer }
    });
    document.dispatchEvent(event);

    this.showToast('Option+Shift+Click on a field to fill the answer', 'info');
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
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 999999;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Check if panel is visible
   */
  isVisible() {
    return this.panelVisible;
  }

  /**
   * Show answer only in minimal UI (black background, white text)
   */
  showAnswerOnly(answerText) {
    // Remove existing panel if any
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }

    // Create minimal panel
    this.panel = document.createElement('div');
    this.panel.id = 'solver-panel';
    this.panel.style.cssText = `
      position: fixed;
      right: 30px;
      bottom: 80px;
      width: 200px;
      max-height: 20vh;
      background: #fff;
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      animation: fadeIn 0.2s ease-out;
    `;

    this.panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid #f0f0f0;">
        <div style="color: #999; font-size: 11px; font-weight: 500;">Answer</div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button id="solver-copy-btn" style="background: transparent; color: #999; border: 1px solid #e5e5e5; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: 500; transition: all 0.2s;">
            Copy
          </button>
          <button id="solver-close-btn" style="background: transparent; border: none; color: #ccc; width: 20px; height: 20px; cursor: pointer; font-size: 16px; padding: 0;">✕</button>
        </div>
      </div>
      <div style="padding: 14px; max-height: calc(80vh - 50px); overflow-y: auto;">
        <div id="solver-answer-text" style="color: #888; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word;"></div>
      </div>
    `;

    // Set answer text
    this.panel.querySelector('#solver-answer-text').textContent = answerText;

    // Add event listeners
    this.panel.querySelector('#solver-close-btn').addEventListener('click', () => {
      this.hide();
    });

    this.panel.querySelector('#solver-copy-btn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(answerText);
        const btn = this.panel.querySelector('#solver-copy-btn');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.color = '#666';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.color = '#999';
        }, 1500);
      } catch (error) {
        console.error('[Solver] Failed to copy:', error);
      }
    });

    // Add hover effect for copy button
    const copyBtn = this.panel.querySelector('#solver-copy-btn');
    copyBtn.addEventListener('mouseenter', () => {
      if (copyBtn.textContent === 'Copy') {
        copyBtn.style.background = '#f5f5f5';
        copyBtn.style.borderColor = '#ddd';
      }
    });
    copyBtn.addEventListener('mouseleave', () => {
      if (copyBtn.textContent === 'Copy') {
        copyBtn.style.background = 'transparent';
        copyBtn.style.borderColor = '#e5e5e5';
      }
    });

    // Add fadeIn animation
    if (!document.getElementById('solver-minimal-style')) {
      const style = document.createElement('style');
      style.id = 'solver-minimal-style';
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-50%) translateX(20px); }
          to { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(this.panel);
    this.panelVisible = true;
  }
}

// Add CSS animation for slide out
const slideOutStyle = document.createElement('style');
slideOutStyle.textContent = `
  @keyframes slideOutRight {
    from {
      transform: translateY(-50%) translateX(0);
      opacity: 1;
    }
    to {
      transform: translateY(-50%) translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(slideOutStyle);

// Export for use in content script
window.AutoFeelSolverUI = SolverUI;
