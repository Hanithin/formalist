import crypto from "node:crypto";

/**
 * Hachage des mots de passe.
 *
 * Les paramètres reprennent exactement ceux du serveur d'origine - PBKDF2-SHA512,
 * 100 000 itérations, clé de 64 octets, sel par compte. Ils ne peuvent pas changer
 * ici : les empreintes déjà en base ont été calculées ainsi, et les clients doivent
 * pouvoir se connecter après la bascule.
 *
 * Un changement d'algorithme se fera plus tard, au fil des connexions : on recalcule
 * l'empreinte au moment où le mot de passe est saisi et vérifié.
 */
const ITERATIONS = 100_000;
const LONGUEUR_CLE = 64;
const ALGORITHME = "sha512";

export const LONGUEUR_MINIMALE = 8;

export interface Empreinte {
  hash: string;
  salt: string;
}

function deriver(motDePasse: string, sel: string): Buffer {
  return crypto.pbkdf2Sync(motDePasse, sel, ITERATIONS, LONGUEUR_CLE, ALGORITHME);
}

export function hacher(motDePasse: string): Empreinte {
  const salt = crypto.randomBytes(16).toString("hex");
  return { hash: deriver(motDePasse, salt).toString("hex"), salt };
}

/**
 * Comparaison à temps constant : une comparaison de chaînes s'arrête au premier
 * caractère différent, et le temps de réponse renseigne alors sur l'empreinte.
 */
export function verifier(motDePasse: string, empreinte: Empreinte): boolean {
  const attendu = Buffer.from(empreinte.hash, "hex");
  const obtenu = deriver(motDePasse, empreinte.salt);
  if (attendu.length !== obtenu.length) return false;
  return crypto.timingSafeEqual(attendu, obtenu);
}

/** Jeton opaque à usage de session ou de lien à usage unique. */
export function jeton(octets = 32): string {
  return crypto.randomBytes(octets).toString("hex");
}
