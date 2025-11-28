import { UserProfile, Settings, GeneratedAnswer, FormHistory, PersonalInfo, Education, Experience, Skill, Story, Values } from './types';
/**
 * Initialize storage with default values if empty
 */
export declare function initializeStorage(): Promise<void>;
export declare function getProfile(): Promise<UserProfile>;
export declare function updateProfile(profile: UserProfile): Promise<void>;
export declare function updatePersonalInfo(personal: PersonalInfo): Promise<void>;
export declare function addEducation(education: Education): Promise<void>;
export declare function updateEducation(id: string, education: Education): Promise<void>;
export declare function deleteEducation(id: string): Promise<void>;
export declare function addExperience(experience: Experience): Promise<void>;
export declare function updateExperience(id: string, experience: Experience): Promise<void>;
export declare function deleteExperience(id: string): Promise<void>;
export declare function addSkill(skill: Skill): Promise<void>;
export declare function updateSkill(id: string, skill: Skill): Promise<void>;
export declare function deleteSkill(id: string): Promise<void>;
export declare function addStory(story: Story): Promise<void>;
export declare function updateStory(id: string, story: Story): Promise<void>;
export declare function deleteStory(id: string): Promise<void>;
export declare function incrementStoryUsage(id: string): Promise<void>;
export declare function updateValues(values: Values): Promise<void>;
export declare function getSettings(): Promise<Settings>;
export declare function updateSettings(settings: Settings): Promise<void>;
export declare function updateLLMSettings(apiKey: string, provider: string, model?: string): Promise<void>;
export declare function getGeneratedAnswers(): Promise<GeneratedAnswer[]>;
export declare function saveGeneratedAnswer(answer: GeneratedAnswer): Promise<void>;
export declare function updateGeneratedAnswer(id: string, answer: GeneratedAnswer): Promise<void>;
export declare function deleteGeneratedAnswer(id: string): Promise<void>;
export declare function getFormHistory(): Promise<FormHistory[]>;
export declare function saveFormHistory(history: FormHistory): Promise<void>;
export declare function deleteFormHistory(id: string): Promise<void>;
export declare function exportData(): Promise<object>;
export declare function importData(data: any): Promise<void>;
export declare function clearAllData(): Promise<void>;
//# sourceMappingURL=storage.d.ts.map