import { demander } from "./transport";
import { convertirEnPdf } from "@/infrastructure/documents/conversion";
import {
  CHEMIN_DES_PIECES,
  EXTENSION_ATTENDUE,
  TAILLE_MAXIMALE,
  type PieceDuGuichet,
} from "@/domain/guichet/pieces";

/**
 * Le dépôt des pièces jointes sur une formalité.
 *
 * Le guichet les veut en PDF, encodées en base64, à dix mégaoctets près. Nos actes
 * sortent en Word : ils passent par la conversion, celle-là même qui sert aux aperçus,
 * et son cache évite de relancer LibreOffice pour un acte déjà converti.
 *
 * Le contrat offre deux voies - une mise à jour de la formalité entière, ou un ajout sur
 * ses `attachments`. La seconde est retenue : elle ne réécrit pas le contenu, et une
 * pièce refusée ne fait donc pas perdre le reste du dépôt.
 */

export class PieceTropLourde extends Error {
  readonly statut = 413;
  constructor(
    readonly nom: string,
    readonly octets: number
  ) {
    super(
      "La pièce « " +
        nom +
        " » pèse " +
        Math.round(octets / 1024 / 1024) +
        " Mo : le guichet en accepte dix au plus"
    );
    this.name = "PieceTropLourde";
  }
}

export interface PieceAJoindre {
  /** Le nom que le déposant lira dans son dossier. */
  nom: string;
  /** Le code et le libellé du guichet, tels que le domaine les a traduits. */
  type: PieceDuGuichet;
  /** Le document, en PDF. */
  pdf: Buffer;
}

/**
 * Le corps d'une pièce, tel que le guichet l'attend.
 *
 * Le `path` dit où les métadonnées se rattachent dans le contenu de la formalité. Nos
 * actes portent sur la société entière : le tableau de tête est le bon.
 *
 * Le libellé du type n'est pas envoyé - le guichet ne connaît que le code - mais il
 * accompagne le corps dans le journal, où une pièce refusée doit pouvoir se relire sans
 * ouvrir le dictionnaire.
 */
export function corpsDeLaPiece(piece: PieceAJoindre): Record<string, unknown> {
  if (piece.pdf.byteLength > TAILLE_MAXIMALE) {
    throw new PieceTropLourde(piece.nom, piece.pdf.byteLength);
  }

  return {
    nomDocument: piece.nom,
    typeDocument: piece.type.code,
    langueDocument: "FRA",
    documentBase64: piece.pdf.toString("base64"),
    documentExtension: EXTENSION_ATTENDUE,
    path: CHEMIN_DES_PIECES,
  };
}

/** Joint une pièce à une formalité déjà déposée. */
export async function joindreLaPiece(
  formaliteId: number,
  piece: PieceAJoindre
): Promise<unknown> {
  return demander("/api/formalities/" + formaliteId + "/attachments", {
    method: "POST",
    body: JSON.stringify(corpsDeLaPiece(piece)),
  });
}

/**
 * Un acte Word, prêt à être joint.
 *
 * La conversion vit ici plutôt que chez l'appelant : c'est une contrainte du guichet -
 * « les pièces jointes doivent être au format PDF » - et non un choix de présentation.
 */
export async function pieceDepuisUnActe(
  nom: string,
  type: PieceDuGuichet,
  docx: Buffer
): Promise<PieceAJoindre> {
  return { nom, type, pdf: await convertirEnPdf(docx) };
}
