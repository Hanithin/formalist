import type { Role } from "@/domain/acces/regles";

/**
 * Le menu de l'application, décrit une seule fois.
 *
 * Il était recopié dans les vingt et une pages du serveur d'origine : 79 lignes
 * chacune. C'est de là que venaient la plupart des défauts d'affichage - une
 * entrée ajoutée dans une page et pas dans les autres, un lien resté sur l'ancien
 * nom, une balise mal fermée qui avalait toute la colonne dans une seule page.
 *
 * La colonne est plate, comme celle d'origine : douze entrées à la file, séparées
 * par un filet, sans titre de rubrique. Les titres avaient été introduits en
 * passant à Next ; ils ajoutaient trois lignes de blanc et un niveau de lecture
 * que la colonne d'origine n'avait pas.
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

/** Un filet de séparation, sans libellé. */
export const SEPARATEUR = "separateur" as const;

export type ElementMenu = EntreeMenu | typeof SEPARATEUR;

export const MENU: ElementMenu[] = [
  { libelle: "Tableau de bord", lien: "/tableau-de-bord" },
  { libelle: "Mes formalités", lien: "/formalites", compteur: "enCours" },
  { libelle: "Créer une société", lien: "/creation?type=creation" },
  { libelle: "Créer une auto-entreprise", lien: "/auto-entrepreneur" },
  { libelle: "Modifier ma société", lien: "/modification" },
  { libelle: "Dépôt des comptes", lien: "/depot-des-comptes" },
  { libelle: "Fermer ma société", lien: "/fermeture", bientot: true },
  { libelle: "Consultation juridique", lien: "/consultations" },
  { libelle: "Documents", lien: "/documents" },
  { libelle: "Contrats", lien: "/contrats" },
  { libelle: "Messagerie", lien: "/messagerie", compteur: "nonLus" },
  { libelle: "Support", lien: "/support" },
  SEPARATEUR,
  { libelle: "Équipe", lien: "/equipe" },
  { libelle: "Aide & FAQ", lien: "/aide" },
  SEPARATEUR,
  { libelle: "Espace avocat", lien: "/avocat", roles: ["avocat", "admin"] },
  { libelle: "Recherche d'entreprise", lien: "/recherche-entreprise", roles: ["avocat", "admin"] },
  { libelle: "Administration", lien: "/administration", roles: ["admin"] },
];

/** Les entrées seules, sans les filets. */
export function entreesDuMenu(menu: ElementMenu[]): EntreeMenu[] {
  return menu.filter((e): e is EntreeMenu => e !== SEPARATEUR);
}

/**
 * Le menu tel que le voit un utilisateur, une fois ses rôles pris en compte.
 *
 * Retirer des entrées peut laisser un filet en trop : un client perd les trois
 * entrées de métier, et le second séparateur se retrouverait en bas de colonne, à
 * séparer le vide. On écarte donc les filets qui n'ont plus rien à séparer.
 */
export function menuPour(roles: Role[]): ElementMenu[] {
  const visibles = MENU.filter(
    (e) => e === SEPARATEUR || !e.roles || e.roles.some((r) => roles.includes(r))
  );

  return visibles.filter((element, i) => {
    if (element !== SEPARATEUR) return true;
    const avant = visibles.slice(0, i).some((e) => e !== SEPARATEUR);
    const apres = visibles.slice(i + 1).some((e) => e !== SEPARATEUR);
    const doublon = visibles[i - 1] === SEPARATEUR;
    return avant && apres && !doublon;
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
