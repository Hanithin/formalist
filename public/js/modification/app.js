/**
 * Modification App Module
 * Type selection, step navigation, stepper, init, localStorage persistence
 */
window.Formalist = window.Formalist || {};

var modifCurrentStep = 1;
var modifTotalSteps = 5;
var modifIsAnimating = false;
var modifSelectedTypes = [];
var modifAssocieCount = 1;
var modifActiveAssocieTab = 1;

// ==================== TYPE SELECTION (multi-select) ====================

function toggleModifType(key) {
  var config = ModifTypes[key];
  if (!config) return;

  var idx = modifSelectedTypes.indexOf(key);
  if (idx >= 0) {
    modifSelectedTypes.splice(idx, 1);
  } else {
    modifSelectedTypes.push(key);
  }

  // Toggle selected class on card
  var card = document.getElementById('modif-card-' + key);
  if (card) card.classList.toggle('selected', modifSelectedTypes.indexOf(key) >= 0);

  // Update continue bar
  var bar = document.getElementById('modif-continue-bar');
  var countEl = document.getElementById('modif-selection-count');
  var btn = document.getElementById('modif-continue-btn');
  if (bar && countEl && btn) {
    var n = modifSelectedTypes.length;
    if (n > 0) {
      bar.style.display = 'flex';
      countEl.textContent = n + ' modification' + (n > 1 ? 's' : '') + ' s\u00e9lectionn\u00e9e' + (n > 1 ? 's' : '');
      btn.disabled = false;
    } else {
      bar.style.display = 'none';
      btn.disabled = true;
    }
  }
}
window.toggleModifType = toggleModifType;

function startModifWizard() {
  if (modifSelectedTypes.length === 0) return;

  // Update type badges with all selected types
  var badgeWrap = document.getElementById('modif-type-badge');
  if (badgeWrap) {
    badgeWrap.innerHTML = modifSelectedTypes.map(function(k) {
      var label = ModifTypes[k] ? ModifTypes[k].shortLabel : k;
      return '<span class="modif-type-tag">' + label + '</span>';
    }).join('');
  }

  // Build step 2 fields for all selected types
  buildModifStep2();

  // Transition: hide intro, show form
  var intro = document.getElementById('modif-intro');
  intro.style.transition = 'opacity 0.3s, transform 0.3s';
  intro.style.opacity = '0';
  intro.style.transform = 'translateY(-10px)';
  setTimeout(function() {
    intro.style.display = 'none';
    var form = document.getElementById('modif-form-section');
    form.classList.add('active');
    modifUpdateStepIndicators();
    modifSaveData();
  }, 300);
}
window.startModifWizard = startModifWizard;

function backToTypeSelection() {
  var form = document.getElementById('modif-form-section');
  form.classList.remove('active');
  var intro = document.getElementById('modif-intro');
  intro.style.display = '';
  intro.style.opacity = '1';
  intro.style.transform = '';
  modifCurrentStep = 1;
}
window.backToTypeSelection = backToTypeSelection;

// ==================== STEP 2 DYNAMIC FIELDS ====================

function buildModifStep2() {
  var container = document.getElementById('modif-step2-fields');
  if (!container) return;
  var html = '';

  modifSelectedTypes.forEach(function(typeKey, typeIndex) {
    var config = ModifTypes[typeKey];
    if (!config) return;

    // Add section header if multiple types
    if (modifSelectedTypes.length > 1) {
      if (typeIndex > 0) html += '<div class="modif-section-divider full"></div>';
      html += '<h3 class="modif-section-title full"><span class="modif-section-icon">' + config.icon + '</span>' + config.label + '</h3>';
    }

    config.fields.forEach(function(f) {
      var fullClass = f.full ? ' full' : '';
      var showIf = f.showIf ? ' data-show-if="' + f.showIf + '" style="display:none;"' : '';
      var reqMark = f.required ? ' <span class="required">*</span>' : '';
      var tooltipHtml = '';
      if (f.tooltip) {
        tooltipHtml = '<span class="tooltip-wrap"><span class="tooltip-icon">?</span><span class="tooltip-bubble">' + f.tooltip + '</span></span>';
      }

      html += '<div class="field' + fullClass + '"' + showIf + '>';
      html += '<label>' + f.label + reqMark + tooltipHtml + '</label>';

      if (f.type === 'select') {
        html += '<select id="' + f.id + '" onchange="onModifFieldChange(\'' + f.id + '\')">';
        f.options.forEach(function(opt) {
          html += '<option value="' + opt + '"' + (opt === '' ? ' disabled selected' : '') + '>' + (opt || 'Choisir...') + '</option>';
        });
        html += '</select>';
      } else if (f.type === 'textarea') {
        html += '<textarea id="' + f.id + '" placeholder="' + (f.placeholder || '') + '"></textarea>';
      } else if (f.type === 'date') {
        html += '<input type="date" id="' + f.id + '">';
      } else {
        html += '<input type="' + (f.type || 'text') + '" id="' + f.id + '" placeholder="' + (f.placeholder || '') + '">';
      }
      html += '</div>';
    });
  });

  container.innerHTML = html;
}

function onModifFieldChange(fieldId) {
  // Handle conditional field visibility for dirigeant type
  if (fieldId === 'type-changement-dirigeant') {
    var val = document.getElementById(fieldId).value.toLowerCase();
    var step2 = document.getElementById('modif-step2-fields');
    step2.querySelectorAll('[data-show-if]').forEach(function(el) {
      var showIf = el.dataset.showIf;
      el.style.display = (val.indexOf(showIf) >= 0) ? '' : 'none';
    });
  }
  // Handle cession cessionnaire type
  if (fieldId === 'cessionnaire-type') {
    var val = document.getElementById(fieldId).value.toLowerCase();
    var step2 = document.getElementById('modif-step2-fields');
    step2.querySelectorAll('[data-show-if="tiers"]').forEach(function(el) {
      el.style.display = (val.indexOf('tiers') >= 0) ? '' : 'none';
    });
  }
}
window.onModifFieldChange = onModifFieldChange;

// ==================== STEP NAVIGATION ====================

function modifUpdateStepIndicators() {
  document.querySelectorAll('#modif-stepper .step').forEach(function(s) {
    var step = parseInt(s.dataset.step);
    s.classList.remove('active', 'done');
    var circle = s.querySelector('.step-circle');
    if (step === modifCurrentStep) {
      s.classList.add('active');
      circle.innerHTML = step;
    } else if (step < modifCurrentStep) {
      s.classList.add('done');
      circle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    } else {
      circle.innerHTML = step;
    }
  });
  document.querySelectorAll('#modif-stepper .step-segment').forEach(function(seg) {
    var segNum = parseInt(seg.dataset.seg);
    seg.classList.remove('done', 'active');
    if (segNum < modifCurrentStep) seg.classList.add('done');
  });
}

function modifTransitionStep(from, to, direction) {
  if (modifIsAnimating) return;
  modifIsAnimating = true;

  var allContents = document.querySelectorAll('#modif-form-section .step-content');
  var fromEl = null, toEl = null;
  allContents.forEach(function(c) {
    if (parseInt(c.dataset.step) === from) fromEl = c;
    if (parseInt(c.dataset.step) === to) toEl = c;
  });

  if (!fromEl || !toEl) { modifIsAnimating = false; return; }

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

    modifUpdateStepIndicators();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    setTimeout(function() { modifIsAnimating = false; }, 450);
  }, 300);
}

function modifNextStep() {
  if (modifCurrentStep < modifTotalSteps && !modifIsAnimating) {
    modifSaveData();
    var from = modifCurrentStep;
    modifCurrentStep++;
    if (modifCurrentStep === 4) buildModifDocStep();
    modifTransitionStep(from, modifCurrentStep, 'next');
  }
}
window.modifNextStep = modifNextStep;

function modifPrevStep() {
  if (modifCurrentStep > 1 && !modifIsAnimating) {
    modifSaveData();
    var from = modifCurrentStep;
    modifCurrentStep--;
    if (modifCurrentStep === 4) buildModifDocStep();
    modifTransitionStep(from, modifCurrentStep, 'prev');
  }
}
window.modifPrevStep = modifPrevStep;

// ==================== ASSOCIES (Step 3) ====================

function modifSwitchAssocieTab(num) {
  modifActiveAssocieTab = num;
  document.querySelectorAll('#modif-associe-tabs .associe-tab').forEach(function(t) {
    t.classList.toggle('active', parseInt(t.dataset.tab) === num);
  });
  document.querySelectorAll('#modif-associe-panels .associe-panel').forEach(function(p) {
    if (parseInt(p.dataset.panel) === num) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });
}
window.modifSwitchAssocieTab = modifSwitchAssocieTab;

function modifAddAssocie() {
  modifAssocieCount++;
  var num = modifAssocieCount;
  var word = 'Associ\u00e9';

  // Add tab
  var tabsContainer = document.getElementById('modif-associe-tabs');
  var addBtn = document.getElementById('modif-btn-add-associe');
  var tab = document.createElement('button');
  tab.className = 'associe-tab';
  tab.dataset.tab = num;
  tab.onclick = function() { modifSwitchAssocieTab(num); };
  tab.innerHTML = '<span>' + word + ' ' + num + '</span><span class="tab-dot"></span>'
    + '<span class="tab-close" onclick="event.stopPropagation(); modifRemoveAssocie(' + num + ')">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>';
  tabsContainer.insertBefore(tab, addBtn);

  // Add panel
  var panelsContainer = document.getElementById('modif-associe-panels');
  var panel = document.createElement('div');
  panel.className = 'associe-panel';
  panel.dataset.panel = num;
  panel.innerHTML = modifAssociePanelHTML(num);
  panelsContainer.appendChild(panel);

  modifSwitchAssocieTab(num);
}
window.modifAddAssocie = modifAddAssocie;

function modifRemoveAssocie(num) {
  if (modifAssocieCount <= 1) return;
  var tab = document.querySelector('#modif-associe-tabs .associe-tab[data-tab="' + num + '"]');
  var panel = document.querySelector('#modif-associe-panels .associe-panel[data-panel="' + num + '"]');
  if (tab) tab.remove();
  if (panel) panel.remove();
  modifAssocieCount--;
  // Renumber
  var tabs = document.querySelectorAll('#modif-associe-tabs .associe-tab');
  var panels = document.querySelectorAll('#modif-associe-panels .associe-panel');
  tabs.forEach(function(t, i) {
    t.dataset.tab = i + 1;
    t.querySelector('span:first-child').textContent = 'Associ\u00e9 ' + (i + 1);
  });
  panels.forEach(function(p, i) { p.dataset.panel = i + 1; });
  modifSwitchAssocieTab(1);
}
window.modifRemoveAssocie = modifRemoveAssocie;

function modifAssociePanelHTML(num) {
  return '<div class="form-grid">'
    + '<div class="field"><label>Civilit\u00e9</label>'
    + '<select data-field="civilite"><option value="" disabled selected>Choisir...</option><option>Monsieur</option><option>Madame</option></select></div>'
    + '<div class="field"><label>Pr\u00e9nom <span class="required">*</span></label>'
    + '<input type="text" data-field="prenom" placeholder="Pr\u00e9nom"></div>'
    + '<div class="field"><label>Nom <span class="required">*</span></label>'
    + '<input type="text" data-field="nom" placeholder="Nom"></div>'
    + '<div class="field"><label>Nombre de parts d\u00e9tenues <span class="required">*</span></label>'
    + '<input type="number" data-field="parts" placeholder="Ex : 500" min="1"></div>'
    + '</div>';
}

// ==================== LOCALSTORAGE ====================

function modifSaveData() {
  try {
    var data = {
      types: modifSelectedTypes,
      step: modifCurrentStep,
      societe: {},
      modification: {},
      associes: []
    };
    // Step 1 - societe
    var step1Fields = ['modif-siren', 'modif-nom-societe', 'modif-forme', 'modif-adresse-actuelle',
      'modif-ville-actuelle', 'modif-cp-actuel', 'modif-capital-actuel', 'modif-date-statuts', 'modif-rcs-ville'];
    step1Fields.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) data.societe[id] = el.value;
    });
    // Step 2 - modification fields (all selected types)
    modifSelectedTypes.forEach(function(typeKey) {
      var config = ModifTypes[typeKey];
      if (config) {
        config.fields.forEach(function(f) {
          var el = document.getElementById(f.id);
          if (el) data.modification[f.id] = el.value;
        });
      }
    });
    // Step 3 - associes
    document.querySelectorAll('#modif-associe-panels .associe-panel').forEach(function(p) {
      var assoc = {};
      p.querySelectorAll('[data-field]').forEach(function(el) {
        assoc[el.dataset.field] = el.value;
      });
      data.associes.push(assoc);
    });
    localStorage.setItem('formalist_modification', JSON.stringify(data));
  } catch (e) {}
}
window.modifSaveData = modifSaveData;

function modifLoadData() {
  try {
    var raw = localStorage.getItem('formalist_modification');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}
window.modifLoadData = modifLoadData;

// ==================== INIT ====================

var SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

function buildModifTypeGrid() {
  var grid = document.getElementById('modif-type-grid');
  if (!grid) return;
  var html = '';
  ModifTypeKeys.forEach(function(key) {
    var t = ModifTypes[key];
    if (!t) return;
    html += '<div class="modif-card" onclick="toggleModifType(\'' + key + '\')" id="modif-card-' + key + '">'
      + '<div class="modif-card-check">' + SVG_CHECK + '</div>'
      + '<div class="modif-card-icon">' + t.icon + '</div>'
      + '<div class="modif-card-title">' + t.shortLabel + '</div>'
      + '<div class="modif-card-desc">' + t.desc + '</div>'
      + '</div>';
  });
  grid.innerHTML = html;
}

function buildModifPricingGrid() {
  var grid = document.getElementById('modif-pricing-grid');
  if (!grid) return;
  var offers = [
    { key: 'starter', name: 'Starter', price: '149', desc: 'Documents g\u00e9n\u00e9r\u00e9s, \u00e0 d\u00e9poser vous-m\u00eame.', includes: 'Inclus :', features: ['PV d\u2019AGE g\u00e9n\u00e9r\u00e9', 'T\u00e9l\u00e9chargement PDF'] },
    { key: 'business', name: 'Business', badge: 'Recommand\u00e9', price: '299', desc: 'V\u00e9rification par un avocat + d\u00e9p\u00f4t au greffe.', includes: 'Tout Starter, plus :', features: ['V\u00e9rification avocat', 'Publication annonce l\u00e9gale', 'D\u00e9p\u00f4t au greffe / INPI', 'Signature \u00e9lectronique'], recommended: true },
    { key: 'premium', name: 'Premium', price: '449', desc: 'Accompagnement complet + conseil personnalis\u00e9.', includes: 'Tout Business, plus :', features: ['Conseil juridique personnalis\u00e9', 'Suivi d\u00e9di\u00e9', 'Appel avec un avocat (30 min)'] }
  ];
  var html = '';
  offers.forEach(function(o) {
    html += '<div class="pricing-card' + (o.recommended ? ' recommended' : '') + '" data-offer="' + o.key + '" onclick="selectModifOffer(this)">';
    html += '<div class="pricing-name">' + o.name + (o.badge ? ' <span class="pricing-badge">' + o.badge + '</span>' : '') + '</div>';
    html += '<div class="pricing-price">' + o.price + '<sup>\u20ac HT</sup></div>';
    html += '<div class="pricing-desc">' + o.desc + '</div>';
    html += '<button class="pricing-select-btn">S\u00e9lectionner</button>';
    html += '<div class="pricing-includes">' + o.includes + '</div>';
    html += '<ul class="pricing-features">';
    o.features.forEach(function(f) {
      html += '<li>' + SVG_CHECK + ' ' + f + '</li>';
    });
    html += '</ul></div>';
  });
  grid.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', function() {
  buildModifTypeGrid();
  buildModifPricingGrid();

  var saved = modifLoadData();
  if (saved && saved.types && saved.types.length > 0) {
    // Could auto-resume here in the future
  }
});
