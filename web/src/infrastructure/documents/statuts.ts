import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { journal } from "@/lib/journal";
import {
  verifierRetouche,
  fragmentsDe,
  POLICES_EMBARQUEES,
  type Mot,
  type Retouche,
} from "@/domain/modification/edition";

/**
 * Lire et retoucher un PDF de statuts.
 *
 * Deux besoins : savoir où se trouve chaque mot, pour repérer le passage à changer ;
 * et poser un rectangle blanc avec du texte par-dessus, sans toucher au reste.
 *
 * Les positions viennent de pdftotext, qui rend la couche texte du PDF avec les
 * coordonnées de chaque mot. Un acte numérisé n'en a pas : on passe alors par une
 * reconnaissance de caractères. Les deux outils sont dans l'image - le Dockerfile
 * installe poppler-utils et tesseract avec le dictionnaire français, et le
 * commentaire qui l'accompagne dit déjà que c'est pour les statuts de l'INPI.
 *
 * La retouche se fait avec pdf-lib, en pur JavaScript : le document d'origine est
 * conservé tel quel, pages, polices et mise en page comprises. Le rasteriser puis le
 * recomposer aurait été plus simple et aurait rendu un document flou, non
 * sélectionnable, dont le greffe aurait vu qu'il avait été retravaillé.
 */
const executer = promisify(execFile);

/** Au-delà, ce n'est plus des statuts : on refuse plutôt que de faire ramer la machine. */
const PAGES_MAXIMUM = 60;
const OCTETS_MAXIMUM = 25 * 1024 * 1024;
/** Résolution de la reconnaissance de caractères. 200 ppp suffit pour du texte. */
const PPP = 200;

export class StatutsIllisibles extends Error {
  readonly statut = 400;
}

export interface PageDeStatuts {
  numero: number;
  largeur: number;
  hauteur: number;
}

export interface LectureDesStatuts {
  pages: PageDeStatuts[];
  mots: Mot[];
  /** Vrai quand les mots viennent d'une reconnaissance de caractères. */
  reconnus: boolean;
}

async function dansUnDossier<T>(travail: (dossier: string) => Promise<T>): Promise<T> {
  const dossier = await mkdtemp(join(tmpdir(), "statuts-"));
  try {
    return await travail(dossier);
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

function nombre(valeur: string | undefined): number {
  const lu = Number(valeur);
  return Number.isFinite(lu) ? lu : 0;
}

/**
 * Le XHTML de pdftotext, lu à la main.
 *
 * Le format est plat et stable : une balise page porte ses dimensions, chaque word
 * ses quatre bornes. Une bibliothèque XML complète pour deux expressions régulières
 * serait une dépendance de plus à maintenir pour rien.
 */
function lireLeXhtml(xhtml: string): { pages: PageDeStatuts[]; mots: Mot[] } {
  const pages: PageDeStatuts[] = [];
  const mots: Mot[] = [];

  const blocsDePage = xhtml.split(/<page\b/).slice(1);

  blocsDePage.forEach((bloc, index) => {
    const numero = index + 1;
    const dimensions = /^[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/.exec(bloc);
    pages.push({
      numero,
      largeur: nombre(dimensions?.[1]),
      hauteur: nombre(dimensions?.[2]),
    });

    const motif = /<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([\s\S]*?)<\/word>/g;
    let trouve: RegExpExecArray | null;
    while ((trouve = motif.exec(bloc)) !== null) {
      const texte = trouve[5]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
      if (!texte.trim()) continue;

      const x = nombre(trouve[1]);
      const y = nombre(trouve[2]);
      mots.push({
        page: numero,
        texte,
        x,
        y,
        largeur: nombre(trouve[3]) - x,
        hauteur: nombre(trouve[4]) - y,
      });
    }
  });

  return { pages, mots };
}

/** Les mots de la couche texte, quand le PDF en a une. */
async function coucheTexte(dossier: string): Promise<{ pages: PageDeStatuts[]; mots: Mot[] }> {
  const source = join(dossier, "statuts.pdf");
  const sortie = join(dossier, "statuts.xhtml");

  await executer("pdftotext", ["-bbox-layout", source, sortie], { timeout: 30_000 });
  return lireLeXhtml(await readFile(sortie, "utf8"));
}

/**
 * Les mots reconnus sur les images des pages.
 *
 * tesseract rend un tableau où chaque ligne est un mot, avec sa position en pixels.
 * On la ramène en points : les coordonnées du domaine sont celles du PDF, quelle que
 * soit la résolution à laquelle on a lu la page.
 */
async function reconnaissance(
  dossier: string,
  pages: PageDeStatuts[]
): Promise<Mot[]> {
  const source = join(dossier, "statuts.pdf");
  await executer("pdftoppm", ["-r", String(PPP), "-png", source, join(dossier, "page")], {
    timeout: 180_000,
  });

  const images = (await readdir(dossier)).filter((f) => f.startsWith("page") && f.endsWith(".png")).sort();
  const mots: Mot[] = [];
  const echelle = 72 / PPP;

  for (const image of images) {
    const numero = nombre(/page-?(\d+)\.png$/.exec(image)?.[1]) || 1;
    if (numero > PAGES_MAXIMUM) break;

    const { stdout } = await executer(
      "tesseract",
      [join(dossier, image), "stdout", "-l", "fra", "tsv"],
      { timeout: 120_000, maxBuffer: 32 * 1024 * 1024 }
    );

    for (const ligne of stdout.split("\n").slice(1)) {
      const colonnes = ligne.split("\t");
      if (colonnes.length < 12) continue;
      const texte = colonnes[11]?.trim();
      if (!texte) continue;
      // La confiance vaut -1 pour les lignes de structure, qui ne portent pas de mot.
      if (nombre(colonnes[10]) < 0) continue;

      mots.push({
        page: numero,
        texte,
        x: nombre(colonnes[6]) * echelle,
        y: nombre(colonnes[7]) * echelle,
        largeur: nombre(colonnes[8]) * echelle,
        hauteur: nombre(colonnes[9]) * echelle,
      });
    }
  }

  journal.info({ pages: pages.length, mots: mots.length }, "Statuts lus par reconnaissance");
  return mots;
}

/**
 * Les mots d'un PDF de statuts, situés.
 *
 * La couche texte d'abord, la reconnaissance ensuite : la première est exacte et
 * instantanée, la seconde approximative et lente. Un acte de l'INPI en a presque
 * toujours une - il vient d'un dépôt numérique - mais les dépôts anciens sont des
 * numérisations.
 */
export async function lireLesStatuts(pdf: Buffer): Promise<LectureDesStatuts> {
  if (pdf.byteLength > OCTETS_MAXIMUM) {
    throw new StatutsIllisibles("Ce document dépasse 25 Mo");
  }

  return dansUnDossier(async (dossier) => {
    await writeFile(join(dossier, "statuts.pdf"), pdf);

    let pages: PageDeStatuts[];
    let mots: Mot[];
    try {
      ({ pages, mots } = await coucheTexte(dossier));
    } catch (e) {
      journal.error({ err: e }, "Lecture de la couche texte interrompue");
      throw new StatutsIllisibles("Ce document n'a pas pu être lu");
    }

    if (pages.length === 0) throw new StatutsIllisibles("Ce document ne contient aucune page");
    if (pages.length > PAGES_MAXIMUM) {
      throw new StatutsIllisibles("Ce document dépasse " + PAGES_MAXIMUM + " pages");
    }

    if (mots.length > 0) return { pages, mots, reconnus: false };

    // Aucune couche texte : le document est une numérisation.
    try {
      return { pages, mots: await reconnaissance(dossier, pages), reconnus: true };
    } catch (e) {
      journal.error({ err: e }, "Reconnaissance de caractères interrompue");
      throw new StatutsIllisibles("Ce document n'a pas pu être lu, même en reconnaissance");
    }
  });
}

/** L'image d'une page, pour l'afficher dans l'éditeur. */
export async function pageEnImage(pdf: Buffer, numero: number): Promise<Buffer> {
  if (!Number.isInteger(numero) || numero < 1 || numero > PAGES_MAXIMUM) {
    throw new StatutsIllisibles("Numéro de page hors limites");
  }

  return dansUnDossier(async (dossier) => {
    await writeFile(join(dossier, "statuts.pdf"), pdf);
    await executer(
      "pdftoppm",
      [
        "-f", String(numero),
        "-l", String(numero),
        "-r", "150",
        "-png",
        "-singlefile",
        join(dossier, "statuts.pdf"),
        join(dossier, "page"),
      ],
      { timeout: 60_000 }
    );
    return readFile(join(dossier, "page.png"));
  });
}

/**
 * Applique les retouches au PDF.
 *
 * Un rectangle blanc posé sur le texte le cache à l'œil et le laisse dans le
 * document : le PDF garde ses instructions d'écriture, et pdftotext rend encore
 * l'ancienne adresse. Sur des statuts déposés au greffe, l'ancienne valeur resterait
 * sélectionnable, copiable, et lisible par n'importe quel outil. Vérifié : la
 * première version de cette fonction produisait exactement cela.
 *
 * Les pages retouchées sont donc rendues en image, puis recomposées : le texte
 * d'origine n'existe plus qu'en pixels, que le rectangle blanc recouvre pour de bon.
 * Le nouveau texte est écrit par-dessus en vraies lettres, donc sélectionnable et
 * cherchable. Les pages sans retouche sont recopiées telles quelles, avec leur
 * couche texte - il n'y a aucune raison de dégrader vingt pages pour en corriger une.
 *
 * Les coordonnées arrivent avec l'origine en haut à gauche, comme les rend
 * pdftotext ; le PDF compte depuis le bas. La conversion est ici, en un seul endroit.
 */
export async function appliquerLesRetouches(
  pdf: Buffer,
  retouches: Retouche[],
  pagesRetirees: number[] = []
): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const origine = await PDFDocument.load(pdf).catch(() => {
    throw new StatutsIllisibles("Ce document n'est pas un PDF lisible");
  });

  const ecartees = new Set(pagesRetirees);
  if (retouches.length === 0 && ecartees.size === 0) return pdf;

  const pagesRetouchees = new Set(retouches.map((r) => r.page));
  for (const numero of pagesRetouchees) {
    if (numero < 1 || numero > origine.getPageCount()) {
      throw new StatutsIllisibles("Une retouche vise une page inexistante");
    }
  }

  const images = await imagesDesPages(pdf, [...pagesRetouchees]);

  const produit = await PDFDocument.create();

  /*
   * Les quatre variantes de chaque famille, embarquées une fois.
   *
   * Un acte est composé en serif : écrire la nouvelle valeur en sans serif à côté de
   * l'ancienne se voit immédiatement et fait douter du document. Le gras et
   * l'italique ne s'obtiennent pas par un réglage mais par une police distincte -
   * c'est ainsi que le PDF fonctionne.
   */
  /*
   * Les familles embarquées.
   *
   * Un PDF n'a que quatorze polices garanties ; toute autre doit voyager dans le
   * document. fontkit lit le fichier, pdf-lib l'embarque - et il en faut un par
   * variante, le gras d'une police n'étant pas un réglage mais une autre police.
   *
   * Le fichier absent n'interrompt pas la production : on retombe sur le serif
   * standard. Mieux vaut un acte composé autrement que pas d'acte du tout.
   */
  const dossierDesPolices = join(process.cwd(), "public", "polices");
  let fontkitCharge = false;

  async function embarquerLeFichier(famille: string, rang: number) {
    const nom = POLICES_EMBARQUEES[famille];
    if (!nom) return null;

    const variante = ["regular", "bold", "italic", "bolditalic"][rang];
    try {
      const contenu = await readFile(join(dossierDesPolices, nom + "-" + variante + ".ttf"));
      if (!fontkitCharge) {
        const fontkit = (await import("@pdf-lib/fontkit")).default;
        produit.registerFontkit(fontkit);
        fontkitCharge = true;
      }
      return await produit.embedFont(contenu, { subset: true });
    } catch (e) {
      journal.warn({ err: e, famille, variante }, "Police embarquée introuvable, serif employé");
      return null;
    }
  }

  const familles = {
    serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
    sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
    mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
  } as const;

  const embarquees = new Map<string, Awaited<ReturnType<typeof produit.embedFont>>>();
  for (const [famille, variantes] of Object.entries(familles)) {
    for (let i = 0; i < variantes.length; i++) {
      embarquees.set(famille + ":" + i, await produit.embedFont(variantes[i]));
    }
  }

  /** La variante correspondant au gras et à l'italique demandés. */
  async function policeDe(retouche: Retouche) {
    const famille = retouche.police ?? "serif";
    const rang = (retouche.gras ? 1 : 0) + (retouche.italique ? 2 : 0);

    const deja = embarquees.get(famille + ":" + rang);
    if (deja) return deja;

    const embarquee = await embarquerLeFichier(famille, rang);
    if (embarquee) {
      embarquees.set(famille + ":" + rang, embarquee);
      return embarquee;
    }

    return embarquees.get("serif:" + rang) ?? embarquees.get("serif:0")!;
  }

  for (let index = 0; index < origine.getPageCount(); index++) {
    const numero = index + 1;

    // Une page écartée ne figure pas dans le document produit ; l'original la garde.
    if (ecartees.has(numero)) continue;

    if (!pagesRetouchees.has(numero)) {
      const [copiee] = await produit.copyPages(origine, [index]);
      produit.addPage(copiee);
      continue;
    }

    const { width, height } = origine.getPage(index).getSize();
    const page = produit.addPage([width, height]);

    const image = images.get(numero);
    if (!image) throw new StatutsIllisibles("Une page n'a pas pu être rendue");
    const posee = await produit.embedPng(image);
    page.drawImage(posee, { x: 0, y: 0, width, height });

    for (const retouche of retouches.filter((r) => r.page === numero)) {
      verifierRetouche(retouche, { largeur: width, hauteur: height });

      // Un peu de marge autour du rectangle : les bornes rendues par pdftotext
      // serrent les glyphes, et un jambage descendant dépasserait du blanc.
      const marge = Math.max(1, retouche.hauteur * 0.15);

      page.drawRectangle({
        x: retouche.x - marge,
        y: height - retouche.y - retouche.hauteur - marge,
        width: retouche.largeur + marge * 2,
        height: retouche.hauteur + marge * 2,
        color: rgb(1, 1, 1),
      });

      /*
       * Le texte se dessine morceau par morceau.
       *
       * Chacun peut avoir son gras, son italique, son souligné - et dans un PDF ce
       * sont autant de polices différentes. On mesure donc chaque morceau, on avance
       * l'abscisse d'autant, et l'on souligne ce qui doit l'être.
       */
      const morceaux: { texte: string; fonte: Awaited<ReturnType<typeof policeDe>>; largeur: number; souligne: boolean }[] = [];

      for (const fragment of fragmentsDe(retouche)) {
        const lisible = lisibleParLaPolice(fragment.texte);
        if (!lisible) continue;

        const fonte = await policeDe({
          ...retouche,
          gras: fragment.gras,
          italique: fragment.italique,
        });
        morceaux.push({
          texte: lisible,
          fonte,
          largeur: fonte.widthOfTextAtSize(lisible, retouche.taille),
          souligne: fragment.souligne === true,
        });
      }

      if (morceaux.length === 0) continue;

      const texte = morceaux.map((m) => m.texte).join("");
      const fonte = morceaux[0].fonte;
      // La ligne de base se pose au bas du rectangle, remontée du jambage.
      const ligneDeBase = height - retouche.y - retouche.hauteur + retouche.taille * 0.2;

      /*
       * L'alignement se calcule, il ne se déclare pas.
       *
       * Un PDF ne connaît pas de « texte centré » : il connaît une abscisse. Centrer
       * demande donc de mesurer le texte dans sa police et sa taille, puis de poser
       * l'origine en conséquence.
       */
      const largeurDuTexte = morceaux.reduce((total, m) => total + m.largeur, 0);
      const reste = Math.max(0, retouche.largeur - largeurDuTexte);
      const decalage =
        retouche.alignement === "centre"
          ? reste / 2
          : retouche.alignement === "droite"
            ? reste
            : 0;

      let abscisse = retouche.x + decalage;
      for (const morceau of morceaux) {
        page.drawText(morceau.texte, {
          x: abscisse,
          y: ligneDeBase,
          size: retouche.taille,
          font: morceau.fonte,
          color: rgb(0, 0, 0),
        });

        /*
         * Le souligné se trace : aucune police standard n'en porte.
         *
         * Le trait suit le morceau souligné, non le cadre entier - souligner trois
         * cents points pour un mot de quarante se verrait.
         */
        if (morceau.souligne) {
          const bas = ligneDeBase - retouche.taille * 0.12;
          page.drawLine({
            start: { x: abscisse, y: bas },
            end: { x: abscisse + morceau.largeur, y: bas },
            thickness: Math.max(0.5, retouche.taille * 0.06),
            color: rgb(0, 0, 0),
          });
        }

        abscisse += morceau.largeur;
      }
    }
  }

  return Buffer.from(await produit.save());
}

/** Les images des pages à recomposer, rendues en une seule passe. */
async function imagesDesPages(pdf: Buffer, numeros: number[]): Promise<Map<number, Buffer>> {
  const images = new Map<number, Buffer>();

  await dansUnDossier(async (dossier) => {
    await writeFile(join(dossier, "statuts.pdf"), pdf);

    for (const numero of numeros) {
      await executer(
        "pdftoppm",
        [
          "-f", String(numero),
          "-l", String(numero),
          "-r", String(PPP),
          "-png",
          "-singlefile",
          join(dossier, "statuts.pdf"),
          join(dossier, "rendu-" + numero),
        ],
        { timeout: 60_000 }
      );
      images.set(numero, await readFile(join(dossier, "rendu-" + numero + ".png")));
    }
  });

  return images;
}

/**
 * Le texte, ramené à ce que la police standard sait écrire.
 *
 * Helvetica couvre le latin occidental, accents et guillemets compris, mais pas les
 * espaces fines ni les tirets longs qu'un traitement de texte insère. Un caractère
 * inconnu fait échouer tout l'écrit de pdf-lib : mieux vaut le remplacer que perdre
 * la retouche entière.
 *
 * Les espaces de bord sont gardés. Les couper collait les morceaux d'un texte
 * découpé : « Premier » suivi de « Second » en gras s'écrivait « PremierSecond »
 * dans le document, alors que l'écran montrait bien l'espace.
 */
export function lisibleParLaPolice(texte: string): string {
  return texte
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[   ]/g, " ")
    .replace(/…/g, "...")
    // Ce qui reste hors du latin-1 étendu ne s'écrira pas : on l'ôte plutôt que de
    // faire échouer la retouche.
    .replace(/[^ -ÿŒœŸ]/g, "");
}
