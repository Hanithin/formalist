import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/infrastructure/db/client";
import { pieceDeposee } from "@/infrastructure/db/depots/fichiers";
import { PREFIXE_PNG } from "@/domain/formalite/signature";
import { estUnePieceDIdentite } from "@/domain/formalite/controle-identite";
import { journal } from "@/lib/journal";
import { enJpegPourDocument } from "./mesures-image";

/**
 * La copie certifiée conforme d'une pièce d'identité.
 *
 * Une copie de pièce d'identité jointe à un dossier de création ne vaut rien en
 * elle-même : c'est la mention manuscrite « certifié conforme à l'original », datée et
 * signée par le titulaire, qui en fait une copie opposable. Nous recueillions déjà sa
 * signature pour les statuts, et sa carte partait au greffe nue - il fallait donc la
 * lui faire imprimer, signer et renumériser, pour un geste qu'il venait de faire en
 * ligne.
 *
 * La composition se fait à la demande, comme celle d'un acte signé, et pour la même
 * raison : écrire la version certifiée sur le disque au moment de la signature paraît
 * plus simple, mais elle se périme - une signature reprise, une pièce remplacée, et le
 * fichier stocké ment sans que rien ne le dise. Ce qui sort d'ici est toujours composé
 * de ce que la base porte à l'instant.
 *
 * Le passage par le PDF a un effet de bord utile. Une carte photographiée au téléphone
 * était écartée du dépôt au guichet unique, qui n'accepte que le PDF, et restait à
 * joindre à la main ; certifiée, elle en est un.
 */

/** Le dossier de dépôt, celui du serveur d'origine tant que les deux cohabitent. */
const DEPOT = path.join(process.cwd(), "..", "uploads");

/*
 * L'emprise du tampon, en points PDF - soixante-douze points par pouce.
 *
 * Le cadre fait un peu moins de six centimètres de large sur deux et demi de haut, posé
 * dans le coin supérieur droit. C'est assez pour que la mention et la signature se
 * lisent à l'impression, et assez peu pour ne mordre ni sur la photographie ni sur la
 * zone lisible par machine d'une carte cadrée au centre de la page.
 */
export const LARGEUR = 168;
export const HAUTEUR = 72;
export const MARGE = 24;

/** Le corps des deux lignes de texte, et ce qui les sépare. */
const CORPS = 7.5;
const INTERLIGNE = 9.5;

/** La place laissée au tracé, sous les mentions. */
const SIGNATURE_HAUTEUR = 34;

export const MENTION = "Certifié conforme à l'original";

/**
 * La pièce ne se laisse pas certifier : elle repart telle qu'elle a été déposée.
 *
 * Ce n'est pas une panne mais un état du fichier - illisible par pdf-lib, sans page,
 * dans un format que sharp ne décode pas. Elle porte un nom pour que les appelants
 * puissent retomber sur la pièce d'origine, chacun à leur manière : la remise sert le
 * fichier stocké, le dépôt au guichet reprend sa règle habituelle.
 */
export class PieceNonCertifiable extends Error {
  constructor() {
    super("Cette pièce ne peut pas porter la mention de conformité");
    this.name = "PieceNonCertifiable";
  }
}

/** Les octets d'une image encodée en base64 dans une adresse `data:`. */
function octetsDuTrace(donnees: string | null): Uint8Array | null {
  if (!donnees?.startsWith(PREFIXE_PNG)) return null;
  try {
    return new Uint8Array(Buffer.from(donnees.slice(PREFIXE_PNG.length), "base64"));
  } catch {
    return null;
  }
}

/** « 14 septembre 2026 ». */
function enClair(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

/**
 * La signature qui certifie cette pièce, et le jour où elle a été donnée.
 *
 * C'est celle du dirigeant. Le circuit recueille les signatures de tous les
 * signataires - associés compris - et une copie de la carte du dirigeant certifiée par
 * un associé ne certifierait rien : la mention engage celui dont c'est la pièce.
 *
 * Le rôle sert d'abord, parce qu'il est écrit à l'envoi du circuit ; à défaut - les
 * dossiers d'avant qu'il soit enregistré - c'est la première signature recueillie,
 * qui est celle du premier signataire, et le premier signataire d'une création est son
 * dirigeant. La solution n'est pas parfaite ; elle est nommée, et elle vaut mieux que
 * de renoncer à certifier.
 */
async function signatureQuiCertifie(dossierId: number) {
  const recueillies = await prisma.signature_requests.findMany({
    where: { formalite_id: dossierId, signed_at: { not: null } },
    orderBy: [{ associe_index: "asc" }, { signed_at: "asc" }],
    select: { associe_name: true, role: true, signature_data: true, signed_at: true },
  });
  if (recueillies.length === 0) return null;

  const dirigeante = recueillies.find((s) => s.role && !/associ/i.test(s.role));
  return dirigeante ?? recueillies[0];
}

/**
 * Le PDF de départ : celui qui a été déposé, ou une page qui porte l'image.
 *
 * Une photographie est posée sur une page au format de son propre cadrage plutôt que sur
 * une A4 : une carte d'identité au milieu d'une page blanche se voit rétrécie à
 * l'impression, et la mention posée dans le coin de la feuille se retrouve à des
 * centimètres du document qu'elle certifie. La page épouse l'image, la mention reste
 * contre elle.
 *
 * La page ne descend jamais sous l'emprise du tampon : une image plus étroite que le
 * cadre ferait déborder la mention hors de la feuille.
 */
export async function enPageDePdf(contenu: Buffer, extension: string): Promise<PDFDocument> {
  if (extension === ".pdf") {
    const depose = await PDFDocument.load(new Uint8Array(contenu));

    /*
     * Le chargement ne suffit pas à dire qu'un PDF a des pages.
     *
     * pdf-lib accepte un fichier dont le catalogue ne mène nulle part - un PDF tronqué,
     * un « %PDF- » suivi de rien - et c'est l'énumération des pages qui rompt, plus
     * loin, sur « Cannot read properties of undefined ». Le cas s'est présenté sur le
     * dépôt local. On l'éprouve donc ici, où l'on sait encore de quoi il retourne, et
     * l'appelant retombe sur la pièce d'origine au lieu d'emporter un dépôt entier.
     */
    try {
      if (depose.getPageCount() === 0) throw new PieceNonCertifiable();
    } catch (e) {
      throw e instanceof PieceNonCertifiable ? e : new PieceNonCertifiable();
    }

    return depose;
  }

  /*
   * Tout passe par un JPEG, quel que soit le format d'origine.
   *
   * pdf-lib n'embarque que du JPEG et du PNG ; un HEIC d'iPhone, un TIFF ou un WebP n'y
   * entrent pas, et le HEIC est précisément le format le plus courant des pièces
   * déposées. La conversion rend aussi l'image droite : une photographie couchée que
   * son étiquette d'orientation redressait se serait retrouvée de travers, l'étiquette
   * ne survivant pas au passage en PDF.
   */
  const jpeg = await enJpegPourDocument(contenu);
  const document = await PDFDocument.create();
  const image = await document.embedJpg(new Uint8Array(jpeg));

  const largeur = Math.max(image.width, LARGEUR + 2 * MARGE);
  const hauteur = Math.max(image.height, HAUTEUR + 2 * MARGE);
  const page = document.addPage([largeur, hauteur]);
  page.drawImage(image, {
    x: (largeur - image.width) / 2,
    y: (hauteur - image.height) / 2,
    width: image.width,
    height: image.height,
  });

  return document;
}

/**
 * Appose la mention, la date et la signature en haut à droite de chaque page.
 *
 * Sur chaque page, et non sur la première seulement : un recto et un verso déposés
 * ensemble sont deux pages du même fichier, et une copie dont seule la première face
 * porte la mention n'est certifiée qu'à moitié - c'est justement le verso qui porte
 * l'adresse et la zone lisible par machine.
 *
 * Le cadre est posé sur un fond blanc opaque. Sans lui, la mention s'écrirait par-dessus
 * la carte quand la photographie occupe toute la page, et ni le texte ni le document ne
 * se liraient.
 */
export async function certifier(
  document: PDFDocument,
  signature: { trace: string | null; le: Date }
): Promise<Buffer> {
  const police = await document.embedFont(StandardFonts.Helvetica);
  const trace = octetsDuTrace(signature.trace);
  const image = trace ? await document.embedPng(trace).catch(() => null) : null;

  for (const page of document.getPages()) {
    const { width, height } = page.getSize();
    const x = Math.max(MARGE, width - MARGE - LARGEUR);
    const hautDuCadre = height - MARGE;
    const basDuCadre = hautDuCadre - HAUTEUR;

    page.drawRectangle({
      x,
      y: basDuCadre,
      width: LARGEUR,
      height: HAUTEUR,
      color: rgb(1, 1, 1),
      opacity: 0.92,
      borderColor: rgb(0.55, 0.55, 0.55),
      borderWidth: 0.5,
    });

    const marge = 7;
    page.drawText(MENTION, {
      x: x + marge,
      y: hautDuCadre - marge - CORPS,
      size: CORPS,
      font: police,
      color: rgb(0.07, 0.07, 0.07),
    });
    page.drawText("le " + enClair(signature.le), {
      x: x + marge,
      y: hautDuCadre - marge - CORPS - INTERLIGNE,
      size: CORPS,
      font: police,
      color: rgb(0.35, 0.35, 0.35),
    });

    if (image) {
      /*
       * Le tracé garde ses proportions, et ne remplit jamais le cadre.
       *
       * Une signature étirée à la largeur disponible ne ressemble plus à celle qui a été
       * tracée - et c'est ce qui est censé engager quelqu'un.
       */
      const disponible = { largeur: LARGEUR - 2 * marge, hauteur: SIGNATURE_HAUTEUR };
      const echelle = Math.min(
        disponible.largeur / image.width,
        disponible.hauteur / image.height
      );

      page.drawImage(image, {
        x: x + marge,
        y: basDuCadre + marge / 2,
        width: image.width * echelle,
        height: image.height * echelle,
      });
    }
  }

  return Buffer.from(await document.save());
}

/**
 * La pièce d'identité de ce dossier, certifiée conforme, ou null.
 *
 * Rend null tant qu'il n'y a rien à apposer : pas de pièce, ou pas encore de signature.
 * La certification date de la signature, et une mention « certifié conforme » posée
 * avant que quiconque ait signé serait une affirmation sans auteur.
 */
export async function pieceIdentiteCertifiee(
  dossierId: number,
  type = "identite"
): Promise<Buffer | null> {
  const document = await prisma.documents.findFirst({
    where: { formalite_id: dossierId, type, rejection_reason: null },
    orderBy: { created_at: "desc" },
    select: { file_path: true },
  });
  if (!document?.file_path) return null;

  const signature = await signatureQuiCertifie(dossierId);
  if (!signature?.signed_at) return null;

  const contenu = await readFile(path.join(DEPOT, path.basename(document.file_path)));
  const pdf = await enPageDePdf(contenu, path.extname(document.file_path).toLowerCase());

  return certifier(pdf, { trace: signature.signature_data, le: signature.signed_at });
}

/**
 * La pièce à servir sous ce nom de fichier, certifiée si elle doit l'être.
 *
 * C'est le point de passage unique des écrans qui remettent un fichier, le pendant de
 * `acteSigneAServir` pour ce que le client dépose. Rend null dans tous les cas où il n'y
 * a rien à composer - ce n'est pas une pièce d'identité, personne n'a signé - et le
 * fichier stocké repart alors tel quel.
 *
 * Un échec de composition ne fait pas échouer la remise : un PDF illisible par pdf-lib,
 * une image dans un format que sharp ne décode pas, et la pièce d'origine part quand
 * même. Mieux vaut une copie non certifiée qu'un document introuvable, et la trace dit
 * lequel est parti sans sa mention.
 */
export async function pieceCertifieeAServir(nomFichier: string): Promise<Buffer | null> {
  const piece = await pieceDeposee(nomFichier);
  if (!piece?.type || !estUnePieceDIdentite(piece.type)) return null;
  if (!(await certifiableSurCeDossier(piece.dossierId, piece.type))) return null;

  try {
    return await pieceIdentiteCertifiee(piece.dossierId, piece.type);
  } catch (e) {
    journal.warn({ err: e, fichier: nomFichier }, "Pièce remise sans sa mention de conformité");
    return null;
  }
}

/**
 * Cette pièce peut-elle être certifiée par une signature de ce dossier ?
 *
 * Seule la création, et seulement sa pièce « identite ». La règle paraît étroite pour
 * un mécanisme qui fonctionnerait partout, et c'est précisément pour cela qu'elle est
 * écrite : la certification n'a de sens que si celui qui signe est le titulaire de la
 * pièce, et la création est le seul parcours où cela est vrai par construction - le
 * dirigeant y signe les statuts, et la pièce déposée est la sienne.
 *
 * Sur une modification, les signataires sont les associés qui votent la décision ; le
 * nouveau dirigeant dont on dépose la carte peut n'être aucun d'eux. Y apposer la même
 * mention ferait certifier une pièce d'identité par quelqu'un d'autre que son titulaire
 * - ce qui n'est pas une commodité en moins, mais une fausse attestation.
 *
 * L'auto-entreprise, elle, n'a pas de circuit de signature du tout : rien n'y serait
 * apposé de toute façon.
 */
async function certifiableSurCeDossier(dossierId: number, type: string): Promise<boolean> {
  if (type !== "identite") return false;

  const dossier = await prisma.formalites.findUnique({
    where: { id: dossierId },
    select: { type: true },
  });

  /*
   * Le type d'un dossier ne s'est pas toujours écrit « creation ».
   *
   * Les plus anciens portent le libellé qui s'affichait à l'écran - « Création SASU »,
   * « Création SARL » - et certains n'ont pas de type du tout. Une comparaison stricte
   * les excluait tous, c'est-à-dire précisément les dossiers déjà signés sur lesquels
   * la mention a le plus de sens.
   */
  return !dossier?.type || /^cr[ée]ation/i.test(dossier.type.trim());
}
