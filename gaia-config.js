// ═══════════════════════════════════════════════════════════════════════════
//  Gaia Configuration
//
//  ArcGIS Online credentials are also baked into js/agol.js as defaults —
//  this file only needs updating if you deploy Gaia to a different org.
//
//  Redirect URI registered in ArcGIS Online:
//    https://twilliamson-umwelt.github.io/gaia/
//  (must match exactly — no trailing slash difference)
// ═══════════════════════════════════════════════════════════════════════════

const GAIA_CONFIG = {
  version:     '1.0',
  mapTilerKey: 'rw1EkxS93F7pBPgaCfEI',
  agol: {
    clientId:    '2TXWEhK9RGbU6KP4',
    portalUrl:   'https://umweltau.maps.arcgis.com',
    redirectUri: window.location.origin + window.location.pathname,
  },
  defaults: {
    basemap:       'cartodb-light',
    crs:           'EPSG:4326',
    cataloguePath: './catalogue.csv',
  },
};
