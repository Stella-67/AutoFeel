// ==================== Memory Storage Handler ====================
// Handles Alt+C command - Save page content to memory

/**
 * Handle Alt+C command - Send page content to LLM and save to memory
 * 1. Immediately save raw content to buffer (for quick Alt+V access)
 * 2. Process in background (LLM cleaning, chunking, decision-making, database save)
 */
async function handleSendToLLM() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      console.error('[MemoryStorage] No active tab found');
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
      console.error('[MemoryStorage] Cannot run on special pages:', tab.url);
      console.error('[MemoryStorage] This extension only works on regular web pages (http:// or https://)');
      return;
    }

    await notifyTab(tab.id, 'Fetching page content...', 'loading');

    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT' });
    } catch (error) {
      console.error('[MemoryStorage] Failed to communicate with content script:', error);
      console.error('[MemoryStorage] Please refresh the page (F5) and try again.');
      console.error('[MemoryStorage] If the problem persists, this page may not support content scripts.');
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

    console.log('[MemoryStorage] Saved to buffer. Processing in background...');

    // ==================== BACKGROUND PROCESSING ====================
    // Continue processing asynchronously without blocking
    (async () => {
      try {

        const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName', 'systemPrompt']);

        if (!config.apiKey || !config.apiEndpoint || !config.modelName) {
          console.error('[MemoryStorage Background] LLM API not configured, skipping processing');
          return;
        }

        // === Text Cleaning Pipeline ===
        const preCleaningResult = await llmPreCleaning(rawContent, config);

        if (!preCleaningResult.success) {
          console.error('[MemoryStorage Background] Pre-cleaning failed:', preCleaningResult.error);
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
            console.log('[MemoryStorage] Generated embeddings for semantic search');
          } catch (embError) {
            console.warn('[MemoryStorage] Failed to generate embeddings:', embError);
          }
        }

        // ==================== Card Architecture: Calculate Surprise & Confidence ====================
        try {
          // SurpriseDetector and ConfidenceCalculator are loaded globally via importScripts in background.js
          // const SurpriseDetector = require('../../core/surprise-detector.js');
          // const ConfidenceCalculator = require('../../core/confidence-calculator.js');

          // Initialize database to get existing cards
          await memoryDB.init();

          // Get existing cards for surprise calculation
          const existingCards = await memoryDB.getAllChunks();

          const surpriseDetector = new SurpriseDetector();
          const confidenceCalc = new ConfidenceCalculator();

          console.log('[MemoryStorage] 🎯 Calculating surprise and confidence for new cards...');

          for (const chunk of chunkSchemas) {
            // Calculate surprise (how novel is this information?)
            chunk.surprise = await surpriseDetector.calculateSurprise(chunk, existingCards);

            // Calculate confidence (how reliable is this information?)
            chunk.confidence = confidenceCalc.calculateConfidence(chunk, {
              sourceReliability: 0.7,  // Default source reliability (can be adjusted)
              existingCards: existingCards
            });

            console.log(
              `[MemoryStorage] Card ${chunk.chunk_id}: ` +
              `surprise=${chunk.surprise.toFixed(2)}, ` +
              `confidence=${chunk.confidence.toFixed(2)}`
            );
          }

          console.log('[MemoryStorage] ✅ Calculated surprise and confidence for all new cards');
        } catch (cardError) {
          console.warn('[MemoryStorage] Failed to calculate card metrics:', cardError);
          // Continue with default values (already set in schema-builder)
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

          // Prepare LLM config for the agent
          const llmConfig = {
            llmProvider: config.llmProvider,
            apiKey: config.apiKey,
            apiEndpoint: config.apiEndpoint,
            modelName: config.modelName
          };

          // Analyze what to do (LLM-powered decision)
          const decision = await decisionAgent.decide(documentSchema, chunkSchemas, llmConfig);
          console.log('[MemoryStorage] 🤖 LLM Decision:', decisionAgent.explainDecision(decision));

          // Execute the decision (with chunk-level analysis)
          saveResult = await decisionAgent.execute(decision, documentSchema, chunkSchemas, llmConfig);
        } catch (dbError) {
          console.error('[MemoryStorage Background] Failed to save to database:', dbError);
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

        console.log('[MemoryStorage Background] ✅ Background processing complete!');
        await notifyTab(tab.id, completionMessage, 'success');

      } catch (bgError) {
        console.error('[MemoryStorage Background] Error during background processing:', bgError);
        await notifyTab(tab.id, `Background processing error: ${bgError.message}`, 'error');
      }
    })(); // Immediately invoke the async function

  } catch (error) {
    console.error('[MemoryStorage] Error in handleSendToLLM:', error);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await notifyTab(tab.id, `Error: ${error.message}`, 'error');
      }
    } catch (e) {
      console.error('[MemoryStorage] Failed to show error notification:', e);
    }
  }
}
