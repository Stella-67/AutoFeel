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
  const { fieldDescriptor, blockSnapshot } = payload;
  try {
    const result = await chrome.storage.local.get(["settings", "profile"]);
    const settings = result.settings || {};
    const profile = result.profile || {};
    const llmConfig = settings.llm;
    if (llmConfig && llmConfig.apiKey) {
      const value = await generateWithLLM(fieldDescriptor, blockSnapshot, profile, llmConfig);
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
async function generateWithLLM(fieldDescriptor, blockSnapshot, profile, llmConfig) {
  const prompt = buildPrompt(fieldDescriptor, blockSnapshot, profile);
  console.log("=".repeat(80));
  console.log("\u{1F916} AutoFeel LLM Request");
  console.log("=".repeat(80));
  console.log("\u{1F4DD} Field Label:", fieldDescriptor.label);
  console.log("\u{1F4E6} Field Type:", fieldDescriptor.type);
  console.log("\u{1F527} Provider:", llmConfig.provider);
  console.log("\u{1F3AF} Model:", llmConfig.model);
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
function buildPrompt(fieldDescriptor, blockSnapshot, profile) {
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2JhY2tncm91bmQuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigobWVzc2FnZSwgc2VuZGVyLCBzZW5kUmVzcG9uc2UpID0+IHtcbiAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gJ0ZDX0ZJTExfRklFTEQnKSB7XG4gICAgaGFuZGxlRmlsbEZpZWxkKG1lc3NhZ2UucGF5bG9hZClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHNlbmRSZXNwb25zZShyZXNwb25zZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkF1dG9GZWVsIGVycm9yOlwiLCBlcnIpO1xuICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6ICdmYWlsJywgcmVhc29uOiAncHJvY2Vzc2luZ19lcnJvcicgfSk7XG4gICAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChtZXNzYWdlLmFjdGlvbiA9PT0gJ2dldFByb2ZpbGUnKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KCdwcm9maWxlJywgKHJlc3VsdCkgPT4ge1xuICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogcmVzdWx0LnByb2ZpbGUgfHwge30gfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAobWVzc2FnZS5hY3Rpb24gPT09ICdzYXZlUHJvZmlsZScpIHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBwcm9maWxlOiBtZXNzYWdlLnBheWxvYWQgfSwgKCkgPT4ge1xuICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChtZXNzYWdlLmFjdGlvbiA9PT0gJ2dldFNldHRpbmdzJykge1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLmdldCgnc2V0dGluZ3MnLCAocmVzdWx0KSA9PiB7XG4gICAgICBzZW5kUmVzcG9uc2UoeyBzdWNjZXNzOiB0cnVlLCBkYXRhOiByZXN1bHQuc2V0dGluZ3MgfHwge30gfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAobWVzc2FnZS5hY3Rpb24gPT09ICdzYXZlTExNU2V0dGluZ3MnKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KCdzZXR0aW5ncycsIChyZXN1bHQpID0+IHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gcmVzdWx0LnNldHRpbmdzIHx8IHt9O1xuICAgICAgc2V0dGluZ3MubGxtID0gbWVzc2FnZS5wYXlsb2FkO1xuICAgICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuc2V0KHsgc2V0dGluZ3MgfSwgKCkgPT4ge1xuICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdWNjZXNzOiB0cnVlIH0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAobWVzc2FnZS5hY3Rpb24gPT09ICdzYXZlQXV0b0ZpbGxTZXR0aW5ncycpIHtcbiAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoJ3NldHRpbmdzJywgKHJlc3VsdCkgPT4ge1xuICAgICAgY29uc3Qgc2V0dGluZ3MgPSByZXN1bHQuc2V0dGluZ3MgfHwge307XG4gICAgICBzZXR0aW5ncy5hdXRvRmlsbCA9IG1lc3NhZ2UucGF5bG9hZDtcbiAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHNldHRpbmdzIH0sICgpID0+IHtcbiAgICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKG1lc3NhZ2UuYWN0aW9uID09PSAnc2F2ZVN0eWxlU2V0dGluZ3MnKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KCdzZXR0aW5ncycsIChyZXN1bHQpID0+IHtcbiAgICAgIGNvbnN0IHNldHRpbmdzID0gcmVzdWx0LnNldHRpbmdzIHx8IHt9O1xuICAgICAgc2V0dGluZ3MuY3VzdG9tUHJvbXB0U3R5bGUgPSBtZXNzYWdlLnBheWxvYWQ7XG4gICAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoeyBzZXR0aW5ncyB9LCAoKSA9PiB7XG4gICAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChtZXNzYWdlLmFjdGlvbiA9PT0gJ2ltcG9ydERhdGEnKSB7XG4gICAgY29uc3QgeyBwcm9maWxlLCBzZXR0aW5ncyB9ID0gbWVzc2FnZS5wYXlsb2FkO1xuICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7IHByb2ZpbGUsIHNldHRpbmdzIH0sICgpID0+IHtcbiAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUgfSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAobWVzc2FnZS5hY3Rpb24gPT09ICdjbGVhckFsbERhdGEnKSB7XG4gICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuY2xlYXIoKCkgPT4ge1xuICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUZpbGxGaWVsZChwYXlsb2FkKSB7XG4gIGNvbnN0IHsgZmllbGREZXNjcmlwdG9yLCBibG9ja1NuYXBzaG90IH0gPSBwYXlsb2FkO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFsnc2V0dGluZ3MnLCAncHJvZmlsZSddKTtcbiAgICBjb25zdCBzZXR0aW5ncyA9IHJlc3VsdC5zZXR0aW5ncyB8fCB7fTtcbiAgICBjb25zdCBwcm9maWxlID0gcmVzdWx0LnByb2ZpbGUgfHwge307XG4gICAgY29uc3QgbGxtQ29uZmlnID0gc2V0dGluZ3MubGxtO1xuXG4gICAgaWYgKGxsbUNvbmZpZyAmJiBsbG1Db25maWcuYXBpS2V5KSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGF3YWl0IGdlbmVyYXRlV2l0aExMTShmaWVsZERlc2NyaXB0b3IsIGJsb2NrU25hcHNob3QsIHByb2ZpbGUsIGxsbUNvbmZpZyk7XG4gICAgICByZXR1cm4geyBzdGF0dXM6ICdzdWNjZXNzJywgdmFsdWUsIHJlYXNvbjogbnVsbCB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGdldEZhbGxiYWNrVmFsdWUoZmllbGREZXNjcmlwdG9yKTtcbiAgICAgIHJldHVybiB7IHN0YXR1czogJ3N1Y2Nlc3MnLCB2YWx1ZSwgcmVhc29uOiBudWxsIH07XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGluIGhhbmRsZUZpbGxGaWVsZDonLCBlcnJvcik7XG4gICAgY29uc3QgdmFsdWUgPSBnZXRGYWxsYmFja1ZhbHVlKGZpZWxkRGVzY3JpcHRvcik7XG4gICAgcmV0dXJuIHsgc3RhdHVzOiAnc3VjY2VzcycsIHZhbHVlLCByZWFzb246IG51bGwgfTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVdpdGhMTE0oZmllbGREZXNjcmlwdG9yLCBibG9ja1NuYXBzaG90LCBwcm9maWxlLCBsbG1Db25maWcpIHtcbiAgY29uc3QgcHJvbXB0ID0gYnVpbGRQcm9tcHQoZmllbGREZXNjcmlwdG9yLCBibG9ja1NuYXBzaG90LCBwcm9maWxlKTtcblxuICBjb25zb2xlLmxvZygnPScucmVwZWF0KDgwKSk7XG4gIGNvbnNvbGUubG9nKCdcdUQ4M0VcdUREMTYgQXV0b0ZlZWwgTExNIFJlcXVlc3QnKTtcbiAgY29uc29sZS5sb2coJz0nLnJlcGVhdCg4MCkpO1xuICBjb25zb2xlLmxvZygnXHVEODNEXHVEQ0REIEZpZWxkIExhYmVsOicsIGZpZWxkRGVzY3JpcHRvci5sYWJlbCk7XG4gIGNvbnNvbGUubG9nKCdcdUQ4M0RcdURDRTYgRmllbGQgVHlwZTonLCBmaWVsZERlc2NyaXB0b3IudHlwZSk7XG4gIGNvbnNvbGUubG9nKCdcdUQ4M0RcdUREMjcgUHJvdmlkZXI6JywgbGxtQ29uZmlnLnByb3ZpZGVyKTtcbiAgY29uc29sZS5sb2coJ1x1RDgzQ1x1REZBRiBNb2RlbDonLCBsbG1Db25maWcubW9kZWwpO1xuICBjb25zb2xlLmxvZygnXFxuXHVEODNEXHVEQ0U4IFByb21wdCBzZW50IHRvIExMTTonKTtcbiAgY29uc29sZS5sb2coJy0nLnJlcGVhdCg4MCkpO1xuICBjb25zb2xlLmxvZyhwcm9tcHQpO1xuICBjb25zb2xlLmxvZygnLScucmVwZWF0KDgwKSk7XG4gIGNvbnNvbGUubG9nKCdcXG5cdTIzRjMgV2FpdGluZyBmb3IgTExNIHJlc3BvbnNlLi4uXFxuJyk7XG5cbiAgbGV0IHJlc3BvbnNlO1xuICBpZiAobGxtQ29uZmlnLnByb3ZpZGVyID09PSAnb3BlbmFpJykge1xuICAgIHJlc3BvbnNlID0gYXdhaXQgY2FsbE9wZW5BSShwcm9tcHQsIGxsbUNvbmZpZyk7XG4gIH0gZWxzZSBpZiAobGxtQ29uZmlnLnByb3ZpZGVyID09PSAnYW50aHJvcGljJykge1xuICAgIHJlc3BvbnNlID0gYXdhaXQgY2FsbEFudGhyb3BpYyhwcm9tcHQsIGxsbUNvbmZpZyk7XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBMTE0gcHJvdmlkZXInKTtcbiAgfVxuXG4gIGNvbnNvbGUubG9nKCdcdTI3MDUgTExNIFJlc3BvbnNlOicpO1xuICBjb25zb2xlLmxvZygnLScucmVwZWF0KDgwKSk7XG4gIGNvbnNvbGUubG9nKHJlc3BvbnNlKTtcbiAgY29uc29sZS5sb2coJy0nLnJlcGVhdCg4MCkpO1xuICBjb25zb2xlLmxvZygnPScucmVwZWF0KDgwKSArICdcXG4nKTtcblxuICByZXR1cm4gcmVzcG9uc2U7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkUHJvbXB0KGZpZWxkRGVzY3JpcHRvciwgYmxvY2tTbmFwc2hvdCwgcHJvZmlsZSkge1xuICBjb25zdCBsYWJlbCA9IGZpZWxkRGVzY3JpcHRvci5sYWJlbCB8fCAndGhpcyBmaWVsZCc7XG4gIGNvbnN0IGN1cnJlbnRWYWx1ZSA9IGZpZWxkRGVzY3JpcHRvci5jdXJyZW50X3ZhbHVlIHx8ICcnO1xuICBjb25zdCBwbGFjZWhvbGRlciA9IGZpZWxkRGVzY3JpcHRvci5wbGFjZWhvbGRlciB8fCAnJztcblxuICBsZXQgcHJvbXB0ID0gYFlvdSBhcmUgaGVscGluZyBmaWxsIG91dCBhIGZvcm0gZmllbGQuIFRoZSBmaWVsZCBoYXMgdGhlIGZvbGxvd2luZyBpbmZvcm1hdGlvbjpcXG5cXG5gO1xuICBwcm9tcHQgKz0gYExhYmVsOiAke2xhYmVsfVxcbmA7XG4gIHByb21wdCArPSBgVHlwZTogJHtmaWVsZERlc2NyaXB0b3IudHlwZX1cXG5gO1xuICBpZiAocGxhY2Vob2xkZXIpIHByb21wdCArPSBgUGxhY2Vob2xkZXI6ICR7cGxhY2Vob2xkZXJ9XFxuYDtcbiAgaWYgKGN1cnJlbnRWYWx1ZSkgcHJvbXB0ICs9IGBDdXJyZW50IHZhbHVlOiAke2N1cnJlbnRWYWx1ZX1cXG5gO1xuXG4gIGlmIChwcm9maWxlLnBlcnNvbmFsKSB7XG4gICAgcHJvbXB0ICs9IGBcXG5Vc2VyIFByb2ZpbGU6XFxuYDtcbiAgICBpZiAocHJvZmlsZS5wZXJzb25hbC5mdWxsTmFtZSkgcHJvbXB0ICs9IGBOYW1lOiAke3Byb2ZpbGUucGVyc29uYWwuZnVsbE5hbWV9XFxuYDtcbiAgICBpZiAocHJvZmlsZS5wZXJzb25hbC5lbWFpbCkgcHJvbXB0ICs9IGBFbWFpbDogJHtwcm9maWxlLnBlcnNvbmFsLmVtYWlsfVxcbmA7XG4gICAgaWYgKHByb2ZpbGUucGVyc29uYWwucGhvbmUpIHByb21wdCArPSBgUGhvbmU6ICR7cHJvZmlsZS5wZXJzb25hbC5waG9uZX1cXG5gO1xuICAgIGlmIChwcm9maWxlLnBlcnNvbmFsLmxvY2F0aW9uKSBwcm9tcHQgKz0gYExvY2F0aW9uOiAke3Byb2ZpbGUucGVyc29uYWwubG9jYXRpb259XFxuYDtcbiAgICBpZiAocHJvZmlsZS5wZXJzb25hbC5zdW1tYXJ5KSBwcm9tcHQgKz0gYFN1bW1hcnk6ICR7cHJvZmlsZS5wZXJzb25hbC5zdW1tYXJ5fVxcbmA7XG4gIH1cblxuICBpZiAoYmxvY2tTbmFwc2hvdCAmJiBibG9ja1NuYXBzaG90LmZpZWxkcyAmJiBibG9ja1NuYXBzaG90LmZpZWxkcy5sZW5ndGggPiAxKSB7XG4gICAgcHJvbXB0ICs9IGBcXG5UaGlzIGZpZWxkIGlzIHBhcnQgb2YgYSBncm91cCBvZiAke2Jsb2NrU25hcHNob3QuZmllbGRzLmxlbmd0aH0gZmllbGRzLlxcbmA7XG4gIH1cblxuICBwcm9tcHQgKz0gYFxcblBsZWFzZSBwcm92aWRlIE9OTFkgdGhlIHZhbHVlIHRvIGZpbGwgaW4gdGhpcyBmaWVsZC4gRG8gbm90IGluY2x1ZGUgYW55IGV4cGxhbmF0aW9uLCBxdW90ZXMsIG9yIGFkZGl0aW9uYWwgdGV4dC4gSnVzdCB0aGUgcmF3IHZhbHVlLmA7XG5cbiAgcmV0dXJuIHByb21wdDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY2FsbE9wZW5BSShwcm9tcHQsIGxsbUNvbmZpZykge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdodHRwczovL2FwaS5vcGVuYWkuY29tL3YxL2NoYXQvY29tcGxldGlvbnMnLCB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgaGVhZGVyczoge1xuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2xsbUNvbmZpZy5hcGlLZXl9YFxuICAgIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgbW9kZWw6IGxsbUNvbmZpZy5tb2RlbCB8fCAnZ3B0LTQnLFxuICAgICAgbWVzc2FnZXM6IFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogcHJvbXB0IH1dLFxuICAgICAgdGVtcGVyYXR1cmU6IDAuNyxcbiAgICAgIG1heF90b2tlbnM6IDUwMFxuICAgIH0pXG4gIH0pO1xuXG4gIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZW5BSSBBUEkgZXJyb3I6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICB9XG5cbiAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgcmV0dXJuIGRhdGEuY2hvaWNlc1swXS5tZXNzYWdlLmNvbnRlbnQudHJpbSgpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjYWxsQW50aHJvcGljKHByb21wdCwgbGxtQ29uZmlnKSB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2h0dHBzOi8vYXBpLmFudGhyb3BpYy5jb20vdjEvbWVzc2FnZXMnLCB7XG4gICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgaGVhZGVyczoge1xuICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICd4LWFwaS1rZXknOiBsbG1Db25maWcuYXBpS2V5LFxuICAgICAgJ2FudGhyb3BpYy12ZXJzaW9uJzogJzIwMjMtMDYtMDEnXG4gICAgfSxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICBtb2RlbDogbGxtQ29uZmlnLm1vZGVsIHx8ICdjbGF1ZGUtMy01LXNvbm5ldC0yMDI0MTAyMicsXG4gICAgICBtYXhfdG9rZW5zOiA1MDAsXG4gICAgICBtZXNzYWdlczogW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiBwcm9tcHQgfV1cbiAgICB9KVxuICB9KTtcblxuICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBBbnRocm9waWMgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgfVxuXG4gIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gIHJldHVybiBkYXRhLmNvbnRlbnRbMF0udGV4dC50cmltKCk7XG59XG5cbmZ1bmN0aW9uIGdldEZhbGxiYWNrVmFsdWUoZmllbGREZXNjcmlwdG9yKSB7XG4gIGNvbnN0IGxhYmVsID0gKGZpZWxkRGVzY3JpcHRvci5sYWJlbCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgY29uc3QgdHlwZSA9IGZpZWxkRGVzY3JpcHRvci50eXBlO1xuXG4gIGlmIChsYWJlbC5pbmNsdWRlcygnZmlyc3QgbmFtZScpIHx8IGxhYmVsLmluY2x1ZGVzKCdcdTU0MERcdTVCNTcnKSB8fCBsYWJlbC5pbmNsdWRlcygnZmlyc3RuYW1lJykpIHtcbiAgICByZXR1cm4gJ1NoaXFpJztcbiAgfSBlbHNlIGlmIChsYWJlbC5pbmNsdWRlcygnbGFzdCBuYW1lJykgfHwgbGFiZWwuaW5jbHVkZXMoJ1x1NTlEMycpIHx8IGxhYmVsLmluY2x1ZGVzKCdsYXN0bmFtZScpKSB7XG4gICAgcmV0dXJuICdMaXUnO1xuICB9IGVsc2UgaWYgKGxhYmVsLmluY2x1ZGVzKCdlbWFpbCcpIHx8IGxhYmVsLmluY2x1ZGVzKCdcdTkwQUVcdTdCQjEnKSkge1xuICAgIHJldHVybiAnc2hpcWkubGl1QGV4YW1wbGUuY29tJztcbiAgfSBlbHNlIGlmIChsYWJlbC5pbmNsdWRlcygncGhvbmUnKSB8fCBsYWJlbC5pbmNsdWRlcygnXHU3NTM1XHU4QkREJykpIHtcbiAgICByZXR1cm4gJysxICg1NTUpIDEyMy00NTY3JztcbiAgfSBlbHNlIGlmIChsYWJlbC5pbmNsdWRlcygnYWRkcmVzcycpIHx8IGxhYmVsLmluY2x1ZGVzKCdcdTU3MzBcdTU3NDAnKSkge1xuICAgIHJldHVybiAnMTIzIE1haW4gU3RyZWV0JztcbiAgfSBlbHNlIGlmIChsYWJlbC5pbmNsdWRlcygnY2l0eScpIHx8IGxhYmVsLmluY2x1ZGVzKCdcdTU3Q0VcdTVFMDInKSkge1xuICAgIHJldHVybiAnU2FuIEZyYW5jaXNjbyc7XG4gIH0gZWxzZSBpZiAobGFiZWwuaW5jbHVkZXMoJ3N0YXRlJykgfHwgbGFiZWwuaW5jbHVkZXMoJ1x1NURERScpKSB7XG4gICAgcmV0dXJuICdDQSc7XG4gIH0gZWxzZSBpZiAobGFiZWwuaW5jbHVkZXMoJ3ppcCcpIHx8IGxhYmVsLmluY2x1ZGVzKCdcdTkwQUVcdTdGMTYnKSkge1xuICAgIHJldHVybiAnOTQxMDUnO1xuICB9IGVsc2UgaWYgKGxhYmVsLmluY2x1ZGVzKCdjb21wYW55JykgfHwgbGFiZWwuaW5jbHVkZXMoJ1x1NTE2Q1x1NTNGOCcpKSB7XG4gICAgcmV0dXJuICdUZWNoIENvbXBhbnkgSW5jLic7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3RleHRhcmVhJyB8fCBsYWJlbC5pbmNsdWRlcygnbWVzc2FnZScpIHx8IGxhYmVsLmluY2x1ZGVzKCdjb21tZW50JykpIHtcbiAgICByZXR1cm4gJ1RoaXMgaXMgYSBkZW1vIG1lc3NhZ2UgZmlsbGVkIGJ5IEF1dG9GZWVsIGV4dGVuc2lvbi4nO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiAnQXV0b0ZlZWwgRGVtbyBWYWx1ZSc7XG4gIH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxPQUFPLFFBQVEsVUFBVSxZQUFZLENBQUMsU0FBUyxRQUFRLGlCQUFpQjtBQUN0RSxNQUFJLFFBQVEsU0FBUyxpQkFBaUI7QUFDcEMsb0JBQWdCLFFBQVEsT0FBTyxFQUM1QixLQUFLLGNBQVksYUFBYSxRQUFRLENBQUMsRUFDdkMsTUFBTSxTQUFPO0FBQ1osY0FBUSxNQUFNLG1CQUFtQixHQUFHO0FBQ3BDLG1CQUFhLEVBQUUsUUFBUSxRQUFRLFFBQVEsbUJBQW1CLENBQUM7QUFBQSxJQUM3RCxDQUFDO0FBQ0gsV0FBTztBQUFBLEVBQ1Q7QUFFQSxNQUFJLFFBQVEsV0FBVyxjQUFjO0FBQ25DLFdBQU8sUUFBUSxNQUFNLElBQUksV0FBVyxDQUFDLFdBQVc7QUFDOUMsbUJBQWEsRUFBRSxTQUFTLE1BQU0sTUFBTSxPQUFPLFdBQVcsQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUM1RCxDQUFDO0FBQ0Qs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
