// gaia-attribute.js — Legend, empty state, attribute table, feature inspector, export, utilities
// ── LEGEND ──────────────────────────────────────
function _makeLegendEntryHTML(layer) {
  const geomType = layer.geomType || '';
  const isPoint = geomType.includes('Point');
  const isLine  = geomType.includes('Line');

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
        <span style="font-family:var(--mono);font-size:9px;color:var(--text3);">${c.count}</span>
      </div>`;
    }).join('');
    return `<div style="margin-bottom:8px;">
      <div style="font-family:var(--mono);font-size:9px;font-weight:600;color:var(--text2);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(layer.name)}</div>
      <div style="font-family:var(--mono);font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">${escHtml(field)}</div>
      ${rows}
    </div>`;
  }

  const color   = layer.fillColor    || layer.color || '#3498db';
  const outline = layer.outlineColor || layer.color || '#3498db';
  const noFill  = layer.noFill || false;
  const shape   = layer.pointShape || 'circle';
  let swatch;
  if (isPoint) {
    const size = 14;
    let svgShape;
    const r=(size-4)/2;
    svgShape = `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="${noFill?'none':color}" stroke="${outline}" stroke-width="1.5"/>`;
    swatch = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0;">${svgShape}</svg>`;
  } else if (isLine) {
    swatch = `<div style="width:28px;height:3px;background:${color};border-radius:2px;flex-shrink:0;margin:5px 0;"></div>`;
  } else {
    swatch = `<div style="width:22px;height:14px;border-radius:3px;background:${noFill?'transparent':color};border:2px solid ${outline};flex-shrink:0;"></div>`;
  }
  const featCount = (layer.geojson && layer.geojson.features) ? layer.geojson.features.length : 0;
  return `<div style="display:flex;align-items:center;gap:8px;padding:2px 0;margin-bottom:4px;">
    ${swatch}
    <span style="font-family:var(--mono);font-size:10px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escHtml(layer.name)}</span>
    <span style="font-family:var(--mono);font-size:9px;color:var(--text3);flex-shrink:0;">${featCount}</span>
  </div>`;
}

function updateLegend() {
  const legendBody = document.getElementById('legend-body');
  if (!legendBody) return;

  const visibleLayers = state.layers.filter(l => l && l.visible && (!l.isTile || l.isDEALayer));
  if (!visibleLayers.length) {
    legendBody.innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--text3);padding:4px 0;">No visible layers</div>';
    return;
  }

  legendBody.innerHTML = visibleLayers.map(l => {
    // ── DEA LANDCOVER raster layer ────────────────────────────────────────
    if (l.isDEALayer) {
      const styleLabel = l.deaStyle === 'level3' ? 'Level 3' : 'Level 4';
      const cats = (typeof _DEA_CATEGORIES !== 'undefined') ? _DEA_CATEGORIES : [];
      const swatches = cats.map(cat =>
        `<div style="display:flex;align-items:center;gap:5px;padding:1px 0 1px 18px;">
          <div style="width:12px;height:12px;border-radius:2px;background:${cat.color};flex-shrink:0;border:1px solid rgba(0,0,0,0.12);"></div>
          <span style="font-family:var(--mono);font-size:9px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cat.label}</span>
        </div>`
      ).join('');
      return `<div style="padding:3px 2px;margin-bottom:4px;border-radius:3px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font-size:9px;color:var(--text3);flex-shrink:0;">🛰</span>
          <span style="font-family:var(--mono);font-size:10px;color:var(--text2);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escHtml(l.name)}</span>
          <span style="font-family:var(--mono);font-size:9px;color:var(--text3);flex-shrink:0;padding:1px 4px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;">${escHtml(styleLabel)}</span>
        </div>
        ${swatches}
        <div style="font-family:var(--mono);font-size:8px;color:var(--text3);padding-left:18px;margin-top:3px;">© Geoscience Australia / DEA</div>
      </div>`;
    }
    const idx       = state.layers.indexOf(l);
    const geomType  = l.geomType || '';
    const isPoint   = geomType.includes('Point');
    const isLine    = geomType.includes('Line');
    const featCount = (l.geojson && l.geojson.features) ? l.geojson.features.length : 0;
    const shape     = l.pointShape || 'circle';
    const color     = l.fillColor    || l.color || '#3498db';
    const outline   = l.outlineColor || l.color || '#3498db';
    const noFill    = l.noFill || false;

    // Drag handle attrs shared by every top-level row
    const dragAttrs = `draggable="true"
      data-layer-idx="${idx}"
      ondragstart="legendDragStart(event,${idx})"
      ondragover="legendDragOver(event)"
      ondragleave="legendDragLeave(event)"
      ondrop="legendDrop(event,${idx})"
      ondragend="legendDragEnd(event)"`;

    if (l.classified && l.classifyClasses && l.classifyClasses.length) {
      // ── CLASSIFIED layer ───────────────────────────────────────────────
      const field = l.classifyField || '';
      const classRows = l.classifyClasses.map(c => {
        let swatch;
        if (isPoint) {
          const sz = 12;
          let svgShape;
          svgShape = `<circle cx="${sz/2}" cy="${sz/2}" r="${sz/2-1}" fill="${c.color}" stroke="${c.color}" stroke-width="0.5" opacity="0.9"/>`;
          swatch = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" style="flex-shrink:0;">${svgShape}</svg>`;
        } else if (isLine) {
          swatch = `<div style="width:22px;height:3px;background:${c.color};border-radius:2px;flex-shrink:0;margin:4px 0;"></div>`;
        } else {
          swatch = `<div style="width:18px;height:12px;border-radius:2px;background:${c.color};border:1px solid rgba(0,0,0,0.15);flex-shrink:0;"></div>`;
        }
        return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0 2px 18px;">
          ${swatch}
          <span style="font-family:var(--mono);font-size:9px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escHtml(String(c.label))}</span>
          <span style="font-family:var(--mono);font-size:9px;color:var(--text3);flex-shrink:0;">${c.count}</span>
        </div>`;
      }).join('');

      return `<div class="legend-item" ${dragAttrs}
          style="padding:3px 2px;margin-bottom:4px;cursor:grab;border-radius:3px;user-select:none;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
          <span style="font-size:9px;color:var(--text3);cursor:grab;flex-shrink:0;" title="Drag to reorder">⠿</span>
          <span style="font-family:var(--mono);font-size:10px;color:var(--text2);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escHtml(l.name)}</span>
          <span style="font-family:var(--mono);font-size:9px;color:var(--text3);flex-shrink:0;">${featCount}</span>
        </div>
        <div style="font-family:var(--mono);font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;padding-left:18px;margin-bottom:2px;">${escHtml(field)}</div>
        ${classRows}
      </div>`;
    }

    // ── SINGLE-SYMBOL layer ────────────────────────────────────────────
    const swatch = _makeLegendSwatchHTML(l);
    return `<div class="legend-item" ${dragAttrs}
        style="display:flex;align-items:center;gap:6px;padding:3px 2px;margin-bottom:3px;cursor:grab;border-radius:3px;user-select:none;">
      <span style="font-size:9px;color:var(--text3);cursor:grab;flex-shrink:0;" title="Drag to reorder">⠿</span>
      ${swatch}
      <span style="font-family:var(--mono);font-size:10px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escHtml(l.name)}</span>
      <span style="font-family:var(--mono);font-size:9px;color:var(--text3);flex-shrink:0;">${featCount}</span>
    </div>`;
  }).join('');
}

// Separate helper that produces just the swatch HTML (shared with legend rows)
function _makeLegendSwatchHTML(layer) {
  const geomType = layer.geomType || '';
  const isPoint = geomType.includes('Point');
  const isLine  = geomType.includes('Line');
  const color   = layer.fillColor    || layer.color || '#3498db';
  const outline = layer.outlineColor || layer.color || '#3498db';
  const noFill  = layer.noFill || false;
  const shape   = layer.pointShape || 'circle';
  if (layer.classified && layer.classifyClasses && layer.classifyClasses.length) {
    // For classified, just show a multi-swatch indicator
    const c0 = layer.classifyClasses[0] ? layer.classifyClasses[0].color : color;
    const cx = layer.classifyClasses.length > 1 ? layer.classifyClasses[Math.floor(layer.classifyClasses.length/2)].color : color;
    return `<div style="display:flex;gap:1px;flex-shrink:0;">
      <div style="width:6px;height:12px;border-radius:1px;background:${c0};"></div>
      <div style="width:6px;height:12px;border-radius:1px;background:${cx};"></div>
    </div>`;
  }
  if (isPoint) {
    const size = 14;
    let svgShape;
    const r=(size-4)/2;
    svgShape = `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="${noFill?'none':color}" stroke="${outline}" stroke-width="1.5"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0;">${svgShape}</svg>`;
  } else if (isLine) {
    return `<div style="width:28px;height:3px;background:${color};border-radius:2px;flex-shrink:0;margin:5px 0;"></div>`;
  } else {
    return `<div style="width:22px;height:14px;border-radius:3px;background:${noFill?'transparent':color};border:2px solid ${outline};flex-shrink:0;"></div>`;
  }
}

// Legend drag-to-reorder
let _legendDragSrcIdx = -1;

function legendDragStart(e, layerIdx) {
  _legendDragSrcIdx = layerIdx;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(layerIdx));
  e.currentTarget.style.opacity = '0.4';
}

function legendDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.style.background = 'var(--bg3)';
  e.currentTarget.style.borderTop = '2px solid var(--accent)';
}

function legendDragLeave(e) {
  e.currentTarget.style.background = '';
  e.currentTarget.style.borderTop = '';
}

function legendDrop(e, targetLayerIdx) {
  e.preventDefault();
  e.currentTarget.style.background = '';
  e.currentTarget.style.borderTop = '';
  if (_legendDragSrcIdx < 0 || _legendDragSrcIdx === targetLayerIdx) return;
  // Reorder state.layers so the dragged layer moves to the target position
  const srcLayer = state.layers[_legendDragSrcIdx];
  state.layers.splice(_legendDragSrcIdx, 1);
  const newTarget = state.layers.indexOf(state.layers.find((l, i) => {
    // Re-find target after splice
    return l === state.layers[targetLayerIdx > _legendDragSrcIdx ? targetLayerIdx - 1 : targetLayerIdx];
  }));
  // Simpler: find target layer by data attribute
  const destEl = e.currentTarget;
  const destIdx = parseInt(destEl.getAttribute('data-layer-idx'));
  // We already spliced srcLayer out; find the new index for destIdx
  let insertAt = destIdx > _legendDragSrcIdx ? destIdx - 1 : destIdx;
  state.layers.splice(insertAt, 0, srcLayer);
  if (state.activeLayerIndex === _legendDragSrcIdx) state.activeLayerIndex = insertAt;
  refreshLayerZOrder();
  updateLayerList();
  updateLegend();
}

function legendDragEnd(e) {
  _legendDragSrcIdx = -1;
  e.currentTarget.style.opacity = '';
  e.currentTarget.style.background = '';
  e.currentTarget.style.borderTop = '';
}

// ── EMPTY STATE VISIBILITY ───────────────────────────────────────────────────
let _mesDismissed = false;

function dismissEmptyState() {
  _mesDismissed = true;
  const mes = document.getElementById('map-empty-state');
  if (!mes) return;
  mes.style.display = 'none';
  mes.style.pointerEvents = 'none';
}

function _updateEmptyState() {
  if (_mesDismissed) return;
  const mes = document.getElementById('map-empty-state');
  if (!mes) return;
  const hasLayers = state.layers.some(l => l != null);
  if (hasLayers) {
    dismissEmptyState();
  } else {
    mes.style.display = 'flex';
    mes.style.pointerEvents = '';
    mes.style.opacity = '';
    mes.classList.remove('mes-hidden');
  }
}


// ── Virtualised table state ──────────────────────────────────────────────────
const _vt = {
  ROW_H:    32,   // approximate row height in px
  BUFFER:   40,   // extra rows to render above/below viewport
  rows:     [],   // full filtered+sorted row array for current render
  start:    0,    // first rendered row index
  end:      0,    // last rendered row index (exclusive)
  layerIdx: -1,
  orderedFields: [],
  widths:   {},
  ftc:      {},
  isEditablePoint: false,
};

function _vtBuildRow(layerIdx, {feat, idx}) {
  const layer = state.layers[layerIdx];
  const coords = feat.geometry && feat.geometry.type === 'Point' ? feat.geometry.coordinates : null;
  const dataCells = _vt.orderedFields.map(f => {
    let raw, extraStyle = '';
    if (f === 'Latitude')       { raw = coords ? coords[1].toFixed(7) : '–'; extraStyle = 'color:var(--teal);font-family:var(--mono);'; }
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
}

function _vtRenderWindow(forceScroll) {
  const wrap = document.getElementById('attr-strip-table-wrap');
  if (!wrap) return;
  const tbody = wrap.querySelector('tbody');
  if (!tbody) return;

  const scrollTop  = wrap.scrollTop;
  const viewH      = wrap.clientHeight || 300;
  const totalRows  = _vt.rows.length;
  const totalH     = totalRows * _vt.ROW_H;

  const firstVis = Math.floor(scrollTop / _vt.ROW_H);
  const lastVis  = Math.ceil((scrollTop + viewH) / _vt.ROW_H);
  const start    = Math.max(0, firstVis - _vt.BUFFER);
  const end      = Math.min(totalRows, lastVis + _vt.BUFFER);

  if (!forceScroll && start === _vt.start && end === _vt.end) return;
  _vt.start = start; _vt.end = end;

  const padTop = start * _vt.ROW_H;
  const padBot = Math.max(0, (totalRows - end) * _vt.ROW_H);

  const html = _vt.rows.slice(start, end).map(r => _vtBuildRow(_vt.layerIdx, r)).join('');
  tbody.innerHTML =
    `<tr class="vt-spacer" style="height:${padTop}px;"><td colspan="999"></td></tr>` +
    html +
    `<tr class="vt-spacer" style="height:${padBot}px;"><td colspan="999"></td></tr>`;

  const allCb = document.getElementById('select-all-cb');
  if (allCb) {
    allCb.checked = totalRows > 0 && _vt.rows.every(({idx}) => state.selectedFeatureIndices.has(idx));
    allCb.indeterminate = !allCb.checked && _vt.rows.some(({idx}) => state.selectedFeatureIndices.has(idx));
  }
}

function renderTable() {
  const spinner = document.getElementById('attr-table-spinner');
  if (spinner) spinner.style.display = '';
  const layer=state.layers[state.activeLayerIndex];
  if(!layer) { if (spinner) spinner.style.display = 'none'; return; }
  const feats=layer.geojson.features||[];
  const fields=Object.keys(layer.fields);
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

  function applyColOrder(fields) {
    if (!state.columnOrder || !state.columnOrder.length) return fields;
    const inOrder = state.columnOrder.filter(f => fields.includes(f));
    const rest = fields.filter(f => !inOrder.includes(f));
    return [...inOrder, ...rest];
  }
  const orderedFields = applyColOrder(displayFields);

  if (!state.colWidths) state.colWidths = {};
  if (!state.colWidths[layerIdx]) state.colWidths[layerIdx] = {};
  const widths = state.colWidths[layerIdx];

  // Stash virtualiser state
  _vt.rows = rows; _vt.start = -1; _vt.end = -1;
  _vt.layerIdx = layerIdx; _vt.orderedFields = orderedFields;
  _vt.widths = widths; _vt.ftc = ftc;

  const colCkbox = `<col style="width:28px;min-width:28px;">`;
  const colNum   = `<col style="width:34px;min-width:34px;">`;
  const dataCols2 = orderedFields.map(f => {
    const w = widths[f] ? `${widths[f]}px` : '140px';
    return `<col data-col="${escHtml(f)}" style="width:${w};min-width:60px;">`;
  }).join('');
  const colgroup = `<colgroup>${colCkbox}${colNum}${dataCols2}</colgroup>`;

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

  const wrap = document.getElementById('attr-strip-table-wrap');
  wrap.innerHTML = `<table>${colgroup}<thead><tr>
    <th style="width:28px;text-align:center;cursor:default;" title="Select all/none"><input type="checkbox" id="select-all-cb" style="accent-color:var(--accent);cursor:pointer;" onchange="toggleSelectAll(this.checked)"/></th>
    <th style="width:34px;cursor:default;">#</th>
    ${headerCols}
  </tr></thead><tbody></tbody></table>`;

  wrap.onscroll = () => _vtRenderWindow(false);
  _vtRenderWindow(true);
  _initColResizeHandles();
  if (spinner) spinner.style.display = 'none';
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
    if(feat) { showFeatureInspector(feat); _mapFlyToFeature(feat); }
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
  if(!feat){el.innerHTML=`<div class="no-selection"><div class="ns-icon">◎</div><div class="ns-text">Click a feature on the map to inspect its attributes</div></div>`;return;}
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
    coordInfo=`<div class="prop-row"><div class="prop-key">geom</div><div class="prop-val" style="color:var(--text3)">${geomType} · ${flat.length} pts</div></div>`;
  }
  el.innerHTML=`<div class="geom-badge ${geomClass}">${geomIcon} ${geomType}</div>
  <div class="prop-group">${coordInfo}${propRows||'<div style="color:var(--text3);font-size:11px;padding:4px 0;">No properties</div>'}</div>`;
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
  updateSBLLayerList(); updateDQALayerList();
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

// ── UTILITIES ── (escHtml defined in gaia-utils.js)

function setMapZoom(z) {
  if (!state.map || isNaN(z)) return;
  z = Math.max(0, Math.min(22, z));
  state.map.setZoom(z);
  const zi = document.getElementById('zoom-input');
  if (zi) zi.value = z;
}

function fitAll(){
  const ls = state.layers.filter(l => l.visible && !l.isTile); if (!ls.length) return;
  const allPts = [];
  function cc(c) { if(!Array.isArray(c))return; if(typeof c[0]==='number')allPts.push(c); else c.forEach(cc); }
  ls.forEach(l => (l.geojson?.features||[]).forEach(f => { if(f.geometry) cc(f.geometry.coordinates); }));
  if (!allPts.length) return;
  try {
    state.map.fitBounds([[Math.min(...allPts.map(p=>p[0])), Math.min(...allPts.map(p=>p[1]))],
                         [Math.max(...allPts.map(p=>p[0])), Math.max(...allPts.map(p=>p[1]))]], { padding: CONSTANTS.MAP_FIT_PADDING });
  } catch(_) {}
}

function clearAll(){
  if (state.layers.length && !confirm(`Remove all ${state.layers.length} layer${state.layers.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
  // Remove all MapLibre sources/layers
  state.layers.forEach((l, i) => _removeMapLayers(_layerMapId(i)));
  state.layers=[]; state.activeLayerIndex=-1; state.selectedFeatureIndex=-1; state.selectedFeatureIndices=new Set();
  updateLayerList(); updateExportLayerList(); clearStats(); showFeatureInspector(null);
  document.getElementById('search-input').value=''; state.filterText=''; state.showOnlySelected=false;
  const ssb=document.getElementById('show-selected-btn');
  if(ssb){ssb.style.borderColor='';ssb.style.color='';ssb.style.background='';ssb.textContent='◈ Show Selected';}
  _updateEmptyState();
}

function toggleSection(header){
  const body = header.nextElementSibling;
  const collapsed = header.classList.toggle('collapsed');
  body.classList.toggle('collapsed-body', collapsed);
}

function toast(msg, type='info') {
  const icons = {
    success: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7" fill="#3a9050" opacity="0.15"/><path d="M4.5 8l2.5 2.5 4.5-5" stroke="#3a9050" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    error:   `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7" fill="#c8504a" opacity="0.15"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#c8504a" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    info:    `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="7" fill="#2e8b8b" opacity="0.15"/><path d="M8 7v4M8 5.5v.5" stroke="#2e8b8b" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  };
  const dur = CONSTANTS.TOAST_DURATION_MS;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.style.setProperty('--toast-dur', dur + 'ms');
  el.innerHTML = `<div class="toast-inner">
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-msg">${escHtml(msg)}</span>
  </div>
  <div class="toast-progress"></div>`;

  const dismiss = () => {
    if (el.classList.contains('dismissing')) return;
    el.classList.add('dismissing');
    setTimeout(() => el.remove(), 200);
  };
  el.addEventListener('click', dismiss);

  document.getElementById('toast-container').appendChild(el);
  setTimeout(dismiss, dur);
}

