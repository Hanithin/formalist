#!/usr/bin/env node
/**
 * Propage la nouvelle sidebar (HTML + modal + CSS + JS) sur toutes les pages
 * en dehors de dashboard.html (qui est la source canonique).
 *
 * Stratégie : on injecte un <style> et un <script> isolés en fin de <head>
 * et juste avant </body>, et on remplace le bloc <aside>...</aside> existant.
 * Pas de modification de CSS/JS existants → zéro risque de régression.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// active page par fichier (clé data-page de la sidebar). null = aucun item actif
const PAGES = {
  'formalites.html':         'formalites',
  'documents.html':          'documents',
  'contrats.html':           'contrats',
  'messagerie.html':         'messagerie',
  'avocat.html':             'avocat',
  'aide.html':               'aide',
  'creation.html':           null,
  'modification.html':       null,
  'auto-entrepreneur.html':  null,
  'parametres.html':         null
};

const SIDEBAR_HTML = (activePage) => `<aside class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <a href="/dashboard.html">
        <span class="logo-text">formalist</span>
        <span class="logo-dot" aria-hidden="true"></span>
      </a>
    </div>

    <div class="sidebar-context" id="sidebar-context" style="display:none;">
      <div class="ctx-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h0M15 9h0M9 13h0M15 13h0M9 17h0M15 17h0"/></svg>
      </div>
      <div class="ctx-body">
        <div class="ctx-label">Soci&eacute;t&eacute; active</div>
        <div class="ctx-name" id="ctx-name"></div>
      </div>
      <svg class="ctx-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    </div>

    <button class="sidebar-cta" onclick="openNewActionModal()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Nouvelle formalit&eacute;
    </button>

    <nav class="sidebar-nav">
      <a${activePage==='dashboard' ? ' class="active"' : ''} href="/dashboard.html" data-page="dashboard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Tableau de bord
      </a>
      <a${activePage==='formalites' ? ' class="active"' : ''} href="/formalites.html" data-page="formalites">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Mes formalit&eacute;s
        <span class="nav-badge" id="badge-formalites" style="display:none;">0</span>
      </a>
      <a${activePage==='documents' ? ' class="active"' : ''} href="/documents.html" data-page="documents">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
        Documents
      </a>
      <a${activePage==='contrats' ? ' class="active"' : ''} href="/contrats.html" data-page="contrats">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Contrats
      </a>
      <a${activePage==='messagerie' ? ' class="active"' : ''} href="/messagerie.html" data-page="messagerie">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        Messagerie
        <span class="nav-badge" id="badge-messagerie" style="display:none;">0</span>
      </a>

      <div class="sidebar-section">Services</div>
      <a${activePage==='avocat' ? ' class="active"' : ''} href="/avocat.html" data-page="avocat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Consultation juridique
      </a>

      <div class="sidebar-divider"></div>
      <a${activePage==='aide' ? ' class="active"' : ''} href="/aide.html" data-page="aide">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Aide &amp; FAQ
      </a>
    </nav>

    <div class="sidebar-bottom">
      <div class="avatar" id="sidebar-avatar">JD</div>
      <div class="user-info">
        <div class="user-name" id="sidebar-name">Jean Dupont</div>
        <div class="user-email" id="sidebar-email">test@formalist.fr</div>
      </div>
      <a href="/parametres.html" class="btn-settings" title="Param&egrave;tres">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      </a>
      <button class="btn-logout" onclick="fetch('/api/auth/logout',{method:'POST'}).then(function(){sessionStorage.removeItem('user');window.location.href='/connexion.html';})" title="D&eacute;connexion">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </div>
  </aside>`;

const MODAL_HTML = `
  <!-- MODAL : Nouvelle formalit&eacute; -->
  <div class="nd-modal-backdrop" id="ndModal" onclick="closeNewActionModal(event)">
    <div class="nd-modal" onclick="event.stopPropagation()">
      <div class="nd-header">
        <div>
          <h3 class="nd-title">Nouvelle formalit&eacute;</h3>
          <p class="nd-subtitle">Choisissez le type d&apos;op&eacute;ration &agrave; lancer</p>
        </div>
        <button class="nd-close" onclick="closeNewActionModal()" aria-label="Fermer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="nd-grid">
        <a href="/creation.html?new=1&type=creation" class="nd-card">
          <div class="nd-card-icon green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14"/></svg></div>
          <div class="nd-card-body"><div class="nd-card-title">Cr&eacute;er une soci&eacute;t&eacute;</div><div class="nd-card-desc">SAS, SARL, SCI, SASU, EURL</div></div>
        </a>
        <a href="/auto-entrepreneur.html?new=1" class="nd-card">
          <div class="nd-card-icon blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/></svg></div>
          <div class="nd-card-body"><div class="nd-card-title">Auto-entrepreneur</div><div class="nd-card-desc">Cr&eacute;ation de micro-entreprise</div></div>
        </a>
        <a href="/modification.html" class="nd-card">
          <div class="nd-card-icon violet"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
          <div class="nd-card-body"><div class="nd-card-title">Modifier ma soci&eacute;t&eacute;</div><div class="nd-card-desc">Transfert, g&eacute;rant, capital&hellip;</div></div>
        </a>
        <a href="#" class="nd-card">
          <div class="nd-card-icon amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
          <div class="nd-card-body"><div class="nd-card-title">D&eacute;poser mes comptes</div><div class="nd-card-desc">D&eacute;p&ocirc;t annuel au greffe</div></div>
        </a>
        <a href="#" class="nd-card">
          <div class="nd-card-icon red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div>
          <div class="nd-card-body"><div class="nd-card-title">Fermer ma soci&eacute;t&eacute;</div><div class="nd-card-desc">Dissolution, liquidation, radiation</div></div>
        </a>
        <a href="/contrats.html?new=1" class="nd-card">
          <div class="nd-card-icon teal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
          <div class="nd-card-body"><div class="nd-card-title">R&eacute;diger un contrat</div><div class="nd-card-desc">Mod&egrave;les sur mesure</div></div>
        </a>
      </div>
    </div>
  </div>`;

const NEW_CSS = `
  <!-- BEGIN sidebar refresh (auto-generated) -->
  <style>
    /* Logo */
    .sidebar-logo a { display: inline-flex !important; align-items: baseline !important; gap: 3px !important; }
    .sidebar-logo .logo-text {
      font-family: 'Cal Sans', 'Inter', sans-serif !important;
      font-size: 30px !important; font-weight: 700 !important;
      letter-spacing: 0 !important; line-height: 1 !important;
      color: #111 !important;
    }
    .sidebar-logo .logo-dot {
      display: inline-block; width: 7px; height: 7px;
      border-radius: 50%; background: #10b981;
      margin-bottom: 4px;
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.18);
    }

    /* Société active */
    .sidebar-context {
      margin: 0 12px 12px; padding: 10px 12px;
      background: #fafafa; border: 1px solid #eee; border-radius: 10px;
      display: flex; align-items: center; gap: 10px;
      cursor: pointer; transition: background 0.15s, border-color 0.15s;
    }
    .sidebar-context:hover { background: #f3f3f4; border-color: #e2e2e4; }
    .sidebar-context .ctx-icon {
      width: 32px; height: 32px; border-radius: 8px;
      background: #111; color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .sidebar-context .ctx-icon svg { width: 17px; height: 17px; stroke-width: 1.6; }
    .sidebar-context .ctx-body { flex: 1; min-width: 0; }
    .sidebar-context .ctx-label { font-size: 10.5px; color: #999; font-weight: 500; letter-spacing: 0.3px; text-transform: uppercase; }
    .sidebar-context .ctx-name { font-size: 13.5px; color: #111; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sidebar-context .ctx-chevron { width: 14px; height: 14px; color: #999; flex-shrink: 0; opacity: 0.6; }
    .sidebar-context.single { cursor: default; }
    .sidebar-context.single:hover { background: #fafafa; border-color: #eee; }
    .sidebar-context.single .ctx-chevron { display: none; }

    /* CTA primaire */
    .sidebar-cta {
      margin: 0 12px 16px; padding: 11px 14px;
      background: #111; color: #fff; border: none;
      border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      transition: background 0.15s, transform 0.05s; font-family: inherit;
    }
    .sidebar-cta:hover { background: #2a2a2c; }
    .sidebar-cta:active { transform: scale(0.99); }
    .sidebar-cta svg { width: 16px; height: 16px; stroke-width: 2; }

    /* Badges dans la nav */
    .nav-badge {
      margin-left: auto;
      background: #ef4444; color: #fff;
      font-size: 11px; font-weight: 600;
      padding: 2px 7px; border-radius: 10px;
      min-width: 20px; text-align: center; line-height: 1.4;
    }
    .nav-badge.muted { background: #f0f0f2; color: #666; }

    /* Modal Nouvelle formalité */
    .nd-modal-backdrop {
      display: none; position: fixed; inset: 0; z-index: 1000;
      background: rgba(17, 17, 17, 0.45); backdrop-filter: blur(2px);
      align-items: center; justify-content: center; padding: 24px;
    }
    .nd-modal-backdrop.open { display: flex; animation: ndFadeIn 0.15s ease; }
    @keyframes ndFadeIn { from { opacity: 0; } to { opacity: 1; } }
    .nd-modal {
      background: #fff; border-radius: 16px; max-width: 720px; width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.18);
      overflow: hidden; animation: ndSlideUp 0.18s ease;
    }
    @keyframes ndSlideUp { from { transform: translateY(8px); opacity: 0.6; } to { transform: translateY(0); opacity: 1; } }
    .nd-header { padding: 22px 24px 18px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 1px solid #f0f0f2; }
    .nd-title { font-size: 19px; font-weight: 600; color: #111; margin: 0; }
    .nd-subtitle { font-size: 13.5px; color: #888; margin: 4px 0 0; }
    .nd-close { background: none; border: none; cursor: pointer; color: #999; padding: 4px; border-radius: 8px; transition: background 0.15s, color 0.15s; display: flex; align-items: center; justify-content: center; }
    .nd-close svg { width: 20px; height: 20px; }
    .nd-close:hover { background: #f5f5f7; color: #111; }
    .nd-grid { padding: 18px; display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
    .nd-card { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 1px solid #eee; border-radius: 12px; text-decoration: none; color: inherit; transition: border-color 0.15s, background 0.15s, transform 0.05s; }
    .nd-card:hover { border-color: #111; background: #fafafa; }
    .nd-card:active { transform: scale(0.99); }
    .nd-card-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .nd-card-icon svg { width: 19px; height: 19px; }
    .nd-card-icon.green { background: #e8f5e9; color: #2e7d32; }
    .nd-card-icon.blue { background: #e3f2fd; color: #1565c0; }
    .nd-card-icon.violet { background: #ede7f6; color: #5e35b1; }
    .nd-card-icon.amber { background: #fff8e1; color: #b8860b; }
    .nd-card-icon.red { background: #ffebee; color: #c62828; }
    .nd-card-icon.teal { background: #e0f2f1; color: #00695c; }
    .nd-card-title { font-size: 14px; font-weight: 600; color: #111; }
    .nd-card-desc { font-size: 12.5px; color: #888; margin-top: 2px; }
    @media (max-width: 600px) { .nd-grid { grid-template-columns: 1fr; } }
  </style>
  <!-- END sidebar refresh -->`;

const NEW_JS = `
  <!-- BEGIN sidebar refresh JS (auto-generated) -->
  <script>
    (function() {
      function openNewActionModal() {
        var m = document.getElementById('ndModal');
        if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
      }
      function closeNewActionModal(e) {
        if (e && e.target && e.target.closest && e.target.closest('.nd-modal') && !e.target.closest('.nd-close')) return;
        var m = document.getElementById('ndModal');
        if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
      }
      window.openNewActionModal = openNewActionModal;
      window.closeNewActionModal = closeNewActionModal;
      document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeNewActionModal(); });

      // Société active + badges
      fetch('/api/formalites').then(function(r){ return r.json(); }).then(function(data){
        var list = (data && data.formalites) || data || [];
        if (!Array.isArray(list)) return;
        var societes = list.filter(function(f){ return f && f.denomination && (f.type === 'creation' || f.type === 'modification' || !f.type); });
        var ctx = document.getElementById('sidebar-context');
        var nameEl = document.getElementById('ctx-name');
        if (societes.length === 0) {
          if (ctx) ctx.style.display = 'none';
        } else if (societes.length === 1) {
          if (ctx) ctx.style.display = '';
          if (nameEl) nameEl.textContent = societes[0].denomination;
          ctx.classList.add('single');
        } else {
          if (ctx) ctx.style.display = '';
          if (nameEl) nameEl.textContent = societes[0].denomination;
          ctx.classList.remove('single');
        }
        var enCours = list.filter(function(f){ return f && f.statut && f.statut !== 'termine' && f.statut !== 'archive'; }).length;
        var badge = document.getElementById('badge-formalites');
        if (badge && enCours > 0) { badge.textContent = String(enCours); badge.style.display = 'inline-block'; badge.classList.add('muted'); }
      }).catch(function(){});
      fetch('/api/support/unread').then(function(r){ return r.json(); }).then(function(data){
        var n = (data && data.unread) || 0;
        var badge = document.getElementById('badge-messagerie');
        if (badge && n > 0) { badge.textContent = String(n); badge.style.display = 'inline-block'; }
      }).catch(function(){});
    })();
  </script>
  <!-- END sidebar refresh JS -->`;

const ASIDE_REGEX = /<aside class="sidebar"[^>]*id="sidebar"[^>]*>[\s\S]*?<\/aside>/;
const REFRESH_CSS_REGEX = /<!-- BEGIN sidebar refresh \(auto-generated\) -->[\s\S]*?<!-- END sidebar refresh -->/;
const REFRESH_JS_REGEX  = /<!-- BEGIN sidebar refresh JS \(auto-generated\) -->[\s\S]*?<!-- END sidebar refresh JS -->/;
const MODAL_REGEX = /<!-- MODAL : Nouvelle d[^>]*marche -->[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;

function processFile(file, activePage) {
  const p = path.join(PUBLIC_DIR, file);
  let html = fs.readFileSync(p, 'utf8');

  // 1) Remplace le <aside> existant
  if (!ASIDE_REGEX.test(html)) {
    console.log("  pas d'<aside class=\"sidebar\"> dans", file);
    return false;
  }
  html = html.replace(ASIDE_REGEX, SIDEBAR_HTML(activePage));

  // 2) Insert/replace CSS additions juste avant </head>
  if (REFRESH_CSS_REGEX.test(html)) {
    html = html.replace(REFRESH_CSS_REGEX, NEW_CSS.trim());
  } else if (html.indexOf('</head>') !== -1) {
    html = html.replace('</head>', NEW_CSS + '\n</head>');
  }

  // 3) Insert/replace modal HTML — juste après </aside>
  if (MODAL_REGEX.test(html)) {
    html = html.replace(MODAL_REGEX, MODAL_HTML.trim());
  } else {
    html = html.replace('</aside>', '</aside>' + MODAL_HTML);
  }

  // 4) Insert/replace JS additions juste avant </body>
  if (REFRESH_JS_REGEX.test(html)) {
    html = html.replace(REFRESH_JS_REGEX, NEW_JS.trim());
  } else if (html.indexOf('</body>') !== -1) {
    html = html.replace('</body>', NEW_JS + '\n</body>');
  }

  fs.writeFileSync(p, html);
  return true;
}

let ok = 0;
let fail = 0;
Object.keys(PAGES).forEach(function(file) {
  const p = path.join(PUBLIC_DIR, file);
  if (!fs.existsSync(p)) {
    console.log('  -- skip', file, '(introuvable)');
    return;
  }
  process.stdout.write('  → ' + file + ' ');
  try {
    const success = processFile(file, PAGES[file]);
    if (success) { console.log('✓'); ok++; }
    else { console.log('✗'); fail++; }
  } catch (e) {
    console.log('ERR', e.message);
    fail++;
  }
});
console.log('\nDone. ' + ok + ' fichiers traités, ' + fail + ' échec(s).');
