import {
  initializeStorage,
  getProfile,
  getSettings,
  saveGeneratedAnswer,
  updateGeneratedAnswer,
  incrementStoryUsage,
} from './storage';
import { LLMProvider, createFormAnswerSystemPrompt, buildProfileSummary, selectRelevantStories } from './llm';
import { Message, GeneratedAnswer, LLMRequest } from './types';
import { v4 as uuidv4 } from 'uuid';

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
    const answerId = uuidv4();
    const generatedAnswer: GeneratedAnswer = {
      id: answerId,
      questionId: fieldId || uuidv4(),
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
 */
function extractPageContext(): string {
  return `Page: ${document.title || 'Unknown'}`;
}

/**
 * Utility to generate UUID (fallback if uuid library not available)
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Replace uuid4 call with fallback if library not loaded
declare global {
  function uuidv4(): string;
}

if (typeof uuidv4 === 'undefined') {
  (globalThis as any).uuidv4 = generateUUID;
}
