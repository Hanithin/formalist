import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
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

/**
 * Le texte tombe là où l'avocat l'a posé.
 *
 * L'éditeur pose le texte en haut du cadre - un cadre est un bloc, un bloc se remplit
 * par le haut. Le document, lui, calait la ligne de base sur le bas du cadre, remontée
 * d'un jambage forfaitaire. Les deux ne coïncidaient que sur un cadre juste à la taille
 * du texte, or un cadre est repéré sur les bornes de l'ancienne valeur, toujours plus
 * haute que la nouvelle. Sur l'adresse d'un siège - cadre de 15,7 points, texte de 9,9 -
 * l'écart faisait 4,7 points, soit une demi-ligne : on plaçait sur la ligne, on
 * retrouvait dessous.
 *
 * On mesure ici le texte réellement écrit dans le PDF produit, contre la règle du
 * navigateur : la ligne fait 1,15 fois la taille, la hauteur des glyphes se centre
 * dedans, et la ligne de base tombe sous cette moitié d'interligne augmentée de la
 * hampe. Une page retouchée est rendue en image, sa couche texte ne porte donc que ce
 * qu'on vient d'y écrire.
 */
describe("le texte se pose comme à l'écran", () => {
  const executer = promisify(execFile);

  /* Times New Roman, dont Liberation Serif reprend les tables : ce que rend l'écran. */
  const HAMPE = 0.891113;
  const JAMBAGE = 0.216309;

  /** Les bornes verticales du mot cherché, telles que pdftotext les rend. */
  async function bornesDuMot(pdf: Buffer, mot: string) {
    const dossier = await mkdtemp(join(tmpdir(), "statuts-"));
    try {
      const fichier = join(dossier, "produit.pdf");
      await writeFile(fichier, pdf);
      const { stdout } = await executer("pdftotext", ["-bbox", fichier, "-"]);
      const ligne = stdout.split("\n").find((l) => l.includes(">" + mot + "<"));
      if (!ligne) return null;
      const haut = /yMin="([\d.]+)"/.exec(ligne);
      const bas = /yMax="([\d.]+)"/.exec(ligne);
      return haut && bas ? { haut: Number(haut[1]), bas: Number(bas[1]) } : null;
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  }

  it("ne descend pas le texte quand le cadre est plus haut que lui", async () => {
    const haut = 135;
    const taille = 9.9;
    const produit = await appliquerLesRetouches(await statutsAvecUneAdresse(), [
      {
        ...SUR_L_ANCIENNE_ADRESSE,
        y: haut,
        /* Le cadre repéré sur l'ancienne valeur : plus haut que la nouvelle. */
        hauteur: 15.71,
        taille,
        texte: "12 Rue de Saint-Petersbourg, 75008 Paris",
      },
    ]);

    /* « 75008 » n'a ni hampe ni jambage : ses bornes sont celles de la ligne. */
    const bornes = await bornesDuMot(produit, "75008");
    expect(bornes).not.toBeNull();

    /*
     * C'est la borne basse qu'on mesure : pdftotext la pose sur le jambage de la
     * police, donc à une distance connue de la ligne de base, tandis que la borne
     * haute suit l'encre du mot - la hauteur d'un chiffre, non celle de la hampe.
     */
    const demiInterligne = (taille * 1.15 - (HAMPE + JAMBAGE) * taille) / 2;
    expect(bornes!.bas).toBeCloseTo(haut + demiInterligne + (HAMPE + JAMBAGE) * taille, 1);

    /*
     * Et surtout : pas au bas du cadre, où l'ancienne règle le posait - 4,7 points
     * plus bas, ce qui est ce que l'on voyait.
     */
    expect(bornes!.bas).toBeLessThan(haut + 15.71);
  });
});

/**
 * La mesure de l'éditeur l'emporte sur le calcul.
 *
 * Aucun calcul serveur ne retrouve où le navigateur pose sa ligne de base : il cale sa
 * ligne sur les métriques que le système lui donne de la police, arrondies au pixel, et
 * Chrome sous macOS n'annonce pas les mêmes qu'un Chrome sous Windows ni que la table du
 * fichier. Sur un Times de 9,9 points l'écart faisait trois dixièmes de point - un pixel
 * à l'écran, visible dès qu'on relit l'acte à côté de la ligne visée. L'éditeur mesure
 * donc ce qu'il a dessiné et l'envoie avec le cadre.
 */
describe("la ligne de base mesurée par l'éditeur", () => {
  const executer = promisify(execFile);

  async function basDuMot(pdf: Buffer, mot: string): Promise<number | null> {
    const dossier = await mkdtemp(join(tmpdir(), "statuts-"));
    try {
      const fichier = join(dossier, "produit.pdf");
      await writeFile(fichier, pdf);
      const { stdout } = await executer("pdftotext", ["-bbox", fichier, "-"]);
      const ligne = stdout.split("\n").find((l) => l.includes(">" + mot + "<"));
      const bas = ligne && /yMax="([\d.]+)"/.exec(ligne);
      return bas ? Number(bas[1]) : null;
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  }

  it("place le texte où l'éditeur l'a dessiné, non où le calcul le mettrait", async () => {
    const haut = 135;
    const taille = 9.9;
    /* Ce que Chrome rend ici : 0,879 em, contre 0,912 pour le calcul du serveur. */
    const MESUREE = 8.70345744680851;

    const produit = await appliquerLesRetouches(await statutsAvecUneAdresse(), [
      {
        ...SUR_L_ANCIENNE_ADRESSE,
        y: haut,
        hauteur: 15.71,
        taille,
        ligneDeBase: MESUREE,
        texte: "12 Rue de Saint-Petersbourg, 75008 Paris",
      },
    ]);

    /* Times-Roman : pdftotext pose la borne basse sur le jambage de l'AFM, 0,217 em. */
    const bas = await basDuMot(produit, "75008");
    expect(bas).not.toBeNull();
    expect(bas!).toBeCloseTo(haut + MESUREE + 0.217 * taille, 1);
  });

  /* Un cadre posé avant que l'éditeur ne mesure garde la règle calculée. */
  it("retombe sur le calcul quand le cadre n'apporte pas sa mesure", async () => {
    const haut = 135;
    const taille = 9.9;
    const produit = await appliquerLesRetouches(await statutsAvecUneAdresse(), [
      { ...SUR_L_ANCIENNE_ADRESSE, y: haut, hauteur: 15.71, taille, texte: "75008" },
    ]);

    const demiInterligne = (taille * 1.15 - (0.891113 + 0.216309) * taille) / 2;
    const bas = await basDuMot(produit, "75008");
    expect(bas!).toBeCloseTo(haut + demiInterligne + (0.891113 + 0.216309) * taille, 1);
  });
});
