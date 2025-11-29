/**
 * 注入AutoFeel扩展所需的CSS样式到文档的head。
 * 确保样式只注入一次。
 */
export function injectAutoFeelStyles() {
  if (document.getElementById('fc-autofeel-styles')) return;

  const style = document.createElement('style');
  style.id = 'fc-autofeel-styles';
  style.textContent = `
.fc-ai-filling {
  position: relative;
  transform: translateY(-2px) scale(1.01);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
  transition: all 0.2s ease;
  z-index: 9999;
}

.fc-ai-success {
  animation: fcAiSuccessFlash 0.6s ease;
}

.fc-ai-fail {
  animation: fcAiShake 0.4s ease;
}

@keyframes fcAiSuccessFlash {
  0%   { box-shadow: 0 0 0 rgba(0, 200, 0, 0.0); }
  50%  { box-shadow: 0 0 0 3px rgba(0, 200, 0, 0.6); }
  100% { box-shadow: 0 0 0 rgba(0, 200, 0, 0.0); }
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
  outline: 2px dashed #4a90e2;
  outline-offset: 2px;
  animation: fcAiSelectedPulse 1s infinite;
}

@keyframes fcAiSelectedPulse {
  0% { outline-color: rgba(74, 144, 226, 0.4); }
  50% { outline-color: rgba(74, 144, 226, 1); }
  100% { outline-color: rgba(74, 144, 226, 0.4); }
}
`;
  document.head.appendChild(style);
}