// manager.js - Knowledge Manager Core Functions

let currentDocument = null;
let allDocuments = [];
let currentChunks = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await initializeManager();
  setupEventListeners();
  await loadAllDocuments();
});

async function initializeManager() {
  try {
    await memoryDB.init();
    console.log('[Manager] Database initialized');
  } catch (error) {
    console.error('[Manager] Failed to initialize database:', error);
    showNotification('Failed to initialize database', 'error');
  }
}

function setupEventListeners() {
  // View switcher
  document.getElementById('list-view-btn').addEventListener('click', () => switchView('list'));
  document.getElementById('graph-view-btn').addEventListener('click', () => switchView('graph'));

  // Header actions
  document.getElementById('search-btn').addEventListener('click', performGlobalSearch);
  document.getElementById('global-search').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performGlobalSearch();
  });
  document.getElementById('new-doc-btn').addEventListener('click', createNewDocument);
  document.getElementById('sync-btn').addEventListener('click', syncDatabase);

  // Left panel
  document.getElementById('sort-by').addEventListener('change', handleSortChange);
  document.getElementById('filter-btn').addEventListener('click', toggleFilters);

  // Center panel - Preview tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => switchPreviewTab(e.target.dataset.tab));
  });

  // Preview actions
  document.getElementById('edit-mode-btn').addEventListener('click', toggleEditMode);
  document.getElementById('star-btn').addEventListener('click', toggleStar);
  document.getElementById('copy-btn').addEventListener('click', copyCleanText);
  document.getElementById('add-tag-btn').addEventListener('click', showAddTagModal);

  // Right panel tabs
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', (e) => switchPanelTab(e.target.dataset.tab));
  });

  // Chunks tab
  document.getElementById('reorder-chunks-btn').addEventListener('click', reorderChunks);

  // Metadata tab
  document.getElementById('add-key-point-btn').addEventListener('click', addKeyPoint);
  document.getElementById('save-metadata-btn').addEventListener('click', saveMetadata);
  document.getElementById('reset-metadata-btn').addEventListener('click', resetMetadata);

  // Embeddings tab
  document.getElementById('regenerate-embeddings-btn').addEventListener('click', regenerateEmbeddings);
  document.getElementById('embed-selected-btn').addEventListener('click', embedSelectedChunks);

  // Actions tab
  document.getElementById('export-doc-btn').addEventListener('click', exportDocument);
  document.getElementById('duplicate-doc-btn').addEventListener('click', duplicateDocument);
  document.getElementById('rechunk-btn').addEventListener('click', rechunkDocument);
  document.getElementById('reclean-btn').addEventListener('click', recleanDocument);
  document.getElementById('reanalyze-btn').addEventListener('click', reanalyzeDocument);
  document.getElementById('delete-doc-btn').addEventListener('click', deleteDocument);

  // Modal
  document.getElementById('add-tag-confirm').addEventListener('click', confirmAddTag);
  document.getElementById('add-tag-cancel').addEventListener('click', closeAddTagModal);
}

// ==================== Document List Functions ====================

async function loadAllDocuments() {
  try {
    const sortBy = document.getElementById('sort-by').value;
    const order = sortBy === 'created_at' ? 'desc' : 'asc';

    allDocuments = await memoryDB.getAllDocuments({
      limit: 1000,
      sortBy: sortBy === 'word_count' ? 'created_at' : sortBy,
      order: order
    });

    // Sort by word_count if needed (not directly supported by index)
    if (sortBy === 'word_count') {
      allDocuments.sort((a, b) => b.metadata.word_count - a.metadata.word_count);
    }

    displayDocumentList(allDocuments);
    updateStats();
  } catch (error) {
    console.error('[Manager] Failed to load documents:', error);
    showNotification('Failed to load documents', 'error');
  }
}

function displayDocumentList(documents) {
  const listContainer = document.getElementById('document-list');

  if (!documents || documents.length === 0) {
    listContainer.innerHTML = '<p class="placeholder">No documents yet</p>';
    return;
  }

  listContainer.innerHTML = documents.map(doc => {
    const date = new Date(doc.captured_at).toLocaleDateString();
    const starred = doc.metadata.starred ? 'starred' : '';
    const tags = doc.metadata.tags || [];

    return `
      <div class="document-item ${starred}" data-doc-id="${doc.doc_id}">
        <div class="doc-title">${Utils.escapeHtml(doc.title)}</div>
        <div class="doc-meta">
          <span>${date}</span>
          <span>${doc.metadata.chunk_count} chunks</span>
        </div>
        ${tags.length > 0 ? `
          <div class="doc-tags">
            ${tags.slice(0, 3).map(tag => `<span class="doc-tag">${Utils.escapeHtml(tag)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // Add click event listeners to all document items
  document.querySelectorAll('.document-item').forEach(item => {
    item.addEventListener('click', function() {
      const docId = this.getAttribute('data-doc-id');
      selectDocument(docId);
    });
  });
}

async function selectDocument(docId) {
  try {
    // Load document and chunks
    const doc = await memoryDB.getDocument(docId);
    const chunks = await memoryDB.getChunksByDocId(docId);

    if (!doc) {
      showNotification('Document not found', 'error');
      return;
    }

    currentDocument = doc;
    currentChunks = chunks;

    // Update UI
    highlightSelectedDocument(docId);
    displayDocumentPreview(doc);
    displayChunks(chunks);
    displayMetadata(doc);
    displayEmbeddingsInfo(chunks);

  } catch (error) {
    console.error('[Manager] Failed to select document:', error);
    showNotification('Failed to load document', 'error');
  }
}

function highlightSelectedDocument(docId) {
  document.querySelectorAll('.document-item').forEach(item => {
    item.classList.remove('active');
  });

  const selectedItem = document.querySelector(`[data-doc-id="${docId}"]`);
  if (selectedItem) {
    selectedItem.classList.add('active');
  }
}

// ==================== Preview Functions ====================

function displayDocumentPreview(doc) {
  // Update header
  document.getElementById('preview-title').textContent = doc.title;

  // Update text viewers
  document.getElementById('clean-text-viewer').textContent = doc.clean_text;
  document.getElementById('raw-text-viewer').textContent = doc.raw_text;
  document.getElementById('diff-raw').textContent = doc.raw_text;
  document.getElementById('diff-clean').textContent = doc.clean_text;

  // Update metadata
  const sourceUrl = document.getElementById('source-url');
  sourceUrl.href = doc.url;
  sourceUrl.textContent = doc.url;

  document.getElementById('created-at').textContent = new Date(doc.captured_at).toLocaleString();
  document.getElementById('language').textContent = doc.metadata.language.toUpperCase();
  document.getElementById('word-count').textContent = doc.metadata.word_count.toLocaleString();

  // Update tags
  displayTags(doc.metadata.tags || []);

  // Update star button
  updateStarButton(doc.metadata.starred || false);
}

function displayTags(tags) {
  const container = document.getElementById('tags-container');
  container.innerHTML = tags.map(tag => `
    <span class="tag" data-tag="${Utils.escapeHtml(tag)}">
      ${Utils.escapeHtml(tag)}
      <span class="remove-tag">×</span>
    </span>
  `).join('');

  // Add click event listeners to remove buttons
  container.querySelectorAll('.remove-tag').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const tag = this.parentElement.getAttribute('data-tag');
      removeTag(tag);
    });
  });
}

function switchPreviewTab(tabName) {
  // Update buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

  // Update panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  document.getElementById(`tab-${tabName}`).classList.add('active');
}

// ==================== Chunks Functions ====================

function displayChunks(chunks) {
  const container = document.getElementById('chunks-list');
  document.getElementById('chunks-count').textContent = `${chunks.length} chunks`;

  if (!chunks || chunks.length === 0) {
    container.innerHTML = '<p class="placeholder">No chunks available</p>';
    return;
  }

  container.innerHTML = chunks.map((chunk, index) => {
    const importance = chunk.importance;
    const importanceClass = importance > 0.7 ? 'high' : importance > 0.4 ? 'medium' : 'low';
    const importancePercent = Math.round(importance * 100);

    return `
      <div class="chunk-item" data-chunk-id="${chunk.chunk_id}">
        <div class="chunk-header">
          <span class="chunk-id">Chunk ${chunk.order + 1}</span>
          <span class="chunk-importance ${importanceClass}">${importancePercent}%</span>
        </div>
        <div class="chunk-text">${Utils.escapeHtml(chunk.text)}</div>
        <div class="chunk-meta">
          ${chunk.metadata.word_count} words | ${chunk.metadata.sentence_count} sentences
          ${chunk.embedding ? ' | ✓ Embedded' : ''}
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers
  document.querySelectorAll('.chunk-item').forEach(item => {
    item.addEventListener('click', () => item.classList.toggle('selected'));
  });
}

// ==================== Metadata Functions ====================

function displayMetadata(doc) {
  // Basic info
  document.getElementById('meta-title').value = doc.title;
  document.getElementById('meta-url').value = doc.url;
  document.getElementById('meta-language').value = doc.metadata.language;

  // Key points
  displayKeyPoints(doc.metadata.key_points || []);

  // Entities
  displayEntities(doc.metadata.entities || {});
}

function displayKeyPoints(points) {
  const container = document.getElementById('key-points-list');
  container.innerHTML = points.map((point, index) => `
    <div class="editable-list-item" data-index="${index}">
      <input type="text" value="${Utils.escapeHtml(point)}">
      <button class="remove-key-point">×</button>
    </div>
  `).join('');

  // Add click event listeners to remove buttons
  container.querySelectorAll('.remove-key-point').forEach(btn => {
    btn.addEventListener('click', function() {
      this.parentElement.remove();
    });
  });
}

function displayEntities(entities) {
  const container = document.getElementById('entities-list');

  const entityTypes = Object.keys(entities).filter(key => entities[key] && entities[key].length > 0);

  if (entityTypes.length === 0) {
    container.innerHTML = '<p class="placeholder">No entities extracted</p>';
    return;
  }

  container.innerHTML = entityTypes.map(type => `
    <div class="entity-group">
      <h4>${Utils.capitalize(type)}</h4>
      <div class="entity-tags">
        ${entities[type].map(entity => `<span class="entity-tag">${Utils.escapeHtml(entity)}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

// ==================== Embeddings Functions ====================

function displayEmbeddingsInfo(chunks) {
  const chunksWithEmbeddings = chunks.filter(chunk => chunk.embedding && chunk.embedding.length > 0);
  const embeddingStatus = chunksWithEmbeddings.length === chunks.length ? '✓ Complete' :
                         chunksWithEmbeddings.length > 0 ? '⚠ Partial' : '✗ None';

  document.getElementById('embedding-status').textContent = embeddingStatus;
  document.getElementById('embedded-chunks-count').textContent = `${chunksWithEmbeddings.length} / ${chunks.length}`;

  // Preview
  displayEmbeddingPreview(chunks.slice(0, 5));
}

function displayEmbeddingPreview(chunks) {
  const container = document.getElementById('embedding-preview');

  container.innerHTML = chunks.map(chunk => {
    const hasEmbedding = chunk.embedding && chunk.embedding.length > 0;
    const statusClass = hasEmbedding ? 'ready' : 'pending';
    const statusText = hasEmbedding ? '✓ Ready' : '✗ None';

    return `
      <div class="embedding-item">
        <div class="embedding-item-header">
          <span>Chunk ${chunk.order + 1}</span>
          <span class="embedding-status-badge ${statusClass}">${statusText}</span>
        </div>
        <div style="font-size: 10px; color: var(--text-muted);">
          ${hasEmbedding ? `${chunk.embedding.length} dimensions` : 'Not embedded'}
        </div>
      </div>
    `;
  }).join('');
}

// ==================== Panel Tab Switching ====================

function switchPanelTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`.panel-tab[data-tab="${tabName}"]`).classList.add('active');

  // Update content panes
  document.querySelectorAll('.panel-content').forEach(pane => {
    pane.classList.remove('active');
  });
  document.getElementById(`panel-${tabName}`).classList.add('active');
}

// ==================== Action Functions ====================

async function toggleStar() {
  if (!currentDocument) return;

  try {
    const starred = !currentDocument.metadata.starred;
    currentDocument.metadata.starred = starred;

    await memoryDB.saveDocument(currentDocument);
    updateStarButton(starred);
    await loadAllDocuments();

    showNotification(starred ? 'Document starred' : 'Star removed', 'success');
  } catch (error) {
    console.error('[Manager] Failed to toggle star:', error);
    showNotification('Failed to update star', 'error');
  }
}

function updateStarButton(starred) {
  const btn = document.getElementById('star-btn');
  btn.textContent = starred ? '★' : '⭐';
  btn.style.color = starred ? '#f57c00' : '';
}

async function copyCleanText() {
  if (!currentDocument) return;

  try {
    await navigator.clipboard.writeText(currentDocument.clean_text);
    showNotification('Copied to clipboard', 'success');
  } catch (error) {
    console.error('[Manager] Failed to copy:', error);
    showNotification('Failed to copy', 'error');
  }
}

function showAddTagModal() {
  document.getElementById('tag-modal').classList.add('active');
  document.getElementById('new-tag-input').value = '';
  document.getElementById('new-tag-input').focus();
}

function closeAddTagModal() {
  document.getElementById('tag-modal').classList.remove('active');
}

async function confirmAddTag() {
  const input = document.getElementById('new-tag-input');
  const tag = input.value.trim();

  if (!tag) return;

  if (!currentDocument) {
    showNotification('No document selected', 'error');
    return;
  }

  try {
    if (!currentDocument.metadata.tags) {
      currentDocument.metadata.tags = [];
    }

    if (!currentDocument.metadata.tags.includes(tag)) {
      currentDocument.metadata.tags.push(tag);
      await memoryDB.saveDocument(currentDocument);
      displayTags(currentDocument.metadata.tags);
      await loadAllDocuments();
      showNotification('Tag added', 'success');
    }

    closeAddTagModal();
  } catch (error) {
    console.error('[Manager] Failed to add tag:', error);
    showNotification('Failed to add tag', 'error');
  }
}

async function removeTag(tag) {
  if (!currentDocument) return;

  try {
    currentDocument.metadata.tags = currentDocument.metadata.tags.filter(t => t !== tag);
    await memoryDB.saveDocument(currentDocument);
    displayTags(currentDocument.metadata.tags);
    await loadAllDocuments();
    showNotification('Tag removed', 'success');
  } catch (error) {
    console.error('[Manager] Failed to remove tag:', error);
    showNotification('Failed to remove tag', 'error');
  }
}

async function saveMetadata() {
  if (!currentDocument) return;

  try {
    // Update basic info
    currentDocument.title = document.getElementById('meta-title').value;
    currentDocument.url = document.getElementById('meta-url').value;
    currentDocument.metadata.language = document.getElementById('meta-language').value;

    // Update key points
    const keyPoints = [];
    document.querySelectorAll('#key-points-list input').forEach(input => {
      if (input.value.trim()) {
        keyPoints.push(input.value.trim());
      }
    });
    currentDocument.metadata.key_points = keyPoints;

    await memoryDB.saveDocument(currentDocument);
    await loadAllDocuments();
    selectDocument(currentDocument.doc_id);

    showNotification('Metadata saved', 'success');
  } catch (error) {
    console.error('[Manager] Failed to save metadata:', error);
    showNotification('Failed to save metadata', 'error');
  }
}

function resetMetadata() {
  if (currentDocument) {
    displayMetadata(currentDocument);
  }
}

async function deleteDocument() {
  if (!currentDocument) return;

  const confirmed = confirm(`Delete "${currentDocument.title}"?\n\nThis will permanently delete the document and all its chunks. This cannot be undone.`);
  if (!confirmed) return;

  try {
    await memoryDB.deleteDocument(currentDocument.doc_id);
    currentDocument = null;
    currentChunks = [];
    await loadAllDocuments();
    showNotification('Document deleted', 'success');
  } catch (error) {
    console.error('[Manager] Failed to delete document:', error);
    showNotification('Failed to delete document', 'error');
  }
}

async function exportDocument() {
  if (!currentDocument) return;

  try {
    const exportData = {
      document: currentDocument,
      chunks: currentChunks,
      exportedAt: new Date().toISOString()
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentDocument.title.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification('Document exported', 'success');
  } catch (error) {
    console.error('[Manager] Failed to export:', error);
    showNotification('Failed to export', 'error');
  }
}

// ==================== Utility Functions ====================

async function updateStats() {
  const stats = await memoryDB.getStats();
  document.getElementById('doc-count').textContent = `${stats.totalDocuments} documents`;
  document.getElementById('total-chunks').textContent = `${stats.totalChunks} chunks`;
}

async function performGlobalSearch() {
  const query = document.getElementById('global-search').value.trim();
  if (!query) {
    await loadAllDocuments();
    return;
  }

  try {
    const results = await memoryDB.searchDocuments(query);
    displayDocumentList(results);
  } catch (error) {
    console.error('[Manager] Search failed:', error);
    showNotification('Search failed', 'error');
  }
}

function handleSortChange() {
  loadAllDocuments();
}

function showNotification(message, type = 'info') {
  console.log(`[Manager] ${type.toUpperCase()}: ${message}`);
  // TODO: Implement toast notifications
  if (type === 'error') {
    alert(message);
  }
}

// Placeholder functions for unimplemented features
function toggleEditMode() { showNotification('Edit mode coming soon', 'info'); }
function createNewDocument() { showNotification('Create new document - coming soon', 'info'); }
function syncDatabase() { showNotification('Sync - coming soon', 'info'); }
function toggleFilters() { showNotification('Filters - coming soon', 'info'); }
function reorderChunks() { showNotification('Reorder chunks - coming soon', 'info'); }
function addKeyPoint() {
  const container = document.getElementById('key-points-list');
  const index = container.children.length;
  const newItem = document.createElement('div');
  newItem.className = 'editable-list-item';
  newItem.innerHTML = `
    <input type="text" placeholder="New key point..." data-index="${index}">
    <button class="remove-key-point">×</button>
  `;

  // Add event listener to the remove button
  const removeBtn = newItem.querySelector('.remove-key-point');
  removeBtn.addEventListener('click', function() {
    newItem.remove();
  });

  container.appendChild(newItem);
}
function regenerateEmbeddings() { showNotification('Regenerate embeddings - requires background.js integration', 'info'); }
function embedSelectedChunks() { showNotification('Embed selected chunks - requires background.js integration', 'info'); }
function duplicateDocument() { showNotification('Duplicate document - coming soon', 'info'); }
function rechunkDocument() { showNotification('Re-chunk - requires background.js integration', 'info'); }
function recleanDocument() { showNotification('Re-clean - requires background.js integration', 'info'); }
function reanalyzeDocument() { showNotification('Re-analyze - requires background.js integration', 'info'); }

// ==================== View Switcher ====================

let currentView = 'list';
let graphInitialized = false;

function switchView(view) {
  if (view === currentView) return;

  currentView = view;

  // Update button states
  document.getElementById('list-view-btn').classList.toggle('active', view === 'list');
  document.getElementById('graph-view-btn').classList.toggle('active', view === 'graph');

  // Toggle views
  document.getElementById('list-view').classList.toggle('hidden', view !== 'list');
  document.getElementById('graph-view').classList.toggle('hidden', view !== 'graph');

  // Initialize graph on first view
  if (view === 'graph' && !graphInitialized) {
    initializeGraphView();
    graphInitialized = true;
  }

  // Refresh graph if switching to graph view
  if (view === 'graph' && graphInitialized) {
    // Trigger graph refresh
    if (typeof loadAndRenderGraph === 'function') {
      loadAndRenderGraph();
    }
  }
}

function initializeGraphView() {
  console.log('[Manager] Initializing graph view...');

  // Wait a tick for the view to be visible
  setTimeout(() => {
    const graphView = document.getElementById('graph-view');
    const graphNetwork = document.getElementById('graph-network');

    console.log('[Manager] Graph view visible:', !graphView.classList.contains('hidden'));
    console.log('[Manager] Graph network element exists:', !!graphNetwork);

    if (graphNetwork) {
      console.log('[Manager] Graph network dimensions:', {
        width: graphNetwork.offsetWidth,
        height: graphNetwork.offsetHeight
      });
    }

    // The graph initialization is handled by knowledge-graph.js
    // Just trigger it if it hasn't been done yet
    if (typeof loadAndRenderGraph === 'function') {
      console.log('[Manager] Calling loadAndRenderGraph...');
      loadAndRenderGraph();
    } else {
      console.error('[Manager] loadAndRenderGraph function not found!');
    }

    if (typeof loadDecisionLogs === 'function') {
      loadDecisionLogs();
    }
  }, 100);
}

// ==================== Re-analyze Relationships ====================

async function reanalyzeAllRelationships() {
  console.log('[Manager] Starting relationship re-analysis...');

  // Confirm with user
  if (!confirm('This will use LLM to re-analyze ALL chunks and build cross-document relationships. This may take a while and use API tokens. Continue?')) {
    return;
  }

  try {
    // Show loading overlay
    showLoading(true);

    // Get LLM config from storage (stored in sync, not local!)
    const config = await chrome.storage.sync.get([
      'llmProvider',
      'apiKey',
      'apiEndpoint',
      'modelName'
    ]);

    if (!config.apiKey) {
      alert('Please configure your LLM API key in the popup first!');
      showLoading(false);
      return;
    }

    const llmConfig = {
      llmProvider: config.llmProvider || 'openai',
      apiKey: config.apiKey,
      apiEndpoint: config.apiEndpoint || 'https://api.openai.com/v1/chat/completions',
      modelName: config.modelName || 'gpt-4'
    };

    // Send message to background to trigger re-analysis
    chrome.runtime.sendMessage({
      action: 'reanalyzeRelationships',
      llmConfig: llmConfig
    }, (response) => {
      showLoading(false);

      if (response && response.success) {
        alert(`✅ Re-analysis complete!\n\nChunks analyzed: ${response.chunksAnalyzed}\nDocuments processed: ${response.documentsProcessed}\nRelationships built: ${response.relationshipsBuilt}`);

        // Reload the graph to show new relationships
        if (typeof loadAndRenderGraph === 'function') {
          loadAndRenderGraph();
        }

        // Reload logs
        if (typeof loadDecisionLogs === 'function') {
          loadDecisionLogs();
        }
      } else {
        alert(`❌ Re-analysis failed: ${response?.error || 'Unknown error'}`);
      }
    });

  } catch (error) {
    console.error('[Manager] Re-analysis error:', error);
    showLoading(false);
    alert(`❌ Error: ${error.message}`);
  }
}

function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    if (show) {
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  }
}
