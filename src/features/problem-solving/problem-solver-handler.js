// ==================== Problem Solver Handler ====================
// Handles problem solving requests from Solver feature

/**
 * Handle problem solving request from Solver feature
 * @param {string} systemPrompt - System prompt for problem type
 * @param {string} userPrompt - User's question
 * @param {Object} options - Additional options
 * @param {Array<string>} screenshots - Array of screenshot data URLs
 * @returns {Promise<string>} - Generated answer
 */
async function handleSolveProblem(systemPrompt, userPrompt, options = {}, screenshots = []) {
  try {
    console.log('[ProblemSolver] Solving problem...');
    if (screenshots && screenshots.length > 0) {
      console.log(`[ProblemSolver] Including ${screenshots.length} screenshots`);
    }

    // Get LLM configuration
    const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName']);

    if (!config.apiKey || !config.apiEndpoint || !config.modelName) {
      throw new Error('LLM API not configured. Please configure in extension settings.');
    }

    // Build request body for LLM with screenshots
    const requestBody = buildLLMRequestBody(
      config.llmProvider,
      config.modelName,
      userPrompt,
      systemPrompt,
      {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 2000,
        screenshots: screenshots || []
      }
    );

    const headers = buildLLMHeaders(config.llmProvider, config.apiKey);

    // Make request to LLM API
    console.log(`[ProblemSolver] Calling ${config.llmProvider} API...`);
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ProblemSolver] LLM API error:', errorText);
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Extract answer from response
    const answer = extractLLMResponse(config.llmProvider, data);

    if (!answer || answer.trim().length === 0) {
      throw new Error('LLM returned empty response');
    }

    // Track token usage
    const usage = extractTokenUsage(config.llmProvider, data);
    if (usage) {
      await updateTokenUsage(config.llmProvider, usage);
      console.log('[ProblemSolver] Token usage:', usage);
    }

    console.log('[ProblemSolver] Answer generated:', answer.substring(0, 100) + '...');

    return answer;
  } catch (error) {
    console.error('[ProblemSolver] Error solving problem:', error);
    throw error;
  }
}

/**
 * Handle screenshot capture request
 * @returns {Promise<{success: boolean, screenshot?: string, error?: string}>}
 */
async function handleCaptureScreenshot() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      return { success: false, error: 'No active tab found' };
    }

    // Capture visible tab as PNG base64
    const screenshot = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });

    return { success: true, screenshot: screenshot };
  } catch (error) {
    console.error('[ProblemSolver] Error capturing screenshot:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
