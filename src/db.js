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
          documentsStore.createIndex('created_at', 'created_at', { unique: false });
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

      const request = store.put(documentSchema);

      request.onsuccess = () => {
        console.log('[AutoFeel DB] Document saved:', documentSchema.doc_id);
        resolve(documentSchema.doc_id);
      };

      request.onerror = () => {
        console.error('[AutoFeel DB] Failed to save document:', request.error);
        reject(request.error);
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

    const { limit = 50, offset = 0, sortBy = 'created_at', order = 'desc' } = options;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([DOCUMENTS_STORE], 'readonly');
      const store = transaction.objectStore(DOCUMENTS_STORE);
      const index = store.index(sortBy);

      const direction = order === 'desc' ? 'prev' : 'next';
      const request = index.openCursor(null, direction);

      const results = [];
      let skipped = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;

        if (cursor) {
          if (skipped < offset) {
            skipped++;
            cursor.continue();
          } else if (results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
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
