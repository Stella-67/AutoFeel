// ==================== Text Processor ====================
// Text cleaning and chunking pipeline

/**
 * Step 1: LLM Pre-Cleaning - Structured extraction using LLM
 */
async function llmPreCleaning(rawContent, config) {
  const { llmProvider, apiKey, apiEndpoint, modelName } = config;

  try {
    const systemPrompt = `You are a text extraction and structuring expert. Your task is to:
1. Extract the main content and remove noise (ads, navigation, repeated elements)
2. Identify key topics and entities
3. Structure the text in a clean, readable format
4. **Intelligently divide the content into semantic chunks** based on topic/theme changes
5. Detect the primary language of the content

Return a JSON object with:
{
  "structuredText": "clean, well-formatted text",
  "language": "en",
  "mainTopics": ["topic1", "topic2"],
  "keyPoints": ["point1", "point2"],
  "entities": {
    "people": [],
    "organizations": [],
    "locations": [],
    "dates": []
  },
  "semanticChunks": [
    {
      "topic": "chunk topic or theme",
      "text": "chunk content",
      "importance": 0.8,
      "keyEntities": ["entity1", "entity2"],
      "blockType": "paragraph"
    }
  ]
}

For language: Use ISO 639-1 codes (en, zh, ja, ko, es, fr, de, etc.)
For blockType: Use "paragraph", "list", "code", "quote", "heading", etc.
For semantic chunks:
- Divide based on topic/theme transitions, NOT fixed sentence counts
- Each chunk should represent a coherent idea or concept
- Assign importance 0.0-1.0 based on relevance to main topics
- Extract key entities mentioned in each chunk`;

    const userPrompt = `Please analyze and structure the following content:

Source: ${rawContent.source === 'selection' ? 'User Selection' : 'Full Page'}
Title: ${rawContent.metadata.title}
URL: ${rawContent.metadata.url}
Word Count: ${rawContent.wordCount}

Content:
${rawContent.text}

Extract the main content, identify key topics and entities, divide into semantic chunks, and return structured JSON.`;

    const requestBody = buildLLMRequestBody(llmProvider, modelName, userPrompt, systemPrompt, {
      maxTokens: 2000,
      temperature: 0.7
    });
    const headers = buildLLMHeaders(llmProvider, apiKey);

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `API request failed (${response.status}): ${errorText}`
      };
    }

    const data = await response.json();
    const content = extractLLMResponse(llmProvider, data);

    // Extract and save token usage
    const tokenUsage = extractTokenUsage(llmProvider, data);
    if (tokenUsage) {
      await updateTokenUsage(llmProvider, tokenUsage);
    }

    // Parse JSON response
    console.log('[AutoFeel TextProcessor] LLM Pre-Cleaning raw response:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AutoFeel TextProcessor] No JSON found in LLM response');
      return {
        success: true,
        data: {
          structuredText: rawContent.text,
          mainTopics: [],
          keyPoints: [],
          entities: {}
        },
        tokenUsage: tokenUsage
      };
    }

    const result = parseRobustJSON(jsonMatch[0], rawContent.text);
    console.log('[AutoFeel TextProcessor] LLM Pre-Cleaning result:', result);

    return {
      success: true,
      data: result,
      tokenUsage: tokenUsage,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[AutoFeel TextProcessor] LLM Pre-Cleaning error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Step 2: Post-LLM Cleanup - Apply mechanical rules and sentence splitting
 */
function postLLMCleanup(llmResult) {
  try {
    let cleanedText = llmResult.structuredText;

    const appliedRules = [];

    // Rule 1: Remove excessive whitespace
    const before1 = cleanedText.length;
    cleanedText = cleanedText.replace(/\s+/g, ' ');
    if (cleanedText.length !== before1) {
      appliedRules.push('Remove excessive whitespace');
    }

    // Rule 2: Remove repeated punctuation
    cleanedText = cleanedText.replace(/([.!?])\1+/g, '$1');
    appliedRules.push('Normalize punctuation');

    // Rule 3: Trim whitespace around punctuation
    cleanedText = cleanedText.replace(/\s+([,.!?;:])/g, '$1');
    cleanedText = cleanedText.replace(/([,.!?;:])\s+/g, '$1 ');

    // Rule 4: Fix line breaks
    cleanedText = cleanedText.replace(/\n\s*\n\s*\n+/g, '\n\n');

    // Sentence splitting
    const sentences = cleanedText
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`[AutoFeel TextProcessor] Post-cleanup: ${sentences.length} sentences extracted`);

    return {
      cleanedText: cleanedText.trim(),
      sentences: sentences,
      appliedRules: appliedRules,
      sentenceCount: sentences.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[AutoFeel TextProcessor] Post-LLM Cleanup error:', error);
    return {
      cleanedText: llmResult.structuredText,
      sentences: [llmResult.structuredText],
      appliedRules: [],
      sentenceCount: 1,
      error: error.message
    };
  }
}

/**
 * Step 3: Chunk Builder - Use semantic chunks from LLM or fallback
 */
function chunkBuilder(cleanupResult, llmResult) {
  try {
    let chunks = [];

    // Method 1: Use LLM-provided semantic chunks
    if (llmResult.semanticChunks && llmResult.semanticChunks.length > 0) {
      console.log(`[AutoFeel TextProcessor] Using ${llmResult.semanticChunks.length} LLM semantic chunks`);

      chunks = llmResult.semanticChunks.map((chunk, index) => {
        let position = 'middle';
        if (index === 0) position = 'start';
        if (index === llmResult.semanticChunks.length - 1) position = 'end';

        const tags = [chunk.topic];

        if (llmResult.mainTopics && llmResult.mainTopics.length > 0) {
          llmResult.mainTopics.forEach(topic => {
            if (chunk.text.toLowerCase().includes(topic.toLowerCase()) && !tags.includes(topic)) {
              tags.push(topic);
            }
          });
        }

        if (chunk.keyEntities && chunk.keyEntities.length > 0) {
          chunk.keyEntities.forEach(entity => {
            if (!tags.includes(entity)) {
              tags.push(entity);
            }
          });
        }

        const wordCount = chunk.text.split(/\s+/).length;
        const sentenceCount = chunk.text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;

        return {
          id: index + 1,
          text: chunk.text,
          topic: chunk.topic,
          tags: tags,
          blockType: chunk.blockType || 'paragraph',
          metadata: {
            position: position,
            wordCount: wordCount,
            importance: chunk.importance || 0.5,
            sentenceCount: sentenceCount,
            keyEntities: chunk.keyEntities || []
          }
        };
      });
    }
    // Method 2: Fallback to paragraph-based chunking
    else {
      console.log('[AutoFeel TextProcessor] Using paragraph-based fallback');

      const text = cleanupResult.cleanedText;
      const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

      if (paragraphs.length === 0) {
        const sentences = cleanupResult.sentences;
        const CHUNK_SIZE = 5;

        for (let i = 0; i < sentences.length; i += CHUNK_SIZE) {
          const chunkSentences = sentences.slice(i, i + CHUNK_SIZE);
          const chunkText = chunkSentences.join(' ');
          chunks.push(createChunkFromText(chunkText, i, sentences.length, llmResult));
        }
      } else {
        paragraphs.forEach((para, index) => {
          chunks.push(createChunkFromText(para, index, paragraphs.length, llmResult));
        });
      }
    }

    console.log(`[AutoFeel TextProcessor] Built ${chunks.length} chunks`);

    return {
      chunks: chunks,
      totalChunks: chunks.length,
      chunkingMethod: llmResult.semanticChunks ? 'llm-semantic' : 'paragraph-based',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[AutoFeel TextProcessor] Chunk Builder error:', error);
    return {
      chunks: [],
      totalChunks: 0,
      error: error.message
    };
  }
}

/**
 * Helper: Create chunk from text (for fallback method)
 */
function createChunkFromText(text, index, total, llmResult) {
  let position = 'middle';
  if (index === 0) position = 'start';
  if (index >= total - 1) position = 'end';

  let importance = 0.5;
  if (llmResult.keyPoints && llmResult.keyPoints.length > 0) {
    const mentionCount = llmResult.keyPoints.filter(kp =>
      text.toLowerCase().includes(kp.toLowerCase())
    ).length;
    importance = Math.min(1.0, 0.3 + (mentionCount * 0.2));
  }

  const tags = [];
  if (llmResult.mainTopics && llmResult.mainTopics.length > 0) {
    llmResult.mainTopics.forEach(topic => {
      if (text.toLowerCase().includes(topic.toLowerCase())) {
        tags.push(topic);
      }
    });
  }

  const firstSentence = text.split(/[.!?]/)[0].trim();
  const topic = firstSentence.substring(0, 50) + (firstSentence.length > 50 ? '...' : '');

  const wordCount = text.split(/\s+/).length;
  const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;

  return {
    id: index + 1,
    text: text,
    topic: topic,
    tags: tags.length > 0 ? tags : ['General'],
    blockType: 'paragraph',
    metadata: {
      position: position,
      wordCount: wordCount,
      importance: importance,
      sentenceCount: sentenceCount,
      keyEntities: []
    }
  };
}

/**
 * Step 4: Build Memory-Ready Data - Final structured data
 */
function buildMemoryReadyData(chunks, rawContent, llmResult, cleanupResult) {
  try {
    const cleanText = chunks.map(c => c.text).join('\n\n');

    const memoryReady = {
      cleanText: cleanText,
      chunks: chunks,
      metadata: {
        source: rawContent.source,
        sourceUrl: rawContent.metadata.url,
        sourceTitle: rawContent.metadata.title,
        processedAt: new Date().toISOString(),
        totalChunks: chunks.length,
        totalSentences: cleanupResult.sentenceCount,
        totalWords: cleanText.split(/\s+/).length,
        mainTopics: llmResult.mainTopics || [],
        keyPoints: llmResult.keyPoints || [],
        entities: llmResult.entities || {}
      }
    };

    console.log('[AutoFeel TextProcessor] Memory-ready data built:', memoryReady.metadata);

    return memoryReady;
  } catch (error) {
    console.error('[AutoFeel TextProcessor] Build Memory-Ready Data error:', error);
    return {
      cleanText: '',
      chunks: [],
      metadata: {},
      error: error.message
    };
  }
}
