# 🗺️ Gaia GIS Explorer — Portable Data Explorer
**Version 1.0 · Self-Contained Browser Application**

---

## Quick Start

1. **Unzip** this folder anywhere on your computer
2. **Open** `index.html` in a modern web browser (Chrome, Firefox, Edge, Safari)
3. **Drop your GIS files** onto the app and start exploring

No installation. No internet required (after first load). No server needed.

---

## Supported Formats

| Format | Extensions | Notes |
|--------|-----------|-------|
| **Shapefile** | `.shp` + `.dbf` + `.prj` (optional) | Drop all components together |
| **KML** | `.kml` | Google Earth format |
| **KMZ** | `.kmz` | Compressed KML |
| **GeoJSON** | `.geojson`, `.json` | RFC 7946 compliant |
| **CSV** | `.csv`, `.txt` | Auto-detects lat/lng or WKT geometry columns |
| **ZIP Archive** | `.zip` | Auto-detects SHP, KML, GeoJSON, or GPKG inside |
| **GeoPackage** | `.gpkg` | SQLite-based; layer picker for multi-layer files |
| **FileGDB** | `.zip` containing `.gdb` | Partial support — export from ArcGIS/QGIS first |

### Loading Shapefiles
Shapefiles consist of multiple files. Drop **all of them at once**:
- `mydata.shp` — geometry
- `mydata.dbf` — attributes  
- `mydata.prj` — coordinate reference system *(recommended)*
- `mydata.shx` — index (optional)
- `mydata.cpg` — encoding (optional)

Or zip them all together and drop the `.zip`.

---

## Features

### 🗺️ Interactive Map
- Pan, zoom, and explore your data on a basemap
- 3D terrain with hillshade (toggle pitch via navigation controls)
- Click any feature to inspect its properties in the right panel
- Multiple basemap options (Light, Dark, Satellite, Topo, OSM, and more)
- Coordinate display as you hover

### ◧ Layer Management
- Load multiple layers simultaneously
- Toggle visibility on/off per layer
- Drag layers to reorder them
- Group layers with custom group names
- Each layer gets a unique colour, fully customisable via symbology

### ⊕ Coordinate Systems
Built-in support for:
- **WGS84** (EPSG:4326) — default geographic
- **Web Mercator** (EPSG:3857)
- **GDA94 / MGA** Zones 54–56 (EPSG:28354–28356)
- **GDA2020 / MGA** Zones 54–56 (EPSG:7854–7856)
- **GDA94 Geographic** (EPSG:4283)
- **GDA2020 Geographic** (EPSG:7844)
- **WGS84 UTM** multiple zones
- **NAD83** (US)
- Custom EPSG codes and proj4 strings

> **Note:** All data is reprojected to WGS84 for map display. Export uses your chosen output CRS.

### ◎ Attributes Panel (right panel)
- Click any feature on the map to see its field/value pairs in the right panel
- Vertical scrolling Field | Value layout — no horizontal scrolling
- Collapses with the panel header chevron

### ⊟ Attribute Table (bottom strip)
- Full multi-row table for the active layer
- Open via the **⊟ button** on the map (bottom-left overlay) or right-click a layer → Open Attribute Table
- Sort by column header, search/filter across all fields
- Shift-click and Ctrl-click row selection
- Select By Attribute query builder
- Field Calculator for computed columns

### 🎨 Symbology
- Simple fill/outline/point styling per layer
- Graduated and categorised classification
- Label features by any field

### ↓ Export
Export any layer to:
| Format | Description |
|--------|-------------|
| **GeoJSON** | Standard interchange format |
| **KML** | Google Earth / Maps compatible |
| **CSV** | Spreadsheet-friendly with WKT geometry column |
| **WKT** | Well-Known Text geometry format |

Choose your output CRS independently of the display CRS.

Export the **map view** to:
- **PNG** — with optional title
- **PDF** — Umwelt A4 landscape template with legend, scale bar, and logo

### 🔧 Widgets
- **Measure** — distance and area on the map
- **Select By Location** — spatial selection (intersect, within, buffer)
- **Viewshed Analysis** — line-of-sight visibility from a point
- **Elevation Profile** — terrain cross-section along a drawn line

### 🔗 Remote Services
Load data directly from URLs:
- GeoJSON / GeoJSON API endpoints
- WMS (Web Map Service) — as a tiled overlay
- XYZ tile layers
- ArcGIS REST Feature Services

### 🗂️ Service Catalogue
Browse and load layers from a curated `catalogue.csv` — useful for team deployments where common datasets are pre-listed.

### 📤 Session Persistence
- Layers, symbology and settings are auto-saved to `localStorage` and restored on next open
- **Export Session** — saves a `.gaia` file capturing everything; drag it back in to restore
- **Share URL** — compresses the session into the URL hash for sharing

---

## Tips

- **Large files:** Files with 10,000+ features may be slow to render. Use search/filter in the attribute table to work with subsets.
- **Encoding:** If attribute text looks garbled, include the `.cpg` file with your shapefile
- **PRJ files:** Always include `.prj` for correct reprojection
- **GDB support:** FileGDB is binary — export layers from ArcGIS or QGIS to Shapefile/GeoJSON first
- **Offline:** Download the CDN libraries to `lib/` and update the script tags in `index.html` — see `lib/INSTRUCTIONS.txt`

---

## Technical Notes

This app uses these open-source libraries (loaded from CDN on first use):

| Library | Purpose |
|---------|---------|
| [MapLibre GL JS](https://maplibre.org/) | Map rendering (WebGL, 3D terrain) |
| [Proj4js](https://proj4js.org/) | CRS reprojection |
| [shapefile.js](https://github.com/mbostock/shapefile) | Shapefile parsing |
| [toGeoJSON](https://github.com/tmcw/togeojson) | KML/GPX conversion |
| [JSZip](https://stuk.github.io/jszip/) | ZIP/KMZ extraction |
| [xlsx.js](https://sheetjs.com/) | Excel/CSV reading (catalogue) |
| [sql.js](https://sql.js.org/) | GeoPackage (SQLite via WASM) |
| [pdf-lib](https://pdf-lib.js.org/) | PDF map export |

### Offline Use
For fully offline use, download the libraries and update the `<script>` and `<link>` tags in `index.html` to point to local files in the `lib/` folder. See `lib/INSTRUCTIONS.txt`.

---

## Limitations

- FileGDB requires pre-export to an open format
- Very large datasets (>50MB) may be slow depending on your machine
- No server-side processing — all computation is in your browser
- Raster data (GeoTIFF, etc.) is not supported

---

*Built as a portable, dependency-free GIS inspection tool.*  
*Open source libraries used under their respective licenses.*
