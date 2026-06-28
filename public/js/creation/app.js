/**
 * Formalist App Module
 * Step navigation, DOMContentLoaded, offer selection, payment, auto-save, prefill
 */
window.Formalist = window.Formalist || {};

// ==================== STEP NAVIGATION ====================
var currentStep = 1;
var totalSteps = 7;
var isAnimating = false;

function startForm() {
  var intro = document.getElementById('intro');
  intro.style.transition = 'opacity 0.3s, transform 0.3s';
  intro.style.opacity = '0';
  intro.style.transform = 'translateY(-10px)';
  setTimeout(function() {
    intro.style.display = 'none';
    var form = document.getElementById('form-section');
    form.classList.add('active');
    updateProgressBar();
    saveFormData();
  }, 300);
}
window.startForm = startForm;
// beginCreation is an alias for startForm
window.beginCreation = startForm;

function updateStepIndicators() {
  document.querySelectorAll('.step').forEach(function(s) {
    var step = parseInt(s.dataset.step);
    s.classList.remove('active', 'done');
    var circle = s.querySelector('.step-circle');
    if (step === currentStep) {
      s.classList.add('active');
      circle.innerHTML = step;
    } else if (step < currentStep) {
      s.classList.add('done');
      circle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    } else {
      circle.innerHTML = step;
    }
  });
  // Update segments
  document.querySelectorAll('.step-segment').forEach(function(seg) {
    var segNum = parseInt(seg.dataset.seg);
    seg.classList.remove('done', 'active');
    if (segNum < currentStep) seg.classList.add('done');
  });
}
window.updateStepIndicators = updateStepIndicators;

function transitionStep(from, to, direction) {
  if (isAnimating) return;
  isAnimating = true;

  var allContents = document.querySelectorAll('.step-content');
  var fromEl = null, toEl = null;
  allContents.forEach(function(c) {
    if (parseInt(c.dataset.step) === from) fromEl = c;
    if (parseInt(c.dataset.step) === to) toEl = c;
  });

  var exitClass = direction === 'next' ? 'exit-left' : 'exit-right';
  var enterClass = direction === 'next' ? 'active' : 'enter-from-left';

  fromEl.classList.remove('active', 'enter-from-left');
  fromEl.classList.add(exitClass);

  setTimeout(function() {
    fromEl.classList.remove(exitClass);
    fromEl.style.display = 'none';

    toEl.style.display = '';
    toEl.classList.remove('active', 'enter-from-left', 'exit-left', 'exit-right');
    toEl.classList.add(enterClass);

    updateStepIndicators();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    setTimeout(function() { isAnimating = false; }, 450);
  }, 300);
}
window.transitionStep = transitionStep;

function nextStep() {
  if (currentStep < totalSteps && !isAnimating) {
    // Avocat mode: after documents step (5), submit directly instead of going to offers
    if (isAvocatMode && currentStep === 5) {
      submitAsAvocat();
      return;
    }
    saveFormData();
    var from = currentStep;
    currentStep++;
    if (currentStep === 3) { updateDirigeantLabels(); refreshDirigeantSelects(); }
    if (currentStep === 4) buildCapitalStep();
    if (currentStep === 5) buildDocStep();
    transitionStep(from, currentStep, 'next');
  }
}
window.nextStep = nextStep;

function prevStep() {
  if (currentStep > 1 && !isAnimating) {
    saveFormData();
    var from = currentStep;
    currentStep--;
    if (currentStep === 3) { updateDirigeantLabels(); refreshDirigeantSelects(); }
    if (currentStep === 4) buildCapitalStep();
    if (currentStep === 5) buildDocStep();
    transitionStep(from, currentStep, 'prev');
  }
}
window.prevStep = prevStep;

function goToStep(target) {
  if (isAnimating) return;
  target = parseInt(target);
  if (target === currentStep) return;

  // Rebuild step-specific content when navigating to it
  if (target === 3) { updateDirigeantLabels(); refreshDirigeantSelects(); }
  if (target === 4) { buildCapitalStep(); }
  if (target === 5) { buildDocStep(); }
  if (target === 7) {
    // Mes documents : re-render le lifecycle complet (recap, phase tracker, docs list)
    try {
      var lc = (typeof loadLifecycle === 'function') ? loadLifecycle() : { phase: 1 };
      if (typeof enterPhase === 'function') enterPhase(lc.phase || 1);
    } catch (_) {}
  }

  // Re-sync custom-select + custom-date triggers à l'entrée de l'étape : si on revient depuis
  // une autre étape, les triggers visibles des custom-controls peuvent afficher "Choisir…" / "jj/mm/aaaa"
  // alors que la valeur interne existe.
  setTimeout(function() {
    var targetEl = document.querySelector('.step-content[data-step="' + target + '"]');
    if (!targetEl) return;
    targetEl.querySelectorAll('select').forEach(function(sel) {
      if (sel.value && typeof window.setSelect === 'function') {
        window.setSelect(sel, sel.value);
      }
    });
    targetEl.querySelectorAll('input[type="date"]').forEach(function(inp) {
      if (inp.value && typeof inp._cdpSync === 'function') inp._cdpSync();
    });
    // Applique le mode verrouillé si le dossier est payé/généré
    if (typeof window.applyLockedMode === 'function') window.applyLockedMode();
  }, 0);

  // Hide all steps
  document.querySelectorAll('.step-content').forEach(function(el) {
    el.classList.remove('active', 'enter-from-left', 'enter-from-right', 'exit-left', 'exit-right');
    el.style.display = 'none';
  });
  // Show target step
  var targetStep = document.querySelector('.step-content[data-step="' + target + '"]');
  if (targetStep) {
    targetStep.style.display = '';
    targetStep.classList.add('active');
  }
  currentStep = target;
  updateStepIndicators();

  // Cadre l'étape à l'arrivée. Sur l'étape Offres (6), on cale le BAS de
  // l'étape pour que le bouton "Procéder au paiement" soit visible ; sinon
  // on remonte en haut de l'étape.
  if (targetStep) {
    var scrollBlock = (String(target) === '6') ? 'end' : 'start';
    requestAnimationFrame(function() {
      try { targetStep.scrollIntoView({ behavior: 'smooth', block: scrollBlock }); }
      catch (_) { targetStep.scrollIntoView(); }
    });
  }
}
window.goToStep = goToStep;

// ==================== AVOCAT MODE ====================
var isAvocatMode = new URLSearchParams(window.location.search).get('avocat') === '1';

function submitAsAvocat() {
  saveFormData();
  var forme = document.getElementById('forme-juridique');
  var nomSociete = document.querySelector('.step-content[data-step="1"] input[placeholder="Nom de la soci\u00e9t\u00e9"]');
  var capital = document.getElementById('capital-social');

  var rawCollectedAv = collectFormDataForDocs();
  if (typeof attachRawSnapshots === 'function') attachRawSnapshots(rawCollectedAv);
  var formaliteData = {
    type: 'Cr\u00e9ation ' + (forme ? forme.value : 'SAS'),
    forme: forme ? forme.value : 'SAS',
    societe: nomSociete && nomSociete.value ? nomSociete.value : 'Sans nom',
    capital: capital ? parseFloat(capital.value) || 0 : 0,
    offer: 'business',
    phase: 1,
    data: rawCollectedAv
  };

  fetch('/api/formalites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formaliteData)
  }).then(function(r) { return r.json(); }).then(function(result) {
    if (result.ok) {
      try { localStorage.removeItem(SAVE_KEY); } catch(e) {}
      _currentFormaliteId = result.id;
      window.location.href = '/avocat.html';
    }
  }).catch(function(e) { console.error('Submit error:', e); if (typeof window.showToast === 'function') window.showToast('Erreur lors de la cr\u00e9ation'); else alert('Erreur lors de la cr\u00e9ation'); });
}
window.submitAsAvocat = submitAsAvocat;

// ==================== OFFER SELECTION & PAYMENT ====================
var selectedOffer = null;

function selectOffer(el) {
  // Ensure we get the card even if a child was clicked
  var card = el.closest ? el.closest('.pricing-card') : el;
  if (!card) return;
  document.querySelectorAll('.pricing-card').forEach(function(c) {
    c.classList.remove('selected');
  });
  card.classList.add('selected');
  selectedOffer = card.dataset.offer;
  document.getElementById('btn-submit-offer').disabled = false;
}
window.selectOffer = selectOffer;

// Wire up pricing buttons explicitly
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.pricing-select-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      selectOffer(btn);
    });
  });
});

// Attache les snapshots bruts (step 1 flat + step 2/3 panels + capital parts) sur l'objet data.
// IMPORTANT : on ne MET À JOUR un snapshot que si la section actuelle du DOM contient
// vraiment des données. Sinon on PRÉSERVE le snapshot précédent (sinon : si l'avocat ouvre
// le form sur step 1 et sauvegarde sans toucher aux dirigeants, on écraserait silencieusement
// les 3 dirigeants saved par un snapshot vide du panel initial vide).
function attachRawSnapshots(data) {
  if (!data || typeof data !== 'object') return;
  // Helper : un tableau est "non vide" si au moins UN field a une valeur non-vide
  function hasContent(arr) {
    if (!Array.isArray(arr) || !arr.length) return false;
    return arr.some(function(v) { return v != null && String(v).trim() !== ''; });
  }
  // Step 1 — flat list de tous les inputs/selects/textareas
  if (typeof collectStepFields === 'function') {
    try {
      var s1 = collectStepFields(1);
      if (hasContent(s1)) data._raw_step1 = s1;
      // sinon on garde data._raw_step1 existant (provenant du _serverLoadedData cache)
    } catch(_) {}
  }
  // Step 2 — associé panels (au moins un panel a un nom)
  var step2Panels = [];
  var step2HasContent = false;
  document.querySelectorAll('#associe-panels .associe-panel').forEach(function(panel) {
    var fields = panel.querySelectorAll('input:not([type="file"]), select, textarea');
    var arr = [];
    fields.forEach(function(fInp) { arr.push(fInp.value); });
    if (hasContent(arr)) step2HasContent = true;
    step2Panels.push(arr);
  });
  if (step2Panels.length && step2HasContent) data._raw_step2_panels = step2Panels;
  // Step 3 — dirigeant panels (au moins un select rempli OU un field rempli)
  var step3Panels = [];
  var step3HasContent = false;
  document.querySelectorAll('#dirigeant-panels .associe-panel').forEach(function(panel) {
    var sel = panel.querySelector('.dirigeant-panel-select');
    var fields = panel.querySelectorAll('input:not([type="file"]), select:not(.dirigeant-panel-select), textarea');
    var arr = [];
    fields.forEach(function(fInp) { arr.push(fInp.value); });
    var selVal = sel ? sel.value : '';
    if (selVal || hasContent(arr)) step3HasContent = true;
    step3Panels.push({ select: selVal, fields: arr });
  });
  if (step3Panels.length && step3HasContent) data._raw_step3_panels = step3Panels;
  // Step 4 — capital : parts + type d'apport + libération % + montant nature + description
  var capitalParts = [];
  var apportTypes = [];
  var liberations = [];
  var natureMontants = [];
  var natureDescs = [];
  var capitalHasContent = false;
  document.querySelectorAll('.capital-parts-input').forEach(function(inp) {
    capitalParts.push(inp.value);
    if (inp.value && parseFloat(inp.value) > 0) capitalHasContent = true;
  });
  document.querySelectorAll('.apport-type-select').forEach(function(s) { apportTypes.push(s.value); });
  document.querySelectorAll('.liberation-input').forEach(function(s) { liberations.push(s.value); });
  document.querySelectorAll('.apport-nature-montant').forEach(function(s) { natureMontants.push(s.value); });
  document.querySelectorAll('.apport-nature-desc').forEach(function(s) { natureDescs.push(s.value); });
  if (capitalParts.length && capitalHasContent) {
    data._raw_capital_parts = capitalParts;
    if (apportTypes.length) data._raw_apport_types = apportTypes;
    if (liberations.length) data._raw_liberations = liberations;
    if (natureMontants.length) data._raw_nature_montants = natureMontants;
    if (natureDescs.length) data._raw_nature_descs = natureDescs;
  }
  var totalPartsInp = document.getElementById('capital-total-parts');
  if (totalPartsInp && totalPartsInp.value && parseFloat(totalPartsInp.value) > 0) {
    data._raw_total_parts = totalPartsInp.value;
  }
}
window.attachRawSnapshots = attachRawSnapshots;

function startPayment() {
  var btn = document.getElementById('btn-submit-offer');
  var role = (window._currentUser && window._currentUser.role) || null;
  var roles = (window._currentUser && window._currentUser.roles) || (role ? [role] : []);
  var isAvocat = roles.indexOf('avocat') !== -1 || roles.indexOf('admin') !== -1;
  // Pour cr\u00e9ation initiale (pas d'id), il faut s\u00e9lectionner une offre. Pour update avocat sur
  // un dossier existant, l'offre est d\u00e9j\u00e0 fix\u00e9e \u2014 on saute le check.
  if (!selectedOffer && !(_currentFormaliteId && isAvocat)) return;

  if (btn && btn.dataset.busy === '1') return; // d\u00e9j\u00e0 en cours, anti double-clic
  if (btn) { btn.dataset.busy = '1'; btn.disabled = true; }

  // CAS 1 : formalit\u00e9 d\u00e9j\u00e0 cr\u00e9\u00e9e (idempotency)
  if (_currentFormaliteId) {
    if (!isAvocat) {
      // User ne peut pas modifier apr\u00e8s cr\u00e9ation \u2014 il doit contacter avocat/support
      if (btn) { btn.dataset.busy = ''; btn.disabled = false; }
      if (typeof window.showToast === 'function') window.showToast('Ce dossier est d\u00e9j\u00e0 cr\u00e9\u00e9. Contactez votre avocat pour le modifier.');
      else alert('Ce dossier a d\u00e9j\u00e0 \u00e9t\u00e9 cr\u00e9\u00e9. Pour le modifier, contactez votre avocat ou le support.');
      return;
    }
    // Avocat : UPDATE (pas de re-paiement)
    var dataAv;
    var prevCache = window._serverLoadedData;
    try {
      saveFormData();
      // Bypass le cache _serverLoadedData pour re-collecter depuis le formulaire (sinon les
      // modifs de l'avocat sont silencieusement ignorées)
      window._serverLoadedData = null;
      dataAv = collectFormDataForDocs();
      // Snapshot brut des champs pour pouvoir restaurer fidèlement au prochain chargement.
      try { attachRawSnapshots(dataAv); } catch(e) {}
      // Préserve les valeurs du cache quand le re-collect renvoie une valeur "vide"
      // (champs non-préremplis par le prefill — sinon on écraserait silencieusement les
      // données existantes par "-" / "" et le diff serveur afficherait des faux changements)
      function _isBlank(v) {
        return v === null || v === undefined || v === '' || v === '-' || v === false;
      }
      if (prevCache) {
        for (var pk in prevCache) {
          if (!(pk in dataAv) || (_isBlank(dataAv[pk]) && !_isBlank(prevCache[pk]))) {
            dataAv[pk] = prevCache[pk];
          }
        }
      }
      window._serverLoadedData = dataAv;
    } catch (collectErr) {
      console.error('[REVIEW] Erreur lors de la collecte des données du formulaire:', collectErr);
      window._serverLoadedData = prevCache;
      if (btn) { btn.dataset.busy = ''; btn.disabled = false; }
      if (typeof window.showToast === 'function') window.showToast('Impossible de lire le formulaire : ' + (collectErr && collectErr.message || 'erreur inconnue'));
      return;
    }
    fetch('/api/formalites/' + _currentFormaliteId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data_json: dataAv })
    }).then(function(r){
      return r.json().then(function(body){ return { status: r.status, body: body }; }).catch(function(){ return { status: r.status, body: null }; });
    }).then(function(res){
      if (btn) { btn.dataset.busy = ''; btn.disabled = false; }
      var body = res.body || {};
      if (res.status >= 200 && res.status < 300 && (body.ok || body.id || body.formalite)) {
        // Stocke les changements pour le badge "Modifi\u00e9" sur les docs
        window._lastReviewChanges = body.entries || [];
        // Si on est embarqu\u00e9 dans une iframe (drawer avocat), notifie le parent
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'formalist:formalite-updated', formaliteId: _currentFormaliteId, entries: body.entries || [] }, '*');
          }
        } catch (e) {}
        if (typeof window.regenerateDocs === 'function') {
          try { window.regenerateDocs(); } catch(e) { console.error(e); }
        }
        // Re-render les docs pour afficher les badges violets
        if (typeof window.markDocsAsModified === 'function') {
          try { window.markDocsAsModified(window._lastReviewChanges); } catch(e) { console.error(e); }
        }
        if (typeof window.showToast === 'function') {
          var n = (body.entries || []).length;
          window.showToast(n > 0 ? n + ' modification' + (n > 1 ? 's' : '') + ' \u00b7 Documents r\u00e9g\u00e9n\u00e9r\u00e9s' : 'Documents r\u00e9g\u00e9n\u00e9r\u00e9s');
        }
        // Bascule sur l'\u00e9tape 7 (Mes documents) pour voir les docs r\u00e9g\u00e9n\u00e9r\u00e9s
        if (typeof window.goToStep === 'function') {
          window.goToStep(7);
        }
      } else {
        var msg = body.error || body.message || ('Erreur ' + res.status);
        if (typeof window.showToast === 'function') window.showToast('Mise \u00e0 jour \u00e9chou\u00e9e : ' + msg);
      }
    }).catch(function(err){
      console.error('[REVIEW] Fetch error:', err);
      if (btn) { btn.dataset.busy = ''; btn.disabled = false; }
      if (typeof window.showToast === 'function') window.showToast('Erreur r\u00e9seau lors de la mise \u00e0 jour');
    });
    return;
  }

  // CAS 2 : cr\u00e9ation initiale (paiement classique)
  saveFormData();

  // Chaque offre = service + 180\u20AC d'annonce l\u00E9gale (+ frais de greffe pour
  // Business/Premium qui incluent l'immatriculation au Guichet Unique).
  var OFFERS = {
    starter:  { name: 'Starter',  service: 89,  annonce: 180, greffe: 0 },
    business: { name: 'Business', service: 345, annonce: 180, greffe: 55 },
    premium:  { name: 'Premium',  service: 545, annonce: 180, greffe: 55 }
  };
  var o = OFFERS[selectedOffer] || OFFERS.starter;
  var total = o.service + o.annonce + o.greffe;

  var overlay = document.getElementById('payment-overlay');
  overlay.classList.add('active');
  document.getElementById('payment-amount').textContent = total + '\u20AC HT';
  document.getElementById('payment-offer-label').textContent = 'Offre ' + o.name + ' \u00B7 ' + o.service + '\u20AC service + ' + o.annonce + '\u20AC annonce l\u00E9gale' + (o.greffe ? ' + ' + o.greffe + '\u20AC greffe' : '');

  var icon = document.getElementById('payment-icon');
  icon.className = 'payment-modal-icon loading';
  icon.innerHTML = '<div class="spinner"></div>';
  document.getElementById('payment-title').textContent = 'Paiement en cours...';
  document.getElementById('payment-msg').textContent = 'Veuillez patienter pendant le traitement de votre paiement.';

  setTimeout(function() {
    icon.className = 'payment-modal-icon success';
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    document.getElementById('payment-title').textContent = 'Paiement accept\u00e9 !';
    document.getElementById('payment-msg').textContent = 'Vos documents sont en cours de g\u00e9n\u00e9ration...';

    var forme = document.getElementById('forme-juridique');
    var nomSociete = document.querySelector('.step-content[data-step="1"] input[placeholder="Nom de la soci\u00e9t\u00e9"]');
    var capital = document.getElementById('capital-social');

    var rawCollected = collectFormDataForDocs();
    attachRawSnapshots(rawCollected);
    var formaliteData = {
      type: 'Cr\u00e9ation ' + (forme ? forme.value : 'SAS'),
      forme: forme ? forme.value : 'SAS',
      societe: nomSociete && nomSociete.value ? nomSociete.value : 'Sans nom',
      capital: capital ? parseFloat(capital.value) || 0 : 0,
      offer: selectedOffer,
      phase: 1,
      data: rawCollected
    };

    fetch('/api/formalites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formaliteData)
    }).then(function(r) { return r.json(); }).then(function(result) {
      if (result.ok) {
        try { localStorage.removeItem(SAVE_KEY); } catch(e) {}
        // Nettoie aussi l'entrée du registre brouillons (formalist_formalites)
        try {
          var REGISTRY_KEY = 'formalist_formalites';
          var raw = localStorage.getItem(REGISTRY_KEY);
          if (raw) {
            var reg = JSON.parse(raw) || [];
            reg = reg.filter(function(e) { return e.id !== SAVE_KEY; });
            localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
          }
        } catch (e) {}
        _currentFormaliteId = result.id;
        window._currentFormaliteId = result.id;
        history.replaceState(null, '', '/creation.html?id=' + result.id);
        // Maintenant qu'on a un id, refresh le label du bouton
        updateSubmitButtonLabel();
      }
    }).catch(function(e) {
      console.error('Persist error:', e);
      if (btn) { btn.dataset.busy = ''; btn.disabled = false; }
    });

    setTimeout(function() {
      overlay.classList.remove('active');
      buildRecapStep();
      if (currentStep < totalSteps && !isAnimating) {
        var from = currentStep;
        currentStep++;
        transitionStep(from, currentStep, 'next');
      }
    }, 1500);
  }, 2500);
}
window.startPayment = startPayment;

// Met \u00e0 jour le label du bouton selon contexte (cr\u00e9ation/mise \u00e0 jour/lecture seule)
function updateSubmitButtonLabel() {
  var btn = document.getElementById('btn-submit-offer');
  if (!btn) return;
  var role = (window._currentUser && window._currentUser.role) || null;
  var roles = (window._currentUser && window._currentUser.roles) || (role ? [role] : []);
  var isAvocat = roles.indexOf('avocat') !== -1 || roles.indexOf('admin') !== -1;

  if (_currentFormaliteId) {
    if (isAvocat) {
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Mettre \u00e0 jour et r\u00e9g\u00e9n\u00e9rer';
      btn.disabled = false;
      btn.removeAttribute('disabled');
      btn.dataset.busy = '';
      btn.onclick = function(e){
        e.preventDefault();
        if (typeof window.startPayment === 'function') {
          // En mode avocat sur un dossier existant, startPayment ex\u00e9cute la branche UPDATE
          // (PUT /api/formalites/:id) qui sauvegarde + r\u00e9g\u00e9n\u00e8re les docs sans passer par paiement.
          window.startPayment();
        }
      };
      // Affiche la banni\u00e8re de r\u00e9vision
      var banner = document.getElementById('review-banner');
      if (banner) {
        banner.style.display = 'flex';
        var clientEl = document.getElementById('review-banner-client');
        if (clientEl && window._serverLoadedData) {
          var societe = window._serverLoadedData.SOCIETE || window._serverLoadedData.societe || 'ce client';
          clientEl.textContent = societe;
        }
      }
      document.body.classList.add('review-mode');

      // En review mode, injecte un panneau "Mise à jour du dossier" dans l'étape 6 avec un
      // bouton tout neuf — on planque le btn-submit-offer original pour éviter tout effet de
      // bord (autre code qui pourrait le re-disabled).
      btn.style.display = 'none';
      var step6 = document.querySelector('.step-content[data-step="6"]');
      if (step6 && !step6.querySelector('#review-update-panel')) {
        var panel = document.createElement('div');
        panel.id = 'review-update-panel';
        panel.style.cssText = 'background:#fff;border:1px solid #ececec;border-radius:18px;padding:32px;margin-bottom:18px;';
        var clientName = (window._serverLoadedData && (window._serverLoadedData.NOM_SOCIETE || window._serverLoadedData.SOCIETE)) || '';
        panel.innerHTML =
          '<div style="display:flex;align-items:center;gap:14px;margin-bottom:22px;">' +
            '<div style="width:44px;height:44px;border-radius:12px;background:#f5f3ff;color:#7c3aed;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>' +
            '</div>' +
            '<div style="flex:1;">' +
              '<h2 style="margin:0;font-family:\'Cal Sans\',sans-serif;font-size:22px;color:#111;">Mise à jour du dossier</h2>' +
              '<p style="margin:2px 0 0;color:#666;font-size:13.5px;">' +
                (clientName ? 'Dossier ' + clientName.replace(/[<>&"']/g, '') + ' · ' : '') +
                'Appliquez vos modifications puis validez le dossier.' +
              '</p>' +
            '</div>' +
            '<div id="current-status-pill"></div>' +
          '</div>' +
          '<div style="background:#f9fafb;border-radius:12px;padding:16px 18px;font-size:13.5px;color:#555;line-height:1.6;margin-bottom:18px;">' +
            '<strong>1.</strong> Cliquez sur <strong>Mettre à jour et régénérer</strong> pour enregistrer vos modifications. ' +
            '<strong>2.</strong> Ensuite, choisissez une action ci-dessous : valider le dossier, demander des corrections au client ou le rejeter.' +
          '</div>' +
          '<div style="display:flex;justify-content:flex-end;margin-bottom:18px;">' +
            '<button id="review-update-btn" type="button" ' +
              'style="font-family:\'Matter\',\'Inter\',sans-serif;background:#7c3aed;color:#fff;padding:12px 28px;border-radius:100px;font-size:14px;font-weight:500;letter-spacing:0.2px;border:none;cursor:pointer;transition:all 0.2s ease;display:inline-flex;align-items:center;gap:8px;">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>' +
              'Mettre à jour et régénérer' +
            '</button>' +
          '</div>' +
          '<div style="border-top:1px solid #f0f0f0;padding-top:18px;">' +
            '<div style="font-size:13px;color:#666;font-weight:500;margin-bottom:10px;">Action sur le dossier</div>' +
            '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
              '<button data-transition="valide" type="button" ' +
                'style="flex:1;min-width:160px;font-family:inherit;background:#16a34a;color:#fff;padding:11px 18px;border-radius:12px;font-size:13.5px;font-weight:500;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:all 0.15s ease;">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>' +
                'Valider le dossier' +
              '</button>' +
              '<button data-transition="corrections_demandees" type="button" ' +
                'style="flex:1;min-width:160px;font-family:inherit;background:#f59e0b;color:#fff;padding:11px 18px;border-radius:12px;font-size:13.5px;font-weight:500;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:all 0.15s ease;">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>' +
                'Demander des corrections' +
              '</button>' +
              '<button data-transition="rejete" type="button" ' +
                'style="font-family:inherit;background:#fff;color:#dc2626;padding:11px 18px;border-radius:12px;font-size:13.5px;font-weight:500;border:1px solid #fecaca;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:all 0.15s ease;">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
                'Rejeter' +
              '</button>' +
            '</div>' +
          '</div>';
        var actions = step6.querySelector('.form-actions');
        if (actions) step6.insertBefore(panel, actions);
        else step6.appendChild(panel);
        var newBtn = panel.querySelector('#review-update-btn');
        if (newBtn) {
          newBtn.addEventListener('click', function(e){
            e.preventDefault();
            // Feedback visuel : spinner inline
            var originalHtml = newBtn.innerHTML;
            newBtn.disabled = true;
            newBtn.style.opacity = '0.7';
            newBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="animation:spin 0.8s linear infinite;"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Mise à jour…';
            // Réutilise startPayment (gère le PUT + regenerateDocs + toast)
            if (typeof window.startPayment === 'function') {
              window.startPayment();
              // Restore button après 4s quoi qu'il arrive
              setTimeout(function(){
                newBtn.disabled = false;
                newBtn.style.opacity = '';
                newBtn.innerHTML = originalHtml;
              }, 4000);
            }
          });
        }
        // Spinner keyframe injection (une seule fois)
        if (!document.getElementById('review-update-keyframes')) {
          var st = document.createElement('style');
          st.id = 'review-update-keyframes';
          st.textContent = '@keyframes spin { to { transform: rotate(360deg); } } #review-update-btn:hover { background:#6d28d9 !important; transform: translateY(-1px); } [data-transition]:hover { transform: translateY(-1px); filter:brightness(1.05); }';
          document.head.appendChild(st);
        }
        // Branche les boutons de transition de statut
        panel.querySelectorAll('[data-transition]').forEach(function(btnT) {
          btnT.addEventListener('click', function() {
            var target = btnT.getAttribute('data-transition');
            handleTransition(target, btnT);
          });
        });
        // Charge et affiche le statut courant
        loadCurrentStatusAndRender();
      }
    } else {
      // User sur dossier existant \u2192 mode consultation read-only + bouton "Demander une modification"
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> Demander une modification';
      btn.disabled = false;
      btn.title = 'Demander une modification \u00e0 votre avocat assign\u00e9';
      btn.onclick = function(e){
        e.preventDefault();
        if (typeof window.enterCorrectionMode === 'function') window.enterCorrectionMode();
        else if (typeof window.openContactAvocatModal === 'function') window.openContactAvocatModal();
        else window.location.href = '/messagerie.html?formalite=' + _currentFormaliteId;
      };
      // Active le mode read-only sur tout le formulaire
      document.body.classList.add('user-readonly');
      applyUserReadOnly();
      // Affiche la banni\u00e8re "Mode consultation"
      var userBanner = document.getElementById('user-readonly-banner');
      if (!userBanner) {
        userBanner = document.createElement('div');
        userBanner.id = 'user-readonly-banner';
        userBanner.style.cssText = 'background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:16px 20px;margin-bottom:18px;display:flex;align-items:center;gap:14px;';
        userBanner.innerHTML =
          '<div style="width:36px;height:36px;border-radius:10px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
          +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
          + '</div>'
          + '<div style="flex:1;">'
          +   '<div style="font-family:\'Cal Sans\',sans-serif;font-size:15.5px;font-weight:600;color:#1e3a8a;">Mode consultation</div>'
          +   '<div style="font-size:13px;color:#1e40af;margin-top:2px;">Vos informations ne sont plus modifiables. Pour corriger une information, utilisez le bouton <strong>Demander une modification</strong>.</div>'
          + '</div>';
        var formSection = document.getElementById('form-section');
        if (formSection && formSection.firstChild) {
          formSection.insertBefore(userBanner, formSection.firstChild);
        }
      }
      // Grise les pricing cards et bloque le clic (l'\u00e9tape 6 n'est pas pertinente pour le user)
      document.querySelectorAll('.pricing-card').forEach(function(card){
        card.classList.add('locked-paid');
        card.style.pointerEvents = 'none';
        card.style.opacity = '0.45';
        card.style.cursor = 'not-allowed';
      });
    }
  }
}
window.updateSubmitButtonLabel = updateSubmitButtonLabel;

// ─────────────────────────────────────────
// Transitions de statut côté avocat
// ─────────────────────────────────────────
var STATUS_META = {
  en_cours:               { label: 'En cours',                color: '#6b7280', bg: '#f3f4f6' },
  en_attente_validation:  { label: 'En attente de validation', color: '#1d4ed8', bg: '#dbeafe' },
  corrections_demandees:  { label: 'Corrections demandées',    color: '#92400e', bg: '#fef3c7' },
  valide:                 { label: 'Validé par l\'avocat',     color: '#15803d', bg: '#dcfce7' },
  rejete:                 { label: 'Rejeté',                   color: '#991b1b', bg: '#fee2e2' },
  terminee:               { label: 'Terminé',                  color: '#15803d', bg: '#dcfce7' },
};
window.STATUS_META = STATUS_META;

function renderStatusPill(status) {
  var meta = STATUS_META[status] || STATUS_META.en_cours;
  var html = '<span style="display:inline-flex;align-items:center;gap:6px;background:' + meta.bg + ';color:' + meta.color + ';font-size:12px;font-weight:600;padding:5px 11px;border-radius:100px;letter-spacing:0.2px;">' +
    '<span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span>' + meta.label + '</span>';
  ['current-status-pill', 'recap-status-pill'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}
window.renderStatusPill = renderStatusPill;

function loadCurrentStatusAndRender() {
  if (!_currentFormaliteId) return;
  fetch('/api/formalites/' + _currentFormaliteId).then(function(r){ return r.json(); }).then(function(data){
    if (data && data.formalite) renderStatusPill(data.formalite.status);
  }).catch(function(){});
}
window.loadCurrentStatusAndRender = loadCurrentStatusAndRender;

function handleTransition(targetStatus, triggerBtn) {
  if (!_currentFormaliteId) return;
  // Configuration du modal selon l'action
  var configs = {
    valide: {
      title: 'Valider le dossier',
      icon: '<polyline points="20 6 9 17 4 12"/>',
      iconBg: '#dcfce7', iconColor: '#15803d',
      desc: 'Le dossier sera marqué comme approuvé. Le client sera notifié et pourra procéder aux étapes suivantes.',
      commentLabel: 'Note interne (optionnelle)',
      commentRequired: false,
      ctaLabel: 'Valider le dossier',
      ctaBg: '#16a34a',
    },
    corrections_demandees: {
      title: 'Demander des corrections',
      icon: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>',
      iconBg: '#fef3c7', iconColor: '#92400e',
      desc: 'Le client recevra ce message dans sa messagerie et sera notifié des corrections à effectuer.',
      commentLabel: 'Décrivez les corrections à apporter',
      commentPlaceholder: 'Ex : Le capital social doit être de 5 000 € minimum pour cette forme juridique. Merci de modifier ce champ et de me notifier.',
      commentRequired: true,
      ctaLabel: 'Envoyer la demande',
      ctaBg: '#f59e0b',
    },
    rejete: {
      title: 'Rejeter le dossier',
      icon: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
      iconBg: '#fee2e2', iconColor: '#991b1b',
      desc: 'Cette action notifiera le client que son dossier est rejeté. Indiquez le motif pour qu\'il comprenne la raison.',
      commentLabel: 'Motif du rejet (optionnel)',
      commentPlaceholder: 'Ex : Les informations fournies ne sont pas conformes…',
      commentRequired: false,
      ctaLabel: 'Rejeter le dossier',
      ctaBg: '#dc2626',
    },
  };
  var cfg = configs[targetStatus];
  if (!cfg) {
    // Pas de modal pour les autres transitions (en_cours, en_attente_validation) — direct
    _doTransition(targetStatus, '', triggerBtn);
    return;
  }
  openTransitionModal(cfg, targetStatus, triggerBtn);
}
window.handleTransition = handleTransition;

function openTransitionModal(cfg, targetStatus, triggerBtn) {
  var old = document.getElementById('transition-modal');
  if (old) old.remove();
  var overlay = document.createElement('div');
  overlay.id = 'transition-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(17,17,17,0.55);backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  var requiredMark = cfg.commentRequired ? ' <span style="color:#dc2626;">*</span>' : '';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:18px;max-width:520px;width:100%;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 28px 80px rgba(0,0,0,0.3);">' +
      '<div style="padding:22px 26px 18px;display:flex;align-items:flex-start;gap:14px;">' +
        '<div style="width:42px;height:42px;border-radius:12px;background:' + cfg.iconBg + ';color:' + cfg.iconColor + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">' + cfg.icon + '</svg>' +
        '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-family:\'Cal Sans\',sans-serif;font-size:19px;font-weight:600;color:#111;letter-spacing:-0.2px;">' + cfg.title + '</div>' +
          '<div style="font-size:13px;color:#666;margin-top:4px;line-height:1.45;">' + cfg.desc + '</div>' +
        '</div>' +
        '<button type="button" id="transition-close" style="background:none;border:none;color:#999;cursor:pointer;font-size:22px;line-height:1;padding:2px 8px;">×</button>' +
      '</div>' +
      '<div style="padding:0 26px 18px;">' +
        '<label style="display:block;font-size:13px;font-weight:500;color:#555;margin-bottom:6px;">' + cfg.commentLabel + requiredMark + '</label>' +
        '<textarea id="transition-comment" placeholder="' + (cfg.commentPlaceholder || '').replace(/"/g, '&quot;') + '" style="width:100%;min-height:110px;padding:12px 14px;border:1px solid #e5e5e7;border-radius:10px;font-family:inherit;font-size:13.5px;line-height:1.5;resize:vertical;transition:border-color 0.15s;"></textarea>' +
        '<div id="transition-error" style="display:none;color:#dc2626;font-size:12px;margin-top:8px;"></div>' +
      '</div>' +
      '<div style="padding:14px 26px;border-top:1px solid #ececef;display:flex;justify-content:flex-end;gap:10px;background:#fafafa;">' +
        '<button type="button" id="transition-cancel" style="padding:10px 18px;background:#fff;border:1px solid #e5e5e7;border-radius:10px;font-family:inherit;font-size:13.5px;font-weight:500;color:#555;cursor:pointer;">Annuler</button>' +
        '<button type="button" id="transition-confirm" style="padding:10px 22px;background:' + cfg.ctaBg + ';border:none;border-radius:10px;font-family:inherit;font-size:13.5px;font-weight:600;color:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:8px;">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">' + cfg.icon + '</svg>' +
          cfg.ctaLabel +
        '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  var textarea = document.getElementById('transition-comment');
  var errorBox = document.getElementById('transition-error');
  setTimeout(function() { textarea && textarea.focus(); }, 50);
  textarea && textarea.addEventListener('focus', function(){ textarea.style.borderColor = cfg.ctaBg; });
  textarea && textarea.addEventListener('blur', function(){ textarea.style.borderColor = '#e5e5e7'; });
  document.getElementById('transition-close').addEventListener('click', function(){ overlay.remove(); });
  document.getElementById('transition-cancel').addEventListener('click', function(){ overlay.remove(); });
  document.getElementById('transition-confirm').addEventListener('click', function() {
    var val = (textarea && textarea.value || '').trim();
    if (cfg.commentRequired && !val) {
      if (errorBox) { errorBox.textContent = 'Veuillez décrire les corrections à apporter.'; errorBox.style.display = 'block'; }
      textarea.style.borderColor = '#dc2626';
      textarea.focus();
      return;
    }
    overlay.remove();
    _doTransition(targetStatus, val, triggerBtn);
  });
}
window.openTransitionModal = openTransitionModal;

function _doTransition(targetStatus, comment, triggerBtn) {
  if (!_currentFormaliteId) {
    if (typeof window.showToast === 'function') window.showToast('Aucun dossier identifié. Rechargez la page.');
    else alert('Erreur : aucun dossier identifié. Rechargez la page.');
    return;
  }
  var orig;
  if (triggerBtn) {
    orig = triggerBtn.innerHTML;
    triggerBtn.disabled = true;
    triggerBtn.style.opacity = '0.7';
    triggerBtn.innerHTML = 'Envoi…';
  }
  // Garantit que le bouton est ré-activé même si quelque chose va de travers
  var resetButton = function() {
    if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.style.opacity = ''; if (orig !== undefined) triggerBtn.innerHTML = orig; }
  };
  // Timeout 15s pour éviter un bouton bloqué indéfiniment si fetch hangs
  var timeoutId = setTimeout(function() {
    console.error('[TRANSITION] Timeout dépassé après 15s');
    resetButton();
    if (typeof window.showToast === 'function') window.showToast('Délai dépassé · Vérifiez la connexion');
    else alert('Délai dépassé · Vérifiez la connexion');
  }, 15000);
  fetch('/api/formalites/' + _currentFormaliteId + '/transition', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ status: targetStatus, comment: comment || undefined })
  }).then(function(r){
    return r.json().then(function(body){ return { status: r.status, body: body }; }).catch(function(){ return { status: r.status, body: null }; });
  }).then(function(res) {
    clearTimeout(timeoutId);
    resetButton();
    var body = res.body || {};
    if (res.status >= 200 && res.status < 300 && body.ok) {
      if (typeof renderStatusPill === 'function') renderStatusPill(targetStatus);
      var toastMsg = ({
        valide: 'Dossier validé · Client notifié',
        corrections_demandees: 'Corrections demandées · Message envoyé au client',
        rejete: 'Dossier rejeté · Client notifié',
        en_cours: 'Dossier remis en cours',
        en_attente_validation: 'Dossier en attente de validation',
      })[targetStatus] || 'Statut mis à jour';
      if (typeof window.showToast === 'function') window.showToast(toastMsg);
      // Notifie le parent iframe (avocat.html) pour rafraîchir
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'formalist:status-changed', formaliteId: _currentFormaliteId, status: targetStatus }, '*');
        }
      } catch (e) {}
    } else {
      var errMsg = (body && (body.error || body.message)) || ('Erreur ' + res.status);
      console.error('[TRANSITION] Erreur:', errMsg);
      if (typeof window.showToast === 'function') window.showToast('Erreur : ' + errMsg);
      else alert('Erreur : ' + errMsg);
    }
  }).catch(function(err){
    clearTimeout(timeoutId);
    console.error('[TRANSITION] Fetch error:', err);
    resetButton();
    if (typeof window.showToast === 'function') window.showToast('Erreur réseau · ' + (err && err.message || ''));
    else alert('Erreur réseau · ' + (err && err.message || ''));
  });
}
window._doTransition = _doTransition;

// Bandeau de passation : si l'avocat courant a pris la suite d'un autre avocat,
// on affiche un bandeau discret indiquant l'avocat précédent et le nb de modifs déjà loggées.
function maybeShowHandoverBanner(auditEntries) {
  if (!auditEntries || !auditEntries.length) return;
  var role = (window._currentUser && window._currentUser.role) || null;
  var roles = (window._currentUser && window._currentUser.roles) || (role ? [role] : []);
  var isAvocat = roles.indexOf('avocat') !== -1 || roles.indexOf('admin') !== -1;
  if (!isAvocat) return;
  // Cherche la dernière entrée avocat_assigned (la plus récente — entries DESC par created_at)
  var lastAssign = null;
  for (var i = 0; i < auditEntries.length; i++) {
    if (auditEntries[i].action === 'avocat_assigned') { lastAssign = auditEntries[i]; break; }
  }
  if (!lastAssign) return;
  // before = nom avocat précédent (peut être null), after = nom avocat actuel
  var prevName = lastAssign.before_value;
  if (!prevName) return; // pas une vraie passation (1re assignation)
  // Compte les field_updates faits par cet avocat précédent
  var prevModifs = auditEntries.filter(function(e) {
    return e.action === 'field_update' && e.actor_name === prevName;
  }).length;
  // Évite les doublons
  if (document.getElementById('handover-banner')) return;
  var banner = document.createElement('div');
  banner.id = 'handover-banner';
  banner.style.cssText = 'background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;gap:14px;';
  banner.innerHTML =
    '<div style="width:36px;height:36px;border-radius:10px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/><path d="M9 22H5a2 2 0 01-2-2V4a2 2 0 012-2h4"/></svg>' +
    '</div>' +
    '<div style="flex:1;">' +
      '<div style="font-family:\'Cal Sans\',sans-serif;font-size:14.5px;font-weight:600;color:#1e3a8a;">Dossier repris de ' + prevName.replace(/[<>&]/g, '') + '</div>' +
      '<div style="font-size:12.5px;color:#1e40af;margin-top:1px;">' +
        (prevModifs > 0 ? prevModifs + ' modification' + (prevModifs > 1 ? 's' : '') + ' précédente' + (prevModifs > 1 ? 's' : '') + ' visible' + (prevModifs > 1 ? 's' : '') + ' dans l\'historique des documents.' : 'Consultez l\'historique des modifications via les badges des documents.') +
      '</div>' +
    '</div>';
  var formSection = document.getElementById('form-section');
  if (formSection && formSection.firstChild) {
    formSection.insertBefore(banner, formSection.firstChild);
  }
}
window.maybeShowHandoverBanner = maybeShowHandoverBanner;

// Applique le read-only à tous les champs du formulaire (mode consultation user)
function applyUserReadOnly() {
  // Champs texte/nombre/date → readonly (préserve la valeur, empêche l'édition)
  document.querySelectorAll('.step-content input:not([type="file"]):not([type="checkbox"]):not([type="radio"]), .step-content textarea').forEach(function(el) {
    el.readOnly = true;
    el.setAttribute('tabindex', '-1');
  });
  // Selects et checkboxes → disabled (pas de readonly natif sur ces éléments)
  document.querySelectorAll('.step-content select, .step-content input[type="checkbox"], .step-content input[type="radio"]').forEach(function(el) {
    el.disabled = true;
  });
  // Cache les boutons d'action interne (ajouter associé, supprimer, IA, etc.)
  document.querySelectorAll('.step-content .add-associate, .step-content .remove-associate, .step-content .ai-generate-btn, .step-content [data-readonly-hide]').forEach(function(el){
    el.style.display = 'none';
  });
}
window.applyUserReadOnly = applyUserReadOnly;

// ==================== AUTO-SAVE ====================

// Override buildCapitalStep to restore EVERYTHING : parts + total + apport-type + libération +
// montant apport nature + description nature, depuis le snapshot brut puis depuis les clés
// sémantiques en fallback. Tout ce qui peut être restauré est restauré, pour zéro perte.
function _parseFrNum(raw) {
  if (raw == null || raw === '' || raw === '-') return null;
  var num = parseFloat(String(raw).replace(/\s| /g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return isNaN(num) ? null : num;
}
var _origBuildCapitalStep = buildCapitalStep;
buildCapitalStep = function() {
  _origBuildCapitalStep();
  var data = window._serverLoadedData || null;
  // ── 1. PARTS par associé ──────────────────────────────────────────
  var inputs = document.querySelectorAll('.capital-parts-input');
  if (window._savedCapitalParts && window._savedCapitalParts.length) {
    inputs.forEach(function(inp, i) {
      if (i < window._savedCapitalParts.length) inp.value = window._savedCapitalParts[i];
    });
    window._savedCapitalParts = [];
  } else if (data) {
    inputs.forEach(function(inp, i) {
      var num = _parseFrNum(data['NB_PARTS_' + (i + 1)]);
      if (num != null && num > 0) inp.value = num;
    });
  }
  // ── 2. TOTAL des parts ───────────────────────────────────────────
  var totalInp = document.getElementById('capital-total-parts');
  if (totalInp) {
    if (window._savedTotalParts) {
      totalInp.value = window._savedTotalParts;
      window._savedTotalParts = null;
    } else if (data && data.NB_PARTS) {
      var t = _parseFrNum(data.NB_PARTS);
      if (t != null && t > 0) totalInp.value = t;
    }
  }
  // ── 3. Type d'apport (Numéraire / Nature / Mixte) + Libération % + Apport nature montant/desc ─
  var typeSelects = document.querySelectorAll('.apport-type-select');
  var libInputs = document.querySelectorAll('.liberation-input');
  var natureMontants2 = document.querySelectorAll('.apport-nature-montant');
  var natureDescs2 = document.querySelectorAll('.apport-nature-desc');
  // Priorité aux snapshots bruts
  if (data && data._raw_apport_types && data._raw_apport_types.length) {
    typeSelects.forEach(function(sel, i) {
      var v = data._raw_apport_types[i];
      if (v) {
        if (typeof window.setSelect === 'function') window.setSelect(sel, v);
        else { sel.value = v; try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {} }
      }
    });
  } else if (data) {
    // Fallback sémantique : déduit "Numéraire / Nature / Mixte" depuis HAS_APPORT_NATURE_$N + montants
    typeSelects.forEach(function(sel, i) {
      var idx = i + 1;
      var hasNature = data['HAS_APPORT_NATURE_' + idx];
      var numeraire = _parseFrNum(data['APPORT_NUMERAIRE_' + idx]) || 0;
      var nature = _parseFrNum(data['APPORTS_NATURE_' + idx]) || 0;
      var typeVal = 'Numéraire';
      if (hasNature && nature > 0 && numeraire > 0) typeVal = 'Mixte';
      else if (hasNature && nature > 0) typeVal = 'Nature';
      if (typeof window.setSelect === 'function') window.setSelect(sel, typeVal);
      else { sel.value = typeVal; try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {} }
    });
  }
  if (data && data._raw_liberations && data._raw_liberations.length) {
    libInputs.forEach(function(inp, i) { if (data._raw_liberations[i] != null) inp.value = data._raw_liberations[i]; });
  } else if (data) {
    libInputs.forEach(function(inp, i) {
      var pct = _parseFrNum(data['PCT_LIBERATION_' + (i + 1)]);
      if (pct != null && pct >= 0 && pct <= 100) inp.value = pct;
    });
  }
  if (data && data._raw_nature_montants && data._raw_nature_montants.length) {
    natureMontants2.forEach(function(inp, i) { if (data._raw_nature_montants[i] != null) inp.value = data._raw_nature_montants[i]; });
  } else if (data) {
    natureMontants2.forEach(function(inp, i) {
      var m = _parseFrNum(data['APPORTS_NATURE_' + (i + 1)]);
      if (m != null && m > 0) inp.value = m;
    });
  }
  if (data && data._raw_nature_descs && data._raw_nature_descs.length) {
    natureDescs2.forEach(function(t, i) { if (data._raw_nature_descs[i] != null) t.value = data._raw_nature_descs[i]; });
  } else if (data) {
    natureDescs2.forEach(function(t, i) {
      var d = data['DESC_APPORT_NATURE_' + (i + 1)];
      if (d && d !== '-') t.value = d;
    });
  }
  // ── 4. Refresh affichage donut + totaux + custom selects ────────
  if (typeof updateCapitalDistribution === 'function') updateCapitalDistribution();
  if (typeof window.refreshAllCustomTriggers === 'function') window.refreshAllCustomTriggers();
};

// Auto-save every 5 seconds
setInterval(function() {
  if (document.getElementById('form-section').classList.contains('active')) {
    saveFormData();
  }
}, 5000);

// Save on page unload (refresh, close, navigate away)
window.addEventListener('beforeunload', function() {
  if (document.getElementById('form-section').classList.contains('active')) {
    saveFormData();
  }
});

// Auto-save on every input change (debounced)
var _autoSaveTimer = null;
document.addEventListener('input', function() {
  if (!document.getElementById('form-section').classList.contains('active')) return;
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(saveFormData, 500);
});
document.addEventListener('change', function() {
  if (!document.getElementById('form-section').classList.contains('active')) return;
  saveFormData();
});

// ==================== LOAD SAVED DATA ON PAGE LOAD ====================
document.addEventListener('DOMContentLoaded', function() {
  var urlParams = new URLSearchParams(window.location.search);
  // New form explicitly requested - clear saved data and start fresh
  if (urlParams.get('new')) {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(getLcKey());
      localStorage.removeItem('formalist_lifecycle');
    } catch(e) {}
    // Remove ?new from URL so refresh won't clear again
    urlParams.delete('new');
    var clean = urlParams.toString();
    var newUrl = window.location.pathname + (clean ? '?' + clean : '');
    window.history.replaceState({}, '', newUrl);
    return;
  }
  // If we have an existing formalite ID, load from server
  var formaliteId = urlParams.get('id');
  if (formaliteId) {
    _currentFormaliteId = parseInt(formaliteId);
    window._currentFormaliteId = _currentFormaliteId;
    // Force le bouton enable immédiatement — pas d'attente du fetch /api/auth/me ou /api/formalites.
    // updateSubmitButtonLabel raffinera le label dès que _currentUser/data sont prêts.
    var _earlyBtn = document.getElementById('btn-submit-offer');
    if (_earlyBtn) {
      _earlyBtn.disabled = false;
      _earlyBtn.removeAttribute('disabled');
      _earlyBtn.dataset.busy = '';
    }
    loadFormaliteFromServer(parseInt(formaliteId));
    // Met à jour le label du bouton (Payer → Mise à jour si avocat, ou disabled si user)
    // Attend que _currentUser soit chargé via common.js
    setTimeout(updateSubmitButtonLabel, 500);
    setTimeout(updateSubmitButtonLabel, 1500);
    return;
  }
  // Otherwise restore in-progress form from localStorage
  loadFormData();
  // Applique le mode verrouillé au chargement (si dossier déjà payé)
  setTimeout(function() {
    if (typeof window.applyLockedMode === 'function') window.applyLockedMode();
  }, 200);
  // Cas de récupération : draft restauré à l'étape 7 sans formaliteId serveur
  // → le précédent POST de paiement a échoué (bug serveur). On tente automatiquement
  // un POST de récupération pour créer la formalité sans demander de re-paiement.
  setTimeout(function() {
    if (currentStep !== 7 || _currentFormaliteId) return;
    var rawCollected = collectFormDataForDocs();
    var formeEl = document.getElementById('forme-juridique');
    var nomEl = document.querySelector('.step-content[data-step="1"] input[placeholder="Nom de la société"]');
    var capitalEl = document.getElementById('capital-social');
    var recoveryData = {
      type: 'Création ' + (formeEl ? formeEl.value : 'SAS'),
      forme: formeEl ? formeEl.value : 'SAS',
      societe: nomEl && nomEl.value ? nomEl.value : 'Sans nom',
      capital: capitalEl ? parseFloat(capitalEl.value) || 0 : 0,
      offer: selectedOffer || 'business',
      phase: 1,
      data: rawCollected
    };
    fetch('/api/formalites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recoveryData)
    }).then(function(r) { return r.json(); }).then(function(result) {
      if (result && result.ok) {
        _currentFormaliteId = result.id;
        window._currentFormaliteId = result.id;
        history.replaceState(null, '', '/creation.html?id=' + result.id);
        // Nettoie le brouillon localStorage maintenant qu'on a un id serveur
        try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
        try {
          var REG = 'formalist_formalites';
          var raw = localStorage.getItem(REG);
          if (raw) {
            var reg = JSON.parse(raw) || [];
            reg = reg.filter(function(e) { return e.id !== SAVE_KEY; });
            localStorage.setItem(REG, JSON.stringify(reg));
          }
        } catch (e) {}
        if (typeof showToast === 'function') showToast('Formalité récupérée');
        // Re-render l'étape 7 pour rafraîchir le contenu lifecycle (recap, docs, etc.)
        if (typeof loadLifecycle === 'function' && typeof enterPhase === 'function') {
          var lc = loadLifecycle();
          enterPhase(lc.phase || 1);
        }
      } else {
        // POST a abouti mais a renvoyé une erreur → on ramène à l'étape 6
        if (typeof showToast === 'function') showToast('Le paiement précédent n’a pas abouti. Reconfirmez votre offre.');
        if (typeof goToStep === 'function') goToStep(6);
      }
    }).catch(function(e) {
      console.error('Recovery POST error:', e);
      if (typeof showToast === 'function') showToast('Erreur de récupération. Reconfirmez votre offre.');
      if (typeof goToStep === 'function') goToStep(6);
    });
  }, 400);
});

// ==================== TEST DATA PREFILL ====================
function prefillTestData() {
  // Clear any saved data first
  try { localStorage.removeItem(SAVE_KEY); } catch(e) {}

  // Show form, hide intro
  document.getElementById('intro').style.display = 'none';
  document.getElementById('form-section').classList.add('active');

  // === STEP 1 : Informations generales ===
  var step1 = document.querySelector('.step-content[data-step="1"]');
  var fields1 = step1.querySelectorAll('input:not([type="file"]), select, textarea');
  var step1Values = [
    'SAS',                          // Forme juridique
    'SAS FORMALIST TEST',           // Nom de la societe
    '12 Rue de la Paix',            // Adresse
    'Paris',                        // Ville
    '75002',                        // Code postal
    'Locaux lou\u00e9s au nom de la soci\u00e9t\u00e9', // Mode domiciliation
    '10000',                        // Capital social
    'Qonto',                        // Banque
    '2026-03-01',                   // Date debut activite
    '2026-12-31',                   // Date cloture
    '99',                           // Duree de vie
    'IS',                           // Option fiscale
    'Je ne sais pas',               // Regime TVA
    'Conseil en informatique, d\u00e9veloppement de logiciels et applications web et mobiles. Formation professionnelle dans le domaine du num\u00e9rique.' // Activite
  ];
  fields1.forEach(function(f, i) {
    if (i < step1Values.length) f.value = step1Values[i];
  });

  // === STEP 2 : Associes ===
  // Associe 1 is already present
  var panel1 = document.querySelector('#associe-panels .associe-panel[data-panel="1"]');
  var f1 = panel1.querySelectorAll('input:not([type="file"]), select, textarea');
  var associe1Values = [
    'Monsieur',                     // Civilite
    'Jean',                         // Prenom
    'Dupont',                       // Nom
    'Personne physique',            // Type
    'jean.dupont@test.com',         // Email
    '15 Avenue des Champs-\u00c9lys\u00e9es, 75008 Paris', // Adresse
    '1985-06-15',                   // Date de naissance
    'Lyon',                         // Ville de naissance
    '69001',                        // Code postal naissance
    'France',                       // Pays de naissance
    'Dupont Pierre',               // Nom pere
    'Martin Marie',                // Nom mere
    'Fran\u00e7aise',                   // Nationalite
    'C\u00e9libataire'                  // Situation matrimoniale
  ];
  f1.forEach(function(f, i) {
    if (i < associe1Values.length) f.value = associe1Values[i];
  });
  var prenomInput1 = panel1.querySelector('input[data-field="prenom"]');
  if (prenomInput1) updateTabName(prenomInput1);

  // Add associe 2
  addAssocie();
  var panel2 = document.querySelector('#associe-panels .associe-panel[data-panel="2"]');
  var f2 = panel2.querySelectorAll('input:not([type="file"]), select, textarea');
  var associe2Values = [
    'Madame',                       // Civilite
    'Sophie',                       // Prenom
    'Martin',                       // Nom
    'Personne physique',            // Type
    'sophie.martin@test.com',       // Email
    '8 Rue du Commerce, 75015 Paris', // Adresse
    '1990-03-22',                   // Date de naissance
    'Marseille',                    // Ville de naissance
    '13001',                        // Code postal naissance
    'France',                       // Pays de naissance
    'Martin Jacques',              // Nom pere
    'Leroy Catherine',             // Nom mere
    'Fran\u00e7aise',                   // Nationalite
    'C\u00e9libataire'                  // Situation matrimoniale
  ];
  f2.forEach(function(f, i) {
    if (i < associe2Values.length) f.value = associe2Values[i];
  });
  var prenomInput2 = panel2.querySelector('input[data-field="prenom"]');
  if (prenomInput2) updateTabName(prenomInput2);

  // === STEP 3 : Dirigeants ===
  updateDirigeantLabels();
  refreshDirigeantSelects();
  var sel1 = document.getElementById('select-dirigeant-1');
  if (sel1) {
    sel1.value = 'associe-0';
    onDirigeantChange(sel1, 'dirigeant-form-1');
  }

  // === STEP 4 : Capital ===
  var tpInput = document.getElementById('capital-total-parts');
  if (tpInput) tpInput.value = '1000';

  // Navigate to step 5 (build step 4 first for data integrity)
  currentStep = 4;
  buildCapitalStep();
  // Set parts: 600 for Jean, 400 for Sophie
  var partsInputs = document.querySelectorAll('.capital-parts-input');
  if (partsInputs.length >= 2) {
    partsInputs[0].value = '600';
    partsInputs[1].value = '400';
    updateCapitalDistribution();
  }

  // Save data
  saveFormData();

  // Navigate to step 6 (Offres - the step before payment)
  currentStep = 6;
  document.querySelectorAll('.step-content').forEach(function(c) {
    c.classList.remove('active', 'enter-from-left');
    c.style.display = 'none';
  });
  var target = document.querySelector('.step-content[data-step="6"]');
  if (target) {
    target.style.display = '';
    target.classList.add('active');
  }
  updateStepIndicators();
  saveFormData();

}
window.prefillTestData = prefillTestData;

function prefillSASUExample() {
  // --- STEP 1: Societe ---
  var step1 = document.querySelector('.step-content[data-step="1"]');
  setSelect(document.getElementById('forme-juridique'), 'SASU');

  var nomInput = step1.querySelector('input[placeholder="Nom de la soci\u00e9t\u00e9"]');
  if (nomInput) nomInput.value = 'TECH SOLUTIONS';

  var adresseInput = step1.querySelector('input[placeholder="Adresse compl\u00e8te"]');
  if (adresseInput) adresseInput.value = '15 Rue de la Paix';

  var villeInput = step1.querySelector('input[placeholder="Ville"]');
  if (villeInput) villeInput.value = 'Paris';

  var cpInput = step1.querySelector('input[placeholder="Code postal"]');
  if (cpInput) cpInput.value = '75002';

  setSelect(document.getElementById('mode-domiciliation'), 'Domicile personnel du dirigeant');

  var capitalInput = document.getElementById('capital-social');
  if (capitalInput) capitalInput.value = '1000';

  setSelect(document.getElementById('banque-select'), 'Qonto');

  var dateInputs = step1.querySelectorAll('input[type="date"]');
  if (dateInputs[0]) dateInputs[0].value = '2026-04-01';
  if (dateInputs[1]) dateInputs[1].value = '2026-12-31';

  var dureeInput = step1.querySelector('input[type="number"]:not(#capital-social)');
  if (dureeInput) dureeInput.value = '99';

  // Option fiscale & TVA
  step1.querySelectorAll('.field select').forEach(function(sel) {
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === 'IS') { setSelect(sel, 'IS'); break; }
    }
    for (var j = 0; j < sel.options.length; j++) {
      if (sel.options[j].textContent.trim() === 'Franchise en base de TVA') {
        setSelect(sel, sel.options[j].value); break;
      }
    }
  });

  var textarea = document.getElementById('activite-textarea');
  if (textarea) textarea.value = 'Le conseil et la prestation de services en informatique\nLe d\u00e9veloppement de logiciels et applications web et mobiles\nLa formation professionnelle dans le domaine du num\u00e9rique';

  // --- STEP 2: Associe unique ---
  var panel1 = document.querySelector('#associe-panels .associe-panel[data-panel="1"]');
  if (panel1) {
    var selects = panel1.querySelectorAll('select');
    setSelect(selects[0], 'Monsieur');
    setSelect(selects[1], 'Personne physique');

    var prenom = panel1.querySelector('input[data-field="prenom"]');
    if (prenom) { prenom.value = 'Jean'; prenom.dispatchEvent(new Event('input', { bubbles: true })); }

    var nom = panel1.querySelector('input[data-field="nom"]');
    if (nom) { nom.value = 'DUPONT'; nom.dispatchEvent(new Event('input', { bubbles: true })); }

    var email = panel1.querySelector('input[data-field="email"]');
    if (email) email.value = 'jean.dupont@email.com';

    var adresse = panel1.querySelector('input.addr-auto');
    if (adresse) adresse.value = '42 Avenue des Champs-\u00c9lys\u00e9es, 75008 Paris';

    var dateNaissance = panel1.querySelector('input[type="date"]');
    if (dateNaissance) dateNaissance.value = '1985-06-15';

    var villeNaissance = panel1.querySelector('input.city-birth-auto');
    if (villeNaissance) villeNaissance.value = 'Lyon';

    var cpNaissance = panel1.querySelector('input.cp-birth');
    if (cpNaissance) cpNaissance.value = '69001';

    var paysNaissance = panel1.querySelector('input.pays-birth');
    if (paysNaissance) paysNaissance.value = 'France';

    panel1.querySelectorAll('input').forEach(function(inp) {
      if (inp.placeholder && inp.placeholder.indexOf('p\u00e8re') !== -1) inp.value = 'Pierre DUPONT';
      if (inp.placeholder && inp.placeholder.indexOf('m\u00e8re') !== -1) inp.value = 'Marie MARTIN';
    });

    var natInput = panel1.querySelector('input[value="Fran\u00e7aise"]');
    if (natInput) natInput.value = 'Fran\u00e7aise';

    setSelect(panel1.querySelector('select.sit-mat-select'), 'C\u00e9libataire');
  }

  // --- STEP 3: Dirigeant = Associe 1 ---
  setTimeout(function() {
    refreshDirigeantSelects();
    var dirSelect = document.getElementById('select-dirigeant-1');
    if (dirSelect) {
      for (var i = 0; i < dirSelect.options.length; i++) {
        if (dirSelect.options[i].value === 'associe-0') {
          setSelect(dirSelect, 'associe-0');
          break;
        }
      }
    }

    // Remuneration et regime social
    var dirPanel = document.querySelector('#dirigeant-panels .associe-panel[data-panel="1"]');
    if (dirPanel) {
      dirPanel.querySelectorAll('select').forEach(function(sel) {
        for (var i = 0; i < sel.options.length; i++) {
          if (sel.options[i].textContent.trim() === 'D\u00e9termin\u00e9e ult\u00e9rieurement') { setSelect(sel, sel.options[i].value); }
          if (sel.options[i].textContent.trim() === 'Assimil\u00e9 salari\u00e9') { setSelect(sel, sel.options[i].value); }
        }
      });
    }

    // --- DG Example: Add a Directeur General ---
    addDirigeant();
    setTimeout(function() {
      var dgSelect = document.getElementById('select-dirigeant-2');
      if (dgSelect) {
        setSelect(dgSelect, 'autre');
        onDirigeantChange(dgSelect, 'dirigeant-form-2');
      }
      var dgForm = document.getElementById('dirigeant-form-2');
      if (dgForm) {
        var dgPanel = dgForm.querySelector('.dirigeant-type-panel.active');
        if (dgPanel) {
          var dgSelects = dgPanel.querySelectorAll('select');
          var dgInputs = dgPanel.querySelectorAll('input');
          if (dgSelects[0]) setSelect(dgSelects[0], 'Madame');
          if (dgInputs[0]) dgInputs[0].value = 'Marie';
          if (dgInputs[1]) dgInputs[1].value = 'Martin';
          if (dgInputs[2]) dgInputs[2].value = '15 Rue de la Paix, 75002 Paris';
          if (dgInputs[3]) dgInputs[3].value = '1990-03-22';
          if (dgInputs[4]) dgInputs[4].value = 'Marseille';
          if (dgInputs[5]) dgInputs[5].value = '13001';
          if (dgInputs[6]) dgInputs[6].value = 'France';
          if (dgInputs[7]) dgInputs[7].value = 'Jean MARTIN';
          if (dgInputs[8]) dgInputs[8].value = 'Sophie DURAND';
          if (dgInputs[9]) dgInputs[9].value = 'Fran\u00e7aise';
          if (dgSelects[1]) setSelect(dgSelects[1], 'C\u00e9libataire');
        }
      }
      // --- DG2 Example: personne morale ---
      addDirigeant();
      setTimeout(function() {
        var dg2Select = document.getElementById('select-dirigeant-3');
        if (dg2Select) {
          setSelect(dg2Select, 'autre');
          onDirigeantChange(dg2Select, 'dirigeant-form-3');
        }
        var dg2Form = document.getElementById('dirigeant-form-3');
        if (dg2Form) {
          // Switch to personne morale
          var moraleBtn = dg2Form.querySelectorAll('.type-btn')[1];
          if (moraleBtn) moraleBtn.click();
          setTimeout(function() {
            var dg2Panel = dg2Form.querySelector('.dirigeant-type-panel.active');
            if (dg2Panel) {
              var dg2Selects = dg2Panel.querySelectorAll('select');
              var dg2Inputs = dg2Panel.querySelectorAll('input');
              if (dg2Inputs[0]) dg2Inputs[0].value = 'TECH SOLUTIONS';
              if (dg2Inputs[1]) dg2Inputs[1].value = '8 Boulevard Haussmann, 75009 Paris';
              if (dg2Inputs[2]) dg2Inputs[2].value = '50 000';
              if (dg2Inputs[3]) dg2Inputs[3].value = '987 654 321';
              if (dg2Inputs[4]) dg2Inputs[4].value = 'Paris';
              if (dg2Inputs[5]) dg2Inputs[5].value = 'SAS';
              if (dg2Inputs[6]) dg2Inputs[6].value = '987654321';
              if (dg2Selects[0]) setSelect(dg2Selects[0], 'Monsieur');
              if (dg2Inputs[7]) dg2Inputs[7].value = 'Pierre';
              if (dg2Inputs[8]) dg2Inputs[8].value = 'Durand';
              if (dg2Inputs[9]) dg2Inputs[9].value = '20 Rue de Rivoli, 75004 Paris';
            }
            // Switch back to tab 1
            switchDirigeantTab(1);
          }, 50);
        }
      }, 50);
    }, 100);

    // --- STEP 4: Capital ---
    buildCapitalStep();
    var totalParts = document.getElementById('capital-total-parts');
    if (totalParts) {
      totalParts.value = 1000;
      totalParts.dispatchEvent(new Event('input', { bubbles: true }));
    }
    var partsInputs = document.querySelectorAll('.capital-parts-input');
    if (partsInputs[0]) {
      partsInputs[0].value = 1000;
      partsInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Prefill apport: Numeraire, 100% liberation
    var apportSelect = document.querySelector('.apport-type-select[data-index="0"]');
    if (apportSelect) apportSelect.value = 'Num\u00e9raire';
    var libInput = document.querySelector('.liberation-input[data-index="0"]');
    if (libInput) libInput.value = 100;
    updateCapitalDistribution();

    // Refresh all custom UI elements
    refreshAllCustomTriggers();

    // --- Navigate to Step 6 (Offres) ---
    goToStep(6);
  }, 300);
}
window.prefillSASUExample = prefillSASUExample;

// Auto-trigger on ?test=1
document.addEventListener('DOMContentLoaded', function() {
  if (new URLSearchParams(window.location.search).get('test') === '1') {
    setTimeout(prefillTestData, 300);
  }
});

// Click on stepper steps to navigate
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('#stepper .step').forEach(function(stepEl) {
    stepEl.addEventListener('click', function() {
      var target = parseInt(stepEl.getAttribute('data-step'));
      // Allow clicking on done or active steps (all steps up to current + 1)
      if (target <= currentStep || stepEl.classList.contains('done')) {
        goToStep(target);
      }
    });
  });
});

// updateProgressBar stub (called from startForm but never defined in original source)
function updateProgressBar() {}
window.updateProgressBar = updateProgressBar;

Formalist.app = {
  startForm: startForm,
  updateStepIndicators: updateStepIndicators,
  transitionStep: transitionStep,
  nextStep: nextStep,
  prevStep: prevStep,
  goToStep: goToStep,
  selectOffer: selectOffer,
  startPayment: startPayment,
  prefillTestData: prefillTestData,
  prefillSASUExample: prefillSASUExample
};
