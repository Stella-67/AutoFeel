// ==================== AutoFeel Background Service Worker ====================
// Main orchestration layer - delegates to specialized modules

// Import all modules
importScripts('/src/utils.js');
importScripts('/src/llm-service.js');
importScripts('/src/embedding-service.js');
importScripts('/src/text-processor.js');
importScripts('/src/schema-builder.js');
importScripts('/src/db.js');
importScripts('/src/perception-agent.js');
importScripts('/src/reasoning-agent.js');
importScripts('/src/action-agent.js');

// ==================== Message Listeners ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

        // ==================== PERCEPTION: Observe Context ====================
        console.log('[AutoFeel Agentic] Starting perception...');

        await perceptionAgent.trackVisit(rawContent.metadata.url);
        const perception = await perceptionAgent.observe(rawContent);

        console.log('[AutoFeel Agentic] Perception complete:', {
          pageType: `${perception.currentPage.pageType}/${perception.currentPage.pageSubtype}`,
          confidence: perception.currentPage.confidence,
          visitCount: perception.userBehavior.visitCount,
          isRepeatedVisit: perception.userBehavior.isRepeatedVisit
        });

        rawContent.perception = perception;

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

        // ==================== REASONING: Analyze Situation & Decide ====================
        console.log('[AutoFeel Background] Step 9: Analyzing context...');

        let saveResult = null;
        try {
          await memoryDB.init();

          console.log('[AutoFeel Background] Searching for existing document...');
          const existingDoc = await memoryDB.findDocumentByUrl(documentSchema.url);

          const reasoningContext = {
            hasExisting: !!existingDoc,
            contentChanged: false,
            similarity: 1.0
          };

          if (existingDoc) {
            const updateCheck = memoryDB.shouldUpdateDocument(existingDoc, documentSchema);
            reasoningContext.contentChanged = updateCheck.shouldUpdate;
            reasoningContext.similarity = updateCheck.textSimilarity;
          }

          // Let reasoning agent decide what to do
          console.log('[AutoFeel Agentic] Starting reasoning...');
          const agenticDecision = await reasoningAgent.reason(perception, reasoningContext);

          console.log('[AutoFeel Agentic] Reasoning complete:');
          console.log(reasoningAgent.explainDecision(agenticDecision));

          // ==================== ACTION: Execute Strategy ====================
          console.log('[AutoFeel Agentic] Executing action...');

          await actionAgent.init(memoryDB);

          const actionData = {
            documentSchema: documentSchema,
            chunkSchemas: chunkSchemas
          };

          saveResult = await actionAgent.execute(
            agenticDecision,
            actionData,
            existingDoc
          );

          console.log('[AutoFeel Agentic] Action executed:', saveResult);
        } catch (dbError) {
          console.error('[AutoFeel Background] Failed to save to database:', dbError);
        }

        // Build completion message
        let completionMessage = '';

        if (saveResult && saveResult.success) {
          const pageTypeEmoji = {
            'profile': '👤',
            'document': '📑',
            'form': '📋',
            'content': '📄',
            'social': '💬',
            'utility': '⚙️',
            'unknown': '📄'
          };

          const emoji = pageTypeEmoji[perception.currentPage.pageType] || '📄';

          switch (saveResult.action) {
            case 'skipped':
              completionMessage = `Background processing complete. Already in memory.`;
              break;

            case 'updated':
              completionMessage = `🔄 Background processing complete. Updated in memory (v${saveResult.version}, ${saveResult.newChunkCount} chunks)`;
              break;

            case 'created':
            default:
              completionMessage = `${emoji} Background processing complete. Saved to memory (${saveResult.chunkCount} chunks)`;
              break;
          }
        } else {
          completionMessage = '✅ Background processing complete';
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

    await notifyTab(tab.id, `Found ${formFields.length} fields. Retrieving from knowledge base...`, 'loading');

    const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName']);

    if (!config.apiKey || !config.apiEndpoint || !config.modelName) {
      await notifyTab(tab.id, 'Please configure LLM API in extension settings', 'error');
      return;
    }

    const answers = await generateFormAnswers(formFields, savedContext, config);

    if (answers.success) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'FILL_FORM',
        answers: answers.data
      });

      let successMessage = 'Form filled successfully!';

      if (answers.retrievalStats) {
        successMessage += ` [RAG: Retrieved ${answers.retrievalStats.totalChunks} chunks, top relevance ${(answers.retrievalStats.topSimilarity * 100).toFixed(0)}%]`;
      }

      if (answers.tokenUsage) {
        successMessage += ` (${answers.tokenUsage.totalTokens.toLocaleString()} tokens)`;
      }

      await notifyTab(tab.id, successMessage, 'success');
    } else {
      await notifyTab(tab.id, `Failed to generate answers: ${answers.error}`, 'error');
    }
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

// ==================== RAG-Enhanced Form Answer Generation ====================

async function generateFormAnswers(formFields, savedContext, config) {
  const { llmProvider, apiKey, apiEndpoint, modelName } = config;

  try {
    // ==================== RAG: Retrieve Relevant Knowledge ====================
    let retrievedContext = '';
    let retrievalStats = null;

    const queryText = formFields.map(field =>
      `${field.label || ''} ${field.placeholder || ''}`
    ).filter(text => text.trim()).join(' ');

    console.log('[AutoFeel Debug] Step 2: RAG Retrieval');
    console.log(`[AutoFeel Debug] Query text: "${queryText}"`);
    console.log('');

    if (queryText && (llmProvider === 'openai' || llmProvider === 'custom')) {
      try {
        const queryEmbedding = await generateEmbedding(queryText, config);

        if (queryEmbedding) {
          console.log('[AutoFeel Debug] ✓ Generated query embedding');

          await memoryDB.init();
          const searchResults = await memoryDB.semanticSearch(queryEmbedding, 5);

          if (searchResults && searchResults.length > 0) {
            console.log(`[AutoFeel Debug] ✓ Found ${searchResults.length} relevant chunks from knowledge base:`);
            searchResults.forEach((chunk, index) => {
              console.log(`  Chunk ${index + 1}: ${(chunk.similarity * 100).toFixed(1)}% - "${chunk.source.title}"`);
              console.log(`    Preview: ${chunk.text.substring(0, 100)}...`);
            });

            retrievalStats = {
              totalChunks: searchResults.length,
              avgSimilarity: (searchResults.reduce((sum, r) => sum + r.similarity, 0) / searchResults.length).toFixed(3),
              topSimilarity: searchResults[0].similarity.toFixed(3)
            };

            retrievedContext = searchResults.map((chunk, index) => {
              return `[Retrieved Knowledge ${index + 1}] (Relevance: ${(chunk.similarity * 100).toFixed(1)}%)
Source: ${chunk.source.title}
Content: ${chunk.text}`;
            }).join('\n\n');

            console.log('[AutoFeel Debug] Retrieval stats:', retrievalStats);
            console.log('');
          } else {
            console.log('[AutoFeel Debug] ⚠ No relevant chunks found in knowledge base');
            console.log('');
          }
        } else {
          console.log('[AutoFeel Debug] ⚠ Failed to generate query embedding');
          console.log('');
        }
      } catch (ragError) {
        console.error('[AutoFeel Debug] ✗ RAG Retrieval error:', ragError);
        console.log('');
      }
    } else {
      console.log('[AutoFeel Debug] ⚠ RAG skipped (provider does not support embeddings or no query text)');
      console.log('');
    }

    // ==================== Build Enhanced Prompt with RAG ====================
    const systemPrompt = `You are an intelligent form-filling assistant. Your task is to fill out form fields based on the user's information.

IMPORTANT RULES:
1. Read each form field question carefully
2. Search the provided context for relevant information
3. Make reasonable inferences and educated guesses based on the context
4. If the context doesn't explicitly mention something but you can reasonably infer it, make that inference
5. For questions asking about levels (low/medium/high) or ratings, analyze the context and choose the most appropriate level
6. Keep answers concise and directly relevant to the question
7. Only return an empty string "" if you have absolutely no basis to answer the question
8. Return ONLY a valid JSON object with field IDs as keys

Examples:
- If asked "effort level" and context shows intensive 6-month research → answer "high"
- If asked "experience level" and context shows beginner work → answer "low"
- If asked "name" but no name in context → return ""

Response format:
{
  "field_0": "answer for first field",
  "field_1": "answer for second field"
}`;

    // Build form fields description with clear questions
    const fieldsDescription = formFields.map((field, index) => {
      const question = field.label || field.placeholder || field.name || `Field ${index}`;
      const fieldInfo = [
        `Question: ${question}`,
        field.type !== 'text' ? `Type: ${field.type}` : null
      ].filter(Boolean).join(' | ');

      return `field_${index}: ${fieldInfo}`;
    }).join('\n');

    let userPrompt = `I need to fill out a form. Here is my information and the form fields:\n\n`;

    // Add context - prioritize RAG results if available
    if (retrievedContext) {
      userPrompt += `=== MY SAVED INFORMATION (Most Relevant) ===\n${retrievedContext}\n\n`;
    }

    // Add a concise version of the saved context (limit length)
    const contextText = savedContext.llmAnalysis || savedContext.pageContent.text;
    const truncatedContext = contextText.length > 2000
      ? contextText.substring(0, 2000) + '...[truncated]'
      : contextText;

    userPrompt += `=== ADDITIONAL CONTEXT ===\n${truncatedContext}\n\n`;

    userPrompt += `=== FORM FIELDS TO FILL ===\n${fieldsDescription}\n\n`;

    userPrompt += `Please fill out each field based on my information. Use the context above to make informed decisions:
- Look for direct matches first
- If no direct match, make reasonable inferences based on the context
- For level/rating questions (low/medium/high), analyze the context and choose appropriately
- Be intelligent and thoughtful, not overly literal

Return ONLY the JSON object with answers.`;

    console.log('[AutoFeel Debug] Step 3: Building LLM Prompt');
    console.log('[AutoFeel Debug] System Prompt:');
    console.log(systemPrompt);
    console.log('');
    console.log('[AutoFeel Debug] User Prompt:');
    console.log(userPrompt);
    console.log('');
    console.log('[AutoFeel Debug] Prompt Stats:', {
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      totalLength: systemPrompt.length + userPrompt.length,
      hasRAGContext: !!retrievedContext,
      temperature: 0.3
    });
    console.log('');

    const requestBody = buildLLMRequestBody(llmProvider, modelName, userPrompt, systemPrompt, {
      maxTokens: 2000,
      temperature: 0.3  // Lower temperature for more focused, factual responses
    });
    const headers = buildLLMHeaders(llmProvider, apiKey);

    console.log('[AutoFeel Debug] Step 4: Calling LLM API...');
    console.log(`[AutoFeel Debug] Provider: ${llmProvider}, Model: ${modelName}`);
    console.log('');

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

    console.log('[AutoFeel Debug] Step 5: LLM Response Received');
    console.log('[AutoFeel Debug] Raw LLM response:');
    console.log(content);
    console.log('');
    if (tokenUsage) {
      console.log('[AutoFeel Debug] Token usage:', tokenUsage);
      console.log('');
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AutoFeel Debug] ✗ No JSON found in LLM response!');
      console.error('[AutoFeel Debug] This usually means the LLM did not follow instructions.');
      console.log('');
      return {
        success: false,
        error: 'LLM did not return valid JSON'
      };
    }

    console.log('[AutoFeel Debug] Step 6: Parsing Answers');
    console.log('[AutoFeel Debug] Extracted JSON:');
    console.log(jsonMatch[0]);
    console.log('');

    const answers = JSON.parse(jsonMatch[0]);
    console.log('[AutoFeel Debug] ✓ Parsed answers successfully:');
    console.log(JSON.stringify(answers, null, 2));
    console.log('');

    console.log('[AutoFeel Debug] Field Mapping:');
    Object.keys(answers).forEach(fieldId => {
      const fieldIndex = parseInt(fieldId.replace('field_', ''));
      const field = formFields[fieldIndex];
      if (field) {
        console.log(`  ${fieldId} (${field.label || field.placeholder}): "${answers[fieldId]}"`);
      }
    });
    console.log('');
    console.log('='.repeat(80));
    console.log('[AutoFeel Debug] ✅ AUTO-FILL COMPLETE');
    console.log('='.repeat(80));

    return {
      success: true,
      data: answers,
      tokenUsage: tokenUsage,
      retrievalStats: retrievalStats
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
