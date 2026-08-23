/**
 * La confidentialité des comptes déposés au greffe.
 *
 * Déposer n'est pas publier. Toute société commerciale dépose ses comptes ; une
 * partie d'entre elles peut demander qu'ils ne soient pas consultables par les tiers.
 * La déclaration ne dispense donc de rien - elle ferme l'accès, elle n'évite pas le
 * dépôt, et le greffe, l'administration et la Banque de France y accèdent toujours.
 *
 * Trois tailles, trois régimes, et une liste d'exclusions où beaucoup de sociétés
 * tombent sans le savoir - à commencer par les holdings.
 */

import { estCivile } from "./regles";

export type Taille = "micro" | "petite" | "moyenne" | "grande";

/**
 * Les seuils, pour les exercices ouverts depuis le 1er janvier 2024.
 *
 * Relevés par le décret du 28 février 2024, qui transpose la directive déléguée
 * 2023/2775. Deux critères sur trois suffisent : c'est la règle des seuils, et elle
 * se trompe souvent dans l'autre sens - on croit devoir les tenir tous les trois.
 */
export const SEUILS = {
  micro: { bilanCentimes: 450_000_00, caCentimes: 900_000_00, effectif: 10 },
  petite: { bilanCentimes: 7_500_000_00, caCentimes: 15_000_000_00, effectif: 50 },
  moyenne: { bilanCentimes: 25_000_000_00, caCentimes: 50_000_000_00, effectif: 250 },
} as const;

export interface Chiffres {
  totalBilanCentimes: number;
  chiffreAffairesCentimes: number;
  effectif: number;
}

/** Deux critères sur trois, non les trois. */
function tientLesSeuils(chiffres: Chiffres, seuils: (typeof SEUILS)[Taille & keyof typeof SEUILS]) {
  const tenus = [
    chiffres.totalBilanCentimes <= seuils.bilanCentimes,
    chiffres.chiffreAffairesCentimes <= seuils.caCentimes,
    chiffres.effectif <= seuils.effectif,
  ].filter(Boolean).length;

  return tenus >= 2;
}

export function tailleDeLEntreprise(chiffres: Chiffres): Taille {
  if (tientLesSeuils(chiffres, SEUILS.micro)) return "micro";
  if (tientLesSeuils(chiffres, SEUILS.petite)) return "petite";
  if (tientLesSeuils(chiffres, SEUILS.moyenne)) return "moyenne";
  return "grande";
}

/**
 * Ce qui écarte du dispositif, quelle que soit la taille.
 *
 * L'article L. 123-16-2 vise les sociétés dont l'activité même appelle la
 * transparence, et la micro-entreprise ajoute l'exclusion des sociétés qui gèrent des
 * titres de participations : une holding, précisément. C'est l'exclusion la moins
 * connue et celle qui piège le plus, parce que la déclaration se signe sur l'honneur
 * et qu'une fausse déclaration est un faux, passible d'amende et d'emprisonnement.
 */
export const EXCLUSIONS = [
  {
    cle: "credit",
    libelle: "Établissement de crédit, société de financement ou entreprise d'investissement",
    fondement: "Article L. 123-16-2 du code de commerce",
  },
  {
    cle: "assurance",
    libelle: "Entreprise d'assurance ou de réassurance, mutuelle, institution de prévoyance",
    fondement: "Article L. 123-16-2 du code de commerce",
  },
  {
    cle: "cotee",
    libelle: "Société dont les titres sont admis aux négociations sur un marché réglementé",
    fondement: "Article L. 123-16-2 du code de commerce",
  },
  {
    cle: "groupe",
    libelle: "Société appartenant à un groupe qui établit des comptes consolidés",
    fondement: "Article L. 123-16-2 du code de commerce",
  },
  {
    cle: "holding",
    libelle: "Société dont l'activité est la gestion de titres de participations et de valeurs mobilières",
    fondement: "Article L. 123-16-1 du code de commerce",
    /* Cette exclusion-ci ne ferme que la confidentialité totale des micro-entreprises. */
    microSeulement: true,
  },
] as const;

export type CleExclusion = (typeof EXCLUSIONS)[number]["cle"];

export interface Verdict {
  taille: Taille;
  /** Ce que la société peut demander à rendre confidentiel, ou rien. */
  portee: "tout" | "compte-de-resultat" | "aucune";
  /** Le modèle de déclaration à produire, ou null. */
  modele: "micro" | "petite" | null;
  /** Ce qui ferme le dispositif, quand il est fermé. */
  motifs: string[];
  explication: string;
}

/**
 * Ce que cette société peut demander.
 *
 * Une société civile ne dépose rien : la question ne se pose pas, et proposer une
 * déclaration lui ferait signer une attestation sans objet.
 */
export function confidentialitePossible(args: {
  forme: string | null | undefined;
  chiffres: Chiffres;
  exclusions: CleExclusion[];
}): Verdict {
  const taille = tailleDeLEntreprise(args.chiffres);

  if (estCivile(args.forme)) {
    return {
      taille,
      portee: "aucune",
      modele: null,
      motifs: [],
      explication:
        "Une société civile ne dépose pas ses comptes au greffe : ils ne sont donc jamais publics, et il n'y a rien à rendre confidentiel.",
    };
  }

  const retenues = EXCLUSIONS.filter((e) => args.exclusions.includes(e.cle));
  const bloquantes = retenues.filter((e) => !("microSeulement" in e && e.microSeulement));
  const motifs = retenues.map((e) => e.libelle + " (" + e.fondement + ")");

  if (bloquantes.length > 0) {
    return {
      taille,
      portee: "aucune",
      modele: null,
      motifs: bloquantes.map((e) => e.libelle + " (" + e.fondement + ")"),
      explication:
        "La société entre dans un cas d'exclusion : ses comptes restent consultables par les tiers.",
    };
  }

  if (taille === "micro" && retenues.length === 0) {
    return {
      taille,
      portee: "tout",
      modele: "micro",
      motifs: [],
      explication:
        "La société répond à la définition de la micro-entreprise : bilan, compte de résultat et annexe peuvent être rendus inaccessibles aux tiers.",
    };
  }

  if (taille === "micro" || taille === "petite") {
    return {
      taille,
      portee: "compte-de-resultat",
      modele: "petite",
      motifs,
      explication:
        taille === "micro"
          ? "La société tient les seuils de la micro-entreprise mais gère des titres de participations : la confidentialité totale lui est fermée. Elle garde celle du compte de résultat, ouverte aux petites entreprises."
          : "La société répond à la définition de la petite entreprise : seul le compte de résultat peut être rendu inaccessible aux tiers. Le bilan et l'annexe restent consultables.",
    };
  }

  return {
    taille,
    portee: "aucune",
    modele: null,
    motifs: [],
    explication:
      taille === "moyenne"
        ? "La société dépasse les seuils de la petite entreprise. Elle ne peut pas rendre ses comptes confidentiels, mais peut n'en publier qu'une présentation simplifiée."
        : "La société dépasse les seuils : ses comptes sont publiés intégralement.",
  };
}

/** Les seuils écrits pour un écran, avec ce que chacun ouvre. */
export function seuilsLisibles(): { taille: string; bilan: string; ca: string; effectif: string; ouvre: string }[] {
  return [
    {
      taille: "Micro-entreprise",
      bilan: "450 000 €",
      ca: "900 000 €",
      effectif: "10 salariés",
      ouvre: "Bilan, compte de résultat et annexe",
    },
    {
      taille: "Petite entreprise",
      bilan: "7 500 000 €",
      ca: "15 000 000 €",
      effectif: "50 salariés",
      ouvre: "Compte de résultat seul",
    },
    {
      taille: "Moyenne entreprise",
      bilan: "25 000 000 €",
      ca: "50 000 000 €",
      effectif: "250 salariés",
      ouvre: "Rien - présentation simplifiée possible",
    },
  ];
}
