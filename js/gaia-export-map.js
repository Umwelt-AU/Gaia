// gaia-export-map.js — PNG and PDF map export
// EXPORT MAP AS PNG
// ══════════════════════════════════════════════════
// ══════════════════════════════════════════════════
// EXPORT MAP AS PNG
// ══════════════════════════════════════════════════
function exportMapPNG() {
  // ── Step 0: Ask for title before doing any canvas work ───────────────────
  const now0   = new Date();
  const dd0    = String(now0.getDate()).padStart(2, '0');
  const mm0    = String(now0.getMonth() + 1).padStart(2, '0');
  const yyyy0  = now0.getFullYear();
  const defaultTitle = 'Gaia Export — ' + dd0 + '-' + mm0 + '-' + yyyy0;

  // Build a small modal
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:10600;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--bg2);border-radius:10px;width:380px;max-width:calc(100vw - 32px);
                box-shadow:0 8px 40px rgba(0,0,0,0.3);overflow:hidden;">
      <div style="background:linear-gradient(135deg,#0C2E44,#113c64);border-bottom:2px solid #14b1e7;
                  padding:12px 16px;">
        <div style="font-family:var(--mono);font-weight:700;font-size:11px;color:#e8f4fb;">
          🖼 Export Map as PNG
        </div>
      </div>
      <div style="padding:16px;">
        <label style="font-family:var(--mono);font-size:9px;color:var(--text3);
                      text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:5px;">
          Map Title
        </label>
        <input id="png-title-input" type="text"
          value="${defaultTitle}"
          style="width:100%;box-sizing:border-box;padding:7px 10px;font-family:var(--mono);
                 font-size:11px;border:1px solid var(--border);border-radius:5px;
                 background:var(--bg);color:var(--text);outline:none;"
          onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('png-export-go').click();}
                     if(event.key==='Escape'){this.closest('div[style*=fixed]').remove();}"/>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
          <button class="btn btn-ghost btn-sm" onclick="this.closest('div[style*=fixed]').remove()"
            style="font-size:10px;">Cancel</button>
          <button id="png-export-go" class="btn btn-primary btn-sm"
            style="font-size:10px;"
            onclick="
              var t=document.getElementById('png-title-input').value.trim()||'${defaultTitle}';
              this.closest('div[style*=fixed]').remove();
              _exportMapPNGWithTitle(t);
            ">Export PNG</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  // Select all text so user can immediately type a replacement
  setTimeout(function() {
    const inp = document.getElementById('png-title-input');
    if (inp) { inp.focus(); inp.select(); }
  }, 50);
}

function _exportMapPNGWithTitle(userTitle) {
  toast('Preparing PNG export…', 'info');

  const mapEl = document.getElementById('map');
  if (!mapEl) { toast('Map element not found', 'error'); return; }

  const rect = mapEl.getBoundingClientRect();
  const W = Math.round(rect.width), H = Math.round(rect.height);
  const isDark = document.body.classList.contains('dark-mode');

  // ── Layout constants ───────────────────────────────────────────────────────
  const TITLE_H  = 36;   // header bar height
  const FOOTER_H = 28;   // footer bar height
  const FULL_H   = H + TITLE_H + FOOTER_H;
  const MAP_Y    = TITLE_H;   // where the map area starts (y)

  const out = document.createElement('canvas');
  out.width = W; out.height = FULL_H;
  const ctx = out.getContext('2d', { willReadFrequently: true });

  // ── Date strings (used in title + footer) ────────────────────────────────
  const now  = new Date();
  const dd   = String(now.getDate()).padStart(2, '0');
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();

  // ── Title bar ─────────────────────────────────────────────────────────────
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#0C2E44');
  grad.addColorStop(1, '#113c64');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, TITLE_H);
  ctx.fillStyle = '#14b1e7';
  ctx.fillRect(0, TITLE_H - 2, W, 2);

  const titleText = userTitle;
  ctx.fillStyle = '#e8f4fb';
  ctx.font = 'bold 13px "IBM Plex Mono", monospace';
  const tw = ctx.measureText(titleText).width;
  ctx.fillText(titleText, Math.round(W / 2 - tw / 2), 23);

  // ── Map background ────────────────────────────────────────────────────────
  ctx.fillStyle = isDark ? '#111920' : '#f0f2f4';
  ctx.fillRect(0, MAP_Y, W, H);

  // ── CLIP to map area so nothing bleeds into title/footer ─────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, MAP_Y, W, H);
  ctx.clip();

  // ── MapLibre GL renders on a WebGL canvas — draw it directly ─────────────
  try {
    const glCanvas = state.map.getCanvas();
    ctx.drawImage(glCanvas, 0, MAP_Y, W, H);
  } catch(e) {
    ctx.fillStyle = 'rgba(20,30,45,0.85)';
    ctx.fillRect(0, MAP_Y, W, H);
    ctx.fillStyle = '#7a96aa';
    ctx.font = '12px monospace';
    ctx.fillText('Map capture unavailable (preserveDrawingBuffer not enabled)', 20, MAP_Y + H/2);
  }
  ctx.restore(); // release map-area clip

  // ── Legend overlay, footer, logo ──────────────────────────────────────────
  function drawOverlays() {
    try { drawLegend(); } catch(e) { console.warn('Legend:', e); }
  }

  function drawFooter() {
    const footerY = MAP_Y + H;
    ctx.fillStyle = '#1c2b3a';
    ctx.fillRect(0, footerY, W, FOOTER_H);
    ctx.fillStyle = '#14b1e7';
    ctx.fillRect(0, footerY, W, 1);
    const scale = document.getElementById('scale-display')?.textContent || '';
    const zoom  = state.map ? Math.round(state.map.getZoom()) : '';
    ctx.fillStyle = '#7a96aa'; ctx.font = '10px monospace';
    ctx.fillText('Scale 1:' + scale + '  |  Zoom ' + zoom, 10, footerY + 18);
    const dateStr = dd + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getMonth()] + ' ' + yyyy;
    ctx.fillStyle = '#a0bbc8'; ctx.font = '10px monospace';
    const dw = ctx.measureText(dateStr).width;
    ctx.fillText(dateStr, Math.round(W / 2 - dw / 2), footerY + 18);
    ctx.fillStyle = '#14b1e7'; ctx.font = 'bold 10px monospace';
    const gw = ctx.measureText('Gaia v1.0').width;
    ctx.fillText('Gaia v1.0', W - gw - 10, footerY + 18);
  }

  function finaliseAndSave() {
    drawOverlays();
    drawFooter();
    const logoImg = new Image();
    const guard2  = setTimeout(function() { doDownload(); }, 1500);
    logoImg.onload = function() {
      clearTimeout(guard2);
      const lh = TITLE_H - 10;
      const lw = Math.round(logoImg.naturalWidth * (lh / logoImg.naturalHeight));
      try { ctx.drawImage(logoImg, 10, 5, lw, lh); } catch(e) {}
      doDownload();
    };
    logoImg.onerror = function() { clearTimeout(guard2); doDownload(); };
    logoImg.src = 'data:image/png;base64,' + _UMWELT_LOGO_B64;
  }

  function doDownload() {
    const filename = 'gaia-export-' + dd + '-' + mm + '-' + yyyy + '.png';
    function dl(url, revoke) {
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      if (revoke) setTimeout(function() { URL.revokeObjectURL(url); }, 1500);
      toast('Exported \u2713', 'success');
    }
    try {
      out.toBlob(function(blob) {
        if (blob) dl(URL.createObjectURL(blob), true);
        else      dl(out.toDataURL('image/png'), false);
      }, 'image/png');
    } catch(e) {
      toast('PNG export failed: ' + e.message, 'error');
    }
  }

  finaliseAndSave();
}

// ══════════════════════════════════════════════════
// PDF TEMPLATE EXPORT
// Uses pdf-lib (loaded from CDN) to overlay the map
// PNG onto the embedded Umwelt A4-landscape template.
//
// Template layout (PDF coords, origin = bottom-left):
//   Page:       842 × 595 pt  (A4 landscape)
//   Map area:   x=0..676, y=15..567  (676 × 552 pt)
//   Right panel: x=676..842 — figure title, legend,
//                scale bar, Umwelt logo, disclaimer
// ══════════════════════════════════════════════════
function exportMapPDFTemplate() {
  // ── Step 1: Ask for figure number, title, image source, data source ─────
  const now0 = new Date();
  const yyyy0 = now0.getFullYear();
  const defaultTitle     = 'Figure Title';
  const defaultFigNum    = '1.1';
  const defaultImgSrc    = 'ESRI Basemap (' + yyyy0 + ')';
  const defaultDataSrc   = '';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10700;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:var(--bg2);border-radius:10px;width:420px;max-width:calc(100vw - 32px);
                box-shadow:0 8px 40px rgba(0,0,0,0.4);overflow:hidden;">
      <div style="background:linear-gradient(135deg,#0C2E44,#113c64);border-bottom:2px solid #14b1e7;
                  padding:12px 16px;">
        <div style="font-family:var(--mono);font-weight:700;font-size:11px;color:#e8f4fb;">
          📄 Export Map — Umwelt PDF Template
        </div>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;gap:10px;">
          <div style="flex:0 0 90px;">
            <label style="font-family:var(--mono);font-size:9px;color:var(--text3);
                          text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">
              Figure No.
            </label>
            <input id="pdf-fignum-input" type="text" value="${defaultFigNum}"
              style="width:100%;box-sizing:border-box;padding:7px 10px;font-family:var(--mono);
                     font-size:11px;border:1px solid var(--border);border-radius:5px;
                     background:var(--bg);color:var(--text);outline:none;"/>
          </div>
          <div style="flex:1;">
            <label style="font-family:var(--mono);font-size:9px;color:var(--text3);
                          text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">
              Figure Title
            </label>
            <input id="pdf-title-input" type="text" value="${defaultTitle}"
              style="width:100%;box-sizing:border-box;padding:7px 10px;font-family:var(--mono);
                     font-size:11px;border:1px solid var(--border);border-radius:5px;
                     background:var(--bg);color:var(--text);outline:none;"/>
          </div>
        </div>
        <div>
          <label style="font-family:var(--mono);font-size:9px;color:var(--text3);
                        text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">
            Image Source (shown at bottom of map)
          </label>
          <input id="pdf-imgsrc-input" type="text" value="${defaultImgSrc}"
            style="width:100%;box-sizing:border-box;padding:7px 10px;font-family:var(--mono);
                   font-size:11px;border:1px solid var(--border);border-radius:5px;
                   background:var(--bg);color:var(--text);outline:none;" placeholder="e.g. ESRI Basemap (2025)"/>
        </div>
        <div>
          <label style="font-family:var(--mono);font-size:9px;color:var(--text3);
                        text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:4px;">
            Data Source
          </label>
          <input id="pdf-datasrc-input" type="text" value="${defaultDataSrc}"
            style="width:100%;box-sizing:border-box;padding:7px 10px;font-family:var(--mono);
                   font-size:11px;border:1px solid var(--border);border-radius:5px;
                   background:var(--bg);color:var(--text);outline:none;" placeholder="e.g. NSW DFSI (2025)"/>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:10px;">
          <label style="font-family:var(--mono);font-size:9px;color:var(--text3);
                        text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">
            Layout Elements
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">
            <label style="font-family:var(--mono);font-size:9px;color:var(--text2);display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input type="checkbox" id="pdf-opt-legend" checked> Legend
            </label>
            <label style="font-family:var(--mono);font-size:9px;color:var(--text2);display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input type="checkbox" id="pdf-opt-northarrow" checked> North arrow
            </label>
            <label style="font-family:var(--mono);font-size:9px;color:var(--text2);display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input type="checkbox" id="pdf-opt-scalebar" checked> Scale bar
            </label>
            <label style="font-family:var(--mono);font-size:9px;color:var(--text2);display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input type="checkbox" id="pdf-opt-inset" checked> Inset map
            </label>
            <label style="font-family:var(--mono);font-size:9px;color:var(--text2);display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input type="checkbox" id="pdf-opt-grid"> Graticule grid
            </label>
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px;">
          <button class="btn btn-ghost btn-sm" onclick="this.closest('div[style*=fixed]').remove()"
            style="font-size:10px;">Cancel</button>
          <button id="pdf-export-go" class="btn btn-primary btn-sm"
            style="font-size:10px;"
            onclick="
              var figNum   = document.getElementById('pdf-fignum-input').value.trim() || '${defaultFigNum}';
              var figTitle = document.getElementById('pdf-title-input').value.trim() || '${defaultTitle}';
              var imgSrc   = document.getElementById('pdf-imgsrc-input').value.trim();
              var dataSrc  = document.getElementById('pdf-datasrc-input').value.trim();
              var opts = {
                legend:     document.getElementById('pdf-opt-legend').checked,
                northArrow: document.getElementById('pdf-opt-northarrow').checked,
                scaleBar:   document.getElementById('pdf-opt-scalebar').checked,
                insetMap:   document.getElementById('pdf-opt-inset').checked,
                grid:       document.getElementById('pdf-opt-grid').checked,
              };
              this.closest('div[style*=fixed]').remove();
              _exportMapPDFWithTemplate(figNum, figTitle, imgSrc, dataSrc, opts);
            ">Export PDF</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(function() {
    const inp = document.getElementById('pdf-title-input');
    if (inp) { inp.focus(); inp.select(); }
  }, 50);
}

// ── Capture a live MapLibre inset map as PNG bytes ──────────────────────────
// Returns a Promise<Uint8Array|null>. Creates a hidden off-screen MapLibre
// instance with Carto Positron, fits to Australia, draws an orange bbox for
// the main map location, captures the WebGL canvas, then tears everything down.
function _captureInsetMap() {
  return new Promise(function(resolve) {
    try {
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:357px;height:200px;visibility:hidden;pointer-events:none;z-index:-1;';
      document.body.appendChild(container);

      let mainBounds = null;
      try { if (state && state.map) mainBounds = state.map.getBounds(); } catch(e) {}

      const insetMap = new maplibregl.Map({
        container: container,
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        preserveDrawingBuffer: true,
        interactive: false,
        attributionControl: false,
        bounds: [[112, -45], [155, -9]],
        fitBoundsOptions: { padding: 8 }
      });

      let captured = false;

      function cleanup() {
        try { insetMap.remove(); } catch(e) {}
        try { if (container.parentNode) document.body.removeChild(container); } catch(e) {}
      }

      function capture() {
        if (captured) return;
        captured = true;
        try {
          insetMap.getCanvas().toBlob(function(blob) {
            cleanup();
            if (!blob) { resolve(null); return; }
            if (blob.arrayBuffer) {
              blob.arrayBuffer()
                .then(function(ab) { resolve(new Uint8Array(ab)); })
                .catch(function() { resolve(null); });
            } else {
              const fr = new FileReader();
              fr.onload  = function() { resolve(new Uint8Array(fr.result)); };
              fr.onerror = function() { resolve(null); };
              fr.readAsArrayBuffer(blob);
            }
          }, 'image/png');
        } catch(e) { cleanup(); resolve(null); }
      }

      // After basemap tiles load, add the bbox rectangle then capture
      insetMap.once('idle', function() {
        if (captured) return;
        if (mainBounds) {
          try {
            const w = mainBounds.getWest(), e = mainBounds.getEast();
            const s = mainBounds.getSouth(), n = mainBounds.getNorth();
            insetMap.addSource('_inset_bbox', {
              type: 'geojson',
              data: {
                type: 'Feature',
                geometry: { type: 'Polygon',
                  coordinates: [[[w,s],[e,s],[e,n],[w,n],[w,s]]] }
              }
            });
            insetMap.addLayer({ id: '_inset_bbox_fill', type: 'fill', source: '_inset_bbox',
              paint: { 'fill-color': '#ff6600', 'fill-opacity': 0.22 } });
            insetMap.addLayer({ id: '_inset_bbox_line', type: 'line', source: '_inset_bbox',
              paint: { 'line-color': '#cc2200', 'line-width': 2, 'line-opacity': 0.9 } });
            // Wait for bbox to render
            insetMap.once('idle', function() {
              requestAnimationFrame(function() { requestAnimationFrame(capture); });
            });
            insetMap.triggerRepaint();
            // Fallback if second idle never fires
            setTimeout(function() { if (!captured) capture(); }, 3000);
          } catch(e) {
            // bbox failed — capture basemap as-is
            requestAnimationFrame(function() { requestAnimationFrame(capture); });
          }
        } else {
          requestAnimationFrame(function() { requestAnimationFrame(capture); });
        }
      });

      // Overall 8-second timeout
      setTimeout(function() { if (!captured) capture(); }, 8000);

    } catch(e) { resolve(null); }
  });
}

async function _exportMapPDFWithTemplate(figNum, figTitle, imgSrc, dataSrc, opts) {
  opts = Object.assign({ legend: true, northArrow: true, scaleBar: true, insetMap: true, grid: false }, opts || {});
  if (typeof PDFLib === 'undefined') {
    toast('pdf-lib not loaded — check your internet connection', 'error');
    return;
  }

  toast('Preparing PDF export…', 'info');

  // Start inset capture early (runs in parallel while we build the main canvas)
  const insetPromise = opts.insetMap ? _captureInsetMap() : Promise.resolve(null);

  const mapEl = document.getElementById('map');
  if (!mapEl) { toast('Map element not found', 'error'); return; }

  const rect = mapEl.getBoundingClientRect();
  const W = Math.round(rect.width);
  const H = Math.round(rect.height);

  // ── Match the PDF map frame aspect ratio by cropping (never grey, never stretched) ──
  // PDF map frame: 661.83 × 566.94 pt → aspect ≈ 1.1675 (wider than tall)
  // We crop the browser capture to this aspect from the centre so pdf-lib can
  // draw it at exactly MAP_W × MAP_H with no distortion and no grey bars.
  const PDF_MAP_W = 676 - 14.17;
  const PDF_MAP_H = 595.28 - 14.17 * 2;
  const pdfAspect = PDF_MAP_W / PDF_MAP_H;   // ~1.1675

  // Determine crop: keep full width, crop height (or vice-versa)
  let CW, CH, cropX, cropY;
  if (W / H > pdfAspect) {
    // Browser is wider than PDF aspect — crop width
    CH = H;
    CW = Math.round(H * pdfAspect);
    cropX = Math.round((W - CW) / 2);
    cropY = 0;
  } else {
    // Browser is taller than PDF aspect — crop height from centre
    CW = W;
    CH = Math.round(W / pdfAspect);
    cropX = 0;
    cropY = Math.round((H - CH) / 2);
  }
  // mapOffset: where the live map sits relative to our crop origin
  const mapOffsetX = -cropX;
  const mapOffsetY = -cropY;

  // ── Build the offscreen canvas at the cropped (PDF-aspect) size ─────────────
  const offscreen = document.createElement('canvas');
  offscreen.width  = CW;
  offscreen.height = CH;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });
  // Draw MapLibre GL canvas into offscreen at the cropped position
  try {
    const glCanvas = state.map.getCanvas();
    ctx.drawImage(glCanvas, cropX, cropY, CW, CH, 0, 0, CW, CH);
  } catch(e) {
    ctx.fillStyle = isDark ? '#111920' : '#f0f2f4';
    ctx.fillRect(0, 0, CW, CH);
  }

  // ── Compute real-world scale ────────────────────────────────────────────────
  function getMapScaleInfo() {
    if (!state.map) return { scaleStr: 'Unknown', kmPerPt: 1 };
    const bounds = state.map.getBounds();
    const center = state.map.getCenter();
    // Earth radius in km
    const R = 6371;
    // Width of map in km using Haversine
    const lon1 = bounds.getWest() * Math.PI / 180;
    const lon2 = bounds.getEast() * Math.PI / 180;
    const lat  = center.lat    * Math.PI / 180;
    const dLon = lon2 - lon1;
    const a = Math.cos(lat) * Math.cos(lat) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const mapWidthKm = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    // Map width in pt on the PDF (676 - 14.17pt margin)
    const MAP_W_PT = 676 - 14.17;
    const kmPerPt = mapWidthKm / MAP_W_PT;
    // Representative scale: 1 pt = kmPerPt km; 1 cm = kmPerPt * 28.35 km
    // Scale denominator: screen pt / real pt. 1 pt = 1/72 inch = 0.0353 cm
    const ptToCm = 2.54 / 72;
    const scaleDenom = (kmPerPt * 1e5) / ptToCm; // 1 cm on map = scaleDenom cm in reality
    // Nice round scale
    const niceScales = [500,1000,2000,5000,10000,20000,25000,50000,100000,200000,250000,500000,1000000,2000000,5000000,10000000];
    let bestScale = niceScales[0];
    niceScales.forEach(function(s) { if (Math.abs(s - scaleDenom) < Math.abs(bestScale - scaleDenom)) bestScale = s; });
    const scaleStr = '1:' + bestScale.toLocaleString();
    // Scale bar length: pick a nice km value that fits comfortably (target ~30% of MAP_W_PT)
    const targetPt = MAP_W_PT * 0.33;
    const targetKm = targetPt * kmPerPt;
    const niceKm = [0.1,0.2,0.5,1,2,5,10,20,50,100,200,500,1000,2000,5000];
    let barKm = niceKm[0];
    niceKm.forEach(function(k){ if(Math.abs(k-targetKm)<Math.abs(barKm-targetKm)) barKm=k; });
    const barPt = barKm / kmPerPt;
    return { scaleStr, barKm, barPt, kmPerPt };
  }

  // ── Build legend data from loaded layers ─────────────────────────────────────
  function getLegendRows() {
    if (!state || !state.layers) return [];
    const rows = [];
    (state.layers || []).forEach(function(layer) {
      if (!layer || layer.isTile || !layer.visible) return;
      if (layer.classified && layer.classifyClasses && layer.classifyClasses.length) {
        rows.push({ label: layer.name, isHeader: true });
        layer.classifyClasses.forEach(function(c) {
          rows.push({ label: c.label, color: c.color,
            isLine:  (layer.geomType||'').includes('Line'),
            isPoint: (layer.geomType||'').includes('Point') });
        });
      } else {
        const color   = layer.fillColor    || layer.color || '#3498db';
        const outline = layer.outlineColor || layer.color || '#3498db';
        rows.push({ label: layer.name,
          color: layer.noFill ? null : color,
          outline, noFill: layer.noFill,
          isLine:  (layer.geomType||'').includes('Line'),
          isPoint: (layer.geomType||'').includes('Point'),
          shape: layer.pointShape || 'circle' });
      }
    });
    return rows;
  }

  // ── Helper: hex color → pdf-lib rgb ─────────────────────────────────────────
  function hexToRgb(hex) {
    const { rgb } = PDFLib;
    if (!hex || hex === 'transparent') return rgb(0.5, 0.5, 0.5);
    const h = hex.replace('#','');
    const r = parseInt(h.substring(0,2),16)/255;
    const g = parseInt(h.substring(2,4),16)/255;
    const b = parseInt(h.substring(4,6),16)/255;
    return rgb(r, g, b);
  }

  // ── Build the PDF from scratch ───────────────────────────────────────────────
  // mapPngBytes: Uint8Array of the main map PNG
  // insetPngBytes: Uint8Array of the inset map PNG, or null
  function buildPDF(mapPngBytes, insetPngBytes) {
    const { PDFDocument, rgb, StandardFonts } = PDFLib;

    // ── Page dimensions: A4 landscape ─────────────────────────────────────────
    const PAGE_W = 842;
    const PAGE_H = 595;

    // ── Template-matched coordinates (derived from SVG analysis) ──────────────
    // Map frame exact coordinates from SVG (matrix net scale = 1pt)
    const MAP_X  = 30.2;   // left edge
    const MAP_Y  = 28.2;   // PDF bottom edge (lower y = near bottom of page)
    const MAP_W  = 645.8;  // width to right edge at 676pt
    const MAP_H  = 538.7;  // height

    // Right panel
    const PANEL_X = 676;
    const PANEL_W = PAGE_W - PANEL_X;  // 166pt

    // Colour palette matching template (#4E4E4E dark text, #737373 grey)
    const TEXT_DARK  = rgb(0.306, 0.306, 0.306);  // #4E4E4E
    const TEXT_GREY  = rgb(0.451, 0.451, 0.451);  // #737373
    const TEXT_MED   = rgb(0.4,   0.4,   0.4);
    const WHITE      = rgb(1, 1, 1);
    const BORDER     = rgb(0.71,  0.71,  0.71);   // #B5B5B5 approx
    const BLACK_TEXT = rgb(0, 0, 0);

    // ── Fixed template positions (pt from PDF bottom) ─────────────────────────
    // FIGURE X.X:   x=686, y=551 (near top of panel)
    const FIG_NUM_X   = PANEL_X + 10;
    const FIG_NUM_Y   = 551;
    // Figure Title: y=533
    const FIG_TITLE_X = PANEL_X + 10;
    const FIG_TITLE_Y = 533;
    // Legend label: y=493
    const LEG_LABEL_X = PANEL_X + 10;
    const LEG_LABEL_Y = 493;
    // Inset/Legend box: x=686–821, y_bottom=428, y_top=344
    const INSET_X     = PANEL_X + 10;
    const INSET_W     = PANEL_W - 20;
    const INSET_Y_BOT = 168;   // bottom of inset box
    const INSET_Y_TOP = 252;   // top of inset box (taller = higher number in PDF)
    // Scale bar area anchor: GDA2020 label at y≈114
    const SCALE_AREA_Y = 155;  // base of scale block
    // Logo: x≈701, y≈114 from bottom
    const LOGO_Y     = 60;
    const LOGO_H     = 30;
    // North arrow: x≈657, y≈31 from bottom — INSIDE map area, bottom-left area
    const NA_X       = 657;    // centre x
    const NA_Y       = 31;     // centre y from PDF bottom
    // Disclaimer at very bottom
    const DISC_Y_BOT  = 4;

    PDFDocument.create().then(function(pdfDoc) {
      const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

      if (!mapPngBytes || mapPngBytes.length < 8) {
        throw new Error('Map PNG bytes are empty');
      }

      const logoSrc = (typeof _UMWELT_LOGO_2024_B64 !== 'undefined')
        ? _UMWELT_LOGO_2024_B64 : _UMWELT_LOGO_B64;
      const logoBytes = Uint8Array.from(atob(logoSrc), function(c){return c.charCodeAt(0);});

      const embedPromises = [
        pdfDoc.embedFont(StandardFonts.HelveticaBold),
        pdfDoc.embedFont(StandardFonts.Helvetica),
        pdfDoc.embedPng(mapPngBytes),
        pdfDoc.embedPng(logoBytes),
      ];
      if (insetPngBytes && insetPngBytes.length > 8) {
        embedPromises.push(pdfDoc.embedPng(insetPngBytes));
      }
      return Promise.all(embedPromises).then(function(results) {
        const boldFont   = results[0];
        const regFont    = results[1];
        const mapImage   = results[2];
        const logoImage  = results[3];
        const insetImage = results[4] || null;

        // Word-wrap helper
        function wrapText(text, font, size, maxW) {
          const words = text.split(' ');
          const lines = []; let line = '';
          words.forEach(function(word) {
            const test = line ? line + ' ' + word : word;
            try {
              if (font.widthOfTextAtSize(test, size) <= maxW) { line = test; }
              else { if (line) lines.push(line); line = word; }
            } catch(e) { line = test; }
          });
          if (line) lines.push(line);
          return lines;
        }

        // ── 1. White page background ─────────────────────────────────────────
        page.drawRectangle({ x:0, y:0, width:PAGE_W, height:PAGE_H, color:WHITE });

        // ── 2. Map image (fills the map frame) ──────────────────────────────
        page.drawImage(mapImage, {x:MAP_X, y:MAP_Y, width:MAP_W, height:MAP_H});

        // ── 2b. Graticule grid (optional) ───────────────────────────────────
        if (opts.grid && state.map) {
          try {
            const bounds = state.map.getBounds();
            const gridColor = rgb(0.5, 0.5, 0.8);
            const gridAlpha = 0.25;
            // Pick a nice degree interval
            const dLng = bounds.getEast() - bounds.getWest();
            const dLat = bounds.getNorth() - bounds.getSouth();
            const niceIntervals = [0.01,0.05,0.1,0.25,0.5,1,2,5,10,20];
            let intLng = niceIntervals[0], intLat = niceIntervals[0];
            niceIntervals.forEach(function(v){ if(dLng/v > 3 && dLng/v < 12) intLng=v; });
            niceIntervals.forEach(function(v){ if(dLat/v > 3 && dLat/v < 12) intLat=v; });
            function mapLngToX(lng){ return MAP_X + (lng-bounds.getWest())/dLng*MAP_W; }
            function mapLatToY(lat){ return MAP_Y + (lat-bounds.getSouth())/(bounds.getNorth()-bounds.getSouth())*MAP_H; }
            // Vertical lines (longitude)
            const startLng = Math.ceil(bounds.getWest()/intLng)*intLng;
            for (let lng=startLng; lng<bounds.getEast(); lng+=intLng) {
              const px = mapLngToX(lng);
              page.drawLine({start:{x:px,y:MAP_Y},end:{x:px,y:MAP_Y+MAP_H},thickness:0.3,color:gridColor,opacity:gridAlpha});
              page.drawText(lng.toFixed(intLng<1?2:0)+'°', {x:px-8,y:MAP_Y-6,size:4,font:regFont,color:gridColor});
            }
            // Horizontal lines (latitude)
            const startLat = Math.ceil(bounds.getSouth()/intLat)*intLat;
            for (let lat=startLat; lat<bounds.getNorth(); lat+=intLat) {
              const py = mapLatToY(lat);
              page.drawLine({start:{x:MAP_X,y:py},end:{x:MAP_X+MAP_W,y:py},thickness:0.3,color:gridColor,opacity:gridAlpha});
              page.drawText(lat.toFixed(intLat<1?2:0)+'°', {x:MAP_X-16,y:py-2,size:4,font:regFont,color:gridColor});
            }
          } catch(ge) { console.warn('Grid draw failed:', ge); }
        }

        // ── 3. Map frame border — all 4 sides of map bounding box ──────────
        const brdC = rgb(0.306, 0.306, 0.306);
        page.drawLine({start:{x:MAP_X,       y:MAP_Y},       end:{x:MAP_X+MAP_W, y:MAP_Y},       thickness:0.5, color:brdC}); // bottom
        page.drawLine({start:{x:MAP_X,       y:MAP_Y+MAP_H}, end:{x:MAP_X+MAP_W, y:MAP_Y+MAP_H}, thickness:0.5, color:brdC}); // top
        page.drawLine({start:{x:MAP_X,       y:MAP_Y},       end:{x:MAP_X,       y:MAP_Y+MAP_H}, thickness:0.5, color:brdC}); // left
        page.drawLine({start:{x:MAP_X+MAP_W, y:MAP_Y},       end:{x:MAP_X+MAP_W, y:MAP_Y+MAP_H}, thickness:0.5, color:brdC}); // right

        // ── 4. Right panel (white background) ───────────────────────────────
        page.drawRectangle({x:PANEL_X, y:0, width:PANEL_W, height:PAGE_H, color:WHITE});

        // ── 5. FIGURE X.X — grey bold large (matches template) ──────────────
        page.drawText('FIGURE ' + figNum, {
          x:FIG_NUM_X, y:FIG_NUM_Y, size:13, font:boldFont, color:TEXT_GREY
        });

        // ── 6. Figure Title — black bold ─────────────────────────────────────
        const titleLines = wrapText(figTitle, boldFont, 11, PANEL_W - 20);
        titleLines.forEach(function(tl, i) {
          page.drawText(tl, {x:FIG_TITLE_X, y:FIG_TITLE_Y - i*14, size:11, font:boldFont, color:BLACK_TEXT});
        });

        // ── 7. Legend label — bold black ─────────────────────────────────────
        if (opts.legend) {
        page.drawText('Legend', {x:LEG_LABEL_X, y:LEG_LABEL_Y, size:8, font:boldFont, color:BLACK_TEXT});
        } // end legend label

        // ── 8. Inset box — live MapLibre location map ────────────────────────
        // Dimensions hoisted so scale bar can reference even if inset is hidden
        const INSET_BOX_X = PANEL_X + 8;
        const INSET_BOX_W = PANEL_W - 16;
        const INSET_BOX_Y_BOT = 168;
        const INSET_BOX_Y_TOP = 252;

        if (opts.insetMap) {
          const INSET_BOX_H = INSET_BOX_Y_TOP - INSET_BOX_Y_BOT;
          if (insetImage) {
            // Draw the live screenshot
            page.drawImage(insetImage, {
              x: INSET_BOX_X, y: INSET_BOX_Y_BOT,
              width: INSET_BOX_W, height: INSET_BOX_H
            });
          } else {
            // Fallback placeholder if capture failed
            page.drawRectangle({
              x: INSET_BOX_X, y: INSET_BOX_Y_BOT,
              width: INSET_BOX_W, height: INSET_BOX_H,
              color: rgb(0.88, 0.91, 0.94)
            });
          }
          // Border drawn on top of image
          page.drawLine({start:{x:INSET_BOX_X,              y:INSET_BOX_Y_BOT},        end:{x:INSET_BOX_X+INSET_BOX_W, y:INSET_BOX_Y_BOT},        thickness:0.5, color:brdC});
          page.drawLine({start:{x:INSET_BOX_X,              y:INSET_BOX_Y_TOP},        end:{x:INSET_BOX_X+INSET_BOX_W, y:INSET_BOX_Y_TOP},        thickness:0.5, color:brdC});
          page.drawLine({start:{x:INSET_BOX_X,              y:INSET_BOX_Y_BOT},        end:{x:INSET_BOX_X,              y:INSET_BOX_Y_TOP},        thickness:0.5, color:brdC});
          page.drawLine({start:{x:INSET_BOX_X+INSET_BOX_W, y:INSET_BOX_Y_BOT},        end:{x:INSET_BOX_X+INSET_BOX_W, y:INSET_BOX_Y_TOP},        thickness:0.5, color:brdC});
        } // end insetMap

        // ── 9. Legend entries — above inset box ──────────────────────────────
        if (opts.legend) {
        const legendRows = getLegendRows();
        const ROW_H=11, SW=8, GAP=4;
        const LEG_MIN_Y = INSET_BOX_Y_TOP + 4;  // must be above inset box
        const LEG_START_Y = LEG_LABEL_Y - 14;

        legendRows.forEach(function(row, i) {
          const rowY = LEG_START_Y - i*ROW_H;
          if (rowY < LEG_MIN_Y) return;
          if (row.isHeader) {
            page.drawText(String(row.label).substring(0,24),
              {x:PANEL_X+10, y:rowY, size:6.5, font:boldFont, color:TEXT_DARK});
            return;
          }
          const sx=PANEL_X+10, cy=rowY+4;
          if (row.isLine) {
            page.drawLine({start:{x:sx,y:cy},end:{x:sx+SW,y:cy},thickness:2,color:hexToRgb(row.color)});
          } else if (row.isPoint) {
            const fillC = row.noFill ? WHITE : hexToRgb(row.color);
            page.drawEllipse({x:sx+SW/2,y:cy,xScale:SW/2-0.5,yScale:SW/2-0.5,
              color:fillC, borderColor:hexToRgb(row.outline||row.color), borderWidth:0.7});
          } else {
            const fillC = row.noFill ? WHITE : hexToRgb(row.color);
            page.drawRectangle({x:sx,y:cy-3,width:SW,height:SW-1,
              color:fillC, borderColor:hexToRgb(row.outline||row.color), borderWidth:0.7});
          }
          page.drawText(String(row.label).substring(0,23),
            {x:sx+SW+GAP, y:rowY, size:6.5, font:regFont, color:TEXT_DARK});
        });
        } // end legend entries

        // ── 10. Scale bar — below inset box ──────────────────────────────────
        if (opts.scaleBar) {
        const scaleInfo = getMapScaleInfo();
        const BAR_X  = PANEL_X + 10;
        const barPt  = Math.min(scaleInfo.barPt || 80, PANEL_W - 45);
        const barKm  = scaleInfo.barKm || 100;

        // GDA2020 and scale labels first (above bar, below inset)
        const GDA_Y    = INSET_BOX_Y_BOT - 8;
        const SCALET_Y = GDA_Y - 8;
        const KM_Y     = SCALET_Y - 8;
        const LABY     = KM_Y - 8;
        const BAR_Y    = LABY - 9;

        page.drawText('GDA2020',                      {x:BAR_X, y:GDA_Y,    size:5.5, font:regFont, color:TEXT_MED});
        page.drawText(scaleInfo.scaleStr + ' at A4',  {x:BAR_X, y:SCALET_Y, size:5.5, font:regFont, color:TEXT_MED});
        page.drawText('Kilometres',                   {x:BAR_X, y:KM_Y,     size:5.5, font:regFont, color:TEXT_MED});

        // Tick labels
        const labelKm = barKm >= 1 ? barKm + ' km' : (barKm*1000).toFixed(0) + ' m';
        page.drawText('0',      {x:BAR_X-1,       y:LABY, size:5.5, font:regFont, color:TEXT_DARK});
        page.drawText(labelKm, {x:BAR_X+barPt-4, y:LABY, size:5.5, font:regFont, color:TEXT_DARK});

        // Two-tone scale bar
        const SEG = barPt / 2;
        page.drawRectangle({x:BAR_X,     y:BAR_Y, width:SEG, height:4, color:rgb(0.2,0.2,0.2)});
        page.drawRectangle({x:BAR_X+SEG, y:BAR_Y, width:SEG, height:4, color:WHITE});
        page.drawLine({start:{x:BAR_X,y:BAR_Y},       end:{x:BAR_X+barPt,y:BAR_Y},       thickness:0.4,color:rgb(0.2,0.2,0.2)});
        page.drawLine({start:{x:BAR_X,y:BAR_Y+4},     end:{x:BAR_X+barPt,y:BAR_Y+4},     thickness:0.4,color:rgb(0.2,0.2,0.2)});
        page.drawLine({start:{x:BAR_X,y:BAR_Y},       end:{x:BAR_X,y:BAR_Y+4},            thickness:0.4,color:rgb(0.2,0.2,0.2)});
        page.drawLine({start:{x:BAR_X+SEG,y:BAR_Y},   end:{x:BAR_X+SEG,y:BAR_Y+4},        thickness:0.4,color:rgb(0.2,0.2,0.2)});
        page.drawLine({start:{x:BAR_X+barPt,y:BAR_Y}, end:{x:BAR_X+barPt,y:BAR_Y+4},     thickness:0.4,color:rgb(0.2,0.2,0.2)});
        } // end scaleBar

        // ── 11. North Arrow — inside map area, bottom-right, pointing UP ──────
        if (opts.northArrow) {
        // Arrow body pointing up: tip at top, base at bottom
        const NA_CX = MAP_X + MAP_W - 20;  // bottom-right of map
        const NA_CY = MAP_Y + 18;
        const NA_R  = 9;
        // drawSvgPath flips y internally (pdfY = opts.y − svgY), so negate y values
        // so they land in the right PDF position.
        // Tip:   svgY = -NA_R  → pdfY = NA_CY + NA_R  (above centre) ✓
        // Wings: svgY = 0      → pdfY = NA_CY          (centre)       ✓
        // Notch: svgY = +NA_R*0.3 → pdfY = NA_CY - NA_R*0.3 (below wings) ✓
        page.drawSvgPath(
          'M 0 '+(-NA_R)+' L '+(NA_R*0.45)+' 0 L 0 '+(NA_R*0.3)+' L '+(-(NA_R*0.45))+' 0 Z',
          {x:NA_CX, y:NA_CY, color:BLACK_TEXT, borderWidth:0});
        // 'N' label above the arrow tip
        page.drawText('N', {x:NA_CX-3, y:NA_CY+NA_R+2, size:7, font:boldFont, color:BLACK_TEXT});
        } // end northArrow

        // ── 11. Image / Data Source strip — bottom of map, matches template ──
        var srcParts = [];
        if (imgSrc)  srcParts.push('Image Source: ' + imgSrc);
        if (dataSrc) srcParts.push('Data Source: ' + dataSrc);
        if (srcParts.length > 0) {
          var srcText = 'Image Source: ' + (imgSrc||'') +
            (dataSrc ? ' | Data Source: ' + dataSrc : '');
          // White semi-transparent background (like template)
          var srcW = 0;
          try { srcW = regFont.widthOfTextAtSize(srcText, 5.5); } catch(e) { srcW = 240; }
          page.drawRectangle({
            x:MAP_X, y:MAP_Y, width:srcW+12, height:10,
            color:rgb(1,1,1), opacity:0.75
          });
          page.drawText(srcText, {
            x:MAP_X+4, y:MAP_Y+2,
            size:5.5, font:regFont, color:TEXT_DARK
          });
        }

        // ── 12. Umwelt logo (no divider line above it) ───────────────────────
        const logoAspect = logoImage.width / logoImage.height;
        const logoW = Math.min(LOGO_H * logoAspect, PANEL_W - 16);
        page.drawImage(logoImage, {x:PANEL_X+8, y:LOGO_Y, width:logoW, height:LOGO_H});

        // ── 14. Disclaimer ───────────────────────────────────────────────────
        const DISC_FONT_SIZE = 4.2;
        const DISC_LINE_H    = 5.8;
        const DISC_LINES_MAX = 9;
        const disclaimer =
          'This document and the information are subject to Terms and Conditions and ' +
          'Umwelt (Australia) Pty Ltd ("Umwelt") Copyright in the drawings, information ' +
          'and data recorded ("the information") is the property of Umwelt. This document ' +
          'and the information are solely for the use of the authorized recipient and this ' +
          'document may not be used, copied or reproduced in whole or part for any purpose ' +
          'other than that which it was supplied by Umwelt. Umwelt makes no representation, ' +
          'undertakes no duty and accepts no responsibility to any third party who may use ' +
          'or rely upon this document or the information. APPROVED FOR AND ON BEHALF OF Umwelt';
        const discLines = wrapText(disclaimer, regFont, DISC_FONT_SIZE, PANEL_W-10);
        discLines.slice(0, DISC_LINES_MAX).forEach(function(dl, i) {
          page.drawText(dl, {
            x:PANEL_X+5,
            y:DISC_Y_BOT + (DISC_LINES_MAX-1-i)*DISC_LINE_H,
            size:DISC_FONT_SIZE, font:regFont, color:TEXT_MED
          });
        });

        // ── 15. Download ─────────────────────────────────────────────────────
        return pdfDoc.save().then(function(pdfBytes){
          const blob = new Blob([pdfBytes],{type:'application/pdf'});
          const url  = URL.createObjectURL(blob);
          const now2 = new Date();
          const fn   = 'figure-'+figNum.replace(/\./g,'-')+'-'+
            String(now2.getDate()).padStart(2,'0')+'-'+
            String(now2.getMonth()+1).padStart(2,'0')+'-'+
            now2.getFullYear()+'.pdf';
          const a=document.createElement('a'); a.href=url; a.download=fn;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function(){URL.revokeObjectURL(url);},2000);
          toast('PDF exported ✓','success');
        });
      });
    }).catch(function(err){
      console.error('PDF build error:', err);
      toast('PDF export failed: '+err.message,'error');
    });
  }

  // ── Capture main map canvas + await inset, then build PDF ───────────────────
  try {
    const mapPngBytes = await new Promise(function(resolve, reject) {
      offscreen.toBlob(function(blob) {
        if (!blob) { reject(new Error('Canvas capture returned null blob')); return; }
        if (blob.arrayBuffer) {
          blob.arrayBuffer().then(function(ab) { resolve(new Uint8Array(ab)); }).catch(reject);
        } else {
          const fr = new FileReader();
          fr.onload  = function() { resolve(new Uint8Array(fr.result)); };
          fr.onerror = function() { reject(new Error('Canvas read failed')); };
          fr.readAsArrayBuffer(blob);
        }
      }, 'image/png');
    });
    const insetPngBytes = await insetPromise;
    buildPDF(mapPngBytes, insetPngBytes);
  } catch(err) {
    toast('Canvas capture failed: ' + err.message, 'error');
  }
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

//let _classifyState = { breaks: [], colors: [], fieldType: 'string' };
