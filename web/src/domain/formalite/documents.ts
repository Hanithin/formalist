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
  { type: "declaration-non-condamnation", titre: "Déclaration de non-condamnation" },
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
export interface PieceAttendue {
  identifiant: string;
  titre: string;
  description: string;
  formats: string[];
}

export function piecesAttendues(forme: string | null | undefined): PieceAttendue[] {
  const r = regle(forme);

  const pieces: PieceAttendue[] = [
    {
      identifiant: "identite",
      titre: "Pièce d'identité du dirigeant",
      description: "Carte nationale d'identité ou passeport, recto et verso, en cours de validité.",
      formats: [".pdf", ".jpg", ".jpeg", ".png"],
    },
    {
      identifiant: "domicile",
      titre: "Justificatif de domicile du siège",
      description: "Facture de moins de trois mois, bail, ou attestation d'hébergement.",
      formats: [".pdf", ".jpg", ".jpeg", ".png"],
    },
  ];

  // Une SCI ne dépose pas de capital : lui demander l'attestation n'a pas de sens.
  if (r && r.liberationMinimale > 0) {
    pieces.push({
      identifiant: "depot-capital",
      titre: "Attestation de dépôt de capital",
      description:
        "Remise par la banque après le versement du capital libéré. Vos actes seront datés du jour où vous l'avez obtenue : c'est celui où vous les signez.",
      formats: [".pdf"],
    });
  }

  /*
   * L'attestation de parution.
   *
   * Le journal l'envoie après la publication de l'annonce légale, et le greffe la
   * réclame avec le dossier. Elle n'était nulle part : le client n'avait aucun moyen
   * de la rendre, et le dépôt refuse tout identifiant hors de cette liste.
   */
  pieces.push({
    identifiant: "annonce-parution",
    titre: "Attestation de parution de l'annonce légale",
    description:
      "Envoyée par le journal d'annonces légales après publication. L'avocat vous remet le texte à publier.",
    formats: [".pdf", ".jpg", ".jpeg", ".png"],
  });

  return pieces;
}
