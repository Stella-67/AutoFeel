# 🗄️ AutoFeel 数据结构完整说明

> 版本: 1.0
> 最后更新: 2024-01-15
> 作者: AutoFeel Team

---

## 📊 数据库概览

```
IndexedDB 数据库名称: AutoFeelMemory
版本: 1

包含 2 个对象存储（表）:
┌─────────────────────────────────────────────────┐
│  1. documents        文档表（主文档信息）        │
│  2. memory_chunks    记忆块表（分块后的内容）     │
└─────────────────────────────────────────────────┘

关系: 1 个 document 包含 多个 memory_chunks
     (1:N 关系，通过 doc_id 关联)
```

---

## 📄 表 1: `documents` 文档表

### 基本信息

- **表名**: `documents`
- **主键**: `doc_id` (String, UUID v4)
- **用途**: 存储完整文档的元信息和文本内容

### 索引列表

| 索引名 | 字段 | 唯一性 | 用途 |
|--------|------|--------|------|
| `title` | title | 非唯一 | 按标题搜索文档 |
| `url` | url | 非唯一 | 按 URL 查找文档 |
| `created_at` | created_at | 非唯一 | 按时间排序 |
| `source_type` | source_type | 非唯一 | 按来源类型筛选 |

---

### 完整数据结构

```javascript
{
  // ==================== 主键 ====================
  "doc_id": "550e8400-e29b-41d4-a716-446655440000",  // UUID v4

  // ==================== 基本信息 ====================
  "title": "机器学习入门教程",                      // 文档标题（从网页提取）
  "url": "https://example.com/ml-tutorial",        // 来源 URL
  "captured_at": "2024-01-15T08:30:45.123Z",      // 捕获时间（ISO 8601）
  "source_type": "web_page",                       // 来源类型

  // ==================== 文本内容 ====================
  "raw_text": "机器学习是人工智能的一个分支...\n\n深度学习...",
  // ↑ 原始文本（从网页直接提取，未处理）
  // 类型: string
  // 长度: 可能很长（几千到几万字符）

  "clean_text": "机器学习是人工智能的一个分支。它使计算机能够...",
  // ↑ 清洗后的文本（经过 LLM 处理，去除噪音）
  // 类型: string
  // 特点: 更简洁、结构化、去除了广告和无关内容

  // ==================== 元数据对象 ====================
  "metadata": {
    "language": "zh",                              // 语言代码（ISO 639-1）
                                                   // 可能值: "en", "zh", "ja", "ko"等

    "length": 5234,                                // 清洗后文本的字符数

    "tags": [                                       // 主题标签（LLM 提取）
      "机器学习",
      "人工智能",
      "深度学习",
      "神经网络"
    ],

    "llm_cleaner_version": "1.0.0",                // LLM 清洗器版本号

    "word_count": 1245,                            // 总词数

    "chunk_count": 8,                              // 分块数量

    "entities": {                                   // 提取的实体
      "persons": ["Geoffrey Hinton", "Yann LeCun"], // 人名
      "organizations": ["Google", "OpenAI"],        // 组织
      "locations": ["Stanford", "MIT"],             // 地点
      "concepts": ["反向传播", "梯度下降"]          // 概念
    },

    "key_points": [                                 // 关键要点（LLM 提取）
      "机器学习让计算机从数据中学习",
      "监督学习需要标注数据",
      "深度学习使用多层神经网络"
    ]
  }
}
```

---

### 字段详解

| 字段 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| `doc_id` | String (UUID) | ✅ | 文档唯一标识符 | `"550e8400-e29b-41d4-a716-446655440000"` |
| `title` | String | ✅ | 文档标题 | `"机器学习入门教程"` |
| `url` | String (URL) | ✅ | 来源网址 | `"https://example.com/page"` |
| `captured_at` | String (ISO 8601) | ✅ | 捕获时间戳 | `"2024-01-15T08:30:45.123Z"` |
| `source_type` | String (枚举) | ✅ | 来源类型 | `"web_page"` 或 `"web_selection"` |
| `raw_text` | String | ✅ | 原始文本内容 | `"机器学习是..."` (可能很长) |
| `clean_text` | String | ✅ | 清洗后的文本 | `"机器学习是..."` (更简洁) |
| `metadata` | Object | ✅ | 元数据对象 | 见下方详解 |

#### metadata 对象字段

| 字段 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| `language` | String | ✅ | 语言代码 | `"zh"`, `"en"`, `"ja"` |
| `length` | Number | ✅ | 文本长度 | `5234` |
| `tags` | Array\<String\> | ✅ | 主题标签 | `["机器学习", "AI"]` |
| `llm_cleaner_version` | String | ✅ | 清洗器版本 | `"1.0.0"` |
| `word_count` | Number | ✅ | 词数统计 | `1245` |
| `chunk_count` | Number | ✅ | 分块数量 | `8` |
| `entities` | Object | ✅ | 实体集合 | 见下表 |
| `key_points` | Array\<String\> | ✅ | 关键要点 | `["机器学习让..."]` |

#### entities 对象字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `persons` | Array\<String\> | 人名列表 | `["Geoffrey Hinton"]` |
| `organizations` | Array\<String\> | 组织名称 | `["Google", "OpenAI"]` |
| `locations` | Array\<String\> | 地点名称 | `["Stanford"]` |
| `concepts` | Array\<String\> | 概念术语 | `["反向传播"]` |

---

## 🧩 表 2: `memory_chunks` 记忆块表

### 基本信息

- **表名**: `memory_chunks`
- **主键**: `chunk_id` (String, UUID v4)
- **用途**: 存储文档分块后的内容片段，支持语义搜索和知识图谱

### 索引列表

| 索引名 | 字段 | 唯一性 | 用途 |
|--------|------|--------|------|
| `doc_id` | doc_id | 非唯一 | 查找某文档的所有 chunks |
| `order` | order | 非唯一 | 按顺序获取 chunks |
| `created_at` | created_at | 非唯一 | 按时间排序 |
| `importance` | importance | 非唯一 | 按重要性筛选 |
| `block_type` | block_type | 非唯一 | 按类型筛选 |
| `doc_order` | [doc_id, order] | 非唯一 | 复合索引，快速获取文档的有序 chunks |
| **`layer`** | **layer** | **非唯一** | **按层级筛选（temporary/stable）** |
| **`confidence`** | **confidence** | **非唯一** | **按置信度筛选** |
| **`activation_weight`** | **activation_weight** | **非唯一** | **按激活权重排序** |
| **`stability_score`** | **stability_score** | **非唯一** | **按稳定性筛选** |
| **`obsolete`** | **obsolete** | **非唯一** | **过滤过时的 chunks** |

---

### 完整数据结构

```javascript
{
  // ==================== 主键 ====================
  "chunk_id": "660e8400-e29b-41d4-a716-446655440001",  // UUID v4

  // ==================== 关联信息 ====================
  "doc_id": "550e8400-e29b-41d4-a716-446655440000",    // 所属文档 ID
  "order": 0,                                          // 在文档中的顺序（从0开始）

  // ==================== 文本内容 ====================
  "text": "机器学习是人工智能的一个重要分支，它使计算机能够从数据中学习规律，而无需显式编程。",
  // ↑ chunk 的实际文本内容
  // 类型: string
  // 长度: 通常 200-500 字符（语义完整的段落）

  // ==================== 向量嵌入 ====================
  "embedding": [0.023, -0.145, 0.089, ..., 0.234],
  // ↑ 文本的向量表示（用于语义搜索）
  // 类型: Array<Number> 或 null
  // 长度: 1536（OpenAI text-embedding-3-small）
  // 值域: 每个数字通常在 -1 到 1 之间
  // 用途: 计算 chunk 之间的语义相似度
  // 注意: 如果未生成嵌入，则为 null

  // ==================== 分类信息 ====================
  "block_type": "paragraph",                           // 块的结构类型
  // 可能值: "paragraph", "heading", "list", "code", "quote"

  "chunk_type": "concept",                             // 块的语义类型
  // 可能值: "concept"（概念）, "fact"（事实）,
  //        "procedure"（步骤）, "example"（示例）,
  //        "definition"（定义）, "unknown"（未知）

  "importance": 0.85,                                  // 重要性分数
  // 类型: Number (0-1)
  // 0.0 = 不重要，1.0 = 非常重要
  // 用途: 优先级排序、筛选

  "created_at": "2024-01-15T08:30:45.123Z",           // 创建时间

  // ==================== 卡片架构 (v2): 多层自演化系统 ====================

  // 分层系统
  "layer": "temporary",                                // 所属层级
  // 可能值: "temporary"（临时层，高可塑性）, "stable"（稳定层，长期记忆）
  // 新 chunks 默认在 temporary 层，经过验证后迁移到 stable 层

  // 置信度与惊奇度
  "confidence": 0.75,                                  // 置信度 (0-1)
  // 0.0 = 低置信度（需要验证）, 1.0 = 高置信度（经过验证）
  // 影响因素: 来源可靠性、一致性、完整性、支持证据数量

  "surprise": 0.3,                                     // 惊奇度 (0-1)
  // 0.0 = 不惊奇（与现有知识一致）, 1.0 = 非常惊奇（新颖或矛盾）
  // 计算: 语义距离 + 矛盾检测 + 新颖性

  // 激活强化
  "activation_count": 5,                               // 激活次数
  // 记录该 chunk 被检索或使用的次数

  "activation_weight": 0.8,                            // 激活权重 (0-1)
  // 随使用频率增加，随时间衰减
  // 用于排序和遗忘机制

  "last_activated": "2024-01-20T10:15:30.123Z",       // 最后激活时间

  // 稳定性与迁移
  "stability_score": 0.6,                              // 稳定性得分 (0-1)
  // 综合计算: confidence + (1 - surprise) + activation_weight
  // > 0.7 时可以迁移到 stable 层

  "migration_ready": false,                            // 是否准备迁移
  // true = 满足迁移条件（高置信、低惊奇、高激活）

  // 生命周期与演化
  "version": 1,                                        // 版本号
  // 每次更新（合并、分裂、修改）时递增

  "parent_card_id": null,                              // 父卡片 ID
  // 如果是从另一个 chunk 分裂而来，记录父 chunk_id

  "merged_from": [],                                   // 合并源
  // 如果是从多个 chunks 合并而来，记录源 chunk_ids
  // 类型: Array<String>

  // 遗忘与修剪
  "decay_factor": 1.0,                                 // 衰减因子 (0-1)
  // 随时间和不使用而衰减
  // 半衰期: 30 天

  "obsolete": false,                                   // 是否过时
  // true = 标记为过时，可能被修剪
  // 条件: decay_factor < 0.1 且 activation_count < 2

  "last_updated": "2024-01-15T08:30:45.123Z",         // 最后更新时间

  // ==================== 知识图谱: 关系网络 ====================
  "relationships": {
    // 所有字段都是 chunk_id 的数组

    "related_chunks": [                                // 语义相关的 chunks
      "660e8400-e29b-41d4-a716-446655440002",
      "660e8400-e29b-41d4-a716-446655440005"
    ],
    // ↑ 关系类型: "这个 chunk 与哪些 chunks 在语义上相关"
    // 用途: 知识图谱中的普通连接线

    "parent_chunks": [                                 // 父级 chunks
      "660e8400-e29b-41d4-a716-446655440010"
    ],
    // ↑ 关系类型: "这个 chunk 详细解释了哪些 chunks"
    // 方向: parent → 当前chunk（详述关系）

    "child_chunks": [                                  // 子级 chunks
      "660e8400-e29b-41d4-a716-446655440003",
      "660e8400-e29b-41d4-a716-446655440004"
    ],
    // ↑ 关系类型: "哪些 chunks 详细解释了这个 chunk"
    // 方向: 当前chunk → child（详述关系）

    "contradicts": [                                   // 矛盾的 chunks
      "660e8400-e29b-41d4-a716-446655440020"
    ],
    // ↑ 关系类型: "这个 chunk 与哪些 chunks 的信息相矛盾"
    // 用途: 发现知识冲突、需要验证的内容

    "supports": [                                      // 支持的 chunks
      "660e8400-e29b-41d4-a716-446655440015"
    ],
    // ↑ 关系类型: "这个 chunk 支持/证实了哪些 chunks"
    // 用途: 知识验证、可信度评估

    "prerequisite_of": [                               // 后置依赖
      "660e8400-e29b-41d4-a716-446655440030"
    ],
    // ↑ 关系类型: "理解哪些 chunks 需要先理解这个 chunk"
    // 方向: 当前chunk（前置） → prerequisite_of（后置）

    "requires": [                                      // 前置依赖
      "660e8400-e29b-41d4-a716-446655440008"
    ]
    // ↑ 关系类型: "理解这个 chunk 需要先理解哪些 chunks"
    // 方向: requires（前置） → 当前chunk（后置）
  },

  // ==================== 来源信息 ====================
  "source": {
    "title": "机器学习入门教程",                      // 来源文档标题
    "url": "https://example.com/ml-tutorial",        // 来源 URL
    "doc_id": "550e8400-e29b-41d4-a716-446655440000" // 来源文档 ID
  },

  // ==================== 元数据对象 ====================
  "metadata": {
    "language": "zh",                                // 语言代码

    "from_selection": false,                         // 是否来自用户选择的文本
    // true = 用户手动选择的文本片段
    // false = 从完整网页提取

    "tags": ["入门", "基础概念"],                    // chunk 的标签

    "sentence_count": 2,                             // 句子数量

    "token_count": 52,                               // Token 数量（估算）
    // 计算方式: word_count * 1.3

    "word_count": 40,                                // 词数

    "position": {                                    // 位置信息
      "start": 0,                                    // 在原文中的起始字符位置
      "end": 87                                      // 在原文中的结束字符位置
    },

    "topic": "机器学习基础",                         // chunk 的主题

    "key_entities": [                                // 关键实体
      "机器学习",
      "人工智能",
      "数据"
    ],

    // ==================== 知识管理元数据 ====================
    "confidence_score": 1.0,                         // 可信度分数
    // 类型: Number (0-1)
    // 1.0 = 高度可信，0.5 = 需要验证，0.0 = 不可信

    "last_verified": "2024-01-15T08:30:45.123Z",    // 最后验证时间

    "update_count": 0,                               // 更新次数
    // 每次内容更新时 +1

    "access_count": 0                                // 访问次数
    // 每次检索到这个 chunk 时 +1
    // 用途: 统计热门内容
  }
}
```

---

### 字段详解

#### 核心字段

| 字段 | 类型 | 必需 | 说明 | 示例值 |
|------|------|------|------|--------|
| `chunk_id` | String (UUID) | ✅ | chunk 唯一标识符 | `"660e8400-..."` |
| `doc_id` | String (UUID) | ✅ | 所属文档 ID | `"550e8400-..."` |
| `order` | Number | ✅ | 在文档中的顺序 | `0`, `1`, `2`, ... |
| `text` | String | ✅ | chunk 文本内容 | `"机器学习是..."` (200-500字符) |
| `embedding` | Array\<Number\> \| null | ✅ | 向量嵌入 | `[0.023, -0.145, ...]` (1536维) |

#### 分类字段

| 字段 | 类型 | 可能值 | 说明 |
|------|------|--------|------|
| `block_type` | String | `paragraph`, `heading`, `list`, `code`, `quote` | 块的结构类型 |
| `chunk_type` | String | `concept`, `fact`, `procedure`, `example`, `definition`, `unknown` | 块的语义类型 |
| `importance` | Number | 0.0 - 1.0 | 重要性分数 |

#### 关系字段 (relationships 对象)

| 字段 | 类型 | 说明 | 关系含义 |
|------|------|------|----------|
| `related_chunks` | Array\<UUID\> | 相关 chunks | A 和 B 语义相关 |
| `parent_chunks` | Array\<UUID\> | 父级 chunks | A 详述了 B (B → A) |
| `child_chunks` | Array\<UUID\> | 子级 chunks | B 详述了 A (A → B) |
| `contradicts` | Array\<UUID\> | 矛盾 chunks | A 和 B 信息冲突 |
| `supports` | Array\<UUID\> | 支持 chunks | A 支持 B 的观点 |
| `prerequisite_of` | Array\<UUID\> | 后置依赖 | 先学 A 才能学 B |
| `requires` | Array\<UUID\> | 前置依赖 | 先学 B 才能学 A |

#### 来源字段 (source 对象)

| 字段 | 类型 | 说明 |
|------|------|------|
| `source.title` | String | 来源文档标题 |
| `source.url` | String | 来源 URL |
| `source.doc_id` | String | 来源文档 ID |

#### 元数据字段 (metadata 对象)

| 字段 | 类型 | 说明 | 示例值 |
|------|------|------|--------|
| `language` | String | 语言代码 | `"zh"`, `"en"` |
| `from_selection` | Boolean | 是否来自选择 | `true` / `false` |
| `tags` | Array\<String\> | 标签 | `["入门", "基础"]` |
| `sentence_count` | Number | 句子数 | `2` |
| `token_count` | Number | Token数（估算） | `52` |
| `word_count` | Number | 词数 | `40` |
| `position.start` | Number | 起始位置 | `0` |
| `position.end` | Number | 结束位置 | `87` |
| `topic` | String | 主题 | `"机器学习基础"` |
| `key_entities` | Array\<String\> | 关键实体 | `["机器学习"]` |
| `confidence_score` | Number | 可信度 (0-1) | `1.0` |
| `last_verified` | String (ISO 8601) | 最后验证时间 | `"2024-01-15T..."` |
| `update_count` | Number | 更新次数 | `0` |
| `access_count` | Number | 访问次数 | `0` |

---

## 🔗 数据关系图

```
┌─────────────────────────────────────────────────┐
│              documents 表                        │
│  ┌───────────────────────────────────────────┐  │
│  │ doc_id: "550e8400-..."                    │  │
│  │ title: "机器学习教程"                      │  │
│  │ url: "https://..."                        │  │
│  │ raw_text: "..."                           │  │
│  │ clean_text: "..."                         │  │
│  │ metadata: {...}                           │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                    │
                    │ 1:N 关系
                    │ (一个文档包含多个 chunks)
                    ↓
┌─────────────────────────────────────────────────┐
│           memory_chunks 表                       │
│  ┌───────────────────────────────────────────┐  │
│  │ chunk_id: "660e8400-..." (order: 0)      │  │
│  │ doc_id: "550e8400-..."  ← 外键           │  │
│  │ text: "机器学习是..."                     │  │
│  │ embedding: [0.023, ...]                   │  │
│  │ relationships: {                          │  │
│  │   related_chunks: ["660e8401-..."]  ─────┐│  │
│  │   child_chunks: ["660e8402-..."]    ─────┤│  │
│  │   ...                                    ││  │
│  │ }                                         ││  │
│  └───────────────────────────────────────────┘│  │
│                                                ↓  │
│  ┌───────────────────────────────────────────┐  │
│  │ chunk_id: "660e8401-..." (order: 1)      │  │
│  │ doc_id: "550e8400-..."                    │  │
│  │ text: "深度学习是..."                     │  │
│  │ relationships: {                          │  │
│  │   parent_chunks: ["660e8400-..."]  ←─────┘│  │
│  │   ...                                     │  │
│  │ }                                         │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ┌───────────────────────────────────────────┐  │
│  │ chunk_id: "660e8402-..." (order: 2)      │  │
│  │ ...                                       │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## 📝 实际数据示例

### 示例 1: Document

```json
{
  "doc_id": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
  "title": "Python 编程入门",
  "url": "https://python-tutorial.com/basics",
  "captured_at": "2024-01-15T14:30:00.000Z",
  "source_type": "web_page",
  "raw_text": "Python 是一种高级编程语言...\n\n变量和数据类型...",
  "clean_text": "Python 是一种高级编程语言，以其简洁的语法和强大的功能而闻名。\n\nPython 支持多种数据类型，包括整数、浮点数、字符串和列表。",
  "metadata": {
    "language": "zh",
    "length": 124,
    "tags": ["Python", "编程", "入门教程"],
    "llm_cleaner_version": "1.0.0",
    "word_count": 89,
    "chunk_count": 3,
    "entities": {
      "persons": [],
      "organizations": [],
      "locations": [],
      "concepts": ["Python", "变量", "数据类型", "语法"]
    },
    "key_points": [
      "Python 是一种简洁的编程语言",
      "Python 支持多种数据类型"
    ]
  }
}
```

### 示例 2: Chunk (带完整关系)

```json
{
  "chunk_id": "c1a2b3c4-d5e6-7f8g-9h0i-1j2k3l4m5n6o",
  "doc_id": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
  "order": 0,
  "text": "Python 是一种高级编程语言，以其简洁的语法和强大的功能而闻名。它被广泛应用于 Web 开发、数据分析、人工智能等领域。",
  "embedding": [0.0234, -0.1456, 0.0891, -0.0234, 0.1567],
  "block_type": "paragraph",
  "chunk_type": "concept",
  "importance": 0.92,
  "created_at": "2024-01-15T14:30:00.000Z",
  "relationships": {
    "related_chunks": [
      "c1a2b3c4-d5e6-7f8g-9h0i-9z8y7x6w5v4u",
      "d2b3c4d5-e6f7-8g9h-0i1j-2k3l4m5n6o7p"
    ],
    "parent_chunks": [],
    "child_chunks": [
      "c1a2b3c4-d5e6-7f8g-9h0i-2k3l4m5n6o7p"
    ],
    "contradicts": [],
    "supports": [],
    "prerequisite_of": [
      "e3c4d5e6-f7g8-9h0i-1j2k-3l4m5n6o7p8q"
    ],
    "requires": []
  },
  "source": {
    "title": "Python 编程入门",
    "url": "https://python-tutorial.com/basics",
    "doc_id": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d"
  },
  "metadata": {
    "language": "zh",
    "from_selection": false,
    "tags": ["Python", "编程语言", "简介"],
    "sentence_count": 2,
    "token_count": 65,
    "word_count": 50,
    "position": {
      "start": 0,
      "end": 87
    },
    "topic": "Python 简介",
    "key_entities": ["Python", "Web开发", "数据分析", "人工智能"],
    "confidence_score": 1.0,
    "last_verified": "2024-01-15T14:30:00.000Z",
    "update_count": 0,
    "access_count": 3
  }
}
```

---

## 🔍 数据库查询示例

### 查询 1: 获取某个文档的所有 chunks（按顺序）

```javascript
// 使用 doc_order 复合索引
const chunks = await db.transaction('memory_chunks')
  .objectStore('memory_chunks')
  .index('doc_order')
  .getAll(IDBKeyRange.bound(
    [doc_id, 0],           // 起始: doc_id, order=0
    [doc_id, Infinity]     // 结束: doc_id, order=最大值
  ));
```

### 查询 2: 获取重要性高的 chunks

```javascript
// 使用 importance 索引
const importantChunks = await db.transaction('memory_chunks')
  .objectStore('memory_chunks')
  .index('importance')
  .getAll(IDBKeyRange.lowerBound(0.8)); // 重要性 >= 0.8
```

### 查询 3: 语义搜索（向量相似度）

```javascript
// 1. 获取所有有 embedding 的 chunks
const allChunks = await db.getAllChunks();

// 2. 计算余弦相似度
const queryEmbedding = await generateEmbedding("机器学习");
const results = allChunks
  .filter(chunk => chunk.embedding !== null)
  .map(chunk => ({
    chunk,
    similarity: cosineSimilarity(queryEmbedding, chunk.embedding)
  }))
  .sort((a, b) => b.similarity - a.similarity)
  .slice(0, 5); // 取前5个最相关的
```

### 查询 4: 获取某个 chunk 的所有相关 chunks

```javascript
// 1. 获取目标 chunk
const targetChunk = await db.getChunk(chunk_id);

// 2. 获取所有相关的 chunk IDs
const relatedIds = [
  ...targetChunk.relationships.related_chunks,
  ...targetChunk.relationships.child_chunks,
  ...targetChunk.relationships.parent_chunks
];

// 3. 批量获取相关 chunks
const relatedChunks = await Promise.all(
  relatedIds.map(id => db.getChunk(id))
);
```

---

## 📊 数据大小估算

### 单个 Document:
```
基础字段: ~500 bytes
raw_text: ~10KB (取决于网页大小)
clean_text: ~5KB
metadata: ~2KB
────────────────────
总计: ~17.5KB / document
```

### 单个 Chunk:
```
基础字段: ~200 bytes
text: ~500 bytes
embedding (1536维): ~12KB (1536 * 8 bytes)
relationships: ~500 bytes (假设10个关系)
metadata: ~1KB
────────────────────
总计: ~14.2KB / chunk
```

### 100 个文档的估算:
```
Documents: 100 × 17.5KB = 1.75 MB
Chunks: 100 docs × 8 chunks × 14.2KB = 11.36 MB
────────────────────
总计: ~13 MB
```

### 1000 个文档的估算:
```
Documents: 1000 × 17.5KB = 17.5 MB
Chunks: 1000 docs × 8 chunks × 14.2KB = 113.6 MB
────────────────────
总计: ~131 MB
```

---

## 🎯 关键设计要点

### ✅ 优点

1. **语义搜索**: `embedding` 字段支持向量检索，实现真正的语义理解
2. **知识图谱**: `relationships` 字段建立 chunk 间的语义网络，形成知识图谱
3. **版本追踪**: `update_count` 和 `last_verified` 支持内容版本管理
4. **性能优化**: 多个索引支持快速查询和排序
5. **可扩展性**: `metadata` 对象可以轻松添加新字段而不破坏现有结构
6. **双向关系**: 支持 parent-child、prerequisite-requires 等双向关系
7. **访问统计**: `access_count` 可用于热门内容分析和推荐

### ⚠️ 需要注意

1. **存储空间**:
   - `embedding` 占用大量空间（每个 chunk 约 12KB）
   - 考虑只为重要 chunks 生成 embedding

2. **关系维护**:
   - 双向关系需要同步更新（parent ↔ child）
   - 删除 chunk 时需要清理所有引用它的关系

3. **索引开销**:
   - 多个索引会增加写入时间
   - 权衡查询性能和写入性能

4. **数据一致性**:
   - 删除 document 时必须同时删除所有 chunks
   - 更新关系时需要确保双向一致性

5. **向量更新**:
   - 修改 chunk 文本后需要重新生成 embedding
   - 考虑批量生成以节省 API 调用

---

## 🔄 数据生命周期

### 1. 创建（Create）

```
用户按 Alt+C
    ↓
提取页面内容 (page-extractor.js)
    ↓
LLM 清洗文本 (text-processor.js)
    ↓
语义分块 (text-processor.js)
    ↓
生成 document schema (schema-builder.js)
    ↓
生成 chunk schemas (schema-builder.js)
    ↓
生成向量嵌入 (embedding-service.js) [可选]
    ↓
分析关系 (decision-agent.js)
    ↓
保存到 IndexedDB (db.js)
```

### 2. 读取（Read）

```
用户搜索 / Alt+V 填表
    ↓
生成查询向量 (embedding-service.js)
    ↓
语义搜索 / 关键词搜索 (db.js)
    ↓
计算相似度 (embedding-service.js)
    ↓
返回最相关的 chunks
    ↓
access_count +1
```

### 3. 更新（Update）

```
用户重新访问相同页面
    ↓
Decision Agent 判断是否更新 (decision-agent.js)
    ↓
LLM 分析差异
    ↓
决定: 跳过 / 更新 / 合并
    ↓
更新 document 和 chunks
    ↓
重新分析关系
    ↓
update_count +1
```

### 4. 删除（Delete）

```
用户删除文档
    ↓
删除 document (db.js)
    ↓
删除所有相关 chunks (db.js)
    ↓
清理其他 chunks 中指向被删除 chunks 的关系
```

---

## 📚 相关文件

### 数据结构定义
- `src/core/schema-builder.js` - 定义 document 和 chunk 的数据结构

### 数据库操作
- `src/core/db.js` - IndexedDB 封装，CRUD 操作

### 数据生成
- `src/core/text-processor.js` - 文本清洗和分块
- `src/core/embedding-service.js` - 向量嵌入生成
- `src/core/decision-agent.js` - 关系分析和决策

### 数据使用
- `src/features/memory-storage/memory-storage-handler.js` - 存储流程
- `src/features/memory-retrieval/memory-retrieval.js` - 检索流程
- `src/pages/manager.js` - 知识管理器 UI
- `src/pages/knowledge-graph.js` - 知识图谱可视化

---

## 🛠️ 开发建议

### 1. 添加新字段

如果需要添加新字段，建议在 `metadata` 对象中添加，而不是在顶层：

```javascript
// ✅ 推荐
{
  "chunk_id": "...",
  "metadata": {
    "new_field": "new_value"  // 在 metadata 中添加
  }
}

// ❌ 不推荐
{
  "chunk_id": "...",
  "new_field": "new_value"  // 顶层添加会影响索引和查询
}
```

### 2. 关系管理

添加关系时确保双向一致性：

```javascript
// 添加 A elaborates B 的关系
chunkA.relationships.child_chunks.push(chunkB.chunk_id);
chunkB.relationships.parent_chunks.push(chunkA.chunk_id);

// 删除时也要同步
chunkA.relationships.child_chunks =
  chunkA.relationships.child_chunks.filter(id => id !== chunkB.chunk_id);
chunkB.relationships.parent_chunks =
  chunkB.relationships.parent_chunks.filter(id => id !== chunkA.chunk_id);
```

### 3. 索引优化

如果需要频繁按某个字段查询，考虑添加索引：

```javascript
// 在 db.js 的 onupgradeneeded 中
chunksStore.createIndex('new_field', 'metadata.new_field', { unique: false });
```

### 4. 向量更新策略

```javascript
// 批量更新 embeddings 以节省 API 调用
const chunks = await db.getAllChunksWithoutEmbedding();
const embeddings = await generateChunkEmbeddings(chunks, config);
await db.batchUpdateChunks(embeddings);
```

---

## 📖 版本历史

### v1.0 (2024-01-15)
- 初始版本
- 支持 documents 和 memory_chunks 两个表
- 实现知识图谱关系网络
- 支持向量嵌入和语义搜索

---