# Application Form Auto-Fill Chrome Extension

A privacy-focused Chrome extension that automatically fills application forms with AI-generated answers based on your personal profile.

## Features

- **Smart Form Detection**: Automatically detects text fields and textareas on any webpage
- **AI-Powered Answer Generation**: Uses OpenAI or Anthropic Claude to generate contextual, personalized answers
- **Profile Management**: Store your education, experience, skills, stories, and values
- **Privacy First**: All personal data stays local on your device
- **Customizable Responses**: Control tone (professional/conversational/formal) and length (brief/medium/detailed)
- **Story Rotation**: Avoids repeating the same stories too frequently
- **Manual Approval Workflow**: Review and approve generated answers before they're filled in
- **Data Export/Import**: Backup and restore your profile data

## Architecture

### System Components

1. **Content Script** (`src/content.ts`)
   - Runs on every webpage
   - Detects form fields and extracts question text
   - Handles field filling with generated answers

2. **Background Service Worker** (`src/background.ts`)
   - Message hub between content script and popup
   - Calls LLM API for answer generation
   - Manages storage operations
   - Handles approval workflow

3. **Popup UI** (`popup.html` + `src/popup.js`)
   - Profile management interface
   - Settings configuration
   - Form detection and answer generation UI

4. **Storage Layer** (`src/storage.ts`)
   - Chrome storage API wrapper
   - Local data persistence
   - Profile CRUD operations

5. **LLM Integration** (`src/llm.ts`)
   - OpenAI and Anthropic API support
   - Intelligent prompt generation
   - Story selection and rotation

### Data Flow

```
User opens form webpage
        ↓
Content Script detects form fields
        ↓
User clicks "Detect Form Fields" in popup
        ↓
Content Script extracts questions
        ↓
User clicks "Generate Answer"
        ↓
Background Worker calls LLM API with:
  - User profile summary
  - Question text
  - Customization preferences
        ↓
LLM returns AI-generated answer
        ↓
User reviews answer (if approval required)
        ↓
User clicks "Fill Field"
        ↓
Content Script fills form field with answer
```

## Setup & Installation

### Prerequisites

- Chrome browser (v88+)
- OpenAI API key (for GPT-4) OR Anthropic API key (for Claude)
- Node.js & npm (for build process)

### Step 1: Get an LLM API Key

**Option A: OpenAI API**
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Keep it secure (you'll need it in step 4)

**Option B: Anthropic API**
1. Go to https://console.anthropic.com/
2. Create a new API key
3. Keep it secure (you'll need it in step 4)

### Step 2: Clone/Setup the Project

```bash
# Navigate to the project directory
cd /home/sl3348/project/Agentic

# Install dependencies
npm install

# Build TypeScript files (if using TypeScript)
npm run build
```

### Step 3: Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer Mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `/home/sl3348/project/Agentic` directory
5. The extension should now appear in your extensions list

### Step 4: Configure API Key

1. Click the extension icon in Chrome toolbar
2. Go to **Settings** tab
3. Enter your LLM API key (OpenAI or Anthropic)
4. Choose your preferred model:
   - OpenAI: `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo`
   - Anthropic: `claude-3-sonnet-20240229`, `claude-3-opus-20240229`
5. Click **Save LLM Settings**

### Step 5: Build Your Profile

1. Go to **My Profile** tab
2. Fill in your personal information:
   - Personal details (name, email, phone, location, summary)
   - Education history
   - Work experience
   - Skills
   - Stories and examples
   - Career goals and values
3. Save each section as you go

## Usage Guide

### Basic Workflow

1. **Navigate to an Application Form**
   - Go to any job application, scholarship application, or online form

2. **Open the Extension**
   - Click the Form Auto-Fill icon in your Chrome toolbar

3. **Detect Forms**
   - Click "Detect Form Fields"
   - The extension will find all text fields and textareas on the page

4. **Generate Answers**
   - Click "Generate Answer" next to each question
   - The AI will create a personalized response based on your profile

5. **Review & Approve**
   - Read the generated answer
   - Modify if needed
   - Click to fill the form field

6. **Submit Form**
   - Once all fields are complete, submit the form manually
   - The extension does NOT auto-submit

### Advanced Features

#### Customize Answer Style

In Settings tab, adjust:
- **Tone**: Professional, Conversational, or Formal
- **Length**: Brief (1-2 sentences), Medium (2-3), Detailed (3-4)
- **Include Metrics**: Add quantifiable results to answers

#### Story Rotation

Enable "Avoid repeating the same stories" to:
- Rotate through different stories for similar questions
- Prevents using the same example multiple times on one day
- Configure minimum days between reusing stories

#### Manual Approval Workflow

Enable "Require approval before filling fields" to:
- Review each AI-generated answer before it's filled in
- Modify answers before submission
- Prevent unwanted auto-fills

#### Data Privacy

- **Local Storage Only**: Your profile stays on your computer
- **No Personal Data Sent to LLM**: Only sanitized question + profile summary is sent
- **Encrypted API Keys**: API keys are stored securely in Chrome storage
- **No Tracking**: Extension doesn't track your behavior

## Data Structures

### User Profile Example

```json
{
  "personal": {
    "fullName": "John Doe",
    "email": "john@example.com",
    "phone": "+1 (555) 000-0000",
    "location": "San Francisco, CA",
    "summary": "Software engineer with 5+ years of experience in full-stack development and cloud infrastructure."
  },
  "education": [
    {
      "id": "uuid",
      "institution": "Stanford University",
      "degree": "B.S.",
      "field": "Computer Science",
      "graduationYear": 2018,
      "gpa": 3.8,
      "relevantCoursework": ["Algorithms", "Machine Learning", "Distributed Systems"],
      "achievements": ["Summa Cum Laude", "President of Coding Club"]
    }
  ],
  "experience": [
    {
      "id": "uuid",
      "title": "Senior Software Engineer",
      "company": "Google",
      "duration": "Jan 2020 - Present",
      "description": "Led development of microservices handling 10M+ requests/day...",
      "keyAchievements": ["Reduced latency by 40%", "Mentored 5 junior engineers"],
      "skills": ["Python", "Go", "Kubernetes", "PostgreSQL"],
      "impact": "40% latency reduction, $2M cost savings annually"
    }
  ],
  "skills": [
    {
      "id": "uuid",
      "category": "Technical",
      "name": "Python",
      "proficiency": "Expert",
      "examples": ["Built ETL pipeline processing 1TB daily", "Led ML model deployment"]
    }
  ],
  "stories": [
    {
      "id": "uuid",
      "title": "Led successful cloud migration",
      "story": "When I joined Google, our monolithic system was hitting scalability limits. I led the design and implementation of a microservices architecture using Kubernetes...",
      "tags": ["leadership", "technical", "impact"],
      "timesUsed": 0
    }
  ],
  "values": {
    "motivation": ["Solving real-world problems", "Learning new technologies"],
    "careerGoals": "Become a CTO and drive technical excellence in a fast-growing company",
    "strengths": ["Technical depth", "Team leadership", "Communication"],
    "valuesImportant": ["Impact", "Growth", "Collaboration"]
  }
}
```

### Form Field Structure

```json
{
  "id": "uuid",
  "fieldType": "textarea",
  "label": "Tell us about a challenging project you've led",
  "placeholder": "Enter your response",
  "name": "project_experience",
  "selector": "textarea[name='project_experience']",
  "isRequired": true,
  "maxLength": 1000
}
```

### Generated Answer Structure

```json
{
  "id": "uuid",
  "questionId": "uuid",
  "originalQuestion": "Tell us about a challenging project you've led",
  "generatedAnswer": "During my time at Google, I led the migration of our monolithic system to microservices...",
  "timestamp": "2024-01-15T10:30:00Z",
  "status": "pending",
  "userApproved": false,
  "customization": {
    "tone": "professional",
    "style": "detailed",
    "targetCompany": "Google"
  },
  "sourceReferences": ["story-uuid-123"]
}
```

## API Reference

### Message Types

#### Generate Answer
```javascript
chrome.runtime.sendMessage({
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
})
```

#### Get Profile
```javascript
chrome.runtime.sendMessage({
  action: 'getProfile'
}, (response) => {
  console.log(response.data) // UserProfile object
})
```

#### Get Settings
```javascript
chrome.runtime.sendMessage({
  action: 'getSettings'
}, (response) => {
  console.log(response.data) // Settings object
})
```

#### Fill Form Field
```javascript
chrome.runtime.sendMessage({
  action: 'fillField',
  payload: {
    fieldSelector: 'textarea[name="answer"]',
    answer: 'Generated answer text'
  }
})
```

## Configuration

### Settings Schema

```typescript
interface Settings {
  llm: {
    provider: 'openai' | 'anthropic';
    apiKey: string;
    model?: string;
  };
  privacy: {
    privacyMode: boolean;
  };
  autoFill: {
    requireApproval: boolean;
    avoidRepetition: boolean;
    minDaysBetweenStories: number;
  };
  customPromptStyle: {
    tone: 'professional' | 'conversational' | 'formal';
    length: 'brief' | 'medium' | 'detailed';
    includeMetrics: boolean;
  };
}
```

## Troubleshooting

### Forms Not Detected
- Ensure content script has permission for the website
- Try clicking "Detect Form Fields" again
- Check browser console for errors (`F12` → Console tab)

### LLM API Errors
- Verify API key is correct
- Check that API key has sufficient quota/credits
- Ensure you've selected the correct LLM provider
- Wait a moment and try again (rate limiting)

### Generated Answers Are Poor Quality
- Ensure your profile has detailed information
- Try adjusting the tone/length settings
- Provide context when generating answers
- Update your profile with more examples and achievements

### Fields Not Filling
- Some websites use custom form libraries that don't respond to standard DOM events
- Try manually copying the generated answer
- Report the website to support for potential workaround

### Data Not Saving
- Check that you're clicking "Save" buttons
- Ensure you haven't disabled Chrome extension storage
- Try clearing browser cache and reloading extension
- Export your data regularly as backup

## Privacy & Security

### Data Handling
- ✅ All personal data stored locally in browser
- ✅ Only question + profile summary sent to LLM
- ✅ No tracking or analytics
- ✅ No cookies or identifiers
- ✅ API keys encrypted in storage

### Limitations
- ⚠️ Data is lost if you clear browser data (use Export feature for backup)
- ⚠️ Extension is tied to your Chrome profile
- ⚠️ LLM provider (OpenAI/Anthropic) receives your API key

### Best Practices
1. Use a dedicated API key (not your main account key)
2. Regularly export and back up your profile data
3. Review generated answers before submitting
4. Don't share your extension settings across untrusted devices
5. Keep your API key secret and rotate it periodically

## Development

### Project Structure

```
/home/sl3348/project/Agentic/
├── manifest.json              # Extension manifest
├── popup.html                 # Extension popup UI
├── src/
│   ├── types.ts              # TypeScript interfaces
│   ├── storage.ts            # Storage layer
│   ├── llm.ts                # LLM integration
│   ├── content.ts            # Content script
│   ├── background.ts         # Service worker
│   └── popup.js              # Popup UI logic
├── styles/
│   └── popup.css             # Popup styling
├── icons/                     # Extension icons
└── README.md                 # This file
```

### Building from Source

```bash
# Install dependencies
npm install

# Compile TypeScript (if using TypeScript)
npm run build

# Watch for changes
npm run dev
```

### Adding Support for New LLM Providers

1. Edit `src/llm.ts` and add new provider method
2. Update `LLMProvider.generateAnswer()` to handle new provider
3. Add configuration in Settings UI
4. Test with sample questions

### Common Customizations

**Change Default Settings:**
```typescript
// In src/storage.ts, update DEFAULT_SETTINGS
const DEFAULT_SETTINGS: Settings = {
  llm: { provider: 'anthropic', apiKey: '', model: 'claude-3-sonnet-20240229' },
  // ...
}
```

**Modify LLM Prompt:**
```typescript
// In src/llm.ts, edit createFormAnswerSystemPrompt()
export function createFormAnswerSystemPrompt(): string {
  return `Your custom system prompt here...`
}
```

**Customize Answer Style:**
```typescript
// In src/llm.ts, modify buildSystemPrompt() and buildUserMessage()
```

## Examples

### Example: Applying for a Job

1. Open Workday job application
2. Click "Detect Form Fields"
3. For "Tell us about a recent achievement":
   - Click "Generate Answer"
   - Extension creates: "Led migration of our system to microservices, reducing latency by 40% and saving the company $2M annually"
4. For "Describe your leadership experience":
   - Click "Generate Answer"
   - Extension creates: "As technical lead, I mentored 5 junior engineers through code reviews and pair programming sessions, while maintaining 99.9% system uptime"
5. Review and submit form

### Example: University Application

1. Open scholarship application form
2. Fill profile with educational background and achievements
3. For "Why do you want to attend our program?":
   - Extension generates compelling answer based on your values and goals
4. For "Describe a challenging problem you've solved":
   - Extension selects from your stories, avoiding repetition
5. Submit application

## Limitations & Future Work

### Current Limitations
- Only supports text/textarea fields (not radio, checkbox, select)
- Some websites with complex form libraries may not work
- LLM API costs apply based on usage
- Requires internet connection for API calls
- No mobile browser support (Chrome on Android)

### Planned Features
- ✨ Support for dropdown and checkbox fields
- ✨ Local LLM support (using Ollama or similar)
- ✨ Chrome Sync for cross-device access
- ✨ Answer templates and pre-written responses
- ✨ Form history and analytics
- ✨ Integration with LinkedIn and job boards
- ✨ Multi-language support
- ✨ Voice input for stories

## Support & Feedback

- Report issues: Create an issue in the repository
- Feature requests: Discuss in pull requests or issues
- Documentation: See DATA_STRUCTURES.md for technical details

## License

MIT License - Feel free to use and modify for personal use.

## Disclaimer

This extension is provided as-is. Users are responsible for:
- Ensuring all information in their profile is truthful and accurate
- Reviewing all generated answers before submission
- Complying with application requirements and platforms' terms of service
- Not using this tool for deceptive purposes

Always review and customize generated answers to ensure they accurately represent you.
