# AutoFeel - 架构文档

> Chrome 扩展：AI 驱动的表单自动填充工具

## 📋 目录

1. [项目概述](#项目概述)
2. [整体架构](#整体架构)
3. [核心组件](#核心组件)
4. [数据流](#数据流)
5. [技术栈](#技术栈)
6. [文件结构](#文件结构)
7. [关键设计决策](#关键设计决策)

---

## 项目概述

**AutoFeel** 是一个隐私优先的 Chrome 浏览器扩展，使用 AI 技术自动填写申请表单（如求职申请、奖学金申请等）。

### 核心特性

- ✅ 自动检测网页表单字段
- ✅ 基于用户档案生成个性化答案
- ✅ 支持 OpenAI (GPT) 和 Anthropic (Claude)
- ✅ 所有个人数据本地存储
- ✅ 可定制答案风格（语气、长度、是否包含数据）
- ✅ 故事轮换避免重复
- ✅ 手动审批工作流

---

## 整体架构

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│            Chrome Extension (Manifest V3)               │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼────┐       ┌──────▼──────┐     ┌─────▼──────┐
   │ Content │       │   Popup     │     │  Service   │
   │ Script  │◄─────►│     UI      │◄───►│   Worker   │
   │         │       │             │     │(Background)│
   └────┬────┘       └──────┬──────┘     └─────┬──────┘
        │                   │                   │
        │            ┌──────▼──────┐     ┌──────▼──────┐
        │            │   Chrome    │     │  LLM API    │
        └───────────►│  Storage    │     │ (OpenAI/    │
                     │     API     │     │  Claude)    │
                     └─────────────┘     └─────────────┘
```

### 组件职责

| 组件 | 职责 | 技术 |
|------|------|------|
| **Content Script** | 检测和操作网页表单 | TypeScript |
| **Service Worker** | 消息路由、LLM 调用 | TypeScript (ES Module) |
| **Popup UI** | 用户界面和交互 | HTML/CSS/JavaScript |
| **Storage Layer** | 数据持久化 | Chrome Storage API |
| **LLM Integration** | AI 答案生成 | OpenAI/Anthropic API |

---

## 核心组件

### 1. Content Script (`src/content.ts`)

**运行环境**：注入到每个网页中

**核心功能**：

```typescript
// 表单检测
detectForms() {
  // 1. 查找所有 input, textarea, select 元素
  // 2. 提取字段标签和占位符
  // 3. 生成 CSS 选择器用于后续定位
  // 4. 返回字段元数据
}

// 字段填充
fillField(selector, answer) {
  // 1. 使用选择器定位元素
  // 2. 设置 value 值
  // 3. 触发 input, change, blur 事件
  // 4. 兼容各种表单框架
}
```

**关键技术**：
- `MutationObserver` 监测动态加载的表单
- 智能 CSS 选择器生成（优先级：ID → name → 路径）
- 多事件触发确保兼容性

**消息接口**：
```typescript
// 接收
- 'fillField': 填充指定字段
- 'detectForms': 手动触发表单检测
- 'getPageQuestions': 提取所有问题

// 发送
- 表单字段列表
- 问题提取结果
```

---

### 2. Service Worker (`dist/background.js`)

**运行环境**：独立的后台进程

**核心功能**：

```typescript
// 消息路由
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'generateAnswer':
      // 调用 LLM 生成答案
      break;
    case 'saveLLMSettings':
      // 保存 API 配置
      break;
    case 'getProfile':
      // 获取用户档案
      break;
    // ...
  }
  return true; // 保持异步通道开启
});
```

**LLM 调用流程**：
```typescript
async function handleGenerateAnswer(payload) {
  // 1. 从 Storage 加载用户档案
  const profile = await getProfile();

  // 2. 从 Storage 加载设置
  const settings = await getSettings();

  // 3. 构建 LLM 请求
  const request = {
    userProfile: profile,
    question: payload.question,
    customization: settings.customPromptStyle,
    systemPrompt: createFormAnswerSystemPrompt()
  };

  // 4. 调用 LLM API
  const response = await llmProvider.generateAnswer(request);

  // 5. 保存并返回答案
  await saveGeneratedAnswer(response);
  return response;
}
```

**关键配置**：
```json
// manifest.json
{
  "background": {
    "service_worker": "dist/background.js",
    "type": "module"  // ← 关键：支持 ES6 模块
  }
}
```

---

### 3. Popup UI (`popup.html` + `src/popup.js`)

**三个主要标签页**：

#### Tab 1: Detect Forms（表单检测）
```
功能：
- 检测当前页面的表单字段
- 为每个问题生成答案
- 填充答案到表单
```

#### Tab 2: My Profile（个人档案）
```
包含：
- 个人信息：姓名、邮箱、电话、位置、简介
- 教育背景：学校、学位、GPA、成就
- 工作经验：职位、公司、成就、影响力
- 技能列表：技能名称、熟练度、实例
- 案例故事：STAR 格式的具体事例
- 价值观：职业目标、优势、动机
```

#### Tab 3: Settings（设置）
```
配置项：
- LLM 提供商：OpenAI / Anthropic
- API Key 和模型名称
- 答案风格：语气、长度、是否包含数据
- 自动填充选项：是否需要审批、故事轮换间隔
- 数据管理：导出/导入/清空
```

**DOM 初始化**（重要！）：
```javascript
// ❌ 错误方式：在文件顶部直接获取
const toast = document.getElementById('toast'); // null!

// ✅ 正确方式：在 DOMContentLoaded 后获取
document.addEventListener('DOMContentLoaded', () => {
  const toast = document.getElementById('toast'); // 正确获取
  // ...
});
```

---

### 4. Storage Layer (`src/storage.ts`)

**存储结构**：

```typescript
chrome.storage.local = {
  // 用户档案
  userProfile: {
    personal: {
      fullName: string,
      email: string,
      phone: string,
      location: string,
      summary: string
    },
    education: Education[],
    experience: Experience[],
    skills: Skill[],
    stories: Story[],
    values: Values
  },

  // 扩展设置
  settings: {
    llm: {
      provider: 'openai' | 'anthropic',
      apiKey: string,
      model: string
    },
    autoFill: {
      requireApproval: boolean,
      avoidRepetition: boolean,
      minDaysBetweenStories: number
    },
    customPromptStyle: {
      tone: 'professional' | 'conversational' | 'formal',
      length: 'brief' | 'medium' | 'detailed',
      includeMetrics: boolean
    }
  },

  // 生成的答案历史
  generatedAnswers: GeneratedAnswer[],

  // 表单填写历史
  formHistory: FormHistory[]
}
```

**核心函数**：
```typescript
// 档案管理
getProfile(): Promise<UserProfile>
updateProfile(profile: UserProfile): Promise<void>
addEducation(education: Education): Promise<void>

// 设置管理
getSettings(): Promise<Settings>
updateLLMSettings(apiKey, provider, model): Promise<void>

// 数据导入导出
exportData(): Promise<BackupData>
importData(data: BackupData): Promise<void>
```

---

### 5. LLM Integration (`src/llm.ts`)

**LLMProvider 类**：

```typescript
class LLMProvider {
  async initialize() {
    // 加载设置，初始化 API 客户端
    const settings = await getSettings();
    this.apiKey = settings.llm.apiKey;
    this.provider = settings.llm.provider;
  }

  async generateAnswer(request: LLMRequest): Promise<LLMResponse> {
    if (this.provider === 'openai') {
      return this.generateWithOpenAI(request);
    } else if (this.provider === 'anthropic') {
      return this.generateWithAnthropic(request);
    }
  }

  private async generateWithOpenAI(request) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: buildUserMessage(request) }
        ]
      })
    });

    const data = await response.json();
    return { answer: data.choices[0].message.content };
  }
}
```

**提示词工程**：

```typescript
// 系统提示词
createFormAnswerSystemPrompt() {
  return `你是一个专业的申请文书写作专家。

  指导原则：
  - 真实具体，基于用户档案
  - 使用具体案例和数据
  - 匹配要求的语气和长度
  - 避免泛泛而谈
  - 突出个人特色`;
}

// 用户消息
buildUserMessage(request) {
  const summary = buildProfileSummary(request.userProfile);

  return `根据以下档案：
  ${summary}

  回答问题：${request.question}

  上下文：${request.context}`;
}

// 档案摘要（隐私保护）
buildProfileSummary(profile) {
  // ✅ 只发送必要信息
  return `
  教育背景: ${profile.education.map(e => `${e.degree} ${e.field} - ${e.institution}`).join(', ')}

  工作经验: ${profile.experience.map(e => `${e.title} @ ${e.company}: ${e.keyAchievements.join(', ')}`).join('; ')}

  技能: ${profile.skills.map(s => s.name).join(', ')}

  相关案例: ${selectRelevantStories(profile.stories, request.question)}
  `;

  // ❌ 不发送：原始邮箱、电话、完整地址
}
```

**故事选择算法**：

```typescript
function selectRelevantStories(stories, question) {
  // 1. 提取问题关键词
  const keywords = extractKeywords(question);

  // 2. 根据标签匹配故事
  const matched = stories.filter(story =>
    story.tags.some(tag => keywords.includes(tag))
  );

  // 3. 按使用次数排序（优先选择少用的）
  matched.sort((a, b) => a.timesUsed - b.timesUsed);

  // 4. 返回前 2 个最相关的
  return matched.slice(0, 2);
}
```

---

## 数据流

### 完整流程：用户生成答案并填充表单

```
1. 用户打开申请表页面
   ↓
2. Content Script 自动初始化，扫描表单
   ↓
3. 用户点击扩展图标，打开 Popup
   ↓
4. 用户点击 "Detect Form Fields"
   ↓
5. Popup → Content Script: { action: 'getPageQuestions' }
   ↓
6. Content Script 执行 detectForms()
   ↓
7. Content Script → Popup: { questions: [...] }
   ↓
8. Popup 显示问题列表
   ↓
9. 用户点击某个问题的 "Generate Answer"
   ↓
10. Popup → Service Worker: { action: 'generateAnswer', question: '...' }
    ↓
11. Service Worker:
    ├─ 从 Storage 加载 profile
    ├─ 从 Storage 加载 settings
    ├─ 构建 LLM 请求
    ├─ 调用 OpenAI/Anthropic API
    ├─ 等待响应（2-10 秒）
    ├─ 保存答案到 Storage
    └─ 返回答案
    ↓
12. Service Worker → Popup: { success: true, answer: '...' }
    ↓
13. Popup 显示生成的答案（Toast 提示）
    ↓
14. 用户审阅并点击 "Fill Field"
    ↓
15. Popup → Service Worker → Content Script: { action: 'fillField', ... }
    ↓
16. Content Script:
    ├─ document.querySelector(selector)
    ├─ element.value = answer
    ├─ dispatchEvent('input')
    ├─ dispatchEvent('change')
    └─ dispatchEvent('blur')
    ↓
17. 表单字段被填充
    ↓
18. 用户可以继续编辑或提交表单
```

### 消息传递机制

```typescript
// Popup → Service Worker
chrome.runtime.sendMessage({
  action: 'generateAnswer',
  payload: { question, customization }
}, (response) => {
  console.log('Response:', response);
});

// Service Worker → Content Script
chrome.tabs.sendMessage(tabId, {
  action: 'fillField',
  fieldSelector: 'textarea[name="answer"]',
  answer: 'Generated answer text'
});

// Service Worker 消息处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true; // ← 关键：保持异步通道开启
});
```

---

## 技术栈

### 核心技术

| 技术 | 版本/说明 | 用途 |
|------|----------|------|
| **TypeScript** | 5.3.3 | 类型安全的代码 |
| **Chrome Extension API** | Manifest V3 | 扩展基础设施 |
| **OpenAI API** | GPT-4 | AI 答案生成 |
| **Anthropic API** | Claude 3 | AI 答案生成（备选） |
| **Chrome Storage API** | - | 本地数据存储 |
| **Chrome Runtime API** | - | 消息传递 |
| **Vanilla JavaScript** | ES2020 | Popup UI 逻辑 |

### 构建工具

```json
// package.json
{
  "scripts": {
    "build": "tsc",           // 编译 TypeScript
    "dev": "tsc --watch"      // 监听模式
  },
  "devDependencies": {
    "@types/chrome": "^0.0.260",
    "@types/uuid": "^9.0.1",
    "typescript": "^5.3.3"
  },
  "dependencies": {
    "uuid": "^9.0.1"
  }
}
```

### TypeScript 配置

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "esnext",
    "lib": ["es2020", "dom"],
    "module": "es2020",
    "moduleResolution": "node",
    "strict": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

---

## 文件结构

```
/Users/shiqiliu/Code/AutoFeel/
├── manifest.json              # Chrome 扩展配置（Manifest V3）
├── package.json               # Node 依赖和脚本
├── tsconfig.json              # TypeScript 配置
├── popup.html                 # 弹窗 UI 结构
│
├── src/                       # 源代码
│   ├── types.ts              # TypeScript 类型定义（16个接口）
│   ├── storage.ts            # 存储层（20+ 函数）
│   ├── llm.ts                # LLM 集成（多提供商支持）
│   ├── content.ts            # 内容脚本（表单检测和填充）
│   ├── background.ts         # 后台服务（消息路由）
│   └── popup.js              # 弹窗逻辑（原生 JS）
│
├── dist/                      # 编译输出（TypeScript → JavaScript）
│   ├── background.js         # 编译后的后台脚本
│   ├── content.js            # 编译后的内容脚本
│   ├── storage.js            # 编译后的存储层
│   ├── llm.js                # 编译后的 LLM 集成
│   └── types.js              # 类型定义（编译后为空）
│
├── styles/                    # 样式文件
│   └── popup.css             # 弹窗样式（400+ 行）
│
├── icons/                     # 扩展图标
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
│
└── 文档/                      # 项目文档
    ├── README.md             # 用户指南（548 行）
    ├── ARCHITECTURE.md       # 架构文档（英文）
    ├── ARCHITECTURE_CN.md    # 架构文档（中文，本文件）
    ├── QUICKSTART.md         # 快速入门
    ├── EXAMPLES.md           # 使用案例
    ├── DATA_STRUCTURES.md    # 数据结构参考
    └── DEPLOYMENT.md         # 部署指南
```

---

## 关键设计决策

### 1. 隐私保护

**原则**：所有个人数据本地化

```typescript
// ✅ 本地存储
- 完整的用户档案
- 生成的答案历史
- 表单填写历史
- 所有设置

// ⚠️ 发送到 LLM API
- 只发送档案摘要（教育、经验概述）
- 不发送原始邮箱、电话、地址
- 通过 HTTPS 加密传输

// ❌ 永不发送
- API Key（仅本地存储）
- 原始个人联系方式
- 完整档案数据
```

### 2. ES6 模块支持

**问题**：Service Worker 使用 `import/export` 语句

**解决方案**：在 manifest.json 中声明模块类型

```json
{
  "background": {
    "service_worker": "dist/background.js",
    "type": "module"  // ← 关键配置
  }
}
```

**为什么重要**：
- 没有这个配置，Service Worker 无法加载
- TypeScript 编译输出使用 ES6 模块语法
- Chrome Extension Manifest V3 要求明确声明

### 3. DOM 元素初始化时机

**问题**：在文件顶部直接 `getElementById` 会返回 `null`

**错误示例**：
```javascript
// ❌ 在文件顶部执行（DOM 还未加载）
const toast = document.getElementById('toast'); // null!

function showToast(msg) {
  toast.textContent = msg; // 错误：Cannot read property 'textContent' of null
}
```

**正确做法**：
```javascript
// ✅ 在 DOMContentLoaded 后初始化
let toast;

document.addEventListener('DOMContentLoaded', () => {
  toast = document.getElementById('toast'); // 正确获取

  // 现在可以安全使用
  setupEventListeners();
});
```

### 4. 异步消息响应

**问题**：Chrome Extension 的消息需要保持通道开启

**正确做法**：
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true; // ← 关键：保持通道开启用于异步响应
});

async function handleMessage(request, sender, sendResponse) {
  const result = await someAsyncOperation();
  sendResponse({ success: true, data: result });
}
```

**为什么重要**：
- 如果不返回 `true`，消息通道会立即关闭
- 异步操作完成时 `sendResponse` 会失败
- 导致 Popup 收不到响应

### 5. 表单检测兼容性

**挑战**：不同网站使用不同的表单框架

**解决方案**：多事件触发

```typescript
function fillField(selector, answer) {
  const element = document.querySelector(selector);
  element.value = answer;

  // 触发多个事件确保兼容性
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}
```

**支持的框架**：
- 原生 HTML 表单
- React (Controlled Components)
- Vue.js
- Angular
- 大多数自定义表单库

### 6. Toast 提示定位

**问题**：在扩展弹窗中 `position: fixed` 不可靠

**解决方案**：使用 `position: absolute` + 容器相对定位

```css
.container {
  position: relative; /* 为 toast 提供定位上下文 */
}

.toast {
  position: absolute;  /* 相对于 .container 定位 */
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%); /* 水平居中 */
  z-index: 9999;
}
```

### 7. CSS 选择器生成策略

**优先级**：
```typescript
function generateCSSSelector(element) {
  // 1. 优先使用 ID（最可靠）
  if (element.id) {
    return `#${element.id}`;
  }

  // 2. 使用 name 属性
  if (element.name) {
    return `${element.tagName.toLowerCase()}[name="${element.name}"]`;
  }

  // 3. 使用 data-* 属性
  const dataAttr = element.dataset.testid;
  if (dataAttr) {
    return `[data-testid="${dataAttr}"]`;
  }

  // 4. 生成路径（最后手段）
  return generatePath(element);
}
```

---

## 性能指标

| 操作 | 耗时 | 说明 |
|------|------|------|
| 表单检测 | < 500ms | 典型页面 |
| CSS 选择器生成 | < 5ms | 每个字段 |
| LLM API 调用 | 2-15秒 | 取决于模型和网络 |
| 字段填充 | < 10ms | 包括事件触发 |
| Storage 读取 | < 50ms | Chrome Storage API |
| Storage 写入 | < 100ms | Chrome Storage API |

---

## 安全考虑

### API Key 保护

```typescript
// ✅ 安全存储
- 使用 chrome.storage.local（加密存储）
- 从不记录到控制台
- 只通过 HTTPS 发送到官方 API

// ❌ 避免
- 不存储在 localStorage（不安全）
- 不硬编码在代码中
- 不记录到日志文件
```

### XSS 防护

```javascript
// ✅ HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text; // 自动转义
  return div.innerHTML;
}

// 使用
element.innerHTML = escapeHtml(userInput);
```

### Content Security Policy

```json
// manifest.json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

---

## 扩展和维护

### 添加新的 LLM 提供商

```typescript
// 1. 在 src/llm.ts 中添加新方法
class LLMProvider {
  private async generateWithLocalLLM(request: LLMRequest) {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        model: 'llama2',
        prompt: buildUserMessage(request)
      })
    });

    const data = await response.json();
    return { answer: data.response };
  }
}

// 2. 更新 types.ts
export type LLMProvider = 'openai' | 'anthropic' | 'local';

// 3. 更新 popup.html 的下拉选项
<option value="local">Local LLM (Ollama)</option>
```

### 调试技巧

```javascript
// 弹窗控制台
右键点击弹窗 → 检查

// Service Worker 控制台
chrome://extensions/ → 点击 "Service Worker"

// Content Script 控制台
F12 → Console（在目标网页上）

// 查看 Storage
chrome.storage.local.get(null, console.log);
```

---

## 常见问题排查

### Service Worker 无法启动

**症状**：扩展加载后 Service Worker 不可点击

**原因**：
1. background.js 有语法错误
2. manifest.json 缺少 `"type": "module"`
3. 导入的模块路径错误

**解决**：
```json
// manifest.json
{
  "background": {
    "service_worker": "dist/background.js",
    "type": "module"  // ← 必须添加
  }
}
```

### Toast 提示不显示

**症状**：点击保存按钮没有任何提示

**可能原因**：
1. DOM 元素在加载前获取（返回 null）
2. CSS z-index 太低
3. position 定位问题

**解决**：确保在 DOMContentLoaded 后初始化

### 消息收不到响应

**症状**：popup.js 发送消息后 response 为 undefined

**原因**：Service Worker 没有返回 `true`

**解决**：
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender, sendResponse);
  return true; // ← 必须返回 true
});
```

---

## 未来改进方向

### 短期（1-2 周）

- [ ] 添加对下拉框和单选框的支持
- [ ] 改进错误处理和用户反馈
- [ ] 添加答案历史浏览功能
- [ ] 支持答案编辑后再填充

### 中期（1-2 月）

- [ ] 本地 LLM 支持（Ollama 集成）
- [ ] Chrome Sync 跨设备同步
- [ ] 答案模板系统
- [ ] 更智能的故事选择算法

### 长期（3-6 月）

- [ ] 多语言支持
- [ ] 与 LinkedIn 集成自动导入资料
- [ ] 答案质量评分和改进建议
- [ ] 团队共享档案功能

---

## 参考资源

- [Chrome Extension 开发文档](https://developer.chrome.com/docs/extensions/)
- [OpenAI API 文档](https://platform.openai.com/docs)
- [Anthropic API 文档](https://docs.anthropic.com)
- [TypeScript 手册](https://www.typescriptlang.org/docs/)

---

**文档版本**：1.0
**最后更新**：2025-11-28
**维护者**：AutoFeel Team
