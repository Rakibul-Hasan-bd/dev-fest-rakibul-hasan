// Sample building fallback data
const DEFAULT_BUILDING_DATA = {
  "building": "East Annex - Practice Building",
  "nodes": [
    { "id": "R1", "label": "Room 101", "type": "room", "x": 60, "y": 65 },
    { "id": "R2", "label": "Room 102", "type": "room", "x": 60, "y": 185 },
    { "id": "C1", "label": "Junction A", "type": "junction", "x": 190, "y": 65 },
    { "id": "C2", "label": "Junction B", "type": "junction", "x": 325, "y": 65 },
    { "id": "E1", "label": "Exit 1", "type": "exit", "x": 460, "y": 65 }
  ],
  "edges": [
    { "from": "R1", "to": "C1", "distance": 10 },
    { "from": "R2", "to": "C1", "distance": 15 },
    { "from": "C1", "to": "C2", "distance": 12 },
    { "from": "C2", "to": "E1", "distance": 10 }
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  const loadSampleBtn = document.getElementById('loadSampleBtn');
  const fileInput = document.getElementById('mapFileInput');

  // Load sample building logic
  if (loadSampleBtn) {
    loadSampleBtn.addEventListener('click', () => {
      fetch('building.json')
        .then(res => {
          if (!res.ok) throw new Error("Network response was not ok");
          return res.json();
        })
        .then(data => renderBuildingMap(data))
        .catch(() => {
          // Fallback to local default data if fetch fails
          renderBuildingMap(DEFAULT_BUILDING_DATA);
        });
    });
  }

  // Load custom JSON file logic
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          renderBuildingMap(data);
        } catch (err) {
          alert('Invalid JSON file format!');
        }
      };
      reader.readAsText(file);
    });
  }
});

function renderBuildingMap(data) {
  if (window.MapRenderer && typeof window.MapRenderer.render === 'function') {
    window.MapRenderer.render(data);
  } else if (typeof renderMap === 'function') {
    renderMap(data);
  } else {
    console.log("Map Data Loaded:", data);
  }
}
