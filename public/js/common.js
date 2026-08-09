/**
 * Formalist Common Module
 * Auth check, sidebar init, global variables
 */
window.Formalist = window.Formalist || {};

// Global state
var _currentUser = null;
var _currentFormaliteId = null;
var _serverLoadedData = null; // data_json from server, used for doc generation on resume

// Expose globals
window._currentUser = _currentUser;
window._currentFormaliteId = _currentFormaliteId;
window._serverLoadedData = _serverLoadedData;

function toggleDropdown(el) {
  el.classList.toggle('open');
  var subnav = el.nextElementSibling;
  if (subnav) subnav.classList.toggle('open');
}
window.toggleDropdown = toggleDropdown;

// Injecte badge AVOCAT/ADMIN à côté du logo (style cohérent avec /avocat.html)
function injectSidebarRoleBadge(roles) {
  if (!roles) return;
  var hasAvocat = roles.indexOf('avocat') !== -1;
  var hasAdmin = roles.indexOf('admin') !== -1;
  var logo = document.querySelector('.sidebar-logo');
  if (!logo) return;
  if (logo.querySelector('.logo-badge-admin') || logo.querySelector('.logo-badge-avocat') || logo.querySelector('.logo-badge')) return;
  // Force flex center pour aligner badge avec logo
  logo.style.display = 'flex';
  logo.style.alignItems = 'center';
  logo.style.gap = '10px';
  if (hasAdmin) {
    var b = document.createElement('span');
    b.className = 'logo-badge-admin';
    // Pilule ambre translucide sur la sidebar sombre : fond teinté, texte orange
    // clair, bordure discrète. Un aplat plein jurerait avec le reste du menu.
    b.style.cssText = 'display:inline-flex;align-items:center;padding:4px 9px;'
      + 'background:rgba(245,158,11,0.16);color:#fbbf24;border:1px solid rgba(245,158,11,0.38);'
      + 'border-radius:6px;font-size:10.5px;font-weight:700;letter-spacing: 0;line-height:1;text-transform:uppercase;';
    b.textContent = 'Admin';
    logo.appendChild(b);
  } else if (hasAvocat) {
    var b2 = document.createElement('span');
    b2.className = 'logo-badge-avocat';
    // Même traitement en violet, accordé à l'accès "Espace avocat"
    b2.style.cssText = 'display:inline-flex;align-items:center;padding:4px 9px;'
      + 'background:rgba(167,139,250,0.16);color:#c4b5fd;border:1px solid rgba(167,139,250,0.38);'
      + 'border-radius:6px;font-size:10.5px;font-weight:700;letter-spacing: 0;line-height:1;text-transform:uppercase;';
    b2.textContent = 'Avocat';
    logo.appendChild(b2);
  }
}

// Pré-injection des boutons sidebar depuis le cache (évite le jitter au changement de page)
//
// Tout le monde a la même navigation. Les rôles n'ajoutent qu'un accès
// supplémentaire : "Espace avocat" pour traiter les dossiers à vérifier,
// "Administration" pour la gestion de la plateforme.
function injectSidebarRoleButtons(roles) {
  if (!roles) return;
  // Page ouverte dans un cadre (révision avocat) : pas de navigation à injecter,
  // ses liens chargeraient une autre page dans le cadre.
  if (window.self !== window.top) return;
  var hasAvocat = roles.indexOf('avocat') !== -1;
  var hasAdmin = roles.indexOf('admin') !== -1;
  var nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  var divider = nav.querySelector('.sidebar-divider');

  injectSidebarRoleBadge(roles);

  function place(el) {
    if (divider) nav.insertBefore(el, divider);
    else nav.appendChild(el);
  }

  // Avocat : accès à ses dossiers clients à vérifier
  if (hasAvocat && !nav.querySelector('.sidebar-avocat-link')) {
    var aAvocat = document.createElement('a');
    aAvocat.href = '/avocat.html';
    aAvocat.className = 'sidebar-avocat-link sidebar-role-link';
    aAvocat.dataset.page = 'avocat';
    // Fond neutre plutôt qu'un aplat violet : sur du noir, le violet désaturé
    // vire au gris-mauve. La couleur ne reste que sur le texte et l'icône.
    aAvocat.style.cssText = 'background:rgba(255,255,255,0.05);border:1px solid rgba(196,181,253,0.22);'
      + 'border-radius:10px;color:#ddd6fe;font-weight:600;margin:6px 0;transition:all .15s ease;';
    aAvocat.onmouseover = function(){ this.style.background = 'rgba(255,255,255,0.09)'; this.style.borderColor = 'rgba(196,181,253,0.4)'; this.style.color = '#ede9fe'; };
    aAvocat.onmouseout  = function(){ this.style.background = 'rgba(255,255,255,0.05)'; this.style.borderColor = 'rgba(196,181,253,0.22)'; this.style.color = '#ddd6fe'; };
    aAvocat.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 4v6c0 5-3.8 8.4-9 9-5.2-.6-9-4-9-9V7z"/><polyline points="9 12 11 14 15 10"/></svg>Espace avocat'
      + '<span class="nav-badge" id="badge-avocat" style="display:none;">0</span>';
    place(aAvocat);
  }

  // Admin : gestion de la plateforme
  if (hasAdmin && !nav.querySelector('.sidebar-admin-link')) {
    var aAdmin = document.createElement('a');
    aAdmin.href = '/admin.html';
    aAdmin.className = 'sidebar-admin-link sidebar-role-link';
    aAdmin.dataset.page = 'admin';
    aAdmin.style.cssText = 'background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.32);'
      + 'border-radius:10px;color:#fbbf24;font-weight:600;margin:6px 0;transition:all .15s ease;';
    aAdmin.onmouseover = function(){ this.style.background = 'rgba(245,158,11,0.2)'; this.style.borderColor = 'rgba(245,158,11,0.5)'; this.style.color = '#fcd34d'; };
    aAdmin.onmouseout  = function(){ this.style.background = 'rgba(245,158,11,0.12)'; this.style.borderColor = 'rgba(245,158,11,0.32)'; this.style.color = '#fbbf24'; };
    aAdmin.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Administration';
    place(aAdmin);
  }

  // Marque l'entrée correspondant à la page courante (y compris les accès de rôle)
  var here = location.pathname.replace(/^\//, '').replace('.html', '') || 'dashboard';
  var current = nav.querySelector('a[data-page="' + here + '"]');
  if (current) {
    nav.querySelectorAll('a.active').forEach(function(a) { a.classList.remove('active'); });
    current.classList.add('active');
    // Les accès de rôle sont stylés en ligne : la règle .active de la feuille ne
    // passerait pas devant. On renforce la teinte à la main quand on y est.
    if (current.classList.contains('sidebar-role-link')) {
      var teinte = current.classList.contains('sidebar-admin-link')
        ? { bg: 'rgba(245,158,11,0.22)', bd: 'rgba(245,158,11,0.55)', fg: '#fcd34d' }
        : { bg: 'rgba(255,255,255,0.12)', bd: 'rgba(196,181,253,0.45)', fg: '#ede9fe' };
      current.style.background = teinte.bg;
      current.style.borderColor = teinte.bd;
      current.style.color = teinte.fg;
      current.onmouseout = null; // sinon le survol ramènerait l'état inactif
    }
  }

  setupFormalitesGroup(nav);
}

/**
 * Les parcours pas encore ouverts sont visibles mais ne mènent nulle part :
 * un clic explique au lieu de tomber sur une page inexistante.
 */
function setupFormalitesGroup(nav) {
  nav.querySelectorAll('a[data-soon]').forEach(function(a) {
    if (a.dataset.soonBound) return;
    a.dataset.soonBound = '1';
    a.addEventListener('click', function(e) {
      e.preventDefault();
      var label = a.textContent.replace('Bientôt', '').trim();
      var msg = label + ' : ce parcours arrive prochainement.';
      if (typeof showToast === 'function') showToast(msg);
      else if (typeof toast === 'function') toast(msg);
    });
  });
}

// Injection IMMÉDIATE depuis sessionStorage (pas d'attente du fetch)
(function preInject(){
  try {
    var cached = sessionStorage.getItem('user_roles');
    if (cached) {
      var roles = JSON.parse(cached);
      // Attend que la sidebar soit dans le DOM
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function(){ injectSidebarRoleButtons(roles); });
      } else {
        injectSidebarRoleButtons(roles);
      }
    }
  } catch (_) {}
})();

// Check auth via API - page is also protected server-side
fetch('/api/auth/me').then(function(r) {
  if (r.status !== 200) { window.location.href = '/connexion.html'; return null; }
  return r.json();
}).then(function(data) {
  if (!data) return;
  _currentUser = data.user;
  window._currentUser = _currentUser;
  // Update sidebar user info
  var nameEl = document.querySelector('.user-name');
  var emailEl = document.querySelector('.user-email');
  var avatarEl = document.querySelector('.avatar');
  if (nameEl) nameEl.textContent = data.user.name;
  if (emailEl) emailEl.textContent = data.user.email;
  if (avatarEl) {
    var initials = data.user.name.split(' ').map(function(n) { return n[0]; }).join('').substring(0,2).toUpperCase();
    avatarEl.textContent = initials;
  }
  // Check URL for existing formalite ID
  var urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('id')) {
    _currentFormaliteId = parseInt(urlParams.get('id'));
    window._currentFormaliteId = _currentFormaliteId;
  }
  // Set active service item based on ?type= param (uniquement pour /creation.html avec sub-* IDs)
  var type = urlParams.get('type');
  var isCreation = (window.location.pathname === '/creation.html');
  if (isCreation && (document.getElementById('sub-creation') || type)) {
    document.querySelectorAll('.sidebar-nav a.active').forEach(function(a) { a.classList.remove('active'); });
    var targetId = type ? 'sub-' + type : 'sub-creation';
    var targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.classList.add('active');
  }

  // Multi-roles aware (roles array or single role fallback)
  var _roles = data.user.roles && data.user.roles.length ? data.user.roles : (data.user.role ? [data.user.role] : []);
  // Cache les rôles pour pré-injection lors des navigations suivantes
  try { sessionStorage.setItem('user_roles', JSON.stringify(_roles)); } catch (_) {}
  // Injecte si pas déjà fait (cas de la 1re visite sans cache)
  injectSidebarRoleButtons(_roles);

  // Combien de dossiers attendent la vérification de l'avocat : le chiffre est
  // ce qui rend le raccourci utile, sinon il faut aller voir pour savoir.
  if (_roles.indexOf('avocat') !== -1) {
    fetch('/api/formalites').then(function(r) { return r.json(); }).then(function(d) {
      var aVerifier = (d.formalites || []).filter(function(f) {
        var sp = f.business_sub_phase;
        return (sp === '5a' || sp === '5b') && f.assigned_avocat_id === data.user.id;
      }).length;
      var badge = document.getElementById('badge-avocat');
      if (!badge) return;
      if (aVerifier > 0) { badge.textContent = aVerifier; badge.style.display = ''; }
      else badge.style.display = 'none';
    }).catch(function() {});
  }
}).catch(function() { window.location.href = '/connexion.html'; });

Formalist.common = {
  toggleDropdown: toggleDropdown
};
