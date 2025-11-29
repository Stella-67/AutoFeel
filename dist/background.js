// src/background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FC_FILL_FIELD") {
    handleFillField(message.payload).then((response) => sendResponse(response)).catch((err) => {
      console.error("AutoFeel error:", err);
      sendResponse({ status: "fail", reason: "processing_error" });
    });
    return true;
  }
});
async function handleFillField(payload) {
  const { fieldDescriptor } = payload;
  const label = (fieldDescriptor.label || "").toLowerCase();
  const type = fieldDescriptor.type;
  let value = "";
  if (label.includes("first name") || label.includes("\u540D\u5B57") || label.includes("firstname")) {
    value = "Shiqi";
  } else if (label.includes("last name") || label.includes("\u59D3") || label.includes("lastname")) {
    value = "Liu";
  } else if (label.includes("email") || label.includes("\u90AE\u7BB1")) {
    value = "shiqi.liu@example.com";
  } else if (label.includes("phone") || label.includes("\u7535\u8BDD")) {
    value = "+1 (555) 123-4567";
  } else if (label.includes("address") || label.includes("\u5730\u5740")) {
    value = "123 Main Street";
  } else if (label.includes("city") || label.includes("\u57CE\u5E02")) {
    value = "San Francisco";
  } else if (label.includes("state") || label.includes("\u5DDE")) {
    value = "CA";
  } else if (label.includes("zip") || label.includes("\u90AE\u7F16")) {
    value = "94105";
  } else if (label.includes("company") || label.includes("\u516C\u53F8")) {
    value = "Tech Company Inc.";
  } else if (type === "textarea" || label.includes("message") || label.includes("comment")) {
    value = "This is a demo message filled by AutoFeel extension.";
  } else {
    value = "AutoFeel Demo Value";
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  return { status: "success", value, reason: null };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2JhY2tncm91bmQuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNocm9tZS5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcigobWVzc2FnZSwgc2VuZGVyLCBzZW5kUmVzcG9uc2UpID0+IHtcbiAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gJ0ZDX0ZJTExfRklFTEQnKSB7XG4gICAgaGFuZGxlRmlsbEZpZWxkKG1lc3NhZ2UucGF5bG9hZClcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHNlbmRSZXNwb25zZShyZXNwb25zZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkF1dG9GZWVsIGVycm9yOlwiLCBlcnIpO1xuICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdGF0dXM6ICdmYWlsJywgcmVhc29uOiAncHJvY2Vzc2luZ19lcnJvcicgfSk7XG4gICAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUZpbGxGaWVsZChwYXlsb2FkKSB7XG4gIGNvbnN0IHsgZmllbGREZXNjcmlwdG9yIH0gPSBwYXlsb2FkO1xuICBjb25zdCBsYWJlbCA9IChmaWVsZERlc2NyaXB0b3IubGFiZWwgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gIGNvbnN0IHR5cGUgPSBmaWVsZERlc2NyaXB0b3IudHlwZTtcblxuICBsZXQgdmFsdWUgPSAnJztcblxuICBpZiAobGFiZWwuaW5jbHVkZXMoJ2ZpcnN0IG5hbWUnKSB8fCBsYWJlbC5pbmNsdWRlcygnXHU1NDBEXHU1QjU3JykgfHwgbGFiZWwuaW5jbHVkZXMoJ2ZpcnN0bmFtZScpKSB7XG4gICAgdmFsdWUgPSAnU2hpcWknO1xuICB9IGVsc2UgaWYgKGxhYmVsLmluY2x1ZGVzKCdsYXN0IG5hbWUnKSB8fCBsYWJlbC5pbmNsdWRlcygnXHU1OUQzJykgfHwgbGFiZWwuaW5jbHVkZXMoJ2xhc3RuYW1lJykpIHtcbiAgICB2YWx1ZSA9ICdMaXUnO1xuICB9IGVsc2UgaWYgKGxhYmVsLmluY2x1ZGVzKCdlbWFpbCcpIHx8IGxhYmVsLmluY2x1ZGVzKCdcdTkwQUVcdTdCQjEnKSkge1xuICAgIHZhbHVlID0gJ3NoaXFpLmxpdUBleGFtcGxlLmNvbSc7XG4gIH0gZWxzZSBpZiAobGFiZWwuaW5jbHVkZXMoJ3Bob25lJykgfHwgbGFiZWwuaW5jbHVkZXMoJ1x1NzUzNVx1OEJERCcpKSB7XG4gICAgdmFsdWUgPSAnKzEgKDU1NSkgMTIzLTQ1NjcnO1xuICB9IGVsc2UgaWYgKGxhYmVsLmluY2x1ZGVzKCdhZGRyZXNzJykgfHwgbGFiZWwuaW5jbHVkZXMoJ1x1NTczMFx1NTc0MCcpKSB7XG4gICAgdmFsdWUgPSAnMTIzIE1haW4gU3RyZWV0JztcbiAgfSBlbHNlIGlmIChsYWJlbC5pbmNsdWRlcygnY2l0eScpIHx8IGxhYmVsLmluY2x1ZGVzKCdcdTU3Q0VcdTVFMDInKSkge1xuICAgIHZhbHVlID0gJ1NhbiBGcmFuY2lzY28nO1xuICB9IGVsc2UgaWYgKGxhYmVsLmluY2x1ZGVzKCdzdGF0ZScpIHx8IGxhYmVsLmluY2x1ZGVzKCdcdTVEREUnKSkge1xuICAgIHZhbHVlID0gJ0NBJztcbiAgfSBlbHNlIGlmIChsYWJlbC5pbmNsdWRlcygnemlwJykgfHwgbGFiZWwuaW5jbHVkZXMoJ1x1OTBBRVx1N0YxNicpKSB7XG4gICAgdmFsdWUgPSAnOTQxMDUnO1xuICB9IGVsc2UgaWYgKGxhYmVsLmluY2x1ZGVzKCdjb21wYW55JykgfHwgbGFiZWwuaW5jbHVkZXMoJ1x1NTE2Q1x1NTNGOCcpKSB7XG4gICAgdmFsdWUgPSAnVGVjaCBDb21wYW55IEluYy4nO1xuICB9IGVsc2UgaWYgKHR5cGUgPT09ICd0ZXh0YXJlYScgfHwgbGFiZWwuaW5jbHVkZXMoJ21lc3NhZ2UnKSB8fCBsYWJlbC5pbmNsdWRlcygnY29tbWVudCcpKSB7XG4gICAgdmFsdWUgPSAnVGhpcyBpcyBhIGRlbW8gbWVzc2FnZSBmaWxsZWQgYnkgQXV0b0ZlZWwgZXh0ZW5zaW9uLic7XG4gIH0gZWxzZSB7XG4gICAgdmFsdWUgPSAnQXV0b0ZlZWwgRGVtbyBWYWx1ZSc7XG4gIH1cblxuICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMzAwKSk7XG5cbiAgcmV0dXJuIHsgc3RhdHVzOiAnc3VjY2VzcycsIHZhbHVlLCByZWFzb246IG51bGwgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxPQUFPLFFBQVEsVUFBVSxZQUFZLENBQUMsU0FBUyxRQUFRLGlCQUFpQjtBQUN0RSxNQUFJLFFBQVEsU0FBUyxpQkFBaUI7QUFDcEMsb0JBQWdCLFFBQVEsT0FBTyxFQUM1QixLQUFLLGNBQVksYUFBYSxRQUFRLENBQUMsRUFDdkMsTUFBTSxTQUFPO0FBQ1osY0FBUSxNQUFNLG1CQUFtQixHQUFHO0FBQ3BDLG1CQUFhLEVBQUUsUUFBUSxRQUFRLFFBQVEsbUJBQW1CLENBQUM7QUFBQSxJQUM3RCxDQUFDO0FBQ0gsV0FBTztBQUFBLEVBQ1Q7QUFDRixDQUFDO0FBRUQsZUFBZSxnQkFBZ0IsU0FBUztBQUN0QyxRQUFNLEVBQUUsZ0JBQWdCLElBQUk7QUFDNUIsUUFBTSxTQUFTLGdCQUFnQixTQUFTLElBQUksWUFBWTtBQUN4RCxRQUFNLE9BQU8sZ0JBQWdCO0FBRTdCLE1BQUksUUFBUTtBQUVaLE1BQUksTUFBTSxTQUFTLFlBQVksS0FBSyxNQUFNLFNBQVMsY0FBSSxLQUFLLE1BQU0sU0FBUyxXQUFXLEdBQUc7QUFDdkYsWUFBUTtBQUFBLEVBQ1YsV0FBVyxNQUFNLFNBQVMsV0FBVyxLQUFLLE1BQU0sU0FBUyxRQUFHLEtBQUssTUFBTSxTQUFTLFVBQVUsR0FBRztBQUMzRixZQUFRO0FBQUEsRUFDVixXQUFXLE1BQU0sU0FBUyxPQUFPLEtBQUssTUFBTSxTQUFTLGNBQUksR0FBRztBQUMxRCxZQUFRO0FBQUEsRUFDVixXQUFXLE1BQU0sU0FBUyxPQUFPLEtBQUssTUFBTSxTQUFTLGNBQUksR0FBRztBQUMxRCxZQUFRO0FBQUEsRUFDVixXQUFXLE1BQU0sU0FBUyxTQUFTLEtBQUssTUFBTSxTQUFTLGNBQUksR0FBRztBQUM1RCxZQUFRO0FBQUEsRUFDVixXQUFXLE1BQU0sU0FBUyxNQUFNLEtBQUssTUFBTSxTQUFTLGNBQUksR0FBRztBQUN6RCxZQUFRO0FBQUEsRUFDVixXQUFXLE1BQU0sU0FBUyxPQUFPLEtBQUssTUFBTSxTQUFTLFFBQUcsR0FBRztBQUN6RCxZQUFRO0FBQUEsRUFDVixXQUFXLE1BQU0sU0FBUyxLQUFLLEtBQUssTUFBTSxTQUFTLGNBQUksR0FBRztBQUN4RCxZQUFRO0FBQUEsRUFDVixXQUFXLE1BQU0sU0FBUyxTQUFTLEtBQUssTUFBTSxTQUFTLGNBQUksR0FBRztBQUM1RCxZQUFRO0FBQUEsRUFDVixXQUFXLFNBQVMsY0FBYyxNQUFNLFNBQVMsU0FBUyxLQUFLLE1BQU0sU0FBUyxTQUFTLEdBQUc7QUFDeEYsWUFBUTtBQUFBLEVBQ1YsT0FBTztBQUNMLFlBQVE7QUFBQSxFQUNWO0FBRUEsUUFBTSxJQUFJLFFBQVEsYUFBVyxXQUFXLFNBQVMsR0FBRyxDQUFDO0FBRXJELFNBQU8sRUFBRSxRQUFRLFdBQVcsT0FBTyxRQUFRLEtBQUs7QUFDbEQ7IiwKICAibmFtZXMiOiBbXQp9Cg==
