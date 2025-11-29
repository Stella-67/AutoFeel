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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2JhY2tncm91bmQuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigobWVzc2FnZSwgc2VuZGVyLCBzZW5kUmVzcG9uc2UpID0+IHtcbiAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gJ0ZDX0ZJTExfRklFTEQnKSB7XG4gICAgaGFuZGxlRmlsbEZpZWxkKG1lc3NhZ2UucGF5bG9hZClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHNlbmRSZXNwb25zZShyZXNwb25zZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkF1dG9GZWVsIGVycm9yOlwiLCBlcnIpO1xuICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6ICdmYWlsJywgcmVhc29uOiAncHJvY2Vzc2luZ19lcnJvcicgfSk7XG4gICAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChtZXNzYWdlLmFjdGlvbiA9PT0gJ2dldFByb2ZpbGUnKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KCdwcm9maWxlJywgKHJlc3VsdCkgPT4ge1xuICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogcmVzdWx0LnByb2ZpbGUgfHwge30gfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAobWVzc2FnZS5hY3Rpb24gPT09ICdzYXZlUHJvZmlsZScpIHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcm9maWxlOiBtZXNzYWdlLnBheWxvYWQgfSwgKCkgPT4ge1xuICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChtZXNzYWdlLmFjdGlvbiA9PT0gJ2dldFNldHRpbmdzJykge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldCgnc2V0dGluZ3MnLCAocmVzdWx0KSA9PiB7XG4gICAgICBzZW5kUmVzcG9uc2UoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiByZXN1bHQuc2V0dGluZ3MgfHwge30gfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAobWVzc2FnZS5hY3Rpb24gPT09ICdzYXZlTExNU2V0dGluZ3MnKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KCdzZXR0aW5ncycsIChyZXN1bHQpID0+IHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gcmVzdWx0LnNldHRpbmdzIHx8IHt9O1xuICAgICAgc2V0dGluZ3MubGxtID0gbWVzc2FnZS5wYXlsb2FkO1xuICAgICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgc2V0dGluZ3MgfSwgKCkgPT4ge1xuICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdWNjZXNzOiB0cnVlIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAobWVzc2FnZS5hY3Rpb24gPT09ICdzYXZlQXV0b0ZpbGxTZXR0aW5ncycpIHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoJ3NldHRpbmdzJywgKHJlc3VsdCkgPT4ge1xuICAgICAgY29uc3Qgc2V0dGluZ3MgPSByZXN1bHQuc2V0dGluZ3MgfHwge307XG4gICAgICBzZXR0aW5ncy5hdXRvRmlsbCA9IG1lc3NhZ2UucGF5bG9hZDtcbiAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHNldHRpbmdzIH0sICgpID0+IHtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKG1lc3NhZ2UuYWN0aW9uID09PSAnc2F2ZVN0eWxlU2V0dGluZ3MnKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KCdzZXR0aW5ncycsIChyZXN1bHQpID0+IHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gcmVzdWx0LnNldHRpbmdzIHx8IHt9O1xuICAgICAgc2V0dGluZ3MuY3VzdG9tUHJvbXB0U3R5bGUgPSBtZXNzYWdlLnBheWxvYWQ7XG4gICAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBzZXR0aW5ncyB9LCAoKSA9PiB7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChtZXNzYWdlLmFjdGlvbiA9PT0gJ2ltcG9ydERhdGEnKSB7XG4gICAgY29uc3QgeyBwcm9maWxlLCBzZXR0aW5ncyB9ID0gbWVzc2FnZS5wYXlsb2FkO1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByb2ZpbGUsIHNldHRpbmdzIH0sICgpID0+IHtcbiAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUgfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAobWVzc2FnZS5hY3Rpb24gPT09ICdjbGVhckFsbERhdGEnKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuY2xlYXIoKCkgPT4ge1xuICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUZpbGxGaWVsZChwYXlsb2FkKSB7XG4gIGNvbnN0IHsgZmllbGREZXNjcmlwdG9yLCBibG9ja1NuYXBzaG90LCBjdXN0b21Qcm9tcHQgfSA9IHBheWxvYWQ7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoWydzZXR0aW5ncycsICdwcm9maWxlJ10pO1xuICAgIGNvbnN0IHNldHRpbmdzID0gcmVzdWx0LnNldHRpbmdzIHx8IHt9O1xuICAgIGNvbnN0IHByb2ZpbGUgPSByZXN1bHQucHJvZmlsZSB8fCB7fTtcbiAgICBjb25zdCBsbG1Db25maWcgPSBzZXR0aW5ncy5sbG07XG5cbiAgICBpZiAobGxtQ29uZmlnICYmIGxsbUNvbmZpZy5hcGlLZXkpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gYXdhaXQgZ2VuZXJhdGVXaXRoTExNKGZpZWxkRGVzY3JpcHRvciwgYmxvY2tTbmFwc2hvdCwgcHJvZmlsZSwgbGxtQ29uZmlnLCBjdXN0b21Qcm9tcHQpO1xuICAgICAgcmV0dXJuIHsgc3RhdHVzOiAnc3VjY2VzcycsIHZhbHVlLCByZWFzb246IG51bGwgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgdmFsdWUgPSBnZXRGYWxsYmFja1ZhbHVlKGZpZWxkRGVzY3JpcHRvcik7XG4gICAgICByZXR1cm4geyBzdGF0dXM6ICdzdWNjZXNzJywgdmFsdWUsIHJlYXNvbjogbnVsbCB9O1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiBoYW5kbGVGaWxsRmllbGQ6JywgZXJyb3IpO1xuICAgIGNvbnN0IHZhbHVlID0gZ2V0RmFsbGJhY2tWYWx1ZShmaWVsZERlc2NyaXB0b3IpO1xuICAgIHJldHVybiB7IHN0YXR1czogJ3N1Y2Nlc3MnLCB2YWx1ZSwgcmVhc29uOiBudWxsIH07XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVXaXRoTExNKGZpZWxkRGVzY3JpcHRvciwgYmxvY2tTbmFwc2hvdCwgcHJvZmlsZSwgbGxtQ29uZmlnLCBjdXN0b21Qcm9tcHQpIHtcbiAgY29uc3QgcHJvbXB0ID0gYnVpbGRQcm9tcHQoZmllbGREZXNjcmlwdG9yLCBibG9ja1NuYXBzaG90LCBwcm9maWxlLCBjdXN0b21Qcm9tcHQpO1xuXG4gIGNvbnNvbGUubG9nKCc9Jy5yZXBlYXQoODApKTtcbiAgY29uc29sZS5sb2coJ1x1RDgzRVx1REQxNiBBdXRvRmVlbCBMTE0gUmVxdWVzdCcpO1xuICBjb25zb2xlLmxvZygnPScucmVwZWF0KDgwKSk7XG4gIGNvbnNvbGUubG9nKCdcdUQ4M0RcdURDREQgRmllbGQgTGFiZWw6JywgZmllbGREZXNjcmlwdG9yLmxhYmVsKTtcbiAgY29uc29sZS5sb2coJ1x1RDgzRFx1RENFNiBGaWVsZCBUeXBlOicsIGZpZWxkRGVzY3JpcHRvci50eXBlKTtcbiAgY29uc29sZS5sb2coJ1x1RDgzRFx1REQyNyBQcm92aWRlcjonLCBsbG1Db25maWcucHJvdmlkZXIpO1xuICBjb25zb2xlLmxvZygnXHVEODNDXHVERkFGIE1vZGVsOicsIGxsbUNvbmZpZy5tb2RlbCk7XG4gIGlmIChjdXN0b21Qcm9tcHQpIHtcbiAgICBjb25zb2xlLmxvZygnXHVEODNEXHVEQ0FDIEN1c3RvbSBJbnN0cnVjdGlvbnM6JywgY3VzdG9tUHJvbXB0KTtcbiAgfVxuICBjb25zb2xlLmxvZygnXFxuXHVEODNEXHVEQ0U4IFByb21wdCBzZW50IHRvIExMTTonKTtcbiAgY29uc29sZS5sb2coJy0nLnJlcGVhdCg4MCkpO1xuICBjb25zb2xlLmxvZyhwcm9tcHQpO1xuICBjb25zb2xlLmxvZygnLScucmVwZWF0KDgwKSk7XG4gIGNvbnNvbGUubG9nKCdcXG5cdTIzRjMgV2FpdGluZyBmb3IgTExNIHJlc3BvbnNlLi4uXFxuJyk7XG5cbiAgbGV0IHJlc3BvbnNlO1xuICBpZiAobGxtQ29uZmlnLnByb3ZpZGVyID09PSAnb3BlbmFpJykge1xuICAgIHJlc3BvbnNlID0gYXdhaXQgY2FsbE9wZW5BSShwcm9tcHQsIGxsbUNvbmZpZyk7XG4gIH0gZWxzZSBpZiAobGxtQ29uZmlnLnByb3ZpZGVyID09PSAnYW50aHJvcGljJykge1xuICAgIHJlc3BvbnNlID0gYXdhaXQgY2FsbEFudGhyb3BpYyhwcm9tcHQsIGxsbUNvbmZpZyk7XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBMTE0gcHJvdmlkZXInKTtcbiAgfVxuXG4gIGNvbnNvbGUubG9nKCdcdTI3MDUgTExNIFJlc3BvbnNlOicpO1xuICBjb25zb2xlLmxvZygnLScucmVwZWF0KDgwKSk7XG4gIGNvbnNvbGUubG9nKHJlc3BvbnNlKTtcbiAgY29uc29sZS5sb2coJy0nLnJlcGVhdCg4MCkpO1xuICBjb25zb2xlLmxvZygnPScucmVwZWF0KDgwKSArICdcXG4nKTtcblxuICByZXR1cm4gcmVzcG9uc2U7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkUHJvbXB0KGZpZWxkRGVzY3JpcHRvciwgYmxvY2tTbmFwc2hvdCwgcHJvZmlsZSwgY3VzdG9tUHJvbXB0KSB7XG4gIGNvbnN0IGxhYmVsID0gZmllbGREZXNjcmlwdG9yLmxhYmVsIHx8ICd0aGlzIGZpZWxkJztcbiAgY29uc3QgY3VycmVudFZhbHVlID0gZmllbGREZXNjcmlwdG9yLmN1cnJlbnRfdmFsdWUgfHwgJyc7XG4gIGNvbnN0IHBsYWNlaG9sZGVyID0gZmllbGREZXNjcmlwdG9yLnBsYWNlaG9sZGVyIHx8ICcnO1xuXG4gIGxldCBwcm9tcHQgPSBgWW91IGFyZSBoZWxwaW5nIGZpbGwgb3V0IGEgZm9ybSBmaWVsZC4gVGhlIGZpZWxkIGhhcyB0aGUgZm9sbG93aW5nIGluZm9ybWF0aW9uOlxcblxcbmA7XG4gIHByb21wdCArPSBgTGFiZWw6ICR7bGFiZWx9XFxuYDtcbiAgcHJvbXB0ICs9IGBUeXBlOiAke2ZpZWxkRGVzY3JpcHRvci50eXBlfVxcbmA7XG4gIGlmIChwbGFjZWhvbGRlcikgcHJvbXB0ICs9IGBQbGFjZWhvbGRlcjogJHtwbGFjZWhvbGRlcn1cXG5gO1xuICBpZiAoY3VycmVudFZhbHVlKSBwcm9tcHQgKz0gYEN1cnJlbnQgdmFsdWU6ICR7Y3VycmVudFZhbHVlfVxcbmA7XG5cbiAgaWYgKHByb2ZpbGUucGVyc29uYWwpIHtcbiAgICBwcm9tcHQgKz0gYFxcblVzZXIgUHJvZmlsZTpcXG5gO1xuICAgIGlmIChwcm9maWxlLnBlcnNvbmFsLmZ1bGxOYW1lKSBwcm9tcHQgKz0gYE5hbWU6ICR7cHJvZmlsZS5wZXJzb25hbC5mdWxsTmFtZX1cXG5gO1xuICAgIGlmIChwcm9maWxlLnBlcnNvbmFsLmVtYWlsKSBwcm9tcHQgKz0gYEVtYWlsOiAke3Byb2ZpbGUucGVyc29uYWwuZW1haWx9XFxuYDtcbiAgICBpZiAocHJvZmlsZS5wZXJzb25hbC5waG9uZSkgcHJvbXB0ICs9IGBQaG9uZTogJHtwcm9maWxlLnBlcnNvbmFsLnBob25lfVxcbmA7XG4gICAgaWYgKHByb2ZpbGUucGVyc29uYWwubG9jYXRpb24pIHByb21wdCArPSBgTG9jYXRpb246ICR7cHJvZmlsZS5wZXJzb25hbC5sb2NhdGlvbn1cXG5gO1xuICAgIGlmIChwcm9maWxlLnBlcnNvbmFsLnN1bW1hcnkpIHByb21wdCArPSBgU3VtbWFyeTogJHtwcm9maWxlLnBlcnNvbmFsLnN1bW1hcnl9XFxuYDtcbiAgfVxuXG4gIGlmIChibG9ja1NuYXBzaG90ICYmIGJsb2NrU25hcHNob3QuZmllbGRzICYmIGJsb2NrU25hcHNob3QuZmllbGRzLmxlbmd0aCA+IDEpIHtcbiAgICBwcm9tcHQgKz0gYFxcblRoaXMgZmllbGQgaXMgcGFydCBvZiBhIGdyb3VwIG9mICR7YmxvY2tTbmFwc2hvdC5maWVsZHMubGVuZ3RofSBmaWVsZHMuXFxuYDtcbiAgfVxuXG4gIGlmIChjdXN0b21Qcm9tcHQpIHtcbiAgICBwcm9tcHQgKz0gYFxcblx1MjZBMFx1RkUwRiBJTVBPUlRBTlQgLSBVc2VyJ3MgQ3VzdG9tIEluc3RydWN0aW9uczpcXG4ke2N1c3RvbVByb21wdH1cXG5gO1xuICB9XG5cbiAgcHJvbXB0ICs9IGBcXG5QbGVhc2UgcHJvdmlkZSBPTkxZIHRoZSB2YWx1ZSB0byBmaWxsIGluIHRoaXMgZmllbGQuIERvIG5vdCBpbmNsdWRlIGFueSBleHBsYW5hdGlvbiwgcXVvdGVzLCBvciBhZGRpdGlvbmFsIHRleHQuIEp1c3QgdGhlIHJhdyB2YWx1ZS5gO1xuXG4gIHJldHVybiBwcm9tcHQ7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNhbGxPcGVuQUkocHJvbXB0LCBsbG1Db25maWcpIHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS92MS9jaGF0L2NvbXBsZXRpb25zJywge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtsbG1Db25maWcuYXBpS2V5fWBcbiAgICB9LFxuICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIG1vZGVsOiBsbG1Db25maWcubW9kZWwgfHwgJ2dwdC00JyxcbiAgICAgIG1lc3NhZ2VzOiBbeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6IHByb21wdCB9XSxcbiAgICAgIHRlbXBlcmF0dXJlOiAwLjcsXG4gICAgICBtYXhfdG9rZW5zOiA1MDBcbiAgICB9KVxuICB9KTtcblxuICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBPcGVuQUkgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgfVxuXG4gIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gIHJldHVybiBkYXRhLmNob2ljZXNbMF0ubWVzc2FnZS5jb250ZW50LnRyaW0oKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY2FsbEFudGhyb3BpYyhwcm9tcHQsIGxsbUNvbmZpZykge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdodHRwczovL2FwaS5hbnRocm9waWMuY29tL3YxL21lc3NhZ2VzJywge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAneC1hcGkta2V5JzogbGxtQ29uZmlnLmFwaUtleSxcbiAgICAgICdhbnRocm9waWMtdmVyc2lvbic6ICcyMDIzLTA2LTAxJ1xuICAgIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgbW9kZWw6IGxsbUNvbmZpZy5tb2RlbCB8fCAnY2xhdWRlLTMtNS1zb25uZXQtMjAyNDEwMjInLFxuICAgICAgbWF4X3Rva2VuczogNTAwLFxuICAgICAgbWVzc2FnZXM6IFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogcHJvbXB0IH1dXG4gICAgfSlcbiAgfSk7XG5cbiAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgIHRocm93IG5ldyBFcnJvcihgQW50aHJvcGljIEFQSSBlcnJvcjogJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gIH1cblxuICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICByZXR1cm4gZGF0YS5jb250ZW50WzBdLnRleHQudHJpbSgpO1xufVxuXG5mdW5jdGlvbiBnZXRGYWxsYmFja1ZhbHVlKGZpZWxkRGVzY3JpcHRvcikge1xuICBjb25zdCBsYWJlbCA9IChmaWVsZERlc2NyaXB0b3IubGFiZWwgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gIGNvbnN0IHR5cGUgPSBmaWVsZERlc2NyaXB0b3IudHlwZTtcblxuICBpZiAobGFiZWwuaW5jbHVkZXMoJ2ZpcnN0IG5hbWUnKSB8fCBsYWJlbC5pbmNsdWRlcygnXHU1NDBEXHU1QjU3JykgfHwgbGFiZWwuaW5jbHVkZXMoJ2ZpcnN0bmFtZScpKSB7XG4gICAgcmV0dXJuICdTaGlxaSc7XG4gIH0gZWxzZSBpZiAobGFiZWwuaW5jbHVkZXMoJ2xhc3QgbmFtZScpIHx8IGxhYmVsLmluY2x1ZGVzKCdcdTU5RDMnKSB8fCBsYWJlbC5pbmNsdWRlcygnbGFzdG5hbWUnKSkge1xuICAgIHJldHVybiAnTGl1JztcbiAgfSBlbHNlIGlmIChsYWJlbC5pbmNsdWRlcygnZW1haWwnKSB8fCBsYWJlbC5pbmNsdWRlcygnXHU5MEFFXHU3QkIxJykpIHtcbiAgICByZXR1cm4gJ3NoaXFpLmxpdUBleGFtcGxlLmNvbSc7XG4gIH0gZWxzZSBpZiAobGFiZWwuaW5jbHVkZXMoJ3Bob25lJykgfHwgbGFiZWwuaW5jbHVkZXMoJ1x1NzUzNVx1OEJERCcpKSB7XG4gICAgcmV0dXJuICcrMSAoNTU1KSAxMjMtNDU2Nyc7XG4gIH0gZWxzZSBpZiAobGFiZWwuaW5jbHVkZXMoJ2FkZHJlc3MnKSB8fCBsYWJlbC5pbmNsdWRlcygnXHU1NzMwXHU1NzQwJykpIHtcbiAgICByZXR1cm4gJzEyMyBNYWluIFN0cmVldCc7XG4gIH0gZWxzZSBpZiAobGFiZWwuaW5jbHVkZXMoJ2NpdHknKSB8fCBsYWJlbC5pbmNsdWRlcygnXHU1N0NFXHU1RTAyJykpIHtcbiAgICByZXR1cm4gJ1NhbiBGcmFuY2lzY28nO1xuICB9IGVsc2UgaWYgKGxhYmVsLmluY2x1ZGVzKCdzdGF0ZScpIHx8IGxhYmVsLmluY2x1ZGVzKCdcdTVEREUnKSkge1xuICAgIHJldHVybiAnQ0EnO1xuICB9IGVsc2UgaWYgKGxhYmVsLmluY2x1ZGVzKCd6aXAnKSB8fCBsYWJlbC5pbmNsdWRlcygnXHU5MEFFXHU3RjE2JykpIHtcbiAgICByZXR1cm4gJzk0MTA1JztcbiAgfSBlbHNlIGlmIChsYWJlbC5pbmNsdWRlcygnY29tcGFueScpIHx8IGxhYmVsLmluY2x1ZGVzKCdcdTUxNkNcdTUzRjgnKSkge1xuICAgIHJldHVybiAnVGVjaCBDb21wYW55IEluYy4nO1xuICB9IGVsc2UgaWYgKHR5cGUgPT09ICd0ZXh0YXJlYScgfHwgbGFiZWwuaW5jbHVkZXMoJ21lc3NhZ2UnKSB8fCBsYWJlbC5pbmNsdWRlcygnY29tbWVudCcpKSB7XG4gICAgcmV0dXJuICdUaGlzIGlzIGEgZGVtbyBtZXNzYWdlIGZpbGxlZCBieSBBdXRvRmVlbCBleHRlbnNpb24uJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gJ0F1dG9GZWVsIERlbW8gVmFsdWUnO1xuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsT0FBTyxRQUFRLFVBQVUsWUFBWSxDQUFDLFNBQVMsUUFBUSxpQkFBaUI7QUFDdEUsTUFBSSxRQUFRLFNBQVMsaUJBQWlCO0FBQ3BDLG9CQUFnQixRQUFRLE9BQU8sRUFDNUIs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
