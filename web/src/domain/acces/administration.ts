import type { Role } from "./regles";

/**
 * Attribution des rôles de la plateforme.
 *
 * C'est le point le plus sensible de l'administration : accorder le rôle avocat
 * ouvre l'accès aux dossiers d'un cabinet, et le rôle administrateur ouvre tout.
 * Les règles sont donc isolées ici et couvertes une par une.
 */

export const ROLES_CONNUS: Role[] = ["user", "avocat", "admin"];

export interface Anomalie {
  champ: string;
  message: string;
}

export interface ChangementDeRoles {
  roles: Role[];
  /** Le rôle affiché partout ailleurs : le plus étendu de ceux accordés. */
  principal: Role;
}

/**
 * Normalise une demande de changement de rôles.
 *
 * Les valeurs inconnues sont écartées plutôt que refusées : une liste envoyée
 * par un écran plus récent ne doit pas bloquer, mais rien d'inconnu ne doit
 * passer non plus.
 */
export function normaliserRoles(demandes: unknown): Role[] {
  const liste = Array.isArray(demandes) ? demandes : [demandes];
  const retenus = liste.filter((r): r is Role => ROLES_CONNUS.includes(r as Role));
  return [...new Set(retenus)];
}

/** Le rôle principal est le plus étendu de ceux accordés. */
export function rolePrincipal(roles: Role[]): Role {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("avocat")) return "avocat";
  return roles[0] ?? "user";
}

/**
 * Vérifie un changement de rôles.
 *
 * @param cibleId compte dont on change les rôles
 * @param administrateurId compte qui fait le changement
 * @param nombreAdministrateurs administrateurs actuellement en place
 * @param cibleEstAdministrateur la cible est administrateur aujourd'hui
 */
export function verifierChangementDeRoles(
  demandes: unknown,
  cibleId: number,
  administrateurId: number,
  nombreAdministrateurs: number,
  cibleEstAdministrateur = false
): { ok: true; changement: ChangementDeRoles } | { ok: false; anomalie: Anomalie } {
  const roles = normaliserRoles(demandes);

  if (roles.length === 0) {
    return { ok: false, anomalie: { champ: "roles", message: "Au moins un rôle est requis" } };
  }

  // Se retirer ses propres droits, c'est perdre l'accès à cette page - et plus
  // personne ne peut les rendre.
  if (cibleId === administrateurId && !roles.includes("admin")) {
    return {
      ok: false,
      anomalie: {
        champ: "roles",
        message: "Vous ne pouvez pas retirer votre propre accès administrateur",
      },
    };
  }

  /*
   * Retirer le dernier administrateur laisserait la plateforme sans personne pour
   * accorder des rôles, y compris pour réparer l'erreur.
   *
   * La règle ne vaut que si la cible est elle-même administrateur. Sans cette
   * condition, elle se déclenchait sur n'importe quel compte dès qu'il n'y avait
   * qu'un administrateur - c'est-à-dire la situation ordinaire d'une plateforme
   * naissante : nommer un avocat était refusé au motif qu'on rétrogradait le dernier
   * administrateur, alors qu'on ne touchait pas à lui.
   */
  if (cibleEstAdministrateur && !roles.includes("admin") && nombreAdministrateurs <= 1) {
    return {
      ok: false,
      anomalie: {
        champ: "roles",
        message: "La plateforme doit garder au moins un administrateur",
      },
    };
  }

  return { ok: true, changement: { roles, principal: rolePrincipal(roles) } };
}

/**
 * Vérifie une suspension de compte.
 *
 * Suspendre coupe l'accès immédiatement : ses sessions cessent d'être valides.
 */
export function verifierSuspension(
  cibleId: number,
  administrateurId: number,
  suspendre: boolean
): { ok: true } | { ok: false; anomalie: Anomalie } {
  if (suspendre && cibleId === administrateurId) {
    return {
      ok: false,
      anomalie: { champ: "suspendu", message: "Vous ne pouvez pas suspendre votre propre compte" },
    };
  }
  return { ok: true };
}

export function libelleRole(role: Role): string {
  if (role === "admin") return "Administrateur";
  if (role === "avocat") return "Avocat";
  return "Client";
}
