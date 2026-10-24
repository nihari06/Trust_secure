"""
TrustVault — Unified Web Application Shell
Original Corporate Navy & Blue Theme (#101B32, #3478F6, #F6F8FC)
Provides complete left-sidebar dashboard, registration, login, document management,
search, categories, settings, and audit trail directly served by the Python runtime.
"""

def render_trustvault_ui() -> str:
    return """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrustVault — Secure Sharing & Document Management</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233478f6' stroke-width='2'><rect x='3' y='11' width='18' height='11' rx='2' ry='2'/><path d='M7 11V7a5 5 0 0 1 10 0v4'/></svg>">
  <style>
    :root {
      --navy: #101B32;
      --navy-dark: #0A1120;
      --blue: #3478F6;
      --blue-hover: #2563EB;
      --bg: #F6F8FC;
      --surface: #FFFFFF;
      --text: #18243A;
      --text-secondary: #6B778C;
      --border: #E5EAF2;
      --success: #16866B;
      --warning: #A66C12;
      --danger: #D64545;
      --sidebar-width: 240px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
    }
    a { color: var(--blue); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* ─── Left Sidebar ─── */
    .sidebar {
      width: var(--sidebar-width);
      background: var(--navy);
      color: #FFFFFF;
      height: 100vh;
      position: fixed;
      left: 0;
      top: 0;
      display: flex;
      flex-direction: column;
      z-index: 50;
      overflow-y: auto;
      border-right: 1px solid rgba(255, 255, 255, 0.08);
    }
    .sidebar-header {
      padding: 20px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .logo-icon {
      width: 32px;
      height: 32px;
      background: var(--blue);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      box-shadow: 0 2px 6px rgba(52, 120, 246, 0.35);
    }
    .logo-text {
      font-size: 17px;
      font-weight: 700;
      color: #FFFFFF;
      letter-spacing: -0.02em;
    }
    .logo-badge {
      font-size: 10px;
      font-weight: 600;
      background: rgba(52, 120, 246, 0.25);
      color: #93C5FD;
      padding: 1px 6px;
      border-radius: 10px;
      margin-left: 4px;
    }
    .sidebar-nav {
      flex: 1;
      padding: 16px 10px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 9px 12px;
      border-radius: 8px;
      color: #BFDBFE;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none;
    }
    .nav-item:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #FFFFFF;
      text-decoration: none;
    }
    .nav-item.active {
      background: var(--blue);
      color: #FFFFFF;
      font-weight: 600;
      box-shadow: 0 2px 5px rgba(52, 120, 246, 0.3);
    }
    .nav-item svg {
      width: 17px;
      height: 17px;
      flex-shrink: 0;
    }
    .sidebar-footer {
      padding: 14px 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .user-pill {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 10px 12px;
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .user-initial {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--blue);
      color: white;
      font-weight: bold;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    /* ─── Main Content & TopNav ─── */
    .main-wrapper {
      margin-left: var(--sidebar-width);
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      min-width: 0;
    }
    .top-nav {
      height: 60px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 32px;
      position: sticky;
      top: 0;
      z-index: 40;
    }
    .top-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .breadcrumb-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
    }
    .top-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .page-content {
      flex: 1;
      padding: 32px;
      max-width: 1360px;
      width: 100%;
    }

    /* ─── UI Components ─── */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
      text-decoration: none;
    }
    .btn-primary { background: var(--blue); color: #FFFFFF; }
    .btn-primary:hover { background: var(--blue-hover); color: #FFFFFF; }
    .btn-secondary { background: #FFFFFF; color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: #F8FAFC; border-color: #CBD5E1; }
    .btn-danger { background: var(--danger); color: white; }
    .btn-sm { padding: 5px 10px; font-size: 12px; }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(16, 27, 50, 0.05);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge-blue { background: #EBF2FF; color: #2563EB; }
    .badge-green { background: #ECFDF5; color: var(--success); }
    .badge-gray { background: #F3F4F6; color: var(--text-secondary); }
    .badge-red { background: #FEF2F2; color: var(--danger); }
    .badge-orange { background: #FFFBEB; color: var(--warning); }

    .input {
      width: 100%;
      padding: 9px 12px;
      background: #FFFFFF;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s;
    }
    .input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(52, 120, 246, 0.12); }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .data-table th {
      text-align: left;
      padding: 10px 14px;
      color: var(--text-secondary);
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border);
      background: #F8FAFC;
    }
    .data-table td {
      padding: 13px 14px;
      border-bottom: 1px solid var(--border);
      color: var(--text);
    }
    .data-table tr:last-child td { border-bottom: none; }
    .data-table tr:hover td { background: #F8FAFC; }

    /* ─── Modals ─── */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(16, 27, 50, 0.55);
      backdrop-filter: blur(2px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 16px;
    }
    .modal-backdrop.active { display: flex; }
    .modal-dialog {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      max-width: 500px;
      width: 100%;
      padding: 26px;
      box-shadow: 0 10px 30px rgba(16, 27, 50, 0.2);
    }
  </style>
</head>
<body>

  <!-- ── Left Sidebar Navigation (TrustVault Navy Theme) ── -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="logo-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <div>
        <div class="logo-text">TrustVault <span class="logo-badge">v2.0</span></div>
      </div>
    </div>

    <nav class="sidebar-nav">
      <a class="nav-item active" onclick="switchView('dashboard')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
        <span>Overview</span>
      </a>
      <a class="nav-item" onclick="switchView('documents')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span>My Documents</span>
      </a>
      <a class="nav-item" onclick="switchView('search')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span>Search Documents</span>
      </a>
      <a class="nav-item" onclick="switchView('categories')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span>Categories</span>
      </a>
      <a class="nav-item" onclick="switchView('shared')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        <span>Shared with Me</span>
      </a>
      <a class="nav-item" onclick="switchView('audit')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
        <span id="audit-nav-label">Audit Trail</span>
      </a>
      <a id="nav-users" class="nav-item" style="display:none;" onclick="switchView('users')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>User Management</span>
      </a>
    </nav>

    <div class="sidebar-footer">
      <a class="nav-item" onclick="switchView('settings')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>Profile & Settings</span>
      </a>
      <a class="nav-item" onclick="logout()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span>Sign Out</span>
      </a>

      <div class="user-pill" id="sidebar-user-pill">
        <div class="user-initial" id="user-initial">A</div>
        <div style="flex:1; min-width:0;">
          <div id="user-name" style="font-weight:600; font-size:12px; color:#FFFFFF; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Admin User</div>
          <div id="user-role" style="font-size:10px; color:#93C5FD; text-transform:uppercase;">admin</div>
        </div>
      </div>
    </div>
  </aside>

  <!-- ── Main Content Area ── -->
  <div class="main-wrapper">
    <!-- Top Bar -->
    <header class="top-nav">
      <div class="top-left">
        <span class="breadcrumb-title" id="page-title">Overview</span>
        <span class="badge badge-green" style="font-size:11px;">SHA-256 Ledger Active</span>
      </div>
      <div class="top-right">
        <button class="btn btn-primary btn-sm" onclick="openUploadModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Upload Document
        </button>
      </div>
    </header>

    <!-- Dynamic Page Content -->
    <main class="page-content">

      <!-- 1. DASHBOARD VIEW -->
      <section id="view-dashboard" class="view-panel">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <div>
            <h1 style="font-size:22px; font-weight:700; color:var(--text); letter-spacing:-0.02em;">Security Overview</h1>
            <p style="color:var(--text-secondary); font-size:13px; margin-top:2px;">Real-time status of document vaults, permission grants, and audit chains.</p>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:24px;">
          <div class="card">
            <div style="font-size:11px; text-transform:uppercase; font-weight:600; color:var(--text-secondary);">Total Documents</div>
            <div id="stat-docs" style="font-size:26px; font-weight:700; color:var(--text); margin-top:4px;">--</div>
          </div>
          <div class="card">
            <div style="font-size:11px; text-transform:uppercase; font-weight:600; color:var(--text-secondary);">Active Grants</div>
            <div id="stat-grants" style="font-size:26px; font-weight:700; color:var(--blue); margin-top:4px;">--</div>
          </div>
          <div class="card">
            <div style="font-size:11px; text-transform:uppercase; font-weight:600; color:var(--text-secondary);">Registered Users</div>
            <div id="stat-users" style="font-size:26px; font-weight:700; color:var(--text); margin-top:4px;">--</div>
          </div>
          <div class="card">
            <div style="font-size:11px; text-transform:uppercase; font-weight:600; color:var(--text-secondary);">Audit Events</div>
            <div id="stat-audits" style="font-size:26px; font-weight:700; color:var(--success); margin-top:4px;">--</div>
          </div>
        </div>

        <div class="card" style="margin-bottom:24px;">
          <h2 style="font-size:15px; font-weight:600; margin-bottom:12px;">Recent Documents</h2>
          <table class="data-table">
            <thead>
              <tr><th>Title</th><th>Category</th><th>Owner</th><th>Size</th><th>Actions</th></tr>
            </thead>
            <tbody id="recent-docs-tbody">
              <tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">Loading authorized documents...</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 2. DOCUMENTS VIEW -->
      <section id="view-documents" class="view-panel" style="display:none;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <div>
            <h1 style="font-size:22px; font-weight:700; color:var(--text);">My Documents</h1>
            <p style="color:var(--text-secondary); font-size:13px; margin-top:2px;">Documents owned by your account with fine-grained access control.</p>
          </div>
          <button class="btn btn-primary" onclick="openUploadModal()">Upload New Document</button>
        </div>
        <div class="card">
          <table class="data-table">
            <thead>
              <tr><th>Title</th><th>Category</th><th>Original Filename</th><th>Size</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody id="my-docs-tbody">
              <tr><td colspan="6" style="text-align:center; color:var(--text-secondary);">Loading your documents...</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 3. SEARCH VIEW -->
      <section id="view-search" class="view-panel" style="display:none;">
        <div style="margin-bottom:20px;">
          <h1 style="font-size:22px; font-weight:700; color:var(--text);">Search Documents</h1>
          <p style="color:var(--text-secondary); font-size:13px; margin-top:2px;">Multi-field keyword search across authorized documents with server-side validation.</p>
        </div>
        <div class="card" style="margin-bottom:20px;">
          <div style="display:flex; gap:12px;">
            <input type="text" id="search-input" class="input" placeholder="Search by title, original filename, category, or owner..." onkeydown="if(event.key==='Enter') executeSearch();">
            <button class="btn btn-primary" onclick="executeSearch()">Search</button>
          </div>
        </div>
        <div class="card">
          <table class="data-table">
            <thead>
              <tr><th>Title</th><th>Category</th><th>Owner</th><th>Match</th><th>Actions</th></tr>
            </thead>
            <tbody id="search-results-tbody">
              <tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">Type a keyword and click Search.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 4. CATEGORIES VIEW -->
      <section id="view-categories" class="view-panel" style="display:none;">
        <div style="margin-bottom:20px;">
          <h1 style="font-size:22px; font-weight:700; color:var(--text);">Document Categories</h1>
          <p style="color:var(--text-secondary); font-size:13px; margin-top:2px;">Inspect document breakdown and distribution organized by classification.</p>
        </div>
        <div id="categories-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:16px;">
          <!-- Loaded dynamically -->
        </div>
      </section>

      <!-- 5. SHARED VIEW -->
      <section id="view-shared" class="view-panel" style="display:none;">
        <div style="margin-bottom:20px;">
          <h1 style="font-size:22px; font-weight:700; color:var(--text);">Shared with Me</h1>
          <p style="color:var(--text-secondary); font-size:13px; margin-top:2px;">Documents other owners have explicitly shared with your account.</p>
        </div>
        <div class="card">
          <table class="data-table">
            <thead>
              <tr><th>Title</th><th>Category</th><th>Owner</th><th>Permission Level</th><th>Actions</th></tr>
            </thead>
            <tbody id="shared-docs-tbody">
              <tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">Loading shared documents...</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 6. AUDIT VIEW -->
      <section id="view-audit" class="view-panel" style="display:none;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <div>
            <h1 style="font-size:22px; font-weight:700; color:var(--text);">Tamper-Evident Audit Trail</h1>
            <p style="color:var(--text-secondary); font-size:13px; margin-top:2px;">Cryptographically chained SHA-256 events recording all system actions.</p>
          </div>
          <button class="btn btn-secondary" onclick="verifyAuditChain()">Verify Cryptographic Chain</button>
        </div>
        <div class="card">
          <table class="data-table">
            <thead>
              <tr><th>Timestamp</th><th>Action</th><th>Actor</th><th>Resource</th><th>Outcome</th><th>SHA-256 Hash</th></tr>
            </thead>
            <tbody id="audit-tbody">
              <tr><td colspan="6" style="text-align:center; color:var(--text-secondary);">Loading audit ledger...</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 7. USERS VIEW (Admin Only) -->
      <section id="view-users" class="view-panel" style="display:none;">
        <div style="margin-bottom:20px;">
          <h1 style="font-size:22px; font-weight:700; color:var(--text);">User Management</h1>
          <p style="color:var(--text-secondary); font-size:13px; margin-top:2px;">Manage corporate users, account roles, and status.</p>
        </div>
        <div class="card">
          <table class="data-table">
            <thead>
              <tr><th>Full Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody id="users-tbody">
              <tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">Loading user accounts...</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 8. SETTINGS VIEW -->
      <section id="view-settings" class="view-panel" style="display:none;">
        <div style="margin-bottom:20px;">
          <h1 style="font-size:22px; font-weight:700; color:var(--text);">Profile & Security Settings</h1>
          <p style="color:var(--text-secondary); font-size:13px; margin-top:2px;">Update credentials and review account security.</p>
        </div>
        <div style="max-width:560px;">
          <div class="card" style="margin-bottom:20px;">
            <h2 style="font-size:15px; font-weight:600; margin-bottom:14px;">Update Password</h2>
            <form onsubmit="handlePasswordUpdate(event)" style="display:flex; flex-direction:column; gap:12px;">
              <div>
                <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">Current Password</label>
                <input type="password" id="cur-pass" class="input" required>
              </div>
              <div>
                <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">New Password (min 8 chars)</label>
                <input type="password" id="new-pass" class="input" required>
              </div>
              <div>
                <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">Confirm New Password</label>
                <input type="password" id="conf-pass" class="input" required>
              </div>
              <button type="submit" class="btn btn-primary" style="margin-top:6px;">Update Password</button>
            </form>
          </div>
        </div>
      </section>

    </main>
  </div>

  <!-- ─── Modals: Login & Register ─── -->
  <div id="modal-auth" class="modal-backdrop">
    <div class="modal-dialog">
      <!-- Login Tab -->
      <div id="auth-login-pane">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
          <div class="logo-icon" style="width:28px; height:28px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div>
            <h2 style="font-size:18px; font-weight:700; color:var(--text);">Sign In to TrustVault</h2>
            <p style="font-size:12px; color:var(--text-secondary);">Enter your credentials to access protected documents.</p>
          </div>
        </div>

        <div id="auth-error" style="display:none; padding:10px 12px; background:#FEF2F2; color:#B91C1C; border:1px solid #FECACA; border-radius:8px; font-size:12px; margin-bottom:14px;"></div>

        <form onsubmit="handleLogin(event)" style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">Work Email</label>
            <input type="email" id="login-email" class="input" placeholder="admin@trustvault.dev" required>
          </div>
          <div>
            <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">Password</label>
            <input type="password" id="login-pass" class="input" placeholder="••••••••" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%; padding:10px;">Sign In</button>
        </form>

        <!-- Mandatory User Registration Link -->
        <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border); text-align:center;">
          <p style="font-size:12px; color:var(--text-secondary);">
            Don't have an account?
            <a href="javascript:void(0)" onclick="toggleAuthPane('register')" style="font-weight:600; color:var(--blue); margin-left:4px;">
              Register / Create Account
            </a>
          </p>
        </div>

        <!-- Quick Demo Switcher -->
        <div style="margin-top:16px; background:#F8FAFC; border:1px solid var(--border); border-radius:8px; padding:12px;">
          <div style="font-size:11px; font-weight:700; color:var(--text); text-transform:uppercase; margin-bottom:8px;">
            Demo Credentials (Click to fill)
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
            <button type="button" class="btn btn-secondary btn-sm" style="font-size:11px; justify-content:flex-start;" onclick="fillDemo('admin@trustvault.dev', 'Admin1234!')">
              [Admin] Alice
            </button>
            <button type="button" class="btn btn-secondary btn-sm" style="font-size:11px; justify-content:flex-start;" onclick="fillDemo('owner_a@trustvault.dev', 'Owner1234!')">
              [Owner] Bob
            </button>
            <button type="button" class="btn btn-secondary btn-sm" style="font-size:11px; justify-content:flex-start;" onclick="fillDemo('viewer@trustvault.dev', 'Viewer1234!')">
              [Viewer] Dave
            </button>
            <button type="button" class="btn btn-secondary btn-sm" style="font-size:11px; justify-content:flex-start;" onclick="fillDemo('editor@trustvault.dev', 'Editor1234!')">
              [Editor] Eve
            </button>
          </div>
        </div>
      </div>

      <!-- Register Tab -->
      <div id="auth-register-pane" style="display:none;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
          <div class="logo-icon" style="width:28px; height:28px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          </div>
          <div>
            <h2 style="font-size:18px; font-weight:700; color:var(--text);">Create New Account</h2>
            <p style="font-size:12px; color:var(--text-secondary);">Register an account to secure and manage documents.</p>
          </div>
        </div>

        <div id="reg-error" style="display:none; padding:10px 12px; background:#FEF2F2; color:#B91C1C; border:1px solid #FECACA; border-radius:8px; font-size:12px; margin-bottom:14px;"></div>
        <div id="reg-success" style="display:none; padding:10px 12px; background:#ECFDF5; color:#065F46; border:1px solid #A7F3D0; border-radius:8px; font-size:12px; margin-bottom:14px;"></div>

        <form onsubmit="handleRegister(event)" style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">Full Name</label>
            <input type="text" id="reg-name" class="input" placeholder="Alex Morgan" required>
          </div>
          <div>
            <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">Work Email</label>
            <input type="email" id="reg-email" class="input" placeholder="alex.morgan@company.com" required>
          </div>
          <div>
            <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">Password (min 8 characters)</label>
            <input type="password" id="reg-pass" class="input" placeholder="••••••••" required>
          </div>
          <div>
            <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">Confirm Password</label>
            <input type="password" id="reg-conf" class="input" placeholder="••••••••" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%; padding:10px;">Register Account</button>
        </form>

        <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border); text-align:center;">
          <p style="font-size:12px; color:var(--text-secondary);">
            Already have an account?
            <a href="javascript:void(0)" onclick="toggleAuthPane('login')" style="font-weight:600; color:var(--blue); margin-left:4px;">
              Sign In here
            </a>
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- ─── Upload Modal ─── -->
  <div id="modal-upload" class="modal-backdrop">
    <div class="modal-dialog">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2 style="font-size:17px; font-weight:700; color:var(--text);">Upload Document</h2>
        <button class="btn btn-secondary btn-sm" onclick="closeUploadModal()">✕</button>
      </div>
      <form onsubmit="handleUpload(event)" style="display:flex; flex-direction:column; gap:12px;">
        <div>
          <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">Document Title</label>
          <input type="text" id="up-title" class="input" placeholder="Quarterly Financial Audit" required>
        </div>
        <div>
          <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">Category</label>
          <select id="up-category" class="input" required>
            <option value="Financial">Financial</option>
            <option value="Technical">Technical</option>
            <option value="Legal">Legal</option>
            <option value="HR">HR</option>
            <option value="Contract">Contract</option>
            <option value="Report">Report</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">Select File</label>
          <input type="file" id="up-file" class="input" required>
        </div>
        <div>
          <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">Description (optional)</label>
          <textarea id="up-desc" class="input" rows="2" placeholder="Optional notes..."></textarea>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
          <button type="button" class="btn btn-secondary" onclick="closeUploadModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Upload</button>
        </div>
      </form>
    </div>
  </div>

  <!-- ─── Share Modal ─── -->
  <div id="modal-share" class="modal-backdrop">
    <div class="modal-dialog">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h2 style="font-size:17px; font-weight:700; color:var(--text);">Manage Document Access</h2>
        <button class="btn btn-secondary btn-sm" onclick="closeShareModal()">✕</button>
      </div>
      <div id="share-doc-info" style="font-size:12px; color:var(--text-secondary); margin-bottom:12px;"></div>
      <form onsubmit="handleShareSubmit(event)" style="display:flex; flex-direction:column; gap:12px;">
        <input type="hidden" id="share-doc-id">
        <div>
          <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">Recipient Email</label>
          <input type="email" id="share-email" class="input" placeholder="viewer@trustvault.dev" required>
        </div>
        <div>
          <label style="font-size:12px; font-weight:500; color:var(--text-secondary); display:block; margin-bottom:4px;">Access Permission</label>
          <select id="share-level" class="input">
            <option value="viewer">Viewer (Read / Download)</option>
            <option value="editor">Editor (Read / Edit Metadata)</option>
          </select>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
          <button type="button" class="btn btn-secondary" onclick="closeShareModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Grant Access</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    let token = localStorage.getItem('trustvault_token') || '';
    let currentUser = null;

    function authHeader() {
      return token ? { 'Authorization': 'Bearer ' + token } : {};
    }

    async function api(path, options = {}) {
      options.headers = { ...options.headers, ...authHeader() };
      const res = await fetch('/api/v1' + path, options);
      if (res.status === 401) {
        logout();
        throw new Error('Session expired');
      }
      return res;
    }

    function switchView(name) {
      document.querySelectorAll('.view-panel').forEach(p => p.style.display = 'none');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

      const panel = document.getElementById('view-' + name);
      if (panel) panel.style.display = 'block';

      const navEl = Array.from(document.querySelectorAll('.nav-item')).find(n => n.getAttribute('onclick')?.includes(name));
      if (navEl) navEl.classList.add('active');

      const titleMap = {
        dashboard: 'Overview',
        documents: 'My Documents',
        search: 'Search Documents',
        categories: 'Categories',
        shared: 'Shared with Me',
        audit: 'Audit Trail',
        users: 'User Management',
        settings: 'Profile & Settings'
      };
      document.getElementById('page-title').innerText = titleMap[name] || 'TrustVault';

      if (name === 'dashboard') loadDashboard();
      if (name === 'documents') loadMyDocuments();
      if (name === 'shared') loadSharedDocuments();
      if (name === 'categories') loadCategories();
      if (name === 'audit') loadAudit();
      if (name === 'users') loadUsers();
    }

    function toggleAuthPane(pane) {
      document.getElementById('auth-login-pane').style.display = pane === 'login' ? 'block' : 'none';
      document.getElementById('auth-register-pane').style.display = pane === 'register' ? 'block' : 'none';
      document.getElementById('auth-error').style.display = 'none';
      document.getElementById('reg-error').style.display = 'none';
    }

    function fillDemo(email, pass) {
      document.getElementById('login-email').value = email;
      document.getElementById('login-pass').value = pass;
    }

    async function handleLogin(e) {
      e.preventDefault();
      const errBox = document.getElementById('auth-error');
      errBox.style.display = 'none';
      const email = document.getElementById('login-email').value.trim();
      const pass = document.getElementById('login-pass').value;

      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', pass);

      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Login failed');
        token = data.access_token;
        localStorage.setItem('trustvault_token', token);
        document.getElementById('modal-auth').classList.remove('active');
        await initApp();
      } catch (err) {
        errBox.innerText = err.message;
        errBox.style.display = 'block';
      }
    }

    async function handleRegister(e) {
      e.preventDefault();
      const errBox = document.getElementById('reg-error');
      const succBox = document.getElementById('reg-success');
      errBox.style.display = 'none';
      succBox.style.display = 'none';

      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const pass = document.getElementById('reg-pass').value;
      const conf = document.getElementById('reg-conf').value;

      if (pass !== conf) {
        errBox.innerText = 'Passwords do not match.';
        errBox.style.display = 'block';
        return;
      }

      try {
        const res = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full_name: name, email: email, password: pass, confirm_password: conf })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Registration failed');

        succBox.innerText = 'Registration successful! Signing in...';
        succBox.style.display = 'block';

        // Auto login
        setTimeout(() => {
          fillDemo(email, pass);
          toggleAuthPane('login');
          handleLogin(new Event('submit'));
        }, 1000);
      } catch (err) {
        errBox.innerText = err.message;
        errBox.style.display = 'block';
      }
    }

    function logout() {
      token = '';
      currentUser = null;
      localStorage.removeItem('trustvault_token');
      document.getElementById('modal-auth').classList.add('active');
      toggleAuthPane('login');
    }

    async function initApp() {
      if (!token) {
        document.getElementById('modal-auth').classList.add('active');
        return;
      }
      try {
        const res = await api('/users/me');
        if (!res.ok) throw new Error();
        currentUser = await res.json();

        document.getElementById('user-name').innerText = currentUser.full_name || currentUser.email;
        document.getElementById('user-role').innerText = currentUser.role;
        document.getElementById('user-initial').innerText = (currentUser.full_name || currentUser.email).charAt(0).toUpperCase();

        if (currentUser.role === 'admin') {
          document.getElementById('nav-users').style.display = 'flex';
          document.getElementById('audit-nav-label').innerText = 'Audit Trail (Admin)';
        } else {
          document.getElementById('nav-users').style.display = 'none';
          document.getElementById('audit-nav-label').innerText = 'My Activity';
        }

        switchView('dashboard');
      } catch {
        logout();
      }
    }

    async function loadDashboard() {
      try {
        const sRes = await api('/dashboard/stats');
        if (sRes.ok) {
          const s = await sRes.json();
          document.getElementById('stat-docs').innerText = s.total_documents ?? '--';
          document.getElementById('stat-grants').innerText = s.active_grants ?? '--';
          document.getElementById('stat-users').innerText = s.registered_users ?? '--';
          document.getElementById('stat-audits').innerText = s.total_audit_events ?? '--';
        }

        const dRes = await api('/documents/');
        if (dRes.ok) {
          const docs = await dRes.json();
          const tbody = document.getElementById('recent-docs-tbody');
          if (docs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">No documents available.</td></tr>';
            return;
          }
          tbody.innerHTML = docs.slice(0, 5).map(d => `
            <tr>
              <td><strong>${escapeHtml(d.title)}</strong></td>
              <td><span class="badge badge-blue">${escapeHtml(d.category || 'General')}</span></td>
              <td>${escapeHtml(d.owner?.full_name || d.owner?.email || 'Unknown')}</td>
              <td>${formatBytes(d.file_size)}</td>
              <td>
                <button class="btn btn-secondary btn-sm" onclick="downloadDoc('${d.id}')">Download</button>
                ${(currentUser?.role === 'admin' || currentUser?.id === d.owner_id) ? `<button class="btn btn-secondary btn-sm" onclick="openShareModal('${d.id}', '${escapeHtml(d.title)}')">Share</button>` : ''}
              </td>
            </tr>
          `).join('');
        }
      } catch (err) {
        console.error(err);
      }
    }

    async function loadMyDocuments() {
      try {
        const res = await api('/documents/');
        if (!res.ok) return;
        const docs = await res.json();
        const tbody = document.getElementById('my-docs-tbody');
        const myDocs = docs.filter(d => d.owner_id === currentUser?.id || currentUser?.role === 'admin');
        if (myDocs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-secondary);">You have not uploaded any documents yet.</td></tr>';
          return;
        }
        tbody.innerHTML = myDocs.map(d => `
          <tr>
            <td><strong>${escapeHtml(d.title)}</strong></td>
            <td><span class="badge badge-blue">${escapeHtml(d.category || 'General')}</span></td>
            <td style="font-family:monospace; font-size:12px;">${escapeHtml(d.original_filename)}</td>
            <td>${formatBytes(d.file_size)}</td>
            <td>${new Date(d.created_at).toLocaleDateString()}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="downloadDoc('${d.id}')">Download</button>
              <button class="btn btn-secondary btn-sm" onclick="openShareModal('${d.id}', '${escapeHtml(d.title)}')">Share</button>
            </td>
          </tr>
        `).join('');
      } catch (err) {
        console.error(err);
      }
    }

    async function loadSharedDocuments() {
      try {
        const res = await api('/documents/shared-with-me');
        if (!res.ok) return;
        const docs = await res.json();
        const tbody = document.getElementById('shared-docs-tbody');
        if (docs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">No documents shared with you yet.</td></tr>';
          return;
        }
        tbody.innerHTML = docs.map(d => `
          <tr>
            <td><strong>${escapeHtml(d.title)}</strong></td>
            <td><span class="badge badge-blue">${escapeHtml(d.category || 'General')}</span></td>
            <td>${escapeHtml(d.owner?.full_name || d.owner?.email || 'Owner')}</td>
            <td><span class="badge badge-green">${escapeHtml(d.permission_level || 'Viewer')}</span></td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="downloadDoc('${d.id}')">Download</button>
            </td>
          </tr>
        `).join('');
      } catch (err) {
        console.error(err);
      }
    }

    async function loadCategories() {
      try {
        const res = await api('/documents/categories/summary');
        if (!res.ok) return;
        const cats = await res.json();
        const grid = document.getElementById('categories-grid');
        grid.innerHTML = cats.map(c => `
          <div class="card" style="cursor:pointer;" onclick="filterByCategory('${escapeHtml(c.category)}')">
            <div style="font-size:24px; margin-bottom:8px;">📁</div>
            <h3 style="font-size:15px; font-weight:600; color:var(--text);">${escapeHtml(c.category)}</h3>
            <p style="font-size:12px; color:var(--text-secondary); margin-top:4px;">${c.total_count} authorized file(s)</p>
          </div>
        `).join('');
      } catch (err) {
        console.error(err);
      }
    }

    async function filterByCategory(cat) {
      switchView('search');
      document.getElementById('search-input').value = cat;
      executeSearch();
    }

    async function executeSearch() {
      const q = document.getElementById('search-input').value.trim();
      if (!q) return;
      try {
        const res = await api('/documents/search?query=' + encodeURIComponent(q));
        if (!res.ok) return;
        const docs = await res.json();
        const tbody = document.getElementById('search-results-tbody');
        if (docs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">No documents matching your search.</td></tr>';
          return;
        }
        tbody.innerHTML = docs.map(d => `
          <tr>
            <td><strong>${escapeHtml(d.title)}</strong></td>
            <td><span class="badge badge-blue">${escapeHtml(d.category || 'General')}</span></td>
            <td>${escapeHtml(d.owner?.full_name || d.owner?.email || 'Owner')}</td>
            <td>${escapeHtml(d.original_filename)}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="downloadDoc('${d.id}')">Download</button></td>
          </tr>
        `).join('');
      } catch (err) {
        console.error(err);
      }
    }

    async function loadAudit() {
      try {
        const res = await api('/audit/trail');
        if (!res.ok) return;
        const events = await res.json();
        const tbody = document.getElementById('audit-tbody');
        tbody.innerHTML = events.slice(0, 20).map(e => `
          <tr>
            <td style="font-size:12px;">${new Date(e.created_at).toLocaleString()}</td>
            <td><span class="badge badge-blue">${escapeHtml(e.action)}</span></td>
            <td>${escapeHtml(e.actor_email || 'System')}</td>
            <td style="font-family:monospace; font-size:12px;">${escapeHtml(e.resource_id ? e.resource_id.slice(0,8)+'…' : '—')}</td>
            <td><span class="badge ${e.outcome==='SUCCESS'?'badge-green':'badge-red'}">${escapeHtml(e.outcome)}</span></td>
            <td style="font-family:monospace; font-size:11px; color:var(--text-secondary);">${e.current_hash ? e.current_hash.slice(0,16)+'…' : '—'}</td>
          </tr>
        `).join('');
      } catch (err) {
        console.error(err);
      }
    }

    async function verifyAuditChain() {
      try {
        const res = await api('/audit/verify');
        const data = await res.json();
        if (data.valid) {
          alert('Audit Hash Chain Verified!\n\nAll ' + data.checked + ' cryptographic hashes are continuous and intact with zero tampering.');
        } else {
          alert('Audit Hash Chain Discrepancy Detected:\n' + JSON.stringify(data.errors));
        }
      } catch (err) {
        alert('Verification failed: ' + err.message);
      }
    }

    async function loadUsers() {
      try {
        const res = await api('/users/');
        if (!res.ok) return;
        const users = await res.json();
        const tbody = document.getElementById('users-tbody');
        tbody.innerHTML = users.map(u => `
          <tr>
            <td><strong>${escapeHtml(u.full_name || '—')}</strong></td>
            <td>${escapeHtml(u.email)}</td>
            <td><span class="badge badge-blue">${escapeHtml(u.role)}</span></td>
            <td><span class="badge ${u.is_active ? 'badge-green':'badge-red'}">${u.is_active ? 'Active':'Inactive'}</span></td>
            <td>${new Date(u.created_at).toLocaleDateString()}</td>
          </tr>
        `).join('');
      } catch (err) {
        console.error(err);
      }
    }

    async function handlePasswordUpdate(e) {
      e.preventDefault();
      const cur = document.getElementById('cur-pass').value;
      const n1 = document.getElementById('new-pass').value;
      const n2 = document.getElementById('conf-pass').value;

      if (n1 !== n2) {
        alert('New passwords do not match.');
        return;
      }
      try {
        const res = await api('/users/me/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_password: cur, new_password: n1, confirm_password: n2 })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Password update failed');
        alert('Password updated successfully! Prior sessions have been invalidated.');
        if (data.token) {
          token = data.token;
          localStorage.setItem('trustvault_token', token);
        }
        document.getElementById('cur-pass').value = '';
        document.getElementById('new-pass').value = '';
        document.getElementById('conf-pass').value = '';
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    function openUploadModal() { document.getElementById('modal-upload').classList.add('active'); }
    function closeUploadModal() { document.getElementById('modal-upload').classList.remove('active'); }

    async function handleUpload(e) {
      e.preventDefault();
      const fileInput = document.getElementById('up-file');
      if (!fileInput.files.length) return;

      const fd = new FormData();
      fd.append('file', fileInput.files[0]);
      fd.append('title', document.getElementById('up-title').value);
      fd.append('category', document.getElementById('up-category').value);
      fd.append('description', document.getElementById('up-desc').value);

      try {
        const res = await fetch('/api/v1/documents/', {
          method: 'POST',
          headers: authHeader(),
          body: fd
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Upload failed');
        alert('Document uploaded and hashed to ledger successfully!');
        closeUploadModal();
        switchView('documents');
      } catch (err) {
        alert('Upload Error: ' + err.message);
      }
    }

    function openShareModal(docId, docTitle) {
      document.getElementById('share-doc-id').value = docId;
      document.getElementById('share-doc-info').innerText = 'Grant permission for: ' + docTitle;
      document.getElementById('modal-share').classList.add('active');
    }
    function closeShareModal() { document.getElementById('modal-share').classList.remove('active'); }

    async function handleShareSubmit(e) {
      e.preventDefault();
      const docId = document.getElementById('share-doc-id').value;
      const email = document.getElementById('share-email').value.trim();
      const level = document.getElementById('share-level').value;

      try {
        const res = await api(`/documents/${docId}/permissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, permission_level: level })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to grant permission');
        alert('Permission granted successfully!');
        closeShareModal();
      } catch (err) {
        alert('Permission Error: ' + err.message);
      }
    }

    async function downloadDoc(id) {
      try {
        const res = await fetch(`/api/v1/documents/${id}/download`, { headers: authHeader() });
        if (res.status === 403) {
          alert('Access Denied (HTTP 403): You are not authorized to download this document.');
          return;
        }
        if (!res.ok) {
          alert('Download failed (HTTP ' + res.status + ')');
          return;
        }
        const blob = await res.blob();
        const disposition = res.headers.get('content-disposition') || '';
        let filename = 'document.bin';
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) filename = match[1];

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        alert('Download error: ' + err.message);
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function formatBytes(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Auto initialize on DOM ready
    window.addEventListener('DOMContentLoaded', initApp);
  </script>
</body>
</html>
"""
