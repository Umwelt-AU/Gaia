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
  } else if (widgetState.mode === 'aoi') {
    _finishAOIDraw();
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
// AOI LAND CLASSIFICATION TOOL — DEA Landcover Landsat Level 4
//////////////////////////////

const _DEA_URL = 'https://di-daa.img.arcgis.com/arcgis/rest/services/Land_and_vegetation/DEA_Landcover_Landsat_Level4/ImageServer';
const _DEA_PIXEL_AREA = 900; // 30 m × 30 m

// Full pixel value → { label, color } lookup (uint8; 255 = no data)
const _DEA_CLASSES = {
  // Cultivated Terrestrial Vegetated (1–18)
  1:  { label: 'Cultivated Terrestrial Vegetated',                                color: '#d4b030' },
  2:  { label: 'Cultivated: Woody',                                               color: '#c8a020' },
  3:  { label: 'Cultivated: Herbaceous',                                          color: '#dcc040' },
  4:  { label: 'Cultivated: Closed (>65%)',                                       color: '#b89010' },
  5:  { label: 'Cultivated: Open (40–65%)',                                       color: '#c8a020' },
  6:  { label: 'Cultivated: Open (15–40%)',                                       color: '#d8b030' },
  7:  { label: 'Cultivated: Sparse (4–15%)',                                      color: '#e0c040' },
  8:  { label: 'Cultivated: Scattered (1–4%)',                                    color: '#e8cc50' },
  9:  { label: 'Cultivated: Woody Closed (>65%)',                                 color: '#a88010' },
  10: { label: 'Cultivated: Woody Open (40–65%)',                                 color: '#b89020' },
  11: { label: 'Cultivated: Woody Open (15–40%)',                                 color: '#c8a030' },
  12: { label: 'Cultivated: Woody Sparse (4–15%)',                                color: '#d8b040' },
  13: { label: 'Cultivated: Woody Scattered (1–4%)',                              color: '#e0bc50' },
  14: { label: 'Cultivated: Herbaceous Closed (>65%)',                            color: '#c0a820' },
  15: { label: 'Cultivated: Herbaceous Open (40–65%)',                            color: '#d0b830' },
  16: { label: 'Cultivated: Herbaceous Open (15–40%)',                            color: '#e0c840' },
  17: { label: 'Cultivated: Herbaceous Sparse (4–15%)',                           color: '#e8d050' },
  18: { label: 'Cultivated: Herbaceous Scattered (1–4%)',                         color: '#f0d860' },
  // Natural Terrestrial Vegetated (19–36)
  19: { label: 'Natural Terrestrial Vegetated',                                   color: '#3a8040' },
  20: { label: 'Natural Terrestrial: Woody',                                      color: '#2a6e30' },
  21: { label: 'Natural Terrestrial: Herbaceous',                                 color: '#5a9850' },
  22: { label: 'Natural Terrestrial: Closed (>65%)',                              color: '#1a5a28' },
  23: { label: 'Natural Terrestrial: Open (40–65%)',                              color: '#2a6e30' },
  24: { label: 'Natural Terrestrial: Open (15–40%)',                              color: '#3a8040' },
  25: { label: 'Natural Terrestrial: Sparse (4–15%)',                             color: '#5a9850' },
  26: { label: 'Natural Terrestrial: Scattered (1–4%)',                           color: '#7ab068' },
  27: { label: 'Natural Terrestrial: Woody Closed (>65%)',                        color: '#1a4e20' },
  28: { label: 'Natural Terrestrial: Woody Open (40–65%)',                        color: '#2a5e28' },
  29: { label: 'Natural Terrestrial: Woody Open (15–40%)',                        color: '#3a7030' },
  30: { label: 'Natural Terrestrial: Woody Sparse (4–15%)',                       color: '#4a8040' },
  31: { label: 'Natural Terrestrial: Woody Scattered (1–4%)',                     color: '#5a9050' },
  32: { label: 'Natural Terrestrial: Herbaceous Closed (>65%)',                   color: '#3a8848' },
  33: { label: 'Natural Terrestrial: Herbaceous Open (40–65%)',                   color: '#4a9858' },
  34: { label: 'Natural Terrestrial: Herbaceous Open (15–40%)',                   color: '#5aa868' },
  35: { label: 'Natural Terrestrial: Herbaceous Sparse (4–15%)',                  color: '#6ab878' },
  36: { label: 'Natural Terrestrial: Herbaceous Scattered (1–4%)',                color: '#7ac888' },
  // Natural Aquatic Vegetated (55–92)
  55: { label: 'Natural Aquatic Vegetated',                                        color: '#2a8878' },
  56: { label: 'Natural Aquatic: Woody',                                           color: '#1a6868' },
  57: { label: 'Natural Aquatic: Herbaceous',                                      color: '#3a9888' },
  58: { label: 'Natural Aquatic: Closed (>65%)',                                   color: '#1a5858' },
  59: { label: 'Natural Aquatic: Open (40–65%)',                                   color: '#2a6868' },
  60: { label: 'Natural Aquatic: Open (15–40%)',                                   color: '#3a7878' },
  61: { label: 'Natural Aquatic: Sparse (4–15%)',                                  color: '#4a8888' },
  62: { label: 'Natural Aquatic: Scattered (1–4%)',                                color: '#5a9898' },
  63: { label: 'Natural Aquatic: Woody Closed (>65%)',                             color: '#1a5060' },
  64: { label: 'Natural Aquatic: Woody Closed (>65%) Semi-permanent',              color: '#1a5868' },
  65: { label: 'Natural Aquatic: Woody Closed (>65%) Temporary',                   color: '#2a6070' },
  66: { label: 'Natural Aquatic: Woody Open (40–65%)',                             color: '#1a6060' },
  67: { label: 'Natural Aquatic: Woody Open (40–65%) Semi-permanent',              color: '#1a6868' },
  68: { label: 'Natural Aquatic: Woody Open (40–65%) Temporary',                   color: '#2a7070' },
  69: { label: 'Natural Aquatic: Woody Open (15–40%)',                             color: '#2a7070' },
  70: { label: 'Natural Aquatic: Woody Open (15–40%) Semi-permanent',              color: '#2a7878' },
  71: { label: 'Natural Aquatic: Woody Open (15–40%) Temporary',                   color: '#3a8080' },
  72: { label: 'Natural Aquatic: Woody Sparse (4–15%)',                            color: '#3a7878' },
  73: { label: 'Natural Aquatic: Woody Sparse (4–15%) Semi-permanent',             color: '#3a8080' },
  74: { label: 'Natural Aquatic: Woody Sparse (4–15%) Temporary',                  color: '#4a8888' },
  75: { label: 'Natural Aquatic: Woody Scattered (1–4%)',                          color: '#4a8888' },
  76: { label: 'Natural Aquatic: Woody Scattered (1–4%) Semi-permanent',           color: '#4a9090' },
  77: { label: 'Natural Aquatic: Woody Scattered (1–4%) Temporary',                color: '#5a9898' },
  78: { label: 'Natural Aquatic: Herbaceous Closed (>65%)',                        color: '#2a9898' },
  79: { label: 'Natural Aquatic: Herbaceous Closed (>65%) Semi-permanent',         color: '#2aa0a0' },
  80: { label: 'Natural Aquatic: Herbaceous Closed (>65%) Temporary',              color: '#3aa8a8' },
  81: { label: 'Natural Aquatic: Herbaceous Open (40–65%)',                        color: '#3a9090' },
  82: { label: 'Natural Aquatic: Herbaceous Open (40–65%) Semi-permanent',         color: '#3a9898' },
  83: { label: 'Natural Aquatic: Herbaceous Open (40–65%) Temporary',              color: '#4aa0a0' },
  84: { label: 'Natural Aquatic: Herbaceous Open (15–40%)',                        color: '#4a9898' },
  85: { label: 'Natural Aquatic: Herbaceous Open (15–40%) Semi-permanent',         color: '#4aa0a0' },
  86: { label: 'Natural Aquatic: Herbaceous Open (15–40%) Temporary',              color: '#5aa8a8' },
  87: { label: 'Natural Aquatic: Herbaceous Sparse (4–15%)',                       color: '#5aa0a0' },
  88: { label: 'Natural Aquatic: Herbaceous Sparse (4–15%) Semi-permanent',        color: '#5aa8a8' },
  89: { label: 'Natural Aquatic: Herbaceous Sparse (4–15%) Temporary',             color: '#6ab0b0' },
  90: { label: 'Natural Aquatic: Herbaceous Scattered (1–4%)',                     color: '#6aa8a8' },
  91: { label: 'Natural Aquatic: Herbaceous Scattered (1–4%) Semi-permanent',      color: '#6ab0b0' },
  92: { label: 'Natural Aquatic: Herbaceous Scattered (1–4%) Temporary',           color: '#7ab8b8' },
  // Other
  93:  { label: 'Artificial Surface',                       color: '#8a7060' },
  94:  { label: 'Natural Surface',                          color: '#c09860' },
  95:  { label: 'Natural Surface: Sparsely vegetated',      color: '#c8a870' },
  96:  { label: 'Natural Surface: Very sparsely vegetated', color: '#d0b880' },
  97:  { label: 'Natural Surface: Bare, unvegetated',       color: '#b88848' },
  98:  { label: 'Water',                                    color: '#2060b0' },
  99:  { label: 'Water',                                    color: '#2868b8' },
  100: { label: 'Water: Tidal area',                        color: '#3878c0' },
  101: { label: 'Water: Perennial (>9 months)',             color: '#1858a8' },
  102: { label: 'Water: Non-perennial (7–9 months)',        color: '#2868b0' },
  103: { label: 'Water: Non-perennial (4–6 months)',        color: '#3878b8' },
  104: { label: 'Water: Non-perennial (1–3 months)',        color: '#4888c0' },
};

// Top-level category groupings for the overview bar
const _DEA_CATEGORIES = [
  { label: 'Cultivated',          color: '#c8a020', codes: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18] },
  { label: 'Natural Terrestrial', color: '#3a8040', codes: [19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36] },
  { label: 'Natural Aquatic',     color: '#2a8878', codes: [55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92] },
  { label: 'Artificial Surface',  color: '#8a7060', codes: [93] },
  { label: 'Natural Surface',     color: '#c09860', codes: [94,95,96,97] },
  { label: 'Water',               color: '#2060b0', codes: [98,99,100,101,102,103,104] },
];

// AOI helper: approximate ring area in m² (WGS84 input)
function _lcRingArea(ring) {
  if (ring.length < 3) return 0;
  const R = 6371000;
  const ox = ring[0][0], oy = ring[0][1];
  const cosLat = Math.cos(oy * Math.PI / 180);
  const xy = ring.map(p => [(p[0] - ox) * Math.PI / 180 * R * cosLat, (p[1] - oy) * Math.PI / 180 * R]);
  let area = 0;
  for (let i = 0; i < xy.length; i++) { const j = (i + 1) % xy.length; area += xy[i][0] * xy[j][1] - xy[j][0] * xy[i][1]; }
  return Math.abs(area / 2);
}

function onAOITypeChange() {
  const type = document.getElementById('aoi-type').value;
  document.getElementById('aoi-layer-row').style.display  = type === 'existing' ? '' : 'none';
  document.getElementById('aoi-upload-row').style.display = type === 'upload'   ? '' : 'none';
  const btn = document.getElementById('ep-draw-btn');
  if (btn) btn.textContent = type === 'draw' ? '✎ Draw AOI' : '▶ Run Classification';
}

function updateLandClassifyUI() {
  const sel = document.getElementById('aoi-layer-select');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— select layer —</option>';
  (state.layers || []).forEach((l, i) => {
    if (l.isTile || l.is3DBuildings) return;
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = l.name; sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

function _deaWMSTileURL(year, style) {
  return 'https://ows.dea.ga.gov.au/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
    '&LAYERS=ga_ls_landcover_c3' +
    `&STYLES=${encodeURIComponent(style)}` +
    '&FORMAT=image%2Fpng&TRANSPARENT=TRUE' +
    '&CRS=EPSG%3A3857&WIDTH=256&HEIGHT=256' +
    `&TIME=${encodeURIComponent(year + '-01-01')}` +
    '&BBOX={bbox-epsg-3857}';
}

function toggleDEALayer() {
  const map = state.map;
  const btn   = document.getElementById('dea-layer-btn');
  const year  = document.getElementById('dea-year')?.value  || '2024';
  const style = document.getElementById('dea-style')?.value || 'level4';

  // Remove existing layer/source first (handles both toggle-off and style/year reload)
  try { if (map.getLayer('dea-landcover'))    map.removeLayer('dea-landcover'); }    catch(_) {}
  try { if (map.getSource('dea-landcover-src')) map.removeSource('dea-landcover-src'); } catch(_) {}

  // If layer was visible, toggling off — stop here
  if (btn?.dataset.active === '1') {
    btn.dataset.active = '0';
    btn.textContent = '🗺 Show DEA Layer';
    btn.style.borderColor = ''; btn.style.color = '';
    return;
  }

  map.addSource('dea-landcover-src', {
    type: 'raster',
    tiles: [_deaWMSTileURL(year, style)],
    tileSize: 256,
    attribution: '© Geoscience Australia / DEA'
  });
  map.addLayer({ id: 'dea-landcover', type: 'raster', source: 'dea-landcover-src',
    paint: { 'raster-opacity': 0.8 } });

  if (btn) {
    btn.dataset.active = '1';
    btn.textContent = '🗺 Hide DEA Layer';
    btn.style.borderColor = 'var(--accent)'; btn.style.color = 'var(--accent)';
  }
}

// Reload the WMS layer when year or style changes while it is visible
function _reloadDEALayerIfActive() {
  const btn = document.getElementById('dea-layer-btn');
  if (btn?.dataset.active !== '1') return;
  // Temporarily mark as inactive so toggleDEALayer re-adds rather than just removes
  btn.dataset.active = '0';
  toggleDEALayer();
}

function activateAOIDraw() {
  const type = document.getElementById('aoi-type')?.value || 'draw';

  if (type === 'existing') {
    const idx = parseInt(document.getElementById('aoi-layer-select').value);
    if (isNaN(idx) || !state.layers[idx]) { toast('Select a layer first', 'error'); return; }
    _runLandClassify(state.layers[idx].geojson);
    return;
  }
  if (type === 'upload') {
    const file = document.getElementById('aoi-file').files[0];
    if (!file) { toast('Select a GeoJSON file first', 'error'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      try { _runLandClassify(JSON.parse(ev.target.result)); }
      catch (_) { toast('Invalid GeoJSON file', 'error'); }
    };
    reader.readAsText(file);
    return;
  }
  // Draw mode
  clearWidgetDraw();
  widgetState.mode = 'aoi';
  widgetState.points = [];
  state.map.getCanvas().style.cursor = 'crosshair';
  state.map.doubleClickZoom?.disable?.();
  const btn = document.getElementById('ep-draw-btn');
  if (btn) { btn.style.borderColor = 'var(--accent)'; btn.style.color = 'var(--accent)'; btn.style.background = 'rgba(57,211,83,0.1)'; }
  toast('Click to draw AOI. Double-click to finish.', 'info');
}

function _finishAOIDraw() {
  if (widgetState.mode !== 'aoi') return;
  if (!widgetState.points || widgetState.points.length < 3) {
    toast('Draw at least 3 points for AOI polygon', 'error');
    _resetAOIBtn(); clearWidgetDraw(); return;
  }
  const pts = [...widgetState.points];
  clearWidgetDraw(); _resetAOIBtn();
  _runLandClassify({ type: 'FeatureCollection', features: [{
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[...pts.map(p => [p.lng, p.lat]), [pts[0].lng, pts[0].lat]]] },
    properties: {}
  }]});
}

function _resetAOIBtn() {
  widgetState.mode = null;
  state.map.doubleClickZoom?.enable?.();
  const btn = document.getElementById('ep-draw-btn');
  if (btn) { btn.style.borderColor = ''; btn.style.color = ''; btn.style.background = ''; }
}

function clearAOI() {
  _resetAOIBtn(); clearWidgetDraw();
  const map = state.map;
  ['lc-aoi-fill', 'lc-aoi-outline'].forEach(id => { try { if (map.getLayer(id)) map.removeLayer(id); } catch(_){} });
  try { if (map.getSource('lc-aoi-source')) map.removeSource('lc-aoi-source'); } catch(_) {}
  const box = document.getElementById('aoi-result');
  if (box) { box.style.display = 'none'; box.innerHTML = ''; }
}

async function _runLandClassify(geojson) {
  const map = state.map;
  const resultBox = document.getElementById('aoi-result');

  // Normalise input to a polygon feature
  let aoiFeat = null;
  if (geojson.type === 'FeatureCollection') {
    aoiFeat = (geojson.features || []).find(f => f.geometry &&
      (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
  } else if (geojson.type === 'Feature') {
    aoiFeat = geojson;
  } else if (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon') {
    aoiFeat = { type: 'Feature', geometry: geojson, properties: {} };
  }
  if (!aoiFeat) { toast('No polygon geometry found in AOI', 'error'); return; }

  const rings = aoiFeat.geometry.type === 'MultiPolygon'
    ? aoiFeat.geometry.coordinates.map(p => p[0])
    : [aoiFeat.geometry.coordinates[0]];

  // Draw AOI boundary on map (clears any previous result box too, so set loading message after)
  clearAOI();
  map.addSource('lc-aoi-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [aoiFeat] } });
  map.addLayer({ id: 'lc-aoi-fill',    type: 'fill', source: 'lc-aoi-source', paint: { 'fill-color': '#14b1e7', 'fill-opacity': 0.08 } });
  map.addLayer({ id: 'lc-aoi-outline', type: 'line', source: 'lc-aoi-source', paint: { 'line-color': '#14b1e7', 'line-width': 2, 'line-dasharray': [4, 2] } });

  if (resultBox) { resultBox.style.display = 'block'; resultBox.innerHTML = '<div style="font-size:10px;color:var(--text3);padding:8px;">⏳ Querying DEA Landcover…</div>'; }

  // Fit to AOI
  try {
    const coords = rings.flat();
    const lngs = coords.map(c => c[0]), lats = coords.map(c => c[1]);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 80, duration: 700, maxZoom: 14 });
  } catch(_) {}

  // Project AOI rings from WGS84 → EPSG:3857 for the ArcGIS query
  const rings3857 = rings.map(ring =>
    ring.map(pt => { try { return proj4('EPSG:4326', 'EPSG:3857', [pt[0], pt[1]]); } catch(_) { return pt; } })
  );

  const year = parseInt(document.getElementById('dea-year')?.value || '2024');
  const geometry3857 = { rings: rings3857, spatialReference: { wkid: 102100 } };
  const mosaicRule = {
    mosaicMethod: 'esriMosaicAttribute',
    sortField: 'datetime',
    sortValue: `${year + 1}-01-01`,
    ascending: false
  };

  let counts = null;
  try {
    const body = new URLSearchParams({
      geometry:     JSON.stringify(geometry3857),
      geometryType: 'esriGeometryPolygon',
      mosaicRule:   JSON.stringify(mosaicRule),
      pixelSize:    JSON.stringify({ x: 30, y: 30, spatialReference: { wkid: 102100 } }),
      f:            'json'
    });
    const resp = await fetch(`${_DEA_URL}/computeHistograms`, { method: 'POST', body });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || 'Service error');
    counts = data.histograms?.[0]?.counts;
    if (!counts) throw new Error('No histogram data in response');
  } catch(err) {
    if (resultBox) resultBox.innerHTML = `<div style="font-size:9px;color:var(--orange);padding:8px;line-height:1.5;">⚠ DEA query failed: ${escHtml(err.message)}<br>Check network connectivity and try again.</div>`;
    return;
  }

  // Build class buckets from histogram (counts[i] = pixel count for value i)
  const aoiArea = rings.reduce((s, r) => s + _lcRingArea(r), 0);
  const buckets = {}; // pixelValue → m²
  let classifiedArea = 0;
  counts.forEach((count, val) => {
    if (count === 0 || val === 0 || val === 255) return;
    if (!_DEA_CLASSES[val]) return; // skip unused codes
    const area = count * _DEA_PIXEL_AREA;
    buckets[val] = (buckets[val] || 0) + area;
    classifiedArea += area;
  });

  _renderLCResults(resultBox, buckets, classifiedArea, aoiArea, year);
}

function _renderLCResults(box, buckets, classifiedArea, aoiArea, year) {
  if (!box) return;
  box.style.display = 'block';
  const sorted = Object.entries(buckets).sort((a, b) => b[1] - a[1]);

  if (!sorted.length) {
    box.innerHTML = `<div style="font-size:9px;color:var(--text3);padding:8px;line-height:1.6;">
      No classified pixels found in this area.<br>
      The DEA dataset covers Australia only (1988–2024).<br>
      <span style="opacity:0.7;">AOI area: ${fmtArea(aoiArea)}</span></div>`;
    return;
  }

  // ── Category overview stacked bar ──
  const catBars = _DEA_CATEGORIES.map(cat => {
    const catArea = cat.codes.reduce((s, c) => s + (buckets[c] || 0), 0);
    const pct = classifiedArea > 0 ? (catArea / classifiedArea) * 100 : 0;
    return pct > 0 ? `<div title="${escHtml(cat.label)}: ${pct.toFixed(1)}%"
      style="background:${cat.color};width:${pct.toFixed(2)}%;height:100%;display:inline-block;"></div>` : '';
  }).join('');

  const catLegend = _DEA_CATEGORIES.filter(cat =>
    cat.codes.some(c => buckets[c])
  ).map(cat => {
    const catArea = cat.codes.reduce((s, c) => s + (buckets[c] || 0), 0);
    const pct = classifiedArea > 0 ? ((catArea / classifiedArea) * 100).toFixed(1) : '0';
    return `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:8px;margin-bottom:2px;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:1px;background:${cat.color};flex-shrink:0;"></span>
      <span style="font-size:8px;color:var(--text2);">${escHtml(cat.label)} ${pct}%</span>
    </span>`;
  }).join('');

  // ── Individual class bar chart rows ──
  const maxArea = sorted[0][1];
  const barRows = sorted.map(([val, area]) => {
    const info = _DEA_CLASSES[val] || { color: '#888', label: `Class ${val}` };
    const pct     = classifiedArea > 0 ? (area / classifiedArea) * 100 : 0;
    const barW    = maxArea > 0 ? (area / maxArea) * 100 : 0;
    return `<div style="display:grid;grid-template-columns:8px 1fr auto auto;align-items:center;gap:4px;padding:2px 0;">
      <span style="width:8px;height:8px;border-radius:1px;background:${info.color};display:inline-block;flex-shrink:0;"></span>
      <div style="overflow:hidden;">
        <div style="font-size:8px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
             title="${escHtml(info.label)}">${escHtml(info.label)}</div>
        <div style="height:4px;background:var(--border);border-radius:2px;margin-top:1px;">
          <div style="height:100%;width:${barW.toFixed(1)}%;background:${info.color};border-radius:2px;"></div>
        </div>
      </div>
      <span style="font-size:8px;color:var(--text3);font-family:var(--mono);white-space:nowrap;">${fmtArea(area)}</span>
      <span style="font-size:8px;color:var(--text3);font-family:var(--mono);white-space:nowrap;min-width:32px;text-align:right;">${pct.toFixed(1)}%</span>
    </div>`;
  }).join('');

  box.innerHTML = `
    <div style="font-size:9px;font-weight:600;color:var(--text2);padding:6px 0 4px;">
      DEA Landcover ${year} — ${fmtArea(aoiArea)} AOI
    </div>
    <div style="height:12px;width:100%;border-radius:3px;overflow:hidden;background:var(--border);margin-bottom:4px;">${catBars}</div>
    <div style="margin-bottom:8px;line-height:1.6;">${catLegend}</div>
    <div style="border-top:1px solid var(--border);padding-top:6px;">
      <div style="font-size:8px;color:var(--text3);font-family:var(--mono);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">
        Class breakdown — ${sorted.length} class${sorted.length !== 1 ? 'es' : ''} found
      </div>
      ${barRows}
    </div>
    <div style="font-size:8px;color:var(--text3);padding-top:6px;border-top:1px solid var(--border);margin-top:6px;line-height:1.5;">
      Source: Geoscience Australia DEA Landcover Landsat Level 4 · 30 m pixels · ${fmtArea(classifiedArea)} classified
    </div>`;
}