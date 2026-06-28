/**
 * Formalist Lifecycle Module
 * Phase management (1-5), signature flow, document space, upgrade offer
 */
window.Formalist = window.Formalist || {};

/* ===== LIFECYCLE STATE MACHINE ===== */
var _lcDocs = []; // current doc list
var _annonceLegaleTimer = null;

function getLcKey() {
  return _currentFormaliteId ? 'formalist_lifecycle_' + _currentFormaliteId : 'formalist_lifecycle';
}
window.getLcKey = getLcKey;

function loadLifecycle() {
  try {
    // Try formalite-specific key first, fallback to legacy global key
    var key = getLcKey();
    var raw = localStorage.getItem(key);
    if (!raw && _currentFormaliteId) {
      raw = localStorage.getItem('formalist_lifecycle');
      // Migrate legacy key to formalite-specific key
      if (raw) {
        localStorage.setItem(key, raw);
        localStorage.removeItem('formalist_lifecycle');
      }
    }
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return {
    phase: 1,
    attestationUploadDate: null,
    attestationFileName: null,
    attestationOriginalName: null,
    signatureData: null,
    signedDocs: [],
    kbisFileName: null,
    annonceLegaleReadyAt: null,
    docsDateSignature: null,
    docsDateSignatureCourte: null,
    generatedAt: null,
    businessSubPhase: null,
    creatorSigned: false,
    sigRequestsGenerated: false
  };
}
window.loadLifecycle = loadLifecycle;

function saveLifecycle(lc) {
  try { localStorage.setItem(getLcKey(), JSON.stringify(lc)); } catch(e) {}
}
window.saveLifecycle = saveLifecycle;

/* ===== LOCKED MODE (after payment / docs generated) =====
   Une fois le paiement validé et les documents générés (lc.generatedAt défini), tout le
   funnel (étapes 1→6) passe en lecture seule. L'utilisateur peut naviguer mais ne peut pas
   modifier ni re-déclencher un paiement. Pour changer une info, il passe par "Proposer
   une modification" → la demande est stockée et transmise à l'avocat pour validation.
*/
function isFormaliteLocked() {
  var lc = loadLifecycle();
  return !!(lc && lc.generatedAt);
}
window.isFormaliteLocked = isFormaliteLocked;

function applyLockedMode() {
  // Pendant une demande de correction, on garde les champs déverrouillés
  // même si la navigation rappelle applyLockedMode().
  if (window._correctionMode) return;
  var locked = isFormaliteLocked();
  for (var s = 1; s <= 6; s++) {
    var step = document.querySelector('.step-content[data-step="' + s + '"]');
    if (!step) continue;
    var existingBanner = step.querySelector('.locked-banner');
    if (locked) {
      if (!existingBanner) {
        var banner = document.createElement('div');
        banner.className = 'locked-banner';
        // Sur l'étape Offres (6), pas de "Demander une modification" : la modification disponible
        // est l'upgrade d'offre via les cartes ci-dessous.
        var isOffres = (s === 6);
        var bannerText = isOffres
          ? 'Le paiement est validé. Vous pouvez upgrader vers une offre supérieure ci-dessous : seule la différence vous sera facturée.'
          : 'Paiement validé et documents générés. Pour corriger une information, demandez une modification à votre avocat.';
        var actions = isOffres
          ? '<button class="btn-back-docs" type="button" onclick="goToStep(7)">Retour à Mes documents →</button>'
          : '<button class="btn-propose-mod" type="button" onclick="openProposeMod()">Demander une modification</button>'
            + '<button class="btn-back-docs" type="button" onclick="goToStep(7)">Retour à Mes documents →</button>';
        banner.innerHTML =
          '<div class="locked-banner-icon">'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>'
          + '</div>'
          + '<div class="locked-banner-text">'
          + '<strong>Dossier verrouillé</strong>'
          + '<span>' + bannerText + '</span>'
          + '</div>'
          + '<div class="locked-banner-actions">' + actions + '</div>';
        step.insertBefore(banner, step.firstChild);
      }
      // Désactive tous les champs éditables
      step.querySelectorAll('input, select, textarea').forEach(function(f) { f.disabled = true; });
      step.querySelectorAll('.cselect, .cdp').forEach(function(c) { c.classList.add('locked'); });
      // Marque la step comme verrouillée pour le CSS (grise les zones d'action)
      step.classList.add('step-locked');
      // Cache le bouton de paiement à l'étape Offres
      var payBtn = step.querySelector('#btn-submit-offer');
      if (payBtn) payBtn.style.display = 'none';
      // Step 6 spécifique : on autorise l'upgrade vers une offre supérieure (payer la différence)
      if (s === 6) {
        _applyUpgradeUI(step);
      }
    } else {
      if (existingBanner) existingBanner.remove();
      step.querySelectorAll('input, select, textarea').forEach(function(f) { f.disabled = false; });
      step.querySelectorAll('.cselect.locked, .cdp.locked').forEach(function(c) { c.classList.remove('locked'); });
      step.classList.remove('step-locked');
      var payBtn2 = step.querySelector('#btn-submit-offer');
      if (payBtn2) payBtn2.style.display = '';
    }
  }
}
window.applyLockedMode = applyLockedMode;

/* ===== MODE CORRECTION (demander une modification) =====
   L'utilisateur déverrouille ses propres champs, corrige directement, puis
   envoie les changements (diff auto + note) à son avocat. */

// Champs éditables des étapes de données (1 à 5).
function _cmFields() {
  var out = [];
  for (var s = 1; s <= 5; s++) {
    var step = document.querySelector('.step-content[data-step="' + s + '"]');
    if (!step) continue;
    step.querySelectorAll('input:not([type="file"]):not([type="hidden"]), select, textarea').forEach(function(el) {
      out.push(el);
    });
  }
  return out;
}
function _cmRaw(el) {
  if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? '1' : '0';
  return el.value != null ? el.value : '';
}
function _cmShow(el, raw) {
  if (el.type === 'checkbox' || el.type === 'radio') return raw === '1' ? 'Oui' : 'Non';
  return (raw && raw.trim()) ? raw : '(vide)';
}
// Libellé lisible d'un champ (label nettoyé + contexte étape/associé).
function _cmLabel(el) {
  var field = el.closest('.field, .form-group');
  var labelEl = field ? field.querySelector('label') : null;
  var label = '';
  if (labelEl) {
    var clone = labelEl.cloneNode(true);
    clone.querySelectorAll('.tooltip-wrap, .required').forEach(function(n) { n.remove(); });
    label = clone.textContent.replace(/\s+/g, ' ').trim();
  }
  if (!label) label = el.getAttribute('placeholder') || el.getAttribute('name') || el.id || 'Champ';

  // Contexte : nom de l'étape + numéro d'associé/dirigeant si applicable
  var prefix = '';
  var step = el.closest('.step-content[data-step]');
  if (step) {
    var h2 = step.querySelector('h2');
    if (h2) prefix = h2.textContent.replace(/\s+/g, ' ').trim();
  }
  var panel = el.closest('.associe-panel, .dirigeant-panel');
  if (panel) {
    var sel = panel.classList.contains('associe-panel') ? '.associe-panel' : '.dirigeant-panel';
    var panels = Array.prototype.slice.call(document.querySelectorAll(sel));
    var idx = panels.indexOf(panel);
    if (idx >= 0) prefix = (prefix ? prefix + ' · ' : '') + (panel.classList.contains('associe-panel') ? 'Associé ' : 'Dirigeant ') + (idx + 1);
  }
  return prefix ? prefix + ' › ' + label : label;
}

// Élément visible à mettre en évidence (le contrôle custom le cas échéant).
function _cmVisual(el) {
  return el.closest('.cselect') || el.closest('.cdp') || el;
}
// Marque/démarque un champ comme modifié (bordure + texte violet).
function _cmOnInput(e) {
  if (!window._correctionMode) return;
  var el = e.target;
  if (!('cmOrig' in el.dataset)) return;
  _cmVisual(el).classList.toggle('cm-modified', _cmRaw(el) !== el.dataset.cmOrig);
}

function _cmComputeChanges() {
  var changes = [];
  _cmFields().forEach(function(el) {
    if (!('cmOrig' in el.dataset)) return;
    var now = _cmRaw(el);
    if (now !== el.dataset.cmOrig) {
      changes.push({ label: _cmLabel(el), from: _cmShow(el, el.dataset.cmOrig), to: _cmShow(el, now) });
    }
  });
  return changes;
}

// Déverrouille les champs (comme la branche "unlock" de applyLockedMode).
function enterCorrectionMode() {
  window._correctionMode = true;
  // Mémorise les verrous actifs pour les restaurer en sortie (2 systèmes :
  // applyLockedMode = disabled, applyUserReadOnly = readOnly + body.user-readonly).
  window._cmWasUserReadonly = document.body.classList.contains('user-readonly');
  window._cmWasLocked = !!document.querySelector('.locked-banner');
  document.body.classList.add('correction-mode');
  document.body.classList.remove('user-readonly');
  for (var s = 1; s <= 5; s++) {
    var step = document.querySelector('.step-content[data-step="' + s + '"]');
    if (!step) continue;
    var yellow = step.querySelector('.locked-banner');
    if (yellow) yellow.style.display = 'none';
    step.querySelectorAll('input, select, textarea').forEach(function(f) {
      f.disabled = false;
      f.readOnly = false;
      f.removeAttribute('tabindex');
    });
    step.querySelectorAll('.cselect.locked, .cdp.locked').forEach(function(c) { c.classList.remove('locked'); });
    step.classList.remove('step-locked');
  }
  // Snapshot des valeurs d'origine + écoute des modifications (mise en évidence)
  _cmFields().forEach(function(el) {
    el.dataset.cmOrig = _cmRaw(el);
    if (!el._cmBound) {
      el._cmBound = true;
      el.addEventListener('input', _cmOnInput);
      el.addEventListener('change', _cmOnInput);
    }
  });
  // Barre flottante d'action
  var bar = document.getElementById('correction-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'correction-bar';
    bar.className = 'correction-bar';
    bar.innerHTML =
      '<div class="correction-bar-text"><strong>Mode correction</strong><span>Modifiez les champs à corriger, puis envoyez la demande à votre avocat.</span></div>'
      + '<div class="correction-bar-actions">'
      + '<button type="button" class="cbar-cancel" onclick="cancelCorrectionMode()">Annuler</button>'
      + '<button type="button" class="cbar-send" onclick="openCorrectionConfirm()">Envoyer la demande</button>'
      + '</div>';
    document.body.appendChild(bar);
  }
  bar.classList.add('active');
}
// Conservé pour compat : le bouton appelle openProposeMod()
function openProposeMod() { enterCorrectionMode(); }
window.openProposeMod = openProposeMod;
window.enterCorrectionMode = enterCorrectionMode;

// Sort du mode correction. restore=true : on remet les valeurs d'origine
// (la demande est en attente de validation avocat).
function exitCorrectionMode(restore) {
  _cmFields().forEach(function(el) {
    if (restore && ('cmOrig' in el.dataset)) {
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = el.dataset.cmOrig === '1';
      else el.value = el.dataset.cmOrig;
    }
    delete el.dataset.cmOrig;
  });
  window._correctionMode = false;
  document.body.classList.remove('correction-mode');
  document.querySelectorAll('.cm-modified').forEach(function(n) { n.classList.remove('cm-modified'); });
  var bar = document.getElementById('correction-bar');
  if (bar) bar.classList.remove('active');
  // Réaffiche les bandeaux et reverrouille selon le(s) système(s) d'origine
  document.querySelectorAll('.locked-banner').forEach(function(b) { b.style.display = ''; });
  if (window._cmWasLocked && typeof applyLockedMode === 'function') applyLockedMode();
  if (window._cmWasUserReadonly) {
    document.body.classList.add('user-readonly');
    if (typeof applyUserReadOnly === 'function') applyUserReadOnly();
  }
}
function cancelCorrectionMode() { exitCorrectionMode(true); }
window.cancelCorrectionMode = cancelCorrectionMode;

// Ouvre la modale de confirmation avec le récap des changements + note.
function openCorrectionConfirm() {
  var changes = _cmComputeChanges();
  if (!changes.length) {
    showAppDialog({
      type: 'warning',
      title: 'Aucune modification',
      message: 'Modifiez au moins un champ (il passera en violet) avant d\'envoyer votre demande.',
      button: 'Compris'
    });
    return;
  }
  var box = document.getElementById('propose-mod-changes');
  if (box) {
    box.innerHTML = changes.map(function(c) {
      return '<div class="pm-change"><div class="pm-change-label">' + _escHtml(c.label) + '</div>'
        + '<div class="pm-change-vals"><span class="pm-from">' + _escHtml(c.from) + '</span>'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>'
        + '<span class="pm-to">' + _escHtml(c.to) + '</span></div></div>';
    }).join('');
  }
  window._pendingChanges = changes;
  var overlay = document.getElementById('propose-mod-overlay');
  if (overlay) overlay.classList.add('active');
}
window.openCorrectionConfirm = openCorrectionConfirm;

// Dialogue applicatif stylé (remplace alert()).
function showAppDialog(opts) {
  opts = opts || {};
  var ov = document.getElementById('app-dialog');
  if (!ov) { alert(opts.message || ''); return; }
  document.getElementById('app-dialog-title').textContent = opts.title || '';
  document.getElementById('app-dialog-msg').textContent = opts.message || '';
  var icon = document.getElementById('app-dialog-icon');
  var type = opts.type || 'success';
  icon.className = 'app-dialog-icon ' + type;
  icon.innerHTML = (type === 'warning')
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  document.getElementById('app-dialog-btn').textContent = opts.button || 'Compris';
  ov.classList.add('active');
}
window.showAppDialog = showAppDialog;
function closeAppDialog() {
  var ov = document.getElementById('app-dialog');
  if (ov) ov.classList.remove('active');
}
window.closeAppDialog = closeAppDialog;

function _escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function closeProposeMod() {
  var overlay = document.getElementById('propose-mod-overlay');
  if (overlay) overlay.classList.remove('active');
  var ta = document.getElementById('propose-mod-text');
  if (ta) ta.value = '';
}
window.closeProposeMod = closeProposeMod;

// Configure l'étape Offres en mode "upgrade only" quand le dossier est payé.
// L'offre actuelle est marquée, les offres inférieures sont grisées (downgrade interdit),
// les offres supérieures restent cliquables avec un bouton "Passer à X (+Y€)".
function _applyUpgradeUI(stepEl) {
  // Totaux HT du forfait (service + 180€ d'annonce légale). La différence
  // entre deux offres reste le surcoût réel à payer pour un upgrade.
  var PRICES = { starter: 269, business: 580, premium: 780 };
  var ORDER = ['starter', 'business', 'premium'];
  var current = (typeof selectedOffer !== 'undefined' && selectedOffer) ? selectedOffer : null;
  if (!current) {
    var lc = loadLifecycle();
    current = (lc && lc.selectedOffer) || 'business';
  }
  var currentPrice = PRICES[current] || 0;
  var currentIdx = ORDER.indexOf(current);

  stepEl.querySelectorAll('.pricing-card').forEach(function(card) {
    var offer = card.dataset.offer;
    var offerIdx = ORDER.indexOf(offer);
    var offerPrice = PRICES[offer] || 0;
    var btn = card.querySelector('.pricing-select-btn');
    // Reset
    card.classList.remove('offer-current', 'offer-downgrade', 'offer-upgrade');
    card.style.pointerEvents = '';
    card.style.opacity = '';
    card.onclick = null;
    if (btn) { btn.onclick = null; btn.disabled = false; btn.innerHTML = btn.textContent || 'Sélectionner'; }
    // Retire l'ancien badge "current" qu'on aurait pu injecter
    var oldBadge = card.querySelector('.pricing-badge-current');
    if (oldBadge) oldBadge.remove();

    if (offer === current) {
      // Offre actuelle
      card.classList.add('offer-current');
      // Injecte un badge "Offre actuelle" en remplacement du badge "Recommandé"
      var newBadge = document.createElement('span');
      newBadge.className = 'pricing-badge pricing-badge-current';
      newBadge.textContent = 'Offre actuelle';
      card.insertBefore(newBadge, card.firstChild);
      if (btn) {
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg> Offre actuelle';
        btn.disabled = true;
      }
      card.style.pointerEvents = 'none';
    } else if (offerIdx < currentIdx) {
      // Downgrade interdit
      card.classList.add('offer-downgrade');
      if (btn) {
        btn.textContent = 'Inférieure à l\'actuelle';
        btn.disabled = true;
      }
    } else {
      // Upgrade possible
      card.classList.add('offer-upgrade');
      var diff = offerPrice - currentPrice;
      var label = offer.charAt(0).toUpperCase() + offer.slice(1);
      if (btn) {
        btn.innerHTML = 'Passer à ' + label + ' <span style="opacity:0.75;font-weight:400;margin-left:6px;">+' + diff + '€</span>';
        btn.disabled = false;
        btn.style.cursor = 'pointer';
        btn.onclick = function(e) {
          e.stopPropagation();
          proposeUpgrade(offer, diff);
        };
      }
      card.onclick = function(e) {
        if (e.target && e.target.classList && e.target.classList.contains('pricing-select-btn')) return;
        e.stopPropagation();
        proposeUpgrade(offer, diff);
      };
    }
  });
}

function proposeUpgrade(newOffer, diff) {
  var names = { starter: 'Starter', business: 'Business', premium: 'Premium' };
  var label = names[newOffer] || newOffer;
  var ok = confirm(
    'Passer à l\'offre ' + label + ' ?\n\n' +
    'Vous payez uniquement la différence : ' + diff + '€ HT.\n\n' +
    'Une fois le paiement validé, l\'offre supérieure est activée et vous bénéficiez ' +
    'des nouveaux services (relecture avocat, traitement prioritaire, etc.).'
  );
  if (!ok) return;
  // TODO Phase 2 : déclencher un paiement Stripe de "diff" € puis mettre à jour selectedOffer
  // côté backend, puis re-render. Pour l'instant, on simule.
  var lc = loadLifecycle();
  lc.upgradeRequests = lc.upgradeRequests || [];
  lc.upgradeRequests.push({
    from: lc.selectedOffer || (typeof selectedOffer !== 'undefined' ? selectedOffer : 'business'),
    to: newOffer,
    diff: diff,
    requestedAt: new Date().toISOString(),
    status: 'pending'
  });
  saveLifecycle(lc);
  alert(
    'Demande d\'upgrade enregistrée.\n\n' +
    'Vous serez redirigé(e) vers la page de paiement (' + diff + '€ HT) pour finaliser ' +
    'l\'upgrade vers l\'offre ' + label + '.'
  );
}
window.proposeUpgrade = proposeUpgrade;

function submitProposeMod() {
  var changes = window._pendingChanges || [];
  if (!changes.length) {
    showAppDialog({ type: 'warning', title: 'Aucune modification', message: 'Aucun changement à envoyer.', button: 'Compris' });
    return;
  }
  var ta = document.getElementById('propose-mod-text');
  var note = ta ? ta.value.trim() : '';
  var lc = loadLifecycle();
  lc.pendingModifications = lc.pendingModifications || [];
  lc.pendingModifications.push({
    id: 'mod_' + Date.now(),
    changes: changes,
    note: note,
    requestedAt: new Date().toISOString(),
    status: 'pending'
  });
  saveLifecycle(lc);
  window._pendingChanges = null;
  closeProposeMod();
  // Demande en attente de validation : on remet les valeurs d'origine.
  exitCorrectionMode(true);
  showAppDialog({
    type: 'success',
    title: 'Demande envoyée',
    message: changes.length + ' champ' + (changes.length > 1 ? 's' : '') + ' à corriger transmis à votre avocat. Il validera votre demande puis régénérera vos documents. Vous serez notifié(e) dès que c\'est fait.',
    button: 'Compris'
  });
}
window.submitProposeMod = submitProposeMod;

function getDocsList() {
  var forme = document.getElementById('forme-juridique');
  var nomSociete = document.querySelector('.step-content[data-step="1"] input[placeholder="Nom de la soci\u00e9t\u00e9"]');
  var panels = document.querySelectorAll('#associe-panels .associe-panel');
  var assocNames = [];
  panels.forEach(function(p, i) { assocNames.push(getAssocieName(p, i)); });
  var assocText = assocNames.length + ' associ\u00e9' + (assocNames.length > 1 ? 's' : '') + ' - ' + assocNames.join(', ');

  var svgFile = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  var svgShield = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
  var svgMegaphone = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
  var svgClipboard = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
  var svgUsers = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>';
  var svgHeart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>';
  var svgHome = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';

  var formeName = forme ? forme.value : 'SAS';
  var societeName = nomSociete && nomSociete.value ? nomSociete.value : 'Ma Soci\u00e9t\u00e9';
  var formeKey = formeName.toLowerCase();
  var templatePrefix = formeKey === 'eurl' ? 'sarl' : formeKey;

  // Collect married associés under communauté regime for conjoint docs
  var conjointAssocies = [];
  panels.forEach(function(p) {
    var aData = extractAssocieData(p);
    if (!aData || !aData.situationMatrimoniale) return;
    if (aData.situationMatrimoniale.toLowerCase().indexOf('mari') < 0) return;
    // Skip séparation de biens — no conjoint doc needed
    var contrat = aData.contratMariage || '';
    if (contrat.indexOf('paration de biens') >= 0) return;
    conjointAssocies.push(aData);
  });

  // Article "la" ou "l'" devant la forme juridique (EURL, EARL → l')
  var articleForme = /^[AEIOU]/.test(formeName.toUpperCase()) ? "l'" : 'la ';
  var statutsTitle = 'Statuts de ' + articleForme + formeName + ' ' + societeName;

  var docs = [];
  docs.push({ name: statutsTitle, desc: assocText, type: 'pdf', icon: svgFile, format: 'PDF', pages: '12-18 pages', template: templatePrefix + '-statuts.docx' });
  var pvName = (formeKey === 'sci' || formeKey === 'sarl' || formeKey === 'eurl') ? 'PV de nomination du g\u00e9rant' : 'PV de nomination du dirigeant';
  docs.push({ name: pvName, desc: 'Proc\u00e8s-verbal de nomination', type: 'cert', icon: svgClipboard, format: 'PDF', pages: '2-3 pages', template: templatePrefix + '-pv-nomination.docx' });
  if (formeKey === 'sas' || formeKey === 'sasu' || formeKey === 'eurl' || formeKey === 'sarl') {
    docs.push({ name: 'Liste des souscripteurs', desc: 'R\u00e9partition du capital - ' + panels.length + ' associ\u00e9' + (panels.length > 1 ? 's' : ''), type: 'cert', icon: svgUsers, format: 'PDF', pages: '1-2 pages', template: templatePrefix + '-liste-souscripteurs.docx' });
  }
  var dncBaseName = (formeKey === 'sci' || formeKey === 'sarl' || formeKey === 'eurl') ? 'D\u00e9claration de non-condamnation du g\u00e9rant' : 'D\u00e9claration de non-condamnation';

  // Extrait les donn\u00e9es compl\u00e8tes d'un dirigeant \u00e0 partir de son panel (s\u00e9lection d'un associ\u00e9 OU "autre personne")
  function _extractDirigeantPanelData(dirPanel) {
    if (!dirPanel) return null;
    var sel = dirPanel.querySelector('.dirigeant-panel-select');
    if (sel && sel.value && sel.value.indexOf('associe-') === 0) {
      var idx = parseInt(sel.value.replace('associe-', ''));
      var assocPanels = document.querySelectorAll('#associe-panels .associe-panel');
      if (assocPanels[idx]) {
        try { return extractAssocieData(assocPanels[idx]); } catch (_) { return null; }
      }
    }
    if (sel && sel.value === 'autre') {
      var activeType = dirPanel.querySelector('.dirigeant-type-panel.active');
      if (!activeType) return null;
      var prenomInp = activeType.querySelector('input[data-field="dir-prenom"]');
      var nomInp = activeType.querySelector('input[data-field="dir-nom"]');
      var allInputs = activeType.querySelectorAll('input');
      var allSelects = activeType.querySelectorAll('select');
      var prenom = prenomInp ? prenomInp.value.trim() : '';
      var nom = nomInp ? nomInp.value.trim() : '';
      var civilite = allSelects[0] ? allSelects[0].value : '';
      var civNomPrenom = (civilite + ' ' + nom.toUpperCase() + ' ' + prenom).trim();
      // Heuristic: position-based extraction of common fields (adresse, naissance, ville, cp, pays, pere, mere, nationalit\u00e9)
      // Inputs order in the dir-physique panel (after prenom/nom): adresse, dateNaiss, villeNaiss, cpNaiss, paysNaiss, pere, mere, nationalit\u00e9, email
      var adresse = allInputs[2] ? allInputs[2].value : '';
      var dateNaissance = allInputs[3] ? allInputs[3].value : '';
      var villeNaissance = allInputs[4] ? allInputs[4].value : '';
      var cpNaissance = allInputs[5] ? allInputs[5].value : '';
      var paysNaissance = allInputs[6] ? allInputs[6].value : 'France';
      var pere = allInputs[7] ? allInputs[7].value : '';
      var mere = allInputs[8] ? allInputs[8].value : '';
      var nationalite = allInputs[9] ? allInputs[9].value : 'Fran\u00e7aise';
      return {
        civilite: civilite, nom: nom, prenom: prenom,
        civNomPrenom: civNomPrenom || ((prenom + ' ' + nom).trim()),
        adresse: adresse,
        dateNaissance: dateNaissance,
        lieuNaissance: (villeNaissance || '') + (cpNaissance ? ' (' + cpNaissance + ')' : ''),
        lieuNaissanceVille: villeNaissance, cpNaissance: cpNaissance, paysNaissance: paysNaissance,
        pere: pere, mere: mere, nationalite: nationalite,
      };
    }
    return null;
  }

  // Construit un libell\u00e9 de r\u00f4le selon la forme et l'index
  function _dirigeantRoleLabel(formeKey, dirIndex) {
    if (formeKey === 'sarl' || formeKey === 'eurl') return 'G\u00e9rant';
    if (formeKey === 'sci') return 'G\u00e9rant';
    // SAS / SASU
    return dirIndex === 0 ? 'Pr\u00e9sident' : 'Directeur g\u00e9n\u00e9ral';
  }

  // Une DNC par dirigeant
  var dirPanels = document.querySelectorAll('#dirigeant-panels .associe-panel');
  var dirAdded = 0;
  dirPanels.forEach(function(dirPanel, dIdx) {
    var dd = _extractDirigeantPanelData(dirPanel);
    if (!dd) return;
    var dirNm = (dd.civNomPrenom || '').trim();
    var hasReal = dirNm && !/^(Associ[\u00e9e]|Actionnaire|Dirigeant|G[\u00e9e]rant)\s+\d+$/i.test(dirNm);
    var role = _dirigeantRoleLabel(formeKey, dIdx);
    var name = hasReal ? (dncBaseName + ' - ' + dirNm) : (dncBaseName + ' (' + role + ' ' + (dIdx + 1) + ')');
    var desc = hasReal ? ('Attestation sur l\u2019honneur de ' + dirNm + ' (' + role + ')') : ('Attestation sur l\u2019honneur du ' + role.toLowerCase());
    docs.push({
      name: name,
      desc: desc,
      type: 'doc', icon: svgShield, format: 'PDF', pages: '1 page',
      template: templatePrefix + '-declaration-non-condamnation.docx',
      dirigeantData: dd,
      dirigeantRole: role,
    });
    dirAdded++;
  });
  // Fallback : si aucun dirigeant n'a \u00e9t\u00e9 ajout\u00e9 (cas SASU/EURL o\u00f9 l'associ\u00e9 unique est dirigeant
  // sans panel d\u00e9di\u00e9), on g\u00e9n\u00e8re une DNC pour l'associ\u00e9 _1.
  if (dirAdded === 0) {
    var fallbackName = dncBaseName;
    var fallbackDesc = 'Attestation sur l\u2019honneur du dirigeant';
    if (panels.length > 0) {
      try {
        var aData = extractAssocieData(panels[0]);
        var nm = (aData && aData.civNomPrenom) || '';
        var hasReal2 = nm && !/^(Associ[\u00e9e]|Actionnaire|Dirigeant|G[\u00e9e]rant)\s+\d+$/i.test(nm);
        if (hasReal2) {
          fallbackName = dncBaseName + ' - ' + nm;
          fallbackDesc = 'Attestation sur l\u2019honneur de ' + nm;
        }
      } catch (_) {}
    }
    docs.push({ name: fallbackName, desc: fallbackDesc, type: 'doc', icon: svgShield, format: 'PDF', pages: '1 page', template: templatePrefix + '-declaration-non-condamnation.docx' });
  }
  docs.push({ name: 'Attestation de domiciliation', desc: 'Justificatif du si\u00e8ge social', type: 'doc', icon: svgHome, format: 'PDF', pages: '1 page', template: templatePrefix + '-attestation-domicile.docx' });
  // One conjoint doc per married associé under communauté regime
  for (var cj = 0; cj < conjointAssocies.length; cj++) {
    var cjData = conjointAssocies[cj];
    var cjName = (cjData.prenom + ' ' + cjData.nom).trim() || ('Associ\u00e9 ' + (cj + 1));
    docs.push({
      name: 'D\u00e9claration du conjoint - ' + cjName,
      desc: 'Attestation d\u2019intervention (art. 1832-2 C. civ.)',
      type: 'doc', icon: svgHeart, format: 'PDF', pages: '1 page',
      template: templatePrefix + '-conjoint.docx',
      conjointData: cjData,
    });
  }
  docs.push({ name: 'Annonce l\u00e9gale de constitution', desc: 'En cours de publication par un avocat', type: 'legal', icon: svgMegaphone, format: 'PDF', pages: '1 page', template: null, special: 'annonce' });
  return docs;
}
window.getDocsList = getDocsList;

function renderLifecycleStepper(lc) {
  var isBusiness = selectedOffer && selectedOffer !== 'starter';
  var phases = isBusiness
    ? ['Documents g\u00e9n\u00e9r\u00e9s', 'D\u00e9p\u00f4t du capital', 'Signature', 'R\u00e9vision par avocat', 'Immatriculation']
    : ['Documents g\u00e9n\u00e9r\u00e9s', 'D\u00e9p\u00f4t du capital', 'Signature', 'Immatriculation'];

  // Internal phase (1..6) \u2192 stepper step
  // 1 \u2192 1 (Docs), 2-3 \u2192 2 (D\u00e9p\u00f4t: banque + mise \u00e0 jour),
  // 4 \u2192 3 (Signature), 5 \u2192 4 (R\u00e9vision), 6 \u2192 5 (Immat)
  function phaseToStep(p) {
    if (p <= 1) return 1;
    if (p <= 3) return 2;
    return p - 1;
  }
  var currentStep = phaseToStep(lc.phase);

  var html = '';
  for (var i = 0; i < phases.length; i++) {
    var stepNum = i + 1;
    var cls = 'lc-phase';
    if (stepNum < currentStep) cls += ' done';
    else if (stepNum === currentStep) cls += ' active';
    else cls += ' locked';

    var numContent = stepNum < currentStep
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>'
      : stepNum;

    html += '<div class="' + cls + '"><span class="lc-num">' + numContent + '</span>' + phases[i] + '</div>';
    if (i < phases.length - 1) {
      html += '<div class="lc-connector' + (stepNum < currentStep ? ' done' : '') + '"></div>';
    }
  }
  document.getElementById('lifecycle-stepper').innerHTML = html;
}
window.renderLifecycleStepper = renderLifecycleStepper;

function enterPhase(phaseNum) {
  var lc = loadLifecycle();
  lc.phase = phaseNum;
  saveLifecycle(lc);
  renderLifecycleStepper(lc);

  var isBusiness = selectedOffer && selectedOffer !== 'starter';

  if (phaseNum === 1) renderPhase1(lc);
  else if (phaseNum === 2) renderPhase2(lc);
  else if (phaseNum === 3) renderPhase3(lc);
  else if (phaseNum === 4) renderPhase4(lc);
  else if (phaseNum === 5 && isBusiness) renderPhase5Business(lc);
  else if (phaseNum === 5 && !isBusiness) renderPhase5(lc);
  else if (phaseNum === 6 && isBusiness) renderPhase6Business(lc);

  // Update server phase if we have a formalite ID
  if (_currentFormaliteId) {
    fetch('/api/formalites/' + _currentFormaliteId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: phaseNum })
    }).catch(function() {});
  }

  renderDocSpace(lc);
}
window.enterPhase = enterPhase;

/* --- Phase 1: Documents generated --- */
function renderPhase1(lc) {
  var el = document.getElementById('lifecycle-content');

  // Banque — try DOM first, fallback to server-loaded data
  var banqueSel = document.getElementById('banque-select');
  var banqueLabel = banqueSel ? banqueSel.value : '';
  if (banqueLabel === 'Autre') {
    var autreNom = document.getElementById('banque-autre-nom');
    banqueLabel = (autreNom && autreNom.value) ? autreNom.value : '';
  }
  if (!banqueLabel && window._serverLoadedData && window._serverLoadedData.NOM_BANQUE && window._serverLoadedData.NOM_BANQUE !== '-') {
    banqueLabel = String(window._serverLoadedData.NOM_BANQUE).split(' - ')[0];
  }
  var banqueHtml = banqueLabel
    ? ' <strong>' + banqueLabel.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</strong>'
    : '';

  // Capital
  var capitalInput = document.getElementById('capital-social');
  var capitalNum = capitalInput ? (parseFloat(capitalInput.value) || 0) : 0;
  var capitalHtml = capitalNum
    ? ' de <strong>' + capitalNum.toLocaleString('fr-FR') + ' euros</strong>'
    : '';

  var desc = 'Pr\u00e9sentez les documents ci-dessous \u00e0 votre banque'
    + banqueHtml
    + ' pour d\u00e9poser votre capital'
    + capitalHtml
    + ' et obtenir votre attestation de d\u00e9p\u00f4t.';

  var titleHtml = banqueLabel
    ? 'D\u00e9posez le capital chez <strong>' + banqueLabel.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</strong>'
    : 'D\u00e9posez le capital \u00e0 votre banque';

  el.innerHTML = '<div class="lifecycle-content lifecycle-content--compact lc-action-card">'
    + '<div class="lc-head">'
    + '  <div class="lc-icon lc-icon--sm bank"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M12 3l9 7H3l9-7z"/><path d="M5 10v8"/><path d="M9 10v8"/><path d="M15 10v8"/><path d="M19 10v8"/></svg></div>'
    + '  <div class="lc-head-text">'
    + '    <span class="lc-status-pill"><span class="lc-status-dot"></span>Action requise</span>'
    + '    <h2>' + titleHtml + '</h2>'
    + '    <p>' + desc + '</p>'
    + '  </div>'
    + '  <button class="lc-cta lc-cta--sm" onclick="enterPhase(2)">'
    + '    J\u2019ai mon attestation'
    + '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>'
    + '  </button>'
    + '</div>'
    + '</div>';

  startAnnonceLegaleTimer(lc);
}

/* --- Phase 2: Upload attestation --- */
function renderPhase2(lc) {
  var el = document.getElementById('lifecycle-content');
  el.innerHTML = '<div class="lifecycle-content">'
    + '<div class="lc-icon upload"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>'
    + '<h2>Importez votre attestation de d\u00e9p\u00f4t de capital</h2>'
    + '<p>Uploadez le document remis par votre banque pour mettre \u00e0 jour la date de vos documents juridiques.</p>'
    + '<div class="lc-upload-zone" id="attestation-dropzone">'
    + '  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
    + '  <p><strong>Cliquez ou glissez</strong> votre attestation ici</p>'
    + '  <p style="font-size:12px;color:#bbb">PDF, JPG ou PNG \u2014 10 Mo max</p>'
    + '  <input type="file" id="attestation-input" accept=".pdf,.jpg,.jpeg,.png">'
    + '</div>'
    + '</div>';

  // Setup upload handlers
  var dropzone = document.getElementById('attestation-dropzone');
  var fileInput = document.getElementById('attestation-input');

  dropzone.addEventListener('click', function() { fileInput.click(); });
  dropzone.addEventListener('dragover', function(e) { e.preventDefault(); dropzone.classList.add('dragging'); });
  dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('dragging'); });
  dropzone.addEventListener('drop', function(e) {
    e.preventDefault(); dropzone.classList.remove('dragging');
    if (e.dataTransfer.files.length) uploadAttestation(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function() {
    if (fileInput.files.length) uploadAttestation(fileInput.files[0]);
  });
}

function uploadAttestation(file) {
  var formData = new FormData();
  formData.append('file', file);

  var dropzone = document.getElementById('attestation-dropzone');
  dropzone.innerHTML = '<div class="spinner"></div><p>Upload en cours...</p>';

  fetch('/api/upload', { method: 'POST', body: formData })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error(data.error || 'Upload failed');
      var lc = loadLifecycle();
      lc.attestationUploadDate = data.uploadDate;
      lc.attestationFileName = data.filename;
      lc.attestationOriginalName = data.originalName;
      saveLifecycle(lc);
      enterPhase(3);
    })
    .catch(function(e) {
      if (typeof showToast === 'function') showToast('Erreur : ' + e.message); else alert('Erreur: ' + e.message);
      renderPhase2(loadLifecycle());
    });
}
window.uploadAttestation = uploadAttestation;

function resetAttestation() {
  if (!confirm('Voulez-vous r\u00e9importer l\u2019attestation de d\u00e9p\u00f4t ? Les documents seront re-dat\u00e9s avec la date du jour.')) return;
  var lc = loadLifecycle();
  lc.attestationUploadDate = null;
  lc.attestationFileName = null;
  lc.attestationOriginalName = null;
  lc.docsDateSignature = null;
  lc.docsDateSignatureCourte = null;
  lc.creatorSigned = false;
  lc.signatureData = null;
  lc.parapheData = null;
  lc.signedDocs = [];
  saveLifecycle(lc);
  enterPhase(2);
}
window.resetAttestation = resetAttestation;

/* --- Phase 3: Re-datation --- */
function renderPhase3(lc) {
  var el = document.getElementById('lifecycle-content');
  var uploadDate = lc.attestationUploadDate ? new Date(lc.attestationUploadDate) : new Date();
  var moisNoms = ['janvier','f\u00e9vrier','mars','avril','mai','juin','juillet','ao\u00fbt','septembre','octobre','novembre','d\u00e9cembre'];
  var dateFr = uploadDate.getDate() + ' ' + moisNoms[uploadDate.getMonth()] + ' ' + uploadDate.getFullYear();

  el.innerHTML = '<div class="lifecycle-content">'
    + '<div class="lc-icon update"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg></div>'
    + '<h2>Mise \u00e0 jour de vos documents</h2>'
    + '<p>Les documents sont re-dat\u00e9s au <strong>' + dateFr + '</strong></p>'
    + '<div class="lc-progress">'
    + '  <div class="lc-progress-bar"><div class="lc-progress-fill" id="lc-progress-fill" style="width:0%"></div></div>'
    + '  <div class="lc-progress-label" id="lc-progress-label">Pr\u00e9paration...</div>'
    + '</div>'
    + '<button class="lc-link-btn" onclick="enterPhase(2)" style="margin-top:16px;background:none;border:none;color:#888;cursor:pointer;font-size:13px;text-decoration:underline;">Mauvais fichier ? R\u00e9importer l\u2019attestation</button>'
    + '</div>';

  // Update DATE_SIGNATURE and DATE_SIGNATURE_COURTE and regenerate
  var newDateSignature = uploadDate.getDate() + ' ' + moisNoms[uploadDate.getMonth()] + ' ' + uploadDate.getFullYear();
  var newDateSignatureCourte = ('0' + uploadDate.getDate()).slice(-2) + '/' + ('0' + (uploadDate.getMonth() + 1)).slice(-2) + '/' + uploadDate.getFullYear();
  lc.docsDateSignature = newDateSignature;
  lc.docsDateSignatureCourte = newDateSignatureCourte;
  saveLifecycle(lc);

  // Get docs with templates only
  var docs = _lcDocs.filter(function(d) { return d.template; });
  var total = docs.length;
  var done = 0;
  var progressFill = document.getElementById('lc-progress-fill');
  var progressLabel = document.getElementById('lc-progress-label');

  function regenerateNext() {
    if (done >= total) {
      progressLabel.textContent = 'Termin\u00e9 !';
      setTimeout(function() { enterPhase(4); }, 800);
      return;
    }
    var doc = docs[done];
    progressLabel.textContent = (done + 1) + '/' + total + ' \u2014 ' + doc.name.substring(0, 40) + '...';
    progressFill.style.width = Math.round(((done + 0.5) / total) * 100) + '%';

    // Trigger a lightweight fetch to warm the cache with new date
    var formData = collectFormDataForDocs();
    formData.DATE_SIGNATURE = newDateSignature;
    formData.DATE_SIGNATURE_COURTE = newDateSignatureCourte;

    fetch('/api/generate-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: doc.template, data: formData, preview: true })
    }).then(function() {
      done++;
      progressFill.style.width = Math.round((done / total) * 100) + '%';
      setTimeout(regenerateNext, 300);
    }).catch(function() {
      done++;
      setTimeout(regenerateNext, 300);
    });
  }
  regenerateNext();
}

/* --- Phase 4: Signature --- */
var _sigTrackingTimer = null;

function isCreatorAssocie() {
  if (!_currentUser || !_currentUser.email) return false;
  var panels = document.querySelectorAll('#associe-panels .associe-panel');
  var userEmail = _currentUser.email.trim().toLowerCase();
  for (var i = 0; i < panels.length; i++) {
    var data = extractAssocieData(panels[i]);
    if (data && data.email && data.email.trim().toLowerCase() === userEmail) return true;
  }
  return false;
}
window.isCreatorAssocie = isCreatorAssocie;

function renderPhase4(lc) {
  var el = document.getElementById('lifecycle-content');
  var panels = document.querySelectorAll('#associe-panels .associe-panel');
  var nbAssocies = panels.length;
  var creatorIsAssocie = isCreatorAssocie();

  // SAS/SASU/SELAS/SELASU \u2192 "actionnaire" instead of "associ\u00e9"
  var formeEl = document.getElementById('forme-juridique');
  var formeVal = (formeEl && formeEl.value ? formeEl.value : '').toUpperCase();
  var isActionnaire = /^(SAS|SASU|SELAS|SELASU)$/.test(formeVal);
  var lblAssoc = isActionnaire ? 'actionnaire' : 'associ\u00e9';
  var lblAssocPl = isActionnaire ? 'actionnaires' : 'associ\u00e9s';
  var lblCoAssocPl = isActionnaire ? 'co-actionnaires' : 'co-associ\u00e9s';

  // Count signataires (associ\u00e9s excluding creator-if-associ\u00e9)
  var nbAssocSigners = nbAssocies - (creatorIsAssocie ? 1 : 0);
  var extDirig0 = getExternalDirigeants();
  var nbDirigSigners = extDirig0.length;
  // Wording: singular vs plural for title
  var assocPart = nbAssocSigners > 1 ? ('des ' + lblAssocPl) : ('de l\u2019' + lblAssoc);
  var dirigPart = nbDirigSigners > 1 ? 'des dirigeants' : 'du dirigeant';
  var titleParts = [];
  if (nbAssocSigners > 0) titleParts.push(assocPart);
  if (nbDirigSigners > 0) titleParts.push(dirigPart);
  var titleSubject = titleParts.join(' et ') || ('de l\u2019' + lblAssoc);

  // Clear any existing polling timer
  if (_sigTrackingTimer) { clearInterval(_sigTrackingTimer); _sigTrackingTimer = null; }

  // Case 1: Creator IS an associe and hasn't signed yet -> sign on site
  if (creatorIsAssocie && !lc.creatorSigned) {
    el.innerHTML = '<div class="lifecycle-content lifecycle-content--compact lc-action-card">'
      + '<div class="lc-head">'
      + '  <div class="lc-icon lc-icon--sm sign"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></div>'
      + '  <div class="lc-head-text">'
      + '    <span class="lc-status-pill"><span class="lc-status-dot"></span>Action requise</span>'
      + '    <h2>Signez vos documents</h2>'
      + '    <p>En tant qu\u2019' + lblAssoc + ', vous signez en premier.</p>'
      + '  </div>'
      + '  <button class="lc-cta lc-cta--sm" onclick="openSignatureModal()">'
      + '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>'
      + '    Signer mes documents'
      + '  </button>'
      + '</div>'
      + '<div class="lc-secondary-link">'
      + '  <span onclick="resetAttestation()">Je me suis tromp\u00e9 sur l\u2019attestation de d\u00e9p\u00f4t ? <u>R\u00e9-importer</u></span>'
      + '</div>'
      + '</div>';
    return;
  }

  // Case 2: Creator signed + SASU (1 associe) -> auto-advance
  if (creatorIsAssocie && lc.creatorSigned && nbAssocies <= 1) {
    enterPhase(5);
    return;
  }

  // Case 3: Creator is NOT an associe OR creator signed + multi-associes -> send signatures to all
  var extDirig = extDirig0;

  // Description wording: singular if single signataire, plural otherwise
  var totalSigners = nbAssocSigners + nbDirigSigners;
  var descTxt;
  if (!creatorIsAssocie) {
    var demandeWord = totalSigners > 1 ? 'les demandes de signature' : 'la demande de signature';
    var cibleParts = [];
    if (nbAssocSigners > 0) cibleParts.push(nbAssocSigners > 1 ? ('\u00e0 chaque ' + lblAssoc) : ('\u00e0 l\u2019' + lblAssoc));
    if (nbDirigSigners > 0) cibleParts.push(nbDirigSigners > 1 ? '\u00e0 chaque dirigeant' : 'au dirigeant');
    descTxt = 'Envoyez ' + demandeWord + ' ' + cibleParts.join(' et ') + '.';
  } else {
    var coPart = nbAssocSigners > 1 ? ('vos ' + lblCoAssocPl) : ('votre co-' + lblAssoc);
    var dPart = nbDirigSigners > 1 ? 'dirigeants' : 'dirigeant';
    descTxt = 'Partagez les liens de signature avec ' + coPart + (nbDirigSigners ? ' et ' + dPart : '') + '.';
  }

  var html = '<div class="lifecycle-content lifecycle-content--compact lc-action-card">'
    + '<div class="lc-head">'
    + '  <div class="lc-icon lc-icon--sm sign"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></div>'
    + '  <div class="lc-head-text">'
    + '    <span class="lc-status-pill"><span class="lc-status-dot"></span>Action requise</span>'
    + '    <h2>Signature ' + titleSubject + '</h2>'
    + '    <p>' + descTxt + '</p>'
    + '  </div>';

  if (!lc.sigRequestsGenerated) {
    html += '  <button class="lc-cta lc-cta--sm" onclick="generateSignatureLinks()">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>'
      + ' Envoyer'
      + '</button>';
  }
  html += '</div>';

  if (lc.sigRequestsGenerated) {
    html += '<div id="sig-tracking-container"><div class="spinner" style="margin:20px auto;"></div></div>';
  }

  html += '<div class="lc-secondary-link">'
    + '  <span onclick="resetAttestation()">Je me suis tromp\u00e9 sur l\u2019attestation de d\u00e9p\u00f4t ? <u>R\u00e9-importer</u></span>'
    + '</div>';

  html += '</div>';
  el.innerHTML = html;

  if (lc.sigRequestsGenerated) {
    loadSignatureTracking();
    _sigTrackingTimer = setInterval(loadSignatureTracking, 15000);
  }
}

function getExternalDirigeants() {
  var dirigeants = [];
  var dirPanels = document.querySelectorAll('#dirigeant-panels .associe-panel');
  dirPanels.forEach(function(p, i) {
    var select = p.querySelector('.dirigeant-panel-select');
    if (!select || select.value !== 'autre') return; // skip if linked to an associe
    var activeType = p.querySelector('.dirigeant-type-panel.active');
    if (!activeType || activeType.dataset.type !== 'physique') return; // personne morale can't sign
    var prenomI = p.querySelector('input[data-field="dir-prenom"]');
    var nomI = p.querySelector('input[data-field="dir-nom"]');
    var emailI = p.querySelector('input[data-field="dir-email"]');
    var prenom = prenomI ? prenomI.value.trim() : '';
    var nom = nomI ? nomI.value.trim() : '';
    var email = emailI ? emailI.value.trim() : '';
    if (!prenom && !nom) return;
    var badge = p.querySelector('.dirigeant-badge');
    var role = badge ? badge.textContent.trim() : 'Dirigeant';
    dirigeants.push({ name: (prenom + ' ' + nom).trim(), email: email, role: role });
  });
  return dirigeants;
}
window.getExternalDirigeants = getExternalDirigeants;

function generateSignatureLinks() {
  if (!_currentFormaliteId) { if (typeof showToast === 'function') showToast('Formalit\u00e9 non sauvegard\u00e9e'); else alert('Formalit\u00e9 non sauvegard\u00e9e.'); return; }
  var panels = document.querySelectorAll('#associe-panels .associe-panel');
  var signataires = [];
  var creatorIsAssocie = isCreatorAssocie();
  var userEmail = _currentUser ? _currentUser.email.trim().toLowerCase() : '';
  // SAS/SASU/SELAS/SELASU \u2192 "actionnaire"
  var formeEl = document.getElementById('forme-juridique');
  var formeVal = (formeEl && formeEl.value ? formeEl.value : '').toUpperCase();
  var isActionnaire = /^(SAS|SASU|SELAS|SELASU)$/.test(formeVal);
  var roleLbl = isActionnaire ? 'Actionnaire' : 'Associ\u00e9';
  // Associes
  panels.forEach(function(p, i) {
    var data = extractAssocieData(p);
    if (!data) return;
    if (creatorIsAssocie && data.email && data.email.trim().toLowerCase() === userEmail) return;
    signataires.push({ name: (data.prenom + ' ' + data.nom).trim() || (roleLbl + ' ' + (i + 1)), email: data.email || '', role: roleLbl });
  });
  // Dirigeants non-associes
  var extDirigeants = getExternalDirigeants();
  extDirigeants.forEach(function(d) {
    var dominated = signataires.some(function(s) { return d.email && s.email && s.email.toLowerCase() === d.email.toLowerCase(); });
    if (!dominated) signataires.push(d);
  });
  if (signataires.length === 0) { if (typeof showToast === 'function') showToast('Aucun signataire trouv\u00e9'); else alert('Aucun signataire trouv\u00e9.'); return; }
  var associes = signataires;

  fetch('/api/formalites/' + _currentFormaliteId + '/signature-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ associes: associes })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.error) throw new Error(data.error);
    var lc = loadLifecycle();
    lc.sigRequestsGenerated = true;
    saveLifecycle(lc);
    renderPhase4(lc);
  })
  .catch(function(e) { if (typeof showToast === 'function') showToast('Erreur : ' + e.message); else alert('Erreur: ' + e.message); });
}
window.generateSignatureLinks = generateSignatureLinks;

function loadSignatureTracking() {
  if (!_currentFormaliteId) return;
  fetch('/api/formalites/' + _currentFormaliteId + '/signature-requests')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) return;
      var requests = data.requests || [];
      var container = document.getElementById('sig-tracking-container');
      if (!container) return;

      // Check if all signed -> auto-advance
      var allSigned = requests.length > 0 && requests.every(function(r) { return r.status === 'signed'; });
      if (allSigned) {
        if (_sigTrackingTimer) { clearInterval(_sigTrackingTimer); _sigTrackingTimer = null; }
        enterPhase(5);
        return;
      }

      var formeEl2 = document.getElementById('forme-juridique');
      var formeVal2 = (formeEl2 && formeEl2.value ? formeEl2.value : '').toUpperCase();
      var isActionnaire2 = /^(SAS|SASU|SELAS|SELASU)$/.test(formeVal2);

      var html = '<table class="sig-tracking-table"><thead><tr>'
        + '<th>Signataire</th><th>R\u00f4le</th><th>Statut</th><th>Consult\u00e9</th><th>Sign\u00e9</th><th>Action</th>'
        + '</tr></thead><tbody>';
      for (var i = 0; i < requests.length; i++) {
        var r = requests[i];
        var badgeClass = r.status;
        var badgeLabel = r.status === 'pending' ? 'En attente' : (r.status === 'opened' ? 'Consult\u00e9' : 'Sign\u00e9');
        var signUrl = window.location.origin + '/api/sign/' + r.token;
        var roleLabel = r.role || 'Associ\u00e9';
        if (isActionnaire2 && roleLabel === 'Associ\u00e9') roleLabel = 'Actionnaire';
        html += '<tr>'
          + '<td><strong>' + escapeHtmlText(r.associe_name) + '</strong></td>'
          + '<td style="font-size:12px;color:#888;">' + escapeHtmlText(roleLabel) + '</td>'
          + '<td><span class="sig-badge ' + badgeClass + '">' + badgeLabel + '</span></td>'
          + '<td>' + (r.opened_at ? formatDateShort(r.opened_at) : '<span class="sig-empty">\u00b7</span>') + '</td>'
          + '<td>' + (r.signed_at ? formatDateShort(r.signed_at) : '<span class="sig-empty">\u00b7</span>') + '</td>'
          + '<td><div class="sig-actions">';
        if (r.status !== 'signed') {
          html += '<button class="sig-sign-btn" onclick="window.open(\'' + signUrl + '\', \'_blank\')">Signer</button>'
            + '<button class="sig-copy-btn" onclick="copySignLink(\'' + signUrl + '\')" title="Copier le lien"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Lien</button>';
        } else {
          html += '<button class="sig-copy-btn" onclick="copySignLink(\'' + signUrl + '\')" title="Copier le lien"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Lien</button>';
        }
        if (r.status === 'opened') {
          html += '<button class="sig-relance-btn" onclick="copySignLink(\'' + signUrl + '\')" title="Relancer le signataire"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Relancer</button>';
        }
        html += '</div></td></tr>';
      }
      html += '</tbody></table>';
      container.innerHTML = html;
    })
    .catch(function() {});
}
window.loadSignatureTracking = loadSignatureTracking;

function copySignLink(url) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(function() {
      showToast('Lien copi\u00e9 dans le presse-papier');
    });
  } else {
    var ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Lien copi\u00e9 dans le presse-papier');
  }
}
window.copySignLink = copySignLink;

function showToast(msg) {
  var t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#1d1d1f;color:#fff;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;opacity:0;transition:opacity 0.3s;';
  document.body.appendChild(t);
  requestAnimationFrame(function() { t.style.opacity = '1'; });
  setTimeout(function() { t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 300); }, 2000);
}
window.showToast = showToast;

function escapeHtmlText(str) {
  var d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
window.escapeHtmlText = escapeHtmlText;

function formatDateShort(isoStr) {
  if (!isoStr) return '';
  var d = new Date(isoStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
window.formatDateShort = formatDateShort;

/* --- Phase 5: Immatriculation --- */
function renderPhase5(lc) {
  var el = document.getElementById('lifecycle-content');
  var hasKbis = !!lc.kbisFileName;

  var html = '<div class="lifecycle-content">';

  if (hasKbis) {
    html += '<div style="text-align:center;padding:20px 0;">'
      + '<div style="width:72px;height:72px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;"><svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="36" height="36"><polyline points="20 6 9 17 4 12"/></svg></div>'
      + '<h2 style="font-size:22px;font-weight:700;margin-bottom:6px;">Votre soci\u00e9t\u00e9 est immatricul\u00e9e !</h2>'
      + '<p style="color:#86868b;font-size:14px;">Votre extrait KBIS est disponible dans vos documents ci-dessous.</p>'
      + '</div>';
  } else {
    html += '<div style="text-align:center;margin-bottom:28px;">'
      + '<div style="width:64px;height:64px;background:#eff6ff;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;"><svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="28" height="28"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>'
      + '<h2 style="font-size:22px;font-weight:700;margin-bottom:6px;">Dossier pris en charge</h2>'
      + '<p style="color:#86868b;font-size:14px;max-width:380px;margin:0 auto;line-height:1.5;">Notre avocat partenaire v\u00e9rifie vos documents et se charge du d\u00e9p\u00f4t au greffe.</p>'
      + '</div>';

    // Steps
    var steps = [
      { label: 'V\u00e9rification avocat', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>', active: true },
      { label: 'D\u00e9p\u00f4t au greffe', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
      { label: 'Traitement greffe', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
      { label: 'KBIS d\u00e9livr\u00e9', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>' }
    ];

    html += '<div style="display:flex;justify-content:center;gap:8px;max-width:480px;margin:0 auto 24px;">';
    for (var si = 0; si < steps.length; si++) {
      var s = steps[si];
      var bg = s.active ? '#1d1d1f' : '#f5f5f7';
      var color = s.active ? '#fff' : '#999';
      var border = s.active ? 'none' : '1px solid #e5e5e7';
      html += '<div style="flex:1;background:' + bg + ';border:' + border + ';border-radius:12px;padding:14px 8px;text-align:center;">'
        + '<div style="color:' + color + ';margin-bottom:6px;display:flex;justify-content:center;">' + s.icon + '</div>'
        + '<div style="font-size:11px;font-weight:600;color:' + color + ';line-height:1.3;">' + s.label + '</div>'
        + '</div>';
    }
    html += '</div>';

    html += '<div style="background:#f5f5f7;border-radius:12px;padding:16px 20px;max-width:420px;margin:0 auto;display:flex;gap:12px;align-items:center;">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
      + '<div style="font-size:13px;color:#666;line-height:1.5;">Votre KBIS sera ajout\u00e9 ici par l\u2019avocat d\u00e8s r\u00e9ception. Rien \u00e0 faire de votre c\u00f4t\u00e9.</div>'
      + '</div>';
  }

  html += '</div>';
  el.innerHTML = html;
}

function uploadKbis(file) {
  var formData = new FormData();
  formData.append('file', file);
  var dropzone = document.getElementById('kbis-dropzone');
  dropzone.innerHTML = '<div class="spinner"></div><p>Upload en cours...</p>';

  fetch('/api/upload', { method: 'POST', body: formData })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error(data.error);
      var lc = loadLifecycle();
      lc.kbisFileName = data.filename;
      saveLifecycle(lc);
      enterPhase(5); // re-render
    })
    .catch(function(e) {
      if (typeof showToast === 'function') showToast('Erreur : ' + e.message); else alert('Erreur: ' + e.message);
      renderPhase5(loadLifecycle());
    });
}
window.uploadKbis = uploadKbis;

/* --- Phase 5 Business: Avocat review workflow --- */
var _businessPollTimer = null;
var _businessSSE = null;

function renderPhase5Business(lc) {
  var el = document.getElementById('lifecycle-content');
  var svgCheck = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var svgCircle = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';
  var svgCurrent = '<span class="dot-current"></span>';

  // Determine current sub-phase from server
  var subPhase = lc.businessSubPhase || '5a';

  var steps = [
    { key: '5a', label: 'Dossier transmis \u00e0 notre \u00e9quipe' },
    { key: '5b', label: 'Avocat assign\u00e9, r\u00e9vision en cours' },
    { key: '5c', label: 'Dossier v\u00e9rifi\u00e9' },
    { key: '5d', label: 'D\u00e9p\u00f4t au guichet unique en cours' },
    { key: '5e', label: 'KBIS d\u00e9livr\u00e9' }
  ];

  var subPhaseOrder = ['5a','5b','5c','5d','5e'];
  var currentIdx = subPhaseOrder.indexOf(subPhase);

  var html = '<div class="lifecycle-content">'
    + '<div class="lc-icon" style="background:#f3e8ff;"><svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>'
    + '<h2>Votre dossier est pris en charge</h2>'
    + '<p>Un avocat sp\u00e9cialis\u00e9 s\u2019occupe de v\u00e9rifier et d\u00e9poser votre dossier.</p>'
    + '<div class="lc-timeline" style="margin-top:24px;">';

  steps.forEach(function(step, i) {
    var isDone = i < currentIdx;
    var isCurrent = i === currentIdx;
    var icon = isDone ? svgCheck : (isCurrent ? svgCurrent : svgCircle);
    var dotClass = isDone ? 'done' : (isCurrent ? 'active' : 'pending');
    var itemClass = isDone ? ' done' : (isCurrent ? ' active' : '');
    var extraBadge = '';
    if (step.key === '5c' && isDone && currentIdx >= 2) {
      extraBadge = ' <span style="background:#ecfdf5;color:#047857;font-size:11px;padding:2px 8px;border-radius:5px;font-weight:600;margin-left:8px;">V\u00e9rifi\u00e9</span>';
    }
    html += '<div class="lc-timeline-item' + itemClass + '"><div class="lc-timeline-dot ' + dotClass + '">' + icon + '</div><div class="lc-timeline-text">' + step.label + extraBadge + '</div></div>';
  });

  html += '</div>';

  // Chat panel if sub-phase >= 5b
  if (currentIdx >= 1) {
    html += '<div style="margin-top:32px;" id="business-chat-section">'
      + '<h3 style="font-family:Cal Sans,Inter,sans-serif;font-size:16px;margin-bottom:16px;">Messagerie avec votre avocat</h3>'
      + '<div style="background:#fff;border-radius:14px;border:1px solid #e5e5e5;display:flex;flex-direction:column;height:350px;">'
      + '<div id="business-chat-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;"></div>'
      + '<div style="display:flex;gap:12px;padding:12px 16px;border-top:1px solid #e5e5e5;">'
      + '<input type="text" id="business-chat-input" placeholder="\u00c9crivez un message..." style="flex:1;padding:10px 14px;border:1px solid #e0e0e0;border-radius:8px;font-family:inherit;font-size:14px;outline:none;" onkeydown="if(event.key===\'Enter\')sendBusinessMessage()">'
      + '<button onclick="sendBusinessMessage()" style="padding:10px 20px;background:#111;color:#fff;border:none;border-radius:8px;font-family:inherit;font-size:14px;cursor:pointer;">Envoyer</button>'
      + '</div></div></div>';
  }

  html += '</div>';
  el.innerHTML = html;

  // Load chat messages if applicable
  if (currentIdx >= 1 && _currentFormaliteId) {
    loadBusinessChat();
    startBusinessSSE();
  }

  // Start polling for sub-phase changes
  startBusinessPolling();
}

function loadBusinessChat() {
  if (!_currentFormaliteId) return;
  fetch('/api/messages?formalite_id=' + _currentFormaliteId).then(function(r) { return r.json(); }).then(function(data) {
    renderBusinessMessages(data.messages || []);
  });
}
window.loadBusinessChat = loadBusinessChat;

function renderBusinessMessages(messages) {
  var container = document.getElementById('business-chat-messages');
  if (!container) return;
  if (messages.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#888;padding:24px;">Aucun message. Votre avocat vous contactera ici.</div>';
    return;
  }
  var mois = ['janv.','f\u00e9vr.','mars','avr.','mai','juin','juil.','ao\u00fbt','sept.','oct.','nov.','d\u00e9c.'];
  container.innerHTML = messages.map(function(m) {
    var isMine = _currentUser && m.sender_id === _currentUser.id;
    var date = new Date(m.created_at);
    var time = date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');
    return '<div style="max-width:75%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;'
      + (isMine ? 'align-self:flex-end;background:#111;color:#fff;border-bottom-right-radius:4px;' : 'align-self:flex-start;background:#f5f5f5;color:#111;border-bottom-left-radius:4px;') + '">'
      + '<div style="font-size:11px;font-weight:600;opacity:0.7;margin-bottom:3px;">' + escapeHtmlSafe(m.sender_name) + '</div>'
      + '<div>' + escapeHtmlSafe(m.content) + '</div>'
      + '<div style="font-size:11px;opacity:0.5;margin-top:3px;">' + time + '</div>'
      + '</div>';
  }).join('');
  container.scrollTop = container.scrollHeight;
}

function escapeHtmlSafe(str) {
  var d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
window.escapeHtmlSafe = escapeHtmlSafe;

function sendBusinessMessage() {
  var input = document.getElementById('business-chat-input');
  if (!input) return;
  var content = input.value.trim();
  if (!content || !_currentFormaliteId) return;
  input.value = '';
  fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formalite_id: _currentFormaliteId, content: content })
  });
}
window.sendBusinessMessage = sendBusinessMessage;

function startBusinessSSE() {
  if (_businessSSE) _businessSSE.close();
  if (!_currentFormaliteId) return;
  _businessSSE = new EventSource('/api/messages/stream?formalite_id=' + _currentFormaliteId);
  _businessSSE.onmessage = function(e) {
    try {
      var msg = JSON.parse(e.data);
      var container = document.getElementById('business-chat-messages');
      if (!container) return;
      var emptyState = container.querySelector('div[style*="text-align:center"]');
      if (emptyState) emptyState.remove();
      var isMine = _currentUser && msg.sender_id === _currentUser.id;
      var date = new Date(msg.created_at);
      var time = date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');
      var div = document.createElement('div');
      div.style.cssText = 'max-width:75%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;'
        + (isMine ? 'align-self:flex-end;background:#111;color:#fff;border-bottom-right-radius:4px;' : 'align-self:flex-start;background:#f5f5f5;color:#111;border-bottom-left-radius:4px;');
      div.innerHTML = '<div style="font-size:11px;font-weight:600;opacity:0.7;margin-bottom:3px;">' + escapeHtmlSafe(msg.sender_name) + '</div>'
        + '<div>' + escapeHtmlSafe(msg.content) + '</div>'
        + '<div style="font-size:11px;opacity:0.5;margin-top:3px;">' + time + '</div>';
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    } catch(err) {}
  };
}

function startBusinessPolling() {
  if (_businessPollTimer) clearInterval(_businessPollTimer);
  if (!_currentFormaliteId) return;
  _businessPollTimer = setInterval(function() {
    fetch('/api/formalites/' + _currentFormaliteId).then(function(r) { return r.json(); }).then(function(data) {
      if (!data.formalite) return;
      var serverSP = data.formalite.business_sub_phase;
      var lc = loadLifecycle();
      if (serverSP && serverSP !== lc.businessSubPhase) {
        lc.businessSubPhase = serverSP;
        saveLifecycle(lc);
        // Check if we should move to phase 6 (immatriculation complete)
        if (serverSP === '5e') {
          enterPhase(6);
        } else {
          renderPhase5Business(lc);
          renderLifecycleStepper(lc);
        }
      }
    }).catch(function() {});
  }, 30000);
}

/* --- Phase 6 Business: KBIS delivered --- */
function renderPhase6Business(lc) {
  if (_businessPollTimer) clearInterval(_businessPollTimer);
  if (_businessSSE) { _businessSSE.close(); _businessSSE = null; }

  var el = document.getElementById('lifecycle-content');
  el.innerHTML = '<div class="lifecycle-content">'
    + '<div class="lc-icon" style="background:#dcfce7;"><svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>'
    + '<h2>F\u00e9licitations, votre soci\u00e9t\u00e9 est immatricul\u00e9e !</h2>'
    + '<p>Votre KBIS a \u00e9t\u00e9 transmis par votre avocat. Vous pouvez le t\u00e9l\u00e9charger dans vos documents.</p>'
    + '<div style="margin-top:24px;padding:20px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;text-align:center;">'
    + '<div style="font-size:14px;color:#16a34a;font-weight:500;">Dossier termin\u00e9 avec succ\u00e8s</div>'
    + '</div></div>';

  // Update server status
  if (_currentFormaliteId) {
    fetch('/api/formalites/' + _currentFormaliteId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'terminee', phase: 6 })
    }).catch(function() {});
  }
}

/* --- Doc Space: render docs list with phase-aware badges --- */
function renderDocSpace(lc) {
  var svgEye = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var svgDown = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  var svgUp   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
  var svgLockBig = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';

  var container = document.getElementById('gen-docs-list');
  container.innerHTML = '';

  function makeSection(label, sub) {
    var s = document.createElement('div');
    s.className = 'gen-doc-section';
    s.innerHTML = '<div class="gen-doc-section-head"><div class="gen-doc-section-label">' + label + '</div>' + (sub ? '<div class="gen-doc-section-sub">' + sub + '</div>' : '') + '</div>';
    return s;
  }
  function addSection(node) { container.appendChild(node); }

  // \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // SECTION 1 : DOCUMENTS G\u00c9N\u00c9R\u00c9S (statuts, PV, etc.)
  // \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var generatedDocs = _lcDocs.filter(function(d){ return d.special !== 'annonce'; });
  if (generatedDocs.length > 0) {
    addSection(makeSection('Documents g\u00e9n\u00e9r\u00e9s', 'Statuts, PV et attestations pr\u00e9par\u00e9s automatiquement'));
  }

  generatedDocs.forEach(function(doc, i) {
    var card = document.createElement('div');
    card.className = 'gen-doc-card';
    if (doc.special === 'annonce') card.className += ' pending';
    card.style.opacity = '0';
    card.style.transform = 'translateY(10px)';

    var safeName = doc.name.replace(/[^a-zA-Z0-9\u00C0-\u024F \-']/g, '') + '.docx';
    var safeNameEsc = safeName.replace(/'/g, "\\'");

    // Determine badge
    var badgeClass = 'gen-doc-badge';
    var badgeText = '';
    var isSigned = lc.signedDocs && lc.signedDocs.indexOf(doc.template) >= 0;
    var svgLock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

    if (doc.special === 'annonce') {
      badgeClass += ' locked';
      badgeText = svgLock + ' En attente';
    } else if (!doc.template) {
      badgeClass += ' locked';
      badgeText = 'Verrouill\u00e9';
    } else if (isSigned) {
      badgeClass += ' signed';
      badgeText = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg> Sign\u00e9';
    } else {
      badgeClass += ' ready';
      badgeText = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg> Pr\u00eat';
    }

    var downloadAttr = '';
    var previewAttr = '';

    if (doc.template && (doc.conjointData || doc.dirigeantData)) {
      // Conjoint doc OR per-dirigeant DNC : pass doc index to resolve extra data from _lcDocs
      downloadAttr = ' onclick="event.stopPropagation(); downloadDoc(\'' + doc.template + '\', \'' + safeNameEsc + '\', ' + i + ')"';
      previewAttr = ' onclick="event.stopPropagation(); previewDoc(\'' + doc.template + '\', \'' + safeNameEsc + '\', ' + i + ')"';
    } else if (doc.template) {
      downloadAttr = ' onclick="event.stopPropagation(); downloadDoc(\'' + doc.template + '\', \'' + safeNameEsc + '\')"';
      previewAttr = ' onclick="event.stopPropagation(); previewDoc(\'' + doc.template + '\', \'' + safeNameEsc + '\')"';
    } else {
      downloadAttr = ' disabled';
      previewAttr = ' disabled';
    }

    card.innerHTML = '<div class="gen-doc-icon ' + doc.type + '">' + doc.icon + '</div>'
      + '<div class="gen-doc-info">'
      + '  <div class="gen-doc-name">' + doc.name + '</div>'
      + '  <div class="gen-doc-meta">' + doc.desc + '</div>'
      + '</div>'
      + '<div class="' + badgeClass + '">' + badgeText + '</div>'
      + '<div class="gen-doc-actions">'
      + '  <button class="gen-doc-btn"' + previewAttr + '>' + svgEye + ' Visualiser</button>'
      + '  <button class="gen-doc-btn primary"' + downloadAttr + '>' + svgDown + ' T\u00e9l\u00e9charger</button>'
      + '</div>';

    container.appendChild(card);

    setTimeout(function() {
      card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 60 * i);
  });

  // ─────────────────────────────────────────
  // SECTION 2 : ANNONCE LÉGALE (séparée car publiée par avocat)
  // ─────────────────────────────────────────
  var annonceDoc = _lcDocs.find(function(d){ return d.special === 'annonce'; });
  if (annonceDoc) {
    addSection(makeSection('Annonce légale', 'Publiée par un avocat dans un journal habilité'));
    var aCard = document.createElement('div');
    aCard.className = 'gen-doc-card pending';
    var svgLock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
    // "Publiée" uniquement si un fichier d'annonce a été réellement uploadé par l'avocat.
    var aReady = !!lc.annonceLegaleFileName;
    var aBadge = aReady ? '<div class="gen-doc-badge ready"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg> Publiée</div>'
                       : '<div class="gen-doc-badge locked">' + svgLock + ' En attente</div>';
    aCard.innerHTML = '<div class="gen-doc-icon ' + annonceDoc.type + '">' + annonceDoc.icon + '</div>'
      + '<div class="gen-doc-info">'
      + '  <div class="gen-doc-name">' + annonceDoc.name + '</div>'
      + '  <div class="gen-doc-meta">' + annonceDoc.desc + '</div>'
      + '</div>'
      + aBadge
      + '<div class="gen-doc-actions">'
      + '  <button class="gen-doc-btn"' + (aReady ? '' : ' disabled') + '>' + svgEye + ' Visualiser</button>'
      + '  <button class="gen-doc-btn primary"' + (aReady ? '' : ' disabled') + '>' + svgDown + ' Télécharger</button>'
      + '</div>';
    container.appendChild(aCard);
  }

  // ─────────────────────────────────────────
  // SECTION 3 : DOCUMENTS FOURNIS PAR LE CLIENT (avec statut vérif)
  // ─────────────────────────────────────────
  var clientDocsConfig = [
    { key: 'attestation', name: 'Attestation de dépôt de capital', filenameField: 'attestationFileName', originalField: 'attestationOriginalName', statusField: 'attestationStatus', rejectField: 'attestationRejectReason' },
    { key: 'id-dirigeant', name: 'Pièce d\'identité du dirigeant', filenameField: 'doc_id-dirigeant_fileName', originalField: 'doc_id-dirigeant_originalName', statusField: 'doc_id-dirigeant_status', rejectField: 'doc_id-dirigeant_rejectReason' },
    { key: 'siege', name: 'Justificatif de siège social', filenameField: 'doc_siege_fileName', originalField: 'doc_siege_originalName', statusField: 'doc_siege_status', rejectField: 'doc_siege_rejectReason' }
  ];
  var hasClientDocs = clientDocsConfig.some(function(c){ return lc[c.filenameField]; });
  if (hasClientDocs) {
    addSection(makeSection('Documents fournis par vous', 'Pièces à vérifier par notre équipe avant validation'));
    var svgUploadDoc = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    clientDocsConfig.forEach(function(cd){
      var fname = lc[cd.filenameField];
      if (!fname) return;
      var status = lc[cd.statusField] || 'pending';
      var rejectReason = lc[cd.rejectField] || '';
      var card = document.createElement('div');
      card.className = 'gen-doc-card';
      var badge = '';
      var actions = '';
      if (status === 'validated' || status === 'verified') {
        badge = '<div class="gen-doc-badge signed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg> Validé</div>';
        actions = '<button class="gen-doc-btn" onclick="window.open(\'/api/file?path=' + fname + '\', \'_blank\')">' + svgEye + ' Visualiser</button>';
      } else if (status === 'rejected') {
        badge = '<div class="gen-doc-badge rejected" style="background:#fef2f2;color:#b91c1c;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> À refaire</div>';
        actions = '<button class="gen-doc-btn" onclick="window.open(\'/api/file?path=' + fname + '\', \'_blank\')">' + svgEye + ' Visualiser</button>'
                + '<button class="gen-doc-btn primary" onclick="reuploadClientDoc(\'' + cd.key + '\')" style="margin-left:6px;">' + svgUp + ' Renvoyer</button>';
      } else {
        badge = '<div class="gen-doc-badge" style="background:#fef3c7;color:#b45309;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> En vérification</div>';
        actions = '<button class="gen-doc-btn" onclick="window.open(\'/api/file?path=' + fname + '\', \'_blank\')">' + svgEye + ' Visualiser</button>';
      }
      card.innerHTML = '<div class="gen-doc-icon doc">' + svgUploadDoc + '</div>'
        + '<div class="gen-doc-info"><div class="gen-doc-name">' + cd.name + '</div>'
        + '<div class="gen-doc-meta"><span>' + (lc[cd.originalField] || fname) + '</span>'
        + (rejectReason && status === 'rejected' ? ' · <span style="color:#b91c1c;">Motif : ' + rejectReason + '</span>' : '')
        + '</div></div>'
        + badge
        + '<div class="gen-doc-actions">' + actions + '</div>';
      container.appendChild(card);
    });
  }

  // ─────────────────────────────────────────
  // SECTION 4 : KBIS & RBE (verrouillé, uploadé par l'avocat)
  // ─────────────────────────────────────────
  var finalDocs = [
    { key: 'kbis', name: 'Extrait KBIS', desc: 'Délivré par le greffe après immatriculation', filenameField: 'kbisFileName' },
    { key: 'rbe',  name: 'Registre des bénéficiaires effectifs (RBE)', desc: 'Déclaration des bénéficiaires effectifs', filenameField: 'rbeFileName' }
  ];
  addSection(makeSection('KBIS & RBE', 'Documents officiels déposés par votre avocat une fois la société immatriculée'));
  finalDocs.forEach(function(fd){
    var fname = lc[fd.filenameField];
    var card = document.createElement('div');
    card.className = 'gen-doc-card' + (fname ? '' : ' pending');
    if (fname) {
      card.innerHTML = '<div class="gen-doc-icon pdf">' + svgLockBig + '</div>'
        + '<div class="gen-doc-info"><div class="gen-doc-name">' + fd.name + '</div>'
        + '<div class="gen-doc-meta"><span>Déposé par votre avocat</span></div></div>'
        + '<div class="gen-doc-badge signed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg> Disponible</div>'
        + '<div class="gen-doc-actions">'
        + '<button class="gen-doc-btn" onclick="window.open(\'/api/file?path=' + fname + '\', \'_blank\')">' + svgEye + ' Visualiser</button>'
        + '<button class="gen-doc-btn primary" onclick="window.open(\'/api/file?path=' + fname + '&download=' + encodeURIComponent(fd.name + '.pdf') + '\', \'_blank\')" style="margin-left:6px;">' + svgDown + ' Télécharger</button>'
        + '</div>';
    } else {
      card.innerHTML = '<div class="gen-doc-icon" style="background:#f3f4f6;color:#888;">' + svgLockBig + '</div>'
        + '<div class="gen-doc-info"><div class="gen-doc-name" style="color:#888;">' + fd.name + '</div>'
        + '<div class="gen-doc-meta"><span>' + fd.desc + '</span></div></div>'
        + '<div class="gen-doc-badge locked"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg> Verrouillé</div>'
        + '<div class="gen-doc-actions"><span style="font-size:12.5px;color:#aaa;">Disponible après immatriculation</span></div>';
    }
    container.appendChild(card);
  });

  // Lien vers l'espace documents — uniquement quand la formalité est finalisée (KBIS dispo)
  if (lc.kbisFileName) {
    var linkBlock = document.createElement('div');
    linkBlock.className = 'gen-doc-link-block';
    linkBlock.innerHTML = '<a href="/documents.html" class="gen-doc-link">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>'
      + '<span>Votre société est créée — Accéder à l\'espace <strong>Documents</strong> de votre société</span>'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="margin-left:auto;"><polyline points="9 18 15 12 9 6"/></svg>'
      + '</a>';
    container.appendChild(linkBlock);
  }

  // Restaure les badges "Modifié" si on a déjà chargé les entrées d'audit
  // (le polling re-render peut effacer les badges injectés → on les ré-applique ici)
  if (window._lastReviewChanges && window._lastReviewChanges.length) {
    setTimeout(function() {
      if (typeof markDocsAsModified === 'function') {
        markDocsAsModified(window._lastReviewChanges);
      }
    }, 0);
  }
}
window.renderDocSpace = renderDocSpace;

// ─────────────────────────────────────────
// Badge "Modifié" injecté après une mise à jour avocat sur les docs générés
// ─────────────────────────────────────────
// Dictionnaire des labels lisibles pour les champs courants
var _FIELD_LABELS = {
  NOM_SOCIETE: 'Nom de la société',
  NOM_SOCIETE_COMPLET: 'Nom complet',
  FORME_JURIDIQUE: 'Forme juridique',
  forme_label: 'Forme juridique',
  CAPITAL: 'Capital social',
  CAPITAL_LETTRES: 'Capital (en lettres)',
  VALEUR_NOMINALE: 'Valeur nominale',
  NB_PARTS: 'Nombre de parts',
  ADRESSE_SIEGE: 'Adresse du siège',
  VILLE_SOCIETE: 'Ville',
  RCS_VILLE: 'Ville du RCS',
  NOM_BANQUE: 'Banque',
  ADRESSE_BANQUE: 'Adresse banque',
  DATE_DEBUT_ACTIVITE: 'Date de début d\'activité',
  DATE_DEBUT_EXERCICE: 'Date de début d\'exercice',
  DATE_CLOTURE: 'Date de clôture',
  DATE_SIGNATURE: 'Date de signature',
  VILLE_SIGNATURE: 'Ville de signature',
  ANNEE_PREMIER_EXERCICE: 'Année premier exercice',
  DUREE: 'Durée de vie',
  OBJET_SOCIAL: 'Objet social',
  STATUT_OCCUPATION: 'Statut d\'occupation',
  PRESIDENT_NOM: 'Président',
  CIVILITE_NOM_PRENOM: 'Dirigeant',
  ADRESSE_DIRIGEANT: 'Adresse du dirigeant',
  DATE_NAISSANCE: 'Date de naissance',
  LIEU_NAISSANCE: 'Lieu de naissance',
  NATIONALITE: 'Nationalité',
  SITUATION_MATRIMONIALE: 'Situation matrimoniale',
  REGIME_MATRIMONIAL: 'Régime matrimonial',
  CONJOINT_NOM: 'Conjoint',
  selectedOffer: 'Offre sélectionnée',
};

function _humanizeFieldName(key) {
  if (!key) return '';
  if (_FIELD_LABELS[key]) return _FIELD_LABELS[key];
  // Capture les patterns indexés : OBJET_SOCIAL_3 → "Objet social (3)"
  var idxMatch = key.match(/^(.+)_(\d+)$/);
  if (idxMatch && _FIELD_LABELS[idxMatch[1]]) {
    return _FIELD_LABELS[idxMatch[1]] + ' · ' + idxMatch[2];
  }
  // Fallback : convertit en "Forme juridique" depuis FORME_JURIDIQUE
  return String(key).split('_').filter(function(w){ return w; }).map(function(w, i){
    var lw = w.toLowerCase();
    return i === 0 ? lw.charAt(0).toUpperCase() + lw.slice(1) : lw;
  }).join(' ');
}

// Filtre les entrées d'audit pour n'afficher que les changements pertinents
// (cache les snapshots bruts, dérivés calculés, flags techniques)
function _filterRelevantChanges(entries) {
  if (!entries) return [];
  // Champs internes/dérivés à masquer (préfixes ou exacts)
  var hideExact = new Set([
    'EST_HOMME', 'EST_FEMME', 'EST_PERSONNE_PHYSIQUE', 'EST_PERSONNE_MORALE',
    'BANQUE_SHINE', 'BANQUE_REVOLUT', 'BANQUE_QONTO', 'BANQUE_AUTRE',
    'NOM_SOCIETE_COMPLET', 'NB_PARTS_LETTRES', 'VALEUR_NOMINALE_LETTRES',
    'CAPITAL_LETTRES', 'DATE_SIGNATURE', 'DATE_SIGNATURE_COURTE',
    'NOM_JEUNE_FILLE', 'forme_label', 'RCS_VILLE', 'VILLE_SIGNATURE',
    'REMUNERATION_DG', 'REMUNERATION_CO_GERANT',
    'STATUT_OCCUPATION', 'DATE_DEBUT_EXERCICE',
    'GERANT_CIVILITE_NOM_PRENOM', 'GERANT_DATE_NAISSANCE', 'GERANT_LIEU_NAISSANCE',
    'GERANT_NATIONALITE', 'GERANT_SITUATION_MATRIMONIALE', 'GERANT_ADRESSE',
    'GERANT_EST_HOMME', 'GERANT_EST_FEMME',
    // Champs agrégés (arrays JSON) — on voit déjà les changements individuels via les champs _N
    'ASSOCIES', 'ACTIONNAIRES', 'DIRIGEANTS', 'DG_LIST',
    'NB_ASSOCIES', 'NB_ACTIONNAIRES', 'NB_DIRIGEANTS', 'DG_COUNT',
    'VALEUR_NOMINALE_UNITE', 'MONTANT', 'LIBERATION_PCT_1',
    // Doublons : on garde ADRESSE_SIEGE comme canon, on cache l'alias SIEGE_SOCIAL
    'SIEGE_SOCIAL',
    // On garde OBJET_SOCIAL (joint) et on masque les sous-lignes OBJET_SOCIAL_1..6 (filtrées plus bas)
  ]);
  function _isBlank(v) {
    return v === null || v === undefined || v === '' || v === '-' || v === 'false' || v === false;
  }
  return entries.filter(function(e) {
    if (!e || !e.field) return false;
    var f = String(e.field);
    if (f.indexOf('_raw_') === 0) return false;
    if (f.charAt(0) === '_') return false;
    if (/^HAS_/.test(f)) return false;
    if (/^DG_\d+_/.test(f)) return false;
    if (/_LETTRES$/.test(f)) return false;
    // OBJET_SOCIAL_1..6 sont les lignes — on n'affiche que OBJET_SOCIAL (joint)
    if (/^OBJET_SOCIAL_\d+$/.test(f)) return false;
    if (hideExact.has(f)) return false;
    // Cache les diffs "valeur → vide" (faux changements d'un prefill incomplet)
    if (!_isBlank(e.before) && _isBlank(e.after)) return false;
    // Et les "vide → vide" (rien à voir)
    if (_isBlank(e.before) && _isBlank(e.after)) return false;
    // Filtre les diffs où les valeurs sont identiques (normalisation : trim + casse + espaces)
    var nb = String(e.before == null ? '' : e.before).trim().toLowerCase().replace(/\s+/g, ' ');
    var na = String(e.after  == null ? '' : e.after ).trim().toLowerCase().replace(/\s+/g, ' ');
    if (nb === na) return false;
    return true;
  });
}

function _renderChangesModal(entries) {
  // Filtre les champs techniques/dérivés
  entries = _filterRelevantChanges(entries);
  // Supprime un modal précédent
  var old = document.getElementById('review-changes-modal');
  if (old) old.remove();

  var overlay = document.createElement('div');
  overlay.id = 'review-changes-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(17,17,17,0.55);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

  var modal = document.createElement('div');
  modal.style.cssText = 'background:#fff;border-radius:20px;max-width:640px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,0.25);';

  // Détermine la description du sous-titre selon les acteurs présents dans les entrées
  function _describeActors(entries) {
    var actors = {};
    entries.forEach(function(e) {
      if (!e.actor_name) return;
      var role = e.actor_role === 'admin' ? 'admin' : 'avocat';
      var k = role + ':' + e.actor_name;
      actors[k] = (actors[k] || 0) + 1;
    });
    var keys = Object.keys(actors);
    if (keys.length === 0) return 'par votre équipe';
    if (keys.length === 1) {
      var parts = keys[0].split(':');
      var role = parts[0];
      var name = parts[1];
      var prefix = role === 'admin' ? 'par l\'admin' : 'par l\'avocat';
      return prefix + ' ' + name;
    }
    // Multi-acteurs : "par l'équipe (avocat X, admin Y…)"
    var labels = keys.map(function(k) {
      var p = k.split(':');
      return (p[0] === 'admin' ? 'admin ' : 'avocat ') + p[1];
    });
    return 'par ' + labels.join(', ');
  }
  var actorDesc = _describeActors(entries);
  var header = '<div style="padding:24px 28px 18px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:14px;">'
    + '<div style="width:40px;height:40px;border-radius:11px;background:#f5f3ff;color:#7c3aed;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
    +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>'
    + '</div>'
    + '<div style="flex:1;">'
    +   '<div style="font-family:\'Cal Sans\',sans-serif;font-size:19px;color:#111;">Modifications apportées</div>'
    +   '<div style="font-size:12.5px;color:#666;margin-top:1px;">' + entries.length + ' champ' + (entries.length > 1 ? 's' : '') + ' modifié' + (entries.length > 1 ? 's' : '') + ' ' + actorDesc + '</div>'
    + '</div>'
    + '<button id="review-changes-close" style="background:none;border:none;color:#999;cursor:pointer;font-size:24px;line-height:1;padding:4px 8px;">×</button>'
    + '</div>';

  function _esc(s) { return String(s).replace(/[<>&]/g, function(c){ return c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'; }); }
  function _formatValue(v) {
    if (v === null || v === undefined || v === '' || v === '-') return { text: '—', empty: true };
    var s = String(v);
    // Booléens stockés en chaîne
    if (s === 'true') return { text: 'Oui' };
    if (s === 'false') return { text: 'Non' };
    return { text: s };
  }
  function _formatActor(e) {
    if (!e.actor_name) return '';
    var role = e.actor_role === 'admin' ? 'Admin' : 'Avocat';
    var bg = e.actor_role === 'admin' ? '#1f2937' : '#7c3aed';
    var when = '';
    if (e.created_at) {
      try {
        var d = new Date(String(e.created_at).replace(' ', 'T') + 'Z');
        var now = new Date();
        var diffMin = Math.floor((now - d) / 60000);
        if (diffMin < 1) when = 'à l\'instant';
        else if (diffMin < 60) when = 'il y a ' + diffMin + ' min';
        else if (diffMin < 60 * 24) when = 'il y a ' + Math.floor(diffMin / 60) + ' h';
        else when = 'le ' + d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      } catch (e) {}
    }
    return '<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:#666;margin-top:8px;">'
      + '<span style="display:inline-flex;align-items:center;gap:4px;background:' + bg + ';color:#fff;padding:2px 7px;border-radius:10px;font-size:10.5px;font-weight:600;letter-spacing:0.3px;">' + role + '</span>'
      + '<span style="color:#111;font-weight:500;">' + _esc(e.actor_name) + '</span>'
      + (when ? '<span style="color:#999;">·</span><span style="color:#999;">' + when + '</span>' : '')
      + '</div>';
  }
  var rows = entries.map(function(e) {
    var bv = _formatValue(e.before);
    var av = _formatValue(e.after);
    var fieldLabel = _humanizeFieldName(e.field);
    return '<div style="padding:14px 16px;border:1px solid #f0f0f0;border-radius:12px;margin-bottom:10px;">'
      + '<div style="font-size:11.5px;color:#7c3aed;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:10px;">' + _esc(fieldLabel) + '</div>'
      + '<div style="display:flex;align-items:stretch;gap:10px;font-size:13.5px;line-height:1.4;">'
      +   '<div style="flex:1;min-width:0;padding:9px 12px;background:#fef2f2;color:' + (bv.empty ? '#9ca3af' : '#991b1b') + ';border-radius:8px;' + (bv.empty ? '' : 'text-decoration:line-through;') + 'word-break:break-word;">' + _esc(bv.text) + '</div>'
      +   '<div style="display:flex;align-items:center;flex-shrink:0;color:#999;">'
      +     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>'
      +   '</div>'
      +   '<div style="flex:1;min-width:0;padding:9px 12px;background:#f0fdf4;color:' + (av.empty ? '#9ca3af' : '#166534') + ';border-radius:8px;font-weight:500;word-break:break-word;">' + _esc(av.text) + '</div>'
      + '</div>'
      + _formatActor(e)
      + '</div>';
  }).join('');
  if (!entries.length) {
    rows = '<div style="padding:30px;text-align:center;color:#999;font-size:13.5px;">Aucune modification de champ détectée.</div>';
  }

  modal.innerHTML = header + '<div style="padding:20px 28px;overflow-y:auto;">' + rows + '</div>';
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  var closeBtn = document.getElementById('review-changes-close');
  if (closeBtn) closeBtn.addEventListener('click', function(){ overlay.remove(); });
}

function markDocsAsModified(entries) {
  entries = _filterRelevantChanges(entries);
  if (!entries || !entries.length) return;
  window._lastReviewChanges = entries;
  var cards = document.querySelectorAll('#gen-docs-list .gen-doc-card');
  cards.forEach(function(card) {
    // Évite les doubles badges
    if (card.querySelector('.doc-modified-badge')) return;
    // N'applique le badge qu'aux documents générés à partir des données du formulaire :
    // pas sur l'annonce légale (publiée par avocat), pas sur KBIS/RBE (greffe), ni docs
    // verrouillés en attente d'action.
    if (card.classList.contains('pending')) return;
    var existingBadge = card.querySelector('.gen-doc-badge');
    if (!existingBadge) return;
    if (existingBadge.classList.contains('locked')) return;
    var modBadge = document.createElement('button');
    modBadge.type = 'button';
    modBadge.className = 'doc-modified-badge';
    modBadge.style.cssText = 'background:#f5f3ff;color:#7c3aed;border:1px solid #e9d5ff;border-radius:100px;padding:4px 10px;font-size:11.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;margin-right:8px;font-family:inherit;letter-spacing:0.2px;transition:all 0.15s ease;';
    modBadge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg> Modifié';
    modBadge.addEventListener('mouseenter', function(){ modBadge.style.background = '#ede9fe'; });
    modBadge.addEventListener('mouseleave', function(){ modBadge.style.background = '#f5f3ff'; });
    modBadge.addEventListener('click', function(e) {
      e.stopPropagation();
      _renderChangesModal(window._lastReviewChanges || entries);
    });
    existingBadge.parentNode.insertBefore(modBadge, existingBadge);
  });
}
window.markDocsAsModified = markDocsAsModified;

window.reuploadClientDoc = function(key) {
  // Trigger re-upload : ouvre l'input file du doc concerné
  var input = document.querySelector('input[type="file"][data-doc-key="' + key + '"]');
  if (input) { input.click(); return; }
  // fallback : prompt pour upload manuel
  if (typeof showToast === 'function') showToast('Retournez à l\'étape correspondante du dossier pour re-téléverser');
  else alert('Pour re-téléverser ce document, retournez à l\'étape correspondante du dossier.');
};

/* --- Annonce légale : pas de polling, on s'appuie sur l'état réel.
   Le badge "Publiée" apparaîtra dès que l'avocat publie l'annonce (action explicite qui
   appellera renderDocSpace). Plus de re-render automatique toutes les 30 secondes. */
function startAnnonceLegaleTimer(lc) {
  if (_annonceLegaleTimer) { clearInterval(_annonceLegaleTimer); _annonceLegaleTimer = null; }
  if (!lc.generatedAt) {
    lc.generatedAt = Date.now();
    saveLifecycle(lc);
  }
}

/* ===== SIGNATURE PAD ===== */
var _sigDrawing = false;
var _sigCtx = null;
var _sigMode = 'draw'; // 'draw' or 'type'

function initSignatureCanvas() {
  var canvas = document.getElementById('sig-canvas');
  if (!canvas) return;
  var rect = canvas.parentElement.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = 200 * dpr;
  canvas.style.height = '200px';
  _sigCtx = canvas.getContext('2d');
  _sigCtx.scale(dpr, dpr);
  _sigCtx.lineWidth = 2.5;
  _sigCtx.lineCap = 'round';
  _sigCtx.lineJoin = 'round';
  _sigCtx.strokeStyle = '#111';

  // Mouse events
  canvas.addEventListener('mousedown', sigStart);
  canvas.addEventListener('mousemove', sigMove);
  canvas.addEventListener('mouseup', sigEnd);
  canvas.addEventListener('mouseleave', sigEnd);
  // Touch events
  canvas.addEventListener('touchstart', function(e) { e.preventDefault(); sigStart(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchmove', function(e) { e.preventDefault(); sigMove(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchend', sigEnd);
}
window.initSignatureCanvas = initSignatureCanvas;

function sigStart(e) {
  _sigDrawing = true;
  var canvas = document.getElementById('sig-canvas');
  var rect = canvas.getBoundingClientRect();
  _sigCtx.beginPath();
  _sigCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
}
function sigMove(e) {
  if (!_sigDrawing) return;
  var canvas = document.getElementById('sig-canvas');
  var rect = canvas.getBoundingClientRect();
  _sigCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
  _sigCtx.stroke();
}
function sigEnd() { _sigDrawing = false; }

function switchSigTab(mode) {
  _sigMode = mode;
  var tabs = document.querySelectorAll('.sig-tab');
  tabs[0].className = 'sig-tab' + (mode === 'draw' ? ' active' : '');
  tabs[1].className = 'sig-tab' + (mode === 'type' ? ' active' : '');
  document.getElementById('sig-canvas-wrap').className = 'sig-canvas-wrap' + (mode === 'type' ? ' hidden' : '');
  document.getElementById('sig-typed-wrap').className = 'sig-typed-wrap' + (mode === 'type' ? ' active' : '');
  if (mode === 'draw') initSignatureCanvas();
}
window.switchSigTab = switchSigTab;

function updateTypedSignature() {
  var input = document.getElementById('sig-typed-input');
  var preview = document.getElementById('sig-typed-preview');
  preview.textContent = input.value || '';
}
window.updateTypedSignature = updateTypedSignature;

function clearSignature() {
  if (_sigMode === 'draw') {
    var canvas = document.getElementById('sig-canvas');
    var dpr = window.devicePixelRatio || 1;
    _sigCtx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  } else {
    document.getElementById('sig-typed-input').value = '';
    document.getElementById('sig-typed-preview').textContent = '';
  }
}
window.clearSignature = clearSignature;

function openSignatureModal() {
  document.getElementById('signature-overlay').classList.add('active');
  setTimeout(initSignatureCanvas, 100);
}
window.openSignatureModal = openSignatureModal;

function closeSignatureModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('signature-overlay').classList.remove('active');
}
window.closeSignatureModal = closeSignatureModal;

function getSignatureBase64() {
  if (_sigMode === 'draw') {
    var canvas = document.getElementById('sig-canvas');
    // Check if canvas has content
    var dpr = window.devicePixelRatio || 1;
    var data = _sigCtx.getImageData(0, 0, canvas.width, canvas.height).data;
    var hasContent = false;
    for (var i = 3; i < data.length; i += 4) {
      if (data[i] > 0) { hasContent = true; break; }
    }
    if (!hasContent) return null;
    return canvas.toDataURL('image/png');
  } else {
    var text = document.getElementById('sig-typed-input').value.trim();
    if (!text) return null;
    // Render text to canvas
    var tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = 500;
    tmpCanvas.height = 150;
    var ctx = tmpCanvas.getContext('2d');
    ctx.font = '48px "Dancing Script", cursive';
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 250, 75);
    return tmpCanvas.toDataURL('image/png');
  }
}
window.getSignatureBase64 = getSignatureBase64;

function applySignature() {
  var sigData = getSignatureBase64();
  if (!sigData) {
    if (typeof showToast === 'function') showToast('Veuillez dessiner ou taper votre signature');
    else alert('Veuillez dessiner ou taper votre signature.');
    return;
  }

  var lc = loadLifecycle();
  lc.signatureData = sigData;
  saveLifecycle(lc);

  closeSignatureModal();

  // Sign each document with template
  var docs = _lcDocs.filter(function(d) { return d.template; });
  var total = docs.length;
  var done = 0;

  // Show progress in lifecycle content
  var el = document.getElementById('lifecycle-content');
  el.innerHTML = '<div class="lifecycle-content">'
    + '<div class="lc-icon sign"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></div>'
    + '<h2>Signature en cours...</h2>'
    + '<div class="lc-progress">'
    + '  <div class="lc-progress-bar"><div class="lc-progress-fill" id="sig-progress-fill" style="width:0%"></div></div>'
    + '  <div class="lc-progress-label" id="sig-progress-label">Pr\u00e9paration...</div>'
    + '</div>'
    + '</div>';

  var formData = collectFormDataForDocs();
  if (lc.docsDateSignature) formData.DATE_SIGNATURE = lc.docsDateSignature;
  if (lc.docsDateSignatureCourte) formData.DATE_SIGNATURE_COURTE = lc.docsDateSignatureCourte;

  function signNext() {
    if (done >= total) {
      document.getElementById('sig-progress-label').textContent = 'Tous les documents sign\u00e9s !';
      lc.creatorSigned = true;
      saveLifecycle(lc);

      // Persist creator signature in DB
      var parapheVal = document.getElementById('sig-paraphe-input') ? document.getElementById('sig-paraphe-input').value.trim() : '';
      if (_currentFormaliteId) {
        fetch('/api/formalites/' + _currentFormaliteId + '/signature-requests/creator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature_data: sigData, paraphe_data: parapheVal })
        }).catch(function() {});
      }

      var panels = document.querySelectorAll('#associe-panels .associe-panel');
      if (panels.length <= 1) {
        // SASU: only 1 associe -> phase 5
        setTimeout(function() { enterPhase(5); }, 1000);
      } else {
        // Multi-associes -> re-render phase 4 (state C)
        setTimeout(function() { renderPhase4(loadLifecycle()); }, 1000);
      }
      return;
    }
    var doc = docs[done];
    document.getElementById('sig-progress-label').textContent = (done + 1) + '/' + total + ' \u2014 Signature...';
    document.getElementById('sig-progress-fill').style.width = Math.round(((done + 0.5) / total) * 100) + '%';

    var firstPanel = document.querySelector('#associe-panels .associe-panel[data-panel="1"]');
    var a1Data = firstPanel ? extractAssocieData(firstPanel) : null;
    var signerFullName = a1Data ? (a1Data.prenom + ' ' + a1Data.nom).trim() : '';

    // Merge conjoint data if this is a conjoint doc, OR dirigeant data if this is a per-dirigeant DNC
    var signFormData = formData;
    if (doc.conjointData || doc.dirigeantData) {
      signFormData = Object.assign({}, formData);
      var docIdx = _lcDocs.indexOf(doc);
      if (docIdx >= 0) {
        if (doc.conjointData) signFormData = _mergeConjointData(signFormData, docIdx);
        if (doc.dirigeantData) signFormData = _mergeDirigeantData(signFormData, docIdx);
      }
    }

    fetch('/api/sign-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: doc.template,
        data: signFormData,
        signatureBase64: sigData,
        signerName: signerFullName,
        filename: doc.name.replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, '') + '.pdf'
      })
    }).then(function() {
      lc.signedDocs = lc.signedDocs || [];
      if (lc.signedDocs.indexOf(doc.template) < 0) lc.signedDocs.push(doc.template);
      saveLifecycle(lc);
      done++;
      document.getElementById('sig-progress-fill').style.width = Math.round((done / total) * 100) + '%';
      setTimeout(signNext, 300);
    }).catch(function() {
      done++;
      setTimeout(signNext, 300);
    });
  }
  signNext();
}
window.applySignature = applySignature;

/* --- buildRecapStep: initialize lifecycle --- */
function buildRecapStep() {
  var nomSociete = document.querySelector('.step-content[data-step="1"] input[placeholder="Nom de la soci\u00e9t\u00e9"]');
  var forme = document.getElementById('forme-juridique');
  var capital = document.getElementById('capital-social');
  var offerNames = { starter: 'Starter 269\u20AC', business: 'Business 580\u20AC', premium: 'Premium 780\u20AC' };

  document.getElementById('recap-societe').textContent = nomSociete && nomSociete.value ? nomSociete.value : 'Non renseign\u00e9';
  document.getElementById('recap-forme').textContent = forme ? forme.value : '-';
  document.getElementById('recap-capital').textContent = capital ? (parseFloat(capital.value) || 1).toLocaleString('fr-FR') + ' \u20AC' : '-';
  document.getElementById('recap-offre').textContent = offerNames[selectedOffer] || '-';

  // Show upgrade button if not premium
  var upgradeBtn = document.getElementById('btn-upgrade-offer');
  if (upgradeBtn) {
    upgradeBtn.style.display = selectedOffer === 'premium' ? 'none' : '';
  }

  // Build docs list
  _lcDocs = getDocsList();

  // Load or init lifecycle
  var lc = loadLifecycle();
  if (!lc.generatedAt) {
    lc.generatedAt = Date.now();
    lc.annonceLegaleReadyAt = lc.generatedAt + (15 * 60 * 1000);
    // Set initial business sub-phase for business/premium
    if (selectedOffer && selectedOffer !== 'starter') {
      lc.businessSubPhase = '5a';
    }
    saveLifecycle(lc);
  }

  enterPhase(lc.phase);
}
window.buildRecapStep = buildRecapStep;

/* ===== UPGRADE OFFER ===== */
var _selectedUpgradeOffer = null;

function showUpgradeModal() {
  _selectedUpgradeOffer = null;
  var rank = { starter: 1, business: 2, premium: 3 };
  var currentRank = rank[selectedOffer] || 1;
  var offers = [
    { key: 'business', name: 'Business', price: 580, features: 'Accompagnement avocat, r\u00e9vision compl\u00e8te, d\u00e9p\u00f4t au guichet unique' },
    { key: 'premium', name: 'Premium', price: 780, features: 'Business + suivi prioritaire, avocat d\u00e9di\u00e9, assistance illimit\u00e9e' }
  ];
  var prices = { starter: 269, business: 580, premium: 780 };
  var currentPrice = prices[selectedOffer] || 269;
  var html = '';
  var available = 0;
  for (var i = 0; i < offers.length; i++) {
    if (rank[offers[i].key] <= currentRank) continue;
    available++;
    var complement = offers[i].price - currentPrice;
    html += '<div class="upgrade-card" data-offer="' + offers[i].key + '" onclick="selectUpgradeCard(this)">'
      + '<div class="upgrade-card-header">'
      + '<span class="upgrade-card-name">' + offers[i].name + '</span>'
      + '<span class="upgrade-card-price">+' + complement + '\u20AC HT</span>'
      + '</div>'
      + '<div class="upgrade-card-features">' + offers[i].features + '</div>'
      + '</div>';
  }
  if (!available) return;
  document.getElementById('upgrade-cards').innerHTML = html;
  document.getElementById('btn-confirm-upgrade').disabled = true;
  document.getElementById('upgrade-overlay').classList.add('active');
}
window.showUpgradeModal = showUpgradeModal;

function selectUpgradeCard(el) {
  document.querySelectorAll('.upgrade-card').forEach(function(c) { c.classList.remove('selected'); });
  el.classList.add('selected');
  _selectedUpgradeOffer = el.dataset.offer;
  document.getElementById('btn-confirm-upgrade').disabled = false;
}
window.selectUpgradeCard = selectUpgradeCard;

function closeUpgradeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('upgrade-overlay').classList.remove('active');
}
window.closeUpgradeModal = closeUpgradeModal;

function processUpgrade() {
  if (!_selectedUpgradeOffer) return;
  var newOffer = _selectedUpgradeOffer;
  var prices = { starter: 269, business: 580, premium: 780 };
  var names = { starter: 'Starter', business: 'Business', premium: 'Premium' };
  var complement = prices[newOffer] - (prices[selectedOffer] || 269);

  // Close upgrade modal
  document.getElementById('upgrade-overlay').classList.remove('active');

  // Show payment overlay with complement
  var overlay = document.getElementById('payment-overlay');
  overlay.classList.add('active');
  document.getElementById('payment-amount').textContent = complement + '\u20AC HT';
  document.getElementById('payment-offer-label').textContent = 'Compl\u00e9ment Offre ' + names[newOffer];

  var icon = document.getElementById('payment-icon');
  icon.className = 'payment-modal-icon loading';
  icon.innerHTML = '<div class="spinner"></div>';
  document.getElementById('payment-title').textContent = 'Paiement en cours...';
  document.getElementById('payment-msg').textContent = 'Veuillez patienter pendant le traitement de votre paiement.';

  setTimeout(function() {
    icon.className = 'payment-modal-icon success';
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    document.getElementById('payment-title').textContent = 'Paiement accept\u00e9 !';
    document.getElementById('payment-msg').textContent = 'Votre offre a \u00e9t\u00e9 mise \u00e0 jour.';

    // Update server
    if (_currentFormaliteId) {
      fetch('/api/formalites/' + _currentFormaliteId + '/upgrade', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer: newOffer })
      }).catch(function(e) { console.error('Upgrade error:', e); });
    }

    // Update local state
    selectedOffer = newOffer;
    saveFormData();

    // Update recap banner
    var offerNames = { starter: 'Starter 269\u20AC', business: 'Business 580\u20AC', premium: 'Premium 780\u20AC' };
    document.getElementById('recap-offre').textContent = offerNames[selectedOffer] || '-';

    // Show/hide upgrade button
    document.getElementById('btn-upgrade-offer').style.display = selectedOffer === 'premium' ? 'none' : '';

    // Set business sub-phase in lifecycle
    var lc = loadLifecycle();
    if (!lc.businessSubPhase) {
      lc.businessSubPhase = '5a';
      saveLifecycle(lc);
    }

    setTimeout(function() {
      overlay.classList.remove('active');
      // Rebuild lifecycle with new phase count
      _lcDocs = getDocsList();
      enterPhase(lc.phase);
    }, 1500);
  }, 2500);
}
window.processUpgrade = processUpgrade;

/* ===== CONJOINT DATA MERGE HELPER ===== */
function _mergeConjointData(formData, docIndex) {
  if (docIndex == null || !_lcDocs || !_lcDocs[docIndex]) return formData;
  var doc = _lcDocs[docIndex];
  if (!doc.conjointData) return formData;
  var cd = doc.conjointData;
  // Map per-associé conjoint data to generic template placeholders
  var contrat = cd.contratMariage || '';
  var regimeLabel = 'sans contrat de mariage';
  if (contrat.indexOf('universelle') >= 0) regimeLabel = 'sous le r\u00e9gime de la communaut\u00e9 universelle';
  else if (contrat.indexOf('acqu\u00eats') >= 0) regimeLabel = 'sous le r\u00e9gime de la participation aux acqu\u00eats';

  formData.CONJOINT_NOM = (cd.conjointCivilite + ' ' + (cd.conjointNom || '').toUpperCase() + ' ' + (cd.conjointPrenom || '')).trim() || '-';
  formData.CONJOINT_PRENOM = cd.conjointPrenom || '-';
  formData.CONJOINT_NOM_NAISSANCE = cd.conjointNomNaissance || '-';
  formData.CONJOINT_DE = cd.civNomPrenom || '-';
  formData.DATE_MARIAGE = formatDateFr(cd.dateMariage) || '-';
  formData.VILLE_MARIAGE = cd.villeMariage || '-';
  formData.REGIME_LABEL = regimeLabel;
  formData.REGIME_MATRIMONIAL = contrat.indexOf('universelle') >= 0 ? 'communaut\u00e9 universelle'
    : contrat.indexOf('acqu\u00eats') >= 0 ? 'participation aux acqu\u00eats'
    : 'communaut\u00e9 r\u00e9duite aux acqu\u00eats';
  return formData;
}

/* ===== DOWNLOAD / PREVIEW DOCUMENTS ===== */
// Si un doc a un `dirigeantData` attaché (DNC par dirigeant), on override les variables
// CIVILITE_NOM_PRENOM_1, ADRESSE_ASSOCIE_1, etc. avec les données du dirigeant spécifique.
function _mergeDirigeantData(formData, docIndex) {
  if (docIndex == null || !_lcDocs || !_lcDocs[docIndex]) return formData;
  var doc = _lcDocs[docIndex];
  if (!doc.dirigeantData) return formData;
  var dd = doc.dirigeantData;
  if (dd.civNomPrenom) formData.CIVILITE_NOM_PRENOM_1 = dd.civNomPrenom;
  if (dd.civNomPrenom) formData.CIVILITE_NOM_PRENOM = dd.civNomPrenom;
  if (dd.civilite) formData.CIVILITE = dd.civilite;
  if (dd.nom) formData.NOM = (dd.nom || '').toUpperCase();
  if (dd.prenom) formData.PRENOM = dd.prenom;
  if (dd.adresse) formData.ADRESSE_ASSOCIE_1 = dd.adresse;
  if (dd.adresse) formData.ADRESSE_PERSO = dd.adresse;
  if (dd.dateNaissance) formData.DATE_NAISSANCE_1 = formatDateFr(dd.dateNaissance) || dd.dateNaissance;
  if (dd.dateNaissance) formData.DATE_NAISSANCE = formatDateFr(dd.dateNaissance) || dd.dateNaissance;
  if (dd.lieuNaissance) formData.LIEU_NAISSANCE_1 = dd.lieuNaissance;
  if (dd.lieuNaissance) formData.LIEU_NAISSANCE = dd.lieuNaissance;
  if (dd.nationalite) formData.NATIONALITE_1 = dd.nationalite;
  if (dd.nationalite) formData.NATIONALITE = dd.nationalite;
  if (dd.pere) formData.NOM_PERE_1 = dd.pere;
  if (dd.pere) formData.NOM_PERE = dd.pere;
  if (dd.mere) formData.NOM_MERE_1 = dd.mere;
  if (dd.mere) formData.NOM_MERE = dd.mere;
  formData.EST_HOMME = (dd.civilite || '').toLowerCase().indexOf('monsieur') >= 0;
  formData.EST_FEMME = !formData.EST_HOMME;
  // Rôle (Président / DG / Gérant)
  if (doc.dirigeantRole) {
    formData.ROLE_DIRIGEANT = doc.dirigeantRole;
  }
  return formData;
}

function downloadDoc(template, filename, conjointDocIndex) {
  var formData = collectFormDataForDocs();
  var lc = loadLifecycle();
  if (lc.docsDateSignature) formData.DATE_SIGNATURE = lc.docsDateSignature;
  if (lc.docsDateSignatureCourte) formData.DATE_SIGNATURE_COURTE = lc.docsDateSignatureCourte;
  if (conjointDocIndex != null) formData = _mergeConjointData(formData, conjointDocIndex);
  if (conjointDocIndex != null) formData = _mergeDirigeantData(formData, conjointDocIndex);
  var pdfFilename = filename.replace(/\.docx$/i, '.pdf');
  var endpoint = '/api/generate-pdf';
  var payload = { template: template, data: formData, filename: pdfFilename };
  if (_currentFormaliteId && lc.phase >= 4) {
    endpoint = '/api/formalites/' + _currentFormaliteId + '/generate-signed-pdf';
  } else if (lc.signatureData) {
    endpoint = '/api/sign-document';
    payload.signatureBase64 = lc.signatureData;
    var firstPanel = document.querySelector('#associe-panels .associe-panel[data-panel="1"]');
    var a1Data = firstPanel ? extractAssocieData(firstPanel) : null;
    payload.signerName = a1Data ? (a1Data.prenom + ' ' + a1Data.nom).trim() : '';
  }

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(resp) {
    if (!resp.ok) return resp.text().then(function(t) { throw new Error(t); });
    return resp.blob();
  })
  .then(function(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = pdfFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  })
  .catch(function(e) { console.error('Download error:', endpoint, e); if (typeof showToast === 'function') showToast('Erreur : ' + e.message); else alert('Erreur: ' + e.message); });
}
window.downloadDoc = downloadDoc;

// Current preview blob URL + last preview args for cleanup / regen
var _currentPreviewUrl = null;
var _lastPreviewArgs = null;

function previewDoc(template, filename, conjointDocIndex) {
  _lastPreviewArgs = { template: template, filename: filename, conjointDocIndex: conjointDocIndex };
  var overlay = document.getElementById('pdf-preview-overlay');
  var body = document.getElementById('pdf-preview-body');
  var loading = document.getElementById('pdf-preview-loading');
  var titleEl = document.getElementById('pdf-preview-title');
  var dlBtn = document.getElementById('pdf-preview-download-btn');

  var displayName = filename.replace(/\.docx$/i, '');
  titleEl.textContent = displayName;

  // Show overlay with loading
  overlay.classList.add('active');
  body.innerHTML = '';
  body.appendChild(loading);
  loading.style.display = 'flex';

  var formData = collectFormDataForDocs();
  var lc = loadLifecycle();
  if (lc.docsDateSignature) formData.DATE_SIGNATURE = lc.docsDateSignature;
  if (lc.docsDateSignatureCourte) formData.DATE_SIGNATURE_COURTE = lc.docsDateSignatureCourte;
  if (conjointDocIndex != null) formData = _mergeConjointData(formData, conjointDocIndex);
  if (conjointDocIndex != null) formData = _mergeDirigeantData(formData, conjointDocIndex);
  var pdfFilename = filename.replace(/\.docx$/i, '.pdf');

  var endpoint = '/api/generate-pdf';
  var payload = { template: template, data: formData, filename: pdfFilename, preview: true };
  if (_currentFormaliteId && lc.phase >= 4) {
    endpoint = '/api/formalites/' + _currentFormaliteId + '/generate-signed-pdf';
  } else if (lc.signatureData) {
    endpoint = '/api/sign-document';
    payload.signatureBase64 = lc.signatureData;
    var firstPanel = document.querySelector('#associe-panels .associe-panel[data-panel="1"]');
    var a1Data = firstPanel ? extractAssocieData(firstPanel) : null;
    payload.signerName = a1Data ? (a1Data.prenom + ' ' + a1Data.nom).trim() : '';
  }

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(resp) {
    if (!resp.ok) return resp.text().then(function(t) { throw new Error(t); });
    return resp.blob();
  })
  .then(function(blob) {
    // Cleanup previous
    if (_currentPreviewUrl) URL.revokeObjectURL(_currentPreviewUrl);

    _currentPreviewUrl = URL.createObjectURL(blob);
    loading.style.display = 'none';

    // Viewer custom basé sur PDF.js — pas de panneau latéral, pas de toolbar parasite.
    var inlineWrap = document.createElement('div');
    inlineWrap.className = 'pdf-inline-wrap';
    body.appendChild(inlineWrap);
    _renderPdfInline(blob, inlineWrap);

    dlBtn.onclick = function() {
      var a = document.createElement('a');
      a.href = _currentPreviewUrl;
      a.download = pdfFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
  })
  .catch(function(e) {
    loading.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" width="32" height="32"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
      + '<span style="color:#ef4444;">Erreur : ' + e.message + '</span>';
  });
}
window.previewDoc = previewDoc;

function closePdfPreview(event) {
  if (event && event.target !== event.currentTarget) return;
  var overlay = document.getElementById('pdf-preview-overlay');
  overlay.classList.remove('active');
  if (_currentPreviewUrl) {
    URL.revokeObjectURL(_currentPreviewUrl);
    _currentPreviewUrl = null;
  }
  _lastPreviewArgs = null;
}
window.closePdfPreview = closePdfPreview;

function regenerateDocs() {
  // Migrate legacy "non" stored in server data (old bug) → "marié(e)"
  if (window._serverLoadedData) {
    for (var k in window._serverLoadedData) {
      if (k.indexOf('SITUATION_MATRIMONIALE') === 0) {
        var v = window._serverLoadedData[k];
        if (typeof v === 'string' && v.toLowerCase() === 'non') {
          window._serverLoadedData[k] = 'marié(e)';
        }
      }
    }
  }

  _lcDocs = getDocsList();
  var lc = loadLifecycle();
  renderDocSpace(lc);

  // If a preview is currently open, re-fetch it with fresh data
  var overlay = document.getElementById('pdf-preview-overlay');
  if (overlay && overlay.classList.contains('active') && _lastPreviewArgs) {
    var args = _lastPreviewArgs;
    if (_currentPreviewUrl) { URL.revokeObjectURL(_currentPreviewUrl); _currentPreviewUrl = null; }
    previewDoc(args.template, args.filename, args.conjointDocIndex);
  }
  // Brief visual feedback (only when invoked via a click handler — guard against ReferenceError)
  var btn = null;
  try { btn = (typeof event !== 'undefined' && event && event.target) ? event.target.closest('button') : null; } catch(e) { btn = null; }
  if (btn) {
    btn.style.borderColor = '#22c55e';
    btn.textContent = 'Documents reg\u00e9n\u00e9r\u00e9s !';
    setTimeout(function() {
      btn.style.borderColor = '#e0e0e0';
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Reg\u00e9n\u00e9rer les documents';
    }, 2000);
  }
}
window.regenerateDocs = regenerateDocs;

// Viewer PDF custom : rend chaque page sur un canvas, empilage vertical scrollable.
// Aucun panneau de vignettes, aucune toolbar parasite (Chrome PDF viewer remplacé).
function _renderPdfInline(blob, container) {
  container.innerHTML = '<div class="pdf-inline-loading">Chargement…</div>';
  if (!window.pdfjsLib) {
    container.innerHTML = '<div class="pdf-inline-error">PDF.js non chargé.</div>';
    return;
  }
  // CSP bloque les blob: via fetch, donc on convertit en ArrayBuffer et on le passe
  // directement à PDF.js via { data: ... }.
  blob.arrayBuffer().then(function(buf) {
    return window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  }).then(function(pdf) {
    container.innerHTML = '';
    var scale = Math.min((container.clientWidth - 80) / 612, 2);
    if (!isFinite(scale) || scale < 0.5) scale = 1.3;
    var promise = Promise.resolve();
    for (var i = 1; i <= pdf.numPages; i++) {
      (function(pageNum) {
        promise = promise.then(function() {
          return pdf.getPage(pageNum).then(function(page) {
            var dpr = window.devicePixelRatio || 1;
            var viewport = page.getViewport({ scale: scale * dpr });
            var canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.width = (viewport.width / dpr) + 'px';
            canvas.style.height = (viewport.height / dpr) + 'px';
            container.appendChild(canvas);
            return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
          });
        });
      })(i);
    }
    return promise;
  }).catch(function(err) {
    container.innerHTML = '<div class="pdf-inline-error">Erreur de chargement du PDF : ' + (err && err.message ? err.message : err) + '</div>';
  });
}
window._renderPdfInline = _renderPdfInline;

Formalist.lifecycle = {
  getLcKey: getLcKey,
  loadLifecycle: loadLifecycle,
  saveLifecycle: saveLifecycle,
  getDocsList: getDocsList,
  renderLifecycleStepper: renderLifecycleStepper,
  enterPhase: enterPhase,
  uploadAttestation: uploadAttestation,
  resetAttestation: resetAttestation,
  uploadKbis: uploadKbis,
  isCreatorAssocie: isCreatorAssocie,
  getExternalDirigeants: getExternalDirigeants,
  generateSignatureLinks: generateSignatureLinks,
  loadSignatureTracking: loadSignatureTracking,
  copySignLink: copySignLink,
  showToast: showToast,
  escapeHtmlText: escapeHtmlText,
  formatDateShort: formatDateShort,
  renderDocSpace: renderDocSpace,
  initSignatureCanvas: initSignatureCanvas,
  switchSigTab: switchSigTab,
  updateTypedSignature: updateTypedSignature,
  clearSignature: clearSignature,
  openSignatureModal: openSignatureModal,
  closeSignatureModal: closeSignatureModal,
  getSignatureBase64: getSignatureBase64,
  applySignature: applySignature,
  buildRecapStep: buildRecapStep,
  showUpgradeModal: showUpgradeModal,
  selectUpgradeCard: selectUpgradeCard,
  closeUpgradeModal: closeUpgradeModal,
  processUpgrade: processUpgrade,
  downloadDoc: downloadDoc,
  previewDoc: previewDoc,
  closePdfPreview: closePdfPreview,
  regenerateDocs: regenerateDocs,
  loadBusinessChat: loadBusinessChat,
  sendBusinessMessage: sendBusinessMessage,
  escapeHtmlSafe: escapeHtmlSafe
};
