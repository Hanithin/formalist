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
    b.style.cssText = 'display:inline-flex;align-items:center;padding:3px 8px;background:#111;color:#fff;border-radius:6px;font-size:10.5px;font-weight:700;letter-spacing:0.5px;line-height:1;text-transform:uppercase;';
    b.textContent = 'Admin';
    logo.appendChild(b);
  } else if (hasAvocat) {
    var b2 = document.createElement('span');
    b2.className = 'logo-badge-avocat';
    b2.style.cssText = 'display:inline-flex;align-items:center;padding:3px 8px;background:#f3e8ff;color:#7c3aed;border-radius:6px;font-size:10.5px;font-weight:700;letter-spacing:0.5px;line-height:1;text-transform:uppercase;';
    b2.textContent = 'Avocat';
    logo.appendChild(b2);
  }
}

// Pré-injection des boutons sidebar depuis le cache (évite le jitter au changement de page)
function injectSidebarRoleButtons(roles) {
  if (!roles) return;
  var hasAvocat = roles.indexOf('avocat') !== -1;
  var hasAdmin = roles.indexOf('admin') !== -1;
  var nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  var divider = nav.querySelector('.sidebar-divider');

  injectSidebarRoleBadge(roles);

  // Avocat : cache le lien "Consultation juridique" (service client) car il a sa propre section
  // Remplace aussi "Tableau de bord" → /avocat.html (le vrai dashboard de l'avocat)
  if (hasAvocat) {
    var consLink = nav.querySelector('a[href="/consultations.html"]');
    if (consLink) consLink.style.display = 'none';
    var dashLink = nav.querySelector('a[href="/dashboard.html"], a[data-page="dashboard"]');
    if (dashLink) {
      dashLink.setAttribute('href', '/avocat.html');
      // Renomme "Tableau de bord" → "Mes dossiers" pour les avocats (plus explicite et évite
      // la confusion avec la "Vue d'ensemble" admin)
      var dashTextNode = null;
      dashLink.childNodes.forEach(function(n) {
        if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) dashTextNode = n;
      });
      if (dashTextNode) dashTextNode.textContent = ' Mes dossiers';
      else dashLink.lastChild && (dashLink.lastChild.textContent = ' Mes dossiers');
    }
  }

  // Admin : cache les liens "user" génériques (Mes formalités, Documents, Contrats) car
  // ils sont redondants avec la section Administration. Cache aussi /dashboard.html quand
  // l'admin n'est pas avocat (sinon le lien a été redirigé vers /avocat.html juste au-dessus).
  if (hasAdmin) {
    var hidePaths = ['/formalites.html', '/documents.html', '/contrats.html'];
    if (!hasAvocat) hidePaths.push('/dashboard.html');
    hidePaths.forEach(function(p) {
      var link = nav.querySelector('a[href="' + p + '"], a[href^="' + p + '?"]');
      if (link) link.style.display = 'none';
    });
  }

  // Avocat : section "Avocat" avec Consultations + Mes disponibilités
  // ("Espace avocat" supprimé — Tableau de bord pointe déjà vers /avocat.html pour les avocats)
  if (hasAvocat && !nav.querySelector('.sidebar-avocat-section')) {
    var section = document.createElement('div');
    section.className = 'sidebar-section sidebar-avocat-section';
    section.textContent = 'Avocat';
    var avCons = document.createElement('a');
    avCons.href = '/avocat.html#consultations';
    avCons.className = 'sidebar-avocat-link';
    avCons.dataset.page = 'avocat-consultations';
    avCons.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.78;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Consultations';
    var avDispo = document.createElement('a');
    avDispo.href = '/avocat.html#disponibilites';
    avDispo.className = 'sidebar-avocat-link';
    avDispo.dataset.page = 'avocat-disponibilites';
    avDispo.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.78;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Mes disponibilités';
    if (divider) {
      nav.insertBefore(section, divider);
      nav.insertBefore(avCons, divider);
      nav.insertBefore(avDispo, divider);
    } else {
      nav.appendChild(section);
      nav.appendChild(avCons);
      nav.appendChild(avDispo);
    }
  }

  // Admin : un seul lien "Administration" (background ambre, aligné avec les autres liens).
  // On préserve le fond/border mais on s'aligne sur les liens normaux (mêmes padding et
  // gap que .sidebar-nav a), pas de margin horizontale.
  if (hasAdmin && !nav.querySelector('.sidebar-admin-section, .sidebar-admin-link')) {
    var aAdmin = document.createElement('a');
    aAdmin.href = '/admin.html';
    aAdmin.className = 'sidebar-admin-link sidebar-admin-section';
    aAdmin.style.cssText = 'background:#fffbeb;border:1px solid #fde68a;border-radius:10px;color:#b45309;font-weight:600;margin:6px 0;transition:all .15s ease;';
    aAdmin.onmouseover = function(){ this.style.background = '#fef3c7'; this.style.borderColor = '#fcd34d'; };
    aAdmin.onmouseout  = function(){ this.style.background = '#fffbeb'; this.style.borderColor = '#fde68a'; };
    aAdmin.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Administration';
    if (divider) nav.insertBefore(aAdmin, divider);
    else nav.appendChild(aAdmin);
  }
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
}).catch(function() { window.location.href = '/connexion.html'; });

Formalist.common = {
  toggleDropdown: toggleDropdown
};
