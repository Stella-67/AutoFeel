/**
 * Main App component
 */

import { useEffect } from 'react';
import { useChatStore } from './stores/chatStore';
import Sidebar from './components/sidebar/Sidebar';
import ChatWindow from './components/chat/ChatWindow';
import Settings from './components/settings/Settings';

function App() {
  const initialize = useChatStore(state => state.initialize);
  const currentConversationId = useChatStore(state => state.currentConversationId);
  const settings = useChatStore(state => state.settings);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Show settings if no API key configured
  const showSettings = !settings?.llm.apiKey;

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {showSettings ? (
          <Settings />
        ) : currentConversationId ? (
          <ChatWindow />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  const createConversation = useChatStore(state => state.createConversation);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          AutoFeel Chat
        </h2>
        <p className="text-gray-600 mb-6">
          Start a conversation with AI to help fill forms
        </p>
        <button
          onClick={() => createConversation()}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          New Conversation
        </button>
      </div>
    </div>
  );
}

export default App;
