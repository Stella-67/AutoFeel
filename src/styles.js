export function injectAutoFeelStyles() {
  if (document.getElementById('fc-autofeel-styles')) return;

  const style = document.createElement('style');
  style.id = 'fc-autofeel-styles';
  style.textContent = `
.fc-ai-filling {
  position: relative;
  transform: translateY(-2px) scale(1.01);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16) !important;
  transition: transform 0.2s ease, box-shadow 0.2s ease !important;
  z-index: 10000 !important;
  background-color: white;
  border-radius: 4px;
}

.fc-ai-success {
  animation: fcAiSuccessFlash 0.6s ease;
  background-color: rgba(46, 204, 113, 0.15) !important;
  border-radius: 4px;
}

.fc-ai-fail {
  animation: fcAiShake 0.4s ease;
  box-shadow: 0 0 0 3px rgba(231, 76, 60, 0.8) !important;
  background-color: rgba(231, 76, 60, 0.15) !important;
  border-radius: 4px;
}

@keyframes fcAiSuccessFlash {
  0%   { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.0); }
  50%  { box-shadow: 0 0 0 4px rgba(46, 204, 113, 0.8); }
  100% { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.0); }
}

@keyframes fcAiShake {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-3px); }
  75%      { transform: translateX(3px); }
}

.fc-selection-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.05);
  cursor: crosshair;
  z-index: 999999; /* above everything */
}

.fc-selection-rect {
  position: absolute;
  border: 1px dashed rgba(0, 120, 255, 0.8);
  background: rgba(0, 120, 255, 0.1);
}

.fc-ai-selected {
  box-shadow: 0 0 0 3px #4a90e2, 0 0 12px rgba(74, 144, 226, 0.6) !important;
  background-color: rgba(74, 144, 226, 0.15) !important;
  border-radius: 4px;
  z-index: 10001 !important;
  animation: fcAiSelectedPulse 1s infinite;
}

@keyframes fcAiSelectedPulse {
  0% { box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.4), 0 0 12px rgba(74, 144, 226, 0.2); }
  50% { box-shadow: 0 0 0 3px rgba(74, 144, 226, 1), 0 0 20px rgba(74, 144, 226, 0.6); }
  100% { box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.4), 0 0 12px rgba(74, 144, 226, 0.2); }
}

.fc-prompt-dialog {
  background: white;
  border: 2px solid #4a90e2;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  padding: 12px;
  min-width: 320px;
  max-width: 480px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.fc-prompt-header {
  font-size: 13px;
  font-weight: 600;
  color: #4a90e2;
  margin-bottom: 8px;
}

.fc-prompt-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  margin-bottom: 8px;
  box-sizing: border-box;
}

.fc-prompt-input:focus {
  outline: none;
  border-color: #4a90e2;
  box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
}

.fc-prompt-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.fc-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.fc-btn-cancel {
  background: #f0f0f0;
  color: #666;
}

.fc-btn-cancel:hover {
  background: #e0e0e0;
}

.fc-btn-generate {
  background: #4a90e2;
  color: white;
}

.fc-btn-generate:hover {
  background: #357abd;
}

.fc-btn:active {
  transform: scale(0.98);
}
`;
  document.head.appendChild(style);
}