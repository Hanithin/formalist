/**
 * Script de test — 2 actionnaires mariés (SAS)
 * Coller dans la console du navigateur sur /creation
 * Puis recharger la page.
 */
(function() {
  // Données de l'associé panel:
  // Ordre des champs dans un panel associé (DOM order):
  // [0] select civilité
  // [1] input prénom
  // [2] input nom
  // [3] select type d'associé
  // [4] input email
  // [5] input adresse
  // [6] input date naissance (type=date)
  // [7] input ville naissance
  // [8] input code postal naissance
  // [9] input pays naissance
  // [10] input nom père
  // [11] input nom mère
  // [12] input nationalité
  // [13] select situation matrimoniale
  // --- conjoint-section (if marié) ---
  // [14] select civilité conjoint
  // [15] input nom conjoint
  // [16] input prénom conjoint
  // [17] input nom de naissance conjoint
  // [18] input date mariage (type=date)
  // [19] input ville mariage
  // [20] select contrat de mariage

  var assoc1 = [
    'Monsieur',            // civilité
    'Jean',                // prénom
    'DUPONT',              // nom
    'Personne physique',   // type
    'jean.dupont@test.fr', // email
    '12 rue de la Paix, 75002 Paris', // adresse
    '1985-03-15',          // date naissance
    'Paris',               // ville naissance
    '75002',               // cp naissance
    'France',              // pays
    'Pierre DUPONT',       // père
    'Marie MARTIN',        // mère
    'Française',           // nationalité
    'Marié(e)',            // situation matrimoniale
    // conjoint fields
    'Madame',              // civilité conjoint
    'DURAND',              // nom conjoint
    'Sophie',              // prénom conjoint
    'DURAND',              // nom naissance conjoint
    '2010-06-20',          // date mariage
    'Lyon',                // ville mariage
    'Non',                 // contrat de mariage (= communauté réduite aux acquêts)
  ];

  var assoc2 = [
    'Madame',              // civilité
    'Claire',              // prénom
    'BERNARD',             // nom
    'Personne physique',   // type
    'claire.bernard@test.fr', // email
    '5 avenue des Champs, 69001 Lyon', // adresse
    '1990-07-22',          // date naissance
    'Lyon',                // ville naissance
    '69001',               // cp naissance
    'France',              // pays
    'Jacques BERNARD',     // père
    'Anne LEROY',          // mère
    'Française',           // nationalité
    'Marié(e)',            // situation matrimoniale
    // conjoint fields
    'Monsieur',            // civilité conjoint
    'PETIT',               // nom conjoint
    'Marc',                // prénom conjoint
    'PETIT',               // nom naissance conjoint
    '2015-09-12',          // date mariage
    'Marseille',           // ville mariage
    'Non',                 // contrat de mariage (= communauté réduite aux acquêts)
  ];

  // Step 1 fields order (from DOM):
  // [0] select forme juridique
  // [1] input nom société
  // [2] input adresse
  // [3] input ville
  // [4] input code postal
  // [5] select mode domiciliation
  // [6] input capital (number)
  // [7] select banque
  // [8-10] banque autre (hidden)
  // [11-12] banque autre ville/cp (hidden)
  // [13] input date début activité (date)
  // [14] input date clôture (date)
  // [15] input durée (number)
  // [16] select option fiscale
  // [17] select régime TVA
  // [18] input AI activité
  // [19] textarea activité

  var step1 = [
    'SAS',                            // forme juridique
    'Test Conjoint SAS',              // nom société
    '100 boulevard Haussmann',        // adresse
    'Paris',                          // ville
    '75008',                          // code postal
    'Bail commercial ou professionnel', // mode domiciliation
    '10000',                          // capital social
    'Qonto',                          // banque
    '', '', '', '', '',               // banque autre fields (empty)
    '2026-03-01',                     // date début
    '2026-12-31',                     // date clôture
    '99',                             // durée
    'IS',                             // option fiscale
    'Franchise en base de TVA',       // régime TVA
    '',                               // AI input
    'Conseil en informatique et développement de logiciels', // activité
  ];

  var data = {
    formStarted: true,
    currentStep: 2,  // Start at step 2 so associés are visible
    step1: step1,
    associeCount: 2,
    step2: [assoc1, assoc2],
    dirigeantPanels: [],
    dirigeant1: '',
    totalParts: 100,
    capitalParts: ['50', '50'],
    selectedOffer: '',
  };

  localStorage.setItem('formalist_creation', JSON.stringify(data));
  console.log('✅ Données de test injectées ! Rechargez la page (F5).');
  alert('Données de test injectées !\n\nRechargez la page (F5) pour voir le formulaire pré-rempli avec 2 actionnaires mariés.');
})();
