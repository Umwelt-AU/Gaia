// gaia-worker.js — Pure geoprocessing functions running in a Web Worker
// No DOM access, no globals from the main thread.

// ── HELPERS ──────────────────────────────────────────────────────────────────
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

// ── Circular buffer polygon around a point ──
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
  const dx1=b[0]-a[0], dy1=b[1]-a[1], dx2=d[0]-c[0], dy2=d[1]-c[1];
  const den = dx1*dy2 - dy1*dx2;
  if (Math.abs(den) < 1e-14) return null;
  const t = ((c[0]-a[0])*dy2 - (c[1]-a[1])*dx2) / den;
  const u = ((c[0]-a[0])*dy1 - (c[1]-a[1])*dx1) / den;
  if (t > 1e-10 && t < 1-1e-10 && u > 1e-10 && u < 1-1e-10)
    return [a[0]+t*dx1, a[1]+t*dy1];
  return null;
}

// ── Remove self-intersecting spurs from an unclosed polygon point array ──
function _removePolyLoops(pts) {
  if (!pts || pts.length < 4) return pts;
  let result = pts.slice();
  for (let iter = 0; iter < pts.length; iter++) {
    let found = false;
    const m = result.length;
    for (let i = 0; i < m-2 && !found; i++) {
      for (let j = i+2; j < m-1 && !found; j++) {
        const pt = _segIntersect2D(result[i], result[i+1], result[j], result[j+1]);
        if (pt) {
          result = [...result.slice(0, i+1), pt, ...result.slice(j+1)];
          found = true;
        }
      }
    }
    if (!found) break;
  }
  return result;
}

// ── Rounded polygon ring buffer with self-intersection cleanup ──
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
    const len1 = Math.hypot(e1[0], e1[1]);
    const len2 = Math.hypot(e2[0], e2[1]);
    if (len1 < 1e-10 || len2 < 1e-10) continue;

    const n1 = [(e1[1]/len1)*sign, (-e1[0]/len1)*sign];
    const n2 = [(e2[1]/len2)*sign, (-e2[0]/len2)*sign];
    const cross = e1[0]*e2[1] - e1[1]*e2[0];

    if (cross * sign > 0) {
      const a1 = Math.atan2(n1[1], n1[0]);
      const a2 = Math.atan2(n2[1], n2[0]);
      let sweep = a2 - a1;
      if (sign > 0) { while (sweep < 0) sweep += 2*Math.PI; }
      else           { while (sweep > 0) sweep -= 2*Math.PI; }
      const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI/2) * _BUF_ARC_STEPS));
      for (let s = 0; s <= steps; s++) {
        const a = a1 + sweep*(s/steps);
        result.push(toD([curr[0]+Math.cos(a)*radiusM, curr[1]+Math.sin(a)*radiusM]));
      }
    } else {
      const p1 = [curr[0]+n1[0]*radiusM, curr[1]+n1[1]*radiusM];
      const p2 = [curr[0]+n2[0]*radiusM, curr[1]+n2[1]*radiusM];
      const denom = e1[0]*e2[1] - e1[1]*e2[0];
      if (Math.abs(denom) < 1e-10) {
        result.push(toD(p1));
      } else {
        const t = ((p2[0]-p1[0])*e2[1] - (p2[1]-p1[1])*e2[0]) / denom;
        result.push(toD([p1[0]+t*e1[0], p1[1]+t*e1[1]]));
      }
    }
  }

  const cleaned = _removePolyLoops(result);
  if (!cleaned || cleaned.length < 3) return ring;
  cleaned.push([...cleaned[0]]);
  return cleaned;
}

// ── Closed polygon ring representing a rounded line buffer ──
function _bufferLineRing(coords, radiusM) {
  if (!coords || coords.length < 2) return null;
  const ARC = _BUF_ARC_STEPS;
  const avgLat = coords.reduce((s, p) => s+p[1], 0) / coords.length;
  const mPerLng = _metersPerDegLng(avgLat);
  const mPerLat = _metersPerDegLat();
  const toM = p => [p[0]*mPerLng, p[1]*mPerLat];
  const toD = p => [p[0]/mPerLng, p[1]/mPerLat];
  const ptsM = coords.map(toM);
  const n = ptsM.length;

  const norms = [];
  for (let i = 0; i < n-1; i++) {
    const dx = ptsM[i+1][0]-ptsM[i][0], dy = ptsM[i+1][1]-ptsM[i][1];
    const len = Math.hypot(dx, dy) || 1;
    norms.push([dy/len, -dx/len]);
  }

  function buildSide(sg) {
    const pts = [[ptsM[0][0]+norms[0][0]*sg*radiusM, ptsM[0][1]+norms[0][1]*sg*radiusM]];
    for (let k = 1; k < n-1; k++) {
      const e1 = [ptsM[k][0]-ptsM[k-1][0], ptsM[k][1]-ptsM[k-1][1]];
      const e2 = [ptsM[k+1][0]-ptsM[k][0], ptsM[k+1][1]-ptsM[k][1]];
      const cross = e1[0]*e2[1] - e1[1]*e2[0];
      const curr = ptsM[k];
      const kn1 = [norms[k-1][0]*sg, norms[k-1][1]*sg];
      const kn2 = [norms[k][0]*sg,   norms[k][1]*sg];
      const convex = (sg > 0 && cross > 0) || (sg < 0 && cross < 0);
      if (convex) {
        const a1 = Math.atan2(kn1[1], kn1[0]);
        const a2 = Math.atan2(kn2[1], kn2[0]);
        let sweep = a2 - a1;
        if (sg > 0) { while (sweep < 0) sweep += 2*Math.PI; }
        else         { while (sweep > 0) sweep -= 2*Math.PI; }
        const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI/2) * ARC));
        for (let s = 0; s <= steps; s++) {
          const a = a1 + sweep*(s/steps);
          pts.push([curr[0]+Math.cos(a)*radiusM, curr[1]+Math.sin(a)*radiusM]);
        }
      } else {
        const p1 = [curr[0]+kn1[0]*radiusM, curr[1]+kn1[1]*radiusM];
        const p2 = [curr[0]+kn2[0]*radiusM, curr[1]+kn2[1]*radiusM];
        const denom = e1[0]*e2[1] - e1[1]*e2[0];
        if (Math.abs(denom) < 1e-10) {
          pts.push(p1);
        } else {
          const t = ((p2[0]-p1[0])*e2[1] - (p2[1]-p1[1])*e2[0]) / denom;
          pts.push([p1[0]+t*e1[0], p1[1]+t*e1[1]]);
        }
      }
    }
    pts.push([ptsM[n-1][0]+norms[n-2][0]*sg*radiusM, ptsM[n-1][1]+norms[n-2][1]*sg*radiusM]);
    return pts;
  }

  const rightPts = buildSide(1);
  const leftPts  = buildSide(-1);
  const ring = [];

  for (const p of rightPts) ring.push(toD(p));
  {
    const ra = Math.atan2(norms[n-2][1], norms[n-2][0]);
    for (let s = 1; s < ARC*2; s++)
      ring.push(toD([ptsM[n-1][0]+Math.cos(ra+Math.PI*s/(ARC*2))*radiusM,
                     ptsM[n-1][1]+Math.sin(ra+Math.PI*s/(ARC*2))*radiusM]));
  }
  for (let i = leftPts.length-1; i >= 0; i--) ring.push(toD(leftPts[i]));
  {
    const la = Math.atan2(-norms[0][1], -norms[0][0]);
    for (let s = 1; s < ARC*2; s++)
      ring.push(toD([ptsM[0][0]+Math.cos(la+Math.PI*s/(ARC*2))*radiusM,
                     ptsM[0][1]+Math.sin(la+Math.PI*s/(ARC*2))*radiusM]));
  }
  ring.push([...ring[0]]);
  return ring;
}

// ── Buffer one feature → Polygon/MultiPolygon feature ──
function _bufferFeature(feat, radiusM) {
  const geom = feat.geometry;
  if (!geom) return null;
  const t = geom.type;
  let outGeom;

  if (t === 'Point') {
    outGeom = { type:'Polygon', coordinates:[_circlePolygon(geom.coordinates[0], geom.coordinates[1], radiusM, 64)] };
  } else if (t === 'MultiPoint') {
    outGeom = { type:'MultiPolygon', coordinates:geom.coordinates.map(c => [_circlePolygon(c[0], c[1], radiusM, 64)]) };
  } else if (t === 'LineString') {
    const ring = _bufferLineRing(geom.coordinates, radiusM);
    if (!ring) return null;
    outGeom = { type:'Polygon', coordinates:[ring] };
  } else if (t === 'MultiLineString') {
    const rings = geom.coordinates.map(c => _bufferLineRing(c, radiusM)).filter(Boolean);
    if (!rings.length) return null;
    outGeom = rings.length === 1
      ? { type:'Polygon', coordinates:[rings[0]] }
      : { type:'MultiPolygon', coordinates:rings.map(r => [r]) };
  } else if (t === 'Polygon') {
    const exterior = _bufferPolygonRing(geom.coordinates[0], radiusM);
    if (!exterior || exterior.length < 4) return null;
    outGeom = { type:'Polygon', coordinates:[exterior, ...geom.coordinates.slice(1)] };
  } else if (t === 'MultiPolygon') {
    const polys = geom.coordinates.map(rings => {
      const ext = _bufferPolygonRing(rings[0], radiusM);
      if (!ext || ext.length < 4) return null;
      return [ext, ...rings.slice(1)];
    }).filter(Boolean);
    if (!polys.length) return null;
    outGeom = polys.length === 1
      ? { type:'Polygon', coordinates:polys[0] }
      : { type:'MultiPolygon', coordinates:polys };
  }

  if (!outGeom) return null;
  return { type:'Feature', geometry:outGeom, properties:{...feat.properties} };
}

// ── Douglas-Peucker simplification ──
function _dpSimplify(pts, tolerance) {
  if (pts.length <= 2) return pts;
  let maxDist = 0, maxIdx = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length-1];
  const abLen = Math.sqrt((bx-ax)**2+(by-ay)**2);
  for (let i = 1; i < pts.length-1; i++) {
    const [px, py] = pts[i];
    const d = abLen === 0
      ? Math.sqrt((px-ax)**2+(py-ay)**2)
      : Math.abs((by-ay)*px-(bx-ax)*py+bx*ay-by*ax)/abLen;
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > tolerance) {
    const l = _dpSimplify(pts.slice(0, maxIdx+1), tolerance);
    const r = _dpSimplify(pts.slice(maxIdx), tolerance);
    return [...l.slice(0,-1), ...r];
  }
  return [pts[0], pts[pts.length-1]];
}

function _simplifyGeom(geom, tol) {
  if (!geom) return geom;
  const s = coords => _dpSimplify(coords, tol);
  const t = geom.type;
  if (t==='LineString') return { ...geom, coordinates: s(geom.coordinates) };
  if (t==='MultiLineString') return { ...geom, coordinates: geom.coordinates.map(s) };
  if (t==='Polygon') return { ...geom, coordinates: geom.coordinates.map(r => s(r).length>=4?s(r):r) };
  if (t==='MultiPolygon') return { ...geom, coordinates: geom.coordinates.map(poly=>poly.map(r=>s(r).length>=4?s(r):r)) };
  return geom;
}

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

// ── WORKER OPERATIONS ─────────────────────────────────────────────────────────

function _workerBuffer({ features, radiusM, merge }) {
  const buffered = features.map(f => _bufferFeature(f, radiusM)).filter(Boolean);
  if (!buffered.length) return [];
  if (merge) {
    const allRings = [];
    buffered.forEach(f => {
      const g = f.geometry;
      if (g.type === 'Polygon') allRings.push(g.coordinates);
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => allRings.push(p));
    });
    return [{ type:'Feature', geometry:{ type:'MultiPolygon', coordinates:allRings }, properties:{} }];
  }
  return buffered;
}

function _workerIntersect({ aFeats, bFeats }) {
  const bRings = [];
  bFeats.forEach(f => {
    const g = f.geometry;
    if (!g) return;
    if (g.type==='Polygon') g.coordinates.forEach(r => bRings.push(r));
    else if (g.type==='MultiPolygon') g.coordinates.forEach(p => p.forEach(r => bRings.push(r)));
  });
  return aFeats.filter(f => bRings.some(ring => _geomIntersectsPolygon(f.geometry, ring)));
}

function _workerUnion({ aFeats, bFeats, aName, bName }) {
  return [
    ...aFeats.map(f => ({ ...f, properties: { ...f.properties, _source: aName } })),
    ...bFeats.map(f => ({ ...f, properties: { ...f.properties, _source: bName } })),
  ];
}

function _workerDissolve({ features, field }) {
  const groups = {};
  features.forEach(f => {
    const key = field && f.properties ? (f.properties[field] ?? '__null__') : '__all__';
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  });
  return Object.entries(groups).map(([key, gFeats]) => {
    const allRings = [];
    gFeats.forEach(f => {
      const g = f.geometry;
      if (!g) return;
      if (g.type==='Polygon') allRings.push(g.coordinates);
      else if (g.type==='MultiPolygon') g.coordinates.forEach(p => allRings.push(p));
    });
    const props = field ? { [field]: key==='__null__'?null:key } : { count: gFeats.length };
    return { type:'Feature', geometry:{ type:'MultiPolygon', coordinates:allRings }, properties:props };
  });
}

function _workerSimplify({ features, tol }) {
  return features.map(f => ({ ...f, geometry: _simplifyGeom(f.geometry, tol) }));
}

function _workerCentroid({ features }) {
  return features.map(f => {
    const c = _geomCentroid(f.geometry);
    if (!c) return null;
    return { type:'Feature', geometry:{ type:'Point', coordinates:c }, properties:{ ...f.properties } };
  }).filter(Boolean);
}

function _workerBounding({ features, btype, perFeature }) {
  function _boundingGeomForPts(pts) {
    if (!pts.length) return null;
    if (btype === 'convex_hull') {
      const hull = _convexHull(pts);
      return hull.length >= 4 ? { type:'Polygon', coordinates:[hull] } : null;
    }
    if (btype === 'bbox') {
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      pts.forEach(([x,y]) => { if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; });
      if (!isFinite(minX)) return null;
      return { type:'Polygon', coordinates:[[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY],[minX,minY]]] };
    }
    if (btype === 'circle') {
      let cx = 0, cy = 0;
      pts.forEach(([x, y]) => { cx += x; cy += y; });
      cx /= pts.length; cy /= pts.length;
      const mPerLat = _metersPerDegLat();
      const mPerLng = _metersPerDegLng(cy);
      let rMetres = 0;
      pts.forEach(([x, y]) => {
        const dx = (x - cx) * mPerLng;
        const dy = (y - cy) * mPerLat;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d > rMetres) rMetres = d;
      });
      if (rMetres === 0) return null;
      return { type: 'Polygon', coordinates: [_circlePolygon(cx, cy, rMetres, 72)] };
    }
    if (btype === 'oriented_bbox') {
      const hull = _convexHull(pts);
      if (hull.length < 3) return null;
      let bestArea = Infinity, bestRect = null;
      for (let i = 0; i < hull.length - 1; i++) {
        const [ax,ay] = hull[i], [bx,by] = hull[i+1];
        const len = Math.sqrt((bx-ax)**2+(by-ay)**2);
        if (len === 0) continue;
        const ux=(bx-ax)/len, uy=(by-ay)/len, vx=-uy, vy=ux;
        let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
        hull.forEach(([px,py])=>{
          const u=(px-ax)*ux+(py-ay)*uy;
          const v=(px-ax)*vx+(py-ay)*vy;
          if(u<minU)minU=u; if(u>maxU)maxU=u;
          if(v<minV)minV=v; if(v>maxV)maxV=v;
        });
        const area=(maxU-minU)*(maxV-minV);
        if(area<bestArea){
          bestArea=area;
          const corners=[[minU,minV],[maxU,minV],[maxU,maxV],[minU,maxV]].map(([u,v])=>
            [ax+u*ux+v*vx, ay+u*uy+v*vy]);
          corners.push(corners[0]);
          bestRect={ type:'Polygon', coordinates:[corners] };
        }
      }
      return bestRect;
    }
    return null;
  }

  const outFeats = [];
  if (perFeature) {
    features.forEach(f => {
      const pts = _collectPoints(f.geometry);
      const geom = _boundingGeomForPts(pts);
      if (geom) outFeats.push({ type:'Feature', geometry:geom, properties:{ ...f.properties } });
    });
  } else {
    const allPts = [];
    features.forEach(f => allPts.push(..._collectPoints(f.geometry)));
    const geom = _boundingGeomForPts(allPts);
    if (geom) outFeats.push({ type:'Feature', geometry:geom, properties:{} });
  }
  return outFeats;
}

// ── MESSAGE DISPATCHER ────────────────────────────────────────────────────────
self.onmessage = function({ data: { id, op, payload } }) {
  try {
    let result;
    switch (op) {
      case 'buffer':    result = _workerBuffer(payload);    break;
      case 'intersect': result = _workerIntersect(payload); break;
      case 'union':     result = _workerUnion(payload);     break;
      case 'dissolve':  result = _workerDissolve(payload);  break;
      case 'simplify':  result = _workerSimplify(payload);  break;
      case 'centroid':  result = _workerCentroid(payload);  break;
      case 'bounding':  result = _workerBounding(payload);  break;
      default: throw new Error('Unknown op: ' + op);
    }
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: e.message });
  }
};
