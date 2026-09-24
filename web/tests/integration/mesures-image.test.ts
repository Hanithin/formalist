import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { mesurerLaPiece, enJpegPourLecture } from "@/infrastructure/documents/mesures-image";

/**
 * Ce qu'on mesure d'une image, et qui doit vraiment mesurer quelque chose.
 *
 * Ce fichier existe à cause d'un piège précis : `stats()` de sharp rend les
 * statistiques de l'image **d'entrée**, sans appliquer les opérations du pipeline.
 * Enchaîner `convolve().stats()` semblait mesurer la netteté et rendait en réalité
 * l'écart-type de l'image d'origine - à la décimale près le même nombre que le
 * contraste. Le contrôle des pièces aurait alors accepté n'importe quelle photographie
 * floue, sans que rien ne le signale.
 *
 * Les tests ci-dessous ne vérifient donc pas des seuils mais un ordre : une image
 * floutée doit mesurer nettement moins qu'elle-même nette.
 */

/** Du texte imprimé, ce qui se rapproche le plus d'une pièce d'identité numérisée. */
async function documentNet(): Promise<Buffer> {
  const lignes = Array.from(
    { length: 12 },
    (_, i) =>
      `<text x="40" y="${60 + i * 48}" font-size="26" font-family="Helvetica" fill="#151515">` +
      "REPUBLIQUE FRANCAISE 1234567890 DUPONT MARIE</text>"
  ).join("");

  const svg = Buffer.from(
    `<svg width="1600" height="1000"><rect width="1600" height="1000" fill="#dcdcd2"/>${lignes}</svg>`
  );
  return sharp(svg).jpeg({ quality: 92 }).toBuffer();
}

describe("les mesures d'une pièce déposée", () => {
  it("distingue une image nette d'une image floue", async () => {
    const net = await documentNet();
    const flou = await sharp(net).blur(3).jpeg({ quality: 92 }).toBuffer();

    const mesureNette = await mesurerLaPiece(net, ".jpg");
    const mesureFloue = await mesurerLaPiece(flou, ".jpg");

    expect(mesureNette.nettete).not.toBeNull();
    expect(mesureFloue.nettete).not.toBeNull();
    /*
     * Un ordre, non un seuil : les seuils vivent dans le domaine et s'y éprouvent. Ce
     * qui se vérifie ici est que la mesure mesure - le rapport d'un à cinq est très
     * au-delà du bruit, et un `convolve` sans effet les rendrait égales.
     */
    expect(mesureFloue.nettete!).toBeLessThan(mesureNette.nettete! / 3);
  });

  it("ne confond pas la netteté avec le contraste", async () => {
    /*
     * C'était exactement le symptôme du piège : les deux nombres sortaient identiques.
     * Une image floutée garde l'essentiel de son contraste et perd sa netteté ; si les
     * deux mesures bougent ensemble, l'une des deux ne mesure pas ce qu'elle dit.
     */
    const flou = await sharp(await documentNet()).blur(3).jpeg({ quality: 92 }).toBuffer();
    const mesure = await mesurerLaPiece(flou, ".jpg");
    expect(mesure.nettete).not.toBeCloseTo(mesure.contraste!, 1);
  });

  it("relève une image sous-exposée", async () => {
    const sombre = await sharp(await documentNet()).linear(0.25, 0).jpeg().toBuffer();
    const mesure = await mesurerLaPiece(sombre, ".jpg");
    expect(mesure.luminance!).toBeLessThan(60);
  });

  it("rend le plus grand côté, quelle que soit l'orientation", async () => {
    const couchee = await sharp(await documentNet()).rotate(90).jpeg().toBuffer();
    const mesure = await mesurerLaPiece(couchee, ".jpg");
    expect(mesure.cote).toBe(1600);
  });

  it("ne prétend rien mesurer d'un PDF", async () => {
    /*
     * Notre pile ne rasterise pas le PDF. Rendre `null` plutôt qu'un nombre inventé est
     * ce qui permet au domaine de neutraliser ces seuils au lieu de refuser une pièce
     * sur une mesure qui n'existe pas - le modèle, lui, lit le PDF nativement.
     */
    const mesure = await mesurerLaPiece(Buffer.from("%PDF-1.7\n"), ".pdf");
    expect(mesure.cote).toBeNull();
    expect(mesure.nettete).toBeNull();
    expect(mesure.octets).toBeGreaterThan(0);
  });

  it("ne fait pas échouer un dépôt sur un fichier qu'elle n'ouvre pas", async () => {
    /*
     * Le contenu a déjà passé le contrôle de signature binaire du dépôt : un échec ici
     * est plus probablement un format exotique qu'un fichier hostile, et la lecture le
     * regardera de toute façon.
     */
    const mesure = await mesurerLaPiece(Buffer.from("ceci n'est pas une image"), ".jpg");
    expect(mesure.cote).toBeNull();
    expect(mesure.octets).toBe(24);
  });

  it("ramène le HEIC des iPhone à un JPEG que le modèle sait lire", async () => {
    /*
     * C'est le format par défaut de tout appareil récent : sans cette conversion, la
     * lecture échouerait précisément sur les pièces les plus courantes.
     */
    const heic = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: "#cfcfcf" },
    })
      .heif({ compression: "av1" })
      .toBuffer();

    const jpeg = await enJpegPourLecture(heic);
    const metadonnees = await sharp(jpeg).metadata();
    expect(metadonnees.format).toBe("jpeg");
    /* Et réduit : une photographie de douze mégapixels n'a pas à voyager entière. */
    expect(metadonnees.width).toBe(2000);
  });
});
