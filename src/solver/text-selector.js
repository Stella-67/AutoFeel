/**
 * Text Selector Module
 * Handles text selection for Solver feature
 * Supports Option+Shift+drag selection (Option+Shift+Click is for filling answers)
 */

class TextSelector {
  constructor() {
    this.selectedText = '';
    this.selectionMode = false;
    this.onTextSelected = null; // Callback when text is selected
    this.onTextHighlighted = null; // Callback when text is highlighted (before solving)
    this.onBatchProcess = null; // Callback when Option+X is pressed to process all collected questions
    this.hintBadge = null; // The hint badge element
    this.lastSelectedText = ''; // Track last selected text to prevent duplicates
    this.lastSelectionTime = 0; // Track last selection time for debouncing
    this.collectedQuestions = []; // Store collected questions
    this.screenshots = []; // Store screenshots
    this.init();
  }

  init() {
    // Listen for text selection with Option+Shift keys (Option+Shift+drag)
    document.addEventListener('mouseup', (e) => {
      // Only trigger when Option/Alt + Shift keys are pressed
      if (e.altKey && e.shiftKey) {
        this.handleTextSelection();
      }
    });

    // Listen for Option+X to process all collected questions
    document.addEventListener('keydown', (e) => {
      // Debug logging
      if (e.altKey) {
        console.log('[Solver] Alt key pressed with:', e.key, e.code, e.keyCode);
      }

      // Check for X key with multiple conditions
      if (e.altKey && (e.key === 'x' || e.key === 'X' || e.code === 'KeyX' || e.keyCode === 88)) {
        if (e.shiftKey) {
          // Option+Shift+X: Process with input context
          console.log('[Solver] Option+Shift+X detected, processing with input context...');
          e.preventDefault();
          e.stopPropagation();
          this.processBatchWithInputContext(e.target);
        } else {
          // Option+X: Normal batch processing
          console.log('[Solver] Option+X detected, processing batch...');
          e.preventDefault();
          e.stopPropagation();
          this.processBatch();
        }
      }

      // Check for Shift+S key to take screenshot
      if (e.altKey && e.shiftKey && (e.key === 's' || e.key === 'S' || e.code === 'KeyS' || e.keyCode === 83)) {
        console.log('[Solver] Option+Shift+S detected, starting area selection...');
        e.preventDefault();
        e.stopPropagation();
        this.startAreaSelection();
      }
    }, true); // Use capture phase
  }

  /**
   * Start area selection for screenshot
   */
  startAreaSelection() {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'solver-screenshot-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.3);
      z-index: 999999;
      cursor: crosshair;
    `;

    // Create selection box
    const selectionBox = document.createElement('div');
    selectionBox.id = 'solver-selection-box';
    selectionBox.style.cssText = `
      position: fixed;
      border: 2px solid #667eea;
      background: rgba(102, 126, 234, 0.1);
      display: none;
      z-index: 1000000;
      pointer-events: none;
    `;

    // Create hint text
    const hintText = document.createElement('div');
    hintText.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 1000001;
      pointer-events: none;
    `;
    hintText.textContent = 'Drag to select area for screenshot (ESC to cancel)';

    document.body.appendChild(overlay);
    document.body.appendChild(selectionBox);
    document.body.appendChild(hintText);

    let startX = 0;
    let startY = 0;
    let isSelecting = false;

    const onMouseDown = (e) => {
      isSelecting = true;
      startX = e.clientX;
      startY = e.clientY;
      selectionBox.style.display = 'block';
      selectionBox.style.left = startX + 'px';
      selectionBox.style.top = startY + 'px';
      selectionBox.style.width = '0px';
      selectionBox.style.height = '0px';
    };

    const onMouseMove = (e) => {
      if (!isSelecting) return;

      const currentX = e.clientX;
      const currentY = e.clientY;

      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);

      selectionBox.style.left = left + 'px';
      selectionBox.style.top = top + 'px';
      selectionBox.style.width = width + 'px';
      selectionBox.style.height = height + 'px';
    };

    const onMouseUp = async (e) => {
      if (!isSelecting) return;
      isSelecting = false;

      const currentX = e.clientX;
      const currentY = e.clientY;

      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);

      // Clean up UI
      cleanup();

      // Only capture if area is large enough
      if (width > 10 && height > 10) {
        await this.captureArea(left, top, width, height);
      } else {
        this.showTemporaryMessage('Selection too small');
      }
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        this.showTemporaryMessage('Screenshot cancelled');
      }
    };

    const cleanup = () => {
      overlay.remove();
      selectionBox.remove();
      hintText.remove();
      overlay.removeEventListener('mousedown', onMouseDown);
      overlay.removeEventListener('mousemove', onMouseMove);
      overlay.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
    };

    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
  }

  /**
   * Capture selected area as screenshot
   */
  async captureArea(left, top, width, height) {
    try {
      // Request full screenshot from background, then crop it
      const response = await chrome.runtime.sendMessage({
        action: 'CAPTURE_SCREENSHOT'
      });

      if (!response.success || !response.screenshot) {
        console.error('[Solver] Failed to capture screenshot:', response.error);
        this.showTemporaryMessage('Failed to capture screenshot');
        return;
      }

      // Crop the screenshot to selected area
      const croppedImage = await this.cropScreenshot(response.screenshot, left, top, width, height);

      if (croppedImage) {
        this.screenshots.push(croppedImage);
        console.log(`[Solver] Screenshot captured (${this.screenshots.length} total)`);
        this.showTemporaryMessage(`Screenshot captured (${this.screenshots.length})`);
      } else {
        this.showTemporaryMessage('Failed to crop screenshot');
      }
    } catch (error) {
      console.error('[Solver] Error capturing screenshot:', error);
      this.showTemporaryMessage('Error capturing screenshot');
    }
  }

  /**
   * Crop screenshot to selected area
   */
  async cropScreenshot(dataUrl, left, top, width, height) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Get device pixel ratio for high DPI screens
        const dpr = window.devicePixelRatio || 1;

        // Calculate coordinates in screenshot (considering device pixel ratio)
        const cropX = left * dpr;
        const cropY = top * dpr;
        const cropWidth = width * dpr;
        const cropHeight = height * dpr;

        // Create canvas for cropped image
        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;
        const ctx = canvas.getContext('2d');

        // Draw cropped portion
        ctx.drawImage(
          img,
          cropX, cropY, cropWidth, cropHeight,
          0, 0, cropWidth, cropHeight
        );

        // Convert to data URL
        const croppedDataUrl = canvas.toDataURL('image/png');
        resolve(croppedDataUrl);
      };
      img.onerror = () => {
        console.error('[Solver] Failed to load image for cropping');
        resolve(null);
      };
      img.src = dataUrl;
    });
  }

  /**
   * Handle Option+Shift+Click to select element text
   * NOTE: This method is currently not used. Option+Shift+Click is reserved for filling answers.
   * Kept for potential future use or manual invocation.
   */
  handleOptionClick(event) {
    const target = event.target;

    // Get text content from clicked element
    let text = '';

    // Try to get text from various elements
    if (target.tagName === 'PRE' || target.tagName === 'CODE') {
      // Code block
      text = target.textContent.trim();
    } else if (target.closest('[role="article"]') || target.closest('.post') || target.closest('.question')) {
      // Discussion post or question
      const container = target.closest('[role="article"], .post, .question');
      text = this.extractStructuredText(container);
    } else {
      // Regular text element
      text = target.textContent.trim();
    }

    if (text && text.length > 0) {
      this.setSelectedText(text);
      this.showSelectionConfirmation(event.clientX, event.clientY);
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /**
   * Handle text selection via drag
   */
  handleTextSelection() {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text && text.length > 10) { // Minimum length to avoid accidental selections
      // Add to collected questions (don't send to LLM yet)
      this.collectedQuestions.push(text);

      // Get selection position for indicator
      try {
        const range = selection.getRangeAt(0);
        const rects = range.getClientRects();

        if (rects.length > 0) {
          const lastRect = rects[rects.length - 1];
          // Show indicator that question is collected
          this.showCollectedIndicator(lastRect.right, lastRect.top, this.collectedQuestions.length);
        } else {
          // Fallback to fixed position if no rects available
          this.showCollectedIndicator(window.innerWidth - 100, 100, this.collectedQuestions.length);
        }
      } catch (e) {
        // Fallback position on error
        this.showCollectedIndicator(window.innerWidth - 100, 100, this.collectedQuestions.length);
      }

      console.log(`[Solver] Collected question ${this.collectedQuestions.length}:`, text.substring(0, 50) + '...');
    }
  }

  /**
   * Process batch with input field context (triggered by Option+Shift+X in input field)
   */
  async processBatchWithInputContext(targetElement) {
    // Check if target is an input field
    const isInputField = targetElement && (
      targetElement.tagName === 'INPUT' ||
      targetElement.tagName === 'TEXTAREA' ||
      targetElement.isContentEditable ||
      targetElement.contentEditable === 'true'
    );

    if (!isInputField) {
      this.showTemporaryMessage('Option+Shift+X must be used in an input field');
      return;
    }

    // Check if there's anything collected
    if (this.collectedQuestions.length === 0 && this.screenshots.length === 0) {
      this.showTemporaryMessage('No content collected. Use Option+Shift+drag or Option+Shift+S first.');
      return;
    }

    // Get current input content
    let inputContent = '';
    if (targetElement.isContentEditable || targetElement.contentEditable === 'true') {
      inputContent = targetElement.textContent || '';
    } else {
      inputContent = targetElement.value || '';
    }

    console.log(`[Solver] Processing with input context. Input content length: ${inputContent.length}`);

    // Combine collected questions
    let combinedText = '';
    if (this.collectedQuestions.length > 0) {
      combinedText = this.collectedQuestions
        .map((q, i) => `Question ${i + 1}:\n${q}`)
        .join('\n\n---\n\n');
      combinedText += '\n\n---\n\n';
    }

    // Add input context
    if (inputContent.trim()) {
      combinedText += `Current input content:\n${inputContent}\n\n`;
    }

    combinedText += 'Please continue or complete the response based on the above information.';

    // Get references for later use
    const questionCount = this.collectedQuestions.length;
    const screenshots = [...this.screenshots];
    const targetField = targetElement;

    // Clear collected data
    this.collectedQuestions = [];
    this.screenshots = [];

    // Hide all indicators
    this.hideHintBadge();

    // Show processing indicator
    this.showFixedProcessingIndicator();

    // Trigger solving with input context
    if (this.onBatchProcessWithInput) {
      this.onBatchProcessWithInput(combinedText, questionCount, screenshots, targetField, inputContent);
    }
  }

  /**
   * Process all collected questions (triggered by Option+X)
   */
  processBatch() {
    // Check if there's anything to process
    if (this.collectedQuestions.length === 0 && this.screenshots.length === 0) {
      console.log('[Solver] Nothing collected');
      this.showTemporaryMessage('Nothing collected. Use Option+Shift+drag to select text or Option+Shift+S to capture screenshots.');
      return;
    }

    console.log(`[Solver] Processing ${this.collectedQuestions.length} questions and ${this.screenshots.length} screenshots...`);

    // Combine all questions with numbering
    let combinedText = '';
    if (this.collectedQuestions.length > 0 && this.screenshots.length > 0) {
      // Both text questions and screenshots
      combinedText = `I have ${this.collectedQuestions.length} text question(s) and ${this.screenshots.length} screenshot(s).\n\n`;
      combinedText += '=== TEXT QUESTIONS ===\n\n';
      combinedText += this.collectedQuestions
        .map((q, i) => `Question ${i + 1}:\n${q}`)
        .join('\n\n---\n\n');
      combinedText += '\n\n=== SCREENSHOTS ===\n';
      combinedText += `Please also refer to the ${this.screenshots.length} screenshot(s) provided below for additional context or visual information.`;
    } else if (this.collectedQuestions.length > 0) {
      // Only text questions, no screenshots
      combinedText = this.collectedQuestions
        .map((q, i) => `Question ${i + 1}:\n${q}`)
        .join('\n\n---\n\n');
    } else if (this.screenshots.length > 0) {
      // Only screenshots, no text questions
      combinedText = 'Please analyze the provided screenshot(s) and provide relevant information or answers.';
    }

    // Clear collected questions and screenshots
    const questionCount = this.collectedQuestions.length;
    const screenshots = [...this.screenshots]; // Copy screenshots
    this.collectedQuestions = [];
    this.screenshots = [];

    // Hide all indicators
    this.hideHintBadge();

    // Show processing indicator at fixed position (bottom right)
    this.showFixedProcessingIndicator();

    // Trigger solving with combined questions and screenshots
    if (this.onBatchProcess) {
      this.onBatchProcess(combinedText, questionCount, screenshots);
    }
  }

  /**
   * Show processing indicator at fixed position
   */
  showFixedProcessingIndicator() {
    this.hideHintBadge();

    this.hintBadge = document.createElement('div');
    this.hintBadge.id = 'solver-hint-badge';
    this.hintBadge.style.cssText = `
      position: fixed;
      right: 30px;
      bottom: 30px;
      color: #999;
      font-size: 11px;
      font-weight: bold;
      z-index: 999999;
      cursor: default;
      user-select: none;
      opacity: 0.7;
      line-height: 1;
      pointer-events: none;
    `;
    this.hintBadge.textContent = '?';

    document.body.appendChild(this.hintBadge);
  }

  /**
   * Extract structured text from container (preserves formatting)
   */
  extractStructuredText(container) {
    let text = '';

    // Extract title if exists
    const title = container.querySelector('h1, h2, h3, .title, [class*="title"]');
    if (title) {
      text += title.textContent.trim() + '\n\n';
    }

    // Extract main content
    const content = container.querySelector('.content, .body, [class*="content"], [class*="body"]') || container;

    // Process code blocks separately
    const codeBlocks = content.querySelectorAll('pre, code');
    codeBlocks.forEach((block, index) => {
      block.setAttribute('data-code-block', index);
    });

    text += content.textContent
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    return text;
  }

  /**
   * Set selected text and trigger callback
   */
  setSelectedText(text) {
    this.selectedText = text;
    console.log('[Solver] Text selected:', text.substring(0, 100) + '...');

    if (this.onTextSelected) {
      this.onTextSelected(text);
    }
  }

  /**
   * Get currently selected text
   */
  getSelectedText() {
    return this.selectedText;
  }

  /**
   * Clear selected text
   */
  clearSelection() {
    this.selectedText = '';
  }

  /**
   * Show indicator that question is collected
   */
  showCollectedIndicator(x, y, count) {
    // Remove existing indicator if any
    this.hideHintBadge();

    // Create minimal indicator showing collection count
    this.hintBadge = document.createElement('div');
    this.hintBadge.id = 'solver-hint-badge';
    this.hintBadge.style.cssText = `
      position: fixed;
      left: ${x + 3}px;
      top: ${y}px;
      color: #667eea;
      font-size: 11px;
      font-weight: bold;
      z-index: 999999;
      cursor: default;
      user-select: none;
      opacity: 0.8;
      line-height: 1;
      pointer-events: none;
    `;
    this.hintBadge.textContent = `${count}`;

    document.body.appendChild(this.hintBadge);

    // Auto-fade after 3 seconds
    setTimeout(() => {
      if (this.hintBadge) {
        this.hintBadge.style.transition = 'opacity 0.3s';
        this.hintBadge.style.opacity = '0';
        setTimeout(() => this.hideHintBadge(), 300);
      }
    }, 3000);
  }

  /**
   * Show temporary message
   */
  showTemporaryMessage(message) {
    const msgBox = document.createElement('div');
    msgBox.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 20px 30px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 9999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    msgBox.textContent = message;
    document.body.appendChild(msgBox);

    setTimeout(() => {
      msgBox.style.transition = 'opacity 0.3s';
      msgBox.style.opacity = '0';
      setTimeout(() => msgBox.remove(), 300);
    }, 2000);
  }

  /**
   * Show small processing indicator
   * A subtle icon to indicate answer is being generated
   */
  showProcessingIndicator(x, y) {
    // Remove existing indicator if any
    this.hideHintBadge();

    // Create minimal indicator
    this.hintBadge = document.createElement('div');
    this.hintBadge.id = 'solver-hint-badge';
    this.hintBadge.style.cssText = `
      position: fixed;
      left: ${x + 3}px;
      top: ${y}px;
      color: #999;
      font-size: 11px;
      font-weight: bold;
      z-index: 999999;
      cursor: default;
      user-select: none;
      opacity: 0.7;
      line-height: 1;
      pointer-events: none;
    `;
    this.hintBadge.textContent = '?';

    document.body.appendChild(this.hintBadge);

    // Don't auto-hide - will be updated when answer is ready
  }

  /**
   * Update indicator to show success
   */
  updateIndicatorSuccess() {
    if (this.hintBadge) {
      this.hintBadge.textContent = '!';
      this.hintBadge.style.color = '#666';
      this.hintBadge.style.cursor = 'pointer';
      this.hintBadge.style.pointerEvents = 'auto';

      // Add click handler to show answer
      this.hintBadge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Hide the indicator immediately
        this.hideHintBadge();

        // Trigger event to show solver UI
        const event = new CustomEvent('solver-show-answer');
        document.dispatchEvent(event);
      });

      // Don't auto-hide - will be hidden when selection is cleared or new selection is made
    }
  }

  /**
   * Update indicator to show error
   */
  updateIndicatorError() {
    if (this.hintBadge) {
      this.hintBadge.textContent = '✗';
      this.hintBadge.style.color = '#d32f2f';

      // Auto-hide after 2 seconds
      setTimeout(() => {
        this.hideHintBadge();
      }, 2000);
    }
  }

  /**
   * Hide hint badge / indicator
   */
  hideHintBadge() {
    if (this.hintBadge && this.hintBadge.parentNode) {
      this.hintBadge.remove();
    }
    this.hintBadge = null;
  }

  /**
   * Show visual confirmation of text selection
   */
  showSelectionConfirmation(x, y) {
    // Remove existing confirmation if any
    const existing = document.getElementById('solver-selection-confirm');
    if (existing) {
      existing.remove();
    }

    // Create confirmation tooltip
    const tooltip = document.createElement('div');
    tooltip.id = 'solver-selection-confirm';
    tooltip.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      background: #4CAF50;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 999999;
      pointer-events: none;
      animation: fadeInOut 2s ease-in-out;
    `;
    tooltip.textContent = '✓ Question selected';

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInOut {
        0%, 100% { opacity: 0; transform: translateY(10px); }
        10%, 90% { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(tooltip);

    // Remove after animation
    setTimeout(() => {
      tooltip.remove();
      style.remove();
    }, 2000);
  }
}

// Export for use in content script
window.AutoFeelTextSelector = TextSelector;
