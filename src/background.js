// Import database module (absolute path from extension root)
importScripts('/src/db.js');
importScripts('/src/perception-agent.js');
importScripts('/src/reasoning-agent.js');
importScripts('/src/action-agent.js');

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'send-to-llm') {
    await handleSendToLLM();
  } else if (command === 'auto-fill-form') {
    await handleAutoFillForm();
  }
});

async function handleSendToLLM() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      console.error('No active tab found');
      return;
    }

    await notifyTab(tab.id, 'Fetching page content...', 'loading');

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT' });

    if (!response || !response.success) {
      await notifyTab(tab.id, 'Failed to get page content', 'error');
      return;
    }

    const rawContent = response.content;

    // ==================== PERCEPTION: Observe Context ====================
    console.log('[AutoFeel Agentic] Starting perception...');

    // Track visit and get perception
    await perceptionAgent.trackVisit(rawContent.metadata.url);
    const perception = await perceptionAgent.observe(rawContent);

    console.log('[AutoFeel Agentic] Perception complete:', {
      pageType: `${perception.currentPage.pageType}/${perception.currentPage.pageSubtype}`,
      confidence: perception.currentPage.confidence,
      visitCount: perception.userBehavior.visitCount,
      isRepeatedVisit: perception.userBehavior.isRepeatedVisit
    });

    // Add perception to rawContent for use in downstream processing
    rawContent.perception = perception;

    const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName', 'systemPrompt']);

    if (!config.apiKey || !config.apiEndpoint || !config.modelName) {
      await notifyTab(tab.id, 'Please configure LLM API in extension settings', 'error');
      return;
    }

    // === Text Cleaning Pipeline ===

    // Step 1: LLM Pre-Cleaning
    await notifyTab(tab.id, 'LLM Pre-Cleaning...', 'loading');
    const preCleaningResult = await llmPreCleaning(rawContent, config);

    if (!preCleaningResult.success) {
      await notifyTab(tab.id, `Pre-cleaning failed: ${preCleaningResult.error}`, 'error');
      return;
    }

    // Step 2: Post-LLM Cleanup
    await notifyTab(tab.id, 'Post-LLM Cleanup...', 'loading');
    const cleanupResult = postLLMCleanup(preCleaningResult.data);

    // Step 3: Chunk Builder
    await notifyTab(tab.id, 'Building Chunks...', 'loading');
    const chunkResult = chunkBuilder(cleanupResult, preCleaningResult.data);

    // Step 4: Build Memory-Ready Data
    await notifyTab(tab.id, 'Finalizing...', 'loading');
    const memoryReady = buildMemoryReadyData(
      chunkResult.chunks,
      rawContent,
      preCleaningResult.data,
      cleanupResult
    );

    // Step 5: Build Schemas
    await notifyTab(tab.id, 'Building schemas...', 'loading');

    const { docId, documentSchema } = buildDocumentSchema(
      rawContent,
      preCleaningResult.data,
      memoryReady
    );

    let chunkSchemas = buildChunkSchemas(
      docId,
      chunkResult.chunks,
      rawContent,
      preCleaningResult.data
    );

    // Step 6: Generate Vector Embeddings (optional, only for OpenAI provider)
    if (config.llmProvider === 'openai' || config.llmProvider === 'custom') {
      await notifyTab(tab.id, 'Generating embeddings for semantic search...', 'loading');

      try {
        // Generate embeddings for all chunks
        const chunksWithEmbeddings = await generateChunkEmbeddings(chunkSchemas, config);

        // Update chunk schemas with embeddings
        chunkSchemas = chunksWithEmbeddings;

        console.log('[AutoFeel] Generated embeddings for all chunks');
      } catch (embError) {
        console.warn('[AutoFeel] Failed to generate embeddings, continuing without:', embError);
        // Continue without embeddings - semantic search will be disabled
      }
    } else {
      console.log('[AutoFeel] Skipping embeddings (not supported for this provider)');
    }

    // Combine all pipeline data
    const pipelineData = {
      rawContent: rawContent,
      llmPreCleaning: {
        ...preCleaningResult.data,
        timestamp: preCleaningResult.timestamp,
        tokenUsage: preCleaningResult.tokenUsage
      },
      postCleanup: cleanupResult,
      chunkResult: chunkResult,
      memoryReady: memoryReady,
      totalTokenUsage: preCleaningResult.tokenUsage,
      // Add schemas
      documentSchema: documentSchema,
      chunkSchemas: chunkSchemas
    };

    // Save for auto-fill (use the cleaned text)
    await chrome.storage.local.set({
      savedContext: {
        pageContent: rawContent,
        llmAnalysis: memoryReady.cleanText,
        timestamp: new Date().toISOString(),
        sourceUrl: rawContent.metadata.url
      }
    });

    // ==================== REASONING: Analyze Situation & Decide ====================
    await notifyTab(tab.id, 'Analyzing context...', 'loading');

    let saveResult = null;
    try {
      // Initialize database
      await memoryDB.init();

      // Check for existing document with same URL
      const existingDoc = await memoryDB.findDocumentByUrl(documentSchema.url);

      // Prepare context for reasoning
      const reasoningContext = {
        hasExisting: !!existingDoc,
        contentChanged: false,
        similarity: 1.0
      };

      if (existingDoc) {
        console.log('[AutoFeel] Found existing document:', existingDoc.doc_id);

        // Check if document should be updated
        const updateCheck = memoryDB.shouldUpdateDocument(existingDoc, documentSchema);
        reasoningContext.contentChanged = updateCheck.shouldUpdate;
        reasoningContext.similarity = updateCheck.textSimilarity;

        console.log('[AutoFeel] Update check:', updateCheck);
      }

      // Let reasoning agent decide what to do
      console.log('[AutoFeel Agentic] Starting reasoning...');
      const agenticDecision = await reasoningAgent.reason(perception, reasoningContext);

      console.log('[AutoFeel Agentic] Reasoning complete:');
      console.log(reasoningAgent.explainDecision(agenticDecision));

      // ==================== ACTION: Execute Strategy ====================
      console.log('[AutoFeel Agentic] Executing action...');

      // Initialize action agent
      await actionAgent.init(memoryDB);

      // Prepare data for action execution
      const actionData = {
        documentSchema: documentSchema,
        chunkSchemas: chunkSchemas
      };

      // Execute action based on decision
      await notifyTab(tab.id, 'Executing strategy...', 'loading');

      saveResult = await actionAgent.execute(
        agenticDecision,
        actionData,
        existingDoc
      );

      console.log('[AutoFeel Agentic] Action executed:', saveResult);

      console.log('[AutoFeel] Save result:', saveResult);
    } catch (dbError) {
      console.error('[AutoFeel] Failed to save to database:', dbError);
      await notifyTab(tab.id, `Warning: Failed to save to memory database: ${dbError.message}`, 'error');
    }

    // Build success message with token usage and save status
    let successMessage = '';

    if (saveResult && saveResult.success) {
      switch (saveResult.action) {
        case 'skipped':
          successMessage = `⏭️ Skipped: ${saveResult.reason}`;
          if (reasoningContext.similarity) {
            successMessage += ` (${(reasoningContext.similarity * 100).toFixed(0)}% similar)`;
          }
          break;

        case 'updated':
          successMessage = `🔄 Updated: ${documentSchema.title.substring(0, 40)}... (v${saveResult.version}, ${saveResult.newChunkCount} chunks)`;
          break;

        case 'created':
          successMessage = `✅ Saved: ${documentSchema.title.substring(0, 40)}... (${saveResult.chunkCount} chunks)`;
          break;

        case 'replaced':
          successMessage = `🔄 Replaced: ${documentSchema.title.substring(0, 40)}... (${saveResult.chunkCount} chunks)`;
          break;

        default:
          successMessage = `Memory saved! Document: ${documentSchema.title.substring(0, 50)}... (${chunkSchemas.length} chunks)`;
      }
    } else {
      successMessage = `Memory saved! Document: ${documentSchema.title.substring(0, 50)}... (${chunkSchemas.length} chunks)`;
    }

    // Add perception info
    if (perception) {
      const pageTypeEmoji = {
        'profile': '👤',
        'document': '📑',
        'form': '📋',
        'content': '📄',
        'social': '💬',
        'utility': '⚙️',
        'unknown': '📄'
      };

      const emoji = pageTypeEmoji[perception.currentPage.pageType] || '📄';
      successMessage += ` | ${emoji} ${perception.currentPage.pageSubtype}`;

      if (perception.userBehavior.visitCount > 1) {
        successMessage += ` (visit #${perception.userBehavior.visitCount})`;
      }
    }

    if (preCleaningResult.tokenUsage) {
      const usage = preCleaningResult.tokenUsage;
      successMessage += ` | ${usage.totalTokens.toLocaleString()} tokens`;
    }

    await notifyTab(tab.id, successMessage, 'success');
  } catch (error) {
    console.error('Error in handleSendToLLM:', error);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await notifyTab(tab.id, `Processing error: ${error.message}`, 'error');
      }
    } catch (e) {
      console.error('Failed to show error notification:', e);
    }
  }
}

async function handleAutoFillForm() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      console.error('No active tab found');
      return;
    }

    await notifyTab(tab.id, 'Detecting form fields...', 'loading');

    // Get saved context from previous LLM analysis
    const { savedContext } = await chrome.storage.local.get(['savedContext']);

    if (!savedContext) {
      await notifyTab(tab.id, 'No saved context found. Please use Alt+C first to analyze a page.', 'error');
      return;
    }

    // Get form fields from the current page
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_FORM_FIELDS' });

    if (!response || !response.success) {
      await notifyTab(tab.id, 'Failed to detect form fields', 'error');
      return;
    }

    const formFields = response.fields;

    if (formFields.length === 0) {
      await notifyTab(tab.id, 'No form fields found on this page', 'error');
      return;
    }

    await notifyTab(tab.id, `Found ${formFields.length} fields. Retrieving from knowledge base...`, 'loading');

    // Get LLM configuration
    const config = await chrome.storage.sync.get(['llmProvider', 'apiKey', 'apiEndpoint', 'modelName']);

    if (!config.apiKey || !config.apiEndpoint || !config.modelName) {
      await notifyTab(tab.id, 'Please configure LLM API in extension settings', 'error');
      return;
    }

    // Generate answers for form fields
    const answers = await generateFormAnswers(formFields, savedContext, config);

    if (answers.success) {
      // Send answers back to content script to fill the form
      await chrome.tabs.sendMessage(tab.id, {
        type: 'FILL_FORM',
        answers: answers.data
      });

      // Build success message with RAG stats and token usage
      let successMessage = 'Form filled successfully!';

      // Add RAG retrieval info
      if (answers.retrievalStats) {
        successMessage += ` [RAG: Retrieved ${answers.retrievalStats.totalChunks} chunks, top relevance ${(answers.retrievalStats.topSimilarity * 100).toFixed(0)}%]`;
      }

      // Add token usage
      if (answers.tokenUsage) {
        successMessage += ` (${answers.tokenUsage.totalTokens.toLocaleString()} tokens)`;
      }

      await notifyTab(tab.id, successMessage, 'success');
    } else {
      await notifyTab(tab.id, `Failed to generate answers: ${answers.error}`, 'error');
    }
  } catch (error) {
    console.error('Error in handleAutoFillForm:', error);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await notifyTab(tab.id, `Error: ${error.message}`, 'error');
      }
    } catch (e) {
      console.error('Failed to show error notification:', e);
    }
  }
}

async function notifyTab(tabId, message, status) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_NOTIFICATION',
      message: message,
      status: status
    });
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

/**
 * Core function to build LLM request body based on provider
 */
function buildLLMRequestBody(provider, modelName, userPrompt, systemPrompt = null, options = {}) {
  const { maxTokens = 1500, temperature = 0.7 } = options;

  if (provider === 'openai' || provider === 'custom') {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    return {
      model: modelName,
      messages,
      max_tokens: maxTokens,
      temperature
    };
  } else if (provider === 'anthropic') {
    const body = {
      model: modelName,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: userPrompt }]
    };
    if (systemPrompt) {
      body.system = systemPrompt;
    }
    return body;
  }

  // Default fallback
  return {
    model: modelName,
    messages: [{ role: 'user', content: userPrompt }],
    max_tokens: maxTokens
  };
}

function buildLLMRequest(provider, pageContent, modelName, systemPrompt) {
  const defaultPrompt = 'Please analyze the following webpage content and provide a brief summary and key information:';

  // Use markdown format if available, otherwise fall back to plain text
  const contentFormat = pageContent.markdown ? 'Markdown' : 'Plain Text';
  let contentToAnalyze = pageContent.markdown || pageContent.text;

  // Smart content filtering to extract valuable information
  const MAX_CHARS = 12000;
  const needsFiltering = contentToAnalyze.length > MAX_CHARS;

  if (needsFiltering) {
    contentToAnalyze = filterImportantContent(contentToAnalyze, MAX_CHARS);
  }

  const userPrompt = `${defaultPrompt}

Page Title: ${pageContent.metadata.title}
Page URL: ${pageContent.metadata.url}
Content Format: ${contentFormat}
Original Word Count: ${pageContent.wordCount}${needsFiltering ? ' (filtered for key content)' : ''}

Page Content:
${contentToAnalyze}`;

  return buildLLMRequestBody(provider, modelName, userPrompt, systemPrompt, {
    maxTokens: 1500,
    temperature: 0.7
  });
}

function filterImportantContent(content, maxChars) {
  // Split content into sections
  const lines = content.split('\n');
  const sections = [];
  let currentSection = { type: 'paragraph', content: '', priority: 0 };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentSection.content) {
        sections.push(currentSection);
        currentSection = { type: 'paragraph', content: '', priority: 0 };
      }
      continue;
    }

    // Detect section type and priority
    if (trimmed.startsWith('# ')) {
      if (currentSection.content) sections.push(currentSection);
      currentSection = { type: 'h1', content: trimmed, priority: 100 };
    } else if (trimmed.startsWith('## ')) {
      if (currentSection.content) sections.push(currentSection);
      currentSection = { type: 'h2', content: trimmed, priority: 90 };
    } else if (trimmed.startsWith('### ')) {
      if (currentSection.content) sections.push(currentSection);
      currentSection = { type: 'h3', content: trimmed, priority: 80 };
    } else if (trimmed.startsWith('#### ') || trimmed.startsWith('##### ') || trimmed.startsWith('###### ')) {
      if (currentSection.content) sections.push(currentSection);
      currentSection = { type: 'heading', content: trimmed, priority: 70 };
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\./.test(trimmed)) {
      currentSection.content += (currentSection.content ? '\n' : '') + trimmed;
      currentSection.type = 'list';
      currentSection.priority = Math.max(currentSection.priority, 60);
    } else if (trimmed.startsWith('```')) {
      currentSection.content += (currentSection.content ? '\n' : '') + trimmed;
      currentSection.type = 'code';
      currentSection.priority = Math.max(currentSection.priority, 50);
    } else {
      currentSection.content += (currentSection.content ? '\n' : '') + trimmed;

      // Calculate priority based on content quality
      const wordCount = trimmed.split(/\s+/).length;

      // Longer paragraphs are often more informative
      if (wordCount > 20) {
        currentSection.priority = Math.max(currentSection.priority, 40);
      }

      // Keywords that indicate important content
      const importantKeywords = ['summary', 'conclusion', 'key', 'important', 'main', 'result', 'finding', 'objective', 'goal', 'purpose'];
      const hasImportantKeyword = importantKeywords.some(keyword =>
        trimmed.toLowerCase().includes(keyword)
      );

      if (hasImportantKeyword) {
        currentSection.priority = Math.max(currentSection.priority, 50);
      }
    }
  }

  if (currentSection.content) {
    sections.push(currentSection);
  }

  // Remove duplicate sections
  const uniqueSections = [];
  const seenContent = new Set();

  for (const section of sections) {
    const normalized = section.content.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!seenContent.has(normalized) || section.priority > 70) {
      uniqueSections.push(section);
      seenContent.add(normalized);
    }
  }

  // Sort by priority
  uniqueSections.sort((a, b) => b.priority - a.priority);

  // Build filtered content
  let filteredContent = '';
  let currentLength = 0;

  // Always include all headings first
  for (const section of uniqueSections) {
    if (section.type.startsWith('h') || section.type === 'heading') {
      filteredContent += section.content + '\n\n';
      currentLength += section.content.length + 2;
    }
  }

  // Add other important sections
  for (const section of uniqueSections) {
    if (section.type.startsWith('h') || section.type === 'heading') {
      continue; // Already added
    }

    const sectionLength = section.content.length + 2;
    if (currentLength + sectionLength <= maxChars) {
      filteredContent += section.content + '\n\n';
      currentLength += sectionLength;
    } else if (currentLength < maxChars * 0.9) {
      // Add partial content if we have room
      const remainingSpace = maxChars - currentLength - 50;
      if (remainingSpace > 100) {
        const partial = section.content.substring(0, remainingSpace);
        const lastPeriod = partial.lastIndexOf('.');
        if (lastPeriod > remainingSpace * 0.8) {
          filteredContent += partial.substring(0, lastPeriod + 1) + '\n\n';
        }
      }
      break;
    } else {
      break;
    }
  }

  filteredContent += '\n[Note: Content filtered to extract key information]\n';

  return filteredContent.trim();
}

function buildLLMHeaders(provider, apiKey) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (provider === 'openai' || provider === 'custom') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  }

  return headers;
}

function extractLLMResponse(provider, data) {
  if (provider === 'openai' || provider === 'custom') {
    return data.choices?.[0]?.message?.content || 'Unable to get response content';
  } else if (provider === 'anthropic') {
    return data.content?.[0]?.text || 'Unable to get response content';
  }

  return 'Unable to parse response content';
}

function extractTokenUsage(provider, data) {
  try {
    if (provider === 'openai' || provider === 'custom') {
      // OpenAI format: { usage: { prompt_tokens, completion_tokens, total_tokens } }
      const usage = data.usage;
      if (usage) {
        return {
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0
        };
      }
    } else if (provider === 'anthropic') {
      // Anthropic format: { usage: { input_tokens, output_tokens } }
      const usage = data.usage;
      if (usage) {
        return {
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
        };
      }
    }
  } catch (error) {
    console.error('[AutoFeel] Failed to extract token usage:', error);
  }
  return null;
}

async function updateTokenUsage(provider, usage) {
  try {
    // Get current token usage stats
    const { tokenUsage } = await chrome.storage.local.get(['tokenUsage']);

    // Initialize if not exists
    const stats = tokenUsage || {
      total: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      },
      byProvider: {
        openai: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
        anthropic: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
        custom: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 }
      },
      lastUpdated: null
    };

    // Update total
    stats.total.inputTokens += usage.inputTokens;
    stats.total.outputTokens += usage.outputTokens;
    stats.total.totalTokens += usage.totalTokens;

    // Update by provider
    if (stats.byProvider[provider]) {
      stats.byProvider[provider].inputTokens += usage.inputTokens;
      stats.byProvider[provider].outputTokens += usage.outputTokens;
      stats.byProvider[provider].totalTokens += usage.totalTokens;
      stats.byProvider[provider].requestCount += 1;
    }

    stats.lastUpdated = new Date().toISOString();

    // Save updated stats
    await chrome.storage.local.set({ tokenUsage: stats });

    console.log('[AutoFeel] Token usage updated:', usage);
  } catch (error) {
    console.error('[AutoFeel] Failed to update token usage:', error);
  }
}

async function generateFormAnswers(formFields, savedContext, config) {
  const { llmProvider, apiKey, apiEndpoint, modelName } = config;

  try {
    // ==================== RAG: Retrieve Relevant Knowledge ====================
    let retrievedContext = '';
    let retrievalStats = null;

    // Step 1: Build query from form fields
    const queryText = formFields.map(field =>
      `${field.label || ''} ${field.placeholder || ''}`
    ).filter(text => text.trim()).join(' ');

    console.log('[AutoFeel RAG] Query text:', queryText);

    // Step 2: Generate embedding for query (only if OpenAI/custom provider)
    if (queryText && (llmProvider === 'openai' || llmProvider === 'custom')) {
      try {
        const queryEmbedding = await generateEmbedding(queryText, config);

        if (queryEmbedding) {
          console.log('[AutoFeel RAG] Generated query embedding, dimensions:', queryEmbedding.length);

          // Step 3: Semantic search in knowledge base
          await memoryDB.init();
          const searchResults = await memoryDB.semanticSearch(queryEmbedding, 5); // Top 5 results

          if (searchResults && searchResults.length > 0) {
            console.log(`[AutoFeel RAG] Found ${searchResults.length} relevant chunks`);

            retrievalStats = {
              totalChunks: searchResults.length,
              avgSimilarity: (searchResults.reduce((sum, r) => sum + r.similarity, 0) / searchResults.length).toFixed(3),
              topSimilarity: searchResults[0].similarity.toFixed(3)
            };

            // Step 4: Format retrieved chunks into context
            retrievedContext = searchResults.map((chunk, index) => {
              return `[Retrieved Knowledge ${index + 1}] (Relevance: ${(chunk.similarity * 100).toFixed(1)}%)
Source: ${chunk.source.title}
Content: ${chunk.text}`;
            }).join('\n\n');

            console.log('[AutoFeel RAG] Retrieval stats:', retrievalStats);
          } else {
            console.log('[AutoFeel RAG] No relevant chunks found in knowledge base');
          }
        } else {
          console.log('[AutoFeel RAG] Failed to generate query embedding');
        }
      } catch (ragError) {
        console.error('[AutoFeel RAG] Retrieval error:', ragError);
        // Continue without RAG if retrieval fails
      }
    } else {
      console.log('[AutoFeel RAG] Skipping RAG (no query or unsupported provider)');
    }

    // ==================== Build Enhanced Prompt with RAG ====================
    const systemPrompt = `You are an AI assistant that helps fill out forms based on provided information.
You will receive:
1. Retrieved knowledge from the user's personal knowledge base (if available)
2. Information from a previous page (the user's background, resume, or other context)
3. A list of form fields with their questions/labels

Your task is to generate appropriate answers for each form field based on ALL the provided context.
**Prioritize information from the retrieved knowledge base when available**, as it represents the user's curated information.

Respond ONLY with a JSON object where keys are field IDs and values are the answers.

Example response format:
{
  "field_0": "answer for first field",
  "field_1": "answer for second field"
}`;

    // Build user prompt with RAG context
    let userPrompt = '';

    // Add retrieved knowledge first (highest priority)
    if (retrievedContext) {
      userPrompt += `=== RETRIEVED KNOWLEDGE FROM USER'S KNOWLEDGE BASE ===
${retrievedContext}

`;
    }

    // Add saved context from previous page
    userPrompt += `=== CONTEXT FROM PREVIOUS PAGE ===
${savedContext.pageContent.text}

Previous LLM Analysis:
${savedContext.llmAnalysis}

`;

    // Add form fields
    userPrompt += `=== FORM FIELDS TO FILL ===
${formFields.map((field, index) =>
  `Field ${index} (ID: field_${index}):
  Label: ${field.label}
  Placeholder: ${field.placeholder}
  Type: ${field.type}
  Current Value: ${field.value}
`).join('\n')}

Please generate appropriate answers for each field based on the context provided above.
${retrievedContext ? '**Prioritize information from the retrieved knowledge base.**' : ''}
Return ONLY a JSON object.`;

    const requestBody = buildFormFillingRequest(llmProvider, systemPrompt, userPrompt, modelName);
    const headers = buildLLMHeaders(llmProvider, apiKey);

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `API request failed (${response.status}): ${errorText}`
      };
    }

    const data = await response.json();
    const content = extractLLMResponse(llmProvider, data);

    // Extract and save token usage
    const tokenUsage = extractTokenUsage(llmProvider, data);
    if (tokenUsage) {
      await updateTokenUsage(llmProvider, tokenUsage);
    }

    // Parse JSON response
    console.log('[AutoFeel] LLM raw response:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AutoFeel] No JSON found in LLM response');
      return {
        success: false,
        error: 'LLM did not return valid JSON'
      };
    }

    const answers = JSON.parse(jsonMatch[0]);
    console.log('[AutoFeel] Parsed answers:', JSON.stringify(answers, null, 2));
    console.log(`[AutoFeel] Number of answers: ${Object.keys(answers).length}`);

    return {
      success: true,
      data: answers,
      tokenUsage: tokenUsage,
      retrievalStats: retrievalStats // Include RAG stats
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

function buildFormFillingRequest(provider, systemPrompt, userPrompt, modelName) {
  return buildLLMRequestBody(provider, modelName, userPrompt, systemPrompt, {
    maxTokens: 2000,
    temperature: 0.7
  });
}

async function showResult(tabId, pageContent, llmResponse, config) {
  await chrome.storage.local.set({
    lastResult: {
      pageContent: pageContent,
      llmResponse: llmResponse,
      config: config,
      timestamp: new Date().toISOString()
    }
  });

  await chrome.tabs.create({
    url: chrome.runtime.getURL('result.html'),
    index: (await chrome.tabs.get(tabId)).index + 1
  });
}

async function testAPIConnection(config) {
  const { provider, apiKey, endpoint, model } = config;

  try {
    const testContent = {
      text: 'Hello, this is a test message.',
      metadata: {
        title: 'Test',
        url: 'https://test.com'
      }
    };

    const requestBody = buildLLMRequest(provider, testContent, model, '');
    if (requestBody.max_tokens) {
      requestBody.max_tokens = 50;
    }

    const headers = buildLLMHeaders(provider, apiKey);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `API returned error (${response.status}): ${errorText}`
      };
    }

    await response.json();

    return {
      success: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TEST_API') {
    testAPIConnection(request.config).then(sendResponse);
    return true;
  } else if (request.type === 'RESET_TOKEN_USAGE') {
    resetTokenUsage().then(sendResponse);
    return true;
  } else if (request.type === 'GENERATE_EMBEDDING') {
    // Generate embedding for semantic search
    generateEmbedding(request.text, request.config).then(embedding => {
      sendResponse({ success: true, embedding: embedding });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

async function resetTokenUsage() {
  try {
    await chrome.storage.local.set({
      tokenUsage: {
        total: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0
        },
        byProvider: {
          openai: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
          anthropic: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 },
          custom: { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 }
        },
        lastUpdated: new Date().toISOString()
      }
    });
    console.log('[AutoFeel] Token usage reset');
    return { success: true };
  } catch (error) {
    console.error('[AutoFeel] Failed to reset token usage:', error);
    return { success: false, error: error.message };
  }
}

// ==================== Utility Functions ====================

/**
 * Generate UUID v4
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Detect language from text (simple heuristic)
 */
function detectLanguage(text) {
  // Check for Chinese characters
  if (/[\u4e00-\u9fa5]/.test(text)) {
    return 'zh';
  }
  // Check for Japanese characters
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
    return 'ja';
  }
  // Check for Korean characters
  if (/[\uac00-\ud7af]/.test(text)) {
    return 'ko';
  }
  // Default to English
  return 'en';
}

/**
 * Generate embedding vector for text using OpenAI API
 * @param {string} text - Text to generate embedding for
 * @param {object} config - API configuration
 * @returns {Promise<Array>} - Embedding vector (1536 dimensions for text-embedding-3-small)
 */
async function generateEmbedding(text, config) {
  const { llmProvider, apiKey, apiEndpoint } = config;

  // Only support OpenAI and custom endpoints for embeddings
  if (llmProvider !== 'openai' && llmProvider !== 'custom') {
    console.warn('[AutoFeel] Embeddings only supported for OpenAI provider');
    return null;
  }

  try {
    // Determine embedding endpoint
    let embeddingEndpoint;
    if (llmProvider === 'openai') {
      embeddingEndpoint = 'https://api.openai.com/v1/embeddings';
    } else {
      // For custom endpoints, assume embeddings are at /embeddings
      const baseUrl = apiEndpoint.replace(/\/chat\/completions$/, '');
      embeddingEndpoint = `${baseUrl}/embeddings`;
    }

    const requestBody = {
      input: text,
      model: 'text-embedding-3-small', // 1536 dimensions, cost-effective
      encoding_format: 'float'
    };

    const response = await fetch(embeddingEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AutoFeel] Embedding API error:', errorText);
      return null;
    }

    const data = await response.json();

    if (data.data && data.data[0] && data.data[0].embedding) {
      return data.data[0].embedding;
    } else {
      console.error('[AutoFeel] Invalid embedding response:', data);
      return null;
    }
  } catch (error) {
    console.error('[AutoFeel] Failed to generate embedding:', error);
    return null;
  }
}

/**
 * Generate embeddings for multiple chunks in batch
 * @param {Array} chunks - Array of chunk objects with text field
 * @param {object} config - API configuration
 * @returns {Promise<Array>} - Array of chunk objects with embeddings added
 */
async function generateChunkEmbeddings(chunks, config) {
  const chunksWithEmbeddings = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Generate embedding for chunk text
    const embedding = await generateEmbedding(chunk.text, config);

    chunksWithEmbeddings.push({
      ...chunk,
      embedding: embedding
    });

    // Log progress
    if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
      console.log(`[AutoFeel] Generated embeddings for ${i + 1}/${chunks.length} chunks`);
    }

    // Small delay to avoid rate limits
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return chunksWithEmbeddings;
}

// ==================== Text Cleaning Pipeline ====================

/**
 * Step 1: LLM Pre-Cleaning - Structured extraction using LLM
 */
async function llmPreCleaning(rawContent, config) {
  const { llmProvider, apiKey, apiEndpoint, modelName } = config;

  try {
    const systemPrompt = `You are a text extraction and structuring expert. Your task is to:
1. Extract the main content and remove noise (ads, navigation, repeated elements)
2. Identify key topics and entities
3. Structure the text in a clean, readable format
4. **Intelligently divide the content into semantic chunks** based on topic/theme changes
5. Detect the primary language of the content

Return a JSON object with:
{
  "structuredText": "clean, well-formatted text",
  "language": "en",
  "mainTopics": ["topic1", "topic2"],
  "keyPoints": ["point1", "point2"],
  "entities": {
    "people": [],
    "organizations": [],
    "locations": [],
    "dates": []
  },
  "semanticChunks": [
    {
      "topic": "chunk topic or theme",
      "text": "chunk content",
      "importance": 0.8,
      "keyEntities": ["entity1", "entity2"],
      "blockType": "paragraph"
    }
  ]
}

For language: Use ISO 639-1 codes (en, zh, ja, ko, es, fr, de, etc.)
For blockType: Use "paragraph", "list", "code", "quote", "heading", etc.
For semantic chunks:
- Divide based on topic/theme transitions, NOT fixed sentence counts
- Each chunk should represent a coherent idea or concept
- Assign importance 0.0-1.0 based on relevance to main topics
- Extract key entities mentioned in each chunk`;

    const userPrompt = `Please analyze and structure the following content:

Source: ${rawContent.source === 'selection' ? 'User Selection' : 'Full Page'}
Title: ${rawContent.metadata.title}
URL: ${rawContent.metadata.url}
Word Count: ${rawContent.wordCount}

Content:
${rawContent.text}

Extract the main content, identify key topics and entities, divide into semantic chunks, and return structured JSON.`;

    const requestBody = buildFormFillingRequest(llmProvider, systemPrompt, userPrompt, modelName);
    const headers = buildLLMHeaders(llmProvider, apiKey);

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `API request failed (${response.status}): ${errorText}`
      };
    }

    const data = await response.json();
    const content = extractLLMResponse(llmProvider, data);

    // Extract and save token usage
    const tokenUsage = extractTokenUsage(llmProvider, data);
    if (tokenUsage) {
      await updateTokenUsage(llmProvider, tokenUsage);
    }

    // Parse JSON response
    console.log('[AutoFeel] LLM Pre-Cleaning raw response:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[AutoFeel] No JSON found in LLM pre-cleaning response');
      // Fallback: use the raw content
      return {
        success: true,
        data: {
          structuredText: rawContent.text,
          mainTopics: [],
          keyPoints: [],
          entities: {}
        },
        tokenUsage: tokenUsage
      };
    }

    const result = JSON.parse(jsonMatch[0]);
    console.log('[AutoFeel] LLM Pre-Cleaning result:', result);

    return {
      success: true,
      data: result,
      tokenUsage: tokenUsage,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[AutoFeel] LLM Pre-Cleaning error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Step 2: Post-LLM Cleanup - Apply mechanical rules and sentence splitting
 */
function postLLMCleanup(llmResult) {
  try {
    let cleanedText = llmResult.structuredText;

    // Apply mechanical cleanup rules
    const appliedRules = [];

    // Rule 1: Remove excessive whitespace
    const before1 = cleanedText.length;
    cleanedText = cleanedText.replace(/\s+/g, ' ');
    if (cleanedText.length !== before1) {
      appliedRules.push('Remove excessive whitespace');
    }

    // Rule 2: Remove repeated punctuation
    cleanedText = cleanedText.replace(/([.!?])\1+/g, '$1');
    appliedRules.push('Normalize punctuation');

    // Rule 3: Trim whitespace around punctuation
    cleanedText = cleanedText.replace(/\s+([,.!?;:])/g, '$1');
    cleanedText = cleanedText.replace(/([,.!?;:])\s+/g, '$1 ');

    // Rule 4: Fix line breaks
    cleanedText = cleanedText.replace(/\n\s*\n\s*\n+/g, '\n\n');

    // Sentence splitting
    const sentences = cleanedText
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`[AutoFeel] Post-cleanup: ${sentences.length} sentences extracted`);

    return {
      cleanedText: cleanedText.trim(),
      sentences: sentences,
      appliedRules: appliedRules,
      sentenceCount: sentences.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[AutoFeel] Post-LLM Cleanup error:', error);
    return {
      cleanedText: llmResult.structuredText,
      sentences: [llmResult.structuredText],
      appliedRules: [],
      sentenceCount: 1,
      error: error.message
    };
  }
}

/**
 * Step 3: Chunk Builder - Use semantic chunks from LLM or fallback to smart rules
 */
function chunkBuilder(cleanupResult, llmResult) {
  try {
    let chunks = [];

    // Method 1: Use LLM-provided semantic chunks (preferred)
    if (llmResult.semanticChunks && llmResult.semanticChunks.length > 0) {
      console.log(`[AutoFeel] Using ${llmResult.semanticChunks.length} LLM semantic chunks`);

      chunks = llmResult.semanticChunks.map((chunk, index) => {
        // Determine position
        let position = 'middle';
        if (index === 0) position = 'start';
        if (index === llmResult.semanticChunks.length - 1) position = 'end';

        // Use topic as tag
        const tags = [chunk.topic];

        // Add main topics that are mentioned in this chunk
        if (llmResult.mainTopics && llmResult.mainTopics.length > 0) {
          llmResult.mainTopics.forEach(topic => {
            if (chunk.text.toLowerCase().includes(topic.toLowerCase()) && !tags.includes(topic)) {
              tags.push(topic);
            }
          });
        }

        // Add key entities as tags if provided
        if (chunk.keyEntities && chunk.keyEntities.length > 0) {
          chunk.keyEntities.forEach(entity => {
            if (!tags.includes(entity)) {
              tags.push(entity);
            }
          });
        }

        const wordCount = chunk.text.split(/\s+/).length;
        const sentenceCount = chunk.text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;

        return {
          id: index + 1,
          text: chunk.text,
          topic: chunk.topic,
          tags: tags,
          blockType: chunk.blockType || 'paragraph',
          metadata: {
            position: position,
            wordCount: wordCount,
            importance: chunk.importance || 0.5,
            sentenceCount: sentenceCount,
            keyEntities: chunk.keyEntities || []
          }
        };
      });
    }
    // Method 2: Fallback to paragraph-based semantic chunking
    else {
      console.log('[AutoFeel] LLM did not provide semantic chunks, using paragraph-based fallback');

      const text = cleanupResult.cleanedText;

      // Split by double line breaks (paragraphs)
      const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

      if (paragraphs.length === 0) {
        // Ultimate fallback: split by sentences with grouping
        const sentences = cleanupResult.sentences;
        const CHUNK_SIZE = 5; // Increased from 3 for better semantic grouping

        for (let i = 0; i < sentences.length; i += CHUNK_SIZE) {
          const chunkSentences = sentences.slice(i, i + CHUNK_SIZE);
          const chunkText = chunkSentences.join(' ');

          chunks.push(createChunkFromText(chunkText, i, sentences.length, llmResult));
        }
      } else {
        // Use paragraphs as semantic chunks
        paragraphs.forEach((para, index) => {
          chunks.push(createChunkFromText(para, index, paragraphs.length, llmResult));
        });
      }
    }

    console.log(`[AutoFeel] Built ${chunks.length} chunks`);

    return {
      chunks: chunks,
      totalChunks: chunks.length,
      chunkingMethod: llmResult.semanticChunks ? 'llm-semantic' : 'paragraph-based',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[AutoFeel] Chunk Builder error:', error);
    return {
      chunks: [],
      totalChunks: 0,
      error: error.message
    };
  }
}

/**
 * Helper function to create a chunk from text (for fallback method)
 */
function createChunkFromText(text, index, total, llmResult) {
  // Determine position
  let position = 'middle';
  if (index === 0) position = 'start';
  if (index >= total - 1) position = 'end';

  // Calculate importance (based on key points mentions)
  let importance = 0.5;
  if (llmResult.keyPoints && llmResult.keyPoints.length > 0) {
    const mentionCount = llmResult.keyPoints.filter(kp =>
      text.toLowerCase().includes(kp.toLowerCase())
    ).length;
    importance = Math.min(1.0, 0.3 + (mentionCount * 0.2));
  }

  // Auto-tag based on topics
  const tags = [];
  if (llmResult.mainTopics && llmResult.mainTopics.length > 0) {
    llmResult.mainTopics.forEach(topic => {
      if (text.toLowerCase().includes(topic.toLowerCase())) {
        tags.push(topic);
      }
    });
  }

  // Extract first meaningful words as topic
  const firstSentence = text.split(/[.!?]/)[0].trim();
  const topic = firstSentence.substring(0, 50) + (firstSentence.length > 50 ? '...' : '');

  const wordCount = text.split(/\s+/).length;
  const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;

  return {
    id: index + 1,
    text: text,
    topic: topic,
    tags: tags.length > 0 ? tags : ['General'],
    blockType: 'paragraph', // Default to paragraph for fallback
    metadata: {
      position: position,
      wordCount: wordCount,
      importance: importance,
      sentenceCount: sentenceCount,
      keyEntities: []
    }
  };
}

/**
 * Step 4: Build Memory-Ready Data - Final structured data
 */
function buildMemoryReadyData(chunks, rawContent, llmResult, cleanupResult) {
  try {
    // Combine all chunks into clean text
    const cleanText = chunks.map(c => c.text).join('\n\n');

    const memoryReady = {
      cleanText: cleanText,
      chunks: chunks,
      metadata: {
        source: rawContent.source,
        sourceUrl: rawContent.metadata.url,
        sourceTitle: rawContent.metadata.title,
        processedAt: new Date().toISOString(),
        totalChunks: chunks.length,
        totalSentences: cleanupResult.sentenceCount,
        totalWords: cleanText.split(/\s+/).length,
        mainTopics: llmResult.mainTopics || [],
        keyPoints: llmResult.keyPoints || [],
        entities: llmResult.entities || {}
      }
    };

    console.log('[AutoFeel] Memory-ready data built:', memoryReady.metadata);

    return memoryReady;
  } catch (error) {
    console.error('[AutoFeel] Build Memory-Ready Data error:', error);
    return {
      cleanText: '',
      chunks: [],
      metadata: {},
      error: error.message
    };
  }
}

// ==================== Schema Builders ====================

/**
 * Build Document-Level Schema
 */
function buildDocumentSchema(rawContent, llmResult, memoryReady) {
  const docId = generateUUID();
  const capturedAt = new Date().toISOString();

  // Detect language (use LLM result if available, fallback to heuristic)
  const language = llmResult.language || detectLanguage(rawContent.text);

  const documentSchema = {
    doc_id: docId,
    title: rawContent.metadata.title,
    url: rawContent.metadata.url,
    captured_at: capturedAt,
    source_type: rawContent.source === 'selection' ? 'web_selection' : 'web_page',
    raw_text: rawContent.text,
    clean_text: memoryReady.cleanText,
    metadata: {
      language: language,
      length: memoryReady.cleanText.length,
      tags: llmResult.mainTopics || [],
      llm_cleaner_version: '1.0.0',
      word_count: memoryReady.metadata.totalWords,
      chunk_count: memoryReady.metadata.totalChunks,
      entities: llmResult.entities || {},
      key_points: llmResult.keyPoints || []
    }
  };

  console.log('[AutoFeel] Document schema built:', docId);
  return { docId, documentSchema };
}

/**
 * Build Chunk-Level Schemas
 */
function buildChunkSchemas(docId, chunks, rawContent, llmResult) {
  const createdAt = new Date().toISOString();
  const language = llmResult.language || detectLanguage(rawContent.text);

  const chunkSchemas = chunks.map((chunk, index) => {
    const chunkId = generateUUID();

    // Count tokens (rough approximation: words * 1.3)
    const wordCount = chunk.metadata.wordCount;
    const tokenCount = Math.round(wordCount * 1.3);

    return {
      chunk_id: chunkId,
      doc_id: docId,
      order: index,
      text: chunk.text,
      embedding: null, // TODO: Generate embeddings via OpenAI/Anthropic API

      block_type: chunk.blockType || 'paragraph',
      importance: chunk.metadata.importance,
      created_at: createdAt,

      source: {
        title: rawContent.metadata.title,
        url: rawContent.metadata.url
      },

      metadata: {
        language: language,
        from_selection: rawContent.source === 'selection',
        tags: chunk.tags || [],
        sentence_count: chunk.metadata.sentenceCount,
        token_count: tokenCount,
        word_count: wordCount,
        position: chunk.metadata.position,
        topic: chunk.topic || '',
        key_entities: chunk.metadata.keyEntities || []
      }
    };
  });

  console.log(`[AutoFeel] Built ${chunkSchemas.length} chunk schemas`);
  return chunkSchemas;
}
