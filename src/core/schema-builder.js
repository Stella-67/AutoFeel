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
 * Build chunk schemas with enhanced knowledge graph structure
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

      // Enhanced chunk classification
      block_type: chunk.blockType || 'paragraph',
      chunk_type: chunk.chunkType || 'unknown', // concept, fact, procedure, example, definition, etc.
      importance: chunk.metadata.importance,
      created_at: createdAt,

      // ==================== Card Architecture (v2) ====================

      // Layering system
      layer: 'temporary',           // New chunks start in temporary layer

      // Confidence & Surprise
      confidence: 0.5,              // Initial medium confidence
      surprise: 0.5,                // Will be calculated after creation

      // Activation & Reinforcement
      activation_count: 0,          // Number of times retrieved/used
      activation_weight: 0,         // Activation strength (0-1)
      last_activated: createdAt,    // Last activation timestamp

      // Stability & Migration
      stability_score: 0.3,         // Initial low stability (temporary layer)
      migration_ready: false,       // Not ready to migrate yet

      // Lifecycle & Evolution
      version: 1,                   // Card version (for tracking changes)
      parent_card_id: null,         // If split from another card
      merged_from: [],              // If merged from multiple cards

      // Forgetting & Pruning
      decay_factor: 1.0,            // Full strength (no decay yet)
      obsolete: false,              // Not obsolete
      last_updated: createdAt,      // Last update timestamp

      // Knowledge graph: relationships to other chunks
      relationships: {
        related_chunks: [],        // IDs of semantically related chunks
        parent_chunks: [],         // Chunks this one elaborates on
        child_chunks: [],          // Chunks that elaborate on this one
        contradicts: [],           // Chunks with conflicting information
        supports: [],              // Chunks that support this one
        prerequisite_of: [],       // This chunk is prerequisite for these chunks
        requires: []               // Chunks needed to understand this one
      },

      // Source document reference
      source: {
        title: rawContent.metadata.title,
        url: rawContent.metadata.url,
        doc_id: docId             // Explicit link back to source document
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
        key_entities: chunk.metadata.keyEntities || [],

        // Enhanced metadata for knowledge management
        confidence_score: 1.0,    // How confident we are in this information
        last_verified: createdAt, // When this chunk was last verified
        update_count: 0,          // How many times this chunk was updated
        access_count: 0           // How many times this chunk was retrieved
      }
    };
  });

  console.log(`[AutoFeel Schema] Built ${chunkSchemas.length} chunk schemas with knowledge graph structure`);
  return chunkSchemas;
}
