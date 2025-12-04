/**
 * Solver Integration
 * Integrates all Solver modules and provides easy-to-use API
 */

(function() {
  'use strict';

  // Initialize Solver modules
  const textSelector = new AutoFeelTextSelector();
  const problemSolver = new AutoFeelProblemSolver();
  const answerFiller = new AutoFeelAnswerFiller();
  const solverUI = new AutoFeelSolverUI();

  console.log('[Solver] Solver feature initialized');

  // Connect modules together

  // Store current question and answer for UI display
  let currentQuestion = '';
  let currentAnswer = '';

  // When batch processing is triggered (Option+X)
  textSelector.onBatchProcess = async (combinedQuestions, questionCount, screenshots) => {
    console.log(`[Solver] Processing batch of ${questionCount} questions with ${screenshots ? screenshots.length : 0} screenshots...`);
    console.log('[Solver] Combined text:', combinedQuestions.substring(0, 200) + '...');

    currentQuestion = combinedQuestions;
    currentAnswer = '';

    // Auto-solve the combined questions with screenshots
    try {
      const answer = await problemSolver.solveAuto(combinedQuestions, screenshots);

      // Check if answer is valid
      if (!answer) {
        console.log('[Solver] No answer generated (possibly already processing)');
        return;
      }

      // Save answer to buffer (no UI display)
      await answerFiller.setPendingAnswer(answer);

      // Store answer for later display
      currentAnswer = answer;

      // Update indicator to show success
      textSelector.updateIndicatorSuccess();

      console.log('[Solver] Answer ready in buffer');
    } catch (error) {
      console.error('[Solver] Failed to solve questions:', error);
    }
  };

  // When batch processing with input context is triggered (Option+Shift+X in input field)
  textSelector.onBatchProcessWithInput = async (combinedQuestions, questionCount, screenshots, targetField, inputContent) => {
    console.log(`[Solver] Processing with input context. Questions: ${questionCount}, Screenshots: ${screenshots ? screenshots.length : 0}`);

    try {
      const answer = await problemSolver.solveAuto(combinedQuestions, screenshots);

      if (!answer) {
        console.log('[Solver] No answer generated');
        textSelector.updateIndicatorError();
        return;
      }

      // Append answer to the input field
      if (targetField.isContentEditable || targetField.contentEditable === 'true') {
        // ContentEditable element
        const currentText = targetField.textContent || '';
        targetField.textContent = currentText + (currentText ? '\n\n' : '') + answer;

        // Trigger input event
        targetField.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        // Regular input/textarea
        const currentValue = targetField.value || '';
        targetField.value = currentValue + (currentValue ? '\n\n' : '') + answer;

        // Trigger input and change events
        targetField.dispatchEvent(new Event('input', { bubbles: true }));
        targetField.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Update indicator to show success
      textSelector.updateIndicatorSuccess();

      console.log('[Solver] Answer appended to input field');
    } catch (error) {
      console.error('[Solver] Failed to solve with input context:', error);
      textSelector.updateIndicatorError();
    }
  };

  // Listen for click on success indicator to show answer
  document.addEventListener('solver-show-answer', () => {
    if (currentAnswer) {
      // Show only answer in minimal UI (no question)
      solverUI.showAnswerOnly(currentAnswer);
    }
  });

  // Helper function to show toast notifications
  function showToast(message, color) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${color};
      color: white;
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 13px;
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

  function showErrorToast(message) {
    showToast(message, '#f44336');
  }

  function showSuccessToast(message) {
    showToast(message, '#4CAF50');
  }

  function showInfoToast(message) {
    showToast(message, '#2196F3');
  }

  // When user clicks "Fill Answer" button in UI
  document.addEventListener('solver-prepare-fill', (event) => {
    const answer = event.detail.answer;
    answerFiller.setPendingAnswer(answer);
  });

  // When answer is successfully filled
  answerFiller.onAnswerFilled = (field, answer) => {
    console.log('[Solver] Answer filled successfully');

    // Show success message
    solverUI.hide();
  };

  // Export Solver API to window for easy access
  window.AutoFeelSolver = {
    // Select text manually
    selectText: (text) => {
      textSelector.setSelectedText(text);
    },

    // Solve a question manually
    solve: async (questionText, options = {}) => {
      solverUI.showQuestion(questionText);
      const answer = await problemSolver.solve(questionText, options);
      solverUI.showAnswer(answer);
      return answer;
    },

    // Fill answer into a field
    fill: (field, answer) => {
      return answerFiller.fillField(field, answer);
    },

    // Get current state
    getQuestion: () => problemSolver.getCurrentQuestion(),
    getAnswer: () => problemSolver.getCurrentAnswer(),

    // UI controls
    showUI: () => solverUI.showQuestion(problemSolver.getCurrentQuestion()),
    hideUI: () => solverUI.hide()
  };

  console.log('[Solver] Solver API available at window.AutoFeelSolver');

  // Add keyboard shortcut for Solver (Option+Shift+S)
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 's') {
      // Show/hide Solver UI
      if (solverUI.isVisible()) {
        solverUI.hide();
      } else {
        const question = problemSolver.getCurrentQuestion();
        if (question) {
          solverUI.showQuestion(question);
          const answer = problemSolver.getCurrentAnswer();
          if (answer) {
            solverUI.showAnswer(answer);
          }
        }
      }
      e.preventDefault();
    }
  });

})();
