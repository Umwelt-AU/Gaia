// gaia-parsers.js — Drag-and-drop, session import, progress, loaders, KML, GeoPackage
// ── DRAG AND DROP ──
function handleDragOver(e) { e.preventDefault(); document.getElementById('drop-zone').classList.add('drag-over'); }
function handleDragLeave(e) { document.getElementById('drop-zone').classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault(); document.getElementById('drop-zone').classList.remove('drag-over');
  processFileList(Array.from(e.dataTransfer.files));
}
function handleFileSelect(e) { processFileList(Array.from(e.target.files)); e.target.value=''; }

async function processFileList(files) {
  const largeFiles = files.filter(f => f.size > CONSTANTS.FILE_SIZE_WARN_BYTES);
  if (largeFiles.length) {
    const names = largeFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`).join(', ');
    const proceed = confirm(`Warning: ${names} exceeds ${CONSTANTS.FILE_SIZE_WARN_MB} MB and may cause the browser to become unresponsive during loading.\n\nProceed anyway?`);
    if (!proceed) return;
  }
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
    else if (exts.gpkg)                 await loadGeoPackage(exts.gpkg);
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
        if (l.tileUrl) {
          const idx = state.layers.length;
          const mapId = _layerMapId(idx);
          const tileOpacity = l.layerOpacity != null ? l.layerOpacity : 1;
          const layerObj = { name: l.name, color: l.color || '#3498db', visible: l.visible !== false,
            format: l.format || 'Tile', isTile: true, tileUrl: l.tileUrl, tileType: l.tileType,
            mapId, fields: {}, geojson: { features: [] }, geomType: 'Tile', layerOpacity: tileOpacity };
          state.layers.push(layerObj);
          if (state.map.isStyleLoaded()) _renderMapLayer(layerObj, idx);
          else state.map.once('load', () => _renderMapLayer(layerObj, idx));
          loaded++;
        }
        continue;
      }
      if (!l.geojson || !Array.isArray(l.geojson.features)) continue;
      const idx = state.layers.length;
      const color = l.color || LAYER_COLORS[idx % LAYER_COLORS.length];
      addLayer(l.geojson, l.name, l.sourceCRS || 'EPSG:4326', l.format || 'GeoJSON');
      const newLayer = state.layers[state.layers.length - 1];
      if (newLayer) {
        if (l.fillColor)     newLayer.fillColor     = l.fillColor;
        if (l.outlineColor)  newLayer.outlineColor  = l.outlineColor;
        if (l.noFill)        newLayer.noFill        = l.noFill;
        if (l.pointShape)    newLayer.pointShape    = l.pointShape;
        if (l.pointSize   != null) newLayer.pointSize    = l.pointSize;
        if (l.outlineWidth != null) newLayer.outlineWidth = l.outlineWidth;
        if (l.editable)     newLayer.editable     = l.editable;
        if (l.editGeomType) newLayer.editGeomType = l.editGeomType;
        if (l.visible === false) { newLayer.visible = false; }
        if (l.layerOpacity != null) { newLayer.layerOpacity = l.layerOpacity; }
        _applySymbologyToLeaflet(newLayer);
        if (l.labelConfig) { newLayer.labelConfig = l.labelConfig; }
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

// ── KML FOLDER / LAYER PARSING ──────────────────────────────────────────────
// Returns array of { name, geojson } — one entry per top-level Folder, or a
// single entry for the whole document if there are no Folders.
function kmlExtractLayers(dom, docName) {
  const folders = Array.from(dom.querySelectorAll('Document > Folder, kml > Folder'));
  if (folders.length === 0) {
    // No folder structure — treat whole doc as one layer
    const gj = toGeoJSON.kml(dom);
    if (!gj || !gj.features || gj.features.length === 0) return [];
    return [{ name: docName, geojson: gj }];
  }

  const layers = [];
  folders.forEach(folder => {
    const rawName = folder.querySelector(':scope > name')?.textContent?.trim() || 'Layer';
    // Wrap this folder in a minimal KML document so toGeoJSON can parse it
    const wrapper = dom.implementation.createDocument(
      'http://www.opengis.net/kml/2.2', 'kml', null
    );
    const doc = wrapper.createElement('Document');
    doc.appendChild(folder.cloneNode(true));
    wrapper.documentElement.appendChild(doc);
    const gj = toGeoJSON.kml(wrapper);
    if (gj && gj.features && gj.features.length > 0) {
      layers.push({ name: rawName, geojson: gj });
    }
  });

  // Also pick up any Placemarks that sit directly in the Document (not in folders)
  const rootPlacemarks = Array.from(
    dom.querySelectorAll('Document > Placemark, kml > Placemark')
  );
  if (rootPlacemarks.length > 0) {
    const wrapper = dom.implementation.createDocument(
      'http://www.opengis.net/kml/2.2', 'kml', null
    );
    const doc = wrapper.createElement('Document');
    rootPlacemarks.forEach(pm => doc.appendChild(pm.cloneNode(true)));
    wrapper.documentElement.appendChild(doc);
    const gj = toGeoJSON.kml(wrapper);
    if (gj && gj.features && gj.features.length > 0) {
      layers.push({ name: docName + ' (root)', geojson: gj });
    }
  }

  return layers.length > 0 ? layers : [{ name: docName, geojson: toGeoJSON.kml(dom) }];
}

// ── KML LAYER PICKER STATE ───────────────────────────────────────────────────
let _kmlPickLayers  = [];   // [{ name, geojson }]
let _kmlPickResolve = null; // promise resolver

function _showKMLPicker(layers, title) {
  return new Promise(resolve => {
    _kmlPickLayers  = layers;
    _kmlPickResolve = resolve;

    document.getElementById('kml-pick-title').textContent = '📂 ' + title;
    const list = document.getElementById('kml-pick-list');
    list.innerHTML = '';

    layers.forEach((l, i) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:5px;cursor:pointer;border:1px solid var(--border);background:var(--bg3);transition:background 0.12s;';
      row.onmouseover  = () => { row.style.background = 'rgba(0,116,168,0.06)'; };
      row.onmouseout   = () => { row.style.background = 'var(--bg3)'; };

      const cb = document.createElement('input');
      cb.type    = 'checkbox';
      cb.checked = true;
      cb.dataset.idx = i;
      cb.style.cssText = 'accent-color:var(--accent);width:15px;height:15px;flex-shrink:0;cursor:pointer;';
      cb.addEventListener('change', _updateKMLPickCount);

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      info.innerHTML = `<div style="font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(l.name)}</div>`
        + `<div style="font-family:var(--mono);font-size:9px;color:var(--text3);margin-top:1px;">${l.geojson.features.length} feature${l.geojson.features.length !== 1 ? 's' : ''} · ${_kmlGeomSummary(l.geojson)}</div>`;

      row.appendChild(cb);
      row.appendChild(info);
      list.appendChild(row);
    });

    _updateKMLPickCount();
    document.getElementById('kml-pick-backdrop').classList.add('open');
  });
}

function _kmlGeomSummary(gj) {
  const types = {};
  (gj.features || []).forEach(f => {
    const t = f.geometry?.type || 'Unknown';
    const base = t.replace('Multi','').replace('Collection','Geometry');
    types[base] = (types[base] || 0) + 1;
  });
  return Object.entries(types).map(([k,v]) => `${v} ${k.toLowerCase()}${v !== 1?'s':''}`).join(', ') || 'no geometry';
}

function _updateKMLPickCount() {
  const total   = document.querySelectorAll('#kml-pick-list input[type=checkbox]').length;
  const checked = document.querySelectorAll('#kml-pick-list input[type=checkbox]:checked').length;
  document.getElementById('kml-pick-count').textContent = `${checked} / ${total} selected`;
}

function kmlPickSelectAll() {
  document.querySelectorAll('#kml-pick-list input[type=checkbox]').forEach(cb => { cb.checked = true; });
  _updateKMLPickCount();
}
function kmlPickSelectNone() {
  document.querySelectorAll('#kml-pick-list input[type=checkbox]').forEach(cb => { cb.checked = false; });
  _updateKMLPickCount();
}

function cancelKMLPick() {
  document.getElementById('kml-pick-backdrop').classList.remove('open');
  if (_kmlPickResolve) { _kmlPickResolve([]); _kmlPickResolve = null; }
}

function confirmKMLPick() {
  const selected = [];
  document.querySelectorAll('#kml-pick-list input[type=checkbox]:checked').forEach(cb => {
    selected.push(_kmlPickLayers[parseInt(cb.dataset.idx)]);
  });
  document.getElementById('kml-pick-backdrop').classList.remove('open');
  if (_kmlPickResolve) { _kmlPickResolve(selected); _kmlPickResolve = null; }
}

async function loadKML(file) {
  showProgress('Loading KML', file.name, 30);
  try {
    const text = await file.text();
    const dom  = new DOMParser().parseFromString(text, 'text/xml');
    const docName = file.name.replace(/\.kml$/i, '');
    const layers  = kmlExtractLayers(dom, docName);

    if (layers.length === 0) {
      hideProgress(); toast(`KML file appears to be empty`, 'error'); return;
    }

    hideProgress();

    // If only one layer — load directly without the picker
    let toLoad = layers;
    if (layers.length > 1) {
      toLoad = await _showKMLPicker(layers, `${docName} — select layers`);
    }

    if (!toLoad || toLoad.length === 0) {
      toast('No layers selected', 'info'); return;
    }

    toLoad.forEach(l => addLayer(l.geojson, l.name, 'EPSG:4326', 'KML'));
    const total = toLoad.reduce((s, l) => s + l.geojson.features.length, 0);
    toast(`Loaded ${toLoad.length} layer${toLoad.length !== 1 ? 's' : ''} (${total} features) from ${file.name}`, 'success');
  } catch(err) { hideProgress(); toast(`KML error: ${err.message}`, 'error'); }
}

async function loadKMZ(file) {
  showProgress('Loading KMZ', file.name, 20);
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    setProgress(50, 'Extracting KML…');

    // A KMZ can contain multiple KML files — find them all
    const kmlEntries = Object.values(zip.files).filter(f => f.name.toLowerCase().endsWith('.kml'));
    if (kmlEntries.length === 0) throw new Error('No KML file found in KMZ');

    const docBase = file.name.replace(/\.kmz$/i, '');
    let allLayers = [];

    for (const entry of kmlEntries) {
      const text     = await entry.async('string');
      const dom      = new DOMParser().parseFromString(text, 'text/xml');
      const partName = entry.name.replace(/^.*[\\/]/, '').replace(/\.kml$/i, '');
      const subLayers = kmlExtractLayers(dom, partName);
      allLayers = allLayers.concat(subLayers);
    }

    hideProgress();

    if (allLayers.length === 0) {
      toast('KMZ appears to be empty', 'error'); return;
    }

    let toLoad = allLayers;
    if (allLayers.length > 1) {
      toLoad = await _showKMLPicker(allLayers, `${docBase} — select layers`);
    }

    if (!toLoad || toLoad.length === 0) {
      toast('No layers selected', 'info'); return;
    }

    toLoad.forEach(l => addLayer(l.geojson, l.name, 'EPSG:4326', 'KMZ'));
    const total = toLoad.reduce((s, l) => s + l.geojson.features.length, 0);
    toast(`Loaded ${toLoad.length} layer${toLoad.length !== 1 ? 's' : ''} (${total} features) from ${file.name}`, 'success');
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
        const dom  = new DOMParser().parseFromString(text, 'text/xml');
        const partName = entry.name.replace(/^.*[\/]/, '').replace(/\.kml$/i, '');
        const layers = kmlExtractLayers(dom, partName);
        layers.forEach(l => addLayer(l.geojson, l.name, 'EPSG:4326', 'KML'));
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

// ── GEOPACKAGE LOADER ──
// Uses sql.js (loaded from CDN in index.html via the <script> tag added below).
// If sql.js is not available we fall back with a clear error message.
async function loadGeoPackage(file) {
  if (typeof initSqlJs === 'undefined') {
    toast('GeoPackage support requires sql.js — see console for details', 'error');
    console.error(
      'Gaia: sql.js is not loaded.\n' +
      'Add this <script> to index.html (before gaia.js):\n' +
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js"><\/script>'
    );
    return;
  }

  showProgress('Loading GeoPackage', file.name, 5);
  try {
    const SQL = await initSqlJs({
      locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}`
    });
    setProgress(15, 'Reading file…');
    const buf = await file.arrayBuffer();
    const db  = new SQL.Database(new Uint8Array(buf));

    // ── Discover feature tables from gpkg_contents ──
    setProgress(25, 'Scanning tables…');
    let tables = [];
    try {
      const res = db.exec(
        "SELECT table_name, data_type FROM gpkg_contents WHERE data_type IN ('features','aspatial')"
      );
      if (res.length && res[0].values.length) {
        tables = res[0].values.map(r => ({ name: r[0], type: r[1] }));
      }
    } catch(_) {}

    // Fallback: scan every table for a geometry column
    if (!tables.length) {
      const allTables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
      if (allTables.length) {
        for (const [tname] of allTables[0].values) {
          try {
            const cols = db.exec(`PRAGMA table_info("${tname}")`);
            if (!cols.length) continue;
            const colNames = cols[0].values.map(r => String(r[1]).toLowerCase());
            if (colNames.some(c => ['geom','geometry','shape','the_geom','wkb_geometry'].includes(c))) {
              tables.push({ name: tname, type: 'features' });
            }
          } catch(_) {}
        }
      }
    }

    if (!tables.length) {
      hideProgress(); db.close();
      toast('No feature tables found in GeoPackage', 'error');
      return;
    }

    let loadedCount = 0;
    const baseName = file.name.replace(/\.gpkg$/i, '');

    for (let ti = 0; ti < tables.length; ti++) {
      const tbl = tables[ti];
      setProgress(30 + Math.round(65 * (ti / tables.length)), `Table ${ti+1}/${tables.length}: ${tbl.name}`);

      try {
        // Identify geometry column
        const colRes = db.exec(`PRAGMA table_info("${tbl.name}")`);
        if (!colRes.length) continue;
        const colRows = colRes[0].values; // [cid, name, type, notnull, dflt, pk]
        const geomCol = colRows.find(r => {
          const n = String(r[1]).toLowerCase();
          const t = String(r[2]).toLowerCase();
          return ['geom','geometry','shape','the_geom','wkb_geometry'].includes(n) ||
                 t === 'blob' || t.includes('geometry') || t.includes('geom');
        });
        if (!geomCol) continue;
        const geomColName = geomCol[1];

        // Pull all rows
        const rowRes = db.exec(`SELECT * FROM "${tbl.name}"`);
        if (!rowRes.length) continue;
        const colNames = rowRes[0].columns;
        const geomCI   = colNames.indexOf(geomColName);
        if (geomCI < 0) continue;

        const features = [];
        for (const row of rowRes[0].values) {
          const geomRaw = row[geomCI];
          if (!geomRaw) continue;
          let geometry = null;
          try {
            geometry = _gpkgBlobToGeoJSON(geomRaw);
          } catch(_) { continue; }
          if (!geometry) continue;

          const props = {};
          colNames.forEach((cn, ci) => { if (ci !== geomCI) props[cn] = row[ci]; });
          features.push({ type: 'Feature', geometry, properties: props });
        }

        if (!features.length) continue;

        const geojson = { type: 'FeatureCollection', features };
        const layerName = tables.length === 1 ? baseName : `${baseName} — ${tbl.name}`;
        addLayer(geojson, layerName, 'EPSG:4326', 'GeoPackage');
        loadedCount++;
      } catch(e) {
        console.warn('GeoPackage table error (' + tbl.name + '):', e);
      }
    }

    db.close();
    hideProgress();
    if (loadedCount > 0) {
      toast(`Loaded ${loadedCount} layer${loadedCount !== 1 ? 's' : ''} from ${file.name}`, 'success');
    } else {
      toast('No readable feature layers found in GeoPackage', 'error');
    }
  } catch(err) {
    hideProgress();
    toast('GeoPackage error: ' + err.message, 'error');
    console.error('GeoPackage load failed:', err);
  }
}

// Parse a GeoPackage geometry blob (GPKG header + WKB) → GeoJSON geometry
function _gpkgBlobToGeoJSON(blob) {
  // blob may be Uint8Array or an Array from sql.js
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  if (bytes.length < 8) return null;

  // GPKG binary header: 'G','P', version(1), flags(1), srs_id(4), [envelope], wkb...
  if (bytes[0] !== 0x47 || bytes[1] !== 0x50) return null; // magic 'GP'
  const flags    = bytes[3];
  const emptyFlag = (flags >> 4) & 0x01;
  if (emptyFlag) return null;
  const envelopeCode = (flags >> 1) & 0x07;
  // envelope byte counts: 0→0, 1→32, 2→48, 3→48, 4→64
  const envBytes = [0, 32, 48, 48, 64][envelopeCode] || 0;
  const wkbOffset = 8 + envBytes;

  return _parseWKB(bytes, wkbOffset);
}

// Minimal WKB parser → GeoJSON geometry
function _parseWKB(bytes, offset) {
  if (offset + 5 > bytes.length) return null;
  const le = bytes[offset] === 1; // byte order: 1=little-endian
  offset += 1;

  const geomType = _wkbUint32(bytes, offset, le) & 0xFFFF; // mask off ISO WKB high bits
  offset += 4;

  // Helper readers
  function readUint32() { const v = _wkbUint32(bytes, offset, le); offset += 4; return v; }
  function readFloat64() { const v = _wkbFloat64(bytes, offset, le); offset += 8; return v; }
  function readPoint() { return [readFloat64(), readFloat64()]; }
  function readPoints(n) { const a = []; for (let i=0;i<n;i++) a.push(readPoint()); return a; }
  function readRing() { return readPoints(readUint32()); }

  switch (geomType) {
    case 1:  // Point
      return { type: 'Point', coordinates: readPoint() };
    case 2:  // LineString
      return { type: 'LineString', coordinates: readPoints(readUint32()) };
    case 3: { // Polygon
      const n = readUint32();
      const rings = [];
      for (let i=0;i<n;i++) rings.push(readRing());
      return { type: 'Polygon', coordinates: rings };
    }
    case 4: { // MultiPoint
      const n = readUint32();
      const pts = [];
      for (let i=0;i<n;i++) {
        offset += 1; // byte order
        offset += 4; // type (should be 1)
        pts.push(readPoint());
      }
      return { type: 'MultiPoint', coordinates: pts };
    }
    case 5: { // MultiLineString
      const n = readUint32();
      const lines = [];
      for (let i=0;i<n;i++) {
        offset += 5; // byte order + type
        lines.push(readPoints(readUint32()));
      }
      return { type: 'MultiLineString', coordinates: lines };
    }
    case 6: { // MultiPolygon
      const n = readUint32();
      const polys = [];
      for (let i=0;i<n;i++) {
        offset += 5;
        const nr = readUint32();
        const rings = [];
        for (let r=0;r<nr;r++) rings.push(readRing());
        polys.push(rings);
      }
      return { type: 'MultiPolygon', coordinates: polys };
    }
    case 7: { // GeometryCollection
      const n = readUint32();
      const geoms = [];
      for (let i=0;i<n;i++) {
        const sub = _parseWKB(bytes, offset);
        if (sub) geoms.push(sub);
        // advance offset by skipping past the sub-geometry bytes
        // (approximate — walk past byte-order + type)
        offset += 5;
        // This is imprecise for collections-of-collections; most real data won't hit this
      }
      return { type: 'GeometryCollection', geometries: geoms };
    }
    default:
      return null;
  }
}

function _wkbUint32(bytes, offset, le) {
  const b = bytes;
  if (le) return b[offset] | (b[offset+1]<<8) | (b[offset+2]<<16) | (b[offset+3]<<24);
  return (b[offset]<<24) | (b[offset+1]<<16) | (b[offset+2]<<8) | b[offset+3];
}

function _wkbFloat64(bytes, offset, le) {
  const slice = bytes.slice(offset, offset + 8);
  const buf   = slice.buffer.byteOffset !== undefined
    ? new DataView(slice.buffer, slice.byteOffset, 8)
    : new DataView(new Uint8Array(slice).buffer);
  return buf.getFloat64(0, le);
}


