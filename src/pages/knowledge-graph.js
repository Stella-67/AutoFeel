// ==================== Knowledge Graph Visualization ====================
// Interactive visualization of documents, chunks, and their relationships

let network = null;
let nodesDataset = null;
let edgesDataset = null;
let graphDocuments = [];
let graphChunks = [];

// ==================== Initialization ====================

// Initialize graph event listeners when script loads
(function() {
  // Wait a bit for DOM to be ready if needed
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupGraphEventListeners);
  } else {
    setupGraphEventListeners();
  }
})();

function setupGraphEventListeners() {
  console.log('[Knowledge Graph] Setting up event listeners...');
  setupGraphControlListeners();
  // Note: Graph will be initialized when user switches to graph view
}

// ==================== Event Listeners ====================

function setupGraphControlListeners() {
  // Only setup listeners if elements exist (they may not exist in integrated view)
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      await loadAndRenderGraph();
    });
  }

  // Controls
  document.getElementById('view-mode').addEventListener('change', (e) => {
    applyViewMode(e.target.value);
  });

  // ==================== Card Architecture: Layer Filter ====================
  const layerFilter = document.getElementById('layer-filter');
  if (layerFilter) {
    layerFilter.addEventListener('change', (e) => {
      applyLayerFilter(e.target.value);
    });
  }
  // =================================================================

  document.getElementById('layout-algorithm').addEventListener('change', (e) => {
    applyLayout(e.target.value);
  });

  document.querySelectorAll('.rel-filter').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      filterRelationships();
    });
  });

  document.getElementById('search-nodes').addEventListener('input', (e) => {
    searchNodes(e.target.value);
  });

  document.getElementById('export-graph-btn').addEventListener('click', () => {
    exportGraph();
  });

  document.getElementById('fit-view-btn').addEventListener('click', () => {
    if (network) {
      network.fit();
    }
  });

  // Re-analyze relationships button
  const reanalyzeBtn = document.getElementById('reanalyze-relationships-btn');
  if (reanalyzeBtn) {
    reanalyzeBtn.addEventListener('click', () => {
      if (typeof reanalyzeAllRelationships === 'function') {
        reanalyzeAllRelationships();
      }
    });
  }

  // Node details
  document.getElementById('close-details').addEventListener('click', () => {
    hideNodeDetails();
  });

  document.getElementById('focus-node-btn').addEventListener('click', () => {
    focusSelectedNode();
  });

  document.getElementById('expand-node-btn').addEventListener('click', () => {
    expandSelectedNode();
  });

  document.getElementById('hide-node-btn').addEventListener('click', () => {
    hideSelectedNode();
  });

  // LLM Log Panel
  document.getElementById('toggle-log-btn').addEventListener('click', () => {
    toggleLogPanel();
  });

  document.querySelector('.log-header').addEventListener('click', () => {
    toggleLogPanel();
  });

  document.getElementById('clear-log-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    clearLogs();
  });

  document.getElementById('export-log-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    exportLogs();
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterLogs(btn.dataset.filter);
    });
  });
}

// ==================== Data Loading ====================

async function loadAndRenderGraph() {
  console.log('[Knowledge Graph] loadAndRenderGraph called');
  showLoading(true);

  try {
    // Initialize database
    await memoryDB.init();
    console.log('[Knowledge Graph] Database initialized');

    // Load all documents and chunks
    console.log('[Knowledge Graph] Loading documents and chunks...');
    graphDocuments = await memoryDB.getAllDocuments({ limit: 1000 });
    console.log('[Knowledge Graph] Documents loaded:', graphDocuments.length);

    // Load all chunks
    graphChunks = [];
    for (const doc of graphDocuments) {
      const chunks = await memoryDB.getChunksByDocId(doc.doc_id);
      graphChunks.push(...chunks);
    }

    console.log(`[Knowledge Graph] Loaded ${graphDocuments.length} documents and ${graphChunks.length} chunks`);

    // Check if we have data
    if (graphDocuments.length === 0 && graphChunks.length === 0) {
      console.warn('[Knowledge Graph] No data found in database');
      showEmptyState();
      return;
    }

    // Update stats
    updateStats(graphDocuments.length, graphChunks.length);

    // Build graph data
    console.log('[Knowledge Graph] Building graph data...');
    const { nodes, edges } = buildGraphData(graphDocuments, graphChunks);
    console.log(`[Knowledge Graph] Built ${nodes.length} nodes and ${edges.length} edges`);

    // Render graph
    console.log('[Knowledge Graph] Rendering graph...');
    renderGraph(nodes, edges);
    console.log('[Knowledge Graph] Graph rendered successfully');

  } catch (error) {
    console.error('[Knowledge Graph] Error loading data:', error);
    console.error('[Knowledge Graph] Error stack:', error.stack);
    showErrorState(error.message);
  } finally {
    showLoading(false);
  }
}

function showEmptyState() {
  const container = document.getElementById('graph-network');
  if (container) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #999;">
        <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">No Knowledge Graph Data</div>
        <div style="font-size: 14px; text-align: center; max-width: 400px;">
          Your knowledge graph is empty. Save some documents using <strong>Option+C</strong> to start building your knowledge base.
        </div>
      </div>
    `;
  }
}

function showErrorState(errorMessage) {
  const container = document.getElementById('graph-network');
  if (container) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #e74c3c;">
        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Failed to Load Graph</div>
        <div style="font-size: 14px; text-align: center; max-width: 400px;">
          ${errorMessage}
        </div>
        <button onclick="loadAndRenderGraph()" style="margin-top: 16px; padding: 8px 16px; border: none; border-radius: 4px; background: #3498db; color: white; cursor: pointer;">
          Retry
        </button>
      </div>
    `;
  }
}

// ==================== Graph Data Building ====================

function buildGraphData(documents, chunks) {
  const nodes = [];
  const edges = [];

  // Add document nodes
  documents.forEach(doc => {
    nodes.push({
      id: doc.doc_id,
      label: truncate(doc.title, 30),
      title: doc.title, // Tooltip
      group: 'document',
      shape: 'box',
      color: {
        background: '#4a90e2',
        border: '#357abd',
        highlight: {
          background: '#357abd',
          border: '#2c5d8f'
        }
      },
      font: {
        color: '#ffffff',
        size: 14,
        face: 'arial'
      },
      data: doc // Store full document data
    });
  });

  // Add chunk nodes
  chunks.forEach(chunk => {
    const chunkType = chunk.chunk_type || 'unknown';
    const layer = chunk.layer || 'stable'; // Default to stable for old data
    const activationWeight = chunk.activation_weight || 0;

    // ==================== Card Architecture: Node Styling ====================
    // Color based on layer (temporary vs stable)
    const color = getLayerColor(layer, chunk);

    nodes.push({
      id: chunk.chunk_id,
      label: truncate(chunk.text, 40),
      title: `${layer.toUpperCase()} | ${chunkType}: ${chunk.text.substring(0, 100)}...`,
      group: `chunk-${layer}`,
      shape: 'ellipse',
      color: color,
      font: {
        size: 12,
        face: 'arial'
      },
      // Size based on activation_weight (how frequently used)
      size: 15 + activationWeight * 20,
      borderWidth: 2,
      borderWidthSelected: 4,
      data: chunk // Store full chunk data
    });

    // Add edge from chunk to document (source relationship)
    edges.push({
      from: chunk.chunk_id,
      to: chunk.doc_id,
      label: 'from',
      arrows: { to: { enabled: true, scaleFactor: 0.5 } },
      color: {
        color: '#95a5a6',
        opacity: 0.4
      },
      width: 1,
      dashes: true,
      type: 'source'
    });
  });

  // Add chunk relationships
  chunks.forEach(chunk => {
    if (!chunk.relationships) return;

    const relationships = chunk.relationships;

    // Helper function to extract target ID and strength from relationship
    const getRelationshipData = (rel) => {
      if (typeof rel === 'string') {
        return { targetId: rel, strength: 0.5 }; // Old format
      } else if (typeof rel === 'object' && rel.target_id) {
        return { targetId: rel.target_id, strength: rel.strength || 0.5 }; // New format
      }
      return null;
    };

    // ==================== Card Architecture: Edge Width Based on Strength ====================

    // Related chunks
    (relationships.related_chunks || []).forEach(rel => {
      const data = getRelationshipData(rel);
      if (!data) return;

      edges.push({
        from: chunk.chunk_id,
        to: data.targetId,
        label: 'related',
        color: { color: '#95a5a6' },
        width: 1 + data.strength * 4, // Width based on relationship strength
        type: 'related'
      });
    });

    // Elaborates (parent-child)
    (relationships.child_chunks || []).forEach(rel => {
      const data = getRelationshipData(rel);
      if (!data) return;

      edges.push({
        from: chunk.chunk_id,
        to: data.targetId,
        label: 'elaborates',
        arrows: { to: { enabled: true } },
        color: { color: '#3498db' },
        width: 1 + data.strength * 4,
        type: 'elaborates'
      });
    });

    // Contradicts
    (relationships.contradicts || []).forEach(rel => {
      const data = getRelationshipData(rel);
      if (!data) return;

      edges.push({
        from: chunk.chunk_id,
        to: data.targetId,
        label: 'contradicts',
        arrows: { to: { enabled: true } },
        color: { color: '#e74c3c' },
        width: 1 + data.strength * 4,
        dashes: [5, 5],
        type: 'contradicts'
      });
    });

    // Supports
    (relationships.supports || []).forEach(rel => {
      const data = getRelationshipData(rel);
      if (!data) return;

      edges.push({
        from: chunk.chunk_id,
        to: data.targetId,
        label: 'supports',
        arrows: { to: { enabled: true } },
        color: { color: '#2ecc71' },
        width: 1 + data.strength * 4,
        type: 'supports'
      });
    });

    // Prerequisite
    (relationships.prerequisite_of || []).forEach(rel => {
      const data = getRelationshipData(rel);
      if (!data) return;

      edges.push({
        from: chunk.chunk_id,
        to: data.targetId,
        label: 'prerequisite',
        arrows: { to: { enabled: true } },
        color: { color: '#f1c40f' },
        width: 1 + data.strength * 4,
        type: 'prerequisite'
      });
    });
  });

  console.log(`[Knowledge Graph] Built ${nodes.length} nodes and ${edges.length} edges`);

  return { nodes, edges };
}

// ==================== Graph Rendering ====================

function renderGraph(nodes, edges) {
  const container = document.getElementById('graph-network');

  if (!container) {
    console.error('[Knowledge Graph] Container element not found');
    return;
  }

  console.log('[Knowledge Graph] Container dimensions:', {
    width: container.offsetWidth,
    height: container.offsetHeight,
    clientWidth: container.clientWidth,
    clientHeight: container.clientHeight
  });

  // Check if vis.js is loaded
  if (typeof vis === 'undefined') {
    console.error('[Knowledge Graph] vis.js library not loaded');
    showErrorState('vis.js library not loaded. Please refresh the page.');
    return;
  }

  // Create datasets
  nodesDataset = new vis.DataSet(nodes);
  edgesDataset = new vis.DataSet(edges);

  const data = {
    nodes: nodesDataset,
    edges: edgesDataset
  };

  const options = {
    layout: {
      hierarchical: {
        enabled: false,
        direction: 'UD',
        sortMethod: 'directed',
        nodeSpacing: 150,
        levelSeparation: 200
      }
    },
    physics: {
      enabled: true,
      barnesHut: {
        gravitationalConstant: -2000,
        centralGravity: 0.3,
        springLength: 150,
        springConstant: 0.04,
        damping: 0.09,
        avoidOverlap: 0.5
      },
      stabilization: {
        iterations: 200
      }
    },
    interaction: {
      hover: true,
      navigationButtons: true,
      keyboard: true,
      zoomView: true,
      dragView: true
    },
    nodes: {
      borderWidth: 2,
      borderWidthSelected: 4
    },
    edges: {
      smooth: {
        enabled: true,
        type: 'continuous'
      },
      font: {
        size: 10,
        align: 'middle'
      }
    }
  };

  // Create network
  network = new vis.Network(container, data, options);

  // Event handlers
  network.on('click', (params) => {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      showNodeDetails(nodeId);
    } else {
      hideNodeDetails();
    }
  });

  network.on('doubleClick', (params) => {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      focusNode(nodeId);
    }
  });

  network.on('stabilizationIterationsDone', () => {
    console.log('[Knowledge Graph] Graph stabilized');
    network.setOptions({ physics: false });
  });

  console.log('[Knowledge Graph] Graph rendered successfully');
}

// ==================== Node Details Panel ====================

function showNodeDetails(nodeId) {
  const node = nodesDataset.get(nodeId);
  if (!node) return;

  const detailsPanel = document.getElementById('node-details');
  detailsPanel.classList.remove('hidden');

  document.getElementById('node-title').textContent = node.label;

  // Hide all detail sections
  document.getElementById('doc-details').classList.add('hidden');
  document.getElementById('chunk-details').classList.add('hidden');

  if (node.group === 'document') {
    showDocumentDetails(node.data);
  } else {
    showChunkDetails(node.data);
  }

  // Store selected node ID
  detailsPanel.dataset.selectedNode = nodeId;
}

function showDocumentDetails(doc) {
  const section = document.getElementById('doc-details');
  section.classList.remove('hidden');

  document.getElementById('doc-url').href = doc.url;
  document.getElementById('doc-url').textContent = doc.url;
  document.getElementById('doc-created').textContent = new Date(doc.captured_at).toLocaleString();
  document.getElementById('doc-words').textContent = doc.metadata?.word_count || 0;
  document.getElementById('doc-chunks').textContent = doc.metadata?.chunk_count || 0;
  document.getElementById('doc-preview').textContent = doc.clean_text?.substring(0, 500) + '...' || 'No preview available';

  // Tags
  const tagsContainer = document.getElementById('doc-tags');
  tagsContainer.innerHTML = '';
  (doc.metadata?.tags || []).forEach(tag => {
    const tagEl = document.createElement('span');
    tagEl.className = 'tag';
    tagEl.textContent = tag;
    tagsContainer.appendChild(tagEl);
  });
}

function showChunkDetails(chunk) {
  const section = document.getElementById('chunk-details');
  section.classList.remove('hidden');

  const chunkType = chunk.chunk_type || 'unknown';
  const typeEl = document.getElementById('chunk-type');
  typeEl.textContent = chunkType;
  typeEl.style.background = getChunkColor(chunkType).background;

  // ==================== Card Architecture: Display Card Metrics ====================
  const layer = chunk.layer || 'stable';
  const confidence = chunk.confidence !== undefined ? chunk.confidence : (chunk.metadata?.confidence_score || 1.0);
  const surprise = chunk.surprise !== undefined ? chunk.surprise : 0.5;
  const activationCount = chunk.activation_count || 0;
  const activationWeight = chunk.activation_weight || 0;
  const stabilityScore = chunk.stability_score !== undefined ? chunk.stability_score : 0.8;

  // Layer display
  const layerEl = document.getElementById('chunk-layer');
  if (layerEl) {
    layerEl.textContent = layer.toUpperCase();
    layerEl.style.background = layer === 'temporary' ? '#FFC107' : '#4CAF50';
    layerEl.style.color = '#fff';
    layerEl.style.padding = '2px 8px';
    layerEl.style.borderRadius = '3px';
    layerEl.style.fontSize = '11px';
    layerEl.style.fontWeight = 'bold';
  }

  // Importance bar (keep for backward compatibility)
  const importance = chunk.importance || 0.5;
  const importanceFill = document.querySelector('.importance-fill');
  if (importanceFill) {
    importanceFill.style.width = (importance * 100) + '%';
  }

  // Confidence bar
  const confidenceFill = document.querySelector('.confidence-fill');
  if (confidenceFill) {
    confidenceFill.style.width = (confidence * 100) + '%';
    confidenceFill.style.background = confidence > 0.7 ? '#2ecc71' : (confidence > 0.4 ? '#f39c12' : '#e74c3c');
  }

  // Surprise bar
  const surpriseFill = document.querySelector('.surprise-fill');
  if (surpriseFill) {
    surpriseFill.style.width = (surprise * 100) + '%';
    surpriseFill.style.background = surprise > 0.7 ? '#e74c3c' : (surprise > 0.4 ? '#f39c12' : '#2ecc71');
  }

  // Activation display
  const activationCountEl = document.getElementById('chunk-activation-count');
  if (activationCountEl) {
    activationCountEl.textContent = activationCount;
  }

  const activationWeightEl = document.getElementById('chunk-activation-weight');
  if (activationWeightEl) {
    activationWeightEl.textContent = activationWeight.toFixed(2);
  }

  // Stability display
  const stabilityEl = document.getElementById('chunk-stability');
  if (stabilityEl) {
    stabilityEl.textContent = stabilityScore.toFixed(2);
  }

  document.getElementById('chunk-source').textContent = chunk.source?.title || 'Unknown';
  document.getElementById('chunk-words').textContent = chunk.metadata?.word_count || 0;
  document.getElementById('chunk-confidence').textContent = confidence.toFixed(2);
  document.getElementById('chunk-content').textContent = chunk.text;

  // Relationships
  const relContainer = document.getElementById('chunk-relationships');
  relContainer.innerHTML = '';

  if (chunk.relationships) {
    const rel = chunk.relationships;
    const types = [
      { name: 'Related', ids: rel.related_chunks || [], class: 'related' },
      { name: 'Elaborates on', ids: rel.parent_chunks || [], class: 'elaborates' },
      { name: 'Elaborated by', ids: rel.child_chunks || [], class: 'elaborates' },
      { name: 'Contradicts', ids: rel.contradicts || [], class: 'contradicts' },
      { name: 'Supports', ids: rel.supports || [], class: 'supports' },
      { name: 'Prerequisite of', ids: rel.prerequisite_of || [], class: 'prerequisite' },
      { name: 'Requires', ids: rel.requires || [], class: 'prerequisite' }
    ];

    types.forEach(type => {
      if (type.ids.length > 0) {
        const relItem = document.createElement('div');
        relItem.className = `relationship-item ${type.class}`;
        relItem.textContent = `${type.name}: ${type.ids.length} chunk(s)`;
        relContainer.appendChild(relItem);
      }
    });
  }

  if (relContainer.children.length === 0) {
    relContainer.textContent = 'No relationships';
  }
}

function hideNodeDetails() {
  document.getElementById('node-details').classList.add('hidden');
}

// ==================== Interactive Features ====================

function applyViewMode(mode) {
  if (!nodesDataset || !edgesDataset) return;

  const allNodes = nodesDataset.get();
  const allEdges = edgesDataset.get();

  switch (mode) {
    case 'documents':
      // Show only document nodes
      allNodes.forEach(node => {
        nodesDataset.update({
          id: node.id,
          hidden: node.group !== 'document'
        });
      });
      break;

    case 'chunks':
      // Show only chunk nodes
      allNodes.forEach(node => {
        nodesDataset.update({
          id: node.id,
          hidden: node.group === 'document'
        });
      });
      break;

    case 'relationships':
      // Show only chunks with relationships
      allNodes.forEach(node => {
        const hasRelationships = allEdges.some(edge =>
          (edge.from === node.id || edge.to === node.id) && edge.type !== 'source'
        );
        nodesDataset.update({
          id: node.id,
          hidden: !hasRelationships
        });
      });
      break;

    case 'all':
    default:
      // Show all nodes
      allNodes.forEach(node => {
        nodesDataset.update({
          id: node.id,
          hidden: false
        });
      });
      break;
  }

  if (network) {
    network.fit();
  }
}

/**
 * Filter nodes by card layer (temporary vs stable)
 * @param {string} layer - 'all', 'temporary', or 'stable'
 */
function applyLayerFilter(layer) {
  if (!nodesDataset) return;

  const allNodes = nodesDataset.get();

  allNodes.forEach(node => {
    // Always show documents
    if (node.group === 'document') {
      nodesDataset.update({
        id: node.id,
        hidden: false
      });
      return;
    }

    // Filter chunks by layer
    const nodeLayer = node.data?.layer || 'stable';

    if (layer === 'all') {
      nodesDataset.update({
        id: node.id,
        hidden: false
      });
    } else if (layer === 'temporary') {
      nodesDataset.update({
        id: node.id,
        hidden: nodeLayer !== 'temporary'
      });
    } else if (layer === 'stable') {
      nodesDataset.update({
        id: node.id,
        hidden: nodeLayer !== 'stable'
      });
    }
  });

  if (network) {
    network.fit();
  }

  console.log(`[Knowledge Graph] Applied layer filter: ${layer}`);
}

function applyLayout(algorithm) {
  if (!network) return;

  switch (algorithm) {
    case 'hierarchical':
      network.setOptions({
        layout: {
          hierarchical: {
            enabled: true,
            direction: 'UD',
            sortMethod: 'directed',
            nodeSpacing: 150,
            levelSeparation: 200
          }
        },
        physics: false
      });
      break;

    case 'circular':
      network.setOptions({
        layout: {
          hierarchical: { enabled: false }
        },
        physics: {
          enabled: true,
          barnesHut: {
            gravitationalConstant: -8000,
            centralGravity: 0.5,
            springLength: 200
          }
        }
      });
      setTimeout(() => {
        network.setOptions({ physics: false });
      }, 3000);
      break;

    case 'force':
    default:
      network.setOptions({
        layout: {
          hierarchical: { enabled: false }
        },
        physics: {
          enabled: true,
          barnesHut: {
            gravitationalConstant: -2000,
            centralGravity: 0.3,
            springLength: 150
          }
        }
      });
      setTimeout(() => {
        network.setOptions({ physics: false });
      }, 3000);
      break;
  }
}

function filterRelationships() {
  if (!edgesDataset) return;

  const enabledTypes = Array.from(document.querySelectorAll('.rel-filter:checked'))
    .map(cb => cb.value);

  const allEdges = edgesDataset.get();
  allEdges.forEach(edge => {
    if (edge.type === 'source') {
      // Always show source edges
      edgesDataset.update({ id: edge.id, hidden: false });
    } else {
      edgesDataset.update({
        id: edge.id,
        hidden: !enabledTypes.includes(edge.type)
      });
    }
  });
}

function searchNodes(query) {
  if (!nodesDataset || !query) {
    // Reset all nodes
    if (nodesDataset) {
      nodesDataset.get().forEach(node => {
        nodesDataset.update({
          id: node.id,
          color: node.data ? getChunkColor(node.data.chunk_type || 'document') : undefined
        });
      });
    }
    return;
  }

  const lowerQuery = query.toLowerCase();
  const matchingNodes = [];

  nodesDataset.get().forEach(node => {
    const matches = node.label.toLowerCase().includes(lowerQuery) ||
                   (node.data?.text || '').toLowerCase().includes(lowerQuery);

    if (matches) {
      matchingNodes.push(node.id);
      nodesDataset.update({
        id: node.id,
        color: {
          background: '#f39c12',
          border: '#e67e22'
        }
      });
    } else {
      nodesDataset.update({
        id: node.id,
        color: node.group === 'document'
          ? { background: '#4a90e2', border: '#357abd' }
          : getChunkColor(node.data?.chunk_type || 'unknown')
      });
    }
  });

  if (matchingNodes.length > 0 && network) {
    network.fit({
      nodes: matchingNodes,
      animation: true
    });
  }
}

function focusSelectedNode() {
  const nodeId = document.getElementById('node-details').dataset.selectedNode;
  if (nodeId && network) {
    focusNode(nodeId);
  }
}

function focusNode(nodeId) {
  const connectedNodes = network.getConnectedNodes(nodeId);
  const nodesToShow = [nodeId, ...connectedNodes];

  nodesDataset.get().forEach(node => {
    nodesDataset.update({
      id: node.id,
      hidden: !nodesToShow.includes(node.id)
    });
  });

  network.fit({
    nodes: nodesToShow,
    animation: true
  });
}

function expandSelectedNode() {
  const nodeId = document.getElementById('node-details').dataset.selectedNode;
  if (nodeId && network) {
    const connectedNodes = network.getConnectedNodes(nodeId);
    connectedNodes.forEach(id => {
      nodesDataset.update({ id, hidden: false });
    });
  }
}

function hideSelectedNode() {
  const nodeId = document.getElementById('node-details').dataset.selectedNode;
  if (nodeId) {
    nodesDataset.update({ id: nodeId, hidden: true });
    hideNodeDetails();
  }
}

// ==================== Export ====================

function exportGraph() {
  const data = {
    documents: graphDocuments,
    chunks: graphChunks,
    exported_at: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `knowledge-graph-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== Utility Functions ====================

function getChunkColor(type) {
  const colors = {
    concept: { background: '#9b59b6', border: '#8e44ad' },
    fact: { background: '#27ae60', border: '#229954' },
    procedure: { background: '#e67e22', border: '#ca6f1e' },
    definition: { background: '#f39c12', border: '#e67e22' },
    example: { background: '#1abc9c', border: '#17a589' },
    unknown: { background: '#95a5a6', border: '#7f8c8d' }
  };
  return colors[type] || colors.unknown;
}

/**
 * Get node color based on card layer and confidence
 * @param {string} layer - 'temporary' or 'stable'
 * @param {Object} chunk - Chunk data (optional, for confidence-based shading)
 * @returns {Object} Color object with background and border
 */
function getLayerColor(layer, chunk = null) {
  // Base colors for layers
  if (layer === 'temporary') {
    // Temporary layer: Yellow/Orange (high plasticity)
    const confidence = chunk?.confidence || 0.5;
    const opacity = 0.6 + (confidence * 0.4); // Higher confidence = more opaque

    return {
      background: `rgba(255, 193, 7, ${opacity})`, // #FFC107 with varying opacity
      border: '#F57C00',
      highlight: {
        background: '#FFB300',
        border: '#E65100'
      }
    };
  } else {
    // Stable layer: Green (long-term memory)
    const activationWeight = chunk?.activation_weight || 0;
    const intensity = 0.6 + (activationWeight * 0.4); // Higher activation = brighter

    return {
      background: `rgba(76, 175, 80, ${intensity})`, // #4CAF50 with varying intensity
      border: '#388E3C',
      highlight: {
        background: '#66BB6A',
        border: '#2E7D32'
      }
    };
  }
}

function truncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function updateStats(docCount, chunkCount) {
  const relationshipCount = graphChunks.reduce((count, chunk) => {
    if (!chunk.relationships) return count;
    const rel = chunk.relationships;
    return count +
      (rel.related_chunks?.length || 0) +
      (rel.child_chunks?.length || 0) +
      (rel.contradicts?.length || 0) +
      (rel.supports?.length || 0) +
      (rel.prerequisite_of?.length || 0);
  }, 0);

  const statsEl = document.getElementById('stats-summary');
  if (statsEl) {
    statsEl.textContent =
      `${docCount} documents • ${chunkCount} chunks • ${relationshipCount} relationships`;
  }
  console.log(`[Knowledge Graph] Stats: ${docCount} docs, ${chunkCount} chunks, ${relationshipCount} relationships`);
}

function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (show) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

// ==================== LLM Decision Log Functions ====================

let allLogs = [];
let currentLogFilter = 'all';

async function loadDecisionLogs() {
  try {
    const { llmDecisionLogs = [] } = await chrome.storage.local.get(['llmDecisionLogs']);
    allLogs = llmDecisionLogs;
    renderLogs(allLogs);
    updateLogCount(allLogs.length);
    console.log(`[Knowledge Graph] Loaded ${allLogs.length} decision logs`);
  } catch (error) {
    console.error('[Knowledge Graph] Error loading logs:', error);
  }
}

function renderLogs(logs) {
  const container = document.getElementById('log-entries');

  if (logs.length === 0) {
    container.innerHTML = `
      <div class="log-placeholder">
        <p>No LLM decisions logged yet.</p>
        <p class="log-hint">Save a document with Option+C to see LLM decisions here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = logs.map(log => createLogEntryHTML(log)).join('');

  // Add expand/collapse listeners
  container.querySelectorAll('.log-entry-expand').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const details = e.target.previousElementSibling;
      if (details.style.display === 'none' || !details.style.display) {
        details.style.display = 'block';
        e.target.textContent = 'Hide details';
      } else {
        details.style.display = 'none';
        e.target.textContent = 'Show details';
      }
    });
  });
}

function createLogEntryHTML(log) {
  const timeAgo = getTimeAgo(new Date(log.timestamp));

  return `
    <div class="log-entry ${log.type}" data-type="${log.type}">
      <div class="log-entry-header">
        <span class="log-entry-type">${log.type}</span>
        <span class="log-entry-time">${timeAgo}</span>
      </div>
      <div class="log-entry-title">${log.title}</div>
      <div class="log-entry-content">${log.content}</div>
      ${log.metadata ? `
        <div class="log-entry-meta">
          ${Object.entries(log.metadata).slice(0, 5).map(([key, value]) => `
            <div class="log-meta-item">
              <span class="log-meta-label">${formatKey(key)}:</span>
              <span class="log-meta-value">${formatValue(value)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${log.details ? `
        <div class="log-entry-details" style="display: none;">${log.details}</div>
        <button class="log-entry-expand">Show details</button>
      ` : ''}
    </div>
  `;
}

function filterLogs(filter) {
  currentLogFilter = filter;
  if (filter === 'all') {
    renderLogs(allLogs);
  } else {
    const filtered = allLogs.filter(log => log.type === filter);
    renderLogs(filtered);
  }
}

function toggleLogPanel() {
  const panel = document.getElementById('llm-log-panel');
  const toggleBtn = document.getElementById('toggle-log-btn');

  if (panel.classList.contains('collapsed')) {
    panel.classList.remove('collapsed');
    toggleBtn.textContent = '▼';
  } else {
    panel.classList.add('collapsed');
    toggleBtn.textContent = '▲';
  }
}

async function clearLogs() {
  if (confirm('Are you sure you want to clear all LLM decision logs?')) {
    await chrome.storage.local.set({ llmDecisionLogs: [] });
    allLogs = [];
    renderLogs([]);
    updateLogCount(0);
  }
}

function exportLogs() {
  const data = {
    logs: allLogs,
    exported_at: new Date().toISOString(),
    total_count: allLogs.length
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `llm-decision-logs-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function updateLogCount(count) {
  document.getElementById('log-count').textContent = `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };

  for (const [name, value] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / value);
    if (interval >= 1) {
      return `${interval} ${name}${interval > 1 ? 's' : ''} ago`;
    }
  }

  return 'just now';
}

function formatKey(key) {
  return key.replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, str => str.toUpperCase());
}

function formatValue(value) {
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  return String(value);
}
