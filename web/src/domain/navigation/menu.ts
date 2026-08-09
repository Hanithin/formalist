import type { Role } from "@/domain/acces/regles";

/**
 * Le menu de l'application, décrit une seule fois.
 *
 * Il était recopié dans les vingt et une pages du serveur d'origine : 79 lignes
 * chacune. C'est de là que venaient la plupart des défauts d'affichage - une
 * entrée ajoutée dans une page et pas dans les autres, un lien resté sur l'ancien
 * nom, une balise mal fermée qui avalait toute la colonne dans une seule page.
 */

export interface EntreeMenu {
  libelle: string;
  lien: string;
  /** Rôles autorisés. Absent : visible par tout le monde. */
  roles?: Role[];
  /** Parcours annoncé mais pas encore ouvert. */
  bientot?: boolean;
}

export interface GroupeMenu {
  titre?: string;
  entrees: EntreeMenu[];
}

export const MENU: GroupeMenu[] = [
  {
    entrees: [
      { libelle: "Tableau de bord", lien: "/tableau-de-bord" },
      { libelle: "Mes formalités", lien: "/formalites" },
    ],
  },
  {
    titre: "Ma société",
    entrees: [
      { libelle: "Créer une société", lien: "/creation?type=creation" },
      { libelle: "Modifier ma société", lien: "/modification" },
      { libelle: "Dépôt des comptes", lien: "/depot-des-comptes", bientot: true },
      { libelle: "Fermer ma société", lien: "/fermeture", bientot: true },
    ],
  },
  {
    titre: "Mes contenus",
    entrees: [
      { libelle: "Documents", lien: "/documents" },
      { libelle: "Contrats", lien: "/contrats" },
      { libelle: "Consultation juridique", lien: "/consultations" },
      { libelle: "Messagerie", lien: "/messagerie" },
    ],
  },
  {
    titre: "Mon équipe",
    entrees: [
      { libelle: "Équipe", lien: "/equipe" },
      { libelle: "Espace avocat", lien: "/avocat", roles: ["avocat", "admin"] },
      { libelle: "Administration", lien: "/administration", roles: ["admin"] },
    ],
  },
  {
    entrees: [
      { libelle: "Paramètres", lien: "/parametres" },
      { libelle: "Aide & FAQ", lien: "/aide" },
    ],
  },
];

/** Le menu tel que le voit un utilisateur, une fois ses rôles pris en compte. */
export function menuPour(roles: Role[]): GroupeMenu[] {
  return MENU.map((groupe) => ({
    titre: groupe.titre,
    entrees: groupe.entrees.filter((e) => !e.roles || e.roles.some((r) => roles.includes(r))),
  })).filter((groupe) => groupe.entrees.length > 0);
}

/**
 * L'entrée correspondant à l'adresse courante.
 *
 * On prend la plus longue qui corresponde : /formalites et /formalites/12 doivent
 * l'une comme l'autre marquer « Mes formalités », sans que /formalites marque aussi
 * une hypothétique entrée /f.
 */
export function entreeActive(chemin: string, groupes: GroupeMenu[]): string | null {
  const candidats = groupes
    .flatMap((g) => g.entrees)
    .map((e) => e.lien.split("?")[0])
    .filter((lien) => chemin === lien || chemin.startsWith(lien + "/"))
    .sort((a, b) => b.length - a.length);

  return candidats[0] ?? null;
}
