/**
 * Dev fill: bouton flottant pour remplir le formulaire avec des données de test.
 * Plusieurs scénarios pour tester rapidement les cas de figure.
 */
(function() {
  if (window.__devFillLoaded) return;
  window.__devFillLoaded = true;

  // ===== DONNÉES DE BASE =====
  var COMPANY = {
    nom: 'TESTSOCIETE',
    adresse: '12 rue de Rivoli',
    ville: 'Paris',
    cp: '75001',
    capital: '10000',
    dateDebut: '2026-06-01',
    dateCloture: '2026-12-31',
    duree: '99',
    objet: 'Conseil et prestations de services informatiques, développement de logiciels et applications, ainsi que toutes activités connexes.'
  };

  var PERSONNES = [
    { civ: 'Monsieur', prenom: 'Jean', nom: 'DUPONT', email: 'jean.dupont@test.fr',
      adresse: '5 avenue de la République, 75011 Paris', dob: '1985-04-12',
      villeNaiss: 'Lyon', cpNaiss: '69000', pere: 'Pierre DUPONT', mere: 'Marie LAURENT' },
    { civ: 'Madame', prenom: 'Sophie', nom: 'MARTIN', email: 'sophie.martin@test.fr',
      adresse: '8 rue Lafayette, 75009 Paris', dob: '1990-08-25',
      villeNaiss: 'Bordeaux', cpNaiss: '33000', pere: 'Henri MARTIN', mere: 'Claire DUBOIS' },
    { civ: 'Monsieur', prenom: 'Paul', nom: 'BERNARD', email: 'paul.bernard@test.fr',
      adresse: '23 boulevard Saint-Germain, 75005 Paris', dob: '1982-11-30',
      villeNaiss: 'Marseille', cpNaiss: '13000', pere: 'Jacques BERNARD', mere: 'Anne PETIT' },
    { civ: 'Madame', prenom: 'Lucie', nom: 'MOREAU', email: 'lucie.moreau@test.fr',
      adresse: '17 rue du Faubourg, 75010 Paris', dob: '1988-03-15',
      villeNaiss: 'Toulouse', cpNaiss: '31000', pere: 'Louis MOREAU', mere: 'Jeanne ROUX' }
  ];

  // ===== HELPERS =====
  function fire(el, type) {
    if (!el) return;
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function setVal(el, val) {
    if (!el) return;
    el.value = val;
    fire(el, 'input');
    fire(el, 'change');
  }

  function setSel(sel, val) {
    if (!sel) return;
    if (window.setSelect) { window.setSelect(sel, val); return; }
    sel.value = val;
    fire(sel, 'change');
  }

  function fillAssociePanel(panelEl, p, sitMat) {
    var selects = panelEl.querySelectorAll('select');
    var inputs = panelEl.querySelectorAll('input');
    // Field order based on creation.html structure:
    // selects: [civilité, type-associé, situation-matrimoniale]
    // inputs: [prenom, nom, email, adresse, date-naissance, ville-naiss, cp-naiss, pays-naiss, pere, mere, nationalité]
    setSel(selects[0], p.civ);
    setSel(selects[1], 'Personne physique');
    var ins = panelEl.querySelectorAll('input');
    // Use data-field where possible
    setVal(panelEl.querySelector('input[data-field="prenom"]'), p.prenom);
    setVal(panelEl.querySelector('input[data-field="nom"]'), p.nom);
    setVal(panelEl.querySelector('input[data-field="email"]'), p.email);
    setVal(panelEl.querySelector('input.addr-auto'), p.adresse);
    setVal(panelEl.querySelector('input[type="date"]'), p.dob);
    setVal(panelEl.querySelector('input.city-birth-auto'), p.villeNaiss);
    setVal(panelEl.querySelector('input.cp-birth'), p.cpNaiss);
    setVal(panelEl.querySelector('input.pays-birth'), 'France');
    // Père/Mère via index — they're plain text inputs after father/mother labels
    var allInputs = panelEl.querySelectorAll('input[type="text"]');
    // Find inputs by placeholder
    allInputs.forEach(function(inp) {
      var ph = (inp.placeholder || '').toLowerCase();
      if (ph.indexOf('pr&eacute;nom du p&egrave;re') >= 0 || ph.indexOf('prénom du père') >= 0) setVal(inp, p.pere);
      if (ph.indexOf('pr&eacute;nom de la m&egrave;re') >= 0 || ph.indexOf('prénom de la mère') >= 0) setVal(inp, p.mere);
    });
    setSel(panelEl.querySelector('select.sit-mat-select'), sitMat || 'Célibataire');
  }

  function fillDirigeantPanelAutre(panelEl, p) {
    // Set dirigeant select to "autre"
    var dirSelect = panelEl.querySelector('.dirigeant-panel-select');
    setSel(dirSelect, 'autre');
    // Wait for form to be visible then fill
    var form = panelEl.querySelector('.dirigeant-extra');
    if (form) form.style.display = '';
    // Physique panel
    var physique = panelEl.querySelector('.dirigeant-type-panel[data-type="physique"]');
    if (!physique) return;
    var selects = physique.querySelectorAll('select');
    setSel(selects[0], p.civ);
    setVal(physique.querySelector('input[data-field="dir-prenom"]'), p.prenom);
    setVal(physique.querySelector('input[data-field="dir-nom"]'), p.nom);
    setVal(physique.querySelector('input.addr-auto'), p.adresse);
    setVal(physique.querySelector('input[type="date"]'), p.dob);
    setVal(physique.querySelector('input.city-birth-auto'), p.villeNaiss);
    setVal(physique.querySelector('input.cp-birth'), p.cpNaiss);
    setVal(physique.querySelector('input.pays-birth'), 'France');
    physique.querySelectorAll('input[type="text"]').forEach(function(inp) {
      var ph = (inp.placeholder || '').toLowerCase();
      if (ph.indexOf('père') >= 0 || ph.indexOf('p&egrave;re') >= 0) setVal(inp, p.pere);
      if (ph.indexOf('mère') >= 0 || ph.indexOf('m&egrave;re') >= 0) setVal(inp, p.mere);
    });
    setSel(physique.querySelector('select.sit-mat-select'), 'Célibataire');
    setVal(physique.querySelector('input[data-field="dir-email"]'), p.email);
    // Rémunération + Régime social (last 2 selects in panel)
    var allSelects = panelEl.querySelectorAll('select');
    setSel(allSelects[allSelects.length - 2], 'Fixe');
    setSel(allSelects[allSelects.length - 1], 'Assimilé salarié');
  }

  function fillDirigeantPanelAssocie(panelEl, associeIdx) {
    var dirSelect = panelEl.querySelector('.dirigeant-panel-select');
    setSel(dirSelect, 'associe-' + associeIdx);
    // Rémunération + Régime social are outside the extra form
    var allSelects = panelEl.querySelectorAll('select');
    setSel(allSelects[allSelects.length - 2], 'Fixe');
    setSel(allSelects[allSelects.length - 1], 'Assimilé salarié');
  }

  function fillCompany(forme) {
    setSel(document.getElementById('forme-juridique'), forme);
    // Find company fields by their position in step 1
    var step1 = document.querySelector('.step-content[data-step="1"]');
    if (!step1) return;
    // Nom de la société — 2nd input in step 1
    var inputs = step1.querySelectorAll('input[type="text"], input[type="number"], input[type="date"]');
    // Map: forme(select), nom, adresse, ville, cp, mode-dom(select), capital, banque(select), date-debut, date-cloture, durée, option-fiscale(select), tva(select)
    var nomInput = step1.querySelector('.form-grid .field:nth-child(2) input[type="text"]');
    if (nomInput) setVal(nomInput, COMPANY.nom);
    setVal(step1.querySelector('input.addr-auto'), COMPANY.adresse);
    // Ville + CP : the 4th and 5th text inputs
    var textInputs = step1.querySelectorAll('input[type="text"]:not(.addr-auto):not(#banque-autre-nom):not(#banque-autre-adresse):not(#banque-autre-ville):not(#banque-autre-cp):not(#ai-activite-input)');
    if (textInputs[1]) setVal(textInputs[1], COMPANY.ville);
    if (textInputs[2]) setVal(textInputs[2], COMPANY.cp);
    setSel(document.getElementById('mode-domiciliation'), 'Société de domiciliation');
    setVal(document.getElementById('capital-social'), COMPANY.capital);
    setSel(document.getElementById('banque-select'), 'Qonto');
    setVal(document.getElementById('date-debut-activite'), COMPANY.dateDebut);
    // Cloture date + duree are subsequent date/number inputs
    var dates = step1.querySelectorAll('input[type="date"]');
    if (dates[1]) setVal(dates[1], COMPANY.dateCloture);
    var nums = step1.querySelectorAll('input[type="number"]');
    if (nums[1]) setVal(nums[1], COMPANY.duree);
    // Option fiscale + TVA — last 2 selects in step 1
    var selects = step1.querySelectorAll('select');
    if (selects.length >= 2) {
      setSel(selects[selects.length - 2], 'IS');
      setSel(selects[selects.length - 1], 'Franchise en base de TVA');
    }
    var activite = document.getElementById('activite-textarea');
    if (activite) setVal(activite, COMPANY.objet);
    if (window.refreshAllCustomTriggers) window.refreshAllCustomTriggers();
  }

  function ensureAssocieCount(n) {
    var current = document.querySelectorAll('#associe-panels .associe-panel').length;
    while (current < n) {
      window.addAssocie();
      current++;
    }
  }

  function ensureDirigeantCount(n) {
    var current = document.querySelectorAll('#dirigeant-panels .associe-panel').length;
    while (current < n) {
      window.addDirigeant();
      current++;
    }
  }

  // ===== SCÉNARIOS =====
  function scenarioSASU_AssocieEgalPresident() {
    fillCompany('SASU');
    var panel = document.querySelector('#associe-panels .associe-panel[data-panel="1"]');
    fillAssociePanel(panel, PERSONNES[0], 'Célibataire');
    setTimeout(function() {
      var dPanel = document.querySelector('#dirigeant-panels .associe-panel[data-panel="1"]');
      if (window.refreshDirigeantSelects) window.refreshDirigeantSelects();
      fillDirigeantPanelAssocie(dPanel, 0);
      if (window.refreshAllCustomTriggers) window.refreshAllCustomTriggers();
    }, 100);
  }

  function scenarioSASU_PresidentDG_Differents() {
    fillCompany('SASU');
    var panel = document.querySelector('#associe-panels .associe-panel[data-panel="1"]');
    fillAssociePanel(panel, PERSONNES[0], 'Célibataire');
    setTimeout(function() {
      ensureDirigeantCount(2);
      if (window.refreshDirigeantSelects) window.refreshDirigeantSelects();
      var dirPanels = document.querySelectorAll('#dirigeant-panels .associe-panel');
      fillDirigeantPanelAutre(dirPanels[0], PERSONNES[1]);
      fillDirigeantPanelAutre(dirPanels[1], PERSONNES[2]);
      if (window.refreshAllCustomTriggers) window.refreshAllCustomTriggers();
    }, 100);
  }

  function scenarioSAS_PlusieursAssocies() {
    fillCompany('SAS');
    ensureAssocieCount(3);
    var panels = document.querySelectorAll('#associe-panels .associe-panel');
    fillAssociePanel(panels[0], PERSONNES[0], 'Célibataire');
    fillAssociePanel(panels[1], PERSONNES[1], 'Célibataire');
    fillAssociePanel(panels[2], PERSONNES[2], 'Célibataire');
    setTimeout(function() {
      var dPanel = document.querySelector('#dirigeant-panels .associe-panel[data-panel="1"]');
      if (window.refreshDirigeantSelects) window.refreshDirigeantSelects();
      fillDirigeantPanelAssocie(dPanel, 0);
      if (window.refreshAllCustomTriggers) window.refreshAllCustomTriggers();
    }, 100);
  }

  function scenarioSARL_2Associes() {
    fillCompany('SARL');
    ensureAssocieCount(2);
    var panels = document.querySelectorAll('#associe-panels .associe-panel');
    fillAssociePanel(panels[0], PERSONNES[0], 'Marié(e)');
    fillAssociePanel(panels[1], PERSONNES[1], 'Célibataire');
    setTimeout(function() {
      var dPanel = document.querySelector('#dirigeant-panels .associe-panel[data-panel="1"]');
      if (window.refreshDirigeantSelects) window.refreshDirigeantSelects();
      fillDirigeantPanelAssocie(dPanel, 0);
      if (window.refreshAllCustomTriggers) window.refreshAllCustomTriggers();
    }, 100);
  }

  function scenarioEURL_AssocieEgalGerant() {
    fillCompany('EURL');
    var panel = document.querySelector('#associe-panels .associe-panel[data-panel="1"]');
    fillAssociePanel(panel, PERSONNES[0], 'Célibataire');
    setTimeout(function() {
      var dPanel = document.querySelector('#dirigeant-panels .associe-panel[data-panel="1"]');
      if (window.refreshDirigeantSelects) window.refreshDirigeantSelects();
      fillDirigeantPanelAssocie(dPanel, 0);
      if (window.refreshAllCustomTriggers) window.refreshAllCustomTriggers();
    }, 100);
  }

  var SCENARIOS = [
    { label: 'SASU — Associé = Président', fn: scenarioSASU_AssocieEgalPresident },
    { label: 'SASU — Président + DG différents', fn: scenarioSASU_PresidentDG_Differents },
    { label: 'SAS — 3 associés + Président', fn: scenarioSAS_PlusieursAssocies },
    { label: 'SARL — 2 associés + Gérant', fn: scenarioSARL_2Associes },
    { label: 'EURL — Associé = Gérant', fn: scenarioEURL_AssocieEgalGerant }
  ];

  // ===== UI =====
  function buildUI() {
    var wrap = document.createElement('div');
    wrap.id = 'dev-fill-wrap';
    wrap.style.cssText = 'position:fixed;bottom:90px;right:24px;z-index:9999;font-family:inherit;';

    var btn = document.createElement('button');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><span>Données de test</span>';
    btn.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;background:#111;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:500;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.18);transition:transform 0.15s;font-family:inherit;';
    btn.onmouseover = function() { btn.style.transform = 'translateY(-2px)'; };
    btn.onmouseout = function() { btn.style.transform = ''; };

    var menu = document.createElement('div');
    menu.style.cssText = 'position:absolute;bottom:48px;right:0;background:#fff;border:1px solid #e5e5e5;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.12);padding:6px;min-width:280px;display:none;';

    SCENARIOS.forEach(function(s) {
      var item = document.createElement('button');
      item.textContent = s.label;
      item.style.cssText = 'display:block;width:100%;text-align:left;padding:10px 12px;background:none;border:none;border-radius:8px;font-size:13.5px;color:#222;cursor:pointer;font-family:inherit;';
      item.onmouseover = function() { item.style.background = '#f5f5f5'; };
      item.onmouseout = function() { item.style.background = ''; };
      item.onclick = function() {
        menu.style.display = 'none';
        try { s.fn(); } catch (e) { console.error('Dev-fill error:', e); if (typeof window.showToast === 'function') window.showToast('Erreur : ' + e.message); else alert('Erreur: ' + e.message); }
      };
      menu.appendChild(item);
    });

    btn.onclick = function(e) {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    };
    document.addEventListener('click', function() { menu.style.display = 'none'; });

    wrap.appendChild(menu);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
