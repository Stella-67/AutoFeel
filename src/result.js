// result.js - Display text processing pipeline results

let pipelineData = null;

// Load data when page loads
document.addEventListener('DOMContentLoaded', async () => {
  await loadPipelineData();
  setupTabNavigation();
  setupEventListeners();
});

async function loadPipelineData() {
  try {
    const { lastResult } = await chrome.storage.local.get(['lastResult']);

    if (!lastResult || !lastResult.pipelineData) {
      document.querySelector('.container').innerHTML = `
        <div style="padding: 40px; text-align: center;">
          <h2>No data found</h2>
          <p>Please run Option+C on a webpage to analyze content.</p>
        </div>
      `;
      return;
    }

    pipelineData = lastResult.pipelineData;
    displayAllData();
  } catch (error) {
    console.error('[AutoFeel] Failed to load pipeline data:', error);
    document.querySelector('.container').innerHTML = `
      <div style="padding: 40px; text-align: center;">
        <h2>Error loading data</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function displayAllData() {
  if (!pipelineData) return;

  // Overview Tab
  displayOverview();

  // Raw Content Tab
  displayRawContent();

  // Pre-Cleaning Tab
  displayPreCleaning();

  // Post-Cleanup Tab
  displayPostCleanup();

  // Chunks Tab
  displayChunks();

  // Memory-Ready Tab
  displayMemoryReady();

  // Schemas Tab
  displaySchemas();
}

function displayOverview() {
  const { rawContent, llmPreCleaning, postCleanup, chunkResult, memoryReady, totalTokenUsage } = pipelineData;

  // Page Information
  document.getElementById('source').textContent = rawContent.source === 'selection' ? 'User Selection' : 'Full Page';
  document.getElementById('page-title').textContent = rawContent.metadata.title;
  const urlEl = document.getElementById('page-url');
  urlEl.textContent = rawContent.metadata.url;
  urlEl.href = rawContent.metadata.url;
  document.getElementById('timestamp').textContent = new Date(memoryReady.metadata.processedAt).toLocaleString();

  // Processing Summary
  document.getElementById('raw-words').textContent = rawContent.wordCount.toLocaleString();
  document.getElementById('total-sentences').textContent = memoryReady.metadata.totalSentences.toLocaleString();
  document.getElementById('total-chunks').textContent = memoryReady.metadata.totalChunks.toLocaleString();
  if (totalTokenUsage) {
    document.getElementById('total-tokens').textContent = totalTokenUsage.totalTokens.toLocaleString();
  }

  // Main Topics
  const topicsContainer = document.getElementById('main-topics');
  if (memoryReady.metadata.mainTopics && memoryReady.metadata.mainTopics.length > 0) {
    topicsContainer.innerHTML = memoryReady.metadata.mainTopics
      .map(topic => `<span class="tag">${Utils.escapeHtml(topic)}</span>`)
      .join('');
  } else {
    topicsContainer.innerHTML = '<p class="no-data">No topics identified</p>';
  }

  // Key Points
  const keyPointsList = document.getElementById('key-points');
  if (memoryReady.metadata.keyPoints && memoryReady.metadata.keyPoints.length > 0) {
    keyPointsList.innerHTML = memoryReady.metadata.keyPoints
      .map(point => `<li>${Utils.escapeHtml(point)}</li>`)
      .join('');
  } else {
    keyPointsList.innerHTML = '<li class="no-data">No key points identified</li>';
  }

  // Extracted Entities
  const entitiesContainer = document.getElementById('entities');
  const entities = memoryReady.metadata.entities;
  if (entities && Object.keys(entities).length > 0) {
    let html = '';
    for (const [type, items] of Object.entries(entities)) {
      if (items && items.length > 0) {
        html += `
          <div class="entity-group">
            <h4>${Utils.capitalize(type)}</h4>
            <div class="tags-container">
              ${items.map(item => `<span class="tag entity-tag">${Utils.escapeHtml(item)}</span>`).join('')}
            </div>
          </div>
        `;
      }
    }
    entitiesContainer.innerHTML = html || '<p class="no-data">No entities extracted</p>';
  } else {
    entitiesContainer.innerHTML = '<p class="no-data">No entities extracted</p>';
  }
}

function displayRawContent() {
  const { rawContent } = pipelineData;
  const container = document.getElementById('raw-content');
  container.textContent = rawContent.text;
}

function displayPreCleaning() {
  const { llmPreCleaning } = pipelineData;

  if (llmPreCleaning.tokenUsage) {
    const usage = llmPreCleaning.tokenUsage;
    document.getElementById('precleaning-tokens').textContent =
      `${usage.totalTokens.toLocaleString()} (${usage.inputTokens.toLocaleString()} in, ${usage.outputTokens.toLocaleString()} out)`;
  }

  if (llmPreCleaning.timestamp) {
    document.getElementById('precleaning-timestamp').textContent = new Date(llmPreCleaning.timestamp).toLocaleString();
  }

  const container = document.getElementById('precleaning-content');
  container.textContent = llmPreCleaning.structuredText;
}

function displayPostCleanup() {
  const { postCleanup } = pipelineData;

  document.getElementById('cleanup-sentences').textContent = postCleanup.sentenceCount.toLocaleString();
  document.getElementById('cleanup-rules').textContent = postCleanup.appliedRules.join(', ');

  const container = document.getElementById('cleanup-content');
  container.textContent = postCleanup.cleanedText;
}

function displayChunks() {
  const { chunkResult } = pipelineData;
  const container = document.getElementById('chunks-container');

  // Display chunking method
  const methodEl = document.getElementById('chunking-method');
  if (chunkResult.chunkingMethod) {
    const methodLabels = {
      'llm-semantic': 'LLM Semantic Analysis',
      'paragraph-based': 'Paragraph-based (Fallback)'
    };
    methodEl.textContent = methodLabels[chunkResult.chunkingMethod] || chunkResult.chunkingMethod;
    methodEl.style.color = chunkResult.chunkingMethod === 'llm-semantic' ? '#4CAF50' : '#FF9800';
    methodEl.style.fontWeight = '600';
  }

  if (!chunkResult.chunks || chunkResult.chunks.length === 0) {
    container.innerHTML = '<p class="no-data">No chunks available</p>';
    return;
  }

  container.innerHTML = chunkResult.chunks.map((chunk, index) => {
    const importancePercent = Math.round(chunk.metadata.importance * 100);
    const importanceClass = chunk.metadata.importance > 0.7 ? 'high' : chunk.metadata.importance > 0.4 ? 'medium' : 'low';

    return `
      <div class="chunk-card">
        <div class="chunk-header">
          <span class="chunk-id">Chunk ${chunk.id}</span>
          <span class="chunk-position ${chunk.metadata.position}">${chunk.metadata.position}</span>
          <span class="chunk-importance ${importanceClass}">Importance: ${importancePercent}%</span>
        </div>
        ${chunk.topic ? `<div class="chunk-topic"><strong>Topic:</strong> ${Utils.escapeHtml(chunk.topic)}</div>` : ''}
        <div class="chunk-tags">
          ${chunk.tags.map(tag => `<span class="tag">${Utils.escapeHtml(tag)}</span>`).join('')}
          ${chunk.metadata.keyEntities && chunk.metadata.keyEntities.length > 0 ?
            chunk.metadata.keyEntities.map(entity => `<span class="tag entity-tag">${Utils.escapeHtml(entity)}</span>`).join('') : ''}
        </div>
        <div class="chunk-text">${Utils.escapeHtml(chunk.text)}</div>
        <div class="chunk-meta">
          ${chunk.metadata.wordCount} words | ${chunk.metadata.sentenceCount} sentences
        </div>
      </div>
    `;
  }).join('');
}

function displayMemoryReady() {
  const { memoryReady } = pipelineData;

  document.getElementById('memory-chunks').textContent = memoryReady.metadata.totalChunks.toLocaleString();
  document.getElementById('memory-words').textContent = memoryReady.metadata.totalWords.toLocaleString();
  document.getElementById('memory-sentences').textContent = memoryReady.metadata.totalSentences.toLocaleString();

  const container = document.getElementById('memory-content');
  container.textContent = memoryReady.cleanText;
}

function displaySchemas() {
  const { documentSchema, chunkSchemas } = pipelineData;

  if (!documentSchema || !chunkSchemas) {
    document.getElementById('tab-schemas').innerHTML = '<p class="no-data" style="padding: 40px; text-align: center;">Schema data not available</p>';
    return;
  }

  // Display document schema info
  document.getElementById('schema-doc-id').textContent = documentSchema.doc_id;
  document.getElementById('schema-source-type').textContent = documentSchema.source_type;
  document.getElementById('schema-language').textContent = documentSchema.metadata.language;
  document.getElementById('schema-captured-at').textContent = new Date(documentSchema.captured_at).toLocaleString();

  // Display full document schema as formatted JSON
  const docSchemaContainer = document.getElementById('document-schema-json');
  docSchemaContainer.textContent = JSON.stringify(documentSchema, null, 2);

  // Display chunk schemas info
  document.getElementById('schema-total-chunks').textContent = chunkSchemas.length.toLocaleString();

  // Display all chunk schemas as formatted JSON
  const chunkSchemasContainer = document.getElementById('chunk-schemas-json');
  chunkSchemasContainer.textContent = JSON.stringify(chunkSchemas, null, 2);
}

function setupTabNavigation() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active from all
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      // Add active to clicked
      button.classList.add('active');
      const tabId = 'tab-' + button.dataset.tab;
      document.getElementById(tabId).classList.add('active');
    });
  });
}

function setupEventListeners() {
  // Copy button
  document.getElementById('copy-btn').addEventListener('click', () => {
    if (!pipelineData) return;

    const textToCopy = pipelineData.memoryReady.cleanText;
    navigator.clipboard.writeText(textToCopy).then(() => {
      const btn = document.getElementById('copy-btn');
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    });
  });

  // Close button
  document.getElementById('close-btn').addEventListener('click', () => {
    window.close();
  });

  // Export JSON
  document.getElementById('export-json').addEventListener('click', () => {
    if (!pipelineData) return;
    Utils.exportData(
      JSON.stringify(pipelineData.memoryReady, null, 2),
      `autofeel-${Date.now()}.json`,
      'application/json'
    );
  });

  // Export Text
  document.getElementById('export-text').addEventListener('click', () => {
    if (!pipelineData) return;
    Utils.exportData(
      pipelineData.memoryReady.cleanText,
      `autofeel-${Date.now()}.txt`,
      'text/plain'
    );
  });

  // Export Document Schema
  document.getElementById('export-doc-schema').addEventListener('click', () => {
    if (!pipelineData || !pipelineData.documentSchema) return;
    Utils.exportData(
      JSON.stringify(pipelineData.documentSchema, null, 2),
      `document-schema-${Date.now()}.json`,
      'application/json'
    );
  });

  // Export Chunk Schemas
  document.getElementById('export-chunk-schemas').addEventListener('click', () => {
    if (!pipelineData || !pipelineData.chunkSchemas) return;
    Utils.exportData(
      JSON.stringify(pipelineData.chunkSchemas, null, 2),
      `chunk-schemas-${Date.now()}.json`,
      'application/json'
    );
  });

  // Export All Schemas
  document.getElementById('export-all-schemas').addEventListener('click', () => {
    if (!pipelineData || !pipelineData.documentSchema || !pipelineData.chunkSchemas) return;
    const allSchemas = {
      documentSchema: pipelineData.documentSchema,
      chunkSchemas: pipelineData.chunkSchemas
    };
    Utils.exportData(
      JSON.stringify(allSchemas, null, 2),
      `all-schemas-${Date.now()}.json`,
      'application/json'
    );
  });
}

// Helper functions (now using Utils module)
