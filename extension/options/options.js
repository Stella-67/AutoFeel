// Saves options to chrome.storage
const saveOptions = () => {
  const apiBaseUrl = document.getElementById('apiBaseUrl').value;

  chrome.storage.sync.set(
    { apiBaseUrl: apiBaseUrl },
    () => {
      // Update status to let user know options were saved.
      const status = document.getElementById('status');
      status.textContent = 'Options saved.';
      setTimeout(() => {
        status.textContent = '';
      }, 2000);
    }
  );
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
  chrome.storage.sync.get(
    { apiBaseUrl: 'http://localhost:3000' },
    (items) => {
      document.getElementById('apiBaseUrl').value = items.apiBaseUrl;
    }
  );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);
