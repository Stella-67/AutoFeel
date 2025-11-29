/**
 * Tool definitions for function calling
 */

// Import FormField from extension types (we'll define a simplified version here)
export interface FormField {
  id: string;
  type: string;
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  selector: string;
}

// Tool definition for LLM
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

// Tool: detectForms
export interface DetectFormsArgs {
  includeHidden?: boolean;
}

export interface DetectFormsResult {
  fields: FormField[];
  url: string;
  pageTitle: string;
}

// Tool: fillField
export interface FillFieldArgs {
  fieldId: string;
  value: string;
  verify?: boolean;
}

export interface FillFieldResult {
  success: boolean;
  fieldLabel: string;
  filledValue: string;
  error?: string;
}

// Tool: extractProfile
export interface ExtractProfileArgs {
  category: 'all' | 'personal' | 'education' | 'experience' | 'skills' | 'stories' | 'values';
  filter?: {
    skillCategory?: string;
    company?: string;
    tags?: string[];
  };
}

export interface ExtractProfileResult {
  category: string;
  data: any;
}

// Tool: generateAnswer
export interface GenerateAnswerArgs {
  question: string;
  context?: string;
  tone?: 'professional' | 'conversational' | 'formal';
  length?: 'brief' | 'medium' | 'detailed';
}

export interface GenerateAnswerResult {
  answer: string;
  confidence: number;
  usedSources?: {
    type: 'experience' | 'education' | 'skill' | 'story';
    id: string;
  }[];
}

// Tool registry
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'detectForms',
      description: 'Detect all form fields on the current webpage that the user is viewing',
      parameters: {
        type: 'object',
        properties: {
          includeHidden: {
            type: 'boolean',
            description: 'Whether to include hidden fields',
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fillField',
      description: 'Fill a specific form field with the provided value',
      parameters: {
        type: 'object',
        properties: {
          fieldId: {
            type: 'string',
            description: 'The unique ID of the field to fill (from detectForms result)'
          },
          value: {
            type: 'string',
            description: 'The value to fill into the field'
          },
          verify: {
            type: 'boolean',
            description: 'Whether to verify the field was filled successfully'
          }
        },
        required: ['fieldId', 'value']
      }
    }
  }
];
