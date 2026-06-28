/**
 * Formalist Associes Module
 * Associe tab/panel management, add/remove/renumber
 */
window.Formalist = window.Formalist || {};

var associeCount = 1;
var activeTab = 1;

function getAssocieWord() {
  var forme = document.getElementById('forme-juridique');
  if (!forme) return 'Associ\u00e9';
  var val = forme.value;
  if (/^(SAS|SASU|SELAS|SELASU|SCA|SE|SA)$/.test(val)) return 'Actionnaire';
  return 'Associ\u00e9';
}
window.getAssocieWord = getAssocieWord;

function isFormeUnipersonnelle() {
  var forme = document.getElementById('forme-juridique');
  if (!forme) return false;
  var val = forme.value;
  return val === 'SASU' || val === 'EURL';
}
window.isFormeUnipersonnelle = isFormeUnipersonnelle;

function updateAssocieLabel() {
  var word = getAssocieWord();
  var uni = isFormeUnipersonnelle();
  // Update tabs
  document.querySelectorAll('#associe-tabs .associe-tab').forEach(function(t, i) {
    var label = t.querySelector('span:first-child');
    var custom = label.textContent;
    if (custom.indexOf('Associ') === 0 || custom.indexOf('Actionnaire') === 0) {
      label.textContent = word + ' ' + (i + 1);
    }
  });
  // Update stepper label + section title/desc based on count and forme
  var nbAssoc = document.querySelectorAll('#associe-tabs .associe-tab').length || 1;
  var pluralWord = word + (uni || nbAssoc < 2 ? '' : 's');
  var stepperLbl = document.getElementById('stepper-label-associes');
  if (stepperLbl) stepperLbl.textContent = pluralWord;
  var titleEl = document.getElementById('step-title-associes');
  if (titleEl) titleEl.textContent = pluralWord;
  var descEl = document.getElementById('step-desc-associes');
  if (descEl) {
    descEl.textContent = uni
      ? 'Renseignez l\'' + word.toLowerCase() + ' unique de votre société.'
      : 'Ajoutez les ' + word.toLowerCase() + 's de votre société. Minimum 2 pour une SAS, SARL ou SCI.';
  }
  // Hide/show add button for unipersonnelle forms
  var btn = document.getElementById('btn-add-associe');
  if (btn) {
    btn.querySelector('span').textContent = 'Ajouter un ' + word.toLowerCase();
    btn.style.display = uni ? 'none' : '';
  }
  // If switching to unipersonnelle and more than 1 associe, remove extras
  if (uni && associeCount > 1) {
    var tabs = document.querySelectorAll('#associe-tabs .associe-tab');
    var panels = document.querySelectorAll('#associe-panels .associe-panel');
    for (var i = tabs.length - 1; i >= 1; i--) {
      tabs[i].remove();
      panels[i].remove();
    }
    renumberTabs();
    refreshDirigeantSelects();
    switchTab(1);
  }
  // Also update dirigeant labels + selects for step 3
  updateDirigeantLabels();
  refreshDirigeantSelects();
}
window.updateAssocieLabel = updateAssocieLabel;

function switchTab(num) {
  activeTab = num;
  document.querySelectorAll('#associe-tabs .associe-tab').forEach(function(t) {
    t.classList.toggle('active', parseInt(t.dataset.tab) === num);
  });
  document.querySelectorAll('#associe-panels .associe-panel').forEach(function(p) {
    if (parseInt(p.dataset.panel) === num) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });
}
window.switchTab = switchTab;

function updateTabName(input) {
  var panel = input.closest('.associe-panel');
  var num = parseInt(panel.dataset.panel);
  var prenomInput = panel.querySelector('input[data-field="prenom"]');
  var nomInput = panel.querySelector('input[data-field="nom"]');
  var prenom = prenomInput ? prenomInput.value : '';
  var nom = nomInput ? nomInput.value : '';
  var tab = document.querySelector('#associe-tabs .associe-tab[data-tab="' + num + '"] span:first-child');
  var tabEl = document.querySelector('#associe-tabs .associe-tab[data-tab="' + num + '"]');
  if (prenom || nom) {
    tab.textContent = (prenom + ' ' + nom).trim();
    tabEl.classList.add('filled');
  } else {
    tab.textContent = getAssocieWord() + ' ' + num;
    tabEl.classList.remove('filled');
  }
  // Update dirigeant select options with new name
  refreshDirigeantSelects();
}
window.updateTabName = updateTabName;

function panelHTML(num) {
  return '<div class="form-grid" style="grid-template-columns: auto 1fr 1fr;">'
    + '<div class="field"><label>Civilit\u00e9</label><select style="width:120px;"><option value="" disabled selected>Choisir...</option><option>Monsieur</option><option>Madame</option></select></div>'
    + '<div class="field"><label>Pr\u00e9nom <span class="required">*</span></label><input type="text" placeholder="Pr\u00e9nom" data-field="prenom" oninput="updateTabName(this)"></div>'
    + '<div class="field"><label>Nom <span class="required">*</span></label><input type="text" placeholder="Nom" data-field="nom" oninput="updateTabName(this)"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field"><label>Type d\'associ\u00e9</label><select><option value="" disabled selected>Choisir...</option><option>Personne physique</option><option>Personne morale</option></select></div>'
    + '<div class="field"><label>Email <span class="required">*</span></label><input type="email" placeholder="email@exemple.com" data-field="email"></div></div>'
    + '<div class="form-grid" style="margin-top:16px;">'
    + '<div class="field full"><label>Adresse</label><input type="text" placeholder="Adresse de l\'associ\u00e9" class="addr-auto"></div></div>'
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
    + '<div class="field"><label>Situation matrimoniale</label><select class="sit-mat-select" onchange="toggleConjoint(this)"><option value="" disabled selected>Choisir...</option><option>C\u00e9libataire</option><option>Mari\u00e9(e)</option><option>Pacs\u00e9(e)</option><option>Divorc\u00e9(e)</option><option>Veuf(ve)</option></select></div></div>';
}
window.panelHTML = panelHTML;

function addAssocie() {
  if (isFormeUnipersonnelle()) return;
  associeCount++;
  var tabs = document.getElementById('associe-tabs');
  var addBtn = tabs.querySelector('.btn-add-tab');
  var word = getAssocieWord();

  // Create tab
  var tab = document.createElement('button');
  tab.className = 'associe-tab';
  tab.dataset.tab = associeCount;
  tab.onclick = function() { switchTab(parseInt(this.dataset.tab)); };
  tab.innerHTML = '<span>' + word + ' ' + associeCount + '</span><span class="tab-dot"></span>'
    + '<span class="tab-close" onclick="event.stopPropagation(); removeAssocie(' + associeCount + ');">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>';
  tabs.insertBefore(tab, addBtn);

  // Create panel
  var panel = document.createElement('div');
  panel.className = 'associe-panel';
  panel.dataset.panel = associeCount;
  panel.innerHTML = panelHTML(associeCount);
  document.getElementById('associe-panels').appendChild(panel);

  // Init Google autocomplete on new inputs
  var addrInput = panel.querySelector('.addr-auto');
  if (addrInput) initAddressAutocomplete(addrInput);
  var cityInput = panel.querySelector('.city-birth-auto');
  if (cityInput) initCityBirthAutocomplete(cityInput);
  // Init custom selects and datepickers on new panel
  panel.querySelectorAll('select').forEach(function(s) { initCustomSelect(s); });
  panel.querySelectorAll('input[type="date"]').forEach(function(d) { initCustomDate(d); });

  // Switch to new tab
  switchTab(associeCount);
  refreshDirigeantSelects();
  updateAssocieLabel();
}
window.addAssocie = addAssocie;

function removeAssocie(num) {
  if (document.querySelectorAll('#associe-tabs .associe-tab').length <= 1) return;

  var tab = document.querySelector('#associe-tabs .associe-tab[data-tab="' + num + '"]');
  var panel = document.querySelector('#associe-panels .associe-panel[data-panel="' + num + '"]');

  // Animate out
  tab.style.transition = 'opacity 0.2s, transform 0.2s';
  tab.style.opacity = '0';
  tab.style.transform = 'scale(0.9)';

  setTimeout(function() {
    tab.remove();
    panel.remove();
    renumberTabs();
    refreshDirigeantSelects();
    updateAssocieLabel();
    // Switch to first tab
    var firstTab = document.querySelector('#associe-tabs .associe-tab');
    if (firstTab) switchTab(parseInt(firstTab.dataset.tab));
  }, 200);
}
window.removeAssocie = removeAssocie;

function renumberTabs() {
  var tabs = document.querySelectorAll('#associe-tabs .associe-tab');
  var panels = document.querySelectorAll('#associe-panels .associe-panel');
  associeCount = tabs.length;
  tabs.forEach(function(t, i) {
    var num = i + 1;
    var oldNum = parseInt(t.dataset.tab);
    t.dataset.tab = num;
    var label = t.querySelector('span:first-child');
    if (label.textContent.indexOf('Associ') === 0 || label.textContent.indexOf('Actionnaire') === 0) {
      label.textContent = getAssocieWord() + ' ' + num;
    }
    var close = t.querySelector('.tab-close');
    if (close) close.setAttribute('onclick', 'event.stopPropagation(); removeAssocie(' + num + ');');
    t.onclick = (function(n) { return function() { switchTab(n); }; })(num);
  });
  panels.forEach(function(p, i) {
    p.dataset.panel = i + 1;
  });
}
window.renumberTabs = renumberTabs;

// Helper: extract info from an associe panel
function extractAssocieData(panel) {
  if (!panel) return null;
  var selects = panel.querySelectorAll('select');
  var civ = selects[0] ? selects[0].value : '';
  var prenomI = panel.querySelector('input[data-field="prenom"]');
  var nomI = panel.querySelector('input[data-field="nom"]');
  var prenom = prenomI ? prenomI.value : '';
  var nom = nomI ? nomI.value : '';
  var adresse = '';
  var dateNaissance = '';
  var lieuNaissance = '';
  var cpNaissance = '';
  var paysNaissance = '';
  var nationalite = '';
  var sitMatSelect = panel.querySelector('select.sit-mat-select');
  var situationMatrimoniale = sitMatSelect ? sitMatSelect.value : '';
  var pere = '', mere = '';

  var adresseInput = panel.querySelector('input[placeholder*="Adresse"]');
  if (adresseInput) adresse = adresseInput.value;
  var dateInput = panel.querySelector('input[type="date"]');
  if (dateInput) dateNaissance = dateInput.value;
  var villeNaissInput = panel.querySelector('input[placeholder="Ville de naissance"]');
  if (villeNaissInput) lieuNaissance = villeNaissInput.value;
  var cpNaissInput = panel.querySelector('input[placeholder="Code postal"]');
  if (cpNaissInput) cpNaissance = cpNaissInput.value;
  var paysInput = panel.querySelector('input[value="France"]');
  if (paysInput) paysNaissance = paysInput.value;
  var natInput = panel.querySelector('input[value="Fran\u00e7aise"]');
  if (natInput) nationalite = natInput.value;
  var pereInput = panel.querySelector('input[placeholder*="p\u00e8re"]');
  var mereInput = panel.querySelector('input[placeholder*="m\u00e8re"]');
  if (pereInput) pere = pereInput.value;
  if (mereInput) mere = mereInput.value;

  var lieuComplet = lieuNaissance;
  if (cpNaissance) lieuComplet += ' (' + cpNaissance + ')';
  if (paysNaissance) lieuComplet += ' (' + paysNaissance + ')';

  var emailI = panel.querySelector('input[data-field="email"]');
  var email = emailI ? emailI.value : '';

  // Conjoint data from conjoint-section
  var conjointCivilite = '', conjointNom = '', conjointPrenom = '', conjointNomNaissance = '';
  var dateMariage = '', villeMariage = '', contratMariage = '';
  var conjSection = panel.querySelector('.conjoint-section');
  if (conjSection) {
    var cjSelects = conjSection.querySelectorAll('select');
    var cjInputs = conjSection.querySelectorAll('input');
    conjointCivilite = cjSelects[0] ? cjSelects[0].value : '';
    conjointNom = cjInputs[0] ? cjInputs[0].value : '';
    conjointPrenom = cjInputs[1] ? cjInputs[1].value : '';
    conjointNomNaissance = cjInputs[2] ? cjInputs[2].value : '';
    dateMariage = cjInputs[3] ? cjInputs[3].value : '';
    villeMariage = cjInputs[4] ? cjInputs[4].value : '';
    // Contrat de mariage select (only present if married, index 1)
    if (cjSelects[1]) contratMariage = cjSelects[1].value;
  }

  return {
    civilite: civ, prenom: prenom, nom: nom, adresse: adresse,
    dateNaissance: dateNaissance, lieuNaissance: lieuComplet,
    lieuNaissanceVille: lieuNaissance,
    cpNaissance: cpNaissance,
    paysNaissance: paysNaissance || 'France',
    nationalite: nationalite || 'Fran\u00e7aise',
    situationMatrimoniale: situationMatrimoniale || 'C\u00e9libataire',
    pere: pere, mere: mere,
    email: email,
    civNomPrenom: (civ + ' ' + nom.toUpperCase() + ' ' + prenom).trim(),
    conjointCivilite: conjointCivilite,
    conjointNom: conjointNom,
    conjointPrenom: conjointPrenom,
    conjointNomNaissance: conjointNomNaissance,
    dateMariage: dateMariage,
    villeMariage: villeMariage,
    contratMariage: contratMariage,
  };
}
window.extractAssocieData = extractAssocieData;

function getAssocieName(panel, index) {
  var prenomInput = panel.querySelector('input[data-field="prenom"]');
  var nomInput = panel.querySelector('input[data-field="nom"]');
  var prenom = prenomInput ? prenomInput.value.trim() : '';
  var nom = nomInput ? nomInput.value.trim() : '';
  if (prenom || nom) return (prenom + ' ' + nom).trim();
  return getAssocieWord() + ' ' + (index + 1);
}
window.getAssocieName = getAssocieName;

function getInitials(name) {
  var parts = name.split(' ').filter(function(p) { return p.length > 0; });
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return '??';
}
window.getInitials = getInitials;

Formalist.associes = {
  getAssocieWord: getAssocieWord,
  isFormeUnipersonnelle: isFormeUnipersonnelle,
  updateAssocieLabel: updateAssocieLabel,
  switchTab: switchTab,
  updateTabName: updateTabName,
  panelHTML: panelHTML,
  addAssocie: addAssocie,
  removeAssocie: removeAssocie,
  renumberTabs: renumberTabs,
  extractAssocieData: extractAssocieData,
  getAssocieName: getAssocieName,
  getInitials: getInitials
};
