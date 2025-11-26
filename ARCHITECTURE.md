# System Architecture Guide

Deep dive into the technical architecture of the Application Form Auto-Fill extension.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                   Application Form Auto-Fill Extension          │
│                        (Chrome Extension)                        │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Content Script  │  │   Popup UI       │  │  Service Worker  │
│  (Form Detect)   │  │  (Profile Edit)  │  │  (Message Hub)   │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                        (chrome.runtime)
                               │
                    ┌──────────┴─────────┐
                    │                    │
              ┌─────▼──────┐      ┌──────▼──────┐
              │ Chrome     │      │  LLM API    │
              │ Storage    │      │ (OpenAI/    │
              │ API        │      │  Anthropic) │
              └────────────┘      └─────────────┘
```

## Component Architecture

### 1. Content Script (`src/content.ts`)

**Purpose:** Detect and interact with form elements on webpages

**Responsibilities:**
- Detect form fields (text, textarea, select, etc.)
- Extract labels and placeholder text
- Generate CSS selectors for reliable element finding
- Fill form fields with generated answers
- Trigger appropriate events (change, input, blur)

**Key Functions:**
```typescript
initializeContentScript()      // Setup and form detection
detectForms()                  // Find all form elements
extractFormField()             // Get field metadata
extractFieldLabel()            // Extract question text
fillField()                    // Populate field with answer
triggerInputEvent()            // Trigger change events
generateCSSSelector()          // Create reliable selector
```

**Message Handling:**
```
Receives:
  - 'fillField'         → Fill specific field with answer
  - 'detectForms'       → Manually trigger form detection
  - 'getPageQuestions'  → Extract all questions

Sends:
  - Form fields detected
  - Questions extracted
  - Fill confirmations
```

**Critical Design Decisions:**
- Uses MutationObserver to detect dynamically added forms
- Generates robust CSS selectors (ID → name → parent path)
- Triggers multiple events to handle various form libraries
- Handles hidden elements gracefully

### 2. Background Service Worker (`src/background.ts`)

**Purpose:** Central message hub and LLM orchestration

**Responsibilities:**
- Route messages between content script and popup
- Call LLM API for answer generation
- Manage storage operations
- Handle approval workflow
- Log and error handling

**Key Functions:**
```typescript
handleMessage()               // Main message router
handleGenerateAnswer()        // LLM integration
handleApproveAnswer()         // Approval workflow
chrome.runtime.onMessage      // Message listener
```

**Message Flow:**
```
Content Script
    │
    └─→ chrome.runtime.sendMessage({action: 'generateAnswer'})
           │
           └─→ Background Worker
               │
               ├─→ Load profile from storage
               ├─→ Build LLM request
               ├─→ Call LLM API
               ├─→ Save answer to storage
               │
               └─→ Return answer to popup/content script
```

**LLM Integration:**
```typescript
// Initializes LLM provider on startup
llmProvider = new LLMProvider();
await llmProvider.initialize();

// On answer generation request:
const response = await llmProvider.generateAnswer({
  userProfile,      // User's stored profile
  question,         // Form question text
  context,          // Form title/section
  customization,    // Tone, length, etc.
  systemPrompt      // Guided LLM behavior
});
```

**Error Handling:**
```typescript
try {
  // Process message
} catch (error) {
  console.error('[FormAutoFill] Error:', error);
  sendResponse({ error: error.message });
}
```

### 3. Popup UI (`popup.html`, `src/popup.js`, `styles/popup.css`)

**Purpose:** User interface for profile management and settings

**Three Main Tabs:**

#### Tab 1: Detect Forms
```
┌─────────────────────────────┐
│ Form Questions              │
│ ─────────────────────────   │
│ [Detect Form Fields]        │
│ ─────────────────────────   │
│ □ Question 1                │
│   [Generate Answer]         │
│ □ Question 2                │
│   [Generate Answer]         │
│ □ Question 3                │
│   [Generate Answer]         │
└─────────────────────────────┘
```

#### Tab 2: My Profile
```
┌─────────────────────────────┐
│ Personal Information        │
│ [Name] [Email] [Phone]      │
│ [Summary]                   │
│                             │
│ Education                   │
│ [+Add] [List of schools]    │
│                             │
│ Experience                  │
│ [+Add] [List of jobs]       │
│                             │
│ Skills                      │
│ [+Add] [List of skills]     │
│                             │
│ Stories                     │
│ [+Add] [List of stories]    │
│                             │
│ Values & Goals              │
│ [Career Goals]              │
│ [Strengths]                 │
│ [Values]                    │
└─────────────────────────────┘
```

#### Tab 3: Settings
```
┌─────────────────────────────┐
│ LLM Configuration           │
│ [Provider dropdown]         │
│ [API Key input]             │
│ [Model name]                │
│                             │
│ Auto-Fill Preferences       │
│ ☑ Require approval          │
│ ☑ Avoid repetition          │
│ [Days between reuse: 7]     │
│                             │
│ Answer Style                │
│ [Tone dropdown]             │
│ [Length dropdown]           │
│ ☑ Include metrics           │
│                             │
│ Data Management             │
│ [Export] [Import] [Clear]   │
└─────────────────────────────┘
```

**Key Functions:**
```typescript
loadProfile()                // Load profile from storage
loadSettings()               // Load settings from storage
savePersonalInfo()           // Save profile updates
saveLLMSettings()            // Save API configuration
detectForms()                // Trigger form detection
generateAnswer()             // Call background worker
displayDetectedForms()       // Render form fields
showToast()                  // Show user notifications
```

**Data Binding:**
```javascript
// When user opens popup:
1. Load profile from chrome.storage
2. Populate all form fields with values
3. Load settings and update checkboxes/dropdowns

// When user submits form:
1. Collect form values
2. Send to background worker for API call
3. Save updates to storage
4. Show toast notification
```

### 4. Storage Layer (`src/storage.ts`)

**Purpose:** Abstraction layer over Chrome Storage API

**Storage Structure:**
```javascript
chrome.storage.local = {
  userProfile: { ... },        // Main user data
  settings: { ... },           // Configuration
  generatedAnswers: [ ... ],   // Answer history
  formHistory: [ ... ]         // Form completion history
}
```

**Key Functions:**
```typescript
// Profile Operations
getProfile()                   // Get full profile
updateProfile()                // Save full profile
addEducation()                 // Add education entry
updateEducation()              // Update education entry
deleteEducation()              // Delete education entry
// ... similar for experience, skills, stories

// Settings Operations
getSettings()                  // Get all settings
updateSettings()               // Save settings
updateLLMSettings()            // Save LLM config

// Answer Management
saveGeneratedAnswer()          // Save AI-generated answer
updateGeneratedAnswer()        // Update answer status
deleteGeneratedAnswer()        // Delete answer

// Form History
saveFormHistory()              // Record form completion
deleteFormHistory()            // Clear history

// Data Management
exportData()                   // Export all data as JSON
importData()                   // Import JSON backup
clearAllData()                 // Delete all data
```

**Storage Quotas:**
```
chrome.storage.local:
  - Typical: ~100MB per extension
  - All profile data: < 1MB typical
  - Safe to store thousands of answers

chrome.storage.sync:
  - Maximum: ~100KB across all extensions
  - Used for: Settings only
```

### 5. LLM Integration (`src/llm.ts`)

**Purpose:** Abstract LLM API interactions

**Class: `LLMProvider`**

**Supported Providers:**
```typescript
provider = "openai" | "anthropic" | "local"

// OpenAI
generateWithOpenAI(): Uses gpt-4, gpt-3.5-turbo, etc.
Endpoint: https://api.openai.com/v1/chat/completions
Auth: Bearer token in Authorization header

// Anthropic
generateWithAnthropic(): Uses Claude models
Endpoint: https://api.anthropic.com/v1/messages
Auth: x-api-key header
```

**Prompt Engineering Flow:**

```
User Profile
    ↓
buildProfileSummary()
    ↓
Sanitized Profile Text (no raw personal data)
    ↓
LLM System Prompt + User Message
    ↓
"Generate answer for this question using profile context"
    ↓
LLM Response
    ↓
Post-process and return answer
```

**System Prompt Construction:**
```typescript
// buildSystemPrompt() creates:
1. Role definition: "You are an expert at writing applications"
2. Base instructions: Custom prompt passed in
3. Key principles:
   - Be authentic and specific
   - Show impact with metrics
   - Tailor tone and length
   - Avoid generic phrases
   - Use concrete examples
   - Keep concise but meaningful
```

**Story Selection:**
```typescript
selectRelevantStories()
  ↓
Analyze question keywords
  ↓
Filter matching story tags
  ↓
Sort by least recently used (timesUsed)
  ↓
Return top 1-2 stories
  ↓
Included in LLM context
```

**Response Handling:**
```
LLM Response
    ↓
Extract text from response
    ↓
Trim whitespace
    ↓
Return as LLMResponse object with:
  - answer: string
  - confidence: number
  - alternatives: string[] (optional)
```

## Data Flow Diagrams

### Scenario 1: User Opens Form Page

```
1. Page Loads
   ↓
2. Content Script initializes
   ↓
3. Content Script scans for forms
   ↓
4. Mutation Observer watches for dynamic forms
   ↓
5. Ready for user interaction
```

### Scenario 2: User Clicks "Detect Form Fields"

```
1. User clicks button in popup
   ↓
2. popup.js: sendMessage('getPageQuestions')
   ↓
3. Content Script receives message
   ↓
4. Content Script: detectForms()
   ↓
5. Content Script: extractAllPageQuestions()
   ↓
6. Content Script: sends array of questions back
   ↓
7. Popup displays: displayDetectedForms()
   ↓
8. User sees list of form fields with "Generate Answer" buttons
```

### Scenario 3: User Clicks "Generate Answer"

```
1. User clicks "Generate Answer" for a question
   ↓
2. Popup: generateAnswer({question, fieldId, customization})
   ↓
3. Background Worker receives message
   ↓
4. Background Worker: handleGenerateAnswer()
   │
   ├─→ Load profile from storage
   ├─→ Load settings from storage
   ├─→ Build LLM request:
   │   - profileSummary = buildProfileSummary()
   │   - question = user input
   │   - systemPrompt = createFormAnswerSystemPrompt()
   │   - customization = tone/length/metrics settings
   │
   ├─→ Call LLM API: llmProvider.generateAnswer()
   │   │
   │   ├─→ Choose provider (OpenAI or Anthropic)
   │   ├─→ Build HTTP request
   │   ├─→ Make API call with timeout
   │   ├─→ Parse response
   │   └─→ Return answer
   │
   ├─→ Save answer to storage
   ├─→ Return answer to popup
   │
5. Popup displays answer
6. User reviews and clicks "Fill Field" or "Reject"
```

### Scenario 4: User Approves Answer

```
1. User clicks "Fill Field" button
   ↓
2. Popup sends: {action: 'fillField', fieldSelector, answer}
   ↓
3. Background Worker routes to Content Script
   ↓
4. Content Script: fillField(selector, answer)
   │
   ├─→ Find element: document.querySelector(selector)
   ├─→ Set value: element.value = answer
   ├─→ Trigger events:
   │   - change event
   │   - input event
   │   - blur event
   │
5. Webpage detects change
6. Form field is populated
7. User can review and make edits
8. User submits form (manually)
```

## Message Types & Format

### Message: Detect Forms
```typescript
// From: Popup or external
// To: Content Script
{
  action: 'detectForms' | 'getPageQuestions'
}

// Response
{
  questions: [
    {
      fieldId: string,
      questionText: string,
      context: string,
      formUrl: string,
      timestamp: string
    }
  ]
}
```

### Message: Generate Answer
```typescript
// From: Popup
// To: Background Worker
{
  action: 'generateAnswer',
  payload: {
    question: string,
    context?: string,
    fieldId?: string,
    customization?: {
      tone: 'professional' | 'conversational' | 'formal',
      length: 'brief' | 'medium' | 'detailed',
      targetCompany?: string,
      includeMetrics?: boolean
    }
  }
}

// Response
{
  success: true,
  data: {
    answerId: string,
    answer: string,
    status: 'pending' | 'approved'
  }
}
```

### Message: Fill Field
```typescript
// From: Popup or Background Worker
// To: Content Script
{
  action: 'fillField',
  payload: {
    fieldSelector: string,
    answer: string
  }
}

// Response
{
  success: boolean,
  filled?: boolean
}
```

### Message: Get/Save Profile
```typescript
// From: Popup
// To: Background Worker
{
  action: 'getProfile' | 'getSettings'
}

// Response
{
  success: boolean,
  data: UserProfile | Settings
}
```

## Timing & Performance

### Form Detection
- **Initial scan**: < 500ms (typical page)
- **Per field**: < 1ms
- **Selector generation**: < 5ms

### LLM API Call
- **Request building**: < 50ms
- **Network latency**: 200-2000ms (varies)
- **LLM processing**: 1-10 seconds
- **Total**: ~2-15 seconds

### Form Filling
- **Finding element**: < 1ms
- **Setting value**: < 1ms
- **Triggering events**: < 5ms
- **Total**: < 10ms

### Storage Operations
- **Read**: < 50ms
- **Write**: < 100ms

## Error Handling

### Content Script Errors
```typescript
try {
  const field = extractFormField(element);
  if (field) formFields.push(field);
} catch (error) {
  console.error('[FormAutoFill] Error extracting field:', error);
  // Continue with next field
}
```

### LLM API Errors
```typescript
if (!response.ok) {
  const error = await response.json();
  throw new Error(`OpenAI API error: ${error.error.message}`);
  // Caught by background worker and sent to popup
}
```

### Storage Errors
```typescript
try {
  await chrome.storage.local.set({...});
} catch (error) {
  console.error('[FormAutoFill] Storage error:', error);
  showToast('Failed to save data');
}
```

## Security Considerations

### API Key Storage
```typescript
// Keys stored in chrome.storage.local (encrypted at rest)
// Never logged, never exposed to console
// Sent only to official LLM API endpoints via HTTPS
```

### Personal Data Privacy
```typescript
// Full profile never sent to API
// Only sanitized summary sent:
"Education: B.S. CS from MIT (2018)
 Experience: Senior SWE at Google (2021-present)
 Skills: Python, Go, Kubernetes
 ..."

// Never sent:
// - Raw email, phone, full address
// - Unpublished stories
// - Sensitive achievement details
```

### DOM Security
```typescript
// HTML escaping in popup
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Used when displaying user data
item.innerHTML = escapeHtml(userData);
```

## Extension Lifecycle

### Installation
```
1. User loads unpacked / installs from Web Store
2. manifest.json is parsed
3. Service worker (background.ts) is initialized
4. chrome.storage is checked for existing data
5. If first run: initializeStorage() creates defaults
```

### On Page Load
```
1. Content script injected (manifest.json content_scripts)
2. DOM ready → initializeContentScript()
3. Form detection starts
4. Mutation observer activated
5. Ready to receive messages from popup
```

### On Popup Open
```
1. popup.html loaded
2. DOMContentLoaded event fires
3. loadProfile() → reads from storage
4. loadSettings() → reads from storage
5. UI populated with current values
6. Event listeners attached
7. Ready for user interaction
```

### On Answer Generation
```
1. User clicks "Generate Answer"
2. Message → Background Worker
3. Background Worker initiates LLM API call
4. While waiting: User can see loading state (optional future feature)
5. API responds: Answer saved to storage
6. Response sent to popup
7. Popup displays answer
8. User reviews and approves/rejects
```

## Extension Permissions Used

```json
{
  "permissions": [
    "storage",           // Read/write to chrome.storage
    "tabs",              // Access tab info
    "activeTab",         // Access current tab
    "scripting",         // Inject/execute scripts
    "webRequest"         // Monitor web requests (optional)
  ],
  "host_permissions": [
    "<all_urls>"         // Run on all websites
  ]
}
```

## Future Architecture Improvements

### Phase 2: Caching
```typescript
// Cache LLM responses for identical questions
const answerCache = new Map<string, string>();

async function getAnswerCached(question: string) {
  const hash = hashQuestion(question);
  if (answerCache.has(hash)) {
    return answerCache.get(hash);
  }
  const answer = await generateAnswer(question);
  answerCache.set(hash, answer);
  return answer;
}
```

### Phase 2: Retry Logic
```typescript
async function generateWithRetry(request, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await llmProvider.generateAnswer(request);
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await delay(1000 * Math.pow(2, attempt)); // Exponential backoff
    }
  }
}
```

### Phase 3: Local LLM Support
```typescript
// Support Ollama running locally
async generateWithLocalLLM(request: LLMRequest) {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      model: 'llama2',
      prompt: buildUserMessage(request),
      stream: false
    })
  });
  // ...
}
```

---

This architecture is designed for:
✅ **Simplicity**: Easy to understand and modify
✅ **Privacy**: All data stays local
✅ **Scalability**: Can handle complex forms
✅ **Extensibility**: Easy to add features
✅ **Reliability**: Proper error handling
✅ **Performance**: Optimized for speed
