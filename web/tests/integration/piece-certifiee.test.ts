import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFArray, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import {
  certifier,
  enPageDePdf,
  MENTION,
  LARGEUR,
  HAUTEUR,
  MARGE,
  PieceNonCertifiable,
} from "@/infrastructure/documents/piece-certifiee";

/**
 * La mention de conformité, telle qu'elle se pose réellement sur une pièce.
 *
 * Le test lit le flux de contenu des pages plutôt que de se fier à ce que le code
 * prétend écrire : c'est la seule façon de savoir que la mention est bien là, et à
 * l'endroit annoncé. pdf-lib écrit les chaînes en hexadécimal et comprime les flux ;
 * `contenuDesPages` défait les deux.
 */

/** Le texte des opérateurs d'une page, chaînes hexadécimales décodées. */
async function contenuDesPages(pdf: Buffer): Promise<string[]> {
  const document = await PDFDocument.load(new Uint8Array(pdf));

  return document.getPages().map((page) => {
    const contenu = document.context.lookup(page.node.get(PDFName.of("Contents")));
    const flux =
      contenu instanceof PDFArray
        ? contenu.asArray().map((r) => document.context.lookup(r))
        : [contenu];

    const brut = flux
      .filter((f): f is PDFRawStream => f instanceof PDFRawStream)
      .map((f) => Buffer.from(decodePDFRawStream(f).decode()).toString("latin1"))
      .join("\n");

    /* Les chaînes sont écrites <48656c6c6f> : on les rend lisibles pour pouvoir les chercher. */
    return brut.replace(/<([0-9A-Fa-f]+)>/g, (_, hex: string) =>
      Buffer.from(hex, "hex").toString("latin1")
    );
  });
}

/** Une photographie de carte, dans les proportions d'une carte d'identité. */
async function photographie(largeur: number, hauteur: number): Promise<Buffer> {
  return sharp({
    create: { width: largeur, height: hauteur, channels: 3, background: "#d8d8d0" },
  })
    .jpeg()
    .toBuffer();
}

/** Un tracé de signature, comme la zone de signature en produit. */
async function trace(): Promise<string> {
  const png = await sharp({
    create: { width: 300, height: 120, channels: 4, background: "#00000000" },
  })
    .png()
    .toBuffer();
  return "data:image/png;base64," + png.toString("base64");
}

const LE_JOUR = new Date("2026-09-14T12:00:00Z");

describe("la copie certifiée conforme", () => {
  it("porte la mention et la date de signature", async () => {
    const document = await enPageDePdf(await photographie(1600, 1000), ".jpg");
    const pdf = await certifier(document, { trace: await trace(), le: LE_JOUR });

    const [page] = await contenuDesPages(pdf);
    expect(page).toContain(MENTION);
    expect(page).toContain("le 14 septembre 2026");
  });

  it("la pose en haut à droite, non au milieu du document", async () => {
    /*
     * La position se lit dans la matrice de texte, « 1 0 0 1 x y Tm ». Elle est
     * vérifiée ici parce qu'un cadre bien dimensionné mais posé au centre couvrirait la
     * photographie du titulaire - ce qui rendrait la copie inutilisable au greffe.
     */
    const largeur = 1600;
    const hauteur = 1000;
    const document = await enPageDePdf(await photographie(largeur, hauteur), ".jpg");
    const pdf = await certifier(document, { trace: null, le: LE_JOUR });

    const [page] = await contenuDesPages(pdf);
    const position = page.match(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/);
    expect(position).not.toBeNull();

    const x = Number(position![1]);
    const y = Number(position![2]);
    expect(x).toBeGreaterThan(largeur / 2);
    expect(y).toBeGreaterThan(hauteur / 2);
    /* Et dans la page, jamais au-delà. */
    expect(x + LARGEUR).toBeLessThanOrEqual(largeur);
    expect(y).toBeLessThanOrEqual(hauteur - MARGE);
  });

  it("tient dans un coin, sans manger le document", async () => {
    /*
     * Sur une A4 - le format d'une pièce numérisée - l'emprise du cadre reste sous cinq
     * pour cent de la page. C'est la contrainte qui justifie le corps de sept points et
     * demi : plus gros, la mention déborderait sur le document qu'elle certifie.
     */
    const A4 = 595 * 842;
    expect((LARGEUR * HAUTEUR) / A4).toBeLessThan(0.05);
  });

  it("certifie chaque page, recto comme verso", async () => {
    /*
     * Un recto et un verso déposés ensemble font deux pages d'un même fichier. Une copie
     * dont seule la première face porte la mention n'est certifiée qu'à moitié - et
     * c'est le verso qui porte l'adresse et la zone lisible par machine.
     */
    const deux = await PDFDocument.create();
    deux.addPage([842, 595]);
    deux.addPage([842, 595]);

    const pages = await contenuDesPages(
      await certifier(deux, { trace: await trace(), le: LE_JOUR })
    );
    expect(pages).toHaveLength(2);
    for (const page of pages) expect(page).toContain(MENTION);
  });

  it("appose le tracé de la signature quand il y en a un", async () => {
    const avec = await contenuDesPages(
      await certifier(await PDFDocument.create().then((d) => (d.addPage([600, 400]), d)), {
        trace: await trace(),
        le: LE_JOUR,
      })
    );
    /* « Do » dessine l'objet externe : c'est l'image du tracé. */
    expect(avec[0]).toMatch(/\/[\w-]+ Do/);

    const sans = await contenuDesPages(
      await certifier(await PDFDocument.create().then((d) => (d.addPage([600, 400]), d)), {
        trace: null,
        le: LE_JOUR,
      })
    );
    expect(sans[0]).toContain(MENTION);
    expect(sans[0]).not.toMatch(/\/[\w-]+ Do/);
  });

  it("refuse un tracé qui n'est pas une image en ligne", async () => {
    /*
     * La colonne est alimentée par la zone de signature, mais elle finit dans un
     * document : on n'y injecte pas un contenu arbitraire. Sans préfixe attendu, il n'y
     * a pas de tracé, et la mention part seule plutôt que d'échouer.
     */
    const document = await PDFDocument.create();
    document.addPage([600, 400]);
    const pdf = await certifier(document, { trace: "<svg onload=alert(1)>", le: LE_JOUR });

    const [page] = await contenuDesPages(pdf);
    expect(page).toContain(MENTION);
    expect(page).not.toMatch(/\/[\w-]+ Do/);
  });
});

describe("la page qui porte la photographie", () => {
  it("épouse le cadrage de l'image plutôt qu'une A4", async () => {
    /*
     * Une carte posée au milieu d'une A4 se voit rétrécie à l'impression, et la mention
     * dans le coin de la feuille se retrouve à des centimètres du document qu'elle
     * certifie.
     */
    const document = await enPageDePdf(await photographie(1600, 1000), ".jpg");
    const [page] = document.getPages();
    expect(page.getWidth()).toBe(1600);
    expect(page.getHeight()).toBe(1000);
  });

  it("ne descend jamais sous l'emprise du tampon", async () => {
    /* Une image plus étroite que le cadre ferait déborder la mention hors de la page. */
    const document = await enPageDePdf(await photographie(80, 50), ".jpg");
    const [page] = document.getPages();
    expect(page.getWidth()).toBeGreaterThanOrEqual(LARGEUR + 2 * MARGE);
    expect(page.getHeight()).toBeGreaterThanOrEqual(HAUTEUR + 2 * MARGE);
  });

  it("reprend un PDF déposé tel quel, sans le remettre en image", async () => {
    const origine = await PDFDocument.create();
    origine.addPage([595, 842]);
    origine.addPage([595, 842]);
    const depose = Buffer.from(await origine.save());

    const document = await enPageDePdf(depose, ".pdf");
    expect(document.getPageCount()).toBe(2);
  });

  it("accepte les formats que pdf-lib n'embarque pas, dont le HEIC des iPhone", async () => {
    /*
     * C'est le format par défaut de tout appareil récent, donc le cas le plus fréquent.
     * Sans la conversion, la pièce la plus courante serait la seule à ne pas pouvoir
     * être certifiée.
     */
    const heic = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#cccccc" },
    })
      .heif({ compression: "av1" })
      .toBuffer();

    const document = await enPageDePdf(heic, ".heic");
    const [page] = document.getPages();
    expect(page.getWidth()).toBeGreaterThan(LARGEUR);
  });
});

describe("ce qui ne se certifie pas", () => {
  it("se nomme, au lieu de rompre au milieu", async () => {
    /*
     * pdf-lib accepte de charger un PDF dont le catalogue ne mène à aucune page - un
     * fichier tronqué, un « %PDF- » suivi de rien - et c'est `getPages()` qui rompt
     * plus loin, sur une erreur qui ne dit pas de quoi il s'agit. Le cas s'est présenté
     * sur le dépôt local, et sans ce nom il aurait fait échouer un dépôt au guichet
     * entier sur une seule pièce.
     */
    await expect(
      enPageDePdf(Buffer.from("%PDF-1.4\nessai\n%%EOF\n"), ".pdf")
    ).rejects.toThrow(PieceNonCertifiable);
  });
});
