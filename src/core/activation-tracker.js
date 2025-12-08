// ==================== Activation Tracker ====================
// Track card activations and strengthen relationships through usage

/**
 * ActivationTracker - Records when cards are retrieved/used
 * and manages activation-based reinforcement learning
 */
class ActivationTracker {
  constructor(memoryDB) {
    this.memoryDB = memoryDB;

    // Activation parameters
    this.DAILY_DECAY_RATE = 0.99; // 1% decay per day
    this.ACTIVATION_BOOST = 0.1;  // Weight increase per activation
  }

  /**
   * Record that a card was activated (retrieved/used)
   * @param {string} chunkId - ID of the activated card
   * @param {Array<string>} coActivatedIds - IDs of cards activated together (optional)
   * @returns {Promise<Object>} Updated card
   */
  async recordActivation(chunkId, coActivatedIds = []) {
    const card = await this.memoryDB.getChunkById(chunkId);

    if (!card) {
      console.warn(`[ActivationTracker] Card ${chunkId} not found`);
      return null;
    }

    const now = new Date().toISOString();

    // Update activation count
    card.activation_count = (card.activation_count || 0) + 1;
    card.last_activated = now;

    // Calculate and update activation weight (with decay)
    card.activation_weight = this.calculateActivationWeight(card);

    console.log(
      `[ActivationTracker] Card ${chunkId} activated ` +
      `(count: ${card.activation_count}, weight: ${card.activation_weight.toFixed(2)})`
    );

    // Strengthen relationships with co-activated cards
    if (coActivatedIds.length > 0) {
      await this.strengthenRelations(card, coActivatedIds);
    }

    // Update confidence based on usage
    // (Frequent usage increases confidence)
    // ConfidenceCalculator is loaded globally via importScripts in background.js
    const confidenceCalc = new ConfidenceCalculator();
    card.confidence = confidenceCalc.updateConfidence(card, {
      type: 'activation',
      strength: 1.0
    });

    // Update last modified timestamp
    card.last_updated = now;

    // Save updated card
    await this.memoryDB.saveChunks([card]);

    return card;
  }

  /**
   * Calculate activation weight with time-based decay
   * @param {Object} card - Card to calculate weight for
   * @returns {number} Activation weight (0-1)
   */
  calculateActivationWeight(card) {
    const now = Date.now();
    const lastActivated = new Date(card.last_activated || card.created_at).getTime();
    const daysSinceActivation = (now - lastActivated) / (1000 * 60 * 60 * 24);

    // Decay factor: decay reduces weight over time
    // Each day, weight decays by DAILY_DECAY_RATE
    const decayFactor = Math.pow(this.DAILY_DECAY_RATE, daysSinceActivation);

    // Current weight = previous weight × decay + activation boost
    const currentWeight = (card.activation_weight || 0) * decayFactor;
    const newWeight = currentWeight + this.ACTIVATION_BOOST;

    // Clamp to [0, 1]
    return Math.min(1.0, Math.max(0, newWeight));
  }

  /**
   * Strengthen relationships with co-activated cards
   * @param {Object} card - Card that was activated
   * @param {Array<string>} coActivatedIds - Cards activated at the same time
   */
  async strengthenRelations(card, coActivatedIds) {
    console.log(
      `[ActivationTracker] Strengthening relations for ${card.chunk_id} ` +
      `with ${coActivatedIds.length} co-activated cards`
    );

    for (const coId of coActivatedIds) {
      // Skip self-relations
      if (coId === card.chunk_id) {
        continue;
      }

      // Find existing relation
      let relationFound = false;

      // Check all relationship types
      for (const relType of ['related_chunks', 'parent_chunks', 'child_chunks', 'supports']) {
        if (!card.relationships[relType]) {
          card.relationships[relType] = [];
        }

        const relIndex = card.relationships[relType].findIndex(rel => {
          if (typeof rel === 'string') {
            return rel === coId;
          } else if (typeof rel === 'object' && rel.target_id) {
            return rel.target_id === coId;
          }
          return false;
        });

        if (relIndex >= 0) {
          // Relationship exists - strengthen it
          const rel = card.relationships[relType][relIndex];

          if (typeof rel === 'string') {
            // Old format: convert to new format
            card.relationships[relType][relIndex] = {
              target_id: rel,
              strength: 0.6,
              confidence: 0.7,
              created_at: card.created_at,
              co_activation_count: 1,
              version: 1
            };
            console.log(`[ActivationTracker] Converted old relation format for ${coId}`);
          } else {
            // New format: increment co-activation count and strengthen
            rel.co_activation_count = (rel.co_activation_count || 0) + 1;
            rel.strength = Math.min(1.0, rel.strength + 0.05);
            console.log(
              `[ActivationTracker] Strengthened ${relType} relation: ` +
              `${card.chunk_id} → ${coId} ` +
              `(strength: ${rel.strength.toFixed(2)}, ` +
              `co-activations: ${rel.co_activation_count})`
            );
          }

          relationFound = true;
          break;
        }
      }

      // If no existing relation, create a new one
      if (!relationFound) {
        if (!card.relationships.related_chunks) {
          card.relationships.related_chunks = [];
        }

        card.relationships.related_chunks.push({
          target_id: coId,
          strength: 0.5,
          confidence: 0.6,
          created_at: new Date().toISOString(),
          co_activation_count: 1,
          version: 1
        });

        console.log(
          `[ActivationTracker] Created new relation through co-activation: ` +
          `${card.chunk_id} ↔ ${coId}`
        );
      }
    }
  }

  /**
   * Record batch activation (multiple cards activated together)
   * @param {Array<string>} chunkIds - IDs of all activated cards
   */
  async recordBatchActivation(chunkIds) {
    console.log(`[ActivationTracker] Recording batch activation of ${chunkIds.length} cards`);

    const updatePromises = chunkIds.map(chunkId => {
      // For each card, the others are co-activated
      const coActivatedIds = chunkIds.filter(id => id !== chunkId);
      return this.recordActivation(chunkId, coActivatedIds);
    });

    await Promise.all(updatePromises);

    console.log(`[ActivationTracker] ✅ Batch activation recorded`);
  }

  /**
   * Get activation statistics
   * @returns {Promise<Object>} Activation statistics
   */
  async getActivationStats() {
    const allCards = await this.memoryDB.getAllChunks();

    const stats = {
      totalCards: allCards.length,
      neverActivated: 0,
      lowActivation: 0,  // 1-3 activations
      mediumActivation: 0,  // 4-10 activations
      highActivation: 0,  // 10+ activations
      averageActivationCount: 0,
      averageActivationWeight: 0,
      mostActivated: null
    };

    let totalActivations = 0;
    let totalWeight = 0;
    let maxActivations = 0;
    let mostActivatedCard = null;

    for (const card of allCards) {
      const count = card.activation_count || 0;
      totalActivations += count;
      totalWeight += card.activation_weight || 0;

      if (count === 0) {
        stats.neverActivated++;
      } else if (count <= 3) {
        stats.lowActivation++;
      } else if (count <= 10) {
        stats.mediumActivation++;
      } else {
        stats.highActivation++;
      }

      if (count > maxActivations) {
        maxActivations = count;
        mostActivatedCard = {
          chunk_id: card.chunk_id,
          text: card.text.substring(0, 100) + '...',
          activation_count: count,
          activation_weight: card.activation_weight || 0
        };
      }
    }

    stats.averageActivationCount =
      stats.totalCards > 0 ? totalActivations / stats.totalCards : 0;
    stats.averageActivationWeight =
      stats.totalCards > 0 ? totalWeight / stats.totalCards : 0;
    stats.mostActivated = mostActivatedCard;

    return stats;
  }

  /**
   * Reset activation counters for a card
   * (useful for testing or manual intervention)
   * @param {string} chunkId - Card to reset
   */
  async resetActivation(chunkId) {
    const card = await this.memoryDB.getChunkById(chunkId);

    if (!card) {
      console.warn(`[ActivationTracker] Card ${chunkId} not found`);
      return false;
    }

    console.log(`[ActivationTracker] Resetting activation for ${chunkId}`);

    card.activation_count = 0;
    card.activation_weight = 0;
    card.last_activated = card.created_at;
    card.last_updated = new Date().toISOString();

    await this.memoryDB.saveChunks([card]);

    console.log(`[ActivationTracker] ✅ Activation reset`);
    return true;
  }
}

// Ensure it's available globally in Service Worker context
if (typeof self !== 'undefined') {
  self.ActivationTracker = ActivationTracker;
}

// Export for use in other modules (for non-browser environments)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ActivationTracker;
}
