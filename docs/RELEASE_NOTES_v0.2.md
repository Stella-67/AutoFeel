# AutoFeel v0.2 - Intelligent Form Filler with RAG

> **Release Date**: 2025-12-02
> **Version**: v0.2.0
> **Major Update**: RAG-Enhanced Auto-Fill + Multi-Provider Support

---

## 🎯 Overview

AutoFeel v0.2 is an intelligent browser extension that helps you save web content to a personal knowledge base and automatically fill forms using AI.

### Core Features

1. **Smart Content Saving** (Option+C): Save any webpage to your personal knowledge base
2. **Auto Form Filling** (Option+V): Automatically fill forms using your saved knowledge
3. **RAG Retrieval**: Retrieve relevant information from your knowledge base
4. **Multi-Provider Support**: OpenAI, Anthropic Claude, DeepSeek, or Custom API
5. **Knowledge Manager**: Organize and search your saved content

---

## ✨ Key Features

### 1. Save Content to Knowledge Base (Option+C)

**How it works:**

```
Press Option+C on any webpage
    ↓
1. Extract page content
   ├─ Visible text extraction
   ├─ Special handling for Google Docs, Notion, Medium
   └─ Metadata collection (title, URL, word count)
    ↓
2. LLM Text Processing
   ├─ Clean and structure the text
   └─ Remove noise and formatting
    ↓
3. Chunk and Embed
   ├─ Split into semantic chunks (200-500 words)
   ├─ Generate embeddings (OpenAI/Custom only)
   └─ Calculate chunk importance
    ↓
4. Save to IndexedDB
   ├─ Document metadata
   ├─ Text chunks
   └─ Vector embeddings
```

**Supported platforms:**
- ✅ Regular webpages
- ✅ Google Docs (with special handling)
- ✅ Notion pages
- ✅ Medium articles
- ✅ Any HTML content

### 2. Auto Form Filling (Option+V)

**How it works:**

```
Press Option+V on a form page
    ↓
1. Detect Form Fields
   ├─ Input fields (text, email, tel, number, etc.)
   ├─ Textareas
   ├─ Select dropdowns
   └─ 8 detection methods (including aria-labelledby)
    ↓
2. RAG Retrieval (per field)
   ├─ OpenAI/Custom: Semantic search with embeddings
   ├─ DeepSeek/Anthropic: Keyword-based search
   └─ Retrieve top 3 relevant chunks
    ↓
3. LLM Answer Generation
   ├─ Build context-aware prompt
   ├─ Include retrieved chunks
   └─ Get structured JSON response
    ↓
4. Fill Form with Animation
   ├─ Sequential filling (one field at a time)
   ├─ Smooth scroll to each field
   ├─ Typing animation for short answers
   └─ Visual feedback (green highlight)
```

**Smart features:**
- ✅ **Streaming Mode**: Fills fields one by one as answers are generated
- ✅ **Empty Field Hints**: Shows LLM explanation when unable to answer
- ✅ **Progress Indicators**: Shows "Generating answer 1/3..."
- ✅ **Animations**: Smooth typing and highlighting effects

### 3. RAG (Retrieval-Augmented Generation)

**Two retrieval methods:**

#### Method 1: Semantic Search (OpenAI/Custom)
```javascript
// Generate query embedding
queryEmbedding = await generateEmbedding("What is your email?");

// Search by vector similarity
results = await memoryDB.semanticSearch(queryEmbedding, 3);
// Returns: Top 3 chunks with 85-95% similarity
```

#### Method 2: Keyword Search (DeepSeek/Anthropic)
```javascript
// Extract keywords
keywords = ["email", "address"];

// Search by keyword matching
results = await memoryDB.keywordSearch("What is your email?", 3);
// Returns: Top 3 chunks by keyword frequency × importance
```

**Retrieval stats:**
- ⚡ Semantic search: ~200-500ms (API call + vector search)
- ⚡ Keyword search: <10ms (local computation)
- 📊 Returns top 3 chunks with relevance scores

### 4. Multi-Provider Support

| Provider | Chat API | Embeddings | Retrieval Method |
|----------|----------|------------|------------------|
| **OpenAI** | ✅ | ✅ | Semantic Search |
| **Anthropic** | ✅ | ❌ | Keyword Search |
| **DeepSeek** | ✅ | ❌ | Keyword Search |
| **Custom API** | ✅ | ✅ | Semantic Search |

**Supported models:**

**OpenAI:**
- gpt-4o (Latest, Recommended)
- gpt-4o-mini (Faster, Cheaper)
- gpt-4-turbo, gpt-4, gpt-3.5-turbo

**Anthropic:**
- claude-3-5-sonnet-20241022 (Latest, Recommended)
- claude-3-5-haiku-20241022 (Faster, Cheaper)
- claude-3-opus, claude-3-sonnet, claude-3-haiku

**DeepSeek:**
- deepseek-chat (Recommended)
- deepseek-coder

### 5. Knowledge Manager

**Access:** Click extension icon → "📚 Knowledge Manager"

**Features:**
- 📊 View all saved documents
- 🔍 Search with two modes:
  - **Fuzzy Search**: Match by title, URL, or content
  - **Semantic Search**: Find by meaning (OpenAI only)
- 👁️ View document details and chunks
- 🗑️ Delete individual documents
- 💾 Export all knowledge to JSON
- ⚠️ Clear all knowledge

---

## 🏗️ System Architecture

### Modular Design

```
src/
├── background.js           (624 lines) - Main service worker
│   ├─ Option+C handler (save content)
│   ├─ Option+V handler (auto-fill form)
│   └─ Streaming form fill logic
│
├── contentScript.js        (1203 lines) - Content extraction & form filling
│   ├─ Text extraction (Google Docs, Notion, Medium)
│   ├─ Form field detection (8 methods)
│   └─ Field filling with animations
│
├── db.js                   (742 lines) - IndexedDB operations
│   ├─ Document & chunk storage
│   ├─ Semantic search (vector similarity)
│   └─ Keyword search (fallback)
│
├── llm-service.js          (199 lines) - LLM API calls
│   ├─ Request body building
│   ├─ Multi-provider support
│   └─ Token usage tracking
│
├── embedding-service.js    (89 lines) - Embedding generation
│   └─ OpenAI text-embedding-3-small
│
├── text-processor.js       (357 lines) - Text processing pipeline
│   ├─ LLM pre-cleaning
│   ├─ Post-cleanup
│   └─ Semantic chunking
│
├── schema-builder.js       (81 lines) - Schema construction
│   ├─ Document schema
│   └─ Chunk schema
│
├── utils.js                (205 lines) - Utility functions
│   ├─ Notification helper
│   ├─ JSON parser
│   └─ HTML utilities
│
├── popup.js                (649 lines) - Settings UI
│   ├─ LLM configuration
│   ├─ Token usage statistics
│   └─ Memory search interface
│
└── manager.js              (620 lines) - Knowledge manager UI
    ├─ Document list view
    ├─ Search interface
    └─ Document viewer

Total: ~4,750 lines of clean, modular code
```

---

## 🎨 User Experience

### Notifications

**Saving content:**
```
✅ Content saved to buffer! Processing in background...
```

**Form filling:**
```
Generating answer 1/3...
Generating answer 2/3...
✅ Successfully filled 2/3 fields
```

**Empty field hints:**
```
💡 AutoFeel: The context does not mention your phone number.
Please save your contact details using Alt+C.
```

### Debug Logging

**Enable:** Open Service Worker console (Extension page → AutoFeel → Service Worker → Inspect)

**Sample output:**
```javascript
================================================================================
[AutoFeel Debug] 🔍 OPTION+V AUTO-FILL STARTED
================================================================================
[AutoFeel Debug] Step 1: Detected 3 form fields:
  Field 0: {label: "Full Name", type: "text"}
  Field 1: {label: "Email Address", type: "email"}
  Field 2: {label: "Phone Number", type: "tel"}

────────────────────────────────────────────────────────────────────────────────
[AutoFeel Debug] 📝 FIELD: "Full Name"
────────────────────────────────────────────────────────────────────────────────
[AutoFeel Debug] Step 1: Generating embedding for query...
[AutoFeel Debug] Step 2: Searching for relevant context (top 3 chunks)...
[AutoFeel Debug] ✅ Found 3 relevant chunks:

  📄 Chunk 1:
     Similarity: 92.3%
     Source: John Doe - LinkedIn Profile
     URL: https://linkedin.com/in/johndoe
     Content Preview: John Doe, Senior Software Engineer at TechCorp...
     Full Content: John Doe, Senior Software Engineer...

[AutoFeel Debug] Step 3: LLM response received
[AutoFeel Debug] Raw LLM output: {"answer": "John Doe", "explanation": null}
[AutoFeel Debug] Token usage: {inputTokens: 245, outputTokens: 8, totalTokens: 253}
[AutoFeel Debug] ✅ Answer: John Doe
```

---

## 📂 File Structure

```
AutoFeel/
├── manifest.json           - Extension manifest (MV3)
├── popup.html              - Settings page
├── manager.html            - Knowledge manager
├── result.html             - Document viewer
│
├── src/                    - JavaScript modules
│   ├── background.js       - Service worker
│   ├── contentScript.js    - Content extraction & filling
│   ├── db.js               - Database operations
│   ├── llm-service.js      - LLM API
│   ├── embedding-service.js- Embedding generation
│   ├── text-processor.js   - Text processing
│   ├── schema-builder.js   - Schema building
│   ├── utils.js            - Utilities
│   ├── popup.js            - Settings UI logic
│   └── manager.js          - Manager UI logic
│
├── styles/                 - CSS files
│   ├── common.css          - Shared styles
│   ├── popup.css           - Settings styles
│   └── manager.css         - Manager styles
│
├── icons/                  - Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
│
└── docs/                   - Documentation
    └── RELEASE_NOTES_v0.2.md
```

---

## 🧪 Quick Start

### 1. Installation

1. Clone or download this repository
2. Open Chrome → Extensions → Enable "Developer mode"
3. Click "Load unpacked" → Select the AutoFeel folder

### 2. Configuration

1. Click the AutoFeel extension icon
2. Select LLM Provider (OpenAI, Anthropic, DeepSeek, or Custom)
3. Enter your API Key
4. Select Model
5. Click "Test Connection" to verify
6. Click "Save Settings"

### 3. Usage

**Save content to knowledge base:**
1. Open any webpage with useful information
2. Press **Option+C** (Mac) or **Alt+C** (Windows)
3. Wait for confirmation notification

**Auto-fill forms:**
1. Make sure you've saved relevant information first
2. Open a form page
3. Press **Option+V** (Mac) or **Alt+V** (Windows)
4. Watch as fields are filled automatically

---

## 🎯 Example Workflows

### Workflow 1: Job Application

```
Step 1: Save your information
├─ Open LinkedIn profile → Option+C
├─ Open your resume → Option+C
└─ Open cover letter → Option+C

Step 2: Auto-fill application forms
├─ Open job application form
├─ Press Option+V
└─ Review and submit
```

### Workflow 2: Event Registration

```
Step 1: Save contact info
└─ Open a page with your contact details → Option+C

Step 2: Fill registration forms
├─ Open event registration
├─ Press Option+V
└─ Fields like name, email, phone are auto-filled
```

### Workflow 3: Research Notes

```
Step 1: Save research materials
├─ Read academic paper → Option+C
├─ Read documentation → Option+C
└─ Read blog post → Option+C

Step 2: Search your knowledge base
├─ Open Settings → Memory Search
├─ Enter search query
└─ View relevant chunks
```

---

## 📊 Performance

| Operation | Time | Notes |
|-----------|------|-------|
| **Save Content** | ||
| - Text extraction | <100ms | Instant |
| - LLM cleaning | 1-3s | Background |
| - Chunking | <50ms | Local |
| - Embedding generation | 200-500ms/chunk | OpenAI API |
| - Database save | <100ms | Local |
| **Auto-Fill** | ||
| - Field detection | <50ms | Local |
| - Semantic search | <50ms | Vector similarity |
| - Keyword search | <10ms | Local |
| - LLM answer (per field) | 500-2000ms | API call |
| - Field filling | 100-500ms | Animation |
| **Total (3 fields)** | 2-7s | Depends on provider |

---

## 🐛 Known Issues & Solutions

### Issue 1: Form fields not detected

**Symptoms:** Option+V shows "No form fields found"

**Solutions:**
- Make sure you're on a page with input fields
- Some dynamic forms may need time to load
- Check Service Worker console for detection logs

### Issue 2: Cannot answer questions

**Symptoms:** All fields show empty with explanation

**Solutions:**
- Make sure you've saved relevant information first (Option+C)
- Check that the saved content contains the required information
- For semantic search, make sure you're using OpenAI or Custom provider

### Issue 3: "Provider does not support embeddings"

**Symptoms:** Using DeepSeek/Anthropic but no chunks retrieved

**Expected behavior:** This is normal. DeepSeek and Anthropic use keyword search instead of semantic search. Make sure your saved content contains exact keyword matches.

---

## 🔧 Advanced Configuration

### Token Usage Statistics

View in Settings → "Token Usage Statistics":
- Total input/output tokens
- Per-provider breakdown
- Request counts
- Last updated time

### Memory Search

Two search modes:
1. **Fuzzy Search** (Fast, all providers)
   - Searches title, URL, and content
   - Simple keyword matching

2. **Semantic Search** (Accurate, OpenAI only)
   - Searches by meaning
   - Requires embedding generation
   - Returns relevance scores

### Debug Mode

Enable detailed logging:
1. Open Extension page → AutoFeel → Service Worker → Inspect
2. Console will show:
   - Field detection details
   - RAG retrieval results
   - LLM prompts and responses
   - Token usage
   - Timing information

---

## 📈 Improvements from v0.1

| Feature | v0.1 | v0.2 |
|---------|------|------|
| **Form Filling** | Basic | ✅ Streaming + Animations |
| **RAG Retrieval** | None | ✅ Semantic + Keyword |
| **Multi-Provider** | OpenAI only | ✅ OpenAI + Anthropic + DeepSeek |
| **Keyword Search** | None | ✅ Fallback for non-OpenAI |
| **Empty Field Hints** | None | ✅ LLM explanations |
| **Debug Logging** | Basic | ✅ Comprehensive |
| **Code Organization** | Monolithic | ✅ Modular (6 modules) |
| **Lines of Code** | ~6,700 | ~4,750 (cleaner) |

---

## 🚀 Future Roadmap

### v0.3 Planned Features
- [ ] Browser history analysis for better context
- [ ] Multi-language support
- [ ] Batch form filling (multiple forms at once)
- [ ] Context prioritization (recent vs. relevant)

### v0.4 Planned Features
- [ ] Cloud sync (cross-device)
- [ ] Collaborative knowledge bases
- [ ] AI chat interface
- [ ] Mobile browser support

---

## 💡 Tips & Best Practices

### 1. Save Comprehensive Information
- Save your resume, LinkedIn, portfolio
- Save contact information
- Save frequently used data

### 2. Use Meaningful Titles
- The extension uses page titles for retrieval
- Edit page titles if needed before saving

### 3. Check Retrieved Context
- Open Service Worker console
- Verify correct chunks are being retrieved
- Adjust your saved content if needed

### 4. Choose the Right Provider
- **OpenAI**: Best accuracy (semantic search)
- **DeepSeek**: Good balance (cheap + keyword search)
- **Anthropic**: Claude quality (keyword search)

---

## 📞 Support

For issues or questions:
- Check Service Worker console for error messages
- Review this documentation
- Check the debug logs

---

## 📄 License

MIT License

---

## 🎉 Changelog

### v0.2.0 (2025-12-02)
- ✅ Added RAG retrieval (semantic + keyword)
- ✅ Added multi-provider support (OpenAI, Anthropic, DeepSeek)
- ✅ Added streaming form fill mode
- ✅ Added empty field explanations
- ✅ Added keyword search fallback
- ✅ Improved field detection (8 methods)
- ✅ Added form filling animations
- ✅ Improved debug logging
- ✅ Code refactoring (removed 2000+ lines of unused code)
- ✅ Modular architecture (6 clean modules)

### v0.1.0 (2025-11-01)
- Initial release
- Basic content saving
- Basic form filling
- OpenAI integration

---

**Version**: v0.2.0
**Release Date**: 2025-12-02
**Status**: ✅ Production Ready

Thank you for using AutoFeel! 🎉
