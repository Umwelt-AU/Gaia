// gaia-geoprocess.js — Geoprocessing operations, PRJ parser, reproject
// ── GEOPROCESSING ──────────────────────────────────────────────────────────
// Pure-JS spatial operations. All work in WGS84 (degrees).
// Distances/buffers use a metres→degrees approximation via deg/m at the
// centroid latitude, which is adequate for planning/GIS tasks at typical scales.

// Helpers
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

// ── Segment intersection (returns point or null) ──
function _segIntersect2D(a, b, c, d) {
  const dx1 = b[0]-a[0], dy1 = b[1]-a[1];
  const dx2 = d[0]-c[0], dy2 = d[1]-c[1];
  const den = dx1*dy2 - dy1*dx2;
  if (Math.abs(den) < 1e-14) return null;
  const t = ((c[0]-a[0])*dy2 - (c[1]-a[1])*dx2) / den;
  const u = ((c[0]-a[0])*dy1 - (c[1]-a[1])*dx1) / den;
  if (t > 1e-10 && t < 1-1e-10 && u > 1e-10 && u < 1-1e-10)
    return [a[0]+t*dx1, a[1]+t*dy1];
  return null;
}

/// ===============================
// TOPOLOGY + BUFFER CORE (FIXED)
// ===============================

// --- segment intersection ---
function _intersectSeg(a, b, c, d) {
  const den = (a[0]-b[0])*(c[1]-d[1]) - (a[1]-b[1])*(c[0]-d[0]);
  if (Math.abs(den) < 1e-12) return null;

  const t = ((a[0]-c[0])*(c[1]-d[1]) - (a[1]-c[1])*(c[0]-d[0])) / den;
  const u = ((a[0]-c[0])*(a[1]-b[1]) - (a[1]-c[1])*(a[0]-b[0])) / den;

  if (t > 0 && t < 1 && u > 0 && u < 1) {
    return [a[0] + t*(b[0]-a[0]), a[1] + t*(b[1]-a[1])];
  }
  return null;
}

// --- node segments (split at intersections) ---
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

// --- polygonize graph into rings ---
function _polygonize(segs) {
  const adj = new Map();
  const key = p => p[0].toFixed(9)+','+p[1].toFixed(9);

  for (const [a,b] of segs) {
    const ka = key(a), kb = key(b);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka).push(b);
    adj.get(kb).push(a);
  }

  const visited = new Set();
  const rings = [];

  for (const [startKey, neighbors] of adj) {
    for (const next of neighbors) {
      const edgeKey = startKey + '>' + key(next);
      if (visited.has(edgeKey)) continue;

      let ring = [];
      let curr = startKey.split(',').map(Number);
      let prev = null;

      while (true) {
        ring.push(curr);
        const nbrs = adj.get(key(curr));

        let nextPt = null;
        for (const n of nbrs) {
          if (!prev || n[0] !== prev[0] || n[1] !== prev[1]) {
            nextPt = n;
            break;
          }
        }

        if (!nextPt) break;

        visited.add(key(curr) + '>' + key(nextPt));
        prev = curr;
        curr = nextPt;

        if (key(curr) === startKey) break;
      }

      if (ring.length > 3) rings.push(ring);
    }
  }

  return rings;
}

// --- clean buffer ring (ArcGIS-style) ---
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

// override old loop remover
function _removePolyLoops(coords) {
  return _cleanBufferRing(coords);
}

//
//
//

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

// ==========================================
// ORIGINAL FUNCTIONS (names unchanged)
// ==========================================

function _removePolyLoops(coords) {
  // replaced internally with full topology cleanup
  return _cleanBufferRing(coords);
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

  const cleaned = _removePolyLoops(result);
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
    updateLayerList(); updateExportLayerList(); updateSBLLayerList(); updateDQALayerList();
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
    updateLayerList(); updateExportLayerList(); updateSBLLayerList(); updateDQALayerList();
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
    updateLayerList(); updateExportLayerList(); updateSBLLayerList(); updateDQALayerList();
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
    updateLayerList(); updateExportLayerList(); updateSBLLayerList(); updateDQALayerList();
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
    updateLayerList(); updateExportLayerList(); updateSBLLayerList(); updateDQALayerList();
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
    updateLayerList(); updateExportLayerList(); updateSBLLayerList(); updateDQALayerList();
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
    updateLayerList(); updateExportLayerList(); updateSBLLayerList(); updateDQALayerList();
  } catch (e) {
    resEl.style.display='block'; resEl.textContent='Error: ' + e.message;
  } finally {
    _gpBusy(btn, false);
  }
}

// Refresh all geoprocessing layer selects when layers change
function updateGeoprocessLayerSelects() {
  const ids = [
    'gp-buffer-src','gp-intersect-a','gp-intersect-b',
    'gp-union-a','gp-union-b',
    'gp-dissolve-src','gp-simplify-src','gp-centroid-src','gp-hull-src'
  ];
  const opts = _gpLayerOptions(true);
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
  //_gpPopulateDissolveFields();
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

