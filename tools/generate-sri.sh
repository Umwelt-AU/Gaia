#!/usr/bin/env bash
set -euo pipefail
sri() {
  local url="$1" name="$2" hash
  hash=$(curl -sfL "$url" | openssl dgst -sha384 -binary | openssl base64 -A)
  echo "sha384-${hash}   # ${name}"; echo "    URL: ${url}"; echo
}
echo "=== Gaia CDN SRI Hashes ==="; echo "Generated: $(date -u '+%Y-%m-%d %H:%M UTC')"; echo
sri "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" "leaflet.css"
sri "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" "leaflet.js"
sri "https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.9.0/proj4.js" "proj4.js"
sri "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js" "jszip.min.js"
sri "https://unpkg.com/shapefile@0.6.6/dist/shapefile.js" "shapefile.js"
sri "https://unpkg.com/@tmcw/togeojson@5.8.1/dist/togeojson.umd.js" "togeojson.umd.js"
sri "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js" "xlsx.full.min.js"
sri "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js" "pdf-lib.min.js"
