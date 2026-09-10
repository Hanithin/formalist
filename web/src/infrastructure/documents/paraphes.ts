import { PDFDocument } from "pdf-lib";
import { PREFIXE_PNG } from "@/domain/formalite/signature";

/**
 * Le paraphe au bas de chaque page.
 *
 * C'est ce qui distingue un acte paraphé d'un acte simplement signé en dernière page :
 * chaque feuillet porte la marque de ceux qui l'ont accepté, et l'on ne peut pas en
 * glisser un autre au milieu après coup.
 *
 * L'apposition se fait sur le PDF et non sur le Word, pour une raison qui ne se
 * contourne pas : un document Word n'a pas de pages. Sa pagination est décidée par le
 * logiciel qui l'ouvre - une police manquante, une marge d'imprimante, et les coupures
 * changent. Le PDF, lui, porte ses pages ; c'est le premier moment où « en bas de
 * chaque page » veut dire quelque chose.
 */

/** Le côté d'un paraphe sur la page, en points PDF (72 points par pouce). */
const LARGEUR = 34;
const HAUTEUR = 26;
/** Ce qui sépare deux paraphes voisins, et ce qui les écarte du bord. */
const ECART = 6;
const MARGE = 28;

/** Les octets d'une image encodée en base64 dans une adresse `data:`. */
function octets(donnees: string): Uint8Array | null {
  if (!donnees.startsWith(PREFIXE_PNG)) return null;
  try {
    return new Uint8Array(Buffer.from(donnees.slice(PREFIXE_PNG.length), "base64"));
  } catch {
    return null;
  }
}

/**
 * Appose les paraphes recueillis sur toutes les pages d'un PDF.
 *
 * Rendu inchangé s'il n'y a rien à apposer : un dossier dont les signataires n'ont pas
 * de paraphe - ceux qui ont signé avant que l'écran ne le propose - sort exactement
 * comme avant, sans page altérée ni erreur.
 */
export async function apposerLesParaphes(pdf: Buffer, paraphes: string[]): Promise<Buffer> {
  const images = paraphes.map(octets).filter((o): o is Uint8Array => o !== null);
  if (images.length === 0) return pdf;

  const document = await PDFDocument.load(new Uint8Array(pdf));
  const embarquees = [];
  for (const image of images) {
    embarquees.push(await document.embedPng(image));
  }

  for (const page of document.getPages()) {
    const { width } = page.getSize();

    /*
     * Alignés à droite, de gauche à droite dans l'ordre des signataires.
     *
     * On part du bord et l'on recule : le dernier paraphe touche toujours la marge,
     * quel que soit leur nombre, et une page à quatre signataires ne déborde pas dans
     * le texte pour autant - la rangée s'étend vers l'intérieur.
     */
    const total = embarquees.length * LARGEUR + (embarquees.length - 1) * ECART;
    let x = width - MARGE - total;

    for (const image of embarquees) {
      page.drawImage(image, { x, y: MARGE - HAUTEUR / 2, width: LARGEUR, height: HAUTEUR });
      x += LARGEUR + ECART;
    }
  }

  return Buffer.from(await document.save());
}
