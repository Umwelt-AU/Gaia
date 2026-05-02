// gaia-map.js — Map init, MapLibre style builder, basemap, CRS modal, resizable panels
// ── INIT ──
window.addEventListener('DOMContentLoaded', () => {
  // Restore saved session
  setTimeout(() => { loadSession(); _checkURLSession(); }, 150);

  // ── Initialize MapLibre GL as the single map engine ──────────────────
  // Build the initial style with base raster tiles
  const _initStyle = _buildMapStyle('light', 1.0);

  state.map = new maplibregl.Map({
    container: 'map',
    style: _initStyle,
    center: [133, -27],
    zoom: 3.5,
    pitch: 0,
    bearing: 0,
    antialias: true,
    attributionControl: false,
    maxPitch: 85,
    preserveDrawingBuffer: true,
  });

  // Add navigation controls
  state.map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');
  state.map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-right');

state.map.on('load', () => {
  // --- 1. Add MapTiler DEM source (terrain-rgb, compatible with Mapbox GL) ---
  state.map.addSource('terrain-dem', {
    type: 'raster-dem',
    url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${GAIA_CONFIG.mapTilerKey}`,
    tileSize: 256,
    maxzoom: 13
  });

  // --- 2. Enable real 3D terrain ---
  state.map.setTerrain({
    source: 'terrain-dem',
    exaggeration: 1.2 // tweak this (1.0–2.0 is realistic)
  });

  // --- 3. Add hillshade layer (must be ABOVE terrain source) ---
  state.map.addLayer({
    id: 'hillshade',
    type: 'hillshade',
    source: 'terrain-dem',
    layout: { visibility: 'visible' },
    paint: {
      'hillshade-shadow-color': '#1a1e2c',
      'hillshade-highlight-color': '#f0f4f8',
      'hillshade-illumination-direction': 315,
      'hillshade-illumination-anchor': 'map',
      'hillshade-exaggeration': 0.3
    }
  });

  // --- 4. Sky (atmospheric gradient above horizon when pitched) ---
  try {
    state.map.addLayer({
      id: 'sky', type: 'sky',
      paint: { 'sky-type': 'atmosphere', 'sky-atmosphere-sun': [0.0, 90.0], 'sky-atmosphere-sun-intensity': 15 }
    });
  } catch(_) {}

    // Initialise the draw source (used by measure, SBL, create, viewshed, elevation tools)
    state.map.addSource('draw-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    state.map.addLayer({ id: 'draw-fill',   type: 'fill',   source: 'draw-source', filter: ['==', '$type', 'Polygon'],
      paint: { 'fill-color': ['get', '_color'], 'fill-opacity': 0.12 } });
    state.map.addLayer({ id: 'draw-line',   type: 'line',   source: 'draw-source', filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
      paint: { 'line-color': ['get', '_color'], 'line-width': 2, 'line-dasharray': [4, 3] } });
    state.map.addLayer({ id: 'draw-circle', type: 'circle', source: 'draw-source', filter: ['==', '$type', 'Point'],
      paint: { 'circle-color': ['get', '_color'], 'circle-radius': 5, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
    // Preview source for rubber-band line while drawing
    state.map.addSource('draw-preview-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    state.map.addLayer({ id: 'draw-preview-line',   type: 'line',   source: 'draw-preview-source',
      paint: { 'line-color': '#39d353', 'line-width': 1.5, 'line-dasharray': [3, 3], 'line-opacity': 0.7 } });
    state.map.addLayer({ id: 'draw-preview-fill',   type: 'fill',   source: 'draw-preview-source',
      paint: { 'fill-color': '#39d353', 'fill-opacity': 0.06 } });

    _updateEmptyState();
  });

  // ── Coordinate display on mouse move ─────────────────────────────────
  state.map.on('mousemove', e => {
    const coordEl = document.getElementById('coord-display');
    const crs = state.displayCRS;
    const fromDef = CRS_DEFS['EPSG:4326'];
    const toDef   = CRS_DEFS[crs] || crs;
    const { lng, lat } = e.lngLat;
    let display;
    const isGeo = ['EPSG:4326','EPSG:4283','EPSG:7844','EPSG:4269'].includes(crs);
    if (isGeo) {
      display = `Lat: ${lat.toFixed(6)}  Lng: ${lng.toFixed(6)}  [${crs}]`;
    } else {
      try {
        const [x, y] = proj4(fromDef, toDef, [lng, lat]);
        if (isProjectedCRS(crs)) {
          display = `E: ${x.toFixed(1)} m  N: ${y.toFixed(1)} m  [${crs}]`;
        } else {
          display = `X: ${x.toFixed(6)}  Y: ${y.toFixed(6)}  [${crs}]`;
        }
      } catch(err) {
        display = `Lat: ${lat.toFixed(6)}  Lng: ${lng.toFixed(6)}`;
      }
    }
    coordEl.textContent = display;
  });
  state.map.on('mouseleave', () => {
    document.getElementById('coord-display').textContent = 'Hover map to see coordinates';
  });

  // ── Scale / zoom display ──────────────────────────────────────────────
  function updateScaleDisplay() {
    const zoom = state.map.getZoom();
    const zoomEl = document.getElementById('zoom-input');
    const scaleEl = document.getElementById('scale-display');
    if (zoomEl && document.activeElement !== zoomEl) zoomEl.value = Math.round(zoom);
    if (scaleEl) {
      const lat = state.map.getCenter().lat;
      const metersPerPx = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
      const scaleDenom = Math.round(metersPerPx * 96 / 0.0254);
      if (scaleDenom >= 1000000) scaleEl.textContent = (scaleDenom / 1000000).toFixed(1) + 'M';
      else if (scaleDenom >= 1000) scaleEl.textContent = Math.round(scaleDenom / 1000) + 'k';
      else scaleEl.textContent = scaleDenom.toString();
    }
  }
  state.map.on('zoomend', updateScaleDisplay);
  state.map.on('moveend', updateScaleDisplay);
  setTimeout(updateScaleDisplay, 300);

  // ── Drag-and-drop on map empty state ─────────────────────────────────
  const mes = document.getElementById('map-empty-state');
  if (mes) {
    mes.addEventListener('dragover',  function(e) { e.preventDefault(); mes.classList.add('mes-dragging'); });
    mes.addEventListener('dragleave', function()  { mes.classList.remove('mes-dragging'); });
    mes.addEventListener('drop',      function(e) { mes.classList.remove('mes-dragging'); handleDrop(e); });
  }

  // ── Right-click context menu ──────────────────────────────────────────
  state.map.on('contextmenu', function(e) {
    e.preventDefault();
    showMapCtxMenu({ latlng: { lat: e.lngLat.lat, lng: e.lngLat.lng }, originalEvent: e.originalEvent });
  });

  // ── Click on empty map area → clear selection ─────────────────────────
  state.map.on('click', function(e) {
    if (e.originalEvent._featureClicked) return;
    if (widgetState.mode) { handleWidgetClick(e); return; }
    if (state.selectedFeatureIndices && state.selectedFeatureIndices.size > 0) {
      state.selectedFeatureIndices = new Set();
      state.selectedFeatureIndex = -1;
      state.showOnlySelected = false;
      const ssb = document.getElementById('show-selected-btn');
      if (ssb) ssb.classList.remove('active');
      if (state.activeLayerIndex >= 0) refreshMapSelection(state.activeLayerIndex);
      updateSelectionCount();
      renderTable();
    }
    if (state._featurePopup) { state._featurePopup.remove(); state._featurePopup = null; }
  });

  // ── Mouse move for draw preview ───────────────────────────────────────
  state.map.on('mousemove', function(e) {
    if (widgetState.mode) handleWidgetMouseMove(e);
  });

  // ── Double-click to finish drawing ────────────────────────────────────
  state.map.on('dblclick', function(e) {
    if (widgetState.mode) { e.preventDefault(); handleWidgetDblClick(e); }
  });

  document.getElementById('crs-select').addEventListener('change', function() {
    document.getElementById('custom-crs-row').style.display = this.value === 'custom' ? 'block' : 'none';
  });

  // Resizable attr strip + panels
  initAttrResize();
  initPanelResize();
});

// ── DRAW SOURCE HELPERS (for widget tools: measure, SBL, create, viewshed, elevation) ──
// All temporary drawing uses a dedicated GeoJSON source instead of Leaflet overlays.

function _setDrawFeatures(features) {
  if (!state.map) return;
  try {
    const src = state.map.getSource('draw-source');
    if (src) src.setData({ type: 'FeatureCollection', features: features || [] });
  } catch(_) {}
}

function _setDrawPreview(features) {
  if (!state.map) return;
  try {
    const src = state.map.getSource('draw-preview-source');
    if (src) src.setData({ type: 'FeatureCollection', features: features || [] });
  } catch(_) {}
}

function _clearDraw() {
  _setDrawFeatures([]);
  _setDrawPreview([]);
}

// Convert array of {lat,lng} or [lng,lat] to GeoJSON coordinate pairs
function _ptsToCoords(pts) {
  return pts.map(p => Array.isArray(p) ? [p[0], p[1]] : [p.lng, p.lat]);
}

// Build a draw polyline GeoJSON feature
function _drawLineFeature(pts, color) {
  const coords = _ptsToCoords(pts);
  if (coords.length < 2) return null;
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords },
    properties: { _color: color || '#39d353' } };
}

// Build a draw polygon GeoJSON feature
function _drawPolygonFeature(pts, color) {
  const coords = _ptsToCoords(pts);
  if (coords.length < 3) return null;
  const ring = [...coords, coords[0]]; // close ring
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { _color: color || '#39d353' } };
}

// Build a draw point GeoJSON feature
function _drawPointFeature(pt, color) {
  const coord = Array.isArray(pt) ? [pt[0], pt[1]] : [pt.lng, pt.lat];
  return { type: 'Feature', geometry: { type: 'Point', coordinates: coord },
    properties: { _color: color || '#39d353' } };
}

// Convert MapLibre event latlng object to a standard {lat, lng} object
function _evtLatLng(e) {
  const ll = e.lngLat || e.latlng;
  if (ll) return { lat: ll.lat, lng: ll.lng };
  return { lat: 0, lng: 0 };
}
function initAttrResize() {
  const handle = document.getElementById('attr-strip-header');
  const strip = document.getElementById('attr-strip');
  let dragging = false, startY, startH;
  handle.addEventListener('mousedown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    dragging = true; startY = e.clientY; startH = strip.offsetHeight;
    document.body.style.cursor = 'ns-resize'; e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = startY - e.clientY;
    const newH = Math.max(80, Math.min(600, startH + delta));
    strip.style.height = newH + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; document.body.style.cursor = ''; });
}

// ── RESIZABLE LEFT / RIGHT PANELS ──
function initPanelResize() {
  function makeResizer(handleId, panelId, edge) {
    const handle = document.getElementById(handleId);
    const panel  = document.getElementById(panelId);
    if (!handle || !panel) return;
    let dragging = false, startX, startW;
    handle.addEventListener('mousedown', e => {
      dragging = true; startX = e.clientX; startW = panel.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.cursor = 'ew-resize';
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const delta = edge === 'right'
        ? e.clientX - startX   // left panel: drag right edge → widen
        : startX - e.clientX;  // right panel: drag left edge → widen
      const newW = Math.max(200, Math.min(520, startW + delta));
      panel.style.width = newW + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      // Trigger Leaflet resize so map fills remaining space
      if (state.map) setTimeout(() => state.map.resize(), 50);
    });
  }
  makeResizer('left-resize-handle',  'left-panel',  'right');
  makeResizer('right-resize-handle', 'right-panel', 'left');
}

// ── MAPLIBRE STYLE BUILDER ──────────────────────────────────────────────
// Builds the MapLibre GL style object for the base map.
// All GeoJSON data layers are added AFTER map.on('load'), not here.
function _buildMapStyle(basemapKey, opacity) {
  opacity = opacity == null ? 1 : parseFloat(opacity);
  const bm = BASEMAPS[basemapKey];
  const sources = {};
  const layers  = [];

  if (bm) {
    sources['basemap-tiles'] = {
      type: 'raster',
      tiles: [bm.url.replace('{s}', 'a')
                    .replace('{z}', '{z}').replace('{x}', '{x}').replace('{y}', '{y}')
                    .replace('{r}', '')],
      tileSize: 256,
      attribution: bm.attr,
      maxzoom: bm.maxZoom || 19,
    };
    layers.push({ id: 'basemap', type: 'raster', source: 'basemap-tiles',
      paint: { 'raster-opacity': opacity } });

    if (bm.overlay) {
      sources['basemap-overlay-tiles'] = {
        type: 'raster',
        tiles: [bm.overlay.replace('{s}', 'a').replace('{r}', '')],
        tileSize: 256, maxzoom: bm.maxZoom || 19,
      };
      layers.push({ id: 'basemap-overlay', type: 'raster', source: 'basemap-overlay-tiles',
        paint: { 'raster-opacity': 1 } });
    }
  }

  return { version: 8, glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf', sources, layers };
}

// ── BASEMAP ──────────────────────────────────────────────────────────────
function changeBasemap() {
  if (!state.map || !state.map.isStyleLoaded()) {
    // Map not ready yet — queue for after load
    state.map && state.map.once('load', changeBasemap);
    return;
  }
  const key     = document.getElementById('basemap-select').value;
  const opacity = parseFloat(document.getElementById('basemap-opacity')?.value ?? 1);
  const bm = BASEMAPS[key];

  // Add/update basemap source+layer — preserve all other sources/layers
  if (!bm) {
    // 'none' — remove basemap layers if they exist
    ['basemap', 'basemap-overlay'].forEach(id => {
      try { if (state.map.getLayer(id)) state.map.removeLayer(id); } catch(_) {}
    });
    ['basemap-tiles', 'basemap-overlay-tiles'].forEach(id => {
      try { if (state.map.getSource(id)) state.map.removeSource(id); } catch(_) {}
    });
    return;
  }

  const tileUrl = bm.url.replace(/{s}/g, 'a').replace(/{r}/g, '');

  // Update or add basemap source
  if (state.map.getSource('basemap-tiles')) {
    state.map.getSource('basemap-tiles').setTiles([tileUrl]);
  } else {
    state.map.addSource('basemap-tiles', {
      type: 'raster', tiles: [tileUrl], tileSize: 256,
      attribution: bm.attr, maxzoom: bm.maxZoom || 19,
    });
    // Insert basemap BELOW all data layers — at position 0
    const firstLayer = state.map.getStyle().layers[0];
    state.map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap-tiles',
      paint: { 'raster-opacity': opacity } }, firstLayer ? firstLayer.id : undefined);
  }
  try { state.map.setPaintProperty('basemap', 'raster-opacity', opacity); } catch(_) {}

  // Handle label overlay (satellite hybrid)
  const existingOverlay = state.map.getLayer('basemap-overlay');
  if (bm.overlay) {
    const olUrl = bm.overlay.replace(/{s}/g, 'a').replace(/{r}/g, '');
    if (state.map.getSource('basemap-overlay-tiles')) {
      state.map.getSource('basemap-overlay-tiles').setTiles([olUrl]);
      if (!existingOverlay) {
        state.map.addLayer({ id: 'basemap-overlay', type: 'raster', source: 'basemap-overlay-tiles',
          paint: { 'raster-opacity': 1 } });
      }
    } else {
      state.map.addSource('basemap-overlay-tiles', {
        type: 'raster', tiles: [olUrl], tileSize: 256, maxzoom: bm.maxZoom || 19,
      });
      state.map.addLayer({ id: 'basemap-overlay', type: 'raster', source: 'basemap-overlay-tiles',
        paint: { 'raster-opacity': 1 } });
    }
  } else if (existingOverlay) {
    state.map.removeLayer('basemap-overlay');
    try { state.map.removeSource('basemap-overlay-tiles'); } catch(_) {}
  }
}

function setBasemapOpacity(val) {
  document.getElementById('basemap-opacity-pct').textContent = Math.round(val * 100) + '%';
  if (state.map) {
    try { state.map.setPaintProperty('basemap', 'raster-opacity', parseFloat(val)); } catch(_) {}
  }
}

// ── CRS MODAL ──
function toggleCRSModal() {
  document.getElementById('crs-backdrop').classList.toggle('open');
}
function closeCRSModal(e) {
  if (e.target === document.getElementById('crs-backdrop')) toggleCRSModal();
}
function updateDisplayCRS() {
  const val = document.getElementById('crs-select').value;
  if (val === 'custom') return;
  state.displayCRS = val;
  const info = document.getElementById('crs-info');
  if (CRS_DEFS[val]) { info.style.display = 'block'; info.textContent = CRS_DEFS[val]; }
  else { info.style.display = 'none'; }
}
function applyCustomCRS() {
  const val = document.getElementById('custom-epsg').value.trim();
  if (!val) { toast('Please enter a CRS code or proj4 definition', 'error'); return; }
  try {
    if (val.toUpperCase().startsWith('EPSG:')) {
      const code = val.toUpperCase();
      if (!CRS_DEFS[code] && !proj4.defs(code)) {
        toast(`Unknown CRS: ${code} — add a proj4 definition for this code first`, 'error'); return;
      }
      state.displayCRS = code; toast(`Hover CRS set to ${code}`, 'info');
    } else if (val.startsWith('+') || val.includes('proj=')) {
      proj4.defs('CUSTOM:1', val); state.displayCRS = 'CUSTOM:1';
      CRS_DEFS['CUSTOM:1'] = val; toast('Custom proj4 applied', 'success');
    } else {
      toast('Invalid CRS — enter an EPSG code (e.g. EPSG:28355) or a proj4 string (e.g. +proj=utm...)', 'error');
    }
  } catch(e) { toast('Invalid CRS definition: ' + e.message, 'error'); }
}

