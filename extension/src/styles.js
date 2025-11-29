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
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16) !important;
  transition: transform 0.2s ease, box-shadow 0.2s ease !important;
  z-index: 10000 !important; /* Ensure it floats above other UI elements */
  background-color: white; /* Prevent transparency issues if container is transparent */
  border-radius: 4px; /* Smooth edges */
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
  /* 使用 box-shadow 模拟边框，避免布局抖动，且比 outline 更稳健 */
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
`;
  document.head.appendChild(style);
}