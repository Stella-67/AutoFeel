# AutoFeel Chat WebApp - 架构设计文档

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Web App                               │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  Chat UI       │  │  Conversation   │  │  Settings    │ │
│  │  - Messages    │  │  History        │  │  - API Keys  │ │
│  │  - Streaming   │  │  - Sidebar      │  │  - Models    │ │
│  │  - Thinking    │  │  - CRUD         │  │  - Profile   │ │
│  └────────────────┘  └─────────────────┘  └──────────────┘ │
│         │                     │                    │         │
│         └─────────────────────┼────────────────────┘         │
│                               │                              │
│  ┌────────────────────────────▼──────────────────────────┐  │
│  │           State Management (Zustand/Redux)            │  │
│  └────────────────────────────┬──────────────────────────┘  │
│                               │                              │
│  ┌────────────────────────────▼──────────────────────────┐  │
│  │              LLM Service Layer                        │  │
│  │  - Streaming API calls                                │  │
│  │  - Function calling handling                          │  │
│  │  - Tool execution coordination                        │  │
│  └────────────────────────────┬──────────────────────────┘  │
│                               │                              │
│  ┌────────────────────────────▼──────────────────────────┐  │
│  │         IndexedDB (Local Storage)                     │  │
│  │  - Conversations                                      │  │
│  │  - Messages                                           │  │
│  │  - User settings                                      │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           │ postMessage API
                           │
┌──────────────────────────▼───────────────────────────────────┐
│               Chrome Extension (现有)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Background Worker                                     │ │
│  │  - Receives tool call requests from WebApp            │ │
│  │  - Executes: detectForms, fillField, extractProfile   │ │
│  │  - Returns results back to WebApp                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                 │
│  ┌────────────────────────▼────────────────────────────┐    │
│  │  Content Script                                     │    │
│  │  - Form detection                                   │    │
│  │  - Field filling                                    │    │
│  │  - Screenshot capture                               │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## 2. 数据模型

### 2.1 Conversation（对话）

```typescript
interface Conversation {
  id: string;                    // UUID
  title: string;                 // 对话标题（用户可编辑）
  createdAt: number;             // 时间戳
  updatedAt: number;             // 最后更新时间戳
  messages: Message[];           // 消息列表
  metadata?: {
    website?: string;            // 关联的网站
    formUrl?: string;            // 关联的表单 URL
    tags?: string[];             // 用户标签
  };
}
```

### 2.2 Message（消息）

```typescript
type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

interface Message {
  id: string;                    // UUID
  conversationId: string;        // 所属对话 ID
  role: MessageRole;             // 消息角色
  content: string | MessageContent[]; // 消息内容（文本或多模态）
  timestamp: number;             // 时间戳

  // 助手消息特有字段
  toolCalls?: ToolCall[];        // 工具调用
  thinkingSteps?: ThinkingStep[]; // 思考步骤（可选）

  // 工具响应特有字段
  toolCallId?: string;           // 对应的 toolCall ID

  // 元数据
  metadata?: {
    model?: string;              // 使用的模型
    tokens?: {                   // token 使用统计
      prompt: number;
      completion: number;
      total: number;
    };
    finishReason?: string;       // 完成原因
  };
}

// 多模态内容
interface MessageContent {
  type: 'text' | 'image';
  text?: string;
  imageUrl?: string;
  imageData?: string;            // base64
}
```

### 2.3 ToolCall（工具调用）

```typescript
interface ToolCall {
  id: string;                    // 工具调用 ID
  type: 'function';              // 固定为 function
  function: {
    name: string;                // 工具名称
    arguments: string;           // JSON 字符串参数
  };

  // 执行结果
  result?: {
    success: boolean;
    data?: any;
    error?: string;
    executedAt?: number;
  };
}
```

### 2.4 ThinkingStep（思考步骤）

用于可视化 AI 的推理过程（类似 o1 模型）

```typescript
interface ThinkingStep {
  id: string;
  type: 'planning' | 'reasoning' | 'tool_selection' | 'reflection';
  content: string;               // 思考内容
  timestamp: number;
  metadata?: {
    confidence?: number;         // 置信度 0-1
    alternatives?: string[];     // 考虑的其他方案
  };
}
```

### 2.5 Settings（设置）

扩展现有的 Settings 类型：

```typescript
interface ChatSettings extends Settings {
  chat: {
    streamingEnabled: boolean;           // 启用流式输出
    thinkingVisible: boolean;            // 显示思考过程
    autoToolExecution: boolean;          // 自动执行工具（无需确认）
    maxToolCalls: number;                // 单次对话最大工具调用次数
    conversationRetention: number;       // 对话保留天数（0 = 永久）
  };

  multimodal: {
    enabled: boolean;
    maxImageSize: number;                // MB
    imageQuality: 'low' | 'medium' | 'high';
  };
}
```

## 3. 工具定义（Function Calling Tools）

### 3.1 detectForms - 检测当前页面表单

```typescript
const detectFormsTool = {
  name: 'detectForms',
  description: 'Detect all form fields on the current webpage that the user is viewing',
  parameters: {
    type: 'object',
    properties: {
      includeHidden: {
        type: 'boolean',
        description: 'Whether to include hidden fields',
        default: false
      }
    }
  }
};

// 返回格式
interface DetectFormsResult {
  fields: FormField[];           // 从现有 types.ts
  url: string;                   // 当前页面 URL
  pageTitle: string;             // 页面标题
}
```

### 3.2 fillField - 填写表单字段

```typescript
const fillFieldTool = {
  name: 'fillField',
  description: 'Fill a specific form field with the provided value',
  parameters: {
    type: 'object',
    properties: {
      fieldId: {
        type: 'string',
        description: 'The unique ID of the field to fill (from detectForms result)'
      },
      value: {
        type: 'string',
        description: 'The value to fill into the field'
      },
      verify: {
        type: 'boolean',
        description: 'Whether to verify the field was filled successfully',
        default: true
      }
    },
    required: ['fieldId', 'value']
  }
};

// 返回格式
interface FillFieldResult {
  success: boolean;
  fieldLabel: string;
  filledValue: string;
  error?: string;
}
```

### 3.3 extractProfile - 提取用户资料

```typescript
const extractProfileTool = {
  name: 'extractProfile',
  description: 'Extract specific information from the user profile (education, experience, skills, stories)',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['all', 'personal', 'education', 'experience', 'skills', 'stories', 'values'],
        description: 'Which category of profile information to extract'
      },
      filter: {
        type: 'object',
        description: 'Optional filters (e.g., skillCategory, experienceYears)',
        properties: {
          skillCategory: { type: 'string' },
          company: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    required: ['category']
  }
};

// 返回格式
interface ExtractProfileResult {
  category: string;
  data: any;                     // 对应的 profile 数据
}
```

### 3.4 analyzeForm - 分析表单内容（多模态）

```typescript
const analyzeFormTool = {
  name: 'analyzeForm',
  description: 'Analyze a form screenshot using vision capabilities to extract questions and structure',
  parameters: {
    type: 'object',
    properties: {
      imageData: {
        type: 'string',
        description: 'Base64 encoded image data'
      },
      analysisType: {
        type: 'string',
        enum: ['questions', 'structure', 'requirements'],
        description: 'What aspect to analyze'
      }
    },
    required: ['imageData', 'analysisType']
  }
};

// 返回格式
interface AnalyzeFormResult {
  questions: string[];
  structure: {
    sections: string[];
    fieldCount: number;
  };
  requirements?: string[];
}
```

### 3.5 generateAnswer - 生成表单答案

```typescript
const generateAnswerTool = {
  name: 'generateAnswer',
  description: 'Generate a personalized answer to a form question based on user profile',
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The question to answer'
      },
      context: {
        type: 'string',
        description: 'Additional context (company name, position, etc.)'
      },
      tone: {
        type: 'string',
        enum: ['professional', 'conversational', 'formal'],
        default: 'professional'
      },
      length: {
        type: 'string',
        enum: ['brief', 'medium', 'detailed'],
        default: 'medium'
      }
    },
    required: ['question']
  }
};

// 返回格式
interface GenerateAnswerResult {
  answer: string;
  confidence: number;
  usedSources: {
    type: 'experience' | 'education' | 'skill' | 'story';
    id: string;
  }[];
}
```

## 4. 通信协议（WebApp ↔ Extension）

### 4.1 消息格式

```typescript
interface ExtensionMessage {
  type: 'tool_call' | 'tool_response' | 'status_update';
  payload: any;
  requestId: string;             // 用于匹配请求和响应
}

// Tool Call Request (WebApp -> Extension)
interface ToolCallRequest {
  type: 'tool_call';
  requestId: string;
  toolName: string;
  arguments: Record<string, any>;
}

// Tool Response (Extension -> WebApp)
interface ToolResponse {
  type: 'tool_response';
  requestId: string;
  success: boolean;
  result?: any;
  error?: string;
}

// Status Update (Extension -> WebApp)
interface StatusUpdate {
  type: 'status_update';
  status: 'detecting' | 'filling' | 'analyzing' | 'complete';
  message: string;
}
```

### 4.2 通信实现

**方案 A：postMessage（推荐，简单）**

```typescript
// WebApp 端
const EXTENSION_ID = 'your-extension-id';

// 发送消息到 Extension
function callExtensionTool(toolName: string, args: any): Promise<any> {
  const requestId = generateUUID();

  return new Promise((resolve, reject) => {
    const listener = (event: MessageEvent) => {
      if (event.data.requestId === requestId) {
        window.removeEventListener('message', listener);
        if (event.data.success) {
          resolve(event.data.result);
        } else {
          reject(new Error(event.data.error));
        }
      }
    };

    window.addEventListener('message', listener);

    // 发送消息
    window.postMessage({
      type: 'tool_call',
      requestId,
      toolName,
      arguments: args,
      target: 'autofeel-extension'
    }, '*');

    // 超时处理
    setTimeout(() => {
      window.removeEventListener('message', listener);
      reject(new Error('Extension tool call timeout'));
    }, 30000);
  });
}

// Extension background.ts
window.addEventListener('message', async (event) => {
  if (event.data.target === 'autofeel-extension' && event.data.type === 'tool_call') {
    const { requestId, toolName, arguments: args } = event.data;

    try {
      const result = await executeExtensionTool(toolName, args);
      window.postMessage({
        type: 'tool_response',
        requestId,
        success: true,
        result
      }, '*');
    } catch (error) {
      window.postMessage({
        type: 'tool_response',
        requestId,
        success: false,
        error: error.message
      }, '*');
    }
  }
});
```

**方案 B：chrome.runtime messaging（更安全）**

需要 WebApp 托管在特定域名，在 Extension manifest 中配置 externally_connectable。

## 5. LLM Service Layer 架构

### 5.1 扩展现有 LLMProvider

```typescript
// src/llm-chat.ts (新文件)

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | MessageContent[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface StreamChunk {
  type: 'content' | 'tool_call' | 'thinking' | 'done';
  delta?: string;              // 增量内容
  toolCall?: ToolCall;         // 完整的工具调用
  thinkingStep?: ThinkingStep; // 思考步骤
}

export class ChatLLMProvider {
  private provider: 'openai' | 'anthropic';
  private apiKey: string;
  private model: string;

  constructor(settings: ChatSettings) {
    // ...
  }

  /**
   * 流式聊天完成
   */
  async *streamChat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    if (this.provider === 'openai') {
      yield* this.streamOpenAI(messages, tools, options);
    } else {
      yield* this.streamAnthropic(messages, tools, options);
    }
  }

  /**
   * OpenAI 流式实现
   */
  private async *streamOpenAI(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools: tools?.map(t => ({
          type: 'function',
          function: t
        })),
        stream: true,
        stream_options: {
          include_usage: true
        }
      })
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            yield { type: 'done' };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0]?.delta;

            if (delta?.content) {
              yield { type: 'content', delta: delta.content };
            }

            if (delta?.tool_calls) {
              // 处理工具调用
              for (const toolCall of delta.tool_calls) {
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: toolCall.id,
                    type: 'function',
                    function: {
                      name: toolCall.function.name,
                      arguments: toolCall.function.arguments
                    }
                  }
                };
              }
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
    }
  }

  /**
   * Anthropic 流式实现（包含思考步骤）
   */
  private async *streamAnthropic(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk> {
    // 转换消息格式
    const anthropicMessages = this.convertToAnthropicFormat(messages);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: anthropicMessages,
        tools,
        stream: true,
        // 启用思考过程（如果模型支持）
        thinking: {
          type: 'enabled',
          budget_tokens: 1000
        }
      })
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));

          switch (data.type) {
            case 'content_block_delta':
              if (data.delta.type === 'text_delta') {
                yield { type: 'content', delta: data.delta.text };
              } else if (data.delta.type === 'thinking_delta') {
                // 思考过程增量
                yield {
                  type: 'thinking',
                  thinkingStep: {
                    id: generateUUID(),
                    type: 'reasoning',
                    content: data.delta.thinking,
                    timestamp: Date.now()
                  }
                };
              }
              break;

            case 'content_block_start':
              if (data.content_block.type === 'tool_use') {
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: data.content_block.id,
                    type: 'function',
                    function: {
                      name: data.content_block.name,
                      arguments: JSON.stringify(data.content_block.input)
                    }
                  }
                };
              }
              break;

            case 'message_stop':
              yield { type: 'done' };
              break;
          }
        }
      }
    }
  }

  private convertToAnthropicFormat(messages: ChatMessage[]) {
    // 转换逻辑...
  }
}
```

### 5.2 工具执行协调器

```typescript
// src/tool-executor.ts

export class ToolExecutor {
  private extensionBridge: ExtensionBridge;

  constructor() {
    this.extensionBridge = new ExtensionBridge();
  }

  async executeTool(toolCall: ToolCall): Promise<any> {
    const { name, arguments: argsStr } = toolCall.function;
    const args = JSON.parse(argsStr);

    switch (name) {
      case 'detectForms':
        return await this.extensionBridge.detectForms(args);

      case 'fillField':
        return await this.extensionBridge.fillField(args);

      case 'extractProfile':
        return await this.extensionBridge.extractProfile(args);

      case 'analyzeForm':
        return await this.analyzeFormWithVision(args);

      case 'generateAnswer':
        return await this.generateAnswer(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async analyzeFormWithVision(args: any): Promise<any> {
    // 使用 GPT-4V 或 Claude with vision 分析图片
    const provider = new ChatLLMProvider(/* settings */);

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this form image and extract all questions. Type: ${args.analysisType}`
          },
          {
            type: 'image',
            imageData: args.imageData
          }
        ]
      }
    ];

    // 非流式调用
    let result = '';
    for await (const chunk of provider.streamChat(messages)) {
      if (chunk.type === 'content') {
        result += chunk.delta;
      }
    }

    return {
      questions: this.parseQuestions(result),
      structure: this.parseStructure(result)
    };
  }
}
```

## 6. 前端状态管理

推荐使用 **Zustand**（轻量、简单）

```typescript
// src/webapp/stores/chatStore.ts

interface ChatState {
  // 对话列表
  conversations: Conversation[];
  currentConversationId: string | null;

  // 当前消息流
  streamingMessage: Message | null;
  isStreaming: boolean;

  // 工具执行状态
  pendingToolCalls: ToolCall[];

  // Actions
  createConversation: (title?: string) => string;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;

  sendMessage: (content: string | MessageContent[]) => Promise<void>;
  executeToolCall: (toolCall: ToolCall) => Promise<void>;

  loadConversations: () => Promise<void>;
  saveConversation: (conversation: Conversation) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  streamingMessage: null,
  isStreaming: false,
  pendingToolCalls: [],

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
      conversations: [...state.conversations, conversation],
      currentConversationId: id
    }));

    return id;
  },

  sendMessage: async (content) => {
    const { currentConversationId, conversations } = get();
    if (!currentConversationId) return;

    const conversation = conversations.find(c => c.id === currentConversationId);
    if (!conversation) return;

    // 添加用户消息
    const userMessage: Message = {
      id: generateUUID(),
      conversationId: currentConversationId,
      role: 'user',
      content,
      timestamp: Date.now()
    };

    conversation.messages.push(userMessage);
    set({ conversations: [...conversations] });

    // 开始流式响应
    set({ isStreaming: true });

    const assistantMessage: Message = {
      id: generateUUID(),
      conversationId: currentConversationId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolCalls: [],
      thinkingSteps: []
    };

    set({ streamingMessage: assistantMessage });

    try {
      const llmProvider = new ChatLLMProvider(/* settings */);
      const tools = getAvailableTools();

      for await (const chunk of llmProvider.streamChat(conversation.messages, tools)) {
        switch (chunk.type) {
          case 'content':
            assistantMessage.content += chunk.delta;
            set({ streamingMessage: { ...assistantMessage } });
            break;

          case 'thinking':
            assistantMessage.thinkingSteps?.push(chunk.thinkingStep!);
            set({ streamingMessage: { ...assistantMessage } });
            break;

          case 'tool_call':
            assistantMessage.toolCalls?.push(chunk.toolCall!);
            set({
              streamingMessage: { ...assistantMessage },
              pendingToolCalls: [...get().pendingToolCalls, chunk.toolCall!]
            });
            break;

          case 'done':
            // 完成流式输出
            conversation.messages.push(assistantMessage);
            set({
              conversations: [...conversations],
              streamingMessage: null,
              isStreaming: false
            });

            // 自动执行工具调用
            const { pendingToolCalls } = get();
            for (const toolCall of pendingToolCalls) {
              await get().executeToolCall(toolCall);
            }
            set({ pendingToolCalls: [] });
            break;
        }
      }
    } catch (error) {
      console.error('Stream error:', error);
      set({ isStreaming: false, streamingMessage: null });
    }
  },

  executeToolCall: async (toolCall) => {
    const executor = new ToolExecutor();

    try {
      const result = await executor.executeTool(toolCall);

      // 添加工具响应消息
      const { currentConversationId, conversations } = get();
      const conversation = conversations.find(c => c.id === currentConversationId);
      if (!conversation) return;

      const toolMessage: Message = {
        id: generateUUID(),
        conversationId: currentConversationId,
        role: 'tool',
        content: JSON.stringify(result),
        timestamp: Date.now(),
        toolCallId: toolCall.id
      };

      conversation.messages.push(toolMessage);
      set({ conversations: [...conversations] });

      // 继续对话（让 LLM 处理工具结果）
      await get().sendMessage('');

    } catch (error) {
      console.error('Tool execution error:', error);
    }
  },

  loadConversations: async () => {
    const db = await openDB('autofeel-chat', 1);
    const conversations = await db.getAll('conversations');
    set({ conversations });
  },

  saveConversation: async (conversation) => {
    const db = await openDB('autofeel-chat', 1);
    await db.put('conversations', conversation);
  }
}));
```

## 7. IndexedDB Schema

```typescript
// src/webapp/db/schema.ts

import { openDB, DBSchema } from 'idb';

interface AutoFeelChatDB extends DBSchema {
  conversations: {
    key: string;              // conversation.id
    value: Conversation;
    indexes: {
      'by-updated': number;   // updatedAt
      'by-created': number;   // createdAt
    };
  };

  settings: {
    key: string;
    value: ChatSettings;
  };

  attachments: {
    key: string;              // UUID
    value: {
      id: string;
      conversationId: string;
      type: 'image' | 'file';
      data: string;           // base64 或 blob URL
      metadata: {
        filename: string;
        size: number;
        mimeType: string;
      };
    };
    indexes: {
      'by-conversation': string;
    };
  };
}

export async function initDB() {
  return openDB<AutoFeelChatDB>('autofeel-chat', 1, {
    upgrade(db) {
      // Conversations store
      const conversationStore = db.createObjectStore('conversations', {
        keyPath: 'id'
      });
      conversationStore.createIndex('by-updated', 'updatedAt');
      conversationStore.createIndex('by-created', 'createdAt');

      // Settings store
      db.createObjectStore('settings', { keyPath: 'key' });

      // Attachments store
      const attachmentStore = db.createObjectStore('attachments', {
        keyPath: 'id'
      });
      attachmentStore.createIndex('by-conversation', 'conversationId');
    }
  });
}
```

## 8. 技术栈推荐

### 前端框架
- **React 18** + TypeScript
  - 生态成熟，组件丰富
  - Hooks 适合聊天 UI 的状态管理

### UI 组件库
- **Tailwind CSS** + **Headless UI**
  - 快速开发，易于定制
  - 或使用 **shadcn/ui**（基于 Radix UI）

### 状态管理
- **Zustand** （推荐）
  - 轻量、简单、无样板代码
  - 或使用 **Jotai** / **Valtio**

### 路由
- **React Router v6**
  - `/` - 聊天界面
  - `/settings` - 设置页面

### 构建工具
- **Vite**
  - 快速的 HMR
  - 优秀的 TypeScript 支持

### 数据存储
- **idb** (IndexedDB wrapper)
  - 本地存储对话历史
  - 支持大量数据和复杂查询

### Markdown 渲染
- **react-markdown** + **remark-gfm**
  - 渲染 AI 返回的 markdown 格式

### 代码高亮
- **Prism.js** 或 **Highlight.js**
  - 高亮代码块

### 图片处理
- **browser-image-compression**
  - 压缩上传的图片

## 9. 目录结构（Web App）

```
autofeel-webapp/
├── public/
│   └── index.html
│
├── src/
│   ├── main.tsx                      # 入口文件
│   ├── App.tsx                       # 根组件
│   │
│   ├── components/                   # UI 组件
│   │   ├── chat/
│   │   │   ├── ChatWindow.tsx       # 聊天窗口
│   │   │   ├── MessageList.tsx      # 消息列表
│   │   │   ├── MessageItem.tsx      # 单条消息
│   │   │   ├── StreamingMessage.tsx # 流式消息
│   │   │   ├── ThinkingBlock.tsx    # 思考过程
│   │   │   ├── ToolCallCard.tsx     # 工具调用卡片
│   │   │   ├── InputBox.tsx         # 输入框
│   │   │   └── ImageUpload.tsx      # 图片上传
│   │   │
│   │   ├── sidebar/
│   │   │   ├── ConversationList.tsx # 对话列表
│   │   │   ├── ConversationItem.tsx # 对话项
│   │   │   └── NewChatButton.tsx    # 新建按钮
│   │   │
│   │   ├── settings/
│   │   │   ├── SettingsPanel.tsx    # 设置面板
│   │   │   ├── APIKeyInput.tsx      # API key 输入
│   │   │   └── ProfileEditor.tsx    # 资料编辑
│   │   │
│   │   └── common/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Modal.tsx
│   │       └── Toast.tsx
│   │
│   ├── stores/                       # 状态管理
│   │   ├── chatStore.ts             # 聊天状态
│   │   ├── settingsStore.ts         # 设置状态
│   │   └── uiStore.ts               # UI 状态
│   │
│   ├── services/                     # 服务层
│   │   ├── llm/
│   │   │   ├── ChatLLMProvider.ts   # LLM 提供者
│   │   │   ├── openai.ts            # OpenAI 实现
│   │   │   └── anthropic.ts         # Anthropic 实现
│   │   │
│   │   ├── extension/
│   │   │   ├── ExtensionBridge.ts   # Extension 通信桥
│   │   │   └── ToolExecutor.ts      # 工具执行器
│   │   │
│   │   └── storage/
│   │       ├── db.ts                # IndexedDB
│   │       └── migrations.ts        # 数据迁移
│   │
│   ├── types/                        # 类型定义
│   │   ├── chat.ts                  # 聊天相关类型
│   │   ├── tools.ts                 # 工具定义
│   │   └── extension.ts             # Extension 消息类型
│   │
│   ├── utils/                        # 工具函数
│   │   ├── uuid.ts
│   │   ├── markdown.ts
│   │   └── image.ts
│   │
│   └── styles/                       # 样式
│       └── globals.css
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## 10. Extension 改造点

### 10.1 background.ts 扩展

```typescript
// 新增：监听来自 WebApp 的消息
window.addEventListener('message', async (event) => {
  // 验证来源
  if (event.data.target !== 'autofeel-extension') return;

  const { type, requestId, toolName, arguments: args } = event.data;

  if (type === 'tool_call') {
    try {
      let result;

      switch (toolName) {
        case 'detectForms':
          result = await handleDetectForms(args);
          break;
        case 'fillField':
          result = await handleFillField(args);
          break;
        case 'extractProfile':
          result = await handleExtractProfile(args);
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      // 发送响应
      window.postMessage({
        type: 'tool_response',
        requestId,
        success: true,
        result
      }, '*');

    } catch (error) {
      window.postMessage({
        type: 'tool_response',
        requestId,
        success: false,
        error: error.message
      }, '*');
    }
  }
});

async function handleDetectForms(args: any) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const response = await chrome.tabs.sendMessage(tab.id!, {
    action: 'detectForms',
    includeHidden: args.includeHidden
  });

  return {
    fields: response.fields,
    url: tab.url,
    pageTitle: tab.title
  };
}

async function handleExtractProfile(args: any) {
  const profile = await getProfile();

  switch (args.category) {
    case 'all':
      return { category: 'all', data: profile };
    case 'education':
      return { category: 'education', data: profile.education };
    case 'experience':
      return { category: 'experience', data: profile.experience };
    // ... 其他类别
  }
}
```

## 11. 实现优先级

基于复杂度和依赖关系，建议实施顺序：

### Phase 1: 基础设施（Week 1-2）
1. ✅ 数据模型定义
2. ✅ Web App 项目初始化（Vite + React + TypeScript）
3. ✅ IndexedDB 设置
4. ✅ 基础 UI 布局（Sidebar + Chat Window）

### Phase 2: 核心聊天功能（Week 2-3）
5. ⚙️ LLM Provider 扩展（streaming 支持）
6. ⚙️ 聊天 UI 组件（MessageList, InputBox）
7. ⚙️ 对话历史管理（CRUD）
8. ⚙️ Streaming 消息渲染

### Phase 3: Extension 集成（Week 3-4）
9. 🔧 Extension-WebApp 通信桥
10. 🔧 工具定义和注册
11. 🔧 Extension background 改造
12. 🔧 工具执行器

### Phase 4: 高级功能（Week 4-5）
13. 🎨 思考过程可视化
14. 🎨 Function Calling UI（工具调用卡片）
15. 🎨 多模态支持（图片上传、分析）

### Phase 5: 优化和测试（Week 5-6）
16. 🧪 错误处理和重试机制
17. 🧪 性能优化（虚拟滚动、懒加载）
18. 🧪 用户体验打磨
19. 🧪 测试和 Bug 修复

## 12. 关键技术挑战

### 挑战 1: 流式输出的状态同步
- **问题**: 需要实时更新 UI 而不影响性能
- **方案**: 使用 React 18 的 `useTransition` 和批量更新

### 挑战 2: 工具调用的异步协调
- **问题**: LLM 可能连续调用多个工具
- **方案**: 实现工具调用队列和执行状态机

### 挑战 3: Extension 权限限制
- **问题**: Web App 无法直接访问页面 DOM
- **方案**: 通过 Extension 作为代理，postMessage 通信

### 挑战 4: 大对话历史的性能
- **问题**: 消息过多导致渲染卡顿
- **方案**: 虚拟滚动（react-window）+ 懒加载历史消息

### 挑战 5: 多模态内容的存储
- **问题**: 图片 base64 数据过大
- **方案**:
  - 压缩图片（browser-image-compression）
  - 分离存储到 attachments store
  - 使用 Blob URL

## 13. 安全考虑

1. **API Key 保护**
   - 存储在 IndexedDB（浏览器加密）
   - 从不发送到非 LLM API 的服务器

2. **XSS 防护**
   - 使用 DOMPurify 清理用户输入
   - react-markdown 默认转义 HTML

3. **CORS**
   - LLM API 调用直接从客户端发起
   - 或通过简单的代理服务器（如需要）

4. **数据隐私**
   - 所有对话存储在本地
   - 用户完全控制数据导出/删除

## 14. 下一步行动

基于以上设计，建议的第一步：

1. **创建 Web App 项目骨架**
   ```bash
   npm create vite@latest autofeel-webapp -- --template react-ts
   cd autofeel-webapp
   npm install zustand idb react-router-dom react-markdown
   npm install -D tailwindcss autoprefixer postcss
   ```

2. **定义核心类型文件**
   - `src/types/chat.ts`
   - `src/types/tools.ts`

3. **实现基础 Layout**
   - Sidebar（对话列表）
   - Main（聊天窗口）

4. **实现简单的文本聊天**（无工具调用）
   - 测试 OpenAI/Anthropic streaming

---

**备注**：此架构设计文档将随着开发进展持续更新。
