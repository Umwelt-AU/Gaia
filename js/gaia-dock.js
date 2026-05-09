// ══════════════════════════════════════════════════════════════
// GAIA DOCK MANAGER v2
// Fully dynamic drag-and-drop panel docking.
//
// Architecture:
//   _dock.docks  — array of live dock objects
//   Each dock:   { id, zone, panels[], active, floatX, floatY, w }
//   Zones:       'left' | 'right' | 'float'
//
// Drop targets during a drag:
//   Left edge  → create new dock in left zone
//   Right edge → create new dock in right zone
//   Existing dock overlay → merge panel into that dock (tab)
//   Map area / empty space → create new float dock at cursor
//
// Multiple docks per zone stack vertically.
// When a dock's last panel is moved away, the dock is destroyed.
// ══════════════════════════════════════════════════════════════

const _dock = {
  docks:    [],   // { id, zone, panels[], active, floatX, floatY, w }
  _counter: 0,
  _drag:    null, // { panelId }
};

// ── Helpers ───────────────────────────────────────────────────────────────

function _dockById(id)        { return _dock.docks.find(d => d.id === id); }
function _dockForPanel(pid)   { return _dock.docks.find(d => d.panels.includes(pid)); }
function _dockNewId()         { return 'dock-' + (_dock._counter++); }
function _panelLabel(pid)     { return pid === 'left-panel' ? 'Layers' : 'Properties'; }

// ── Public API ────────────────────────────────────────────────────────────

function dockInit() {
  _dock.docks = [
    { id: 'dock-0', zone: 'left',  panels: ['left-panel'],  active: 'left-panel',  floatX: 0,   floatY: 0,  w: 288 },
    { id: 'dock-1', zone: 'right', panels: ['right-panel'], active: 'right-panel', floatX: 400, floatY: 80, w: 288 },
  ];
  _dock._counter = 2;

  _dockBuildOverlay();
  _dockAddDragHandles();
  _dockRestoreFromStorage();
  _dockRender();
}

/** Move a panel to an existing dock (programmatic) */
function dockMoveTo(panelId, targetDockId) {
  _dockMovePanel(panelId, targetDockId);
  _dockSaveToStorage();
}

/** Switch active tab within a dock */
function dockSetActiveTab(dockId, panelId) {
  const dock = _dockById(dockId);
  if (dock) { dock.active = panelId; _dockRender(); }
}

// ── Drag handles ──────────────────────────────────────────────────────────

function _dockAddDragHandles() {
  ['left-panel', 'right-panel'].forEach(function(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel || panel.querySelector('.dock-grip')) return;
    const grip = document.createElement('div');
    grip.className = 'dock-grip';
    grip.title = 'Drag to move or re-dock';
    grip.innerHTML =
      '<svg width="20" height="8" viewBox="0 0 20 8" fill="currentColor" opacity="0.45">' +
      '<circle cx="4"  cy="2" r="1.3"/><circle cx="10" cy="2" r="1.3"/><circle cx="16" cy="2" r="1.3"/>' +
      '<circle cx="4"  cy="6" r="1.3"/><circle cx="10" cy="6" r="1.3"/><circle cx="16" cy="6" r="1.3"/>' +
      '</svg>';
    grip.addEventListener('mousedown', function(e) { _dockStartDrag(e, panelId); });
    panel.insertBefore(grip, panel.firstChild);
  });
}

// ── Drop zone overlay ─────────────────────────────────────────────────────

function _dockBuildOverlay() {
  if (document.getElementById('dock-overlay')) return;
  const el = document.createElement('div');
  el.id = 'dock-overlay';
  el.style.cssText = 'display:none;position:fixed;inset:0;z-index:9000;pointer-events:none;';
  document.body.appendChild(el);
}

function _dockShowOverlay(draggingPanelId) {
  const overlay = document.getElementById('dock-overlay');
  if (!overlay) return;
  overlay.innerHTML = '';
  overlay.style.display = 'block';

  const draggingDock = _dockForPanel(draggingPanelId);

  // ── Edge strips: create a NEW dock in that zone ──────────────────────────
  _dockOverlayZone(overlay, 'new-left',
    '◀ New Left',
    'left:0;top:0;width:64px;height:100%;border-radius:0 8px 8px 0;');
  _dockOverlayZone(overlay, 'new-right',
    'New Right ▶',
    'right:0;top:0;width:64px;height:100%;border-radius:8px 0 0 8px;');

  // ── Map area: drop to float ──────────────────────────────────────────────
  const mapCol = document.getElementById('map-column');
  if (mapCol) {
    const r = mapCol.getBoundingClientRect();
    const cx = Math.round(r.left + r.width  / 2);
    const cy = Math.round(r.top  + r.height / 2);
    _dockOverlayZone(overlay, 'float',
      '⊞  Float',
      'left:' + (cx-55) + 'px;top:' + (cy-28) + 'px;width:110px;height:56px;border-radius:8px;');
  }

  // ── Existing docks: drop to merge into that dock as a tab ────────────────
  _dock.docks.forEach(function(dock) {
    // Skip the panel's own dock if it's the sole occupant (moving to same place)
    if (draggingDock && draggingDock.id === dock.id && dock.panels.length === 1) return;
    const slot = document.getElementById('dock-slot-' + dock.id);
    if (!slot) return;
    const r = slot.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return;
    _dockOverlayZone(overlay, 'merge:' + dock.id,
      'Add here',
      'left:' + Math.round(r.left) + 'px;top:' + Math.round(r.top) +
      'px;width:' + Math.round(r.width) + 'px;height:' + Math.round(r.height) + 'px;',
      true);
  });
}

function _dockOverlayZone(overlay, action, label, style, isExisting) {
  const el = document.createElement('div');
  el.className = 'dock-zone' + (isExisting ? ' dock-zone-existing' : '');
  el.style.cssText = 'position:absolute;pointer-events:all;' + style;
  el.innerHTML = '<span class="dock-zone-label">' + label + '</span>';
  el.addEventListener('mouseenter', function() { el.classList.add('dock-zone-hover'); });
  el.addEventListener('mouseleave', function() { el.classList.remove('dock-zone-hover'); });
  el.addEventListener('mouseup', function(e) {
    // Do NOT stopPropagation — the document-level onUp must still fire to
    // remove the ghost, dock-dragging class, overlay, and clear _dock._drag.
    // Without it the panel stays at 35% opacity / pointer-events:none.
    _dockDrop(action, e.clientX, e.clientY);
  });
  overlay.appendChild(el);
}

function _dockHideOverlay() {
  const overlay = document.getElementById('dock-overlay');
  if (overlay) { overlay.style.display = 'none'; overlay.innerHTML = ''; }
}

// ── Drag lifecycle ────────────────────────────────────────────────────────

function _dockStartDrag(e, panelId) {
  e.preventDefault();
  e.stopPropagation();

  const panel = document.getElementById(panelId);
  const dock  = _dockForPanel(panelId);

  // Build ghost
  const ghost = document.createElement('div');
  ghost.className = 'dock-ghost';
  ghost.textContent = _panelLabel(panelId);
  ghost.style.left = e.clientX + 'px';
  ghost.style.top  = (e.clientY - 20) + 'px';
  document.body.appendChild(ghost);

  panel.classList.add('dock-dragging');
  _dockShowOverlay(panelId);
  _dock._drag = { panelId };

  function onMove(ev) {
    ghost.style.left = ev.clientX + 'px';
    ghost.style.top  = (ev.clientY - 20) + 'px';
    // If panel lives in a float dock, move that dock window in real time
    if (dock && dock.zone === 'float') {
      const dx = ev.clientX - e.clientX;
      const dy = ev.clientY - e.clientY;
      const slot = document.getElementById('dock-slot-' + dock.id);
      if (slot) {
        const nx = Math.max(0, Math.min(window.innerWidth  - 80, dock.floatX + dx));
        const ny = Math.max(0, Math.min(window.innerHeight - 40, dock.floatY + dy));
        slot.style.left = nx + 'px';
        slot.style.top  = ny + 'px';
      }
    }
  }

  function onUp(ev) {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
    panel.classList.remove('dock-dragging');
    _dockHideOverlay();
    // Commit float position if the dock still exists and wasn't moved away
    if (dock && dock.zone === 'float' && _dockById(dock.id)) {
      const slot = document.getElementById('dock-slot-' + dock.id);
      if (slot) {
        dock.floatX = parseInt(slot.style.left) || dock.floatX;
        dock.floatY = parseInt(slot.style.top)  || dock.floatY;
        _dockSaveToStorage();
      }
    }
    _dock._drag = null;
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── Drop handling ─────────────────────────────────────────────────────────

function _dockDrop(action, dropX, dropY) {
  if (!_dock._drag) return;
  const panelId = _dock._drag.panelId;

  if (action === 'new-left') {
    const d = _dockCreate('left');
    _dockMovePanel(panelId, d.id);

  } else if (action === 'new-right') {
    const d = _dockCreate('right');
    _dockMovePanel(panelId, d.id);

  } else if (action === 'float') {
    // Create float dock centred near the drop point
    const w = 288;
    const d = _dockCreate('float',
      Math.max(0, dropX - w / 2),
      Math.max(0, dropY - 30));
    _dockMovePanel(panelId, d.id);

  } else if (action.startsWith('merge:')) {
    _dockMovePanel(panelId, action.slice(6));
  }

  _dockSaveToStorage();
  if (state && state.map) setTimeout(function() { state.map.resize(); }, 80);
}

// ── Panel / dock management ───────────────────────────────────────────────

function _dockCreate(zone, floatX, floatY) {
  const dock = {
    id:        _dockNewId(),
    zone,
    panels:    [],
    active:    null,
    floatX:    floatX != null ? floatX : Math.round(window.innerWidth / 2 - 144),
    floatY:    floatY != null ? floatY : 80,
    w:         288,
    h:         null,   // null = auto (content height); number = fixed px
    minimised: false,
  };
  _dock.docks.push(dock);
  return dock;
}

function _dockMovePanel(panelId, targetDockId) {
  // Park the panel element in document.body (hidden) BEFORE touching the dock
  // registry. If we remove the old dock slot first, the panel is destroyed with
  // it and getElementById can no longer find it.
  const panel = document.getElementById(panelId);
  if (panel) {
    panel.style.display = 'none';
    document.body.appendChild(panel);
  }

  // Remove from current dock
  const from = _dockForPanel(panelId);
  if (from) {
    from.panels = from.panels.filter(function(p) { return p !== panelId; });
    if (from.active === panelId) from.active = from.panels[0] || null;
    if (from.panels.length === 0) _dockDestroy(from.id);
  }

  // Add to target dock
  const to = _dockById(targetDockId);
  if (to && !to.panels.includes(panelId)) {
    to.panels.push(panelId);
    to.active = panelId;
  }

  // _dockRender will move the panel from body into the correct slot
  // and restore its display state
  _dockRender();
}

function _dockDestroy(dockId) {
  const slot = document.getElementById('dock-slot-' + dockId);
  if (slot && slot.parentNode) slot.parentNode.removeChild(slot);
  _dock.docks = _dock.docks.filter(function(d) { return d.id !== dockId; });
}

// ── Rendering ─────────────────────────────────────────────────────────────

function _dockRender() {
  // Ensure zone containers exist in #body
  _dockEnsureZoneContainer('left');
  _dockEnsureZoneContainer('right');

  // Render every dock
  _dock.docks.forEach(_dockRenderDock);

  // Show/hide zone containers
  ['left', 'right'].forEach(function(zone) {
    const c = document.getElementById('dock-zone-' + zone);
    if (!c) return;
    const occupied = _dock.docks.some(function(d) { return d.zone === zone; });
    c.style.display = occupied ? '' : 'none';
  });

  if (state && state.map) setTimeout(function() { state.map.resize(); }, 40);
}

function _dockEnsureZoneContainer(zone) {
  const id = 'dock-zone-' + zone;
  if (document.getElementById(id)) return;

  const container = document.createElement('div');
  container.id = id;
  container.className = 'dock-zone-container';

  const body   = document.getElementById('body');
  const mapRef = document.getElementById('map-col-wrapper') || document.getElementById('map-column');

  if (zone === 'left') {
    body.insertBefore(container, mapRef);
  } else {
    if (mapRef && mapRef.nextSibling) body.insertBefore(container, mapRef.nextSibling);
    else body.appendChild(container);
  }
}

function _dockBuildFloatHeader(slot, dock) {
  // Remove any existing float header
  const old = slot.querySelector('.dock-float-header');
  if (old) slot.removeChild(old);

  const header = document.createElement('div');
  header.className = 'dock-float-header';

  // Drag handle — triggers the full re-dock system (overlay + real-time float move)
  const activePanelId = dock.active || dock.panels[0];
  const dragArea = document.createElement('div');
  dragArea.className = 'dock-float-drag';
  dragArea.title = 'Drag to move or re-dock';
  dragArea.innerHTML =
    '<svg width="16" height="8" viewBox="0 0 20 8" fill="currentColor" opacity="0.5">' +
    '<circle cx="4" cy="2" r="1.3"/><circle cx="10" cy="2" r="1.3"/><circle cx="16" cy="2" r="1.3"/>' +
    '<circle cx="4" cy="6" r="1.3"/><circle cx="10" cy="6" r="1.3"/><circle cx="16" cy="6" r="1.3"/>' +
    '</svg>';
  dragArea.addEventListener('mousedown', function(e) {
    _dockStartDrag(e, activePanelId);
  });

  // Label showing panel name(s)
  const label = document.createElement('span');
  label.className = 'dock-float-label';
  label.textContent = dock.panels.map(_panelLabel).join(' / ');

  // Minimize toggle button
  const minBtn = document.createElement('button');
  minBtn.className = 'dock-float-min-btn';
  minBtn.title = dock.minimised ? 'Restore' : 'Minimise';
  minBtn.textContent = dock.minimised ? '+' : '−';
  minBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    dock.minimised = !dock.minimised;
    _dockRender();
    _dockSaveToStorage();
  });

  header.appendChild(dragArea);
  header.appendChild(label);
  header.appendChild(minBtn);
  slot.insertBefore(header, slot.firstChild);
}

function _dockBuildResizeHandle(slot, dock) {
  const old = slot.querySelector('.dock-float-resize');
  if (old) slot.removeChild(old);

  const handle = document.createElement('div');
  handle.className = 'dock-float-resize';
  handle.title = 'Drag to resize';
  handle.innerHTML =
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">' +
    '<path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '</svg>';

  handle.addEventListener('mousedown', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const startX  = e.clientX;
    const startY  = e.clientY;
    const startW  = slot.offsetWidth;
    const startH  = slot.offsetHeight;

    function onMove(ev) {
      const newW = Math.max(200, startW + (ev.clientX - startX));
      const newH = Math.max(120, startH + (ev.clientY - startY));
      dock.w = newW;
      dock.h = newH;
      slot.style.width  = newW + 'px';
      slot.style.height = newH + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      _dockSaveToStorage();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  slot.appendChild(handle);
}

function _dockRenderDock(dock) {
  // Get or create the slot element
  let slot = document.getElementById('dock-slot-' + dock.id);
  if (!slot) {
    slot = document.createElement('div');
    slot.id = 'dock-slot-' + dock.id;
    slot.className = 'dock-slot';
  }

  // Position the slot inside the correct container
  if (dock.zone === 'left' || dock.zone === 'right') {
    const container = document.getElementById('dock-zone-' + dock.zone);
    if (container && slot.parentNode !== container) container.appendChild(slot);
    // Clear any float positioning
    slot.style.cssText = '';
    // Width follows the widest panel that has been resized
    const firstPanel = document.getElementById(dock.panels[0]);
    if (firstPanel && firstPanel.style.width) slot.style.width = firstPanel.style.width;
    // Remove float header for docked slots
    const fh = slot.querySelector('.dock-float-header');
    if (fh) slot.removeChild(fh);
  } else if (dock.zone === 'float') {
    if (slot.parentNode !== document.body) document.body.appendChild(slot);
    slot.style.position     = 'fixed';
    slot.style.left         = dock.floatX + 'px';
    slot.style.top          = dock.floatY + 'px';
    slot.style.width        = dock.w + 'px';
    slot.style.height       = dock.h ? dock.h + 'px' : '';
    slot.style.zIndex       = '800';
    slot.style.boxShadow    = '0 8px 32px rgba(0,0,0,0.45)';
    slot.style.borderRadius = '8px';
    slot.style.overflow     = 'hidden';
    slot.style.border       = '1px solid var(--border)';
    _dockBuildFloatHeader(slot, dock);
    _dockBuildResizeHandle(slot, dock);
  }

  const isFloat    = dock.zone === 'float';
  const isMinimised = isFloat && !!dock.minimised;

  // Apply/remove minimised class (float only)
  slot.classList.toggle('dock-slot--minimised', isMinimised);

  // ── Tab bar ──────────────────────────────────────────────────
  const existingBar = slot.querySelector('.dock-tab-bar');
  if (existingBar) slot.removeChild(existingBar);

  let tabBar = null;
  if (dock.panels.length > 1) {
    tabBar = document.createElement('div');
    tabBar.className = 'dock-tab-bar';
    dock.panels.forEach(function(pid) {
      const tab = document.createElement('button');
      tab.className = 'dock-tab' + (dock.active === pid ? ' active' : '');
      tab.textContent = _panelLabel(pid);
      tab.addEventListener('click', function() { dock.active = pid; _dockRender(); });
      tabBar.appendChild(tab);
    });
    // Insert tab bar after float header (if present)
    const fh = slot.querySelector('.dock-float-header');
    if (fh) slot.insertBefore(tabBar, fh.nextSibling);
    else slot.insertBefore(tabBar, slot.firstChild);
    // Hide tab bar when minimised
    tabBar.style.display = isMinimised ? 'none' : '';
  }

  // ── Move panels into slot, show/hide per active tab ──────────
  dock.panels.forEach(function(pid) {
    const panel = document.getElementById(pid);
    if (!panel) return;
    // Strip float styles; clear inline width so CSS width:100% takes effect
    panel.style.position     = panel.style.left   = panel.style.top    = '';
    panel.style.zIndex       = panel.style.boxShadow = panel.style.borderRadius = '';
    panel.style.height       = '';
    // Only clear width for docked panels — float panels keep their explicit width
    if (!isFloat) panel.style.width = '';
    if (panel.parentNode !== slot) {
      const bar = slot.querySelector('.dock-tab-bar');
      if (bar) slot.insertBefore(panel, bar.nextSibling);
      else slot.appendChild(panel);
    }
    const isActive = dock.active === pid || dock.panels.length === 1;
    // Hide panel content when minimised; otherwise show/hide per active tab
    panel.style.display = isMinimised ? 'none' : (isActive ? '' : 'none');

    // Show/hide the panel-internal grip: hidden when floating (float header grip used instead)
    const grip = panel.querySelector('.dock-grip');
    if (grip) grip.style.display = isFloat ? 'none' : '';
  });
}

// ── Persistence ───────────────────────────────────────────────────────────

function _dockSaveToStorage() {
  try {
    localStorage.setItem('gaia_dock_v2', JSON.stringify({
      counter: _dock._counter,
      docks: _dock.docks.map(function(d) {
        return { id: d.id, zone: d.zone, panels: d.panels, active: d.active,
                 floatX: d.floatX, floatY: d.floatY, w: d.w, h: d.h || null,
                 minimised: !!d.minimised };
      }),
    }));
  } catch(e) {}
}

function _dockRestoreFromStorage() {
  try {
    const raw = localStorage.getItem('gaia_dock_v2');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved.docks || saved.docks.length === 0) return;

    // Validate: every known panel must appear in exactly one dock
    const known = ['left-panel', 'right-panel'];
    const assigned = saved.docks.flatMap(function(d) { return d.panels; });
    const valid = known.every(function(p) {
      return assigned.filter(function(a) { return a === p; }).length === 1;
    });
    if (!valid) return;

    _dock.docks    = saved.docks.map(function(d) {
      return Object.assign({ minimised: false, h: null }, d);
    });
    _dock._counter = saved.counter || saved.docks.length;
  } catch(e) {}
}
