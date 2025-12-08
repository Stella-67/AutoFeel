// ==================== Stability Manager ====================
// Assess card stability and manage migration from temporary to stable layer

/**
 * StabilityManager - Manages the lifecycle transition of cards
 * from temporary (high plasticity) to stable (long-term memory)
 */
class StabilityManager {
  constructor(memoryDB) {
    this.memoryDB = memoryDB;

    // Stability thresholds for migration
    this.MIGRATION_STABILITY_THRESHOLD = 0.7;
    this.MIGRATION_CONFIDENCE_THRESHOLD = 0.7;
    this.MIGRATION_SURPRISE_THRESHOLD = 0.3;
    this.MIGRATION_ACTIVATION_THRESHOLD = 3;
  }

  /**
   * Calculate stability score for a card
   * @param {Object} card - Card to evaluate
   * @returns {number} Stability score (0-1)
   *   - 0 = Highly unstable (uncertain, surprising, unused)
   *   - 1 = Highly stable (confident, familiar, frequently used)
   */
  calculateStability(card) {
    const confidence = card.confidence !== undefined ? card.confidence : 0.5;
    const surprise = card.surprise !== undefined ? card.surprise : 0.5;
    const activationWeight = card.activation_weight !== undefined ? card.activation_weight : 0;

    // Stability formula:
    // - High confidence → more stable
    // - Low surprise → more stable (familiar)
    // - High activation → more stable (frequently used)
    const stability =
      0.4 * confidence +
      0.3 * (1 - surprise) +
      0.3 * activationWeight;

    return stability;
  }

  /**
   * Check if a card is ready to migrate from temporary to stable layer
   * @param {Object} card - Card to evaluate
   * @returns {boolean} True if ready for migration
   */
  isMigrationReady(card) {
    // Already stable → no migration needed
    if (card.layer === 'stable') {
      return false;
    }

    const stability = this.calculateStability(card);
    const confidence = card.confidence !== undefined ? card.confidence : 0.5;
    const surprise = card.surprise !== undefined ? card.surprise : 0.5;
    const activationCount = card.activation_count || 0;

    // Migration criteria (all must be satisfied):
    // 1. Stability score > threshold
    // 2. Confidence > threshold
    // 3. Surprise < threshold (familiar)
    // 4. Activation count > threshold (proven useful)

    const ready =
      stability > this.MIGRATION_STABILITY_THRESHOLD &&
      confidence > this.MIGRATION_CONFIDENCE_THRESHOLD &&
      surprise < this.MIGRATION_SURPRISE_THRESHOLD &&
      activationCount > this.MIGRATION_ACTIVATION_THRESHOLD;

    if (ready) {
      console.log(
        `[StabilityManager] Card ${card.chunk_id} is ready for migration ` +
        `(stability: ${stability.toFixed(2)}, confidence: ${confidence.toFixed(2)}, ` +
        `surprise: ${surprise.toFixed(2)}, activations: ${activationCount})`
      );
    }

    return ready;
  }

  /**
   * Migrate a card to the stable layer
   * @param {Object} card - Card to migrate
   */
  async migrateToStable(card) {
    console.log(`[StabilityManager] 🔄 Migrating card ${card.chunk_id} to stable layer...`);

    // Update card properties
    card.layer = 'stable';
    card.stability_score = this.calculateStability(card);
    card.migration_ready = false;
    card.last_updated = new Date().toISOString();
    card.version = (card.version || 1) + 1;

    // Save to database
    await this.memoryDB.saveChunks([card]);

    console.log(
      `[StabilityManager] ✅ Card migrated to stable layer ` +
      `(stability: ${card.stability_score.toFixed(2)}, version: ${card.version})`
    );
  }

  /**
   * Evaluate all temporary cards and migrate eligible ones
   * @returns {Promise<Object>} Summary of evaluation results
   */
  async evaluateTemporaryCards() {
    console.log('[StabilityManager] 🔍 Evaluating temporary layer cards...');

    const allCards = await this.memoryDB.getAllChunks();
    const temporaryCards = allCards.filter(c => c.layer === 'temporary');

    console.log(`[StabilityManager] Found ${temporaryCards.length} temporary cards`);

    if (temporaryCards.length === 0) {
      return {
        evaluated: 0,
        migrated: 0,
        cards: []
      };
    }

    let migratedCount = 0;
    const migratedCards = [];

    for (const card of temporaryCards) {
      // Calculate and update stability score
      card.stability_score = this.calculateStability(card);
      card.migration_ready = this.isMigrationReady(card);

      // Migrate if ready
      if (card.migration_ready) {
        await this.migrateToStable(card);
        migratedCount++;
        migratedCards.push(card.chunk_id);
      }
    }

    // Save updated stability scores for all temporary cards
    await this.memoryDB.saveChunks(temporaryCards);

    console.log(
      `[StabilityManager] ✅ Evaluation complete: ${migratedCount} cards migrated ` +
      `(${temporaryCards.length - migratedCount} remain temporary)`
    );

    return {
      evaluated: temporaryCards.length,
      migrated: migratedCount,
      cards: migratedCards
    };
  }

  /**
   * Get statistics about layer distribution
   * @returns {Promise<Object>} Layer statistics
   */
  async getLayerStats() {
    const allCards = await this.memoryDB.getAllChunks();

    const stats = {
      total: allCards.length,
      temporary: 0,
      stable: 0,
      averageStability: {
        temporary: 0,
        stable: 0
      },
      migrationReady: 0
    };

    let tempStabilitySum = 0;
    let stableStabilitySum = 0;

    for (const card of allCards) {
      if (card.layer === 'temporary') {
        stats.temporary++;
        tempStabilitySum += card.stability_score || 0;

        if (card.migration_ready) {
          stats.migrationReady++;
        }
      } else if (card.layer === 'stable') {
        stats.stable++;
        stableStabilitySum += card.stability_score || 0;
      }
    }

    stats.averageStability.temporary =
      stats.temporary > 0 ? tempStabilitySum / stats.temporary : 0;
    stats.averageStability.stable =
      stats.stable > 0 ? stableStabilitySum / stats.stable : 0;

    return stats;
  }

  /**
   * Force migrate a specific card to stable layer
   * (bypasses normal migration criteria)
   * @param {string} chunkId - ID of card to migrate
   */
  async forceMigrateCard(chunkId) {
    const card = await this.memoryDB.getChunkById(chunkId);

    if (!card) {
      console.warn(`[StabilityManager] Card ${chunkId} not found`);
      return false;
    }

    if (card.layer === 'stable') {
      console.log(`[StabilityManager] Card ${chunkId} is already stable`);
      return false;
    }

    console.log(`[StabilityManager] ⚠️ Force migrating card ${chunkId}...`);
    await this.migrateToStable(card);
    return true;
  }

  /**
   * Demote a stable card back to temporary layer
   * (useful if card information becomes outdated)
   * @param {string} chunkId - ID of card to demote
   */
  async demoteToTemporary(chunkId) {
    const card = await this.memoryDB.getChunkById(chunkId);

    if (!card) {
      console.warn(`[StabilityManager] Card ${chunkId} not found`);
      return false;
    }

    if (card.layer === 'temporary') {
      console.log(`[StabilityManager] Card ${chunkId} is already temporary`);
      return false;
    }

    console.log(`[StabilityManager] ⬇️ Demoting card ${chunkId} to temporary layer...`);

    card.layer = 'temporary';
    card.stability_score = this.calculateStability(card);
    card.migration_ready = false;
    card.last_updated = new Date().toISOString();
    card.version = (card.version || 1) + 1;

    await this.memoryDB.saveChunks([card]);

    console.log(`[StabilityManager] ✅ Card demoted to temporary layer`);
    return true;
  }
}

// Ensure it's available globally in Service Worker context
if (typeof self !== 'undefined') {
  self.StabilityManager = StabilityManager;
}

// Export for use in other modules (for non-browser environments)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StabilityManager;
}
