import { type EtatContrat } from "./catalogue";

/**
 * Le parcours d'un contrat, dit avec des mots que tout le monde comprend.
 *
 * La base parle en états techniques - brouillon, genere, en_validation, valide - et la
 * page les affichait tels quels. « En validation » ne dit ni qui valide, ni ce qu'on
 * attend, ni s'il y a quelque chose à faire de son côté. Or c'est la seule question que
 * se pose celui qui regarde la liste : est-ce à moi de jouer ?
 *
 * Chaque état porte donc trois choses : un nom, ce qui se passe, et à qui la main.
 *
 * La signature ne se fait pas ici. Formalist produit le document, et l'avocat le relit
 * si on le lui demande ; les parties signent ensuite comme elles l'entendent. L'état
 * « signe » subsiste pour les contrats enregistrés avant cette décision, mais rien n'y
 * mène plus.
 */

export type AQuiLaMain = "vous" | "avocat" | "personne";

export interface EtatLisible {
  code: EtatContrat;
  /** Le mot affiché sur la pastille. */
  libelle: string;
  /** Ce qui se passe à cette étape, en une phrase. */
  explication: string;
  main: AQuiLaMain;
}

export const ETATS: EtatLisible[] = [
  {
    code: "brouillon",
    libelle: "À compléter",
    explication: "Il manque des informations : reprenez-le pour le terminer.",
    main: "vous",
  },
  {
    code: "genere",
    libelle: "Prêt",
    explication: "Le document est prêt. Téléchargez-le et faites-le signer.",
    main: "personne",
  },
  {
    code: "en_validation",
    libelle: "En relecture",
    explication: "L'avocat le relit. Vous êtes prévenu dès qu'il a terminé.",
    main: "avocat",
  },
  {
    code: "valide",
    libelle: "Relu par l'avocat",
    explication: "L'avocat l'a relu et validé. Téléchargez-le et faites-le signer.",
    main: "personne",
  },
  {
    code: "signe",
    libelle: "Signé",
    explication: "Ce contrat a été signé avant que la signature quitte la plateforme.",
    main: "personne",
  },
];

export function etatLisible(brut: string | null | undefined): EtatLisible {
  // Un état inconnu vaut brouillon : c'est le plus prudent, il invite à reprendre le
  // contrat plutôt qu'à croire qu'il est abouti.
  return ETATS.find((e) => e.code === brut) ?? ETATS[0];
}

/**
 * Le geste attendu, ou rien.
 *
 * Une liste où chaque ligne porte un bouton finit par en porter un qui ne sert pas.
 * Ici, l'action n'existe que là où il y a vraiment quelque chose à faire - et un
 * contrat prêt se télécharge, ce qui est une action de la ligne, non une étape du
 * parcours.
 */
export function actionAttendue(brut: string | null | undefined): string | null {
  const etat = etatLisible(brut);
  if (etat.code === "brouillon") return "Compléter";
  return null;
}

/* ---------- Les deux offres ---------- */

export type Offre = "document" | "relecture";

export interface OffreProposee {
  code: Offre;
  libelle: string;
  description: string;
  /** L'état où le contrat s'arrête une fois l'offre choisie. */
  aboutit: EtatContrat;
}

/**
 * Ce qu'on peut demander, et rien d'autre.
 *
 * Deux offres, parce qu'il n'y a que deux besoins : avoir le document, ou l'avoir
 * relu. L'offre n'est pas stockée à part - elle se lit dans l'état où le contrat
 * s'arrête, et une colonne de plus n'aurait rien dit que celui-ci ne dise déjà.
 */
export const OFFRES: OffreProposee[] = [
  {
    code: "document",
    libelle: "Le document seul",
    description:
      "Nous rédigeons le contrat à partir de vos informations. Vous le recevez tout de suite, prêt à être signé.",
    aboutit: "genere",
  },
  {
    code: "relecture",
    libelle: "Relu par un avocat",
    description:
      "Un avocat relit le contrat, le corrige si besoin, et vous le rend validé. Comptez quelques jours ouvrés.",
    aboutit: "en_validation",
  },
];

export function offreProposee(code: string): OffreProposee | null {
  return OFFRES.find((o) => o.code === code) ?? null;
}

/* ---------- Le classement de la liste ---------- */

export type FiltreContrat = "tous" | "encours" | "relecture" | "prets";

export const FILTRES: { valeur: FiltreContrat; libelle: string }[] = [
  { valeur: "tous", libelle: "Tous" },
  { valeur: "encours", libelle: "À compléter" },
  { valeur: "relecture", libelle: "En relecture" },
  { valeur: "prets", libelle: "Prêts" },
];

/**
 * Les filtres suivent ce qu'on cherche, non la table.
 *
 * Les états techniques sont cinq, et proposer cinq filtres reviendrait à demander de
 * les connaître. On regroupe donc par question : qu'est-ce qui m'attend, qu'est-ce qui
 * attend l'avocat, qu'est-ce qui est disponible.
 */
export function dansLeFiltre(brut: string | null | undefined, filtre: FiltreContrat): boolean {
  if (filtre === "tous") return true;

  const etat = etatLisible(brut);
  if (filtre === "encours") return etat.code === "brouillon";
  if (filtre === "relecture") return etat.code === "en_validation";
  return etat.code === "genere" || etat.code === "valide" || etat.code === "signe";
}

export function comptesParFiltre(
  contrats: { status: string | null }[]
): Record<FiltreContrat, number> {
  return {
    tous: contrats.length,
    encours: contrats.filter((c) => dansLeFiltre(c.status, "encours")).length,
    relecture: contrats.filter((c) => dansLeFiltre(c.status, "relecture")).length,
    prets: contrats.filter((c) => dansLeFiltre(c.status, "prets")).length,
  };
}

/**
 * Ce qui attend un geste passe devant.
 *
 * Un contrat à compléter n'a pas à se retrouver sous trois contrats terminés : ce qui
 * bloque se voit d'abord, le reste du plus récent au plus ancien.
 */
export function parUrgence<T extends { status: string | null; majLe: Date | null }>(
  contrats: T[]
): T[] {
  const rang = (statut: string | null) => {
    const main = etatLisible(statut).main;
    if (main === "vous") return 0;
    if (main === "avocat") return 1;
    return 2;
  };

  return [...contrats].sort((a, b) => {
    const ecart = rang(a.status) - rang(b.status);
    if (ecart !== 0) return ecart;
    return (b.majLe?.getTime() ?? 0) - (a.majLe?.getTime() ?? 0);
  });
}
