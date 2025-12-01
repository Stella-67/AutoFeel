# AutoFeel Knowledge Base - Architecture Documentation

> 轻量级个人 RAG 记忆系统 | Lightweight Personal RAG Memory System

---

## 📋 目录

- [系统概述](#系统概述)
- [核心架构](#核心架构)
- [技术栈](#技术栈)
- [数据流程](#数据流程)
- [组件详解](#组件详解)
- [数据模型](#数据模型)
- [文件结构](#文件结构)
- [使用指南](#使用指南)
- [扩展性设计](#扩展性设计)

---

## 系统概述

AutoFeel 是一个完整的**本地化 Personal RAG (Retrieval-Augmented Generation) 知识管理系统**，运行于 Chrome Extension 环境中，提供从网页内容采集、AI 清洗、语义分块、向量嵌入到知识检索的完整工作流。

### 核心特性

- ✅ **完全本地化**：所有数据存储在 IndexedDB，无需服务器
- ✅ **智能文本处理**：LLM 驱动的内容提取和结构化
- ✅ **语义分块**：AI 识别主题边界，非机械分割
- ✅ **向量检索**：支持语义搜索和模糊搜索
- ✅ **三栏式管理界面**：类似浏览器书签管理器的 UX
- ✅ **RAG 就绪**：完整的 document + chunk schema 设计

---

## 核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        AutoFeel KB System                        │
└─────────────────────────────────────────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌───────────────┐       ┌──────────────────┐      ┌──────────────┐
│  Content      │       │  Processing      │      │  Storage     │
│  Acquisition  │       │  Pipeline        │      │  Layer       │
└───────────────┘       └──────────────────┘      └──────────────┘
        │                         │                         │
        │                         │                         │
        ▼                         ▼                         ▼
┌───────────────┐       ┌──────────────────┐      ┌──────────────┐
│ • Alt+C       │       │ • LLM Cleaning   │      │ • IndexedDB  │
│ • Selection   │───────▶ • Post-Cleanup   │─────▶│ • Documents  │
│ • Full Page   │       │ • Semantic Chunk │      │ • Chunks     │
│ • Google Docs │       │ • Schema Build   │      │ • Embeddings │
└───────────────┘       │ • Vector Embed   │      └──────────────┘
                        └──────────────────┘              │
                                                          │
        ┌─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Knowledge Manager UI                         │
├──────────────┬──────────────────────┬────────────────────────────┤
│  Left Panel  │    Center Panel      │     Right Panel            │
│  (文档列表)  │    (文档预览)        │     (详细信息)             │
│              │                      │                            │
│ • 文档列表   │ • Raw Text           │ [Tabs]                     │
│ • 排序筛选   │ • Clean Text         │ • Chunks                   │
│ • 标记⭐     │ • Comparison         │ • Metadata                 │
│ • 标签显示   │ • 元数据             │ • Embeddings               │
│ • 统计信息   │ • 标签管理           │ • Actions                  │
└──────────────┴──────────────────────┴────────────────────────────┘
```

---

## 技术栈

### 前端技术

| 技术 | 用途 | 说明 |
|------|------|------|
| **Vanilla JavaScript** | 核心逻辑 | 无框架依赖，性能优先 |
| **IndexedDB** | 本地存储 | 浏览器原生数据库，支持大容量 |
| **Chrome Extension MV3** | 运行环境 | Service Worker + Content Scripts |
| **HTML5 + CSS3** | UI 界面 | 三栏式响应式布局 |

### 后端服务

| 服务 | 用途 | 支持的提供商 |
|------|------|--------------|
| **LLM API** | 文本清洗、分块 | OpenAI, Anthropic, Custom |
| **Embedding API** | 向量生成 | OpenAI `text-embedding-3-small` (1536 维) |

### 核心算法

- **语义分块**：LLM 驱动的主题边界识别
- **余弦相似度**：本地向量检索（无需外部向量数据库）
- **启发式语言检测**：Unicode 字符范围匹配 + LLM 确认

---

## 数据流程

### 完整处理管道

```
┌──────────────────────────────────────────────────────────────────┐
│                     1. Content Acquisition                        │
│  User triggers Alt+C → contentScript.js extracts page content    │
│  • Text selection OR full page                                   │
│  • Special handling: Google Docs, Notion, Medium                 │
│  • Metadata: title, url, word count                              │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              2. LLM Pre-Cleaning (background.js)                 │
│  Send raw text to LLM with structured prompt                     │
│  ✓ Extract clean text                                            │
│  ✓ Detect language (en/zh/ja/ko/...)                             │
│  ✓ Identify main topics                                          │
│  ✓ Extract key points                                            │
│  ✓ Recognize entities (people, orgs, locations, dates)           │
│  ✓ Generate semantic chunks with topics & importance             │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│             3. Post-LLM Cleanup (background.js)                  │
│  Apply mechanical rules to LLM output                            │
│  • Normalize whitespace                                          │
│  • Remove duplicate punctuation                                  │
│  • Split into sentences                                          │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              4. Chunk Builder (background.js)                    │
│  Priority 1: Use LLM semantic chunks (智能分块)                  │
│  Priority 2: Fallback to paragraph-based chunking                │
│  Each chunk includes:                                            │
│  • Text content                                                  │
│  • Topic / theme                                                 │
│  • Importance score (0.0 - 1.0)                                  │
│  • Block type (paragraph, list, code, quote, heading)            │
│  • Key entities                                                  │
│  • Tags                                                          │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│           5. Schema Generation (background.js)                   │
│  Build RAG-ready schemas:                                        │
│  Document Schema:                                                │
│    • doc_id (UUID)                                               │
│    • title, url, raw_text, clean_text                            │
│    • metadata (language, tags, entities, key_points)             │
│  Chunk Schemas (array):                                          │
│    • chunk_id (UUID), doc_id, order                              │
│    • text, block_type, importance                                │
│    • metadata (tags, entities, sentence_count, token_count)      │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│        6. Vector Embedding Generation (background.js)            │
│  For each chunk (if OpenAI provider):                            │
│  • Call OpenAI Embeddings API                                    │
│  • Model: text-embedding-3-small (1536 dimensions)               │
│  • Store embedding vector in chunk schema                        │
│  • Rate limiting: 100ms delay between requests                   │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              7. Database Storage (db.js + IndexedDB)             │
│  Save to IndexedDB:                                              │
│  • documents table: Full document schema                         │
│  • memory_chunks table: All chunk schemas with embeddings        │
│  • Indexed fields: doc_id, title, url, created_at, importance    │
└────────────────────────────┬─────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                    8. Success Notification                        │
│  Display: "Memory saved! Document: xxx... (N chunks)"            │
└──────────────────────────────────────────────────────────────────┘
```

---

## 组件详解

### 1. Content Scripts (`src/contentScript.js`)

**职责**：网页内容提取

```javascript
// 核心功能
- getPageContent()           // 提取页面文本 + 元数据
- extractGoogleDocsContent() // 特殊处理：Google Docs 的 canvas 渲染内容
- handleTextSelection()      // 用户选择的文本片段
```

**特殊处理平台**：
- Google Docs: 访问内部 `DOCS_modelChunk` 数据结构
- Notion: DOM 遍历 `.notion-page-content`
- Medium: 提取 `article` 标签内容

---

### 2. Background Service Worker (`src/background.js`)

**职责**：核心处理逻辑 + API 通信

```javascript
// 主要函数
handleSendToLLM()           // 总控制器：协调整个管道
llmPreCleaning()            // LLM 文本清洗 + 结构化提取
postLLMCleanup()            // 后处理：规则清洗 + 句子分割
chunkBuilder()              // 语义分块构建
buildMemoryReadyData()      // 最终数据组装
buildDocumentSchema()       // 文档级 schema 生成
buildChunkSchemas()         // chunk 级 schema 数组生成
generateEmbedding()         // 单个文本的向量嵌入
generateChunkEmbeddings()   // 批量生成 chunks 的嵌入

// 工具函数
generateUUID()              // UUID v4 生成
detectLanguage()            // 启发式语言检测
extractTokenUsage()         // 提取 API token 统计
updateTokenUsage()          // 更新累计 token 使用量
```

**LLM Pre-Cleaning Prompt 结构**：
```json
{
  "structuredText": "清洗后的文本",
  "language": "en",
  "mainTopics": ["topic1", "topic2"],
  "keyPoints": ["point1", "point2"],
  "entities": {
    "people": [],
    "organizations": [],
    "locations": [],
    "dates": []
  },
  "semanticChunks": [
    {
      "topic": "chunk topic",
      "text": "chunk content",
      "importance": 0.8,
      "keyEntities": ["entity1"],
      "blockType": "paragraph"
    }
  ]
}
```

---

### 3. Database Layer (`src/db.js`)

**职责**：IndexedDB CRUD 操作 + 向量检索

```javascript
class MemoryDB {
  // 初始化
  init()                    // 打开/创建数据库，建立索引

  // 文档操作
  saveDocument()            // 存储单个文档
  getDocument()             // 根据 doc_id 获取
  getAllDocuments()         // 分页获取所有文档（支持排序）
  deleteDocument()          // 删除文档 + 所有关联 chunks

  // Chunks 操作
  saveChunks()              // 批量存储 chunks
  getChunksByDocId()        // 获取文档的所有 chunks（按 order 排序）

  // 搜索功能
  searchDocuments()         // 模糊搜索（标题/URL/正文）
  semanticSearch()          // 语义搜索（向量相似度 Top-K）

  // 工具函数
  cosineSimilarity()        // 计算两个向量的余弦相似度
  getStats()                // 获取统计信息（文档数、chunks 数）
  clearAll()                // 清空所有数据
}
```

**IndexedDB Schema**：

**Table: `documents`**
```javascript
{
  keyPath: 'doc_id',
  indexes: [
    'title',
    'url',
    'created_at',
    'source_type'
  ]
}
```

**Table: `memory_chunks`**
```javascript
{
  keyPath: 'chunk_id',
  indexes: [
    'doc_id',
    'order',
    'created_at',
    'importance',
    'block_type',
    ['doc_id', 'order']  // 复合索引
  ]
}
```

---

### 4. Knowledge Manager UI (`manager.html` + `manager.js` + `manager.css`)

**职责**：三栏式知识浏览和管理界面

#### 左栏：文档列表

```javascript
loadAllDocuments()        // 加载并显示文档列表
displayDocumentList()     // 渲染文档卡片
selectDocument()          // 选择文档 → 加载详情
performGlobalSearch()     // 全局搜索过滤
```

**功能**：
- 文档列表显示（标题、日期、chunks 数、标签）
- ⭐ 星标文档
- 排序：Latest / Title / Size
- 全局搜索

#### 中栏：文档预览

```javascript
displayDocumentPreview()  // 显示文档内容
displayTags()             // 标签管理
switchPreviewTab()        // 切换 Raw/Clean/Comparison
```

**三个标签页**：
- **Clean Text**：LLM 清洗后的结构化文本
- **Raw Text**：原始提取的文本
- **Comparison**：并排对比视图

**操作**：
- ✏️ Edit Mode（待实现）
- ⭐ Star/Unstar
- 📋 Copy Clean Text
- 🏷️ Add/Remove Tags

#### 右栏：详细信息（4 个 Tab）

**1. Chunks Tab**
```javascript
displayChunks()           // 显示所有语义块
```
- Chunk ID、Topic、Importance
- 文本预览（可展开）
- 嵌入状态（✓ Embedded）

**2. Metadata Tab**
```javascript
displayMetadata()         // 编辑元数据
saveMetadata()            // 保存修改
```
- 编辑标题、URL、语言
- Key Points 管理
- Entities 显示

**3. Embeddings Tab**
```javascript
displayEmbeddingsInfo()   // 嵌入状态概览
```
- 嵌入状态（Complete/Partial/None）
- Chunks 计数（X / Total）
- 向量维度信息
- Regenerate / Embed Selected（待实现）

**4. Actions Tab**
- 💾 Export Document (JSON)
- 📑 Duplicate（待实现）
- 🔨 Re-chunk（待实现）
- ✨ Re-clean with LLM（待实现）
- 🗑️ Delete Document

---

### 5. Popup Interface (`popup.html` + `popup.js`)

**职责**：扩展配置 + 快速访问

```javascript
// 配置管理
loadSettings()            // 加载 LLM API 配置
saveSettings()            // 保存配置
testAPI()                 // 测试 API 连接

// Token 统计
loadTokenUsage()          // 显示累计 token 使用
resetTokenUsage()         // 重置统计

// 记忆搜索
performSearch()           // 模糊/语义搜索
viewAllDocuments()        // 查看所有文档
exportAllMemory()         // 导出所有记忆
clearAllMemory()          // 清空数据库
```

**功能区**：
1. **LLM Provider 配置**（OpenAI/Anthropic/Custom）
2. **Token Usage Statistics**（总用量 + 按 Provider 分类）
3. **Memory Search**（Fuzzy / Semantic）
4. **📚 Knowledge Manager** 入口按钮

---

## 数据模型

### Document Schema

```typescript
interface DocumentSchema {
  // 基本信息
  doc_id: string;          // UUID
  title: string;
  url: string;
  captured_at: string;     // ISO 8601
  source_type: 'web_page' | 'web_selection';

  // 文本内容
  raw_text: string;        // 原始提取的文本
  clean_text: string;      // LLM 清洗后的文本

  // 元数据
  metadata: {
    language: string;      // ISO 639-1 (en/zh/ja/ko/...)
    length: number;        // clean_text 长度
    tags: string[];        // 用户标签
    llm_cleaner_version: string;  // 清洗算法版本
    word_count: number;
    chunk_count: number;

    // LLM 提取的信息
    entities: {
      people: string[];
      organizations: string[];
      locations: string[];
      dates: string[];
    };
    key_points: string[];

    // 用户自定义
    starred?: boolean;     // 星标标记
  };
}
```

### Chunk Schema

```typescript
interface ChunkSchema {
  // 标识信息
  chunk_id: string;        // UUID
  doc_id: string;          // 关联的文档 ID
  order: number;           // 在文档中的顺序（从 0 开始）

  // 文本内容
  text: string;            // chunk 的文本内容

  // 向量嵌入
  embedding: number[] | null;  // 1536 维向量（OpenAI）或 null

  // 分类信息
  block_type: 'paragraph' | 'list' | 'code' | 'quote' | 'heading';
  importance: number;      // 0.0 - 1.0

  // 时间戳
  created_at: string;      // ISO 8601

  // 来源信息
  source: {
    title: string;
    url: string;
  };

  // 元数据
  metadata: {
    language: string;
    from_selection: boolean;  // 是否来自用户选择
    tags: string[];           // 包含主题 + 实体标签
    sentence_count: number;
    token_count: number;      // 估算值：word_count * 1.3
    word_count: number;
    position: 'start' | 'middle' | 'end';  // 在文档中的位置
    topic?: string;           // LLM 识别的主题
    key_entities: string[];   // 关键实体
  };
}
```

---

## 文件结构

```
AutoFeel/
├── manifest.json                # Chrome Extension 配置
├── ARCHITECTURE.md              # 本架构文档
│
├── src/
│   ├── background.js            # Service Worker：核心处理逻辑
│   ├── contentScript.js         # Content Script：网页内容提取
│   ├── db.js                    # IndexedDB 管理器
│   ├── popup.js                 # Popup UI 逻辑
│   ├── result.js                # Result 页面逻辑（已废弃，被 manager 取代）
│   └── manager.js               # Knowledge Manager UI 逻辑
│
├── styles/
│   ├── popup.css                # Popup 样式
│   ├── result.css               # Result 页面样式（已废弃）
│   └── manager.css              # Knowledge Manager 样式
│
├── popup.html                   # 扩展 Popup 界面
├── result.html                  # 结果展示页面（已废弃）
├── manager.html                 # Knowledge Manager 主界面
├── db.js                        # db.js 副本（扩展根目录，供 Service Worker 导入）
│
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 使用指南

### 基本工作流

#### 1. 配置 API

1. 打开扩展 Popup
2. 选择 LLM Provider（OpenAI/Anthropic/Custom）
3. 填写 API Key 和 Endpoint
4. 点击 "Test Connection" 验证
5. 点击 "Save Settings"

#### 2. 采集网页内容

**方式 A：保存整个页面**
```
在任意网页 → 按 Alt+C → 等待处理完成
```

**方式 B：保存选中文本**
```
选中文本 → 按 Alt+C → 只处理选中部分
```

**支持的平台**：
- ✅ 所有常规网页
- ✅ Google Docs（特殊处理 canvas 渲染）
- ✅ Notion
- ✅ Medium
- ✅ 技术博客、文档站

#### 3. 管理知识库

```
扩展 Popup → 📚 Knowledge Manager
```

**左栏操作**：
- 点击文档查看详情
- 排序：Latest / Title / Size
- 搜索过滤

**中栏操作**：
- 切换 Clean / Raw / Comparison 视图
- ⭐ 星标重要文档
- 📋 复制清洗后的文本
- 🏷️ 添加/删除标签

**右栏操作**：
- **Chunks Tab**：查看语义块、重要性评分
- **Metadata Tab**：编辑标题、URL、Key Points
- **Embeddings Tab**：查看向量嵌入状态
- **Actions Tab**：导出、删除等操作

#### 4. 搜索知识

**模糊搜索**（基于关键词）：
```
Popup → Memory Search → Fuzzy Search → 输入关键词
```

**语义搜索**（基于向量相似度）：
```
Popup → Memory Search → Semantic Search → 输入查询
```

**示例查询**：
- "Stanford research opportunities"
- "机器学习算法"
- "如何优化神经网络"

#### 5. 导出数据

**导出单个文档**：
```
Knowledge Manager → 选择文档 → Actions Tab → Export Document
```

**导出所有记忆**：
```
Popup → Memory Search → Export All
```

**导出格式**：JSON（包含 document + chunks + embeddings）

---

## 扩展性设计

### 当前架构的扩展点

#### 1. 多模态支持

```javascript
// 未来可扩展：图片、PDF、视频
interface MultiModalContent {
  type: 'text' | 'image' | 'pdf' | 'video';
  content: string | Blob;
  metadata: { ... };
}
```

#### 2. 更强大的向量数据库

当前使用**本地余弦相似度计算**，适合中小规模（< 10,000 chunks）。

**未来扩展选项**：
- **WASM 向量库**：usearch-wasm, hnswlib-wasm
- **本地服务**：LanceDB, Milvus Lite, Qdrant
- **云服务**：Pinecone, Weaviate

```javascript
// 预留接口
interface VectorStore {
  insert(vector: number[], metadata: object): Promise<void>;
  search(query: number[], topK: number): Promise<SearchResult[]>;
  delete(id: string): Promise<void>;
}
```

#### 3. 知识图谱

```javascript
// 实体关系提取
interface KnowledgeGraph {
  nodes: Entity[];
  edges: Relationship[];
}

interface Entity {
  id: string;
  type: 'person' | 'organization' | 'concept';
  name: string;
  chunks: string[];  // 关联的 chunk_ids
}

interface Relationship {
  from: string;
  to: string;
  type: 'works_at' | 'related_to' | 'located_in';
}
```

#### 4. 时间线记忆

```javascript
// 按时间组织的记忆检索
interface TemporalMemory {
  getMemoriesInRange(start: Date, end: Date): Document[];
  getMemoriesByTopic(topic: string, timeline: boolean): Document[];
}
```

#### 5. 主动记忆召回

```javascript
// 基于上下文的自动记忆推荐
interface MemoryRecall {
  suggestRelevantMemories(context: string): Chunk[];
  findSimilarExperiences(query: string): Document[];
}
```

### 性能优化方向

#### 1. 并发处理

```javascript
// 批量处理多个文档
async function batchProcess(documents: RawContent[]) {
  const results = await Promise.all(
    documents.map(doc => handleSendToLLM(doc))
  );
  return results;
}
```

#### 2. 增量索引

```javascript
// 仅对新 chunks 生成嵌入
async function incrementalEmbed(newChunks: Chunk[]) {
  const unembedded = newChunks.filter(c => !c.embedding);
  return await generateChunkEmbeddings(unembedded);
}
```

#### 3. 缓存优化

```javascript
// LLM 响应缓存（相同文本不重复调用）
const llmCache = new Map<string, LLMResponse>();
```

---

## API Reference

### Chrome Extension Messages

#### `GET_PAGE_CONTENT`

**From**: background.js
**To**: contentScript.js

```javascript
chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' })
```

**Response**:
```javascript
{
  success: true,
  content: {
    text: string,
    source: 'selection' | 'full_page',
    wordCount: number,
    metadata: {
      title: string,
      url: string,
      timestamp: string
    }
  }
}
```

#### `GENERATE_EMBEDDING`

**From**: popup.js
**To**: background.js

```javascript
chrome.runtime.sendMessage({
  type: 'GENERATE_EMBEDDING',
  text: string,
  config: { llmProvider, apiKey, apiEndpoint }
})
```

**Response**:
```javascript
{
  success: true,
  embedding: number[]  // 1536 维向量
}
```

---

## 开发指南

### 本地开发

1. **加载扩展**：
   ```
   chrome://extensions/ → 开发者模式 → 加载已解压的扩展程序
   ```

2. **调试 Service Worker**：
   ```
   chrome://extensions/ → AutoFeel → service worker
   ```

3. **调试 Content Script**：
   ```
   网页 F12 → Console 查看 [AutoFeel] 日志
   ```

4. **调试 UI**：
   ```
   Knowledge Manager → F12 → 查看 DOM 和 Console
   ```

### 常见问题排查

#### Q: 点击文档无反应？
**A**: 检查 manager.js 中是否有 JavaScript 错误，确保事件监听器正确绑定。

#### Q: 语义搜索不可用？
**A**: 确保：
1. LLM Provider 选择了 OpenAI
2. Chunks 已生成向量嵌入（Embeddings Tab 显示 ✓）

#### Q: IndexedDB 数据丢失？
**A**: IndexedDB 数据与浏览器 Profile 绑定，清除浏览器数据会删除。建议定期导出备份。

---

## 性能指标

### 处理时间（参考值）

| 阶段 | 时间 | 说明 |
|------|------|------|
| Content Extraction | < 1s | contentScript.js |
| LLM Pre-Cleaning | 5-30s | 取决于 API 延迟和文本长度 |
| Post-Cleanup | < 100ms | 本地处理 |
| Chunk Building | < 100ms | 本地处理 |
| Schema Generation | < 50ms | 本地处理 |
| Embedding Generation | 2-10s | 取决于 chunks 数量（4 chunks ≈ 2s）|
| Database Storage | < 200ms | IndexedDB 写入 |

**总计**：约 **10-45 秒**（大部分时间在 LLM API 调用）

### 存储容量

- **IndexedDB 限制**：通常 > 500MB（Chrome），具体取决于磁盘空间
- **单个文档**：约 10-200 KB（取决于内容长度）
- **单个 embedding**：1536 维 × 8 字节 = 12 KB
- **预估容量**：可存储 **1,000-10,000** 个文档

---

## 版本历史

### v0.2.0 (Current)
- ✅ 完整的 Knowledge Manager UI
- ✅ 三栏式管理界面
- ✅ 向量嵌入生成
- ✅ 语义搜索
- ✅ Document + Chunk Schema
- ✅ IndexedDB 持久化存储

### v0.1.0
- ✅ 基础 LLM 清洗管道
- ✅ Token 统计
- ✅ Result 页面展示（已废弃）

---

## 贡献指南

### 代码规范

- **JavaScript**: ES6+ 语法，无框架依赖
- **命名**: camelCase（函数/变量），PascalCase（类）
- **注释**: 关键函数必须有 JSDoc
- **日志**: 使用 `[AutoFeel]` 前缀统一格式

### 提交规范

```
feat: 添加新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
perf: 性能优化
test: 测试相关
```

---

## License

MIT License

---

## 联系方式

- **GitHub**: [AutoFeel Repository](#)
- **Issues**: [Report a Bug](#)
- **Email**: support@autofeel.com

---

**Last Updated**: 2025-12-01
**Version**: 0.2.0
**Author**: Shiqi Liu
