// gaia-tools.js — CSV loader, create-features undo/redo, service catalogue, export CRS fix
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

// _evalFCExpr defined in gaia-utils.js

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

function closeColorPicker() {
  document.getElementById('color-picker-popup').style.display = 'none';
}

// ══════════════════════════════════════════════════
// CSV LOADER — auto-detect lat/lng columns
// ══════════════════════════════════════════════════
const CSV_LAT_NAMES = ['lat','latitude','y','northing','ylat','lat_deg','lat_dd','latitude_dd','y_northing'];
const CSV_LNG_NAMES = ['lon','lng','long','longitude','x','easting','xlon','long_deg','lng_dd','lon_dd','longitude_dd','x_easting'];
const CSV_WKT_NAMES = ['wkt_geometry','wkt','geometry','geom','shape','the_geom'];

// Column names that suggest projected (metric) coordinates rather than geographic lat/lng
const CSV_PROJECTED_LAT_NAMES = ['northing','y_northing'];
const CSV_PROJECTED_LNG_NAMES = ['easting','x_easting'];

async function loadCSV(file) {
  showProgress('Loading CSV', file.name, 20);
  try {
    const text = await file.text();
    const geojson = await csvToGeoJSON(text, file.name);
    if (!geojson) { hideProgress(); return; }
    setProgress(90, 'Rendering…');
    addLayer(geojson, file.name.replace(/\.csv$/i,'').replace(/\.txt$/i,''), 'EPSG:4326', 'CSV');
    hideProgress();
    toast(`${file.name}: ${geojson.features.length} feature${geojson.features.length!==1?'s':''} loaded`, 'success');
  } catch(err) {
    hideProgress();
    toast('CSV error: ' + err.message, 'error');
    console.error(err);
  }
}

async function csvToGeoJSON(text, filename) {
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

  // Detect if coordinates are likely projected (metric) rather than geographic
  let sourceCRS = 'EPSG:4326';
  let needsReproject = false;
  if (hasLatLng) {
    const latColName = headerLower[latIdx];
    const lngColName = headerLower[lngIdx];
    const isProjectedByName = CSV_PROJECTED_LAT_NAMES.includes(latColName) ||
                               CSV_PROJECTED_LNG_NAMES.includes(lngColName);

    // Also check magnitude of first valid coordinate pair
    let sampleLat = NaN, sampleLng = NaN;
    for (let r = 1; r < Math.min(rows.length, 20); r++) {
      const v1 = parseFloat(rows[r][latIdx]);
      const v2 = parseFloat(rows[r][lngIdx]);
      if (!isNaN(v1) && !isNaN(v2)) { sampleLat = v1; sampleLng = v2; break; }
    }
    // If values are outside geographic range (-180 to 180 / -90 to 90), must be projected
    const isProjectedByValue = !isNaN(sampleLat) && !isNaN(sampleLng) &&
      (Math.abs(sampleLat) > 90 || Math.abs(sampleLng) > 180);

    if (isProjectedByName || isProjectedByValue) {
      // Ask user which CRS the projected data is in
      sourceCRS = await _promptCSVCRS(headers[latIdx], headers[lngIdx], sampleLat, sampleLng);
      if (!sourceCRS) { toast('CSV load cancelled', 'info'); return null; }
      needsReproject = (sourceCRS !== 'EPSG:4326');
      toast(`CSV: Projected coordinates detected — using ${sourceCRS}`, 'info');
    }
  }

  // Columns to exclude from properties (geometry columns)
  const geomCols = new Set([wktIdx, ...(hasLatLng ? [latIdx, lngIdx] : [])].filter(i => i >= 0));

  if (hasLatLng && !needsReproject) toast(`CSV: Using "${headers[latIdx]}" / "${headers[lngIdx]}" for coordinates`, 'info');
  else if (hasWKT) toast(`CSV: Using "${headers[wktIdx]}" (WKT) for geometry`, 'info');

  // Set up reprojection if needed
  let fromDef = null, toDef = null;
  if (needsReproject) {
    fromDef = CRS_DEFS[sourceCRS] || sourceCRS;
    toDef   = CRS_DEFS['EPSG:4326'];
    try { proj4; } catch(e) { toast('proj4 not loaded — cannot reproject CSV', 'error'); return null; }
  }

  const features = [];
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    let geometry = null;

    if (hasLatLng) {
      let northing = parseFloat(row[latIdx]);
      let easting  = parseFloat(row[lngIdx]);
      if (!isNaN(northing) && !isNaN(easting)) {
        if (needsReproject) {
          try {
            const [lon, lat] = proj4(fromDef, toDef, [easting, northing]);
            geometry = { type: 'Point', coordinates: [lon, lat] };
          } catch(e) { skipped++; continue; }
        } else {
          geometry = { type: 'Point', coordinates: [easting, northing] };
        }
      }
    }

    if (!geometry && hasWKT) {
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

// Prompt user to select the CRS for projected CSV coordinates
function _promptCSVCRS(latCol, lngCol, sampleLat, sampleLng) {
  return new Promise(resolve => {
    // Build a simple modal
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:10px;padding:22px 26px;min-width:340px;max-width:440px;box-shadow:0 8px 32px rgba(0,0,0,0.22);font-family:var(--mono,monospace);">
        <div style="font-size:13px;font-weight:700;color:#1a2a3a;margin-bottom:8px;">Projected Coordinates Detected</div>
        <div style="font-size:11px;color:#555;margin-bottom:14px;line-height:1.5;">
          Columns <strong>${latCol}</strong> / <strong>${lngCol}</strong> appear to be projected coordinates
          ${!isNaN(sampleLat) ? `(sample: ${sampleLat.toFixed(1)}, ${sampleLng.toFixed(1)})` : ''}.
          <br>Select the coordinate system:
        </div>
        <select id="_csv_crs_sel" style="width:100%;padding:6px 8px;font-family:inherit;font-size:11px;border:1px solid #ccc;border-radius:5px;margin-bottom:6px;">
          <optgroup label="GDA2020 / MGA (Australia)">
            <option value="EPSG:7850">GDA2020 / MGA Zone 50 (WA West)</option>
            <option value="EPSG:7851">GDA2020 / MGA Zone 51 (WA)</option>
            <option value="EPSG:7852">GDA2020 / MGA Zone 52 (WA/NT/SA)</option>
            <option value="EPSG:7853">GDA2020 / MGA Zone 53 (NT/SA/VIC)</option>
            <option value="EPSG:7854">GDA2020 / MGA Zone 54 (QLD/NSW)</option>
            <option value="EPSG:7855">GDA2020 / MGA Zone 55 (NSW/VIC/TAS)</option>
            <option value="EPSG:7856">GDA2020 / MGA Zone 56 (NSW/QLD)</option>
          </optgroup>
          <optgroup label="GDA94 / MGA (Australia)">
            <option value="EPSG:28350">GDA94 / MGA Zone 50</option>
            <option value="EPSG:28351">GDA94 / MGA Zone 51</option>
            <option value="EPSG:28352">GDA94 / MGA Zone 52</option>
            <option value="EPSG:28353">GDA94 / MGA Zone 53</option>
            <option value="EPSG:28354">GDA94 / MGA Zone 54</option>
            <option value="EPSG:28355">GDA94 / MGA Zone 55</option>
            <option value="EPSG:28356">GDA94 / MGA Zone 56</option>
          </optgroup>
          <optgroup label="Web Mercator / UTM">
            <option value="EPSG:3857">Web Mercator (EPSG:3857)</option>
            <option value="EPSG:32750">UTM Zone 50S</option>
            <option value="EPSG:32751">UTM Zone 51S</option>
            <option value="EPSG:32752">UTM Zone 52S</option>
            <option value="EPSG:32753">UTM Zone 53S</option>
            <option value="EPSG:32754">UTM Zone 54S</option>
            <option value="EPSG:32755">UTM Zone 55S</option>
            <option value="EPSG:32756">UTM Zone 56S</option>
          </optgroup>
          <option value="EPSG:4326">Geographic WGS84 (lat/lng)</option>
          <option value="custom">Custom EPSG code…</option>
        </select>
        <div id="_csv_crs_custom" style="display:none;margin-bottom:6px;">
          <input id="_csv_crs_custom_val" type="text" placeholder="e.g. EPSG:32755 or proj4 string"
            style="width:100%;padding:5px 8px;font-family:inherit;font-size:11px;border:1px solid #ccc;border-radius:5px;box-sizing:border-box;">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
          <button id="_csv_crs_cancel" style="padding:6px 14px;font-family:inherit;font-size:11px;border:1px solid #ccc;border-radius:5px;cursor:pointer;background:#f5f5f5;">Cancel</button>
          <button id="_csv_crs_ok" style="padding:6px 14px;font-family:inherit;font-size:11px;border:none;border-radius:5px;cursor:pointer;background:#14b1e7;color:#fff;font-weight:700;">Load</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const sel = overlay.querySelector('#_csv_crs_sel');
    const customDiv = overlay.querySelector('#_csv_crs_custom');
    const customVal = overlay.querySelector('#_csv_crs_custom_val');

    sel.addEventListener('change', () => {
      customDiv.style.display = sel.value === 'custom' ? 'block' : 'none';
    });

    overlay.querySelector('#_csv_crs_cancel').addEventListener('click', () => {
      document.body.removeChild(overlay); resolve(null);
    });
    overlay.querySelector('#_csv_crs_ok').addEventListener('click', () => {
      let crs = sel.value;
      if (crs === 'custom') {
        crs = customVal.value.trim();
        if (!crs) { customVal.style.borderColor = 'red'; return; }
      }
      // Register the CRS with proj4 if it's an EPSG code we know
      _ensureCRS(crs);
      document.body.removeChild(overlay); resolve(crs);
    });
  });
}

function _ensureCRS(epsg) {
  if (CRS_DEFS[epsg]) return; // already known
  // Try to add common Australian MGA/UTM zones not in main CRS_DEFS
  const extra = {
    'EPSG:7850': '+proj=utm +zone=50 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    'EPSG:7851': '+proj=utm +zone=51 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    'EPSG:7852': '+proj=utm +zone=52 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    'EPSG:7853': '+proj=utm +zone=53 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    'EPSG:7854': '+proj=utm +zone=54 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    'EPSG:7855': '+proj=utm +zone=55 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    'EPSG:7856': '+proj=utm +zone=56 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    'EPSG:32750': '+proj=utm +zone=50 +south +datum=WGS84 +units=m +no_defs',
    'EPSG:32751': '+proj=utm +zone=51 +south +datum=WGS84 +units=m +no_defs',
    'EPSG:32752': '+proj=utm +zone=52 +south +datum=WGS84 +units=m +no_defs',
    'EPSG:32753': '+proj=utm +zone=53 +south +datum=WGS84 +units=m +no_defs',
    'EPSG:32754': '+proj=utm +zone=54 +south +datum=WGS84 +units=m +no_defs',
    'EPSG:32755': '+proj=utm +zone=55 +south +datum=WGS84 +units=m +no_defs',
    'EPSG:32756': '+proj=utm +zone=56 +south +datum=WGS84 +units=m +no_defs',
  };
  if (extra[epsg]) { CRS_DEFS[epsg] = extra[epsg]; if (typeof proj4 !== 'undefined') proj4.defs(epsg, extra[epsg]); }
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
    _rebuildMapLayer(entry.layerIdx);
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
  
  createState.featureUndoStack.push({ layerIdx: entry.layerIdx, featJson: entry.featJson });
  updateCreateLayerList();
  updateLayerList();
  updateSelectionCount();
  renderTable();
  toast('Feature restored (redo)', 'info');
}

// Rebuild the MapLibre layer source after features are added/removed
function _rebuildMapLayer(layerIdx) {
  const layer = state.layers[layerIdx];
  if (!layer || layer.isTile) return;
  _renderMapLayer(layer, layerIdx);
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

  // Show loading state on the clicked catalogue item
  const itemEl = document.querySelector(`.cat-item[data-url="${CSS.escape(url)}"]`);
  if (itemEl) {
    itemEl._origHtml = itemEl.innerHTML;
    itemEl.style.opacity = '0.6';
    itemEl.style.pointerEvents = 'none';
    const spinner = document.createElement('span');
    spinner.textContent = '⏳';
    spinner.style.cssText = 'margin-left:auto;font-size:11px;flex-shrink:0;';
    itemEl.appendChild(spinner);
  }
  const _restoreItem = () => {
    if (itemEl && itemEl._origHtml !== undefined) {
      itemEl.innerHTML = itemEl._origHtml;
      itemEl.style.opacity = '';
      itemEl.style.pointerEvents = '';
    }
  };

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
  const isWMS    = /service=wms|request=getcapabilities|[?&]layers=/i.test(url);

  try {
    if (isArcGIS) {
      await _catalogueLoadArcGIS(url, name);
    } else if (isXYZ) {
      _catalogueLoadXYZ(url, name);
    } else if (isWMS) {
      _catalogueLoadWMS(url, name);
    } else {
      await _catalogueLoadGeoJSONURL(url, name);
    }
  } finally {
    _restoreItem();
  }
}

async function _catalogueLoadArcGIS(url, name) {
  mapLoadBar.start();
  const cleanUrl = url.trim().replace(/\/+$/, '');

  // Build extent query from current map bounds
  const queryParams = {
    where: '1=1',
    outFields: '*',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: CONSTANTS.MAX_CATALOGUE_FEATURES,
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
    const resp = await fetch(cleanUrl + '/query?' + params.toString(), { signal: AbortSignal.timeout(CONSTANTS.FETCH_TIMEOUT_MS) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const geojson = await resp.json();
    if (geojson.error) throw new Error(geojson.error.message || JSON.stringify(geojson.error));
    if (!geojson.features) throw new Error('No features returned');

    const n = geojson.features.length;
    if (n === 0) {
      mapLoadBar.done();
      toast(`${name}: no features found in this extent — try zooming in closer`, 'info');
      return;
    }
    const truncated = n >= CONSTANTS.MAX_CATALOGUE_FEATURES;
    addLayer(geojson, name, 'EPSG:4326', 'ArcGIS REST');
    mapLoadBar.done();
    toast(`${name}: ${n} feature${n!==1?'s':''} loaded${truncated?' (limit reached — zoom in)':''}`, 'success');
  } catch(err) {
    mapLoadBar.done();
    toast(`Catalogue: ${name} — ${err.message}`, 'error');
  }
}

function _catalogueLoadXYZ(url, name) {
  try {
    const idx = state.layers.length;
    const mapId = _layerMapId(idx);
    const layer = { name, format: 'Tile', color: '#f0883e', mapId,
      visible: true, isTile: true, tileUrl: url, tileType: 'xyz',
      fields: {}, geojson: { features: [] }, geomType: 'Tile', sourceCRS: 'EPSG:4326', layerOpacity: 0.85 };
    state.layers.push(layer);
    if (state.map && state.map.isStyleLoaded()) _renderMapLayer(layer, idx);
    else if (state.map) state.map.once('load', () => _renderMapLayer(layer, idx));
    updateLayerList(); updateExportLayerList();
    toast(`Tile layer added: ${name}`, 'success');
  } catch(err) {
    toast(`Catalogue XYZ error: ${err.message}`, 'error');
  }
}

function _catalogueLoadWMS(url, name) {
  try {
    // Parse base URL and any existing query params from the catalogue entry
    const [baseUrl, queryStr] = url.split('?');
    const params = new URLSearchParams(queryStr || '');

    // Extract LAYERS and STYLES if already in the URL (case-insensitive)
    let layers = '', styles = '', version = '1.3.0', format = 'image/png';
    for (const [k, v] of params.entries()) {
      const kl = k.toLowerCase();
      if (kl === 'layers') layers = v;
      else if (kl === 'styles') styles = v;
      else if (kl === 'version') version = v;
      else if (kl === 'format') format = v;
    }
    if (!layers) { toast(`WMS catalogue: no LAYERS param found in URL for "${name}"`, 'error'); return; }

    const tileUrl = baseUrl +
      `?SERVICE=WMS&REQUEST=GetMap&VERSION=${encodeURIComponent(version)}` +
      `&LAYERS=${encodeURIComponent(layers)}` +
      `&STYLES=${encodeURIComponent(styles)}` +
      `&FORMAT=${encodeURIComponent(format)}&TRANSPARENT=TRUE` +
      `&CRS=EPSG%3A3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`;

    const idx = state.layers.length;
    const mapId = _layerMapId(idx);
    const layer = { name, format: 'WMS', color: '#5ab4f0', mapId, visible: true, isTile: true,
      tileUrl, fields: {}, geojson: { features: [] }, geomType: 'Tile', sourceCRS: 'EPSG:4326', layerOpacity: 0.85 };
    state.layers.push(layer);
    if (state.map && state.map.isStyleLoaded()) _renderMapLayer(layer, idx);
    else if (state.map) state.map.once('load', () => _renderMapLayer(layer, idx));
    updateLayerList(); updateExportLayerList();
    toast(`WMS layer added: ${name}`, 'success');
  } catch(err) {
    toast(`Catalogue WMS error: ${err.message}`, 'error');
  }
}

async function _catalogueLoadGeoJSONURL(url, name) {
  mapLoadBar.start();
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(CONSTANTS.FETCH_TIMEOUT_MS) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const geojson = await resp.json();
    if (!geojson.features && geojson.type !== 'FeatureCollection') throw new Error('Not a valid GeoJSON response');
    const n = (geojson.features || []).length;
    if (n === 0) {
      mapLoadBar.done();
      toast(`${name}: no features found — the service returned an empty collection`, 'info');
      return;
    }
    addLayer(geojson, name, 'EPSG:4326', 'GeoJSON URL');
    mapLoadBar.done();
    toast(`${name}: ${n} feature${n!==1?'s':''} loaded`, 'success');
  } catch(err) {
    mapLoadBar.done();
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
