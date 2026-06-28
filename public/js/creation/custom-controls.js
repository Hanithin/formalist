/**
 * Formalist Custom Controls Module
 * Custom select, datepicker, city autocomplete, address autocomplete
 */
window.Formalist = window.Formalist || {};

// ==================== CUSTOM SELECT ====================
function initCustomSelect(sel) {
  if (sel._csInit) return;
  sel._csInit = true;

  var wrap = document.createElement('div');
  wrap.className = 'cselect';
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);

  var trigger = document.createElement('div');
  trigger.className = 'cselect-trigger';
  wrap.appendChild(trigger);

  var opts = document.createElement('div');
  opts.className = 'cselect-opts';
  wrap.appendChild(opts);

  function buildOpts() {
    opts.innerHTML = '';
    Array.from(sel.options).forEach(function(o, i) {
      if (o.disabled && o.value === '') return; // skip placeholder
      var div = document.createElement('div');
      div.className = 'cselect-opt' + (sel.selectedIndex === i ? ' selected' : '');
      div.textContent = o.textContent;
      div.dataset.index = i;
      div.addEventListener('mousedown', function(e) {
        e.preventDefault();
        sel.selectedIndex = i;
        sel.dispatchEvent(new Event('change'));
        updateTrigger();
        close();
      });
      opts.appendChild(div);
    });
  }

  function updateTrigger() {
    var o = sel.options[sel.selectedIndex];
    if (!o || (o.disabled && o.value === '')) {
      trigger.textContent = 'Choisir...';
      trigger.classList.add('placeholder');
    } else {
      trigger.textContent = o.textContent;
      trigger.classList.remove('placeholder');
    }
    // Update selected state
    opts.querySelectorAll('.cselect-opt').forEach(function(d) {
      d.classList.toggle('selected', parseInt(d.dataset.index) === sel.selectedIndex);
    });
  }

  function resetPanelZ() {
    document.querySelectorAll('#dirigeant-panels .associe-panel').forEach(function(p) { p.style.zIndex = ''; });
  }
  function close() {
    wrap.classList.remove('open');
    resetPanelZ();
  }
  function toggle() {
    var isOpen = wrap.classList.contains('open');
    // Close all others
    document.querySelectorAll('.cselect.open').forEach(function(c) { c.classList.remove('open'); });
    resetPanelZ();
    if (!isOpen) {
      buildOpts();
      wrap.classList.add('open');
      var dirPanel = wrap.closest('#dirigeant-panels .associe-panel');
      if (dirPanel) dirPanel.style.zIndex = '100';
    }
  }

  trigger.addEventListener('click', function(e) { e.stopPropagation(); toggle(); });
  document.addEventListener('click', function() { close(); });

  updateTrigger();

  // Observe changes to select (for programmatic updates)
  var observer = new MutationObserver(function() { updateTrigger(); });
  observer.observe(sel, { attributes: true, childList: true, subtree: true });
}
window.initCustomSelect = initCustomSelect;

function initAllCustomSelects() {
  document.querySelectorAll('.field select:not(._csInit)').forEach(function(sel) {
    initCustomSelect(sel);
  });
}
window.initAllCustomSelects = initAllCustomSelects;

// ==================== CUSTOM DATEPICKER ====================
var CDP_MONTHS = ['Janvier','F\u00e9vrier','Mars','Avril','Mai','Juin','Juillet','Ao\u00fbt','Septembre','Octobre','Novembre','D\u00e9cembre'];
var CDP_DAYS = ['L','M','M','J','V','S','D'];

function initCustomDate(input) {
  if (input._cdpInit) return;
  input._cdpInit = true;

  var wrap = document.createElement('div');
  wrap.className = 'cdp';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  var trigger = document.createElement('div');
  trigger.className = 'cdp-trigger';
  wrap.appendChild(trigger);

  var cal = document.createElement('div');
  cal.className = 'cdp-cal';
  wrap.appendChild(cal);

  var viewYear, viewMonth;
  var val = input.value ? new Date(input.value + 'T00:00:00') : null;
  if (val && !isNaN(val)) { viewYear = val.getFullYear(); viewMonth = val.getMonth(); }
  else { var n = new Date(); viewYear = n.getFullYear(); viewMonth = n.getMonth(); }

  function fmt(d) {
    if (!d) return '';
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  }
  function iso(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function updateTrigger() {
    var v = input.value ? new Date(input.value + 'T00:00:00') : null;
    if (v && !isNaN(v)) {
      trigger.textContent = fmt(v);
      trigger.classList.remove('placeholder');
    } else {
      trigger.textContent = 'jj/mm/aaaa';
      trigger.classList.add('placeholder');
    }
  }

  function render() {
    var today = new Date(); today.setHours(0,0,0,0);
    var selDate = input.value ? new Date(input.value + 'T00:00:00') : null;
    var first = new Date(viewYear, viewMonth, 1);
    var startDay = (first.getDay() + 6) % 7; // Monday=0
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var prevDays = new Date(viewYear, viewMonth, 0).getDate();

    var html = '<div class="cdp-header">'
      + '<button class="cdp-nav" data-dir="-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>'
      + '<span>' + CDP_MONTHS[viewMonth] + ' ' + viewYear + '</span>'
      + '<button class="cdp-nav" data-dir="1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>'
      + '</div><div class="cdp-grid">';

    CDP_DAYS.forEach(function(d) { html += '<div class="cdp-dow">' + d + '</div>'; });

    // Previous month
    for (var p = startDay - 1; p >= 0; p--) {
      var pd = prevDays - p;
      html += '<div class="cdp-day other" data-y="' + (viewMonth === 0 ? viewYear-1 : viewYear) + '" data-m="' + (viewMonth === 0 ? 11 : viewMonth-1) + '" data-d="' + pd + '">' + pd + '</div>';
    }
    // Current month
    for (var d = 1; d <= daysInMonth; d++) {
      var cls = 'cdp-day';
      var dt = new Date(viewYear, viewMonth, d);
      if (dt.getTime() === today.getTime()) cls += ' today';
      if (selDate && dt.getTime() === selDate.getTime()) cls += ' selected';
      html += '<div class="' + cls + '" data-y="' + viewYear + '" data-m="' + viewMonth + '" data-d="' + d + '">' + d + '</div>';
    }
    // Next month
    var total = startDay + daysInMonth;
    var rem = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (var n = 1; n <= rem; n++) {
      html += '<div class="cdp-day other" data-y="' + (viewMonth === 11 ? viewYear+1 : viewYear) + '" data-m="' + (viewMonth === 11 ? 0 : viewMonth+1) + '" data-d="' + n + '">' + n + '</div>';
    }
    html += '</div>';
    cal.innerHTML = html;

    // Nav events
    cal.querySelectorAll('.cdp-nav').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var dir = parseInt(btn.dataset.dir);
        viewMonth += dir;
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        render();
      });
    });
    // Day events
    cal.querySelectorAll('.cdp-day').forEach(function(day) {
      day.addEventListener('click', function(e) {
        e.stopPropagation();
        var picked = new Date(parseInt(day.dataset.y), parseInt(day.dataset.m), parseInt(day.dataset.d));
        input.value = iso(picked);
        input.dispatchEvent(new Event('change'));
        updateTrigger();
        wrap.classList.remove('open');
      });
    });
  }

  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    var wasOpen = wrap.classList.contains('open');
    document.querySelectorAll('.cdp.open').forEach(function(c) { c.classList.remove('open'); });
    if (!wasOpen) {
      var v = input.value ? new Date(input.value + 'T00:00:00') : null;
      if (v && !isNaN(v)) { viewYear = v.getFullYear(); viewMonth = v.getMonth(); }
      render();
      wrap.classList.add('open');
    }
  });
  document.addEventListener('click', function() { wrap.classList.remove('open'); });
  cal.addEventListener('click', function(e) { e.stopPropagation(); });

  // Re-sync le trigger visible quand la valeur est modifiée par programme
  // (restauration depuis localStorage, prefill dev, etc.)
  input.addEventListener('change', updateTrigger);
  // Expose une méthode pour forcer la synchronisation depuis l'extérieur
  input._cdpSync = updateTrigger;

  updateTrigger();
}
window.initCustomDate = initCustomDate;

function initAllCustomDates() {
  document.querySelectorAll('.field input[type="date"]').forEach(function(inp) {
    initCustomDate(inp);
  });
}
window.initAllCustomDates = initAllCustomDates;

// ==================== GOOGLE PLACES AUTOCOMPLETE ====================
// Autocomplétion d'adresse via la Base Adresse Nationale (api-adresse.data.gouv.fr).
// Gratuite, sans clé, dédiée aux adresses françaises. Remplit rue + ville + CP.
function _applyAddress(input, p) {
  var street = p.name || ((p.housenumber ? p.housenumber + ' ' : '') + (p.street || ''));
  var city = p.city || '';
  var postal = p.postcode || '';
  // Champs ville/CP liés : la banque a ses propres champs, sinon ceux du siège (étape 1)
  var villeInput, cpInput;
  if (input.id === 'banque-autre-adresse') {
    villeInput = document.getElementById('banque-autre-ville');
    cpInput = document.getElementById('banque-autre-cp');
  } else {
    var stepContent = input.closest('.step-content[data-step="1"]');
    villeInput = stepContent ? stepContent.querySelector('input[placeholder="Ville"]') : null;
    cpInput = stepContent ? stepContent.querySelector('input[placeholder="Code postal"]') : null;
  }
  if (villeInput && cpInput) {
    // Étape 1 société : rue dans l'input, ville/CP dans des champs séparés
    input.value = street || p.label || '';
    if (city) { villeInput.value = city; villeInput.dispatchEvent(new Event('input')); }
    if (postal) { cpInput.value = postal; cpInput.dispatchEvent(new Event('input')); }
  } else {
    // Associés/dirigeants : adresse complète dans un seul champ
    var parts = [];
    if (street) parts.push(street);
    if (postal) parts.push(postal);
    if (city) parts.push(city);
    input.value = parts.join(', ') || p.label || '';
  }
  // Notifie la sauvegarde sans rouvrir le dropdown
  input._skipAutocomplete = true;
  input.dispatchEvent(new Event('input'));
}

function initAddressAutocomplete(input) {
  if (input._autocompleteInit) return;
  input._autocompleteInit = true;

  var dropdown = document.createElement('div');
  dropdown.className = 'addr-dropdown';
  dropdown.style.cssText = 'display:none;position:absolute;z-index:10000;background:#fff;border:1px solid #e0e0e0;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.1);max-height:240px;overflow-y:auto;margin-top:2px;';
  input.parentNode.style.position = 'relative';
  input.parentNode.appendChild(dropdown);

  var debounceTimer = null;
  var feats = [];
  input.addEventListener('input', function() {
    // Ignore l'événement déclenché par la sélection d'une suggestion
    // (sinon le dropdown se rouvre aussitôt).
    if (input._skipAutocomplete) { input._skipAutocomplete = false; dropdown.style.display = 'none'; return; }
    var q = input.value.trim();
    if (q.length < 3) { dropdown.style.display = 'none'; return; }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      fetch('https://api-adresse.data.gouv.fr/search/?q=' + encodeURIComponent(q) + '&limit=6&autocomplete=1')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          feats = (data && data.features) || [];
          if (!feats.length) { dropdown.style.display = 'none'; return; }
          dropdown.innerHTML = feats.map(function(f, i) {
            var esc = document.createElement('div');
            esc.textContent = (f.properties && f.properties.label) || '';
            return '<div class="addr-option" data-index="' + i + '" style="padding:10px 14px;font-size:14px;cursor:pointer;border-bottom:1px solid #f0f0f0;">' + esc.innerHTML + '</div>';
          }).join('');
          dropdown.style.display = 'block';
          dropdown.style.width = input.offsetWidth + 'px';
          dropdown.querySelectorAll('.addr-option').forEach(function(opt) {
            opt.addEventListener('mouseenter', function() { opt.style.background = '#f7f7f7'; });
            opt.addEventListener('mouseleave', function() { opt.style.background = '#fff'; });
            opt.addEventListener('mousedown', function(e) {
              e.preventDefault();
              var f = feats[parseInt(opt.dataset.index)];
              dropdown.style.display = 'none';
              if (f && f.properties) _applyAddress(input, f.properties);
            });
          });
        })
        .catch(function() { dropdown.style.display = 'none'; });
    }, 250);
  });
  input.addEventListener('blur', function() { setTimeout(function() { dropdown.style.display = 'none'; }, 150); });
}
window.initAddressAutocomplete = initAddressAutocomplete;

// Autocomplétion société (personne morale) via l'API Recherche d'entreprises
// (gouv, gratuite). Remplit dénomination, forme, SIREN, RCS, ville, siège.
var _FORME_JURIDIQUE = {
  // SAS / SARL
  '5710': 'SAS', '5720': 'SASU', '5499': 'SARL', '5498': 'EURL',
  // SA
  '5410': 'SA', '5415': 'SA', '5422': 'SA', '5430': 'SA', '5505': 'SA', '5510': 'SA', '5515': 'SA', '5520': 'SA', '5530': 'SA', '5599': 'SA',
  // Sociétés civiles
  '6540': 'SCI', '6533': 'SCI', '6534': 'SCI', '6532': 'SCI', '6521': 'SCPI', '6585': 'SC', '6588': 'SC',
  // Sociétés en nom collectif / commandite
  '5202': 'SNC', '5306': 'SCS', '5307': 'SCA',
  // Sociétés d'exercice libéral (avocats, professions réglementées)
  '5385': 'SELARL', '5470': 'SELAFA', '5485': 'SELAS', '5460': 'SCP', '5480': 'SELCA',
  // Divers
  '6220': 'GIE', '5370': 'SE'
};
function _applyCompany(input, r) {
  var block = input.closest('.associe-type-block[data-type="morale"]') || input.closest('.associe-panel') || document;
  var set = function(f, v) {
    var el = block.querySelector('[data-field="' + f + '"]');
    if (el && v != null && v !== '') {
      // Empêche le champ (ex. siège = addr-auto) de rouvrir son propre dropdown
      el._skipAutocomplete = true;
      el._skipCompany = true;
      el.value = v;
      el.dispatchEvent(new Event('input'));
    }
  };
  input._skipCompany = true;
  input.value = r.nom_complet || r.nom_raison_sociale || '';
  input.dispatchEvent(new Event('input')); // met à jour le nom de l'onglet
  // Forme : on force l'écriture (même vide) pour ne pas garder l'ancienne valeur
  var fmEl = block.querySelector('[data-field="formeM"]');
  if (fmEl) { fmEl.value = _FORME_JURIDIQUE[r.nature_juridique] || ''; fmEl.dispatchEvent(new Event('input')); }
  set('siret', (r.siege && r.siege.siret) || r.siren || '');
  set('rcs', r.siren || '');
  var s = r.siege || {};
  set('siege', s.adresse || '');
  set('villeRcs', s.libelle_commune || '');

  // Représentant légal : prénom + nom depuis les dirigeants de l'API publique.
  // On privilégie le Président / Gérant (représentant légal au sens statutaire).
  var dirigeants = (r.dirigeants || []).filter(function(d) {
    return (d.type_dirigeant || '').toLowerCase().indexOf('physique') !== -1;
  });
  var rep = dirigeants.filter(function(d) { return /pr[ée]sident|g[ée]rant|repr[ée]sentant\s+l[ée]gal/i.test(d.qualite || ''); })[0]
         || dirigeants[0] || null;
  if (rep) {
    set('repPrenom', (rep.prenoms || '').trim());
    set('repNom', (rep.nom || '').trim());
  }

  // Vide l'ancien capital pour ne pas garder celui d'une société précédente
  var capEl0 = block.querySelector('[data-field="capitalM"]');
  if (capEl0) { capEl0.value = ''; capEl0.dispatchEvent(new Event('input')); }

  // Capital + adresse du représentant : non fournis par l'API publique -> proxy INPI
  if (r.siren) {
    fetch('/api/company/' + r.siren)
      .then(function(x) { return x.json(); })
      .then(function(d) {
        if (d && d.capital != null && d.capital !== '') {
          var cap = block.querySelector('[data-field="capitalM"]');
          if (cap) { cap.value = String(d.capital); cap.dispatchEvent(new Event('input')); }
        }
        // Adresse (CP + ville) du représentant légal, appariée par nom de famille
        var reps = (d && d.representants) || [];
        if (rep && reps.length) {
          var norm = function(s) { return (s || '').toString().trim().toLowerCase(); };
          var match = reps.filter(function(p) { return norm(p.nom) === norm(rep.nom); })[0] || null;
          if (match) {
            if (match.adresse) set('repAdresse', match.adresse);
            if (match.genre === '1' || match.genre === 1) set('repCivilite', 'Monsieur');
            else if (match.genre === '2' || match.genre === 2) set('repCivilite', 'Madame');
          }
        }
      })
      .catch(function() {});

    // Adresse COMPLÈTE (n° + voie) + civilité, extraites des statuts (texte/OCR).
    // Plus lent que l'INPI structuré : on enrichit en arrière-plan quand ça répond.
    if (rep) {
      var qs = '?nom=' + encodeURIComponent(rep.nom || '') + '&prenom=' + encodeURIComponent(rep.prenoms || '');
      fetch('/api/company/' + r.siren + '/representants-details' + qs)
        .then(function(x) { return x.json(); })
        .then(function(d) {
          if (d && d.forme) { var fmel = block.querySelector('[data-field="formeM"]'); if (fmel) { fmel.value = d.forme; fmel.dispatchEvent(new Event('input')); } }
          var ids = (d && d.representants) || [];
          if (!ids.length) return;
          var hit = ids[0];
          if (!hit) return;
          if (hit.adresse) set('repAdresse', hit.adresse);  // adresse complète : remplace le CP+ville
          if (hit.civilite) set('repCivilite', hit.civilite);
        })
        .catch(function() {});
    }
  }
}

// Convertit "09/07/2003" (jj/mm/aaaa) -> "2003-07-09" (input type=date)
function _frToIso(d) {
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec((d || '').trim());
  if (!m) return '';
  var y = m[3].length === 2 ? '19' + m[3] : m[3];
  return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}
// Résout le code postal précis d'une commune de naissance via l'API géo.
// N'écrit QUE si la commune a un seul CP (sinon ambigu : Lyon/Paris/Marseille -> on garde le département).
function _resolveBirthCp(ville, current, cpInput) {
  if (!ville || !cpInput) return;
  var dept = (current || '').replace(/\D/g, '').slice(0, 2);
  fetch('https://geo.api.gouv.fr/communes?nom=' + encodeURIComponent(ville) + '&fields=nom,codesPostaux,codeDepartement&boost=population&limit=5')
    .then(function(r) { return r.json(); })
    .then(function(coms) {
      if (!coms || !coms.length) return;
      var c = dept ? (coms.filter(function(x) { return x.codeDepartement === dept; })[0] || coms[0]) : coms[0];
      if (c && c.codesPostaux && c.codesPostaux.length === 1) {
        cpInput._skipAutocomplete = true;
        cpInput.value = c.codesPostaux[0];
        cpInput.dispatchEvent(new Event('input'));
      }
    })
    .catch(function() {});
}

// Mappe un régime matrimonial extrait vers les options du select "Contrat de mariage".
function _mapContrat(r) {
  r = (r || '').toLowerCase();
  if (/s[ée]paration de biens/.test(r)) return 'Oui - Séparation de biens';
  if (/communaut[ée] universelle/.test(r)) return 'Oui - Communauté universelle';
  if (/participation/.test(r)) return 'Oui - Participation aux acquêts';
  if (/communaut[ée] (l[ée]gale|r[ée]duite)/.test(r)) return 'Non'; // régime légal = sans contrat
  return '';
}

// Mappe une situation extraite ("célibataire"...) vers les options du select
function _mapSituation(s) {
  s = (s || '').toLowerCase();
  if (/c[ée]libataire/.test(s)) return 'Célibataire';
  if (/mari/.test(s)) return 'Marié(e)';
  if (/pacs/.test(s)) return 'Pacsé(e)';
  if (/divorc/.test(s)) return 'Divorcé(e)';
  if (/veuf|veuve/.test(s)) return 'Veuf(ve)';
  return '';
}

// Auto-remplissage du bloc DIRIGEANT personne morale (champs sans data-field,
// repérés par leur ordre — identique au lecteur de form-data.js).
function _applyDirigeantCompany(input, r) {
  var panel = input.closest('.dirigeant-type-panel[data-type="morale"]');
  if (!panel) return;
  var inputs = panel.querySelectorAll('input');
  var selects = panel.querySelectorAll('select');
  var setIdx = function(idx, v) {
    var el = inputs[idx];
    if (el && v != null && v !== '') { el._skipAutocomplete = true; el._skipCompany = true; el.value = v; el.dispatchEvent(new Event('input')); }
  };
  input._skipCompany = true;
  if (inputs[0]) { inputs[0].value = r.nom_complet || r.nom_raison_sociale || ''; inputs[0].dispatchEvent(new Event('input')); }
  var s = r.siege || {};
  setIdx(1, s.adresse || '');                                   // adresse société
  setIdx(3, r.siren || '');                                     // RCS
  setIdx(4, s.libelle_commune || '');                          // ville d'immatriculation
  // Type d'entreprise : on force l'écriture (même vide) pour ne pas garder l'ancienne valeur
  if (inputs[5]) { inputs[5].value = _FORME_JURIDIQUE[r.nature_juridique] || ''; inputs[5].dispatchEvent(new Event('input')); }
  setIdx(6, (r.siege && r.siege.siret) || r.siren || '');      // SIRET

  // Représentant légal (Président/Gérant) depuis les dirigeants de l'API publique
  var dirigeants = (r.dirigeants || []).filter(function(d) { return (d.type_dirigeant || '').toLowerCase().indexOf('physique') !== -1; });
  var rep = dirigeants.filter(function(d) { return /pr[ée]sident|g[ée]rant|repr[ée]sentant\s+l[ée]gal/i.test(d.qualite || ''); })[0] || dirigeants[0] || null;
  if (rep) {
    setIdx(7, (rep.prenoms || '').trim());
    setIdx(8, (rep.nom || '').trim());
  }
  if (inputs[2]) { inputs[2].value = ''; inputs[2].dispatchEvent(new Event('input')); } // vide l'ancien capital
  if (typeof refreshAllCustomTriggers === 'function') refreshAllCustomTriggers();

  if (!r.siren) return;

  // Capital + adresse CP/ville du représentant (proxy INPI)
  fetch('/api/company/' + r.siren)
    .then(function(x) { return x.json(); })
    .then(function(d) {
      if (d && d.capital != null && d.capital !== '' && inputs[2]) { inputs[2].value = String(d.capital); inputs[2].dispatchEvent(new Event('input')); }
      var reps = (d && d.representants) || [];
      if (rep && reps.length) {
        var norm = function(x) { return (x || '').toString().trim().toLowerCase(); };
        var match = reps.filter(function(p) { return norm(p.nom) === norm(rep.nom); })[0] || null;
        if (match && match.adresse) setIdx(9, match.adresse);
      }
    })
    .catch(function() {});

  // Identité civile complète depuis les statuts (texte/OCR) + normalisation BAN
  if (rep) {
    var qs = '?nom=' + encodeURIComponent(rep.nom || '') + '&prenom=' + encodeURIComponent(rep.prenoms || '');
    fetch('/api/company/' + r.siren + '/representants-details' + qs)
      .then(function(x) { return x.json(); })
      .then(function(d) {
        // Forme juridique : les statuts (source officielle) priment sur le mapping INPI
        if (d && d.forme && inputs[5]) { inputs[5].value = d.forme; inputs[5].dispatchEvent(new Event('input')); }
        var ids = (d && d.representants) || [];
        if (!ids.length) return;
        var hit = ids[0];
        if (!hit) return;
        if (hit.adresse) setIdx(9, hit.adresse);                 // adresse complète
        if (hit.dateNaissance) { var iso = _frToIso(hit.dateNaissance); if (iso) setIdx(10, iso); }
        if (hit.lieuNaissanceVille) setIdx(11, hit.lieuNaissanceVille);
        if (hit.cpNaissance) setIdx(12, hit.cpNaissance);
        if (hit.pere) setIdx(14, hit.pere);
        if (hit.mere) setIdx(15, hit.mere);
        if (hit.nationalite && inputs[16] && !inputs[16].value) { inputs[16].value = hit.nationalite; inputs[16].dispatchEvent(new Event('input')); }
        if (hit.civilite && selects[0] && typeof setSelect === 'function') setSelect(selects[0], hit.civilite);
        if (hit.situationMatrimoniale && selects[1] && typeof setSelect === 'function') { var sm = _mapSituation(hit.situationMatrimoniale); if (sm) setSelect(selects[1], sm); }
        // Contrat de mariage (régime matrimonial) : le select n'apparaît qu'après "Marié(e)"
        if (hit.regimeMatrimonial) {
          var rmVal = _mapContrat(hit.regimeMatrimonial);
          if (rmVal) setTimeout(function() {
            var cs = panel.querySelector('.conjoint-section');
            if (!cs) return;
            var contrat = null;
            cs.querySelectorAll('select').forEach(function(s) { if (/paration de biens/i.test(s.innerHTML)) contrat = s; });
            if (contrat && typeof setSelect === 'function') { setSelect(contrat, rmVal); if (typeof refreshAllCustomTriggers === 'function') refreshAllCustomTriggers(); }
          }, 0);
        }
        // CP de naissance précis : si on n'a que le département, on résout via l'API géo
        // (uniquement quand la commune a un seul code postal -> pas Lyon/Paris/Marseille).
        if (hit.lieuNaissanceVille && inputs[12] && !/^\d{5}$/.test((inputs[12].value || '').trim())) {
          _resolveBirthCp(hit.lieuNaissanceVille, inputs[12].value, inputs[12]);
        }
        if (typeof refreshAllCustomTriggers === 'function') refreshAllCustomTriggers();
      })
      .catch(function() {});
  }
}
window._applyDirigeantCompany = _applyDirigeantCompany;

function initCompanyAutocomplete(input, applyFn) {
  if (input._companyInit) return;
  input._companyInit = true;
  var apply = applyFn || _applyCompany;

  var dropdown = document.createElement('div');
  dropdown.className = 'denom-dropdown';
  dropdown.style.cssText = 'display:none;position:absolute;z-index:10000;background:#fff;border:1px solid #e0e0e0;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.1);max-height:260px;overflow-y:auto;margin-top:2px;';
  input.parentNode.style.position = 'relative';
  input.parentNode.appendChild(dropdown);

  var debounceTimer = null, results = [];
  input.addEventListener('input', function() {
    if (input._skipCompany) { input._skipCompany = false; dropdown.style.display = 'none'; return; }
    var q = input.value.trim();
    if (q.length < 3) { dropdown.style.display = 'none'; return; }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      fetch('https://recherche-entreprises.api.gouv.fr/search?q=' + encodeURIComponent(q) + '&per_page=6&page=1')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          results = (data && data.results) || [];
          if (!results.length) { dropdown.style.display = 'none'; return; }
          dropdown.innerHTML = results.map(function(r, i) {
            var nom = document.createElement('div'); nom.textContent = r.nom_complet || r.nom_raison_sociale || '';
            var sub = (r.siege && r.siege.libelle_commune ? r.siege.libelle_commune : '') + (r.siren ? ' · ' + r.siren : '');
            return '<div class="denom-option" data-index="' + i + '" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f0f0f0;">'
              + '<div style="font-size:14px;font-weight:500;">' + nom.innerHTML + '</div>'
              + '<div style="font-size:12px;color:#888;margin-top:1px;">' + sub + '</div></div>';
          }).join('');
          dropdown.style.display = 'block';
          dropdown.style.width = input.offsetWidth + 'px';
          dropdown.querySelectorAll('.denom-option').forEach(function(opt) {
            opt.addEventListener('mouseenter', function() { opt.style.background = '#f7f7f7'; });
            opt.addEventListener('mouseleave', function() { opt.style.background = '#fff'; });
            opt.addEventListener('mousedown', function(e) {
              e.preventDefault();
              var r = results[parseInt(opt.dataset.index)];
              dropdown.style.display = 'none';
              if (r) apply(input, r);
            });
          });
        })
        .catch(function() { dropdown.style.display = 'none'; });
    }, 280);
  });
  input.addEventListener('blur', function() { setTimeout(function() { dropdown.style.display = 'none'; }, 150); });
}
window.initCompanyAutocomplete = initCompanyAutocomplete;

function initCityBirthAutocomplete(input) {
  if (input._cityAutoInit) return;
  input._cityAutoInit = true;

  var dropdown = document.createElement('div');
  dropdown.className = 'city-dropdown';
  dropdown.style.cssText = 'display:none;position:absolute;z-index:10000;background:#fff;border:1px solid #e0e0e0;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.1);max-height:220px;overflow-y:auto;margin-top:2px;';
  input.parentNode.style.position = 'relative';
  input.parentNode.appendChild(dropdown);

  var debounceTimer = null;
  input.addEventListener('input', function() {
    if (input._skipAutocomplete) { input._skipAutocomplete = false; dropdown.style.display = 'none'; return; }
    var q = input.value.trim();
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      fetch('https://geo.api.gouv.fr/communes?nom=' + encodeURIComponent(q) + '&fields=nom,codesPostaux,codeDepartement&boost=population&limit=6')
        .then(function(r) { return r.json(); })
        .then(function(communes) {
          if (!communes.length) { dropdown.style.display = 'none'; return; }
          dropdown.innerHTML = communes.map(function(c) {
            var cp = c.codesPostaux && c.codesPostaux[0] ? c.codesPostaux[0] : '';
            var d = document.createElement('div');
            d.textContent = c.nom;
            var safeName = d.innerHTML;
            return '<div class="city-option" data-city="' + safeName + '" data-cp="' + cp + '" style="padding:10px 14px;font-size:14px;cursor:pointer;border-bottom:1px solid #f0f0f0;">'
              + '<strong>' + safeName + '</strong> <span style="color:#888;font-size:12px;">' + cp + ' (' + c.codeDepartement + ')</span>'
              + '</div>';
          }).join('');
          dropdown.style.display = 'block';
          dropdown.style.width = input.offsetWidth + 'px';

          dropdown.querySelectorAll('.city-option').forEach(function(opt) {
            opt.addEventListener('mouseenter', function() { opt.style.background = '#f7f7f7'; });
            opt.addEventListener('mouseleave', function() { opt.style.background = '#fff'; });
            opt.addEventListener('mousedown', function(e) {
              e.preventDefault();
              input.value = opt.dataset.city;
              dropdown.style.display = 'none';

              var container = input.closest('.associe-panel') || input.closest('.dirigeant-type-panel') || input.closest('.step-content');
              if (container) {
                var cpInput = container.querySelector('.cp-birth');
                var paysInput = container.querySelector('.pays-birth');
                if (cpInput && opt.dataset.cp) { cpInput.value = opt.dataset.cp; cpInput.dispatchEvent(new Event('input')); }
                if (paysInput) { paysInput.value = 'France'; paysInput.dispatchEvent(new Event('input')); }
              }
            });
          });
        });
    }, 250);
  });

  input.addEventListener('blur', function() { setTimeout(function() { dropdown.style.display = 'none'; }, 150); });
}
window.initCityBirthAutocomplete = initCityBirthAutocomplete;

function initAllAutocompletes() {
  document.querySelectorAll('.addr-auto').forEach(function(input) {
    initAddressAutocomplete(input);
  });
  document.querySelectorAll('.city-birth-auto').forEach(function(input) {
    initCityBirthAutocomplete(input);
  });
  document.querySelectorAll('.denom-auto').forEach(function(input) {
    initCompanyAutocomplete(input);
  });
  document.querySelectorAll('.denom-auto-dir').forEach(function(input) {
    initCompanyAutocomplete(input, _applyDirigeantCompany);
  });
}
window.initAllAutocompletes = initAllAutocompletes;

// Helper for prefill: set select value and trigger change
function setSelect(sel, val) {
  if (!sel) return;
  sel.value = val;
  for (var i = 0; i < sel.options.length; i++) {
    sel.options[i].removeAttribute('selected');
    if (sel.options[i].value === val || sel.options[i].textContent.trim() === val) {
      sel.options[i].setAttribute('selected', 'selected');
      sel.selectedIndex = i;
    }
  }
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}
window.setSelect = setSelect;

function refreshAllCustomTriggers() {
  // Refresh custom date triggers
  document.querySelectorAll('.cdp').forEach(function(wrap) {
    var input = wrap.querySelector('input[type="date"]');
    var trigger = wrap.querySelector('.cdp-trigger');
    if (input && trigger) {
      var v = input.value ? new Date(input.value + 'T00:00:00') : null;
      if (v && !isNaN(v)) {
        trigger.textContent = ('0' + v.getDate()).slice(-2) + '/' + ('0' + (v.getMonth() + 1)).slice(-2) + '/' + v.getFullYear();
        trigger.classList.remove('placeholder');
      }
    }
  });
  // Refresh custom select triggers
  document.querySelectorAll('.cselect').forEach(function(wrap) {
    var sel = wrap.querySelector('select');
    var trigger = wrap.querySelector('.cselect-trigger');
    if (sel && trigger) {
      var o = sel.options[sel.selectedIndex];
      if (o && !(o.disabled && o.value === '')) {
        trigger.textContent = o.textContent;
        trigger.classList.remove('placeholder');
      }
    }
  });
}
window.refreshAllCustomTriggers = refreshAllCustomTriggers;

function onGoogleMapsLoaded() {
  initAllAutocompletes();
}
window.onGoogleMapsLoaded = onGoogleMapsLoaded;

// Init on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.addr-auto').forEach(function(input) {
    initAddressAutocomplete(input);
  });
  document.querySelectorAll('.denom-auto').forEach(function(input) {
    initCompanyAutocomplete(input);
  });
  document.querySelectorAll('.denom-auto-dir').forEach(function(input) {
    initCompanyAutocomplete(input, _applyDirigeantCompany);
  });
  document.querySelectorAll('.city-birth-auto').forEach(function(input) {
    initCityBirthAutocomplete(input);
  });
  initAllCustomSelects();
  initAllCustomDates();
});

Formalist.customControls = {
  initCustomSelect: initCustomSelect,
  initCustomDate: initCustomDate,
  initAddressAutocomplete: initAddressAutocomplete,
  initCityBirthAutocomplete: initCityBirthAutocomplete,
  initAllAutocompletes: initAllAutocompletes,
  initAllCustomSelects: initAllCustomSelects,
  initAllCustomDates: initAllCustomDates,
  setSelect: setSelect,
  refreshAllCustomTriggers: refreshAllCustomTriggers,
  onGoogleMapsLoaded: onGoogleMapsLoaded
};
