chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FC_FILL_FIELD') {
    handleFillField(message.payload)
      .then(response => sendResponse(response))
      .catch(err => {
        console.error("AutoFeel error:", err);
        sendResponse({ status: 'fail', reason: 'processing_error' });
      });
    return true;
  }

  if (message.action === 'getProfile') {
    chrome.storage.local.get('profile', (result) => {
      sendResponse({ success: true, data: result.profile || {} });
    });
    return true;
  }

  if (message.action === 'saveProfile') {
    chrome.storage.local.set({ profile: message.payload }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'getSettings') {
    chrome.storage.local.get('settings', (result) => {
      sendResponse({ success: true, data: result.settings || {} });
    });
    return true;
  }

  if (message.action === 'saveLLMSettings') {
    chrome.storage.local.get('settings', (result) => {
      const settings = result.settings || {};
      settings.llm = message.payload;
      chrome.storage.local.set({ settings }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === 'saveAutoFillSettings') {
    chrome.storage.local.get('settings', (result) => {
      const settings = result.settings || {};
      settings.autoFill = message.payload;
      chrome.storage.local.set({ settings }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === 'saveStyleSettings') {
    chrome.storage.local.get('settings', (result) => {
      const settings = result.settings || {};
      settings.customPromptStyle = message.payload;
      chrome.storage.local.set({ settings }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === 'importData') {
    const { profile, settings } = message.payload;
    chrome.storage.local.set({ profile, settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'clearAllData') {
    chrome.storage.local.clear(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

async function handleFillField(payload) {
  const { fieldDescriptor, blockSnapshot, customPrompt } = payload;

  try {
    const result = await chrome.storage.local.get(['settings', 'profile']);
    const settings = result.settings || {};
    const profile = result.profile || {};
    const llmConfig = settings.llm;

    if (llmConfig && llmConfig.apiKey) {
      const value = await generateWithLLM(fieldDescriptor, blockSnapshot, profile, llmConfig, customPrompt);
      return { status: 'success', value, reason: null };
    } else {
      const value = getFallbackValue(fieldDescriptor);
      return { status: 'success', value, reason: null };
    }
  } catch (error) {
    console.error('Error in handleFillField:', error);
    const value = getFallbackValue(fieldDescriptor);
    return { status: 'success', value, reason: null };
  }
}

async function generateWithLLM(fieldDescriptor, blockSnapshot, profile, llmConfig, customPrompt) {
  const prompt = buildPrompt(fieldDescriptor, blockSnapshot, profile, customPrompt);

  console.log('='.repeat(80));
  console.log('🤖 AutoFeel LLM Request');
  console.log('='.repeat(80));
  console.log('📝 Field Label:', fieldDescriptor.label);
  console.log('📦 Field Type:', fieldDescriptor.type);
  console.log('🔧 Provider:', llmConfig.provider);
  console.log('🎯 Model:', llmConfig.model);
  if (customPrompt) {
    console.log('💬 Custom Instructions:', customPrompt);
  }
  if (profile.documents && profile.documents.length > 0) {
    console.log('📄 Reference Documents:', profile.documents.map(d => d.name).join(', '));
  }
  console.log('\n📨 Prompt sent to LLM:');
  console.log('-'.repeat(80));
  console.log(prompt);
  console.log('-'.repeat(80));
  console.log('\n⏳ Waiting for LLM response...\n');

  let response;
  if (llmConfig.provider === 'openai') {
    response = await callOpenAI(prompt, llmConfig);
  } else if (llmConfig.provider === 'anthropic') {
    response = await callAnthropic(prompt, llmConfig);
  } else {
    throw new Error('Unsupported LLM provider');
  }

  console.log('✅ LLM Response:');
  console.log('-'.repeat(80));
  console.log(response);
  console.log('-'.repeat(80));
  console.log('='.repeat(80) + '\n');

  return response;
}

function buildPrompt(fieldDescriptor, blockSnapshot, profile, customPrompt) {
  const label = fieldDescriptor.label || 'this field';
  const currentValue = fieldDescriptor.current_value || '';
  const placeholder = fieldDescriptor.placeholder || '';

  let prompt = `You are helping fill out a form field. The field has the following information:\n\n`;
  prompt += `Label: ${label}\n`;
  prompt += `Type: ${fieldDescriptor.type}\n`;
  if (placeholder) prompt += `Placeholder: ${placeholder}\n`;
  if (currentValue) prompt += `Current value: ${currentValue}\n`;

  if (profile.personal) {
    prompt += `\nUser Profile:\n`;
    if (profile.personal.fullName) prompt += `Name: ${profile.personal.fullName}\n`;
    if (profile.personal.email) prompt += `Email: ${profile.personal.email}\n`;
    if (profile.personal.phone) prompt += `Phone: ${profile.personal.phone}\n`;
    if (profile.personal.location) prompt += `Location: ${profile.personal.location}\n`;
    if (profile.personal.summary) prompt += `Summary: ${profile.personal.summary}\n`;
  }

  if (blockSnapshot && blockSnapshot.fields && blockSnapshot.fields.length > 1) {
    prompt += `\nThis field is part of a group of ${blockSnapshot.fields.length} fields.\n`;
  }

  if (profile.documents && profile.documents.length > 0) {
    prompt += `\n📄 Reference Documents (SOP, Essays, etc.):\n`;
    profile.documents.forEach(doc => {
      prompt += `\n--- ${doc.name} ---\n`;
      prompt += doc.content.substring(0, 2000);
      if (doc.content.length > 2000) {
        prompt += '\n... (truncated)';
      }
      prompt += '\n';
    });
  }

  if (customPrompt) {
    prompt += `\n⚠️ IMPORTANT - User's Custom Instructions:\n${customPrompt}\n`;
  }

  prompt += `\nPlease provide ONLY the value to fill in this field. Do not include any explanation, quotes, or additional text. Just the raw value.`;

  return prompt;
}

async function callOpenAI(prompt, llmConfig) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${llmConfig.apiKey}`
    },
    body: JSON.stringify({
      model: llmConfig.model || 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function callAnthropic(prompt, llmConfig) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': llmConfig.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: llmConfig.model || 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text.trim();
}

function getFallbackValue(fieldDescriptor) {
  const label = (fieldDescriptor.label || '').toLowerCase();
  const type = fieldDescriptor.type;

  if (label.includes('first name') || label.includes('名字') || label.includes('firstname')) {
    return 'Shiqi';
  } else if (label.includes('last name') || label.includes('姓') || label.includes('lastname')) {
    return 'Liu';
  } else if (label.includes('email') || label.includes('邮箱')) {
    return 'shiqi.liu@example.com';
  } else if (label.includes('phone') || label.includes('电话')) {
    return '+1 (555) 123-4567';
  } else if (label.includes('address') || label.includes('地址')) {
    return '123 Main Street';
  } else if (label.includes('city') || label.includes('城市')) {
    return 'San Francisco';
  } else if (label.includes('state') || label.includes('州')) {
    return 'CA';
  } else if (label.includes('zip') || label.includes('邮编')) {
    return '94105';
  } else if (label.includes('company') || label.includes('公司')) {
    return 'Tech Company Inc.';
  } else if (type === 'textarea' || label.includes('message') || label.includes('comment')) {
    return 'This is a demo message filled by AutoFeel extension.';
  } else {
    return 'AutoFeel Demo Value';
  }
}
