import crypto from "node:crypto";

/**
 * Contrôle des fichiers déposés.
 *
 * L'extension est déclarée par le navigateur : elle se renomme, pas le contenu.
 * Sans ce contrôle, un .html renommé en .pdf est stocké puis servi dans le
 * domaine. Repris de middleware/upload.js, écrit à l'étape de mise en sécurité.
 */

export const TAILLE_MAXIMALE = 10 * 1024 * 1024;

const SIGNATURES: Record<string, number[][]> = {
  ".pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
  ".jpg": [[0xff, 0xd8, 0xff]],
  ".jpeg": [[0xff, 0xd8, 0xff]],
  ".png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ".docx": [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
  ], // conteneur ZIP
};

export const EXTENSIONS_ACCEPTEES = Object.keys(SIGNATURES);

export function extensionDe(nom: string): string {
  const point = nom.lastIndexOf(".");
  return point < 0 ? "" : nom.slice(point).toLowerCase();
}

/** Le contenu correspond-il vraiment à l'extension annoncée ? */
export function signatureValide(contenu: Uint8Array, extension: string): boolean {
  const attendues = SIGNATURES[extension];
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

export function verifierDepot(
  nom: string,
  contenu: Uint8Array,
  extensionsAutorisees: string[] = EXTENSIONS_ACCEPTEES
): string {
  const extension = extensionDe(nom);

  if (!extensionsAutorisees.includes(extension)) {
    throw new DepotRefuse(
      "Format non accepté. Formats attendus : " + extensionsAutorisees.join(", ")
    );
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
