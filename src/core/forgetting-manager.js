// ==================== Forgetting Manager ====================
// Implement time-based decay and pruning of unused knowledge

/**
 * ForgettingManager - Manages the forgetting curve and pruning
 * of cards that are no longer relevant or frequently accessed
 */
class ForgettingManager {
  constructor(memoryDB) {
    this.memoryDB = memoryDB;

    // Forgetting parameters
    this.HALF_LIFE_DAYS = 30;  // Half-life for decay (30 days)
    this.OBSOLETE_THRESHOLD = 0.1;  // Mark obsolete if decay < 0.1
    this.MIN_ACTIVATION_TO_KEEP = 2;  // Keep cards with at least 2 activations
    this.RELATION_DECAY_AMOUNT = 0.1;  // Amount to reduce unused relation strength
    this.MIN_RELATION_STRENGTH = 0.2;  // Delete relations below this strength
  }

  /**
   * Perform forgetting cycle - decay and prune unused cards
   * Should be run periodically (e.g., weekly)
   * @returns {Promise<Object>} Summary of forgetting operations
   */
  async performForgetting() {
    console.log('[ForgettingManager] 🧹 Starting forgetting cycle...');

    const allCards = await this.memoryDB.getAllChunks();

    console.log(`[ForgettingManager] Analyzing ${allCards.length} cards for decay and pruning...`);

    let prunedCount = 0;
    let weakenedRelationCount = 0;
    const prunedCardIds = [];

    for (const card of allCards) {
      // Calculate current decay factor
      const decayFactor = this.calculateDecayFactor(card);
      card.decay_factor = decayFactor;

      // Mark as obsolete if:
      // 1. Decay is very low (< threshold)
      // 2. Card was rarely used (< min activations)
      // 3. Not already marked as obsolete
      if (
        decayFactor < this.OBSOLETE_THRESHOLD &&
        (card.activation_count || 0) < this.MIN_ACTIVATION_TO_KEEP &&
        !card.obsolete
      ) {
        card.obsolete = true;
        prunedCount++;
        prunedCardIds.push(card.chunk_id);

        console.log(
          `[ForgettingManager] Marked as obsolete: ${card.chunk_id} ` +
          `(decay: ${decayFactor.toFixed(3)}, activations: ${card.activation_count || 0})`
        );
      }

      // Weaken unused relationships
      const weakened = this.weakenUnusedRelations(card);
      weakenedRelationCount += weakened;

      // Update timestamp
      card.last_updated = new Date().toISOString();
    }

    // Save all updated cards
    await this.memoryDB.saveChunks(allCards);

    console.log(
      `[ForgettingManager] ✅ Forgetting cycle complete:\n` +
      `  - Analyzed: ${allCards.length} cards\n` +
      `  - Pruned (marked obsolete): ${prunedCount} cards\n` +
      `  - Weakened relations: ${weakenedRelationCount}`
    );

    return {
      total: allCards.length,
      pruned: prunedCount,
      prunedCards: prunedCardIds,
      weakenedRelations: weakenedRelationCount
    };
  }

  /**
   * Calculate decay factor for a card based on time since last activation
   * @param {Object} card - Card to calculate decay for
   * @returns {number} Decay factor (0-1)
   *   - 1.0 = No decay (recently activated)
   *   - 0.0 = Complete decay (never/rarely activated for long time)
   */
  calculateDecayFactor(card) {
    const now = Date.now();
    const lastActivated = new Date(card.last_activated || card.created_at).getTime();
    const daysSinceActivation = (now - lastActivated) / (1000 * 60 * 60 * 24);

    // Exponential decay with half-life
    // After HALF_LIFE_DAYS, decay_factor = 0.5
    // After 2 × HALF_LIFE_DAYS, decay_factor = 0.25
    const decayFactor = Math.pow(0.5, daysSinceActivation / this.HALF_LIFE_DAYS);

    return decayFactor;
  }

  /**
   * Weaken and prune unused relationships
   * @param {Object} card - Card to process
   * @returns {number} Count of weakened relations
   */
  weakenUnusedRelations(card) {
    let weakenedCount = 0;

    // Process all relationship types
    for (const relType in card.relationships) {
      const rels = card.relationships[relType];

      if (!Array.isArray(rels)) {
        continue;
      }

      // Iterate backwards to safely remove elements
      for (let i = rels.length - 1; i >= 0; i--) {
        const rel = rels[i];

        // Only process new-format relations (with metadata)
        if (typeof rel === 'object' && rel.strength !== undefined) {
          // Weaken if never co-activated
          if ((rel.co_activation_count || 0) === 0) {
            rel.strength = Math.max(0, rel.strength - this.RELATION_DECAY_AMOUNT);
            weakenedCount++;

            console.log(
              `[ForgettingManager] Weakened ${relType} relation: ` +
              `${card.chunk_id} → ${rel.target_id} ` +
              `(strength: ${rel.strength.toFixed(2)})`
            );

            // Remove if strength falls below minimum
            if (rel.strength < this.MIN_RELATION_STRENGTH) {
              rels.splice(i, 1);
              console.log(
                `[ForgettingManager] Pruned weak relation: ` +
                `${card.chunk_id} → ${rel.target_id}`
              );
            }
          }
        }
      }
    }

    return weakenedCount;
  }

  /**
   * Permanently delete obsolete cards from database
   * (Use with caution - this is irreversible)
   * @param {number} maxAge - Maximum age in days for obsolete cards to keep
   * @returns {Promise<Object>} Deletion summary
   */
  async deleteObsoleteCards(maxAge = 90) {
    console.log(
      `[ForgettingManager] 🗑️  Deleting obsolete cards older than ${maxAge} days...`
    );

    const allCards = await this.memoryDB.getAllChunks();
    const now = Date.now();
    const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;

    const toDelete = [];

    for (const card of allCards) {
      if (!card.obsolete) {
        continue;
      }

      const lastUpdated = new Date(card.last_updated || card.created_at).getTime();
      const age = now - lastUpdated;

      // Only delete if obsolete for more than maxAge days
      if (age > maxAgeMs) {
        toDelete.push(card.chunk_id);
      }
    }

    if (toDelete.length === 0) {
      console.log(`[ForgettingManager] No obsolete cards to delete`);
      return { deleted: 0, cards: [] };
    }

    // Delete cards
    await this.memoryDB.deleteChunks(toDelete);

    console.log(`[ForgettingManager] ✅ Deleted ${toDelete.length} obsolete cards`);

    return {
      deleted: toDelete.length,
      cards: toDelete
    };
  }

  /**
   * Get forgetting statistics
   * @returns {Promise<Object>} Statistics about decay and obsolete cards
   */
  async getForgettingStats() {
    const allCards = await this.memoryDB.getAllChunks();

    const stats = {
      total: allCards.length,
      obsolete: 0,
      highDecay: 0,  // decay_factor > 0.7
      mediumDecay: 0,  // 0.3 < decay_factor < 0.7
      lowDecay: 0,  // decay_factor < 0.3
      averageDecayFactor: 0,
      oldestCard: null,
      newestCard: null
    };

    let totalDecay = 0;
    let oldestDate = Date.now();
    let newestDate = 0;
    let oldestCard = null;
    let newestCard = null;

    for (const card of allCards) {
      const decay = card.decay_factor !== undefined
        ? card.decay_factor
        : this.calculateDecayFactor(card);

      totalDecay += decay;

      if (card.obsolete) {
        stats.obsolete++;
      }

      if (decay > 0.7) {
        stats.highDecay++;
      } else if (decay > 0.3) {
        stats.mediumDecay++;
      } else {
        stats.lowDecay++;
      }

      // Track oldest and newest
      const lastActivated = new Date(card.last_activated || card.created_at).getTime();

      if (lastActivated < oldestDate) {
        oldestDate = lastActivated;
        oldestCard = {
          chunk_id: card.chunk_id,
          last_activated: card.last_activated || card.created_at,
          decay_factor: decay
        };
      }

      if (lastActivated > newestDate) {
        newestDate = lastActivated;
        newestCard = {
          chunk_id: card.chunk_id,
          last_activated: card.last_activated || card.created_at,
          decay_factor: decay
        };
      }
    }

    stats.averageDecayFactor = stats.total > 0 ? totalDecay / stats.total : 0;
    stats.oldestCard = oldestCard;
    stats.newestCard = newestCard;

    return stats;
  }

  /**
   * Restore an obsolete card (unmark as obsolete)
   * @param {string} chunkId - Card to restore
   */
  async restoreCard(chunkId) {
    const card = await this.memoryDB.getChunkById(chunkId);

    if (!card) {
      console.warn(`[ForgettingManager] Card ${chunkId} not found`);
      return false;
    }

    if (!card.obsolete) {
      console.log(`[ForgettingManager] Card ${chunkId} is not obsolete`);
      return false;
    }

    console.log(`[ForgettingManager] ♻️  Restoring card ${chunkId}...`);

    card.obsolete = false;
    card.decay_factor = 1.0;
    card.last_activated = new Date().toISOString();
    card.last_updated = new Date().toISOString();

    await this.memoryDB.saveChunks([card]);

    console.log(`[ForgettingManager] ✅ Card restored`);
    return true;
  }

  /**
   * Preview which cards would be marked obsolete
   * (dry run, doesn't modify anything)
   * @returns {Promise<Array>} Cards that would be marked obsolete
   */
  async previewObsolete() {
    const allCards = await this.memoryDB.getAllChunks();
    const candidates = [];

    for (const card of allCards) {
      if (card.obsolete) {
        continue; // Already obsolete
      }

      const decayFactor = this.calculateDecayFactor(card);
      const activationCount = card.activation_count || 0;

      if (
        decayFactor < this.OBSOLETE_THRESHOLD &&
        activationCount < this.MIN_ACTIVATION_TO_KEEP
      ) {
        candidates.push({
          chunk_id: card.chunk_id,
          text: card.text.substring(0, 100) + '...',
          decay_factor: decayFactor,
          activation_count: activationCount,
          last_activated: card.last_activated || card.created_at
        });
      }
    }

    return candidates;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ForgettingManager;
}
