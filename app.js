// Global Application State
let buildingData = null;
let currentState = {
  startNodeId: null,
  blockedNodes: new Set(),
  blockedEdges: new Set(),
  closedExits: new Set()
};

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  
  // Try loading default building.json if present
  fetch('building.json')
    .then(res => res.json())
    .then(data => loadBuildingData(data))
    .catch(() => console.log('Waiting for building.json upload...'));
});

function loadBuildingData(data) {
  buildingData = data;
  resetToInitialState();
}

function resetToInitialState() {
  if (!buildingData) return;
  currentState.startNodeId = null;
  currentState.blockedNodes = new Set(buildingData.initial_state?.blocked_nodes || []);
  currentState.blockedEdges = new Set(buildingData.initial_state?.blocked_edges || []);
  currentState.closedExits = new Set(buildingData.initial_state?.closed_exits || []);
  
  updateApp();
}

function toggleNodeHazard(nodeId) {
  const node = buildingData.nodes.find(n => n.id === nodeId);
  if (!node) return;

  if (node.type === 'exit') {
    if (currentState.closedExits.has(nodeId)) currentState.closedExits.delete(nodeId);
    else currentState.closedExits.add(nodeId);
  } else {
    if (currentState.blockedNodes.has(nodeId)) currentState.blockedNodes.delete(nodeId);
    else currentState.blockedNodes.add(nodeId);
  }
  updateApp();
}

function toggleEdgeHazard(edgeId) {
  if (currentState.blockedEdges.has(edgeId)) currentState.blockedEdges.delete(edgeId);
  else currentState.blockedEdges.add(edgeId);
  updateApp();
}

function selectStartNode(nodeId) {
  const node = buildingData.nodes.find(n => n.id === nodeId);
  if (node && node.type !== 'exit') {
    currentState.startNodeId = nodeId;
    updateApp();
  }
}

function updateApp() {
  if (!buildingData) return;

  // 1. Calculate Route using routing.js
  let routeResult = null;
  if (currentState.startNodeId) {
    if (typeof calculateRoute === 'function') {
      routeResult = calculateRoute(buildingData, currentState);
    } else if (window.routing && typeof window.routing.calculateRoute === 'function') {
      routeResult = window.routing.calculateRoute(buildingData, currentState);
    }
  }

  // 2. Render Map via mapRenderer.js
  if (typeof renderMap === 'function') {
    renderMap(buildingData, currentState, routeResult, {
      onNodeClick: (id) => toggleNodeHazard(id),
      onEdgeClick: (id) => toggleEdgeHazard(id),
      onStartSelect: (id) => selectStartNode(id)
    });
  } else if (window.mapRenderer && typeof window.mapRenderer.render === 'function') {
    window.mapRenderer.render(buildingData, currentState, routeResult, {
      onNodeClick: (id) => toggleNodeHazard(id),
      onEdgeClick: (id) => toggleEdgeHazard(id),
      onStartSelect: (id) => selectStartNode(id)
    });
  }

  // 3. Update Status Display
  updateStatusPanel(routeResult);
}

function updateStatusPanel(result) {
  const statusEl = document.getElementById('status-panel') || document.getElementById('status') || document.querySelector('.status-panel');
  if (!statusEl) return;

  if (!currentState.startNodeId) {
    statusEl.innerHTML = `<p class="info">${window.i18n ? window.i18n.t('selectStart') : 'Select a starting location'}</p>`;
    return;
  }

  if (currentState.blockedNodes.has(currentState.startNodeId)) {
    const msg = window.i18n ? window.i18n.t('startBlocked') : 'Starting location blocked';
    statusEl.innerHTML = `<div class="alert alert-error" style="color: red; font-weight: bold;">${msg}</div>`;
    return;
  }

  if (!result || !result.path || result.path.length === 0 || result.error === 'NO_ROUTE') {
    const msg = window.i18n ? window.i18n.t('noRoute') : 'No route available';
    statusEl.innerHTML = `<div class="alert alert-error" style="color: red; font-weight: bold;">${msg}</div>`;
    return;
  }

  const pathStr = result.path.join(' ➔ ');
  const costLabel = window.i18n ? window.i18n.t('cost') : 'Total Cost';
  const exitLabel = window.i18n ? window.i18n.t('exit') : 'Exit';
  const routeLabel = window.i18n ? window.i18n.t('route') : 'Route Sequence';

  statusEl.innerHTML = `
    <div class="alert alert-success" style="color: green;">
      <p><strong>${costLabel}:</strong> ${result.cost}</p>
      <p><strong>${exitLabel}:</strong> ${result.targetExit || result.exit}</p>
      <p><strong>${routeLabel}:</strong> ${pathStr}</p>
    </div>
  `;
}

window.updateApp = updateApp;

function setupEventListeners() {
  // File Uploader Event
  const fileInput = document.getElementById('json-input') || document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const parsed = JSON.parse(evt.target.result);
            loadBuildingData(parsed);
          } catch(err) {
            alert('Invalid JSON File Format!');
          }
        };
        reader.readAsText(file);
      }
    });
  }

  // Language Toggle
  const langBtn = document.getElementById('lang-toggle') || document.querySelector('.lang-btn');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      const current = window.i18n ? window.i18n.getLang() : 'en';
      const next = current === 'en' ? 'bn' : 'en';
      if (window.i18n) window.i18n.setLanguage(next);
    });
  }

  // Reset Button
  const resetBtn = document.getElementById('reset-btn') || document.querySelector('.reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetToInitialState);
  }
}