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
      message += `\n\nCONTEXT: ${context}`;
    }

    if (customization.targetCompany) {
      message += `\n\nTARGET COMPANY/ORGANIZATION: ${customization.targetCompany}`;
    }

    // Add user profile information
    message += `\n\n=== CANDIDATE PROFILE ===\n`;
    message += this.formatProfileForLLM(userProfile);

    message += `\n\n=== RESPONSE REQUIREMENTS ===`;
    message += `\nTONE: ${toneGuide[customization.tone]}`;
    message += `\nLENGTH: ${lengthGuide[customization.length]}`;

    if (customization.includeMetrics) {
      message += '\nINCLUDE METRICS: If relevant, include quantifiable results or metrics from the profile.';
    }

    message += `\n\nGenerate a compelling, authentic answer based ONLY on the information in the candidate's profile above. Do not fabricate or assume information not present in the profile.`;

    return message;
  }

  /**
   * Format user profile for LLM consumption
   */
  private formatProfileForLLM(profile: UserProfile): string {
    const sections: string[] = [];

    // Personal Information
    if (profile.personal.fullName || profile.personal.summary) {
      sections.push('PERSONAL:');
      if (profile.personal.fullName) sections.push(`Name: ${profile.personal.fullName}`);
      if (profile.personal.email) sections.push(`Email: ${profile.personal.email}`);
      if (profile.personal.location) sections.push(`Location: ${profile.personal.location}`);
      if (profile.personal.summary) sections.push(`Summary: ${profile.personal.summary}`);
    }

    // Education
    if (profile.education && profile.education.length > 0) {
      sections.push('\nEDUCATION:');
      profile.education.forEach((edu, index) => {
        sections.push(`${index + 1}. ${edu.degree} in ${edu.field}`);
        sections.push(`   Institution: ${edu.institution} (${edu.graduationYear})`);
        if (edu.gpa) sections.push(`   GPA: ${edu.gpa}`);
        if (edu.relevantCoursework && edu.relevantCoursework.length > 0) {
          sections.push(`   Coursework: ${edu.relevantCoursework.join(', ')}`);
        }
        if (edu.achievements && edu.achievements.length > 0) {
          sections.push(`   Achievements: ${edu.achievements.join('; ')}`);
        }
      });
    }

    // Experience
    if (profile.experience && profile.experience.length > 0) {
      sections.push('\nWORK EXPERIENCE:');
      profile.experience.forEach((exp, index) => {
        sections.push(`${index + 1}. ${exp.title} at ${exp.company}`);
        sections.push(`   Duration: ${exp.duration}`);
        if (exp.description) sections.push(`   Description: ${exp.description}`);
        if (exp.keyAchievements && exp.keyAchievements.length > 0) {
          sections.push(`   Key Achievements:`);
          exp.keyAchievements.forEach((achievement) => {
            sections.push(`   - ${achievement}`);
          });
        }
        if (exp.skills && exp.skills.length > 0) {
          sections.push(`   Skills Used: ${exp.skills.join(', ')}`);
        }
        if (exp.impact) sections.push(`   Impact: ${exp.impact}`);
      });
    }

    // Skills
    if (profile.skills && profile.skills.length > 0) {
      sections.push('\nSKILLS:');
      const skillsByCategory: Record<string, string[]> = {};
      profile.skills.forEach((skill) => {
        if (!skillsByCategory[skill.category]) {
          skillsByCategory[skill.category] = [];
        }
        skillsByCategory[skill.category].push(`${skill.name} (${skill.proficiency})`);
      });
      Object.entries(skillsByCategory).forEach(([category, skills]) => {
        sections.push(`${category}: ${skills.join(', ')}`);
      });
    }

    // Stories
    if (profile.stories && profile.stories.length > 0) {
      sections.push('\nSTORIES/EXAMPLES:');
      profile.stories.forEach((story, index) => {
        sections.push(`${index + 1}. ${story.title}`);
        sections.push(`   ${story.story}`);
        if (story.tags && story.tags.length > 0) {
          sections.push(`   Tags: ${story.tags.join(', ')}`);
        }
      });
    }

    // Values and Goals
    if (profile.values) {
      sections.push('\nVALUES & GOALS:');
      if (profile.values.careerGoals) {
        sections.push(`Career Goals: ${profile.values.careerGoals}`);
      }
      if (profile.values.strengths && profile.values.strengths.length > 0) {
        sections.push(`Key Strengths: ${profile.values.strengths.join(', ')}`);
      }
      if (profile.values.motivation && profile.values.motivation.length > 0) {
        sections.push(`Motivations: ${profile.values.motivation.join(', ')}`);
      }
      if (profile.values.valuesImportant && profile.values.valuesImportant.length > 0) {
        sections.push(`Important Values: ${profile.values.valuesImportant.join(', ')}`);
      }
    }

    return sections.join('\n');
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
