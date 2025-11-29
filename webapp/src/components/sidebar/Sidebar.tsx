/**
 * Sidebar with conversation list
 */

import { useChatStore } from '../../stores/chatStore';

export default function Sidebar() {
  const conversations = useChatStore(state => state.conversations);
  const currentConversationId = useChatStore(state => state.currentConversationId);
  const createConversation = useChatStore(state => state.createConversation);
  const selectConversation = useChatStore(state => state.selectConversation);
  const deleteConversation = useChatStore(state => state.deleteConversation);

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">AutoFeel Chat</h1>
      </div>

      {/* New Chat Button */}
      <div className="p-4">
        <button
          onClick={() => createConversation()}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
        >
          + New Chat
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.map(conversation => (
          <div
            key={conversation.id}
            className={`group flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-800 ${
              conversation.id === currentConversationId ? 'bg-gray-800' : ''
            }`}
            onClick={() => selectConversation(conversation.id)}
          >
            <div className="flex-1 truncate">
              <div className="text-sm font-medium truncate">
                {conversation.title}
              </div>
              <div className="text-xs text-gray-400">
                {new Date(conversation.updatedAt).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteConversation(conversation.id);
              }}
              className="opacity-0 group-hover:opacity-100 ml-2 text-gray-400 hover:text-red-400 transition"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700 text-xs text-gray-400">
        <div>AutoFeel MVP v0.1</div>
      </div>
    </div>
  );
}
