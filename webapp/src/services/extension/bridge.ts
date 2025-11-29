/**
 * Extension communication bridge using postMessage
 */

import { generateUUID } from '../../utils/uuid';
import type {
  ToolCallRequest,
  ToolResponse,
  StatusUpdate
} from '../../types/extension';

import type {
  DetectFormsArgs,
  DetectFormsResult,
  FillFieldArgs,
  FillFieldResult
} from '../../types/tools';

const EXTENSION_TARGET = 'autofeel-extension';
const WEBAPP_TARGET = 'autofeel-webapp';
const DEFAULT_TIMEOUT = 30000; // 30 seconds

type MessageListener = (event: MessageEvent) => void;

export class ExtensionBridge {
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: number;
  }> = new Map();

  private statusListeners: Set<(update: StatusUpdate) => void> = new Set();
  private messageListener: MessageListener;

  constructor() {
    this.messageListener = this.handleMessage.bind(this);
    window.addEventListener('message', this.messageListener);
  }

  /**
   * Clean up listeners
   */
  destroy() {
    window.removeEventListener('message', this.messageListener);
    // Clear all pending timeouts
    this.pendingRequests.forEach(req => clearTimeout(req.timeout));
    this.pendingRequests.clear();
  }

  /**
   * Handle incoming messages from extension
   */
  private handleMessage(event: MessageEvent) {
    // Only accept messages from same origin
    if (event.origin !== window.location.origin) {
      return;
    }

    const data = event.data;

    // Ignore messages not targeting webapp
    if (data.target !== WEBAPP_TARGET) {
      return;
    }

    if (data.type === 'tool_response') {
      this.handleToolResponse(data as ToolResponse);
    } else if (data.type === 'status_update') {
      this.handleStatusUpdate(data as StatusUpdate);
    }
  }

  /**
   * Handle tool response
   */
  private handleToolResponse(response: ToolResponse) {
    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) {
      console.warn('Received response for unknown request:', response.requestId);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.requestId);

    if (response.success) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error(response.error || 'Unknown error'));
    }
  }

  /**
   * Handle status update
   */
  private handleStatusUpdate(update: StatusUpdate) {
    this.statusListeners.forEach(listener => listener(update));
  }

  /**
   * Subscribe to status updates
   */
  onStatusUpdate(listener: (update: StatusUpdate) => void) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * Call extension tool
   */
  private async callTool<T>(toolName: string, args: any): Promise<T> {
    const requestId = generateUUID();

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Tool call timeout: ${toolName}`));
      }, DEFAULT_TIMEOUT);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      const request: ToolCallRequest = {
        type: 'tool_call',
        requestId,
        toolName,
        arguments: args,
        target: EXTENSION_TARGET,
        payload: args
      };

      window.postMessage(request, '*');
    });
  }

  /**
   * Detect forms on current page
   */
  async detectForms(args: DetectFormsArgs = {}): Promise<DetectFormsResult> {
    return await this.callTool<DetectFormsResult>('detectForms', args);
  }

  /**
   * Fill a field on current page
   */
  async fillField(args: FillFieldArgs): Promise<FillFieldResult> {
    return await this.callTool<FillFieldResult>('fillField', args);
  }

  /**
   * Check if extension is available
   */
  async ping(): Promise<boolean> {
    try {
      await this.callTool('ping', {});
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let bridgeInstance: ExtensionBridge | null = null;

export function getExtensionBridge(): ExtensionBridge {
  if (!bridgeInstance) {
    bridgeInstance = new ExtensionBridge();
  }
  return bridgeInstance;
}
