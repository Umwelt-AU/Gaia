// gaia-layers.js — Add layer, layer list UI, layer groups, stats
// ── ADD LAYER ──
// ── LAYER MAPID HELPERS ─────────────────────────────────────────────────
// Each layer gets a unique mapId used as the base for its MapLibre source + layer IDs.
// Data layers sit above basemap/terrain but below draw layers.
const _DRAW_LAYERS = ['draw-fill','draw-line','draw-circle','draw-preview-fill','draw-preview-line'];


function _layerMapId(idx) { return 'gaia-layer-' + idx; }

// Insert a MapLibre layer BELOW the draw layers (so draw remains on top)
function _addMapLayer(layerDef) {
  const firstDraw = _DRAW_LAYERS.find(id => { try { return !!state.map.getLayer(id); } catch(_) { return false; } });
  
  try {
    if (firstDraw) {
      state.map.addLayer(layerDef, firstDraw);
    } else {
      state.map.addLayer(layerDef);
    }
    try { state.map.triggerRepaint(); } catch(_) {}
  } catch(e) {
    console.warn('addLayer failed:', layerDef.id, e.message);
  }
}


// Remove all MapLibre layers+source for a given mapId
function _removeMapLayers(mapId) {
  const suffixes = ['-fill', '-stroke', '-line', '-circle', '-label', ''];
  suffixes.forEach(s => {
    const lid = mapId + s;
    try { if (state.map.getLayer(lid)) state.map.removeLayer(lid); } catch(_) {}
  });
  try { if (state.map.getSource(mapId)) state.map.removeSource(mapId); } catch(_) {}
}

// Add/update MapLibre source+layers for a given gaia layer object
function _renderMapLayer(layer, idx) {
  if (!state.map || !state.map.isStyleLoaded()) return;
  const mapId = _layerMapId(idx);
  const color = layer.outlineColor || layer.color;
  const fill  = layer.fillColor    || layer.color;
  const op    = layer.layerOpacity ?? 1;
  const vis   = layer.visible ? 'visible' : 'none';

  if (layer.is3DBuildings) {
    const vis = layer.visible ? 'visible' : 'none';
    const op  = layer.layerOpacity ?? 0.85;
    ['3d-buildings', '3d-buildings-fill', '3d-buildings-highlight'].forEach(id => {
      try { state.map.setLayoutProperty(id, 'visibility', vis); } catch(_) {}
    });
    try { state.map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', layer.visible ? op : 0); } catch(_) {}
    return;
  }

  if (layer.isTile) {
    // Tile layer — add as a raster source
    if (!state.map.getSource(mapId)) {
      state.map.addSource(mapId, { type: 'raster', tiles: [layer.tileUrl || ''], tileSize: 256 });
      _addMapLayer({ id: mapId, type: 'raster', source: mapId,
        layout: { visibility: vis }, paint: { 'raster-opacity': op } });
    } else {
      try { state.map.setLayoutProperty(mapId, 'visibility', vis); } catch(_) {}
      try { state.map.setPaintProperty(mapId, 'raster-opacity', op); } catch(_) {}
    }
    return;
  }

  const geojson = layer.geojson || { type: 'FeatureCollection', features: [] };
  const gt = (layer.geomType || '').toLowerCase();
  const isPoint = gt.includes('point');
  const isLine  = gt.includes('line');

  if (!state.map.getSource(mapId)) {
    state.map.addSource(mapId, { type: 'geojson', data: geojson });
  } else {
    try { state.map.getSource(mapId).setData(geojson); } catch(_) {}
  }

  // --- Build per-feature colour expression using _fill_color / _stroke_color properties
  // These are set by refreshMapSelection based on classification + selection state
  const fillExpr   = ['coalesce', ['get', '_fill_color'],   fill];
  const strokeExpr  = ['coalesce', ['get', '_stroke_color'], color];
  const fillOpExpr  = ['coalesce', ['get', '_fill_opacity'],  layer.noFill ? 0 : 0.25 * op];
  const lineOpExpr  = ['coalesce', ['get', '_line_opacity'],  op];
  const lineWExpr   = ['coalesce', ['get', '_line_weight'],   isLine ? (layer.outlineWidth ?? 1) : (layer.outlineWidth ?? 2)];

  if (isPoint) {
    const sz = (layer.pointSize ?? 6) * op;
    if (!state.map.getLayer(mapId + '-circle')) {
      _addMapLayer({ id: mapId + '-circle', type: 'circle', source: mapId,
        layout: { visibility: vis },
        paint: {
          'circle-color':        fillExpr,
          'circle-radius':       sz,
          'circle-stroke-color': strokeExpr,
          'circle-stroke-width': layer.outlineWidth ?? 1.5,
          'circle-opacity':      lineOpExpr,
        },
      });
    } else {
      try {
        state.map.setLayoutProperty(mapId + '-circle', 'visibility', vis);
        state.map.setPaintProperty(mapId + '-circle', 'circle-color', fillExpr);
        state.map.setPaintProperty(mapId + '-circle', 'circle-stroke-color', strokeExpr);
        state.map.setPaintProperty(mapId + '-circle', 'circle-stroke-width', layer.outlineWidth ?? 1.5);
        state.map.setPaintProperty(mapId + '-circle', 'circle-radius', sz);
        state.map.setPaintProperty(mapId + '-circle', 'circle-opacity', lineOpExpr);
      } catch(_) {}
    }
  } else if (isLine) {
    if (!state.map.getLayer(mapId + '-line')) {
      _addMapLayer({ id: mapId + '-line', type: 'line', source: mapId,
        layout: { visibility: vis, 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': strokeExpr, 'line-width': lineWExpr, 'line-opacity': lineOpExpr },
      });
    } else {
      try {
        state.map.setLayoutProperty(mapId + '-line', 'visibility', vis);
        state.map.setPaintProperty(mapId + '-line', 'line-color', strokeExpr);
        state.map.setPaintProperty(mapId + '-line', 'line-width', lineWExpr);
        state.map.setPaintProperty(mapId + '-line', 'line-opacity', lineOpExpr);
      } catch(_) {}
    }
  } else {
    // Polygon
    if (!state.map.getLayer(mapId + '-fill')) {
      _addMapLayer({ id: mapId + '-fill', type: 'fill', source: mapId,
        layout: { visibility: vis },
        paint: { 'fill-color': fillExpr, 'fill-opacity': fillOpExpr, 'fill-antialias': true },
      });
      _addMapLayer({ id: mapId + '-stroke', type: 'line', source: mapId,
        layout: { visibility: vis },
        paint: { 'line-color': strokeExpr, 'line-width': lineWExpr, 'line-opacity': lineOpExpr },
      });
    } else {
      try {
        ['fill', 'stroke'].forEach(s => {
          const lid = mapId + '-' + s;
          state.map.setLayoutProperty(lid, 'visibility', vis);
        });
        state.map.setPaintProperty(mapId + '-fill',   'fill-color',   fillExpr);
        state.map.setPaintProperty(mapId + '-fill',   'fill-opacity', fillOpExpr);
        state.map.setPaintProperty(mapId + '-stroke', 'line-color',   strokeExpr);
        state.map.setPaintProperty(mapId + '-stroke', 'line-width',   lineWExpr);
        state.map.setPaintProperty(mapId + '-stroke', 'line-opacity', lineOpExpr);
      } catch(_) {}
    }
  }

  // Attach click handler for feature inspection (only on first render)
  if (!layer._clickBound) {
    layer._clickBound = true;
    const clickLayerIds = isPoint ? [mapId + '-circle'] : isLine ? [mapId + '-line'] : [mapId + '-fill'];
    clickLayerIds.forEach(lid => {
      if (!state.map.getLayer(lid)) return;
      state.map.on('click', lid, (e) => {
        const fi = e.features[0]?.properties?._fi;
        if (fi == null) return;
        const layerIdx = state.layers.indexOf(layer);
        const orig = e.originalEvent;
        if (orig.ctrlKey || orig.metaKey) {
          if (state.selectedFeatureIndices.has(fi)) state.selectedFeatureIndices.delete(fi);
          else { state.selectedFeatureIndices.add(fi); state.selectedFeatureIndex = fi; }
          state.activeLayerIndex = layerIdx;
          updateSelectionCount(); refreshMapSelection(layerIdx); renderTable(); scrollTableToFeature(fi);
        } else if (orig.shiftKey && state.selectedFeatureIndex >= 0 && state.activeLayerIndex === layerIdx) {
          const lo = Math.min(state.selectedFeatureIndex, fi), hi = Math.max(state.selectedFeatureIndex, fi);
          for (let i = lo; i <= hi; i++) state.selectedFeatureIndices.add(i);
          state.activeLayerIndex = layerIdx;
          updateSelectionCount(); refreshMapSelection(layerIdx); renderTable(); scrollTableToFeature(fi);
        } else {
          state.activeLayerIndex = layerIdx;
          state.selectedFeatureIndex = fi;
          state.selectedFeatureIndices = new Set([fi]);
          const feat2 = (layer.geojson?.features || [])[fi];
          if (feat2) { showFeatureInspector(feat2); showFeaturePopup(e.lngLat, feat2, layer.color); }
          updateLayerList(); updateSelectionCount(); refreshMapSelection(layerIdx); renderTable(); scrollTableToFeature(fi);
          _mapFlyToFeature(feat2);
        }
        e.originalEvent._featureClicked = true;
      });
      state.map.on('mouseenter', lid, () => { state.map.getCanvas().style.cursor = 'pointer'; });
      state.map.on('mouseleave', lid, () => { state.map.getCanvas().style.cursor = ''; });
    });
  }
}

// Fly to a feature's bounding box
function _mapFlyToFeature(feat) {
  if (!feat || !feat.geometry) return;
  try {
    const pts = [];
    function collectCoords(c) {
      if (!Array.isArray(c)) return;
      if (typeof c[0] === 'number') pts.push(c);
      else c.forEach(collectCoords);
    }
    collectCoords(feat.geometry.coordinates);
    if (!pts.length) return;
    if (pts.length === 1) {
      state.map.flyTo({ center: [pts[0][0], pts[0][1]], duration: 400 });
    } else {
      const lngs = pts.map(p=>p[0]), lats = pts.map(p=>p[1]);
      const bounds = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
      state.map.fitBounds(bounds, { padding: 50, duration: 400, maxZoom: 17 });
    }
  } catch(_) {}
}

// Fit map to a layer's GeoJSON extent
function _fitLayerBounds(layer, opts) {
  if (!layer || !layer.geojson) return;
  const pts = [];
  function cc(c) { if(!Array.isArray(c))return; if(typeof c[0]==='number')pts.push(c); else c.forEach(cc); }
  (layer.geojson.features||[]).forEach(f => { if(f.geometry) cc(f.geometry.coordinates); });
  if (!pts.length) return;
  const b = [[Math.min(...pts.map(p=>p[0])), Math.min(...pts.map(p=>p[1]))],
             [Math.max(...pts.map(p=>p[0])), Math.max(...pts.map(p=>p[1]))]];
  try { state.map.fitBounds(b, { padding: 40, maxZoom: 17, ...(opts||{}) }); } catch(_) {}
}

// Get [[minLng,minLat],[maxLng,maxLat]] from layer GeoJSON
function _layerBoundsArray(layer) {
  const pts = [];
  function cc(c) { if(!Array.isArray(c))return; if(typeof c[0]==='number')pts.push(c); else c.forEach(cc); }
  (layer?.geojson?.features||[]).forEach(f => { if(f.geometry) cc(f.geometry.coordinates); });
  if (!pts.length) return null;
  return [[Math.min(...pts.map(p=>p[0])), Math.min(...pts.map(p=>p[1]))],
          [Math.max(...pts.map(p=>p[0])), Math.max(...pts.map(p=>p[1]))]];
}

// Update the GeoJSON source data to embed per-feature style properties for
// classification, selection highlighting, and opacity — then re-render.
function refreshMapSelection(layerIdx) {
  const layer = state.layers[layerIdx];
  if (!layer || layer.isTile || !state.map) return;

  const baseColor  = layer.outlineColor || layer.color;
  const baseFill   = layer.fillColor    || layer.color;
  const noFill     = layer.noFill || false;
  const op         = layer.layerOpacity ?? 1;
  const gt         = (layer.geomType || '').toLowerCase();
  const isLine     = gt.includes('line');
  const baseWeight = layer.outlineWidth ?? (isLine ? 1 : 2);
  const baseFillOp = noFill ? 0 : 0.25 * op;

  // Build classify colour map
  let classifyColorMap = null;
  if (layer.classified && layer.classifyClasses?.length && layer.classifyField) {
    classifyColorMap = new Map();
    const field = layer.classifyField;
    (layer.geojson.features || []).forEach((f, i) => {
      const val = f.properties ? f.properties[field] : undefined;
      const cls = layer.classifyClasses.find(c =>
        typeof c.test === 'function' ? c.test(val) : String(c.label) === String(val)
      );
      if (cls) classifyColorMap.set(i, cls.color);
    });
  }

  // Stamp each feature with style properties + feature index (_fi) for click detection
  const tagged = {
    ...layer.geojson,
    features: (layer.geojson.features || []).map((f, fi) => {
      const isSel    = state.selectedFeatureIndices.has(fi);
      const clsColor = classifyColorMap?.get(fi);
      const fFill    = clsColor || baseFill;
      const fStroke  = clsColor || baseColor;
      return {
        ...f,
        properties: {
          ...f.properties,
          _fi:           fi,
          _fill_color:   isSel ? '#00ffff55' : fFill,
          _stroke_color: isSel ? '#00ffff' : fStroke,
          _fill_opacity: isSel ? Math.min(op * 0.5, 0.6) : baseFillOp,
          _line_opacity: op,
          _line_weight:  isSel ? Math.max(baseWeight + 1.5, 3) : baseWeight,
        },
      };
    }),
  };

  const mapId = _layerMapId(layerIdx);
  try {
    const src = state.map.getSource(mapId);
    if (src) src.setData(tagged);
  } catch(_) {}
}

// ── ADD LAYER (main entry point) ─────────────────────────────────────────
function addLayer(geojson, name, sourceCRS, format) {
  const color = LAYER_COLORS[state.layers.length % LAYER_COLORS.length];
  const idx   = state.layers.length;
  const geomTypes = new Set();
  (geojson.features||[]).forEach(f => { if(f.geometry) geomTypes.add(f.geometry.type); });
  const geomType = [...geomTypes].join('/')||'Unknown';
  const fields = {};
  (geojson.features||[]).forEach(f => {
    if(f.properties) Object.keys(f.properties).forEach(k=>{ if(!fields[k]) fields[k]=inferType(f.properties[k]); });
  });

  const layer = { geojson, name, sourceCRS, format, color, fields, geomType,
    mapId: _layerMapId(idx), visible: true, layerOpacity: 1 };
  state.layers.push(layer);

  // Stamp _fi into each feature now so click handler can identify them
  layer.geojson = {
    ...geojson,
    features: (geojson.features||[]).map((f,fi) => ({ ...f, properties: { ...(f.properties||{}), _fi: fi } })),
  };

  const waitAndRender = () => {
    if (state.map.isStyleLoaded()) {
      _renderMapLayer(layer, idx);
      refreshMapSelection(idx);
      // Fit bounds
      try {
        const pts = [];
        (layer.geojson.features||[]).forEach(f => {
          function cc(c) { if(!Array.isArray(c))return; if(typeof c[0]==='number')pts.push(c); else c.forEach(cc); }
          if (f.geometry) cc(f.geometry.coordinates);
        });
        if (pts.length) {
          const lngs = pts.map(p=>p[0]), lats = pts.map(p=>p[1]);
          state.map.fitBounds([[Math.min(...lngs),Math.min(...lats)],[Math.max(...lngs),Math.max(...lats)]],
            { padding: 40, duration: 500, maxZoom: 17 });
        }
      } catch(_) {}
    } else {
      state.map.once('load', () => waitAndRender());
    }
  };
  waitAndRender();

  updateLayerList(); updateExportLayerList(); updateSBLLayerList(); updateDQALayerList();
  setActiveLayer(idx);
  _updateEmptyState();
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

// ── LAYER GROUPS ──
// state.layerGroups = [{id, name, collapsed, visible}, ...]  (ordered — position = render order)
// Each layer carries layer._groupId (string|null).
//
// The unified render order is built as a flat "slot" list:
//   slot = { kind:'layer', layerIdx } | { kind:'group', groupId }
// When dragging, we drag either a layer-slot or a group-slot and drop onto any other slot.

function _ensureGroups() {
  if (!state.layerGroups) state.layerGroups = [];
}

function _getGroup(id) {
  return (state.layerGroups || []).find(g => g.id === id) || null;
}

function _layersInGroup(groupId) {
  return state.layers
    .map((l, i) => ({ layer: l, idx: i }))
    .filter(({ layer }) => (layer._groupId || null) === groupId);
}

// ── Group CRUD ──
function createLayerGroup() {
  _ensureGroups();
  const name = prompt('Group name:', 'New Group');
  if (!name) return;
  const id = 'grp_' + Date.now();
  state.layerGroups.push({ id, name, collapsed: false, visible: true });
  updateLayerList();
  toast('Group "' + name + '" created', 'success');
}

function renameLayerGroup(id) {
  const g = _getGroup(id);
  if (!g) return;
  const name = prompt('Rename group:', g.name);
  if (!name) return;
  g.name = name;
  updateLayerList();
}

function deleteLayerGroup(id) {
  const g = _getGroup(id);
  if (!g) return;
  if (!confirm('Delete group "' + g.name + '"?\nLayers inside will become ungrouped.')) return;
  state.layers.forEach(l => { if ((l._groupId || null) === id) l._groupId = null; });
  state.layerGroups = state.layerGroups.filter(grp => grp.id !== id);
  updateLayerList();
}

function toggleGroupCollapsed(id) {
  const g = _getGroup(id);
  if (!g) return;
  g.collapsed = !g.collapsed;
  updateLayerList();
}

function toggleGroupVisibility(id) {
  const g = _getGroup(id);
  if (!g) return;
  g.visible = !g.visible;
  state.layers.forEach((l, i) => {
    if ((l._groupId || null) === id) {
      l.visible = g.visible;
      _renderMapLayer(l, i);
    }
  });
  updateLayerList();
}

function fitGroup(id) {
  const items = _layersInGroup(id).filter(({ layer }) => layer.visible && !layer.isTile);
  if (!items.length) { toast('No visible layers in group', 'warning'); return; }
  const allPts = [];
  function cc(c) { if(!Array.isArray(c))return; if(typeof c[0]==='number')allPts.push(c); else c.forEach(cc); }
  items.forEach(({ layer }) => (layer.geojson?.features||[]).forEach(f => { if(f.geometry) cc(f.geometry.coordinates); }));
  if (!allPts.length) return;
  try {
    state.map.fitBounds([[Math.min(...allPts.map(p=>p[0])), Math.min(...allPts.map(p=>p[1]))],
                         [Math.max(...allPts.map(p=>p[0])), Math.max(...allPts.map(p=>p[1]))]], { padding: CONSTANTS.MAP_FIT_PADDING });
  } catch(_) {}
}

// ── Drag state ──
// _drag.kind = 'layer' | 'group'
// _drag.layerIdx (when kind==='layer')
// _drag.groupId  (when kind==='group')
let _drag = { kind: null, layerIdx: -1, groupId: null };

// ── updateLayerList ──
// Renders: [New Group btn] [group blocks in state.layerGroups order] [ungrouped layers]
function updateLayerList() {
  _ensureGroups();
  const el = document.getElementById('layer-list');
  document.getElementById('layer-count').textContent = state.layers.length ? `(${state.layers.length})` : '';

  const newGroupBtn = `<div style="padding:6px 8px 4px;">
    <button class="btn btn-ghost btn-sm" style="width:100%;font-size:10px;justify-content:center;gap:4px;"
            onclick="createLayerGroup()">＋ New Group</button></div>`;

  if (!state.layers.length && !(state.layerGroups || []).length) {
    el.innerHTML = `<div class="empty-state">No layers loaded.<br>Drop a file above to begin.</div>${newGroupBtn}`;
    return;
  }

  const groups = state.layerGroups || [];
  let html = newGroupBtn;

  // Named groups (in their stored order)
  groups.forEach((group, gIdx) => {
    const items = _layersInGroup(group.id);
    const eyeIcon = group.visible ? '👁' : '🚫';
    const chevron = group.collapsed ? '▶' : '▼';
    const accent = group.visible ? 'var(--teal)' : 'var(--text3)';
    const isFirst = gIdx === 0;
    const isLast  = gIdx === groups.length - 1;

    html += `<div class="layer-group-block" data-group-id="${group.id}"
                  ondragover="handleGroupBlockDragOver(event,'${group.id}')"
                  ondragleave="handleGroupBlockDragLeave(event)"
                  ondrop="handleGroupBlockDrop(event,'${group.id}')">
      <div class="layer-group-header" style="border-left:3px solid ${accent};"
           draggable="true"
           ondragstart="handleGroupDragStart(event,'${group.id}')"
           ondragend="handleGroupDragEnd(event)">
        <button class="btn btn-ghost btn-sm" style="padding:1px 4px;font-size:10px;min-width:0;"
                onclick="toggleGroupCollapsed('${group.id}')">${chevron}</button>
        <button class="btn btn-ghost btn-sm" style="padding:1px 4px;font-size:11px;min-width:0;"
                onclick="toggleGroupVisibility('${group.id}')"
                title="${group.visible ? 'Hide group' : 'Show group'}">${eyeIcon}</button>
        <span class="layer-group-name" ondblclick="renameLayerGroup('${group.id}')"
              title="Double-click to rename">${escHtml(group.name)}</span>
        <span style="font-family:var(--mono);font-size:9px;color:var(--text3);margin-left:2px;">(${items.length})</span>
        <div style="flex:1;"></div>
        <button class="btn btn-ghost btn-sm" style="padding:1px 4px;font-size:13px;min-width:0;line-height:1;"
                onclick="moveGroupUp('${group.id}')" title="Move group up" ${isFirst?'disabled':''}>↑</button>
        <button class="btn btn-ghost btn-sm" style="padding:1px 4px;font-size:13px;min-width:0;line-height:1;"
                onclick="moveGroupDown('${group.id}')" title="Move group down" ${isLast?'disabled':''}>↓</button>
        <button class="btn btn-ghost btn-sm" style="padding:1px 5px;font-size:11px;min-width:0;"
                onclick="fitGroup('${group.id}')" title="Zoom to group">⛶</button>
        <button class="btn btn-ghost btn-sm" style="padding:1px 5px;font-size:10px;min-width:0;color:var(--text3);"
                onclick="dissolveGroup('${group.id}')" title="Ungroup all layers in this group">⊠</button>
        <button class="btn btn-ghost btn-sm" style="padding:1px 5px;font-size:11px;min-width:0;color:#f85149;"
                onclick="deleteLayerGroup('${group.id}')" title="Delete group">✕</button>
      </div>`;

    if (!group.collapsed) {
      if (items.length === 0) {
        html += `<div class="layer-group-empty">Drop layers here</div>`;
      } else {
        items.forEach(({ layer, idx }) => { html += _renderLayerItem(layer, idx); });
      }
    }
    html += `</div>`;
  });

  // Ungrouped layers
  const ungrouped = state.layers.map((l, i) => ({ layer: l, idx: i })).filter(({ layer }) => !layer._groupId);
  if (ungrouped.length) {
    html += `<div class="layer-group-block layer-group-ungrouped"
                  ondragover="handleGroupBlockDragOver(event,null)"
                  ondragleave="handleGroupBlockDragLeave(event)"
                  ondrop="handleGroupBlockDrop(event,null)">`;
    if (groups.length > 0) {
      html += `<div class="layer-group-header" style="border-left:3px solid var(--border);">
                 <span style="font-family:var(--mono);font-size:9px;font-weight:600;color:var(--text3);
                              letter-spacing:0.5px;text-transform:uppercase;">Ungrouped</span>
               </div>`;
    }
    ungrouped.forEach(({ layer, idx }) => { html += _renderLayerItem(layer, idx); });
    html += `</div>`;
  }

  el.innerHTML = html;
  // Keep geoprocessing layer selects in sync
  if (typeof updateGeoprocessLayerSelects === 'function') updateGeoprocessLayerSelects();
}

function _renderLayerItem(layer, i) {
  const groupOpts = (state.layerGroups || []).length > 0
    ? `<select class="layer-group-select" title="Move to group"
              onclick="event.stopPropagation()"
              onchange="event.stopPropagation();moveLayerToGroup(${i},this.value);this.value=''">
         <option value="">⊞ group</option>
         <option value="">— none —</option>
         ${(state.layerGroups||[]).map(g =>
           `<option value="${g.id}"${layer._groupId===g.id?' selected':''}>${escHtml(g.name)}</option>`
         ).join('')}
       </select>`
    : '';
  const featCount = layer.isTile ? 'Tile' : ((layer.geojson||{}).features||[]).length + ' feat';
  const _eyeOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const _eyeOff  = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  return `
    <div class="layer-item ${i===state.activeLayerIndex?'active':''}${layer.visible?'':' layer-hidden'}"
         onclick="setActiveLayer(${i})"
         draggable="true"
         ondragstart="handleLayerDragStart(event,${i})"
         ondragover="handleLayerDragOver(event,${i})"
         ondragleave="handleLayerDragLeave(event,${i})"
         ondrop="handleLayerDrop(event,${i})"
         ondragend="handleLayerDragEnd(event)">
      <!-- Row 1: handle · icon · name · eye -->
      <div class="layer-item-top">
        <div class="layer-drag-handle" title="Drag to reorder or into a group">⠿</div>
        <div class="layer-geom-icon"
             onclick="event.stopPropagation();openColorPickerForLayer(${i})"
             title="Click to change colour" style="cursor:pointer;">${layerGeomIcon(layer)}</div>
        <div class="layer-info">
          <div class="layer-name">${escHtml(layer.name)}</div>
        </div>
        <button class="btn btn-ghost btn-sm layer-vis-btn${layer.visible?'':' layer-vis-btn--off'}"
                onclick="event.stopPropagation();toggleLayerVisibility(${i})"
                title="${layer.visible?'Hide layer':'Show layer'}">${layer.visible?_eyeOpen:_eyeOff}</button>
      </div>
      <!-- Row 2: meta · group selector · options -->
      <div class="layer-item-bottom">
        <span class="layer-meta">${escHtml(layer.format)} · ${featCount}</span>
        ${groupOpts}
        <button class="btn btn-ghost btn-sm" style="padding:1px 5px;font-size:12px;letter-spacing:1px;flex-shrink:0;"
                onclick="event.stopPropagation();openLayerCtxMenu(event,${i})" title="Options">⋯</button>
      </div>
      <!-- Row 3: opacity -->
      <div class="layer-opacity-row" onclick="event.stopPropagation()"
           ondragstart="event.stopPropagation();event.preventDefault();" draggable="false">
        <span style="font-size:8px;color:var(--text3);font-family:var(--mono);flex-shrink:0;opacity:0.7;">opacity</span>
        <input type="range" min="0" max="100" value="${Math.round((layer.layerOpacity??1)*100)}"
               style="flex:1;height:2px;cursor:pointer;accent-color:#14b1e7;margin:0;padding:0;"
               title="Layer opacity"
               onclick="event.stopPropagation()"
               onmousedown="event.stopPropagation()"
               ontouchstart="event.stopPropagation()"
               oninput="event.stopPropagation();setLayerOpacity(${i},this.value/100)"/>
        <span style="font-size:8px;color:var(--text3);font-family:var(--mono);width:24px;text-align:right;flex-shrink:0;opacity:0.7;"
              >${Math.round((layer.layerOpacity??1)*100)}%</span>
      </div>
    </div>`;
}

// ── Move group up/down ──
function moveGroupUp(id) {
  const idx = state.layerGroups.findIndex(g => g.id === id);
  if (idx <= 0) return;
  [state.layerGroups[idx-1], state.layerGroups[idx]] = [state.layerGroups[idx], state.layerGroups[idx-1]];
  updateLayerList();
}
function moveGroupDown(id) {
  const idx = state.layerGroups.findIndex(g => g.id === id);
  if (idx < 0 || idx >= state.layerGroups.length - 1) return;
  [state.layerGroups[idx], state.layerGroups[idx+1]] = [state.layerGroups[idx+1], state.layerGroups[idx]];
  updateLayerList();
}

// Dissolve / ungroup — remove the group and set all its layers to ungrouped
function dissolveGroup(id) {
  const grp = state.layerGroups.find(g => g.id === id);
  if (!grp) return;
  if (!confirm(`Ungroup all layers in "${grp.name}"? The group will be removed but layers are kept.`)) return;
  state.layers.forEach(l => { if (l._groupId === id) l._groupId = null; });
  state.layerGroups = state.layerGroups.filter(g => g.id !== id);
  updateLayerList();
}

// Move a single layer into a named group (or remove from groups if groupId is '')
function moveLayerToGroup(layerIdx, groupId) {
  const l = state.layers[layerIdx];
  if (!l) return;
  l._groupId = groupId || null;
  updateLayerList();
}

// ── DRAG: layer items ──
let _layerDragSrc = -1;   // kept for legacy compat; _drag is the canonical state

function handleLayerDragStart(e, i) {
  _drag = { kind: 'layer', layerIdx: i, groupId: null };
  _layerDragSrc = i;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'layer:' + i);
  e.currentTarget.style.opacity = '0.4';
  e.stopPropagation();
}

function handleLayerDragOver(e, i) {
  if (_drag.kind === 'layer' && _drag.layerIdx === i) return;
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  const rect = e.currentTarget.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
  e.currentTarget.classList.add(e.clientY < mid ? 'drag-over-top' : 'drag-over-bottom');
}

function handleLayerDragLeave(e) {
  e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');
}

function handleLayerDrop(e, targetLayerIdx) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-over-top', 'drag-over-bottom');

  if (_drag.kind === 'layer') {
    const srcIdx = _drag.layerIdx;
    if (srcIdx < 0 || srcIdx === targetLayerIdx) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    let insertAt = above ? targetLayerIdx : targetLayerIdx + 1;
    if (srcIdx < insertAt) insertAt--;

    // Join the target's group
    const targetGroupId = state.layers[targetLayerIdx] ? (state.layers[targetLayerIdx]._groupId || null) : null;
    state.layers[srcIdx]._groupId = targetGroupId;

    const moved = state.layers.splice(srcIdx, 1)[0];
    state.layers.splice(insertAt, 0, moved);

    if (state.activeLayerIndex === srcIdx) {
      state.activeLayerIndex = insertAt;
    } else {
      if (srcIdx < state.activeLayerIndex && insertAt >= state.activeLayerIndex) state.activeLayerIndex--;
      else if (srcIdx > state.activeLayerIndex && insertAt <= state.activeLayerIndex) state.activeLayerIndex++;
    }
    refreshLayerZOrder();
    updateLayerList(); updateExportLayerList(); updateSBLLayerList(); updateDQALayerList();

  } else if (_drag.kind === 'group') {
    // Group dropped onto an ungrouped layer item.
    // "above" the first ungrouped layer → move group to end of layerGroups (just before ungrouped block).
    // This is the only meaningful position since ungrouped layers form a single block after all named groups.
    _insertGroupAtUngroupedSlot(_drag.groupId);
  }
}

function handleLayerDragEnd(e) {
  e.currentTarget.style.opacity = '';
  document.querySelectorAll('.layer-item').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
  document.querySelectorAll('.layer-group-block').forEach(el => el.classList.remove('group-drag-over', 'drag-over-top', 'drag-over-bottom'));
  _drag = { kind: null, layerIdx: -1, groupId: null };
  _layerDragSrc = -1;
}

// ── DRAG: group headers ──
function handleGroupDragStart(e, groupId) {
  _drag = { kind: 'group', layerIdx: -1, groupId };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'group:' + groupId);
  e.currentTarget.closest('.layer-group-block').style.opacity = '0.45';
  e.stopPropagation();
}

function handleGroupDragEnd(e) {
  const block = e.currentTarget.closest('.layer-group-block');
  if (block) block.style.opacity = '';
  document.querySelectorAll('.layer-group-block').forEach(el => el.classList.remove('group-drag-over', 'drag-over-top', 'drag-over-bottom'));
  document.querySelectorAll('.layer-item').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
  _drag = { kind: null, layerIdx: -1, groupId: null };
  _layerDragSrc = -1;
}

// ── DRAG: group block drop zones ──
function handleGroupBlockDragOver(e, groupId) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  if (_drag.kind === 'group' && _drag.groupId === groupId) return;
  if (_drag.kind === 'group') {
    const block = e.currentTarget.closest('.layer-group-block') || e.currentTarget;
    const rect = block.getBoundingClientRect();
    block.classList.remove('drag-over-top', 'drag-over-bottom');
    block.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drag-over-top' : 'drag-over-bottom');
  } else {
    e.currentTarget.classList.add('group-drag-over');
  }
}

function handleGroupBlockDragLeave(e) {
  e.currentTarget.classList.remove('group-drag-over', 'drag-over-top', 'drag-over-bottom');
  const block = e.currentTarget.closest('.layer-group-block');
  if (block) block.classList.remove('drag-over-top', 'drag-over-bottom');
}

function handleGroupBlockDrop(e, targetGroupId) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('group-drag-over', 'drag-over-top', 'drag-over-bottom');
  const block = e.currentTarget.closest('.layer-group-block');
  if (block) block.classList.remove('drag-over-top', 'drag-over-bottom');

  if (_drag.kind === 'layer') {
    const srcIdx = _drag.layerIdx;
    if (srcIdx < 0) return;
    state.layers[srcIdx]._groupId = targetGroupId || null;
    _drag = { kind: null, layerIdx: -1, groupId: null };
    _layerDragSrc = -1;
    updateLayerList();

  } else if (_drag.kind === 'group') {
    const srcId = _drag.groupId;
    if (!srcId || srcId === targetGroupId) return;
    const srcI = state.layerGroups.findIndex(g => g.id === srcId);
    if (srcI < 0) return;

    if (targetGroupId === null) {
      // Dropped on the ungrouped container header — move group to end
      const [grp] = state.layerGroups.splice(srcI, 1);
      state.layerGroups.push(grp);
    } else {
      let destI = state.layerGroups.findIndex(g => g.id === targetGroupId);
      if (destI < 0) return;
      const rect = (block || e.currentTarget).getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      const [grp] = state.layerGroups.splice(srcI, 1);
      destI = state.layerGroups.findIndex(g => g.id === targetGroupId);
      state.layerGroups.splice(above ? destI : destI + 1, 0, grp);
    }
    _drag = { kind: null, layerIdx: -1, groupId: null };
    _layerDragSrc = -1;
    updateLayerList();
  }
}

// Move a named group to the end of layerGroups so it renders
// immediately before the ungrouped block. This is the correct behaviour
// when a group header is dropped onto any ungrouped layer item.
function _insertGroupAtUngroupedSlot(groupId) {
  const srcI = state.layerGroups.findIndex(g => g.id === groupId);
  if (srcI < 0) return;
  const [grp] = state.layerGroups.splice(srcI, 1);
  state.layerGroups.push(grp);
  updateLayerList();
}

// Layer Z-order in MapLibre is determined by layer insertion order.
// Re-render all layers to maintain order: layers[0] on top (rendered last).
function refreshLayerZOrder() {
  // In MapLibre, layers added later render on top.
  // We want layers[0] on top, so we re-insert from last to first.
  // Simple approach: just update visibility — MapLibre preserves order of addLayer calls.
  // For a full reorder we'd need to remove and re-add all layers.
  // For now, just ensure each layer's visibility matches its visible flag.
  state.layers.forEach((l, i) => {
    const mapId = _layerMapId(i);
    const vis = l.visible ? 'visible' : 'none';
    ['', '-fill', '-stroke', '-line', '-circle'].forEach(s => {
      const lid = mapId + s;
      try { if (state.map.getLayer(lid)) state.map.setLayoutProperty(lid, 'visibility', vis); } catch(_) {}
    });
  });
}

function toggleLayerVisibility(i) {
  const l = state.layers[i];
  l.visible = !l.visible;
  _renderMapLayer(l, i);
  updateLayerList();
}

function _removeLayerImmediate(i) {
  const layer = state.layers[i];
  if (layer && layer.is3DBuildings) {
    ['3d-buildings-highlight', '3d-buildings-fill', '3d-buildings'].forEach(id => {
      try { if (state.map.getLayer(id)) state.map.removeLayer(id); } catch(_) {}
    });
    try { if (state.map.getSource('maptiler-v3')) state.map.removeSource('maptiler-v3'); } catch(_) {}
  } else if (layer) {
    _removeMapLayers(_layerMapId(i));
  }
  state.layers.splice(i, 1);
  if (state.activeLayerIndex >= state.layers.length) state.activeLayerIndex = state.layers.length - 1;
  // Re-assign mapIds for all layers after the removed one
  for (let j = i; j < state.layers.length; j++) {
    state.layers[j].mapId = _layerMapId(j);
  }
  updateLayerList(); updateExportLayerList();
  _updateEmptyState();
  if (state.layers.length) setActiveLayer(state.activeLayerIndex); else clearStats();
}

// Set opacity for a specific layer index (0..1)
function setLayerOpacity(idx, val) {
  const layer = state.layers[idx];
  if (!layer) return;
  layer.layerOpacity = Math.max(0, Math.min(1, parseFloat(val)));
  _renderMapLayer(layer, idx);
  saveSession();
}


function removeLayer(i) {
  const layer = state.layers[i];
  if (!layer) return;
  if (!confirm(`Remove layer "${layer.name}"? This cannot be undone.`)) return;
  _removeLayerImmediate(i);
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
  const crsEl = document.getElementById('stat-crs');
  if (crsEl) crsEl.textContent = layer.sourceCRS || 'EPSG:4326';
  try {
    const pts = [];
    function cc(c) { if(!Array.isArray(c))return; if(typeof c[0]==='number')pts.push(c); else c.forEach(cc); }
    (layer.geojson?.features||[]).forEach(f => { if(f.geometry) cc(f.geometry.coordinates); });
    if (pts.length) {
      const w = Math.min(...pts.map(p=>p[0])).toFixed(5);
      const e = Math.max(...pts.map(p=>p[0])).toFixed(5);
      const s = Math.min(...pts.map(p=>p[1])).toFixed(5);
      const n = Math.max(...pts.map(p=>p[1])).toFixed(5);
      document.getElementById('bbox-section').style.display='block';
      document.getElementById('bb-w').textContent=w;
      document.getElementById('bb-e').textContent=e;
      document.getElementById('bb-s').textContent=s;
      document.getElementById('bb-n').textContent=n;
    }
  } catch(e){}
  updateLegend();
}

function clearStats() {
  ['stat-features','stat-fields','stat-geomtype','stat-crs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '–';
  });
  document.getElementById('bbox-section').style.display='none';
  document.getElementById('stats-section').style.display='none';
  document.getElementById('attr-strip-table-wrap').innerHTML='<div class="empty-state">Select a layer to view attributes</div>';
  document.getElementById('table-count').textContent='';
}

