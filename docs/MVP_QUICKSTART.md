# AutoFeel Chat MVP - 快速开始指南

## 🎉 MVP 完成！

你的 AutoFeel Chat MVP 已经构建完成！这是一个功能完整的最小可行版本，包含：

- ✅ 完整的聊天界面
- ✅ OpenAI/Anthropic LLM 集成
- ✅ 对话历史保存（IndexedDB）
- ✅ Function Calling（工具调用）
- ✅ Extension 桥接（表单检测和填写）
- ✅ 状态管理（Zustand）

## 📦 项目结构

```
AutoFeel/
├── src/                  # Chrome Extension 源代码
│   ├── background.ts     # 后台服务（包含 WebApp 工具调用处理）
│   ├── content.ts        # 内容脚本（表单检测）
│   ├── webapp-bridge.ts  # WebApp 通信桥接
│   └── ...
├── dist/                 # Extension 构建输出
│
└── webapp/               # React WebApp
    ├── src/
    │   ├── components/   # UI 组件
    │   ├── stores/       # Zustand 状态管理
    │   ├── services/     # LLM、Storage、Extension 桥接
    │   └── types/        # TypeScript 类型定义
    └── dist/            # WebApp 构建输出
```

## 🚀 启动步骤

### 1. 安装 Chrome Extension

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 启用右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `/Users/shiqiliu/Code/AutoFeel` 目录
6. 扩展已安装！你应该能在扩展列表中看到 "Application Form Auto-Fill"

### 2. 启动 WebApp

打开终端，运行：

```bash
cd /Users/shiqiliu/Code/AutoFeel/webapp
npm run dev
```

这会启动 Vite 开发服务器，通常在 `http://localhost:5173`

### 3. 配置 API Key

1. 打开 `http://localhost:5173` 在浏览器中
2. 你会看到 Settings 页面（因为还没配置 API key）
3. 选择你的 LLM 提供商：
   - **OpenAI**: 从 [platform.openai.com/api-keys](https://platform.openai.com/api-keys) 获取
   - **Anthropic**: 从 [console.anthropic.com](https://console.anthropic.com/) 获取
4. 输入 API Key 并选择模型
5. 点击 "Save Settings"

## 🧪 测试流程

### 基础聊天测试

1. **创建新对话**
   - 点击左侧的 "+ New Chat" 按钮
   - 或点击空白页面的 "New Conversation"

2. **发送消息**
   - 在底部输入框输入：`你好，请介绍一下你自己`
   - 按 Enter 或点击 "Send"
   - 等待 AI 回复

3. **验证**
   - ✅ 消息显示在聊天窗口
   - ✅ AI 回复正常显示
   - ✅ 对话保存在左侧列表中

### 工具调用测试

1. **打开一个表单页面**
   - 在新标签页打开任意带表单的网站（如 Google Forms）
   - 或者打开 https://www.google.com/forms/ 创建测试表单

2. **在 WebApp 中触发工具调用**
   - 在聊天中输入：`请帮我检测当前页面的表单字段`
   - AI 会自动调用 `detectForms` 工具
   - 你应该能看到：
     - ✅ 消息中显示「🔧 Calling: detectForms」
     - ✅ 工具调用参数（JSON 格式）
     - ✅ 工具执行结果（字段列表）
     - ✅ AI 对结果的总结

3. **测试字段填写**
   - 输入：`请帮我填写第一个字段，内容是"测试内容"`
   - AI 会调用 `fillField` 工具
   - 切换到表单页面，应该能看到字段被填写

## 🔍 调试技巧

### WebApp 调试

1. **打开浏览器开发者工具**
   - 在 WebApp 页面按 F12
   - 查看 Console 标签

2. **常见日志**
   ```
   [AutoFeel Bridge] Initializing webapp bridge...
   [AutoFeel Bridge] Bridge ready, listening for messages
   [AutoFeel Bridge] Forwarding tool call to extension: detectForms
   ```

### Extension 调试

1. **查看 Background Worker 日志**
   - 打开 `chrome://extensions/`
   - 找到 "Application Form Auto-Fill"
   - 点击「Service Worker」旁的「inspect」链接
   - 查看 Console

2. **查看 Content Script 日志**
   - 在任意网页按 F12
   - 查看 Console
   - 应该能看到 `[FormAutoFill]` 开头的日志

### 常见问题

**Q: WebApp 无法连接到 Extension？**
- A: 检查：
  1. Extension 是否已安装且启用
  2. WebApp 运行在 `localhost`
  3. 浏览器控制台是否有错误
  4. 尝试刷新 WebApp 页面

**Q: 工具调用失败？**
- A: 检查：
  1. Extension background worker 是否有错误
  2. 是否在正确的标签页（表单页面需要在 active tab）
  3. 表单页面是否真的有表单

**Q: AI 不调用工具？**
- A: 确保：
  1. 你的提示明确要求操作（如"检测表单"、"填写字段"）
  2. API Key 正确且有权限使用 function calling
  3. 选择的模型支持 function calling（如 gpt-4, claude-3-sonnet）

## 📊 架构图

```
┌────────────────────────────────────────────────────┐
│              WebApp (localhost:5173)               │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │  Chat UI     │  │  LLM        │  │  Storage │ │
│  │  (React)     │──│  Provider   │──│  (IDB)   │ │
│  └──────────────┘  └─────────────┘  └──────────┘ │
│         │                  │                       │
│         │                  └─ Tool Calls           │
│         │                                          │
│         └──────┬──postMessage───────────────┬─────┘
│                │                             │
│         ┌──────▼──────────────────────────┐ │
│         │  webapp-bridge.ts               │ │
│         │  (Injected Content Script)      │ │
│         └──────┬──────────────────────────┘ │
│                │                             │
└────────────────┼─────────────────────────────┘
                 │ chrome.runtime.sendMessage
                 │
┌────────────────▼─────────────────────────────────┐
│          Chrome Extension                        │
│  ┌───────────────────────────────────────────┐  │
│  │  background.ts                            │  │
│  │  - webappToolCall handler                 │  │
│  │  - detectForms / fillField tools          │  │
│  └──────────┬────────────────────────────────┘  │
│             │                                    │
│  ┌──────────▼──────────┐                        │
│  │  content.ts         │                        │
│  │  - Form detection   │                        │
│  │  - Field filling    │                        │
│  └─────────────────────┘                        │
│             │                                    │
│             │ Direct DOM manipulation            │
│             ▼                                    │
└─────────────────────────────────────────────────┘
             │
             ▼
     ┌──────────────┐
     │  Web Page    │
     │  (Forms)     │
     └──────────────┘
```

## 🎯 下一步

MVP 完成后，你可以考虑添加：

1. **Streaming 支持**
   - 实时显示 AI 回复
   - 更好的用户体验

2. **思考过程可视化**
   - 显示 AI 的推理步骤
   - 类似 o1 模型的思考链

3. **多模态支持**
   - 上传表单截图
   - GPT-4V / Claude with Vision 识别

4. **更多工具**
   - `extractProfile` - 提取用户资料
   - `generateAnswer` - 生成表单答案
   - `analyzeForm` - 分析表单结构

5. **UI 改进**
   - 对话重命名
   - 搜索历史
   - 导出对话

## 📝 已知限制

1. **非 streaming 模式**
   - 当前版本等待完整响应后才显示
   - 下一步可添加 streaming 支持

2. **工具自动执行**
   - MVP 版本自动执行所有工具调用
   - 可添加用户确认步骤

3. **仅支持 localhost**
   - Extension bridge 只注入到 localhost
   - 生产环境需要配置域名

4. **错误处理**
   - 基础错误显示
   - 可添加重试机制和更友好的错误提示

---

**恭喜！** 🎉 你已经成功完成了 AutoFeel Chat MVP！

如有问题，检查：
- Browser Console (WebApp)
- Extension Background Worker Console
- Extension Content Script Console

Happy Chatting! 🚀
