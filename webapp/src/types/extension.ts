/**
 * Extension communication types
 */

export type ExtensionMessageType = 'tool_call' | 'tool_response' | 'status_update';

export interface ExtensionMessage {
  type: ExtensionMessageType;
  payload: any;
  requestId: string;
  target?: string;
}

// Tool Call Request (WebApp -> Extension)
export interface ToolCallRequest extends ExtensionMessage {
  type: 'tool_call';
  toolName: string;
  arguments: Record<string, any>;
}

// Tool Response (Extension -> WebApp)
export interface ToolResponse extends ExtensionMessage {
  type: 'tool_response';
  success: boolean;
  result?: any;
  error?: string;
}

// Status Update (Extension -> WebApp)
export interface StatusUpdate extends ExtensionMessage {
  type: 'status_update';
  status: 'detecting' | 'filling' | 'analyzing' | 'complete';
  message: string;
}
