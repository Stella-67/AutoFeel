// ==================== Memory Retrieval Module ====================
// RAG (Retrieval-Augmented Generation) functionality

/**
 * Retrieve relevant knowledge chunks from memory database
 * Uses semantic search (with embeddings) or keyword search (fallback)
 *
 * @param {string} queryText - Search query text
 * @param {Object} config - LLM configuration {llmProvider, apiKey, apiEndpoint, modelName}
 * @param {number} topK - Number of top results to return
 * @returns {Promise<string>} - Formatted context string with retrieved knowledge
 */
async function retrieveRelevantKnowledge(queryText, config, topK = 3) {
  if (!queryText || queryText.trim().length === 0) {
    return '';
  }

  try {
    const { llmProvider } = config;

    // Use semantic search for providers that support embeddings
    if (llmProvider === 'openai' || llmProvider === 'custom') {
      return await semanticSearch(queryText, config, topK);
    } else {
      // Use keyword-based search for other providers
      return await keywordSearch(queryText, topK);
    }
  } catch (error) {
    console.error('[MemoryRetrieval] Error retrieving knowledge:', error);
    return '';
  }
}

/**
 * Semantic search using vector embeddings
 */
async function semanticSearch(queryText, config, topK) {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(queryText, config);

    if (!queryEmbedding) {
      console.warn('[MemoryRetrieval] Failed to generate query embedding, falling back to keyword search');
      return await keywordSearch(queryText, topK);
    }

    // Search in database
    await memoryDB.init();
    const searchResults = await memoryDB.semanticSearch(queryEmbedding, topK);

    if (!searchResults || searchResults.length === 0) {
      return '';
    }

    console.log(`[MemoryRetrieval] Found ${searchResults.length} relevant chunks (semantic search)`);

    // ==================== Card Architecture: Record Activation ====================
    // Track that these chunks were retrieved (activation-based reinforcement)
    try {
      // ActivationTracker is loaded globally via importScripts in background.js
      const activationTracker = new ActivationTracker(memoryDB);

      const retrievedIds = searchResults.map(r => r.chunk_id);

      // Record activation for each retrieved chunk
      for (const chunkId of retrievedIds) {
        // For each chunk, the others in the result set are co-activated
        const coActivatedIds = retrievedIds.filter(id => id !== chunkId);
        await activationTracker.recordActivation(chunkId, coActivatedIds);
      }

      console.log('[MemoryRetrieval] ✅ Recorded activation for retrieved chunks');
    } catch (activationError) {
      console.warn('[MemoryRetrieval] Failed to record activation:', activationError);
      // Continue with retrieval even if activation tracking fails
    }

    // Format results
    return formatSearchResults(searchResults);
  } catch (error) {
    console.error('[MemoryRetrieval] Semantic search error:', error);
    return '';
  }
}

/**
 * Keyword-based search (fallback for providers without embedding support)
 */
async function keywordSearch(queryText, topK) {
  try {
    await memoryDB.init();
    const searchResults = await memoryDB.keywordSearch(queryText, topK);

    if (!searchResults || searchResults.length === 0) {
      return '';
    }

    console.log(`[MemoryRetrieval] Found ${searchResults.length} relevant chunks (keyword search)`);

    // ==================== Card Architecture: Record Activation ====================
    // Track that these chunks were retrieved (activation-based reinforcement)
    try {
      // ActivationTracker is loaded globally via importScripts in background.js
      const activationTracker = new ActivationTracker(memoryDB);

      const retrievedIds = searchResults.map(r => r.chunk_id);

      // Record activation for each retrieved chunk
      for (const chunkId of retrievedIds) {
        // For each chunk, the others in the result set are co-activated
        const coActivatedIds = retrievedIds.filter(id => id !== chunkId);
        await activationTracker.recordActivation(chunkId, coActivatedIds);
      }

      console.log('[MemoryRetrieval] ✅ Recorded activation for retrieved chunks');
    } catch (activationError) {
      console.warn('[MemoryRetrieval] Failed to record activation:', activationError);
      // Continue with retrieval even if activation tracking fails
    }

    // Format results
    return formatSearchResults(searchResults);
  } catch (error) {
    console.error('[MemoryRetrieval] Keyword search error:', error);
    return '';
  }
}

/**
 * Format search results into context string
 */
function formatSearchResults(results) {
  return results.map((chunk, index) => {
    const relevancePercent = (chunk.similarity * 100).toFixed(1);
    return `[Retrieved Knowledge ${index + 1}] (Relevance: ${relevancePercent}%)
Source: ${chunk.source.title}
Content: ${chunk.text}`;
  }).join('\n\n');
}
