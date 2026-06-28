/**
 * Formalist Dirigeants Module
 * Dirigeant tab/panel management, add/remove/renumber
 */
window.Formalist = window.Formalist || {};

var dirigeantCount = 1;
var activeDirigeantTab = 1;

function getDirigeantTerms() {
  var forme = document.getElementById('forme-juridique');
  var val = forme ? forme.value : '';
  if (val === 'SARL' || val === 'EURL' || val === 'SCI') {
    return { primary: 'G\u00e9rant', secondary: 'Co-g\u00e9rant' };
  }
  return { primary: 'Pr\u00e9sident', secondary: 'Directeur g\u00e9n\u00e9ral' };
}
window.getDirigeantTerms = getDirigeantTerms;

// buildAssocieOptions(excludeMap, currentSelf)
// - excludeMap : { 'associe-0': true, ... } \u2014 associ\u00e9s \u00e0 exclure (d\u00e9j\u00e0 choisis ailleurs)
// - currentSelf : 'associe-X' que le select courant a d\u00e9j\u00e0 \u2014 on le garde quand m\u00eame
function buildAssocieOptions(excludeMap, currentSelf) {
  excludeMap = excludeMap || {};
  var panels = document.querySelectorAll('#associe-panels .associe-panel');
  var html = '<option value="">S\u00e9lectionner...</option>';
  panels.forEach(function(p, i) {
    var val = 'associe-' + i;
    // Skip si d\u00e9j\u00e0 choisi par un autre select (mais garde la valeur du select courant)
    if (excludeMap[val] && val !== currentSelf) return;
    var label;
    if (p.dataset.type === 'morale') {
      // Société actionnaire : on affiche sa dénomination (ex. "STERLING PEAK")
      var denomInput = p.querySelector('.associe-type-block[data-type="morale"] [data-field="denomination"]') || p.querySelector('[data-field="denomination"]');
      var denom = denomInput ? denomInput.value.trim() : '';
      label = denom || (getAssocieWord() + ' ' + (i + 1));
    } else {
      var prenomInput = p.querySelector('input[data-field="prenom"]');
      var nomInput = p.querySelector('input[data-field="nom"]');
      var prenom = prenomInput ? prenomInput.value.trim() : '';
      var nom = nomInput ? nomInput.value.trim() : '';
      label = (prenom || nom) ? (prenom + ' ' + nom).trim() : (getAssocieWord() + ' ' + (i + 1));
    }
    html += '<option value="' + val + '">' + label + '</option>';
  });
  html += '<option value="autre">Autre personne</option>';
  return html;
}
window.buildAssocieOptions = buildAssocieOptions;

function refreshDirigeantSelects() {
  var selects = document.querySelectorAll('#dirigeant-panels .dirigeant-panel-select');
  // Collecte les associés déjà sélectionnés (pour exclure d'autres slots — un même associé
  // ne peut pas être à la fois Président et DG, etc.)
  var allSelected = {};
  selects.forEach(function(sel) { if (sel.value && sel.value.indexOf('associe-') === 0) allSelected[sel.value] = true; });
  selects.forEach(function(sel) {
    var prev = sel.value;
    var currentSelf = prev; // garde l'option du select courant pour ne pas la faire disparaître
    var opts = buildAssocieOptions(allSelected, currentSelf);
    sel.innerHTML = opts;
    sel.value = prev;
    if (!sel.value) sel.value = '';
  });
  // Si un snapshot de step 3 est en attente (depuis loadFormaliteFromServer), on l'applique.
  if (window._pendingStep3Restore && window._pendingStep3Restore.length) {
    restorePendingStep3();
  } else if (window._serverLoadedData && !window._step3SemanticApplied) {
    // Fallback legacy : on tente une heuristique pour matcher le dirigeant principal à un
    // associé existant en comparant les CIVILITE_NOM_PRENOM.
    restoreDirigeantsFromSemantic(window._serverLoadedData);
    window._step3SemanticApplied = true;
  }
}
window.refreshDirigeantSelects = refreshDirigeantSelects;

// Restaure les panneaux dirigeants depuis le snapshot _pendingStep3Restore (créé lors du save
// avocat). Crée les panneaux manquants, restaure le select "associe-X / autre", puis les inputs.
function restorePendingStep3() {
  var saved = window._pendingStep3Restore;
  if (!saved || !saved.length) return;
  // Crée les panneaux manquants
  var existing = document.querySelectorAll('#dirigeant-panels .associe-panel').length;
  while (existing < saved.length) {
    if (typeof addDirigeant === 'function') addDirigeant();
    existing++;
  }
  document.querySelectorAll('#dirigeant-panels .associe-panel').forEach(function(panel, pi) {
    var savedPanel = saved[pi];
    if (!savedPanel) return;
    var sel = panel.querySelector('.dirigeant-panel-select');
    if (sel && savedPanel.select) {
      if (typeof window.setSelect === 'function') window.setSelect(sel, savedPanel.select);
      else { sel.value = savedPanel.select; try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {} }
    }
    if (savedPanel.fields && savedPanel.fields.length) {
      // Petit délai pour laisser le change event ouvrir les sub-panels (autre / morale)
      setTimeout(function() {
        var fields = panel.querySelectorAll('input:not([type="file"]), select:not(.dirigeant-panel-select), textarea');
        fields.forEach(function(fInp, fi) {
          if (fi < savedPanel.fields.length && savedPanel.fields[fi] !== undefined && savedPanel.fields[fi] !== null) {
            if (fInp.tagName === 'SELECT' && typeof window.setSelect === 'function') {
              window.setSelect(fInp, savedPanel.fields[fi]);
            } else {
              fInp.value = savedPanel.fields[fi];
              try { fInp.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
            }
          }
        });
        if (typeof window.refreshAllCustomTriggers === 'function') window.refreshAllCustomTriggers();
      }, 60);
    }
  });
  // Une fois appliqué, on consomme le snapshot pour éviter les ré-applications
  window._pendingStep3Restore = null;
}
window.restorePendingStep3 = restorePendingStep3;

// Fallback : reconstitue les sélecteurs de dirigeants depuis les clés sémantiques quand
// aucun snapshot _raw_step3_panels n'est disponible (dossiers anciens).
function restoreDirigeantsFromSemantic(data) {
  if (!data) return;
  // Le dirigeant principal a son nom dans CIVILITE_NOM_PRENOM
  var principalName = data.CIVILITE_NOM_PRENOM || data.PRESIDENT_NOM || '';
  if (!principalName || principalName === '-') return;
  // Cherche un associé qui matche par nom
  function normalize(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  var match = -1;
  for (var i = 1; i <= 20; i++) {
    var assocName = data['CIVILITE_NOM_PRENOM_' + i];
    if (!assocName) break;
    if (normalize(assocName) === normalize(principalName)) { match = i - 1; break; }
  }
  var firstPanel = document.querySelector('#dirigeant-panels .associe-panel');
  if (!firstPanel) return;
  var sel = firstPanel.querySelector('.dirigeant-panel-select');
  if (!sel) return;
  if (match >= 0) {
    // Dirigeant = un des associés existants
    var val = 'associe-' + match;
    if (typeof window.setSelect === 'function') window.setSelect(sel, val);
    else { sel.value = val; try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {} }
    // Force la mise à jour du label de l'onglet (au cas où l'event change ne déclencherait pas
    // updateDirigeantTabFromSelect en cascade — robustesse)
    setTimeout(function() {
      if (typeof window.updateDirigeantTabFromSelect === 'function') window.updateDirigeantTabFromSelect(sel);
      _restoreDirigeantPanelExtras(firstPanel, data, 'president');
    }, 50);
  } else {
    // Dirigeant = autre personne — on ouvre le sous-panel et on remplit ce qu'on peut
    if (typeof window.setSelect === 'function') window.setSelect(sel, 'autre');
    else { sel.value = 'autre'; try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {} }
    setTimeout(function() {
      var activePanel = firstPanel.querySelector('.dirigeant-type-panel.active') || firstPanel;
      if (!activePanel) return;
      // Civilité depuis le préfixe "Monsieur"/"Madame" du nom complet
      var firstSel = activePanel.querySelector('select');
      var parts = principalName.split(' ');
      if (firstSel && (parts[0] === 'Monsieur' || parts[0] === 'Madame')) {
        if (typeof window.setSelect === 'function') window.setSelect(firstSel, parts[0]);
        else firstSel.value = parts[0];
      }
      var inputs = activePanel.querySelectorAll('input');
      // Tente de remplir prénom/nom/etc — heuristique : input[0]=prénom, input[1]=nom (ordre varie selon panel)
      // On laisse vide si ambiguë — l'avocat complétera. Mais on remplit les champs faciles via clés FR.
      function setByPlaceholder(ph, val) {
        if (!val || val === '-') return;
        var inp = activePanel.querySelector('input[placeholder*="' + ph + '"]');
        if (inp) inp.value = val;
      }
      setByPlaceholder('Adresse', data.ADRESSE_DIRIGEANT || data.GERANT_ADRESSE || '');
      // Date naissance
      var dateInp = activePanel.querySelector('input[type="date"]');
      if (dateInp && (data.DATE_NAISSANCE || data.GERANT_DATE_NAISSANCE)) {
        var raw = data.GERANT_DATE_NAISSANCE || data.DATE_NAISSANCE;
        if (typeof window.parseFrenchDateToIso === 'function') {
          var iso = window.parseFrenchDateToIso(raw);
          if (iso) dateInp.value = iso;
        }
      }
      if (typeof window.refreshAllCustomTriggers === 'function') window.refreshAllCustomTriggers();
      _restoreDirigeantPanelExtras(firstPanel, data, 'president');
    }, 80);
  }
  if (typeof window.refreshAllCustomTriggers === 'function') window.refreshAllCustomTriggers();
  // Restaure les DGs additionnels (HAS_DG_1, HAS_DG_2, ...) en tant que panneaux dirigeants
  // supplémentaires. Les données sont sous DG_$N_PRENOM, DG_$N_NOM, etc.
  setTimeout(function() {
    var dgN = 1;
    while (data['HAS_DG_' + dgN] || data['DG_' + dgN + '_NOM'] || data['DG_' + dgN + '_PRENOM']) {
      restoreDGPanel(data, dgN);
      dgN++;
      if (dgN > 10) break; // safety
    }
  }, 120);
}
window.restoreDirigeantsFromSemantic = restoreDirigeantsFromSemantic;

// Restaure les selects "Rémunération" + "Régime social" d'un panneau dirigeant depuis les
// clés sémantiques (REMUNERATION_PRESIDENT_TYPE, REGIME_SOCIAL_PRESIDENT, REMUNERATION_DG_N_TYPE,
// REGIME_SOCIAL_DG_N). Fallback : si la clé _TYPE n'existe pas, on déduit depuis le template texte.
function _restoreDirigeantPanelExtras(panel, data, role) {
  if (!panel || !data) return;
  var remuKey, regimeKey, templateKey;
  if (role === 'president') {
    remuKey = 'REMUNERATION_PRESIDENT_TYPE';
    regimeKey = 'REGIME_SOCIAL_PRESIDENT';
    templateKey = 'REMUNERATION_PRESIDENT';
  } else {
    // Format : 'dg1', 'dg2', ...
    var n = parseInt(String(role).replace(/[^\d]/g, ''), 10) || 1;
    remuKey = 'REMUNERATION_DG_' + n + '_TYPE';
    regimeKey = 'REGIME_SOCIAL_DG_' + n;
    templateKey = n === 1 ? 'REMUNERATION_DG' : null;
  }
  var remuVal = data[remuKey] || '';
  if (!remuVal && templateKey && data[templateKey]) {
    // Déduit depuis le template texte (fallback pour les anciens dossiers sans _TYPE)
    var tpl = String(data[templateKey]).toLowerCase();
    if (tpl.indexOf('fixe dont') >= 0 || tpl.indexOf('rémunération fixe') >= 0) remuVal = 'Fixe';
    else if (tpl.indexOf('variable dont') >= 0 || tpl.indexOf('rémunération variable') >= 0) remuVal = 'Variable';
    else if (tpl.indexOf('ultérieurement') >= 0 || tpl.indexOf('ulterieurement') >= 0) remuVal = 'Aucune';
  }
  var regimeVal = data[regimeKey] || '';
  // Trouve les selects par leur label
  panel.querySelectorAll('select').forEach(function(s) {
    var lbl = s.closest('.field') && s.closest('.field').querySelector('label');
    if (!lbl) return;
    var t = lbl.textContent || '';
    if (t.match(/mun/i) && remuVal) {
      if (typeof window.setSelect === 'function') window.setSelect(s, remuVal);
      else s.value = remuVal;
    } else if (t.match(/gime social/i) && regimeVal) {
      if (typeof window.setSelect === 'function') window.setSelect(s, regimeVal);
      else s.value = regimeVal;
    }
  });
  if (typeof window.refreshAllCustomTriggers === 'function') window.refreshAllCustomTriggers();
}
window._restoreDirigeantPanelExtras = _restoreDirigeantPanelExtras;

// Restaure un panneau DG (index N) depuis les clés sémantiques DG_$N_*
function restoreDGPanel(data, n) {
  var prefix = 'DG_' + n + '_';
  // Compte les panneaux DG existants (sans compter le Président qui est panel #1)
  var existingCount = document.querySelectorAll('#dirigeant-panels .associe-panel').length;
  // On veut un panel à l'index (n+1) → si n=1, on veut le 2e panel total
  while (existingCount < n + 1) {
    if (typeof addDirigeant === 'function') addDirigeant();
    else if (typeof window.addDirigeant === 'function') window.addDirigeant();
    existingCount = document.querySelectorAll('#dirigeant-panels .associe-panel').length;
    if (existingCount === 0) return; // safety si addDirigeant n'existe pas
  }
  var allPanels = document.querySelectorAll('#dirigeant-panels .associe-panel');
  var panel = allPanels[n]; // index 0 = Président, index 1 = DG1, etc.
  if (!panel) return;
  // Cherche si le DG matche un associé existant
  function normalize(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  var dgName = data[prefix + 'CIVILITE_NOM_PRENOM'] || ((data[prefix + 'CIVILITE'] || '') + ' ' + (data[prefix + 'NOM'] || '') + ' ' + (data[prefix + 'PRENOM'] || '')).trim();
  var match = -1;
  for (var i = 1; i <= 20; i++) {
    var assocName = data['CIVILITE_NOM_PRENOM_' + i];
    if (!assocName) break;
    if (normalize(assocName) === normalize(dgName)) { match = i - 1; break; }
  }
  var sel = panel.querySelector('.dirigeant-panel-select');
  if (!sel) return;
  if (match >= 0) {
    var val = 'associe-' + match;
    if (typeof window.setSelect === 'function') window.setSelect(sel, val);
    else { sel.value = val; try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {} }
    setTimeout(function() {
      if (typeof window.updateDirigeantTabFromSelect === 'function') window.updateDirigeantTabFromSelect(sel);
      _restoreDirigeantPanelExtras(panel, data, 'dg' + n);
    }, 50);
  } else {
    // "Autre personne"
    if (typeof window.setSelect === 'function') window.setSelect(sel, 'autre');
    else { sel.value = 'autre'; try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {} }
    setTimeout(function() {
      var activePanel = panel.querySelector('.dirigeant-type-panel.active') || panel;
      if (!activePanel) return;
      // Civilité
      var firstSel = activePanel.querySelector('select');
      if (firstSel && data[prefix + 'CIVILITE']) {
        if (typeof window.setSelect === 'function') window.setSelect(firstSel, data[prefix + 'CIVILITE']);
        else firstSel.value = data[prefix + 'CIVILITE'];
      }
      // Prénom / Nom (data-field="dir-prenom" / "dir-nom")
      var prenomInp = activePanel.querySelector('input[data-field="dir-prenom"]') || activePanel.querySelectorAll('input')[0];
      var nomInp = activePanel.querySelector('input[data-field="dir-nom"]') || activePanel.querySelectorAll('input')[1];
      if (prenomInp && data[prefix + 'PRENOM']) prenomInp.value = data[prefix + 'PRENOM'];
      if (nomInp && data[prefix + 'NOM']) nomInp.value = data[prefix + 'NOM'];
      // Adresse
      var adrInp = activePanel.querySelector('input.addr-auto, input[placeholder*="Adresse"]');
      if (adrInp && data[prefix + 'ADRESSE'] && data[prefix + 'ADRESSE'] !== '-') adrInp.value = data[prefix + 'ADRESSE'];
      // Date naissance
      var dateInp = activePanel.querySelector('input[type="date"]');
      if (dateInp && data[prefix + 'DATE_NAISSANCE'] && typeof window.parseFrenchDateToIso === 'function') {
        var iso = window.parseFrenchDateToIso(data[prefix + 'DATE_NAISSANCE']);
        if (iso) dateInp.value = iso;
      }
      // Lieu de naissance
      var villeNaissInp = activePanel.querySelector('input.city-birth-auto, input[placeholder*="Ville de naissance"]');
      var cpNaissInp = activePanel.querySelector('input.cp-birth, input[placeholder*="Code postal"]');
      var paysNaissInp = activePanel.querySelector('input.pays-birth, input[value="France"]');
      if (villeNaissInp && data[prefix + 'LIEU_NAISSANCE']) villeNaissInp.value = data[prefix + 'LIEU_NAISSANCE'];
      if (cpNaissInp && data[prefix + 'CP_NAISSANCE']) cpNaissInp.value = data[prefix + 'CP_NAISSANCE'];
      if (paysNaissInp && data[prefix + 'PAYS_NAISSANCE']) paysNaissInp.value = data[prefix + 'PAYS_NAISSANCE'];
      // Nationalité (input avec value "Française" par défaut)
      var natInp = activePanel.querySelectorAll('input');
      // Père / Mère
      var pereInp = activePanel.querySelector('input[placeholder*="père"]');
      var mereInp = activePanel.querySelector('input[placeholder*="mère"]');
      if (pereInp && data[prefix + 'NOM_PERE'] && data[prefix + 'NOM_PERE'] !== '-') pereInp.value = data[prefix + 'NOM_PERE'];
      if (mereInp && data[prefix + 'NOM_MERE'] && data[prefix + 'NOM_MERE'] !== '-') mereInp.value = data[prefix + 'NOM_MERE'];
      // Met à jour le label du tab
      if (typeof window.updateDirigeantTabName === 'function' && prenomInp) window.updateDirigeantTabName(prenomInp);
      if (typeof window.refreshAllCustomTriggers === 'function') window.refreshAllCustomTriggers();
      // Restaure rémunération + régime social
      _restoreDirigeantPanelExtras(panel, data, 'dg' + n);
    }, 100);
  }
}
window.restoreDGPanel = restoreDGPanel;

function updateDirigeantLabels() {
  var terms = getDirigeantTerms();
  // Update tab labels
  var tabs = document.querySelectorAll('#dirigeant-tabs .associe-tab');
  tabs.forEach(function(t, i) {
    var label = t.querySelector('span:first-child');
    var num = parseInt(t.dataset.tab);
    if (!t.classList.contains('filled')) {
      label.textContent = (i === 0 ? terms.primary : terms.secondary) + ' ' + num;
    }
  });
  // Update badges in panels
  var panels = document.querySelectorAll('#dirigeant-panels .associe-panel');
  panels.forEach(function(p, i) {
    var badge = p.querySelector('.dirigeant-badge');
    if (badge) {
      if (i === 0) {
        badge.className = 'dirigeant-badge';
        badge.innerHTML = terms.primary;
      } else {
        badge.className = 'dirigeant-badge dg';
        badge.innerHTML = terms.secondary;
      }
    }
  });
  // Update add button text
  var addBtn = document.getElementById('btn-add-dirigeant');
  if (addBtn) addBtn.querySelector('span').textContent = 'Ajouter un ' + terms.secondary.toLowerCase();
}
window.updateDirigeantLabels = updateDirigeantLabels;

function onDirigeantChange(select, formId) {
  var form = document.getElementById(formId);
  if (select.value === 'autre') {
    form.style.display = '';
    form.style.opacity = '0';
    form.style.transform = 'translateY(8px)';
    requestAnimationFrame(function() {
      form.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      form.style.opacity = '1';
      form.style.transform = 'translateY(0)';
    });
  } else {
    form.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    form.style.opacity = '0';
    form.style.transform = 'translateY(8px)';
    setTimeout(function() { form.style.display = 'none'; }, 200);
  }
  // Met à jour le label du tab avec le nom du dirigeant sélectionné
  updateDirigeantTabFromSelect(select);
  // Refresh les autres selects pour retirer l'associé maintenant pris (et éventuellement
  // ré-ajouter celui qu'on vient de libérer)
  refreshDirigeantSelects();
}
window.onDirigeantChange = onDirigeantChange;

// Calcule et applique le label "Président · Jean DUPONT" sur le tab à partir du select dirigeant
function updateDirigeantTabFromSelect(select) {
  var panel = select.closest('.associe-panel');
  if (!panel || !panel.closest('#dirigeant-panels')) return;
  var num = parseInt(panel.dataset.panel);
  var tab = document.querySelector('#dirigeant-tabs .associe-tab[data-tab="' + num + '"] span:first-child');
  var tabEl = document.querySelector('#dirigeant-tabs .associe-tab[data-tab="' + num + '"]');
  if (!tab || !tabEl) return;
  var terms = getDirigeantTerms();
  var role = num === 1 ? terms.primary : terms.secondary;
  var name = '';
  var val = select.value || '';
  if (val.indexOf('associe-') === 0) {
    // Récupère le nom de l'associé sélectionné
    var idx = parseInt(val.replace('associe-', ''), 10);
    var assocPanels = document.querySelectorAll('#associe-panels .associe-panel');
    var ap = assocPanels[idx];
    if (ap) {
      if (ap.dataset.type === 'morale') {
        var denomInput = ap.querySelector('.associe-type-block[data-type="morale"] [data-field="denomination"]') || ap.querySelector('[data-field="denomination"]');
        name = denomInput ? denomInput.value.trim() : '';
      } else {
        var prenom = (ap.querySelector('input[data-field="prenom"]') || {}).value || '';
        var nom = (ap.querySelector('input[data-field="nom"]') || {}).value || '';
        name = (prenom + ' ' + nom).trim();
      }
    }
  } else if (val === 'autre') {
    // En mode "autre", on remplira via updateDirigeantTabName quand le user tape
    var prenomInput = panel.querySelector('input[data-field="dir-prenom"]');
    var nomInput = panel.querySelector('input[data-field="dir-nom"]');
    var p = prenomInput ? prenomInput.value : '';
    var nm = nomInput ? nomInput.value : '';
    name = (p + ' ' + nm).trim();
  }
  if (name) {
    tab.textContent = role + ' · ' + name;
    tabEl.classList.add('filled');
  } else {
    tab.textContent = role + ' ' + num;
    tabEl.classList.remove('filled');
  }
}
window.updateDirigeantTabFromSelect = updateDirigeantTabFromSelect;

function switchDirigeantType(btn, type, formId) {
  var container = document.getElementById(formId);
  var buttons = container.querySelectorAll('.type-btn');
  buttons.forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');

  var panels = container.querySelectorAll('.dirigeant-type-panel');
  panels.forEach(function(p) {
    if (p.dataset.type === type) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });
}
window.switchDirigeantType = switchDirigeantType;

function switchDirigeantTab(num) {
  activeDirigeantTab = num;
  document.querySelectorAll('#dirigeant-tabs .associe-tab').forEach(function(t) {
    t.classList.toggle('active', parseInt(t.dataset.tab) === num);
  });
  document.querySelectorAll('#dirigeant-panels .associe-panel').forEach(function(p) {
    if (parseInt(p.dataset.panel) === num) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });
}
window.switchDirigeantTab = switchDirigeantTab;

function dirigeantPanelHTML(n) {
  var terms = getDirigeantTerms();
  var opts = buildAssocieOptions();
  var formId = 'dirigeant-form-' + n;
  var badgeClass = n === 1 ? 'dirigeant-badge' : 'dirigeant-badge dg';
  var badgeText = n === 1 ? terms.primary : terms.secondary;
  return '<div class="dirigeant-section-header">'
    + '<div class="' + badgeClass + '" id="badge-dirigeant-' + n + '">' + badgeText + '</div>'
    + '</div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field"><label>Dirigeant <span class="required">*</span></label>'
    + '<select class="dirigeant-panel-select" id="select-dirigeant-' + n + '" onchange="onDirigeantChange(this, \'' + formId + '\')">' + opts + '</select></div>'
    + '</div>'
    + '<div id="' + formId + '" class="dirigeant-extra" style="display:none;">'
    + '<div class="dirigeant-type-switch">'
    + '<button class="type-btn active" onclick="switchDirigeantType(this, \'physique\', \'' + formId + '\')">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Personne physique</button>'
    + '<button class="type-btn" onclick="switchDirigeantType(this, \'morale\', \'' + formId + '\')">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg> Personne morale</button></div>'
    + '<div class="dirigeant-type-panel active" data-type="physique">'
    + '<div class="form-grid" style="grid-template-columns: auto 1fr 1fr;">'
    + '<div class="field"><label>Civilit\u00e9</label><select style="width:120px;"><option value="" disabled selected>Choisir...</option><option>Monsieur</option><option>Madame</option></select></div>'
    + '<div class="field"><label>Pr\u00e9nom <span class="required">*</span></label><input type="text" placeholder="Pr\u00e9nom" data-field="dir-prenom" oninput="updateDirigeantTabName(this)"></div>'
    + '<div class="field"><label>Nom <span class="required">*</span></label><input type="text" placeholder="Nom" data-field="dir-nom" oninput="updateDirigeantTabName(this)"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;"><div class="field full"><label>Adresse</label><input type="text" placeholder="Adresse du dirigeant" class="addr-auto"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field"><label>Date de naissance <span class="required">*</span></label><input type="date"></div>'
    + '<div class="field"><label>Ville de naissance</label><input type="text" placeholder="Ville de naissance" class="city-birth-auto"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field"><label>Code postal de naissance</label><input type="text" placeholder="Code postal" class="cp-birth"></div>'
    + '<div class="field"><label>Pays de naissance</label><input type="text" value="France" class="pays-birth"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field"><label>Nom et pr\u00e9nom du p\u00e8re</label><input type="text" placeholder="Nom et pr\u00e9nom du p\u00e8re"></div>'
    + '<div class="field"><label>Nom et pr\u00e9nom de la m\u00e8re</label><input type="text" placeholder="Nom et pr\u00e9nom de la m\u00e8re"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field"><label>Nationalit\u00e9</label><input type="text" value="Fran\u00e7aise"></div>'
    + '<div class="field"><label>Situation matrimoniale</label><select class="sit-mat-select" onchange="toggleConjoint(this)"><option value="" disabled selected>Choisir...</option><option>C\u00e9libataire</option><option>Mari\u00e9(e)</option><option>Pacs\u00e9(e)</option><option>Divorc\u00e9(e)</option><option>Veuf(ve)</option></select></div></div>'
    + '<div class="form-grid" style="margin-top:16px;"><div class="field full"><label>Email <span style="font-weight:400;color:#999;">(pour signature)</span></label><input type="email" placeholder="Email du dirigeant" data-field="dir-email"></div></div></div>'
    + '<div class="dirigeant-type-panel" data-type="morale">'
    + '<div class="form-subsection">Informations de la soci\u00e9t\u00e9</div>'
    + '<div class="form-grid">'
    + '<div class="field"><label>Nom de la soci\u00e9t\u00e9 <span class="required">*</span></label><input type="text" placeholder="Rechercher une soci\u00e9t\u00e9..." class="denom-auto-dir"></div>'
    + '<div class="field"><label>Adresse de la soci\u00e9t\u00e9</label><input type="text" placeholder="Adresse" class="addr-auto"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field"><label>Capital social</label><input type="text" placeholder="Capital social"></div>'
    + '<div class="field"><label>Num\u00e9ro RCS <span class="required">*</span></label><input type="text" placeholder="Num\u00e9ro RCS"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field"><label>Ville d\'immatriculation <span class="required">*</span></label><input type="text" placeholder="Ville d\'immatriculation"></div>'
    + '<div class="field"><label>Type d\'entreprise</label><input type="text" placeholder="Type d\'entreprise (SAS, SARL...)"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field"><label>Num\u00e9ro SIRET <span class="required">*</span></label><input type="text" placeholder="Num\u00e9ro SIRET"></div>'
    + '<div class="field"></div></div>'
    + '<div class="form-subsection" style="margin-top:24px;">Repr\u00e9sentant l\u00e9gal (g\u00e9rant/pr\u00e9sident)</div>'
    + '<div class="form-grid" style="grid-template-columns: auto 1fr 1fr;">'
    + '<div class="field"><label>Civilit\u00e9</label><select style="width:120px;"><option value="" disabled selected>Choisir...</option><option>Monsieur</option><option>Madame</option></select></div>'
    + '<div class="field"><label>Pr\u00e9nom <span class="required">*</span></label><input type="text" placeholder="Pr\u00e9nom"></div>'
    + '<div class="field"><label>Nom <span class="required">*</span></label><input type="text" placeholder="Nom"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field full"><label>Adresse</label><input type="text" placeholder="Adresse du repr\u00e9sentant" class="addr-auto"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field"><label>Date de naissance <span class="required">*</span></label><input type="date"></div>'
    + '<div class="field"><label>Ville de naissance</label><input type="text" placeholder="Ville de naissance" class="city-birth-auto"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field"><label>Code postal de naissance</label><input type="text" placeholder="Code postal" class="cp-birth"></div>'
    + '<div class="field"><label>Pays de naissance</label><input type="text" value="France" class="pays-birth"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field"><label>Nom et pr\u00e9nom du p\u00e8re</label><input type="text" placeholder="Nom et pr\u00e9nom du p\u00e8re"></div>'
    + '<div class="field"><label>Nom et pr\u00e9nom de la m\u00e8re</label><input type="text" placeholder="Nom et pr\u00e9nom de la m\u00e8re"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field"><label>Nationalit\u00e9</label><input type="text" value="Fran\u00e7aise"></div>'
    + '<div class="field"><label>Situation matrimoniale</label><select class="sit-mat-select" onchange="toggleConjoint(this)"><option value="" disabled selected>Choisir...</option><option>C\u00e9libataire</option><option>Mari\u00e9(e)</option><option>Pacs\u00e9(e)</option><option>Divorc\u00e9(e)</option><option>Veuf(ve)</option></select></div></div></div>'
    + '</div>'
    + '<div class="form-grid" style="margin-top:20px;">'
    + '<div class="field"><label>R\u00e9mun\u00e9ration</label>'
    + '<select><option value="" disabled selected>Choisir...</option><option>D\u00e9termin\u00e9e ult\u00e9rieurement</option><option>Fixe</option><option>Variable</option></select></div>'
    + '<div class="field"><label>R\u00e9gime social</label>'
    + '<select><option value="" disabled selected>Choisir...</option><option>Assimil\u00e9 salari\u00e9</option><option>Travailleur non salari\u00e9</option></select></div></div>';
}
window.dirigeantPanelHTML = dirigeantPanelHTML;

function addDirigeant() {
  dirigeantCount++;
  var tabs = document.getElementById('dirigeant-tabs');
  var addBtn = tabs.querySelector('.btn-add-tab');
  var terms = getDirigeantTerms();

  // Create tab
  var tab = document.createElement('button');
  tab.className = 'associe-tab';
  tab.dataset.tab = dirigeantCount;
  tab.onclick = function() { switchDirigeantTab(parseInt(this.dataset.tab)); };
  tab.innerHTML = '<span>' + terms.secondary + ' ' + dirigeantCount + '</span><span class="tab-dot"></span>'
    + '<span class="tab-close" onclick="event.stopPropagation(); removeDirigeant(' + dirigeantCount + ');">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>';
  tabs.insertBefore(tab, addBtn);

  // Create panel
  var panel = document.createElement('div');
  panel.className = 'associe-panel';
  panel.dataset.panel = dirigeantCount;
  panel.innerHTML = dirigeantPanelHTML(dirigeantCount);
  document.getElementById('dirigeant-panels').appendChild(panel);

  // Init autocomplete, custom selects, datepickers
  panel.querySelectorAll('.addr-auto').forEach(function(inp) { initAddressAutocomplete(inp); });
  panel.querySelectorAll('.denom-auto-dir').forEach(function(inp) { if (typeof initCompanyAutocomplete === 'function') initCompanyAutocomplete(inp, window._applyDirigeantCompany); });
  panel.querySelectorAll('.city-birth-auto').forEach(function(inp) { if (typeof initCityBirthAutocomplete === 'function') initCityBirthAutocomplete(inp); });
  panel.querySelectorAll('select').forEach(function(s) { if (typeof initCustomSelect === 'function') initCustomSelect(s); });
  panel.querySelectorAll('input[type="date"]').forEach(function(d) { if (typeof initCustomDate === 'function') initCustomDate(d); });

  // Switch to new tab
  switchDirigeantTab(dirigeantCount);
}
window.addDirigeant = addDirigeant;

function removeDirigeant(num) {
  if (document.querySelectorAll('#dirigeant-tabs .associe-tab').length <= 1) return;

  var tab = document.querySelector('#dirigeant-tabs .associe-tab[data-tab="' + num + '"]');
  var panel = document.querySelector('#dirigeant-panels .associe-panel[data-panel="' + num + '"]');

  tab.style.transition = 'opacity 0.2s, transform 0.2s';
  tab.style.opacity = '0';
  tab.style.transform = 'scale(0.9)';

  setTimeout(function() {
    tab.remove();
    panel.remove();
    renumberDirigeantTabs();
    var firstTab = document.querySelector('#dirigeant-tabs .associe-tab');
    if (firstTab) switchDirigeantTab(parseInt(firstTab.dataset.tab));
  }, 200);
}
window.removeDirigeant = removeDirigeant;

function renumberDirigeantTabs() {
  var tabs = document.querySelectorAll('#dirigeant-tabs .associe-tab');
  var panels = document.querySelectorAll('#dirigeant-panels .associe-panel');
  var terms = getDirigeantTerms();
  dirigeantCount = tabs.length;
  tabs.forEach(function(t, i) {
    var num = i + 1;
    t.dataset.tab = num;
    var label = t.querySelector('span:first-child');
    if (!t.classList.contains('filled')) {
      label.textContent = (i === 0 ? terms.primary : terms.secondary) + ' ' + num;
    }
    var close = t.querySelector('.tab-close');
    if (close) close.setAttribute('onclick', 'event.stopPropagation(); removeDirigeant(' + num + ');');
    t.onclick = (function(n) { return function() { switchDirigeantTab(n); }; })(num);
  });
  panels.forEach(function(p, i) {
    var num = i + 1;
    p.dataset.panel = num;
    var formId = 'dirigeant-form-' + num;
    var extra = p.querySelector('.dirigeant-extra');
    if (extra) extra.id = formId;
    var sel = p.querySelector('.dirigeant-panel-select');
    if (sel) {
      sel.id = 'select-dirigeant-' + num;
      sel.setAttribute('onchange', "onDirigeantChange(this, '" + formId + "')");
    }
    var badge = p.querySelector('.dirigeant-badge');
    if (badge) {
      badge.id = 'badge-dirigeant-' + num;
      if (i === 0) {
        badge.className = 'dirigeant-badge';
        badge.innerHTML = terms.primary;
      } else {
        badge.className = 'dirigeant-badge dg';
        badge.innerHTML = terms.secondary;
      }
    }
    p.querySelectorAll('.type-btn').forEach(function(btn) {
      var type = btn.textContent.indexOf('morale') >= 0 ? 'morale' : 'physique';
      btn.setAttribute('onclick', "switchDirigeantType(this, '" + type + "', '" + formId + "')");
    });
  });
}
window.renumberDirigeantTabs = renumberDirigeantTabs;

function updateDirigeantTabName(input) {
  var panel = input.closest('.associe-panel');
  if (!panel || !panel.closest('#dirigeant-panels')) return;
  var num = parseInt(panel.dataset.panel);
  var prenomInput = panel.querySelector('input[data-field="dir-prenom"]');
  var nomInput = panel.querySelector('input[data-field="dir-nom"]');
  var prenom = prenomInput ? prenomInput.value : '';
  var nom = nomInput ? nomInput.value : '';
  var tab = document.querySelector('#dirigeant-tabs .associe-tab[data-tab="' + num + '"] span:first-child');
  var tabEl = document.querySelector('#dirigeant-tabs .associe-tab[data-tab="' + num + '"]');
  var terms = getDirigeantTerms();
  var role = num === 1 ? terms.primary : terms.secondary;
  if (prenom || nom) {
    tab.textContent = role + ' · ' + (prenom + ' ' + nom).trim();
    tabEl.classList.add('filled');
  } else {
    tab.textContent = role + ' ' + num;
    tabEl.classList.remove('filled');
  }
}
window.updateDirigeantTabName = updateDirigeantTabName;

Formalist.dirigeants = {
  getDirigeantTerms: getDirigeantTerms,
  buildAssocieOptions: buildAssocieOptions,
  refreshDirigeantSelects: refreshDirigeantSelects,
  updateDirigeantLabels: updateDirigeantLabels,
  onDirigeantChange: onDirigeantChange,
  switchDirigeantType: switchDirigeantType,
  switchDirigeantTab: switchDirigeantTab,
  dirigeantPanelHTML: dirigeantPanelHTML,
  addDirigeant: addDirigeant,
  removeDirigeant: removeDirigeant,
  renumberDirigeantTabs: renumberDirigeantTabs,
  updateDirigeantTabName: updateDirigeantTabName
};
