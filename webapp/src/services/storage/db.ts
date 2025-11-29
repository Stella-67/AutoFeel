/**
 * IndexedDB storage layer using idb
 */

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Conversation, ChatSettings } from '../../types/chat';

interface AutoFeelChatDB extends DBSchema {
  conversations: {
    key: string;
    value: Conversation;
    indexes: {
      'by-updated': number;
      'by-created': number;
    };
  };
  settings: {
    key: string;
    value: ChatSettings;
  };
}

const DB_NAME = 'autofeel-chat';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<AutoFeelChatDB> | null = null;

/**
 * Initialize and open the database
 */
export async function initDB(): Promise<IDBPDatabase<AutoFeelChatDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<AutoFeelChatDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Conversations store
      if (!db.objectStoreNames.contains('conversations')) {
        const conversationStore = db.createObjectStore('conversations', {
          keyPath: 'id'
        });
        conversationStore.createIndex('by-updated', 'updatedAt');
        conversationStore.createIndex('by-created', 'createdAt');
      }

      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    }
  });

  return dbInstance;
}

/**
 * Get database instance
 */
async function getDB() {
  if (!dbInstance) {
    return await initDB();
  }
  return dbInstance;
}

// Conversation CRUD operations

export async function saveConversation(conversation: Conversation): Promise<void> {
  const db = await getDB();
  await db.put('conversations', conversation);
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const db = await getDB();
  return await db.get('conversations', id);
}

export async function getAllConversations(): Promise<Conversation[]> {
  const db = await getDB();
  const conversations = await db.getAllFromIndex('conversations', 'by-updated');
  // Return in reverse order (most recent first)
  return conversations.reverse();
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('conversations', id);
}

export async function updateConversationTitle(id: string, title: string): Promise<void> {
  const db = await getDB();
  const conversation = await db.get('conversations', id);
  if (conversation) {
    conversation.title = title;
    conversation.updatedAt = Date.now();
    await db.put('conversations', conversation);
  }
}

// Settings operations

const DEFAULT_SETTINGS: ChatSettings = {
  llm: {
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4'
  },
  chat: {
    streamingEnabled: false, // MVP: disable streaming
    thinkingVisible: false,
    autoToolExecution: true, // MVP: auto-execute tools
    maxToolCalls: 5
  },
  multimodal: {
    enabled: false, // MVP: disable multimodal
    maxImageSize: 5,
    imageQuality: 'medium'
  }
};

export async function getSettings(): Promise<ChatSettings> {
  const db = await getDB();
  const settings = await db.get('settings', 'default');
  return settings || DEFAULT_SETTINGS;
}

export async function saveSettings(settings: ChatSettings): Promise<void> {
  const db = await getDB();
  await db.put('settings', { ...settings, key: 'default' } as any);
}

export async function updateLLMSettings(
  provider: 'openai' | 'anthropic',
  apiKey: string,
  model: string
): Promise<void> {
  const settings = await getSettings();
  settings.llm = { provider, apiKey, model };
  await saveSettings(settings);
}

// Utility: Clear all data
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['conversations', 'settings'], 'readwrite');
  await Promise.all([
    tx.objectStore('conversations').clear(),
    tx.objectStore('settings').clear()
  ]);
  await tx.done;
}
