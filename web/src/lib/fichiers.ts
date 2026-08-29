import crypto from "node:crypto";

/**
 * Contrôle des fichiers déposés.
 *
 * L'extension est déclarée par le navigateur : elle se renomme, pas le contenu.
 * Sans ce contrôle, un .html renommé en .pdf est stocké puis servi dans le
 * domaine. Repris de middleware/upload.js, écrit à l'étape de mise en sécurité.
 */

export const TAILLE_MAXIMALE = 10 * 1024 * 1024;

const ZIP: number[][] = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
];

/** Les vieux formats de bureautique : un conteneur OLE2. */
const OLE2: number[][] = [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]];

const SIGNATURES: Record<string, number[][]> = {
  ".pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
  ".jpg": [[0xff, 0xd8, 0xff]],
  ".jpeg": [[0xff, 0xd8, 0xff]],
  ".png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ".docx": ZIP,
};

/**
 * Ce qu'on accepte en pièce jointe d'une conversation.
 *
 * Les pièces d'un dossier sont bornées à quatre formats : elles partent au greffe, et
 * une photo prise au téléphone n'est pas un justificatif. Une conversation, elle, ne va
 * nulle part - un client envoie ce qu'il a sous la main, et son iPhone produit du HEIC.
 *
 * On élargit donc largement, sans lâcher le contrôle : chaque format garde sa signature
 * quand il en a une, et les formats de texte, qui n'en ont pas, sont nommés à part. Ce
 * qui reste dehors est ce qui s'exécute.
 */
const SIGNATURES_JOINTES: Record<string, number[][]> = {
  ...SIGNATURES,
  ".gif": [[0x47, 0x49, 0x46, 0x38]],
  ".webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF, « WEBP » à l'octet 8
  ".tif": [
    [0x49, 0x49, 0x2a, 0x00],
    [0x4d, 0x4d, 0x00, 0x2a],
  ],
  ".tiff": [
    [0x49, 0x49, 0x2a, 0x00],
    [0x4d, 0x4d, 0x00, 0x2a],
  ],
  ".bmp": [[0x42, 0x4d]],
  ".zip": ZIP,
  ".xlsx": ZIP,
  ".pptx": ZIP,
  ".odt": ZIP,
  ".ods": ZIP,
  ".odp": ZIP,
  ".doc": OLE2,
  ".xls": OLE2,
  ".ppt": OLE2,
  ".rtf": [[0x7b, 0x5c, 0x72, 0x74, 0x66]], // {\rtf
};

/**
 * Les formats sans en-tête : un fichier de texte commence par son texte.
 *
 * Le HEIC des iPhone en fait partie de notre point de vue : sa signature ne tient pas
 * aux premiers octets mais à la marque « ftyp » du quatrième au huitième, et un
 * conteneur ISO-BMFF porte des marques trop variées pour être énumérées ici.
 */
const SANS_SIGNATURE = [".txt", ".csv", ".md", ".heic", ".heif", ".json", ".xml"];

/**
 * Ce qu'un dossier accepte en pièce.
 *
 * Le HEIC en fait partie. Il en était écarté - « une photo prise au téléphone n'est pas
 * un justificatif » - mais c'est le format par défaut de tout iPhone : le client
 * photographiait sa carte d'identité et se voyait refuser son propre appareil, sans
 * savoir comment le convertir. Mieux vaut recevoir la pièce et la convertir au besoin
 * que de laisser le dossier en plan.
 */
export const EXTENSIONS_ACCEPTEES = [...Object.keys(SIGNATURES), ".heic", ".heif"];

/** Ce qu'une conversation accepte : tout ce qui ne s'exécute pas. */
export const EXTENSIONS_JOINTES = [
  ...Object.keys(SIGNATURES_JOINTES),
  ...SANS_SIGNATURE,
];

export function extensionDe(nom: string): string {
  const point = nom.lastIndexOf(".");
  return point < 0 ? "" : nom.slice(point).toLowerCase();
}

/** Le contenu correspond-il vraiment à l'extension annoncée ? */
export function signatureValide(contenu: Uint8Array, extension: string): boolean {
  /* Un format de texte n'a pas d'en-tête : il n'y a rien à comparer. */
  if (SANS_SIGNATURE.includes(extension)) return true;

  const attendues = SIGNATURES_JOINTES[extension];
  // Format non listé : on refuse plutôt que de supposer.
  if (!attendues) return false;
  return attendues.some((sig) => sig.every((octet, i) => contenu[i] === octet));
}

/** Nom de stockage : aléatoire, sans rien du nom d'origine. */
export function nomDeStockage(extension: string): string {
  return crypto.randomBytes(16).toString("hex") + extension;
}

export class DepotRefuse extends Error {
  readonly statut = 400;
  constructor(message: string) {
    super(message);
    this.name = "DepotRefuse";
  }
}

/**
 * Les extensions attendues, ramenées à la forme pointée.
 *
 * La convention est « .pdf » ; écrire « pdf » refusait tous les dépôts, avec un
 * message qui listait pourtant « pdf ». C'est arrivé sur le dépôt des statuts, et
 * rien ne le signalait avant l'essai : la liste étant une simple suite de chaînes,
 * les deux formes se lisent pareil. On accepte donc les deux.
 */
function pointees(extensions: string[]): string[] {
  return extensions.map((e) => (e.startsWith(".") ? e.toLowerCase() : "." + e.toLowerCase()));
}

export function verifierDepot(
  nom: string,
  contenu: Uint8Array,
  extensionsAutorisees: string[] = EXTENSIONS_ACCEPTEES
): string {
  const extension = extensionDe(nom);
  const attendues = pointees(extensionsAutorisees);

  if (!attendues.includes(extension)) {
    throw new DepotRefuse("Format non accepté. Formats attendus : " + attendues.join(", "));
  }
  if (contenu.length === 0) {
    throw new DepotRefuse("Le fichier est vide");
  }
  if (contenu.length > TAILLE_MAXIMALE) {
    throw new DepotRefuse("Le fichier dépasse " + TAILLE_MAXIMALE / 1024 / 1024 + " Mo");
  }
  if (!signatureValide(contenu, extension)) {
    throw new DepotRefuse("Le contenu du fichier ne correspond pas à son format");
  }

  return extension;
}
