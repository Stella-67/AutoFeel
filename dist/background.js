// src/background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FC_FILL_FIELD") {
    handleFillField(message.payload).then((response) => sendResponse(response)).catch((err) => {
      console.error("AutoFeel error:", err);
      sendResponse({ status: "fail", reason: "processing_error" });
    });
    return true;
  }
  if (message.action === "getProfile") {
    chrome.storage.local.get("profile", (result) => {
      sendResponse({ success: true, data: result.profile || {} });
    });
    return true;
  }
  if (message.action === "saveProfile") {
    chrome.storage.local.set({ profile: message.payload }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.action === "getSettings") {
    chrome.storage.local.get("settings", (result) => {
      sendResponse({ success: true, data: result.settings || {} });
    });
    return true;
  }
  if (message.action === "saveLLMSettings") {
    chrome.storage.local.get("settings", (result) => {
      const settings = result.settings || {};
      settings.llm = message.payload;
      chrome.storage.local.set({ settings }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }
  if (message.action === "saveAutoFillSettings") {
    chrome.storage.local.get("settings", (result) => {
      const settings = result.settings || {};
      settings.autoFill = message.payload;
      chrome.storage.local.set({ settings }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }
  if (message.action === "saveStyleSettings") {
    chrome.storage.local.get("settings", (result) => {
      const settings = result.settings || {};
      settings.customPromptStyle = message.payload;
      chrome.storage.local.set({ settings }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }
  if (message.action === "importData") {
    const { profile, settings } = message.payload;
    chrome.storage.local.set({ profile, settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.action === "clearAllData") {
    chrome.storage.local.clear(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});
async function handleFillField(payload) {
  const { fieldDescriptor, blockSnapshot, customPrompt } = payload;
  try {
    const result = await chrome.storage.local.get(["settings", "profile"]);
    const settings = result.settings || {};
    const profile = result.profile || {};
    const llmConfig = settings.llm;
    if (llmConfig && llmConfig.apiKey) {
      const value = await generateWithLLM(fieldDescriptor, blockSnapshot, profile, llmConfig, customPrompt);
      return { status: "success", value, reason: null };
    } else {
      const value = getFallbackValue(fieldDescriptor);
      return { status: "success", value, reason: null };
    }
  } catch (error) {
    console.error("Error in handleFillField:", error);
    const value = getFallbackValue(fieldDescriptor);
    return { status: "success", value, reason: null };
  }
}
async function generateWithLLM(fieldDescriptor, blockSnapshot, profile, llmConfig, customPrompt) {
  const prompt = buildPrompt(fieldDescriptor, blockSnapshot, profile, customPrompt);
  console.log("=".repeat(80));
  console.log("\u{1F916} AutoFeel LLM Request");
  console.log("=".repeat(80));
  console.log("\u{1F4DD} Field Label:", fieldDescriptor.label);
  console.log("\u{1F4E6} Field Type:", fieldDescriptor.type);
  console.log("\u{1F527} Provider:", llmConfig.provider);
  console.log("\u{1F3AF} Model:", llmConfig.model);
  if (customPrompt) {
    console.log("\u{1F4AC} Custom Instructions:", customPrompt);
  }
  if (profile.documents && profile.documents.length > 0) {
    console.log("\u{1F4C4} Reference Documents:", profile.documents.map((d) => d.name).join(", "));
  }
  console.log("\n\u{1F4E8} Prompt sent to LLM:");
  console.log("-".repeat(80));
  console.log(prompt);
  console.log("-".repeat(80));
  console.log("\n\u23F3 Waiting for LLM response...\n");
  let response;
  if (llmConfig.provider === "openai") {
    response = await callOpenAI(prompt, llmConfig);
  } else if (llmConfig.provider === "anthropic") {
    response = await callAnthropic(prompt, llmConfig);
  } else {
    throw new Error("Unsupported LLM provider");
  }
  console.log("\u2705 LLM Response:");
  console.log("-".repeat(80));
  console.log(response);
  console.log("-".repeat(80));
  console.log("=".repeat(80) + "\n");
  return response;
}
function buildPrompt(fieldDescriptor, blockSnapshot, profile, customPrompt) {
  const label = fieldDescriptor.label || "this field";
  const currentValue = fieldDescriptor.current_value || "";
  const placeholder = fieldDescriptor.placeholder || "";
  let prompt = `You are helping fill out a form field. The field has the following information:

`;
  prompt += `Label: ${label}
`;
  prompt += `Type: ${fieldDescriptor.type}
`;
  if (placeholder)
    prompt += `Placeholder: ${placeholder}
`;
  if (currentValue)
    prompt += `Current value: ${currentValue}
`;
  if (profile.personal) {
    prompt += `
User Profile:
`;
    if (profile.personal.fullName)
      prompt += `Name: ${profile.personal.fullName}
`;
    if (profile.personal.email)
      prompt += `Email: ${profile.personal.email}
`;
    if (profile.personal.phone)
      prompt += `Phone: ${profile.personal.phone}
`;
    if (profile.personal.location)
      prompt += `Location: ${profile.personal.location}
`;
    if (profile.personal.summary)
      prompt += `Summary: ${profile.personal.summary}
`;
  }
  if (blockSnapshot && blockSnapshot.fields && blockSnapshot.fields.length > 1) {
    prompt += `
This field is part of a group of ${blockSnapshot.fields.length} fields.
`;
  }
  if (profile.documents && profile.documents.length > 0) {
    prompt += `
\u{1F4C4} Reference Documents (SOP, Essays, etc.):
`;
    profile.documents.forEach((doc) => {
      prompt += `
--- ${doc.name} ---
`;
      prompt += doc.content.substring(0, 2e3);
      if (doc.content.length > 2e3) {
        prompt += "\n... (truncated)";
      }
      prompt += "\n";
    });
  }
  if (customPrompt) {
    prompt += `
\u26A0\uFE0F IMPORTANT - User's Custom Instructions:
${customPrompt}
`;
  }
  prompt += `
Please provide ONLY the value to fill in this field. Do not include any explanation, quotes, or additional text. Just the raw value.`;
  return prompt;
}
async function callOpenAI(prompt, llmConfig) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${llmConfig.apiKey}`
    },
    body: JSON.stringify({
      model: llmConfig.model || "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 500
    })
  });
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  const data = await response.json();
  return data.choices[0].message.content.trim();
}
async function callAnthropic(prompt, llmConfig) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": llmConfig.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: llmConfig.model || "claude-3-5-sonnet-20241022",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }
  const data = await response.json();
  return data.content[0].text.trim();
}
function getFallbackValue(fieldDescriptor) {
  const label = (fieldDescriptor.label || "").toLowerCase();
  const type = fieldDescriptor.type;
  if (label.includes("first name") || label.includes("\u540D\u5B57") || label.includes("firstname")) {
    return "Shiqi";
  } else if (label.includes("last name") || label.includes("\u59D3") || label.includes("lastname")) {
    return "Liu";
  } else if (label.includes("email") || label.includes("\u90AE\u7BB1")) {
    return "shiqi.liu@example.com";
  } else if (label.includes("phone") || label.includes("\u7535\u8BDD")) {
    return "+1 (555) 123-4567";
  } else if (label.includes("address") || label.includes("\u5730\u5740")) {
    return "123 Main Street";
  } else if (label.includes("city") || label.includes("\u57CE\u5E02")) {
    return "San Francisco";
  } else if (label.includes("state") || label.includes("\u5DDE")) {
    return "CA";
  } else if (label.includes("zip") || label.includes("\u90AE\u7F16")) {
    return "94105";
  } else if (label.includes("company") || label.includes("\u516C\u53F8")) {
    return "Tech Company Inc.";
  } else if (type === "textarea" || label.includes("message") || label.includes("comment")) {
    return "This is a demo message filled by AutoFeel extension.";
  } else {
    return "AutoFeel Demo Value";
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2JhY2tncm91bmQuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigobWVzc2FnZSwgc2VuZGVyLCBzZW5kUmVzcG9uc2UpID0+IHtcbiAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gJ0ZDX0ZJTExfRklFTEQnKSB7XG4gICAgaGFuZGxlRmlsbEZpZWxkKG1lc3NhZ2UucGF5bG9hZClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHNlbmRSZXNwb25zZShyZXNwb25zZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkF1dG9GZWVsIGVycm9yOlwiLCBlcnIpO1xuICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6ICdmYWlsJywgcmVhc29uOiAncHJvY2Vzc2luZ19lcnJvcicgfSk7XG4gICAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChtZXNzYWdlLmFjdGlvbiA9PT0gJ2dldFByb2ZpbGUnKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KCdwcm9maWxlJywgKHJlc3VsdCkgPT4ge1xuICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogcmVzdWx0LnByb2ZpbGUgfHwge30gfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAobWVzc2FnZS5hY3Rpb24gPT09ICdzYXZlUHJvZmlsZScpIHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcm9maWxlOiBtZXNzYWdlLnBheWxvYWQgfSwgKCkgPT4ge1xuICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChtZXNzYWdlLmFjdGlvbiA9PT0gJ2dldFNldHRpbmdzJykge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldCgnc2V0dGluZ3MnLCAocmVzdWx0KSA9PiB7XG4gICAgICBzZW5kUmVzcG9uc2UoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiByZXN1bHQuc2V0dGluZ3MgfHwge30gfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAobWVzc2FnZS5hY3Rpb24gPT09ICdzYXZlTExNU2V0dGluZ3MnKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KCdzZXR0aW5ncycsIChyZXN1bHQpID0+IHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gcmVzdWx0LnNldHRpbmdzIHx8IHt9O1xuICAgICAgc2V0dGluZ3MubGxtID0gbWVzc2FnZS5wYXlsb2FkO1xuICAgICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgc2V0dGluZ3MgfSwgKCkgPT4ge1xuICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdWNjZXNzOiB0cnVlIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAobWVzc2FnZS5hY3Rpb24gPT09ICdzYXZlQXV0b0ZpbGxTZXR0aW5ncycpIHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoJ3NldHRpbmdzJywgKHJlc3VsdCkgPT4ge1xuICAgICAgY29uc3Qgc2V0dGluZ3MgPSByZXN1bHQuc2V0dGluZ3MgfHwge307XG4gICAgICBzZXR0aW5ncy5hdXRvRmlsbCA9IG1lc3NhZ2UucGF5bG9hZDtcbiAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHNldHRpbmdzIH0sICgpID0+IHtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKG1lc3NhZ2UuYWN0aW9uID09PSAnc2F2ZVN0eWxlU2V0dGluZ3MnKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KCdzZXR0aW5ncycsIChyZXN1bHQpID0+IHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gcmVzdWx0LnNldHRpbmdzIHx8IHt9O1xuICAgICAgc2V0dGluZ3MuY3VzdG9tUHJvbXB0U3R5bGUgPSBtZXNzYWdlLnBheWxvYWQ7XG4gICAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBzZXR0aW5ncyB9LCAoKSA9PiB7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChtZXNzYWdlLmFjdGlvbiA9PT0gJ2ltcG9ydERhdGEnKSB7XG4gICAgY29uc3QgeyBwcm9maWxlLCBzZXR0aW5ncyB9ID0gbWVzc2FnZS5wYXlsb2FkO1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByb2ZpbGUsIHNldHRpbmdzIH0sICgpID0+IHtcbiAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUgfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAobWVzc2FnZS5hY3Rpb24gPT09ICdjbGVhckFsbERhdGEnKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuY2xlYXIoKCkgPT4ge1xuICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUZpbGxGaWVsZChwYXlsb2FkKSB7XG4gIGNvbnN0IHsgZmllbGREZXNjcmlwdG9yLCBibG9ja1NuYXBzaG90LCBjdXN0b21Qcm9tcHQgfSA9IHBheWxvYWQ7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoWydzZXR0aW5ncycsICdwcm9maWxlJ10pO1xuICAgIGNvbnN0IHNldHRpbmdzID0gcmVzdWx0LnNldHRpbmdzIHx8IHt9O1xuICAgIGNvbnN0IHByb2ZpbGUgPSByZXN1bHQucHJvZmlsZSB8fCB7fTtcbiAgICBjb25zdCBsbG1Db25maWcgPSBzZXR0aW5ncy5sbG07XG5cbiAgICBpZiAobGxtQ29uZmlnICYmIGxsbUNvbmZpZy5hcGlLZXkpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gYXdhaXQgZ2VuZXJhdGVXaXRoTExNKGZpZWxkRGVzY3JpcHRvciwgYmxvY2tTbmFwc2hvdCwgcHJvZmlsZSwgbGxtQ29uZmlnLCBjdXN0b21Qcm9tcHQpO1xuICAgICAgcmV0dXJuIHsgc3RhdHVzOiAnc3VjY2VzcycsIHZhbHVlLCByZWFzb246IG51bGwgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgdmFsdWUgPSBnZXRGYWxsYmFja1ZhbHVlKGZpZWxkRGVzY3JpcHRvcik7XG4gICAgICByZXR1cm4geyBzdGF0dXM6ICdzdWNjZXNzJywgdmFsdWUsIHJlYXNvbjogbnVsbCB9O1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiBoYW5kbGVGaWxsRmllbGQ6JywgZXJyb3IpO1xuICAgIGNvbnN0IHZhbHVlID0gZ2V0RmFsbGJhY2tWYWx1ZShmaWVsZERlc2NyaXB0b3IpO1xuICAgIHJldHVybiB7IHN0YXR1czogJ3N1Y2Nlc3MnLCB2YWx1ZSwgcmVhc29uOiBudWxsIH07XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVXaXRoTExNKGZpZWxkRGVzY3JpcHRvciwgYmxvY2tTbmFwc2hvdCwgcHJvZmlsZSwgbGxtQ29uZmlnLCBjdXN0b21Qcm9tcHQpIHtcbiAgY29uc3QgcHJvbXB0ID0gYnVpbGRQcm9tcHQoZmllbGREZXNjcmlwdG9yLCBibG9ja1NuYXBzaG90LCBwcm9maWxlLCBjdXN0b21Qcm9tcHQpO1xuXG4gIGNvbnNvbGUubG9nKCc9Jy5yZXBlYXQoODApKTtcbiAgY29uc29sZS5sb2coJ1x1RDgzRVx1REQxNiBBdXRvRmVlbCBMTE0gUmVxdWVzdCcpO1xuICBjb25zb2xlLmxvZygnPScucmVwZWF0KDgwKSk7XG4gIGNvbnNvbGUubG9nKCdcdUQ4M0RcdURDREQgRmllbGQgTGFiZWw6JywgZmllbGREZXNjcmlwdG9yLmxhYmVsKTtcbiAgY29uc29sZS5sb2coJ1x1RDgzRFx1RENFNiBGaWVsZCBUeXBlOicsIGZpZWxkRGVzY3JpcHRvci50eXBlKTtcbiAgY29uc29sZS5sb2coJ1x1RDgzRFx1REQyNyBQcm92aWRlcjonLCBsbG1Db25maWcucHJvdmlkZXIpO1xuICBjb25zb2xlLmxvZygnXHVEODNDXHVERkFGIE1vZGVsOicsIGxsbUNvbmZpZy5tb2RlbCk7XG4gIGlmIChjdXN0b21Qcm9tcHQpIHtcbiAgICBjb25zb2xlLmxvZygnXHVEODNEXHVEQ0FDIEN1c3RvbSBJbnN0cnVjdGlvbnM6JywgY3VzdG9tUHJvbXB0KTtcbiAgfVxuICBpZiAocHJvZmlsZS5kb2N1bWVudHMgJiYgcHJvZmlsZS5kb2N1bWVudHMubGVuZ3RoID4gMCkge1xuICAgIGNvbnNvbGUubG9nKCdcdUQ4M0RcdURDQzQgUmVmZXJlbmNlIERvY3VtZW50czonLCBwcm9maWxlLmRvY3VtZW50cy5tYXAoZCA9PiBkLm5hbWUpLmpvaW4oJywgJykpO1xuICB9XG4gIGNvbnNvbGUubG9nKCdcXG5cdUQ4M0RcdURDRTggUHJvbXB0IHNlbnQgdG8gTExNOicpO1xuICBjb25zb2xlLmxvZygnLScucmVwZWF0KDgwKSk7XG4gIGNvbnNvbGUubG9nKHByb21wdCk7XG4gIGNvbnNvbGUubG9nKCctJy5yZXBlYXQoODApKTtcbiAgY29uc29sZS5sb2coJ1xcblx1MjNGMyBXYWl0aW5nIGZvciBMTE0gcmVzcG9uc2UuLi5cXG4nKTtcblxuICBsZXQgcmVzcG9uc2U7XG4gIGlmIChsbG1Db25maWcucHJvdmlkZXIgPT09ICdvcGVuYWknKSB7XG4gICAgcmVzcG9uc2UgPSBhd2FpdCBjYWxsT3BlbkFJKHByb21wdCwgbGxtQ29uZmlnKTtcbiAgfSBlbHNlIGlmIChsbG1Db25maWcucHJvdmlkZXIgPT09ICdhbnRocm9waWMnKSB7XG4gICAgcmVzcG9uc2UgPSBhd2FpdCBjYWxsQW50aHJvcGljKHByb21wdCwgbGxtQ29uZmlnKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIExMTSBwcm92aWRlcicpO1xuICB9XG5cbiAgY29uc29sZS5sb2coJ1x1MjcwNSBMTE0gUmVzcG9uc2U6Jyk7XG4gIGNvbnNvbGUubG9nKCctJy5yZXBlYXQoODApKTtcbiAgY29uc29sZS5sb2cocmVzcG9uc2UpO1xuICBjb25zb2xlLmxvZygnLScucmVwZWF0KDgwKSk7XG4gIGNvbnNvbGUubG9nKCc9Jy5yZXBlYXQoODApICsgJ1xcbicpO1xuXG4gIHJldHVybiByZXNwb25zZTtcbn1cblxuZnVuY3Rpb24gYnVpbGRQcm9tcHQoZmllbGREZXNjcmlwdG9yLCBibG9ja1NuYXBzaG90LCBwcm9maWxlLCBjdXN0b21Qcm9tcHQpIHtcbiAgY29uc3QgbGFiZWwgPSBmaWVsZERlc2NyaXB0b3IubGFiZWwgfHwgJ3RoaXMgZmllbGQnO1xuICBjb25zdCBjdXJyZW50VmFsdWUgPSBmaWVsZERlc2NyaXB0b3IuY3VycmVudF92YWx1ZSB8fCAnJztcbiAgY29uc3QgcGxhY2Vob2xkZXIgPSBmaWVsZERlc2NyaXB0b3IucGxhY2Vob2xkZXIgfHwgJyc7XG5cbiAgbGV0IHByb21wdCA9IGBZb3UgYXJlIGhlbHBpbmcgZmlsbCBvdXQgYSBmb3JtIGZpZWxkLiBUaGUgZmllbGQgaGFzIHRoZSBmb2xsb3dpbmcgaW5mb3JtYXRpb246XFxuXFxuYDtcbiAgcHJvbXB0ICs9IGBMYWJlbDogJHtsYWJlbH1cXG5gO1xuICBwcm9tcHQgKz0gYFR5cGU6ICR7ZmllbGREZXNjcmlwdG9yLnR5cGV9XFxuYDtcbiAgaWYgKHBsYWNlaG9sZGVyKSBwcm9tcHQgKz0gYFBsYWNlaG9sZGVyOiAke3BsYWNlaG9sZGVyfVxcbmA7XG4gIGlmIChjdXJyZW50VmFsdWUpIHByb21wdCArPSBgQ3VycmVudCB2YWx1ZTogJHtjdXJyZW50VmFsdWV9XFxuYDtcblxuICBpZiAocHJvZmlsZS5wZXJzb25hbCkge1xuICAgIHByb21wdCArPSBgXFxuVXNlciBQcm9maWxlOlxcbmA7XG4gICAgaWYgKHByb2ZpbGUucGVyc29uYWwuZnVsbE5hbWUpIHByb21wdCArPSBgTmFtZTogJHtwcm9maWxlLnBlcnNvbmFsLmZ1bGxOYW1lfVxcbmA7XG4gICAgaWYgKHByb2ZpbGUucGVyc29uYWwuZW1haWwpIHByb21wdCArPSBgRW1haWw6ICR7cHJvZmlsZS5wZXJzb25hbC5lbWFpbH1cXG5gO1xuICAgIGlmIChwcm9maWxlLnBlcnNvbmFsLnBob25lKSBwcm9tcHQgKz0gYFBob25lOiAke3Byb2ZpbGUucGVyc29uYWwucGhvbmV9XFxuYDtcbiAgICBpZiAocHJvZmlsZS5wZXJzb25hbC5sb2NhdGlvbikgcHJvbXB0ICs9IGBMb2NhdGlvbjogJHtwcm9maWxlLnBlcnNvbmFsLmxvY2F0aW9ufVxcbmA7XG4gICAgaWYgKHByb2ZpbGUucGVyc29uYWwuc3VtbWFyeSkgcHJvbXB0ICs9IGBTdW1tYXJ5OiAke3Byb2ZpbGUucGVyc29uYWwuc3VtbWFyeX1cXG5gO1xuICB9XG5cbiAgaWYgKGJsb2NrU25hcHNob3QgJiYgYmxvY2tTbmFwc2hvdC5maWVsZHMgJiYgYmxvY2tTbmFwc2hvdC5maWVsZHMubGVuZ3RoID4gMSkge1xuICAgIHByb21wdCArPSBgXFxuVGhpcyBmaWVsZCBpcyBwYXJ0IG9mIGEgZ3JvdXAgb2YgJHtibG9ja1NuYXBzaG90LmZpZWxkcy5sZW5ndGh9IGZpZWxkcy5cXG5gO1xuICB9XG5cbiAgaWYgKHByb2ZpbGUuZG9jdW1lbnRzICYmIHByb2ZpbGUuZG9jdW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICBwcm9tcHQgKz0gYFxcblx1RDgzRFx1RENDNCBSZWZlcmVuY2UgRG9jdW1lbnRzIChTT1AsIEVzc2F5cywgZXRjLik6XFxuYDtcbiAgICBwcm9maWxlLmRvY3VtZW50cy5mb3JFYWNoKGRvYyA9PiB7XG4gICAgICBwcm9tcHQgKz0gYFxcbi0tLSAke2RvYy5uYW1lfSAtLS1cXG5gO1xuICAgICAgcHJvbXB0ICs9IGRvYy5jb250ZW50LnN1YnN0cmluZygwLCAyMDAwKTtcbiAgICAgIGlmIChkb2MuY29udGVudC5sZW5ndGggPiAyMDAwKSB7XG4gICAgICAgIHByb21wdCArPSAnXFxuLi4uICh0cnVuY2F0ZWQpJztcbiAgICAgIH1cbiAgICAgIHByb21wdCArPSAnXFxuJztcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChjdXN0b21Qcm9tcHQpIHtcbiAgICBwcm9tcHQgKz0gYFxcblx1MjZBMFx1RkUwRiBJTVBPUlRBTlQgLSBVc2VyJ3MgQ3VzdG9tIEluc3RydWN0aW9uczpcXG4ke2N1c3RvbVByb21wdH1cXG5gO1xuICB9XG5cbiAgcHJvbXB0ICs9IGBcXG5QbGVhc2UgcHJvdmlkZSBPTkxZIHRoZSB2YWx1ZSB0byBmaWxsIGluIHRoaXMgZmllbGQuIERvIG5vdCBpbmNsdWRlIGFueSBleHBsYW5hdGlvbiwgcXVvdGVzLCBvciBhZGRpdGlvbmFsIHRleHQuIEp1c3QgdGhlIHJhdyB2YWx1ZS5gO1xuXG4gIHJldHVybiBwcm9tcHQ7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNhbGxPcGVuQUkocHJvbXB0LCBsbG1Db25maWcpIHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS92MS9jaGF0L2NvbXBsZXRpb25zJywge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtsbG1Db25maWcuYXBpS2V5fWBcbiAgICB9LFxuICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIG1vZGVsOiBsbG1Db25maWcubW9kZWwgfHwgJ2dwdC00JyxcbiAgICAgIG1lc3NhZ2VzOiBbeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6IHByb21wdCB9XSxcbiAgICAgIHRlbXBlcmF0dXJlOiAwLjcsXG4gICAgICBtYXhfdG9rZW5zOiA1MDBcbiAgICB9KVxuICB9KTtcblxuICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBPcGVuQUkgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgfVxuXG4gIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gIHJldHVybiBkYXRhLmNob2ljZXNbMF0ubWVzc2FnZS5jb250ZW50LnRyaW0oKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY2FsbEFudGhyb3BpYyhwcm9tcHQsIGxsbUNvbmZpZykge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdodHRwczovL2FwaS5hbnRocm9waWMuY29tL3YxL21lc3NhZ2VzJywge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAneC1hcGkta2V5JzogbGxtQ29uZmlnLmFwaUtleSxcbiAgICAgICdhbnRocm9waWMtdmVyc2lvbic6ICcyMDIzLTA2LTAxJ1xuICAgIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgbW9kZWw6IGxsbUNvbmZpZy5tb2RlbCB8fCAnY2xhdWRlLTMtNS1zb25uZXQtMjAyNDEwMjInLFxuICAgICAgbWF4X3Rva2VuczogNTAwLFxuICAgICAgbWVzc2FnZXM6IFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogcHJvbXB0IH1dXG4gICAgfSlcbiAgfSk7XG5cbiAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgIHRocm93IG5ldyBFcnJvcihgQW50aHJvcGljIEFQSSBlcnJvcjogJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gIH1cblxuICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICByZXR1cm4gZGF0YS5jb250ZW50WzBdLnRleHQudHJpbSgpO1xufVxuXG5mdW5jdGlvbiBnZXRGYWxsYmFja1ZhbHVlKGZpZWxkRGVzY3JpcHRvcikge1xuICBjb25zdCBsYWJlbCA9IChmaWVsZERlc2NyaXB0b3IubGFiZWwgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gIGNvbnN0IHR5cGUgPSBmaWVsZERlc2NyaXB0b3IudHlwZTtcblxuICBpZiAobGFiZWwuaW5jbHVkZXMoJ2ZpcnN0IG5hbWUnKSB8fCBsYWJlbC5pbmNsdWRlcygnXHU1NDBEXHU1QjU3JykgfHwgbGFiZWwuaW5jbHVkZXMoJ2ZpcnN0bmFtZScpKSB7XG4gICAgcmV0dXJuICdTaGlxaSc7XG4gIH0gZWxzZSBpZiAobGFiZWwuaW5jbHVkZXMoJ2xhc3QgbmFtZScpIHx8IGxhYmVsLmluY2x1ZGVzKCdcdTU5RDMnKSB8fCBsYWJlbC5pbmNsdWRlcygnbGFzdG5hbWUnKSkge1xuICAgIHJldHVybiAnTGl1JztcbiAgfSBlbHNlIGlmIChsYWJlbC5pbmNsdWRlcygnZW1haWwnKSB8fCBsYWJlbC5pbmNsdWRlcygnXHU5MEFFXHU3QkIxJykpIHtcbiAgICByZXR1cm4gJ3NoaXFpLmxpdUBleGFtcGxlLmNvbSc7XG4gIH0gZWxzZSBpZiAobGFiZWwuaW5jbHVkZXMoJ3Bob25lJykgfHwgbGFiZWwuaW5jbHVkZXMoJ1x1NzUzNVx1OEJERCcpKSB7XG4gICAgcmV0dXJuICcrMSAoNTU1KSAxMjMtNDU2Nyc7XG4gIH0gZWxzZSBpZiAobGFiZWwuaW5jbHVkZXMoJ2FkZHJlc3MnKSB8fCBsYWJlbC5pbmNsdWRlcygnXHU1NzMwXHU1NzQwJykpIHtcbiAgICByZXR1cm4gJzEyMyBNYWluIFN0cmVldCc7XG4gIH0gZWxzZSBpZiAobGFiZWwuaW5jbHVkZXMoJ2NpdHknKSB8fCBsYWJlbC5pbmNsdWRlcygnXHU1N0NFXHU1RTAyJykpIHtcbiAgICByZXR1cm4gJ1NhbiBGcmFuY2lzY28nO1xuICB9IGVsc2UgaWYgKGxhYmVsLmluY2x1ZGVzKCdzdGF0ZScpIHx8IGxhYmVsLmluY2x1ZGVzKCdcdTVEREUnKSkge1xuICAgIHJldHVybiAnQ0EnO1xuICB9IGVsc2UgaWYgKGxhYmVsLmluY2x1ZGVzKCd6aXAnKSB8fCBsYWJlbC5pbmNsdWRlcygnXHU5MEFFXHU3RjE2JykpIHtcbiAgICByZXR1cm4gJzk0MTA1JztcbiAgfSBlbHNlIGlmIChsYWJlbC5pbmNsdWRlcygnY29tcGFueScpIHx8IGxhYmVsLmluY2x1ZGVzKCdcdTUxNkNcdTUzRjgnKSkge1xuICAgIHJldHVybiAnVGVjaCBDb21wYW55IEluYy4nO1xuICB9IGVsc2UgaWYgKHR5cGUgPT09ICd0ZXh0YXJlYScgfHwgbGFiZWwuaW5jbHVkZXMoJ21lc3NhZ2UnKSB8fCBsYWJlbC5pbmNsdWRlcygnY29tbWVudCcpKSB7XG4gICAgcmV0dXJuICdUaGlzIGlzIGEgZGVtbyBtZXNzYWdlIGZpbGxlZCBieSBBdXRvRmVlbCBleHRlbnNpb24uJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gJ0F1dG9GZWVsIERlbW8gVmFsdWUnO1xuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsT0FBTyxRQUFRLFVBQVUsWUFBWSxDQUFDLFNBQVMsUUFBUSxpQkFBaUI7QUFDdEUsTUFBSSxRQUFRLFNBQVMsaUJBQWlCO0FBQ3BDLG9CQUFnQixRQUFRLE9BQU8sRUFDNUIsS0FBSyxjQUFZLGFBQWEsUUFBUSxDQUFDLEVBQ3ZDLE1BQU0sU0FBTztBQUNaLGNBQVEsTUFBTSxtQkFBbUIsR0FBRztBQUNwQyxtQkFBYSxFQUFFLFFBQVEsUUFBUSxRQUFRLG1CQUFtQixDQUFDO0FBQUEsSUFDN0QsQ0FBQztBQUNILFdBQU87QUFBQSxFQUNUO0FBRUEsTUFBSSxRQUFRLFdBQVcsY0FBYztBQUNuQyxXQUFPLFFBQVEsTUFBTSxJQUFJLFdBQVcsQ0FBQyxXQUFXO0FBQzlDLG1CQUFhLEVBQUUsU0FBUyxNQUFNLE1BQU0sT0FBTyxXQUFXLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDNUQsQ0FBQztBQUNELFdBQU87QUFBQSxFQUNUO0FBRUEsTUFBSSxRQUFRLFdBQVcsZUFB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
