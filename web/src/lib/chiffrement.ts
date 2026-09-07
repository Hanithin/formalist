import crypto from "node:crypto";

/**
 * Chiffrer ce qu'il faudra relire, par opposition à hacher ce qu'on ne relit jamais.
 *
 * `mots-de-passe.ts` hache : il vérifie qu'un mot de passe est le bon sans jamais
 * pouvoir le redire. C'est ce qu'il faut pour nos propres comptes, et c'est inutilisable
 * ici - le mot de passe e-procedures de l'avocat doit être rejoué auprès de l'INPI à
 * chaque session. Il faut donc un chiffrement réversible, et les deux ne se confondent
 * pas : hacher ce qu'on doit relire rend le service impossible, chiffrer ce qu'on
 * vérifie affaiblit le stockage.
 *
 * AES-256-GCM plutôt qu'un mode sans authentification : le sceau vérifie que le message
 * n'a pas été modifié. Sans lui, un octet retourné dans la base donnerait un mot de
 * passe différent, envoyé tel quel à l'INPI, et l'erreur ressemblerait à une faute de
 * frappe de l'avocat.
 *
 * La clé vit dans l'environnement, jamais dans la base. Les deux séparément ne valent
 * rien : une copie de sauvegarde égarée ne livre aucun secret.
 */

const ALGORITHME = "aes-256-gcm";
/* Douze octets : la taille recommandée pour GCM, et celle que Node optimise. */
const TAILLE_VECTEUR = 12;

export class ChiffrementNonConfigure extends Error {
  readonly statut = 503;
  constructor() {
    super("Le chiffrement des identifiants n'est pas configuré");
    this.name = "ChiffrementNonConfigure";
  }
}

/**
 * La clé, lue une fois par appel plutôt que gardée.
 *
 * Elle se déclare en trente-deux octets, écrits en hexadécimal ou en base64 - c'est ce
 * qu'un générateur rend. Une clé plus courte n'est pas allongée en silence : ce serait
 * chiffrer moins bien qu'annoncé sans que personne le sache.
 */
function cle(): Buffer {
  const brut = (process.env.GUICHET_CLE ?? "").trim();
  if (!brut) throw new ChiffrementNonConfigure();

  const octets = /^[0-9a-fA-F]{64}$/.test(brut)
    ? Buffer.from(brut, "hex")
    : Buffer.from(brut, "base64");

  if (octets.length !== 32) throw new ChiffrementNonConfigure();
  return octets;
}

/** Le chiffrement est-il utilisable ? Sert à ne pas proposer une connexion impossible. */
export function chiffrementDisponible(): boolean {
  try {
    cle();
    return true;
  } catch {
    return false;
  }
}

/**
 * Chiffre un secret, vecteur et sceau compris.
 *
 * Le tout tient en une chaîne : le vecteur d'initialisation, le sceau, puis le message,
 * séparés par des points comme un jeton. Trois colonnes pour un secret se désynchronisent
 * le jour où l'une d'elles est oubliée dans une copie.
 */
export function chiffrer(clair: string): string {
  const vecteur = crypto.randomBytes(TAILLE_VECTEUR);
  const chiffreur = crypto.createCipheriv(ALGORITHME, cle(), vecteur);
  const message = Buffer.concat([chiffreur.update(clair, "utf8"), chiffreur.final()]);

  return [
    vecteur.toString("base64url"),
    chiffreur.getAuthTag().toString("base64url"),
    message.toString("base64url"),
  ].join(".");
}

/**
 * Déchiffre, ou lève.
 *
 * Un sceau qui ne correspond pas fait échouer `final()` : c'est voulu. Rendre une
 * chaîne approximative enverrait un mot de passe faux à l'INPI, et l'avocat chercherait
 * l'erreur du côté de son compte.
 */
export function dechiffrer(chiffre: string): string {
  const [vecteur, sceau, message] = chiffre.split(".");
  if (!vecteur || !sceau || !message) throw new Error("Secret illisible");

  const dechiffreur = crypto.createDecipheriv(
    ALGORITHME,
    cle(),
    Buffer.from(vecteur, "base64url")
  );
  dechiffreur.setAuthTag(Buffer.from(sceau, "base64url"));

  return Buffer.concat([
    dechiffreur.update(Buffer.from(message, "base64url")),
    dechiffreur.final(),
  ]).toString("utf8");
}
