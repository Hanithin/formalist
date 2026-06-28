/**
 * Formalist Form Data Module
 * collectFormData, saveFormData, loadFormData, and data persistence logic
 */
window.Formalist = window.Formalist || {};

// Helper: format ISO date to French
function formatDateFr(isoDate) {
  if (!isoDate || isoDate.indexOf('-') === -1) return isoDate || '-';
  var parts = isoDate.split('-');
  var mois = ['janvier','f\u00e9vrier','mars','avril','mai','juin','juillet','ao\u00fbt','septembre','octobre','novembre','d\u00e9cembre'];
  return parseInt(parts[2]) + ' ' + mois[parseInt(parts[1]) - 1] + ' ' + parts[0];
}
window.formatDateFr = formatDateFr;

// Helper: number to French words
function numberToFrench(n) {
  if (n === 0) return 'z\u00e9ro';
  var units = ['','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
  var tens = ['','','vingt','trente','quarante','cinquante','soixante','soixante','quatre-vingt','quatre-vingt'];
  function chunk(num) {
    if (num === 0) return '';
    if (num < 20) return units[num];
    if (num < 70) { var r = num % 10; return tens[Math.floor(num/10)] + (r === 1 ? ' et un' : r ? '-' + units[r] : ''); }
    if (num < 80) { var r = num - 60; return 'soixante' + (r === 11 ? ' et onze' : r === 1 ? ' et un' : '-' + units[r]); }
    if (num < 100) { var r = num - 80; return 'quatre-vingt' + (r === 0 ? 's' : '-' + units[r]); }
    if (num < 200) return 'cent' + (num === 100 ? '' : ' ' + chunk(num - 100));
    if (num < 1000) return units[Math.floor(num/100)] + ' cent' + (num % 100 === 0 ? 's' : ' ' + chunk(num % 100));
    if (num < 2000) return 'mille' + (num === 1000 ? '' : ' ' + chunk(num - 1000));
    if (num < 1000000) return chunk(Math.floor(num/1000)) + ' mille' + (num % 1000 === 0 ? '' : ' ' + chunk(num % 1000));
    return String(num);
  }
  var euros = Math.floor(n);
  var centimes = Math.round((n - euros) * 100);
  if (centimes > 0 && euros === 0) {
    return chunk(centimes);
  }
  if (centimes > 0) {
    return chunk(euros) + ' et ' + chunk(centimes) + ' centime' + (centimes > 1 ? 's' : '');
  }
  return chunk(euros);
}
window.numberToFrench = numberToFrench;

// Collect all form data for document generation
function collectFormDataForDocs() {
  // If we loaded from server (resume mode), use the stored data directly
  if (window._serverLoadedData) {
    return window._serverLoadedData;
  }
  var forme = document.getElementById('forme-juridique');
  var nomSociete = document.querySelector('.step-content[data-step="1"] input[placeholder="Nom de la soci\u00e9t\u00e9"]');
  var adresseSociete = document.querySelector('.step-content[data-step="1"] input[placeholder="Adresse compl\u00e8te"]');
  var villeSociete = document.querySelector('.step-content[data-step="1"] input[placeholder="Ville"]');
  var cpSociete = document.querySelector('.step-content[data-step="1"] input[placeholder="Code postal"]');
  var capital = document.getElementById('capital-social');
  var step1 = document.querySelector('.step-content[data-step="1"]');

  // Banque
  var banqueSel = document.getElementById('banque-select');
  var banque = banqueSel ? banqueSel.value : '';
  if (banque === 'Autre') {
    var banqueNom = (document.getElementById('banque-autre-nom') || {}).value || '';
    var banqueAdresse = (document.getElementById('banque-autre-adresse') || {}).value || '';
    var banqueVille = (document.getElementById('banque-autre-ville') || {}).value || '';
    var banqueCp = (document.getElementById('banque-autre-cp') || {}).value || '';
    var banqueFull = banqueAdresse;
    if (banqueCp || banqueVille) banqueFull += ', ' + banqueCp + ' ' + banqueVille;
    banque = banqueNom + (banqueFull ? ' - ' + banqueFull.trim() : '');
  }

  // Dates
  var dateDebutInput = document.getElementById('date-debut-activite');
  var dateDebut = dateDebutInput ? dateDebutInput.value : '';
  var dateInputs = step1.querySelectorAll('input[type="date"]');
  var dateCloture = dateInputs[1] ? dateInputs[1].value : (dateInputs[0] ? dateInputs[0].value : '');

  // Activite
  var activiteArea = step1.querySelector('textarea');
  var activite = activiteArea ? activiteArea.value : '';

  // Capital values
  var capitalVal = capital ? (parseFloat(capital.value) || 1) : 1;
  var capitalFormatted = capitalVal.toLocaleString('fr-FR');
  var capitalLettres = numberToFrench(capitalVal);

  // Parts
  var totalPartsInput = document.getElementById('capital-total-parts');
  var totalParts = totalPartsInput ? parseInt(totalPartsInput.value) || 100 : 100;
  var valeurNominale = totalParts > 0 ? Math.round((capitalVal / totalParts) * 100) / 100 : 1;

  // Adresse siege complete
  var adresseSiege = '';
  var villeStr = '';
  if (adresseSociete) adresseSiege = adresseSociete.value;
  if (cpSociete && cpSociete.value) adresseSiege += ', ' + cpSociete.value;
  if (villeSociete && villeSociete.value) {
    villeStr = villeSociete.value;
    adresseSiege += ' ' + villeStr;
  }

  // All associes
  var panels = document.querySelectorAll('#associe-panels .associe-panel');
  var associes = [];
  panels.forEach(function(p) { associes.push(extractAssocieData(p)); });

  // First associe = default dirigeant
  var a1 = associes[0] || {};

  // Helper: resolve a dirigeant select value to data
  function resolveDirigeant(selectVal, formEl) {
    if (selectVal && selectVal.indexOf('associe-') === 0) {
      var idx = parseInt(selectVal.replace('associe-', ''));
      return associes[idx] || a1;
    }
    if (selectVal === 'autre' && formEl) {
      var activePanel = formEl.querySelector('.dirigeant-type-panel.active');
      if (activePanel) {
        var isMorale = activePanel.dataset.type === 'morale';
        var dSelects = activePanel.querySelectorAll('select');
        var dInputs = activePanel.querySelectorAll('input');
        var d;
        if (isMorale) {
          d = {
            estMorale: true,
            societeNom: dInputs[0] ? dInputs[0].value : '',
            societeAdresse: dInputs[1] ? dInputs[1].value : '',
            societeRcs: dInputs[3] ? dInputs[3].value : '',
            societeVilleRcs: dInputs[4] ? dInputs[4].value : '',
            societeType: dInputs[5] ? dInputs[5].value : '',
            societeSiren: dInputs[6] ? dInputs[6].value : '',
            civilite: dSelects[0] ? dSelects[0].value : '',
            prenom: dInputs[7] ? dInputs[7].value : '',
            nom: dInputs[8] ? dInputs[8].value : '',
            adresse: dInputs[9] ? dInputs[9].value : '',
            dateNaissance: dInputs[10] ? dInputs[10].value : '',
            lieuNaissanceVille: dInputs[11] ? dInputs[11].value : '',
            cpNaissance: dInputs[12] ? dInputs[12].value : '',
            paysNaissance: dInputs[13] ? dInputs[13].value : 'France',
            pere: dInputs[14] ? dInputs[14].value : '',
            mere: dInputs[15] ? dInputs[15].value : '',
            nationalite: dInputs[16] ? dInputs[16].value : 'Fran\u00e7aise',
            situationMatrimoniale: dSelects[1] ? dSelects[1].value : '',
          };
          d.lieuNaissance = (d.lieuNaissanceVille || '') + (d.cpNaissance ? ' (' + d.cpNaissance + ')' : '');
          d.civNomPrenom = (d.civilite + ' ' + d.nom.toUpperCase() + ' ' + d.prenom).trim();
        } else {
          d = {
            estMorale: false,
            civilite: dSelects[0] ? dSelects[0].value : '',
            prenom: dInputs[0] ? dInputs[0].value : '',
            nom: dInputs[1] ? dInputs[1].value : '',
            adresse: dInputs[2] ? dInputs[2].value : '',
            dateNaissance: dInputs[3] ? dInputs[3].value : '',
            lieuNaissance: (dInputs[4] ? dInputs[4].value : '') + (dInputs[5] ? ' (' + dInputs[5].value + ')' : ''),
            lieuNaissanceVille: dInputs[4] ? dInputs[4].value : '',
            cpNaissance: dInputs[5] ? dInputs[5].value : '',
            paysNaissance: dInputs[6] ? dInputs[6].value : 'France',
            pere: dInputs[7] ? dInputs[7].value : '',
            mere: dInputs[8] ? dInputs[8].value : '',
            nationalite: dInputs[9] ? dInputs[9].value : 'Fran\u00e7aise',
            situationMatrimoniale: dSelects[1] ? dSelects[1].value : '',
          };
          d.civNomPrenom = (d.civilite + ' ' + d.nom.toUpperCase() + ' ' + d.prenom).trim();
        }
        // Remuneration & regime social
        var allFormSelects = formEl.querySelectorAll(':scope > .form-grid select');
        allFormSelects.forEach(function(s) {
          var label = s.closest('.field') && s.closest('.field').querySelector('label');
          var labelText = label ? label.textContent.trim() : '';
          if (labelText.match(/mun.ration/i)) d.remuneration = s.value || '';
          if (labelText.match(/gime social/i)) d.regimeSocial = s.value || '';
        });
        return d;
      }
    }
    return a1;
  }

  // Dirigeant principal from step 3
  var sel1 = document.getElementById('select-dirigeant-1');
  var dirigeant = resolveDirigeant(sel1 ? sel1.value : '', document.getElementById('dirigeant-form-1'));

  // Directeurs Generaux (DG) from dirigeant panels 2, 3, etc.
  var dgList = [];
  var dgPanels = document.querySelectorAll('#dirigeant-panels .associe-panel');
  dgPanels.forEach(function(panel, idx) {
    if (idx === 0) return;
    var panelNum = panel.dataset.panel;
    var selDG = document.getElementById('select-dirigeant-' + panelNum);
    var formDG = document.getElementById('dirigeant-form-' + panelNum);
    if (selDG && selDG.value) {
      var dgData = resolveDirigeant(selDG.value, formDG);
      if (dgData && dgData.nom) dgList.push(dgData);
    }
  });

  // Format date de cloture
  var dateClotureFormatted = formatDateFr(dateCloture);

  // Date signature = today
  var now = new Date();
  var moisNoms = ['janvier','f\u00e9vrier','mars','avril','mai','juin','juillet','ao\u00fbt','septembre','octobre','novembre','d\u00e9cembre'];
  var dateSignature = now.getDate() + ' ' + moisNoms[now.getMonth()] + ' ' + now.getFullYear();

  // Split activite into lines for objet social
  var activiteLines = activite ? activite.split('\n').filter(function(l) { return l.trim(); }) : [];
  var objet1 = activiteLines[0] || activite || '-';
  var objet2 = activiteLines[1] || '';
  var objet3 = activiteLines[2] || '';
  var objet4 = activiteLines[3] || '';
  var objet5 = activiteLines[4] || '';
  var objet6 = activiteLines[5] || '';

  // Per-associate capital distribution
  var partsInputs = document.querySelectorAll('.capital-parts-input');
  var partsPerAssoc = [];
  partsInputs.forEach(function(inp) { partsPerAssoc.push(parseInt(inp.value) || 0); });

  var data = {
    NOM_SOCIETE: (nomSociete ? nomSociete.value : '') || '-',
    NOM_SOCIETE_COMPLET: (nomSociete ? nomSociete.value : '') || '-',
    CAPITAL: capitalFormatted,
    CAPITAL_LETTRES: capitalLettres,
    ADRESSE_SIEGE: adresseSiege || '-',
    FORME_JURIDIQUE: forme ? forme.value : 'SAS',
    NB_PARTS: totalParts.toLocaleString('fr-FR'),
    NB_PARTS_LETTRES: numberToFrench(totalParts),
    VALEUR_NOMINALE: valeurNominale.toLocaleString('fr-FR'),
    VALEUR_NOMINALE_LETTRES: numberToFrench(valeurNominale),
    VALEUR_NOMINALE_UNITE: (function() {
      if (valeurNominale < 1) {
        var centimes = Math.round(valeurNominale * 100);
        return 'centime' + (centimes > 1 ? 's' : '');
      }
      return 'euro' + (valeurNominale > 1 ? 's' : '');
    })(),
    NOM_BANQUE: banque || '-',
    ADRESSE_BANQUE: '-',
    DATE_CLOTURE: dateClotureFormatted,
    DATE_SIGNATURE: dateSignature,
    DATE_SIGNATURE_COURTE: ('0' + now.getDate()).slice(-2) + '/' + ('0' + (now.getMonth() + 1)).slice(-2) + '/' + now.getFullYear(),
    VILLE_SIGNATURE: villeStr || '-',
    VILLE_SOCIETE: villeStr || '-',
    // RCS = ville du Tribunal de Commerce dont dépend le siège (pas la commune elle-même).
    // Ex: Sainte-Foy-lès-Lyon (69110) → RCS de Lyon, et non "Sainte-Foy-lès-Lyon" (qui n'a pas de TC).
    RCS_VILLE: (typeof window.resolveRcsCity === 'function'
      ? (window.resolveRcsCity((cpSociete && cpSociete.value) || '', villeStr) || villeStr || '-')
      : (villeStr || '-')),
    DUREE: '99',
    STATUT_OCCUPATION: 'propri\u00e9taire',
    OBJET_SOCIAL_1: objet1,
    OBJET_SOCIAL_2: objet2,
    OBJET_SOCIAL_3: objet3,
    OBJET_SOCIAL_4: objet4,
    OBJET_SOCIAL_5: objet5,
    OBJET_SOCIAL_6: objet6,
    SOCIETE_MERE: '-', FORME_MERE: '-', CAPITAL_MERE: '-', ADRESSE_MERE: '-', RCS_VILLE_MERE: '-', SIREN_MERE: '-', REPRESENTANT_MERE: '-',
    MONTANT: capitalFormatted,
    LIBERATION_PCT_1: '100',
    PRESIDENT_NOM: dirigeant.civNomPrenom || '-',
    CIVILITE_NOM_PRENOM: dirigeant.civNomPrenom || '-',
    ADRESSE_DIRIGEANT: dirigeant.adresse || '-',
    DATE_NAISSANCE: formatDateFr(dirigeant.dateNaissance) || '-',
    LIEU_NAISSANCE: dirigeant.lieuNaissance || '-',
    NATIONALITE: dirigeant.nationalite || 'Fran\u00e7aise',
    NOM_PERE: dirigeant.pere || '-',
    NOM_MERE: dirigeant.mere || '-',
    NOM_JEUNE_FILLE: (function() {
      var mere = dirigeant.mere || a1.mere || '';
      if (!mere.trim()) return '-';
      var parts = mere.trim().split(/\s+/);
      for (var i = parts.length - 1; i >= 0; i--) {
        if (parts[i] === parts[i].toUpperCase() && parts[i].length > 1) return parts[i];
      }
      return parts[parts.length - 1].toUpperCase();
    })(),
    CONJOINT_DE: '-',
    CONJOINT_NOM: '-',
    REGIME_MATRIMONIAL: '-',
    // Dirigeant gender flags (for SCI non-condamnation template)
    EST_HOMME: dirigeant.civilite === 'Monsieur',
    EST_FEMME: dirigeant.civilite === 'Madame',
    // SCI PV nomination: gérant identity fields
    GERANT_CIVILITE_NOM_PRENOM: dirigeant.civNomPrenom || '-',
    GERANT_EST_HOMME: dirigeant.civilite === 'Monsieur',
    GERANT_EST_FEMME: dirigeant.civilite === 'Madame',
    GERANT_DATE_NAISSANCE: formatDateFr(dirigeant.dateNaissance) || '-',
    GERANT_LIEU_NAISSANCE: dirigeant.lieuNaissance || '-',
    GERANT_NATIONALITE: dirigeant.nationalite || 'Fran\u00e7aise',
    GERANT_SITUATION_MATRIMONIALE: (dirigeant.situationMatrimoniale || 'c\u00e9libataire').toLowerCase(),
    GERANT_ADRESSE: dirigeant.adresse || '-',
    SITUATION_MATRIMONIALE: (dirigeant.situationMatrimoniale || a1.situationMatrimoniale || 'c\u00e9libataire').toLowerCase(),
  };

  // Per-associate indexed fields (_1 to _10)
  var totalVerse = 0;
  var totalReste = 0;
  var associesArray = [];
  // Fallback : forme unipersonnelle avec partsPerAssoc vide (DOM capital absent) →
  // l'associé unique détient toutes les parts.
  var isUnipersonnelleEarly = forme && (forme.value === 'EURL' || forme.value === 'SASU' || associes.length <= 1);
  for (var i = 0; i < Math.min(associes.length, 10); i++) {
    var idx = i + 1;
    var a = associes[i] || {};
    var parts = partsPerAssoc[i] || 0;
    if (parts === 0 && i === 0 && isUnipersonnelleEarly && totalParts > 0) parts = totalParts;
    var montantAssoc = parts * valeurNominale;

    data['HAS_ASSOC_' + idx] = true;
    data['CIVILITE_NOM_PRENOM_' + idx] = a.civNomPrenom || '-';
    data['ACTIONNAIRE_' + idx] = a.civNomPrenom || '-';
    data['ASSOCIE_' + idx] = a.civNomPrenom || '-';
    data['ADRESSE_ASSOCIE_' + idx] = a.adresse || '-';
    data['EMAIL_ASSOCIE_' + idx] = a.email || '';
    data['DATE_NAISSANCE_' + idx] = formatDateFr(a.dateNaissance) || '-';
    data['LIEU_NAISSANCE_' + idx] = a.lieuNaissance || '-';
    data['NATIONALITE_' + idx] = a.nationalite || 'Fran\u00e7aise';
    data['SITUATION_MATRIMONIALE_' + idx] = (a.situationMatrimoniale || 'C\u00e9libataire').toLowerCase();
    data['NB_PARTS_' + idx] = parts ? parts.toLocaleString('fr-FR') : '-';
    data['NOM_PERE_' + idx] = a.pere || '-';
    data['NOM_MERE_' + idx] = a.mere || '-';

    // SCI statuts: personne morale/physique per associate
    // Genre per associate (for né/née)
    var aEstHomme = (a.civilite || '').indexOf('Monsieur') >= 0;
    data['EST_HOMME_' + idx] = aEstHomme;
    data['EST_FEMME_' + idx] = !aEstHomme;

    data['ASSOC_' + idx + '_EST_MORALE'] = !!a.estMorale;
    data['ASSOC_' + idx + '_EST_PHYSIQUE'] = !a.estMorale;
    if (a.estMorale) {
      data['ASSOC_' + idx + '_SOCIETE_NOM'] = a.societeNom || '-';
      data['ASSOC_' + idx + '_SOCIETE_FORME'] = a.societeType || '-';
      data['ASSOC_' + idx + '_SOCIETE_CAPITAL'] = a.societeCapital || '-';
      data['ASSOC_' + idx + '_SOCIETE_ADRESSE'] = a.societeAdresse || '-';
      data['ASSOC_' + idx + '_SOCIETE_RCS_VILLE'] = a.societeRcsVille || '-';
      data['ASSOC_' + idx + '_SOCIETE_SIREN'] = a.societeSiren || '-';
      data['ASSOC_' + idx + '_SOCIETE_REP'] = a.societeRepresentant || '-';
    }

    // Nom de jeune fille
    var njfMere = a.mere || '';
    var njf = '-';
    if (njfMere.trim()) {
      var njfParts = njfMere.trim().split(/\s+/);
      for (var j = njfParts.length - 1; j >= 0; j--) {
        if (njfParts[j] === njfParts[j].toUpperCase() && njfParts[j].length > 1) { njf = njfParts[j]; break; }
      }
      if (njf === '-') njf = njfParts[njfParts.length - 1].toUpperCase();
    }
    data['NOM_JEUNE_FILLE_' + idx] = njf;

    // Per-associe apport data from capital step
    var cardN = document.querySelector('.associe-card[data-index="' + i + '"]');
    var pctDetN = totalParts > 0 ? ((parts / totalParts) * 100).toFixed(1).replace(/\.0$/, '') : '0';
    var pctLibN = 100;
    var apportNatureN = 0;
    var descNatureN = '';
    if (cardN) {
      var libN = cardN.querySelector('.liberation-input');
      if (libN) pctLibN = parseInt(libN.value) || 100;
      var natN = cardN.querySelector('.apport-nature-montant');
      if (natN) apportNatureN = parseFloat(natN.value) || 0;
      var descN = cardN.querySelector('.apport-nature-desc');
      if (descN) descNatureN = descN.value || '';
    }
    var montantNumN = Math.max(0, montantAssoc - apportNatureN);
    var verseNumN = montantNumN * (pctLibN / 100);
    var montantVerseN = verseNumN + apportNatureN;
    var resteN = montantNumN - verseNumN;

    data['PCT_DETENTION_' + idx] = pctDetN;
    data['PCT_LIBERATION_' + idx] = String(pctLibN);
    data['APPORT_NUMERAIRE_' + idx] = montantNumN.toLocaleString('fr-FR');
    data['MONTANT_SOUSCRIT_' + idx] = montantAssoc.toLocaleString('fr-FR');
    data['MONTANT_VERSE_' + idx] = montantVerseN.toLocaleString('fr-FR');
    data['RESTE_A_LIBERER_' + idx] = resteN.toLocaleString('fr-FR');
    data['APPORTS_NATURE_' + idx] = apportNatureN.toLocaleString('fr-FR');
    data['DESC_APPORT_NATURE_' + idx] = descNatureN;
    data['HAS_APPORT_NATURE_' + idx] = apportNatureN > 0;

    totalVerse += montantVerseN;
    totalReste += resteN;

    associesArray.push({
      CIVILITE_NOM_PRENOM: a.civNomPrenom || '-',
      DATE_NAISSANCE: formatDateFr(a.dateNaissance) || '-',
      LIEU_NAISSANCE: a.lieuNaissance || '-',
      NATIONALITE: a.nationalite || 'Fran\u00e7aise',
      SITUATION_MATRIMONIALE: (a.situationMatrimoniale || 'C\u00e9libataire').toLowerCase(),
      ADRESSE: a.adresse || '-',
      EST_HOMME: aEstHomme,
      EST_FEMME: !aEstHomme,
      NB_PARTS: parts ? parts.toLocaleString('fr-FR') : '-',
      VALEUR_NOMINALE: valeurNominale.toLocaleString('fr-FR'),
      MONTANT_SOUSCRIT: montantAssoc.toLocaleString('fr-FR'),
      PCT_DETENTION: pctDetN,
      APPORT_NUMERAIRE: montantNumN.toLocaleString('fr-FR'),
      HAS_APPORT_NATURE: apportNatureN > 0,
      APPORTS_NATURE: apportNatureN.toLocaleString('fr-FR'),
      DESC_APPORT_NATURE: descNatureN,
      PCT_LIBERATION: String(pctLibN),
      MONTANT_VERSE: montantVerseN.toLocaleString('fr-FR'),
      RESTE_A_LIBERER: resteN.toLocaleString('fr-FR')
    });
  }
  for (var i = associes.length; i < 10; i++) {
    data['HAS_ASSOC_' + (i + 1)] = false;
  }
  data.ASSOCIES = associesArray;
  data.TOTAL_VERSE = totalVerse.toLocaleString('fr-FR');
  data.TOTAL_RESTE = totalReste.toLocaleString('fr-FR');

  // SCI statuts: parts range (PARTS_DE_N / PARTS_A_N)
  var partsCumul = 0;
  for (var pi = 0; pi < Math.min(associes.length, 10); pi++) {
    var pidx = pi + 1;
    var pCount = partsPerAssoc[pi] || 0;
    data['PARTS_DE_' + pidx] = pCount > 0 ? (partsCumul + 1).toString() : '-';
    data['PARTS_A_' + pidx] = pCount > 0 ? (partsCumul + pCount).toString() : '-';
    partsCumul += pCount;
  }

  // Date debut exercice
  data.DATE_DEBUT_EXERCICE = data.DATE_DEBUT_ACTIVITE || '-';

  // Conjoint data — per associé marié
  var conjointAssocies = [];
  for (var ci = 0; ci < associes.length; ci++) {
    var ac = associes[ci];
    if (!ac || !ac.situationMatrimoniale) continue;
    var isMarie = ac.situationMatrimoniale.toLowerCase().indexOf('mari') >= 0;
    if (!isMarie) continue;

    // Determine regime from contratMariage field
    var contrat = ac.contratMariage || '';
    var regime = 'communaut\u00e9 r\u00e9duite aux acqu\u00eats';
    var regimeLabel = 'sans contrat de mariage';
    var skipDoc = false;
    if (contrat.indexOf('paration de biens') >= 0) {
      regime = 's\u00e9paration de biens';
      regimeLabel = 'sous le r\u00e9gime de la s\u00e9paration de biens';
      skipDoc = true;
    } else if (contrat.indexOf('universelle') >= 0) {
      regime = 'communaut\u00e9 universelle';
      regimeLabel = 'sous le r\u00e9gime de la communaut\u00e9 universelle';
    } else if (contrat.indexOf('acqu\u00eats') >= 0) {
      regime = 'participation aux acqu\u00eats';
      regimeLabel = 'sous le r\u00e9gime de la participation aux acqu\u00eats';
    }

    var cidx = ci + 1;
    var conjointFullName = (ac.conjointCivilite + ' ' + (ac.conjointNom || '').toUpperCase() + ' ' + (ac.conjointPrenom || '')).trim();

    data['CONJOINT_CIVILITE_' + cidx] = ac.conjointCivilite || '-';
    data['CONJOINT_NOM_' + cidx] = conjointFullName || '-';
    data['CONJOINT_PRENOM_' + cidx] = ac.conjointPrenom || '-';
    data['CONJOINT_NOM_NAISSANCE_' + cidx] = ac.conjointNomNaissance || '-';
    data['DATE_MARIAGE_' + cidx] = formatDateFr(ac.dateMariage) || '-';
    data['VILLE_MARIAGE_' + cidx] = ac.villeMariage || '-';
    data['CONTRAT_MARIAGE_' + cidx] = contrat || '-';
    data['REGIME_MATRIMONIAL_' + cidx] = regime;
    data['REGIME_LABEL_' + cidx] = regimeLabel;
    data['CONJOINT_DE_' + cidx] = ac.civNomPrenom || '-';

    if (!skipDoc) {
      conjointAssocies.push({
        index: ci,
        nom: ac.civNomPrenom || '-',
        conjointNom: conjointFullName || '-',
        regime: regime,
        regimeLabel: regimeLabel,
        dateMariage: formatDateFr(ac.dateMariage) || '-',
        villeMariage: ac.villeMariage || '-',
        conjointCivilite: ac.conjointCivilite || '-',
        conjointPrenom: ac.conjointPrenom || '-',
        conjointNomNaissance: ac.conjointNomNaissance || '-',
      });
    }
  }
  data._conjointAssocies = conjointAssocies;

  // Legacy compat: first married associé data
  if (conjointAssocies.length > 0) {
    var first = conjointAssocies[0];
    data.CONJOINT_DE = first.nom;
    data.CONJOINT_NOM = first.conjointNom;
    data.REGIME_MATRIMONIAL = first.regime;
  }

  // Option fiscale (IS / IR), Régime TVA, Mode domiciliation — from step 1 selects
  var step1Selects = step1.querySelectorAll('.field select');
  var optionFiscale = '';
  var regimeTva = '';
  step1Selects.forEach(function(s) {
    var lbl = s.closest('.field') && s.closest('.field').querySelector('label');
    if (!lbl) return;
    var t = lbl.textContent || '';
    if (t.match(/Option fiscale/i)) optionFiscale = s.value || '';
    else if (t.match(/Régime TVA/i)) regimeTva = s.value || '';
  });
  data.OPTION_IS = optionFiscale === 'IS';
  data.OPTION_FISCALE = optionFiscale || '';
  data.REGIME_TVA = regimeTva || '';
  var modeDomicil = (document.getElementById('mode-domiciliation') || {}).value || '';
  data.MODE_DOMICILIATION = modeDomicil;

  // SASU template mappings
  var formeVal = forme ? forme.value : 'SAS';
  var isSCI = formeVal === 'SCI';

  // Forme label for templates
  var formeLabels = {
    'SAS': 'Société par actions simplifiée',
    'SASU': 'Société par actions simplifiée unipersonnelle',
    'SARL': 'Société à responsabilité limitée',
    'EURL': 'Entreprise unipersonnelle à responsabilité limitée',
    'SCI': 'Société civile immobilière'
  };
  data.FORME_LABEL = formeLabels[formeVal] || formeVal;

  // Associé unique vs pluriel (ne définir que la valeur truthy — sinon String(false)="false" est truthy pour docxtemplater)
  var isUnipersonnelle = formeVal === 'EURL' || formeVal === 'SASU' || panels.length <= 1;
  if (isUnipersonnelle) {
    data.IS_UNIPERSONNELLE = true;
  } else {
    data.IS_PLURIPERSONNELLE = true;
  }

  // SCI/SARL/EURL: gérant aliases
  if (isSCI || formeVal === 'SARL' || formeVal === 'EURL') {
    data.GERANT_NOM = dirigeant.civNomPrenom || '-';
  }
  data.CAPITAL_CHIFFRES = capitalFormatted;
  data.SIEGE_SOCIAL = adresseSiege || '-';
  data.NOMBRE_ACTIONS = totalParts.toLocaleString('fr-FR');
  data.NOMBRE_ACTIONS_LETTRES = numberToFrench(totalParts);
  data.OBJET_SOCIAL = [objet1, objet2, objet3, objet4, objet5, objet6]
    .filter(function(l) { return l && l.trim(); }).join('\n');
  data.NOM_ACTIONNAIRE = a1.civNomPrenom || '-';
  data.CIVILITE = a1.civilite || '-';
  data.NOM = a1.nom ? a1.nom.toUpperCase() : '-';
  data.PRENOM = a1.prenom || '-';
  data.ADRESSE_PERSO = a1.adresse || '-';
  data.CODE_POSTAL_NAISSANCE = a1.cpNaissance || '-';
  data.PAYS_NAISSANCE = a1.paysNaissance || 'France';
  data.LIEU_NAISSANCE = a1.lieuNaissanceVille || '-';
  data.SITUATION_MATRIMONIALE = (a1.situationMatrimoniale || 'c\u00e9libataire').toLowerCase();

  // Fallback : si la répartition n'a pas été collectée (.capital-parts-input absent du DOM)
  // ET qu'on est en forme unipersonnelle, l'associé unique détient 100% des parts.
  var assoc1Parts = partsPerAssoc[0] || 0;
  if (assoc1Parts === 0 && isUnipersonnelle && totalParts > 0) {
    assoc1Parts = totalParts;
  }
  var pctDetention = totalParts > 0 ? ((assoc1Parts / totalParts) * 100).toFixed(1).replace(/\.0$/, '') : '100';
  data.PCT_DETENTION = pctDetention;

  // Apport data from capital step
  var card0 = document.querySelector('.associe-card[data-index="0"]');
  var typeApport = 'Num\u00e9raire';
  var pctLib = 100;
  var apportNature = 0;
  var descNature = '';
  if (card0) {
    var sel0 = card0.querySelector('.apport-type-select');
    if (sel0) typeApport = sel0.value;
    var lib0 = card0.querySelector('.liberation-input');
    if (lib0) pctLib = parseInt(lib0.value) || 100;
    var nat0 = card0.querySelector('.apport-nature-montant');
    if (nat0) apportNature = parseFloat(nat0.value) || 0;
    var desc0 = card0.querySelector('.apport-nature-desc');
    if (desc0) descNature = desc0.value || '';
  }
  var montantSouscrit = assoc1Parts * valeurNominale;
  var montantNumeraire = Math.max(0, montantSouscrit - apportNature);
  var verseNumeraire = montantNumeraire * (pctLib / 100);
  var montantVerse = verseNumeraire + apportNature;
  var resteALiberer = montantNumeraire - verseNumeraire;

  data.PCT_LIBERATION = String(pctLib);
  data.APPORTS_NATURE = apportNature.toLocaleString('fr-FR');
  data.APPORT_NUMERAIRE = montantNumeraire.toLocaleString('fr-FR');
  data.MONTANT_SOUSCRIT = montantSouscrit.toLocaleString('fr-FR');
  data.MONTANT_VERSE = montantVerse.toLocaleString('fr-FR');
  data.RESTE_A_LIBERER = resteALiberer.toLocaleString('fr-FR');
  data.DESC_APPORT_NATURE = descNature;
  data.VALEUR_NOMINALE_CHIFFRES = valeurNominale.toLocaleString('fr-FR');
  data.HAS_APPORT_NATURE = apportNature > 0;

  // Remuneration + régime social du président (sauvegardés en clés directes pour le restore)
  var remuPres = '';
  var regimeSocialPres = '';
  var dirPanel1 = document.querySelector('#dirigeant-panels .associe-panel[data-panel="1"]');
  if (dirPanel1) {
    dirPanel1.querySelectorAll('select').forEach(function(s) {
      var lbl = s.closest('.field') && s.closest('.field').querySelector('label');
      if (!lbl) return;
      var t = lbl.textContent || '';
      if (t.match(/mun/i)) remuPres = s.value || '';
      else if (t.match(/gime social/i)) regimeSocialPres = s.value || '';
    });
  }
  // Sauve la SÉLECTION originale (pas seulement le template texte) pour restauration fidèle
  data.REMUNERATION_PRESIDENT_TYPE = remuPres || '';
  data.REGIME_SOCIAL_PRESIDENT = regimeSocialPres || '';
  var remuDecideur = (isSCI || formeVal === 'SARL')
    ? 'l\u2019assembl\u00e9e des associ\u00e9s'
    : (formeVal === 'SAS') ? 'l\u2019assembl\u00e9e g\u00e9n\u00e9rale' : 'l\u2019actionnaire unique';
  if (remuPres === 'Fixe') {
    data.REMUNERATION_PRESIDENT = 'La pr\u00e9sidence exercera ses fonctions \u00e0 titre de r\u00e9mun\u00e9ration fixe dont le montant sera fix\u00e9 par d\u00e9cision de ' + remuDecideur + '.';
  } else if (remuPres === 'Variable') {
    data.REMUNERATION_PRESIDENT = 'La pr\u00e9sidence exercera ses fonctions \u00e0 titre de r\u00e9mun\u00e9ration variable dont les modalit\u00e9s seront fix\u00e9es par d\u00e9cision de ' + remuDecideur + '.';
  } else {
    data.REMUNERATION_PRESIDENT = 'La r\u00e9mun\u00e9ration de la pr\u00e9sidence sera d\u00e9termin\u00e9e ult\u00e9rieurement.';
  }
  // SCI/SARL/EURL: gérant rémunération
  if (isSCI || formeVal === 'SARL' || formeVal === 'EURL') {
    if (remuPres === 'Fixe') {
      data.REMUNERATION_GERANT = 'La g\u00e9rance exercera ses fonctions \u00e0 titre de r\u00e9mun\u00e9ration fixe dont le montant sera fix\u00e9 par d\u00e9cision de ' + remuDecideur + '.';
    } else if (remuPres === 'Variable') {
      data.REMUNERATION_GERANT = 'La g\u00e9rance exercera ses fonctions \u00e0 titre de r\u00e9mun\u00e9ration variable dont les modalit\u00e9s seront fix\u00e9es par d\u00e9cision de ' + remuDecideur + '.';
    } else {
      data.REMUNERATION_GERANT = 'La r\u00e9mun\u00e9ration de la g\u00e9rance sera d\u00e9termin\u00e9e ult\u00e9rieurement.';
    }
  }
  // SARL/EURL: alias PRESIDENT_NOM → GERANT_NOM (pour PV nomination)
  if (formeVal === 'SARL' || formeVal === 'EURL') {
    data.PRESIDENT_NOM = data.GERANT_NOM;
  }

  // Personne physique vs morale condition
  var assocTypeSelect = panels[0] ? panels[0].querySelectorAll('select')[1] : null;
  var isPersonneMorale = assocTypeSelect && assocTypeSelect.value === 'Personne morale';
  data.EST_PERSONNE_PHYSIQUE = !isPersonneMorale;
  data.EST_PERSONNE_MORALE = isPersonneMorale;

  if (isPersonneMorale && panels[0]) {
    var pmPanel = panels[0].querySelector('.pm-fields') || panels[0];
    var pmInputs = pmPanel.querySelectorAll('input');
    data.SOCIETE_NOM = pmInputs[0] ? pmInputs[0].value : '-';
    data.SOCIETE_FORME = pmInputs[1] ? pmInputs[1].value : '-';
    data.SOCIETE_CAPITAL = pmInputs[2] ? pmInputs[2].value : '-';
    data.SOCIETE_SIEGE = pmInputs[3] ? pmInputs[3].value : '-';
    data.SOCIETE_RCS_VILLE = pmInputs[4] ? pmInputs[4].value : '-';
    data.SOCIETE_SIREN = pmInputs[5] ? pmInputs[5].value : '-';
    data.SOCIETE_REPRESENTANT = pmInputs[6] ? pmInputs[6].value : '-';
  }

  // Bank conditions
  var banqueRaw = banqueSel ? banqueSel.value : '';
  data.BANQUE_SHINE = banqueRaw === 'Shine';
  data.BANQUE_REVOLUT = banqueRaw === 'Revolut Business';
  data.BANQUE_QONTO = banqueRaw === 'Qonto';
  data.BANQUE_AUTRE = banqueRaw === 'Autre';

  if (banqueRaw === 'Autre') {
    data.NOM_BANQUE = (document.getElementById('banque-autre-nom') || {}).value || '-';
    var bAddr = (document.getElementById('banque-autre-adresse') || {}).value || '';
    var bCp = (document.getElementById('banque-autre-cp') || {}).value || '';
    var bVille = (document.getElementById('banque-autre-ville') || {}).value || '';
    data.ADRESSE_BANQUE = (bAddr + ', ' + bCp + ' ' + bVille).trim().replace(/^,\s*/, '');
  }

  // Annee premier exercice
  if (dateCloture) {
    data.ANNEE_PREMIER_EXERCICE = dateCloture.split('-')[0];
    var clotParts = dateCloture.split('-');
    var clotDay = parseInt(clotParts[2]) || 31;
    var clotMonth = parseInt(clotParts[1]) || 12;
    data.DATE_CLOTURE = clotDay + ' ' + moisNoms[clotMonth - 1];
  }

  // Date debut activite formatee
  if (dateDebut) {
    var dbParts = dateDebut.split('-');
    var dbDay = parseInt(dbParts[2]) || 1;
    var dbMonth = parseInt(dbParts[1]) || 1;
    var dbYear = parseInt(dbParts[0]) || 2026;
    data.DATE_DEBUT_ACTIVITE = dbDay + ' ' + moisNoms[dbMonth - 1] + ' ' + dbYear;
  } else {
    data.DATE_DEBUT_ACTIVITE = '';
  }

  // DG tags
  data.HAS_DG = dgList.length > 0;
  data.DG_COUNT = dgList.length;
  // Sauve la rémunération + régime social ORIGINAL de chaque DG (pour restauration fidèle)
  var remuDG = '';
  var dgPanelsList = document.querySelectorAll('#dirigeant-panels .associe-panel');
  for (var dgi = 1; dgi < dgPanelsList.length; dgi++) {
    var dgPanel = dgPanelsList[dgi];
    var dgRemu = '', dgRegime = '';
    dgPanel.querySelectorAll('select').forEach(function(s) {
      var lbl = s.closest('.field') && s.closest('.field').querySelector('label');
      if (!lbl) return;
      var t = lbl.textContent || '';
      if (t.match(/mun/i)) dgRemu = s.value || '';
      else if (t.match(/gime social/i)) dgRegime = s.value || '';
    });
    data['REMUNERATION_DG_' + dgi + '_TYPE'] = dgRemu;
    data['REGIME_SOCIAL_DG_' + dgi] = dgRegime;
    if (dgi === 1) remuDG = dgRemu; // legacy
  }
  if (remuDG === 'Fixe') {
    data.REMUNERATION_DG = 'La direction g\u00e9n\u00e9rale exercera ses fonctions \u00e0 titre de r\u00e9mun\u00e9ration fixe dont le montant sera fix\u00e9 par d\u00e9cision de ' + remuDecideur + '.';
  } else if (remuDG === 'Variable') {
    data.REMUNERATION_DG = 'La direction g\u00e9n\u00e9rale exercera ses fonctions \u00e0 titre de r\u00e9mun\u00e9ration variable dont les modalit\u00e9s seront fix\u00e9es par d\u00e9cision de ' + remuDecideur + '.';
  } else {
    data.REMUNERATION_DG = 'La r\u00e9mun\u00e9ration de la direction g\u00e9n\u00e9rale sera d\u00e9termin\u00e9e ult\u00e9rieurement.';
  }
  // SCI: co-gérant rémunération alias
  if (isSCI) {
    if (remuDG === 'Fixe') {
      data.REMUNERATION_CO_GERANT = 'La co-g\u00e9rance exercera ses fonctions \u00e0 titre de r\u00e9mun\u00e9ration fixe dont le montant sera fix\u00e9 par d\u00e9cision de ' + remuDecideur + '.';
    } else if (remuDG === 'Variable') {
      data.REMUNERATION_CO_GERANT = 'La co-g\u00e9rance exercera ses fonctions \u00e0 titre de r\u00e9mun\u00e9ration variable dont les modalit\u00e9s seront fix\u00e9es par d\u00e9cision de ' + remuDecideur + '.';
    } else {
      data.REMUNERATION_CO_GERANT = 'La r\u00e9mun\u00e9ration de la co-g\u00e9rance sera d\u00e9termin\u00e9e ult\u00e9rieurement.';
    }
  }
  for (var dgIdx = 0; dgIdx < Math.min(dgList.length, 3); dgIdx++) {
    var dg = dgList[dgIdx];
    var n = dgIdx + 1;
    var p = 'DG_' + n + '_';
    data['HAS_DG_' + n] = true;
    data[p + 'EST_PHYSIQUE'] = !dg.estMorale;
    data[p + 'EST_MORALE'] = !!dg.estMorale;
    data[p + 'CIVILITE'] = dg.civilite || '-';
    data[p + 'NOM'] = dg.nom ? dg.nom.toUpperCase() : '-';
    data[p + 'PRENOM'] = dg.prenom || '-';
    data[p + 'DATE_NAISSANCE'] = formatDateFr(dg.dateNaissance) || '-';
    data[p + 'LIEU_NAISSANCE'] = dg.lieuNaissanceVille || dg.lieuNaissance || '-';
    data[p + 'CP_NAISSANCE'] = dg.cpNaissance || '-';
    data[p + 'PAYS_NAISSANCE'] = dg.paysNaissance || 'France';
    data[p + 'NATIONALITE'] = dg.nationalite || 'Fran\u00e7aise';
    data[p + 'SITUATION_MATRIMONIALE'] = (dg.situationMatrimoniale || 'c\u00e9libataire').toLowerCase();
    data[p + 'ADRESSE'] = dg.adresse || '-';
    data[p + 'NOM_PERE'] = dg.pere || '-';
    data[p + 'NOM_MERE'] = dg.mere || '-';
    data[p + 'CIVILITE_NOM_PRENOM'] = (dg.civilite + ' ' + (dg.nom || '').toUpperCase() + ' ' + (dg.prenom || '')).trim() || '-';
    var dgMere = dg.mere || '';
    var dgNjf = '-';
    if (dgMere.trim()) {
      var dgNjfParts = dgMere.trim().split(/\s+/);
      for (var j = dgNjfParts.length - 1; j >= 0; j--) {
        if (dgNjfParts[j] === dgNjfParts[j].toUpperCase() && dgNjfParts[j].length > 1) { dgNjf = dgNjfParts[j]; break; }
      }
      if (dgNjf === '-') dgNjf = dgNjfParts[dgNjfParts.length - 1].toUpperCase();
    }
    data[p + 'NOM_JEUNE_FILLE'] = dgNjf;
    // Gender flags for DG (SCI non-condamnation template)
    data[p + 'EST_HOMME'] = dg.civilite === 'Monsieur';
    data[p + 'EST_FEMME'] = dg.civilite === 'Madame';
    if (dg.estMorale) {
      data[p + 'SOCIETE_NOM'] = dg.societeNom || '-';
      data[p + 'SOCIETE_ADRESSE'] = dg.societeAdresse || '-';
      data[p + 'SOCIETE_CAPITAL'] = dg.societeCapital || '-';
      data[p + 'SOCIETE_RCS'] = dg.societeRcs || '-';
      data[p + 'SOCIETE_VILLE_RCS'] = dg.societeVilleRcs || '-';
      data[p + 'SOCIETE_TYPE'] = dg.societeType || '-';
      data[p + 'SOCIETE_SIREN'] = dg.societeSiren || '-';
      data[p + 'REP_CIVILITE'] = dg.civilite || '-';
      data[p + 'REP_NOM'] = dg.nom ? dg.nom.toUpperCase() : '-';
      data[p + 'REP_PRENOM'] = dg.prenom || '-';
    }
  }

  return data;
}
window.collectFormDataForDocs = collectFormDataForDocs;

/* ===== SAVE / LOAD FORM DATA ===== */
function getSaveKey() {
  return window._currentFormaliteId ? 'formalist_creation_' + window._currentFormaliteId : 'formalist_creation';
}
window.getSaveKey = getSaveKey;

var SAVE_KEY = 'formalist_creation'; // legacy fallback
window.SAVE_KEY = SAVE_KEY;

function collectStepFields(stepNum) {
  var container = document.querySelector('.step-content[data-step="' + stepNum + '"]');
  if (!container) return [];
  var fields = container.querySelectorAll('input:not([type="file"]), select, textarea');
  var data = [];
  fields.forEach(function(f) { data.push(f.value); });
  return data;
}

function restoreStepFields(stepNum, data) {
  if (!data || !data.length) return;
  var container = document.querySelector('.step-content[data-step="' + stepNum + '"]');
  if (!container) return;
  var fields = container.querySelectorAll('input:not([type="file"]), select, textarea');
  fields.forEach(function(f, i) {
    if (i >= data.length || data[i] === undefined) return;
    _setFieldValueSync(f, data[i]);
  });
}

// Helper centralisé pour restaurer la valeur d'un champ en synchronisant ses custom-controls.
// - <select> : passe par setSelect (touche attribut selected → MutationObserver custom-select)
// - <input type="date"> : set value + dispatch change (custom date picker écoute change)
// - autres : simple .value
function _setFieldValueSync(f, v) {
  if (v === undefined) return;
  if (f.tagName === 'SELECT') {
    if (v && typeof window.setSelect === 'function') window.setSelect(f, v);
    else f.value = v;
    return;
  }
  if (f.tagName === 'INPUT' && f.type === 'date') {
    f.value = v;
    try { f.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
    if (typeof f._cdpSync === 'function') f._cdpSync();
    return;
  }
  f.value = v;
}
window._setFieldValueSync = _setFieldValueSync;

function saveFormData() {
  var data = {};
  data.currentStep = currentStep;
  data.formStarted = true;

  data.step1 = collectStepFields(1);

  var panels = document.querySelectorAll('#associe-panels .associe-panel');
  data.associeCount = panels.length;
  data.step2 = [];
  panels.forEach(function(panel) {
    var fields = panel.querySelectorAll('input:not([type="file"]), select, textarea');
    var panelData = [];
    fields.forEach(function(f) { panelData.push(f.value); });
    data.step2.push(panelData);
  });

  data.dirigeantPanels = [];
  document.querySelectorAll('#dirigeant-panels .associe-panel').forEach(function(panel, i) {
    var fields = panel.querySelectorAll('input:not([type="file"]), select, textarea');
    var panelData = [];
    fields.forEach(function(f) { panelData.push(f.value); });
    var sel = panel.querySelector('.dirigeant-panel-select');
    data.dirigeantPanels.push({ select: sel ? sel.value : '', fields: panelData });
  });
  var sel1 = document.getElementById('select-dirigeant-1');
  data.dirigeant1 = sel1 ? sel1.value : '';

  data.totalParts = getTotalParts();
  var partsInputs = document.querySelectorAll('.capital-parts-input');
  data.capitalParts = [];
  partsInputs.forEach(function(inp) { data.capitalParts.push(inp.value); });

  data.selectedOffer = selectedOffer || '';

  try {
    localStorage.setItem(getSaveKey(), JSON.stringify(data));
    registerFormalite(data);
  } catch(e) {}
}
window.saveFormData = saveFormData;

function registerFormalite(data) {
  try {
    var REGISTRY_KEY = 'formalist_formalites';
    var registry = [];
    var raw = localStorage.getItem(REGISTRY_KEY);
    if (raw) registry = JSON.parse(raw) || [];

    var step1 = data.step1 || [];
    var forme = step1[0] || 'SAS';
    var nomSociete = step1[1] || 'Sans nom';
    var capital = step1[6] || '';

    var premierAssocie = '';
    if (data.step2 && data.step2[0]) {
      var prenom = data.step2[0][1] || '';
      var nom = data.step2[0][2] || '';
      premierAssocie = (prenom + ' ' + nom).trim();
    }

    var status = 'progress';
    var stepLabel = '';
    var stepNames = ['', 'Soci\u00e9t\u00e9', 'Associ\u00e9s', 'Dirigeants', 'Capital', 'Documents', 'Offres', 'Termin\u00e9'];
    if (data.currentStep) stepLabel = stepNames[data.currentStep] || '';
    if (data.currentStep >= 7) status = 'done';

    var entry = {
      id: SAVE_KEY,
      type: 'Cr\u00e9ation ' + forme,
      societe: nomSociete,
      forme: forme,
      capital: capital,
      premierAssocie: premierAssocie,
      step: data.currentStep || 1,
      stepLabel: stepLabel,
      totalSteps: 7,
      status: status,
      updatedAt: new Date().toISOString()
    };

    var found = false;
    for (var i = 0; i < registry.length; i++) {
      if (registry[i].id === entry.id) {
        registry[i] = entry;
        found = true;
        break;
      }
    }
    if (!found) registry.unshift(entry);

    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch(e) {}
}
window.registerFormalite = registerFormalite;

function loadFormData() {
  var raw;
  try { raw = localStorage.getItem(getSaveKey()); } catch(e) { return false; }
  if (!raw) return false;
  var data;
  try { data = JSON.parse(raw); } catch(e) { return false; }
  if (!data || !data.formStarted) return false;

  if (data.step1) restoreStepFields(1, data.step1);
  var banqueSel = document.getElementById('banque-select');
  if (banqueSel && banqueSel.value === 'Autre') toggleBanqueAutre();

  if (data.associeCount && data.associeCount > 1) {
    for (var a = 2; a <= data.associeCount; a++) addAssocie();
  }
  // Helper: set value en respectant les custom-controls (select + date)
  var _setVal = _setFieldValueSync;

  if (data.step2 && data.step2.length) {
    var panels = document.querySelectorAll('#associe-panels .associe-panel');
    panels.forEach(function(panel, pi) {
      if (!data.step2[pi]) return;
      var fields = panel.querySelectorAll('input:not([type="file"]), select, textarea');
      fields.forEach(function(f, fi) {
        if (fi < data.step2[pi].length) _setVal(f, data.step2[pi][fi]);
      });
      var prenomInput = panel.querySelector('input[data-field="prenom"]');
      if (prenomInput) updateTabName(prenomInput);
      // Trigger toggleConjoint to rebuild conjoint-section if married/pacsé
      var sitMatSel = panel.querySelector('.sit-mat-select');
      if (sitMatSel && sitMatSel.value) toggleConjoint(sitMatSel);
    });
    // Re-restore conjoint fields after toggleConjoint rebuilt the sections
    panels.forEach(function(panel, pi) {
      if (!data.step2[pi]) return;
      var fields = panel.querySelectorAll('input:not([type="file"]), select, textarea');
      fields.forEach(function(f, fi) {
        if (fi < data.step2[pi].length && data.step2[pi][fi]) _setVal(f, data.step2[pi][fi]);
      });
    });
  }

  updateDirigeantLabels();
  refreshDirigeantSelects();
  if (data.dirigeantPanels && data.dirigeantPanels.length) {
    var firstPanel = document.querySelector('#dirigeant-panels .associe-panel[data-panel="1"]');
    if (firstPanel && data.dirigeantPanels[0]) {
      var fields = firstPanel.querySelectorAll('input:not([type="file"]), select, textarea');
      fields.forEach(function(f, fi) {
        if (fi < data.dirigeantPanels[0].fields.length) _setVal(f, data.dirigeantPanels[0].fields[fi]);
      });
      var sel1 = firstPanel.querySelector('.dirigeant-panel-select');
      if (sel1 && data.dirigeantPanels[0].select) {
        if (typeof window.setSelect === 'function') window.setSelect(sel1, data.dirigeantPanels[0].select);
        else sel1.value = data.dirigeantPanels[0].select;
        onDirigeantChange(sel1, 'dirigeant-form-1');
      }
      var dirPrenom = firstPanel.querySelector('input[data-field="dir-prenom"]');
      if (dirPrenom) updateDirigeantTabName(dirPrenom);
    }
    for (var di = 1; di < data.dirigeantPanels.length; di++) {
      addDirigeant();
      var allPanels = document.querySelectorAll('#dirigeant-panels .associe-panel');
      var lastPanel = allPanels[allPanels.length - 1];
      if (lastPanel) {
        var fields = lastPanel.querySelectorAll('input:not([type="file"]), select, textarea');
        fields.forEach(function(f, fi) {
          if (fi < data.dirigeantPanels[di].fields.length) _setVal(f, data.dirigeantPanels[di].fields[fi]);
        });
        var dSel = lastPanel.querySelector('.dirigeant-panel-select');
        if (dSel && data.dirigeantPanels[di].select) {
          if (typeof window.setSelect === 'function') window.setSelect(dSel, data.dirigeantPanels[di].select);
          else dSel.value = data.dirigeantPanels[di].select;
          var formId = lastPanel.querySelector('.dirigeant-extra').id;
          onDirigeantChange(dSel, formId);
        }
        var dirPrenom = lastPanel.querySelector('input[data-field="dir-prenom"]');
        if (dirPrenom) updateDirigeantTabName(dirPrenom);
      }
    }
    switchDirigeantTab(1);
  } else if (data.step3 || data.dgPanels || data.dirigeant1) {
    if (data.step3) {
      var firstPanel = document.querySelector('#dirigeant-panels .associe-panel[data-panel="1"]');
      if (firstPanel) {
        var pFields = firstPanel.querySelectorAll('input:not([type="file"]), select, textarea');
        pFields.forEach(function(f, fi) {
          if (fi < data.step3.length) f.value = data.step3[fi];
        });
      }
    }
    if (data.dirigeant1) {
      var sel1 = document.getElementById('select-dirigeant-1');
      if (sel1) { sel1.value = data.dirigeant1; onDirigeantChange(sel1, 'dirigeant-form-1'); }
    }
    if (data.dgPanels && data.dgPanels.length) {
      data.dgPanels.forEach(function(pd) {
        addDirigeant();
        var allPanels = document.querySelectorAll('#dirigeant-panels .associe-panel');
        var lastPanel = allPanels[allPanels.length - 1];
        if (lastPanel) {
          var fields = lastPanel.querySelectorAll('input:not([type="file"]), select, textarea');
          fields.forEach(function(f, fi) {
            if (fi < pd.fields.length) f.value = pd.fields[fi];
          });
          var dSel = lastPanel.querySelector('.dirigeant-panel-select');
          if (dSel && pd.select) {
            dSel.value = pd.select;
            var formId = lastPanel.querySelector('.dirigeant-extra').id;
            onDirigeantChange(dSel, formId);
          }
        }
      });
    }
    switchDirigeantTab(1);
  }

  if (data.totalParts) {
    var tpInput = document.getElementById('capital-total-parts');
    if (tpInput) tpInput.value = data.totalParts;
  }
  window._savedCapitalParts = data.capitalParts || [];

  if (data.selectedOffer) {
    selectedOffer = data.selectedOffer;
    var offerCard = document.querySelector('.pricing-card[data-offer="' + data.selectedOffer + '"]');
    if (offerCard) {
      offerCard.classList.add('selected');
      var btn = document.getElementById('btn-submit-offer');
      if (btn) btn.disabled = false;
    }
  }

  if (data.currentStep && data.currentStep >= 1) {
    document.getElementById('intro').style.display = 'none';
    document.getElementById('form-section').classList.add('active');

    var hasLifecycle = false;
    try { hasLifecycle = !!localStorage.getItem(getLcKey()) || !!localStorage.getItem('formalist_lifecycle'); } catch(e) {}
    var savedStep = hasLifecycle ? Math.min(data.currentStep, 7) : Math.min(data.currentStep, 6);
    document.querySelectorAll('.step-content').forEach(function(c) {
      c.classList.remove('active', 'enter-from-left');
      c.style.display = 'none';
    });
    currentStep = savedStep;
    var target = document.querySelector('.step-content[data-step="' + savedStep + '"]');
    if (target) {
      target.style.display = '';
      target.classList.add('active');
    }
    if (savedStep === 4) buildCapitalStep();
    if (savedStep === 5) buildDocStep();
    if (savedStep === 7) buildRecapStep();
    updateStepIndicators();
  }

  updateAssocieLabel();
  return true;
}
window.loadFormData = loadFormData;

// Parse "24 février 2026" → "2026-02-24" for <input type="date">
function parseFrenchDateToIso(s) {
  if (!s || typeof s !== 'string' || s === '-') return '';
  var mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  var m = s.trim().toLowerCase().match(/^(\d{1,2})\s+([a-zà-ÿ]+)\s+(\d{4})$/);
  if (!m) return '';
  var monthIdx = mois.indexOf(m[2]);
  if (monthIdx < 0) return '';
  return m[3] + '-' + ('0' + (monthIdx + 1)).slice(-2) + '-' + ('0' + parseInt(m[1])).slice(-2);
}
window.parseFrenchDateToIso = parseFrenchDateToIso;

// Prefill step 1 fields from semantic server data (used for legacy dossiers without _raw_step1)
function prefillStep1FromServerData(serverData, f) {
  var step1 = document.querySelector('.step-content[data-step="1"]');
  if (!step1) return;

  var adresseInput = step1.querySelector('input[placeholder="Adresse complète"]');
  var villeInput = step1.querySelector('input[placeholder="Ville"]');
  var cpInput = step1.querySelector('input[placeholder="Code postal"]');
  var ville = serverData.VILLE_SOCIETE && serverData.VILLE_SOCIETE !== '-' ? serverData.VILLE_SOCIETE : '';
  var siege = serverData.ADRESSE_SIEGE && serverData.ADRESSE_SIEGE !== '-' ? serverData.ADRESSE_SIEGE : '';
  // ADRESSE_SIEGE format: "adresse, CP ville" — extract parts
  var adresse = siege, cp = '';
  var commaIdx = siege.lastIndexOf(',');
  if (commaIdx > -1) {
    adresse = siege.slice(0, commaIdx).trim();
    var tail = siege.slice(commaIdx + 1).trim();
    var cpMatch = tail.match(/^(\d+)/);
    if (cpMatch) cp = cpMatch[1];
  }
  if (adresseInput && adresse) adresseInput.value = adresse;
  if (villeInput && ville) villeInput.value = ville;
  if (cpInput && cp) cpInput.value = cp;

  // Banque
  var banqueSel = document.getElementById('banque-select');
  var banque = serverData.NOM_BANQUE && serverData.NOM_BANQUE !== '-' ? serverData.NOM_BANQUE : '';
  if (banqueSel && banque) {
    var known = ['Qonto', 'Shine', 'Revolut Business'];
    var matched = known.find(function(k) { return banque.indexOf(k) === 0; });
    var banqueValue = matched || 'Autre';
    if (typeof window.setSelect === 'function') window.setSelect(banqueSel, banqueValue);
    else banqueSel.value = banqueValue;
    if (banqueValue === 'Autre') {
      var bNom = document.getElementById('banque-autre-nom');
      if (bNom) bNom.value = banque.split(' - ')[0];
      if (typeof toggleBanqueAutre === 'function') toggleBanqueAutre();
    }
  }

  // Mode de domiciliation
  var modeDomSel = document.getElementById('mode-domiciliation');
  if (modeDomSel && serverData.MODE_DOMICILIATION) {
    if (typeof window.setSelect === 'function') window.setSelect(modeDomSel, serverData.MODE_DOMICILIATION);
    else modeDomSel.value = serverData.MODE_DOMICILIATION;
  }

  // Option fiscale et Régime TVA — selects identifiés par leur label
  step1.querySelectorAll('.field select').forEach(function(s) {
    var lbl = s.closest('.field') && s.closest('.field').querySelector('label');
    if (!lbl) return;
    var t = lbl.textContent || '';
    if (t.match(/Option fiscale/i)) {
      var ofVal = serverData.OPTION_FISCALE || (serverData.OPTION_IS === true ? 'IS' : '');
      if (ofVal) {
        if (typeof window.setSelect === 'function') window.setSelect(s, ofVal);
        else s.value = ofVal;
      }
    } else if (t.match(/Régime TVA/i)) {
      if (serverData.REGIME_TVA) {
        if (typeof window.setSelect === 'function') window.setSelect(s, serverData.REGIME_TVA);
        else s.value = serverData.REGIME_TVA;
      }
    }
  });

  // Dates : date-debut-activite (id) + date clôture (2e input[type="date"])
  var dateDebutEl = document.getElementById('date-debut-activite');
  if (dateDebutEl && serverData.DATE_DEBUT_ACTIVITE) {
    var iso = parseFrenchDateToIso(serverData.DATE_DEBUT_ACTIVITE);
    if (iso) dateDebutEl.value = iso;
  }
  var dateInputs = step1.querySelectorAll('input[type="date"]');
  if (dateInputs[1] && serverData.DATE_CLOTURE) {
    // DATE_CLOTURE peut être "31 décembre" (sans année) ou "31 décembre 2026" (avec année)
    var rawClot = (serverData.DATE_CLOTURE || '').trim();
    var hasYear = /\d{4}\s*$/.test(rawClot);
    var clotFull = hasYear ? rawClot : (rawClot + ' ' + (serverData.ANNEE_PREMIER_EXERCICE || ''));
    var clotIso = parseFrenchDateToIso(clotFull);
    if (clotIso) dateInputs[1].value = clotIso;
  }

  // Durée de vie (input[type=number] avec value 99 par défaut)
  var dureeInputs = step1.querySelectorAll('input[type="number"]');
  // [0] = capital-social, [1] = durée de vie
  if (dureeInputs[1] && serverData.DUREE) dureeInputs[1].value = serverData.DUREE;

  // Objet social (textarea)
  var activiteArea = step1.querySelector('textarea');
  if (activiteArea) {
    var lines = [];
    for (var oi = 1; oi <= 6; oi++) {
      var v = serverData['OBJET_SOCIAL_' + oi];
      if (v && v !== '-') lines.push(v);
    }
    if (!lines.length && serverData.OBJET_SOCIAL && serverData.OBJET_SOCIAL !== '-') {
      lines = [serverData.OBJET_SOCIAL];
    }
    if (lines.length) activiteArea.value = lines.join('\n');
  }
}
window.prefillStep1FromServerData = prefillStep1FromServerData;

// Load a submitted formalite from server
function loadFormaliteFromServer(formaliteId) {
  fetch('/api/formalites/' + formaliteId).then(function(r) {
    if (r.status !== 200) throw new Error('not found');
    return r.json();
  }).then(function(result) {
    var f = result.formalite;
    if (!f || !f.data_json) throw new Error('no data');

    var serverData = typeof f.data_json === 'string' ? JSON.parse(f.data_json) : f.data_json;
    window._serverLoadedData = serverData;
    // Reset des flags de prefill différé pour ce nouveau load
    window._step3SemanticApplied = false;

    var formeEl = document.getElementById('forme-juridique');
    if (formeEl) {
      if (typeof window.setSelect === 'function') window.setSelect(formeEl, f.forme || 'SAS');
      else formeEl.value = f.forme || 'SAS';
    }

    var nomInput = document.querySelector('.step-content[data-step="1"] input[placeholder="Nom de la soci\u00e9t\u00e9"]');
    if (nomInput) nomInput.value = f.societe || '';

    var capitalInput = document.getElementById('capital-social');
    if (capitalInput) capitalInput.value = f.capital || 1;

    // Prefill step 1 \u2014 privil\u00e9gie un snapshot brut (_raw_step1), sinon parse les cl\u00e9s s\u00e9mantiques
    if (serverData._raw_step1 && serverData._raw_step1.length) {
      restoreStepFields(1, serverData._raw_step1);
      // Re-set selectors qui auraient pu \u00eatre \u00e9cras\u00e9s par restoreStepFields
      if (formeEl && f.forme) {
        if (typeof window.setSelect === 'function') window.setSelect(formeEl, f.forme);
        else formeEl.value = f.forme;
      }
      if (typeof toggleBanqueAutre === 'function') toggleBanqueAutre();
    } else {
      prefillStep1FromServerData(serverData, f);
    }
    // Rafra\u00eechit les widgets customis\u00e9s (.cselect, .cdp) apr\u00e8s le prefill \u2014 sans \u00e7a,
    // les selects/dates gardent leur trigger "Choisir\u2026" visible m\u00eame si la valeur sous-jacente
    // est correcte.
    if (typeof window.refreshAllCustomTriggers === 'function') window.refreshAllCustomTriggers();

    // Step 2 — associé panels : si on a un snapshot brut (_raw_step2_panels), on l'utilise
    // pour restaurer tous les champs fidèlement (civilité, email, type, adresse, dates, etc.).
    if (serverData._raw_step2_panels && serverData._raw_step2_panels.length) {
      var existing2 = document.querySelectorAll('#associe-panels .associe-panel').length;
      while (existing2 < serverData._raw_step2_panels.length) {
        if (typeof addAssocie === 'function') addAssocie();
        existing2++;
      }
      document.querySelectorAll('#associe-panels .associe-panel').forEach(function(panel, pi) {
        var saved = serverData._raw_step2_panels[pi];
        if (!saved || !saved.length) return;
        // Première passe : on cherche le select sit-mat (situation matrimoniale) et on le
        // restaure en PREMIER pour déclencher toggleConjoint qui crée la section conjoint.
        // Ensuite on re-query les fields pour inclure les inputs de la section conjoint.
        var initialFields = panel.querySelectorAll('input:not([type="file"]), select, textarea');
        var sitMatIdx = -1;
        initialFields.forEach(function(fInp, fi) {
          if (fInp.classList && fInp.classList.contains('sit-mat-select')) sitMatIdx = fi;
        });
        if (sitMatIdx >= 0 && saved[sitMatIdx]) {
          var sitMatSel = initialFields[sitMatIdx];
          if (typeof window.setSelect === 'function') window.setSelect(sitMatSel, saved[sitMatIdx]);
          else { sitMatSel.value = saved[sitMatIdx]; try { sitMatSel.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {} }
          // Force l'expansion conjoint si "Marié(e)" / "Pacsé(e)"
          if (typeof window.toggleConjoint === 'function') window.toggleConjoint(sitMatSel);
        }
        // Petite tempo pour laisser toggleConjoint insérer la section conjoint dans le DOM
        setTimeout(function() {
          var fields = panel.querySelectorAll('input:not([type="file"]), select, textarea');
          fields.forEach(function(fInp, fi) {
            if (fi < saved.length && saved[fi] !== undefined && saved[fi] !== null) {
              if (fInp.tagName === 'SELECT' && typeof window.setSelect === 'function') {
                window.setSelect(fInp, saved[fi]);
              } else {
                fInp.value = saved[fi];
                try { fInp.dispatchEvent(new Event('change', { bubbles: true })); } catch(_) {}
              }
            }
          });
          if (typeof window.refreshAllCustomTriggers === 'function') window.refreshAllCustomTriggers();
        }, 50);
      });
      // Met à jour le label des onglets associés (Prénom Nom) après restauration
      setTimeout(function() {
        document.querySelectorAll('#associe-panels .associe-panel').forEach(function(panel) {
          var pInp = panel.querySelector('input[data-field="prenom"]');
          if (pInp && typeof window.updateTabName === 'function') window.updateTabName(pInp);
        });
      }, 80);
    }
    // Step 3 — dirigeant panels (idem si snapshot disponible)
    if (serverData._raw_step3_panels && serverData._raw_step3_panels.length) {
      // Les panels dirigeants sont créés dynamiquement quand on entre dans step 3 — on les
      // restaurera lors de la navigation. Pour l'instant on conserve le snapshot dans une
      // var globale pour que dirigeants.js puisse l'utiliser.
      window._pendingStep3Restore = serverData._raw_step3_panels;
    }
    // Step 4 — capital parts : ces inputs sont créés dynamiquement par buildCapitalStep
    // (override dans app.js qui lit window._savedCapitalParts). On stocke donc le snapshot
    // dans cette même variable pour que la restauration se fasse automatiquement.
    if (serverData._raw_capital_parts && serverData._raw_capital_parts.length) {
      window._savedCapitalParts = serverData._raw_capital_parts;
    }
    if (serverData._raw_total_parts) {
      window._savedTotalParts = serverData._raw_total_parts;
    }

    // Fallback legacy : si pas de snapshot _raw_step2_panels, on parse depuis les clés sémantiques
    if (!serverData._raw_step2_panels || !serverData._raw_step2_panels.length) {
      var nbAssoc = 1;
      for (var k = 1; k <= 20; k++) {
        if (serverData['ACTIONNAIRE_' + k] && serverData['ACTIONNAIRE_' + k] !== '-') nbAssoc = k;
        else break;
      }
      for (var a = 2; a <= nbAssoc; a++) addAssocie();

      var panels = document.querySelectorAll('#associe-panels .associe-panel');
      panels.forEach(function(panel, i) {
        var idx = i + 1;
        var prenomInput = panel.querySelector('input[data-field="prenom"]');
        var nomField = panel.querySelector('input[data-field="nom"]');
        if (prenomInput && serverData['CIVILITE_NOM_PRENOM_' + idx]) {
          var parts = (serverData['CIVILITE_NOM_PRENOM_' + idx] || '').split(' ');
          if (parts.length >= 3) {
            prenomInput.value = parts.slice(2).join(' ');
            if (nomField) nomField.value = parts[1] || '';
          }
        }
        // Civilité (premier select du panel)
        var firstSel = panel.querySelector('select');
        if (firstSel && parts && parts[0]) {
          if (typeof window.setSelect === 'function') window.setSelect(firstSel, parts[0]);
          else firstSel.value = parts[0];
        }
        // Type d'associé (Personne physique / Personne morale) — 2e select du panel
        var allSelects = panel.querySelectorAll('select');
        var typeAssocSel = allSelects[1];
        if (typeAssocSel) {
          var isMorale = serverData['ASSOC_' + idx + '_EST_MORALE'] === true || serverData['ASSOC_' + idx + '_EST_MORALE'] === 'true';
          var typeVal = isMorale ? 'Personne morale' : 'Personne physique';
          if (typeof window.setSelect === 'function') window.setSelect(typeAssocSel, typeVal);
          else typeAssocSel.value = typeVal;
        }
        // Email
        var emailInput = panel.querySelector('input[data-field="email"]');
        if (emailInput && serverData['EMAIL_ASSOCIE_' + idx]) emailInput.value = serverData['EMAIL_ASSOCIE_' + idx];
        // Adresse
        var addrInput = panel.querySelector('input.addr-auto, input[placeholder="Adresse de l\'associé"]');
        if (addrInput && serverData['ADRESSE_ASSOCIE_' + idx] && serverData['ADRESSE_ASSOCIE_' + idx] !== '-') {
          addrInput.value = serverData['ADRESSE_ASSOCIE_' + idx];
        }
        // Date de naissance (au format "24 mars 1990" → "1990-03-24")
        var dateInput = panel.querySelector('input[type="date"]');
        if (dateInput && serverData['DATE_NAISSANCE_' + idx]) {
          var iso = parseFrenchDateToIso(serverData['DATE_NAISSANCE_' + idx]);
          if (iso) dateInput.value = iso;
        }
        // Lieu de naissance : "Paris (75001) (France)" → ville, CP, pays
        var lieu = serverData['LIEU_NAISSANCE_' + idx] || '';
        if (lieu && lieu !== '-') {
          var villeNaissInput = panel.querySelector('input.city-birth-auto, input[placeholder="Ville de naissance"]');
          var cpNaissInput = panel.querySelector('input.cp-birth, input[placeholder="Code postal"]');
          // Sépare la ville du reste : "ville (cp) (pays)" → ville
          var cpMatch = lieu.match(/\(([^()]*)\)/g);
          var ville = lieu.replace(/\([^()]*\)/g, '').trim();
          if (villeNaissInput && ville) villeNaissInput.value = ville;
          if (cpNaissInput && cpMatch && cpMatch[0]) cpNaissInput.value = cpMatch[0].replace(/[()]/g, '').trim();
        }
        // Nationalité
        var natInput = panel.querySelector('input[value="Française"], input.nat-input');
        if (natInput && serverData['NATIONALITE_' + idx]) natInput.value = serverData['NATIONALITE_' + idx];
        // Père / Mère
        var pereInput = panel.querySelector('input[placeholder*="père"]');
        var mereInput = panel.querySelector('input[placeholder*="mère"]');
        if (pereInput && serverData['NOM_PERE_' + idx] && serverData['NOM_PERE_' + idx] !== '-') pereInput.value = serverData['NOM_PERE_' + idx];
        if (mereInput && serverData['NOM_MERE_' + idx] && serverData['NOM_MERE_' + idx] !== '-') mereInput.value = serverData['NOM_MERE_' + idx];
        // Situation matrimoniale
        var sitSel = panel.querySelector('select.sit-mat-select');
        if (sitSel && serverData['SITUATION_MATRIMONIALE_' + idx]) {
          var v = serverData['SITUATION_MATRIMONIALE_' + idx];
          if (v.toLowerCase() === 'non') v = 'Marié(e)';
          // Capitalize : "célibataire" → "Célibataire"
          v = v.charAt(0).toUpperCase() + v.slice(1);
          if (typeof window.setSelect === 'function') window.setSelect(sitSel, v);
          else sitSel.value = v;
          if (typeof toggleConjoint === 'function') toggleConjoint(sitSel);
          // Si marié/pacsé, restaure aussi les infos du conjoint (depuis les clés CONJOINT_*_$N)
          if (v === 'Marié(e)' || v === 'Pacsé(e)') {
            setTimeout(function() {
              var conjSection = panel.querySelector('.conjoint-section');
              if (!conjSection) return;
              var cjSelects = conjSection.querySelectorAll('select');
              var cjInputs = conjSection.querySelectorAll('input');
              // Civilité conjoint
              if (cjSelects[0] && serverData['CONJOINT_CIVILITE_' + idx] && serverData['CONJOINT_CIVILITE_' + idx] !== '-') {
                if (typeof window.setSelect === 'function') window.setSelect(cjSelects[0], serverData['CONJOINT_CIVILITE_' + idx]);
                else cjSelects[0].value = serverData['CONJOINT_CIVILITE_' + idx];
              }
              // Nom conjoint
              if (cjInputs[0] && serverData['CONJOINT_NOM_' + idx] && serverData['CONJOINT_NOM_' + idx] !== '-') cjInputs[0].value = serverData['CONJOINT_NOM_' + idx];
              // Prénom conjoint
              if (cjInputs[1] && serverData['CONJOINT_PRENOM_' + idx] && serverData['CONJOINT_PRENOM_' + idx] !== '-') cjInputs[1].value = serverData['CONJOINT_PRENOM_' + idx];
              // Nom de naissance conjoint
              if (cjInputs[2] && serverData['CONJOINT_NOM_NAISSANCE_' + idx] && serverData['CONJOINT_NOM_NAISSANCE_' + idx] !== '-') cjInputs[2].value = serverData['CONJOINT_NOM_NAISSANCE_' + idx];
              // Date mariage (au format FR → ISO)
              if (cjInputs[3] && serverData['DATE_MARIAGE_' + idx]) {
                var isoMar = parseFrenchDateToIso(serverData['DATE_MARIAGE_' + idx]);
                if (isoMar) cjInputs[3].value = isoMar;
              }
              // Ville mariage
              if (cjInputs[4] && serverData['VILLE_MARIAGE_' + idx] && serverData['VILLE_MARIAGE_' + idx] !== '-') cjInputs[4].value = serverData['VILLE_MARIAGE_' + idx];
              // Contrat de mariage (uniquement pour Marié, pas Pacsé)
              if (v === 'Marié(e)' && cjSelects[1] && serverData['CONTRAT_MARIAGE_' + idx] && serverData['CONTRAT_MARIAGE_' + idx] !== '-') {
                if (typeof window.setSelect === 'function') window.setSelect(cjSelects[1], serverData['CONTRAT_MARIAGE_' + idx]);
                else cjSelects[1].value = serverData['CONTRAT_MARIAGE_' + idx];
              }
              if (typeof window.refreshAllCustomTriggers === 'function') window.refreshAllCustomTriggers();
            }, 50);
          }
        }
      });
      if (typeof window.refreshAllCustomTriggers === 'function') window.refreshAllCustomTriggers();
      // Met à jour le label des onglets associés (Prénom Nom)
      setTimeout(function() {
        document.querySelectorAll('#associe-panels .associe-panel').forEach(function(panel) {
          var pInp = panel.querySelector('input[data-field="prenom"]');
          if (pInp && typeof window.updateTabName === 'function') window.updateTabName(pInp);
        });
      }, 60);
    }

    selectedOffer = f.offer || 'starter';
    var offerCard = document.querySelector('.pricing-card[data-offer="' + selectedOffer + '"]');
    if (offerCard) offerCard.classList.add('selected');

    var lc = loadLifecycle();
    if (!lc.generatedAt) {
      lc.generatedAt = Date.now();
      lc.annonceLegaleReadyAt = lc.generatedAt + (15 * 60 * 1000);
      if (selectedOffer && selectedOffer !== 'starter') {
        lc.businessSubPhase = f.business_sub_phase || '5a';
      }
    }
    lc.phase = f.phase || 1;
    saveLifecycle(lc);

    document.getElementById('intro').style.display = 'none';
    document.getElementById('form-section').classList.add('active');
    document.querySelectorAll('.step-content').forEach(function(c) {
      c.classList.remove('active', 'enter-from-left');
      c.style.display = 'none';
    });
    currentStep = 7;
    var target = document.querySelector('.step-content[data-step="7"]');
    if (target) {
      target.style.display = '';
      target.classList.add('active');
    }
    updateStepIndicators();
    buildRecapStep();
    // Met \u00e0 jour le label/state du bouton d\u00e8s que les donn\u00e9es et l'offre sont charg\u00e9es
    if (typeof window.updateSubmitButtonLabel === 'function') {
      window.updateSubmitButtonLabel();
    }
    // Affiche le statut courant dans le recap-banner
    if (typeof window.renderStatusPill === 'function') {
      window.renderStatusPill(f.status || 'en_cours');
    }
    // Charge l'historique d'audit pour afficher les badges "Modifi\u00e9" persistants
    fetch('/api/formalites/' + formaliteId + '/audit').then(function(r){
      return r.ok ? r.json() : null;
    }).then(function(audit){
      if (!audit || !audit.entries || !audit.entries.length) return;
      // Normalise les colonnes DB \u2192 shape attendue par le badge ({field, before, after})
      var normalized = audit.entries
        .filter(function(e){ return e.action === 'field_update'; })
        .map(function(e){
          return { field: e.target_field, before: e.before_value, after: e.after_value, actor_name: e.actor_name, actor_role: e.actor_role, created_at: e.created_at };
        });
      // D\u00e9dup par champ (garde la 1re entr\u00e9e = la plus r\u00e9cente)
      var seen = {};
      var deduped = normalized.filter(function(e){
        if (seen[e.field]) return false;
        seen[e.field] = true;
        return true;
      });
      if (typeof window.markDocsAsModified === 'function') {
        window.markDocsAsModified(deduped);
      }
      // Passation : si un avocat se voit assigner un dossier d\u00e9j\u00e0 trait\u00e9 par un autre,
      // affiche un bandeau "Dossier repris de X" avec lien vers l'historique complet.
      if (typeof window.maybeShowHandoverBanner === 'function') {
        window.maybeShowHandoverBanner(audit.entries);
      }
    }).catch(function(){});
  }).catch(function(e) {
    console.error('Load formalite from server failed:', e);
    alert('Impossible de charger votre dossier. Veuillez r\u00e9essayer.');
  });
}
window.loadFormaliteFromServer = loadFormaliteFromServer;

Formalist.formData = {
  formatDateFr: formatDateFr,
  numberToFrench: numberToFrench,
  collectFormDataForDocs: collectFormDataForDocs,
  saveFormData: saveFormData,
  loadFormData: loadFormData,
  loadFormaliteFromServer: loadFormaliteFromServer,
  getSaveKey: getSaveKey,
  registerFormalite: registerFormalite
};
