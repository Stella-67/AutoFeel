// db.js - IndexedDB Manager for Personal RAG Memory

const DB_NAME = 'AutoFeelMemory';
const DB_VERSION = 1;

// Object Stores
const DOCUMENTS_STORE = 'documents';
const CHUNKS_STORE = 'memory_chunks';

class MemoryDB {
  constructor() {
    this.db = null;
  }

  /**
   * Initialize database connection
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[AutoFeel DB] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[AutoFeel DB] Database opened successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('[AutoFeel DB] Upgrading database schema...');

        // Create documents table
        if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
          const documentsStore = db.createObjectStore(DOCUMENTS_STORE, {
            keyPath: 'doc_id'
          });

          // Indexes for searching
          documentsStore.createIndex('title', 'title', { unique: false });
          documentsStore.createIndex('url', 'url', { unique: false });
          documentsStore.createIndex('captured_at', 'captured_at', { unique: false });
          documentsStore.createIndex('source_type', 'source_type', { unique: false });

          console.log('[AutoFeel DB] Created documents store');
        }

        // Create memory_chunks table (vector store)
        if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
          const chunksStore = db.createObjectStore(CHUNKS_STORE, {
            keyPath: 'chunk_id'
          });

          // Indexes for searching and retrieval
          chunksStore.createIndex('doc_id', 'doc_id', { unique: false });
          chunksStore.createIndex('order', 'order', { unique: false });
          chunksStore.createIndex('created_at', 'created_at', { unique: false });
          chunksStore.createIndex('importance', 'importance', { unique: false });
          chunksStore.createIndex('block_type', 'block_type', { unique: false });

          // Compound index for doc_id + order
          chunksStore.createIndex('doc_order', ['doc_id', 'order'], { unique: false });

          console.log('[AutoFeel DB] Created memory_chunks store');
        }
      };
    });
  }

  /**
   * Store a document
   */
  async saveDocument(documentSchema) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([DOCUMENTS_STORE], 'readwrite');
      const store = transaction.objectStore(DOCUMENTS_STORE);

      store.put(documentSchema);

      // Wait for transaction to complete (data is committed to disk)
      transaction.oncomplete = () => {
        console.log('[AutoFeel DB] Document saved:', documentSchema.doc_id);
        resolve(documentSchema.doc_id);
      };

      transaction.onerror = () => {
        console.error('[AutoFeel DB] Failed to save document:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Store multiple chunks
   */
  async saveChunks(chunkSchemas) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CHUNKS_STORE], 'readwrite');
      const store = transaction.objectStore(CHUNKS_STORE);

      let savedCount = 0;

      chunkSchemas.forEach((chunk) => {
        const request = store.put(chunk);
        request.onsuccess = () => savedCount++;
      });

      transaction.oncomplete = () => {
        console.log(`[AutoFeel DB] Saved ${savedCount} chunks`);
        resolve(savedCount);
      };

      transaction.onerror = () => {
        console.error('[AutoFeel DB] Failed to save chunks:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Get a document by ID
   */
  async getDocument(docId) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([DOCUMENTS_STORE], 'readonly');
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const request = store.get(docId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all documents (with optional limit and offset for pagination)
   */
  async getAllDocuments(options = {}) {
    if (!this.db) await this.init();

    const { limit = 50, offset = 0, sortBy = 'captured_at', order = 'desc' } = options;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([DOCUMENTS_STORE], 'readonly');
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        let results = request.result || [];

        // Sort results
        results.sort((a, b) => {
          const aVal = a[sortBy];
          const bVal = b[sortBy];
          if (order === 'desc') {
            return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
          } else {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
          }
        });

        // Apply pagination
        results = results.slice(offset, offset + limit);

        resolve(results);
      };

      request.onerror = () => {
        console.error('[AutoFeel DB] Failed to get documents:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get chunks for a specific document
   */
  async getChunksByDocId(docId) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CHUNKS_STORE], 'readonly');
      const store = transaction.objectStore(CHUNKS_STORE);
      const index = store.index('doc_order');

      // Use compound index to get chunks for this doc, sorted by order
      const range = IDBKeyRange.bound([docId, 0], [docId, Infinity]);
      const request = index.openCursor(range);

      const results = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Search documents by title or URL (fuzzy search)
   */
  async searchDocuments(query) {
    if (!this.db) await this.init();

    const allDocs = await this.getAllDocuments({ limit: 1000 });
    const lowerQuery = query.toLowerCase();

    return allDocs.filter(doc =>
      doc.title.toLowerCase().includes(lowerQuery) ||
      doc.url.toLowerCase().includes(lowerQuery) ||
      (doc.clean_text && doc.clean_text.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Keyword-based chunk search (fallback for providers without embedding)
   * Searches all chunks for keyword matches and ranks by relevance
   */
  async keywordSearch(query, topK = 3) {
    if (!this.db) await this.init();

    // Extract keywords from query (simple tokenization)
    const keywords = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2) // Filter short words
      .filter(word => !['the', 'is', 'at', 'which', 'on', 'are', 'what', 'who', 'when', 'where', 'how', 'your', 'my'].includes(word)); // Remove stop words

    if (keywords.length === 0) {
      return [];
    }

    console.log(`[AutoFeel DB] Keyword search for: [${keywords.join(', ')}]`);

    // Get all chunks from the correct object store
    const tx = this.db.transaction([CHUNKS_STORE], 'readonly');
    const store = tx.objectStore(CHUNKS_STORE);

    // Wrap getAll in Promise
    const allChunks = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    console.log(`[AutoFeel DB] Found ${allChunks.length} total chunks in database`);

    if (allChunks.length === 0) {
      console.log('[AutoFeel DB] No chunks in database yet');
      return [];
    }

    // Score each chunk based on keyword matches
    const scoredChunks = allChunks.map(chunk => {
      const chunkText = chunk.text.toLowerCase();
      let score = 0;

      keywords.forEach(keyword => {
        // Count occurrences of each keyword
        const regex = new RegExp(keyword, 'gi');
        const matches = chunkText.match(regex);
        if (matches) {
          score += matches.length * 10; // Base score per match
        }

        // Bonus for exact phrase match
        if (chunkText.includes(keywords.join(' '))) {
          score += 50;
        }
      });

      // Boost score by chunk importance
      score *= (chunk.importance || 0.5);

      return {
        ...chunk,
        score: score
      };
    });

    // Filter chunks with score > 0 and sort by score
    const relevantChunks = scoredChunks
      .filter(chunk => chunk.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // Add similarity score (normalized to 0-1 for consistency with semantic search)
    const maxScore = relevantChunks.length > 0 ? relevantChunks[0].score : 1;
    const results = relevantChunks.map(chunk => ({
      ...chunk,
      similarity: Math.min(chunk.score / maxScore, 1.0),
      source: {
        title: chunk.source?.title || 'Unknown',
        url: chunk.source?.url || ''
      },
      metadata: chunk.metadata || {}
    }));

    return results;
  }

  /**
   * Normalize URL for duplicate detection
   * Removes query params, hash, trailing slashes, and converts to lowercase
   * Special handling for Google Docs/Sheets/Slides to extract document ID
   */
  normalizeUrl(url) {
    if (!url) return '';
    try {
      const urlObj = new URL(url);

      // Special handling for Google Docs/Sheets/Slides
      // Extract document ID and use a canonical format
      // This ensures /edit, /preview, /edit?usp=sharing all match to the same doc
      if (urlObj.hostname.includes('docs.google.com')) {
        const match = urlObj.pathname.match(/\/(document|spreadsheets|presentation)\/d\/([^\/]+)/);
        if (match) {
          const docType = match[1];
          const docId = match[2];
          return `https://docs.google.com/${docType}/d/${docId}`;
        }
      }

      // For other URLs, keep protocol + hostname + pathname, remove query and hash
      let normalized = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
      // Remove trailing slash
      normalized = normalized.replace(/\/$/, '');
      return normalized.toLowerCase();
    } catch (error) {
      // If URL parsing fails, return original URL in lowercase
      return typeof url === 'string' ? url.toLowerCase() : '';
    }
  }

  /**
   * Find existing document by URL (using normalized URL matching)
   * @param {string} url - The URL to search for
   * @returns {Promise<object|null>} - Existing document or null
   */
  async findDocumentByUrl(url) {
    if (!this.db) await this.init();

    const normalizedUrl = this.normalizeUrl(url);
    const allDocs = await this.getAllDocuments({ limit: 10000 });

    // Find document with matching normalized URL
    return allDocs.find(doc => {
      const docNormalizedUrl = this.normalizeUrl(doc.url);
      return docNormalizedUrl === normalizedUrl;
    }) || null;
  }

  /**
   * Calculate text similarity between two documents using cosine similarity
   * This considers word frequency, not just word presence
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} - Similarity score (0-1)
   */
  calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    // Tokenize and count word frequencies
    const words1 = text1.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    // Build word frequency maps
    const freq1 = {};
    const freq2 = {};

    words1.forEach(word => {
      freq1[word] = (freq1[word] || 0) + 1;
    });

    words2.forEach(word => {
      freq2[word] = (freq2[word] || 0) + 1;
    });

    // Get all unique words
    const allWords = new Set([...Object.keys(freq1), ...Object.keys(freq2)]);

    // Calculate cosine similarity
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    allWords.forEach(word => {
      const f1 = freq1[word] || 0;
      const f2 = freq2[word] || 0;

      dotProduct += f1 * f2;
      magnitude1 += f1 * f1;
      magnitude2 += f2 * f2;
    });

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) return 0;

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Check if document should be updated (content has changed significantly)
   * @param {object} existingDoc - Existing document
   * @param {object} newDoc - New document
   * @returns {object} - { shouldUpdate: boolean, changes: object }
   */
  shouldUpdateDocument(existingDoc, newDoc) {
    const changes = {
      titleChanged: existingDoc.title !== newDoc.title,
      textChanged: false,
      wordCountChanged: false,
      chunkCountChanged: false
    };

    // Calculate text similarity
    const textSimilarity = this.calculateTextSimilarity(
      existingDoc.clean_text,
      newDoc.clean_text
    );

    changes.textChanged = textSimilarity < 0.9; // If less than 90% similar, consider changed
    changes.textSimilarity = textSimilarity;

    // Check metadata changes
    changes.wordCountChanged = Math.abs(
      existingDoc.metadata.word_count - newDoc.metadata.word_count
    ) > existingDoc.metadata.word_count * 0.1; // 10% change threshold

    changes.chunkCountChanged = existingDoc.metadata.chunk_count !== newDoc.metadata.chunk_count;

    // Decide if should update
    const shouldUpdate = changes.titleChanged ||
                        changes.textChanged ||
                        changes.wordCountChanged ||
                        changes.chunkCountChanged;

    return { shouldUpdate, changes, textSimilarity };
  }

  /**
   * Semantic search using vector similarity
   * @param {Array} queryEmbedding - The embedding vector of the search query
   * @param {Number} topK - Number of top results to return
   */
  async semanticSearch(queryEmbedding, topK = 10) {
    if (!this.db) await this.init();

    // Get all chunks with embeddings
    const transaction = this.db.transaction([CHUNKS_STORE], 'readonly');
    const store = transaction.objectStore(CHUNKS_STORE);

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        const allChunks = request.result;

        // Filter chunks that have embeddings
        const chunksWithEmbeddings = allChunks.filter(chunk =>
          chunk.embedding && Array.isArray(chunk.embedding)
        );

        // Calculate cosine similarity for each chunk
        const results = chunksWithEmbeddings.map(chunk => ({
          ...chunk,
          similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding)
        }));

        // Sort by similarity (descending) and take top K
        results.sort((a, b) => b.similarity - a.similarity);
        resolve(results.slice(0, topK));
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (normA * normB);
  }

  /**
   * Get memory statistics
   */
  async getStats() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([DOCUMENTS_STORE, CHUNKS_STORE], 'readonly');

      const docsStore = transaction.objectStore(DOCUMENTS_STORE);
      const chunksStore = transaction.objectStore(CHUNKS_STORE);

      const docsCountRequest = docsStore.count();
      const chunksCountRequest = chunksStore.count();

      let docsCount = 0;
      let chunksCount = 0;

      docsCountRequest.onsuccess = () => {
        docsCount = docsCountRequest.result;
      };

      chunksCountRequest.onsuccess = () => {
        chunksCount = chunksCountRequest.result;
      };

      transaction.oncomplete = () => {
        resolve({
          totalDocuments: docsCount,
          totalChunks: chunksCount
        });
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Delete a document and all its chunks
   */
  async deleteDocument(docId) {
    if (!this.db) await this.init();

    return new Promise(async (resolve, reject) => {
      try {
        // First, delete all chunks
        const chunks = await this.getChunksByDocId(docId);

        const transaction = this.db.transaction([DOCUMENTS_STORE, CHUNKS_STORE], 'readwrite');
        const docsStore = transaction.objectStore(DOCUMENTS_STORE);
        const chunksStore = transaction.objectStore(CHUNKS_STORE);

        // Delete document
        docsStore.delete(docId);

        // Delete all chunks
        chunks.forEach(chunk => {
          chunksStore.delete(chunk.chunk_id);
        });

        transaction.oncomplete = () => {
          console.log(`[AutoFeel DB] Deleted document ${docId} and ${chunks.length} chunks`);
          resolve({ deletedChunks: chunks.length });
        };

        transaction.onerror = () => reject(transaction.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Clear all data
   */
  async clearAll() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([DOCUMENTS_STORE, CHUNKS_STORE], 'readwrite');

      const docsStore = transaction.objectStore(DOCUMENTS_STORE);
      const chunksStore = transaction.objectStore(CHUNKS_STORE);

      docsStore.clear();
      chunksStore.clear();

      transaction.oncomplete = () => {
        console.log('[AutoFeel DB] All data cleared');
        resolve();
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Create singleton instance
const memoryDB = new MemoryDB();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = memoryDB;
}
