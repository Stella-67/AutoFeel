/**
 * Chat window component
 */

import { useChatStore } from '../../stores/chatStore';
import MessageList from './MessageList';
import InputBox from './InputBox';

export default function ChatWindow() {
  const conversation = useChatStore(state => state.getCurrentConversation());
  const isLoading = useChatStore(state => state.isLoading);
  const error = useChatStore(state => state.error);

  if (!conversation) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">
      No conversation selected
    </div>;
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">
          {conversation.title}
        </h2>
      </div>

      {/* Messages */}
      <MessageList messages={conversation.messages} />

      {/* Error display */}
      {error && (
        <div className="px-6 py-3 bg-red-50 border-t border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Input */}
      <InputBox disabled={isLoading} />
    </div>
  );
}
