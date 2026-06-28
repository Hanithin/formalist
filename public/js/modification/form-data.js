/**
 * Modification Form Data Module
 * collectModificationData() — gathers all form data for DOCX template rendering
 */
window.Formalist = window.Formalist || {};

function collectModificationData() {
  if (!modifSelectedTypes || modifSelectedTypes.length === 0) return {};
  // Use first type for backward compat, but iterate all
  var type = modifSelectedTypes[0];
  var config = ModifTypes[type];
  if (!config) return {};

  // Step 1 — Société info
  var forme = (document.getElementById('modif-forme') || {}).value || 'SAS';
  var nomSociete = (document.getElementById('modif-nom-societe') || {}).value || '';
  var siren = (document.getElementById('modif-siren') || {}).value || '';
  var adresseActuelle = (document.getElementById('modif-adresse-actuelle') || {}).value || '';
  var villeActuelle = (document.getElementById('modif-ville-actuelle') || {}).value || '';
  var cpActuel = (document.getElementById('modif-cp-actuel') || {}).value || '';
  var capitalActuel = (document.getElementById('modif-capital-actuel') || {}).value || '';
  var dateStatuts = (document.getElementById('modif-date-statuts') || {}).value || '';
  var rcsVille = (document.getElementById('modif-rcs-ville') || {}).value || '';

  var siegeActuel = adresseActuelle;
  if (cpActuel) siegeActuel += ', ' + cpActuel;
  if (villeActuelle) siegeActuel += ' ' + villeActuelle;

  var capitalVal = parseFloat(capitalActuel) || 0;

  // Step 2 — Modification fields (all selected types)
  var modifData = {};
  modifSelectedTypes.forEach(function(t) {
    var c = ModifTypes[t];
    if (c) {
      c.fields.forEach(function(f) {
        var el = document.getElementById(f.id);
        if (el) modifData[f.id] = el.value;
      });
    }
  });

  // Step 3 — Associés
  var associes = [];
  var totalParts = 0;
  document.querySelectorAll('#modif-associe-panels .associe-panel').forEach(function(p, i) {
    var civilite = (p.querySelector('[data-field="civilite"]') || {}).value || '';
    var prenom = (p.querySelector('[data-field="prenom"]') || {}).value || '';
    var nom = (p.querySelector('[data-field="nom"]') || {}).value || '';
    var parts = parseInt((p.querySelector('[data-field="parts"]') || {}).value) || 0;
    totalParts += parts;
    associes.push({
      index: i + 1,
      civilite: civilite,
      prenom: prenom,
      nom: nom,
      nomComplet: (civilite ? civilite + ' ' : '') + prenom + ' ' + nom,
      parts: parts
    });
  });

  // Date AGE = today
  var today = new Date();
  var dateAGE = today.toISOString().split('T')[0];
  var dateAGEFr = formatDateFr(dateAGE);

  // Build template data object
  var data = {
    // Société
    FORME_JURIDIQUE: forme,
    SOCIETE: nomSociete,
    SIREN: siren,
    SIEGE_SOCIAL: siegeActuel,
    ADRESSE_ACTUELLE: adresseActuelle,
    VILLE_ACTUELLE: villeActuelle,
    CP_ACTUEL: cpActuel,
    CAPITAL_MONTANT: capitalVal,
    CAPITAL_FORMATE: capitalVal.toLocaleString('fr-FR'),
    CAPITAL_LETTRES: numberToFrench(capitalVal),
    DATE_STATUTS: dateStatuts,
    DATE_STATUTS_FR: formatDateFr(dateStatuts),
    // Si l'utilisateur a saisi un RCS, on le respecte ; sinon on résout depuis le CP.
    // (Évite de saisir une commune sans tribunal, ex: Sainte-Foy-lès-Lyon → Lyon.)
    RCS_VILLE: (typeof window.resolveRcsCity === 'function'
      ? (rcsVille || window.resolveRcsCity(cpActuel, villeActuelle) || villeActuelle || '-')
      : (rcsVille || villeActuelle || '-')),

    // AGE
    DATE_AGE: dateAGEFr,
    NB_ASSOCIES: associes.length,
    TOTAL_PARTS: totalParts,
    TOTAL_PARTS_LETTRES: numberToFrench(totalParts),

    // Associés (flat for template)
    ASSOCIES: associes,
    ASSOCIE_LISTE: associes.map(function(a) {
      return a.nomComplet + ', d\u00e9tenant ' + a.parts + ' parts';
    }).join(' ; '),

    // Modification type(s)
    TYPE_MODIFICATION: modifSelectedTypes.join(','),
    LABEL_MODIFICATION: modifSelectedTypes.map(function(t) { return ModifTypes[t] ? ModifTypes[t].label : t; }).join(', '),
    NOMBRE_RESOLUTIONS: modifSelectedTypes.length,
    TYPES_LABEL: modifSelectedTypes.map(function(t) { return ModifTypes[t] ? ModifTypes[t].label : t; }).join(', '),

    // Conditionals for PV template sections (true if type is in selected list)
    IS_TRANSFERT_SIEGE: modifSelectedTypes.indexOf('transfert_siege') >= 0,
    IS_DENOMINATION: modifSelectedTypes.indexOf('denomination') >= 0,
    IS_DIRIGEANT: modifSelectedTypes.indexOf('dirigeant') >= 0,
    IS_OBJET_SOCIAL: modifSelectedTypes.indexOf('objet_social') >= 0,
    IS_AUGMENTATION_CAPITAL: modifSelectedTypes.indexOf('augmentation_capital') >= 0,
    IS_REDUCTION_CAPITAL: modifSelectedTypes.indexOf('reduction_capital') >= 0,
    IS_CESSION_PARTS: modifSelectedTypes.indexOf('cession_parts') >= 0,
    IS_PROROGATION: modifSelectedTypes.indexOf('prorogation') >= 0,

    // Forme conditionals
    IS_SAS: forme === 'SAS',
    IS_SASU: forme === 'SASU',
    IS_SARL: forme === 'SARL',
    IS_EURL: forme === 'EURL',
    IS_SCI: forme === 'SCI',
    IS_UNIPERSONNELLE: forme === 'SASU' || forme === 'EURL'
  };

  // Type-specific template variables (iterate all selected types)
  if (modifSelectedTypes.indexOf('transfert_siege') >= 0) {
    var nouvelleAdresse = modifData['nouvelle-adresse'] || '';
    var nouvelleVille = modifData['nouvelle-ville'] || '';
    var nouveauCp = modifData['nouveau-cp'] || '';
    var nouveauSiege = nouvelleAdresse;
    if (nouveauCp) nouveauSiege += ', ' + nouveauCp;
    if (nouvelleVille) nouveauSiege += ' ' + nouvelleVille;

    data.NOUVEAU_SIEGE = nouveauSiege;
    data.NOUVELLE_ADRESSE = nouvelleAdresse;
    data.NOUVELLE_VILLE = nouvelleVille;
    data.NOUVEAU_CP = nouveauCp;
    data.NOUVEAU_MODE_DOMICILIATION = modifData['nouveau-mode-domiciliation'] || '';
    // RCS du nouveau siège (utile pour la mention "Mention sera faite au RCS de …")
    data.NOUVEAU_RCS_VILLE = (typeof window.resolveRcsCity === 'function'
      ? (window.resolveRcsCity(nouveauCp, nouvelleVille) || nouvelleVille || '-')
      : (nouvelleVille || '-'));
    data.MEME_RESSORT = modifData['meme-ressort'] || '';
    data.DATE_EFFET_TRANSFERT = modifData['date-effet-transfert'] || '';
    data.DATE_EFFET_TRANSFERT_FR = formatDateFr(modifData['date-effet-transfert']);
  }

  if (modifSelectedTypes.indexOf('denomination') >= 0) {
    data.NOUVELLE_DENOMINATION = modifData['nouvelle-denomination'] || '';
    data.SIGLE = modifData['sigle'] || '';
    data.DATE_EFFET_DENOMINATION = modifData['date-effet-denomination'] || '';
    data.DATE_EFFET_DENOMINATION_FR = formatDateFr(modifData['date-effet-denomination']);
  }

  if (modifSelectedTypes.indexOf('dirigeant') >= 0) {
    data.TYPE_CHANGEMENT_DIRIGEANT = modifData['type-changement-dirigeant'] || '';
    data.FONCTION_DIRIGEANT = modifData['fonction-dirigeant'] || '';
    data.DATE_EFFET_DIRIGEANT = modifData['date-effet-dirigeant'] || '';
    data.DATE_EFFET_DIRIGEANT_FR = formatDateFr(modifData['date-effet-dirigeant']);
    data.IS_NOMINATION = (modifData['type-changement-dirigeant'] || '').toLowerCase() === 'nomination';
    data.IS_REVOCATION = (modifData['type-changement-dirigeant'] || '').toLowerCase() === 'r\u00e9vocation';
    data.IS_DEMISSION = (modifData['type-changement-dirigeant'] || '').toLowerCase() === 'd\u00e9mission';
    // Nomination
    data.NOUVEAU_DIRIGEANT_CIVILITE = modifData['nouveau-dirigeant-civilite'] || '';
    data.NOUVEAU_DIRIGEANT_NOM = modifData['nouveau-dirigeant-nom'] || '';
    data.NOUVEAU_DIRIGEANT_PRENOM = modifData['nouveau-dirigeant-prenom'] || '';
    data.NOUVEAU_DIRIGEANT_DATE_NAISSANCE = modifData['nouveau-dirigeant-date-naissance'] || '';
    data.NOUVEAU_DIRIGEANT_LIEU_NAISSANCE = modifData['nouveau-dirigeant-lieu-naissance'] || '';
    data.NOUVEAU_DIRIGEANT_NATIONALITE = modifData['nouveau-dirigeant-nationalite'] || '';
    data.NOUVEAU_DIRIGEANT_ADRESSE = modifData['nouveau-dirigeant-adresse'] || '';
    data.REMUNERATION_DIRIGEANT = modifData['remuneration-dirigeant'] || '';
    // Revocation
    data.DIRIGEANT_REVOQUE_NOM = modifData['dirigeant-revoque-nom'] || '';
    data.MOTIF_REVOCATION = modifData['motif-revocation'] || '';
    // Demission
    data.DIRIGEANT_DEMISSIONNAIRE_NOM = modifData['dirigeant-demissionnaire-nom'] || '';
  }

  if (modifSelectedTypes.indexOf('objet_social') >= 0) {
    data.OBJET_SOCIAL_ACTUEL = modifData['objet-social-actuel'] || '';
    data.NOUVEL_OBJET_SOCIAL = modifData['nouvel-objet-social'] || '';
    data.DATE_EFFET_OBJET = modifData['date-effet-objet'] || '';
    data.DATE_EFFET_OBJET_FR = formatDateFr(modifData['date-effet-objet']);
  }

  if (modifSelectedTypes.indexOf('augmentation_capital') >= 0) {
    data.CAPITAL_ACTUEL_AUGM = modifData['capital-actuel-augm'] || '';
    data.NOUVEAU_CAPITAL_AUGM = modifData['nouveau-capital-augm'] || '';
    data.MODE_AUGMENTATION = modifData['mode-augmentation'] || '';
    data.NB_PARTS_NOUVELLES = modifData['nb-parts-nouvelles'] || '';
    data.VALEUR_NOMINALE_AUGM = modifData['valeur-nominale-augm'] || '';
    data.PRIME_EMISSION = modifData['prime-emission'] || '';
    data.DATE_EFFET_AUGM = modifData['date-effet-augm'] || '';
    data.DATE_EFFET_AUGM_FR = formatDateFr(modifData['date-effet-augm']);
  }

  if (modifSelectedTypes.indexOf('reduction_capital') >= 0) {
    data.CAPITAL_ACTUEL_RED = modifData['capital-actuel-red'] || '';
    data.NOUVEAU_CAPITAL_RED = modifData['nouveau-capital-red'] || '';
    data.MOTIF_REDUCTION = modifData['motif-reduction'] || '';
    data.NB_PARTS_ANNULEES = modifData['nb-parts-annulees'] || '';
    data.DATE_EFFET_RED = modifData['date-effet-red'] || '';
    data.DATE_EFFET_RED_FR = formatDateFr(modifData['date-effet-red']);
  }

  if (modifSelectedTypes.indexOf('cession_parts') >= 0) {
    data.CEDANT_NOM = modifData['cedant-nom'] || '';
    data.CESSIONNAIRE_TYPE = modifData['cessionnaire-type'] || '';
    data.CESSIONNAIRE_NOM = modifData['cessionnaire-nom'] || '';
    data.CESSIONNAIRE_ADRESSE = modifData['cessionnaire-adresse'] || '';
    data.NB_PARTS_CEDEES = modifData['nb-parts-cedees'] || '';
    data.PRIX_CESSION = modifData['prix-cession'] || '';
    data.DATE_CESSION = modifData['date-cession'] || '';
    data.DATE_CESSION_FR = formatDateFr(modifData['date-cession']);
    data.AGREMENT_REQUIS = modifData['agrement-requis'] || '';
  }

  if (modifSelectedTypes.indexOf('prorogation') >= 0) {
    data.DUREE_ACTUELLE = modifData['duree-actuelle'] || '';
    data.NOUVELLE_DUREE = modifData['nouvelle-duree'] || '';
    data.DATE_EXPIRATION_ACTUELLE = modifData['date-expiration-actuelle'] || '';
    data.DATE_EXPIRATION_ACTUELLE_FR = formatDateFr(modifData['date-expiration-actuelle']);
  }

  return data;
}
window.collectModificationData = collectModificationData;
