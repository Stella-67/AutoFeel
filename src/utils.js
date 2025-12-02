// ==================== Utility Functions ====================
// Common helper functions used across the extension

/**
 * Send notification message to content script
 * @param {number} tabId - Tab ID to send notification to
 * @param {string} message - Message text
 * @param {string} status - Status: 'loading', 'success', 'error'
 */
async function notifyTab(tabId, message, status) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_NOTIFICATION',
      message: message,
      status: status
    });
  } catch (error) {
    console.error('[AutoFeel Utils] Failed to send notification:', error);
  }
}

/**
 * Generate UUID
 * @returns {string} UUID string
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Detect language from text (simple heuristic)
 * @param {string} text - Text to detect language from
 * @returns {string} Language code ('zh', 'ja', 'ko', 'en')
 */
function detectLanguage(text) {
  // Check for Chinese characters
  if (/[\u4e00-\u9fa5]/.test(text)) {
    return 'zh';
  }
  // Check for Japanese characters
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
    return 'ja';
  }
  // Check for Korean characters
  if (/[\uac00-\ud7af]/.test(text)) {
    return 'ko';
  }
  // Default to English
  return 'en';
}

/**
 * Robust JSON parser with error recovery
 * Attempts multiple strategies to parse potentially malformed JSON from LLM
 * @param {string} jsonString - JSON string to parse
 * @param {string} fallbackText - Fallback text if parsing fails
 * @returns {object} Parsed JSON or fallback structure
 */
function parseRobustJSON(jsonString, fallbackText) {
  const createFallback = () => ({
    structuredText: fallbackText || '',
    language: 'en',
    mainTopics: [],
    keyPoints: [],
    entities: { people: [], organizations: [], locations: [], dates: [] },
    semanticChunks: []
  });

  try {
    // Strategy 1: Direct parse
    return JSON.parse(jsonString);
  } catch (e1) {
    console.warn('[AutoFeel Utils] Direct JSON parse failed, trying cleanup strategies...');

    try {
      // Strategy 2: Clean common issues
      let cleaned = jsonString
        // Remove trailing commas before closing brackets/braces
        .replace(/,(\s*[}\]])/g, '$1')
        // Fix unescaped newlines in strings
        .replace(/:\s*"([^"]*)\n([^"]*)"(?=\s*[,}])/g, (match, p1, p2) => {
          return `: "${p1}\\n${p2}"`;
        })
        // Remove any text after the final closing brace
        .replace(/\}[^}]*$/, '}')
        // Remove control characters except newlines and tabs
        .replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]/g, '');

      return JSON.parse(cleaned);
    } catch (e2) {
      console.warn('[AutoFeel Utils] Cleanup strategy failed, trying truncation recovery...');

      try {
        // Strategy 3: Try to salvage truncated JSON
        let truncated = jsonString;

        // If it ends with incomplete array, close it
        if (truncated.match(/\[[^\]]*$/)) {
          truncated = truncated.replace(/,?\s*[^,\]]*$/, ']');
        }

        // If it ends with incomplete object, close it
        if (truncated.match(/\{[^}]*$/)) {
          truncated = truncated.replace(/,?\s*[^,}]*$/, '}');
        }

        // Ensure proper closing braces
        const openBraces = (truncated.match(/\{/g) || []).length;
        const closeBraces = (truncated.match(/\}/g) || []).length;
        const openBrackets = (truncated.match(/\[/g) || []).length;
        const closeBrackets = (truncated.match(/\]/g) || []).length;

        truncated += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
        truncated += '}'.repeat(Math.max(0, openBraces - closeBraces));

        return JSON.parse(truncated);
      } catch (e3) {
        console.warn('[AutoFeel Utils] Truncation recovery failed, trying minimal extraction...');

        try {
          // Strategy 4: Extract only the structuredText field if possible
          const textMatch = jsonString.match(/"structuredText"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          if (textMatch) {
            const extracted = textMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
            console.log('[AutoFeel Utils] Successfully extracted structuredText field');
            return {
              structuredText: extracted,
              language: 'en',
              mainTopics: [],
              keyPoints: [],
              entities: { people: [], organizations: [], locations: [], dates: [] },
              semanticChunks: []
            };
          }
        } catch (e4) {
          console.error('[AutoFeel Utils] Minimal extraction failed');
        }

        // Strategy 5: Complete fallback
        console.error('[AutoFeel Utils] All JSON parsing strategies failed, using fallback');
        console.error('[AutoFeel Utils] Original error:', e1.message);
        console.error('[AutoFeel Utils] JSON string preview:', jsonString.substring(0, 500) + '...');
        return createFallback();
      }
    }
  }
}
