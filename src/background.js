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

    await notifyTab(tab.id, 'Fetching page content...', 'loading');

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT' });

    if (!response || !response.success) {
      await notifyTab(tab.id, 'Failed to get page content', 'error');
      return;
    }

    const rawContent = response.content;

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
      await notifyTab(tab.id, 'Please configure LLM API in extension settings', 'error');
      return;
    }

    // === Text Cleaning Pipeline ===

    // Step 1: LLM Pre-Cleaning
    await notifyTab(tab.id, 'LLM Pre-Cleaning...', 'loading');
    const preCleaningResult = await llmPreCleaning(rawContent, config);

    if (!preCleaningResult.success) {
      await notifyTab(tab.id, `Pre-cleaning failed: ${preCleaningResult.error}`, 'error');
      return;
    }

    // Step 2: Post-LLM Cleanup
    await notifyTab(tab.id, 'Post-LLM Cleanup...', 'loading');
    const cleanupResult = postLLMCleanup(preCleaningResult.data);

    // Step 3: Chunk Builder
    await notifyTab(tab.id, 'Building Chunks...', 'loading');
    const chunkResult = chunkBuilder(cleanupResult, preCleaningResult.data);

    // Step 4: Build Memory-Ready Data
    await notifyTab(tab.id, 'Finalizing...', 'loading');
    const memoryReady = buildMemoryReadyData(
      chunkResult.chunks,
      rawContent,
      preCleaningResult.data,
      cleanupResult
    );

    // Step 5: Build Schemas
    await notifyTab(tab.id, 'Building schemas...', 'loading');

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
      await notifyTab(tab.id, 'Generating embeddings for semantic search...', 'loading');

      try {
        const chunksWithEmbeddings = await generateChunkEmbeddings(chunkSchemas, config);
        chunkSchemas = chunksWithEmbeddings;
        console.log('[AutoFeel] Generated embeddings for all chunks');
      } catch (embError) {
        console.warn('[AutoFeel] Failed to generate embeddings, continuing without:', embError);
      }
    } else {
      console.log('[AutoFeel] Skipping embeddings (not supported for this provider)');
    }

    // Save for auto-fill
    await chrome.storage.local.set({
      savedContext: {
        pageContent: rawContent,
        llmAnalysis: memoryReady.cleanText,
        timestamp: new Date().toISOString(),
        sourceUrl: rawContent.metadata.url
      }
    });

    // ==================== REASONING: Analyze Situation & Decide ====================
    await notifyTab(tab.id, 'Analyzing context...', 'loading');

    let saveResult = null;
    try {
      await memoryDB.init();

      console.log('[AutoFeel] Searching for existing document...');
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

      await notifyTab(tab.id, 'Executing strategy...', 'loading');

      saveResult = await actionAgent.execute(
        agenticDecision,
        actionData,
        existingDoc
      );

      console.log('[AutoFeel Agentic] Action executed:', saveResult);
    } catch (dbError) {
      console.error('[AutoFeel] Failed to save to database:', dbError);
      await notifyTab(tab.id, `Warning: Failed to save to memory database: ${dbError.message}`, 'error');
    }

    // Build success message
    let successMessage = '';

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
          successMessage = `⏭️ Skipped: ${saveResult.reason}`;
          if (reasoningContext.similarity) {
            successMessage += ` (${(reasoningContext.similarity * 100).toFixed(0)}% similar)`;
          }
          break;

        case 'updated':
          successMessage = `🔄 Updated: ${documentSchema.title.substring(0, 40)}... (v${saveResult.version}, ${saveResult.newChunkCount} chunks)`;
          break;

        case 'created':
        default:
          successMessage = `${emoji} Saved: ${documentSchema.title.substring(0, 40)}... (${saveResult.chunkCount} chunks)`;
          break;
      }
    } else {
      successMessage = '✅ Content processed';
    }

    if (preCleaningResult.tokenUsage) {
      successMessage += ` [${preCleaningResult.tokenUsage.totalTokens.toLocaleString()} tokens]`;
    }

    await notifyTab(tab.id, successMessage, 'success');

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

    await notifyTab(tab.id, 'Detecting form fields...', 'loading');

    const { savedContext } = await chrome.storage.local.get(['savedContext']);

    if (!savedContext) {
      await notifyTab(tab.id, 'No saved context found. Please use Alt+C first to analyze a page.', 'error');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_FORM_FIELDS' });

    if (!response || !response.success) {
      await notifyTab(tab.id, 'Failed to detect form fields', 'error');
      return;
    }

    const formFields = response.fields;

    if (formFields.length === 0) {
      await notifyTab(tab.id, 'No form fields found on this page', 'error');
      return;
    }

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

    console.log('[AutoFeel RAG] Query text:', queryText);

    if (queryText && (llmProvider === 'openai' || llmProvider === 'custom')) {
      try {
        const queryEmbedding = await generateEmbedding(queryText, config);

        if (queryEmbedding) {
          console.log('[AutoFeel RAG] Generated query embedding');

          await memoryDB.init();
          const searchResults = await memoryDB.semanticSearch(queryEmbedding, 5);

          if (searchResults && searchResults.length > 0) {
            console.log(`[AutoFeel RAG] Found ${searchResults.length} relevant chunks`);

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

            console.log('[AutoFeel RAG] Retrieval stats:', retrievalStats);
          }
        }
      } catch (ragError) {
        console.error('[AutoFeel RAG] Retrieval error:', ragError);
      }
    }

    // ==================== Build Enhanced Prompt with RAG ====================
    const systemPrompt = `You are an AI assistant that helps fill out forms based on provided information.
You will receive:
1. Retrieved knowledge from the user's personal knowledge base (if available)
2. Information from a previous page (the user's background, resume, or other context)
3. A list of form fields with their questions/labels

Your task is to generate appropriate answers for each form field based on ALL the provided context.
**Prioritize information from the retrieved knowledge base when available**, as it represents the user's curated information.

Respond ONLY with a JSON object where keys are field IDs and values are the answers.

Example response format:
{
  "field_0": "answer for first field",
  "field_1": "answer for second field"
}`;

    let userPrompt = '';

    if (retrievedContext) {
      userPrompt += `=== RETRIEVED KNOWLEDGE FROM USER'S KNOWLEDGE BASE ===
${retrievedContext}

`;
    }

    userPrompt += `=== CONTEXT FROM PREVIOUS PAGE ===
${savedContext.pageContent.text}

Previous LLM Analysis:
${savedContext.llmAnalysis}

`;

    userPrompt += `=== FORM FIELDS TO FILL ===
${formFields.map((field, index) =>
  `Field ${index} (ID: field_${index}):
  Label: ${field.label}
  Placeholder: ${field.placeholder}
  Type: ${field.type}
  Current Value: ${field.value}
`).join('\n')}

Please generate appropriate answers for each field based on the context provided above.
${retrievedContext ? '**Prioritize information from the retrieved knowledge base.**' : ''}
Return ONLY a JSON object.`;

    const requestBody = buildLLMRequestBody(llmProvider, modelName, userPrompt, systemPrompt, {
      maxTokens: 2000,
      temperature: 0.7
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

    console.log('[AutoFeel] LLM raw response:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AutoFeel] No JSON found in LLM response');
      return {
        success: false,
        error: 'LLM did not return valid JSON'
      };
    }

    const answers = JSON.parse(jsonMatch[0]);
    console.log('[AutoFeel] Parsed answers:', JSON.stringify(answers, null, 2));

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
