# Form Auto-Fill Tool - Data Structures

## 1. User Profile Schema

```json
{
  "profile": {
    "personal": {
      "fullName": "string",
      "email": "string",
      "phone": "string",
      "location": "string",
      "summary": "string (2-3 sentences about yourself)"
    },

    "education": [
      {
        "id": "uuid",
        "institution": "string",
        "degree": "string",
        "field": "string",
        "graduationYear": "number",
        "gpa": "number (optional)",
        "relevantCoursework": ["string"],
        "achievements": ["string"]
      }
    ],

    "experience": [
      {
        "id": "uuid",
        "title": "string",
        "company": "string",
        "duration": "string (e.g., 'Jan 2020 - Dec 2022')",
        "description": "string (2-3 sentences)",
        "keyAchievements": ["string"],
        "skills": ["string"],
        "impact": "string (quantifiable results if available)"
      }
    ],

    "skills": [
      {
        "id": "uuid",
        "category": "string (Technical, Leadership, Communication, etc.)",
        "name": "string",
        "proficiency": "Beginner | Intermediate | Advanced | Expert",
        "examples": ["string (concrete examples of using this skill)"]
      }
    ],

    "stories": [
      {
        "id": "uuid",
        "title": "string (e.g., 'Led successful project')",
        "story": "string (2-3 paragraph narrative)",
        "tags": ["string (e.g., 'leadership', 'problem-solving', 'innovation')"],
        "timesUsed": "number (for rotation/variety)"
      }
    ],

    "values": {
      "motivation": ["string (why you want to work/study)"],
      "careerGoals": "string",
      "strengths": ["string"],
      "valuesImportant": ["string (e.g., 'impact', 'growth', 'collaboration')"]
    }
  }
}
```

## 2. Form Detection & Extraction Schema

```json
{
  "formField": {
    "id": "uuid",
    "fieldType": "text | textarea | select | radio | checkbox",
    "label": "string (extracted label text)",
    "placeholder": "string",
    "name": "string (HTML name attribute)",
    "selector": "string (CSS/XPath for reliable re-finding)",
    "isRequired": "boolean",
    "maxLength": "number (optional)"
  },

  "extractedQuestion": {
    "fieldId": "uuid",
    "questionText": "string (full question extracted from label + placeholder)",
    "context": "string (parent form name, section title, etc.)",
    "formUrl": "string (URL where form is located)",
    "timestamp": "ISO string"
  }
}
```

## 3. Generated Answer & History Schema

```json
{
  "generatedAnswer": {
    "id": "uuid",
    "questionId": "uuid",
    "originalQuestion": "string",
    "generatedAnswer": "string",
    "timestamp": "ISO string",
    "status": "pending | approved | rejected | filled",
    "userApproved": "boolean",
    "customization": {
      "tone": "professional | conversational | formal",
      "style": "brief | detailed",
      "targetCompany": "string (optional)"
    },
    "sourceReferences": ["uuid (references to profiles/stories used)"]
  },

  "formHistory": {
    "id": "uuid",
    "formUrl": "string",
    "formTitle": "string",
    "timestamp": "ISO string",
    "fieldsCompleted": "number",
    "totalFields": "number",
    "answers": ["uuid (references to generatedAnswer)"]
  }
}
```

## 4. Settings & Configuration Schema

```json
{
  "settings": {
    "llmProvider": "openai | anthropic | local",
    "apiKey": "string (encrypted in storage)",
    "privacyMode": "boolean (all processing local if true)",
    "autoFillSettings": {
      "requireApproval": "boolean (must click before auto-filling)",
      "avoidRepetition": "boolean (rotate stories to avoid repeats)",
      "minDaysBetweenStories": "number (e.g., 7 days)"
    },
    "customPromptStyle": {
      "tone": "professional | conversational | formal",
      "length": "brief | medium | detailed",
      "includeMetrics": "boolean"
    }
  }
}
```

## 5. Storage Strategy

### Chrome Storage API Usage:
- **`chrome.storage.local`**: User profile, stories, education, experience (unlimited, but ~10MB typical)
- **`chrome.storage.sync`**: Settings, preferences (syncs across Chrome devices, ~100KB)
- **IndexedDB**: Form history, generated answers (if needed for large data)

## 6. Communication Message Format

```json
{
  "contentScriptToBackground": {
    "action": "detectForms | extractQuestion | fillField",
    "payload": {
      "formFields": "[formField]",
      "questionData": "extractedQuestion",
      "fieldSelector": "string"
    }
  },

  "backgroundToContentScript": {
    "action": "sendAnswer | showApprovalUI | error",
    "payload": {
      "answer": "string",
      "fieldId": "uuid",
      "status": "pending | approved | error"
    }
  },

  "contentScriptToLLM": {
    "userProfile": "profile",
    "question": "string",
    "context": "string",
    "customization": "customization object",
    "systemPrompt": "string (pre-crafted for best results)"
  }
}
```

## Privacy & Security Considerations

1. **All personal data stays local** - never sent to LLM backend
2. **Only the question + generated profile context is sent** - not raw personal data
3. **API keys are stored encrypted** in `chrome.storage`
4. **Form history can be cleared** manually
5. **Optional local-only mode** for maximum privacy (if using local LLM)
6. **No tracking** - extension doesn't track user behavior
