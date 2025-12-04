/**
 * Problem Solver Module
 * Handles problem solving using LLM
 * Generates answers for selected questions
 */

class ProblemSolver {
  constructor() {
    this.currentQuestion = '';
    this.currentAnswer = '';
    this.isProcessing = false;
    this.onAnswerGenerated = null; // Callback when answer is ready
  }

  /**
   * Solve a problem using LLM
   * @param {string} questionText - The question/problem text
   * @param {Object} options - Additional options
   * @returns {Promise<string>} - The generated answer
   */
  async solve(questionText, options = {}) {
    if (this.isProcessing) {
      console.log('[Solver] Already processing a question...');
      return null;
    }

    this.isProcessing = true;
    this.currentQuestion = questionText;

    try {
      console.log('[Solver] Solving question:', questionText.substring(0, 100) + '...');

      // Build system prompt for problem solving
      const systemPrompt = this.buildSystemPrompt(options);

      // Build user prompt
      const userPrompt = this.buildUserPrompt(questionText, options);

      // Call LLM via background script
      const response = await this.callLLM(systemPrompt, userPrompt, options);

      this.currentAnswer = response;

      if (this.onAnswerGenerated) {
        this.onAnswerGenerated(response);
      }

      console.log('[Solver] Answer generated:', response.substring(0, 100) + '...');

      return response;
    } catch (error) {
      console.error('[Solver] Error solving problem:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Build system prompt based on problem type
   */
  buildSystemPrompt(options = {}) {
    const { type = 'general', format = 'text' } = options;

    let prompt = 'You are an expert problem solver assistant. ';

    switch (type) {
      case 'code':
        prompt += 'You specialize in programming and computer science. Provide clear, correct, and well-commented code solutions. ';
        break;
      case 'math':
        prompt += 'You specialize in mathematics. Provide step-by-step solutions with clear explanations. ';
        break;
      case 'essay':
        prompt += 'You specialize in writing. Provide well-structured, coherent responses. ';
        break;
      default:
        prompt += 'Provide clear, accurate, and helpful answers. ';
    }

    switch (format) {
      case 'code':
        prompt += 'Return ONLY the code without explanations unless specifically requested. ';
        break;
      case 'short':
        prompt += 'Keep your answer concise and to the point. ';
        break;
      case 'detailed':
        prompt += 'Provide detailed explanations and reasoning. ';
        break;
    }

    return prompt.trim();
  }

  /**
   * Build user prompt from question text
   */
  buildUserPrompt(questionText, options = {}) {
    const { context = '', constraints = '' } = options;

    let prompt = questionText;

    if (context) {
      prompt = `Context:\n${context}\n\nQuestion:\n${prompt}`;
    }

    if (constraints) {
      prompt += `\n\nConstraints:\n${constraints}`;
    }

    return prompt;
  }

  /**
   * Call LLM via background script
   */
  async callLLM(systemPrompt, userPrompt, options = {}) {
    return new Promise((resolve, reject) => {
      // Send message to background script
      chrome.runtime.sendMessage({
        action: 'SOLVE_PROBLEM',
        systemPrompt,
        userPrompt,
        options,
        screenshots: options.screenshots || []
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        resolve(response.answer);
      });
    });
  }

  /**
   * Get current question
   */
  getCurrentQuestion() {
    return this.currentQuestion;
  }

  /**
   * Get current answer
   */
  getCurrentAnswer() {
    return this.currentAnswer;
  }

  /**
   * Check if currently processing
   */
  isProcessing() {
    return this.isProcessing;
  }

  /**
   * Clear current question and answer
   */
  clear() {
    this.currentQuestion = '';
    this.currentAnswer = '';
  }

  /**
   * Auto-detect problem type from question text
   */
  detectProblemType(questionText) {
    const text = questionText.toLowerCase();

    // Check for code-related keywords
    const codeKeywords = ['function', 'class', 'variable', 'loop', 'algorithm', 'code', 'program', 'implement'];
    if (codeKeywords.some(keyword => text.includes(keyword))) {
      return 'code';
    }

    // Check for math-related keywords
    const mathKeywords = ['calculate', 'solve', 'equation', 'formula', 'prove', 'theorem'];
    if (mathKeywords.some(keyword => text.includes(keyword))) {
      return 'math';
    }

    // Check for essay-related keywords
    const essayKeywords = ['explain', 'discuss', 'analyze', 'describe', 'compare', 'essay'];
    if (essayKeywords.some(keyword => text.includes(keyword))) {
      return 'essay';
    }

    return 'general';
  }

  /**
   * Solve with auto-detected type
   */
  async solveAuto(questionText, screenshots = [], options = {}) {
    const type = this.detectProblemType(questionText);
    return this.solve(questionText, { ...options, type, screenshots });
  }
}

// Export for use in content script
window.AutoFeelProblemSolver = ProblemSolver;
