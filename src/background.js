// ==================== AutoFeel Background Service Worker ====================
// Message Router - Delegates to specialized feature modules
//
// Architecture:
// - src/features/form-filling/       - Form auto-fill functionality
// - src/features/problem-solving/    - Problem solver functionality
// - src/features/memory-storage/     - Memory capture and storage
// - src/features/memory-retrieval/   - RAG and knowledge retrieval
// - src/features/knowledge-graph/    - Knowledge graph relationship analysis
// - src/shared/                      - Shared utilities

// ==================== Import Core Dependencies ====================
importScripts('/src/core/utils.js');
importScripts('/src/core/llm-service.js');
importScripts('/src/core/embedding-service.js');
importScripts('/src/core/text-processor.js');
importScripts('/src/core/schema-builder.js');
importScripts('/src/core/db.js');
importScripts('/src/core/decision-agent.js');

// ==================== Import Shared Utilities ====================
importScripts('/src/shared/notification-helper.js');

// ==================== Import Feature Modules ====================

// Memory Retrieval (used by form-filling)
importScripts('/src/features/memory-retrieval/memory-retrieval.js');

// Form Filling Feature
importScripts('/src/features/form-filling/submenu-handler.js');
importScripts('/src/features/form-filling/field-answer-generator.js');
importScripts('/src/features/form-filling/recursive-filler.js');
importScripts('/src/features/form-filling/form-filling-handler.js');

// Problem Solving Feature
importScripts('/src/features/problem-solving/problem-solver-handler.js');

// Memory Storage Feature
importScripts('/src/features/memory-storage/memory-storage-handler.js');

// Knowledge Graph Feature
importScripts('/src/features/knowledge-graph/relationship-analyzer.js');

// ==================== Message Router ====================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Route messages to appropriate feature modules

  // ===== API Configuration =====
  if (message.type === 'TEST_API') {
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
    return true;
  }

  // ===== Form Filling Feature =====
  if (message.type === 'FILL_SINGLE_FIELD_BY_CLICK') {
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
    return true;
  }

  if (message.type === 'SELECT_FROM_SUBMENU') {
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
    return true;
  }

  // ===== Problem Solving Feature =====
  if (message.action === 'SOLVE_PROBLEM') {
    (async () => {
      try {
        const answer = await handleSolveProblem(
          message.systemPrompt,
          message.userPrompt,
          message.options,
          message.screenshots || []
        );
        sendResponse({ success: true, answer });
      } catch (error) {
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    return true;
  }

  if (message.action === 'CAPTURE_SCREENSHOT') {
    (async () => {
      try {
        const result = await handleCaptureScreenshot();
        sendResponse(result);
      } catch (error) {
        console.error('[Background] Error capturing screenshot:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    return true;
  }

  // ===== Knowledge Graph Feature =====
  if (message.action === 'reanalyzeRelationships') {
    (async () => {
      try {
        const result = await handleReanalyzeRelationships(
          message.llmConfig,
          (progress) => {
            console.log(`[Background] Re-analysis progress: ${progress.current}/${progress.total}`);
          }
        );
        sendResponse(result);
      } catch (error) {
        console.error('[Background] Re-analysis error:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    return true;
  }

  // If no handler matched, return false
  return false;
});

// ==================== Command Listeners ====================

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'send-to-llm') {
    // Memory Storage: Alt+C
    await handleSendToLLM();
  } else if (command === 'auto-fill-form') {
    // Form Filling: Alt+V
    await handleAutoFillForm();
  }
});
