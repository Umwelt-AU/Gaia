// gaia-ui.js — Attr-table layer selector, export panel, layer context menu, labelling, true-geometry distance
// ── ATTR TABLE LAYER SELECTOR ────────────────
function updateAttrLayerSelect() {
  const sel = document.getElementById('attr-layer-select');
  if (!sel) return;
  const vecLayers = state.layers.filter(l => !l.isTile);
  if (!vecLayers.length) {
    sel.innerHTML = '<option value="">— no layers —</option>';
    return;
  }
  const currentVal = sel.value;
  sel.innerHTML = vecLayers.map(l => {
    const idx = state.layers.indexOf(l);
    return '<option value="' + idx + '">' + l.name + '</option>';
  }).join('');
  // If current active layer is in list, keep it selected; otherwise default to first
  const activeInList = vecLayers.some(l => state.layers.indexOf(l) === state.activeLayerIndex);
  sel.value = activeInList ? state.activeLayerIndex : (vecLayers.length ? state.layers.indexOf(vecLayers[0]) : '');
}

function onAttrLayerChange() {
  const sel = document.getElementById('attr-layer-select');
  const idx = parseInt(sel.value);
  if (!isNaN(idx) && state.layers[idx]) {
    setActiveLayer(idx);
  }
}

// ── FLOATING EXPORT PANEL ─────────────────────
function openExportPanel() {
  const panel = document.getElementById('export-float');
  panel.classList.add('visible');
  if (!panel.dataset.dragged) {
    const btn = document.getElementById('export-open-btn');
    if (btn) {
      const r = btn.getBoundingClientRect();
      const panelW = 290;
      panel.style.left = Math.max(8, r.left - panelW - 12) + 'px';
      panel.style.top = Math.max(8, r.top - 20) + 'px';
    } else { panel.style.left = Math.max(8, window.innerWidth - 310) + 'px'; panel.style.top = '80px'; }
  }
  const ob = document.getElementById('export-open-btn');
  if (ob) { ob.style.borderColor='var(--sky)'; ob.style.color='var(--sky)'; ob.style.background='rgba(20,177,231,0.1)'; }
  makePanelDraggable(panel, document.getElementById('export-float-header'));
  updateExportLayerList(); // keep in sync
}

function closeExportPanel() {
  document.getElementById('export-float').classList.remove('visible');
  const ob = document.getElementById('export-open-btn');
  if (ob) { ob.style.borderColor=''; ob.style.color=''; ob.style.background=''; }
}

function toggleExportPanel() {
  const panel = document.getElementById('export-float');
  if (panel.classList.contains('visible')) closeExportPanel();
  else openExportPanel();
}

// ── LAYER CONTEXT MENU ────────────────────────
let ctxLayerIdx = -1;

function openLayerCtxMenu(e, idx) {
  ctxLayerIdx = idx;
  const menu = document.getElementById('layer-ctx-menu');
  const layer = state.layers[idx];
  menu.classList.add('visible');
  // Measure menu height after making visible (it has auto height)
  const menuH = menu.offsetHeight || 250;
  const menuW = menu.offsetWidth  || 190;
  // Position near the click, but flip up if too close to bottom, clamp horizontally
  const spaceBelow = window.innerHeight - e.clientY;
  const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
  const y = spaceBelow < menuH + 10
    ? Math.max(4, e.clientY - menuH)  // flip upward
    : e.clientY;
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  // Close on next click outside
  setTimeout(() => document.addEventListener('click', closeLayerCtxMenu, { once: true }), 10);
}

function closeLayerCtxMenu() {
  document.getElementById('layer-ctx-menu').classList.remove('visible');
}

function ctxZoomToLayer() {
  closeLayerCtxMenu();
  const layer = state.layers[ctxLayerIdx]; if (!layer) return;
  try { _fitLayerBounds(layer, { padding: CONSTANTS.MAP_FIT_PADDING }); } catch(e) {}
}

function ctxSelectAll() {
  closeLayerCtxMenu();
  const layer = state.layers[ctxLayerIdx]; if (!layer || layer.isTile) return;
  setActiveLayer(ctxLayerIdx);
  const feats = layer.geojson.features || [];
  state.selectedFeatureIndices = new Set(feats.map((_,i) => i));
  state.selectedFeatureIndex = feats.length > 0 ? 0 : -1;
  updateSelectionCount(); refreshMapSelection(ctxLayerIdx); renderTable();
  toast('Selected all ' + feats.length + ' features in ' + layer.name, 'success');
}

function ctxRenameLayer() {
  closeLayerCtxMenu();
  const layer = state.layers[ctxLayerIdx]; if (!layer) return;
  const newName = prompt('Rename layer:', layer.name);
  if (newName && newName.trim() && newName.trim() !== layer.name) {
    layer.name = newName.trim();
    updateLayerList(); updateExportLayerList(); updateAttrLayerSelect(); updateSBLLayerList(); updateDQALayerList();
    toast('Layer renamed to "' + layer.name + '"', 'success');
  }
}

function ctxToggleVisibility() {
  closeLayerCtxMenu();
  toggleLayerVisibility(ctxLayerIdx);
}

function ctxClearSelection() {
  closeLayerCtxMenu();
  clearSelection();
}

function ctxRemoveLayer() {
  closeLayerCtxMenu();
  removeLayer(ctxLayerIdx);
}

function ctxExportData() {
  closeLayerCtxMenu();
  const layer = state.layers[ctxLayerIdx];
  if (!layer || layer.isTile) { toast('Cannot export a tile layer', 'error'); return; }
  // Open the export panel and pre-select this layer
  openExportPanel();
  const sel = document.getElementById('export-layer-select');
  if (sel) { sel.value = String(ctxLayerIdx); }
}


// ── LABELLING ─────────────────────────────────────────────────────────

function ctxOpenLabelling(e) {
  closeLayerCtxMenu();
  const layer = state.layers[ctxLayerIdx];
  if (!layer || layer.isTile) { toast('Labelling is not available for tile layers', 'error'); return; }

  // Populate field dropdown
  const sel = document.getElementById('label-field-select');
  sel.innerHTML = '<option value="">— select field —</option>';
  const fields = Object.keys(layer.fields || {});
  fields.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f; opt.textContent = f;
    sel.appendChild(opt);
  });

  // Restore existing settings if any
  const cfg = layer.labelConfig || {};
  sel.value = cfg.field || '';
  const slider = document.getElementById('label-fontsize-slider');
  const sizeDisplay = document.getElementById('label-fontsize-display');
  const fs = cfg.fontSize || 9;
  slider.value = fs;
  sizeDisplay.textContent = fs + 'px';

  const toggle = document.getElementById('label-enabled-toggle');
  toggle.checked = !!(cfg.enabled);
  updateLabelToggleText(toggle.checked);

  // Store which layer we are editing
  const popup = document.getElementById('labelling-popup');
  popup.dataset.layerIdx = ctxLayerIdx;

  // Position near the ⋯ button of the active layer item
  const items = document.querySelectorAll('.layer-item');
  const anchor = items[ctxLayerIdx] ? items[ctxLayerIdx].getBoundingClientRect() : null;
  const pw = 200, ph = 220;
  let px = anchor ? anchor.right + 6 : window.innerWidth / 2 - pw / 2;
  let py = anchor ? anchor.top : window.innerHeight / 2 - ph / 2;
  if (px + pw > window.innerWidth - 8) px = (anchor ? anchor.left : window.innerWidth) - pw - 6;
  if (py + ph > window.innerHeight - 8) py = window.innerHeight - ph - 8;
  popup.style.left = px + 'px';
  popup.style.top  = py + 'px';
  popup.style.display = 'block';

  setTimeout(() => document.addEventListener('click', _closeLabellingOnOutside, { once: true }), 10);
}

function _closeLabellingOnOutside(e) {
  const popup = document.getElementById('labelling-popup');
  if (popup && !popup.contains(e.target)) { popup.style.display = 'none'; }
  else if (popup && popup.style.display !== 'none') {
    setTimeout(() => document.addEventListener('click', _closeLabellingOnOutside, { once: true }), 10);
  }
}

function closeLabellingModal() {
  document.getElementById('labelling-popup').style.display = 'none';
}

function updateLabelToggleText(checked) {
  const text = document.getElementById('label-toggle-text');
  if (text) text.textContent = checked ? 'On' : 'Off';
}

function applyLabelling() {
  const backdrop = document.getElementById('labelling-popup');
  const idx = parseInt(backdrop.dataset.layerIdx);
  const layer = state.layers[idx];
  if (!layer) { closeLabellingModal(); return; }

  const field    = document.getElementById('label-field-select').value;
  const fontSize = parseInt(document.getElementById('label-fontsize-slider').value) || 9;
  const enabled  = document.getElementById('label-enabled-toggle').checked;

  layer.labelConfig = { field, fontSize, enabled };

  // Remove old label layer if any
  _removeLabelLayer(idx);

  if (enabled && field) {
    _renderLabelLayer(idx);
  }

  saveSession();
  closeLabellingModal();
  toast(enabled && field ? 'Labels applied to ' + layer.name : 'Labels removed from ' + layer.name, 'success');
}

function _removeLabelLayer(idx) {
  const layer = state.layers[idx];
  if (!layer) return;
  const mapId = _layerMapId(idx) + '-label';
  try { if (state.map.getLayer(mapId)) state.map.removeLayer(mapId); } catch(_) {}
  layer._labelLayer = null;
}

function _renderLabelLayer(idx) {
  const layer = state.layers[idx];
  if (!layer || !layer.labelConfig?.enabled || !layer.labelConfig.field) return;
  _removeLabelLayer(idx); // remove existing
  const cfg = layer.labelConfig;
  const mapId = _layerMapId(idx);
  const labelId = mapId + '-label';
  if (!state.map.getSource(mapId)) return; // source not yet added
  try {
    state.map.addLayer({
      id: labelId,
      type: 'symbol',
      source: mapId,
      layout: {
        'text-field': ['get', cfg.field],
        'text-size': cfg.fontSize || 12,
        'text-anchor': 'center',
        'text-allow-overlap': false,
        'symbol-placement': 'point',
      },
      paint: {
        'text-color': '#222222',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    });
    layer._labelLayer = labelId;
  } catch(_) {}
}

// Re-render labels when layer visibility is toggled
const _origToggleLayerVisibility = toggleLayerVisibility;
toggleLayerVisibility = function(i) {
  _origToggleLayerVisibility(i);
  const layer = state.layers[i];
  if (!layer) return;
  if (layer.labelConfig?.enabled && layer.labelConfig.field) {
    if (layer.visible) {
      _renderLabelLayer(i);
    } else {
      _removeLabelLayer(i);
    }
  }
};

function clearSelection() {
  if (state.selectedFeatureIndices.size === 0) return;
  const n = state.selectedFeatureIndices.size;
  state.selectedFeatureIndices = new Set();
  state.selectedFeatureIndex = -1;
  // Also turn off show-only-selected if it's on
  if (state.showOnlySelected) {
    state.showOnlySelected = false;
    const ssb = document.getElementById('show-selected-btn');
    if (ssb) { ssb.style.borderColor=''; ssb.style.color=''; ssb.style.background=''; ssb.textContent='◈ Show Selected'; }
  }
  refreshMapSelection(state.activeLayerIndex);
  updateSelectionCount();
  renderTable();
  toast('Cleared ' + n + ' selected feature' + (n !== 1 ? 's' : ''), 'info');
}

// ── SBL — handle new geom types in onSBLGeomTypeChange ──
// Patch the existing function to handle 'distance'
const _origOnSBLGeomTypeChange = window.onSBLGeomTypeChange || function(){};
window.onSBLGeomTypeChange = function() {
  const geomType = document.getElementById('sbl-geom-type').value;
  const radiusRow = document.getElementById('sbl-radius-row');
  const distSrcRow = null; // removed
  const selectedRow = document.getElementById('sbl-selected-source-row');
  const spatialRow = document.getElementById('sbl-spatial-rel-row');
  const drawBtn = document.getElementById('sbl-draw-btn');
  const radiusLabel = document.getElementById('sbl-radius-label');

  radiusRow.style.display = (geomType === 'point' || geomType === 'distance') ? 'block' : 'none';
  if (distSrcRow) distSrcRow.style.display = geomType === 'distance' ? 'block' : 'none';
  selectedRow.style.display = geomType === 'selected' ? 'block' : 'none';
  spatialRow.style.display = (geomType === 'selected' || geomType === 'distance') ? 'none' : 'block';

  if (radiusLabel) {
    radiusLabel.textContent = geomType === 'distance' ? 'Distance (metres)' : 'Radius (metres)';
  }
  if (geomType === 'distance') {
    const el = document.getElementById('sbl-radius');
    if (el && !el.dataset.distanceSet) { el.value = 1000; el.dataset.distanceSet = '1'; }
  }
  const labels = { polygon:'✎ Draw Polygon', line:'✎ Draw Line', point:'◎ Click on Map', distance:'⚡ Select within Distance', selected:'⚡ Run Selection' };
  if (drawBtn) drawBtn.textContent = labels[geomType] || '✎ Draw';
};

// Patch activateSBL to handle 'distance'
const _origActivateSBL = window.activateSBL;
window.activateSBL = function() {
  const geomType = document.getElementById('sbl-geom-type').value;
  if (geomType === 'distance') { runDistanceSelect(); return; }
  _origActivateSBL();
};

// ── TRUE GEOMETRY DISTANCE ────────────────────────────────────────
// Point-to-segment minimum distance (metres) using haversine
// Returns the perpendicular distance if the foot lies on the segment,
// otherwise the distance to the nearer endpoint.
function pointToSegmentDist(p, a, b) {
  const dx = b.lng - a.lng, dy = b.lat - a.lat;
  const lenSq = dx*dx + dy*dy;
  if (lenSq === 0) return haversine(p, a);
  // Project p onto segment, clamp to [0,1]
  const t = Math.max(0, Math.min(1, ((p.lng-a.lng)*dx + (p.lat-a.lat)*dy) / lenSq));
  return haversine(p, {lat:a.lat + t*dy, lng:a.lng + t*dx});
}

// Extract all edge segments from a feature as arrays of [A, B] L.LatLng pairs.
// Points return a single degenerate segment [pt, pt].
function getFeatureSegments(feat) {
  if (!feat.geometry) return [];
  const type = feat.geometry.type;
  const coords = feat.geometry.coordinates;
  const segs = [];
  function ptLL(c) { return {lat:c[1], lng:c[0]}; }

  function ringsToSegs(rings) {
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        segs.push([ptLL(ring[i-1]), ptLL(ring[i])]);
      }
    }
  }
  function lineToSegs(line) {
    for (let i = 1; i < line.length; i++) segs.push([ptLL(line[i-1]), ptLL(line[i])]);
  }

  if (type === 'Point') { const p = ptLL(coords); segs.push([p, p]); }
  else if (type === 'MultiPoint') { coords.forEach(c => { const p = ptLL(c); segs.push([p, p]); }); }
  else if (type === 'LineString') { lineToSegs(coords); }
  else if (type === 'MultiLineString') { coords.forEach(l => lineToSegs(l)); }
  else if (type === 'Polygon') { ringsToSegs(coords); }
  else if (type === 'MultiPolygon') { coords.forEach(poly => ringsToSegs(poly)); }
  else if (type === 'GeometryCollection') {
    feat.geometry.geometries.forEach(g => {
      const sub = getFeatureSegments({ geometry: g });
      sub.forEach(s => segs.push(s));
    });
  }
  return segs;
}

// Minimum distance (metres) between two features using true segment geometry.
// For each segment of featA, find the minimum distance to any segment of featB.
// The distance from segment S to segment T is min(dist of each endpoint to the other segment).
function minGeomDistBetweenFeatures(featA, featB) {
  const segsA = getFeatureSegments(featA);
  const segsB = getFeatureSegments(featB);
  if (!segsA.length || !segsB.length) return Infinity;

  let minDist = Infinity;

  // For very large geometries, budget the work to stay under ~200ms.
  // We iterate all segsA × segsB but short-circuit as soon as we find distance <= threshold.
  for (const [a0, a1] of segsA) {
    for (const [b0, b1] of segsB) {
      // Check all four endpoint-to-segment combinations for each segment pair
      const d = Math.min(
        pointToSegmentDist(a0, b0, b1),
        pointToSegmentDist(a1, b0, b1),
        pointToSegmentDist(b0, a0, a1),
        pointToSegmentDist(b1, a0, a1)
      );
      if (d < minDist) {
        minDist = d;
        if (minDist === 0) return 0; // touching/overlapping — no need to continue
      }
    }
  }
  return minDist;
}

function runDistanceSelect() {
  const layerIdx = parseInt(document.getElementById('sbl-layer-select').value);
  const layer = state.layers[layerIdx]; if (!layer) { toast('Select a target layer first', 'error'); return; }
  const distM = parseFloat(document.getElementById('sbl-radius').value) || 1000;
  const feats = layer.geojson.features || [];

  // Use currently selected features as source geometry, otherwise error
  const hasSelection = state.selectedFeatureIndices.size > 0 && state.activeLayerIndex === layerIdx;
  const sourceFeats = hasSelection
    ? [...state.selectedFeatureIndices].map(i => feats[i]).filter(f => f && f.geometry)
    : null;

  if (!sourceFeats || !sourceFeats.length) {
    toast('Select source features first, then run Within Distance', 'error'); return;
  }

  showProgress('Computing distances…', 'Measuring geometry-to-geometry distances', 0);

  // Pre-extract source segments once
  const sourceSegSets = sourceFeats.map(f => getFeatureSegments(f));

  const newSelection = new Set();
  const total = feats.length;
  feats.forEach((feat, i) => {
    if (!feat.geometry) return;
    // Skip if already a source feature
    if (state.selectedFeatureIndices.has(i)) { newSelection.add(i); return; }
    const targetSegs = getFeatureSegments(feat);
    if (!targetSegs.length) return;

    for (const srcSegs of sourceSegSets) {
      let minD = Infinity;
      outer: for (const [a0, a1] of srcSegs) {
        for (const [b0, b1] of targetSegs) {
          const d = Math.min(
            pointToSegmentDist(a0, b0, b1),
            pointToSegmentDist(a1, b0, b1),
            pointToSegmentDist(b0, a0, a1),
            pointToSegmentDist(b1, a0, a1)
          );
          if (d < minD) { minD = d; }
          if (minD <= distM) { newSelection.add(i); break outer; }
        }
      }
    }
    if (i % 50 === 0) setProgress(Math.round(i/total*90), 'Checked ' + i + ' of ' + total + ' features…');
  });

  hideProgress();
  applySBLSelection(layerIdx, newSelection, 'within ' + fmtDistance(distM) + ' (geometry)');
  toast('Distance select: ' + newSelection.size + ' features within ' + fmtDistance(distM), newSelection.size > 0 ? 'success' : 'info');
}

