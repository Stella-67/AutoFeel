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
    console.log('[AutoFeel] Step 1: Saving raw content to buffer for immediate use...');

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

    console.log('[AutoFeel] ✓ Raw content saved to buffer. Starting background processing...');
    console.log('');

    // ==================== BACKGROUND PROCESSING ====================
    // Continue processing asynchronously without blocking
    (async () => {
      try {
        console.log('[AutoFeel Background] Starting background processing...');

        const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName', 'systemPrompt']);

        if (!config.apiKey || !config.apiEndpoint || !config.modelName) {
          console.error('[AutoFeel Background] LLM API not configured, skipping processing');
          return;
        }

        // === Text Cleaning Pipeline ===

        // Step 1: LLM Pre-Cleaning
        console.log('[AutoFeel Background] Step 2: LLM Pre-Cleaning...');
        const preCleaningResult = await llmPreCleaning(rawContent, config);

        if (!preCleaningResult.success) {
          console.error('[AutoFeel Background] Pre-cleaning failed:', preCleaningResult.error);
          return;
        }

        // Step 2: Post-LLM Cleanup
        console.log('[AutoFeel Background] Step 3: Post-LLM Cleanup...');
        const cleanupResult = postLLMCleanup(preCleaningResult.data);

        // Step 3: Chunk Builder
        console.log('[AutoFeel Background] Step 4: Building Chunks...');
        const chunkResult = chunkBuilder(cleanupResult, preCleaningResult.data);

        // Step 4: Build Memory-Ready Data
        console.log('[AutoFeel Background] Step 5: Finalizing...');
        const memoryReady = buildMemoryReadyData(
          chunkResult.chunks,
          rawContent,
          preCleaningResult.data,
          cleanupResult
        );

        // Step 5: Build Schemas
        console.log('[AutoFeel Background] Step 6: Building schemas...');

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

        // Step 6: Generate Vector Embeddings (optional, only for OpenAI provider)
        if (config.llmProvider === 'openai' || config.llmProvider === 'custom') {
          console.log('[AutoFeel Background] Step 7: Generating embeddings for semantic search...');

          try {
            const chunksWithEmbeddings = await generateChunkEmbeddings(chunkSchemas, config);
            chunkSchemas = chunksWithEmbeddings;
            console.log('[AutoFeel Background] ✓ Generated embeddings for all chunks');
          } catch (embError) {
            console.warn('[AutoFeel Background] Failed to generate embeddings, continuing without:', embError);
          }
        } else {
          console.log('[AutoFeel Background] Skipping embeddings (not supported for this provider)');
        }

        // Update savedContext with processed data
        console.log('[AutoFeel Background] Step 8: Updating buffer with processed data...');
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
        console.log('[AutoFeel Background] Step 9: Analyzing save strategy...');

        let saveResult = null;
        try {
          await memoryDB.init();

          // Create decision agent
          const decisionAgent = new DecisionAgent(memoryDB);

          // Analyze what to do
          const decision = await decisionAgent.decide(documentSchema, chunkSchemas);
          console.log('[AutoFeel Background] Decision:', decisionAgent.explainDecision(decision));

          // Execute the decision
          saveResult = await decisionAgent.execute(decision, documentSchema, chunkSchemas);

          console.log('[AutoFeel Background] Save completed:', saveResult);
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

    console.log('='.repeat(80));
    console.log('[AutoFeel Debug] 🔍 OPTION+V AUTO-FILL STARTED');
    console.log('='.repeat(80));
    console.log(`[AutoFeel Debug] Step 1: Detected ${formFields.length} form fields:`);
    formFields.forEach((field, index) => {
      console.log(`  Field ${index}:`, {
        label: field.label,
        placeholder: field.placeholder,
        type: field.type,
        name: field.name
      });
    });
    console.log('');

    // Clear filled field tracking (start fresh)
    console.log('[AutoFeel] 🗑️🗑️🗑️ SENDING CLEAR_FILLED_FIELDS 🗑️🗑️🗑️');
    try {
      const clearResult = await chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_FILLED_FIELDS' });
      console.log('[AutoFeel] ✓ CLEAR_FILLED_FIELDS result:', clearResult);
    } catch (e) {
      console.warn('[AutoFeel] ⚠️ CLEAR_FILLED_FIELDS failed (old content script?):', e.message);
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

      const answer = await generateSingleFieldAnswer(field, savedContext, config);
      console.log(`[AutoFeel] 🎯 answer.success = ${answer.success}, answer.data =`, answer.data);

      // Fill the field (or show hint if empty)
      if (answer.success) {
        // CRITICAL: Mark as filled FIRST to prevent re-detection
        console.log(`[AutoFeel] 📤📤📤 SENDING MARK_AS_FILLED for ${field.id} (${field.label}) 📤📤📤`);
        try {
          const markResult = await chrome.tabs.sendMessage(tab.id, {
            type: 'MARK_AS_FILLED',
            fieldId: field.id,
            fieldLabel: field.label,
            fieldName: field.name,  // Pass name for composite key
            fieldType: field.type   // Pass type for composite key
          });
          console.log(`[AutoFeel] ✓ MARK_AS_FILLED result:`, markResult);
        } catch (markError) {
          console.error(`[AutoFeel] ❌ MARK_AS_FILLED failed:`, markError);
        }

        // Then try to fill
        const fillResult = await chrome.tabs.sendMessage(tab.id, {
          type: 'FILL_SINGLE_FIELD',
          fieldId: field.id,
          answer: answer.data
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
            const delta = newCount - (oldCount - 1);
            console.log(`[AutoFeel] 🔄 Remaining fields changed: ${oldCount} → ${newCount} (${delta > 0 ? '+' : ''}${delta})`);
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
      console.warn('[AutoFeel] ⚠️ Reached maximum iteration limit. Stopping to prevent infinite loop.');
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

async function generateSingleFieldAnswer(field, savedContext, config) {
  const { llmProvider, apiKey, apiEndpoint, modelName } = config;

  try {
    // ==================== RAG: Retrieve Relevant Knowledge ====================
    let retrievedContext = '';
    const queryText = `${field.label || ''} ${field.placeholder || ''}`.trim();

    console.log('─'.repeat(80));
    console.log(`[AutoFeel Debug] 📝 FIELD: "${queryText}"`);
    if (field.options && field.options.length > 0) {
      console.log(`[AutoFeel Debug] 📋 Field type: ${field.type} with ${field.options.length} options`);
      console.log('[AutoFeel Debug] Available options:', field.options.map(o => o.label).join(', '));
    }
    console.log('─'.repeat(80));

    if (queryText) {
      try {
        if (llmProvider === 'openai' || llmProvider === 'custom') {
          // Use semantic search with embeddings
          console.log('[AutoFeel Debug] Step 1: Generating embedding for query...');
          const queryEmbedding = await generateEmbedding(queryText, config);

          if (queryEmbedding) {
            console.log('[AutoFeel Debug] Step 2: Searching for relevant context (semantic search, top 3 chunks)...');
            await memoryDB.init();
            const searchResults = await memoryDB.semanticSearch(queryEmbedding, 3);

            if (searchResults && searchResults.length > 0) {
              console.log(`[AutoFeel Debug] ✅ Found ${searchResults.length} relevant chunks:\n`);

              searchResults.forEach((chunk, index) => {
                console.log(`  📄 Chunk ${index + 1}:`);
                console.log(`     Similarity: ${(chunk.similarity * 100).toFixed(1)}%`);
                console.log(`     Source: ${chunk.source.title}`);
                console.log(`     URL: ${chunk.source.url || 'N/A'}`);
                console.log(`     Content Preview: ${chunk.text.substring(0, 150)}${chunk.text.length > 150 ? '...' : ''}`);
                console.log(`     Full Content: ${chunk.text}`);
                console.log('');
              });

              retrievedContext = searchResults.map((chunk, index) => {
                return `[Retrieved Knowledge ${index + 1}] (Relevance: ${(chunk.similarity * 100).toFixed(1)}%)
Source: ${chunk.source.title}
Content: ${chunk.text}`;
              }).join('\n\n');
            } else {
              console.log('[AutoFeel Debug] ⚠️  No relevant chunks found in knowledge base');
            }
          } else {
            console.log('[AutoFeel Debug] ⚠️  Failed to generate embedding');
          }
        } else {
          // Use keyword-based search for providers without embedding support
          console.log(`[AutoFeel Debug] Step 1: Provider '${llmProvider}' does not support embeddings`);
          console.log('[AutoFeel Debug] Step 2: Using keyword-based search instead (top 3 chunks)...');

          await memoryDB.init();
          const searchResults = await memoryDB.keywordSearch(queryText, 3);

          if (searchResults && searchResults.length > 0) {
            console.log(`[AutoFeel Debug] ✅ Found ${searchResults.length} relevant chunks:\n`);

            searchResults.forEach((chunk, index) => {
              console.log(`  📄 Chunk ${index + 1}:`);
              console.log(`     Relevance: ${(chunk.similarity * 100).toFixed(1)}%`);
              console.log(`     Source: ${chunk.source.title}`);
              console.log(`     URL: ${chunk.source.url || 'N/A'}`);
              console.log(`     Content Preview: ${chunk.text.substring(0, 150)}${chunk.text.length > 150 ? '...' : ''}`);
              console.log(`     Full Content: ${chunk.text}`);
              console.log('');
            });

            retrievedContext = searchResults.map((chunk, index) => {
              return `[Retrieved Knowledge ${index + 1}] (Relevance: ${(chunk.similarity * 100).toFixed(1)}%)
Source: ${chunk.source.title}
Content: ${chunk.text}`;
            }).join('\n\n');
          } else {
            console.log('[AutoFeel Debug] ⚠️  No relevant chunks found using keyword search');
          }
        }
      } catch (ragError) {
        console.error('[AutoFeel Debug] ❌ RAG error:', ragError);
      }
    } else {
      console.log('[AutoFeel Debug] ⏭️  No query text, skipping retrieval');
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

CRITICAL: If the question has numbered options (1, 2, 3...), you MUST return ONLY the number in the "answer" field, NOT the option text.

If you cannot answer, set answer to "" and provide a brief explanation of why.`;

    let userPrompt = '';

    if (retrievedContext) {
      userPrompt += `=== RELEVANT INFORMATION ===\n${retrievedContext}\n\n`;
    } else if (savedContext) {
      // Fallback to savedContext only if no chunks were retrieved
      console.log('[AutoFeel Debug] No chunks retrieved, using savedContext as fallback');
      const contextText = savedContext.llmAnalysis || savedContext.pageContent.text;
      const truncatedContext = contextText.length > 2000
        ? contextText.substring(0, 2000) + '...[truncated]'
        : contextText;

      userPrompt += `=== USER CONTEXT ===\n${truncatedContext}\n\n`;
    } else {
      console.log('[AutoFeel Debug] ⚠️  No context available (neither retrieved chunks nor savedContext)');
    }

    userPrompt += `=== QUESTION ===\n${queryText}\n\n`;

    // If field has options (radio/select), include them
    console.log('[AutoFeel Debug] Building prompt - field has options?', !!field.options, 'Count:', field.options?.length || 0);
    if (field.options && field.options.length > 0) {
      userPrompt += `=== AVAILABLE OPTIONS ===\n`;
      field.options.forEach((option, index) => {
        userPrompt += `${index + 1}. ${option.label}\n`;
      });
      userPrompt += `\n`;
      userPrompt += `CRITICAL REQUIREMENT:\n`;
      userPrompt += `- Your "answer" field MUST be ONLY a number from 1 to ${field.options.length}\n`;
      userPrompt += `- NEVER return text, NEVER return the option label\n`;
      userPrompt += `- ONLY return the number (e.g., "3")\n`;
      userPrompt += `- Use reasoning to pick the BEST matching option\n`;
      userPrompt += `- If no option fits, return "" (empty string)\n\n`;
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

    console.log('[AutoFeel Debug] Step 3: LLM response received');
    console.log('[AutoFeel Debug] Raw LLM output:', content);

    const tokenUsage = extractTokenUsage(llmProvider, data);
    if (tokenUsage) {
      console.log('[AutoFeel Debug] Token usage:', tokenUsage);
      await updateTokenUsage(llmProvider, tokenUsage);
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AutoFeel Debug] ❌ Failed to parse JSON from LLM response');
      return {
        success: false,
        error: 'LLM did not return valid JSON'
      };
    }

    const result = JSON.parse(jsonMatch[0]);
    console.log('[AutoFeel Debug] Parsed result:', result);

    // ==================== Validate and Fix Option Fields ====================
    console.log('[AutoFeel Debug] Field has options?', !!field.options, 'Count:', field.options?.length || 0);

    // If this is an option field (select/radio), ensure answer is a valid number
    if (field.options && field.options.length > 0 && result.answer) {
      const answerStr = String(result.answer).trim();
      const answerNum = parseInt(answerStr);

      // Check if answer is a valid option number
      const isValidNumber = !isNaN(answerNum) && answerNum >= 1 && answerNum <= field.options.length;

      if (!isValidNumber) {
        // LLM returned text instead of number - try to fix it
        console.warn('[AutoFeel Debug] ⚠️ LLM returned text instead of number:', answerStr);
        console.warn('[AutoFeel Debug] Attempting to convert to option number...');

        const answerLower = answerStr.toLowerCase();
        let matchedIndex = -1;

        // Try to find matching option
        for (let i = 0; i < field.options.length; i++) {
          const optionLabel = field.options[i].label.toLowerCase();
          if (optionLabel === answerLower || optionLabel.includes(answerLower)) {
            matchedIndex = i + 1; // Convert to 1-based
            break;
          }
        }

        if (matchedIndex > 0) {
          console.warn(`[AutoFeel Debug] ✓ Converted "${answerStr}" to option ${matchedIndex}: "${field.options[matchedIndex - 1].label}"`);
          result.answer = String(matchedIndex);
        } else {
          console.error(`[AutoFeel Debug] ❌ Could not convert "${answerStr}" to valid option number`);
          console.error('[AutoFeel Debug] Available options:', field.options.map((o, i) => `${i+1}. ${o.label}`).join(', '));
          // Keep original answer, let contentScript handle the fallback
        }
      } else {
        console.log('[AutoFeel Debug] ✅ Valid option number:', answerNum);
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

