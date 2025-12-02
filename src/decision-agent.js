// ==================== Decision Agent ====================
// Decides how to handle document saves (new, update, skip, merge)

class DecisionAgent {
  constructor(memoryDB) {
    this.memoryDB = memoryDB;
  }

  /**
   * Analyze and decide what to do with a new document
   * @param {object} newDoc - New document schema
   * @param {array} newChunks - New chunk schemas
   * @returns {Promise<object>} - Decision with action and reason
   */
  async decide(newDoc, newChunks) {
    console.log('[Decision Agent] Analyzing document...');
    console.log(`[Decision Agent] URL: ${newDoc.url}`);
    console.log(`[Decision Agent] Normalized URL: ${this.memoryDB.normalizeUrl(newDoc.url)}`);
    console.log(`[Decision Agent] Title: ${newDoc.title}`);

    // Check if document exists (uses normalized URL matching)
    const existingDoc = await this.memoryDB.findDocumentByUrl(newDoc.url);

    if (!existingDoc) {
      // New document - save it
      return {
        action: 'create',
        reason: 'New document',
        strategy: 'save_new',
        existingDoc: null
      };
    }

    console.log('[Decision Agent] Found existing document');
    console.log(`[Decision Agent] Existing ID: ${existingDoc.doc_id}`);
    console.log(`[Decision Agent] Existing captured: ${existingDoc.captured_at}`);

    // Check content similarity (use clean_text field)
    const similarity = this.memoryDB.calculateTextSimilarity(
      existingDoc.clean_text || '',
      newDoc.clean_text || ''
    );

    console.log(`[Decision Agent] Content similarity: ${(similarity * 100).toFixed(1)}%`);

    // Decision thresholds - ALWAYS UPDATE (user pressed Option+C intentionally)
    const SMART_UPDATE_THRESHOLD = 0.85; // >85% similar - smart update (merge new chunks)
    // <85% similar - replace (major changes)

    if (similarity > SMART_UPDATE_THRESHOLD) {
      // Minor changes - smart update (merge new info)
      // Even if very similar, user wants to update, so we do smart_update
      return {
        action: 'update',
        reason: `Content updated (${(similarity * 100).toFixed(1)}% similar)`,
        strategy: 'smart_update',
        existingDoc: existingDoc,
        similarity: similarity
      };
    } else {
      // Major changes - complete replace
      return {
        action: 'update',
        reason: `Major changes detected (${(similarity * 100).toFixed(1)}% similar)`,
        strategy: 'replace',
        existingDoc: existingDoc,
        similarity: similarity
      };
    }
  }

  /**
   * Execute the decided action
   * @param {object} decision - Decision from decide()
   * @param {object} newDoc - New document schema
   * @param {array} newChunks - New chunk schemas
   * @returns {Promise<object>} - Execution result
   */
  async execute(decision, newDoc, newChunks) {
    console.log(`[Decision Agent] Executing: ${decision.action} (${decision.strategy})`);

    try {
      switch (decision.action) {
        case 'create':
          return await this.executeCreate(newDoc, newChunks);

        case 'update':
          if (decision.strategy === 'smart_update') {
            return await this.executeSmartUpdate(decision.existingDoc, newDoc, newChunks);
          } else {
            return await this.executeReplace(decision.existingDoc, newDoc, newChunks);
          }

        case 'skip':
          return {
            success: true,
            action: 'skipped',
            reason: decision.reason,
            docId: decision.existingDoc.doc_id
          };

        default:
          throw new Error(`Unknown action: ${decision.action}`);
      }
    } catch (error) {
      console.error('[Decision Agent] Execution failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute create - save new document
   */
  async executeCreate(newDoc, newChunks) {
    await this.memoryDB.saveDocument(newDoc);
    await this.memoryDB.saveChunks(newChunks);

    console.log(`[Decision Agent] ✅ Created new document: ${newDoc.doc_id}`);
    return {
      success: true,
      action: 'created',
      reason: 'New document saved',
      docId: newDoc.doc_id,
      chunkCount: newChunks.length
    };
  }

  /**
   * Execute replace - delete old and save new
   */
  async executeReplace(existingDoc, newDoc, newChunks) {
    // Delete old document and chunks
    await this.memoryDB.deleteDocument(existingDoc.doc_id);

    // Save new document and chunks with same doc_id to maintain references
    const updatedDoc = {
      ...newDoc,
      doc_id: existingDoc.doc_id // Keep the same ID
    };

    await this.memoryDB.saveDocument(updatedDoc);
    await this.memoryDB.saveChunks(newChunks);

    console.log(`[Decision Agent] ✅ Replaced document: ${existingDoc.doc_id}`);
    return {
      success: true,
      action: 'updated',
      reason: 'Content updated',
      docId: existingDoc.doc_id,
      chunkCount: newChunks.length
    };
  }

  /**
   * Execute smart update - merge new chunks with existing ones
   * This avoids duplicates while adding new information
   */
  async executeSmartUpdate(existingDoc, newDoc, newChunks) {
    // Get existing chunks
    const existingChunks = await this.memoryDB.getChunksByDocId(existingDoc.doc_id);

    // Find truly new chunks (not similar to existing ones)
    const newUniqueChunks = [];
    const CHUNK_SIMILARITY_THRESHOLD = 0.85;

    for (const newChunk of newChunks) {
      let isDuplicate = false;

      for (const existingChunk of existingChunks) {
        const similarity = this.memoryDB.calculateTextSimilarity(
          existingChunk.text || '',
          newChunk.text || ''
        );

        if (similarity > CHUNK_SIMILARITY_THRESHOLD) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        newUniqueChunks.push(newChunk);
      }
    }

    // Update document metadata (always update, even if no new chunks)
    const updatedDoc = {
      ...newDoc,
      doc_id: existingDoc.doc_id,
      metadata: {
        ...newDoc.metadata,
        chunk_count: existingChunks.length + newUniqueChunks.length
      }
    };

    await this.memoryDB.saveDocument(updatedDoc);

    if (newUniqueChunks.length === 0) {
      // No new chunks, but still update document metadata (timestamp, etc.)
      console.log(`[Decision Agent] ✅ Updated metadata (no new chunks, but timestamp refreshed)`);
      return {
        success: true,
        action: 'updated',
        reason: 'Document metadata updated',
        docId: existingDoc.doc_id,
        addedChunks: 0,
        totalChunks: existingChunks.length
      };
    }

    // Save new chunks
    await this.memoryDB.saveChunks(newUniqueChunks);

    console.log(`[Decision Agent] ✅ Smart update: added ${newUniqueChunks.length} new chunks`);
    return {
      success: true,
      action: 'updated',
      reason: `Added ${newUniqueChunks.length} new chunks`,
      docId: existingDoc.doc_id,
      addedChunks: newUniqueChunks.length,
      totalChunks: existingChunks.length + newUniqueChunks.length
    };
  }

  /**
   * Get human-readable explanation of decision
   */
  explainDecision(decision) {
    const emoji = {
      create: '📄',
      update: '🔄',
      skip: '⏭️'
    };

    return `${emoji[decision.action]} ${decision.reason} (Strategy: ${decision.strategy})`;
  }
}
