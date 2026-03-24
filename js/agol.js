// ═══════════════════════════════════════════════════════════════════════════
//  GAIA — ArcGIS Online Integration  (agol.js)
//
//  OAuth 2.0 Implicit Flow — static hosting, no server needed.
//  All API calls use POST (required by AGOL CORS policy).
//
//  SETUP: edit gaia-config.js — see comments there.
// ═══════════════════════════════════════════════════════════════════════════

// ── Resolve config ──────────────────────────────────────────────────────
// Reads from gaia-config.js if present, otherwise uses built-in defaults below.
const _AGOL_DEFAULTS = {
  clientId:    '2TXWEhK9RGbU6KP4',
  portalUrl:   'https://umweltau.maps.arcgis.com',
  redirectUri: window.location.origin + window.location.pathname,
};
const AGOL_CONFIG = (typeof GAIA_CONFIG !== 'undefined' && GAIA_CONFIG.agol && GAIA_CONFIG.agol.clientId)
  ? GAIA_CONFIG.agol
  : _AGOL_DEFAULTS;

// ── Module state ─────────────────────────────────────────────────────────
const agol = {
  token:        null,
  expires:      null,
  username:     null,
  orgId:        null,
  fullName:     null,
  orgName:      null,
  searchQuery:  '',
  searchStart:  1,
  searchTotal:  0,
  pageSize:     50,
  scope:        'mine',  // 'mine' | 'org' | 'groups'
  currentFolder: null,
  currentFolderName: null,
};

// ─────────────────────────────────────────────────────────────────────────
//  CORE HELPERS
// ─────────────────────────────────────────────────────────────────────────

// REST API base — always www.arcgis.com regardless of org portal URL.
// AGOL org tokens work on www.arcgis.com, and www.arcgis.com has correct
// CORS headers for cross-origin POST from any origin.
// The org portal URL (umweltau.maps.arcgis.com) is only used for the OAuth
// authorize redirect — not for REST API calls.
function _agolApiBase() {
  // If the user has configured a non-arcgis.com portal (ArcGIS Enterprise),
  // use that. Otherwise always use www.arcgis.com for ArcGIS Online.
  const p = AGOL_CONFIG.portalUrl.replace(/\/+$/, '');
  if (p.includes('arcgis.com')) return 'https://www.arcgis.com';
  return p;  // Enterprise portal — use as-is
}

async function _agolPost(path, params = {}) {
  const url  = _agolApiBase() + path;
  const body = new URLSearchParams({ f: 'json', token: agol.token, ...params });
  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
  const data = await resp.json();
  if (data.error) {
    const msg = data.error.message || data.error.details || JSON.stringify(data.error);
    throw new Error(msg);
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────
//  TOKEN MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────
function agolSignIn() {
  if (!AGOL_CONFIG.clientId) {
    alert('ArcGIS Online not configured.\n\nPlease set clientId in gaia-config.js and reload.');
    return;
  }
  const redirectUri = AGOL_CONFIG.redirectUri ||
    window.location.href.split('?')[0].split('#')[0];

  // Save the current map session before redirecting so layers are restored
  // when the page reloads after OAuth completes.
  if (typeof saveSession === 'function') saveSession();

  const params = new URLSearchParams({
    client_id:     AGOL_CONFIG.clientId,
    response_type: 'token',
    redirect_uri:  redirectUri,
    expiration:    120,  // minutes
  });
  window.location.href =
    AGOL_CONFIG.portalUrl.replace(/\/+$/, '') +
    '/sharing/rest/oauth2/authorize?' + params.toString();
}

function agolSignOut() {
  agol.token = null; agol.expires = null;
  agol.username = null; agol.orgId = null;
  agol.fullName = null; agol.orgName = null;
  agol.currentFolder = null; agol.currentFolderName = null;
  agol.searchQuery = ''; agol.searchStart = 1;
  agol.scope = 'mine';
  try { sessionStorage.removeItem('gaia_agol_token'); } catch(e) {}
  _agolUpdateUI();
  toast('Signed out of ArcGIS Online', 'info');
}

/** Called on page load — reads token from hash (post-redirect) or sessionStorage */
async function agolInit() {
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    const p = new URLSearchParams(hash.replace(/^#/, ''));
    const token   = p.get('access_token');
    const expires = p.get('expires_in');
    if (token) {
      agol.token   = token;
      agol.expires = Date.now() + parseInt(expires || 7200) * 1000;
      // AGOL includes username directly in the redirect hash — grab it now
      // so we never need to call /community/self just to get the username
      const hashUsername = p.get('username');
      if (hashUsername) {
        agol.username = hashUsername;
        agol.fullName = hashUsername;
      }
      try {
        sessionStorage.setItem('gaia_agol_token', JSON.stringify({
          token:    agol.token,
          expires:  agol.expires,
          username: agol.username || '',
        }));
      } catch(e) {}
      // Clean hash from URL
      history.replaceState(null, '', window.location.pathname + window.location.search);
      // Fetch full name / org name in background (non-blocking)
      _agolFetchSelf();
      // Open the URL modal on the AGOL tab so the user lands back in the right place
      _agolOpenModalOnReturn();
      return;
    }
  }

  try {
    const stored = sessionStorage.getItem('gaia_agol_token');
    if (stored) {
      const d = JSON.parse(stored);
      if (d.expires > Date.now() + 60000) {
        agol.token   = d.token;
        agol.expires = d.expires;
        // Restore username from storage so content can load immediately
        if (d.username) {
          agol.username = d.username;
          agol.fullName = d.username;
        }
        // Fetch full name / org details in background
        _agolFetchSelf();
        // Don't open the modal — user didn't click, just refreshed the page
        return;
      }
    }
  } catch(e) {}
}

/** After OAuth redirect: open the modal on the AGOL tab */
function _agolOpenModalOnReturn() {
  // Open the URL modal if it isn't already open
  const bd = document.getElementById('url-backdrop');
  if (bd && !bd.classList.contains('open')) {
    bd.classList.add('open');
  }
  // Switch to AGOL tab
  if (typeof setURLType === 'function') {
    setURLType('agol');
  } else {
    // setURLType not yet available (script load order) — defer
    setTimeout(function() {
      if (typeof setURLType === 'function') setURLType('agol');
    }, 100);
  }
}

/** Enrich profile (fullName, orgName) via GET /community/self.
 *  Username is already set from the OAuth hash — this just adds display name.
 *  Never blocks content loading.
 */
async function _agolFetchSelf() {
  if (!agol.token) return;
  const api = _agolApiBase();
  try {
    const selfUrl = api + '/sharing/rest/community/self?f=json&token=' + encodeURIComponent(agol.token);
    const resp = await fetch(selfUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    agol.username = data.username;
    agol.orgId    = data.orgId;
    agol.fullName = data.fullName || data.username;
    try {
      const stored = sessionStorage.getItem('gaia_agol_token');
      if (stored) {
        const d = JSON.parse(stored);
        d.username = agol.username;
        sessionStorage.setItem('gaia_agol_token', JSON.stringify(d));
      }
    } catch(e) {}
    if (data.orgId) {
      try {
        const orgUrl = api + '/sharing/rest/portals/' + data.orgId + '?f=json&token=' + encodeURIComponent(agol.token);
        const orgResp = await fetch(orgUrl);
        const orgData = await orgResp.json();
        agol.orgName = orgData.name || '';
      } catch(e) {}
    }
  } catch(e) {
    console.warn('AGOL /community/self:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  UI
// ─────────────────────────────────────────────────────────────────────────
function _agolUpdateUI() {
  const pane = document.getElementById('agol-pane');
  if (!pane) return;

  // If no token in memory, check sessionStorage (tab may have just been opened)
  if (!agol.token) {
    try {
      const stored = sessionStorage.getItem('gaia_agol_token');
      if (stored) {
        const d = JSON.parse(stored);
        if (d.expires > Date.now() + 60000) {
          agol.token   = d.token;
          agol.expires = d.expires;
          // Fetch username then re-render
          pane.innerHTML = `<div style="padding:20px;text-align:center;font-family:var(--mono);font-size:10px;color:var(--text3);">Connecting…</div>`;
          _agolFetchSelf().then(() => _agolUpdateUI());
          return;
        }
      }
    } catch(e) {}
    // No valid token — show sign-in
    pane.innerHTML = _agolRenderSignIn();
    return;
  }

  // Have token but no username yet — do a synchronous self-fetch attempt then render
  if (!agol.username) {
    pane.innerHTML = `<div style="padding:20px;text-align:center;font-family:var(--mono);font-size:10px;color:var(--text3);">Connecting…</div>`;
    _agolFetchSelf().then(function() {
      // After fetch (success or failure, username is now set), re-render
      const p = document.getElementById('agol-pane');
      if (!p) return;
      p.innerHTML = _agolRenderBrowser();
      _agolFetchContent();
    });
    return;
  }

  pane.innerHTML = _agolRenderBrowser();
  _agolFetchContent();
}

function _agolRenderSignIn() {
  const configured = !!(AGOL_CONFIG.clientId);
  return `
    <div style="padding:28px 20px;text-align:center;">
      <div style="font-size:36px;margin-bottom:10px;">🌐</div>
      <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;">
        ArcGIS Online
      </div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-bottom:18px;line-height:1.7;">
        ${configured
          ? 'Sign in with your organisational credentials to browse and load your layers.'
          : '⚠ Not configured — set your <code>clientId</code> in <code>gaia-config.js</code>'}
      </div>
      ${configured
        ? `<button class="btn btn-primary" onclick="agolSignIn()"
             style="padding:9px 28px;font-family:var(--mono);font-size:11px;font-weight:600;">
             Sign In
           </button>
           <div style="font-family:var(--mono);font-size:9px;color:var(--text3);margin-top:10px;line-height:1.6;">
             Your organisation's login page will open in this tab.<br/>
             Gaia never handles your password.
           </div>
           <div style="font-family:var(--mono);font-size:9px;color:#e8a87c;margin-top:10px;line-height:1.6;padding:8px 10px;border:1px solid rgba(232,168,124,0.3);border-radius:5px;background:rgba(232,168,124,0.07);">
             ⚠ Logging in to ArcGIS Online will refresh your map state — removing your current active layers.
           </div>`
        : `<a href="gaia-config.js" target="_blank"
             style="font-family:var(--mono);font-size:10px;color:var(--teal);">
             Open gaia-config.js →
           </a>`
      }
    </div>`;
}

function _agolRenderBrowser() {
  const expiryMins = agol.expires
    ? Math.max(0, Math.round((agol.expires - Date.now()) / 60000))
    : null;
  const expiryStr = expiryMins !== null
    ? (expiryMins > 60 ? `~${Math.round(expiryMins/60)}h` : `${expiryMins}m`) : '?';

  // Breadcrumb (only relevant for My Content folder browsing)
  let crumb = '';
  if (agol.scope === 'mine') {
    crumb = `<span onclick="agolGoHome()" style="cursor:pointer;color:var(--teal);">🏠 My Content</span>`;
    if (agol.currentFolderName) {
      crumb += `<span style="margin:0 4px;color:var(--text3);">›</span>
        <span style="color:var(--text2);">${escHtml(agol.currentFolderName)}</span>`;
    }
  }

  const scopeLabels = { mine:'👤 My Content', org:'🏢 Organisation' };
  const scopeTabs = Object.keys(scopeLabels).map(s => `
    <div onclick="agolSetScope('${s}')"
      style="padding:7px 12px;font-family:var(--mono);font-size:9px;cursor:pointer;white-space:nowrap;
             flex:1;text-align:center;
             border-bottom:3px solid ${agol.scope===s ? 'var(--teal)' : 'transparent'};
             background:${agol.scope===s ? 'var(--bg)' : 'transparent'};
             color:${agol.scope===s ? 'var(--teal)' : 'var(--text3)'};
             font-weight:${agol.scope===s ? '600' : '400'};"
      onmouseover="if('${s}'!==agol.scope)this.style.color='var(--text2)'"
      onmouseout="if('${s}'!==agol.scope)this.style.color='var(--text3)'">
      ${scopeLabels[s]}
    </div>`).join('');

  const placeholder = agol.scope === 'mine' ? 'Search my content…' : 'Search organisation…';

  return `
    <!-- User bar -->
    <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;
                background:var(--bg3);border-bottom:1px solid var(--border);">
      <span style="color:var(--teal);font-size:11px;">●</span>
      <div style="flex:1;min-width:0;">
        <div style="font-family:var(--mono);font-size:10px;font-weight:600;color:var(--text);
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escHtml(agol.fullName || agol.username)}
        </div>
        <div style="font-family:var(--mono);font-size:8px;color:var(--text3);">
          ${escHtml(agol.orgName || AGOL_CONFIG.portalUrl)} · token ${expiryStr}
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="agolSignOut()"
        style="font-size:9px;padding:2px 8px;flex-shrink:0;">Sign Out</button>
    </div>

    <!-- Scope tabs -->
    <div style="display:flex;border-bottom:1px solid var(--border);background:var(--bg2);">
      ${scopeTabs}
    </div>

    <!-- Search -->
    <div style="padding:6px 8px;border-bottom:1px solid var(--border);display:flex;gap:6px;">
      <input type="text" id="agol-search-input" value="${escHtml(agol.searchQuery)}"
        placeholder="${placeholder}"
        style="flex:1;padding:4px 8px;font-family:var(--mono);font-size:10px;
               border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--text);"
        onkeydown="if(event.key==='Enter')agolSearch()"/>
      <button class="btn btn-ghost btn-sm" onclick="agolSearch()"
        style="font-size:10px;padding:3px 10px;">🔍</button>
      ${agol.searchQuery ? `<button class="btn btn-ghost btn-sm" onclick="agolClearSearch()"
        style="font-size:10px;padding:3px 8px;">✕</button>` : ''}
    </div>

    ${crumb ? `<div style="padding:5px 12px;border-bottom:1px solid var(--border);
                font-family:var(--mono);font-size:9px;display:flex;align-items:center;gap:4px;">
      ${crumb}</div>` : ''}

    <!-- Results -->
    <div id="agol-results" style="overflow-y:auto;max-height:360px;">
      <div style="padding:16px;text-align:center;font-family:var(--mono);font-size:10px;color:var(--text3);">
        Loading…
      </div>
    </div>

    <!-- Pagination -->
    <div id="agol-pagination" style="display:none;padding:6px 12px;border-top:1px solid var(--border);
      display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:9px;color:var(--text3);">
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
//  BROWSING
// ─────────────────────────────────────────────────────────────────────────
async function agolSetScope(scope) {
  agol.scope = scope;
  agol.searchQuery = '';
  agol.searchStart = 1;
  agol.currentFolder = null;
  agol.currentFolderName = null;
  const pane = document.getElementById('agol-pane');
  if (pane) pane.innerHTML = _agolRenderBrowser();
  _agolFetchContent();
}


function agolSearch() {
  const el = document.getElementById('agol-search-input');
  agol.searchQuery = el ? el.value.trim() : '';
  agol.searchStart = 1;
  agol.currentFolder = null;
  agol.currentFolderName = null;
  _agolFetchContent();
}

function agolClearSearch() {
  agol.searchQuery = '';
  agol.searchStart = 1;
  _agolFetchContent();
  // Re-render so the ✕ button disappears
  const pane = document.getElementById('agol-pane');
  if (pane) pane.innerHTML = _agolRenderBrowser();
  _agolFetchContent();
}

function agolGoHome() {
  agol.currentFolder = null;
  agol.currentFolderName = null;
  agol.searchStart = 1;
  // Re-render browser (resets breadcrumb)
  const pane = document.getElementById('agol-pane');
  if (pane) pane.innerHTML = _agolRenderBrowser();
  _agolFetchContent();
}

async function agolOpenFolder(folderId, folderName) {
  agol.currentFolder = folderId;
  agol.currentFolderName = folderName;
  agol.searchStart = 1;
  agol.searchQuery = '';
  // Re-render browser (updates breadcrumb)
  const pane = document.getElementById('agol-pane');
  if (pane) pane.innerHTML = _agolRenderBrowser();
  _agolFetchContent();
}

function agolPage(dir) {
  agol.searchStart = Math.max(1, agol.searchStart + dir * agol.pageSize);
  _agolFetchContent();
}

async function _agolFetchContent() {
  const el = document.getElementById('agol-results');
  if (!el) return;
  el.innerHTML = `<div style="padding:16px;text-align:center;font-family:var(--mono);font-size:10px;color:var(--text3);">Loading…</div>`;

  try {
    // If username not yet resolved (self-fetch still in flight), wait for it
    if (!agol.username) {
      await _agolFetchSelf();
      if (!agol.username) throw new Error('Could not resolve your ArcGIS Online username. Please sign out and sign in again.');
    }
    const data = await _agolQueryItems();
    _agolRenderItems(data);
  } catch(e) {
    el.innerHTML = `
      <div style="padding:14px 12px;font-family:var(--mono);font-size:10px;color:var(--red);">
        <div style="font-weight:600;margin-bottom:4px;">Failed to load content</div>
        <div style="color:var(--text3);font-size:9px;">${escHtml(e.message)}</div>
        <div style="margin-top:8px;">
          <button class="btn btn-ghost btn-sm" onclick="_agolFetchContent()"
            style="font-size:9px;">↻ Retry</button>
          <button class="btn btn-ghost btn-sm" onclick="agolSignOut()"
            style="font-size:9px;margin-left:6px;">Sign Out</button>
        </div>
      </div>`;
  }
}

async function _agolQueryItems() {
  const layerTypes = [
    'Feature Service', 'Map Service', 'Vector Tile Service',
    'WMS', 'WFS', 'Feature Collection',
  ].map(t => `type:"${t}"`).join(' OR ');

  const typeFilter = `(${layerTypes})`;
  const searchFilter = agol.searchQuery
    ? ` AND (title:"${agol.searchQuery}" OR tags:"${agol.searchQuery}")`
    : '';

  // ── My Content — folder browse ─────────────────────────
  if (agol.scope === 'mine' && agol.currentFolder) {
    if (!agol.username) throw new Error('Not signed in.');
    const data = await _agolPost(
      `/sharing/rest/content/users/${agol.username}/${agol.currentFolder}`
    );
    const items = (data.items || []).filter(i => _agolCanLoad(i.type));
    return { results: items, total: items.length };
  }

  // ── My Content — root ──────────────────────────────────
  if (agol.scope === 'mine') {
    if (!agol.username) {
      throw new Error('Not signed in. Please sign out and sign in again.');
    }
    const q = `${typeFilter} AND owner:${agol.username}${searchFilter}`;
    const searchData = await _agolPost('/sharing/rest/search', {
      q, num: agol.pageSize, start: agol.searchStart,
      sortField:'modified', sortOrder:'desc',
    });
    agol.searchTotal = searchData.total || 0;
    const items = searchData.results || [];
    let folders = [];
    if (!agol.searchQuery) {
      try {
        const ud = await _agolPost(`/sharing/rest/content/users/${agol.username}`);
        folders = (ud.folders || []).map(f => ({ ...f, _isFolder: true }));
      } catch(e) {}
    }
    return { results: [...folders, ...items], total: agol.searchTotal, folders: folders.length };
  }

  // ── Organisation ────────────────────────────────────────
  if (agol.scope === 'org') {
    // Ensure we have orgId — re-fetch self if needed
    if (!agol.orgId) {
      await _agolFetchSelf();
      if (!agol.orgId) throw new Error('Could not determine organisation ID. Try signing out and back in.');
    }
    const q = `${typeFilter} AND orgid:${agol.orgId}${searchFilter}`;
    const searchData = await _agolPost('/sharing/rest/search', {
      q, num: agol.pageSize, start: agol.searchStart,
      sortField:'modified', sortOrder:'desc',
    });
    agol.searchTotal = searchData.total || 0;
    return { results: searchData.results || [], total: agol.searchTotal };
  }

  return { results: [], total: 0 };
}

// ─────────────────────────────────────────────────────────────────────────
//  RENDERING
// ─────────────────────────────────────────────────────────────────────────
function _agolRenderItems({ results, total, folders = 0 }) {
  const el    = document.getElementById('agol-results');
  const pagEl = document.getElementById('agol-pagination');
  if (!el) return;

  if (!results.length) {
    el.innerHTML = `
      <div style="padding:20px;text-align:center;font-family:var(--mono);font-size:10px;color:var(--text3);">
        ${agol.searchQuery ? `No layers found matching "${escHtml(agol.searchQuery)}"` : 'No layers in this location.'}
      </div>`;
    if (pagEl) pagEl.style.display = 'none';
    return;
  }

  el.innerHTML = results.map(item =>
    item._isFolder ? _agolRenderFolder(item) : _agolRenderItem(item)
  ).join('');

  // Pagination (only for the search results part, not folders)
  if (pagEl) {
    const itemTotal = total - folders;
    const hasPrev = agol.searchStart > 1;
    const hasNext = (agol.searchStart - 1 + agol.pageSize) < itemTotal;
    if (hasPrev || hasNext) {
      pagEl.style.display = 'flex';
      const page = Math.ceil(agol.searchStart / agol.pageSize);
      const pages = Math.ceil(itemTotal / agol.pageSize) || 1;
      pagEl.innerHTML = `
        ${hasPrev
          ? `<button class="btn btn-ghost btn-sm" onclick="agolPage(-1)" style="font-size:9px;padding:2px 8px;">‹ Prev</button>`
          : `<span></span>`}
        <span style="flex:1;text-align:center;">Page ${page} of ${pages} · ${itemTotal} items</span>
        ${hasNext
          ? `<button class="btn btn-ghost btn-sm" onclick="agolPage(1)" style="font-size:9px;padding:2px 8px;">Next ›</button>`
          : `<span></span>`}`;
    } else {
      pagEl.style.display = 'none';
    }
  }
}

function _agolRenderFolder(f) {
  return `
    <div onclick="agolOpenFolder('${escHtml(f.id)}','${escHtml(f.title)}')"
      style="display:flex;align-items:center;gap:10px;padding:8px 12px;
             border-bottom:1px solid var(--border);cursor:pointer;user-select:none;"
      onmouseover="this.style.background='var(--bg3)'"
      onmouseout="this.style.background=''">
      <span style="font-size:15px;flex-shrink:0;">📁</span>
      <div style="flex:1;min-width:0;">
        <div style="font-family:var(--mono);font-size:10px;font-weight:600;color:var(--text);
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escHtml(f.title)}
        </div>
        <div style="font-family:var(--mono);font-size:8px;color:var(--text3);">Folder</div>
      </div>
      <span style="font-family:var(--mono);font-size:12px;color:var(--text3);">›</span>
    </div>`;
}

function _agolRenderItem(item) {
  const icon     = _agolTypeIcon(item.type);
  const modified = item.modified ? new Date(item.modified).toLocaleDateString() : '';
  const snippet  = (item.snippet || '').substring(0, 90);
  const canLoad  = _agolCanLoad(item.type);

  // Encode id/title safely for use in inline onclick
  const safeId    = item.id.replace(/['"\\]/g, '');
  const safeTitle = escHtml(item.title).replace(/'/g, '&#39;');
  const safeType  = (item.type||'').replace(/'/g, '&#39;');

  return `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 12px;
                border-bottom:1px solid var(--border);"
      onmouseover="this.style.background='var(--bg3)'"
      onmouseout="this.style.background=''">
      <span style="font-size:16px;flex-shrink:0;padding-top:1px;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-family:var(--mono);font-size:10px;font-weight:600;color:var(--text);
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
          title="${escHtml(item.title)}">${escHtml(item.title)}</div>
        <div style="font-family:var(--mono);font-size:8px;color:var(--text3);margin-top:1px;">
          ${escHtml(item.type||'')}${modified ? ' · ' + modified : ''}
        </div>
        ${snippet ? `<div style="font-family:var(--mono);font-size:8px;color:var(--text3);margin-top:2px;
                         white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escHtml(snippet)}</div>` : ''}
      </div>
      ${canLoad
        ? `<button class="btn btn-ghost btn-sm"
             onclick="agolLoadItem('${safeId}','${safeTitle}','${safeType}')"
             style="flex-shrink:0;font-size:9px;padding:3px 10px;white-space:nowrap;">
             + Add
           </button>`
        : `<span style="font-family:var(--mono);font-size:8px;color:var(--text3);
                         flex-shrink:0;padding-top:4px;">—</span>`}
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
//  LAYER LOADING
// ─────────────────────────────────────────────────────────────────────────
async function agolLoadItem(itemId, title, itemType) {
  // Decode HTML entities in title
  const realTitle = title.replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
  toast('Loading "' + realTitle + '"…', 'info');

  // Close modal so user sees map
  const bd = document.getElementById('url-backdrop');
  if (bd) bd.classList.remove('open');

  try {
    const detail = await _agolPost('/sharing/rest/content/items/' + itemId);
    const serviceUrl = detail.url;
    if (!serviceUrl) throw new Error('Item has no associated service URL');

    if (itemType === 'Feature Service' || itemType === 'WFS') {
      await _agolLoadFeatureService(serviceUrl, realTitle);
    } else if (itemType === 'Map Service') {
      _agolLoadMapServiceTiles(serviceUrl, realTitle);
    } else if (itemType === 'Vector Tile Service') {
      _agolLoadVectorTiles(serviceUrl, realTitle);
    } else if (itemType === 'WMS') {
      _agolLoadWMSFromItem(detail, realTitle);
    } else if (itemType === 'Feature Collection') {
      await _agolLoadFeatureCollection(itemId, realTitle);
    } else {
      throw new Error('Unsupported type: ' + itemType);
    }
  } catch(e) {
    toast('AGOL Error: ' + e.message, 'error');
    console.error('AGOL load error:', e);
  }
}

/** Discover sub-layers, show picker if multiple */
async function _agolLoadFeatureService(serviceUrl, title) {
  const cleanUrl = serviceUrl.replace(/\/+$/, '');
  // If URL already ends in /N → single layer
  if (/\/\d+$/.test(cleanUrl)) {
    await _agolDownloadFeatureLayer(cleanUrl, title);
    return;
  }
  // Inspect root service for layers
  const resp = await fetch(cleanUrl + '?f=json&token=' + agol.token);
  const info = await resp.json();
  if (info.error) throw new Error(info.error.message);
  const layers = info.layers || [];
  if (!layers.length) throw new Error('Feature Service has no layers');
  if (layers.length === 1) {
    await _agolDownloadFeatureLayer(cleanUrl + '/' + layers[0].id, layers[0].name || title);
    return;
  }
  _agolShowLayerPicker(cleanUrl, title, layers);
}

function _agolShowLayerPicker(serviceUrl, title, layers) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10500;display:flex;align-items:center;justify-content:center;';
  el.innerHTML = `
    <div style="background:var(--bg2);border-radius:10px;width:400px;max-width:95vw;
                max-height:80vh;display:flex;flex-direction:column;
                box-shadow:0 8px 40px rgba(0,0,0,0.3);overflow:hidden;">
      <div style="background:linear-gradient(135deg,#0C2E44,#113c64);border-bottom:2px solid #14b1e7;
                  padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">
        <span style="font-family:var(--mono);font-weight:700;font-size:11px;color:#e8f4fb;">
          Select Layers — ${escHtml(title)}
        </span>
        <span style="cursor:pointer;color:#7a96aa;font-size:16px;"
          onclick="this.closest('div[style*=fixed]').remove()">✕</span>
      </div>
      <div style="overflow-y:auto;flex:1;padding:8px 12px;">
        ${layers.map(l => `
          <label style="display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;
                         font-family:var(--mono);font-size:10px;color:var(--text);"
            onmouseover="this.style.background='var(--bg3)'"
            onmouseout="this.style.background=''">
            <input type="checkbox" checked value="${escHtml(String(l.id))}"
              style="accent-color:var(--teal);"/>
            ${escHtml(l.name || 'Layer ' + l.id)}
            <span style="font-size:8px;color:var(--text3);margin-left:auto;">${escHtml(l.type||'')}</span>
          </label>`).join('')}
      </div>
      <div style="padding:10px 14px;border-top:1px solid var(--border);
                  display:flex;justify-content:flex-end;gap:8px;">
        <button class="btn btn-ghost btn-sm"
          onclick="this.closest('div[style*=fixed]').remove()">Cancel</button>
        <button class="btn btn-primary btn-sm"
          onclick="agolLoadPickedLayers('${escHtml(serviceUrl)}',this)">Load Selected</button>
      </div>
    </div>`;
  document.body.appendChild(el);
}

async function agolLoadPickedLayers(serviceUrl, btn) {
  const modal   = btn.closest('div[style*=fixed]');
  const checked = Array.from(modal.querySelectorAll('input[type=checkbox]:checked'));
  if (!checked.length) { toast('Select at least one layer', 'error'); return; }
  modal.remove();
  for (const cb of checked) {
    const label = cb.closest('label');
    const name  = label ? label.textContent.trim() : 'Layer ' + cb.value;
    await _agolDownloadFeatureLayer(serviceUrl + '/' + cb.value, name);
  }
}

async function _agolDownloadFeatureLayer(layerUrl, name) {
  if (state.map && state.map.getZoom() < 10) {
    const ok = confirm(
      `You are at zoom level ${state.map.getZoom()}.\n\n` +
      `Only the first 2,000 features will be downloaded.\n\nContinue?`
    );
    if (!ok) return;
  }
  toast('Downloading ' + name + '…', 'info');

  const params = {
    where:             '1=1',
    outFields:         '*',
    outSR:             '4326',
    f:                 'geojson',
    resultRecordCount: '2000',
    returnGeometry:    'true',
    token:             agol.token,
  };

  if (state.map && state.map.getZoom() >= 10) {
    const b = state.map.getBounds();
    params.geometry        = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(',');
    params.geometryType    = 'esriGeometryEnvelope';
    params.inSR            = '4326';
    params.spatialRel      = 'esriSpatialRelIntersects';
  }

  const body = new URLSearchParams(params);
  const resp = await fetch(layerUrl + '/query', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const geojson = await resp.json();
  if (geojson.error) throw new Error(geojson.error.message);
  if (!geojson.features) throw new Error('No features returned');

  const n = geojson.features.length;
  addLayer(geojson, name, 'EPSG:4326', 'ArcGIS Online');
  toast(`"${name}" — ${n} feature${n!==1?'s':''}${n>=2000?' (limit reached, zoom in)':''}`, 'success');
}

function _agolLoadMapServiceTiles(serviceUrl, name) {
  const tileUrl = serviceUrl.replace(/\/+$/, '') + '/tile/{z}/{y}/{x}';
  const tileL   = L.tileLayer(tileUrl, { attribution: name, opacity: 0.85 });
  tileL.addTo(state.map);
  state.layers.push({
    name, format:'ArcGIS Map Service', color:'#f0883e',
    leafletLayer:tileL, visible:true, isTile:true,
    fields:{}, geojson:{features:[]}, geomType:'Tile', sourceCRS:'EPSG:4326',
  });
  updateLayerList(); updateExportLayerList();
  toast('Map Service added: ' + name, 'success');
}

function _agolLoadVectorTiles(serviceUrl, name) {
  toast('"' + name + '" is a Vector Tile Service — adding as a visual overlay.', 'info');
  const tileUrl = serviceUrl.replace(/\/+$/, '') + '/tile/{z}/{y}/{x}.pbf';
  const tileL   = L.tileLayer(tileUrl, { attribution: name, opacity: 0.85 });
  tileL.addTo(state.map);
  state.layers.push({
    name, format:'Vector Tile Service', color:'#bc8cff',
    leafletLayer:tileL, visible:true, isTile:true,
    fields:{}, geojson:{features:[]}, geomType:'Tile', sourceCRS:'EPSG:4326',
  });
  updateLayerList(); updateExportLayerList();
  toast('Vector tile layer added: ' + name, 'success');
}

function _agolLoadWMSFromItem(detail, name) {
  const wmsL = L.tileLayer.wms(detail.url, {
    layers: '', format: 'image/png', transparent: true,
    attribution: name, opacity: 0.85,
  });
  wmsL.addTo(state.map);
  state.layers.push({
    name, format:'WMS (AGOL)', color:'#5ab4f0',
    leafletLayer:wmsL, visible:true, isTile:true,
    fields:{}, geojson:{features:[]}, geomType:'Tile', sourceCRS:'EPSG:4326',
  });
  updateLayerList(); updateExportLayerList();
  toast('WMS layer added: ' + name, 'success');
}

async function _agolLoadFeatureCollection(itemId, title) {
  const data = await _agolPost('/sharing/rest/content/items/' + itemId + '/data');
  const layers = data.layers || [];
  for (const l of layers) {
    const fc = l.featureSet;
    if (!fc || !fc.features) continue;
    const geojson = _esriToGeoJSON(fc);
    if (geojson.features.length) {
      addLayer(geojson, l.layerDefinition?.name || title, 'EPSG:4326', 'Feature Collection');
    }
  }
  toast('Feature Collection loaded: ' + title, 'success');
}

// ─────────────────────────────────────────────────────────────────────────
//  ESRI → GeoJSON converter
// ─────────────────────────────────────────────────────────────────────────
function _esriToGeoJSON(featureSet) {
  const features = (featureSet.features || []).map(f => ({
    type:       'Feature',
    properties: f.attributes || {},
    geometry:   _esriGeomToGeoJSON(featureSet.geometryType, f.geometry),
  })).filter(f => f.geometry);
  return { type: 'FeatureCollection', features };
}

function _esriGeomToGeoJSON(geomType, geom) {
  if (!geom) return null;
  switch (geomType) {
    case 'esriGeometryPoint':
      return { type:'Point', coordinates:[geom.x, geom.y] };
    case 'esriGeometryMultipoint':
      return { type:'MultiPoint', coordinates: geom.points || [] };
    case 'esriGeometryPolyline':
      return (geom.paths||[]).length === 1
        ? { type:'LineString',      coordinates: geom.paths[0] }
        : { type:'MultiLineString', coordinates: geom.paths || [] };
    case 'esriGeometryPolygon':
      return (geom.rings||[]).length === 1
        ? { type:'Polygon',      coordinates: [geom.rings[0]] }
        : { type:'MultiPolygon', coordinates: (geom.rings||[]).map(r=>[r]) };
    default: return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────────────────────────────────
function _agolTypeIcon(type) {
  return { 'Feature Service':'📍','Map Service':'🗺','Vector Tile Service':'🔷',
           'WMS':'🌐','WFS':'🌐','Feature Collection':'📦' }[type] || '📄';
}

function _agolCanLoad(type) {
  return ['Feature Service','Map Service','Vector Tile Service',
          'WMS','WFS','Feature Collection'].includes(type);
}

function _agolShowResults(html) {
  const el = document.getElementById('agol-results');
  if (el) el.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────────────
//  Bootstrap — called when AGOL tab is opened (not on page load)
//  to avoid race conditions with the pane div not existing yet.
//  We DO still need to check for the OAuth callback hash on page load though.
// ─────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  // Only process the OAuth hash redirect — don't render the pane yet
  // (the pane div doesn't exist until the URL modal is opened)
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    agolInit();
    // The OAuth redirect causes a full page reload, which wipes in-memory state.
    // agolSignIn() saved the session to localStorage before redirecting — reload it
    // now, after a short delay to let gaia.js finish map initialisation first.
    setTimeout(function() {
      if (typeof loadSession === 'function') {
        loadSession();
      }
    }, 300);
  }
});
