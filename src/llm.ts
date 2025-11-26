import { UserProfile, LLMRequest, LLMResponse, CustomPromptStyle } from './types';
import { getSettings } from './storage';

/**
 * LLM Integration Module
 * Handles API calls to OpenAI, Anthropic, and supports local LLM options
 */

export class LLMProvider {
  private settings: any;

  async initialize() {
    this.settings = await getSettings();
  }

  /**
   * Generate an answer for a form question using the user's profile
   */
  async generateAnswer(request: LLMRequest): Promise<LLMResponse> {
    if (!this.settings) {
      await this.initialize();
    }

    if (this.settings.llm.provider === 'openai') {
      return this.generateWithOpenAI(request);
    } else if (this.settings.llm.provider === 'anthropic') {
      return this.generateWithAnthropic(request);
    } else {
      throw new Error('Unsupported LLM provider');
    }
  }

  /**
   * Generate answer using OpenAI API
   */
  private async generateWithOpenAI(request: LLMRequest): Promise<LLMResponse> {
    const systemPrompt = this.buildSystemPrompt(request.userProfile, request.systemPrompt);
    const userMessage = this.buildUserMessage(request);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.settings.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: this.settings.llm.model || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error.message}`);
    }

    const data = await response.json();
    const answer = data.choices[0].message.content.trim();

    return {
      answer,
      confidence: 0.85, // Placeholder confidence score
    };
  }

  /**
   * Generate answer using Anthropic Claude API
   */
  private async generateWithAnthropic(request: LLMRequest): Promise<LLMResponse> {
    const systemPrompt = this.buildSystemPrompt(request.userProfile, request.systemPrompt);
    const userMessage = this.buildUserMessage(request);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.settings.llm.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.settings.llm.model || 'claude-3-sonnet-20240229',
        max_tokens: 500,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Anthropic API error: ${error.error.message}`);
    }

    const data = await response.json();
    const answer = data.content[0].text.trim();

    return {
      answer,
      confidence: 0.85,
    };
  }

  /**
   * Build the system prompt that guides the LLM
   */
  private buildSystemPrompt(profile: UserProfile, basePrompt: string): string {
    return `You are an expert at writing compelling application form responses.
Your task is to generate authentic, personalized answers to application questions based on a candidate's profile.

${basePrompt}

Key principles:
1. Be authentic and specific - use real details from the provided profile
2. Show impact and results whenever possible
3. Tailor tone and length to the application context
4. Avoid generic phrases like "I am passionate about..."
5. Use concrete examples and metrics when available
6. Keep answers concise but meaningful
7. Match the tone requested (professional/conversational/formal)
8. Do not make up information - only use what's in the provided profile`;
  }

  /**
   * Build the user message containing the question and context
   */
  private buildUserMessage(request: LLMRequest): string {
    const { question, context, customization, userProfile } = request;

    const toneGuide = {
      professional: 'Use a formal, professional tone suitable for corporate environments.',
      conversational: 'Use a friendly, approachable tone while remaining professional.',
      formal: 'Use a formal, academic tone suitable for educational institutions.',
    };

    const lengthGuide = {
      brief: 'Keep the answer to 1-2 sentences (max 100 words).',
      medium: 'Provide a moderate answer of 2-3 sentences (100-200 words).',
      detailed: 'Provide a comprehensive answer of 3-4 sentences (200-400 words).',
    };

    let message = `Generate an application form answer for the following question:

QUESTION: "${question}"`;

    if (context) {
      message += `\nCONTEXT: ${context}`;
    }

    if (customization.targetCompany) {
      message += `\nTARGET: ${customization.targetCompany}`;
    }

    message += `\n\nTONE: ${toneGuide[customization.tone]}`;
    message += `\nLENGTH: ${lengthGuide[customization.length]}`;

    if (customization.includeMetrics) {
      message += '\nINCLUDE METRICS: If relevant, include quantifiable results or metrics.';
    }

    message += `\n\nBased on the candidate's profile, generate a compelling, authentic answer.`;

    return message;
  }
}

/**
 * Helper function to create a system prompt for form questions
 */
export function createFormAnswerSystemPrompt(): string {
  return `You are an expert career coach and application writer. Your role is to help candidates craft compelling answers to application form questions by:

1. Understanding their background, skills, and achievements
2. Tailoring responses to the specific question and context
3. Highlighting relevant experiences and outcomes
4. Using the candidate's authentic voice
5. Being concise while maximizing impact

Important guidelines:
- Never fabricate information
- Use specific examples from the provided profile
- Focus on outcomes and impact, not just responsibilities
- Match the requested tone and length
- Avoid clichés and generic phrases
- Include metrics and quantifiable results when available
- Consider the context of the application (company, role, institution)`;
}

/**
 * Build a profile summary for the LLM context
 * This is sent to the LLM to provide context without exposing raw data
 */
export function buildProfileSummary(profile: UserProfile): string {
  const lines: string[] = [];

  // Personal summary
  if (profile.personal.summary) {
    lines.push(`Overview: ${profile.personal.summary}`);
  }

  // Education summary
  if (profile.education.length > 0) {
    const eduSummary = profile.education
      .map((e) => `${e.degree} in ${e.field} from ${e.institution} (${e.graduationYear})`)
      .join('; ');
    lines.push(`Education: ${eduSummary}`);
  }

  // Experience summary
  if (profile.experience.length > 0) {
    const expSummary = profile.experience
      .map((e) => `${e.title} at ${e.company} (${e.duration})`)
      .join('; ');
    lines.push(`Experience: ${expSummary}`);
  }

  // Skills summary
  if (profile.skills.length > 0) {
    const skillsByCategory = profile.skills.reduce(
      (acc, skill) => {
        if (!acc[skill.category]) {
          acc[skill.category] = [];
        }
        acc[skill.category].push(skill.name);
        return acc;
      },
      {} as Record<string, string[]>
    );

    Object.entries(skillsByCategory).forEach(([category, skills]) => {
      lines.push(`${category} Skills: ${skills.join(', ')}`);
    });
  }

  // Values and goals
  if (profile.values.careerGoals) {
    lines.push(`Career Goals: ${profile.values.careerGoals}`);
  }

  if (profile.values.strengths.length > 0) {
    lines.push(`Key Strengths: ${profile.values.strengths.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Intelligently select stories to avoid repetition
 */
export function selectRelevantStories(
  profile: UserProfile,
  question: string,
  minDaysBetweenRepeats: number = 7
): string[] {
  if (profile.stories.length === 0) {
    return [];
  }

  // Sort stories by least recently used (lowest timesUsed first)
  const sortedStories = [...profile.stories].sort((a, b) => a.timesUsed - b.timesUsed);

  // Get the top 1-2 most relevant stories (those with least usage)
  const selectedStories = sortedStories.slice(0, 2);

  return selectedStories.map((s) => `Story "${s.title}": ${s.story}`);
}

/**
 * Rate how relevant a question is to different parts of the profile
 */
export function analyzeQuestionRelevance(
  question: string,
  profile: UserProfile
): {
  needsExperience: boolean;
  needsEducation: boolean;
  needsSkills: boolean;
  needsStory: boolean;
  suggestedCategories: string[];
} {
  const questionLower = question.toLowerCase();

  return {
    needsExperience:
      /experience|worked|job|role|company|project|responsibility|achievement/i.test(questionLower),
    needsEducation:
      /education|school|university|degree|study|coursework|academic|learned/i.test(questionLower),
    needsSkills: /skill|ability|capable|proficient|competent|technical|expertise/i.test(questionLower),
    needsStory:
      /describe|tell|story|example|situation|challenge|overcome|success|failure/i.test(questionLower),
    suggestedCategories: [],
  };
}
