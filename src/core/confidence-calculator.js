// ==================== Confidence Calculator ====================
// Evaluate and calculate confidence scores for memory cards based on
// source reliability, consistency, completeness, and usage patterns

/**
 * ConfidenceCalculator - Assesses how confident we are in a card's information
 */
class ConfidenceCalculator {
  /**
   * Calculate the confidence score for a card
   * @param {Object} card - The card to evaluate
   * @param {Object} context - Additional context for evaluation
   *   - sourceReliability: 0-1, how reliable the source is
   *   - existingCards: Array of existing cards for consistency check
   * @returns {number} Confidence score (0-1)
   *   - 0 = Very low confidence (unreliable, contradictory)
   *   - 1 = Very high confidence (reliable, consistent, well-supported)
   */
  calculateConfidence(card, context = {}) {
    const factors = [];

    // 1. Source reliability
    if (context.sourceReliability !== undefined) {
      factors.push({
        name: 'source',
        value: context.sourceReliability,
        weight: 0.25
      });
    }

    // 2. Consistency with existing knowledge
    const existingCards = context.existingCards || [];
    const consistencyScore = this.calculateConsistency(card, existingCards);
    factors.push({
      name: 'consistency',
      value: consistencyScore,
      weight: 0.3
    });

    // 3. Information completeness
    const completeness = this.calculateCompleteness(card);
    factors.push({
      name: 'completeness',
      value: completeness,
      weight: 0.2
    });

    // 4. Supporting evidence
    if (card.relationships?.supports?.length > 0) {
      // More supporting relationships → higher confidence
      const evidenceScore = Math.min(1.0, card.relationships.supports.length / 3);
      factors.push({
        name: 'evidence',
        value: evidenceScore,
        weight: 0.15
      });
    }

    // 5. Usage frequency (activation count)
    if (card.activation_count !== undefined && card.activation_count > 0) {
      // More activations → higher confidence (validated by usage)
      const usageScore = Math.min(1.0, card.activation_count / 10);
      factors.push({
        name: 'usage',
        value: usageScore,
        weight: 0.1
      });
    }

    // Calculate weighted average
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    const weightedSum = factors.reduce((sum, f) => sum + f.value * f.weight, 0);

    const confidence = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

    console.log(
      `[ConfidenceCalculator] Calculated confidence: ${confidence.toFixed(2)} ` +
      `(factors: ${factors.map(f => `${f.name}=${f.value.toFixed(2)}`).join(', ')})`
    );

    return confidence;
  }

  /**
   * Calculate consistency with existing knowledge
   * @param {Object} card - Card to evaluate
   * @param {Array} existingCards - Array of existing cards
   * @returns {number} Consistency score (0-1)
   *   - 0 = Highly contradictory
   *   - 1 = Highly consistent
   */
  calculateConsistency(card, existingCards) {
    if (!existingCards || existingCards.length === 0) {
      return 0.5; // Neutral if no existing cards
    }

    // Check for contradictions
    const contradictions = existingCards.filter(c =>
      c.relationships?.contradicts?.some(id =>
        id === card.chunk_id || id.target_id === card.chunk_id
      )
    );

    // Strong contradictions → low consistency
    if (contradictions.length > 0) {
      const penalty = Math.min(0.7, contradictions.length * 0.2);
      console.log(
        `[ConfidenceCalculator] Found ${contradictions.length} contradictions, ` +
        `penalty: ${penalty.toFixed(2)}`
      );
      return Math.max(0, 0.3 - penalty);
    }

    // Check for support
    const supports = existingCards.filter(c =>
      c.relationships?.supports?.some(id =>
        id === card.chunk_id || id.target_id === card.chunk_id
      )
    );

    // More support → higher consistency
    if (supports.length > 0) {
      const bonus = Math.min(0.5, supports.length * 0.1);
      console.log(
        `[ConfidenceCalculator] Found ${supports.length} supporting cards, ` +
        `bonus: ${bonus.toFixed(2)}`
      );
      return Math.min(1.0, 0.5 + bonus);
    }

    // No contradictions, no support → neutral
    return 0.5;
  }

  /**
   * Calculate information completeness
   * @param {Object} card - Card to evaluate
   * @returns {number} Completeness score (0-1)
   */
  calculateCompleteness(card) {
    let score = 0.3; // Base score

    // Has substantial text content
    if (card.text && card.text.length > 50) {
      score += 0.2;
    }
    if (card.text && card.text.length > 200) {
      score += 0.1;
    }

    // Has embedding (semantic representation)
    if (card.embedding && Array.isArray(card.embedding) && card.embedding.length > 0) {
      score += 0.15;
    }

    // Has extracted entities
    if (card.metadata?.key_entities && card.metadata.key_entities.length > 0) {
      score += 0.1;
    }

    // Has classified chunk type
    if (card.chunk_type && card.chunk_type !== 'unknown') {
      score += 0.05;
    }

    // Has topic information
    if (card.metadata?.topic) {
      score += 0.05;
    }

    // Has source information
    if (card.source?.url) {
      score += 0.05;
    }

    return Math.min(1.0, score);
  }

  /**
   * Update confidence for a card after new evidence
   * @param {Object} card - Card to update
   * @param {Object} evidence - New evidence affecting confidence
   *   - type: 'support' | 'contradict' | 'activation'
   *   - strength: 0-1
   * @returns {number} Updated confidence score
   */
  updateConfidence(card, evidence) {
    const currentConfidence = card.confidence || 0.5;

    if (evidence.type === 'support') {
      // Increase confidence when supported
      const boost = evidence.strength * 0.1;
      const newConfidence = Math.min(1.0, currentConfidence + boost);
      console.log(
        `[ConfidenceCalculator] Support evidence boosted confidence: ` +
        `${currentConfidence.toFixed(2)} → ${newConfidence.toFixed(2)}`
      );
      return newConfidence;
    }

    if (evidence.type === 'contradict') {
      // Decrease confidence when contradicted
      const penalty = evidence.strength * 0.15;
      const newConfidence = Math.max(0, currentConfidence - penalty);
      console.log(
        `[ConfidenceCalculator] Contradiction penalized confidence: ` +
        `${currentConfidence.toFixed(2)} → ${newConfidence.toFixed(2)}`
      );
      return newConfidence;
    }

    if (evidence.type === 'activation') {
      // Slight increase when used successfully
      const boost = 0.02; // Small incremental boost
      const newConfidence = Math.min(1.0, currentConfidence + boost);
      return newConfidence;
    }

    return currentConfidence;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConfidenceCalculator;
}
