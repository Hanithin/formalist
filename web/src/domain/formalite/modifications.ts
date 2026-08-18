import { regle, type Forme } from "./formes";

/**
 * Modifications de société : ce qu'on peut changer, et ce que ça produit.
 *
 * Porté depuis public/js/modification/types.js.
 */

export type TypeModification =
  | "transfert_siege"
  | "denomination"
  | "dirigeant"
  | "objet_social"
  | "augmentation_capital"
  | "reduction_capital"
  | "cession_parts"
  | "prorogation";

export interface DefinitionModification {
  code: TypeModification;
  libelle: string;
  description: string;
  /** Champs à saisir en plus des informations de la société. */
  champs: ChampModification[];
  /** Documents produits en plus du procès-verbal. */
  documentsSupplementaires?: { titre: string; gabarit: string }[];
}

export interface ChampModification {
  identifiant: string;
  libelle: string;
  type: "texte" | "nombre" | "adresse" | "long";
}

export const MODIFICATIONS: DefinitionModification[] = [
  {
    code: "transfert_siege",
    libelle: "Transfert de siège social",
    description: "Changer l'adresse officielle de la société.",
    champs: [
      { identifiant: "nouvelleAdresse", libelle: "Nouvelle adresse", type: "adresse" },
      { identifiant: "nouveauCodePostal", libelle: "Nouveau code postal", type: "texte" },
      { identifiant: "nouvelleVille", libelle: "Nouvelle ville", type: "texte" },
    ],
  },
  {
    code: "denomination",
    libelle: "Changement de dénomination",
    description: "Changer le nom de la société.",
    champs: [{ identifiant: "nouvelleDenomination", libelle: "Nouveau nom", type: "texte" }],
  },
  {
    code: "dirigeant",
    libelle: "Changement de dirigeant",
    description: "Nommer un nouveau dirigeant, ou acter un départ.",
    champs: [
      { identifiant: "nouveauDirigeantPrenom", libelle: "Prénom du nouveau dirigeant", type: "texte" },
      { identifiant: "nouveauDirigeantNom", libelle: "Nom du nouveau dirigeant", type: "texte" },
    ],
  },
  {
    code: "objet_social",
    libelle: "Changement d'objet social",
    description: "Modifier l'activité déclarée de la société.",
    champs: [{ identifiant: "nouvelObjet", libelle: "Nouvel objet social", type: "long" }],
  },
  {
    code: "augmentation_capital",
    libelle: "Augmentation de capital",
    description: "Augmenter le capital social.",
    champs: [{ identifiant: "nouveauCapital", libelle: "Nouveau capital, en euros", type: "nombre" }],
  },
  {
    code: "reduction_capital",
    libelle: "Réduction de capital",
    description: "Réduire le capital social.",
    champs: [{ identifiant: "nouveauCapital", libelle: "Nouveau capital, en euros", type: "nombre" }],
  },
  {
    code: "cession_parts",
    libelle: "Cession de parts",
    description: "Transférer des parts d'un associé à un autre.",
    champs: [
      { identifiant: "cedant", libelle: "Cédant", type: "texte" },
      { identifiant: "cessionnaire", libelle: "Cessionnaire", type: "texte" },
      { identifiant: "nombreParts", libelle: "Nombre de parts cédées", type: "nombre" },
    ],
    documentsSupplementaires: [
      { titre: "Acte de cession de parts", gabarit: "modif-acte-cession.docx" },
    ],
  },
  {
    code: "prorogation",
    libelle: "Prorogation de la durée",
    description: "Prolonger la durée de vie de la société.",
    champs: [{ identifiant: "nouvelleDuree", libelle: "Nouvelle durée, en années", type: "nombre" }],
  },
];

export function definitionModification(code: string): DefinitionModification | null {
  return MODIFICATIONS.find((m) => m.code === code) ?? null;
}

/**
 * Le gabarit de procès-verbal dépend du nombre d'associés, pas de la famille
 * juridique.
 *
 * Dans une société à associé unique, il n'y a pas d'assemblée : la décision est
 * prise seul, et le document en porte la formulation. Le gabarit « sasu » est en
 * réalité la variante unipersonnelle - « associé unique » y figure douze fois,
 * sans mention de président ni de gérant. C'est pourquoi une EURL l'emploie
 * aussi, là où sa création utilise les gabarits SARL.
 */
export function gabaritProcesVerbal(forme: string | null | undefined): string | null {
  const r = regle(forme);
  if (!r) return null;

  const prefixe = r.unipersonnelle ? "sasu" : r.code.toLowerCase();
  return "modif-pv-transfert-siege-" + prefixe + ".docx";
}

export interface DocumentModification {
  titre: string;
  gabarit: string;
}

/** Les documents produits pour cette modification. */
export function documentsModification(
  code: string,
  forme: string | null | undefined
): DocumentModification[] {
  const definition = definitionModification(code);
  const pv = gabaritProcesVerbal(forme);
  if (!definition || !pv) return [];

  return [
    { titre: "Procès-verbal - " + definition.libelle, gabarit: pv },
    ...(definition.documentsSupplementaires ?? []),
  ];
}

export interface Anomalie {
  champ: string;
  message: string;
}

/** Ce qui manque pour cette modification. */
export function verifierModification(
  code: string,
  valeurs: Record<string, string | number | undefined>
): Anomalie[] {
  const definition = definitionModification(code);
  if (!definition) return [{ champ: "type", message: "Choisissez le type de modification" }];

  const anomalies: Anomalie[] = [];

  for (const champ of definition.champs) {
    const valeur = valeurs[champ.identifiant];

    if (champ.type === "nombre") {
      if (typeof valeur !== "number" || !Number.isFinite(valeur) || valeur <= 0) {
        anomalies.push({ champ: champ.identifiant, message: champ.libelle + " est requis" });
      }
      continue;
    }

    if (typeof valeur !== "string" || !valeur.trim()) {
      anomalies.push({ champ: champ.identifiant, message: champ.libelle + " est requis" });
    }
  }

  // Le code postal suit la même règle qu'à la création.
  const cp = valeurs.nouveauCodePostal;
  if (definition.code === "transfert_siege" && typeof cp === "string" && cp.trim() && !/^\d{5}$/.test(cp)) {
    anomalies.push({ champ: "nouveauCodePostal", message: "Le code postal comporte cinq chiffres" });
  }

  return anomalies;
}

/** Formes pour lesquelles une modification est proposable. */
export function formesModifiables(): Forme[] {
  return (["SASU", "SAS", "EURL", "SARL", "SCI"] as Forme[]).filter((f) => gabaritProcesVerbal(f));
}
