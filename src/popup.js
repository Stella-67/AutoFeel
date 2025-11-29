/**
 * Popup UI Logic
 * Handles user interactions and profile management in the extension popup
 */

// DOM Elements - will be initialized after DOM loads
let tabBtns, tabContents, settingsBtn;
let personalForm, llmForm, autoFillForm, styleForm;
let addEducationBtn, addExperienceBtn, addResearchBtn, addOtherBtn, addDocumentBtn;
let exportBtn, importBtn, clearBtn;
let modal, closeBtn, toast;

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  // Initialize all DOM elements
  tabBtns = document.querySelectorAll('.tab-btn');
  tabContents = document.querySelectorAll('.tab-content');
  settingsBtn = document.getElementById('settingsBtn');

  personalForm = document.getElementById('personalForm');
  llmForm = document.getElementById('llmForm');
  autoFillForm = document.getElementById('autoFillForm');
  styleForm = document.getElementById('styleForm');

  addEducationBtn = document.getElementById('addEducationBtn');
  addExperienceBtn = document.getElementById('addExperienceBtn');
  addResearchBtn = document.getElementById('addResearchBtn');
  addOtherBtn = document.getElementById('addOtherBtn');
  addDocumentBtn = document.getElementById('addDocumentBtn');
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
  // Profile forms
  personalForm.addEventListener('submit', savePersonalInfo);

  // Add buttons
  addEducationBtn.addEventListener('click', () => openEducationModal());
  addExperienceBtn.addEventListener('click', () => openExperienceModal());
  addResearchBtn.addEventListener('click', () => openResearchModal());
  addOtherBtn.addEventListener('click', () => openOtherModal());
  addDocumentBtn.addEventListener('click', uploadDocument);

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

      // Display education items
      displayEducationList(profile.education || []);
      // Display experience items
      displayExperienceList(profile.experience || []);
      // Display research items
      displayResearchList(profile.research || []);
      // Display other items
      displayOtherList(profile.other || []);
      // Display documents
      displayDocumentsList(profile.documents || []);
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
 * Display research list
 */
function displayResearchList(research) {
  const list = document.getElementById('researchList');

  if (research.length === 0) {
    list.innerHTML = '<p class="empty-state">No research added yet.</p>';
    return;
  }

  list.innerHTML = research
    .map(
      (item) => `
    <div class="list-item">
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(item.topic)}</div>
        <div class="list-item-subtitle">${escapeHtml(item.description.substring(0, 100))}${item.description.length > 100 ? '...' : ''}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary" onclick="editResearch('${item.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteResearch('${item.id}')">Delete</button>
      </div>
    </div>
  `
    )
    .join('');
}

/**
 * Display other list
 */
function displayOtherList(other) {
  const list = document.getElementById('otherList');

  if (other.length === 0) {
    list.innerHTML = '<p class="empty-state">No items added yet.</p>';
    return;
  }

  list.innerHTML = other
    .map(
      (item) => `
    <div class="list-item">
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(item.topic)}</div>
        <div class="list-item-subtitle">${escapeHtml(item.description.substring(0, 100))}${item.description.length > 100 ? '...' : ''}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary" onclick="editOther('${item.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteOther('${item.id}')">Delete</button>
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

  const modalForm = document.getElementById('modalForm');
  modalForm.innerHTML = `
    <div class="form-group">
      <label>Degree</label>
      <input type="text" id="eduDegree" placeholder="e.g., Bachelor of Science" required>
    </div>
    <div class="form-group">
      <label>Field of Study</label>
      <input type="text" id="eduField" placeholder="e.g., Computer Science" required>
    </div>
    <div class="form-group">
      <label>Institution</label>
      <input type="text" id="eduInstitution" placeholder="e.g., Stanford University" required>
    </div>
    <div class="form-group">
      <label>Graduation Year</label>
      <input type="number" id="eduYear" placeholder="e.g., 2020" required>
    </div>
    <div class="form-group">
      <label>GPA (optional)</label>
      <input type="text" id="eduGpa" placeholder="e.g., 3.8/4.0">
    </div>
    <button type="submit" class="btn btn-primary">Save</button>
  `;

  modalForm.onsubmit = async (e) => {
    e.preventDefault();
    const education = {
      id: id || Date.now().toString(),
      degree: document.getElementById('eduDegree').value,
      field: document.getElementById('eduField').value,
      institution: document.getElementById('eduInstitution').value,
      graduationYear: document.getElementById('eduYear').value,
      gpa: document.getElementById('eduGpa').value || null
    };

    const profile = (await chrome.runtime.sendMessage({ action: 'getProfile' })).data;
    if (!profile.education) profile.education = [];

    if (id) {
      const index = profile.education.findIndex(e => e.id === id);
      profile.education[index] = education;
    } else {
      profile.education.push(education);
    }

    await chrome.runtime.sendMessage({ action: 'saveProfile', payload: profile });
    showToast('Education saved!', 'success');
    displayEducationList(profile.education);
    modal.classList.remove('show');
  };
}

/**
 * Open experience modal
 */
function openExperienceModal(id = null) {
  modal.classList.add('show');
  document.getElementById('modalTitle').textContent = id ? 'Edit Experience' : 'Add Experience';

  const modalForm = document.getElementById('modalForm');
  modalForm.innerHTML = `
    <div class="form-group">
      <label>Job Title</label>
      <input type="text" id="expTitle" placeholder="e.g., Software Engineer" required>
    </div>
    <div class="form-group">
      <label>Company</label>
      <input type="text" id="expCompany" placeholder="e.g., Google" required>
    </div>
    <div class="form-group">
      <label>Duration</label>
      <input type="text" id="expDuration" placeholder="e.g., Jan 2020 - Dec 2022" required>
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea id="expDescription" placeholder="Brief description of your role and achievements..." rows="4"></textarea>
    </div>
    <button type="submit" class="btn btn-primary">Save</button>
  `;

  modalForm.onsubmit = async (e) => {
    e.preventDefault();
    const experience = {
      id: id || Date.now().toString(),
      title: document.getElementById('expTitle').value,
      company: document.getElementById('expCompany').value,
      duration: document.getElementById('expDuration').value,
      description: document.getElementById('expDescription').value
    };

    const profile = (await chrome.runtime.sendMessage({ action: 'getProfile' })).data;
    if (!profile.experience) profile.experience = [];

    if (id) {
      const index = profile.experience.findIndex(e => e.id === id);
      profile.experience[index] = experience;
    } else {
      profile.experience.push(experience);
    }

    await chrome.runtime.sendMessage({ action: 'saveProfile', payload: profile });
    showToast('Experience saved!', 'success');
    displayExperienceList(profile.experience);
    modal.classList.remove('show');
  };
}

/**
 * Open research modal
 */
function openResearchModal(id = null) {
  modal.classList.add('show');
  document.getElementById('modalTitle').textContent = id ? 'Edit Research' : 'Add Research';

  const modalForm = document.getElementById('modalForm');
  modalForm.innerHTML = `
    <div class="form-group">
      <label>Research Topic</label>
      <input type="text" id="researchTopic" placeholder="e.g., Machine Learning for Healthcare" required>
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea id="researchDescription" placeholder="Describe your research, methodology, findings, etc..." rows="8" required></textarea>
    </div>
    <button type="submit" class="btn btn-primary">Save</button>
  `;

  modalForm.onsubmit = async (e) => {
    e.preventDefault();
    const research = {
      id: id || Date.now().toString(),
      topic: document.getElementById('researchTopic').value,
      description: document.getElementById('researchDescription').value
    };

    const profile = (await chrome.runtime.sendMessage({ action: 'getProfile' })).data;
    if (!profile.research) profile.research = [];

    if (id) {
      const index = profile.research.findIndex(r => r.id === id);
      profile.research[index] = research;
    } else {
      profile.research.push(research);
    }

    await chrome.runtime.sendMessage({ action: 'saveProfile', payload: profile });
    showToast('Research saved!', 'success');
    displayResearchList(profile.research);
    modal.classList.remove('show');
  };
}

/**
 * Open other modal
 */
function openOtherModal(id = null) {
  modal.classList.add('show');
  document.getElementById('modalTitle').textContent = id ? 'Edit Item' : 'Add Item';

  const modalForm = document.getElementById('modalForm');
  modalForm.innerHTML = `
    <div class="form-group">
      <label>Topic</label>
      <input type="text" id="otherTopic" placeholder="e.g., Best Paper Award, AWS Certification, Personal Project..." required>
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea id="otherDescription" placeholder="Provide details about this item..." rows="6" required></textarea>
    </div>
    <button type="submit" class="btn btn-primary">Save</button>
  `;

  modalForm.onsubmit = async (e) => {
    e.preventDefault();
    const other = {
      id: id || Date.now().toString(),
      topic: document.getElementById('otherTopic').value,
      description: document.getElementById('otherDescription').value
    };

    const profile = (await chrome.runtime.sendMessage({ action: 'getProfile' })).data;
    if (!profile.other) profile.other = [];

    if (id) {
      const index = profile.other.findIndex(o => o.id === id);
      profile.other[index] = other;
    } else {
      profile.other.push(other);
    }

    await chrome.runtime.sendMessage({ action: 'saveProfile', payload: profile });
    showToast('Item saved!', 'success');
    displayOtherList(profile.other);
    modal.classList.remove('show');
  };
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

function editResearch(id) {
  console.log('Edit research:', id);
}

function deleteResearch(id) {
  console.log('Delete research:', id);
}

function editOther(id) {
  console.log('Edit other:', id);
}

function deleteOther(id) {
  console.log('Delete other:', id);
}

/**
 * Upload document
 */
function uploadDocument() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.md,.pdf';

  input.addEventListener('change', async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target.result;

        const document = {
          id: Date.now().toString(),
          name: file.name,
          type: file.type || 'text/plain',
          content: content,
          uploadedAt: new Date().toISOString()
        };

        const profile = (await chrome.runtime.sendMessage({ action: 'getProfile' })).data;
        if (!profile.documents) profile.documents = [];
        profile.documents.push(document);

        await chrome.runtime.sendMessage({ action: 'saveProfile', payload: profile });
        showToast('Document uploaded successfully!', 'success');
        displayDocumentsList(profile.documents);
      };

      reader.readAsText(file);
    } catch (error) {
      console.error('Error uploading document:', error);
      showToast('Error uploading document', 'error');
    }
  });

  input.click();
}

/**
 * Display documents list
 */
function displayDocumentsList(documents) {
  const list = document.getElementById('documentsList');

  if (documents.length === 0) {
    list.innerHTML = '<p class="empty-state">No documents uploaded yet.</p>';
    return;
  }

  list.innerHTML = documents
    .map(
      (doc) => `
    <div class="list-item">
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(doc.name)}</div>
        <div class="list-item-subtitle">${new Date(doc.uploadedAt).toLocaleDateString()} • ${(doc.content.length / 1024).toFixed(1)}KB</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-danger" data-doc-id="${doc.id}">Delete</button>
      </div>
    </div>
  `
    )
    .join('');

  // Add event listeners to delete buttons
  list.querySelectorAll('.btn-danger').forEach(btn => {
    btn.addEventListener('click', async () => {
      const docId = btn.getAttribute('data-doc-id');
      await deleteDocument(docId);
    });
  });
}

/**
 * Delete document
 */
async function deleteDocument(id) {
  if (!confirm('Are you sure you want to delete this document?')) return;

  try {
    const profile = (await chrome.runtime.sendMessage({ action: 'getProfile' })).data;
    profile.documents = (profile.documents || []).filter(d => d.id !== id);

    await chrome.runtime.sendMessage({ action: 'saveProfile', payload: profile });
    showToast('Document deleted!', 'success');
    displayDocumentsList(profile.documents);
  } catch (error) {
    console.error('Error deleting document:', error);
    showToast('Error deleting document', 'error');
  }
}
