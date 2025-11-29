// src/popup.js
var detectBtn;
var formsList;
var tabBtns;
var tabContents;
var settingsBtn;
var personalForm;
var llmForm;
var autoFillForm;
var styleForm;
var valuesForm;
var addEducationBtn;
var addExperienceBtn;
var addSkillBtn;
var addStoryBtn;
var exportBtn;
var importBtn;
var clearBtn;
var modal;
var closeBtn;
var toast;
document.addEventListener("DOMContentLoaded", () => {
  detectBtn = document.getElementById("detectBtn");
  formsList = document.getElementById("formsList");
  tabBtns = document.querySelectorAll(".tab-btn");
  tabContents = document.querySelectorAll(".tab-content");
  settingsBtn = document.getElementById("settingsBtn");
  personalForm = document.getElementById("personalForm");
  llmForm = document.getElementById("llmForm");
  autoFillForm = document.getElementById("autoFillForm");
  styleForm = document.getElementById("styleForm");
  valuesForm = document.getElementById("valuesForm");
  addEducationBtn = document.getElementById("addEducationBtn");
  addExperienceBtn = document.getElementById("addExperienceBtn");
  addSkillBtn = document.getElementById("addSkillBtn");
  addStoryBtn = document.getElementById("addStoryBtn");
  exportBtn = document.getElementById("exportBtn");
  importBtn = document.getElementById("importBtn");
  clearBtn = document.getElementById("clearBtn");
  modal = document.getElementById("modal");
  closeBtn = document.querySelector(".close");
  toast = document.getElementById("toast");
  console.log("[Popup] DOM elements initialized, toast:", toast);
  initializeTabs();
  loadProfile();
  loadSettings();
  setupEventListeners();
});
function initializeTabs() {
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-tab");
      switchTab(tabName);
    });
  });
}
function switchTab(tabName) {
  tabBtns.forEach((btn) => btn.classList.remove("active"));
  tabContents.forEach((content) => content.classList.remove("active"));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
  document.getElementById(`${tabName}-tab`).classList.add("active");
}
function setupEventListeners() {
  detectBtn.addEventListener("click", detectForms);
  personalForm.addEventListener("submit", savePersonalInfo);
  valuesForm.addEventListener("submit", saveValues);
  addEducationBtn.addEventListener("click", () => openEducationModal());
  addExperienceBtn.addEventListener("click", () => openExperienceModal());
  addSkillBtn.addEventListener("click", () => openSkillModal());
  addStoryBtn.addEventListener("click", () => openStoryModal());
  llmForm.addEventListener("submit", saveLLMSettings);
  autoFillForm.addEventListener("submit", saveAutoFillSettings);
  styleForm.addEventListener("submit", saveStyleSettings);
  exportBtn.addEventListener("click", exportData);
  importBtn.addEventListener("click", importData);
  clearBtn.addEventListener("click", clearAllData);
  closeBtn.addEventListener("click", () => modal.classList.remove("show"));
  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.remove("show");
    }
  });
  settingsBtn.addEventListener("click", () => switchTab("settings"));
}
async function detectForms() {
  try {
    detectBtn.disabled = true;
    detectBtn.textContent = "Detecting...";
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "getPageQuestions"
    });
    if (response.questions && response.questions.length > 0) {
      displayDetectedForms(response.questions);
      showToast(`Found ${response.questions.length} form fields!`, "success");
    } else {
      formsList.innerHTML = '<p class="empty-state">No form fields found on this page.</p>';
      showToast("No form fields detected", "error");
    }
  } catch (error) {
    console.error("Error detecting forms:", error);
    showToast("Error detecting forms: " + error.message, "error");
  } finally {
    detectBtn.disabled = false;
    detectBtn.textContent = "Detect Form Fields";
  }
}
function displayDetectedForms(questions) {
  if (questions.length === 0) {
    formsList.innerHTML = '<p class="empty-state">No form fields found.</p>';
    return;
  }
  formsList.innerHTML = questions.map(
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
  ).join("");
  const generateBtns = formsList.querySelectorAll(".generate-answer-btn");
  generateBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const fieldId = btn.getAttribute("data-field-id");
      const question = btn.getAttribute("data-question");
      generateAnswer(fieldId, question, btn);
    });
  });
}
async function generateAnswer(fieldId, question, buttonElement) {
  try {
    console.log("[generateAnswer] Starting with:", { fieldId, question });
    if (buttonElement) {
      buttonElement.disabled = true;
      buttonElement.textContent = "Generating...";
    }
    const settings = await chrome.storage.local.get("settings");
    console.log("[generateAnswer] Settings loaded:", settings);
    const customization = settings.settings?.customPromptStyle || {
      tone: "professional",
      length: "medium",
      includeMetrics: true
    };
    console.log("[generateAnswer] Sending message to background...");
    const response = await chrome.runtime.sendMessage({
      action: "generateAnswer",
      payload: {
        fieldId,
        question,
        customization
      }
    });
    console.log("[generateAnswer] Response:", response);
    if (response && response.success) {
      showToast("Answer generated successfully!", "success");
      console.log("[generateAnswer] Answer:", response.data.answer);
      if (buttonElement) {
        const formItem = buttonElement.closest(".form-item");
        const answerDiv = document.createElement("div");
        answerDiv.className = "generated-answer";
        answerDiv.innerHTML = `
          <div class="answer-text">${escapeHtml(response.data.answer)}</div>
          <div class="answer-actions">
            <button class="btn btn-primary fill-btn" data-field-id="${escapeHtml(fieldId)}" data-answer="${escapeHtml(response.data.answer)}">Fill Field</button>
            <button class="btn btn-secondary regenerate-btn" data-field-id="${escapeHtml(fieldId)}" data-question="${escapeHtml(question)}">Regenerate</button>
          </div>
        `;
        const existingAnswer = formItem.querySelector(".generated-answer");
        if (existingAnswer) {
          existingAnswer.remove();
        }
        formItem.appendChild(answerDiv);
        const fillBtn = answerDiv.querySelector(".fill-btn");
        const regenerateBtn = answerDiv.querySelector(".regenerate-btn");
        fillBtn.addEventListener("click", async () => {
          await fillField(fieldId, response.data.answer);
        });
        regenerateBtn.addEventListener("click", () => {
          generateAnswer(fieldId, question, buttonElement);
        });
      }
    } else {
      const errorMsg = response?.error || "Unknown error";
      showToast("Error: " + errorMsg, "error");
      console.error("[generateAnswer] Error:", errorMsg);
    }
  } catch (error) {
    console.error("[generateAnswer] Exception:", error);
    showToast("Error generating answer: " + error.message, "error");
  } finally {
    if (buttonElement) {
      buttonElement.disabled = false;
      buttonElement.textContent = "Generate Answer";
    }
  }
}
async function fillField(fieldId, answer) {
  try {
    console.log("[fillField] Filling field:", { fieldId, answer });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "fillField",
      fieldSelector: `[data-field-id="${fieldId}"]`,
      answer
    });
    if (response && response.success) {
      showToast("Field filled successfully!", "success");
    } else {
      showToast("Could not fill field. Try copying the answer manually.", "warning");
    }
  } catch (error) {
    console.error("[fillField] Error:", error);
    showToast("Error filling field: " + error.message, "error");
  }
}
async function loadProfile() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "getProfile"
    });
    if (response.success && response.data) {
      const profile = response.data;
      document.getElementById("fullName").value = profile.personal?.fullName || "";
      document.getElementById("email").value = profile.personal?.email || "";
      document.getElementById("phone").value = profile.personal?.phone || "";
      document.getElementById("location").value = profile.personal?.location || "";
      document.getElementById("summary").value = profile.personal?.summary || "";
      document.getElementById("careerGoals").value = profile.values?.careerGoals || "";
      document.getElementById("strengths").value = profile.values?.strengths?.join(", ") || "";
      document.getElementById("values").value = profile.values?.valuesImportant?.join(", ") || "";
      displayEducationList(profile.education || []);
      displayExperienceList(profile.experience || []);
      displaySkillsList(profile.skills || []);
      displayStoriesList(profile.stories || []);
    }
  } catch (error) {
    console.error("Error loading profile:", error);
  }
}
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "getSettings"
    });
    if (response.success && response.data) {
      const settings = response.data;
      document.getElementById("llmProvider").value = settings.llm?.provider || "openai";
      document.getElementById("apiKey").value = settings.llm?.apiKey || "";
      document.getElementById("model").value = settings.llm?.model || "gpt-4";
      document.getElementById("requireApproval").checked = settings.autoFill?.requireApproval || true;
      document.getElementById("avoidRepetition").checked = settings.autoFill?.avoidRepetition || true;
      document.getElementById("minDaysBetweenStories").value = settings.autoFill?.minDaysBetweenStories || 7;
      document.getElementById("tone").value = settings.customPromptStyle?.tone || "professional";
      document.getElementById("length").value = settings.customPromptStyle?.length || "medium";
      document.getElementById("includeMetrics").checked = settings.customPromptStyle?.includeMetrics || true;
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }
}
async function savePersonalInfo(e) {
  e.preventDefault();
  const personalInfo = {
    fullName: document.getElementById("fullName").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    location: document.getElementById("location").value,
    summary: document.getElementById("summary").value
  };
  try {
    const profile = (await chrome.runtime.sendMessage({
      action: "getProfile"
    })).data;
    profile.personal = personalInfo;
    await chrome.runtime.sendMessage({
      action: "saveProfile",
      payload: profile
    });
    showToast("Personal information saved!", "success");
  } catch (error) {
    console.error("Error saving personal info:", error);
    showToast("Error saving personal info", "error");
  }
}
async function saveValues(e) {
  e.preventDefault();
  const values = {
    careerGoals: document.getElementById("careerGoals").value,
    strengths: document.getElementById("strengths").value.split(",").map((s) => s.trim()),
    valuesImportant: document.getElementById("values").value.split(",").map((v) => v.trim()),
    motivation: []
  };
  try {
    const profile = (await chrome.runtime.sendMessage({
      action: "getProfile"
    })).data;
    profile.values = values;
    await chrome.runtime.sendMessage({
      action: "saveProfile",
      payload: profile
    });
    showToast("Values saved!", "success");
  } catch (error) {
    console.error("Error saving values:", error);
    showToast("Error saving values", "error");
  }
}
async function saveLLMSettings(e) {
  e.preventDefault();
  console.log("[Popup] saveLLMSettings called");
  const settings = {
    provider: document.getElementById("llmProvider").value,
    apiKey: document.getElementById("apiKey").value,
    model: document.getElementById("model").value
  };
  console.log("[Popup] Settings:", { provider: settings.provider, model: settings.model, hasApiKey: !!settings.apiKey });
  if (!settings.apiKey) {
    console.log("[Popup] No API key provided");
    showToast("Please enter your API key", "error");
    return;
  }
  try {
    console.log("[Popup] Sending message to background...");
    const response = await chrome.runtime.sendMessage({
      action: "saveLLMSettings",
      payload: settings
    });
    console.log("[Popup] Response:", response);
    showToast("LLM settings saved!", "success");
    if (!response || !response.success) {
      console.warn("[Popup] Response was not successful:", response);
    }
  } catch (error) {
    console.error("[Popup] Error saving LLM settings:", error);
    showToast("Error saving LLM settings: " + error.message, "error");
  }
}
async function saveAutoFillSettings(e) {
  e.preventDefault();
  const settings = {
    requireApproval: document.getElementById("requireApproval").checked,
    avoidRepetition: document.getElementById("avoidRepetition").checked,
    minDaysBetweenStories: parseInt(document.getElementById("minDaysBetweenStories").value)
  };
  try {
    await chrome.runtime.sendMessage({
      action: "saveAutoFillSettings",
      payload: settings
    });
    showToast("Auto-fill settings saved!", "success");
  } catch (error) {
    console.error("Error saving auto-fill settings:", error);
    showToast("Error saving settings", "error");
  }
}
async function saveStyleSettings(e) {
  e.preventDefault();
  const settings = {
    tone: document.getElementById("tone").value,
    length: document.getElementById("length").value,
    includeMetrics: document.getElementById("includeMetrics").checked
  };
  try {
    await chrome.runtime.sendMessage({
      action: "saveStyleSettings",
      payload: settings
    });
    showToast("Style settings saved!", "success");
  } catch (error) {
    console.error("Error saving style settings:", error);
    showToast("Error saving settings", "error");
  }
}
function displayEducationList(education) {
  const list = document.getElementById("educationList");
  if (education.length === 0) {
    list.innerHTML = '<p class="empty-state">No education added yet.</p>';
    return;
  }
  list.innerHTML = education.map(
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
  ).join("");
}
function displayExperienceList(experience) {
  const list = document.getElementById("experienceList");
  if (experience.length === 0) {
    list.innerHTML = '<p class="empty-state">No experience added yet.</p>';
    return;
  }
  list.innerHTML = experience.map(
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
  ).join("");
}
function displaySkillsList(skills) {
  const list = document.getElementById("skillsList");
  if (skills.length === 0) {
    list.innerHTML = '<p class="empty-state">No skills added yet.</p>';
    return;
  }
  list.innerHTML = skills.map(
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
  ).join("");
}
function displayStoriesList(stories) {
  const list = document.getElementById("storiesList");
  if (stories.length === 0) {
    list.innerHTML = '<p class="empty-state">No stories added yet.</p>';
    return;
  }
  list.innerHTML = stories.map(
    (story) => `
    <div class="list-item">
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(story.title)}</div>
        <div class="list-item-subtitle">${story.tags.join(", ")} \u2022 Used ${story.timesUsed} times</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary" onclick="editStory('${story.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteStory('${story.id}')">Delete</button>
      </div>
    </div>
  `
  ).join("");
}
function openEducationModal(id = null) {
  modal.classList.add("show");
  document.getElementById("modalTitle").textContent = id ? "Edit Education" : "Add Education";
}
function openExperienceModal(id = null) {
  modal.classList.add("show");
  document.getElementById("modalTitle").textContent = id ? "Edit Experience" : "Add Experience";
}
function openSkillModal(id = null) {
  modal.classList.add("show");
  document.getElementById("modalTitle").textContent = id ? "Edit Skill" : "Add Skill";
}
function openStoryModal(id = null) {
  modal.classList.add("show");
  document.getElementById("modalTitle").textContent = id ? "Edit Story" : "Add Story";
}
async function exportData() {
  try {
    const profile = (await chrome.runtime.sendMessage({ action: "getProfile" })).data;
    const settings = (await chrome.runtime.sendMessage({ action: "getSettings" })).data;
    const data = {
      profile,
      settings,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `formautofill-backup-${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Data exported successfully!", "success");
  } catch (error) {
    console.error("Error exporting data:", error);
    showToast("Error exporting data", "error");
  }
}
function importData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.addEventListener("change", async (e) => {
    try {
      const file = e.target.files[0];
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.profile && data.settings) {
        await chrome.runtime.sendMessage({
          action: "importData",
          payload: data
        });
        showToast("Data imported successfully!", "success");
        loadProfile();
        loadSettings();
      } else {
        showToast("Invalid backup file", "error");
      }
    } catch (error) {
      console.error("Error importing data:", error);
      showToast("Error importing data", "error");
    }
  });
  input.click();
}
function clearAllData() {
  if (confirm("Are you sure you want to delete all data? This cannot be undone.")) {
    chrome.runtime.sendMessage({
      action: "clearAllData"
    });
    showToast("All data cleared!", "success");
    loadProfile();
    loadSettings();
  }
}
function showToast(message, type = "info") {
  console.log("[showToast] Called with:", { message, type });
  if (!toast) {
    console.error("[showToast] Toast element not found!");
    alert(message);
    return;
  }
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  console.log("[showToast] Toast className:", toast.className);
  console.log("[showToast] Toast style:", window.getComputedStyle(toast).display);
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3e3);
}
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3BvcHVwLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcbiAqIFBvcHVwIFVJIExvZ2ljXG4gKiBIYW5kbGVzIHVzZXIgaW50ZXJhY3Rpb25zIGFuZCBwcm9maWxlIG1hbmFnZW1lbnQgaW4gdGhlIGV4dGVuc2lvbiBwb3B1cFxuICovXG5cbi8vIERPTSBFbGVtZW50cyAtIHdpbGwgYmUgaW5pdGlhbGl6ZWQgYWZ0ZXIgRE9NIGxvYWRzXG5sZXQgZGV0ZWN0QnRuLCBmb3Jtc0xpc3QsIHRhYkJ0bnMsIHRhYkNvbnRlbnRzLCBzZXR0aW5nc0J0bjtcbmxldCBwZXJzb25hbEZvcm0sIGxsbUZvcm0sIGF1dG9GaWxsRm9ybSwgc3R5bGVGb3JtLCB2YWx1ZXNGb3JtO1xubGV0IGFkZEVkdWNhdGlvbkJ0biwgYWRkRXhwZXJpZW5jZUJ0biwgYWRkU2tpbGxCdG4sIGFkZFN0b3J5QnRuO1xubGV0IGV4cG9ydEJ0biwgaW1wb3J0QnRuLCBjbGVhckJ0bjtcbmxldCBtb2RhbCwgY2xvc2VCdG4sIHRvYXN0O1xuXG4vLyBJbml0aWFsaXplIHBvcHVwXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xuICAvLyBJbml0aWFsaXplIGFsbCBET00gZWxlbWVudHNcbiAgZGV0ZWN0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RldGVjdEJ0bicpO1xuICBmb3Jtc0xpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZm9ybXNMaXN0Jyk7XG4gIHRhYkJ0bnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcudGFiLWJ0bicpO1xuICB0YWJDb250ZW50cyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50YWItY29udGVudCcpO1xuICBzZXR0aW5nc0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZXR0aW5nc0J0bicpO1xuXG4gIHBlcnNvbmFsRm9ybSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdwZXJzb25hbEZvcm0nKTtcbiAgbGxtRm9ybSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsbG1Gb3JtJyk7XG4gIGF1dG9GaWxsRm9ybSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhdXRvRmlsbEZvcm0nKTtcbiAgc3R5bGVGb3JtID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0eWxlRm9ybScpO1xuICB2YWx1ZXNGb3JtID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3ZhbHVlc0Zvcm0nKTtcblxuICBhZGRFZHVjYXRpb25CdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkRWR1Y2F0aW9uQnRuJyk7XG4gIGFkZEV4cGVyaWVuY2VCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkRXhwZXJpZW5jZUJ0bicpO1xuICBhZGRTa2lsbEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZGRTa2lsbEJ0bicpO1xuICBhZGRTdG9yeUJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZGRTdG9yeUJ0bicpO1xuICBleHBvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZXhwb3J0QnRuJyk7XG4gIGltcG9ydEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbXBvcnRCdG4nKTtcbiAgY2xlYXJCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY2xlYXJCdG4nKTtcblxuICBtb2RhbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RhbCcpO1xuICBjbG9zZUJ0biA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jbG9zZScpO1xuICB0b2FzdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0b2FzdCcpO1xuXG4gIGNvbnNvbGUubG9nKCdbUG9wdXBdIERPTSBlbGVtZW50cyBpbml0aWFsaXplZCwgdG9hc3Q6JywgdG9hc3QpO1xuXG4gIGluaXRpYWxpemVUYWJzKCk7XG4gIGxvYWRQcm9maWxlKCk7XG4gIGxvYWRTZXR0aW5ncygpO1xuICBzZXR1cEV2ZW50TGlzdGVuZXJzKCk7XG59KTtcblxuLyoqXG4gKiBUYWIgc3dpdGNoaW5nIGxvZ2ljXG4gKi9cbmZ1bmN0aW9uIGluaXRpYWxpemVUYWJzKCkge1xuICB0YWJCdG5zLmZvckVhY2goKGJ0bikgPT4ge1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIGNvbnN0IHRhYk5hbWUgPSBidG4uZ2V0QXR0cmlidXRlKCdkYXRhLXRhYicpO1xuICAgICAgc3dpdGNoVGFiKHRhYk5hbWUpO1xuICAgIH0pO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gc3dpdGNoVGFiKHRhYk5hbWUpIHtcbiAgLy8gRGVhY3RpdmF0ZSBhbGwgdGFic1xuICB0YWJCdG5zLmZvckVhY2goKGJ0bikgPT4gYnRuLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpKTtcbiAgdGFiQ29udGVudHMuZm9yRWFjaCgoY29udGVudCkgPT4gY29udGVudC5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKSk7XG5cbiAgLy8gQWN0aXZhdGUgc2VsZWN0ZWQgdGFiXG4gIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYFtkYXRhLXRhYj1cIiR7dGFiTmFtZX1cIl1gKS5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYCR7dGFiTmFtZX0tdGFiYCkuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG59XG5cbi8qKlxuICogU2V0dXAgYWxsIGV2ZW50IGxpc3RlbmVyc1xuICovXG5mdW5jdGlvbiBzZXR1cEV2ZW50TGlzdGVuZXJzKCkge1xuICAvLyBEZXRlY3QgZm9ybXNcbiAgZGV0ZWN0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZGV0ZWN0Rm9ybXMpO1xuXG4gIC8vIFByb2ZpbGUgZm9ybXNcbiAgcGVyc29uYWxGb3JtLmFkZEV2ZW50TGlzdGVuZXIoJ3N1Ym1pdCcsIHNhdmVQZXJzb25hbEluZm8pO1xuICB2YWx1ZXNGb3JtLmFkZEV2ZW50TGlzdGVuZXIoJ3N1Ym1pdCcsIHNhdmVWYWx1ZXMpO1xuXG4gIC8vIEFkZCBidXR0b25zXG4gIGFkZEVkdWNhdGlvbkJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IG9wZW5FZHVjYXRpb25Nb2RhbCgpKTtcbiAgYWRkRXhwZXJpZW5jZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IG9wZW5FeHBlcmllbmNlTW9kYWwoKSk7XG4gIGFkZFNraWxsQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3BlblNraWxsTW9kYWwoKSk7XG4gIGFkZFN0b3J5QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3BlblN0b3J5TW9kYWwoKSk7XG5cbiAgLy8gU2V0dGluZ3MgZm9ybXNcbiAgbGxtRm9ybS5hZGRFdmVudExpc3RlbmVyKCdzdWJtaXQnLCBzYXZlTExNU2V0dGluZ3MpO1xuICBhdXRvRmlsbEZvcm0uYWRkRXZlbnRMaXN0ZW5lcignc3VibWl0Jywgc2F2ZUF1dG9GaWxsU2V0dGluZ3MpO1xuICBzdHlsZUZvcm0uYWRkRXZlbnRMaXN0ZW5lcignc3VibWl0Jywgc2F2ZVN0eWxlU2V0dGluZ3MpO1xuXG4gIC8vIERhdGEgbWFuYWdlbWVudFxuICBleHBvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBleHBvcnREYXRhKTtcbiAgaW1wb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaW1wb3J0RGF0YSk7XG4gIGNsZWFyQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xlYXJBbGxEYXRhKTtcblxuICAvLyBNb2RhbFxuICBjbG9zZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IG1vZGFsLmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3cnKSk7XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgaWYgKGUudGFyZ2V0ID09PSBtb2RhbCkge1xuICAgICAgbW9kYWwuY2xhc3NMaXN0LnJlbW92ZSgnc2hvdycpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gU2V0dGluZ3MgYnV0dG9uXG4gIHNldHRpbmdzQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gc3dpdGNoVGFiKCdzZXR0aW5ncycpKTtcbn1cblxuLyoqXG4gKiBEZXRlY3QgZm9ybXMgb24gdGhlIGN1cnJlbnQgcGFnZVxuICovXG5hc3luYyBmdW5jdGlvbiBkZXRlY3RGb3JtcygpIHtcbiAgdHJ5IHtcbiAgICBkZXRlY3RCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICAgIGRldGVjdEJ0bi50ZXh0Q29udGVudCA9ICdEZXRlY3RpbmcuLi4nO1xuXG4gICAgY29uc3QgW3RhYl0gPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7IGFjdGl2ZTogdHJ1ZSwgY3VycmVudFdpbmRvdzogdHJ1ZSB9KTtcblxuICAgIC8vIFNlbmQgbWVzc2FnZSB0byBjb250ZW50IHNjcmlwdCB0byBkZXRlY3QgZm9ybXNcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS50YWJzLnNlbmRNZXNzYWdlKHRhYi5pZCwge1xuICAgICAgYWN0aW9uOiAnZ2V0UGFnZVF1ZXN0aW9ucycsXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2UucXVlc3Rpb25zICYmIHJlc3BvbnNlLnF1ZXN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICBkaXNwbGF5RGV0ZWN0ZWRGb3JtcyhyZXNwb25zZS5xdWVzdGlvbnMpO1xuICAgICAgc2hvd1RvYXN0KGBGb3VuZCAke3Jlc3BvbnNlLnF1ZXN0aW9ucy5sZW5ndGh9IGZvcm0gZmllbGRzIWAsICdzdWNjZXNzJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZvcm1zTGlzdC5pbm5lckhUTUwgPSAnPHAgY2xhc3M9XCJlbXB0eS1zdGF0ZVwiPk5vIGZvcm0gZmllbGRzIGZvdW5kIG9uIHRoaXMgcGFnZS48L3A+JztcbiAgICAgIHNob3dUb2FzdCgnTm8gZm9ybSBmaWVsZHMgZGV0ZWN0ZWQnLCAnZXJyb3InKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZGV0ZWN0aW5nIGZvcm1zOicsIGVycm9yKTtcbiAgICBzaG93VG9hc3QoJ0Vycm9yIGRldGVjdGluZyBmb3JtczogJyArIGVycm9yLm1lc3NhZ2UsICdlcnJvcicpO1xuICB9IGZpbmFsbHkge1xuICAgIGRldGVjdEJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgIGRldGVjdEJ0bi50ZXh0Q29udGVudCA9ICdEZXRlY3QgRm9ybSBGaWVsZHMnO1xuICB9XG59XG5cbi8qKlxuICogRGlzcGxheSBkZXRlY3RlZCBmb3JtIGZpZWxkc1xuICovXG5mdW5jdGlvbiBkaXNwbGF5RGV0ZWN0ZWRGb3JtcyhxdWVzdGlvbnMpIHtcbiAgaWYgKHF1ZXN0aW9ucy5sZW5ndGggPT09IDApIHtcbiAgICBmb3Jtc0xpc3QuaW5uZXJIVE1MID0gJzxwIGNsYXNzPVwiZW1wdHktc3RhdGVcIj5ObyBmb3JtIGZpZWxkcyBmb3VuZC48L3A+JztcbiAgICByZXR1cm47XG4gIH1cblxuICBmb3Jtc0xpc3QuaW5uZXJIVE1MID0gcXVlc3Rpb25zXG4gICAgLm1hcChcbiAgICAgIChxLCBpbmRleCkgPT4gYFxuICAgIDxkaXYgY2xhc3M9XCJmb3JtLWl0ZW1cIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJmb3JtLWl0ZW0tbGFiZWxcIj4ke2VzY2FwZUh0bWwocS5xdWVzdGlvblRleHQpfTwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cImZvcm0taXRlbS1hY3Rpb25zXCI+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLXByaW1hcnkgZ2VuZXJhdGUtYW5zd2VyLWJ0blwiIGRhdGEtZmllbGQtaWQ9XCIke2VzY2FwZUh0bWwocS5maWVsZElkKX1cIiBkYXRhLXF1ZXN0aW9uPVwiJHtlc2NhcGVIdG1sKHEucXVlc3Rpb25UZXh0KX1cIiBkYXRhLWluZGV4PVwiJHtpbmRleH1cIj5cbiAgICAgICAgICBHZW5lcmF0ZSBBbnN3ZXJcbiAgICAgICAgPC9idXR0b24+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgYFxuICAgIClcbiAgICAuam9pbignJyk7XG5cbiAgLy8gQWRkIGV2ZW50IGxpc3RlbmVycyB0byBhbGwgZ2VuZXJhdGUgYnV0dG9uc1xuICBjb25zdCBnZW5lcmF0ZUJ0bnMgPSBmb3Jtc0xpc3QucXVlcnlTZWxlY3RvckFsbCgnLmdlbmVyYXRlLWFuc3dlci1idG4nKTtcbiAgZ2VuZXJhdGVCdG5zLmZvckVhY2goKGJ0bikgPT4ge1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkSWQgPSBidG4uZ2V0QXR0cmlidXRlKCdkYXRhLWZpZWxkLWlkJyk7XG4gICAgICBjb25zdCBxdWVzdGlvbiA9IGJ0bi5nZXRBdHRyaWJ1dGUoJ2RhdGEtcXVlc3Rpb24nKTtcbiAgICAgIGdlbmVyYXRlQW5zd2VyKGZpZWxkSWQsIHF1ZXN0aW9uLCBidG4pO1xuICAgIH0pO1xuICB9KTtcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZSBhbnN3ZXIgZm9yIGEgZm9ybSBxdWVzdGlvblxuICovXG5hc3luYyBmdW5jdGlvbiBnZW5lcmF0ZUFuc3dlcihmaWVsZElkLCBxdWVzdGlvbiwgYnV0dG9uRWxlbWVudCkge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKCdbZ2VuZXJhdGVBbnN3ZXJdIFN0YXJ0aW5nIHdpdGg6JywgeyBmaWVsZElkLCBxdWVzdGlvbiB9KTtcblxuICAgIC8vIERpc2FibGUgYnV0dG9uIGFuZCBzaG93IGxvYWRpbmcgc3RhdGVcbiAgICBpZiAoYnV0dG9uRWxlbWVudCkge1xuICAgICAgYnV0dG9uRWxlbWVudC5kaXNhYmxlZCA9IHRydWU7XG4gICAgICBidXR0b25FbGVtZW50LnRleHRDb250ZW50ID0gJ0dlbmVyYXRpbmcuLi4nO1xuICAgIH1cblxuICAgIGNvbnN0IHNldHRpbmdzID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KCdzZXR0aW5ncycpO1xuICAgIGNvbnNvbGUubG9nKCdbZ2VuZXJhdGVBbnN3ZXJdIFNldHRpbmdzIGxvYWRlZDonLCBzZXR0aW5ncyk7XG5cbiAgICBjb25zdCBjdXN0b21pemF0aW9uID0gc2V0dGluZ3Muc2V0dGluZ3M/LmN1c3RvbVByb21wdFN0eWxlIHx8IHtcbiAgICAgIHRvbmU6ICdwcm9mZXNzaW9uYWwnLFxuICAgICAgbGVuZ3RoOiAnbWVkaXVtJyxcbiAgICAgIGluY2x1ZGVNZXRyaWNzOiB0cnVlLFxuICAgIH07XG5cbiAgICBjb25zb2xlLmxvZygnW2dlbmVyYXRlQW5zd2VyXSBTZW5kaW5nIG1lc3NhZ2UgdG8gYmFja2dyb3VuZC4uLicpO1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgYWN0aW9uOiAnZ2VuZXJhdGVBbnN3ZXInLFxuICAgICAgcGF5bG9hZDoge1xuICAgICAgICBmaWVsZElkLFxuICAgICAgICBxdWVzdGlvbixcbiAgICAgICAgY3VzdG9taXphdGlvbixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zb2xlLmxvZygnW2dlbmVyYXRlQW5zd2VyXSBSZXNwb25zZTonLCByZXNwb25zZSk7XG5cbiAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uuc3VjY2Vzcykge1xuICAgICAgc2hvd1RvYXN0KCdBbnN3ZXIgZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseSEnLCAnc3VjY2VzcycpO1xuICAgICAgY29uc29sZS5sb2coJ1tnZW5lcmF0ZUFuc3dlcl0gQW5zd2VyOicsIHJlc3BvbnNlLmRhdGEuYW5zd2VyKTtcblxuICAgICAgLy8gU2hvdyB0aGUgZ2VuZXJhdGVkIGFuc3dlciBpbiB0aGUgVUlcbiAgICAgIGlmIChidXR0b25FbGVtZW50KSB7XG4gICAgICAgIGNvbnN0IGZvcm1JdGVtID0gYnV0dG9uRWxlbWVudC5jbG9zZXN0KCcuZm9ybS1pdGVtJyk7XG4gICAgICAgIGNvbnN0IGFuc3dlckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICBhbnN3ZXJEaXYuY2xhc3NOYW1lID0gJ2dlbmVyYXRlZC1hbnN3ZXInO1xuICAgICAgICBhbnN3ZXJEaXYuaW5uZXJIVE1MID0gYFxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJhbnN3ZXItdGV4dFwiPiR7ZXNjYXBlSHRtbChyZXNwb25zZS5kYXRhLmFuc3dlcil9PC9kaXY+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImFuc3dlci1hY3Rpb25zXCI+XG4gICAgICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5IGZpbGwtYnRuXCIgZGF0YS1maWVsZC1pZD1cIiR7ZXNjYXBlSHRtbChmaWVsZElkKX1cIiBkYXRhLWFuc3dlcj1cIiR7ZXNjYXBlSHRtbChyZXNwb25zZS5kYXRhLmFuc3dlcil9XCI+RmlsbCBGaWVsZDwvYnV0dG9uPlxuICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tc2Vjb25kYXJ5IHJlZ2VuZXJhdGUtYnRuXCIgZGF0YS1maWVsZC1pZD1cIiR7ZXNjYXBlSHRtbChmaWVsZElkKX1cIiBkYXRhLXF1ZXN0aW9uPVwiJHtlc2NhcGVIdG1sKHF1ZXN0aW9uKX1cIj5SZWdlbmVyYXRlPC9idXR0b24+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIGA7XG5cbiAgICAgICAgLy8gUmVtb3ZlIGFueSBleGlzdGluZyBhbnN3ZXJcbiAgICAgICAgY29uc3QgZXhpc3RpbmdBbnN3ZXIgPSBmb3JtSXRlbS5xdWVyeVNlbGVjdG9yKCcuZ2VuZXJhdGVkLWFuc3dlcicpO1xuICAgICAgICBpZiAoZXhpc3RpbmdBbnN3ZXIpIHtcbiAgICAgICAgICBleGlzdGluZ0Fuc3dlci5yZW1vdmUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvcm1JdGVtLmFwcGVuZENoaWxkKGFuc3dlckRpdik7XG5cbiAgICAgICAgLy8gQWRkIGV2ZW50IGxpc3RlbmVyc1xuICAgICAgICBjb25zdCBmaWxsQnRuID0gYW5zd2VyRGl2LnF1ZXJ5U2VsZWN0b3IoJy5maWxsLWJ0bicpO1xuICAgICAgICBjb25zdCByZWdlbmVyYXRlQnRuID0gYW5zd2VyRGl2LnF1ZXJ5U2VsZWN0b3IoJy5yZWdlbmVyYXRlLWJ0bicpO1xuXG4gICAgICAgIGZpbGxCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgYXdhaXQgZmlsbEZpZWxkKGZpZWxkSWQsIHJlc3BvbnNlLmRhdGEuYW5zd2VyKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmVnZW5lcmF0ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICBnZW5lcmF0ZUFuc3dlcihmaWVsZElkLCBxdWVzdGlvbiwgYnV0dG9uRWxlbWVudCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBlcnJvck1zZyA9IHJlc3BvbnNlPy5lcnJvciB8fCAnVW5rbm93biBlcnJvcic7XG4gICAgICBzaG93VG9hc3QoJ0Vycm9yOiAnICsgZXJyb3JNc2csICdlcnJvcicpO1xuICAgICAgY29uc29sZS5lcnJvcignW2dlbmVyYXRlQW5zd2VyXSBFcnJvcjonLCBlcnJvck1zZyk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ1tnZW5lcmF0ZUFuc3dlcl0gRXhjZXB0aW9uOicsIGVycm9yKTtcbiAgICBzaG93VG9hc3QoJ0Vycm9yIGdlbmVyYXRpbmcgYW5zd2VyOiAnICsgZXJyb3IubWVzc2FnZSwgJ2Vycm9yJyk7XG4gIH0gZmluYWxseSB7XG4gICAgLy8gUmUtZW5hYmxlIGJ1dHRvblxuICAgIGlmIChidXR0b25FbGVtZW50KSB7XG4gICAgICBidXR0b25FbGVtZW50LmRpc2FibGVkID0gZmFsc2U7XG4gICAgICBidXR0b25FbGVtZW50LnRleHRDb250ZW50ID0gJ0dlbmVyYXRlIEFuc3dlcic7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogRmlsbCBhIGZvcm0gZmllbGQgd2l0aCB0aGUgZ2VuZXJhdGVkIGFuc3dlclxuICovXG5hc3luYyBmdW5jdGlvbiBmaWxsRmllbGQoZmllbGRJZCwgYW5zd2VyKSB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ1tmaWxsRmllbGRdIEZpbGxpbmcgZmllbGQ6JywgeyBmaWVsZElkLCBhbnN3ZXIgfSk7XG5cbiAgICBjb25zdCBbdGFiXSA9IGF3YWl0IGNocm9tZS50YWJzLnF1ZXJ5KHsgYWN0aXZlOiB0cnVlLCBjdXJyZW50V2luZG93OiB0cnVlIH0pO1xuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUudGFicy5zZW5kTWVzc2FnZSh0YWIuaWQsIHtcbiAgICAgIGFjdGlvbjogJ2ZpbGxGaWVsZCcsXG4gICAgICBmaWVsZFNlbGVjdG9yOiBgW2RhdGEtZmllbGQtaWQ9XCIke2ZpZWxkSWR9XCJdYCxcbiAgICAgIGFuc3dlcjogYW5zd2VyLFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLnN1Y2Nlc3MpIHtcbiAgICAgIHNob3dUb2FzdCgnRmllbGQgZmlsbGVkIHN1Y2Nlc3NmdWxseSEnLCAnc3VjY2VzcycpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzaG93VG9hc3QoJ0NvdWxkIG5vdCBmaWxsIGZpZWxkLiBUcnkgY29weWluZyB0aGUgYW5zd2VyIG1hbnVhbGx5LicsICd3YXJuaW5nJyk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ1tmaWxsRmllbGRdIEVycm9yOicsIGVycm9yKTtcbiAgICBzaG93VG9hc3QoJ0Vycm9yIGZpbGxpbmcgZmllbGQ6ICcgKyBlcnJvci5tZXNzYWdlLCAnZXJyb3InKTtcbiAgfVxufVxuXG4vKipcbiAqIExvYWQgcHJvZmlsZSBkYXRhIGludG8gdGhlIFVJXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGxvYWRQcm9maWxlKCkge1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgYWN0aW9uOiAnZ2V0UHJvZmlsZScsXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3VjY2VzcyAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICBjb25zdCBwcm9maWxlID0gcmVzcG9uc2UuZGF0YTtcblxuICAgICAgLy8gUGVyc29uYWwgaW5mb1xuICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2Z1bGxOYW1lJykudmFsdWUgPSBwcm9maWxlLnBlcnNvbmFsPy5mdWxsTmFtZSB8fCAnJztcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdlbWFpbCcpLnZhbHVlID0gcHJvZmlsZS5wZXJzb25hbD8uZW1haWwgfHwgJyc7XG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncGhvbmUnKS52YWx1ZSA9IHByb2ZpbGUucGVyc29uYWw/LnBob25lIHx8ICcnO1xuICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvY2F0aW9uJykudmFsdWUgPSBwcm9maWxlLnBlcnNvbmFsPy5sb2NhdGlvbiB8fCAnJztcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdW1tYXJ5JykudmFsdWUgPSBwcm9maWxlLnBlcnNvbmFsPy5zdW1tYXJ5IHx8ICcnO1xuXG4gICAgICAvLyBWYWx1ZXNcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjYXJlZXJHb2FscycpLnZhbHVlID0gcHJvZmlsZS52YWx1ZXM/LmNhcmVlckdvYWxzIHx8ICcnO1xuICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmVuZ3RocycpLnZhbHVlID0gcHJvZmlsZS52YWx1ZXM/LnN0cmVuZ3Rocz8uam9pbignLCAnKSB8fCAnJztcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd2YWx1ZXMnKS52YWx1ZSA9IHByb2ZpbGUudmFsdWVzPy52YWx1ZXNJbXBvcnRhbnQ/LmpvaW4oJywgJykgfHwgJyc7XG5cbiAgICAgIC8vIERpc3BsYXkgZWR1Y2F0aW9uIGl0ZW1zXG4gICAgICBkaXNwbGF5RWR1Y2F0aW9uTGlzdChwcm9maWxlLmVkdWNhdGlvbiB8fCBbXSk7XG4gICAgICAvLyBEaXNwbGF5IGV4cGVyaWVuY2UgaXRlbXNcbiAgICAgIGRpc3BsYXlFeHBlcmllbmNlTGlzdChwcm9maWxlLmV4cGVyaWVuY2UgfHwgW10pO1xuICAgICAgLy8gRGlzcGxheSBza2lsbHNcbiAgICAgIGRpc3BsYXlTa2lsbHNMaXN0KHByb2ZpbGUuc2tpbGxzIHx8IFtdKTtcbiAgICAgIC8vIERpc3BsYXkgc3Rvcmllc1xuICAgICAgZGlzcGxheVN0b3JpZXNMaXN0KHByb2ZpbGUuc3RvcmllcyB8fCBbXSk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGxvYWRpbmcgcHJvZmlsZTonLCBlcnJvcik7XG4gIH1cbn1cblxuLyoqXG4gKiBMb2FkIHNldHRpbmdzIGludG8gdGhlIFVJXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGxvYWRTZXR0aW5ncygpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIGFjdGlvbjogJ2dldFNldHRpbmdzJyxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdWNjZXNzICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gcmVzcG9uc2UuZGF0YTtcblxuICAgICAgLy8gTExNIHNldHRpbmdzXG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGxtUHJvdmlkZXInKS52YWx1ZSA9IHNldHRpbmdzLmxsbT8ucHJvdmlkZXIgfHwgJ29wZW5haSc7XG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXBpS2V5JykudmFsdWUgPSBzZXR0aW5ncy5sbG0/LmFwaUtleSB8fCAnJztcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RlbCcpLnZhbHVlID0gc2V0dGluZ3MubGxtPy5tb2RlbCB8fCAnZ3B0LTQnO1xuXG4gICAgICAvLyBBdXRvLWZpbGwgc2V0dGluZ3NcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXF1aXJlQXBwcm92YWwnKS5jaGVja2VkID0gc2V0dGluZ3MuYXV0b0ZpbGw/LnJlcXVpcmVBcHByb3ZhbCB8fCB0cnVlO1xuICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F2b2lkUmVwZXRpdGlvbicpLmNoZWNrZWQgPSBzZXR0aW5ncy5hdXRvRmlsbD8uYXZvaWRSZXBldGl0aW9uIHx8IHRydWU7XG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbWluRGF5c0JldHdlZW5TdG9yaWVzJykudmFsdWUgPSBzZXR0aW5ncy5hdXRvRmlsbD8ubWluRGF5c0JldHdlZW5TdG9yaWVzIHx8IDc7XG5cbiAgICAgIC8vIFN0eWxlIHNldHRpbmdzXG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9uZScpLnZhbHVlID0gc2V0dGluZ3MuY3VzdG9tUHJvbXB0U3R5bGU/LnRvbmUgfHwgJ3Byb2Zlc3Npb25hbCc7XG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGVuZ3RoJykudmFsdWUgPSBzZXR0aW5ncy5jdXN0b21Qcm9tcHRTdHlsZT8ubGVuZ3RoIHx8ICdtZWRpdW0nO1xuICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2luY2x1ZGVNZXRyaWNzJykuY2hlY2tlZCA9IHNldHRpbmdzLmN1c3RvbVByb21wdFN0eWxlPy5pbmNsdWRlTWV0cmljcyB8fCB0cnVlO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBsb2FkaW5nIHNldHRpbmdzOicsIGVycm9yKTtcbiAgfVxufVxuXG4vKipcbiAqIFNhdmUgcGVyc29uYWwgaW5mb3JtYXRpb25cbiAqL1xuYXN5bmMgZnVuY3Rpb24gc2F2ZVBlcnNvbmFsSW5mbyhlKSB7XG4gIGUucHJldmVudERlZmF1bHQoKTtcblxuICBjb25zdCBwZXJzb25hbEluZm8gPSB7XG4gICAgZnVsbE5hbWU6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmdWxsTmFtZScpLnZhbHVlLFxuICAgIGVtYWlsOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZW1haWwnKS52YWx1ZSxcbiAgICBwaG9uZTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Bob25lJykudmFsdWUsXG4gICAgbG9jYXRpb246IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2NhdGlvbicpLnZhbHVlLFxuICAgIHN1bW1hcnk6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdW1tYXJ5JykudmFsdWUsXG4gIH07XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBwcm9maWxlID0gKFxuICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICBhY3Rpb246ICdnZXRQcm9maWxlJyxcbiAgICAgIH0pXG4gICAgKS5kYXRhO1xuXG4gICAgcHJvZmlsZS5wZXJzb25hbCA9IHBlcnNvbmFsSW5mbztcblxuICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIGFjdGlvbjogJ3NhdmVQcm9maWxlJyxcbiAgICAgIHBheWxvYWQ6IHByb2ZpbGUsXG4gICAgfSk7XG5cbiAgICBzaG93VG9hc3QoJ1BlcnNvbmFsIGluZm9ybWF0aW9uIHNhdmVkIScsICdzdWNjZXNzJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIHBlcnNvbmFsIGluZm86JywgZXJyb3IpO1xuICAgIHNob3dUb2FzdCgnRXJyb3Igc2F2aW5nIHBlcnNvbmFsIGluZm8nLCAnZXJyb3InKTtcbiAgfVxufVxuXG4vKipcbiAqIFNhdmUgdmFsdWVzIGFuZCBnb2Fsc1xuICovXG5hc3luYyBmdW5jdGlvbiBzYXZlVmFsdWVzKGUpIHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gIGNvbnN0IHZhbHVlcyA9IHtcbiAgICBjYXJlZXJHb2FsczogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NhcmVlckdvYWxzJykudmFsdWUsXG4gICAgc3RyZW5ndGhzOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyZW5ndGhzJykudmFsdWUuc3BsaXQoJywnKS5tYXAoKHMpID0+IHMudHJpbSgpKSxcbiAgICB2YWx1ZXNJbXBvcnRhbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd2YWx1ZXMnKS52YWx1ZS5zcGxpdCgnLCcpLm1hcCgodikgPT4gdi50cmltKCkpLFxuICAgIG1vdGl2YXRpb246IFtdLFxuICB9O1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcHJvZmlsZSA9IChcbiAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgYWN0aW9uOiAnZ2V0UHJvZmlsZScsXG4gICAgICB9KVxuICAgICkuZGF0YTtcblxuICAgIHByb2ZpbGUudmFsdWVzID0gdmFsdWVzO1xuXG4gICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgYWN0aW9uOiAnc2F2ZVByb2ZpbGUnLFxuICAgICAgcGF5bG9hZDogcHJvZmlsZSxcbiAgICB9KTtcblxuICAgIHNob3dUb2FzdCgnVmFsdWVzIHNhdmVkIScsICdzdWNjZXNzJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIHZhbHVlczonLCBlcnJvcik7XG4gICAgc2hvd1RvYXN0KCdFcnJvciBzYXZpbmcgdmFsdWVzJywgJ2Vycm9yJyk7XG4gIH1cbn1cblxuLyoqXG4gKiBTYXZlIExMTSBzZXR0aW5nc1xuICovXG5hc3luYyBmdW5jdGlvbiBzYXZlTExNU2V0dGluZ3MoZSkge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG5cbiAgY29uc29sZS5sb2coJ1tQb3B1cF0gc2F2ZUxMTVNldHRpbmdzIGNhbGxlZCcpO1xuXG4gIGNvbnN0IHNldHRpbmdzID0ge1xuICAgIHByb3ZpZGVyOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGxtUHJvdmlkZXInKS52YWx1ZSxcbiAgICBhcGlLZXk6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhcGlLZXknKS52YWx1ZSxcbiAgICBtb2RlbDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vZGVsJykudmFsdWUsXG4gIH07XG5cbiAgY29uc29sZS5sb2coJ1tQb3B1cF0gU2V0dGluZ3M6JywgeyBwcm92aWRlcjogc2V0dGluZ3MucHJvdmlkZXIsIG1vZGVsOiBzZXR0aW5ncy5tb2RlbCwgaGFzQXBpS2V5OiAhIXNldHRpbmdzLmFwaUtleSB9KTtcblxuICBpZiAoIXNldHRpbmdzLmFwaUtleSkge1xuICAgIGNvbnNvbGUubG9nKCdbUG9wdXBdIE5vIEFQSSBrZXkgcHJvdmlkZWQnKTtcbiAgICBzaG93VG9hc3QoJ1BsZWFzZSBlbnRlciB5b3VyIEFQSSBrZXknLCAnZXJyb3InKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKCdbUG9wdXBdIFNlbmRpbmcgbWVzc2FnZSB0byBiYWNrZ3JvdW5kLi4uJyk7XG4gICAgLy8gU2F2ZSB2aWEgYmFja2dyb3VuZCBzY3JpcHRcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIGFjdGlvbjogJ3NhdmVMTE1TZXR0aW5ncycsXG4gICAgICBwYXlsb2FkOiBzZXR0aW5ncyxcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKCdbUG9wdXBdIFJlc3BvbnNlOicsIHJlc3BvbnNlKTtcblxuICAgIC8vIFx1NTE0OFx1NUYzQVx1NTIzNlx1NjYzRVx1NzkzQVx1NjIxMFx1NTI5Rlx1NkQ4OFx1NjA2Rlx1OEZEQlx1ODg0Q1x1NkQ0Qlx1OEJENVxuICAgIHNob3dUb2FzdCgnTExNIHNldHRpbmdzIHNhdmVkIScsICdzdWNjZXNzJyk7XG5cbiAgICBpZiAoIXJlc3BvbnNlIHx8ICFyZXNwb25zZS5zdWNjZXNzKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ1tQb3B1cF0gUmVzcG9uc2Ugd2FzIG5vdCBzdWNjZXNzZnVsOicsIHJlc3BvbnNlKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignW1BvcHVwXSBFcnJvciBzYXZpbmcgTExNIHNldHRpbmdzOicsIGVycm9yKTtcbiAgICBzaG93VG9hc3QoJ0Vycm9yIHNhdmluZyBMTE0gc2V0dGluZ3M6ICcgKyBlcnJvci5tZXNzYWdlLCAnZXJyb3InKTtcbiAgfVxufVxuXG4vKipcbiAqIFNhdmUgYXV0by1maWxsIHNldHRpbmdzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHNhdmVBdXRvRmlsbFNldHRpbmdzKGUpIHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gIGNvbnN0IHNldHRpbmdzID0ge1xuICAgIHJlcXVpcmVBcHByb3ZhbDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3JlcXVpcmVBcHByb3ZhbCcpLmNoZWNrZWQsXG4gICAgYXZvaWRSZXBldGl0aW9uOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXZvaWRSZXBldGl0aW9uJykuY2hlY2tlZCxcbiAgICBtaW5EYXlzQmV0d2VlblN0b3JpZXM6IHBhcnNlSW50KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtaW5EYXlzQmV0d2VlblN0b3JpZXMnKS52YWx1ZSksXG4gIH07XG5cbiAgdHJ5IHtcbiAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICBhY3Rpb246ICdzYXZlQXV0b0ZpbGxTZXR0aW5ncycsXG4gICAgICBwYXlsb2FkOiBzZXR0aW5ncyxcbiAgICB9KTtcblxuICAgIHNob3dUb2FzdCgnQXV0by1maWxsIHNldHRpbmdzIHNhdmVkIScsICdzdWNjZXNzJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIGF1dG8tZmlsbCBzZXR0aW5nczonLCBlcnJvcik7XG4gICAgc2hvd1RvYXN0KCdFcnJvciBzYXZpbmcgc2V0dGluZ3MnLCAnZXJyb3InKTtcbiAgfVxufVxuXG4vKipcbiAqIFNhdmUgc3R5bGUgc2V0dGluZ3NcbiAqL1xuYXN5bmMgZnVuY3Rpb24gc2F2ZVN0eWxlU2V0dGluZ3MoZSkge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG5cbiAgY29uc3Qgc2V0dGluZ3MgPSB7XG4gICAgdG9uZTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RvbmUnKS52YWx1ZSxcbiAgICBsZW5ndGg6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsZW5ndGgnKS52YWx1ZSxcbiAgICBpbmNsdWRlTWV0cmljczogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2luY2x1ZGVNZXRyaWNzJykuY2hlY2tlZCxcbiAgfTtcblxuICB0cnkge1xuICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIGFjdGlvbjogJ3NhdmVTdHlsZVNldHRpbmdzJyxcbiAgICAgIHBheWxvYWQ6IHNldHRpbmdzLFxuICAgIH0pO1xuXG4gICAgc2hvd1RvYXN0KCdTdHlsZSBzZXR0aW5ncyBzYXZlZCEnLCAnc3VjY2VzcycpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHNhdmluZyBzdHlsZSBzZXR0aW5nczonLCBlcnJvcik7XG4gICAgc2hvd1RvYXN0KCdFcnJvciBzYXZpbmcgc2V0dGluZ3MnLCAnZXJyb3InKTtcbiAgfVxufVxuXG4vKipcbiAqIERpc3BsYXkgZWR1Y2F0aW9uIGxpc3RcbiAqL1xuZnVuY3Rpb24gZGlzcGxheUVkdWNhdGlvbkxpc3QoZWR1Y2F0aW9uKSB7XG4gIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZWR1Y2F0aW9uTGlzdCcpO1xuXG4gIGlmIChlZHVjYXRpb24ubGVuZ3RoID09PSAwKSB7XG4gICAgbGlzdC5pbm5lckhUTUwgPSAnPHAgY2xhc3M9XCJlbXB0eS1zdGF0ZVwiPk5vIGVkdWNhdGlvbiBhZGRlZCB5ZXQuPC9wPic7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbGlzdC5pbm5lckhUTUwgPSBlZHVjYXRpb25cbiAgICAubWFwKFxuICAgICAgKGVkdSkgPT4gYFxuICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW1cIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tY29udGVudFwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtLXRpdGxlXCI+JHtlc2NhcGVIdG1sKGVkdS5kZWdyZWUpfSBpbiAke2VzY2FwZUh0bWwoZWR1LmZpZWxkKX08L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS1zdWJ0aXRsZVwiPiR7ZXNjYXBlSHRtbChlZHUuaW5zdGl0dXRpb24pfSAtICR7ZWR1LmdyYWR1YXRpb25ZZWFyfTwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtLWFjdGlvbnNcIj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tc2Vjb25kYXJ5XCIgb25jbGljaz1cImVkaXRFZHVjYXRpb24oJyR7ZWR1LmlkfScpXCI+RWRpdDwvYnV0dG9uPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1kYW5nZXJcIiBvbmNsaWNrPVwiZGVsZXRlRWR1Y2F0aW9uKCcke2VkdS5pZH0nKVwiPkRlbGV0ZTwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gIGBcbiAgICApXG4gICAgLmpvaW4oJycpO1xufVxuXG4vKipcbiAqIERpc3BsYXkgZXhwZXJpZW5jZSBsaXN0XG4gKi9cbmZ1bmN0aW9uIGRpc3BsYXlFeHBlcmllbmNlTGlzdChleHBlcmllbmNlKSB7XG4gIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZXhwZXJpZW5jZUxpc3QnKTtcblxuICBpZiAoZXhwZXJpZW5jZS5sZW5ndGggPT09IDApIHtcbiAgICBsaXN0LmlubmVySFRNTCA9ICc8cCBjbGFzcz1cImVtcHR5LXN0YXRlXCI+Tm8gZXhwZXJpZW5jZSBhZGRlZCB5ZXQuPC9wPic7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbGlzdC5pbm5lckhUTUwgPSBleHBlcmllbmNlXG4gICAgLm1hcChcbiAgICAgIChleHApID0+IGBcbiAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtLWNvbnRlbnRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS10aXRsZVwiPiR7ZXNjYXBlSHRtbChleHAudGl0bGUpfTwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtLXN1YnRpdGxlXCI+JHtlc2NhcGVIdG1sKGV4cC5jb21wYW55KX0gLSAke2V4cC5kdXJhdGlvbn08L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS1hY3Rpb25zXCI+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLXNlY29uZGFyeVwiIG9uY2xpY2s9XCJlZGl0RXhwZXJpZW5jZSgnJHtleHAuaWR9JylcIj5FZGl0PC9idXR0b24+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWRhbmdlclwiIG9uY2xpY2s9XCJkZWxldGVFeHBlcmllbmNlKCcke2V4cC5pZH0nKVwiPkRlbGV0ZTwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gIGBcbiAgICApXG4gICAgLmpvaW4oJycpO1xufVxuXG4vKipcbiAqIERpc3BsYXkgc2tpbGxzIGxpc3RcbiAqL1xuZnVuY3Rpb24gZGlzcGxheVNraWxsc0xpc3Qoc2tpbGxzKSB7XG4gIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2tpbGxzTGlzdCcpO1xuXG4gIGlmIChza2lsbHMubGVuZ3RoID09PSAwKSB7XG4gICAgbGlzdC5pbm5lckhUTUwgPSAnPHAgY2xhc3M9XCJlbXB0eS1zdGF0ZVwiPk5vIHNraWxscyBhZGRlZCB5ZXQuPC9wPic7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbGlzdC5pbm5lckhUTUwgPSBza2lsbHNcbiAgICAubWFwKFxuICAgICAgKHNraWxsKSA9PiBgXG4gICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbVwiPlxuICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS1jb250ZW50XCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tdGl0bGVcIj4ke2VzY2FwZUh0bWwoc2tpbGwubmFtZSl9PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tc3VidGl0bGVcIj4ke3NraWxsLmNhdGVnb3J5fSAtICR7c2tpbGwucHJvZmljaWVuY3l9PC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tYWN0aW9uc1wiPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1zZWNvbmRhcnlcIiBvbmNsaWNrPVwiZWRpdFNraWxsKCcke3NraWxsLmlkfScpXCI+RWRpdDwvYnV0dG9uPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1kYW5nZXJcIiBvbmNsaWNrPVwiZGVsZXRlU2tpbGwoJyR7c2tpbGwuaWR9JylcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICBgXG4gICAgKVxuICAgIC5qb2luKCcnKTtcbn1cblxuLyoqXG4gKiBEaXNwbGF5IHN0b3JpZXMgbGlzdFxuICovXG5mdW5jdGlvbiBkaXNwbGF5U3Rvcmllc0xpc3Qoc3Rvcmllcykge1xuICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0b3JpZXNMaXN0Jyk7XG5cbiAgaWYgKHN0b3JpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgbGlzdC5pbm5lckhUTUwgPSAnPHAgY2xhc3M9XCJlbXB0eS1zdGF0ZVwiPk5vIHN0b3JpZXMgYWRkZWQgeWV0LjwvcD4nO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxpc3QuaW5uZXJIVE1MID0gc3Rvcmllc1xuICAgIC5tYXAoXG4gICAgICAoc3RvcnkpID0+IGBcbiAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtLWNvbnRlbnRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS10aXRsZVwiPiR7ZXNjYXBlSHRtbChzdG9yeS50aXRsZSl9PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tc3VidGl0bGVcIj4ke3N0b3J5LnRhZ3Muam9pbignLCAnKX0gXHUyMDIyIFVzZWQgJHtzdG9yeS50aW1lc1VzZWR9IHRpbWVzPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tYWN0aW9uc1wiPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1zZWNvbmRhcnlcIiBvbmNsaWNrPVwiZWRpdFN0b3J5KCcke3N0b3J5LmlkfScpXCI+RWRpdDwvYnV0dG9uPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1kYW5nZXJcIiBvbmNsaWNrPVwiZGVsZXRlU3RvcnkoJyR7c3RvcnkuaWR9JylcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICBgXG4gICAgKVxuICAgIC5qb2luKCcnKTtcbn1cblxuLyoqXG4gKiBPcGVuIGVkdWNhdGlvbiBtb2RhbFxuICovXG5mdW5jdGlvbiBvcGVuRWR1Y2F0aW9uTW9kYWwoaWQgPSBudWxsKSB7XG4gIG1vZGFsLmNsYXNzTGlzdC5hZGQoJ3Nob3cnKTtcbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vZGFsVGl0bGUnKS50ZXh0Q29udGVudCA9IGlkID8gJ0VkaXQgRWR1Y2F0aW9uJyA6ICdBZGQgRWR1Y2F0aW9uJztcbiAgLy8gVE9ETzogTG9hZCBhbmQgZGlzcGxheSBlZHVjYXRpb24gZm9ybVxufVxuXG4vKipcbiAqIE9wZW4gZXhwZXJpZW5jZSBtb2RhbFxuICovXG5mdW5jdGlvbiBvcGVuRXhwZXJpZW5jZU1vZGFsKGlkID0gbnVsbCkge1xuICBtb2RhbC5jbGFzc0xpc3QuYWRkKCdzaG93Jyk7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RhbFRpdGxlJykudGV4dENvbnRlbnQgPSBpZCA/ICdFZGl0IEV4cGVyaWVuY2UnIDogJ0FkZCBFeHBlcmllbmNlJztcbiAgLy8gVE9ETzogTG9hZCBhbmQgZGlzcGxheSBleHBlcmllbmNlIGZvcm1cbn1cblxuLyoqXG4gKiBPcGVuIHNraWxsIG1vZGFsXG4gKi9cbmZ1bmN0aW9uIG9wZW5Ta2lsbE1vZGFsKGlkID0gbnVsbCkge1xuICBtb2RhbC5jbGFzc0xpc3QuYWRkKCdzaG93Jyk7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RhbFRpdGxlJykudGV4dENvbnRlbnQgPSBpZCA/ICdFZGl0IFNraWxsJyA6ICdBZGQgU2tpbGwnO1xuICAvLyBUT0RPOiBMb2FkIGFuZCBkaXNwbGF5IHNraWxsIGZvcm1cbn1cblxuLyoqXG4gKiBPcGVuIHN0b3J5IG1vZGFsXG4gKi9cbmZ1bmN0aW9uIG9wZW5TdG9yeU1vZGFsKGlkID0gbnVsbCkge1xuICBtb2RhbC5jbGFzc0xpc3QuYWRkKCdzaG93Jyk7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RhbFRpdGxlJykudGV4dENvbnRlbnQgPSBpZCA/ICdFZGl0IFN0b3J5JyA6ICdBZGQgU3RvcnknO1xuICAvLyBUT0RPOiBMb2FkIGFuZCBkaXNwbGF5IHN0b3J5IGZvcm1cbn1cblxuLyoqXG4gKiBFeHBvcnQgZGF0YVxuICovXG5hc3luYyBmdW5jdGlvbiBleHBvcnREYXRhKCkge1xuICB0cnkge1xuICAgIGNvbnN0IHByb2ZpbGUgPSAoYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyBhY3Rpb246ICdnZXRQcm9maWxlJyB9KSkuZGF0YTtcbiAgICBjb25zdCBzZXR0aW5ncyA9IChhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogJ2dldFNldHRpbmdzJyB9KSkuZGF0YTtcblxuICAgIGNvbnN0IGRhdGEgPSB7XG4gICAgICBwcm9maWxlLFxuICAgICAgc2V0dGluZ3MsXG4gICAgICBleHBvcnRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgfTtcblxuICAgIGNvbnN0IGRhdGFTdHIgPSBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKTtcbiAgICBjb25zdCBkYXRhQmxvYiA9IG5ldyBCbG9iKFtkYXRhU3RyXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChkYXRhQmxvYik7XG4gICAgY29uc3QgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICBsaW5rLmhyZWYgPSB1cmw7XG4gICAgbGluay5kb3dubG9hZCA9IGBmb3JtYXV0b2ZpbGwtYmFja3VwLSR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNwbGl0KCdUJylbMF19Lmpzb25gO1xuICAgIGxpbmsuY2xpY2soKTtcbiAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG5cbiAgICBzaG93VG9hc3QoJ0RhdGEgZXhwb3J0ZWQgc3VjY2Vzc2Z1bGx5IScsICdzdWNjZXNzJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZXhwb3J0aW5nIGRhdGE6JywgZXJyb3IpO1xuICAgIHNob3dUb2FzdCgnRXJyb3IgZXhwb3J0aW5nIGRhdGEnLCAnZXJyb3InKTtcbiAgfVxufVxuXG4vKipcbiAqIEltcG9ydCBkYXRhXG4gKi9cbmZ1bmN0aW9uIGltcG9ydERhdGEoKSB7XG4gIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcbiAgaW5wdXQudHlwZSA9ICdmaWxlJztcbiAgaW5wdXQuYWNjZXB0ID0gJy5qc29uJztcblxuICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBhc3luYyAoZSkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBmaWxlID0gZS50YXJnZXQuZmlsZXNbMF07XG4gICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgZmlsZS50ZXh0KCk7XG4gICAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZSh0ZXh0KTtcblxuICAgICAgLy8gVmFsaWRhdGUgYW5kIGltcG9ydFxuICAgICAgaWYgKGRhdGEucHJvZmlsZSAmJiBkYXRhLnNldHRpbmdzKSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICBhY3Rpb246ICdpbXBvcnREYXRhJyxcbiAgICAgICAgICBwYXlsb2FkOiBkYXRhLFxuICAgICAgICB9KTtcblxuICAgICAgICBzaG93VG9hc3QoJ0RhdGEgaW1wb3J0ZWQgc3VjY2Vzc2Z1bGx5IScsICdzdWNjZXNzJyk7XG4gICAgICAgIGxvYWRQcm9maWxlKCk7XG4gICAgICAgIGxvYWRTZXR0aW5ncygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2hvd1RvYXN0KCdJbnZhbGlkIGJhY2t1cCBmaWxlJywgJ2Vycm9yJyk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGltcG9ydGluZyBkYXRhOicsIGVycm9yKTtcbiAgICAgIHNob3dUb2FzdCgnRXJyb3IgaW1wb3J0aW5nIGRhdGEnLCAnZXJyb3InKTtcbiAgICB9XG4gIH0pO1xuXG4gIGlucHV0LmNsaWNrKCk7XG59XG5cbi8qKlxuICogQ2xlYXIgYWxsIGRhdGEgd2l0aCBjb25maXJtYXRpb25cbiAqL1xuZnVuY3Rpb24gY2xlYXJBbGxEYXRhKCkge1xuICBpZiAoY29uZmlybSgnQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSBhbGwgZGF0YT8gVGhpcyBjYW5ub3QgYmUgdW5kb25lLicpKSB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgYWN0aW9uOiAnY2xlYXJBbGxEYXRhJyxcbiAgICB9KTtcblxuICAgIHNob3dUb2FzdCgnQWxsIGRhdGEgY2xlYXJlZCEnLCAnc3VjY2VzcycpO1xuICAgIGxvYWRQcm9maWxlKCk7XG4gICAgbG9hZFNldHRpbmdzKCk7XG4gIH1cbn1cblxuLyoqXG4gKiBTaG93IHRvYXN0IG5vdGlmaWNhdGlvblxuICovXG5mdW5jdGlvbiBzaG93VG9hc3QobWVzc2FnZSwgdHlwZSA9ICdpbmZvJykge1xuICBjb25zb2xlLmxvZygnW3Nob3dUb2FzdF0gQ2FsbGVkIHdpdGg6JywgeyBtZXNzYWdlLCB0eXBlIH0pO1xuXG4gIGlmICghdG9hc3QpIHtcbiAgICBjb25zb2xlLmVycm9yKCdbc2hvd1RvYXN0XSBUb2FzdCBlbGVtZW50IG5vdCBmb3VuZCEnKTtcbiAgICBhbGVydChtZXNzYWdlKTsgLy8gXHU0RTM0XHU2NUY2XHU0RjdGXHU3NTI4IGFsZXJ0IFx1NEY1Q1x1NEUzQVx1NTQwRVx1NTkwN1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRvYXN0LnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgdG9hc3QuY2xhc3NOYW1lID0gYHRvYXN0IHNob3cgJHt0eXBlfWA7XG5cbiAgY29uc29sZS5sb2coJ1tzaG93VG9hc3RdIFRvYXN0IGNsYXNzTmFtZTonLCB0b2FzdC5jbGFzc05hbWUpO1xuICBjb25zb2xlLmxvZygnW3Nob3dUb2FzdF0gVG9hc3Qgc3R5bGU6Jywgd2luZG93LmdldENvbXB1dGVkU3R5bGUodG9hc3QpLmRpc3BsYXkpO1xuXG4gIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIHRvYXN0LmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3cnKTtcbiAgfSwgMzAwMCk7XG59XG5cbi8qKlxuICogRXNjYXBlIEhUTUwgdG8gcHJldmVudCBYU1NcbiAqL1xuZnVuY3Rpb24gZXNjYXBlSHRtbCh0ZXh0KSB7XG4gIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBkaXYudGV4dENvbnRlbnQgPSB0ZXh0O1xuICByZXR1cm4gZGl2LmlubmVySFRNTDtcbn1cblxuLy8gUGxhY2Vob2xkZXIgZnVuY3Rpb25zIGZvciBlZGl0L2RlbGV0ZSBvcGVyYXRpb25zXG5mdW5jdGlvbiBlZGl0RWR1Y2F0aW9uKGlkKSB7XG4gIGNvbnNvbGUubG9nKCdFZGl0IGVkdWNhdGlvbjonLCBpZCk7XG59XG5cbmZ1bmN0aW9uIGRlbGV0ZUVkdWNhdGlvbihpZCkge1xuICBjb25zb2xlLmxvZygnRGVsZXRlIGVkdWNhdGlvbjonLCBpZCk7XG59XG5cbmZ1bmN0aW9uIGVkaXRFeHBlcmllbmNlKGlkKSB7XG4gIGNvbnNvbGUubG9nKCdFZGl0IGV4cGVyaWVuY2U6JywgaWQpO1xufVxuXG5mdW5jdGlvbiBkZWxldGVFeHBlcmllbmNlKGlkKSB7XG4gIGNvbnNvbGUubG9nKCdEZWxldGUgZXhwZXJpZW5jZTonLCBpZCk7XG59XG5cbmZ1bmN0aW9uIGVkaXRTa2lsbChpZCkge1xuICBjb25zb2xlLmxvZygnRWRpdCBza2lsbDonLCBpZCk7XG59XG5cbmZ1bmN0aW9uIGRlbGV0ZVNraWxsKGlkKSB7XG4gIGNvbnNvbGUubG9nKCdEZWxldGUgc2tpbGw6JywgaWQpO1xufVxuXG5mdW5jdGlvbiBlZGl0U3RvcnkoaWQpIHtcbiAgY29uc29sZS5sb2coJ0VkaXQgc3Rvcnk6JywgaWQpO1xufVxuXG5mdW5jdGlvbiBkZWxldGVTdG9yeShpZCkge1xuICBjb25zb2xlLmxvZygnRGVsZXRlIHN0b3J5OicsIGlkKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFNQSxJQUFJO0FBQUosSUFBZTtBQUFmLElBQTBCO0FBQTFCLElBQW1DO0FBQW5DLElBQWdEO0FBQ2hELElBQUk7QUFBSixJQUFrQjtBQUFsQixJQUEyQjtBQUEzQixJQUF5QztBQUF6QyxJQUFvRDtBQUNw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
