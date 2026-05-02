// gaia-services.js — URL / REST service loaders (GeoJSON URL, WMS, XYZ, ArcGIS REST)
// ══════════════════════════════════════════════════════
//  URL / REST SERVICE LOADER
// ══════════════════════════════════════════════════════

let wmsAvailableLayers = [];

function openURLModal() {
  const bd = document.getElementById('url-backdrop');
  bd.classList.toggle('open');
  setURLStatus('', '');
  // Auto-load catalogue when modal opens for the first time
  if (bd.classList.contains('open') && _catalogueData.length === 0) loadCatalogueCSV();
}
function closeURLModal(e) {
  if (e.target === document.getElementById('url-backdrop')) openURLModal();
}

function setURLType(type) {
  document.querySelectorAll('.url-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.service-type-group').forEach(g => g.classList.remove('visible'));
  document.getElementById('tab-' + type).classList.add('active');
  document.getElementById('grp-' + type).classList.add('visible');
  setURLStatus('', '');
  // Auto-load catalogue on first open
  if (type === 'catalogue' && _catalogueData.length === 0) loadCatalogueCSV();
  // Render AGOL pane
  if (type === 'agol' && typeof _agolUpdateUI === 'function') _agolUpdateUI();
}

function setURLStatus(msg, type) {
  const el = document.getElementById('url-status');
  if (!msg) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.className = type; el.textContent = msg;
}

// urlBaseName and _isValidURL defined in gaia-utils.js

// ── GEOJSON URL ──────────────────────────────────────
async function loadGeoJSONURL() {
  const url = document.getElementById('url-geojson').value.trim();
  const name = document.getElementById('url-geojson-name').value.trim() || urlBaseName(url);
  if (!url) { setURLStatus('Please enter a URL', 'error'); return; }
  if (!_isValidURL(url)) { setURLStatus('Invalid URL — must start with http:// or https://', 'error'); return; }
  setURLStatus('Fetching…', 'loading');
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(CONSTANTS.FETCH_TIMEOUT_MS) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + resp.statusText);
    let geojson = await resp.json();
    if (!geojson.features && geojson.type === 'Feature') geojson = { type:'FeatureCollection', features:[geojson] };
    if (!geojson.features) throw new Error('Response is not a valid GeoJSON FeatureCollection');
    addLayer(geojson, name, 'EPSG:4326', 'GeoJSON (URL)');
    setURLStatus('Loaded ' + geojson.features.length + ' features', 'success');
    document.getElementById('url-geojson').value = '';
  } catch(err) {
    setURLStatus('Error: ' + err.message + (err.message.includes('fetch') ? ' — check CORS' : ''), 'error');
  }
}

// ── WMS ──────────────────────────────────────────────
async function fetchWMSCapabilities() {
  const base = document.getElementById('url-wms').value.trim();
  if (!base) { setURLStatus('Please enter a WMS URL', 'error'); return; }
  if (!_isValidURL(base)) { setURLStatus('Invalid URL — must start with http:// or https://', 'error'); return; }
  setURLStatus('Fetching capabilities…', 'loading');
  const sep = base.includes('?') ? '&' : '?';
  const capURL = base + sep + 'SERVICE=WMS&REQUEST=GetCapabilities';
  try {
    const resp = await fetch(capURL, { signal: AbortSignal.timeout(CONSTANTS.FETCH_TIMEOUT_MS) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    const layerNodes = Array.from(xml.querySelectorAll('Layer > Name'));
    const layers = layerNodes.map(n => {
      const p = n.parentElement;
      const title = p.querySelector('Title') ? p.querySelector('Title').textContent : n.textContent;
      const crs = Array.from(p.querySelectorAll('CRS, SRS')).map(c => c.textContent).slice(0,3).join(', ');
      return { name: n.textContent, title, crs };
    }).filter(l => l.name);
    if (!layers.length) throw new Error('No named layers found in capabilities');
    wmsAvailableLayers = layers;
    const listHTML = layers.map(function(l, i) {
      return '<div class="url-layer-row"><input type="checkbox" id="wms-l-' + i + '" value="' + escHtml(l.name) + '"/><div><div class="url-layer-name">' + escHtml(l.title) + '</div><div class="url-layer-meta">' + escHtml(l.name) + (l.crs ? ' · ' + escHtml(l.crs) : '') + '</div></div></div>';
    }).join('');
    document.getElementById('url-layer-list-wrap').innerHTML = listHTML;
    document.getElementById('wms-layer-section').style.display = 'block';
    setURLStatus('Found ' + layers.length + ' layer' + (layers.length > 1 ? 's' : ''), 'success');
  } catch(err) {
    setURLStatus('Failed: ' + err.message + ' — service may block cross-origin requests', 'error');
  }
}

function loadWMSLayer() {
  const base = document.getElementById('url-wms').value.trim();
  const checked = Array.from(document.querySelectorAll('#url-layer-list-wrap input[type=checkbox]:checked'));
  if (!checked.length) { setURLStatus('Select at least one layer', 'error'); return; }
  const layerNames = checked.map(c => c.value).join(',');
  const format = document.getElementById('wms-format').value;
  const version = document.getElementById('wms-version').value;
  const found = wmsAvailableLayers.find(function(l){ return l.name === checked[0].value; });
  const layerTitle = checked.length === 1 ? (found ? found.title : layerNames) : (checked.length + ' WMS layers');
  // Build WMS tile URL for MapLibre raster source
  const wmsUrl = base + (base.includes('?') ? '&' : '?') +
    `service=WMS&request=GetMap&layers=${encodeURIComponent(layerNames)}&styles=&format=${encodeURIComponent(format)}&transparent=true&version=${version}&width=256&height=256&crs=EPSG:3857&bbox={bbox-epsg-3857}`;
  const idx = state.layers.length;
  const mapId = _layerMapId(idx);
  const layer = { name: layerTitle, format: 'WMS', color: '#5ab4f0', mapId, visible: true, isTile: true,
    tileUrl: wmsUrl, fields: {}, geojson: { features: [] }, geomType: 'Tile', sourceCRS: 'EPSG:4326', layerOpacity: 0.85 };
  state.layers.push(layer);
  if (state.map.isStyleLoaded()) _renderMapLayer(layer, idx);
  else state.map.once('load', () => _renderMapLayer(layer, idx));
  updateLayerList(); updateExportLayerList();
  setURLStatus('WMS layer added: ' + layerTitle, 'success');
  toast('WMS: ' + layerTitle, 'success');
}

// ── XYZ TILES ────────────────────────────────────────
function loadXYZLayer() {
  const url = document.getElementById('url-xyz').value.trim();
  const name = document.getElementById('url-xyz-name').value.trim() || 'Tile Layer';
  const opacity = parseFloat(document.getElementById('xyz-opacity').value) || 0.85;
  if (!url) { setURLStatus('Please enter a tile URL', 'error'); return; }
  const idx = state.layers.length;
  const mapId = _layerMapId(idx);
  const layer = { name, format: 'XYZ Tiles', color: '#bc8cff', mapId, visible: true, isTile: true,
    tileUrl: url, fields: {}, geojson: { features: [] }, geomType: 'Tile', sourceCRS: 'EPSG:4326', layerOpacity: opacity };
  state.layers.push(layer);
  if (state.map.isStyleLoaded()) _renderMapLayer(layer, idx);
  else state.map.once('load', () => _renderMapLayer(layer, idx));
  updateLayerList(); updateExportLayerList();
  setURLStatus('Tile layer added: ' + name, 'success');
  toast('Tile layer: ' + name, 'success');
}

// ── ARCGIS REST ──────────────────────────────────────
async function fetchArcGISInfo() {
  let url = document.getElementById('url-arcgis').value.trim().replace(/\/+$/, '');
  if (!url) { setURLStatus('Please enter a service URL', 'error'); return; }
  if (!_isValidURL(url)) { setURLStatus('Invalid URL — must start with http:// or https://', 'error'); return; }
  setURLStatus('Fetching service info…', 'loading');
  try {
    const resp = await fetch(url + '?f=json', { signal: AbortSignal.timeout(CONSTANTS.FETCH_TIMEOUT_MS) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const info = await resp.json();
    if (info.error) throw new Error(info.error.message);
    const geomType = (info.geometryType || '').replace('esriGeometry','') || 'Unknown';
    const fields = (info.fields || []).length;
    const name = info.name || info.serviceDescription || urlBaseName(url);
    document.getElementById('arcgis-layer-info').innerHTML =
      '<div style="color:var(--accent);font-weight:600;margin-bottom:4px;">' + escHtml(name) + '</div>' +
      '<div>Geometry: ' + escHtml(geomType) + ' &nbsp;·&nbsp; Fields: ' + fields + '</div>' +
      '<div style="color:var(--text3);margin-top:2px;">' + escHtml((info.description || info.copyrightText || '').substring(0,120)) + '</div>';
    document.getElementById('arcgis-info-section').style.display = 'block';
    document.getElementById('arcgis-where').value = '1=1';
    document.getElementById('url-arcgis').dataset.resolvedUrl = url;
    document.getElementById('url-arcgis').dataset.resolvedName = name;
    setURLStatus('Service info retrieved: ' + name, 'success');
  } catch(err) {
    setURLStatus('Failed: ' + err.message, 'error');
  }
}

async function loadArcGISLayer() {
  const url = (document.getElementById('url-arcgis').dataset.resolvedUrl || document.getElementById('url-arcgis').value).trim().replace(/\/+$/,'');
  const name = document.getElementById('url-arcgis').dataset.resolvedName || urlBaseName(url);
  const maxFeatures = parseInt(document.getElementById('arcgis-max-features').value);
  const where = document.getElementById('arcgis-where').value.trim() || '1=1';
  const extentOnly = document.getElementById('arcgis-extent-only').checked;
  if (!url) { setURLStatus('Please inspect the service first', 'error'); return; }

  const isQueryable = /\/(FeatureServer|MapServer)\/\d+$/i.test(url);

  if (isQueryable) {
    setURLStatus('Downloading features…', 'loading');
    try {
      // Build query params — optionally clip to current map extent
      const queryParams = { where, outFields:'*', outSR:'4326', f:'geojson', resultRecordCount:maxFeatures, returnGeometry:'true' };
      if (extentOnly && state.map) {
        const b = state.map.getBounds();
        queryParams.geometry = b.getWest() + ',' + b.getSouth() + ',' + b.getEast() + ',' + b.getNorth();
        queryParams.geometryType = 'esriGeometryEnvelope';
        queryParams.inSR = '4326';
        queryParams.spatialRel = 'esriSpatialRelIntersects';
      }
      const params = new URLSearchParams(queryParams);
      const resp = await fetch(url + '/query?' + params.toString());
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const geojson = await resp.json();
      if (geojson.error) throw new Error(geojson.error.message);
      if (!geojson.features) throw new Error('No features in response');
      const truncated = geojson.features.length >= maxFeatures;
      addLayer(geojson, name, 'EPSG:4326', 'ArcGIS REST');
      const extentNote = extentOnly ? ' within map extent' : '';
      const msg = 'Loaded ' + geojson.features.length + ' features' + extentNote + (truncated ? ' — limit reached, zoom in or increase max' : '');
      setURLStatus(msg, 'success');
      toast('ArcGIS: ' + name + ' (' + geojson.features.length + ' features)', 'success');
    } catch(err) {
      setURLStatus('Error: ' + err.message, 'error');
    }
  } else {
    setURLStatus('Adding as tile overlay…', 'loading');
    try {
      const tileURL = url + '/tile/{z}/{y}/{x}';
      const idx = state.layers.length;
      const mapId = _layerMapId(idx);
      const layer = { name, format: 'ArcGIS Tiles', color: '#f0883e', mapId, visible: true, isTile: true,
        tileUrl: tileURL, fields: {}, geojson: { features: [] }, geomType: 'Tile', sourceCRS: 'EPSG:4326', layerOpacity: 0.85 };
      state.layers.push(layer);
      if (state.map.isStyleLoaded()) _renderMapLayer(layer, idx);
      else state.map.once('load', () => _renderMapLayer(layer, idx));
      updateLayerList(); updateExportLayerList();
      setURLStatus('ArcGIS tile layer added', 'success');
      toast('ArcGIS tiles: ' + name, 'success');
    } catch(err) {
      setURLStatus('Error: ' + err.message, 'error');
    }
  }
}

