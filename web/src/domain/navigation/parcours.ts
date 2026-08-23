/**
 * Les parcours qu'on peut ouvrir, et rien d'autre.
 *
 * Depuis que la colonne ne liste plus que des destinations, cette table est le seul
 * endroit d'où l'on démarre une formalité. Elle vivait dans le composant du bouton ;
 * elle en sort pour deux raisons : un catalogue est une donnée, pas un balisage, et
 * un test doit pouvoir vérifier qu'aucun parcours livré n'y reste grisé - c'est
 * arrivé pour le dépôt des comptes et la fermeture, restés « bientôt » des semaines
 * après leur mise en service.
 *
 * Les intitulés sont tous des verbes : cette fenêtre dit ce qu'on va faire, quand la
 * colonne dit où l'on va. Le mélange des deux registres est ce qui rendait la
 * navigation confuse.
 *
 * Ils sont rangés par moment de la vie d'une société - on la crée, on la gère, on la
 * ferme - plutôt qu'alignés en une grille de six. Huit cartes à plat se lisent comme
 * un menu de restaurant : on parcourt tout avant de choisir. Rangées, on saute
 * directement à la famille qui nous concerne, et l'on découvre au passage ce que la
 * plateforme sait faire d'autre.
 */

export interface ParcoursACreer {
  lien: string;
  teinte: "green" | "blue" | "violet" | "amber" | "red" | "teal";
  icone: string;
  titre: string;
  description: string;
  /**
   * Parcours annoncé mais pas ouvert.
   *
   * Aucun n'en porte aujourd'hui, et c'est voulu : une carte grisée occupe la place
   * d'un choix sans en être un, et l'on clique dessus avant de comprendre. Un parcours
   * qui n'existe pas ne figure pas dans la fenêtre - il y entrera le jour où il
   * fonctionnera. Le drapeau reste pour le cas d'une ouverture annoncée à date, où le
   * dire vaut mieux que de laisser croire que la plateforme ne le fera jamais.
   */
  bientot?: boolean;
}

export interface FamilleDeParcours {
  titre: string;
  /** Ce que la famille recouvre, quand le titre seul ne suffit pas. */
  precision?: string;
  parcours: ParcoursACreer[];
}

export const FAMILLES: FamilleDeParcours[] = [
  {
    titre: "Créer",
    parcours: [
      {
        lien: "/creation?type=creation",
        teinte: "green",
        icone: '<path d="M3 21h18M5 21V7l7-4 7 4v14"/>',
        titre: "Créer une société",
        description: "SAS, SARL, SCI, SASU, EURL",
      },
      {
        lien: "/auto-entrepreneur",
        teinte: "blue",
        icone: '<circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>',
        titre: "Créer une auto-entreprise",
        description: "Micro-entreprise, en une déclaration",
      },
    ],
  },
  {
    titre: "Gérer ma société",
    parcours: [
      {
        lien: "/modification",
        teinte: "violet",
        icone:
          '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>' +
          '<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
        titre: "Modifier ma société",
        description: "Transfert, gérant, capital…",
      },
      {
        lien: "/depot-des-comptes",
        teinte: "amber",
        icone:
          '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>' +
          '<line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
        titre: "Déposer mes comptes annuels",
        description: "Approbation et dépôt au greffe",
      },
    ],
  },
  {
    titre: "Fermer",
    parcours: [
      {
        lien: "/fermeture",
        teinte: "red",
        icone:
          '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/>' +
          '<line x1="9" y1="9" x2="15" y2="15"/>',
        titre: "Fermer ma société",
        description: "Dissolution, liquidation, radiation",
      },
    ],
  },
  {
    titre: "Documents et conseil",
    parcours: [
      {
        lien: "/contrats",
        teinte: "teal",
        icone:
          '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>',
        titre: "Rédiger un contrat",
        description: "Modèles sur mesure",
      },
      {
        lien: "/consultations",
        teinte: "violet",
        icone:
          '<path d="M12 3v18"/><path d="M5 7h14"/><path d="M8 7l-4 7a4 4 0 008 0z"/>' +
          '<path d="M16 7l-4 7a4 4 0 008 0z"/>',
        titre: "Consulter un avocat",
        description: "Rendez-vous en visio, sous 48 heures",
      },
    ],
  },
];

/**
 * Tous les parcours, à plat.
 *
 * Les vérifications portent sur l'ensemble - qu'aucun ne soit grisé à tort, qu'aucun
 * ne double une entrée de la colonne - et n'ont que faire du rangement.
 */
export const PARCOURS: ParcoursACreer[] = FAMILLES.flatMap((f) => f.parcours);
