/**
 * L'attente de la lecture des statuts, dite en français.
 *
 * Des statuts numérisés n'ont pas de couche texte : les lire, c'est en reconnaître les
 * caractères page par page. Sur la machine de développement, dix-sept pages prennent
 * douze secondes ; sur un conteneur à un demi-cœur, plusieurs minutes. L'écran
 * affichait « Lecture des statuts en cours » sans rien d'autre - on ne savait ni où en
 * était le travail, ni s'il fallait attendre dix secondes ou trois minutes.
 *
 * Ce module ne lit rien : il traduit un avancement en phrase. C'est ce qui permet de
 * l'éprouver sans PDF, et de changer les mots sans toucher à la lecture.
 */

/** Rastériser les pages, puis les reconnaître. La première phase ne se compte pas. */
export type PhaseDeLecture = "preparation" | "reconnaissance";

export interface Progression {
  phase: PhaseDeLecture;
  /** Le nombre de pages, connu dès que la couche texte a été sondée. */
  pages: number | null;
  faites: number;
  ecouleMs: number;
}

/**
 * Ce qu'il reste, d'après ce qui a déjà été fait.
 *
 * Le rythme se mesure sur les pages achevées, temps de préparation compris : l'estimation
 * est donc un peu haute au début et se resserre en avançant. C'est le bon sens de
 * l'erreur - une attente qui finit plus tôt que dit ne déçoit personne.
 */
export function resteEstimeMs(p: Progression): number | null {
  if (p.pages === null || p.faites < 1) return null;
  const restantes = p.pages - p.faites;
  if (restantes <= 0) return 0;
  return Math.round((p.ecouleMs / p.faites) * restantes);
}

/**
 * Une durée approchée, jamais à la seconde près.
 *
 * « encore 37 secondes » se donne un air de précision que rien ne soutient : le rythme
 * varie d'une page à l'autre. On arrondit donc franchement, et l'on nomme les ordres de
 * grandeur plutôt que les nombres.
 */
export function dureeApprochee(ms: number): string {
  if (ms < 10_000) return "quelques secondes";
  if (ms < 60_000) return "environ " + Math.round(ms / 10_000) * 10 + " secondes";
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return "environ " + minutes + (minutes === 1 ? " minute" : " minutes");
}

/**
 * Où en est la lecture, en une ligne.
 *
 * La phrase dit toujours ce qui se passe ; elle n'ajoute l'estimation que lorsqu'une
 * page au moins a été lue, faute de quoi elle serait inventée.
 */
export function phraseDAttente(p: Progression): string {
  if (p.phase === "preparation" || p.pages === null) {
    return "Préparation des pages…";
  }

  const reste = resteEstimeMs(p);
  const avancement = "Page " + Math.min(p.faites + 1, p.pages) + " sur " + p.pages;

  if (reste === null) return avancement;
  if (reste === 0) return "Dernière page…";
  return avancement + " - encore " + dureeApprochee(reste);
}
