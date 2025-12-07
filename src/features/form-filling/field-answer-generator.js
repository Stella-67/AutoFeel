// ==================== Field Answer Generator ====================
// Generates answers for form fields using LLM and RAG

/**
 * Generate answer for a single form field
 * Uses RAG to retrieve relevant knowledge, then calls LLM to generate answer
 *
 * @param {Object} field - Field information {id, label, type, options, value, ...}
 * @param {Object} savedContext - User's saved context
 * @param {Object} config - LLM configuration {llmProvider, apiKey, apiEndpoint, modelName}
 * @param {Object} tab - Chrome tab object
 * @returns {Promise<{success: boolean, data?: Object, tokenUsage?: Object, error?: string}>}
 */
async function generateSingleFieldAnswer(field, savedContext, config, tab) {
  const { llmProvider, apiKey, apiEndpoint, modelName } = config;

  try {
    if (!tab) {
      console.error('[FieldAnswerGenerator] No tab provided');
      return {
        success: false,
        error: 'No tab provided'
      };
    }

    // ==================== RAG: Retrieve Relevant Knowledge ====================
    let retrievedContext = '';
    const queryText = `${field.label || ''} ${field.placeholder || ''}`.trim();

    console.log(`[FieldAnswerGenerator] Field: "${queryText}"${field.options ? ` (${field.options.length} options)` : ''}`);

    if (queryText) {
      retrievedContext = await retrieveRelevantKnowledge(queryText, config, 3);
    }

    // ==================== Detect Dynamic Dropdown Options ====================
    // If this is a dynamic dropdown without options, detect them now
    if (field.isDynamicDropdown && (!field.options || field.options.length === 0)) {
      try {
        console.log(`[FieldAnswerGenerator] Detecting options for dynamic dropdown: ${field.id}`);
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'DETECT_DROPDOWN_OPTIONS',
          fieldId: field.id
        });

        if (response && response.success && response.options && response.options.length > 0) {
          field.options = response.options;
          console.log(`[FieldAnswerGenerator] Detected ${field.options.length} options`);
        } else {
          console.warn(`[FieldAnswerGenerator] Failed to detect options for ${field.id}`);
        }
      } catch (detectError) {
        console.error('[FieldAnswerGenerator] Error detecting dropdown options:', detectError);
      }
    }

    // ==================== Build Prompt for Single Field ====================
    const systemPrompt = `You are an intelligent form-filling assistant. Your task is to understand the question, analyze the user's information, and use logical reasoning to provide the most appropriate answer.

IMPORTANT: Do not simply match keywords. Instead:
1. Understand what the question is really asking
2. Analyze the context and user's information
3. Use logical reasoning to determine the best answer
4. Consider implications and related information

Return a JSON object with "answer" and "explanation":
{
  "answer": "your answer here",
  "explanation": null
}

CRITICAL RULES:
- If the question has OPTIONS (numbered 1, 2, 3...), you MUST return ONLY the option number (e.g., "2"), NEVER the option text
- You MUST select one of the provided options OR return empty string "" if none fit
- For questions with options, you are NOT allowed to create your own answer
- If you cannot find relevant information to choose an option, set answer to "" and explain why

If you cannot answer, set answer to "" and provide a brief explanation of why.`;

    let userPrompt = '';

    if (retrievedContext) {
      userPrompt += `=== RELEVANT INFORMATION ===\n${retrievedContext}\n\n`;
    } else if (savedContext) {
      // Fallback to savedContext only if no chunks were retrieved
      const contextText = savedContext.llmAnalysis || savedContext.pageContent.text;
      const truncatedContext = contextText.length > 2000
        ? contextText.substring(0, 2000) + '...[truncated]'
        : contextText;

      userPrompt += `=== USER CONTEXT ===\n${truncatedContext}\n\n`;
    }

    userPrompt += `=== QUESTION ===\n${queryText}\n\n`;

    // Show current value if field already has a value
    if (field.value && field.value.trim().length > 0) {
      userPrompt += `=== CURRENT VALUE ===\n`;
      userPrompt += `This field currently has value: "${field.value}"\n`;
      userPrompt += `If this value is correct based on the context, you can keep it by returning the corresponding option number.\n`;
      userPrompt += `If it needs to be changed, select a different option.\n\n`;
    }

    // If field has options (radio/select), include them
    if (field.options && field.options.length > 0) {
      // Special handling for searchable text input dropdowns with incomplete option lists
      // Only text inputs with search boxes can accept text answers
      const isSearchableDropdown = field.type === 'text' && field.isDynamicDropdown;

      if (isSearchableDropdown) {
        userPrompt += `=== SEARCHABLE DROPDOWN (Options may be incomplete) ===\n`;
        userPrompt += `This is a searchable dropdown field. The list below shows only ${field.options.length} visible options, but there may be hundreds more available through search.\n\n`;
        userPrompt += `Sample visible options:\n`;
        field.options.slice(0, Math.min(10, field.options.length)).forEach((option) => {
          userPrompt += `  - ${option.label}\n`;
        });
        if (field.options.length > 10) {
          userPrompt += `  ... and ${field.options.length - 10} more\n`;
        }
        userPrompt += `\n`;
        userPrompt += `🚨 CRITICAL REQUIREMENT FOR SEARCHABLE DROPDOWNS:\n`;
        userPrompt += `- DO NOT limit yourself to the visible options above\n`;
        userPrompt += `- Return the EXACT text answer that best matches the user's information\n`;
        userPrompt += `- The search box will filter to find your answer among ALL available options\n`;
        userPrompt += `- Examples:\n`;
        userPrompt += `  - For country phone code: {"answer": "China (+86)", "explanation": null}\n`;
        userPrompt += `  - For country: {"answer": "United States", "explanation": null}\n`;
        userPrompt += `  - For city: {"answer": "San Francisco", "explanation": null}\n`;
        userPrompt += `- If you truly cannot determine the answer from context, return empty: {"answer": "", "explanation": "reason"}\n\n`;
      } else {
        userPrompt += `=== AVAILABLE OPTIONS ===\n`;

        // Check if any options have children (hierarchical structure)
        const hasHierarchy = field.options.some(opt => opt.children && opt.children.length > 0);

        field.options.forEach((option, index) => {
          const isCurrent = field.value && (
            option.label.includes(field.value) ||
            field.value.includes(option.label) ||
            option.value === field.value
          );
          userPrompt += `${index + 1}. ${option.label}${isCurrent ? ' ⭐ (CURRENT)' : ''}\n`;

          // If this option has children, list them
          if (option.children && option.children.length > 0) {
            option.children.forEach(child => {
              userPrompt += `   → ${child.label}\n`;
            });
          }
        });
        userPrompt += `\n`;

        if (hasHierarchy) {
          userPrompt += `🚨 CRITICAL REQUIREMENT FOR HIERARCHICAL OPTIONS:\n`;
          userPrompt += `- Some options have sub-options (shown with →)\n`;
          userPrompt += `- If you want to select a sub-option, return it as "Parent > Child" (e.g., "Job Board > LinkedIn")\n`;
          userPrompt += `- If you want to select just the parent option, return only the parent name (e.g., "Job Board")\n`;
          userPrompt += `- Your answer must be the FULL PATH using " > " separator\n`;
          userPrompt += `- Examples:\n`;
          userPrompt += `  - To select LinkedIn under Job Board: {"answer": "Job Board > LinkedIn", "explanation": null}\n`;
          userPrompt += `  - To select just Referral: {"answer": "Referral", "explanation": null}\n`;
          userPrompt += `- If none fit, return empty: {"answer": "", "explanation": "reason"}\n\n`;
        } else {
          userPrompt += `🚨 CRITICAL REQUIREMENT - READ CAREFULLY:\n`;
          userPrompt += `- You MUST choose from the ${field.options.length} options listed above\n`;
          userPrompt += `- Your "answer" field MUST be ONLY a number from 1 to ${field.options.length}\n`;
          userPrompt += `- DO NOT return text, DO NOT return the option label, DO NOT create your own answer\n`;
          userPrompt += `- ONLY return the number (e.g., "3")\n`;
          userPrompt += `- Use logical reasoning to pick the BEST matching option based on the context\n`;
          userPrompt += `- If NONE of the ${field.options.length} options fit the context, return "" (empty string) and explain why\n`;
          userPrompt += `- Example valid responses: {"answer": "2", "explanation": null} or {"answer": "", "explanation": "No option matches user's background"}\n\n`;
        }
      }
    } else {
      userPrompt += `Please answer this question based on the context. Be concise and relevant.\n\n`;
    }

    const requestBody = buildLLMRequestBody(llmProvider, modelName, userPrompt, systemPrompt, {
      maxTokens: 500,
      temperature: 0.1  // Low temperature for rule-following while allowing slight reasoning flexibility
    });
    const headers = buildLLMHeaders(llmProvider, apiKey);

    const response = await fetch(apiEndpoint, {
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
    const content = extractLLMResponse(llmProvider, data);

    const tokenUsage = extractTokenUsage(llmProvider, data);
    if (tokenUsage) {
      await updateTokenUsage(llmProvider, tokenUsage);
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[FieldAnswerGenerator] Failed to parse JSON from LLM response');
      return {
        success: false,
        error: 'LLM did not return valid JSON'
      };
    }

    const result = JSON.parse(jsonMatch[0]);

    // ==================== Validate Option Fields ====================

    // If this is an option field (select/radio), validate the answer
    if (field.options && field.options.length > 0 && result.answer) {
      const answerStr = String(result.answer).trim();

      // Check if field has hierarchical options
      const hasHierarchy = field.options.some(opt => opt.children && opt.children.length > 0);

      // Check if this is a searchable text input dropdown (can accept text answers)
      const isSearchableTextInput = field.type === 'text' && field.isDynamicDropdown;

      if (hasHierarchy) {
        // For hierarchical options, accept text format like "Job Board > LinkedIn"
        console.log('[FieldAnswerGenerator] ✅ Hierarchical answer:', answerStr);
        // No validation needed - contentScript's selectFromDropdown will handle the path
      } else if (isSearchableTextInput) {
        // For searchable text inputs ONLY, accept text answers (will be used for search)
        console.log('[FieldAnswerGenerator] ✅ Searchable text input answer:', answerStr);
        // No validation needed - fillSearchableSelect will handle the search
      } else {
        // For non-hierarchical options, validate numeric answer
        const answerNum = parseInt(answerStr);
        const isValidNumber = !isNaN(answerNum) && answerNum >= 1 && answerNum <= field.options.length;

        if (!isValidNumber) {
          // LLM returned invalid answer - reject it
          console.error(`[FieldAnswerGenerator] ❌ LLM returned invalid answer for option field: "${answerStr}"`);
          console.error(`[FieldAnswerGenerator] Expected: number 1-${field.options.length} or empty string ""`);
          console.error('[FieldAnswerGenerator] Available options:', field.options.map((o, i) => `${i+1}. ${o.label}`).join(', '));

          // Force empty answer with explanation
          result.answer = '';
          if (!result.explanation) {
            result.explanation = `LLM returned invalid answer format. Expected option number 1-${field.options.length}.`;
          }
        } else {
          console.log('[FieldAnswerGenerator] ✅ Valid option number:', answerNum);
        }
      }
    }

    console.log('[FieldAnswerGenerator Debug] ✅ Final Answer:', result.answer || '(empty)');
    if (result.explanation) {
      console.log('[FieldAnswerGenerator Debug] 💡 Explanation:', result.explanation);
    }
    console.log('');

    return {
      success: true,
      data: result,
      tokenUsage: tokenUsage
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
