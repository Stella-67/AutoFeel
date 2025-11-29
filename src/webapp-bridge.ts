/**
 * WebApp Bridge Content Script
 * Injected into the webapp page to relay messages between webapp and extension background
 */

console.log('[AutoFeel Bridge] Initializing webapp bridge...');

// Listen for messages from webpage (webapp)
window.addEventListener('message', async (event) => {
  // Only accept messages from same origin
  if (event.origin !== window.location.origin) {
    return;
  }

  const data = event.data;

  // Check if message is for extension
  if (data.target === 'autofeel-extension' && data.type === 'tool_call') {
    console.log('[AutoFeel Bridge] Forwarding tool call to extension:', data.toolName);

    try {
      // Forward to background script
      const response = await chrome.runtime.sendMessage({
        action: 'webappToolCall',
        payload: {
          requestId: data.requestId,
          toolName: data.toolName,
          arguments: data.arguments
        }
      });

      // Send response back to webpage
      window.postMessage({
        type: 'tool_response',
        requestId: data.requestId,
        success: response.success,
        result: response.result,
        error: response.error,
        target: 'autofeel-webapp'
      }, '*');

    } catch (error) {
      console.error('[AutoFeel Bridge] Error forwarding tool call:', error);

      // Send error back to webpage
      window.postMessage({
        type: 'tool_response',
        requestId: data.requestId,
        success: false,
        error: (error as Error).message,
        target: 'autofeel-webapp'
      }, '*');
    }
  }
});

console.log('[AutoFeel Bridge] Bridge ready, listening for messages');

// Notify webapp that bridge is ready
window.postMessage({
  type: 'bridge_ready',
  target: 'autofeel-webapp'
}, '*');
