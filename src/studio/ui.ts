// gramobase studio — self-contained browser UI
// Returns the full HTML page as a string — no bundler needed.

export function getStudioHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>gramobase studio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:         #0a0b0e;
      --bg2:        #111318;
      --bg3:        #181b22;
      --bg4:        #1e2230;
      --border:     rgba(255,255,255,0.07);
      --border2:    rgba(255,255,255,0.12);
      --accent:     #3b82f6;
      --accent2:    #60a5fa;
      --accent-glow:rgba(59,130,246,0.25);
      --green:      #22c55e;
      --red:        #ef4444;
      --yellow:     #f59e0b;
      --purple:     #a78bfa;
      --teal:       #2dd4bf;
      --text:       #e2e8f0;
      --text2:      #94a3b8;
      --text3:      #475569;
      --radius:     10px;
      --font-mono:  'JetBrains Mono', monospace;
      --sidebar-w:  240px;
    }

    html, body { height: 100%; background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; font-size: 14px; }

    /* ── LAYOUT ──────────────────────────────────────────────────── */
    #app { display: flex; height: 100vh; overflow: hidden; }

    /* ── SIDEBAR ─────────────────────────────────────────────────── */
    #sidebar {
      width: var(--sidebar-w); min-width: var(--sidebar-w);
      background: var(--bg2);
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      overflow: hidden;
    }
    #sidebar-header {
      padding: 18px 16px 14px;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    .logo-icon {
      width: 28px; height: 28px; border-radius: 7px;
      background: linear-gradient(135deg, var(--accent), var(--purple));
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; flex-shrink: 0;
      box-shadow: 0 0 16px var(--accent-glow);
    }
    .logo-text { font-weight: 700; font-size: 15px; letter-spacing: -0.3px; }
    .logo-badge {
      font-size: 9px; font-weight: 600; padding: 1px 5px; border-radius: 4px;
      background: var(--accent-glow); color: var(--accent2);
      border: 1px solid var(--accent); margin-left: auto;
    }
    #sidebar-nav { flex: 1; overflow-y: auto; padding: 10px 0; }
    .nav-section { padding: 6px 16px 4px; font-size: 10px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: var(--text3); }
    .nav-item {
      display: flex; align-items: center; gap: 9px;
      padding: 7px 16px; cursor: pointer; border-radius: 0;
      color: var(--text2); font-size: 13px; transition: all 0.15s;
      border-left: 2px solid transparent;
    }
    .nav-item:hover { background: var(--bg3); color: var(--text); }
    .nav-item.active { background: var(--bg4); color: var(--accent2); border-left-color: var(--accent); }
    .nav-item-icon { width: 16px; text-align: center; font-size: 12px; }
    .nav-item-count {
      margin-left: auto; font-size: 10px; padding: 1px 6px; border-radius: 10px;
      background: var(--bg4); color: var(--text3); font-family: var(--font-mono);
    }
    #sidebar-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      font-size: 11px; color: var(--text3);
    }
    .status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--green); margin-right: 5px; box-shadow: 0 0 6px var(--green); }
    .status-dot.red { background: var(--red); box-shadow: 0 0 6px var(--red); }

    /* ── MAIN ────────────────────────────────────────────────────── */
    #main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    /* ── TOPBAR ──────────────────────────────────────────────────── */
    #topbar {
      height: 52px; display: flex; align-items: center; gap: 12px;
      padding: 0 20px;
      background: var(--bg2); border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    #topbar-title { font-weight: 600; font-size: 15px; }
    #topbar-sub { font-size: 12px; color: var(--text3); }
    #topbar-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border2);
      background: var(--bg3); color: var(--text2); cursor: pointer;
      font-size: 12px; font-family: 'Inter', sans-serif;
      transition: all 0.15s;
    }
    .btn:hover { background: var(--bg4); color: var(--text); border-color: var(--accent); }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .btn.primary:hover { background: var(--accent2); }

    /* ── CONTENT ─────────────────────────────────────────────────── */
    #content { flex: 1; overflow: hidden; position: relative; }
    .panel { display: none; height: 100%; overflow-y: auto; }
    .panel.active { display: block; }

    /* ── OVERVIEW PANEL ──────────────────────────────────────────── */
    #panel-overview { padding: 24px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; margin-bottom: 28px; }
    .stat-card {
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 18px;
      transition: border-color 0.2s;
    }
    .stat-card:hover { border-color: var(--border2); }
    .stat-label { font-size: 11px; color: var(--text3); font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 8px; }
    .stat-value { font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
    .stat-sub { font-size: 11px; color: var(--text3); margin-top: 4px; }
    .stat-value.green { color: var(--green); }
    .stat-value.blue { color: var(--accent2); }
    .stat-value.purple { color: var(--purple); }
    .stat-value.yellow { color: var(--yellow); }
    .stat-icon { font-size: 24px; margin-bottom: 10px; }

    .section-title { font-size: 13px; font-weight: 600; color: var(--text2); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

    /* ── BOT STATUS ──────────────────────────────────────────────── */
    .info-card {
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 16px; margin-bottom: 14px;
    }
    .info-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--border); }
    .info-row:last-child { border-bottom: none; }
    .info-key { font-size: 12px; color: var(--text3); width: 130px; flex-shrink: 0; }
    .info-val { font-size: 13px; font-family: var(--font-mono); color: var(--text); }
    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 500; }
    .badge.green { background: rgba(34,197,94,0.12); color: var(--green); border: 1px solid rgba(34,197,94,0.2); }
    .badge.blue { background: rgba(59,130,246,0.12); color: var(--accent2); border: 1px solid rgba(59,130,246,0.2); }
    .badge.yellow { background: rgba(245,158,11,0.12); color: var(--yellow); border: 1px solid rgba(245,158,11,0.2); }

    /* worker pool bars */
    .worker-bars { display: flex; flex-direction: column; gap: 8px; }
    .worker-row { display: flex; align-items: center; gap: 10px; }
    .worker-label { font-size: 11px; color: var(--text3); width: 60px; flex-shrink: 0; font-family: var(--font-mono); }
    .progress-bar { flex: 1; height: 6px; background: var(--bg4); border-radius: 3px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--accent), var(--purple)); transition: width 0.4s; }
    .worker-stat { font-size: 11px; color: var(--text3); width: 60px; text-align: right; font-family: var(--font-mono); }

    /* ── COLLECTION PANEL ────────────────────────────────────────── */
    #panel-collection { display: none; flex-direction: column; height: 100%; }
    #panel-collection.active { display: flex; }

    #collection-toolbar {
      padding: 12px 20px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px; flex-shrink: 0;
      background: var(--bg2);
    }
    #filter-input {
      flex: 1; max-width: 320px;
      background: var(--bg3); border: 1px solid var(--border2);
      border-radius: 6px; padding: 6px 12px;
      color: var(--text); font-size: 13px; font-family: 'Inter', sans-serif;
      outline: none; transition: border-color 0.15s;
    }
    #filter-input:focus { border-color: var(--accent); }
    #filter-input::placeholder { color: var(--text3); }
    select.sort-select {
      background: var(--bg3); border: 1px solid var(--border2);
      border-radius: 6px; padding: 6px 10px;
      color: var(--text); font-size: 13px; font-family: 'Inter', sans-serif;
      outline: none; cursor: pointer;
    }

    /* ── TABLE ───────────────────────────────────────────────────── */
    #table-wrap { flex: 1; overflow: auto; }
    table { width: 100%; border-collapse: collapse; }
    thead { position: sticky; top: 0; z-index: 2; }
    th {
      background: var(--bg2); color: var(--text3);
      font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;
      padding: 10px 16px; text-align: left;
      border-bottom: 1px solid var(--border);
      cursor: pointer; white-space: nowrap;
      user-select: none;
    }
    th:hover { color: var(--text); }
    th.sorted { color: var(--accent2); }
    td {
      padding: 9px 16px; border-bottom: 1px solid var(--border);
      font-size: 13px; max-width: 250px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      vertical-align: middle;
    }
    tr { cursor: pointer; transition: background 0.1s; }
    tr:hover td { background: var(--bg3); }
    tr.selected td { background: rgba(59,130,246,0.08); }
    .cell-id { font-family: var(--font-mono); font-size: 11px; color: var(--text3); }
    .cell-bool-true { color: var(--green); font-size: 11px; font-weight: 500; }
    .cell-bool-false { color: var(--red); font-size: 11px; font-weight: 500; }
    .cell-num { color: var(--purple); font-family: var(--font-mono); font-size: 12px; }
    .cell-date { color: var(--teal); font-size: 11px; }
    .cell-null { color: var(--text3); font-style: italic; font-size: 11px; }

    /* ── PAGINATION ──────────────────────────────────────────────── */
    #pagination {
      padding: 10px 20px; border-top: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
      background: var(--bg2); flex-shrink: 0;
    }
    #pagination-info { font-size: 12px; color: var(--text3); }
    #pagination-controls { margin-left: auto; display: flex; gap: 6px; }
    .page-btn {
      width: 28px; height: 28px; border-radius: 5px;
      background: var(--bg3); border: 1px solid var(--border);
      color: var(--text2); cursor: pointer; font-size: 12px;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s;
    }
    .page-btn:hover:not(:disabled) { background: var(--bg4); border-color: var(--accent); color: var(--accent2); }
    .page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .page-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }

    /* ── REALTIME PANEL ──────────────────────────────────────────── */
    #panel-realtime { display: none; flex-direction: column; height: 100%; }
    #panel-realtime.active { display: flex; }
    #events-toolbar {
      padding: 12px 20px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
      background: var(--bg2); flex-shrink: 0;
    }
    .event-indicator { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text3); }
    .pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--green); animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
    #events-log {
      flex: 1; overflow-y: auto; padding: 12px 20px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .event-item {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 10px 14px; border-radius: 8px;
      background: var(--bg2); border: 1px solid var(--border);
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity:0; transform: translateY(-4px); } to { opacity:1; transform: translateY(0); } }
    .event-type {
      font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px;
      text-transform: uppercase; letter-spacing: 0.5px; flex-shrink: 0; margin-top: 1px;
    }
    .event-type.insert { background: rgba(34,197,94,0.15); color: var(--green); }
    .event-type.update { background: rgba(245,158,11,0.15); color: var(--yellow); }
    .event-type.delete { background: rgba(239,68,68,0.15); color: var(--red); }
    .event-type.system { background: rgba(167,139,250,0.15); color: var(--purple); }
    .event-body { flex: 1; min-width: 0; }
    .event-title { font-size: 13px; font-weight: 500; margin-bottom: 2px; }
    .event-detail { font-size: 11px; color: var(--text3); font-family: var(--font-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .event-time { font-size: 10px; color: var(--text3); flex-shrink: 0; font-family: var(--font-mono); }
    #events-empty { text-align: center; padding: 60px 20px; color: var(--text3); }
    #events-empty .empty-icon { font-size: 40px; margin-bottom: 12px; }

    /* ── INSPECTOR MODAL ─────────────────────────────────────────── */
    #inspector-overlay {
      display: none; position: fixed; inset: 0; z-index: 100;
      background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
      align-items: flex-start; justify-content: flex-end;
    }
    #inspector-overlay.open { display: flex; }
    #inspector-panel {
      width: min(560px, 90vw); height: 100vh; overflow-y: auto;
      background: var(--bg2); border-left: 1px solid var(--border);
      padding: 20px; display: flex; flex-direction: column; gap: 14px;
      animation: slideIn 0.25s ease;
    }
    @keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    #inspector-header { display: flex; align-items: center; justify-content: space-between; }
    #inspector-title { font-size: 15px; font-weight: 600; }
    #inspector-close {
      width: 28px; height: 28px; border-radius: 6px;
      background: var(--bg3); border: 1px solid var(--border);
      cursor: pointer; font-size: 16px; color: var(--text3);
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s;
    }
    #inspector-close:hover { color: var(--text); border-color: var(--red); background: rgba(239,68,68,0.1); }
    #inspector-body { flex: 1; }
    #inspector-json {
      background: var(--bg); border: 1px solid var(--border);
      border-radius: 8px; padding: 16px;
      font-family: var(--font-mono); font-size: 12px; line-height: 1.7;
      white-space: pre-wrap; word-break: break-all; overflow-x: auto;
      color: var(--text);
    }
    /* JSON syntax highlighting */
    .j-key    { color: #93c5fd; }
    .j-str    { color: #86efac; }
    .j-num    { color: #c4b5fd; }
    .j-bool   { color: #f97316; }
    .j-null   { color: var(--text3); }
    .j-punc   { color: var(--text3); }

    /* ── EMPTY / LOADING ─────────────────────────────────────────── */
    .loading-spinner {
      width: 30px; height: 30px; border: 3px solid var(--border2);
      border-top-color: var(--accent); border-radius: 50%;
      animation: spin 0.7s linear infinite; margin: 60px auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .empty-state { text-align: center; padding: 60px 20px; color: var(--text3); }
    .empty-state .empty-icon { font-size: 40px; margin-bottom: 12px; }
    .empty-state p { font-size: 14px; margin-bottom: 6px; }
    .empty-state small { font-size: 12px; }

    /* ── SCROLLBAR ───────────────────────────────────────────────── */
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--bg4); border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text3); }

    /* ── TOAST ───────────────────────────────────────────────────── */
    #toast {
      position: fixed; bottom: 20px; right: 20px;
      background: var(--bg3); border: 1px solid var(--border2);
      border-radius: 8px; padding: 10px 16px; font-size: 13px;
      display: none; z-index: 200; animation: toastIn 0.2s ease;
    }
    @keyframes toastIn { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform: translateY(0); } }
  </style>
</head>
<body>
<div id="app">

  <!-- ── SIDEBAR ──────────────────────────────────────────────────── -->
  <nav id="sidebar">
    <div id="sidebar-header">
      <div class="logo-icon">🗄</div>
      <span class="logo-text">gramobase</span>
      <span class="logo-badge">STUDIO</span>
    </div>
    <div id="sidebar-nav">
      <div class="nav-section">Dashboard</div>
      <div class="nav-item active" data-panel="overview" onclick="switchPanel('overview')">
        <span class="nav-item-icon">⚡</span> Overview
      </div>
      <div class="nav-item" data-panel="realtime" onclick="switchPanel('realtime')">
        <span class="nav-item-icon">📡</span> Realtime Feed
      </div>

      <div class="nav-section" style="margin-top:10px">Collections</div>
      <div id="collection-list">
        <div style="padding:12px 16px;font-size:12px;color:var(--text3)">Loading...</div>
      </div>
    </div>
    <div id="sidebar-footer">
      <span class="status-dot" id="conn-dot"></span>
      <span id="conn-label">Connecting...</span>
    </div>
  </nav>

  <!-- ── MAIN ─────────────────────────────────────────────────────── -->
  <div id="main">
    <!-- Topbar -->
    <div id="topbar">
      <span id="topbar-title">Overview</span>
      <span id="topbar-sub"></span>
      <div id="topbar-actions">
        <button class="btn" onclick="refreshCurrent()">↺ Refresh</button>
      </div>
    </div>

    <!-- Content -->
    <div id="content">

      <!-- Overview Panel -->
      <div id="panel-overview" class="panel active">
        <div id="overview-inner" style="padding:24px">
          <div style="text-align:center;padding:60px 0"><div class="loading-spinner"></div></div>
        </div>
      </div>

      <!-- Collection Panel -->
      <div id="panel-collection" class="panel">
        <div id="collection-toolbar">
          <input id="filter-input" type="text" placeholder="Filter (e.g. completed:true or hello)" oninput="debounceFilter()" />
          <select class="sort-select" id="sort-field" onchange="loadCollection()">
            <option value="">Sort by...</option>
          </select>
          <select class="sort-select" id="sort-dir" onchange="loadCollection()" style="width:90px">
            <option value="-1">↓ DESC</option>
            <option value="1">↑ ASC</option>
          </select>
          <span style="font-size:12px;color:var(--text3);margin-left:4px" id="coll-count"></span>
        </div>
        <div id="table-wrap">
          <div style="text-align:center;padding:60px 0"><div class="loading-spinner"></div></div>
        </div>
        <div id="pagination">
          <span id="pagination-info"></span>
          <div id="pagination-controls"></div>
        </div>
      </div>

      <!-- Realtime Panel -->
      <div id="panel-realtime" class="panel">
        <div id="events-toolbar">
          <div class="event-indicator"><div class="pulse"></div> Live events</div>
          <button class="btn" style="margin-left:auto" onclick="clearEvents()">🗑 Clear</button>
        </div>
        <div id="events-log">
          <div class="empty-state" id="events-empty">
            <div class="empty-icon">📡</div>
            <p>Waiting for events...</p>
            <small>Insert, update, or delete documents to see events here.</small>
          </div>
        </div>
      </div>

    </div>
  </div>
</div>

<!-- Inspector Drawer -->
<div id="inspector-overlay" onclick="closeInspector(event)">
  <div id="inspector-panel">
    <div id="inspector-header">
      <span id="inspector-title">Document</span>
      <div id="inspector-close" onclick="closeInspector()">✕</div>
    </div>
    <div id="inspector-body">
      <pre id="inspector-json"></pre>
    </div>
  </div>
</div>

<!-- Toast -->
<div id="toast"></div>

<script>
/* ─── State ───────────────────────────────────────────────── */
let currentPanel = 'overview';
let currentCollection = null;
let currentPage = 1;
let pageSize = 25;
let totalDocs = 0;
let sortField = '';
let sortDir = -1;
let filterText = '';
let filterTimer = null;
let columns = [];
let eventSource = null;
let eventCount = 0;

/* ─── Init ────────────────────────────────────────────────── */
async function init() {
  await loadStatus();
  await loadCollections();
  connectSSE();
}

/* ─── Status / Overview ───────────────────────────────────── */
async function loadStatus() {
  try {
    const data = await api('/api/status');
    setConnected(true, '@' + (data.bot?.username || 'unknown'));
    renderOverview(data);
  } catch (e) {
    setConnected(false, 'Connection failed');
    renderOverviewError(e.message);
  }
}

function renderOverview(data) {
  const cache = data.cache || {};
  const workers = data.workers || {};
  const tokens = workers.tokens || [];

  const hitPct = cache.hits + cache.misses > 0
    ? Math.round((cache.hits / (cache.hits + cache.misses)) * 100)
    : 0;
  const cacheUsedMb = ((cache.bytes || 0) / 1024 / 1024).toFixed(1);
  const cacheMaxMb = ((cache.maxBytes || 1) / 1024 / 1024).toFixed(0);

  document.getElementById('overview-inner').innerHTML = \`
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">🤖</div>
        <div class="stat-label">Bot</div>
        <div class="stat-value blue" style="font-size:18px">@\${escH(data.bot?.username || '—')}</div>
        <div class="stat-sub">\${escH(data.bot?.firstName || '')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📦</div>
        <div class="stat-label">Token Pool</div>
        <div class="stat-value purple">\${tokens.length || 1}</div>
        <div class="stat-sub">\${(tokens.length||1) * 30} req/s capacity</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⚡</div>
        <div class="stat-label">Cache Hit Rate</div>
        <div class="stat-value \${hitPct > 70 ? 'green' : hitPct > 40 ? 'yellow' : 'blue'}">\${hitPct}%</div>
        <div class="stat-sub">\${cache.hits||0} hits / \${cache.misses||0} misses</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🗄</div>
        <div class="stat-label">Cache Usage</div>
        <div class="stat-value blue">\${cacheUsedMb} MB</div>
        <div class="stat-sub">of \${cacheMaxMb} MB limit</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📑</div>
        <div class="stat-label">Channel</div>
        <div class="stat-value blue" style="font-size:15px;font-family:var(--font-mono)">\${escH(data.channelId || '—')}</div>
        <div class="stat-sub">Primary channel</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🌀</div>
        <div class="stat-label">Collections</div>
        <div class="stat-value green">\${(data.collections||[]).length}</div>
        <div class="stat-sub">discovered</div>
      </div>
    </div>

    <div class="section-title">Bot Connection</div>
    <div class="info-card">
      <div class="info-row"><span class="info-key">Status</span><span class="info-val"><span class="badge green">● Online</span></span></div>
      <div class="info-row"><span class="info-key">Username</span><span class="info-val">@\${escH(data.bot?.username||'—')}</span></div>
      <div class="info-row"><span class="info-key">First Name</span><span class="info-val">\${escH(data.bot?.firstName||'—')}</span></div>
      <div class="info-row"><span class="info-key">Channel ID</span><span class="info-val">\${escH(data.channelId||'—')}</span></div>
      <div class="info-row"><span class="info-key">Token Count</span><span class="info-val"><span class="badge blue">\${tokens.length||1} token\${(tokens.length||1)>1?'s':''}</span></span></div>
    </div>

    \${tokens.length > 0 ? \`
    <div class="section-title" style="margin-top:20px">Worker Pool</div>
    <div class="info-card">
      <div class="worker-bars">
        \${tokens.map((t,i) => \`
          <div class="worker-row">
            <span class="worker-label">Token \${i+1}</span>
            <div class="progress-bar"><div class="progress-fill" style="width:\${Math.min(100,(t.activeRequests||0)/25*100)}%"></div></div>
            <span class="worker-stat">\${t.activeRequests||0}/25</span>
          </div>
        \`).join('')}
      </div>
    </div>
    \` : ''}
  \`;
}

function renderOverviewError(msg) {
  document.getElementById('overview-inner').innerHTML = \`
    <div class="empty-state">
      <div class="empty-icon">❌</div>
      <p>Could not connect to gramobase</p>
      <small>\${escH(msg)}</small>
    </div>
  \`;
}

/* ─── Collections ─────────────────────────────────────────── */
async function loadCollections() {
  try {
    const data = await api('/api/collections');
    const list = data.collections || [];
    const nav = document.getElementById('collection-list');
    if (list.length === 0) {
      nav.innerHTML = '<div style="padding:10px 16px;font-size:12px;color:var(--text3)">No collections yet</div>';
      return;
    }
    nav.innerHTML = list.map(c => \`
      <div class="nav-item" data-panel="collection" data-col="\${escH(c.name)}" onclick="openCollection('\${escH(c.name)}')">
        <span class="nav-item-icon">📋</span>
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${escH(c.name)}</span>
        <span class="nav-item-count">\${c.count||'?'}</span>
      </div>
    \`).join('');
  } catch(e) {}
}

async function openCollection(name) {
  currentCollection = name;
  currentPage = 1;
  filterText = '';
  sortField = '';
  document.getElementById('filter-input').value = '';
  document.getElementById('sort-field').innerHTML = '<option value="">Sort by...</option>';
  switchPanel('collection');
  document.getElementById('topbar-title').textContent = name;
  document.getElementById('topbar-sub').textContent = 'collection';
  await loadCollection();
}

async function loadCollection() {
  if (!currentCollection) return;
  sortField = document.getElementById('sort-field').value;
  sortDir = parseInt(document.getElementById('sort-dir').value, 10);
  const params = new URLSearchParams({
    page: currentPage,
    limit: pageSize,
    filter: filterText,
    sortField, sortDir,
  });
  setTableLoading();
  try {
    const data = await api('/api/collection/' + encodeURIComponent(currentCollection) + '?' + params);
    totalDocs = data.total || 0;
    columns = data.columns || [];
    renderTable(data.docs || [], data.columns || []);
    renderPagination();
    updateSortSelect(data.columns || []);
    document.getElementById('coll-count').textContent = totalDocs + ' documents';
    // update sidebar count
    const items = document.querySelectorAll('.nav-item[data-col]');
    items.forEach(item => {
      if (item.dataset.col === currentCollection) {
        const cnt = item.querySelector('.nav-item-count');
        if (cnt) cnt.textContent = totalDocs;
      }
    });
  } catch(e) {
    document.getElementById('table-wrap').innerHTML = \`<div class="empty-state"><div class="empty-icon">❌</div><p>\${escH(e.message)}</p></div>\`;
  }
}

function setTableLoading() {
  document.getElementById('table-wrap').innerHTML = '<div style="text-align:center;padding:60px 0"><div class="loading-spinner"></div></div>';
}

function updateSortSelect(cols) {
  const sel = document.getElementById('sort-field');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Sort by...</option>' +
    cols.map(c => \`<option value="\${escH(c)}" \${c===cur?'selected':''}>\${escH(c)}</option>\`).join('');
}

function renderTable(docs, cols) {
  if (docs.length === 0) {
    document.getElementById('table-wrap').innerHTML = \`
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>No documents found</p>
        <small>Try adjusting your filter or add some data.</small>
      </div>\`;
    return;
  }
  const allCols = ['_id', ...cols.filter(c => !c.startsWith('_') && c !== '_id'), '_createdAt', '_updatedAt'];
  const html = \`<table>
    <thead><tr>
      \${allCols.map(c => \`<th class="\${sortField===c?'sorted':''}" onclick="sortBy('\${escH(c)}')">\${escH(c)}\${sortField===c?(sortDir===-1?' ↓':' ↑'):''}</th>\`).join('')}
    </tr></thead>
    <tbody>
      \${docs.map((doc, i) => \`
        <tr onclick="inspectDoc(\${i})" data-idx="\${i}">
          \${allCols.map(c => \`<td>\${renderCell(doc[c], c)}</td>\`).join('')}
        </tr>\`).join('')}
    </tbody>
  </table>\`;
  document.getElementById('table-wrap').innerHTML = html;
  // store docs for inspector
  window._currentDocs = docs;
}

function renderCell(val, col) {
  if (val === undefined || val === null) return '<span class="cell-null">null</span>';
  if (col === '_id' || col === '_collection') return \`<span class="cell-id">\${escH(String(val).slice(0,12))}…</span>\`;
  if (col === '_createdAt' || col === '_updatedAt') return \`<span class="cell-date">\${escH(fmtDate(val))}</span>\`;
  if (typeof val === 'boolean') return val ? '<span class="cell-bool-true">✓ true</span>' : '<span class="cell-bool-false">✗ false</span>';
  if (typeof val === 'number') return \`<span class="cell-num">\${escH(String(val))}</span>\`;
  if (typeof val === 'object') return \`<span style="color:var(--text3);font-size:11px">{…}</span>\`;
  const s = String(val);
  return \`<span title="\${escH(s)}">\${escH(s.length > 40 ? s.slice(0,40)+'…' : s)}</span>\`;
}

function sortBy(col) {
  if (sortField === col) { sortDir = sortDir === -1 ? 1 : -1; }
  else { sortField = col; sortDir = -1; }
  document.getElementById('sort-field').value = sortField;
  document.getElementById('sort-dir').value = sortDir;
  loadCollection();
}

function inspectDoc(idx) {
  const doc = window._currentDocs?.[idx];
  if (!doc) return;
  document.getElementById('inspector-title').textContent = 'Document: ' + (doc._id?.slice(0,8)||'') + '…';
  document.getElementById('inspector-json').innerHTML = syntaxHL(JSON.stringify(doc, null, 2));
  document.getElementById('inspector-overlay').classList.add('open');
  document.querySelectorAll('tr').forEach((r,i) => r.classList.toggle('selected', r.dataset.idx == idx));
}

function closeInspector(e) {
  if (e && e.target !== document.getElementById('inspector-overlay')) return;
  document.getElementById('inspector-overlay').classList.remove('open');
  document.querySelectorAll('tr.selected').forEach(r => r.classList.remove('selected'));
}

/* ─── Pagination ──────────────────────────────────────────── */
function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(totalDocs / pageSize));
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalDocs);
  document.getElementById('pagination-info').textContent = totalDocs > 0 ? \`\${start}–\${end} of \${totalDocs}\` : '0 results';

  let btns = '';
  btns += \`<button class="page-btn" onclick="goPage(\${currentPage-1})" \${currentPage<=1?'disabled':''}>‹</button>\`;
  const pages = pageRange(currentPage, totalPages);
  pages.forEach(p => {
    if (p === '…') btns += \`<span style="color:var(--text3);padding:0 4px;line-height:28px">…</span>\`;
    else btns += \`<button class="page-btn \${p===currentPage?'active':''}" onclick="goPage(\${p})">\${p}</button>\`;
  });
  btns += \`<button class="page-btn" onclick="goPage(\${currentPage+1})" \${currentPage>=totalPages?'disabled':''}>›</button>\`;
  document.getElementById('pagination-controls').innerHTML = btns;
}

function pageRange(cur, total) {
  if (total <= 7) return Array.from({length:total},(_,i)=>i+1);
  const pages = [1];
  if (cur > 3) pages.push('…');
  for (let i = Math.max(2,cur-1); i <= Math.min(total-1,cur+1); i++) pages.push(i);
  if (cur < total-2) pages.push('…');
  pages.push(total);
  return pages;
}

function goPage(p) {
  const totalPages = Math.ceil(totalDocs / pageSize);
  if (p < 1 || p > totalPages) return;
  currentPage = p;
  loadCollection();
}

/* ─── Filter ──────────────────────────────────────────────── */
function debounceFilter() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => {
    filterText = document.getElementById('filter-input').value;
    currentPage = 1;
    loadCollection();
  }, 400);
}

/* ─── Realtime SSE ────────────────────────────────────────── */
function connectSSE() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource('/api/events');
  eventSource.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data);
      addEvent(ev);
    } catch(_) {}
  };
  eventSource.onerror = () => {};
}

function addEvent(ev) {
  eventCount++;
  const log = document.getElementById('events-log');
  const empty = document.getElementById('events-empty');
  if (empty) empty.remove();

  const typeMap = { insert:'insert', update:'update', delete:'delete', 'worker:rotate':'system', 'wal:flush':'system' };
  const type = typeMap[ev.type] || 'system';
  const title = ev.type === 'insert' ? \`New doc in \${ev.collection}\`
    : ev.type === 'update' ? \`Updated \${ev.id?.slice(0,8)}… in \${ev.collection}\`
    : ev.type === 'delete' ? \`Deleted \${ev.id?.slice(0,8)}… from \${ev.collection}\`
    : ev.type === 'worker:rotate' ? 'Worker rotated token #' + ev.tokenIndex
    : ev.type === 'wal:flush' ? \`WAL flushed \${ev.entries} entries\` : ev.type;
  const detail = ev.doc ? JSON.stringify(ev.doc).slice(0,80) : ev.changes ? JSON.stringify(ev.changes).slice(0,80) : '';

  const item = document.createElement('div');
  item.className = 'event-item';
  item.innerHTML = \`
    <div class="event-type \${type}">\${ev.type}</div>
    <div class="event-body">
      <div class="event-title">\${escH(title)}</div>
      \${detail ? \`<div class="event-detail">\${escH(detail)}</div>\` : ''}
    </div>
    <div class="event-time">\${fmtTime(new Date())}</div>
  \`;
  log.insertBefore(item, log.firstChild);

  // trim to 200
  while (log.children.length > 200) log.removeChild(log.lastChild);

  // if viewing the related collection, refresh
  if ((ev.collection === currentCollection) && currentPanel === 'collection') {
    loadCollection();
  }
}

function clearEvents() {
  const log = document.getElementById('events-log');
  log.innerHTML = \`<div class="empty-state" id="events-empty">
    <div class="empty-icon">📡</div>
    <p>Waiting for events...</p>
    <small>Insert, update, or delete documents to see events here.</small>
  </div>\`;
  eventCount = 0;
}

/* ─── Navigation ──────────────────────────────────────────── */
function switchPanel(name) {
  currentPanel = name;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.panel === name && !i.dataset.col);
  });
  if (name === 'collection') {
    document.querySelectorAll('.nav-item[data-col]').forEach(i => {
      i.classList.toggle('active', i.dataset.col === currentCollection);
    });
  }
  if (name === 'overview') {
    document.getElementById('topbar-title').textContent = 'Overview';
    document.getElementById('topbar-sub').textContent = '';
    loadStatus();
    loadCollections();
  }
  if (name === 'realtime') {
    document.getElementById('topbar-title').textContent = 'Realtime Feed';
    document.getElementById('topbar-sub').textContent = 'live events';
  }
}

function refreshCurrent() {
  if (currentPanel === 'overview') { loadStatus(); loadCollections(); }
  else if (currentPanel === 'collection') loadCollection();
}

/* ─── Utilities ───────────────────────────────────────────── */
function setConnected(ok, label) {
  document.getElementById('conn-dot').className = 'status-dot' + (ok ? '' : ' red');
  document.getElementById('conn-label').textContent = label;
}

async function api(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || r.statusText);
  }
  return r.json();
}

function escH(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(v) {
  if (!v) return '';
  try { return new Date(v).toLocaleString(); } catch(_) { return String(v); }
}

function fmtTime(d) {
  return d.toTimeString().slice(0,8);
}

function syntaxHL(json) {
  return json
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"(\\\\.|[^"\\\\])*"\\s*:/g, s => \`<span class="j-key">\${s}</span>\`)
    .replace(/:\\s*"(\\\\.|[^"\\\\])*"/g, s => {
      const col = s.indexOf('"');
      return s.slice(0,col) + \`<span class="j-str">\${s.slice(col)}</span>\`;
    })
    .replace(/:\\s*(-?\\d+\\.?\\d*)/g, (m,n) => m.replace(n, \`<span class="j-num">\${n}</span>\`))
    .replace(/:\\s*(true|false)/g, (m,b) => m.replace(b, \`<span class="j-bool">\${b}</span>\`))
    .replace(/:\\s*(null)/g, (m,n) => m.replace(n, \`<span class="j-null">\${n}</span>\`));
}

function toast(msg, ms=2500) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.style.display = 'none', ms);
}

/* ─── Boot ────────────────────────────────────────────────── */
init();
</script>
</body>
</html>`;
}
