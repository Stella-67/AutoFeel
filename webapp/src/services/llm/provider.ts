/**
 * Simple LLM Provider for MVP (non-streaming)
 */

import type { Message, ToolCall } from '../../types/chat';
import type { ToolDefinition } from '../../types/tools';

export interface ChatCompletionRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  model?: string;
}

export interface ChatCompletionResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export class LLMProvider {
  private provider: 'openai' | 'anthropic';
  private apiKey: string;
  private model: string;

  constructor(provider: 'openai' | 'anthropic', apiKey: string, model: string) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Chat completion (non-streaming for MVP)
   */
  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (this.provider === 'openai') {
      return await this.openAICompletion(request);
    } else {
      return await this.anthropicCompletion(request);
    }
  }

  /**
   * OpenAI chat completion
   */
  private async openAICompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const messages = this.convertMessagesToOpenAI(request.messages);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model || this.model,
        messages,
        tools: request.tools?.map(t => ({
          type: 'function',
          function: t.function
        })),
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const choice = data.choices[0];

    return {
      content: choice.message?.content || '',
      toolCalls: choice.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments
        }
      })),
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      },
      finishReason: choice.finish_reason
    };
  }

  /**
   * Anthropic chat completion (Claude)
   */
  private async anthropicCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const { system, messages } = this.convertMessagesToAnthropic(request.messages);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model || this.model,
        system,
        messages,
        tools: request.tools,
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Extract content and tool calls
    let content = '';
    const toolCalls: ToolCall[] = [];

    for (const block of data.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input)
          }
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      },
      finishReason: data.stop_reason
    };
  }

  /**
   * Convert messages to OpenAI format
   */
  private convertMessagesToOpenAI(messages: Message[]): any[] {
    return messages.map(msg => {
      const result: any = {
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : msg.content[0]?.text || ''
      };

      if (msg.toolCalls) {
        result.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments
          }
        }));
      }

      if (msg.toolCallId) {
        result.tool_call_id = msg.toolCallId;
        result.name = 'tool_result';
      }

      return result;
    });
  }

  /**
   * Convert messages to Anthropic format
   */
  private convertMessagesToAnthropic(messages: Message[]): { system: string; messages: any[] } {
    let system = '';
    const anthropicMessages: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = typeof msg.content === 'string' ? msg.content : msg.content[0]?.text || '';
        continue;
      }

      if (msg.role === 'tool') {
        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId,
              content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
            }
          ]
        });
        continue;
      }

      const content: any[] = [];

      if (typeof msg.content === 'string' && msg.content) {
        content.push({ type: 'text', text: msg.content });
      }

      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments)
          });
        }
      }

      if (content.length > 0) {
        anthropicMessages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content
        });
      }
    }

    return { system, messages: anthropicMessages };
  }
}
