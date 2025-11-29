(() => {
  // src/background.js
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "FC_FILL_FIELD") {
      handleFillField(message.payload, sender.tab && sender.tab.id).then((response) => sendResponse(response)).catch((err) => {
        console.error("Background error:", err);
        sendResponse({ status: "fail", reason: "network_error" });
      });
      return true;
    }
  });
  async function handleFillField(payload, tabId) {
    const { fieldDescriptor, blockSnapshot, sessionId } = payload;
    const storage = await chrome.storage.sync.get(["apiBaseUrl"]);
    const apiBaseUrl = storage.apiBaseUrl || "http://localhost:3000";
    const cleanUrl = apiBaseUrl.replace(/\/$/, "");
    try {
      const response = await fetch(`${cleanUrl}/fill_field`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          session_id: sessionId,
          page_url: fieldDescriptor.page_url,
          field: fieldDescriptor,
          block_snapshot: blockSnapshot || null
        })
      });
      if (!response.ok) {
        return { status: "fail", reason: `http_error_${response.status}` };
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Fetch error:", error);
      return { status: "fail", reason: "network_error" };
    }
  }
})();
