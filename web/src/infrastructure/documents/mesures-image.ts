import sharp from "sharp";
import { journal } from "@/lib/journal";
import type { MesuresDeLaPiece } from "@/domain/formalite/controle-identite";

/**
 * Ce qu'une image vaut, mesuré sans rien comprendre à ce qu'elle montre.
 *
 * C'est la première des deux couches du contrôle des pièces, et la seule qui soit
 * gratuite, instantanée et reproductible : elle ne sort pas de la machine, elle ne
 * dépend d'aucun service, et elle rend deux fois le même nombre sur le même fichier.
 * Le modèle, ensuite, dit ce que le document est ; ici on dit seulement s'il est
 * photographiable.
 *
 * La distinction compte parce que les deux se cassent séparément. Une carte parfaitement
 * valable peut être illisible, une carte nette peut être périmée - et surtout, quand le
 * modèle ne répond pas, ces mesures-là répondent encore.
 */

/**
 * L'image est ramenée à cette largeur avant d'être mesurée.
 *
 * Sans cela, le seuil de netteté dépendrait de l'appareil : une même carte
 * photographiée à douze mégapixels et à deux rend des laplaciens sans commune mesure,
 * et un seuil calé sur l'un refuse tout de l'autre. La définition est jugée à part, sur
 * l'image d'origine - c'est une autre question.
 */
const LARGEUR_DE_MESURE = 1000;

/**
 * Le noyau laplacien, celui de la netteté.
 *
 * Il répond aux transitions brusques : un texte imprimé net en produit beaucoup, une
 * photographie bougée presque aucune. L'écart-type du résultat est donc une mesure de
 * flou, et c'est la méthode habituelle.
 *
 * Le décalage de cent vingt-huit est indispensable : le résultat d'un laplacien est
 * signé, et sans lui la moitié négative serait écrêtée à zéro - la moitié de
 * l'information sur laquelle on juge.
 */
const LAPLACIEN = {
  width: 3,
  height: 3,
  kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
  scale: 1,
  offset: 128,
};

/**
 * Moyenne et écart-type d'un plan de gris, calculés sur les octets.
 *
 * `stats()` de sharp ne servirait pas ici : il rend les statistiques de l'image
 * **d'entrée**, sans appliquer les opérations du pipeline. Enchaîner `convolve().stats()`
 * rendait donc l'écart-type de l'image d'origine, à la décimale près - la mesure de
 * netteté était en réalité une seconde mesure de contraste, et elle ne distinguait pas
 * une image nette d'une image floue. On lit donc les octets du résultat.
 */
function moments(octets: Buffer | Uint8Array): { moyenne: number; ecart: number } {
  let somme = 0;
  let sommeDesCarres = 0;
  for (const valeur of octets) {
    somme += valeur;
    sommeDesCarres += valeur * valeur;
  }
  const nombre = octets.length || 1;
  const moyenne = somme / nombre;
  return { moyenne, ecart: Math.sqrt(Math.max(0, sommeDesCarres / nombre - moyenne * moyenne)) };
}

/**
 * Mesure une image déposée, ou rend ce qu'on peut d'un PDF.
 *
 * Un PDF n'est pas décodé : notre pile ne sait pas le rasteriser, et installer un
 * moteur de rendu pour trois nombres serait payer cher une information que le modèle
 * donne déjà - il lit le PDF nativement et dit si les mentions ressortent. Le poids du
 * fichier est alors la seule mesure, et les seuils qui portent sur l'image sont
 * neutralisés par un `null` plutôt que devinés.
 *
 * Une image qu'on n'arrive pas à ouvrir n'arrête rien : elle a déjà passé le contrôle
 * de signature binaire du dépôt, et l'échec est plus probablement un format exotique
 * qu'un fichier hostile. Le modèle la regardera.
 */
export async function mesurerLaPiece(
  contenu: Buffer,
  extension: string
): Promise<MesuresDeLaPiece> {
  const vide: MesuresDeLaPiece = {
    cote: null,
    nettete: null,
    luminance: null,
    contraste: null,
    octets: contenu.length,
  };

  if (extension === ".pdf") return vide;

  try {
    /*
     * L'orientation EXIF est appliquée avant toute mesure.
     *
     * Une photographie de téléphone est presque toujours enregistrée dans le sens du
     * capteur, redressée par une étiquette. Sans `rotate()`, le plus grand côté serait
     * celui de l'image couchée - ce qui ne change rien ici - mais la suite du traitement
     * la publierait de travers dans le PDF certifié.
     */
    const image = sharp(contenu, { failOn: "none" }).rotate();
    const metadonnees = await image.metadata();

    const largeur = metadonnees.width ?? 0;
    const hauteur = metadonnees.height ?? 0;
    const cote = largeur && hauteur ? Math.max(largeur, hauteur) : null;

    const gris = await sharp(contenu, { failOn: "none" })
      .rotate()
      .greyscale()
      .resize({ width: LARGEUR_DE_MESURE, fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const exposition = moments(gris.data);

    const contours = await sharp(gris.data, {
      raw: { width: gris.info.width, height: gris.info.height, channels: 1 },
    })
      .convolve(LAPLACIEN)
      .raw()
      .toBuffer();

    return {
      cote,
      nettete: moments(contours).ecart,
      luminance: exposition.moyenne,
      contraste: exposition.ecart,
      octets: contenu.length,
    };
  } catch (e) {
    journal.warn({ err: e, extension }, "Pièce non mesurée");
    return vide;
  }
}

/**
 * L'image ramenée à un JPEG que le modèle puisse regarder.
 *
 * Deux raisons de ne pas envoyer le fichier tel quel. Le HEIC des iPhone - le format par
 * défaut de tout appareil récent, et donc le cas le plus fréquent - n'est pas accepté en
 * entrée ; et une photographie de douze mégapixels pèse plusieurs mégaoctets qu'il est
 * inutile de faire voyager, le texte d'une carte d'identité ressortant largement à deux
 * mille pixels.
 *
 * La réduction est bornée par `withoutEnlargement` : une image déjà petite n'est pas
 * agrandie, ce qui inventerait une netteté qu'elle n'a pas.
 */
export async function enJpegPourLecture(contenu: Buffer): Promise<Buffer> {
  return sharp(contenu, { failOn: "none" })
    .rotate()
    .resize({ width: 2000, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * L'image ramenée à un JPEG qu'on puisse poser dans un PDF.
 *
 * pdf-lib n'embarque que du JPEG et du PNG : un HEIC, un TIFF ou un WebP n'y entrent
 * pas. La qualité est plus haute qu'à la lecture - ce fichier-là part au greffe, et
 * c'est la copie qui fera foi.
 */
export async function enJpegPourDocument(contenu: Buffer): Promise<Buffer> {
  return sharp(contenu, { failOn: "none" })
    .rotate()
    .resize({ width: 2400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
}
