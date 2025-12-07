// ==================== Submenu Handler ====================
// Handles submenu selection during dropdown filling

/**
 * Handle submenu selection when a dropdown has hierarchical options
 * @param {string} parentOption - The parent option that was selected
 * @param {Array<string>} submenuOptions - Available submenu options
 * @param {string} fieldContext - Context about the field
 * @returns {Promise<{success: boolean, answer?: string, tokenUsage?: Object, error?: string}>}
 */
async function handleSubmenuSelection(parentOption, submenuOptions, fieldContext) {
  try {
    // Get saved context and LLM config
    const { savedContext } = await chrome.storage.local.get(['savedContext']);
    const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName']);

    if (!savedContext || !config.apiKey || !config.apiEndpoint || !config.modelName) {
      return { success: false, error: 'Missing configuration or context' };
    }

    console.log(`[SubmenuHandler] Asking LLM for submenu selection under "${parentOption}"`);

    // Build prompt for submenu selection
    const systemPrompt = `You are an AI form-filling assistant. The user previously selected "${parentOption}" from a dropdown menu, and now a submenu has appeared with more options.

Your task: Select the most appropriate option from the submenu based on the user's context.

CRITICAL RULES:
1. Return ONLY the option text, nothing else
2. Choose from the provided submenu options ONLY
3. If no option matches the user's context, choose "Other" or the most generic option
4. Return format: Just the option text (e.g., "LinkedIn")`;

    let userPrompt = `${fieldContext}\n\n=== SUBMENU OPTIONS ===\n`;
    submenuOptions.forEach((option, index) => {
      userPrompt += `${index + 1}. ${option}\n`;
    });

    userPrompt += `\n=== USER CONTEXT ===\n${JSON.stringify(savedContext, null, 2)}\n\n`;
    userPrompt += `Select the most relevant option from the submenu.`;

    // Call LLM
    const requestBody = buildLLMRequestBody(config.llmProvider, config.modelName, userPrompt, systemPrompt, {
      maxTokens: 200,
      temperature: 0.1
    });
    const headers = buildLLMHeaders(config.llmProvider, config.apiKey);

    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `API request failed (${response.status}): ${errorText}`
      };
    }

    const data = await response.json();
    const answer = extractLLMResponse(config.llmProvider, data).trim();

    const tokenUsage = extractTokenUsage(config.llmProvider, data);
    if (tokenUsage) {
      await updateTokenUsage(config.llmProvider, tokenUsage);
    }

    console.log(`[SubmenuHandler] LLM selected: "${answer}"`);

    return {
      success: true,
      answer: answer,
      tokenUsage: tokenUsage
    };

  } catch (error) {
    console.error('[SubmenuHandler] Error:', error);
    return { success: false, error: error.message };
  }
}
