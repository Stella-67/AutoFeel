// ==================== Schema Builder ====================
// Build document and chunk schemas for database storage

/**
 * Build document schema
 */
function buildDocumentSchema(rawContent, llmResult, memoryReady) {
  const docId = generateUUID();
  const capturedAt = new Date().toISOString();

  const language = llmResult.language || detectLanguage(rawContent.text);

  const documentSchema = {
    doc_id: docId,
    title: rawContent.metadata.title,
    url: rawContent.metadata.url,
    captured_at: capturedAt,
    source_type: rawContent.source === 'selection' ? 'web_selection' : 'web_page',
    raw_text: rawContent.text,
    clean_text: memoryReady.cleanText,
    metadata: {
      language: language,
      length: memoryReady.cleanText.length,
      tags: llmResult.mainTopics || [],
      llm_cleaner_version: '1.0.0',
      word_count: memoryReady.metadata.totalWords,
      chunk_count: memoryReady.metadata.totalChunks,
      entities: llmResult.entities || {},
      key_points: llmResult.keyPoints || []
    }
  };

  console.log('[AutoFeel Schema] Document schema built:', docId);
  return { docId, documentSchema };
}

/**
 * Build chunk schemas
 */
function buildChunkSchemas(docId, chunks, rawContent, llmResult) {
  const createdAt = new Date().toISOString();
  const language = llmResult.language || detectLanguage(rawContent.text);

  const chunkSchemas = chunks.map((chunk, index) => {
    const chunkId = generateUUID();
    const wordCount = chunk.metadata.wordCount;
    const tokenCount = Math.round(wordCount * 1.3);

    return {
      chunk_id: chunkId,
      doc_id: docId,
      order: index,
      text: chunk.text,
      embedding: null,

      block_type: chunk.blockType || 'paragraph',
      importance: chunk.metadata.importance,
      created_at: createdAt,

      source: {
        title: rawContent.metadata.title,
        url: rawContent.metadata.url
      },

      metadata: {
        language: language,
        from_selection: rawContent.source === 'selection',
        tags: chunk.tags || [],
        sentence_count: chunk.metadata.sentenceCount,
        token_count: tokenCount,
        word_count: wordCount,
        position: chunk.metadata.position,
        topic: chunk.topic || '',
        key_entities: chunk.metadata.keyEntities || []
      }
    };
  });

  console.log(`[AutoFeel Schema] Built ${chunkSchemas.length} chunk schemas`);
  return chunkSchemas;
}
