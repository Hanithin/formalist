/**
 * Les conventions réglementées, et ce que l'assemblée doit en faire.
 *
 * Une convention passée entre la société et l'un de ses dirigeants ou associés
 * importants n'est ni libre ni interdite : elle se déclare, et l'assemblée en prend
 * acte au moment d'approuver les comptes. Trois régimes se croisent, et les modèles
 * les confondent régulièrement.
 *
 * Le plus fréquent des malentendus : croire qu'une société unipersonnelle y échappe.
 * Elle n'y échappe pas - elle est dispensée du rapport et du vote, mais la mention au
 * registre des décisions reste obligatoire, et c'est elle qui rend la convention
 * opposable.
 */

import { estCivile, estUnipersonnelle } from "./regles";

export type RegimeConventions = "rapport-et-vote" | "mention-au-registre" | "sans-objet";

export interface Regime {
  regime: RegimeConventions;
  /** L'article qui fonde le contrôle, pour le citer dans l'acte. */
  article: string;
  /** Qui établit le rapport spécial, quand il en faut un. */
  rapportPar: "commissaire aux comptes" | "président" | "gérant" | null;
  explication: string;
}

/**
 * Ce que cette société doit faire de ses conventions.
 *
 * `avecCommissaire` change le rédacteur du rapport, non son existence : quand il y a
 * un commissaire aux comptes, c'est lui qui l'établit ; sinon, c'est le dirigeant.
 */
export function regimeDesConventions(args: {
  forme: string | null | undefined;
  avecCommissaire: boolean;
  /** Une société civile exerçant une activité économique y est soumise, pas les autres. */
  activiteEconomique?: boolean;
}): Regime {
  const forme = (args.forme ?? "").toUpperCase().trim();

  if (estCivile(forme)) {
    if (!args.activiteEconomique) {
      return {
        regime: "sans-objet",
        article: "",
        rapportPar: null,
        explication:
          "Une société civile qui se borne à gérer son patrimoine n'est soumise à aucun contrôle des conventions réglementées : le code de commerce ne la vise pas, et le code civil n'en prévoit pas. Les modèles qui citent un article pour la SCI se trompent d'article.",
      };
    }
    return {
      regime: "rapport-et-vote",
      article: "L. 612-5 du code de commerce",
      rapportPar: args.avecCommissaire ? "commissaire aux comptes" : "gérant",
      explication:
        "Exerçant une activité économique, la société relève de l'article L. 612-5 : les conventions passées avec ses dirigeants font l'objet d'un rapport, sur lequel les associés délibèrent.",
    };
  }

  const societeParActions = forme.startsWith("SAS") || forme === "SA";
  const article = societeParActions
    ? "L. 227-10 du code de commerce"
    : "L. 223-19 du code de commerce";

  if (estUnipersonnelle(forme)) {
    return {
      regime: "mention-au-registre",
      article,
      rapportPar: null,
      explication:
        "La société n'ayant qu'un associé, il n'y a ni rapport à présenter ni vote à tenir : les conventions sont seulement mentionnées au registre des décisions. Cette mention n'est pas facultative - c'est elle qui rend la convention opposable.",
    };
  }

  return {
    regime: "rapport-et-vote",
    article,
    rapportPar: args.avecCommissaire
      ? "commissaire aux comptes"
      : societeParActions
        ? "président"
        : "gérant",
    explication: args.avecCommissaire
      ? "Le commissaire aux comptes établit un rapport spécial sur les conventions ; les associés statuent dessus au moment d'approuver les comptes."
      : "À défaut de commissaire aux comptes, le dirigeant établit lui-même le rapport spécial sur les conventions ; les associés statuent dessus au moment d'approuver les comptes.",
  };
}

/**
 * Ce qui échappe au contrôle, et ce qui est purement interdit.
 *
 * La dispense des conventions courantes est celle dont on abuse le plus : elle
 * suppose une opération habituelle pour la société ET des conditions de marché. Un
 * loyer versé au gérant n'est pas courant parce qu'il revient tous les mois.
 */
export const CONVENTIONS_LIBRES =
  "Les conventions portant sur des opérations courantes et conclues à des conditions normales échappent au contrôle (articles L. 227-11 et L. 223-20 du code de commerce). Les deux conditions se cumulent : l'opération doit être habituelle pour la société, et ses conditions celles du marché.";

export const CONVENTIONS_INTERDITES =
  "Restent interdits, à peine de nullité, les emprunts, découverts en compte courant et cautions consentis par la société à un dirigeant personne physique ou à ses proches (articles L. 227-12 et L. 223-21 du code de commerce).";

/** Les natures de convention proposées à la saisie, dans l'ordre de fréquence. */
export const NATURES_DE_CONVENTION = [
  "Compte courant d'associé",
  "Bail ou mise à disposition d'un bien",
  "Prestation de services",
  "Rémunération ou avantage consenti au dirigeant",
  "Caution, aval ou garantie",
  "Achat ou vente de biens ou de services",
  "Convention intragroupe",
  "Cession ou souscription de titres",
  "Mandat particulier confié à un dirigeant",
  "Autre convention",
] as const;

export interface Convention {
  nature: string;
  /** Avec qui : le nom et la qualité de la personne intéressée. */
  partie: string;
  objet: string;
  /** En centimes ; nul quand la convention n'a pas de montant chiffrable. */
  montantCentimes: number;
  modalites: string;
  /** Conclue pendant l'exercice, ou poursuivie depuis un exercice antérieur. */
  poursuivie: boolean;
}

export function conventionVide(): Convention {
  return {
    nature: "",
    partie: "",
    objet: "",
    montantCentimes: 0,
    modalites: "",
    poursuivie: false,
  };
}

export interface AnomalieDeConvention {
  champ: string;
  message: string;
}

/** Ce qui manque à une convention pour figurer dans un acte sans trou. */
export function verifierConventions(conventions: Convention[]): AnomalieDeConvention[] {
  const anomalies: AnomalieDeConvention[] = [];

  conventions.forEach((convention, rang) => {
    if (!convention.nature.trim()) {
      anomalies.push({ champ: "convention-" + rang + "-nature", message: "Dites de quoi il s'agit" });
    }
    if (!convention.partie.trim()) {
      anomalies.push({
        champ: "convention-" + rang + "-partie",
        message: "Nommez la personne intéressée et sa qualité",
      });
    }
    if (!convention.objet.trim()) {
      anomalies.push({
        champ: "convention-" + rang + "-objet",
        message: "Décrivez l'objet de la convention : le rapport doit permettre d'en juger",
      });
    }
  });

  return anomalies;
}
