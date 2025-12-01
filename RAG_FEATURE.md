# AutoFeel RAG 功能说明

> **RAG (Retrieval-Augmented Generation)** - 检索增强生成功能已集成到 Option+V 表单自动填充中

---

## 🎯 功能概述

AutoFeel 现在在 **Option+V** 表单自动填充功能中集成了完整的 RAG 系统，可以从你的个人知识库中智能检索相关信息，提供更准确、更个性化的表单填充结果。

### 工作原理

```
┌─────────────────────────────────────────────────────────────┐
│                    Option+V 按下                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
          ┌───────────────────────────────┐
          │  1. 检测表单字段              │
          │     • 收集所有标签和占位符     │
          └──────────┬────────────────────┘
                     │
                     ▼
          ┌───────────────────────────────┐
          │  2. 构建检索查询              │
          │     • 合并字段信息为查询文本   │
          └──────────┬────────────────────┘
                     │
                     ▼
          ┌───────────────────────────────┐
          │  3. 生成 Query Embedding      │
          │     • 调用 OpenAI API         │
          │     • text-embedding-3-small  │
          └──────────┬────────────────────┘
                     │
                     ▼
          ┌───────────────────────────────┐
          │  4. 语义搜索知识库            │
          │     • memoryDB.semanticSearch │
          │     • 余弦相似度计算          │
          │     • Top-5 最相关 chunks     │
          └──────────┬────────────────────┘
                     │
                     ▼
          ┌───────────────────────────────┐
          │  5. 构建 RAG Prompt           │
          │     • 包装检索结果            │
          │     • 添加相似度标注          │
          │     • 来源信息追踪            │
          └──────────┬────────────────────┘
                     │
                     ▼
          ┌───────────────────────────────┐
          │  6. 调用 LLM 生成答案         │
          │     • 优先使用检索到的知识     │
          │     • 结合上下文理解          │
          └──────────┬────────────────────┘
                     │
                     ▼
          ┌───────────────────────────────┐
          │  7. 自动填充表单              │
          │     • 显示检索统计信息         │
          └───────────────────────────────┘
```

---

## 📋 使用步骤

### 前提条件

1. **配置 API**：Extension 设置中配置 OpenAI API Key
   - 打开 Extension popup
   - 选择 "OpenAI" 作为 LLM Provider
   - 输入 API Key 并保存

2. **建立知识库**：使用 Option+C 保存相关页面
   - 在包含个人信息的页面（如简历、个人介绍等）按 **Option+C**
   - 系统会自动进行 LLM 清洗、语义分块、向量嵌入
   - 保存到 IndexedDB 本地知识库

### 使用 RAG 功能填充表单

1. **打开需要填写的表单页面**
2. **按 Option+V**
3. **查看通知信息**：
   ```
   Found 5 fields. Retrieving from knowledge base...
   Form filled successfully! [RAG: Retrieved 5 chunks, top relevance 87%] (1,234 tokens)
   ```

---

## 🔍 RAG 工作流程详解

### Step 1: 构建查询文本

```javascript
// 从表单字段提取查询信息
const queryText = formFields.map(field =>
  `${field.label || ''} ${field.placeholder || ''}`
).filter(text => text.trim()).join(' ');

// 示例查询：
// "Name Email Phone Number Company Current Position"
```

### Step 2: 生成 Query Embedding

```javascript
const queryEmbedding = await generateEmbedding(queryText, config);
// 返回 1536 维向量 (text-embedding-3-small)
```

### Step 3: 语义搜索

```javascript
await memoryDB.init();
const searchResults = await memoryDB.semanticSearch(queryEmbedding, 5);

// 返回格式：
[
  {
    chunk_id: "abc123",
    text: "John Doe works at Acme Corp as Senior Engineer...",
    similarity: 0.87,
    source: {
      title: "LinkedIn Profile - John Doe",
      url: "https://linkedin.com/in/johndoe"
    },
    metadata: { word_count: 150 }
  },
  // ... 更多 chunks
]
```

### Step 4: 构建 RAG Prompt

检索到的知识被格式化为结构化上下文：

```
=== RETRIEVED KNOWLEDGE FROM USER'S KNOWLEDGE BASE ===

[Retrieved Knowledge 1] (Relevance: 87.0%)
Source: LinkedIn Profile - John Doe
Content: John Doe is a Senior Software Engineer at Acme Corporation...

[Retrieved Knowledge 2] (Relevance: 82.3%)
Source: Resume PDF
Content: Contact: john.doe@email.com, Phone: +1-555-0123...

=== CONTEXT FROM PREVIOUS PAGE ===
[之前保存的页面内容]

=== FORM FIELDS TO FILL ===
Field 0 (ID: field_0):
  Label: Full Name
  Type: text
...
```

### Step 5: LLM 生成答案

System Prompt 明确指示优先级：

```
You are an AI assistant that helps fill out forms based on provided information.

**Prioritize information from the retrieved knowledge base when available**,
as it represents the user's curated information.
```

---

## 📊 检索统计信息

RAG 系统会在成功消息中显示检索统计：

| 指标 | 说明 | 示例 |
|------|------|------|
| **totalChunks** | 检索到的相关片段数量 | 5 chunks |
| **topSimilarity** | 最高相似度得分 | 87% |
| **avgSimilarity** | 平均相似度得分 | 79.4% |

通知格式：
```
Form filled successfully! [RAG: Retrieved 5 chunks, top relevance 87%] (1,234 tokens)
```

---

## 🎨 优势特性

### 1. **智能优先级**
- ✅ 知识库内容 > 当前页面上下文
- ✅ 高相似度片段优先使用
- ✅ 多源信息综合判断

### 2. **透明可追溯**
- ✅ 显示检索来源（文档标题 + URL）
- ✅ 标注相似度得分
- ✅ Console 日志详细记录检索过程

### 3. **自动降级**
- ✅ 知识库为空时，使用传统填充方式
- ✅ Embedding 失败时，跳过 RAG 步骤
- ✅ 不影响核心功能稳定性

### 4. **性能优化**
- ✅ Top-5 检索限制，避免过长 prompt
- ✅ 本地 IndexedDB，无网络延迟
- ✅ 余弦相似度计算高效

---

## 🛠️ 技术架构

### 数据流

```
Form Fields → Query Builder → OpenAI Embedding API
                                      ↓
                              1536-dim Vector
                                      ↓
                    IndexedDB (memory_chunks table)
                                      ↓
                        Cosine Similarity Search
                                      ↓
                         Top-5 Relevant Chunks
                                      ↓
                            RAG Prompt Builder
                                      ↓
                              LLM (GPT-4/Claude)
                                      ↓
                            Form Answers (JSON)
```

### 核心函数

| 函数 | 位置 | 功能 |
|------|------|------|
| `generateFormAnswers()` | background.js:549 | RAG 主流程 |
| `generateEmbedding()` | background.js:795 | 生成 embedding |
| `semanticSearch()` | db.js:236 | 语义搜索 |
| `cosineSimilarity()` | db.js:272 | 余弦相似度计算 |

---

## 🔧 配置选项

### 检索参数

当前配置（可在代码中调整）：

```javascript
// background.js:574
const searchResults = await memoryDB.semanticSearch(queryEmbedding, 5); // Top-5

// 可调整为：
// Top-3: 更精准，但信息可能不足
// Top-10: 更全面，但 prompt 更长
```

### Embedding 模型

```javascript
// background.js:817
model: 'text-embedding-3-small' // 1536 dimensions, cost-effective

// 可选：
// text-embedding-3-large: 3072 dimensions, 更高精度
// text-embedding-ada-002: 1536 dimensions, 旧版模型
```

---

## 📈 使用建议

### 建立高质量知识库

1. **保存关键页面**：
   - ✅ LinkedIn 个人资料
   - ✅ 在线简历
   - ✅ 公司介绍页面
   - ✅ 项目经验总结

2. **避免无关内容**：
   - ❌ 新闻文章
   - ❌ 纯导航页面
   - ❌ 广告内容

3. **定期维护**：
   - 使用 Knowledge Manager 查看已保存内容
   - 删除过时信息
   - 补充最新经历

### 最佳实践

1. **先保存，后填充**：
   - 在填表前，先使用 Option+C 保存包含相关信息的页面
   - 等待 LLM 处理完成（看到"Successfully saved"通知）

2. **查看 Console 日志**：
   - 打开 DevTools → Console
   - 查看 `[AutoFeel RAG]` 日志
   - 了解检索过程和相似度得分

3. **多次迭代**：
   - 如果首次填充不理想，补充更多相关页面到知识库
   - 重新尝试 Option+V

---

## 🐛 故障排查

### 问题：没有检索到相关内容

**可能原因**：
1. 知识库为空 - 使用 Option+C 保存相关页面
2. 查询与知识库内容不匹配 - 检查表单字段标签是否清晰
3. Provider 不支持 - 确保使用 OpenAI provider

**解决方案**：
```javascript
// 查看 Console 日志
[AutoFeel RAG] No relevant chunks found in knowledge base

// 解决步骤：
1. 打开 Knowledge Manager (popup → 📚 Knowledge Manager)
2. 查看已保存文档数量
3. 如果为空，使用 Option+C 保存相关页面
```

### 问题：检索相似度太低

**可能原因**：
1. 保存的内容与表单主题不相关
2. 表单字段标签不够清晰

**解决方案**：
- 查看 retrievalStats 中的 topSimilarity
- 如果 < 50%，可能需要保存更相关的内容
- 如果 > 80%，检索结果通常很可靠

### 问题：Anthropic provider 不支持 RAG

**说明**：
- Anthropic Claude 不支持 embedding API
- RAG 功能会自动跳过
- 仍会使用传统的上下文填充方式

**解决方案**：
- 切换到 OpenAI provider
- 或保持使用 Anthropic，但没有 RAG 增强

---

## 📝 Console 日志示例

成功的 RAG 检索：

```
[AutoFeel RAG] Query text: Name Email Phone Number Company Position
[AutoFeel RAG] Generated query embedding, dimensions: 1536
[AutoFeel RAG] Found 5 relevant chunks
[AutoFeel RAG] Retrieval stats: {
  totalChunks: 5,
  avgSimilarity: "0.794",
  topSimilarity: "0.870"
}
```

---

## 🚀 未来优化方向

1. **混合检索**：结合语义搜索和关键词匹配
2. **用户反馈**：允许用户标记填充质量，优化检索策略
3. **多模态检索**：支持从图片（如简历截图）中提取信息
4. **智能缓存**：对常见查询缓存检索结果
5. **检索可视化**：在 UI 中显示检索到的来源文档

---

## 📚 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 完整系统架构
- [db.js](./src/db.js) - IndexedDB 数据库实现
- [background.js](./src/background.js) - RAG 主逻辑

---

**版本**: v0.2.0
**最后更新**: 2025-12-01
**作者**: AutoFeel Team
