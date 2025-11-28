// User Profile Types
export interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string;
  graduationYear: number;
  gpa?: number;
  relevantCoursework: string[];
  achievements: string[];
}

export interface Experience {
  id: string;
  title: string;
  company: string;
  duration: string;
  description: string;
  keyAchievements: string[];
  skills: string[];
  impact?: string;
}

export interface Skill {
  id: string;
  category: string;
  name: string;
  proficiency: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  examples: string[];
}

export interface Story {
  id: string;
  title: string;
  story: string;
  tags: string[];
  timesUsed: number;
}

export interface Values {
  motivation: string[];
  careerGoals: string;
  strengths: string[];
  valuesImportant: string[];
}

export interface UserProfile {
  personal: PersonalInfo;
  education: Education[];
  experience: Experience[];
  skills: Skill[];
  stories: Story[];
  values: Values;
}

// Form Detection Types
export interface FormField {
  id: string;
  fieldType: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'email' | 'url' | 'number' | 'date';
  label: string;
  placeholder?: string;
  name: string;
  selector: string; // CSS selector to re-find the element
  isRequired: boolean;
  maxLength?: number;
}

export interface ExtractedQuestion {
  fieldId: string;
  questionText: string;
  context: string; // parent form name or section title
  formUrl: string;
  timestamp: string;
}

// Generated Answer Types
export interface GeneratedAnswer {
  id: string;
  questionId: string;
  originalQuestion: string;
  generatedAnswer: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected' | 'filled';
  userApproved: boolean;
  customization: {
    tone: 'professional' | 'conversational' | 'formal';
    style: 'brief' | 'detailed';
    targetCompany?: string;
  };
  sourceReferences: string[];
}

export interface FormHistory {
  id: string;
  formUrl: string;
  formTitle: string;
  timestamp: string;
  fieldsCompleted: number;
  totalFields: number;
  answers: string[];
}

// Settings & Configuration Types
export interface LLMSettings {
  provider: 'openai' | 'anthropic' | 'local';
  apiKey: string;
  model?: string; // e.g., 'gpt-4', 'claude-3-sonnet'
}

export interface AutoFillSettings {
  requireApproval: boolean;
  avoidRepetition: boolean;
  minDaysBetweenStories: number;
}

export interface CustomPromptStyle {
  tone: 'professional' | 'conversational' | 'formal';
  length: 'brief' | 'medium' | 'detailed';
  includeMetrics: boolean;
}

export interface Settings {
  llm: LLMSettings;
  privacy: {
    privacyMode: boolean;
  };
  autoFill: AutoFillSettings;
  customPromptStyle: CustomPromptStyle;
}

// Message Types for Communication
export type MessageAction =
  | 'detectForms'
  | 'extractQuestion'
  | 'fillField'
  | 'generateAnswer'
  | 'getProfile'
  | 'saveProfile'
  | 'getSettings'
  | 'saveSettings'
  | 'saveLLMSettings'
  | 'approveAnswer'
  | 'error';

export interface Message {
  action: MessageAction;
  payload: any;
  tabId?: number;
}

export interface ContentScriptMessage {
  action: 'formDetected' | 'questionExtracted' | 'requestAnswer' | 'fieldFilled';
  formFields?: FormField[];
  extractedQuestion?: ExtractedQuestion;
  fieldSelector?: string;
}

// LLM API Types
export interface LLMRequest {
  userProfile: UserProfile;
  question: string;
  context: string;
  customization: CustomPromptStyle & { targetCompany?: string };
  systemPrompt: string;
}

export interface LLMResponse {
  answer: string;
  confidence?: number;
  alternatives?: string[];
}
