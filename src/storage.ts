import {
  UserProfile,
  Settings,
  GeneratedAnswer,
  FormHistory,
  PersonalInfo,
  Education,
  Experience,
  Skill,
  Story,
  Values,
} from './types';

/**
 * Storage Manager for Chrome Extension
 * Handles all read/write operations to chrome.storage
 */

const STORAGE_KEYS = {
  PROFILE: 'userProfile',
  SETTINGS: 'settings',
  GENERATED_ANSWERS: 'generatedAnswers',
  FORM_HISTORY: 'formHistory',
};

// Default profile structure
const DEFAULT_PROFILE: UserProfile = {
  personal: {
    fullName: '',
    email: '',
    phone: '',
    location: '',
    summary: '',
  },
  education: [],
  experience: [],
  skills: [],
  stories: [],
  values: {
    motivation: [],
    careerGoals: '',
    strengths: [],
    valuesImportant: [],
  },
};

// Default settings
const DEFAULT_SETTINGS: Settings = {
  llm: {
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4',
  },
  privacy: {
    privacyMode: false,
  },
  autoFill: {
    requireApproval: true,
    avoidRepetition: true,
    minDaysBetweenStories: 7,
  },
  customPromptStyle: {
    tone: 'professional',
    length: 'medium',
    includeMetrics: true,
  },
};

/**
 * Initialize storage with default values if empty
 */
export async function initializeStorage(): Promise<void> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.PROFILE,
    STORAGE_KEYS.SETTINGS,
  ]);

  if (!result[STORAGE_KEYS.PROFILE]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.PROFILE]: DEFAULT_PROFILE,
    });
  }

  if (!result[STORAGE_KEYS.SETTINGS]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
    });
  }
}

// ============= Profile Management =============

export async function getProfile(): Promise<UserProfile> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PROFILE);
  return result[STORAGE_KEYS.PROFILE] || DEFAULT_PROFILE;
}

export async function updateProfile(profile: UserProfile): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.PROFILE]: profile,
  });
}

export async function updatePersonalInfo(personal: PersonalInfo): Promise<void> {
  const profile = await getProfile();
  profile.personal = personal;
  await updateProfile(profile);
}

export async function addEducation(education: Education): Promise<void> {
  const profile = await getProfile();
  profile.education.push(education);
  await updateProfile(profile);
}

export async function updateEducation(id: string, education: Education): Promise<void> {
  const profile = await getProfile();
  const index = profile.education.findIndex((e) => e.id === id);
  if (index !== -1) {
    profile.education[index] = education;
    await updateProfile(profile);
  }
}

export async function deleteEducation(id: string): Promise<void> {
  const profile = await getProfile();
  profile.education = profile.education.filter((e) => e.id !== id);
  await updateProfile(profile);
}

export async function addExperience(experience: Experience): Promise<void> {
  const profile = await getProfile();
  profile.experience.push(experience);
  await updateProfile(profile);
}

export async function updateExperience(id: string, experience: Experience): Promise<void> {
  const profile = await getProfile();
  const index = profile.experience.findIndex((e) => e.id === id);
  if (index !== -1) {
    profile.experience[index] = experience;
    await updateProfile(profile);
  }
}

export async function deleteExperience(id: string): Promise<void> {
  const profile = await getProfile();
  profile.experience = profile.experience.filter((e) => e.id !== id);
  await updateProfile(profile);
}

export async function addSkill(skill: Skill): Promise<void> {
  const profile = await getProfile();
  profile.skills.push(skill);
  await updateProfile(profile);
}

export async function updateSkill(id: string, skill: Skill): Promise<void> {
  const profile = await getProfile();
  const index = profile.skills.findIndex((s) => s.id === id);
  if (index !== -1) {
    profile.skills[index] = skill;
    await updateProfile(profile);
  }
}

export async function deleteSkill(id: string): Promise<void> {
  const profile = await getProfile();
  profile.skills = profile.skills.filter((s) => s.id !== id);
  await updateProfile(profile);
}

export async function addStory(story: Story): Promise<void> {
  const profile = await getProfile();
  profile.stories.push(story);
  await updateProfile(profile);
}

export async function updateStory(id: string, story: Story): Promise<void> {
  const profile = await getProfile();
  const index = profile.stories.findIndex((s) => s.id === id);
  if (index !== -1) {
    profile.stories[index] = story;
    await updateProfile(profile);
  }
}

export async function deleteStory(id: string): Promise<void> {
  const profile = await getProfile();
  profile.stories = profile.stories.filter((s) => s.id !== id);
  await updateProfile(profile);
}

export async function incrementStoryUsage(id: string): Promise<void> {
  const profile = await getProfile();
  const story = profile.stories.find((s) => s.id === id);
  if (story) {
    story.timesUsed += 1;
    await updateProfile(profile);
  }
}

export async function updateValues(values: Values): Promise<void> {
  const profile = await getProfile();
  profile.values = values;
  await updateProfile(profile);
}

// ============= Settings Management =============

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return result[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS;
}

export async function updateSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: settings,
  });
}

export async function updateLLMSettings(apiKey: string, provider: string, model?: string): Promise<void> {
  const settings = await getSettings();
  settings.llm = {
    provider: provider as 'openai' | 'anthropic' | 'local',
    apiKey,
    model,
  };
  await updateSettings(settings);
}

// ============= Generated Answers Management =============

export async function getGeneratedAnswers(): Promise<GeneratedAnswer[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.GENERATED_ANSWERS);
  return result[STORAGE_KEYS.GENERATED_ANSWERS] || [];
}

export async function saveGeneratedAnswer(answer: GeneratedAnswer): Promise<void> {
  const answers = await getGeneratedAnswers();
  answers.push(answer);
  await chrome.storage.local.set({
    [STORAGE_KEYS.GENERATED_ANSWERS]: answers,
  });
}

export async function updateGeneratedAnswer(id: string, answer: GeneratedAnswer): Promise<void> {
  const answers = await getGeneratedAnswers();
  const index = answers.findIndex((a) => a.id === id);
  if (index !== -1) {
    answers[index] = answer;
    await chrome.storage.local.set({
      [STORAGE_KEYS.GENERATED_ANSWERS]: answers,
    });
  }
}

export async function deleteGeneratedAnswer(id: string): Promise<void> {
  const answers = await getGeneratedAnswers();
  const filtered = answers.filter((a) => a.id !== id);
  await chrome.storage.local.set({
    [STORAGE_KEYS.GENERATED_ANSWERS]: filtered,
  });
}

// ============= Form History Management =============

export async function getFormHistory(): Promise<FormHistory[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.FORM_HISTORY);
  return result[STORAGE_KEYS.FORM_HISTORY] || [];
}

export async function saveFormHistory(history: FormHistory): Promise<void> {
  const histories = await getFormHistory();
  histories.push(history);
  await chrome.storage.local.set({
    [STORAGE_KEYS.FORM_HISTORY]: histories,
  });
}

export async function deleteFormHistory(id: string): Promise<void> {
  const histories = await getFormHistory();
  const filtered = histories.filter((h) => h.id !== id);
  await chrome.storage.local.set({
    [STORAGE_KEYS.FORM_HISTORY]: filtered,
  });
}

// ============= Data Export & Import =============

export async function exportData(): Promise<object> {
  const profile = await getProfile();
  const settings = await getSettings();
  const answers = await getGeneratedAnswers();
  const history = await getFormHistory();

  return {
    profile,
    settings,
    answers,
    history,
    exportedAt: new Date().toISOString(),
  };
}

export async function importData(data: any): Promise<void> {
  if (data.profile) {
    await updateProfile(data.profile);
  }
  if (data.settings) {
    await updateSettings(data.settings);
  }
  if (data.answers) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.GENERATED_ANSWERS]: data.answers,
    });
  }
  if (data.history) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.FORM_HISTORY]: data.history,
    });
  }
}

export async function clearAllData(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.PROFILE,
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.GENERATED_ANSWERS,
    STORAGE_KEYS.FORM_HISTORY,
  ]);
  await initializeStorage();
}
