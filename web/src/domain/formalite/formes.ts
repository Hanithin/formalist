/**
 * Formes juridiques et ce qu'elles imposent.
 *
 * Ces règles étaient éparpillées dans public/js/creation/, sous forme de tests
 * répétés - `forme === "EURL" || forme === "SASU"` apparaît à cinq endroits, avec
 * des variantes. Les rassembler ici les rend vérifiables et évite qu'une règle
 * corrigée à un endroit reste fausse ailleurs.
 *
 * Les montants sont ceux du droit français au 10 août 2026. Ils changent : ils
 * sont déclarés ici, une fois, et non recopiés dans les écrans.
 */

export type Forme = "SASU" | "SAS" | "EURL" | "SARL" | "SCI" | "SA";

export interface RegleForme {
  code: Forme;
  libelle: string;
  /** Une forme unipersonnelle n'admet qu'un associé, par construction. */
  unipersonnelle: boolean;
  associesMin: number;
  associesMax: number | null;
  /** Capital minimum en euros. Zéro quand la loi n'en impose aucun. */
  capitalMinimum: number;
  /** Comment s'appelle celui qui dirige : le mot figure dans les actes. */
  titreDirigeant: "Président" | "Gérant";
  /** Part du capital à libérer à la constitution, en fraction de 1. */
  liberationMinimale: number;
  description: string;
  /**
   * Proposée au client ?
   *
   * Une forme sans gabarit de statuts ne peut aboutir à rien : la proposer
   * conduirait le client jusqu'à la génération, où plus rien ne serait possible.
   * Les règles restent déclarées, prêtes pour le jour où les gabarits existent.
   */
  disponible: boolean;
}

export const FORMES: Record<Forme, RegleForme> = {
  SASU: {
    code: "SASU",
    libelle: "SASU",
    unipersonnelle: true,
    associesMin: 1,
    associesMax: 1,
    capitalMinimum: 0,
    titreDirigeant: "Président",
    liberationMinimale: 0.5,
    description: "Société par actions simplifiée à associé unique.",
  disponible: true,
  },
  SAS: {
    code: "SAS",
    libelle: "SAS",
    unipersonnelle: false,
    associesMin: 2,
    associesMax: null,
    capitalMinimum: 0,
    titreDirigeant: "Président",
    liberationMinimale: 0.5,
    description: "Société par actions simplifiée, à plusieurs associés.",
  disponible: true,
  },
  EURL: {
    code: "EURL",
    libelle: "EURL",
    unipersonnelle: true,
    associesMin: 1,
    associesMax: 1,
    capitalMinimum: 0,
    titreDirigeant: "Gérant",
    liberationMinimale: 0.2,
    description: "Société à responsabilité limitée à associé unique.",
  disponible: true,
  },
  SARL: {
    code: "SARL",
    libelle: "SARL",
    unipersonnelle: false,
    associesMin: 2,
    associesMax: 100,
    capitalMinimum: 0,
    titreDirigeant: "Gérant",
    liberationMinimale: 0.2,
    description: "Société à responsabilité limitée, de 2 à 100 associés.",
  disponible: true,
  },
  SCI: {
    code: "SCI",
    libelle: "SCI",
    unipersonnelle: false,
    associesMin: 2,
    associesMax: null,
    capitalMinimum: 0,
    titreDirigeant: "Gérant",
    liberationMinimale: 0,
    description: "Société civile immobilière, pour détenir un bien à plusieurs.",
  disponible: true,
  },
  SA: {
    code: "SA",
    libelle: "SA",
    unipersonnelle: false,
    associesMin: 2,
    associesMax: null,
    capitalMinimum: 37_000,
    titreDirigeant: "Président",
    liberationMinimale: 0.5,
    description: "Société anonyme. Capital minimum de 37 000 euros.",
    // Aucun gabarit de statuts n'existe pour la SA : voir templates/.
    disponible: false,
  },
};

/** Les formes réellement proposables, gabarits à l'appui. */
export const FORMES_PROPOSEES: Forme[] = (Object.keys(FORMES) as Forme[]).filter(
  (f) => FORMES[f].disponible
);

/** Toutes les formes décrites, disponibles ou non. */
export const TOUTES_LES_FORMES: Forme[] = Object.keys(FORMES) as Forme[];

export function estForme(valeur: string | null | undefined): valeur is Forme {
  return !!valeur && valeur in FORMES;
}

export function regle(forme: string | null | undefined): RegleForme | null {
  return estForme(forme) ? FORMES[forme] : null;
}

/** Une forme unipersonnelle n'admet qu'un associé : l'écran s'y adapte. */
export function estUnipersonnelle(forme: string | null | undefined, nombreAssocies = 0): boolean {
  const r = regle(forme);
  if (r) return r.unipersonnelle;
  // Forme non reconnue : on se rabat sur le nombre d'associés saisis, comme le
  // faisait le formulaire d'origine.
  return nombreAssocies <= 1;
}

export interface Anomalie {
  champ: string;
  message: string;
}

/** Ce qui empêche de constituer la société en l'état. */
export function verifierCapital(forme: string, capital: number, libere: number): Anomalie[] {
  const r = regle(forme);
  if (!r) return [{ champ: "forme", message: "Forme juridique inconnue" }];

  const anomalies: Anomalie[] = [];

  if (!Number.isFinite(capital) || capital <= 0) {
    anomalies.push({ champ: "capital", message: "Le capital doit être supérieur à zéro" });
    return anomalies;
  }

  if (capital < r.capitalMinimum) {
    anomalies.push({
      champ: "capital",
      message:
        "Une " + r.libelle + " exige un capital d'au moins " + r.capitalMinimum.toLocaleString("fr-FR") + " euros",
    });
  }

  if (libere > capital) {
    anomalies.push({
      champ: "libere",
      message: "Le montant libéré ne peut pas dépasser le capital",
    });
  }

  const minimum = Math.ceil(capital * r.liberationMinimale);
  if (r.liberationMinimale > 0 && libere < minimum) {
    anomalies.push({
      champ: "libere",
      message:
        "Une " + r.libelle + " exige de libérer au moins " + Math.round(r.liberationMinimale * 100) +
        " % du capital, soit " + minimum.toLocaleString("fr-FR") + " euros",
    });
  }

  return anomalies;
}

export function verifierAssocies(forme: string, nombre: number): Anomalie[] {
  const r = regle(forme);
  if (!r) return [{ champ: "forme", message: "Forme juridique inconnue" }];

  if (nombre < r.associesMin) {
    return [
      {
        champ: "associes",
        message:
          "Une " + r.libelle + " demande au moins " +
          (r.associesMin === 1 ? "un associé" : r.associesMin + " associés"),
      },
    ];
  }

  if (r.associesMax !== null && nombre > r.associesMax) {
    return [
      {
        champ: "associes",
        message: "Une " + r.libelle + " ne peut pas dépasser " + r.associesMax + " associés",
      },
    ];
  }

  return [];
}

/**
 * La répartition doit couvrir exactement le capital.
 *
 * On compare en centimes : additionner des euros décimaux fait apparaître des
 * écarts d'un centime qui bloquent la validation sans raison visible.
 */
export function verifierRepartition(capital: number, parts: number[]): Anomalie[] {
  const totalCentimes = parts.reduce((n, p) => n + Math.round(p * 100), 0);
  const capitalCentimes = Math.round(capital * 100);

  if (totalCentimes === capitalCentimes) return [];

  const ecart = (capitalCentimes - totalCentimes) / 100;
  return [
    {
      champ: "repartition",
      message:
        ecart > 0
          ? "Il reste " + ecart.toLocaleString("fr-FR") + " euros à répartir"
          : "La répartition dépasse le capital de " + Math.abs(ecart).toLocaleString("fr-FR") + " euros",
    },
  ];
}
