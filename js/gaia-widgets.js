// gaia-widgets.js — Widgets: measure, select-by-location, viewshed, elevation profile
// ══════════════════════════════════════════════════════
//  WIDGETS — MEASURE + SELECT BY LOCATION
// ══════════════════════════════════════════════════════

// ── Shared drawing state ──
const widgetState = {
  mode: null,          // 'measure-distance' | 'measure-area' | 'sbl'
  points: [],
  drawLayer: null,
  previewLayer: null,
};

// Haversine distance (metres) between two L.LatLng points
function haversine(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*
            Math.sin(dLon/2)*Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}

function fmtDistance(m) {
  if (m >= 1000) return (m/1000).toFixed(3) + ' km';
  return m.toFixed(1) + ' m';
}

function fmtArea(sqm) {
  if (sqm >= 1e6) return (sqm/1e6).toFixed(4) + ' km²';
  if (sqm >= 10000) return (sqm/10000).toFixed(2) + ' ha';
  return sqm.toFixed(1) + ' m²';
}

// Shoelace area in square metres using Haversine-corrected approach
function polygonArea(pts) {
  if (pts.length < 3) return 0;
  // Convert to approx cartesian using first point as origin
  const origin = pts[0];
  const R = 6371000;
  const toXY = (p) => ({
    x: (p.lng - origin.lng) * Math.PI/180 * R * Math.cos(origin.lat*Math.PI/180),
    y: (p.lat - origin.lat) * Math.PI/180 * R
  });
  const xy = pts.map(toXY);
  let area = 0;
  for (let i = 0; i < xy.length; i++) {
    const j = (i+1) % xy.length;
    area += xy[i].x * xy[j].y;
    area -= xy[j].x * xy[i].y;
  }
  return Math.abs(area/2);
}

function clearWidgetDraw() {
  _clearDraw();
  widgetState.points = [];
  widgetState.mode = null;
  if (state.map) state.map.getCanvas().style.cursor = '';
}

function handleWidgetClick(e) {
  if (!widgetState.mode) return;
  const ll = _evtLatLng(e);
  const sblGeomType = widgetState.mode === 'sbl' ? document.getElementById('sbl-geom-type').value : null;
  if (widgetState.mode === 'sbl' && sblGeomType === 'point') {
    runPointSelect(ll); clearWidgetDraw(); return;
  }
  widgetState.points.push(ll);
  redrawSBLOrMeasure();
  if (widgetState.mode === 'measure-distance' && widgetState.points.length >= 2) updateMeasureResult();
  if (widgetState.mode === 'sbl') {
    const minPts = sblGeomType === 'line' ? 2 : 3;
    if (widgetState.points.length >= minPts) {
      document.getElementById('sbl-result').style.display = 'block';
      document.getElementById('sbl-result').textContent =
        (sblGeomType === 'line' ? 'Line' : 'Polygon') + ': ' + widgetState.points.length + ' pts — double-click or ⏹ to finish';
    }
  }
}

function handleWidgetMouseMove(e) {
  if (!widgetState.mode || widgetState.points.length === 0) return;
  const ll = _evtLatLng(e);
  const pts = [...widgetState.points, ll];
  const sblGeomPrev = widgetState.mode === 'sbl' ? document.getElementById('sbl-geom-type').value : null;
  const previewLine = widgetState.mode === 'measure-distance' || sblGeomPrev === 'line' || pts.length < 3;
  if (previewLine) {
    const f = _drawLineFeature(pts, '#39d353');
    _setDrawPreview(f ? [f] : []);
  } else {
    const f = _drawPolygonFeature(pts, '#39d353');
    _setDrawPreview(f ? [f] : []);
  }
}

function handleWidgetDblClick(e) {
  if (!widgetState.mode) return;
  // Remove the ghost point added by the triggering single-click before dblclick fired
  if (widgetState.points.length > 0) widgetState.points.pop();
  if (widgetState.mode === 'measure-area' || widgetState.mode === 'measure-distance') {
    updateMeasureResult();
    finishMeasure();
  } else if (widgetState.mode === 'sbl') {
    endSBLDraw();
  }
}

function redrawSBLOrMeasure() {
  const pts = widgetState.points;
  if (pts.length === 0) { _clearDraw(); return; }
  const sblGeom = widgetState.mode === 'sbl' ? document.getElementById('sbl-geom-type').value : null;
  const usePolyline = widgetState.mode === 'measure-distance' || sblGeom === 'line' || pts.length < 3;
  // Draw vertices as points + line/polygon
  const vertexFeats = pts.map(p => _drawPointFeature(p, '#39d353')).filter(Boolean);
  const shapeFeature = usePolyline ? _drawLineFeature(pts, '#39d353') : _drawPolygonFeature(pts, '#39d353');
  _setDrawFeatures([...(shapeFeature ? [shapeFeature] : []), ...vertexFeats]);
}
function redrawMeasure() { redrawSBLOrMeasure(); }

function updateMeasureResult() {
  const el = document.getElementById('measure-result');
  el.style.display = 'block';
  if (widgetState.mode === 'measure-distance') {
    let total = 0;
    for (let i = 1; i < widgetState.points.length; i++) {
      total += haversine(widgetState.points[i-1], widgetState.points[i]);
    }
    el.textContent = '↔ ' + fmtDistance(total);
  } else {
    const area = polygonArea(widgetState.points);
    el.textContent = '⬡ ' + fmtArea(area);
  }
}

function finishMeasure() {
  _setDrawPreview([]);
  widgetState.mode = null;
  state.map.getCanvas().style.cursor = '';
  document.getElementById('measure-hint').style.display = 'none';
  document.getElementById('measure-hint').textContent = '';
  const endBtn2 = document.getElementById('measure-end-btn'); if (endBtn2) endBtn2.style.display = 'none';
  resetMeasureButtons();
}

function resetMeasureButtons() {
  ['measure-distance-btn','measure-area-btn'].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.style.borderColor=''; b.style.color=''; b.style.background=''; }
  });
}

function activateMeasure(type) {
  clearWidgetDraw();
  clearSBL();
  widgetState.mode = 'measure-' + type;
  state.map.getCanvas().style.cursor = 'crosshair';
   // prevent map zoom stealing our dblclick
  const hint = type === 'area'
    ? 'Click to add vertices, double-click to close and calculate area'
    : 'Click to add waypoints, double-click to finish and show total distance';
  document.getElementById('measure-hint').style.display = 'block';
  document.getElementById('measure-hint').textContent = hint;
  document.getElementById('measure-result').style.display = 'none';
  const endBtn = document.getElementById('measure-end-btn');
  if (endBtn) endBtn.style.display = 'block';
  const btn = document.getElementById('measure-' + type + '-btn');
  btn.style.borderColor = 'var(--accent)';
  btn.style.color = 'var(--accent)';
  btn.style.background = 'rgba(57,211,83,0.1)';
}

function clearMeasure() {
  clearWidgetDraw();
  document.getElementById('measure-result').style.display = 'none';
  document.getElementById('measure-hint').style.display = 'none';
  resetMeasureButtons();
}

// ── SELECT BY LOCATION ──────────────────────────────

function updateSBLLayerList() {
  const vecLayers = state.layers.filter(l => !l.isTile);
  const opts = vecLayers.length
    ? vecLayers.map(l => '<option value="' + state.layers.indexOf(l) + '">' + l.name + '</option>').join('')
    : '<option value="">— no vector layers —</option>';
  const sel = document.getElementById('sbl-layer-select');
  if (sel) sel.innerHTML = opts;
  const src = document.getElementById('sbl-source-layer-select');
  if (src) src.innerHTML = vecLayers.length ? opts : '<option value="">— no vector layers —</option>';
}

document.addEventListener('DOMContentLoaded', function() {
  // Hook into updateExportLayerList to also refresh SBL list
  const origUpdate = window.updateExportLayerList;
  window.updateExportLayerList = function() {
    if (origUpdate) origUpdate();
    updateSBLLayerList(); updateDQALayerList();
  };
  // SBL method toggle for radius row
  const sblMethod = document.getElementById('sbl-method');
  if (sblMethod) {
    sblMethod.addEventListener('change', function() {
      const row = document.getElementById('sbl-radius-row');
      if (row) row.style.display = this.value === 'radius' ? 'block' : 'none';
      const btn = document.getElementById('sbl-draw-btn');
      if (btn) btn.textContent = this.value === 'radius' ? '◎ Click on Map' : '✎ Draw Shape';
    });
  }
});

function onSBLGeomTypeChange() {
  const geomType = document.getElementById('sbl-geom-type').value;
  const radiusRow = document.getElementById('sbl-radius-row');
  const selectedRow = document.getElementById('sbl-selected-source-row');
  const spatialRow = document.getElementById('sbl-spatial-rel-row');
  const drawBtn = document.getElementById('sbl-draw-btn');
  radiusRow.style.display = geomType === 'point' ? 'block' : 'none';
  selectedRow.style.display = geomType === 'selected' ? 'block' : 'none';
  spatialRow.style.display = geomType === 'selected' ? 'none' : 'block';
  const labels = { polygon:'✎ Draw Polygon', line:'✎ Draw Line', point:'◎ Click on Map', selected:'⚡ Run Selection' };
  if (drawBtn) drawBtn.textContent = labels[geomType] || '✎ Draw';
}

function activateSBL() {
  const geomType = document.getElementById('sbl-geom-type').value;
  const layerIdx = parseInt(document.getElementById('sbl-layer-select').value);
  if (isNaN(layerIdx) || !state.layers[layerIdx]) { toast('Select a target layer first', 'error'); return; }
  if (geomType === 'selected') { runSelectedFeatureSelect(); return; }
  clearWidgetDraw(); clearMeasure();
  widgetState.mode = 'sbl';
  state.map.getCanvas().style.cursor = 'crosshair';
  const btn = document.getElementById('sbl-draw-btn');
  btn.style.borderColor = 'var(--accent)'; btn.style.color = 'var(--accent)'; btn.style.background = 'rgba(57,211,83,0.1)';
  document.getElementById('sbl-result').style.display = 'none';
  const endBtn = document.getElementById('sbl-end-btn');
  if (endBtn) endBtn.style.display = (geomType !== 'point') ? 'block' : 'none';
}

function endSBLDraw() {
  const geomType = document.getElementById('sbl-geom-type').value;
  if (geomType === 'line') {
    if (widgetState.points.length < 2) { toast('Draw at least 2 points for a line', 'error'); return; }
    runLineSelect();
  } else {
    if (widgetState.points.length < 3) { toast('Draw at least 3 points for a polygon', 'error'); return; }
    runPolygonSelect();
  }
  clearWidgetDraw();
  resetSBLButton();
  
}

function resetSBLButton() {
  const geomType = document.getElementById('sbl-geom-type')?.value || 'polygon';
  const labels = { polygon:'✎ Draw Polygon', line:'✎ Draw Line', point:'◎ Click on Map', selected:'⚡ Run Selection' };
  const btn = document.getElementById('sbl-draw-btn');
  if (btn) { btn.style.borderColor=''; btn.style.color=''; btn.style.background=''; btn.textContent = labels[geomType] || '✎ Draw'; }
  const endBtn = document.getElementById('sbl-end-btn');
  if (endBtn) endBtn.style.display = 'none';
}

function clearSBL() {
  clearWidgetDraw();
  document.getElementById('sbl-result').style.display = 'none';
  resetSBLButton();
}

// Point-in-polygon test (ray casting)
function pointInPolygon(point, polygonLatLngs) {
  const x = point.lng, y = point.lat;
  let inside = false;
  const n = polygonLatLngs.length;
  for (let i = 0, j = n-1; i < n; j = i++) {
    const xi = polygonLatLngs[i].lng, yi = polygonLatLngs[i].lat;
    const xj = polygonLatLngs[j].lng, yj = polygonLatLngs[j].lat;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Segment-polygon intersection test (simplified)
function featureIntersectsPolygon(feat, polyPts) {
  if (!feat.geometry) return false;
  const type = feat.geometry.type;
  const coords = feat.geometry.coordinates;
  
  function ptLL(c) { return {lat:c[1], lng:c[0]}; }
  function anyPointIn(pts) { return pts.some(p => pointInPolygon(p, polyPts)); }
  function polyContainsAny(pts) { return pts.some(p => pointInPolygon(ptLL(p), polyPts)); }
  
  if (type === 'Point') return pointInPolygon(ptLL(coords), polyPts);
  if (type === 'MultiPoint') return coords.some(c => pointInPolygon(ptLL(c), polyPts));
  if (type.includes('LineString')) {
    const lines = type === 'LineString' ? [coords] : coords;
    return lines.some(l => polyContainsAny(l));
  }
  if (type.includes('Polygon')) {
    const rings = type === 'Polygon' ? [coords[0]] : coords.map(p => p[0]);
    return rings.some(r => polyContainsAny(r));
  }
  return false;
}

function applySBLSelection(layerIdx, newSelection, desc) {
  state.activeLayerIndex = layerIdx;
  state.selectedFeatureIndices = newSelection;
  state.selectedFeatureIndex = newSelection.size > 0 ? [...newSelection][0] : -1;
  updateLayerList(); updateSelectionCount(); refreshMapSelection(layerIdx); renderTable();
  const el = document.getElementById('sbl-result');
  el.style.display = 'block';
  el.textContent = newSelection.size + ' feature' + (newSelection.size !== 1 ? 's' : '') + ' selected' + (desc ? ' · ' + desc : '');
  toast('Select by Location: ' + newSelection.size + ' features selected', newSelection.size > 0 ? 'success' : 'info');
}

function runPolygonSelect() {
  const layerIdx = parseInt(document.getElementById('sbl-layer-select').value);
  const layer = state.layers[layerIdx]; if (!layer) return;
  const relation = document.getElementById('sbl-relation').value;
  const polyPts = widgetState.points;
  const newSelection = new Set();
  (layer.geojson.features||[]).forEach((feat, i) => {
    if (!feat.geometry) return;
    if (relation === 'within') {
      if (pointInPolygon(getFeatureCentroid(feat), polyPts)) newSelection.add(i);
    } else {
      if (featureIntersectsPolygon(feat, polyPts)) newSelection.add(i);
    }
  });
  applySBLSelection(layerIdx, newSelection, 'polygon');
}

function runLineSelect() {
  const layerIdx = parseInt(document.getElementById('sbl-layer-select').value);
  const layer = state.layers[layerIdx]; if (!layer) return;
  const linePts = widgetState.points;
  if (linePts.length < 2) return;
  const f = _drawLineFeature(linePts, '#39d353');
  if (f) _setDrawFeatures([f]);
  const newSelection = new Set();
  (layer.geojson.features||[]).forEach((feat, i) => {
    if (!feat.geometry) return;
    if (featureIntersectsLine(feat, linePts)) newSelection.add(i);
  });
  applySBLSelection(layerIdx, newSelection, 'line');
}

function runPointSelect(clickLatLng) {
  const layerIdx = parseInt(document.getElementById('sbl-layer-select').value);
  const layer = state.layers[layerIdx]; if (!layer) return;
  const radiusM = parseFloat(document.getElementById('sbl-radius').value) || 0;
  _setDrawFeatures([_drawPointFeature(clickLatLng, '#39d353')].filter(Boolean));
  const newSelection = new Set();
  (layer.geojson.features||[]).forEach((feat, i) => {
    if (!feat.geometry) return;
    if (radiusM > 0) {
      if (haversine(clickLatLng, getFeatureCentroid(feat)) <= radiusM) newSelection.add(i);
    } else {
      if (featureContainsPoint(feat, clickLatLng)) newSelection.add(i);
    }
  });
  applySBLSelection(layerIdx, newSelection, radiusM > 0 ? 'within ' + fmtDistance(radiusM) : 'at point');
}

function runSelectedFeatureSelect() {
  const targetLayerIdx = parseInt(document.getElementById('sbl-layer-select').value);
  const targetLayer = state.layers[targetLayerIdx]; if (!targetLayer) { toast('Select a target layer', 'error'); return; }
  const sourceLayerIdx = parseInt(document.getElementById('sbl-source-layer-select').value);
  const sourceLayer = state.layers[sourceLayerIdx];
  if (!sourceLayer || state.selectedFeatureIndices.size === 0) { toast('Select features on the source layer first', 'error'); return; }
  const sourceFeatGeoms = [...state.selectedFeatureIndices].map(i => sourceLayer.geojson.features[i]).filter(f => f && f.geometry);
  if (!sourceFeatGeoms.length) { toast('No selected features with geometry', 'error'); return; }
  const newSelection = new Set();
  (targetLayer.geojson.features||[]).forEach((feat, i) => {
    if (!feat.geometry) return;
    for (const src of sourceFeatGeoms) { if (featuresIntersect(feat, src)) { newSelection.add(i); break; } }
  });
  applySBLSelection(targetLayerIdx, newSelection, 'from selection');
}

function featureIntersectsLine(feat, linePts) {
  if (!feat.geometry) return false;
  function ptLL(c) { return {lat:c[1], lng:c[0]}; }
  const allCoords = flattenCoords(feat.geometry.coordinates);
  return allCoords.some(c => {
    const pt = ptLL(c);
    return linePts.some((a, i) => {
      if (i === 0) return false;
      return haversine(pt, closestPointOnSegment(pt, linePts[i-1], linePts[i])) < 50;
    });
  }) || linePts.some((lp, i) => {
    if (i === 0) return false;
    return featureContainsPoint(feat, lp) || featureContainsPoint(feat, linePts[i-1]);
  });
}

function closestPointOnSegment(p, a, b) {
  const dx = b.lng-a.lng, dy = b.lat-a.lat;
  if (dx===0 && dy===0) return a;
  const t = Math.max(0, Math.min(1, ((p.lng-a.lng)*dx + (p.lat-a.lat)*dy) / (dx*dx+dy*dy)));
  return {lat:a.lat+t*dy, lng:a.lng+t*dx};
}

function featureContainsPoint(feat, pt) {
  if (!feat.geometry) return false;
  const type = feat.geometry.type;
  function ptLL(c) { return {lat:c[1], lng:c[0]}; }
  if (type==='Point') return haversine(pt, ptLL(feat.geometry.coordinates)) < 20;
  if (type==='MultiPoint') return feat.geometry.coordinates.some(c => haversine(pt, ptLL(c)) < 20);
  if (type==='LineString') return feat.geometry.coordinates.some((c,i,arr) => i && haversine(pt, closestPointOnSegment(pt, ptLL(arr[i-1]), ptLL(c))) < 20);
  if (type==='Polygon') return pointInPolygon(pt, feat.geometry.coordinates[0].map(c => ptLL(c)));
  if (type==='MultiPolygon') return feat.geometry.coordinates.some(poly => pointInPolygon(pt, poly[0].map(c => ptLL(c))));
  return false;
}

function featuresIntersect(featA, featB) {
  if (!featA.geometry || !featB.geometry) return false;
  function ptLL(c) { return {lat:c[1], lng:c[0]}; }
  const ptsA = flattenCoords(featA.geometry.coordinates).map(c => ptLL(c));
  const ptsB = flattenCoords(featB.geometry.coordinates).map(c => ptLL(c));
  const minLat=pts=>Math.min(...pts.map(p=>p.lat)), maxLat=pts=>Math.max(...pts.map(p=>p.lat));
  const minLng=pts=>Math.min(...pts.map(p=>p.lng)), maxLng=pts=>Math.max(...pts.map(p=>p.lng));
  if (maxLat(ptsA)<minLat(ptsB)||minLat(ptsA)>maxLat(ptsB)||maxLng(ptsA)<minLng(ptsB)||minLng(ptsA)>maxLng(ptsB)) return false;
  return ptsB.some(p => featureContainsPoint(featA, p)) || ptsA.some(p => featureContainsPoint(featB, p));
}

// flattenCoords defined above

function getFeatureCentroid(feat) {
  if (!feat.geometry) return {lat:0, lng:0};
  const type = feat.geometry.type;
  const coords = feat.geometry.coordinates;
  function avgCoords(pts) {
    const sum = pts.reduce((a,c) => [a[0]+c[0], a[1]+c[1]], [0,0]);
    return {lat:sum[1]/pts.length, lng:sum[0]/pts.length};
  }
  if (type === 'Point') return {lat:coords[1], lng:coords[0]};
  if (type === 'MultiPoint') return avgCoords(coords);
  if (type === 'LineString') return avgCoords(coords);
  if (type === 'MultiLineString') return avgCoords(coords.flat());
  if (type === 'Polygon') return avgCoords(coords[0]);
  if (type === 'MultiPolygon') return avgCoords(coords.flat(2));
  return {lat:0, lng:0};
}

// ── FLOATING WIDGET PANEL ────────────────────
function openWidgetPanel() {
  const panel = document.getElementById('widget-float');
  panel.classList.add('visible');
  // Position near the button if not already dragged
  if (!panel.dataset.dragged) {
    const btn = document.getElementById('widgets-open-btn');
    if (btn) {
      const r = btn.getBoundingClientRect();
      const panelW = 310;
      panel.style.left = Math.max(8, r.left - panelW - 12) + 'px';
      panel.style.top = Math.max(8, r.top - 20) + 'px';
    } else {
      panel.style.left = Math.max(8, window.innerWidth - 330) + 'px'; panel.style.top = '100px';
    }
  }
  const ob = document.getElementById('widgets-open-btn');
  if (ob) { ob.style.borderColor='var(--sky)'; ob.style.color='var(--sky)'; ob.style.background='rgba(20,177,231,0.1)'; }
  makePanelDraggable(panel, document.getElementById('widget-float-header'));
}

function endMeasureClick() {
  // Finish with current points (no pop — user explicitly ended)
  if (widgetState.mode === 'measure-distance' || widgetState.mode === 'measure-area') {
    if (widgetState.points.length >= 2) updateMeasureResult();
    finishMeasure();
  }
}

function closeWidgetPanel() {
  document.getElementById('widget-float').classList.remove('visible');
  clearMeasure();
  clearSBL();
  const ob = document.getElementById('widgets-open-btn');
  if (ob) { ob.style.borderColor=''; ob.style.color=''; ob.style.background=''; }
}

function toggleWidgetPanel() {
  const panel = document.getElementById('widget-float');
  if (panel.classList.contains('visible')) closeWidgetPanel();
  else openWidgetPanel();
}

// ── LEGEND MAP BUTTON ──
function toggleMapLegend() {
  const panel = document.getElementById('legend-float');
  const btn   = document.getElementById('legend-map-btn');
  if (!panel || !btn) return;
  const isOpen = panel.classList.toggle('open');
  btn.classList.toggle('active', isOpen);
  if (isOpen) updateLegend();
}

// ── GEOPROCESS HOVER TOOLTIPS ──
function _initGpTooltips() {
  const tip = document.getElementById('gp-tooltip');
  if (!tip) return;
  document.querySelectorAll('[data-gp-tip]').forEach(el => {
    el.addEventListener('mouseenter', e => {
      tip.textContent = el.getAttribute('data-gp-tip');
      tip.classList.add('visible');
      _positionGpTip(e);
    });
    el.addEventListener('mousemove', _positionGpTip);
    el.addEventListener('mouseleave', () => tip.classList.remove('visible'));
  });
}
function _positionGpTip(e) {
  const tip = document.getElementById('gp-tooltip');
  if (!tip) return;
  const x = e.clientX + 16, y = e.clientY + 16;
  const tw = 240, th = 80;
  tip.style.left = (x + tw > window.innerWidth  ? e.clientX - tw - 8 : x) + 'px';
  tip.style.top  = (y + th > window.innerHeight ? e.clientY - th - 8 : y) + 'px';
}
document.addEventListener('DOMContentLoaded', () => setTimeout(_initGpTooltips, 800));


// ═══════════════════════════════════════════════════════════════════════════
// ── VIEWSHED ANALYSIS ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
let _vsObserverMarker  = null;
let _vsObserverLatLng  = null;
let _vsOverlayLayers   = [];
let _vsClickHandler    = null;

function startViewshed() {
  // Clear previous
  clearViewshed();
  const statusEl = document.getElementById('vs-status');
  const runBtn   = document.getElementById('vs-run-btn');
  statusEl.style.display = 'block';
  statusEl.textContent   = '📍 Click on the map to place the observer point…';

  // Add one-time click handler — viewshed uses its own dedicated click handler
  _vsClickHandler = function(e) {
    const ll = _evtLatLng(e);
    _vsObserverLatLng = ll;
    state.map.off('click', _vsClickHandler);
    _vsClickHandler = null;

    // Show observer point on draw source
    _vsObserverMarker = true; // flag so clearViewshed knows it's set
    _setDrawFeatures([_drawPointFeature(ll, '#14b1e7')]);

    statusEl.textContent = `✔ Observer set at (${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}). Click "Run Viewshed Analysis" to compute.`;
    if (runBtn) runBtn.style.display = 'block';
  };
  state.map.on('click', _vsClickHandler);
}

async function runViewshed() {
  if (!_vsObserverLatLng) return;
  const statusEl  = document.getElementById('vs-status');
  const obsHeight = parseFloat(document.getElementById('vs-observer-height').value) || 1.8;
  const radius    = parseFloat(document.getElementById('vs-radius').value) || 2000;
  const resMetres = parseFloat(document.getElementById('vs-resolution').value) || 100;

  statusEl.style.display = 'block';
  statusEl.textContent   = '⌛ Fetching elevation data… (this may take a moment)';

  const oLat = _vsObserverLatLng.lat;
  const oLng = _vsObserverLatLng.lng;

  // Degree extents for the radius
  const latDeg  = radius / 111320;
  const lngDeg  = radius / (111320 * Math.cos(oLat * Math.PI / 180));
  const stepLat = resMetres / 111320;
  const stepLng = resMetres / (111320 * Math.cos(oLat * Math.PI / 180));

  // Build grid
  const points = [];
  for (let dlat = -latDeg; dlat <= latDeg; dlat += stepLat) {
    for (let dlng = -lngDeg; dlng <= lngDeg; dlng += stepLng) {
      const d = Math.sqrt((dlat / latDeg) ** 2 + (dlng / lngDeg) ** 2);
      if (d <= 1.0) points.push({ lat: oLat + dlat, lng: oLng + dlng });
    }
  }
  points.unshift({ lat: oLat, lng: oLng }); // observer is index 0

  // Fetch elevations in batches
  const BATCH = 100;
  let elevations = [];
  try {
    for (let i = 0; i < points.length; i += BATCH) {
      const batch = points.slice(i, i + BATCH);
      const resp  = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ locations: batch.map(p => ({ latitude: p.lat, longitude: p.lng })) }),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      elevations = elevations.concat(data.results.map(r => r.elevation));
      statusEl.textContent = `⌛ Fetched ${Math.min(i + BATCH, points.length)} / ${points.length} elevations…`;
    }
  } catch (err) {
    statusEl.textContent = `⚠ Elevation API error: ${err.message}. Using flat-terrain approximation.`;
    elevations = points.map(() => 0);
  }

  const obsElev = elevations[0] + obsHeight;

  // LOS calculation
  const LOS_SAMPLES = 8;
  const visResults = [];
  for (let i = 1; i < points.length; i++) {
    const p   = points[i];
    const elT = elevations[i];
    const dT  = Math.sqrt((p.lat - oLat) ** 2 + (p.lng - oLng) ** 2);
    if (dT === 0) { visResults.push(true); continue; }

    let visible = true;
    for (let s = 1; s < LOS_SAMPLES; s++) {
      const frac = s / LOS_SAMPLES;
      const iLat = oLat + (p.lat - oLat) * frac;
      const iLng = oLng + (p.lng - oLng) * frac;
      const iD   = Math.sqrt((iLat - oLat) ** 2 + (iLng - oLng) ** 2);

      // Nearest sample elevation at this intermediate point
      let nearElev = 0, nearDist = Infinity;
      for (let j = 1; j < points.length; j++) {
        const dd = Math.sqrt((points[j].lat - iLat) ** 2 + (points[j].lng - iLng) ** 2);
        if (dd < nearDist) { nearDist = dd; nearElev = elevations[j]; }
      }
      const losElev = obsElev + ((elT - obsElev) / dT) * iD;
      if (nearElev > losElev) { visible = false; break; }
    }
    visResults.push(visible);
  }

  // Clear draw source overlays from previous run
  _clearDraw();
  _vsOverlayLayers = [];

  // ── Build GeoJSON features: one rectangle per grid cell ────────────────
  const halfLat = stepLat / 2;
  const halfLng = stepLng / 2;

  const visFeatures  = [];
  const hidFeatures  = [];

  for (let i = 0; i < visResults.length; i++) {
    const p    = points[i + 1]; // +1: skip observer at index 0
    const minLat = p.lat - halfLat, maxLat = p.lat + halfLat;
    const minLng = p.lng - halfLng, maxLng = p.lng + halfLng;
    // GeoJSON polygon ring (closed)
    const ring = [
      [minLng, minLat], [maxLng, minLat],
      [maxLng, maxLat], [minLng, maxLat],
      [minLng, minLat],
    ];
    const feat = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { visible: visResults[i] } };
    if (visResults[i]) visFeatures.push(feat); else hidFeatures.push(feat);
  }

  // ── Add visible-area layer ──────────────────────────────────────────────
  if (visFeatures.length) {
    const visGJ = { type: 'FeatureCollection', features: visFeatures };
    addLayer(visGJ, 'Viewshed – Visible', 'EPSG:4326', 'Viewshed');
    // Style the new layer: green fill
    const vi = state.layers.length - 1;
    state.layers[vi].color        = '#00c864';
    state.layers[vi].fillColor    = '#00c864';
    state.layers[vi].outlineColor = '#00c864';
    state.layers[vi].layerOpacity = 0.55;
    _applySymbologyToLeaflet(state.layers[vi]);
  }

  // ── Add hidden-area layer ───────────────────────────────────────────────
  if (hidFeatures.length) {
    const hidGJ = { type: 'FeatureCollection', features: hidFeatures };
    addLayer(hidGJ, 'Viewshed – Hidden', 'EPSG:4326', 'Viewshed');
    const hi = state.layers.length - 1;
    state.layers[hi].color        = '#ff3c3c';
    state.layers[hi].fillColor    = '#ff3c3c';
    state.layers[hi].outlineColor = '#ff3c3c';
    state.layers[hi].layerOpacity = 0.45;
    _applySymbologyToLeaflet(state.layers[hi]);
  }

  // Refresh layer panel
  updateLayerList();
  updateExportLayerList();
  updateSBLLayerList();
  updateDQALayerList();

  const visCount   = visResults.filter(v => v).length;
  const visiblePct = ((visCount / visResults.length) * 100).toFixed(1);
  statusEl.textContent = `✔ Done. ${visiblePct}% visible (${visCount}/${visResults.length} cells). Layers added to panel.`;
}

function clearViewshed() {
  if (_vsClickHandler) { state.map.off('click', _vsClickHandler); _vsClickHandler = null; }
  _vsObserverMarker = null;
  _vsObserverLatLng = null;
  _vsOverlayLayers = []; // layers are now GeoJSON layers in panel; just clear the reference
  _clearDraw();
  const statusEl = document.getElementById('vs-status');
  const runBtn   = document.getElementById('vs-run-btn');
  if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
  if (runBtn) runBtn.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════════════
// ── ELEVATION PROFILE ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
let _epDrawing      = false;
let _epLine         = null;      // Leaflet polyline being drawn
let _epPoints       = [];        // LatLng array
let _epTempMarkers  = [];
let _epClickHandler = null;
let _epDblHandler   = null;
let _epResultLine   = null;      // Final rendered polyline

function startElevationProfile() {
  clearElevationProfile();
  _epDrawing = true;
  _epPoints  = [];

  const statusEl = document.getElementById('ep-status');
  const drawBtn  = document.getElementById('ep-draw-btn');
  const endBtn   = document.getElementById('ep-end-btn');
  statusEl.style.display  = 'block';
  statusEl.textContent    = '✎ Click to add vertices. Double-click to finish the line.';
  drawBtn.style.display   = 'none';
  endBtn.style.display    = 'block';

  state.map.getCanvas().style.cursor = 'crosshair';

  _epClickHandler = function(e) {
    if (!_epDrawing) return;
    const ll = _evtLatLng(e);
    _epPoints.push(ll);
    // Update live draw source
    const feats = [];
    if (_epPoints.length > 1) { const f = _drawLineFeature(_epPoints, '#14b1e7'); if (f) feats.push(f); }
    _epPoints.forEach(p => { const f = _drawPointFeature(p, '#14b1e7'); if (f) feats.push(f); });
    _setDrawFeatures(feats);
  };

  _epDblHandler = function(e) {
    if (!_epDrawing) return;
    _epPoints.pop();
    endElevationProfileDraw();
  };

  state.map.on('click',    _epClickHandler);
  state.map.on('dblclick', _epDblHandler);
}

async function endElevationProfileDraw() {
  if (!_epDrawing) return;
  _epDrawing = false;

  state.map.off('click',    _epClickHandler);
  state.map.off('dblclick', _epDblHandler);
  state.map.getCanvas().style.cursor = '';

  const endBtn   = document.getElementById('ep-end-btn');
  const drawBtn  = document.getElementById('ep-draw-btn');
  const statusEl = document.getElementById('ep-status');
  if (endBtn) endBtn.style.display = 'none';
  if (drawBtn) drawBtn.style.display = 'block';

  if (_epPoints.length < 2) {
    statusEl.textContent = '⚠ Need at least 2 points to create a profile.';
    return;
  }

  // Show solid profile line on draw source
  const f = _drawLineFeature(_epPoints, '#14b1e7');
  if (f) { f.properties['_color'] = '#14b1e7'; _setDrawFeatures([f]); }
  _epResultLine = true; // flag that result is shown

  // Compute total distance (metres) using haversine
  let totalDist = 0;
  const segDists = [0];
  for (let i = 1; i < _epPoints.length; i++) {
    totalDist += haversine(_epPoints[i - 1], _epPoints[i]);
    segDists.push(totalDist);
  }

  // Interpolate N sample points along the line
  const nSamples = parseInt(document.getElementById('ep-samples').value) || 50;
  const samplePts = _epInterpolateAlongLine(_epPoints, segDists, totalDist, nSamples);

  statusEl.textContent = `⌛ Fetching elevation for ${samplePts.length} points…`;

  // Fetch elevations
  let elevations = [];
  const BATCH = 100;
  try {
    for (let i = 0; i < samplePts.length; i += BATCH) {
      const batch = samplePts.slice(i, i + BATCH);
      const body  = { locations: batch.map(p => ({ latitude: p.lat, longitude: p.lng })) };
      const resp  = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      elevations = elevations.concat(data.results.map(r => r.elevation));
    }
  } catch(err) {
    statusEl.textContent = `⚠ Elevation API error: ${err.message}. Cannot generate profile.`;
    return;
  }

  statusEl.style.display = 'none';
  _epRenderChart(samplePts, elevations, totalDist);
}

function _epInterpolateAlongLine(pts, segDists, total, n) {
  const result = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * total;
    // Find which segment t falls in
    let seg = 0;
    for (let j = 1; j < segDists.length; j++) {
      if (segDists[j] >= t) { seg = j - 1; break; }
      if (j === segDists.length - 1) seg = j - 1;
    }
    const segStart = segDists[seg];
    const segEnd   = segDists[seg + 1] !== undefined ? segDists[seg + 1] : segDists[seg];
    const segLen   = segEnd - segStart;
    const frac     = segLen > 0 ? (t - segStart) / segLen : 0;
    const a        = pts[seg];
    const b        = pts[Math.min(seg + 1, pts.length - 1)];
    result.push({
      lat: a.lat + (b.lat - a.lat) * frac,
      lng: a.lng + (b.lng - a.lng) * frac,
      d: t,
    });
  }
  return result;
}

function _epRenderChart(pts, elevations, totalDist) {
  const wrap     = document.getElementById('ep-chart-wrap');
  const svg      = document.getElementById('ep-chart');
  const titleEl  = document.getElementById('ep-chart-title');
  const minEl    = document.getElementById('ep-stat-min');
  const maxEl    = document.getElementById('ep-stat-max');
  const distEl   = document.getElementById('ep-stat-dist');

  if (!wrap || !svg) return;
  wrap.style.display = 'block';

  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);
  const range   = maxElev - minElev || 1;

  const W = svg.clientWidth || 260;
  const H = 140;
  const PAD = { top: 12, right: 8, bottom: 22, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top  - PAD.bottom;

  // Build polyline points
  const polyPts = elevations.map((el, i) => {
    const x = PAD.left + (pts[i].d / totalDist) * chartW;
    const y = PAD.top  + chartH - ((el - minElev) / range) * chartH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Fill polygon (close to bottom)
  const firstPt = `${PAD.left},${PAD.top + chartH}`;
  const lastPt  = `${PAD.left + chartW},${PAD.top + chartH}`;
  const fillPts = firstPt + ' ' + polyPts + ' ' + lastPt;

  // Y-axis ticks (3 ticks)
  let axisSVG = '';
  for (let i = 0; i <= 4; i++) {
    const elev = minElev + (range / 4) * i;
    const y    = PAD.top + chartH - (i / 4) * chartH;
    axisSVG += `<line x1="${PAD.left - 4}" y1="${y.toFixed(1)}" x2="${PAD.left + chartW}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
    axisSVG += `<text x="${(PAD.left - 6).toFixed(0)}" y="${(y + 3).toFixed(0)}" fill="#8ab" font-family="monospace" font-size="8" text-anchor="end">${Math.round(elev)}</text>`;
  }

  // X-axis distance labels
  let xAxisSVG = '';
  const distKm  = totalDist >= 1000;
  const distFmt = d => distKm ? (d / 1000).toFixed(1) + 'k' : Math.round(d) + 'm';
  for (let i = 0; i <= 4; i++) {
    const d = (totalDist / 4) * i;
    const x = PAD.left + (d / totalDist) * chartW;
    xAxisSVG += `<text x="${x.toFixed(0)}" y="${(PAD.top + chartH + 12).toFixed(0)}" fill="#8ab" font-family="monospace" font-size="8" text-anchor="middle">${distFmt(d)}</text>`;
  }

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `
    <polygon points="${fillPts}" fill="rgba(20,177,231,0.25)" stroke="none"/>
    <polyline points="${polyPts}" fill="none" stroke="#14b1e7" stroke-width="1.5" stroke-linejoin="round"/>
    ${axisSVG}${xAxisSVG}
    <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + chartH}" stroke="#8ab" stroke-width="1"/>
    <line x1="${PAD.left}" y1="${PAD.top + chartH}" x2="${PAD.left + chartW}" y2="${PAD.top + chartH}" stroke="#8ab" stroke-width="1"/>
  `;

  titleEl.textContent = 'Elevation Profile';
  minEl.textContent   = `Min: ${Math.round(minElev)} m`;
  maxEl.textContent   = `Max: ${Math.round(maxElev)} m`;
  distEl.textContent  = `Dist: ${distFmt(totalDist)}`;

  // Show export buttons
  const exportRow = document.getElementById('ep-export-row');
  if (exportRow) exportRow.style.display = 'flex';
}

// Export elevation profile chart as PNG
function exportElevationProfilePNG() {
  const svg = document.getElementById('ep-chart');
  if (!svg || !svg.innerHTML) { toast('No profile to export', 'error'); return; }

  const W   = parseInt(svg.getAttribute('viewBox')?.split(' ')[2]) || svg.clientWidth || 300;
  const H   = parseInt(svg.getAttribute('viewBox')?.split(' ')[3]) || 140;

  // Serialise SVG with explicit background rect so PNG isn't transparent
  const bgRect  = `<rect width="${W}" height="${H}" fill="#131c27"/>`;
  const svgSrc  = svg.outerHTML.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" `).replace('>', '>' + bgRect);
  const svgBlob = new Blob([svgSrc], { type: 'image/svg+xml;charset=utf-8' });
  const url     = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = function() {
    const canvas  = document.createElement('canvas');
    canvas.width  = W * 2;   // 2× for Retina
    canvas.height = H * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    canvas.toBlob(function(blob) {
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = 'elevation_profile.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('PNG export failed', 'error'); };
  img.src = url;
}

// Copy elevation profile chart SVG to clipboard as PNG
async function copyElevationProfilePNG() {
  const svg = document.getElementById('ep-chart');
  if (!svg || !svg.innerHTML) { toast('No profile to copy', 'error'); return; }

  const W      = parseInt(svg.getAttribute('viewBox')?.split(' ')[2]) || svg.clientWidth || 300;
  const H      = parseInt(svg.getAttribute('viewBox')?.split(' ')[3]) || 140;
  const bgRect = `<rect width="${W}" height="${H}" fill="#131c27"/>`;
  const svgSrc = svg.outerHTML.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" `).replace('>', '>' + bgRect);
  const url    = URL.createObjectURL(new Blob([svgSrc], { type: 'image/svg+xml;charset=utf-8' }));

  const img = new Image();
  img.onload = async function() {
    const canvas  = document.createElement('canvas');
    canvas.width  = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    try {
      canvas.toBlob(async blob => {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast('Profile copied to clipboard', 'success');
      }, 'image/png');
    } catch(e) {
      toast('Clipboard write failed — try Export PNG instead', 'error');
    }
  };
  img.src = url;
}

function clearElevationProfile() {
  if (_epClickHandler) { state.map.off('click',    _epClickHandler); _epClickHandler = null; }
  if (_epDblHandler)   { state.map.off('dblclick', _epDblHandler);   _epDblHandler   = null; }
  _epLine = null; _epResultLine = null; _epTempMarkers = [];
  _epPoints   = [];
  _epDrawing  = false;
  _clearDraw();
  state.map.getCanvas().style.cursor = '';

  const statusEl = document.getElementById('ep-status');
  const endBtn   = document.getElementById('ep-end-btn');
  const drawBtn  = document.getElementById('ep-draw-btn');
  const wrap     = document.getElementById('ep-chart-wrap');
  if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
  if (endBtn)   endBtn.style.display   = 'none';
  if (drawBtn)  drawBtn.style.display  = 'block';
  if (wrap)     wrap.style.display     = 'none';
  const exportRow = document.getElementById('ep-export-row');
  if (exportRow) exportRow.style.display = 'none';
}

function switchWidgetTab(tab) {
  ['measure','sbl','geoprocess','viewshed','elevation','designqa','landclassify'].forEach(t => {
    const tabEl = document.getElementById('wt-' + t);
    const paneEl = document.getElementById('wp-' + t);
    if (tabEl) tabEl.classList.toggle('active', t === tab);
    if (paneEl) paneEl.classList.toggle('visible', t === tab);
  });
  if (tab === 'designqa') updateDQALayerList();
  if (tab === 'geoprocess') { updateGeoprocessLayerSelects(); setTimeout(_initGpTooltips, 50); }
  if (tab === 'landclassify') {updateLandClassifyUI?.(); initAOIControls?.();
  }
}
function updateLandClassifyUI() {
  // optional UI hook (safe placeholder)
}
function initAOIControls() {
  // optional UI hook (safe placeholder)
}


// Toggle a geoprocessing sub-section open/closed
function gpToggle(id) {
  const body = document.getElementById(id);
  if (!body) return;
  body.classList.toggle('open');
  // Rotate chevron on the sibling header
  const header = body.previousElementSibling;
  if (header) {
    const chev = header.querySelector('.gp-chevron');
    if (chev) chev.style.transform = body.classList.contains('open') ? 'rotate(90deg)' : '';
  }
}

function makePanelDraggable(panel, handle) {
  if (handle._draggable) return;
  handle._draggable = true;
  let startX, startY, startL, startT;
  handle.addEventListener('mousedown', e => {
    if (e.target.id === 'widget-float-close') return;
    startX = e.clientX; startY = e.clientY;
    startL = parseInt(panel.style.left)||0;
    startT = parseInt(panel.style.top)||0;
    const onMove = ev => {
      panel.style.left = (startL + ev.clientX - startX) + 'px';
      panel.style.top  = (startT + ev.clientY - startY) + 'px';
      panel.dataset.dragged = '1';
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });
}















//////////////////////////////
// AOI LAND CLASSIFICATION TOOL
// Draw → Double-click → Classify → Raster
//////////////////////////////

// ==========================
// START AOI DRAWING
// ==========================
function activateAOIDraw() {
  clearWidgetDraw();
  clearMeasure();

  widgetState.mode = 'aoi';
  widgetState.points = [];

  const map = state.map;
  map.getCanvas().style.cursor = 'crosshair';

  const btn = document.getElementById('aoi-draw-btn');
  if (btn) {
    btn.style.borderColor = 'var(--accent)';
    btn.style.color = 'var(--accent)';
    btn.style.background = 'rgba(57,211,83,0.1)';
  }

  const endBtn = document.getElementById('aoi-end-btn');
  if (endBtn) endBtn.style.display = 'none';

  // prevent default zoom on double click
  map.doubleClickZoom?.disable?.();

  map.on('dblclick', handleAOIDoubleClick);

  toast('Click to draw AOI. Double-click to finish.', 'info');
}


// ==========================
// MAP DOUBLE CLICK HANDLER
// ==========================
function handleAOIDoubleClick(e) {
  if (widgetState.mode !== 'aoi') return;

  e.preventDefault?.();

  endAOIDraw();
}


// ==========================
// END AOI DRAWING
// ==========================
function endAOIDraw() {
  const map = state.map;

  map.off('dblclick', handleAOIDoubleClick);

  if (!widgetState.points || widgetState.points.length < 3) {
    toast('Draw at least 3 points for AOI polygon', 'error');
    resetAOIButton();
    return;
  }

  runAOIPolygon();

  clearWidgetDraw();
  resetAOIButton();
}


// ==========================
// RESET UI STATE
// ==========================
function resetAOIButton() {
  widgetState.mode = null;

  const btn = document.getElementById('aoi-draw-btn');
  if (btn) {
    btn.style.borderColor = '';
    btn.style.color = '';
    btn.style.background = '';
  }
}


// ==========================
// BUILD AOI GEOJSON
// ==========================
function buildAOIGeoJSON() {
  const coords = widgetState.points.map(p => [p.lng, p.lat]);

  // close polygon
  coords.push([widgetState.points[0].lng, widgetState.points[0].lat]);

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [coords]
    },
    properties: {}
  };
}


// ==========================
// RUN LAND CLASSIFICATION
// ==========================
async function runAOIPolygon() {
  const resultBox = document.getElementById('aoi-result');

  if (resultBox) {
    resultBox.style.display = 'block';
    resultBox.innerHTML = 'Loading landcover...';
  }

map.addSource('landcover', {
  type: 'vector',
  url: `https://api.maptiler.com/tiles/landcover/tiles.json?key=${GAIA_CONFIG.mapTilerKey}`
});

map.addLayer({
  'source-layer': 'landcover',
  'type': 'fill'
});

  renderLandClassificationRaster(tileUrl);

  if (resultBox) {
    resultBox.innerHTML = '✅ Landcover loaded (no backend mode)';
  }
}


// ==========================
// RASTER RENDERING (MAPBOX)
// ==========================
function renderLandClassificationRaster(tileUrl) {
  const map = state.map;

  if (map.getLayer('land-classification')) {
    map.removeLayer('land-classification');
  }

  if (map.getSource('land-classification')) {
    map.removeSource('land-classification');
  }

  map.addSource('land-classification', {
    type: 'raster',
    tiles: [tileUrl],
    tileSize: 256
  });

  map.addLayer({
    id: 'land-classification',
    type: 'raster',
    source: 'land-classification',
    paint: {
      'raster-opacity': 0.75
    }
  });
}


// ==========================
// OPTIONAL CLEANUP
// ==========================
function clearLandClassification() {
  const map = state.map;

  if (map.getLayer('land-classification')) {
    map.removeLayer('land-classification');
  }

  if (map.getSource('land-classification')) {
    map.removeSource('land-classification');
  }

  const box = document.getElementById('aoi-result');
  if (box) {
    box.style.display = 'none';
    box.innerHTML = '';
  }
}

function addGaiaBaseLayers() {
  const map = state.map;
  const key = GAIA_CONFIG.mapTilerKey;

  const layers = [
    {
      id: "gaia-landcover",
      tileset: "globallandcover",
      opacity: 0.65
    },
    {
      id: "gaia-landform",
      tileset: "landform",
      opacity: 0.5
    },
    {
      id: "gaia-cadastre",
      tileset: "cadastre",
      opacity: 0.6
    }
  ];

  layers.forEach(l => {
    const sourceId = l.id + "-source";

    if (map.getSource(sourceId)) return;

    map.addSource(sourceId, {
      type: "raster",
      tiles: [
        `https://api.maptiler.com/tiles/${l.tileset}/{z}/{x}/{y}.png?key=${key}`
      ],
      tileSize: 256
    });

    map.addLayer({
      id: l.id,
      type: "raster",
      source: sourceId,
      paint: {
        "raster-opacity": l.opacity
      }
    });
  });
}