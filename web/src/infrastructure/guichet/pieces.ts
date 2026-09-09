import { demander, type Identifiants } from "./transport";
import { convertirEnPdf } from "@/infrastructure/documents/conversion";
import {
  CHEMIN_DES_PIECES,
  EXTENSION_ATTENDUE,
  LANGUE_ATTENDUE,
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
/**
 * Le nom d'une pièce se termine par « .pdf ».
 *
 * Le guichet le vérifie, et le dit sans détour : « Le document doit être un PDF
 * (exemple : monDocument.pdf) » - une violation sur `nomDocument`, alors même que
 * l'extension part déjà dans son propre champ et que le contenu est bien un PDF.
 * Éprouvé contre la démonstration : le même envoi passe avec « Essai.pdf » et échoue
 * avec « Essai sans extension ».
 *
 * Les actes du cabinet le portaient déjà, `nomDeFichier` s'en chargeant ; les pièces du
 * client arrivaient avec le nom du fichier téléversé, et il suffisait qu'un scanner
 * l'ait nommé sans extension pour que le dépôt soit refusé. La règle appartient au
 * contrat, donc à cet endroit : elle vaut pour tout ce qui part.
 */
function nomAvecExtension(nom: string): string {
  const propre = nom.trim() || "Document";
  return /\.pdf$/i.test(propre) ? propre : propre + ".pdf";
}

export function corpsDeLaPiece(piece: PieceAJoindre): Record<string, unknown> {
  if (piece.pdf.byteLength > TAILLE_MAXIMALE) {
    throw new PieceTropLourde(piece.nom, piece.pdf.byteLength);
  }

  return {
    nomDocument: nomAvecExtension(piece.nom),
    typeDocument: piece.type.code,
    langueDocument: LANGUE_ATTENDUE,
    documentBase64: piece.pdf.toString("base64"),
    documentExtension: EXTENSION_ATTENDUE,
    path: CHEMIN_DES_PIECES,
  };
}

/** Joint une pièce à une formalité déjà déposée, sous le compte qui l'a créée. */
export async function joindreLaPiece(
  formaliteId: number,
  piece: PieceAJoindre,
  compte?: Identifiants
): Promise<unknown> {
  return demander(
    "/api/formalities/" + formaliteId + "/attachments",
    { method: "POST", body: JSON.stringify(corpsDeLaPiece(piece)) },
    compte
  );
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
