// src/popup.js
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL3BvcHVwLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKipcbiAqIFBvcHVwIFVJIExvZ2ljXG4gKiBIYW5kbGVzIHVzZXIgaW50ZXJhY3Rpb25zIGFuZCBwcm9maWxlIG1hbmFnZW1lbnQgaW4gdGhlIGV4dGVuc2lvbiBwb3B1cFxuICovXG5cbi8vIERPTSBFbGVtZW50cyAtIHdpbGwgYmUgaW5pdGlhbGl6ZWQgYWZ0ZXIgRE9NIGxvYWRzXG5sZXQgdGFiQnRucywgdGFiQ29udGVudHMsIHNldHRpbmdzQnRuO1xubGV0IHBlcnNvbmFsRm9ybSwgbGxtRm9ybSwgYXV0b0ZpbGxGb3JtLCBzdHlsZUZvcm0sIHZhbHVlc0Zvcm07XG5sZXQgYWRkRWR1Y2F0aW9uQnRuLCBhZGRFeHBlcmllbmNlQnRuLCBhZGRTa2lsbEJ0biwgYWRkU3RvcnlCdG47XG5sZXQgZXhwb3J0QnRuLCBpbXBvcnRCdG4sIGNsZWFyQnRuO1xubGV0IG1vZGFsLCBjbG9zZUJ0biwgdG9hc3Q7XG5cbi8vIEluaXRpYWxpemUgcG9wdXBcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XG4gIC8vIEluaXRpYWxpemUgYWxsIERPTSBlbGVtZW50c1xuICB0YWJCdG5zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLnRhYi1idG4nKTtcbiAgdGFiQ29udGVudHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcudGFiLWNvbnRlbnQnKTtcbiAgc2V0dGluZ3NCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0dGluZ3NCdG4nKTtcblxuICBwZXJzb25hbEZvcm0gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncGVyc29uYWxGb3JtJyk7XG4gIGxsbUZvcm0gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGxtRm9ybScpO1xuICBhdXRvRmlsbEZvcm0gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXV0b0ZpbGxGb3JtJyk7XG4gIHN0eWxlRm9ybSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdHlsZUZvcm0nKTtcbiAgdmFsdWVzRm9ybSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd2YWx1ZXNGb3JtJyk7XG5cbiAgYWRkRWR1Y2F0aW9uQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZEVkdWNhdGlvbkJ0bicpO1xuICBhZGRFeHBlcmllbmNlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FkZEV4cGVyaWVuY2VCdG4nKTtcbiAgYWRkU2tpbGxCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkU2tpbGxCdG4nKTtcbiAgYWRkU3RvcnlCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkU3RvcnlCdG4nKTtcbiAgZXhwb3J0QnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2V4cG9ydEJ0bicpO1xuICBpbXBvcnRCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW1wb3J0QnRuJyk7XG4gIGNsZWFyQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NsZWFyQnRuJyk7XG5cbiAgbW9kYWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbW9kYWwnKTtcbiAgY2xvc2VCdG4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY2xvc2UnKTtcbiAgdG9hc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9hc3QnKTtcblxuICBjb25zb2xlLmxvZygnW1BvcHVwXSBET00gZWxlbWVudHMgaW5pdGlhbGl6ZWQsIHRvYXN0OicsIHRvYXN0KTtcblxuICBpbml0aWFsaXplVGFicygpO1xuICBsb2FkUHJvZmlsZSgpO1xuICBsb2FkU2V0dGluZ3MoKTtcbiAgc2V0dXBFdmVudExpc3RlbmVycygpO1xufSk7XG5cbi8qKlxuICogVGFiIHN3aXRjaGluZyBsb2dpY1xuICovXG5mdW5jdGlvbiBpbml0aWFsaXplVGFicygpIHtcbiAgdGFiQnRucy5mb3JFYWNoKChidG4pID0+IHtcbiAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICBjb25zdCB0YWJOYW1lID0gYnRuLmdldEF0dHJpYnV0ZSgnZGF0YS10YWInKTtcbiAgICAgIHN3aXRjaFRhYih0YWJOYW1lKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHN3aXRjaFRhYih0YWJOYW1lKSB7XG4gIC8vIERlYWN0aXZhdGUgYWxsIHRhYnNcbiAgdGFiQnRucy5mb3JFYWNoKChidG4pID0+IGJ0bi5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKSk7XG4gIHRhYkNvbnRlbnRzLmZvckVhY2goKGNvbnRlbnQpID0+IGNvbnRlbnQuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJykpO1xuXG4gIC8vIEFjdGl2YXRlIHNlbGVjdGVkIHRhYlxuICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS10YWI9XCIke3RhYk5hbWV9XCJdYCkuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGAke3RhYk5hbWV9LXRhYmApLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xufVxuXG4vKipcbiAqIFNldHVwIGFsbCBldmVudCBsaXN0ZW5lcnNcbiAqL1xuZnVuY3Rpb24gc2V0dXBFdmVudExpc3RlbmVycygpIHtcbiAgLy8gUHJvZmlsZSBmb3Jtc1xuICBwZXJzb25hbEZvcm0uYWRkRXZlbnRMaXN0ZW5lcignc3VibWl0Jywgc2F2ZVBlcnNvbmFsSW5mbyk7XG4gIHZhbHVlc0Zvcm0uYWRkRXZlbnRMaXN0ZW5lcignc3VibWl0Jywgc2F2ZVZhbHVlcyk7XG5cbiAgLy8gQWRkIGJ1dHRvbnNcbiAgYWRkRWR1Y2F0aW9uQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3BlbkVkdWNhdGlvbk1vZGFsKCkpO1xuICBhZGRFeHBlcmllbmNlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gb3BlbkV4cGVyaWVuY2VNb2RhbCgpKTtcbiAgYWRkU2tpbGxCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBvcGVuU2tpbGxNb2RhbCgpKTtcbiAgYWRkU3RvcnlCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBvcGVuU3RvcnlNb2RhbCgpKTtcblxuICAvLyBTZXR0aW5ncyBmb3Jtc1xuICBsbG1Gb3JtLmFkZEV2ZW50TGlzdGVuZXIoJ3N1Ym1pdCcsIHNhdmVMTE1TZXR0aW5ncyk7XG4gIGF1dG9GaWxsRm9ybS5hZGRFdmVudExpc3RlbmVyKCdzdWJtaXQnLCBzYXZlQXV0b0ZpbGxTZXR0aW5ncyk7XG4gIHN0eWxlRm9ybS5hZGRFdmVudExpc3RlbmVyKCdzdWJtaXQnLCBzYXZlU3R5bGVTZXR0aW5ncyk7XG5cbiAgLy8gRGF0YSBtYW5hZ2VtZW50XG4gIGV4cG9ydEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGV4cG9ydERhdGEpO1xuICBpbXBvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBpbXBvcnREYXRhKTtcbiAgY2xlYXJCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjbGVhckFsbERhdGEpO1xuXG4gIC8vIE1vZGFsXG4gIGNsb3NlQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gbW9kYWwuY2xhc3NMaXN0LnJlbW92ZSgnc2hvdycpKTtcbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHtcbiAgICBpZiAoZS50YXJnZXQgPT09IG1vZGFsKSB7XG4gICAgICBtb2RhbC5jbGFzc0xpc3QucmVtb3ZlKCdzaG93Jyk7XG4gICAgfVxuICB9KTtcblxuICAvLyBTZXR0aW5ncyBidXR0b25cbiAgc2V0dGluZ3NCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBzd2l0Y2hUYWIoJ3NldHRpbmdzJykpO1xufVxuXG4vKipcbiAqIExvYWQgcHJvZmlsZSBkYXRhIGludG8gdGhlIFVJXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGxvYWRQcm9maWxlKCkge1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgYWN0aW9uOiAnZ2V0UHJvZmlsZScsXG4gICAgfSk7XG5cbiAgICBpZiAocmVzcG9uc2Uuc3VjY2VzcyAmJiByZXNwb25zZS5kYXRhKSB7XG4gICAgICBjb25zdCBwcm9maWxlID0gcmVzcG9uc2UuZGF0YTtcblxuICAgICAgLy8gUGVyc29uYWwgaW5mb1xuICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2Z1bGxOYW1lJykudmFsdWUgPSBwcm9maWxlLnBlcnNvbmFsPy5mdWxsTmFtZSB8fCAnJztcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdlbWFpbCcpLnZhbHVlID0gcHJvZmlsZS5wZXJzb25hbD8uZW1haWwgfHwgJyc7XG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncGhvbmUnKS52YWx1ZSA9IHByb2ZpbGUucGVyc29uYWw/LnBob25lIHx8ICcnO1xuICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2xvY2F0aW9uJykudmFsdWUgPSBwcm9maWxlLnBlcnNvbmFsPy5sb2NhdGlvbiB8fCAnJztcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdW1tYXJ5JykudmFsdWUgPSBwcm9maWxlLnBlcnNvbmFsPy5zdW1tYXJ5IHx8ICcnO1xuXG4gICAgICAvLyBWYWx1ZXNcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjYXJlZXJHb2FscycpLnZhbHVlID0gcHJvZmlsZS52YWx1ZXM/LmNhcmVlckdvYWxzIHx8ICcnO1xuICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0cmVuZ3RocycpLnZhbHVlID0gcHJvZmlsZS52YWx1ZXM/LnN0cmVuZ3Rocz8uam9pbignLCAnKSB8fCAnJztcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd2YWx1ZXMnKS52YWx1ZSA9IHByb2ZpbGUudmFsdWVzPy52YWx1ZXNJbXBvcnRhbnQ/LmpvaW4oJywgJykgfHwgJyc7XG5cbiAgICAgIC8vIERpc3BsYXkgZWR1Y2F0aW9uIGl0ZW1zXG4gICAgICBkaXNwbGF5RWR1Y2F0aW9uTGlzdChwcm9maWxlLmVkdWNhdGlvbiB8fCBbXSk7XG4gICAgICAvLyBEaXNwbGF5IGV4cGVyaWVuY2UgaXRlbXNcbiAgICAgIGRpc3BsYXlFeHBlcmllbmNlTGlzdChwcm9maWxlLmV4cGVyaWVuY2UgfHwgW10pO1xuICAgICAgLy8gRGlzcGxheSBza2lsbHNcbiAgICAgIGRpc3BsYXlTa2lsbHNMaXN0KHByb2ZpbGUuc2tpbGxzIHx8IFtdKTtcbiAgICAgIC8vIERpc3BsYXkgc3Rvcmllc1xuICAgICAgZGlzcGxheVN0b3JpZXNMaXN0KHByb2ZpbGUuc3RvcmllcyB8fCBbXSk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGxvYWRpbmcgcHJvZmlsZTonLCBlcnJvcik7XG4gIH1cbn1cblxuLyoqXG4gKiBMb2FkIHNldHRpbmdzIGludG8gdGhlIFVJXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGxvYWRTZXR0aW5ncygpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIGFjdGlvbjogJ2dldFNldHRpbmdzJyxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdWNjZXNzICYmIHJlc3BvbnNlLmRhdGEpIHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gcmVzcG9uc2UuZGF0YTtcblxuICAgICAgLy8gTExNIHNldHRpbmdzXG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGxtUHJvdmlkZXInKS52YWx1ZSA9IHNldHRpbmdzLmxsbT8ucHJvdmlkZXIgfHwgJ29wZW5haSc7XG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXBpS2V5JykudmFsdWUgPSBzZXR0aW5ncy5sbG0/LmFwaUtleSB8fCAnJztcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RlbCcpLnZhbHVlID0gc2V0dGluZ3MubGxtPy5tb2RlbCB8fCAnZ3B0LTQnO1xuXG4gICAgICAvLyBBdXRvLWZpbGwgc2V0dGluZ3NcbiAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyZXF1aXJlQXBwcm92YWwnKS5jaGVja2VkID0gc2V0dGluZ3MuYXV0b0ZpbGw/LnJlcXVpcmVBcHByb3ZhbCB8fCB0cnVlO1xuICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2F2b2lkUmVwZXRpdGlvbicpLmNoZWNrZWQgPSBzZXR0aW5ncy5hdXRvRmlsbD8uYXZvaWRSZXBldGl0aW9uIHx8IHRydWU7XG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbWluRGF5c0JldHdlZW5TdG9yaWVzJykudmFsdWUgPSBzZXR0aW5ncy5hdXRvRmlsbD8ubWluRGF5c0JldHdlZW5TdG9yaWVzIHx8IDc7XG5cbiAgICAgIC8vIFN0eWxlIHNldHRpbmdzXG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndG9uZScpLnZhbHVlID0gc2V0dGluZ3MuY3VzdG9tUHJvbXB0U3R5bGU/LnRvbmUgfHwgJ3Byb2Zlc3Npb25hbCc7XG4gICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGVuZ3RoJykudmFsdWUgPSBzZXR0aW5ncy5jdXN0b21Qcm9tcHRTdHlsZT8ubGVuZ3RoIHx8ICdtZWRpdW0nO1xuICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2luY2x1ZGVNZXRyaWNzJykuY2hlY2tlZCA9IHNldHRpbmdzLmN1c3RvbVByb21wdFN0eWxlPy5pbmNsdWRlTWV0cmljcyB8fCB0cnVlO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBsb2FkaW5nIHNldHRpbmdzOicsIGVycm9yKTtcbiAgfVxufVxuXG4vKipcbiAqIFNhdmUgcGVyc29uYWwgaW5mb3JtYXRpb25cbiAqL1xuYXN5bmMgZnVuY3Rpb24gc2F2ZVBlcnNvbmFsSW5mbyhlKSB7XG4gIGUucHJldmVudERlZmF1bHQoKTtcblxuICBjb25zdCBwZXJzb25hbEluZm8gPSB7XG4gICAgZnVsbE5hbWU6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmdWxsTmFtZScpLnZhbHVlLFxuICAgIGVtYWlsOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZW1haWwnKS52YWx1ZSxcbiAgICBwaG9uZTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Bob25lJykudmFsdWUsXG4gICAgbG9jYXRpb246IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsb2NhdGlvbicpLnZhbHVlLFxuICAgIHN1bW1hcnk6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzdW1tYXJ5JykudmFsdWUsXG4gIH07XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBwcm9maWxlID0gKFxuICAgICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICBhY3Rpb246ICdnZXRQcm9maWxlJyxcbiAgICAgIH0pXG4gICAgKS5kYXRhO1xuXG4gICAgcHJvZmlsZS5wZXJzb25hbCA9IHBlcnNvbmFsSW5mbztcblxuICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIGFjdGlvbjogJ3NhdmVQcm9maWxlJyxcbiAgICAgIHBheWxvYWQ6IHByb2ZpbGUsXG4gICAgfSk7XG5cbiAgICBzaG93VG9hc3QoJ1BlcnNvbmFsIGluZm9ybWF0aW9uIHNhdmVkIScsICdzdWNjZXNzJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIHBlcnNvbmFsIGluZm86JywgZXJyb3IpO1xuICAgIHNob3dUb2FzdCgnRXJyb3Igc2F2aW5nIHBlcnNvbmFsIGluZm8nLCAnZXJyb3InKTtcbiAgfVxufVxuXG4vKipcbiAqIFNhdmUgdmFsdWVzIGFuZCBnb2Fsc1xuICovXG5hc3luYyBmdW5jdGlvbiBzYXZlVmFsdWVzKGUpIHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gIGNvbnN0IHZhbHVlcyA9IHtcbiAgICBjYXJlZXJHb2FsczogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NhcmVlckdvYWxzJykudmFsdWUsXG4gICAgc3RyZW5ndGhzOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3RyZW5ndGhzJykudmFsdWUuc3BsaXQoJywnKS5tYXAoKHMpID0+IHMudHJpbSgpKSxcbiAgICB2YWx1ZXNJbXBvcnRhbnQ6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd2YWx1ZXMnKS52YWx1ZS5zcGxpdCgnLCcpLm1hcCgodikgPT4gdi50cmltKCkpLFxuICAgIG1vdGl2YXRpb246IFtdLFxuICB9O1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcHJvZmlsZSA9IChcbiAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgYWN0aW9uOiAnZ2V0UHJvZmlsZScsXG4gICAgICB9KVxuICAgICkuZGF0YTtcblxuICAgIHByb2ZpbGUudmFsdWVzID0gdmFsdWVzO1xuXG4gICAgYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgYWN0aW9uOiAnc2F2ZVByb2ZpbGUnLFxuICAgICAgcGF5bG9hZDogcHJvZmlsZSxcbiAgICB9KTtcblxuICAgIHNob3dUb2FzdCgnVmFsdWVzIHNhdmVkIScsICdzdWNjZXNzJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIHZhbHVlczonLCBlcnJvcik7XG4gICAgc2hvd1RvYXN0KCdFcnJvciBzYXZpbmcgdmFsdWVzJywgJ2Vycm9yJyk7XG4gIH1cbn1cblxuLyoqXG4gKiBTYXZlIExMTSBzZXR0aW5nc1xuICovXG5hc3luYyBmdW5jdGlvbiBzYXZlTExNU2V0dGluZ3MoZSkge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG5cbiAgY29uc29sZS5sb2coJ1tQb3B1cF0gc2F2ZUxMTVNldHRpbmdzIGNhbGxlZCcpO1xuXG4gIGNvbnN0IHNldHRpbmdzID0ge1xuICAgIHByb3ZpZGVyOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnbGxtUHJvdmlkZXInKS52YWx1ZSxcbiAgICBhcGlLZXk6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhcGlLZXknKS52YWx1ZSxcbiAgICBtb2RlbDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vZGVsJykudmFsdWUsXG4gIH07XG5cbiAgY29uc29sZS5sb2coJ1tQb3B1cF0gU2V0dGluZ3M6JywgeyBwcm92aWRlcjogc2V0dGluZ3MucHJvdmlkZXIsIG1vZGVsOiBzZXR0aW5ncy5tb2RlbCwgaGFzQXBpS2V5OiAhIXNldHRpbmdzLmFwaUtleSB9KTtcblxuICBpZiAoIXNldHRpbmdzLmFwaUtleSkge1xuICAgIGNvbnNvbGUubG9nKCdbUG9wdXBdIE5vIEFQSSBrZXkgcHJvdmlkZWQnKTtcbiAgICBzaG93VG9hc3QoJ1BsZWFzZSBlbnRlciB5b3VyIEFQSSBrZXknLCAnZXJyb3InKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKCdbUG9wdXBdIFNlbmRpbmcgbWVzc2FnZSB0byBiYWNrZ3JvdW5kLi4uJyk7XG4gICAgLy8gU2F2ZSB2aWEgYmFja2dyb3VuZCBzY3JpcHRcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIGFjdGlvbjogJ3NhdmVMTE1TZXR0aW5ncycsXG4gICAgICBwYXlsb2FkOiBzZXR0aW5ncyxcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKCdbUG9wdXBdIFJlc3BvbnNlOicsIHJlc3BvbnNlKTtcblxuICAgIC8vIFx1NTE0OFx1NUYzQVx1NTIzNlx1NjYzRVx1NzkzQVx1NjIxMFx1NTI5Rlx1NkQ4OFx1NjA2Rlx1OEZEQlx1ODg0Q1x1NkQ0Qlx1OEJENVxuICAgIHNob3dUb2FzdCgnTExNIHNldHRpbmdzIHNhdmVkIScsICdzdWNjZXNzJyk7XG5cbiAgICBpZiAoIXJlc3BvbnNlIHx8ICFyZXNwb25zZS5zdWNjZXNzKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ1tQb3B1cF0gUmVzcG9uc2Ugd2FzIG5vdCBzdWNjZXNzZnVsOicsIHJlc3BvbnNlKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignW1BvcHVwXSBFcnJvciBzYXZpbmcgTExNIHNldHRpbmdzOicsIGVycm9yKTtcbiAgICBzaG93VG9hc3QoJ0Vycm9yIHNhdmluZyBMTE0gc2V0dGluZ3M6ICcgKyBlcnJvci5tZXNzYWdlLCAnZXJyb3InKTtcbiAgfVxufVxuXG4vKipcbiAqIFNhdmUgYXV0by1maWxsIHNldHRpbmdzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHNhdmVBdXRvRmlsbFNldHRpbmdzKGUpIHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gIGNvbnN0IHNldHRpbmdzID0ge1xuICAgIHJlcXVpcmVBcHByb3ZhbDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3JlcXVpcmVBcHByb3ZhbCcpLmNoZWNrZWQsXG4gICAgYXZvaWRSZXBldGl0aW9uOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXZvaWRSZXBldGl0aW9uJykuY2hlY2tlZCxcbiAgICBtaW5EYXlzQmV0d2VlblN0b3JpZXM6IHBhcnNlSW50KGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtaW5EYXlzQmV0d2VlblN0b3JpZXMnKS52YWx1ZSksXG4gIH07XG5cbiAgdHJ5IHtcbiAgICBhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7XG4gICAgICBhY3Rpb246ICdzYXZlQXV0b0ZpbGxTZXR0aW5ncycsXG4gICAgICBwYXlsb2FkOiBzZXR0aW5ncyxcbiAgICB9KTtcblxuICAgIHNob3dUb2FzdCgnQXV0by1maWxsIHNldHRpbmdzIHNhdmVkIScsICdzdWNjZXNzJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIGF1dG8tZmlsbCBzZXR0aW5nczonLCBlcnJvcik7XG4gICAgc2hvd1RvYXN0KCdFcnJvciBzYXZpbmcgc2V0dGluZ3MnLCAnZXJyb3InKTtcbiAgfVxufVxuXG4vKipcbiAqIFNhdmUgc3R5bGUgc2V0dGluZ3NcbiAqL1xuYXN5bmMgZnVuY3Rpb24gc2F2ZVN0eWxlU2V0dGluZ3MoZSkge1xuICBlLnByZXZlbnREZWZhdWx0KCk7XG5cbiAgY29uc3Qgc2V0dGluZ3MgPSB7XG4gICAgdG9uZTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RvbmUnKS52YWx1ZSxcbiAgICBsZW5ndGg6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdsZW5ndGgnKS52YWx1ZSxcbiAgICBpbmNsdWRlTWV0cmljczogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2luY2x1ZGVNZXRyaWNzJykuY2hlY2tlZCxcbiAgfTtcblxuICB0cnkge1xuICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgIGFjdGlvbjogJ3NhdmVTdHlsZVNldHRpbmdzJyxcbiAgICAgIHBheWxvYWQ6IHNldHRpbmdzLFxuICAgIH0pO1xuXG4gICAgc2hvd1RvYXN0KCdTdHlsZSBzZXR0aW5ncyBzYXZlZCEnLCAnc3VjY2VzcycpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHNhdmluZyBzdHlsZSBzZXR0aW5nczonLCBlcnJvcik7XG4gICAgc2hvd1RvYXN0KCdFcnJvciBzYXZpbmcgc2V0dGluZ3MnLCAnZXJyb3InKTtcbiAgfVxufVxuXG4vKipcbiAqIERpc3BsYXkgZWR1Y2F0aW9uIGxpc3RcbiAqL1xuZnVuY3Rpb24gZGlzcGxheUVkdWNhdGlvbkxpc3QoZWR1Y2F0aW9uKSB7XG4gIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZWR1Y2F0aW9uTGlzdCcpO1xuXG4gIGlmIChlZHVjYXRpb24ubGVuZ3RoID09PSAwKSB7XG4gICAgbGlzdC5pbm5lckhUTUwgPSAnPHAgY2xhc3M9XCJlbXB0eS1zdGF0ZVwiPk5vIGVkdWNhdGlvbiBhZGRlZCB5ZXQuPC9wPic7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbGlzdC5pbm5lckhUTUwgPSBlZHVjYXRpb25cbiAgICAubWFwKFxuICAgICAgKGVkdSkgPT4gYFxuICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW1cIj5cbiAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tY29udGVudFwiPlxuICAgICAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtLXRpdGxlXCI+JHtlc2NhcGVIdG1sKGVkdS5kZWdyZWUpfSBpbiAke2VzY2FwZUh0bWwoZWR1LmZpZWxkKX08L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS1zdWJ0aXRsZVwiPiR7ZXNjYXBlSHRtbChlZHUuaW5zdGl0dXRpb24pfSAtICR7ZWR1LmdyYWR1YXRpb25ZZWFyfTwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtLWFjdGlvbnNcIj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0biBidG4tc2Vjb25kYXJ5XCIgb25jbGljaz1cImVkaXRFZHVjYXRpb24oJyR7ZWR1LmlkfScpXCI+RWRpdDwvYnV0dG9uPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1kYW5nZXJcIiBvbmNsaWNrPVwiZGVsZXRlRWR1Y2F0aW9uKCcke2VkdS5pZH0nKVwiPkRlbGV0ZTwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gIGBcbiAgICApXG4gICAgLmpvaW4oJycpO1xufVxuXG4vKipcbiAqIERpc3BsYXkgZXhwZXJpZW5jZSBsaXN0XG4gKi9cbmZ1bmN0aW9uIGRpc3BsYXlFeHBlcmllbmNlTGlzdChleHBlcmllbmNlKSB7XG4gIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZXhwZXJpZW5jZUxpc3QnKTtcblxuICBpZiAoZXhwZXJpZW5jZS5sZW5ndGggPT09IDApIHtcbiAgICBsaXN0LmlubmVySFRNTCA9ICc8cCBjbGFzcz1cImVtcHR5LXN0YXRlXCI+Tm8gZXhwZXJpZW5jZSBhZGRlZCB5ZXQuPC9wPic7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbGlzdC5pbm5lckhUTUwgPSBleHBlcmllbmNlXG4gICAgLm1hcChcbiAgICAgIChleHApID0+IGBcbiAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtLWNvbnRlbnRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS10aXRsZVwiPiR7ZXNjYXBlSHRtbChleHAudGl0bGUpfTwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtLXN1YnRpdGxlXCI+JHtlc2NhcGVIdG1sKGV4cC5jb21wYW55KX0gLSAke2V4cC5kdXJhdGlvbn08L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS1hY3Rpb25zXCI+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLXNlY29uZGFyeVwiIG9uY2xpY2s9XCJlZGl0RXhwZXJpZW5jZSgnJHtleHAuaWR9JylcIj5FZGl0PC9idXR0b24+XG4gICAgICAgIDxidXR0b24gY2xhc3M9XCJidG4gYnRuLWRhbmdlclwiIG9uY2xpY2s9XCJkZWxldGVFeHBlcmllbmNlKCcke2V4cC5pZH0nKVwiPkRlbGV0ZTwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gIGBcbiAgICApXG4gICAgLmpvaW4oJycpO1xufVxuXG4vKipcbiAqIERpc3BsYXkgc2tpbGxzIGxpc3RcbiAqL1xuZnVuY3Rpb24gZGlzcGxheVNraWxsc0xpc3Qoc2tpbGxzKSB7XG4gIGNvbnN0IGxpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2tpbGxzTGlzdCcpO1xuXG4gIGlmIChza2lsbHMubGVuZ3RoID09PSAwKSB7XG4gICAgbGlzdC5pbm5lckhUTUwgPSAnPHAgY2xhc3M9XCJlbXB0eS1zdGF0ZVwiPk5vIHNraWxscyBhZGRlZCB5ZXQuPC9wPic7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbGlzdC5pbm5lckhUTUwgPSBza2lsbHNcbiAgICAubWFwKFxuICAgICAgKHNraWxsKSA9PiBgXG4gICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbVwiPlxuICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS1jb250ZW50XCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tdGl0bGVcIj4ke2VzY2FwZUh0bWwoc2tpbGwubmFtZSl9PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tc3VidGl0bGVcIj4ke3NraWxsLmNhdGVnb3J5fSAtICR7c2tpbGwucHJvZmljaWVuY3l9PC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tYWN0aW9uc1wiPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1zZWNvbmRhcnlcIiBvbmNsaWNrPVwiZWRpdFNraWxsKCcke3NraWxsLmlkfScpXCI+RWRpdDwvYnV0dG9uPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1kYW5nZXJcIiBvbmNsaWNrPVwiZGVsZXRlU2tpbGwoJyR7c2tpbGwuaWR9JylcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICBgXG4gICAgKVxuICAgIC5qb2luKCcnKTtcbn1cblxuLyoqXG4gKiBEaXNwbGF5IHN0b3JpZXMgbGlzdFxuICovXG5mdW5jdGlvbiBkaXNwbGF5U3Rvcmllc0xpc3Qoc3Rvcmllcykge1xuICBjb25zdCBsaXN0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3N0b3JpZXNMaXN0Jyk7XG5cbiAgaWYgKHN0b3JpZXMubGVuZ3RoID09PSAwKSB7XG4gICAgbGlzdC5pbm5lckhUTUwgPSAnPHAgY2xhc3M9XCJlbXB0eS1zdGF0ZVwiPk5vIHN0b3JpZXMgYWRkZWQgeWV0LjwvcD4nO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxpc3QuaW5uZXJIVE1MID0gc3Rvcmllc1xuICAgIC5tYXAoXG4gICAgICAoc3RvcnkpID0+IGBcbiAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtXCI+XG4gICAgICA8ZGl2IGNsYXNzPVwibGlzdC1pdGVtLWNvbnRlbnRcIj5cbiAgICAgICAgPGRpdiBjbGFzcz1cImxpc3QtaXRlbS10aXRsZVwiPiR7ZXNjYXBlSHRtbChzdG9yeS50aXRsZSl9PC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tc3VidGl0bGVcIj4ke3N0b3J5LnRhZ3Muam9pbignLCAnKX0gXHUyMDIyIFVzZWQgJHtzdG9yeS50aW1lc1VzZWR9IHRpbWVzPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3M9XCJsaXN0LWl0ZW0tYWN0aW9uc1wiPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1zZWNvbmRhcnlcIiBvbmNsaWNrPVwiZWRpdFN0b3J5KCcke3N0b3J5LmlkfScpXCI+RWRpdDwvYnV0dG9uPlxuICAgICAgICA8YnV0dG9uIGNsYXNzPVwiYnRuIGJ0bi1kYW5nZXJcIiBvbmNsaWNrPVwiZGVsZXRlU3RvcnkoJyR7c3RvcnkuaWR9JylcIj5EZWxldGU8L2J1dHRvbj5cbiAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICBgXG4gICAgKVxuICAgIC5qb2luKCcnKTtcbn1cblxuLyoqXG4gKiBPcGVuIGVkdWNhdGlvbiBtb2RhbFxuICovXG5mdW5jdGlvbiBvcGVuRWR1Y2F0aW9uTW9kYWwoaWQgPSBudWxsKSB7XG4gIG1vZGFsLmNsYXNzTGlzdC5hZGQoJ3Nob3cnKTtcbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21vZGFsVGl0bGUnKS50ZXh0Q29udGVudCA9IGlkID8gJ0VkaXQgRWR1Y2F0aW9uJyA6ICdBZGQgRWR1Y2F0aW9uJztcbiAgLy8gVE9ETzogTG9hZCBhbmQgZGlzcGxheSBlZHVjYXRpb24gZm9ybVxufVxuXG4vKipcbiAqIE9wZW4gZXhwZXJpZW5jZSBtb2RhbFxuICovXG5mdW5jdGlvbiBvcGVuRXhwZXJpZW5jZU1vZGFsKGlkID0gbnVsbCkge1xuICBtb2RhbC5jbGFzc0xpc3QuYWRkKCdzaG93Jyk7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RhbFRpdGxlJykudGV4dENvbnRlbnQgPSBpZCA/ICdFZGl0IEV4cGVyaWVuY2UnIDogJ0FkZCBFeHBlcmllbmNlJztcbiAgLy8gVE9ETzogTG9hZCBhbmQgZGlzcGxheSBleHBlcmllbmNlIGZvcm1cbn1cblxuLyoqXG4gKiBPcGVuIHNraWxsIG1vZGFsXG4gKi9cbmZ1bmN0aW9uIG9wZW5Ta2lsbE1vZGFsKGlkID0gbnVsbCkge1xuICBtb2RhbC5jbGFzc0xpc3QuYWRkKCdzaG93Jyk7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RhbFRpdGxlJykudGV4dENvbnRlbnQgPSBpZCA/ICdFZGl0IFNraWxsJyA6ICdBZGQgU2tpbGwnO1xuICAvLyBUT0RPOiBMb2FkIGFuZCBkaXNwbGF5IHNraWxsIGZvcm1cbn1cblxuLyoqXG4gKiBPcGVuIHN0b3J5IG1vZGFsXG4gKi9cbmZ1bmN0aW9uIG9wZW5TdG9yeU1vZGFsKGlkID0gbnVsbCkge1xuICBtb2RhbC5jbGFzc0xpc3QuYWRkKCdzaG93Jyk7XG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtb2RhbFRpdGxlJykudGV4dENvbnRlbnQgPSBpZCA/ICdFZGl0IFN0b3J5JyA6ICdBZGQgU3RvcnknO1xuICAvLyBUT0RPOiBMb2FkIGFuZCBkaXNwbGF5IHN0b3J5IGZvcm1cbn1cblxuLyoqXG4gKiBFeHBvcnQgZGF0YVxuICovXG5hc3luYyBmdW5jdGlvbiBleHBvcnREYXRhKCkge1xuICB0cnkge1xuICAgIGNvbnN0IHByb2ZpbGUgPSAoYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2UoeyBhY3Rpb246ICdnZXRQcm9maWxlJyB9KSkuZGF0YTtcbiAgICBjb25zdCBzZXR0aW5ncyA9IChhd2FpdCBjaHJvbWUucnVudGltZS5zZW5kTWVzc2FnZSh7IGFjdGlvbjogJ2dldFNldHRpbmdzJyB9KSkuZGF0YTtcblxuICAgIGNvbnN0IGRhdGEgPSB7XG4gICAgICBwcm9maWxlLFxuICAgICAgc2V0dGluZ3MsXG4gICAgICBleHBvcnRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgfTtcblxuICAgIGNvbnN0IGRhdGFTdHIgPSBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCAyKTtcbiAgICBjb25zdCBkYXRhQmxvYiA9IG5ldyBCbG9iKFtkYXRhU3RyXSwgeyB0eXBlOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG4gICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChkYXRhQmxvYik7XG4gICAgY29uc3QgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICBsaW5rLmhyZWYgPSB1cmw7XG4gICAgbGluay5kb3dubG9hZCA9IGBmb3JtYXV0b2ZpbGwtYmFja3VwLSR7bmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNwbGl0KCdUJylbMF19Lmpzb25gO1xuICAgIGxpbmsuY2xpY2soKTtcbiAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG5cbiAgICBzaG93VG9hc3QoJ0RhdGEgZXhwb3J0ZWQgc3VjY2Vzc2Z1bGx5IScsICdzdWNjZXNzJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZXhwb3J0aW5nIGRhdGE6JywgZXJyb3IpO1xuICAgIHNob3dUb2FzdCgnRXJyb3IgZXhwb3J0aW5nIGRhdGEnLCAnZXJyb3InKTtcbiAgfVxufVxuXG4vKipcbiAqIEltcG9ydCBkYXRhXG4gKi9cbmZ1bmN0aW9uIGltcG9ydERhdGEoKSB7XG4gIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcbiAgaW5wdXQudHlwZSA9ICdmaWxlJztcbiAgaW5wdXQuYWNjZXB0ID0gJy5qc29uJztcblxuICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBhc3luYyAoZSkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBmaWxlID0gZS50YXJnZXQuZmlsZXNbMF07XG4gICAgICBjb25zdCB0ZXh0ID0gYXdhaXQgZmlsZS50ZXh0KCk7XG4gICAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZSh0ZXh0KTtcblxuICAgICAgLy8gVmFsaWRhdGUgYW5kIGltcG9ydFxuICAgICAgaWYgKGRhdGEucHJvZmlsZSAmJiBkYXRhLnNldHRpbmdzKSB7XG4gICAgICAgIGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICBhY3Rpb246ICdpbXBvcnREYXRhJyxcbiAgICAgICAgICBwYXlsb2FkOiBkYXRhLFxuICAgICAgICB9KTtcblxuICAgICAgICBzaG93VG9hc3QoJ0RhdGEgaW1wb3J0ZWQgc3VjY2Vzc2Z1bGx5IScsICdzdWNjZXNzJyk7XG4gICAgICAgIGxvYWRQcm9maWxlKCk7XG4gICAgICAgIGxvYWRTZXR0aW5ncygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2hvd1RvYXN0KCdJbnZhbGlkIGJhY2t1cCBmaWxlJywgJ2Vycm9yJyk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGltcG9ydGluZyBkYXRhOicsIGVycm9yKTtcbiAgICAgIHNob3dUb2FzdCgnRXJyb3IgaW1wb3J0aW5nIGRhdGEnLCAnZXJyb3InKTtcbiAgICB9XG4gIH0pO1xuXG4gIGlucHV0LmNsaWNrKCk7XG59XG5cbi8qKlxuICogQ2xlYXIgYWxsIGRhdGEgd2l0aCBjb25maXJtYXRpb25cbiAqL1xuZnVuY3Rpb24gY2xlYXJBbGxEYXRhKCkge1xuICBpZiAoY29uZmlybSgnQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSBhbGwgZGF0YT8gVGhpcyBjYW5ub3QgYmUgdW5kb25lLicpKSB7XG4gICAgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgYWN0aW9uOiAnY2xlYXJBbGxEYXRhJyxcbiAgICB9KTtcblxuICAgIHNob3dUb2FzdCgnQWxsIGRhdGEgY2xlYXJlZCEnLCAnc3VjY2VzcycpO1xuICAgIGxvYWRQcm9maWxlKCk7XG4gICAgbG9hZFNldHRpbmdzKCk7XG4gIH1cbn1cblxuLyoqXG4gKiBTaG93IHRvYXN0IG5vdGlmaWNhdGlvblxuICovXG5mdW5jdGlvbiBzaG93VG9hc3QobWVzc2FnZSwgdHlwZSA9ICdpbmZvJykge1xuICBjb25zb2xlLmxvZygnW3Nob3dUb2FzdF0gQ2FsbGVkIHdpdGg6JywgeyBtZXNzYWdlLCB0eXBlIH0pO1xuXG4gIGlmICghdG9hc3QpIHtcbiAgICBjb25zb2xlLmVycm9yKCdbc2hvd1RvYXN0XSBUb2FzdCBlbGVtZW50IG5vdCBmb3VuZCEnKTtcbiAgICBhbGVydChtZXNzYWdlKTsgLy8gXHU0RTM0XHU2NUY2XHU0RjdGXHU3NTI4IGFsZXJ0IFx1NEY1Q1x1NEUzQVx1NTQwRVx1NTkwN1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRvYXN0LnRleHRDb250ZW50ID0gbWVzc2FnZTtcbiAgdG9hc3QuY2xhc3NOYW1lID0gYHRvYXN0IHNob3cgJHt0eXBlfWA7XG5cbiAgY29uc29sZS5sb2coJ1tzaG93VG9hc3RdIFRvYXN0IGNsYXNzTmFtZTonLCB0b2FzdC5jbGFzc05hbWUpO1xuICBjb25zb2xlLmxvZygnW3Nob3dUb2FzdF0gVG9hc3Qgc3R5bGU6Jywgd2luZG93LmdldENvbXB1dGVkU3R5bGUodG9hc3QpLmRpc3BsYXkpO1xuXG4gIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgIHRvYXN0LmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3cnKTtcbiAgfSwgMzAwMCk7XG59XG5cbi8qKlxuICogRXNjYXBlIEhUTUwgdG8gcHJldmVudCBYU1NcbiAqL1xuZnVuY3Rpb24gZXNjYXBlSHRtbCh0ZXh0KSB7XG4gIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICBkaXYudGV4dENvbnRlbnQgPSB0ZXh0O1xuICByZXR1cm4gZGl2LmlubmVySFRNTDtcbn1cblxuLy8gUGxhY2Vob2xkZXIgZnVuY3Rpb25zIGZvciBlZGl0L2RlbGV0ZSBvcGVyYXRpb25zXG5mdW5jdGlvbiBlZGl0RWR1Y2F0aW9uKGlkKSB7XG4gIGNvbnNvbGUubG9nKCdFZGl0IGVkdWNhdGlvbjonLCBpZCk7XG59XG5cbmZ1bmN0aW9uIGRlbGV0ZUVkdWNhdGlvbihpZCkge1xuICBjb25zb2xlLmxvZygnRGVsZXRlIGVkdWNhdGlvbjonLCBpZCk7XG59XG5cbmZ1bmN0aW9uIGVkaXRFeHBlcmllbmNlKGlkKSB7XG4gIGNvbnNvbGUubG9nKCdFZGl0IGV4cGVyaWVuY2U6JywgaWQpO1xufVxuXG5mdW5jdGlvbiBkZWxldGVFeHBlcmllbmNlKGlkKSB7XG4gIGNvbnNvbGUubG9nKCdEZWxldGUgZXhwZXJpZW5jZTonLCBpZCk7XG59XG5cbmZ1bmN0aW9uIGVkaXRTa2lsbChpZCkge1xuICBjb25zb2xlLmxvZygnRWRpdCBza2lsbDonLCBpZCk7XG59XG5cbmZ1bmN0aW9uIGRlbGV0ZVNraWxsKGlkKSB7XG4gIGNvbnNvbGUubG9nKCdEZWxldGUgc2tpbGw6JywgaWQpO1xufVxuXG5mdW5jdGlvbiBlZGl0U3RvcnkoaWQpIHtcbiAgY29uc29sZS5sb2coJ0VkaXQgc3Rvcnk6JywgaWQpO1xufVxuXG5mdW5jdGlvbiBkZWxldGVTdG9yeShpZCkge1xuICBjb25zb2xlLmxvZygnRGVsZXRlIHN0b3J5OicsIGlkKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFNQSxJQUFJO0FBQUosSUFBYTtBQUFiLElBQTBCO0FBQzFCLElBQUk7QUFBSixJQUFrQjtBQUFsQixJQUEyQjtBQUEzQixJQUF5QztBQUF6QyxJQUFvRDtB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
