import { regle, type Forme } from "./formes";
import type { ModeDomiciliation } from "./parcours";

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
  | "attestation-cabinet"
  | "pv-nomination"
  | "conjoint"
  | "pouvoir";

interface Definition {
  type: TypeDocument;
  titre: string;
  /** Produit seulement dans certains cas. Absent : toujours produit. */
  condition?:
    | "conjoint-marie"
    | "avec-dirigeant"
    | "domicile-dirigeant"
    | "domiciliation-cabinet";
  /** Formes pour lesquelles ce document n'existe pas. */
  saufFormes?: Forme[];
  /**
   * Un gabarit unique, quelle que soit la forme.
   *
   * Les actes constitutifs diffèrent d'une forme à l'autre - une SCI n'a pas d'associé
   * unique, une SAS n'a pas de gérant - et chacun a donc son fichier, nommé par
   * préfixe. Le pouvoir donné au cabinet, lui, ne parle pas de la société : il nomme
   * un mandant, un mandataire et une formalité. Quatre copies du même texte auraient
   * divergé à la première correction portée à une seule.
   */
  gabaritCommun?: string;
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
  /*
   * L'attestation ne vaut que là où quelqu'un met des locaux à disposition.
   *
   * Elle sortait sur tous les dossiers : une société installée dans ses murs sous bail
   * commercial recevait une attestation où son dirigeant certifie mettre son domicile à
   * disposition. Le greffe attend là un bail, non une attestation - et celle-ci
   * affirmait un fait qui n'était pas le sien.
   */
  {
    type: "attestation-domicile",
    titre: "Attestation de domiciliation",
    condition: "domicile-dirigeant",
  },
  /*
   * Le cabinet met ses propres locaux à disposition.
   *
   * Ce n'est pas une domiciliation agréée - le cabinet n'a pas d'agrément préfectoral et
   * ne conclut pas de contrat de domiciliation. C'est une mise à disposition de locaux
   * par un tiers, et l'attestation en est le titre.
   */
  {
    type: "attestation-cabinet",
    titre: "Attestation de mise à disposition de locaux",
    condition: "domiciliation-cabinet",
    gabaritCommun: "attestation-domiciliation-cabinet.docx",
  },
  { type: "pv-nomination", titre: "Procès-verbal de nomination", condition: "avec-dirigeant" },
  /*
   * Le pouvoir donné au cabinet pour déposer.
   *
   * Le guichet unique laisse un tiers déposer pour le compte d'une société, à condition
   * qu'un pouvoir le nomme : sans lui, le dossier se dépose sous l'identité du
   * fondateur, qui doit s'authentifier lui-même à chaque étape.
   */
  { type: "pouvoir", titre: "Pouvoir pour les formalités de création", gabaritCommun: "pouvoir.docx" },
  /*
   * L'information du conjoint ne vaut que pour les titres non négociables.
   *
   * L'article 1832-2 du code civil vise « l'emploi de biens communs pour faire un apport
   * à une société ou acquérir des parts sociales non négociables ». Les actions d'une SAS
   * sont négociables : le texte ne s'y applique pas, et l'attestation sortait pourtant,
   * citant en tête un article qui ne concernait pas la société qu'elle accompagne.
   *
   * Le parcours de modification appliquait déjà cette règle - elle est écrite dans
   * `modification/types.ts`, sur les champs qu'il n'affiche pas à une SAS. Deux parties
   * du même produit répondaient différemment à la même question de droit.
   */
  {
    type: "conjoint",
    titre: "Attestation du conjoint",
    condition: "conjoint-marie",
    saufFormes: ["SAS", "SASU"],
  },
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
  /** Où la société fixe son siège : deux des quatre cas produisent une attestation. */
  modeDomiciliation?: ModeDomiciliation;
}

export interface DocumentAProduire {
  type: TypeDocument;
  titre: string;
  gabarit: string;
}

/**
 * L'ordre dans lequel les actes se lisent : les statuts d'abord.
 *
 * La liste les rendait dans l'ordre où la base les rendait - c'est-à-dire, à égalité
 * de date de production, le dernier écrit en premier : le client ouvrait ses documents
 * sur le procès-verbal de nomination, et devait descendre pour trouver ses statuts.
 * C'est pourtant l'acte qui fonde la société, celui qu'il porte à sa banque et qu'il
 * signe en premier.
 *
 * L'ordre est celui de la table ci-dessus, qui est déjà le bon : statuts, souscripteurs,
 * déclaration, domiciliation, nomination. Ce qu'elle ne connaît pas se range à la fin.
 */
export function rangDeLActe(titre: string): number {
  const rang = DOCUMENTS.findIndex((d) => d.titre === titre);
  return rang === -1 ? DOCUMENTS.length : rang;
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
    if (d.condition === "domicile-dirigeant") {
      return contexte.modeDomiciliation === "Domicile personnel du dirigeant";
    }
    if (d.condition === "domiciliation-cabinet") {
      return contexte.modeDomiciliation === "Domiciliation au cabinet";
    }
    return true;
  }).map((d) => ({
    type: d.type,
    titre: d.titre,
    gabarit: d.gabaritCommun ?? prefixe + "-" + d.type + ".docx",
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

/** L'extrait Kbis du domiciliataire, réclamé par le greffe avec le contrat. */
export const PIECE_KBIS_DOMICILIATAIRE = "kbis-domiciliataire";

export function piecesAttendues(
  forme: string | null | undefined,
  /**
   * Comment la société est domiciliée.
   *
   * Une société de domiciliation appelle une pièce de plus : le greffe veut vérifier
   * que le domiciliataire existe, qu'il est immatriculé et qu'il est bien à l'adresse
   * qu'il loue. Le contrat seul ne le prouve pas.
   *
   * Facultatif : un dossier lu avant que ce mode ne soit saisi ne doit pas réclamer une
   * pièce dont personne ne sait encore si elle sera due.
   */
  modeDomiciliation?: ModeDomiciliation
): PieceAttendue[] {
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

  if (modeDomiciliation === "Société de domiciliation") {
    pieces.push({
      identifiant: PIECE_KBIS_DOMICILIATAIRE,
      titre: "Extrait Kbis du domiciliataire",
      description:
        "Moins de trois mois. Il prouve que la société de domiciliation existe et qu'elle est immatriculée à l'adresse qu'elle vous loue.",
      formats: [".pdf"],
      quand: "saisie",
    });
  }

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
