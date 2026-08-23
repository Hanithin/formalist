/**
 * Limitation de débit.
 *
 * Le compteur du serveur d'origine vit en mémoire : il repart à zéro à chaque
 * redémarrage, et deux instances comptent chacune de leur côté. La décision est
 * isolée ici pour être testable, le comptage revient à l'infrastructure.
 */

export interface Quota {
  /** Nombre de tentatives autorisées sur la fenêtre. */
  maximum: number;
  /** Durée de la fenêtre, en millisecondes. */
  fenetreMs: number;
}

export const QUOTA_CONNEXION: Quota = { maximum: 10, fenetreMs: 15 * 60 * 1000 };
export const QUOTA_INSCRIPTION: Quota = { maximum: 5, fenetreMs: 60 * 60 * 1000 };

export interface Verdict {
  autorise: boolean;
  restant: number;
  /** Date à laquelle une nouvelle tentative sera possible, si le quota est atteint. */
  reessayerLe: Date | null;
}

/**
 * @param tentatives dates des tentatives déjà enregistrées, quelconque ordre
 */
export function evaluer(quota: Quota, tentatives: Date[], maintenant: Date = new Date()): Verdict {
  const debut = maintenant.getTime() - quota.fenetreMs;
  const dansLaFenetre = tentatives.filter((t) => t.getTime() > debut);

  if (dansLaFenetre.length < quota.maximum) {
    return { autorise: true, restant: quota.maximum - dansLaFenetre.length - 1, reessayerLe: null };
  }

  // La plus ancienne tentative de la fenêtre libère une place en sortant
  const plusAncienne = Math.min(...dansLaFenetre.map((t) => t.getTime()));
  return {
    autorise: false,
    restant: 0,
    reessayerLe: new Date(plusAncienne + quota.fenetreMs),
  };
}

export class TropDeTentatives extends Error {
  readonly statut = 429;
  readonly reessayerLe: Date | null;

  constructor(reessayerLe: Date | null) {
    super("Trop de tentatives. Réessayez plus tard.");
    this.name = "TropDeTentatives";
    this.reessayerLe = reessayerLe;
  }
}
