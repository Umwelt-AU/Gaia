// gaia-draw.js — Create Features panel, Design QA widget
// ══════════════════════════════════════════════════════════
//  CREATE FEATURES PANEL
// ══════════════════════════════════════════════════════════

const createState = {
  activeLayerIdx: -1, // index in state.layers of the currently active editable layer
  drawMode: null,     // 'point' | 'line' | 'polygon' | 'buffer'
  drawPoints: [],
  drawPreview: null,
  drawLine: null,
  editLayerIndices: new Set(), // track which state.layers entries are editable
  pendingFeatIdx: -1, // feature idx being edited
  pendingLayerIdx: -1,
  bufferDrawPoints: [],
  bufferPreviewLayer: null,
  bufferShapeLayer: null,
  // Undo / Redo stacks
  featureUndoStack: [],   // [{layerIdx, featJson}]  — committed features
  featureRedoStack: [],   // [{layerIdx, featJson}]  — redo after undo
};

// ── Open/Close ──────────────────────────────────────────
function openCreatePanel() {
  const panel = document.getElementById('create-float');
  panel.classList.add('visible');
  if (!panel.dataset.dragged) {
    const btn = document.getElementById('create-open-btn');
    if (btn) {
      const r = btn.getBoundingClientRect();
      const panelW = 320;
      panel.style.left = Math.max(8, r.left - panelW - 12) + 'px';
      panel.style.top = Math.max(8, r.top - 20) + 'px';
    } else { panel.style.left = Math.max(8, window.innerWidth - 340) + 'px'; panel.style.top = '160px'; }
  }
  const ob = document.getElementById('create-open-btn');
  if (ob) { ob.style.borderColor='var(--sky)'; ob.style.color='var(--sky)'; ob.style.background='rgba(20,177,231,0.1)'; }
  makePanelDraggable(panel, document.getElementById('create-float-header'));
  updateCreateLayerList();
  // Hook buffer source select
  const bsrc = document.getElementById('buffer-source');
  if (bsrc && !bsrc._hooked) {
    bsrc._hooked = true;
    bsrc.addEventListener('change', function() {
      document.getElementById('buffer-draw-row').style.display = this.value === 'drawn' ? 'block' : 'none';
    });
  }
}

function closeCreatePanel() {
  document.getElementById('create-float').classList.remove('visible');
  stopCreateDraw();
  const ob = document.getElementById('create-open-btn');
  if (ob) { ob.style.borderColor=''; ob.style.color=''; ob.style.background=''; }
}

function toggleCreatePanel() {
  const panel = document.getElementById('create-float');
  if (panel.classList.contains('visible')) closeCreatePanel();
  else openCreatePanel();
}

// ── Create a new editable layer ──────────────────────────
function createEditableLayer(geomType) {
  const colors = ['#e3b341','#f0883e','#f85149','#bc8cff','#79c0ff'];
  const color = colors[createState.editLayerIndices.size % colors.length];
  const name = geomType + ' Layer ' + (createState.editLayerIndices.size + 1);
  const geojson = { type: 'FeatureCollection', features: [] };

  // Create Leaflet layer
  const isPoint = geomType === 'Point';
  const isLine  = geomType === 'LineString';
  const idx = state.layers.length;
  const mapId = _layerMapId(idx);
  const layerEntry = {
    geojson, name, sourceCRS: 'EPSG:4326', format: 'Editable',
    color, fields: { Type:'string', Description:'string', Comment:'string' },
    geomType, mapId, visible: true, editable: true, editGeomType: geomType
  };
  state.layers.push(layerEntry);
  if (state.map.isStyleLoaded()) _renderMapLayer(layerEntry, idx);
  else state.map.once('load', () => _renderMapLayer(layerEntry, idx));
  createState.editLayerIndices.add(idx);

  updateLayerList(); updateExportLayerList(); updateCreateLayerList();
  setCreateActiveLayer(idx);
  toast('Created editable ' + geomType + ' layer: ' + name, 'success');
}

function setCreateActiveLayer(idx) {
  createState.activeLayerIdx = idx;
  updateCreateLayerList();
  const layer = state.layers[idx];
  if (layer) {
    document.getElementById('create-draw-section').style.display = 'block';
    document.getElementById('create-active-info').textContent =
      '✎ Active: ' + layer.name + ' (' + layer.editGeomType + ')';
    const drawBtn = document.getElementById('create-draw-btn');
    if (drawBtn) {
      const lbl = { Point:'● Add Point', LineString:'〜 Draw Line', Polygon:'⬡ Draw Polygon' };
      drawBtn.textContent = lbl[layer.editGeomType] || '✎ Draw Feature';
    }
  }
}

function updateCreateLayerList() {
  const el = document.getElementById('create-layer-list');
  const editLayers = state.layers.filter(l => l.editable);
  if (!editLayers.length) {
    el.innerHTML = '<div class="empty-state" style="padding:10px;">No editable layers yet.</div>';
    return;
  }
  el.innerHTML = editLayers.map(l => {
    const idx = state.layers.indexOf(l);
    const active = idx === createState.activeLayerIdx;
    return `<div class="create-layer-item ${active ? 'editing' : ''}" onclick="setCreateActiveLayer(${idx})">
      <div class="create-layer-dot" style="background:${l.color}"></div>
      <div class="create-layer-info">
        <div class="create-layer-name">${l.name}</div>
        <div class="create-layer-meta">${l.editGeomType} · ${l.geojson.features.length} features</div>
      </div>
    </div>`;
  }).join('');
}

// ── Drawing new features ─────────────────────────────────
function startDrawFeature() {
  const layer = state.layers[createState.activeLayerIdx];
  if (!layer) { toast('Select an editable layer first', 'error'); return; }
  stopCreateDraw();
  createState.drawMode = layer.editGeomType;
  createState.drawPoints = [];
  state.map.getCanvas().style.cursor = 'crosshair';
  
  state.map.on('click', handleCreateClick);
  state.map.on('mousemove', handleCreateMouseMove);
  if (createState.drawMode !== 'Point') state.map.on('dblclick', handleCreateDblClick);
  document.getElementById('create-draw-btn').style.display = 'none';
  document.getElementById('create-end-btn').style.display = 'block';
  document.getElementById('create-hint').style.display = 'block';
  const hints = {
    Point: 'Click on the map to place a point.',
    LineString: 'Click to add vertices. Double-click or ⏹ to finish.',
    Polygon: 'Click to add vertices. Double-click or ⏹ to close polygon.'
  };
  document.getElementById('create-hint').textContent = hints[createState.drawMode] || '';
}

function endDrawFeature() {
  if (createState.drawMode === 'LineString' && createState.drawPoints.length >= 2) {
    finaliseFeature();
  } else if (createState.drawMode === 'Polygon' && createState.drawPoints.length >= 3) {
    finaliseFeature();
  } else if (createState.drawMode === 'Point') {
    // Nothing pending to finish
  }
  stopCreateDraw();
}

function stopCreateDraw() {
  state.map.off('click', handleCreateClick);
  state.map.off('mousemove', handleCreateMouseMove);
  state.map.off('dblclick', handleCreateDblClick);
  
  state.map.getCanvas().style.cursor = '';
  _clearDraw();
  
  createState.drawPoints = [];
  createState.drawMode = null;
  const drawBtn = document.getElementById('create-draw-btn');
  const endBtn  = document.getElementById('create-end-btn');
  const hint    = document.getElementById('create-hint');
  if (drawBtn) drawBtn.style.display = 'block';
  if (endBtn)  endBtn.style.display  = 'none';
  if (hint)    hint.style.display    = 'none';
}

function handleCreateClick(e) {
  const mode = createState.drawMode;
  const ll = _evtLatLng(e);
  if (mode === 'Point') {
    createState.drawPoints = [ll];
    finaliseFeature();
    stopCreateDraw();
    return;
  }
  createState.drawPoints.push(ll);
  redrawCreatePreview();
  _updateVertexCount();
}

function handleCreateMouseMove(e) {
  if (!createState.drawPoints.length) return;
  const ll = _evtLatLng(e);
  const pts = [...createState.drawPoints, ll];
  if (createState.drawMode === 'LineString') {
    const f = _drawLineFeature(pts, '#e3b341'); _setDrawPreview(f ? [f] : []);
  } else {
    const f = _drawPolygonFeature(pts, '#e3b341'); _setDrawPreview(f ? [f] : []);
  }
}

function handleCreateDblClick(e) {
  if (createState.drawPoints.length > 0) createState.drawPoints.pop();
  if (createState.drawMode === 'LineString' && createState.drawPoints.length >= 2) finaliseFeature();
  else if (createState.drawMode === 'Polygon' && createState.drawPoints.length >= 3) finaliseFeature();
  stopCreateDraw();
}

function redrawCreatePreview() {
  const pts = createState.drawPoints;
  if (!pts.length) return;
  const mode = createState.drawMode;
  const vertexFeats = pts.map(p => _drawPointFeature(p, '#e3b341')).filter(Boolean);
  const shapeFeature = mode === 'LineString'
    ? _drawLineFeature(pts, '#e3b341')
    : _drawPolygonFeature(pts, '#e3b341');
  _setDrawFeatures([...(shapeFeature ? [shapeFeature] : []), ...vertexFeats]);
}

function finaliseFeature() {
  const layerIdx = createState.activeLayerIdx;
  const layer = state.layers[layerIdx]; if (!layer) return;
  const pts = createState.drawPoints;
  let coords, geomType = layer.editGeomType;

  if (geomType === 'Point') {
    coords = [pts[0].lng, pts[0].lat];
  } else if (geomType === 'LineString') {
    coords = pts.map(p => [p.lng, p.lat]);
  } else {
    // Close the polygon ring
    const ring = pts.map(p => [p.lng, p.lat]);
    ring.push(ring[0]);
    coords = [ring];
  }

  const feat = {
    type: 'Feature',
    geometry: { type: geomType, coordinates: coords },
    properties: { Type: '', Description: '', Comment: '' }
  };
  layer.geojson.features.push(feat);
  _rebuildMapLayer(layerIdx);

  // Push to undo stack, clear redo stack
  createState.featureUndoStack.push({ layerIdx, featJson: JSON.stringify(feat) });
  createState.featureRedoStack = [];
  updateCreateLayerList();
  updateLayerList();

  // Immediately open edit modal for the new feature
  const fi = layer.geojson.features.length - 1;
  openFeatEditModal(layerIdx, fi);

  // Clean up preview layers
  
  _clearDraw();
}

// ── Feature attribute edit modal ─────────────────────────
function openFeatEditModal(layerIdx, featIdx) {
  const layer = state.layers[layerIdx]; if (!layer) return;
  const feat = layer.geojson.features[featIdx]; if (!feat) return;
  createState.pendingLayerIdx = layerIdx;
  createState.pendingFeatIdx = featIdx;
  const p = feat.properties || {};
  document.getElementById('feat-edit-type').value = p.Type || '';
  document.getElementById('feat-edit-desc').value = p.Description || '';
  document.getElementById('feat-edit-comment').value = p.Comment || '';

  // Show lat/lng for Point features
  const latlngRow = document.getElementById('feat-edit-latlng-row');
  const isPoint = feat.geometry && feat.geometry.type === 'Point';
  latlngRow.style.display = isPoint ? 'block' : 'none';
  if (isPoint) {
    const [lng, lat] = feat.geometry.coordinates;
    document.getElementById('feat-edit-lat').value = lat.toFixed(7);
    document.getElementById('feat-edit-lng').value = lng.toFixed(7);
  }

  document.getElementById('feat-edit-backdrop').classList.add('open');
}

function closeFeatEditModal(e) {
  if (e && e.target !== document.getElementById('feat-edit-backdrop')) return;
  document.getElementById('feat-edit-backdrop').classList.remove('open');
}

function saveFeatEdit() {
  const layer = state.layers[createState.pendingLayerIdx];
  if (!layer) { document.getElementById('feat-edit-backdrop').classList.remove('open'); return; }
  const feat = layer.geojson.features[createState.pendingFeatIdx];
  if (feat) {
    feat.properties.Type        = document.getElementById('feat-edit-type').value.trim();
    feat.properties.Description = document.getElementById('feat-edit-desc').value.trim();
    feat.properties.Comment     = document.getElementById('feat-edit-comment').value.trim();

    // Update point coordinates if lat/lng were edited
    if (feat.geometry && feat.geometry.type === 'Point') {
      const newLat = parseFloat(document.getElementById('feat-edit-lat').value);
      const newLng = parseFloat(document.getElementById('feat-edit-lng').value);
      if (!isNaN(newLat) && !isNaN(newLng)) {
        const oldCoords = feat.geometry.coordinates;
        if (Math.abs(newLat - oldCoords[1]) > 0.0000001 || Math.abs(newLng - oldCoords[0]) > 0.0000001) {
          feat.geometry.coordinates = [newLng, newLat];
          // Rebuild the leaflet layer so the marker moves
          
          _renderMapLayer(layer, state.layers.indexOf(layer));
        }
      }
    }
  }
  document.getElementById('feat-edit-backdrop').classList.remove('open');
  updateCreateLayerList(); updateLayerList();
  toast('Feature attributes saved', 'success');
  saveSession();
}

function deleteFeatFromEdit() {
  const layer = state.layers[createState.pendingLayerIdx];
  if (!layer) return;
  const fi = createState.pendingFeatIdx;
  layer.geojson.features.splice(fi, 1);
  // Rebuild leaflet layer
  
  _renderMapLayer(layer, state.layers.indexOf(layer));
  document.getElementById('feat-edit-backdrop').classList.remove('open');
  updateCreateLayerList(); updateLayerList();
  toast('Feature deleted', 'info');
}

// ── BUFFER ────────────────────────────────────────────────
// Approximate circular buffer around a point (32 vertices)
function circleToPolygon(centreLL, radiusM) {
  const pts = [];
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * 2 * Math.PI;
    const dx = radiusM * Math.cos(angle);
    const dy = radiusM * Math.sin(angle);
    const lat = centreLL.lat + (dy / 111320);
    const lng = centreLL.lng + (dx / (111320 * Math.cos(centreLL.lat * Math.PI / 180)));
    pts.push([lng, lat]);
  }
  pts.push(pts[0]);
  return pts;
}

// Simple flat-earth offset for a LatLng
function offsetLatLng(ll, dxM, dyM) {
  return L.latLng(
    ll.lat + dyM / 111320,
    ll.lng + dxM / (111320 * Math.cos(ll.lat * Math.PI / 180))
  );
}

// Buffer a LineString or Polygon ring by radiusM (approximate, per-segment offset quads)
function bufferSegments(coords2d, radiusM, closed) {
  // Create an approximate buffer by adding circles at each vertex
  // and rectangles along each segment
  const circles = coords2d.map(c => circleToPolygon({lat:c[1], lng:c[0]}, radiusM));
  // Union = just return the convex hull of all buffer circles (simplified)
  // For a proper buffer we merge all vertex circles' coordinates
  const allPts = circles.flat();
  return convexHull(allPts.map(c => [c[0], c[1]]));
}

// Graham scan convex hull on [lng, lat] points
function convexHull(points) {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  function cross(o,a,b) { return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]); }
  const lower = [], upper = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = sorted.length-1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  const hull = [...lower, ...upper];
  hull.push(hull[0]); // close
  return hull;
}

function bufferFeature(feat, radiusM) {
  if (!feat.geometry) return null;
  const type = feat.geometry.type;
  const coords = feat.geometry.coordinates;
  function ptLL(c) { return {lat:c[1], lng:c[0]}; }

  let hullCoords;
  if (type === 'Point') {
    hullCoords = circleToPolygon(ptLL(coords), radiusM);
  } else if (type === 'MultiPoint') {
    const allPts = coords.flatMap(c => circleToPolygon(ptLL(c), radiusM));
    hullCoords = convexHull(allPts);
  } else if (type === 'LineString') {
    const allCirclePts = coords.flatMap(c => circleToPolygon(ptLL(c), radiusM));
    hullCoords = convexHull(allCirclePts);
  } else if (type === 'MultiLineString') {
    const allPts = coords.flat().flatMap(c => circleToPolygon(ptLL(c), radiusM));
    hullCoords = convexHull(allPts);
  } else if (type === 'Polygon') {
    const allPts = coords[0].flatMap(c => circleToPolygon(ptLL(c), radiusM));
    hullCoords = convexHull(allPts);
  } else if (type === 'MultiPolygon') {
    const allPts = coords.flatMap(poly => poly[0]).flatMap(c => circleToPolygon(ptLL(c), radiusM));
    hullCoords = convexHull(allPts);
  } else {
    return null;
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [hullCoords] },
    properties: { ...feat.properties, _buffer_dist_m: radiusM }
  };
}

function startBufferDraw() {
  stopCreateDraw();
  createState.drawMode = 'buffer-polygon';
  createState.drawPoints = [];
  state.map.getCanvas().style.cursor = 'crosshair';
  
  state.map.on('click', handleBufferDrawClick);
  state.map.on('mousemove', handleBufferDrawMove);
  state.map.on('dblclick', handleBufferDrawDblClick);
  document.getElementById('buffer-draw-btn').style.display = 'none';
  document.getElementById('buffer-end-btn').style.display = 'block';
}

function endBufferDraw() {
  state.map.off('click', handleBufferDrawClick);
  state.map.off('mousemove', handleBufferDrawMove);
  state.map.off('dblclick', handleBufferDrawDblClick);
  
  state.map.getCanvas().style.cursor = '';
  _clearDraw();
  document.getElementById('buffer-draw-btn').style.display = 'block';
  document.getElementById('buffer-end-btn').style.display = 'none';
  createState.drawMode = null;
  // Keep bufferShapeLayer visible so user can see what they drew
}

function handleBufferDrawClick(e) {
  createState.drawPoints.push(_evtLatLng(e));
  
}
function handleBufferDrawMove(e) {
  if (!createState.drawPoints.length) return;
  _clearDraw();
}
function handleBufferDrawDblClick(e) {
  
  if (createState.drawPoints.length > 0) createState.drawPoints.pop();
  endBufferDraw();
}

function runBuffer() {
  const radiusM = parseFloat(document.getElementById('buffer-distance').value) || 500;
  const layerName = document.getElementById('buffer-layer-name').value.trim() || 'Buffer ' + fmtDistance(radiusM);
  const src = document.getElementById('buffer-source').value;
  let sourceFeats = [];

  if (src === 'drawn') {
    // Buffer the drawn polygon itself
    if (!createState.bufferShapeLayer && createState.drawPoints.length < 2) {
      toast('Draw a shape first', 'error'); return;
    }
    // Create a synthetic polygon feature from the drawn points
    const ring = createState.drawPoints.map(p => [p.lng, p.lat]);
    if (ring.length >= 2) {
      ring.push(ring[0]);
      sourceFeats = [{ type:'Feature', geometry:{ type:'Polygon', coordinates:[ring] }, properties:{} }];
    }
  } else {
    // Use selected features
    const layer = state.layers[state.activeLayerIndex];
    if (!layer || state.selectedFeatureIndices.size === 0) {
      toast('Select features to buffer first', 'error'); return;
    }
    sourceFeats = [...state.selectedFeatureIndices].map(i => layer.geojson.features[i]).filter(f => f && f.geometry);
  }

  if (!sourceFeats.length) { toast('No source features found', 'error'); return; }

  const bufferFeats = sourceFeats.map(f => bufferFeature(f, radiusM)).filter(Boolean);
  if (!bufferFeats.length) { toast('Buffer failed — check source geometry', 'error'); return; }

  const geojson = { type: 'FeatureCollection', features: bufferFeats };
  addLayer(geojson, layerName, 'EPSG:4326', 'Buffer');
  // Clean up drawn shape
  
  createState.drawPoints = [];
  toast('Buffer layer created: ' + layerName + ' (' + bufferFeats.length + ' features)', 'success');
}

// ── WIDGET BUFFER (⬡ Buffer tab in Widgets panel) ─────────────────
const wBufferState = { drawPoints: [], previewLayer: null, shapeLayer: null, mode: null };

function onWBufferSourceChange() {
  const v = document.getElementById('wbuffer-source').value;
  const isDrawn = v === 'polygon' || v === 'line' || v === 'point';
  document.getElementById('wbuffer-draw-row').style.display = isDrawn ? 'block' : 'none';
  const labels = { polygon: '✎ Draw Polygon', line: '✎ Draw Line', point: '✎ Place Point' };
  if (isDrawn) document.getElementById('wbuffer-draw-btn').textContent = labels[v] || '✎ Draw Shape';
}

function startWBufferDraw() {
  stopWBufferDraw();
  wBufferState.drawPoints = [];
  const src = document.getElementById('wbuffer-source').value;
  wBufferState.mode = src; // 'polygon' | 'line' | 'point'
  state.map.getCanvas().style.cursor = 'crosshair';
  
  state.map.on('click', handleWBufferClick);
  state.map.on('mousemove', handleWBufferMove);
  if (src !== 'point') state.map.on('dblclick', handleWBufferDblClick);
  document.getElementById('wbuffer-draw-btn').style.display = 'none';
  document.getElementById('wbuffer-end-btn').style.display = 'block';
}

function endWBufferDraw() {
  stopWBufferDraw();
  document.getElementById('wbuffer-draw-btn').style.display = 'block';
  document.getElementById('wbuffer-end-btn').style.display = 'none';
}

function stopWBufferDraw() {
  state.map.off('click', handleWBufferClick);
  state.map.off('mousemove', handleWBufferMove);
  state.map.off('dblclick', handleWBufferDblClick);
  
  state.map.getCanvas().style.cursor = '';
  
  wBufferState.mode = null;
}

function handleWBufferClick(e) {
  const mode = wBufferState.mode;
  const ll = _evtLatLng(e);
  if (mode === 'point') {
    wBufferState.drawPoints = [ll];
    _setDrawFeatures([_drawPointFeature(ll, '#5ab4f0')].filter(Boolean));
    endWBufferDraw();
    return;
  }
  wBufferState.drawPoints.push(ll);
  // Update draw source
  const feats = [];
  if (mode === 'line' && wBufferState.drawPoints.length > 1) {
    const f = _drawLineFeature(wBufferState.drawPoints, '#5ab4f0'); if (f) feats.push(f);
  } else if (mode === 'polygon' && wBufferState.drawPoints.length > 2) {
    const f = _drawPolygonFeature(wBufferState.drawPoints, '#5ab4f0'); if (f) feats.push(f);
  }
  wBufferState.drawPoints.forEach(p => { const f = _drawPointFeature(p, '#5ab4f0'); if (f) feats.push(f); });
  _setDrawFeatures(feats);
}
function handleWBufferMove(e) {
  if (!wBufferState.drawPoints.length) return;
  const ll = _evtLatLng(e);
  const pts = [...wBufferState.drawPoints, ll];
  const mode = wBufferState.mode;
  if (mode === 'line') {
    const f = _drawLineFeature(pts, '#5ab4f0'); _setDrawPreview(f ? [f] : []);
  } else {
    const f = _drawPolygonFeature(pts, '#5ab4f0'); _setDrawPreview(f ? [f] : []);
  }
}
function handleWBufferDblClick(e) {
  if (wBufferState.drawPoints.length > 0) wBufferState.drawPoints.pop();
  endWBufferDraw();
}

function runWidgetBuffer() {
  const radiusM = parseFloat(document.getElementById('wbuffer-distance').value) || 500;
  const layerName = (document.getElementById('wbuffer-name').value || '').trim() || 'Buffer ' + fmtDistance(radiusM);
  const src = document.getElementById('wbuffer-source').value;
  let sourceFeats = [];

  if (src === 'polygon' || src === 'line' || src === 'point') {
    const pts = wBufferState.drawPoints;
    if (!pts.length) { toast('Draw a shape first', 'error'); return; }
    let geom;
    if (src === 'point') {
      geom = { type:'Point', coordinates:[pts[0].lng, pts[0].lat] };
    } else if (src === 'line') {
      if (pts.length < 2) { toast('Draw at least 2 points for a line', 'error'); return; }
      geom = { type:'LineString', coordinates: pts.map(p=>[p.lng,p.lat]) };
    } else {
      if (pts.length < 2) { toast('Draw at least 3 points for a polygon', 'error'); return; }
      const ring = pts.map(p=>[p.lng,p.lat]); ring.push(ring[0]);
      geom = { type:'Polygon', coordinates:[ring] };
    }
    sourceFeats = [{ type:'Feature', geometry:geom, properties:{} }];
  } else {
    const layer = state.layers[state.activeLayerIndex];
    if (!layer || layer.isTile) { toast('Select a vector layer with selected features', 'error'); return; }
    if (state.selectedFeatureIndices.size === 0) { toast('Select features to buffer first', 'error'); return; }
    sourceFeats = [...state.selectedFeatureIndices].map(i => (layer.geojson.features||[])[i]).filter(f => f && f.geometry);
  }
  if (!sourceFeats.length) { toast('No source features found', 'error'); return; }

  const buffered = sourceFeats.map(f => bufferFeature(f, radiusM)).filter(Boolean);
  if (!buffered.length) { toast('Buffer failed — check source geometry', 'error'); return; }

  addLayer({ type:'FeatureCollection', features:buffered }, layerName, 'EPSG:4326', 'Buffer');
  
  wBufferState.drawPoints = [];
  const el = document.getElementById('wbuffer-result');
  el.style.display = 'block'; el.textContent = '✓ Created: ' + layerName + ' (' + buffered.length + ' features)';
  toast('Buffer layer created: ' + layerName, 'success');
}

// ══════════════════════════════════════════════════════════
//  DESIGN QA WIDGET
// ══════════════════════════════════════════════════════════

function updateDQALayerList() {
  const boundarySelect = document.getElementById('dqa-boundary-select');
  const layersList = document.getElementById('dqa-layers-list');
  if (!boundarySelect || !layersList) return;

  const vecLayers = state.layers.filter(l => !l.isTile);

  // Populate boundary dropdown (polygon layers preferred, but show all vector)
  const prevBoundary = boundarySelect.value;
  boundarySelect.innerHTML = '<option value="">— select polygon layer —</option>';
  vecLayers.forEach((l, i) => {
    const idx = state.layers.indexOf(l);
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = l.name + (l.geomType && l.geomType.toLowerCase().includes('polygon') ? ' ✦' : '');
    boundarySelect.appendChild(opt);
  });
  if (prevBoundary !== '' && boundarySelect.querySelector(`option[value="${prevBoundary}"]`)) {
    boundarySelect.value = prevBoundary;
  }

  // Populate design layers checklist
  if (!vecLayers.length) {
    layersList.innerHTML = '<em style="color:var(--text3);">Load vector layers first</em>';
    return;
  }
  layersList.innerHTML = vecLayers.map(l => {
    const idx = state.layers.indexOf(l);
    return `<label style="display:flex;align-items:center;gap:5px;padding:2px 0;cursor:pointer;">
      <input type="checkbox" class="dqa-layer-cb" value="${idx}" style="margin:0;"/>
      <span style="font-size:10px;color:var(--text2);">${l.name}</span>
    </label>`;
  }).join('');
}


// Get outer rings as flat [lng,lat] arrays from any polygon/multipolygon feature
function _outerRings(feat) {
  if (!feat || !feat.geometry) return [];
  const t = feat.geometry.type, c = feat.geometry.coordinates;
  if (t === 'Polygon') return [c[0]];
  if (t === 'MultiPolygon') return c.map(p => p[0]);
  return [];
}

// Test whether a [lng, lat] point is inside a ring (array of [lng,lat])
function _ptInRing(lng, lat, ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Centroid of a ring ([lng,lat] array) — simple average of vertices
function _ringCentroid(ring) {
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return [cx, cy];
}

// Area of a flat ring in sq metres using shoelace + midlat scaling
function _ringAreaSqm(ring) {
  if (!ring || ring.length < 3) return 0;
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const midLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const mPerDegLat = R * Math.PI / 180;
  const mPerDegLng = mPerDegLat * Math.cos(toRad(midLat));
  let area = 0;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const x1 = ring[i][0] * mPerDegLng, y1 = ring[i][1] * mPerDegLat;
    const x2 = ring[j][0] * mPerDegLng, y2 = ring[j][1] * mPerDegLat;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

// Is ANY representative point of a feature inside ANY boundary ring?
function _featInsideBoundary(feat, boundaryRings) {
  if (!feat || !feat.geometry) return false;
  const t = feat.geometry.type, c = feat.geometry.coordinates;
  let testPts = [];
  if (t === 'Point') testPts = [c];
  else if (t === 'MultiPoint') testPts = c;
  else if (t === 'LineString') testPts = c;
  else if (t === 'MultiLineString') testPts = c.reduce((a, l) => a.concat(l), []);
  else if (t === 'Polygon') testPts = [_ringCentroid(c[0])];
  else if (t === 'MultiPolygon') testPts = c.map(poly => _ringCentroid(poly[0]));
  return testPts.some(p => boundaryRings.some(br => _ptInRing(p[0], p[1], br)));
}

function runDesignQA() {
  const boundaryIdx = parseInt(document.getElementById('dqa-boundary-select').value);
  if (isNaN(boundaryIdx) || !state.layers[boundaryIdx]) {
    toast('Select a Project Boundary layer first', 'error'); return;
  }
  const checkedBoxes = [...document.querySelectorAll('.dqa-layer-cb:checked')];
  if (!checkedBoxes.length) {
    toast('Select at least one Design Layer to analyse', 'error'); return;
  }

  const boundaryLayer = state.layers[boundaryIdx];
  const boundaryRings = [];
  for (const feat of (boundaryLayer.geojson.features || [])) {
    _outerRings(feat).forEach(r => boundaryRings.push(r));
  }
  if (!boundaryRings.length) {
    toast('Boundary layer has no polygon geometry', 'error'); return;
  }

  const rows = [];

  checkedBoxes.forEach(cb => {
    const layerIdx = parseInt(cb.value);
    const layer = state.layers[layerIdx];
    if (!layer || layer.isTile) return;

    const features = (layer.geojson.features || []).filter(f => f && f.geometry);
    if (!features.length) return;

    const geomTypes = new Set(features.map(f => f.geometry.type));
    const hasPolygons = [...geomTypes].some(t => t.includes('Polygon'));

    let totalArea = 0, insideArea = 0, outsideArea = 0;
    let totalCount = 0, insideCount = 0, outsideCount = 0;

    features.forEach(feat => {
      totalCount++;
      const inside = _featInsideBoundary(feat, boundaryRings);

      if (hasPolygons) {
        // Sum area per outer ring, attributed by centroid test
        _outerRings(feat).forEach(ring => {
          const a = _ringAreaSqm(ring);
          totalArea += a;
          if (inside) insideArea += a; else outsideArea += a;
        });
      }

      if (inside) insideCount++; else outsideCount++;
    });

    const pctOutside = totalCount > 0
      ? (hasPolygons && totalArea > 0 ? (outsideArea / totalArea * 100) : (outsideCount / totalCount * 100))
      : 0;
    const pctInside = 100 - pctOutside;

    rows.push({ name: layer.name, hasPolygons, totalArea, insideArea, outsideArea, pctInside, pctOutside, totalCount, insideCount, outsideCount });
  });

  if (!rows.length) { toast('No features found in selected layers', 'info'); return; }

  const resultEl = document.getElementById('dqa-result');
  resultEl.style.display = 'block';

  const tblStyle = 'width:100%;border-collapse:collapse;font-family:var(--mono);font-size:9px;';
  const thStyle = 'padding:3px 5px;background:var(--bg3);border:1px solid var(--border);color:var(--text3);text-align:left;white-space:nowrap;';
  const tdStyle = 'padding:3px 5px;border:1px solid var(--border);color:var(--text2);white-space:nowrap;';
  const tdWarnStyle = tdStyle + 'color:var(--orange);font-weight:600;';
  const tdOkStyle = tdStyle + 'color:var(--accent);';

  let html = `<div style="font-size:9px;font-family:var(--mono);color:var(--text3);margin-bottom:4px;letter-spacing:0.5px;text-transform:uppercase;">
    Boundary: <span style="color:var(--accent);">${boundaryLayer.name}</span>
  </div>
  <div style="overflow-x:auto;">
  <table style="${tblStyle}">
    <thead>
      <tr>
        <th style="${thStyle}">Layer</th>
        <th style="${thStyle}">Total</th>
        <th style="${thStyle}">Inside</th>
        <th style="${thStyle}">Outside</th>
        <th style="${thStyle}">Area Inside</th>
        <th style="${thStyle}">Area Outside</th>
        <th style="${thStyle}">% Outside</th>
      </tr>
    </thead>
    <tbody>`;

  rows.forEach(r => {
    const hasOut = r.outsideCount > 0;
    const cntTd = hasOut ? tdWarnStyle : tdOkStyle;
    const areaTd = r.outsideArea > 0 ? tdWarnStyle : tdOkStyle;
    const pctTd = r.pctOutside > 0.05 ? tdWarnStyle : tdOkStyle;
    html += `<tr>
      <td style="${tdStyle}">${r.name}</td>
      <td style="${tdStyle}">${r.totalCount}</td>
      <td style="${tdStyle}">${r.insideCount}</td>
      <td style="${cntTd}">${r.outsideCount}</td>
      <td style="${tdStyle}">${r.hasPolygons ? fmtArea(r.insideArea) : '—'}</td>
      <td style="${r.hasPolygons ? areaTd : tdStyle}">${r.hasPolygons ? fmtArea(r.outsideArea) : '—'}</td>
      <td style="${pctTd}">${r.pctOutside.toFixed(1)}%</td>
    </tr>`;
  });

  html += `</tbody></table></div>`;

  const anyOutside = rows.some(r => r.outsideCount > 0);
  if (anyOutside) {
    html += `<div style="margin-top:6px;padding:4px 7px;background:rgba(215,125,42,0.1);border:1px solid var(--orange);border-radius:4px;font-size:9px;color:var(--orange);">
      ⚠ Some design elements fall outside the project boundary.
    </div>`;
  } else {
    html += `<div style="margin-top:6px;padding:4px 7px;background:rgba(0,116,168,0.08);border:1px solid var(--accent);border-radius:4px;font-size:9px;color:var(--accent);">
      ✓ All design elements are within the project boundary.
    </div>`;
  }

  resultEl.innerHTML = html;
  toast('Design QA complete — ' + rows.length + ' layer(s) analysed', 'success');
}

