# 🗺️ GIS Inspector — Portable Data Explorer
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
| **ZIP Archive** | `.zip` | Auto-detects SHP, KML, or GeoJSON inside |
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
- Click any feature to inspect its properties
- Multiple basemap options (OSM, Satellite, Topo, Dark, Light)
- Coordinate display as you hover

### ◧ Layer Management
- Load multiple layers simultaneously
- Toggle visibility on/off per layer
- Each layer gets a unique colour
- Remove individual layers

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

### ⊟ Attribute Table
- View all feature attributes in a sortable table
- Click column headers to sort
- Search/filter across all attributes
- Click any row to select and inspect that feature

### ◎ Feature Inspector
- Detailed view of selected feature properties
- Geometry type and vertex count
- Auto-detects field types (string, number, boolean)

### ↓ Export
Export any layer to:
| Format | Description |
|--------|-------------|
| **GeoJSON** | Standard interchange format |
| **KML** | Google Earth / Maps compatible |
| **CSV** | Spreadsheet-friendly with WKT geometry column |
| **WKT** | Well-Known Text geometry format |

Choose your output CRS independently of the display CRS.

---

## Tips

- **Large files:** Files with 10,000+ features may be slow to render
- **Encoding:** If attribute text looks garbled, include the `.cpg` file with your shapefile
- **PRJ files:** Always include `.prj` for correct reprojection
- **GDB support:** FileGDB is binary — export layers from ArcGIS or QGIS to Shapefile/GeoJSON first

---

## Technical Notes

This app uses these open-source libraries (loaded from CDN on first use):
- [Leaflet](https://leafletjs.com/) — Map rendering
- [Proj4js](https://proj4js.org/) — CRS reprojection  
- [shapefile.js](https://github.com/mbostock/shapefile) — Shapefile parsing
- [toGeoJSON](https://github.com/tmcw/togeojson) — KML/GPX conversion
- [JSZip](https://stuk.github.io/jszip/) — ZIP/KMZ extraction

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
