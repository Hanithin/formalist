import { regle, type Forme } from "./formes";

/**
 * Quels documents produire, et à partir de quel gabarit.
 *
 * La correspondance était dans public/js/creation/lifecycle.js, mêlée au reste du
 * cycle de vie. Elle a sa place ici : c'est une règle métier, pas de l'affichage.
 */

export type TypeDocument =
  | "statuts"
  | "liste-souscripteurs"
  | "declaration-non-condamnation"
  | "attestation-domicile"
  | "pv-nomination"
  | "conjoint";

interface Definition {
  type: TypeDocument;
  titre: string;
  /** Produit seulement dans certains cas. Absent : toujours produit. */
  condition?: "conjoint-marie" | "avec-dirigeant";
  /** Formes pour lesquelles ce document n'existe pas. */
  saufFormes?: Forme[];
}

const DOCUMENTS: Definition[] = [
  { type: "statuts", titre: "Statuts constitutifs" },
  // Une société civile n'émet pas de titres souscrits : il n'y a pas de liste,
  // et aucun gabarit n'existe pour elle.
  { type: "liste-souscripteurs", titre: "Liste des souscripteurs", saufFormes: ["SCI"] },
    /*
   * Son nom entier.
   *
   * Les modèles des greffes s'intitulent « déclaration de non-condamnation et de
   * filiation » : la filiation n'y est pas un supplément, c'est elle qui distingue le
   * déclarant d'un homonyme, et le document la porte depuis toujours sans la nommer.
   */
  {
    type: "declaration-non-condamnation",
    titre: "Déclaration de non-condamnation et de filiation",
  },
  { type: "attestation-domicile", titre: "Attestation de domiciliation" },
  { type: "pv-nomination", titre: "Procès-verbal de nomination", condition: "avec-dirigeant" },
  { type: "conjoint", titre: "Attestation du conjoint", condition: "conjoint-marie" },
];

/**
 * Le préfixe de gabarit d'une forme.
 *
 * Une EURL est une SARL à associé unique : elle reprend ses gabarits, il n'en
 * existe pas d'autres. Cette équivalence était écrite en clair dans lifecycle.js
 * et se serait perdue à la réécriture.
 */
export function prefixeGabarit(forme: string | null | undefined): string | null {
  const r = regle(forme);
  if (!r) return null;

  const equivalences: Partial<Record<Forme, string>> = { EURL: "sarl" };
  return equivalences[r.code] ?? r.code.toLowerCase();
}

export interface Contexte {
  forme: string;
  /** Un associé marié sous un régime communautaire demande l'accord du conjoint. */
  conjointMarie?: boolean;
  aUnDirigeant?: boolean;
}

export interface DocumentAProduire {
  type: TypeDocument;
  titre: string;
  gabarit: string;
}

/** La liste des documents à produire pour ce dossier, gabarit compris. */
export function documentsAProduire(contexte: Contexte): DocumentAProduire[] {
  const prefixe = prefixeGabarit(contexte.forme);
  if (!prefixe) return [];

  const forme = regle(contexte.forme)?.code;

  return DOCUMENTS.filter((d) => {
    if (forme && d.saufFormes?.includes(forme)) return false;
    if (d.condition === "conjoint-marie") return !!contexte.conjointMarie;
    if (d.condition === "avec-dirigeant") return contexte.aUnDirigeant !== false;
    return true;
  }).map((d) => ({
    type: d.type,
    titre: d.titre,
    gabarit: prefixe + "-" + d.type + ".docx",
  }));
}

/**
 * Pièces attendues du client.
 *
 * Elles ne sont pas produites mais déposées : identité, domicile, et attestation
 * de dépôt de capital quand la forme en exige un.
 */
/**
 * L'attestation de dépôt de capital, par son identifiant.
 *
 * Il était écrit en toutes lettres à trois endroits - la liste des pièces, l'état du
 * dossier, l'écran des actes. Trois chaînes identiques qu'aucun compilateur ne
 * rapproche.
 */
export const PIECE_DEPOT_CAPITAL = "depot-capital";

export interface PieceAttendue {
  identifiant: string;
  titre: string;
  description: string;
  formats: string[];
  /**
   * Le moment où la pièce peut être fournie.
   *
   * « saisie » : dès le remplissage du dossier - une pièce d'identité, un justificatif
   * de domicile, on les a chez soi.
   *
   * « apres-relecture » : l'attestation de dépôt de capital. La banque ouvre le compte
   * sur présentation des statuts, et les statuts sont ce que l'avocat relit : la
   * réclamer à la saisie demandait une pièce qu'on ne peut pas encore obtenir, et
   * l'écran des pièces l'affichait « Requis » en rouge dès la première visite.
   */
  quand: "saisie" | "apres-relecture";
}

export function piecesAttendues(forme: string | null | undefined): PieceAttendue[] {
  const r = regle(forme);

  const pieces: PieceAttendue[] = [
    {
      identifiant: "identite",
      titre: "Pièce d'identité du dirigeant",
      description: "Carte nationale d'identité ou passeport, recto et verso, en cours de validité.",
      formats: [".pdf", ".jpg", ".jpeg", ".png", ".heic", ".heif"],
      quand: "saisie",
    },
    {
      identifiant: "domicile",
      titre: "Justificatif de domicile du siège",
      description: "Facture de moins de trois mois, bail, ou attestation d'hébergement.",
      formats: [".pdf", ".jpg", ".jpeg", ".png", ".heic", ".heif"],
      quand: "saisie",
    },
  ];

  // Une SCI ne dépose pas de capital : lui demander l'attestation n'a pas de sens.
  if (r && r.liberationMinimale > 0) {
    pieces.push({
      identifiant: PIECE_DEPOT_CAPITAL,
      titre: "Attestation de dépôt de capital",
      description:
        "Remise par la banque après le versement du capital libéré. Vos actes seront datés du jour où vous l'avez obtenue : c'est celui où vous les signez.",
      formats: [".pdf"],
      quand: "apres-relecture",
    });
  }

  /*
   * L'attestation de parution n'est pas demandée au client.
   *
   * Elle l'était : le journal l'envoie après publication, le greffe la réclame, et
   * l'écran la posait « Requis » en rouge dans les pièces à fournir. Or ce n'est pas le
   * client qui publie - c'est le cabinet qui rédige l'avis, le porte au journal
   * habilité et le déclare publié, comme il le fait déjà sur une modification : « il a
   * payé pour ne pas s'en occuper ».
   *
   * Le suivi s'appuie sur cette déclaration, non sur un dépôt : `avisDeclares` la lit
   * dans le dossier, quel que soit le parcours.
   */

  return pieces;
}
