/**
 * Message input box
 */

import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useChatStore } from '../../stores/chatStore';

interface InputBoxProps {
  disabled?: boolean;
}

export default function InputBox({ disabled }: InputBoxProps) {
  const [input, setInput] = useState('');
  const sendMessage = useChatStore(state => state.sendMessage);

  const handleSend = async () => {
    if (!input.trim() || disabled) return;

    const message = input.trim();
    setInput('');
    await sendMessage(message);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-6 py-4 border-t border-gray-200">
      <div className="flex items-end space-x-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message... (Shift+Enter for new line)"
          disabled={disabled}
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          rows={3}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {disabled ? 'Sending...' : 'Send'}
        </button>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        Press Enter to send, Shift+Enter for new line
      </div>
    </div>
  );
}
