// ═══════════════════════════════════════════════════════
//  GAIA v1.0 — Core Application
// ═══════════════════════════════════════════════════════

const LAYER_COLORS = ['#39d353','#5ab4f0','#f0883e','#bc8cff','#e3b341','#f85149','#79c0ff','#56d364','#d2a8ff','#ffa657'];

const state = {
  layers: [], activeLayerIndex: -1, selectedFeatureIndex: -1,
  selectedFeatureIndices: new Set(),
  sortCol: null, sortDir: 1, filterText: '', showOnlySelected: false, columnOrder: null,
  exportFormat: 'geojson', displayCRS: 'EPSG:4326',
  map: null, basemapLayer: null,
};

// ── CRS DEFINITIONS ──
const CRS_DEFS = {
  'EPSG:4326':  '+proj=longlat +datum=WGS84 +no_defs',
  'EPSG:3857':  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs',
  'EPSG:4283':  '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs',
  'EPSG:7844':  '+proj=longlat +ellps=GRS80 +no_defs',
  // GDA94 MGA zones 49-56
  'EPSG:28349': '+proj=utm +zone=49 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:28350': '+proj=utm +zone=50 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:28351': '+proj=utm +zone=51 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:28352': '+proj=utm +zone=52 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:28353': '+proj=utm +zone=53 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:28354': '+proj=utm +zone=54 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:28355': '+proj=utm +zone=55 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  'EPSG:28356': '+proj=utm +zone=56 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
  // GDA2020 MGA zones 49-56
  'EPSG:7849':  '+proj=utm +zone=49 +south +ellps=GRS80 +units=m +no_defs',
  'EPSG:7850':  '+proj=utm +zone=50 +south +ellps=GRS80 +units=m +no_defs',
  'EPSG:7851':  '+proj=utm +zone=51 +south +ellps=GRS80 +units=m +no_defs',
  'EPSG:7852':  '+proj=utm +zone=52 +south +ellps=GRS80 +units=m +no_defs',
  'EPSG:7853':  '+proj=utm +zone=53 +south +ellps=GRS80 +units=m +no_defs',
  'EPSG:7854':  '+proj=utm +zone=54 +south +ellps=GRS80 +units=m +no_defs',
  'EPSG:7855':  '+proj=utm +zone=55 +south +ellps=GRS80 +units=m +no_defs',
  'EPSG:7856':  '+proj=utm +zone=56 +south +ellps=GRS80 +units=m +no_defs',
  'EPSG:32754': '+proj=utm +zone=54 +south +datum=WGS84 +units=m +no_defs',
  'EPSG:32755': '+proj=utm +zone=55 +south +datum=WGS84 +units=m +no_defs',
  'EPSG:32756': '+proj=utm +zone=56 +south +datum=WGS84 +units=m +no_defs',
  'EPSG:4269':  '+proj=longlat +datum=NAD83 +no_defs',
};
Object.entries(CRS_DEFS).forEach(([k,v]) => { try { proj4.defs(k, v); } catch(e){} });

// Is this CRS projected (metres)?
function isProjectedCRS(epsg) {
  const proj = CRS_DEFS[epsg] || '';
  return proj.includes('+units=m') || proj.includes('+proj=merc');
}

const BASEMAPS = {
  light:     { url:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attr:'© CARTO', maxZoom:19 },
  dark:      { url:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr:'© CARTO', maxZoom:19 },
  topo:      { url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr:'© OpenTopoMap', maxZoom:17 },
  satellite: { url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr:'© Esri', maxZoom:19 },
  none:      null,
};

// ── INIT ──
window.addEventListener('DOMContentLoaded', () => {
  // Restore saved session
  setTimeout(() => { loadSession(); }, 150);
  state.map = L.map('map', { zoomControl: true }).setView([-27, 133], 4);
  changeBasemap();

  state.map.on('mousemove', e => {
    const coordEl = document.getElementById('coord-display');
    const crs = state.displayCRS;
    const fromDef = CRS_DEFS['EPSG:4326'];
    const toDef   = CRS_DEFS[crs] || crs;
    let display;
    const isGeo = ['EPSG:4326','EPSG:4283','EPSG:7844','EPSG:4269'].includes(crs);
    if (isGeo) {
      display = `Lat: ${e.latlng.lat.toFixed(6)}  Lng: ${e.latlng.lng.toFixed(6)}  [${crs}]`;
    } else {
      try {
        const [x, y] = proj4(fromDef, toDef, [e.latlng.lng, e.latlng.lat]);
        if (isProjectedCRS(crs)) {
          display = `E: ${x.toFixed(1)} m  N: ${y.toFixed(1)} m  [${crs}]`;
        } else {
          display = `X: ${x.toFixed(6)}  Y: ${y.toFixed(6)}  [${crs}]`;
        }
      } catch(err) {
        display = `Lat: ${e.latlng.lat.toFixed(6)}  Lng: ${e.latlng.lng.toFixed(6)}`;
      }
    }
    coordEl.textContent = display;
  });
  state.map.on('mouseout', () => {
    document.getElementById('coord-display').textContent = 'Hover map to see coordinates';
  });

  // Scale / zoom display — updates on every zoom or pan
  function updateScaleDisplay() {
    const zoom = state.map.getZoom();
    const zoomEl = document.getElementById('zoom-input');
    const scaleEl = document.getElementById('scale-display');
    if (zoomEl && document.activeElement !== zoomEl) zoomEl.value = Math.round(zoom);
    if (scaleEl) {
      // Approximate scale denominator for Web Mercator at current centre latitude
      const lat = state.map.getCenter().lat;
      const metersPerPx = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
      const scaleDenom = Math.round(metersPerPx * 96 / 0.0254); // 96 dpi screen
      if (scaleDenom >= 1000000) {
        scaleEl.textContent = (scaleDenom / 1000000).toFixed(1) + 'M';
      } else if (scaleDenom >= 1000) {
        scaleEl.textContent = Math.round(scaleDenom / 1000) + 'k';
      } else {
        scaleEl.textContent = scaleDenom.toString();
      }
    }
  }
  state.map.on('zoomend moveend', updateScaleDisplay);
  setTimeout(updateScaleDisplay, 100); // initial value after map tiles settle

  // Right-click context menu
  state.map.on('contextmenu', function(e) {
    e.originalEvent.preventDefault();
    showMapCtxMenu(e);
  });

  // Click on empty map area → clear selection & close any open feature popup
  state.map.on('click', function(e) {
    if (e.originalEvent._featureClicked) return; // feature handlers set this flag
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
    // Close feature popup if open
    if (state._featurePopup) { state.map.closePopup(state._featurePopup); state._featurePopup = null; }
  });

  document.getElementById('crs-select').addEventListener('change', function() {
    document.getElementById('custom-crs-row').style.display = this.value === 'custom' ? 'block' : 'none';
  });

  // Resizable attr strip
  initAttrResize();
});

// ── RESIZABLE ATTR STRIP ──
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

// ── BASEMAP ──
function changeBasemap() {
  if (state.basemapLayer) { state.map.removeLayer(state.basemapLayer); state.basemapLayer = null; }
  const key = document.getElementById('basemap-select').value;
  const bm = BASEMAPS[key];
  if (bm) {
    state.basemapLayer = L.tileLayer(bm.url, { attribution: bm.attr, maxZoom: bm.maxZoom });
    state.basemapLayer.addTo(state.map);
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
  if (!val) return;
  try {
    if (val.toUpperCase().startsWith('EPSG:')) {
      state.displayCRS = val; toast(`Hover CRS set to ${val}`, 'info');
    } else {
      proj4.defs('CUSTOM:1', val); state.displayCRS = 'CUSTOM:1';
      CRS_DEFS['CUSTOM:1'] = val; toast('Custom proj4 applied', 'success');
    }
  } catch(e) { toast('Invalid CRS definition', 'error'); }
}

// ── DRAG AND DROP ──
function handleDragOver(e) { e.preventDefault(); document.getElementById('drop-zone').classList.add('drag-over'); }
function handleDragLeave(e) { document.getElementById('drop-zone').classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault(); document.getElementById('drop-zone').classList.remove('drag-over');
  processFileList(Array.from(e.dataTransfer.files));
}
function handleFileSelect(e) { processFileList(Array.from(e.target.files)); e.target.value=''; }

async function processFileList(files) {
  const groups = {};
  for (const f of files) {
    const ext = f.name.split('.').pop().toLowerCase();
    const base = f.name.replace(/\.[^.]+$/, '').toLowerCase();
    if (!groups[base]) groups[base] = {};
    groups[base][ext] = f;
  }
  for (const [base, exts] of Object.entries(groups)) {
    if (exts.shp)                      await loadShapefile(base, exts);
    else if (exts.kml)                  await loadKML(exts.kml);
    else if (exts.kmz)                  await loadKMZ(exts.kmz);
    else if (exts.geojson || exts.json) await loadGeoJSON(exts.geojson || exts.json);
    else if (exts.zip)                  await loadZIP(exts.zip);
    else if (exts.csv || exts.txt)      await loadCSV(exts.csv || exts.txt);
    else if (exts.gaia)                 await loadGAIASession(exts.gaia);
  }
}

// ── GAIA SESSION IMPORT ──
async function loadGAIASession(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !data.gaiaExport || data.version !== 1 || !Array.isArray(data.layers)) {
      toast('Invalid .gaia file — not a Gaia session export', 'error');
      return;
    }
    // Restore CRS
    if (data.displayCRS) {
      state.displayCRS = data.displayCRS;
      const crsEl = document.getElementById('current-crs-label');
      if (crsEl) crsEl.textContent = data.displayCRS;
    }
    // Load each layer
    let loaded = 0;
    for (const l of data.layers) {
      if (l.isTile) {
        // Tile layers — reload from URL if available
        if (l.tileUrl) {
          const tileLayer = L.tileLayer(l.tileUrl, { maxZoom: 22, attribution: '' });
          if (l.visible !== false) tileLayer.addTo(state.map);
          state.layers.push({ name: l.name, color: l.color || '#3498db', visible: l.visible !== false,
            format: l.format || 'Tile', isTile: true, tileUrl: l.tileUrl, tileType: l.tileType,
            leafletLayer: tileLayer, fields: {}, geomType: 'Tile' });
          loaded++;
        }
        continue;
      }
      if (!l.geojson || !Array.isArray(l.geojson.features)) continue;
      // Re-add the vector layer via addLayer
      const idx = state.layers.length;
      const color = l.color || LAYER_COLORS[idx % LAYER_COLORS.length];
      addLayer(l.geojson, l.name, l.sourceCRS || 'EPSG:4326', l.format || 'GeoJSON');
      // Restore extra symbology if saved
      const newLayer = state.layers[state.layers.length - 1];
      if (newLayer) {
        if (l.fillColor)    newLayer.fillColor    = l.fillColor;
        if (l.outlineColor) newLayer.outlineColor = l.outlineColor;
        if (l.noFill)       newLayer.noFill       = l.noFill;
        if (l.pointShape)   newLayer.pointShape   = l.pointShape;
        if (l.editable)     newLayer.editable     = l.editable;
        if (l.editGeomType) newLayer.editGeomType = l.editGeomType;
        if (l.visible === false) {
          newLayer.visible = false;
          state.map.removeLayer(newLayer.leafletLayer);
        }
        _applySymbologyToLeaflet(newLayer);
      }
      loaded++;
    }
    // Restore active layer
    if (data.activeLayerIndex >= 0 && data.activeLayerIndex < state.layers.length) {
      setActiveLayer(data.activeLayerIndex);
    }
    refreshLayerZOrder();
    toast(`Loaded Gaia session: ${loaded} layer${loaded !== 1 ? 's' : ''} restored`, 'success');
  } catch(err) {
    toast('Failed to load .gaia session: ' + err.message, 'error');
    console.error(err);
  }
}

// ── PROGRESS ──
function showProgress(title, sub, pct=0) {
  document.getElementById('progress-overlay').classList.add('show');
  document.getElementById('progress-title').textContent = title;
  document.getElementById('progress-sub').textContent = sub;
  document.getElementById('progress-bar').style.width = pct + '%';
}
function setProgress(pct, sub) {
  document.getElementById('progress-bar').style.width = pct + '%';
  if (sub) document.getElementById('progress-sub').textContent = sub;
}
function hideProgress() { document.getElementById('progress-overlay').classList.remove('show'); }

// ── LOADERS ──
async function loadShapefile(baseName, exts) {
  showProgress('Loading Shapefile', baseName, 10);
  try {
    const shpBuf = await exts.shp.arrayBuffer();
    const dbfBuf = exts.dbf ? await exts.dbf.arrayBuffer() : null;
    let prjText = null;
    if (exts.prj) prjText = await exts.prj.text();
    setProgress(40, 'Parsing geometry…');
    const geojson = await shapefile.read(shpBuf, dbfBuf);
    setProgress(80, 'Detecting CRS…');
    let sourceCRS = 'EPSG:4326';
    if (prjText) sourceCRS = parsePRJ(prjText);
    if (sourceCRS !== 'EPSG:4326') reprojectGeoJSON(geojson, sourceCRS, 'EPSG:4326');
    setProgress(95, 'Rendering…');
    addLayer(geojson, exts.shp.name.replace('.shp',''), sourceCRS, 'Shapefile');
    hideProgress();
    toast(`Loaded: ${exts.shp.name} (${geojson.features.length} features)`, 'success');
  } catch(err) { hideProgress(); toast(`Shapefile error: ${err.message}`, 'error'); console.error(err); }
}

async function loadKML(file) {
  showProgress('Loading KML', file.name, 30);
  try {
    const text = await file.text();
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    const geojson = toGeoJSON.kml(dom);
    setProgress(90, 'Rendering…');
    addLayer(geojson, file.name.replace('.kml',''), 'EPSG:4326', 'KML');
    hideProgress();
    toast(`Loaded: ${file.name} (${geojson.features.length} features)`, 'success');
  } catch(err) { hideProgress(); toast(`KML error: ${err.message}`, 'error'); }
}

async function loadKMZ(file) {
  showProgress('Loading KMZ', file.name, 20);
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    setProgress(50, 'Extracting KML…');
    const kmlEntry = Object.values(zip.files).find(f => f.name.endsWith('.kml'));
    if (!kmlEntry) throw new Error('No KML file found in KMZ');
    const text = await kmlEntry.async('string');
    const dom = new DOMParser().parseFromString(text, 'text/xml');
    const geojson = toGeoJSON.kml(dom);
    setProgress(90, 'Rendering…');
    addLayer(geojson, file.name.replace('.kmz',''), 'EPSG:4326', 'KMZ');
    hideProgress();
    toast(`Loaded: ${file.name} (${geojson.features.length} features)`, 'success');
  } catch(err) { hideProgress(); toast(`KMZ error: ${err.message}`, 'error'); }
}

async function loadGeoJSON(file) {
  showProgress('Loading GeoJSON', file.name, 30);
  try {
    const text = await file.text();
    let geojson = JSON.parse(text);
    if (!geojson.features && geojson.type === 'Feature') geojson = { type:'FeatureCollection', features:[geojson] };
    if (!geojson.features) throw new Error('Invalid GeoJSON');
    setProgress(90, 'Rendering…');
    addLayer(geojson, file.name.replace(/\.(geo)?json$/i,''), 'EPSG:4326', 'GeoJSON');
    hideProgress();
    toast(`Loaded: ${file.name} (${geojson.features.length} features)`, 'success');
  } catch(err) { hideProgress(); toast(`GeoJSON error: ${err.message}`, 'error'); }
}

async function loadZIP(file) {
  showProgress('Extracting ZIP', file.name, 10);
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entries = Object.values(zip.files).filter(f => !f.dir);
    setProgress(20, 'Scanning contents…');

    // ── Collect all recognised files grouped by type ──
    const kmlEntries  = entries.filter(f => f.name.toLowerCase().endsWith('.kml'));
    const gjEntries   = entries.filter(f => f.name.toLowerCase().endsWith('.geojson') || f.name.toLowerCase().endsWith('.json'));
    const shpEntries  = entries.filter(f => f.name.toLowerCase().endsWith('.shp'));

    let loadedCount = 0;
    const errors = [];
    const total = kmlEntries.length + gjEntries.length + shpEntries.length;

    if (total === 0) {
      hideProgress(); toast('No recognised GIS data found in ZIP', 'error'); return;
    }

    // ── Load all KML files ──
    for (let i = 0; i < kmlEntries.length; i++) {
      const entry = kmlEntries[i];
      try {
        setProgress(20 + Math.round(70*(loadedCount/total)), `KML ${i+1}/${kmlEntries.length}: ${entry.name}`);
        const text = await entry.async('string');
        const dom = new DOMParser().parseFromString(text, 'text/xml');
        const geojson = toGeoJSON.kml(dom);
        // Derive a clean layer name from the file path (strip folders and extension)
        const layerName = entry.name.replace(/^.*[\/]/, '').replace(/\.kml$/i, '');
        addLayer(geojson, layerName, 'EPSG:4326', 'KML');
        loadedCount++;
      } catch(e) { errors.push(entry.name + ': ' + e.message); }
    }

    // ── Load all GeoJSON files ──
    for (let i = 0; i < gjEntries.length; i++) {
      const entry = gjEntries[i];
      try {
        setProgress(20 + Math.round(70*(loadedCount/total)), `GeoJSON ${i+1}/${gjEntries.length}: ${entry.name}`);
        const text = await entry.async('string');
        let geojson = JSON.parse(text);
        if (!geojson.features && geojson.type === 'Feature') geojson = { type:'FeatureCollection', features:[geojson] };
        if (!geojson.features) throw new Error('Not a valid GeoJSON FeatureCollection');
        const layerName = entry.name.replace(/^.*[\/]/, '').replace(/\.(geo)?json$/i, '');
        addLayer(geojson, layerName, 'EPSG:4326', 'GeoJSON');
        loadedCount++;
      } catch(e) { errors.push(entry.name + ': ' + e.message); }
    }

    // ── Load all Shapefiles (group by basename to match .dbf/.prj) ──
    const shpDone = new Set();
    for (let i = 0; i < shpEntries.length; i++) {
      const shpEntry = shpEntries[i];
      const basePath = shpEntry.name.replace(/\.shp$/i, '');
      if (shpDone.has(basePath)) continue;
      shpDone.add(basePath);
      try {
        setProgress(20 + Math.round(70*(loadedCount/total)), `Shapefile ${i+1}/${shpEntries.length}: ${shpEntry.name}`);
        const shpBuf = await shpEntry.async('arraybuffer');
        // Match companion files case-insensitively
        const dbfEntry = entries.find(f => f.name.toLowerCase() === (basePath + '.dbf').toLowerCase());
        const prjEntry = entries.find(f => f.name.toLowerCase() === (basePath + '.prj').toLowerCase());
        const dbfBuf  = dbfEntry ? await dbfEntry.async('arraybuffer') : null;
        const prjText = prjEntry ? await prjEntry.async('string') : null;
        const geojson = await shapefile.read(shpBuf, dbfBuf);
        let sourceCRS = 'EPSG:4326';
        if (prjText) sourceCRS = parsePRJ(prjText);
        if (sourceCRS !== 'EPSG:4326') reprojectGeoJSON(geojson, sourceCRS, 'EPSG:4326');
        const layerName = shpEntry.name.replace(/^.*[\/]/, '').replace(/\.shp$/i, '');
        addLayer(geojson, layerName, sourceCRS, 'Shapefile');
        loadedCount++;
      } catch(e) { errors.push(shpEntry.name + ': ' + e.message); }
    }

    hideProgress();
    if (loadedCount > 0) {
      toast(`Loaded ${loadedCount} layer${loadedCount !== 1 ? 's' : ''} from ZIP: ${file.name}${errors.length ? ' (' + errors.length + ' failed)' : ''}`, loadedCount > 0 ? 'success' : 'error');
    }
    if (errors.length > 0) {
      errors.forEach(e => toast('ZIP error: ' + e, 'error'));
    }
  } catch(err) { hideProgress(); toast('ZIP error: ' + err.message, 'error'); }
}

// ── PRJ PARSER ──
function parsePRJ(prj) {
  const p = prj.toUpperCase();
  if (p.includes('GDA2020')) {
    if (p.includes('ZONE_49')||p.includes('ZONE 49')) return 'EPSG:7849';
    if (p.includes('ZONE_50')||p.includes('ZONE 50')) return 'EPSG:7850';
    if (p.includes('ZONE_51')||p.includes('ZONE 51')) return 'EPSG:7851';
    if (p.includes('ZONE_52')||p.includes('ZONE 52')) return 'EPSG:7852';
    if (p.includes('ZONE_53')||p.includes('ZONE 53')) return 'EPSG:7853';
    if (p.includes('ZONE_54')||p.includes('ZONE 54')) return 'EPSG:7854';
    if (p.includes('ZONE_55')||p.includes('ZONE 55')) return 'EPSG:7855';
    if (p.includes('ZONE_56')||p.includes('ZONE 56')) return 'EPSG:7856';
    return 'EPSG:7844';
  }
  if (p.includes('GDA_1994')||p.includes('GDA94')||p.includes('GDA 1994')) {
    if (p.includes('ZONE_49')||p.includes('ZONE 49')) return 'EPSG:28349';
    if (p.includes('ZONE_50')||p.includes('ZONE 50')) return 'EPSG:28350';
    if (p.includes('ZONE_51')||p.includes('ZONE 51')) return 'EPSG:28351';
    if (p.includes('ZONE_52')||p.includes('ZONE 52')) return 'EPSG:28352';
    if (p.includes('ZONE_53')||p.includes('ZONE 53')) return 'EPSG:28353';
    if (p.includes('ZONE_54')||p.includes('ZONE 54')) return 'EPSG:28354';
    if (p.includes('ZONE_55')||p.includes('ZONE 55')) return 'EPSG:28355';
    if (p.includes('ZONE_56')||p.includes('ZONE 56')) return 'EPSG:28356';
    return 'EPSG:4283';
  }
  if (p.includes('WGS_1984')||p.includes('WGS84')||p.includes('WGS 1984')) {
    if (p.includes('UTM')&&p.includes('ZONE')) {
      const m = p.match(/ZONE[_ ](\d+)/);
      if (m) { const z=parseInt(m[1]),s=p.includes('SOUTH'); return `EPSG:${s?32700+z:32600+z}`; }
    }
    if (p.includes('MERCATOR')||p.includes('MERC')) return 'EPSG:3857';
    return 'EPSG:4326';
  }
  if (p.includes('NAD_1983')||p.includes('NAD83')) return 'EPSG:4269';
  return 'EPSG:4326';
}

// ── REPROJECT ──
function reprojectGeoJSON(geojson, fromCRS, toCRS) {
  if (fromCRS === toCRS) return;
  const fromDef = CRS_DEFS[fromCRS]||fromCRS, toDef = CRS_DEFS[toCRS]||toCRS;
  function rc(coords) {
    if (typeof coords[0]==='number') { try { const [x,y]=proj4(fromDef,toDef,[coords[0],coords[1]]); return [x,y]; } catch(e){return coords;} }
    return coords.map(c=>rc(c));
  }
  for (const feat of geojson.features||[]) if(feat.geometry?.coordinates) feat.geometry.coordinates=rc(feat.geometry.coordinates);
}

// ── ADD LAYER ──
function addLayer(geojson, name, sourceCRS, format) {
  const color = LAYER_COLORS[state.layers.length % LAYER_COLORS.length];
  const idx = state.layers.length;
  const geomTypes = new Set();
  (geojson.features||[]).forEach(f => { if(f.geometry) geomTypes.add(f.geometry.type); });
  const geomType = [...geomTypes].join('/')||'Unknown';
  const isLine = [...geomTypes].some(t=>t.includes('Line'));
  const fields = {};
  (geojson.features||[]).forEach(f => {
    if(f.properties) Object.keys(f.properties).forEach(k=>{ if(!fields[k]) fields[k]=inferType(f.properties[k]); });
  });
  const normalStyle  = { color, fillColor:color, fillOpacity:0.25, weight:isLine?2.5:1.5, opacity:0.9 };
  const selectedStyle = { color:'#00ffff', fillColor:color, fillOpacity: 0.25, weight:3, opacity:1 };
  const hoverStyle   = { fillOpacity:0.4, weight:2.5 };

  const leafletLayer = L.geoJSON(geojson, {
    style: () => ({ ...normalStyle }),
    pointToLayer: (feat,latlng) => { const ic = _makePointIcon(color,'#fff',false,'circle',14); return L.marker(latlng,{icon:ic}); },
    onEachFeature: (feat, sublayer) => {
      const fi = (geojson.features||[]).indexOf(feat);
      const isPoint = feat.geometry?.type.includes('Point');

      sublayer.on('click', function(e) {
        const orig = e.originalEvent;
        const layerIdx = idx;

        if (orig.ctrlKey || orig.metaKey) {
          // Ctrl/Cmd — toggle this feature
          if (state.selectedFeatureIndices.has(fi)) {
            state.selectedFeatureIndices.delete(fi);
          } else {
            state.selectedFeatureIndices.add(fi);
            state.selectedFeatureIndex = fi;
          }
          state.activeLayerIndex = layerIdx;
          updateSelectionCount(); refreshMapSelection(layerIdx); renderTable(); scrollTableToFeature(fi);
        } else if (orig.shiftKey && state.selectedFeatureIndex >= 0 && state.activeLayerIndex === layerIdx) {
          // Shift — range select
          const lo = Math.min(state.selectedFeatureIndex, fi);
          const hi = Math.max(state.selectedFeatureIndex, fi);
          for (let i = lo; i <= hi; i++) state.selectedFeatureIndices.add(i);
          state.activeLayerIndex = layerIdx;
          updateSelectionCount(); refreshMapSelection(layerIdx); renderTable(); scrollTableToFeature(fi);
        } else {
          // Plain click — single select, inspect, fly to, popup
          state.activeLayerIndex = layerIdx;
          state.selectedFeatureIndex = fi;
          state.selectedFeatureIndices = new Set([fi]);
          const feat2 = (geojson.features||[])[fi];
          if (feat2) {
            showFeatureInspector(feat2);
            showFeaturePopup(state.map, e.latlng, feat2, color);
          }
          updateLayerList(); updateSelectionCount(); refreshMapSelection(layerIdx); renderTable(); scrollTableToFeature(fi);
          try { const b = sublayer.getBounds(); if(b.isValid()) state.map.flyToBounds(b,{duration:0.4,padding:[40,40]}); } catch(e2) {}
        }
        // Flag so map.on('click') knows a feature was clicked (don't clear selection)
        e.originalEvent._featureClicked = true;
        L.DomEvent.stopPropagation(e);
      });

      sublayer.on('mouseover', function() {
        if (!isPoint && !state.selectedFeatureIndices.has(fi)) {
          this.setStyle({ fillOpacity:0.4, weight:2.5 });
        }
      });
      sublayer.on('mouseout', function() {
        if (!isPoint) {
          // Always read current symbology from layer state so hover resets to current look
          refreshMapSelection(idx);
        }
      });
    }
  });
  leafletLayer.addTo(state.map);
  // New layers go to top of list (index 0) — refresh z-order
  setTimeout(refreshLayerZOrder, 50);
  state.layers.push({ geojson, name, sourceCRS, format, color, fields, geomType, leafletLayer, visible:true });
  updateLayerList(); updateExportLayerList(); updateSBLLayerList(); setActiveLayer(idx);
  try { state.map.fitBounds(leafletLayer.getBounds(), {padding:[30,30]}); } catch(e){}
}

// Re-apply normal/selected styles to all sublayers of a vector layer
function refreshMapSelection(layerIdx) {
  const layer = state.layers[layerIdx];
  if (!layer || layer.isTile) return;
  const color = layer.outlineColor || layer.color;
  const fillColor = layer.fillColor || layer.color;
  const noFill = layer.noFill || false;
  const geomTypes = new Set((layer.geojson.features||[]).map(f=>f.geometry?.type).filter(Boolean));
  const isLine = [...geomTypes].some(t=>t.includes('Line'));
  const normal   = { color, fillColor, fillOpacity: noFill ? 0 : 0.25, weight:isLine?2.5:1.5, opacity:0.9 };
  const selected = { color:'#00ffff', fillColor, fillOpacity: noFill ? 0 : 0.25, weight:3, opacity:1 };
  let fi = 0;
  layer.leafletLayer.eachLayer(function(sublayer) {
    const isSelected = state.selectedFeatureIndices.has(fi);
    const isPoint = layer.geojson.features[fi]?.geometry?.type.includes('Point');
    if (!isPoint) {
      sublayer.setStyle(isSelected ? selected : normal);
    } else {
      // Point markers (DivIcon) — swap icon for selected state
      if (sublayer.setIcon) {
        const s = isSelected ? 18 : 14;
        const outline = isSelected ? '#00ffff' : (layer.outlineColor || layer.color);
        sublayer.setIcon(_makePointIcon(fillColor, outline, noFill, layer.pointShape || 'circle', s));
      }
    }
    fi++;
  });
}

// Scroll the attribute table so the given feature row is visible
function scrollTableToFeature(featIdx) {
  const wrap = document.getElementById('attr-strip-table-wrap');
  if (!wrap) return;
  // Rows: first is thead (skip), then tbody rows are 0-indexed by feature
  const rows = wrap.querySelectorAll('tbody tr');
  // Find the row matching featIdx by looking at its row number cell
  for (const row of rows) {
    const numCell = row.querySelector('td:nth-child(2)');
    if (numCell && parseInt(numCell.textContent) === featIdx + 1) {
      row.scrollIntoView({ block:'nearest', behavior:'smooth' });
      break;
    }
  }
}

function inferType(val) {
  if(val===null||val===undefined) return 'null';
  if(typeof val==='boolean') return 'bool';
  if(typeof val==='number') return 'number';
  return 'string';
}

// ── LAYER LIST ──
function updateLayerList() {
  const el = document.getElementById('layer-list');
  document.getElementById('layer-count').textContent = state.layers.length ? `(${state.layers.length})` : '';
  if (!state.layers.length) { el.innerHTML='<div class="empty-state">No layers loaded.<br>Drop a file above to begin.</div>'; return; }
  el.innerHTML = state.layers.map((layer,i)=>`
    <div class="layer-item ${i===state.activeLayerIndex?'active':''}" onclick="setActiveLayer(${i})" style="opacity:${layer.visible?1:0.5}"
         draggable="true"
         ondragstart="handleLayerDragStart(event,${i})"
         ondragover="handleLayerDragOver(event,${i})"
         ondragleave="handleLayerDragLeave(event,${i})"
         ondrop="handleLayerDrop(event,${i})"
         ondragend="handleLayerDragEnd(event)">
      <div class="layer-drag-handle" title="Drag to reorder">⠿</div>
      <div class="layer-geom-icon" onclick="event.stopPropagation();openColorPickerForLayer(${i})" title="Click to change colour" style="cursor:pointer;">${layerGeomIcon(layer)}</div>
      <div class="layer-info">
        <div class="layer-name">${layer.name}</div>
        <div class="layer-meta">${layer.format}${layer.isTile ? ' · Tile Overlay' : ' · ' + (layer.geojson.features||[]).length + ' feat'}</div>
      </div>
      <div class="layer-actions">
        <button class="btn btn-ghost btn-sm" style="padding:2px 5px;font-size:11px;" onclick="event.stopPropagation();toggleLayerVisibility(${i})" title="${layer.visible?'Hide layer':'Show layer'}">${layer.visible?'👁':'🚫'}</button>
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:13px;letter-spacing:1px;" onclick="event.stopPropagation();openLayerCtxMenu(event,${i})" title="Options">⋯</button>
      </div>
    </div>`).join('');
}

// Layer drag-to-reorder state
let _layerDragSrc = -1;

function handleLayerDragStart(e, i) {
  _layerDragSrc = i;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', i);
  e.currentTarget.style.opacity = '0.4';
}

function handleLayerDragOver(e, i) {
  if (i === _layerDragSrc) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const rect = e.currentTarget.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  e.currentTarget.classList.remove('drag-over-top','drag-over-bottom');
  e.currentTarget.classList.add(e.clientY < mid ? 'drag-over-top' : 'drag-over-bottom');
}

function handleLayerDragLeave(e, i) {
  e.currentTarget.classList.remove('drag-over-top','drag-over-bottom');
}

function handleLayerDrop(e, i) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over-top','drag-over-bottom');
  if (_layerDragSrc < 0 || _layerDragSrc === i) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  let insertAt = e.clientY < mid ? i : i + 1;
  if (_layerDragSrc < insertAt) insertAt--;

  // Reorder layers array
  const moved = state.layers.splice(_layerDragSrc, 1)[0];
  state.layers.splice(insertAt, 0, moved);

  // Update active layer index
  if (state.activeLayerIndex === _layerDragSrc) {
    state.activeLayerIndex = insertAt;
  } else {
    // adjust if active layer shifted
    if (_layerDragSrc < state.activeLayerIndex && insertAt >= state.activeLayerIndex) state.activeLayerIndex--;
    else if (_layerDragSrc > state.activeLayerIndex && insertAt <= state.activeLayerIndex) state.activeLayerIndex++;
  }

  // Re-order Leaflet z-order: index 0 = top of list = top of map
  // Render bottom-to-top: last item in array first, first item last (= on top)
  const layersReversed = [...state.layers].reverse();
  layersReversed.forEach(l => { if (l.visible && l.leafletLayer) { state.map.removeLayer(l.leafletLayer); l.leafletLayer.addTo(state.map); } });

  updateLayerList(); updateExportLayerList(); updateSBLLayerList();
}

function handleLayerDragEnd(e) {
  e.currentTarget.style.opacity = '';
  document.querySelectorAll('.layer-item').forEach(el => el.classList.remove('drag-over-top','drag-over-bottom'));
  _layerDragSrc = -1;
}

function toggleLayerVisibility(i) {
  const l=state.layers[i]; l.visible=!l.visible;
  if(l.visible) { l.leafletLayer.addTo(state.map); refreshLayerZOrder(); } else state.map.removeLayer(l.leafletLayer);
  updateLayerList();
}

function removeLayer(i) {
  state.map.removeLayer(state.layers[i].leafletLayer);
  state.layers.splice(i,1);
  if(state.activeLayerIndex>=state.layers.length) state.activeLayerIndex=state.layers.length-1;
  updateLayerList(); updateExportLayerList();
  if(state.layers.length) setActiveLayer(state.activeLayerIndex); else clearStats();
}

function setActiveLayer(i) {
  // Clear selection highlights on previous active layer
  if (state.activeLayerIndex >= 0 && state.activeLayerIndex !== i) refreshMapSelection(state.activeLayerIndex);
  state.activeLayerIndex=i; state.selectedFeatureIndex=-1; state.selectedFeatureIndices=new Set(); state.showOnlySelected=false;
  const ssb2=document.getElementById('show-selected-btn');
  if(ssb2){ssb2.style.borderColor='';ssb2.style.color='';ssb2.style.background='';ssb2.textContent='◈ Show Selected';}
  updateLayerList(); updateStats(); updateSelectionCount(); updateAttrLayerSelect();
  state.columnOrder = null; // reset column order when active layer changes
  // Note: colWidths are kept per-layerIdx so they persist when switching back
  const layer = state.layers[i];
  if (layer && layer.isTile) {
    document.getElementById('attr-strip-table-wrap').innerHTML='<div class="empty-state">Tile layers do not have attribute data</div>';
    document.getElementById('table-count').textContent='';
    showFeatureInspector(null);
  } else {
    renderTable(); showFeatureInspector(null);
  }
}

// ── STATS ──
function updateStats() {
  const layer=state.layers[state.activeLayerIndex];
  if(!layer){clearStats();return;}
  document.getElementById('stats-section').style.display='block';
  const feats=layer.geojson.features||[];
  document.getElementById('stat-features').textContent=feats.length.toLocaleString();
  document.getElementById('stat-fields').textContent=Object.keys(layer.fields).length;
  const gt=layer.geomType||'–';
  const shortGT=gt.includes('Polygon')?'POLY':gt.includes('Line')?'LINE':gt.includes('Point')?'POINT':gt.substring(0,5).toUpperCase();
  document.getElementById('stat-geomtype').textContent=shortGT;
  document.getElementById('stat-crs').textContent=layer.sourceCRS.replace('EPSG:','');
  try {
    const b=layer.leafletLayer.getBounds();
    document.getElementById('bbox-section').style.display='block';
    document.getElementById('bb-w').textContent=b.getWest().toFixed(5);
    document.getElementById('bb-e').textContent=b.getEast().toFixed(5);
    document.getElementById('bb-s').textContent=b.getSouth().toFixed(5);
    document.getElementById('bb-n').textContent=b.getNorth().toFixed(5);
  } catch(e){}
  updateLegend();
}

function clearStats() {
  ['stat-features','stat-fields','stat-geomtype','stat-crs'].forEach(id=>document.getElementById(id).textContent='–');
  document.getElementById('bbox-section').style.display='none';
  document.getElementById('stats-section').style.display='none';
  document.getElementById('attr-strip-table-wrap').innerHTML='<div class="empty-state">Select a layer to view attributes</div>';
  document.getElementById('table-count').textContent='';
  const ls = document.getElementById('legend-section');
  if (ls) ls.style.display = 'none';
}

// ── LEGEND ──────────────────────────────────────
function updateLegend() {
  const legendSection = document.getElementById('legend-section');
  const legendBody    = document.getElementById('legend-body');
  if (!legendSection || !legendBody) return;

  const layer = state.layers[state.activeLayerIndex];
  if (!layer || layer.isTile) { legendSection.style.display = 'none'; return; }

  legendSection.style.display = 'block';

  const geomType = layer.geomType || '';
  const isPoint   = geomType.includes('Point');
  const isLine    = geomType.includes('Line');

  // If layer has classify classes, show classified legend
  if (layer.classified && layer.classifyClasses && layer.classifyClasses.length) {
    const field = layer.classifyField || '';
    const rows = layer.classifyClasses.map(c => {
      const swatch = isPoint
        ? `<div style="width:12px;height:12px;border-radius:50%;background:${c.color};border:1.5px solid rgba(0,0,0,0.2);flex-shrink:0;"></div>`
        : isLine
          ? `<div style="width:22px;height:3px;background:${c.color};border-radius:2px;flex-shrink:0;margin:4px 0;"></div>`
          : `<div style="width:18px;height:12px;border-radius:2px;background:${c.color};border:1px solid rgba(0,0,0,0.15);flex-shrink:0;"></div>`;
      return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;">
        ${swatch}
        <span style="font-family:var(--mono);font-size:9px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escHtml(String(c.label))}</span>
        <span style="font-family:var(--mono);font-size:8px;color:var(--text3);">${c.count}</span>
      </div>`;
    }).join('');
    legendBody.innerHTML = `
      <div style="font-family:var(--mono);font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">${escHtml(field)}</div>
      ${rows}`;
    return;
  }

  // Default single-colour legend
  const color      = layer.fillColor    || layer.color || '#3498db';
  const outline    = layer.outlineColor || layer.color || '#3498db';
  const noFill     = layer.noFill || false;
  const shape      = layer.pointShape || 'circle';

  let swatch;
  if (isPoint) {
    const size = 14;
    let svgShape;
    if (shape === 'square') {
      svgShape = `<rect x="2" y="2" width="${size-4}" height="${size-4}" fill="${noFill?'none':color}" stroke="${outline}" stroke-width="1.5" rx="1"/>`;
    } else if (shape === 'triangle') {
      svgShape = `<polygon points="${size/2},2 ${size-2},${size-2} 2,${size-2}" fill="${noFill?'none':color}" stroke="${outline}" stroke-width="1.5"/>`;
    } else {
      const r=(size-4)/2;
      svgShape = `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="${noFill?'none':color}" stroke="${outline}" stroke-width="1.5"/>`;
    }
    swatch = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0;">${svgShape}</svg>`;
  } else if (isLine) {
    swatch = `<div style="width:28px;height:3px;background:${color};border-radius:2px;flex-shrink:0;margin:5px 0;"></div>`;
  } else {
    swatch = `<div style="width:22px;height:14px;border-radius:3px;background:${noFill?'transparent':color};border:2px solid ${outline};flex-shrink:0;"></div>`;
  }

  legendBody.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:2px 0;">
      ${swatch}
      <span style="font-family:var(--mono);font-size:10px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(layer.name)}</span>
    </div>`;
}

// ── ATTRIBUTE TABLE ──
function renderTable() {
  const layer=state.layers[state.activeLayerIndex];
  if(!layer) return;
  const feats=layer.geojson.features||[];
  const fields=Object.keys(layer.fields);
  // For editable point layers, inject Latitude & Longitude as virtual columns
  const isEditablePoint = layer.editable && layer.editGeomType === 'Point';
  const displayFields = isEditablePoint ? ['Latitude','Longitude', ...fields] : fields;
  const filter=state.filterText.toLowerCase();
  let rows=feats.map((f,i)=>({feat:f,idx:i}));
  if(state.showOnlySelected) rows=rows.filter(({idx})=>state.selectedFeatureIndices.has(idx));
  if(filter) rows=rows.filter(({feat})=>Object.values(feat.properties||{}).some(v=>String(v??'').toLowerCase().includes(filter)));
  if(state.sortCol) rows.sort((a,b)=>{const va=a.feat.properties?.[state.sortCol]??'',vb=b.feat.properties?.[state.sortCol]??'';return va<vb?-state.sortDir:va>vb?state.sortDir:0;});
  const selNote = state.showOnlySelected && state.selectedFeatureIndices.size > 0 ? ' · selected' : '';
  document.getElementById('table-count').textContent=`(${rows.length}/${feats.length}${selNote})`;
  if(!displayFields.length){document.getElementById('attr-strip-table-wrap').innerHTML='<div class="empty-state">No attributes in this layer</div>';return;}
  const ftc={string:'ft-str',number:'ft-num',bool:'ft-bool',null:'ft-null'};
  const layerIdx = state.activeLayerIndex;

  // Apply column ordering
  function applyColOrder(fields) {
    if (!state.columnOrder || !state.columnOrder.length) return fields;
    const inOrder = state.columnOrder.filter(f => fields.includes(f));
    const rest = fields.filter(f => !inOrder.includes(f));
    return [...inOrder, ...rest];
  }
  const orderedFields = applyColOrder(displayFields);

  // Column widths — stored per-layer in state.colWidths[layerIdx]
  if (!state.colWidths) state.colWidths = {};
  if (!state.colWidths[layerIdx]) state.colWidths[layerIdx] = {};
  const widths = state.colWidths[layerIdx];

  // Build <colgroup> for resizable columns
  const colCkbox = `<col style="width:28px;min-width:28px;">`;
  const colNum   = `<col style="width:34px;min-width:34px;">`;
  const dataCols2 = orderedFields.map(f => {
    const w = widths[f] ? `${widths[f]}px` : '140px';
    return `<col data-col="${escHtml(f)}" style="width:${w};min-width:60px;">`;
  }).join('');
  const colgroup = `<colgroup>${colCkbox}${colNum}${dataCols2}</colgroup>`;

  // Build header — each th gets a resize handle on the right edge
  const headerCols = orderedFields.map(f => {
    const fEsc = escHtml(f);
    const isGeo = f === 'Latitude' || f === 'Longitude';
    const label = isGeo ? `<span style="opacity:0.3;font-size:9px;margin-right:1px;">⠿</span>${f} <span class="field-type ft-num">N</span>`
      : `<span style="opacity:0.3;font-size:9px;margin-right:1px;">⠿</span>${fEsc.substring(0,11)}${fEsc.length>11?'…':''}
         <span class="field-type ${ftc[layer.fields[f]]||''}">${layer.fields[f]?.[0]?.toUpperCase()||'?'}</span>
         ${state.sortCol===f?`<span style="opacity:0.5;margin-left:2px;">${state.sortDir>0?'↑':'↓'}</span>`:''}`;
    const clickH = isGeo ? '' : `onclick="sortTable('${fEsc}')"`;
    const colStyle = isGeo ? 'color:var(--teal);' : '';
    return `<th data-col="${fEsc}" draggable="true"
      ondragstart="colDragStart(event,'${fEsc}')" ondragover="colDragOver(event)"
      ondrop="colDrop(event,'${fEsc}')" ondragend="colDragEnd(event)"
      ${clickH} title="${fEsc}" style="position:relative;${colStyle}cursor:grab;">
      ${label}
      <span class="col-resize-handle" onmousedown="colResizeStart(event,'${fEsc}')" onclick="event.stopPropagation()" draggable="false"></span>
    </th>`;
  }).join('');

  // Build rows — double-click a td to expand/collapse it
  const bodyRows = rows.map(({feat,idx})=>{
    const coords = feat.geometry && feat.geometry.type === 'Point' ? feat.geometry.coordinates : null;
    const dataCells = orderedFields.map(f => {
      let raw, extraStyle = '';
      if (f === 'Latitude')  { raw = coords ? coords[1].toFixed(7) : '–'; extraStyle = 'color:var(--teal);font-family:var(--mono);'; }
      else if (f === 'Longitude') { raw = coords ? coords[0].toFixed(7) : '–'; extraStyle = 'color:var(--teal);font-family:var(--mono);'; }
      else { raw = String(feat.properties?.[f]??''); }
      const rawEsc = escHtml(raw);
      const rawQ   = rawEsc.replace(/'/g,'&#39;');
      return `<td style="${extraStyle}" title="${rawEsc}" ondblclick="toggleCellExpand(this)" oncontextmenu="return _copyTableCell(event,'${rawQ}')">${rawEsc}</td>`;
    }).join('');
    return `<tr onclick="handleRowClick(event,${layerIdx},${idx})" class="${state.selectedFeatureIndices.has(idx)?'selected':''}">
      <td style="text-align:center;" onclick="event.stopPropagation()"><input type="checkbox" style="accent-color:var(--accent);cursor:pointer;" ${state.selectedFeatureIndices.has(idx)?'checked':''} onchange="toggleRowSelect(${idx},this.checked)"/></td>
      <td style="color:var(--text3)">${idx+1}</td>
      ${dataCells}
    </tr>`;
  }).join('');

  const html=`<table>${colgroup}<thead><tr>
    <th style="width:28px;text-align:center;cursor:default;" title="Select all/none"><input type="checkbox" id="select-all-cb" style="accent-color:var(--accent);cursor:pointer;" onchange="toggleSelectAll(this.checked)"/></th>
    <th style="width:34px;cursor:default;">#</th>
    ${headerCols}
  </tr></thead><tbody>${bodyRows}</tbody></table>`;
  document.getElementById('attr-strip-table-wrap').innerHTML=html;

  // Wire up resize handles (they survive innerHTML replacement since we query fresh)
  _initColResizeHandles();

  // Sync select-all checkbox state
  const allCb = document.getElementById('select-all-cb');
  if (allCb) {
    allCb.checked = rows.length > 0 && rows.every(({idx}) => state.selectedFeatureIndices.has(idx));
    allCb.indeterminate = !allCb.checked && rows.some(({idx}) => state.selectedFeatureIndices.has(idx));
  }
}

function toggleShowOnlySelected() {
  state.showOnlySelected = !state.showOnlySelected;
  const btn = document.getElementById('show-selected-btn');
  if (btn) {
    if (state.showOnlySelected) {
      btn.style.borderColor = 'var(--accent)';
      btn.style.color = 'var(--accent)';
      btn.style.background = 'rgba(57,211,83,0.1)';
      btn.textContent = '◈ Selected Only';
    } else {
      btn.style.borderColor = '';
      btn.style.color = '';
      btn.style.background = '';
      btn.textContent = '◈ Show Selected';
    }
  }
  renderTable();
}

function _copyTableCell(e, value) {
  e.preventDefault();
  e.stopPropagation();
  // Decode HTML entities back to plain text
  const txt = value.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ');
  navigator.clipboard.writeText(txt).then(() => {
    toast('Copied: ' + (txt.length > 40 ? txt.slice(0,40)+'…' : txt), 'success');
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('Copied to clipboard', 'success');
  });
  return false;
}

function filterTable() { state.filterText=document.getElementById('search-input').value; renderTable(); }

// ── COLUMN RESIZE ──────────────────────────────────
let _colResizeState = null;

function colResizeStart(e, colName) {
  e.preventDefault();
  e.stopPropagation();
  const layerIdx = state.activeLayerIndex;
  if (!state.colWidths) state.colWidths = {};
  if (!state.colWidths[layerIdx]) state.colWidths[layerIdx] = {};

  // Find the <col> element for this column
  const wrap = document.getElementById('attr-strip-table-wrap');
  const col = wrap ? wrap.querySelector(`col[data-col="${CSS.escape(colName)}"]`) : null;
  const startW = col ? col.offsetWidth : 140;

  _colResizeState = { colName, layerIdx, startX: e.clientX, startW, col, handle: e.currentTarget };
  e.currentTarget.classList.add('resizing');

  document.addEventListener('mousemove', _colResizeMove);
  document.addEventListener('mouseup', _colResizeEnd, { once: true });
}

function _colResizeMove(e) {
  if (!_colResizeState) return;
  const { startX, startW, col, colName, layerIdx } = _colResizeState;
  const newW = Math.max(60, startW + (e.clientX - startX));
  state.colWidths[layerIdx][colName] = newW;
  // Apply directly to the <col> element without a full re-render
  if (col) col.style.width = newW + 'px';
}

function _colResizeEnd() {
  if (!_colResizeState) return;
  if (_colResizeState.handle) _colResizeState.handle.classList.remove('resizing');
  document.removeEventListener('mousemove', _colResizeMove);
  _colResizeState = null;
}

function _initColResizeHandles() {
  // Nothing extra needed — handles are wired inline via onmousedown in the HTML
}

// ── CELL EXPAND ON DOUBLE-CLICK ────────────────────
function toggleCellExpand(td) {
  // Collapse any previously expanded cell first
  const prev = document.querySelector('td.cell-expanded');
  if (prev && prev !== td) prev.classList.remove('cell-expanded');
  td.classList.toggle('cell-expanded');
}

// ── COLUMN DRAG-REORDER ──────────────────────────
let _colDragSrc = null;
function colDragStart(e, col) {
  _colDragSrc = col;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.style.opacity = '0.4';
}
function colDragEnd(e) { e.currentTarget.style.opacity = ''; }
function colDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function colDrop(e, targetCol) {
  e.preventDefault();
  if (!_colDragSrc || _colDragSrc === targetCol) return;
  const layer = state.layers[state.activeLayerIndex]; if (!layer) return;
  const isEP = layer.editable && layer.editGeomType === 'Point';
  const base = isEP ? ['Latitude','Longitude', ...Object.keys(layer.fields)] : Object.keys(layer.fields);
  // get current order
  function applyOrd(fields) {
    if (!state.columnOrder || !state.columnOrder.length) return fields;
    const inO = state.columnOrder.filter(f => fields.includes(f));
    const rest = fields.filter(f => !inO.includes(f));
    return [...inO, ...rest];
  }
  const cur = applyOrd(base);
  const fi = cur.indexOf(_colDragSrc), ti = cur.indexOf(targetCol);
  if (fi < 0 || ti < 0) return;
  cur.splice(fi, 1); cur.splice(ti, 0, _colDragSrc);
  state.columnOrder = cur;
  renderTable();
  _colDragSrc = null;
}
function sortTable(col) { if(state.sortCol===col)state.sortDir*=-1;else{state.sortCol=col;state.sortDir=1;} renderTable(); }

// ── FEATURE INSPECTOR ──
// handleRowClick — shift-click for range, ctrl/meta for toggle, plain click for single+inspect
function handleRowClick(event, layerIdx, featIdx) {
  const layer = state.layers[layerIdx]; if(!layer) return;
  if (event.shiftKey && state.selectedFeatureIndex >= 0) {
    // Range select
    const lo = Math.min(state.selectedFeatureIndex, featIdx);
    const hi = Math.max(state.selectedFeatureIndex, featIdx);
    for (let i = lo; i <= hi; i++) state.selectedFeatureIndices.add(i);
  } else if (event.ctrlKey || event.metaKey) {
    // Toggle this one
    if (state.selectedFeatureIndices.has(featIdx)) state.selectedFeatureIndices.delete(featIdx);
    else state.selectedFeatureIndices.add(featIdx);
    state.selectedFeatureIndex = featIdx;
  } else {
    // Single click — clear others, select this, fly to it
    state.selectedFeatureIndices.clear();
    state.selectedFeatureIndices.add(featIdx);
    state.selectedFeatureIndex = featIdx;
    const feat=(layer.geojson.features||[])[featIdx];
    if(feat) showFeatureInspector(feat);
    try { const tl=L.geoJSON(feat); const b=tl.getBounds(); if(b.isValid())state.map.flyToBounds(b,{duration:0.5,padding:[40,40]}); } catch(e){}
  }
  state.activeLayerIndex = layerIdx;
  updateSelectionCount(); refreshMapSelection(layerIdx); renderTable();
}

function toggleRowSelect(featIdx, checked) {
  if (checked) state.selectedFeatureIndices.add(featIdx);
  else state.selectedFeatureIndices.delete(featIdx);
  state.selectedFeatureIndex = featIdx;
  updateSelectionCount(); refreshMapSelection(state.activeLayerIndex); renderTable();
}

function toggleSelectAll(checked) {
  const layer = state.layers[state.activeLayerIndex]; if(!layer) return;
  const feats = layer.geojson.features || [];
  const filter = state.filterText.toLowerCase();
  // Only toggle rows currently visible (matching filter)
  feats.forEach((f, i) => {
    const visible = !filter || Object.values(f.properties||{}).some(v=>String(v??'').toLowerCase().includes(filter));
    if (visible) {
      if (checked) state.selectedFeatureIndices.add(i);
      else state.selectedFeatureIndices.delete(i);
    }
  });
  updateSelectionCount(); refreshMapSelection(state.activeLayerIndex); renderTable();
}

function selectFeature(layerIdx, featIdx) {
  state.activeLayerIndex=layerIdx; state.selectedFeatureIndex=featIdx;
  state.selectedFeatureIndices.clear(); state.selectedFeatureIndices.add(featIdx);
  const layer=state.layers[layerIdx]; if(!layer) return;
  const feat=(layer.geojson.features||[])[featIdx]; if(!feat) return;
  updateLayerList(); updateSelectionCount(); refreshMapSelection(layerIdx); renderTable(); scrollTableToFeature(featIdx); showFeatureInspector(feat);
}

function showFeatureInspector(feat) {
  const el=document.getElementById('feature-content');
  if(!feat){el.innerHTML=`<div class="no-selection"><div class="ns-icon">◎</div><div class="ns-text">Click a feature on the map<br>or a row in the table<br>to inspect its properties</div></div>`;return;}
  const geomType=feat.geometry?.type||'Unknown';
  const geomClass=geomType.includes('Polygon')?'geom-polygon':geomType.includes('Line')?'geom-line':'geom-point';
  const geomIcon=geomType.includes('Polygon')?'⬡':geomType.includes('Line')?'〜':'●';
  const props=feat.properties||{};
  const propRows=Object.entries(props).map(([k,v])=>{
    let cls='prop-val'; let display=escHtml(String(v??''));
    if(v===null||v===undefined){cls+=' null-val';display='null';}
    else if(typeof v==='number') cls+=' num-val';
    else if(typeof v==='boolean') cls+=' bool-val';
    return `<div class="prop-row"><div class="prop-key" title="${escHtml(k)}">${escHtml(k)}</div><div class="${cls}">${display}</div></div>`;
  }).join('');
  let coordInfo='';
  if(feat.geometry?.coordinates){
    const flat=flattenCoords(feat.geometry.coordinates);
    coordInfo=`<div class="prop-group"><div class="prop-group-title">Geometry</div>
    <div class="prop-row"><div class="prop-key">Type</div><div class="prop-val">${geomType}</div></div>
    <div class="prop-row"><div class="prop-key">Vertices</div><div class="prop-val num-val">${flat.length}</div></div></div>`;
  }
  el.innerHTML=`<div class="geom-badge ${geomClass}">${geomIcon} ${geomType}</div>${coordInfo}
  <div class="prop-group"><div class="prop-group-title">Properties (${Object.keys(props).length})</div>
  ${propRows||'<div style="color:var(--text3);font-size:11px;">No properties</div>'}</div>`;
}

function flattenCoords(coords){if(!Array.isArray(coords))return[];if(typeof coords[0]==='number')return[coords];return coords.flatMap(c=>flattenCoords(c));}

// ── EXPORT ──
let selectedExportFormat='geojson';
let exportScope='all'; // 'all' | 'selected'

function selectExportFormat(el,fmt){document.querySelectorAll('.export-opt').forEach(e=>e.classList.remove('selected'));el.classList.add('selected');selectedExportFormat=fmt;}

function setExportScope(scope) {
  exportScope = scope;
  const btnAll = document.getElementById('scope-all');
  const btnSel = document.getElementById('scope-sel');
  const active = 'border-color:var(--accent);color:var(--accent);background:rgba(57,211,83,0.08);';
  const inactive = '';
  if (scope === 'all') {
    btnAll.style.cssText = active; btnSel.style.cssText = inactive;
  } else {
    btnSel.style.cssText = active; btnAll.style.cssText = inactive;
  }
  updateSelectionCount();
}

function updateSelectionCount() {
  const el = document.getElementById('selection-count');
  if (!el) return;
  const n = state.selectedFeatureIndices.size;
  const layer = state.layers[state.activeLayerIndex];
  const total = layer ? (layer.geojson.features||[]).length : 0;
  if (n === 0) {
    el.style.display = 'none';
  } else {
    el.style.display = 'block';
    el.innerHTML = '<span style="color:var(--accent);">' + n + '</span> of ' + total + ' feature' + (total!==1?'s':'') + ' selected' + (exportScope==='selected'?' <span style="color:var(--orange);">— will export selected only</span>':'');
  }
}
function updateExportLayerList(){
  const sel=document.getElementById('export-layer-select');
  if(!state.layers.length){sel.innerHTML='<option value="">— no layers loaded —</option>';return;}
  sel.innerHTML=state.layers.map((l,i)=>`<option value="${i}">${l.name}</option>`).join('');
  sel.value=state.activeLayerIndex>=0?state.activeLayerIndex:0;
  updateAttrLayerSelect();
  updateSBLLayerList();
}
// exportData defined below

// ── EXPORT CONVERTERS ──
function geojsonToKML(gj,name){
  const feats=(gj.features||[]).map(feat=>{
    const props=feat.properties||{};
    const extData=Object.entries(props).map(([k,v])=>`<Data name="${escHtml(k)}"><value>${escHtml(String(v??''))}</value></Data>`).join('');
    const geom=feat.geometry; if(!geom) return '';
    function cToKML(coords,type){
      if(type.includes('Point')) return `<Point><coordinates>${coords[0]},${coords[1]},0</coordinates></Point>`;
      if(type.includes('LineString')){const c=coords.map(p=>`${p[0]},${p[1]},0`).join(' ');return `<LineString><coordinates>${c}</coordinates></LineString>`;}
      if(type.includes('Polygon')){const outer=coords[0].map(p=>`${p[0]},${p[1]},0`).join(' ');let kml=`<Polygon><outerBoundaryIs><LinearRing><coordinates>${outer}</coordinates></LinearRing></outerBoundaryIs>`;for(let i=1;i<coords.length;i++){const inner=coords[i].map(p=>`${p[0]},${p[1]},0`).join(' ');kml+=`<innerBoundaryIs><LinearRing><coordinates>${inner}</coordinates></LinearRing></innerBoundaryIs>`;}return kml+'</Polygon>';}
      return '';
    }
    const nameProp=props.name||props.NAME||props.Name||'';
    return `<Placemark><n>${escHtml(String(nameProp))}</n><ExtendedData>${extData}</ExtendedData>${cToKML(geom.coordinates,geom.type)}</Placemark>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><n>${escHtml(name)}</n>${feats}</Document></kml>`;
}

// geojsonToCSV defined below

function geojsonToWKT(gj){
  return (gj.features||[]).map((f,i)=>{
    const fields=Object.entries(f.properties||{}).map(([k,v])=>`${k}=${v}`).join('; ');
    let wkt=''; try{wkt=coordsToWKTGeom(f.geometry);}catch(e){wkt='GEOMETRYCOLLECTION EMPTY';}
    return `-- Feature ${i+1}: ${fields}\n${wkt}`;
  }).join('\n\n');
}

function coordsToWKTGeom(geom){
  if(!geom) return 'GEOMETRYCOLLECTION EMPTY';
  const{type,coordinates}=geom;
  const pts=c=>c.map(p=>`${p[0]} ${p[1]}`).join(', ');
  const ring=c=>`(${pts(c)})`;
  switch(type){
    case 'Point': return `POINT (${coordinates[0]} ${coordinates[1]})`;
    case 'MultiPoint': return `MULTIPOINT (${coordinates.map(c=>`(${c[0]} ${c[1]})`).join(', ')})`;
    case 'LineString': return `LINESTRING (${pts(coordinates)})`;
    case 'MultiLineString': return `MULTILINESTRING (${coordinates.map(r=>`(${pts(r)})`).join(', ')})`;
    case 'Polygon': return `POLYGON (${coordinates.map(r=>ring(r)).join(', ')})`;
    case 'MultiPolygon': return `MULTIPOLYGON (${coordinates.map(p=>`(${p.map(r=>ring(r)).join(', ')})`).join(', ')})`;
    default: return 'GEOMETRYCOLLECTION EMPTY';
  }
}

// ── UTILITIES ──
function escHtml(str){return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function setMapZoom(z) {
  if (!state.map || isNaN(z)) return;
  z = Math.max(0, Math.min(22, z));
  state.map.setZoom(z);
  const zi = document.getElementById('zoom-input');
  if (zi) zi.value = z;
}

function fitAll(){
  const ls=state.layers.filter(l=>l.visible); if(!ls.length) return;
  try{const g=L.featureGroup(ls.map(l=>l.leafletLayer));state.map.fitBounds(g.getBounds(),{padding:[30,30]});}catch(e){}
}

function clearAll(){
  state.layers.forEach(l=>state.map.removeLayer(l.leafletLayer));
  state.layers=[]; state.activeLayerIndex=-1; state.selectedFeatureIndex=-1; state.selectedFeatureIndices=new Set();
  updateLayerList(); updateExportLayerList(); clearStats(); showFeatureInspector(null);
  document.getElementById('search-input').value=''; state.filterText=''; state.showOnlySelected=false;
  const ssb=document.getElementById('show-selected-btn');
  if(ssb){ssb.style.borderColor='';ssb.style.color='';ssb.style.background='';ssb.textContent='◈ Show Selected';}
}

function toggleSection(header){
  const body=header.nextElementSibling;
  const collapsed=header.classList.toggle('collapsed');
  // Use display:none for reliable collapse regardless of content height
  body.style.display = collapsed ? 'none' : '';
  body.style.overflow = collapsed ? 'hidden' : '';
}

function toast(msg,type='info'){
  const icons={success:'✅',error:'❌',info:'ℹ️'};
  const el=document.createElement('div'); el.className=`toast ${type}`;
  el.innerHTML=`<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(()=>el.remove(),4500);
}

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
}

function setURLStatus(msg, type) {
  const el = document.getElementById('url-status');
  if (!msg) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.className = type; el.textContent = msg;
}

function urlBaseName(url) {
  try { return new URL(url).pathname.split('/').filter(Boolean).pop() || 'Layer'; }
  catch(e) { return 'Layer'; }
}

// ── GEOJSON URL ──────────────────────────────────────
async function loadGeoJSONURL() {
  const url = document.getElementById('url-geojson').value.trim();
  const name = document.getElementById('url-geojson-name').value.trim() || urlBaseName(url);
  if (!url) { setURLStatus('Please enter a URL', 'error'); return; }
  setURLStatus('Fetching…', 'loading');
  try {
    const resp = await fetch(url);
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
  setURLStatus('Fetching capabilities…', 'loading');
  const sep = base.includes('?') ? '&' : '?';
  const capURL = base + sep + 'SERVICE=WMS&REQUEST=GetCapabilities';
  try {
    const resp = await fetch(capURL);
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
  const wmsL = L.tileLayer.wms(base, { layers:layerNames, format:format, transparent:true, version:version, attribution:'WMS', opacity:0.85 });
  wmsL.addTo(state.map);
  state.layers.push({ name:layerTitle, format:'WMS', color:'#5ab4f0', leafletLayer:wmsL, visible:true, isTile:true, fields:{}, geojson:{features:[]}, geomType:'Tile', sourceCRS:'EPSG:4326' });
  updateLayerList(); updateExportLayerList();
  setURLStatus('WMS layer added: ' + layerTitle, 'success');
  toast('WMS: ' + layerTitle, 'success');
}

// ── XYZ TILES ────────────────────────────────────────
function loadXYZLayer() {
  const url = document.getElementById('url-xyz').value.trim();
  const name = document.getElementById('url-xyz-name').value.trim() || 'Tile Layer';
  const minZoom = parseInt(document.getElementById('xyz-minzoom').value) || 0;
  const maxZoom = parseInt(document.getElementById('xyz-maxzoom').value) || 19;
  const opacity = parseFloat(document.getElementById('xyz-opacity').value);
  if (!url) { setURLStatus('Please enter a tile URL', 'error'); return; }
  const tileL = L.tileLayer(url, { minZoom, maxZoom, opacity, attribution:name });
  tileL.addTo(state.map);
  state.layers.push({ name, format:'XYZ Tiles', color:'#bc8cff', leafletLayer:tileL, visible:true, isTile:true, fields:{}, geojson:{features:[]}, geomType:'Tile', sourceCRS:'EPSG:4326' });
  updateLayerList(); updateExportLayerList();
  setURLStatus('Tile layer added: ' + name, 'success');
  toast('Tile layer: ' + name, 'success');
}

// ── ARCGIS REST ──────────────────────────────────────
async function fetchArcGISInfo() {
  let url = document.getElementById('url-arcgis').value.trim().replace(/\/+$/, '');
  if (!url) { setURLStatus('Please enter a service URL', 'error'); return; }
  setURLStatus('Fetching service info…', 'loading');
  try {
    const resp = await fetch(url + '?f=json');
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
      const tileL = L.tileLayer(tileURL, { attribution:name, opacity:0.85 });
      tileL.addTo(state.map);
      state.layers.push({ name, format:'ArcGIS Tiles', color:'#f0883e', leafletLayer:tileL, visible:true, isTile:true, fields:{}, geojson:{features:[]}, geomType:'Tile', sourceCRS:'EPSG:4326' });
      updateLayerList(); updateExportLayerList();
      setURLStatus('ArcGIS tile layer added', 'success');
      toast('ArcGIS tiles: ' + name, 'success');
    } catch(err) {
      setURLStatus('Error: ' + err.message, 'error');
    }
  }
}

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
  if (widgetState.drawLayer) { state.map.removeLayer(widgetState.drawLayer); widgetState.drawLayer = null; }
  if (widgetState.previewLayer) { state.map.removeLayer(widgetState.previewLayer); widgetState.previewLayer = null; }
  widgetState.points = [];
  widgetState.mode = null;
  state.map.getContainer().style.cursor = '';
  state.map.off('click', handleWidgetClick);
  state.map.off('mousemove', handleWidgetMouseMove);
  state.map.off('dblclick', handleWidgetDblClick);
  state.map.doubleClickZoom.enable();
}

function handleWidgetClick(e) {
  if (!widgetState.mode) return;
  const sblGeomType = widgetState.mode === 'sbl' ? document.getElementById('sbl-geom-type').value : null;
  if (widgetState.mode === 'sbl' && sblGeomType === 'point') {
    runPointSelect(e.latlng); clearWidgetDraw(); return;
  }
  widgetState.points.push(e.latlng);
  redrawSBLOrMeasure();
  if (widgetState.mode === 'measure-distance' && widgetState.points.length >= 2) {
    updateMeasureResult();
  }
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
  if (widgetState.previewLayer) { state.map.removeLayer(widgetState.previewLayer); widgetState.previewLayer = null; }
  const pts = [...widgetState.points, e.latlng];
  const sblGeomPrev = widgetState.mode === 'sbl' ? document.getElementById('sbl-geom-type').value : null;
  const previewLine = widgetState.mode === 'measure-distance' || sblGeomPrev === 'line' || pts.length < 3;
  if (previewLine) {
    widgetState.previewLayer = L.polyline(pts, { color:'#39d353', weight:2, dashArray:'5,5', opacity:0.7 }).addTo(state.map);
  } else {
    widgetState.previewLayer = L.polygon(pts, { color:'#39d353', fillColor:'#39d353', fillOpacity:0.1, weight:2, dashArray:'5,5' }).addTo(state.map);
  }
}

function handleWidgetDblClick(e) {
  if (!widgetState.mode) return;
  L.DomEvent.stop(e);
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
  if (widgetState.drawLayer) { state.map.removeLayer(widgetState.drawLayer); widgetState.drawLayer = null; }
  const pts = widgetState.points;
  if (pts.length === 0) return;
  const sblGeom = widgetState.mode === 'sbl' ? document.getElementById('sbl-geom-type').value : null;
  const usePolyline = widgetState.mode === 'measure-distance' || sblGeom === 'line' || pts.length < 3;
  if (usePolyline) {
    widgetState.drawLayer = L.polyline(pts, { color:'#39d353', weight:2.5 }).addTo(state.map);
  } else {
    widgetState.drawLayer = L.polygon(pts, { color:'#39d353', fillColor:'#39d353', fillOpacity:0.1, weight:2.5 }).addTo(state.map);
  }
  pts.forEach(p => L.circleMarker(p, { radius:4, color:'#fff', fillColor:'#39d353', fillOpacity:1, weight:1.5 }).addTo(widgetState.drawLayer));
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
  state.map.off('click', handleWidgetClick);
  state.map.off('mousemove', handleWidgetMouseMove);
  state.map.off('dblclick', handleWidgetDblClick);
  state.map.doubleClickZoom.enable();
  if (widgetState.previewLayer) { state.map.removeLayer(widgetState.previewLayer); widgetState.previewLayer = null; }
  widgetState.mode = null;
  state.map.getContainer().style.cursor = '';
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
  state.map.getContainer().style.cursor = 'crosshair';
  state.map.doubleClickZoom.disable(); // prevent map zoom stealing our dblclick
  state.map.on('click', handleWidgetClick);
  state.map.on('mousemove', handleWidgetMouseMove);
  state.map.on('dblclick', handleWidgetDblClick); // both types support dblclick to finish
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
    updateSBLLayerList();
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
  state.map.getContainer().style.cursor = 'crosshair';
  if (geomType !== 'point') state.map.doubleClickZoom.disable();
  state.map.on('click', handleWidgetClick);
  state.map.on('mousemove', handleWidgetMouseMove);
  if (geomType !== 'point') state.map.on('dblclick', handleWidgetDblClick);
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
  state.map.doubleClickZoom.enable();
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
  
  function ptLL(c) { return L.latLng(c[1], c[0]); }
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
  if (widgetState.drawLayer) state.map.removeLayer(widgetState.drawLayer);
  widgetState.drawLayer = L.polyline(linePts, { color:'#39d353', weight:2.5 }).addTo(state.map);
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
  if (widgetState.drawLayer) state.map.removeLayer(widgetState.drawLayer);
  if (radiusM > 0) {
    widgetState.drawLayer = L.circle(clickLatLng, { radius:radiusM, color:'#39d353', fillColor:'#39d353', fillOpacity:0.08, weight:2, dashArray:'5,5' }).addTo(state.map);
  } else {
    widgetState.drawLayer = L.circleMarker(clickLatLng, { radius:7, color:'#fff', fillColor:'#39d353', fillOpacity:1, weight:2 }).addTo(state.map);
  }
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
  function ptLL(c) { return L.latLng(c[1], c[0]); }
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
  return L.latLng(a.lat+t*dy, a.lng+t*dx);
}

function featureContainsPoint(feat, pt) {
  if (!feat.geometry) return false;
  const type = feat.geometry.type;
  function ptLL(c) { return L.latLng(c[1], c[0]); }
  if (type==='Point') return haversine(pt, ptLL(feat.geometry.coordinates)) < 20;
  if (type==='MultiPoint') return feat.geometry.coordinates.some(c => haversine(pt, ptLL(c)) < 20);
  if (type==='LineString') return feat.geometry.coordinates.some((c,i,arr) => i && haversine(pt, closestPointOnSegment(pt, ptLL(arr[i-1]), ptLL(c))) < 20);
  if (type==='Polygon') return pointInPolygon(pt, feat.geometry.coordinates[0].map(c => ptLL(c)));
  if (type==='MultiPolygon') return feat.geometry.coordinates.some(poly => pointInPolygon(pt, poly[0].map(c => ptLL(c))));
  return false;
}

function featuresIntersect(featA, featB) {
  if (!featA.geometry || !featB.geometry) return false;
  function ptLL(c) { return L.latLng(c[1], c[0]); }
  const ptsA = flattenCoords(featA.geometry.coordinates).map(c => ptLL(c));
  const ptsB = flattenCoords(featB.geometry.coordinates).map(c => ptLL(c));
  const minLat=pts=>Math.min(...pts.map(p=>p.lat)), maxLat=pts=>Math.max(...pts.map(p=>p.lat));
  const minLng=pts=>Math.min(...pts.map(p=>p.lng)), maxLng=pts=>Math.max(...pts.map(p=>p.lng));
  if (maxLat(ptsA)<minLat(ptsB)||minLat(ptsA)>maxLat(ptsB)||maxLng(ptsA)<minLng(ptsB)||minLng(ptsA)>maxLng(ptsB)) return false;
  return ptsB.some(p => featureContainsPoint(featA, p)) || ptsA.some(p => featureContainsPoint(featB, p));
}

// flattenCoords defined above

function getFeatureCentroid(feat) {
  if (!feat.geometry) return L.latLng(0,0);
  const type = feat.geometry.type;
  const coords = feat.geometry.coordinates;
  function avgCoords(pts) {
    const sum = pts.reduce((a,c) => [a[0]+c[0], a[1]+c[1]], [0,0]);
    return L.latLng(sum[1]/pts.length, sum[0]/pts.length);
  }
  if (type === 'Point') return L.latLng(coords[1], coords[0]);
  if (type === 'MultiPoint') return avgCoords(coords);
  if (type === 'LineString') return avgCoords(coords);
  if (type === 'MultiLineString') return avgCoords(coords.flat());
  if (type === 'Polygon') return avgCoords(coords[0]);
  if (type === 'MultiPolygon') return avgCoords(coords.flat(2));
  return L.latLng(0,0);
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

function switchWidgetTab(tab) {
  ['measure','sbl','buffer'].forEach(t => {
    const tabEl = document.getElementById('wt-' + t);
    const paneEl = document.getElementById('wp-' + t);
    if (tabEl) tabEl.classList.toggle('active', t === tab);
    if (paneEl) paneEl.classList.toggle('visible', t === tab);
  });
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
  // Position near the click
  const x = Math.min(e.clientX, window.innerWidth - 180);
  const y = Math.min(e.clientY, window.innerHeight - 200);
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  menu.classList.add('visible');
  // Close on next click outside
  setTimeout(() => document.addEventListener('click', closeLayerCtxMenu, { once: true }), 10);
}

function closeLayerCtxMenu() {
  document.getElementById('layer-ctx-menu').classList.remove('visible');
}

function ctxZoomToLayer() {
  closeLayerCtxMenu();
  const layer = state.layers[ctxLayerIdx]; if (!layer) return;
  try { state.map.fitBounds(layer.leafletLayer.getBounds(), { padding:[30,30] }); } catch(e) {}
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
    updateLayerList(); updateExportLayerList(); updateAttrLayerSelect(); updateSBLLayerList();
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
  return haversine(p, L.latLng(a.lat + t*dy, a.lng + t*dx));
}

// Extract all edge segments from a feature as arrays of [A, B] L.LatLng pairs.
// Points return a single degenerate segment [pt, pt].
function getFeatureSegments(feat) {
  if (!feat.geometry) return [];
  const type = feat.geometry.type;
  const coords = feat.geometry.coordinates;
  const segs = [];
  function ptLL(c) { return L.latLng(c[1], c[0]); }

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
  const leafletLayer = L.geoJSON(geojson, {
    style: () => ({ color, fillColor: color, fillOpacity: 0.2, weight: 2, opacity: 1 }),
    pointToLayer: (feat, latlng) => L.circleMarker(latlng, { radius:7, fillColor:color, color:'#fff', weight:2, opacity:1, fillOpacity:0.9 }),
    onEachFeature: (feat, layer) => {
      // Capture feat reference; look up indices at click time so they're always current
      layer.on('click', function(e) {
        L.DomEvent.stopPropagation(e);
        const layerIdx = state.layers.findIndex(l => l.geojson === geojson);
        const fi = geojson.features.indexOf(feat);
        openFeatEditModal(layerIdx, fi);
      });
    }
  }).addTo(state.map);

  const layerEntry = {
    geojson, name, sourceCRS: 'EPSG:4326', format: 'Editable',
    color, fields: { Type:'string', Description:'string', Comment:'string' },
    geomType, leafletLayer, visible: true, editable: true, editGeomType: geomType
  };
  state.layers.push(layerEntry);
  const idx = state.layers.length - 1;
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
  state.map.getContainer().style.cursor = 'crosshair';
  state.map.doubleClickZoom.disable();
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
  state.map.doubleClickZoom.enable();
  state.map.getContainer().style.cursor = '';
  if (createState.drawPreview) { state.map.removeLayer(createState.drawPreview); createState.drawPreview = null; }
  if (createState.drawLine) { state.map.removeLayer(createState.drawLine); createState.drawLine = null; }
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
  if (mode === 'Point') {
    // Immediately place and open edit modal
    createState.drawPoints = [e.latlng];
    finaliseFeature();
    stopCreateDraw();
    return;
  }
  createState.drawPoints.push(e.latlng);
  redrawCreatePreview();
  _updateVertexCount();
}

function handleCreateMouseMove(e) {
  if (!createState.drawPoints.length) return;
  if (createState.drawPreview) { state.map.removeLayer(createState.drawPreview); createState.drawPreview = null; }
  const pts = [...createState.drawPoints, e.latlng];
  if (createState.drawMode === 'LineString') {
    createState.drawPreview = L.polyline(pts, { color:'#e3b341', weight:2, dashArray:'4,4', opacity:0.7 }).addTo(state.map);
  } else {
    createState.drawPreview = L.polygon(pts, { color:'#e3b341', fillColor:'#e3b341', fillOpacity:0.1, weight:2, dashArray:'4,4' }).addTo(state.map);
  }
}

function handleCreateDblClick(e) {
  L.DomEvent.stop(e);
  if (createState.drawPoints.length > 0) createState.drawPoints.pop(); // remove ghost point
  if (createState.drawMode === 'LineString' && createState.drawPoints.length >= 2) finaliseFeature();
  else if (createState.drawMode === 'Polygon' && createState.drawPoints.length >= 3) finaliseFeature();
  stopCreateDraw();
}

function redrawCreatePreview() {
  if (createState.drawLine) { state.map.removeLayer(createState.drawLine); createState.drawLine = null; }
  const pts = createState.drawPoints;
  if (!pts.length) return;
  const mode = createState.drawMode;
  if (mode === 'LineString') {
    createState.drawLine = L.polyline(pts, { color:'#e3b341', weight:2.5 }).addTo(state.map);
  } else if (mode === 'Polygon') {
    createState.drawLine = L.polygon(pts, { color:'#e3b341', fillColor:'#e3b341', fillOpacity:0.12, weight:2.5 }).addTo(state.map);
  }
  pts.forEach(p => L.circleMarker(p, { radius:4, color:'#fff', fillColor:'#e3b341', fillOpacity:1, weight:1.5 }).addTo(createState.drawLine));
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
  layer.leafletLayer.addData(feat);
  // Push to undo stack, clear redo stack
  createState.featureUndoStack.push({ layerIdx, featJson: JSON.stringify(feat) });
  createState.featureRedoStack = [];
  updateCreateLayerList();
  updateLayerList();

  // Immediately open edit modal for the new feature
  const fi = layer.geojson.features.length - 1;
  openFeatEditModal(layerIdx, fi);

  // Clean up preview layers
  if (createState.drawLine) { state.map.removeLayer(createState.drawLine); createState.drawLine = null; }
  if (createState.drawPreview) { state.map.removeLayer(createState.drawPreview); createState.drawPreview = null; }
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
          layer.leafletLayer.clearLayers();
          layer.geojson.features.forEach(f => layer.leafletLayer.addData(f));
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
  layer.leafletLayer.clearLayers();
  layer.geojson.features.forEach(f => layer.leafletLayer.addData(f));
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
  const circles = coords2d.map(c => circleToPolygon(L.latLng(c[1], c[0]), radiusM));
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
  function ptLL(c) { return L.latLng(c[1], c[0]); }

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
  state.map.getContainer().style.cursor = 'crosshair';
  state.map.doubleClickZoom.disable();
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
  state.map.doubleClickZoom.enable();
  state.map.getContainer().style.cursor = '';
  if (createState.drawPreview) { state.map.removeLayer(createState.drawPreview); createState.drawPreview = null; }
  document.getElementById('buffer-draw-btn').style.display = 'block';
  document.getElementById('buffer-end-btn').style.display = 'none';
  createState.drawMode = null;
  // Keep bufferShapeLayer visible so user can see what they drew
}

function handleBufferDrawClick(e) {
  createState.drawPoints.push(e.latlng);
  if (createState.bufferShapeLayer) { state.map.removeLayer(createState.bufferShapeLayer); }
  createState.bufferShapeLayer = L.polygon(createState.drawPoints, { color:'#5ab4f0', fillColor:'#5ab4f0', fillOpacity:0.1, weight:2 }).addTo(state.map);
}
function handleBufferDrawMove(e) {
  if (!createState.drawPoints.length) return;
  if (createState.drawPreview) { state.map.removeLayer(createState.drawPreview); createState.drawPreview = null; }
  createState.drawPreview = L.polygon([...createState.drawPoints, e.latlng], { color:'#5ab4f0', weight:2, dashArray:'4,4', fillOpacity:0.05 }).addTo(state.map);
}
function handleBufferDrawDblClick(e) {
  L.DomEvent.stop(e);
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
  if (createState.bufferShapeLayer) { state.map.removeLayer(createState.bufferShapeLayer); createState.bufferShapeLayer = null; }
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
  state.map.getContainer().style.cursor = 'crosshair';
  state.map.doubleClickZoom.disable();
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
  state.map.doubleClickZoom.enable();
  state.map.getContainer().style.cursor = '';
  if (wBufferState.previewLayer) { state.map.removeLayer(wBufferState.previewLayer); wBufferState.previewLayer = null; }
  wBufferState.mode = null;
}

function handleWBufferClick(e) {
  const mode = wBufferState.mode;
  if (mode === 'point') {
    wBufferState.drawPoints = [e.latlng];
    if (wBufferState.shapeLayer) state.map.removeLayer(wBufferState.shapeLayer);
    wBufferState.shapeLayer = L.circleMarker(e.latlng, { radius:8, color:'#5ab4f0', fillColor:'#5ab4f0', fillOpacity:0.6, weight:2 }).addTo(state.map);
    endWBufferDraw();
    return;
  }
  wBufferState.drawPoints.push(e.latlng);
  if (wBufferState.shapeLayer) state.map.removeLayer(wBufferState.shapeLayer);
  if (mode === 'line') {
    wBufferState.shapeLayer = L.polyline(wBufferState.drawPoints, { color:'#5ab4f0', weight:2.5 }).addTo(state.map);
  } else {
    wBufferState.shapeLayer = L.polygon(wBufferState.drawPoints, { color:'#5ab4f0', fillColor:'#5ab4f0', fillOpacity:0.1, weight:2 }).addTo(state.map);
  }
}
function handleWBufferMove(e) {
  if (!wBufferState.drawPoints.length) return;
  if (wBufferState.previewLayer) { state.map.removeLayer(wBufferState.previewLayer); wBufferState.previewLayer = null; }
  const mode = wBufferState.mode;
  if (mode === 'line') {
    wBufferState.previewLayer = L.polyline([...wBufferState.drawPoints, e.latlng], { color:'#5ab4f0', weight:2, dashArray:'4,4', opacity:0.6 }).addTo(state.map);
  } else {
    wBufferState.previewLayer = L.polygon([...wBufferState.drawPoints, e.latlng], { color:'#5ab4f0', weight:2, dashArray:'4,4', fillOpacity:0.05 }).addTo(state.map);
  }
}
function handleWBufferDblClick(e) {
  L.DomEvent.stop(e);
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
  if (wBufferState.shapeLayer) { state.map.removeLayer(wBufferState.shapeLayer); wBufferState.shapeLayer = null; }
  wBufferState.drawPoints = [];
  const el = document.getElementById('wbuffer-result');
  el.style.display = 'block'; el.textContent = '✓ Created: ' + layerName + ' (' + buffered.length + ' features)';
  toast('Buffer layer created: ' + layerName, 'success');
}

// ══════════════════════════════════════════════════════════
//  SESSION PERSISTENCE (localStorage)
// ══════════════════════════════════════════════════════════
const SESSION_KEY = 'gaia_v1_session';

function saveSession() {
  try {
    const sessionData = {
      version: 1,
      activeLayerIndex: state.activeLayerIndex,
      displayCRS: state.displayCRS,
      layers: state.layers.map(layer => {
        if (layer.isTile) {
          // Tile layers: save metadata only
          return {
            isTile: true,
            name: layer.name,
            color: layer.color,
            visible: layer.visible,
            format: layer.format || 'Tile',
            tileUrl: layer.tileUrl || null,
            tileType: layer.tileType || null,
          };
        }
        // Vector layers: save GeoJSON + metadata
        return {
          isTile: false,
          name: layer.name,
          color: layer.color,
          visible: layer.visible,
          format: layer.format,
          sourceCRS: layer.sourceCRS,
          geomType: layer.geomType,
          editable: layer.editable || false,
          editGeomType: layer.editGeomType || null,
          fields: layer.fields,
          geojson: layer.geojson,
        };
      }),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
  } catch(e) {
    console.warn('Session save failed:', e);
  }
}

function toggleSavePopup(e) {
  e.stopPropagation();
  const popup = document.getElementById('save-popup');
  const isOpen = popup.style.display !== 'none';
  popup.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    // close when clicking anywhere else
    setTimeout(() => document.addEventListener('click', _closeSavePopup, { once: true }), 10);
  }
}
function _closeSavePopup() {
  const p = document.getElementById('save-popup');
  if (p) p.style.display = 'none';
}

function doSaveLocally() {
  document.getElementById('save-popup').style.display = 'none';
  saveSession();
  const btn = document.getElementById('save-session-btn');
  if (btn) {
    btn.textContent = '✓ Saved';
    btn.style.color = 'var(--accent)';
    setTimeout(() => { btn.textContent = '💾 Save'; btn.style.color = '#e8f4fb'; }, 2000);
  }
  toast('Session saved — will restore on next open', 'success');
}

function doExportSession() {
  document.getElementById('save-popup').style.display = 'none';
  if (!state.layers.length) { toast('No layers to export', 'error'); return; }
  try {
    const sessionData = {
      version: 1,
      gaiaExport: true,
      exportedAt: new Date().toISOString(),
      activeLayerIndex: state.activeLayerIndex,
      displayCRS: state.displayCRS,
      layers: state.layers.map(layer => {
        if (layer.isTile) {
          return { isTile: true, name: layer.name, color: layer.color, visible: layer.visible,
                   format: layer.format || 'Tile', tileUrl: layer.tileUrl || null, tileType: layer.tileType || null };
        }
        return { isTile: false, name: layer.name, color: layer.color, fillColor: layer.fillColor || null,
                 outlineColor: layer.outlineColor || null, noFill: layer.noFill || false,
                 pointShape: layer.pointShape || 'circle',
                 visible: layer.visible, format: layer.format, sourceCRS: layer.sourceCRS,
                 geomType: layer.geomType, editable: layer.editable || false,
                 editGeomType: layer.editGeomType || null, fields: layer.fields, geojson: layer.geojson };
      }),
    };
    const json = JSON.stringify(sessionData);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gaia-session-' + new Date().toISOString().slice(0,10) + '.gaia';
    a.click();
    URL.revokeObjectURL(url);
    toast('Session exported as .gaia file', 'success');
  } catch(err) {
    toast('Export failed: ' + err.message, 'error');
  }
}

function manualSaveSession() { doSaveLocally(); }

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.layers)) return false;

    // Restore CRS
    if (data.displayCRS) {
      state.displayCRS = data.displayCRS;
      const sel = document.getElementById('crs-select');
      if (sel) sel.value = data.displayCRS;
      updateDisplayCRS();
    }

    // Restore layers
    data.layers.forEach(saved => {
      if (saved.isTile) {
        // Tile layers need the URL to reconstruct — skip if no URL saved
        if (!saved.tileUrl) return;
        let leafletLayer;
        if (saved.tileType === 'wms') {
          try { leafletLayer = L.tileLayer(saved.tileUrl).addTo(state.map); } catch(e) { return; }
        } else {
          try { leafletLayer = L.tileLayer(saved.tileUrl).addTo(state.map); } catch(e) { return; }
        }
        if (!saved.visible) state.map.removeLayer(leafletLayer);
        state.layers.push({ isTile:true, name:saved.name, color:saved.color, visible:saved.visible, format:saved.format||'Tile', tileUrl:saved.tileUrl, tileType:saved.tileType, leafletLayer });
      } else {
        // Vector layer
        const geojson = saved.geojson;
        if (!geojson) return;
        const color = saved.color;
        const editable = saved.editable || false;

        const leafletLayer = L.geoJSON(geojson, {
          style: () => ({ color, fillColor: color, fillOpacity: 0.15, weight: 2, opacity: 1 }),
          pointToLayer: (feat, latlng) => { const ic = _makePointIcon(color, '#fff', false, layer.pointShape||'circle', 14); return L.marker(latlng,{icon:ic}); },
          onEachFeature: (feat, sublayer) => {
            const layerIdx = state.layers.length; // capture at add time — will be correct on click via closure
            const fi = (geojson.features||[]).indexOf(feat);
            sublayer.on('click', function(e) {
              L.DomEvent.stopPropagation(e);
              if (editable) { openFeatEditModal(state.layers.findIndex(l=>l.geojson===geojson), (geojson.features||[]).indexOf(feat)); return; }
              const li = state.layers.findIndex(l => l.geojson === geojson);
              const fi2 = (geojson.features||[]).indexOf(feat);
              if (li < 0) return;
              const isPoint = feat.geometry && feat.geometry.type === 'Point';
              const normalStyle = { color, fillColor:color, fillOpacity:0.15, weight:2 };
              const selectedStyle = { color:'#fff', fillColor:color, fillOpacity:0.4, weight:3 };
              const hoverStyle = { color:'#fff', fillColor:color, fillOpacity:0.25, weight:2.5 };
              if (e.originalEvent.ctrlKey || e.originalEvent.metaKey) {
                if (state.selectedFeatureIndices.has(fi2)) state.selectedFeatureIndices.delete(fi2);
                else state.selectedFeatureIndices.add(fi2);
              } else if (e.originalEvent.shiftKey && state.selectedFeatureIndex >= 0 && state.activeLayerIndex === li) {
                const lo=Math.min(state.selectedFeatureIndex,fi2), hi=Math.max(state.selectedFeatureIndex,fi2);
                for (let k=lo;k<=hi;k++) state.selectedFeatureIndices.add(k);
              } else {
                state.activeLayerIndex = li;
                state.selectedFeatureIndices = new Set([fi2]);
              }
              state.selectedFeatureIndex = fi2;
              // Show attribute popup on plain click
              if (!e.originalEvent.ctrlKey && !e.originalEvent.metaKey && !e.originalEvent.shiftKey) {
                showFeaturePopup(state.map, e.latlng, feat, color);
              }
              e.originalEvent._featureClicked = true;
              refreshMapSelection(li); updateSelectionCount(); renderTable(); scrollTableToFeature(fi2);
              if (!isPoint && !state.selectedFeatureIndices.has(fi2)) this.setStyle(hoverStyle);
            });
            if (!editable) {
              sublayer.on('mouseover', function() { if (!state.selectedFeatureIndices.has(fi)) this.setStyle({ color:'#fff', fillColor:color, fillOpacity:0.25, weight:2.5 }); });
              sublayer.on('mouseout', function() { this.setStyle(state.selectedFeatureIndices.has(fi) ? { color:'#fff', fillColor:color, fillOpacity:0.4, weight:3 } : { color, fillColor:color, fillOpacity:0.15, weight:2 }); });
            }
          }
        }).addTo(state.map);

        if (!saved.visible) state.map.removeLayer(leafletLayer);

        state.layers.push({
          isTile: false, name: saved.name, color, visible: saved.visible,
          format: saved.format, sourceCRS: saved.sourceCRS, geomType: saved.geomType,
          editable, editGeomType: saved.editGeomType,
          fields: saved.fields, geojson, leafletLayer,
        });
        if (editable) createState.editLayerIndices.add(state.layers.length-1);
      }
    });

    if (data.layers.length) {
      const ai = Math.min(data.activeLayerIndex||0, state.layers.length-1);
      state.activeLayerIndex = ai;
      setActiveLayer(ai);
      try { state.map.fitBounds(state.layers[ai].leafletLayer.getBounds(), { padding:[40,40] }); } catch(e){}
    }

    updateLayerList(); updateExportLayerList(); updateSBLLayerList(); updateCreateLayerList();
    setTimeout(refreshLayerZOrder, 150);
    toast('Session restored (' + state.layers.length + ' layer' + (state.layers.length!==1?'s':'') + ')', 'success');
    return true;
  } catch(e) {
    console.warn('Session load failed:', e);
    return false;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  // Also remove all layers from the map and reset state
  state.layers.forEach(l => { if (l.leafletLayer) state.map.removeLayer(l.leafletLayer); });
  state.layers = [];
  state.activeLayerIndex = -1;
  state.selectedFeatureIndices = new Set();
  state.selectedFeatureIndex = -1;
  state.columnOrder = null;
  updateLayerList();
  updateExportLayerList();
  updateSBLLayerList();
  updateAttrLayerSelect();
  document.getElementById('attr-strip-table-wrap').innerHTML = '<div class="empty-state">Select a layer to view attributes</div>';
  document.getElementById('table-count').textContent = '';
  showFeatureInspector(null);
  toast('Session cleared — all layers removed', 'info');
}


// ── MAP RIGHT-CLICK CONTEXT MENU ──────────────────────────────────────
let _mapCtxLatLng = null;

function showMapCtxMenu(e) {
  _mapCtxLatLng = e.latlng;
  const menu = document.getElementById('map-ctx-menu');
  const lat = e.latlng.lat.toFixed(7), lng = e.latlng.lng.toFixed(7);
  document.getElementById('map-ctx-coords-display').textContent = lat + ', ' + lng;
  const x = Math.min(e.originalEvent.clientX, window.innerWidth - 220);
  const y = Math.min(e.originalEvent.clientY, window.innerHeight - 200);
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.style.display = 'block';
  setTimeout(() => document.addEventListener('click', closeMapCtxMenu, { once: true }), 10);
}

function closeMapCtxMenu() {
  document.getElementById('map-ctx-menu').style.display = 'none';
}

function mapCtxCopyLatLng() {
  if (!_mapCtxLatLng) return;
  const txt = _mapCtxLatLng.lat.toFixed(7) + ', ' + _mapCtxLatLng.lng.toFixed(7);
  navigator.clipboard.writeText(txt).then(() => toast('Copied: ' + txt, 'success')).catch(() => { prompt('Copy coordinates:', txt); });
  closeMapCtxMenu();
}

function mapCtxCopyLngLat() {
  if (!_mapCtxLatLng) return;
  const txt = _mapCtxLatLng.lng.toFixed(7) + ', ' + _mapCtxLatLng.lat.toFixed(7);
  navigator.clipboard.writeText(txt).then(() => toast('Copied: ' + txt, 'success')).catch(() => { prompt('Copy coordinates:', txt); });
  closeMapCtxMenu();
}

function mapCtxCopyDMS() {
  if (!_mapCtxLatLng) return;
  function toDMS(deg, isLat) {
    const d = Math.abs(deg), dInt = Math.floor(d);
    const mFrac = (d - dInt) * 60, mInt = Math.floor(mFrac);
    const s = ((mFrac - mInt) * 60).toFixed(2);
    const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
    return dInt + '\u00b0' + mInt + "'" + s + '"' + dir;
  }
  const txt = toDMS(_mapCtxLatLng.lat, true) + ' ' + toDMS(_mapCtxLatLng.lng, false);
  navigator.clipboard.writeText(txt).then(() => toast('Copied: ' + txt, 'success')).catch(() => { prompt('Copy coordinates:', txt); });
  closeMapCtxMenu();
}

function mapCtxAddPoint() {
  if (!_mapCtxLatLng) return;
  closeMapCtxMenu();
  // Find or create active editable point layer
  let pointLayerIdx = state.layers.findIndex(l => l.editable && l.editGeomType === 'Point');
  if (pointLayerIdx < 0) {
    createEditableLayer('Point');
    pointLayerIdx = state.layers.length - 1;
  }
  setCreateActiveLayer(pointLayerIdx);
  createState.drawPoints = [_mapCtxLatLng];
  finaliseFeature();
}


// ── CLOSE ATTRIBUTE TABLE ─────────────────────────────────────────────
function closeAttrTable() {
  const strip = document.getElementById('attr-strip');
  strip.style.display = 'none';
}

function openAttrTable() {
  const strip = document.getElementById('attr-strip');
  strip.style.display = 'flex';
}

// ── CTX MENU: Open Attribute Table ────────────────────────────────────
function ctxOpenAttrTable() {
  document.getElementById('layer-ctx-menu').classList.remove('visible');
  if (ctxLayerIdx < 0) return;
  setActiveLayer(ctxLayerIdx);
  openAttrTable();
  // Make sure the layer is selected in the table dropdown
  const sel = document.getElementById('attr-layer-select');
  if (sel) { sel.value = String(ctxLayerIdx); onAttrLayerChange(); }
  renderTable();
}

// ── SELECT BY ATTRIBUTE ───────────────────────────────────────────────
let _sbaFieldValues = [];

function openSelectByAttribute() {
  const layerIdx = state.activeLayerIndex;
  const layer = state.layers[layerIdx];
  if (!layer || layer.isTile) { toast('No active vector layer', 'error'); return; }

  // Populate field list
  const sel = document.getElementById('sba-field');
  sel.innerHTML = '<option value="">— select field —</option>';
  const fields = Object.keys((layer.geojson.features[0] || {}).properties || {});
  fields.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f; opt.textContent = f;
    sel.appendChild(opt);
  });
  document.getElementById('sba-value').value = '';
  document.getElementById('sba-hints').style.display = 'none';
  document.getElementById('sba-hints').innerHTML = '';
  _sbaFieldValues = [];
  document.getElementById('sba-backdrop').style.display = 'block';
}

function closeSBAModal(e) {
  if (e && e.target !== document.getElementById('sba-backdrop')) return;
  document.getElementById('sba-backdrop').style.display = 'none';
}

function updateSBAValues() {
  const layerIdx = state.activeLayerIndex;
  const layer = state.layers[layerIdx]; if (!layer) return;
  const field = document.getElementById('sba-field').value; if (!field) return;
  // Collect unique values for hint list
  const vals = new Set();
  layer.geojson.features.forEach(f => {
    const v = (f.properties || {})[field];
    if (v !== null && v !== undefined) vals.add(String(v));
  });
  _sbaFieldValues = Array.from(vals).sort();
  document.getElementById('sba-value').value = '';
  filterSBAHints();
}

function filterSBAHints() {
  const input = document.getElementById('sba-value').value.toLowerCase();
  const hintsEl = document.getElementById('sba-hints');
  const matches = _sbaFieldValues.filter(v => v.toLowerCase().includes(input)).slice(0, 20);
  if (matches.length === 0 || !input) { hintsEl.style.display = 'none'; return; }
  hintsEl.innerHTML = matches.map(v =>
    `<div onclick="document.getElementById('sba-value').value='${v.replace(/'/g,"\\'")}';document.getElementById('sba-hints').style.display='none';" `+
    `style="padding:4px 8px;cursor:pointer;font-family:var(--mono);font-size:11px;color:var(--text2);" `+
    `onmouseover="this.style.background='#edf0f3'" onmouseout="this.style.background=''">${v}</div>`
  ).join('');
  hintsEl.style.display = 'block';
}

function runSelectByAttribute(mode) {
  const layerIdx = state.activeLayerIndex;
  const layer = state.layers[layerIdx]; if (!layer) return;
  const field = document.getElementById('sba-field').value;
  const op    = document.getElementById('sba-op').value;
  const rawVal = document.getElementById('sba-value').value;
  if (!field) { toast('Please select a field', 'error'); return; }

  const numVal = parseFloat(rawVal);
  const matched = new Set();
  layer.geojson.features.forEach((f, i) => {
    const fv = String((f.properties || {})[field] ?? '');
    const fvNum = parseFloat(fv);
    let hit = false;
    switch(op) {
      case 'eq':       hit = fv === rawVal; break;
      case 'neq':      hit = fv !== rawVal; break;
      case 'contains': hit = fv.toLowerCase().includes(rawVal.toLowerCase()); break;
      case 'starts':   hit = fv.toLowerCase().startsWith(rawVal.toLowerCase()); break;
      case 'gt':       hit = !isNaN(fvNum) && !isNaN(numVal) && fvNum > numVal; break;
      case 'lt':       hit = !isNaN(fvNum) && !isNaN(numVal) && fvNum < numVal; break;
      case 'gte':      hit = !isNaN(fvNum) && !isNaN(numVal) && fvNum >= numVal; break;
      case 'lte':      hit = !isNaN(fvNum) && !isNaN(numVal) && fvNum <= numVal; break;
    }
    if (hit) matched.add(i);
  });

  if (mode === 'new') {
    state.selectedFeatureIndices = matched;
  } else {
    matched.forEach(i => state.selectedFeatureIndices.add(i));
  }
  state.selectedFeatureIndex = matched.size > 0 ? Array.from(matched)[0] : -1;
  refreshMapSelection(layerIdx);
  updateSelectionCount();
  renderTable();
  document.getElementById('sba-backdrop').style.display = 'none';
  toast(`${matched.size} feature${matched.size !== 1 ? 's' : ''} selected`, 'success');
}

// ── PANEL DRAG & DROP BETWEEN SIDES ───────────────────────────────────
// Allow panel-sections to be dragged from one side panel to the other
(function initPanelReorder() {
  // We use a MutationObserver to wire up new panel-sections as they appear
  function wirePanelSection(el) {
    if (el._panelDragWired) return;
    el._panelDragWired = true;
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', function(e) {
      if (e.target !== this) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/panel-id', this.id || ('ps-' + Date.now()));
      this._dragSelf = true;
      window._draggedPanelEl = this;
      setTimeout(() => this.classList.add('panel-dragging'), 0);
    });
    el.addEventListener('dragend', function() {
      this.classList.remove('panel-dragging');
      document.querySelectorAll('.panel-drop-target').forEach(e => e.classList.remove('panel-drop-target'));
      window._draggedPanelEl = null;
    });
  }

  function wirePanelContainer(container) {
    container.addEventListener('dragover', function(e) {
      const dragged = window._draggedPanelEl;
      if (!dragged || dragged === container) return;
      // Only allow panel-section to panel
      if (!dragged.classList.contains('panel-section')) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      // Find insertion point
      const sections = Array.from(this.querySelectorAll(':scope > .panel-section'));
      sections.forEach(s => s.classList.remove('panel-drop-target'));
      const after = sections.find(s => {
        const r = s.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      if (after) after.classList.add('panel-drop-target');
      else if (sections.length) sections[sections.length-1].classList.add('panel-drop-target-after');
    });
    container.addEventListener('dragleave', function() {
      this.querySelectorAll('.panel-drop-target,.panel-drop-target-after').forEach(e => {
        e.classList.remove('panel-drop-target','panel-drop-target-after');
      });
    });
    container.addEventListener('drop', function(e) {
      e.preventDefault();
      const dragged = window._draggedPanelEl;
      if (!dragged || !dragged.classList.contains('panel-section')) return;
      const sections = Array.from(this.querySelectorAll(':scope > .panel-section'));
      sections.forEach(s => s.classList.remove('panel-drop-target','panel-drop-target-after'));
      const after = sections.find(s => {
        const r = s.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      if (after) this.insertBefore(dragged, after);
      else this.appendChild(dragged);
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    const left = document.getElementById('left-panel');
    const right = document.getElementById('right-panel');
    if (left) wirePanelContainer(left);
    if (right) wirePanelContainer(right);

    // Wire existing panel-sections
    document.querySelectorAll('.panel-section').forEach(wirePanelSection);

    // Watch for new panel-sections
    const obs = new MutationObserver(muts => {
      muts.forEach(m => m.addedNodes.forEach(n => {
        if (n.nodeType === 1) {
          if (n.classList && n.classList.contains('panel-section')) wirePanelSection(n);
          n.querySelectorAll && n.querySelectorAll('.panel-section').forEach(wirePanelSection);
        }
      }));
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });
})();


// ── LAYER GEOMETRY ICON (SVG) ────────────────────────────────────────
function layerGeomIcon(layer) {
  const c = layer.outlineColor || layer.color || '#888';
  const f = layer.noFill ? 'none' : (layer.fillColor || layer.color || '#888');
  if (layer.isTile) {
    // Tile: simple grid icon
    return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="6" height="6" rx="1" fill="${c}" opacity="0.7"/>
      <rect x="9" y="1" width="6" height="6" rx="1" fill="${c}" opacity="0.7"/>
      <rect x="1" y="9" width="6" height="6" rx="1" fill="${c}" opacity="0.7"/>
      <rect x="9" y="9" width="6" height="6" rx="1" fill="${c}" opacity="0.7"/>
    </svg>`;
  }
  const gt = (layer.geomType || '').toLowerCase();
  if (gt.includes('point')) {
    // Circle
    return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="5" fill="${c}" stroke="${c}" stroke-width="0.5" opacity="0.9"/>
    </svg>`;
  }
  if (gt.includes('line')) {
    // Diagonal line with nodes
    return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polyline points="2,13 6,7 10,9 14,3" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="2" cy="13" r="1.5" fill="${c}"/>
      <circle cx="14" cy="3" r="1.5" fill="${c}"/>
    </svg>`;
  }
  if (gt.includes('polygon') || gt.includes('multi')) {
    // Polygon shape
    return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="8,2 14,6 13,13 3,13 2,6" fill="${f}" fill-opacity="0.35" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>`;
  }
  // Unknown / fallback: filled square
  return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="12" height="12" rx="2" fill="${c}" opacity="0.6"/>
  </svg>`;
}

// colour picker defined below


// ── LAYER Z-ORDER REFRESH ─────────────────────────────────────────────
// Index 0 = top of list = top of map (rendered last = on top in Leaflet)
function refreshLayerZOrder() {
  const reversed = [...state.layers].reverse();
  reversed.forEach(l => {
    if (l.visible && l.leafletLayer && state.map.hasLayer(l.leafletLayer)) {
      l.leafletLayer.bringToFront();
    }
  });
  // Bring index 0 to absolute front
  if (state.layers[0] && state.layers[0].visible && state.layers[0].leafletLayer) {
    state.layers[0].leafletLayer.bringToFront();
  }
}


// ── FEATURE ATTRIBUTE POPUP ──────────────────────────────────────────
function showFeaturePopup(map, latlng, feat, color) {
  if (state._featurePopup) { map.closePopup(state._featurePopup); state._featurePopup = null; }

  const props = feat.properties || {};
  const keys = Object.keys(props);
  if (keys.length === 0) return;

  const INITIAL = 8;

  // Store props in a global registry to avoid inline string escaping issues
  const popupId = '_popup_' + Date.now();
  window[popupId] = { props, keys };

  function clipboardWrite(text) {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    });
  }

  window._gaiaCopyPopupAll = function(showAll) {
    const ref = window[popupId]; if (!ref) return;
    const visKeys = showAll ? ref.keys : ref.keys.slice(0, INITIAL);
    const text = visKeys.map(k => k + ': ' + (ref.props[k] != null ? String(ref.props[k]) : '')).join('\n');
    clipboardWrite(text);
    toast('Copied ' + visKeys.length + ' fields to clipboard', 'success');
  };

  window._gaiaCopyPopupRow = function(pid, ki) {
    const ref = window[pid]; if (!ref) return;
    const k = ref.keys[ki];
    const v = ref.props[k] != null ? String(ref.props[k]) : '';
    clipboardWrite(v);
    toast('Copied: ' + (v.length > 40 ? v.slice(0,40) + '\u2026' : v), 'success');
  };

  function buildPopupHtml(showAll) {
    const visKeys = showAll ? keys : keys.slice(0, INITIAL);
    const rows = visKeys.map(function(k) {
      const fullKi = keys.indexOf(k);
      const v = props[k] != null ? String(props[k]) : '';
      const disp = v.length > 40 ? v.slice(0,40) + '\u2026' : v;
      return '<tr title="Right-click to copy value"'
        + ' oncontextmenu="event.preventDefault();event.stopPropagation();window._gaiaCopyPopupRow(\'' + popupId + '\',' + fullKi + ');return false;">'
        + '<td style="font-weight:600;color:#2c3e50;white-space:nowrap;padding:2px 8px 2px 0;">' + escHtml(k) + '</td>'
        + '<td style="color:#3a5068;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:default;">' + escHtml(disp) + '</td>'
        + '</tr>';
    }).join('');

    var moreRow = (!showAll && keys.length > INITIAL)
      ? '<tr><td colspan="2" style="padding-top:4px;">'
        + '<span onclick="event.stopPropagation();window._gaiaExpandPopup()" style="cursor:pointer;color:#0074a8;font-family:monospace;font-size:10px;text-decoration:underline;">'
        + '&#9660; Expand to show ' + (keys.length - INITIAL) + ' more field' + (keys.length - INITIAL !== 1 ? 's' : '')
        + '</span></td></tr>'
      : '';

    var copyBtn = '<div style="padding-top:6px;border-top:1px solid rgba(0,0,0,0.1);margin-top:4px;display:flex;justify-content:space-between;align-items:center;">'
      + '<span style="font-family:monospace;font-size:9px;color:#9aacba;">Right-click row to copy value</span>'
      + '<span onclick="event.stopPropagation();window._gaiaCopyPopupAll(' + showAll + ')" style="cursor:pointer;color:#0074a8;font-family:monospace;font-size:10px;text-decoration:underline;">&#8984; Copy all</span>'
      + '</div>';

    return '<div style="font-family:IBM Plex Mono,monospace;font-size:11px;min-width:180px;max-width:300px;">'
      + '<div style="background:' + color + ';height:3px;border-radius:2px 2px 0 0;margin:-8px -8px 7px -8px;"></div>'
      + '<table style="border-collapse:collapse;width:100%;">' + rows + moreRow + '</table>'
      + copyBtn + '</div>';
  }

  window._gaiaExpandPopup = function() {
    if (state._featurePopup) {
      state._featurePopup.setContent(buildPopupHtml(true));
    }
  };

  state._featurePopup = L.popup({
      maxWidth: 340,
      className: 'gaia-feature-popup',
      closeButton: true,
      autoClose: false,
      keepInView: false,
    })
    .setLatLng(latlng)
    .setContent(buildPopupHtml(false))
    .openOn(map);
}

// ── MAP DRAG-AND-DROP FILE LOADING ───────────────────────────────────
(function initMapDrop() {
  document.addEventListener('DOMContentLoaded', function() {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;

    let _dropOverlay = null;

    mapContainer.addEventListener('dragenter', function(e) {
      if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      if (!_dropOverlay) {
        _dropOverlay = document.createElement('div');
        _dropOverlay.style.cssText = 'position:absolute;inset:0;z-index:2000;background:rgba(0,116,168,0.12);border:3px dashed #0074a8;border-radius:4px;display:flex;align-items:center;justify-content:center;pointer-events:none;';
        _dropOverlay.innerHTML = '<div style="background:rgba(255,255,255,0.95);padding:16px 28px;border-radius:8px;font-family:IBM Plex Mono,monospace;font-size:14px;font-weight:700;color:#0074a8;letter-spacing:1px;">Drop files to add layers</div>';
        mapContainer.style.position = 'relative';
        mapContainer.appendChild(_dropOverlay);
      }
    });

    mapContainer.addEventListener('dragover', function(e) {
      if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    mapContainer.addEventListener('dragleave', function(e) {
      // Only hide if leaving the container itself (not a child)
      if (mapContainer.contains(e.relatedTarget)) return;
      if (_dropOverlay) { mapContainer.removeChild(_dropOverlay); _dropOverlay = null; }
    });

    mapContainer.addEventListener('drop', function(e) {
      e.preventDefault();
      if (_dropOverlay) { mapContainer.removeChild(_dropOverlay); _dropOverlay = null; }
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      processFileList(Array.from(files));
    });
  });
})();


// ══════════════════════════════════════════════════
// LAYER SYMBOLOGY (fill + outline + no-fill)
// ══════════════════════════════════════════════════
const _SWATCH_COLORS = [
  '#e74c3c','#e67e22','#f39c12','#2ecc71','#1abc9c','#3498db','#9b59b6',
  '#ec407a','#0074a8','#4a873f','#795548','#607d8b','#ffffff','#000000'
];

let _colorPickerLayerIdx = -1; // which layer the picker is for

function ctxChangeColor() {
  document.getElementById('layer-ctx-menu').classList.remove('visible');
  openColorPickerForLayer(ctxLayerIdx);
}

function ctxOpenClassify() {
  document.getElementById('layer-ctx-menu').classList.remove('visible');
  // Open classify modal, pre-select this layer
  const bd = document.getElementById('classify-backdrop');
  bd.classList.add('open');
  const sel = document.getElementById('cls-layer');
  sel.innerHTML = '<option value="">— select layer —</option>';
  state.layers.forEach((l, i) => {
    if (!l.isTile) {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = l.name;
      if (i === ctxLayerIdx) opt.selected = true;
      sel.appendChild(opt);
    }
  });
  onClsLayerChange();
}

function openColorPickerForLayer(layerIdx) {
  _colorPickerLayerIdx = layerIdx;
  const layer = state.layers[layerIdx]; if (!layer) return;
  const popup = document.getElementById('color-picker-popup');

  // Sync inputs to current layer styles
  const fillCol = layer.fillColor || layer.color || '#3498db';
  const outlineCol = layer.outlineColor || layer.color || '#3498db';
  const noFill = layer.noFill || false;

  document.getElementById('fill-color-custom').value = fillCol;
  document.getElementById('outline-color-custom').value = outlineCol;
  document.getElementById('no-fill-btn').style.background = noFill ? '#0074a8' : '#edf0f3';
  document.getElementById('no-fill-btn').style.color = noFill ? '#fff' : '';
  _updateColorPreview(fillCol, outlineCol, noFill);

  // Show point shape row only for point layers
  const isPointLayer = layer.geomType === 'Point' || layer.geomType === 'MultiPoint' ||
    (layer.geojson && (layer.geojson.features||[]).some(f => f.geometry?.type?.includes('Point')));
  const shapeRow = document.getElementById('point-shape-row');
  if (shapeRow) shapeRow.style.display = isPointLayer ? 'block' : 'none';
  if (isPointLayer) {
    const curShape = layer.pointShape || 'circle';
    ['circle','square','triangle'].forEach(s => {
      const btn = document.getElementById('shape-btn-' + s);
      if (btn) {
        btn.style.borderColor = s === curShape ? '#0074a8' : 'transparent';
        btn.style.background  = s === curShape ? '#e3f3fc' : '#edf0f3';
      }
    });
  }

  // Build swatch grids
  _buildSwatches('fill-color-swatches', fillCol, (c) => applyFillColor(c));
  _buildSwatches('outline-color-swatches', outlineCol, (c) => applyOutlineColor(c));

  // Position popup
  const layerEls = document.querySelectorAll('.layer-item');
  const targetEl = layerEls[layerIdx];
  if (targetEl) {
    const r = targetEl.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 250));
    const top  = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 330));
    popup.style.left = left + 'px';
    popup.style.top  = top + 'px';
  } else {
    popup.style.left = '120px'; popup.style.top = '200px';
  }
  popup.style.display = 'block';
  setTimeout(() => document.addEventListener('click', _onClickOutsideColorPicker, { once: true }), 10);
}

function _onClickOutsideColorPicker(e) {
  const popup = document.getElementById('color-picker-popup');
  if (popup && !popup.contains(e.target)) closeColorPicker();
}

function _buildSwatches(containerId, currentColor, onClickFn) {
  const container = document.getElementById(containerId); if (!container) return;
  container.innerHTML = _SWATCH_COLORS.map(c =>
    `<div onclick="_swatchClick(this,'${containerId}','${c}')"
      title="${c}"
      style="width:18px;height:18px;border-radius:3px;background:${c};cursor:pointer;
             border:2px solid ${c.toLowerCase() === currentColor.toLowerCase() ? '#1c2b3a' : (c === '#ffffff' ? '#ccc' : 'transparent')};
             box-sizing:border-box;transition:transform 0.1s;"
      onmouseover="this.style.transform='scale(1.2)'"
      onmouseout="this.style.transform='scale(1)'"
      data-color="${c}">
    </div>`
  ).join('');
  container._onClickFn = onClickFn;
}

function _swatchClick(el, containerId, color) {
  const container = document.getElementById(containerId);
  container.querySelectorAll('div').forEach(d => {
    d.style.borderColor = d.dataset.color === color ? '#1c2b3a' : (d.dataset.color === '#ffffff' ? '#ccc' : 'transparent');
  });
  if (container._onClickFn) container._onClickFn(color);
}

function applyFillColor(color) {
  const layer = state.layers[_colorPickerLayerIdx]; if (!layer) return;
  layer.fillColor = color;
  layer.noFill = false;
  document.getElementById('fill-color-custom').value = color;
  document.getElementById('no-fill-btn').style.background = '#edf0f3';
  document.getElementById('no-fill-btn').style.color = '';
  _applySymbologyToLeaflet(layer);
  _updateColorPreview(color, layer.outlineColor || layer.color, false);
  updateLayerList();
}

function applyOutlineColor(color) {
  const layer = state.layers[_colorPickerLayerIdx]; if (!layer) return;
  layer.outlineColor = color;
  document.getElementById('outline-color-custom').value = color;
  _applySymbologyToLeaflet(layer);
  _updateColorPreview(layer.fillColor || layer.color, color, layer.noFill || false);
  updateLayerList();
}

function applyNoFill() {
  const layer = state.layers[_colorPickerLayerIdx]; if (!layer) return;
  layer.noFill = !layer.noFill;
  const btn = document.getElementById('no-fill-btn');
  btn.style.background = layer.noFill ? '#0074a8' : '#edf0f3';
  btn.style.color = layer.noFill ? '#fff' : '';
  _applySymbologyToLeaflet(layer);
  _updateColorPreview(layer.fillColor || layer.color, layer.outlineColor || layer.color, layer.noFill);
  updateLayerList();
}

function applyPointShape(shape) {
  const layer = state.layers[_colorPickerLayerIdx]; if (!layer) return;
  layer.pointShape = shape;
  ['circle','square','triangle'].forEach(s => {
    const btn = document.getElementById('shape-btn-' + s);
    if (btn) {
      btn.style.borderColor = s === shape ? '#0074a8' : 'transparent';
      btn.style.background  = s === shape ? '#e3f3fc' : '#edf0f3';
    }
  });
  _applySymbologyToLeaflet(layer);
  updateLayerList();
}

function _applySymbologyToLeaflet(layer) {
  if (!layer.leafletLayer || layer.isTile) return;
  const fillCol    = layer.fillColor    || layer.color;
  const outlineCol = layer.outlineColor || layer.color;
  const noFill     = layer.noFill || false;
  const shape      = layer.pointShape || 'circle';

  // Check if any features are points
  const features = layer.geojson?.features || [];
  const hasPoints  = features.some(f => f.geometry?.type?.includes('Point'));
  const hasPolygon = features.some(f => f.geometry?.type?.includes('Polygon'));
  const hasLine    = features.some(f => f.geometry?.type?.includes('Line'));

  if (hasPoints && !hasPolygon && !hasLine) {
    // Pure point layer — rebuild markers with new shape/colour
    _rebuildPointMarkers(layer);
  } else {
    // Non-point layer — use setStyle
    layer.leafletLayer.setStyle({
      color: outlineCol,
      fillColor: fillCol,
      fillOpacity: noFill ? 0 : 0.25,
      weight: 2
    });
  }
  updateLayerList();
}

function _makePointIcon(fillCol, outlineCol, noFill, shape, size) {
  size = size || 12;
  const s = size;
  const fill   = noFill ? 'none' : fillCol;
  const stroke = outlineCol;
  const sw = Math.max(1, s / 6);
  let svgShape;
  if (shape === 'square') {
    const m = sw; const w = s - 2*m;
    svgShape = `<rect x="${m}" y="${m}" width="${w}" height="${w}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="1"/>`;
  } else if (shape === 'triangle') {
    const pts = `${s/2},${sw} ${s-sw},${s-sw} ${sw},${s-sw}`;
    svgShape = `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  } else {
    // circle (default)
    const r = (s - 2*sw) / 2; const cx = s/2; const cy = s/2;
    svgShape = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${svgShape}</svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [s, s],
    iconAnchor: [s/2, s/2],
    popupAnchor: [0, -s/2]
  });
}

function _rebuildPointMarkers(layer) {
  if (!layer.leafletLayer) return;
  const fillCol    = layer.fillColor    || layer.color;
  const outlineCol = layer.outlineColor || layer.color;
  const noFill     = layer.noFill || false;
  const shape      = layer.pointShape || 'circle';
  layer.leafletLayer.eachLayer(function(sub) {
    if (sub.setIcon) {
      sub.setIcon(_makePointIcon(fillCol, outlineCol, noFill, shape, 14));
    }
  });
}

function applyLayerColor(color) {
  // Legacy: sets both fill and outline to same colour
  const layer = state.layers[_colorPickerLayerIdx]; if (!layer) return;
  layer.color = color;
  layer.fillColor = color;
  layer.outlineColor = color;
  layer.noFill = false;
  _applySymbologyToLeaflet(layer);
  updateLayerList();
  toast('Layer colour updated', 'success');
}

function _updateColorPreview(fillColor, outlineColor, noFill) {
  const box = document.getElementById('color-preview-box'); if (!box) return;
  box.style.background = noFill ? 'transparent repeating-linear-gradient(45deg,#ccc,#ccc 4px,transparent 4px,transparent 8px)' : fillColor;
  box.style.borderColor = outlineColor;
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  document.getElementById('dark-mode-btn').textContent = isDark ? '☀️' : '🌙';
  try { localStorage.setItem('gaia_dark_mode', isDark ? '1' : '0'); } catch(e) {}
}

// Restore dark mode preference on load
(function() {
  try {
    if (localStorage.getItem('gaia_dark_mode') === '1') {
      document.body.classList.add('dark-mode');
      document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('dark-mode-btn');
        if (btn) btn.textContent = '☀️';
      });
    }
  } catch(e) {}
})();

// ══════════════════════════════════════════════════
// EXPORT MAP AS PNG
// ══════════════════════════════════════════════════
function exportMapPNG() {
  toast('Preparing PNG export…', 'info');
  const mapEl = document.getElementById('map');
  if (!mapEl) { toast('Map element not found', 'error'); return; }

  const rect = mapEl.getBoundingClientRect();
  const W = Math.round(rect.width), H = Math.round(rect.height);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d');

  ctx.fillStyle = document.body.classList.contains('dark-mode') ? '#111920' : '#f4f6f8';
  ctx.fillRect(0, 0, W, H);

  // Draw all positioned tile/image layers
  const allImgs = Array.from(mapEl.querySelectorAll('.leaflet-pane img'));
  let pending = 0;

  function drawImg(img) {
    const ir = img.getBoundingClientRect();
    try { ctx.drawImage(img, ir.left-rect.left, ir.top-rect.top, ir.width, ir.height); } catch(e) {}
  }

  function afterTiles() {
    // Render SVG vector overlay
    const svgEl = mapEl.querySelector('.leaflet-overlay-pane svg');
    if (svgEl) {
      // Clone and fix SVG dimensions/transforms
      const svgClone = svgEl.cloneNode(true);
      const svgRect = svgEl.getBoundingClientRect();
      svgClone.setAttribute('width', svgRect.width);
      svgClone.setAttribute('height', svgRect.height);
      const svgStr = new XMLSerializer().serializeToString(svgClone);
      const svgBlob = new Blob([svgStr], {type:'image/svg+xml;charset=utf-8'});
      const svgUrl = URL.createObjectURL(svgBlob);
      const svgImg = new Image(svgRect.width, svgRect.height);
      svgImg.onload = () => {
        ctx.drawImage(svgImg, svgRect.left-rect.left, svgRect.top-rect.top, svgRect.width, svgRect.height);
        URL.revokeObjectURL(svgUrl);
        afterVectors();
      };
      svgImg.onerror = () => { URL.revokeObjectURL(svgUrl); afterVectors(); };
      svgImg.src = svgUrl;
    } else {
      afterVectors();
    }
  }

  function afterVectors() {
    // Scale bar
    const scaleText = document.getElementById('scale-display')?.textContent || '';
    const zoom = state.map ? Math.round(state.map.getZoom()) : '';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(8, H-28, 200, 20);
    ctx.fillStyle = '#1c2b3a';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`1:${scaleText}  Z${zoom}`, 14, H-12);

    // Watermark
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(W-80, H-20, 72, 14);
    ctx.fillStyle = '#0074a8';
    ctx.font = '10px monospace';
    ctx.fillText('Gaia v1.0', W-74, H-8);

    // Download
    out.toBlob(blob => {
      if (!blob) { toast('PNG export failed — try zooming in first', 'error'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'gaia-map-' + new Date().toISOString().slice(0,10) + '.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('Map exported as PNG', 'success');
    }, 'image/png');
  }

  // Draw images — track async loads
  if (allImgs.length === 0) {
    afterTiles();
    return;
  }
  pending = allImgs.length;
  allImgs.forEach(img => {
    if (img.complete && img.naturalWidth > 0) {
      drawImg(img);
      if (--pending === 0) afterTiles();
    } else {
      const onDone = () => {
        if (img.complete && img.naturalWidth > 0) drawImg(img);
        if (--pending === 0) afterTiles();
      };
      img.addEventListener('load', onDone, {once:true});
      img.addEventListener('error', onDone, {once:true});
    }
  });
}

// ══════════════════════════════════════════════════
// CLASSIFY SYMBOLOGY
// ══════════════════════════════════════════════════
const _COLOR_RAMPS = {
  blues:    ['#deebf7','#9ecae1','#4292c6','#2171b5','#084594'],
  greens:   ['#e5f5e0','#a1d99b','#41ab5d','#238b45','#005a32'],
  reds:     ['#fee5d9','#fcae91','#fb6a4a','#de2d26','#a50f15'],
  oranges:  ['#feedde','#fdbe85','#fd8d3c','#e6550d','#a63603'],
  purples:  ['#f2f0f7','#cbc9e2','#9e9ac8','#756bb1','#54278f'],
  bluered:  ['#2166ac','#74add1','#e0f3f8','#f46d43','#a50026'],
  greenred: ['#1a9850','#91cf60','#ffffbf','#fc8d59','#d73027'],
  umwelt:   ['#d0eaf7','#74c0de','#14b1e7','#0074a8','#003d5c'],
  spectral: ['#3288bd','#99d594','#e6f598','#fee08b','#d53e4f'],
  viridis:  ['#440154','#31688e','#35b779','#fde725','#21908c'],
};

let _classifyState = { breaks: [], colors: [], fieldType: 'string' };

function openClassifyPanel() {
  const bd = document.getElementById('classify-backdrop');
  bd.classList.add('open');
  // Populate layer list
  const sel = document.getElementById('cls-layer');
  sel.innerHTML = '<option value="">— select layer —</option>';
  state.layers.forEach((l, i) => {
    if (!l.isTile) {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = l.name;
      if (i === state.activeLayerIndex) opt.selected = true;
      sel.appendChild(opt);
    }
  });
  onClsLayerChange();
}

function onClsLayerChange() {
  const layerIdx = parseInt(document.getElementById('cls-layer').value);
  const layer = state.layers[layerIdx];
  const fsel = document.getElementById('cls-field');
  fsel.innerHTML = '<option value="">— select field —</option>';
  if (!layer) return;
  Object.keys(layer.fields).forEach(f => {
    const opt = document.createElement('option'); opt.value = f; opt.textContent = f;
    fsel.appendChild(opt);
  });
  onClsMethodChange();
}

function onClsMethodChange() {
  const method = document.getElementById('cls-method').value;
  document.getElementById('cls-classes-row').style.display = method === 'unique' ? 'none' : '';
  previewClassify();
}

function onClsFieldChange() { previewClassify(); }

function _interpolateColor(c1, c2, t) {
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n>>16)&255,(n>>8)&255,n&255]; };
  const [r1,g1,b1] = hex(c1), [r2,g2,b2] = hex(c2);
  const r = Math.round(r1 + (r2-r1)*t), g = Math.round(g1 + (g2-g1)*t), b = Math.round(b1 + (b2-b1)*t);
  return '#' + [r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}

function _getRampColor(rampName, t) {
  const stops = _COLOR_RAMPS[rampName] || _COLOR_RAMPS.blues;
  const n = stops.length - 1;
  const pos = t * n;
  const lo = Math.min(Math.floor(pos), n-1), hi = Math.min(lo + 1, n);
  return _interpolateColor(stops[lo], stops[hi], pos - lo);
}

function previewClassify() {
  const layerIdx = parseInt(document.getElementById('cls-layer').value);
  const field = document.getElementById('cls-field').value;
  const method = document.getElementById('cls-method').value;
  const nClasses = parseInt(document.getElementById('cls-classes').value) || 5;
  const ramp = document.getElementById('cls-ramp').value;
  const layer = state.layers[layerIdx];
  const preview = document.getElementById('cls-preview');

  if (!layer || !field) {
    preview.innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--text3);text-align:center;">Select a layer and field to preview</div>';
    return;
  }

  const vals = (layer.geojson.features || []).map(f => f.properties?.[field]);
  const classes = _buildClasses(vals, method, nClasses, ramp);
  _classifyState = { classes, layerIdx, field, method };

  const swatches = classes.map((c, ci) =>
    `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;">
      <div style="position:relative;flex-shrink:0;">
        <div data-cls-idx="${ci}" style="width:28px;height:14px;border-radius:3px;background:${c.color};border:1px solid rgba(0,0,0,0.1);cursor:pointer;title='Click to change colour'" onclick="clsEditColor(${ci},this)"></div>
        <input type="color" style="position:absolute;opacity:0;width:0;height:0;pointer-events:none;" id="cls-color-input-${ci}" value="${c.color}" onchange="clsApplyColor(${ci},this.value)"/>
      </div>
      <span style="font-family:var(--mono);font-size:9px;color:var(--text2);flex:1;">${escHtml(String(c.label))}</span>
      <span style="font-family:var(--mono);font-size:9px;color:var(--text3);">${c.count} ft</span>
    </div>`).join('');
  preview.innerHTML = `<div style="font-family:var(--mono);font-size:9px;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">${escHtml(field)}</div>${swatches}`;
}

function _buildClasses(vals, method, n, ramp) {
  if (method === 'unique') {
    const unique = [...new Set(vals.filter(v => v != null).map(String))].sort();
    return unique.slice(0, 20).map((v, i) => ({
      label: v,
      color: _getRampColor(ramp, unique.length <= 1 ? 0.5 : i / (unique.length - 1)),
      test: fv => String(fv) === v,
      count: vals.filter(x => String(x) === v).length
    }));
  }
  const nums = vals.filter(v => v != null && !isNaN(parseFloat(v))).map(Number).sort((a,b) => a-b);
  if (!nums.length) return [];
  const min = nums[0], max = nums[nums.length-1];
  if (min === max) {
    return [{ label: String(min), color: _getRampColor(ramp, 0.5), test: () => true, count: nums.length }];
  }
  let breaks = [];
  if (method === 'equal') {
    const step = (max - min) / n;
    for (let i = 0; i <= n; i++) breaks.push(min + i * step);
  } else { // quantile
    for (let i = 0; i <= n; i++) {
      const idx = Math.min(Math.round(i * (nums.length-1) / n), nums.length-1);
      breaks.push(nums[idx]);
    }
    breaks = [...new Set(breaks)];
  }
  const classes = [];
  for (let i = 0; i < breaks.length - 1; i++) {
    const lo = breaks[i], hi = breaks[i+1];
    const isLast = i === breaks.length - 2;
    const color = _getRampColor(ramp, classes.length / Math.max(1, breaks.length - 2));
    const fmt = v => Number.isInteger(v) ? v : v.toFixed(2);
    classes.push({
      label: `${fmt(lo)} – ${fmt(hi)}`,
      color,
      test: fv => { const n2 = parseFloat(fv); return !isNaN(n2) && n2 >= lo && (isLast ? n2 <= hi : n2 < hi); },
      count: nums.filter(x => x >= lo && (isLast ? x <= hi : x < hi)).length
    });
  }
  return classes;
}

function clsEditColor(ci, swatch) {
  // Trigger hidden colour input next to swatch
  const inp = document.getElementById('cls-color-input-' + ci);
  if (inp) inp.click();
}
function clsApplyColor(ci, color) {
  if (!_classifyState.classes || !_classifyState.classes[ci]) return;
  _classifyState.classes[ci].color = color;
  // Update the swatch preview inline
  const swatch = document.querySelector('[data-cls-idx="' + ci + '"]');
  if (swatch) swatch.style.background = color;
}

function applyClassify() {
  const { classes, layerIdx, field } = _classifyState;
  if (!classes || !classes.length || layerIdx == null) { toast('Build a preview first', 'error'); return; }
  const layer = state.layers[layerIdx];
  if (!layer) return;

  // Rebuild leaflet layer with per-feature colours
  if (layer.leafletLayer) state.map.removeLayer(layer.leafletLayer);

  const isLine = layer.geomType?.includes('Line');
  const newLeaflet = L.geoJSON(layer.geojson, {
    style: feat => {
      const val = feat.properties?.[field];
      const cls = classes.find(c => c.test(val));
      const col = cls ? cls.color : '#888888';
      return { color: col, fillColor: col, fillOpacity: 0.4, weight: isLine ? 2.5 : 1.5, opacity: 0.9 };
    },
    pointToLayer: (feat, latlng) => {
      const val = feat.properties?.[field];
      const cls = classes.find(c => c.test(val));
      const col = cls ? cls.color : '#888888';
      const ic = _makePointIcon(col, '#fff', false, layer.pointShape || 'circle', 14);
      return L.marker(latlng, { icon: ic });
    },
    onEachFeature: (feat, sub) => {
      const fi = (layer.geojson.features || []).indexOf(feat);
      sub.on('click', e => {
        state.activeLayerIndex = layerIdx;
        state.selectedFeatureIndices = new Set([fi]);
        state.selectedFeatureIndex = fi;
        showFeaturePopup(state.map, e.latlng, feat, layer.color);
        updateLayerList(); updateSelectionCount(); refreshMapSelection(layerIdx); renderTable();
        e.originalEvent._featureClicked = true; L.DomEvent.stopPropagation(e);
      });
    }
  });
  newLeaflet.addTo(state.map);
  layer.leafletLayer = newLeaflet;
  layer.classified = true;
  layer.classifyField = field;
  layer.classifyClasses = classes;
  refreshLayerZOrder();

  document.getElementById('classify-backdrop').classList.remove('open');
  toast(`Classified "${layer.name}" by "${field}" — ${classes.length} classes`, 'success');
  updateLegend();
}

function resetLayerSymbology() {
  const layerIdx = parseInt(document.getElementById('cls-layer').value);
  const layer = state.layers[layerIdx];
  if (!layer) return;
  layer.classified = false;
  _applySymbologyToLeaflet(layer);
  // Rebuild properly via full re-add
  if (layer.leafletLayer) state.map.removeLayer(layer.leafletLayer);
  const color = layer.color;
  const isLine = layer.geomType?.includes('Line');
  const newL = L.geoJSON(layer.geojson, {
    style: () => ({ color: layer.outlineColor||color, fillColor: layer.fillColor||color, fillOpacity: layer.noFill?0:0.25, weight: isLine?2.5:1.5, opacity:0.9 }),
    pointToLayer: (feat,latlng) => { const ic=_makePointIcon(layer.fillColor||color,layer.outlineColor||'#fff',layer.noFill||false,layer.pointShape||'circle',14);return L.marker(latlng,{icon:ic}); },
    onEachFeature: (feat, sub) => {
      const fi=(layer.geojson.features||[]).indexOf(feat);
      sub.on('click',e=>{
        state.activeLayerIndex=layerIdx;state.selectedFeatureIndices=new Set([fi]);state.selectedFeatureIndex=fi;
        showFeaturePopup(state.map,e.latlng,feat,color);
        updateLayerList();updateSelectionCount();refreshMapSelection(layerIdx);renderTable();
        e.originalEvent._featureClicked=true;L.DomEvent.stopPropagation(e);
      });
    }
  });
  newL.addTo(state.map);
  layer.leafletLayer = newL;
  refreshLayerZOrder();
  toast('Symbology reset to default', 'success');
  updateLegend();
}

// ══════════════════════════════════════════════════
// FIELD CALCULATOR
// ══════════════════════════════════════════════════
function openFieldCalcPanel() { _openFieldCalc(state.activeLayerIndex); }
function openFieldCalcFromTable() { _openFieldCalc(state.activeLayerIndex); }

function _openFieldCalc(defaultIdx) {
  const bd = document.getElementById('fieldcalc-backdrop');
  bd.classList.add('open');
  const sel = document.getElementById('fc-layer');
  sel.innerHTML = '<option value="">— select layer —</option>';
  state.layers.forEach((l, i) => {
    if (!l.isTile) {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = l.name;
      if (i === defaultIdx) opt.selected = true;
      sel.appendChild(opt);
    }
  });
  onFCLayerChange();
}

function onFCLayerChange() {
  const layerIdx = parseInt(document.getElementById('fc-layer').value);
  const layer = state.layers[layerIdx];
  const listEl = document.getElementById('fc-field-list');
  listEl.innerHTML = '';
  if (!layer) return;
  Object.keys(layer.fields).forEach(f => {
    const chip = document.createElement('span');
    chip.style.cssText = 'font-family:var(--mono);font-size:9px;padding:2px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;color:var(--teal);';
    chip.textContent = f;
    chip.title = 'Click to insert [' + f + ']';
    chip.onclick = () => fcInsertField(f);
    listEl.appendChild(chip);
  });
  fcPreview();
}

// ── GEOMETRY CALCULATIONS (area / length) ─────────
function _haversineM(p1, p2) {
  const R = 6371000, toRad = x => x * Math.PI / 180;
  const dLat = toRad(p2[1]-p1[1]), dLon = toRad(p2[0]-p1[0]);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(p1[1]))*Math.cos(toRad(p2[1]))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function _ringAreaM2(ring) {
  // Spherical polygon area via Gauss's formula
  const R = 6371000; let area = 0; const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i+1)%n;
    area += (ring[j][0]-ring[i][0]) * Math.PI/180 *
            (2 + Math.sin(ring[i][1]*Math.PI/180) + Math.sin(ring[j][1]*Math.PI/180));
  }
  return Math.abs(area * R * R / 2);
}
function _calcGeomArea(feat, unit) {
  const g = feat.geometry; if (!g) return null;
  let m2 = 0;
  const doRings = rings => { m2 += _ringAreaM2(rings[0]); for (let i=1;i<rings.length;i++) m2 -= _ringAreaM2(rings[i]); };
  if (g.type==='Polygon') doRings(g.coordinates);
  else if (g.type==='MultiPolygon') g.coordinates.forEach(p => doRings(p));
  else return null;
  if (unit==='ha')   return Math.round(m2/10000*1000)/1000;
  if (unit==='sqkm') return Math.round(m2/1e6*10000)/10000;
  return Math.round(m2*100)/100;
}
function _calcGeomLength(feat, unit) {
  const g = feat.geometry; if (!g) return null;
  const lineLen = pts => { let d=0; for(let i=0;i<pts.length-1;i++) d+=_haversineM(pts[i],pts[i+1]); return d; };
  let total = 0;
  if (g.type==='LineString') total = lineLen(g.coordinates);
  else if (g.type==='MultiLineString') g.coordinates.forEach(ls => total += lineLen(ls));
  else return null;
  return unit==='km' ? Math.round(total/1000*10000)/10000 : Math.round(total*100)/100;
}
function fcCalcArea(unit) {
  const li = parseInt(document.getElementById('fc-layer').value);
  const layer = state.layers[li]; if (!layer) { toast('Select a layer', 'error'); return; }
  const fe = document.getElementById('fc-field-name');
  if (!fe.value) fe.value = unit==='ha'?'area_ha':unit==='sqkm'?'area_sqkm':'area_sqm';
  let ok=0, skip=0;
  (layer.geojson.features||[]).forEach(f => {
    const v = _calcGeomArea(f, unit);
    if (v===null){skip++;return;} if(!f.properties)f.properties={}; f.properties[fe.value]=v; ok++;
  });
  if (!layer.fields[fe.value]) layer.fields[fe.value]='number';
  updateLayerList(); renderTable(); updateStats();
  toast(`Area (${unit}) written to "${fe.value}" for ${ok} features`+(skip?` (${skip} skipped — not polygon)`:''), ok?'success':'error');
  document.getElementById('fieldcalc-backdrop').classList.remove('open');
}
function fcCalcLength(unit) {
  const li = parseInt(document.getElementById('fc-layer').value);
  const layer = state.layers[li]; if (!layer) { toast('Select a layer', 'error'); return; }
  const fe = document.getElementById('fc-field-name');
  if (!fe.value) fe.value = unit==='km'?'length_km':'length_m';
  let ok=0, skip=0;
  (layer.geojson.features||[]).forEach(f => {
    const v = _calcGeomLength(f, unit);
    if (v===null){skip++;return;} if(!f.properties)f.properties={}; f.properties[fe.value]=v; ok++;
  });
  if (!layer.fields[fe.value]) layer.fields[fe.value]='number';
  updateLayerList(); renderTable(); updateStats();
  toast(`Length (${unit}) written to "${fe.value}" for ${ok} features`+(skip?` (${skip} skipped — not line)`:''), ok?'success':'error');
  document.getElementById('fieldcalc-backdrop').classList.remove('open');
}

function fcInsertField(f) {
  const ta = document.getElementById('fc-expr');
  const start = ta.selectionStart, end = ta.selectionEnd;
  const ins = '[' + f + ']';
  ta.value = ta.value.slice(0, start) + ins + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + ins.length;
  ta.focus();
  fcPreview();
}

function fcInsert(s) {
  const ta = document.getElementById('fc-expr');
  const start = ta.selectionStart, end = ta.selectionEnd;
  ta.value = ta.value.slice(0, start) + s + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + s.length;
  ta.focus();
  fcPreview();
}

function _evalFCExpr(expr, props) {
  // Replace [fieldname] with the actual value (string-escaped or numeric)
  let js = expr.replace(/\[([^\]]+)\]/g, (_, f) => {
    const v = props?.[f];
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return String(v);
    return JSON.stringify(String(v));
  });
  // Safe eval in a restricted context
  // eslint-disable-next-line no-new-func
  return new Function('Math', 'String', 'Number', 'parseFloat', 'parseInt', 'return (' + js + ')')(Math, String, Number, parseFloat, parseInt);
}

function fcPreview() {
  const layerIdx = parseInt(document.getElementById('fc-layer').value);
  const layer = state.layers[layerIdx];
  const expr = document.getElementById('fc-expr').value.trim();
  const prevEl = document.getElementById('fc-preview');
  if (!layer || !expr) { prevEl.textContent = ''; return; }
  const feat = (layer.geojson.features || [])[0];
  if (!feat) { prevEl.textContent = 'No features in layer'; return; }
  try {
    const result = _evalFCExpr(expr, feat.properties || {});
    prevEl.innerHTML = `<span style="color:var(--text3);">Preview (row 1):</span> <span style="color:var(--teal);">${escHtml(String(result))}</span>`;
    document.getElementById('fc-status').textContent = '';
  } catch(e) {
    prevEl.innerHTML = `<span style="color:var(--red);">Error: ${escHtml(e.message)}</span>`;
  }
}

function runFieldCalc() {
  const layerIdx = parseInt(document.getElementById('fc-layer').value);
  const layer = state.layers[layerIdx];
  const expr = document.getElementById('fc-expr').value.trim();
  const fieldName = document.getElementById('fc-field-name').value.trim();
  const statusEl = document.getElementById('fc-status');

  if (!layer) { toast('Select a layer', 'error'); return; }
  if (!fieldName) { toast('Enter a field name', 'error'); return; }
  if (!expr) { toast('Enter an expression', 'error'); return; }

  let errors = 0, ok = 0;
  (layer.geojson.features || []).forEach(feat => {
    try {
      const result = _evalFCExpr(expr, feat.properties || {});
      if (!feat.properties) feat.properties = {};
      feat.properties[fieldName] = result;
      ok++;
    } catch(e) { errors++; }
  });

  // Update layer fields registry
  if (!layer.fields[fieldName]) {
    // infer type
    const sample = (layer.geojson.features || [])[0]?.properties?.[fieldName];
    layer.fields[fieldName] = typeof sample === 'number' ? 'number' : typeof sample === 'boolean' ? 'bool' : 'string';
  }

  if (errors > 0) {
    statusEl.textContent = `Done with ${errors} error(s) — check expression`;
  } else {
    statusEl.textContent = '';
  }

  updateLayerList(); renderTable(); updateStats();
  toast(`Field "${fieldName}" calculated for ${ok} feature${ok!==1?'s':''}`+(errors?` (${errors} errors)`:''), errors ? 'info' : 'success');
  document.getElementById('fieldcalc-backdrop').classList.remove('open');
}

function showServerInstructions() {
  document.getElementById('server-modal-backdrop').style.display = 'flex';
}

function closeColorPicker() {
  document.getElementById('color-picker-popup').style.display = 'none';
}

// ══════════════════════════════════════════════════
// CSV LOADER — auto-detect lat/lng columns
// ══════════════════════════════════════════════════
const CSV_LAT_NAMES = ['lat','latitude','y','northing','ylat','lat_deg','lat_dd','latitude_dd','y_northing'];
const CSV_LNG_NAMES = ['lon','lng','long','longitude','x','easting','xlon','long_deg','lng_dd','lon_dd','longitude_dd','x_easting'];
const CSV_WKT_NAMES = ['wkt_geometry','wkt','geometry','geom','shape','the_geom'];

async function loadCSV(file) {
  showProgress('Loading CSV', file.name, 20);
  try {
    const text = await file.text();
    const geojson = csvToGeoJSON(text, file.name);
    if (!geojson) { hideProgress(); return; }
    setProgress(90, 'Rendering…');
    addLayer(geojson, file.name.replace(/\.csv$/i,'').replace(/\.txt$/i,''), 'EPSG:4326', 'CSV');
    hideProgress();
    toast(`Loaded: ${file.name} (${geojson.features.length} point features)`, 'success');
  } catch(err) {
    hideProgress();
    toast('CSV error: ' + err.message, 'error');
    console.error(err);
  }
}

function csvToGeoJSON(text, filename) {
  // Parse CSV respecting quoted fields
  function parseCSV(str) {
    const rows = []; let row = []; let inQuote = false; let cell = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { row.push(cell.trim()); cell = ''; }
      else if ((ch === '\n' || ch === '\r') && !inQuote) {
        if (ch === '\r' && str[i+1] === '\n') i++;
        row.push(cell.trim()); rows.push(row); row = []; cell = '';
      } else { cell += ch; }
    }
    if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
    return rows.filter(r => r.some(c => c !== ''));
  }

  const rows = parseCSV(text);
  if (rows.length < 2) { toast('CSV is empty or has only a header row', 'error'); return null; }

  const headers = rows[0].map(h => h.replace(/^["']|["']$/g,'').trim());
  const headerLower = headers.map(h => h.toLowerCase().trim());

  // Find coordinate columns
  const latIdx = headerLower.findIndex(h => CSV_LAT_NAMES.includes(h));
  const lngIdx = headerLower.findIndex(h => CSV_LNG_NAMES.includes(h));
  const wktIdx = headerLower.findIndex(h => CSV_WKT_NAMES.includes(h));

  const hasLatLng = latIdx >= 0 && lngIdx >= 0;
  const hasWKT    = wktIdx >= 0;

  if (!hasLatLng && !hasWKT) {
    const found = headers.join(', ');
    toast(`CSV: No geometry columns found. Need lat+lng or wkt_geometry. Found: ${found}`, 'error');
    return null;
  }

  // Columns to exclude from properties (geometry columns)
  const geomCols = new Set([wktIdx, ...(hasLatLng ? [latIdx, lngIdx] : [])].filter(i => i >= 0));

  if (hasLatLng) toast(`CSV: Using "${headers[latIdx]}" / "${headers[lngIdx]}" for coordinates`, 'info');
  else toast(`CSV: Using "${headers[wktIdx]}" (WKT) for geometry`, 'info');

  const features = [];
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    let geometry = null;

    if (hasLatLng) {
      const lat = parseFloat(row[latIdx]);
      const lng = parseFloat(row[lngIdx]);
      if (!isNaN(lat) && !isNaN(lng)) geometry = { type: 'Point', coordinates: [lng, lat] };
    }

    if (!geometry && hasWKT) {
      // Parse WKT string to GeoJSON geometry
      const wktStr = (row[wktIdx] || '').trim().replace(/^"|"$/g, '');
      geometry = wktToGeometry(wktStr);
    }

    if (!geometry) { skipped++; continue; }

    const props = {};
    headers.forEach((h, i) => { if (row[i] !== undefined && !geomCols.has(i)) props[h] = row[i]; });
    features.push({ type: 'Feature', geometry, properties: props });
  }

  if (skipped > 0) toast(`CSV: Skipped ${skipped} rows with no parseable geometry`, 'info');
  if (features.length === 0) { toast('CSV: No valid features found', 'error'); return null; }

  toast(`CSV: Loaded ${features.length} feature${features.length !== 1 ? 's' : ''}`, 'success');
  return { type: 'FeatureCollection', features };
}

// Parse WKT string → GeoJSON geometry (supports Point, LineString, Polygon, Multi*)
function wktToGeometry(wkt) {
  if (!wkt) return null;
  const w = wkt.trim().toUpperCase();
  try {
    function parseCoordPair(s) {
      const parts = s.trim().split(/\s+/);
      const x = parseFloat(parts[0]), y = parseFloat(parts[1]);
      return isNaN(x) || isNaN(y) ? null : [x, y];
    }
    function parseCoordList(s) {
      return s.split(',').map(parseCoordPair).filter(Boolean);
    }
    function getRingContent(s) {
      const m = s.match(/\(([^()]+)\)/g);
      return m ? m.map(r => parseCoordList(r.replace(/[()]/g,''))) : [];
    }

    if (w.startsWith('POINT')) {
      const m = wkt.match(/POINT\s*\(\s*([^)]+)\)/i);
      if (!m) return null;
      const c = parseCoordPair(m[1]);
      return c ? { type: 'Point', coordinates: c } : null;

    } else if (w.startsWith('MULTIPOINT')) {
      const m = wkt.match(/MULTIPOINT\s*\((.+)\)/i);
      if (!m) return null;
      const pts = m[1].split(/\),\s*\(/).map(s => parseCoordPair(s.replace(/[()]/g,'')));
      return { type: 'MultiPoint', coordinates: pts.filter(Boolean) };

    } else if (w.startsWith('LINESTRING')) {
      const m = wkt.match(/LINESTRING\s*\(([^)]+)\)/i);
      if (!m) return null;
      return { type: 'LineString', coordinates: parseCoordList(m[1]) };

    } else if (w.startsWith('MULTILINESTRING')) {
      const rings = getRingContent(wkt.replace(/MULTILINESTRING\s*/i,''));
      return { type: 'MultiLineString', coordinates: rings };

    } else if (w.startsWith('MULTIPOLYGON')) {
      // Simplified: split by outer rings
      const inner = wkt.replace(/MULTIPOLYGON\s*\(\s*\(/i,'').replace(/\)\s*\)$/,'');
      const polys = inner.split(/\)\s*,\s*\(/).map(p => getRingContent('(' + p + ')'));
      return { type: 'MultiPolygon', coordinates: polys };

    } else if (w.startsWith('POLYGON')) {
      const rings = getRingContent(wkt.replace(/POLYGON\s*/i,''));
      return rings.length ? { type: 'Polygon', coordinates: rings } : null;
    }
  } catch(e) {}
  return null;
}


// ══════════════════════════════════════════════════
//  CREATE FEATURES — UNDO / REDO
// ══════════════════════════════════════════════════

function _updateVertexCount() {
  const el = document.getElementById('create-vertex-count');
  if (!el) return;
  const n = createState.drawPoints.length;
  if (n > 0 && createState.drawMode && createState.drawMode !== 'Point') {
    el.style.display = 'block';
    el.textContent = `${n} vertex${n === 1 ? '' : 'es'} placed`;
  } else {
    el.style.display = 'none';
  }
}

// Undo: if actively drawing → remove last vertex; otherwise → undo last committed feature
function createUndo() {
  if (createState.drawMode && createState.drawPoints.length > 0) {
    // Undo last placed vertex
    createState.drawPoints.pop();
    redrawCreatePreview();
    _updateVertexCount();
    toast('Vertex removed', 'info');
  } else {
    // Undo last committed feature
    if (createState.featureUndoStack.length === 0) { toast('Nothing to undo', 'info'); return; }
    const entry = createState.featureUndoStack.pop();
    const layer = state.layers[entry.layerIdx];
    if (!layer) return;
    // Remove the last feature from the layer's geojson
    const removedFeat = layer.geojson.features.pop();
    if (removedFeat) {
      createState.featureRedoStack.push({ layerIdx: entry.layerIdx, featJson: JSON.stringify(removedFeat) });
    }
    // Rebuild the Leaflet layer from remaining features
    _rebuildLeafletLayer(entry.layerIdx);
    updateCreateLayerList();
    updateLayerList();
    updateSelectionCount();
    renderTable();
    toast('Feature removed (undo)', 'info');
  }
}

// Redo: re-add last undone feature
function createRedo() {
  if (createState.featureRedoStack.length === 0) { toast('Nothing to redo', 'info'); return; }
  const entry = createState.featureRedoStack.pop();
  const layer = state.layers[entry.layerIdx];
  if (!layer) return;
  const feat = JSON.parse(entry.featJson);
  layer.geojson.features.push(feat);
  layer.leafletLayer.addData(feat);
  createState.featureUndoStack.push({ layerIdx: entry.layerIdx, featJson: entry.featJson });
  updateCreateLayerList();
  updateLayerList();
  updateSelectionCount();
  renderTable();
  toast('Feature restored (redo)', 'info');
}

// Rebuild a Leaflet layer from its geojson (needed after removing features)
function _rebuildLeafletLayer(layerIdx) {
  const layer = state.layers[layerIdx];
  if (!layer || layer.isTile) return;
  const color = layer.outlineColor || layer.color;
  const fillC = layer.fillColor || layer.color;
  const noFill = layer.noFill || false;

  // Remove old leaflet layer
  if (layer.leafletLayer && state.map.hasLayer(layer.leafletLayer)) {
    state.map.removeLayer(layer.leafletLayer);
  }

  // Rebuild with same event listeners (simplified — no per-feature click for rebuilt editable layers)
  const newLeaflet = L.geoJSON(layer.geojson, {
    style: () => ({ color, fillColor: fillC, fillOpacity: noFill ? 0 : 0.2, weight: 2, opacity: 1 }),
    pointToLayer: (feat, latlng) => L.circleMarker(latlng, {
      radius: 7, fillColor: fillC, color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.9
    }),
    onEachFeature: (feat, sublayer) => {
      const fi = (layer.geojson.features || []).indexOf(feat);
      sublayer.on('click', function(e) {
        L.DomEvent.stopPropagation(e);
        openFeatEditModal(layerIdx, fi);
      });
    }
  });
  if (layer.visible) newLeaflet.addTo(state.map);
  layer.leafletLayer = newLeaflet;
  refreshLayerZOrder();
}

// Keyboard shortcut: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
document.addEventListener('keydown', function(e) {
  // Only act when create panel is open (avoid intercepting normal typing)
  const createPanel = document.getElementById('create-float');
  if (!createPanel || !createPanel.classList.contains('visible')) return;
  // Don't intercept if focus is inside an input/textarea
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); createUndo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); createRedo(); }
});


// ══════════════════════════════════════════════════
//  SERVICE CATALOGUE — Excel-driven layer browser
// ══════════════════════════════════════════════════

let _catalogueData = [];  // [{group, name, url}]

// Load catalogue.csv from same folder as index.html
async function loadCatalogueCSV() {
  const statusEl = document.getElementById('cat-status-text');
  if (statusEl) statusEl.textContent = 'Loading catalogue.csv…';

  // Try multiple relative paths (http:// and file:// contexts)
  const base = document.location.href.replace(/[#?].*/, '').replace(/[^/]+$/, '');
  const paths = ['./catalogue.csv', 'catalogue.csv', base + 'catalogue.csv'];

  for (const path of paths) {
    try {
      const resp = await fetch(path, { cache: 'no-cache' });
      if (resp.ok) {
        const text = await resp.text();
        _parseCatalogueCSV(text);
        return;
      }
    } catch(e) { /* try next path */ }
  }

  // All fetch attempts failed — show empty state + file picker fallback
  const emptyEl = document.getElementById('cat-empty');
  const treeEl  = document.getElementById('cat-tree');
  const fileRow = document.getElementById('cat-file-fallback');
  if (emptyEl) emptyEl.style.display = 'block';
  if (treeEl)  treeEl.style.display  = 'none';
  if (fileRow) fileRow.style.display = 'block';
  if (statusEl) statusEl.textContent =
    'Cannot auto-load catalogue.csv — serve via a web server, or browse below.';
  console.warn('loadCatalogueCSV: all fetch paths failed');
}

// ── CATALOGUE DROP ZONE ──────────────────────────
function catDropZoneDragOver(e) {
  e.preventDefault();
  const dz = document.getElementById('cat-drop-zone');
  if (dz) {
    dz.style.borderColor = 'var(--teal)';
    dz.style.background  = 'rgba(20,177,231,0.06)';
  }
}
function catDropZoneDragLeave(e) {
  const dz = document.getElementById('cat-drop-zone');
  if (dz) {
    dz.style.borderColor = 'var(--border)';
    dz.style.background  = 'transparent';
  }
}
function catDropZoneDrop(e) {
  e.preventDefault();
  catDropZoneDragLeave(e);
  const file = Array.from(e.dataTransfer.files).find(f => f.name.toLowerCase().endsWith('.csv'));
  if (!file) { toast('Please drop a .csv file', 'error'); return; }
  _loadCatFile(file);
}

async function loadCatalogueFromFilePicker(event) {
  const file = event.target.files[0]; if (!file) return;
  event.target.value = '';
  _loadCatFile(file);
}

async function _loadCatFile(file) {
  const statusEl = document.getElementById('cat-status-text');
  if (statusEl) statusEl.textContent = 'Loading ' + file.name + '…';
  try {
    const text = await file.text();
    document.getElementById('cat-empty').style.display = 'none';
    document.getElementById('cat-file-fallback').style.display = 'none';
    _parseCatalogueCSV(text);
  } catch(e) {
    if (statusEl) statusEl.textContent = 'Error: ' + e.message;
  }
}

function _parseCatalogueCSV(text) {
  const statusEl = document.getElementById('cat-status-text');

  // Simple CSV parse (handles quoted fields)
  function parseCSVRow(line) {
    const cols = []; let cell = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cell.trim()); cell = ''; }
      else { cell += ch; }
    }
    cols.push(cell.trim());
    return cols;
  }

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    if (statusEl) statusEl.textContent = 'catalogue.csv is empty';
    return;
  }

  const headers = parseCSVRow(lines[0]).map(h => h.replace(/^"|"$/g,'').toLowerCase().trim());
  const findCol = (names) => headers.findIndex(h => names.includes(h));

  const groupIdx = findCol(['group','category','section','heading']);
  const nameIdx  = findCol(['name','label','title','layer','layername']);
  const urlIdx   = findCol(['url','serviceurl','service_url','endpoint','link']);

  if (nameIdx < 0 || urlIdx < 0) {
    if (statusEl) statusEl.textContent = 'catalogue.csv: need "Name" and "URL" columns. Found: ' + headers.join(', ');
    return;
  }

  _catalogueData = lines.slice(1).map(line => {
    const cols = parseCSVRow(line).map(c => c.replace(/^"|"$/g,'').trim());
    return {
      group: groupIdx >= 0 ? (cols[groupIdx] || 'Uncategorised') : 'Uncategorised',
      name:  cols[nameIdx] || '',
      url:   cols[urlIdx]  || '',
    };
  }).filter(r => r.name && r.url);

  if (!_catalogueData.length) {
    if (statusEl) statusEl.textContent = 'catalogue.csv: no valid rows found';
    return;
  }

  if (statusEl) statusEl.textContent = `${_catalogueData.length} service${_catalogueData.length !== 1 ? 's' : ''} loaded from catalogue.csv`;
  renderCatalogueTree(_catalogueData);
}

function renderCatalogueTree(entries) {
  const groups = {};
  entries.forEach(e => {
    const g = e.group || 'Uncategorised';
    if (!groups[g]) groups[g] = [];
    groups[g].push(e);
  });

  const groupNames = Object.keys(groups).sort();
  if (!groupNames.length) {
    document.getElementById('cat-tree').style.display = 'none';
    document.getElementById('cat-empty').style.display = 'block';
    return;
  }

  const html = groupNames.map(g => {
    const items = groups[g].map((e, i) => {
      const safeUrl  = escHtml(e.url);
      const safeName = escHtml(e.name);
      return `<div class="cat-item" data-url="${safeUrl}" data-name="${safeName}" data-group="${escHtml(g)}"
        onclick="addLayerFromCatalogue('${safeUrl}','${safeName}')"
        title="${safeUrl}"
        style="padding:5px 10px 5px 24px;font-size:10px;cursor:pointer;border-bottom:1px solid var(--border);
               display:flex;align-items:center;gap:6px;transition:background 0.1s;"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <span style="color:var(--teal);font-size:11px;flex-shrink:0;">⬦</span>
        <span style="font-family:var(--mono);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${safeName}</span>
        <span style="font-size:9px;color:var(--text3);flex-shrink:0;padding:2px 5px;background:var(--bg);border:1px solid var(--border);border-radius:3px;"
          onclick="event.stopPropagation();navigator.clipboard.writeText('${safeUrl}');toast('URL copied','success')"
          title="Copy URL">⎘</span>
      </div>`;
    }).join('');

    const groupId = 'cat-grp-' + g.replace(/[^a-zA-Z0-9]/g, '_');
    return `<div class="cat-group" data-group="${escHtml(g)}">
      <div class="cat-group-header" onclick="toggleCatGroup('${groupId}')"
        style="padding:6px 10px;font-family:var(--mono);font-size:10px;font-weight:600;
               color:#2c3e50;letter-spacing:0.5px;background:var(--bg3);
               display:flex;align-items:center;gap:6px;cursor:pointer;
               border-bottom:1px solid var(--border);user-select:none;">
        <span id="${groupId}-arrow" style="font-size:9px;transition:transform 0.15s;display:inline-block;">▶</span>
        <span style="flex:1;">${escHtml(g)}</span>
        <span style="font-size:9px;color:var(--text3);font-weight:400;">${groups[g].length}</span>
      </div>
      <div id="${groupId}" style="display:none;">${items}</div>
    </div>`;
  }).join('');

  document.getElementById('cat-tree-body').innerHTML = html;
  document.getElementById('cat-tree').style.display = 'block';
  document.getElementById('cat-empty').style.display = 'none';
}

function toggleCatGroup(groupId) {
  const body  = document.getElementById(groupId);
  const arrow = document.getElementById(groupId + '-arrow');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display  = isOpen ? 'none' : 'block';
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
}

function catExpandAll() {
  document.querySelectorAll('[id^="cat-grp-"]').forEach(el => {
    if (!el.id.endsWith('-arrow')) {
      el.style.display = 'block';
      const arrow = document.getElementById(el.id + '-arrow');
      if (arrow) arrow.style.transform = 'rotate(90deg)';
    }
  });
}

function catCollapseAll() {
  document.querySelectorAll('[id^="cat-grp-"]').forEach(el => {
    if (!el.id.endsWith('-arrow')) {
      el.style.display = 'none';
      const arrow = document.getElementById(el.id + '-arrow');
      if (arrow) arrow.style.transform = '';
    }
  });
}

function filterCatalogue() {
  const q = (document.getElementById('cat-search').value || '').toLowerCase();
  if (!q) {
    // Restore from full data
    renderCatalogueTree(_catalogueData);
    return;
  }
  const filtered = _catalogueData.filter(e =>
    e.name.toLowerCase().includes(q) ||
    e.group.toLowerCase().includes(q) ||
    e.url.toLowerCase().includes(q)
  );
  renderCatalogueTree(filtered);
  // Auto-expand all groups when searching
  if (q) catExpandAll();
}

async function addLayerFromCatalogue(url, name) {
  if (!url) return;

  // Warn if zoomed too far out (risk of incomplete feature load)
  if (state.map) {
    const zoom = state.map.getZoom();
    const WARN_ZOOM = 10; // below this, warn user
    if (zoom < WARN_ZOOM) {
      const proceed = confirm(
        `You are zoomed out to zoom level ${zoom}.

` +
        `Catalogue layers load only features within the current map extent. ` +
        `At this zoom level the extent is very large and only the first 100,000 features will be returned — ` +
        `you may not see all data.

` +
        `Zoom in closer for better results, or click OK to load anyway.`
      );
      if (!proceed) return;
    }
  }

  openURLModal(); // close the modal first so user sees progress
  setURLStatus('Loading from catalogue…', 'loading');

  // Determine type: ArcGIS FeatureServer/MapServer, WMS, XYZ tile, or GeoJSON URL
  const isArcGIS = /\/(FeatureServer|MapServer|ImageServer)\/?\d*$/i.test(url);
  const isXYZ    = url.includes('{z}') || url.includes('{x}') || url.includes('{y}');
  const isWMS    = url.toLowerCase().includes('service=wms') || url.toLowerCase().includes('request=getcapabilities');

  if (isArcGIS) {
    await _catalogueLoadArcGIS(url, name);
  } else if (isXYZ) {
    _catalogueLoadXYZ(url, name);
  } else if (isWMS) {
    toast('WMS from catalogue: use the WMS tab to configure layers', 'info');
  } else {
    // Try as GeoJSON URL
    await _catalogueLoadGeoJSONURL(url, name);
  }
}

async function _catalogueLoadArcGIS(url, name) {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  const MAX_FEATURES = 100000;

  // Build extent query from current map bounds
  const queryParams = {
    where: '1=1',
    outFields: '*',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: MAX_FEATURES,
    returnGeometry: 'true'
  };

  if (state.map) {
    const b = state.map.getBounds();
    queryParams.geometry = b.getWest() + ',' + b.getSouth() + ',' + b.getEast() + ',' + b.getNorth();
    queryParams.geometryType = 'esriGeometryEnvelope';
    queryParams.inSR = '4326';
    queryParams.spatialRel = 'esriSpatialRelIntersects';
  }

  try {
    const params = new URLSearchParams(queryParams);
    const resp = await fetch(cleanUrl + '/query?' + params.toString());
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const geojson = await resp.json();
    if (geojson.error) throw new Error(geojson.error.message || JSON.stringify(geojson.error));
    if (!geojson.features) throw new Error('No features returned');

    const n = geojson.features.length;
    const truncated = n >= MAX_FEATURES;
    addLayer(geojson, name, 'EPSG:4326', 'ArcGIS REST');
    toast(`${name}: ${n} feature${n!==1?'s':''} loaded${truncated?' (limit reached — zoom in)':''}`, 'success');
  } catch(err) {
    toast(`Catalogue: ${name} — ${err.message}`, 'error');
  }
}

function _catalogueLoadXYZ(url, name) {
  try {
    const tileL = L.tileLayer(url, { attribution: name, opacity: 0.85 });
    if (state.map) tileL.addTo(state.map);
    state.layers.push({
      name, format: 'Tile', color: '#f0883e', leafletLayer: tileL,
      visible: true, isTile: true, tileUrl: url, tileType: 'xyz',
      fields: {}, geojson: { features: [] }, geomType: 'Tile', sourceCRS: 'EPSG:4326'
    });
    updateLayerList(); updateExportLayerList();
    toast(`Tile layer added: ${name}`, 'success');
  } catch(err) {
    toast(`Catalogue XYZ error: ${err.message}`, 'error');
  }
}

async function _catalogueLoadGeoJSONURL(url, name) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const geojson = await resp.json();
    if (!geojson.features && geojson.type !== 'FeatureCollection') throw new Error('Not a valid GeoJSON response');
    addLayer(geojson, name, 'EPSG:4326', 'GeoJSON URL');
    toast(`${name}: loaded from GeoJSON URL`, 'success');
  } catch(err) {
    toast(`Catalogue GeoJSON error: ${err.message}`, 'error');
  }
}


// ══════════════════════════════════════════════════
//  EXPORT — CRS reprojection fix for CSV lat/lng columns
// ══════════════════════════════════════════════════
// The existing exportData() already calls reprojectGeoJSON before export,
// so all formats receive projected coordinates.  
// For CSV we also add explicit X/Y columns when the output CRS is projected.
const _origGeojsonToCSV = geojsonToCSV;
function geojsonToCSV(gj, exportCRS) {
  const feats = gj.features || [];
  if (!feats.length) return '';
  const fields = [...new Set(feats.flatMap(f => Object.keys(f.properties || {})))];
  const isProjected = exportCRS && exportCRS !== 'EPSG:4326' && CRS_DEFS[exportCRS] && CRS_DEFS[exportCRS].includes('+units=m');
  const coordCols = isProjected ? ['x_easting', 'y_northing'] : ['longitude', 'latitude'];
  const header = [...fields, ...coordCols, 'wkt_geometry'].join(',');
  const rows = feats.map(f => {
    const props = f.properties || {};
    const vals = fields.map(k => {
      const v = props[k] ?? '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    });
    // Extract point coords for explicit columns
    let px = '', py = '';
    if (f.geometry && f.geometry.type === 'Point') {
      px = f.geometry.coordinates[0]; py = f.geometry.coordinates[1];
    }
    vals.push(String(px), String(py));
    let wkt = ''; try { wkt = coordsToWKTGeom(f.geometry); } catch(e) {}
    vals.push(`"${wkt}"`);
    return vals.join(',');
  });
  return [header, ...rows].join('\n');
}

// Patch exportData to pass CRS to CSV converter
const _origExportData = exportData;
function exportData() {
  const layerIdx = parseInt(document.getElementById('export-layer-select').value);
  const layer = state.layers[layerIdx];
  if (!layer) { toast('No layer selected', 'error'); return; }
  const exportCRS = document.getElementById('export-crs-select').value;
  const gj = JSON.parse(JSON.stringify(layer.geojson));

  // Filter to selected features if scope = 'selected'
  if (exportScope === 'selected') {
    if (state.selectedFeatureIndices.size === 0) {
      toast('No features selected', 'error'); return;
    }
    if (layerIdx === state.activeLayerIndex) {
      gj.features = (gj.features || []).filter((_, i) => state.selectedFeatureIndices.has(i));
    }
    if (!gj.features.length) { toast('No selected features match this layer', 'error'); return; }
  }

  // Reproject
  if (exportCRS !== 'EPSG:4326') {
    try { reprojectGeoJSON(gj, 'EPSG:4326', exportCRS); }
    catch(e) { toast(`CRS transform error: ${e.message}`, 'error'); return; }
  }

  let blob, filename;
  switch (selectedExportFormat) {
    case 'geojson':
      blob = new Blob([JSON.stringify(gj, null, 2)], { type: 'application/json' });
      filename = `${layer.name}.geojson`;
      break;
    case 'kml':
      blob = new Blob([geojsonToKML(gj, layer.name)], { type: 'application/vnd.google-earth.kml+xml' });
      filename = `${layer.name}.kml`;
      break;
    case 'csv':
      blob = new Blob([geojsonToCSV(gj, exportCRS)], { type: 'text/csv' });
      filename = `${layer.name}.csv`;
      break;
    case 'wkt':
      blob = new Blob([geojsonToWKT(gj)], { type: 'text/plain' });
      filename = `${layer.name}_wkt.txt`;
      break;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);

  const featCount = gj.features ? gj.features.length : '?';
  const crsNote = exportCRS !== 'EPSG:4326' ? ` [${exportCRS}]` : '';
  const scopeNote = exportScope === 'selected' ? ` (${featCount} selected)` : ` (${featCount} features)`;
  toast('Exported: ' + filename + scopeNote + crsNote, 'success');
}
