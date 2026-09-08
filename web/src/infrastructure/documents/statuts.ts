import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { journal } from "@/lib/journal";
import {
  verifierRetouche,
  fragmentsDe,
  angleRetenu,
  pointTourne,
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

/*
 * Où sont gardées les lectures déjà faites.
 *
 * À côté des dépôts, pour la même raison qu'eux : ce sont des fichiers de travail, et
 * ils suivront le stockage objet le jour où les dépôts y passeront.
 */
const CACHE = join(process.cwd(), "..", "uploads", "lectures");

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
  pages: PageDeStatuts[],
  surPage?: (faites: number) => void
): Promise<Mot[]> {
  const source = join(dossier, "statuts.pdf");
  await executer("pdftoppm", ["-r", String(PPP), "-png", source, join(dossier, "page")], {
    timeout: 180_000,
  });

  const images = (await readdir(dossier)).filter((f) => f.startsWith("page") && f.endsWith(".png")).sort();
  const mots: Mot[] = [];
  const echelle = 72 / PPP;
  let faites = 0;

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

    /*
      Une page de plus, dite tout de suite.

      C'est le seul point de la lecture où l'on sait avancer : l'écran s'en sert pour
      annoncer ce qu'il reste, et sans lui l'attente n'a pas de fond. On compte les
      images traitées et non leur numéro - une page manquante décalerait le compte.
    */
    surPage?.(++faites);
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
/**
 * La lecture d'un document, gardée d'une fois sur l'autre.
 *
 * Lire des statuts numérisés, c'est en reconnaître les caractères page par page : une
 * quarantaine de secondes pour dix-sept pages. L'écran de retouche relançait ce travail
 * à chaque ouverture de l'onglet - le même document, le même résultat, et l'avocat
 * devant « Lecture des statuts… » à chaque aller-retour.
 *
 * La clé est l'empreinte du fichier : un document remplacé a une autre empreinte, et sa
 * lecture ne peut donc pas être servie à sa place. Un cache illisible ou périmé est
 * ignoré plutôt que fatal - au pire, on relit.
 */
/**
 * L'empreinte d'un document, telle que le cache la nomme.
 *
 * Elle sert aussi d'ailleurs : c'est le seul jeton qui change quand le document change,
 * et une image de page se sert du cache du navigateur tant que son adresse ne bouge pas.
 */
export function empreinteDuDocument(pdf: Buffer): string {
  return createHash("sha1").update(pdf).digest("hex");
}

/** La lecture déjà faite, si elle l'a été. Rien de plus : elle ne lit pas. */
export async function lectureGardee(empreinte: string): Promise<LectureDesStatuts | null> {
  try {
    const garde = JSON.parse(
      await readFile(join(CACHE, empreinte + ".json"), "utf8")
    ) as LectureDesStatuts;
    if (Array.isArray(garde.pages) && Array.isArray(garde.mots)) return garde;
  } catch {
    // Rien en cache, ou cache abîmé : on lit.
  }
  return null;
}

export async function garderLaLecture(
  empreinte: string,
  lecture: LectureDesStatuts
): Promise<void> {
  try {
    await mkdir(CACHE, { recursive: true });
    await writeFile(join(CACHE, empreinte + ".json"), JSON.stringify(lecture));
  } catch (e) {
    // Un cache qui ne s'écrit pas ne doit pas faire échouer une lecture réussie.
    journal.warn({ err: e }, "Lecture des statuts non mise en cache");
  }
}

export async function lireLesStatutsEnCache(pdf: Buffer): Promise<LectureDesStatuts> {
  const empreinte = empreinteDuDocument(pdf);

  const garde = await lectureGardee(empreinte);
  if (garde) return garde;

  const lecture = await lireLesStatuts(pdf);
  await garderLaLecture(empreinte, lecture);
  return lecture;
}

/** Ce que la lecture raconte d'elle-même pendant qu'elle travaille. */
export interface RapportDeLecture {
  /** Le nombre de pages, connu dès que la couche texte a été sondée. */
  surPages?: (pages: number) => void;
  /** Le nombre de pages reconnues jusqu'ici. */
  surPage?: (faites: number) => void;
}

export async function lireLesStatuts(
  pdf: Buffer,
  rapport?: RapportDeLecture
): Promise<LectureDesStatuts> {
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

    rapport?.surPages?.(pages.length);

    if (mots.length > 0) return { pages, mots, reconnus: false };

    // Aucune couche texte : le document est une numérisation.
    try {
      return {
        pages,
        mots: await reconnaissance(dossier, pages, rapport?.surPage),
        reconnus: true,
      };
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

/**
 * La hauteur d'une ligne, en multiples de la taille du texte.
 *
 * Elle vaut ce que vaut le `line-height` des cadres de l'éditeur - voir `.repere` et
 * `.repereSaisie` dans `Modification.module.css`. Les deux nombres doivent bouger
 * ensemble : c'est ce qui fait que le document rend le texte là où l'avocat l'a posé.
 */
const HAUTEUR_DE_LIGNE = 1.15;

/**
 * La hampe et le jambage du navigateur, pour les trois familles non embarquées.
 *
 * Le navigateur cale une ligne sur les métriques `hhea` de la police ; pdf-lib, pour
 * les quatorze polices garanties du PDF, ne connaît que l'`Ascender` de l'AFM, qui est
 * l'ascendante typographique et non celle de la ligne - 0,683 contre 0,891 pour un
 * Times. Écrire à partir de la seconde posait le texte un dixième de ligne trop haut.
 *
 * Les valeurs sont relevées sur les polices que le navigateur emploie réellement :
 * Times New Roman, Arial et Courier New, dont les substituts libres - Liberation
 * Serif, Sans et Mono - reprennent les mêmes tables, par construction.
 *
 * Les quatre autres familles voyagent dans le document : le navigateur charge le même
 * fichier `.ttf` que pdf-lib embarque, et leurs métriques concordent d'elles-mêmes.
 */
const METRIQUES_DU_NAVIGATEUR: Record<string, { hampe: number; jambage: number }> = {
  serif: { hampe: 0.891113, jambage: 0.216309 },
  sans: { hampe: 0.905273, jambage: 0.211914 },
  mono: { hampe: 0.83252, jambage: 0.300293 },
};

export async function appliquerLesRetouches(
  pdf: Buffer,
  retouches: Retouche[],
  pagesRetirees: number[] = []
): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");

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

      /*
       * L'inclinaison du cadre, quand la page a été numérisée de travers.
       *
       * Tout tourne autour du centre du cadre - le blanc comme le texte - parce que
       * c'est ainsi qu'on le fait pivoter à l'écran. pdf-lib tournant autour du point
       * d'origine de ce qu'il dessine, chaque point est reporté avant d'être posé.
       */
      const angle = angleRetenu(retouche.angle);
      const centre = {
        x: retouche.x + retouche.largeur / 2,
        y: height - retouche.y - retouche.hauteur / 2,
      };
      const tourner = (point: { x: number; y: number }) =>
        angle === 0 ? point : pointTourne(point, centre, angle);

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

      /*
       * Le blanc couvre au moins ce qu'on écrit.
       *
       * Il prenait la largeur de l'emplacement repéré - la boîte de l'ancienne valeur.
       * Une nouvelle valeur plus longue se dessinait donc en partie hors du blanc, par
       * dessus ce que le blanc n'avait pas effacé : « 75008 Paris » venait se
       * superposer à la fin de l'ancienne adresse. Le texte n'étant jamais rogné par
       * `drawText`, c'était le cache qu'il fallait mesurer sur lui.
       */
      const largeurDuTexte = morceaux.reduce((total, m) => total + m.largeur, 0);
      const largeurCouverte = Math.max(retouche.largeur, largeurDuTexte);

      /*
       * Le texte se pose en haut du cadre, comme à l'écran.
       *
       * La ligne de base était calée sur le bas du cadre, remontée d'un jambage
       * forfaitaire. L'éditeur, lui, pose le texte en haut : le cadre y est un bloc, et
       * un bloc se remplit par le haut. Les deux ne coïncidaient que sur un cadre juste
       * à la taille du texte - et un cadre est repéré sur les bornes de l'ancienne
       * valeur, toujours un peu plus haute que la nouvelle. Sur l'adresse d'un siège,
       * cadre de 15,7 points pour un texte de 9,9, l'écart faisait 4,7 points : le
       * texte placé sur la ligne se retrouvait une demi-ligne plus bas dans le document.
       *
       * On reproduit donc la règle du navigateur, qui est la seule que l'avocat voit :
       * la ligne fait 1,15 fois la taille du texte, la hauteur des glyphes se centre
       * dedans, et la ligne de base tombe sous cette moitié d'interligne augmentée de
       * la hampe. Le « strut » se mesure sur la police du cadre et non sur celle d'un
       * fragment : un mot passé en gras ne déplace pas la ligne à l'écran.
       */
      const mesures = METRIQUES_DU_NAVIGATEUR[retouche.police ?? "serif"];
      const strut = mesures ? null : await policeDe(retouche);
      const hampe = mesures
        ? mesures.hampe * retouche.taille
        : strut!.heightAtSize(retouche.taille, { descender: false });
      const jambage = mesures
        ? mesures.jambage * retouche.taille
        : strut!.heightAtSize(retouche.taille) - hampe;
      const hauteurLigne = retouche.taille * HAUTEUR_DE_LIGNE;
      const demiInterligne = (hauteurLigne - (hampe + jambage)) / 2;

      /*
       * Le blanc part du haut, lui aussi, et couvre au moins la ligne écrite.
       *
       * Ancré au bas d'un cadre rétréci sous la taille du texte, il laissait les
       * jambages dépasser sur ce qu'il n'avait pas effacé.
       */
      const hauteurCouverte = Math.max(retouche.hauteur, hauteurLigne);

      const coinDuBlanc = tourner({
        x: retouche.x - marge,
        y: height - retouche.y - hauteurCouverte - marge,
      });

      page.drawRectangle({
        x: coinDuBlanc.x,
        y: coinDuBlanc.y,
        width: largeurCouverte + marge * 2,
        height: hauteurCouverte + marge * 2,
        color: rgb(1, 1, 1),
        ...(angle === 0 ? {} : { rotate: degrees(-angle) }),
      });

      /*
       * La mesure de l'éditeur l'emporte sur le calcul.
       *
       * Le navigateur cale sa ligne sur les métriques que le système lui donne de la
       * police, et elles ne sont ni celles de la table du fichier ni les mêmes d'un
       * système à l'autre : sur un Times de 9,9 points, Chrome sous macOS annonce une
       * hampe de 0,879 em là où le fichier dit 0,891. Trois dixièmes de point d'écart,
       * un pixel à l'écran - assez pour qu'une adresse posée sur sa ligne s'en écarte
       * dans l'acte. L'éditeur mesure donc ce qu'il a dessiné et l'envoie avec le cadre.
       *
       * Le calcul reste, pour les cadres posés avant, et parce qu'un acte doit se
       * produire même sans cette mesure.
       */
      const depuisLeHaut =
        typeof retouche.ligneDeBase === "number" && retouche.ligneDeBase > 0
          ? retouche.ligneDeBase
          : demiInterligne + hampe;

      const ligneDeBase = height - retouche.y - depuisLeHaut;

      /*
       * L'alignement se calcule, il ne se déclare pas.
       *
       * Un PDF ne connaît pas de « texte centré » : il connaît une abscisse. Centrer
       * demande donc de mesurer le texte dans sa police et sa taille, puis de poser
       * l'origine en conséquence.
       */
      const reste = Math.max(0, largeurCouverte - largeurDuTexte);
      const decalage =
        retouche.alignement === "centre"
          ? reste / 2
          : retouche.alignement === "droite"
            ? reste
            : 0;

      let abscisse = retouche.x + decalage;
      for (const morceau of morceaux) {
        const depart = tourner({ x: abscisse, y: ligneDeBase });

        page.drawText(morceau.texte, {
          x: depart.x,
          y: depart.y,
          size: retouche.taille,
          font: morceau.fonte,
          color: rgb(0, 0, 0),
          ...(angle === 0 ? {} : { rotate: degrees(-angle) }),
        });

        /*
         * Le souligné se trace : aucune police standard n'en porte.
         *
         * Le trait suit le morceau souligné, non le cadre entier - souligner trois
         * cents points pour un mot de quarante se verrait.
         */
        if (morceau.souligne) {
          const bas = ligneDeBase - retouche.taille * 0.12;
          // Un trait se définit par ses deux points : il suffit de les tourner.
          page.drawLine({
            start: tourner({ x: abscisse, y: bas }),
            end: tourner({ x: abscisse + morceau.largeur, y: bas }),
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
