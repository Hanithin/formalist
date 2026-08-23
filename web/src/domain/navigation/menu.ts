import type { Role } from "@/domain/acces/regles";

/**
 * Le menu de l'application, décrit une seule fois.
 *
 * Il était recopié dans les vingt et une pages du serveur d'origine : 79 lignes
 * chacune. C'est de là que venaient la plupart des défauts d'affichage - une
 * entrée ajoutée dans une page et pas dans les autres, un lien resté sur l'ancien
 * nom, une balise mal fermée qui avalait toute la colonne dans une seule page.
 *
 * La colonne a longtemps été plate, comme celle d'origine : douze entrées à la file,
 * séparées par un filet muet. Elle en compte dix-huit aujourd'hui, et le filet ne
 * suffisait plus - cinq parcours de formalité s'y lisaient comme cinq pages parmi
 * d'autres, entre « Mes formalités » et « Consultation juridique ».
 *
 * Les rubriques les regroupent. Un titre coûte une ligne, et rend visible ce que la
 * colonne fait : d'un côté ce qu'on entreprend, de l'autre ce qu'on consulte.
 *
 * « Paramètres » n'y figure pas, comme à l'origine : on y accède par la roue
 * crantée du pied de colonne.
 */

/** Le chiffre porté par une entrée. Le calcul est dans resumeColonne(). */
export type Compteur = "enCours" | "nonLus";

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

export type ElementMenu = EntreeMenu | Rubrique;

export function estRubrique(element: ElementMenu): element is Rubrique {
  return "rubrique" in element;
}

/**
 * Le tableau de bord reste seul en tête, sans rubrique.
 *
 * C'est l'accueil : le coiffer d'un titre reviendrait à ranger la porte d'entrée
 * dans une catégorie. « Mes formalités » ouvre en revanche le groupe des parcours -
 * on y crée, et juste au-dessus on retrouve ce qu'on a créé.
 */
export const MENU: ElementMenu[] = [
  { libelle: "Tableau de bord", lien: "/tableau-de-bord" },

  { rubrique: "Formalités" },
  { libelle: "Mes formalités", lien: "/formalites", compteur: "enCours" },
  { libelle: "Créer une société", lien: "/creation?type=creation" },
  { libelle: "Créer une auto-entreprise", lien: "/auto-entrepreneur" },
  { libelle: "Modifier ma société", lien: "/modification" },
  { libelle: "Dépôt des comptes", lien: "/depot-des-comptes" },
  { libelle: "Fermer ma société", lien: "/fermeture" },

  { rubrique: "Mon espace" },
  { libelle: "Consultation juridique", lien: "/consultations" },
  { libelle: "Documents", lien: "/documents" },
  { libelle: "Contrats", lien: "/contrats" },
  { libelle: "Messagerie", lien: "/messagerie", compteur: "nonLus" },
  { libelle: "Support", lien: "/support" },

  { rubrique: "Compte" },
  { libelle: "Équipe", lien: "/equipe" },
  { libelle: "Aide & FAQ", lien: "/aide" },

  { rubrique: "Cabinet", roles: ["avocat", "admin"] },
  { libelle: "Espace avocat", lien: "/avocat", roles: ["avocat", "admin"] },
  { libelle: "Recherche d'entreprise", lien: "/recherche-entreprise", roles: ["avocat", "admin"] },
  { libelle: "Administration", lien: "/administration", roles: ["admin"] },
];

/** Les entrées seules, sans les intertitres. */
export function entreesDuMenu(menu: ElementMenu[]): EntreeMenu[] {
  return menu.filter((e): e is EntreeMenu => !estRubrique(e));
}

/**
 * Le menu tel que le voit un utilisateur, une fois ses rôles pris en compte.
 *
 * Retirer des entrées peut laisser une rubrique vide : un client perd les trois
 * entrées du cabinet, et « Cabinet » se retrouverait en bas de colonne à ne coiffer
 * plus rien. On écarte donc les rubriques qui n'ont plus d'entrée à annoncer.
 */
export function menuPour(roles: Role[]): ElementMenu[] {
  const visibles = MENU.filter((e) => !e.roles || e.roles.some((r) => roles.includes(r)));

  return visibles.filter((element, i) => {
    if (!estRubrique(element)) return true;
    // Une rubrique vaut par ce qui la suit, jusqu'à la rubrique d'après.
    const suite = visibles.slice(i + 1);
    const fin = suite.findIndex(estRubrique);
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
  const candidats = entreesDuMenu(menu)
    .map((e) => e.lien.split("?")[0])
    .filter((lien) => chemin === lien || chemin.startsWith(lien + "/"))
    .sort((a, b) => b.length - a.length);

  return candidats[0] ?? null;
}
