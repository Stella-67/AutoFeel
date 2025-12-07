// ==================== Decision Agent ====================
// LLM-powered intelligent agent that decides how to handle document saves

class DecisionAgent {
  constructor(memoryDB) {
    this.memoryDB = memoryDB;
  }

  /**
   * Analyze and decide what to do with a new document using LLM
   * @param {object} newDoc - New document schema
   * @param {array} newChunks - New chunk schemas
   * @param {object} llmConfig - LLM configuration {llmProvider, apiKey, apiEndpoint, modelName}
   * @returns {Promise<object>} - Decision with action and reason
   */
  async decide(newDoc, newChunks, llmConfig) {
    console.log('[Decision Agent] 🤖 LLM-powered analysis started...');
    console.log(`[Decision Agent] URL: ${newDoc.url}`);
    console.log(`[Decision Agent] Title: ${newDoc.title}`);

    // Check if document exists (uses normalized URL matching)
    const existingDoc = await this.memoryDB.findDocumentByUrl(newDoc.url);

    if (!existingDoc) {
      // New document - save it (no need to ask LLM)
      console.log('[Decision Agent] ✅ New document detected');
      return {
        action: 'create',
        reason: 'New document - no existing version found',
        strategy: 'save_new',
        existingDoc: null
      };
    }

    console.log('[Decision Agent] 📄 Found existing document, consulting LLM...');
    console.log(`[Decision Agent] Existing ID: ${existingDoc.doc_id}`);
    console.log(`[Decision Agent] Existing captured: ${existingDoc.captured_at}`);

    // Use LLM to make intelligent decision
    const decision = await this.askLLMForDecision(existingDoc, newDoc, newChunks, llmConfig);

    console.log(`[Decision Agent] 🎯 LLM Decision: ${decision.strategy}`);
    console.log(`[Decision Agent] 💡 Reason: ${decision.reason}`);

    return {
      action: 'update',
      reason: decision.reason,
      strategy: decision.strategy,
      existingDoc: existingDoc,
      llmAnalysis: decision.analysis
    };
  }

  /**
   * Ask LLM to analyze documents and make decision
   * @private
   */
  async askLLMForDecision(existingDoc, newDoc, newChunks, llmConfig) {
    const { llmProvider, apiKey, apiEndpoint, modelName } = llmConfig;

    // Prepare document summaries for LLM
    const existingSummary = this.summarizeDocument(existingDoc);
    const newSummary = this.summarizeDocument(newDoc, newChunks);

    // Log the analysis request
    await this.logDecision({
      type: 'decision',
      stage: 'analyzing',
      title: 'Analyzing document update',
      content: `Comparing existing "${existingSummary.title}" with new version`,
      metadata: {
        existingWordCount: existingSummary.wordCount,
        newWordCount: newSummary.wordCount,
        existingChunks: existingSummary.chunkCount,
        newChunks: newSummary.chunkCount
      }
    });

    // Build prompt for LLM
    const systemPrompt = `You are an intelligent knowledge base manager. Your job is to decide how to handle updates to stored documents.

You have three strategies:
1. "smart_update" - Merge new information with existing content (use when content is similar but has new additions)
2. "replace" - Completely replace old content with new (use when content has changed significantly)
3. "skip" - Keep existing content unchanged (use when new content is identical or worse quality)

Analyze the existing and new documents, then return a JSON decision:
{
  "strategy": "smart_update" | "replace" | "skip",
  "reason": "Brief explanation of your decision",
  "analysis": "Detailed analysis of what changed"
}

IMPORTANT: Return ONLY valid JSON, no other text.`;

    const userPrompt = `=== EXISTING DOCUMENT ===
Title: ${existingSummary.title}
Captured: ${existingSummary.capturedAt}
Word Count: ${existingSummary.wordCount}
Chunks: ${existingSummary.chunkCount}

Content Preview (first 800 chars):
${existingSummary.contentPreview}

=== NEW DOCUMENT ===
Title: ${newSummary.title}
Captured: ${newSummary.capturedAt}
Word Count: ${newSummary.wordCount}
Chunks: ${newSummary.chunkCount}

Content Preview (first 800 chars):
${newSummary.contentPreview}

=== YOUR TASK ===
Compare these two versions and decide:
- Has the content changed significantly?
- Does the new version contain additional information worth keeping?
- Is the new version higher quality or just a re-capture of the same content?

Make your decision and explain your reasoning.`;

    try {
      // Call LLM API
      const requestBody = buildLLMRequestBody(llmProvider, modelName, userPrompt, systemPrompt, {
        maxTokens: 500,
        temperature: 0.3 // Lower temperature for more consistent decisions
      });

      const headers = buildLLMHeaders(llmProvider, apiKey);

      console.log('[Decision Agent] 🌐 Calling LLM API...');
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Decision Agent] ❌ LLM API error:', errorText);
        // Fallback to rule-based decision
        return this.fallbackDecision(existingDoc, newDoc);
      }

      const data = await response.json();
      const content = extractLLMResponse(llmProvider, data);

      // Track token usage
      const tokenUsage = extractTokenUsage(llmProvider, data);
      if (tokenUsage) {
        await updateTokenUsage(llmProvider, tokenUsage);
        console.log(`[Decision Agent] 📊 Token usage: ${tokenUsage.totalTokens}`);
      }

      // Parse LLM response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[Decision Agent] ❌ Failed to parse LLM response');
        return this.fallbackDecision(existingDoc, newDoc);
      }

      const decision = JSON.parse(jsonMatch[0]);

      // Validate decision
      const validStrategies = ['smart_update', 'replace', 'skip'];
      if (!validStrategies.includes(decision.strategy)) {
        console.error('[Decision Agent] ❌ Invalid strategy from LLM:', decision.strategy);
        return this.fallbackDecision(existingDoc, newDoc);
      }

      // Log the successful decision
      await this.logDecision({
        type: 'decision',
        stage: 'decided',
        title: `Document strategy: ${decision.strategy}`,
        content: decision.reason,
        metadata: {
          strategy: decision.strategy,
          analysis: decision.analysis,
          tokenUsage: tokenUsage?.totalTokens || 0
        },
        details: decision.analysis
      });

      return decision;

    } catch (error) {
      console.error('[Decision Agent] ❌ Error calling LLM:', error);
      return this.fallbackDecision(existingDoc, newDoc);
    }
  }

  /**
   * Fallback to rule-based decision if LLM fails
   * @private
   */
  fallbackDecision(existingDoc, newDoc) {
    console.log('[Decision Agent] ⚠️ Using fallback rule-based decision');

    const similarity = this.memoryDB.calculateTextSimilarity(
      existingDoc.clean_text || '',
      newDoc.clean_text || ''
    );

    const SMART_UPDATE_THRESHOLD = 0.85;

    if (similarity > SMART_UPDATE_THRESHOLD) {
      return {
        strategy: 'smart_update',
        reason: `Content similarity: ${(similarity * 100).toFixed(1)}% (fallback decision)`,
        analysis: 'LLM unavailable, using rule-based similarity threshold'
      };
    } else {
      return {
        strategy: 'replace',
        reason: `Major changes detected: ${(similarity * 100).toFixed(1)}% similarity (fallback decision)`,
        analysis: 'LLM unavailable, using rule-based similarity threshold'
      };
    }
  }

  /**
   * Summarize document for LLM analysis
   * @private
   */
  summarizeDocument(doc, chunks = null) {
    return {
      title: doc.title || 'Untitled',
      capturedAt: new Date(doc.captured_at || doc.created_at).toLocaleString(),
      wordCount: doc.metadata?.word_count || 0,
      chunkCount: chunks ? chunks.length : (doc.metadata?.chunk_count || 0),
      contentPreview: (doc.clean_text || '').substring(0, 800)
    };
  }

  /**
   * Execute the decided action
   * @param {object} decision - Decision from decide()
   * @param {object} newDoc - New document schema
   * @param {array} newChunks - New chunk schemas
   * @param {object} llmConfig - LLM configuration for chunk analysis
   * @returns {Promise<object>} - Execution result
   */
  async execute(decision, newDoc, newChunks, llmConfig) {
    console.log(`[Decision Agent] Executing: ${decision.action} (${decision.strategy})`);

    try {
      switch (decision.action) {
        case 'create':
          return await this.executeCreate(newDoc, newChunks, llmConfig);

        case 'update':
          if (decision.strategy === 'smart_update') {
            return await this.executeSmartUpdate(decision.existingDoc, newDoc, newChunks, llmConfig);
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
   * Execute create - save new document and analyze cross-document relationships
   */
  async executeCreate(newDoc, newChunks, llmConfig) {
    // Save document and chunks first
    await this.memoryDB.saveDocument(newDoc);
    await this.memoryDB.saveChunks(newChunks);

    console.log(`[Decision Agent] ✅ Created new document: ${newDoc.doc_id}`);

    // Analyze relationships with existing chunks (cross-document)
    let relationshipsBuilt = 0;
    if (llmConfig) {
      console.log('[Decision Agent] 🔗 Analyzing cross-document relationships...');

      try {
        // Get all existing chunks (excluding the ones we just added)
        const allDocuments = await this.memoryDB.getAllDocuments({ limit: 1000 });
        let allChunks = [];

        for (const doc of allDocuments) {
          const chunks = await this.memoryDB.getChunksByDocId(doc.doc_id);
          allChunks.push(...chunks);
        }

        // Analyze new chunks against existing ones
        const relationships = await this.analyzeChunkBatchForRelationships(
          newChunks,
          allChunks,
          llmConfig
        );

        if (relationships.length > 0) {
          // Build relationships
          await this.buildChunkRelationships(allChunks, relationships);

          // Save updated chunks (both new and existing)
          await this.memoryDB.saveChunks(allChunks);

          relationshipsBuilt = relationships.length;
          console.log(`[Decision Agent] 🕸️ Built ${relationshipsBuilt} cross-document relationships`);

          // Log relationship building
          await this.logDecision({
            type: 'relationship',
            stage: 'created',
            title: 'Cross-document relationships established',
            content: `New document connected to existing knowledge: ${relationshipsBuilt} relationships`,
            metadata: {
              docId: newDoc.doc_id,
              newChunks: newChunks.length,
              relationshipsBuilt
            }
          });
        }
      } catch (error) {
        console.error('[Decision Agent] ⚠️ Failed to analyze cross-document relationships:', error);
        // Don't fail the entire operation, just log the error
      }
    }

    return {
      success: true,
      action: 'created',
      reason: 'New document saved',
      docId: newDoc.doc_id,
      chunkCount: newChunks.length,
      relationshipsBuilt
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
   * Execute smart update - LLM-powered chunk-level analysis and merge
   * Analyzes chunks intelligently, builds relationships, and updates knowledge graph
   */
  async executeSmartUpdate(existingDoc, newDoc, newChunks, llmConfig) {
    console.log('[Decision Agent] 🧠 Starting intelligent chunk analysis...');

    // Get existing chunks
    const existingChunks = await this.memoryDB.getChunksByDocId(existingDoc.doc_id);

    // Use LLM to analyze chunk relationships and decide what to keep
    const chunkAnalysis = await this.analyzeChunksWithLLM(
      existingChunks,
      newChunks,
      llmConfig
    );

    console.log('[Decision Agent] 📊 Chunk Analysis Results:');
    console.log(`  - Chunks to keep: ${chunkAnalysis.keepChunks.length}`);
    console.log(`  - Chunks to add: ${chunkAnalysis.addChunks.length}`);
    console.log(`  - Chunks to update: ${chunkAnalysis.updateChunks.length}`);
    console.log(`  - Relationships found: ${chunkAnalysis.relationships.length}`);

    // Log chunk analysis results
    await this.logDecision({
      type: 'chunk',
      stage: 'analyzed',
      title: 'Chunk-level analysis complete',
      content: `Keep: ${chunkAnalysis.keepChunks.length}, Add: ${chunkAnalysis.addChunks.length}, Update: ${chunkAnalysis.updateChunks.length}`,
      metadata: {
        keepCount: chunkAnalysis.keepChunks.length,
        addCount: chunkAnalysis.addChunks.length,
        updateCount: chunkAnalysis.updateChunks.length,
        relationshipCount: chunkAnalysis.relationships.length,
        totalExisting: existingChunks.length,
        totalNew: newChunks.length
      }
    });

    // Apply chunk decisions
    const updatedChunks = [];

    // Keep existing chunks that should be retained
    for (const chunkId of chunkAnalysis.keepChunks) {
      const chunk = existingChunks.find(c => c.chunk_id === chunkId);
      if (chunk) {
        updatedChunks.push(chunk);
      }
    }

    // Add new chunks
    updatedChunks.push(...chunkAnalysis.addChunks);

    // Update chunks that need modification
    for (const update of chunkAnalysis.updateChunks) {
      const chunk = existingChunks.find(c => c.chunk_id === update.chunk_id);
      if (chunk) {
        const updatedChunk = {
          ...chunk,
          ...update.changes,
          metadata: {
            ...chunk.metadata,
            update_count: (chunk.metadata.update_count || 0) + 1,
            last_verified: new Date().toISOString()
          }
        };
        updatedChunks.push(updatedChunk);
      }
    }

    // Build knowledge graph: establish relationships between chunks
    await this.buildChunkRelationships(updatedChunks, chunkAnalysis.relationships);

    // Update document metadata
    const updatedDoc = {
      ...newDoc,
      doc_id: existingDoc.doc_id,
      metadata: {
        ...newDoc.metadata,
        chunk_count: updatedChunks.length
      }
    };

    await this.memoryDB.saveDocument(updatedDoc);
    await this.memoryDB.saveChunks(updatedChunks);

    console.log(`[Decision Agent] ✅ Smart update complete: ${updatedChunks.length} total chunks`);
    return {
      success: true,
      action: 'updated',
      reason: `Intelligent chunk merge: +${chunkAnalysis.addChunks.length} new, ${chunkAnalysis.updateChunks.length} updated`,
      docId: existingDoc.doc_id,
      addedChunks: chunkAnalysis.addChunks.length,
      totalChunks: updatedChunks.length,
      relationshipsBuilt: chunkAnalysis.relationships.length
    };
  }

  /**
   * Use LLM to analyze chunks and their relationships
   * @private
   */
  async analyzeChunksWithLLM(existingChunks, newChunks, llmConfig) {
    const { llmProvider, apiKey, apiEndpoint, modelName } = llmConfig;

    // Prepare chunk summaries for LLM (limit to avoid token overflow)
    const existingSummaries = existingChunks.slice(0, 20).map((c, i) =>
      `E${i}: ${c.text.substring(0, 150)}...`
    ).join('\n');

    const newSummaries = newChunks.slice(0, 20).map((c, i) =>
      `N${i}: ${c.text.substring(0, 150)}...`
    ).join('\n');

    const systemPrompt = `You are an intelligent knowledge graph manager. Your job is to analyze chunks of information and decide:
1. Which existing chunks should be kept
2. Which new chunks should be added
3. Which chunks should be updated (merged or enhanced)
4. What relationships exist between chunks

Chunk relationships types:
- related: semantically related topics
- elaborates: one chunk provides more detail on another
- contradicts: chunks have conflicting information
- supports: one chunk provides evidence for another
- prerequisite: one chunk is needed to understand another

Return a JSON decision:
{
  "keepChunks": ["E0", "E1", ...],  // IDs of existing chunks to keep
  "addChunks": ["N0", "N2", ...],   // IDs of new chunks to add
  "updateChunks": [                 // Chunks that need updates
    {"id": "E0", "mergeWith": "N1", "reason": "..."}
  ],
  "relationships": [                // Chunk relationships
    {"from": "E0", "to": "N2", "type": "related", "strength": 0.8},
    {"from": "N1", "to": "E3", "type": "elaborates", "strength": 0.9}
  ],
  "chunkTypes": [                   // Classify new chunks
    {"id": "N0", "type": "concept"},
    {"id": "N1", "type": "fact"}
  ]
}

IMPORTANT: Return ONLY valid JSON.`;

    const userPrompt = `=== EXISTING CHUNKS ===
${existingSummaries}

=== NEW CHUNKS ===
${newSummaries}

Analyze these chunks and decide how to update the knowledge base.`;

    try {
      const requestBody = buildLLMRequestBody(llmProvider, modelName, userPrompt, systemPrompt, {
        maxTokens: 1500,
        temperature: 0.2
      });

      const headers = buildLLMHeaders(llmProvider, apiKey);

      console.log('[Decision Agent] 🌐 Calling LLM for chunk analysis...');
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        console.error('[Decision Agent] ❌ LLM API error');
        return this.fallbackChunkAnalysis(existingChunks, newChunks);
      }

      const data = await response.json();
      const content = extractLLMResponse(llmProvider, data);

      const tokenUsage = extractTokenUsage(llmProvider, data);
      if (tokenUsage) {
        await updateTokenUsage(llmProvider, tokenUsage);
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.fallbackChunkAnalysis(existingChunks, newChunks);
      }

      const analysis = JSON.parse(jsonMatch[0]);

      // Convert LLM's symbolic IDs back to actual chunks
      return this.processLLMChunkAnalysis(analysis, existingChunks, newChunks);

    } catch (error) {
      console.error('[Decision Agent] ❌ Error in chunk analysis:', error);
      return this.fallbackChunkAnalysis(existingChunks, newChunks);
    }
  }

  /**
   * Process LLM's chunk analysis and convert to actionable format
   * @private
   */
  processLLMChunkAnalysis(analysis, existingChunks, newChunks) {
    // Convert symbolic IDs (E0, N1) to actual chunk IDs
    const keepChunks = (analysis.keepChunks || []).map(id => {
      const index = parseInt(id.substring(1));
      return existingChunks[index]?.chunk_id;
    }).filter(id => id);

    const addChunks = (analysis.addChunks || []).map(id => {
      const index = parseInt(id.substring(1));
      const chunk = newChunks[index];
      if (chunk) {
        // Apply chunk type classification from LLM
        const typeInfo = (analysis.chunkTypes || []).find(ct => ct.id === id);
        if (typeInfo) {
          chunk.chunk_type = typeInfo.type;
        }
      }
      return chunk;
    }).filter(c => c);

    const updateChunks = (analysis.updateChunks || []).map(update => {
      const existingIndex = parseInt(update.id.substring(1));
      const newIndex = update.mergeWith ? parseInt(update.mergeWith.substring(1)) : null;

      return {
        chunk_id: existingChunks[existingIndex]?.chunk_id,
        changes: {
          text: newIndex !== null ? newChunks[newIndex]?.text : null,
          metadata: {
            merge_reason: update.reason
          }
        }
      };
    }).filter(u => u.chunk_id);

    // Process relationships
    const relationships = (analysis.relationships || []).map(rel => {
      const fromChunk = rel.from.startsWith('E')
        ? existingChunks[parseInt(rel.from.substring(1))]
        : newChunks[parseInt(rel.from.substring(1))];

      const toChunk = rel.to.startsWith('E')
        ? existingChunks[parseInt(rel.to.substring(1))]
        : newChunks[parseInt(rel.to.substring(1))];

      return {
        from: fromChunk?.chunk_id,
        to: toChunk?.chunk_id,
        type: rel.type,
        strength: rel.strength || 0.5
      };
    }).filter(r => r.from && r.to);

    return {
      keepChunks,
      addChunks,
      updateChunks,
      relationships
    };
  }

  /**
   * Fallback chunk analysis using simple similarity
   * @private
   */
  fallbackChunkAnalysis(existingChunks, newChunks) {
    console.log('[Decision Agent] ⚠️ Using fallback chunk analysis');

    const CHUNK_SIMILARITY_THRESHOLD = 0.85;
    const keepChunks = existingChunks.map(c => c.chunk_id);
    const addChunks = [];

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
        addChunks.push(newChunk);
      }
    }

    return {
      keepChunks,
      addChunks,
      updateChunks: [],
      relationships: []
    };
  }

  /**
   * Build knowledge graph relationships between chunks
   * @private
   */
  async buildChunkRelationships(chunks, relationships) {
    console.log('[Decision Agent] 🕸️ Building knowledge graph relationships...');

    // Update each chunk's relationship fields
    for (const rel of relationships) {
      const fromChunk = chunks.find(c => c.chunk_id === rel.from);
      const toChunk = chunks.find(c => c.chunk_id === rel.to);

      if (!fromChunk || !toChunk) continue;

      // Initialize relationships if not exists
      if (!fromChunk.relationships) {
        fromChunk.relationships = {
          related_chunks: [],
          parent_chunks: [],
          child_chunks: [],
          contradicts: [],
          supports: [],
          prerequisite_of: [],
          requires: []
        };
      }

      // Add relationship based on type
      switch (rel.type) {
        case 'related':
          if (!fromChunk.relationships.related_chunks.includes(rel.to)) {
            fromChunk.relationships.related_chunks.push(rel.to);
          }
          break;
        case 'elaborates':
          if (!fromChunk.relationships.child_chunks.includes(rel.to)) {
            fromChunk.relationships.child_chunks.push(rel.to);
          }
          if (!toChunk.relationships.parent_chunks.includes(rel.from)) {
            toChunk.relationships.parent_chunks.push(rel.from);
          }
          break;
        case 'contradicts':
          if (!fromChunk.relationships.contradicts.includes(rel.to)) {
            fromChunk.relationships.contradicts.push(rel.to);
          }
          break;
        case 'supports':
          if (!fromChunk.relationships.supports.includes(rel.to)) {
            fromChunk.relationships.supports.push(rel.to);
          }
          break;
        case 'prerequisite':
          if (!fromChunk.relationships.prerequisite_of.includes(rel.to)) {
            fromChunk.relationships.prerequisite_of.push(rel.to);
          }
          if (!toChunk.relationships.requires.includes(rel.from)) {
            toChunk.relationships.requires.push(rel.from);
          }
          break;
      }
    }

    console.log(`[Decision Agent] ✅ Built ${relationships.length} relationships`);

    // Log relationship building
    if (relationships.length > 0) {
      const relationshipTypes = relationships.reduce((acc, rel) => {
        acc[rel.type] = (acc[rel.type] || 0) + 1;
        return acc;
      }, {});

      await this.logDecision({
        type: 'relationship',
        stage: 'built',
        title: `Built ${relationships.length} knowledge graph relationships`,
        content: Object.entries(relationshipTypes).map(([type, count]) =>
          `${count} ${type} relationship(s)`
        ).join(', '),
        metadata: {
          total: relationships.length,
          byType: relationshipTypes
        }
      });
    }
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

  /**
   * Re-analyze ALL chunks in the database to build cross-document relationships
   * This is useful for fixing existing data or rebuilding the knowledge graph
   * @param {object} llmConfig - LLM configuration
   * @param {function} progressCallback - Optional callback for progress updates
   * @returns {Promise<object>} - Analysis results
   */
  async reanalyzeAllChunks(llmConfig, progressCallback = null) {
    console.log('[Decision Agent] 🔄 Starting full knowledge graph re-analysis...');

    try {
      // Get all documents and chunks
      const allDocuments = await this.memoryDB.getAllDocuments({ limit: 1000 });
      let allChunks = [];

      for (const doc of allDocuments) {
        const chunks = await this.memoryDB.getChunksByDocId(doc.doc_id);
        allChunks.push(...chunks);
      }

      console.log(`[Decision Agent] 📊 Analyzing ${allChunks.length} chunks from ${allDocuments.length} documents...`);

      if (allChunks.length === 0) {
        return {
          success: true,
          message: 'No chunks to analyze',
          relationshipsBuilt: 0
        };
      }

      // ✅ Clear all existing relationships before re-analysis
      console.log('[Decision Agent] 🧹 Clearing existing relationships...');
      for (const chunk of allChunks) {
        chunk.relationships = {
          related_chunks: [],
          parent_chunks: [],
          child_chunks: [],
          contradicts: [],
          supports: [],
          prerequisite_of: [],
          requires: []
        };
      }

      // Analyze in batches to avoid token limits
      const BATCH_SIZE = 30;
      let totalRelationships = 0;

      for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
        const batch = allChunks.slice(i, Math.min(i + BATCH_SIZE, allChunks.length));

        if (progressCallback) {
          progressCallback({
            current: i,
            total: allChunks.length,
            message: `Analyzing chunks ${i + 1}-${Math.min(i + BATCH_SIZE, allChunks.length)}...`
          });
        }

        // Analyze this batch against all other chunks
        const relationships = await this.analyzeChunkBatchForRelationships(
          batch,
          allChunks,
          llmConfig
        );

        // Build relationships
        await this.buildChunkRelationships(allChunks, relationships);
        totalRelationships += relationships.length;

        console.log(`[Decision Agent] 🕸️ Batch ${Math.floor(i / BATCH_SIZE) + 1}: Found ${relationships.length} relationships`);
      }

      // Save all updated chunks
      await this.memoryDB.saveChunks(allChunks);

      console.log(`[Decision Agent] ✅ Re-analysis complete: ${totalRelationships} relationships built`);

      // Log the re-analysis
      await this.logDecision({
        type: 'system',
        stage: 'reanalysis',
        title: 'Full knowledge graph re-analysis',
        content: `Analyzed ${allChunks.length} chunks across ${allDocuments.length} documents`,
        metadata: {
          totalChunks: allChunks.length,
          totalDocuments: allDocuments.length,
          relationshipsBuilt: totalRelationships
        }
      });

      return {
        success: true,
        message: `Successfully analyzed ${allChunks.length} chunks`,
        chunksAnalyzed: allChunks.length,
        documentsProcessed: allDocuments.length,
        relationshipsBuilt: totalRelationships
      };

    } catch (error) {
      console.error('[Decision Agent] ❌ Re-analysis failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Analyze a batch of chunks against all chunks to find relationships
   * Uses similarity pre-filtering to reduce LLM token usage
   * @private
   */
  async analyzeChunkBatchForRelationships(batchChunks, allChunks, llmConfig) {
    const { llmProvider, apiKey, apiEndpoint, modelName } = llmConfig;

    // For each batch chunk, find top 5 most similar chunks using algorithm
    const SIMILARITY_THRESHOLD = 0.15; // Minimum similarity to consider (lowered from 0.3)
    const TOP_N_SIMILAR = 8; // Number of similar chunks to send to LLM (increased from 5)

    const candidateChunks = new Map(); // chunk_id -> chunk

    for (const batchChunk of batchChunks) {
      const similarities = [];

      // Calculate similarity with all other chunks (INCLUDING those in the same batch!)
      for (const otherChunk of allChunks) {
        // Skip self only
        if (batchChunk.chunk_id === otherChunk.chunk_id) continue;

        // ✅ REMOVED: Don't skip chunks in the same batch anymore!
        // This allows chunks from the same document to build relationships

        const similarity = this.memoryDB.calculateTextSimilarity(
          batchChunk.text || '',
          otherChunk.text || ''
        );

        if (similarity > SIMILARITY_THRESHOLD) {
          similarities.push({ chunk: otherChunk, similarity });
        }
      }

      // Sort by similarity and take top N
      similarities.sort((a, b) => b.similarity - a.similarity);
      const topSimilar = similarities.slice(0, TOP_N_SIMILAR);

      // Add to candidate chunks (but exclude chunks already in batch to avoid duplicates!)
      for (const { chunk } of topSimilar) {
        // Don't add if this chunk is already in the current batch
        if (!batchChunks.find(b => b.chunk_id === chunk.chunk_id)) {
          candidateChunks.set(chunk.chunk_id, chunk);
        }
      }
    }

    // Convert to array for LLM analysis
    const otherChunks = Array.from(candidateChunks.values());

    console.log(`[Decision Agent] 📊 Pre-filtered: ${otherChunks.length} candidate chunks from ${allChunks.length} total`);
    console.log(`[Decision Agent] 📊 Batch size: ${batchChunks.length}, Candidates: ${otherChunks.length}`);

    // If no candidates found, return empty relationships
    if (otherChunks.length === 0) {
      console.warn('[Decision Agent] ⚠️ No candidate chunks found after similarity filtering. Try lowering SIMILARITY_THRESHOLD.');
      return [];
    }

    // Prepare summaries for LLM
    const batchSummaries = batchChunks.map((c, i) =>
      `B${i}: [${c.chunk_type || 'unknown'}] ${c.text.substring(0, 120)}...`
    ).join('\n');

    const otherSummaries = otherChunks.map((c, i) =>
      `O${i}: [${c.chunk_type || 'unknown'}] ${c.text.substring(0, 120)}...`
    ).join('\n');

    const systemPrompt = `You are a knowledge graph relationship analyzer. Find semantic relationships between chunks.

Relationship types:
- related: semantically related topics
- elaborates: one chunk provides more detail on another
- contradicts: chunks have conflicting information
- supports: one chunk provides evidence for another
- prerequisite: understanding one chunk requires another

Return JSON:
{
  "relationships": [
    {"from": "B0", "to": "O5", "type": "related", "strength": 0.8, "reason": "..."},
    {"from": "B1", "to": "B2", "type": "elaborates", "strength": 0.9, "reason": "..."}
  ],
  "chunkTypes": [
    {"id": "B0", "type": "concept"},
    {"id": "B1", "type": "fact"}
  ]
}

IMPORTANT: Return ONLY valid JSON.`;

    const userPrompt = `=== CHUNKS TO ANALYZE ===
${batchSummaries}

=== OTHER CHUNKS IN KNOWLEDGE BASE ===
${otherSummaries}

Find meaningful relationships between these chunks.`;

    try {
      const requestBody = buildLLMRequestBody(llmProvider, modelName, userPrompt, systemPrompt, {
        maxTokens: 2000,
        temperature: 0.2
      });

      const headers = buildLLMHeaders(llmProvider, apiKey);

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        console.error('[Decision Agent] ❌ LLM API error in batch analysis');
        return [];
      }

      const data = await response.json();
      const content = extractLLMResponse(llmProvider, data);

      const tokenUsage = extractTokenUsage(llmProvider, data);
      if (tokenUsage) {
        await updateTokenUsage(llmProvider, tokenUsage);
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[Decision Agent] ❌ No JSON found in LLM response');
        console.log('[Decision Agent] LLM response:', content);
        return [];
      }

      console.log('[Decision Agent] 📝 LLM response JSON:', jsonMatch[0].substring(0, 500) + '...');
      const analysis = JSON.parse(jsonMatch[0]);
      console.log('[Decision Agent] 📊 LLM found relationships:', analysis.relationships?.length || 0);

      // Convert symbolic IDs to actual chunk IDs
      const relationships = (analysis.relationships || []).map(rel => {
        let fromChunk, toChunk;

        if (rel.from.startsWith('B')) {
          fromChunk = batchChunks[parseInt(rel.from.substring(1))];
        } else if (rel.from.startsWith('O')) {
          fromChunk = otherChunks[parseInt(rel.from.substring(1))];
        }

        if (rel.to.startsWith('B')) {
          toChunk = batchChunks[parseInt(rel.to.substring(1))];
        } else if (rel.to.startsWith('O')) {
          toChunk = otherChunks[parseInt(rel.to.substring(1))];
        }

        return {
          from: fromChunk?.chunk_id,
          to: toChunk?.chunk_id,
          type: rel.type,
          strength: rel.strength || 0.5
        };
      }).filter(r => r.from && r.to && r.from !== r.to); // ✅ Exclude self-loops!

      // Apply chunk type classifications
      if (analysis.chunkTypes) {
        for (const typeInfo of analysis.chunkTypes) {
          if (typeInfo.id.startsWith('B')) {
            const chunk = batchChunks[parseInt(typeInfo.id.substring(1))];
            if (chunk && !chunk.chunk_type) {
              chunk.chunk_type = typeInfo.type;
            }
          }
        }
      }

      console.log(`[Decision Agent] ✅ Returning ${relationships.length} valid relationships`);
      return relationships;

    } catch (error) {
      console.error('[Decision Agent] ❌ Error in batch relationship analysis:', error);
      console.error('[Decision Agent] Error stack:', error.stack);
      return [];
    }
  }

  /**
   * Log LLM decision to storage for visualization
   * @private
   */
  async logDecision(logEntry) {
    try {
      // Get existing logs from storage
      const { llmDecisionLogs = [] } = await chrome.storage.local.get(['llmDecisionLogs']);

      // Add timestamp
      const entry = {
        ...logEntry,
        timestamp: new Date().toISOString(),
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      // Add to beginning of array (most recent first)
      llmDecisionLogs.unshift(entry);

      // Keep only last 100 entries to avoid storage overflow
      const trimmedLogs = llmDecisionLogs.slice(0, 100);

      // Save back to storage
      await chrome.storage.local.set({ llmDecisionLogs: trimmedLogs });

      console.log('[Decision Agent] 📝 Logged:', logEntry.title);
    } catch (error) {
      console.error('[Decision Agent] Failed to log decision:', error);
    }
  }
}
