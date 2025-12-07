# 知识图谱关系分析详解

**文档版本**: 1.0
**最后更新**: 2025-12-07

本文档详细解释 AutoFeel 如何发现和建立 chunks 之间的关系。

---

## 📋 目录

1. [概述](#概述)
2. [完整流程图](#完整流程图)
3. [第一步：相似度预过滤](#第一步相似度预过滤)
4. [第二步：LLM 关系分析](#第二步llm-关系分析)
5. [第三步：符号 ID 转换](#第三步符号-id-转换)
6. [第四步：关系验证与过滤](#第四步关系验证与过滤)
7. [第五步：关系图构建](#第五步关系图构建)
8. [批处理机制](#批处理机制)
9. [配置参数](#配置参数)
10. [常见问题与调试](#常见问题与调试)

---

## 概述

### 什么是关系分析？

关系分析是将独立的 chunks（知识块）连接成知识图谱的过程。通过发现 chunks 之间的语义关系，AutoFeel 可以：

- 理解知识的层次结构
- 发现矛盾和冲突
- 建立前置依赖关系
- 支持更智能的知识检索

### 核心设计理念

1. **混合方法**：结合算法预过滤（快速、便宜）+ LLM 分析（准确、昂贵）
2. **批处理**：避免单次 LLM 调用的 token 超限
3. **跨文档**：不限制在同一文档内，支持全局知识图谱
4. **可配置**：通过阈值和参数调优性能与成本

---

## 完整流程图

```
用户点击 "Re-analyze All Relationships"
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│ 1. 初始化与准备                                             │
│                                                             │
│  • 从数据库加载所有 documents 和 chunks                      │
│  • 备份现有 relationships（防止数据丢失）                    │
│  • 清空所有 chunks 的 relationships 字段                     │
└────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│ 2. 批处理循环（每批最多 30 个 chunks）                       │
│                                                             │
│  对于每个 batch (例如 chunks 0-29):                         │
│    │                                                        │
│    ├─► 相似度预过滤 ────────────────────────────┐          │
│    │                                             │          │
│    │   对 batch 中的每个 chunk:                  │          │
│    │     • 与 ALL chunks 计算文本相似度           │          │
│    │     • 过滤掉相似度 < 0.05 的                │          │
│    │     • 取前 10 个最相似的                    │          │
│    │     • 加入候选集                            │          │
│    │                                             │          │
│    ▼◄────────────────────────────────────────────┘          │
│    LLM 分析候选关系                                         │
│    │                                                        │
│    ├─► 构建 prompt 发送给 LLM                               │
│    ├─► LLM 返回关系列表（JSON）                             │
│    ├─► 符号 ID 转换（B0 → chunk_id）                       │
│    ├─► 验证过滤（去除无效、自环）                           │
│    └─► 建立双向关系                                        │
└────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│ 3. 保存与完成                                               │
│                                                             │
│  • 检查：如果找到 0 个关系且原有关系 > 0，恢复备份          │
│  • 保存所有更新后的 chunks 到数据库                         │
│  • 记录决策日志                                             │
│  • 刷新知识图谱可视化                                       │
└────────────────────────────────────────────────────────────┘
```

---

## 第一步：相似度预过滤

### 为什么需要预过滤？

如果直接把所有 chunks 发送给 LLM 分析，会导致：
- **Token 成本过高**：15 个 chunks 之间有 105 种配对（15×14/2）
- **上下文超限**：LLM 有 token 限制（如 GPT-4 的 8k/128k）
- **响应缓慢**：大量文本处理时间长

**解决方案**：先用快速算法找到"可能相关"的候选，再用 LLM 精确分析。

### 算法实现

**文件位置**：`src/core/decision-agent.js` (line 954-1022)

```javascript
// 配置参数
const SIMILARITY_THRESHOLD = 0.05;  // 相似度阈值
const TOP_N_SIMILAR = 10;           // 每个 chunk 保留前 N 个相似的

const candidateChunks = new Map();  // 候选集合

// 对当前 batch 中的每个 chunk
for (const batchChunk of batchChunks) {
  const similarities = [];

  // 与 ALL chunks 计算相似度
  for (const otherChunk of allChunks) {
    // 跳过自己
    if (batchChunk.chunk_id === otherChunk.chunk_id) continue;

    // 计算文本相似度（算法见下方）
    const similarity = calculateTextSimilarity(
      batchChunk.text,
      otherChunk.text
    );

    // 只保留超过阈值的
    if (similarity > SIMILARITY_THRESHOLD) {
      similarities.push({ chunk: otherChunk, similarity });
    }
  }

  // 排序并取前 N 个
  similarities.sort((a, b) => b.similarity - a.similarity);
  const topSimilar = similarities.slice(0, TOP_N_SIMILAR);

  // 加入候选集
  for (const { chunk } of topSimilar) {
    candidateChunks.set(chunk.chunk_id, chunk);
  }
}
```

### 相似度计算算法

**文件位置**：`src/core/db.js` (calculateTextSimilarity 方法)

使用 **Jaccard 相似度**（基于词集合的重叠度）：

```javascript
calculateTextSimilarity(text1, text2) {
  // 1. 分词（简单空格分割）
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  // 2. 计算交集和并集
  const intersection = new Set(
    [...words1].filter(word => words2.has(word))
  );
  const union = new Set([...words1, ...words2]);

  // 3. Jaccard 系数 = |交集| / |并集|
  return intersection.size / union.size;
}
```

**示例**：

```
text1 = "machine learning is a branch of AI"
text2 = "deep learning is part of machine learning"

words1 = {machine, learning, is, a, branch, of, ai}
words2 = {deep, learning, is, part, of, machine, learning}

交集 = {machine, learning, is, of} → 4 个词
并集 = {machine, learning, is, a, branch, of, ai, deep, part} → 9 个词

相似度 = 4 / 9 ≈ 0.44
```

### 预过滤结果

假设有 15 个 chunks：

```
Chunk A: "机器学习是人工智能的一个分支"
Chunk B: "深度学习使用神经网络"
Chunk C: "机器学习可以从数据中学习规律"
...

对于 Chunk A:
  - 与 Chunk C 的相似度 = 0.38 ✅ (包含 "机器学习")
  - 与 Chunk B 的相似度 = 0.12 ✅ (包含 "学习")
  - 与 Chunk D 的相似度 = 0.02 ❌ (几乎无共同词)
  ...

取前 10 个最相似的 → 候选集
```

**日志输出**：
```
[Decision Agent] 📊 Pre-filtered: 14 candidate chunks from 15 total
[Decision Agent] 📊 Batch size: 15, Candidates: 14
```

---

## 第二步：LLM 关系分析

### LLM 的角色

LLM 负责**语义理解**，判断 chunks 之间的深层关系：

- 算法只能看到词的重叠，LLM 能理解同义词、上下文
- 算法无法判断关系类型（related/elaborates/contradicts），LLM 可以
- LLM 可以评估关系强度（strength: 0-1）

### Prompt 构建

**文件位置**：`src/core/decision-agent.js` (line 1024-1070)

#### 系统 Prompt

```
You are a knowledge graph relationship analyzer. Find semantic relationships between chunks.

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

IMPORTANT: Return ONLY valid JSON.
```

#### 用户 Prompt

```
=== CHUNKS TO ANALYZE ===
B0: [concept] 机器学习是人工智能的一个重要分支，它使计算机能够从数据中学习规律...
B1: [fact] 深度学习是机器学习的一个子领域，主要使用多层神经网络...
...

=== OTHER CHUNKS IN KNOWLEDGE BASE ===
O0: [definition] 人工智能（AI）是计算机科学的一个分支...
O1: [example] 监督学习需要标注数据来训练模型...
...

Find meaningful relationships between these chunks.
```

### 符号 ID 系统

为了减少 token 使用，使用简短的符号 ID：

- **B0, B1, B2, ...**: Batch chunks（当前批次正在分析的 chunks）
- **O0, O1, O2, ...**: Other chunks（候选 chunks，来自相似度过滤）

**映射关系**：
```javascript
batchChunks = [chunk_a, chunk_b, chunk_c, ...];  // 索引 0, 1, 2
otherChunks = [chunk_x, chunk_y, chunk_z, ...];  // 索引 0, 1, 2

B0 → batchChunks[0] → chunk_a
B1 → batchChunks[1] → chunk_b
O0 → otherChunks[0] → chunk_x
O5 → otherChunks[5] → chunk_? (可能不存在！)
```

### LLM 响应示例

```json
{
  "relationships": [
    {
      "from": "B0",
      "to": "O2",
      "type": "related",
      "strength": 0.9,
      "reason": "Both discuss machine learning fundamentals"
    },
    {
      "from": "B1",
      "to": "B0",
      "type": "elaborates",
      "strength": 0.85,
      "reason": "Deep learning elaborates on machine learning"
    },
    {
      "from": "B2",
      "to": "O1",
      "type": "supports",
      "strength": 0.7,
      "reason": "Example supports the concept"
    }
  ],
  "chunkTypes": [
    {"id": "B0", "type": "concept"},
    {"id": "B1", "type": "concept"},
    {"id": "B2", "type": "example"}
  ]
}
```

---

## 第三步：符号 ID 转换

### 转换过程

**文件位置**：`src/core/decision-agent.js` (line 1102-1132)

```javascript
const relationships = (analysis.relationships || []).map(rel => {
  let fromChunk, toChunk;

  // 解析 from ID
  if (rel.from.startsWith('B')) {
    const index = parseInt(rel.from.substring(1));  // "B0" → 0
    fromChunk = batchChunks[index];
  } else if (rel.from.startsWith('O')) {
    const index = parseInt(rel.from.substring(1));  // "O2" → 2
    fromChunk = otherChunks[index];
  }

  // 解析 to ID
  if (rel.to.startsWith('B')) {
    const index = parseInt(rel.to.substring(1));
    toChunk = batchChunks[index];
  } else if (rel.to.startsWith('O')) {
    const index = parseInt(rel.to.substring(1));
    toChunk = otherChunks[index];
  }

  // 转换为实际的 chunk_id
  return {
    from: fromChunk?.chunk_id,  // UUID
    to: toChunk?.chunk_id,      // UUID
    type: rel.type,
    strength: rel.strength || 0.5
  };
});
```

### 可能的失败情况

❌ **索引越界**：
```javascript
batchChunks.length = 15;  // 索引 0-14
LLM 返回: "from": "B15"   // 不存在！

fromChunk = batchChunks[15];  // → undefined
result.from = undefined;       // → 关系无效
```

❌ **错误的前缀**：
```javascript
LLM 返回: "from": "C0"    // 既不是 B 也不是 O

fromChunk = undefined;     // 没有匹配的 if 分支
result.from = undefined;   // → 关系无效
```

### 诊断日志

```javascript
if (!fromChunk) {
  console.warn(`⚠️ Failed to find fromChunk for ID: ${rel.from}
                (batch size: ${batchChunks.length},
                 candidates: ${otherChunks.length})`);
}
```

**输出示例**：
```
⚠️ Failed to find fromChunk for ID: B15 (batch size: 15, candidates: 14)
```

---

## 第四步：关系验证与过滤

### 过滤规则

**文件位置**：`src/core/decision-agent.js` (line 1133-1139)

```javascript
const validRelationships = relationships.filter(r => {
  // 规则 1: from 必须存在（不是 undefined）
  if (!r.from) return false;

  // 规则 2: to 必须存在（不是 undefined）
  if (!r.to) return false;

  // 规则 3: 禁止自环（chunk 指向自己）
  if (r.from === r.to) return false;

  return true;  // 通过所有验证
});
```

### 过滤示例

假设 LLM 返回了 15 个关系：

| # | from | to   | from存在? | to存在? | 自环? | 结果 |
|---|------|------|----------|---------|------|------|
| 1 | B0   | O2   | ✅       | ✅      | ❌   | ✅ **通过** |
| 2 | B1   | B0   | ✅       | ✅      | ❌   | ✅ **通过** |
| 3 | B2   | O15  | ✅       | ❌ 索引越界 | ❌ | ❌ 过滤掉 |
| 4 | B5   | B5   | ✅       | ✅      | ✅ 自环 | ❌ 过滤掉 |
| 5 | B20  | O1   | ❌ 索引越界 | ✅    | ❌   | ❌ 过滤掉 |
| ... | ... | ... | ... | ... | ... | ... |

**最终结果**：15 个关系 → 只有 1-2 个通过验证

### 诊断日志

```javascript
if (!valid) {
  console.warn(`⚠️ Filtered out relationship: ${r._debug.fromId} -> ${r._debug.toId}
                (from: ${r.from ? 'OK' : 'MISSING'},
                 to: ${r.to ? 'OK' : 'MISSING'},
                 self-loop: ${r.from === r.to})`);
}
```

**输出示例**：
```
⚠️ Filtered out relationship: B2 -> O15 (from: OK, to: MISSING, self-loop: false)
⚠️ Filtered out relationship: B5 -> B5 (from: OK, to: OK, self-loop: true)
```

---

## 第五步：关系图构建

### 双向关系处理

**文件位置**：`src/core/decision-agent.js` (line 682-741)

某些关系类型需要建立**双向连接**：

#### 关系类型映射

| LLM 返回类型 | 关系 A | 关系 B（反向） | 说明 |
|-------------|--------|---------------|------|
| `related` | A.related_chunks ← B | B.related_chunks ← A | ❌ 当前未实现双向 |
| `elaborates` | A.child_chunks ← B | B.parent_chunks ← A | ✅ 双向 |
| `contradicts` | A.contradicts ← B | B.contradicts ← A | ❌ 当前未实现双向 |
| `supports` | A.supports ← B | _(无反向)_ | ❌ 单向 |
| `prerequisite` | A.prerequisite_of ← B | B.requires ← A | ✅ 双向 |

### 建立关系代码

```javascript
for (const rel of relationships) {
  const fromChunk = chunks.find(c => c.chunk_id === rel.from);
  const toChunk = chunks.find(c => c.chunk_id === rel.to);

  if (!fromChunk || !toChunk) continue;

  switch (rel.type) {
    case 'related':
      // 单向添加
      if (!fromChunk.relationships.related_chunks.includes(rel.to)) {
        fromChunk.relationships.related_chunks.push(rel.to);
      }
      break;

    case 'elaborates':
      // 双向添加
      // from "详述了" to → from.child_chunks, to.parent_chunks
      if (!fromChunk.relationships.child_chunks.includes(rel.to)) {
        fromChunk.relationships.child_chunks.push(rel.to);
      }
      if (!toChunk.relationships.parent_chunks.includes(rel.from)) {
        toChunk.relationships.parent_chunks.push(rel.from);
      }
      break;

    case 'prerequisite':
      // 双向添加
      // from 是 to 的前置 → from.prerequisite_of, to.requires
      if (!fromChunk.relationships.prerequisite_of.includes(rel.to)) {
        fromChunk.relationships.prerequisite_of.push(rel.to);
      }
      if (!toChunk.relationships.requires.includes(rel.from)) {
        toChunk.relationships.requires.push(rel.from);
      }
      break;

    // ... 其他类型
  }
}
```

### 关系数据结构

每个 chunk 的 `relationships` 字段：

```javascript
{
  chunk_id: "uuid-123",
  text: "机器学习是...",
  relationships: {
    related_chunks: ["uuid-456", "uuid-789"],      // 相关的 chunks
    parent_chunks: ["uuid-abc"],                   // 我详述了谁
    child_chunks: ["uuid-def", "uuid-ghi"],        // 谁详述了我
    contradicts: [],                               // 与我矛盾的
    supports: ["uuid-jkl"],                        // 支持我的
    prerequisite_of: ["uuid-mno"],                 // 我是谁的前置
    requires: ["uuid-pqr"]                         // 我需要谁作为前置
  }
}
```

### 去重逻辑

```javascript
if (!fromChunk.relationships.related_chunks.includes(rel.to)) {
  fromChunk.relationships.related_chunks.push(rel.to);
}
```

**为什么需要？**
- 同一个关系可能被多个批次重复发现
- 避免数组中出现重复的 chunk_id

---

## 批处理机制

### 为什么需要批处理？

假设有 100 个 chunks：

- **不分批**：一次性分析 100 个 chunks
  - Prompt 大小 ≈ 100 × 150 tokens = 15,000 tokens
  - 可能超过 LLM 上下文限制
  - 响应时间长（30-60 秒）
  - 一次失败就全部失败

- **分批（每批 30 个）**：分 4 批处理
  - 每批 Prompt 大小 ≈ 30 × 150 tokens = 4,500 tokens ✅
  - 可以显示进度
  - 一批失败不影响其他批次

### 批处理参数

**文件位置**：`src/core/decision-agent.js` (line 846)

```javascript
const BATCH_SIZE = 30;  // 每批最多 30 个 chunks

for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
  const batch = allChunks.slice(i, Math.min(i + BATCH_SIZE, allChunks.length));

  // 分析这一批...
}
```

### 批次划分示例

**15 个 chunks，BATCH_SIZE = 30**：
```
Batch 1: chunks[0:15]  → 所有 15 个在同一批
```

**50 个 chunks，BATCH_SIZE = 30**：
```
Batch 1: chunks[0:30]   → 30 个
Batch 2: chunks[30:50]  → 20 个
```

### 进度回调

```javascript
if (progressCallback) {
  progressCallback({
    current: i,
    total: allChunks.length,
    message: `Analyzing chunks ${i + 1}-${Math.min(i + BATCH_SIZE, allChunks.length)}...`
  });
}
```

**日志输出**：
```
[Background] Re-analysis progress: 0/50
[Background] Re-analysis progress: 30/50
```

---

## 配置参数

### 可调参数表

| 参数名 | 位置 | 默认值 | 说明 | 影响 |
|-------|------|-------|------|------|
| `SIMILARITY_THRESHOLD` | decision-agent.js:958 | 0.05 | 相似度阈值 | 越低 → 候选越多 → token 越贵 |
| `TOP_N_SIMILAR` | decision-agent.js:959 | 10 | 每个 chunk 保留前 N 个相似的 | 越大 → 关系越多 → token 越贵 |
| `BATCH_SIZE` | decision-agent.js:846 | 30 | 每批处理的 chunks 数量 | 越大 → 速度越快 → 但可能超 token 限制 |

### 参数调优建议

#### 场景 1: 找不到关系（0 relationships）

**问题诊断**：
```
📊 Pre-filtered: 0 candidate chunks from 15 total
⚠️ No candidate chunks found after similarity filtering.
📊 Max similarity found in this batch: 0.038
```

**解决方案**：降低 `SIMILARITY_THRESHOLD`
```javascript
const SIMILARITY_THRESHOLD = 0.01;  // 从 0.05 降到 0.01
```

#### 场景 2: Token 超限

**问题诊断**：
```
❌ LLM API error: 400 Bad Request
Error: maximum context length exceeded
```

**解决方案 A**：减小 `BATCH_SIZE`
```javascript
const BATCH_SIZE = 15;  // 从 30 降到 15
```

**解决方案 B**：减小 `TOP_N_SIMILAR`
```javascript
const TOP_N_SIMILAR = 5;  // 从 10 降到 5
```

#### 场景 3: 成本过高

**问题诊断**：每次 re-analysis 花费太多 tokens

**解决方案**：提高 `SIMILARITY_THRESHOLD`
```javascript
const SIMILARITY_THRESHOLD = 0.10;  // 从 0.05 提高到 0.10
// 候选减少 → prompt 更短 → 成本更低
```

---

## 常见问题与调试

### 问题 1: LLM 找到 15 个关系，但只有 1 个有效

**症状**：
```
📊 LLM found relationships: 15
✅ Returning 1 valid relationships
```

**可能原因**：

1. **索引越界** - LLM 返回了不存在的索引
   ```
   ⚠️ Failed to find toChunk for ID: O15 (batch size: 15, candidates: 14)
   ⚠️ Filtered out relationship: B2 -> O15 (from: OK, to: MISSING)
   ```

   **根本原因**：候选数组只有 14 个元素（索引 0-13），但 LLM 返回了 O15

   **解决方案**：
   - 改进 LLM prompt，明确告诉它索引范围
   - 或者在 prompt 中不显示索引，改用描述

2. **自环** - LLM 让 chunk 指向自己
   ```
   ⚠️ Filtered out relationship: B5 -> B5 (from: OK, to: OK, self-loop: true)
   ```

   **根本原因**：LLM 理解错误

   **解决方案**：在 system prompt 中明确禁止自环

3. **符号 ID 混淆** - LLM 返回了错误格式
   ```
   LLM 返回: "from": "Chunk0"  // 应该是 "B0"
   LLM 返回: "to": "other5"    // 应该是 "O5"
   ```

   **解决方案**：在 prompt 中强调 "MUST use exact IDs like B0, B1, O0, O1"

### 问题 2: 关系都在同一文档内，没有跨文档关系

**症状**：所有关系的 from 和 to 都来自同一个 doc_id

**可能原因**：

1. **相似度阈值太高** - 不同文档的 chunks 词汇重叠少
   ```
   同一文档内: "机器学习" vs "深度学习" → 相似度 0.25 ✅
   跨文档: "机器学习" vs "计算机视觉" → 相似度 0.08 ❌ (< 0.10)
   ```

2. **文档主题差异大** - 本来就没有关联

**解决方案**：
```javascript
const SIMILARITY_THRESHOLD = 0.03;  // 进一步降低阈值
```

### 问题 3: Re-analysis 清空了所有关系

**症状**：
```
📊 Found 12 existing relationships to backup
✅ Re-analysis complete: 0 relationships built
Stats: 0 relationships  ❌ (原来有 12 个)
```

**根本原因**：之前的代码在找到 0 个关系时仍然保存了空的 relationships

**解决方案**：最新代码已修复（自动恢复备份）
```javascript
if (totalRelationships === 0 && existingRelationshipCount > 0) {
  console.warn('⚠️ Restoring original relationships...');
  // 恢复备份...
}
```

### 问题 4: 无法找到候选 chunks

**症状**：
```
📊 Pre-filtered: 0 candidate chunks from 15 total
📊 Max similarity found: 0.382
```

**根本原因**：所有相似的 chunks 都在同一个 batch 中被过滤掉了（已修复）

**之前的错误代码**：
```javascript
// 排除同一 batch 中的 chunks
if (!batchChunks.find(b => b.chunk_id === chunk.chunk_id)) {
  candidateChunks.set(chunk.chunk_id, chunk);
}
// 结果：当 batch size = 30 > 总 chunks = 15 时，所有都被排除！
```

**修复后的代码**：
```javascript
// 直接添加，不排除同一 batch 的
candidateChunks.set(chunk.chunk_id, chunk);
```

### 调试技巧

#### 技巧 1: 查看完整的 LLM 响应

在 `decision-agent.js:1098` 添加：
```javascript
console.log('[Decision Agent] 📝 Full LLM response:', content);
```

#### 技巧 2: 查看所有被过滤的关系

已经添加的诊断日志会显示：
```
⚠️ Filtered out relationship: B0 -> O12 (from: OK, to: MISSING, self-loop: false)
```

#### 技巧 3: 查看相似度分布

在 `decision-agent.js:986` 添加：
```javascript
console.log('[Decision Agent] Similarities for current chunk:',
  similarities.map(s => s.similarity.toFixed(3)).join(', '));
```

输出：
```
[Decision Agent] Similarities: 0.382, 0.251, 0.189, 0.142, 0.098, ...
```

#### 技巧 4: 导出决策日志

决策日志存储在 `chrome.storage.local` 中：
```javascript
chrome.storage.local.get(['llmDecisionLogs'], (data) => {
  console.log(JSON.stringify(data.llmDecisionLogs, null, 2));
});
```

---

## 性能与成本

### Token 使用估算

假设：
- 15 个 chunks
- 每个 chunk 平均 100 个词
- Batch size = 30（所有 chunks 在一批）
- 每个 chunk 有 10 个候选

**Prompt 组成**：
```
System prompt:           ~200 tokens
Batch chunks (15):       15 × 30 = 450 tokens
Candidate chunks (14):   14 × 30 = 420 tokens
User instructions:       ~50 tokens
-------------------------------------------
Total input:             ~1,120 tokens

Response (15 relations): ~800 tokens
-------------------------------------------
Total:                   ~1,920 tokens
```

**成本（以 GPT-4o 为例）**：
- Input: 1,120 tokens × $2.5/1M = $0.0028
- Output: 800 tokens × $10/1M = $0.008
- **总计：$0.011 per re-analysis**

### 优化建议

1. **使用更便宜的模型**：
   - GPT-4o mini: $0.15/1M → 省 93%
   - Claude Haiku: $0.25/1M → 省 90%

2. **减少候选数量**：
   ```javascript
   const TOP_N_SIMILAR = 5;  // 从 10 降到 5
   // Token 减少约 40%
   ```

3. **提高阈值**：
   ```javascript
   const SIMILARITY_THRESHOLD = 0.10;  // 从 0.05 提高
   // 候选减少 → token 减少
   ```

4. **缓存机制**（未实现）：
   - 只重新分析新增或修改的 chunks
   - 保留已有的关系

---

## 附录

### 关系类型完整定义

| 类型 | 含义 | 方向性 | 双向字段 | 示例 |
|------|------|-------|---------|------|
| `related` | 语义相关 | 对称 | ❌ 仅单向 | "机器学习" ↔ "深度学习" |
| `elaborates` | 详述关系 | 有向 | ✅ parent ↔ child | "神经网络" ← "CNN详解" |
| `contradicts` | 矛盾冲突 | 对称 | ❌ 仅单向 | "地球是平的" ↔ "地球是圆的" |
| `supports` | 支持证据 | 有向 | ❌ 仅单向 | "实验结果" → "理论假设" |
| `prerequisite` | 前置依赖 | 有向 | ✅ prerequisite_of ↔ requires | "加法" → "乘法" |

### 文件清单

| 文件路径 | 功能 | 关键函数 |
|---------|------|---------|
| `src/core/decision-agent.js` | 关系分析核心逻辑 | `reanalyzeAllChunks`, `analyzeChunkBatchForRelationships`, `buildChunkRelationships` |
| `src/core/db.js` | 数据库操作 | `calculateTextSimilarity`, `saveChunks`, `getChunksByDocId` |
| `src/features/knowledge-graph/relationship-analyzer.js` | 关系分析入口 | `handleReanalyzeRelationships` |
| `src/background.js` | 消息路由 | 监听 `reanalyzeRelationships` 消息 |
| `src/pages/manager.js` | UI 触发 | `reanalyzeAllRelationships` |

### 相关文档

- [数据结构文档](./DATA_STRUCTURE.md) - 完整的数据库 schema
- [架构文档](../README.md) - 整体项目架构
- [验证报告](../VERIFICATION_REPORT.md) - 代码与文档一致性验证

---

**文档维护者**: Claude
**问题反馈**: 请在 GitHub Issues 中提交
