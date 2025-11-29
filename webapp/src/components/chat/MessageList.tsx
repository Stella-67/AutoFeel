/**
 * Message list component
 */

import { useRef, useEffect } from 'react';
import type { Message } from '../../types/chat';
import ReactMarkdown from 'react-markdown';

interface MessageListProps {
  messages: Message[];
}

export default function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
      {messages.map(message => (
        <MessageItem key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

interface MessageItemProps {
  message: Message;
}

function MessageItem({ message }: MessageItemProps) {
  const content = typeof message.content === 'string'
    ? message.content
    : message.content[0]?.text || '';

  if (message.role === 'system') {
    return null; // Don't display system messages
  }

  if (message.role === 'tool') {
    return (
      <div className="flex justify-center">
        <div className="max-w-2xl bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="text-xs font-semibold text-gray-500 mb-2">
            Tool Result
          </div>
          <pre className="text-xs text-gray-700 overflow-x-auto">
            {content}
          </pre>
        </div>
      </div>
    );
  }

  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-2xl px-4 py-3 rounded-lg ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-800'
        }`}
      >
        {/* Message content */}
        <div className="prose prose-sm max-w-none">
          {isUser ? (
            <p className="m-0 whitespace-pre-wrap">{content}</p>
          ) : (
            <ReactMarkdown>{content}</ReactMarkdown>
          )}
        </div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
            {message.toolCalls.map(toolCall => (
              <div key={toolCall.id} className="text-sm">
                <div className="font-semibold text-gray-600">
                  🔧 Calling: {toolCall.function.name}
                </div>
                <pre className="mt-1 text-xs text-gray-500 overflow-x-auto">
                  {JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}

        {/* Metadata */}
        {message.metadata && (
          <div className="mt-2 text-xs text-gray-500">
            {message.metadata.tokens && (
              <span>{message.metadata.tokens.total} tokens</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
