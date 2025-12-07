// ==================== Relationship Analyzer ====================
// Handles re-analysis of chunk relationships for knowledge graph

/**
 * Re-analyze all chunk relationships in the database
 * Uses LLM to analyze semantic relationships between chunks
 *
 * @param {Object} llmConfig - LLM configuration {llmProvider, apiKey, apiEndpoint, modelName}
 * @param {Function} progressCallback - Callback function for progress updates
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function handleReanalyzeRelationships(llmConfig, progressCallback) {
  try {
    const memoryDB = new MemoryDB();
    await memoryDB.init();

    const decisionAgent = new DecisionAgent(memoryDB);

    const result = await decisionAgent.reanalyzeAllChunks(
      llmConfig,
      (progress) => {
        console.log(`[RelationshipAnalyzer] Re-analysis progress: ${progress.current}/${progress.total}`);
        if (progressCallback) {
          progressCallback(progress);
        }
      }
    );

    return result;
  } catch (error) {
    console.error('[RelationshipAnalyzer] Re-analysis error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
