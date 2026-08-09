/**
 * Règles de session, indépendantes de tout stockage.
 *
 * Une session expire deux fois : au bout d'une durée absolue, qu'aucune activité
 * ne prolonge, et au bout d'une période d'inactivité. La première borne le vol de
 * jeton dans le temps ; la seconde ferme les sessions oubliées sur un poste partagé.
 */

export const DUREE_ABSOLUE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
export const DUREE_INACTIVITE_MS = 24 * 60 * 60 * 1000; // 24 heures

export interface Session {
  jeton: string;
  utilisateurId: number;
  creeeLe: Date;
  vueLe: Date;
  revoqueeLe: Date | null;
}

export type EtatSession = "valide" | "revoquee" | "expiree" | "inactive";

export function etatDeLaSession(session: Session, maintenant: Date = new Date()): EtatSession {
  if (session.revoqueeLe) return "revoquee";
  if (maintenant.getTime() - session.creeeLe.getTime() >= DUREE_ABSOLUE_MS) return "expiree";
  if (maintenant.getTime() - session.vueLe.getTime() >= DUREE_INACTIVITE_MS) return "inactive";
  return "valide";
}

export function sessionValide(session: Session, maintenant: Date = new Date()): boolean {
  return etatDeLaSession(session, maintenant) === "valide";
}

/**
 * Faut-il réécrire la date de dernière activité ?
 *
 * Chaque requête authentifiée pourrait le faire, mais ce serait une écriture par
 * requête pour une précision dont personne n'a besoin. Une fois par minute suffit.
 */
export const PERIODE_RAFRAICHISSEMENT_MS = 60 * 1000;

export function doitRafraichir(session: Session, maintenant: Date = new Date()): boolean {
  return maintenant.getTime() - session.vueLe.getTime() >= PERIODE_RAFRAICHISSEMENT_MS;
}
