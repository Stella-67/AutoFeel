// src/popup.js
var tabBtns;
var tabContents;
var settingsBtn;
var personalForm;
var llmForm;
var autoFillForm;
var styleForm;
var addEducationBtn;
var addExperienceBtn;
var addResearchBtn;
var addOtherBtn;
var addDocumentBtn;
var exportBtn;
var importBtn;
var clearBtn;
var modal;
var closeBtn;
var toast;
document.addEventListener("DOMContentLoaded", () => {
  tabBtns = document.querySelectorAll(".tab-btn");
  tabContents = document.querySelectorAll(".tab-content");
  settingsBtn = document.getElementById("settingsBtn");
  personalForm = document.getElementById("personalForm");
  llmForm = document.getElementById("llmForm");
  autoFillForm = document.getElementById("autoFillForm");
  styleForm = document.getElementById("styleForm");
  addEducationBtn = document.getElementById("addEducationBtn");
  addExperienceBtn = document.getElementById("addExperienceBtn");
  addResearchBtn = document.getElementById("addResearchBtn");
  addOtherBtn = document.getElementById("addOtherBtn");
  addDocumentBtn = document.getElementById("addDocumentBtn");
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
  personalForm.addEventListener("submit", savePersonalInfo);
  addEducationBtn.addEventListener("click", () => openEducationModal());
  addExperienceBtn.addEventListener("click", () => openExperienceModal());
  addResearchBtn.addEventListener("click", () => openResearchModal());
  addOtherBtn.addEventListener("click", () => openOtherModal());
  addDocumentBtn.addEventListener("click", uploadDocument);
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
      displayEducationList(profile.education || []);
      displayExperienceList(profile.experience || []);
      displayResearchList(profile.research || []);
      displayOtherList(profile.other || []);
      displayDocumentsList(profile.documents || []);
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
function displayResearchList(research) {
  const list = document.getElementById("researchList");
  if (research.length === 0) {
    list.innerHTML = '<p class="empty-state">No research added yet.</p>';
    return;
  }
  list.innerHTML = research.map(
    (item) => `
    <div class="list-item">
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(item.topic)}</div>
        <div class="list-item-subtitle">${escapeHtml(item.description.substring(0, 100))}${item.description.length > 100 ? "..." : ""}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary" onclick="editResearch('${item.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteResearch('${item.id}')">Delete</button>
      </div>
    </div>
  `
  ).join("");
}
function displayOtherList(other) {
  const list = document.getElementById("otherList");
  if (other.length === 0) {
    list.innerHTML = '<p class="empty-state">No items added yet.</p>';
    return;
  }
  list.innerHTML = other.map(
    (item) => `
    <div class="list-item">
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(item.topic)}</div>
        <div class="list-item-subtitle">${escapeHtml(item.description.substring(0, 100))}${item.description.length > 100 ? "..." : ""}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-secondary" onclick="editOther('${item.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteOther('${item.id}')">Delete</button>
      </div>
    </div>
  `
  ).join("");
}
function openEducationModal(id = null) {
  modal.classList.add("show");
  document.getElementById("modalTitle").textContent = id ? "Edit Education" : "Add Education";
  const modalForm = document.getElementById("modalForm");
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
      degree: document.getElementById("eduDegree").value,
      field: document.getElementById("eduField").value,
      institution: document.getElementById("eduInstitution").value,
      graduationYear: document.getElementById("eduYear").value,
      gpa: document.getElementById("eduGpa").value || null
    };
    const profile = (await chrome.runtime.sendMessage({ action: "getProfile" })).data;
    if (!profile.education)
      profile.education = [];
    if (id) {
      const index = profile.education.findIndex((e2) => e2.id === id);
      profile.education[index] = education;
    } else {
      profile.education.push(education);
    }
    await chrome.runtime.sendMessage({ action: "saveProfile", payload: profile });
    showToast("Education saved!", "success");
    displayEducationList(profile.education);
    modal.classList.remove("show");
  };
}
function openExperienceModal(id = null) {
  modal.classList.add("show");
  document.getElementById("modalTitle").textContent = id ? "Edit Experience" : "Add Experience";
  const modalForm = document.getElementById("modalForm");
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
      title: document.getElementById("expTitle").value,
      company: document.getElementById("expCompany").value,
      duration: document.getElementById("expDuration").value,
      description: document.getElementById("expDescription").value
    };
    const profile = (await chrome.runtime.sendMessage({ action: "getProfile" })).data;
    if (!profile.experience)
      profile.experience = [];
    if (id) {
      const index = profile.experience.findIndex((e2) => e2.id === id);
      profile.experience[index] = experience;
    } else {
      profile.experience.push(experience);
    }
    await chrome.runtime.sendMessage({ action: "saveProfile", payload: profile });
    showToast("Experience saved!", "success");
    displayExperienceList(profile.experience);
    modal.classList.remove("show");
  };
}
function openResearchModal(id = null) {
  modal.classList.add("show");
  document.getElementById("modalTitle").textContent = id ? "Edit Research" : "Add Research";
  const modalForm = document.getElementById("modalForm");
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
      topic: document.getElementById("researchTopic").value,
      description: document.getElementById("researchDescription").value
    };
    const profile = (await chrome.runtime.sendMessage({ action: "getProfile" })).data;
    if (!profile.research)
      profile.research = [];
    if (id) {
      const index = profile.research.findIndex((r) => r.id === id);
      profile.research[index] = research;
    } else {
      profile.research.push(research);
    }
    await chrome.runtime.sendMessage({ action: "saveProfile", payload: profile });
    showToast("Research saved!", "success");
    displayResearchList(profile.research);
    modal.classList.remove("show");
  };
}
function openOtherModal(id = null) {
  modal.classList.add("show");
  document.getElementById("modalTitle").textContent = id ? "Edit Item" : "Add Item";
  const modalForm = document.getElementById("modalForm");
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
      topic: document.getElementById("otherTopic").value,
      description: document.getElementById("otherDescription").value
    };
    const profile = (await chrome.runtime.sendMessage({ action: "getProfile" })).data;
    if (!profile.other)
      profile.other = [];
    if (id) {
      const index = profile.other.findIndex((o) => o.id === id);
      profile.other[index] = other;
    } else {
      profile.other.push(other);
    }
    await chrome.runtime.sendMessage({ action: "saveProfile", payload: profile });
    showToast("Item saved!", "success");
    displayOtherList(profile.other);
    modal.classList.remove("show");
  };
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
function uploadDocument() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".txt,.md,.pdf";
  input.addEventListener("change", async (e) => {
    try {
      const file = e.target.files[0];
      if (!file)
        return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target.result;
        const document2 = {
          id: Date.now().toString(),
          name: file.name,
          type: file.type || "text/plain",
          content,
          uploadedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        const profile = (await chrome.runtime.sendMessage({ action: "getProfile" })).data;
        if (!profile.documents)
          profile.documents = [];
        profile.documents.push(document2);
        await chrome.runtime.sendMessage({ action: "saveProfile", payload: profile });
        showToast("Document uploaded successfully!", "success");
        displayDocumentsList(profile.documents);
      };
      reader.readAsText(file);
    } catch (error) {
      console.error("Error uploading document:", error);
      showToast("Error uploading document", "error");
    }
  });
  input.click();
}
function displayDocumentsList(documents) {
  const list = document.getElementById("documentsList");
  if (documents.length === 0) {
    list.innerHTML = '<p class="empty-state">No documents uploaded yet.</p>';
    return;
  }
  list.innerHTML = documents.map(
    (doc) => `
    <div class="list-item">
      <div class="list-item-content">
        <div class="list-item-title">${escapeHtml(doc.name)}</div>
        <div class="list-item-subtitle">${new Date(doc.uploadedAt).toLocaleDateString()} \u2022 ${(doc.content.length / 1024).toFixed(1)}KB</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-danger" data-doc-id="${doc.id}">Delete</button>
      </div>
    </div>
  `
  ).join("");
  list.querySelectorAll(".btn-danger").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const docId = btn.getAttribute("data-doc-id");
      await deleteDocument(docId);
    });
  });
}
async function deleteDocument(id) {
  if (!confirm("Are you sure you want to delete this document?"))
    return;
  try {
    const profile = (await chrome.runtime.sendMessage({ action: "getProfile" })).data;
    profile.documents = (profile.documents || []).filter((d) => d.id !== id);
    await chrome.runtime.sendMessage({ action: "saveProfile", payload: profile });
    showToast("Document deleted!", "success");
    displayDocumentsList(profile.documents);
  } catch (error) {
    console.error("Error deleting document:", error);
    showToast("Error deleting document", "error");
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3BvcHVwLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcbiAqIFBvcHVwIFVJIExvZ2ljXG4gKiBIYW5kbGVzIHVzZXIgaW50ZXJhY3Rpb25zIGFuZCBwcm9maWxlIG1hbmFnZW1lbnQgaW4gdGhlIGV4dGVuc2lvbiBwb3B1cFxuICovXG5cbi8vIERPTSBFbGVtZW50cyAtIHdpbGwgYmUgaW5pdGlhbGl6ZWQgYWZ0ZXIgRE9NIGxvYWRzXG5sZXQgdGFiQnRucywgdGFiQ29udGVudHMsIHNldHRpbmdzQnRuO1xubGV0IHBlcnNvbmFsRm9ybSwgbGxtRm9ybSwgYXV0b0ZpbGxGb3JtLCBzdHlsZUZvcm07XG5sZXQgYWRkRWR1Y2F0aW9uQnRuLCBhZGRFeHBlcmllbmNlQnRuLCBhZGRSZXNlYXJjaEJ0biwgYWRkT3RoZXJCdG4sIGFkZERvY3VtZW50QnRuO1xubGV0IGV4cG9ydEJ0biwgaW1wb3J0QnRuLCBjbGVhckJ0bjtcbmxldCBtb2RhbCwgY2xvc2VCdG4sIHRvYXN0O1xuXG4vLyBJbml0aWFsaXplIHBvcHVwXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xuICAvLyBJbml0aWFsaXplIGFsbCBET00gZWxlbWVudHNcbiAgdGFiQnRucyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy50YWItYnRuJyk7XG4gIHRhYkNvbnRlbnRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnRhYi1jb250ZW50Jyk7XG4gIHNldHRpbmdzQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldHRpbmdzQnRuJyk7XG5cbiAgcGVyc29uYWxGb3JtID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3BlcnNvbmFsRm9ybScpO1xuICBsbG1Gb3JtID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xsbUZvcm0nKTtcbiAgYXV0b0ZpbGxGb3JtID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F1dG9GaWxsRm9ybScpO1xuICBzdHlsZUZvcm0gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3R5bGVGb3JtJyk7XG5cbiAgYWRkRWR1Y2F0aW9uQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZEVkdWNhdGlvbkJ0bicpO1xuICBhZGRFeHBlcmllbmNlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZEV4cGVyaWVuY2VCdG4nKTtcbiAgYWRkUmVzZWFyY2hCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkUmVzZWFyY2hCdG4nKTtcbiAgYWRkT3RoZXJCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkT3RoZXJCdG4nKTtcbiAgYWRkRG9jdW1lbnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkRG9jdW1lbnRCdG4nKTtcbiAgZXhwb3J0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2V4cG9ydEJ0bicpO1xuICBpbXBvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW1wb3J0QnRuJyk7XG4gIGNsZWFyQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NsZWFyQnRuJyk7XG5cbiAgbW9kYWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbW9kYWwnKTtcbiAgY2xvc2VCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY2xvc2UnKTtcbiAgdG9hc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9hc3QnKTtcblxuICBjb25zb2xlLmxvZygnW1BvcHVwXSBET00gZWxlbWVudHMgaW5pdGlhbGl6ZWQsIHRvYXN0OicsIHRvYXN0KTtcblxuICBpbml0aWFsaXplVGFicygpO1xuICBsb2FkUHJvZmlsZSgpO1xuICBsb2FkU2V0dGluZ3MoKTtcbiAgc2V0dXBFdmVudExpc3RlbmVycygpO1xufSk7XG5cbi8qKlxuICogVGFiIHN3aXRjaGluZyBsb2dpY1xuICovXG5mdW5jdGlvbiBpbml0aWFsaXplVGFicygpIHtcbiAgdGFiQnRucy5mb3JFYWNoKChidG4pID0+IHtcbiAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICBjb25zdCB0YWJOYW1lID0gYnRuLmdldEF0dHJpYnV0ZSgnZGF0YS10YWInKTtcbiAgICAgIHN3aXRjaFRhYih0YWJOYW1lKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHN3aXRjaFRhYih0YWJOYW1lKSB7XG4gIC8vIERlYWN0aXZhdGUgYWxsIHRhYnNcbiAgdGFiQnRucy5mb3JFYWNoKChidG4pID0+IGJ0bi5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKSk7XG4gIHRhYkNvbnRlbnRzLmZvckVhY2goKGNvbnRlbnQpID0+IGNvbnRlbnQuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJykpO1xuXG4gIC8vIEFjdGl2YXRlIHNlbGVjdGVkIHRhYlxuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS10YWI9XCIke3RhYk5hbWV9XCJdYCkuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGAke3RhYk5hbWV9LXRhYmApLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xufVxuXG4vKipcbiAqIFNldHVwIGFsbCBldmVudCBsaXN0ZW5lcnNcbiAqL1xuZnVuY3Rpb24gc2V0dXBFdmVudExpc3RlbmVycygpIHtcbiAgLy8gUHJvZmlsZSBmb3Jtc1xuICBwZXJzb25hbEZvcm0uYWRkRXZlbnRMaXN0ZW5lcignc3VibWl0Jywgc2F2ZVBlcnNvbmFsSW5mbyk7XG5cbiAgLy8gQWRkIGJ1dHRvbnNcbiAgYWRkRWR1Y2F0aW9uQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3BlbkVkdWNhdGlvbk1vZGFsKCkpO1xuICBhZGRFeHBlcmllbmNlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3BlbkV4cGVyaWVuY2VNb2RhbCgpKTtcbiAgYWRkUmVzZWFyY2hCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBvcGVuUmVzZWFyY2hNb2RhbCgpKTtcbiAgYWRkT3RoZXJCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBvcGVuT3RoZXJNb2RhbCgpKTtcbiAgYWRkRG9jdW1lbnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB1cGxvYWREb2N1bWVudCk7XG5cbiAgLy8gU2V0dGluZ3MgZm9ybXNcbiAgbGxtRm9ybS5hZGRFdmVudExpc3RlbmVyKCdzdWJtaXQnLCBzYXZlTExNU2V0dGluZ3MpO1xuICBhdXRvRmlsbEZvcm0uYWRkRXZlbnRMaXN0ZW5lcignc3VibWl0Jywgc2F2ZUF1dG9GaWxsU2V0dGluZ3MpO1xuICBzdHlsZUZvcm0uYWRkRXZlbnRMaXN0ZW5lcignc3VibWl0Jywgc2F2ZVN0eWxlU2V0dGluZ3MpO1xuXG4gIC8vIERhdGEgbWFuYWdlbWVudFxuICBleHBvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBleHBvcnREYXRhKTtcbiAgaW1wb3J0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaW1wb3J0RGF0YSk7XG4gIGNsZWFyQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY2xlYXJBbGxEYXRhKTtcblxuICAvLyBNb2RhbFxuICBjbG9zZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IG1vZGFsLmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3cnKSk7XG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChlKSA9PiB7XG4gICAgaWYgKGUudGFyZ2V0ID09PSBtb2RhbCkge1xuICAgICAgbW9kYWwuY2xhc3NMaXN0LnJlbW92ZSgnc2hvdycpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gU2V0dGluZ3MgYnV0dG9uXG4gIHNldHRpbmdzQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gc3dpdGNoVGFiKCdzZXR0aW5ncycpKTtcbn1cblxuLyoqXG4gKiBMb2FkIHByb2ZpbGUgZGF0YSBpbnRvIHRoZSBVSVxuICovXG5hc3luYyBmdW5jdGlvbiBsb2FkUHJvZmlsZSgpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIGFjdGlvbjogJ2dldFByb2ZpbGUnLFxuICAgIH0pO1xuXG4gICAgaWYgKHJlc3BvbnNlLnN1Y2Nlc3MgJiYgcmVzcG9uc2UuZGF0YSkge1xuICAgICAgY29uc3QgcHJvZmlsZSA9IHJlc3BvbnNlLmRhdGE7XG5cbiAgICAgIC8vIFBlcnNvbmFsIGluZm9cbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmdWxsTmFtZScpLnZhbHVlID0gcHJvZmlsZS5wZXJzb25hbD8uZnVsbE5hbWUgfHwgJyc7XG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZW1haWwnKS52YWx1ZSA9IHByb2ZpbGUucGVyc29uYWw/LmVtYWlsIHx8ICcnO1xuICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Bob25lJykudmFsdWUgPSBwcm9maWxlLnBlcnNvbmFsPy5waG9uZSB8fCAnJztcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2NhdGlvbicpLnZhbHVlID0gcHJvZmlsZS5wZXJzb25hbD8ubG9jYXRpb24gfHwgJyc7XG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3VtbWFyeScpLnZhbHVlID0gcHJvZmlsZS5wZXJzb25hbD8uc3VtbWFyeSB8fCAnJztcblxuICAgICAgLy8gRGlzcGxheSBlZHVjYXRpb24gaXRlbXNcbiAgICAgIGRpc3BsYXlFZHVjYXRpb25MaXN0KHByb2ZpbGUuZWR1Y2F0aW9uIHx8IFtdKTtcbiAgICAgIC8vIERpc3BsYXkgZXhwZXJpZW5jZSBpdGVtc1xuICAgICAgZGlzcGxheUV4cGVyaWVuY2VMaXN0KHByb2ZpbGUuZXhwZXJpZW5jZSB8fCBbXSk7XG4gICAgICAvLyBEaXNwbGF5IHJlc2VhcmNoIGl0ZW1zXG4gICAgICBkaXNwbGF5UmVzZWFyY2hMaXN0KHByb2ZpbGUucmVzZWFyY2ggfHwgW10pO1xuICAgICAgLy8gRGlzcGxheSBvdGhlciBpdGVtc1xuICAgICAgZGlzcGxheU90aGVyTGlzdChwcm9maWxlLm90aGVyIHx8IFtdKTtcbiAgICAgIC8vIERpc3BsYXkgZG9jdW1lbnRzXG4gICAgICBkaXNwbGF5RG9jdW1lbnRzTGlzdChwcm9maWxlLmRvY3VtZW50cyB8fCBbXSk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGxvYWRpbmcgcHJvZmlsZTonLCBlcnJvcik7XG4gIH1cbn1cblxuLyoqXG4gKiBMb2FkIHNldHRpbmdzIGludG8gdGhlIFVJXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGxvYWRTZXR0aW5ncygpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIGFjdGlvbjogJ2dldFNldHRpbmdzJyxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdWNjZXNzICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gcmVzcG9uc2UuZGF0YTtcblxuICAgICAgLy8gTExNIHNldHRpbmdzXG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGxtUHJvdmlkZXInKS52YWx1ZSA9IHNldHRpbmdzLmxsbT8ucHJvdmlkZXIgfHwgJ29wZW5haSc7XG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXBpS2V5JykudmFsdWUgPSBzZXR0aW5ncy5sbG0/LmFwaUtleSB8fCAnJztcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RlbCcpLnZhbHVlID0gc2V0dGluZ3MubGxtPy5tb2RlbCB8fCAnZ3B0LTQnO1xuXG4gICAgICAvLyBBdXRvLWZpbGwgc2V0dGluZ3NcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXF1aXJlQXBwcm92YWwnKS5jaGVja2VkID0gc2V0dGluZ3MuYXV0b0ZpbGw/LnJlcXVpcmVBcHByb3ZhbCB8fCB0cnVlO1xuICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F2b2lkUmVwZXRpdGlvbicpLmNoZWNrZWQgPSBzZXR0aW5ncy5hdXRvRmlsbD8uYXZvaWRSZXBldGl0aW9uIHx8IHRydWU7XG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbWluRGF5c0JldHdlZW5TdG9yaWVzJykudmFsdWUgPSBzZXR0aW5ncy5hdXRvRmlsbD8ubWluRGF5c0JldHdlZW5TdG9yaWVzIHx8IDc7XG5cbiAgICAgIC8vIFN0eWxlIHNldHRpbmdzXG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9uZScpLnZhbHVlID0gc2V0dGluZ3MuY3VzdG9tUHJvbXB0U3R5bGU/LnRvbmUgfHwgJ3Byb2Zlc3Npb25hbCc7XG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGVuZ3RoJykudmFsdWUgPSBzZXR0aW5ncy5jdXN0b21Qcm9tcHRTdHlsZT8ubGVuZ3RoIHx8ICdtZWRpdW0nO1xuICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2luY2x1ZGVNZXRyaWNzJykuY2hlY2tlZCA9IHNldHRpbmdzLmN1c3RvbVByb21wdFN0eWxlPy5pbmNsdWRlTWV0cmljcyB8fCB0cnVlO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBsb2FkaW5nIHNldHRpbmdzOicsIGVycm9yKTtcbiAgfVxufVxuXG4vKipcbiAqIFNhdmUgcGVyc29uYWwgaW5mb3JtYXRpb25cbiAqL1xuYXN5bmMgZnVuY3Rpb24gc2F2ZVBlcnNvbmFsSW5mbyhlKSB7XG4gIGUucHJldmVudERlZmF1bHQoKTtcblxuICBjb25zdCBwZXJzb25hbEluZm8gPSB7XG4gICAgZnVsbE5hbWU6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmdWxsTmFtZScpLnZhbHVlLFxuICAgIGVtYWlsOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZW1haWwnKS52YWx1ZSxcbiAgICBwaG9uZTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Bob25lJykudmFsdWUsXG4gICAgbG9jYXRpb246IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2NhdGlvbicpLnZhbHVlLFxuICAgIHN1bW1hcnk6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdW1tYXJ5JykudmFsdWUsXG4gIH07XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBwcm9maWxlID0gKFxuICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICBhY3Rpb246ICdnZXRQcm9maWxlJyxcbiAgICAgIH0pXG4gICAgKS5kYXRhO1xuXG4gICAgcHJvZmlsZS5wZXJzb25hbCA9IHBlcnNvbmFsSW5mbztcblxuICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIGFjdGlvbjogJ3NhdmVQcm9maWxlJyxcbiAgICAgIHBheWxvYWQ6IHByb2ZpbGUsXG4gICAgfSk7XG5cbiAgICBzaG93VG9hc3QoJ1BlcnNvbmFsIGluZm9ybWF0aW9uIHNhdmVkIScsICdzdWNjZXNzJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIHBlcnNvbmFsIGluZm86JywgZXJyb3IpO1xuICAgIHNob3dUb2FzdCgnRXJyb3Igc2F2aW5nIHBlcnNvbmFsIGluZm8nLCAnZXJyb3InKTtcbiAgfVxufVxuXG5cbi8qKlxuICogU2F2ZSBMTE0gc2V0dGluZ3NcbiAqL1xuYXN5bmMgZnVuY3Rpb24gc2F2ZUxMTVNldHRpbmdzKGUpIHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gIGNvbnNvbGUubG9nKCdbUG9wdXBdIHNhdmVMTE1TZXR0aW5ncyBjYWxsZWQnKTtcblxuICBjb25zdCBzZXR0aW5ncyA9IHtcbiAgICBwcm92aWRlcjogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xsbVByb3ZpZGVyJykudmFsdWUsXG4gICAgYXBpS2V5OiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXBpS2V5JykudmFsdWUsXG4gICAgbW9kZWw6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RlbCcpLnZhbHVlLFxuICB9O1xuXG4gIGNvbnNvbGUubG9nKCdbUG9wdXBdIFNldHRpbmdzOicsIHsgcHJvdmlkZXI6IHNldHRpbmdzLnByb3ZpZGVyLCBtb2RlbDogc2V0dGluZ3MubW9kZWwsIGhhc0FwaUtleTogISFzZXR0aW5ncy5hcGlLZXkgfSk7XG5cbiAgaWYgKCFzZXR0aW5ncy5hcGlLZXkpIHtcbiAgICBjb25zb2xlLmxvZygnW1BvcHVwXSBObyBBUEkga2V5IHByb3ZpZGVkJyk7XG4gICAgc2hvd1RvYXN0KCdQbGVhc2UgZW50ZXIgeW91ciBBUEkga2V5JywgJ2Vycm9yJyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZygnW1BvcHVwXSBTZW5kaW5nIG1lc3NhZ2UgdG8gYmFja2dyb3VuZC4uLicpO1xuICAgIC8vIFNhdmUgdmlhIGJhY2tncm91bmQgc2NyaXB0XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICBhY3Rpb246ICdzYXZlTExNU2V0dGluZ3MnLFxuICAgICAgcGF5bG9hZDogc2V0dGluZ3MsXG4gICAgfSk7XG5cbiAgICBjb25zb2xlLmxvZygnW1BvcHVwXSBSZXNwb25zZTonLCByZXNwb25zZSk7XG5cbiAgICAvLyBcdTUxNDhcdTVGM0FcdTUyMzZcdTY2M0VcdTc5M0FcdTYyMTBcdTUyOUZcdTZEODhcdTYwNkZcdThGREJcdTg4NENcdTZENEJcdThCRDVcbiAgICBzaG93VG9hc3QoJ0xMTSBzZXR0aW5ncyBzYXZlZCEnLCAnc3VjY2VzcycpO1xuXG4gICAgaWYgKCFyZXNwb25zZSB8fCAhcmVzcG9uc2Uuc3VjY2Vzcykge1xuICAgICAgY29uc29sZS53YXJuKCdbUG9wdXBdIFJlc3BvbnNlIHdhcyBub3Qgc3VjY2Vzc2Z1bDonLCByZXNwb25zZSk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ1tQb3B1cF0gRXJyb3Igc2F2aW5nIExMTSBzZXR0aW5nczonLCBlcnJvcik7XG4gICAgc2hvd1RvYXN0KCdFcnJvciBzYXZpbmcgTExNIHNldHRpbmdzOiAnICsgZXJyb3IubWVzc2FnZSwgJ2Vycm9yJyk7XG4gIH1cbn1cblxuLyoqXG4gKiBTYXZlIGF1dG8tZmlsbCBzZXR0aW5nc1xuICovXG5hc3luYyBmdW5jdGlvbiBzYXZlQXV0b0ZpbGxTZXR0aW5ncyhlKSB7XG4gIGUucHJldmVudERlZmF1bHQoKTtcblxuICBjb25zdCBzZXR0aW5ncyA9IHtcbiAgICByZXF1aXJlQXBwcm92YWw6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXF1aXJlQXBwcm92YWwnKS5jaGVja2VkLFxuICAgIGF2b2lkUmVwZXRpdGlvbjogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F2b2lkUmVwZXRpdGlvbicpLmNoZWNrZWQsXG4gICAgbWluRGF5c0JldHdlZW5TdG9yaWVzOiBwYXJzZUludChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbWluRGF5c0JldHdlZW5TdG9yaWVzJykudmFsdWUpLFxuICB9O1xuXG4gIHRyeSB7XG4gICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgYWN0aW9uOiAnc2F2ZUF1dG9GaWxsU2V0dGluZ3MnLFxuICAgICAgcGF5bG9hZDogc2V0dGluZ3MsXG4gICAgfSk7XG5cbiAgICBzaG93VG9hc3QoJ0F1dG8tZmlsbCBzZXR0aW5ncyBzYXZlZCEnLCAnc3VjY2VzcycpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHNhdmluZyBhdXRvLWZpbGwgc2V0dGluZ3M6JywgZXJyb3IpO1xuICAgIHNob3dUb2FzdCgnRXJyb3Igc2F2aW5nIHNldHRpbmdzJywgJ2Vycm9yJyk7XG4gIH1cbn1cblxuLyoqXG4gKiBTYXZlIHN0eWxlIHNldHRpbmdzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHNhdmVTdHlsZVNldHRpbmdzKGUpIHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gIGNvbnN0IHNldHRpbmdzID0ge1xuICAgIHRvbmU6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0b25lJykudmFsdWUsXG4gICAgbGVuZ3RoOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGVuZ3RoJykudmFsdWUsXG4gICAgaW5jbHVkZU1ldHJpY3M6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbmNsdWRlTWV0cmljcycpLmNoZWNrZWQsXG4gIH07XG5cbiAgdHJ5IHtcbiAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICBhY3Rpb246ICdzYXZlU3R5bGVTZXR0aW5ncycsXG4gICAgICBwYXlsb2FkOiBzZXR0aW5ncyxcbiAgICB9KTtcblxuICAgIHNob3dUb2FzdCgnU3R5bGUgc2V0dGluZ3Mgc2F2ZWQhJywgJ3N1Y2Nlc3MnKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBzYXZpbmcgc3R5bGUgc2V0dGluZ3M6JywgZXJyb3IpO1xuICAgIHNob3dUb2FzdCgnRXJyb3Igc2F2aW5nIHNldHRpbmdzJywgJ2Vycm9yJyk7XG4gIH1cbn1cblxuLyoqXG4gKiBEaXNwbGF5IGVkdWNhdGlvbiBsaXN0XG4gKi9cbmZ1bmN0aW9uIGRpc3BsYXlFZHVjYXRpb25MaXN0KGVkdWNhdGlvbikge1xuICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2VkdWNhdGlvbkxpc3QnKTtcblxuICBpZiAoZWR1Y2F0aW9uLmxlbmd0aCA9PT0gMCkge1xuICAgIGxpc3QuaW5uZXJIVE1MID0gJzxwIGNsYXNzPVwiZW1wdHktc3RhdGVcIj5ObyBlZHVjYXRpb24gYWRkZWQgeWV0LjwvcD4nO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxpc3QuaW5uZXJIVE1MID0gZWR1Y2F0aW9uXG4gICAgLm1hcChcbiAgICAgIChlZHUpID0+IGBcbiAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtLWNvbnRlbnRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS10aXRsZVwiPiR7ZXNjYXBlSHRtbChlZHUuZGVncmVlKX0gaW4gJHtlc2NhcGVIdG1sKGVkdS5maWVsZCl9PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tc3VidGl0bGVcIj4ke2VzY2FwZUh0bWwoZWR1Lmluc3RpdHV0aW9uKX0gLSAke2VkdS5ncmFkdWF0aW9uWWVhcn08L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS1hY3Rpb25zXCI+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLXNlY29uZGFyeVwiIG9uY2xpY2s9XCJlZGl0RWR1Y2F0aW9uKCcke2VkdS5pZH0nKVwiPkVkaXQ8L2J1dHRvbj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZGFuZ2VyXCIgb25jbGljaz1cImRlbGV0ZUVkdWNhdGlvbignJHtlZHUuaWR9JylcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICBgXG4gICAgKVxuICAgIC5qb2luKCcnKTtcbn1cblxuLyoqXG4gKiBEaXNwbGF5IGV4cGVyaWVuY2UgbGlzdFxuICovXG5mdW5jdGlvbiBkaXNwbGF5RXhwZXJpZW5jZUxpc3QoZXhwZXJpZW5jZSkge1xuICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2V4cGVyaWVuY2VMaXN0Jyk7XG5cbiAgaWYgKGV4cGVyaWVuY2UubGVuZ3RoID09PSAwKSB7XG4gICAgbGlzdC5pbm5lckhUTUwgPSAnPHAgY2xhc3M9XCJlbXB0eS1zdGF0ZVwiPk5vIGV4cGVyaWVuY2UgYWRkZWQgeWV0LjwvcD4nO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxpc3QuaW5uZXJIVE1MID0gZXhwZXJpZW5jZVxuICAgIC5tYXAoXG4gICAgICAoZXhwKSA9PiBgXG4gICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbVwiPlxuICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS1jb250ZW50XCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tdGl0bGVcIj4ke2VzY2FwZUh0bWwoZXhwLnRpdGxlKX08L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS1zdWJ0aXRsZVwiPiR7ZXNjYXBlSHRtbChleHAuY29tcGFueSl9IC0gJHtleHAuZHVyYXRpb259PC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tYWN0aW9uc1wiPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1zZWNvbmRhcnlcIiBvbmNsaWNrPVwiZWRpdEV4cGVyaWVuY2UoJyR7ZXhwLmlkfScpXCI+RWRpdDwvYnV0dG9uPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1kYW5nZXJcIiBvbmNsaWNrPVwiZGVsZXRlRXhwZXJpZW5jZSgnJHtleHAuaWR9JylcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICBgXG4gICAgKVxuICAgIC5qb2luKCcnKTtcbn1cblxuLyoqXG4gKiBEaXNwbGF5IHJlc2VhcmNoIGxpc3RcbiAqL1xuZnVuY3Rpb24gZGlzcGxheVJlc2VhcmNoTGlzdChyZXNlYXJjaCkge1xuICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jlc2VhcmNoTGlzdCcpO1xuXG4gIGlmIChyZXNlYXJjaC5sZW5ndGggPT09IDApIHtcbiAgICBsaXN0LmlubmVySFRNTCA9ICc8cCBjbGFzcz1cImVtcHR5LXN0YXRlXCI+Tm8gcmVzZWFyY2ggYWRkZWQgeWV0LjwvcD4nO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxpc3QuaW5uZXJIVE1MID0gcmVzZWFyY2hcbiAgICAubWFwKFxuICAgICAgKGl0ZW0pID0+IGBcbiAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtLWNvbnRlbnRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS10aXRsZVwiPiR7ZXNjYXBlSHRtbChpdGVtLnRvcGljKX08L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS1zdWJ0aXRsZVwiPiR7ZXNjYXBlSHRtbChpdGVtLmRlc2NyaXB0aW9uLnN1YnN0cmluZygwLCAxMDApKX0ke2l0ZW0uZGVzY3JpcHRpb24ubGVuZ3RoID4gMTAwID8gJy4uLicgOiAnJ308L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS1hY3Rpb25zXCI+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLXNlY29uZGFyeVwiIG9uY2xpY2s9XCJlZGl0UmVzZWFyY2goJyR7aXRlbS5pZH0nKVwiPkVkaXQ8L2J1dHRvbj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZGFuZ2VyXCIgb25jbGljaz1cImRlbGV0ZVJlc2VhcmNoKCcke2l0ZW0uaWR9JylcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICBgXG4gICAgKVxuICAgIC5qb2luKCcnKTtcbn1cblxuLyoqXG4gKiBEaXNwbGF5IG90aGVyIGxpc3RcbiAqL1xuZnVuY3Rpb24gZGlzcGxheU90aGVyTGlzdChvdGhlcikge1xuICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ290aGVyTGlzdCcpO1xuXG4gIGlmIChvdGhlci5sZW5ndGggPT09IDApIHtcbiAgICBsaXN0LmlubmVySFRNTCA9ICc8cCBjbGFzcz1cImVtcHR5LXN0YXRlXCI+Tm8gaXRlbXMgYWRkZWQgeWV0LjwvcD4nO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxpc3QuaW5uZXJIVE1MID0gb3RoZXJcbiAgICAubWFwKFxuICAgICAgKGl0ZW0pID0+IGBcbiAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtLWNvbnRlbnRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS10aXRsZVwiPiR7ZXNjYXBlSHRtbChpdGVtLnRvcGljKX08L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS1zdWJ0aXRsZVwiPiR7ZXNjYXBlSHRtbChpdGVtLmRlc2NyaXB0aW9uLnN1YnN0cmluZygwLCAxMDApKX0ke2l0ZW0uZGVzY3JpcHRpb24ubGVuZ3RoID4gMTAwID8gJy4uLicgOiAnJ308L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS1hY3Rpb25zXCI+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLXNlY29uZGFyeVwiIG9uY2xpY2s9XCJlZGl0T3RoZXIoJyR7aXRlbS5pZH0nKVwiPkVkaXQ8L2J1dHRvbj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tZGFuZ2VyXCIgb25jbGljaz1cImRlbGV0ZU90aGVyKCcke2l0ZW0uaWR9JylcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICBgXG4gICAgKVxuICAgIC5qb2luKCcnKTtcbn1cblxuLyoqXG4gKiBPcGVuIGVkdWNhdGlvbiBtb2RhbFxuICovXG5mdW5jdGlvbiBvcGVuRWR1Y2F0aW9uTW9kYWwoaWQgPSBudWxsKSB7XG4gIG1vZGFsLmNsYXNzTGlzdC5hZGQoJ3Nob3cnKTtcbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vZGFsVGl0bGUnKS50ZXh0Q29udGVudCA9IGlkID8gJ0VkaXQgRWR1Y2F0aW9uJyA6ICdBZGQgRWR1Y2F0aW9uJztcblxuICBjb25zdCBtb2RhbEZvcm0gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbW9kYWxGb3JtJyk7XG4gIG1vZGFsRm9ybS5pbm5lckhUTUwgPSBgXG4gICAgPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXBcIj5cbiAgICAgIDxsYWJlbD5EZWdyZWU8L2xhYmVsPlxuICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgaWQ9XCJlZHVEZWdyZWVcIiBwbGFjZWhvbGRlcj1cImUuZy4sIEJhY2hlbG9yIG9mIFNjaWVuY2VcIiByZXF1aXJlZD5cbiAgICA8L2Rpdj5cbiAgICA8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cFwiPlxuICAgICAgPGxhYmVsPkZpZWxkIG9mIFN0dWR5PC9sYWJlbD5cbiAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGlkPVwiZWR1RmllbGRcIiBwbGFjZWhvbGRlcj1cImUuZy4sIENvbXB1dGVyIFNjaWVuY2VcIiByZXF1aXJlZD5cbiAgICA8L2Rpdj5cbiAgICA8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cFwiPlxuICAgICAgPGxhYmVsPkluc3RpdHV0aW9uPC9sYWJlbD5cbiAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGlkPVwiZWR1SW5zdGl0dXRpb25cIiBwbGFjZWhvbGRlcj1cImUuZy4sIFN0YW5mb3JkIFVuaXZlcnNpdHlcIiByZXF1aXJlZD5cbiAgICA8L2Rpdj5cbiAgICA8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cFwiPlxuICAgICAgPGxhYmVsPkdyYWR1YXRpb24gWWVhcjwvbGFiZWw+XG4gICAgICA8aW5wdXQgdHlwZT1cIm51bWJlclwiIGlkPVwiZWR1WWVhclwiIHBsYWNlaG9sZGVyPVwiZS5nLiwgMjAyMFwiIHJlcXVpcmVkPlxuICAgIDwvZGl2PlxuICAgIDxkaXYgY2xhc3M9XCJmb3JtLWdyb3VwXCI+XG4gICAgICA8bGFiZWw+R1BBIChvcHRpb25hbCk8L2xhYmVsPlxuICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgaWQ9XCJlZHVHcGFcIiBwbGFjZWhvbGRlcj1cImUuZy4sIDMuOC80LjBcIj5cbiAgICA8L2Rpdj5cbiAgICA8YnV0dG9uIHR5cGU9XCJzdWJtaXRcIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiPlNhdmU8L2J1dHRvbj5cbiAgYDtcblxuICBtb2RhbEZvcm0ub25zdWJtaXQgPSBhc3luYyAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCBlZHVjYXRpb24gPSB7XG4gICAgICBpZDogaWQgfHwgRGF0ZS5ub3coKS50b1N0cmluZygpLFxuICAgICAgZGVncmVlOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZWR1RGVncmVlJykudmFsdWUsXG4gICAgICBmaWVsZDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2VkdUZpZWxkJykudmFsdWUsXG4gICAgICBpbnN0aXR1dGlvbjogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2VkdUluc3RpdHV0aW9uJykudmFsdWUsXG4gICAgICBncmFkdWF0aW9uWWVhcjogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2VkdVllYXInKS52YWx1ZSxcbiAgICAgIGdwYTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2VkdUdwYScpLnZhbHVlIHx8IG51bGxcbiAgICB9O1xuXG4gICAgY29uc3QgcHJvZmlsZSA9IChhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogJ2dldFByb2ZpbGUnIH0pKS5kYXRhO1xuICAgIGlmICghcHJvZmlsZS5lZHVjYXRpb24pIHByb2ZpbGUuZWR1Y2F0aW9uID0gW107XG5cbiAgICBpZiAoaWQpIHtcbiAgICAgIGNvbnN0IGluZGV4ID0gcHJvZmlsZS5lZHVjYXRpb24uZmluZEluZGV4KGUgPT4gZS5pZCA9PT0gaWQpO1xuICAgICAgcHJvZmlsZS5lZHVjYXRpb25baW5kZXhdID0gZWR1Y2F0aW9uO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcm9maWxlLmVkdWNhdGlvbi5wdXNoKGVkdWNhdGlvbik7XG4gICAgfVxuXG4gICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyBhY3Rpb246ICdzYXZlUHJvZmlsZScsIHBheWxvYWQ6IHByb2ZpbGUgfSk7XG4gICAgc2hvd1RvYXN0KCdFZHVjYXRpb24gc2F2ZWQhJywgJ3N1Y2Nlc3MnKTtcbiAgICBkaXNwbGF5RWR1Y2F0aW9uTGlzdChwcm9maWxlLmVkdWNhdGlvbik7XG4gICAgbW9kYWwuY2xhc3NMaXN0LnJlbW92ZSgnc2hvdycpO1xuICB9O1xufVxuXG4vKipcbiAqIE9wZW4gZXhwZXJpZW5jZSBtb2RhbFxuICovXG5mdW5jdGlvbiBvcGVuRXhwZXJpZW5jZU1vZGFsKGlkID0gbnVsbCkge1xuICBtb2RhbC5jbGFzc0xpc3QuYWRkKCdzaG93Jyk7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RhbFRpdGxlJykudGV4dENvbnRlbnQgPSBpZCA/ICdFZGl0IEV4cGVyaWVuY2UnIDogJ0FkZCBFeHBlcmllbmNlJztcblxuICBjb25zdCBtb2RhbEZvcm0gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbW9kYWxGb3JtJyk7XG4gIG1vZGFsRm9ybS5pbm5lckhUTUwgPSBgXG4gICAgPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXBcIj5cbiAgICAgIDxsYWJlbD5Kb2IgVGl0bGU8L2xhYmVsPlxuICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgaWQ9XCJleHBUaXRsZVwiIHBsYWNlaG9sZGVyPVwiZS5nLiwgU29mdHdhcmUgRW5naW5lZXJcIiByZXF1aXJlZD5cbiAgICA8L2Rpdj5cbiAgICA8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cFwiPlxuICAgICAgPGxhYmVsPkNvbXBhbnk8L2xhYmVsPlxuICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgaWQ9XCJleHBDb21wYW55XCIgcGxhY2Vob2xkZXI9XCJlLmcuLCBHb29nbGVcIiByZXF1aXJlZD5cbiAgICA8L2Rpdj5cbiAgICA8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cFwiPlxuICAgICAgPGxhYmVsPkR1cmF0aW9uPC9sYWJlbD5cbiAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGlkPVwiZXhwRHVyYXRpb25cIiBwbGFjZWhvbGRlcj1cImUuZy4sIEphbiAyMDIwIC0gRGVjIDIwMjJcIiByZXF1aXJlZD5cbiAgICA8L2Rpdj5cbiAgICA8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cFwiPlxuICAgICAgPGxhYmVsPkRlc2NyaXB0aW9uPC9sYWJlbD5cbiAgICAgIDx0ZXh0YXJlYSBpZD1cImV4cERlc2NyaXB0aW9uXCIgcGxhY2Vob2xkZXI9XCJCcmllZiBkZXNjcmlwdGlvbiBvZiB5b3VyIHJvbGUgYW5kIGFjaGlldmVtZW50cy4uLlwiIHJvd3M9XCI0XCI+PC90ZXh0YXJlYT5cbiAgICA8L2Rpdj5cbiAgICA8YnV0dG9uIHR5cGU9XCJzdWJtaXRcIiBjbGFzcz1cImJ0biBidG4tcHJpbWFyeVwiPlNhdmU8L2J1dHRvbj5cbiAgYDtcblxuICBtb2RhbEZvcm0ub25zdWJtaXQgPSBhc3luYyAoZSkgPT4ge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCBleHBlcmllbmNlID0ge1xuICAgICAgaWQ6IGlkIHx8IERhdGUubm93KCkudG9TdHJpbmcoKSxcbiAgICAgIHRpdGxlOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZXhwVGl0bGUnKS52YWx1ZSxcbiAgICAgIGNvbXBhbnk6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdleHBDb21wYW55JykudmFsdWUsXG4gICAgICBkdXJhdGlvbjogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2V4cER1cmF0aW9uJykudmFsdWUsXG4gICAgICBkZXNjcmlwdGlvbjogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2V4cERlc2NyaXB0aW9uJykudmFsdWVcbiAgICB9O1xuXG4gICAgY29uc3QgcHJvZmlsZSA9IChhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogJ2dldFByb2ZpbGUnIH0pKS5kYXRhO1xuICAgIGlmICghcHJvZmlsZS5leHBlcmllbmNlKSBwcm9maWxlLmV4cGVyaWVuY2UgPSBbXTtcblxuICAgIGlmIChpZCkge1xuICAgICAgY29uc3QgaW5kZXggPSBwcm9maWxlLmV4cGVyaWVuY2UuZmluZEluZGV4KGUgPT4gZS5pZCA9PT0gaWQpO1xuICAgICAgcHJvZmlsZS5leHBlcmllbmNlW2luZGV4XSA9IGV4cGVyaWVuY2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2ZpbGUuZXhwZXJpZW5jZS5wdXNoKGV4cGVyaWVuY2UpO1xuICAgIH1cblxuICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgYWN0aW9uOiAnc2F2ZVByb2ZpbGUnLCBwYXlsb2FkOiBwcm9maWxlIH0pO1xuICAgIHNob3dUb2FzdCgnRXhwZXJpZW5jZSBzYXZlZCEnLCAnc3VjY2VzcycpO1xuICAgIGRpc3BsYXlFeHBlcmllbmNlTGlzdChwcm9maWxlLmV4cGVyaWVuY2UpO1xuICAgIG1vZGFsLmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3cnKTtcbiAgfTtcbn1cblxuLyoqXG4gKiBPcGVuIHJlc2VhcmNoIG1vZGFsXG4gKi9cbmZ1bmN0aW9uIG9wZW5SZXNlYXJjaE1vZGFsKGlkID0gbnVsbCkge1xuICBtb2RhbC5jbGFzc0xpc3QuYWRkKCdzaG93Jyk7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RhbFRpdGxlJykudGV4dENvbnRlbnQgPSBpZCA/ICdFZGl0IFJlc2VhcmNoJyA6ICdBZGQgUmVzZWFyY2gnO1xuXG4gIGNvbnN0IG1vZGFsRm9ybSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RhbEZvcm0nKTtcbiAgbW9kYWxGb3JtLmlubmVySFRNTCA9IGBcbiAgICA8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cFwiPlxuICAgICAgPGxhYmVsPlJlc2VhcmNoIFRvcGljPC9sYWJlbD5cbiAgICAgIDxpbnB1dCB0eXBlPVwidGV4dFwiIGlkPVwicmVzZWFyY2hUb3BpY1wiIHBsYWNlaG9sZGVyPVwiZS5nLiwgTWFjaGluZSBMZWFybmluZyBmb3IgSGVhbHRoY2FyZVwiIHJlcXVpcmVkPlxuICAgIDwvZGl2PlxuICAgIDxkaXYgY2xhc3M9XCJmb3JtLWdyb3VwXCI+XG4gICAgICA8bGFiZWw+RGVzY3JpcHRpb248L2xhYmVsPlxuICAgICAgPHRleHRhcmVhIGlkPVwicmVzZWFyY2hEZXNjcmlwdGlvblwiIHBsYWNlaG9sZGVyPVwiRGVzY3JpYmUgeW91ciByZXNlYXJjaCwgbWV0aG9kb2xvZ3ksIGZpbmRpbmdzLCBldGMuLi5cIiByb3dzPVwiOFwiIHJlcXVpcmVkPjwvdGV4dGFyZWE+XG4gICAgPC9kaXY+XG4gICAgPGJ1dHRvbiB0eXBlPVwic3VibWl0XCIgY2xhc3M9XCJidG4gYnRuLXByaW1hcnlcIj5TYXZlPC9idXR0b24+XG4gIGA7XG5cbiAgbW9kYWxGb3JtLm9uc3VibWl0ID0gYXN5bmMgKGUpID0+IHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgcmVzZWFyY2ggPSB7XG4gICAgICBpZDogaWQgfHwgRGF0ZS5ub3coKS50b1N0cmluZygpLFxuICAgICAgdG9waWM6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXNlYXJjaFRvcGljJykudmFsdWUsXG4gICAgICBkZXNjcmlwdGlvbjogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jlc2VhcmNoRGVzY3JpcHRpb24nKS52YWx1ZVxuICAgIH07XG5cbiAgICBjb25zdCBwcm9maWxlID0gKGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgYWN0aW9uOiAnZ2V0UHJvZmlsZScgfSkpLmRhdGE7XG4gICAgaWYgKCFwcm9maWxlLnJlc2VhcmNoKSBwcm9maWxlLnJlc2VhcmNoID0gW107XG5cbiAgICBpZiAoaWQpIHtcbiAgICAgIGNvbnN0IGluZGV4ID0gcHJvZmlsZS5yZXNlYXJjaC5maW5kSW5kZXgociA9PiByLmlkID09PSBpZCk7XG4gICAgICBwcm9maWxlLnJlc2VhcmNoW2luZGV4XSA9IHJlc2VhcmNoO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcm9maWxlLnJlc2VhcmNoLnB1c2gocmVzZWFyY2gpO1xuICAgIH1cblxuICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgYWN0aW9uOiAnc2F2ZVByb2ZpbGUnLCBwYXlsb2FkOiBwcm9maWxlIH0pO1xuICAgIHNob3dUb2FzdCgnUmVzZWFyY2ggc2F2ZWQhJywgJ3N1Y2Nlc3MnKTtcbiAgICBkaXNwbGF5UmVzZWFyY2hMaXN0KHByb2ZpbGUucmVzZWFyY2gpO1xuICAgIG1vZGFsLmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3cnKTtcbiAgfTtcbn1cblxuLyoqXG4gKiBPcGVuIG90aGVyIG1vZGFsXG4gKi9cbmZ1bmN0aW9uIG9wZW5PdGhlck1vZGFsKGlkID0gbnVsbCkge1xuICBtb2RhbC5jbGFzc0xpc3QuYWRkKCdzaG93Jyk7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RhbFRpdGxlJykudGV4dENvbnRlbnQgPSBpZCA/ICdFZGl0IEl0ZW0nIDogJ0FkZCBJdGVtJztcblxuICBjb25zdCBtb2RhbEZvcm0gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbW9kYWxGb3JtJyk7XG4gIG1vZGFsRm9ybS5pbm5lckhUTUwgPSBgXG4gICAgPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXBcIj5cbiAgICAgIDxsYWJlbD5Ub3BpYzwvbGFiZWw+XG4gICAgICA8aW5wdXQgdHlwZT1cInRleHRcIiBpZD1cIm90aGVyVG9waWNcIiBwbGFjZWhvbGRlcj1cImUuZy4sIEJlc3QgUGFwZXIgQXdhcmQsIEFXUyBDZXJ0aWZpY2F0aW9uLCBQZXJzb25hbCBQcm9qZWN0Li4uXCIgcmVxdWlyZWQ+XG4gICAgPC9kaXY+XG4gICAgPGRpdiBjbGFzcz1cImZvcm0tZ3JvdXBcIj5cbiAgICAgIDxsYWJlbD5EZXNjcmlwdGlvbjwvbGFiZWw+XG4gICAgICA8dGV4dGFyZWEgaWQ9XCJvdGhlckRlc2NyaXB0aW9uXCIgcGxhY2Vob2xkZXI9XCJQcm92aWRlIGRldGFpbHMgYWJvdXQgdGhpcyBpdGVtLi4uXCIgcm93cz1cIjZcIiByZXF1aXJlZD48L3RleHRhcmVhPlxuICAgIDwvZGl2PlxuICAgIDxidXR0b24gdHlwZT1cInN1Ym1pdFwiIGNsYXNzPVwiYnRuIGJ0bi1wcmltYXJ5XCI+U2F2ZTwvYnV0dG9uPlxuICBgO1xuXG4gIG1vZGFsRm9ybS5vbnN1Ym1pdCA9IGFzeW5jIChlKSA9PiB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IG90aGVyID0ge1xuICAgICAgaWQ6IGlkIHx8IERhdGUubm93KCkudG9TdHJpbmcoKSxcbiAgICAgIHRvcGljOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnb3RoZXJUb3BpYycpLnZhbHVlLFxuICAgICAgZGVzY3JpcHRpb246IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvdGhlckRlc2NyaXB0aW9uJykudmFsdWVcbiAgICB9O1xuXG4gICAgY29uc3QgcHJvZmlsZSA9IChhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogJ2dldFByb2ZpbGUnIH0pKS5kYXRhO1xuICAgIGlmICghcHJvZmlsZS5vdGhlcikgcHJvZmlsZS5vdGhlciA9IFtdO1xuXG4gICAgaWYgKGlkKSB7XG4gICAgICBjb25zdCBpbmRleCA9IHByb2ZpbGUub3RoZXIuZmluZEluZGV4KG8gPT4gby5pZCA9PT0gaWQpO1xuICAgICAgcHJvZmlsZS5vdGhlcltpbmRleF0gPSBvdGhlcjtcbiAgICB9IGVsc2Uge1xuICAgICAgcHJvZmlsZS5vdGhlci5wdXNoKG90aGVyKTtcbiAgICB9XG5cbiAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogJ3NhdmVQcm9maWxlJywgcGF5bG9hZDogcHJvZmlsZSB9KTtcbiAgICBzaG93VG9hc3QoJ0l0ZW0gc2F2ZWQhJywgJ3N1Y2Nlc3MnKTtcbiAgICBkaXNwbGF5T3RoZXJMaXN0KHByb2ZpbGUub3RoZXIpO1xuICAgIG1vZGFsLmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3cnKTtcbiAgfTtcbn1cblxuLyoqXG4gKiBFeHBvcnQgZGF0YVxuICovXG5hc3luYyBmdW5jdGlvbiBleHBvcnREYXRhKCkge1xuICB0cnkge1xuICAgIGNvbnN0IHByb2ZpbGUgPSAoYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyBhY3Rpb246ICdnZXRQcm9maWxlJyB9KSkuZGF0YTtcbiAgICBjb25zdCBzZXR0aW5ncyA9IChhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogJ2dldFNldHRpbmdzJyB9KSkuZGF0YTtcblxuICAgIGNvbnN0IGRhdGEgPSB7XG4gICAgICBwcm9maWxlLFxuICAgICAgc2V0dGluZ3MsXG4gICAgICBleHBvcnRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgfTtcblxuICAgIGNvbnN0IGRhdGFTdHIgPSBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKTtcbiAgICBjb25zdCBkYXRhQmxvYiA9IG5ldyBCbG9iKFtkYXRhU3RyXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChkYXRhQmxvYik7XG4gICAgY29uc3QgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICBsaW5rLmhyZWYgPSB1cmw7XG4gICAgbGluay5kb3dubG9hZCA9IGBmb3JtYXV0b2ZpbGwtYmFja3VwLSR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNwbGl0KCdUJylbMF19Lmpzb25gO1xuICAgIGxpbmsuY2xpY2soKTtcbiAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG5cbiAgICBzaG93VG9hc3QoJ0RhdGEgZXhwb3J0ZWQgc3VjY2Vzc2Z1bGx5IScsICdzdWNjZXNzJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZXhwb3J0aW5nIGRhdGE6JywgZXJyb3IpO1xuICAgIHNob3dUb2FzdCgnRXJyb3IgZXhwb3J0aW5nIGRhdGEnLCAnZXJyb3InKTtcbiAgfVxufVxuXG4vKipcbiAqIEltcG9ydCBkYXRhXG4gKi9cbmZ1bmN0aW9uIGltcG9ydERhdGEoKSB7XG4gIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcbiAgaW5wdXQudHlwZSA9ICdmaWxlJztcbiAgaW5wdXQuYWNjZXB0ID0gJy5qc29uJztcblxuICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBhc3luYyAoZSkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBmaWxlID0gZS50YXJnZXQuZmlsZXNbMF07XG4gICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgZmlsZS50ZXh0KCk7XG4gICAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZSh0ZXh0KTtcblxuICAgICAgLy8gVmFsaWRhdGUgYW5kIGltcG9ydFxuICAgICAgaWYgKGRhdGEucHJvZmlsZSAmJiBkYXRhLnNldHRpbmdzKSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICBhY3Rpb246ICdpbXBvcnREYXRhJyxcbiAgICAgICAgICBwYXlsb2FkOiBkYXRhLFxuICAgICAgICB9KTtcblxuICAgICAgICBzaG93VG9hc3QoJ0RhdGEgaW1wb3J0ZWQgc3VjY2Vzc2Z1bGx5IScsICdzdWNjZXNzJyk7XG4gICAgICAgIGxvYWRQcm9maWxlKCk7XG4gICAgICAgIGxvYWRTZXR0aW5ncygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2hvd1RvYXN0KCdJbnZhbGlkIGJhY2t1cCBmaWxlJywgJ2Vycm9yJyk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGltcG9ydGluZyBkYXRhOicsIGVycm9yKTtcbiAgICAgIHNob3dUb2FzdCgnRXJyb3IgaW1wb3J0aW5nIGRhdGEnLCAnZXJyb3InKTtcbiAgICB9XG4gIH0pO1xuXG4gIGlucHV0LmNsaWNrKCk7XG59XG5cbi8qKlxuICogQ2xlYXIgYWxsIGRhdGEgd2l0aCBjb25maXJtYXRpb25cbiAqL1xuZnVuY3Rpb24gY2xlYXJBbGxEYXRhKCkge1xuICBpZiAoY29uZmlybSgnQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSBhbGwgZGF0YT8gVGhpcyBjYW5ub3QgYmUgdW5kb25lLicpKSB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgYWN0aW9uOiAnY2xlYXJBbGxEYXRhJyxcbiAgICB9KTtcblxuICAgIHNob3dUb2FzdCgnQWxsIGRhdGEgY2xlYXJlZCEnLCAnc3VjY2VzcycpO1xuICAgIGxvYWRQcm9maWxlKCk7XG4gICAgbG9hZFNldHRpbmdzKCk7XG4gIH1cbn1cblxuLyoqXG4gKiBTaG93IHRvYXN0IG5vdGlmaWNhdGlvblxuICovXG5mdW5jdGlvbiBzaG93VG9hc3QobWVzc2FnZSwgdHlwZSA9ICdpbmZvJykge1xuICBjb25zb2xlLmxvZygnW3Nob3dUb2FzdF0gQ2FsbGVkIHdpdGg6JywgeyBtZXNzYWdlLCB0eXBlIH0pO1xuXG4gIGlmICghdG9hc3QpIHtcbiAgICBjb25zb2xlLmVycm9yKCdbc2hvd1RvYXN0XSBUb2FzdCBlbGVtZW50IG5vdCBmb3VuZCEnKTtcbiAgICBhbGVydChtZXNzYWdlKTsgLy8gXHU0RTM0XHU2NUY2XHU0RjdGXHU3NTI4IGFsZXJ0IFx1NEY1Q1x1NEUzQVx1NTQwRVx1NTkwN1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRvYXN0LnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgdG9hc3QuY2xhc3NOYW1lID0gYHRvYXN0IHNob3cgJHt0eXBlfWA7XG5cbiAgY29uc29sZS5sb2coJ1tzaG93VG9hc3RdIFRvYXN0IGNsYXNzTmFtZTonLCB0b2FzdC5jbGFzc05hbWUpO1xuICBjb25zb2xlLmxvZygnW3Nob3dUb2FzdF0gVG9hc3Qgc3R5bGU6Jywgd2luZG93LmdldENvbXB1dGVkU3R5bGUodG9hc3QpLmRpc3BsYXkpO1xuXG4gIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIHRvYXN0LmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3cnKTtcbiAgfSwgMzAwMCk7XG59XG5cbi8qKlxuICogRXNjYXBlIEhUTUwgdG8gcHJldmVudCBYU1NcbiAqL1xuZnVuY3Rpb24gZXNjYXBlSHRtbCh0ZXh0KSB7XG4gIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBkaXYudGV4dENvbnRlbnQgPSB0ZXh0O1xuICByZXR1cm4gZGl2LmlubmVySFRNTDtcbn1cblxuLy8gUGxhY2Vob2xkZXIgZnVuY3Rpb25zIGZvciBlZGl0L2RlbGV0ZSBvcGVyYXRpb25zXG5mdW5jdGlvbiBlZGl0RWR1Y2F0aW9uKGlkKSB7XG4gIGNvbnNvbGUubG9nKCdFZGl0IGVkdWNhdGlvbjonLCBpZCk7XG59XG5cbmZ1bmN0aW9uIGRlbGV0ZUVkdWNhdGlvbihpZCkge1xuICBjb25zb2xlLmxvZygnRGVsZXRlIGVkdWNhdGlvbjonLCBpZCk7XG59XG5cbmZ1bmN0aW9uIGVkaXRFeHBlcmllbmNlKGlkKSB7XG4gIGNvbnNvbGUubG9nKCdFZGl0IGV4cGVyaWVuY2U6JywgaWQpO1xufVxuXG5mdW5jdGlvbiBkZWxldGVFeHBlcmllbmNlKGlkKSB7XG4gIGNvbnNvbGUubG9nKCdEZWxldGUgZXhwZXJpZW5jZTonLCBpZCk7XG59XG5cbmZ1bmN0aW9uIGVkaXRSZXNlYXJjaChpZCkge1xuICBjb25zb2xlLmxvZygnRWRpdCByZXNlYXJjaDonLCBpZCk7XG59XG5cbmZ1bmN0aW9uIGRlbGV0ZVJlc2VhcmNoKGlkKSB7XG4gIGNvbnNvbGUubG9nKCdEZWxldGUgcmVzZWFyY2g6JywgaWQpO1xufVxuXG5mdW5jdGlvbiBlZGl0T3RoZXIoaWQpIHtcbiAgY29uc29sZS5sb2coJ0VkaXQgb3RoZXI6JywgaWQpO1xufVxuXG5mdW5jdGlvbiBkZWxldGVPdGhlcihpZCkge1xuICBjb25zb2xlLmxvZygnRGVsZXRlIG90aGVyOicsIGlkKTtcbn1cblxuLyoqXG4gKiBVcGxvYWQgZG9jdW1lbnRcbiAqL1xuZnVuY3Rpb24gdXBsb2FkRG9jdW1lbnQoKSB7XG4gIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcbiAgaW5wdXQudHlwZSA9ICdmaWxlJztcbiAgaW5wdXQuYWNjZXB0ID0gJy50eHQsLm1kLC5wZGYnO1xuXG4gIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIGFzeW5jIChlKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZpbGUgPSBlLnRhcmdldC5maWxlc1swXTtcbiAgICAgIGlmICghZmlsZSkgcmV0dXJuO1xuXG4gICAgICBjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICAgICAgcmVhZGVyLm9ubG9hZCA9IGFzeW5jIChldmVudCkgPT4ge1xuICAgICAgICBjb25zdCBjb250ZW50ID0gZXZlbnQudGFyZ2V0LnJlc3VsdDtcblxuICAgICAgICBjb25zdCBkb2N1bWVudCA9IHtcbiAgICAgICAgICBpZDogRGF0ZS5ub3coKS50b1N0cmluZygpLFxuICAgICAgICAgIG5hbWU6IGZpbGUubmFtZSxcbiAgICAgICAgICB0eXBlOiBmaWxlLnR5cGUgfHwgJ3RleHQvcGxhaW4nLFxuICAgICAgICAgIGNvbnRlbnQ6IGNvbnRlbnQsXG4gICAgICAgICAgdXBsb2FkZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgcHJvZmlsZSA9IChhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogJ2dldFByb2ZpbGUnIH0pKS5kYXRhO1xuICAgICAgICBpZiAoIXByb2ZpbGUuZG9jdW1lbnRzKSBwcm9maWxlLmRvY3VtZW50cyA9IFtdO1xuICAgICAgICBwcm9maWxlLmRvY3VtZW50cy5wdXNoKGRvY3VtZW50KTtcblxuICAgICAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogJ3NhdmVQcm9maWxlJywgcGF5bG9hZDogcHJvZmlsZSB9KTtcbiAgICAgICAgc2hvd1RvYXN0KCdEb2N1bWVudCB1cGxvYWRlZCBzdWNjZXNzZnVsbHkhJywgJ3N1Y2Nlc3MnKTtcbiAgICAgICAgZGlzcGxheURvY3VtZW50c0xpc3QocHJvZmlsZS5kb2N1bWVudHMpO1xuICAgICAgfTtcblxuICAgICAgcmVhZGVyLnJlYWRBc1RleHQoZmlsZSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHVwbG9hZGluZyBkb2N1bWVudDonLCBlcnJvcik7XG4gICAgICBzaG93VG9hc3QoJ0Vycm9yIHVwbG9hZGluZyBkb2N1bWVudCcsICdlcnJvcicpO1xuICAgIH1cbiAgfSk7XG5cbiAgaW5wdXQuY2xpY2soKTtcbn1cblxuLyoqXG4gKiBEaXNwbGF5IGRvY3VtZW50cyBsaXN0XG4gKi9cbmZ1bmN0aW9uIGRpc3BsYXlEb2N1bWVudHNMaXN0KGRvY3VtZW50cykge1xuICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RvY3VtZW50c0xpc3QnKTtcblxuICBpZiAoZG9jdW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIGxpc3QuaW5uZXJIVE1MID0gJzxwIGNsYXNzPVwiZW1wdHktc3RhdGVcIj5ObyBkb2N1bWVudHMgdXBsb2FkZWQgeWV0LjwvcD4nO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxpc3QuaW5uZXJIVE1MID0gZG9jdW1lbnRzXG4gICAgLm1hcChcbiAgICAgIChkb2MpID0+IGBcbiAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtLWNvbnRlbnRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS10aXRsZVwiPiR7ZXNjYXBlSHRtbChkb2MubmFtZSl9PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tc3VidGl0bGVcIj4ke25ldyBEYXRlKGRvYy51cGxvYWRlZEF0KS50b0xvY2FsZURhdGVTdHJpbmcoKX0gXHUyMDIyICR7KGRvYy5jb250ZW50Lmxlbmd0aCAvIDEwMjQpLnRvRml4ZWQoMSl9S0I8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS1hY3Rpb25zXCI+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWRhbmdlclwiIGRhdGEtZG9jLWlkPVwiJHtkb2MuaWR9XCI+RGVsZXRlPC9idXR0b24+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgYFxuICAgIClcbiAgICAuam9pbignJyk7XG5cbiAgLy8gQWRkIGV2ZW50IGxpc3RlbmVycyB0byBkZWxldGUgYnV0dG9uc1xuICBsaXN0LnF1ZXJ5U2VsZWN0b3JBbGwoJy5idG4tZGFuZ2VyJykuZm9yRWFjaChidG4gPT4ge1xuICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGRvY0lkID0gYnRuLmdldEF0dHJpYnV0ZSgnZGF0YS1kb2MtaWQnKTtcbiAgICAgIGF3YWl0IGRlbGV0ZURvY3VtZW50KGRvY0lkKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbi8qKlxuICogRGVsZXRlIGRvY3VtZW50XG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGRlbGV0ZURvY3VtZW50KGlkKSB7XG4gIGlmICghY29uZmlybSgnQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSB0aGlzIGRvY3VtZW50PycpKSByZXR1cm47XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBwcm9maWxlID0gKGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgYWN0aW9uOiAnZ2V0UHJvZmlsZScgfSkpLmRhdGE7XG4gICAgcHJvZmlsZS5kb2N1bWVudHMgPSAocHJvZmlsZS5kb2N1bWVudHMgfHwgW10pLmZpbHRlcihkID0+IGQuaWQgIT09IGlkKTtcblxuICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHsgYWN0aW9uOiAnc2F2ZVByb2ZpbGUnLCBwYXlsb2FkOiBwcm9maWxlIH0pO1xuICAgIHNob3dUb2FzdCgnRG9jdW1lbnQgZGVsZXRlZCEnLCAnc3VjY2VzcycpO1xuICAgIGRpc3BsYXlEb2N1bWVudHNMaXN0KHByb2ZpbGUuZG9jdW1lbnRzKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBkZWxldGluZyBkb2N1bWVudDonLCBlcnJvcik7XG4gICAgc2hvd1RvYXN0KCdFcnJvciBkZWxldGluZyBkb2N1bWVudCcsICdlcnJvcicpO1xuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBTUEsSUFBSTtBQUFKLElBQWE7QUFBYixJQUEwQjtBQUMxQixJQUFJO0FBQUosSUFBa0I7QUFBbEIsSUFBMkI7QUFBM0IsSUFBeUM7QUFDekMsSUFBSTtBQUFKLElBQXFCO0FBQXJCLElBQXVDO0FBQXZDLElBQXVEO0FBQXZELElBQW9FO0FBQ3BFLElBQUk7QUFBSixJQUFlO0FBQWYsSUFBMEI7QUFDMUIsSUFBSTtBQUFKLElBQVc7QUFBWCxJQUFxQjtBQUdyQixTQUFTLGlCQUFpQixvQkFBb0IsTUFBTTtBQUVsRCxZQUFVLFNBQVMsaUJBQWlCLFVBQVU7QUFDOUMsZ0JBQWMsU0FBUyxpQkFBaUIsY0FBYztBQUN0RCxnQkFBYyxTQUFTLGVBQWUsYUFBYTtBQUVuRCxpQkFBZSxTQUFTLGVBQWUsY0FBYztBQUNyRCxZQUFVLFNBQVMsZUFBZSxTQUFTO0FBQzNDLGlCQUFlLFNBQVMsZUFBZSxjQUFjO0FBQ3JELGNBQVksU0FBUyxlQUFlLFdBQVc7QUFFL0Msb0JBQWtCLFNBQVMsZUFBZSxpQkFBaUI7QUFDM0QscUJBQW1CLFNBQVMsZUFBZSxrQkFBa0I7QUFDN0QsbUJBQWlCLFNBQVMsZUFBZSxnQkFBZ0I7QUFDekQsZ0JBQWMsU0FBUyxlQUFlLGFBQWE7QUFDbkQsbUJBQWlCLFNBQVMsZUFBZSxnQkFBZ0I7QUFDekQs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eEM7QUFFQSxhQUFPLFdBQVcsSUFBSTtBQUFBLElBQ3hCLFNBQVMsT0FBTztBQUNkLGNBQVEsTUFBTSw2QkFBNkIsS0FBSztBQUNoRCxnQkFBVSw0QkFBNEIsT0FBTztBQUFBLElBQy9DO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxNQUFNO0FBQ2Q7QUFLQSxTQUFTLHFCQUFxQixXQUFXO0FBQ3ZDLFFBQU0sT0FBTyxTQUFTLGVBQWUsZUFBZTtBQUVwRCxNQUFJLFVBQVUsV0FBVyxHQUFHO0FBQzFCLFNBQUssWUFBWTtBQUNqQjtBQUFBLEVBQ0Y7QUFFQSxPQUFLLFlBQVksVUFDZDtBQUFBLElBQ0MsQ0FBQyxRQUFRO0FBQUE7QUFBQTtBQUFBLHVDQUd3QixXQUFXLElBQUksSUFBSSxDQUFDO0FBQUEsMENBQ2pCLElBQUksS0FBSyxJQUFJLFVBQVUsRUFBRSxtQkFBbUIsQ0FBQyxZQUFPLElBQUksUUFBUSxTQUFTLE1BQU0sUUFBUSxDQUFDLENBQUM7QUFBQTtBQUFBO0FBQUEsc0RBRzdFLElBQUksRUFBRTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBSXhELEVBQ0MsS0FBSyxFQUFFO0FBR1YsT0FBSyxpQkFBaUIsYUFBYSxFQUFFLFFBQVEsU0FBTztBQUNsRCxRQUFJLGlCQUFpQixTQUFTLFlBQVk7QUFDeEMsWUFBTSxRQUFRLElBQUksYUFBYSxhQUFhO0FBQzVDLFlBQU0sZUFBZSxLQUFLO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUNIO0FBS0EsZUFBZSxlQUFlLElBQUk7QUFDaEMsTUFBSSxDQUFDLFFBQVEsZ0RBQWdEO0FBQUc7QUFFaEUsTUFBSTtBQUNGLFVBQU0sV0FBVyxNQUFNLE9BQU8sUUFBUSxZQUFZLEVBQUUsUUFBUSxhQUFhLENBQUMsR0FBRztBQUM3RSxZQUFRLGFBQWEsUUFBUSxhQUFhLENBQUMsR0FBRyxPQUFPLE9BQUssRUFBRSxPQUFPLEVBQUU7QUFFckUsVUFBTSxPQUFPLFFBQVEsWUFBWSxFQUFFLFFBQVEsZUFBZSxTQUFTLFFBQVEsQ0FBQztBQUM1RSxjQUFVLHFCQUFxQixTQUFTO0FBQ3hDLHlCQUFxQixRQUFRLFNBQVM7QUFBQSxFQUN4QyxTQUFTLE9BQU87QUFDZCxZQUFRLE1BQU0sNEJBQTRCLEtBQUs7QUFDL0MsY0FBVSwyQkFBMkIsT0FBTztBQUFBLEVBQzlDO0FBQ0Y7IiwKICAibmFtZXMiOiBbImUiLCAiZG9jdW1lbnQiXQp9Cg==
