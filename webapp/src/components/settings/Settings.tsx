/**
 * Settings component
 */

import { useState, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';

export default function Settings() {
  const settings = useChatStore(state => state.settings);
  const updateSettings = useChatStore(state => state.updateSettings);

  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4');

  useEffect(() => {
    if (settings) {
      setProvider(settings.llm.provider);
      setApiKey(settings.llm.apiKey);
      setModel(settings.llm.model);
    }
  }, [settings]);

  const handleSave = async () => {
    await updateSettings({
      llm: { provider, apiKey, model }
    });
    alert('Settings saved!');
  };

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Settings</h1>

        <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              LLM Provider
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as 'openai' | 'anthropic')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (Claude)</option>
            </select>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {provider === 'openai' ? (
                <>
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                </>
              ) : (
                <>
                  <option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>
                  <option value="claude-3-opus-20240229">Claude 3 Opus</option>
                  <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
                </>
              )}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`Enter your ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key`}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-2 text-sm text-gray-500">
              Your API key is stored locally and never sent to any server except{' '}
              {provider === 'openai' ? 'OpenAI' : 'Anthropic'}.
            </p>
          </div>

          {/* Save Button */}
          <div className="pt-4">
            <button
              onClick={handleSave}
              disabled={!apiKey}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Save Settings
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">
            Getting Started
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-blue-800">
            <li>Get your API key from{' '}
              {provider === 'openai' ? (
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">
                  OpenAI Platform
                </a>
              ) : (
                <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="underline">
                  Anthropic Console
                </a>
              )}
            </li>
            <li>Enter your API key above and click Save</li>
            <li>Install the Chrome Extension</li>
            <li>Start a new conversation to begin chatting</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
