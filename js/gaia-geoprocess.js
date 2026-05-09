// gaia-geoprocess.js — Geoprocessing operations, PRJ parser, reproject
// ── GEOPROCESSING ──────────────────────────────────────────────────────────
// Pure-JS spatial operations. All work in WGS84 (degrees).
// Distances/buffers use a metres→degrees approximation via deg/m at the
// centroid latitude, which is adequate for planning/GIS tasks at typical scales.
// Helpers

let drawMode = null;
let currentAOI = null;

//

function _geoFeatures(layerIdx) {
  const l = state.layers[layerIdx];
  return l ? (l.geojson.features || []) : [];
}
function _activeFeatures() {
  const l = state.layers[state.activeLayerIndex];
  if (!l) return [];
  const feats = l.geojson.features || [];
  if (state.selectedFeatureIndices && state.selectedFeatureIndices.size > 0) {
    return [...state.selectedFeatureIndices].map(i => feats[i]).filter(Boolean);
  }
  return feats;
}
function _metersPerDegLat() { return 111320; }
function _metersPerDegLng(lat) { return 111320 * Math.cos(lat * Math.PI / 180); }

// ── Centroid of a geometry ──
function _geomCentroid(geom) {
  if (!geom) return null;
  let sumX = 0, sumY = 0, count = 0;
  function addCoords(coords) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') { sumX += coords[0]; sumY += coords[1]; count++; }
    else coords.forEach(addCoords);
  }
  addCoords(geom.coordinates);
  return count ? [sumX / count, sumY / count] : null;
}

// ── Rough bounding box of a geometry ──
function _geomBBox(geom) {
  if (!geom) return null;
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  function scan(coords) {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      if (coords[0]<minX) minX=coords[0]; if (coords[0]>maxX) maxX=coords[0];
      if (coords[1]<minY) minY=coords[1]; if (coords[1]>maxY) maxY=coords[1];
    } else coords.forEach(scan);
  }
  scan(geom.coordinates);
  return [minX, minY, maxX, maxY];
}

// ── Circular buffer polygon around a point (lng,lat) with radius in metres ──
function _circlePolygon(lng, lat, radiusM, steps) {
  steps = steps || 64;
  const dLat = radiusM / _metersPerDegLat();
  const dLng = radiusM / _metersPerDegLng(lat);
  const ring = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

// Steps per quarter-circle arc in buffer output
const _BUF_ARC_STEPS = 8;

// ── Buffer line → polygon ring ──
function _bufferLineRing(coords, radiusM) {
  if (!coords || coords.length < 2) return null;

  const avgLat = coords.reduce((s, p) => s+p[1], 0) / coords.length;
  const mPerLng = _metersPerDegLng(avgLat);
  const mPerLat = _metersPerDegLat();

  const toM = p => [p[0]*mPerLng, p[1]*mPerLat];
  const toD = p => [p[0]/mPerLng, p[1]/mPerLat];

  const ptsM = coords.map(toM);
  const n = ptsM.length;

  const ring = [];

  for (let i = 0; i < n-1; i++) {
    const dx = ptsM[i+1][0] - ptsM[i][0];
    const dy = ptsM[i+1][1] - ptsM[i][1];
    const len = Math.hypot(dx, dy) || 1;

    const nx = dy/len;
    const ny = -dx/len;

    ring.push(toD([ptsM[i][0] + nx*radiusM, ptsM[i][1] + ny*radiusM]));
  }

  for (let i = n-1; i > 0; i--) {
    const dx = ptsM[i][0] - ptsM[i-1][0];
    const dy = ptsM[i][1] - ptsM[i-1][1];
    const len = Math.hypot(dx, dy) || 1;

    const nx = -dy/len;
    const ny = dx/len;

    ring.push(toD([ptsM[i][0] + nx*radiusM, ptsM[i][1] + ny*radiusM]));
  }

  ring.push(ring[0]);
  return ring;
}

// ── Buffer feature (FIXES YOUR ERROR) ──
function _bufferFeature(feat, radiusM) {
  const geom = feat.geometry;
  if (!geom) return null;

  const t = geom.type;
  let outGeom;

  if (t === 'Point') {
    outGeom = {
      type:'Polygon',
      coordinates:[_circlePolygon(geom.coordinates[0], geom.coordinates[1], radiusM, 64)]
    };

  } else if (t === 'LineString') {
    const ring = _bufferLineRing(geom.coordinates, radiusM);
    if (!ring) return null;
    outGeom = { type:'Polygon', coordinates:[ring] };

  } else if (t === 'Polygon') {
    const ext = _bufferPolygonRing(geom.coordinates[0], radiusM);
    if (!ext || ext.length < 4) return null;
    outGeom = { type:'Polygon', coordinates:[ext] };

  } else {
    return null;
  }

  return {
    type:'Feature',
    geometry: outGeom,
    properties:{ ...feat.properties }
  };
}


// ===============================
// INTERNAL: robust topology utils
// ===============================

function _segKey(p) {
  return p[0].toFixed(9) + ',' + p[1].toFixed(9);
}

function _intersectSeg(a, b, c, d) {
  const den = (a[0]-b[0])*(c[1]-d[1]) - (a[1]-b[1])*(c[0]-d[0]);
  if (Math.abs(den) < 1e-12) return null;

  const t = ((a[0]-c[0])*(c[1]-d[1]) - (a[1]-c[1])*(c[0]-d[0])) / den;
  const u = ((a[0]-c[0])*(a[1]-b[1]) - (a[1]-c[1])*(a[0]-b[0])) / den;

  if (t > 0 && t < 1 && u > 0 && u < 1) {
    return [
      a[0] + t*(b[0]-a[0]),
      a[1] + t*(b[1]-a[1])
    ];
  }
  return null;
}

function _nodeSegments(coords) {
  const segs = [];
  for (let i = 0; i < coords.length - 1; i++) {
    segs.push([coords[i], coords[i+1]]);
  }

  const splits = Array(segs.length).fill(0).map(()=>[]);

  for (let i = 0; i < segs.length; i++) {
    for (let j = i+1; j < segs.length; j++) {
      const p = _intersectSeg(segs[i][0], segs[i][1], segs[j][0], segs[j][1]);
      if (p) {
        splits[i].push(p);
        splits[j].push(p);
      }
    }
  }

  const out = [];
  for (let i = 0; i < segs.length; i++) {
    const base = segs[i][0];
    const pts = [base, ...splits[i], segs[i][1]];

    pts.sort((a,b)=>
      Math.hypot(a[0]-base[0], a[1]-base[1]) -
      Math.hypot(b[0]-base[0], b[1]-base[1])
    );

    for (let k = 0; k < pts.length-1; k++) {
      out.push([pts[k], pts[k+1]]);
    }
  }

  return out;
}

function _polygonize(segs) {
  const adj = new Map();

  for (const [a,b] of segs) {
    const ka = _segKey(a), kb = _segKey(b);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka).push(b);
    adj.get(kb).push(a);
  }

  const visited = new Set();
  const rings = [];

  for (const [startKey, neighbors] of adj) {
    for (const next of neighbors) {
      const edgeKey = startKey + '>' + _segKey(next);
      if (visited.has(edgeKey)) continue;

      let ring = [];
      let curr = startKey.split(',').map(Number);
      let prev = null;

      while (true) {
        ring.push(curr);
        const nbrs = adj.get(_segKey(curr));

        let nextPt = null;
        for (const n of nbrs) {
          if (!prev || n[0] !== prev[0] || n[1] !== prev[1]) {
            nextPt = n;
            break;
          }
        }

        if (!nextPt) break;

        visited.add(_segKey(curr) + '>' + _segKey(nextPt));
        prev = curr;
        curr = nextPt;

        if (_segKey(curr) === startKey) break;
      }

      if (ring.length > 3) rings.push(ring);
    }
  }

  return rings;
}

function _cleanBufferRing(coords) {
  const segs = _nodeSegments(coords);
  const rings = _polygonize(segs);
  if (!rings.length) return null;

  let best = null, bestArea = -Infinity;

  for (const r of rings) {
    let area = 0;
    for (let i=0;i<r.length;i++){
      const a=r[i], b=r[(i+1)%r.length];
      area += a[0]*b[1] - b[0]*a[1];
    }
    if (area > bestArea) {
      bestArea = area;
      best = r;
    }
  }

  if (!best) return null;
  best.push([...best[0]]);
  return best;
}

// ── Rounded polygon ring buffer ──
function _bufferPolygonRing(ring, radiusM) {
  if (!ring || ring.length < 3) return ring;

  const pts = (ring[ring.length-1][0] === ring[0][0] && ring[ring.length-1][1] === ring[0][1])
    ? ring.slice(0, -1) : ring.slice();

  const n = pts.length;
  if (n < 3) return ring;

  const avgLat = pts.reduce((s, p) => s + p[1], 0) / n;
  const mPerLng = _metersPerDegLng(avgLat);
  const mPerLat = _metersPerDegLat();

  const toM = p => [p[0]*mPerLng, p[1]*mPerLat];
  const toD = p => [p[0]/mPerLng, p[1]/mPerLat];

  const ptsM = pts.map(toM);

  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const a = ptsM[i], b = ptsM[(i+1)%n];
    area2 += a[0]*b[1] - b[0]*a[1];
  }

  const sign = area2 >= 0 ? 1 : -1;

  const result = [];

  for (let i = 0; i < n; i++) {
    const prev = ptsM[(i+n-1)%n];
    const curr = ptsM[i];
    const next = ptsM[(i+1)%n];

    const e1 = [curr[0]-prev[0], curr[1]-prev[1]];
    const e2 = [next[0]-curr[0], next[1]-curr[1]];

    const len1 = Math.hypot(...e1);
    const len2 = Math.hypot(...e2);
    if (len1 < 1e-10 || len2 < 1e-10) continue;

    const n1 = [(e1[1]/len1)*sign, (-e1[0]/len1)*sign];
    const n2 = [(e2[1]/len2)*sign, (-e2[0]/len2)*sign];

    const cross = e1[0]*e2[1] - e1[1]*e2[0];

    const a1 = Math.atan2(n1[1], n1[0]);
const a2 = Math.atan2(n2[1], n2[0]);

let sweep = a2 - a1;

// normalize sweep based on polygon orientation
if (sign > 0) {
  while (sweep <= 0) sweep += 2*Math.PI;
} else {
  while (sweep >= 0) sweep -= 2*Math.PI;
}

// 🔥 KEY: limit sweep to avoid looping the long way
if (sign > 0 && sweep > Math.PI) sweep -= 2*Math.PI;
if (sign < 0 && sweep < -Math.PI) sweep += 2*Math.PI;

const steps = Math.max(2, Math.ceil(Math.abs(sweep)/(Math.PI/8)));

for (let s = 0; s <= steps; s++) {
  const a = a1 + sweep * (s / steps);
  result.push(toD([
    curr[0] + Math.cos(a) * radiusM,
    curr[1] + Math.sin(a) * radiusM
  ]));
}
  }

  const cleaned = _cleanBufferRing(result);
  if (!cleaned || cleaned.length < 3) return ring;

  cleaned.push([...cleaned[0]]);
  return cleaned;
}


//
// ── Convex hull (Graham scan) ──
function _collectPoints(geom) {
  const pts = [];
  function scan(c) {
    if (!Array.isArray(c)) return;
    if (typeof c[0]==='number') pts.push(c);
    else c.forEach(scan);
  }
  if (geom) scan(geom.coordinates);
  return pts;
}

function _convexHull(pts) {
  if (pts.length < 3) return pts;
  pts = pts.slice().sort((a,b) => a[0]-b[0]||a[1]-b[1]);
  function cross(O,A,B) { return (A[0]-O[0])*(B[1]-O[1])-(A[1]-O[1])*(B[0]-O[0]); }
  const lower = [];
  for (const p of pts) {
    while (lower.length>=2 && cross(lower[lower.length-2],lower[lower.length-1],p)<=0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i=pts.length-1;i>=0;i--) {
    const p=pts[i];
    while (upper.length>=2 && cross(upper[upper.length-2],upper[upper.length-1],p)<=0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  const hull = [...lower,...upper];
  if (hull.length>0) hull.push(hull[0]);
  return hull;
}

// ── Point-in-polygon (ray casting) ──
function _pointInPolygon(pt, ring) {
  let inside = false;
  const [x, y] = pt;
  for (let i=0, j=ring.length-1; i<ring.length; j=i++) {
    const [xi,yi]=ring[i], [xj,yj]=ring[j];
    if ((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}

function _geomIntersectsPolygon(geom, ring) {
  if (!geom) return false;
  const pts = _collectPoints(geom);
  return pts.some(p => _pointInPolygon(p, ring));
}

// ── Web Worker helper ─────────────────────────────────────────────────────────
// Tries to use a shared Worker; falls back to synchronous execution if the
// Worker can't be created (e.g. file:// protocol, CSP, or browser restriction).
let _gpWorkerInst = null;   // Worker instance, or false when permanently unavailable
const _gpPending = new Map();
let _gpMsgId = 0;

// Synchronous fallback — runs the same logic as gaia-worker.js on the main thread
function _gpRunSync(op, payload) {
  switch (op) {
    case 'buffer': {
      const { features, radiusM, merge } = payload;
      const buffered = features.map(f => _bufferFeature(f, radiusM)).filter(Boolean);
      if (!buffered.length) return [];
      if (merge) {
        const allRings = [];
        buffered.forEach(f => {
          if (f.geometry.type === 'Polygon') allRings.push(f.geometry.coordinates);
          else if (f.geometry.type === 'MultiPolygon') f.geometry.coordinates.forEach(p => allRings.push(p));
        });
        return [{ type:'Feature', geometry:{ type:'MultiPolygon', coordinates:allRings }, properties:{} }];
      }
      return buffered;
    }
    case 'intersect': {
      const { aFeats, bFeats } = payload;
      const bRings = [];
      bFeats.forEach(f => {
        const g = f.geometry; if (!g) return;
        if (g.type==='Polygon') g.coordinates.forEach(r => bRings.push(r));
        else if (g.type==='MultiPolygon') g.coordinates.forEach(p => p.forEach(r => bRings.push(r)));
      });
      return aFeats.filter(f => bRings.some(ring => _geomIntersectsPolygon(f.geometry, ring)));
    }
    case 'union': {
      const { aFeats, bFeats, aName, bName } = payload;
      return [
        ...aFeats.map(f => ({ ...f, properties: { ...f.properties, _source: aName } })),
        ...bFeats.map(f => ({ ...f, properties: { ...f.properties, _source: bName } })),
      ];
    }
    case 'dissolve': {
      const { features, field } = payload;
      const groups = {};
      features.forEach(f => {
        const key = field && f.properties ? (f.properties[field] ?? '__null__') : '__all__';
        if (!groups[key]) groups[key] = [];
        groups[key].push(f);
      });
      return Object.entries(groups).map(([key, gFeats]) => {
        const allRings = [];
        gFeats.forEach(f => {
          const g = f.geometry; if (!g) return;
          if (g.type==='Polygon') allRings.push(g.coordinates);
          else if (g.type==='MultiPolygon') g.coordinates.forEach(p => allRings.push(p));
        });
        const props = field ? { [field]: key==='__null__'?null:key } : { count: gFeats.length };
        return { type:'Feature', geometry:{ type:'MultiPolygon', coordinates:allRings }, properties:props };
      });
    }
    case 'simplify': {
      const { features, tol } = payload;
      return features.map(f => ({ ...f, geometry: _simplifyGeom(f.geometry, tol) }));
    }
    case 'centroid': {
      const { features } = payload;
      return features.map(f => {
        const c = _geomCentroid(f.geometry);
        if (!c) return null;
        return { type:'Feature', geometry:{ type:'Point', coordinates:c }, properties:{ ...f.properties } };
      }).filter(Boolean);
    }
    case 'bounding': {
      const { features, btype, perFeature } = payload;
      function _bndPts(pts) {
        if (!pts.length) return null;
        if (btype === 'convex_hull') { const h=_convexHull(pts); return h.length>=4?{type:'Polygon',coordinates:[h]}:null; }
        if (btype === 'bbox') {
          let mx=Infinity,my=Infinity,Mx=-Infinity,My=-Infinity;
          pts.forEach(([x,y])=>{if(x<mx)mx=x;if(x>Mx)Mx=x;if(y<my)my=y;if(y>My)My=y;});
          if(!isFinite(mx))return null;
          return{type:'Polygon',coordinates:[[[mx,my],[Mx,my],[Mx,My],[mx,My],[mx,my]]]};
        }
        if (btype === 'circle') {
          let cx=0,cy=0; pts.forEach(([x,y])=>{cx+=x;cy+=y;}); cx/=pts.length; cy/=pts.length;
          const mL=_metersPerDegLat(),mN=_metersPerDegLng(cy);
          let r=0; pts.forEach(([x,y])=>{const d=Math.sqrt(((x-cx)*mN)**2+((y-cy)*mL)**2);if(d>r)r=d;});
          return r?{type:'Polygon',coordinates:[_circlePolygon(cx,cy,r,72)]}:null;
        }
        if (btype === 'oriented_bbox') {
          const h=_convexHull(pts); if(h.length<3)return null;
          let bA=Infinity,bR=null;
          for(let i=0;i<h.length-1;i++){
            const[ax,ay]=h[i],[bx,by]=h[i+1],len=Math.sqrt((bx-ax)**2+(by-ay)**2);
            if(!len)continue;
            const ux=(bx-ax)/len,uy=(by-ay)/len,vx=-uy,vy=ux;
            let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
            h.forEach(([px,py])=>{const u=(px-ax)*ux+(py-ay)*uy,v=(px-ax)*vx+(py-ay)*vy;
              if(u<u0)u0=u;if(u>u1)u1=u;if(v<v0)v0=v;if(v>v1)v1=v;});
            const a=(u1-u0)*(v1-v0);
            if(a<bA){bA=a;const c=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(([u,v])=>[ax+u*ux+v*vx,ay+u*uy+v*vy]);
              c.push(c[0]);bR={type:'Polygon',coordinates:[c]};}
          }
          return bR;
        }
        return null;
      }
      const out=[];
      if(perFeature){features.forEach(f=>{const g=_bndPts(_collectPoints(f.geometry));if(g)out.push({type:'Feature',geometry:g,properties:{...f.properties}});});}
      else{const a=[];features.forEach(f=>a.push(..._collectPoints(f.geometry)));const g=_bndPts(a);if(g)out.push({type:'Feature',geometry:g,properties:{}});}
      return out;
    }
    default: throw new Error('Unknown op: ' + op);
  }
}

function _gpSend(op, payload) {
  // Permanent fallback if worker unavailable
  if (_gpWorkerInst === false) return Promise.resolve(_gpRunSync(op, payload));

  if (!_gpWorkerInst) {
    try {
      _gpWorkerInst = new Worker('js/gaia-worker.js');
      _gpWorkerInst.onmessage = ({ data: { id, result, error } }) => {
        const cb = _gpPending.get(id);
        _gpPending.delete(id);
        if (cb) error ? cb.reject(new Error(error)) : cb.resolve(result);
      };
      _gpWorkerInst.onerror = e => {
        _gpPending.forEach(cb => cb.reject(new Error(e.message || 'Worker error')));
        _gpPending.clear();
        _gpWorkerInst = null;
      };
    } catch (e) {
      // Worker creation failed (file:// protocol, CSP, etc.) — use sync fallback permanently
      _gpWorkerInst = false;
      return Promise.resolve(_gpRunSync(op, payload));
    }
  }
  return new Promise((resolve, reject) => {
    const id = ++_gpMsgId;
    _gpPending.set(id, { resolve, reject });
    _gpWorkerInst.postMessage({ id, op, payload });
  });
}

// Disable/restore a Run button while async work is in flight
function _gpBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? '⏳ Running…' : 'Run';
}

// ── UI: get layer select options ──
function _gpLayerOptions(includeEmpty) {
  const opts = includeEmpty ? ['<option value="">— select layer —</option>'] : [];
  state.layers.forEach((l, i) => {
    if (!l.isTile) opts.push(`<option value="${i}">${escHtml(l.name)}</option>`);
  });
  return opts.join('');
}

// ── GP BUFFER ──
async function runGeoBuffer() {
  const srcSel = document.getElementById('gp-buffer-src');
  const distEl = document.getElementById('gp-buffer-dist');
  const mergeEl = document.getElementById('gp-buffer-merge');
  const nameEl = document.getElementById('gp-buffer-name');
  const resEl  = document.getElementById('gp-buffer-result');
  const btn    = document.querySelector('#gp-buffer-panel button[onclick="runGeoBuffer()"]');
  if (!srcSel || !distEl) return;
  const srcIdx = parseInt(srcSel.value);
  if (isNaN(srcIdx)) { resEl.style.display='block'; resEl.textContent='Select a source layer.'; return; }
  const dist = parseFloat(distEl.value);
  if (!dist || dist <= 0) { resEl.style.display='block'; resEl.textContent='Enter a valid distance.'; return; }
  const merge = mergeEl ? mergeEl.checked : false;
  const feats = _geoFeatures(srcIdx);
  if (!feats.length) { resEl.style.display='block'; resEl.textContent='No features to buffer.'; return; }

  _gpBusy(btn, true);
  resEl.style.display='none';
  try {
    const outFeats = await _gpSend('buffer', { features: feats, radiusM: dist, merge });
    if (!outFeats.length) { resEl.style.display='block'; resEl.textContent='No features to buffer.'; return; }
    const name = (nameEl && nameEl.value.trim()) || 'Buffer';
    addLayer({ type:'FeatureCollection', features:outFeats }, name, 'EPSG:4326', 'Geoprocess');
    resEl.style.display='block'; resEl.textContent=`✔ Created "${name}" (${outFeats.length} feature${outFeats.length!==1?'s':''})`;
    _updateAllLayerLists();
  } catch (e) {
    resEl.style.display='block'; resEl.textContent='Error: ' + e.message;
  } finally {
    _gpBusy(btn, false);
  }
}

// ── GP INTERSECTION ──
async function runGeoIntersection() {
  const aEl = document.getElementById('gp-intersect-a');
  const bEl = document.getElementById('gp-intersect-b');
  const nameEl = document.getElementById('gp-intersect-name');
  const resEl  = document.getElementById('gp-intersect-result');
  const btn    = document.querySelector('#gp-intersect-panel button[onclick="runGeoIntersection()"]');
  if (!aEl || !bEl) return;
  const aIdx = parseInt(aEl.value), bIdx = parseInt(bEl.value);
  if (isNaN(aIdx)||isNaN(bIdx)||aIdx===bIdx) { resEl.style.display='block'; resEl.textContent='Select two different layers.'; return; }

  _gpBusy(btn, true);
  resEl.style.display='none';
  try {
    const outFeats = await _gpSend('intersect', { aFeats: _geoFeatures(aIdx), bFeats: _geoFeatures(bIdx) });
    const name = (nameEl && nameEl.value.trim()) || 'Intersection';
    if (!outFeats.length) { resEl.style.display='block'; resEl.textContent='No intersecting features found.'; return; }
    addLayer({ type:'FeatureCollection', features:outFeats }, name, 'EPSG:4326', 'Geoprocess');
    resEl.style.display='block'; resEl.textContent=`✔ Created "${name}" (${outFeats.length} feature${outFeats.length!==1?'s':''})`;
    _updateAllLayerLists();
  } catch (e) {
    resEl.style.display='block'; resEl.textContent='Error: ' + e.message;
  } finally {
    _gpBusy(btn, false);
  }
}

// ── GP UNION ──
// Combines all features from Layer A and Layer B into a single output layer.
async function runGeoUnion() {
  const aEl    = document.getElementById('gp-union-a');
  const bEl    = document.getElementById('gp-union-b');
  const nameEl = document.getElementById('gp-union-name');
  const resEl  = document.getElementById('gp-union-result');
  const btn    = document.querySelector('#gp-union-panel button[onclick="runGeoUnion()"]');
  if (!aEl || !bEl) return;
  const aIdx = parseInt(aEl.value), bIdx = parseInt(bEl.value);
  if (isNaN(aIdx)) { resEl.style.display='block'; resEl.textContent='Select Layer A.'; return; }
  if (isNaN(bIdx)) { resEl.style.display='block'; resEl.textContent='Select Layer B.'; return; }
  if (aIdx === bIdx) { resEl.style.display='block'; resEl.textContent='Select two different layers.'; return; }

  const aFeats = _geoFeatures(aIdx);
  const bFeats = _geoFeatures(bIdx);
  const aName = state.layers[aIdx]?.name || 'Layer A';
  const bName = state.layers[bIdx]?.name || 'Layer B';
  if (!aFeats.length && !bFeats.length) { resEl.style.display='block'; resEl.textContent='No features found in either layer.'; return; }

  _gpBusy(btn, true);
  resEl.style.display='none';
  try {
    const outFeats = await _gpSend('union', { aFeats, bFeats, aName, bName });
    const name = (nameEl && nameEl.value.trim()) || 'Union';
    addLayer({ type:'FeatureCollection', features:outFeats }, name, 'EPSG:4326', 'Geoprocess');
    resEl.style.display='block'; resEl.textContent=`✔ "${name}" — ${aFeats.length} + ${bFeats.length} = ${outFeats.length} features`;
    _updateAllLayerLists();
  } catch (e) {
    resEl.style.display='block'; resEl.textContent='Error: ' + e.message;
  } finally {
    _gpBusy(btn, false);
  }
}

// ── GP DISSOLVE ──
async function runGeoDissolve() {
  const srcEl   = document.getElementById('gp-dissolve-src');
  const fieldEl = document.getElementById('gp-dissolve-field');
  const nameEl  = document.getElementById('gp-dissolve-name');
  const resEl   = document.getElementById('gp-dissolve-result');
  const btn     = document.querySelector('#gp-dissolve-panel button[onclick="runGeoDissolve()"]');
  if (!srcEl) return;
  const srcIdx = parseInt(srcEl.value);
  if (isNaN(srcIdx)) { resEl.style.display='block'; resEl.textContent='Select a source layer.'; return; }
  const field = fieldEl ? fieldEl.value.trim() : '';

  _gpBusy(btn, true);
  resEl.style.display='none';
  try {
    const outFeats = await _gpSend('dissolve', { features: _geoFeatures(srcIdx), field });
    const name = (nameEl && nameEl.value.trim()) || 'Dissolve';
    addLayer({ type:'FeatureCollection', features:outFeats }, name, 'EPSG:4326', 'Geoprocess');
    resEl.style.display='block'; resEl.textContent=`✔ Created "${name}" (${outFeats.length} group${outFeats.length!==1?'s':''})`;
    _updateAllLayerLists();
  } catch (e) {
    resEl.style.display='block'; resEl.textContent='Error: ' + e.message;
  } finally {
    _gpBusy(btn, false);
  }
}

function _gpPopulateDissolveFields() {
  const srcEl   = document.getElementById('gp-dissolve-src');
  const fieldEl = document.getElementById('gp-dissolve-field');
  if (!srcEl || !fieldEl) return;
  const srcIdx = parseInt(srcEl.value);
  if (isNaN(srcIdx)) { fieldEl.innerHTML='<option value="">— no layer —</option>'; return; }
  const l = state.layers[srcIdx];
  const fields = l ? Object.keys(l.fields || {}) : [];
  fieldEl.innerHTML = '<option value="">— all features (merge all) —</option>' +
    fields.map(f => `<option value="${escHtml(f)}">${escHtml(f)}</option>`).join('');
}

// ── GP SIMPLIFY ──
async function runGeoSimplify() {
  const srcEl = document.getElementById('gp-simplify-src');
  const tolEl = document.getElementById('gp-simplify-tol');
  const nameEl = document.getElementById('gp-simplify-name');
  const resEl  = document.getElementById('gp-simplify-result');
  const btn    = document.querySelector('#gp-simplify-panel button[onclick="runGeoSimplify()"]');
  if (!srcEl) return;
  const srcIdx = parseInt(srcEl.value);
  if (isNaN(srcIdx)) { resEl.style.display='block'; resEl.textContent='Select a source layer.'; return; }
  const tol = parseFloat(tolEl ? tolEl.value : 0.0001);

  _gpBusy(btn, true);
  resEl.style.display='none';
  try {
    const outFeats = await _gpSend('simplify', { features: _geoFeatures(srcIdx), tol });
    const name = (nameEl && nameEl.value.trim()) || 'Simplified';
    addLayer({ type:'FeatureCollection', features:outFeats }, name, 'EPSG:4326', 'Geoprocess');
    resEl.style.display='block'; resEl.textContent=`✔ Created "${name}" (${outFeats.length} features)`;
    _updateAllLayerLists();
  } catch (e) {
    resEl.style.display='block'; resEl.textContent='Error: ' + e.message;
  } finally {
    _gpBusy(btn, false);
  }
}

// ── GP CENTROID ──
async function runGeoCentroid() {
  const srcEl  = document.getElementById('gp-centroid-src');
  const nameEl = document.getElementById('gp-centroid-name');
  const resEl  = document.getElementById('gp-centroid-result');
  const btn    = document.querySelector('#gp-centroid-panel button[onclick="runGeoCentroid()"]');
  if (!srcEl) return;
  const srcIdx = parseInt(srcEl.value);
  if (isNaN(srcIdx)) { resEl.style.display='block'; resEl.textContent='Select a source layer.'; return; }

  _gpBusy(btn, true);
  resEl.style.display='none';
  try {
    const outFeats = await _gpSend('centroid', { features: _geoFeatures(srcIdx) });
    if (!outFeats.length) { resEl.style.display='block'; resEl.textContent='No features with geometry.'; return; }
    const name = (nameEl && nameEl.value.trim()) || 'Centroids';
    addLayer({ type:'FeatureCollection', features:outFeats }, name, 'EPSG:4326', 'Geoprocess');
    resEl.style.display='block'; resEl.textContent=`✔ Created "${name}" (${outFeats.length} points)`;
    _updateAllLayerLists();
  } catch (e) {
    resEl.style.display='block'; resEl.textContent='Error: ' + e.message;
  } finally {
    _gpBusy(btn, false);
  }
}

// ── GP BOUNDING GEOMETRY ──
// Bounding type: 'convex_hull' | 'bbox' | 'circle' | 'oriented_bbox'
async function runGeoBoundingGeometry() {
  const srcEl   = document.getElementById('gp-hull-src');
  const typeEl  = document.getElementById('gp-hull-type');
  const perEl   = document.getElementById('gp-hull-per');
  const nameEl  = document.getElementById('gp-hull-name');
  const resEl   = document.getElementById('gp-hull-result');
  const btn     = document.querySelector('#gp-hull-panel button[onclick="runGeoBoundingGeometry()"]');
  if (!srcEl) return;
  const srcIdx = parseInt(srcEl.value);
  if (isNaN(srcIdx)) { resEl.style.display='block'; resEl.textContent='Select a source layer.'; return; }
  const btype = typeEl ? typeEl.value : 'convex_hull';
  const perFeature = perEl ? perEl.checked : false;

  _gpBusy(btn, true);
  resEl.style.display='none';
  try {
    const outFeats = await _gpSend('bounding', { features: _geoFeatures(srcIdx), btype, perFeature });
    if (!outFeats.length) { resEl.style.display='block'; resEl.textContent='Not enough points to compute geometry.'; return; }
    const typeLabels = { convex_hull:'Convex Hull', bbox:'Bounding Box', circle:'Bounding Circle', oriented_bbox:'Oriented BBox' };
    const defaultName = typeLabels[btype] || 'Bounding Geometry';
    const name = (nameEl && nameEl.value.trim()) || defaultName;
    addLayer({ type:'FeatureCollection', features:outFeats }, name, 'EPSG:4326', 'Geoprocess');
    resEl.style.display='block'; resEl.textContent=`✔ Created "${name}" (${outFeats.length} polygon${outFeats.length!==1?'s':''})`;
    _updateAllLayerLists();
  } catch (e) {
    resEl.style.display='block'; resEl.textContent='Error: ' + e.message;
  } finally {
    _gpBusy(btn, false);
  }
}

// ── GP CLIP ──────────────────────────────────────────────────────────────
// Clips features in Layer A to the boundary of polygon features in Layer B.
// Points   → kept if they fall inside any mask polygon
// Lines    → segments inside the mask are retained
// Polygons → geometry is intersected with the mask using Sutherland-Hodgman
async function runGeoClip() {
  const aEl    = document.getElementById('gp-clip-a');
  const bEl    = document.getElementById('gp-clip-b');
  const nameEl = document.getElementById('gp-clip-name');
  const resEl  = document.getElementById('gp-clip-result');
  const btn    = document.querySelector('#gp-clip-panel button[onclick="runGeoClip()"]');
  if (!aEl || !bEl) return;
  const aIdx = parseInt(aEl.value), bIdx = parseInt(bEl.value);
  if (isNaN(aIdx) || isNaN(bIdx)) { resEl.style.display='block'; resEl.textContent='Select two different layers.'; return; }
  if (aIdx === bIdx)               { resEl.style.display='block'; resEl.textContent='Layer A and Layer B must be different.'; return; }

  const maskLayer = state.layers[bIdx];
  if (!maskLayer) return;
  // Collect all mask rings from Layer B
  const maskRings = [];
  (maskLayer.geojson.features || []).forEach(f => {
    const g = f.geometry; if (!g) return;
    if (g.type === 'Polygon')      g.coordinates.forEach(r => maskRings.push(r));
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => maskRings.push(r)));
  });
  if (!maskRings.length) { resEl.style.display='block'; resEl.textContent='Layer B has no polygon geometry to use as a clip mask.'; return; }

  _gpBusy(btn, true);
  resEl.style.display = 'none';

  // Run clip synchronously (fast enough for typical datasets)
  try {
    const inFeats  = _geoFeatures(aIdx);
    const outFeats = [];

    inFeats.forEach(feat => {
      const g = feat.geometry; if (!g) return;
      const clipped = _clipGeomToMask(g, maskRings);
      if (clipped) outFeats.push({ type: 'Feature', geometry: clipped, properties: { ...feat.properties } });
    });

    if (!outFeats.length) { resEl.style.display='block'; resEl.textContent='No features remain after clipping.'; return; }
    const name = (nameEl && nameEl.value.trim()) || 'Clip';
    addLayer({ type: 'FeatureCollection', features: outFeats }, name, 'EPSG:4326', 'Geoprocess');
    resEl.style.display='block'; resEl.textContent=`✔ Created "${name}" (${outFeats.length} feature${outFeats.length!==1?'s':''})`;
    _updateAllLayerLists();
  } catch(e) {
    resEl.style.display='block'; resEl.textContent='Error: ' + e.message;
  } finally {
    _gpBusy(btn, false);
  }
}

// Clip a GeoJSON geometry against an array of mask polygon rings.
// Returns a (possibly simplified) GeoJSON geometry or null if nothing remains.
function _clipGeomToMask(geom, maskRings) {
  const t = geom.type;

  if (t === 'Point') {
    return maskRings.some(r => _pointInPolygon(geom.coordinates, r)) ? geom : null;
  }

  if (t === 'MultiPoint') {
    const kept = geom.coordinates.filter(c => maskRings.some(r => _pointInPolygon(c, r)));
    if (!kept.length) return null;
    return kept.length === 1 ? { type: 'Point', coordinates: kept[0] }
                             : { type: 'MultiPoint', coordinates: kept };
  }

  if (t === 'LineString') {
    const segs = _clipLineToMask(geom.coordinates, maskRings);
    if (!segs.length) return null;
    return segs.length === 1 ? { type: 'LineString', coordinates: segs[0] }
                             : { type: 'MultiLineString', coordinates: segs };
  }

  if (t === 'MultiLineString') {
    const allSegs = geom.coordinates.flatMap(line => _clipLineToMask(line, maskRings));
    if (!allSegs.length) return null;
    return { type: 'MultiLineString', coordinates: allSegs };
  }

  if (t === 'Polygon') {
    const rings = _clipPolygonToMask(geom.coordinates, maskRings);
    if (!rings) return null;
    return { type: 'Polygon', coordinates: rings };
  }

  if (t === 'MultiPolygon') {
    const polys = geom.coordinates
      .map(polyRings => _clipPolygonToMask(polyRings, maskRings))
      .filter(Boolean);
    if (!polys.length) return null;
    return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] }
                              : { type: 'MultiPolygon', coordinates: polys };
  }

  return null;
}

// Clip a line (array of [x,y]) against mask rings.
// Returns array of line segments that fall inside.
function _clipLineToMask(coords, maskRings) {
  const result = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i], b = coords[i + 1];
    // For each segment, find entry/exit points across all mask rings
    // Simplified: keep the segment if midpoint is inside any mask ring
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (maskRings.some(r => _pointInPolygon(mid, r))) {
      // Extend/merge with previous segment if contiguous
      if (result.length && result[result.length - 1].slice(-1)[0] === a) {
        result[result.length - 1].push(b);
      } else {
        result.push([a, b]);
      }
    }
  }
  return result;
}

// Clip a polygon (array of rings) against mask rings using Sutherland-Hodgman.
// Returns clipped rings array or null.
function _clipPolygonToMask(polyRings, maskRings) {
  // Clip outer ring against each mask ring with Sutherland-Hodgman
  let outer = polyRings[0];
  // Find the mask ring that produces the largest result (best fit)
  let bestOuter = null, bestArea = 0;
  for (const maskRing of maskRings) {
    const clipped = _suthHodgman(outer, maskRing);
    if (clipped.length >= 4) {
      const area = Math.abs(_ringArea(clipped));
      if (area > bestArea) { bestArea = area; bestOuter = clipped; }
    }
  }
  if (!bestOuter) return null;
  return [bestOuter]; // holes are discarded for simplicity
}

// Sutherland-Hodgman polygon clipping algorithm
function _suthHodgman(subject, clip) {
  // Remove closing point from both rings for processing
  const subj = (subject[subject.length-1][0]===subject[0][0] && subject[subject.length-1][1]===subject[0][1])
    ? subject.slice(0, -1) : subject.slice();
  const cl   = (clip[clip.length-1][0]===clip[0][0] && clip[clip.length-1][1]===clip[0][1])
    ? clip.slice(0, -1) : clip.slice();

  let output = subj.slice();
  const n = cl.length;

  for (let i = 0; i < n; i++) {
    if (!output.length) return [];
    const input = output;
    output = [];
    const edgeA = cl[i];
    const edgeB = cl[(i + 1) % n];

    for (let j = 0; j < input.length; j++) {
      const curr = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const currIn = _shInside(curr, edgeA, edgeB);
      const prevIn = _shInside(prev, edgeA, edgeB);
      if (currIn) {
        if (!prevIn) {
          const p = _shIntersect(prev, curr, edgeA, edgeB);
          if (p) output.push(p);
        }
        output.push(curr);
      } else if (prevIn) {
        const p = _shIntersect(prev, curr, edgeA, edgeB);
        if (p) output.push(p);
      }
    }
  }
  if (output.length < 3) return [];
  output.push(output[0]); // close ring
  return output;
}

function _shInside(pt, a, b) {
  return (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]) >= 0;
}

function _shIntersect(p1, p2, p3, p4) {
  const d1 = [p2[0]-p1[0], p2[1]-p1[1]];
  const d2 = [p4[0]-p3[0], p4[1]-p3[1]];
  const cross = d1[0]*d2[1] - d1[1]*d2[0];
  if (Math.abs(cross) < 1e-14) return null;
  const t = ((p3[0]-p1[0])*d2[1] - (p3[1]-p1[1])*d2[0]) / cross;
  return [p1[0] + t*d1[0], p1[1] + t*d1[1]];
}

function _ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i+1][1] - ring[i+1][0] * ring[i][1];
  }
  return area / 2;
}

// ── GP SPLIT ─────────────────────────────────────────────────────────────
// Splits polygon/line features in Layer A using line features in Layer B.
// Each feature in A is split wherever a split line (from B) crosses it,
// producing two (or more) output features. Unsplit features are passed through.
async function runGeoSplit() {
  const aIdx  = parseInt(document.getElementById('gp-split-a').value);
  const bIdx  = parseInt(document.getElementById('gp-split-b').value);
  const nameEl = document.getElementById('gp-split-name');
  const resEl  = document.getElementById('gp-split-result');
  const btn    = document.querySelector('#gp-split-panel button[onclick="runGeoSplit()"]');

  if (isNaN(aIdx) || isNaN(bIdx)) { resEl.textContent = '⚠ Select both layers.'; return; }
  if (aIdx === bIdx) { resEl.textContent = '⚠ Layers must be different.'; return; }

  const layerA = state.layers[aIdx];
  const layerB = state.layers[bIdx];
  if (!layerA || !layerB) return;

  // Collect all split line segments from Layer B
  const splitLines = [];
  (layerB.geojson.features || []).forEach(f => {
    if (!f.geometry) return;
    const t = f.geometry.type;
    if (t === 'LineString') splitLines.push(f.geometry.coordinates);
    else if (t === 'MultiLineString') f.geometry.coordinates.forEach(c => splitLines.push(c));
  });
  if (!splitLines.length) { resEl.textContent = '⚠ Layer B must contain line features.'; return; }

  _gpBusy(btn, true); resEl.textContent = '';
  try {
    const outFeatures = [];
    (layerA.geojson.features || []).forEach(f => {
      if (!f.geometry) return;
      const t = f.geometry.type;
      if (t === 'Polygon' || t === 'MultiPolygon') {
        const rings = t === 'Polygon' ? [f.geometry.coordinates[0]]
          : f.geometry.coordinates.map(r => r[0]);
        let produced = rings;
        splitLines.forEach(splitLine => {
          const next = [];
          produced.forEach(ring => {
            const halves = _splitRingByLine(ring, splitLine);
            next.push(...halves);
          });
          if (next.length > produced.length) produced = next;
        });
        produced.forEach(ring => {
          if (ring.length >= 4) {
            outFeatures.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] },
              properties: Object.assign({}, f.properties) });
          }
        });
      } else if (t === 'LineString' || t === 'MultiLineString') {
        const lines = t === 'LineString' ? [f.geometry.coordinates]
          : f.geometry.coordinates;
        let produced = lines;
        splitLines.forEach(splitLine => {
          const next = [];
          produced.forEach(line => {
            const segs = _splitLineByLine(line, splitLine);
            next.push(...segs);
          });
          if (next.length > produced.length) produced = next;
        });
        produced.forEach(seg => {
          if (seg.length >= 2) {
            const geomType = t === 'LineString' ? 'LineString' : 'LineString';
            outFeatures.push({ type: 'Feature', geometry: { type: geomType, coordinates: seg },
              properties: Object.assign({}, f.properties) });
          }
        });
      } else {
        outFeatures.push(JSON.parse(JSON.stringify(f)));
      }
    });

    const outName = (nameEl.value.trim() || (layerA.name + ' Split'));
    const outGJ = { type: 'FeatureCollection', features: outFeatures };
    addLayer(outGJ, outName, 'EPSG:4326', 'Geoprocess');
    resEl.textContent = `✓ ${outFeatures.length} features created.`;
    resEl.style.color = 'var(--green)';
    toast(`Split → "${outName}" (${outFeatures.length} features)`, 'success');
  } catch(err) {
    resEl.textContent = '✗ ' + err.message;
    resEl.style.color = 'var(--red)';
  } finally {
    _gpBusy(btn, false);
  }
}

// Split a polygon ring by a polyline. Returns array of rings (1 if no split, 2 if split).
function _splitRingByLine(ring, splitLine) {
  // Find all intersection points of split line with ring boundary
  // and their positions along the ring
  const intersections = [];
  const rLen = ring.length - 1; // ring is closed so last == first

  for (let si = 0; si < splitLine.length - 1; si++) {
    const sA = splitLine[si], sB = splitLine[si + 1];
    for (let ri = 0; ri < rLen; ri++) {
      const rA = ring[ri], rB = ring[(ri + 1) % rLen];
      const pt = _segSegIntersect(sA, sB, rA, rB);
      if (pt) {
        // Position along ring (ring index + fraction)
        const dx = rB[0] - rA[0], dy = rB[1] - rA[1];
        const len2 = dx*dx + dy*dy;
        const t = len2 > 0 ? ((pt[0]-rA[0])*dx + (pt[1]-rA[1])*dy) / len2 : 0;
        intersections.push({ pt, ringPos: ri + Math.max(0, Math.min(1, t)) });
      }
    }
  }

  if (intersections.length < 2) return [ring]; // no split

  // Sort by ring position
  intersections.sort((a, b) => a.ringPos - b.ringPos);
  const p0 = intersections[0], p1 = intersections[1];
  const i0 = Math.floor(p0.ringPos), i1 = Math.floor(p1.ringPos);

  // Build ring A: from p0 → (ring vertices i0+1 … i1) → p1 → p0
  const ringA = [p0.pt];
  for (let i = i0 + 1; i <= i1; i++) ringA.push(ring[i % rLen]);
  ringA.push(p1.pt);
  ringA.push(p0.pt); // close

  // Build ring B: from p1 → (ring vertices i1+1 … i0 wrapping) → p0 → p1
  const ringB = [p1.pt];
  for (let i = i1 + 1; i <= i0 + rLen; i++) ringB.push(ring[i % rLen]);
  ringB.push(p0.pt);
  ringB.push(p1.pt); // close

  return [ringA, ringB].filter(r => r.length >= 4);
}

// Split a line by another polyline. Returns array of line segments.
function _splitLineByLine(line, splitLine) {
  // Find all intersection points with their position along the target line
  const cuts = [];
  for (let si = 0; si < splitLine.length - 1; si++) {
    const sA = splitLine[si], sB = splitLine[si + 1];
    for (let li = 0; li < line.length - 1; li++) {
      const lA = line[li], lB = line[li + 1];
      const pt = _segSegIntersect(sA, sB, lA, lB);
      if (pt) {
        const dx = lB[0]-lA[0], dy = lB[1]-lA[1];
        const len2 = dx*dx + dy*dy;
        const t = len2 > 0 ? ((pt[0]-lA[0])*dx + (pt[1]-lA[1])*dy) / len2 : 0;
        cuts.push({ pt, pos: li + Math.max(0, Math.min(1, t)) });
      }
    }
  }
  if (!cuts.length) return [line];
  cuts.sort((a, b) => a.pos - b.pos);

  const segments = [];
  let prev = 0;
  cuts.forEach(cut => {
    const i = Math.floor(cut.pos);
    const seg = line.slice(prev, i + 1);
    seg.push(cut.pt);
    if (seg.length >= 2) segments.push(seg);
    prev = i + 1;
  });
  const last = [cuts[cuts.length-1].pt, ...line.slice(prev)];
  if (last.length >= 2) segments.push(last);
  return segments;
}

// Segment-segment intersection test. Returns intersection point or null.
function _segSegIntersect(a, b, c, d) {
  const r = [b[0]-a[0], b[1]-a[1]];
  const s = [d[0]-c[0], d[1]-c[1]];
  const denom = r[0]*s[1] - r[1]*s[0];
  if (Math.abs(denom) < 1e-14) return null;
  const t = ((c[0]-a[0])*s[1] - (c[1]-a[1])*s[0]) / denom;
  const u = ((c[0]-a[0])*r[1] - (c[1]-a[1])*r[0]) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return [a[0] + t*r[0], a[1] + t*r[1]];
  }
  return null;
}

// Refresh all geoprocessing layer selects when layers change
function updateGeoprocessLayerSelects() {
  const ids = [
    'gp-buffer-src','gp-intersect-a','gp-intersect-b',
    'gp-clip-a','gp-clip-b',
    'gp-union-a','gp-union-b',
    'gp-dissolve-src','gp-simplify-src','gp-centroid-src','gp-hull-src',
    'gp-split-a','gp-split-b','gp-topo-src'
  ];
  const opts = _gpLayerOptions(true);
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
  //_gpPopulateDissolveFields();
}

// ── TOPOLOGY / GEOMETRY VALIDATION ───────────────────────────────────────
async function runTopoCheck() {
  const srcIdx = parseInt(document.getElementById('gp-topo-src').value);
  const resEl  = document.getElementById('gp-topo-result');
  const btn    = document.querySelector('#gp-topo-panel button[onclick="runTopoCheck()"]');

  if (isNaN(srcIdx)) { resEl.textContent = '⚠ Select a layer.'; return; }
  const layer = state.layers[srcIdx];
  if (!layer) return;

  const chkSelf  = document.getElementById('topo-chk-selfintersect').checked;
  const chkUnclsd= document.getElementById('topo-chk-unclosed').checked;
  const chkDup   = document.getElementById('topo-chk-dupverts').checked;
  const chkEmpty = document.getElementById('topo-chk-empty').checked;
  const chkSpike = document.getElementById('topo-chk-spike').checked;

  _gpBusy(btn, true); resEl.textContent = '';

  const issues = [];

  (layer.geojson.features || []).forEach((f, fi) => {
    const props = { _fi: fi, feature_id: f.properties?._fi ?? fi };

    if (!f.geometry || !f.geometry.type) {
      if (chkEmpty) issues.push({ type: 'Feature', geometry: null,
        properties: { ...props, issue: 'Empty geometry', severity: 'error' } });
      return;
    }

    const t = f.geometry.type;
    const coords = f.geometry.coordinates;

    // Helper: iterate all rings
    function eachRing(callback) {
      if (t === 'Polygon') coords.forEach((r, ri) => callback(r, ri));
      else if (t === 'MultiPolygon') coords.forEach((poly, pi) =>
        poly.forEach((r, ri) => callback(r, `${pi}.${ri}`)));
    }
    // Helper: iterate all linestrings
    function eachLine(callback) {
      if (t === 'LineString') callback(coords, 0);
      else if (t === 'MultiLineString') coords.forEach((l, li) => callback(l, li));
      else if (t === 'Polygon') coords.forEach((r, ri) => callback(r, ri));
      else if (t === 'MultiPolygon') coords.forEach((poly, pi) =>
        poly.forEach((r, ri) => callback(r, `${pi}.${ri}`)));
    }

    // --- Check: unclosed rings ---
    if (chkUnclsd && (t === 'Polygon' || t === 'MultiPolygon')) {
      eachRing((ring, ri) => {
        if (ring.length < 2) return;
        const first = ring[0], last = ring[ring.length - 1];
        if (Math.abs(first[0] - last[0]) > 1e-9 || Math.abs(first[1] - last[1]) > 1e-9) {
          issues.push({ type: 'Feature', geometry: { type: 'Point', coordinates: ring[0] },
            properties: { ...props, issue: `Unclosed ring (ring ${ri})`, severity: 'error' } });
        }
      });
    }

    // --- Check: duplicate consecutive vertices ---
    if (chkDup) {
      eachLine((line, li) => {
        for (let i = 0; i < line.length - 1; i++) {
          if (Math.abs(line[i][0] - line[i+1][0]) < 1e-10 &&
              Math.abs(line[i][1] - line[i+1][1]) < 1e-10) {
            issues.push({ type: 'Feature', geometry: { type: 'Point', coordinates: line[i] },
              properties: { ...props, issue: `Duplicate vertex at index ${i} (line ${li})`, severity: 'warning' } });
            break; // one per line/ring is enough
          }
        }
      });
    }

    // --- Check: spike vertices (very acute angle < 1°) ---
    if (chkSpike) {
      eachLine((line, li) => {
        for (let i = 1; i < line.length - 1; i++) {
          const a = line[i-1], b = line[i], c = line[i+1];
          const v1 = [a[0]-b[0], a[1]-b[1]], v2 = [c[0]-b[0], c[1]-b[1]];
          const d1 = Math.sqrt(v1[0]*v1[0]+v1[1]*v1[1]);
          const d2 = Math.sqrt(v2[0]*v2[0]+v2[1]*v2[1]);
          if (d1 < 1e-12 || d2 < 1e-12) continue;
          const cos = (v1[0]*v2[0]+v1[1]*v2[1]) / (d1*d2);
          const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
          if (angle < 1) {
            issues.push({ type: 'Feature', geometry: { type: 'Point', coordinates: b },
              properties: { ...props, issue: `Spike vertex at index ${i} (angle ${angle.toFixed(2)}°)`, severity: 'warning' } });
          }
        }
      });
    }

    // --- Check: self-intersecting rings (O(n²) segment test) ---
    if (chkSelf && (t === 'Polygon' || t === 'MultiPolygon')) {
      eachRing((ring, ri) => {
        const n = ring.length - 1; // last == first for closed ring
        outer: for (let i = 0; i < n - 2; i++) {
          for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue; // skip adjacent
            const pt = _segSegIntersect(ring[i], ring[i+1], ring[j], ring[j+1]);
            if (pt) {
              issues.push({ type: 'Feature', geometry: { type: 'Point', coordinates: pt },
                properties: { ...props, issue: `Self-intersection in ring ${ri} (seg ${i} × seg ${j})`, severity: 'error' } });
              break outer; // one per ring
            }
          }
        }
      });
    }
  });

  _gpBusy(btn, false);

  if (!issues.length) {
    resEl.textContent = `✓ No issues found in ${layer.geojson.features.length} features.`;
    resEl.style.color = 'var(--green)';
    toast('Topology check passed — no issues found', 'success');
    return;
  }

  const outGJ = { type: 'FeatureCollection', features: issues };
  addLayer(outGJ, layer.name + ' — Issues', 'EPSG:4326', 'Topology');
  const errors   = issues.filter(i => i.properties.severity === 'error').length;
  const warnings = issues.filter(i => i.properties.severity === 'warning').length;
  resEl.innerHTML = `<span style="color:var(--red)">✗ ${errors} error(s)</span>` +
    (warnings ? ` <span style="color:var(--orange)">+ ${warnings} warning(s)</span>` : '') +
    ` — see new issue layer`;
  toast(`Topology: ${errors} error(s), ${warnings} warning(s)`, errors ? 'error' : 'info');
}

// ── END GEOPROCESSING ──────────────────────────────────────────────────────

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