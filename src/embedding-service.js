// ==================== Embedding Service ====================
// Vector embedding generation service

/**
 * Generate embedding vector for text using OpenAI API
 */
async function generateEmbedding(text, config) {
  const { llmProvider, apiKey, apiEndpoint } = config;

  if (llmProvider !== 'openai' && llmProvider !== 'custom') {
    console.warn('[AutoFeel Embedding] Only supported for OpenAI provider');
    return null;
  }

  try {
    let embeddingEndpoint;
    if (llmProvider === 'openai') {
      embeddingEndpoint = 'https://api.openai.com/v1/embeddings';
    } else {
      const baseUrl = apiEndpoint.replace(/\/chat\/completions$/, '');
      embeddingEndpoint = `${baseUrl}/embeddings`;
    }

    const requestBody = {
      input: text,
      model: 'text-embedding-3-small',
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
      console.error('[AutoFeel Embedding] API error:', errorText);
      return null;
    }

    const data = await response.json();

    if (data.data && data.data[0] && data.data[0].embedding) {
      return data.data[0].embedding;
    } else {
      console.error('[AutoFeel Embedding] Invalid response:', data);
      return null;
    }
  } catch (error) {
    console.error('[AutoFeel Embedding] Failed to generate embedding:', error);
    return null;
  }
}

/**
 * Generate embeddings for multiple chunks sequentially
 */
async function generateChunkEmbeddings(chunks, config) {
  const chunksWithEmbeddings = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await generateEmbedding(chunk.text, config);

    chunksWithEmbeddings.push({
      ...chunk,
      embedding: embedding
    });

    if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
      console.log(`[AutoFeel Embedding] Generated ${i + 1}/${chunks.length} embeddings`);
    }

    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  return chunksWithEmbeddings;
}
