// ==================== AutoFeel Background Service Worker ====================
// Main orchestration layer - delegates to specialized modules

// Import all modules
importScripts('/src/utils.js');
importScripts('/src/llm-service.js');
importScripts('/src/embedding-service.js');
importScripts('/src/text-processor.js');
importScripts('/src/schema-builder.js');
importScripts('/src/db.js');
importScripts('/src/decision-agent.js');

// ==================== Message Listeners ====================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TEST_API') {
    // Handle test API request from popup
    (async () => {
      try {
        const result = await testAPIConnection({
          llmProvider: message.config.provider,
          apiKey: message.config.apiKey,
          apiEndpoint: message.config.endpoint,
          modelName: message.config.model
        });
        sendResponse(result);
      } catch (error) {
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (message.type === 'FILL_SINGLE_FIELD_BY_CLICK') {
    // Handle Option+Click to fill a single field
    (async () => {
      try {
        await handleFillSingleFieldByClick(message.fieldId);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (message.type === 'SELECT_FROM_SUBMENU') {
    // Handle submenu selection during dropdown filling
    (async () => {
      try {
        const result = await handleSubmenuSelection(
          message.parentOption,
          message.submenuOptions,
          message.fieldContext
        );
        sendResponse(result);
      } catch (error) {
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    return true; // Keep message channel open for async response
  }
});

// ==================== Command Listeners ====================

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'send-to-llm') {
    await handleSendToLLM();
  } else if (command === 'auto-fill-form') {
    await handleAutoFillForm();
  }
});

// ==================== Main Handler: Send to LLM (Option+C) ====================

async function handleSendToLLM() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      console.error('[AutoFeel] No active tab found');
      return;
    }

    // Check if page is accessible
    if (tab.url && (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('file://')
    )) {
      console.error('[AutoFeel] Cannot run on special pages:', tab.url);
      console.error('[AutoFeel] This extension only works on regular web pages (http:// or https://)');
      return;
    }

    await notifyTab(tab.id, 'Fetching page content...', 'loading');

    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT' });
    } catch (error) {
      console.error('[AutoFeel] Failed to communicate with content script:', error);
      console.error('[AutoFeel] Please refresh the page (F5) and try again.');
      console.error('[AutoFeel] If the problem persists, this page may not support content scripts.');
      return;
    }

    if (!response || !response.success) {
      await notifyTab(tab.id, 'Failed to get page content', 'error');
      return;
    }

    const rawContent = response.content;

    // ==================== IMMEDIATE: Save raw content to buffer ====================
    await chrome.storage.local.set({
      savedContext: {
        pageContent: rawContent,
        llmAnalysis: rawContent.text, // Use raw text initially
        timestamp: new Date().toISOString(),
        sourceUrl: rawContent.metadata.url,
        isProcessed: false // Mark as not yet processed
      }
    });

    await notifyTab(tab.id, `✅ Content saved to buffer! You can now use Alt+V to fill forms. Processing in background...`, 'success');

    console.log('[AutoFeel] Saved to buffer. Processing in background...');

    // ==================== BACKGROUND PROCESSING ====================
    // Continue processing asynchronously without blocking
    (async () => {
      try {

        const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName', 'systemPrompt']);

        if (!config.apiKey || !config.apiEndpoint || !config.modelName) {
          console.error('[AutoFeel Background] LLM API not configured, skipping processing');
          return;
        }

        // === Text Cleaning Pipeline ===
        const preCleaningResult = await llmPreCleaning(rawContent, config);

        if (!preCleaningResult.success) {
          console.error('[AutoFeel Background] Pre-cleaning failed:', preCleaningResult.error);
          return;
        }

        const cleanupResult = postLLMCleanup(preCleaningResult.data);
        const chunkResult = chunkBuilder(cleanupResult, preCleaningResult.data);
        const memoryReady = buildMemoryReadyData(
          chunkResult.chunks,
          rawContent,
          preCleaningResult.data,
          cleanupResult
        );

        const { docId, documentSchema } = buildDocumentSchema(
          rawContent,
          preCleaningResult.data,
          memoryReady
        );

        let chunkSchemas = buildChunkSchemas(
          docId,
          chunkResult.chunks,
          rawContent,
          preCleaningResult.data
        );

        // Generate Vector Embeddings (optional, only for OpenAI provider)
        if (config.llmProvider === 'openai' || config.llmProvider === 'custom') {
          try {
            const chunksWithEmbeddings = await generateChunkEmbeddings(chunkSchemas, config);
            chunkSchemas = chunksWithEmbeddings;
            console.log('[AutoFeel] Generated embeddings for semantic search');
          } catch (embError) {
            console.warn('[AutoFeel] Failed to generate embeddings:', embError);
          }
        }

        // Update savedContext with processed data
        await chrome.storage.local.set({
          savedContext: {
            pageContent: rawContent,
            llmAnalysis: memoryReady.cleanText,
            timestamp: new Date().toISOString(),
            sourceUrl: rawContent.metadata.url,
            isProcessed: true // Mark as processed
          }
        });

        // ==================== DECISION AGENT: ANALYZE & SAVE ====================
        let saveResult = null;
        try {
          await memoryDB.init();

          // Create decision agent
          const decisionAgent = new DecisionAgent(memoryDB);

          // Analyze what to do
          const decision = await decisionAgent.decide(documentSchema, chunkSchemas);
          console.log('[AutoFeel] Save decision:', decisionAgent.explainDecision(decision));

          // Execute the decision
          saveResult = await decisionAgent.execute(decision, documentSchema, chunkSchemas);
        } catch (dbError) {
          console.error('[AutoFeel Background] Failed to save to database:', dbError);
          saveResult = { success: false, error: dbError.message };
        }

        // Build completion message
        let completionMessage = '';

        if (saveResult && saveResult.success) {
          switch (saveResult.action) {
            case 'skipped':
              completionMessage = `⏭️ Already in memory (${saveResult.reason})`;
              break;

            case 'updated':
              if (saveResult.addedChunks !== undefined) {
                if (saveResult.addedChunks === 0) {
                  completionMessage = `🔄 Updated metadata (no new content)`;
                } else {
                  completionMessage = `🔄 Updated: +${saveResult.addedChunks} new chunks (total: ${saveResult.totalChunks})`;
                }
              } else {
                completionMessage = `🔄 Updated in memory (${saveResult.chunkCount} chunks)`;
              }
              break;

            case 'created':
            default:
              completionMessage = `📄 Saved to memory (${saveResult.chunkCount} chunks)`;
              break;
          }
        } else {
          completionMessage = '⚠️ Save failed';
        }

        if (preCleaningResult.tokenUsage) {
          completionMessage += ` [${preCleaningResult.tokenUsage.totalTokens.toLocaleString()} tokens]`;
        }

        console.log('[AutoFeel Background] ✅ Background processing complete!');
        await notifyTab(tab.id, completionMessage, 'success');

      } catch (bgError) {
        console.error('[AutoFeel Background] Error during background processing:', bgError);
        await notifyTab(tab.id, `Background processing error: ${bgError.message}`, 'error');
      }
    })(); // Immediately invoke the async function

  } catch (error) {
    console.error('[AutoFeel] Error in handleSendToLLM:', error);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await notifyTab(tab.id, `Error: ${error.message}`, 'error');
      }
    } catch (e) {
      console.error('[AutoFeel] Failed to show error notification:', e);
    }
  }
}

// ==================== Auto-Fill Form Handler (Option+V) ====================

async function handleAutoFillForm() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      console.error('[AutoFeel] No active tab found');
      return;
    }

    // Check if page is accessible
    if (tab.url && (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('file://')
    )) {
      console.error('[AutoFeel] Cannot run on special pages:', tab.url);
      console.error('[AutoFeel] This extension only works on regular web pages (http:// or https://)');
      return;
    }

    await notifyTab(tab.id, 'Detecting form fields...', 'loading');

    const { savedContext } = await chrome.storage.local.get(['savedContext']);

    if (!savedContext) {
      console.error('[AutoFeel] No saved context found.');
      console.error('[AutoFeel] Please use Alt+C first on a page with your information (e.g., resume, profile) to save it to memory.');
      console.error('[AutoFeel] Then come back to this form and use Alt+V to auto-fill.');
      return;
    }

    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_FORM_FIELDS' });
    } catch (error) {
      console.error('[AutoFeel] Failed to communicate with content script:', error);
      console.error('[AutoFeel] Please refresh the page (F5) and try again.');
      return;
    }

    if (!response || !response.success) {
      await notifyTab(tab.id, 'Failed to detect form fields', 'error');
      return;
    }

    const formFields = response.fields;

    if (formFields.length === 0) {
      await notifyTab(tab.id, 'No form fields found on this page', 'error');
      return;
    }

    console.log(`[AutoFeel] Auto-fill started with ${formFields.length} fields`);

    // Clear filled field tracking (start fresh)
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_FILLED_FIELDS' });
    } catch (e) {
      console.warn('[AutoFeel] Failed to clear filled fields (old content script?):', e.message);
    }

    await notifyTab(tab.id, `Found ${formFields.length} fields. Retrieving from knowledge base...`, 'loading');

    const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName']);

    if (!config.apiKey || !config.apiEndpoint || !config.modelName) {
      await notifyTab(tab.id, 'Please configure LLM API in extension settings', 'error');
      return;
    }

    // Generate and fill answers one by one
    // Strategy: Fill one field, re-detect remaining unfilled fields, repeat
    let totalTokens = 0;
    let filledCount = 0;
    let iterationCount = 0;
    const MAX_ITERATIONS = 100; // Safety limit to prevent infinite loops

    let remainingFields = formFields; // Start with initial detection

    while (remainingFields.length > 0 && iterationCount < MAX_ITERATIONS) {
      iterationCount++;

      // Process the first unfilled field
      const field = remainingFields[0];
      const totalCurrent = filledCount + remainingFields.length;

      // Show progress notification
      await notifyTab(tab.id, `Filling field ${filledCount + 1}/${totalCurrent}...`, 'loading');

      const answer = await generateSingleFieldAnswer(field, savedContext, config, tab);

      // Fill the field (or show hint if empty)
      if (answer.success) {
        // CRITICAL: Mark as filled FIRST to prevent re-detection
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'MARK_AS_FILLED',
            fieldId: field.id,
            fieldLabel: field.label,
            fieldName: field.name,  // Pass name for composite key
            fieldType: field.type   // Pass type for composite key
          });
        } catch (markError) {
          console.error(`[AutoFeel] Failed to mark field as filled:`, markError);
        }

        // Then try to fill
        // Convert numeric index to option text for dynamic dropdowns (but not hierarchical ones)
        let answerToFill = answer.data;
        if (field.options && field.options.length > 0 && answer.data.answer) {
          // Check if field has hierarchical options
          const hasHierarchy = field.options.some(opt => opt.children && opt.children.length > 0);

          if (hasHierarchy) {
            // For hierarchical options, answer is already text like "Job Board > LinkedIn"
            console.log(`[AutoFeel] Hierarchical answer (no conversion needed): "${answer.data.answer}"`);
          } else {
            // For non-hierarchical options, convert numeric index to text
            const answerNum = parseInt(answer.data.answer);
            if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= field.options.length) {
              // For dynamic dropdowns (searchable/button select), convert to option text
              if (field.isDynamicDropdown || field.type === 'button-select') {
                const optionText = field.options[answerNum - 1].label;
                console.log(`[AutoFeel] Converting index ${answerNum} to option text: "${optionText}"`);
                answerToFill = {
                  answer: optionText,
                  explanation: answer.data.explanation
                };
              }
            }
          }
        }

        const fillResult = await chrome.tabs.sendMessage(tab.id, {
          type: 'FILL_SINGLE_FIELD',
          fieldId: field.id,
          answer: answerToFill
        });

        if (fillResult && fillResult.success) {
          filledCount++;
        }

        if (answer.tokenUsage) {
          totalTokens += answer.tokenUsage.totalTokens;
        }
      } else {
        console.error(`[AutoFeel] Failed to generate answer for ${field.id}:`, answer.error);
      }

      // Wait for page to update (fields may appear/disappear dynamically)
      await new Promise(resolve => setTimeout(resolve, 600));

      // Re-detect all remaining unfilled fields
      try {
        const detectionResult = await chrome.tabs.sendMessage(tab.id, {
          type: 'DETECT_FORM_FIELDS',
          onlyUnfilled: true  // Only detect fields not yet filled
        });

        if (detectionResult && detectionResult.success && detectionResult.fields) {
          const oldCount = remainingFields.length;
          const newCount = detectionResult.fields.length;

          remainingFields = detectionResult.fields;

          if (newCount !== oldCount - 1) {
            // Expected: oldCount - 1 (we just processed one)
            // If different, fields were added or removed dynamically
            console.log(`[AutoFeel] Remaining fields: ${newCount} (${newCount > oldCount - 1 ? 'added' : 'removed'} ${Math.abs(newCount - (oldCount - 1))})`);
          }
        } else {
          // No more unfilled fields detected
          remainingFields = [];
        }
      } catch (detectError) {
        console.log('[AutoFeel] Re-detection failed:', detectError.message);
        remainingFields = [];
      }
    }

    if (iterationCount >= MAX_ITERATIONS) {
      console.warn('[AutoFeel] Reached maximum iteration limit');
    }

    await notifyTab(tab.id, `✅ Successfully filled ${filledCount} fields (${totalTokens.toLocaleString()} tokens)`, 'success');
  } catch (error) {
    console.error('[AutoFeel] Error in handleAutoFillForm:', error);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await notifyTab(tab.id, `Error: ${error.message}`, 'error');
      }
    } catch (e) {
      console.error('[AutoFeel] Failed to show error notification:', e);
    }
  }
}

// ==================== Single Field Answer Generation ====================

async function generateSingleFieldAnswer(field, savedContext, config, tab) {
  const { llmProvider, apiKey, apiEndpoint, modelName } = config;

  try {
    // Use the tab passed from handleAutoFillForm
    if (!tab) {
      console.error('[AutoFeel] No tab provided');
      return {
        success: false,
        error: 'No tab provided'
      };
    }

    // ==================== RAG: Retrieve Relevant Knowledge ====================
    let retrievedContext = '';
    const queryText = `${field.label || ''} ${field.placeholder || ''}`.trim();

    console.log(`[AutoFeel] Field: "${queryText}"${field.options ? ` (${field.options.length} options)` : ''}`);

    if (queryText) {
      try {
        if (llmProvider === 'openai' || llmProvider === 'custom') {
          // Use semantic search with embeddings
          const queryEmbedding = await generateEmbedding(queryText, config);

          if (queryEmbedding) {
            await memoryDB.init();
            const searchResults = await memoryDB.semanticSearch(queryEmbedding, 3);

            if (searchResults && searchResults.length > 0) {
              console.log(`[AutoFeel] Found ${searchResults.length} relevant chunks (semantic search)`);

              retrievedContext = searchResults.map((chunk, index) => {
                return `[Retrieved Knowledge ${index + 1}] (Relevance: ${(chunk.similarity * 100).toFixed(1)}%)
Source: ${chunk.source.title}
Content: ${chunk.text}`;
              }).join('\n\n');
            }
          }
        } else {
          // Use keyword-based search for providers without embedding support
          await memoryDB.init();
          const searchResults = await memoryDB.keywordSearch(queryText, 3);

          if (searchResults && searchResults.length > 0) {
            console.log(`[AutoFeel] Found ${searchResults.length} relevant chunks (keyword search)`);

            retrievedContext = searchResults.map((chunk, index) => {
              return `[Retrieved Knowledge ${index + 1}] (Relevance: ${(chunk.similarity * 100).toFixed(1)}%)
Source: ${chunk.source.title}
Content: ${chunk.text}`;
            }).join('\n\n');
          }
        }
      } catch (ragError) {
        console.error('[AutoFeel] RAG error:', ragError);
      }
    }

    // ==================== Detect Dynamic Dropdown Options ====================
    // DEBUG: Log field state
    console.log(`[AutoFeel DEBUG] Field: ${field.id}, type: ${field.type}, isDynamicDropdown: ${field.isDynamicDropdown}, options: ${field.options ? field.options.length : 'undefined'}`);

    // If this is a dynamic dropdown without options, detect them now
    const needsDetection = field.isDynamicDropdown && (!field.options || field.options.length === 0);
    console.log(`[AutoFeel DEBUG] Needs detection: ${needsDetection}`);

    if (needsDetection) {
      console.log(`[AutoFeel DEBUG] Entering detection block for ${field.id}`);
      try {
        // Use the tab we got at the beginning of the function
        console.log(`[AutoFeel DEBUG] Using tab: ${tab.id}`);
        console.log(`[AutoFeel] Detecting options for dynamic dropdown: ${field.id}`);
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'DETECT_DROPDOWN_OPTIONS',
          fieldId: field.id
        });

        console.log(`[AutoFeel DEBUG] Detection response:`, response);

        if (response && response.success && response.options && response.options.length > 0) {
          field.options = response.options;
          console.log(`[AutoFeel] ✓ Detected ${field.options.length} options for ${field.id}`);
        } else {
          console.warn(`[AutoFeel] ⚠️ Failed to detect options for ${field.id}`);
        }
      } catch (detectError) {
        console.error('[AutoFeel] Error detecting dropdown options:', detectError);
      }
    } else {
      console.log(`[AutoFeel DEBUG] Skipping detection for ${field.id}`);
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
      console.error('[AutoFeel] Failed to parse JSON from LLM response');
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

      if (hasHierarchy) {
        // For hierarchical options, accept text format like "Job Board > LinkedIn"
        console.log('[AutoFeel] ✅ Hierarchical answer:', answerStr);
        // No validation needed - contentScript's selectFromDropdown will handle the path
      } else {
        // For non-hierarchical options, validate numeric answer
        const answerNum = parseInt(answerStr);
        const isValidNumber = !isNaN(answerNum) && answerNum >= 1 && answerNum <= field.options.length;

        if (!isValidNumber) {
          // LLM returned invalid answer - reject it
          console.error(`[AutoFeel] ❌ LLM returned invalid answer for option field: "${answerStr}"`);
          console.error(`[AutoFeel] Expected: number 1-${field.options.length} or empty string ""`);
          console.error('[AutoFeel] Available options:', field.options.map((o, i) => `${i+1}. ${o.label}`).join(', '));

          // Force empty answer with explanation
          result.answer = '';
          if (!result.explanation) {
            result.explanation = `LLM returned invalid answer format. Expected option number 1-${field.options.length}.`;
          }
        } else {
          console.log('[AutoFeel] ✅ Valid option number:', answerNum);
        }
      }
    }

    console.log('[AutoFeel Debug] ✅ Final Answer:', result.answer || '(empty)');
    if (result.explanation) {
      console.log('[AutoFeel Debug] 💡 Explanation:', result.explanation);
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

// ==================== Handle Fill Single Field By Click (Option+Click) ====================

async function handleFillSingleFieldByClick(fieldId) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      console.error('[AutoFeel] No active tab found');
      return;
    }

    // Check if page is accessible
    if (tab.url && (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('file://')
    )) {
      console.error('[AutoFeel] Cannot run on special pages:', tab.url);
      return;
    }

    await notifyTab(tab.id, 'Analyzing clicked field...', 'loading');

    // Get saved context
    const { savedContext } = await chrome.storage.local.get(['savedContext']);

    if (!savedContext) {
      await notifyTab(tab.id, 'No saved context. Use Alt+C first to save your information.', 'error');
      console.error('[AutoFeel] No saved context found. Please use Alt+C first.');
      return;
    }

    // Get LLM config
    const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName']);

    if (!config.apiKey || !config.apiEndpoint || !config.modelName) {
      await notifyTab(tab.id, 'Please configure LLM API in extension settings', 'error');
      return;
    }

    // Detect the clicked field first to check its type
    let detectionResult;
    try {
      detectionResult = await chrome.tabs.sendMessage(tab.id, {
        type: 'DETECT_FORM_FIELDS',
        onlyUnfilled: false
      });
    } catch (error) {
      console.error('[AutoFeel] Failed to detect field:', error);
      await notifyTab(tab.id, 'Failed to detect field', 'error');
      return;
    }

    if (!detectionResult || !detectionResult.success) {
      await notifyTab(tab.id, 'Failed to detect field', 'error');
      return;
    }

    const clickedField = detectionResult.fields.find(f => f.id === fieldId);
    if (!clickedField) {
      await notifyTab(tab.id, 'Field not found', 'error');
      return;
    }

    const isSelectionField = clickedField.type === 'radio' ||
                            clickedField.type === 'checkbox' ||
                            clickedField.type === 'select' ||
                            clickedField.type === 'button-select' ||
                            clickedField.isDynamicDropdown;

    if (isSelectionField) {
      // This is a selection field - use recursive filling to handle conditional sub-questions
      console.log(`[AutoFeel] Option+Click: Selection field detected, starting recursive fill from "${clickedField.label}"`);
      const result = await recursiveFillFromField(tab, fieldId, savedContext, config, 0);

      if (result.success) {
        const tokenInfo = result.totalTokens > 0 ? ` (${result.totalTokens.toLocaleString()} tokens)` : '';
        await notifyTab(tab.id, `✅ Filled ${result.filledCount} field(s)${tokenInfo}`, 'success');
        console.log(`[AutoFeel] Recursive fill completed: ${result.filledCount} fields filled`);
      } else {
        await notifyTab(tab.id, result.error || 'Failed to fill fields', 'error');
      }
    } else {
      // This is a text field - fill only this one field, no recursion
      console.log(`[AutoFeel] Option+Click: Text field detected, filling single field "${clickedField.label}" without recursion`);
      const result = await fillSingleFieldNonRecursive(tab, clickedField, savedContext, config);

      if (result.success) {
        const tokenInfo = result.totalTokens > 0 ? ` (${result.totalTokens.toLocaleString()} tokens)` : '';
        await notifyTab(tab.id, `✅ Filled "${clickedField.label}"${tokenInfo}`, 'success');
      } else {
        await notifyTab(tab.id, result.error || 'Failed to fill field', 'error');
      }
    }

  } catch (error) {
    console.error('[AutoFeel] Error in handleFillSingleFieldByClick:', error);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await notifyTab(tab.id, `Error: ${error.message}`, 'error');
      }
    } catch (e) {
      console.error('[AutoFeel] Failed to show error notification:', e);
    }
  }
}

// ==================== Fill Single Field (Non-Recursive) ====================

/**
 * Fill a single field without recursion (for text fields)
 */
async function fillSingleFieldNonRecursive(tab, field, savedContext, config) {
  try {
    // Generate answer
    const answer = await generateSingleFieldAnswer(field, savedContext, config, tab);

    if (!answer.success) {
      return { success: false, totalTokens: 0, error: answer.error };
    }

    // Mark as filled
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'MARK_AS_FILLED',
        fieldId: field.id,
        fieldLabel: field.label,
        fieldName: field.name,
        fieldType: field.type
      });
    } catch (markError) {
      console.error(`[AutoFeel] Failed to mark field as filled:`, markError);
    }

    // Convert answer format if needed
    let answerToFill = answer.data;
    if (field.options && field.options.length > 0 && answer.data.answer) {
      const hasHierarchy = field.options.some(opt => opt.children && opt.children.length > 0);

      if (hasHierarchy) {
        console.log(`[AutoFeel] Hierarchical answer: "${answer.data.answer}"`);
      } else {
        const answerNum = parseInt(answer.data.answer);
        if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= field.options.length) {
          if (field.isDynamicDropdown || field.type === 'button-select') {
            const optionText = field.options[answerNum - 1].label;
            console.log(`[AutoFeel] Converting index ${answerNum} to option text: "${optionText}"`);
            answerToFill = {
              answer: optionText,
              explanation: answer.data.explanation
            };
          }
        }
      }
    }

    // Fill the field
    const fillResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'FILL_SINGLE_FIELD',
      fieldId: field.id,
      answer: answerToFill
    });

    if (!fillResult || !fillResult.success) {
      return { success: false, totalTokens: 0, error: 'Failed to fill field' };
    }

    const totalTokens = answer.tokenUsage ? answer.tokenUsage.totalTokens : 0;
    return { success: true, totalTokens };

  } catch (error) {
    console.error('[AutoFeel] Error in fillSingleFieldNonRecursive:', error);
    return { success: false, totalTokens: 0, error: error.message };
  }
}

// ==================== Handle Submenu Selection ====================

async function handleSubmenuSelection(parentOption, submenuOptions, fieldContext) {
  try {
    // Get saved context and LLM config
    const { savedContext } = await chrome.storage.local.get(['savedContext']);
    const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName']);

    if (!savedContext || !config.apiKey || !config.apiEndpoint || !config.modelName) {
      return { success: false, error: 'Missing configuration or context' };
    }

    console.log(`[AutoFeel] 🤖 Asking LLM to select from submenu under "${parentOption}"`);
    console.log(`[AutoFeel] Submenu options:`, submenuOptions);

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

    // Call LLM using the same pattern as generateSingleFieldAnswer
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

    console.log(`[AutoFeel] 🎯 LLM selected submenu option: "${answer}"`);

    return {
      success: true,
      answer: answer,
      tokenUsage: tokenUsage
    };

  } catch (error) {
    console.error('[AutoFeel] Error in handleSubmenuSelection:', error);
    return { success: false, error: error.message };
  }
}

// ==================== Recursive Fill Algorithm ====================

/**
 * Recursively fill fields starting from a specific field
 * After filling each field, re-detect to find newly appeared conditional fields
 *
 * @param {Object} tab - Chrome tab object
 * @param {string} startFieldId - ID of the field to start filling (null for auto-detect first unfilled)
 * @param {Object} savedContext - User's saved context
 * @param {Object} config - LLM configuration
 * @param {number} depth - Current recursion depth (for safety limit)
 * @returns {Promise<{success: boolean, filledCount: number, totalTokens: number, error?: string}>}
 */
async function recursiveFillFromField(tab, startFieldId, savedContext, config, depth = 0) {
  const MAX_DEPTH = 50; // Safety limit to prevent infinite recursion

  if (depth >= MAX_DEPTH) {
    console.warn('[AutoFeel] Reached maximum recursion depth');
    return { success: true, filledCount: 0, totalTokens: 0 };
  }

  console.log(`[AutoFeel] 🔄 Recursion depth ${depth}: Detecting fields...`);

  // Detect all fields (if startFieldId provided, detect all; otherwise detect unfilled)
  let detectionResult;
  try {
    detectionResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'DETECT_FORM_FIELDS',
      onlyUnfilled: startFieldId ? false : true  // If we have a specific field, detect all; otherwise only unfilled
    });
  } catch (error) {
    console.error('[AutoFeel] Failed to detect fields at depth', depth, error);
    return { success: false, filledCount: 0, totalTokens: 0, error: 'Failed to detect fields' };
  }

  if (!detectionResult || !detectionResult.success || !detectionResult.fields || detectionResult.fields.length === 0) {
    console.log(`[AutoFeel] 🏁 No more fields to fill at depth ${depth}`);
    return { success: true, filledCount: 0, totalTokens: 0 };
  }

  // Find the field to fill
  let field;
  if (startFieldId) {
    // Find the specific field by ID
    field = detectionResult.fields.find(f => f.id === startFieldId);
    if (!field) {
      console.error('[AutoFeel] Specified field not found:', startFieldId);
      return { success: false, filledCount: 0, totalTokens: 0, error: 'Field not found' };
    }
  } else {
    // Take the first unfilled field
    field = detectionResult.fields[0];
  }

  console.log(`[AutoFeel] 📝 Depth ${depth}: Filling field "${field.label}" (${field.type})`);

  // CRITICAL: Capture all current field IDs BEFORE filling
  // This allows us to detect truly NEW fields that appear after filling
  const fieldIdsBefore = new Set(detectionResult.fields.map(f => f.id));
  console.log(`[AutoFeel] 📸 Depth ${depth}: Captured ${fieldIdsBefore.size} field IDs before filling`);

  // Generate answer for this field
  const answer = await generateSingleFieldAnswer(field, savedContext, config, tab);

  if (!answer.success) {
    console.error(`[AutoFeel] Failed to generate answer at depth ${depth}:`, answer.error);
    return { success: false, filledCount: 0, totalTokens: 0, error: answer.error };
  }

  // Mark as filled FIRST
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'MARK_AS_FILLED',
      fieldId: field.id,
      fieldLabel: field.label,
      fieldName: field.name,
      fieldType: field.type
    });
  } catch (markError) {
    console.error(`[AutoFeel] Failed to mark field as filled:`, markError);
  }

  // Convert answer format if needed
  let answerToFill = answer.data;
  if (field.options && field.options.length > 0 && answer.data.answer) {
    const hasHierarchy = field.options.some(opt => opt.children && opt.children.length > 0);

    if (hasHierarchy) {
      console.log(`[AutoFeel] Hierarchical answer: "${answer.data.answer}"`);
    } else {
      const answerNum = parseInt(answer.data.answer);
      if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= field.options.length) {
        if (field.isDynamicDropdown || field.type === 'button-select') {
          const optionText = field.options[answerNum - 1].label;
          console.log(`[AutoFeel] Converting index ${answerNum} to option text: "${optionText}"`);
          answerToFill = {
            answer: optionText,
            explanation: answer.data.explanation
          };
        }
      }
    }
  }

  // Fill the field
  const fillResult = await chrome.tabs.sendMessage(tab.id, {
    type: 'FILL_SINGLE_FIELD',
    fieldId: field.id,
    answer: answerToFill
  });

  if (!fillResult || !fillResult.success) {
    console.error(`[AutoFeel] Failed to fill field at depth ${depth}`);
    return { success: false, filledCount: 0, totalTokens: 0, error: 'Failed to fill field' };
  }

  let totalTokens = answer.tokenUsage ? answer.tokenUsage.totalTokens : 0;
  let filledCount = 1;

  console.log(`[AutoFeel] ✅ Depth ${depth}: Filled "${field.label}"`);

  // Wait for page to update (new conditional fields may appear)
  await new Promise(resolve => setTimeout(resolve, 800));

  // Re-detect ALL fields (not just unfilled) to compare with before
  console.log(`[AutoFeel] 🔍 Depth ${depth}: Re-detecting all fields to find newly appeared ones...`);

  let afterFieldsResult;
  try {
    afterFieldsResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'DETECT_FORM_FIELDS',
      onlyUnfilled: false  // Detect ALL fields to compare
    });
  } catch (error) {
    console.warn('[AutoFeel] Failed to re-detect fields:', error);
    // Continue anyway, we filled at least one field
    return { success: true, filledCount, totalTokens };
  }

  if (afterFieldsResult && afterFieldsResult.success && afterFieldsResult.fields && afterFieldsResult.fields.length > 0) {
    // Find truly NEW fields by comparing IDs
    const newlyAppearedFields = afterFieldsResult.fields.filter(f => !fieldIdsBefore.has(f.id));

    if (newlyAppearedFields.length > 0) {
      console.log(`[AutoFeel] 🆕 Depth ${depth}: ${newlyAppearedFields.length} NEW field(s) appeared after filling!`);
      newlyAppearedFields.forEach(f => console.log(`  → ${f.label} (${f.type})`));

      // Filter for selection-type fields only (radio, checkbox, select, dropdown)
      // Don't recursively fill text fields - let user handle those manually
      const newSelectionFields = newlyAppearedFields.filter(f => {
        return f.type === 'radio' ||
               f.type === 'checkbox' ||
               f.type === 'select' ||
               f.type === 'button-select' ||
               f.isDynamicDropdown;
      });

      if (newSelectionFields.length > 0) {
        console.log(`[AutoFeel] ✅ Depth ${depth}: ${newSelectionFields.length} of them are selection-type, continuing recursively...`);

        // Recursively fill the first new selection field
        const recursiveResult = await recursiveFillFromField(tab, newSelectionFields[0].id, savedContext, config, depth + 1);

        filledCount += recursiveResult.filledCount;
        totalTokens += recursiveResult.totalTokens;
      } else {
        console.log(`[AutoFeel] 🏁 Depth ${depth}: New fields are text-type, stopping recursion`);
      }
    } else {
      console.log(`[AutoFeel] 🏁 Depth ${depth}: No new fields appeared, stopping recursion`);
    }
  } else {
    console.log(`[AutoFeel] 🏁 Depth ${depth}: No fields found after filling`);
  }

  return { success: true, filledCount, totalTokens };
}

