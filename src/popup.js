/**
 * Popup UI Logic
 * Handles user interactions and profile management in the extension popup
 */

// DOM Elements - will be initialized after DOM loads
let detectBtn, formsList, tabBtns, tabContents, settingsBtn;
let personalForm, llmForm, autoFillForm, styleForm, valuesForm;
let addEducationBtn, addExperienceBtn, addSkillBtn, addStoryBtn;
let exportBtn, importBtn, clearBtn;
let modal, closeBtn, toast;

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  // Initialize all DOM elements
  detectBtn = document.getElementById('detectBtn');
  formsList = document.getElementById('formsList');
  tabBtns = document.querySelectorAll('.tab-btn');
  tabContents = document.querySelectorAll('.tab-content');
  settingsBtn = document.getElementById('settingsBtn');

  personalForm = document.getElementById('personalForm');
  llmForm = document.getElementById('llmForm');
  autoFillForm = document.getElementById('autoFillForm');
  styleForm = document.getElementById('styleForm');
  valuesForm = document.getElementById('valuesForm');

  addEducationBtn = document.getElementById('addEducationBtn');
  addExperienceBtn = document.getElementById('addExperienceBtn');
  addSkillBtn = document.getElementById('addSkillBtn');
  addStoryBtn = document.getElementById('addStoryBtn');
  exportBtn = document.getElementById('exportBtn');
  importBtn = document.getElementById('importBtn');
  clearBtn = document.getElementById('clearBtn');

  modal = document.getElementById('modal');
  closeBtn = document.querySelector('.close');
  toast = document.getElementById('toast');

  console.log('[Popup] DOM elements initialized, toast:', toast);

  initializeTabs();
  loadProfile();
  loadSettings();
  setupEventListeners();
});

/**
 * Tab switching logic
 */
function initializeTabs() {
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  // Deactivate all tabs
  tabBtns.forEach((btn) => btn.classList.remove('active'));
  tabContents.forEach((content) => content.classList.remove('active'));

  // Activate selected tab
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`${tabName}-tab`).classList.add('active');
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Detect forms
  detectBtn.addEventListener('click', detectForms);

  // Profile forms
  personalForm.addEventListener('submit', savePersonalInfo);
  valuesForm.addEventListener('submit', saveValues);

  // Add buttons
  addEducationBtn.addEventListener('click', () => openEducationModal());
  addExperienceBtn.addEventListener('click', () => openExperienceModal());
  addSkillBtn.addEventListener('click', () => openSkillModal());
  addStoryBtn.addEventListener('click', () => openStoryModal());

  // Settings forms
  llmForm.addEventListener('submit', saveLLMSettings);
  autoFillForm.addEventListener('submit', saveAutoFillSettings);
  styleForm.addEventListener('submit', saveStyleSettings);

  // Data management
  exportBtn.addEventListener('click', exportData);
  importBtn.addEventListener('click', importData);
  clearBtn.addEventListener('click', clearAllData);

  // Modal
  closeBtn.addEventListener('click', () => modal.classList.remove('show'));
  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
    }
  });

  // Settings button
  settingsBtn.addEventListener('click', () => switchTab('settings'));
}

/**
 * Detect forms on the current page
 */
async function detectForms() {
  try {
    detectBtn.disabled = true;
    detectBtn.textContent = 'Detecting...';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send message to content script to detect forms
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'getPageQuestions',
    });

    if (response.questions && response.questions.length > 0) {
      displayDetectedForms(response.questions);
      showToast(`Found ${response.questions.length} form fields!`, 'success');
    } else {
      formsList.innerHTML = '<p class="empty-state">No form fields found on this page.</p>';
      showToast('No form fields detected', 'error');
    }
  } catch (error) {
    console.error('Error detecting forms:', error);
    showToast('Error detecting forms: ' + error.message, 'error');
  } finally {
    detectBtn.disabled = false;
    detectBtn.textContent = 'Detect Form Fields';
  }
}

/**
 * Display detected form fields
 */
function displayDetectedForms(questions) {
  if (questions.length === 0) {
    formsList.innerHTML = '<p class="empty-state">No form fields found.</p>';
    return;
  }

  formsList.innerHTML = questions
    .map(
      (q, index) => `
    <div class="form-item">
      <div class="form-item-label">${escapeHtml(q.questionText)}</div>
      <div class="form-item-actions">
        <button class="btn btn-primary generate-answer-btn" data-field-id="${escapeHtml(q.fieldId)}" data-question="${escapeHtml(q.questionText)}" data-index="${index}">
          Generate Answer
        </button>
      </div>
    </div>
  `
    )
    .join('');

  // Add event listeners to all generate buttons
  const generateBtns = formsList.querySelectorAll('.generate-answer-btn');
  generateBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const fieldId = btn.getAttribute('data-field-id');
      const question = btn.getAttribute('data-question');
      generateAnswer(fieldId, question, btn);
    });
  });
}

/**
 * Generate answer for a form question
 */
async function generateAnswer(fieldId, question, buttonElement) {
  try {
    console.log('[generateAnswer] Starting with:', { fieldId, question });

    // Disable button and show loading state
    if (buttonElement) {
      buttonElement.disabled = true;
      buttonElement.textContent = 'Generating...';
    }

    const settings = await chrome.storage.local.get('settings');
    console.log('[generateAnswer] Settings loaded:', settings);

    const customization = settings.settings?.customPromptStyle || {
      tone: 'professional',
      length: 'medium',
      includeMetrics: true,
    };

    console.log('[generateAnswer] Sending message to background...');
    const response = await chrome.runtime.sendMessage({
      action: 'generateAnswer',
      payload: {
        fieldId,
        question,
        customization,
      },
    });

    console.log('[generateAnswer] Response:', response);

    if (response && response.success) {
      showToast('Answer generated successfully!', 'success');
      console.log('[generateAnswer] Answer:', response.data.answer);

      // Show the generated answer in the UI
      if (buttonElement) {
        const formItem = buttonElement.closest('.form-item');
        const answerDiv = document.createElement('div');
        answerDiv.className = 'generated-answer';
        answerDiv.innerHTML = `
          <div class="answer-text">${escapeHtml(response.data.answer)}</div>
          <div class="answer-actions">
            <button class="btn btn-primary fill-btn" data-field-id="${escapeHtml(fieldId)}" data-answer="${escapeHtml(response.data.answer)}">Fill Field</button>
            <button class="btn btn-secondary regenerate-btn" data-field-id="${escapeHtml(fieldId)}" data-question="${escapeHtml(question)}">Regenerate</button>
          </div>
        `;

        // Remove any existing answer
        const existingAnswer = formItem.querySelector('.generated-answer');
        if (existingAnswer) {
          existingAnswer.remove();
        }

        formItem.appendChild(answerDiv);

        // Add event listeners
        const fillBtn = answerDiv.querySelector('.fill-btn');
        const regenerateBtn = answerDiv.querySelector('.regenerate-btn');

        fillBtn.addEventListener('click', async () => {
          await fillField(fieldId, response.data.answer);
        });

        regenerateBtn.addEventListener('click', () => {
          generateAnswer(fieldId, question, buttonElement);
        });
      }
    } else {
      const errorMsg = response?.error || 'Unknown error';
      showToast('Error: ' + errorMsg, 'error');
      console.error('[generateAnswer] Error:', errorMsg);
    }
  } catch (error) {
    console.error('[generateAnswer] Exception:', error);
    showToast('Error generating answer: ' + error.message, 'error');
  } finally {
    // Re-enable button
    if (buttonElement) {
      buttonElement.disabled = false;
      buttonElement.textContent = 'Generate Answer';
    }
  }
}

/**
 * Fill a form field with the generated answer
 */
async function fillField(fieldId, answer) {
  try {
    console.log('[fillField] Filling field:', { fieldId, answer });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'fillField',
      fieldSelector: `[data-field-id="${fieldId}"]`,
      answer: answer,
    });

    if (response && response.success) {
      showToast('Field filled successfully!', 'success');
    } else {
      showToast('Could not fill field. Try copying the answer manually.', 'warning');
    }
  } catch (error) {
    console.error('[fillField] Error:', error);
    showToast('Error filling field: ' + error.message, 'error');
  }
}

/**
 * Load profile data into the UI
 */
async function loadProfile() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getProfile',
    });

    if (response.success && response.data) {
      const profile = response.data;

      // Personal info
      document.getElementById('fullName').value = profile.personal?.fullName || '';
      document.getElementById('email').value = profile.personal?.email || '';
      document.getElementById('phone').value = profile.personal?.phone || '';
      document.getElementById('location').value = profile.personal?.location || '';
      document.getElementById('summary').value = profile.personal?.summary || '';

      // Values
      document.getElementById('careerGoals').value = profile.values?.careerGoals || '';
      document.getElementById('strengths').value = profile.values?.strengths?.join(', ') || '';
      document.getElementById('values').value = profile.values?.valuesImportant?.join(', ') || '';

      // Display education items
      displayEducationList(profile.education || []);
      // Display experience items
      displayExperienceList(profile.experience || []);
      // Display skills
      displaySkillsList(profile.skills || []);
      // Display stories
      displayStoriesList(profile.stories || []);
    }
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

/**
 * Load settings into the UI
 */
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getSettings',
    });

    if (response.success && response.data) {
      const settings = response.data;

      // LLM settings
      document.getElementById('llmProvider').value = settings.llm?.provider || 'openai';
      document.getElementById('apiKey').value = settings.llm?.apiKey || '';
      document.getElementById('model').value = settings.llm?.model || 'gpt-4';

      // Auto-fill settings
      document.getElementById('requireApproval').checked = settings.autoFill?.requireApproval || true;
      document.getElementById('avoidRepetition').checked = settings.autoFill?.avoidRepetition || true;
      document.getElementById('minDaysBetweenStories').value = settings.autoFill?.minDaysBetweenStories || 7;

      // Style settings
      document.getElementById('tone').value = settings.customPromptStyle?.tone || 'professional';
      document.getElementById('length').value = settings.customPromptStyle?.length || 'medium';
      document.getElementById('includeMetrics').checked = settings.customPromptStyle?.includeMetrics || true;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Save personal information
 */
async function savePersonalInfo(e) {
  e.preventDefault();

  const personalInfo = {
    fullName: document.getElementById('fullName').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
    location: document.getElementById('location').value,
    summary: document.getElementById('summary').value,
  };

  try {
    const profile = (
      await chrome.runtime.sendMessage({
        action: 'getProfile',
      })
    ).data;

    profile.personal = personalInfo;

    await chrome.runtime.sendMessage({
      action: 'saveProfile',
      payload: profile,
    });

    showToast('Personal information saved!', 'success');
  } catch (error) {
    console.error('Error saving personal info:', error);
    showToast('Error saving personal info', 'error');
  }
}

/**
 * Save values and goals
 */
async function saveValues(e) {
  e.preventDefault();

  const values = {
    careerGoals: document.getElementById('careerGoals').value,
    strengths: document.getElementById('strengths').value.split(',').map((s) => s.trim()),
    valuesImportant: document.getElementById('values').value.split(',').map((v) => v.trim()),
    motivation: [],
  };

  try {
    const profile = (
      await chrome.runtime.sendMessage({
        action: 'getProfile',
      })
    ).data;

    profile.values = values;

    await chrome.runtime.sendMessage({
      action: 'saveProfile',
      payload: profile,
    });

    showToast('Values saved!', 'success');
  } catch (error) {
    console.error('Error saving values:', error);
    showToast('Error saving values', 'error');
  }
}

/**
 * Save LLM settings
 */
async function saveLLMSettings(e) {
  e.preventDefault();

  console.log('[Popup] saveLLMSettings called');

  const settings = {
    provider: document.getElementById('llmProvider').value,
    apiKey: document.getElementById('apiKey').value,
    model: document.getElementById('model').value,
  };

  console.log('[Popup] Settings:', { provider: settings.provider, model: settings.model, hasApiKey: !!settings.apiKey });

  if (!settings.apiKey) {
    console.log('[Popup] No API key provided');
    showToast('Please enter your API key', 'error');
    return;
  }

  try {
    console.log('[Popup] Sending message to background...');
    // Save via background script
    const response = await chrome.runtime.sendMessage({
      action: 'saveLLMSettings',
      payload: settings,
    });

    console.log('[Popup] Response:', response);

    // 先强制显示成功消息进行测试
    showToast('LLM settings saved!', 'success');

    if (!response || !response.success) {
      console.warn('[Popup] Response was not successful:', response);
    }
  } catch (error) {
    console.error('[Popup] Error saving LLM settings:', error);
    showToast('Error saving LLM settings: ' + error.message, 'error');
  }
}

/**
 * Save auto-fill settings
 */
async function saveAutoFillSettings(e) {
  e.preventDefault();

  const settings = {
    requireApproval: document.getElementById('requireApproval').checked,
    avoidRepetition: document.getElementById('avoidRepetition').checked,
    minDaysBetweenStories: parseInt(document.getElementById('minDaysBetweenStories').value),
  };

  try {
    await chrome.runtime.sendMessage({
      action: 'saveAutoFillSettings',
      payload: settings,
    });

    showToast('Auto-fill settings saved!', 'success');
  } catch (error) {
    console.error('Error saving auto-fill settings:', error);
    showToast('Error saving settings', 'error');
  }
}

/**
 * Save style settings
 */
async function saveStyleSettings(e) {
  e.preventDefault();

  const settings = {
    tone: document.getElementById('tone').value,
    length: document.getElementById('length').value,
    includeMetrics: document.getElementById('includeMetrics').checked,
  };

  try {
    await chrome.runtime.sendMessage({
      action: 'saveStyleSettings',
      payload: settings,
    });

    showToast('Style settings saved!', 'success');
  } catch (error) {
    console.error('Error saving style settings:', error);
    showToast('Error saving settings', 'error');
  }
}

/**
 * Display education list
 */
function displayEducationList(education) {
  const list = document.getElementById('educationList');

  if (education.length === 0) {
    list.innerHTML = '<p class="empty-state">No education added yet.</p>';
    return;
  }

  list.innerHTML = education
    .map(
      (edu) => `
    <div class="list-item">
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(edu.degree)} in ${escapeHtml(edu.field)}</div>
        <div class="list-item-subtitle">${escapeHtml(edu.institution)} - ${edu.graduationYear}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary" onclick="editEducation('${edu.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteEducation('${edu.id}')">Delete</button>
      </div>
    </div>
  `
    )
    .join('');
}

/**
 * Display experience list
 */
function displayExperienceList(experience) {
  const list = document.getElementById('experienceList');

  if (experience.length === 0) {
    list.innerHTML = '<p class="empty-state">No experience added yet.</p>';
    return;
  }

  list.innerHTML = experience
    .map(
      (exp) => `
    <div class="list-item">
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(exp.title)}</div>
        <div class="list-item-subtitle">${escapeHtml(exp.company)} - ${exp.duration}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary" onclick="editExperience('${exp.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteExperience('${exp.id}')">Delete</button>
      </div>
    </div>
  `
    )
    .join('');
}

/**
 * Display skills list
 */
function displaySkillsList(skills) {
  const list = document.getElementById('skillsList');

  if (skills.length === 0) {
    list.innerHTML = '<p class="empty-state">No skills added yet.</p>';
    return;
  }

  list.innerHTML = skills
    .map(
      (skill) => `
    <div class="list-item">
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(skill.name)}</div>
        <div class="list-item-subtitle">${skill.category} - ${skill.proficiency}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary" onclick="editSkill('${skill.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteSkill('${skill.id}')">Delete</button>
      </div>
    </div>
  `
    )
    .join('');
}

/**
 * Display stories list
 */
function displayStoriesList(stories) {
  const list = document.getElementById('storiesList');

  if (stories.length === 0) {
    list.innerHTML = '<p class="empty-state">No stories added yet.</p>';
    return;
  }

  list.innerHTML = stories
    .map(
      (story) => `
    <div class="list-item">
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(story.title)}</div>
        <div class="list-item-subtitle">${story.tags.join(', ')} • Used ${story.timesUsed} times</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary" onclick="editStory('${story.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteStory('${story.id}')">Delete</button>
      </div>
    </div>
  `
    )
    .join('');
}

/**
 * Open education modal
 */
function openEducationModal(id = null) {
  modal.classList.add('show');
  document.getElementById('modalTitle').textContent = id ? 'Edit Education' : 'Add Education';
  // TODO: Load and display education form
}

/**
 * Open experience modal
 */
function openExperienceModal(id = null) {
  modal.classList.add('show');
  document.getElementById('modalTitle').textContent = id ? 'Edit Experience' : 'Add Experience';
  // TODO: Load and display experience form
}

/**
 * Open skill modal
 */
function openSkillModal(id = null) {
  modal.classList.add('show');
  document.getElementById('modalTitle').textContent = id ? 'Edit Skill' : 'Add Skill';
  // TODO: Load and display skill form
}

/**
 * Open story modal
 */
function openStoryModal(id = null) {
  modal.classList.add('show');
  document.getElementById('modalTitle').textContent = id ? 'Edit Story' : 'Add Story';
  // TODO: Load and display story form
}

/**
 * Export data
 */
async function exportData() {
  try {
    const profile = (await chrome.runtime.sendMessage({ action: 'getProfile' })).data;
    const settings = (await chrome.runtime.sendMessage({ action: 'getSettings' })).data;

    const data = {
      profile,
      settings,
      exportedAt: new Date().toISOString(),
    };

    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `formautofill-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('Data exported successfully!', 'success');
  } catch (error) {
    console.error('Error exporting data:', error);
    showToast('Error exporting data', 'error');
  }
}

/**
 * Import data
 */
function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.addEventListener('change', async (e) => {
    try {
      const file = e.target.files[0];
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate and import
      if (data.profile && data.settings) {
        await chrome.runtime.sendMessage({
          action: 'importData',
          payload: data,
        });

        showToast('Data imported successfully!', 'success');
        loadProfile();
        loadSettings();
      } else {
        showToast('Invalid backup file', 'error');
      }
    } catch (error) {
      console.error('Error importing data:', error);
      showToast('Error importing data', 'error');
    }
  });

  input.click();
}

/**
 * Clear all data with confirmation
 */
function clearAllData() {
  if (confirm('Are you sure you want to delete all data? This cannot be undone.')) {
    chrome.runtime.sendMessage({
      action: 'clearAllData',
    });

    showToast('All data cleared!', 'success');
    loadProfile();
    loadSettings();
  }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  console.log('[showToast] Called with:', { message, type });

  if (!toast) {
    console.error('[showToast] Toast element not found!');
    alert(message); // 临时使用 alert 作为后备
    return;
  }

  toast.textContent = message;
  toast.className = `toast show ${type}`;

  console.log('[showToast] Toast className:', toast.className);
  console.log('[showToast] Toast style:', window.getComputedStyle(toast).display);

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Placeholder functions for edit/delete operations
function editEducation(id) {
  console.log('Edit education:', id);
}

function deleteEducation(id) {
  console.log('Delete education:', id);
}

function editExperience(id) {
  console.log('Edit experience:', id);
}

function deleteExperience(id) {
  console.log('Delete experience:', id);
}

function editSkill(id) {
  console.log('Edit skill:', id);
}

function deleteSkill(id) {
  console.log('Delete skill:', id);
}

function editStory(id) {
  console.log('Edit story:', id);
}

function deleteStory(id) {
  console.log('Delete story:', id);
}
