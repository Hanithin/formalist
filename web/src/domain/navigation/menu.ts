import type { Role } from "@/domain/acces/regles";

/**
 * Le menu de l'application, décrit une seule fois.
 *
 * Il était recopié dans les vingt et une pages du serveur d'origine : 79 lignes
 * chacune. C'est de là que venaient la plupart des défauts d'affichage - une
 * entrée ajoutée dans une page et pas dans les autres, un lien resté sur l'ancien
 * nom, une balise mal fermée qui avalait toute la colonne dans une seule page.
 *
 * La colonne dit où l'on va, le bouton dit ce que l'on fait.
 *
 * Elle a longtemps fait les deux, et se répétait : « Démarrer une formalité » ouvre une
 * fenêtre qui contient exactement les six parcours que la colonne alignait deux
 * centimètres plus bas. Dix-sept entrées, dont cinq sous la ligne de flottaison d'un
 * portable ordinaire, pour un doublon.
 *
 * Les formalités ponctuelles - créer, modifier, fermer - ne vivent donc plus que dans
 * la fenêtre. Restent en colonne ce qui se consulte et les deux services qui
 * reviennent chaque année : on ne crée pas une société toutes les semaines, mais on
 * dépose ses comptes et l'on rédige des contrats régulièrement.
 *
 * Une rubrique vaut par ce qu'elle coiffe : aucune n'a moins de deux entrées, sans
 * quoi le titre pèse plus lourd que ce qu'il annonce. C'est ce qui a fait remonter
 * « Paramètres » dans la colonne - il était caché derrière une roue crantée de seize
 * pixels, que personne ne trouve, et il tient compagnie à « Équipe ».
 */

/** Le chiffre porté par une entrée. Le calcul est dans resumeColonne(). */
export type Compteur = "enCours" | "nonLus" | "aReviser";

export interface EntreeMenu {
  libelle: string;
  lien: string;
  /** Rôles autorisés. Absent : visible par tout le monde. */
  roles?: Role[];
  /** Parcours annoncé mais pas encore ouvert. */
  bientot?: boolean;
  compteur?: Compteur;
}

/** Un intertitre, qui ouvre un groupe d'entrées. */
export interface Rubrique {
  rubrique: string;
  /** Rôles autorisés, quand la rubrique entière est réservée. */
  roles?: Role[];
}

/** Un filet muet, qui détache sans annoncer. */
export const SEPARATEUR = "separateur" as const;

export type ElementMenu = EntreeMenu | Rubrique | typeof SEPARATEUR;

export function estRubrique(element: ElementMenu): element is Rubrique {
  return element !== SEPARATEUR && "rubrique" in element;
}

export function estEntree(element: ElementMenu): element is EntreeMenu {
  return element !== SEPARATEUR && "lien" in element;
}

/**
 * Le tableau de bord reste seul en tête, sans rubrique.
 *
 * C'est l'accueil : le coiffer d'un titre reviendrait à ranger la porte d'entrée dans
 * une catégorie.
 */
export const MENU: ElementMenu[] = [
  { libelle: "Tableau de bord", lien: "/tableau-de-bord" },

  /*
   * Ce que le client a engagé, et ce qui en sort.
   *
   * La messagerie y figure plutôt que sous un titre à elle : les échanges portent sur
   * les dossiers en cours, ils n'ont pas de vie propre. Une rubrique « Communication »
   * pour une seule entrée coûtait un titre pour rien.
   */
  { rubrique: "Mon activité" },
  { libelle: "Mes formalités", lien: "/formalites", compteur: "enCours" },
  /*
   * « Ma société » au singulier quand il n'y en a qu'une.
   *
   * « Mes sociétés » se lit alors comme une promesse d'en avoir plusieurs, ou comme un
   * menu qui ne concerne pas celui qui le voit. L'intitulé se substitue à l'affichage,
   * la colonne connaissant le nombre par son résumé.
   */
  { libelle: "Mes sociétés", lien: "/societes" },
  { libelle: "Mes documents", lien: "/documents" },
  { libelle: "Messagerie", lien: "/messagerie", compteur: "nonLus" },

  /*
   * Les services qui reviennent.
   *
   * On ne crée pas une société toutes les semaines, mais on dépose ses comptes chaque
   * année et l'on rédige un contrat quand il le faut. Ceux-là méritent une entrée
   * permanente ; les formalités ponctuelles - création, modification, fermeture -
   * vivent dans le bouton, qui est fait pour ça.
   */
  { rubrique: "Services juridiques" },
  { libelle: "Dépôt des comptes", lien: "/depot-des-comptes" },
  { libelle: "Contrats", lien: "/contrats" },
  { libelle: "Consultation juridique", lien: "/consultations" },

  /*
   * Le travail du cabinet.
   *
   * « Dossiers à réviser » plutôt qu'« Espace avocat » : le second nommait un lieu, le
   * premier annonce une charge - et il porte son compte, qui est ce qu'un avocat vient
   * lire en premier.
   */
  { rubrique: "Espace avocat", roles: ["avocat", "admin"] },
  { libelle: "Dossiers à réviser", lien: "/avocat", roles: ["avocat", "admin"], compteur: "aReviser" },
  { libelle: "Mes disponibilités", lien: "/avocat/disponibilites", roles: ["avocat", "admin"] },
  /*
   * La recherche au registre national.
   *
   * Elle a disparu de la colonne quand celle-ci est passée en rubriques, alors que
   * la page existe et reste réservée au cabinet : l'outil était devenu introuvable
   * autrement qu'en tapant son adresse.
   */
  {
    libelle: "Recherche d'entreprise",
    lien: "/recherche-entreprise",
    roles: ["avocat", "admin"],
  },
  { libelle: "Conversations support", lien: "/support", roles: ["admin"] },
  { libelle: "Administration", lien: "/administration", roles: ["admin"] },

  { rubrique: "Mon compte" },
  { libelle: "Équipe", lien: "/equipe" },
  { libelle: "Paramètres", lien: "/parametres" },

  /*
   * Le centre d'aide, détaché en pied.
   *
   * Il ne se range dans aucune rubrique : c'est le recours, et on doit le trouver sans
   * lire la colonne. Un filet suffit à le séparer, un titre l'aurait noyé.
   */
  SEPARATEUR,
  { libelle: "Centre d'aide", lien: "/aide" },
];

/**
 * Les pages qui n'ont pas d'entrée, et l'entrée à laquelle elles se rattachent.
 *
 * Un parcours de fermeture n'est plus dans la colonne, mais on y est bien quelque
 * part : sans rattachement, la colonne ne marquerait rien pendant tout le parcours,
 * et l'on perdrait le seul repère qui dit où l'on se trouve. Ces pages appartiennent
 * à « Mes formalités », d'où elles sont d'ailleurs reprises.
 */
const RATTACHEMENTS: Record<string, string> = {
  "/creation": "/formalites",
  "/auto-entrepreneur": "/formalites",
  "/modification": "/formalites",
  "/fermeture": "/formalites",
  // Le support d'un client est devenu un pan du centre d'aide.
  "/support": "/aide",
};

/** Les entrées seules, sans les intertitres. */
export function entreesDuMenu(menu: ElementMenu[]): EntreeMenu[] {
  return menu.filter(estEntree);
}

/**
 * Le menu tel que le voit un utilisateur, une fois ses rôles pris en compte.
 *
 * Retirer des entrées peut laisser une rubrique vide : un client perd les trois
 * entrées du cabinet, et « Cabinet » se retrouverait en bas de colonne à ne coiffer
 * plus rien. On écarte donc les rubriques qui n'ont plus d'entrée à annoncer.
 */
export function menuPour(roles: Role[]): ElementMenu[] {
  const visibles = MENU.filter(
    (e) => e === SEPARATEUR || !e.roles || e.roles.some((r) => roles.includes(r))
  );

  return visibles.filter((element, i) => {
    if (!estRubrique(element)) return true;
    // Une rubrique vaut par ce qui la suit, jusqu'à la rubrique - ou au filet - d'après.
    const suite = visibles.slice(i + 1);
    const fin = suite.findIndex((e) => e === SEPARATEUR || estRubrique(e));
    const groupe = fin === -1 ? suite : suite.slice(0, fin);
    return groupe.length > 0;
  });
}

/**
 * L'entrée correspondant à l'adresse courante.
 *
 * On prend la plus longue qui corresponde : /formalites et /formalites/12 doivent
 * l'une comme l'autre marquer « Mes formalités », sans que /formalites marque aussi
 * une hypothétique entrée /f.
 */
export function entreeActive(chemin: string, menu: ElementMenu[]): string | null {
  const liens = entreesDuMenu(menu).map((e) => e.lien.split("?")[0]);

  const correspond = (lien: string) => chemin === lien || chemin.startsWith(lien + "/");

  const candidats = liens.filter(correspond).sort((a, b) => b.length - a.length);
  if (candidats[0]) return candidats[0];

  // À défaut, la page se rattache peut-être à une entrée qui, elle, est dans la colonne.
  const rattache = Object.keys(RATTACHEMENTS)
    .filter(correspond)
    .sort((a, b) => b.length - a.length)[0];

  const cible = rattache ? RATTACHEMENTS[rattache] : null;
  return cible && liens.includes(cible) ? cible : null;
}
