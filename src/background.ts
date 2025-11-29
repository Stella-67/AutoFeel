import {
  initializeStorage,
  getProfile,
  getSettings,
  saveGeneratedAnswer,
  updateGeneratedAnswer,
  incrementStoryUsage,
  updateLLMSettings,
  updateSettings,
  updateProfile,
  clearAllData,
} from './storage';
import { LLMProvider, createFormAnswerSystemPrompt } from './llm';
import { Message, GeneratedAnswer, LLMRequest } from './types';
import { generateUUID } from './utils';

/**
 * Background Service Worker
 * Handles:
 * - LLM API calls
 * - Message routing between content scripts and popup
 * - Storage management
 * - Answer generation and approval workflow
 */

let llmProvider: LLMProvider;

// Initialize on service worker start
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[FormAutoFill] Extension installed/updated');
  await initializeStorage();
  llmProvider = new LLMProvider();
  await llmProvider.initialize();
});

// Initialize on startup
llmProvider = new LLMProvider();
initializeStorage().then(() => {
  llmProvider.initialize();
});

/**
 * Message listener - handles requests from content scripts and popup
 */
chrome.runtime.onMessage.addListener((request: Message, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true; // Keep channel open for async response
});

/**
 * Main message handler
 */
async function handleMessage(request: Message, sender: any, sendResponse: any) {
  try {
    console.log('[FormAutoFill] Received message:', request.action);

    switch (request.action) {
      case 'generateAnswer':
        await handleGenerateAnswer(request.payload, sendResponse);
        break;

      case 'getProfile':
        const profile = await getProfile();
        sendResponse({ success: true, data: profile });
        break;

      case 'getSettings':
        const settings = await getSettings();
        sendResponse({ success: true, data: settings });
        break;

      case 'approveAnswer':
        await handleApproveAnswer(request.payload, sendResponse);
        break;

      case 'saveLLMSettings':
        console.log('[FormAutoFill] Saving LLM settings:', {
          provider: request.payload.provider,
          model: request.payload.model,
          hasApiKey: !!request.payload.apiKey
        });

        try {
          await updateLLMSettings(
            request.payload.apiKey,
            request.payload.provider,
            request.payload.model
          );
          console.log('[FormAutoFill] Settings saved, re-initializing LLM provider...');

          // Re-initialize LLM provider with new settings
          await llmProvider.initialize();
          console.log('[FormAutoFill] LLM provider initialized');

          sendResponse({ success: true });
        } catch (error) {
          console.error('[FormAutoFill] Error in saveLLMSettings:', error);
          sendResponse({ success: false, error: (error as Error).message });
        }
        break;

      case 'saveSettings':
        await updateSettings(request.payload);
        sendResponse({ success: true });
        break;

      case 'saveAutoFillSettings':
        const currentSettingsForAutoFill = await getSettings();
        currentSettingsForAutoFill.autoFill = {
          ...currentSettingsForAutoFill.autoFill,
          ...request.payload,
        };
        await updateSettings(currentSettingsForAutoFill);
        sendResponse({ success: true });
        break;

      case 'saveStyleSettings':
        const currentSettingsForStyle = await getSettings();
        currentSettingsForStyle.customPromptStyle = {
          ...currentSettingsForStyle.customPromptStyle,
          ...request.payload,
        };
        await updateSettings(currentSettingsForStyle);
        sendResponse({ success: true });
        break;

      case 'saveProfile':
        await updateProfile(request.payload);
        sendResponse({ success: true });
        break;

      case 'importData':
        if (request.payload.profile) {
          await updateProfile(request.payload.profile);
        }
        if (request.payload.settings) {
          await updateSettings(request.payload.settings);
        }
        sendResponse({ success: true });
        break;

      case 'clearAllData':
        await clearAllData();
        sendResponse({ success: true });
        break;

      case 'webappToolCall':
        await handleWebAppToolCall(request.payload, sendResponse);
        break;

      case 'fillField':
        // Forward to content script in the tab
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(
            sender.tab.id,
            {
              action: 'fillField',
              fieldSelector: request.payload.fieldSelector,
              answer: request.payload.answer,
            },
            (response) => {
              sendResponse(response);
            }
          );
        }
        break;

      default:
        sendResponse({ error: 'Unknown action', action: request.action });
    }
  } catch (error) {
    console.error('[FormAutoFill] Error in message handler:', error);
    sendResponse({
      error: (error as Error).message,
    });
  }
}

/**
 * Handle generating an answer for a form question
 */
async function handleGenerateAnswer(payload: any, sendResponse: any) {
  try {
    const { question, context, customization, fieldId, fieldSelector } = payload;

    if (!question) {
      sendResponse({ error: 'Question is required' });
      return;
    }

    // Get user profile and settings
    const profile = await getProfile();
    const settings = await getSettings();

    // Check if API key is configured
    if (!settings.llm.apiKey) {
      sendResponse({
        error: 'LLM API key not configured. Please set it in the extension settings.',
      });
      return;
    }

    // Prepare LLM request
    const llmRequest: LLMRequest = {
      userProfile: profile,
      question,
      context: context || extractPageContext(),
      customization: customization || settings.customPromptStyle,
      systemPrompt: createFormAnswerSystemPrompt(),
    };

    // Generate answer using LLM
    const response = await llmProvider.generateAnswer(llmRequest);

    // Create answer record
    const answerId = generateUUID();
    const generatedAnswer: GeneratedAnswer = {
      id: answerId,
      questionId: fieldId || generateUUID(),
      originalQuestion: question,
      generatedAnswer: response.answer,
      timestamp: new Date().toISOString(),
      status: settings.autoFill.requireApproval ? 'pending' : 'approved',
      userApproved: !settings.autoFill.requireApproval,
      customization: customization || settings.customPromptStyle,
      sourceReferences: [], // Could track which stories/experiences were used
    };

    // Save to storage
    await saveGeneratedAnswer(generatedAnswer);

    // If not requiring approval, auto-fill the field
    if (!settings.autoFill.requireApproval && fieldSelector) {
      // Field will be filled through fillField action
    }

    sendResponse({
      success: true,
      data: {
        answerId,
        answer: response.answer,
        status: generatedAnswer.status,
      },
    });
  } catch (error) {
    console.error('[FormAutoFill] Error generating answer:', error);
    sendResponse({
      error: (error as Error).message,
    });
  }
}

/**
 * Handle user approving a generated answer
 */
async function handleApproveAnswer(payload: any, sendResponse: any) {
  try {
    const { answerId, approved, fieldSelector } = payload;

    if (!answerId) {
      sendResponse({ error: 'Answer ID is required' });
      return;
    }

    // Get the generated answer and update status
    const answers = (await chrome.storage.local.get('generatedAnswers')).generatedAnswers || [];
    const answer = answers.find((a: any) => a.id === answerId);

    if (!answer) {
      sendResponse({ error: 'Answer not found' });
      return;
    }

    if (approved) {
      answer.status = 'filled';
      answer.userApproved = true;

      // If field selector provided, fill it
      if (fieldSelector) {
        // Send fill request to content script
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            {
              action: 'fillField',
              fieldSelector,
              answer: answer.generatedAnswer,
            },
            (response) => {
              if (response?.success) {
                answer.status = 'filled';
              }
            }
          );
        }
      }
    } else {
      answer.status = 'rejected';
      answer.userApproved = false;
    }

    // Update in storage
    await updateGeneratedAnswer(answerId, answer);

    sendResponse({
      success: true,
      data: {
        status: answer.status,
      },
    });
  } catch (error) {
    console.error('[FormAutoFill] Error approving answer:', error);
    sendResponse({
      error: (error as Error).message,
    });
  }
}

/**
 * Extract context from the current page (for LLM)
 * Note: Service Worker cannot access document directly
 */
function extractPageContext(): string {
  // Context should be passed from content script or popup
  return '';
}

/**
 * WebApp Integration: Handle tool calls from webapp
 * Relayed through webapp-bridge content script
 */
async function handleWebAppToolCall(payload: any, sendResponse: any) {
  try {
    const { toolName, arguments: args } = payload;
    let result;

    switch (toolName) {
      case 'detectForms':
        result = await handleDetectFormsTool(args);
        break;

      case 'fillField':
        result = await handleFillFieldTool(args);
        break;

      case 'ping':
        result = { success: true, message: 'Extension is connected' };
        break;

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }

    sendResponse({
      success: true,
      result
    });

  } catch (error) {
    console.error('[FormAutoFill] Error executing webapp tool:', error);
    sendResponse({
      success: false,
      error: (error as Error).message
    });
  }
}

/**
 * Tool: detectForms
 * Detects form fields on the active tab
 */
async function handleDetectFormsTool(args: any) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab?.id) {
    throw new Error('No active tab found');
  }

  // Send message to content script
  const response = await chrome.tabs.sendMessage(tab.id, {
    action: 'getPageQuestions',
    includeHidden: args.includeHidden || false
  });

  return {
    fields: response?.questions || [],
    url: tab.url || '',
    pageTitle: tab.title || ''
  };
}

/**
 * Tool: fillField
 * Fills a form field on the active tab
 */
async function handleFillFieldTool(args: any) {
  const { fieldId, value, verify } = args;

  if (!fieldId || !value) {
    throw new Error('fieldId and value are required');
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab?.id) {
    throw new Error('No active tab found');
  }

  // Send message to content script
  const response = await chrome.tabs.sendMessage(tab.id, {
    action: 'fillField',
    fieldSelector: `[data-field-id="${fieldId}"]`,
    answer: value
  });

  if (!response?.success) {
    throw new Error(response?.error || 'Failed to fill field');
  }

  return {
    success: true,
    fieldLabel: fieldId,
    filledValue: value
  };
}
