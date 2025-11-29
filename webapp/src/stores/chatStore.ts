/**
 * Chat state management with Zustand
 */

import { create } from 'zustand';
import type { Conversation, Message, ToolCall, ChatSettings } from '../types/chat';
import { TOOL_DEFINITIONS } from '../types/tools';
import { generateUUID } from '../utils/uuid';
import {
  saveConversation,
  getAllConversations,
  deleteConversation as dbDeleteConversation,
  updateConversationTitle,
  getSettings,
  saveSettings
} from '../services/storage/db';
import { LLMProvider } from '../services/llm/provider';
import { getExtensionBridge } from '../services/extension/bridge';

interface ChatState {
  // Data
  conversations: Conversation[];
  currentConversationId: string | null;
  settings: ChatSettings | null;

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;

  // Conversation actions
  createConversation: (title?: string) => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;

  // Message actions
  sendMessage: (content: string) => Promise<void>;
  executeToolCalls: (assistantMessageId: string, toolCalls: ToolCall[]) => Promise<void>;

  // Settings actions
  updateSettings: (settings: Partial<ChatSettings>) => Promise<void>;

  // Helpers
  getCurrentConversation: () => Conversation | null;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  settings: null,
  isLoading: false,
  error: null,

  /**
   * Initialize store - load data from IndexedDB
   */
  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      const [conversations, settings] = await Promise.all([
        getAllConversations(),
        getSettings()
      ]);

      set({
        conversations,
        settings,
        isLoading: false
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to initialize',
        isLoading: false
      });
    }
  },

  /**
   * Create new conversation
   */
  createConversation: (title = 'New Chat') => {
    const id = generateUUID();
    const conversation: Conversation = {
      id,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };

    set(state => ({
      conversations: [conversation, ...state.conversations],
      currentConversationId: id
    }));

    // Save to DB asynchronously
    saveConversation(conversation).catch(console.error);

    return id;
  },

  /**
   * Select conversation
   */
  selectConversation: (id: string) => {
    set({ currentConversationId: id });
  },

  /**
   * Delete conversation
   */
  deleteConversation: async (id: string) => {
    try {
      await dbDeleteConversation(id);

      set(state => {
        const conversations = state.conversations.filter(c => c.id !== id);
        const currentConversationId = state.currentConversationId === id
          ? (conversations[0]?.id || null)
          : state.currentConversationId;

        return { conversations, currentConversationId };
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to delete conversation' });
    }
  },

  /**
   * Rename conversation
   */
  renameConversation: async (id: string, title: string) => {
    try {
      await updateConversationTitle(id, title);

      set(state => ({
        conversations: state.conversations.map(c =>
          c.id === id ? { ...c, title, updatedAt: Date.now() } : c
        )
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to rename conversation' });
    }
  },

  /**
   * Send message and get AI response
   */
  sendMessage: async (content: string) => {
    const { currentConversationId, conversations, settings } = get();

    if (!currentConversationId) {
      set({ error: 'No conversation selected' });
      return;
    }

    if (!settings?.llm.apiKey) {
      set({ error: 'Please set your API key in settings' });
      return;
    }

    const conversation = conversations.find(c => c.id === currentConversationId);
    if (!conversation) {
      set({ error: 'Conversation not found' });
      return;
    }

    try {
      set({ isLoading: true, error: null });

      // Add user message
      const userMessage: Message = {
        id: generateUUID(),
        conversationId: currentConversationId,
        role: 'user',
        content,
        timestamp: Date.now()
      };

      conversation.messages.push(userMessage);
      conversation.updatedAt = Date.now();

      // Update UI
      set({ conversations: [...conversations] });

      // Get AI response
      const llmProvider = new LLMProvider(
        settings.llm.provider,
        settings.llm.apiKey,
        settings.llm.model
      );

      const response = await llmProvider.chatCompletion({
        messages: conversation.messages,
        tools: TOOL_DEFINITIONS
      });

      // Add assistant message
      const assistantMessage: Message = {
        id: generateUUID(),
        conversationId: currentConversationId,
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
        toolCalls: response.toolCalls,
        metadata: {
          model: settings.llm.model,
          tokens: response.usage ? {
            prompt: response.usage.promptTokens,
            completion: response.usage.completionTokens,
            total: response.usage.totalTokens
          } : undefined,
          finishReason: response.finishReason
        }
      };

      conversation.messages.push(assistantMessage);
      conversation.updatedAt = Date.now();

      // Update UI
      set({ conversations: [...conversations], isLoading: false });

      // Save to DB
      await saveConversation(conversation);

      // Execute tool calls if any
      if (response.toolCalls && settings.chat.autoToolExecution) {
        await get().executeToolCalls(assistantMessage.id, response.toolCalls);
      }

    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to send message',
        isLoading: false
      });
    }
  },

  /**
   * Execute tool calls and continue conversation
   */
  executeToolCalls: async (_assistantMessageId: string, toolCalls: ToolCall[]) => {
    const { currentConversationId, conversations } = get();
    const conversation = conversations.find(c => c.id === currentConversationId);
    if (!conversation) return;

    const bridge = getExtensionBridge();

    for (const toolCall of toolCalls) {
      try {
        let result: any;

        // Execute tool based on name
        const args = JSON.parse(toolCall.function.arguments);

        switch (toolCall.function.name) {
          case 'detectForms':
            result = await bridge.detectForms(args);
            break;
          case 'fillField':
            result = await bridge.fillField(args);
            break;
          default:
            throw new Error(`Unknown tool: ${toolCall.function.name}`);
        }

        // Add tool result message
        const toolMessage: Message = {
          id: generateUUID(),
          conversationId: currentConversationId!,
          role: 'tool',
          content: JSON.stringify(result, null, 2),
          timestamp: Date.now(),
          toolCallId: toolCall.id
        };

        conversation.messages.push(toolMessage);
        conversation.updatedAt = Date.now();

        // Update UI
        set({ conversations: [...conversations] });

      } catch (error) {
        // Add error message
        const errorMessage: Message = {
          id: generateUUID(),
          conversationId: currentConversationId!,
          role: 'tool',
          content: JSON.stringify({
            error: error instanceof Error ? error.message : 'Tool execution failed'
          }),
          timestamp: Date.now(),
          toolCallId: toolCall.id
        };

        conversation.messages.push(errorMessage);
        set({ conversations: [...conversations] });
      }
    }

    // Save conversation with tool results
    await saveConversation(conversation);

    // Continue conversation to let AI process tool results
    await get().sendMessage('');
  },

  /**
   * Update settings
   */
  updateSettings: async (newSettings: Partial<ChatSettings>) => {
    const { settings } = get();
    if (!settings) return;

    const updated = {
      ...settings,
      ...newSettings,
      llm: { ...settings.llm, ...newSettings.llm },
      chat: { ...settings.chat, ...newSettings.chat },
      multimodal: { ...settings.multimodal, ...newSettings.multimodal }
    };

    set({ settings: updated });
    await saveSettings(updated);
  },

  /**
   * Get current conversation
   */
  getCurrentConversation: () => {
    const { conversations, currentConversationId } = get();
    return conversations.find(c => c.id === currentConversationId) || null;
  }
}));
