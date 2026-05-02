# Gaia GIS Explorer — Developer Reference

## Project Overview

Gaia is a self-contained, single-page browser application for interactive GIS data exploration. It requires no server, no build step, and no installation — open `index.html` directly in a browser.

The app is built on **MapLibre GL JS** (vector tile / WebGL map engine) rather than Leaflet. All computation runs client-side.

---

## Running Tests

```bash
npm install
npm test          # vitest run (single pass)
npm run test:watch
```

Tests live in `tests/gaia.test.js`. Because the browser scripts are not ES modules, pure utility functions are copied verbatim into the test file rather than imported. Keep the copies in sync when editing `escHtml`, `_isValidURL`, `_evalFCExpr`, or `urlBaseName` in `js/gaia-utils.js`.

---

## File Structure

```
index.html              Main app (single HTML file, markup + inline CSS)
gaia-config.js          ArcGIS Online OAuth credentials, MapTiler key, and defaults
css/gaia.css            All application styles
js/
  gaia-utils.js         Shared pure utilities: escHtml, urlBaseName, _isValidURL, _evalFCExpr
  gaia-core.js          Global constants, state object, CRS definitions (loads after gaia-utils)
  gaia-map.js           Map initialisation, MapLibre style builder, basemap switcher, CRS modal, resizable panels
  gaia-parsers.js       File drag-and-drop, KML/KMZ, GeoPackage, loaders, progress bar, session import
  gaia-geoprocess.js    Spatial operations (buffer, dissolve, intersect, union, simplify, centroid, hull, PiP)
                        — heavy ops dispatched to gaia-worker.js via Web Worker
  gaia-worker.js        Web Worker: pure geoprocessing math, no DOM access
  gaia-layers.js        Add-layer pipeline (source + paint helpers), layer list UI, layer groups, stats panel
  gaia-attribute.js     Legend, attribute table (virtualised rows, resize/reorder), feature inspector, export, toast
  gaia-services.js      Remote service loaders — GeoJSON URL, WMS, XYZ tiles, ArcGIS REST
  gaia-widgets.js       Measure tool, Select-By-Location, viewshed analysis, elevation profile
  gaia-ui.js            Attribute-table layer selector, floating export panel, layer context menu, labelling
  gaia-draw.js          Create Features panel (draw point/line/polygon, edit attributes), Design QA widget
  gaia-session.js       localStorage session persistence, export session as shareable URL (LZ compression)
  gaia-symbology.js     Layer symbology picker (fill/outline/no-fill), classify (graduated/categorised)
  gaia-export-map.js    PNG map export, PDF Umwelt template export
  gaia-tools.js         CSV loader (auto-detect lat/lng/WKT), create-features undo/redo, service catalogue
  agol.js               ArcGIS Online OAuth + REST API (search, folders, feature layers, hosted layers)
  umwelt-logo.js        Umwelt 2024 logo as base-64 constant (_UMWELT_LOGO_2024_B64)
  template-pdf.js       Embedded PDF template assets
package.json            Dev-only (vitest)
tests/gaia.test.js      Unit tests for pure utility functions
tools/generate-sri.sh   Helper to regenerate SRI hashes for CDN <script> tags
catalogue.csv           Default layer catalogue (group, name, URL)
```

### Script load order in index.html

```
1. CDN libraries     (MapLibre GL, Proj4js, JSZip, shapefile.js, toGeoJSON, xlsx.js, sql.js, pdf-lib)
2. js/umwelt-logo.js
3. gaia-config.js
4. js/gaia-utils.js        ← must be first gaia script (shared utils used by all others)
5. js/gaia-core.js         ← defines state, CONSTANTS, CRS_DEFS
6. js/gaia-map.js
7. js/gaia-parsers.js
8. js/gaia-geoprocess.js
9. js/gaia-layers.js
10. js/gaia-attribute.js
11. js/gaia-services.js
12. js/gaia-widgets.js
13. js/gaia-ui.js
14. js/gaia-draw.js
15. js/gaia-session.js
16. js/gaia-symbology.js
17. js/gaia-export-map.js
18. js/gaia-tools.js
19. js/agol.js
```

`gaia-worker.js` is loaded dynamically by `_gpSend()` in `gaia-geoprocess.js` — no explicit script tag needed.

All scripts share the global (window) scope — there are no ES modules. Load order matters only for top-level expressions; function declarations are hoisted.

---

## Key Globals

| Symbol | Defined in | Purpose |
|--------|-----------|---------|
| `state` | `gaia-core.js` | Central app state: `layers[]`, `map`, `activeLayerIndex`, sort/filter state |
| `CONSTANTS` | `gaia-core.js` | Timeout durations, size thresholds, padding values |
| `LAYER_COLORS` | `gaia-core.js` | Auto-assigned layer colour palette |
| `CRS_DEFS` | `gaia-core.js` | proj4 strings keyed by EPSG code |
| `agol` | `agol.js` | ArcGIS Online OAuth token and search state |
| `GAIA_CONFIG` | `gaia-config.js` | Deployment config (clientId, portalUrl, redirectUri, mapTilerKey) |

Each `state.layers[]` entry has the shape:
```js
{
  name, geojson,           // raw data
  mapSourceId, mapLayerIds,// MapLibre source/layer IDs
  color, visible,
  labelField, labelVisible,
  symbology,               // 'simple' | 'classify'
  classifyConfig,          // graduated/categorised rules
  selectedIndices: Set,
}
```

---

## UI Layout

### Right panel
The right panel (`#right-panel`) has three sections, top-to-bottom:
1. **Action buttons** — Export PNG, Export PDF, Create Features, Widgets
2. **Layer Stats** (`#stats-section`) — compact inline row: `N features  N fields  Type  CRS`. Shown only when a layer is active. Collapsible via the panel header chevron.
3. **Attributes** (`#attr-panel-section`) — shows the selected feature's field/value pairs as a scrollable vertical two-column table (field | value). Populated by `showFeatureInspector(feat)` whenever a feature is clicked on the map. Collapsible via the panel header chevron.

### Bottom attribute table (`#attr-strip`)
The full multi-row attribute table. **Hidden by default** — not auto-opened when a layer is activated. Two ways to open it:
- Map overlay button `#attr-table-map-btn` (⊟ icon, below the legend toggle button) — calls `toggleAttrTable()`
- Right-click a layer in the layer list → "Open Attribute Table"

`openAttrTable()` / `closeAttrTable()` / `toggleAttrTable()` all live in `gaia-session.js` and keep the `#attr-table-map-btn` active state in sync.

A spinner (`#attr-table-spinner`) appears in the header while `renderTable()` is building the table DOM, then hides on completion.

### Map overlay buttons (absolute-positioned inside `#map`)
| Button | ID | Position | Function |
|--------|----|----------|----------|
| Toggle Legend | `#legend-map-btn` | left:10px, top:103px | `toggleMapLegend()` in `gaia-widgets.js` |
| Toggle Attribute Table | `#attr-table-map-btn` | left:10px, top:138px | `toggleAttrTable()` in `gaia-session.js` |

Both buttons have an `.active` class when their panel is open. Styles (including dark-mode overrides) are in `css/gaia.css`.

---

## Web Worker (geoprocessing)

Heavy spatial operations are offloaded to `js/gaia-worker.js` to keep the UI responsive:

- `gaia-worker.js` contains copies of all pure math functions (no DOM access)
- The worker handles: `buffer`, `intersect`, `union`, `dissolve`, `simplify`, `centroid`, `bounding`
- The main thread sends `{ id, op, payload }` messages; the worker replies `{ id, result }` or `{ id, error }`
- `_gpSend(op, payload)` in `gaia-geoprocess.js` manages the single shared worker instance and returns a Promise
- All `run*` geoprocessing UI functions are `async` and disable their Run button while the worker is busy

---

## Attribute Table Virtualisation

`renderTable()` in `gaia-attribute.js` uses windowed rendering to handle large datasets efficiently:

- Only rows visible in the scroll viewport (plus a `BUFFER` of 40 rows each side) are rendered as real `<tr>` elements
- Unrendered rows above and below are represented by spacer `<tr class="vt-spacer">` elements with a calculated height
- State is stored in the `_vt` object: `{ rows, start, end, layerIdx, orderedFields, widths, ftc, ROW_H, BUFFER }`
- `_vtRenderWindow(forceScroll)` recalculates the visible window on each scroll event

---

## Architecture Notes

- **No build step.** Files are loaded as plain `<script>` tags. Adding a bundler is not planned.
- **MapLibre GL JS 3.6** is the map engine. Leaflet is not used.
- **3D terrain** uses MapTiler terrain-rgb-v2. The API key is stored in `gaia-config.js` as `GAIA_CONFIG.mapTilerKey`.
- **Proj4js** handles all CRS reprojection. All data is stored and rendered in WGS84; reprojection happens at export time.
- **GeoPackage** support uses `sql.js` (SQLite via WASM). The sql-wasm.wasm file is loaded from the CDN script tag.
- **SRI hashes** in `index.html` CDN `<script>` tags are real SHA-384 hashes. Run `tools/generate-sri.sh` to regenerate after a CDN version bump.
- The `_evalFCExpr` field-calculator sandbox blocks `window`, `document`, `fetch`, `globalThis`, and other dangerous globals by passing `undefined` for those parameters.

---

## External Libraries (CDN)

| Library | Version | Purpose |
|---------|---------|---------|
| MapLibre GL JS | 3.6.2 | Map rendering (WebGL) |
| Proj4js | 2.9.0 | CRS reprojection |
| JSZip | 3.10.1 | ZIP/KMZ extraction |
| shapefile.js | 0.6.6 | Shapefile parsing |
| toGeoJSON | 5.8.1 | KML/GPX → GeoJSON |
| xlsx.js | 0.18.5 | Excel reading (catalogue) |
| sql.js | 1.10.3 | GeoPackage (SQLite WASM) |
| pdf-lib | 1.17.1 | PDF map export |

---

## ArcGIS Online Integration

Configured via `gaia-config.js`. The OAuth redirect URI must be registered exactly (no trailing slash difference) in the ArcGIS Online app registration. `agol.js` falls back to built-in defaults if `GAIA_CONFIG` is absent.

All AGOL REST calls use POST to `www.arcgis.com` (not the org portal URL) for correct CORS behaviour.

---

## Coding Conventions

- Vanilla JS, no framework, no TypeScript.
- `const` / `let` throughout; no `var`.
- DOM manipulation is direct (`getElementById`, `querySelector`).
- Pure spatial functions (geoprocessing, geometry math) take and return plain GeoJSON objects — no side effects.
- UI functions manipulate the DOM and call `updateLayerList()` / `updateLegend()` / `updateAttrTable()` to re-render.
- `toast(message, type)` for user feedback (`'success'`, `'error'`, `'info'`).
- Async operations use `async/await` with `try/catch`; network calls respect `CONSTANTS.FETCH_TIMEOUT_MS` via `AbortController`.
