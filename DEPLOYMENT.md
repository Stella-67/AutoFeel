# Deployment & Development Guide

Complete guide for deploying, maintaining, and extending the Application Form Auto-Fill extension.

## Table of Contents

1. [Initial Setup](#initial-setup)
2. [Development Environment](#development-environment)
3. [Building & Testing](#building--testing)
4. [Publishing to Chrome Web Store](#publishing-to-chrome-web-store)
5. [Maintenance & Updates](#maintenance--updates)
6. [Advanced Customization](#advanced-customization)
7. [Troubleshooting](#troubleshooting)

---

## Initial Setup

### Prerequisites

- Node.js 16+ and npm 8+
- Chrome browser (version 88+)
- Git (for version control)
- A text editor or IDE (VS Code recommended)

### Installation

```bash
# Clone or navigate to project directory
cd /home/sl3348/project/Agentic

# Install dependencies
npm install

# Build TypeScript (creates dist/ folder)
npm run build
```

### Verify Installation

1. Open `chrome://extensions/`
2. Enable Developer Mode (top right toggle)
3. Click "Load unpacked"
4. Select the Agentic folder
5. You should see the extension appear!

---

## Development Environment

### Project Structure

```
Agentic/
├── src/
│   ├── types.ts              # TypeScript types
│   ├── storage.ts            # Storage layer
│   ├── llm.ts                # LLM integration
│   ├── content.ts            # Content script
│   ├── background.ts         # Service worker
│   └── popup.js              # Popup UI logic
├── styles/
│   └── popup.css             # Styles
├── popup.html                # Popup interface
├── manifest.json             # Extension manifest
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── README.md                 # User documentation
├── QUICKSTART.md             # Quick start guide
├── EXAMPLES.md               # Usage examples
├── DATA_STRUCTURES.md        # Data format reference
└── DEPLOYMENT.md             # This file
```

### Development Workflow

#### 1. Make Code Changes

Edit files in `src/` directory.

**Example: Modify LLM prompt**

```typescript
// src/llm.ts
export function createFormAnswerSystemPrompt(): string {
  return `You are an expert at writing compelling applications...

[Your custom instructions here]
`
}
```

#### 2. Compile TypeScript

```bash
# One-time build
npm run build

# Watch for changes (auto-rebuild)
npm run dev
```

This creates JavaScript files that Chrome can execute.

#### 3. Reload Extension in Chrome

1. Go to `chrome://extensions/`
2. Find "Application Form Auto-Fill"
3. Click the refresh icon (↻)

#### 4. Test Your Changes

Open a test form and verify the changes work.

#### 5. Check Browser Console for Errors

1. Right-click anywhere on the page
2. Select "Inspect" → go to "Console" tab
3. Look for any error messages

### Hot Reload Setup (Optional)

To auto-reload the extension without manual refresh:

```bash
# Install extension auto-reload tool
npm install -g extensionizr

# Or use this npm script in development
npm install --save-dev @types/chrome
```

### Debugging Tips

#### View Console Logs

The extension uses `console.log()` for debugging:

```javascript
// src/content.ts
console.log('[FormAutoFill] Content script loaded');
```

To see logs:
1. Open any webpage with forms
2. Right-click → Inspect → Console tab
3. Look for messages starting with `[FormAutoFill]`

#### View Storage Data

```javascript
// In browser console
chrome.storage.local.get(null, (result) => {
  console.log('Stored data:', result);
});
```

#### Test LLM API Calls

```javascript
// In popup console
chrome.runtime.sendMessage({
  action: 'generateAnswer',
  payload: {
    question: 'Tell me about yourself',
    customization: { tone: 'professional', length: 'medium' }
  }
}, (response) => {
  console.log('Response:', response);
});
```

---

## Building & Testing

### Compile TypeScript

```bash
npm run build
```

Creates JavaScript files in appropriate locations. **Note:** For this MVP, JavaScript is in `src/` and loads directly from there.

### Running Tests

Currently, no automated tests. To add:

```bash
npm install --save-dev jest @types/jest ts-jest

# Create jest.config.js
# Add test files (*.test.ts)
npm test
```

### Manual Testing Checklist

- [ ] Form detection works on multiple websites
- [ ] Generated answers are sensible
- [ ] Fields fill correctly with generated text
- [ ] Profile saves and loads properly
- [ ] Settings are persisted
- [ ] API key errors are handled gracefully
- [ ] Extension handles network errors
- [ ] Data export/import works
- [ ] Clear data function works

### Testing on Different Websites

**Test Sites:**
1. Create a local HTML form (see QUICKSTART.md)
2. LinkedIn job application (https://www.linkedin.com)
3. Workday form (various companies use this)
4. University application form
5. Google Forms

---

## Publishing to Chrome Web Store

### Requirements

- Chrome Web Store Developer Account ($5 one-time fee)
- Finished extension package
- Icon assets (128x128px minimum)
- Store listing copy (title, description, screenshots)

### Step 1: Prepare Assets

#### Create Icons

Generate icons at different sizes:
- 16x16px - favicon
- 48x48px - extension list
- 128x128px - Web Store

```bash
mkdir -p icons
# Add your icon images here as:
# icons/icon-16.png
# icons/icon-48.png
# icons/icon-128.png
```

Example: Create a simple icon using a graphics editor or tool like:
- Figma (free)
- Canva (free)
- GIMP (free, open source)

Icon design ideas:
- 📋 Form clipboard
- 🤖 Robot/AI
- ⚡ Lightning bolt
- 🚀 Rocket

#### Create Screenshots

Take 4-5 screenshots for the store:
1. Extension popup showing profile
2. Form detection in action
3. Settings panel
4. Generated answers
5. Filled form field

Recommended size: 1280x800px

### Step 2: Create Store Listing

#### Metadata

```
Name: Application Form Auto-Fill
Subtitle: AI-powered form filling for job and school applications

Short Description (132 chars max):
Automatically fill application forms with AI-generated answers based on your profile.

Full Description (should be 2-3 paragraphs):
[See README.md for full description content]

Developer Name: [Your Name/Company]
Website: [Your website or GitHub URL]
Support Email: [Your support email]
```

#### Screenshots

Place in `/store-assets/` directory:
- `screenshot-1.png`
- `screenshot-2.png`
- etc.

### Step 3: Package Extension

```bash
# Create a ZIP file for submission
zip -r application-form-autofill.zip \
  manifest.json \
  popup.html \
  src/ \
  styles/ \
  icons/ \
  -x "node_modules/*" "dist/*" ".git/*"
```

### Step 4: Submit to Chrome Web Store

1. Go to https://chrome.google.com/webstore/developer/dashboard
2. Click "New Item"
3. Upload the ZIP file
4. Fill in all metadata:
   - Title
   - Description
   - Screenshots
   - Category: Productivity
   - Language: English
   - Regions: All
5. Set pricing: Free
6. Accept terms and submit

### Step 5: Review Process

- Chrome usually reviews within 1-3 days
- They check for:
  - Security issues
  - Privacy compliance
  - Proper permissions usage
  - No malware

If rejected, address feedback and resubmit.

### Step 6: Monitor Performance

Once published:
- Monitor user reviews
- Check crash reports in developer dashboard
- Update extension with bug fixes
- Add features based on user feedback

---

## Maintenance & Updates

### Version Management

Update version in `manifest.json`:

```json
{
  "version": "0.1.0"  // Change to 0.2.0 for updates
}
```

Follow semantic versioning:
- **0.1.0** → **0.1.1**: Bug fixes
- **0.1.0** → **0.2.0**: New features
- **0.1.0** → **1.0.0**: Major release

### Updating Dependencies

```bash
# Check for outdated packages
npm outdated

# Update packages safely
npm update

# For major updates
npm install typescript@latest @types/chrome@latest
```

### Changelog

Keep a CHANGELOG.md file:

```markdown
## [0.2.0] - 2024-02-15

### Added
- Support for dropdown field selection
- Story rotation algorithm
- Data export/import functionality

### Fixed
- Fixed content script not detecting forms on some websites
- Fixed LLM API timeout issues

### Changed
- Improved form field detection accuracy
```

### Release Process

1. Update version in `manifest.json`
2. Update `CHANGELOG.md`
3. Run tests and verify manually
4. Create a git tag: `git tag v0.2.0`
5. Build the package
6. Submit to Chrome Web Store
7. Update README with latest features

---

## Advanced Customization

### Custom LLM Providers

Add support for new LLM providers:

```typescript
// src/llm.ts
async generateAnswer(request: LLMRequest): Promise<LLMResponse> {
  if (this.settings.llm.provider === 'local') {
    return this.generateWithLocalLLM(request);
  }
  // ...
}

private async generateWithLocalLLM(request: LLMRequest): Promise<LLMResponse> {
  // Call local Ollama server at http://localhost:11434
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      model: 'llama2',
      prompt: this.buildUserMessage(request),
      stream: false
    })
  });

  const data = await response.json();
  return { answer: data.response };
}
```

### Custom UI Themes

Edit `styles/popup.css`:

```css
:root {
  /* Change these for dark mode or custom theme */
  --primary-color: #4f46e5;
  --bg-white: #1f2937;
  --text-primary: #ffffff;
}
```

### Integration with Other Services

Example: Integrate with LinkedIn:

```typescript
// In content.ts
function integrateLinkedInData() {
  // Extract LinkedIn profile data
  const name = document.querySelector('[data-test-id="profile-card"] h1')?.textContent;
  const headline = document.querySelector('[data-test-id="headline"]')?.textContent;

  // Sync to extension profile
  chrome.runtime.sendMessage({
    action: 'updateProfile',
    payload: { personal: { fullName: name } }
  });
}
```

### Multi-Language Support

Create language files:

```typescript
// src/i18n.ts
export const messages = {
  en: {
    'detectBtn': 'Detect Form Fields',
    'generateBtn': 'Generate Answer'
  },
  es: {
    'detectBtn': 'Detectar Campos de Formulario',
    'generateBtn': 'Generar Respuesta'
  }
};

// In popup.html
<button id="detectBtn" data-i18n="detectBtn">Detect Form Fields</button>
```

### Performance Optimization

```typescript
// Use debouncing for form detection
function detectFormsDebounced() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    detectForms();
  }, 500);
}

// Cache LLM responses to avoid duplicate API calls
const answerCache = new Map<string, string>();

async function generateAnswer(question: string) {
  const cacheKey = hashQuestion(question);
  if (answerCache.has(cacheKey)) {
    return answerCache.get(cacheKey);
  }

  const answer = await llm.generateAnswer(...);
  answerCache.set(cacheKey, answer);
  return answer;
}
```

---

## Troubleshooting

### Extension Won't Load

**Problem:** "Error loading extension"

**Solution:**
1. Check `manifest.json` for syntax errors (use JSON validator)
2. Ensure all referenced files exist
3. Try removing and reloading

### Changes Not Taking Effect

**Problem:** Modified code but extension still shows old behavior

**Solution:**
1. Make sure you ran `npm run build`
2. Refresh extension in `chrome://extensions/`
3. Clear browser cache (Ctrl+Shift+Delete)
4. Close and reopen all tabs

### API Key Not Working

**Problem:** "API error: Invalid API key"

**Solution:**
1. Verify key is correct (copy from account page again)
2. Check that key has appropriate permissions
3. Ensure key hasn't been revoked
4. Try creating a new key

### LLM Not Responding

**Problem:** API calls time out or fail frequently

**Solution:**
```typescript
// Add retry logic in src/llm.ts
async generateWithRetry(request: LLMRequest, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await this.generateAnswer(request);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential backoff
    }
  }
}
```

### Memory Issues

**Problem:** Extension slows down after extended use

**Solution:**
```typescript
// Clear old generated answers periodically
async function clearOldAnswers() {
  const answers = await getGeneratedAnswers();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30); // Keep 30 days

  const filtered = answers.filter(a => new Date(a.timestamp) > cutoffDate);
  await chrome.storage.local.set({ generatedAnswers: filtered });
}
```

### Form Detection Not Working on Website X

**Problem:** Some websites' forms not detected

**Solution:**
Some sites use custom form libraries. Add site-specific handling:

```typescript
// In src/content.ts
function detectSiteSpecificForms() {
  // Workday
  if (window.location.hostname.includes('workday.com')) {
    const fields = document.querySelectorAll('[data-automation-id*="textarea"]');
    // Custom detection...
  }

  // Greenhouse
  if (window.location.hostname.includes('greenhouse.io')) {
    const fields = document.querySelectorAll('.greenhouse-text-field');
    // Custom detection...
  }
}
```

---

## Getting Help

### Resources

- [Chrome Extension Developer Docs](https://developer.chrome.com/docs/extensions/)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [Anthropic API Docs](https://docs.anthropic.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Community Support

- Report issues on GitHub
- Check existing issues for solutions
- Ask questions in discussions

---

## Future Roadmap

### High Priority
- [ ] Support for select/dropdown fields
- [ ] Support for radio buttons and checkboxes
- [ ] Better form detection for special frameworks (React, Vue, Angular)
- [ ] Ability to save field-specific answers
- [ ] Multi-language profile support

### Medium Priority
- [ ] Chrome Sync for cross-device access
- [ ] Local LLM support (Ollama integration)
- [ ] Scheduled profile updates
- [ ] Integration with job boards
- [ ] Answer version history/A/B testing

### Lower Priority
- [ ] Mobile Chrome support
- [ ] Firefox extension version
- [ ] Web app version (non-extension)
- [ ] Team/shared profiles
- [ ] Advanced analytics

---

Remember: Always test thoroughly before releasing updates! 🚀
