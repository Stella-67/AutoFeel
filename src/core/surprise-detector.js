// ==================== Surprise Detector ====================
// Calculate surprise scores for new cards based on semantic distance,
// contradiction detection, and novelty analysis

/**
 * SurpriseDetector - Calculates how "surprising" a new card is
 * compared to existing knowledge
 */
class SurpriseDetector {
  /**
   * Calculate the surprise score for a new card
   * @param {Object} newCard - The new card to evaluate
   * @param {Array} existingCards - Array of existing cards in the system
   * @returns {Promise<number>} Surprise score (0-1)
   *   - 0 = Not surprising (highly similar to existing knowledge)
   *   - 1 = Very surprising (novel or contradictory information)
   */
  async calculateSurprise(newCard, existingCards) {
    // Handle edge case: no existing cards
    if (!existingCards || existingCards.length === 0) {
      return 0.5; // Medium surprise for first card
    }

    // 1. Semantic distance (vector-based similarity)
    const semanticDistance = this.calculateSemanticDistance(newCard, existingCards);

    // 2. Contradiction detection (LLM-based)
    const contradictionScore = await this.detectContradictions(newCard, existingCards);

    // 3. Novelty (keyword-based)
    const noveltyScore = this.calculateNovelty(newCard, existingCards);

    // Weighted combination
    // Semantic distance is most important, followed by contradictions and novelty
    const surprise =
      0.4 * semanticDistance +
      0.4 * contradictionScore +
      0.2 * noveltyScore;

    // Ensure result is in [0, 1]
    const finalSurprise = Math.max(0, Math.min(1.0, surprise));

    console.log(
      `[SurpriseDetector] Calculated surprise: ${finalSurprise.toFixed(2)} ` +
      `(semantic: ${semanticDistance.toFixed(2)}, ` +
      `contradiction: ${contradictionScore.toFixed(2)}, ` +
      `novelty: ${noveltyScore.toFixed(2)})`
    );

    return finalSurprise;
  }

  /**
   * Calculate semantic distance using vector embeddings
   * @param {Object} newCard - Card with embedding
   * @param {Array} existingCards - Cards with embeddings
   * @returns {number} Distance score (0-1)
   *   - 0 = Very similar to existing cards
   *   - 1 = Very different from all existing cards
   */
  calculateSemanticDistance(newCard, existingCards) {
    // If new card has no embedding, use medium surprise
    if (!newCard.embedding || !Array.isArray(newCard.embedding)) {
      return 0.5;
    }

    // Find the most similar card
    let maxSimilarity = 0;
    let cardsWithEmbeddings = 0;

    for (const card of existingCards) {
      if (!card.embedding || !Array.isArray(card.embedding)) {
        continue;
      }

      cardsWithEmbeddings++;
      const similarity = this.cosineSimilarity(newCard.embedding, card.embedding);

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }
    }

    // If no existing cards have embeddings, medium surprise
    if (cardsWithEmbeddings === 0) {
      return 0.5;
    }

    // Distance = 1 - max_similarity
    // High similarity → low distance → low surprise
    return 1 - maxSimilarity;
  }

  /**
   * Calculate cosine similarity between two vectors
   * (Standalone implementation, independent of MemoryDB)
   * @param {Array} vecA - First vector
   * @param {Array} vecB - Second vector
   * @returns {number} Similarity score (0-1)
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }

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

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Detect contradictions with existing cards
   * TODO: Implement LLM-based contradiction detection
   * @param {Object} newCard - New card
   * @param {Array} existingCards - Existing cards
   * @returns {Promise<number>} Contradiction score (0-1)
   *   - 0 = No contradictions
   *   - 1 = Strong contradictions detected
   */
  async detectContradictions(newCard, existingCards) {
    // For now, check if any existing cards explicitly contradict this one
    // (based on relationship metadata)

    // Simple heuristic: if card has high semantic similarity but different sentiment/meaning,
    // it might be contradictory. This is a simplified version.

    // TODO: Implement LLM-based detection:
    // - Take top 3-5 most similar cards
    // - Use LLM to check if newCard contradicts any of them
    // - Return proportion of contradictions found

    // For now, return 0 (no contradiction detection)
    return 0;
  }

  /**
   * Calculate novelty based on keyword overlap
   * @param {Object} newCard - New card
   * @param {Array} existingCards - Existing cards
   * @returns {number} Novelty score (0-1)
   *   - 0 = All keywords already exist
   *   - 1 = All keywords are new
   */
  calculateNovelty(newCard, existingCards) {
    const newKeywords = this.extractKeywords(newCard.text);

    // If no keywords extracted, use medium novelty
    if (newKeywords.length === 0) {
      return 0.5;
    }

    // Build set of all existing keywords
    const existingKeywords = new Set();

    for (const card of existingCards) {
      const keywords = this.extractKeywords(card.text);
      keywords.forEach(kw => existingKeywords.add(kw));
    }

    // Count how many new keywords are novel
    const novelKeywords = newKeywords.filter(kw => !existingKeywords.has(kw));

    // Novelty = proportion of novel keywords
    return novelKeywords.length / newKeywords.length;
  }

  /**
   * Extract keywords from text
   * Simple implementation: lowercase words longer than 3 characters
   * @param {string} text - Input text
   * @returns {Array<string>} Array of keywords
   */
  extractKeywords(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    // Simple tokenization: split by whitespace and punctuation
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .split(/\s+/)
      .filter(word => word.length > 3); // Only keep words > 3 chars

    // Remove duplicates
    return [...new Set(words)];
  }
}

// Ensure it's available globally in Service Worker context
if (typeof self !== 'undefined') {
  self.SurpriseDetector = SurpriseDetector;
}

// Export for use in other modules (for non-browser environments)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SurpriseDetector;
}
