/**
 * Chat types for AutoFeel WebApp
 */

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface MessageContent {
  type: 'text' | 'image';
  text?: string;
  imageUrl?: string;
  imageData?: string; // base64
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
  result?: {
    success: boolean;
    data?: any;
    error?: string;
    executedAt?: number;
  };
}

export interface ThinkingStep {
  id: string;
  type: 'planning' | 'reasoning' | 'tool_selection' | 'reflection';
  content: string;
  timestamp: number;
  metadata?: {
    confidence?: number;
    alternatives?: string[];
  };
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string | MessageContent[];
  timestamp: number;

  // Assistant message specific
  toolCalls?: ToolCall[];
  thinkingSteps?: ThinkingStep[];

  // Tool response specific
  toolCallId?: string;

  // Metadata
  metadata?: {
    model?: string;
    tokens?: {
      prompt: number;
      completion: number;
      total: number;
    };
    finishReason?: string;
  };
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  metadata?: {
    website?: string;
    formUrl?: string;
    tags?: string[];
  };
}

export interface ChatSettings {
  llm: {
    provider: 'openai' | 'anthropic';
    apiKey: string;
    model: string;
  };
  chat: {
    streamingEnabled: boolean;
    thinkingVisible: boolean;
    autoToolExecution: boolean;
    maxToolCalls: number;
  };
  multimodal: {
    enabled: boolean;
    maxImageSize: number; // MB
    imageQuality: 'low' | 'medium' | 'high';
  };
}
