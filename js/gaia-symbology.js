// gaia-symbology.js — Layer symbology, classify symbology, export PNG, PDF template export, field calculator
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
  // For point layers, default outline to black; for others, use layer color
  const _isPointForPicker = layer.geomType === 'Point' || layer.geomType === 'MultiPoint' ||
    (layer.geojson && (layer.geojson.features||[]).some(f => f.geometry?.type?.includes('Point')));
  const outlineCol = layer.outlineColor || (_isPointForPicker ? '#000000' : layer.color || '#3498db');
  const noFill = layer.noFill || false;

  document.getElementById('fill-color-custom').value = fillCol;
  document.getElementById('outline-color-custom').value = outlineCol;
  document.getElementById('no-fill-btn').style.background = noFill ? '#0074a8' : '#edf0f3';
  document.getElementById('no-fill-btn').style.color = noFill ? '#fff' : '';
  _updateColorPreview(fillCol, outlineCol, noFill);

  // Sync outline width slider
  const isPointLayer2 = layer.geomType === 'Point' || layer.geomType === 'MultiPoint' ||
    (layer.geojson && (layer.geojson.features||[]).some(f => f.geometry?.type?.includes('Point')));
  const hasLineGeom = layer.geojson && (layer.geojson.features||[]).some(f => f.geometry?.type?.includes('Line'));
  const defaultOW = isPointLayer2 ? 0.5 : (hasLineGeom ? 1 : 2);
  const ow = layer.outlineWidth != null ? layer.outlineWidth : defaultOW;
  const owSlider = document.getElementById('outline-width-slider');
  const owLabel  = document.getElementById('outline-width-label');
  if (owSlider) owSlider.value = ow;
  if (owLabel)  owLabel.textContent = ow + 'px';

  // Show point shape + size rows only for point layers
  const isPointLayer = layer.geomType === 'Point' || layer.geomType === 'MultiPoint' ||
    (layer.geojson && (layer.geojson.features||[]).some(f => f.geometry?.type?.includes('Point')));
  const shapeRow = document.getElementById('point-shape-row');
  const sizeRow  = document.getElementById('point-size-row');
  if (shapeRow) shapeRow.style.display = isPointLayer ? 'block' : 'none';
  if (sizeRow)  sizeRow.style.display  = isPointLayer ? 'block' : 'none';

  if (isPointLayer) {
    const curShape = layer.pointShape || 'circle';
    ['circle'].forEach(s => {
      const btn = document.getElementById('shape-btn-' + s);
      if (btn) {
        btn.style.borderColor = s === curShape ? '#0074a8' : 'transparent';
        btn.style.background  = s === curShape ? '#e3f3fc' : '#edf0f3';
      }
    });
    // Sync point size slider
    const ps = layer.pointSize != null ? layer.pointSize : 9;
    const psSlider = document.getElementById('point-size-slider');
    const psLabel  = document.getElementById('point-size-label');
    if (psSlider) psSlider.value = ps;
    if (psLabel)  psLabel.textContent = ps + 'px';
  }

  // Build swatch grids
  _buildSwatches('fill-color-swatches', fillCol, (c) => applyFillColor(c));
  _buildSwatches('outline-color-swatches', outlineCol, (c) => applyOutlineColor(c));

  // Position popup — taller now so allow more vertical room
  const layerEls = document.querySelectorAll('.layer-item');
  const targetEl = layerEls[layerIdx];
  if (targetEl) {
    const r = targetEl.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 220));
    const top  = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 460));
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
  updateLegend();
}

function applyOutlineColor(color) {
  const layer = state.layers[_colorPickerLayerIdx]; if (!layer) return;
  layer.outlineColor = color;
  document.getElementById('outline-color-custom').value = color;
  _applySymbologyToLeaflet(layer);
  _updateColorPreview(layer.fillColor || layer.color, color, layer.noFill || false);
  updateLayerList();
  updateLegend();
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
  updateLegend();
}

function applyPointShape(shape) {
  const layer = state.layers[_colorPickerLayerIdx]; if (!layer) return;
  layer.pointShape = shape;
  ['circle'].forEach(s => {
    const btn = document.getElementById('shape-btn-' + s);
    if (btn) {
      btn.style.borderColor = s === shape ? '#0074a8' : 'transparent';
      btn.style.background  = s === shape ? '#e3f3fc' : '#edf0f3';
    }
  });
  _applySymbologyToLeaflet(layer);
  updateLayerList();
  updateLegend();
}

function applyPointSize(size) {
  const layer = state.layers[_colorPickerLayerIdx]; if (!layer) return;
  layer.pointSize = size;
  _applySymbologyToLeaflet(layer);
  updateLayerList();
  updateLegend();
}

function applyOutlineWidth(width) {
  const layer = state.layers[_colorPickerLayerIdx]; if (!layer) return;
  layer.outlineWidth = width;
  _applySymbologyToLeaflet(layer);
  updateLayerList();
  updateLegend();
}

function _applySymbologyToLeaflet(layer) {
  const idx = state.layers.indexOf(layer);
  if (idx >= 0) _renderMapLayer(layer, idx);
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
  let layerIdx = parseInt(document.getElementById('cls-layer').value);
  if (isNaN(layerIdx)) layerIdx = state.activeLayerIndex;
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
      <span style="font-family:var(--mono);font-size:9px;color:var(--text3);">${c.count}</span>
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

  layer.classified = true;
  layer.classifyField = field;
  layer.classifyClasses = classes;
  // refreshMapSelection will use classifyColorMap to colour each feature
  refreshMapSelection(layerIdx);

  document.getElementById('classify-backdrop').classList.remove('open');
  toast(`Classified "${layer.name}" by "${field}" — ${classes.length} classes`, 'success');
  updateLegend();
}

function resetLayerSymbology() {
  const layerIdx = parseInt(document.getElementById('cls-layer').value);
  const layer = state.layers[layerIdx];
  if (!layer) return;
  layer.classified = false;
  layer.classifyField = null;
  layer.classifyClasses = null;
  refreshMapSelection(layerIdx);
  toast('Symbology reset to default', 'success');
  updateLegend();
}

