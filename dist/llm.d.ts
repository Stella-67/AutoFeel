import { UserProfile, LLMRequest, LLMResponse } from './types';
/**
 * LLM Integration Module
 * Handles API calls to OpenAI, Anthropic, and supports local LLM options
 */
export declare class LLMProvider {
    private settings;
    initialize(): Promise<void>;
    /**
     * Generate an answer for a form question using the user's profile
     */
    generateAnswer(request: LLMRequest): Promise<LLMResponse>;
    /**
     * Generate answer using OpenAI API
     */
    private generateWithOpenAI;
    /**
     * Generate answer using Anthropic Claude API
     */
    private generateWithAnthropic;
    /**
     * Build the system prompt that guides the LLM
     */
    private buildSystemPrompt;
    /**
     * Build the user message containing the question and context
     */
    private buildUserMessage;
}
/**
 * Helper function to create a system prompt for form questions
 */
export declare function createFormAnswerSystemPrompt(): string;
/**
 * Build a profile summary for the LLM context
 * This is sent to the LLM to provide context without exposing raw data
 */
export declare function buildProfileSummary(profile: UserProfile): string;
/**
 * Intelligently select stories to avoid repetition
 */
export declare function selectRelevantStories(profile: UserProfile, question: string, minDaysBetweenRepeats?: number): string[];
/**
 * Rate how relevant a question is to different parts of the profile
 */
export declare function analyzeQuestionRelevance(question: string, profile: UserProfile): {
    needsExperience: boolean;
    needsEducation: boolean;
    needsSkills: boolean;
    needsStory: boolean;
    suggestedCategories: string[];
};
//# sourceMappingURL=llm.d.ts.map