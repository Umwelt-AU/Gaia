// gaia-session.js — Session persistence (localStorage), export session as URL
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
            layerOpacity: layer.layerOpacity != null ? layer.layerOpacity : 1,
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
          layerOpacity: layer.layerOpacity != null ? layer.layerOpacity : 1,
          labelConfig: layer.labelConfig || null,
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

// ══════════════════════════════════════════════════
// EXPORT SESSION AS URL
// Compresses session JSON with LZ-based encoding and
// encodes it into the URL hash for sharing.
// ══════════════════════════════════════════════════

function _buildSessionPayload() {
  if (!state.layers.length) return null;
  return {
    version: 1,
    gaiaExport: true,
    exportedAt: new Date().toISOString(),
    mapView: state.map ? {
      lat: state.map.getCenter().lat,
      lng: state.map.getCenter().lng,
      zoom: state.map.getZoom()
    } : null,
    basemap: document.getElementById('basemap-select')?.value || 'light',
    activeLayerIndex: state.activeLayerIndex,
    displayCRS: state.displayCRS,
    layers: state.layers.map(layer => {
      if (layer.isTile) {
        return { isTile: true, name: layer.name, color: layer.color, visible: layer.visible,
                 format: layer.format || 'Tile', tileUrl: layer.tileUrl || null,
                 tileType: layer.tileType || null,
                 layerOpacity: layer.layerOpacity != null ? layer.layerOpacity : 1 };
      }
      return { isTile: false, name: layer.name, color: layer.color,
               fillColor: layer.fillColor || null, outlineColor: layer.outlineColor || null,
               noFill: layer.noFill || false, pointShape: layer.pointShape || 'circle',
               visible: layer.visible, format: layer.format, sourceCRS: layer.sourceCRS,
               geomType: layer.geomType, editable: layer.editable || false,
               editGeomType: layer.editGeomType || null, fields: layer.fields,
               geojson: layer.geojson,
               layerOpacity: layer.layerOpacity != null ? layer.layerOpacity : 1,
               labelConfig: layer.labelConfig || null };
    }),
  };
}

function copySessionURL() {
  const payload = _buildSessionPayload();
  if (!payload) { toast('No layers to share', 'error'); return; }
  try {
    const json    = JSON.stringify(payload);
    const encoded = btoa(unescape(encodeURIComponent(json)));
    const url     = window.location.origin + window.location.pathname + '#s=' + encoded;
    if (url.length > 200000) {
      toast('Session too large for a URL — use File export instead', 'error');
      return;
    }
    navigator.clipboard.writeText(url).then(function() {
      toast('Share URL copied to clipboard!', 'success');
      const btn = document.getElementById('export-session-btn');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✓ Copied!';
        btn.style.color = '#39d353';
        setTimeout(() => { btn.textContent = orig; btn.style.color = '#7ee8a2'; }, 2200);
      }
    }).catch(function() {
      // Fallback: prompt
      window.prompt('Copy this share URL:', url);
    });
  } catch(err) {
    toast('URL export failed: ' + err.message, 'error');
  }
}

// Called on page load — check if there is a #s= hash and load session from it
function _checkURLSession() {
  const hash = window.location.hash;
  if (!hash.startsWith('#s=')) return;
  try {
    const encoded = hash.slice(3);
    const json    = decodeURIComponent(escape(atob(encoded)));
    const data    = JSON.parse(json);
    if (!data || !data.gaiaExport) return;
    // Clear hash so a reload doesn't re-load the same session
    history.replaceState(null, '', window.location.pathname);
    // Restore map view if present
    if (data.mapView && state.map) {
      state.map.flyTo({ center: [data.mapView.lng, data.mapView.lat], zoom: data.mapView.zoom });
    }
    // Restore basemap
    if (data.basemap) {
      const sel = document.getElementById('basemap-select');
      if (sel) { sel.value = data.basemap; changeBasemap(); }
    }
    // Re-use the existing GAIA loader by building a fake File object
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const file = new File([blob], 'shared.gaia', { type: 'application/json' });
    loadGAIASession(file).then(() => {
      toast('Shared session loaded!', 'success');
    }).catch(e => toast('Could not load shared session: ' + e.message, 'error'));
  } catch(e) {
    console.warn('URL session parse failed:', e);
  }
}

function toggleExportDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById('export-session-dropdown');
  const isOpen = dd.style.display !== 'none';
  dd.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    setTimeout(() => document.addEventListener('click', _closeExportDropdown, { once: true }), 10);
  }
}
function _closeExportDropdown() {
  const d = document.getElementById('export-session-dropdown');
  if (d) d.style.display = 'none';
}
function doExportFile() {
  _closeExportDropdown();
  doExportSession();
}
function doExportURL() {
  _closeExportDropdown();
  copySessionURL();
}


function doExportSession() {
  const sp = document.getElementById('save-popup');
  if (sp) sp.style.display = 'none';
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
                   format: layer.format || 'Tile', tileUrl: layer.tileUrl || null, tileType: layer.tileType || null,
                   layerOpacity: layer.layerOpacity != null ? layer.layerOpacity : 1 };
        }
        return { isTile: false, name: layer.name, color: layer.color, fillColor: layer.fillColor || null,
                 outlineColor: layer.outlineColor || null, noFill: layer.noFill || false,
                 pointShape: layer.pointShape || 'circle',
                 visible: layer.visible, format: layer.format, sourceCRS: layer.sourceCRS,
                 geomType: layer.geomType, editable: layer.editable || false,
                 editGeomType: layer.editGeomType || null, fields: layer.fields, geojson: layer.geojson,
                 layerOpacity: layer.layerOpacity != null ? layer.layerOpacity : 1,
                 labelConfig: layer.labelConfig || null };
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
    toast('Session exported as .gaia file — drag it onto a new session to restore', 'success');
    // Flash the Save button
    const exportBtn = document.getElementById('export-session-btn');
    if (exportBtn) {
      const orig = exportBtn.textContent;
      exportBtn.textContent = '✓ Saved';
      exportBtn.style.color = '#39d353';
      setTimeout(() => { exportBtn.textContent = '💾 Export Session'; exportBtn.style.color = '#7ee8a2'; }, 2200);
    }
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
        if (!saved.tileUrl) return;
        const idx = state.layers.length;
        const mapId = _layerMapId(idx);
        const savedTileOp = saved.layerOpacity != null ? saved.layerOpacity : 1;
        const layer = { isTile: true, name: saved.name, color: saved.color, visible: saved.visible != false,
          format: saved.format || 'Tile', tileUrl: saved.tileUrl, tileType: saved.tileType, mapId, layerOpacity: savedTileOp };
        state.layers.push(layer);
        if (state.map && state.map.isStyleLoaded()) _renderMapLayer(layer, idx);
        else if (state.map) state.map.once('load', () => _renderMapLayer(layer, idx));
      } else {
        const geojson = saved.geojson;
        if (!geojson) return;
        const color = saved.color;
        const savedVecOp = saved.layerOpacity != null ? saved.layerOpacity : 1;
        const idx = state.layers.length;
        const mapId = _layerMapId(idx);
        const layer = {
          isTile: false, name: saved.name, color, mapId,
          fillColor: saved.fillColor || null, outlineColor: saved.outlineColor || null,
          noFill: saved.noFill || false, pointShape: saved.pointShape || 'circle',
          visible: saved.visible != false, format: saved.format, sourceCRS: saved.sourceCRS,
          geomType: saved.geomType, editable: saved.editable || false,
          editGeomType: saved.editGeomType || null,
          fields: saved.fields, geojson,
          layerOpacity: savedVecOp,
          labelConfig: saved.labelConfig || null,
        };
        // Stamp _fi on features
        layer.geojson = {
          ...geojson,
          features: (geojson.features||[]).map((f, fi) => ({ ...f, properties: { ...(f.properties||{}), _fi: fi } })),
        };
        state.layers.push(layer);
        if (state.map && state.map.isStyleLoaded()) _renderMapLayer(layer, idx);
        else if (state.map) state.map.once('load', () => _renderMapLayer(layer, idx));
        if (saved.labelConfig?.enabled && saved.labelConfig.field) {
          setTimeout(() => _renderLabelLayer(idx), 200);
        }
        if (layer.editable) createState.editLayerIndices.add(idx);
      }
    });

    if (data.layers.length) {
      const ai = Math.min(data.activeLayerIndex||0, state.layers.length-1);
      state.activeLayerIndex = ai;
      setActiveLayer(ai);
      setTimeout(() => _fitLayerBounds(state.layers[ai], { padding: CONSTANTS.MAP_FIT_PADDING_WIDE }), 500);
    }

    updateLayerList(); updateExportLayerList(); updateSBLLayerList(); updateDQALayerList(); updateCreateLayerList();
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
  state.layers.forEach((l, i) => {
    _removeLabelLayer(i);
    _removeMapLayers(_layerMapId(i));
  });
  state.layers = [];
  state.activeLayerIndex = -1;
  state.selectedFeatureIndices = new Set();
  state.selectedFeatureIndex = -1;
  state.columnOrder = null;
  updateLayerList();
  updateExportLayerList();
  updateSBLLayerList(); updateDQALayerList();
  updateAttrLayerSelect();
  document.getElementById('attr-strip-table-wrap').innerHTML = '<div class="empty-state">Select a layer to view attributes</div>';
  document.getElementById('table-count').textContent = '';
  showFeatureInspector(null);
  _updateEmptyState();
  updateLegend();
  updateCreateLayerList && updateCreateLayerList();
  toast('Session cleared — all layers removed', 'info');
}


// ── MAP RIGHT-CLICK CONTEXT MENU ──────────────────────────────────────
let _mapCtxLatLng = null;

function showMapCtxMenu(e) {
  _mapCtxLatLng = e.latlng;
  const menu = document.getElementById('map-ctx-menu');
  const lat = e.latlng.lat.toFixed(7), lng = e.latlng.lng.toFixed(7);
  document.getElementById('map-ctx-coords-display').textContent = lat + ', ' + lng;

  const addrRow = document.getElementById('map-ctx-address-row');
  const addrEl  = document.getElementById('map-ctx-address-display');
  if (addrRow && addrEl) {
    addrEl.textContent = 'Fetching address…';
    addrRow.style.display = 'flex';
    reverseGeocode(e.latlng.lat, e.latlng.lng, function(addr) {
      addrEl.textContent = addr || 'Address not found';
    });
  }

  const x = Math.min(e.originalEvent.clientX, window.innerWidth - 310);
  const y = Math.min(e.originalEvent.clientY, window.innerHeight - 220);
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



// ── LOCATION SEARCH (Nominatim) ───────────────────────────────────────
function searchLocation() {
  const input = document.getElementById('location-search-input');
  const q = (input ? input.value : '').trim();
  if (!q) return;
  const resultsDiv = document.getElementById('location-search-results');
  if (resultsDiv) {
    resultsDiv.innerHTML = '<div style="padding:8px 12px;font-family:var(--mono);font-size:10px;color:var(--text3);">Searching…</div>';
    resultsDiv.style.display = 'block';
  }
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`;
  fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'GaiaGISViewer/1.0' }, signal: AbortSignal.timeout(CONSTANTS.FETCH_TIMEOUT_MS) })
    .then(r => r.json())
    .then(data => {
      if (!resultsDiv) return;
      if (!data || !data.length) {
        resultsDiv.innerHTML = '<div style="padding:8px 12px;font-family:var(--mono);font-size:10px;color:var(--text3);">No results found.</div>';
        return;
      }
      resultsDiv.innerHTML = data.map((item, i) =>
        `<div class="loc-result" onclick="selectLocationResult(${item.lat},${item.lon},'${escHtml(item.display_name).replace(/'/g,'&#39;')}')"
          style="padding:7px 12px;font-family:var(--mono);font-size:10px;color:var(--text);cursor:pointer;
                 border-bottom:1px solid var(--border);line-height:1.4;"
          onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
          <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(item.display_name)}</div>
          <div style="color:var(--text3);font-size:9px;margin-top:2px;">${item.type} · ${parseFloat(item.lat).toFixed(4)}, ${parseFloat(item.lon).toFixed(4)}</div>
        </div>`
      ).join('');
    })
    .catch(() => {
      if (resultsDiv) resultsDiv.innerHTML = '<div style="padding:8px 12px;font-family:var(--mono);font-size:10px;color:#c0392b;">Search failed. Check your connection.</div>';
    });
}

function selectLocationResult(lat, lon, displayName) {
  const resultsDiv = document.getElementById('location-search-results');
  const input = document.getElementById('location-search-input');
  if (resultsDiv) resultsDiv.style.display = 'none';
  if (input) input.value = displayName;
  if (state.map) {
    state.map.flyTo({ center: [parseFloat(lon), parseFloat(lat)], zoom: 15, animate: true });
  }
}

function clearLocationResults() {
  const resultsDiv = document.getElementById('location-search-results');
  if (resultsDiv) resultsDiv.style.display = 'none';
}

// Close search results when clicking outside
document.addEventListener('click', function(e) {
  const bar = document.getElementById('location-search-bar');
  const res = document.getElementById('location-search-results');
  if (res && bar && !bar.contains(e.target) && !res.contains(e.target)) {
    res.style.display = 'none';
  }
});

// ── REVERSE GEOCODE HELPER ────────────────────────────────────────────
let _reverseGeocodeCache = {};

function _buildAddrFromNominatim(data) {
  if (!data) return null;
  if (data.address) {
    var a = data.address;
    var parts = [];
    var road = a.road || a.pedestrian || a.footway || a.path || a.highway || '';
    var street = (a.house_number && road) ? a.house_number + ' ' + road
               : (a.house_number || road);
    if (street.trim()) parts.push(street.trim());
    var locality = a.suburb || a.neighbourhood || a.quarter || a.city_district ||
                   a.town || a.village || a.hamlet || a.city || '';
    if (locality) parts.push(locality);
    var region = [a.state, a.postcode].filter(Boolean).join(' ');
    if (region) parts.push(region);
    return parts.length ? parts.join(', ') : (data.display_name || null);
  }
  return data.display_name || null;
}

function reverseGeocode(lat, lng, callback) {
  var key = lat.toFixed(5) + ',' + lng.toFixed(5);
  if (_reverseGeocodeCache[key]) { callback(_reverseGeocodeCache[key]); return; }

  // Primary: zoom=18 for maximum detail (best chance of house_number)
  var url = 'https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng +
            '&format=json&zoom=18&addressdetails=1';

  fetch(url, { headers: { 'Accept-Language': 'en', 'User-Agent': 'GaiaGISViewer/1.0' }, signal: AbortSignal.timeout(CONSTANTS.FETCH_TIMEOUT_MS) })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var hasNumber = data && data.address && data.address.house_number;

      if (hasNumber) {
        // We have a house number — done
        var addr = _buildAddrFromNominatim(data);
        _reverseGeocodeCache[key] = addr;
        callback(addr);
        return;
      }

      // No house number: do a nearby address search to find the closest numbered property.
      // Search within ~50 m using a bounding box (~0.0005 deg each side).
      var d = 0.0005;
      var viewbox = (lng - d) + ',' + (lat + d) + ',' + (lng + d) + ',' + (lat - d);
      var searchUrl = 'https://nominatim.openstreetmap.org/search?q=&format=json&limit=5' +
                      '&addressdetails=1&bounded=1&viewbox=' + viewbox;

      fetch(searchUrl, { headers: { 'Accept-Language': 'en', 'User-Agent': 'GaiaGISViewer/1.0' }, signal: AbortSignal.timeout(CONSTANTS.FETCH_TIMEOUT_MS) })
        .then(function(r2) { return r2.json(); })
        .then(function(results) {
          // Find the nearest result that has a house_number
          var best = null, bestDist = Infinity;
          (results || []).forEach(function(r) {
            if (r.address && r.address.house_number) {
              var dlat = (parseFloat(r.lat) - lat);
              var dlng = (parseFloat(r.lon) - lng);
              var dist = dlat * dlat + dlng * dlng;
              if (dist < bestDist) { bestDist = dist; best = r; }
            }
          });

          var addr;
          if (best) {
            // Use the nearby numbered address but keep the road from the primary result
            // so we don't misattribute a number from a different street
            var primaryRoad = (data && data.address) ?
              (data.address.road || data.address.pedestrian || data.address.footway || '') : '';
            var nearbyRoad = best.address.road || best.address.pedestrian || best.address.footway || '';
            if (primaryRoad && nearbyRoad && primaryRoad.toLowerCase() === nearbyRoad.toLowerCase()) {
              // Same road — safe to use the nearby house number
              addr = _buildAddrFromNominatim(best);
            } else {
              // Different road — don't attach a potentially wrong number; use primary without number
              addr = _buildAddrFromNominatim(data);
            }
          } else {
            addr = _buildAddrFromNominatim(data);
          }

          _reverseGeocodeCache[key] = addr;
          callback(addr);
        })
        .catch(function() {
          var addr = _buildAddrFromNominatim(data);
          _reverseGeocodeCache[key] = addr;
          callback(addr);
        });
    })
    .catch(function() { callback(null); });
}

function copyCtxAddress() {
  const addrEl = document.getElementById('map-ctx-address-display');
  const text = addrEl ? addrEl.textContent.trim() : '';
  if (!text || text === 'Fetching address…' || text === 'Address not found') return;
  const btn = document.getElementById('map-ctx-address-copy');
  navigator.clipboard.writeText(text)
    .then(function() {
      if (btn) { btn.textContent = '✓'; setTimeout(function() { btn.textContent = '📋'; }, 1500); }
      toast('Address copied', 'success');
    })
    .catch(function() {
      // Fallback for browsers without clipboard API
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); if (btn) { btn.textContent = '✓'; setTimeout(function() { btn.textContent = '📋'; }, 1500); } } catch(e) {}
      document.body.removeChild(ta);
    });
}

// ── CLOSE ATTRIBUTE TABLE ─────────────────────────────────────────────
function closeAttrTable() {
  const strip = document.getElementById('attr-strip');
  strip.style.display = 'none';
  const btn = document.getElementById('attr-table-map-btn');
  if (btn) btn.classList.remove('active');
}

function openAttrTable() {
  const strip = document.getElementById('attr-strip');
  strip.style.display = 'flex';
  const btn = document.getElementById('attr-table-map-btn');
  if (btn) btn.classList.add('active');
}

function toggleAttrTable() {
  const strip = document.getElementById('attr-strip');
  if (!strip) return;
  if (strip.style.display === 'flex') {
    closeAttrTable();
  } else {
    if (state.activeLayerIndex >= 0) renderTable();
    openAttrTable();
  }
}

// ── CTX MENU: Open Attribute Table ────────────────────────────────────
function ctxOpenAttrTable() {
  document.getElementById('layer-ctx-menu').classList.remove('visible');
  if (ctxLayerIdx < 0) return;
  setActiveLayer(ctxLayerIdx);
  openAttrTable();
  // Update dropdown value directly without re-triggering onAttrLayerChange
  const sel = document.getElementById('attr-layer-select');
  if (sel) sel.value = String(ctxLayerIdx);
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
    const shape = layer.pointShape || 'circle';
    const f = layer.noFill ? 'none' : c;
    if (shape === 'square') {
      return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="10" height="10" rx="1" fill="${f}" stroke="${c}" stroke-width="1.5" opacity="0.9"/>
      </svg>`;
    } else if (shape === 'triangle') {
      return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="8,2 14,14 2,14" fill="${f}" stroke="${c}" stroke-width="1.5" opacity="0.9"/>
      </svg>`;
    } else if (shape === 'diamond') {
      return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="8,1 15,8 8,15 1,8" fill="${f}" stroke="${c}" stroke-width="1.5" opacity="0.9"/>
      </svg>`;
    } else if (shape === 'star') {
      return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="8,1 9.9,6.1 15.5,6.1 11.1,9.4 12.7,14.7 8,11.4 3.3,14.7 4.9,9.4 0.5,6.1 6.1,6.1" fill="${f}" stroke="${c}" stroke-width="1" opacity="0.9"/>
      </svg>`;
    } else {
      // Default circle
      return `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="8" r="5" fill="${c}" stroke="${c}" stroke-width="0.5" opacity="0.9"/>
      </svg>`;
    }
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
// ── FEATURE ATTRIBUTE POPUP ──────────────────────────────────────────
function showFeaturePopup(lngLat, feat, color) {
  if (state._featurePopup) { state._featurePopup.remove(); state._featurePopup = null; }

  const props = feat.properties || {};
  // Strip internal _fi, _fill_color, etc. from display
  const keys = Object.keys(props).filter(k => !k.startsWith('_'));
  if (keys.length === 0) return;

  const INITIAL = 8;
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
    const moreRow = (!showAll && keys.length > INITIAL)
      ? '<tr><td colspan="2" style="padding-top:4px;">'
        + '<span onclick="event.stopPropagation();window._gaiaExpandPopup()" style="cursor:pointer;color:#0074a8;font-family:monospace;font-size:10px;text-decoration:underline;">'
        + '&#9660; Expand to show ' + (keys.length - INITIAL) + ' more field' + (keys.length - INITIAL !== 1 ? 's' : '')
        + '</span></td></tr>' : '';
    const copyBtn = '<div style="padding-top:6px;border-top:1px solid rgba(0,0,0,0.1);margin-top:4px;display:flex;justify-content:space-between;align-items:center;">'
      + '<span style="font-family:monospace;font-size:9px;color:#9aacba;">Right-click row to copy value</span>'
      + '<span onclick="event.stopPropagation();window._gaiaCopyPopupAll(' + showAll + ')" style="cursor:pointer;color:#0074a8;font-family:monospace;font-size:10px;text-decoration:underline;">&#8984; Copy all</span>'
      + '</div>';
    return '<div style="font-family:IBM Plex Mono,monospace;font-size:11px;min-width:180px;max-width:300px;">'
      + '<div style="background:' + color + ';height:3px;border-radius:2px 2px 0 0;margin:-8px -8px 7px -8px;"></div>'
      + '<table style="border-collapse:collapse;width:100%;">' + rows + moreRow + '</table>'
      + copyBtn + '</div>';
  }

  window._gaiaExpandPopup = function() {
    if (state._featurePopup) state._featurePopup.setHTML(buildPopupHtml(true));
  };

  const el = document.createElement('div');
  el.innerHTML = buildPopupHtml(false);

  state._featurePopup = new maplibregl.Popup({ maxWidth: '340px', className: 'gaia-feature-popup', closeButton: true })
    .setLngLat([lngLat.lng, lngLat.lat])
    .setDOMContent(el)
    .addTo(state.map);
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


