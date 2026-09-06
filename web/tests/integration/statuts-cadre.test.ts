import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { appliquerLesRetouches } from "@/infrastructure/documents/statuts";

/**
 * Le cadre d'une retouche, quand la nouvelle valeur est plus longue que l'ancienne.
 *
 * Sa largeur vient de l'emplacement repéré dans le document : la boîte de l'ancienne
 * valeur. Une adresse plus longue que celle qu'elle remplace - le cas courant, un code
 * postal et une ville s'ajoutant à une rue - dépassait donc de son cadre. `drawText` ne
 * rogne pas : le texte sortait entier, mais le blanc qui efface l'ancienne valeur, lui,
 * s'arrêtait à la largeur repérée. La fin de l'ancienne adresse restait sous la
 * nouvelle.
 */

async function statutsAvecUneAdresse(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const police = await document.embedFont(StandardFonts.TimesRoman);
  document.addPage([595, 842]).drawText("Siege social : 34 Rue Laugier, 75017 Paris", {
    x: 60,
    y: 700,
    size: 11,
    font: police,
  });
  return Buffer.from(await document.save());
}

/** La retouche telle que l'éditeur la pose : la boîte de l'ancienne valeur. */
const SUR_L_ANCIENNE_ADRESSE = {
  cle: "siege",
  page: 1,
  x: 130,
  y: 135,
  /* La largeur de « 34 Rue Laugier, 75017 Paris » à onze points, en gros. */
  largeur: 130,
  hauteur: 14,
  taille: 11,
  police: "serif" as const,
};

describe("le cadre suit son texte", () => {
  it("produit un document lisible quand la nouvelle valeur déborde", async () => {
    const produit = await appliquerLesRetouches(await statutsAvecUneAdresse(), [
      { ...SUR_L_ANCIENNE_ADRESSE, texte: "12 Rue de Saint-Pétersbourg, 75008 Paris" },
    ]);

    /* Le document sort, et il porte bien une page. */
    const relu = await PDFDocument.load(produit);
    expect(relu.getPageCount()).toBe(1);
    expect(produit.length).toBeGreaterThan(0);
  });

  /* Une valeur plus courte n'ampute pas le blanc : l'ancienne doit disparaître entière. */
  it("garde la largeur repérée quand le texte est plus court", async () => {
    const produit = await appliquerLesRetouches(await statutsAvecUneAdresse(), [
      { ...SUR_L_ANCIENNE_ADRESSE, texte: "Paris" },
    ]);

    const relu = await PDFDocument.load(produit);
    expect(relu.getPageCount()).toBe(1);
  });
});
