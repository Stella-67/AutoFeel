# 迁移到卡片式多层架构计划

**版本**: 0.4.0-alpha
**创建日期**: 2025-12-07
**状态**: 提案阶段

---

## 目标

将 AutoFeel 从当前的扁平 Document-Chunk 架构迁移到卡片式、多层、自演化架构。

---

## 阶段 1: 数据结构扩展（兼容性优先）

### 1.1 扩展 Chunk Schema → Card Schema

在现有 `memory_chunks` 基础上添加新字段，保持向后兼容：

```javascript
{
  // ========== 现有字段（保留）==========
  chunk_id: "uuid",
  doc_id: "uuid",
  order: 0,
  text: "...",
  embedding: [...],
  block_type: "paragraph",
  chunk_type: "concept",
  importance: 0.85,
  created_at: "2024-01-15T08:30:45.123Z",
  relationships: { ... },
  source: { ... },
  metadata: { ... },

  // ========== 新增字段 ==========

  // 分层系统
  layer: "temporary" | "stable",  // 默认: "temporary"

  // 置信度与惊奇度
  confidence: 0.75,        // 0-1, 默认 0.5（中等置信度）
  surprise: 0.3,           // 0-1, 新卡片时计算

  // 激活强化
  activation_count: 5,     // 被检索/使用的次数
  activation_weight: 0.8,  // 激活权重（衰减+强化）
  last_activated: "2024-01-20T10:15:30.123Z",

  // 稳定性
  stability_score: 0.6,    // 稳定性综合得分
  migration_ready: false,  // 是否准备迁移到 stable layer

  // 生命周期
  version: 1,              // 卡片版本号（用于追踪演化）
  parent_card_id: null,    // 如果是分裂而来，记录父卡片
  merged_from: [],         // 如果是合并而来，记录源卡片 IDs

  // 遗忘机制
  decay_factor: 1.0,       // 衰减因子（0-1）
  obsolete: false,         // 是否已过时
  last_updated: "2024-01-15T08:30:45.123Z"
}
```

### 1.2 扩展 Relationships

为关系添加元数据：

```javascript
relationships: {
  related_chunks: [
    {
      target_id: "uuid",
      strength: 0.8,        // 关系强度（动态调整）
      confidence: 0.9,      // 关系置信度
      created_at: "...",
      co_activation_count: 3,  // 共同激活次数
      version: 1            // 关系版本
    }
  ],
  // ... 其他关系类型也添加元数据
}
```

### 1.3 数据库升级

```javascript
// src/core/db.js
const DB_VERSION = 2;  // 升级到 v2

request.onupgradeneeded = (event) => {
  const oldVersion = event.oldVersion;

  // v1 → v2: 添加新索引
  if (oldVersion < 2) {
    const chunksStore = transaction.objectStore(CHUNKS_STORE);

    // 添加分层索引
    chunksStore.createIndex('layer', 'layer', { unique: false });

    // 添加置信度索引
    chunksStore.createIndex('confidence', 'confidence', { unique: false });

    // 添加激活权重索引
    chunksStore.createIndex('activation_weight', 'activation_weight', { unique: false });

    // 添加稳定性索引
    chunksStore.createIndex('stability_score', 'stability_score', { unique: false });

    console.log('[DB] Migrated to v2: Added card architecture fields');
  }
};
```

---

## 阶段 2: 核心机制实现

### 2.1 惊奇度计算 (Surprise Detection)

**文件**: `src/core/surprise-detector.js` (新建)

```javascript
class SurpriseDetector {
  /**
   * 计算新卡片的惊奇度
   * @param {Object} newCard - 新卡片
   * @param {Array} existingCards - 现有卡片
   * @returns {number} 惊奇度 (0-1)
   */
  async calculateSurprise(newCard, existingCards) {
    // 1. 语义距离（向量）
    const semanticDistance = this.calculateSemanticDistance(newCard, existingCards);

    // 2. 矛盾检测
    const contradictionScore = await this.detectContradictions(newCard, existingCards);

    // 3. 新颖性（关键词、概念）
    const noveltyScore = this.calculateNovelty(newCard, existingCards);

    // 加权综合
    const surprise =
      0.4 * semanticDistance +
      0.4 * contradictionScore +
      0.2 * noveltyScore;

    return Math.min(1.0, surprise);
  }

  calculateSemanticDistance(newCard, existingCards) {
    if (!newCard.embedding) return 0.5;  // 默认中等惊奇

    // 找到最相似的卡片
    let maxSimilarity = 0;
    for (const card of existingCards) {
      if (!card.embedding) continue;
      const similarity = cosineSimilarity(newCard.embedding, card.embedding);
      if (similarity > maxSimilarity) maxSimilarity = similarity;
    }

    // 距离 = 1 - 最大相似度
    return 1 - maxSimilarity;
  }

  async detectContradictions(newCard, existingCards) {
    // 使用 LLM 检测是否与现有卡片矛盾
    // 如果矛盾 → 惊奇度高
    // 略: 实现 LLM 调用逻辑
    return 0;
  }

  calculateNovelty(newCard, existingCards) {
    // 检测新卡片中是否包含新概念、新实体
    const newKeywords = this.extractKeywords(newCard.text);
    const existingKeywords = new Set();

    for (const card of existingCards) {
      const keywords = this.extractKeywords(card.text);
      keywords.forEach(kw => existingKeywords.add(kw));
    }

    const novelKeywords = newKeywords.filter(kw => !existingKeywords.has(kw));
    return novelKeywords.length / Math.max(1, newKeywords.length);
  }

  extractKeywords(text) {
    // 简单实现：提取名词、专有名词
    // 可用 NLP 库优化
    return text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3);
  }
}
```

### 2.2 置信度计算

**文件**: `src/core/confidence-calculator.js` (新建)

```javascript
class ConfidenceCalculator {
  /**
   * 计算卡片置信度
   * @param {Object} card
   * @param {Object} context - 上下文信息
   * @returns {number} 置信度 (0-1)
   */
  calculateConfidence(card, context = {}) {
    const factors = [];

    // 1. 来源可靠性
    if (context.sourceReliability) {
      factors.push(context.sourceReliability);
    }

    // 2. 与已有知识的一致性
    const consistencyScore = this.calculateConsistency(card, context.existingCards || []);
    factors.push(consistencyScore);

    // 3. 信息完整性
    const completeness = this.calculateCompleteness(card);
    factors.push(completeness);

    // 4. 支持证据数量
    if (card.relationships?.supports?.length > 0) {
      const evidenceScore = Math.min(1.0, card.relationships.supports.length / 3);
      factors.push(evidenceScore);
    }

    // 5. 使用频率（激活次数）
    if (card.activation_count > 0) {
      const usageScore = Math.min(1.0, card.activation_count / 10);
      factors.push(usageScore);
    }

    // 平均值
    return factors.reduce((sum, f) => sum + f, 0) / factors.length;
  }

  calculateConsistency(card, existingCards) {
    // 检查是否与现有卡片矛盾
    const contradictions = existingCards.filter(c =>
      c.relationships?.contradicts?.includes(card.chunk_id)
    );

    if (contradictions.length > 0) {
      return 0.3;  // 有矛盾 → 低置信度
    }

    // 检查是否有支持
    const supports = existingCards.filter(c =>
      c.relationships?.supports?.includes(card.chunk_id)
    );

    return Math.min(1.0, 0.5 + supports.length * 0.1);
  }

  calculateCompleteness(card) {
    let score = 0.5;  // 基础分

    if (card.text && card.text.length > 50) score += 0.2;
    if (card.embedding) score += 0.1;
    if (card.metadata?.entities) score += 0.1;
    if (card.chunk_type && card.chunk_type !== 'unknown') score += 0.1;

    return Math.min(1.0, score);
  }
}
```

### 2.3 稳定性评估与迁移

**文件**: `src/core/stability-manager.js` (新建)

```javascript
class StabilityManager {
  constructor(memoryDB) {
    this.memoryDB = memoryDB;
  }

  /**
   * 计算卡片稳定性得分
   * @param {Object} card
   * @returns {number} 稳定性 (0-1)
   */
  calculateStability(card) {
    const { confidence = 0.5, surprise = 0.5, activation_weight = 0 } = card;

    // 稳定性 = 高置信度 + 低惊奇 + 高激活
    const stability =
      0.4 * confidence +
      0.3 * (1 - surprise) +
      0.3 * activation_weight;

    return stability;
  }

  /**
   * 检查卡片是否可以迁移到稳定层
   * @param {Object} card
   * @returns {boolean}
   */
  isMigrationReady(card) {
    if (card.layer === 'stable') return false;

    const stability = this.calculateStability(card);

    // 迁移条件：
    // 1. 稳定性 > 0.7
    // 2. 置信度 > 0.7
    // 3. 惊奇度 < 0.3
    // 4. 激活次数 > 3

    return (
      stability > 0.7 &&
      card.confidence > 0.7 &&
      card.surprise < 0.3 &&
      card.activation_count > 3
    );
  }

  /**
   * 迁移卡片到稳定层
   * @param {Object} card
   */
  async migrateToStable(card) {
    console.log(`[Stability] Migrating card ${card.chunk_id} to stable layer`);

    card.layer = 'stable';
    card.stability_score = this.calculateStability(card);
    card.migration_ready = false;
    card.last_updated = new Date().toISOString();
    card.version += 1;

    await this.memoryDB.saveChunks([card]);

    console.log(`[Stability] ✅ Card migrated to stable layer (stability: ${card.stability_score.toFixed(2)})`);
  }

  /**
   * 批量评估所有临时层卡片
   */
  async evaluateTemporaryCards() {
    const allCards = await this.memoryDB.getAllChunks();
    const temporaryCards = allCards.filter(c => c.layer === 'temporary');

    console.log(`[Stability] Evaluating ${temporaryCards.length} temporary cards...`);

    let migratedCount = 0;

    for (const card of temporaryCards) {
      card.stability_score = this.calculateStability(card);
      card.migration_ready = this.isMigrationReady(card);

      if (card.migration_ready) {
        await this.migrateToStable(card);
        migratedCount++;
      }
    }

    console.log(`[Stability] ✅ Migrated ${migratedCount} cards to stable layer`);

    // 保存更新后的稳定性得分
    await this.memoryDB.saveChunks(temporaryCards);
  }
}
```

### 2.4 激活强化机制

**文件**: `src/core/activation-tracker.js` (新建)

```javascript
class ActivationTracker {
  constructor(memoryDB) {
    this.memoryDB = memoryDB;
    this.activationHistory = new Map();  // chunk_id → [timestamps]
  }

  /**
   * 记录卡片被激活
   * @param {string} chunkId
   * @param {Array<string>} coActivatedIds - 共同激活的卡片
   */
  async recordActivation(chunkId, coActivatedIds = []) {
    const card = await this.memoryDB.getChunkById(chunkId);
    if (!card) return;

    // 更新激活计数
    card.activation_count = (card.activation_count || 0) + 1;
    card.last_activated = new Date().toISOString();

    // 更新激活权重（衰减 + 强化）
    card.activation_weight = this.calculateActivationWeight(card);

    // 强化共同激活的关系
    if (coActivatedIds.length > 0) {
      await this.strengthenRelations(card, coActivatedIds);
    }

    // 重新计算置信度（使用频率提升置信度）
    const confidenceCalc = new ConfidenceCalculator();
    card.confidence = confidenceCalc.calculateConfidence(card);

    await this.memoryDB.saveChunks([card]);

    console.log(`[Activation] Card ${chunkId} activated (count: ${card.activation_count}, weight: ${card.activation_weight.toFixed(2)})`);
  }

  calculateActivationWeight(card) {
    const now = Date.now();
    const lastActivated = new Date(card.last_activated || card.created_at).getTime();
    const daysSinceActivation = (now - lastActivated) / (1000 * 60 * 60 * 24);

    // 衰减：每天衰减 1%
    const decayFactor = Math.pow(0.99, daysSinceActivation);

    // 当前权重 = 上次权重 × 衰减 + 本次激活增益
    const currentWeight = (card.activation_weight || 0) * decayFactor;
    const boost = 0.1;  // 每次激活增加 0.1

    return Math.min(1.0, currentWeight + boost);
  }

  async strengthenRelations(card, coActivatedIds) {
    // 增强与共同激活卡片的关系
    for (const coId of coActivatedIds) {
      // 查找现有关系
      const hasRelation = card.relationships.related_chunks.some(
        rel => rel.target_id === coId || rel === coId
      );

      if (hasRelation) {
        // 如果已有关系，增强 strength
        const relIndex = card.relationships.related_chunks.findIndex(
          rel => (rel.target_id || rel) === coId
        );

        if (relIndex >= 0) {
          const rel = card.relationships.related_chunks[relIndex];

          if (typeof rel === 'string') {
            // 旧格式：转换为新格式
            card.relationships.related_chunks[relIndex] = {
              target_id: rel,
              strength: 0.6,
              confidence: 0.7,
              created_at: card.created_at,
              co_activation_count: 1,
              version: 1
            };
          } else {
            // 新格式：增强
            rel.co_activation_count = (rel.co_activation_count || 0) + 1;
            rel.strength = Math.min(1.0, rel.strength + 0.05);
          }
        }
      } else {
        // 创建新关系
        card.relationships.related_chunks.push({
          target_id: coId,
          strength: 0.5,
          confidence: 0.6,
          created_at: new Date().toISOString(),
          co_activation_count: 1,
          version: 1
        });

        console.log(`[Activation] Created new relation: ${card.chunk_id} ↔ ${coId} (co-activation)`);
      }
    }
  }
}
```

### 2.5 遗忘与修剪

**文件**: `src/core/forgetting-manager.js` (新建)

```javascript
class ForgettingManager {
  constructor(memoryDB) {
    this.memoryDB = memoryDB;
  }

  /**
   * 执行遗忘与修剪
   * 定期运行（例如每周一次）
   */
  async performForgetting() {
    const allCards = await this.memoryDB.getAllChunks();

    console.log(`[Forgetting] Analyzing ${allCards.length} cards for pruning...`);

    let prunedCount = 0;
    let weakenedCount = 0;

    for (const card of allCards) {
      const decayFactor = this.calculateDecayFactor(card);
      card.decay_factor = decayFactor;

      // 标记过时
      if (decayFactor < 0.1 && card.activation_count < 2) {
        card.obsolete = true;
        prunedCount++;
        console.log(`[Forgetting] Marked card as obsolete: ${card.chunk_id}`);
      }

      // 弱化低使用关系
      weakenedCount += this.weakenUnusedRelations(card);
    }

    await this.memoryDB.saveChunks(allCards);

    console.log(`[Forgetting] ✅ Pruned ${prunedCount} cards, weakened ${weakenedCount} relations`);
  }

  calculateDecayFactor(card) {
    const now = Date.now();
    const lastActivated = new Date(card.last_activated || card.created_at).getTime();
    const daysSinceActivation = (now - lastActivated) / (1000 * 60 * 60 * 24);

    // 每 30 天衰减到一半
    const halfLife = 30;
    return Math.pow(0.5, daysSinceActivation / halfLife);
  }

  weakenUnusedRelations(card) {
    let weakenedCount = 0;

    for (const relType in card.relationships) {
      const rels = card.relationships[relType];

      for (let i = rels.length - 1; i >= 0; i--) {
        const rel = rels[i];

        if (typeof rel === 'object' && rel.strength !== undefined) {
          // 如果关系很久没有共同激活，减弱
          if ((rel.co_activation_count || 0) === 0) {
            rel.strength = Math.max(0.1, rel.strength - 0.1);
            weakenedCount++;

            // 如果强度过低，删除
            if (rel.strength < 0.2) {
              rels.splice(i, 1);
            }
          }
        }
      }
    }

    return weakenedCount;
  }
}
```

---

## 阶段 3: 集成到现有流程

### 3.1 修改 Memory Storage Handler

**文件**: `src/features/memory-storage/memory-storage-handler.js`

在保存新 chunks 时：

```javascript
// 初始化为临时层
for (const chunk of chunkSchemas) {
  chunk.layer = 'temporary';
  chunk.confidence = 0.5;  // 默认中等置信度
  chunk.activation_count = 0;
  chunk.activation_weight = 0;
  chunk.version = 1;
  chunk.decay_factor = 1.0;
  chunk.obsolete = false;
  chunk.last_updated = new Date().toISOString();
}

// 计算惊奇度
const surpriseDetector = new SurpriseDetector();
const existingCards = await memoryDB.getAllChunks();

for (const chunk of chunkSchemas) {
  chunk.surprise = await surpriseDetector.calculateSurprise(chunk, existingCards);
  console.log(`[MemoryStorage] New card surprise: ${chunk.surprise.toFixed(2)}`);
}

// 计算置信度
const confidenceCalc = new ConfidenceCalculator();
for (const chunk of chunkSchemas) {
  chunk.confidence = confidenceCalc.calculateConfidence(chunk, { sourceReliability: 0.7 });
}
```

### 3.2 修改 Memory Retrieval

**文件**: `src/features/memory-retrieval/memory-retrieval.js`

检索时记录激活：

```javascript
async function retrieveRelevantKnowledge(queryText, config, topK = 3) {
  const results = await performRetrieval(queryText, topK);

  // 记录激活
  const activationTracker = new ActivationTracker(memoryDB);
  const retrievedIds = results.map(r => r.chunk_id);

  for (const chunkId of retrievedIds) {
    await activationTracker.recordActivation(
      chunkId,
      retrievedIds.filter(id => id !== chunkId)  // 共同激活的其他 chunks
    );
  }

  return results;
}
```

### 3.3 添加后台任务

**文件**: `src/background.js`

定期运行稳定性评估和遗忘：

```javascript
// 每小时评估一次临时层卡片
setInterval(async () => {
  const stabilityManager = new StabilityManager(memoryDB);
  await stabilityManager.evaluateTemporaryCards();
}, 60 * 60 * 1000);  // 1 hour

// 每周执行一次遗忘与修剪
setInterval(async () => {
  const forgettingManager = new ForgettingManager(memoryDB);
  await forgettingManager.performForgetting();
}, 7 * 24 * 60 * 60 * 1000);  // 7 days
```

---

## 阶段 4: UI 更新

### 4.1 Knowledge Graph 可视化

显示卡片层级和状态：

```javascript
// 不同颜色表示不同层
const nodeColor = card.layer === 'stable'
  ? '#4CAF50'  // 绿色：稳定层
  : '#FFC107';  // 黄色：临时层

// 节点大小反映激活权重
const nodeSize = 10 + card.activation_weight * 20;

// 边的粗细反映关系强度
const edgeWidth = relation.strength * 5;
```

### 4.2 Manager 界面

添加过滤器：

```html
<select id="layer-filter">
  <option value="all">All Layers</option>
  <option value="temporary">Temporary Layer</option>
  <option value="stable">Stable Layer</option>
</select>

<select id="confidence-filter">
  <option value="all">All Confidence</option>
  <option value="high">High (> 0.7)</option>
  <option value="medium">Medium (0.4-0.7)</option>
  <option value="low">Low (< 0.4)</option>
</select>
```

---

## 阶段 5: 测试与优化

### 5.1 测试场景

1. **新知识导入** → 检查惊奇度计算是否准确
2. **重复导入** → 检查是否正确识别为低惊奇
3. **矛盾知识** → 检查是否正确标记高惊奇
4. **频繁检索** → 检查激活权重是否增加
5. **长期不用** → 检查是否正确衰减/修剪
6. **稳定性迁移** → 检查临时→稳定的迁移是否合理

### 5.2 性能优化

- 惊奇度计算缓存
- 批量激活记录
- 延迟稳定性评估（不阻塞主线程）

---

## 风险与挑战

### 挑战 1: 数据迁移

**问题**: 现有用户的数据需要迁移到新结构

**解决方案**:
- 自动为所有现有 chunks 添加默认字段
- 所有现有 chunks 默认为 stable layer（假设它们已稳定）
- 提供迁移脚本

### 挑战 2: 关系格式变更

**问题**: 关系从简单数组变为对象数组

**解决方案**:
- 兼容旧格式（string）和新格式（object）
- 渐进式迁移：读取时转换，写入时使用新格式

### 挑战 3: 性能影响

**问题**: 惊奇度/置信度计算可能很慢

**解决方案**:
- 异步后台处理
- 批处理
- 增量更新

---

## 时间表（建议）

| 阶段 | 任务 | 预计时间 |
|------|------|---------|
| 1 | 数据结构扩展 + 数据库升级 | 1-2 天 |
| 2 | 核心机制实现（惊奇、置信、稳定性） | 3-4 天 |
| 3 | 集成到现有流程 | 2-3 天 |
| 4 | UI 更新 | 1-2 天 |
| 5 | 测试与优化 | 2-3 天 |

**总计**: 9-14 天

---

## 下一步

请确认：

1. ✅ 是否接受这个迁移计划？
2. ✅ 优先级顺序是否合理？
3. ✅ 是否有需要调整的部分？

确认后，我将开始实施**阶段 1: 数据结构扩展**。
