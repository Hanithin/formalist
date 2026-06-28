/**
 * Modification Types Configuration
 * Defines the 8 modification types with their labels, fields, and required documents
 */

// SVG icons for modification type cards
var ModifIcons = {
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9h1"/><path d="M9 13h1"/><path d="M9 17h1"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>',
  trendUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  trendDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>',
  handshake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
};

// Helper: resolve PV template prefix from forme juridique
function modifPvPrefix(forme) {
  var prefix = (forme || 'sas').toLowerCase();
  if (prefix === 'eurl') prefix = 'sasu';
  return prefix;
}

// Helper: standard docs (PV only) — used by most types
function modifStandardDocs(pvName) {
  return function(forme) {
    return [{ name: pvName, template: 'modif-pv-transfert-siege-' + modifPvPrefix(forme) + '.docx', type: 'pdf', icon: 'file' }];
  };
}

window.ModifTypes = {
  transfert_siege: {
    key: 'transfert_siege',
    label: 'Transfert de si\u00e8ge social',
    shortLabel: 'Si\u00e8ge social',
    icon: ModifIcons.building,
    desc: 'Transf\u00e9rer l\u2019adresse du si\u00e8ge social',
    docsCount: '3-4 docs',
    fields: [
      { id: 'nouvelle-adresse', label: 'Nouvelle adresse', type: 'text', placeholder: 'Adresse compl\u00e8te', full: true, required: true },
      { id: 'nouvelle-ville', label: 'Nouvelle ville', type: 'text', placeholder: 'Ville', required: true },
      { id: 'nouveau-cp', label: 'Nouveau code postal', type: 'text', placeholder: 'Code postal', required: true },
      { id: 'nouveau-mode-domiciliation', label: 'Mode de domiciliation', type: 'select', options: ['', 'Bail commercial ou professionnel', 'Soci\u00e9t\u00e9 de domiciliation', 'Domicile personnel du dirigeant'], required: false },
      { id: 'meme-ressort', label: 'M\u00eame ressort du tribunal ?', type: 'select', options: ['', 'Oui', 'Non'], required: true, tooltip: 'Si le nouveau si\u00e8ge est dans le m\u00eame ressort, les formalit\u00e9s sont simplifi\u00e9es.' },
      { id: 'date-effet-transfert', label: 'Date d\u2019effet du transfert', type: 'date', required: true }
    ],
    docs: modifStandardDocs('PV d\u2019Assembl\u00e9e G\u00e9n\u00e9rale Extraordinaire')
  },

  denomination: {
    key: 'denomination',
    label: 'Changement de d\u00e9nomination',
    shortLabel: 'D\u00e9nomination',
    icon: ModifIcons.edit,
    desc: 'Changer le nom de la soci\u00e9t\u00e9',
    docsCount: '3 docs',
    fields: [
      { id: 'nouvelle-denomination', label: 'Nouvelle d\u00e9nomination sociale', type: 'text', placeholder: 'Nouveau nom', full: true, required: true },
      { id: 'sigle', label: 'Sigle (optionnel)', type: 'text', placeholder: 'Ex : ABC', required: false },
      { id: 'date-effet-denomination', label: 'Date d\u2019effet', type: 'date', required: true }
    ],
    docs: modifStandardDocs('PV d\u2019AGE \u2014 Changement de d\u00e9nomination')
  },

  dirigeant: {
    key: 'dirigeant',
    label: 'Changement de dirigeant',
    shortLabel: 'Dirigeant',
    icon: ModifIcons.user,
    desc: 'Nommer, r\u00e9voquer ou d\u00e9mission',
    docsCount: '2-3 docs',
    fields: [
      { id: 'type-changement-dirigeant', label: 'Type de changement', type: 'select', options: ['', 'Nomination', 'R\u00e9vocation', 'D\u00e9mission'], full: true, required: true },
      { id: 'fonction-dirigeant', label: 'Fonction', type: 'select', options: ['', 'Pr\u00e9sident', 'G\u00e9rant', 'Directeur g\u00e9n\u00e9ral', 'Co-g\u00e9rant'], required: true },
      { id: 'date-effet-dirigeant', label: 'Date de prise d\u2019effet', type: 'date', required: true },
      // Nomination fields
      { id: 'nouveau-dirigeant-civilite', label: 'Civilit\u00e9', type: 'select', options: ['', 'Monsieur', 'Madame'], showIf: 'nomination' },
      { id: 'nouveau-dirigeant-nom', label: 'Nom', type: 'text', placeholder: 'Nom', showIf: 'nomination' },
      { id: 'nouveau-dirigeant-prenom', label: 'Pr\u00e9nom', type: 'text', placeholder: 'Pr\u00e9nom', showIf: 'nomination' },
      { id: 'nouveau-dirigeant-date-naissance', label: 'Date de naissance', type: 'date', showIf: 'nomination' },
      { id: 'nouveau-dirigeant-lieu-naissance', label: 'Lieu de naissance', type: 'text', placeholder: 'Ville, Pays', showIf: 'nomination' },
      { id: 'nouveau-dirigeant-nationalite', label: 'Nationalit\u00e9', type: 'text', placeholder: 'Fran\u00e7aise', showIf: 'nomination' },
      { id: 'nouveau-dirigeant-adresse', label: 'Adresse personnelle', type: 'text', placeholder: 'Adresse compl\u00e8te', full: true, showIf: 'nomination' },
      { id: 'remuneration-dirigeant', label: 'R\u00e9mun\u00e9ration', type: 'select', options: ['', 'Non r\u00e9mun\u00e9r\u00e9', 'Fixe', 'Variable'], showIf: 'nomination' },
      // Revocation fields
      { id: 'dirigeant-revoque-nom', label: 'Nom du dirigeant r\u00e9voqu\u00e9', type: 'text', placeholder: 'Nom Pr\u00e9nom', full: true, showIf: 'revocation' },
      { id: 'motif-revocation', label: 'Motif (optionnel)', type: 'textarea', placeholder: 'Motif de la r\u00e9vocation...', full: true, showIf: 'revocation' },
      // Demission fields
      { id: 'dirigeant-demissionnaire-nom', label: 'Nom du dirigeant d\u00e9missionnaire', type: 'text', placeholder: 'Nom Pr\u00e9nom', full: true, showIf: 'demission' }
    ],
    docs: function(forme) {
      return [
        { name: 'PV d\u2019AGE \u2014 Changement de dirigeant', template: 'modif-pv-transfert-siege-' + modifPvPrefix(forme) + '.docx', type: 'pdf', icon: 'file' },
        { name: 'D\u00e9claration de non-condamnation et de filiation', template: 'modif-declaration-non-condamnation.docx', type: 'pdf', icon: 'file' }
      ];
    }
  },

  objet_social: {
    key: 'objet_social',
    label: 'Modification de l\u2019objet social',
    shortLabel: 'Objet social',
    icon: ModifIcons.clipboard,
    desc: 'Modifier l\u2019activit\u00e9 de la soci\u00e9t\u00e9',
    docsCount: '3 docs',
    fields: [
      { id: 'objet-social-actuel', label: 'Objet social actuel', type: 'textarea', placeholder: 'Objet social actuel...', full: true, required: false },
      { id: 'nouvel-objet-social', label: 'Nouvel objet social', type: 'textarea', placeholder: 'Nouvel objet social...', full: true, required: true },
      { id: 'date-effet-objet', label: 'Date d\u2019effet', type: 'date', required: true }
    ],
    docs: modifStandardDocs('PV d\u2019AGE \u2014 Modification objet social')
  },

  augmentation_capital: {
    key: 'augmentation_capital',
    label: 'Augmentation de capital',
    shortLabel: 'Capital +',
    icon: ModifIcons.trendUp,
    desc: 'Augmenter le capital social',
    docsCount: '3-4 docs',
    fields: [
      { id: 'capital-actuel-augm', label: 'Capital actuel (\u20ac)', type: 'number', placeholder: '1000', required: true },
      { id: 'nouveau-capital-augm', label: 'Nouveau capital (\u20ac)', type: 'number', placeholder: '5000', required: true },
      { id: 'mode-augmentation', label: 'Mode d\u2019augmentation', type: 'select', options: ['', 'Apport en num\u00e9raire', 'Incorporation de r\u00e9serves', 'Apport en nature'], full: true, required: true },
      { id: 'nb-parts-nouvelles', label: 'Nombre de parts/actions nouvelles', type: 'number', placeholder: '100' },
      { id: 'valeur-nominale-augm', label: 'Valeur nominale', type: 'number', placeholder: '10' },
      { id: 'prime-emission', label: 'Prime d\u2019\u00e9mission (\u20ac)', type: 'number', placeholder: '0' },
      { id: 'date-effet-augm', label: 'Date d\u2019effet', type: 'date', required: true }
    ],
    docs: modifStandardDocs('PV d\u2019AGE \u2014 Augmentation de capital')
  },

  reduction_capital: {
    key: 'reduction_capital',
    label: 'R\u00e9duction de capital',
    shortLabel: 'Capital -',
    icon: ModifIcons.trendDown,
    desc: 'R\u00e9duire le capital social',
    docsCount: '3 docs',
    fields: [
      { id: 'capital-actuel-red', label: 'Capital actuel (\u20ac)', type: 'number', placeholder: '5000', required: true },
      { id: 'nouveau-capital-red', label: 'Nouveau capital (\u20ac)', type: 'number', placeholder: '1000', required: true },
      { id: 'motif-reduction', label: 'Motif', type: 'select', options: ['', 'Pertes', 'Remboursement aux associ\u00e9s'], required: true },
      { id: 'nb-parts-annulees', label: 'Nombre de parts annul\u00e9es', type: 'number', placeholder: '40' },
      { id: 'date-effet-red', label: 'Date d\u2019effet', type: 'date', required: true }
    ],
    docs: modifStandardDocs('PV d\u2019AGE \u2014 R\u00e9duction de capital')
  },

  cession_parts: {
    key: 'cession_parts',
    label: 'Cession de parts/actions',
    shortLabel: 'Cession',
    icon: ModifIcons.handshake,
    desc: 'C\u00e9der des parts ou actions',
    docsCount: '3-4 docs',
    fields: [
      { id: 'cedant-nom', label: 'Nom du c\u00e9dant', type: 'text', placeholder: 'Nom Pr\u00e9nom', required: true },
      { id: 'cessionnaire-type', label: 'Le cessionnaire est', type: 'select', options: ['', 'Un associ\u00e9 existant', 'Un tiers (nouvel associ\u00e9)'], required: true },
      { id: 'cessionnaire-nom', label: 'Nom du cessionnaire', type: 'text', placeholder: 'Nom Pr\u00e9nom', required: true },
      { id: 'cessionnaire-adresse', label: 'Adresse du cessionnaire', type: 'text', placeholder: 'Adresse compl\u00e8te', full: true, showIf: 'tiers' },
      { id: 'nb-parts-cedees', label: 'Nombre de parts c\u00e9d\u00e9es', type: 'number', placeholder: '50', required: true },
      { id: 'prix-cession', label: 'Prix de cession (\u20ac)', type: 'number', placeholder: '500', required: true },
      { id: 'date-cession', label: 'Date de cession', type: 'date', required: true },
      { id: 'agrement-requis', label: 'Agr\u00e9ment requis ?', type: 'select', options: ['', 'Oui', 'Non'] }
    ],
    docs: function(forme) {
      return [
        { name: 'Acte de cession de parts', template: 'modif-acte-cession.docx', type: 'pdf', icon: 'file' },
        { name: 'PV d\u2019AGE \u2014 Cession de parts', template: 'modif-pv-transfert-siege-' + modifPvPrefix(forme) + '.docx', type: 'pdf', icon: 'file' }
      ];
    }
  },

  prorogation: {
    key: 'prorogation',
    label: 'Prorogation de dur\u00e9e',
    shortLabel: 'Prorogation',
    icon: ModifIcons.clock,
    desc: 'Prolonger la dur\u00e9e de la soci\u00e9t\u00e9',
    docsCount: '3 docs',
    fields: [
      { id: 'duree-actuelle', label: 'Dur\u00e9e actuelle (ann\u00e9es)', type: 'number', placeholder: '99', required: true },
      { id: 'nouvelle-duree', label: 'Nouvelle dur\u00e9e (ann\u00e9es)', type: 'number', placeholder: '99', required: true },
      { id: 'date-expiration-actuelle', label: 'Date d\u2019expiration actuelle', type: 'date', required: true }
    ],
    docs: modifStandardDocs('PV d\u2019AGE \u2014 Prorogation de dur\u00e9e')
  }
};

// Ordered keys for display
window.ModifTypeKeys = [
  'transfert_siege', 'denomination', 'dirigeant', 'objet_social',
  'augmentation_capital', 'reduction_capital', 'cession_parts', 'prorogation'
];
