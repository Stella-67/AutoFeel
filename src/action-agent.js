// ==================== AutoFeel Action Agent ====================
// Executes strategies decided by the reasoning layer

class ActionAgent {
  constructor() {
    this.initialized = false;
    this.memoryDB = null;
  }

  /**
   * Initialize the action agent
   * @param {object} memoryDB - Reference to memory database
   */
  async init(memoryDB) {
    this.memoryDB = memoryDB;
    await this.memoryDB.init();
    this.initialized = true;
  }

  /**
   * Execute an action based on decision
   * @param {object} decision - Decision from reasoning agent
   * @param {object} data - Document and chunk schemas
   * @param {object} existingDoc - Existing document (if any)
   * @returns {object} - Execution result
   */
  async execute(decision, data, existingDoc = null) {
    if (!this.initialized) {
      throw new Error('ActionAgent not initialized. Call init(memoryDB) first.');
    }

    const { documentSchema, chunkSchemas } = data;
    const action = decision.decision.action;
    const params = decision.decision.params;

    console.log('[AutoFeel Action] Executing:', action);

    switch (action) {
      case 'save_document':
        return await this.saveDocument(documentSchema, chunkSchemas, params);

      case 'update_document':
        return await this.updateDocument(existingDoc, documentSchema, chunkSchemas, params);

      case 'skip_save':
        return await this.skipSave(existingDoc, params);

      default:
        console.warn('[AutoFeel Action] Unknown action:', action);
        return { success: false, error: 'Unknown action' };
    }
  }

  /**
   * Save new document
   */
  async saveDocument(documentSchema, chunkSchemas, params) {
    console.log('[AutoFeel Action] Saving new document with params:', params);

    // Enhance document metadata with strategy params
    const enhancedDoc = {
      ...documentSchema,
      metadata: {
        ...documentSchema.metadata,
        category: params.category || 'general',
        priority: params.priority || 'normal',
        trackVersion: params.trackVersion !== false,
        version: 1
      }
    };

    // Save to database
    await this.memoryDB.saveDocument(enhancedDoc);
    await this.memoryDB.saveChunks(chunkSchemas);

    return {
      success: true,
      action: 'created',
      docId: enhancedDoc.doc_id,
      chunkCount: chunkSchemas.length,
      version: 1,
      params: params
    };
  }

  /**
   * Update existing document
   */
  async updateDocument(existingDoc, newDocumentSchema, newChunkSchemas, params) {
    console.log('[AutoFeel Action] Updating document with params:', params);

    // Check if we should create a version or replace
    if (params.createVersion || params.trackVersion) {
      // Version update - increment version number
      const result = await this.memoryDB.updateDocument(
        existingDoc.doc_id,
        newDocumentSchema,
        newChunkSchemas
      );

      return {
        success: true,
        action: 'updated',
        docId: existingDoc.doc_id,
        oldChunkCount: result.oldChunkCount,
        newChunkCount: result.newChunkCount,
        version: result.version,
        params: params
      };
    } else {
      // Simple replace without version tracking
      await this.memoryDB.updateDocument(
        existingDoc.doc_id,
        newDocumentSchema,
        newChunkSchemas
      );

      return {
        success: true,
        action: 'replaced',
        docId: existingDoc.doc_id,
        chunkCount: newChunkSchemas.length,
        params: params
      };
    }
  }

  /**
   * Skip saving (no changes)
   */
  async skipSave(existingDoc, params) {
    console.log('[AutoFeel Action] Skipping save for:', existingDoc?.doc_id);

    // Optionally update last access time or view count
    if (params.updateLastAccess && existingDoc) {
      // Update last access metadata
      const updatedDoc = {
        ...existingDoc,
        metadata: {
          ...existingDoc.metadata,
          lastAccessed: new Date().toISOString(),
          viewCount: (existingDoc.metadata.viewCount || 0) + 1
        }
      };

      const transaction = this.memoryDB.db.transaction(['documents'], 'readwrite');
      const store = transaction.objectStore('documents');
      await new Promise((resolve, reject) => {
        const request = store.put(updatedDoc);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    return {
      success: true,
      action: 'skipped',
      docId: existingDoc?.doc_id,
      reason: 'No significant changes',
      params: params
    };
  }

  /**
   * Create a version snapshot of a document (for future version management)
   * @param {string} docId - Document ID
   * @returns {object} - Version snapshot
   */
  async createVersionSnapshot(docId) {
    const doc = await this.memoryDB.getDocument(docId);
    const chunks = await this.memoryDB.getChunksByDocId(docId);

    if (!doc) {
      throw new Error('Document not found');
    }

    // Create version snapshot
    const snapshot = {
      snapshot_id: `${docId}_v${doc.metadata.version || 1}_${Date.now()}`,
      doc_id: docId,
      version: doc.metadata.version || 1,
      document: doc,
      chunks: chunks,
      created_at: new Date().toISOString()
    };

    // In a real implementation, this would be saved to a separate 'versions' store
    console.log('[AutoFeel Action] Created version snapshot:', snapshot.snapshot_id);

    return snapshot;
  }

  /**
   * List all versions of a document (for future version management)
   * @param {string} docId - Document ID
   * @returns {array} - List of versions
   */
  async listVersions(docId) {
    // This would query a 'versions' store in a real implementation
    // For now, just return current version
    const doc = await this.memoryDB.getDocument(docId);

    if (!doc) {
      return [];
    }

    return [{
      version: doc.metadata.version || 1,
      created_at: doc.captured_at,
      updated_at: doc.metadata.previous_captured_at || doc.captured_at,
      isCurrent: true
    }];
  }

  /**
   * Intelligent merge of profile data (for future implementation)
   * @param {object} existingDoc - Existing profile document
   * @param {object} newDoc - New profile data
   * @returns {object} - Merged document
   */
  async intelligentMerge(existingDoc, newDoc) {
    console.log('[AutoFeel Action] Performing intelligent merge');

    // Simple merge strategy: prefer newer data but preserve unique info
    const merged = {
      ...existingDoc,
      title: newDoc.title || existingDoc.title,
      clean_text: this.mergeText(existingDoc.clean_text, newDoc.clean_text),
      metadata: {
        ...existingDoc.metadata,
        ...newDoc.metadata,
        mergedFrom: [existingDoc.doc_id, newDoc.doc_id],
        mergedAt: new Date().toISOString()
      }
    };

    return merged;
  }

  /**
   * Merge text content (helper for intelligent merge)
   */
  mergeText(oldText, newText) {
    // Simple strategy: if texts are very different, concatenate
    // Otherwise, prefer newer text
    const similarity = this.calculateSimilarity(oldText, newText);

    if (similarity < 0.5) {
      // Very different - concatenate with separator
      return `${oldText}\n\n--- Updated Information ---\n\n${newText}`;
    } else {
      // Similar - prefer newer
      return newText;
    }
  }

  /**
   * Calculate text similarity (simple word-based)
   */
  calculateSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Extract form-fillable data from document (for future form sync)
   * @param {object} document - Document to extract from
   * @returns {object} - Structured form data
   */
  extractFormData(document) {
    console.log('[AutoFeel Action] Extracting form data from:', document.doc_id);

    // This would use NLP or LLM to extract structured data
    // For now, return placeholder
    return {
      extracted: true,
      docId: document.doc_id,
      fields: {
        // Would contain extracted fields like:
        // name: "John Doe",
        // email: "john@example.com",
        // etc.
      }
    };
  }

  /**
   * Sync document data to form fields (for future implementation)
   * @param {object} formFields - Form fields from page
   * @param {object} document - Document to sync from
   * @returns {object} - Mapping of fields to values
   */
  async syncToForm(formFields, document) {
    console.log('[AutoFeel Action] Syncing to form fields');

    const formData = this.extractFormData(document);

    // Map extracted data to form fields
    const mapping = {};

    formFields.forEach(field => {
      const fieldName = field.name || field.id || field.label;

      // Simple matching - would be more sophisticated in real implementation
      if (formData.fields[fieldName]) {
        mapping[fieldName] = formData.fields[fieldName];
      }
    });

    return mapping;
  }

  /**
   * Get execution statistics
   * @returns {object} - Statistics about actions executed
   */
  getStatistics() {
    // Would track statistics in a real implementation
    return {
      totalActions: 0,
      saves: 0,
      updates: 0,
      skips: 0,
      errors: 0
    };
  }
}

// Create singleton instance
const actionAgent = new ActionAgent();

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = actionAgent;
}
