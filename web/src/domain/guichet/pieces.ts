import type { ModeDomiciliation } from "@/domain/formalite/parcours";

/**
 * Les pièces d'un dossier, sous les codes du guichet unique.
 *
 * Le guichet en publie cent soixante-sept, du certificat du dépositaire des fonds à la
 * copie du Journal officiel autorisant la création d'un établissement public. Nous en
 * produisons cinq et en réclamons trois : la traduction tient donc en une table, et
 * c'est sa justesse qui décide qu'un dépôt passe ou se fasse refuser.
 *
 * Les codes viennent de la feuille `typeDocument` du dictionnaire de données (juin
 * 2026). Comme pour les formes juridiques, ils sont recopiés : deux libellés se
 * ressemblent souvent, et « attestation de dépôt des fonds » cohabite avec « certificat
 * du dépositaire des fonds » et « certificat de dépôt de fonds ».
 */

export interface PieceDuGuichet {
  /** Le code `typeDocument` attendu. */
  code: string;
  /** Le libellé de l'INPI, pour qu'une relecture puisse vérifier le code. */
  libelle: string;
}

/**
 * Ce que nos actes deviennent.
 *
 * La déclaration de non-condamnation est le seul cas où un de nos documents en vaut
 * deux : les modèles des greffes réunissent la non-condamnation et la filiation, le
 * guichet les sépare. Le même fichier se dépose donc sous les deux codes - c'est ce que
 * le document contient, et taire l'un des deux ferait manquer une pièce au dossier.
 */
export const PIECES_DES_ACTES: Record<string, PieceDuGuichet[]> = {
  statuts: [{ code: "PJ_01", libelle: "Copie des statuts" }],
  "liste-souscripteurs": [{ code: "PJ_138", libelle: "Liste des souscripteurs" }],
  "declaration-non-condamnation": [
    {
      code: "PJ_63",
      libelle: "Déclaration sur l'honneur de non-condamnation datée et signée en original",
    },
    { code: "PJ_64", libelle: "Attestation de filiation (nom et prénoms des parents)" },
  ],
  "pv-nomination": [
    {
      code: "PJ_03",
      libelle:
        "Copie des actes de nomination des membres des organes de gestion, d'administration, de direction, de surveillance et de contrôle",
    },
  ],
  conjoint: [
    {
      code: "PJ_68",
      libelle: "Exemplaire de l'accord exprès et de l'information préalable du conjoint",
    },
  ],
};

/**
 * Le justificatif du siège, qui n'a pas de code unique.
 *
 * Le guichet distingue trois situations que notre parcours distingue déjà : un bail
 * appelle un justificatif de jouissance, une société de domiciliation son contrat, et
 * le domicile du dirigeant un justificatif d'adresse. Déposer le mauvais code fait
 * refuser une pièce pourtant présente.
 */
export function pieceDuSiege(mode: ModeDomiciliation | undefined): PieceDuGuichet {
  switch (mode) {
    case "Société de domiciliation":
      return { code: "PJ_29", libelle: "Copie du contrat de domiciliation" };
    case "Domicile personnel du dirigeant":
      return {
        code: "PJ_26",
        libelle: "Justificatif de l'adresse de l'entreprise fixée au local d'habitation",
      };
    default:
      return {
        code: "PJ_25",
        libelle:
          "Justificatif de la jouissance des locaux (titre de propriété, contrat de bail)",
      };
  }
}

/**
 * L'attestation de domiciliation que nous produisons.
 *
 * Elle ne vaut que dans un cas : le dirigeant met son domicile à disposition. Ailleurs,
 * c'est une pièce du client - un bail, un contrat - et non un acte du cabinet.
 */
export const PIECE_ATTESTATION_DOMICILE: PieceDuGuichet = {
  code: "PJ_26",
  libelle: "Justificatif de l'adresse de l'entreprise fixée au local d'habitation",
};

/**
 * Ce que les pièces téléversées par le client deviennent.
 *
 * Le dépôt de capital est le seul point que le dictionnaire laisse ouvert : trois codes
 * s'en approchent - « Attestation de dépôt des fonds », « Certificat du dépositaire des
 * fonds correspondant aux souscriptions avec en annexe la liste » et « Certificat de
 * dépôt de fonds ». Nous demandons au client une « attestation de dépôt des fonds »,
 * qui est le titre exact du premier : c'est celui-là, et le premier dépôt en
 * démonstration tranchera si le greffe en attend un autre.
 */
export const PIECES_TELEVERSEES: Record<string, PieceDuGuichet> = {
  "depot-capital": { code: "PJ_180", libelle: "Attestation de dépôt des fonds" },
  identite: { code: "PJ_11", libelle: "Copie de la carte nationale d'identité" },
};

/**
 * Où la pièce se rattache dans le contenu de la formalité.
 *
 * Le guichet attend un chemin JSON : les métadonnées d'une pièce vivent là où la pièce
 * se rapporte. Le tableau de tête vaut pour tout ce qui concerne la formalité entière,
 * et c'est notre cas - nos actes portent sur la société, non sur l'adresse d'un associé
 * en particulier.
 */
export const CHEMIN_DES_PIECES = "piecesJointes";

/** Ce que le guichet accepte : du PDF, et pas plus de dix mégaoctets. */
export const EXTENSION_ATTENDUE = ".pdf";
export const TAILLE_MAXIMALE = 10 * 1024 * 1024;
