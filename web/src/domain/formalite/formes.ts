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

/* ------------------------------------------------------------ La nature d'une forme */

/**
 * Ce qu'une forme impose aux actes, indépendamment de ce qu'il faut pour la créer.
 *
 * Deux choses étaient confondues sous le mot « forme ». Créer une société demande des
 * gabarits de statuts, un capital minimum, une part à libérer : seules cinq formes en
 * disposent, et c'est ce que décrit `FORMES` ci-dessus. Mais une société qui existe
 * déjà - qu'elle transfère son siège, cède ses titres ou dépose ses comptes - ne
 * demande à sa forme que du vocabulaire : ses titres sont-ils des actions ou des parts
 * sociales, dirige-t-elle par un président ou un gérant, est-elle civile ou
 * commerciale. Une SELAS n'a pas de gabarit de statuts chez nous, et n'en a pas besoin
 * pour déposer ses comptes.
 *
 * Ce vocabulaire était décidé à cinq endroits, chacun avec sa propre liste écrite à la
 * main : un ensemble dans `pv-age.ts` contenant un « SASU » avec une espace de trop, un
 * autre dans `acte-cession.ts`, et trois comparaisons dans `gabarit.ts` dont l'une
 * oubliait la SA - si bien qu'une société anonyme lisait « détenant 700 parts sociales »
 * dans sa feuille de présence et « actions » partout ailleurs, dans le même acte.
 *
 * Une seule table, donc, que ces cinq endroits lisent.
 */
/**
 * Le régime dont la forme relève, pour citer le bon article.
 *
 * Une société d'exercice libéral n'a pas de droit propre : la loi du 31 décembre 1990
 * la soumet au livre II du code de commerce, sous réserve de ses particularités. Une
 * SELARL suit donc la SARL - article L. 223-33 pour l'apport en nature, L. 223-9 pour
 * la dispense de commissaire - et une SELAS suit la SAS. Trois fonctions le devinaient
 * en comparant le sigle à « SARL » et « EURL », si bien qu'une SELARL se voyait citer
 * l'article des sociétés par actions. Un mauvais article dans un acte déposé se voit.
 */
export type RegimeDeForme = "sarl" | "sas" | "sa" | "commandite" | "snc" | "civile";

export type CategorieDeForme =
  | "commerciale"
  | "exercice-liberal"
  | "civile"
  | "civile-agricole"
  | "holding";

export interface NatureDeForme {
  /** Le sigle, tel qu'un acte l'écrit. */
  code: string;
  /** Le nom entier, pour les écrans et les messages. */
  libelle: string;
  /** « actions » ou « parts sociales ». */
  titres: "actions" | "parts sociales";
  /** « action » ou « part sociale ». */
  titreSingulier: string;
  /** « actionnaires » ou « associés ». */
  associesPluriel: string;
  /** « actionnaire » ou « associé », pour les libellés au singulier. */
  associeSingulier: string;
  /** Comment s'appelle celui qui dirige : le mot figure dans les actes. */
  titreDirigeant: "Président" | "Gérant";
  categorie: CategorieDeForme;
  /** Le régime du code de commerce dont elle relève, pour les articles cités. */
  regime: RegimeDeForme;
  /** N'admet qu'un associé, par construction. */
  unipersonnelle: boolean;
  /**
   * Sa jumelle unipersonnelle, ou pluripersonnelle.
   *
   * Le registre ne distingue pas les deux - une SASU y est immatriculée comme une SAS -
   * et le nombre d'associés, lui, le dit. C'est ce lien qui permet de passer de l'une à
   * l'autre sans table supplémentaire.
   */
  jumelle?: string;
}

/** Une forme par actions : président, actionnaires, actions. */
function parActions(
  code: string,
  libelle: string,
  categorie: CategorieDeForme,
  regime: RegimeDeForme,
  extra: Partial<NatureDeForme> = {}
): NatureDeForme {
  return {
    code,
    libelle,
    titres: "actions",
    titreSingulier: "action",
    associesPluriel: "actionnaires",
    associeSingulier: "actionnaire",
    titreDirigeant: "Président",
    categorie,
    regime,
    unipersonnelle: false,
    ...extra,
  };
}

/** Une forme par parts : gérant, associés, parts sociales. */
function parParts(
  code: string,
  libelle: string,
  categorie: CategorieDeForme,
  regime: RegimeDeForme,
  extra: Partial<NatureDeForme> = {}
): NatureDeForme {
  return {
    code,
    libelle,
    titres: "parts sociales",
    titreSingulier: "part sociale",
    associesPluriel: "associés",
    associeSingulier: "associé",
    titreDirigeant: "Gérant",
    categorie,
    regime,
    unipersonnelle: false,
    ...extra,
  };
}

/**
 * Toutes les formes que Formalist sait nommer dans un acte.
 *
 * Les commandites dirigent par un gérant bien que leurs titres soient des actions :
 * c'est la commandite qui commande le titre, non la nature des titres. De même une
 * SELAS est une SAS d'exercice libéral - actions et président - là où une SELARL suit
 * la SARL. Le contraire figurait dans `qualitesDuRepresentant`, qui rangeait la SELAS
 * parmi les gérants.
 */
export const NATURES: Record<string, NatureDeForme> = {
  /* Commerciales */
  SA: parActions("SA", "société anonyme", "commerciale", "sa"),
  SAS: parActions("SAS", "société par actions simplifiée", "commerciale", "sas", { jumelle: "SASU" }),
  SASU: parActions("SASU", "société par actions simplifiée à associé unique", "commerciale", "sas", {
    unipersonnelle: true,
    jumelle: "SAS",
  }),
  SE: parActions("SE", "société européenne", "commerciale", "sa"),
  SCA: parActions("SCA", "société en commandite par actions", "commerciale", "commandite", {
    titreDirigeant: "Gérant",
  }),
  SARL: parParts("SARL", "société à responsabilité limitée", "commerciale", "sarl", { jumelle: "EURL" }),
  EURL: parParts("EURL", "entreprise unipersonnelle à responsabilité limitée", "commerciale", "sarl", {
    unipersonnelle: true,
    jumelle: "SARL",
  }),
  SNC: parParts("SNC", "société en nom collectif", "commerciale", "snc"),
  SCS: parParts("SCS", "société en commandite simple", "commerciale", "commandite"),

  /* Exercice libéral */
  SELAS: parActions("SELAS", "société d'exercice libéral par actions simplifiée", "exercice-liberal", "sas", {
    jumelle: "SELASU",
  }),
  SELASU: parActions(
    "SELASU",
    "société d'exercice libéral par actions simplifiée à associé unique",
    "exercice-liberal", "sas",
    { unipersonnelle: true, jumelle: "SELAS" }
  ),
  SELAFA: parActions("SELAFA", "société d'exercice libéral à forme anonyme", "exercice-liberal", "sa"),
  SELCA: parActions(
    "SELCA",
    "société d'exercice libéral en commandite par actions",
    "exercice-liberal", "commandite",
    { titreDirigeant: "Gérant" }
  ),
  SELARL: parParts(
    "SELARL",
    "société d'exercice libéral à responsabilité limitée",
    "exercice-liberal", "sarl",
    { jumelle: "SELARLU" }
  ),
  SELARLU: parParts(
    "SELARLU",
    "société d'exercice libéral à responsabilité limitée à associé unique",
    "exercice-liberal", "sarl",
    { unipersonnelle: true, jumelle: "SELARL" }
  ),

  /* Civiles */
  SC: parParts("SC", "société civile", "civile", "civile"),
  SCI: parParts("SCI", "société civile immobilière", "civile", "civile"),
  SCM: parParts("SCM", "société civile de moyens", "civile", "civile"),
  SCP: parParts("SCP", "société civile professionnelle", "civile", "civile"),

  /* Civiles agricoles */
  SCEA: parParts("SCEA", "société civile d'exploitation agricole", "civile-agricole", "civile"),
  EARL: parParts("EARL", "exploitation agricole à responsabilité limitée", "civile-agricole", "civile"),
  GAEC: parParts("GAEC", "groupement agricole d'exploitation en commun", "civile-agricole", "civile"),

  /* Holdings de profession libérale : la forme support commande le vocabulaire. */
  "SPFPL SARL": parParts(
    "SPFPL SARL",
    "société de participations financières de profession libérale à responsabilité limitée",
    "holding", "sarl"
  ),
  "SPFPL SAS": parActions(
    "SPFPL SAS",
    "société de participations financières de profession libérale par actions simplifiée",
    "holding", "sas"
  ),
  "SPFPL SA": parActions(
    "SPFPL SA",
    "société de participations financières de profession libérale à forme anonyme",
    "holding", "sa"
  ),
  "SPFPL SCA": parActions(
    "SPFPL SCA",
    "société de participations financières de profession libérale en commandite par actions",
    "holding", "commandite",
    { titreDirigeant: "Gérant" }
  ),
};

/** Les formes proposées à qui décrit une société existante, dans l'ordre d'usage. */
export const NATURES_PROPOSEES: string[] = Object.keys(NATURES);

/**
 * Les fonctions qu'un dirigeant peut porter dans cette forme.
 *
 * Un procès-verbal de SAS écrit « Président », celui d'une SARL « Gérant » : le titre
 * n'est pas au choix, il tient à la forme. L'écran du dépôt des comptes offrait pourtant
 * les quatre à tout le monde, et une société d'exercice libéral par actions simplifiée
 * s'est déposée « en sa qualité de Gérant » - un titre qui n'existe pas chez elle, dans
 * une déclaration signée sur l'honneur et remise au greffe.
 *
 * La liste reste ouverte au second titre de chaque famille : une SAS a des directeurs
 * généraux, une SARL des co-gérants.
 */
export function fonctionsDuDirigeant(forme: string | null | undefined): string[] {
  return natureDeLaForme(forme).titreDirigeant === "Président"
    ? ["Président", "Directeur général", "Directeur général délégué"]
    : ["Gérant", "Co-gérant"];
}

/**
 * Ce que la forme impose aux actes.
 *
 * Une forme inconnue - une société étrangère, une forme rare - ne doit pas faire échouer
 * la rédaction : on rend alors la nature la plus répandue, en le signalant par un code
 * vide. Les écrans qui savent quoi en faire le vérifient ; les autres écrivent des
 * parts sociales et un gérant, ce qui est le cas le plus fréquent.
 */
export function natureDeLaForme(forme: string | null | undefined): NatureDeForme {
  const nette = (forme ?? "").trim().toUpperCase();
  return (
    NATURES[nette] ?? {
      code: "",
      libelle: nette || "forme non précisée",
      titres: "parts sociales",
      titreSingulier: "part sociale",
      associesPluriel: "associés",
      associeSingulier: "associé",
      titreDirigeant: "Gérant",
      categorie: "commerciale",
      regime: "sarl",
      unipersonnelle: false,
    }
  );
}

/** La forme est-elle l'une de celles que nous savons nommer ? */
export function formeConnue(forme: string | null | undefined): boolean {
  return !!NATURES[(forme ?? "").trim().toUpperCase()];
}

/**
 * La forme ajustée au nombre d'associés.
 *
 * Le registre ne peut pas dire « SASU » : l'unipersonnalité n'est pas une catégorie
 * juridique. Une fois les associés saisis, la forme se précise d'elle-même.
 */
export function formeSelonAssocies(forme: string | null | undefined, nombreAssocies: number): string {
  const nature = natureDeLaForme(forme);
  if (!nature.code || !nature.jumelle) return nature.code || (forme ?? "");

  const doitEtreUnique = nombreAssocies === 1;
  if (doitEtreUnique === nature.unipersonnelle) return nature.code;
  return nature.jumelle;
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

/**
 * Qui peut représenter une société, selon sa forme.
 *
 * L'acte désigne une société associée « représentée par X, en qualité de Y ». Le mot
 * n'est pas au choix : une SAS a un président et des directeurs généraux, une SARL et
 * une SCI ont des gérants. Écrire « gérant » d'une SAS fait écrire un titre qui
 * n'existe pas chez elle, et le greffe le relève.
 *
 * La forme vient du registre et n'est pas toujours l'une des nôtres - une société
 * étrangère, une association, une forme rare. On propose alors les quatre titres :
 * mieux vaut une liste trop large qu'une liste qui exclut le bon.
 */
export function qualitesDuRepresentant(forme: string | null | undefined): string[] {
  const propre = (forme ?? "").trim().toUpperCase();

  /*
   * Celui qui signe n'est pas toujours un dirigeant.
   *
   * Une société peut se faire représenter par quelqu'un qui n'a aucun titre chez elle :
   * un associé, un tiers, un avocat, porteur d'un pouvoir. Le titre écrit dans l'acte
   * est alors « Mandataire » ou « Associé », et le pouvoir se joint aux pièces. Sans
   * ces deux entrées, il fallait choisir un titre faux pour pouvoir continuer.
   */
  const sansTitre = ["Associé", "Mandataire"];

  /*
   * Ces deux expressions régulières rangeaient la SELAS parmi les gérants, alors qu'une
   * société d'exercice libéral par actions simplifiée est une SAS : elle a un
   * président. Et une SCA, commandite par actions, figurait chez les présidents alors
   * qu'une commandite est dirigée par un gérant. La table des natures tranche les deux.
   */
  const nature = NATURES[propre];
  if (!nature) return ["Président", "Directeur général", "Gérant", "Co-gérant", ...sansTitre];

  if (nature.titreDirigeant === "Président") {
    return ["Président", "Directeur général", "Directeur général délégué", ...sansTitre];
  }
  return ["Gérant", "Co-gérant", ...sansTitre];
}
